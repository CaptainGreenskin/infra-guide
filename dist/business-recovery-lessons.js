/* Restore a readable business cut, then recover authority/effects; preserve the existing RPO/RTO derivation. */
const recoveryContract=infraReadableHTML(
 '<div class="mechanism-core" id="recovery-business-contract">'+knowledgeSubhead('恢复对象是可继续服务的业务状态，不只是数据库文件')+
 table(['恢复层','需要核对的内容','单独通过仍缺什么'],[
 ['物理材料','备份、连续日志、校验、密钥、版本与权限','不保证报告的附件与索引齐全'],
 ['业务状态','报告、附件版本、引用、索引与授权可读','不保证旧写者已被阻断'],
 ['写入权威','谁能提升、当前代际、旧写请求被拒','不撤销已经发送的外部通知'],
 ['消费与效果','用户查询、队列/工作流、去重回执与对账','不自动恢复入口、容量与服务目标']])+
 para('高可用副本负责持续承载，备份与历史负责找回过去；逻辑误删可能很快复制到所有副本。恢复设计要先固定故障假设、已确认提交的含义、最低服务、允许只读的范围和外部效果。否则“数据库已连通”“副本已提升”“文件校验通过”会各自被误当成同一个恢复终点。',
 '数据库、对象存储、索引和身份往往有不同的提交与恢复机制。应由业务提交清单记录引用的不可变版本和摘要，明确哪些对象必须与哪些记录共同存在。下面的实验要求所有已恢复报告都保留对应附件；并不要求把所有曾经使用又已合法删除的中间文件永久保留。')+'</div>');

const recoveryCut=infraReadableHTML(
 knowledgeSubhead('共同恢复点按提交依赖求，不能独立挑各存储的最新文件')+
 para('本例11:30基线seq100已有R1。之后101/11:42新增R2→对象v2，102/11:54新增R3→v3，103/11:57新增R4→v4。12:00发生故障，数据库日志连续，恢复侧只有v1、v2、v4。将数据库直接重放到103，物理integrity_check仍ok，数据库位置距故障3分钟，但R3引用缺失。数据库位置合格与业务RPO合格是两个判断。')+
 figure('v27-consistent-recovery-cut','真实SQLite与对象夹具。缺v3使本题最后完整前缀停101；v4存在也不能跳过需要保留的R3。题设分钟不是恢复耗时。')+
 para('逐提交验证引用版本和摘要，在102失败时回滚该步，最后能证明完整的前缀是101/11:42，缺口18分钟，超过15分钟目标。若v3补齐，103可恢复，缺口3分钟；若日志102缺失，也不能跳到103；若对象v2内容损坏，101就不能接受，只剩100基线。恢复结论来自实际可取用、可验证的材料，而非某个归档任务曾经显示成功。',
 '18分钟表示完整恢复点距故障的时间，不表示恰好丢失18分钟里的每笔数据，也不是缺失报告数量。程序分别列出数据库中的报告行和可实际读到附件的报告：直接恢复103有四行，却只能读R1、R2、R4；按完整前缀恢复101可读R1、R2。是否允许跳过或修复某笔业务，要另有明确协议，不能把部分可读悄悄当作完整恢复。',
 '真实数据库的物理恢复必须使用它支持的备份与日志协议。PostgreSQL连续归档需要从基线所需位置开始的连续WAL；逻辑导出不能直接充当这种物理重放的基线，数据库配置文件也不由WAL自动恢复。本站程序用SQLite Backup API和应用逻辑日志解释业务依赖，没有实现PostgreSQL WAL或跨服务原子快照。')+
 knowledgeCheck('数据库和附件各自“最新可恢复”，为什么组合后仍可能坏？','两份最新状态未必属于同一个业务提交集合。按记录实际引用的对象版本、摘要与必要历史验收，再决定完整恢复前缀或明确修复方案；不能只比较两个备份任务时间。'));

