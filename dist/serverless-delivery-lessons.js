/* Trigger-specific delivery identities, visibility, response interpretation, then executable practice. */
const deliveryIdentities=infraReadableHTML(
 '<div class="mechanism-core" id="serverless-delivery-identities">'+knowledgeSubhead('消息ID、接收句柄、业务动作ID分别解决什么')+
 table(['身份','寿命与用途','不能替代什么'],[
 ['运输消息ID，如SQS messageId','标识一条运输消息；生产者重新发送可能得到新ID','不能单独识别跨重新发布的同一业务动作'],
 ['接收句柄，如ReceiptHandle','本次接收得到；重复接收同消息会得到不同句柄，用于该次删除等操作','不能当稳定业务幂等键，也不是业务授权'],
 ['业务动作ID，如tenant+operation_id','跨重投稳定，绑定目标、参数与回执','不能代替每次接收的运输确认或当前权限']])+
 para('例如同一份日报report-27有msg-A第一次接收和第二次接收，两个ReceiptHandle不同，业务动作仍同一个。生产者补发成msg-A-republished，运输ID又变，仍不应再写一份日报。相反，同一业务ID改了金额，不能直接返回“重复成功”，应按意图摘要拒绝冲突。身份的作用域、保留期和生成责任都要写清。',
 '在Lambda的SQS部分批次响应里，itemIdentifier使用本批记录的messageId，让映射知道哪条记录失败；业务服务防重用自己的稳定动作ID。直接把接收句柄拿去做业务去重，下一次接收就会换键；只用金额和内容摘要，又可能吞掉两笔内容相同的合法动作。')+'</div>');

const deliveryVisibility=infraReadableHTML(
 knowledgeSubhead('可见性截止影响重新接收，不会杀死旧代码或撤销外部写权限')+
 para('SQS接收消息后，消息暂时对后续接收不可见，计时从取到消息开始。处理成功后按接收句柄删除；没及时删除则可再次出现。标准队列的至少一次语义仍要求处理重复，不能将不可见期解释为全局互斥锁，更不能由此推出“最多一个执行者可能产生效果”。')+
 figure('v26-visibility-not-fencing','可控时钟的本地SQLite参考：第1执行者在可见性到期后仍提交37，第2执行者通过稳定业务回执确认。它不是云端实测。')+
 para('参考中0秒接收、可见性30秒，31秒另一次接收开始，旧执行者仍在运行，并先提交业务效果。可见性没有改变它持有的服务凭据，也没有阻止它发请求。若业务端不做稳定身份与原子回执，两个执行者都可能各写一份。若确需阻止旧持有者写入，还须由效果接收方验证当前代际等条件；队列可见性本身没有替你完成。',
 '续期也有失败窗口。20秒续30秒，本参考把截止点改为50秒，而不是给最初的30再加30。续期请求超时则结果可能未知，不能根据一份本地定时器认定仍独占。心跳应提前、有限重试并受总期限约束；SQS还有自首次接收计算的最长可见性限制，长工作应按服务约束拆分或采用合适的工作流。',
 '删除使用最近一次接收句柄。AWS文档特别说明：旧ReceiptHandle的删除调用可以成功但消息不一定被删；标准队列即便删除后，少数情形仍可能收到副本。因此API 200不是唯一效果证明。本地参考为了便于看出边界，严格拒绝旧/过期句柄；不能将它的布尔返回当作SQS线协议。')+
 knowledgeCheck('把可见性从30秒设为5分钟，能消除重复业务效果吗？','不能。只是改变重新可见的时机，还可能延长故障后等待；已有执行者、响应丢失与重复副本仍需按业务动作防重。先按处理、批窗口与重试要求配置，再验证效果与回执。'));

