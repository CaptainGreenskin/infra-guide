/* Causal traces explain attempts; business ledgers and full-cohort metrics prove outcomes. */
const observationObjects=infraReadableHTML(
 '<div class="mechanism-core" id="agent-observation-signals">'+knowledgeSubhead('指标看总体，日志看事件，追踪看路径，账本确认业务结果')+
 para('Agent观测要回答四件事：任务卡在哪、哪次动作失败、实际产生了什么效果、为完成目标花了多少资源。指标适合按工具、版本和结果类别看总体；日志保留可检索事件；trace（追踪）把一条因果路径中的操作关联起来。span（跨度）可理解为一次有开始和结束时刻的操作，是trace里的节点。',
 '这三种遥测都可能有采样、导出失败或保留期限。业务任务账本则记录受理身份、目标、当前状态、回执与独立验收。找不到结束span，不证明任务未提交；有一条“成功”日志，也不证明产物正确。先查业务事实，再用轨迹解释路径，才能避免把观测缺口当成业务结果。')+
 table(['信号','适合保存或回答','不单独承担'],[
 ['指标','任务总量、完成比例、时延分布、用量','每一笔业务效果的权威回执'],
 ['日志','某次错误、决策原因、版本和受控引用','完整且永远不丢的任务状态机'],
 ['Trace/span','调用、并行、等待、尝试与父子关系','全部受理任务的无偏统计总体'],
 ['任务与效果账本','唯一任务、稳定操作、提交回执、验收终态','任意细节的耗时和底层执行解释']])+
 para('先定义受理、尝试、完成、拒绝、取消、仍在执行和结果未知的含义，再做看板。一项任务可包含多次模型调用、多个逻辑操作和每个操作的多次HTTP尝试；把所有层都叫“请求成功率”，会让人无法解释分母。')+'</div>');

const observationIdentity=infraReadableHTML(
 knowledgeSubhead('业务身份与追踪身份关联，不能互相替代')+
 table(['身份','本章用途','可能的关系'],[
 ['task_id','用户目标R27','一个任务可跨多次运行或多条trace'],
 ['op_id','一次逻辑写入R27:publish','多次HTTP尝试仍沿用同一个效果身份'],
 ['attempt_id','某个动作的第1、第2次实际尝试','每次尝试独立计数和耗时'],
 ['trace_id','一条被追踪的因果路径','不是业务去重键，也不保证覆盖整个任务寿命'],
 ['span_id / parent_id','本次操作及其父操作','表达调用或安排关系，不能签发权限']])+
 para('HTTP调用通常由客户端创建CLIENT span，把当前上下文注入traceparent头；服务端提取它，再建立SERVER子span。头里包含trace ID、上游span ID及追踪标志，而不是整份任务状态、工具回执或业务授权。接收方仍按真实身份和资源策略决定能否执行，不能因为traceparent格式正确就信任请求。',
 'service.name等资源属性说明哪一个服务产生遥测，span属性描述具体操作。跨进程重试可能开启新trace，仍用task_id和op_id关联原业务；异步消费或共享批处理也可能更适合用span link表达额外因果关系。一条span只有一个父节点，不能为了凑一棵树把共享工作硬塞给错误任务。')+
 code('实际实验的传播核心 · 两端使用不同TracerProvider','PYTHON',
 'headers = {"Content-Type": "application/json"}\npropagator.inject(headers)  # 在CLIENT span上下文内\n# 通过真实HTTP发送headers\nremote = propagator.extract(request_headers)\nwith tool_tracer.start_as_current_span("tool.execute",\n        context=remote, kind=SpanKind.SERVER):\n    execute_authorized_operation()\n# traceparent提供关联；execute仍负责业务授权与提交')+
 para('原始参数、提示和文档全文不适合无差别复制进通用遥测。记录必要版本、错误类别与受控产物引用，再按权限取回原件。任务或用户ID可出现在受控事件或trace中用于关联，指标标签则应保留有限维度；每任务一组标签会随任务数持续增长。'));

