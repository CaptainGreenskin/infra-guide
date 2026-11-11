/* Follow a task through observations, then count its cohort and all of its costs.
   Load after existing bridges/progressive lessons and before first-reading-flow.js. */
(()=>{
 const p=(...rows)=>rows.map(row=>'<p>'+row+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const anchor=id=>'<span class="legacy-subsection-anchor" id="'+id+'" aria-hidden="true"></span>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="full-code"><summary>'+title+'</summary>'+body+'</details>';
 const matches=(html,pattern)=>[...html.matchAll(pattern)].map(m=>m[0]);
 const code=html=>matches(html,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=html=>matches(html,/<figure\b[\s\S]*?<\/figure>/g);
 const links=html=>matches(html,/<a\b[^>]*>[\s\S]*?<\/a>/g).map(link=>/<img\b/.test(link)?link.replace(/^(<a\b[^>]*>)[\s\S]*(<\/a>)$/,'$1查看图解 ↗$2'):link).join('');
 const a=articles.find(x=>x.id==='agent-observability');
 const titles=['观测职责：指标、日志、追踪与业务账本','身份与传播：task、op、trace和span','错误与效果：五个span怎样解释一次恢复','时间与因果：并行、等待及关键路径','总体口径：任务、尝试、效果与未完成项','成本账本：全量成本、分摊与合格分母','采样与诊断：先确认总体，再解释路径','实战与变化题：真实SDK、HTTP与输出关系'];
 if(!a||a.sections.length!==8||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Agent signals source changed');
 const old=a.sections.map(s=>s[1]),c1=code(old[1]),c5=code(old[5]),c7=code(old[7]);
 if(c1.length!==1||c5.length!==1||c7.length!==3)throw Error('Agent signals original code layout changed');
 const bodies=[
 '<div class="mechanism-core" id="agent-observation-signals">'+
 p('任务运行时保存“现在做到哪里”，可观测性进一步解释“怎样走到这里、时间和资源花在哪里”。先固定任务 R27：把总数 37 的报告发布一次，并核对保存后的报告。正常过程是准备正文→发布→读取产物验收。准备、发布、验收是步骤；其中发布这项逻辑操作可因网络或服务错误尝试多次，用户目标仍是同一个。',
 '这几层身份决定后面怎样计数。任务是一个待验收的用户目标；步骤是执行计划中的阶段；逻辑操作表达一次具体业务意图；尝试是为执行该意图实际发起的一次调用。一个步骤可调用多个操作，一个操作可有多次尝试。在代码中加入观测记录称为插桩。跨度是这些记录的观测单位：一次 HTTP 尝试常同时对应客户端和服务端两个跨度。')+
 table(['层次','R27 中的对象','跨重试怎样处理'],[
  ['任务 task','发布并验收这份报告，task_id=R27','继续关联原任务'],
  ['步骤 step','准备正文、发布、验收','分别保存阶段、输入输出版本和依赖'],
  ['逻辑操作 operation','发布总数 37，op_id=R27:publish','确认原意图仍相同时沿用操作身份'],
  ['尝试 attempt','第 1 次、第 2 次实际 HTTP 调用','每次独立记录序号、回应、耗时与用量']
 ])+
 p('有了对象，再选记录方法。指标把许多事件聚合成数量和分布；日志保留某一事件的细节；追踪把相关操作连成路径；业务账本保存受理、状态、回执与验收事实。它们通过任务和操作身份相互关联，解决的问题各有侧重。')+
 table(['记录','适合回答','本章中的读法'],[
  ['指标 metrics','发生多少、占比多少、耗时怎样分布','看任务、工具、结果类别与版本的总体变化'],
  ['日志 logs','某个时刻发生了什么、带哪些细节','查尝试序号、错误原因、正文版本及受控产物引用'],
  ['追踪 trace','哪些操作关联，调用和等待怎样连接','沿跨度的父子关系与时间线找慢路径'],
  ['任务与效果账本 ledger','受理哪个目标、提交哪个效果、是否验收合格','查询 R27 和 R27:publish，核对真实报告']
 ])+
 p('例如看板显示发布错误增加，先按工具与版本缩小范围，再用任务身份查日志和追踪，最后到效果接收方核对报告。业务提交与遥测记录是不同动作：提交后遥测可能丢失，记录“成功”后验收也可能发现正文错误。因此效果以接收方状态或权威回执确认，轨迹用于解释执行经过。')+'</div>'+
 fold('记录字段：怎样关联而不把正文复制到所有系统',p('指标维度使用工具名、结果类别、部署版本等有限集合。若给每个任务、用户或操作建立一个指标标签值，时间序列会随业务身份持续增长，这称为高基数。具体身份留在有访问控制的日志、追踪和账本中；提示、文档与报告正文保存为受控原件，遥测中记录必要的版本、摘要与引用。模型输入中的上下文、运行状态和记忆还可沿下文连接复习。')+links(old[0])),

 p('追踪 trace 是由相关跨度组成的一条执行轨迹；跨度 span 是其中一次被观测的操作，记录名称、开始与结束时刻、属性、事件和状态。trace_id 把跨度归入同一条轨迹，span_id 标识当前跨度，parent_id 指向它的上游跨度。父子关系表达谁调用或安排了谁，时间线再说明操作何时重叠、何时等待。',
 '追踪上下文 trace context 是让后续操作接续这条轨迹所需的关联信息，包括 trace_id、当前 span_id 与追踪标志等。这里的 context 与模型上下文不同：模型上下文是交给模型的消息、文档和工具结果；追踪上下文随调用传播，帮助观测系统关联操作。把二者都叫“上下文”而不说明对象，会把提示材料与执行身份混在一起。')+
 table(['字段或对象','在正常发布中的作用'],[
  ['task_id / op_id','关联业务目标 R27 与逻辑发布 R27:publish'],
  ['根跨度 s0','覆盖这次被观测的任务执行'],
  ['客户端跨度 c1','记录执行器发起的一次 HTTP 尝试，父节点是 s0'],
  ['服务端跨度 s1','记录工具处理这次请求，父节点是 c1'],
  ['traceparent 请求头','跨 HTTP 携带当前追踪身份、上游跨度身份与标志']
 ])+
 p('先沿一次正常调用走通传播。执行器在根跨度 s0 内创建 CLIENT 跨度 c1，并把 c1 设为当前跨度；inject 读取当前上下文，把它编码进 HTTP 的 traceparent 头。工具服务收到请求后 extract 提取远端上下文，以它为父创建 SERVER 跨度 s1。s1 继续使用原 trace_id，同时生成自己的 span_id，其 parent_id 等于 c1 的 span_id。s0、c1、s1 是教学占位名，真实编号由 SDK 生成。',
 '工具按正文中的 op_id 和 total 处理发布，执行器取得回执后读取产物，再记录验收结果。一次业务尝试于是有两端视角：CLIENT 覆盖调用方看到的往返，SERVER 覆盖服务端处理区间。后者通常包含在前者的等待中，二者的持续时间不能直接相加当作用户时延。')+
 fold('传播核心片段：先注入，再提取并建立子跨度',c1[0]+p('这是传播机制的简写，其中 execute_authorized_operation 是说明性占位函数；第 8 节完整程序直接在 Handler.do_POST 中执行 SQLite 操作。HTTP 正文携带 op_id 与 total，traceparent 携带追踪关联，资源服务仍使用自己的业务身份和授权规则。'))+
 p('业务 task_id 与 op_id 独立于追踪编号：长任务恢复后可以进入另一条 trace，仍关联原任务与操作。')+fold('多服务与共享批处理的额外关联',p('service.name 标明遥测由哪个服务产生，跨度属性描述这次操作。若共享批处理与多个任务有关，可通过 span link 记录额外关联；一个跨度的父节点仍只有一个。第 8 节再介绍创建与导出这些记录的 SDK 对象。')),

 '<div class="mechanism-core" id="agent-trace-effect-boundary">'+
 p('正常传播走通后，再加入第 8 节程序中的一次故障。工具在 SQLite 中以 op 为主键保存效果：第一次看到 R27:publish 时插入总数 37 并提交；以后遇到相同操作先查询既有记录，核对 total 一致后返回原回执。去重发生在持有效果的工具端，观测系统记录这一过程。',
 '程序故意在第一次提交完成后返回 HTTP 503。执行器确实收到了错误 HTTP 回应，却没有取得能够确认发布结果的成功回执，于是把本次业务结果记为待查证。它仍用 R27:publish 发起第二次尝试，工具找到已提交记录，返回 receipt-1 与 duplicate=true；执行器独立读取报告，确认只有一行且总数为 37，才把根任务标为验收成功。')+
 figures(old[2]).join('')+
 table(['发生顺序','效果接收方事实','对应观测'],[
  ['第一次服务端事务提交','保存一笔 R27:publish=37','s1 记录 effect_committed 事件'],
  ['随后注入 HTTP 503','刚才的提交已经完成','c1、s1 均为 ERROR；c1 记录 result_unknown'],
  ['第二次请求到达','查到原记录并复用回执','c2→s2；s2 记录 receipt_reused、duplicate=true'],
  ['执行器检查产物','一笔效果，总数 37，回执符合约定','s0 记录 artifact_checked，状态设为 OK']
 ])+
 p('重试后得到一个合格任务、两次 HTTP 尝试和一笔业务效果。首次尝试的 ERROR 继续保留，它说明那次调用遇到的情况；根跨度的 OK 说明应用最终验收通过。两个成功 HTTP 跨度在本例中保持默认 UNSET，因为程序没有显式设置它们为 OK。UNSET、OK、ERROR 是跨度状态，RUNNING、UNKNOWN、SUCCEEDED 等则是应用自行定义的业务状态，两套状态应分别解释。',
 '提交事件有助于理解顺序，SQLite 行及返回回执负责确认本例效果。这里存在“提交成功、遥测尚未记录”的间隙，因而不能只数 effect_committed 事件来建设业务去重。相同原则也适用于日志、效果计数器和根跨度状态。')+'</div>',

 anchor('subsection-4-1yz19uz')+
 p('跨度树告诉我们操作关系，时间线用来判断等待。下面另设一条 R27 的教学时间线，所有阶段使用同一时钟、单位 ms；它用于计算依赖，不是 HTTP 程序的实际耗时。身份检查用 50ms；查询 A、B 同时开始，分别用 300ms、400ms；装配必须等两份材料齐全，再执行模型、发布、等待、重试和验收。')+
 figures(old[3]).join('')+
 table(['阶段','起止时刻 ms','持续时间 ms'],[
  ['身份检查','0—50','50'],
  ['查询 A / 查询 B','50—350 / 50—450','300 / 400，同时进行'],
  ['装配 / 模型','450—480 / 480—780','30 / 300'],
  ['发布 / 等待 / 重试','780—850 / 850—880 / 880—940','70 / 30 / 60'],
  ['验收','940—1000','60']
 ])+
 p('端到端墙钟时间是用户从起点到终点实际经历的时间，本题为 1000−0=1000ms。由于装配要等两份查询结果，这一段等待 max(300,400)=400ms，于是总时间为 50+400+30+300+70+30+60+60=1000ms。按依赖从起点走到终点、决定最早完成时刻的最长路径，称为关键路径；本题经过较慢的查询 B。',
 '把表中所有阶段的持续时间相加则得到 1300ms，多出的 300ms 是 A 与 B 的重叠区间。再加根跨度的 1000ms，还会重复计算已包含的子操作。持续时间之和描述这些观测区间合计有多长；它既不是用户等待，也不能直接当作 CPU 时间或计费资源量。')+
 table(['时间口径','怎样计算','解释时要保留的条件'],[
  ['墙钟时间 wall time','终点减起点，本题 1000ms','明确是用户返回、产物验收还是后台结束'],
  ['跨度持续时间之和','逐跨度相加；本题叶阶段合计 1300ms','包含并行重叠，父子相加还包含嵌套重叠'],
  ['独占时间 exclusive time','父区间减去其直接子跨度区间的并集','表示未被这些子跨度覆盖的区间，可能含等待与未插桩工作']
 ])+
 p('若表中各阶段全都作为根的直接子跨度，且正好覆盖整个任务，根的独占时间便为 0；这只说明所有时间已被子阶段覆盖。查询 A 从 300ms 降到 200ms 时，装配仍等 B，到达终点的时刻不变；B 从 400ms 降到 300ms 时，在其余依赖与耗时不变的题设下，总时间降到 900ms。这是对固定依赖图的推导，实际优化还需检查是否改变了并行度、共享资源竞争和后续工作。')+
 fold('跨服务计时与等待区间',p('单机本地持续时间与跨主机绝对时刻有不同前提。跨主机墙钟偏差可能使图上的先后关系看起来反常，传播关系也不会自动校准时钟。应说明跨度覆盖哪段排队、重试等待或后台工作，再结合各端本地持续时间解释。SDK 实验把同机 Unix 纳秒起止时刻存成十进制字符串，避免 JavaScript 大整数精度损失；这些值不表示已经验证跨主机时钟。')+links(old[3])),

 p('理解一个任务以后，再定义一批任务的统计总体。总体是按受理时间、任务类型、版本和观察截止时间选定的一组唯一任务。先保存受理身份，再连接最终验收和全部尝试，才能同时看到完成者、失败者与仍在执行者。trace 条数、HTTP 条数、结果文件数都只是这组任务产生的记录，数量关系需要另行计算。',
 '下面固定一批 100 个已经到终态的任务：80 个首轮合格，其余 20 个都再处理一轮，其中 10 个合格、10 个最终失败。这里明确把一轮完整处理定义为一次“任务尝试”；一轮内部仍可能有多次模型和工具调用。它是总体算例，独立于前面 R27 的两次 HTTP 尝试。')+
 table(['任务组','唯一任务数','任务尝试轮数','最终合格数'],[
  ['首轮合格','80','80×1=80','80'],
  ['再试一轮合格','10','10×2=20','10'],
  ['再试一轮仍失败','10','10×2=20','0'],
  ['合计','100','120','90']
 ])+
 p('任务最终合格率为 90/100=90%。本题获得合格完成结果的尝试轮数为 90，因此按任务尝试计算是 90/120=75%。二者分别回答“多少用户目标最终交付”与“多少处理轮次获得合格结果”。工具 HTTP 成功比例要从实际 HTTP 调用重新计数，不能把这 120 轮直接用作工具分母。',
 '观察截止时间同样属于指标定义。假设这同一批任务在较早快照中为 80 个已合格、10 个最终失败、10 个仍在执行或待确认，此刻已确认合格占受理任务的 80/100=80%；若只看已有判定的 90 个，得到的 80/90≈88.89% 是另一个条件比例。等后 10 个也合格，才得到上表的最终 90%。删除尚未结束的任务，会悄悄改变问题。',
 '时延也应保留这种完整口径：先说明起点和终点，再分别报告已合格任务时延、失败或取消用时，以及在途任务数和当前年龄。只对成功结束者计算 P95，可以描述这一组完成者；若慢任务仍在执行，它就不能代表全部受理任务的最终等待分布。取消待确认、结果未知应有明确状态与数量，随查询和验收推进到终态。'),

 anchor('subsection-6-1q7kv9j')+
 p('沿用同一批 100 个任务，把成本与刚才的任务组逐一对应。以下“点”是题设中的教学成本单位：首轮合格的每任务 2 点，再试合格的每任务 5 点，最终失败的每任务 4 点。任务是否合格影响交付量，已经发生的尝试与用量仍进入总成本。')+
 table(['任务组','任务数 × 每任务成本','该组成本'],[
  ['首轮合格','80×2','160 点'],
  ['再试合格','10×5','50 点'],
  ['最终失败','10×4','40 点'],
  ['全部受理任务','160+50+40','250 点']
 ])+
 p('每个受理任务平均成本为 250/100=2.5 点；交付一个合格任务所承担的全量成本为 250/90≈2.78 点。若仅保留合格任务自身消耗，得到 (160+50)/90≈2.33 点，回答的是“合格任务自身平均花多少”，失败任务的 40 点没有进入这个问题。经营或容量判断使用哪一种口径，应连同分子和分母一起写明。')+
 fold('运行 100 任务成本账本',c5[0]+'<p>'+links(old[5])+'</p>')+
 p('任务组成本还没有细到每次尝试。“再试合格的 10 个任务共花 50 点”只包含任务总数，无法拆出第二轮额外花多少。要计算重试边际成本，应先按 attempt 记录实际用量与价格，再归回 op_id 和 task_id；共享检索、批处理、缓存、沙箱和后台工作要给出分摊依据，并保留总量与未分摊量以供对账。',
 '回到单任务 R27，SDK 程序拥有更细的教学账本：两次 HTTP 尝试各 2 点，产物验收 1 点，总共 5 点，交付一个合格任务，因此为 5/1=5 点。只取成功 HTTP 的 2 点，会漏掉第一次尝试与验收。这里的 5 点属于单任务 HTTP 夹具；上表再试组每任务也是 5 点，是另设的任务级题设，不能据此反推那 10 个任务也各有两次 HTTP 调用。')+
 figures(old[5]).join('')+
 p('实际计费时，成本账连接输入、输出及缓存用量、工具计算、存储和网络等计量项，同时固定单价、币种与价格版本。比较两个方案还要固定任务集合、质量要求、截止时间与重试预算：减少处理难题可能降低账单，也可能同时降低合格完成量。合格任务为零时，单列总成本与零完成，单位合格成本为未定义，不能填成 0。'),

 anchor('subsection-7-uqlgd8')+
 p('一条任务轨迹包含许多跨度、属性和事件，全部长期保存会消耗资源。采样是从运行记录中选择一部分保留；头部采样在较早阶段决定，尾部采样根据后续结果选择，因而可以更关注慢任务或错误。采样规则决定看到哪类任务，读样本比例前必须先检查这层选择。',
 '设总体有 1000 个任务，900 合格、100 失败。若合格只保留 10%，失败全部保留，样本中便有 90 个合格、100 个失败。直接计算 90/190≈47.37%，描述的是被保留的样本，原总体仍为 900/1000=90%。本题已知每类的入样概率，可把合格权重设为 1/0.1=10、失败权重设为 1，按加权计数得到 900/(900+100)=90%。实际估计还需入样概率适用、各类有非零入样机会，并考虑抽样波动和采集丢失。')+
 table(['分析问题','优先使用的证据','接着怎样解释'],[
  ['本批任务完成了多少','覆盖受理总体的业务账本与可靠汇总','按同一任务、版本和观察截止时间统计'],
  ['哪些阶段变慢','对应切片中的跨度与时间线','检查并行、排队、等待和关键路径'],
  ['报告哪里失真','各阶段输入输出版本与实际产物','沿资料、候选、装配、生成、发布定位首次偏差'],
  ['某项改动是否改善结果','固定任务、预算及判分规则的对照','控制替代解释，再比较成对结果和波动']
 ])+
 p('诊断从验收失败的具体主张出发。先找原资料及可访问版本，再查候选是否命中、装配是否保留关键限定、模型是否据此生成、发布是否保存对应正文。若候选里有正确材料而模型输入没有，优先复现排序、截断与预算；若输入齐全而结论错误，再固定这份输入比较生成。保留每阶段版本，才能找到偏差从哪里开始。',
 '追踪中的因果关联与统计上的因果效应需要分清：c1 是 s1 的父跨度，说明这次请求怎样被安排和传递；“新版本使任务成功率提高”则是关于改动效果的判断。一条成功轨迹不能排除任务变简单、重试预算增大或样本更换等原因。先用轨迹提出机制解释，再在固定任务和条件下验证改动，结论才与证据对应。')+
 fold('指标缺失、真实零与完整性检查',p('指标样本缺失时，先查采集覆盖。配套 Prometheus 的独立CPU聚合练习中，m表示毫核，1000m等于1个CPU单位；request指实例声明的CPU请求量，不是HTTP请求。两个实例实际用量各为90m，请求量分别为100m、900m，整体为 (90+90)/(100+900)=18%；逐项百分比再平均却得到 50%。另一个缺指标用例得到朴素比值 9%，同时完整性标记为 0；“观测到零”用例才同时得到比值 0、完整性 1，全部缺失则没有结果。这些数展示聚合分母与观测完整性，不能把没有数据自动补成业务正常。Agent 计数器同样要检查采集范围、重复记录及丢失，再与业务账本对账。')+'<p><a href="labs/scaling-collectives-traces/validation.json" target="_blank" rel="noopener">查看 Prometheus 与 SDK 的配套实际记录 ↗</a></p>')+
 links(old[6]),

 anchor('subsection-8-323gx5')+
 p('现在把前面的对象落到 otel_attempts.py。实验固定 Python 3.12 与 OpenTelemetry API/SDK 1.44.0，手动创建跨度并通过真实回环 HTTP 传播 traceparent，工具效果保存到临时 SQLite。执行器与工具服务在本机同一进程的两个线程中运行，各有自己的 TracerProvider 和 service.name；共享内存导出器便于最后一次读取所有跨度。')+
 table(['程序对象','负责的工作','跟读位置'],[
  ['TracerProvider → tracer','配置跨度创建、采样、资源和导出；tracer 创建具体跨度','main 中创建 runner 与 tool 两套对象'],
  ['Propagator','把当前追踪上下文编码进请求头，再从接收头提取','CLIENT 内 inject，Handler 内 extract'],
  ['MeterProvider → meter → instrument','管理指标，创建计数器与耗时直方图','attempts、effects、successes、cost、duration'],
  ['SQLite 与本地 ledger','分别保存真实效果和教学成本明细','effect 表、cost_ledger 输出']
 ])+
 p('下载实验包，在其中的 scaling-collectives-traces 目录使用独立 Python 环境，按包内 README 准备依赖后执行：')+c7[0]+
 p('跟读时先看根跨度 agent.task 与 for number in [1,2]：每轮新建 CLIENT 跨度，保留 R27、R27:publish 与当前尝试序号，再注入请求头。Handler.do_POST 提取头并创建 SERVER 跨度；事务上下文退出、SQLite 提交之后才发出 effect_committed 事件和效果计数。第二次走查询旧记录分支，产生 receipt_reused，不再增加效果数。',
 '客户端 finally 无论这轮收到 503 还是 200，都记录本次耗时、增加一次尝试与 2 点教学成本。循环结束后，程序直接查询 effect 表并核对回执，才增加一个合格任务与 1 点验收成本。最后 get_finished_spans 读取五个跨度，InMemoryMetricReader 读取指标，程序中的断言逐项核对它们。')+
 table(['输出项','固定应有的关系或数量','怎样理解'],[
  ['spans','根跨度 1、CLIENT 2、SERVER 2，共 5 个','所有 trace_id 相同；两个 CLIENT 的父号都是根号'],
  ['received_traceparent','两条头里的上游号分别为 c1、c2','对应 SERVER 的 parent_id 匹配，parent_remote=true'],
  ['lab.tool.attempts','http_error=1，ok=1，合计 2','实际发起并记录的 HTTP 尝试'],
  ['lab.tool.effects / lab.task.successes','各为 1','本次夹具在提交后、验收后分别计数'],
  ['lab.tool.duration','count=2，sum_ms 随运行变化','两次本地 HTTP 计时值的总和；不是根任务耗时'],
  ['lab.teaching.cost / cost_ledger','工具 4 点、验收 1 点，合计 5','失败尝试、成功尝试和验收全部保留']
 ])+
 p('先检查关系和数量，再看随机编号与耗时。trace_id、span_id 和毫秒数每次都可能不同；两个 SERVER 的父号匹配、原操作一笔效果、错误尝试保留、根任务验收通过，才是稳定复现条件。duration 的计时从构造请求前开始、在 finally 中结束，CLIENT 跨度还包含周边插桩与计数工作，因此这两种耗时也无需逐字相等。')+
 fold('完整 otel_attempts.py：与下载源码一致',c7[1])+
 fold('本次固定的 OpenTelemetry 依赖',c7[2])+
 '<p class="practice-links">'+links(old[7]).replace(/<a class="inline-link"[\s\S]*?<\/a>/g,'')+'</p>'+
 fold('实验范围与三个变化题',p('程序显式采用 ALWAYS_ON，完整核对五个跨度；它未测试概率或尾部采样。span 事件写入内存导出器，指标写入内存 reader；程序没有部署 Collector、远端遥测后端、LLM、真实身份服务或 Kairo，教学成本也没有连接真实账单。接入分布式系统时，需要继续检验跨服务传播、采集覆盖、导出与保留，并以业务记录核对遥测缺口。',
 '变化一：去掉 inject，工具端无法接续原父跨度，本例核对同一 trace_id 与请求头的断言会失败。先用原 task_id、op_id 与可信调用记录关联业务，再修复传播。变化二：保留 traceparent 却每轮生成新 op_id，会把重试改成另一项发布意图；本例固定 op_id 的断言会先拒绝这项变更。若工具接受这种新操作身份，追踪父子关系仍无法替接收方合并效果。变化三：把第一轮成本或验收成本删掉，单位合格成本会下降，但实际用量没有变化；应从 ledger 与计数器对账发现漏项。'))+
 (old[7].match(/<a class="inline-link"[\s\S]*?<\/a>/)?.[0]||'')
 ];
 const before=old.join(''),after=bodies.join('');
 const pre=html=>matches(html,/<pre\b[^>]*>[\s\S]*?<\/pre>/g);
 if(JSON.stringify(pre(before))!==JSON.stringify(pre(after)))throw Error('Agent signals original code changed');
 if(JSON.stringify(figures(before).slice().sort())!==JSON.stringify(figures(after).slice().sort()))throw Error('Agent signals original figure changed');
 for(const m of before.matchAll(/\bid=["']([^"']+)["']/g))if(!after.includes('id="'+m[1]+'"')&&!after.includes("id='"+m[1]+"'"))throw Error('Agent signals anchor lost: '+m[1]);
 const hrefs=matches(after,/\bhref=["'][^"']+["']/g);
 for(const m of before.matchAll(/\bhref=["'][^"']+["']/g))if(!hrefs.includes(m[0]))throw Error('Agent signals source URL lost: '+m[0]);
 for(const id of ['subsection-4-1yz19uz','subsection-6-1q7kv9j','subsection-7-uqlgd8','subsection-8-323gx5'])if(!after.includes('id="'+id+'"'))throw Error('Agent signals published heading lost: '+id);
 bodies.forEach((body,i)=>a.sections[i][1]=body);
 a.sections[6][1]+=p('刚才的比例来自题设。下一节把同一批任务同时送入全量导出与错误优先导出，再直接查接收方的 SQLite 账本。重点看先失败后成功的任务，它会被错误规则选中。<a href="/article/agent-observability/#native-tail-sampling-ledger">直接看三条任务的实际记录 ↓</a>');
 a.sections[7][1]+=h('native-tail-sampling-ledger','错误跨度被留下，任务最后仍可成功')+
  p('把上面的内存导出换成独立的 OpenTelemetry Collector。实验用 OpenTelemetry 的传输协议 OTLP，把跨度经 HTTP 交给接收器。Collector 把同一批跨度分给两条管道。全量管道直接导出，采样管道为每条追踪留出 3 秒收集窗口，按 <code>traceId</code> 汇合已到达的跨度，然后用 <code>status_code</code> 策略选择至少有一个 <code>ERROR</code> 跨度的追踪。')+
  trainingFigure('otel-tail-ledger','同一批任务的追踪走两条采集管道。接收库单独保留任务结果、尝试与提交效果。')+
  p('对照三个结果。首次成功的任务没有错误跨度，采样后找不到这条追踪。提交后返回 503 的任务第二次拿到原回执，根跨度仍是 OK，第一次尝试的错误让整条追踪留下。提交前失败的任务同样留下，接收库中没有对应效果。',
  '先按 <code>traceId</code> 分组。全量文件是 3 条追踪、11 个跨度，采样文件是 2 条追踪、8 个跨度。用 <code>parentSpanId</code> 找出失败的工具调用，再用 <code>app.task_id</code> 回查账本。样本里的任务成功比例为 1/2，账本总体为 2/3。四次尝试对应两份实际效果，重试取回执只增加一次尝试。')+
  p('阅读配置时，从 <code>traces/full</code> 与 <code>traces/sampled</code> 的共同 <code>receivers: [otlp]</code> 开始。只有后者经过 <code>processors: [tail_sampling]</code>，因此比较只改变一处处理规则。解压后按运行说明准备官方发行包，用 <code>python -B tail_ledger.py --collector-archive 归档路径 --output-dir replay</code> 复跑。')+
  '<p class="practice-links"><a href="/labs/otel-tail-ledger/collector.yaml">查看完整采集配置</a> · <a href="/labs/otel-tail-ledger.zip" download>下载源码、配置和记录 ↓</a> · <a href="/labs/otel-tail-ledger/README.md">分步运行与验收</a> · <a href="/labs/otel-tail-ledger/validation.json">查看实际对账结果</a> · <a href="/labs/otel-tail-ledger/full-traces.jsonl">全量跨度</a> · <a href="/labs/otel-tail-ledger/sampled-traces.jsonl">采样跨度</a></p>'+
  p('这里的两条管道使用同一台本机 Collector。多实例部署要让同一追踪的跨度先到同一处，并验证决策窗口、丢弃与晚到记录。上线后诊断仍从采样轨迹找路径，成功率从覆盖业务总体的记录算。<a href="https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.130.0/processor/tailsamplingprocessor/README.md">固定版本的采样策略与部署条件 ↗</a>');
 a.sections[7][1]+=h('native-model-mcp-recovery-observation','同一份 42 日报，各环节该怎么计数？')+
  p('在<a href="/article/agent-evaluation/#native-model-mcp-recovery-verdict">验收章</a>核对过实际报告以后，打开<a href="/labs/model-mcp-recovery/validation.json">同一份运行记录</a>。模型请求、宿主内部工具、跨进程调用和实际产物各数各的。')+
  table(['数什么','在哪数','这次结果'],[
   ['模型请求','model_turns','4 次；模型服务共记录输入 2540 个词元，其中 1800 个命中缓存，输出 95 个词元'],
   ['宿主内部执行工具','paused.state.events','4 次，读清单、修订计划、读补录和生成草稿'],
   ['MCP 业务调用','receiver_events 中的 request','1 次 publish_report，1 次 lookup_receipt；都指向 report-A/v3:publish'],
   ['实际提交的产物','receiver_final','1 份报告、1 份回执']
  ])+
  p('两次 MCP 调用各用新会话，请求编号恰好都是 3。原进程退出时，<code>cut.receiver_events_after_exit</code> 只有请求和提交。完整日志随后有一条发布响应开始事件，那时原进程已经退出。<code>recovery.wire.response</code> 才是新进程实际收到的查询结果。')+
  h('native-mcp-trace-reentry','进程退出后，用跨度链接接回原来的执行')+
  p('下面另建一份 42 日报和接收库，用固定工具请求观察跨度如何相连。首次运行 <code>report-A</code> 时，调用方先把待处理操作 <code>report-A/v3:publish</code> 和当时的根跨度编号存进检查点。MCP 工具已经写入合计 42 的报告，实验保留待处理状态，让新的调用进程从这份检查点继续。这样就能分别验证两件事：追踪能否从新进程回查第一次运行，发布会不会再写一份。')+
  p('这里把每次独立启动划为一条追踪。<strong>跨度链接（Span Link）</strong> 保存另一个跨度的追踪号与跨度号，用来标记因果关系。新根跨度把旧根加进 <code>links</code>，自己的 <code>parent_id</code> 仍为空。当前工具调用另建发送跨度，将它写入 HTTP 的 <code>traceparent</code> 请求头。接收跨度因此是<strong>这一次发送跨度</strong>的子节点。')+
  trainingFigure('mcp-trace-reentry','三次工具调用各有一条追踪。恢复组用跨度链接找到第一次运行，接收方按同一操作号返回原回执。')+
  table(['本地复跑','追踪关系','接收方结果'],[
   ['首次运行','创建根 A，保存它的上下文','提交报告，返回 <code>receipt-report-A-v3</code>'],
   ['从检查点恢复','创建根 B，链接到根 A','按原操作号返回同一回执'],
   ['关闭链接再恢复','创建根 C，仍传播本次请求头','仍返回同一回执']
  ])+
  p('顺着源码读三处。<code>run_client()</code> 从检查点读出旧跨度，用 <code>Context()</code> 启动新根并传入 <code>links</code>。HTTP 请求钩子给实际的 <code>tools/call</code> 填入当前发送跨度的请求头，服务端在 <code>asgi()</code> 提取这个父节点。<code>publish()</code> 以 <code>op</code> 为主键，同一个 SQLite 事务里读取原回执并写入尝试。三次实际请求都有接收跨度，数据库只留下一个报告。')+
  p('运行 <code>python -B trace_reentry.py replay</code> 后，先在追踪记录里核对 B 的链接指向 A，再核对每次接收的父号等于本次发送的跨度号。最后直接查 SQLite 的 <code>reports</code> 和 <code>attempts</code>，应分别为 1 行和 3 行。这里观测丢了链接时仍可按操作号找业务记录，正好能与<a href="/article/durable-workflows/">持久工作流</a>一章的恢复条件对照。')+
  '<p class="practice-links"><a href="/labs/mcp-trace-reentry/trace_reentry.py">查看完整源码</a> · <a href="/labs/mcp-trace-reentry.zip" download>下载实验 ↓</a> · <a href="/labs/mcp-trace-reentry/README.md">分步复跑</a> · <a href="/labs/mcp-trace-reentry/trace-record.json">真实跨度和 HTTP 请求头</a> · <a href="/labs/mcp-trace-reentry/validation.json">查看验收结果</a></p>';
 a.desc='从任务、步骤和尝试认识观测对象，沿正常调用理解追踪传播，再计算等待、总体、成本与采样偏差。';
 a.intro=a.desc;a.updated='2026.11.11';
})();
