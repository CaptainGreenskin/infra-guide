"""Save native FSDP state on two ranks and resume on three ranks."""

import argparse
from datetime import timedelta
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

import torch
import torch.distributed as dist
import torch.distributed.checkpoint as dcp
from torch.distributed.checkpoint.state_dict import (
    StateDictOptions, get_model_state_dict, get_state_dict, set_model_state_dict, set_state_dict,
)
from torch.distributed.device_mesh import init_device_mesh
from torch.distributed.tensor import DTensor

from fsdp_lab import (
    FSDP, ShardingStrategy, DTYPE, LR, MOMENTS, NAMES, ROWS, TOLERANCE, X, Y,
    compare, flatten, half_squared_error, linear, local_param, observe_full_state,
)


SHARDED = StateDictOptions(full_state_dict=False)
FULL = StateDictOptions(full_state_dict=True)
BOUNDARY = 1


def wrapped_model(mesh):
    return FSDP(linear(), sharding_strategy=ShardingStrategy.FULL_SHARD,
                device_id=torch.device("cpu"), device_mesh=mesh)


def adam(model):
    return torch.optim.Adam(model.parameters(), lr=LR, foreach=False)


def runtime_state(model, optimizer):
    param = local_param(model)
    moments = optimizer.state.get(param, {})
    return {"parameters": param.detach().tolist(),
            "adam": {name: value.tolist() for name, value in moments.items()}}


def train_one(model, optimizer, rank, world):
    rows = ROWS[rank] if world == 2 else slice(rank, rank + 1)
    local_count = Y[rows].numel()
    count = torch.tensor(local_count)
    dist.all_reduce(count)
    assert count.item() == Y.numel() == 6
    optimizer.zero_grad(set_to_none=True)
    loss_sum = half_squared_error(model(X[rows]), Y[rows]).sum()
    (world * loss_sum / count.item()).backward()
    gradient = local_param(model).grad.detach().tolist()
    optimizer.step()
    return {"rows": list(range(rows.start, rows.stop)), "local_targets": local_count, "gradient": gradient}


def dense_reference(completed):
    model = linear()
    optimizer = adam(model)
    for _ in range(completed):
        optimizer.zero_grad(set_to_none=True)
        half_squared_error(model(X), Y).mean().backward()
        optimizer.step()
    gradient = flatten(parameter.grad for parameter in model.parameters())
    return model, optimizer, gradient


def compare_snapshot(model, optimizer, rank, world, completed, update=None):
    dense, dense_optimizer, gradient = dense_reference(completed)
    width = local_param(model).numel()
    assert width * world == 6
    shard_slice = slice(rank * width, (rank + 1) * width)
    compare(local_param(model), flatten(dense.parameters())[shard_slice])
    state = optimizer.state[local_param(model)]
    assert state["step"].item() == completed
    for name in MOMENTS:
        expected = flatten(dense_optimizer.state[param][name] for param in dense.parameters())
        compare(state[name], expected[shard_slice])
    if update is not None:
        update["gradient_max_abs_error"] = compare(torch.tensor(update["gradient"], dtype=DTYPE), gradient[shard_slice])
    return {"completed_updates": completed, "runtime_flat_range": [shard_slice.start, shard_slice.stop],
            "runtime": runtime_state(model, optimizer),
            "full": observe_full_state(model, optimizer, dense, dense_optimizer), "update": update}


def named_layout(model_state, optim_state):
    def describe(value):
        assert isinstance(value, DTensor)
        return {"type": type(value).__name__, "global_shape": list(value.shape),
                "local_shape": list(value.to_local().shape), "placements": [str(p) for p in value.placements]}

    return {"model": {name: describe(model_state[name]) for name in NAMES},
            "adam": {name: {field: describe(optim_state["state"][name][field]) for field in MOMENTS} for name in NAMES}}


def save_checkpoint(model, optimizer, folder, completed):
    model_state, optimizer_state = get_state_dict(model, optimizer, options=SHARDED)
    state = {"model": model_state, "optimizer": optimizer_state, "completed_updates": torch.tensor(completed)}
    dcp.save(state, checkpoint_id=folder)
    return named_layout(model_state, optimizer_state)


def load_checkpoint(model, optimizer, folder):
    model_state, optimizer_state = get_state_dict(model, optimizer, options=SHARDED)
    layout = named_layout(model_state, optimizer_state)
    # get_state_dict initializes an empty Adam with a zero-LR dummy step in 2.5.1.
    # It supplies destination storage. Only the loaded cursor counts training.
    template = runtime_state(model, optimizer)
    assert all(not any(template["adam"][name]) for name in MOMENTS)
    state = {"model": model_state, "optimizer": optimizer_state, "completed_updates": torch.tensor(-1)}
    dcp.load(state, checkpoint_id=folder)
    result = set_state_dict(model, optimizer, model_state_dict=state["model"],
                            optim_state_dict=state["optimizer"], options=SHARDED)
    assert not result.missing_keys and not result.unexpected_keys
    return state["completed_updates"].item(), layout, template["adam"]


