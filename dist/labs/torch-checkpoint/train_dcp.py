"""DCP 2.5.1 / two CPU ranks, using the existing DDP lesson's exact workload.

Only complete epoch boundaries and a fixed world size are supported. The
reference_train.py copy retains the original rank-0 torch.save baseline.
"""
import argparse
from contextlib import nullcontext
from datetime import timedelta
import json
import os
from pathlib import Path

import torch
from torch import nn
import torch.distributed as dist
import torch.distributed.checkpoint as dcp
from torch.distributed.checkpoint.state_dict import get_state_dict, set_state_dict
from torch.distributed.checkpoint.stateful import Stateful
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data import DataLoader, DistributedSampler, TensorDataset


class TrainState(Stateful):
    def __init__(self, model, optimizer, loader_rng, signature, weights_only=False):
        self.model, self.optimizer = model, optimizer
        self.loader_rng, self.signature = loader_rng, signature
        self.progress = {"next_epoch": 0, "updates": 0}
        self.weights_only = weights_only
        self.loaded = False

    def rng_states(self):
        local = {"cpu": torch.get_rng_state(), "loader": self.loader_rng.get_state()}
        states = [None] * dist.get_world_size()
        dist.all_gather_object(states, local)
        return states

    def state_dict(self):
        # DCP calls this on save AND before load to allocate the destination tree.
        model, optim = get_state_dict(self.model, self.optimizer)
        return {"model": model, "optim": optim, "progress": self.progress.copy(),
                "signature": self.signature.copy(), "rng_by_rank": self.rng_states()}

    def load_state_dict(self, state):
        if state["signature"] != self.signature:
            raise ValueError("fixed_configuration_required")
        if self.weights_only:
            # Deliberate negative control: preserve input/RNG boundary but reset Adam.
            self.model.module.load_state_dict(state["model"])
            self.optimizer.state.clear()
        else:
            set_state_dict(self.model, self.optimizer,
                           model_state_dict=state["model"], optim_state_dict=state["optim"])
        self.progress = dict(state["progress"])
        rng = state["rng_by_rank"][dist.get_rank()]
        torch.set_rng_state(rng["cpu"])
        self.loader_rng.set_state(rng["loader"])
        self.loaded = True


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--epochs", type=int, required=True, help="Total target epochs")
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--resume", type=Path)
    p.add_argument("--weights-only", action="store_true")
    args = p.parse_args()
    if torch.__version__.split("+")[0] != "2.5.1":
        raise RuntimeError("This record and API are pinned to torch 2.5.1")
    rank, world = int(os.environ["RANK"]), int(os.environ["WORLD_SIZE"])
    if world != 2 or args.epochs not in (2, 4):
        raise ValueError("This lesson fixes world_size=2 and epochs=2 or 4")
    torch.set_num_threads(1)
    dist.init_process_group("gloo", timeout=timedelta(seconds=40))
    try:
        # Identical seed, data, layers, optimizer and accumulation to reference_train.py.
        seed, samples, hidden, batch_size, accum = 23, 1024, 32, 32, 2
        data_rng = torch.Generator().manual_seed(seed)
        x = torch.randn(samples, 128, generator=data_rng)
        teacher = torch.randn(128, 10, generator=data_rng)
        y = (x @ teacher).argmax(dim=1)
        data = TensorDataset(x, y, torch.arange(samples))
        sampler = DistributedSampler(data, num_replicas=world, rank=rank,
                                     shuffle=True, seed=seed, drop_last=True)
        loader_rng = torch.Generator().manual_seed(seed + 1000 + rank)
        loader = DataLoader(data, batch_size=batch_size, sampler=sampler, drop_last=True,
                            num_workers=0, generator=loader_rng)
        torch.manual_seed(seed)
        raw = nn.Sequential(nn.Linear(128, hidden), nn.ReLU(), nn.Dropout(0.1),
                            nn.Linear(hidden, 10))
        model = DDP(raw, broadcast_buffers=False)
        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, fused=False)
        torch.manual_seed(seed + rank)
        signature = {"device": "cpu", "precision": "fp32", "batch_size": batch_size,
                     "accum": accum, "samples": samples, "hidden": hidden,
                     "seed": seed, "world_size": world}
        state = TrainState(model, optimizer, loader_rng, signature, args.weights_only)
        if args.resume:
            # Every rank participates. load calls state_dict then load_state_dict.
            dcp.load({"train": state}, checkpoint_id=args.resume)
            assert state.loaded
        start = state.progress["next_epoch"]
        if start >= args.epochs:
            raise ValueError("target_must_follow_resume_boundary")
        trace = []
        for epoch in range(start, args.epochs):
            sampler.set_epoch(epoch)
            model.train()
            optimizer.zero_grad(set_to_none=True)
            first_ids, epoch_ids = None, []
            for micro, (features, labels, ids) in enumerate(loader):
                if first_ids is None:
                    first_ids = ids.tolist()
                epoch_ids.extend(ids.tolist())
                update = (micro + 1) % accum == 0
                with nullcontext() if update else model.no_sync():
                    loss = nn.functional.cross_entropy(model(features), labels)
                    (loss / accum).backward()
                if update:
                    optimizer.step()
                    optimizer.zero_grad(set_to_none=True)
                    state.progress["updates"] += 1
            state.progress["next_epoch"] = epoch + 1
            trace.append({"epoch": epoch, "first_ids": first_ids, "all_ids": epoch_ids,
                          "updates_after": state.progress["updates"]})

        args.output.mkdir(parents=True, exist_ok=True)
        # A new, immutable directory per run; this is synchronous DCP save.
        dcp.save({"train": state}, checkpoint_id=args.output / "checkpoint")
        all_rng = state.rng_states()
        if rank == 0:
            # A verification export, NEVER the path used to resume this program.
            torch.save({"model": model.module.state_dict(), "optimizer": optimizer.state_dict(),
                        "scaler": {}, "next_epoch": state.progress["next_epoch"],
                        "signature": signature, "rng_by_rank": all_rng}, args.output / "comparison.pt")
        (args.output / f"rank-{rank}.json").write_text(json.dumps({
            "rank": rank, "pid": os.getpid(), "loaded": state.loaded,
            "start_epoch": start, "progress": state.progress, "epochs": trace,
            "optimizer_steps": [int(v["step"].item()) for v in optimizer.state.values()],
        }, indent=2) + "\n")
        dist.barrier()
    finally:
        dist.destroy_process_group()


if __name__ == "__main__":
    main()
