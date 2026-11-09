"""Run two native FSDP FULL_SHARD updates and compare a dense CPU reference."""

from datetime import timedelta
import hashlib
import json
from pathlib import Path
import sys

import torch
import torch.distributed as dist
from torch.distributed.checkpoint.state_dict import StateDictOptions, get_state_dict
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP, ShardingStrategy
from torch.profiler import ProfilerActivity, profile


DTYPE = torch.float64
LR = 0.02
TOLERANCE = {"atol": 1e-12, "rtol": 0.0}
MOMENTS = ("exp_avg", "exp_avg_sq")
NAMES = ("weight", "bias")
ROWS = (slice(0, 1), slice(1, 3))
X = torch.tensor([[1, 2], [0, -1], [2, 1]], dtype=DTYPE)
Y = torch.tensor([[0, 1], [1, 0], [-0.75, 1]], dtype=DTYPE)
HAND_GRAD = torch.tensor([1/8, -1/24, 5/24, 1/8, -1/12, 1/12], dtype=DTYPE)
HAND_WRONG = torch.tensor([0, -7/32, 5/32, 3/32, -5/32, 1/16], dtype=DTYPE)


def linear():
    layer = torch.nn.Linear(2, 2, dtype=DTYPE)
    with torch.no_grad():
        layer.weight.copy_(torch.tensor([[0.25, -0.5], [0.75, 0.125]], dtype=DTYPE))
        layer.bias.zero_()
    return layer


def half_squared_error(prediction, target):
    return (prediction - target).square() / 2


def flatten(tensors):
    return torch.cat([tensor.flatten() for tensor in tensors])


def compare(actual, expected):
    torch.testing.assert_close(actual, expected, **TOLERANCE)
    return (actual - expected).abs().max().item()


def local_param(model):
    (shard,) = model.parameters()
    return shard


def check_local_means(model, dense, rank, shard_slice):
    # Autograd on one ordinary model constructs the two reference objectives.
    error = half_squared_error(dense(X), Y)
    wrong_loss = sum(error[rows].mean() for rows in ROWS) / len(ROWS)
    wrong_loss.backward()
    wrong_reference = flatten(parameter.grad for parameter in dense.parameters())
    compare(wrong_reference, HAND_WRONG)

    rows = ROWS[rank]
    half_squared_error(model(X[rows]), Y[rows]).mean().backward()
    wrong_shard = local_param(model).grad.detach().clone()
    compare(wrong_shard, wrong_reference[shard_slice])
    delta = (wrong_shard - HAND_GRAD[shard_slice]).abs().max().item()
    assert delta > TOLERANCE["atol"]
    model.zero_grad(set_to_none=True)
    dense.zero_grad(set_to_none=True)
    return {"wrong_local_mean_gradient": wrong_shard.tolist(), "delta_from_global_gradient": delta}


def observe_full_state(model, optimizer, dense, dense_optimizer):
    # Both ranks participate. FSDP maps the flat optimizer shards back to names.
    full_model, full_optimizer = get_state_dict(model, optimizer, options=StateDictOptions(full_state_dict=True))
    assert set(full_model) == set(full_optimizer["state"]) == set(NAMES)
    parameter_error = max(compare(full_model[name], parameter) for name, parameter in dense.named_parameters())
    state_error = 0.0
    state = {}
    for name, parameter in dense.named_parameters():
        actual, expected = full_optimizer["state"][name], dense_optimizer.state[parameter]
        assert set(actual) == set(expected) == {"step", *MOMENTS}
        for key, value in actual.items():
            state_error = max(state_error, compare(value, expected[key]))
        state[name] = {key: actual[key].tolist() for key in ("step", *MOMENTS)}
    return {
        "parameters": {name: full_model[name].tolist() for name in NAMES},
        "adam": state,
        "parameter_max_abs_error": parameter_error,
        "adam_max_abs_error": state_error,
    }


