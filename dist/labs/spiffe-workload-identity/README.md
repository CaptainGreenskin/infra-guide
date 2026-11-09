# SPIRE 工作负载身份与报表发布

两个工作者向报表服务提交相同的 `report-27:publish`，金额 37。它们都从真正的 SPIRE Agent 获得 X.509-SVID，并向同一个报表服务建立 mTLS。接收方验证对端证书后，才按证书里的 SPIFFE ID 判断谁可以发布。

## 运行

准备 Linux x86_64、Python 3.11+、Go 1.26.1 和官方 SPIRE 1.16.0 Linux amd64 发布包。Go 会读取随包的 `go.mod` 和 `go.sum`，初次运行需要下载固定版本的模块。程序先校验 SPIRE 压缩包，再从中提取两个可执行文件。

```sh
curl --fail --location -O https://github.com/spiffe/spire/releases/download/v1.16.0/spire-1.16.0-linux-amd64-musl.tar.gz
printf '%s  %s\n' '7bcf5e167151a1fc58293768462b44e155ba8784214582aefa6adf18c633d1d5' spire-1.16.0-linux-amd64-musl.tar.gz | sha256sum --check --strict
python3 -B spire_identity_lab.py --archive spire-1.16.0-linux-amd64-musl.tar.gz --output my-record.json --log-dir my-logs
```

`--log-dir` 选填，须使用尚不存在的目录。服务器和报表服务只绑定回环地址，所有管理套接字、数据和一次性节点注册材料都放在程序自己的临时目录。结束时终止自己的三个子进程并删除临时目录。验证记录只含公开标识、摘要、响应与效果行。

随包的 `validation.json` 来自一次 Linux x86_64 实跑，`receiver-ready.json` 保留接收服务的原始就绪输出。`ci-record.json` 保存提交和对应摘要。[查看 Linux CI 原始运行](https://github.com/CaptainGreenskin/infra-guide/actions/runs/42579127780)

## 沿请求读记录

1. SPIRE Server 生成本轮信任包，Agent 用它验证 Server，再用一次性节点注册令牌建立自己的身份。令牌交给 Agent，应用没有用它请求报表。
2. Agent 从本机进程发现可执行文件路径，与注册条目的 `unix:path` 条件匹配。注册三个路径对应报表服务、A、B。第四个程序可连接本地 Workload API，因没有匹配条目，拿不到任何 X.509-SVID。
3. 客户端用取得的证书连接报表服务，并验证服务端的确是 `spiffe://infraguide.test/report-api`。服务端接受同一信任域的合法客户端证书，所以 A、B 都可以建立 mTLS。
4. B 先发送，HTTP 头声称自己是 A，服务端审计仍读出证书中的 B，返回 403。驱动另读业务效果文件，记录为空。随后 A 用相同报文得到 201，效果文件只新增一笔 A 的金额 37。

`registrations` 记录已创建的注册项。`unregistered` 是 Workload API 返回的 gRPC 状态与凭据数。`worker_a`、`worker_b` 记录客户端看到的 HTTPS 状态与双方身份，`audit` 记录接收方看到的证书身份和请求自报值。`effects_after_denial` 和 `effects` 从业务效果文件独立读取。

本实验用同一系统用户下不同的可执行路径清楚区分实验进程。同一用户可以运行这些路径，因此这组选择条件只用于本机受控夹具。这份记录覆盖首次发证、真实双向 TLS 和两次报表请求。证书轮换、跨信任域、云角色兑换和并发发布属于其他验收场景。

[官方 SPIRE 1.16.0 发布包](https://github.com/spiffe/spire/releases/tag/v1.16.0) · [固定版本 Unix 工作负载选择器](https://github.com/spiffe/spire/blob/v1.16.0/doc/plugin_agent_workloadattestor_unix.md) · [SPIFFE Workload API 规范](https://spiffe.io/docs/latest/spiffe-specs/spiffe_workload_api/) · [固定版本 mTLS 客户端和服务端配置](https://pkg.go.dev/github.com/spiffe/go-spiffe/v2@v2.9.0/spiffetls/tlsconfig)
