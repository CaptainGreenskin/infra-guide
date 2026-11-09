# 两机四卡 DDP 的启动前检查

先用四个数检查进程身份、设备绑定和第一次通信，再启动训练。每个进程提交 `RANK + 1`。AllGather 按全局 rank 顺序收回 `[1, 2, 3, 4]`，AllReduce 求和后四个进程都读回 `10`。四份 JSON 分别由四个进程在读回结果后写入。

## 本机复跑

在 Linux 或 macOS 使用已有的 PyTorch 2.5.1 CPU/Gloo 环境。两个启动器在同一主机创建四个进程，运行与真机步骤相同的探针。

```sh
python -B run_local.py > replay.json
```

记录里的 `status=passed` 表示本机探针完成且通过了负例。看 `target_gate.target_ready`，结果应为 `false`，退出码为 2。即使四个 rank 和结果都对，这次运行仍只有一个内核身份、CPU/Gloo，也没有四份 GPU 绑定证据。

## 两个节点上的 GPU 环境

固定两台 Linux 节点、每台两个 worker。两端使用同一份探针源码、Python 环境和驱动能力。驱动能识别设备之后，还要核对所装的 PyTorch 包支持这款卡。历史配方是 PyTorch 2.5.1、CUDA 12.4，仍可用于支持这个组合的目标。

RTX PRO 6000 Blackwell 的计算能力为 12.0。对于这个型号，另建环境，使用官方提供的 PyTorch 2.7.1 CUDA 12.8 包。先确认两端驱动支持 CUDA 12.8 和目标 GPU，且拥有自己的两张完整可见卡，再实际执行探针。

```sh
python3 -m venv .venv-blackwell
. .venv-blackwell/bin/activate
python -m pip install torch==2.7.1 --index-url https://download.pytorch.org/whl/cu128
python -c 'import torch; print(torch.__version__, torch.version.cuda, torch.cuda.get_arch_list()); print([torch.cuda.get_device_capability(i) for i in range(torch.cuda.device_count())])'
```

资料：[NVIDIA 计算能力表](https://developer.nvidia.com/cuda/gpus) · [PyTorch 2.7 Blackwell 支持](https://pytorch.org/blog/pytorch-2-7/) · [PyTorch 2.7.1 官方安装方式](https://pytorch.org/get-started/previous-versions/#v271)

## 两端启动，集中核对

在一端执行 `python -c 'import secrets; print(secrets.token_hex(16))'`，把生成的同一会话号填进两端的 `PREFLIGHT_SESSION`。两端的 `MASTER_ADDR` 都用节点 A 的实际内网地址，`MASTER_PORT` 使用同一未占用端口。仅 `NODE_RANK` 不同，A 为 0，B 为 1。使用作业分配给自己的可见卡。确认设备 ID、驱动和两端互访条件后执行。

```sh
torchrun --nnodes=2 --nproc-per-node=2 --node-rank="$NODE_RANK" \
  --master-addr="$MASTER_ADDR" --master-port="$MASTER_PORT" --max-restarts=0 \
  target_probe.py worker --device=cuda --session="$PREFLIGHT_SESSION" \
  --out-dir="target-$PREFLIGHT_SESSION-node-$NODE_RANK"
```

将两端共四份 `rank-*.json` 收到同一空目录。保留两端退出码和失败日志。如果缺少某个 rank 的 JSON，先看那个进程最早的异常。

```sh
python -B target_probe.py check collected/rank-0.json collected/rank-1.json \
  collected/rank-2.json collected/rank-3.json
```

检查程序拒绝丢失或重复 rank、混用会话与脚本、同一内核、CPU/Gloo、设备序号错绑、重复 GPU UUID、运行时不匹配和错误集合结果。worker 按 LOCAL_RANK 绑定进程可见列表中的设备，先读取 CUDA 返回的设备 UUID，再检查它是否在 `nvidia-smi --query-gpu=uuid` 的整卡列表中。报告只保留对会话做过区分的标记，省略原始 UUID、内核启动标识和节点名称。

这一步通过时，只证明该批可信记录满足固定四进程的放置和小规模 NCCL 通信检查。不同 Linux 启动身份能排除常见的同内核伪双节点，物理隔离仍应由机器或云实例分配记录确认。探针不测 RDMA 选路、吞吐、训练更新或恢复。要检查 NCCL 选路，可在两端保留 `NCCL_DEBUG=INFO`、`NCCL_DEBUG_SUBSYS=INIT,NET` 日志，再和网络拓扑对照。训练时继续核对全局 batch、更新、共享检查点及恢复。
