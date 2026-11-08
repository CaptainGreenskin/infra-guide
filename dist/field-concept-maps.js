/* Authored relationships among existing knowledge points. Arrows name a relation, not a universal execution order. */
const fieldConceptMaps={
 foundation:{
  nodes:[
   ['prerequisite-1','执行与资源','进程运行程序，线程推进执行；CPU、内存和I/O分别记账。'],
   ['prerequisite-2','并发与程序','多个执行者共享数据时，需要明确互斥、排队、取消和容量规则。'],
   ['prerequisite-3','通信与协议','网络传字节，应用协议再约定如何解释请求、响应和错误。'],
   ['prerequisite-4','数据与失败','事务约束数据提交；跨机器调用还可能出现超时后的未知结果。'],
   ['prerequisite-5','工程工具','命令、日志和测试帮助读取事实，不能替代对机制的解释。']],
  edges:[
   ['prerequisite-1','承载','prerequisite-2','线程要使用CPU，也可能等待共享数据。并发数增加，可能增加吞吐，也可能只增加锁等待。'],
   ['prerequisite-2','延伸到','prerequisite-3','本地线程可以共享内存；远端程序要通过消息协作，连接和等待因此成为新的边界。'],
   ['prerequisite-3','承载远程读写','prerequisite-4','协议把请求交给远程程序，事务与业务规则决定何时提交。调用超时后，还需按操作身份核对接收方结果。'],
   ['prerequisite-5','核对','prerequisite-1','将CPU时间、内存记账和I/O等待分别取证，才能判断程序到底在哪里消耗或等待。'],
   ['prerequisite-5','验证','prerequisite-4','在提交前后制造可控失败，再读取实际数据和回执，比只看退出码更能说明恢复行为。']],
  question:'CPU很低，线程都在等连接；一次写入超时，查询却找到了回执。分别画出等待对象和提交边界，哪些结论已经成立？',
  answer:'低CPU只说明执行消耗不高，连接等待仍可拉长请求。超时描述调用方没有按时拿到结果；接收方回执支持相应写入已经提交。下一步核对等待队列与业务身份，不能把低CPU和超时直接解释成“机器没问题、操作没发生”。',
  outlets:[['compute','把执行与等待的证据带入云规格和资源预算。'],['network','把本地读写扩展为跨机器的请求往返。']]},
 compute:{
  nodes:[
   ['service-model','服务责任','服务模型划分平台管理到哪一层，以及应用方还要负责什么。'],
   ['control-data-plane','请求与控制','数据面处理用户工作，控制面安排资源及其期望状态。'],
   ['fault-domain','故障范围','机架、可用区或区域等共同依赖，决定哪些副本可能一起失败。'],
   ['vm-runtime','运行环境','虚拟机提供虚拟硬件；容器组织受约束的进程，两者隔离边界不同。'],
   ['cpu-memory-placement','执行与内存位置','CPU执行预算和内存访问位置，共同影响单个实例能完成多少工作。'],
   ['instance-lifecycle','创建与替换','镜像提供启动内容，实例经历创建、运行、停止和替换等阶段。'],
   ['resource-contract','资源承诺','配额限制可申请总量，预留与实际分配还需按具体资源契约判断。']],
  edges:[
   ['service-model','划分管理边界','control-data-plane','平台可以接管更多控制工作，用户请求仍要经过具体执行与数据路径。责任变少不等于业务条件自动满足。'],
   ['control-data-plane','创建并管理','instance-lifecycle','申请或替换实例是控制动作；实例启动后是否能处理用户请求，需要另外核对。'],
   ['instance-lifecycle','建立','vm-runtime','同一镜像可以创建不同实例，实例又承载实际运行环境；不能把镜像文件当作运行中的服务。'],
   ['vm-runtime','使用','cpu-memory-placement','程序最终仍在消耗CPU时间并访问内存。虚拟CPU数量不自动等于独占物理核心。'],
   ['resource-contract','限制供给','instance-lifecycle','总量配额允许申请，不保证库存、单实例形状或启动时机都能兑现。'],
   ['fault-domain','约束副本分布','instance-lifecycle','多个实例若共享同一故障依赖，数量增加也可能没有增加所需的故障承受能力。']],
  question:'控制台已接受申请、实例已运行、两个副本都在同一可用区。这三份事实分别能证明什么，还缺哪些服务与故障证据？',
  answer:'申请被接受只证明控制请求进入相应流程；实例运行证明执行环境存在；两个副本证明数量，却未证明跨故障域。还要验证请求可达、数据与权限正确、资源预算充足，以及失去该可用区后的剩余能力。',
  outlets:[['network','实例存在以后，继续解释请求如何抵达并返回。'],['native','将受控进程组织成可持续维护的工作负载。']]},
 network:{
  nodes:[
   ['vpc-subnet','地址范围','VPC和子网组织逻辑网络及地址范围，不自动给出完整往返路径。'],
   ['route-overlay','下一跳','路由决定下一跳，封装网络还需要底层路径和相应传输条件。'],
   ['dns-discovery','名称与后端','名称解析和服务发现帮助选择访问地址或后端。'],
   ['nat-conntrack','地址转换','转换与连接跟踪关联两侧地址、端口及其状态。'],
   ['lb-tls','入口与身份','负载均衡选择后端；TLS校验通信身份并保护相应链路。'],
   ['transport-timeout','字节与请求','TCP提供字节流；HTTP解释请求与响应，超时有自己的计时边界。'],
   ['io-model','就绪与处理','就绪事件提示程序可以尝试读写，消息解析和业务仍由应用完成。'],
   ['network-boundary','流量允许规则','访问策略判断相应流量是否放行，不能替代资源级业务授权。']],
  edges:[
   ['dns-discovery','提供访问位置','lb-tls','解析得到地址以后，客户端仍须建立连接、校验身份并发送请求；解析成功不是请求已经抵达。'],
   ['vpc-subnet','为路径提供地址','route-overlay','先知道两端处于哪个地址范围，才能解释路由匹配、下一跳和回程。'],
   ['route-overlay','可能经过','nat-conntrack','经过地址转换后，要沿转换记录核对返回流量，而不是只看转换前的源地址。'],
   ['network-boundary','约束路径','route-overlay','有路由不等于允许访问；源出站、目的入站和沿途策略需要分别核对。'],
   ['route-overlay','连接入口所在网络','lb-tls','入口位于哪段网络、下一跳和回程是否成立，决定连接能否建立；TLS身份校验与路径可达分别判断。'],
   ['lb-tls','交付应用请求','transport-timeout','入口可以接通并返回HTTP 503，此时已经得到应用层响应；不能据此判断业务已成功。'],
   ['transport-timeout','提供字节','io-model','TCP交出连续字节，不提供业务消息边界。事件循环还需解析、管理输出缓冲和执行背压。']],
  question:'DNS、TCP和TLS均成功，最终收到HTTP 503。最晚成功到了哪一层？接下来应重查路由，还是核对响应来源与后端处理能力？',
  answer:'已经与某个响应方完成HTTP交换。先确定503来自入口还是后端，再核对后端健康、容量及依赖；保留相同请求条件。它不同于连接被拒绝或写入后断连，也不能单凭状态码证明业务从未发生。',
  outlets:[['native','把地址、就绪与回程带入Pod、Service和端点路径。'],['cloud-data','远程读写同时依赖网络路径和数据接口语义。']]},
 'cloud-data':{
  nodes:[
   ['storage-model','访问单位','块、文件和对象接口提供不同的读写单位与共享语义。'],
   ['storage-performance','完成代价','操作数、字节数和耗时分别衡量存储工作，不能只比较一个吞吐数字。'],
   ['durability-consistency','确认与观察','持久性约束已确认数据的保留，一致性约束不同读取能看到什么。'],
   ['database-service','事务提交','数据库按事务规则组织查询与更新，应用仍要设计索引、连接和提交范围。'],
   ['replication-failover','复制与写入资格','副本及切换规则决定故障后谁能写、读取哪一版。'],
   ['cache-layer','中间副本','缓存复用热点结果，失效与回填需要处理陈旧和并发。'],
   ['messaging','异步工作','消息与日志组织待处理或可重放的工作，运输确认与业务提交分开。'],
   ['backup-restore','恢复材料','基线、变化记录和校验帮助重建目标状态，恢复要由消费者结果验收。']],
  edges:[
   ['storage-model','决定测量单位','storage-performance','先固定每次操作读写多大、是否持久化，再比较每秒操作数、吞吐和尾延迟。'],
   ['storage-model','承载持久读写','database-service','数据库事务最终要通过相应存储路径保存变化；文件系统语义不能直接套到对象API上。'],
   ['database-service','落实提交规则','durability-consistency','事务返回成功以后，仍要说明哪些故障下保留数据，以及其他读取按何种规则看见它。'],
   ['replication-failover','与历史恢复互补','backup-restore','复制延续当前变化，备份与连续日志用于重建历史目标。误删也会被复制，两者共同组成恢复方案。'],
   ['cache-layer','复用并可能落后于','database-service','数据库已提交新值，旧读取仍可能稍后回填缓存。提交点与回填版本要放在同一时间线上。'],
   ['messaging','触发处理但不代替','database-service','消费者收到消息或发出ACK，不自动证明事务已经提交；重复投递要沿稳定业务身份处理。'],
   ['backup-restore','验证恢复后的','durability-consistency','恢复完成还要核对已确认记录、版本和实际查询，备份任务成功本身不提供这些结论。']],
  question:'副本正常、备份任务成功、队列已经清空，能否证明故障后用户的一笔已确认操作仍完整存在？列出还要核对的记录。',
  answer:'分别核对业务身份与提交回执、数据库恢复历史、消息确认顺序和实际消费者查询。副本可能同步错误，备份可能缺少连续日志，队列清空也可能发生在业务提交之前；三个绿灯不能合成同一笔业务的完整证明。',
  outlets:[['serverless','把异步工作连接到触发、重复执行与业务完成。'],['sre','用恢复目标、用户断言和故障范围验收数据恢复。']]},
 native:{
  nodes:[
   ['container-isolation','实际进程','容器运行时启动受相应隔离和资源约束的应用进程。'],
   ['reconciliation','声明与控制循环','API对象保存期望，控制器不断比较现场并推进差异收敛。'],
   ['workload-type','工作负载','Pod承载容器，工作负载对象组织副本、完成型任务或稳定身份。'],
   ['placement','节点放置','调度器按资源与位置约束寻找可行节点。'],
   ['service-network','服务入口','网络实现与Service端点一起决定流量怎样到达可用后端。'],
   ['persistent-volume','持久卷','卷声明、供给与挂载提供存储能力，还受拓扑及使用规则约束。'],
   ['health-rollout','就绪与替换','探针表达启动、存活或接流量资格，发布组织旧新副本的替换。'],
   ['configuration','配置生效','配置要经过注入和进程读取才影响业务，来源更新并非最终生效。'],
   ['autoscaling','伸缩反馈','控制器按指标建议副本或资源变化，真正生效还要有可放置容量。']],
  edges:[
   ['reconciliation','维护','workload-type','期望副本数进入API对象以后，控制器创建或补齐Pod，不直接保证用户请求可用。'],
   ['workload-type','等待','placement','Pod存在以后，还需要选到满足资源、亲和和拓扑条件的节点。'],
   ['placement','安排执行位置','container-isolation','节点确定后，节点代理与运行时才继续准备镜像并启动进程；已绑定不等于已运行。'],
   ['persistent-volume','反向约束','placement','卷能在哪些节点挂载，会限制Pod的可行位置。调度和存储不是互不相干的两步。'],
   ['configuration','被启动进程读取','container-isolation','环境变量来自启动环境；只改配置对象，旧进程可能仍使用旧值。'],
   ['container-isolation','接受不同健康检查','health-rollout','进程启动以后，探针再按规则检查初始化、存活或接流量资格；Running不能替代这些条件。'],
   ['health-rollout','决定接流量资格','service-network','副本存活与端点就绪分开。就绪条件决定相应流量资格，真实响应还要另外验证。'],
   ['autoscaling','增加放置需求','placement','建议副本增加以后，节点仍须放得下。指标、声明、放置、启动和就绪之间存在时间差。']],
  question:'Pod已创建但Pending、另一个Pod已Running却不接流量、配置v2而HTTP仍v1。这三个问题分别卡在什么对象关系？',
  answer:'先按阶段取证：Pending核对是否尚未绑定及调度约束；Running不接流量检查就绪与端点；配置v2但旧响应检查注入、进程读取与模板替换。三者不能都用“重启Pod”作为解释。',
  outlets:[['cloud-delivery','把对象变化连接到源版本、持续调谐和发布验收。'],['platform','训练进程进入编排以后，还需整组准入、会合与共同恢复。']]},
 serverless:{
  nodes:[
   ['execution-environment','执行环境','函数在平台安排的环境中运行，环境创建、复用和寿命有明确边界。'],
   ['trigger-delivery','触发与投递','事件源把工作交给执行环境，受理、调用和删除各有协议。'],
   ['event-idempotency','业务身份','稳定身份把多次运输与尝试关联为同一逻辑动作。'],
   ['concurrency-instances','并发与实例','同时处理多少调用、需要多少环境，取决于运行模型和下游容量。'],
   ['serverless-cost','成本与适用范围','账单用量、冷启动、重试和有效产出共同决定总体成本。']],
  edges:[
   ['trigger-delivery','安排调用','execution-environment','平台接受事件以后，还可能经历排队和环境准备；受理成功不等于处理函数已经执行。'],
   ['trigger-delivery','要求处理重复','event-idempotency','删除或确认之前退出，可能造成重新投递。接收方仍需沿原业务身份记录效果。'],
   ['concurrency-instances','受环境模型约束','execution-environment','实例与调用不是固定一比一关系；要先明确一个环境能同时处理多少工作。'],
   ['concurrency-instances','改变','serverless-cost','增加并发可能降低等待，也可能放大数据库压力和重试；成本要对齐唯一成功结果。']],
  question:'队列为0、函数调用都有计费记录，但业务效果为0，能否宣布任务完成？增加并发能解决这个问题吗？',
  answer:'不能。需要核对确认是否早于业务提交、失败是否进入留存路径。并发改变执行容量，不会修复错误的提交顺序；先定义业务完成与稳定身份，再调整吞吐和成本。',
  outlets:[['cloud-data','回到消息确认与数据库事务之间的提交间隙。'],['cloud-capacity','用到达量、净完成量和扩容空窗解释积压。']]},
 'cloud-delivery':{
  nodes:[
   ['artifact-contract','完整版本','可追溯制品、配置和数据兼容条件共同定义可交付版本。'],
   ['ci-cd','交付流水线','流水线组织构建、检查、审阅和部署动作。'],
   ['iac','配置与状态','IaC工具比较期望、受管记录和实际对象，再计划和执行变化。'],
   ['controller-api','持续控制','平台API描述意图，控制器反复观察并推进实际状态。'],
   ['gitops','版本化期望','Git中的确定修订提供期望，控制器据此同步相应受管对象。'],
   ['release-strategy','用户流量切换','滚动、蓝绿或灰度改变版本如何获得工作及何时退出。'],
   ['rollback-compatibility','回退条件','旧版本要能读取现有数据并使用依赖，源代码回退不能撤销所有外部效果。']],
  edges:[
   ['ci-cd','产出并检查','artifact-contract','流水线通过应对应一份确定制品及其输入，不能只保留某次任务的绿灯。'],
   ['iac','建立受管关系','controller-api','配置地址、状态和现场对象需要明确归属；多套自动化争改同一对象可能互相覆盖。'],
   ['gitops','提供版本化期望给','controller-api','源修订确定以后，控制器继续比较和调整；同步完成仍需核对进程与业务。'],
   ['artifact-contract','由源修订引用','gitops','版本化声明应引用确定的制品与配置，避免相同声明在不同时间解析成不同运行内容。'],
   ['artifact-contract','进入','release-strategy','完整版本具备条件以后，才讨论先切多少流量、观察多久以及何时停止旧写者。'],
   ['rollback-compatibility','限制','release-strategy','旧代码若已不兼容当前数据，回切流量也不能恢复服务；回退条件要在发布前确定。']],
  question:'Git是v2、同步健康，但HTTP仍v1。若改回旧Git修订，是否连数据库和已发出的消息也一起回到了过去？',
  answer:'先核对配置如何进入进程以及当前服务后端。Git回退只是改变期望，并不撤销数据库写入或消息效果；需要独立检查数据兼容、外部产物与用户断言。',
  outlets:[['native','回到配置、Pod模板、进程与Service的实际生效路径。'],['sre','把发布观察窗口、止损与恢复验收连起来。']]},
 'cloud-security':{
  nodes:[
   ['authentication-authorization','身份与授权','认证确认调用主体，授权再判断这个主体能对哪些资源做什么。'],
   ['workload-identity','程序身份','运行中的服务或任务需要可区分、可限制、可撤销的身份凭据。'],
   ['secret-lifecycle','凭据寿命','秘密的分发、读取、轮换与撤销，决定哪些进程仍能继续使用它。'],
   ['tenant-isolation','租户边界','不同租户的数据、资源与管理范围需要在多个层次执行隔离。'],
   ['execution-security','执行限制','容器权限与沙箱限制程序能访问的文件、网络及系统能力。'],
   ['audit-accountability','审计与结果','审计关联主体、授权、动作和结果；拒绝也要核对没有造成目标效果。']],
  edges:[
   ['workload-identity','提供调用主体','authentication-authorization','凭据证明身份之后，还要按当前任务、动作和资源判断允许范围；令牌格式合法不等于有权限。'],
   ['secret-lifecycle','改变身份可用性','workload-identity','来源中的秘密更新以后，旧进程可能仍持有旧值；撤销与读取缓存要按实际路径检查。'],
   ['authentication-authorization','执行业务范围','tenant-isolation','即便网络相通，也不能跨租户读写；资源端需要校验可信租户与对象范围。'],
   ['execution-security','补充程序约束','tenant-isolation','业务授权允许某个动作，不代表程序应当能读取宿主全部文件或访问任意网络。'],
   ['audit-accountability','核对判定与效果','authentication-authorization','记录拒绝之后还要看接收方是否真的没有提交；日志声明本身不是资源端的效果证明。']],
  question:'工具文本要求使用管理员身份，执行器又运行在沙箱中。哪一方能授予权限？沙箱是否自动阻止跨租户业务写入？',
  answer:'权限来自可信身份与有效委托，并由受保护资源端执行。工具文本不能扩权；沙箱限制程序能力，不能替代业务资源对租户、动作与对象的授权。',
  outlets:[['agent','把可信委托、工具文本和资源端效果分别放到任务链路。'],['native','核对秘密怎样注入、何时重读，以及容器实际拥有的权限。']]},
 'cloud-capacity':{
  nodes:[
   ['capacity-units','工作量口径','到达率、服务时间、在途量和有效吞吐分别描述同一工作过程的不同量。'],
   ['queue-backpressure','积压与准入','输入超过完成能力会积压；有限队列、拒绝与背压让资源上限可控。'],
   ['scaling-delay','扩容空窗','从信号到新资源真正就绪需要时间，已有余量要承担这段输入。'],
   ['performance-budget','端到端瓶颈','排队、执行与依赖共同组成耗时，局部利用率不能单独解释整体性能。'],
   ['cost-efficiency','有效产出成本','总支出要与唯一成功产出及质量对应，重试和恢复也消耗资源。']],
  edges:[
   ['capacity-units','给出差额','queue-backpressure','同口径到达量减有效完成量，决定积压增长；尝试次数不能冒充唯一完成数。'],
   ['scaling-delay','扩大暂时积压','queue-backpressure','建议扩容到新副本就绪之间仍会进来工作；扩容恰好追平输入只停止增长，不能排空旧积压。'],
   ['performance-budget','定位提升方向','capacity-units','先判断CPU执行、锁、网络还是下游等待限制完成，再决定增加哪类资源。'],
   ['cost-efficiency','约束扩容选择','scaling-delay','预留资源增加支出，但可能缩短容量空窗；需要按目标质量和有效产出比较。']],
  question:'每秒到达120项、有效完成100项，已有300项积压。扩容后恰好完成120项/秒，多久能排空？要在30秒排完至少需多少净余量？',
  answer:'扩容后净余量为0，原积压不会自然减少。忽略扩容耗时及波动时，30秒排300项至少要10项/秒净余量，即完成能力至少130项/秒；实际还需计入空窗新增积压、失败和下游上限。',
  outlets:[['native','把建议副本数连接到节点放置、启动和就绪。'],['sre','用用户质量目标判断性能与成本变化是否可接受。']]},
 sre:{
  nodes:[
   ['sli-slo','用户结果与目标','先定义什么事件算好，再给统计窗口和允许失败量。'],
   ['observability-signals','证据信号','指标定位范围，日志和追踪帮助解释具体路径，采样与聚合有边界。'],
   ['alert-burn','行动触发','告警应连接预算消耗、影响与可执行行动。'],
   ['diagnosis-method','可证伪的解释','按时间线与请求路径提出假设，再取能支持或排除它的证据。'],
   ['incident-change','事故与变更','止损、恢复、变更记录与复盘组织协作和后续改进。'],
   ['resilience-patterns','故障保护','冗余、限流、超时和切换处理不同失败条件，也可能改变容量与一致性。'],
   ['recovery-evidence','恢复验收','明确数据确认点、允许丢失、恢复时刻和用户可继续工作的条件。']],
  edges:[
   ['sli-slo','定义测量问题','observability-signals','先规定有效请求、好坏事件与时间窗，再收集同口径数据，避免用资源利用率代替用户质量。'],
   ['sli-slo','给出允许失败量','alert-burn','错误预算来自目标与分母；消耗速度帮助判断是否需要行动，不等于简单数告警次数。'],
   ['observability-signals','支持或排除','diagnosis-method','同一时间窗中的请求区间、锁等待和依赖记录，才可能解释低CPU与高延迟。'],
   ['diagnosis-method','指导止损','incident-change','相关变更只是线索。动作前说明预期影响，动作后用用户断言验证是否改善。'],
   ['resilience-patterns','接受故障验证','recovery-evidence','有副本和切换脚本，不等于目标故障下能恢复；还要核对剩余容量、数据和用户请求。'],
   ['recovery-evidence','闭合','sli-slo','恢复结束点应回到约定的用户结果，不能只以进程重启或监控转绿作为结束。']],
  question:'资源监控恢复正常，HTTP成功率也上升，但订单查询仍缺一笔已确认记录。事故能结束吗？还需要哪类恢复证据？',
  answer:'不能只按资源和运输成功结束。沿原业务身份核对数据确认点、恢复历史与消费者查询，再按约定质量窗口验证。恢复时间和丢失窗口要采用事先约定的起止条件。',
  outlets:[['cloud-data','读取实际恢复材料、日志连续性和消费者结果。'],['cloud-delivery','用完整版本与数据兼容条件解释发布和回退。']]},
 'model-foundations':{
  nodes:[
   ['mf-tensors','输入与形状','词元编号进入向量，张量的每根轴说明样本、位置或特征。'],
   ['mf-attention','跨位置读取','注意力按匹配权重汇总允许看到的位置，因果规则限制未来信息。'],
   ['mf-decoder','完整模型层','前馈、残差、归一化和位置机制把注意力接成可重复堆叠的层。'],
   ['mf-autograd','目标与更新','损失衡量预测与目标的差异，梯度和优化器推动参数更新。'],
   ['mf-gpu','执行与搬运','张量运算映射到执行单元和多层存储，数据搬运会产生代价。'],
   ['mf-roofline','性能上界','计算量与字节量帮助判断受计算还是带宽约束，再用实现和轨迹核对。']],
  edges:[
   ['mf-tensors','规定运算轴','mf-attention','先写清哪些轴对应位置和特征，才能检查点积、掩码与汇总的方向。'],
   ['mf-attention','组成','mf-decoder','跨位置汇总之后，仍需逐位置特征变换与残差连接；完整层保持主路径形状兼容。'],
   ['mf-decoder','产生预测供','mf-autograd','模型输出候选分数，目标和有效位置决定损失；同一计算图再传播梯度。'],
   ['mf-tensors','提供工作量给','mf-gpu','形状和元素类型确定主要运算与字节，设备数量本身不说明计算了什么。'],
   ['mf-gpu','接受上界分析','mf-roofline','先算工作和搬运，再检查分块、复用与同步。减少函数调用不自动等于更快。']],
  question:'B=2、H=2、D=8不变，T从4变8。隐藏元素与密集注意力分数各增长多少？这能否直接给出GPU耗时？',
  answer:'隐藏元素B×T×D从64变128，密集分数B×H×T²从64变256。计数分别翻倍与四倍，但实现可能不物化完整分数，设备执行、搬运与利用率还需另测，不能把数学规模直接当耗时。',
  outlets:[['training','把一次数值正确的更新扩展到并行、状态与恢复。'],['platform','固定参数用于推理时，再区分输入处理、逐词生成与缓存。']]},
 training:{
  nodes:[
   ['tr-step','一次有效更新','输入、前向、损失、反向、同步和优化器共同形成一次更新过程。'],
   ['tr-memory','状态与峰值','参数、梯度、优化器、激活和缓冲在不同阶段占据显存。'],
   ['tr-ddp','副本与全局目标','数据并行同步副本梯度，还要核对各进程样本权重和监督目标。'],
   ['tr-sharding','训练状态分片','分片减少重复保存，但会增加相应状态收齐、通信和临时峰值。'],
   ['tr-parallel','计算与专家布局','层内、层间或专家分配切开不同计算，通信由布局和依赖决定。'],
   ['tr-collectives','参与者与通信','集合操作要求相应参与者、顺序和数值布局匹配。'],
   ['tr-input','有效数据供给','读取、预处理、分片和组批决定各进程实际学到哪些有效位置。'],
   ['tr-recovery','可继续的状态','检查点需对齐模型、优化器和数据进度，才能按定义继续训练。']],
  edges:[
   ['tr-input','提供监督输入','tr-step','不同进程的有效标签数会改变目标分母，不能只看每个进程都在执行。'],
   ['tr-ddp','通过通信同步','tr-collectives','同步让副本更新一致，但局部平均再平均仍可能采用错误样本权重。'],
   ['tr-ddp','组织多副本的','tr-step','每个副本执行相应更新步骤；同步方式、有效样本权重和更新时机一起决定是否对应同一全局目标。'],
   ['tr-sharding','改变驻留峰值','tr-memory','状态分散以后，计算前仍可能临时收齐；不能只用总量除设备数估算峰值。'],
   ['tr-parallel','决定交换什么','tr-collectives','切输入、输出、层或专家，会改变通信数据与发生位置，不能只统称“同步模型”。'],
   ['tr-step','消耗并产生状态','tr-memory','前向留下反向需要的中间量，更新还会维护优化器状态；这些对象寿命不同。'],
   ['tr-recovery','恢复同一过程','tr-step','恢复要说明保存边界与未完成窗口怎样处理，并把数据位置一起对齐。']],
  question:'各副本参数相等，loss也下降，但与单进程目标不同；恢复后轨迹又变化。分别应该核对哪些关系？',
  answer:'副本一致不证明全局目标正确，先查有效位置、样本权重和梯度缩放。轨迹变化另查模型、优化器、随机状态、数据位置与保存边界；不能把同步成功和文件加载成功合成一次训练正确的结论。',
  outlets:[['platform','把训练程序和恢复契约交给作业准入与资源平台。'],['cloud-data','按实际访问模式检查存储供给与恢复材料。']]},
 platform:{
  nodes:[
   ['sv-contract','作业与完整产物','作业声明运行意图、输入和完成条件；推理要加载完整且一致的模型版本。'],
   ['sv-admission','资源准入','配额、单节点形状、拓扑与整组可行性决定作业能否执行。'],
   ['sv-prefill','输入与生成','预填充处理已有输入，解码依赖前一步选定的新词元。'],
   ['sv-kv','历史键值状态','缓存复用历史位置的键和值，容量随保留位置、头数和并发增长。'],
   ['sv-batching','请求调度','批处理与准入安排何时计算哪个请求，并分配缓存等资源。'],
   ['sv-metrics','用户计时口径','首词元延迟、后续间隔、吞吐和达标吞吐回答不同服务问题。'],
   ['sv-quantization','数值与字节','量化改变表示和存储，执行内核与校准质量仍需单独验证。'],
   ['sv-optimizations','候选与验证','推测解码用便宜提议和目标验证减少相应串行工作，仍有额外开销。'],
   ['sv-release','版本与验收','产物、分词、配置和评估共同确定可发布版本，回退还需验证依赖。']],
  edges:[
   ['sv-contract','提出资源需要','sv-admission','提交成功不等于可放置；训练规模和布局要能在实际资源形状中同时成立。'],
   ['sv-contract','交付完整模型给','sv-prefill','推理服务需要一致的参数、分词规则和配置，才能在约定模型版本上处理输入并继续生成。'],
   ['sv-prefill','产生并读取','sv-kv','缓存对应已处理位置，不总等于屏幕上已显示的输出数；停止时最后输出可能尚未再次送入模型。'],
   ['sv-batching','受容量限制','sv-kv','每个请求都占相应状态，权重放得下不代表任意并发都能进入。'],
   ['sv-batching','改变等待分布','sv-metrics','批次更大可能提高吞吐，也可能增加首词元等待；比较要固定输入和质量口径。'],
   ['sv-quantization','影响资源与时延','sv-metrics','量化改变数值表示与字节布局，具体内核负责计算。按同一负载比较质量、排队和执行耗时，才能判断有效服务能力。'],
   ['sv-optimizations','利用条件前缀','sv-prefill','候选并行核对仍要保持因果位置、正确概率与缓存回退；目标调用减少不等于加速倍数。'],
   ['sv-release','验收产物与行为','sv-contract','能加载只是起点，分词规则、任务质量、服务表现与可回退性要分别核对。']],
  question:'权重成功加载，量化后字节减少，目标模型调用数也少了，为什么首词元延迟仍可能变差？',
  answer:'三份证据分别支持可加载、存储变化和调用计数，尚未说明调度等待、缓存容量、草稿开销和实际内核耗时。先固定并发、长度、质量与计时起点，再拆分排队、输入计算和持续生成。',
  outlets:[['agent','模型服务提供提议，任务运行时另负责工具执行与真实结果验收。'],['native','自建作业平台时，再核对Pod、卷与网络的实际生命周期。']]},
 agent:{
  nodes:[
   ['ag-runtime','任务与执行','任务给出目标和停止条件，运行时检查提议并安排实际动作。'],
   ['ag-tools','工具契约','名字、类型和结果语义规定怎样调用，结构正确不等于事实正确。'],
   ['ag-recovery','效果与恢复','接收方回执记录实际提交，持久历史帮助在未知结果后继续。'],
   ['ag-fencing','执行者接管','租约过期不使旧进程消失，接收方需要拒绝不再有效的执行资格。'],
   ['ag-authorization','可信委托','身份、任务范围与当前资源策略共同决定允许的动作。'],
   ['ag-context','模型可见信息','上下文组织当前输入，执行状态保存已确认事实，长期记忆保存可复用知识。'],
   ['ag-retrieval','获准证据','资料经过检索、权限与版本检查，再在预算中交给模型。'],
   ['ag-observability','轨迹与消耗','分别记录任务、逻辑动作和尝试，才能解释重试、等待与成本。'],
   ['ag-evaluation','真实任务结果','按真实产物、来源和正确拒绝判断完成，不由模型自报成功。'],
   ['ag-sandbox','程序能力边界','沙箱限制文件、网络和资源等执行能力，不替代业务授权。']],
  edges:[
   ['ag-runtime','安排受控调用','ag-tools','模型只提出工具名和参数，运行时还要检查契约、范围和预算，才产生实际尝试。'],
   ['ag-authorization','允许或拒绝','ag-tools','工具文本和检索材料不是授权来源；真正造成效果的接收方仍要执行当前权限。'],
   ['ag-sandbox','限制程序能力','ag-tools','即便动作被业务允许，执行程序也应只取得所需文件、网络与资源。'],
   ['ag-tools','交付执行结果','ag-recovery','运行时保存工具结果；产生外部写入时，还要关联接收方回执。恢复沿原操作身份核对已完成与待继续的工作。'],
   ['ag-fencing','保护接管后的','ag-recovery','旧执行者暂停后复活，仍可能继续写；接收方要按有效资格拒绝过期写入。'],
   ['ag-retrieval','提供材料给','ag-context','找到资料不等于本次模型真的看到了它，还要核对权限、版本、完整性和预算。'],
   ['ag-context','组织本次提议输入','ag-runtime','运行时从可信状态和获准资料组织模型输入；模型可见的旧摘要不能反向覆盖接收方的新回执。'],
   ['ag-observability','提供过程证据给','ag-evaluation','轨迹解释动作怎样发生，最终仍要独立核对产物与目标，不能只统计成功状态码。'],
   ['ag-recovery','保留提交事实供','ag-evaluation','任务进度可能尚未完成而效果已存在；评价与恢复都不能抹掉这份已发生的事实。']],
  question:'模型说成功、工具回执存在，但交付上下文少一份必要来源，且旧写权限已撤销。哪些事实可以保留，哪些动作不能继续？',
  answer:'保留已确认效果并核对原回执，不能因进度未更新而重复写。新动作按当前权限判断，查询本身也需要当前读取资格；证据不足时不能把模型回答判为完成，应按规则补充获准资料或明确报告不足。',
  outlets:[['platform','需要自建模型服务时，再深入生成、缓存与服务性能；训练不是Agent先修。'],['cloud-security','继续深入程序身份、秘密轮换和资源端授权。']]}
};
// Reading emphasis changes the presentation, never the meaning/direction of an edge.
const fieldConceptReadings={
 foundation:{main:[0,1,2],lead:'先看程序怎样执行和共享数据，再把本地读写扩展到网络与事务。工程工具用来观察和验证这条链。'},
 compute:{main:[0,1,2,3],lead:'先分清服务责任，再看控制面怎样创建实例、实例怎样承载程序。配额和故障域约束资源供给与副本分布。'},
 network:{main:[0,1,4,5,6],lead:'名称解析提供访问位置，再沿入口、连接和应用请求往返。地址、路由与访问策略分别约束这条路径。'},
 'cloud-data':{main:[0,1,2],lead:'从读写接口进入数据库提交，再看缓存、复制、消息和备份怎样围绕同一份数据工作。'},
 native:{main:[0,1,2,5,6],lead:'期望对象经过调度变成进程，进程通过就绪检查后接收流量。存储、配置和伸缩分别约束这条主线。'},
 serverless:{main:[0,2,3],lead:'事件触发函数，执行环境承载调用；业务身份处理重复，并发影响资源占用，成本对齐有效产出。'},
 'cloud-delivery':{main:[0,2,3,4],lead:'流水线生成完整版本，版本化声明交给控制器，发布策略决定新旧版本怎样获得流量。回退受数据兼容条件约束。'},
 'cloud-security':{main:[0,2],lead:'程序先取得身份，资源端再按主体、动作和对象授权。凭据寿命、执行隔离与审计提供不同层面的约束。'},
 'cloud-capacity':{main:[0,1],lead:'先统一到达量、完成量和在途量，再看队列与扩容空窗。性能预算定位瓶颈，成本对齐有效产出。'},
 sre:{main:[0,2,3,5],lead:'从用户质量目标确定要采集的信号，沿证据诊断与恢复，再用同一用户目标验收。'},
 'model-foundations':{main:[0,1,2],lead:'先看输入经过注意力和模型层产生预测，再接训练更新。GPU执行与Roofline是实现和性能分析分支。'},
 training:{main:[0,5,6],lead:'沿数据进入一次更新，再观察状态占用与保存恢复。副本、分片和计算布局通过集合通信扩展这个过程。'},
 platform:{main:[0,1,2,3,4],lead:'先区分作业申请资源与模型进入推理两条路径，再把生成、缓存、调度和计时连起来。优化与发布围绕这两条路径展开。'},
 agent:{main:[0,3,6,8],lead:'先沿上下文、动作提议、受控工具、持久事实与结果验收理解任务。检索补充输入，权限和沙箱限制动作，观测记录过程。'}
};
const chapterConceptSupplements={'virtual-memory-oom':['foundation','prerequisite-1'],'training-lab':['training','tr-recovery'],'cloud-service-lab':['native','health-rollout'],'production-readiness':['agent','ag-evaluation'],'mysql-replication':['cloud-data','replication-failover']};

