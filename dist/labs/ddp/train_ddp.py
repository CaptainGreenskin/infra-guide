"""Small, reproducible DDP lab. Run with torchrun; see README.md.

Epoch-boundary recovery only, with a fixed world size and fixed batch settings.
Synthetic classification data exercises the training plumbing, not LLM performance.
"""
import argparse
from contextlib import nullcontext
from datetime import timedelta
import json
import os
from pathlib import Path
import time

import torch
from torch import nn
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data import DataLoader, TensorDataset, DistributedSampler


def arguments():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--device', choices=['cpu', 'cuda'], default='cuda')
    p.add_argument('--epochs', type=int, default=4, help='Total target epochs, including resumed epochs')
    p.add_argument('--batch-size', type=int, default=64, help='Per-rank microbatch')
    p.add_argument('--accum', type=int, default=2)
    p.add_argument('--samples', type=int, default=8192)
    p.add_argument('--hidden', type=int, default=256)
    p.add_argument('--seed', type=int, default=23)
    p.add_argument('--precision', choices=['fp32', 'bf16', 'fp16'], default='fp32')
    p.add_argument('--save-dir', default='runs/demo')
    p.add_argument('--resume', default='')
    a = p.parse_args()
    if min(a.epochs, a.batch_size, a.accum, a.samples, a.hidden) < 1:
        p.error('epochs, batch-size, accum, samples and hidden must be positive')
    if a.device == 'cpu' and a.precision != 'fp32':
        p.error('This CPU verification path supports fp32 only')
    if not all(k in os.environ for k in ('RANK', 'LOCAL_RANK', 'WORLD_SIZE')):
        p.error('Use torchrun, even for a single process; see README.md')
    return a


def report(rank, **record):
    if rank == 0:
        print(json.dumps(record, ensure_ascii=False), flush=True)


def save_checkpoint(path, model, optimizer, scaler, loader_rng, epoch, signature, device, rank, world):
    save_began = time.perf_counter()
    # Small teaching example: gather RNG state, not model tensors, to rank 0.
    rng = {'cpu': torch.get_rng_state(), 'loader': loader_rng.get_state()}
    if device.type == 'cuda':
        rng['cuda'] = torch.cuda.get_rng_state(device)
    all_rng = [None] * world if rank == 0 else None
    dist.gather_object(rng, all_rng, dst=0)
    if rank == 0:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + '.tmp')
        payload = {'model': model.module.state_dict(), 'optimizer': optimizer.state_dict(),
                   'scaler': scaler.state_dict(), 'next_epoch': epoch + 1,
                   'signature': signature, 'rng_by_rank': all_rng}
        # Same-directory replace is atomic on a suitable POSIX filesystem.
        # Not an object-storage commit protocol and not a power-loss guarantee.
        with temporary.open('wb') as f:
            torch.save(payload, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, path)
    dist.barrier()
    report(rank, event='checkpoint', path=str(path), next_epoch=epoch + 1,
           seconds=time.perf_counter() - save_began)


