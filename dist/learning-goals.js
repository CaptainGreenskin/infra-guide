/* Learning goals are views over the same curriculum, never separate copies of lessons.
   Each route adds its real prerequisite closure before offering a next lesson. */
const learningProfiles={
 'cloud-platform':{track:'cloud',label:'云平台与云原生',aim:'能解释应用从资源申请到上线的完整路径，写出部署、配置与交付方案。',targets:['cloud-compute','iam-security','k8s-workloads','scheduling-resources','k8s-networking','k8s-storage','config-secrets','k8s-autoscaling','serverless-execution','terraform-state','gitops-reconciliation','cloud-service-lab'],gate:{
  task:"为一个带持久数据的服务写出发布和回退方案，标明用哪项观察决定继续或停止。",
  checks:[
   {title:"确认用户真的能访问",
    result:"从同一个 Service 请求旧版和新版，对上实际后端、模板修订与响应版本。回退后从原入口再读一次，核对当前 Pod。持久数据另用换 Pod 后的回读验收。",
    primary:["cloud-service-lab","kubernetes-service-run","服务发布与回退实战"],more:[["cloud-service-lab","kubernetes-service-rollout","从原入口核对发布与回退的三次版本"],["serverless-execution","section-2","从执行环境就绪追到报告交付"],["vpc-network","native-dns-cache","旧地址与否定缓存的过期"],["vpc-network","native-dns-connection-handoff","DNS 切换后的旧连接和新连接"],["vpc-network","native-tls-proxy","入口与上游的两段 TLS"],["k8s-workloads","native-pdb-eviction-rollout","驱逐预算与滚动发布"],["config-secrets","native-config-projection","配置更新后的四条读取路径"],["k8s-storage","native-csi-storage","换 Pod 后回读持久卷"],["gitops-reconciliation","gitops-response-evidence","从 Argo CD 记录验收实际响应"]]},
   {title:"定位请求被哪一层拦下",
    result:"先看同一个账号提交普通和特权配置，再对照超配额的 Pod。从授权自查、响应原因和管理员回读判断哪一层拒绝了请求。",
    primary:["iam-security","native-kubernetes-admission","Kubernetes 授权与准入"],more:[["scheduling-resources","quota-admission-forbidden","同为 Forbidden，核对 CPU 配额"],["iam-security","native-spiffe-workload-identity","TLS 握手后的资源授权"],["iam-security","kubernetes-identity-changes","分别核对权限、凭据和会话撤销"],["serverless-execution","broker-ack-business-ledger","消息已确认时核对账本和写入者"]]},
   {title:"确认实际部署的制品",
    result:"核对签名者、版本记录和制品摘要。签名通过但下载到不同字节时，部署应停在现有版本。",
    primary:["delivery","native-release-artifact-trust","签名与制品摘要对照"],more:[["delivery","native-controller-reconcile","控制器重启后的对象和外部记录"],["control-plane-consensus","section-7","重列举与接续观察"]]},
  ]
 }},
 'cloud-sre':{track:'cloud',label:'SRE 与稳定性',aim:'能从用户结果定位瓶颈，算清容量与恢复目标，再验证故障保护。',targets:['cloud-compute','iam-security','tcp-event-loop','database-index-locks','cache-consistency','mysql-recovery','k8s-networking','elasticity','observability','resilience','cloud-service-lab'],gate:{
  task:"为一次用户请求变慢或失败写排障记录，标明证据、处置动作和恢复后的用户结果。",
  checks:[
   {title:"找到请求在哪一段等待或失败",
    result:"用同一个请求编号拼出两个服务的时间线。指出哪份记录能定位单次请求，哪份账本能算整体成功率。入口返回 502 时，再核对后端有没有收到 HTTP 请求。",
    primary:["observability","section-9","两段 HTTP 追踪"],more:[["observability","slo-event-to-trace","沿同一报表任务定位 503"],["incident","incident-connection-lease","区分数据库锁与下游 HTTP 等待"],["cloud-compute","native-qemu-vcpu","从 vCPU 找到宿主排队"],["observability","collector-sampling-check","采集管道与业务账本"],["slo","live-prometheus-burn","计数器归零和长短窗口"],["slo","native-alert-notification","触发、静默与实际收件"],["slo","cpu-quota-sli-events","同一批请求按期限重算成功率"],["network-diagnosis","proxy-502-origin-evidence","沿入口与后端记录定位 502"],["network-diagnosis","curl-no-first-byte","用客户端和监听端区分未建连与无首字节"]]},
   {title:"算清积压何时消失",
    result:"分别算到达量、完成量、积压和拒绝数。用任务编号分清它在入口排队还是在等下游。追平到达速度后仍需额外容量排空积压。再按全部完成数和限时达标数，分别复算每个结果耗费的 CPU 时间。",
    primary:["elasticity","section-7","容量与清空时间"],more:[["elasticity","bounded-queue-downstream-wait","沿任务编号拆开入口和下游等待"],["elasticity","native-cpu-quota-http","对照排队与每个达标请求的 CPU 时间"],["database-index-locks","native-sqlite-shard-routing","数据均衡与单片积压"],["elasticity","proxy-drain-readback","后端排空和客户端读回"]]},
   {title:"恢复后回读业务结果",
    result:"本机实验恢复到提交 103，数据库完整性检查通过，R3 的附件仍缺失。找出最后一个报告和附件都完整的提交，再从应用独立回读。到目标环境时，另记故障发生和用户恢复读写的时刻。",
    primary:["resilience","subsection-5-1dwp2yh","按应用读回核对恢复点"],more:[["resilience","native-haproxy-report-failover","切换后用原入口读回报告和附件"],["resilience","native-kind-r3-node-loss","节点退出后从原入口读回"],["resilience","section-9","运行恢复与外部回执对照"],["cache-consistency","native-redis-client-tracking","断线和迟到的缓存回复"],["cache-consistency","native-redis-replica-promotion","复制确认与副本提升"],["storage-recovery","native-postgres-pitr","PostgreSQL 恢复目标"],["mysql-recovery","mysql-missing-binlog","日志缺段时核对事务回执"]]},
  ]
 }},
 'ai-training':{track:'ai',label:'分布式训练与作业平台',aim:'从一步参数更新出发，讲清训练状态、通信、数据供给、检查点和作业调度。',targets:['gpu-memory','training-communication','data-pipeline','multinode-lab','training-performance','gpu-scheduling','kubernetes-training','training-lab'],gate:{
  task:"交一份训练运行记录。能指出这一步算了哪些样本、哪一步已提交，以及进程失败后从哪里重来。",
  checks:[
   {title:"核对一次参数更新",
    result:"先写清哪些项参与这一步的平均。普通回归按有效样本计数，语言模型按有效目标位置计数。用单进程结果核对合成的梯度，再解释有进程先读完时分母怎样变。",
    primary:["ddp-code","native-ddp-join","不等长 DDP 对照"],more:[["autograd-training","tiny-decoder-rank-update","用同一模型复算两个进程的梯度"],["data-pipeline","sampler-matched-tail","四步同步怎样保留最后一批样本"],["gpu-memory","native-amp-window","有限前向损失与实际跳步"],["gpu-memory","rtx-activation-scaling","同卡复算重计算的显存峰值"],["training-communication","ragged-ring-communication","通信填充与真实位置"]]},
   {title:"按已提交的批次恢复",
    result:"对照加载器已准备的数据和优化器已提交的批次。重启后核对首个样本、动量和连续训练的权重。",
    primary:["data-pipeline","native-prefetch-resume","数据预取与训练恢复"],more:[["checkpoint-recovery","checkpoint-ddp-optimizer-state","模型与优化器状态对应同一步"],["checkpoint-recovery","native-elastic-restart-step","整组重启与检查点"],["checkpoint-recovery","native-ddp-accumulation-restart","累积到一半中断后的回放"],["checkpoint-recovery","native-tiny-decoder-handoff","同一小模型恢复后交给推理"],["checkpoint-recovery","native-mps-checkpoint-resume","单 GPU 恢复的动量和随机状态"],["checkpoint-recovery","native-async-dcp-commit","异步保存时参数属于哪一步"],["checkpoint-recovery","single-gpu-recovery-contrast","单卡在第 4 步退出后恢复"],["training-performance","single-gpu-recovery-timing","更新计时与整段用时"]]},
   {title:"查齐进程和作业状态",
    result:"用本机四进程记录对上样本数、更新次数和恢复状态。迁移到物理两机四卡时，再逐项检查设备绑定、集合通信与共享存储。",
    primary:["multinode-lab","multinode-launch-run","双启动器四进程"],more:[["training-platform","native-training-submission-preflight","提交输入和版本校验"],["gpu-scheduling","native-kueue-admission","配额准入与实际放置"],["kubernetes-training","native-kubernetes-gloo-job","kind 两节点上的共同更新"],["training-communication","native-job-collective-update","用两个 rank 核对样本、梯度和权重"],["multinode-lab","topology-demo","对照三种训练拓扑"],["multinode-lab","native-ddp-target-preflight","物理节点上机预检"],["multinode-lab","ddp-target-record-readback","四份记录通过通信为何仍被拒绝"]]},
  ]
 }},
 'ai-inference':{track:'ai',label:'模型推理与服务',aim:'沿输入、模型计算、历史缓存、请求调度和输出计时理解推理服务。',targets:['position-encoding','roofline-model','model-serving','quantization-serving','inference-performance','ai-lifecycle','speculative-decoding'],gate:{
  task:"交一份推理服务验收表，写清给定输入下的缓存占用、等待时间和发布判定。",
  checks:[
   {title:"核对缓存容量与复用范围",
    result:"用模型形状、数据类型和位置数算缓存的逻辑字节，再核对 K、V 实际引用的存储。复用、逐出或恢复后，根据实际留下的位置修正容量账。相同输入还要核对租户共享范围。",
    primary:["model-serving","section-4","KV 缓存字节算例"],more:[
     ["model-serving","sdpa-cache-storage-bytes","核对 K、V 的逻辑字节和实际引用的存储"],
     ["transformer-block","native-tiny-decoder-context","同一个词元受不同前文影响"],
     ["model-serving","serving-rows-and-history","本轮计算量与缓存容量"],
     ["model-serving","native-inference-prefix","前缀复用与清除"],
     ["position-encoding","native-rope-window-cache","滑窗续算的旋转位置和覆盖顺序"],
     ["model-serving","native-metal-inference","同一请求的 CPU 与 Apple GPU 运算"],
     ["model-serving","rtx-pro-6000-cache-case","单卡缓存计时与显存"],
     ["inference-performance","vllm-v1-request-path","vLLM V1 请求调度源码走读"],
     ["inference-performance","native-vllm-scheduler","vLLM 调度、等待与归还实跑"],
     ["inference-performance","native-vllm-cache-scope","相同词元在不同租户下的排程"],
     ["inference-performance","vllm-block-lifecycle","vLLM 块池 CPU 实跑"],
     ["inference-performance","native-slot-handoff","两进程恢复前缀"]]},
   {title:"分开计时和看吞吐",
    result:"给同一组请求标出入队、开始执行、首词元和后续输出时刻。对照服务端排队和客户端实际等待。",
    primary:["inference-performance","native-inference-queue","真实双请求的排队"],more:[["inference-performance","section-2","逐词元计时"],["inference-performance","native-metal-queue","同一设备批内的两条请求"],["speculative-decoding","native-ngram-speculation","核对验证批、提交和回退"],["inference-performance","native-pd-split","预填充与解码分池"],["inference-performance","tp-placement","八卡副本容量账本"],["speculative-decoding","native-ngram-work-accounting","分别核对批次、前向位置与输出"]]},
   {title:"以实际输出验收版本",
    result:"把健康检查、固定输入的结果和流式请求归属分别核对。候选输出错误时，说明流量应留在哪个版本。",
    primary:["ai-lifecycle","native-model-rollout","真实模型切换"],more:[["model-serving","request-version-binding","核对同输出请求的实际模型版本"],["ai-lifecycle","rollout-kv-reuse-decision","回滚后核对模型与缓存身份"],["quantization-serving","native-int8-batch-quality","动态 INT8 合批质量门槛"],["ai-lifecycle","int8-batch-release-gate","按实际合批条件验收候选"],["ai-lifecycle","section-8","CPU 发布与版本指针"]]},
  ]
 }},
 'ai-operators':{track:'ai',label:'GPU 与算子性能',aim:'从形状、数值和访存账走到实现与性能轨迹；先确认等价，再判断瓶颈。',targets:['position-encoding','autograd-training','flash-attention-io','tensor-parallel-math','operator-profiling'],gate:{
  task:"交一份可复查的算子对照，固定输入和输出判据，再解释性能变化来自哪里。",
  checks:[
   {title:"从调用找到实际执行",
    result:"给定输入形状，先算运算量和读写字节。用一次轨迹定位真正执行的操作，再判断代价来自算子还是构建、导入或重编译。",
    primary:["operator-profiling","operator-profile-run","CPU 算子轨迹"],more:[["operator-profiling","native-python-extension","扩展构建和导入"],["operator-profiling","torch-compile-graph-break","断图与重编译"]]},
   {title:"覆盖完整块和尾块",
    result:"用参考实现逐项比对输出，增加不能整除块大小的输入。对归约和训练分片，再核对填充位置和梯度。",
    primary:["operator-profiling","triton-tail-mask-run","Triton 尾块对照"],more:[["tensor-parallel-math","section-9","两进程输出与梯度"],["tensor-parallel-math","native-dp-tp-mesh","四进程通信分组"],["tensor-parallel-math","native-pipeline-schedules","流水线排程与更新"],["flash-attention-io","context-parallel-row-backward","手算远端位置收到的梯度"],["flash-attention-io","ring-context-training","沿环汇总远端 K/V 梯度"],["flash-attention-io","ragged-ring-training","环形注意力与填充"],["flash-attention-io","native-metal-online-attention","Apple GPU 跨块归一化与尾部掩码"],["flash-attention-io","native-metal-empty-attention-row","空查询行在 GPU 上的实际输出"]]},
   {title:"给计时写明设备和范围",
    result:"固定设备、形状和精度再比较两版用时。说明测的是内核、命令缓冲区还是端到端请求，并列出目标设备还要采哪些数据。",
    primary:["operator-profiling","native-metal-gemm","Apple GPU 同设备矩阵乘法"],more:[
     ["roofline-model","roofline-metal-gemm","从实际计时换算算力"],["operator-profiling","native-metal-softmax","Apple GPU 逐行 Softmax"],["operator-profiling","same-device-gemm","CUDA 同卡对照上机步骤"]]},
  ]
 }},
 'agent-app':{track:'agent',label:'Agent 应用与评估',aim:'先走通受控工具任务，再组织上下文与检索，最后用真实产物验收。',targets:['agent-security','agent-recovery','agent-memory','agent-retrieval','agent-evaluation','agent-observability'],gate:{
  task:"交一份可回读的订单报告，给出实际来源、授权结果和报告金额。",
  checks:[
   {title:"跟踪模型提议怎样变成读取",
    result:"从工具清单和模型提议一路查到资源服务，解释哪两次读到了数据，以及跨租户请求在哪一步被拦下。",
    primary:["agent-runtime","native-model-mcp-tool-choice","模型选工具与资源授权"],more:[]},
   {title:"证明回答用了当前资料",
    result:"两份回答即使金额相同，也要逐项核对实际引用的版本。资料缺失或撤回时，记录宿主是补齐证据、使用默认值还是停止。",
    primary:["agent-retrieval","native-rag-citation-oracle","生成结果与引用版本"],more:[["agent-evaluation","citation-version-check","用原始资料和请求核对引用"],["agent-evaluation","native-model-evaluation-bridge","核对两份模型回答的实际判定"],["agent-retrieval","native-qdrant-retrieval","向量候选、权限与当前版本"],["agent-retrieval","retrieval-revocation-boundaries","从候选、正文到发送分别检查撤权"],["agent-memory","native-memory-withdrawal","偏好撤回与任务快照"]]},
   {title:"用回执和产物验收任务",
    result:"核对报告金额 37、实际读取集合和返回内容。用本机综合实验比较同一个操作 ID 重试和另建 ID 的实际写入数。",
    primary:["production-readiness","integrated-service-run","S3 本机综合实验"],more:[["agent-evaluation","evaluation-read-output-check","分别复核读取记录和返回内容"],["agent-evaluation","approval-at-commit-verdict","核对接收方提交时的权限"],["agent-evaluation","delegation-run-comparison","按同一任务比较分支开销"],["agent-observability","runtime-attempts-and-effects","从同一轮记录数工具尝试和实际结果"],["production-readiness","publication-pointer-effect-count","报告只显示一份时查实际提交次数"]]},
  ]
 }},
 'agent-platform':{track:'agent',label:'Agent 运行平台',aim:'围绕持久状态、执行权限、沙箱、接管与可观测性建立运行时。',targets:['agent-sandbox','durable-workflows','agent-retrieval','agent-observability','kairo-practice','production-readiness'],gate:{
  task:"为一个会暂停、重试和接管的任务写出运行记录，能用资源端证据回答提交了几次、由谁提交。",
  checks:[
   {title:"把执行权限分到正确位置",
    result:"核对进程能读写的文件、可访问的网络和资源服务实际允许的动作。逐层制造一次拒绝，查清哪个环节停止了执行。",
    primary:["agent-sandbox","native-sandbox-container","容器输入与产物边界"],more:[["agent-sandbox","native-sandbox-egress","网络出口与资源授权"],["agent-sandbox","native-sandbox-process-group","停止一组，核对另一组交付"],["agent-sandbox","native-sandbox-docker-lifecycle","检查 Docker 复用与并发回收"],["mcp-protocol","native-mcp-http-authorization","令牌验证和工具授权"],["mcp-protocol","native-mcp-catalog-refresh","工具变更后的批准范围"]]},
   {title:"从补录、审批恢复到发布",
    result:"沿同一份订单报告核对基础 37、补录 5 和新版草稿。重启后逐次核对旧批准为何被拒、匹配批准何时放行，以及接收方是否只写入一份。",
    primary:["durable-workflows","native-model-mcp-recovery","模型修订、批准与跨进程回执"],more:[["durable-workflows","native-model-plan-revision","模型发现缺项后的计划与审批"],["kairo-practice","native-agent-task-reconnect","对照任务重连和业务写入"],["kairo-practice","kairo-resume-evidence","按进程、任务和报告检查续跑"],["kairo-practice","kairo-native-commit-readback","检查本机 Kairo 的回执与来源版本"],["mcp-protocol","mcp-http-cancellation-run","断流、清理和业务提交"],["mcp-protocol","native-mcp-result-receipt","坏回执与原操作查询"],["agent-recovery","recovery-lookup-after-commit","核对同一操作和草稿摘要"],["agent-recovery","section-7","同样的崩溃快照怎样走向两种恢复"],["durable-workflows","mcp-commit-recovery","写入已提交后的恢复"],["durable-workflows","native-approval-reentry","批准后恢复与撤权"],["durable-workflows","delegated-results-boundary","拆分任务与复核结果"],["durable-workflows","native-parallel-merge","并行结果冲突与合并"],["durable-workflows","native-workflow-version-resume","升级后旧批准交给谁"],["durable-workflows","receiver-writer-after-takeover","同一份报告是谁提交的"]]},
   {title:"把链路记录和效果对上",
    result:"分别统计尝试、任务和实际效果。用追踪的起止时间计算调用覆盖了多久，恢复后沿跨追踪链接找回旧尝试，再用独立回执确认资源端效果。",
    primary:["agent-observability","native-mcp-trace-reentry","进程恢复与跨追踪链接"],more:[["agent-observability","otel-r27-interval-coverage","从一次真实追踪计算耗时"],["agent-observability","trace-reentry-ledger-lookup","从最后一条追踪查原回执"],["agent-observability","native-tail-sampling-ledger","采样结果与完整账本"],["agent-observability","native-model-mcp-recovery-observation","用原始记录统计尝试和业务结果"],["kairo-practice","kairo-read-evidence","目标环境的只读验收契约"],["production-readiness","same-total-model-binding","用批准记录核对实际模型版本"]]},
  ]
 }},
};
const learningGoalPractice={
 'cloud-platform':{
  title:'驱逐被拒，还是新版本没就绪',
  prompt:'发布 v2 时，期望有 3 个 Pod，实际只有 2 个就绪。v2 的 Pod 已经运行，健康检查仍未通过。此时维护流程驱逐一份旧 Pod，收到 HTTP 429。先暂停哪项操作？发布卡住的原因又要去哪里查？',
  answer:'先暂停主动驱逐。发布配置允许少 1 个可用副本，当前已到 2 个的下限。中断预算（PDB）要求至少 3 个健康副本，所以这次主动驱逐被拒。发布进度要另外查 v2 的就绪检查，必要时回退。恢复到 3 个就绪后，再从原入口请求，核对实际响应版本。',
  source:['k8s-workloads','native-pdb-eviction-rollout','kubernetes-pdb-rollout/validation.json']
 },
 'cloud-sre':{
  title:'后端排空后，用户收到结果了吗',
  prompt:'代理已停止把新请求交给 B。旧请求的日志出现第 38 条 drain_finished，却还没有看到客户端的读取记录。此时知道哪段连接已经释放？要看到什么才能确认用户收到了结果？',
  answer:'第 37 条表明代理已读完 B 的上游响应，第 38 条表明到 B 的连接池槽位已释放。旧查询 drain-held 的客户端在第 39 条才记录完整读到 200。排查交付时，用同一个请求编号对照这三步。',
  source:['elasticity','proxy-drain-readback','cloud-proxy/validation.json']
 },
 'ai-training':{
  title:'四份归约结果正确，可以开始多机训练吗',
  prompt:'四个进程都收到了 [1, 2, 3, 4]，归约总和都是 10。它们的内核启动标记 boot_tag 相同，通信后端都是 CPU 实验用的 Gloo。此时能证明什么？如果只收到了三份记录，先排查哪一步？',
  answer:'这四份记录验证了本机通信。物理两机四卡还要核对两端机器身份、GPU 绑定和 NCCL 环境。交齐时原程序报告 5 项环境不满足。只交三份时先补齐本次会话的记录，再查看最早的进程异常。',
  source:['multinode-lab','ddp-target-record-readback','ddp-target-preflight/validation.json']
 },
 'ai-inference':{
  title:'推测解码少调一批，前向也更省吗',
  prompt:'同一个请求，两次都提交了 6 个词元。基线的目标模型批次数是 6，推测版是 5。两次提示都用了 11 个位置。查日志，基线各批的行数是 [11,1,1,1,1,1]，推测版是 [11,5,1,1,1]。去掉提示后，两版实际算了几行？',
  answer:'基线算了 5 行，推测版算了 8 行。推测版把多个候选一起送进目标模型，前面的候选被拒后，后面 3 行虽然已经计算，结果仍会被丢弃。要判断延迟是否缩短，还要在相同请求条件下配对计时。',
  source:['speculative-decoding','native-ngram-work-accounting','native-ngram-speculation/native-stderr.log']
 },
 'ai-operators':{
  title:'矩阵乘法更快，先验收哪两件事',
  prompt:'在同一块 Apple GPU 上比较普通版和分块版矩阵乘法。用 17×19×13 核对不满一块的边缘，用 512×512×512 计时。怎样确认分块版算对了？计时能支持哪一级的性能结论？',
  answer:'17×19 的 323 项输出逐项对参考值，末尾 8 个保护值仍是 −777。大矩阵每个命令缓冲区只提交一次内核，记录里普通版与分块版的成对用时比中位数约为 1.60。结论限于该设备、形状和计时范围。',
  source:['operator-profiling','native-metal-gemm','metal-gemm/validation.json']
 },
 'agent-app':{
  title:'报告金额正确，提交也只有一次吗',
  prompt:'任务进程在接收方提交后、保存本地回执前退出。两次恢复最终都显示成功，原入口都读到一份金额 37 的报告。一次沿用原操作键，另一次换了操作键。要查哪份记录才能判断是否重复提交？',
  answer:'按操作键查接收方的提交表。沿用原键只留下 1 条效果和 1 份产物，换键留下 2 条效果和 2 份产物。两次都只有 1 条当前发布记录，因为同一目标只指向一个当前产物。',
  source:['production-readiness','publication-pointer-effect-count','integrated-service/validation.json']
 },
 'agent-platform':{
  title:'工作流回放两次请求，为什么只写入一次',
  prompt:'两个分支都交来一份金额 42 的报告，操作键和正文相同。归并后发布一次，再从发布前的检查点回放。日志里的发送次数、接收回执和实际写入数应该怎样核对？',
  answer:'接收方收到 2 次请求，第一次提交，第二次返回重复，两次回执相同，提交表只有 1 条效果。两个分支若用同一个操作键给出不同正文，则在归并时停止，不向接收方发起发布。',
  source:['durable-workflows','native-parallel-merge','langgraph-parallel-merge/validation.json']
 }
};
function selectedLearningProfile(){
 if(typeof location==='undefined')return null;
 const path=location.pathname?.match(/\/roadmap\/([a-z-]+)\/?$/)?.[1];
 const requested=new URLSearchParams(location.search).get('goal');
 const role=[path,requested].find(key=>Object.hasOwn(learningProfiles,key));
 return role?learningProfiles[role]:null;
}
function trackRoadmapLink(track){
 const profile=selectedLearningProfile();
 const goal=profile?.track===track?Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile):null;
 return goal?{href:'/roadmap/'+goal+'/#learning-goal',label:profile.label+'路线 →'}:
  {href:'/roadmap/?track='+track+'#route-'+track,label:'学习路线 →'};
}
function learningProfileRoute(profile){
 const result=[],seen=new Set(),visiting=new Set();
 function visit(id){if(seen.has(id))return;if(visiting.has(id))throw Error('Learning prerequisite cycle: '+id);visiting.add(id);for(const[dep]of chapterDependencies[id]||[])visit(dep);visiting.delete(id);seen.add(id);result.push(id);}
 profile.targets.forEach(visit);return result;
}
function learningProfilePriority(id,profile){const ids=learningProfileRoute(profile);return profile.targets.includes(id)?'岗位重点':ids.includes(id)?'先修基础':'选学专题';}
function learningProfileGateChapters(profile){
 return profile.gateChapters||[...new Set(profile.gate.checks.flatMap(check=>[check.primary,...check.more].map(([id])=>id)))];
}
function readingArticleURL(id){const profile=selectedLearningProfile();return articleURL(id)+(profile&&learningProfileRoute(profile).includes(id)?'?goal='+Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile):'');}
function learningGoalSelectorHTML(track){
 const candidate=selectedLearningProfile(),current=candidate?.track===track?candidate:null,base='/roadmap/?track='+track;
 return '<nav class="learning-goal-selector" aria-label="按学习目标选择重点"><span class="learning-goal-label" aria-hidden="true">学习路径</span><div class="learning-goal-options"><a href="'+base+'#route-'+track+'" '+(!current?'aria-current="page"':'')+'>完整课程</a>'+Object.entries(learningProfiles).filter(([,p])=>p.track===track).map(([id,p])=>'<a href="/roadmap/'+id+'/#learning-goal" '+(current===p?'aria-current="page"':'')+'>'+p.label+'</a>').join('')+'</div></nav>';
}
function learningGoalEvidenceID(chapter,anchor){return 'goal-evidence-'+chapter+'-'+anchor;}
function learningGoalEvidenceURL(goal,chapter,anchor){return '/article/'+chapter+'/?goal='+goal+'#'+anchor;}
function learningGoalEvidenceKeys(profile){
 return profile.gate.checks.flatMap(({primary,more})=>[primary,...more].map(([chapter,anchor])=>learningGoalEvidenceID(chapter,anchor)));
}
function learningGoalEvidenceReturn(chapter,profile=selectedLearningProfile()){
 if(!profile)return '';
 const anchor=location.hash?.slice(1);
 if(!anchor)return '';
 const id=learningGoalEvidenceID(chapter,anchor);
 const keys=profile.gateEvidence??learningGoalEvidenceKeys(profile);
 if(!keys.includes(id))return '';
 const role=Object.keys(learningProfiles).find(id=>learningProfiles[id]===profile);
 return '/roadmap/'+role+'/#'+id;
}
function learningGoalGateHTML(gate,goal){
 const link=([chapter,anchor,label])=>'<a href="'+learningGoalEvidenceURL(goal,chapter,anchor)+'" id="'+learningGoalEvidenceID(chapter,anchor)+'">'+trainingEscape(label)+' →</a>';
 const rows=gate.checks.map(({title,result,primary,more})=>
  '<li><h4>'+trainingEscape(title)+'</h4><p>'+trainingEscape(result)+'</p><p class="goal-gate-primary">'+link(primary)+'</p>'+
  (more.length?'<details class="goal-gate-more"><summary>展开其他对照（'+more.length+'）</summary><ul>'+more.map(item=>'<li>'+link(item)+'</li>').join('')+'</ul></details>':'')+
  '</li>').join('');
 return '<section class="goal-gate" id="goal-gate" tabindex="-1" aria-labelledby="goal-gate-title"><h3 id="goal-gate-title">学完要交出的结果</h3><p>'+trainingEscape(gate.task)+'</p><ol class="goal-gate-checks">'+rows+'</ol></section>';
}
function learningGoalPracticeHTML(goal){
 const {title,prompt,answer,source:[chapter,anchor,record]}=learningGoalPractice[goal];
 return '<details class="goal-practice goal-gate-more"><summary>先做一题 · '+trainingEscape(title)+'</summary>'+
  '<p id="goal-practice" tabindex="-1">'+trainingEscape(prompt)+'</p>'+
  '<details><summary>核对答案</summary><p>'+trainingEscape(answer)+'</p><p class="path-links">'+
  '<a href="'+learningGoalEvidenceURL(goal,chapter,anchor)+'">查看实验正文 →</a>'+
  '<a href="/labs/'+record+'">查看原始记录 →</a></p></details></details>';
}
function learningGoalHTML(profile){
 if(!profile)return '';
 const route=learningProfileRoute(profile),goal=Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile);
 const start=articleURL(route[0])+'?goal='+goal;
 const actions='<nav class="goal-actions" aria-label="这条路线的入口"><a href="'+start+'">开始第一章 →</a><a href="/roadmap/'+goal+'/#goal-gate">查看三项验收 ↓</a></nav>';
 const chapters=route.map(id=>{
  const a=articleById(id);
  return '<li><a id="goal-chapter-'+id+'" href="'+articleURL(id)+'?goal='+goal+'"><small>'+learningProfilePriority(id,profile)+'</small><span>'+a.number+' '+a.title+'</span></a></li>';
 }).join('');
 return '<section class="learning-goal" id="learning-goal">'+learningGoalSelectorHTML(profile.track)+'<h2>'+profile.label+'</h2><p>'+profile.aim+'</p>'+
  actions+learningGoalPracticeHTML(goal)+'<p class="evidence-note">'+route.length+' 章。先补需要的基础，再读标为岗位重点的章节。</p><ol class="goal-chapters">'+chapters+'</ol>'+
  learningGoalGateHTML(profile.gate,goal)+'</section>';
}
function learningGoalChapterNav(a){
 const profile=selectedLearningProfile();if(!profile)return '';
 const id=Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile),route=learningProfileRoute(profile),index=route.indexOf(a.id);
 const isGateChapter=learningProfileGateChapters(profile).includes(a.id);
 const evidence=learningGoalEvidenceReturn(a.id,profile);
 const gateReturn=evidence?'<a href="'+evidence+'">回到本项验收 →</a>':
  '<a href="/roadmap/'+id+'/#goal-gate">回到这条路线的交付题 →</a>';
 if(index<0)return isGateChapter?
  '<nav class="goal-reading-nav" aria-label="当前岗位验收"><span>“'+profile.label+'”的验收对照</span>'+gateReturn+'</nav>':'';
 const previous=articleById(route[index-1]),next=articleById(route[index+1]);
 let gateLink=isGateChapter?gateReturn:'';
 if(!next&&!evidence)gateLink='<a href="/roadmap/'+id+'/#goal-gate">打开这条路线的交付题 →</a>';
 return '<nav class="goal-reading-nav" aria-label="当前岗位路线"><span>正在按“'+profile.label+'”学习 · '+(index+1)+' / '+route.length+'</span><a href="/roadmap/'+id+'/#learning-goal">查看这条路线</a>'+gateLink+(previous?'<a href="'+readingArticleURL(previous.id)+'">← 上一章：'+previous.number+' '+previous.title+'</a>':'')+(next?'<a href="'+readingArticleURL(next.id)+'">本路线下一章：'+next.number+' '+next.title+' →</a>':'')+'</nav>';
}

