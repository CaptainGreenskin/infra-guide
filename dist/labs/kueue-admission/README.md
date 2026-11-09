# 一个 Job 从额度等待到两份输出

目标作业的两个 CPU Pod 各申请 100m。队列总额度为 200m，初始已被一个占位作业全部使用。保留同一个目标 Job，每次只改变一个条件，观察下一层是否推进。

| 干预 | Workload、Job、Pod 与结果 |
| --- | --- |
| 保持占位作业运行 | 目标 Workload 等队列额度，Job 仍暂停，没有目标 Pod |
| 让占位作业正常完成 | 目标获准，Job 创建两个 Pod。两者缺少可匹配的节点，仍未绑定 |
| 给实验工作节点加所需标签 | 两个 Pod 实际绑定并按索引执行。索引 0 输出 37，索引 1 输出 12 |

脚本按对象身份连接 Workload、Job 与 Pod，再读实际容器日志。两组输入为 `[10,27]` 和 `[5,7]`，合计 49。Job 已保存、已准入、Pod 已绑定与应用已输出各有独立证据。

## 核对记录

使用 Python 3，在解压目录执行。此命令读取保留记录。

```sh
python3 -B kueue_admission.py --check-record validation.json
```

## 复跑

公开记录来自 Linux Docker、kind v0.33.0、Kubernetes v1.35.8 和 Kueue v0.20.5。需要 Docker 可用、kind 和 kubectl 在 PATH 中，并能下载固定版本的安装清单与容器镜像。程序创建随机命名的专用 kind 集群，使用自己的 kubeconfig，结束后清理该集群。

```sh
python3 -B kueue_admission.py --output ./my-validation.json
```

也可以从 Kueue 发布页先下载 `manifests.yaml`，运行时加 `--manifest ./manifests.yaml`。脚本对两种来源使用同一个固定摘要。

用 [validation.json](validation.json) 看阶段、对象与输出，用 [ci-record.json](ci-record.json) 核对运行及源码摘要。每份 CPU 工作独立完成，实验范围限于单宿主集群的队列、调度和作业状态。GPU 通信、整组会合和训练更新需在相应环境核对。

[Kueue v0.20 作业集成](https://kueue.sigs.k8s.io/v0.20/docs/tasks/run/jobs/) · [kind v0.33.0 固定节点镜像](https://github.com/kubernetes-sigs/kind/releases/tag/v0.33.0) · [Kubernetes Indexed Job](https://kubernetes.io/docs/concepts/workloads/controllers/job/#completion-mode)
