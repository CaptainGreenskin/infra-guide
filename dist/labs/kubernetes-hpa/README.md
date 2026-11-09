# 在 kind 中核对真实 CPU HPA

这次使用一个 Linux Docker 主机上的单节点 kind。Metrics Server 从 kubelet 读取容器 CPU 用量，资源指标 API 提供每个 Pod 的样本。HPA 根据 CPU 使用量相对 request 的比例修改 Deployment 的期望副本，Deployment 再创建或删除 Pod。

## 运行

准备本地 Linux amd64 Docker、kind v0.33.0、kubectl v1.35.8 和 Python 3.9+。程序校验上游 Metrics Server v0.9.1 发布清单的 SHA-256，并固定 Linux amd64 的容器镜像摘要。为了让 Metrics Server 能访问自建 kind 的 kubelet，它仅在这个隔离集群内加入 `--kubelet-insecure-tls`。程序使用独立 kubeconfig，结束核对自建节点容器已删除。

```sh
python3 -B hpa_control_lab.py --output native-record.json
python3 -B hpa_control_lab.py --check-record validation.json
```

第一条生成一份新的原生记录，第二条离线核对随包发布的 CI 记录。

## 观察四个阶段

每个容器请求 100m CPU、上限 200m。HPA 使用 Resource CPU Utilization，目标 50%，副本上下界为 1 和 2。程序在原 Pod 中通过一个文件标记启停 CPU 忙循环。缩容稳定窗口显式设为 0 秒，以便在短实验中观察撤负载后的缩容。

1. 等资源指标 API 可用，核对原 Pod 的低 CPU 样本和一个可用副本。
2. 打开忙循环。读取 Metrics API 的采样时刻、窗口、CPU 值以及 HPA 状态。HPA 和 Deployment 的期望均为 2。新增 Pod 已运行，但只给原 Pod 通过 readiness 的标记，因此 Deployment 暂时只有一个可用副本。
3. 让同一个新增 Pod 的探针通过。确认 UID 不变，可用副本数变为 2。
4. 停止忙循环，等资源指标和期望下降，核对仍有一个可用副本及其 UID。

Metrics API 样本与 HPA 状态通过不同 API 串行读取，采样窗口可能不同。记录用于检验负载方向和控制链，不从一条原始样本反推控制器那次计算的全部输入。实验没有创建负载均衡入口、节点伸缩器或线上业务请求，也不测扩容用时上限和服务吞吐。

[Kubernetes 1.35 HPA](https://v1-35.docs.kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/) · [Kubernetes 1.35 资源指标链](https://v1-35.docs.kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/) · [Metrics Server v0.9.1](https://github.com/kubernetes-sigs/metrics-server/releases/tag/v0.9.1)