const deliveryBatch=infraReadableHTML(
 knowledgeSubhead('部分批次失败是映射与handler共同的协议')+
 para('以标准队列A/B/C三条记录为例，A与C完成，B失败。启用ReportBatchItemFailures且handler正常返回B的messageId，映射才按部分失败处理。只是返回一个叫batchItemFailures的JSON字段，并不会自动打开平台选项。接口的正常返回、函数顶层异常和每条记录的失败，是三层信号。')+
 figure('v26-batch-response-paths','四条策略路径使用同一固定输入。FIFO的C未被执行，必须与B一起返回，不能套用标准队列继续处理后续项的路径。')+
 table(['配置与返回','确认/重投含义','业务风险'],[
 ['选项已启用，正常返回B','A/C成功路径，B保留待重投','成功项仍须容忍可能重复'],
 ['选项未启用，吞掉B异常后正常返回','部分响应不被解释，整次可能被当成功','B没有效果却被确认，静默丢工作'],
 ['最终抛异常或超时','整批按失败处理','A/C已有副作用，重投时必须防重'],
 ['FIFO首个失败后停止','返回失败与所有未处理项','避免后项越过前项；还要按消息组核对顺序']])+
 para('“B已经进失败列表”也不能保证生效：如果handler之后又抛异常，就没有正常交付部分响应。顶层兜底如果捕获所有错误却返回空失败列表，又可能把整批当成功。评审代码时沿退出路径检查响应结构、itemIdentifier来源、哪些记录真正执行，以及对应效果是否已提交。',
 'FIFO对同组顺序有额外约束。官方建议使用部分响应时，在第一个失败后停止处理，并返回失败和未处理记录。本参考用同一组A/B/C演示：A成功，B失败，C未处理，故返回B、C。跨组并行或不同事件源要按实际契约另设计，不能从这一个顺序参考推断全部消费行为。'));

const deliveryPractice=infraReadableHTML(
 knowledgeSubhead('实战一：可见性、旧执行者与业务回执')+lpsLab('visibility_receipts.py')+
 knowledgeSubhead('实战二：先手算四条批次退出路径')+lpsLab('batch_response_reference.py')+
 para('先预测旧执行者在第32秒还能不能提交，再核对唯一效果。把第2次接收从31移到29，按本参考还应拿不到；20秒续30秒后，31秒也拿不到。再预测部分响应未启用却正常返回时B会怎样，这与最终抛异常的整批重投完全不同。真实平台验证时记录接收、执行、持久提交、正常返回/异常、删除、重投与DLQ的同一组身份。'));

{
 const a=articles.find(a=>a.id==='serverless-execution'),old=a.sections.slice();
 a.sections=[old[0],old[1],old[2],['投递身份：消息、接收句柄与业务动作',deliveryIdentities],['可见性与续期：重投没有封住旧写者',deliveryVisibility],old[3],['批次协议：选项、正常返回、异常与FIFO',deliveryBatch],old[5],old[6],old[7],['本地参考实战：可见性与批次退出路径',deliveryPractice],old[4],old[8]];
 a.refs=nitRefs([...a.refs,'v26Receipt','v13Visibility','v13Batch']);a.minutes=65;a.updated='2026.11.05';
 a.objectives=['按触发器区分受理、执行、确认和业务提交','解释三层身份、可见性续期与批次响应的边界','复现参考与真实进程提交实验，按唯一业务产出核对容量和成本'];
}
cloudKnowledgeExplanations['trigger-delivery']+=deliveryIdentities+deliveryVisibility+deliveryBatch;
cloudKnowledgeDomain('serverless').refs=nitRefs([...cloudKnowledgeDomain('serverless').refs,'v26Receipt']);
const deliveryLabsBeforeLPS=cloudFieldLabs;
cloudFieldLabs=id=>(id==='serverless'?'<h3>可见性与批响应：先确认协议，再看效果</h3>'+lpsLab('visibility_receipts.py',false)+lpsLab('batch_response_reference.py',false)+linkTo('serverless-execution','阅读触发器、确认与完整实战'):'')+deliveryLabsBeforeLPS(id);
