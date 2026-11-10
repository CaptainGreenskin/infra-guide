# 两个进程训练同一份模型

在 Linux 或 macOS 上使用 Python 3.10–3.12。安装 PyTorch 2.5.1，确认 `torch.distributed.is_gloo_available()` 为真。只需 CPU。

```sh
python -m pip install -r requirements.txt
python pipeline_schedules.py > report.json
```

两个进程通过临时 FileStore 建组，Gloo 连接使用本机回环接口。程序依次运行 GPipe、1F1B 和错误分母对照。每次用同样的初始权重、四条输入和目标，训练一次。进程 0 用 Linear 和 ReLU 产生两个隐藏值，进程 1 用另一层 Linear 得到预测。每条样本是一个微批。单进程参考把两段连起来，整批计算平均平方误差，并做一次相同的 SGD 更新。

PyTorch 2.5.1 的 1F1B 会把一次发送和一次接收一起提交。这个版本的 `_batch_p2p()` 只保留最后一个通信句柄。在实测的 macOS/Gloo 环境，原样执行 1F1B 时，libuv 无法锁定已释放的发送缓冲区，进程退出。本实验给 1F1B 加了一个本地适配器，保留并等待批次中的每个句柄，仍由 PyTorch 决定前向和反向的顺序。GPipe 继续使用原版通信助手。报告里的 `p2p_work_policy` 区分两条路径。

- `events` 是每个进程本地完成的调用顺序。`F0` 表示微批 0 完成前向，`B0` 表示它完成反向。跨进程的先后关系由发送与接收约束，不能靠两份列表拼出墙钟时序。
- `pending_after_each_event` 计数已前向、还没反向的微批。GPipe 的两阶段峰值各为 4，1F1B 分别为 2 和 1。这个计数只说明逻辑激活的寿命，不测 CPU RSS、GPU 显存或运行时间。
- 正确的两种排程都给出 `[1, -1.75, 0.75, -1]`，平均平方误差 `0.390625`，逐项对照梯度和更新参数。错误对照在每个微批各自求均值。在本版本中四份梯度累加，导致梯度为整批参考的四倍。预测相同仍可能更新错。

`validation.json` 是实际运行记录，附输入、预测、梯度、更新、排程与源码摘要。模型、微批数和等长条件固定。GPU、NCCL、跨宿主、异步更新与吞吐需要另行实验。

- [PyTorch 2.5.1 的批量通信助手](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/pipelining/schedules.py#L517-L524)
- [PyTorch 2.5.1 的 GPipe 与 1F1B 排程实现](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/pipelining/schedules.py#L673-L885)
- [PyTorch 2.5.1 的阶段前反向](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/pipelining/stage.py#L554-L699)
