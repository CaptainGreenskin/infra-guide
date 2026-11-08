# 三个独立实验：运输确认、状态管理、持续调谐

先分别读C5.2、C6.2和C6.3的对象与机制，再选一项运行。它们共用下载包，不要求依次运行，不连接生产或付费云。

## 消息投递

Python 3.9+标准库、本地Linux Docker引擎。客户端镜像按Dockerfile安装Pika 1.3.2，代理固定RabbitMQ 4.4.0，下载镜像和依赖需联网。

```sh
python3 -B mq_delivery.py --output runs/mq-record.json
```

只创建随机命名容器、内部网络、专用卷和客户端镜像，不发布宿主端口。公开固定凭据只适用于这组临时隔离夹具。结束删除自有资源，不清理其他Docker对象。环境只接受本地Unix socket上下文，不接受DOCKER_HOST远端地址。

核对三份事实：发布确认、运输ACK、SQLite实际效果。真实子进程提交report-27=37后被SIGKILL，重投和新消息标识再发布都保持一次效果；先ACK再写业务的负例队列0、效果0，被验收拒绝。错误通道确认返回406。订阅prefetch=1时先只交付1条，basic.get仍可拉2条未确认消息。代理容器重启后从同一专用卷读回持久消息amount=7。

这是AMQP 0-9-1/RabbitMQ实测，不是SQS、Lambda、节点永久丢失或多副本高可用测试。

## Terraform状态

准备官方Terraform 1.13.0（https://releases.hashicorp.com/terraform/1.13.0/），并核对官方SHA256SUMS。实验init下载官方hashicorp/local 2.5.3，仅管理自己的临时文件。

```sh
terraform version
python3 -B terraform_state.py --output runs/terraform-record.json
```

不要求Docker。程序使用临时目录和专用CLI配置。一个apply停在受控执行钩子并保持local状态锁，第二个plan被拒绝；放行后正常完成。实际文件alpha被改outside后，关闭刷新的计划退出0；refresh-only应用后state不再有旧文件绑定，磁盘outside保留；普通修复再变alpha。blue/green工作空间有不同状态身份却指同一路径，green写beta后blue缓存计划仍可退出0。

状态锁不阻止其他状态或人工修改同一实物。这里没有云provider、远端backend或高可用锁验证。不要在业务目录直接替换脚本中的隔离机制。

## GitOps真实调谐

Python 3.9+、本地Linux Docker、kubectl与kind v0.33.0。kind安装见 https://kind.sigs.k8s.io/docs/user/quick-start/ 。程序使用固定摘要的Kubernetes v1.35.8节点镜像，安装官方Argo CD Core v3.6.1，需下载镜像及公开源。

```sh
python3 -B gitops_reconcile.py --output runs/gitops-record.json
```

创建自己的kind集群；每次kubectl显式指定临时kubeconfig/context，结束只删自己的集群。Application固定读取本站公开仓库和gitops-revisions.json里的三个完整提交，AppProject限制源、命名空间和资源种类；不使用用户私有Git凭据，不对外发布管理界面。

三份修订：v1配置/模板；只改配置v2并移除旧ConfigMap；修改模板注解触发v2新Pod。实际核对手改2副本、自愈恢复1；prune关闭保留受管旧配置，开启后删除它，未受管对象保留。配置v2且Synced/Healthy时旧Pod仍HTTP v1；替换模板后新UID、HTTP v2。再改变期望回到v1，重新验收配置与响应。此处不是调用Argo rollback API。

kind是单机容器节点。这里验证真实控制器和服务请求，不证明云CNI/CSI、生产性能、高可用或任意数据库迁移可回退。

## 已有执行证据

validation.json保存本轮成功Linux CI的原始程序记录、精确源码摘要、固定Git修订及清单内容，和自己新跑的runs报告分开。首轮消息就绪检测失败后补了诊断和执行边界，未通过运行不计作完成证据。后续修改程序应重新运行相关原生环境并生成新记录。
