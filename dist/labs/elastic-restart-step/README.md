# 一个训练进程退出后，从哪一步继续

使用 Linux 或 macOS、Python 3.10–3.12 和支持 Gloo 的 PyTorch 2.5.1。

```sh
python -m pip install -r requirements.txt
python elastic_restart.py > report.json
```

程序用 `torch.distributed.run` 启动两个 CPU 进程，也就是 `torchrun` 的实现入口。每组实验有独立的临时目录和本机会合端点。两个进程每步各用一个样本，输入均为 1，目标依次为 `[1,3]`、`[2,4]`、`[3,5]`。初始权重为 0，SGD 学习率为 `1/8`，动量系数为 `1/2`。

进程 0 负责提交检查点。它在两边完成更新后把模型、优化器和下一个输入位置写入临时文件，再用原子替换发布。第 2 步的故障对照让两个进程都先得到内存中的权重 `1.375`，此时检查点仍是第 1 步的权重 `0.5`、动量 `-4`。进程 1 随后以 73 退出。进程 0 没有主动退出，启动器向它发出 `SIGTERM`。两份新进程记录的 `restart_count` 都是 1。

| 对照 | 第 2 步实际执行次数（每进程） | 最终权重 | 最终动量 |
| --- | --- | --- | --- |
| 连续训练 | 1 | 2.46875 | -8.75 |
| 自动重启，读取完整状态 | 2 | 2.46875 | -8.75 |
| 自动重启，只恢复权重和输入位置 | 2 | 2.15625 | -8.25 |

检查 `attempts` 中的进程号、输入编号和 `commit` 记录。故障组第 2 步在旧进程算过一次，重启后用同一批输入再算一次，只有新进程发布了第 2 步的检查点。`validation.json` 保留启动器读出的失败退出码和健康进程终止信号、每次尝试的记录以及最终状态。复跑时 PID 会变，固定输入和结果可逐项比较。

实验覆盖单宿主、固定两进程、一次真实进程故障和步边界的原子文件替换。共享存储、掉电持久性、改变进程数量、跨主机和 GPU/NCCL 需要另外验证。

- [PyTorch 2.5.1 torchrun 的运行和故障说明](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/run.py)
- [PyTorch 2.5.1 启动器处理失败进程的源码](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/elastic/multiprocessing/api.py#L855-L912)
