# 同一组 Pod 的驱逐、直接删除与发布

Deployment 让三个 `reports` Pod 保持运行。PDB 选中同一批 Pod，管理通过 Eviction API 发起的自愿中断额度。滚动发布另有可用数限制。通过 Pod UID、实际 HTTP 回复和控制器状态，分开验证三条路径。

## 运行

使用 Linux x86_64、本机默认 Docker socket、kind 0.33.0、kubectl 1.35.8 与 Python 3.9 或以上。脚本创建随机命名的单节点集群，使用临时 kubeconfig 和只接受本地地址的 TLS 客户端，结束清理本次集群。

```sh
python3 -B pdb_rollout.py --output replay.json
```

镜像固定为源码中的摘要，首次下载需要网络。程序同时保存初始清单、操作请求体和响应以及控制器的最终状态。复跑时 Pod 名、UID 和部分时间字段会变化。

## 读结果

1. `initial` 的 `currentHealthy=3`、`desiredHealthy=2`、`disruptionsAllowed=1`。沿 `allowed_eviction` 核对本次 HTTP 201 和被驱逐的 UID，再在 `after_eviction` 找到替代 UID。
2. `strict` 的健康数和最少保留数都是 3。对照 `blocked_eviction` 的 429、`DisruptionBudget` 原因和 `still_present_after_rejection`。随后的 `direct_delete` 带同一 UID 条件，返回 HTTP 200 并触发补副本。
3. `stalled_rollout` 包含两个就绪 v1 和一个 Running 但未就绪的 v2。部署策略允许一个不可用副本，PDB 允许驱逐数为 0。用 `blocked_during_rollout` 核对仍生效的维护预算。
4. `after_undo` 恢复为三个就绪 v1。按 Pod UID 核对两个仍在的 v1 和一个补上的 v1，`cluster_cleaned` 确认实验集群已清理。

本实验使用固定镜像、就绪探针与独立 kind 集群。真实节点维护、主机故障和用户流量需在相应环境分别验证。

[Eviction API 官方说明](https://kubernetes.io/docs/concepts/scheduling-eviction/api-eviction/) · [自愿中断与 PDB](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)