const recoveryCriticalPath=infraReadableHTML(
 knowledgeSubhead('把用户恢复时间分成阶段，改进应落在关键路径上')+
 para('沿原演练的同一时间线：发现4、判断/冻结4、取得权限4、装载16、重放5、消费者校验5、切流稳定4分钟，串行共42。数据量翻倍且装载吞吐不变，装载变32，其他阶段保持不变时共58，超过45分钟目标13分钟。这比“备份更多一点”更直接指出需要改进哪一段。')+
 knowledgeFormula('本题串行恢复预算','4 + 4 + 4 + 16 + 5 + 5 + 4 = 42分钟；装载改32后为58分钟','真实依赖若允许并行，应按最长依赖路径计算；不能简单相加并行阶段，也不能随意删掉权限和用户验证。')+
 para('演练记录阶段起止、数据量、有效吞吐、输入材料和消费者结果，再比较更快下载、预置热数据或并行恢复究竟缩短哪条路径。只计命令运行时间会漏掉发现、决策、身份和切流；把数据恢复点距故障的18分钟再加到42分钟，又混合了RPO与RTO两条时间轴。'));

const recoveryEffects=infraReadableHTML(
 knowledgeSubhead('应用状态可倒退，写入权威与外部效果不能跟着猜')+
 para('从旧备份恢复后，outbox里某条通知可能重新成为PENDING，但接收方早已提交。若恢复器生成新动作ID再发送，接收方会认为是新业务。应保留跨备份稳定的业务身份、参数摘要和独立回执；查询或沿对方的幂等协议确认原效果，再更新本地完成状态。')+
 figure('v27-restored-outbox','真实本机HTTP：应用恢复为PENDING，接收方仍保留37；当前代际与原动作ID复用回执。独立副本上错换新ID会变2笔。')+
 para('接管还需要阻断旧写者。实验将接收方的权威代际从1升到2，并在同一事务中校验代际、检查意图和写效果；旧代际的新请求409，当前代际沿原ID返回200/duplicate=true。权威代际存储不随应用备份回退，否则旧执行者可能重新变“合法”。',
 '代际号本身不是凭据。谁有权提升、执行者身份如何确认、权威存储在分区中如何保持一致，须由目标系统实现；本例是受信夹具控制器。只在客户端读一次“当前代际”，再不受条件约束地写入，仍有检查与提交间隙。停止旧进程、改DNS或声明已提升，也不能单独证明接收方拒绝旧写入。'));

const recoveryPractice=infraReadableHTML(
 knowledgeSubhead('实战一：实际备份、对象依赖与最后完整前缀')+rarLab('consistent_recovery_cut.py')+
 knowledgeSubhead('实战二：恢复outbox、旧写者与外部回执')+rarLab('recovered_effects.py')+
 para('先预测只缺v3时，数据库校验、名义数据点和业务校验各得什么结果；再预测恢复后换新ID会有几笔通知。把演练带到目标环境，继续验证真实密钥、身份、物理日志、入口、容量和用户读写。局部程序通过为这些问题提供机制依据，完整RTO仍以实际故障到约定服务恢复的观测为准。'));

{
 const a=articles.find(a=>a.id==='resilience'),old=a.sections.slice();
 a.sections=[['恢复合同：材料、业务、权威与消费者',recoveryContract],old[0],old[1],old[2],['共同恢复点：连续提交与对象版本',recoveryCut],['恢复关键路径：阶段预算与数据规模',old[3][1]+recoveryCriticalPath],['写入接管与效果：旧写者、回执和重新消费',old[4][1]+recoveryEffects],old[5],['实战：完整前缀与恢复后的外部效果',recoveryPractice],old[6]];
 a.refs=nitRefs([...a.refs,'v27PITR']);a.minutes=65;a.updated='2026.11.05';
 a.objectives=['定义故障假设、业务恢复点与用户恢复终点','按跨存储依赖、关键路径和旧写者推导恢复条件','运行备份/对象与HTTP回执实验，并设计目标环境演练'];
}
cloudKnowledgeExplanations['recovery-evidence']=recoveryContract+cloudKnowledgeExplanations['recovery-evidence']+recoveryCut+recoveryCriticalPath+recoveryEffects;
cloudKnowledgeDomain('sre').refs=nitRefs([...cloudKnowledgeDomain('sre').refs,'v27PITR']);
const recoveryLabsBeforeRAR=cloudFieldLabs;
cloudFieldLabs=id=>(id==='sre'?'<h3>恢复验收：完整业务状态与外部效果</h3>'+rarLab('consistent_recovery_cut.py',false)+rarLab('recovered_effects.py',false)+linkTo('resilience','阅读故障域、恢复点与完整演练设计'):'')+recoveryLabsBeforeRAR(id);
