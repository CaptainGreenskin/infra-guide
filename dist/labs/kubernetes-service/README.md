# 原生 Kubernetes：探针、Service 与版本恢复

先沿一条正常请求认识对象，再改变其中一个条件。Deployment 声明两个业务副本；每个 Pod 有独立 UID；Service 提供稳定 ClusterIP，按标签匹配业务 Pod；EndpointSlice 保存该 Service 后端地址及就绪条件。独立客户端 Pod 持续向 **同一个 ClusterIP:80/work** 发出新 HTTP 请求，应用在响应中回显请求 ID、实际版本、Pod UID 与进程实例 ID。

## 运行

需要 Python 3.9+、Linux、本机 Docker Unix socket、kind **v0.33.0**、kubectl **v1.35.8**。官方工具下载与 SHA256 校验步骤位于仓库 `.github/workflows/kubernetes-service.yml`。

```sh
python3 -B service_lab.py --output service-record.json
python3 -B service_lab.py --check-record service-record.json
```

节点固定为 `kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0`；应用与客户端使用官方 Python 镜像 `python:3.13.7-alpine3.22@sha256:9ba6d8cbebf0fb6546ae71f2a1c14f6ffd2fdab83af7fa5669734ef30ad48844`。后者是多架构镜像清单摘要，CI 在 Linux amd64 上选择相应清单。

程序只创建随机命名的 `infra-service-*` kind 集群，不接受外部集群参数。每条 kubectl 命令显式使用自己的临时 kubeconfig 与 context；kubeconfig 权限为 0600。拒绝非空 DOCKER_HOST、非 Unix socket 的 Docker context 及其他 kind provider；finally 只删除本次命名集群并确认其消失。三个 Pod 均关闭 ServiceAccount token 自动挂载，执行记录不保存 token、私钥或 kubeconfig 正文。

## 先预测六个阶段

1. **正常 v1**：两个 Pod 均 Ready，两个 EndpointSlice 后端 ready=true；同一 ClusterIP 的响应样本包含两者 UID，版本均为 v1。
2. **readiness 失败**：只在其中一个业务容器创建 `/tmp/not-ready`。该应用 `/ready=503`，`/live=200`、`/work=200`；API 中此 Pod Ready=false、对应端点 ready=false；持续客户端稳定样本只收到另一 UID，两个 Pod 的 restartCount 均保持不变。端点可以仍保留在对象中，不能只数地址。
3. **readiness 恢复**：删除该标记；同一 Pod UID 恢复 Ready，端点重新 ready=true；HTTP 再次包含两者 UID，重启次数仍不变。
4. **单独的 liveness 失败**：创建 `/tmp/not-live`；此时直接探测 `/live=503`、`/ready=200`。kubelet 达到配置阈值后重启该容器。原 Pod UID 保持不变，restartCount 增加一次，响应的进程实例 ID 改变，再经 Service 读到 v1。实验的故障标记位于容器可写层，新容器启动后消失。
5. **发布 v2**：`kubectl set env deployment/guide-service APP_VERSION=v2` 改变 Pod 模板。等待对象收敛后，EndpointSlice 对应新 Pod UID；实际 ClusterIP 响应全部为 v2。
6. **回退 v1**：`kubectl rollout undo ... --to-revision=1` 恢复初始模板。再次等待 Ready 与端点收敛，再从同一 ClusterIP 实际读到 v1。回退范围是 Pod 模板，本例没有迁移数据库或改变外部 ConfigMap 内容。

## 怎样验收

客户端从程序开始持续运行，每条请求都带唯一 ID，使用显式禁用环境代理的 urllib opener，并关闭连接复用；不通过 port-forward，不直连 Pod IP 充当业务路径。管理端的 Pod 内 loopback 请求只用于区分应用的三个接口，记录在 `direct_probe` 中，与 Service 流量分开。

每阶段先轮询 API 的对象条件，再切换客户端阶段标记；等待最后连续 **20 条** HTTP 成功且响应 UID 集合与 ready 后端集合相同。保存抽样窗口前、后的独立 API 快照，并继续核对请求 ID、实际版本、Pod UID、Ready、EndpointSlice 条件及重启次数。记录还保留完整持续请求序列，阶段稳定样本不代表传播期间零失败；不以固定 sleep 推断端点生效。采样是受控有限窗口，不能证明所有未来请求都成功。

`--check-record` 离线验证记录中的对象事实和真实 HTTP 内容，并核对源码 SHA256；不会连接 Docker。站点的离线检查器另有独立的业务验收逻辑及篡改负例，只有显式设置 `INFRA_GUIDE_RUN_KUBERNETES_SERVICE=1` 才新建 kind。

## 范围与原有手册

这是单 Linux 宿主上的 kind 集群，覆盖原生探针、Service 数据路径、Pod 模板发布与回退。它不验证生产云负载均衡、多宿主网络、多故障域可用性、容量、长连接/在途请求排空或 preStop 终止窗口。Python `http.server` 仅用于教学。

原有 `infra-systems/infra_lab.py` 的 loopback、存储与指标实验保持独立；原有 `probe_server.py` / `deployment.yaml` 目标集群手册也保留为历史来源。本实验使用新的双副本夹具和持续客户端，不把旧手册执行状态或本地结果改写成这次原生记录。

## 官方语义

- [Service、选择器与 ClusterIP](https://kubernetes.io/docs/concepts/services-networking/service/)
- [readiness 与 liveness 的动作区别](https://kubernetes.io/docs/concepts/workloads/pods/probes/)
- [EndpointSlice 的 ready、serving 与 terminating](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
- [Deployment 更新与回滚的 Pod 模板范围](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [kind 安装与官方校验](https://kind.sigs.k8s.io/docs/user/quick-start/)

只有真实运行成功、完成自有集群清理，且记录与冻结源码摘要一致后，才发布原生通过结论。