function fieldPointRecords(moduleId){
 if(moduleId==='foundation')return cloudPrerequisites.map(([title,lead,chapters],i)=>({id:'prerequisite-'+(i+1),title,lead,articles:chapters}));
 const cloud=cloudKnowledgeDomains.find(d=>d.module===moduleId);
 if(cloud)return cloud.points.map(p=>({id:p[0],title:p[1],lead:p[2],articles:p[4]}));
 return infraKnowledgeDomains.find(d=>d.module===moduleId)?.points||[];
}
function fieldMapURL(moduleId,concept=''){return '/module/'+moduleId+'/'+(concept?'?concept='+encodeURIComponent(concept):'')+'#concept-relations';}
function fieldConceptMapHTML(moduleId){
 const graph=fieldConceptMaps[moduleId];if(!graph)return '';
 const names=Object.fromEntries(graph.nodes.map(n=>[n[0],n[1]])),safe=trainingEscape,points=fieldPointRecords(moduleId);
 const link=id=>'<a href="/module/'+moduleId+'/#knowledge-'+id+'">'+safe(names[id])+'</a>';
 return '<section class="field-concept-map" id="concept-relations" data-field-map="'+moduleId+'"><h2>核心对象与关系</h2><p class="field-map-note">'+safe(fieldConceptReadings[moduleId].lead)+'</p>'+figure('field-'+moduleId,moduleFor(moduleId).name+'的核心关系：粗线先看主线，细线补充约束与反馈；箭头上直接标明关系。')+'<details class="field-map-explorer"><summary>查概念定义、关系说明与相关章节</summary>'+
 '<div class="field-map-controls" role="group" aria-label="聚焦本领域概念"><button type="button" data-concept-focus="all" aria-pressed="true">全部关系</button>'+graph.nodes.map(([id,label])=>'<button type="button" data-concept-focus="'+id+'" aria-pressed="false">'+safe(label)+'</button>').join('')+'</div>'+
 '<div class="field-map-definitions">'+graph.nodes.map(([id,label,meaning])=>{
  const associated=[...new Set([...(points.find(p=>p.id===id)?.articles||[]),...Object.entries(chapterConceptSupplements).filter(([,pair])=>pair[0]===moduleId&&pair[1]===id).map(([chapter])=>chapter)])];
  return '<div class="field-map-definition" data-concept-definition="'+id+'"><p><b>'+safe(label)+'：</b>'+safe(meaning)+' <a href="/module/'+moduleId+'/#knowledge-'+id+'">展开系统知识 →</a></p>'+(associated.length?'<p class="field-map-chapters"><b>相关机制章：</b>'+associated.map(key=>{const a=articles.find(a=>a.id===key);return '<a href="/article/'+key+'/" title="'+safe(a.title)+'">'+a.number+' '+safe(a.title.split(/[：:]/)[0])+' →</a>';}).join('')+'</p>':'')+'</div>';
 }).join('')+'</div>'+
 '<p class="field-map-status" role="status" aria-live="polite">全部核心关系</p><ol class="field-map-edges">'+graph.edges.map(([from,verb,to,why],i)=>'<li data-concept-edge="'+from+' '+to+'"><div><span class="field-edge-number">'+(i+1)+'. </span>'+link(from)+'<span class="field-map-verb"> — '+safe(verb)+' → </span>'+link(to)+'</div><p>'+safe(why)+'</p></li>').join('')+'</ol>'+
 '<div class="field-map-exercise"><h3>合上页面，串起这些关系</h3><p>'+safe(graph.question)+'</p><details><summary>对照推理</summary><p>'+safe(graph.answer)+'</p></details></div><div class="field-map-outlets"><b>连到其他领域</b>'+graph.outlets.map(([id,why])=>'<p><a href="'+fieldMapURL(id)+'">'+safe(modules.find(m=>m.id===id).name)+' →</a> '+safe(why)+'</p>').join('')+'</div></details></section>';
}
function fieldMapIndexHTML(track){return '<div class="field-map-index"><b>按领域看核心关系</b><p>'+modules.filter(m=>m.track===track&&fieldConceptMaps[m.id]).map(m=>'<a href="'+fieldMapURL(m.id)+'">'+m.n+' '+trainingEscape(m.name)+' →</a>').join('')+'</p></div>';}
function chapterFieldConcepts(a){
 if(chapterConceptSupplements[a.id])return [chapterConceptSupplements[a.id]];
 const found=[];
 for(const moduleId of [a.module,...Object.keys(fieldConceptMaps).filter(id=>id!==a.module)])for(const p of fieldPointRecords(moduleId))if((p.articles||[]).includes(a.id)&&fieldConceptMaps[moduleId].nodes.some(n=>n[0]===p.id))found.push([moduleId,p.id]);
 return found.slice(0,3);
}
function chapterFieldMapLink(a){const [moduleId,id]=chapterFieldConcepts(a)[0]||[];return moduleId?'<a class="chapter-map-link" href="'+fieldMapURL(moduleId,id)+'">在领域图谱中看本章相关概念 →</a>':'';}
function initFieldConceptMaps(){
 for(const map of document.querySelectorAll('[data-field-map]')){
  const graph=fieldConceptMaps[map.dataset.fieldMap],buttons=[...map.querySelectorAll('[data-concept-focus]')];
  const frame=map.querySelector('.training-figure > a');
  if(frame&&frame.scrollWidth>frame.clientWidth)frame.scrollLeft=(frame.scrollWidth-frame.clientWidth)/2;
  const select=(id,keepPosition=false)=>{
   const controls=map.querySelector('.field-map-controls'),before=keepPosition?controls.getBoundingClientRect().top:0;
   const node=graph.nodes.find(n=>n[0]===id),active=node?id:'all';
   for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.conceptFocus===active));
   for(const row of map.querySelectorAll('[data-concept-edge]'))row.hidden=active!=='all'&&!row.dataset.conceptEdge.split(' ').includes(active);
   for(const definition of map.querySelectorAll('[data-concept-definition]'))definition.hidden=active!=='all'&&definition.dataset.conceptDefinition!==active;
   map.querySelector('.field-map-definitions').hidden=active==='all';
   map.querySelector('.field-map-status').textContent=node?'与“'+node[1]+'”直接相关的关系':'全部核心关系';
   if(keepPosition){const delta=controls.getBoundingClientRect().top-before;if(delta)window.scrollTo({top:window.scrollY+delta,behavior:'instant'});}
  };
  for(const button of buttons)button.onclick=()=>select(button.dataset.conceptFocus,true);
  const requested=new URLSearchParams(location.search).get('concept');
  if(graph.nodes.some(n=>n[0]===requested))map.querySelector('.field-map-explorer').open=true;
  map.classList.add('field-map-ready');select(requested);
 }
}
