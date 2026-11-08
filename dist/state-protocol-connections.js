/* Course position and role priorities share the same three new source lessons. */
Object.assign(chapterDependencies,{
 'control-plane-consensus':[['kubernetes-basics','先认识API对象与控制循环，再下钻其期望状态怎样持久提交和被观察。'],['distributed-systems','部分失败与结果未知是理解多数派、隔离成员和重试边界的前提。']],
 'mysql-replication':[['mysql-recovery','提交日志、恢复坐标与连续变化记录，继续连接副本应用和新写资格。'],['database-index-locks','普通一致读与事务提交先确定，才能分开行版本旧读和副本落后。']],
 'mcp-protocol':[['agent-runtime','先区分任务、模型提议和工具执行，再把一项受控调用落实为真实协议交换。']]
});
for(const[chapter,target,reason]of [
 ['kubernetes-basics','control-plane-consensus','继续沿已保存的API对象，核对多数派提交、读取、变更监听与快照恢复。'],
 ['mysql-recovery','mysql-replication','恢复日志之后，继续验证另一实例应用到哪一项提交，以及谁有资格接新写。'],
 ['agent-runtime','mcp-protocol','把工具契约连接到真实MCP客户端与服务端，同时区分协议版本和业务结果。']
]){
 const list=chapterOptionalConnections[chapter]||(chapterOptionalConnections[chapter]=[]);
 if(!list.some(([id])=>id===target))list.push([target,reason]);
}
// Insert each lesson into its teaching sequence. Appending a target would put
// introductory protocol/state knowledge after the profile's final capstone.
for(const[profile,id,before]of [
 ['cloud-platform','control-plane-consensus','serverless-execution'],
 ['cloud-sre','mysql-replication','k8s-networking'],
 ['cloud-sre','control-plane-consensus','elasticity'],
 ['agent-app','mcp-protocol','agent-security'],
 ['agent-platform','mcp-protocol','agent-sandbox']
]){
 const targets=learningProfiles[profile].targets;
 if(targets.includes(id))continue;
 const position=targets.indexOf(before);
 if(position<0)throw Error('Missing teaching position for '+profile+': '+before);
 targets.splice(position,0,id);
}
courseStageConnections.cloud[1]=['把单进程放到跨机器的数据路径','资源供给 → 地址与路由 → 数据提交 → 日志与副本应用 → 恢复与写入资格','把CPU、网络、事务、缓存、复制与恢复放回同一次请求，分别解释可见性、进度和谁能继续写。'];
courseStageConnections.cloud[2]=['把执行对象交给声明式控制','容器 → API期望 → 多数派提交与变更观察 → 调谐 → 放置 → 可用服务','对象持久保存、观察者追上版本、进程运行和业务可用分别取证；成员隔离不等于应用进程立即停止。'];
courseStageConnections.agent[0]=['先规定委托与实际执行之间的边界','用户目标 → 模型提议 → 工具契约与协议消息 → 可信检查 → 受限执行','运行时负责调用和验收，协议连接工具提供方，身份、授权和隔离分别约束实际动作；每一步都要明确负责的对象。'];
learningTrackModels.cloud.anchors.push(['control-plane-consensus','控制状态与观察'],['mysql-replication','副本应用与写资格']);
learningTrackModels.agent.anchors.splice(1,0,['mcp-protocol','协议与工具连接']);
