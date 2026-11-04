# Cloud 三领域配套实验

学习顺序：先读站内对应领域的全部知识点，再运行此处代码。Python 程序兼容 Python 3.9+，仅用标准库；数据库/状态文件位于各程序自己的临时目录，不连接云账户。`validation.json` 记录本站运行结果及源码摘要。

## 1. 存储与恢复

```sh
python3 recovery_lab.py
```

使用 SQLite Online Backup API 生成真实基线，余额100、进度100；应用日志101/+10、102/+20、103/−5、104/误清零。恢复到103应得到125；缺102时在创建恢复库前拒绝；103重复无额外效果，同序号换意图拒绝；新104/+5可继续到130。日志为本实验应用协议，不是SQLite WAL、MySQL binlog或PostgreSQL WAL。`mysql-pitr.md` 提供单独的 MySQL 8.4 目标环境步骤，本次没有 MySQL 执行证据。

## 2. 批处理与提交间隙

```sh
python3 event_batch_lab.py
```

子进程处理A，在数据库提交后以23退出；再处理A/B/C，其中B临时失败，返回 `batchItemFailures=[{itemIdentifier: msg-B}]`；恢复B后，尝试数A=2/B=2/C=1，效果共3笔。新运输ID不改变A的业务身份；同ID换参数拒绝；两个并发进程处理X，只产生一个效果。这里使用本地SQLite，展示提交与回执的原子边界；不能把临时SQLite文件部署到函数临时盘后当成云端持久去重。实际Lambda/SQS还需持久共享存储、开启部分批响应并验证映射与队列参数。

## 3. Terraform 的真实计划与状态

需要自行准备官方 Terraform CLI；本次固定验证版本1.13.0，使用内建 `terraform_data`，不下载云provider或创建远端资源。

```sh
python3 terraform_lab.py /absolute/path/to/terraform
```

程序在独立临时目录执行init/validate/plan/show/apply：保存v1计划后把配置改为v2，执行旧计划仍得到v1；再计划并应用v2；无变化计划退出码0；另一个apply使状态推进后，旧计划被拒绝。记录只证明真实CLI、本地state和内建provider行为，不证明云端资源漂移、远程锁或实际集群发布。

手动跟踪时，先把 `main.tf` 复制到新的实验目录，再在该目录执行：

```sh
terraform init
terraform validate
terraform plan -out=release.tfplan
terraform show release.tfplan
terraform apply release.tfplan
terraform output -json
```

## 4. GitOps 的调谐模型与目标配置

```sh
python3 gitops_model.py
```

该教学模型分别演示：现场replicas从2改5，自愈关/开得到5/2；受管字段一致但available=0时仍未健康；资源健康而业务版本错误仍验收失败；保留Deployment、从源中去掉受管ConfigMap后，prune关/开的行为不同，未受管对象保留。它不是Argo CD执行器，状态名带model后缀。

`argocd-application.yaml` 是需替换仓库和目标的配置示例：自动同步和自愈开启，自动prune关闭。需要已有Argo CD、源访问、项目权限和实际清单；本次未同步集群。可在独立测试集群按课程顺序验证Synced/Healthy、手改replicas、自愈、移除ConfigMap、单独开启prune和业务探测，勿把模型通过当成集群证据。

## 验证记录与范围

`validation.json` 包含四个程序的结果、运行环境、源码SHA256与明确范围。完整的代码和本记录一起发布，便于对照。MySQL手册和Argo配置仅做文档审阅；真实云队列、MySQL/PostgreSQL、远程Terraform backend和GitOps集群未运行。