// Follow a selected learning route through prose, search and field references.
// An explicit destination goal wins; an unrelated chapter keeps its normal URL.
function learningContextHref(href){
 if(typeof href!=='string'||!href.startsWith('/')||href.startsWith('//'))return href;
 const hashAt=href.indexOf('#'),fragment=hashAt<0?'':href.slice(hashAt),withoutHash=hashAt<0?href:href.slice(0,hashAt);
 const queryAt=withoutHash.indexOf('?'),pathname=queryAt<0?withoutHash:withoutHash.slice(0,queryAt);
 const query=new URLSearchParams(queryAt<0?'':withoutHash.slice(queryAt+1));
 const articleId=pathname.match(/\/article\/([a-z0-9-]+)\/?$/)?.[1],moduleId=pathname.match(/\/module\/([a-z0-9-]+)\/?$/)?.[1];
 const position=/\/roadmap\/?$/.test(pathname)?fragment.match(/^#route-chapter-(cloud|ai|agent)-([a-z0-9-]+)$/):null;
 const labTask=/\/labs\/?$/.test(pathname)&&/^#lab-[a-z0-9-]+$/.test(fragment);
 if(!articleId&&!moduleId&&!position&&!labTask)return href;
 const profile=selectedLearningProfile(),explicitGoal=query.has('goal');
 const currentPath=typeof location==='undefined'?'':location.pathname||'';
 const currentParams=new URLSearchParams(typeof location==='undefined'?'':location.search);
 const currentId=currentPath.match(/\/article\/([a-z0-9-]+)\/?$/)?.[1];
 const currentGate=profile&&currentId&&learningProfileGateChapters(profile).includes(currentId);
 if(labTask){
  if(explicitGoal||query.has('returnGoal')||!profile||query.get('track')!==profile.track)return href;
  query.set('goal',Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile));
  return pathname+'?'+query.toString()+fragment;
 }
 if(position){
  if(explicitGoal||profile?.track!==position[1]||query.get('track')!==position[1])return href;
  const inRoute=learningProfileRoute(profile).includes(position[2]);
  if(!inRoute&&!(currentGate&&currentId===position[2]))return href;
  const goal=Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile);
  query.delete('track');
  const rest=query.toString();
  return pathname.replace(/\/roadmap\/?$/,'/roadmap/'+goal+'/')+(rest?'?'+rest:'')+(inRoute?'#goal-chapter-'+position[2]:'#goal-gate');
 }
 let changed=false;
 if(articleId&&articleId===currentId&&!query.has('fromConcept')&&currentParams.has('fromConcept')){
  query.set('fromConcept',currentParams.get('fromConcept'));
  if(!explicitGoal&&!query.has('returnGoal')&&currentParams.has('returnGoal'))query.set('returnGoal',currentParams.get('returnGoal'));
  changed=true;
 }
 if(moduleId==='practice'){
  const current=articles.find(a=>a.id===currentId);
  const explicitProfile=explicitGoal?learningProfiles[query.get('goal')]:null;
  const track=query.get('track')||explicitProfile?.track||profile?.track||currentParams.get('track')||(current?chapterReadingContext(current).track:null);
  if(track&&Object.hasOwn(trackDefinitions,track)&&!query.has('track')){query.set('track',track);changed=true;}
  if(!explicitGoal&&profile&&profile.track===track){query.set('goal',Object.keys(learningProfiles).find(id=>learningProfiles[id]===profile));changed=true;}
 }else if(!explicitGoal&&profile){
  const matches=articleId?learningProfileRoute(profile).includes(articleId)||(currentGate&&currentId===articleId):modules.some(m=>m.id===moduleId&&m.track===profile.track);
  const goal=Object.keys(learningProfiles).find(id=>learningProfiles[id]===profile);
  if(matches){query.set('goal',goal);changed=true;}
  else if(articleId&&query.has('fromConcept')&&!query.has('returnGoal')){
   const fromField=query.get('fromConcept').split('.')[0],activeField=currentPath.match(/\/module\/([a-z0-9-]+)\/?$/)?.[1];
   if(fromField===activeField&&modules.some(m=>m.id===fromField&&m.track===profile.track)){query.set('returnGoal',goal);changed=true;}
  }
 }
 return changed?pathname+'?'+query.toString()+fragment:href;
}
function practiceArticleForContext(){
 const requested=new URLSearchParams(typeof location==='undefined'?'':location.search).get('track'),track=requested||selectedLearningProfile()?.track;
 return articles.find(a=>a.module==='practice'&&chapterReadingContext(a).track===track)||articles.find(a=>a.module==='practice');
}
