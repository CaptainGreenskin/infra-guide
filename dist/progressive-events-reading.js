/* Objects, normal execution and delivery, then state, capacity and executable examples.
   Load after the existing lessons and before first-reading-flow.js. */
(()=>{
 const p=(...rows)=>rows.map(row=>'<p>'+row+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const anchor=id=>'<span class="legacy-subsection-anchor" id="'+id+'" aria-hidden="true"></span>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="full-code"><summary>'+title+'</summary>'+body+'</details>';
 const matches=(html,pattern)=>[...html.matchAll(pattern)].map(m=>m[0]);
 const code=html=>matches(html,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=html=>matches(html,/<figure\b[\s\S]*?<\/figure>/g);
 const links=html=>matches(html.replace(/<figure\b[\s\S]*?<\/figure>/g,'').replace(/<pre\b[\s\S]*?<\/pre>/g,''),/<a\b[^>]*>[\s\S]*?<\/a>/g);
 const linkRow=items=>items.length?'<p class="practice-links">'+items.join(' · ')+'</p>':'';
 const select=(id,titles)=>{
  const a=articles.find(x=>x.id===id);
  if(!a||a.sections.length!==titles.length||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Events reading source changed: '+id);
  return a;
 };
 const replace=(a,bodies,published)=>{
  if(bodies.length!==a.sections.length)throw Error('Events reading section count changed: '+a.id);
  const before=a.sections.map(s=>s[1]).join(''),after=bodies.join('');
  const pre=html=>matches(html,/<pre\b[\s\S]*?<\/pre>/g);
  const hrefs=html=>[...html.matchAll(/\bhref=["']([^"']+)["']/g)].map(m=>m[1]).sort();
  if(JSON.stringify(pre(before))!==JSON.stringify(pre(after)))throw Error('Events reading original code changed: '+a.id);
  if(JSON.stringify(figures(before).sort())!==JSON.stringify(figures(after).sort()))throw Error('Events reading figure changed: '+a.id);
  if(JSON.stringify(hrefs(before))!==JSON.stringify(hrefs(after)))throw Error('Events reading URL changed: '+a.id);
  const ids=[...after.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
  for(const id of [...before.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]).concat(published))if(!ids.includes(id))throw Error('Events reading anchor lost: '+id);
  if(ids.length!==new Set(ids).size)throw Error('Events reading duplicate anchor: '+a.id);
  bodies.forEach((body,i)=>a.sections[i][1]=body);
  a.updated='2026.11.08';
 };

 const serverless=select('serverless-execution',[
  '托管的是哪层，应用还负责哪层','一次新环境和一次复用，各省掉了什么','谁负责重试，必须按触发器回答','投递身份：消息、接收句柄与业务动作','可见性与续期：重投没有封住旧写者','效果提交与 ACK 之间，总有一个需要设计的窗口','批次协议：选项、正常返回、异常与FIFO','并发算平均值，队列算净差值','把成本先写成用量，最后再套当前报价','失败留存之后，怎样安全重放','本地参考实战：可见性与批次退出路径','可运行练习：提交后退出，再投一次','配套实战：批次部分失败与提交后退出'
 ]);
 const s=serverless.sections.map(x=>x[1]),sc5=code(s[5]),sc10=code(s[10]),sc11=code(s[11]),sc12=code(s[12]),sl10=links(s[10]);
 if(sc5.length!==1||sc10.length!==4||sc11.length!==1||sc12.length!==3||sl10.length!==6)throw Error('Events reading function code layout changed');
 replace(serverless,[
 p('函数是一段由平台接收输入并执行的应用程序；处理这次输入的入口称为处理函数（handler）。先用报告服务区分输入、执行和产物：用户请求生成日报，服务记录任务并发送消息，平台取出消息调用处理函数，处理函数保存报告，用户随后读取报告。')+
 table(['对象','含义','在报告服务中的位置'],[
  ['请求 request','要求某个接收方执行操作','用户要求生成日报'],
  ['事件 event','描述已经发生的事实','日报任务已经受理'],
  ['消息 message','在组件之间运输数据的单位','队列中承载任务身份与参数的记录'],
  ['投递 delivery','把消息交给接收方的一次动作','平台这一次把队列记录交给函数'],
  ['处理函数 handler','对本次输入运行的应用入口','读取参数、生成并保存报告'],
  ['业务效果 effect','用户希望系统留下的实际变化','一份已保存、可以读取的日报']
 ])+
 p('一次函数调用可以处理一条消息，也可以处理一批消息；同一条消息又可能被投递多次。函数调用次数、消息数量和最终报告数量因此需要分别计数。可见性与消息代理算例固定业务动作 report-27：保存总数为 37 的报告，重投仍属于这一项业务动作。',
 'Serverless 指由平台承担实例分配、部分伸缩和运行维护的服务方式。按输入调用函数的执行模型常称为函数即服务（FaaS）。平台负责安排执行环境，应用负责代码、输入验证、权限、持久数据和结果。函数已受理、handler 已返回、报告已可读取分别发生在这条路径的不同位置。')+
 fold('运行形态与平台责任',p('Serverless 还包括其他托管服务。Knative Serving / Eventing 可在 Kubernetes 上组织服务与事件，平台团队仍需运行底层集群。比较托管函数、容器服务与长期运行消费者时，需要明确运行时、执行时长、网络、状态和流量要求，再核对各自的运行责任。')),

 p('执行环境是平台为函数代码提供的运行时、内存和临时文件等资源的集合。以普通 Lambda Event Functions 为例，创建新环境时先启动扩展和语言运行时，再运行模块的静态初始化代码；输入到达后调用 handler，执行结束后把结果或错误交回平台。',
 '需要新环境时增加的准备过程通常称为冷启动。环境被复用时，已经加载的依赖、连接客户端和缓存可能仍在，因而可以省去相应准备工作。环境也可能冻结、重建或销毁，后一次输入可以到达另一个环境。')+
 table(['状态放在哪里','适合保存什么','生命周期'],[
  ['模块全局变量、临时目录','能够重新建立的客户端、依赖和缓存','随当前执行环境存在'],
  ['外部持久存储','任务进度、报告、稳定业务回执','按应用的数据保留与恢复要求管理'],
  ['本次调用的局部变量','输入、当前计算与临时结果','由本次执行管理']
 ])+
 p('用户等待还包括入口、队列等待、初始化、执行和返回。handler 内计时只覆盖其中一段；p99 是时延分布的第 99 百分位数；端到端 p99 需要从用户起点记录到约定终点。预置并发（provisioned concurrency）提前初始化部分环境；预留并发（reserved concurrency）划出并限制函数的并发额度。二者分别管理准备状态与并发预算。')+
 fold('环境复用与预热的适用条件',p('复用的连接仍需处理断开和凭据变化。突发超过预置数量、配置变更或环境重建时，要结合实际初始化记录解释延迟。这里讨论普通按事件调用的环境；其他执行产品及耐久工作流的状态机制，应查对应产品契约。')),

 p('触发器决定输入怎样到达函数。同步调用由调用方等待返回；异步调用先受理输入、再安排执行；队列事件源映射则是平台维护的一段连接配置，由它轮询队列、组成批次并调用函数。先明确正常路径，才能把失败交还给正确的一方。')+
 table(['路径（AWS 示例）','正常调用怎样完成','失败后的责任'],[
  ['直接同步调用','调用方发送输入并取得本次结果','Lambda 不替调用方自动重试函数代码错误；调用方、SDK 或上游另有策略'],
  ['直接异步调用','平台受理并排队，之后执行函数','按异步调用的重试、事件年龄和失败去向处理'],
  ['SQS 队列事件源映射','映射接收消息，调用函数，成功后删除相应消息','可见性与源队列 redrive 策略共同控制后续接收和失败转移'],
  ['Knative Eventing','事件经 Broker / Channel 等组件送达接收方','按具体实现支持的 retry、退避和 deadLetterSink 处理']
 ])+
 p('Amazon SQS 是托管消息队列；redrive 策略规定消息经历相应接收次数后怎样转入失败队列。Knative 的 Broker / Channel 是组织事件路由与投递的组件。表中的“受理”说明下一段工作被接收，业务是否完成仍由处理结果和报告状态确认。',
 '队列处理按至少一次语义设计：一条输入可能再次进入 handler。直接异步调用的失败队列、SQS 源队列的失败队列和 Knative 的失败接收端属于不同路径；重试次数、等待与去向均应按所选触发器配置。批次中只有一部分完成时，还要按第 7 节的响应协议决定重试范围。'),

 '<div class="mechanism-core" id="serverless-delivery-identities">'+anchor('subsection-4-15nbns6')+
 p('一次接收同时带来“收到哪条消息”和“这一次怎样确认”两类信息。业务服务还需要知道“要执行哪个动作”。三种身份在不同范围内使用：')+
 table(['身份','作用范围与用途','report-27 的例子'],[
  ['运输消息 ID：messageId','标识队列中的运输消息；供部分批次响应标明失败记录','msg-A；重新发布可成为 msg-A-republished'],
  ['接收句柄：ReceiptHandle','一次接收返回的标识；用于相应删除或可见性操作','同一 msg-A 再次接收会得到新句柄'],
  ['业务动作 ID：tenant + operation_id','由业务定义，跨重投关联意图和已提交结果','租户 demo 的 report-27 始终对应总数 37']
 ])+
 p('生产者重新发布同一个动作时，运输消息可以换 ID，业务动作身份继续沿用。业务接收方把租户、目标和参数绑定到该身份：同键同意图返回原回执，同键改变参数则拒绝冲突。仅比较内容摘要会把两笔内容相同的合法动作合并；仅比较运输 ID 则无法识别重新发布。',
 'Lambda 的 SQS 部分批次响应使用当前记录的 messageId 作为 itemIdentifier。删除 SQS 消息使用相应 ReceiptHandle。业务防重查询使用稳定动作 ID。接收句柄与消息 ID 都不承担业务授权，调用方仍须具备操作目标资源的权限。')+'</div>',

 anchor('subsection-5-fv3seh')+
 p('可见性超时控制消息何时可再次被接收。SQS 返回消息后，会把它暂时隐藏；处理成功后由接收方或事件源映射删除。若没有及时删除，消息可以再次被接收。延长可见性称为续期，适用于处理仍在进行、需要延后重投的情况。')+
 table(['阶段','队列中的含义','应用仍需维护的状态'],[
  ['等待接收','消息可供后续接收','业务尚未处理或等待重投'],
  ['已接收、暂时不可见','当前接收占用一段可见性时间','当前执行是否运行、效果是否已经提交'],
  ['处理成功并删除','队列完成这次消息清理','持久报告及其回执继续存在'],
  ['到期但未删除','消息可再次进入接收流程','新旧执行可能同时到达业务服务']
 ])+
 p('可见性到期改变的是后续接收资格；已经运行的代码和它持有的外部写权限仍然存在。标准队列还可能出现重复副本，因此业务端需要按稳定动作身份接收重复。若业务要求阻止旧执行者继续写入，还需效果接收方检查当前代际等条件。')+
 figures(s[4]).join('')+
 p('图中的本地参考用整数时钟：0 秒接收、可见性 30 秒，31 秒再次接收；旧执行者随后仍能提交 37，新执行者查回同一回执。另一条续期路径在 20 秒设置后续 30 秒，把截止点改到 50 秒，31 秒仍不可接收，51 秒才再次接收。它演示状态变化，未测量云端时间。')+
 fold('SQS API 与本地参考的差别',p('删除应使用最近一次接收句柄。SQS 说明旧 ReceiptHandle 的删除请求可能成功却未删除消息；标准队列删除后少数情况下仍可能再收到副本。本地程序为了明确展示身份检查，会严格拒绝旧或过期句柄。续期请求超时时，接收方也可能不知道续期是否生效；需提前续期、限制重试并遵守自首次接收计算的服务上限。把可见性从 30 秒改为 5 分钟会改变重投等待，业务防重仍由效果接收方负责。')),

 p('业务回执是效果接收方保存的处理结果。收件记录表常称为 inbox：它按稳定动作身份保存意图摘要与结果。幂等接收表示同一动作重来时，接收方复用原结果，实际效果保持一份。',
 '本章的单库方案在同一数据库事务中保存报告和 inbox。事务要么提交两者，要么都不提交；并发请求还需由唯一键和事务串行化相关写入。以下伪代码表达这条提交边界，实际程序在后面使用 SQLite 实现。')+
 sc5[0]+
 p('正常路径是接收→原子提交效果与回执→返回成功→由运输层确认或删除。若提交后、成功返回前进程退出，重投查询 inbox，核对参数后返回旧结果。先独立写 inbox 会留下“已处理但无报告”，先独立写报告则可能在重投时再次创建。')+
 fold('跨服务效果与回执保留',p('事务只覆盖参与同一提交的实体。付款、文件或其他远端 API 需要接收方支持稳定幂等身份、权威查询或明确协调。outbox 可把本地业务变更与待发事件一起保存，再由投递者发送；远端接收仍要定义重复处理。回执保留期需要覆盖消息保留、人工重放与业务重试允许的时间范围。')),

 anchor('subsection-7-1qditfg')+
 p('批次是一次函数调用携带的多条队列记录。批大小减少了每条记录分摊的调用开销，也把多条记录的处理结果放进同一次调用。默认整批成功或失败时，已经完成的记录也可能随整批重试，因此每条记录仍需要独立的业务身份与回执。',
 '部分批次响应允许 handler 正常返回失败项列表。以标准队列 A/B/C 为例，A、C 完成而 B 失败：事件源映射启用 ReportBatchItemFailures，handler 返回 B 的 messageId 后，映射才按部分失败解释结果。配置选项和返回结构共同组成协议。')+
 table(['配置与退出路径','本次响应如何解释','后续处理'],[
  ['启用部分响应，正常返回 B','A/C 走成功路径，B 为失败项','B 保留待重投；所有业务项继续支持防重'],
  ['未启用，吞掉异常后正常返回','平台不解释部分失败列表，整次可视作成功','B 可能未产生效果却随批次被确认'],
  ['handler 最后抛异常或超时','没有成功交付部分响应，整批失败','A/B/C 都可能重投，A/C 查询旧回执'],
  ['先入先出（FIFO）同组首错停止','失败项与未处理项一并返回','A 完成、B 失败、C 未执行时返回 B/C']
 ])+
 figures(s[6]).join('')+
 p('正常返回、调用级异常、单条记录失败是三层结果。把 B 写入失败列表后又抛异常，会进入整批失败路径；捕获所有错误却返回空列表，又可能把未完成项声明为成功。响应中的 itemIdentifier 必须来自当前批记录的 messageId。')+
 fold('顺序、批大小与内存条件',p('FIFO 同组顺序要求后项不能越过失败的前项。官方建议部分响应在首次失败后停止，返回失败及全部未处理记录；跨组并行要结合实际消息组设计。批大小、批窗口、函数超时、可见性和并发共同决定等待与重投；整批反序列化对象及中间结果也进入单次调用的内存预算。')),

 p('并发是同一时刻尚未结束的执行数量；吞吐是单位时间完成的调用或业务动作数量；积压是还没有完成的工作数量。计算前需要统一单位：下列算例以函数调用计，每次十条消息时需先换算调用率，不能把消息/秒直接当作调用/秒。')+
 table(['固定条件','计算','含义'],[
  ['稳定完成率 150 次/秒，平均时长 0.20 秒','150×0.20=30','平均同时执行约 30 次'],
  ['同一完成率，平均时长变成 0.40 秒','150×0.40=60','维持原吞吐需要约 60 次平均并发'],
  ['并发上限 30，调用平均 0.20 秒','30/0.20=150 次/秒','不计额外瓶颈时的理想完成能力'],
  ['输入 200 次/秒，完成 150 次/秒','200−150=50 次/秒','未丢弃条件下积压每秒增加约 50 次']
 ])+
 p('平均并发关系适用于稳定统计窗口，峰值和伸缩准备时间需要另看；积压时生产速率也不等于已经进入执行的速率。并发扩大后，数据库连接、外部 API 配额和内存都会增加消耗。容量观测应同时保留队列年龄、等待数量、执行数量、下游等待以及唯一业务完成量。'),

 p('先按资源配置和实际计量时长计算用量，再乘对应产品、地区与日期的单价。教学设定为十万次调用，每次配置内存 0.5 GB、计费时长 0.20 秒，无额外重试：执行量为 100000×0.5×0.20=10000 GB·s，此外还有请求单位。',
 '若预置并发为 12，每份配置 0.5 GB，连续启用整一小时，预置资源量为 12×0.5×3600=21600 GB·s。预置资源与执行使用不同计费项目，需要分别套价，再加网关、日志、存储、网络和失败尝试。')+
 table(['工作负载','需要比较的执行条件','纳入用量的项目'],[
  ['间歇事件、短处理、突发','按调用准备环境与伸缩','初始化、实际执行及失败重试'],
  ['持续低延迟、初始化较重','预置环境或最小实例数量','空闲准备资源与调用执行'],
  ['稳定负载、长连接、长作业','长期运行消费者的持续容量','常驻资源、升级与运行维护']
 ])+
 p('计费时长包含哪些阶段，需要查所用产品和配置；handler 的 CPU 时间与计费时长是不同口径。阿里云函数计算（Function Compute，FC）按其规则把资源用量折算为计费单位 CU（Compute Unit）；换算取决于资源种类、实例状态和产品规则。比较单位成功成本时，总用量包含失败与重复尝试，分母使用验收合格的唯一业务动作。'),

 p('死信队列（DLQ）保存经过既定投递或处理条件后转出的消息；失败接收端也可以保存相应失败记录。它们给调查和恢复保留材料，业务状态仍可能是未处理、部分提交或已经提交但未确认。',
 '重放是把原业务动作重新送入处理路径。记录中应保留业务身份、原运输身份、版本、错误和尝试时间；修复代码或数据以后，以原身份查询效果并按受控速率重放。同键参数冲突需要人工或业务规则解决，重新生成身份会被视为新的业务动作。')+
 table(['重放所需条件','对应原因'],[
  ['回执仍在保留期内','迟到输入可以查回已提交结果'],
  ['旧数据结构仍可解释','新 handler 能理解保留消息及其意图'],
  ['当前权限、目标和配额有效','重新执行需要满足当时的访问与容量条件'],
  ['逐项核对最终报告与回执','消息离开失败队列只说明运输继续前进']
 ])+linkRow(links(s[9])),

 h('subsection-11-1bpbx18','受控时钟：接收、续期与回执')+
 p('visibility_receipts.py 使用两个本地 SQLite 数据库：队列库保存消息、可见时刻和接收代际，业务库在同一事务内保存效果与 inbox。程序传入整数秒推进状态，没有等待对应的真实云端时间。运行命令与核心结果如下。')+
 sc10[0]+
 table(['步骤','队列或接收身份','业务结果'],[
  ['0 秒接收，29 秒再次尝试','句柄 msg-A:1；29 秒仍隐藏','尚未写效果'],
  ['31 秒再次接收','同一 msg-A，句柄改为 msg-A:2','两个执行者均可到达业务端'],
  ['32 秒旧执行者提交','参考拒绝旧句柄确认','保存 report-27=37'],
  ['33 秒新执行者处理','参考接受当前句柄确认','复用回执，总效果仍为 1 笔'],
  ['重新发布、再改变参数','运输消息换 ID；业务身份不变','同意图复用；同键改参数被拒绝'],
  ['20 秒续后续 30 秒','截止 50 秒；31 秒隐藏、51 秒可接收','旧代际续期被拒绝']
 ])+
 fold('完整 visibility_receipts.py：本地队列与业务事务',sc10[1])+
 linkRow(sl10.slice(0,3))+
 h('subsection-11-13uy27q','批次参考：同一输入的四条退出路径')+
 p('batch_response_reference.py 对 A/B/C 声明固定结果：A 成功、B 失败，C 继续成功或因顺序约束未执行。它根据部分响应开关、FIFO 停止和最终异常计算结果，便于把第 7 节的四条路径逐项对照。')+
 sc10[2]+
 table(['输入条件','执行项与效果','待重投项'],[
  ['标准队列、启用部分响应、正常返回','执行 A/B/C，效果 A/C','B'],
  ['未启用部分响应、正常返回','执行 A/B/C，效果 A/C','无；B 被确认但无效果'],
  ['最终抛异常','执行 A/B/C，效果 A/C','A/B/C'],
  ['FIFO 同组首错停止','只执行 A/B，效果 A','B/C']
 ])+
 fold('完整 batch_response_reference.py：声明策略的计算',sc10[3])+
 linkRow(sl10.slice(3))+
 p('这两份记录分别验证真实本地事务和声明式批策略。严格拒绝旧句柄属于本地队列契约，批次程序也没有调用 Lambda/SQS。云端验证需要另外关联接收、函数返回、删除与重投记录；下一节转向真实进程退出与事务提交。'),

 p('event_worker.py 是最小的提交后退出程序。这里另用 sample-event.json 中的 report-2026-001 字符串报告，与前面的 report-27=37 是独立输入。程序把报告与 inbox 放在同一 SQLite 事务中；--crash-after-commit 让进程在 COMMIT 以后、成功响应以前主动退出 23。再次发送同一 event_id 时，程序核对意图并返回原结果。')+
 sc11[0]+
 p('配套验证记录包含退出码 23、重投后 reports=1 与 inbox=1、同键改变意图被拒绝，以及新身份作为新业务动作保存。这里实际发生了子进程退出和本地事务重放；实验没有调用云队列，也没有验证物理掉电持久性或外部 API 的原子提交。'),

 p('event_batch_lab.py 把单条事务接入批处理。三个业务动作 A/B/C 各有运输 messageId 和稳定 event_id；子进程先处理 A，在提交后用 os._exit(23) 退出。父进程重新提交整批，这次 A 查回回执，B 临时失败，C 正常提交，handler 正常返回 msg-B；最后单独恢复 B。')+
 sc12[0]+
 table(['实际阶段','调用方看到的结果','独立数据库事实'],[
  ['A 提交后退出','退出码 23，没有成功批响应','A 的效果与回执已经存在'],
  ['重新处理 A/B/C','正常部分响应只有 msg-B','A 复用，C 提交，B 尚未成功'],
  ['只恢复 B','B 处理成功','A=2、B=2、C=1 次尝试；3 笔效果'],
  ['两个进程争抢 X','2 次处理尝试','共享 SQLite 中只有 1 笔 X 效果']
 ])+
 sc12[1]+
 p('程序还检查新 messageId 携带同一 event_id 时复用回执，以及同键改参数被拒绝。它只处理 demo 租户，使用本地共享 SQLite 实现真实跨进程原子提交。上节批策略参考根据标签计算重试集合，本节则真的执行事务、退出和并发提交。')+
 fold('完整 event_batch_lab.py：逐项提交、退出与恢复',sc12[2])+
 fold('映射到云端时需要验证的接口',p('部署到 AWS 时，需要启用 ReportBatchItemFailures，返回当前记录的 messageId，并按函数超时、批窗口和源队列 redrive 设置接收条件。若 handler 最后抛异常，即使 A/C 已经提交，仍进入整批失败路径。实验没有启动 SQS，没有测量云端可见性、删除、伸缩或供应商重试。函数的 /tmp 也不是跨执行环境的持久回执库；需要另选满足并发、耐久与权限要求的共享存储。'))+
 linkRow(links(s[12]))
 ],['subsection-4-15nbns6','subsection-5-fv3seh','subsection-7-1qditfg','subsection-11-1bpbx18','subsection-11-13uy27q']);
 serverless.desc=serverless.intro='从请求、事件、消息与处理函数开始，理解执行环境、调用与确认，再计算并发、批次和用量，最后运行本地事务、退出与重投实验。';

 const delivery=select('message-delivery',[
  '先有业务动作，再有承载它的运输消息','生产者确认与消费者ACK，不是同一张回执','从待投递到待确认，状态怎样移动','业务提交后退出，重投为什么不能再记一次','先ACK再做业务，为什么队列空了仍可能丢工作','预取窗口限制在途消息，不自动增加处理能力','持久队列、持久消息和确认，各补哪一个条件','把这套对象带回Serverless事件源','运行完整代理实验，核对独立结果'
 ]);
 const m=delivery.sections.map(x=>x[1]),mc2=code(m[2]),mc8=code(m[8]);
 if(mc2.length!==1||mc8.length!==4)throw Error('Events reading message code layout changed');
 replace(delivery,[
 p('消息让发送方把工作交给其他组件处理。生产者创建并发送消息，消息代理接收和保存消息，消费者取得消息并执行应用逻辑。一次投递是代理把消息交给消费者的一次动作；处理函数是消费者执行的代码；业务效果是这段代码实际保存或改变的数据。',
 '本章使用 RabbitMQ 消息代理。交换机按路由规则把发布的消息交给队列，队列保存待处理消息；连接交换机和队列的规则叫绑定。正常路径是生产者发布→交换机路由→队列保存→消费者接收→提交业务效果→发送消费确认。固定业务动作 report-27 要保存总数 37，同一动作可以经历多次投递。')+
 table(['对象','本例中的作用','身份范围'],[
  ['业务事件与动作','事件描述事实，动作说明接收方应执行什么','report-27 跨发送与重投保持稳定'],
  ['运输消息','承载业务身份和参数','应用填写 message_id，如 transport-1'],
  ['连接与通道 channel','连接承载通信，通道组织逻辑协议交互','一个连接可建立多个通道'],
  ['一次投递','消费者从代理收到消息','delivery_tag 只在当前通道内标识投递'],
  ['业务回执','效果接收方保存的已提交结果','按业务身份查询并核对意图']
 ])+
 figures(m[0]).join('')+
 p('本实验使用默认交换机，生产者以队列名作为路由键找到同名队列。客户端与代理使用 AMQP 0-9-1 协议通信，Python 客户端库为 Pika。业务动作、运输消息和通道投递属于不同层次；后面的确认与重投沿这些对象分别推进。'),

 p('确认是参与方反馈某一段工作状态的协议。生产者确认（publisher confirm）由代理发给发布方，报告这次发布的处理情况；消费确认（ACK）由消费者发给代理，声明当前投递可按完成处理。业务回执由效果接收方保存，用于查询实际提交结果。')+
 table(['反馈','发送方 → 接收方','正常路径中确认的范围'],[
  ['生产者确认','代理 → 发布方','代理按相应协议处理了本次发布'],
  ['消费确认 ACK','消费者 → 代理','消费者声明该通道中的投递已处理'],
  ['业务回执','效果接收方 → 业务调用者','稳定动作已经产生对应结果']
 ])+
 p('发布确认发生时，消费者可以尚未开始执行。路由也有独立的反馈：mandatory 选项要求无法路由的消息返回给发布方。确认模式下，调用方需要处理返回、否定确认和连接失败，才能判断消息走到了哪里。',
 '本章真实实验向不存在的队列发布：启用 mandatory 时客户端识别不可路由；关闭 mandatory 时发布可正常取得确认，而目标队列仍不存在。发布超时则可能需要查询或重发，重发继续携带原业务身份。'),

 p('手动确认模式下，消息在代理中主要经过两个待处理状态。ready 表示可交给消费者；unacknowledged 表示已经投递、尚未收到相应确认。业务数据库中的“已提交”是第三份状态，由应用独立维护。')+
 table(['动作','代理状态怎样变化','业务侧的正常动作'],[
  ['消费者接收','ready → unacknowledged','读取并验证业务身份与参数'],
  ['提交报告与回执','仍为 unacknowledged','在数据库中完成受控提交'],
  ['原通道发送 ACK，代理收到','结束待确认状态','保留已提交报告与回执'],
  ['通道或连接关闭，仍未确认','消息重新入队，可再次投递','后继消费者查询原业务结果']
 ])+
 p('下面是正常处理的最小顺序。basic_get 拉取一条消息，auto_ack=False 选择手动确认，method.delivery_tag 标识当前通道中的这次投递。commit_effect_with_stable_receipt 是说明性占位函数，完整程序使用 SQLite 事务实现效果和回执。')+
 mc2[0]+
 p('redelivered 表示代理认定这次属于重投。消费者需要查询业务回执判断是否已提交：消息可以在提交前断开，也可以在提交后断开；生产者重新发布同一业务动作时，又可能得到没有重投标志的新消息。下一节用真实进程退出观察两种状态怎样重新接合。'),

 p('提交完成与 ACK 到达代理是两个动作。消费者在 SQLite 事务内按 report-27 保存意图、总数 37 和回执，提交后再 ACK。同一动作再次到达时，事务查询回执、核对参数并返回原结果，避免重复保存。唯一键和事务还负责处理并发接收。',
 '实验让消费者收到 transport-1，事务提交后暂停。父进程读取数据库确认已有一笔效果，再用 SIGKILL 结束该消费者。代理看到连接关闭后重投；恢复者收到相同 message_id 和 redelivered=true，查回原回执，效果仍为 1 笔、总数仍为 37。')+
 figures(m[3]).join('')+
 p('随后把同一动作重新发布为 new-transport-same-business，业务库仍复用 report-27 的结果。这说明防重依据来自业务身份，能够覆盖原消息重投和重新发布两条路径。')+
 fold('通道身份与事务范围',p('本次前后两次 delivery_tag 恰好均为 1，但它们属于不同连接中的通道。确认必须发送到接收该投递的原通道。实验从没有接收这项投递的通道确认编号，代理返回 406 并关闭错误通道；正确通道仍打开，原未确认消息仍待确认。',
 '本例效果与回执在同一 SQLite 事务内。远端支付、文件或其他 API 的提交需要接收方支持稳定幂等身份、权威查询或其他协调；本地回执无法把远端操作纳入事务。回执保留还需覆盖允许的迟到与重放。'))+
 linkRow(links(m[3])),

 p('确认时机表达应用何时把工作声明为完成。正常路径在业务提交以后发送 ACK，未确认消息可以在连接断开后重新交付。若先 ACK，代理可以先清除这项待办，此时应用仍可能没有保存任何效果。',
 '反例程序接收后先 ACK，通过同通道同步往返越过实验屏障，再在业务写入前被杀死。独立观测为 ready=0、业务 effects=0、total=0：运输已经结束，report-27 的目标没有完成。自动确认模式把完成点提前到代理发送消息，也需要按应用允许的处理损失评估。')+
 table(['故障前的顺序','代理侧状态','业务侧结果'],[
  ['提交效果 → 退出，尚未 ACK','未确认，可重投','已有一笔；按原业务身份恢复后仍为 37'],
  ['ACK → 退出，尚未提交','该投递已完成','没有效果，无法靠原消息重投恢复'],
  ['重投时改成新业务身份','可以成为新的工作到达','可能重复产生效果']
 ])+
 p('实验总报告 passed 表示反例被正确检测。该业务路径的 business_oracle_passed 明确为 false，保留的零效果说明验收失败。队列数量和业务结果需要分开读取。'),

 p('预取（prefetch）是订阅消费时允许尚未确认的投递数量窗口。窗口满了以后，代理等待确认释放位置再交付后续消息。它限制在途数量；业务是否并行，取决于应用实际启动多少处理任务。')+
 table(['概念','决定什么','本例'],[
  ['预取窗口','最多多少条订阅投递尚未确认','prefetch=1，第一条未确认时第二条仍 ready'],
  ['处理并发','同时执行多少业务处理','单线程顺序处理时，预取变大仍逐条执行'],
  ['完成吞吐','单位时间产生多少已提交结果','受处理时长、数据库和确认往返等共同限制']
 ])+
 p('本例只有一个订阅消费者：预取设为 1，先只收到一条，另一条 ready=1；第一条 ACK 后第二条才到达，全部 ACK 后 ready=0。按每消费者独立窗口且没有额外共同上限的简化条件，8 个消费者各预取 16 条，可形成 8×16=128 条未确认消息。消息体、解码对象和业务中间状态均进入内存预算。')+
 figures(m[5]).join('')+
 p('RabbitMQ 的 basic.get 拉取接口不受上述预取窗口限制。真实对照在另一个通道设置 prefetch=1，连续 get 两次且均不确认，仍取得两条未确认消息，ready=0。自行拉取的程序需要自己限制未完成数量。')+
 fold('窗口、恢复与吞吐的关系',p('窗口过大可能把工作集中到慢消费者，连接关闭时也会形成较大的重投集合；窗口过小则可能留下确认往返造成的空闲。实际选择需要固定业务工作量，比较完成率、内存、下游等待和恢复行为。RabbitMQ 默认的每消费者窗口还需与所用订阅 API 和版本一起核对。')),

 p('持久化让代理在相应存储条件下保留队列与消息。durable 是队列声明属性，用于保留队列定义；delivery_mode=2 是消息属性，提出持久消息要求；生产者确认则反馈这一次发布的处理。三个条件分别描述队列、消息和协议反馈。')+
 table(['条件','本次设置','作用范围'],[
  ['队列与消息','单节点 classic 队列，durable，持久消息','按该队列类型保存消息及定义'],
  ['发布反馈','生产者确认模式','客户端取得本次发布的协议反馈'],
  ['代理数据','同一自有 Docker 数据卷','容器重启后继续使用原数据'],
  ['恢复核对','新客户端读取再确认','检查消息内容与最终队列状态']
 ])+
 p('实验发送 survive-restart、amount=7，确认有一条 ready 消息后关闭客户端，实际重启代理容器。使用原数据卷启动后，新客户端读回相同业务内容；确认以后 ready=0。这是本次进程与容器重启条件下的保存和恢复记录。')+
 fold('故障条件决定持久性结论',p('单节点 classic 队列的容器重启没有覆盖磁盘永久丢失、多副本仲裁、高可用切换或物理断电。相应恢复验证需要固定故障类型、存储条件和已确认消息集合，再把恢复后的消息与实际业务结果对账。')),

 p('函数可以作为消费者的执行载体。队列事件源映射把轮询、批次组织、函数调用、失败响应和删除连接起来；处理函数提交业务效果，再按平台要求交付成功或失败结果。消息身份、一次接收身份和业务回执继续分别维护。')+
 table(['接口','标识什么','如何使用'],[
  ['RabbitMQ delivery_tag','当前通道的一次投递','在接收它的原通道 ACK'],
  ['SQS ReceiptHandle','消息的一次接收','用于相应删除或可见性操作'],
  ['Lambda 部分响应 messageId','当前批中的失败记录','映射启用对应选项后解析失败列表'],
  ['业务 operation_id / event_id','跨运输尝试的同一动作','到效果接收方查询稳定回执']
 ])+
 p('这些接口的正常返回和重投规则由各自平台定义。RabbitMQ 实验可以说明确认对象与业务事务的关系；SQS/Lambda 的可见性、批响应与删除需要各自的云端记录验证。积压分析同样要分开等待、已投递未确认、实际执行和业务完成，再把新增并发与下游容量共同计算。')+
 linkRow(links(m[7])),

 anchor('message-native-run')+
 p('完整实验由 mq_delivery.py 创建代理与客户端环境，mq_client.py 执行真实发布、接收、确认和 SQLite 业务事务。已发布的验证记录来自公共 Linux CI：RabbitMQ 4.4.0、Pika 1.3.2，包含实际代理重启和子进程 SIGKILL；它与上一章的标准库批策略参考属于不同执行证据。')+
 mc8[0]+
 table(['记录项目','独立结果','对应机制'],[
  ['mandatory / 无路由确认','前者识别不可路由；后者确认成功但队列不存在','发布反馈与路由条件'],
  ['提交后退出、重投、重新发布','效果始终 1 笔，总数 37','稳定业务身份与事务回执'],
  ['提前 ACK 的负例','ready=0，effects=0；业务验收 false','确认时机与工作遗漏'],
  ['错误通道 ACK','返回 406，关闭错误通道','delivery_tag 的通道范围'],
  ['订阅预取 / get 拉取','窗口 1 时订阅先到 1 条；get 可拿 2 条','预取适用的 API 条件'],
  ['代理重启','同数据卷读回 amount=7，ACK 后 ready=0','本次存储与重启路径']
 ])+
 p('在可用的本地 Linux Docker 环境解压实验包后运行上述命令，输出到 runs/mq-record.json。主机脚本使用 Python 标准库，Pika 安装在独立客户端镜像中；准备镜像和依赖需要联网。结果文件逐项保留代理反馈、队列状态与业务效果，退出码用于汇总。')+
 linkRow(links(m[8]))+
 fold('运行环境与实验范围',p('程序创建随机命名的代理、客户端、内部网络和专用数据卷，不发布宿主端口。固定凭据仅用于这套公开临时夹具；消息测试在内部网络进行，结束时清理程序自己创建的资源。源码和记录可通过下载链接核对；本章没有运行 SQS、Lambda、多节点仲裁队列或云端故障切换。'))+
 fold('完整 mq_delivery.py：自有资源生命周期与结果汇总',mc8[1])+
 fold('完整 mq_client.py：AMQP 操作、事务与崩溃屏障',mc8[2])+
 fold('完整 Dockerfile.mq-client：固定客户端依赖',mc8[3])
 ],['message-native-run']);
 delivery.desc=delivery.intro='先认识消息、代理、投递与业务效果，沿正常发布和确认理解状态，再用真实 RabbitMQ 核对重投、预取和持久重启。';

 const jetstreamLink='<a href="/article/serverless-execution/#native-jetstream-redelivery">查看超时重投与写权限实战 →</a>';
 serverless.sections[4][1]+=p('超时后重新投递，旧执行者未必已经停止。第 11 节用两条保持独立的真实 JetStream 客户端连接，分别核对同一条消息再次送达和旧执行者能否写业务库。'+jetstreamLink);
 serverless.sections[10][1]+=h('native-jetstream-redelivery','真实 JetStream：重投之后，谁还能写入')+
 p('JetStream 是 NATS 的消息存储和投递层。实验用一个持久拉取消费者保存进度，两条独立连接先后请求同一条金额 37 的消息。A 首次收到后保持连接，不确认。服务端的确认等待时限 AckWait 为 1 秒。B 收到同一流序号，投递次数变为 2，此时 A 仍然在线。')+
 '<figure class="training-figure"><a href="diagrams/jetstream-redelivery.svg" target="_blank" rel="noopener" aria-label="放大：重投之后谁还能写入"><img src="diagrams/jetstream-redelivery.svg" width="440" height="372" alt="同一消息由 A 到 B 重投，业务库推进代际后比较追加写两份、去重留 A 一份、校验代际留 B 一份" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>代理按时限重投，业务库按自己的规则决定谁能写入。<a href="diagrams/jetstream-redelivery.svg" download>下载 SVG ↗</a></figcaption></figure>'+
 p('B 收到以后，实验让业务库把当前可写代际从 1 改为 2，再让 A 先写、B 后写。只按业务 ID 去重时，先到的 A 仍能写入，B 只能复用原记录。若要让 A 失去写资格，接收方要在写入事务内比较它携带的代际和当前代际。这样 A 的代际 1 被拒，B 的代际 2 才提交。代际由业务方分配，与代理记录的投递次数各有用途。')+
 p('三组都由 B 发出 <code>ack_sync</code> 并收到代理确认，待确认消息数都从 1 降到 0。直接追加的负例仍留下两份金额 37。JetStream 在某些情况下也可以接受迟到的 ACK。本实验只观测 B 的确认，前面的 SQLite 参考使用另一套句柄规则。<a href="https://docs.nats.io/learn/jetstream/acknowledgment">JetStream 确认与重投 ↗</a> · <a href="https://github.com/nats-io/nats-server/blob/v2.15.2/server/consumer.go">固定版本接收 ACK 的实现 ↗</a>')+
 p('按运行说明准备官方 NATS Server 2.15.2 和锁定的 nats-py 2.16.0，然后在解压目录运行 <code>python -B jetstream_redelivery.py --server /path/to/nats-server --output native-record.json</code>。两个执行上下文在同一个 Python 进程中，分别使用真实回环连接。')+
 '<p class="practice-links"><a href="/labs/jetstream-redelivery.zip" download>下载完整实验包 ↓</a> · <a href="/labs/jetstream-redelivery/README.md">查看运行说明</a> · <a href="/labs/jetstream-redelivery/validation.json">查看代理与账本的实际记录</a> · <a href="https://github.com/CaptainGreenskin/infra-guide/actions/runs/42575586293">查看 Linux CI 实跑 ↗</a></p>';
 delivery.sections[7][1]+=p('本章 RabbitMQ 对照让消费者退出，再观察未确认消息重新投递。另一个实战让旧客户端继续连接，等待真实 JetStream 计时重投后再比较业务去重和写权限。'+jetstreamLink);
 const {effect_before_ack_crash:afterCommit,ack_before_effect_negative:earlyAck}=deliveryNativeValidation.native.mq.execution.cases;
 const [reportId,reportTotal]=afterCommit.recovered.operations[0];
 serverless.sections[5][1]+=
 h('serverless-ack-evidence','用实际投递和账本核对消息确认')+
 p('把 <code>'+trainingEscape(reportId)+'</code> 的日报放进真实 RabbitMQ 实验。消费者在 SQLite 提交一行，记录业务动作编号、总数 '+reportTotal+' 和参数摘要。这行既保存效果，也让重试能查到原结果。程序随后让消费者退出，它还没发 ACK，也就是还没告诉消息代理这次投递已处理。')+
 table(['实验动作','队列侧的记录','业务库实际留下什么'],[
  ['提交后退出，再次接收','<code>'+trainingEscape(afterCommit.redelivery.message_id)+'</code> 再次送达','查到原记录，共 '+afterCommit.recovered.effects+' 笔，总数 '+afterCommit.recovered.total],
  ['同一业务动作换消息再发','新消息 ID <code>'+trainingEscape(afterCommit.republished_message_id)+'</code>','仍查到原记录，只有 '+afterCommit.after_republish.effects+' 笔，总数 '+afterCommit.after_republish.total],
  ['另一条消息先 ACK，再在提交前退出','可供投递的消息数 <code>ready='+earlyAck.ready_messages+'</code>','账本 <code>effects='+earlyAck.business.effects+'</code>，业务未完成']
 ])+
 p('排查函数重试时也要分别查这两处。队列读数回答还有几条消息可供接收，业务库里的回执回答报告是否已经保存。发布端为同一动作重新发消息时，即使运输 ID 变了，也用原业务动作编号查回执。表中是 RabbitMQ 与 SQLite 的原生记录，SQS/Lambda 的删除和批响应沿前面的平台规则判断。')+
 '<p class="practice-links"><a href="/article/message-delivery/#message-native-run">到 C5.2 看如何复跑代理、退出和重投 →</a> · <a href="/labs/delivery-systems/validation.json">查看队列与业务原始记录 →</a></p>';
 delivery.sections[8][1]+=p('沿同一份队列和账本记录回到<a href="/article/serverless-execution/#serverless-ack-evidence">C5.1 的函数提交与消息确认</a>。函数成功返回之前，先确保效果已经提交，重试时能按原动作编号查到结果。');
 serverless.updated=delivery.updated='2026.11.12';

 const firstActorIntro=p('函数是一段由平台接收输入并执行的应用程序；处理这次输入的入口称为处理函数（handler）。先用报告服务区分输入、执行和产物：用户请求生成日报，服务记录任务并发送消息，平台取出消息调用处理函数，处理函数保存报告，用户随后读取报告。');
 if(!serverless.sections[0][1].includes(firstActorIntro))throw Error('Serverless actor introduction changed');
 serverless.sections[0][1]=serverless.sections[0][1].replace(firstActorIntro,firstActorIntro+
  p('发送消息的程序叫生产者，保存并投递消息的服务叫消息代理，取得消息并处理的程序叫消费者。'));

 const triggerIntro=p('触发器决定输入怎样到达函数。同步调用由调用方等待返回；异步调用先受理输入、再安排执行；队列事件源映射则是平台维护的一段连接配置，由它轮询队列、组成批次并调用函数。先明确正常路径，才能把失败交还给正确的一方。');
 if(!serverless.sections[2][1].includes(triggerIntro))throw Error('Serverless trigger introduction changed');
 serverless.sections[2][1]=serverless.sections[2][1].replace(triggerIntro,
  p('触发器决定输入怎样到达函数。同步调用由调用方等待返回；异步调用先受理输入、再安排执行。队列事件源映射是一份把队列连接到函数的配置，平台据此安排轮询器。轮询器反复向队列请求消息，取得消息后调用处理函数。')+
  h('serverless-queue-actors','跟着一份日报，看谁取消息、谁确认完成')+
  p('用 Amazon SQS 队列接收前面的 <code>report-27</code>，处理结果仍是总数 37。用户先请求生成日报，日报服务把任务消息送进队列，随后返回任务已受理。接下来的处理由平台推进，用户可以稍后查询报告。')+
  p('Lambda 的轮询器从 SQS 接收消息，队列把消息暂时隐藏。轮询器把消息作为输入同步调用 handler，并等待它返回。handler 在业务库提交报告和回执，再返回成功；Lambda 随后删除这批已成功处理的消息。这里用户收到受理结果和 handler 返回成功，是两次不同的返回。')+
  '<figure class="training-figure"><a href="diagrams/serverless-queue-actors.svg" target="_blank" rel="noopener" aria-label="放大日报的队列、轮询器与处理函数时序"><img src="diagrams/serverless-queue-actors.svg" width="460" height="660" alt="用户提交日报，服务写消息并返回受理。Lambda 轮询器接收消息并同步调用处理函数。函数提交报告 37 和回执，成功返回后，平台删除队列消息。" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>业务提交、函数返回和删除消息依次推进。删除前函数仍可能已经保存了报告。<a href="diagrams/serverless-queue-actors.svg" download>下载 SVG ↗</a></figcaption></figure>'+
  p('如果 handler 提交后、返回前退出，报告已经存在，消息还可能重投。后面的重试、接收句柄和批次响应都沿这次交接展开。<a href="https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#sqs-polling-behavior">AWS 的 SQS 轮询、同步调用与删除顺序 ↗</a>'));
 serverless.updated='2026.11.12';

 const invocationFigure='<figure class="training-figure" id="serverless-invocation-lanes"><a href="diagrams/serverless-invocation-lanes.svg" target="_blank" rel="noopener" aria-label="放大 Serverless 的冷启动与复用时序"><img src="diagrams/serverless-invocation-lanes.svg" width="1040" height="412" loading="lazy" alt="新建环境比复用多一次初始化；两条路径都包含入口、可能的排队、handler 和返回或交接。端到端计时跨越整个约定区间。"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>同一调用路径中的阶段顺序。若只在 handler 里开始计时，入口、排队和环境初始化不会计入。 <a href="diagrams/serverless-invocation-lanes.svg" download>下载 SVG ↗</a></figcaption></figure>';
 const environmentFold='<details class="full-code"><summary>环境复用与预热的适用条件';
 if(!serverless.sections[1][1].includes(environmentFold))throw Error('Serverless timing figure insertion point changed');
 serverless.sections[1][1]=serverless.sections[1][1].replace(environmentFold,invocationFigure+environmentFold);
})();
