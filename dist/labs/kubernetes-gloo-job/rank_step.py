"""One CPU DDP update. The Job completion index supplies the global rank."""
from datetime import timedelta
import json
import os
import socket
import time

import torch
import torch.distributed as dist
from torch import nn
from torch.nn.parallel import DistributedDataParallel


def rendezvous_ip(host):
    deadline = time.monotonic() + 40
    while True:
        try:
            return socket.gethostbyname(host)
        except socket.gaierror:
            if time.monotonic() >= deadline:
                raise
            time.sleep(.25)


def train():
    rank = int(os.environ.get("JOB_COMPLETION_INDEX", os.environ.get("RANK", "-1")))
    size = int(os.environ["WORLD_SIZE"])
    if size != 2 or rank not in (0, 1):
        raise ValueError("This fixture needs ranks 0 and 1 in one group.")
    # Resolve the rank-0 address once and pass the same address to the TCP store.
    host = os.environ["MASTER_ADDR"]
    ip = rendezvous_ip(host)
    port = int(os.environ["MASTER_PORT"])
    torch.set_num_threads(1)
    dist.init_process_group("gloo", init_method=f"tcp://{ip}:{port}", rank=rank,
                            world_size=size, timeout=timedelta(seconds=90))
    try:
        targets = torch.tensor([[0.]] if rank == 0 else [[3.], [3.], [3.]],
                               dtype=torch.float64)
        count = torch.tensor(targets.numel(), dtype=torch.float64)
        dist.all_reduce(count, op=dist.ReduceOp.SUM)
        model = nn.Linear(1, 1, bias=False, dtype=torch.float64)
        with torch.no_grad():
            model.weight.fill_(1.)
        parallel = DistributedDataParallel(model)
        losses = .5 * (parallel(torch.ones_like(targets)) - targets).square()
        loss_sum = losses.sum()
        # DDP averages rank gradients. Scale local sums before that average.
        (loss_sum * size / count).backward()
        gradient = model.weight.grad.item()
        torch.optim.SGD(model.parameters(), lr=.1).step()
        print("TRAIN_STEP " + json.dumps({
            "rank": rank, "world_size": size, "backend": dist.get_backend(),
            "torch": torch.__version__, "device": model.weight.device.type,
            "master_host": host, "master_ip": ip, "pod_ip": os.getenv("POD_IP"),
            "node": os.getenv("NODE_NAME"), "targets": targets.flatten().tolist(),
            "local_loss_sum": loss_sum.item(), "global_samples": int(count.item()),
            "gradient": gradient, "updated_weight": model.weight.item(),
        }, sort_keys=True), flush=True)
    finally:
        dist.destroy_process_group()


if __name__ == "__main__":
    train()