def require_boundary(model, optimizer, completed):
    current = optimizer.state.get(local_param(model), {}).get("step")
    if current is None:
        raise ValueError("missing Adam state")
    adam_step = current.item()
    if completed != adam_step:
        raise ValueError(f"completed_updates={completed} differs from Adam step={adam_step:g}")
    if completed != BOUNDARY:
        raise ValueError(f"this fixture resumes after update {BOUNDARY}")


def expected_rejection(model, optimizer, completed, reason):
    try:
        require_boundary(model, optimizer, completed)
    except ValueError as error:
        assert str(error) == reason
        return {"rejected": True, "reason": reason, "loaded_completed_updates": completed}
    raise AssertionError("invalid checkpoint accepted")


def negative_cases(mesh, folder, rank, world):
    wrong_model = wrapped_model(mesh)
    wrong_optimizer = adam(wrong_model)
    wrong, _, _ = load_checkpoint(wrong_model, wrong_optimizer, folder / "wrong-cursor")
    bad_cursor = expected_rejection(wrong_model, wrong_optimizer, wrong, "completed_updates=0 differs from Adam step=1")
    compare_snapshot(wrong_model, wrong_optimizer, rank, world, BOUNDARY)
    bad_cursor["model_and_adam_match_update_1"] = True

    only_model = wrapped_model(mesh)
    fresh_optimizer = adam(only_model)
    state = {"model": get_model_state_dict(only_model, options=SHARDED), "completed_updates": torch.tensor(-1)}
    dcp.load(state, checkpoint_id=folder / "checkpoint")
    result = set_model_state_dict(only_model, model_state_dict=state["model"], options=SHARDED)
    assert not result.missing_keys and not result.unexpected_keys
    completed = state["completed_updates"].item()
    reference, _, _ = dense_reference(BOUNDARY)
    full_model = get_model_state_dict(only_model, options=FULL)
    before_error = max(compare(full_model[name], parameter) for name, parameter in reference.named_parameters())
    missing_adam = expected_rejection(only_model, fresh_optimizer, completed, "missing Adam state")

    # Deliberately bypass the guard to measure the resulting wrong update.
    train_one(only_model, fresh_optimizer, rank, world)
    reference, _, _ = dense_reference(BOUNDARY + 1)
    full_model = get_model_state_dict(only_model, options=FULL)
    error = max((full_model[name] - parameter).abs().max().item() for name, parameter in reference.named_parameters())
    assert error > 1e-6
    missing_adam.update({"weight_max_abs_error_before_bypass": before_error,
                         "parameter_max_abs_error_after_bypass": error})
    return {"wrong_cursor": bad_cursor, "weights_only": missing_adam}


def worker(phase, folder):
    torch.set_num_threads(1)
    torch.manual_seed(1)
    dist.init_process_group("gloo", timeout=timedelta(seconds=30))
    try:
        rank, world = dist.get_rank(), dist.get_world_size()
        if phase == "plain-template":
            # With no DeviceMesh, FSDP1 uses ShardedTensor for this template.
            model = wrapped_model(None)
            get_state_dict(model, adam(model), options=SHARDED)
            raise AssertionError("empty ShardedTensor template unexpectedly succeeded")
        mesh = init_device_mesh("cpu", (world,))
        model = wrapped_model(mesh)
        optimizer = adam(model)
        local = {"rank": rank}
        if phase == "continuous":
            for completed in (1, 2):
                update = train_one(model, optimizer, rank, world)
                local[f"update_{completed}"] = compare_snapshot(model, optimizer, rank, world, completed, update)
        elif phase == "save":
            update = train_one(model, optimizer, rank, world)
            local["update_1"] = compare_snapshot(model, optimizer, rank, world, BOUNDARY, update)
            local["saved_named_layout"] = save_checkpoint(model, optimizer, folder / "checkpoint", BOUNDARY)
            save_checkpoint(model, optimizer, folder / "wrong-cursor", 0)
        else:
            completed, layout, template_adam = load_checkpoint(model, optimizer, folder / "checkpoint")
            require_boundary(model, optimizer, completed)
            local["loaded_named_layout"] = layout
            local["template_adam_before_load"] = template_adam
            local["loaded_boundary"] = compare_snapshot(model, optimizer, rank, world, completed)
            update = train_one(model, optimizer, rank, world)
            local["update_2"] = compare_snapshot(model, optimizer, rank, world, completed + 1, update)
            local["negative"] = negative_cases(mesh, folder, rank, world)

        ranks = [None] * world if rank == 0 else None
        dist.gather_object(local, ranks, dst=0)
        if rank == 0:
            print(json.dumps({"world_size": world, "ranks": ranks, "run_id": os.environ["TORCHELASTIC_RUN_ID"]}, allow_nan=False))
    finally:
        dist.destroy_process_group()


