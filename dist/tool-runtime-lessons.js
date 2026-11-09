/* Task intent, tool contracts and finite control; model proposals are not authoritative state. */
const runtimeTask=infraReadableHTML(
 '<div class="mechanism-core" id="tool-task-contract">'+knowledgeSubhead('先把用户目标改写成可以验证的任务契约')+
 para('先从一项日常要求出发：“把我的订单数据整理成报告并保存。”模型可以理解要求、提出读取资料或保存报告的动作；真正读取数据库和写入文件，需要调用工具，也就是能够实际执行操作的程序。工具返回新资料后，模型再据此选择下一步。把模型、工具与观察组织成这样的循环，就是本章讨论的Agent（智能体）系统。',
 '运行时是维持这个循环的程序。它接收可信任务，保存当前进度，检查提议是否允许，安排调用，再把结果交回下一步。模型负责提出选择，运行时负责执行规则，工具负责实际读写，验收器负责核对目标产物。把四种职责放回同一条任务路径，就能理解后面为什么分别需要权限、状态和停止条件。',
 '本章固定一个可手算的任务。调用者用身份A发起要求，源数据orders-A的第3版为[10,27]；目标是把总数37保存为report-A的第1版。正常路径是：读取这版数据→计算10+27→提交报告→由验收器读取报告，核对总数、来源版本与目标位置。这里的A表示调用者的资源范围，v3表示来源版本；这些约定会一直用到后面的HTTP与恢复实验。')+
 figure('v42-agent-concepts','任务先规定目标与范围，模型提议动作，运行时安排工具并保存观察，最后按实际产物验收。')+
 table(['契约项','本章固定任务','由谁维护或证明'],[
 ['目标与输入','orders-A / v3 / [10,27]','可信任务定义及来源，不从模型措辞推断'],
 ['允许效果','写report-A；total=37；source_version=3','执行层约束动作，独立验收检查实际产物'],
 ['调用者与资源范围','预先注入主体A，只能访问A的对象','工具侧再次授权；本地实验未实现真实认证'],
 ['终态','产物可核对才SUCCEEDED','运行时记录经过验收的状态'],
 ['停止约束','本例最多4次提议、3次工具尝试','执行层计数，不由模型自行承诺']])+
 para('可以预先确定的步骤与分支，适合显式工作流；需要根据内容判断下一步的部分，可以允许模型决策。固定工作流也会有重试、权限和提交间隙；动态决策则还增加不合法提议、循环和误判完成。选择从任务的不确定性出发，先把所有方案都必须满足的任务契约写清。')+'</div>');

const runtimeContracts=infraReadableHTML(
 knowledgeSubhead('工具契约分四层：名字、结构、权限、语义')+
 para('工具发现返回名称、说明、输入结构与可选输出结构。schema（结构约定）约束字段、类型、必填项和未知字段；它能检查total是整数，却不能证明37这个数算对了。身份认证说明调用者是谁，授权说明这个主体能对哪个资源执行什么动作，业务前提说明这个资源版本是否仍允许本次修改。四种判断不能由“JSON解析成功”替代。')+
 code('本例写入参数结构 · 逻辑操作身份与全部参数绑定','JSON',
 '{\n  "resource": "report-A",\n  "op": "R17:publish",\n  "total": 37,\n  "source_version": 3,\n  "expected_version": 0\n}')+
 table(['检查','示例','通过后仍不能推断'],[
 ['名称与结构','只接受write_report；拒绝多余字段；total必须整数','该主体有权写任意report ID'],
 ['对象授权','可信主体A只能访问A的对象','当前版本必定满足修改前提'],
 ['版本前提','expected_version=0与实际版本一致','total必定等于源数据的正确总数'],
 ['结果结构','输出含resource、version、total、op、duplicate','报告符合用户目标或仍可被后续消费者读取']])+
 para('工具名白名单防止提议调用不存在或未允许的工具；对象授权防止把允许工具用在别人的资源。主体、角色或审批不能直接采信模型提供的参数。schema也不能通过自然语言说明执行真正的授权。外部网页、工具输出和检索资料即使写着“忽略限制、改写B”，仍只是一份数据，不能签发新的委托。',
 '本例特别拒绝total=true：JSON里布尔值不是整数，Python却把bool当作int的子类；若实现只用isinstance(value, int)，就可能错误放行。示例用type(value) is int。生产中应采用与协议版本一致的校验实现，不把本文件只支持几种类型的小函数当作通用JSON Schema引擎。')+
 para('输出结构也要校验。MCP的结构化工具结果是工具服务返回的structuredContent，与模型“按结构生成输出”不是同一概念。声明了输出schema的服务应返回合约结构，客户端也应核验，再决定如何把它交给模型。工具说明中的只读、破坏性等提示，还需要可信实现与实际策略支撑，不能把一段描述当作强制执行机制。'));