const observationEffects=infraReadableHTML(
 '<div class="mechanism-core" id="agent-trace-effect-boundary">'+knowledgeSubhead('五个真实跨度，如何解释“任务成功但首次调用报错”')+
 figure('v24-otel-attempt-tree','实际SDK导出根任务、两个CLIENT和两个SERVER跨度。树表达父子关系，不表示耗时比例；第一次服务端提交后注入503，第二次查到原回执。')+
 para('本章实验用两个线程扮演执行器和工具服务，各用不同TracerProvider及service.name，通过真正的回环HTTP传traceparent。工具先将R27:publish与总数37写入SQLite，再故意返回503。调用方当时只能记“结果未知”；第二次沿原op_id请求，工具返回原回执duplicate=true。最后独立读取报告，确认只有一笔效果且总数37，根任务才设为OK。',
 '首次CLIENT与SERVER跨度仍保留ERROR；后续重试成功不应抹掉这个错误，也不应创建第二个业务成功任务。反过来，第一条服务端错误span不意味着事务回滚——程序明确在注入错误之前提交了效果。trace事件可以写“effect_committed”，真正的业务证明仍来自数据库或效果接收方回执。')+
 table(['本次观察','正确解释','容易误判'],[
 ['首次HTTP 503，SERVER有提交事件','调用方结果未知；服务侧已产生固定效果','503表示业务一定未提交'],
 ['第二次HTTP 200且duplicate=true','同一动作原回执被找回','第二个动作又成功执行一次'],
 ['根任务OK，首次CLIENT为ERROR','任务经恢复/确认合格，保留中途失败','任务成功就把失败span全部改成OK'],
 ['成功HTTP跨度状态UNSET','SDK未显式设置错误；按本例正常回应处理','UNSET是业务账本里的结果未知']])+
 para('OpenTelemetry span的UNSET、OK、ERROR，与任务状态机的RUNNING、UNKNOWN、SUCCEEDED不是同一套枚举。字段含义应由各自层解释。当前程序只在内存导出span与指标，没有部署Collector或远端后端，不能把这次成功写成跨主机采集、丢失重传和长期保留都已验证。')+'</div>');

const observationTime=infraReadableHTML(
 knowledgeSubhead('父跨度包含子操作，并行分支也不能直接累加')+
 para('另构造一条同一时钟下的教学时间线，单位ms，不是上面HTTP实验实测：身份0—50；两项证据查询同时开始，A在350结束，B在450结束；装配450—480；模型480—780；发布尝试780—850；等待850—880；重试880—940；验收940—1000。用户总等待1000ms，某个组件300ms不能解释其余700ms在哪里。')+
 table(['阶段','区间ms','持续时间ms'],[
 ['身份','0—50','50'],['查询A / 查询B','50—350 / 50—450','300 / 400，并行'],
 ['装配 / 模型','450—480 / 480—780','30 / 300'],
 ['首次发布 / 等待 / 重试','780—850 / 850—880 / 880—940','70 / 30 / 60'],
 ['产物验收','940—1000','60']])+
 knowledgeFormula('本题等待两份证据后才能继续','50 + max(300,400) + 30 + 300 + 70 + 30 + 60 + 60 = 1000ms','直接逐子阶段相加为1300ms，多算了并行重叠的300ms；再加父跨度会重复更多。')+
 para('将较快查询A从300优化到200，其他条件不变，仍需等B到450，总时间可能不变；把B从400降300，才让后续提前100ms。这是固定依赖图的反事实推导，不是说任何并行任务都只能取max，还要看它究竟等待哪些结果、是否有流式处理或其他依赖。',
 '跨主机墙钟有偏差，先用本地持续时间和上下文关联，再核对跨边界的排队定义。实验导出同机Unix纳秒起止时间，并以字符串保存避免大整数精度丢失；它不证明跨主机时钟已校准。用户响应、后台完成和资源回收也可能是三个时刻，应分别记录。'));

