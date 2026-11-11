"""Train the original TinyDecoder with DDP, resume, export, and infer in fresh processes."""
import argparse
import hashlib
import io
import json
import os
from datetime import timedelta
from pathlib import Path
import platform
import subprocess
import sys
from tempfile import TemporaryDirectory
import time

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
from torch.nn.attention import SDPBackend, sdpa_kernel
from torch.nn.parallel import DistributedDataParallel

ROOT = Path(__file__).resolve().parent
PACK_SHA = {
    "tiny_decoder.py": "724963cf4a04ac76f6b7d125876d0be1947b1b29a6b0a159a5bb347477dc3e6f",
    "cache_lab.py": "0095bbd7dda812dfc88360b1aac3515c17df8c32e50723547ca78194e451076c",
    "requirements.txt": "8049eb34ab1429faf23b56ab9d5edc0b20ef0e2d9a98f319eec5505a7277850e",
}
SEED = 7
WORLD = 2
LR = 0.05
MOMENTUM = 0.5
ATOL = 1e-12
ROWS = [[0, 1, 2, 3, 4], [4, 5, 6, 7, 0]]
LABELS = [[[1, -100, -100, -100], [5, 6, 7, -100]],
          [[1, 2, 3, -100], [-100, -100, -100, 0]]]
PROBE_NAME = "token.weight"
PROBE_INDEX = (1, 0)
PROBE_ID = "token.weight[1,0]"
INPUT_SHA = hashlib.sha256(json.dumps([ROWS, LABELS], separators=(",", ":")).encode()).hexdigest()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def imported_pack(folder):
    for filename, expected in PACK_SHA.items():
        if sha((folder / filename).read_bytes()) != expected:
            raise ValueError("SDPA pack bytes do not match: " + filename)
    sys.path.insert(0, str(folder))
    try:
        from tiny_decoder import TinyDecoder, loss_sum, update
        from cache_lab import CachedTinyDecoder, greedy
    finally:
        sys.path.pop(0)
    return TinyDecoder, loss_sum, update, CachedTinyDecoder, greedy


def initialized():
    if torch.__version__.split("+")[0] != "2.5.1":
        raise ValueError("use torch==2.5.1 from the pinned SDPA pack")
    torch.set_num_threads(1)
    torch.manual_seed(SEED)


def model_and_optimizer(model_type):
    model = model_type().double()
    optimizer = torch.optim.SGD(model.parameters(), lr=LR, momentum=MOMENTUM)
    return model, optimizer


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf8")


def saved_bytes(payload):
    buffer = io.BytesIO()
    torch.save(payload, buffer)
    return buffer.getvalue()


def safe_load(raw):
    return torch.load(io.BytesIO(raw), map_location="cpu", weights_only=True)


def tensor_digest(tensors):
    hash_object = hashlib.sha256()
    for name, tensor in sorted(tensors.items()):
        data = tensor.detach().contiguous()
        hash_object.update(json.dumps([name, str(data.dtype), list(data.shape)]).encode() + b"\n")
        hash_object.update(bytes(data.view(torch.uint8).reshape(-1).tolist()))
    return hash_object.hexdigest()


def momentum_state(model, optimizer):
    return {name: optimizer.state[param]["momentum_buffer"]
            for name, param in model.named_parameters() if "momentum_buffer" in optimizer.state.get(param, {})}


def snapshot(model, optimizer):
    buffers = momentum_state(model, optimizer)
    return {"weights_sha256": tensor_digest(model.state_dict()),
            "momentum_sha256": tensor_digest(buffers),
            "rng_sha256": tensor_digest({"rng": torch.get_rng_state()}),
            "parameter_count": sum(p.numel() for p in model.parameters()),
            "momentum_elements": sum(t.numel() for t in buffers.values())}


def checkpoint_value(model, optimizer, step, loss):
    return {"weights": model.state_dict(), "optimizer": optimizer.state_dict(),
            "momentum_by_name": momentum_state(model, optimizer),
            "gradients": {name: param.grad for name, param in model.named_parameters()},
            "rng": torch.get_rng_state(), "input_sha256": INPUT_SHA,
            "completed": step, "next_batch": step, "loss": loss}


