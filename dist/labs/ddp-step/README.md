# 一次DDP更新，为什么两个副本会走到同一个参数

使用两个真实本地CPU进程和Gloo，比较四个单步实验。无需GPU、模型下载或云账号。
基线：Python 3.12、PyTorch 2.5.1；请在独立环境中安装PyTorch。没有验证其他版本。

```sh
python3.12 -m venv .venv
# Windows使用.venv\Scripts\python，以下为macOS/Linux命令。
.venv/bin/python -m pip install torch==2.5.1
.venv/bin/python ddp_step.py --output runs/ddp-step-report.json
```

脚本自行创建两个进程，无需再套torchrun。Gloo需要本机进程间通信；数据和会合文件位于临时目录，退出后清理，报告保存在指定位置。

每个样本输入x=1，模型只有一个权重w=1，损失为0.5×(w−y)²，SGD学习率0.1。
一个样本对w的梯度是w−y。先用纸笔算，再对照报告：

| 场景 | rank 0标签 | rank 1标签 | 反向后的梯度 | 更新后的权重 |
| --- | --- | --- | --- | --- |
| equal_ddp | [0,2] | [2,4] | 两者都是−1 | 两者都是1.1 |
| equal_independent | [0,2] | [2,4] | 0、−2 | 1、1.2 |
| unequal_naive | [0] | [3,3,3] | 两者都是−0.5 | 两者都是1.05 |
| unequal_corrected | [0] | [3,3,3] | 两者都是−1.25 | 两者都是1.125 |

等量样本情况下，默认DDP平均各rank梯度可对应全局样本均值。非等量情况下，每个rank先取局部均值会改变各样本权重。
修正方案对每个rank反传 world_size × local_loss_sum / global_sample_count，再由DDP取平均。
这里count来自真实样本数；迁移到语言模型时，还要处理标签移位、ignore_index、有效token和损失权重。

验收包含独立手算常量、两进程结果、单进程全局batch结果，以及关闭DDP的反例。所有比较使用float64和1e−12绝对容差。
local_mean_loss仅是本地损失日志；它不等于全局loss，也不一定等于实际反传的缩放标量。

边界：仅验证固定两进程、一个参数、一次SGD更新的同步和归一化；不测试GPU、NCCL、多物理节点、吞吐、梯度累积、不等迭代次数或真实模型收敛。
validation.json记录执行环境、结果与脚本SHA256。程序变化后需要重跑验证。
