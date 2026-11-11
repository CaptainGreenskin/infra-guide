# 停掉工作节点后，原入口怎样重新读到 R3

三个 kind 节点运行在一台 Linux 机器上。宿主机客户端通过映射到控制面节点的 NodePort 读取工作节点 A 上的报告。R3 属于租户 A，提交号为 102，附件是 object-v3。实验在停节点前用 SQLite Backup API 生成恢复材料。数据库中的 103 是固定夹具位置，附件内容为 `A report 3`，没有换行。

1. 创建原生 `local` PV，限定到工作节点 A。用声明 `r3-a` 把它挂给 A 上的 Pod。通过宿主机入口连续读三次，核对报告和附件。
2. 确认 Docker 容器属于本次新建集群，再停止 A。让 B 上的新 Pod 请求同一 PVC。查调度事件里的 PV 节点亲和性冲突。
3. 从宿主机保留的备份把数据库和附件恢复到 B，检查两个文件的 SHA-256，创建 B 的新 PV 和 PVC。查询 EndpointSlice，确认只剩 B 就绪，再从同一个宿主机入口连续三轮读回 R3 和附件。

每轮有两个 HTTP 请求，各自回显请求 ID、Pod UID 和节点名。按响应体重算附件摘要。客户端在故障期间持续探测。原记录第 30 轮已完整读到 B，第 31 轮报告请求仍失败。最终第 67、68、69 轮是在观测到 A 失去就绪、且 EndpointSlice 只剩 B 就绪之后连续完成的。

## 复跑

使用 Linux amd64、本机 Docker Unix socket、Python 3.9+、kind v0.33.0 和 kubectl v1.35.8。固定节点镜像、应用镜像和下载校验见程序与工作流。安装后在本目录运行。

~~~sh
python3 -B node_loss_lab.py --output my-run.json
python3 -B verify_record.py my-run.json
python3 -B verify_record.py validation.json
~~~

在仓库内可为校验器加 `--reference ../recovery-artifacts-retrieval/validation.json`，核对旧实验的报告 ID、对象名和恢复位置。校验器还会从完整请求序列独立找出两组连续读回，验证数据、入口和卷身份。

程序随机命名自建集群，只用该集群的临时 kubeconfig。宿主机入口绑定 `127.0.0.1`。结束后按确切名称删除集群，并核对自建节点容器均已移除。镜像可以保留在本机缓存。

这是单宿主机上的 kind 节点容器停机实验，覆盖原生 `local` PV、默认 kind 网络、NodePort 和一个合成报告的只读恢复。跨主机或跨可用区的独立性、托管 CNI/CSI、外部负载均衡和服务目标仍需在对应环境测量。

[kind NodePort 映射](https://kind.sigs.k8s.io/docs/user/configuration/#nodeport-with-port-mappings) · [Kubernetes local 卷](https://v1-35.docs.kubernetes.io/docs/concepts/storage/volumes/#local) · [EndpointSlice](https://v1-35.docs.kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
