"""Actual two-rank CPU/Gloo arithmetic, ragged gathering and collective-contract probes."""
from datetime import timedelta
import json
import re
from pathlib import Path
import tempfile
import time

import torch
import torch.distributed as dist
import torch.multiprocessing as mp


def worker(rank, folder, mode):
    torch.set_num_threads(1)
    directory = Path(folder)
    dist.set_debug_level(dist.DebugLevel.OFF if mode == "correct" else dist.DebugLevel.DETAIL)
    dist.init_process_group("gloo", init_method=(directory / "rendezvous").as_uri(),
                            rank=rank, world_size=2, timeout=timedelta(seconds=12))
    result = {"rank": rank, "mode": mode}
    try:
        if mode != "correct":
            try:
                tensor = torch.ones(2 if rank == 0 or mode == "order_mismatch" else 3)
                if mode == "order_mismatch" and rank == 1:
                    dist.broadcast(tensor, src=0)
                else:
                    dist.all_reduce(tensor)
            except RuntimeError as error:
                message = str(error)
                operators = sorted(set(re.findall(r"OpType=([A-Z_]+)", message)))
                shapes = sorted({part.split("]", 1)[0] + "]" for part in message.split("TensorShape=")[1:]})
                result.update({"rejected": True,
                               "fingerprint_diagnostic": "CollectiveFingerPrint" in message,
                               "category": "operation" if len(operators) > 1 else "shape" if len(shapes) > 1 else "other",
                               "operators": operators, "shapes": shapes,
                               "message_excerpt": message[:1000]})
            else:
                raise AssertionError("mismatched collective unexpectedly succeeded")
        else:
            original = torch.tensor([1, 2, 3, 4] if rank == 0 else [10, 20, 30, 40],
                                    dtype=torch.float64)
            summed = original.clone()
            dist.all_reduce(summed, op=dist.ReduceOp.SUM)
            assert summed.tolist() == [11, 22, 33, 44]
            result["all_reduce_sum"] = summed.tolist()
            result["explicit_rank_mean"] = (summed / 2).tolist()

            shard = torch.zeros(2, dtype=original.dtype)
            # Exercise this backend/version; do not infer every Gloo build supports every variant.
            try:
                dist.reduce_scatter_tensor(shard, original, op=dist.ReduceOp.SUM)
                result["reduce_scatter_tensor"] = {"supported_here": True, "output": shard.tolist()}
                pieces = [torch.zeros_like(shard) for _ in range(2)]
                dist.all_gather(pieces, shard)
                reconstructed = torch.cat(pieces)
                assert torch.equal(reconstructed, summed)
                result["all_gather_shards"] = reconstructed.tolist()
            except RuntimeError as error:
                if "does not support" not in str(error) and "doesn't support" not in str(error):
                    raise
                result["reduce_scatter_tensor"] = {"supported_here": False, "reason": str(error)[:160]}

            values = torch.tensor([2, 4, 6] if rank == 0 else [20], dtype=torch.float64)
            length = torch.tensor([len(values)], dtype=torch.int64)
            lengths = [torch.zeros_like(length) for _ in range(2)]
            dist.all_gather(lengths, length)
            lengths = [item.item() for item in lengths]
            padded = torch.zeros(max(lengths), dtype=values.dtype)
            padded[:len(values)] = values
            gathered = [torch.zeros_like(padded) for _ in range(2)]
            dist.all_gather(gathered, padded)
            compact = [value for piece, size in zip(gathered, lengths) for value in piece[:size].tolist()]
            totals = torch.tensor([values.sum().item(), len(values)], dtype=torch.float64)
            dist.all_reduce(totals, op=dist.ReduceOp.SUM)
            local_mean = values.mean().reshape(1)
            dist.all_reduce(local_mean, op=dist.ReduceOp.SUM)
            wrong_mean = local_mean.item() / 2
            result["ragged"] = {"lengths": lengths, "gathered_padding": [v.tolist() for v in gathered],
                                "real_values": compact, "sum": totals[0].item(),
                                "count": int(totals[1].item()), "global_mean": (totals[0]/totals[1]).item(),
                                "wrong_mean_of_means": wrong_mean,
                                "wrong_include_padding_mean": sum(compact)/(2*max(lengths))}
            assert result["ragged"]["global_mean"] == 8
            assert wrong_mean == 12

            dist.barrier()
            if rank == 1:
                time.sleep(0.08)  # Controlled pre-collective delay, not a network benchmark.
            probe = torch.tensor([rank + 1], dtype=torch.int64)
            started = time.perf_counter_ns()
            work = dist.all_reduce(probe, op=dist.ReduceOp.SUM, async_op=True)
            work.wait()
            elapsed_ms = (time.perf_counter_ns() - started) / 1e6
            assert probe.item() == 3
            result["delayed_arrival"] = {"injected_pre_call_sleep_ms": 80 if rank == 1 else 0,
                                         "local_call_and_wait_ms": elapsed_ms,
                                         "result": probe.item(), "async_result_used_after_wait": True}
    finally:
        dist.destroy_process_group()
    (directory / ("rank-" + str(rank) + ".json")).write_text(json.dumps(result))


def main():
    modes = {}
    with tempfile.TemporaryDirectory(prefix="infra-collective-") as temporary:
        for mode in ["correct", "shape_mismatch", "order_mismatch"]:
            directory = Path(temporary) / mode
            directory.mkdir()
            mp.spawn(worker, args=(str(directory), mode), nprocs=2, join=True)
            modes[mode] = [json.loads((directory / ("rank-" + str(rank) + ".json")).read_text())
                           for rank in range(2)]
    for mode in ["shape_mismatch", "order_mismatch"]:
        assert all(row["rejected"] and row["fingerprint_diagnostic"] for row in modes[mode])
        expected_category = "shape" if mode == "shape_mismatch" else "operation"
        assert all(row["category"] == expected_category for row in modes[mode])
    print(json.dumps({"torch": torch.__version__, "backend": "gloo", "device": "cpu", "world_size": 2,
                      "modes": modes,
                      "scope": "actual_local_collectives_not_nccl_rdma_multihost_or_throughput",
                      "timing_note": "Measured local call+wait durations vary; rank1 sleep is injected before its call."},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