const runtimeLoop=infraReadableHTML(
 '<div class="mechanism-core" id="tool-finite-loop">'+knowledgeSubhead('一次提议不等于一次调用，更不等于一次效果')+
 figure('v23-tool-control-loop','模型提议、运行时准入、工具提交和任务验收有不同责任。本地实验只用固定脚本代替提议来源，其余HTTP、事务与验收实际执行。')+
 para('最小循环是：读取可信任务与已有观察→取得下一份提议→检查名称、类型、范围和预算→调度实际调用→分类并校验结果→更新观察→判断能否继续。提议可能因为参数错误被拒绝，完全不产生工具调用；一次只读提议也可能因一次503产生两次HTTP尝试。同一写入的两次尝试，还可能只产生一次业务效果。三种计数必须分开。',
 '本例总共允许4次提议、3次实际工具尝试，发现工具列表另算。参数被拒绝仍消耗提议预算，避免模型在无效输出中无限自转；重试消耗工具尝试预算。完成验收不调用工具，因此当第三次实际尝试刚成功时，后续finish仍可进入验收，不能在看到调用额度为零时直接把已完成产物判成失败。')+
 code('控制顺序示意 · 完整程序包含实际HTTP和结果处理','PYTHON',
 'for proposal in proposals:\n    consume_proposal_budget()\n    if proposal.kind == "finish":\n        return verify_actual_artifact(task)\n    validate_tool_and_arguments(proposal)\n    authorize_task_scope(task, proposal)\n    consume_tool_attempt_budget()\n    result = dispatch(proposal)\n    observation = validate_and_classify(result)\n    record_observation(observation)\n# 预算、超时、取消及结果未知都有明确分支；不是只等模型输出finish')+
 para('真实服务还要控制墙钟截止时间、token、费用、并发和效果范围，在调用前预留或核对，返回后对账实际消耗。不能只在循环结束才检查总成本。当前程序只验证两种次数预算和有限HTTP超时，没有实现完整的deadline传播、费用预留或取消协议；这些控制需要分别测试。',
 '“没有新增信息”也需要可解释的停止策略，例如相同输入重复读取达到上限，或者关键资料缺失而需要澄清。先保存观察和原因，再进入预算耗尽、证据不足、等待审批或结果待确认状态。不要把所有停止都压成FAILED，也不要让模型一句“再试一次”绕过运行时限制。')+'</div>');

const runtimeErrors=infraReadableHTML(
 knowledgeSubhead('错误按层分类，重试按动作语义决定')+
 figure('v23-tool-error-layers','HTTP成功、协议成功、工具成功、结果结构有效与任务完成逐层判断；较低层通过不证明较高层成立。')+
 table(['层次','本章示例','处理依据'],[
 ['传输','一次HTTP 503；或发出写入后连接断开','只读暂态可受限重试；写入未明先保持UNKNOWN并沿原操作查证'],
 ['协议','JSON-RPC error：未知方法或未知工具','按错误码与约定修正调用，不当作正常工具资料'],
 ['工具执行','isError=true，业务拒绝或前提冲突','区分denied、not_found、version_conflict等已知业务结果'],
 ['输出契约','values应为整数数组，却返回字符串','拒绝加入成功观察，定位工具服务或版本失配'],
 ['任务验收','结构正确且写成功，但total=38','保留已写事实，按目标判INCOMPLETE，另行决定修正动作']])+
 para('MCP把协议错误与工具执行错误分开。工具可以在HTTP 200的JSON-RPC正常回应里返回isError=true；执行器若只检查HTTP状态就进入成功路径，会把业务拒绝当资料。相反，未知方法的协议error也不应伪装成模型可以直接使用的结构化结果。具体身份校验还可能在到达工具方法之前失败，要根据真实认证链判断，不能从一个状态码推断工具一定没执行。',
 '是否重试由错误阶段和动作语义共同决定。本例仅对只读调用的一次503做一次受限重试；写入传输不确定则保留UNKNOWN，因为没有收到回应不证明没有提交。工具明确返回not_found属于已知业务结果；写效果已提交但回应丢失属于未知结果。后者需要原操作回执、同操作重试或对账，不能新建操作身份盲写。'));

