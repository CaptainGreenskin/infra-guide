Object.assign(sources,{
 v13SyncInvoke:['AWS Lambda · 同步结果与函数错误','https://docs.aws.amazon.com/lambda/latest/dg/invocation-sync.html'],
 v13AsyncInvoke:['AWS Lambda · 直接异步调用与错误处理','https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html'],
 v13Batch:['AWS Lambda · SQS 部分批次失败','https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html'],
 v13SqsConfig:['AWS Lambda · SQS 超时与批窗口配置','https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html'],
 v13SqsScale:['AWS Lambda · SQS 映射的伸缩控制','https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html'],
 v13Visibility:['Amazon SQS · 可见性超时','https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html'],
 v13LambdaMetrics:['AWS Lambda · 指标的计数口径','https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html'],
 v13SqsMetrics:['Amazon SQS · 积压与年龄指标','https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-available-cloudwatch-metrics.html'],
 v13LambdaPractice:['AWS Lambda · 执行环境与幂等实践','https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html']
});
Object.assign(cloudKnowledgeExplanations,{
 'execution-environment':knowledgeSubhead('Serverless 转移执行环境管理，业务提交仍有明确边界')+para(
 'FaaS 把“为一次调用准备多少环境、放到哪里、何时扩缩”交给平台；应用提交函数代码、资源和触发配置，处理输入并产生结果。Serverless 还包括其他托管执行形态，不能由 FaaS 的行为推断所有产品。以下先用通用的执行与确认模型，再以普通按需 AWS Lambda 和 SQS 标准队列说明具体参数；实例内并发、重试和账单需按各服务模式核对。',
 '新执行环境需要准备运行时、扩展和函数初始化，再运行 handler。一次请求的用户等待还可能包括触发侧排队、取事件和传输；handler 内的 Duration 只覆盖其中一段。冷启动优化应分别测量依赖加载、代码初始化、连接建立与业务执行，才能判断压缩包、依赖裁剪、预热或连接复用到底节省了什么。')+
 figure('v13-function-lifecycle','两条时间带区分新环境与复用环境：冻结后可以复用缓存与连接；任务记录必须在环境消失后仍可查询。图不承诺固定保温时间或请求回到原环境。')+
 para('handler 返回、运行时与扩展完成后，Lambda 可以冻结环境；后续调用若复用该环境，可继续使用内存对象、/tmp 和尚有效的连接。平台也可以换成新环境。全局变量适合保存可重建客户端和只读缓存，业务回执、消费进度和授权事实应放到有明确持久化保证的系统。后台线程不能被当作“返回后一定执行完成”的提交协议。',
 '复用还带来状态卫生问题：上一调用的租户数据不应留给下一调用，连接可能被服务端回收，临时文件可能属于旧版本。初始化应该可重复，缓存需要版本与失效处理，外部凭证需按实际生命周期刷新。运行时 reset 后的再初始化与 /tmp 保留也有特定规则，排障时结合启动日志和业务提交记录，而不只按“冷/暖”二分。',
 '函数适合边界明确的事件处理和可拆分任务；长期连接、稳定持续负载、超长处理或专用设备可能更适合长期工作进程。选型先比较输入规模、执行期限、启动频率、依赖连接、可重做性与成功产出，再比较运维和费用。持久工作流可以协调多步执行，但每一步的外部副作用仍要定义确认与幂等。'),
 'trigger-delivery':knowledgeSubhead('调用方式决定谁等待、谁重投、在哪里保留失败')+
 table(['AWS 路径','调用者先得到什么','后续尝试由谁安排'],[['直接同步 RequestResponse','Invoke 层结果和函数结果；需区分 FunctionError/payload','调用方、SDK 或上游按各自策略'],['直接异步 Event','通常 202：平台已接收进入内部事件队列','Lambda 按异步错误、年龄与重试配置处理'],['SQS 事件源映射','生产者先得到队列接受；poller 另同步批调用函数','未删除消息按 SQS 可见性、接收次数和映射规则再投']])+
 para('直接同步调用时，API 成功不一定代表函数逻辑成功；函数错误可以伴随 Invoke HTTP 200，需要继续检查 FunctionError 和业务结果。直接异步的 202 则不等待 handler，表示接受事件。函数错误默认有两次额外重试；节流和系统错误采用另一套退避与事件年龄规则，不能把所有异步失败都归为“总共只试三次”。',
 'SQS 映射由 poller 取消息后同步批调用 handler，不经过直接异步 Invoke 的内部队列。MaximumRetryAttempts、MaximumEventAgeInSeconds 因而不是这里控制消息重试的参数。默认整批成功后，映射按协议删除消息；失败未删除的消息在可见性超时后可再次被取到，源队列的 redrive policy 决定何时进入对应 DLQ。')+
 figure('v13-batch-retry','标准队列的 A/B/C 批次：启用部分批次响应，正常返回 B 的 messageId；A/C 按成功路径删除，B 未删除后可再投。顶层抛错或超时不能沿用这份部分成功结论。')+
 para('部分失败需要在映射中启用 ReportBatchItemFailures，handler 逐条捕获错误并正常返回 batchItemFailures。itemIdentifier 填该记录的 SQS messageId，用于本批关联；业务去重另用稳定操作 ID。标准队列仍可能重复成功项。FIFO 为保持组内顺序，首个失败后的未处理记录也需按相应协议返回，不能照搬“B 失败后继续执行 C”的标准队列示例。',
 '可见性从消息被取到进入不可见期开始计时，不从 handler 返回时重新起算。函数超时不超过队列可见性是映射的配置校验；AWS 建议可见性至少为函数超时的六倍，并加上非零批窗口。10 秒函数、2 秒批窗口的推荐起点是 62 秒；这为限流和重试留余量，但没有产生单次业务效果保证。毒消息应保留失败原因、来源与重驱条件，修复后沿原业务 ID 重放，而不把 DLQ 当成自动回滚。'),
 'event-idempotency':knowledgeSubhead('用稳定动作身份连接多次执行，而不是把重复当成新业务')+para(
 '一条业务动作应有跨尝试稳定的身份，例如 tenant + operation_id，并绑定规范化参数摘要。传输 ID 描述一次消息，业务 ID 描述“要做哪件事”：生产者重新发消息时，messageId 可能变，原业务动作仍相同。同键同意图返回原回执，同键异参进入冲突处理；这样既能防止重复生效，也能避免把另一笔合法动作错误吞掉。',
 '当业务效果和回执位于同一数据库，可以用唯一约束与事务把两者原子提交。一次执行先核对已提交回执；没有则写效果并保存回执；提交成功后才返回成功。并发执行也必须由接收方的原子约束仲裁，不能先在进程内查“没有”，再分别写入。处理中租约、超时或锁释放也不能单独证明远端效果未发生。')+
 figure('v12-event-commit-gap','提交和确认之间的间隙：业务效果与 inbox 已原子提交后进程退出，重投按同一 ID 查回原结果。该事务只覆盖图中的同一个数据库。')+
 table(['退出发生在何处','恢复看到什么','后续处理'],[['业务事务提交前','没有已提交效果/回执','沿原动作重新执行'],['提交后，函数返回前','效果与回执都存在，调用方结果未知','返回原回执，不再创建效果'],['同 ID 换了参数','已存在不同意图摘要','报告冲突并留证据'],['外部 API 已生效，本地尚未记录','本地记录不足以判断远端结果','查询远端回执或沿其幂等协议重试']])+
 para('回执保存期限至少要覆盖业务承诺的重试、DLQ 重驱和迟到窗口。删除去重记录后再次收到旧事件，应有明确策略。跨系统动作若无法参与同库事务，需要对方支持幂等键、可查询回执或可验证补偿；outbox 能可靠安排发送，但不会把任意远端写入变成本地事务。',
 '验收应注入“提交后、响应前退出”，分别计尝试数、唯一业务效果和回执。配套实验对 A 做真实子进程退出，再重投 A/B/C：A 两次尝试只保留一份效果，B 的失败被单独返回，恢复 B 后三笔效果都存在。随后还用两个本地进程竞争同一动作，检查数据库原子约束，而非用顺序执行冒充并发正确。'),
 'concurrency-instances':knowledgeSubhead('到达需求、在执行并发、实例和完成能力是四个量')+
 knowledgeFormula('同一调用单位与稳定执行窗口','平均执行并发 C ≈ 实际进入执行的调用率 λ × 平均执行时长 W','输入若被限流或排队，应分别统计到达率与进入执行率；平均关系不直接给峰值配额。')+
 para('在消息与调用一比一、每次执行平均 0.20 秒时，要持续处理 200 次/秒，未受限需求约为 40 个并发槽。若每次执行全程独占数据库连接，且只分配了 30 个连接，理想完成上界约为 30/0.20=150 次/秒。实际进入执行的并发约 30；输入仍为 200 时，多出的工作必须等待或被拒绝。')+
 figure('v13-serverless-capacity','合成容量账本：需求 40、下游预算 30；在图示固定满载模型中，队列每秒净增 50 条，30 秒约积压 1500 条。这不是云平台压测或伸缩 SLA。')+
 para('如果输入经过 SQS 且持续接收，固定容量区间可按 (200−150)×30=1500 估算新增积压；直接同步调用受限则可能得到 429，不能默认背后也有同样的队列。连接只持有 0.05 秒、批内多条消息或环境保留空闲连接时，都要重新计算消息/调用与连接占用。预热环境数并不消除数据库容量约束。',
 'Lambda reserved concurrency 从区域账户额度中为函数保留并发，同时限制其上限；provisioned concurrency 准备初始化环境，另有费用和覆盖范围。SQS 映射 MaximumConcurrency 约束该事件源，多个映射仍会竞争函数额度；SQS poller 的 provisioned mode 又是不同机制。实例内并发也依运行产品而异，迁移到其他函数平台应重新核对，不能将环境数恒等于调用并发。',
 '伸缩验收要把初始化时长、限流、执行错误、实际完成量、队列长度与最老消息年龄连起来。积压停止增长只说明新容量接近到达率；清空旧工作还需要额外净余量。对下游故障应限制并发、重试与重驱速率，避免恢复时让积压瞬间重新压垮依赖。'),
 'serverless-cost':knowledgeSubhead('用成功业务动作作分母，分别记执行账和事件账')+
 knowledgeFormula('题设计费口径，不填供应商单价','执行资源量 = Σ(每次配置内存 GB × 该次 billed duration 秒)','请求、预置容量、临时存储及队列/网络/日志等按各自规则另计；金额按实际区域、架构和模式查询。')+
 para('若 1000 次执行每次都按 0.20 秒、0.5 GB 计费，资源量为 100 GB·s。再重做 20 次同样执行会增加 2 GB·s，总量变为 102 GB·s；唯一成功业务数可能仍为 1000。比较方案时应计算总支出/唯一成功动作，并固定输入、错误与重试预算，避免只报“每次函数调用很便宜”。',
 '账单使用服务定义的 billed duration，不能把客户端等待、handler 单项 Duration 或队列年龄直接代入。预置容量、执行资源、请求和关联服务有不同计量；缩短依赖初始化或增加内存可能改变时长与并发，最终要比较同等业务质量下的总资源量。这里给单位关系，实际金额查看官方当前计费规则。',
 '可观测性也要保留两套账。一次 handler 正常返回部分批失败，在 invocation 视角可能没有顶层函数错误，但某些 record 仍失败。分别记录输入消息、执行尝试、唯一业务提交、幂等命中、冲突、DLQ 与重驱结果。Lambda Errors、Throttles、ConcurrentExecutions 和 SQS 近似积压/年龄指标用于定位范围，权威回执则支持逐动作核对。')+
 table(['现象','先对齐的证据','优化目标'],[['Duration 平稳，消息越来越老','进入执行率、下游连接、限流、最老年龄','提高有效完成或控制输入'],['函数错误少，业务仍缺结果','逐记录失败、DLQ、业务回执','补齐失败处理与验收'],['费用增多，唯一产出未增','重投、超时、重复执行、预置利用率','减少无效尝试与闲置成本']])+
 knowledgeCheck('40 个预热环境能保证本页算例持续完成 200 次/秒吗？','不能由预热数量推出。题设只有 30 个全程独占的数据库连接，理想完成上界约 150 次/秒。先解决下游预算与占用，再用唯一成功动作、积压和延迟检验整体容量。')
});
cloudKnowledgeDomain('serverless').refs.push('cnPrice','v13SyncInvoke','v13AsyncInvoke','v13Batch','v13SqsConfig','v13SqsScale','v13Visibility','v13LambdaMetrics','v13SqsMetrics','v13LambdaPractice');
