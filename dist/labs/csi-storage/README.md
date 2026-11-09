# 在 kind 中复查 CSI 动态卷

一个 Linux amd64 Docker 主机运行一个 kind 节点。实验使用 Kubernetes CSI 社区的 Hostpath 示例驱动，后端是 kind 节点容器内的目录。业务容器只声明 PVC，挂载由 kubelet 经 CSI 完成。驱动在这个新建节点内以特权容器运行。

## 运行

准备本地 Linux Docker、kind v0.33.0、kubectl v1.35.8 和 Python 3.9+。运行时需要从 GitHub 官方项目与镜像仓库下载固定输入。请保留包内的 `volume_writer.py` 原始字节，该文件与原存储恢复实验的写入程序相同。

```sh
python3 -B csi_storage_lab.py \
  --writer volume_writer.py \
  --output native-results/csi-storage.json
python3 -B csi_storage_lab.py --check-record native-results/csi-storage.json
```

第一条命令创建随机命名的单节点集群，kubectl 全程使用独立的临时 kubeconfig。成功和普通失败都清理该集群，并检查带该集群标签的 Docker 节点容器已经消失。若进程被强制杀死，先用 `kind get clusters` 核对属于该次运行的集群，再按确切名称清理。第二条命令校验记录和源码绑定，可离线运行。

## 观察步骤

1. 等待 CSIDriver 对象、节点注册及驱动 Pod 就绪。创建使用 `WaitForFirstConsumer` 和 `Delete` 的 StorageClass，再创建 1Gi PVC。此时应看到 `WaitForFirstConsumer` 事件、PVC 为 Pending、PVC 没有 PV 名，也没有 PV 引用这份声明的 UID。
2. 创建首个 Pod。记录节点、VolumeAttachment、PVC 和绑定的 PV。PV 的 `spec.csi.volumeHandle` 指向驱动卷，PV 的节点亲和性也应指向本节点。确认进程的挂载表有 `/data`，再执行原写入程序的 `write-1`。新库的回执应为 0→1。对照业务容器与节点后端的 SQLite 文件 SHA-256。
3. 删除并确认首个 Pod 消失，再创建不同 UID 的替换 Pod。逐项比对 PVC UID、PV UID 和卷句柄，先以只读 SQLite 连接查到旧计数 1 及 `write-1` 回执。复投同一操作应返回旧回执，`write-2` 应将计数推进到 2。再次对照容器和节点文件的 SHA-256。
4. 删除第二个 Pod 后删除 PVC。分别等待 PV 对象消失和检查同一节点上的后端目录不存在，再检查集群清理。目录消失是这次示例驱动的回收观察，不能用来验收云盘数据擦除。

1Gi 是声明和 PV 的容量字段。这个目录驱动实验没有测容量隔离、IOPS、节点故障恢复、多节点可用区拓扑或 CSI 快照。

## 固定输入

- kind 节点镜像使用 v1.35.8 的既有摘要，业务容器使用官方 Python 3.13 Alpine 的 Linux amd64 清单摘要。
- 驱动部署取自 Hostpath v1.19.0 的 Kubernetes 1.35 目录，提交为 `6fab18ae4fc4f486193b618114eeb817d9929242`。此目录配套的驱动镜像是 v1.18.0。实验保留原生驱动、节点注册、探活、attacher 和 provisioner，去掉快照和扩容容器及相关 RBAC。四份上游输入校验 SHA-256，五个容器使用官方 Linux amd64 镜像摘要。
- 记录同时绑定实验源码和既有 SQLite 写入程序。原章节的本地 SQLite 检查和此前未执行的 JSON 清单保留各自的证据范围。

[Kubernetes 1.35 存储类](https://v1-35.docs.kubernetes.io/docs/concepts/storage/storage-classes/) · [Kubernetes 1.35 持久卷](https://v1-35.docs.kubernetes.io/docs/concepts/storage/persistent-volumes/) · [上游 Kubernetes 1.35 部署清单](https://github.com/kubernetes-csi/csi-driver-host-path/blob/6fab18ae4fc4f486193b618114eeb817d9929242/deploy/kubernetes-1.35/hostpath/csi-hostpath-plugin.yaml) · [驱动后端实现](https://github.com/kubernetes-csi/csi-driver-host-path/blob/v1.18.0/pkg/hostpath/hostpath.go)
