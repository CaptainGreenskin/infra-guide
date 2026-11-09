# 不等长位置分片的环形注意力

每个进程只计算自己持有的查询位置。不同进程的真实位置数可以不同。实验把 K/V 通信包补到同一长度，并单独发送三个 int64 字段 `[owner, start, count]`。它们分别是原拥有者、全局起点和有效行数。收到包后，同时判断这一行是否有效、是否在查询的因果范围内。

## 复跑

需要 Python 3.12、PyTorch 2.5.1 和 Gloo。解压后进入实验目录运行。

```sh
python3 -B record.py --output ./replay.json
```

`record.py` 每次都启动新进程组，并按顺序运行以下三项。`--standalone` 为本次运行建立本机会合。可将结果写到其他路径，便于与包里的 `validation.json` 分开比较。

| 名称 | 真实位置数 | 各进程位置数 | 每个 K/V 包行数 | 本次退出结果 |
| --- | ---: | --- | ---: | --- |
| `two-ranks` | 1025 | 512、513 | 513 | 通过，launcher 退出 0 |
| `three-ranks` | 1537 | 512、512、513 | 513 | 通过，launcher 退出 0 |
| `unmasked-padding` | 1025 | 512、513 | 513 | 只移除有效行判断，验收拒绝，launcher 退出 1 |

如只想复跑其中一项，可直接执行如下命令。最后一条会打印结构化拒绝原因并返回非零状态。

```sh
python3 -B -m torch.distributed.run --standalone --nproc_per_node=2 ring_ragged.py --positions 1025
python3 -B -m torch.distributed.run --standalone --nproc_per_node=3 ring_ragged.py --positions 1537
python3 -B -m torch.distributed.run --standalone --nproc_per_node=2 ring_ragged.py --positions 1025 --unsafe-padding
```

## 读结果

- 位置区间左闭右开。`forward_headers` 和 `backward_headers` 记录每一步实际读取的包头。每个进程先计算自己的块，再逐次读前一个进程送来的块。前向只需传 `world_size - 1` 次。反向用 `world_size` 次，`returned_header` 应与本进程自己的头相同。返回的 dK/dV 只取有效行。
- `errors` 分别对照完整注意力的输出、损失、Q/K/V 梯度、投影矩阵梯度和一次更新。每个进程独立构造全序列，用 PyTorch 自动求导得到参考。正确运行的每项误差均不超过 `1e-10`，填充行梯度为零。`drop_remote_dkv_max_abs_error` 另记只留下本地贡献时的误差。
- 拒绝用例仍有合法的通信形状。零 K 给出有限的零分数，漏挡后其指数参与分母。额外的 V 虽是零，真实值在分母中的比例也变了。查看 `reasons`、rank 1 的 `errors.output` 和返回 rank 0 的 `padding_gradient_max_abs`，三项分别说明判据、受影响的查询和不该出现的梯度。
- 包头固定 24 字节。特征宽度 16，数据是 float64。前向每多补一行，每次多发送 `2×16×8=256` 字节。反向随包带 dK、dV，每补一行多发送 `4×16×8=512` 字节。这里只数应用层数据，Gloo 协议开销不计。

实测范围为本机 CPU/Gloo、逐跳等待、单条因果序列和一次参数更新。完整参考矩阵在每个进程都存在。复跑用于核对数值、分片边界与所有权。显存、计算通信重叠和 GPU/NCCL 性能需要单独的目标环境实验。

[Ring Attention 原论文](https://arxiv.org/html/2310.01889#S3) · [在线 Softmax 归一化原论文](https://arxiv.org/abs/1805.02867) · [PyTorch 2.5.1 点对点收发实现](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/distributed_c10d.py)
