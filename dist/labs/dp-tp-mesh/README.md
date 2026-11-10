# 四个进程怎样更新两个数据副本

使用 Linux 或 macOS、Python 3.10–3.12 和支持 Gloo 的 PyTorch 2.5.1。无需 GPU。

```sh
python -m pip install -r requirements.txt
python dp_tp_mesh.py > report.json
```

四个进程在本机通过 Gloo 回环连接，组成名为 `dp`、`tp` 的二维设备网格。TP 组 `[0,1]`、`[2,3]` 各处理一份数据。DP 组 `[0,2]`、`[1,3]` 分别同步同一个参数分片的两个副本。程序用 `ColwiseParallel` 切第一层，用 `RowwiseParallel` 切第二层。`nn.Linear.weight` 保存数学权重的转置，因此第一层权重按第 0 轴切，第二层按第 1 轴切。第二层的偏置是复制参数。

两个数据副本分别处理第 0 行和第 1、2 行，预测为 `[12,5]`、`[11,6]`、`[13,4]`。两个副本的平方误差和为 117 和 54。整批有 3 行、每行 2 项，平均平方误差为 `(117+54)/6=28.5`。DDP 会把两个成员的梯度取平均，因此每个副本反传 `本地平方误差和 × 2 / 6`。同一输入在 TP 组的两边都有，整批仍只有三行样本。

`validation.json` 保留各 rank 实际组成员、输入行、预测、梯度及更新后权重。三组都从同样的初值开始。

| 对照 | rank 0 第一层权重首行梯度 | 为什么 |
| --- | --- | --- |
| 正确的样本权重与 DP 组 | `[5,7]` | 与整批单进程参考逐项一致 |
| 每个副本各算均值，再由 DDP 平均 | `[6,9.75]` | 给一行和两行的两个副本相同权重 |
| 保持正确分母，改到 TP 组平均梯度 | `[8,16]` | 形状相同的两个梯度分片对应不同参数 |

错误组对照在前向和反向时使用 `DDP.no_sync()` 跳过 DDP 的梯度同步，随后实际调用 TP 组的 `all_reduce`。三个对照的前向结果相同。正确性要从梯度和更新后权重确认。

在 PyTorch 2.5.1 中，DDP 使用切出的 DP 网格时，在前向内为张量并行重建带分片信息的 DTensor。程序先保存 DDP 包装后用于优化器的本地参数引用，再执行一次前向和反向。此实验只验收一次固定 SGD 更新，检查点、GPU/NCCL、跨主机和性能另验。

- [PyTorch 2.5.1 张量并行 API](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/tensor/parallel/api.py#L22-L61)
- [PyTorch 2.5.1 DDP 的子网格入口](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/nn/parallel/distributed.py#L658-L688)
- [PyTorch 2.5.1 DDP 与 TP 的参数转换](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/tensor/parallel/ddp.py#L37-L105)
