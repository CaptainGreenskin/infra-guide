# 原生 Kubernetes 身份与授权

同一报表 `report-a/reports-v1` 的值为 `37`。本实验先沿 TokenRequest、ServiceAccount 主体、受众和 RBAC 读取报表，再用同一枚凭证删除/恢复 RoleBinding，核对 `200 → 403 → 200`。跨对象名、namespace、动作和 Secret 的请求均需被拒绝；最后由独立管理员读取对象 UID、resourceVersion 和数据摘要，确认拒绝路径未修改数据。

## 运行

需要 Python 3.9+、Linux、本机 Docker Unix socket、kubectl、kind **v0.33.0**。节点镜像固定为 `kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0`。kind 安装与摘要校验见官方 https://kind.sigs.k8s.io/docs/user/quick-start/ 。

```sh
python3 -B identity_lab.py --output identity-record.json
python3 -B identity_lab.py --check-record identity-record.json
```

程序只创建随机命名的 `infra-identity-*` 集群，所有 kubectl 调用显式使用自己的临时 kubeconfig/context；finally 只删除该集群。它拒绝 DOCKER_HOST 和非 Unix socket 的 Docker context，不接受外部集群参数。临时目录权限由系统限制，kubeconfig 设为 0600。

业务 HTTPS 请求只从集群配置取服务器地址和 CA，用 CA 验证连接并携带 Bearer token；不读取管理员用户的客户端证书/私钥，不使用环境代理。SelfSubjectReview 与拒绝响应同时核对实际主体，错误 audience 的 token 必须得到 401。管理员客户端仅负责建立实验对象、签发/审查 token 及独立读取结果。

## 先预测，再核对

1. `reader-1` 认证为 `system:serviceaccount:report-a:report-reader`，只读 `reports-v1=37`。
2. 同 token 读 `reports-v2`、跨到 `report-b`、PATCH 报表、读 Secret、列举 ConfigMap：403。
3. 删除绑定，同 token 的 TokenReview 仍认证成功，但读报表变为 403；恢复绑定，再次读出 37。
4. 为 `reports-api.invalid` 签发的 token 不适用本实验 API 受众，TokenReview 认证失败，HTTP 401。
5. 将另一枚 token 绑定到实际 Pod UID；删除 Pod 后，在最多 90 秒的预算内观察认证失效，再检查 HTTP 401。记录实际等待时间，不承诺所有环境在发出删除请求时立即撤销。
6. 管理员独立读取的四个受保护对象在请求前后保持同一 UID、resourceVersion 和数据摘要。

Pod 使用一个没有运行调度器的 schedulerName，作为存在于 API 中的绑定对象，不启动业务容器。本实验未验证 kubelet 投射、自动刷新、OIDC 离线验签、云 IAM、网络隔离或生产多租户。token 只在内存中使用；记录保留必要声明、TokenReview 状态与业务响应，不保存 token、私钥和 kubeconfig 正文。`--check-record` 只复核记录，不启动 Docker。

## 官方资料

- https://kubernetes.io/docs/reference/access-authn-authz/rbac/
- https://kubernetes.io/docs/concepts/security/service-accounts/
- https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/
- https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_token/

实际执行记录须在运行成功、完成清理且与源码摘要一致后再发布；没有记录时不登记通过。
