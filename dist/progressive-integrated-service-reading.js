/* One real numerical service, then capacity and failure reasoning over its boundaries. */
(()=>{
 if(typeof integratedServiceSource!=='string'||typeof integratedServiceValidation==='undefined')throw Error('Missing integrated service source/evidence');
 const a=articles.find(x=>x.id==='production-readiness');
 if(!a)throw Error('Missing integrated design chapter');
 const expected=['把资料分析服务写成一份用户契约','画出控制面、执行面与权威记录','先做一笔从流量到在途工作的容量预算','把身份、数据版本和模型版本捆在同一条链','用五个故障窗口检查端到端一致性','定义评估集，让可靠性结论有分母','让观测与演练覆盖设计假设','练习：用一页纸组织一次设计面试'];
 if(JSON.stringify(a.sections.map(s=>s[0]))!==JSON.stringify(expected))throw Error('Integrated service section identities changed');
 const before=a.sections.map(s=>s[1]),identity=JSON.stringify([a.id,a.title,a.number,a.module]);
 const p=(...items)=>items.map(text=>'<p>'+text+'</p>').join('');
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="progressive-detail"><summary>'+title+'</summary>'+body+'</details>';
 const matches=(text,re)=>[...text.matchAll(re)].map(m=>m[0]);
 const figures=text=>matches(text,/<figure\b[\s\S]*?<\/figure>/g);
 const links=text=>matches(text.replace(/<figure\b[\s\S]*?<\/figure>/g,''),/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/g).join(' · ');
 const existingLinks=index=>links(before[index])?'<p class="practice-links">'+links(before[index])+'</p>':'';
 const evidence=integratedServiceValidation.program;
 if(integratedServiceValidation.schema!=='integrated-service-validation-v1'||evidence?.status!=='passed'||evidence.environment.torch!=='2.5.1'||evidence.environment.device!=='cpu')throw Error('Unexpected integrated service evidence');
 const normal=evidence.cases.normal.oracle,recovered=evidence.cases.recover_same_operation.oracle,unsafe=evidence.cases.unsafe_new_operation.oracle;
 if(normal.expected_total!==37||normal.effect_count!==1||!normal.accepted||recovered.tool_attempts!==2||recovered.effect_count!==1||!recovered.accepted||unsafe.effect_count!==2||unsafe.accepted)throw Error('Integrated service record contradicts lesson');
 if(evidence.capacity.mean_in_system!==60||evidence.capacity.mean_busy_slots!==40||evidence.capacity.slots_for_70_percent_target!==58)throw Error('Integrated service capacity boundaries changed');
 const body=[
  p('把资料分析缩成一项可以逐步核对的任务：租户A的用户alice要求读取daily-values/v1中的两个数10、27，使用批准的数值模型，生成一份report-A，并在有读取资格时取得它。输入来自固定source.json；报告不仅要写37，还要保存来源身份、模型束身份和内容摘要。',
  '本例真实运行PyTorch Linear(2,1)：它把两个输入分别乘权重再相加，最后加偏置。固定权重[1,1]、偏置0，所以[10,27]得到1×10+1×27+0=37。模型束linear-sum-v1包含配置、权重及两者摘要。执行器的计划预先固定，负责调用模型与工具；这里没有语言生成、模型规划或训练。')+
  table(['正常推进','实际对象与记录'],[
   ['提交并冻结','POST /tasks保存task-A、请求身份submit-A-001、源v1和确定模型束，返回202 ACCEPTED'],
   ['读取并推理','新worker取得冻结输入，调用独立CPU模型服务的/infer，保存37和实际模型身份'],
   ['提交前核对','确认来源/输入一致、模型束获准、数值满足任务条件，再允许写报告'],
   ['工具提交并发布','接收方沿task-A:save保存完整产物、操作回执和report-A指针，同一事务提交'],
   ['本地确认与读取','worker核对已发布内容后保存SUCCEEDED；入口再按当前身份与资格向用户交付']
  ])+p('202只说明任务已经受理：本次实际记录中，此刻接收方效果数为0。报告发布和任务完成发生在后续推进，不能把提交接口返回时间当成完整任务时间。最终验收直接读取真实来源和报告，检查总数37、两个输入的版本、批准模型束与一份效果。'),

  p('这条链由四类进程执行：入口API、CPU模型服务、效果接收方和每次新建的worker。控制面保存任务及读取资格，worker按固定计划推进，模型服务只计算数值，接收方持有真正的报告与发布指针。进程之间实际发送本机HTTP；一个进程返回成功，只能先说明它自己负责的那一段。')+
  trainingFigure('v70-service-chain','同一份daily-values/v1=[10,27]经过真实CPU模型得到37。任务库、模型调用库与效果接收方分别保存事实；oracle直接读取来源、模型契约和这些记录。')+
  table(['权威位置','保存什么','能够回答什么'],[
   ['tasks.sqlite','冻结输入、模型束、阶段、尝试数、本地回执、当前读取资格','任务准备做什么、本地已经确认什么、现在允许谁读取'],
   ['model.sqlite及模型文件','真实模型调用的输入、输出、模型束；配置和权重字节','本次实际计算了什么、用了哪份模型'],
   ['receiver.sqlite','效果、完整产物、操作回执和目标发布指针','报告是否真正提交、发布的是哪份内容'],
   ['source.json与model-contract.json','固定来源与批准数值模型契约','独立重算与比较的依据']
  ])+p('接收方把效果、回执与发布指针放在同一SQLite事务里，因此读者看到的是已完整提交的报告。接收方与tasks.sqlite之间没有共同事务：报告可以已发布，而worker尚未保存本地确认。恢复正是沿这两份记录的差异推进。任务ID关联目标，操作ID关联一次逻辑写入，worker尝试号记录实际推进次数，它们没有一一对应关系。')+
  fold('通用Agent中的提议、授权与效果',p('下面保留一般Agent的关系图。需要动态决策的实现可以让模型提出动作；本次数值实验使用固定计划，只验证真实调用、提交、恢复和验收的接线。')+figures(before[1]).join('')),

  p('容量计算先选择边界和单位。下面另设独立稳态题，不采用实验HTTP或Linear调用的实际耗时：每秒接纳并完成2个任务，从受理到完整任务结束平均30秒；其中10秒用于排队或不占该类执行槽的依赖等待，每任务在同类执行池累计占用20槽秒。槽位是这个池同一时刻可承载一份执行的资源单位。')+
  table(['统计边界','计算','得到什么'],[
   ['完整任务：λ=2任务/秒，W=30秒','L=λW=2×30=60任务','系统内平均在途，包括等待与执行'],
   ['同类执行池：S=20槽秒/任务','平均忙槽=2×20=40槽','只计算这个资源池的占用'],
   ['希望平均利用率不超过70%','ceil(40/0.7)=58槽','题设负载下的初步资源数'],
   ['实际提供64槽','40/64=62.5%','该池平均利用率'],
   ['只看这类槽的理想上限','64槽÷20槽秒/任务=3.2任务/秒','其他模型、工具或存储环节仍可能更紧']
  ])+p('60个在途不是60个同时执行者。题设平均有40个忙槽，其余停留发生在池外，不能一概称为这个池的排队长度。若调用依赖时仍占着该池槽位，那段等待就应计入S；30秒端到端停留与20槽秒资源需求不能互换。',
  'Little关系L=λW需要同一工作总体、同一起止边界和可比较的稳定统计窗口。持续输入超过完成能力、队列不断增长时，不能假定已有这组稳态平均数。实际准入还要看尾部时长、租户公平性和依赖容量，槽位数量也不替代节点形状与整组可行性。')+
  fold('另一份成本题：分母仍是完整任务',p('独立题设为100个原始任务、150次模型调用、220次工具调用，最终80个任务合格，总成本100单位。每原始任务成本100/100=1，每合格任务承担的全量成本100/80=1.25。失败和重试用量仍留在分子，不能用一次模型调用的均价代替整任务成本。这些数没有来自下面六个协议场景。'))+existingLinks(2),

  p('身份决定谁提出任务，来源版本决定读取哪份内容，模型束决定用哪套数值与配置计算。入口将fixture-user-A映射为alice/A，将fixture-user-B映射为bob/B；映射来自公开固定测试夹具，请求自己填写另一个租户不会改变它。服务之间使用单独的固定服务凭据，接收方只接受A、task-A和report-A范围内的写入。',
  'worker的正常提交门禁先核对冻结来源及其文件摘要，再比较实际模型束与批准清单，并检查输入摘要和声明的总数条件37。模型服务加载前也校验配置与权重的真实字节。绑定摘要可发现内容不匹配，可信批准记录则决定这份模型是否属于本任务，二者分别判断。')+
  table(['需要绑定的对象','本例怎样落地'],[
   ['来源','daily-values/v1、租户A、source.json文件摘要，模型输入摘要对应[10,27]'],
   ['模型束','linear-sum-v1、配置/权重SHA-256、规范manifest摘要；实际CPU/float64、PyTorch2.5.1'],
   ['工具意图','task-A:save绑定目标及整份报告；同键改内容返回冲突'],
   ['读取资格','入口按当前任务归属与report_read判断，再取得发布产物']
  ])+p('读取实验先让A取得200与37，再让B跨租户查询，返回403；随后先提交A的读取撤权，再持原凭据发起新读，也返回403。两次拒绝都没有增加接收方读取。已发布报告仍存在且内容有效，当前用户能否读取则是另一项判断。对于语言模型，词表、模板和生成设置也应进入相应完整版本清单。')+existingLinks(3),

  p('先看正常写入：task-A:save携带报告37，接收方在本地事务中写入效果、完整产物与发布指针，提交后才返回回执，worker再把确认写入任务库。现在只把退出放在“接收方已提交、worker本地未确认”之间，实际子进程调用os._exit(23)：')+
  table(['观察位置','退出后真实记录','新进程怎样继续'],[
   ['任务库','RUNNING / MODEL_READY；本地receipt为空；推理结果已保存','取回原来源、模型束及结果，不再调用模型'],
   ['接收方','效果1、产物1、发布指针1','沿原task-A:save与同一报告重试，返回原回执'],
   ['恢复后的任务库','worker尝试2、工具尝试2、模型调用1','核对发布内容后保存SUCCEEDED；效果仍1']
  ])+p('错误对照故意把恢复操作改成新ID。接收方依法将它视为另一项写入，产生第二份产物；当前报告依然显示37，任务也能SUCCEEDED，独立oracle却因效果2、产物2而拒绝。错误来自调用者破坏逻辑身份协议，不能靠最终数值相同掩盖。')+
  table(['原设计中的失败窗口','本例实际覆盖','继续设计时的边界'],[
   ['受理后回执不确定','相同提交键再次请求，得到原task-A','未注入提交响应丢失'],
   ['模型调用等待','有HTTP超时与总监督预算','未注入模型超时、取消或服务故障'],
   ['工具提交、本地未确认','真实退出23与新worker恢复；同键1份、新键2份','未运行同时存活的多个worker或fencing'],
   ['产物未完整发布','完整报告与指针同库原子提交','未模拟远端多文件上传中断'],
   ['资格变化','先提交撤权，后发新读取，实际403','检查后已在途的跨HTTP交付另定协议']
  ])+p('错误模型也先走正常门禁：偏置改1的真实Linear输出38，同值错版本则输出37但束名为v2，两者均在写入前退出24、效果0。只有显式bypass-release-gate负例才故意继续提交；独立oracle分别识别错误总数/模型字节和未批准版本。跨库动作已经提交时，补偿仍应作为另一项获准动作，而不是删除本地状态就当它未发生。'),

  p('独立验收器oracle直接读取源JSON、模型契约、批准和实际模型文件、任务库、模型调用库及接收方库。它从10与27重算37，核对模型字节和版本，再检查真实产物、来源、目标、效果份数及发布指针。worker返回的success或SUCCEEDED不会成为这些事实的替身。')+
  table(['实际场景','应观察的结果','独立产物判断'],[
   ['normal','模型1次、工具1次，报告37，效果/产物各1','接收'],
   ['recover_same_operation','退出后原键恢复，工具2次、效果仍1','接收'],
   ['unsafe_new_operation','故意换键，报告值仍37，效果/产物各2','拒绝'],
   ['read_authorization','原产物有效；跨租户及撤权后新读取均403','产物接收，读取判据单独核对'],
   ['wrong_weights','正常门禁先拦住；故意绕过后实际写38','拒绝'],
   ['wrong_version','正常门禁先拦住；故意绕过后写37但模型束v2','拒绝']
  ])+p('status=passed表示这些场景分别满足事先规定的正例或负例判据。六个协议场景不是从用户流量抽样，不能把oracle接收比例当作服务成功率。oracle.accepted评价产物、版本和份数；当前读取资格与拒绝时没有交付正文，继续由真实HTTP结果和读取记录检验。')+
  fold('总体比例与依赖成功率',p('另设20题：12简单、4长文档、4恢复。A分别通过12、2、1，总体15/20=75%；B通过11、4、3，总体18/20=90%，还要单独看简单题的退化。比较前固定输入、初态、时间与调用预算，避免旧产物让新试次无需工作就通过。模型调用成功率99.9%也不等于任务成功率99.9%；应直接测任务完成条件，在没有独立性依据时不机械相乘各段平均值。'))+existingLinks(5),

  p('同一任务的记录用不同身份连接。task-A贯穿受理与完成；task-A:save贯穿工具尝试与回执；worker尝试号与PID区分实际进程；源版本、模型束与摘要说明每次使用的内容。实际观测中，恢复将worker和工具尝试从1变为2，模型调用仍1、效果仍1；这几个计数分别解释重做了哪段工作。',
  '入口审计保存accepted、release_gate和completed，接收方保存每次操作是否duplicate，模型库记录实际输入输出。accepted与completed时刻来自同一API进程并以十进制字符串保存纳秒；这些事件用于确认受理早于完成，不代表已经测过跨机器时钟或生产延迟。业务效果仍以接收方数据库核对，遥测用于解释经过。',
  'suite给自己启动的服务和worker建立独立POSIX进程组，以90秒监督运行；HTTP等待至多5秒，子进程使用剩余期限。退出时终止并wait这些进程组，默认临时目录删除；显式output-dir才保留文件。它不配置容器隔离或生产资源限制，本轮也未做云端负载、冷启动或节点故障压测。',
  '范围集中在单宿主、真实本机HTTP、CPU数值推理、SQLite分域提交、主动退出恢复和指定时点的读取撤权。授权检查与后续跨HTTP交付之间没有全局原子性；并发撤权、活着的旧worker、物理断电和多宿主接管仍需目标环境验收。没有真实LLM、模型规划、GPU或Kairo接入。'),

  '<span class="legacy-subsection-anchor" id="integrated-service-run" aria-hidden="true"></span>'+p('下载完整实验目录，在已有PyTorch2.5.1的Python环境执行下面命令。先读normal的202响应、四类进程和oracle，再读recover_same_operation的commit_gap；最后比较错误操作身份及错误模型束。保留目录后，还可单独运行oracle，直接检查已经退出的服务留下的数据库。')+
  trainingCode('解压integrated-service目录后执行','BASH','python -B integrated_service.py > result.json\n# 保留数据库：runs必须尚不存在\npython -B integrated_service.py --output-dir runs > retained-result.json\npython -B integrated_service.py oracle --folder runs/normal\npython -B integrated_service.py oracle --folder runs/unsafe_new_operation')+
  '<p class="practice-links"><a href="labs/integrated-service.zip" download>下载完整实验包 ↓</a> · <a href="labs/integrated-service/README.md">运行与记录说明 →</a> · <a href="labs/integrated-service/integrated_service.py" download>完整Python源码 ↓</a> · <a href="labs/integrated-service/validation.json">实际结果与源码摘要 →</a></p>'+
  fold('完整integrated_service.py：入口、模型、工具、恢复与独立验收',trainingCode('integrated_service.py','PYTHON',integratedServiceSource))+
  p('给自己的设计画同样一条正常路径，再选一个明确提交窗口：提前固定来源、模型束与操作身份，记录退出前两边各有什么，用新的执行者恢复，最后从真实来源与产物独立验收。若模型计算更快却没有明显缩短任务时间，就比较同一任务的排队、模型、工具与发布区间，再检查它是否把更多到达量推给了工具；不要只比较模型内部计时。',
  '这个数值案例提供可复查的接线起点。训练恢复和Kairo接入仍各自使用对应程序、输入与目标环境：')+existingLinks(7)
 ];
 const now=body.join(''),old=before.join('');
 if(JSON.stringify([a.id,a.title,a.number,a.module])!==identity||body.length!==8)throw Error('Integrated service chapter identity changed');
 for(const original of figures(old))if(!now.includes(original))throw Error('Integrated service lost original figure');
 for(const token of matches(old,/\bhref=["'][^"']+["']/g))if(!now.includes(token))throw Error('Integrated service lost original link '+token);
 for(const[,id]of old.matchAll(/\bid=["']([^"']+)["']/g))if(!now.includes('id="'+id+'"')&&!now.includes("id='"+id+"'"))throw Error('Integrated service lost published ID '+id);
 if(matches(old,/<pre\b/g).length!==0||!now.includes(trainingEscape(integratedServiceSource.trim())))throw Error('Integrated service full source binding changed');
 body.forEach((text,index)=>{if(text===before[index])throw Error('Integrated service section was not revised');a.sections[index][1]=text;});
 a.sections[4][1]+='<h3 id="protocol-business-evidence">请求走到哪一步，去哪个系统查</h3>'+
  p('接口返回的状态描述某一段协议。用户要的是报告，最终验收仍要回到报告和它的来源。排查时先圈出发生变化的一段，再找它和下一段共用的身份。')+
  table(['看到的现象','继续查什么','实跑对照'],[
   ['事件发生第二次投递','按消息序号对齐两次交付，再用业务键查报告和写入者代际','<a href="/article/serverless-execution/#native-jetstream-redelivery">同一消息交给两个仍活着的执行者</a>'],
   ['两次推理可能复用同一前缀','按前缀缓存键找块，再查块的引用数与空闲顺序','<a href="/article/inference-performance/#vllm-block-lifecycle">最后一个引用释放后，原缓存键仍可命中</a>'],
   ['工具的响应流断开','用请求号定位断流与清理，用原操作键另查报告回执','<a href="/article/mcp-protocol/#mcp-http-cancellation-run">提交前、提交后分别断开响应流</a>']
  ])+
  p('这些是三份独立实验，分别检验事件交付、推理状态与工具效果。回到本章报告任务，先从 <code>task-A:save</code> 找接收方的回执和发布指针，再核对输入、模型版本与正文。队列或工具的事件帮助解释路径，验收结论由接收方和实际产物给出。');
 a.sections[6][1]+=p('综合实验由接收方核对报告和回执。采集器自身也需要用已知输入验收。用另一份三任务夹具比较全量与尾部采样，并从接收库还原成功数、尝试数和实际报告数。这样可以分清哪张表解释一次错误，哪张表能作为业务分母。<a href="/article/agent-observability/#native-tail-sampling-ledger">查看双管道对账实战 →</a>');
 a.updated='2026.11.09';a.minutes=55;a.desc='沿一份37报告接通HTTP入口、CPU模型、独立接收方与恢复进程，再按权威记录核对容量、授权和真实结果。';a.intro=a.desc;
 a.baseline='PyTorch 2.5.1 · CPU · 本机HTTP/SQLite';
})();
