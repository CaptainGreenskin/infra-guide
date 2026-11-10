/* Three independent lessons extend their existing domains without lengthening old chapters. */
Object.assign(chapterConceptPaths,{
 'control-plane-consensus':{terms:['控制面','etcd','成员','多数派','修订号','监听'],steps:[
  ['先分清期望状态保存在哪里、由谁执行','控制面管理系统的期望状态，工作节点执行实际应用。etcd是一种按键保存值的数据库，Kubernetes用它持久保存API对象；对象已经保存，仍不等于控制器已经创建Pod或应用已经可用。'],
  ['再看多份记录怎样决定同一次提交','成员是共同维护一份逻辑数据库的服务进程。领导者安排写入顺序，必须得到多数派成员的认可才可推进相应提交；三份数据副本与三个工作负载副本承担不同职责，机器数量也不自动等于跨故障域。'],
  ['把读取、变更流和恢复连起来','修订号标记键值历史的逻辑进展，监听将某个起点之后的变更送给观察者。读取能否确认最新、旧历史是否仍保留、快照恢复后观察者如何重建，都要回到这条历史判断，再运行真实成员的隔离与恢复实验。']]},
 'mysql-replication':{terms:['事务','行版本','读视图','复制','GTID','切换'],steps:[
  ['先确定同一个数据库里读到哪一版','事务把一组数据库操作放进约定的提交范围。更新可能留下不同的行版本，读视图决定本次普通一致读应选哪些已提交版本；同一实例上的旧读，不能直接解释成远端副本落后。'],
  ['再区分另一份数据库收到什么、应用了什么','复制把源端的事务记录送往副本，接收和应用是两个阶段。GTID是标识一项事务的全局编号；比较收到与已执行的编号集合，才能判断某项写入是否已经进入副本可查询的状态。'],
  ['最后决定新的写入由谁接受','切换改变服务读写指向。先停止旧端接收新的业务写入，固定最终提交集合，再核对候选已经应用、隔离旧实例，新端才可承接写入。本章把读视图、复制停顿和有计划切换放进同一组真实数据库结果，不用副本数量代替恢复证据。']]},
 'mcp-protocol':{terms:['客户端','服务端','工具','协议','请求标识','版本'],steps:[
  ['先把调用工具的两端找出来','客户端由应用或Agent运行时管理，向服务端发出调用；服务端公布工具并执行相应程序。模型可以提出建议，真正建立连接、检查调用和读取结果的是程序。协议约定两端怎样交换可解释的消息。'],
  ['连接方法先对应到明确的协议版本','版本决定消息约定。2026-07-28这代MCP在每个请求声明版本与能力，较早版本使用初始化握手。发现可用工具和连接服务器，不会自动给予业务权限；本章分别运行两代流程，避免把一种启动方法讲成永久规则。'],
  ['再把消息结果连回任务与生命周期','请求标识帮助匹配一次协议调用的响应，它不自动成为跨重试的业务动作身份。参数结构通过、工具报告成功、实际资料正确要分别核对；进度、取消和连接关闭也各有作用范围，最后用真实SDK与独立来源验收这些关系。']]}
});
for(const[module,id,after]of [['native','control-plane-consensus','k8s-autoscaling'],['cloud-data','mysql-replication','mysql-recovery']]){
 const ids=cloudModulePlan.find(row=>row[0]===module)[7];
 if(!ids.includes(id))ids.splice(ids.indexOf(after)+1,0,id);
 const stage=cloudLearningStages.find(row=>row[1].includes(after));
 if(!stage[1].includes(id))stage[1].splice(stage[1].indexOf(after)+1,0,id);
}
const stateProtocolKnowledgeTargets={reconciliation:'control-plane-consensus','database-service':'mysql-replication','replication-failover':'mysql-replication'};
for(const domain of cloudKnowledgeDomains)for(const point of domain.points){
 const id=stateProtocolKnowledgeTargets[point[0]];
 if(id&&!point[4].includes(id)){const recovery=point[4].indexOf('resilience');point[4].splice(recovery<0?point[4].length:recovery,0,id);}
}
const mcpToolPoint=infraKnowledgeDomains.flatMap(domain=>domain.points).find(point=>point.id==='ag-tools');
if(!mcpToolPoint.articles.includes('mcp-protocol'))mcpToolPoint.articles.splice(mcpToolPoint.articles.indexOf('agent-runtime')+1,0,'mcp-protocol');
for(const id of ['control-plane-consensus','mysql-replication','mcp-protocol']){
 articles.find(a=>a.id===id).textbook=true;
 focusChapters.add(id);
}

mcpToolPoint.body+=para('跑一遍<a href="/article/mcp-protocol/#native-mcp-result-receipt">提交后的坏回执</a>，区分输出结构、操作身份与接收方已经写入的结果。');
articles.find(a=>a.id==='mcp-protocol').updated='2026.11.11';
