# 第13版：存储恢复、Serverless、IaC/GitOps

本轮完成三个领域的连续知识正文与后置案例。范围是 C3 八节、C5 五节、C6 七节，共20个知识点；C6新增独立GitOps点，全站变为62个核心知识点，独立文章仍为66篇，没有把知识点重新计为长篇章节。

## 教学顺序与内容

| 领域 | 先系统学习 | 后运行案例 |
| --- | --- | --- |
| 存储与数据库恢复 | 块/文件/对象接口；IOPS、吞吐与在途量；WAL/redo、提交与持久化；索引/MVCC/锁/binlog；复制接收与应用、GTID集合、旧主隔离；缓存竞态；消息提交；基线与连续日志PITR | SQLite真实备份 + 应用日志恢复；缺段拒绝、幂等/冲突及消费者继续；另给MySQL8.4隔离恢复手册 |
| Serverless | 执行环境生命周期；同步/直接异步/SQS契约；部分批失败与可见性；业务身份与原子回执；并发、下游与积压；成功产出成本和观测 | A提交后真实进程退出，整批再来、B部分失败及恢复；两个进程争抢同一业务动作 |
| IaC/GitOps | 制品/配置/数据版本；CI与运行验收；配置/state/真实资源；计划和锁；可恢复控制器；GitOps源/渲染/同步/健康；自愈/清理；发布顺序、兼容回退与来源 | 官方Terraform CLI执行保存计划、状态更新和陈旧计划拒绝；独立GitOps模型验证自愈、prune、健康及业务断言；Argo配置示例 |

三个领域的全部知识点都位于案例之前；原始资料和学习资源保留，案例末尾有完整源码、下载、结果摘要与追问。对应的恢复、Serverless、交付详解文章也追加同一套实验。实验室首页增加代码包与验证范围入口；岗位覆盖表按实际新增知识和证据更新，并提供完整领域正文链接。手机版目录补充案例跳转。

## 九幅新图

- `v13-write-path.svg`：本地写前日志、提交与正常半同步AFTER_SYNC的不同确认边界。
- `v13-replica-fencing.svg`：副本应用110→130→125，数据追齐与旧主隔离分别验收。
- `v13-pitr-chain.svg`：基线+连续片段，排除误写与缺段反例。
- `v13-function-lifecycle.svg`：新环境与冻结后复用，持久任务状态在环境之外。
- `v13-batch-retry.svg`：标准SQS批次A/B/C的部分失败与投递时间线。
- `v13-serverless-capacity.svg`：40执行槽需求、30连接预算和约50条/秒积压增长。
- `v13-iac-three-states.svg`：刷新只改记录，正常apply推进资源。
- `v13-gitops-reconcile.svg`：制品→源修订→现场→资源健康→业务验收。
- `v13-drift-prune.svg`：字段自愈和对象清理两种变化。

图中文字不小于18px，包含title/desc。浏览器逐图检查文字边界与交叠，修复容量图中纵轴名称与1500刻度的交叠；将“稳态模型”改为“固定容量模型”，避免把持续增长队列误称为整体稳态。正文给出数字与限制条件，图未作为真实云性能测量。

## 可复核的执行结果

`dist/labs/cloud-deepening/validation.json` 保存环境、四程序结果和全部配套源码SHA256；代码、README、HCL、Argo示例及MySQL手册随 `cloud-deepening.zip` 发布。

1. `recovery_lab.py`：Python3.9.6、SQLite3.51.0；真实Backup API和事务。余额100经101/+10、102/+20、103/−5到125，104误清零。恢复到103得到125；缺102时在创建恢复库前拒绝；重复103不多写，同序号异参拒绝；新104/+5后余额130。
2. `event_batch_lab.py`：A提交后子进程以23退出；恢复B后A/B/C尝试数2/2/1，效果3；新运输ID的同业务动作不重复，同ID异参拒绝；两个并发本地进程处理X，尝试2、效果1。
3. `terraform_lab.py`：官方Terraform1.13.0 darwin_arm64下载与官方SHA256核对后执行。使用内建provider，验证原HCL、保存v1计划后配置改v2仍执行v1，再应用v2，无变化计划退出0，状态推进后陈旧计划被拒绝。代码只使用本地state，无外部provider或云资源。
4. `gitops_model.py`：确定性教学模型；self-heal关/开分别保留5/修复2；受管字段一致但available=0时尚未健康；保留Deployment、移除受管ConfigMap，prune仅按模型管理范围清理；未受管对象保留，业务旧版本验收失败。

MySQL手册只核对8.4官方选项和恢复步骤；当前本机无MySQL/PostgreSQL服务，Docker daemon不可用，未进行引擎恢复。Argo配置只做文档审阅，未做集群同步。SQLite应用日志不等于数据库WAL；GitOps模型不等于Argo/Flux；本地Terraform资源不等于云provider漂移或remote backend锁测试。这些界限在读者看到案例时就明确说明。

## 原始资料与维护

正文在相应领域列出MySQL8.4、PostgreSQL、SQLite、S3、Lambda/SQS、Terraform、Argo CD和Flux一手文档。重点复核：

- MySQL半同步接收/应用及AFTER_SYNC/AFTER_COMMIT；PITR材料起点、事务边界与GTID集合。
- Lambda/SQS同步批调用与直接异步Invoke的区别；ReportBatchItemFailures、顶层异常/FIFO、可见性硬校验与6倍建议余量。
- Terraform的refresh-only、保存计划和锁范围；Argo的同步/健康/业务、自愈/prune/allowEmpty和hooks；Flux对象与重试语义。

内容源是三个 `dist/cloud-*-mechanics.js`；案例在 `dist/cloud-field-cases.js`。脚本顺序由 `src/page-shell.html` 管理，生成初始HTML仍为100页。

修改实验后先运行：

```sh
python3 scripts/verify-cloud-deepening.py --terraform /absolute/path/to/terraform
node scripts/render-pages.cjs
```

再运行内容、公开页、教材、Cloud课程、知识资源、机制模型与 `check-cloud-deepening.cjs` 检查。新检查核对20点的正文/案例顺序、代码与执行摘要一致、关键失败结果及相应文章入口。浏览器另核对1280px桌面、390px手机、完整代码展开、图与宽表的局部滚动、目录跳转和深色模式。
