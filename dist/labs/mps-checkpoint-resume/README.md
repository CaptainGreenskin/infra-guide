# 同一个 TinyDecoder 在 Apple GPU 上保存并续训

本实验沿用 Transformer 入门的 664 参数 TinyDecoder，以及训练交接实验的两条输入、两组监督位置。每组都含四个有效目标。每步在 Apple GPU 上随机选一组，再完成前向、反向和 SGD 更新。把随机选择留在设备上，可以单独核对 GPU 随机状态对续训的影响。模型仍关闭注意力 dropout。

## 复跑

在配有 Apple GPU 的 macOS 上解压，进入实验目录：

~~~sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B mps_resume.py > replay.json
~~~

程序校验原模型源码摘要，要求 PyTorch 2.5.1 且 MPS 可用。MPS 是 PyTorch 在 Apple GPU 上的设备后端。程序在导入 PyTorch 前关闭 CPU 回退；参数、候选分数、梯度和动量都检查设备。计算用 FP32。检查点只写到本次临时目录，加载时先放在 CPU，再恢复到 MPS。只加载本次生成的可信文件。

## 看第 3 步之后发生什么

连续组走完六次更新。保存组走完三次更新，把模型参数、动量、MPS 随机状态和下一步游标一起写入，进程退出。新进程从这份检查点继续。两条额外路径也读同一份文件，分别省去动量或 MPS 随机状态。五条路径都是真实子进程。

| 续训方式 | 后三次选中的监督组 | 最终参数最大绝对差 |
| --- | --- | ---: |
| 完整恢复 | 0、1、1 | 0 |
| 省去动量 | 0、1、1 | 0.132311 |
| 省去 MPS 随机状态 | 1、0、0 | 0.042470 |

连续运行的六次选择是 1、0、0、0、1、1。完整恢复的后三次损失与连续运行逐次一致，最终动量的最大绝对差也是 0。两条负例开始时都加载了同一份模型权重。

`validation.json` 保留每步的监督组编号、损失、一个实际梯度与参数探针、设备名，以及各阶段完整模型和动量的字节摘要。程序在内存逐项比较 664 个参数和对应的动量。这里比较的是同一台 M4 Pro 的连续与恢复路径。结果覆盖更新完成后正常退出的单设备训练，未测写入中途崩溃、NCCL 或物理多机。

[固定 PyTorch 的 MPS 随机状态接口](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/mps/__init__.py) · [固定 PyTorch 的优化器状态加载](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/optim/optimizer.py)
