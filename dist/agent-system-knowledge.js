Object.assign(sources,{
 v16Temporal:['Temporal · Activity 的重试与幂等','https://docs.temporal.io/activity-definition'],
 v16TemporalHistory:['Temporal · Workflow execution','https://docs.temporal.io/workflow-execution'],
 v16Idempotency:['AWS Builders’ Library · 幂等API','https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/'],
 v16Fence:['Martin Kleppmann · 分布式锁与 fencing','https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html'],
 v16SQL:['SQLite · 事务与写入边界','https://www.sqlite.org/lang_transaction.html'],
 v16MCPTools:['MCP · Tools','https://modelcontextprotocol.io/specification/2025-11-25/server/tools'],
 v16MCPSecurity:['MCP · Security best practices','https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices'],
 v16OWASP:['OWASP · Prompt injection','https://genai.owasp.org/llmrisk/llm01-prompt-injection/'],
 v16Trace:['W3C · Trace Context','https://www.w3.org/TR/trace-context/'],
 v16BEIR:['BEIR · 检索评估代码与数据','https://github.com/beir-cellar/beir'],
 v16Tau:['τ-bench · 环境终态与工具任务评估','https://arxiv.org/abs/2406.12045'],
 v16Sandbox:['gVisor · 安全模型','https://gvisor.dev/docs/architecture_guide/security/']
});
infraKnowledgeDomains.push({module:'agent',track:'agent',refs:['v16MCPTools','v16MCPSecurity','v16Temporal','v16Idempotency','v16Fence','v16SQL','v16BEIR','v16Tau','v16Sandbox','v16Trace'],points:[
 {id:'ag-runtime',title:'运行时：任务、运行、步骤与效果身份',articles:['agent-runtime','kairo-practice'],lead:'智能体（Agent）运行时执行“提出动作→检查权限和参数→安排执行→调用工具→保存回执→验收结果”的循环。模型输出是待解释的提议，执行器管理可信身份、状态、预算和实际动作。',body:
 figure('v16-agent-runtime','模型提出计划，执行器依据可信任务契约调用工具。任务状态、工具效果与评估证据分层保存，通过稳定身份关联。')+
 table(['身份','表示什么','重试时是否改变'],[['task_id','一项用户目标与授权范围','同一任务保持'],['run_id','一次固定配置的运行','重新发起运行可改变'],['step/op_id','一个逻辑动作及其意图','同一动作保持'],['attempt_id','一次执行尝试','每次尝试改变'],['receipt_id','接收方的效果回执','重试应能找回原回执']])+
 para('“任务完成”是业务断言，“工具返回成功”是调用结果，“状态SUCCEEDED”是运行时记录。生成日报时，只有实际报告属于正确租户、包含要求的数据和来源并可读，才满足业务目标。模型说已完成、HTTP 200或某个步骤结束都不能单独替代这些条件。',
 '常见状态路径是PENDING→RUNNING→WAITING_TOOL/WAITING_APPROVAL→RUNNING→SUCCEEDED，也可能进入FAILED、CANCELLED或NEEDS_RECONCILIATION。转换附上输入版本、尝试、原因与回执。取消在执行器里生效之后，已经远端提交的动作仍需要查询或补偿。')},
 {id:'ag-tools',title:'工具契约：类型、前置条件与结果语义',articles:['agent-runtime','agent-security','kairo-practice'],lead:'工具契约至少包含名称/版本、输入参数的结构（schema）、允许主体与资源、deadline、幂等身份、效果范围和可查询结果。结构校验解决参数长什么样，授权判断解决能否执行。',body:
 code('一个逻辑写入意图 · 教学结构，非Kairo现成API','JSON',JSON.stringify({task_id:'task-1',op_id:'report-2026-11-04',tool:'report.write',tool_version:1,resource:'tenant-A/report-7',arguments:{period:'2026-11-04'},deadline:'由可信执行器设置',expected_resource_version:7},null,2))+
 para('流程先解析类型并拒绝未知字段，再把资源引用解析到实际对象；用可信会话和任务委托查询授权，检查deadline与资源前置版本，最后调用工具。tenant、角色和批准状态不能从模型参数直接采信。允许调用report.write也不代表可以写任意report ID。',
 '重试使用稳定op_id及参数摘要；同key同意图返回原回执，同key换参数返回冲突。JSON摘要需规定字段、编码和规范化，避免字段顺序或数字格式变化导致同意图被误判。保留期覆盖最长允许重试/恢复窗口，过期后如何查询既有结果需要契约说明。',
 'MCP统一工具发现和调用的协议结构，业务仍要定义以上权限与提交语义。协议响应中的错误、业务拒绝、可重试暂态失败和结果未知应分开处理；传输断开时不能仅凭没有响应就重新创建一个新逻辑动作。')},
 {id:'ag-planning',title:'计划修订与审批状态',articles:['durable-workflows'],lead:'工作流保存已确认的事实、下一步计划和审批。工具结果暴露缺项时，先修订待做步骤，再核对原批准是否仍适用。',body:
 table(['先确认什么','报告 A 的变化','恢复时从哪里读'],[
  ['工具读到了什么','基础订单合计 37，并返回补录 late-A/v1 的引用','已记录的工具结果与来源版本'],
  ['接下来还缺什么','新版计划先读补录 5，再生成金额 42 的草稿','计划版本和尚未完成的步骤'],
  ['这次批准什么','批准这份草稿、目标和来源版本，才能发布','审批记录和当前待发布意图'],
  ['到底有没有发布','写入后按原任务读接收方回执','结果或回执，不能只看任务状态']
 ])+
 para('模型可以提议读补录，宿主负责核对引用并更新计划。原来已经读到的 37 仍可复用。补录改变了草稿及来源，针对旧草稿的批准不能放行新版。退出前保存到哪一步，决定恢复时先检查审批、继续执行还是查原回执。',
 '从<a href="/article/durable-workflows/#agent-planning-run">固定输入对照</a>读清状态变化，再用<a href="/article/durable-workflows/#native-model-plan-revision">本机模型提议与审批复跑</a>区分模型输出、宿主记录和最终报告。')},
 {id:'ag-recovery',title:'持久执行：重放、提交间隙与结果未知',articles:['agent-recovery','durable-workflows'],lead:'持久执行记录可恢复的决策与步骤结果。重放使用已经记录的结果继续推进；重新执行外部动作需要接收方幂等或查询协议。',body:
 para('三个时点决定故障语义：本地记录意图I，工具提交效果E，本地记录回执R。E发生后R之前退出，恢复者只看本地状态会看到“未完成”，但外部效果可能已经存在。把I和R放进一个本地事务，仍跨不过另一个工具数据库的E。',
 '解决方式之一是持久保存稳定op_id，接收方将效果与回执在同一事务中提交；恢复者以相同op_id重试或查询。接收方查到相同参数就返回原回执，查到异参则拒绝。调用次数可为2，效果只为1；这是特定接收方协议的性质，不是所有工具的默认能力。',
 '工作流重放要把会变化的输入保存下来：时间、随机选择、模型响应和外部读取都可能变化。升级代码后仍要能够解释历史事件；可用版本分支、迁移或已完成步骤兼容策略。若外部接口既无幂等键又无法查询，超时应进入对账、人工确认或有定义的补偿，而不是无条件再做一次。')+
 code('恢复器的关键分支 · 结果未知与失败分开','PYTHON','intent = load_persisted_intent(op_id)\nreceipt = receiver.lookup(op_id)\nif receipt is not None:\n    verify_arguments_and_record(receipt)\nelse:\n    retry_same_intent_or_enter_reconciliation(intent)')+
 para('发布新版后，待批准的动作还要保留原含义。<a href="/article/durable-workflows/#native-workflow-version-resume">看一次旧批准恢复到新节点的实跑</a>，再比较接收方拦截与按旧版本恢复。',
 '沿一份真实模型生成的草稿，<a href="/article/durable-workflows/#native-model-mcp-recovery">核对接收服务已提交、发布进程未收到回复时怎样恢复 →</a>')},
 {id:'ag-fencing',title:'多 worker：租约、代际与接收方 fencing',articles:['agent-recovery','durable-workflows','kairo-practice'],lead:'租约超时允许新的工作进程（worker）接管，但不会停止旧进程。隔离旧写者的机制称为fencing：它使用只增不减的代际号（epoch），让产生效果的接收方拒绝旧执行者；校验与效果必须在同一受保护边界内。',body:
 figure('v16-agent-fencing','A持有epoch1并暂停；B接管epoch2并安装接收方fence。A仍可继续运行，但它发出的全新动作被资源侧拒绝；幂等负责重复动作，fencing负责旧执行者。')+
 para('只在runner启动前检查lease存在时间窗：A检查通过后暂停，租约过期，B接管，A恢复后仍可能写。旧A使用一个全新op_id时，去重表不会救场。接收方必须在处理新效果前，与当前资源代际比较并串行化校验和提交。',
 '本地实战把控制状态和工具效果分放两个SQLite库。B先推进控制代际，再向接收方安装epoch2，收到安装结果后才执行动作。它没有跨库原子事务：若中间失败，需要保守阻断新执行与重试安装；多个接收方还需逐个确认。新owner在控制面出现，不能自动代表所有资源已隔离旧写者。')+
 code('接收方事务内的最小顺序 · 另有可信授权检查','SQL','BEGIN IMMEDIATE;\nSELECT epoch FROM fence WHERE task = :task;\n-- 来历可信的调用epoch必须等于当前epoch，否则ROLLBACK\nSELECT digest, result FROM effect WHERE tenant = :tenant AND op = :op;\n-- 同意图返回回执，异参冲突；新意图才插入效果与回执\nINSERT INTO effect(tenant, op, digest, result) VALUES(:tenant, :op, :digest, :result);\nCOMMIT;')+
 para('代际号必须绑定正确的任务和资源，并防止调用方伪造。邮件等外部工具若不支持fencing，不能把数据库里的epoch检查推演成远端写入排他；需要工具提供相应协议、可幂等的代理或其他明确策略。新实验只证明本地受保护接收方。')},
 {id:'ag-authorization',title:'权限委托、审批与外部文本边界',articles:['agent-security','agent-runtime','kairo-practice'],lead:'执行授权取决于真实主体、任务委托、具体工具、目标资源与当前策略。外部网页、检索文档和工具输出可以提供数据，不能自行扩大授权。',body:
 para('把读报告与写报告分成不同动作。资源查询先按可信租户范围解析对象，再校验动作与对象归属；路径写着tenant-A而实际记录属于B时应拒绝。工具具有访问后端的服务身份，不代表调用它的每个用户都继承后端全部权限，否则会形成“混淆代理”问题（confused deputy）。',
 '审批绑定规范化的具体意图：工具版本、对象、参数、金额/范围、失效时间与批准主体。执行前若模型改变关键参数，原批准就不再匹配；恢复和重试也要检查批准仍覆盖原意图。对长期任务，授权可能在工具提交前被撤销，应按定义的检查时刻重新查询。',
 '注入文本即使伪装成系统提示、管理员命令或工具的修复建议，仍按数据处理。schema约束参数形状，工具白名单限制可用能力，资源端授权限制实际效果；三者结合。敏感工具回执、令牌与私密上下文还需按读者身份过滤，避免通过结果展示绕过写入侧授权。')+
 knowledgeCheck('一律拒绝所有工具调用，安全测试就可以算全通过吗？','越权无效果是必要项；合法任务也必须完成。评估中同时保留正向授权与拒绝用例，全拒绝策略会因必要工作未交付而失败。')},
 {id:'ag-context',title:'上下文、运行状态与长期记忆的存储职责',articles:['agent-memory','agent-runtime'],lead:'上下文是一次模型调用可见的输入，运行状态保存恢复所需的权威事实，长期记忆保存可检索的跨任务信息。压缩上下文不能替代持久状态提交。',body:
 para('运行状态保留task/run/op身份、参数摘要、策略版本、步骤结果、回执和待决动作；从中重建当前可继续位置。模型窗口只选择本轮推理需要的部分。把“某工具可能已经提交”的事实仅放在历史对话里，摘要遗漏后就会制造重复执行。',
 '设上下文上限8192，固定指令1000、当前任务800、必要工具结果1300、检索片段2200，预留输出2048，则剩余844。真实还要按模型计算协议包装与其他输入；预算不足时按决策需要截取或检索原件，不把错误日志直接无限追加。',
 '记忆条目应带来源、租户/主体范围、形成时间、版本与有效条件。过期事实与新任务冲突时回查权威来源。删除、纠错和用户访问控制作用于实际存储与检索路径；只在提示中说“忘记它”不会删除后端条目。摘要还要保留不确定性、反例和引用，避免把待证实假设变成事实。')},
 {id:'ag-retrieval',title:'RAG：索引、过滤、排序与事实归因',articles:['agent-retrieval','agent-memory','agent-evaluation'],lead:'检索增强生成（RAG）先找资料，再把资料交给模型回答。完整链路包括采集、切块、版本和权限标记、召回、重排、选择上下文、回答与核验引用。召回相关文本与完成有依据的回答分别评估。',body:
 para('切块改变召回单位。太小会丢失限定条件与相邻定义，太大则混入大量无关内容。为chunk保留文档身份、版本、区间和继承权限。查询进入向量/关键词召回前后均按实际存储的能力实施权限与版本检查，不能只在最后展示时隐藏B租户标题。',
 '给定gold相关集合{a1,a2}，前三结果为[x,a1,a2]，Precision@3=2/3，Recall@3=1，首个相关项在第2位则MRR=1/2。相关判定由预先标注的相关性答案表（qrels）提供，不由检索器给自己的相似度代替。提高Recall也可能增加上下文噪声和成本，重排与截断后需再检查最终入模证据。',
 '回答评估要求事实与来源对应：报告总额37来自A租户a-1/v1的10与a-2/v2的27。只把37算对，却引用B租户999的文档，仍是错误交付。缺a-2时返回证据不足或继续检索；不能用语言流畅度填补缺失。新实验固定这些事实并读取实际报告行，不评估真实embedding或模型生成能力。')+
 table(['阶段','独立核对','典型失败'],[['召回','固定gold/qrels与权限','漏召回、跨租户、过期版本'],['上下文','实际送入的片段','重排或截断丢掉关键限定'],['回答','事实—值—来源版本','答对值但引用不支持、捏造补全']])},
 {id:'ag-observability',title:'任务轨迹、预算与每成功任务成本',articles:['agent-observability','agent-evaluation','kairo-practice'],lead:'任务轨迹连接一次逻辑任务的多次模型调用、工具尝试、恢复和验收。trace解释路径，权威回执解释效果，预算限制继续执行的条件。',body:
 para('task_id连接用户目标，op_id连接逻辑效果，attempt_id区分重试，trace/span连接一段被采集的调用。记录策略决定、耗时、输入/输出token、工具结果类别、效果回执与实际版本；凭据和私密正文不直接落入通用日志。逐请求ID适合受控事件记录，不适合无限制指标标签。',
 '预算至少约束墙钟deadline、模型调用、工具尝试、token与允许的效果范围。每次执行前扣除或预留所需额度，提交后对账实际消耗。取消后在途调用仍可能完成，需传播deadline/取消并查询结果；只修改任务状态不会自动回收外部工作。')+
 knowledgeFormula('固定计价与统计窗口后','每唯一合格任务成本 = 全部相关尝试总成本 / 唯一合格完成任务数','失败、重试、检索、工具和恢复的消耗都进入分子；成功数为0时不报0元/任务。')+
 para('例如20任务共24次尝试、总成本12单位，其中16个不同任务满足质量与权限要求，则0.75单位/成功任务。只统计成功尝试的8单位会错误得到0.5。这个数例使用人工成本单位；没有真实模型计费记录时，不将token模型或固定测试样例描述成实际API账单。')},
 {id:'ag-evaluation',title:'任务评估：真实效果、正确拒绝与故障注入',articles:['agent-evaluation','agent-retrieval','kairo-practice'],lead:'先固定输入、权限、允许效果、期望终态和必要证据，再运行Agent并读取环境。成功声明和自评只作为被检验对象。',body:
 figure('v16-agent-evaluation','四个固定任务与四种策略的独立验收：正确实现4/4，只报成功0/4，全拒绝2/4，金额正确但引用串租户3/4。图中每格来自同一程序输出。')+
 para('正向任务需要真实产物与正确事实/引用；负向任务需要明确拒绝且没有越权效果；缺证据任务需要约定的澄清或证据不足结果。分别报告业务完成、拒绝质量、重复效果、事实与来源，以及消耗。一个总分可能掩盖严重越权，关键项应有独立门槛。',
 '新实验用四个固定计划替代模型，真实写入SQLite报告，再让独立验收程序（oracle）核对金额37与两个来源版本。只改最终文本为success而不写报告，得0/4；全拒绝漏掉必要工作，也把缺证据误作拒绝；篡改为B引用虽然金额仍37，正向任务也失败。先证明评估器能抓住这些错误，才值得接真实模型扩大样本。',
 '回归集按任务类型、工具、租户和失败位置分层，保留版本与失败轨迹。固定计划通过只说明这些机制用例，不能推断模型成功率。真实Agent的采样波动、开放任务、人工评分细则与置信范围需要另做评估设计；公开基准也不能仅凭相似fixture宣称通过。')},
 {id:'ag-sandbox',title:'执行沙箱：资源、网络、文件与生命周期',articles:['agent-sandbox','agent-security','kairo-practice'],lead:'沙箱约束不可信代码的执行环境，工具授权约束对业务资源产生的效果。宿主隔离、凭据范围、网络出口和资源预算需要沿完整执行路径组合。',body:
 para('文件边界包括只读基础环境、每任务独立工作目录、受控挂载和输出导出；进程边界包括用户身份、系统调用与内核接口；资源边界包括CPU、内存、PID、磁盘和墙钟。网络默认出口和DNS解析策略也需实际实施，不能由模型自己决定是否遵守。',
 '启动前确认环境版本与最小身份；运行中限制额度并记录审计；结束后终止进程树、回收卷/临时文件和短期凭据，再扫描允许导出的结果。仅kill父进程可能留下子进程，删除容器引用也不能保证远端作业已结束。普通容器共享内核，独立内核/用户态内核等方案具有不同边界。',
 'Kairo接入时逐项映射这些控制点：由谁创建隔离环境、如何传递短期身份、哪个接收方实施授权与fencing、如何在恢复时查询回执、产物怎样验证和导出。下载包给出字段与故障验收表，尚未连接真实Kairo；本地子进程实验也没有提供恶意代码安全隔离。')}
]});

