# DDP 累积窗口中断后，从哪个微批重读

使用本机 Python 3.12、PyTorch 2.5.1 和 Gloo。把[程序](accumulation_restart.py)与[依赖清单](requirements.txt)放在同一个目录后运行。无需 GPU 或外部数据。

```sh
python -m pip install -r requirements.txt
python -B accumulation_restart.py > replay.json
# 可选。retained 必须尚不存在。
python -B accumulation_restart.py --work-dir retained > retained.json
```

入口用 `torchrun` 的实现 `torch.distributed.run` 顺序启动三个独立的本机会合，每个会合有两个 CPU 进程。默认清理临时目录。指定 `--work-dir` 会保留每组的逐进程 JSONL 和最终检查点。归档的 `validation.json` 记录了实际运行环境、源码摘要和日志内容。复跑时 PID 会变化。

## 一次更新需要两个微批

输入是 1，模型输出一个权重 `w`。四个微批按 rank 0、rank 1 排列的目标为 `[1,3]`、`[5,7]`、`[2,4]`、`[6,8]`。每 rank 每个微批只用一个样本。损失是 `(w−y)²/2`，反传前再除以累积窗口的微批数 2。窗口首个微批的前向和反向都包在 `DDP.no_sync()` 中。窗口末尾的反向同步并平均两 rank 的累积梯度。带动量的 SGD 使用 `m ← 0.5m + g`、`w ← w − 0.25m`。

第一个窗口的全局目标均值为 4，初始权重为 0，平均梯度 `g=−4`。更新后 `w=1,m=−4`。rank 0 用本机文件替换发布这份检查点，同时写入下一个微批号 2。第二个窗口处理完微批 2 的反向后，本地梯度为 `(1−2)/2=−0.5` 和 `(1−4)/2=−1.5`，此时尚未更新参数。

## 记录里找什么

| 路径 | 第二个窗口实际参与更新的微批 | 最终权重 | 最终动量 |
| --- | --- | ---: | ---: |
| `continuous` 连续执行 | 2、3 | 2.5 | −6 |
| `replay_window` 从已提交游标重读 | 2、3 | 2.5 | −6 |
| `skip_consumed` 从已消费游标续跑 | 3 | 2.25 | −5 |

两个故障组在微批 2 反传后让 rank 1 退出 73。检查 `launcher.worker_failures` 和 `stopped_peers`，可见启动器让另一进程收到 SIGTERM，并用新进程组成下一次 `attempts`。旧进程的 `cut` 和新进程的 `start` 绑定同一个检查点摘要。两组新进程均加载 `next_micro=2,w=1,m=−4`，`grad_is_none` 为真。故障前后的 `backward.sample_id` 说明每个 rank 实际读取了哪个样本。

错误对照从旧进程的消费记录得出下一微批为 3，于是跳过了微批 2。原窗口大小仍为 2，最后两个局部梯度 `−2.5`、`−3.5` 平均后为 `−3`，得到 `m=−5,w=2.25`。完整回放的梯度为 `−4`，得到 `m=−6,w=2.5`。两组都能走到下一个提交，样本、梯度和最终状态对照才能发现缺失。

实跑范围为本机固定两 rank、固定可重建输入和完整更新窗口处的检查点。若要从窗口中间恢复，需要另行定义各 rank 的部分梯度、累积位置、随机状态和输入状态。本实验使用本机文件替换处理进程退出。跨主机共享存储和掉电持久性需要另外验证。只加载本次自己生成的可信检查点。

[PyTorch 2.5.1 DDP 源码](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/nn/parallel/distributed.py) · [PyTorch 2.5.1 torchrun 源码](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/run.py)