def train(a):
    rank, local_rank, world = (int(os.environ[k]) for k in ('RANK', 'LOCAL_RANK', 'WORLD_SIZE'))
    torch.set_num_threads(1)
    if a.device == 'cuda':
        if not torch.cuda.is_available() or local_rank >= torch.cuda.device_count():
            raise RuntimeError('Each local process needs a distinct visible CUDA GPU')
        torch.cuda.set_device(local_rank)
        device = torch.device('cuda', local_rank)
        if a.precision == 'bf16' and not torch.cuda.is_bf16_supported():
            raise RuntimeError('BF16 is not supported by this device/runtime; use fp32 or fp16')
    else:
        device = torch.device('cpu')
    dist.init_process_group('nccl' if a.device == 'cuda' else 'gloo', timeout=timedelta(seconds=120))
    try:
        # Identical fixed dataset across ranks. No external dataset download required.
        data_rng = torch.Generator().manual_seed(a.seed)
        x = torch.randn(a.samples, 128, generator=data_rng)
        teacher = torch.randn(128, 10, generator=data_rng)
        y = (x @ teacher).argmax(dim=1)
        dataset = TensorDataset(x, y)
        sampler = DistributedSampler(dataset, num_replicas=world, rank=rank,
                                     shuffle=True, seed=a.seed, drop_last=True)
        loader_rng = torch.Generator().manual_seed(a.seed + 1000 + rank)
        loader = DataLoader(dataset, batch_size=a.batch_size, sampler=sampler,
                            drop_last=True, num_workers=0, pin_memory=a.device == 'cuda',
                            generator=loader_rng)
        if len(loader) == 0 or len(loader) % a.accum:
            raise ValueError('Per-rank batch count must be positive and divisible by --accum; '
                             'adjust --samples/--batch-size/--accum')
        torch.manual_seed(a.seed)
        raw_model = nn.Sequential(nn.Linear(128, a.hidden), nn.ReLU(), nn.Dropout(0.1),
                                  nn.Linear(a.hidden, 10)).to(device)
        model = DDP(raw_model, device_ids=[local_rank] if a.device == 'cuda' else None,
                    broadcast_buffers=False)
        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
        scaler = torch.amp.GradScaler('cuda', enabled=a.precision == 'fp16')
        torch.manual_seed(a.seed + rank)  # Independent dropout streams, restored on resume.
        signature = {k: getattr(a, k) for k in ('device', 'precision', 'batch_size', 'accum',
                                                'samples', 'hidden', 'seed')}
        signature['world_size'] = world
        start = 0
        if a.resume:
            # Only load a trusted checkpoint from this lab. Every rank must read the same file.
            state = torch.load(a.resume, map_location='cpu', weights_only=True)
            if state['signature'] != signature:
                raise ValueError('Resume requires the same world size, device, precision and training settings')
            model.module.load_state_dict(state['model'])
            optimizer.load_state_dict(state['optimizer'])
            scaler.load_state_dict(state['scaler'])
            start = state['next_epoch']
            torch.set_rng_state(state['rng_by_rank'][rank]['cpu'])
            loader_rng.set_state(state['rng_by_rank'][rank]['loader'])
            if a.device == 'cuda':
                torch.cuda.set_rng_state(state['rng_by_rank'][rank]['cuda'], device)
        if start >= a.epochs:
            raise ValueError('--epochs is the total target and must be greater than checkpoint next_epoch')
        effective_batch = a.batch_size * a.accum * world
        report(rank, event='start', world_size=world, backend=dist.get_backend(),
               effective_batch=effective_batch, start_epoch=start, precision=a.precision,
               torch_version=str(torch.__version__))
        for epoch in range(start, a.epochs):
            sampler.set_epoch(epoch)
            model.train()
            optimizer.zero_grad(set_to_none=True)
            loss_sum = torch.zeros((), device=device)
            seen = 0
            dist.barrier()
            if a.device == 'cuda':
                torch.cuda.synchronize(device)
            began = time.perf_counter()
            for step, (features, labels) in enumerate(loader):
                features = features.to(device, non_blocking=True)
                labels = labels.to(device, non_blocking=True)
                update = (step + 1) % a.accum == 0
                # no_sync must cover BOTH forward and backward.
                with nullcontext() if update else model.no_sync():
                    with torch.autocast(device_type=a.device,
                                        dtype=torch.bfloat16 if a.precision == 'bf16' else torch.float16,
                                        enabled=a.precision != 'fp32'):
                        loss = nn.functional.cross_entropy(model(features), labels)
                    scaler.scale(loss / a.accum).backward()
                loss_sum += loss.detach() * labels.numel()
                seen += labels.numel()
                if update:
                    scaler.step(optimizer)
                    scaler.update()
                    optimizer.zero_grad(set_to_none=True)
            if a.device == 'cuda':
                torch.cuda.synchronize(device)
            duration = torch.tensor(time.perf_counter() - began, device=device, dtype=torch.float64)
            totals = torch.stack((loss_sum.double(), torch.tensor(float(seen), device=device, dtype=torch.float64)))
            dist.all_reduce(duration, op=dist.ReduceOp.MAX)
            dist.all_reduce(totals, op=dist.ReduceOp.SUM)
            report(rank, event='epoch', epoch=epoch + 1, loss=(totals[0] / totals[1]).item(),
                   samples=int(totals[1].item()), seconds=duration.item(),
                   samples_per_second=(totals[1] / duration).item(),
                   optimizer_steps=len(loader) // a.accum)
            save_checkpoint(Path(a.save_dir) / 'checkpoint.pt', model, optimizer, scaler,
                            loader_rng, epoch, signature, device, rank, world)
    finally:
        dist.destroy_process_group()


if __name__ == '__main__':
    train(arguments())
