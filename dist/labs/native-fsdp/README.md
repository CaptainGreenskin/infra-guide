# 两个进程怎样分片同一次训练更新

一个线性层有四个权重和两个偏置。两个 CPU 进程都使用原生 FSDP 的 `FULL_SHARD`，正常计算时取齐这一层的参数，各自处理分到的样本。反向后，每个进程拿到自己负责的梯度片，再用本地 Adam 历史更新自己的参数片。

## 运行

实测使用 Python 3.12.13、PyTorch 2.5.1 和本机 CPU/Gloo。源码在两个真实进程中执行，不需要下载权重或数据。

```sh
python -B -m torch.distributed.run --standalone --nproc_per_node=2 fsdp_lab.py > replay.json
```

## 同一个目标怎样分给两个进程

权重矩阵 `W=[[1/4,−1/2],[3/4,1/8]]`，偏置 `b=[0,0]`。每行两个标量目标，单项损失为 `½(预测−目标)²`。两次更新使用同一批输入。

| 进程 | 输入 `x` | 目标 `y` | 标量目标数 |
| --- | --- | --- | ---: |
| rank 0 | `[1,2]` | `[0,1]` | 2 |
| rank 1 | `[0,−1]`、`[2,1]` | `[1,0]`、`[−3/4,1]` | 4 |

例如第一个权重的三个目标贡献是 `−3/4`、`0` 和 `3/2`，合计 `3/4`，除以全批六项得到 `1/8`。FSDP 默认对两个进程的梯度取平均。各进程先用 `2×本地损失总和/6` 反向，取平均后就得到全局六项的平均梯度。若直接用各自的局部均值，rank 0 的每项分到 `1/4` 的权重，rank 1 的每项只分到 `1/8`。

| 展平位置 | 正确梯度 | 错误的局部均值 |
| --- | --- | --- |
| rank 0 的前三项 | `[1/8, −1/24, 5/24]` | `[0, −7/32, 5/32]` |
| rank 1 的后三项 | `[1/8, −1/12, 1/12]` | `[3/32, −5/32, 1/16]` |

错误分支实际执行了 FSDP 反向，最大绝对偏差为 `17/96`，约 `0.1770833`。清除反例梯度后，再执行两次正确更新。

## 从参数片到完整状态

本例将 `weight` 的四项和 `bias` 的两项依次展平，切成 `3+3`。进入实际线性层时，前向钩子看到了 `weight [2,2]` 和 `bias [2]`。前向返回后，每个进程的参数视图恢复为三项。反向后梯度片也是三项。Adam 在每个进程保存三项一阶矩、三项二阶矩和一个步数标量。参数视图变短只说明逻辑分片，此版本的根 FSDP 包装器可以保留前向聚合的缓冲区供反向使用。 [FULL_SHARD 语义](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/fsdp/api.py#L29-L38) · [根包装器的重分片实现](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/fsdp/_runtime_utils.py#L454-L468)

本机的 CPU Profiler 每步记录一次 `c10d::allgather_` 和一次 `c10d::_reduce_scatter_base_`。本版本 Gloo 还记录一次 `gloo:all_reduce`，因为它在这个调用中先归约完整输入，再取本 rank 对应的输出片。框架调用表达的是归约并分片的语义，底层怎样传输由后端决定。 [Gloo 2.5.1 实现](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/csrc/distributed/c10d/ProcessGroupGloo.cpp#L1807-L1849)

每次更新后，两个进程都调用 `get_state_dict(model, optimizer, options=StateDictOptions(full_state_dict=True))`。此处 `cpu_offload` 保持默认值 `False`，两个进程都拿到完整 `weight`、`bias` 和按原参数名整理的 Adam 历史。普通未分片模型独立在三行全批上计算输出、梯度和 Adam 更新，逐项核对本地片与完整状态。 [完整状态选项](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/state_dict.py#L309-L319) · [按参数名重建状态](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/state_dict.py#L966-L990)

[validation.json](validation.json) 保存实际梯度、两次更新、各 rank 的参数与 Adam 状态、Profiler 事件和源码 SHA-256。验收用绝对误差 `1e-12`、相对误差 `0`。此次最大梯度差约 `1.39e-17`，最大完整参数差约 `6.94e-18`。实验范围是单机 CPU/FSDP1 的更新和内存中完整状态重建。CUDA/NCCL、显存峰值、重叠收益、落盘恢复和成员数改变需要各自的运行证据。