const observationPopulation=infraReadableHTML(
 knowledgeSubhead('一个任务重试两轮，任务成功率和尝试成功率有不同分母')+
 para('固定一批100个已到终态的任务：80个首轮合格，20个首轮未完成；其中10个再试一轮后合格，另10个仍失败。唯一合格任务90，按任务是90/100=90%。这里每一轮都明确视为一次“任务尝试”，共120次，获得合格完成结果的尝试90次，比例90/120=75%。若分析某个工具的HTTP尝试，还应再单独定义，不能把这120次直接当作工具请求总量。',
 '后来确认某个动作其实已提交，应把效果归回原op_id，同时保留首次尝试超时的历史。业务成功、观察到成功回应、以及没有重复效果，是三项不同判断。窗口结束时仍在执行或结果未知的任务也要单列；不要因为没有产物文件就把它们从受理分母删掉。')+
 table(['看板量','应该怎么得来','错误做法'],[
 ['受理任务数','稳定身份去重后的受理记录','用trace条数或结果文件数代替'],
 ['合格完成量','按固定目标及独立验收确认','只看模型输出success'],
 ['工具尝试量','含失败、重试及未知的实际尝试','只数HTTP 2xx'],
 ['业务效果量','效果接收方或权威回执','把每次调用都算新效果'],
 ['时延分布','说明受理到何种终点及未完成项','只保留有成功产物的快任务']])+
 para('指标标签用于有限分组，例如工具名、错误类别和部署版本。任务ID、原操作ID和任意用户输入会产生高基数：每新增任务都可能新增一条或多条序列，既增加成本，也不适合总体比较。保留关联能力的方式是受控日志与trace检索，不是把所有业务字段都塞进指标标签。'));

const observationCost=infraReadableHTML(
 knowledgeSubhead('成本先收全，再分别按受理和合格任务计算')+
 para('仍用上面100个任务，以下全是教学成本点：80个首轮合格各2点，10个重试合格各5点，10个最终失败各4点。总成本80×2+10×5+10×4=250。每个受理任务2.5点；为了交付一个合格任务承担的总成本是250/90≈2.78点。若只取成功任务自身的账单，就成210/90≈2.33点，失败的40点被漏掉。')+
 '<details class="full-code"><summary>展开100任务的完整账本算例</summary>'+code('agent-observability.py · 标准库','PYTHON',
 'from fractions import Fraction\n# 每行：任务数，最终是否成功，每任务尝试，每任务成本。\ngroups = [(80, True, 1, 2), (10, True, 2, 5), (10, False, 2, 4)]\ntasks = sum(n for n, *_ in groups)\nwins = sum(n for n, ok, _, _ in groups if ok)\nattempts = sum(n*a for n, _, a, _ in groups)\ntotal = sum(n*c for n, _, _, c in groups)\nassert (tasks, wins, attempts, total) == (100, 90, 120, 250)\nassert Fraction(wins, tasks) == Fraction(9, 10)\nassert Fraction(wins, attempts) == Fraction(3, 4)\nassert Fraction(total, wins) == Fraction(25, 9)\nprint(tasks, wins, attempts, total)')+'</details>'+
 '<p><a href="labs/agent-foundations/agent-observability.py" download>下载100任务账本算例 ↓</a><a href="labs/textbooks/validation.json" target="_blank" rel="noopener">查看该算例执行记录 ↗</a></p>'+
 figure('v24-observability-ledgers','另一个单任务实际SDK夹具：两次HTTP尝试各计2个教学点，验收1点，共5点。计数来自真实执行，单价是固定题设，不是实际模型或云账单。')+
 para('“重试合格的10个任务总共花50点”仍不能推出第二次尝试本身花了多少，因为这些是任务级总成本。要计算重试边际成本，需attempt级计量，再汇总到同一任务。共享查询、批处理、缓存、沙箱和后台工作也要说明分摊规则，同时保留未分摊总量，不能为了归因方便漏掉成本。',
 '换成真实计费时记录价格版本、计量单位、输入/输出或缓存用量、工具计算、存储和网络，并按允许的访问范围保存证据。没有真实账单时就使用明确的教学单位。比较版本还要固定任务集、截止时间和质量门槛；让难题全部早退，可能让成功样本均值变好看，却降低实际完成量。'));