def worker(rank, root, folder, phase):
    initialized()
    model_type, loss_sum, _, _, _ = imported_pack(folder)
    model, optimizer = model_and_optimizer(model_type)
    next_batch = 0
    loaded_sha = None
    if phase == "resume":
        raw = (root / "step1.pt").read_bytes()
        loaded_sha = sha(raw)
        saved = safe_load(raw)
        if (saved["completed"], saved["next_batch"], saved["input_sha256"]) != (1, 1, INPUT_SHA):
            raise ValueError("checkpoint has the wrong training cursor or input identity")
        model.load_state_dict(saved["weights"], strict=True)
        optimizer.load_state_dict(saved["optimizer"])
        torch.set_rng_state(saved["rng"])
        next_batch = saved["next_batch"]
    step = next_batch + 1

    init_file = (root / ("rendezvous-" + phase)).as_uri()
    dist.init_process_group("gloo", init_method=init_file, rank=rank, world_size=WORLD, timeout=timedelta(seconds=20))
    try:
        ddp = DistributedDataParallel(model)
        before = snapshot(model, optimizer)
        probe = dict(model.named_parameters())[PROBE_NAME]
        old_weight = float(probe.detach()[PROBE_INDEX])
        old_buffer = momentum_state(model, optimizer).get(PROBE_NAME)
        old_momentum = 0.0 if old_buffer is None else float(old_buffer[PROBE_INDEX])
        local_derivatives = []
        hook = probe.register_hook(lambda grad: local_derivatives.append(float(grad[PROBE_INDEX])))
        row = torch.tensor([ROWS[rank][:-1]])
        targets = torch.tensor([LABELS[next_batch][rank]])
        local_valid = int((targets != -100).sum())
        count = torch.tensor(local_valid)
        dist.all_reduce(count, op=dist.ReduceOp.SUM)
        with sdpa_kernel(backends=[SDPBackend.MATH]):
            local_sum = loss_sum(ddp(row), targets)
            (local_sum * WORLD / int(count)).backward()
        hook.remove()
        assert len(local_derivatives) == 1
        global_sum = local_sum.detach().clone()
        dist.all_reduce(global_sum, op=dist.ReduceOp.SUM)
        loss = float(global_sum) / int(count)
        global_gradient = float(probe.grad[PROBE_INDEX])
        optimizer.step()

        after = snapshot(model, optimizer)
        check = {"step": step, "next_batch_before": next_batch, "next_batch_after": step,
                 "rank": rank, "pid": os.getpid(), "backend": str(dist.get_backend()),
                 "input_ids": row[0].tolist(), "labels": targets[0].tolist(),
                 "valid_targets": local_valid, "global_valid_targets": int(count),
                 "local_loss_sum": float(local_sum.detach()), "global_mean_loss": loss,
                 "checkpoint_read_sha256": loaded_sha, "before": before, "after": after,
                 "probe": {"old_weight": old_weight, "old_momentum": old_momentum,
                           "local_scaled_gradient": local_derivatives[0], "global_gradient": global_gradient,
                           "new_weight": float(probe.detach()[PROBE_INDEX]),
                           "new_momentum": float(momentum_state(model, optimizer)[PROBE_NAME][PROBE_INDEX])}}
        write_json(root / f"{phase}-rank{rank}.json", check)
        if rank == 0:
            (root / f"step{step}.pt").write_bytes(saved_bytes(checkpoint_value(model, optimizer, step, loss)))
        dist.barrier()
    finally:
        dist.destroy_process_group()


def launch_group(root, folder, phase):
    group = mp.spawn(worker, args=(root, folder, phase), nprocs=WORLD, join=False)
    deadline = time.monotonic() + 45
    try:
        while not group.join(timeout=max(0, deadline - time.monotonic())):
            if time.monotonic() >= deadline:
                raise TimeoutError("local worker group did not finish: " + phase)
    finally:
        for process in group.processes:
            if process.is_alive():
                process.kill()
                process.join(timeout=5)
    return [json.loads((root / f"{phase}-rank{rank}.json").read_text()) for rank in range(WORLD)]


