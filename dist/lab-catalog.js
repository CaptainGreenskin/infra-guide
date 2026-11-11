/* Ordered learning tasks. One archive may contain independent experiments in several tracks. */
const labArchiveCatalog={
 'dns-cache':{folder:'dns-cache',title:'本机 DNS 的旧地址与否定缓存到期'},
 'dns-connection-handoff':{folder:'dns-connection-handoff',title:'DNS 更新后的 HTTP 旧连接与新连接'},
 'dual-stack-connect':{folder:'dual-stack-connect',title:'IPv6 建连、IPv4 回退与 HTTP 响应等待'},
 'tiny-decoder-handoff':{folder:'tiny-decoder-handoff',title:'同一小模型的训练、恢复与独立推理'},
 'tiny-decoder-forward':{folder:'tiny-decoder-forward',title:'同一词元在两段前文中的实际计算'},
 'rope-window-cache':{folder:'rope-window-cache',title:'RoPE 滑窗续算与四槽循环覆盖'},
 'mps-checkpoint-resume':{folder:'mps-checkpoint-resume',title:'Apple GPU 训练的动量与设备随机状态恢复'},
 'vllm-cache-scope':{folder:'vllm-cache-scope',title:'同一输入在不同租户缓存范围中的实际调度'},
 'model-mcp-recovery':{folder:'model-mcp-recovery',title:'模型草稿、MCP HTTP 发布与独立回执恢复'},
 'qemu-vcpu':{folder:'qemu-vcpu',title:'从 QMP 的 vCPU 编号定位 Linux 宿主排队'},
 'sqlite-shard-routing':{folder:'sqlite-shard-routing',title:'分片路由、跨片聚合与热键'},
 'async-dcp-commit':{folder:'async-dcp-commit',title:'异步检查点的内存快照与提交'},
 'model-plan-revision':{folder:'model-plan-revision',title:'模型发现缺项后的计划、审批和恢复'},
 'release-artifact-trust':{folder:'release-artifact-trust',title:'同一签名记录和不同制品字节'},
 'prefetch-resume-step':{folder:'prefetch-resume-step',title:'数据预取和已提交训练步'},
 'memory-withdrawal':{folder:'memory-withdrawal',title:'偏好撤回、任务快照与实际发送'},
 'kubernetes-admission':{folder:'kubernetes-admission',title:'Kubernetes 授权与对象准入'},
 'native-slot-handoff':{folder:'native-slot-handoff',title:'两个推理进程之间交接历史缓存'},
 'rag-citation-oracle':{folder:'rag-citation-oracle',title:'答案金额相同，如何核对引用版本'},
 'redis-replica-promotion':{folder:'redis-replica-promotion',title:'Redis 复制确认与手动提升'},
 'metal-gemm':{folder:'metal-gemm',title:'Apple GPU 上的逐元素与分块矩阵乘法'},
 'metal-softmax':{folder:'metal-softmax',title:'Apple GPU 上的逐行 Softmax 与线程组归约'},
 'metal-online-attention':{folder:'metal-online-attention',title:'Apple GPU 上的分块归一化与加权汇总'},
 'model-mcp-tool-choice':{folder:'model-mcp-tool-choice',title:'本地模型选择工具与 MCP 读取权限'},
 'pipeline-schedules':{folder:'pipeline-schedules',title:'两阶段流水线训练与全批梯度对照'},
 'dp-tp-mesh':{folder:'dp-tp-mesh',title:'四进程 DP 和 TP 分组与梯度对照'},
 'workflow-version-resume':{folder:'workflow-version-resume',title:'工作流升级后旧审批的恢复'},
 'controller-reconcile':{folder:'controller-reconcile',title:'Kubernetes 自定义控制器的重试与删除'},
 'elastic-restart-step':{folder:'elastic-restart-step',title:'torchrun 自动重启与未提交训练步'},
 'agent-task-reconnect':{folder:'agent-task-reconnect',title:'提交响应丢失后认回原任务'},
 'alert-notification':{folder:'alert-notification',title:'规则触发、分组等待、静默与实际收件'},
 'cpu-quota-http':{folder:'cpu-quota-http',title:'同一 HTTP 负载下的两档 Linux CPU 配额'},
 'inference-placement':{folder:'inference-placement',title:'八卡推理账本与四进程张量并行'},
 'mcp-result-receipt':{folder:'mcp-result-receipt',title:'写入已提交，按原操作查询 MCP 回执'},
 'postgres-pitr':{folder:'postgres-pitr',title:'同一份 PostgreSQL 基础备份与两种 WAL 恢复目标'},
 'sandbox-egress':{folder:'sandbox-egress',title:'工作进程、受控出口与私有对象服务'},
 'torch-compile-graph':{folder:'torch-compile-graph',title:'TorchDynamo 断图、张量条件与输入守卫'},
 'pd-split':{folder:'pd-split',title:'预填充与解码分池、缓存交接和输出间隔'},
 'incident-connection-lease':{folder:'incident-connection-lease',title:'连接等待、SQLite 锁与外部 HTTP'},
 'ddp-target-preflight':{folder:'ddp-target-preflight',title:'两机四卡上机前的设备身份与集合通信检查'},
 'bounded-worker-queue':{folder:'bounded-worker-queue',title:'有界队列、工作线程与下游许可'},
 'warp-memory-sectors':{folder:'warp-memory-sectors',title:'同一矩阵的 lane 地址与扇区归组'},
 'http-operation-retry':{folder:'http-operation-retry',title:'真实 HTTP 超时、重试与数据库回执'},
 'training-submission-preflight':{folder:'training-submission-preflight',title:'训练提交、输入摘要与启动前校验'},
 'kubernetes-gloo-job':{folder:'kubernetes-gloo-job',title:'同一 Indexed Job 的双节点 CPU/Gloo 更新'},
 'process-wait-accounting':{folder:'process-wait-accounting',title:'管道读等待、子进程回收与 CPU 记账'},
 'training-useful-tokens':{folder:'training-useful-tokens',title:'有效 token、填充计算与实际 CPU 训练计时'},
 'int8-batch-quality':{folder:'int8-batch-quality',title:'动态 INT8 合批、分类门槛与前向计时'},
 'kubernetes-pdb-rollout':{folder:'kubernetes-pdb-rollout',title:'Kubernetes 驱逐、直接删除与滚动更新'},
 'ddp-uneven-join':{folder:'ddp-uneven-join',title:'DDP 输入耗尽、归约分母与动量恢复'},
 'mcp-catalog-refresh':{folder:'mcp-catalog-refresh',title:'MCP 工具目录变化、批准与写入边界'},
 'tls-proxy-hops':{folder:'tls-proxy-hops',title:'HTTPS 代理两段身份与连接复用'},
 'triton-tail-mask':{folder:'triton-tail-mask',title:'Triton 尾部掩码、归一化与独立参考'},
 'mcp-trace-reentry':{folder:'mcp-trace-reentry',title:'进程恢复后的跨度链接、MCP 传播与独立回执'},
 'prometheus-live-burn':{folder:'prometheus-live-burn',title:'真实抓取、计数器归零与长短窗告警状态'},
 'python-extension-loader':{folder:'python-extension-loader',title:'CPython 扩展编译、链接、导入和动态依赖'},
 'langgraph-parallel-merge':{folder:'langgraph-parallel-merge',title:'并行提议的冲突归并、检查点重放与接收方回执'},
 'redis-client-tracking':{folder:'redis-client-tracking',title:'Redis 回复、失效推送与迟到的回填'},
 'native-amp-window':{folder:'native-amp-window',title:'两个微批的混合精度反向、跳步与恢复'},
 'qdrant-retrieval':{folder:'qdrant-retrieval',title:'真实向量候选、租户过滤与当前来源验收'},
 'spiffe-workload-identity':{folder:'spiffe-workload-identity',title:'SPIRE 工作负载证明、双向 TLS 与资源授权'},
 'native-model-rollout':{folder:'native-model-rollout',title:'真实模型输出门禁、流绑定与版本回退'},
 'mcp-http-authorization':{folder:'mcp-http-authorization',title:'MCP HTTP 令牌校验与工具资源授权'},
 'jetstream-redelivery':{folder:'jetstream-redelivery',title:'同一事件重投，仍存活的旧写入者与接收方代际'},
 'vllm-block-lifecycle':{folder:'vllm-block-lifecycle',title:'运行固定 vLLM 块池，观察引用、空闲与驱逐'},
 'vllm-scheduler':{folder:'vllm-scheduler',title:'运行固定 vLLM 调度器，跟踪命中、等待与归还'},
 'mcp-http-cancellation':{folder:'mcp-http-cancellation',title:'MCP HTTP 断流、工具清理与提交回执'},
 'native-inference-prefix':{folder:'native-inference-prefix',title:'原生推理槽的前缀复用与清除'},
 'ragged-ring':{folder:'ragged-ring',title:'不等长环形注意力与填充负例'},
 'otel-tail-ledger':{folder:'otel-tail-ledger',title:'真实尾部采样与独立业务账本'},
 'approval-reentry':{folder:'approval-reentry',title:'批准、撤权、接收方事务与崩溃后查回执'},
 'native-inference-queue':{folder:'native-inference-queue',title:'单槽排队、双槽共存与实际流式事件'},
 'native-metal-queue':{folder:'native-metal-queue',title:'两条请求怎样共用一个真实 Metal 计算批次'},
 'native-ngram-speculation':{folder:'native-ngram-speculation',title:'真实推测解码的接受、修正与缓存回退'},
 'kueue-admission':{folder:'kueue-admission',title:'原生 Kueue 额度、Pod 绑定与作业输出'},
 'native-expert-parallel':{folder:'native-expert-parallel',title:'专家分片、非等长收发与原位梯度'},
 'kubernetes-hpa':{folder:'kubernetes-hpa',title:'从 CPU 指标到就绪副本的原生伸缩链'},
 'sandbox-container':{folder:'sandbox-container',title:'非 root 容器的只读输入与报告验收'},
 'sandbox-process-group':{folder:'sandbox-process-group',title:'两组并行任务的停止与独立回读'},
 'kubernetes-config':{folder:'kubernetes-config',title:'同一 ConfigMap 版本的四条应用读取路径'},
 'prefix-attention':{folder:'prefix-attention',title:'前缀、因果和错误平移掩码的 SDPA 对照'},
 'csi-storage':{folder:'csi-storage',title:'原生 CSI 动态供应、挂载与回收'},
 'fsdp-reshard':{folder:'fsdp-reshard',title:'原生 FSDP 检查点跨分片恢复'},
 'innodb':{folder:'innodb',title:'原生 InnoDB 执行树与事务锁'},
 'native-fsdp':{folder:'native-fsdp',title:'原生 FSDP 的参数片、梯度与 Adam 状态'},
 'encoder-decoder':{folder:'encoder-decoder',title:'从源句到目标译文的 Transformer'},
 'kubernetes-network-policy':{folder:'kubernetes-network-policy',title:'Cilium 实测入站、出站和 DNS'},
 'mcp-recovery':{folder:'mcp-recovery',title:'真实 MCP 提交与工作流崩溃恢复'},
 'context-parallel':{folder:'context-parallel',title:'两进程因果注意力与位置对照'},
 'native-inference':{folder:'native-inference',title:'真实推理引擎与前缀复用'},
 'native-metal-inference':{folder:'native-metal-inference',title:'同一条推理请求的 CPU 与 Apple GPU 对照'},
 'ring-context-training':{folder:'ring-context-training',title:'环形注意力前向与梯度归还'},
 'gemm-variants':{folder:'gemm-variants',title:'CUDA GEMM 三种线程映射'},
 'integrated-service':{folder:'integrated-service',title:'HTTP任务、CPU模型与独立效果恢复'},
 'multinode-launch':{folder:'multinode-launch',title:'两启动器、四进程训练与恢复对照'},
 'cuda-core':{folder:'cuda-core',title:'CUDA线程、归约与分块实现'},
 'torch-checkpoint':{folder:'torch-checkpoint',title:'PyTorch原生分布式检查点'},
 'sdpa-cache':{folder:'sdpa-cache',title:'同模型SDPA缓存生成'},
 'langgraph-workflow':{folder:'langgraph-workflow',title:'真实工作流暂停与新进程恢复'},
 'kubernetes-service':{folder:'kubernetes-service',title:'原生Service请求、探针与模板回退'},
 'kubernetes-identity':{folder:'kubernetes-identity',title:'原生ServiceAccount与RBAC'},
 'etcd-consensus':{folder:'etcd-consensus',title:'三成员共识、分区与恢复观察'},
 'mysql-replication':{folder:'mysql-replication',title:'真实读视图、复制与计划切换'},
 'mcp-protocol':{folder:'mcp-protocol',title:'真实MCP SDK、版本与调用生命周期'},
 'cloud-proxy':{folder:'cloud-proxy',title:'HTTP代理、连接复用与受限重试'},
 'inference-cache':{folder:'inference-cache',title:'物理缓存块、共享与调度'},
 'agent-planning':{folder:'agent-planning',title:'计划、事实与持久等待'},
 'manual-sharding':{folder:'manual-sharding',title:'双进程手工状态分片'},
 'delivery-systems':{folder:'delivery-systems',title:'消息确认、Terraform状态与真实GitOps'},
 'runtime-scheduling':{folder:'runtime-scheduling',title:'真实容器限制与kind调度'},
 'speculative-decoding':{folder:'speculative-decoding',title:'精确采样与CPU缓存验证'},
 'agent-crash-windows':{folder:'agent-crash-windows',title:'六个真实进程崩溃窗口'},
 'agent-boundaries':{folder:'agent-boundaries',title:'授权提交与完整上下文预算'},
 'operators-routing':{folder:'operators-routing',title:'C算子、CPU轨迹与MoE路由'},
 'transport-recovery':{folder:'transport-recovery',title:'Linux epoll 与 MySQL 按点恢复'},
 'mechanism-walkthroughs':{folder:'mechanism-walkthroughs',title:'路由、控制循环、张量与历史跟读'},
 'compute-and-transport':{folder:'compute-and-transport',title:'CPU 记账与 TCP 背压'},
 'textbook-examples':{folder:'textbooks',title:'基础原理代码'},
 'learning-mechanisms':{folder:'learning-mechanisms',title:'消息边界、状态提交与工具回执'},
 'network-input-tools':{folder:'network-input-tools',title:'TLS、训练输入与工具执行'},
 'storage-quant-context':{folder:'storage-quant-context',title:'卷、WAL、量化与上下文'},
 'cloud-native':{folder:'cloud-native',title:'事件重投与容量'},
 'cloud-deepening':{folder:'cloud-deepening',title:'恢复、批处理与交付'},
 'leases-placement-sandbox':{folder:'leases-placement-sandbox',title:'可见性、整组放置与子进程'},
 'recovery-artifacts-retrieval':{folder:'recovery-artifacts-retrieval',title:'一致恢复、模型产物与中文检索'},
 'config-memory-evaluation':{folder:'config-memory-evaluation',title:'配置、张量状态与评估统计'},
 'scaling-collectives-traces':{folder:'scaling-collectives-traces',title:'弹性、集合通信与 OTel'},
 'cloud-operations':{folder:'cloud-operations',title:'授权、容量与 SRE'},
 'serving-consistency':{folder:'serving-consistency',title:'缓存、推理调度与检索交付'},
 'incident-model':{folder:'incident-model',title:'连接池等待模型',record:'report.json'},
 'infra-systems':{folder:'systems',title:'HTTP、数据提交与 Agent 恢复'},
 'attention-mechanics':{folder:'attention',title:'Attention 与有效目标'},
 'ddp-one-step':{folder:'ddp-step',title:'DDP 单步对照'},
 'update-and-cancel':{folder:'update-and-cancel',title:'更新窗口与取消回执'},
 'ai-agent-systems':{folder:'ai-agent-systems',title:'GQA、全局梯度与任务效果'},
 'training-capstone':{folder:'training-capstone',title:'两进程完整恢复'},
 'cloud-training-ddp':{folder:'ddp',title:'DDP 与两节点手册'},
 'storage-parallel-acceptance':{folder:'storage-parallel-acceptance',title:'范围读取、两进程 TP 与记录验收'},
 'supervision-gradients':{folder:'supervision-gradients',title:'标签、共享词表与目标权重'},
 'sql-paths-snapshots':{folder:'sql-paths-snapshots',title:'索引路径与快照重试'},
 'streamed-tool-calls':{folder:'streamed-tool-calls',title:'流式参数、事件边界与工具准入'}
};
const labTrackCatalog={
 cloud:{name:'Cloud Infra',lead:'先分清资源与请求，再验证数据、事件、交付和恢复。先修实验按需补；正文中的系统知识点在案例之前。'},
 ai:{name:'AI Infra',lead:'先用标准库算清 Attention，再进入 CPU 两进程、输入、状态与产物；最后按手册走向真实 GPU。'},
 agent:{name:'Agent Infra',lead:'先验证授权与工具效果，再处理重试、状态、检索和评估。实验包含本机 Qwen 模型通过 MCP 读取数据、写入报告。Kairo 接入按目标版本验收。'}
};
const labLearningCatalog=[
 {id:'cloud-dns-cache',track:'cloud',stage:2,title:'权威已更新，旧地址和不存在何时消失',chapter:'vpc-network',anchor:'native-dns-cache',pack:'dns-cache',files:['dns_cache.py'],env:'Python 3.9+ · Unbound · dig',kind:'本机权威端与解析器实跑',observe:'分别核对直接查询和缓存查询的地址、状态与 TTL，再看哪份缓存先到期。',scope:'两个回环 DNS 进程与固定记录。'},
 {id:'cloud-dns-connection-handoff',track:'cloud',stage:2,title:'DNS 已返回新地址，旧连接还把请求送给谁',chapter:'vpc-network',anchor:'native-dns-connection-handoff',pack:'dns-connection-handoff',files:['dns_connection_handoff.py'],env:'Python 3.9+ · Unbound · dig · Linux 回环',kind:'实际 DNS 回答与 HTTP/1.1 连接',observe:'等解析器返回新地址，再比较旧连接与新建连接的实际对端，按请求编号和连接编号核对服务端记录。',scope:'两个本机 DNS 进程和两个回环 HTTP 服务，由程序按解析结果选择新连接的地址。'},
 {id:'cloud-dual-stack-connect',track:'cloud',stage:2,title:'IPv6 建连被拒和 HTTP 等待，哪种会回退',chapter:'vpc-network',anchor:'native-dual-stack-connect',pack:'dual-stack-connect',files:['dual_stack_connect.py'],env:'Python 3 · macOS curl 8.7.1 / Ubuntu 24.04 curl 8.5.0 · 双栈回环',kind:'实际双栈 TCP 与 HTTP',observe:'对照 IPv6 成功、拒绝后回退、仅 IPv6 拒绝及建连后的响应超时，核对客户端和两个监听端的实际记录。',scope:'用 --resolve 提供固定候选地址，本机回环。用于判断故障阶段，公网 DNS 和其他客户端需要各自验证。'},
 {id:'ai-vllm-cache-scope',track:'ai',stage:2,title:'相同词元在两个租户下会复用几格',chapter:'inference-performance',anchor:'native-vllm-cache-scope',pack:'vllm-cache-scope',files:['cache_scope.py'],env:'Python 3.12 · 固定 vLLM 调度实验包',kind:'原始调度与哈希代码的 CPU 实跑',observe:'对照同租户、服务端按身份赋值和直接转发提交值三种情况下的前缀哈希与排程。',scope:'身份与模型输出为固定输入。'},
 {id:'agent-model-mcp-recovery',track:'agent',stage:2,title:'发布已提交但原进程没收到回复，怎样恢复',chapter:'durable-workflows',anchor:'native-model-mcp-recovery',pack:'model-mcp-recovery',files:['model_mcp_recovery.py','requirements.txt'],env:'Python 3.12 · MCP SDK · 固定本机模型与运行时',kind:'真实模型提议、独立 HTTP 接收与故障恢复',observe:'终止原工作进程后核对两份数据库，再查新进程是否沿原操作取到唯一回执。',scope:'本机多进程、固定模型与测试批准。'},
 {id:'cloud-cpu',track:'cloud',stage:1,title:'CPU 时间与请求等待是两笔账',chapter:'cloud-compute',pack:'compute-and-transport',files:['cpu_and_wall.py'],env:'Python 3.9+ · 标准库',kind:'本机执行',observe:'比较墙钟、进程 CPU 与两线程的总 CPU；解释等待为何不等于计算。',scope:'线程与计时实际执行；没有创建虚拟机或修改 cgroup。'},
 {id:'cloud-qemu-vcpu',track:'cloud',stage:2,title:'vCPU 运行得慢，时间花在执行还是排队',chapter:'cloud-compute',anchor:'native-qemu-vcpu',pack:'qemu-vcpu',files:['vcpu_probe.py'],env:'Python 3.8+ · QEMU · Linux schedstats',kind:'真实 QEMU 和 Linux 宿主线程记录',observe:'从 QMP 的顶层 thread-id 找到 Linux schedstat，算出加入竞争前后的执行与排队增量。',scope:'Linux TCG 测量与 macOS QMP 对照。KVM、客户机和业务吞吐另验。'},
 {id:'cloud-foundations',track:'cloud',stage:0,title:'按需补：内存、锁、SQL 与缓存',chapter:'virtual-memory-oom',pack:'textbook-examples',folder:'cloud-foundations',files:['virtual-memory-oom.py','concurrency-pools.py','database-index-locks.py','cache-consistency.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'基础模型与 SQL',observe:'分别对照内存事件、锁排队、查询计划和旧缓存回填；不要把四个小程序当成同一个系统。',scope:'SQL 真实执行；内存与排队等使用明确的教学模型。'},
 {id:'cloud-framing',track:'cloud',stage:1,title:'一次 recv 不等于一条消息',chapter:'network-diagnosis',pack:'learning-mechanisms',files:['tcp_framing.py'],env:'Python 3.9+ · 标准库',kind:'本机 TCP',observe:'实际分段发送中文消息，再按长度解帧；半关闭后仍能收到响应。',scope:'回环连接，不测物理链路、丢包或拥塞窗口。'},
 {id:'cloud-backpressure',track:'cloud',stage:1,title:'发送缓冲满后，谁在等待',chapter:'network-diagnosis',pack:'compute-and-transport',files:['socket_backpressure.py'],env:'Python 3.9+ · 标准库',kind:'本机 TCP',observe:'暂停接收、观察短写与阻塞，再排空并核对全量字节摘要。',scope:'应用与套接字背压实测；不把发送成功解释为对端已处理。'},
 {id:'cloud-native-epoll',track:'cloud',stage:1,title:'一次ET通知后，应用还欠几次读取',chapter:'tcp-event-loop',anchor:'native-epoll-run',pack:'transport-recovery',files:['epoll_ready.py'],env:'Linux · Python 3.9+ · 标准库',kind:'真实Linux epoll',observe:'比较LT/ET、读预算下的应用队列，以及无待发数据时的可写通知。',scope:'公共Linux CI实际执行；管道和套接字夹具，不是生产服务器性能。'},
 {id:'cloud-timing',track:'cloud',stage:1,title:'同样的 150 毫秒，放在响应头前或正文前',chapter:'network-diagnosis',anchor:'network-timing-lab',folder:'network-timing',files:['timing_lab.py'],env:'Python 3 + curl',kind:'本机 HTTP',observe:'比较首字节与完整响应时间，识别请求到底在哪个阶段等待。',scope:'固定注入等待；不是公网 RTT 或业务性能基准。'},
 {id:'cloud-tls',track:'cloud',stage:1,title:'TCP、证书名和 HTTP Host 分别验证',chapter:'vpc-network',pack:'network-input-tools',files:['tls_identity.py'],env:'Python 3.9+ + openssl 命令',kind:'本机 TLS / HTTP',observe:'分别制造不可信 CA、证书名错误和 Host 错误；最后一项可以 TLS 成功、HTTP 返回 421。',scope:'显式信任临时 CA，只连接回环地址；未验证真实 DNS 或负载均衡。'},
 {id:'cloud-ranges',track:'cloud',stage:2,title:'整分片少请求，范围读取少无用字节',chapter:'training-storage',pack:'storage-parallel-acceptance',files:['shard_range.py'],env:'Python 3.9+ · 标准库',kind:'真实 HTTP 与索引校验',observe:'同样五个样本，比较整分片 3 次/768 B 与范围 5 次/320 B；再拒绝对象变化、错误偏移与越界。',scope:'小实验每样本64字节；55秒/5.5秒另属声明模型，不是云存储性能。'},
 {id:'cloud-volume',track:'cloud',stage:2,title:'主文件存在，卷里的数据就完整了吗',chapter:'k8s-storage',pack:'storage-quant-context',files:['wal_backup.py','volume_writer.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'本机文件与数据库',observe:'比较只复制主文件与一致备份，再让两次独立进程使用同一持久计数文件。',scope:'SQLite 与文件实测；附带的 Kubernetes 配置尚未在 CSI 集群运行。'},
 {id:'cloud-event',track:'cloud',stage:2,title:'提交后进程退出，重投是否多写一笔',chapter:'serverless-execution',pack:'cloud-native',files:['verify.py','event_worker.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'真实子进程退出',observe:'在业务与去重记录（inbox）同事务提交后退出，再重投相同业务事件，核对尝试数与效果数。',scope:'本机进程和数据库；没有调用真实云函数或队列。'},
 {id:'cloud-visibility',track:'cloud',stage:2,title:'消息可见性、旧回执与部分批响应',chapter:'serverless-execution',pack:'leases-placement-sandbox',files:['visibility_receipts.py','batch_response_reference.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'队列参考与策略模型',observe:'旧执行者在超时后仍可能写入；再比较正常部分响应、吞异常、整批失败与先进先出（FIFO）首错停止。',scope:'队列时钟和四种结果为声明输入；不是 SQS/Lambda 兼容实现。'},
 {id:'cloud-config',track:'cloud',stage:2,title:'完整配置快照与分阶段凭据轮换',chapter:'config-secrets',anchor:'subsection-7-wkh4cz',pack:'config-memory-evaluation',files:['config_snapshots.py','credential_rotation.py'],env:'Python 3.9+ · POSIX · 标准库',kind:'文件、进程与 HTTP',observe:'复现混合字段和旧文件描述符；先双版本可用，再切客户端、撤旧凭据与旧会话。',scope:'本机配置与认证夹具；未模拟 kubelet 或真实身份平台传播。'},
 {id:'cloud-native-config-projection',track:'cloud',stage:2,title:'同一个 Pod 里，为什么只有一个入口读到新配置',chapter:'config-secrets',anchor:'native-config-projection',pack:'kubernetes-config',files:['config_projection_lab.py'],env:'Linux Docker · kind 0.33.0 · Kubernetes 1.35.8 · Python 3',kind:'真实 ConfigMap 投影与 Pod 替换',observe:'关联 API 版本、容器身份和文件 inode，再核对重开路径、旧文件句柄、subPath 与启动环境。',scope:'单节点 kind 与一个 ConfigMap 键的实际观察。'},
 {id:'cloud-sql-paths',track:'cloud',stage:2,title:'相同五条结果，分别验证定位、排序与覆盖',chapter:'database-index-locks',anchor:'sql-plan-lab',pack:'sql-paths-snapshots',files:['query_paths.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'真实 SQL 与原始查询计划',observe:'比较四种索引与表达式排序；分开输入分布、返回行和 N=1 进度回调，不把它们当成同一个成本。',scope:'240 行固定夹具，不测磁盘 I/O、时延或 MySQL 性能。'},
 {id:'cloud-sql-snapshot',track:'cloud',stage:2,title:'旧快照写失败后，重试 SQL 还是重做判断',chapter:'database-index-locks',anchor:'sql-snapshot-lab',pack:'sql-paths-snapshots',files:['snapshot_retry.py'],env:'Python 3.9+ · 标准库 / SQLite WAL',kind:'两个独立连接的实际交错事务',observe:'读到100、补货提交110后让旧快照写入失败；回滚后重新核对得105，照搬旧值虽可提交却只剩95。',scope:'一进程本地 WAL，不把单写者或517推广为 InnoDB 锁协议。'},
 {id:'cloud-cache',track:'cloud',stage:2,title:'缓存失效事件丢了或乱序，怎样补上',chapter:'cache-consistency',pack:'serving-consistency',files:['cache_outbox.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'本机事务与重投',observe:'源端提交后退出，恢复待发事件（outbox）；重复和乱序事件不能使新版本退回旧值。',scope:'固定缓存协议，不代表所有缓存与数据库间天然原子。'},
 {id:'cloud-hpa',track:'cloud',stage:2,title:'HPA 分母、指标缺失与扩容延迟',chapter:'k8s-autoscaling',pack:'scaling-collectives-traces',files:['scaling_reference.py','prometheus_cpu.py'],env:'Python 3.9+；规则另需 promtool 3.5.0',kind:'计算模型 + 真实规则引擎',observe:'先手算不同资源请求量（request）的加权利用率，再核对缺指标和积压；真实 promtool 区分零值与无序列。',scope:'特定版本计算参考，不运行 metrics-server、HPA 或节点扩容。'},
 {id:'cloud-native-hpa',track:'cloud',stage:2,title:'HPA 已要求两个副本，为什么仍只有一个可用',chapter:'k8s-autoscaling',anchor:'native-hpa-control',pack:'kubernetes-hpa',files:['hpa_control_lab.py'],env:'Linux Docker · kind 0.33.0 · Kubernetes 1.35.8 · metrics-server 0.9.1',kind:'原生指标 API、HPA 与 Pod 状态',observe:'追踪实际 CPU 负载、伸缩建议、Deployment 目标、Pod 就绪和卸载后的缩容。',scope:'单节点 kind、固定 CPU 负载与人为就绪门槛。'},
 {id:'cloud-identity',track:'cloud',stage:2,title:'认证通过后，还要按资源归属授权',chapter:'iam-security',pack:'cloud-operations',files:['authorization_http_lab.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'本机 HTTP',observe:'核对 14 组允许、跨租户、过期、伪造和撤销用例，直接检查业务写入与审计。',scope:'受限 HMAC 能力凭据夹具，不是 JWT/OIDC 或生产认证库。'},
 {id:'cloud-capacity-flow',track:'cloud',stage:2,title:'扩容空窗、积压、拒绝与清空',chapter:'elasticity',anchor:'section-8',pack:'cloud-operations',files:['capacity_lab.py'],env:'Python 3.9+ · 标准库',kind:'可运行容量模型',observe:'分别核对无限缓冲和上限 160 时的积压、拒绝数与清空时刻。',scope:'固定到达与服务能力的连续时间模型。'},
 {id:'cloud-sre',track:'cloud',stage:2,title:'容量守恒、用户结果与 SLO 告警',chapter:'slo',pack:'cloud-operations',files:['capacity_lab.py','telemetry_lab.py','promtool_lab.py'],env:'Python 3.9+；规则另需 promtool 3.5.0',kind:'模型 + 本机 HTTP + 规则',observe:'分别算准入与积压、跟踪两服务请求，再用七组序列验证聚合、无流量和长短窗。',scope:'本机 HTTP 与真实规则求值；不是生产流量、抓取服务或告警通知。'},
 {id:'cloud-mysql-pitr',track:'cloud',stage:2,title:'金额125正确，恢复历史仍可能缺一笔',chapter:'mysql-recovery',anchor:'mysql-pitr-run',pack:'transport-recovery',files:['mysql_restore.py','Dockerfile.tools'],env:'Linux/macOS · 本地Docker引擎 · Python 3.9+',kind:'真实MySQL 8.4容器',observe:'核对基线、全量历史、缺首段、正确按点恢复与后续写入；另做进程崩溃对照。',scope:'公共Linux CI实测；未验证物理断电、主从切换或跨区域云服务。'},
 {id:'cloud-delivery',track:'cloud',stage:3,title:'保存的 Terraform 计划与 GitOps 调谐',chapter:'delivery',pack:'cloud-deepening',files:['terraform_lab.py','gitops_model.py','main.tf'],env:'Python 3.9+ + Terraform 1.13.0',kind:'真实 CLI + 调谐模型',observe:'验证旧计划、状态推进后的陈旧计划拒绝；另用模型区分同步、健康、自愈和清理。',scope:'Terraform 本地 state 与内建 provider 实测；Argo CD 尚未同步集群。'},
 {id:'cloud-recovery',track:'cloud',stage:3,title:'数据库恢复后，附件与外部通知也要对得上',chapter:'resilience',anchor:'section-9',pack:'recovery-artifacts-retrieval',files:['consistent_recovery_cut.py','recovered_effects.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'实际备份与 HTTP',observe:'缺一个附件时回退到完整提交前缀；应用备份恢复后沿原业务 ID 查询外部回执。',scope:'时间点为题设，日志是应用协议；不是数据库物理 WAL 或跨区容灾。'},
 {id:'cloud-incident',track:'cloud',stage:3,title:'SQL 慢与持连接等待，为什么曲线一样',chapter:'incident',pack:'incident-model',files:['incident_model.py'],env:'Python 3.9+ · 标准库',kind:'确定性排队模型',observe:'保持到达序列、连接数不变，分别移动 SQL 和外部等待，比较相同延迟背后的不同原因。',scope:'整数事件模型，不执行真实 SQL 等待或压力测试。'},
 {id:'cloud-native-service',track:'cloud',stage:3,title:'同一Service入口，核对探针、发布与回退',chapter:'cloud-service-lab',anchor:'kubernetes-service-normal',pack:'kubernetes-service',files:['service_lab.py','README.md'],env:'Linux · 本机Docker · kind 0.33.0 · Kubernetes 1.35.8 · Python 3.9+',kind:'原生kind与真实ClusterIP请求',observe:'双副本持续收请求，独立读取Ready/EndpointSlice/重启计数；区分readiness摘新流量、liveness重启、v2发布和undo后的实际v1。',scope:'公共Linux CI已执行，保存297条请求含1次传播期失败；6组稳定窗口各20条，不代表全程零错误、长连接排空或生产云网络。'},
 {id:'cloud-service',track:'cloud',stage:3,title:'把请求、探针与交付版本连起来',chapter:'cloud-service-lab',pack:'infra-systems',files:['infra_lab.py','probe_server.py'],pendingFiles:['probe_server.py'],env:'Python 3.9+ · 标准库',kind:'本机服务与目标手册',observe:'核对实际本机请求、完整文件版本和摘要，再进入探针、端点和回退的集群步骤。',scope:'infra_lab 本机部分已执行；probe_server 配合集群探针、EndpointSlice 与版本回退仍待目标环境验证。'},
 {id:'ai-supervision',track:'ai',stage:1,title:'标签对齐、共享梯度与不等长微批',chapter:'tokenization-embedding',pack:'supervision-gradients',files:['supervision_gradients.py'],env:'PyTorch 2.5.1 CPU；参考模式只需 Python 3.9+',kind:'实际自动求导与独立链式法则',observe:'分开查表和输出路径，验证 PAD 行仍可更新；逐项核对 16 个导数，再比较有效目标与微批的平均权重。',scope:'局部 H=E[id]/2，无注意力；六项交叉熵与另四项平方损失分别记账，不测 GPU。'},
 {id:'ai-attention',track:'ai',stage:1,title:'手算 Attention，再比较整段与逐词元计算',chapter:'attention-mechanics',anchor:'section-6',pack:'attention-mechanics',files:['attention_lab.py'],env:'Python 3.9+ · 标准库',kind:'数值语义实验',observe:'改未来位置与可见位置，核对因果遮罩、键值缓存（KV Cache）等价和有效目标分母。',scope:'固定向量与独立手算，不调用模型或 GPU。'},
 {id:'ai-prefix-attention',track:'ai',stage:1,title:'前两格互相可见，续写还能保持因果吗',chapter:'attention-mechanics',anchor:'prefix-attention-mask',pack:'prefix-attention',files:['prefix_attention.py'],env:'Python 3.12 · PyTorch 2.5.1 · CPU',kind:'真实 SDPA 与数值反例',observe:'单独改动提示内部和续写中的值，对照普通因果、双向前缀及错误平移掩码。',scope:'固定四位置、单头数学后端，比较输出和分段读取。'},
 {id:'ai-foundations',track:'ai',stage:1,title:'从词表、位置与 664 参数 Decoder 走一遍更新',chapter:'autograd-training',pack:'textbook-examples',folder:'model-foundations',files:['tokenization.py','rope.py','tiny_decoder.py','io_attention.py'],env:'Python 3.9+；Decoder 需 PyTorch 2.5.1',kind:'标准库数值 + CPU 自动求导',observe:'分别核对标签、相对位置、整批/微批更新及在线 softmax；每个程序有自己的输入。',scope:'小模型和数值参考，不是 FlashAttention 内核或大模型训练基准。'},
 {id:'ai-packing',track:'ai',stage:1,title:'拼接文档时，EOS 不能代替注意力边界',chapter:'data-pipeline',pack:'network-input-tools',files:['packing_boundaries.py'],env:'Python 3.9+ · 标准库',kind:'固定向量对照',observe:'正确文档内遮罩与位置和逐文档相同；仅插 EOS 或延续位置会改变本例输出。',scope:'位置向量为教学输入，不实现 RoPE 或 GPU packing。'},
 {id:'ai-sampler',track:'ai',stage:2,title:'训练进程与数据加载进程，会重复交付样本吗',chapter:'data-pipeline',pack:'network-input-tools',files:['sampler_coverage.py'],env:'Python 3.12 + PyTorch 2.5.1 · CPU',kind:'真实多进程数据加载',observe:'两个训练进程（rank），每个进程两个加载进程（worker）。核对 11 条数据在补齐、丢尾和分流后的唯一 ID、交付数与批次数。',scope:'保存成文件运行；不执行训练步、GPU 拷贝或吞吐测试。'},
 {id:'ai-ddp-step',track:'ai',stage:2,title:'两个副本相同，不代表全局梯度算对了',chapter:'distributed-training',anchor:'section-2',pack:'ddp-one-step',files:['ddp_step.py'],env:'Python 3.12 + PyTorch 2.5.1 · CPU/Gloo',kind:'真实两 rank',observe:'对照等长与不等长样本，再用独立单进程基准核对全局样本分母。',scope:'float64 小规模单步基准，不含 GPU 性能。'},
 {id:'ai-updates',track:'ai',stage:2,title:'不等长、尾窗口、空窗口与梯度裁剪',chapter:'distributed-training',pack:'update-and-cancel',files:['update_windows.py'],env:'Python 3.12 + PyTorch 2.5.1 · CPU/Gloo',kind:'真实两 rank + 独立基准',observe:'使用 7、0、3 个有效目标的窗口，核对全局分母、裁剪顺序及空窗不推进动量。',scope:'固定模型与精度，不把窗口数当成任意优化器的实际更新数。'},
 {id:'ai-collectives',track:'ai',stage:2,title:'集合通信的数值、形状与调用顺序',chapter:'training-communication',pack:'scaling-collectives-traces',files:['collective_contracts.py'],env:'Python 3.12 + PyTorch 2.5.1 · CPU/Gloo',kind:'真实两 rank',observe:'核对规约、变长收集、重排与归一化，再运行形状和操作不一致的独立失败对照。',scope:'通信确实发生在本机 CPU；不证明 NCCL、RDMA 或物理网络性能。'},
 {id:'ai-context-parallel',track:'ai',stage:2,title:'长序列切开以后，哪一行还要读远端 KV',chapter:'flash-attention-io',anchor:'context-parallel-lab',pack:'context-parallel',files:['context_attention.py'],env:'Python 3.12 + PyTorch 2.5.1 · CPU/Gloo',kind:'真实两进程与独立矩阵参考',observe:'收齐 KV 后按原位置分块计算，核对全部四行、远端统计和两种错误实现。',scope:'本机 CPU 单头因果前向。Ring 传递、目标设备性能和训练反向另验。'},
 {id:'ai-ring-context-training',track:'ai',stage:2,title:'沿环传递，最后一跳把梯度还给谁',chapter:'flash-attention-io',anchor:'ring-context-training',pack:'ring-context-training',files:['ring_training.py'],env:'Python 3.12 + PyTorch 2.5.1 · CPU/Gloo',kind:'真实点对点收发与权重更新',observe:'两、三进程切分 1024、1536 个位置，对照输出、梯度和更新。漏掉远端 dK/dV 时用独立参照拒绝。',scope:'本机 CPU 单头。CUDA/NCCL 和物理多节点待验。'},
 {id:'ai-tp-gradients',track:'ai',stage:2,title:'张量并行：前向部分和与反向输入梯度',chapter:'tensor-parallel-math',pack:'storage-parallel-acceptance',files:['tp_forward_backward.py'],env:'Python 3.12 + PyTorch 2.5.1 · CPU/Gloo',kind:'真实两成员 TP 组',observe:'求和后加一次偏置得到[12,5]；两份输入梯度合为[39,42]，局部参数梯度和更新对照完整基线。',scope:'局部自动求导加显式dY与归约，不是生产TP层；未运行GPU或真实多机。'},
 {id:'ai-memory',track:'ai',stage:2,title:'逐项数张量状态，再看重计算保留了什么',chapter:'gpu-memory',pack:'config-memory-evaluation',files:['tensor_state_bytes.py','checkpoint_saved_tensors.py'],env:'Python 3.12 + PyTorch 2.5.1 · CPU',kind:'真实张量与自动求导',observe:'核对首次 step 才创建的优化器状态、共享存储去重，以及保留对象和梯度的一致性。',scope:'计数不是 CUDA allocated/reserved、RSS 或整步显存峰值。'},
 {id:'ai-quantization',track:'ai',stage:2,title:'INT4 字节账与真实 INT8 执行分别检查',chapter:'quantization-serving',pack:'storage-quant-context',files:['int4_groups.py','int8_runtime.py'],env:'INT4：标准库；INT8：PyTorch 2.5.1 CPU',kind:'数值参考 + 实际量化算子',observe:'逐组打包、反量化和点积；另运行 INT8 转换、推理、保存和回读。',scope:'INT4 参考不等于低位 GPU 内核；实测 INT8 不推广为任意模型质量。'},
 {id:'ai-placement',track:'ai',stage:2,title:'总空闲够，为什么整组 GPU 仍放不下',chapter:'gpu-scheduling',pack:'leases-placement-sandbox',files:['placement_reservations.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'有限放置模型 + 两进程竞争',observe:'先算形状与机架约束，再注入半途失败和并发争抢，核对整组回滚与唯一准入。',scope:'GPU 槽位为题设；没有运行 Kueue 或实际 GPU 作业。'},
 {id:'ai-kueue-admission',track:'ai',stage:2,title:'同一个 Job 先等额度，再等节点',chapter:'gpu-scheduling',anchor:'native-kueue-admission',pack:'kueue-admission',files:['kueue_admission.py'],env:'Linux Docker · kind 0.33.0 · Kubernetes 1.35.8 · Kueue 0.20.5',kind:'原生队列准入、节点绑定与 Job 完成',observe:'分别解除队列占用和节点标签约束，按两个 Pod 的索引检查实际输出 37 与 12。',scope:'单宿主 kind 上的独立 CPU 工作，GPU、跨主机通信与共同参数更新另验。'},
 {id:'ai-operator-cpu',track:'ai',stage:2,title:'同一数学契约，核对布局、舍入与尾块',chapter:'operator-profiling',anchor:'operator-cpu-run',pack:'operators-routing',files:['cpu_ops.c','operator_lab.py'],env:'Python 3.9+ · 本地C11编译器',kind:'真实CPU编译与调用',observe:'验证稳定softmax、1/0/2求和反例、非整块GEMM，再记录有限计时样本。',scope:'float64连续数组；没有CUDA、GPU带宽或BLAS性能结论。'},
 {id:'ai-operator-profile',track:'ai',stage:2,title:'用CPU实际轨迹分清外层区间与内部算子',chapter:'operator-profiling',anchor:'operator-profile-run',pack:'operators-routing',files:['cpu_profile.py'],env:'Python 3.9+ · PyTorch；记录版本2.5.1 CPU',kind:'真实CPU Profiler',observe:'预热后5次线性、softmax与求和，核对15条命名区间和算子事件。',scope:'采集形状/内存有开销，不把包含子事件的时间重复相加，不作为GPU计时。'},
 {id:'ai-moe-routing',track:'ai',stage:2,title:'八条分配乱序返回，仍按原身份合并',chapter:'moe-routing',anchor:'moe-routing-run',pack:'operators-routing',files:['moe_routing.py'],env:'Python 3.9+ · 标准库',kind:'实际两执行进程与声明路由策略',observe:'四个输入按Top-2分发，比较正确/错误合并以及容量3下的保留6、丢2。',scope:'固定线性专家；逻辑rank与通信160B为声明算式，没有GPU/NCCL或模型训练。'},
 {id:'ai-native-expert-parallel',track:'ai',stage:2,title:'专家算完，怎样把结果和梯度还给原位置',chapter:'moe-routing',anchor:'native-expert-parallel',pack:'native-expert-parallel',files:['expert_parallel.py'],env:'Python 3.12 · PyTorch 2.5.1 · CPU/Gloo',kind:'真实非等长集合通信与自动求导',observe:'两个进程各持一份专家，按原身份核对输出、输入与专家梯度，再观察同形状的错序反例。',scope:'固定 Top-1 路由与线性专家，范围为本机 CPU。'},
 {id:'ai-serving',track:'ai',stage:2,title:'计算预算和 KV 预算要同时满足',chapter:'inference-performance',anchor:'subsection-6-1ajl0y9',pack:'serving-consistency',files:['serving_scheduler.py'],env:'Python 3.9+ · 标准库',kind:'确定性调度模型',observe:'逐轮记录预填充、解码与缓存占用，观察只检查一笔预算会遗漏什么。',scope:'教学调度器，没有真实模型、时延压测或服务框架。'},
 {id:'ai-native-inference',track:'ai',stage:2,title:'同一条提示，真实引擎还要前向几项',chapter:'model-serving',anchor:'native-inference-engine-lab',pack:'native-inference',files:['engine_walkthrough.py','make_fixture.py'],env:'Python 3 · llama.cpp b12110 · macOS arm64 CPU',kind:'真实引擎、回环 HTTP 与逐轮记录',observe:'核对输入词元、前缀命中、新算提示和实际输出，比较关闭复用的对照。',scope:'单 slot、合成小模型、CPU；vLLM 的多请求块池另作源码走读。'},
 {id:'ai-gqa',track:'ai',stage:2,title:'GQA 缓存与有效 token 梯度',chapter:'model-serving',pack:'ai-agent-systems',files:['gqa_serving.py','token_ddp.py'],env:'GQA：标准库；DDP：PyTorch 2.5.1 CPU',kind:'数值对照 + 真实两 rank',observe:'两个程序独立：一份比较 GQA 增量路径，一份以全局有效目标复算梯度。',scope:'不同输入和模型，不将二者拼成一个生产推理训练系统。'},
 {id:'ai-artifacts',track:'ai',stage:3,title:'文件和形状都正确，词表仍可能装错',chapter:'ai-lifecycle',pack:'recovery-artifacts-retrieval',files:['artifact_bundle.py'],env:'Python 3.12 + PyTorch 2.5.1 + Safetensors 0.8.0',kind:'CPU 产物保存与加载',observe:'交换词表 ID 后让语义门禁拒绝；固定完整版本束，再验证条件发布与回退代际。',scope:'三条固定语义与本地生产指针，不是 LLM 质量或线上灰度测试。'},
 {id:'ai-recovery',track:'ai',stage:3,title:'一条命令比较连续四轮和保存后的 2+2 轮',chapter:'training-lab',pack:'training-capstone',files:['verify_run.py','train_ddp.py','compare_checkpoints.py'],env:'Linux/macOS · Python 3.10—3.12 + PyTorch 2.5.1',kind:'真实两 rank 完整恢复',observe:'两条路径各有 32 次实际调用；模型、优化器、随机状态和配置逐项相等，三个负例必须被拒绝。',scope:'轮末正常保存后重启；没有任意微批崩溃、掉电或 GPU 证据。'},
 {id:'ai-tiny-decoder-handoff',track:'ai',stage:3,title:'同一个小模型怎样从训练进程交给推理进程',chapter:'checkpoint-recovery',anchor:'native-tiny-decoder-handoff',pack:'tiny-decoder-handoff',files:['handoff.py','README.md'],env:'Python 3.12 · PyTorch 2.5.1 · CPU/Gloo · 需下载同站 SDPA 实验包',kind:'双进程训练、检查点恢复与独立推理',observe:'核对两步的有效目标与动量，再比较独立进程加载两个版本后的候选分数。将旧权重放到新清单旁，确认加载会拒绝。',scope:'664 参数教学模型，本机 CPU 双精度，在完整更新后保存。'},
 {id:'ai-mps-checkpoint-resume',track:'ai',stage:3,title:'换进程续训时，权重相同为什么更新会不同',chapter:'checkpoint-recovery',anchor:'native-mps-checkpoint-resume',pack:'mps-checkpoint-resume',files:['mps_resume.py','tiny_decoder.py','requirements.txt'],env:'Python 3.12 · PyTorch 2.5.1 · Apple M4 Pro MPS',kind:'真实 GPU 训练与跨进程恢复',observe:'比较六步连续训练与第 3 步保存后恢复，再分别只丢动量、只丢 MPS 随机状态，核对目标组与权重。',scope:'单台 Apple Silicon、单设备、FP32 和 664 参数小模型；CUDA、跨机与性能另验。'},
 {id:'ai-multinode',track:'ai',stage:3,title:'从单机 CPU 走向真实两机四卡',chapter:'multinode-lab',pack:'cloud-training-ddp',files:['check_env.py','launch_2nodes.sh','train_ddp.py'],pendingFiles:['check_env.py','launch_2nodes.sh'],env:'两台 GPU 机器 · 共同网络与匹配运行时',kind:'目标环境手册',observe:'按设备、会合、小集合通信、训练、恢复与性能的顺序验收；逐层保留记录。',scope:'CPU/Gloo 和同主机代理有本地记录；真实 CUDA/NCCL、物理两节点仍待执行。'},
 {id:'agent-permission',track:'agent',stage:1,title:'先验证拒绝是否真的阻止了业务效果',chapter:'agent-security',anchor:'agent-permission-lab',folder:'permissions',files:['policy_lab.py'],env:'Python 3 · 标准库',kind:'本地策略夹具',observe:'用两个虚拟租户、只读任务和获批写入，对照八组决定与实际业务结果。',scope:'固定授权协议，不调用模型、真实身份服务或 Kairo。'},
 {id:'agent-effects',track:'agent',stage:1,title:'两次尝试，为什么只有一次工具效果',chapter:'agent-recovery',pack:'infra-systems',files:['agent_lab.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'真实子进程退出',observe:'工具提交后让执行者退出，恢复沿同一操作 ID 查询回执，得到 attempts=2、effects=1。',scope:'单 worker 的原始恢复实验；多 worker 接管见后续任务。'},
 {id:'agent-runtime',track:'agent',stage:1,title:'模型提议、工具成功与任务完成分开验',chapter:'agent-runtime',pack:'network-input-tools',files:['tool_runtime.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'真实本机 HTTP',observe:'十组固定提议覆盖类型错误、权限、预算、503、假完成和错误总数；以独立产物验收收尾。',scope:'提议是脚本；不是完整 MCP 会话、真实 LLM 或 Kairo 接入。'},
 {id:'agent-streams',track:'agent',stage:1,title:'流式参数先收齐，再判断工具能否执行',chapter:'agent-runtime',anchor:'streaming-tool-lab',pack:'streamed-tool-calls',files:['streamed_tool_calls.py'],env:'Python 3.9+ · 标准库 / 本机 HTTP',kind:'真实分块传输 + 声明的事件流',observe:'十三组对照分开 UTF-8、事件、参数完结与准入；未收齐不调用，已完成后流错误仍保留那次本地调用。',scope:'本地只读回调与进程内观察，不是模型 API、完整 EventSource、持久回执或 Kairo。'},
 {id:'agent-approval',track:'agent',stage:2,title:'批准过一次，不代表任意新参数都获批',chapter:'agent-security',pack:'learning-mechanisms',files:['approval_receipt.py'],env:'Python 3.9+ · 标准库',kind:'本机回执协议',observe:'绑定操作与参数，工具提交后退出再查询；错误参数和无匹配批准应拒绝。',scope:'受控批准夹具，不接入人工审批服务。'},
 {id:'agent-commit-authorization',track:'agent',stage:2,title:'检查之后撤权，实际提交还会写入吗',chapter:'agent-security',anchor:'authorization-commit-run',pack:'agent-boundaries',files:['authorization_commit.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'真实HTTP与独立数据库连接',observe:'比较当前epoch2拒绝与旧epoch1负例，并分开原K1回执读取与再次写入。',scope:'固定可信身份、逻辑过期时间与本地串行事务；没有OAuth/MCP/Kairo或跨服务原子性。'},
 {id:'agent-fencing',track:'agent',stage:2,title:'新执行者接管后，迟到的旧执行者还能写吗',chapter:'durable-workflows',anchor:'worker-fencing-run',pack:'ai-agent-systems',files:['worker_fencing.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'真实多进程状态竞争',observe:'暂停旧执行者、推进代际并接管，让接收方在效果提交处拒绝旧代际。',scope:'固定本机协议；代际不是认证凭据，不冒充目标 Kairo 调度器。'},
 {id:'agent-cancel',track:'agent',stage:2,title:'取消请求、停止执行与已经提交分别记录',chapter:'agent-recovery',anchor:'section-5',pack:'update-and-cancel',files:['cancel_receipts.py'],env:'Python 3.9+ · POSIX · 标准库',kind:'真实进程与回执',observe:'在提交前后设置取消窗口，查询独立接收方，解释停止进程为何不能撤销已提交的效果。',scope:'固定状态协议，不证明任意远端工具支持回滚。'},
 {id:'agent-context',track:'agent',stage:2,title:'旧摘要、权威状态与撤回后上下文',chapter:'agent-memory',pack:'storage-quant-context',files:['context_state.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'本机版本与条件写入',observe:'保留旧摘要、更新权威事实，再用版本条件阻止旧状态写回；撤回材料后重新构造上下文。',scope:'固定摘要与模型输出，不运行真实压缩模型或长期记忆服务。'},
 {id:'agent-retrieval',track:'agent',stage:2,title:'中文检索、RRF 与分级 nDCG',chapter:'agent-retrieval',pack:'recovery-artifacts-retrieval',files:['chinese_fts_rrf.py'],env:'Python 3.9+ · SQLite 需支持 FTS5',kind:'真实 FTS5 + 固定第二路',observe:'比较原始中文与二元片段索引，执行 BM25，再用声明排名融合并计算分级指标。',scope:'第二路不是 embedding；相关性等级为教学标签，不是检索排行榜。'},
 {id:'agent-delivery',track:'agent',stage:2,title:'检索命中后，再核对最终正文权限与版本',chapter:'agent-retrieval',pack:'serving-consistency',files:['retrieval_pipeline.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'真实分阶段检索夹具',observe:'在召回、重排和交付之间撤权或改版本；最终上下文不得泄露已经无权的正文。',scope:'固定资料与任务，不调用向量数据库或真实模型。'},
 {id:'agent-context-budget',track:'agent',stage:2,title:'正文36词元，完整输入为什么是237',chapter:'agent-retrieval',anchor:'context-budget-run',pack:'agent-boundaries',files:['context_budget.py','requirements.txt'],env:'Python 3.9+ · tiktoken 0.12.0 · SQLite FTS5',kind:'真实BPE、FTS5与HTTP提示交付',observe:'完整输入和输出预留一起核算；预算不足、取回后撤权/升级均停止，另验词元切断UTF-8的反例。',scope:'512是声明窗口，接收端仅收集提示，不运行LLM；不提供即时全局撤权或聊天封装计数。'},
 {id:'agent-observation',track:'agent',stage:2,title:'同一任务多次尝试，沿 trace 找到实际效果',chapter:'agent-observability',pack:'scaling-collectives-traces',files:['otel_attempts.py'],env:'Python 3.12 + OpenTelemetry 1.44.0（见 requirements）',kind:'实际 OTel SDK / HTTP',observe:'核对 HTTP traceparent、跨度（span）的父子关系、重试、等待与每个成功任务的成本分母。',scope:'本机服务与内存导出；不含生产采样、遥测后端或真实计费。'},
 {id:'agent-oracle',track:'agent',stage:3,title:'工具说成功，独立任务验收可以拒绝',chapter:'agent-evaluation',pack:'ai-agent-systems',files:['agent_evaluation.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'独立任务验收',observe:'用合法、拒绝、错误产物与副作用等固定用例核对结果；评分器检查业务状态。',scope:'固定任务提议，不估计真实 LLM 的成功率。'},
 {id:'agent-statistics',track:'agent',stage:3,title:'80% 准确率和提高 8 个百分点说明了什么',chapter:'agent-evaluation',pack:'config-memory-evaluation',files:['evaluation_statistics.py','paired-example.csv'],env:'Python 3.9+ · 标准库',kind:'声明标签的统计计算',observe:'分别计算类别切片、评分器四格、Wilson 区间和同题成对比较；解释 p=0.6875。',scope:'输入是合成教学标签，不是模型能力实测或上线结论。'},
 {id:'agent-contract-record',track:'agent',stage:3,title:'按测试者契约，拒绝十种外表正常的记录',chapter:'kairo-practice',pack:'storage-parallel-acceptance',files:['acceptance_record.py','readonly-contract.example.json','readonly-evidence.example.json'],env:'Python 3.9+ · 标准库',kind:'通用记录校验夹具',observe:'分开权限/标准答案与观测记录，检查原任务、对应来源值、total=23及B快照；来源未核实保持false。',scope:'只验证声明记录的一致性，不调用模型/工具/Kairo，也不证明记录来源真实。'},
 {id:'agent-sandbox',track:'agent',stage:3,title:'CPU、墙钟、文件描述符与路径分别限',chapter:'agent-sandbox',pack:'leases-placement-sandbox',files:['subprocess_limits.py','descriptors_and_paths.py'],env:'POSIX · Python 3.9+ · 标准库',kind:'实际受信子进程',observe:'观察文件、FD、CPU 与墙钟限制，再用继承和路径替换反例检验启动边界。',scope:'只管理自己的受信进程；没有创建安全容器或隔离同 UID 文件系统。'},
 {id:'agent-native-sandbox',track:'agent',stage:3,title:'报告写成了，原始输入有没有被改动',chapter:'agent-sandbox',anchor:'native-sandbox-container',pack:'sandbox-container',files:['sandbox_container.py','source.json'],env:'Linux amd64 · 本机 Docker · Python 3',kind:'真实非 root 容器与主机侧验收',observe:'比较只读与可写输入挂载，核对报告、源字节、权限和清理。',scope:'独立本机容器与合成文件，范围为实验设置和观测。'},
 {id:'agent-kairo',track:'agent',stage:3,title:'把本地不变量变成 Kairo 接入验收',chapter:'kairo-practice',anchor:'section-7',files:[],env:'真实 Kairo 版本、接口与独立测试环境',kind:'目标环境手册',observe:'逐项映射任务身份、工具回执、状态、接管、撤权与独立结果验收，保留目标版本记录。',scope:'目前是映射和验收设计，未声明 Kairo 已接入或真实多 worker 验收通过。'}
];
labLearningCatalog.push(
 {id:'cloud-route-walk',track:'cloud',stage:1,title:'从地址位算到最长前缀，再查回程',chapter:'vpc-network',pack:'mechanism-walkthroughs',files:['route_walk.py'],anchor:'v43-route-practice',env:'Python 3.9+ · 标准库',kind:'路由选择模型',observe:'打印/0、/24、/32的匹配，改变表格顺序与回程条目，分别解释结果。',scope:'只执行声明的地址集合与选择规则；未配置VPC或测量实际转发。'},
 {id:'cloud-reconcile-walk',track:'cloud',stage:1,title:'重复调谐、代次与同名新UID',chapter:'kubernetes-basics',pack:'mechanism-walkthroughs',files:['reconcile_walk.py'],anchor:'v43-reconcile-practice',env:'Python 3.9+ · 标准库',kind:'控制状态模型',observe:'对照期望3副本、观察代次、实际实例与就绪数，再用旧UID尝试删除同名新实例。',scope:'本地教学模型；目标集群继续按只读命令和原探针手册验收。'},
 {id:'ai-attention-walk',track:'ai',stage:1,title:'把三行注意力手算与真实SDPA对齐',chapter:'attention-mechanics',pack:'mechanism-walkthroughs',files:['attention_trace.py'],anchor:'v43-attention-practice',env:'Python + PyTorch · 本次2.5.1 CPU',kind:'实际CPU张量',observe:'逐项核对分数、权重、输出，再改变缓存位置、无效key、Q/K方向与分头坐标。',scope:'float64 CPU数值对照；不报告GPU内核或性能收益。'},
 {id:'ai-decoder-walk',track:'ai',stage:1,title:'四种形状正确的接线错误，最早错在哪里',chapter:'transformer-block',pack:'mechanism-walkthroughs',files:['decoder_trace.py','tiny_decoder.py'],anchor:'v43-decoder-practice',env:'Python + PyTorch · 本次2.5.1 CPU',kind:'实际CPU模型与梯度',observe:'追踪664参数模型的每层数值，核对归一化轴、第二分支输入、门控、残差与未来扰动。',scope:'固定输入和种子的前向及标量梯度；不是大型模型质量或GPU性能测试。'},
 {id:'ai-tiny-decoder-forward',track:'ai',stage:1,title:'换掉前文，跟到最后一行候选分数',chapter:'transformer-block',anchor:'native-tiny-decoder-context',pack:'tiny-decoder-forward',files:['trace_forward.py'],env:'Python 3.12 · PyTorch 2.5.1 · CPU · 需下载同站 SDPA 实验包',kind:'原模型前向与中间量复算',observe:'固定末位和参数，只替换前一项，核对查表、读取权重、两次回加和最终得分。',scope:'664 参数小模型，固定词元编号，CPU 双精度。'},
 {id:'agent-history-walk',track:'agent',stage:2,title:'结果记录前后退出，恢复会重新读取吗',chapter:'durable-workflows',pack:'mechanism-walkthroughs',files:['workflow_history.py'],anchor:'v43-history-practice',env:'Python 3.9+ · 标准库 / SQLite',kind:'实际进程与持久历史',observe:'在读取后、结果提交后分别退出，改源值23为999，再比较恢复结果与活动调用次数。',scope:'本地解释器，活动只读资料和生成文本；不是Temporal SDK或Kairo运行结果。'}
);
labLearningCatalog.push(
 {id:'cloud-container-native',track:'cloud',stage:1,title:'分开观察视图、CPU、内存和线程名额',chapter:'container-runtime',anchor:'container-native-run',pack:'runtime-scheduling',files:['container_limits.py','container_probe.py'],env:'Linux Docker · cgroup v2 · Python 3.9+',kind:'真实Linux容器',observe:'比较同时存活的namespace、cpu.stat差值、OOM原因与pids事件；不用单一退出码猜原因。',scope:'公共Linux CI实际执行；只创建自有受限容器，不验证隔离逃逸或生产性能。'},
 {id:'cloud-scheduler-native',track:'cloud',stage:2,title:'从配额拒绝走到资源形状与约束冲突',chapter:'scheduling-resources',anchor:'scheduler-native-run',pack:'runtime-scheduling',files:['schedule_lab.py'],env:'Linux Docker · kind 0.33.0 · kubectl · Python',kind:'真实kind调度',observe:'按对象不存在、Unschedulable、节点绑定与Ready分别核对；容忍不豁免反亲和。',scope:'实际API与scheduler；多个节点容器共享单机，不证明物理多机或云CNI/CSI。'},
 {id:'ai-speculative-sampling',track:'ai',stage:1,title:'精确补回采样概率，再核对实际K/V',chapter:'speculative-decoding',anchor:'spec-exact-run',pack:'speculative-decoding',files:['exact_sampling.py','cache_verify.py'],env:'Python 3.9+；缓存需Python 3.10–3.12/PyTorch 2.5.1 CPU',kind:'精确概率与CPU张量',observe:'枚举27条完整序列；再运行cache_verify.py比较接受、拒绝及不裁缓存的真实数值。',scope:'未训练模型与受控草稿，只验证分布与缓存；不是GPU速度或真实草稿质量。'},
 {id:'agent-crash-windows',track:'agent',stage:2,title:'六个SIGKILL窗口：旧请求还会提交吗',chapter:'agent-recovery',anchor:'agent-crash-windows-run',pack:'agent-crash-windows',files:['crash_windows.py'],env:'POSIX · Python 3.9+ · 标准库 / SQLite',kind:'真实子进程与HTTP',observe:'工具保持存活，按同一身份恢复；换身份产生74与篡改观察都被独立验收拒绝。',scope:'只验证进程崩溃与固定本地工具协议；断电、多运行器接管和Kairo接口仍待目标环境。'}
);
labLearningCatalog.push(
 {id:'cloud-message-native',track:'cloud',stage:2,title:'入队、ACK与业务完成各自确认什么',chapter:'message-delivery',anchor:'message-native-run',pack:'delivery-systems',files:['mq_delivery.py','mq_client.py','Dockerfile.mq-client'],env:'Linux Docker · Python 3.9+ · 镜像内Pika 1.3.2',kind:'真实消息代理',observe:'核对无路由确认、业务提交后崩溃重投、过早ACK负例、预取接口与持久重启。',scope:'RabbitMQ 4.4单节点、自有内部网络；不是SQS/Lambda或高可用测试。'},
 {id:'cloud-terraform-state-native',track:'cloud',stage:2,title:'状态锁、刷新与工作空间会保护哪一层',chapter:'terraform-state',anchor:'terraform-state-run',pack:'delivery-systems',files:['terraform_state.py'],env:'Terraform 1.13.0 · local 2.5.3 · Python 3.9+',kind:'真实CLI与文件',observe:'让第二进程取锁失败；分别观察配置、state和实物，再用两份状态争夺同一路径。',scope:'实际local backend和local_file，只操作自有临时目录；非云provider/remote backend。'},
 {id:'cloud-gitops-native',track:'cloud',stage:2,title:'同步健康为何仍返回旧版',chapter:'gitops-reconciliation',anchor:'gitops-native-run',pack:'delivery-systems',files:['gitops_reconcile.py','gitops-revisions.json','gitops-app/configmap.json','gitops-app/deployment.json','gitops-app/service.json'],env:'Linux Docker · kind 0.33 · kubectl · Python',kind:'真实Argo CD与HTTP',observe:'依次跟踪三个固定Git修订，核对自愈、清理、Pod UID和真实Service响应。',scope:'Argo CD Core 3.6.1、单机kind；业务v2断言独立于Synced/Healthy。'}
);
labLearningCatalog.push({id:'ai-manual-sharding',track:'ai',stage:2,title:'分片参数怎样回到一次正确的更新',chapter:'distributed-training',anchor:'manual-sharding-run',pack:'manual-sharding',files:['shard_linear.py','requirements.txt'],env:'Python 3.12 · PyTorch 2.5.1 · CPU/Gloo',kind:'真实双进程与自动求导',observe:'各进程分别处理1与2条样本，逐次核对三轮梯度、拼回参数和SGD动量；错误局部均值应被拒绝。',scope:'手工all-gather与完整梯度all-reduce后切片；非FSDP API，不测GPU峰值、原生reduce-scatter或跨规模恢复。'});
labLearningCatalog.push({"id":"cloud-proxy","track":"cloud","stage":2,"title":"沿真实代理核对连接、排空和写入结果","chapter":"vpc-network","anchor":"cloud-proxy-run","pack":"cloud-proxy","files":["proxy_lab.py","README.md"],"env":"Python 3.9+ · 标准库 / 本机HTTP / SQLite","kind":"真实HTTP代理与业务写入","observe":"三个查询复用上游连接；B排空后旧请求完成、新请求走A；重试受共同截止时间与次数约束，错误重试写入得到74而非37。","scope":"受控小型Content-Length消息；上游窗口从入口校验后计时，无TLS、NGINX执行、云负载均衡或性能实测。"},
{"id":"ai-physical-cache","track":"ai","stage":2,"title":"缓存真的存了什么，复用以后还算得对吗","chapter":"inference-performance","anchor":"inference-cache-run","pack":"inference-cache","files":["paged_cache.py","README.md","contracts.json"],"env":"Python 3.9+ · 标准库 / CPU","kind":"真实块池与标量注意力","observe":"逐格对照独立完整前缀计算，核对共享、写时复制、满池拒绝、槽代次与重算；同一17请求比较计算机会与等待取舍。","scope":"两层标量因果注意力、实际列表存储与离散迭代；非完整Transformer、vLLM运行、GPU内核或时延实测。"},
{"id":"agent-planning","track":"agent","stage":2,"title":"计划改变后，哪些事实和批准仍然有效","chapter":"durable-workflows","anchor":"agent-planning-run","pack":"agent-planning","files":["planning_lab.py","README.md"],"env":"Python 3.9+ · 标准库 / SQLite / 子进程","kind":"真实新进程与持久状态","observe":"基础37加补录5得到42；恢复时复用有效事实，旧批准不能授权新草稿；错误汇总缓存可令流程DONE，但独立产物验收应拒绝。","scope":"固定提议来源和本地SQLite事务；不运行LLM、Temporal/LangGraph SDK、远端效果协议或Kairo适配器。"});
labLearningCatalog.push({"id":"cloud-etcd-consensus","track":"cloud","stage":2,"title":"隔离成员以后，谁还能确认最新状态","chapter":"control-plane-consensus","anchor":"etcd-consensus-run","pack":"etcd-consensus","files":["etcd_lab.py","README.md"],"env":"Linux · Python3.9+ · 本地Docker · etcd3.6.16固定镜像","kind":"真实三成员与独立快照恢复","observe":"真实断开旧leader网络，核对多数侧42与孤立侧37；恢复多数可写43；旧快照37经重新列举与watch接续到47，完整缓存另行读取核对。","scope":"隔离Linux CI、同宿主容器；明文合成配置，无生产TLS/RBAC、物理故障域、Kubernetes整体验收或吞吐测量。"},
{"id":"cloud-mysql-replication","track":"cloud","stage":2,"title":"分开行版本、复制应用和新写资格","chapter":"mysql-replication","anchor":"mysql-replication-run","pack":"mysql-replication","files":["replication_lab.py","README.md"],"env":"Linux · Python3.9+ · 本地Docker · MySQL8.4.13固定镜像","kind":"真实双实例、连接与受控切换","observe":"同连接RR读110/110、提交后130，RC读130/135；副本收到却未应用目标，冻结G与先验B两向核对，硬停旧实例后新写至145。","scope":"合成账本与有计划交接；无跨机房、生产代理切流、自动故障切换、断电或零丢失承诺。"},
{"id":"agent-mcp-protocol","track":"agent","stage":1,"title":"沿真实SDK读懂工具发现、取消与结果验收","chapter":"mcp-protocol","anchor":"mcp-protocol-run","pack":"mcp-protocol","files":["client_lab.py","server.py","orders.json","requirements.txt","README.md"],"env":"Python3.12 · 官方mcp2.3.0 · stdio子进程","kind":"真实现代与旧版MCP连接","observe":"两代版本流程分别运行，核对请求、进度与取消；处理器关文件后同连接继续读5；结构通过的41仍被权威来源42拒绝，EOF后核对进程回收。","scope":"只读资料与固定宿主决策；未验证HTTP/OAuth、外部副作用撤销、LLM规划或Kairo适配器。"});
labLearningCatalog.push({"id": "cloud-kubernetes-identity", "track": "cloud", "stage": 2, "title": "沿同一凭证看清认证与授权", "chapter": "iam-security", "anchor": "kubernetes-identity-run", "pack": "kubernetes-identity", "files": ["identity_lab.py", "README.md"], "env": "Linux · kind0.33.0 · Kubernetes1.35.8 · 本地Docker", "kind": "真实ServiceAccount与RBAC", "observe": "沿CA与Bearer访问报表37，核对SA主体、200→403→200、受众及Pod UID撤销，并独立读取四个对象。", "scope": "隔离CI单节点kind；没有管理员客户端证书混入业务请求。未测试Pod内投射或刷新、云IAM及跨机身份。"},
{"id": "ai-torch-checkpoint", "track": "ai", "stage": 2, "title": "新进程用DCP恢复同一步训练状态", "chapter": "checkpoint-recovery", "anchor": "torch-checkpoint-run", "pack": "torch-checkpoint", "files": ["train_dcp.py", "run_lab.py", "reference_train.py", "requirements.txt", "README.md"], "env": "PyTorch2.5.1 · 两个CPU/Gloo进程", "kind": "真实原生DCP保存与恢复", "observe": "连续四轮对照两轮保存后新进程恢复；逐项比较模型、Adam、随机状态与输入进度，并检测缺元数据和只恢复权重。", "scope": "同宿主固定配置同步DCP；没有FSDP/DTensor重分片、GPU/NCCL、多机或掉电实测。"},
{"id": "ai-sdpa-cache", "track": "ai", "stage": 2, "title": "同一小模型比较完整前缀与缓存生成", "chapter": "model-serving", "anchor": "sdpa-cache-run", "pack": "sdpa-cache", "files": ["cache_lab.py", "tiny_decoder.py", "requirements.txt", "README.md"], "env": "PyTorch2.5.1 · CPU · SDPBackend.MATH", "kind": "真实SDPA与KV缓存API", "observe": "复用664参数模型权重，核对完整、逐位置与两位置续算；错误因果对齐应被logits对照发现，生成缓存按2→3→4推进。", "scope": "验证CPU原生API、掩码和生成状态，不是FlashAttention设备内核或GPU性能测试。"},
{"id": "agent-langgraph-workflow", "track": "agent", "stage": 2, "title": "持久暂停、并行与新进程恢复", "chapter": "durable-workflows", "anchor": "langgraph-workflow-run", "pack": "langgraph-workflow", "files": ["workflow_lab.py", "orders.json", "requirements.txt", "README.md"], "env": "LangGraph1.2.20 · checkpoint-sqlite3.1.3 · Python3.12", "kind": "真实框架与独立HTTP效果", "observe": "42报告在新进程恢复；同一暂存动作2次尝试仅1份效果，新UUID反例2份；并行失败恢复保留已成功分支。", "scope": "无模型、单宿主SQLite检查点与自建HTTP接收方；未验证真实审批身份、任意远端事务、跨机或Kairo。"});
labLearningCatalog.push({id:'ai-cuda-core',track:'ai',stage:2,title:'把算子映射到GPU线程与共享内存',chapter:'operator-profiling',anchor:'cuda-core-run',pack:'cuda-core',files:['cuda_lab.cu','reference.py','build.py','toolchain-lock.json','README.md'],env:'Linux x86_64 · CUDA12.9.1；执行另需计算能力8.0+ GPU与兼容驱动',kind:'真实CUDA编译 · GPU待验',observe:'读懂逐行归约、稳定softmax和16×16分块GEMM；用13组独立参考与错误归一化核对目标GPU回读。',scope:'隔离Linux CI验证NVCC、链接与PTX入口；CPU校验器16种错误变异通过。GPU数值执行、Nsight与性能仍待目标环境验收。'});
labLearningCatalog.push({id:'ai-same-device-gemm',track:'ai',stage:2,title:'同卡比较朴素、分块和双行复用 GEMM',chapter:'operator-profiling',anchor:'same-device-gemm',pack:'gemm-variants',files:['gemm_variants.cu'],env:'Linux x86_64 · CUDA 12.9.1；执行需计算能力 8.0+ GPU 与兼容驱动',kind:'真实 CUDA 编译 · GPU 待验',observe:'同一输入逐项验尾块，再固定设备、流、数据与样本顺序，分开记录 CUDA event 和 Nsight。',scope:'Linux 编译和设备探测有记录。设备数值回读、计时和计数器均待实际 GPU。'});
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='ai-multinode'),0,{id:'ai-multinode-local',track:'ai',stage:3,title:'两个启动器怎样带起四个训练进程',chapter:'multinode-lab',anchor:'multinode-launch-run',pack:'multinode-launch',files:['verify_launch.py','launch_worker.py','train_ddp.py','compare_checkpoints.py'],env:'Linux/macOS · Python3.10—3.12 · PyTorch2.5.1 CPU/Gloo',kind:'真实两启动器与四worker',observe:'核对全局/本地编号、8192样本每轮16次更新、连续2与1+1；配置、计数和四份随机状态逐项检查，浮点差异独立记录。',scope:'同宿主、FP32、轮末恢复。逐位对照未通过，声明的1e-6绝对误差契约通过；无物理两机/GPU、任意模型或性能保证。'});
labLearningCatalog.push({id:'shared-integrated-service',track:'agent',stage:3,title:'把任务、模型、报告与恢复接成真实服务',chapter:'production-readiness',anchor:'integrated-service-run',pack:'integrated-service',files:['integrated_service.py','source.json','model-contract.json','requirements.txt','README.md'],env:'Linux/macOS · Python3.10+ · PyTorch2.5.1 CPU',kind:'真实HTTP / CPU模型 / 独立SQLite域',observe:'输入10和27，实际模型输出37；提交后退出再用新进程恢复，分别核对效果份数、权重/版本、读取资格及独立产物验收。',scope:'固定计划、公开身份夹具、同宿主服务与串行worker；不运行语言模型、训练、GPU或Kairo，容量另为声明算例。'});
labLearningCatalog.push(
 {id:'ai-encoder-decoder',track:'ai',stage:1,title:'从源词、目标右移到逐词翻译',chapter:'transformer-model',anchor:'encoder-decoder-translation',pack:'encoder-decoder',files:['encoder_decoder.py','source.json'],env:'Python 3.12 · PyTorch 2.5.1 · CPU',kind:'真实训练、掩码对照与逐词生成',observe:'核对源句和目标前缀各提供什么，分别改变未来目标和源端填充，再从起始词逐步生成。',scope:'固定小词表和合成组合，只验证本实验的结构、数值与输出。'},
 {id:'cloud-network-policy',track:'cloud',stage:2,title:'为什么 DNS 失败而订单端口仍然可达',chapter:'k8s-networking',anchor:'kubernetes-network-policy-run',pack:'kubernetes-network-policy',files:['network_policy_lab.py'],env:'Linux Docker · kind 0.33.0 · Kubernetes 1.35.8 · Cilium 1.20.4',kind:'真实 Kubernetes 策略与跨节点 Pod 连接',observe:'连续七个策略阶段分别发 DNS 和新建 TCP/HTTP 请求，独立核对源、目的 Pod、后端 UID 和清理结果。',scope:'两个 kind 节点同属一台 Linux 主机。观测直接访问 Pod IP 与单独的 Service 解析。'},
 {id:'agent-mcp-recovery',track:'agent',stage:2,title:'图没保存回执，工具已经提交时怎样恢复',chapter:'durable-workflows',anchor:'mcp-commit-recovery',pack:'mcp-recovery',files:['workflow.py','mcp_bridge.py','source.json','README.md'],env:'Python 3.12 · LangGraph 1.2.20 · MCP 2.3.0 · POSIX',kind:'真实 SDK、进程崩溃与接收方事务',observe:'在回执到达后杀掉图进程，再启动新进程与新 MCP 会话。两次调用只留一份 42 报告，尝试号反例留下两份。',scope:'本机 stdio、独立 SQLite 提交与图检查点。Kairo 和远端恢复按目标环境验收。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='cloud-sql-snapshot')+1,0,
 {id:'cloud-innodb',track:'cloud',stage:2,title:'从实际扫描行数走到 InnoDB 死锁回滚',chapter:'database-index-locks',anchor:'native-innodb-lab',pack:'innodb',files:['innodb_lab.py'],env:'Linux Docker · MySQL 8.4.13 · Python 3.9+',kind:'真实 InnoDB 执行树与持久连接',observe:'同一查询对照 4,096 与 51 行的扫描节点，读真实锁等待边，核对 1213、受害事务整笔回滚与存活方的余额和回执。',scope:'单容器与合成数据。固定主键记录锁与读查询范围；云数据库、复制和吞吐需另验。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='ai-manual-sharding')+1,0,
 {id:'ai-native-fsdp',track:'ai',stage:2,title:'用原生 FSDP 跑两次正确的全局更新',chapter:'distributed-training',anchor:'native-fsdp-run',pack:'native-fsdp',files:['fsdp_lab.py'],env:'Python 3.12 · PyTorch 2.5.1 · 两个 CPU/Gloo 进程',kind:'真实 FULL_SHARD、Profiler 与 Adam 更新',observe:'每个 rank 三项参数和梯度，两份 Adam 历史各三项。重建完整状态，核对两次全批次参考及不等局部均值反例。',scope:'固定单机 CPU、模型与输入。完整状态在内存中提取。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='cloud-volume')+1,0,
 {id:'cloud-native-csi-storage',track:'cloud',stage:2,title:'两个 Pod 如何接着写同一份数据',chapter:'k8s-storage',anchor:'native-csi-storage',pack:'csi-storage',files:['csi_storage_lab.py','volume_writer.py'],env:'Linux Docker · kind 0.33.0 · Kubernetes 1.35.8 · Python 3',kind:'真实 CSI 动态供应与 SQLite 写入',observe:'先验证声明等待消费者，再核对两个 Pod 的同一卷句柄、重复写入回执和最终回收。',scope:'单节点 kind 与 Hostpath CSI 示例驱动，记录覆盖 Pod 替换和 Delete 回收。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='ai-torch-checkpoint')+1,0,
 {id:'ai-fsdp-reshard',track:'ai',stage:2,title:'两个训练进程保存，三个新进程继续更新',chapter:'checkpoint-recovery',anchor:'fsdp-dcp-reshard',pack:'fsdp-reshard',files:['fsdp_reshard.py','fsdp_lab.py'],env:'Python 3.12 · PyTorch 2.5.1 · CPU/Gloo',kind:'真实 FSDP、DCP 与 Adam 恢复',observe:'区分具名保存分片和展平训练分片，核对恢复后一步与连续路径，并用缺 Adam 和错游标验证拒绝条件。',scope:'本机 CPU、同步保存与完整更新边界。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='agent-mcp-recovery')+1,0,
 {id:'agent-approval-reentry',track:'agent',stage:2,title:'批准之后撤权，恢复时还能做什么',chapter:'durable-workflows',anchor:'native-approval-reentry',pack:'approval-reentry',files:['workflow.py','mcp_bridge.py','source.json'],env:'Python 3.12 · LangGraph 1.2.20 · MCP 2.3.0 · POSIX',kind:'真实 SDK、中断、进程崩溃与接收库事务',observe:'在等待与提交后分别撤权，按当前权限、原回执和接收库报告数判断零效果、既有效果和待确认。',scope:'本机 stdio、固定主体与 SQLite。目标平台身份与跨机事务另验。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='ai-native-inference')+1,0,
 {id:'ai-native-inference-queue',track:'ai',stage:2,title:'两条真实请求怎样在单槽与双槽里推进',chapter:'inference-performance',anchor:'native-inference-queue',pack:'native-inference-queue',files:['concurrency_lab.py','make_fixture.py'],env:'Python 3 · llama.cpp b12110 · macOS arm64 CPU',kind:'真实 HTTP 流、引擎任务日志与指标',observe:'从原生任务身份区分等待和同时活跃，再用客户端时钟复算 TTFT 与 TPOT。',scope:'两条固定请求，单槽和双槽各三次。生产容量与 GPU 需要对应环境。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='ai-ring-context-training')+1,0,
 {id:'ai-ragged-ring',track:'ai',stage:2,title:'长序列切不均时，怎样排除填充行',chapter:'flash-attention-io',anchor:'ragged-ring-training',pack:'ragged-ring',files:['ring_ragged.py','record.py'],env:'Python 3.12 · PyTorch 2.5.1 · CPU/Gloo',kind:'真实点对点收发与梯度对照',observe:'核对每个分片的全局起点和真实长度，再去掉有效行掩码，看零填充怎样改变归一化。',scope:'单机 CPU 多进程数值与通信验证。完整参考矩阵用于核对。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='ai-native-inference')+1,0,
 {id:'ai-native-inference-prefix',track:'ai',stage:2,title:'同槽空闲后怎样复用提示，清除后重算几项',chapter:'model-serving',anchor:'native-inference-prefix',pack:'native-inference-prefix',files:['prefix_lab.py','make_fixture.py'],env:'Python 3 · llama.cpp b12110 · macOS arm64 CPU',kind:'实际 HTTP、槽状态与缓存操作',observe:'对比同一个提示复用三项与清除后全部重算，核对保留位置和相同输出。',scope:'固定合成模型和单槽。记录逻辑缓存状态。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='ai-native-inference-prefix')+1,0,
 {id:'ai-rope-window-cache',track:'ai',stage:2,title:'一批跨过槽位边界，哪一行会先算错',chapter:'position-encoding',anchor:'native-rope-window-cache',pack:'rope-window-cache',
  files:['rope_window_cache.py','requirements.txt'],env:'Python 3.12 · PyTorch 2.5.1 · CPU 双精度',
  kind:'原生注意力与两种缓存错误对照',
  observe:'比较整段与四批续算，找出把槽号当旋转位置和提前覆盖旧槽各自影响的第一行。',
  scope:'固定投影向量、四槽与滑动窗口。生产块池和设备性能需要各自验证。'},
 {id:'ai-native-metal-inference',track:'ai',stage:2,title:'同一个请求的注意力在哪个设备上算',chapter:'model-serving',anchor:'native-metal-inference',pack:'native-metal-inference',
  files:['metal_inference.py','make_fixture.py'],env:'Python 3 · llama.cpp b12110 · Apple M4 Pro',kind:'真实回环 HTTP、CPU 与 Metal 节点对照',
  observe:'在每个实际批次定位 Q/K/V 投影、注意力 Softmax 和输出投影，再核对两个设备的词元与缓存计数。',
  scope:'同一台机器、一个槽、同一合成模型及四条请求。用于核对执行路径，端到端时延、生产容量和 CUDA 另测。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='cloud-sre')+1,0,
 {id:'cloud-collector-sampling',track:'cloud',stage:2,title:'同一批追踪为何导出三条和两条',chapter:'observability',anchor:'collector-sampling-check',pack:'otel-tail-ledger',files:['collector.yaml','tail_ledger.py'],env:'Python 3.12 · OpenTelemetry Collector Contrib 0.130.0',kind:'真实 OTLP/HTTP 与两条采集管道',observe:'核对接收器、处理器和导出器，比较全量与错误采样的分母。',scope:'本机 Collector 与三个固定任务。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='agent-observation')+1,0,
 {id:'agent-otel-tail-ledger',track:'agent',stage:2,title:'失败尝试、成功任务与提交效果怎样分开数',chapter:'agent-observability',anchor:'native-tail-sampling-ledger',pack:'otel-tail-ledger',files:['tail_ledger.py','collector.yaml','source.json'],env:'Python 3.12 · OTel SDK 1.44.0 · Collector Contrib 0.130.0',kind:'真实 HTTP、采样导出与 SQLite 对账',observe:'找出提交后 503 并重试成功的根跨度，再用任务与接收库分开核对次数。',scope:'单机采集与本地任务账本。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='cloud-message-native')+1,0,
 {id:'cloud-jetstream-redelivery',track:'cloud',stage:2,title:'重投时旧消费者还能写吗',chapter:'serverless-execution',anchor:'native-jetstream-redelivery',pack:'jetstream-redelivery',files:['jetstream_redelivery.py'],env:'Python 3.12 · NATS Server 2.15.2 · nats-py 2.16.0',kind:'真实重投与接收方事务',observe:'跟踪同一条消息的两次投递。对照直接追加、按业务键去重和代际检查的结果。',scope:'单机真实消息代理，固定输入与接收库。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='ai-native-inference-queue')+1,0,
 {id:'ai-native-metal-queue',track:'ai',stage:2,title:'两条请求同时在场，哪一批真的一起算',chapter:'inference-performance',anchor:'native-metal-queue',pack:'native-metal-queue',
  files:['metal_queue.py','queue_client.py','make_fixture.py'],env:'Python 3 · llama.cpp b12110 · Apple M4 Pro',kind:'实际 HTTP 流、设备计算批次与逐请求输出',
  observe:'用同一批的两行序列和位置，对上 Metal 注意力节点和各自的流式输出。',
  scope:'同一台机器、两条固定请求、单槽与双槽各一次。记录只用于验证合批与输出归属。'},
 {id:'ai-native-ngram-speculation',track:'ai',stage:2,title:'草稿被拒以后，目标模型从哪格继续',chapter:'speculative-decoding',anchor:'native-ngram-speculation',pack:'native-ngram-speculation',
  files:['ngram_lab.py','make_fixture.py'],env:'Python 3 · llama.cpp b12110 · macOS arm64 CPU',kind:'实际流式输出、验证批次与回退日志',
  observe:'用相同输出核对全接受、部分接受和无草稿，再在批次日志定位被拒位置及修正词元。',
  scope:'同一合成模型、四条固定提示、单槽贪心。耗时、吞吐与随机采样另验。'},
 {id:'ai-vllm-block-lifecycle',track:'ai',stage:2,title:'引用归零的块还会命中吗',chapter:'inference-performance',anchor:'vllm-block-lifecycle',pack:'vllm-block-lifecycle',files:['block_lifecycle.py','fetch_upstream.py'],env:'Python 3.12 · 固定提交的 vLLM V1 源码',kind:'真实分配器的 CPU 元数据路径',observe:'跟踪块 1 的共享引用、空闲队列与缓存键，再用容量耗尽检查拒绝路径。',scope:'上游块池和自由队列的独立执行。完整引擎及设备张量另验。'},
 {id:'ai-vllm-scheduler',track:'ai',stage:2,title:'还有计算额度，新请求为什么要等',chapter:'inference-performance',anchor:'native-vllm-scheduler',pack:'vllm-scheduler',files:['scheduler_lab.py','upstream.py'],env:'Python 3.12 · msgspec 0.19.0 · vLLM v0.10.2 固定源码',kind:'上游调度与块管理的 CPU 实跑',observe:'逐轮核对 A 和 B 计算的实际位置，找出 C 等待时的空闲块数，再看 B 结束后何时入场。',scope:'真实请求、调度和缓存元数据。固定模型回复，无设备张量或计时。'}
);
labLearningCatalog.splice(labLearningCatalog.findIndex(unit=>unit.id==='agent-mcp-protocol')+1,0,
 {id:'agent-mcp-http-cancellation',track:'agent',stage:2,title:'断流以后，怎样确认报告有没有提交',chapter:'mcp-protocol',anchor:'mcp-http-cancellation-run',pack:'mcp-http-cancellation',files:['cancellation_lab.py'],env:'Python 3.12 · MCP SDK 2.3.0 · Uvicorn',kind:'真实 HTTP 断流、工具清理与 SQLite 回执',observe:'在工具提交前后各关闭一次响应流，查看同一客户端的查询结果与接收库。',scope:'本机 HTTP 与固定报告任务。远程身份和 Kairo 接入另验。'}
);
labLearningCatalog.push(
 {id:'cloud-prometheus-live-burn',track:'cloud',stage:2,title:'一个实例计数器归零，长短窗口怎样改变告警状态',chapter:'slo',anchor:'live-prometheus-burn',pack:'prometheus-live-burn',files:['prometheus_live_burn.py','live-burn.rules.yaml'],env:'Linux amd64 · Python 3.12 · Prometheus 3.5.0',kind:'真实抓取、PromQL 与告警评估',observe:'对照两实例计数器归零前后的聚合，再核对 pending、firing 和恢复后的状态。',scope:'本机回环目标与缩短的教学窗口。'},
 {id:'ai-native-python-extension',track:'ai',stage:1,title:'扩展文件已经生成，为什么 Python 还是导不进来',chapter:'operator-profiling',anchor:'native-python-extension',pack:'python-extension-loader',files:['extension_loader.py','rowdot.c','rowdot_module.c'],env:'macOS arm64 · CPython 3.12 · clang 17',kind:'真实 C 扩展、链接与动态装载',observe:'用一个行点积区分编译报错、链接符号、模块发现、初始化符号和动态库依赖。',scope:'本机 CPython 和 dyld，固定 CPU 输入。'},
 {id:'agent-native-parallel-merge',track:'agent',stage:2,title:'两个分支同时给出发布提议，怎样保证只生效一次',chapter:'durable-workflows',anchor:'native-parallel-merge',pack:'langgraph-parallel-merge',files:['parallel_merge.py','fixture.json','requirements.txt'],env:'Python 3.12 · LangGraph 1.2.20 · SqliteSaver 3.1.3',kind:'真实同一步归并与 SQLite 检查点',observe:'比较默认同键冲突、同值归并、不同值转审核，以及重放后接收方效果数。',scope:'本机合成任务、持久检查点与独立接收库。'},
 {id:'cloud-redis-client-tracking',track:'cloud',stage:2,title:'收到 Redis 失效后，旧读回复还能填回本地吗',chapter:'cache-consistency',anchor:'native-redis-client-tracking',pack:'redis-client-tracking',files:['tracking_lab.py'],env:'Python 3.9+ · Redis 8.2.6 · 本机 Unix 套接字',kind:'真实 Redis 回复与推送',observe:'比较单连接顺序、双连接旧回复和断开通知连接，再核对当前读取编号。',scope:'单进程 Redis 和受控的客户端消费顺序。'},
 {id:'ai-native-amp-window',track:'ai',stage:2,title:'前向损失有限，为什么优化器跳过这次更新',chapter:'gpu-memory',anchor:'native-amp-window',pack:'native-amp-window',files:['amp_window.py'],env:'Python 3.12 · PyTorch 2.5.1 · CPU FP16 autocast',kind:'真实缩放反向、AdamW 与检查点',observe:'找出转回 FP32 前的非有限梯度，再对照跳步、重试以及只恢复模型和优化器的结果。',scope:'单进程 CPU 标量模型、两个微批与非融合 AdamW。'},
 {id:'agent-native-qdrant-retrieval',track:'agent',stage:2,title:'两个高分结果，为什么只能交付一条正文',chapter:'agent-retrieval',anchor:'native-qdrant-retrieval',pack:'qdrant-retrieval',files:['qdrant_retrieval.py','source.json'],env:'Python 3.12+ · Qdrant 1.19.1 · Linux amd64 CPU',kind:'真实向量查询与 SQLite 正文准入',observe:'比较全局截断与租户内筛选。撤销权限并更新源版本后，核对候选、实际正文读取和返回数量。',scope:'单节点精确向量检索、固定合成语料与本机权威来源。'},
 {id:'cloud-spiffe-workload-identity',track:'cloud',stage:2,title:'两个工作负载都通过双向 TLS，谁可以写报告',chapter:'iam-security',anchor:'native-spiffe-workload-identity',pack:'spiffe-workload-identity',files:['spire_identity_lab.py','workload.go','go.mod','go.sum'],env:'Linux amd64 · Python 3.11+ · Go 1.26.1 · SPIRE 1.16.0',kind:'原生工作负载证明与双向 TLS',observe:'对照同一系统用户下的三种身份结果。用证书主体与报告账本核对 403 和 201。',scope:'单 Linux 节点、固定执行文件选择器与本机回环请求。'},
 {id:'ai-native-model-rollout',track:'ai',stage:2,title:'服务探活通过，模型输出还可能错吗',chapter:'ai-lifecycle',anchor:'native-model-rollout',pack:'native-model-rollout',files:['rollout_lab.py','make_fixture.py'],env:'Python 3 · llama.cpp b12110 · macOS arm64 CPU',kind:'三个原生模型服务与流式输出',observe:'先按固定输出拒绝错误候选，再看已接收的流怎样跨过发布与回退。',scope:'固定合成模型、本机 CPU 和教学入口。入口固定交付版本，原生计算可能已经完成。'},
 {id:'agent-mcp-http-authorization',track:'agent',stage:2,title:'通过 MCP 令牌校验后，能读哪个租户的报告',chapter:'mcp-protocol',anchor:'native-mcp-http-authorization',pack:'mcp-http-authorization',files:['authorization_lab.py','orders.json','requirements.txt'],env:'Python 3.12 · MCP SDK 2.3.0 · Uvicorn',kind:'真实 HTTP 授权与 SQLite 读取证据',observe:'沿同一签名令牌区分受众、通用权限和报告归属。用账本核对正文到底读了几次。',scope:'本机资源服务端和临时签发夹具。登录流程、生产身份服务与 Kairo 另验。'}
);
labLearningCatalog.push(
 {id:'tls-proxy-hops',track:'cloud',stage:2,title:'沿 HTTPS 代理分别校验入口和上游',chapter:'vpc-network',anchor:'native-tls-proxy',pack:'tls-proxy-hops',files:['tls_proxy_hops.py'],env:'Python 3.9+ · OpenSSL / LibreSSL',kind:'真实本机 HTTPS',observe:'四次入口握手均成功。A 的两个请求复用上游连接，B 的证书名称错配得到 502，B 的 HTTP 账本没有这次请求。',scope:'本机 HTTP/1.1 与独立证书链。'},
 {id:'ai-triton-tail-mask',track:'ai',stage:2,title:'一个尾块为什么会改掉整行概率',chapter:'operator-profiling',anchor:'triton-tail-mask-run',pack:'triton-tail-mask',files:['triton_tail_mask.py','requirements-linux.txt'],env:'Linux x86_64 · Python 3.12 · Triton 3.3.1',kind:'真实 Triton CPU 解释器',observe:'用独立参考与输出哨兵核对读写掩码，再看补零为何会改变有效位置的分母。',scope:'CPU 解释器运行，真实 GPU 数值、计时和访存仍待设备验收。'},
 {id:'agent-mcp-trace-reentry',track:'agent',stage:2,title:'进程退出后，怎样把新追踪接回原执行',chapter:'agent-observability',anchor:'native-mcp-trace-reentry',pack:'mcp-trace-reentry',files:['trace_reentry.py','requirements.txt'],env:'Python 3.12 · MCP SDK 2.3.0 · OpenTelemetry SDK 1.45.2',kind:'真实 MCP HTTP、跨度链接与 SQLite',observe:'分别核对三条追踪、一个跨度链接和同一业务回执。用接收方账本数实际写入。',scope:'本机三个独立调用进程、一个 MCP HTTP 服务及 SQLite。Kairo 接入另验。'}
);
labLearningCatalog.push(
 {id:'cloud-kubernetes-pdb-rollout',track:'cloud',stage:2,title:'驱逐被拒绝，为什么发布仍能减少就绪副本',chapter:'k8s-workloads',anchor:'native-pdb-eviction-rollout',pack:'kubernetes-pdb-rollout',files:['pdb_rollout.py'],env:'Linux x86_64 · kind 0.33.0 · Kubernetes 1.35.8',kind:'真实驱逐、直接删除与滚动发布',observe:'对照宽松和收紧预算的驱逐响应，再检查直接删除、就绪副本减少与回退。',scope:'单节点 kind，使用固定就绪探测与 Pod 身份。'},
 {id:'ai-ddp-uneven-join',track:'ai',stage:2,title:'一个 rank 提前读完，另一个怎样继续',chapter:'ddp-code',anchor:'native-ddp-join',pack:'ddp-uneven-join',files:['ddp_uneven_join.py','requirements.txt'],env:'Python 3.12 · PyTorch 2.5.1 CPU/Gloo',kind:'真实两进程 DDP 与动量对照',observe:'比较等待超时、协调报错和两种归约分母，再检查两份模型参数相等时动量是否相同。',scope:'本机两 CPU 进程、固定 SGD 动量和合成输入。物理多机与 GPU 另验。'},
 {id:'agent-mcp-catalog-refresh',track:'agent',stage:2,title:'工具改了含义，怎样处理旧批准',chapter:'mcp-protocol',anchor:'native-mcp-catalog-refresh',pack:'mcp-catalog-refresh',files:['catalog_refresh.py','requirements.txt'],env:'Python 3.12 · MCP SDK 2.3.0',kind:'真实 MCP 工具列表变化与 SQLite 对照',observe:'观察工具变化通知和重读目录，再对照旧批准的拒绝和新批准产生的唯一写入。',scope:'本机 stdio 会话、固定工具描述和独立 SQLite。Kairo 接入另验。'}
);
labLearningCatalog.push({id:'cloud-storage-journal-recovery',track:'cloud',stage:2,title:'从备份恢复到 103，再处理下一笔事务',chapter:'storage-recovery',anchor:'section-8',pack:'cloud-deepening',files:['recovery_lab.py'],env:'Python 3.9+ · 标准库 / SQLite',kind:'真实备份与事务回放',observe:'核对序号 102 缺失时的拒绝、重复 103 的结果，以及恢复后处理 104 的余额。',scope:'本机 SQLite 备份与教学日志，MySQL 日志另见 C3.4。'});
labLearningCatalog.push({id:'ai-int8-batch-quality',track:'ai',stage:2,title:'同一个输入，为什么换个同批伙伴就改了分类',chapter:'quantization-serving',anchor:'native-int8-batch-quality',pack:'int8-batch-quality',files:['int8_batch_quality.py','requirements.txt'],env:'macOS arm64 · Python 3.12 · PyTorch 2.5.1 QNNPACK',kind:'真实动态 INT8 与分类门槛',observe:'固定目标行，改变同批输入范围。先核对类别与得分，再只对通过质量门槛的形状比较实际前向耗时。',scope:'本机单线程线性层与固定输入。服务负载与 GPU 另验。'});
labLearningCatalog.push(
 {id:'cloud-process-wait-accounting',track:'cloud',stage:0,title:'同样的 42，程序是在等数据还是等退出',chapter:'linux-resource',anchor:'process-wait-accounting',pack:'process-wait-accounting',files:['process_wait.py'],env:'Python 3.8+ · macOS/Linux',kind:'真实进程、管道和阻塞等待',observe:'交换写入与退出的顺序，看等待落在读管道还是回收子进程，再把父进程 CPU 时间和子进程 CPU 时间分开核对。',scope:'本机 POSIX 管道、单个子进程与本轮固定输入。'},
 {id:'ai-useful-token-throughput',track:'ai',stage:2,title:'同样的 352 个目标，怎样比较训练吞吐',chapter:'training-performance',anchor:'cpu-useful-token-throughput',pack:'training-useful-tokens',files:['useful_tokens.py','requirements.txt'],env:'macOS arm64 · Python 3.12 · PyTorch 2.5.1 CPU',kind:'真实单线程训练更新与性能轨迹',observe:'核对两条路径的损失、梯度与更新结果，再看填充行数和同一有效分母下的吞吐。用错误分母重现不同更新。',scope:'本机固定 token 分类器、两条 CPU 路径与配对计时。'},
 {id:'ai-rope-offset',track:'ai',stage:1,title:'位置整体平移后，什么量保持不变',chapter:'position-encoding',anchor:'section-9',pack:'textbook-examples',folder:'model-foundations',files:['rope.py'],env:'Python 3.9+ · 标准库',kind:'可运行二维数值对照',observe:'比较平移前后的查询与键点积，再故意用错查询位置，看点积如何变化。',scope:'固定二维向量与旋转角度。'},
 {id:'ai-roofline-model',track:'ai',stage:1,title:'融合算子和矩阵分块分别省下哪些字节',chapter:'roofline-model',anchor:'section-8',pack:'textbook-examples',folder:'cloud-foundations',files:['roofline-model.py'],env:'Python 3.9+ · 标准库',kind:'可运行字节预算模型',observe:'计算融合前后的元素读写量，再用矩阵乘的运算量和输入输出字节推导算术强度。',scope:'理想化数据搬运账与模型上限，设备实测另见算子分析章。'}
);
labLearningCatalog.push(
 {id:'cloud-http-operation-retry',track:'cloud',stage:0,title:'响应超时后，复用原动作编号会发生什么',chapter:'distributed-systems',anchor:'http-operation-retry',pack:'http-operation-retry',files:['http_operation_retry.py'],env:'Python 3.9+ · 标准库',kind:'真实 HTTP 超时与 SQLite 回执',observe:'首次请求提交后暂缓响应。比较原动作重试、同一编号改参数和新编号，按回执与效果记录独立核对。',scope:'本机 HTTP、并发请求和 SQLite 事务。'},
 {id:'ai-training-submission-preflight',track:'ai',stage:2,title:'训练启动前，怎样发现版本和文件内容不一致',chapter:'training-platform',anchor:'native-training-submission-preflight',pack:'training-submission-preflight',files:['submission_preflight.py'],env:'Python 3.9+ · 标准库',kind:'真实文件、SQLite 登记与子进程',observe:'用九个提交检查同键复用、意图冲突、摘要不符和正常新作业。数子进程的实际启动，核对两次精确参数更新。',scope:'本机可信输入、SQLite 与子进程，作业登记与启动之间有独立的恢复窗口。'},
 {id:'ai-kubernetes-gloo-job',track:'ai',stage:2,title:'一个训练 Job 等到第二个节点后，怎样证明共同更新',chapter:'kubernetes-training',anchor:'native-kubernetes-gloo-job',pack:'kubernetes-gloo-job',files:['Dockerfile','job.json','observe_job.py','rank_step.py'],env:'Linux x86_64 · kind 0.33.0 · Kubernetes 1.35.8 · PyTorch 2.5.1 CPU/Gloo',kind:'真实 Indexed Job、Pod DNS 与两节点 DDP',observe:'确认同一批 Pod 从一个不可调度走到两个工作节点，随后核对共同会合、四个样本和两份权重 1.125。',scope:'同一 Linux 宿主的两个 kind 工作节点，固定输入和一次 CPU 更新。物理多机、GPU 和 NCCL 待验。'}
);
labLearningCatalog.push(
 {id:'cloud-bounded-worker-queue',track:'cloud',stage:0,title:'加一个工作线程，任务改在哪等',chapter:'concurrency-pools',anchor:'bounded-worker-queue',pack:'bounded-worker-queue',files:['bounded_worker_queue.py'],env:'Python 3.9+ · 标准库',kind:'真实线程、队列与信号量',observe:'固定一个排队位置和一个下游许可，对照一线程与两线程时谁排队、谁占住线程等许可、谁被拒绝。',scope:'本机真实同步原语、固定四次提交和受控放行。'},
 {id:'ai-warp-memory-sectors',track:'ai',stage:1,title:'同一矩阵按行和按列读，地址会落在哪些扇区',chapter:'gpu-execution',anchor:'native-warp-memory-sectors',pack:'warp-memory-sectors',files:['address_trace.c','run_trace.py'],env:'Python 3.9+ · C17 编译器 · macOS arm64 实测',kind:'真实主机地址轨迹与 CUDA 编译对照',observe:'核对连续、偏移、跨行和尾部的 lane 地址。比较每组扇区数的累加与整块矩阵的去重覆盖，再读 PTX 的地址计算。',scope:'C17 本机读取与 32 字节地址归组模型。PTX 来自固定编译记录，设备事务和耗时待验。'}
);
labLearningCatalog.push(
 {id:'cloud-incident-connection-lease',track:'cloud',stage:3,title:'同样拿不到连接，等待发生在哪',chapter:'incident',anchor:'incident-connection-lease',pack:'incident-connection-lease',files:['incident_connection_lease.py'],env:'Python 3.9+ · SQLite 与标准库 HTTP',kind:'真实 SQLite 锁、HTTP 与连接租借',observe:'保留 B 等连接的表象，分别核对 A 遇到 SQLITE_BUSY 或持连接等待 HTTP。移动 HTTP 调用后，检查 B 能否提前完成并保留原回执。',scope:'本机单连接租借、固定 SQLite 与 HTTP 夹具，观察事件顺序。'},
 {id:'ai-ddp-target-preflight',track:'ai',stage:2,title:'四份日志怎样核对会合、归约和设备绑定',chapter:'multinode-lab',anchor:'native-ddp-target-preflight',pack:'ddp-target-preflight',files:['target_probe.py','run_local.py'],env:'本机 PyTorch CPU/Gloo · 目标为两台 Linux 与四张完整 GPU',kind:'真实本机四进程与目标验收门槛',observe:'两份 launcher 启动四个本机进程，核对每个 rank 的 [1,2,3,4] 与总和 10。用同一门槛拒绝 CPU 或同宿主记录，再按卡型准备真实环境。',scope:'本机四进程 Gloo 已运行。物理双机、GPU/NCCL 和硬件分配仍待目标环境验收。'}
);
labLearningCatalog.push({
 id:'ai-pd-split',track:'ai',stage:2,title:'首项已经收到，后续词元为什么还会等',chapter:'inference-performance',anchor:'native-pd-split',pack:'pd-split',
 files:['pd_split.py'],env:'Python 3.9+ · Linux / macOS',kind:'实跑记录',
 observe:'对同一批输入比较单进程共置、双进程共置和分池，复算首项延迟和后续间隔，并核对交接字节与损坏后的拒绝。',
 scope:'真实本机进程与套接字，整数玩具核；目标推理引擎与跨机性能待验。'
});
labLearningCatalog.push({
 id:'ai-torch-compile-graph',track:'ai',stage:2,title:'同一函数为什么被捕获成多张图',chapter:'operator-profiling',anchor:'torch-compile-graph-break',pack:'torch-compile-graph',
 files:['compile_graph.py','requirements.txt'],env:'CPU · 按实验说明安装固定 PyTorch',kind:'实跑记录',
 observe:'逐项核对正、负、零三种输入，再比较 Python 取标量、张量条件和输入形状变化时捕获的图。',
 scope:'TorchDynamo 捕获与 CPU FX 执行，另有 TorchInductor CPU 产物实测；GPU 内核和性能另行验证。'
});
labLearningCatalog.push(
 {id:'cloud-postgres-pitr',track:'cloud',stage:2,title:'同一份备份为什么可以恢复出 125 或 0',chapter:'storage-recovery',anchor:'native-postgres-pitr',pack:'postgres-pitr',
  files:['postgres_pitr.py','pitr.sh'],env:'本机 Linux Docker · PostgreSQL 17',kind:'实跑记录',
  observe:'用同一基础备份和 WAL 在隔离实例核对具名恢复点、归档末端和恢复后写入。',
  scope:'真实 PostgreSQL 17 归档恢复。生产对象存储、切流和 RTO 需在目标系统测量。'},
 {id:'agent-sandbox-process-group',track:'agent',stage:2,title:'停止 A 后，核对 B 仍能交付报告',chapter:'agent-sandbox',anchor:'native-sandbox-process-group',pack:'sandbox-process-group',
  files:['sandbox_process_group.py'],env:'macOS / Linux · Python 3.9+ 标准库',kind:'真实本机 POSIX 进程组',observe:'两组就绪后只停止 A，核对 A 的退出码和 EOF，再提交 B 的完成请求并读回报告 37。',scope:'自建父子进程和独立临时目录。容器复用与生产运行时另验。'},
 {id:'agent-sandbox-egress',track:'agent',stage:2,title:'工作进程能连接代理，为什么仍然读不到其他租户',chapter:'agent-sandbox',anchor:'native-sandbox-egress',pack:'sandbox-egress',
  files:['sandbox_egress.py','fixture.json'],env:'本机 Linux Docker · Python 容器',kind:'实跑记录',
  observe:'复跑沙箱直连拒绝、代理读取本租户和跨租户拒绝，对照后端实际访问。',
  scope:'真实 Docker 网络和本机 HTTP 请求。生产网络插件与服务身份另行验收。'}
);
labLearningCatalog.push(
 {id:'cloud-alert-notification',track:'cloud',stage:2,title:'三条告警都触发，哪条送到接收端',chapter:'slo',anchor:'native-alert-notification',pack:'alert-notification',
  files:['alert_notification.py','release-provenance.json'],env:'Python 3 · Prometheus 3.5.0 · Alertmanager 0.34.2 · macOS arm64 实测',kind:'真实规则、分组与回环 HTTP',
  observe:'对照提前恢复、持续触发和静默，分别看规则状态、Alertmanager 入站和接收端请求。',
  scope:'固定三条序列、本机两个进程及回环 HTTP 接收端。外部通知渠道与高可用集群另行验收。'},
 {id:'ai-pipeline-schedules',track:'ai',stage:2,title:'改成 1F1B 后，哪些微批还在等反向',chapter:'tensor-parallel-math',anchor:'native-pipeline-schedules',pack:'pipeline-schedules',
  files:['pipeline_schedules.py','requirements.txt'],env:'Python 3.12 · PyTorch 2.5.1 · 两进程 CPU/Gloo',kind:'真实流水线调度与梯度对照',
  observe:'比较两种调度的前向、反向和待反向微批数，再与整批参考核对梯度与参数更新。',
  scope:'本机双精度、四个等长微批。1F1B 保留成批收发的全部工作句柄。峰值只计微批，不计设备显存或吞吐。'},
 {id:'cloud-cpu-quota-http',track:'cloud',stage:2,title:'CPU 配额收紧后，100 次请求去了哪里',chapter:'elasticity',anchor:'native-cpu-quota-http',pack:'cpu-quota-http',
  files:['cpu_quota_http.py','workload.py'],env:'本机 Linux Docker · cgroup v2 · 已缓存 Python 镜像',kind:'真实 HTTP 与 CPU 限额计数',
  observe:'同一发送计划，对照实际 CPU 配额、HTTP 完成和拒绝以及成功请求的排队时长。',
  scope:'一个工作线程、四个等待位置、固定 CPU 工作量。云实例容量、节点扩容和账单另行验证。'},
 {id:'ai-inference-placement',track:'ai',stage:2,title:'八张卡配一组 TP8，还是两组 TP4',chapter:'inference-performance',anchor:'tp-placement',pack:'inference-placement',
  files:['placement_budget.py','replica_gloo.py','requirements.txt'],env:'Python 3.12 · 预算用标准库，分片需 PyTorch 2.5.1 CPU/Gloo',kind:'八卡账本与真实四进程分片',
  observe:'核对每组权重和 KV 空间、请求能否进入某个副本，以及组内归约的数值。',
  scope:'70B 账本使用声明的设备与形状。真实运行是本机一层小注意力，GPU 显存和 vLLM 性能另验。'},
 {id:'agent-mcp-result-receipt',track:'agent',stage:2,title:'工具写入已提交，为什么宿主仍要拒绝回执',chapter:'mcp-protocol',anchor:'native-mcp-result-receipt',pack:'mcp-result-receipt',
  files:['receipt_lab.py','orders.json','requirements.txt'],env:'Python 3.12 · MCP SDK 2.3.0 · SQLite',kind:'真实本机 HTTP 与提交后核对',
  observe:'比较类型错误、操作键错误与正常回执，再按原操作键只读查询。',
  scope:'本机 Streamable HTTP、固定批次和两个 SQLite 库。远端服务权限与查询可用性需另行验收。'}
);
labLearningCatalog.push(
 {id:'ai-dp-tp-mesh',track:'ai',stage:2,title:'四个进程为什么只有三条样本',chapter:'tensor-parallel-math',anchor:'native-dp-tp-mesh',pack:'dp-tp-mesh',
  files:['dp_tp_mesh.py','requirements.txt'],env:'Python 3.12 · PyTorch 2.5.1 · 四进程 CPU/Gloo',kind:'真实 TP、DDP 和梯度对照',
  observe:'比较横向 TP、纵向 DP 的组成员。用相同预测下的三组梯度，找出错分母和错分组。',
  scope:'本机四进程，固定输入与一次 SGD 更新。设备拓扑、通信耗时与 GPU 训练另行验证。'}
);
labLearningCatalog.push(
 {id:'agent-workflow-version-resume',track:'agent',stage:2,title:'新版多问一个问题，旧批准交给谁',chapter:'durable-workflows',anchor:'native-workflow-version-resume',pack:'workflow-version-resume',
  files:['resume_lab.py','fixture.json','requirements.txt'],env:'Python 3.12 · LangGraph 1.2.20 · SQLite',kind:'真实检查点与跨进程恢复',
  observe:'用同一个旧中断编号恢复三次，检查实际写入的目标和份数。',
  scope:'本机两进程、固定审批与独立 SQLite 接收库。Kairo 的版本调度另行验收。'}
);
labLearningCatalog.push(
 {id:'cloud-controller-reconcile',track:'cloud',stage:2,title:'外部已经创建，重启后为什么只有一份',chapter:'delivery',anchor:'native-controller-reconcile',pack:'controller-reconcile',
  files:['controller.go','main.go','go.mod','go.sum'],env:'Go 1.25+ · client-go 0.35.8 · Kubernetes 1.35.0 envtest',kind:'真实 API 对象、进程退出与回环 HTTP',
  observe:'核对进程退出前后的 UID、PUT 次数、已处理代际和删除期间的 GET 状态。',
  scope:'隔离的本机 API Server、etcd 与文件接收方。多副本、集群权限和真实云资源另验。'}
);
labLearningCatalog.push(
 {id:'ai-elastic-restart-step',track:'ai',stage:2,title:'第 2 步已经算完，为什么重启还要重算',chapter:'checkpoint-recovery',anchor:'native-elastic-restart-step',pack:'elastic-restart-step',
  files:['elastic_restart.py','requirements.txt'],env:'Python 3.12 · PyTorch 2.5.1 · 两进程 CPU/Gloo',kind:'真实 torchrun 进程退出与整组重启',
  observe:'比较两组进程号、已提交游标、重做的样本和恢复后的动量。',
  scope:'本机进程故障、同步文件检查点与固定输入。GPU、多机共享存储和断电需另验。'},
 {id:'agent-task-reconnect',track:'agent',stage:2,title:'受理响应丢了，重传之后还是原任务吗',chapter:'kairo-practice',anchor:'native-agent-task-reconnect',pack:'agent-task-reconnect',
  files:['reconnect_lab.py','readonly-contract.json','resources.json','requirements.txt'],env:'Python 3.12 · MCP SDK 2.3.0 · 本机 HTTP 与 SQLite',kind:'真实断线、任务续查与 MCP 读取',
  observe:'对照首次断线、原样重传和同编号改参数，再核对原会话的报告与资源侧读取。',
  scope:'公开本机参考实现、固定身份和工具步骤。Kairo 接入与模型决策由目标环境另验。'}
);
labLearningCatalog.push(
 {id:'cloud-redis-replica-promotion',track:'cloud',stage:2,title:'主库已经写成 v8，为什么新主库还停在 v7',chapter:'cache-consistency',anchor:'native-redis-replica-promotion',pack:'redis-replica-promotion',
  files:['replica_promotion.py'],env:'Python 3.9+ · Redis 8.2.6 · 本机 Unix 套接字与回环 TCP',kind:'真实复制确认、断链与手动提升',
  observe:'同一条写入走两遍。记录主库的 OK 和 WAIT 返回值，再从提升后的节点读取订单版本。',
  scope:'两个本机 Redis 进程。实验关闭持久化，手动停止主库并提升副本。'},
 {id:'ai-native-metal-gemm',track:'ai',stage:2,title:'同一块 GPU 上，分块矩阵乘法快多少',chapter:'operator-profiling',anchor:'native-metal-gemm',pack:'metal-gemm',
  files:['metal_gemm.swift','kernels.metal'],env:'macOS · Apple GPU · Swift 工具链',kind:'真实 Metal 执行与 GPU 计时',
  observe:'先用 CPU 参考逐元素核对六种形状，再比较两种实现的成对 GPU 命令缓冲区用时。',
  scope:'Apple M4 Pro 上的 FP32 小实验。CUDA、Nsight 和生产库性能按目标设备另验。'},
 {id:'ai-native-metal-softmax',track:'ai',stage:2,title:'一行 Softmax 怎样由 64 个 GPU 线程合作',chapter:'operator-profiling',anchor:'native-metal-softmax',pack:'metal-softmax',
  files:['metal_softmax.swift','kernels.metal'],env:'macOS · Apple GPU · Swift 工具链',kind:'真实 Metal 归约、溢出对照与 GPU 计时',
  observe:'核对 65 列怎样分给 64 个线程，再比较同形状下逐行处理与组内归约的九对用时。',
  scope:'Apple M4 Pro 上的连续有限 FP32 数据，计时区间为单个命令缓冲区。CUDA、注意力掩码和端到端时延分别验证。'},
 {id:'ai-native-metal-online-attention',track:'ai',stage:2,title:'更大的分数出现在新块，怎样合并旧块',chapter:'flash-attention-io',anchor:'native-metal-online-attention',pack:'metal-online-attention',
  files:['online_attention.swift','kernels.metal'],env:'macOS · Apple M4 Pro · Swift 工具链',kind:'真实 Metal 分块归一化与加权汇总',
  observe:'比较两种块宽和可见范围，找到最高分所在的块，复判只省去旧缩放时的输出。',
  scope:'固定分数和两维 V、FP32。融合 QK、反向、CUDA 与性能需要各自验证。'},
 {id:'agent-model-mcp-tool-choice',track:'agent',stage:2,title:'模型选中了工具，报告能直接读吗',chapter:'agent-runtime',anchor:'native-model-mcp-tool-choice',pack:'model-mcp-tool-choice',
  files:['model_tool_lab.py','fixture.json','assets.json','requirements.txt'],env:'Python 3.12 · MCP SDK 2.3.0 · llama.cpp b12110 · Qwen3-0.6B · 本机 CPU',kind:'真实模型选工具、MCP 读取与拒绝',
  observe:'从工具清单跟到模型选择、资源端授权和下一轮回答，再用读取记录核对越权分支。',
  scope:'三条固定问题、合成报告与本机测试身份。模型泛化、生产鉴权和 Kairo 接入需另验。'}
);
labLearningCatalog.push(
 {id:'cloud-kubernetes-admission',track:'cloud',stage:2,title:'账号能创建 Pod，为什么这份配置仍被拒绝',chapter:'iam-security',anchor:'native-kubernetes-admission',pack:'kubernetes-admission',
  files:['main.go','go.mod','go.sum'],env:'Go · Kubernetes 1.35.0 envtest · 本机 API Server 与 etcd',kind:'真实 RBAC、CEL 准入与回读',
  observe:'同一身份发送四份创建请求，逐项对照授权结果、准入状态与对象是否写入。',
  scope:'本机 API Server 和 etcd。验证对象是否写入，未启动工作节点或容器。'},
 {id:'ai-native-slot-handoff',track:'ai',stage:2,title:'换了推理进程，还能从原前缀继续算吗',chapter:'inference-performance',anchor:'native-slot-handoff',pack:'native-slot-handoff',
  files:['slot_handoff.py','make_fixture.py'],env:'Python 3 · llama.cpp b12110 · macOS arm64 CPU',kind:'真实推理缓存保存、恢复与坏文件对照',
  observe:'对照两个进程的保存和恢复，逐个核对续写位置，并在缓存文件损坏后走一遍冷启动。',
  scope:'两个本机 CPU 进程、同一小模型与同一二进制。计数描述前缀复用，GPU 缓存传输与流式接续另验。'},
 {id:'agent-rag-citation-oracle',track:'agent',stage:2,title:'金额一样，引用旧资料也算答对吗',chapter:'agent-retrieval',anchor:'native-rag-citation-oracle',pack:'rag-citation-oracle',
  files:['rag_lab.py','assets.json','fixture.json'],env:'Python 3.12 · SQLite FTS5 · Qwen3-0.6B · 本机 CPU',kind:'真实检索、生成与引用核对',
  observe:'对比当前资料、旧版索引和提前过滤三条路径，从资料版本和回答分别验收。',
  scope:'固定合成资料、同一条问题与本机小模型。证据只覆盖这三条路径。'}
);
labLearningCatalog.push(
 {id:'cloud-release-artifact-trust',track:'cloud',stage:2,title:'签名仍有效，为什么部署应停下来',chapter:'delivery',anchor:'native-release-artifact-trust',pack:'release-artifact-trust',
  files:['release_artifact_trust.py'],env:'Python 3 · Git 2.50.1 · OpenSSH 10.0p2 · 本机',kind:'真实签名验证、摘要和独立回读',
  observe:'对照已签记录和实际文件，分别制造别名变化与签名者不受信任，回读当前版本。',
  scope:'隔离的本机 Git、临时签名密钥与 tar 文件。未使用镜像仓库或部署服务。'},
 {id:'ai-prefetch-resume-step',track:'ai',stage:2,title:'数据已经准备好，重启后从哪一批继续',chapter:'data-pipeline',anchor:'native-prefetch-resume',pack:'prefetch-resume-step',
  files:['prefetch_resume.py','requirements.txt'],env:'Python 3 · PyTorch 2.5.1 · 本机 CPU 与两个加载进程',kind:'真实预取、动量更新和重启',
  observe:'分别按已提交批次和已准备批次恢复，核对首批身份、动量和最后权重。',
  scope:'固定小模型、本机 CPU 和有序加载。跨主机存储与 GPU 性能另验。'},
 {id:'agent-memory-withdrawal',track:'agent',stage:2,title:'偏好已经撤回，暂停的任务还会用吗',chapter:'agent-memory',anchor:'native-memory-withdrawal',pack:'memory-withdrawal',
  files:['memory_lab.py','fixture.json','requirements.txt'],env:'Python 3.12 · LangGraph 1.2.20 · SQLite · 本机 HTTP',kind:'真实持久快照、撤回、恢复和清理',
  observe:'分别读取当前偏好、旧任务快照和接收方记录。比较复用旧快照和发送前重查的实际输入。',
  scope:'固定合成偏好与本机接收服务。观察范围到发送内容与快照删除。'}
);
labLearningCatalog.push(
 {id:'cloud-sqlite-shard-routing',track:'cloud',stage:2,title:'两片数据一样多，为什么一个键仍打满一片',chapter:'database-index-locks',anchor:'native-sqlite-shard-routing',pack:'sqlite-shard-routing',
  files:['shard_routing.py'],env:'Python 3 · SQLite 3.51 · 本机文件',kind:'实际分片文件、查询计划和独立聚合对照',
  observe:'固定一组订单，比对两种分片键、实际查询位置和跨片合计，再把热键读次数接到容量计算。',
  scope:'本机 SQLite 文件与教学路由。容量题使用声明的速率，未测生产吞吐。'},
 {id:'ai-async-dcp-commit',track:'ai',stage:2,title:'异步保存成功，文件里是哪一步的参数',chapter:'checkpoint-recovery',anchor:'native-async-dcp-commit',pack:'async-dcp-commit',
  files:['async_dcp.py','requirements.txt'],env:'Python 3 · PyTorch 2.5.1 · 两进程 CPU/Gloo',kind:'实际异步写入、恢复与故障对照',
  observe:'在后台写入尚未完成时推进训练，对照共享内存和独立快照，核对加载、下一步更新和失败后的提交指针。',
  scope:'固定版本和本机 CPU。不同设备、版本与异步保存后端需要各自验证。'},
 {id:'agent-model-plan-revision',track:'agent',stage:2,title:'模型读到缺项后，旧批准还能用吗',chapter:'durable-workflows',anchor:'native-model-plan-revision',pack:'model-plan-revision',
  files:['model_plan_lab.py','fixture.json','assets.json'],env:'Python 3.12 · llama.cpp b12110 · Qwen3-0.6B · 本机 CPU 与 SQLite',kind:'实际模型工具提议、计划修订和跨进程恢复',
  observe:'跟同一任务从基础 37 到补录后的 42，核对旧批准拒绝、匹配批准发布和重复恢复后的报告数。',
  scope:'固定合成来源、受控动作和本机审批夹具。模型泛化及 Kairo 接入另验。'}
);
labLearningCatalog.sort((a,b)=>['cloud','ai','agent'].indexOf(a.track)-['cloud','ai','agent'].indexOf(b.track)||a.stage-b.stage);
function labCatalogRecordPath(unit){const pack=labArchiveCatalog[unit.pack];return 'labs/'+(pack?.folder||unit.folder)+'/'+(pack?.record||'validation.json');}
function labCatalogSourcePath(unit,file){const pack=labArchiveCatalog[unit.pack];return 'labs/'+(unit.folder||pack.folder)+'/'+file;}
function labCatalogTaskPath(unit){return '/labs/?track='+unit.track+'#lab-'+unit.id;}
function labCatalogRunPath(unit){
 if(unit.anchor)return '/article/'+unit.chapter+'/#'+unit.anchor;
 const article=articles.find(a=>a.id===unit.chapter);
 const at=article.sections.findIndex(s=>unit.files.some(file=>s[1].includes(file)));
 return '/article/'+unit.chapter+'/'+(at<0?'':'#section-'+(at+1));
}
function labCatalogGateRuns(profile){
 return profile.gate.checks.flatMap(({primary,more})=>[primary,...more].map(([chapter,anchor])=>'/article/'+chapter+'/#'+anchor));
}
function chapterLabLinksHTML(article){
 const units=labLearningCatalog.filter(unit=>unit.chapter===article.id);
 if(!units.length)return '';
 const rows=units.map(unit=>{
  const title=escapeHTML(unit.title),catalogHref=labCatalogTaskPath(unit);
  const boundary=unit.kind==='目标环境手册'?'目标环境待验':unit.pendingFiles?.length?'含目标环境待验项':'';
  const concepts=fieldPracticeLocations(unit.id).map(([, ,source])=>source).filter(Boolean);
  const origin=concepts.length?' data-lab-concepts="'+escapeHTML(concepts.join(' '))+'"':'';
  return '<li><a href="'+labCatalogRunPath(unit)+'">'+title+' →</a>'+(boundary?'<span>'+boundary+'</span>':'')+'<a class="chapter-lab-evidence" href="'+catalogHref+'"'+origin+' aria-label="'+title+'的环境与记录">环境与记录 ↗</a></li>';
 }).join('');
 return '<details class="chapter-lab-links" id="chapter-experiments"><summary>本章实战与验收（'+units.length+'）</summary><ul>'+rows+'</ul></details>';
}
function labCatalogUnitHTML(unit,index,roleReturn,runHref){
 const pack=labArchiveCatalog[unit.pack],stage={0:'按需先修',1:'基础机制',2:'状态与失败',3:'综合验收'}[unit.stage];
 const order=index===null?'选读':String(index+1).padStart(2,'0'),orderLabel=index===null?'按需先修':'第'+(index+1)+'项';
 const fieldLocations=fieldPracticeLocations(unit.id);
 const fieldReturn=fieldLocations.map(([href,concept,origin])=>{
  const label=concept?'回到概念图'+(fieldLocations.length>1?' · '+escapeHTML(concept):''):'回到图中练习';
  const context=origin?' data-lab-concept="'+escapeHTML(origin)+'"':'';
  return '<a class="lab-field-practice-return" href="'+href+'"'+context+'>'+label+' →</a>';
 }).join('');
 const links=unit.files.length?'<details class="lab-source-list"><summary>查看本任务源码与输入文件（'+unit.files.length+'）</summary><ul>'+unit.files.map(file=>'<li><a href="'+labCatalogSourcePath(unit,file)+'" download>'+escapeHTML(file)+' ↓</a>'+((unit.pendingFiles||[]).includes(file)?' <span>目标环境待验</span>':'')+'</li>').join('')+'</ul></details>':'';
 return '<li class="lab-learning-unit" id="lab-'+unit.id+'"><span class="lab-order" aria-label="'+orderLabel+'">'+order+'</span><div class="lab-unit-body"><div class="lab-unit-meta"><span>'+stage+'</span><span class="lab-evidence-kind">'+escapeHTML(unit.kind)+'</span></div><h3>'+escapeHTML(unit.title)+'</h3><p>'+escapeHTML(unit.observe)+'</p><p class="lab-environment"><strong>环境</strong> '+escapeHTML(unit.env)+'</p><p class="lab-scope"><strong>验证范围</strong> '+escapeHTML(unit.scope)+'</p><div class="lab-unit-actions"><a href="/article/'+unit.chapter+'/">先读机制</a><a data-lab-run href="'+runHref+'">'+(unit.kind==='目标环境手册'?'打开验收手册':'跟着章节运行')+' →</a>'+(pack?'<a href="labs/'+unit.pack+'.zip" download>下载完整实验包 ↓</a>':'')+(unit.files.length?'<a href="'+labCatalogRecordPath(unit)+'" target="_blank" rel="noopener">'+(unit.kind==='目标环境手册'||unit.pendingFiles?.length?'已有本地记录':'实际记录')+' ↗</a>':'')+fieldReturn+roleReturn+'</div>'+links+'</div></li>';
}
function restoreLabConceptReturn(roles,fieldTracks,gateRunsByRole){
 const params=new URLSearchParams(location.search);
 const goal=params.get('goal'),returnGoal=params.get('returnGoal'),role=goal??returnGoal;
 const profile=Object.hasOwn(roles,role)?roles[role]:null;
 const source=params.get('fromConcept'),field=source?.match(/^([a-z0-9-]+)\.[a-z0-9-]+$/)?.[1];
 const hash=location.hash||'',track=params.get('track');
 if(!field||!/^#lab-[a-z0-9-]+$/.test(hash)||fieldTracks[field]!==track)return;
 if((goal!==null&&returnGoal!==null)||(role!==null&&profile?.track!==track))return;
 const card=document.getElementById(hash.slice(1));
 if(!card?.closest('#labs-'+track))return;
 const run=card.querySelector('[data-lab-run]'),concept=card.querySelector('a[data-lab-concept="'+source+'"]');
 if(!run||!concept)return;
 const runURL=new URL(run.href),conceptURL=new URL(concept.href);
 const chapter=runURL.pathname.match(/\/article\/([a-z0-9-]+)\/$/)?.[1];
 if(runURL.origin!==location.origin||conceptURL.origin!==location.origin||!chapter||!runURL.hash)return;
 const runGoal=runURL.searchParams.get('goal'),conceptGoal=conceptURL.searchParams.get('goal');
 if((runGoal!==null&&runGoal!==goal)||(conceptGoal!==null&&conceptGoal!==role))return;
 const inRoute=profile?.chapters.includes(chapter);
 const gateRun=goal&&gateRunsByRole[goal]?.includes('/article/'+chapter+'/'+runURL.hash);
 if((goal&&!inRoute&&!gateRun)||(returnGoal&&inRoute))return;
 if(goal)runURL.searchParams.delete('goal');
 runURL.searchParams.set('fromConcept',source);
 if(goal)runURL.searchParams.set('goal',goal);
 if(returnGoal)runURL.searchParams.set('returnGoal',returnGoal);
 run.setAttribute('href',runURL.pathname+runURL.search+runURL.hash);
 if(role){
  conceptURL.searchParams.set('goal',role);
  concept.setAttribute('href',conceptURL.pathname+conceptURL.search+conceptURL.hash);
 }
}
function renderLabCatalog(){
 const params=new URLSearchParams(location.search||'');
 const requested=params.get('track'),selected=Object.hasOwn(labTrackCatalog,requested)?requested:'all';
 const profile=selectedLearningProfile();
 const role=profile&&(selected==='all'||selected===profile.track)?Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile):null;
 const gateRuns=new Set(role?labCatalogGateRuns(profile):[]);
 const roleReturn=anchor=>'<a href="/roadmap/'+role+'/#'+anchor+'">返回'+escapeHTML(profile.label)+'学习路线 →</a>';
 const returnLink=role?roleReturn('learning-goal'):'<a href="/roadmap/">回到系统学习路线 →</a>';
 const nav='<nav class="lab-track-nav" aria-label="选择实验方向">'+[['all','全部'],...Object.entries(labTrackCatalog).map(([id,t])=>[id,t.name])].map(([id,name])=>'<a href="/labs/'+(id==='all'?'':('?track='+id))+'#labs-'+(id==='all'?'all':id)+'"'+(id===selected?' aria-current="page"':'')+'>'+name+' <span>'+labLearningCatalog.filter(u=>id==='all'||u.track===id).length+'</span></a>').join('')+'</nav>';
 const taskReturn=(unit,gateRun)=>{
  if(!role||location.hash!=='#lab-'+unit.id)return '';
  if(learningProfileRoute(profile).includes(unit.chapter))return roleReturn('goal-chapter-'+unit.chapter);
  return roleReturn(gateRun?'goal-gate':'learning-goal');
 };
 const renderUnit=(unit,index)=>{
  const runPath=labCatalogRunPath(unit),gateRun=gateRuns.has(runPath);
  const runHref=gateRun?runPath.replace('#','?goal='+role+'#'):runPath;
  return labCatalogUnitHTML(unit,index,taskReturn(unit,gateRun),runHref);
 };
 const groups=Object.entries(labTrackCatalog).filter(([id])=>selected==='all'||selected===id).map(([id,track])=>{
  const units=labLearningCatalog.filter(u=>u.track===id),optional=units.filter(u=>u.stage===0);
  const prerequisites=optional.length?'<details class="lab-optional"><summary>按需补系统前置：内存、并发、SQL 与缓存</summary><ul class="lab-learning-sequence">'+optional.map(unit=>renderUnit(unit,null)).join('')+'</ul></details>':'';
  return '<section class="lab-track-section" id="labs-'+id+'"><h2>'+track.name+'</h2><p class="lab-track-lead">'+track.lead+'</p>'+prerequisites+'<ol class="lab-learning-sequence">'+units.filter(u=>u.stage!==0).map(renderUnit).join('')+'</ol></section>';
 }).join('');
 const intro='<div class="lab-catalog-intro" id="labs-all"><p>先选方向，按编号读机制、运行代码，再核对输出。带“按需先修”的任务只用于补缺口；遇到需要额外环境的实验，可先继续阅读机制。</p><p>每项都写明要观察什么、所需环境和验证范围。下载包可能包含不同方向的独立程序，请按本任务文件名运行。目标环境手册保留待验状态。</p></div>';
 simplePage('实战实验室','LEARN · RUN · CHECK','按 Cloud、AI、Agent 的学习顺序找实验。先讲清机制，再用代码、反例和真实记录核对理解。',intro+nav+'<div class="lab-catalog-page">'+groups+'</div><p class="evidence-note lab-catalog-note">本机执行记录对应固定源码与当时的软件版本。真实云、GPU、Kubernetes/CSI、生产模型及 Kairo 的证据，以各任务列出的目标环境验收为准。'+returnLink+'</p>');
 if(params.has('fromConcept')){
  const conceptRole=params.get('goal')??params.get('returnGoal');
  const contextProfile=Object.hasOwn(learningProfiles,conceptRole)?learningProfiles[conceptRole]:null;
  const roles=contextProfile?{[conceptRole]:{track:contextProfile.track,chapters:learningProfileRoute(contextProfile)}}:{};
  const fieldTracks=Object.fromEntries(Object.keys(fieldConceptMaps).map(id=>[id,moduleFor(id).track]));
  restoreLabConceptReturn(roles,fieldTracks,role?{[role]:[...gateRuns]}:{});
 }
}
