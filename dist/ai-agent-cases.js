function aiAgentCode(file,label){return '<details class="full-code"><summary>'+label+'</summary>'+code(file,'PYTHON',aiAgentLabFiles[file])+'</details>';}
function aiAgentLinks(file){return '<p class="practice-links"><a href="labs/ai-agent-systems.zip" download>下载四程序、契约与验证记录 ↓</a><a href="labs/ai-agent-systems/'+file+'" download>下载本例源码 ↓</a><a href="labs/ai-agent-systems/validation.json" target="_blank" rel="noopener">本次执行结果与源码摘要 ↗</a></p>';}
function aiAgentScope(text){return '<details class="knowledge-check"><summary>实验环境与适用范围</summary><p>'+text+'</p></details>';}
function tokenDDPCase(){const r=aiAgentValidation.programs['token_ddp.py'].result;return  para('实战：固定初值w=0、学习率0.1，每个有效目标损失为½(w−y)²。先手算y=−2/−4/−6/−8的梯度，再让两个真实CPU/Gloo进程执行。rank0有一个目标、rank1有三个，模型只有一个参数，便于把数值逐项核对。')+
 code('PyTorch 2.5.1 为本次基线 · 在已有PyTorch环境中运行','SH','python token_ddp.py')+
 table(['对照','归约后梯度','更新后的w','检验什么'],[['各rank先平均',String(r.cases.wrong_rank_mean.gradient),String(r.cases.wrong_rank_mean.weight),'副本相等但目标变了'],['全局目标分母',String(r.cases.global_token_mean.gradient),String(r.cases.global_token_mean.weight),'与单进程四目标梯度5一致'],['两次microbatch累积',String(r.cases.accumulated_global_mean.gradient),String(r.cases.accumulated_global_mean.weight),'no_sync覆盖前向/反向；整个窗口只归一一次'],['一个rank空目标',String(r.cases.one_empty_rank.gradient),r.cases.one_empty_rank.weight.toFixed(1),'零贡献仍参与所需同步'],['全局空目标','无梯度','0','所有rank一致跳过step']])+
 aiAgentCode('token_ddp.py','展开完整双进程程序：解析基准、归约、累积与独立断言')+
 para('这一题的导数是w-y。w=0时，四个目标分别贡献2、4、6、8；正确均值是20/4=5。若先把两组各自平均，再平均两组，会得到(2+6)/2=4。先算完这一步，再核对程序输出。')+
 aiAgentScope('真实两个CPU/Gloo进程，float64；没有运行GPU、NCCL、AMP、FSDP或语言模型。迁移到词元交叉熵时，还要核对输入/标签配对、忽略位置、全窗口计数和框架归约配置。')+
 '<p><a href="/article/multinode-lab/">下一步：按两机四卡手册检查设备、会合、通信与恢复 →</a></p>'+aiAgentLinks('token_ddp.py');}
function gqaServingCase(){const r=aiAgentValidation.programs['gqa_serving.py'].result;return  para('实战分两步。先用4个Q头、2组K/V与二维RoPE计算四位置因果注意力，比较每步重新计算全前缀与真正追加K/V的增量路径；再独立计算大模型KV容量和固定客户端轨迹。先预测错头映射、错位置偏移会改变哪些输出，再运行。')+
 code('Python 3.9+ · 标准库，无模型下载','SH','python3 gqa_serving.py')+
 table(['核对项','本次结果','解释'],[['全量/增量最大误差',String(r.full_incremental_max_error),'同一可见前缀与位置语义'],['错组映射最大误差',r.wrong_head_mapping_max_error.toFixed(6),'把[0,0,1,1]改成[0,1,0,1]'],['新Q位置重置0的误差',r.wrong_query_offset_max_error.toFixed(6),'旧K保留原位置，新Q偏移错误'],['8192位置逻辑KV','1GiB','32层/8KV头/128维/2字节'],['8193位置分块容量','513块，8GiB只够7条','块长16，计算向上取整'],['合成窗口','50token/s、延迟达标10请求/s','与正文同一事件，非设备实测']])+
 aiAgentCode('gqa_serving.py','展开GQA、缓存、位置、容量与指标的完整程序')+
 aiAgentScope('手写GQA数值计算，没有完整Decoder、量化、分页分配器或vLLM调度。客户端时间是固定输入，检验计算口径；没有向真实模型发请求。大模型字节账与小向量例子是两套题设。')+
 aiAgentLinks('gqa_serving.py');}