def max_error(left, right):
    if left.keys() != right.keys():
        raise AssertionError("tensor inventories differ")
    return max(float((left[k].detach() - right[k].detach()).abs().max()) for k in left)


def compare_dense(folder, saved):
    initialized()
    model_type, loss_sum, legacy_update, _, _ = imported_pack(folder)
    model, optimizer = model_and_optimizer(model_type)
    initialized()
    old = model_type().double()
    ids = torch.tensor(ROWS)[:, :-1]
    differences = []
    with sdpa_kernel(backends=[SDPBackend.MATH]):
        original_loss = legacy_update(old, ids, torch.tensor(LABELS[0]), micro_size=2)
        weights_only_error = None
        for index, record in enumerate(saved):
            targets = torch.tensor(LABELS[index])
            if index == 1:
                reset = model_type().double()
                reset.load_state_dict(model.state_dict(), strict=True)
                reset_optimizer = torch.optim.SGD(reset.parameters(), lr=LR, momentum=MOMENTUM)
                (loss_sum(reset(ids), targets) / 4).backward()
                reset_optimizer.step()
            optimizer.zero_grad(set_to_none=True)
            loss = loss_sum(model(ids), targets) / 4
            loss.backward()
            optimizer.step()
            errors = {"step": index + 1, "loss": float(loss.detach()),
                      "loss_abs_error": abs(float(loss.detach()) - record["loss"]),
                      "weights_max_abs_error": max_error(model.state_dict(), record["weights"]),
                      "momentum_max_abs_error": max_error(momentum_state(model, optimizer), record["momentum_by_name"]),
                      "gradients_max_abs_error": max_error(
                          {name: param.grad for name, param in model.named_parameters()}, record["gradients"])}
            assert all(value <= ATOL for name, value in errors.items() if "error" in name)
            differences.append(errors)
            if index == 1:
                weights_only_error = max_error(reset.state_dict(), model.state_dict())
        legacy_error = max_error(old.state_dict(), saved[0]["weights"])
        assert legacy_error <= ATOL and weights_only_error > 1e-3
    return {"original_a1_loss": original_loss, "original_a1_step1_weights_max_abs_error": legacy_error,
            "steps": differences, "weights_only_resume_step2_error": weights_only_error}


def export_weights(root, record, checkpoint_sha):
    folder = root / f"bundle-step{record['completed']}"
    folder.mkdir()
    data = saved_bytes(record["weights"])
    (folder / "weights.pt").write_bytes(data)
    manifest = {"version": 1, "model": "TinyDecoder", "step": record["completed"],
                "checkpoint_sha256": checkpoint_sha, "weights_sha256": sha(data),
                "weights_state_sha256": tensor_digest(record["weights"]),
                "vocab_size": 8, "max_positions": 4, "parameters": 664}
    write_json(folder / "manifest.json", manifest)
    return folder, manifest


def inference(folder, bundle):
    initialized()
    model_type, _, _, cache_type, greedy = imported_pack(folder)
    manifest = json.loads((bundle / "manifest.json").read_text())
    if (manifest["version"], manifest["model"], manifest["vocab_size"],
            manifest["max_positions"], manifest["parameters"]) != (1, "TinyDecoder", 8, 4, 664):
        raise ValueError("bundle describes a different model")
    raw = (bundle / "weights.pt").read_bytes()
    if sha(raw) != manifest["weights_sha256"]:
        raise ValueError("weight file does not match bundle manifest")
    weights = safe_load(raw)
    if tensor_digest(weights) != manifest["weights_state_sha256"]:
        raise ValueError("loaded parameter values do not match bundle manifest")
    reference, cached = model_type().double(), cache_type().double()
    reference.load_state_dict(weights, strict=True)
    cached.load_state_dict(weights, strict=True)
    with torch.inference_mode(), sdpa_kernel(backends=[SDPBackend.MATH]):
        reference.eval()
        cached.eval()
        first_scores = reference(torch.tensor([[0, 1]]))[0, -1].tolist()
        generated = greedy(reference, cached)
    return {"pid": os.getpid(), "manifest": manifest, "first_logits": first_scores,
            "generation": generated}


