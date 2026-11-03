# CloudInfra Guide · DDP 实战包

目标：用一个可重复的小型分类任务，验证单进程、单机多进程、两机四卡、梯度累积与 epoch 边界恢复。
这是训练系统机制实验，合成数据和小型 MLP 不代表 LLM 或 GPU 硬件基准。

## 环境与文件

- 基线 API：Python 3.10–3.12、PyTorch 2.5.1。新版本可另建环境验证，不把 latest 当作复现条件。
- GPU 路径：Linux、NVIDIA CUDA GPU；每个 torchrun 进程占一张可见 GPU。两端软件和训练配置一致。
- CPU 路径：Gloo，FP32，仅用于验证程序逻辑。
- train_ddp.py：完整训练、指标与恢复实现。
- check_env.py：环境清单；不证明跨节点通信已经正常。
- launch_2nodes.sh：在两台机器分别运行的启动脚本。
- compare_checkpoints.py：比较不中断与恢复运行的模型和优化器结果。
- validation.json：本次交付实际执行的验证记录。
- environment-lock.txt：CPU 实测环境包版本；GPU 使用上面的 CUDA 安装说明。

在实验目录创建独立环境：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
# Linux NVIDIA GPU 示例：先确认驱动支持 CUDA 12.4 运行时。
python -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124
# CPU/macOS 验证环境改用：python -m pip install torch==2.5.1
python check_env.py
python -m pip freeze > environment-lock.txt
```

GPU 环境同时记录 nvidia-smi 输出。驱动、容器可见设备和 PyTorch wheel 内的 CUDA 运行时是不同层次；
不要仅凭系统 nvcc 版本判断环境兼容性。安装方式见 https://pytorch.org/get-started/previous-versions/ 。

## 1. CPU 两进程验证

```bash
torchrun --standalone --nproc-per-node=2 train_ddp.py \
  --device=cpu --epochs=4 --samples=1024 --hidden=32 \
  --batch-size=32 --accum=2 --save-dir=runs/cpu-full
```

预期：一条 rank 0 的 start 记录，world_size=2、effective_batch=128；每个 epoch 后出现 epoch 和 checkpoint 记录。
epoch.samples=1024，optimizer_steps=8。loss 的具体数值以实际运行记录为准。

## 2. 单卡与单机两卡

```bash
torchrun --standalone --nproc-per-node=1 train_ddp.py \
  --device=cuda --epochs=4 --batch-size=64 --accum=2 --save-dir=runs/gpu1

torchrun --standalone --nproc-per-node=2 train_ddp.py \
  --device=cuda --epochs=4 --batch-size=64 --accum=2 --save-dir=runs/gpu2
```

这两条是启动验证，全局有效 batch 分别为 128、256。不能据此直接声称两卡训练同一质量目标的加速比。
固定全局 batch 的对照可分别使用 (1 卡, batch=64, accum=8)、(2 卡,64,4)、(4 卡,64,2)。
比较还需控制模型、数据、精度、预热和质量目标，参考网站性能章节。

## 3. 两机四卡

准备两台每台至少两张可见 GPU 的 Linux 实例；代码版本、Python 环境、模型与超参数一致。
示例私网地址 A=10.0.1.10、B=10.0.1.11，应替换为实际地址。
TRAIN_OUT 是双方能读取的同一个共享 POSIX 文件系统路径；对象存储 URL 不能直接作为 Path 使用。

网络验收：两节点之间的私网双向可达；MASTER_PORT 只用于初始化会合，NCCL 还使用额外的连接和端口。
在这两个训练节点/安全组之间配置适当的通信规则，并按平台要求验证 RDMA（若使用）。不要把端口开放给公网。
本示例使用固定成员和静态 node rank，不配置弹性自动重启。

节点 A：

```bash
export NODE_RANK=0
export MASTER_ADDR=10.0.1.10
export MASTER_PORT=29500
export TRAIN_OUT=/mnt/shared/cloudinfra/run-001
export NCCL_DEBUG=INFO
bash launch_2nodes.sh
```

节点 B，在 A 启动后及时运行：

```bash
export NODE_RANK=1
export MASTER_ADDR=10.0.1.10
export MASTER_PORT=29500
export TRAIN_OUT=/mnt/shared/cloudinfra/run-001
export NCCL_DEBUG=INFO
bash launch_2nodes.sh
```

两端保持会话，等待完成。不要使用公网 IP 或把 B 的地址填入 B 的 MASTER_ADDR。
GPU 逻辑序号由 CUDA_VISIBLE_DEVICES 影响；LOCAL_RANK 是节点内序号，不是全局 RANK。

验收：start.world_size=4、effective_batch=512；每个 epoch 处理 8192 样本、16 次 optimizer 更新；
所有进程退出码为 0，rank 0 生成 checkpoint.pt；之后用同样 world size 运行恢复测试。
仅看到 torchrun 进程、GPU 显存分配或端口连通，都不构成训练成功证明。

## 4. 恢复与一致性实验

先用 CPU 路径验证固定配置的恢复逻辑：

```bash
# 完整对照已在第 1 步运行。
torchrun --standalone --nproc-per-node=2 train_ddp.py \
  --device=cpu --epochs=2 --samples=1024 --hidden=32 \
  --batch-size=32 --accum=2 --save-dir=runs/cpu-split

