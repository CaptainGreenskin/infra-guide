# 手工训练状态分片

环境：Python 3.12、PyTorch 2.5.1，CPU/Gloo。保存完整目录后运行：

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python shard_linear.py
.venv/bin/python shard_linear.py --wrong-rank-mean
```

最后一条是故意错误的分母，应以非零状态退出，错误指向全局梯度对照。

两个实际子进程分别持有两层参数、梯度与 SGD 动量的一半。每次计算前真实
all-gather 参数；反向使用完整梯度 all-reduce 后截取本进程分片。三次更新逐项
对照完整批次参考的梯度、参数和动量。两个进程分别读 1 与 2 条样本。

为独立对照，实验还保留完整参考模型，所以进程总内存不能用来说明分片收益。
这是手工算法，未调用 FSDP。特别注意：全梯度 all-reduce 后切片并不具有原生
reduce-scatter 的通信与临时内存特性。报告只统计状态元素，不测 GPU 显存、
CUDA 通信重叠、FSDP API 或跨规模检查点。
