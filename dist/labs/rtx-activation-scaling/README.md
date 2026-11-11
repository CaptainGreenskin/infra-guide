# 重计算的两组单卡实测

这里重读配套项目 [one-gpu-lm 实验 010](https://github.com/CaptainGreenskin/one-gpu-lm/blob/2fbbf69d815cf7846410dc3246f15b19c3ccec23/experiments/010-7b-context-scaling/results/2026-11-09/README.md) 的原始测量。随附 [runs.csv](runs.csv) 是上游同名文件的逐字节副本，包含 48 个独立进程。这个目录提供离线复算数据，GPU 测量来自配套项目的 RTX PRO 6000 Blackwell 工作站。

## 在本机复算

把 `runs.csv` 放在当前目录，用 Python 3 标准库执行。先保留全参数 Adafactor 的两组输入长度。对每个长度和开关分别取三次进程测量的中位数，再把峰值字节除以 2³⁰。

```python
from csv import DictReader
from statistics import median

with open("runs.csv", newline="", encoding="utf-8") as stream:
    rows = list(DictReader(stream))
for length in ("2048", "4096"):
    for checkpoint in ("False", "True"):
        group = [r for r in rows if (r["mode"], r["sequence"], r["checkpoint"], r["status"])
                 == ("full-adafactor", length, checkpoint, "ok")]
        assert sorted(int(r["repeat"]) for r in group) == [0, 1, 2]
        peak = median(int(r["peak_allocated_bytes"]) for r in group)
        rate = median(float(r["tokens_per_second"]) for r in group)
        print(length, checkpoint, f"{peak / 2**30:.2f} GiB", f"{rate:.1f} token/s")
```

| 输入长度 | 关闭重计算 | 开启重计算 |
| ---: | --- | --- |
| 2048 | 26.97 GiB，3975.1 token/s | 26.97 GiB，3479.3 token/s |
| 4096 | 33.92 GiB，4479.4 token/s | 27.22 GiB，3877.6 token/s |

2048 组的两个字节中位数为 28,954,845,184 和 28,955,893,760，相差 1 MiB，按 GiB 保留两位小数后相同。4096 组降低 7,197,105,152 字节，约 6.70 GiB。

## 对照测量口径

- 正式记录的设备是 RTX PRO 6000 Blackwell Workstation Edition，驱动 595.99.02，Python 3.10.12，PyTorch 2.14.1+cu130。使用批大小 1、固定种子的合成输入和随机初始化的 7,028,273,152 参数模型。全参数路径使用 BF16 权重及梯度和 Adafactor。训练质量及长时间收敛另需数据。
- `peak_allocated_bytes` 来自 `torch.cuda.max_memory_allocated()`。程序在初始化模型前重置峰值，在训练结束时读取。这里计 PyTorch 已分配显存，包含初始化与热身期间的分配。CSV 的 `peak_reserved_bytes` 另记分配器保留的内存，设备工具的总占用又是另一个口径。
- 每个进程做 2 步热身和 6 步计时。计时从清梯度开始，覆盖前向、损失、反向、梯度检查与裁剪、优化器更新及同步。合成词元的生成和上传在计时之前。吞吐是后 6 步处理的词元数除以这 6 步的总秒数。
- 正式记录的 24 组配对均通过数值审计。比较输入和初始参数采样摘要、每步损失和梯度范数。首批有 6 组完成配对，其中 4 组超过预设的损失差上限 0.001，整批从正式统计排除。正式测量开启确定性算法，原门槛保留。

## 来源与复跑

测量代码固定在 [583ec7fde7a7aa894469515018c235862e13ccc3](https://github.com/CaptainGreenskin/one-gpu-lm/tree/583ec7fde7a7aa894469515018c235862e13ccc3/experiments/010-7b-context-scaling)。归档的 [源码摘要](https://github.com/CaptainGreenskin/one-gpu-lm/blob/2fbbf69d815cf7846410dc3246f15b19c3ccec23/experiments/010-7b-context-scaling/results/2026-11-09/sources.json) 对应该提交。后续归档还更新了报告代码，测量输入与原始逐次指标保持固定。

- [原始 runs.csv](https://github.com/CaptainGreenskin/one-gpu-lm/blob/2fbbf69d815cf7846410dc3246f15b19c3ccec23/experiments/010-7b-context-scaling/results/2026-11-09/runs.csv) SHA-256 为 `5248e3ed2ae11c94a8212eb7bba917df56c6a87b37c75cf887ec56d379a65786`。
- [配对审计](https://github.com/CaptainGreenskin/one-gpu-lm/blob/2fbbf69d815cf7846410dc3246f15b19c3ccec23/experiments/010-7b-context-scaling/results/2026-11-09/summary.json) 与[首批失败记录](https://github.com/CaptainGreenskin/one-gpu-lm/blob/2fbbf69d815cf7846410dc3246f15b19c3ccec23/experiments/010-7b-context-scaling/results/2026-11-09/aborted-nondeterministic/README.md) 分开保存。
- 可用 4096 词元第 0 次重复的两份进程记录核对 8 步损失、梯度范数与 6 步计时。[关闭重计算](https://github.com/CaptainGreenskin/one-gpu-lm/blob/2fbbf69d815cf7846410dc3246f15b19c3ccec23/experiments/010-7b-context-scaling/results/2026-11-09/full-adafactor-s4096-ac0-r0.json) · [开启重计算](https://github.com/CaptainGreenskin/one-gpu-lm/blob/2fbbf69d815cf7846410dc3246f15b19c3ccec23/experiments/010-7b-context-scaling/results/2026-11-09/full-adafactor-s4096-ac1-r0.json)
- [目标设备复跑步骤](https://github.com/CaptainGreenskin/one-gpu-lm/blob/2fbbf69d815cf7846410dc3246f15b19c3ccec23/experiments/010-7b-context-scaling/README.md) 给出协议、启动命令和显存门槛。在只读已有结果时，直接用上面的标准库代码。
