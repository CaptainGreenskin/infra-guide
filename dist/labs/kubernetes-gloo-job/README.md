# 一个训练 Job 在两个节点上更新一次参数

沿同一个 Indexed Job 观察三步。第一步只允许一个工作节点，一个 Pod 已绑定，另一个 Pod 的调度条件仍为 `Unschedulable`。第二步只给另一个节点加标签，让原先等待的 Pod 继续绑定。第三步检查两个索引对应的 rank 是否建立同一 Gloo 组，并完成同一个参数更新。

## 复跑

准备运行着的 Docker、kind 0.33.0、kubectl 1.35.8 和 Python 3.9+。需要下载 kind 节点镜像和 PyTorch CPU 依赖。解压后运行以下命令。

```sh
python3 -B observe_job.py --output ./my-validation.json
```

程序构建训练镜像，创建独立 kind 集群和独立 kubeconfig，结束时删除该集群。kind 使用一个控制面容器和两个工作节点容器。Docker 中会保留构建的训练镜像。集群资源和日志由脚本核对，目标环境是 Linux x86_64 上的 Docker。

## 核对结果

1. `before` 里有两个不同索引。其中一个有节点名，另一个的 `pod_scheduled.reason` 为 `Unschedulable`。
2. `after` 是相同的两个 Pod UID。两者落在不同的工作节点，分别为 `Succeeded`。Job 自身也保存两个完成索引。
3. 两份实际容器日志都把 `training-ddp-0.ranks` 解析到索引 0 的 Pod IP，且都在组里看见 4 个样本。
4. 权重初值为 1。输入都是 1，索引 0 的目标为 `[0]`，索引 1 的目标为 `[3, 3, 3]`。四个逐样本梯度分别是 `1, -2, -2, -2`，均值为 `-1.25`。学习率 0.1 时两个 rank 的新权重均为 1.125。

`job.json` 是真实提交给集群的 Service 和 Job。`rank_step.py` 是容器里的完整程序，`observe_job.py` 负责环境创建、放开第二节点以及取证。`validation.json` 保留一次 CI 的 Pod、Job 和容器日志记录。也可单独用装有 PyTorch CPU 的本机环境运行下列命令，只复验两个进程的数值。

```sh
python -m torch.distributed.run --standalone --nproc-per-node=2 rank_step.py
```

实验范围是同一 Linux 宿主上的两个 kind 节点、CPU/Gloo、固定输入和一次更新。GPU 设备分配、NCCL、物理机间网络与弹性恢复需各自验收。
