/* One durable task, then the distinct mechanisms used to continue it.
   Sources, old code, figures and deep links are retained verbatim. */
(()=>{
 // Isolated bridge checks intentionally load a lesson without this dependency.
 // The production shell loads the native bridge before this authored revision.
 if(typeof langgraphWorkflowBridgeReview==='undefined')return;
 const a=articleById('durable-workflows'),before=a.sections.map(s=>s[1]);
 const p=(...items)=>items.map(t=>'<p>'+t+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="progressive-detail"><summary>'+title+'</summary>'+body+'</details>';
 const matches=(s,re)=>[...s.matchAll(re)].map(m=>m[0]);
 const codes=s=>matches(s,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=s=>matches(s,/<figure\b[\s\S]*?<\/figure>/g);
 const pres=s=>matches(s,/<pre\b[^>]*>[\s\S]*?<\/pre>/g);
 const links=s=>matches(s,/<a\b[^>]*href="[^"]+"[^>]*>[\s\S]*?<\/a>/g);
 const sourceLinks=s=>'<p class="source-at">'+links(s).filter(x=>/href="https:/.test(x)).join(' · ')+'</p>';
 const labLinks=s=>'<p class="practice-links">'+links(s).filter(x=>/href="labs\//.test(x)).join(' · ')+'</p>';
 const c3=codes(before[2]),c8=codes(before[7]),c9=codes(before[8]),c10=codes(before[9]);
 if(c3.length!==2||c8.length!==3||c9.length!==7||c10.length!==2)throw Error('Workflow source inventory changed');
 const f1=figures(before[0]),f3=figures(before[2]),f4=figures(before[3]),f8=figures(before[7]);
 if(f1.length!==1||f3.length!==1||f4.length!==1||f8.length!==4)throw Error('Workflow figure inventory changed');

 a.sections[0][1]=p(
 '工具恢复章已经把一次外部提交连到稳定操作身份与回执，记忆章区分了执行状态和模型输入。本章把这些对象放进多步骤任务：读取订单、汇总、检查、等待批准，再发布报告。工作流是规定这些步骤及推进条件的程序；一次运行则是这份程序为某个任务产生的状态和记录。',
 '固定任务report-A：基础来源orders-A/v3含[10,27]，它还引用补录late-A/v1。沿引用实际读到[5]，得到37+5=42。报告须保存完整来源，内容检查通过并获得匹配批准，才可发布一份。目标约束最后的结果，依赖约束达到结果的顺序。')+
 table(['对象','负责什么','report-A中的内容'],[
  ['工作流定义','规定允许的步骤和条件','读基础→读补录→汇总→检查→批准→发布'],
  ['运行状态','记录这一次任务已有的数据及下一步','基础37、补录5、草稿42、当前等待批准'],
  ['计划','安排尚未完成的工作，可被接纳或修订','已知补录可预设分支；新发现缺步骤时补入读取'],
  ['事实','已经取得并保存的结果或外部输入','某个版本的来源、某份回执、对具体草稿的批准']
 ])+
 h('subsection-1-3htvho','步骤依赖与计划修订')+p(
 '基础读取产生补录引用，补录读取才能确定下一份输入；两份来源齐全后才能汇总。固定工作流把这条分支预先写好；动态计划允许提出新安排，再由执行器校验依赖、权限和预算。这里分支已知，固定流程足以完成任务。动态路径额外验证的是“发现缺步骤后能否改计划并保留适用事实”。')+f1[0]+
 h('subsection-1-z363qn','工作请求与确认结果')+p(
 '执行请求表示准备做什么，确认结果表示已经观察到什么。安排读取后，必须得到并保存对应结果，后续才能使用它；请求发布后，必须核对接收方效果。等批准时则持久保存等待对象，收到适用输入后继续。下面依次展开记录、恢复、提交和执行接管。')+sourceLinks(before[0]);

 a.sections[1][1]=h('subsection-2-1pgk1ak','历史、快照与可恢复状态')+p(
 '持久化是把恢复所需的信息写到进程之外，使新进程能重新读取。事件历史按顺序记录已接纳的动作和结果；检查点保存某一执行位置的状态及待处理工作。系统可以组合两者，也可以采用其中一种主要恢复方式。普通调用栈中的局部变量不会因为任务名字相同就出现在新进程里。',
 '先把事件机制缩成独立的23练习：活动是交给工作进程实际执行的工作单元；read_metrics读取输入，render_draft用结果生成文本。它们与42报告使用相同的“结果供下一步使用”关系，数字和来源分别独立。')+
 table(['记录顺序','已持久保存的内容','恢复可据此决定'],[
  ['started','定义版本1','记录本例定义版本；本地解释器未实现按版本选择代码'],
  ['scheduled','read-1 / read_metrics','这次读取已被安排'],
  ['completed','read-1的结果23','后续可以使用已确认的23'],
  ['scheduled → completed','draft-1及其文本结果','草稿活动已经完成'],
  ['finished','本练习的最终草稿','再次恢复无需安排新工作']
 ])+
 h('subsection-2-u7tby','按确认结果恢复下一步')+p(
 '重放指重新运行决定步骤的代码，并让决定与已有历史对应。代码请求已完成的read-1时，执行器返回记录的23；请求尚未完成的draft-1时，才安排实际活动。恢复重新走决定，活动结果从持久记录进入计算。框架也可从检查点中的状态和待决任务继续，具体从哪一段代码重入由该实现规定。')+
 h('subsection-2-1cfmvg2','事实复用的输入身份')+p(
 '回到42报告，计划版本revision描述未来的步骤安排；源版本属于某一份数据，例如orders-A/v3。计划改成2，基础来源仍是v3时，已有基础事实可以继续使用；加入补录后，汇总输入集合改变，原来的37需重新计算。',
 'planning_lab.py把步骤名和输入身份共同作为事实键。来源清单列出资源名、版本和内容摘要；汇总键再绑定任务、目标及整份清单。摘要是按规定编码计算的SHA-256内容指纹，用于比较输入身份。只按步骤名sum缓存，会把旧37误当成新输入的汇总。')+
 table(['保存位置','42任务中的内容','恢复用途'],[
  ['plans','步骤及计划版本','选择当前已接纳安排'],
  ['facts','步骤、输入身份、结果','复用仍适用的结果'],
  ['runtime','当前阶段、草稿和预算','判断现在可推进、需等待还是已结束'],
  ['signals','输入标识、批准内容及消费状态','找到与当前草稿匹配的外部输入'],
  ['reports','实际交付报告和来源清单','独立核对最终业务结果']
 ]);

 a.sections[2][1]=h('subsection-3-ueacvx','决定代码与历史相容性')+p(
 '同一份历史恢复时，决定代码需要按实现的规则对应已经安排的工作。23练习按活动id、类型和顺序匹配：第一项仍须是read-1/read_metrics，之后才是draft-1/render_draft。换活动类型、遗漏旧命令或在已完成历史后增加命令，会触发相容性错误。',
 '读取当前文件、询问实时模型或调用系统随机数会取得新的外部值。需要这些值时，把它们安排为可记录结果的工作，再让后续决定消费保存结果。真实框架还提供重放安全的时间、随机和版本接口，应按对应SDK使用。')+
 h('subsection-3-1amsab8','结果记录前后的两种恢复')+p(
 '保持同一读取活动，分别把进程退出放在结果保存前后。来源最初为23，进程退出后改成999。下面两条路径只改变退出位置，因而能看出恢复依赖哪份事实。')+f3[0]+
 table(['退出位置','历史中已有什么','新进程的实际结果'],[
  ['Completed写入后退出23','读取安排及结果23','复用23，读取总计1次'],
  ['活动返回、Completed尚未写入时退出24','只有读取安排','重新读取999，读取总计2次'],
  ['完整历史再次重放','读取、草稿、结束均已记录','新增活动调用0次，新增事件0条']
 ])+
 h('v43-history-practice','用独立调用记录核对重放')+p(
 '程序把事件历史与活动调用次数存到两个SQLite文件，真实子进程分别在两个窗口退出。先看Runner.activity如何匹配历史，再看读取之后append(completed)的位置，最后对照after_crash与after_gap_resume。')+c3[0]+labLinks(before[2])+
 fold('完整workflow_history.py与本地解释器的范围',c3[1]+p(
 '解释器保存了args，但匹配旧命令时只核对id/name/order，不比较参数语义。活动只有文件读取和文本生成。它用于观察结果提交窗口，不是Temporal SDK，也不能据此判定任意工作流升级相容。'))+sourceLinks(before[2]);

 a.sections[3][1]=p(
 '多步骤恢复遇到外部写入时，回到工具恢复章的两本账：工作流保存待发布意图，接收方保存实际报告和回执。先持久固定操作身份及内容，再调用接收方；接收方将效果与回执一起提交，工作流取得结果后保存本地确认。',
 '以42报告为例，report-A:publish标识本次发布，草稿摘要绑定具体正文。工作流确认之前进程退出，新进程沿原身份查询或重试，接收方返回同一结果。换用新身份会表达另一笔动作；在可重入节点内部临时生成身份，容易把一次业务目标变成两份效果。')+
 table(['观察位置','保存什么','收到响应前退出后查什么'],[
  ['工作流记录','原操作身份、目标及意图','找回同一份待执行或待确认工作'],
  ['效果接收方','参数身份、实际写入及回执','确认原操作是否已经提交'],
  ['恢复后的工作流','核对后的结果与后续状态','结果相符后继续下一步']
 ])+
 fold('独立最小例：op-001的两本账',p(
 '下图来自agent_lab.py，操作op-001只把工具库计数加一，与42报告的发布是两个夹具。提交后退出23时，运行器仍RUNNING、尝试1，工具效果已为1；沿原键恢复后为SUCCEEDED、尝试2、效果仍1。图中历史编号9.2对应现已归入G4的恢复内容。')+f4[0])+
 '<p><a class="inline-link" href="#/article/agent-recovery">运行两本账的提交后退出实验 →</a></p>'+
  h('langgraph-workflow-objects','把持久等待映射到LangGraph')+p(
 'LangGraph用有状态图组织程序：state是这次任务的数据，node是接收状态并返回更新的函数，edge规定推进关系。checkpointer负责保存检查点；本例SqliteSaver写文件，thread_id=report-A定位这条执行，与操作系统线程编号无关。',
 '42草稿进入approval_publish节点后先向独立接收方暂存，再调用interrupt保存待批准对象并暂停。旧进程退出，新进程打开同一个检查点文件，以同一thread_id传Command(resume=批准)。批准值成为interrupt的返回值，节点核对草稿摘要后才发布。')+c8[0]+f8[2]+
 h('langgraph-workflow-wait','并行分支的更新与汇合')+p(
 '草稿生成后，金额和来源检查可以独立执行。reducer是状态字段的更新合并函数：checks用operator.add连接["total"]与["sources"]。分支只返回新增项；add_edge的起点列表要求两路完成后才进入审批。')+c8[1]+
 fold('实际并行和失败分支恢复',p(
 '程序用两个实际执行器线程的同步点核对两路确有重叠。来源检查先抛异常时，金额检查的成功更新被保存为pending writes；新进程invoke(None)补做来源检查。记录中金额检查1次、来源检查2次，两项各合并1份。显式异常后的分支恢复与下文中断节点重入，恢复粒度不同。'))+
 h('langgraph-workflow-reentry','节点重入与外部效果去重')+p(
 '本例中断恢复从approval_publish节点开头重入，再执行一次暂存。暂停前的stage_receipt只是局部变量，尚未作为节点更新返回；接收方的暂存却已经提交。正常分支提前固定report-A:stage，两次暂存尝试对应一份效果；故意在节点内新建UUID的分支产生两份暂存，独立验收拒绝。')+c8[2]+f8[3]+p(
 'durability="sync"控制框架检查点的写入时点，接收方仍有自己的事务域。两份持久记录各自保存什么、恢复重走哪段代码，要同时放进执行顺序核对。')+sourceLinks(before[7]);

 a.sections[4][1]=p(
 '前面只安排一个执行者。现在让A暂停但仍活着，B来继续工作；两者都可能发出写请求。租约是一份有期限的工作权约定，控制库保存当前持有者、代际和期限。代际epoch是在此资源上递增的所有权编号；接收方保存当前接受的代际，按它拒绝旧执行者的新写入，这个机制称为fencing，即旧写隔离。',
 '正常接管分两次提交：B先在控制库获得代际2，再把2安装到效果接收方；接收方确认后，B使用2推进新工作。A的进程可以继续存在，但它携带1的新动作会被接收方拒绝。工作权记录改变和实际写入口生效分别有自己的时点。')+
 table(['阶段','控制库代际','接收方代际','新动作的判定'],[
  ['A正常运行','1','1','A携带1可提交'],
  ['B已取得新租约','2','1','安装尚未生效，接收方仍按1判定'],
  ['B完成接收方安装','2','2','A的1被拒，B的2可提交'],
  ['C再取得并安装3','3','3','只有3具备当前新写资格']
 ])+p(
 'worker_fencing.py用reserve_lease更新控制库，用arm_receiver更新另一个数据库中的fence，再返回是否已安装该代际。返回True称为armed；程序没有在控制库另外保存armed字段。若接收方已是3，迟到的安装2会返回False，且不把3降回2。')+
 fold('安装空窗与真实服务的协议边界',p(
 '控制库已是2、接收方仍为1的空窗中，旧A可能提交一笔全新动作。实验用独立数据库真实观察到这件事，再安装2确认后续旧写被拒。两个库之间没有原子事务；生产设计还要明确可信代际来源、安装确认和失败恢复，不能允许客户端自行填一个更大的整数取得权限。'));

 a.sections[5][1]=p(
 '旧写隔离判断“这个执行者当前还能不能新写”，业务去重判断“这个逻辑动作是否已经提交”。接收方把两项判断放进同一个受保护的提交边界：先核对当前代际，再查操作身份与内容，最后提交新效果和回执。任一判断到实际写入之间都不能再插入未经保护的交错。')+
 table(['接收方收到什么','代际判断','操作判断与结果'],[
  ['B/代际2，fresh-from-B，值7','2等于当前2','首次操作提交，保存7及回执'],
  ['B/代际2，相同键和值7','仍为当前持有者','返回duplicate，不增加效果'],
  ['B/代际2，相同键改值8','代际有效','内容冲突，不替换原结果'],
  ['A/代际1，全新键和值99','1已过期','stale_epoch，即使键从未使用也拒绝']
 ])+p(
 '去重只看旧操作，拦不住A换一个全新键；代际只看写资格，拦不住当前B因响应丢失而重复执行同一笔动作。新持有者查询旧操作时，使用自己当前有效的代际和原业务键，既承接结果，又不重新开放旧执行者的写资格。',
 '本地invoke在SQLite BEGIN IMMEDIATE之后读取fence，随后查操作记录并写入效果；代际安装同样是写事务，两者由数据库串行化。函数只检查固定租户与工具白名单，真实身份认证和代际发放不由这个夹具实现。第9节保留完整程序，便于定位每个判断的实际提交位置。');

 a.sections[6][1]=p(
 '执行者仍活着、执行者已退出、接收方已提交，是三种不同观察。先让A进程停在同步点，确认它仍存活；B安装2并提交7后，再释放A，让它用全新键写99。接着用另一个子进程提交11后退出，C安装3并沿原键接回11。')+
 table(['可重做的观察','实际结果','它对应的机制'],[
  ['暂停A → B接管 → A恢复','A返回stale_epoch；B提交7','拒绝活着的旧写者'],
  ['提交11 → 进程退出23 → C接管','C以当前3和原键得到duplicate/11','认回已发生的业务效果'],
  ['C以新键提交13','新增13，正式实验总数11+7+13=31','新持有者仍可推进合法新工作'],
  ['独立空窗对照：控制2、接收方1','A安装前能写，安装后不能写','隔离从接收方安装生效起成立']
 ])+p(
 '前三行属于正式实验的三份效果；空窗对照另用数据库，不把其写入混入31。程序同时独立检查效果集合、回执和参数冲突，因此“返回了拒绝”还必须对应业务库确实没有新增旧写。租约时钟采用明确注入的逻辑整数，进程暂停、退出和SQLite提交实际发生。');

 a.sections[7][1]=h('subsection-8-mctg3k','推进、重规划与持久等待')+p(
 '回到42报告。执行器先读取已确认事实：输入齐全就继续；原计划缺少补录读取时，进入NEEDS_REPLAN，等待接纳包含read_extra的新计划；只缺批准时，进入WAITING_APPROVAL，保存等待条件后让进程退出。RUNNING允许推进，DONE及STOPPED_*是本例的终止状态。')+f8[0]+p(
 '本地动态夹具初始有3次提议预算，有效提议一次后剩2次。它把当前观察和候选步骤共同计算签名；同样的无效提议即使换了理由文本，连续两次仍无进展，进入STOPPED_NO_PROGRESS。来源升版时，本例保守地要求重新接纳计划；实际系统可以设计其他明确的失效策略。')+
 h('subsection-8-19qsp4l','批准绑定当前草稿')+p(
 '输入摘要input_digest标识参与计算的来源清单；草稿摘要draft_digest标识准备发布的正文。批准输入同时绑定任务、报告目标、计划版本、这两份摘要和决定，消费前重新比较当前值。消息标识去重回答“是否收过”，内容匹配回答“现在是否适用”。',
 '例如旧计划生成37草稿并获批，之后orders-A变成v4、加入补录5。新计划得到42，旧批准仍留在历史；重复投递可以答复“收过”，但applies_current=false，必须等新批准。本地early_signal场景是在DRAFT_READY后、WAITING_APPROVAL前收信号；它没有实现接收任意尚未生成草稿的批准。')+f8[1]+
 h('subsection-8-1hxbx9c','整项任务的次数与时间预算')+p(
 '次数限制约束一项任务发起多少次尝试；截止时间约束累计经过时长。60秒预算已花24秒调用、8秒核对、5秒退避，还剩23秒；预留3秒保存最终记录，下一次调用最多占20秒。剩余期限随执行递减，等待与清理也计算在约定边界内。')+
 h('subsection-8-1ugi1r3','取消后的执行与效果确认')+p(
 '取消先保存停止意图、阻止新增工作，再处理在途调用与受管资源。发布已提交时，继续沿原操作身份确认效果；需要撤回则另行授权和执行补偿。执行者停止、操作已提交、用户已收到结果分别保存状态。<a href="#/article/agent-recovery">回看取消、提交竞争与真实进程实验 →</a>');

 a.sections[8][1]=h('agent-planning-run','从来源到42报告的完整状态机')+p(
 'planning_lab.py只使用Python标准库，推进、提议、批准分别由新子进程执行。先预测固定路径和动态路径都应交付42，再运行并观察plans、facts、runtime、signals、reports。每个结果都能回到第2节介绍的记录对象。')+c9[0]+
 table(['场景','可核对的实际结果'],[
  ['adaptive / fixed','动态计划2、预算3→2；固定计划1；两者各交付一份42报告'],
  ['changed_input','旧37草稿失效；旧批准不适用，新42批准到来才提交'],
  ['early_signal','批准在DRAFT_READY后先入库，进入等待时取出已有信号'],
  ['no_progress / budget','分别因无进展、预算用尽停止；报告0份'],
  ['invalid_plan','拒绝错误候选，保留计划1并等待重规划；报告0份']
 ])+
 h('subsection-9-62i94t','从实际产物发现错误完成')+p(
 'wrong_cache_key只按sum查旧事实。输入更新、计划2、补录读取、批准及DONE都可形成，报告却仍为37；独立验收从权威来源重算42后拒绝。corrupt_artifact保留42，只改实际报告中的来源摘要，验收同样拒绝。总数与来源关系都属于本任务的完成条件。',
 '正确路径完成后再次恢复，原事件、事实、信号、报告快照保持不变。本程序把来源验证、报告写入、批准消费与DONE放进一个SQLite事务；远端提交则继续使用第4节的两本账协议。')+fold('完整planning_lab.py',c9[1])+
 fold('执行者接管实验：worker_fencing.py',p(
 '这份独立夹具对应第5—7节：控制库与接收方分开，旧A仍存活，B/C接管，正式效果为7、11、13。按命令运行后逐项核对effect_count=3、effect_sum=31，以及独立空窗对照。')+c9[2]+c9[3])+
 h('langgraph-workflow-run','真实框架、文件检查点与HTTP接收方')+p(
 'workflow_lab.py固定LangGraph 1.2.20与SQLite检查点包3.1.3，按requirements.txt安装。先读ReportState和build_graph，再读worker里的文件、thread_id与Command，最后看独立验收如何重读来源JSON及接收方数据库。')+c9[4]+
 table(['场景','节点与业务结果'],[
  ['stable','审批节点2次；暂存尝试2次、效果1份；批准后发布一份42报告'],
  ['new_id_on_reentry','图结束、报告42，暂存却2份；独立验收拒绝'],
  ['parallel_failure','金额检查1次、来源检查2次；恢复失败分支后通过'],
  ['corrupt_report','实际报告42改41；检查点未变，独立验收拒绝']
 ])+
 fold('完整workflow_lab.py与固定依赖',c9[5]+c9[6])+
 fold('源码、下载包、实际记录与执行范围',labLinks(before[8])+sourceLinks(before[8])+p(
 '几份程序采用不同持久化方式：23练习是本地事件解释器；planning_lab.py是单库状态机；worker_fencing.py验证分库接管；workflow_lab.py实际运行官方图框架及独立HTTP接收方。原记录保留实际环境与源码摘要。没有接入真实模型、审批身份或Kairo，也未验证物理断电、多宿主故障转移。'));

 a.sections[9][1]=p(
 '长任务跨越代码发布时，恢复需要能找到原来使用的定义、状态格式和输入。固定运行ID与旧记录，先验证新代码怎样解释它们，再决定继续旧版本、迁移状态或按框架的版本机制升级。事件重放要求命令相容；检查点恢复还需检查状态字段、节点与中断含义，二者不能共用一个未经核对的升级规则。',
 '记录保留期也沿依赖安排：运行还能恢复多久，来源版本、产物引用、批准记录和接收方回执就要在对应时间内可查询。正文可保存在受控对象存储，历史记录保存明确版本、摘要及受权限保护的引用；恢复时重新取得相应读取资格。')+
 table(['记录或能力','过期后会影响什么','需要的恢复规则'],[
  ['工作流历史/检查点','无法定位已完成步骤或待决工作','按任务保留期管理并验证旧记录可读'],
  ['接收方幂等回执','旧操作可能被识别为新动作','与允许重试期限对齐；过期后停止自动新写并核对'],
  ['来源与产物版本','不能重算或验证当时结果','保留固定版本及校验信息'],
  ['原审批与身份','旧批准未必适用当前内容或权限','恢复时按当前条件匹配与授权']
 ])+p(
 '例如接收方回执保留7天，协调端仍允许30天后重试，就留下23天的判断缺口。延长接收方记录，或在边界外转人工查证，才能定义明确行为；只保留本地DONE不能恢复接收方已经遗忘的事实。')+
 fold('最小代际/回执模型与原输出',p('下列durable-workflows.py只是进程内字典模型，generation=42是代际编号，与42报告总数无关。它说明判断顺序；多进程、持久提交及安装空窗由第9节独立程序验证。')+c10[0]+c10[1]+labLinks(before[9]))+
 p('闭卷画出四组关系：目标与计划、历史与下一步、操作身份与接收方效果、租约与写入口代际。再把同一任务放在保存结果前、等待批准时、接收方提交后和旧执行者恢复时，分别说明从哪份记录取得继续依据。')+
 '<p><a class="inline-link" href="#/article/agent-retrieval">检索章继续处理报告依据的来源与交付 →</a></p>';

 a.updated='2026.11.08';a.desc='从一份42报告出发，讲清步骤怎样保存、进程退出后如何继续，以及谁有权提交结果。';a.intro=a.desc;
 const old=before.join(''),now=a.sections.map(s=>s[1]).join('');
 const earlier=before.flatMap(pres),later=a.sections.flatMap(s=>pres(s[1]));
 if(earlier.length!==later.length||earlier.some((x,i)=>x!==later[i]))throw Error('Workflow reading changed old source bytes/order');
 const ef=before.flatMap(figures).sort(),lf=a.sections.flatMap(s=>figures(s[1])).sort();
 if(ef.length!==lf.length||ef.some((x,i)=>x!==lf[i]))throw Error('Workflow reading changed original figures');
 for(const[,id]of old.matchAll(/\bid="([^"]+)"/g))if(!now.includes('id="'+id+'"'))throw Error('Workflow reading lost anchor '+id);
 const urls=new Set([...now.matchAll(/\bhref="([^"]+)"/g)].map(m=>m[1]));
 for(const[,url]of old.matchAll(/\bhref="([^"]+)"/g))if(!urls.has(url))throw Error('Workflow reading lost URL '+url);
})();
