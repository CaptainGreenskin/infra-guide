# 两个 rank 上的专家分发、回包与反向

rank 0 持有词元 0、1、2 和专家 0。rank 1 持有词元 3、4、5 和专家 1。词元编号标识原输入行，固定路由为每行指定一个专家。每个进程只创建自己的一个无偏置 `Linear(2,2)`，共四项可学习参数。

| 源 rank | 原始词元顺序 | 按专家分组后发出 | 发往专家 0、1 的行数 |
| --- | --- | --- | --- |
| 0 | 0, 1, 2 | 1, 2, 0 | 2, 1 |
| 1 | 3, 4, 5 | 3, 5, 4 | 2, 1 |

一次计数交换让专家 0 得到接收划分 `[2,2]`，专家 1 得到 `[1,1]`。这两个数组分别记录来自 rank 0 和 rank 1 的行数。专家 0 收到词元 `[1,2,3,5]`，专家 1 收到 `[0,4]`。向量走 `torch.distributed.nn.functional.all_to_all_single`，另发一份整数词元编号供核对。PyTorch 2.5.1 的 Gloo 实现在提供分段大小时调用 `alltoallv`。 [PyTorch 接口](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/nn/functional.py#L158-L184) · [Gloo 分段实现](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/csrc/distributed/c10d/ProcessGroupGloo.cpp#L2452-L2478)

专家计算完后交换发送、接收划分，将结果送回原 rank。回包仍按专家分组。源 rank 先用分组排列的逆恢复输入顺序，再把每行输出和它自己的目标配对。每个源 rank 对本地各项的平方误差乘以 1/2 后求和，两个源 rank 一起反向。可求导接口在反向用互换的分段大小传梯度，专家权重由该专家处理过的所有行共同贡献梯度。 [PyTorch 2.5.1 反向实现](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/nn/functional.py#L374-L403)

词元 0 是一个跨 rank 的例子。它从 rank 0 带着输入 `[1,2]` 去专家 1，输出 `[1,4]` 回到 rank 0 后和目标 `[-2,-1]` 相减，得到输出梯度 `[3,5]`。这份梯度传回专家 1，贡献权重梯度 `[[3,6],[5,10]]`。专家 1 还累加本地词元 4 的贡献，得到 `[[-9,18],[9,6]]`。输入梯度 `[7,8]` 最终回到持有词元 0 的 rank。

## 运行

实测环境为 Python 3.12.13、PyTorch 2.5.1、CPU/Gloo、float64。在解压目录执行。

```sh
python -B -m torch.distributed.run --standalone --nproc-per-node=2 expert_parallel.py > replay.json
```

程序结束通信后由 rank 0 输出 JSON。串行参考直接按原词元顺序，用整数输入、目标和权重分别计算前向、输入梯度和权重梯度，不调用集合通信或自动求导。两份结果均用全部六个词元的半平方误差和，没有额外的 rank 平均。

| 对照 | 输出、输入梯度、专家权重梯度的最大绝对差 | 总损失 |
| --- | --- | --- |
| 恢复原输入顺序 | 0、0、0 | 101.5 |
| 保留分组顺序直接配对目标 | 6、4、6 | 111.5 |

反例复用同一批回包，两边张量均为 `[3,2]`。通信成功、张量形状相同，逐词元结果和梯度仍然会错。

[validation.json](validation.json) 记录真实收发编号、两组结果和脚本 SHA-256。每个 worker 只实例化本地专家参数，源码中的固定输入和权重数字是夹具。实验覆盖本机两进程、固定每词元一个专家及可求导的收发；路由器训练、容量限制、参数更新、物理跨机和 GPU 性能需要各自的实跑。
