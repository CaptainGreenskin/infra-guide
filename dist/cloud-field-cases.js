/* Specific cases follow the complete field knowledge, never precede it. */
function fieldLabCode(file,label){return '<details class="full-code"><summary>'+label+'</summary>'+code(file,file.endsWith('.yaml')?'YAML':file.endsWith('.tf')?'HCL':'PYTHON',cloudDeepLabFiles[file])+'</details>';}
function fieldLabLinks(file){return '<p class="practice-links"><a href="labs/cloud-deepening.zip" download>下载完整代码与验证记录 ↓</a><a href="labs/cloud-deepening/'+file+'" download>下载本例源码 ↓</a><a href="labs/cloud-deepening/validation.json" target="_blank" rel="noopener">查看执行结果与源码摘要 ↗</a></p>';}
const cloudFieldCases={
 'cloud-data':()=>para('案例：一条确认历史经过 T101/+10、T102/+20、T103/−5，从基线余额 100 变成 125，T104 随后误清零。先预测需要哪些材料、在哪停止，再运行恢复。程序使用真实 SQLite 备份与事务；增量历史是自定义应用日志，用来隔离恢复链、原子重放与消费者验收这三件事。')+
 code('解压实验包后运行 · Python 3.9+ / 标准库','SH','python3 recovery_lab.py')+
 table(['检查顺序','操作','应当核对的结果'],[['完整恢复','基线100 + 连续101–103；排除104','余额125，进度103'],['缺段反例','移除102，仍要求到103','创建恢复库前拒绝，不跳过缺段'],['重复/冲突','原103重放，再用同序号换参数','原意图不再生效；异参拒绝'],['消费者继续','从恢复点执行新104/+5','余额130，进度104']])+
 code('本次实际运行的核心结果','JSON',JSON.stringify((()=>{const r=cloudDeepLabValidation.programs['recovery_lab.py'];return {restored:r.restored,gap_102_rejected:r.gap_102_rejected_before_restore,duplicate_103_no_effect:r.duplicate_103_no_effect,consumer_balance:r.consumer_balance};})(),null,2))+
 para('恢复不是把一个文件复制回来就结束。代码先验证目标前的连续序号和意图，再通过 Backup API 复制一致基线；每笔效果、回执和进度在同一事务内提交，最后做 integrity_check 与真实后续写入。它没有模拟数据库内部 WAL 重放，也没有测断电、跨区或并发备份。')+
 fieldLabCode('recovery_lab.py','展开完整恢复程序：连续性、事务与验收')+
 '<h3>迁移到 MySQL：把教学序号换成真实恢复坐标</h3>'+
 para('下载包的 MySQL 8.4 手册给出一致逻辑导出、文件位置核对、完整 binlog 链重放与消费者验收步骤。目标必须与源隔离；先确定完整事务边界，再设置开始与停止位置。手册中的命令已按官方选项核对，本次环境没有 MySQL 服务，因此没有把它计入实测结果。')+
 '<p><a href="labs/cloud-deepening/mysql-pitr.md" download>下载 MySQL 8.4 PITR 操作手册 ↓</a></p>'+
 knowledgeCheck('复习追问：日志文件“后面都有”，为什么仍恢复不到目标？','基线到目标之间必须有该引擎所需的连续历史，还要匹配版本、时间线、事务边界与解密条件。本例缺102就无法证明得到包含103的余额125；应补材料、换可覆盖目标的可信基线或明确选择可达恢复点。')+
 fieldLabLinks('recovery_lab.py'),
 'serverless':()=>para('案例：A/B/C 三个业务动作进入同一批。先让 A 在数据库提交后、返回响应前真实退出；再重投整批并让 B 临时失败。要验证的不只是函数有没有报错，而是每个动作产生几份效果、谁应该重投、回执能否解释结果未知。')+
 code('解压实验包后运行 · 不调用云 API','SH','python3 event_batch_lab.py')+
 table(['阶段','执行尝试','数据库与批响应'],[['提交间隙','A 提交后 os._exit(23)','效果A存在，调用者没有成功响应'],['再次处理整批','A重试，B失败，C成功','只返回 msg-B；A复用回执'],['恢复B','仅重试B','A=2/B=2/C=1次尝试，共3笔效果'],['并发争抢','两个本地进程处理同一X','2次尝试，1笔效果']])+
 code('本次运行结果的关键字段','JSON',JSON.stringify((()=>{const r=cloudDeepLabValidation.programs['event_batch_lab.py'];return {crash_exit:r.crash_after_commit_exit_code,response:r.second_batch_response,attempts:r.attempts_after_B_recovery,effects:r.effects_after_B_recovery,concurrent_X:r.concurrent_X};})(),null,2))+
 para('messageId 在本地固定数据中模拟运输标识，event_id 表示业务身份；新 messageId 携带同一个动作不会多写一份效果，同 ID 换参数则拒绝。此程序只处理 demo 租户，用本地共享 SQLite 验证真实跨进程原子提交；部署函数时应换成满足所需并发、耐久和权限的共享存储。')+
 fieldLabCode('event_batch_lab.py','展开完整批处理程序：提交、退出与部分失败')+
 para('这里没有启动 SQS，也没有测量云端可见性或弹性。映射到 AWS 时，先开启 ReportBatchItemFailures、按触发器设置超时与 redrive，再核对真实 receive→函数→持久提交→删除。将 /tmp 里的实验数据库直接放进函数，不能获得课程要求的跨环境持久回执。')+
 knowledgeCheck('复习追问：A/C 已提交，B 出错，handler 最后抛异常，是否只重投 B？','应先按整个调用失败处理；不能沿用“正常返回部分批次响应”的结果，A/C仍须防重。标准队列下部分失败需在映射中启用并正常返回相应 messageId；FIFO 还有组内顺序与未处理项规则。')+
 fieldLabLinks('event_batch_lab.py'),
 'cloud-delivery':()=>para('案例分两层：先用真实 Terraform CLI 看计划文件与 state，再用小型调谐模型隔离 GitOps 的状态变化。二者的验证范围分别展示，避免让一个模拟器的绿灯替代真实工具或集群。')+
 '<h3>一、保存了 v1 计划，修改成 v2 后执行哪一版？</h3>'+
 code('Terraform 1.13.0 为本次验证基线；先准备官方 CLI','SH','python3 terraform_lab.py /absolute/path/to/terraform')+
 fieldLabCode('main.tf','展开最小 HCL：只使用内建 terraform_data')+
 table(['阶段','动作','实际观察'],[['计划','保存v1，再把配置文件改v2','尚未改变本地受管状态'],['执行原计划','apply v1.tfplan','输出仍为v1摘要'],['重新计划/执行','为v2生成并应用新计划','记录更新为v2；无变化计划退出0'],['计划过期','另一计划已推进state，再应用旧计划','CLI拒绝陈旧计划']])+
 code('真实 Terraform CLI 验证摘要','JSON',JSON.stringify((()=>{const r=cloudDeepLabValidation.programs['terraform_lab.py'];return {terraform:r.terraform,provider:r.provider,saved_plan_fixed_v1:r.saved_v1_plan_applied_v1_despite_v2_config,no_change_exit:r.unchanged_plan_exit_code,stale_plan_rejected:r.stale_saved_plan_rejected};})(),null,2))+
 para('terraform_data 是内建 provider 的本地状态资源，不会创建两个 Pod 或云实例。此实验验证真实 init/validate/plan/show/apply 与保存计划语义；三方漂移图中的 provider 读取远端字段、remote backend 锁及真实云资源变更仍需目标环境验证。')+
 fieldLabCode('terraform_lab.py','展开 Terraform 实验驱动：逐步检查实际计划与结果')+
 '<h3>二、手改字段与删除对象，为什么是两套策略？</h3>'+
 code('运行确定性的调谐模型','SH','python3 gitops_model.py')+
 para('模型先固定 Git 期望 replicas=2，把现场手改为5；自愈关闭保持5，开启后恢复受管字段为2。应用 spec 后 available 仍为0，展示同步与健康的区别。随后保留 Deployment、从期望中移除受管 ConfigMap：prune关闭保留，开启清理受管ConfigMap，未受管对象仍在。最后让资源健康而业务返回旧版本，验收应失败。')+
 fieldLabCode('gitops_model.py','展开调谐教学模型：观察、修复、清理与验收')+
 fieldLabCode('argocd-application.yaml','查看需替换仓库与目标的 Argo CD 配置示例')+
 para('Argo 示例开启自动同步与 selfHeal，关闭自动 prune；使用前需要已有控制器、真实清单、源访问和项目权限。本次未执行集群同步。学习时分别改变一个策略、观察源修订/对象/status/业务结果，再测试清理保护、finalizer 与实际权限。')+
 knowledgeCheck('复习追问：state 刷新成功、Git 显示同步，为什么仍不足以宣布发布成功？','刷新对齐记录，GitOps同步对齐其比较范围；还需确认预期制品与配置生效、资源健康、数据兼容以及用户断言。计划、状态、对象与业务分别留下自己的证据。')+
 fieldLabLinks('terraform_lab.py')
};
function cloudFieldLabs(module){return cloudFieldCases[module]?'<div class="field-cases" id="field-lab">'+cloudFieldCases[module]()+'</div><h3>继续阅读领域详解</h3>':'';}
for(const [id,module,title]of [
 ['storage-recovery','cloud-data','配套实战：完整恢复、缺段拒绝与消费者继续'],
 ['serverless-execution','serverless','配套实战：批次部分失败与提交后退出'],
 ['delivery','cloud-delivery','配套实战：真实 Terraform 计划与 GitOps 调谐模型']
]){
 const article=articleByIdForCloud(id);
 article.sections.push([title,cloudFieldCases[module]()]);
 article.refs=[...new Set([...article.refs,...cloudKnowledgeDomain(module).refs])];
 article.updated='2026.11.04';
 article.minutes=Math.ceil(article.sections.reduce((n,s)=>n+s[1].replace(/<[^>]*>/g,'').length,0)/220);
}