def launch(phase, world, folder):
    command = [sys.executable, "-B", "-m", "torch.distributed.run", "--standalone", f"--nproc_per_node={world}",
               str(Path(__file__).resolve()), "--phase", phase, "--run-dir", str(folder)]
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    if phase == "plain-template":
        result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=90)
        reason = "NotImplementedError: Only single local shard is supported."
        assert result.returncode != 0 and f"[rank2]: {reason}" in result.stderr
        return {"rejected": True, "world_size": world, "failed_rank": 2,
                "stage": "get_state_dict, before dcp.load", "reason": reason}
    return json.loads(subprocess.check_output(command, env=env, text=True, timeout=90))


def checkpoint_metadata(folder):
    files = sorted(path.name for path in folder.iterdir() if path.is_file())
    assert ".metadata" in files and len([name for name in files if name.endswith(".distcp")]) == 2
    entries = dcp.FileSystemReader(folder).read_metadata().state_dict_metadata
    keys = ["completed_updates", *(f"model.{name}" for name in NAMES),
            *(f"optimizer.state.{name}.{field}" for name in NAMES for field in ("step", *MOMENTS))]
    return {"files": files, "tensor_chunks": {key: {"shape": list(entries[key].size),
             "chunks": sorted([{"offset": list(chunk.offsets), "shape": list(chunk.sizes)}
                               for chunk in entries[key].chunks], key=lambda item: item["offset"])} for key in keys}}


def state_values(snapshot):
    # Read values only, ignoring each run's independent dense error diagnostics.
    full = snapshot["full"]
    values = []
    for name in NAMES:
        values.append(torch.tensor(full["parameters"][name], dtype=DTYPE))
        values.extend(torch.tensor(full["adam"][name][field], dtype=DTYPE) for field in ("step", *MOMENTS))
    return flatten(values)


def verify_runs(continuous, save, resume):
    world2, saved, world3 = (phase["ranks"] for phase in (continuous, save, resume))
    assert [len(world2), len(saved), len(world3)] == [2, 2, 3]
    for phase, key, expected in ((saved, "saved_named_layout", [[1, 2], [1, 2]]),
                                  (world3, "loaded_named_layout", [[1, 2], [1, 2], [0, 2]])):
        assert [rank[key]["model"]["weight"]["local_shape"] for rank in phase] == expected
    assert [rank["update_1"]["runtime_flat_range"] for rank in saved] == [[0, 3], [3, 6]]
    assert [rank["loaded_boundary"]["runtime_flat_range"] for rank in world3] == [[0, 2], [2, 4], [4, 6]]

    start = state_values(world2[0]["update_1"])
    finish = state_values(world2[0]["update_2"])
    saved_delta = max(compare(state_values(rank["update_1"]), start) for rank in saved)
    load_delta = max(compare(state_values(rank["loaded_boundary"]), start) for rank in world3)
    finish_delta = max(compare(state_values(rank["update_2"]), finish) for rank in world3)
    return {"save_vs_uninterrupted_update1_max_abs_error": saved_delta,
            "load_vs_uninterrupted_update1_max_abs_error": load_delta,
            "resume_vs_uninterrupted_update2_max_abs_error": finish_delta,
            "resume_full_state_values_exactly_equal": finish_delta == 0.0}


def run(folder):
    continuous = launch("continuous", 2, folder)
    save = launch("save", 2, folder)
    resume = launch("resume", 3, folder)
    assert len({phase.pop("run_id") for phase in (continuous, save, resume)}) == 3
    root = Path(__file__).resolve().parent
    result = {
        "status": "passed", "scope": "single-host CPU/Gloo, FSDP1, DCP update-boundary restart with a changed world size",
        "environment": {"python": sys.version.split()[0], "torch": str(torch.__version__), "device": "cpu",
                        "backend": "gloo", "dtype": str(DTYPE)},
        "source_sha256": {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                          for name in ("fsdp_reshard.py", "fsdp_lab.py")},
        "fixture": {"x": X.tolist(), "y": Y.tolist(), "targets_per_update": Y.numel(), "adam_lr": LR},
        "tolerance": TOLERANCE, "independent_torchrun_groups": True,
        "continuous_world2": continuous, "save_world2": save, "resume_world3": resume,
        "verification": verify_runs(continuous, save, resume),
        "checkpoint": checkpoint_metadata(folder / "checkpoint"),
        "plain_fsdp1_template_negative": launch("plain-template", 3, folder),
    }
    print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))


def main():
    assert str(torch.__version__).split("+", 1)[0] == "2.5.1", "use PyTorch 2.5.1"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep", type=Path, help="keep the DCP files in a new directory")
    parser.add_argument("--phase", choices=("continuous", "save", "resume", "plain-template"), help=argparse.SUPPRESS)
    parser.add_argument("--run-dir", type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.phase:
        worker(args.phase, args.run_dir)
    elif args.keep:
        folder = args.keep.resolve()
        folder.mkdir(parents=True, exist_ok=False)
        run(folder)
    else:
        with tempfile.TemporaryDirectory(prefix="fsdp-reshard-", dir=Path(__file__).resolve().parent) as folder:
            run(Path(folder))


if __name__ == "__main__":
    main()