infraDomain('agent').points.find(p=>p.id==='ag-context').body+=
 table(['信息','权威保存位置','送入本轮模型的内容'],[['工具已提交但任务未完成','持久步骤记录和工具回执','动作身份、结果摘要、原件引用'],['检索到的一长段资料','带权限与版本的原始资料','回答本问题需要的片段'],['尚未证实的原因猜测','带状态的调查记录','明确写成假设，保留反例']])+
 para('例如把十页工具输出压成三句话后，仍应能通过原件引用查回第七页。摘要适合节省本轮输入，恢复器则直接查询持久记录；不需要让模型从一段压缩对话里猜工具到底有没有执行。');
infraDomain('agent').points.find(p=>p.id==='ag-sandbox').body+=
 table(['控制项','具体检查','结束时再检查'],[['文件','输入只读、输出在独立目录、路径不逃逸','只导出允许文件，清理临时卷'],['进程与时间','限制进程数、CPU/内存和总时限','子进程与远端作业都停止'],['身份与网络','任务最小身份、受控目标与出口','撤销短期凭据，回收连接/会话']])+
 para('先把每项控制落到真实执行环境，再做故障验证。例如“超时后退出码非零”只能说明某个进程退出；还要查看整个进程树和外部作业状态。本包没有创建安全沙箱，因此以上是接入时的验收项目，不算本地程序已经证明的隔离能力。');
