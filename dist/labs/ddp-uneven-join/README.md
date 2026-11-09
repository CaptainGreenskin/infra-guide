# 一个 rank 提前读完，另一个怎样继续

输入序列分别为 [2, 8] 和 [6]。两个进程使用同一标量模型和 SGD 动量。首次更新得到参数 1、动量 −4，随后比较输入耗尽时的四种处理。

## 运行

已有 Python 3.12、PyTorch 2.5.1 和 CPU/Gloo 的环境，可直接从解压目录运行。

```bash
python -B ddp_uneven_join.py > replay.json
```

如需新建环境，在 macOS 安装 `requirements.txt`。Linux 可使用 PyTorch 官方 CPU wheel 索引，安装后确认 Gloo 可用。

```bash
python -m venv .venv
source .venv/bin/activate
# macOS
python -m pip install -r requirements.txt
# Linux 使用 CPU wheel 时
# python -m pip install --index-url https://download.pytorch.org/whl/cpu -r requirements.txt
python -c 'import torch; print(torch.__version__, torch.distributed.is_gloo_available())'
```

发布的 `validation.json` 是 macOS arm64 上 Python 3.12.13、PyTorch 2.5.1 的实跑记录。程序在临时目录用文件会合启动两个进程。第一组故意让 Gloo 等待没有匹配者的操作，约 4 秒后记录超时。这个时间仅用于本地结束反例。

## 核对什么

| 场景 | 要核对的结果 |
| --- | --- |
| `no_join` | rank 1 停止参加，rank 0 的集合操作超时。两个 rank 都只更新一次 |
| `fail_fast` | Join 检测到迭代器提前耗尽，两个 rank 都报错且只更新一次 |
| `initial_world` | 尾步除以 2，两个模型结束时均为 2.375，动量为 −5.5 和 −4 |
| `active_world` | 尾步除以 1，两个模型结束时均为 3.25，动量为 −9 和 −4 |

最后读 `initial_world` 的 `next_balanced_step`。两边都读目标 5，归约梯度同为 −2.625。直接沿用各自动量时，参数分成 3.71875 和 3.53125。重新载入同一模型快照、广播 rank 0 的动量后，双方都是 3.71875。这里的单张量同步只适用于这一参数和固定 SGD 配置。真实任务续训要处理完整优化器状态和其他训练状态。

实验范围为本机 CPU、两进程 Gloo 和固定合成输入。真实多机、GPU/NCCL、吞吐与生产超时要在目标环境另验。