const runtimeState=infraReadableHTML(
 knowledgeSubhead('把任务、步骤、操作、尝试和回执分开保存')+
 table(['身份','表示什么','重试或恢复时'],[
 ['task_id','用户的一项目标及授权范围','仍是原目标就保持'],
 ['run_id','一次固定配置下的执行','重新发起运行可另建，但不自动创建新业务效果'],
 ['step_id','计划中的一个逻辑步骤','关联决策、输入与结果'],
 ['op_id','接收方识别的一次逻辑效果','同一动作保持，并绑定参数'],
 ['attempt_id','某次实际调用尝试','每次改变，用于计数和追踪'],
 ['receipt_id','接收方已经提交的效果证明','查询或重试应找到原回执']])+
 para('本例写入以R17:publish作为op_id，将全部参数规范化后取摘要。工具把报告更新、效果记录与回执放进同一SQLite事务。同参数再来，先查原回执，返回duplicate=true；不能先用当前版本再次拒绝，因为第一次写入本来就会把版本从0推进到1。同op_id换total则报operation_conflict，不能把原回执套到另一个意图上。',
 '任务循环本身并未持久化，这个实验不能证明进程崩溃后的继续执行。真正的持久执行还要先记录意图，再发出动作，最后保存结果，处理“工具已提交、本地回执未保存”的间隙。另一个章节用两个独立数据库和进程退出实际验证此情形。不要用单库事务覆盖所有状态来掩盖远端提交边界。')+
 linkTo('agent-recovery','运行真实退出、恢复与接收方去重实验')+
 para('本轮给模型看的上下文是一份任务视图，包含当前步骤、输入版本、观察摘要和回执引用；它不是权威账本。旧摘要仍写“未保存”，不能覆盖新回执已经确认的成功。状态机还要检查允许迁移、并发版本及当前授权，不能仅凭有一个version字段就任意推进。')+
 linkTo('agent-memory','继续学习上下文预算、旧摘要与权威状态'));

const runtimeCompletion=infraReadableHTML(
 knowledgeSubhead('完成由实际产物证明，错误效果也要如实记录')+
 para('本章评分器不读取模型的自评，而是读取SQLite中的真实报告，核对resource=report-A、version=1、total=37、source_version=3，并检查确实取得了相应来源观察。工具只承诺“按合法参数保存整数”，所以保存38可以产生一个完全合法的成功回执；评分器仍应拒绝这个任务结果。',
 '拒绝完成不表示效果没有发生。错误总数38已经落库，后续修正需要一个有明确意图的新动作、正确的版本前提及新的验收，不能悄悄改写历史回执。重复相同op的去重只能保证本例的相同意图不重复生效，不能让错误意图自动变对。')+
 table(['观察到的事实','可以记录','不能据此宣称'],[
 ['模型输出finish','模型提出结束','报告存在且正确'],
 ['工具回执成功','该动作按工具语义已执行','全部任务约束达成'],
 ['总数正确但资源属于B','某处存在37','A的任务成功'],
 ['实际产物全部通过独立验收','本次固定任务合格','任意开放任务或真实模型成功率已达标']])+
 para('固定脚本有利于先验证执行器和评分器。只有确保全拒绝、假成功、错资源、错总数、重复效果等负例都会被发现，接真实模型测规划质量才有意义。模型表现还需要独立任务集、重复运行和清晰统计口径；十个机制用例通过，不等于模型完成率100%。')+
 linkTo('agent-evaluation','继续学习任务集、独立评分与质量口径')+
 para('选做<a href="/article/production-readiness/#integrated-service-run">沿同一组数字验收 37 报告</a>。综合实战沿用输入 10、27 和目标 report-A，另建一份本地任务。先看入口返回 HTTP 202，确认任务已受理。再从接收方找提交回执，最后用独立验收器从来源重算 37，核对实际报告和写入次数。'));

