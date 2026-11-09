# 在 kind 中观察 ConfigMap 的四条读取路径

同一个 Pod 用三种方式取得 `app-config` 的 `version` 键：普通投射目录、投射卷的 `subPath` 文件、启动环境变量。运行中的 Python 进程还保留启动时打开的文件描述符，并用 `os.pread` 反复读取它。更新 ConfigMap 后，由同一个进程比较重开路径和保留旧描述符的结果。

## 运行

准备 Linux amd64 的本地 Docker、kind v0.33.0、kubectl v1.35.8 和 Python 3.9+。脚本使用固定的 kind 节点镜像和官方 Python Linux amd64 镜像摘要。它只使用新建的单节点集群与独立 kubeconfig，结束时校验自建节点容器已删除。

```sh
python3 -B config_projection_lab.py --output native-record.json
python3 -B config_projection_lab.py --check-record validation.json
```

第一条生成一次新的原生记录。第二条检查随包发布的 CI 记录，离线即可运行。它校验源码摘要、版本和阶段间的对象身份。

## 观察顺序

1. 读取初始 ConfigMap UID、resourceVersion 和值 `v1`。启动第一个 Pod，从进程写出的观测文件读取四条路径及两个文件的 inode。
2. 只修改 ConfigMap 数据到 `v2`。核对 UID 未变、resourceVersion 改变。轮询原 Pod 的观测，直到重开的普通路径读到 `v2`。此时比较原 Pod UID、容器 ID、重启次数、旧 FD、subPath 和启动环境。
3. 删除原 Pod，再创建新 Pod。核对新 UID 和同一个更新后的 ConfigMap，确认四条路径都读到 `v2`。新进程打开的是自己的文件描述符。

程序只读取配置字节，没有自动重载业务请求，也没有注入 Secret。结果覆盖这次节点上的配置传播，不推定更新时延上限。进程自己的读数通过本地观测文件传给执行器，`kubectl exec` 不重新采样应用的环境变量或打开文件。

[Kubernetes 1.35 ConfigMap 传播](https://v1-35.docs.kubernetes.io/docs/concepts/configuration/configmap/#mounted-configmaps-are-updated-automatically) · [投射卷](https://v1-35.docs.kubernetes.io/docs/concepts/storage/projected-volumes/) · [Kubernetes v1.35.8 AtomicWriter 实现](https://github.com/kubernetes/kubernetes/blob/v1.35.8/pkg/volume/util/atomic_writer.go)
