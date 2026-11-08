/* Concepts are declared after the common concept-path dictionary, before rendering. */
chapterConceptPaths['agent-recovery'].steps[2]=['先完成单执行者恢复，再进入接管','本章逐个移动崩溃位置，把未知结果、工具回执与本地完成连起来。恢复证明了同一动作能继续，不代表旧执行者已停止；多执行者的租约与代际拒绝属于下一层机制，在后续工作流章节继续展开。'];
Object.assign(guidedLessons['agent-recovery'],{scenario:'贯穿案例：操作logical-add-1为demo增加37，运行器在六个窗口被杀死；恢复后仍只允许一个效果。'});
cloudKnowledgeExplanations['container-isolation']+=para('真实容器对照分别读视图与资源：两个同时存活的容器有不同PID/mount/network namespace；CPU带宽、96MiB内存和16个任务名额使用不同证据。namespace标识可能在退出后复用，不能把先后两个短进程的编号比较当隔离证明。')+linkTo('container-runtime','进入分层机制、计数差值与真实容器实验');
cloudKnowledgeExplanations['placement']+=para('实际kind集群把准入与放置分开验证：300m配额已有250m，再加100m被拒绝且无Pod对象；5 CPU单Pod不能放进任一4 CPU节点。添加容忍只解除对应污点，两个主机域都被硬反亲和占用时，第三个Pod仍等待。')+linkTo('scheduling-resources','进入约束矩阵与隔离集群实验');
for(const d of infraKnowledgeDomains)for(const p of d.points){
 if(p.id==='sv-optimizations'){
  if(!p.articles.includes('speculative-decoding'))p.articles.push('speculative-decoding');
  p.body+=para('完整机制章再用三词元p=[1/2,1/3,1/6]、q=[1/6,1/3,1/2]逐项补齐质量，并枚举27条前缀相关序列。实际CPU模型把第二候选改错，裁回接受前缀后与串行K/V一致；不裁缓存则下一步分数也改变。精确分布、真实缓存与GPU速度是三层判据。');
 }
 if(p.id==='ag-recovery')p.body+=para('六窗口实测进一步区分查询时刻与最终事实：运行器被SIGKILL后，工具提交前的GET为空，旧请求仍可能随后提交。恢复沿用原操作身份，让迟到与重试在接收方汇合；故意换新身份得到两次效果/74，本地DONE仍可出现，独立业务验收则拒绝。');
}
chapterConceptPaths['speculative-decoding']={terms:['词元','前缀','目标模型','草稿模型','接受','残差','缓存'],steps:[
 ['先有按前缀预测下一个编号的模型','词元是分词器使用的编号单位，前缀是已经确定的词元序列。目标模型规定希望保留的输出概率，草稿模型负责提出候选；二者必须对齐所讨论的词元与前缀，才能比较同一事件的概率。'],
 ['提议不直接交付，要先校正概率','接受留下目标与草稿共同拥有的概率质量；拒绝时从残差分布补回目标缺少的部分。本章用三个词元逐项手算，再枚举多轮完整序列，说明为什么“拒绝后再按目标抽一次”仍会算错。'],
 ['并行核对以后，只提交连续接受的部分','缓存保存处理过的位置对应的中间键和值。批量验证会产生尚未确认位置的缓存，遇到拒绝就回退到接受前缀。本章用实际CPU张量核对，再把正确性、模型调用数与真实速度分开讨论。']
]};
