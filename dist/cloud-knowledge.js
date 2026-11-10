// Knowledge first. Prerequisites are separate; each actual Cloud field is readable in-place.
const cloudPrerequisites = [
 ['Linux 与操作系统','进程/线程、系统调用、虚拟内存、页表、文件描述符、页缓存、CPU 调度与 I/O。分清地址空间、资源记账、运行和等待。',['linux-resource','virtual-memory-oom']],
 ['编程与并发','一门主力语言、常用数据结构、复杂度、锁/原子性、线程池、协程、背压和取消。先能实现并测试，再解释并发不变量。',['concurrency-pools']],
 ['网络协议基础','以太网/IP、TCP/UDP、DNS、HTTP/TLS；理解分层、可靠传输、连接状态、超时、重传、流量与拥塞控制。',['network-diagnosis']],
 ['数据库与分布式基础','索引、事务、隔离、日志、复制、缓存；理解部分失败、超时后的未知结果、幂等、顺序与一致性模型。',['database-index-locks','cache-consistency','distributed-systems']],
 ['工程工具','Git、命令行、测试、日志、性能剖析与基本自动化；能固定版本、输入、环境与验证口径。',['delivery']]
];
const cloudKnowledgeDomains = [
 {module:'compute',refs:['cloud','cnOCI','v9load'],points:[
 ['service-model','云计算服务模型','IaaS 提供虚拟计算、网络与存储；PaaS 再托管运行平台；FaaS 按事件或调用执行函数。每向上一层，平台接管的运维范围增加，应用仍须管理数据、权限、正确性和业务恢复。','先明确谁负责内核、运行时、扩容、备份和配置；托管服务不等于所有风险都由供应商承担。',['cloud-overview']],
 ['control-data-plane','控制面与数据面','控制面管理配置、资源对象、准入、放置与生命周期；数据面实际转发请求、运行进程和读写数据。控制面失败与数据面失败具有不同影响范围，已有工作与新建工作可能表现不同。','云 API 返回成功代表某一管理动作被接受或完成；业务可用性仍需检查执行面和用户结果。',['cloud-overview','kubernetes-basics']],
 ['fault-domain','Region、AZ 与故障域','Region 是云的地域边界；AZ 通常用于隔离一组机房级故障。机架、宿主、交换网络、存储、身份与控制面也可能形成共同故障域。跨 AZ 部署不自动消除共享依赖。','可用性设计必须同时说明副本分布、故障后的剩余容量、数据仲裁和切流条件。',['cloud-compute','resilience']],
 ['vm-runtime','虚拟机、Hypervisor 与容器','虚拟机运行客户机内核，Hypervisor 管理虚拟 CPU、内存与设备；普通 Linux 容器共享宿主内核，用 namespace 划分视图，用 cgroup 约束和记账资源。','KVM、virtio、设备直通和安全容器属于进一步的实现专题；不能把进程视图隔离等同于独立内核。',['cloud-compute','container-runtime']],
 ['cpu-memory-placement','vCPU、内存与 NUMA','vCPU 是虚拟执行资源，不等同于应用始终独占一个物理核。超分、竞争、配额、NUMA 本地性、内存带宽和 I/O 等待都会影响有效性能；内存容量满足也可能受延迟或带宽限制。','规格选择应依据工作集、CPU 时间、并发、访存和设备需求；吞吐与墙钟延迟使用不同口径。',['cloud-compute','linux-resource']],
 ['instance-lifecycle','实例生命周期与镜像','资源申请经过配额、库存、放置、网络/卷准备、启动和健康验收。镜像固定部分运行内容，初始化脚本、配置、身份、挂载和外部服务共同决定实际行为。','镜像摘要用于内容身份；状态盘、临时盘和持久卷的生命周期需分别核对，实例重建不等于业务恢复。',['cloud-compute','delivery']],
 ['resource-contract','配额、预留与资源承诺','账户/租户配额限制可申请总量，调度约束决定能放在哪，request 表达放置需求，limit 约束运行消费。预留、按量与可中断资源的成本和中断保证依服务而异。','有配额不保证即时库存；总量足够不保证单个节点放得下；资源承诺要连同中断、恢复和交付时延评估。',['cloud-compute','scheduling-resources']]
 ]},
 {module:'network',refs:['routing','securitygroup','v9nat','cnService','cnPolicy'],points:[
 ['vpc-subnet','VPC、子网与地址规划','VPC 定义逻辑网络边界，子网组织地址与放置范围，路由表决定下一跳。CIDR 重叠会影响互联和迁移；私网地址本身不构成完整的访问控制。','地址、路由、策略、名称解析和应用监听是不同层次，排障时逐层验证并画出返回方向。',['vpc-network']],
 ['route-overlay','路由、互联与 Overlay','最长前缀匹配是常见路由选择规则之一。专线、对等连接、转发网关与隧道连接不同网络；VXLAN 等 Overlay 在底层包上封装逻辑网络，需要考虑 MTU、回程和故障定位。','封装、地址转换和加密是不同机制；必须核对实际实现，不能默认所有集群走相同隧道或转发方式。',['vpc-network','k8s-networking']],
 ['dns-discovery','DNS 与服务发现','DNS 将名称映射到记录，递归/迭代查询、缓存与 TTL 影响传播。服务发现还需处理后端集合、就绪、版本和连接复用；解析成功不能证明目标可访问。','A/AAAA、CNAME 与负缓存有不同作用；应用和代理的本地缓存可能使切换效果晚于权威记录变化。',['vpc-network','k8s-networking']],
 ['nat-conntrack','NAT、端口与连接跟踪','NAT 改写地址或端口，连接跟踪维持双向流的关联。出站常见限制包括源端口、状态表容量、超时和云网关配额；放通去程不代表回包能正确抵达。','短连接、重试和连接复用会改变状态量；诊断应同时看连接状态、转换规则、路由与实际流量。',['vpc-network','network-diagnosis']],
 ['lb-tls','负载均衡、TLS 与入口','L4 负载均衡按传输连接处理流量；L7 代理理解 HTTP 等应用协议。TLS 终止位置决定证书、加密段与信任边界；健康检查、路由、会话保持和连接排空分别影响接流量资格。','后端副本比例不保证请求比例；应明确代理层、连接复用、证书校验与端到端截止时间。',['vpc-network','k8s-networking']],
 ['transport-timeout','TCP、HTTP 与超时边界','TCP 提供有序字节流，不保留应用消息边界，也不证明对方业务已提交。HTTP 状态、首字节和流结束属于应用观察；连接重传、keepalive 与应用心跳使用不同检测时序。','空闲连接的对端消失未必立即通知；read/write 超时与整体 deadline 应按调用链预算传播。',['network-diagnosis','distributed-systems']],
 ['io-model','I/O 多路复用与事件循环','select、poll、epoll 等机制报告就绪，应用仍须执行读写。边沿触发通常配合非阻塞 I/O 并处理到 EAGAIN；事件循环中的阻塞或长 CPU 任务会延迟其他连接。','就绪通知不等于异步完成；要同时管理消息解析、输出缓冲、背压、连接关闭与任务执行。',['network-diagnosis','concurrency-pools']],
 ['network-boundary','安全组、ACL 与网络策略','安全组、网络 ACL、NetworkPolicy 的方向、状态性和适用对象依产品或实现而异。源出站与目的入站分别判断；L3/L4 放行不能替代用户或资源级授权。','一条请求经过多层策略；记录实际生效规则，并区分解析失败、拒绝、重置、超时和应用错误。',['vpc-network','k8s-networking','iam-security']]
 ]},
 {module:'cloud-data',refs:['s3model','s3version','cnPV','v9innodb','v9aside'],points:[
 ['storage-model','块、文件与对象存储','块存储暴露块设备，文件系统提供目录和文件语义，对象存储以键和对象 API 组织内容。访问粒度、延迟、共享方式、容量扩展与一致性保证决定适用范围。','对象接口不等于 POSIX 文件系统；顺序吞吐、小随机 I/O、元数据操作和请求数应分别评估。',['training-storage']],
 ['storage-performance','IOPS、吞吐与尾延迟','IOPS 衡量每秒操作数，吞吐衡量每秒字节，延迟描述单次操作耗时。块大小、队列深度、并发、读写比例、缓存和持久化方式共同影响结果。','单次热缓存测试不能代表冷读或持久写；比较时固定数据量、访问模式、并发和错误口径。',['training-storage','cloud-compute']],
 ['durability-consistency','持久性、可用性与一致性','持久性讨论已确认数据的保存，可用性讨论能否处理请求，一致性约束不同观察之间的关系。复制增加冗余，不能自动替代备份，也不能仅凭副本数判断提交保证。','服务、区域、API 与配置的保证需逐项核对；不能把一种对象存储的语义扩展到所有存储产品。',['storage-recovery','distributed-systems']],
 ['database-service','托管数据库与事务边界','托管数据库减少部分部署运维，应用仍需设计索引、事务范围、连接池、隔离、幂等和迁移。MVCC、锁与日志服务于不同目标；提交确认和复制确认不能混称。','SQL 执行计划、锁等待、连接等待与存储 I/O 各有证据；SQLite 机制实验不能代替 MySQL/InnoDB 实机判断。',['database-index-locks','storage-recovery']],
 ['replication-failover','复制、主身份与故障切换','主从复制、仲裁和读写路由决定故障时谁可继续写、读到哪一版及可能丢多少已确认数据。提升副本还需处理旧主、客户端重连和结果未知的交易。','redo、binlog、复制日志和应用回执处在不同层；数据库内核与复制恢复是需要独立深入的专项。',['distributed-systems','storage-recovery','resilience']],
 ['cache-layer','缓存分层与一致性','缓存通过复用热点结果减轻源站压力，代价是失效、陈旧、击穿和容量管理。cache-aside、写穿、异步更新等策略有不同提交时序，TTL 不自动保证业务一致。','旧请求可在失效后回填旧值；需结合版本、权威读取、合并回源和源站承载能力讨论。',['cache-consistency']],
 ['messaging','消息队列与流处理','队列组织待处理工作，流日志保存可顺序消费的记录；分区、消费组、确认点、重投和保留规则决定处理语义。至少一次投递要求接收方正确处理重复。','顺序通常有作用范围；消息确认、业务效果提交和消费位点提交必须分开，不能用“MQ”一词许诺恰好一次业务效果。',['serverless-execution','distributed-systems']],
 ['backup-restore','快照、备份与恢复目标','快照记录某时点的存储状态，备份提供可管理的恢复副本，复制服务于运行连续性。RPO 约束允许的数据丢失窗口，RTO 约束恢复时间，均须明确计时与确认口径。','真正的验收是隔离恢复后消费者可继续工作；保留卷、完成复制或备份任务成功并非同一证明。',['storage-recovery','resilience','k8s-storage']]
 ]},
 {module:'native',refs:['cnCRI','cnWork','cnService','cnPV','cnHPA','cnDisrupt'],points:[
 ['container-isolation','镜像、容器与运行时','镜像保存内容和启动配置，容器是运行实例，进程由内核执行。namespace 划分视图，cgroup 记账和约束；CRI 连接 kubelet 与运行时，OCI 描述运行配置等规范。','入口进程、停止信号、可写层、挂载与安全上下文决定运行行为；镜像一致不等于外部环境一致。',['container-runtime']],
 ['reconciliation','API 对象与控制循环','Kubernetes 用声明式对象表达期望，由控制器持续调谐实际状态。API Server、存储、控制器、scheduler 与 kubelet 分工推进，管理动作与实际运行异步发生。','apply 成功、控制器观察到版本、Pod 启动、Ready 和业务可用是不同状态。',['kubernetes-basics','k8s-workloads']],
 ['workload-type','Pod 与工作负载类型','Deployment 管理可替换在线副本，StatefulSet 提供稳定身份与卷关联，DaemonSet 面向节点组件，Job/CronJob 以任务完成或定时产生任务为目标。','工作负载类型不自动补齐数据库高可用或业务幂等；必须明确状态所在和重复执行约束。',['k8s-workloads']],
 ['placement','调度、资源与拓扑','requests、节点可分配量、亲和、污点容忍、拓扑和卷约束决定可行放置。scheduler 为 Pod 选择节点，Linux 调度线程，运行时实施资源限制。','瞬时低利用率不证明可调度；有总资源也不代表一张节点能满足单个 Pod 的全部条件。',['scheduling-resources','container-runtime']],
 ['service-network','CNI、Service 与 EndpointSlice','CNI 实现 Pod 网络的配置与连接，Service 提供稳定访问抽象，EndpointSlice 维护后端与条件，服务数据面实施转发，DNS 负责名称解析。','不同实现的路由、隧道或代理模式不同；须核对 selector、端口、端点条件及源到目的的完整回程。',['k8s-networking']],
 ['persistent-volume','PVC、PV、StorageClass 与 CSI','PVC 表达存储需求，PV 表达卷，StorageClass 定义制备策略，CSI 驱动连接外部存储。延迟绑定可让卷拓扑与消费者放置一起决策。','Bound 不等于已挂载；RWO 是单节点读写挂载，不等于只允许一个 Pod 写；回收策略不替代备份。',['k8s-storage']],
 ['health-rollout','探针、发布与排空','startup 管启动窗口，readiness 管常规流量资格，liveness 达到条件后触发终止和适用重启。滚动更新通过 surge/unavailable 管理替换，终止宽限预算覆盖 preStop 和排空。','PDB 约束相应的自愿驱逐，不直接控制 Deployment 自身滚动更新；回退 Pod 模板不恢复数据库。',['k8s-workloads','delivery']],
 ['configuration','配置、Secret 与工作负载身份','配置进入环境变量、挂载文件或外部配置服务后，更新传播、进程重读和版本生效是不同过程。Secret 的编码不是加密，读取权限与挂载范围须控制。','镜像、配置、身份和数据契约共同构成交付版本；实际使用的配置与身份应可追溯。',['config-secrets','iam-security']],
 ['autoscaling','HPA、VPA 与节点扩容','HPA 调副本数，VPA 类机制调整单副本资源，节点扩容提供放置容量。CPU utilization 以相关 requests 为分母；建议副本数还受指标、稳定窗口和速率限制。','建议、创建、放置、初始化与 Ready 之间存在延迟；扩容应同时预算队列和下游连接。',['k8s-autoscaling','elasticity']]
 ]},
 {module:'serverless',refs:['cnEnv','cnRetry','cnSQS','cnConcurrency','cnFC'],points:[
 ['execution-environment','FaaS 与执行环境','函数平台根据调用或事件提供执行环境，经历初始化、执行、可能复用与销毁。冷启动主要增加初始化路径；全局变量与临时文件适合作为可丢缓存。','持久进度、业务状态与回执应由有明确保证的存储持有；一次受理不等于业务完成。',['serverless-execution']],
 ['trigger-delivery','触发器与投递语义','同步调用、平台异步队列、外部队列映射和流式来源具有不同重试责任、确认点、顺序与失败去向。需要按触发器、配置和实现说明投递保证。','至少一次可能重复；批次部分成功仍需处理重投，DLQ 是失败留存入口，不是业务回滚。',['serverless-execution']],
 ['event-idempotency','事件身份与幂等提交','稳定业务动作 ID 连接所有执行尝试。接收方在能够保证的原子边界中绑定参数、效果与回执，同键同意图返回旧结果，同键异参拒绝。','本地唯一键不能封住任意外部 API 的提交窗口；跨系统需外部幂等、查询回执或补偿协议。',['serverless-execution','distributed-systems']],
 ['concurrency-instances','调用并发、实例与伸缩','平均执行并发约为同窗口调用率乘平均执行时长。实例内可并发数、预热、配额、执行上限与下游能力共同决定吞吐；实例数与在途请求数不能总是一比一换算。','reserved concurrency 与预置执行环境不同；零到一延迟和排队时间应进入用户截止时间预算。',['serverless-execution','k8s-autoscaling']],
 ['serverless-cost','函数成本与选型边界','费用按供应商的请求、资源、计费时长、预置容量及关联服务规则计算。按调用适合间歇或事件型负载，长期运行消费者可适合稳定或长连接负载。','免费课程不表示云调用免费；执行 GB·s、预置 GB·s 与 FC 的 CU 等口径需分别计量。',['serverless-execution','elasticity']]
 ]},
 {module:'cloud-delivery',refs:['deploy','v9Rollback','v9RestoreTest'],points:[
 ['artifact-contract','不可变产物与完整版本','交付版本由镜像摘要、平台架构、配置、依赖接口、身份和数据契约共同构成。构建可重复与部署可追溯是两个相关但不同的要求。','可变标签应解析到实际内容；同一镜像在不同配置或数据结构下可能产生不同结果。',['delivery']],
 ['ci-cd','持续集成与交付流水线','CI 验证提交可集成与测试，交付流程管理构建、制品、部署、验证与回退。质量门禁应关注正确性、兼容性、安全边界和用户行为。','流水线通过不证明生产所有依赖健康；应固定环境、版本、验证输入与发布权限。',['delivery','production-readiness']],
 ['iac','IaC、状态与漂移','Infrastructure as Code 以版本化声明描述资源，工具比较期望、记录状态和实际资源，再执行变更。状态文件连接资源身份，漂移表示实际环境偏离管理基线。','计划需要审查依赖和破坏性变化；状态应访问受控、加锁和备份，计划不是所有运行效果的保证。',['delivery','cloud-compute']],
 ['controller-api','平台 API、控制器与 Operator','平台 API 定义资源身份、状态、权限和幂等请求；控制器按可重试调谐驱动外部效果。CRD 扩展 Kubernetes API，Operator 将领域运行知识编码进控制逻辑。','本机单控制器实跑重复调谐和删除清理。并发控制器、云资源接口和旧执行者需要各自核对。',['kubernetes-basics','distributed-systems','training-platform']],
 ['release-strategy','滚动、蓝绿、灰度与特性开关','滚动替换副本，蓝绿保留可切换环境，灰度选择一部分流量观察，特性开关控制运行行为。风险控制依赖流量口径、观测窗口和停止条件。','流量比例、实例比例和用户分组不同；数据结构变化应与应用版本保持兼容的过渡窗口。',['delivery','k8s-workloads']],
 ['rollback-compatibility','兼容迁移、回退与供应链','应用回退依赖旧版本仍能读写当前数据和配置。扩展后收缩、双读/双写及回填等迁移方式须定义权威源、完成条件和重复处理；制品来源与签名另控制供应链风险。','回退镜像不撤销已发生的数据写入；部署、撤回和修复都需按同一业务断言验收。',['delivery','ai-lifecycle']]
 ]},
 {module:'cloud-security',refs:['iam','tenants','secrets','cnPolicy','v9Rollback'],points:[
 ['authentication-authorization','认证、授权与策略判定','认证确认主体，授权判定主体能否对资源执行动作；租户、条件和委托范围共同参与决定。RBAC 用角色组织权限，属性和上下文可进一步约束。','策略应在实际执行边界实施；参数格式合法、身份已登录和业务被允许是不同判定。',['iam-security']],
 ['workload-identity','工作负载身份与短期凭证','人、服务和任务应使用可区分的身份；工作负载身份连接运行实例与可审计的服务权限。短期凭证减少长期泄露窗口，但仍需限制受众、用途与权限。','凭证不应由不可信输入指定；轮换、撤销、过期、缓存和授权失败都需要可观察的行为。',['iam-security','agent-security']],
 ['secret-lifecycle','密钥、加密与轮换','传输加密、静态加密和业务授权保护不同边界。密钥管理包含生成、保管、使用、轮换、撤销与审计；Secret 编码不等于密文保护。','配置源更新后，挂载、环境变量和进程是否重读具有不同传播路径，应验证当前真正生效的版本。',['config-secrets','iam-security']],
 ['tenant-isolation','多租户与资源隔离','租户边界同时涉及身份、网络、数据、计算、调度和管理权限。namespace 是组织边界之一，资源配额控制消费范围，运行时隔离限制执行能力。','单一 namespace 或容器不能自动保证对抗性隔离；越权、共享依赖与 noisy neighbor 应分别评估。',['iam-security','scheduling-resources','agent-sandbox']],
 ['execution-security','容器权限、准入与沙箱','能力集、非 root、只读挂载、系统调用过滤、准入策略和沙箱运行时限制不同攻击面。普通容器、用户态内核和虚拟机有不同兼容性与隔离边界。','隔离不替代数据端授权；应按实际威胁、宿主接口、凭证和网络出口验证，不能仅凭产品名称判断安全。',['container-runtime','agent-sandbox']],
 ['audit-accountability','审计、最小权限与可追责','审计应关联主体、授权依据、动作、资源、参数摘要、结果与时间。最小权限需要限制动作和作用域，并持续清理失效委托与长期权限。','告警与审计不能只保留成功日志；拒绝后还应核对相应业务效果是否确实未发生。',['iam-security','observability','agent-security']]
 ]},
 {module:'cloud-capacity',refs:['v9load','cnHPA','v9warm','cnPrice'],points:[
 ['capacity-units','工作量、服务时间与容量单位','请求率、CPU 时间、墙钟耗时、在途数量和吞吐具有不同单位。稳定窗口中平均在途量约为到达率乘平均逗留时间，前提是系统与计量口径满足相应条件。','平均值不是峰值或 p99 的上界；业务操作、重试尝试、批次和有效完成量应分开统计。',['cloud-compute','elasticity']],
 ['queue-backpressure','排队、背压与准入','当到达量长期超过有效完成能力，积压会持续增长。有限队列、并发限制、优先级、拒绝和降级将资源上限转化为可控行为。','扩容到恰好等于到达率只停止新增积压，清理已有工作需要净处理余量；重试也消耗预算。',['elasticity','concurrency-pools']],
 ['scaling-delay','伸缩时序与预留容量','有效扩容经过信号、控制决策、资源供应、放置、初始化和就绪。零到一、节点加入、镜像与卷准备会扩大容量空窗。','余量应同时覆盖突发、故障域丢失和扩容延迟；扩容受云配额、库存、调度约束与下游能力限制。',['elasticity','k8s-autoscaling']],
 ['performance-budget','性能预算与瓶颈归因','端到端延迟由计算、锁、排队、网络与数据依赖组成；吞吐提升需要定位限制有效产出的环节。利用率高低本身不是性能结论。','压测固定输入、并发、数据规模、错误、时长和质量口径；避免把局部优化或热缓存结果扩展为整体收益。',['cloud-compute','network-diagnosis','observability']],
 ['cost-efficiency','资源计费、TCO 与单位产出成本','成本应按资源用量、使用时段、冗余、网络、存储、请求、运维与恢复开销核算。单位有效产出成本连接支出与实际完成的用户工作。','低单价不保证低总成本；预留、按量和可中断资源要同时评估利用率、承诺期限、中断恢复与风险。',['cloud-compute','elasticity','serverless-execution']]
 ]},
 {module:'sre',refs:['slopractice','sloalert','monitor','v9RecoveryTarget','v9RestoreTest'],points:[
 ['sli-slo','SLI、SLO、SLA 与错误预算','SLI 度量用户结果，SLO 为指标和窗口定义目标，SLA 还包含对外约定与后果。错误预算来自目标允许的坏事件，而非随意容忍故障的次数。','定义有效事件、好坏判定、窗口、零流量和缺数；请求、可用性与延迟分母要明确。',['slo']],
 ['observability-signals','指标、日志、追踪与剖析','指标揭示范围和趋势，日志保留具体事件，追踪连接一次调用路径，剖析定位运行成本。标签、采样和关联 ID 决定可连接的证据。','高基数、缺样、时钟和保留策略会影响结论；遥测正常不能单独证明用户结果正常。',['observability']],
 ['alert-burn','告警、预算消耗与行动','告警应连接用户风险、持续窗口、预算消耗与明确处置动作。快速和慢速消耗需要不同检测窗口，基础设施信号可辅助判断原因。','减少无行动价值的噪声，明确值班、升级和恢复条件；阈值被触发不等于已经知道根因。',['slo','observability']],
 ['diagnosis-method','故障隔离与证据推理','先确定影响、起点和变化，再按路径分层提出可证伪假设。每次探测应能区分至少两种解释，并记录输入、位置、时间与观察。','低 CPU、超时、重启和错误码是现象；控制变量、时间线和权威状态比无目标地堆命令更能缩小范围。',['incident','network-diagnosis']],
 ['incident-change','事故响应、变更治理与复盘','事故流程组织影响评估、止损、沟通、恢复验证与后续改进。变更记录需要关联版本、配置、审批与回退条件，复盘应形成可验证的改进项。','先确认用户恢复再关闭事故；相关变更是待验证线索，不能仅凭时间接近认定因果。',['incident','delivery']],
 ['resilience-patterns','高可用、熔断、限流与容灾','冗余、故障域分散、限流、超时、重试、熔断、降级和容灾分别处理不同风险。多层重试可能放大负载，故障切换可能牺牲容量或一致性。','每种机制都要给触发条件、范围、恢复与失败边界；避免把多个保护组件叠加后视为已经可靠。',['resilience','distributed-systems']],
 ['recovery-evidence','RPO/RTO、演练与恢复证据','恢复设计规定数据确认点、允许丢失、依赖顺序、剩余容量与用户验收时刻。演练验证真实路径，备份与恢复脚本是过程输入。','本地模拟、单节点故障、跨 AZ 和跨地域是不同证据范围；需按目标环境验证，不能相互替代。',['resilience','storage-recovery']]
 ]}
];
const cloudKnowledgeDomain = id=>cloudKnowledgeDomains.find(domain=>domain.module===id);
function knowledgePointHTML(point,index,compact=false){const [id,title,body,boundary,ids]=point;const explanation=typeof cloudKnowledgeExplanations==='undefined'?'':cloudKnowledgeExplanations[id]||'';return '<section class="knowledge-point'+(compact?' compact':'')+'" id="knowledge-'+id+'"><h2><span>'+String(index+1).padStart(2,'0')+'</span>'+title+'</h2><p>'+body+'</p>'+(explanation?'<details class="knowledge-detail"><summary>展开机制、推导与对照</summary>'+explanation+'<p class="knowledge-boundary"><b>关联与边界</b>'+boundary+'</p></details>':'<p class="knowledge-boundary"><b>关联与边界</b>'+boundary+'</p>')+'<p class="path-links">'+(ids||[]).map(id=>readLink(id,articleById(id).title)).join('')+'</p></section>';}
function cloudPrerequisiteHTML(){return '<div class="prerequisite-content">'+cloudPrerequisites.map(([title,body,ids],index)=>'<section class="knowledge-point" id="knowledge-prerequisite-'+(index+1)+'"><h2><span>'+String(index+1).padStart(2,'0')+'</span>'+title+'</h2><p>'+body+'</p><p class="path-links">'+ids.map(id=>readLink(id,articleById(id).title)).join('')+'</p></section>').join('')+'</div>';}
function cloudKnowledgeBody(m){
 if(m.id==='foundation')return moduleConceptIntro(m)+fieldConceptMapHTML(m.id)+explainFirstConceptTerms(cloudPrerequisiteHTML(),conceptSeen(moduleConceptPaths[m.id]));
 const domain=cloudKnowledgeDomain(m.id);if(!domain)return '';
 return moduleConceptIntro(m)+fieldConceptMapHTML(m.id)+'<div class="knowledge-body">'+explainFirstConceptTerms(domain.points.map((point,index)=>knowledgePointHTML(point,index)).join(''),conceptSeen(moduleConceptPaths[m.id]))+'</div>';
}
function cloudKnowledgeReferences(m){const domain=cloudKnowledgeDomain(m.id);if(!domain)return '';return '<section class="knowledge-references"><h2>原始资料</h2><div>'+domain.refs.map(key=>'<a href="'+sources[key][1]+'" target="_blank" rel="noopener">'+sources[key][0]+' ↗</a>').join('')+'</div></section>';}
function cloudModuleTOC(m){return conceptTOCLink('/module/'+m.id+'/')+'<a href="/module/'+m.id+'/#concept-relations">核心概念关系图</a>'+cloudOriginalModuleTOC(m);}
function cloudOriginalModuleTOC(m){if(m.id==='foundation')return cloudPrerequisites.map(([title],i)=>'<a href="/module/foundation/#knowledge-prerequisite-'+(i+1)+'">'+(i+1)+'. '+title+'</a>').join('');const domain=cloudKnowledgeDomain(m.id);return domain?domain.points.map((point,index)=>'<a href="/module/'+m.id+'/#knowledge-'+point[0]+'">'+(index+1)+'. '+point[1]+'</a>').join(''):'<a href="/module/foundation/">前置基础</a>';}
function cloudMobileContents(m){return '<details class="mobile-contents"><summary><span class="mobile-field-label">领域目录与</span>本页知识点</summary><div class="mobile-field-links">'+cloudKnowledgeDomains.map(domain=>{const field=moduleFor(domain.module);return '<a href="/module/'+field.id+'/">'+field.n+' '+field.name+'</a>';}).join('')+'<a href="/module/foundation/">P0 前置基础知识</a></div>'+cloudModuleTOC(m)+'<a href="/module/'+m.id+'/#examples">机制详解与案例</a></details>';}
function cloudKnowledgePage(m){
 document.title=m.name+' · Cloud Infra · InfraGuide';
 const list=articles.filter(a=>a.module===m.id),domain=cloudKnowledgeDomain(m.id);
 const body=cloudKnowledgeBody(m);
 $('#app').innerHTML='<main class="doc-layout knowledge-layout" id="main" tabindex="-1">'+sidebar(m.id)+'<article class="article knowledge-article">'+breadcrumbs(m)+'<div class="eyebrow">'+(m.id==='foundation'?'PREREQUISITES · 前置基础':m.n+' / CLOUD INFRA')+'</div><h1>'+m.name+'</h1>'+readingToolbarHTML()+cloudMobileContents(m)+body+cloudKnowledgeReferences(m)+(typeof resourceRecommendations==='function'?resourceRecommendations(m.id):'')+'<section class="knowledge-examples" id="examples"><h2>机制详解与具体案例</h2>'+'<details class="knowledge-detail"><summary>查阅本领域的代码与实验对照</summary>'+cloudFieldLabs(m.id)+'</details>'+list.map(chapterLink).join('')+'</section><div class="knowledge-exit"><a href="/interview/cloud/">对照岗位要求与学习深度 →</a><a href="/resources/#cloud">文档、课程与视频 →</a></div></article><aside class="toc"><div class="toc-title">本领域知识点</div>'+cloudModuleTOC(m)+'<a href="/module/'+m.id+'/#examples">机制详解与案例</a><div class="toc-note">前置基础与九个实际领域分别组织。</div></aside></main>'+footer();
 initCloudMechanics();
}
function cloudArticleKnowledge(a){const domain=cloudKnowledgeDomain(a.module);if(!domain)return '';return '<p class="article-context-link" id="core-knowledge"><a href="/module/'+a.module+'/">本领域系统知识：'+moduleFor(a.module).name+' →</a></p>';}
const cloudKnowledgeTitles={
 'cloud-overview':'云计算架构：服务模型、资源与责任边界',
 'cloud-compute':'计算资源：虚拟化、规格与容量预算',
 'elasticity':'容量与弹性：故障域、扩容时序与排队',
 'vpc-network':'云网络：DNS、路由、访问控制与返回路径',
 'network-diagnosis':'网络诊断：连接、首字节与传输时序',
 'training-storage':'云存储：块、文件、对象与访问性能',
 'storage-recovery':'存储发布与恢复：版本、提交点与校验',
 'kubernetes-basics':'Kubernetes 控制面：对象、调谐与生命周期',
 'delivery':'平台交付：制品、配置、数据迁移与回退',
 'scheduling-resources':'Kubernetes 调度：资源、亲和与拓扑约束',
 'config-secrets':'配置与密钥：传播、重读与版本生效',
 'slo':'可靠性目标：SLI、SLO 与错误预算',
 'incident':'故障诊断：影响、时间线、假设与验证',
 'resilience':'恢复工程：故障域、RPO、RTO 与演练'
};
for(const [id,title]of Object.entries(cloudKnowledgeTitles))articles.find(a=>a.id===id).title=title;
