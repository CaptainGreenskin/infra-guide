# 控制器重启后，怎样认出已经创建的资源

一个 `ReportSink` 对象请求创建报表接收位置。Kubernetes API Server 分配 UID，控制器把这个 UID 当作接收位置的身份。它先给对象加 finalizer，也就是要求删除前先完成清理的标记，再向本机 HTTP 接收端发 `PUT /sinks/<uid>`。接收端把目标保存为文件，只有第一次写入才返回 201。重复请求用同一个 UID，读到相同目标后返回 200。

## 跑一遍

需要 Go 1.25 或更新版本，以及同架构的 Kubernetes 1.35.0 envtest 二进制包。下面是本次使用的 Darwin arm64 归档和官方摘要。Go 依赖由 `go.mod` 与 `go.sum` 固定，首次运行需要下载依赖。 [官方 envtest 归档](https://github.com/kubernetes-sigs/controller-tools/releases/tag/envtest-v1.35.0)

```sh
curl -fLO https://github.com/kubernetes-sigs/controller-tools/releases/download/envtest-v1.35.0/envtest-v1.35.0-darwin-arm64.tar.gz
printf '%s  %s\n' 3c6b1ebd745b82daed47605fb565f7c670c8a3344b57a377a914d013b6b9eef0 envtest-v1.35.0-darwin-arm64.tar.gz | shasum -a 256 -c
tar -xzf envtest-v1.35.0-darwin-arm64.tar.gz
go run -mod=readonly . --assets "$PWD/controller-tools/envtest" --output replay.json
```

在实验源码所在目录运行。程序启动独立的 Kubernetes API Server、etcd 与接收端，均使用本机回环地址。每次生成私有的临时配置，只用于本次控制器进程。结束后清理工作进程、控制面和临时文件。Linux 可用同版本的官方 Linux 归档复跑，归档摘要以该平台的发布资产为准。 [envtest 的控制面范围](https://book.kubebuilder.io/reference/envtest.html)

## 对照 API 状态和接收端文件

| 观察点 | Kubernetes API | 独立接收端 |
| --- | --- | --- |
| 正常创建 | 控制器已经启动并完成首次列举，再创建 `normal`。`status.observedGeneration` 最终等于 1。 | 首次 `PUT` 返回 201，创建一份文件。 |
| `replay` 进程退出 | 接收端响应后，工作进程以 73 退出，来不及写 status。对象保留同一 UID 和 finalizer。 | 文件已存在，一次 `PUT`，创建一次。 |
| 重启工作进程 | informer 重新列举对象，队列交给控制器的是命名空间和名称。它再读取对象，按原 UID 重试，写回 `observedGeneration=1`。 | 第二次 `PUT` 返回 200，仍是同一份文件。 |
| 请求删除，控制器还未启动 | 读取仍为 200，返回 `deletionTimestamp` 和 finalizer。 | 文件仍在。 |
| 重启并完成清理 | 控制器在接收端确认清理后移除自己的 finalizer，重新读取返回 404。 | `DELETE` 返回 204，按 UID 读取时文件已消失。 |

`controller.go` 使用真实的 `client-go v0.35.8` informer、队列和资源客户端。实验让 informer 先单独发 `LIST`，再用 `WATCH` 接收更新。`main.go` 驱动正常、退出重启和删除三组观察。验证记录里的 `put_attempts` 统计请求次数，`created` 统计实际创建次数，`effect_present` 另从接收端文件核对。`observed_generation` 为 0 且 `status_reported` 为 false，表示当时尚未写入状态字段。 [Kubernetes finalizer 语义](https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/) · [client-go workqueue](https://pkg.go.dev/k8s.io/client-go/util/workqueue)

`report.isolation` 保存三个本机监听地址的主机部分。程序退出前停掉本轮启动的服务，再用 TCP 连接确认三个端口均已关闭。删除 `replay` 后，也会核对 `normal` 的文件仍在，清理按 UID 划分归属。

实验的崩溃点是控制器进程，接收端和控制面持续运行。envtest 没有运行 kubelet 或 Kubernetes 内置控制器，记录覆盖本实验的 CRD、显式清理与状态更新。接收端进程崩溃、外部资源漂移、多控制器选主及生产供应商接口需要各自验收。
