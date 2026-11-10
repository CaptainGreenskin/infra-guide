# 有创建 Pod 的权限，为什么提交还是失败

同一个 `report-writer` 用同一份凭据向三个命名空间提交 Pod。`report-a` 和 `report-b` 都授予它 `create pods`，`report-c` 没有授予。准入规则只匹配贴有 `report-admission=enforced` 标签的 `report-a` 和 `report-c`，检查普通容器的 `securityContext.privileged`。该字段为 `true` 表示请求以特权模式运行容器。

| 提交对象 | 自查授权 | API 写入响应 | 独立管理员读取 |
| --- | --- | --- | --- |
| `report-a/safe`，普通容器 | 允许 | 201 | 200，`privileged=false` |
| `report-a/privileged`，特权容器 | 允许 | 422，`Invalid` | 404 |
| `report-b/privileged`，相同特权配置 | 允许 | 201 | 200，`privileged=true` |
| `report-c/privileged`，相同特权配置 | 拒绝 | 403，`Forbidden` | 404 |

`SelfSubjectAccessReview` 只问当前主体是否获准对资源执行动作。`ValidatingAdmissionPolicy` 定义创建时检查的表达式，`ValidatingAdmissionPolicyBinding` 决定应用范围及失败动作。这个绑定选择 `Deny`，规则将校验失败的原因设为 `Invalid`，所以本例返回 422。排查其他策略时要读响应体中的 `reason` 和 `message`，准入也可能返回 403。 [Kubernetes 准入流程](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/) · [ValidatingAdmissionPolicy](https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/)

## 复跑

准备 Go 1.25 或更新版本，以及同架构的官方 Kubernetes 1.35.0 envtest 二进制包。以下命令在实验目录执行。首次使用 Go 模块时可能下载 `go.mod` 与 `go.sum` 固定的依赖。

```sh
curl -fLO https://github.com/kubernetes-sigs/controller-tools/releases/download/envtest-v1.35.0/envtest-v1.35.0-darwin-arm64.tar.gz
printf '%s  %s\n' 3c6b1ebd745b82daed47605fb565f7c670c8a3344b57a377a914d013b6b9eef0 envtest-v1.35.0-darwin-arm64.tar.gz | shasum -a 256 -c
tar -xzf envtest-v1.35.0-darwin-arm64.tar.gz
go run -mod=readonly . --assets "$PWD/controller-tools/envtest" --output my-validation.json
```

本次使用 macOS arm64。Linux 可选官方发布页中同版本同架构的归档，按对应资产核对摘要。程序启动独立的 Kubernetes API Server 和 etcd，不读取默认 kubeconfig。两端绑定回环地址，程序退出时停止两者并确认端口关闭。 [官方 envtest 归档](https://github.com/kubernetes-sigs/controller-tools/releases/tag/envtest-v1.35.0) · [envtest 启动范围](https://book.kubebuilder.io/reference/envtest.html)

## 看结果

1. `observations.identity` 来自当前凭据的 `SelfSubjectReview`。各行的 `authorization` 是该账号的 `SelfSubjectAccessReview` 返回状态。
2. `create` 保存真实 HTTP 状态和响应体。`report-a` 的 422 消息包含策略名和自定义提示，`report-c` 的 403 消息包含提交账号和未获准的动作。
3. `admin_get` 保存另一套管理员凭据的实际读取。成功的对象与创建响应 UID 相同，失败的对象返回 404。UID 和版本号每次可能不同，比较身份、状态码和已写入字段即可。

实测覆盖普通容器的 Pod `CREATE` 请求。envtest 没有启动调度器、节点和容器，201 只表示对象已经写入 API。禁止特权容器的生产策略还需按需要覆盖初始化容器、临时容器和实际工作负载的其他字段。
