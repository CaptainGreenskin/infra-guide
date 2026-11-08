/* Stable chapter URLs, explicit reading destinations, and one training object correspondence. */
(()=>{
 const p=(...rows)=>rows.map(x=>'<p>'+x+'</p>').join('');
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const changed=new Set();
 function chapter(id){const a=articles.find(a=>a.id===id);if(!a)throw Error('Continuity unknown chapter '+id);return a;}
 function edit(id,index,from,to){const a=chapter(id),s=a.sections[index];if(!s[1].includes(from))throw Error('Continuity source changed '+id+' '+from);s[1]=s[1].replace(from,to);changed.add(id);}
 function add(id,index,html){chapter(id).sections[index][1]+=html;changed.add(id);}
 const to=(id,anchor,label)=>'<a href="/article/'+id+'/'+(anchor?'#'+anchor:'')+'">'+label+'</a>';
 edit('model-serving',5,'下一章从客户端时间戳算TTFT、TPOT和窗口吞吐，再把它们接回调度轨迹。',to('inference-performance','','性能评估章')+'从客户端时间戳计算 TTFT、TPOT 和窗口吞吐，再接回调度轨迹；目录中间的量化章另外解释数值表示。');
 edit('model-serving',6,'时间全部为给定输入，下一章展开这些分母。','时间全部为给定输入，'+to('inference-performance','','推理性能章')+'展开各指标的计时边界和分母。');
 edit('concurrency-pools',7,'事务是数据库把一组操作作为整体提交或撤销的边界，下一章继续解释查询与事务锁等待。','事务是数据库把一组操作作为整体提交或撤销的边界，'+to('database-index-locks','','SQL 索引与事务章')+'会结合查询计划解释数据库里的锁等待。');
 edit('agent-security',5,'下一章展开实际执行环境，恢复章展开提交之后的事实核对。',to('agent-sandbox','','沙箱章')+'展开执行环境，'+to('agent-recovery','','恢复章')+'展开提交后的事实核对。按 Agent 应用路线阅读时，可先进入恢复，沙箱作为执行平台专题选读。');
 edit('transformer-block',8,'下一章先完成位置编码的推导；随后训练章沿同一664参数模型，把每个位置的logits与目标编号比较，得到标量损失，并让梯度沿这里的所有使用路径返回参数。',to('position-encoding','','位置编码章')+'推导顺序与相对位移；'+to('autograd-training','','自动求导章')+'沿同一 664 参数模型比较 logits 与目标编号，得到标量损失，并把梯度沿各条使用路径传回参数。完整课程先读位置编码；分布式训练路线可按既定先修直接进入自动求导。');
 edit('transformer-block',5,'下一章推导位置表示、旋转与相对位移 →','位置编码：位置表示、旋转与相对位移 →');
 edit('autograd-training',8,'带到下一章的记录','带到后续训练实验的记录');
 edit('operator-profiling',4,'继续推导带宽与算力上界','回看带宽与算力上界');
 edit('operator-profiling',8,'继续理解注意力怎样减少中间搬运','回看注意力怎样减少中间搬运');

 // Similar sample IDs in different programs must not imply one persistent task.
 const mcp=chapter('mcp-protocol');
 const firstParagraphEnd=mcp.sections[0][1].indexOf('</p>');
 if(firstParagraphEnd<0)throw Error('MCP first paragraph missing');
 mcp.sections[0][1]=mcp.sections[0][1].slice(0,firstParagraphEnd+4)+p('本章协议实验独立建立 report-A/v3 的数据与进程：基础批次 10+27，再读补录 5，合计 42。运行时章的日报 37 用来介绍执行循环；这里借用相近金额解释多次协议调用，两章没有共享任务数据库。')+mcp.sections[0][1].slice(firstParagraphEnd+4);changed.add('mcp-protocol');
 edit('agent-memory',3,'继续沿R17追踪保存身份。本节恢复夹具的业务结果与回执值为13，原操作R17:publish的效果计数为1，用原回执和效果次数判断是否重复执行；运行时章的37则用于核对日报内容。','本节另建一个内存与恢复的 SQLite 夹具：它的操作名为 R17:publish，业务结果与回执值为 13，效果计数为 1。该数据库独立于运行时章的日报 37，重复使用的 R17 只是本例标识，并没有把原操作的参数从 37 改成 13。这里按本例原回执和效果次数判断重复执行。');
 const obs=chapter('agent-observability');
 obs.sections[0][1]=p('本章使用独立的发布任务与数据库，例子标识为 R27、R27:publish，总数为 37。检索章的排障题 R27、沙箱章的画图题 R27各有自己的输入与运行环境；这些名称相同的夹具不共享任务状态或操作回执。')+obs.sections[0][1];changed.add('agent-observability');
 add('agent-retrieval',14,p('这个接收记录保存的是“哪份输入已交给收集器”：它能把装配文本、来源版本与实际收到的输入连起来。工具效果回执保存的是外部动作已经造成什么修改；最终验收还要检查生成或保存的答案及其引用。三份事实分别属于输入交付、业务效果和任务结果。'+to('agent-evaluation','','评估章')+'核对产物与来源，'+to('agent-recovery','','恢复章')+'处理效果已提交却没有收到确认的情况。本节收集器没有调用语言模型，不能从输入送达推得答案正确。'));

 // The same declared four-card example follows run -> queue -> Job -> Pod -> ranks.
 add('training-platform',0,p('后面三章沿同一组声明对象继续：将这次训练记为 run R1，第一次整组执行记为 attempt A1，两个 worker 各启动两个 rank。调度章跟踪这组资源何时获准，Kubernetes 训练章再把它们映射到具体对象。R1/A1 是讲解用的标识；本章字段实验没有创建云端作业。'+to('kubernetes-training','training-object-chain','查看四卡示例的对象对应')));
 add('gpu-scheduling',0,p('沿用 run R1 的 attempt A1：若两个 worker 使用相同 Pod 模板，每个申请两张 GPU，可以在一个 Workload 中声明一个 PodSet。PodSet 是“同一类 Pod 模板与需要的份数”，本例 count=2，GPU 额度为 2×2=4。Workload 保存队列请求；Pod 仍须由作业控制器创建，再交给调度器选节点。'+to('kubernetes-training','training-object-chain','在下一专题核对 Workload、Job、Pod 与 rank 的关联')));
 add('kubernetes-training',2,
 '<h3 id="training-object-chain">同一次四卡训练的对象对应</h3>'+
 p('把前两章的 run R1、attempt A1 落到一种具体实现：平台创建 Indexed Job J1，parallelism 与 completions 都为 2；每个 Pod 申请两卡并启动两个训练进程。这里选择静态会合，把完成索引 0/1 映射为 node_rank 0/1，使用相同会合地址。两个 Pod 还要按声明放在不同节点；仅有索引和卡数不会自动添加这个放置约束。',
 'Kueue 的标准 Job 集成为 J1 建立关联 Workload W1。W1 负责描述和准入这组资源，Job 控制器负责创建 Pod，调度器负责节点绑定。ownerReferences 保存对象的拥有者引用，其中 UID 是不可复用的对象身份；查询时还要核对命名空间。')+
 figure('v65-training-object-chain','R1/A1 是平台标识；W1 与 J1 通过对象引用关联，两个 Pod 归 Job 管理。rank 0–3 属于本次共同进程组。图示声明关系，尚非真实 Kueue 或 GPU 运行轨迹。')+
 table(['层次','R1/A1 的声明实例','靠什么关联'],[
  ['平台作业','run R1：代码、数据、配置与完成条件','客户端提交身份关联原 run'],
  ['执行轮次','attempt A1：这次共同启动、停止与产物提交','平台保存当前有效 attempt'],
  ['Kueue 队列请求','Workload W1；一个 PodSet，count=2，每 Pod 两卡','W1 的拥有者引用指向 Job J1 的 UID'],
  ['Kubernetes 批作业','Indexed Job J1，两个完成单元','平台保存 R1/A1 与 J1 UID 的映射'],
  ['执行实例','完成索引 0/1 的 Pod P0/P1','Pod 的拥有者引用指向 J1；各有独立 Pod UID'],
  ['训练进程','P0：global rank 0/1；P1：2/3，WORLD_SIZE=4','本例静态 node_rank=index，本地 local rank 各为 0/1'],
  ['训练产物','已提交检查点或最终模型清单','关联 R1/A1、训练 step、输入与状态版本']
 ])+
 p('重传提交请求可以仍取得 R1/A1；Pod 被替换会产生新 Pod UID，即使完成索引仍是 1，也不等于训练组已经恢复。若按本章固定成员策略整组恢复，平台结束 A1、创建 A2，并为 A2 新建 J2/W2 与成员。这个“每轮次新 Job”的选择属于本章平台策略：Kueue 重新准入原 Job、Job 自行替换 Pod 等路径可以保留 Job 或 Workload，不能仅凭对象名推断 attempt。',
 'rank 用来标识当前通信组中的进程，不作跨轮次持久身份。若允许 torchrun 在同一组作业对象内重启进程，还应记录它的重启计数，或把这种重启计入平台的 attempt 契约。恢复时同时核对作业对象身份、进程组与已提交状态。')+
 '<details class="progressive-detail"><summary>目标集群选做：沿对象引用读取记录</summary>'+
 p('在已配置 Kueue 且按本例创建作业的集群中，将下面的命名空间和 Job 名替换为实际值。先取 Job UID，再检查 Workload 和 Pod 的 metadata.ownerReferences，最后对照训练日志里的 attempt、Pod UID、global/local rank 与 world size。')+
 code('只读 API 对象；这三条命令不提交或修改作业','BASH',
 'kubectl -n guide-training get job guide-r1-a1 -o json\nkubectl -n guide-training get workloads.kueue.x-k8s.io -o json\nkubectl -n guide-training get pods \\\n  -l batch.kubernetes.io/job-name=guide-r1-a1 -o json')+
 p('字段是否存在、谁生成对象、准入条件与恢复行为都应以目标版本和实际记录核对。本节给出连读方法；本站已有单机 kind 调度和 CPU/Gloo 训练记录分别取证，没有将它们拼成一次已运行的四卡 Kueue 实验。')+'</details>');
 const contractPoint=infraKnowledgeDomains.find(d=>d.module==='platform')?.points.find(p=>p.id==='sv-contract');
 if(!contractPoint)throw Error('Missing platform contract concept');
 if(!contractPoint.articles.includes('kubernetes-training'))contractPoint.articles.push('kubernetes-training');
 Object.assign(sources,{
  v65KueueJobs:['Kueue · 标准 Job 集成与关联 Workload','https://kueue.sigs.k8s.io/docs/tasks/run/jobs/'],
  v65KueueWorkload:['Kueue · Workload、PodSet 与资源份额','https://kueue.sigs.k8s.io/docs/concepts/workload/'],
  v65ObjectOwners:['Kubernetes · 对象拥有者与依赖','https://kubernetes.io/docs/concepts/overview/working-with-objects/owners-dependents/']
 });
 for(const id of ['gpu-scheduling','kubernetes-training'])chapter(id).refs=[...new Set([...chapter(id).refs,'v65KueueJobs','v65KueueWorkload','v65ObjectOwners'])];
 for(const id of changed)chapter(id).updated='2026.11.09';
})();
