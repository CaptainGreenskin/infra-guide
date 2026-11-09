/* Authored concept dependencies, distinct from directory order and optional cross-track reading. */
const chapterDependencies={
 'cloud-overview':[],
 'linux-resource':[['cloud-overview','服务最终由进程执行，资源读数要回到执行与等待。']],
 'virtual-memory-oom':[['linux-resource','进程持有地址空间；内存记账与限制解释它为什么会被终止。']],
 'concurrency-pools':[['linux-resource','线程执行与等待进一步形成锁、队列和容量约束。']],
 'distributed-systems':[],
 'cloud-compute':[['linux-resource','实际CPU时间和工作集决定怎样比较云规格。']],
 'vpc-network':[['cloud-overview','请求必须经过地址、入口和返回路径才能触达服务。']],
 'network-diagnosis':[['vpc-network','先有往返路径，时间戳才能定位连接和传输卡在哪里。']],
 'tcp-event-loop':[['network-diagnosis','请求时间边界继续下钻到字节流、缓冲和就绪事件。'],['linux-resource','套接字由进程持有，I/O等待需要与CPU执行分开。']],
 'training-storage':[['vpc-network','远程数据读取同时依赖访问单位与网络路径。']],
 'database-index-locks':[['concurrency-pools','查询除了读数据，还会等待连接与事务锁。'],['training-storage','数据库把持久数据组织成可查询、可事务更新的结构。']],
 'cache-consistency':[['database-index-locks','事务提交和可见性决定缓存何时可能读旧或回填旧值。']],
 'storage-recovery':[['training-storage','先规定数据的读取单位与版本，再定义一致发布和恢复材料。']],
 'mysql-recovery':[['database-index-locks','事务提交与回滚是解释各类数据库日志的起点。'],['storage-recovery','基线、连续变化和恢复目标需要在同一历史上对齐。']],
 'container-runtime':[['linux-resource','容器运行的仍是进程，隔离视图和资源限制分别作用。'],['virtual-memory-oom','内存上限与进程地址空间不同，OOM要沿实际记账判断。']],
 'kubernetes-basics':[['container-runtime','知道实际执行对象后，再理解声明如何被控制器推进。']],
 'k8s-workloads':[['kubernetes-basics','控制循环具体组织副本、完成型任务和有身份的工作负载。']],
 'scheduling-resources':[['kubernetes-basics','声明被接受之后，还需要为Pod找到满足约束的节点。'],['cloud-compute','资源承诺与单节点形状共同决定放置可行性。']],
 'k8s-networking':[['k8s-workloads','副本先有身份与就绪条件，Service才能选择实际后端。'],['vpc-network','Pod与Service路径仍要满足路由、端口和回程。']],
 'k8s-storage':[['scheduling-resources','卷的拓扑与挂载条件会反过来限制Pod能放在哪里。'],['training-storage','卷提供的是存储访问能力，仍需解释底层数据语义。']],
 'config-secrets':[['k8s-workloads','配置怎样进入容器，取决于Pod声明、进程启动和读取时机。']],
 'k8s-autoscaling':[['scheduling-resources','伸缩建议只有在节点能放下新副本时才可能兑现。'],['cloud-compute','资源预算与有效容量把指标变化连接到所需副本。']],
 'serverless-execution':[['distributed-systems','托管执行仍会遇到超时、重复和未知结果。'],['container-runtime','执行环境的创建、复用和状态寿命决定函数能依赖什么。']],
 'message-delivery':[['serverless-execution','事件触发继续下钻到谁确认发送、谁确认处理及谁记录效果。'],['database-index-locks','接收方事务把一次业务效果与稳定回执共同提交。']],
 'delivery':[['k8s-workloads','发布改变模板与副本，用户结果还取决于数据和配置兼容。'],['storage-recovery','可回退交付需要可核对版本与明确恢复目标。']],
 'terraform-state':[['delivery','可追溯变更继续连接配置、状态记录与实际对象。']],
 'gitops-reconciliation':[['delivery','一次交付继续发展成持续观察、比较和调谐。'],['config-secrets','声明同步以后，配置仍需真正进入进程才改变业务结果。']],
 'iam-security':[['cloud-overview','服务访问资源之前，先区分谁调用、允许什么和范围在哪里。']],
 'elasticity':[['cloud-compute','单实例能力要乘上有效副本，并考虑故障域和扩容时序。'],['concurrency-pools','输入超过完成能力时，差额表现为排队或拒绝。']],
 'slo':[],
 'observability':[['slo','先定义用户相关的好坏事件，再决定指标与追踪要回答什么。']],
 'incident':[['observability','信号只有放回请求路径和时间线，才能支持或排除原因。'],['concurrency-pools','低CPU与高延迟可以由队列、连接池或锁等待连接起来。']],
 'resilience':[['incident','先确定故障范围和恢复条件，再设计演练与切换。'],['storage-recovery','恢复能力要由版本、材料和消费者结果证明。']],
 'transformer-model':[],
 'tokenization-embedding':[['transformer-model','模型骨架里的输入、隐藏向量和输出分数需要具体编号与形状。']],
 'attention-mechanics':[['tokenization-embedding','词元向量构成Q/K/V的输入，形状决定矩阵计算是否成立。']],
 'transformer-block':[['attention-mechanics','注意力输出还要经过前馈、残差与归一化，才构成完整层。']],
 'position-encoding':[['attention-mechanics','位置关系需要进入Q/K点积，而不是只给文本附一个序号。'],['transformer-block','位置处理必须放回每层实际计算与缓存路径。']],
 'autograd-training':[['transformer-block','前向输出与目标形成损失，梯度再沿同一计算图更新参数。'],['tokenization-embedding','有效标签、移位和掩码决定究竟在优化哪些预测。']],
 'gpu-execution':[['transformer-model','张量计算被映射到执行单元与多层存储，才有GPU工作量。']],
 'roofline-model':[['gpu-execution','算术吞吐与数据搬运共同限制算子的可达性能。']],
 'flash-attention-io':[['attention-mechanics','分块必须保留注意力的同一归一化结果。'],['roofline-model','减少中间数据搬运需要先有计算量与字节账。']],
 'tensor-parallel-math':[['autograd-training','切开矩阵以后，前向数值和反向梯度都要重新对应。']],
 'operator-profiling':[['roofline-model','先算工作与字节，再用实际实现和轨迹验证瓶颈。']],
 'gpu-cluster':[['autograd-training','一项训练作业最终要推进有效目标、梯度与参数更新。'],['gpu-execution','模型计算需要被放到有算力、内存和通信的执行环境。']],
 'distributed-training':[['gpu-cluster','资源分布后，要决定状态、计算与通信怎样划分。']],
 'gpu-memory':[['distributed-training','副本或分片规则决定参数、梯度、优化器和激活怎样记账。']],
 'ddp-code':[['distributed-training','并行策略需要落实为参与进程、同步梯度和一致更新。'],['gpu-memory','精度、累积与状态寿命决定程序能否在预算内执行。']],
 'training-communication':[['ddp-code','具体同步点和参与者先确定，才能定位集合通信等待。']],
 'data-pipeline':[['ddp-code','各进程必须持续得到有效且权重正确的输入，算力才有意义。']],
 'multinode-lab':[['training-communication','跨主机执行需要会合、参与者和数据通信共同成立。'],['data-pipeline','多机验收还要确认输入覆盖与实际训练进度。']],
 'checkpoint-recovery':[['ddp-code','恢复目标是继续同一更新过程，需要对齐参数、优化器与数据位置。']],
 'training-performance':[['training-communication','吞吐测量必须包含计算之外的同步等待。'],['checkpoint-recovery','完成时间和成本还要包含失败与恢复带来的工作。']],
 'training-platform':[['gpu-cluster','平台把用户训练意图组织成可调度、可观察的作业。'],['checkpoint-recovery','产物和恢复点给平台提供可核对的进度与完成依据。']],
 'gpu-scheduling':[['training-platform','作业提交以后，队列准入与整组放置决定何时能执行。'],['distributed-training','进程组与并行布局决定资源形状和通信要求。']],
 'kubernetes-training':[['gpu-scheduling','资源准入继续落实为工作Pod、会合和共同生命周期。'],['ddp-code','平台管理的是一份有明确启动与恢复契约的训练程序。']],
 'model-serving':[['transformer-block','推理使用已有参数，沿前缀计算下一词元，并维护中间缓存。']],
 'quantization-serving':[['model-serving','权重和KV的字节账是解释精度、打包与容量变化的起点。']],
 'inference-performance':[['model-serving','输入处理、逐词生成和缓存共同决定延迟与吞吐口径。']],
 'ai-lifecycle':[['model-serving','服务使用的是完整模型版本，发布还需验证语义与回退。']],
 'moe-routing':[['transformer-block','普通前馈层扩展成多专家后，新增选择、分发和原位置合并。'],['tensor-parallel-math','设备上的参数与计算布局决定分发和通信代价。']],
 'speculative-decoding':[['model-serving','条件前缀和KV缓存把普通解码连接到批量验证与回退。'],['attention-mechanics','因果可见性决定每个验证位置能读取哪些历史。']],
 'agent-runtime':[],
 'agent-security':[['agent-runtime','模型提议要通过可信身份、任务委托与资源端授权才能执行。']],
 'agent-sandbox':[['agent-security','业务允许的动作还要落到程序可访问的文件、网络与资源范围。']],
 'agent-recovery':[['agent-runtime','工具效果和本地进度属于不同提交域，需要用稳定身份认回。']],
 'agent-memory':[['agent-recovery','持久执行状态、模型可见上下文和长期知识有不同用途与寿命。']],
 'agent-evaluation':[['agent-security','任务验收要同时检查完成和越权拒绝。'],['agent-memory','模型看到什么材料，需要与实际产物和任务目标分别核对。']],
 'durable-workflows':[['agent-recovery','单动作恢复进一步连接持久历史、重放和多执行者接管。']],
 'agent-retrieval':[['agent-memory','长期资料经过检索和预算选择，才进入模型本次上下文。'],['agent-security','索引命中不代替当前来源读取权限与版本检查。']],
 'agent-observability':[['agent-recovery','轨迹要区分任务、逻辑动作和具体尝试，才能解释重试成本。'],['agent-evaluation','观察到的运行过程最终要与任务结果和拒绝行为对齐。']],
 'kairo-practice':[['agent-evaluation','接入平台前先固定真实任务和独立验收判据。'],['durable-workflows','适配器要兑现恢复和效果身份，而不是只返回一个成功字段。'],['agent-retrieval','实际接入还需核对来源、授权与上下文交付。']],
 'training-lab':[['checkpoint-recovery','综合训练把中断、重启与继续更新放到一条可复查时间线。'],['training-performance','同一工作量与恢复边界才能解释完整训练成本。']],
 'cloud-service-lab':[['delivery','综合服务实验要证明配置和版本真正改变用户结果。'],['slo','完成与可靠性要以同口径用户事件验收。']],
 'production-readiness':[]
};
const chapterOptionalConnections={
 'agent-runtime':[['distributed-systems','按需深入超时、重试和未知结果；本章先建立任务与执行对象。']],
 'agent-recovery':[['distributed-systems','把本章恢复窗口推广到通用跨服务失败语义。']],
 'data-pipeline':[['training-storage','继续深入对象、文件与块存储的读取粒度和访问成本。']],
 'gpu-scheduling':[['scheduling-resources','补充普通Pod的节点可行性，再比较整组作业准入。']],
 'kubernetes-training':[['k8s-workloads','补充Job与Pod怎样组织任务和执行进程。'],['k8s-storage','补充持久卷、节点拓扑与放置约束之间的关系。']],
 'ai-lifecycle':[['checkpoint-recovery','负责继续训练的检查点时，再补齐优化器、数据进度与恢复验证。'],['delivery','补充发布兼容和数据回退边界。']],
 'inference-performance':[['observability','补充跨实例指标、直方图和追踪的聚合规则。']],
 'agent-sandbox':[['linux-resource','需要深入进程资源时再补这章；不要求完成Cloud课程。']],
 'agent-observability':[['observability','需要通用指标和追踪机制时再深入；Agent主线可独立学习。']],
 'config-secrets':[['iam-security','继续深入凭据读取与间接授权。'],['delivery','继续深入配置与代码的兼容发布。']],
 'production-readiness':[['resilience','Cloud选择恢复演练验收。'],['ai-lifecycle','AI选择产物与发布验收。'],['kairo-practice','Agent选择适配器与真实任务验收。']]
};
const learningTrackModels={
 cloud:{title:'一条请求怎样在受控资源上可靠完成',diagram:'v49-map-cloud',caption:'沿请求从左向右读；底部是管理请求执行的控制与观测，不是另一条串行请求。',
  relation:'请求通过网络到达计算进程，再读写数据；编排按声明安排这些进程，身份限定可执行的动作。容量与可靠性根据真实用户结果调整执行，并规定故障后的恢复目标。',
  anchors:[['cloud-overview','请求与资源'],['kubernetes-basics','声明与执行'],['database-index-locks','数据与提交'],['resilience','故障与恢复']],
  exercise:'教学组合题：Git配置已是v2，控制器显示健康，HTTP仍v1；消费者提交37后退出，消息又被投递；同时用户延迟升高但CPU不忙。画出请求、控制与数据三条关系，分别提出下一项证据。',
  answer:'配置对象、进程环境和HTTP响应分开：检查模板与Pod身份，不能凭同步状态判新版生效。消息重投按原业务身份查询接收方回执，核对是否只有一次37。低CPU不排除连接池、锁或下游等待，应在同一时间窗定位请求区间。再说明权限在哪里执行、有效容量如何估计，以及恢复后用哪些用户断言验收。这是跨章推理题，各实验分别取证，不冒充一个已运行的生产系统。'},
 ai:{title:'模型计算怎样变成可训练、可恢复、可服务的系统',diagram:'v49-map-ai',caption:'上方是训练更新闭环；检查点用于继续训练，转换并验证后的模型产物才进入推理服务。',
  relation:'模型把词元编号变成向量计算。训练将输出与目标比较，计算梯度并更新参数；推理使用已确定参数继续生成。GPU、数据与通信承载计算，检查点保存继续执行所需状态，平台负责资源、版本与完成验收。',
  anchors:[['transformer-model','模型计算'],['autograd-training','学习目标与更新'],['checkpoint-recovery','训练状态与恢复'],['model-serving','推理与缓存']],
  exercise:'同一模型能加载，训练loss下降；两进程结果却与单进程目标不同，恢复后轨迹又变化，服务首词元延迟也变慢。画出训练与推理两条路径，指出这三个问题应分别核对哪一组对象。',
  answer:'先对齐有效标签、各进程样本权重、梯度同步与优化器更新，副本一致不等于全局目标正确。恢复要按保存边界核对模型、优化器、随机状态和数据位置；若在累积中间保存，还要定义窗口如何继续或重做。推理则另拆排队、输入处理、缓存与逐词生成，不能用训练吞吐解释首词元延迟。最后区分数值、任务质量与目标硬件性能三种证据。'},
 agent:{title:'一项委托怎样变成有权限、能恢复、可验收的结果',diagram:'v49-map-agent',caption:'模型提议经过运行时检查再到工具；工具观察先形成事实与上下文，才进入下一次提议。',
  relation:'任务给出目标、范围与完成条件，模型只提出下一步。运行时检查参数和权限，再安排工具执行；效果接收方记录实际事实，历史支持恢复。检索提供获准且足够的证据进入上下文，观测与评估核对过程和最终结果。',
  anchors:[['agent-runtime','任务与执行'],['agent-security','授权与效果'],['agent-recovery','回执与恢复'],['agent-retrieval','证据与上下文']],
  exercise:'模型说工具成功，但本地进度仍在执行中；检索找到了两份资料，预算只放入一份；恢复时又发现旧写权限已撤销。画出控制边界，说明哪些是未知，哪些可以继续，最终用什么验收。',
  answer:'执行器声明不替代接收方回执，先按原操作身份查询，不能换新身份再写。旧效果与新写权限分别判断，查询本身也要有当前读取权。检索命中不等于上下文证据齐备；预算缺关键来源时应报告不足或按规则调整输入。最终以真实产物、来源与拒绝行为验收。Agent使用模型服务即可，不以GPU训练课程为先修。'}
};
const courseStageConnections={
 cloud:[
  ['从服务全貌进入执行与失败','请求 → 进程 → 资源与等待 → 结果未知','知道谁运行、在哪里等待，以及响应缺失为什么不等于效果未发生。'],
  ['把单进程放到跨机器的数据路径','资源供给 → 地址与路由 → 数据读取 → 提交与恢复','把CPU、网络、索引、缓存与恢复放回同一次请求，不各背一份定义。'],
  ['把执行对象交给声明式控制','容器 → 期望对象 → 调谐 → 放置 → 可用服务','区分声明被接受、选中节点、进程运行和业务可用。配置与伸缩继续沿这条链判断。'],
  ['从一次运行走向重复执行与持续交付','事件 → 运输确认与业务回执；配置 → 状态 → 调谐 → 用户版本','消息、Terraform和GitOps共享一个问题：记录说完成时，实际对象与用户结果是否真的一致。'],
  ['给已有系统补上权限与容量约束','调用身份 → 允许范围；输入 → 有效完成 → 积压与成本','权限决定能做什么，容量决定何时做得完。它们贯穿前面的路径，不是只在最后才存在。'],
  ['用用户结果闭合整条系统路径','目标 → 信号 → 假设 → 恢复 → 再验收','说明系统哪里失败、恢复了哪些已确认结果，以及怎样证明用户重新得到正确服务。']
 ],
 ai:[
  ['先让每个模型对象有明确位置','编号 → 向量 → 注意力与层 → 预测目标 → 梯度更新','能从输入画到参数更新，并把每一步的形状、有效位置和目标说清。'],
  ['把同一计算映射到执行和存储','张量计算 → 执行层级 → 运算/字节账 → 分块与切分','先保持数值正确，再解释搬运、布局和通信为什么改变性能。'],
  ['把一步更新扩展为多副本或分片','训练状态 → 并行布局 → 显存预算','先问需要复制或切开哪些状态，再决定多用设备究竟解决容量还是时间。'],
  ['让分布执行拥有可恢复的进度','程序 → 输入与通信 → 一致检查点 → 作业与资源','从一次正确更新走到完整任务，区分排队、启动、有效执行、失败和继续。'],
  ['从训练产物转成面向用户的推理','完整模型 → 输入处理/生成 → 缓存与量化 → 优化 → 版本验收','权重放得下、代码能运行、目标质量正确和服务更快，要分别提供证据。']
 ],
 agent:[
  ['先规定委托与实际执行之间的边界','用户目标 → 模型提议 → 可信检查 → 受限工具','工具返回和外部资料不是授权来源。知道谁能造成什么效果，才讨论自动执行。'],
  ['给未知结果与不同信息安排位置','效果与回执 → 恢复；历史/上下文/知识 → 任务验收','不把聊天摘要当执行数据库，也不把完成标志当真实产物。'],
  ['把单次动作扩成长期任务与证据链','持久历史 → 重放与接管；检索 → 权限/版本 → 上下文','变化的输入要有可解释历史，找到资料还要确认当前可读、完整且足够。'],
  ['用轨迹与真实任务连接平台接入','步骤与尝试 → 过程观测 → 结果验证 → 适配器验收','平台接入要兑现前面已经定义的权限、恢复、证据和目标，不是只跑通一个API。']
 ]
};
function prerequisiteConnectionsHTML(a){
 const needs=chapterDependencies[a.id]||[];
 const list=items=>items.map(([id,why])=>'<li><a href="'+articleURL(id)+'">'+articleById(id).number+' '+articleById(id).title+'</a>：'+why+'</li>').join('');
 const optional=chapterOptionalConnections[a.id]||[];
 return '<p><b>前置知识</b>'+a.prereq+'</p>'+(needs.length?'<ul class="prerequisite-links">'+list(needs)+'</ul>':'')+(optional.length?'<p><b>按需深入，不作整条课程先修</b></p><ul class="prerequisite-links">'+list(optional)+'</ul>':'');
}
function chapterConnectionHTML(a){
 const r=chapterReadingContext(a),track=r.track;
 const incoming=chapterDependencies[a.id]||[],outgoing=articles.filter(other=>r.ids.includes(other.id)).flatMap(other=>(chapterDependencies[other.id]||[]).filter(([id])=>id===a.id).map(([,why])=>[other.id,why]));
 const item=([id,why])=>'<a href="'+articleURL(id)+'">'+articleById(id).number+' '+articleById(id).title+'</a>：'+why;
 const optional=chapterOptionalConnections[a.id]||[];
 return '<aside class="chapter-connection" aria-label="章节之间的概念关系"><h2>把这一章接回整体</h2>'+
 (incoming.length?'<p><b>承接：</b>'+item(incoming[0])+'</p>':'<p><b>起点：</b>'+a.objectives[0]+'。从这里建立当前主题的基本对象。</p>')+
 (outgoing.length?'<p><b>后续用途：</b>'+item(outgoing[0])+'</p>':optional.length?'<p><b>按需延伸：</b>'+item(optional[0])+'</p>':'')+
 chapterFieldMapLink(a)+chapterLabLinksHTML(a)+
 '<a class="inline-link" href="/roadmap/'+(learningTrackModels[track]?'?track='+track+'#route-chapter-'+track+'-'+a.id:'')+'">在学习路线中定位这一章 →</a></aside>';
}
function stageConnectionHTML(track,index){const [from,chain,result]=courseStageConnections[track][index];return '<div class="stage-connection"><p><b>'+from+'</b></p><p class="concept-chain">'+chain+'</p><p>'+result+'</p></div>';}
function trackModelHTML(track){const m=learningTrackModels[track];return '<section class="track-system-model"><h3>'+m.title+'</h3><p>'+m.relation+'</p>'+figure(m.diagram,m.caption)+'<p class="model-anchor-links">'+m.anchors.map(([id,label])=>'<a href="'+articleURL(id)+'">'+label+' →</a>').join('')+'</p>'+fieldMapIndexHTML(track)+'</section>';}
function trackSynthesisHTML(track){const m=learningTrackModels[track];return '<section class="track-synthesis" id="synthesis-'+track+'"><h3>把这一条主线串起来</h3><p>'+m.exercise+'</p><details><summary>对照关键关系与判断依据</summary><p>'+m.answer+'</p></details><p class="synthesis-criteria">验收重点：能画出对象关系，指出每个结论成立的条件，换条件推导后果，并说明去哪里取得证据。读完或勾选不等于已掌握。</p></section>';}
// Directory numbers stay stable; conceptual learning and environment prerequisites are distinct.
articles.find(a=>a.id==='distributed-systems').prereq='知道请求有发起方和接收方即可；本章介绍超时与结果未知，不要求先完成Cloud课程。';
articles.find(a=>a.id==='config-secrets').prereq='先认识Pod、容器和工作负载；授权与发布兼容可在相关章节继续深入，不作本章硬性先修。';
articles.find(a=>a.id==='k8s-autoscaling').prereq='先读计算资源、Pod工作负载与调度；本章解释伸缩反馈，容量与弹性章再展开故障域和完整时间预算。';
articles.find(a=>a.id==='agent-sandbox').prereq='先读G1与G2，认识任务、工具和授权；本章解释执行资源边界，不要求完成Cloud或GPU课程。';
articles.find(a=>a.id==='agent-recovery').prereq='先读G1，了解数据库事务；超时与未知结果在本章就地解释，可按需补P0.4，不要求完成Cloud课程。';
articles.find(a=>a.id==='agent-observability').prereq='先读G4和G6，区分步骤、尝试与任务结果；通用指标和追踪可按需延伸，不作为整条Cloud先修。';
articles.find(a=>a.id==='kubernetes-training').prereq='先理解训练作业、分布式程序与资源准入；Pod/Job/卷可按链接补齐。真实GPU实战另需目标环境，不把完成物理多机实验当作阅读前提。';
articles.find(a=>a.id==='data-pipeline').prereq='先读A2.4，理解每个进程如何取得训练输入；本章解释分片、读取与预处理，存储访问单位可按链接补读C3.1。';
articles.find(a=>a.id==='gpu-scheduling').prereq='先读A3.1与A2.2，理解作业、进程组与并行布局；普通Pod的资源放置可按链接补读C4.4。';
articles.find(a=>a.id==='inference-performance').prereq='先读A3.4，理解输入处理与持续生成；本章解释计时边界和聚合，通用指标与追踪可按链接延伸。';
articles.find(a=>a.id==='ai-lifecycle').prereq='先理解模型推理、服务版本与请求结果；训练检查点与恢复可按需补读，不作为推理路线的先修。';
articles.find(a=>a.id==='multinode-lab').prereq='先读A2.4—A2.6，再阅读拓扑、启动与验收步骤；实际两机四卡实验另需两台Linux节点、每台至少两张NVIDIA GPU。';
articles.find(a=>a.id==='production-readiness').prereq='选择一条已学主线及自己的实验或项目进行验收，不要求同时完成Cloud、AI和Agent全部课程。';
// Preparation follows the selected route; optional topics stay optional.
articles.find(a=>a.id==='kubernetes-basics').prereq='先认识进程、容器与资源限制；本章从API对象与控制器讲起。IP和端口可按需复习，VPC路由在容器网络章继续深入。';
articles.find(a=>a.id==='serverless-execution').prereq='先认识容器运行环境、超时与重复执行；消息投递和事务回执在本章逐层介绍，数据库机制可按需深入。';
articles.find(a=>a.id==='autograd-training').prereq='先理解词元向量、注意力与Decoder块的前向计算；本章再定义损失、梯度和优化器。位置编码专题可按需深入。';
articles.find(a=>a.id==='gpu-cluster').prereq='先认识前向预测、损失、反向梯度、优化器更新与GPU执行；可沿自动求导和GPU执行章补齐，位置编码专题按需深入。';
articles.find(a=>a.id==='agent-evaluation').prereq='先认识工具权限、模型上下文与持久运行状态，可沿Agent权限与记忆两章补齐；沙箱可按需深入。';
articles.find(a=>a.id==='moe-routing').prereq='先认识Transformer前馈层、softmax与张量切分；本章介绍专家、路由和分发，集合通信可按需延伸，不要求已有MoE训练经验。';
for(const id of ['kubernetes-basics','serverless-execution','autograd-training','gpu-cluster','ai-lifecycle','agent-evaluation','moe-routing'])articles.find(a=>a.id===id).updated='2026.11.09';