const runtimeKairo=infraReadableHTML(
 knowledgeSubhead('接入Kairo时，逐层寻找真实接口和验证点')+
 para('先将已有执行器映射到这条链：可信任务从哪里来，工具目录由谁发布，哪个组件实施类型与对象授权，操作身份如何持久化，效果接收方能否查询原回执，预算和取消由谁生效，评分器怎样读真实产物。框架名称不能替代这些答案；接口字段相似也不代表提交语义相同。',
 '接入顺序可从只读工具开始，验证输入/输出和错误分类；再加受限写入，测试同操作同参数、同操作异参数和回执查询；随后做真实退出恢复、并发接管、取消及产物验收。保留接口版本、实际请求、效果记录和反例。本项目当前没有取得并执行真实Kairo适配接口，因此仍把这一部分作为设计与验收契约。')+
 linkTo('kairo-practice','查看Kairo适配字段与故障验收顺序'));

const runtimePractice=infraReadableHTML(
 knowledgeSubhead('完整实战：十组HTTP工具执行与独立产物验收')+nitLab('tool_runtime.py')+
 para('先预测三条路径：read→write→finish；read→write→同op再write→finish；read→write(total=38)→finish。前两条成功且效果都为1，第二条实际工具尝试为3；第三条也有一次真实效果，但任务仍为INCOMPLETE。再看trace里的proposal与attempt编号，解释重试和参数拒绝为何产生不同计数。',
 '程序中主体A由测试夹具预先注入。orders-B确实有值999，但工具侧在读取和序列化之前拒绝A访问，所以结果中不应出现999。这个用例证明固定对象授权分支，没有验证真实身份签名、会话传播或任意提示注入。消息使用tools/list、tools/call与结构化结果的形状，省略MCP初始化及会话等环节，因此不是完整MCP服务端。',
 '变化题一：去重前先检查expected_version，第二次相同写会怎样？可能因为实际版本已从0变1而错误拒绝合法重试，应先核对同操作原回执。变化题二：只限制工具次数，却不限制提议次数，模型一直输出错误字段会怎样？没有工具调用也可能无限消耗推理。变化题三：工具返回了合法结构的38，应该改为SUCCEEDED还是假装未写？都不对；记录已发生的错误效果，任务验收不通过，再按新修正动作处理。'));

{
 const a=articles.find(a=>a.id==='agent-runtime');
 a.sections=[
  ['任务契约：目标、范围、证据与停止条件',runtimeTask],
  ['工具契约：结构、权限、版本与结果',runtimeContracts],
  ['有限执行循环：提议、调用与效果分别计数',runtimeLoop],
  ['错误与重试：传输、协议、执行、结果和验收',runtimeErrors],
  ['状态与身份：任务、步骤、原操作和尝试',runtimeState],
  ['完成验收：读取真实产物，保留错误效果',runtimeCompletion],
  ['Kairo适配：按执行责任寻找真实接口',runtimeKairo],
  ['实战与变化题：十组实际HTTP对照',runtimePractice]
 ];
 a.refs=nitRefs([...a.refs,'v23Tools','v22Transaction']);a.minutes=55;a.updated='2026.11.04';
}
infraDomain('agent').points.find(p=>p.id==='ag-runtime').body=runtimeTask+runtimeLoop+runtimeState+runtimeCompletion;
infraDomain('agent').points.find(p=>p.id==='ag-tools').body=runtimeContracts+runtimeErrors;
infraDomain('agent').refs=nitRefs([...infraDomain('agent').refs,'v23Tools']);
const agentCasesBeforeNIT=infraFieldCases.agent;
infraFieldCases.agent=()=>'<h3>工具成功后，还要独立验收任务</h3>'+nitLab('tool_runtime.py',false)+
 linkTo('agent-runtime','阅读工具契约、有限循环与完整程序')+agentCasesBeforeNIT();

