# 用真实 NetworkPolicy 验证 Pod 的两侧门禁

两名客户端向 `orders` 查询同一笔订单 `O-104`，金额固定为 37。`trusted` 和 `untrusted` 都在 kind 控制平面节点，`orders` 在另一个 kind 工作节点。Kubernetes 的 NetworkPolicy 按标签选择 Pod，Cilium 负责落实策略。两个 kind 节点是同一台 Linux 宿主机上的容器。

每轮分别检查两条路径：

- DNS 查询 `orders.policy-lab.svc.cluster.local.`。成功应得到 API 中的 Service ClusterIP。
- 创建新 TCP 套接字，直连 `orders` Pod IP 的 8080 端口并发送一次 HTTP/1.1 查询。响应回显请求 ID、后端 Pod UID 和地址，可以与 API 独立核对。

这两个动作在同一客户端 Pod 里独立执行。DNS 失败时仍测试 Pod IP，避免把解析失败误判成 Pod 间 TCP 不通。程序每次启动新的探针进程，保存解析结果、连接阶段和 HTTP 响应。示例应用有单独的本地就绪探针，实验期间核对三份 Pod UID、Cilium endpoint 身份和 Service EndpointSlice。

## 运行

需要 Python 3.9+、本机 Linux amd64 Docker、kind v0.33.0、kubectl v1.35.8、Helm 3.13.0 或更高。Cilium 固定为 1.20.4，官方版本矩阵包含 Kubernetes 1.35。Helm 包、Kubernetes 节点镜像和 Python 夹具镜像使用源码中锁定的摘要，Python 直接固定官方 linux/amd64 镜像清单。首次运行需要读取公共发布源和镜像仓库。

```sh
python3 -B network_policy_lab.py --json native-record.json
python3 -B network_policy_lab.py --check-record native-record.json
```

程序用随机名称创建两个节点，API 绑定 `127.0.0.1`，关闭 kind 默认 CNI 并安装 Cilium。kubectl 和 Helm 每次都指定临时 kubeconfig 和 context。程序拒绝远程 Docker 端点，退出时只删除本次创建的 kind 集群，并按该集群标签检查节点容器已经移除。镜像可留在本机缓存。第二条命令只读保存的记录。

## 先预测，再执行

| 阶段 | trusted 的 DNS | trusted → orders Pod | untrusted 的 DNS | untrusted → orders Pod |
|---|---|---|---|---|
| 无策略 | 有答案 | HTTP 200 | 有答案 | HTTP 200 |
| orders 入站只允许 trusted 的 TCP 8080 | 有答案 | HTTP 200 | 有答案 | TCP 连接超时 |
| trusted 受空出站规则选中 | 解析失败 | TCP 连接超时 | 有答案 | TCP 连接超时 |
| 另允许 trusted 出站到 orders 的 TCP 8080 | 解析失败 | HTTP 200 | 有答案 | TCP 连接超时 |
| 删除该出站许可 | 解析失败 | TCP 连接超时 | 有答案 | TCP 连接超时 |
| 删除空出站规则 | 有答案 | HTTP 200 | 有答案 | TCP 连接超时 |
| 删除入站策略 | 有答案 | HTTP 200 | 有答案 | HTTP 200 |

网络连接必须同时满足源 Pod 的出站和目的 Pod 的入站。空出站规则让被选中的源进入出站隔离。加上只允许订单端口的策略后，出站许可取适用规则的并集，订单请求能重新通过，DNS 仍没有出站许可。此例没有靠 DNS 成功与否推断端口连通性。

## 怎样读记录

- `toolchain`、`kubernetes_server`、`cilium_agents` 记录实际运行环境和两节点的 agent 版本、镜像标识。
- `inventory`、`final_inventory` 保存应用 Pod 和 Cilium endpoint、Service ClusterIP 与真实 EndpointSlice 后端。前后 UID、地址、重启数保持一致。
- `stages[].policies` 保存每阶段 API 返回的策略 UID 和规则。`stages[].attempts` 保留所有收敛期间的实际探针，最后连续两轮必须吻合预期。`tcp_timeout` 只在 `connect()` 阶段记录，成功则核对套接字的本地与对端地址和 HTTP 业务回显。
- `cleanup` 保存自有节点的退出检查。启动、网络观测、验收或清理失败时输出失败记录并返回非零。读者修改脚本后，旧记录的 `source_sha256` 应失配。

实验范围是一个宿主机上的 kind 与固定 Cilium，使用标准 `networking.k8s.io/v1` NetworkPolicy。它验证跨两个容器节点的 Pod 间连接和单独的 Service DNS 查询。云厂商 CNI、物理多机、入口代理、TLS 和生产性能需要各自的执行证据。

[Kubernetes v1.35 NetworkPolicy](https://v1-35.docs.kubernetes.io/docs/concepts/services-networking/network-policies/) · [Cilium 1.20.4 发布](https://github.com/cilium/cilium/releases/tag/v1.20.4) · [同版本 Kubernetes 矩阵](https://github.com/cilium/cilium/blob/v1.20.4/Documentation/network/kubernetes/requirements.rst) · [同版本 kind 安装说明](https://github.com/cilium/cilium/blob/v1.20.4/Documentation/installation/kind.rst)