torchrun --standalone --nproc-per-node=2 train_ddp.py \
  --device=cpu --epochs=4 --samples=1024 --hidden=32 \
  --batch-size=32 --accum=2 --resume=runs/cpu-split/checkpoint.pt \
  --save-dir=runs/cpu-resumed

python compare_checkpoints.py runs/cpu-full/checkpoint.pt runs/cpu-resumed/checkpoint.pt
```

--epochs 是累计目标，不是追加 epoch 数；从 next_epoch=2 恢复到 4，会运行第 3 和第 4 个 epoch。
GPU 的对应恢复：两端均运行 bash launch_2nodes.sh --epochs=6 --resume="$TRAIN_OUT/checkpoint.pt"。
先在隔离的实验作业中验证，不能把 CPU 数值一致性当作跨 GPU/CUDA 版本的确定性保证。

本实验仅支持 epoch 边界、同 world size、同设备类型和同 batch 配置恢复。
它保存各 rank 的 CPU/CUDA/loader RNG，因而覆盖模型中的 Dropout。
中途故障会从最后一个已提交 epoch 重做；不提供样本级 exactly-once 或弹性成员变化恢复。

## 5. AMP 与梯度累积

FP32 验证通过后，再加 --precision=bf16（需硬件/runtime 支持），或 --precision=fp16。
FP16 使用 GradScaler；每个有效 batch 完成后才 step/update。no_sync 同时包住 forward 和 backward。
脚本强制每个 rank 的 batch 数能整除 accum，以避免末尾不足一组时梯度归一化错误。
DistributedSampler 与 DataLoader 均使用 drop_last=True；任意样本数下可能丢弃尾部样本，metrics.samples 为实际处理数。

## 6. 常见故障与证据

| 现象 | 首先检查 |
|---|---|
| 初始化一直等待 | 两端 nnodes、MASTER_ADDR/PORT 是否一致，node rank 是否重复，另一端是否退出 |
| invalid device ordinal | 可见 GPU 数、nproc-per-node、LOCAL_RANK 与设备绑定 |
| NCCL 连接超时 | 双向网络、额外通信端口、网卡选择、每个 rank 最早的异常日志 |
| checkpoint 找不到 | 所有节点是否真正挂载同一持久化路径，是否完整提交 |
| 恢复配置不匹配 | world size、batch、accum、精度、模型或数据配置是否改变 |
| 吞吐没提升 | 小模型通信开销、数据等待、不同 batch 口径与预热 |

需要时按实际网卡设置 NCCL_SOCKET_IFNAME；不要盲目复制别人的 eth0/ens5。
保留环境清单、完整命令、各节点日志和 checkpoint 元数据。不要把临时关闭 IB、P2P 等手段当作长期调优结论。

## 验证边界

实际执行结果以 validation.json 为准。本次 CPU/Gloo 两进程、连续与恢复状态对照、错误配置拒绝均通过。两端启动脚本也在同一主机上用两个启动代理、四个 CPU rank 验证；它不代表两个物理节点的网络已验证。GPU/NCCL、多物理节点网络、BF16/FP16 和 Kubernetes 部署需要在目标环境验收。
文中命令均为用户执行的实验步骤，不会自动申请云资源或产生云账单。