function agentFencingCase(){const r=aiAgentValidation.programs['worker_fencing.py'].result;return  para('实战一：A取得epoch1后被进程屏障暂停；逻辑时间推进到11，B接管并在工具接收方安装epoch2。B提交必要动作7之后，确认A进程仍存活，再释放A。A使用全新op_id写99，接收方拒绝旧代际。新key是关键：重复key可能让去重掩盖缺少fencing的问题。')+
 code('Python 3.9+ · 多进程和SQLite，文件均在临时目录','SH','python3 worker_fencing.py')+
 table(['场景','实际观察','独立效果检查'],[['暂停A、接管B','A仍存活；B epoch='+r.takeover_epoch,'B的新动作7成功'],['A恢复后新动作','stale_epoch','99没有进入效果表'],['同key重试/换参','duplicate / conflict','原效果7仍只有一份'],['另一个进程提交后退出','退出码'+r.crash_exit_code,'效果11已存在，调用没有正常完成'],['新C恢复','原op返回duplicate回执','不再新增11'],['代际3新动作（测试主进程）','提交13','最终3笔，7+11+13=31']])+
 aiAgentCode('worker_fencing.py','展开真实进程、接收方事务、提交后退出与恢复程序')+
 para('实战二单独启动一个新进程，在效果11提交后os._exit(23)，再由C取回相同op的回执。它与暂停后继续运行的A是两场不同故障。租约采用注入的逻辑时间，控制库与效果库没有分布式原子事务；脚本显式先安装资源侧fence再放行新owner，独立负例实际演示安装前旧A仍能写；接收方安装后才拒绝它。更高epoch已安装时，迟到的B不能把自己误报为armed。生产接入还需处理中间失败和多资源确认。')+
 aiAgentLinks('worker_fencing.py');}
function agentEvaluationCase(){const r=aiAgentValidation.programs['agent_evaluation.py'].result;return  para('实战：四个固定任务分别要求合法生成报告、拒绝跨租户读、拒绝只读身份写入，以及缺资料时报告证据不足。执行器使用确定性计划。合法报告要同时满足：对用户返回success、真实SQLite金额37、引用a-1/v1和a-2/v2。产物和对用户的交付一起验收。')+
 code('Python 3.9+ · 标准库；不调用LLM','SH','python3 agent_evaluation.py')+
 table(['策略','通过用例','实际报告行','为什么'],Object.entries(r.strategies).map(([name,v])=>[({normal:'正常执行（normal）',claim_only:'只报成功（claim_only）',deny_all:'全部拒绝（deny_all）',citation_swap:'篡改引用（citation_swap）'})[name],v.cases_passed+'/4',String(v.actual_effects),({normal:'必要工作完成，拒绝与缺证据正确',claim_only:'只报success，没有产物与正确拒绝',deny_all:'漏掉合法报告，缺证据类型也判错',citation_swap:'金额37但引用B租户，正向交付不合格'})[name]]))+
 aiAgentCode('agent_evaluation.py','展开固定任务、真实写入与独立环境oracle')+
 para('再故意让工具先返回B的内容，最后却报denied。访问记录和返回内容会暴露泄漏，这个策略降为3/4；把泄漏藏进公开响应的额外字段，也会被字段白名单拒绝。拒绝文案不能覆盖已经发生的读取。')+
 para('反过来，报告已经正确写入，对用户却报denied或insufficient_evidence，是否也算完成？两种状态都是合法枚举，但都不符合这个合法任务的交付要求。新反例只改公开状态，保留金额37和正确引用；判分应从4/4降到3/4，实际报告仍1行，合格业务任务为0。接口结构正确与任务语义正确是两道检查。')+
 table(['只改变合法报告的对外状态','通过用例','真实报告行','合格业务任务'],Object.entries(r.wrong_report_status_probes).map(([status,v])=>[status,v.cases_passed+'/4',String(v.actual_effects),String(v.unique_qualified_business_tasks)]))+
 para('再改一次执行过程：先越权读取B，再生成完全正确的A报告并返回success。评估器核对读取集合，判为3/4、报告1行、合格任务0。合法来源重复或换顺序读取仍可通过。另一个反例直接返回缓存中的B数据，本轮没有新增B读取，依然要从返回内容检出，不能只查本轮访问记录。')+
 para('这个固定任务的公开契约只返回状态，不附额外内容。若再悄悄写一行任务集合之外的报告，公开状态仍合法，但环境契约失败，整批计0/4，真实报告行是2。输出字段、实际状态、访问、返回内容和额外副作用分别检查。这些确定性夹具检验列出的边界，不代替真实模型的安全评估。')+
 aiAgentScope('正常结果是1个合格业务报告、3个正确拒绝/缺证据判定。4/4是四个固定机制用例，不是模型成功率。未调用LLM、真实检索服务或Kairo；实际接入还需扩大任务样本与故障覆盖。')+
 aiAgentLinks('agent_evaluation.py');}
infraFieldCases['model-foundations']=()=>para('先在纸上写出输入/标签、可见位置、张量shape与损失分母，再运行最小Decoder。现有模型基础实验包含真实PyTorch反向更新、标签对齐、RoPE和在线softmax；其执行环境、结果和源码摘要可独立下载核对。')+
 '<p class="practice-links"><a href="labs/textbook-examples.zip" download>下载模型原理实验包 ↓</a><a href="labs/model-foundations/tiny_decoder.py" download>最小Decoder源码 ↓</a><a href="labs/textbooks/validation.json">现有执行记录 ↗</a></p>'+
 '<p><a href="/module/training/#knowledge-tr-ddp">把单进程目标接到真正的DDP全局分母 →</a></p>';
