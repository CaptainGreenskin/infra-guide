# 两个本地启动器，四个 CPU 训练进程

先读网页中启动器、全局 rank、本地 rank、通信组与检查点的关系，再运行本程序。它让两个真实 `torchrun` 启动器各创建两个 CPU/Gloo worker；两个启动器和全部 worker 都在同一台机器上。`launch_worker.py` 只记录实际分配的环境，再执行与原 DDP 实验逐字相同的 `train_ddp.py`。

## 运行

Linux/macOS，Python 3.10—3.12，PyTorch 2.5.1。已有匹配环境可直接运行：

```sh
python verify_launch.py --report run-report.json
```

缺少依赖时，在自己的虚拟环境安装。macOS：`python -m pip install -r requirements.txt`；Linux 可用官方 CPU 包：`python -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu`。程序启动自己的临时进程组、使用空闲回环端口和临时目录；每次双启动器运行最多90秒，超时只停止其自行创建的进程组，退出后清理临时检查点。不要在已有 `torchrun` worker 中运行监督程序。

## 先算再看

两个启动器的 group rank 分别为0、1，各有 local rank 0、1，四个全局 rank 为0、1、2、3。记录中的 `(rank, local_rank, group_rank)` 应为：

```text
(0,0,0), (1,1,0), (2,0,1), (3,1,1)
```

固定8192个样本，四个rank各2048个；每rank小批64、累积2次，故每轮32个小批、16个更新窗口，有效全局batch为512。一次全局更新中，四个worker各执行自己的优化器调用；每rank调用次数不能再乘四后当作全局更新次数。

程序比较连续两轮和“一轮保存、退出，再恢复到第二轮”。每rank分别为32次和16+16次实际优化器调用。原trainer汇集四份随机状态，由rank0保存完整检查点；恢复时每rank独立读取同一文件。

## 本次结果与验收口径

`validation.json` 保留了严格逐位比较的**失败**：连续两轮与1+1轮的浮点状态存在微差，最大绝对误差约 `7.45e-9`。同一次监督程序内，两次独立连续运行则逐位相等。差异的具体原因尚未定位，这些观察不足以证明由哪一种通信算法导致。

因此报告并列两种结论：

- **逐位一致性未达成**，原比较器的非零退出和差异字段完整保留。
- **声明的数值契约通过**：仅本小型CPU程序的模型与Adam浮点张量用绝对误差 `1e-6`、相对误差0比较；形状、类型、配置、计数及全部rank随机状态仍要求完全一致。该阈值不是任意模型的质量或恢复保证。

监督程序还执行三项反例：恢复时将累积次数改为4，应被配置签名拒绝；保持权重不变但改Adam一阶矩，严格比较器应拒绝；只改rank1随机状态的一个字节，也应拒绝。后两项以未修改的恢复产物为基线，分别隔离自己的差异。

## 文件与范围

- `verify_launch.py`：创建两个启动器，记录进程关系、训练结果、完整比较及反例。
- `launch_worker.py`：记录真实环境编号，执行原trainer。实际主机名只用于临时同宿主检查，随后移除，不进入公开报告。
- `train_ddp.py`、`compare_checkpoints.py`：与既有DDP包的规范源码完全相同。
- `validation.json`：本次源文件摘要、命令、观测与边界。复跑会生成自己的 `run-report.json`，不覆盖这份固定记录。

隐藏层32、合成分类数据、FP32、epoch边界正常保存。没有执行物理两机网络、GPU/NCCL、真实大模型、任意微批崩溃、掉电或Kubernetes。两机四卡命令、共享存储和集群网络仍按网页的目标环境手册分别验收。

官方依据：[固定PyTorch2.5.1 torchrun说明与实现](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/run.py)。本包的原trainer负责设备映射、采样、梯度同步与保存，启动器不会自动替代这些应用逻辑。
