# 环形传递 K/V，做完一次注意力层更新

把同一条序列均分给多个进程，每个进程只负责本地查询行。默认两进程共 1024 个位置。三进程对照共 1536 个位置，三个进程仍各持有 512 个位置。输入为固定的正弦数列，每位置 16 项。三个可训练矩阵分别投影出 Q、K、V。

## 本机复跑

在 Python 3.12 与 PyTorch 2.5.1 CPU/Gloo 环境中，从解压目录执行。

```sh
python -m torch.distributed.run --standalone --nproc_per_node=2 ring_training.py
python -m torch.distributed.run --standalone --nproc_per_node=3 ring_training.py --positions 1536
```

两个保存的 JSON 记录来自这两条命令。每个进程都独立用完整注意力和 PyTorch 自动求导计算参照。

| 环上的阶段 | 块中带着什么 | 三进程实际走几跳 |
| --- | --- | --- |
| 前向 | 一份 K、V。各进程用本地 Q 更新同一行的最大值、指数和与加权和 | 先处理本地块，送两次即可看到所有来源 |
| 反向 | 同一份 K、V，再带两份梯度累加量 dK、dV | 每到一站就加上该站 Q 产生的贡献。第三次送回原拥有者 |
| 更新 | 各位置分片的投影矩阵梯度 | 梯度求和用 AllReduce。每个进程用合并后的梯度更新同一份权重 |

只计算自己的 Q 行时，可以先算 dQ，因为这行输出就在本进程。若另一个进程的 Q 读过本进程的 K、V，就会为这些 K、V 产生梯度。漏掉远端贡献时，三进程对照中的权重梯度最大误差为约 4.07×10⁻⁴。合并贡献后，输出和权重更新都在 10⁻¹⁰ 的判定上限内。

位置区间用左闭右开表示。查看 `visited_owners`、`returned_owner`、`output_and_gradient_max_abs_errors` 和 `drop_remote_dkv_max_abs_error`。每进程每跳等待收发完成，便于逐步核对。CPU 记录只说明通信顺序与数值。

## 目标环境复验

同机两张 NVIDIA GPU、带 NCCL 的 PyTorch 及兼容驱动就绪后，可以用同一源码检查同一份输出与梯度判据。

```sh
CUDA_VISIBLE_DEVICES=0,1 python -m torch.distributed.run --standalone --nproc_per_node=2 ring_training.py --device cuda > gpu-record.json
```

多机时用 torchrun 的多节点启动参数，保证每台机器的进程都能连接会合地址。每个进程按 `LOCAL_RANK` 绑定一张可见卡，整组 `WORLD_SIZE` 必须整除 `--positions`。程序在每张卡上另外构造完整的参考矩阵，建议从小规模起步。它不适合作为显存、速度或计算通信重叠的基准。CUDA/NCCL 和物理多节点还需在目标环境复跑。

[环形注意力论文](https://arxiv.org/html/2310.01889#S3) · [PyTorch v2.5.1 点对点收发源码](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/distributed_c10d.py)
