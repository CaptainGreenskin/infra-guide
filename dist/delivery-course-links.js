/* Three authored concept sequences and a precise place in the existing course. */
Object.assign(chapterConceptPaths,{
 'message-delivery':{terms:['消息','生产者','代理','消费者','确认','回执','通道'],steps:[
  ['先把业务动作和运输消息分开','消息承载需要处理的数据，生产者发送、代理接收并投递、消费者执行。一个业务动作可能经历多次运输与尝试，业务身份需要跨这些变化稳定，才有依据判断是否重复完成。'],
  ['再分清三份确认来自谁','生产者收到代理的确认，消费者向代理确认处理，业务接收方记录效果回执，三者不是同一层事实。通道中的投递编号有自己的作用域，不能直接拿它当业务回执或全局动作身份。'],
  ['把退出位置放回数据路径','本章先解释路由、投递和提交，再实际杀死消费者，分别读取代理与业务库。接着改变预取接口和代理生命周期，观察哪些保证仍成立，最后再与Serverless触发契约比较。']]},
 'terraform-state':{terms:['配置','状态','资源','提供程序','后端','计划','工作空间'],steps:[
  ['先有期望、记录和真正存在的对象','配置描述想要的资源，状态保存配置地址与受管对象的联系，实际资源存在于目标系统。三者可以不同，先分开它们，才能解释“计划没变化”和“实际符合期望”为什么不是同一句话。'],
  ['再看工具通过谁读取和修改','提供程序把资源操作适配到目标系统，后端保存状态并提供相应锁定能力。计划比较本次采用的观察，执行才推进实际修改或持久记录；锁与刷新保护的是不同边界。'],
  ['最后把多人操作与归属连起来','工作空间让同一配置选择不同状态，不会自动改变实际资源名字。本章用两个进程和同一个文件走通锁、漂移、只刷新与修复，再观察两份状态是否仍可能争夺同一目标。']]},
 'gitops-reconciliation':{terms:['Git','期望','控制器','调谐','同步','健康','业务结果'],steps:[
  ['先有一份确定版本的声明','Git保存版本化内容，期望说明要在目标系统中建立什么。控制器不断观察现场，与期望比较，再执行调整；调谐是这个持续循环，不是一条永远成功的同步命令。'],
  ['再把对象状态和进程状态分开','同步判断声明比较范围，健康判断资源规则；业务结果来自真实进程处理请求。配置已经改变，不代表旧进程已重新读取，也不代表用户已经拿到正确版本。'],
  ['用同一服务贯穿策略与验收','本章先解释自动同步、自愈、清理和配置生效，再让真实控制器跟踪三份固定源。每次同时看源、对象、进程身份和响应，最后用独立判据决定是否完成交付。']]}
});
for(const[module,ids]of [['serverless',['message-delivery']],['cloud-delivery',['terraform-state','gitops-reconciliation']]]){
 const row=cloudModulePlan.find(r=>r[0]===module);for(const id of ids)if(!row[7].includes(id))row[7].push(id);
 const stage=cloudLearningStages.find(s=>s[1].includes(module==='serverless'?'serverless-execution':'delivery'));
 const after=stage[1].indexOf(module==='serverless'?'serverless-execution':'delivery');stage[1].splice(after+1,0,...ids);
}
const cloudIntroStage=cloudLearningStages[0];cloudIntroStage[0]='先看全貌，再按需补系统前置';cloudIntroStage[1].unshift('cloud-overview');
const cloudResourceStage=cloudLearningStages[1];cloudResourceStage[1]=cloudResourceStage[1].filter(id=>id!=='cloud-overview');
cloudStageFields[0]=['compute','foundation'];
const pointTargets={'messaging':'message-delivery','trigger-delivery':'message-delivery','event-idempotency':'message-delivery','iac':'terraform-state','gitops':'gitops-reconciliation'};
for(const domain of cloudKnowledgeDomains)for(const p of domain.points){
 const target=pointTargets[p[0]];if(target&&!p[4].includes(target))p[4].push(target);
}
cloudKnowledgeExplanations['trigger-delivery']+=para('继续沿运输机制核对：真实RabbitMQ实验中，生产者收到代理确认、消息正确路由、消费者ACK和业务效果提交各有独立条件；不存在队列时，关闭mandatory的发布仍可正常确认。不能把这种AMQP接口当成SQS协议。');
cloudKnowledgeExplanations['event-idempotency']+=para('真实代理重投与重新发布分别验证了两类重复：运输标识可以保留或改变，report-27业务身份不变，接收方都复用原37的回执。先ACK后提交的负例则队列为0、效果为0，必须按独立目标判失败。');
cloudKnowledgeExplanations['iac']=cloudKnowledgeExplanations['iac'].replace(/远端对象 ID/g,'目标对象 ID').replace(/读取远端对象/g,'读取目标对象');
cloudKnowledgeExplanations['iac']+=para('实际local_file实验再把三份事实分开：关闭刷新时，文件已被改成outside但计划仍退出0；只刷新移除旧状态绑定而保留文件，正常修复才恢复alpha。两个工作空间也可以指向同一路径，状态隔离不自动带来资源隔离。');
cloudKnowledgeExplanations['gitops']+=para('真实Argo CD在kind中验证：只改ConfigMap后，应用已Synced/Healthy，原Pod仍返回v1；修改模板并替换Pod后才返回v2。自愈和清理分别核对，未受管对象不因本应用prune而被删除。');
for(const id of ['C5','C6']){
 const row=cloudCoverageRows.find(r=>r[0]===id);
 if(id==='C5')row[2]='展开函数环境、触发、重投、批次、并发与成本；新增真实RabbitMQ的发布确认、运输ACK、进程崩溃重投、预取接口差异和持久重启，独立核对业务效果。';
 else {row[2]='展开兼容发布、状态与调谐；真实Terraform local_file验证状态锁、刷新和工作空间争用，kind内Argo CD验证自愈、清理与实际HTTP版本。';row[3]='尚未验证云provider/remote backend、生产规模Argo/Flux、物理多节点或client-go/Operator实现；kind与临时文件的范围分别标注。';}
}