def run(folder):
    with TemporaryDirectory(prefix="tiny-decoder-handoff-") as scratch:
        root = Path(scratch)
        first = launch_group(root, folder, "first")
        resumed = launch_group(root, folder, "resume")
        pids = {row["pid"] for row in first + resumed}
        assert len(pids) == 4
        records, digests = [], []
        for i in (1, 2):
            raw = (root / f"step{i}.pt").read_bytes()
            digests.append(sha(raw))
            records.append(safe_load(raw))
        for index, group in enumerate((first, resumed)):
            assert group[0]["after"] == group[1]["after"]
            checkpoint = records[index]
            assert (checkpoint["completed"], checkpoint["next_batch"], checkpoint["input_sha256"]) == (index + 1, index + 1, INPUT_SHA)
            assert group[0]["after"]["weights_sha256"] == tensor_digest(checkpoint["weights"])
            assert group[0]["after"]["momentum_sha256"] == tensor_digest(checkpoint["momentum_by_name"])
            assert group[0]["after"]["rng_sha256"] == tensor_digest({"rng": checkpoint["rng"]})
        assert all(row["checkpoint_read_sha256"] == digests[0] and row["before"] == first[0]["after"]
                   for row in resumed)
        dense = compare_dense(folder, records)
        bundles = [export_weights(root, record, check) for record, check in zip(records, digests)]
        children = []
        args = [sys.executable, "-B", str(Path(__file__).resolve()), "--sdpa-pack", str(folder), "--serve-bundle"]
        for path, manifest in bundles:
            child = json.loads(subprocess.check_output(args + [str(path)], text=True, timeout=20))
            assert child["manifest"] == manifest and child["pid"] not in pids
            pids.add(child["pid"])
            children.append(child)
        assert children[0]["generation"]["generated_ids"] == children[1]["generation"]["generated_ids"] == [1, 1, 1]
        stale = root / "mixed-bundle"
        stale.mkdir()
        write_json(stale / "manifest.json", bundles[1][1])
        (stale / "weights.pt").write_bytes((bundles[0][0] / "weights.pt").read_bytes())
        bad = subprocess.run(args + [str(stale)], capture_output=True, text=True, timeout=20)
        assert bad.returncode == 2 and "weight file does not match bundle manifest" in bad.stderr and not bad.stdout
        return {"training": {"first": first, "resume": resumed, "checkpoint_sha256": digests,
                             "dense": dense},
                "inference": {"step1": children[0], "step2": children[1],
                              "first_logits_delta": max(abs(a - b) for a, b in zip(
                                  children[0]["first_logits"], children[1]["first_logits"])),
                              "wrong_bundle": {"exit": bad.returncode, "reason": bad.stderr.strip()}}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdpa-pack", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--serve-bundle", type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    folder = args.sdpa_pack.resolve()
    if args.serve_bundle:
        try:
            value = inference(folder, args.serve_bundle)
        except ValueError as error:
            print(error, file=sys.stderr)
            raise SystemExit(2) from None
    else:
        value = {"scope": "two CPU/Gloo ranks, checkpoint handoff and new-process native CPU SDPA",
                 "torch": torch.__version__, "python": platform.python_version(),
                 "system": platform.system(), "machine": platform.machine(),
                 "source_sha256": {name: sha((ROOT / name).read_bytes()) for name in ("handoff.py", "README.md")},
                 "sdpa_dependency_sha256": PACK_SHA,
                 "fixture": {"seed": SEED, "rows": ROWS, "labels": LABELS, "input_sha256": INPUT_SHA,
                             "world_size": WORLD, "lr": LR, "momentum": MOMENTUM, "atol": ATOL,
                             "probe": PROBE_ID, "device": "cpu", "dtype": "float64"},
                 "result": run(folder)}
    rendered = json.dumps(value, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf8")
    print(rendered, end="")


if __name__ == "__main__":
    main()