infraFieldCases.training=tokenDDPCase;
infraFieldCases.platform=gqaServingCase;
infraFieldCases.agent=()=>agentFencingCase()+agentEvaluationCase()+'<h3>将机制接入 Kairo</h3>'+para('用可信任务→逻辑意图→接收方回执→恢复状态→独立评估逐层映射；先只读，再幂等写入，再引入多worker、取消与隔离。每层保留真实接口与版本、故障动作和独立结果。')+'<p><a href="labs/ai-agent-systems/kairo-adapter-contract.md" download>下载Kairo字段与故障验收契约 ↓</a><a href="/article/kairo-practice/">阅读完整迁移设计 →</a></p>';
for(const [id,title,build]of [['distributed-training','真实双进程：全局token分母与错误均值',tokenDDPCase],['model-serving','GQA增量缓存、字节预算与指标实验',gqaServingCase],['durable-workflows','两个worker：旧代际拒绝与提交后恢复',agentFencingCase],['agent-evaluation','从真实报告与来源版本验收任务',agentEvaluationCase]]){
 const a=articles.find(x=>x.id===id);a.sections.push([title,build()]);a.updated='2026.11.04';
}
const infraStudyGates={
 ai:[
  {fields:[['model-foundations','mf-tensors','张量、输入与标签']],
   task:'画出输入、标签和每个位置能看到的内容。手算一次注意力输出，再核对最小 Decoder 的梯度与更新。',
   exercises:[['autograd-training','section-6','对照整批与微批更新']]},
  {fields:[['model-foundations','mf-gpu','GPU 执行与数据搬运']],
   task:'从矩阵形状算出乘加次数与搬运字节，再看同一块 Apple GPU 上，矩阵变大后哪种实现省时。',
   exercises:[['operator-profiling','native-metal-gemm','核对同设备实测']]},
  {fields:[['training','tr-memory','训练状态与显存峰值']],
   task:'算出训练状态的峰值。用两个训练进程和单进程对照，解释为什么正确梯度是 5，而错误的平均方式得到 4。',
   exercises:[['gpu-memory','section-11','核对状态账与重计算'],['distributed-training','section-8','核对双进程梯度']]},
  {fields:[['training','tr-input','数据供给与有效目标'],['platform','sv-admission','作业准入与放置']],
   task:'对照连续训练与中断恢复的结果，再沿作业、Pod 和训练进程核对 kind 集群的两个 CPU 节点是否完成了同一次更新。',
   exercises:[['training-lab','section-3','跑两进程恢复对照'],['kubernetes-training','native-kubernetes-gloo-job','核对两节点 CPU 作业']]},
  {fields:[['platform','sv-prefill','推理阶段与缓存'],['platform','sv-release','模型版本与发布验收']],
   task:'复算分组查询注意力的缓存用量与取整开销，从请求记录计算首个词元时延，再用质量和版本检查验收发布。',
   exercises:[['model-serving','section-7','核对增量缓存与延迟'],['ai-lifecycle','native-model-rollout','检查灰度发布与回退']]}
 ],
 agent:[
  {fields:[['agent','ag-runtime','任务、动作与执行边界']],
   task:'分清模型提议、工具调用和实际写入。核对合法动作成功，越权动作没有产生效果。',
   exercises:[['agent-runtime','native-model-mcp-tool-choice','追踪真实模型选工具'],['agent-security','authorization-commit-run','核对提交时的授权']]},
  {fields:[['agent','ag-recovery','操作身份与回执恢复'],['agent','ag-context','状态、上下文与记忆']],
   task:'让调用方在工具写入后退出，恢复时找回回执并检查只有一笔写入。再用评估样本区分总体准确率和各类别召回率。',
   exercises:[['agent-recovery','agent-crash-windows-run','复现写入后的退出'],['agent-evaluation','section-12','核对评估的分母与结果']]},
  {fields:[['agent','ag-fencing','工作流接管与旧执行者'],['agent','ag-retrieval','检索权限与来源版本']],
   task:'暂停旧执行者，接管后验证接收方拒绝它的新写入。检索时核对当前允许使用的资料和版本。',
   exercises:[['durable-workflows','worker-fencing-run','验证旧执行者被拒绝'],['agent-retrieval','native-qdrant-retrieval','核对候选与实际引用']]},
  {fields:[['agent','ag-observability','运行轨迹与业务结果']],
   task:'用同一任务的记录核对工具调用、恢复与业务结果，再按 Kairo 接入契约检查交付记录。',
   exercises:[['agent-observability','native-model-mcp-recovery-observation','对齐任务记录与实际结果'],['kairo-practice','section-8','运行接入记录校验器']]}
 ]
};
function infraStageStudyHTML(track,index){
 const {fields,task,exercises}=infraStudyGates[track][index];
 const links=fields.map(([module,point,label])=>'<a href="/module/'+module+'/#knowledge-'+point+'">'+label+' →</a>');
 return '<p class="stage-field-links"><b>先读系统知识</b> '+links.join(' ')+'</p>'+stageGateHTML(task,exercises);
}