const observationSampling=infraReadableHTML(
 knowledgeSubhead('采样轨迹擅长找原因，不能直接冒充全量总体')+
 para('固定总体1000任务，900合格、100失败。若合格只保留10%，得到90条；失败全保留100条，样本共190，直接计算90/190≈47.37%，与总体90%差很远。这种错误优先采样有助于诊断，却改变了人群。已知并适用的入样概率可以用于加权估计，但还要检查各类是否都有非零入样机会、规则是否稳定，以及采集前就丢掉的事件能否找回。',
 '业务成功率优先来自覆盖受理总体的账本或可靠计数。trace负责解释慢路径、工具拒绝、恢复和检索缺口。尾部采样可能偏向慢或错误轨迹，跨版本比较时先固定任务、版本与成熟观察窗，再用相应切片中的轨迹解释变化；缺少入样概率就不从那张轨迹表宣称全站比例。',
 '诊断也从实际产物倒推：资料是否存在且有权访问、候选是否命中、装配是否保留关键限定、模型是否据此生成、发布是否采用对应正文版本。若候选已有正确资料而最终上下文没有，先验证排序、截断和预算；固定证据后再比较生成，才能区分替代原因。扩大重试使完成率上升，也要同时看预算、尾延迟和重复效果，不能自动归因于模型更强。')+
 linkTo('agent-evaluation','复习固定任务集、独立评分和正确拒绝')+
 linkTo('agent-retrieval','沿候选、上下文与最终引用逐阶段取证'));

const observationPractice=infraReadableHTML(
 knowledgeSubhead('完整实战：两个SDK服务身份、五个span和真实HTTP')+sctLab('otel_attempts.py')+
 '<details class="full-code"><summary>展开本次固定的OpenTelemetry依赖</summary>'+code('requirements-otel.txt','TEXT',scalingCollectiveTraceFiles['requirements-otel.txt'])+'</details>'+
 '<p><a href="labs/scaling-collectives-traces/requirements-otel.txt" download>下载requirements-otel.txt ↓</a></p>'+
 para('先预测：第一次503后是否有业务效果？第二次请求是不是新动作？根任务成功后要不要删掉错误span？运行后检查5个span的trace_id、parent_id、service和parent_remote；两个SERVER的父ID应分别等于对应CLIENT span_id。随机ID与耗时每次变化，父子关系、2次尝试和1次效果应保持。',
 '程序在一个主机进程的两个线程内运行两端，分别创建runner和tool的TracerProvider，共享内存导出器只为核对关系；指标由同一测试夹具汇集。它没有测试真实两机部署、Collector、导出重传、存储保留、真实身份服务或Kairo。接生产前逐段验证这些链路，再检验丢失遥测与业务账本怎样对账。',
 '变化题一：不传traceparent，工具端可能产生新的根上下文，怎样仍关联原业务？依靠可信记录中的task_id、op_id及调用关系，同时修复传播，不能把业务键改成偶然生成的trace ID。变化题二：两次HTTP都成功却有两笔效果，计数器绿色能证明幂等吗？不能，应查实际效果与稳定操作身份。变化题三：没有成功任务时，总成本除以成功数该报0吗？不应；单列总成本和零完成，单位成功成本未定义。')+
 linkTo('agent-sandbox','继续把执行环境、后台进程和回收纳入验证'));

{
 const a=articles.find(a=>a.id==='agent-observability');
 a.sections=[
  ['观测职责：指标、日志、追踪与业务账本',observationObjects],
  ['身份与传播：task、op、trace和span',observationIdentity],
  ['错误与效果：五个span怎样解释一次恢复',observationEffects],
  ['时间与因果：并行、等待及关键路径',observationTime],
  ['总体口径：任务、尝试、效果与未完成项',observationPopulation],
  ['成本账本：全量成本、分摊与合格分母',observationCost],
  ['采样与诊断：先确认总体，再解释路径',observationSampling],
  ['实战与变化题：真实SDK、HTTP与输出关系',observationPractice]
 ];
 a.refs=nitRefs([...a.refs,'v24OTel','v24Propagation','v16Trace']);a.minutes=55;a.updated='2026.11.04';
}
infraDomain('agent').points.find(p=>p.id==='ag-observability').body=observationObjects+observationIdentity+observationEffects+observationTime+observationPopulation+observationCost+observationSampling;
infraDomain('agent').refs=nitRefs([...infraDomain('agent').refs,'v24OTel','v24Propagation','v16Trace']);
const observationCasesBeforeSCT=infraFieldCases.agent;
infraFieldCases.agent=()=>'<h3>两次调用一笔效果：用实际SDK核对追踪关系</h3>'+sctLab('otel_attempts.py',false)+linkTo('agent-observability','阅读身份、时间、总体和成本的完整机制')+observationCasesBeforeSCT();

