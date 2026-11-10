# 预取已经跑到第 4 批，恢复从哪一批开始？

需要 Python 和 PyTorch 2.5.1。实验只用 CPU，在临时目录里启动并回收训练进程和 DataLoader worker。

```sh
python -m pip install -r requirements.txt
python -B prefetch_resume.py --output replay.json
```

固定十二条样本，每批两条，编号从 0 开始。DataLoader 使用两个 worker，每个 worker 的预取系数是 2。组批函数每整理完一批，另发一条带批号和 PID 的记录。这个记录只表示 worker 整理完毕，训练进程可能还没有收到它。

第一批取出后，加载器会再安排一批。训练进程只用第 0 批更新参数，等组批日志证实 0 到 4 都已准备，再保存权重、SGD 动量、输入身份与下一批编号 1，随后退出。恢复时，新进程和新 worker 从第 1 批重建同一输入。数据变换按固定轮次与样本 ID 生成目标偏移量，与哪个 worker 取样无关。

| 对照 | 实际更新的批号 | 最终参数 |
| --- | --- | ---: |
| 连续训练 | 0、1、2、3、4、5 | 7.361175537109375 |
| 按保存的下一批恢复 | 0，重启后 1、2、3、4、5 | 7.361175537109375 |
| 按 worker 整理进度恢复 | 0，重启后只有 5 | 2.9296875 |

可以手算第一步。目标是 4.5 和 1.25，初始权重为 0。损失取两项 `(w−y)²/2` 的均值，梯度是 `w−mean(y)=-2.875`。首步动量缓冲为该梯度。学习率 0.25 使权重更新到 0.71875。恢复后先从检查点读回这两项，再对第 1 批执行更新。即使第 1 批换给另一个 worker，目标仍是 8.75 和 3.75。

在 `validation.json` 中看 `stopped.prepared`、`stopped.updates` 和 `resumed.loaded`。比较 `baseline.updates` 与 `stopped.updates` 加上 `resumed.updates`，每一步的梯度、动量和权重都应相同。错误对照加载同一个检查点，但用整理完的最高批号推得 5，跳过了没有参与参数更新的四批。

这是一个训练进程内有两个加载 worker、固定顺序、按样本 ID 可重建的数据集。实验保存的是优化器更新边界，不保存加载器内部队列。流式数据、随机状态随 worker 推进、累积梯度或跨 rank 变更，需要另行定义可恢复状态。

[PyTorch 2.5.1 的初始预取与批次交付](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/utils/data/dataloader.py#L1393-L1416)