def train_rank(rank, world):
    inner = linear()
    model = FSDP(inner, sharding_strategy=ShardingStrategy.FULL_SHARD, device_id=torch.device("cpu"))
    dense = linear()
    optimizer = torch.optim.Adam(model.parameters(), lr=LR, foreach=False)
    dense_optimizer = torch.optim.Adam(dense.parameters(), lr=LR, foreach=False)
    rows = ROWS[rank]
    local_targets = Y[rows].numel()
    count = torch.tensor(local_targets)
    dist.all_reduce(count)
    total_targets = count.item()
    assert total_targets == Y.numel() == 6

    shard_size = local_param(model).numel()
    assert shard_size == 3
    shard_slice = slice(rank * shard_size, (rank + 1) * shard_size)
    initial_shard = local_param(model).detach().clone()
    compare(initial_shard, flatten(dense.parameters())[shard_slice])
    negative = check_local_means(model, dense, rank, shard_slice)

    layer_shapes = []

    def observe_layer(module, inputs):
        layer_shapes.append({"weight": list(module.weight.shape), "bias": list(module.bias.shape)})

    # Hook the wrapped Linear during normal FSDP forward, never call it directly.
    hook = inner.register_forward_pre_hook(observe_layer)
    updates = []
    try:
        for step in (1, 2):
            optimizer.zero_grad(set_to_none=True)
            dense_optimizer.zero_grad(set_to_none=True)
            dense_output = dense(X)
            dense_loss = half_squared_error(dense_output, Y).mean()
            dense_loss.backward()
            dense_gradient = flatten(parameter.grad for parameter in dense.parameters())
            if step == 1:
                compare(dense_gradient, HAND_GRAD)

            with profile(activities=[ProfilerActivity.CPU]) as trace:
                output = model(X[rows])
                forward_shard_size = local_param(model).numel()
                local_sum = half_squared_error(output, Y[rows]).sum()
                # FSDP averages gradients. The prefactor preserves the target mean.
                (world * local_sum / total_targets).backward()
            assert forward_shard_size == shard_size
            assert layer_shapes[-1] == {"weight": [2, 2], "bias": [2]}
            calls = {event.key: event.count for event in trace.key_averages()
                     if event.key.startswith(("c10d::", "gloo:"))}
            assert calls.get("c10d::allgather_", 0) >= 1, calls
            assert calls.get("c10d::_reduce_scatter_base_", 0) >= 1, calls

            output_error = compare(output, dense_output[rows])
            grad = local_param(model).grad.detach().clone()
            gradient_error = compare(grad, dense_gradient[shard_slice])
            optimizer.step()
            dense_optimizer.step()
            shard = local_param(model)
            parameter_error = compare(shard, flatten(dense.parameters())[shard_slice])
            adam = optimizer.state[shard]
            assert adam["step"].item() == step
            moment_errors = {}
            for name in MOMENTS:
                dense_moment = flatten(dense_optimizer.state[p][name] for p in dense.parameters())
                assert adam[name].numel() == shard_size
                moment_errors[name] = compare(adam[name], dense_moment[shard_slice])

            updates.append({
                "step": step, "dense_loss_before_update": dense_loss.item(),
                "dense_gradient": dense_gradient.tolist(),
                "local_forward": output.tolist(), "wrapped_layer_during_forward": layer_shapes[-1],
                "parameter_elements_after_forward": forward_shard_size,
                "local_gradient": grad.tolist(), "local_parameters_after_update": shard.tolist(),
                "local_adam": {name: adam[name].tolist() for name in ("step", *MOMENTS)},
                "full_state_on_this_rank": observe_full_state(model, optimizer, dense, dense_optimizer),
                "native_collective_events": calls,
                "max_abs_error": {"output": output_error, "gradient": gradient_error,
                                  "parameters": parameter_error, "adam_moments": moment_errors},
            })
    finally:
        hook.remove()

    return {
        "rank": rank, "rows": list(range(rows.start, rows.stop)), "local_target_count": local_targets,
        "sharding_strategy": model.sharding_strategy.name, "initial_shard": initial_shard.tolist(),
        "negative_local_means": negative, "updates": updates,
    }


def main():
    assert str(torch.__version__).split("+", 1)[0] == "2.5.1", "use PyTorch 2.5.1"
    torch.set_num_threads(1)
    torch.manual_seed(1)
    dist.init_process_group("gloo", timeout=timedelta(seconds=30))
    try:
        rank, world = dist.get_rank(), dist.get_world_size()
        assert world == 2, "launch exactly two ranks"
        local = train_rank(rank, world)
        ranks = [None] * world if rank == 0 else None
        dist.gather_object(local, ranks, dst=0)
        if rank == 0:
            result = {
                "status": "passed", "scope": "native FSDP1 FULL_SHARD, single-host CPU forward/backward/Adam",
                "environment": {"torch": str(torch.__version__), "python": sys.version.split()[0],
                                "backend": dist.get_backend(), "device": "cpu", "dtype": str(DTYPE), "world_size": world},
                "source_sha256": {"fsdp_lab.py": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
                "model": {"weight": [[0.25, -0.5], [0.75, 0.125]], "bias": [0, 0],
                          "parameters": 6, "flattened_order": ["weight[0,0]", "weight[0,1]", "weight[1,0]",
                                                                "weight[1,1]", "bias[0]", "bias[1]"]},
                "fixture": {"x": X.tolist(), "y": Y.tolist(), "target_count": Y.numel(),
                            "first_global_gradient": HAND_GRAD.tolist(), "first_wrong_gradient": HAND_WRONG.tolist()},
                "tolerance": TOLERANCE, "optimizer": {"name": "Adam", "learning_rate": LR},
                "full_state_api": "torch.distributed.checkpoint.state_dict.get_state_dict(full_state_dict=True)",
                "ranks": ranks,
            }
            print(json.dumps(result, indent=2, allow_nan=False))
    finally:
        dist.destroy_process_group()


if __name__ == "__main__":
    main()
