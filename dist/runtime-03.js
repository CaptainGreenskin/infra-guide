/* Generated classic scripts; edit the canonical files listed below. */

;
// cloud-knowledge.js
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
 ['controller-api','平台 API、控制器与 Operator','平台 API 定义资源身份、状态、权限和幂等请求；控制器按可重试调谐驱动外部效果。CRD 扩展 Kubernetes API，Operator 将领域运行知识编码进控制逻辑。','调谐可能重复或并发，必须处理版本冲突、外部副作用、删除清理和旧执行者；该方向需进一步代码实作。',['kubernetes-basics','distributed-systems','training-platform']],
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
function knowledgePointHTML(point,index,compact=false){const [id,title,body,boundary]=point;return '<section class="knowledge-point'+(compact?' compact':'')+'" id="knowledge-'+id+'"><h2><span>'+String(index+1).padStart(2,'0')+'</span>'+title+'</h2><p>'+body+'</p>'+(typeof cloudKnowledgeExplanations==='undefined'?'':cloudKnowledgeExplanations[id]||'')+'<p class="knowledge-boundary"><b>关联与边界</b>'+boundary+'</p></section>';}
function cloudPrerequisiteHTML(){return '<div class="prerequisite-content">'+cloudPrerequisites.map(([title,body,ids],index)=>'<section class="knowledge-point" id="knowledge-prerequisite-'+(index+1)+'"><h2><span>'+String(index+1).padStart(2,'0')+'</span>'+title+'</h2><p>'+body+'</p><p class="path-links">'+ids.map(id=>readLink(id,articleById(id).title)).join('')+'</p></section>').join('')+'</div>';}
function cloudKnowledgeBody(m){
 if(m.id==='foundation')return moduleConceptIntro(m)+explainFirstConceptTerms(cloudPrerequisiteHTML(),conceptSeen(moduleConceptPaths[m.id]));
 const domain=cloudKnowledgeDomain(m.id);if(!domain)return '';
 return moduleConceptIntro(m)+'<div class="knowledge-body">'+explainFirstConceptTerms(domain.points.map((point,index)=>knowledgePointHTML(point,index)).join(''),conceptSeen(moduleConceptPaths[m.id]))+'</div>';
}
function cloudKnowledgeReferences(m){const domain=cloudKnowledgeDomain(m.id);if(!domain)return '';return '<section class="knowledge-references"><h2>原始资料</h2><div>'+domain.refs.map(key=>'<a href="'+sources[key][1]+'" target="_blank" rel="noopener">'+sources[key][0]+' ↗</a>').join('')+'</div></section>';}
function cloudModuleTOC(m){return conceptTOCLink('/module/'+m.id+'/')+cloudOriginalModuleTOC(m);}
function cloudOriginalModuleTOC(m){if(m.id==='foundation')return cloudPrerequisites.map(([title],i)=>'<a href="/module/foundation/#knowledge-prerequisite-'+(i+1)+'">'+(i+1)+'. '+title+'</a>').join('');const domain=cloudKnowledgeDomain(m.id);return domain?domain.points.map((point,index)=>'<a href="/module/'+m.id+'/#knowledge-'+point[0]+'">'+(index+1)+'. '+point[1]+'</a>').join(''):'<a href="/module/foundation/">前置基础</a>';}
function cloudMobileContents(m){return '<details class="mobile-contents"><summary><span class="mobile-field-label">领域目录与</span>本页知识点</summary><div class="mobile-field-links">'+cloudKnowledgeDomains.map(domain=>{const field=moduleFor(domain.module);return '<a href="/module/'+field.id+'/">'+field.n+' '+field.name+'</a>';}).join('')+'<a href="/module/foundation/">P0 前置基础知识</a></div>'+cloudModuleTOC(m)+'<a href="/module/'+m.id+'/#examples">机制详解与案例</a></details>';}
function cloudKnowledgePage(m){
 document.title=m.name+' · Cloud Infra · InfraGuide';
 const list=articles.filter(a=>a.module===m.id),domain=cloudKnowledgeDomain(m.id);
 const body=cloudKnowledgeBody(m);
 $('#app').innerHTML='<main class="doc-layout knowledge-layout" id="main" tabindex="-1">'+sidebar(m.id)+'<article class="article knowledge-article">'+breadcrumbs(m)+'<div class="eyebrow">'+(m.id==='foundation'?'PREREQUISITES · 前置基础':m.n+' / CLOUD INFRA')+'</div><h1>'+m.name+'</h1>'+readingToolbarHTML()+cloudMobileContents(m)+body+cloudKnowledgeReferences(m)+(typeof resourceRecommendations==='function'?resourceRecommendations(m.id):'')+'<section class="knowledge-examples" id="examples"><h2>机制详解与具体案例</h2>'+cloudFieldLabs(m.id)+list.map(chapterLink).join('')+'</section><div class="knowledge-exit"><a href="/interview/cloud/">对照岗位要求与学习深度 →</a><a href="/resources/#cloud">文档、课程与视频 →</a></div></article><aside class="toc"><div class="toc-title">本领域知识点</div>'+cloudModuleTOC(m)+'<a href="/module/'+m.id+'/#examples">机制详解与案例</a><div class="toc-note">前置基础与九个实际领域分别组织。</div></aside></main>'+footer();
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


;
// cloud-mechanics-interactive.js
// Pure teaching models; independent hand-calculated cases are checked in scripts.
function cpuQuotaModel(period,quota,threads){
 if(!Number.isFinite(period)||!Number.isFinite(quota)||!Number.isInteger(threads)||period<=0||quota<=0||period>1000||quota>8000||threads<1||threads>8)return {error:'周期、预算须为正数，线程数为 1–8 的整数；本模型限定周期≤1000ms、预算≤8000ms。'};
 const active=Math.min(period,quota/threads);
 return {period,quota,threads,active,idle:period-active,budgetCores:quota/period,usedCores:Math.min(threads,quota/period),unused:Math.max(0,quota-threads*period)};
}
function latencyModel(dns,tcp,tls,wait,body,reused=false){
 const values=[dns,tcp,tls,wait,body];if(values.some(n=>!Number.isFinite(n)||n<0||n>60000))return {error:'请输入 0–60000ms 的有限数值。'};
 const phases=reused?[0,0,0,wait,body]:values;let total=0;const cumulative=phases.map(n=>(total+=n));
 return {phases,cumulative,total,ttfb:cumulative[3],postTls:phases[3],reused};
}
const modelNumber=n=>Number(n.toFixed(2)).toString();
function quotaResultHTML(m){if(m.error)return '<p class="model-error">'+m.error+'</p>';return '<div class="model-values"><div><strong>'+modelNumber(m.budgetCores)+'</strong><span>预算核数 Q/P</span></div><div><strong>'+modelNumber(m.active)+' ms</strong><span>理想运行窗口</span></div><div><strong>'+modelNumber(m.idle)+' ms</strong><span>等待下一周期</span></div></div><div class="quota-lanes">'+Array.from({length:m.threads},(_,i)=>'<div><span>线程 '+(i+1)+'</span><div class="quota-lane"><i style="width:'+modelNumber(m.active/m.period*100)+'%"></i></div></div>').join('')+'</div><p class="model-conclusion">每周期可用计算最多 '+modelNumber(m.usedCores*m.period)+' CPU·ms；平均实际使用上界 '+modelNumber(m.usedCores)+' 核。'+(m.unused?'当前线程数不足以消费全部预算，剩余 '+modelNumber(m.unused)+' CPU·ms 不等于真实内核会累计给下个周期。':'各运行带相加消费同一份组预算。')+'</p>';}
function cpuQuotaWidget(){return '<section class="mechanism-widget" data-cpu-quota-lab aria-label="CPU 配额手算器"><h4>改变线程数，预算会增加吗？</h4><p>先预测，再改输入。假设组内线程持续可运行、能同时占用相应数量逻辑 CPU，周期开始额度完整；无 burst、祖先瓶颈或额外竞争。这是数学模型。</p><div class="model-inputs"><label>周期 P（ms）<input name="period" type="number" min="1" max="1000" value="100"></label><label>组预算 Q（CPU·ms）<input name="quota" type="number" min="1" max="8000" value="50"></label><label>可并行线程数 N<input name="threads" type="number" min="1" max="8" step="1" value="2"></label></div><div class="model-result" aria-live="polite">'+quotaResultHTML(cpuQuotaModel(100,50,2))+'</div></section>';}
const latencyNames=['DNS','TCP 建连','TLS 握手','请求至首字节','读取响应体'];
function latencyResultHTML(m){if(m.error)return '<p class="model-error">'+m.error+'</p>';let offset=0;return '<div class="model-values"><div><strong>'+modelNumber(m.ttfb)+' ms</strong><span>从起点到首字节</span></div><div><strong>'+modelNumber(m.postTls)+' ms</strong><span>'+(m.reused?'就绪连接至首字节':'握手后至首字节')+'</span></div><div><strong>'+modelNumber(m.total)+' ms</strong><span>传输完成</span></div></div><ol class="latency-waterfall">'+m.phases.map((value,index)=>{const left=offset/(m.total||1)*100;offset+=value;return '<li><span>'+latencyNames[index]+'</span><div><i class="phase-'+index+'" style="left:'+left+'%;width:'+(value/(m.total||1)*100)+'%"></i></div><small>'+modelNumber(value)+' ms</small></li>';}).join('')+'</ol><p class="model-conclusion">累计时刻：'+m.cumulative.map(n=>modelNumber(n)+' ms').join(' → ')+'。首字节前的 '+modelNumber(m.postTls)+' ms 仍可能包含发送、往返、排队与处理，不等于服务器 CPU 时间。</p>';}
function latencyWidget(){return '<section class="mechanism-widget" data-latency-lab aria-label="传输时间瀑布推导"><h4>累计时刻与阶段耗时分别是多少？</h4><p>独立合成例：单次顺序传输，省略 pretransfer 准备差值、代理、重定向与重试。选择复用表示同源连接已存在且名称已解析，不只是 TLS 会话恢复。</p><div class="model-inputs"><label>连接路径<select name="connection"><option value="new">新建 TLS 连接</option><option value="reuse">复用已存在连接</option></select></label>'+[['dns','DNS',20],['tcp','TCP',30],['tls','TLS',40],['wait','请求至首字节',120],['body','响应体',40]].map(([name,label,value],index)=>'<label>'+label+'（ms）<input name="'+name+'" type="number" min="0" max="60000" value="'+value+'"'+(index<3?' data-setup-phase':'')+'></label>').join('')+'</div><div class="model-result" aria-live="polite">'+latencyResultHTML(latencyModel(20,30,40,120,40))+'</div></section>';}
function initCloudMechanics(){
 document.querySelectorAll('[data-cpu-quota-lab]').forEach(root=>{const update=()=>{const read=name=>{const value=root.querySelector('[name="'+name+'"]').value;return value===''?NaN:Number(value)};root.querySelector('.model-result').innerHTML=quotaResultHTML(cpuQuotaModel(read('period'),read('quota'),read('threads')));};root.querySelectorAll('input').forEach(input=>input.addEventListener('input',update));});
 document.querySelectorAll('[data-latency-lab]').forEach(root=>{const update=()=>{const read=name=>{const value=root.querySelector('[name="'+name+'"]').value;return value===''?NaN:Number(value)},reused=root.querySelector('select').value==='reuse';root.querySelectorAll('[data-setup-phase]').forEach(input=>input.disabled=reused);root.querySelector('.model-result').innerHTML=latencyResultHTML(latencyModel(read('dns'),read('tcp'),read('tls'),read('wait'),read('body'),reused));};root.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',update));root.querySelector('select').addEventListener('change',update);});
}


;
// cloud-mechanics.js
// Original mechanism explanations complement the compact knowledge definitions.
const cloudKnowledgeExplanations={};
const knowledgeSubhead=title=>'<h3>'+title+'</h3>';
const knowledgeFormula=(label,formula,meaning)=>'<div class="knowledge-formula"><small>'+label+'</small><div>'+formula+'</div><p>'+meaning+'</p></div>';
const knowledgeCheck=(question,answer)=>'<details class="knowledge-check"><summary>检验理解：'+question+'</summary><p>'+answer+'</p></details>';
Object.assign(sources,{
 v12Kvm:['Linux Kernel · KVM API','https://docs.kernel.org/virt/kvm/api.html'],
 v12Bandwidth:['Linux Kernel · CFS bandwidth control','https://docs.kernel.org/scheduler/sched-bwc.html'],
 v12Responsibility:['Azure · Shared responsibility','https://learn.microsoft.com/en-us/azure/security/fundamentals/shared-responsibility'],
 v12LambdaRuntime:['AWS Lambda · Runtime responsibility','https://docs.aws.amazon.com/lambda/latest/dg/runtime-management-shared.html'],
 v12Tcp:['IETF RFC 9293 · TCP sequence and acknowledgment','https://www.rfc-editor.org/rfc/rfc9293.html#section-3.4'],
 v12Curl:['curl · Transfer timing definitions','https://curl.se/docs/manpage.html#timestarttransfer'],
 v12Api:['Kubernetes · API concepts','https://kubernetes.io/docs/reference/using-api/api-concepts/'],
 v12Controller:['Kubernetes · Controllers','https://kubernetes.io/docs/concepts/architecture/controller/']
});
Object.assign(cloudKnowledgeExplanations,{
 'service-model':figure('v12-responsibility-matrix','责任矩阵：沿工作项比较平台与应用团队能改变的对象。FaaS 列以常见托管运行时为例，具体责任仍按服务与模式核对。')+
 knowledgeSubhead('服务模型改变的是可控制的对象')+para(
 '云主机把 CPU、内存、设备和客户机操作系统交给使用者。团队可以选择内核、安装运行时，也承担相应补丁与启动配置。托管应用平台进一步管理一部分操作系统和运行时；团队主要交付应用包与配置。托管函数把执行单元收窄到 handler、依赖和触发器，但团队仍须定义输入、身份、状态、超时和业务完成条件。',
 '这不是三个安全等级。托管运行时可能由平台发布修复，客户仍需选择更新方式或兼容版本；用容器镜像交付函数时，又多了基础镜像和随包依赖的维护边界。判断责任先列出对象，再问“谁有权改变它、谁能观察它、故障后谁执行恢复”。',
 '例如应用自己的压缩库有漏洞，即使函数平台已修好宿主系统，这份随包依赖也不会因此消失。平台能自动增加执行环境，也不会自动决定业务允许的数据库并发或去重窗口。把这些应用约束写成配置与验收条件，才能知道托管能力覆盖到了哪里。')+
 knowledgeCheck('改用 FaaS 后，数据备份、权限和业务幂等由谁保证？','这些仍要由业务与所用数据服务的明确协议保证。平台托管执行环境，触发器的投递、存储的提交和业务的完成是不同承诺。先查具体模式，再分配责任。'),
 'control-data-plane':knowledgeSubhead('期望、调度决定与实际执行并非同一份状态')+para(
 '控制面接受“要什么”，再通过校验、准入和放置决定“在哪里、以什么配置实现”。执行面启动进程、建立连接和读写数据。控制面保存的状态通常来自异步报告，未必与机器此刻的状态完全同步。因此创建接口的成功响应，要先确认指的是受理、资源准备完毕，还是业务验证通过。',
 '控制面短时不可用时，已经运行的进程和既有转发规则可能继续工作，新建、扩容、改配置与故障重建却可能受阻。反过来，管理 API 一直可用，也不能证明某个执行节点的磁盘、网络或应用已经健康。要分别记录管理动作和用户请求的指标。')+
 table(['状态层','证明对象','不能单独推出'],[['声明已接受','输入通过相应校验并进入管理流程','已得到资源或已启动'],['放置或绑定完成','选到了满足当时约束的位置','镜像、卷、网络和进程已准备'],['执行环境就绪','平台健康条件满足','真实权限、数据与业务结果正确'],['业务验收通过','指定输入得到符合契约的结果','后续所有负载与故障也已覆盖']])+
 para('这一分层也决定可观测的关联键。请求 ID 追踪一次控制面调用；资源 ID 追踪生命周期；执行尝试 ID 追踪一次运行；业务操作 ID 连接可重复提交的同一动作。把它们混成一个 ID，会让重试、替换与恢复的账目无法解释。'),
 'fault-domain':knowledgeSubhead('先计算失效后的负载，再讨论“跨区就高可用”')+para(
 '副本必须分布到不同故障域，才可能承受某一域同时丢失。但域之间仍可能共享入口、身份、制品仓库、数据库、控制面或网络出口。把所有依赖沿请求路径展开，才能识别分散应用副本后仍然存在的单点。',
 '容量是第二个条件。设 k 个等容量区域承担可转移负载，每区容量为 C，总负载为 L；失去一个区后，剩余容量是 (k−1)C。若全部工作必须继续完成，必要条件为 L≤(k−1)C。它还没有考虑重试、缓存变冷、数据重建和尾延迟要求，不能作为充分证明。')+
 knowledgeFormula('等容量、可均匀转移时的必要条件','u = L / (kC) ≤ (k−1) / k','u 是正常时的总平均容量利用比例，不是单机 CPU 瞬时读数。')+
 para('在三份等容量资源中，正常负载占总容量 60%，失去一份后会占剩余容量的 90%。若该系统在 80% 附近就出现明显排队，虽然总量算得过，用户延迟仍可能失守。应把允许的负载水位、转移时延和数据一致性一同列为验收条件。'),
 'vm-runtime':figure('v12-virtualization-layers','分层对照：VM 有自己的客户机内核；普通 Linux 容器隔离进程视图并共享宿主内核，两者可以嵌套组合。')+
 knowledgeSubhead('CPU、内存和设备分别怎样被虚拟化')+para(
 '以常见 Linux/KVM 为例，用户态虚拟机管理程序通过 KVM 接口创建虚拟机与 vCPU，内核与硬件辅助机制参与客户机执行。客户机虚拟地址先转换为客户机物理地址，再映射到宿主物理内存；具体二阶段地址转换依硬件和实现。虚拟设备可经模拟或 virtio 等半虚拟化接口连接后端，直通又有不同隔离和迁移约束。',
 '容器通常直接使用宿主内核。用户态发行版、动态库和工具可以不同，但系统调用最终仍跨入同一宿主内核。namespace 选择可见对象，cgroup 管理资源层级，能力集和系统调用过滤进一步限制行为；它们承担的职责不能互相替代。')+
 para('选型从要求反推：客户机内核、设备兼容、租户信任、启动频率、密度和运维责任都可能影响选择。启动快或镜像小只是一个维度；当工作负载不可信时，需要进一步比较沙箱、轻量 VM、宿主接口与数据端授权，不能仅看“VM”或“容器”的名称下结论。'),
 'cpu-memory-placement':knowledgeSubhead('CPU 使用量与墙钟时间必须分开')+para(
 'CPU 时间可以跨核相加，墙钟时间是外部经过的时间。两个线程若各在一颗逻辑 CPU 上持续运行 25 ms，会消费总计 50 ms 的 CPU 时间，而外部只经过 25 ms。云规格中的 vCPU 数、容器配额和应用线程数共同约束可用计算，增加线程不会创造新的配额。',
 '对于普通公平调度任务，cgroup v2 的 cpu.max 可以按周期给整个组一个 CPU 时间预算。50000 100000 表示每 100000 微秒最多消费 50000 微秒的相应组预算，理想长期平均为半核。它不是把某个物理核心切出一半；组内线程可在允许的 CPU 上较快消费预算，然后等待补给。')+
 figure('v12-cpu-quota-timeline','同一 50 ms 组预算：单线程理想地运行 50 ms；双线程在两颗可用逻辑 CPU 上并行时，可在 25 ms 墙钟内耗尽。实际调度还受祖先限制、粒度和竞争影响。')+
 knowledgeFormula('均匀周期中的理想上界','平均 CPU 核数 ≤ min(N, Q / P)','N 是可以同时运行的线程/CPU 数上限，Q 是 CPU 时间预算，P 是周期。模型省略 burst、额外竞争与调度细节。')+
 cpuQuotaWidget()+
 para('内存还要同时看容量、带宽和访问位置。NUMA 节点的本地内存与远端内存可能具有不同访问成本；线程位置改变后，原先建立的页面放置未必随之改变。大工作集、共享锁或跨 NUMA 的频繁访问，都可能让“还有空闲核”与“吞吐没有提高”同时成立。诊断时对齐进程等待、组节流、页面分布与业务完成率，而不是只看主机总 CPU。'),
 'instance-lifecycle':knowledgeSubhead('把启动看成一组有依赖的状态变更')+para(
 '创建实例通常要经过身份校验、配额检查、库存和放置、网络接口与卷准备、客户机启动、初始化及健康验收。这些步骤的失败可以发生在不同边界：资源根本未分配、资源存在但未运行、进程已运行却没有资格接流量。可重试操作应围绕稳定资源身份推进，避免每次超时都创建一份新资源。',
 '镜像只固定其中一部分内容。初始化脚本能否重复执行、安装源能否访问、配置版本是否有效、凭证是否过期，都会影响重建。理想交付记录应能还原镜像摘要、架构、配置、挂载、身份和数据契约；否则“恢复昨天那台机器”没有清楚的输入。')+
 table(['对象','生命周期','恢复时要问'],[['实例根盘或临时盘','依产品、实例类型与删除配置而定','停止、重建、删除后分别还保留什么'],['持久卷','通常独立管理，但受回收策略影响','卷身份、可挂载拓扑、数据一致性'],['外部数据库或对象版本','由各自提交与恢复协议定义','确认点、版本、回放及消费者验收']])+
 para('生命周期正确也不意味着业务恢复完成。上线后仍应以真实访问位置、有效身份和代表性输入核查用户结果；恢复时应重新核对依赖版本，而不把“新实例已 Running”当作终点。'),
 'resource-contract':knowledgeSubhead('三层限制分别回答三个问题')+para(
 '租户配额回答“最多允许申请多少”；放置约束回答“是否存在一台可接受它的节点”；运行时控制回答“放上去后能消费多少”。租户剩余十核，不证明某个节点有足够 CPU 与内存组合；节点瞬时空闲，也不证明已承诺的 requests 还有空间。')+
 table(['约束层','典型输入','约束违反的观察'],[['租户/账户准入','配额、策略、资源种类','请求被拒绝或等待准入'],['节点与拓扑放置','allocatable、requests、亲和与卷位置','Pod/任务等待放置'],['运行消费','CPU 配额、内存限制、I/O 或连接预算','节流、回收、排队或相应失败']])+
 para('购买模式再增加一组承诺：按量、预留、可中断资源可能在价格、期限、供给和中断通知上不同。预留也有多种产品含义，不能仅凭“预留”一词推断一定保有即时容量。对可中断任务，应先给检查点、恢复时间和重做成本，再评价单价是否划算。')+
 knowledgeCheck('租户配额和集群总余量都够，为什么仍会等待？','还需按单节点检查完整资源向量、硬性位置条件、设备与卷拓扑。总量只能给出很弱的必要条件，不能跨节点拼出一个普通 Pod 的请求。')
});


;
// cloud-network-mechanics.js
Object.assign(cloudKnowledgeExplanations,{
 'vpc-subnet':figure('v12-network-return-path','AWS 公网 NAT 的独立示意：NAT 网关先改为其私网地址，互联网网关再映射到 EIP；回包逆向恢复。端口与地址为题设，不是平台固定分配值。')+knowledgeSubhead('先把地址、下一跳和访问资格拆开')+para(
 '一个 IP 地址回答“包交给哪个网络端点”，路由回答“为了抵达该地址，下一步交给谁”，访问策略回答“这份流量是否允许”。三者互相配合，却不能互相证明。私网地址通常不直接在公共互联网中路由，也不意味着同一 VPC 的所有工作负载都可互相访问。',
 'CIDR 把地址分成网络前缀与主机部分。前缀越长，匹配的地址集合越小；规划时要预留子网、Pod、Service、对等网络、机房与未来区域的地址空间。两边使用重叠地址时，直接互联可能无法唯一决定目标在哪，迁移与重编号就会成为架构成本。',
 '子网既用于组织地址，也可能关联路由表、故障域和控制策略。不能用“公有子网”推断任意实例都公开可达：还需公共地址或入口、正确路由、访问规则与应用监听。反向也一样，具备出站能力不等于允许互联网发起入站。')+
 table(['问题','要核对的对象','常见误推'],[['目标地址是什么','DNS 记录、缓存、实际连接目标','名称存在就代表地址正确'],['下一跳是谁','目标前缀、路由优先级、网关状态','本地路由有一行就代表全程可达'],['是否允许','源/目的、方向、协议与状态规则','私网或同一 VPC 就自动可信']]),
 'route-overlay':knowledgeSubhead('路由选择与封装解决不同的问题')+para(
 '转发节点先按目标地址查路由。通常更具体的匹配前缀优先，但相同前缀或来源不同的路由还要按平台的优先规则选择，不能只背“最长前缀”就结束。控制面声明一条路由之后，规则传播、下一跳存活与返回方向仍需核查。',
 'Overlay 则在底层网络上承载一份逻辑网络。以内外两层 IP 的封装为例，内层标识工作负载，外层负责把封装包送到另一个节点。隧道终点解封装后，才继续处理内层目的地址。地址转换修改头字段，封装增加头部，加密保护内容，三者可以独立存在。')+
 knowledgeFormula('可用载荷预算','内层包大小 ≤ 路径可用 MTU − 当前封装开销','实际开销依 IPv4/IPv6、隧道、加密与链路而变。不要把某个固定减值当成所有 CNI 的通则。')+
 para('小请求通而大传输卡住时，应检查路径 MTU、分片与探测报文是否允许；跨节点不通而同节点可通时，需比较封装端点、节点路由和跨节点策略。先明确实际数据面，再选取证位置，避免到一个根本不使用 iptables 的实现里寻找固定规则。'),
 'dns-discovery':knowledgeSubhead('一次名称查询如何变成一份可连接的后端集合')+para(
 '应用先通过解析器查询记录，递归解析服务可能使用缓存，也可能向权威侧逐层取得结果。A/AAAA 记录给地址，CNAME 给需要继续解析的别名；TTL 约束相应缓存的使用期限，而非保证所有进程在某个时刻同时切换。应用、代理和连接池还可能保留自己的地址或旧连接。',
 '服务发现多了一层资格判断。普通 selector Service 的标签决定候选 Pod，EndpointSlice 记录地址、端口与条件，代理或兼容数据面使用这些信息转发。DNS 查询通常不在每个业务包的转发路径上，业务包也不会先进入 API Server 或 EndpointSlice 对象。')+
 code('控制信息与真实流量各走一条线','TEXT',[
 '控制：Pod/Ready → EndpointSlice → 服务数据面观察并更新',
 '解析：客户端 → DNS → Service 地址或端点记录',
 '数据：客户端 → 当前服务入口/转发 → Pod 监听端口 → 回包'
 ].join('\n'))+
 para('因此解析到 ClusterIP，只能先证明得到了一份名称结果；仍需核对 Service 类型、selector、targetPort、全部切片与实际监听。无 selector、headless、ExternalName 及终止期端点各有例外，不能把普通 ClusterIP 的解释直接扩展到所有服务。'),
 'nat-conntrack':knowledgeSubhead('沿同一个连接，逐笔核对地址重写')+
 para('图中实例 10.20.4.7:51000 连接 198.51.100.9:443。NAT 在连接状态中关联原始端点与翻译后端点；对 AWS 图示的公网出站路径，NAT 网关先使用其私网地址，随后互联网网关把该地址映射到关联 EIP。目的服务地址保持不变。其他云或网络方案应按实际路径分析，不能默认同样分工。',
 '回包的目的先是 EIP 与翻译端口，再沿既有状态还原到 NAT 私网端点和实例端点。这说明为什么必须画回程：如果绕过相应状态、连接已超时或路由返回了另一条不兼容路径，仅验证去程并不够。允许一条已发起连接的响应，也不同于允许外部任意建立一条新连接。',
 '短连接和重试会增加临时端口、转换表项与下游尝试量。应按实际目标、协议、连接生命周期和平台配额观察，而不能将主机的端口范围简单当作整个云网关的固定连接总数。连接复用能减轻部分压力，但还要评估单连接上的排队、故障影响和恢复。'),
 'lb-tls':knowledgeSubhead('连接在哪终止，决定了谁看得见什么')+para(
 'L4 入口主要处理传输连接，后端通常接收对应字节流；L7 代理理解应用协议，可按主机、路径、头或协议规则路由。TLS 若在入口终止，入口持有相应证书和私钥、处理解密，后端一段是否再加密应另行定义。证书验证、主机名和受信根也不能由“开了 HTTPS”一句话代替。',
 '代理会改变连接与流量的对应关系。客户端连接可能复用，代理到后端又可能使用另一个连接池。副本数量的一成不保证请求量恰好一成；长请求、会话保持和不同路由权重都会改变实际分布。健康检查也只验证所配置条件，应用成功仍要通过业务断言确认。')+
 table(['预算','由谁承担','需要继续追问'],[['建连/握手','客户端、入口或后端连接池','冷路径、复用、证书失败如何计入'],['请求处理截止时间','调用链上的每一层','剩余时间是否传播、何时取消'],['排空与重试','入口、服务与调用方','哪些动作可重复，谁保有稳定操作 ID']])+
 para('每一层都独立重试，会放大总尝试量。将重试范围、幂等条件和剩余 deadline 放在同一调用链上检查；入口放行并不能证明后端有时间完成，更不能证明超时的业务动作没有生效。'),
 'transport-timeout':knowledgeSubhead('序号确认的是连续字节，不是业务事务')+
 figure('v12-tcp-sequence','累计 ACK 的独立算例：确认号停在首个缺口；补回丢失的字节区间后，可跨过已暂存的尾段。图选用重传超时路径，不表示一个重复 ACK 就触发快速重传。')+
 para('本例客户端 SYN 使用序号 1000，SYN 消耗一个序号，因此首个数据字节从 1001 开始。[1001,1101) 包含 100 字节，累计确认到 1101；后面的 [1101,1201) 丢失，即使接收端按题设暂存了 [1201,1251)，下一期待仍是 1101。重传沿用原序号，缺口补齐后才确认 1251。',
 'TCP 将连续字节交给应用，应用仍须定义消息长度或分隔边界。一次 write 不保证对应一次 read；同一条连接可能分多次读取一条消息，也可能一次读到多条。传输 ACK 发生在对端协议栈，应用可能尚未完成授权或事务提交；应用超时也无法反证对端没有提交。',
 'HTTP/2 把多个流复用到一个连接，但底层 TCP 丢字节仍可能阻塞后续有序交付。QUIC 的流机制改变部分跨流阻塞关系，却不消除共享拥塞、服务器排队或应用依赖。回答可靠性问题时，先指明讨论的是字节、流、请求还是业务动作。')+
 figure('v12-latency-waterfall','另一个独立合成例：累计时刻 20/50/90/210/250ms。TTFB 为 210ms，TLS 后到首字节为 120ms；后者不等于服务端纯处理时间。')+
 latencyWidget()+
 knowledgeCheck('客户端收到 TCP ACK 后，能否直接将订单标成提交成功？','不能。ACK 表示传输层对连续字节的确认，业务结果还应由应用协议与权威回执验证。若应用回应丢失，应沿原业务 ID 查询或重试同一动作。'),
 'io-model':knowledgeSubhead('就绪、执行和完成是三个阶段')+para(
 'I/O 多路复用让一个线程等待多个描述符的就绪事件；收到可读通知后，应用仍需调用读操作、累积输入、解析消息，再安排业务执行。它并不意味着内核已经替应用完成协议解析和事务。输入与输出方向都可能需要缓冲和背压。',
 '在边沿触发模型中，如果还有未处理数据却停止读取，又没有新的状态边沿，程序可能长期等不到预想的下一次通知。常见做法是配合非阻塞 I/O 处理到 EAGAIN，并严格区分零长度读取、暂时不可读与错误。具体行为要按所用 API 与触发模式核对。')+
 code('事件循环的职责分工（结构示意）','TEXT',[
 '就绪事件 → 非阻塞读/写 → 累积缓冲 → 按协议切出完整消息',
 '完整消息 → 有界业务队列 → 执行/等待 → 输出缓冲',
 '输出积压 → 限制继续读取或接受新工作 → 恢复后再放行'
 ].join('\n'))+
 para('如果事件循环直接执行长 CPU 任务、同步数据库调用或无界写入，它依旧会阻塞其他连接。应把连接处理、业务并发、队列长度和下游容量一起设预算，不能把“使用 epoll”当成高并发的充分条件。'),
 'network-boundary':knowledgeSubhead('先明确策略作用在谁和哪个方向')+para(
 '网络授权通常按源、目的、协议、端口与状态判断，实际作用层各不相同。以 AWS 为例，安全组有状态，子网网络 ACL 的入出方向分别按无状态规则核对；换到另一产品应重新检查语义。回包的目的可能是客户端临时端口，而非服务端监听端口。',
 'Kubernetes NetworkPolicy 分别判断源 egress 与目的 ingress；某个方向已被隔离，就需相应允许规则，同端同方向的多条允许策略取并集。只有网络实现支持并实施策略，API 中存在对象才会转化为数据面限制。',
 'L3/L4 允许到达某个进程，不代表请求已经通过用户、租户或资源级授权。定位时最好从同一源位置、同一目标和同一协议控制变量：先辨析解析、建连、TLS、应用状态和响应内容，再决定下一项证据。')+
 table(['观察','先能证明','还不能证明'],[['DNS 有正确记录','该位置获得一份名称结果','后续路由、策略与监听'],['TCP 建连成功','当时传输路径和监听可建立连接','证书、授权与业务完成'],['直接访问 Pod 成功','该源到这个 Pod 的特定路径工作','Service 选择、全部端点及外部入口'],['入口返回 2xx','该协议回应被客户端收到','结果内容符合业务契约且已经持久化']])
});


;
// cloud-k8s-mechanics.js
Object.assign(cloudKnowledgeExplanations,{
 'container-isolation':knowledgeSubhead('从镜像内容，一直追到宿主内核')+para(
 '镜像描述文件系统内容、入口和部分运行配置，不包含一台独立机器的全部状态。节点运行时在创建实例时组合只读层、可写层、挂载、用户与资源配置，再启动实际进程。修改配置、运行用户或挂载后，同一个镜像可以表现不同，不能仅靠镜像标签解释全部行为。',
 'kubelet 通过 CRI 请求运行时管理镜像与容器；OCI 的运行规范定义 Linux 资源配置等边界。namespace 划分 PID、网络、挂载等视图，cgroup 管理记账和约束。某些视图可以共享；普通 Pod 的多个容器通常共用网络空间，但 PID 是否共享需要另查配置。',
 '停止同样是协议。运行时通常把停止信号送给容器主进程，入口 shell 若没有 exec 或信号转发，业务子进程未必按预想排空。宽限期内的 preStop、停止接新工作和完成旧工作消耗同一份预算；状态必须能在超时、强制终止或重建后被核实。')+
 code('解释一份容器声明时，分别标出这些对象','TEXT',[
 'image digest  → 交付了什么文件与启动配置',
 'command/user/mounts → 以谁的身份、看到哪些路径',
 'requests/limits → 放置需求与运行约束',
 'entrypoint/signal/grace → 谁收停止信号、怎样排空'
 ].join('\n')),
 'reconciliation':knowledgeSubhead('调谐不是“一条脚本执行到底”')+
 figure('v12-reconcile-state','期望、已观察状态与实际执行是三个教学切面。Deployment 的 observedGeneration 跟上期望代际，仍不保证三个副本都可用。')+
 para('控制器从 API 对象和自身观察出发计算差异，再发出可重复推进的动作。动作可能失败，状态报告可能滞后，watch 可能需要恢复；因此调谐应能反复执行，并在外部副作用处保留稳定身份、冲突检测和清理规则。一个对象变化也会由多个不同组件逐步处理，不存在单个控制器对所有节点瞬时全知。',
 '以 Deployment 为例，metadata.generation 表示期望配置的代际，status.observedGeneration 表示该控制器已经观察到的代际。二者都为 7，只说明“第 7 代已被观察”，不能推出 availableReplicas=3。新的 Pod 仍可能处于 Pending、拉镜像、初始化或等待就绪。')+
 table(['读数','含义','错误推断'],[['generation=7 / observedGeneration=7','相应控制器已观察到期望代际','所有子对象都已健康'],['updatedReplicas=3','三个副本属于当前模板','三个都已可用或满足业务条件'],['availableReplicas=2','按该工作负载规则只有两个可用','剩下一个一定是应用崩溃'],['resourceVersion','API 对象存储版本，参与 watch/并发控制','可作业务修订号、墙钟或跨类型全局排序']])+
 para('更新时按 API 规则原样传回所需版本，冲突后重新观察与判断，而不是盲目覆盖。resourceVersion 的可比较条件依资源种类与版本约束，尤其不要用 Pod 与 Deployment 的值互相推断先后。要证明业务已生效，继续检查子对象、端点、实际请求和数据版本。'),
 'workload-type':knowledgeSubhead('控制器表达什么完成条件')+para(
 'Deployment 关心持续维持一组可替换副本；Job 关心规定的完成条件；DaemonSet 关心符合条件的节点是否运行相应组件；StatefulSet 关心稳定身份和关联的卷。它们对缺失、退出、替换和顺序的解释不同，应先写业务生命周期，再选工作负载。',
 '无状态不是“从不读写数据”，而是副本的可替换性不依赖某个本地实例独有的权威状态。在线 API 可以使用外部数据库仍由 Deployment 管理；需要稳定卷身份的数据库也不会因为选了 StatefulSet 就自动获得复制、主身份仲裁和备份。')+
 table(['要求','常见工作负载','应用仍要实现'],[['保持在线副本数','Deployment','无状态替换、健康资格、外部状态'],['执行到任务完成','Job','重复尝试的幂等、结果与确认'],['节点级代理','DaemonSet','节点选择、资源与宿主权限'],['稳定序号/网络/卷关联','StatefulSet','写入协议、复制、恢复与升级兼容']])+
 para('CronJob 将时间规则转成 Job，但错过调度、重试与并发行为仍需核对。不能从“定时任务”推出全链路业务恰好执行一次；需要稳定业务键以及可核实的完成回执。'),
 'placement':knowledgeSubhead('先逐节点算完整资源向量，再叠加位置规则')+
 figure('v12-resource-fit','资源账本以 allocatable 减去已承诺请求计算。A 缺内存，B 缺 CPU 且位置不符；两台的总余量不能拼成一个普通 Pod。')+
 para('图只讨论单个普通容器的 CPU/内存请求，省略 init container、Pod overhead、设备和其他约束。Pod 要求 3 核、6 GiB，且硬亲和要求 zone=a。A 剩 4 核/4 GiB，内存不够；B 剩 2 核/8 GiB，CPU 与位置都不合格。即使总余 6 核/12 GiB，也没有可行节点。',
 '把 B 的已承诺 CPU 减少一核，只能消除其中一个失败原因；硬性位置条件仍然不满足。required 规则影响可行集合，preferred 规则影响候选偏好，不能把它们当作同一种过滤条件。名称中的 IgnoredDuringExecution 还提醒：这一调度期约束不等于标签变更后自动驱逐所有既有实例。')+
 knowledgeFormula('简化放置条件','CPU余量 ≥ CPU请求 且 内存余量 ≥ 内存请求 且 所有硬约束满足','每个候选节点分别判断；调度器不是把整个集群的空闲资源组成一张大机器。')+
 para('调度账本与瞬时利用率是不同输入。kubectl top 显示当前消费，requests 表示已经承诺给放置逻辑的需求。节点看起来很空仍可能不可放；放置成功后也可能遭遇运行时配额、共享竞争或工作量超出预估。定位时沿准入、放置、运行三个边界分别找证据。'),
 'service-network':knowledgeSubhead('稳定名字如何连接到变化的进程')+para(
 '普通 selector Service 按标签选择候选 Pod，控制面把后端地址、目标端口与状态组织为 EndpointSlice，具体数据面再据此转发。Service 的 port、targetPort 与程序实际监听三个对象必须对应；containerPort 作为声明并不会替程序创建监听套接字。',
 '切片存在某个 IP 仍不足以说明它接新请求：应检查全部相关切片、ready/serving/terminating、服务配置和实际数据面行为。publishNotReadyAddresses 与终止期处理有特定规则，不能笼统写成就绪一变就立刻断开全部连接。')+
 table(['观察顺序','检查对象','下一份证据'],[['名称解析','服务名得到的入口或端点','记录类型、地址与缓存'],['后端选择','selector、端口、EndpointSlice 条件','预期 Pod 是否在集合中且有资格'],['实际路径','代理/CNI/策略/监听与回程','从同一源到同一目标的连接与业务结果']])+
 para('CNI 连接 Pod 网络，Service 数据面处理相应的稳定入口转发，DNS 解析名字，三者并不天然由同一组件负责。任何一步通过，都不自动验证下一步；先弄清实际实现，再选择探测位置。'),
 'persistent-volume':knowledgeSubhead('把声明、绑定与节点挂载分成独立阶段')+para(
 'PVC 表达需求，PV 记录对应卷，StorageClass 决定制备策略，CSI 驱动实施与后端存储的连接。PVC Bound 只证明相应绑定完成，节点上所需的设备连接、文件系统挂载、权限和应用读写还可能失败。某些驱动不需要独立 attach，不能一律套固定步骤。',
 'Immediate 可能在消费者位置尚未确定时就制备卷。WaitForFirstConsumer 延迟绑定，使卷拓扑和 Pod 的资源、节点条件一并考虑；没有消费者时 Pending 可能是正常等待。直接设置 nodeName 会绕过调度器，不应把它当作解决延迟绑定的通用手段。',
 'RWO 表示单节点读写挂载，不是单 Pod 的文件锁；RWOP 用于支持该模式的 CSI 环境，限制单 Pod 挂载。访问模式不替代数据库并发协议。Retain 保留卷，也不防误写、勒索或区域损坏，备份和恢复仍是独立设计。')+
 knowledgeCheck('PVC Bound 且卷存在，能否宣布状态服务恢复？','还需确认目标节点、驱动和挂载、应用身份与数据版本，再让消费者按约定继续工作。保留存储对象与证明业务恢复不是同一层验证。'),
 'health-rollout':knowledgeSubhead('按时间快照计算可用副本与替换顺序')+
 figure('v12-rollout-grid','三副本、25% surge/unavailable 的可行快照：向上/向下取整得到 1/0。终止中的旧 Pod 另计，可能继续占用资源。')+
 para('maxSurge 向上取整，maxUnavailable 向下取整。三个期望副本、各 25% 时，允许新增一个非终止副本，更新策略不主动降低可用数。新的副本尚未可用时，旧的三个通常都需保留；新副本可用后，才有替换下一份旧副本的余量。图是满足假设的快照，不是固定耗时或所有实际动作的唯一顺序。')+
 knowledgeFormula('本例更新预算','surge = ceil(3×25%) = 1；unavailable = floor(3×25%) = 0','可用还涉及 Ready 与 minReadySeconds；终止宽限中的旧对象可额外占资源，因此不是“任何时刻最多四个 Pod 对象”。')+
 para('startup 成功前，所配置的 readiness/liveness 不开始探测；readiness 改变常规流量资格，失败本身不触发重启；liveness 或 startup 达到条件后再进入终止和适用重启。健康检查要明确目的，避免把共享数据库短暂不可用设计成全体前端同时重启。',
 'PDB 约束经相应驱逐 API 的自愿中断，不直接控制 Deployment 自身更新。节点故障、直接删除、滚动替换与 drain 有不同语义。更新产生的不可用仍会影响预算，不能把各机制看成互不关联。业务排空还需管理新请求、已有连接、停止信号和总宽限期。'),
 'configuration':knowledgeSubhead('四个版本可能同时不同')+para(
 '配置源中的版本、API 对象中的版本、挂载文件里的内容、进程当前采用的参数，是四份可能暂时不同的状态。环境变量通常在进程启动时确定；卷投影、subPath、外部配置拉取和进程重读又有不同更新行为，不能由“ConfigMap 已更新”直接推出服务已采用。',
 '配置更新需要定义校验、切换点和可观测版本。校验失败时保留上一份有效配置还是退出，应由业务契约决定；切换后最好能从健康或诊断接口查到生效版本摘要。密钥轮换还涉及新旧凭证兼容窗口、撤销与在途请求，不能只修改存储对象。')+
 code('配置版本链（示意，不是四份自动同步的保证）','TEXT',[
 '配置源 v3 → API对象 v3 → 目标文件 v3 → 进程内仍可能是 v2',
 '需要分别验证：传播完成？进程重读？新值校验？业务使用？'
 ].join('\n'))+
 para('完整交付应把配置和数据契约与镜像一起追溯。回滚应用镜像之后，若仍使用新版配置或已经删除的数据库列，旧程序未必能恢复工作。'),
 'autoscaling':knowledgeSubhead('建议副本、可用容量与积压必须连成一条时间线')+para(
 '以 CPU utilization 为目标时，相关 requests 构成分母。四个就绪副本均申请 200m，平均实际使用 180m，对 request 的利用率是 90%；目标 60%，基础建议 ceil(4×90/60)=6。把 request 改成 400m，工作并未变少，但该比值会变为 45%，基础建议也随之改变。',
 'HPA 还要考虑指标完整性、未就绪实例、容差、上下界、伸缩速率和稳定窗口。节点扩容、镜像、卷与初始化又使新容量晚于建议到达。VPA 类机制调整单副本资源，可能反过来改变 HPA 分母，应检查两套控制是否相互放大或抵消。')+
 knowledgeFormula('固定容量区间的排队账本','积压增量 = max(0, 到达率 − 完成能力) × 持续时间','只适用于写明的固定区间；真实容量渐变时应按时间积分，并单独记录拒绝、超时与重试。')+
 para('新容量恰好等于到达率，只能停止积压继续增长，不能清空旧工作；清空需要净余量。与此同时，副本增长会放大数据库连接和下游尝试量。maxReplicas、队列、每副本并发与下游预算必须一起设定，再用用户完成量和等待分布判断伸缩是否真正有效。')
});


;
// cloud-crosscut-mechanics.js
Object.assign(cloudKnowledgeExplanations,{
 'storage-performance':knowledgeSubhead('把一次 I/O 的单位乘完整')+
 knowledgeFormula('固定 I/O 大小时的单位关系','吞吐（字节/s）= IOPS（次/s）× 每次字节数','只有相同访问口径才能相乘；混合大小的请求应逐类统计，产品峰值也未必同时可达。')+
 para('1000 次/秒、每次 8 KiB 对应 8000 KiB/s，约 7.81 MiB/s；这不表示一个标称高 IOPS 的卷能在任意块大小下保持同样 IOPS。小随机请求容易受到每次操作开销限制，大块顺序请求可能先受带宽或链路限制。',
 '队列深度增加可以在一定范围内重叠等待，但也可能增加排队和尾延迟。把应用等待、文件系统缓存命中、设备完成和持久确认分开，注明热/冷、读/写、同步/异步和并发。未写清这些条件的吞吐比较，通常无法用于容量决策。'),
 'durability-consistency':knowledgeSubhead('三个承诺，分别找确认点')+
 table(['承诺','应问的问题','不能用什么代替'],[['持久性','什么确认之后，在约定故障下仍可保留','进程已经返回过一个 200'],['可用性','故障时哪类读写仍能被接受并完成','数据有多份副本'],['一致性','不同读取/写入之间允许观察到什么顺序','单纯声明“最终一致”或“强一致”']])+
 para('一致性模型还需给作用范围：单键还是跨键、一次会话还是所有客户端、单地域还是异地复制。读取新版本与更新一组相关对象的原子性，是不同问题。对外的成功回应应该明确连接到哪个提交或回执，不能让客户端猜测底层是否已经复制。'),
 'backup-restore':figure('v12-recovery-ledger','恢复材料覆盖到哪里，就逐项证明到哪里。图中的业务序号是合成账本，不是数据库 LSN，也不能直接换算成 RPO 秒数。')+
 para('图里快照保留到 100，后续已确认提交达到 110，而可用恢复材料只覆盖到 108。把快照恢复成功，只完成恢复的起点；还要按正确版本与顺序应用后续材料，再核对 109、110 是否存在其他权威来源。没有证据时，不能因为“备份任务全绿”就宣布没有丢数据。',
 'RPO 应用确认时间和恢复点界定允许丢失，RTO 需要约定从故障、发现还是启动恢复开始计时。恢复最后还要启动消费者，验证读取、权限、重复提交和继续写入。记录版本、摘要、确认点与依赖顺序，比只留下“脚本执行成功”更能说明恢复范围。'),
 'trigger-delivery':knowledgeSubhead('先问失败由谁观察，再问重试由谁发起')+
 table(['路径（AWS 示例）','谁安排后续尝试','确认点'],[['直接同步调用','调用方、SDK 或上游按各自规则；Lambda 不因函数代码错误替调用方自动重试','调用方取得并验证结果'],['直接异步调用','平台受理后排队，重试/年龄与失败去向按该模式配置','受理不是业务完成'],['SQS 事件源映射','轮询、可见性超时、批次响应与源队列 redrive 共同影响','业务处理后才进入相应消息删除流程']])+
 para('一次批次里 A 已成功、B 失败，整批重投可能让 A 再来。部分批次响应能缩小某些重试范围，但不应被解释为消除所有重复。流式事件源、分片顺序与 Knative Broker 又有各自规则，必须按具体触发器与实现核对。'),
 'event-idempotency':figure('v12-event-commit-gap','同一事件的两次尝试：业务效果与 inbox 同库提交后退出，下一次按原 ID 查回结果。外部 API 不自动包含在这份事务中。')+
 para('先确定逻辑动作身份，而不是每次尝试都生成新 ID。把租户、目标和参数摘要绑定到事件 ID，可以区分同意图重试与同键异参；后者应按协议拒绝或进入冲突处理，不应静默沿用另一个意图的结果。',
 '接收方如果在同一原子事务中写业务效果和回执，就能封住本例“提交成功但 ACK 丢失”的窗口。若先写回执再单独做业务，会留下已处理却无效果；反向分开又可能重做效果。换成远端付款或文件服务，本地事务覆盖不到它，需要对方幂等键、可查询回执、outbox/inbox 或补偿等额外协议。'),
 'concurrency-instances':knowledgeFormula('相同窗口、相同调用单位的平均关系','平均执行并发 ≈ 实际调用率 × 平均执行时长','该关系不直接给峰值配额；按批消费时先把消息率换算成调用率，积压生产率不等于已执行调用率。')+
 para('函数实例可同时接纳多少调用取决于具体运行模型；不能把平均在途数恒等于实例数。预热影响部分初始化，reserved concurrency 也不等于已准备执行环境。容量决策还要检查排队、下游连接、重试和最长消息年龄，而不只观察实例数量。'),
 'controller-api':knowledgeSubhead('声明式管理为什么需要版本与重试协议')+para(
 '控制器会根据已观察状态反复调谐，可能在“外部资源已创建、状态尚未报告”之间退出。若每次都以新名字创建，重试就可能留下重复资源。需要稳定资源身份、可查询外部状态、并发冲突处理和删除清理，再讨论控制器是否收敛。',
 'IaC 的配置、状态记录与实际资源也可能暂时不一致。状态中存放资源身份并可能包含敏感信息，应限制访问、管理锁与恢复；变更计划帮助审查，却不能替代依赖状态和最终运行效果。import、漂移修复和销毁都应说明对象归属和后续影响。'),
 'rollback-compatibility':figure('v12-compatibility-matrix','假设三版应用与三种数据契约的兼容矩阵：先证明仍有可运行组合，再决定旧列和旧版本何时退出。')+
 para('扩展后收缩把不可逆变化推迟：先增加兼容结构，再部署能处理过渡状态的版本、回填与核对消费者，最后才删除旧契约。双写期间谁是权威、失败如何恢复、重复回填是否安全，都需要明确，而不能只把两个写入放进同一个代码分支。',
 '撤回镜像只改变一部分运行内容，不会撤销数据迁移、已经产生的外部效果或配置变更。先画真实版本的兼容矩阵，再为发布和回退使用同一组业务断言；图中的勾叉是题设，不是任何工具自动保证的结果。'),
 'authentication-authorization':figure('v12-policy-intersection','授权的简化约束交集：认证、允许范围、租户和条件都需满足，有效拒绝不能被“格式正确”覆盖。这不是某家云完整的策略求值实现。')+
 knowledgeFormula('只用于解释必要条件的简化模型','允许 = 可信主体 ∧ 动作允许 ∧ 资源允许 ∧ 委托/租户/条件满足 ∧ 无有效拒绝','真实策略还需按系统的继承、边界、资源策略及显式拒绝规则求值。')+
 para('schema 检查参数形状，认证建立可信主体，授权决定主体能否对该资源执行动作。调用内容里写着另一个 tenant_id，不会自动改变主体的委托范围；服务端应从可信身份和授权关系验证它，而不是让模型、用户文本或工具返回值授予新权限。',
 '执行边界要能给出授权依据与结果：主体、动作、资源、租户、策略版本和对应回执。拒绝请求后再核对相关业务效果，才能区分“返回拒绝信息”和“实际写入没有发生”。多租户还须分别评估计算资源、网络、数据与管理面的隔离，不能依赖一条角色规则解释全部安全性。'),
 'queue-backpressure':figure('v12-queue-curve','M/M/1 的解析曲线：越靠近模型服务能力，平均逗留时间越陡。它展示条件下的非线性，不是生产阈值或 p99 测量。')+
 para('队列连接到达工作与完成能力。若一个区间内到达率长期高于完成能力，积压只能增加；即使平均尚未超载，工作量的随机波动也会产生等待。图用泊松到达、指数服务时间、单服务台和无限缓冲的稳定 M/M/1 模型，借助明确假设解释非线性。')+
 knowledgeFormula('M/M/1：λ < μ','ρ = λ/μ；E[T] = 1/(μ−λ)；E[T] / (1/μ) = 1/(1−ρ)','T 包含服务和排队时间。利用率 0.5/0.8/0.9 时，均值总逗留时间分别为平均服务时间的 2/5/10 倍。')+
 para('真实服务可能有多副本、批处理、长尾任务、相关到达、优先级和重试，不能把此图的横轴直接当作主机 CPU 百分比。正确做法是先明确工作单位和限制有效完成量的资源，再压测等待分布、拒绝与超时；有限队列和背压应让超载时的行为可解释。'),
 'alert-burn':figure('v12-budget-windows','同一组合成事件的两种读数：全窗口消耗 60% 预算，最近窗口以 3× 速率消耗；累计量与速率不是同一个指标。')+
 knowledgeFormula('同口径的预算与速率','允许坏事件 = N×(1−SLO)；消耗速率 = 观察坏事件比例 / (1−SLO)','SLO 为 100% 时该速率分母为零，不能套用有限比值；零流量和缺数也需单独定义。')+
 para('图中全窗口 1000 次有效事件、目标 99%，允许 10 次坏事件。实际有 6 次，已消耗预算 60%。若这 6 次都发生在最近 200 次里，近期错误率为 3%，相对允许的 1% 是 3×。全窗口的 0.6× 又是另一份同窗口速率，不能拿它掩盖正在加速的故障。',
 '告警需把持续时间、快慢窗口和行动联系起来。过短的窗口容易受偶发样本影响，过长又可能发现太晚；低流量尤其要审查分母。预算消耗指出风险，不直接指出根因，仍应沿指标、日志、追踪和变更记录提出可证伪假设。')
});
for(const [id,extra]of Object.entries({compute:['v12Kvm','v12Bandwidth','v12Responsibility','v12LambdaRuntime'],network:['v12Tcp','v12Curl'],native:['v12Api','v12Controller']})){
 const domain=cloudKnowledgeDomain(id);domain.refs=[...new Set([...domain.refs,...extra])];
}


;
// cloud-deep-lab-files.js
const cloudDeepLabFiles={"README.md": "# Cloud 三领域配套实验\n\n学习顺序：先读站内对应领域的全部知识点，再运行此处代码。Python 程序兼容 Python 3.9+，仅用标准库；数据库/状态文件位于各程序自己的临时目录，不连接云账户。`validation.json` 记录本站运行结果及源码摘要。\n\n## 1. 存储与恢复\n\n```sh\npython3 recovery_lab.py\n```\n\n使用 SQLite Online Backup API 生成真实基线，余额100、进度100；应用日志101/+10、102/+20、103/−5、104/误清零。恢复到103应得到125；缺102时在创建恢复库前拒绝；103重复无额外效果，同序号换意图拒绝；新104/+5可继续到130。日志为本实验应用协议，不是SQLite WAL、MySQL binlog或PostgreSQL WAL。`mysql-pitr.md` 提供单独的 MySQL 8.4 目标环境步骤，本次没有 MySQL 执行证据。\n\n## 2. 批处理与提交间隙\n\n```sh\npython3 event_batch_lab.py\n```\n\n子进程处理A，在数据库提交后以23退出；再处理A/B/C，其中B临时失败，返回 `batchItemFailures=[{itemIdentifier: msg-B}]`；恢复B后，尝试数A=2/B=2/C=1，效果共3笔。新运输ID不改变A的业务身份；同ID换参数拒绝；两个并发进程处理X，只产生一个效果。这里使用本地SQLite，展示提交与回执的原子边界；不能把临时SQLite文件部署到函数临时盘后当成云端持久去重。实际Lambda/SQS还需持久共享存储、开启部分批响应并验证映射与队列参数。\n\n## 3. Terraform 的真实计划与状态\n\n需要自行准备官方 Terraform CLI；本次固定验证版本1.13.0，使用内建 `terraform_data`，不下载云provider或创建远端资源。\n\n```sh\npython3 terraform_lab.py /absolute/path/to/terraform\n```\n\n程序在独立临时目录执行init/validate/plan/show/apply：保存v1计划后把配置改为v2，执行旧计划仍得到v1；再计划并应用v2；无变化计划退出码0；另一个apply使状态推进后，旧计划被拒绝。记录只证明真实CLI、本地state和内建provider行为，不证明云端资源漂移、远程锁或实际集群发布。\n\n手动跟踪时，先把 `main.tf` 复制到新的实验目录，再在该目录执行：\n\n```sh\nterraform init\nterraform validate\nterraform plan -out=release.tfplan\nterraform show release.tfplan\nterraform apply release.tfplan\nterraform output -json\n```\n\n## 4. GitOps 的调谐模型与目标配置\n\n```sh\npython3 gitops_model.py\n```\n\n该教学模型分别演示：现场replicas从2改5，自愈关/开得到5/2；受管字段一致但available=0时仍未健康；资源健康而业务版本错误仍验收失败；保留Deployment、从源中去掉受管ConfigMap后，prune关/开的行为不同，未受管对象保留。它不是Argo CD执行器，状态名带model后缀。\n\n`argocd-application.yaml` 是需替换仓库和目标的配置示例：自动同步和自愈开启，自动prune关闭。需要已有Argo CD、源访问、项目权限和实际清单；本次未同步集群。可在独立测试集群按课程顺序验证Synced/Healthy、手改replicas、自愈、移除ConfigMap、单独开启prune和业务探测，勿把模型通过当成集群证据。\n\n## 验证记录与范围\n\n`validation.json` 包含四个程序的结果、运行环境、源码SHA256与明确范围。完整的代码和本记录一起发布，便于对照。MySQL手册和Argo配置仅做文档审阅；真实云队列、MySQL/PostgreSQL、远程Terraform backend和GitOps集群未运行。\n", "argocd-application.yaml": "# Configuration example: replace repoURL/path/destination and provide matching manifests.\n# Requires an existing Argo CD installation, repository access and project permissions.\n# This file was reviewed as configuration; no cluster sync was executed for this release.\napiVersion: argoproj.io/v1alpha1\nkind: Application\nmetadata:\n  name: reports-lab\n  namespace: argocd\nspec:\n  project: default\n  source:\n    repoURL: https://example.com/your-team/infra.git\n    targetRevision: main\n    path: deploy/reports\n  destination:\n    server: https://kubernetes.default.svc\n    namespace: infra-lab\n  syncPolicy:\n    automated:\n      enabled: true\n      selfHeal: true\n      prune: false\n      allowEmpty: false\n    syncOptions:\n      - CreateNamespace=true\n", "event_batch_lab.py": "\"\"\"Local batch response and idempotency experiment; no cloud queue is contacted.\"\"\"\nimport hashlib\nimport json\nimport os\nfrom pathlib import Path\nimport sqlite3\nimport subprocess\nimport sys\nimport tempfile\n\n\ndef initialise(path):\n    with sqlite3.connect(path) as db:\n        db.executescript('CREATE TABLE attempts(event_id TEXT);'\n                         'CREATE TABLE effects(event_id TEXT PRIMARY KEY, delta INTEGER);'\n                         'CREATE TABLE receipts(event_id TEXT PRIMARY KEY, fingerprint TEXT);')\n\n\ndef process(path, record, fail=False, crash=False):\n    # messageId identifies this delivery; event_id identifies the business action.\n    body = record['body']\n    if body.get('tenant') != 'demo' or type(body.get('delta')) is not int:\n        raise ValueError('this lab accepts only demo tenant and integer delta')\n    event_id = body['event_id']\n    intent = hashlib.sha256(json.dumps(body,sort_keys=True).encode()).hexdigest()\n    db = sqlite3.connect(path,isolation_level=None,timeout=10)\n    try:\n        db.execute('INSERT INTO attempts VALUES(?)',(event_id,))\n        if fail:\n            raise RuntimeError('transient failure before business commit')\n        db.execute('BEGIN IMMEDIATE')\n        receipt = db.execute('SELECT fingerprint FROM receipts WHERE event_id=?',(event_id,)).fetchone()\n        if receipt:\n            if receipt[0] != intent:\n                raise ValueError('same event_id with a different intent')\n        else:\n            db.execute('INSERT INTO effects VALUES(?,?)',(event_id,body['delta']))\n            db.execute('INSERT INTO receipts VALUES(?,?)',(event_id,intent))\n        db.execute('COMMIT')\n        if crash:\n            os._exit(23)  # The effect exists, but the caller has no response.\n    except BaseException:\n        if db.in_transaction:\n            db.execute('ROLLBACK')\n        raise\n    finally:\n        db.close()\n\n\ndef handle_batch(path, records, failing=()):\n    failures = []\n    for record in records:\n        try:\n            process(path,record,fail=record['body']['event_id'] in failing)\n        except (RuntimeError,ValueError):\n            failures.append({'itemIdentifier':record['messageId']})\n    return {'batchItemFailures':failures}\n\n\ndef message(event_id, message_id=None, delta=1):\n    return {'messageId':message_id or 'msg-'+event_id,\n            'body':{'tenant':'demo','event_id':event_id,'delta':delta}}\n\n\ndef run():\n    with tempfile.TemporaryDirectory(prefix='infra-batch-') as tmp:\n        path=str(Path(tmp)/'business.sqlite')\n        initialise(path)\n        crashed=subprocess.run([sys.executable,__file__,'--crash',path],capture_output=True)\n        assert crashed.returncode==23\n        batch=handle_batch(path,[message('A'),message('B'),message('C')],failing=('B',))\n        assert batch=={'batchItemFailures':[{'itemIdentifier':'msg-B'}]}\n        assert handle_batch(path,[message('B')])=={'batchItemFailures':[]}\n        with sqlite3.connect(path) as db:\n            attempts=dict(db.execute('SELECT event_id,count(*) FROM attempts GROUP BY event_id'))\n            effects=db.execute('SELECT count(*) FROM effects').fetchone()[0]\n        assert attempts=={'A':2,'B':2,'C':1} and effects==3\n        # A redelivery can have a new transport ID and the same business ID.\n        assert handle_batch(path,[message('A','another-message-id')])=={'batchItemFailures':[]}\n        conflict=handle_batch(path,[message('A','conflict-id',delta=99)])\n        assert conflict['batchItemFailures']==[{'itemIdentifier':'conflict-id'}]\n        workers=[subprocess.Popen([sys.executable,__file__,'--worker',path],\n                                  stdout=subprocess.PIPE,stderr=subprocess.PIPE) for _ in range(2)]\n        for worker in workers:\n            _,stderr=worker.communicate(timeout=20)\n            assert worker.returncode==0,stderr\n        with sqlite3.connect(path) as db:\n            assert db.execute(\"SELECT count(*) FROM effects WHERE event_id='X'\").fetchone()[0]==1\n            assert db.execute(\"SELECT count(*) FROM attempts WHERE event_id='X'\").fetchone()[0]==2\n        return {'status':'passed','crash_after_commit_exit_code':23,\n                'second_batch_response':batch,'attempts_after_B_recovery':attempts,\n                'effects_after_B_recovery':effects,'new_message_id_same_action_no_effect':True,\n                'same_id_different_intent_rejected':True,\n                'concurrent_X':{'attempts':2,'effects':1},\n                'scope':'Real local processes and SQLite atomic transactions. Batch response shape models Lambda/SQS with ReportBatchItemFailures; no real visibility timer, queue or cloud concurrency test.'}\n\n\nif __name__=='__main__':\n    if len(sys.argv)>1:\n        process(sys.argv[2],message('A' if sys.argv[1]=='--crash' else 'X'),crash=sys.argv[1]=='--crash')\n    else:\n        print(json.dumps(run(),ensure_ascii=False,indent=2))\n", "gitops_model.py": "\"\"\"Small reconciliation model, deliberately independent of Argo CD/Kubernetes APIs.\"\"\"\nfrom copy import deepcopy\nimport json\n\n\ndef reconcile(desired, actual, inventory, revision_changed=False, self_heal=False, prune=False):\n    observed=deepcopy(actual)\n    owned=set(inventory)\n    actions=[]\n    for name,spec in desired.items():\n        mismatch=name not in observed or observed[name]['spec']!=spec\n        if mismatch and (revision_changed or self_heal):\n            observed[name]={'spec':deepcopy(spec),'available':0}\n            owned.add(name)\n            actions.append('apply:'+name)\n    for name in sorted(owned-set(desired)):\n        if prune and name in observed:\n            del observed[name]\n            actions.append('delete:'+name)\n            owned.discard(name)\n    synced=all(name in observed and observed[name]['spec']==spec for name,spec in desired.items())\n    synced=synced and not (owned-set(desired))\n    healthy=bool(desired) and all(name in observed and observed[name]['available']>=spec['replicas']\n                                 for name,spec in desired.items())\n    return observed,owned,{'synced_model':synced,'healthy_model':healthy,'actions':actions}\n\n\ndef run():\n    desired={'reports':{'replicas':2,'digest':'sha256:'+'1'*64}}\n    actual={'reports':{'spec':{'replicas':5,'digest':'sha256:'+'1'*64},'available':5},\n            'unmanaged':{'spec':{'replicas':1,'digest':'other'},'available':1}}\n    inventory={'reports'}\n    unchanged,_,off=reconcile(desired,actual,inventory)\n    assert unchanged['reports']['spec']['replicas']==5 and not off['synced_model']\n    healed,owned,on=reconcile(desired,actual,inventory,self_heal=True)\n    assert healed['reports']['spec']['replicas']==2 and on['synced_model'] and not on['healthy_model']\n    healed['reports']['available']=2\n    _,_,ready=reconcile(desired,healed,owned)\n    assert ready['synced_model'] and ready['healthy_model']\n    healed['config']={'spec':{'content':'v1'},'available':1}\n    owned.add('config')\n    retained,_,no_prune=reconcile(desired,healed,owned,revision_changed=True,prune=False)\n    assert 'config' in retained and not no_prune['synced_model']\n    pruned,_,yes_prune=reconcile(desired,healed,owned,revision_changed=True,prune=True)\n    assert 'config' not in pruned and 'reports' in pruned and 'unmanaged' in pruned\n    # A healthy matching specification still needs a separate business assertion.\n    response={'status':200,'report_version':'old'}\n    business_ok=response['status']==200 and response['report_version']=='expected'\n    assert not business_ok\n    return {'status':'passed','self_heal_off_replicas':5,'self_heal_on_replicas':2,\n            'after_spec_apply':on,'after_readiness':ready,'business_assertion_passed':business_ok,\n            'prune_off_retains_resource':True,'prune_on_deletes_tracked_only':True,\n            'scope':'Deterministic teaching model, not an Argo CD controller or a Kubernetes cluster. Status names are model outputs, not complete Argo health rules.'}\n\n\nif __name__=='__main__':\n    print(json.dumps(run(),ensure_ascii=False,indent=2))\n", "main.tf": "terraform {\n  required_version = \">= 1.4, < 2.0\"\n}\n\n# The built-in provider stores a release contract in LOCAL state.\n# It does not create a deployment, a cloud instance, or a container.\nresource \"terraform_data\" \"release\" {\n  input = {\n    replicas = 2\n    digest   = \"sha256:1111111111111111111111111111111111111111111111111111111111111111\"\n  }\n}\n\noutput \"release\" {\n  value = terraform_data.release.output\n}\n", "mysql-pitr.md": "# MySQL 8.4：逻辑基线 + binlog 的隔离恢复步骤\n\n这是目标环境操作手册；本次未启动 MySQL 或执行这些命令。本地 `recovery_lab.py` 使用 SQLite 的真实备份与应用日志，不能代替本手册的 MySQL 验证。\n\n适用题设：同版本隔离测试源/目标，业务库 `lab` 的表均为 InnoDB，基线期间无 DDL，完整保留相关 binlog，目标与源分离并隔离业务写入。使用提前配置好的 `source`/`restore` login-path，不把密码放进命令或课程文件。GTID、多源、加密与物理备份有额外恢复规则，应按实际方案核对。\n\n1. 获取一致逻辑基线并保留恢复坐标：\n\n```sh\nmysqldump --login-path=source --single-transaction --source-data=2 \\\n  --set-gtid-purged=OFF --databases lab > baseline.sql\n```\n\n`--source-data=2` 以注释记录文件/位置；`--single-transaction` 的一致性范围是事务表，不能在导出时并发做相关 DDL。此处有意选择文件位置恢复，不把 `gtid_purged` 当成一行万能设置。\n\n2. 核对基线中的坐标、误操作所在事务与目标边界。用匹配版本的 `mysqlbinlog` 检查日志，不把展示用 `--verbose --base64-output=DECODE-ROWS` 输出当作可执行恢复流。确定首个日志的开始位置及最后日志排除坏事务的停止位置；准备其间完整、顺序正确的文件，不能只给首尾两个文件而漏掉中间段。\n\n3. 在隔离目标恢复基线：\n\n```sh\nmysql --login-path=restore < baseline.sql\n```\n\n4. 下面的 Bash 片段在手工确定坐标后运行。先将 `FIRST_POS`/`STOP_POS` 设置成实际数字，把 `LOG_FILES` 换成从起点到终点的全部已验证文件。单文件恢复时数组只放该文件一次。停止边界必须经过事务核对。\n\n```bash\nset -euo pipefail\n: \"${FIRST_POS:?set baseline next-event position}\"\n: \"${STOP_POS:?set target stop position in last file}\"\n# Example names only: replace every name with the verified ordered chain.\nLOG_FILES=(mysql-bin.000123 mysql-bin.000124 mysql-bin.000125)\nmysqlbinlog --start-position=\"$FIRST_POS\" --stop-position=\"$STOP_POS\" \\\n  \"${LOG_FILES[@]}\" | mysql --login-path=restore\n```\n\n`start-position` 对首个文件、`stop-position` 对最后文件生效。逐个文件单独重用相同坐标会改变含义。恢复流也可能影响多个库，应先核对完整内容与依赖；不要随意加过滤参数后假定仍保持事务语义。\n\n5. 核查目标业务行、聚合、schema/权限与已恢复提交范围；对照教学历史应包含 T103 得到余额125，排除误清零 T104。再验证新业务 ID 的后续写入与回执，最后按恢复设计切流。记录准备、传输、重放、验收和正式恢复时间；已经发生的后续合法业务另行对账。\n\n依据：\n\n- https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html\n- https://dev.mysql.com/doc/refman/8.4/en/point-in-time-recovery-binlog.html\n- https://dev.mysql.com/doc/refman/8.4/en/mysqlbinlog.html\n", "recovery_lab.py": "\"\"\"SQLite backup + application-journal replay. This is NOT database WAL PITR.\"\"\"\nimport hashlib\nimport json\nfrom pathlib import Path\nimport sqlite3\nimport tempfile\n\n\ndef connect(path):\n    return sqlite3.connect(str(path), isolation_level=None)\n\n\ndef fingerprint(event):\n    return hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()\n\n\ndef replay(db, event):\n    db.execute('BEGIN IMMEDIATE')\n    try:\n        old = db.execute('SELECT fingerprint FROM applied WHERE seq=?',\n                         (event['seq'],)).fetchone()\n        if old:\n            if old[0] != fingerprint(event):\n                raise ValueError('same sequence, different intent')\n            db.execute('COMMIT')\n            return False\n        last = db.execute('SELECT last_seq FROM watermark').fetchone()[0]\n        if event['seq'] != last + 1:\n            raise ValueError('journal gap: expected %s, got %s' % (last + 1, event['seq']))\n        db.execute('UPDATE account SET balance=balance+? WHERE id=1', (event['delta'],))\n        db.execute('INSERT INTO applied VALUES (?,?)', (event['seq'], fingerprint(event)))\n        db.execute('UPDATE watermark SET last_seq=?', (event['seq'],))\n        db.execute('COMMIT')\n        return True\n    except BaseException:\n        if db.in_transaction:\n            db.execute('ROLLBACK')\n        raise\n\n\ndef restore(base, destination, journal, target):\n    # Validate availability and identity BEFORE exposing a recovered database.\n    unique = {}\n    for event in journal:\n        seq = event['seq']\n        if seq in unique and fingerprint(unique[seq]) != fingerprint(event):\n            raise ValueError('conflicting journal records')\n        unique[seq] = event\n    source = connect(base)\n    try:\n        baseline = source.execute('SELECT last_seq FROM watermark').fetchone()[0]\n    finally:\n        source.close()\n    if target < baseline:\n        raise ValueError('target predates this baseline')\n    if any(seq not in unique for seq in range(baseline + 1, target + 1)):\n        raise ValueError('incomplete journal chain')\n    source, recovered = connect(base), connect(destination)\n    try:\n        source.backup(recovered)\n        for seq in range(baseline + 1, target + 1):\n            replay(recovered, unique[seq])\n        assert recovered.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'\n        balance = recovered.execute('SELECT balance FROM account WHERE id=1').fetchone()[0]\n        point = recovered.execute('SELECT last_seq FROM watermark').fetchone()[0]\n        return {'last_seq': point, 'balance': balance}\n    finally:\n        source.close()\n        recovered.close()\n\n\ndef run():\n    with tempfile.TemporaryDirectory(prefix='infra-recovery-') as tmp:\n        folder = Path(tmp)\n        live, base = connect(folder/'live.sqlite'), connect(folder/'base.sqlite')\n        live.executescript('CREATE TABLE account(id INTEGER PRIMARY KEY, balance INTEGER);'\n                           'INSERT INTO account VALUES(1,100);'\n                           'CREATE TABLE watermark(last_seq INTEGER);'\n                           'INSERT INTO watermark VALUES(100);'\n                           'CREATE TABLE applied(seq INTEGER PRIMARY KEY, fingerprint TEXT);')\n        live.backup(base)\n        base.close()\n        journal = [{'seq':101,'delta':10},{'seq':102,'delta':20},\n                   {'seq':103,'delta':-5},{'seq':104,'delta':-125}]\n        for event in journal:\n            replay(live,event)\n        assert live.execute('SELECT balance FROM account').fetchone()[0] == 0\n        live.close()\n        result = restore(folder/'base.sqlite',folder/'recovered.sqlite',journal,103)\n        assert result == {'last_seq':103,'balance':125}\n        rejected = False\n        try:\n            restore(folder/'base.sqlite',folder/'gap.sqlite',\n                    [event for event in journal if event['seq'] != 102],103)\n        except ValueError:\n            rejected = True\n        assert rejected and not (folder/'gap.sqlite').exists()\n        recovered = connect(folder/'recovered.sqlite')\n        assert replay(recovered, {'seq':103,'delta':-5}) is False\n        conflict = False\n        try:\n            replay(recovered, {'seq':103,'delta':99})\n        except ValueError:\n            conflict = True\n        assert conflict\n        # Consumer validation: a new write must continue from the restored point.\n        replay(recovered, {'seq':104,'delta':5})\n        assert recovered.execute('SELECT balance FROM account').fetchone()[0] == 130\n        recovered.close()\n        return {'status':'passed','sqlite':sqlite3.sqlite_version,\n                'source_after_bad_104':0,'requested_target':103,'restored':result,\n                'gap_102_rejected_before_restore':rejected,\n                'duplicate_103_no_effect':True,'same_sequence_different_intent_rejected':conflict,\n                'consumer_continued_to':104,'consumer_balance':130,\n                'scope':'Real SQLite backup/transactions; synthetic application journal, not MySQL binlog/PostgreSQL WAL or power-loss durability.'}\n\n\nif __name__ == '__main__':\n    print(json.dumps(run(),ensure_ascii=False,indent=2))\n", "terraform_lab.py": "\"\"\"Execute real Terraform locally using its built-in provider; no cloud resources.\"\"\"\nimport json\nimport os\nfrom pathlib import Path\nimport subprocess\nimport sys\nimport tempfile\n\n\ndef config(digit):\n    return '''terraform { required_version = \">= 1.4, < 2.0\" }\nresource \"terraform_data\" \"release\" {\n  input = { replicas = 2, digest = \"sha256:%s\" }\n}\noutput \"release\" { value = terraform_data.release.output }\n''' % (digit*64)\n\n\ndef run(binary):\n    executable=str(Path(binary).resolve()) if '/' in binary else binary\n    env={**os.environ,'TF_IN_AUTOMATION':'1','CHECKPOINT_DISABLE':'1','TF_INPUT':'0'}\n    with tempfile.TemporaryDirectory(prefix='infra-terraform-') as tmp:\n        folder=Path(tmp)\n        def tf(*args,ok=True):\n            result=subprocess.run([executable,*args],cwd=tmp,env=env,text=True,capture_output=True)\n            if ok and result.returncode!=0:\n                raise RuntimeError(result.stderr or result.stdout)\n            return result\n        def plan(digit,name):\n            (folder/'main.tf').write_text(config(digit))\n            tf('plan','-no-color','-out='+name)\n        (folder/'main.tf').write_text(Path(__file__).with_name('main.tf').read_text())\n        tf('init','-no-color')\n        tf('validate','-no-color')\n        plan('1','v1.tfplan')\n        initial=json.loads(tf('show','-json','v1.tfplan').stdout)\n        assert initial['resource_changes'][0]['change']['actions']==['create']\n        (folder/'main.tf').write_text(config('2'))\n        tf('apply','-no-color','v1.tfplan')\n        first=json.loads(tf('output','-json').stdout)['release']['value']\n        assert first['digest']=='sha256:'+'1'*64  # saved plan, not edited config\n        plan('2','v2.tfplan')\n        changes=json.loads(tf('show','-json','v2.tfplan').stdout)\n        assert changes['resource_changes'][0]['change']['actions']==['update']\n        tf('apply','-no-color','v2.tfplan')\n        second=json.loads(tf('output','-json').stdout)['release']['value']\n        assert second['digest']=='sha256:'+'2'*64\n        stable=tf('plan','-no-color','-detailed-exitcode',ok=False)\n        assert stable.returncode==0\n        plan('3','stale.tfplan')\n        plan('4','new.tfplan')\n        tf('apply','-no-color','new.tfplan')\n        stale=tf('apply','-no-color','stale.tfplan',ok=False)\n        assert stale.returncode!=0 and 'stale' in (stale.stderr+stale.stdout).lower()\n        version=json.loads(tf('version','-json').stdout)['terraform_version']\n        return {'status':'passed','terraform':version,'provider':'terraform.io/builtin/terraform',\n                'initial_actions':['create'],'saved_v1_plan_applied_v1_despite_v2_config':True,\n                'v2_actions':['update'],'v2_state':second,'unchanged_plan_exit_code':0,\n                'stale_saved_plan_rejected':True,\n                'scope':'Real Terraform CLI and local state, built-in terraform_data only; no cloud provider, remote API drift, remote lock or GitOps controller execution.'}\n\n\nif __name__=='__main__':\n    print(json.dumps(run(sys.argv[1] if len(sys.argv)>1 else 'terraform'),ensure_ascii=False,indent=2))\n"};
const cloudDeepLabValidation={"status": "passed", "verified_at_utc": "2026-11-04T04:45:18.300543+00:00", "python": "3.9.6", "platform": "macOS-26.2-arm64-arm-64bit", "programs": {"recovery_lab.py": {"status": "passed", "sqlite": "3.51.0", "source_after_bad_104": 0, "requested_target": 103, "restored": {"last_seq": 103, "balance": 125}, "gap_102_rejected_before_restore": true, "duplicate_103_no_effect": true, "same_sequence_different_intent_rejected": true, "consumer_continued_to": 104, "consumer_balance": 130, "scope": "Real SQLite backup/transactions; synthetic application journal, not MySQL binlog/PostgreSQL WAL or power-loss durability."}, "event_batch_lab.py": {"status": "passed", "crash_after_commit_exit_code": 23, "second_batch_response": {"batchItemFailures": [{"itemIdentifier": "msg-B"}]}, "attempts_after_B_recovery": {"A": 2, "B": 2, "C": 1}, "effects_after_B_recovery": 3, "new_message_id_same_action_no_effect": true, "same_id_different_intent_rejected": true, "concurrent_X": {"attempts": 2, "effects": 1}, "scope": "Real local processes and SQLite atomic transactions. Batch response shape models Lambda/SQS with ReportBatchItemFailures; no real visibility timer, queue or cloud concurrency test."}, "terraform_lab.py": {"status": "passed", "terraform": "1.13.0", "provider": "terraform.io/builtin/terraform", "initial_actions": ["create"], "saved_v1_plan_applied_v1_despite_v2_config": true, "v2_actions": ["update"], "v2_state": {"digest": "sha256:2222222222222222222222222222222222222222222222222222222222222222", "replicas": 2}, "unchanged_plan_exit_code": 0, "stale_saved_plan_rejected": true, "scope": "Real Terraform CLI and local state, built-in terraform_data only; no cloud provider, remote API drift, remote lock or GitOps controller execution."}, "gitops_model.py": {"status": "passed", "self_heal_off_replicas": 5, "self_heal_on_replicas": 2, "after_spec_apply": {"synced_model": true, "healthy_model": false, "actions": ["apply:reports"]}, "after_readiness": {"synced_model": true, "healthy_model": true, "actions": []}, "business_assertion_passed": false, "prune_off_retains_resource": true, "prune_on_deletes_tracked_only": true, "scope": "Deterministic teaching model, not an Argo CD controller or a Kubernetes cluster. Status names are model outputs, not complete Argo health rules."}}, "source_sha256": {"README.md": "a77b8b149afb2c19972b97345c5a110cc54687f5d4dde4dd9d6672593e5a1d27", "argocd-application.yaml": "30b295bc0daef14964c1c13dc76406e3c83e596b1d37df7665ecd3f055a0e072", "event_batch_lab.py": "4aafc30d700e0d9f82baa84a798d4a48d2521d2d6a4f05c2285731329467e4d8", "gitops_model.py": "81743b0a3feefa5a1744cc9f45fbac7c8478a4f4fcf98d08ebe266f78516987a", "main.tf": "7492b03f3ef2baa1a0334837d67846a07e61ec1dfd0ecd2fcd7abd9b3f065a72", "mysql-pitr.md": "0546b305696bbebe416d7246097658f1f4692e4732320417c1b31f96f2469574", "recovery_lab.py": "c9693212334d80fba2eb951619cc6b97a5b6f88a3623f1d98956707cd16b0211", "terraform_lab.py": "69044b7a14081a1691206d8b07596c50202ab95416c2221b39ca4cff4699dd85"}, "not_executed": ["MySQL/PostgreSQL engine recovery", "AWS Lambda/SQS or other cloud functions", "Terraform cloud providers or remote backend locking", "Argo CD/Flux/Kubernetes cluster"], "configuration_review_only": ["mysql-pitr.md", "argocd-application.yaml"]};


;
// cloud-data-mechanics.js
/* C3: knowledge first; runnable recovery work is rendered after all eight topics. */
Object.assign(sources,{
 v13Redo:['MySQL 8.4 · Redo 与崩溃恢复','https://dev.mysql.com/doc/refman/8.4/en/innodb-recovery.html'],
 v13Flush:['MySQL 8.4 · 提交时 redo 持久化参数','https://dev.mysql.com/doc/refman/8.4/en/innodb-parameters.html#sysvar_innodb_flush_log_at_trx_commit'],
 v13Binlog:['MySQL 8.4 · binlog 同步与组提交','https://dev.mysql.com/doc/refman/8.4/en/replication-options-binary-log.html#sysvar_sync_binlog'],
 v13Semi:['MySQL 8.4 · 半同步的接收与确认','https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html'],
 v13SemiPoint:['MySQL 8.4 · AFTER_SYNC / AFTER_COMMIT','https://dev.mysql.com/doc/refman/8.4/en/replication-semisync-interface.html'],
 v13Gtid:['MySQL 8.4 · GTID 集合运算','https://dev.mysql.com/doc/refman/8.4/en/gtid-functions.html'],
 v13Pitr:['MySQL 8.4 · 完整备份与 binlog 恢复','https://dev.mysql.com/doc/refman/8.4/en/point-in-time-recovery-binlog.html'],
 v13Mysqlbinlog:['MySQL 8.4 · mysqlbinlog 停止边界','https://dev.mysql.com/doc/refman/8.4/en/mysqlbinlog.html#option_mysqlbinlog_stop-position'],
 v13PgArchive:['PostgreSQL · 连续归档、基线与时间线','https://www.postgresql.org/docs/current/continuous-archiving.html'],
 v13PgFence:['PostgreSQL · 故障接管与旧主隔离','https://www.postgresql.org/docs/current/warm-standby-failover.html'],
 v13SqliteBackup:['SQLite · Online Backup API','https://www.sqlite.org/backup.html'],
 v13S3Conditional:['Amazon S3 · 条件写入','https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html']
});
Object.assign(cloudKnowledgeExplanations,{
 'storage-model':knowledgeSubhead('先确定谁管理地址、元数据和并发修改')+para(
 '块设备把地址空间切成逻辑块，主机上的文件系统或数据库负责组织结构、空闲空间与恢复协议。文件存储把路径、目录、权限和文件操作交给文件系统；对象存储则通过 bucket/key 与 GET、PUT 等 API 读写对象。三者的区别首先是接口和责任，不是“哪一种永远最快”。云盘上还可以放文件系统，文件系统又可以承载数据库，比较时必须对齐层次。',
 '文件访问会包含打开路径、查元数据、读写偏移和同步等动作。对象更新通常以对象版本为单位；把它挂成文件路径的适配层需要自行映射重命名、随机写、锁与缓存。一个大文件能被顺序下载，不等于它能按数据库所需的方式原地修改一页。共享访问还要回答：两个客户端同时写时谁仲裁，读者能看到哪个版本。')+
 table(['接口','应用主要操作','需要核对的契约'],[['块','读写逻辑块；上层组织页和文件','写顺序、flush、故障后内容、卷拓扑'],['文件','路径、目录、偏移、元数据','缓存一致性、锁、rename、共享挂载'],['对象','按 key/版本 GET、PUT、列举','单对象原子性、条件写、版本与跨对象发布']])+
 para('以普通 S3 对象为例，成功更新一个 key 后的读取/列举具有其文档定义的强一致性，单 key 更新是原子可见的；一组 key 没有因此获得跨对象事务。发布备份或训练检查点时，可以先写不可变数据对象和校验清单，再切换一个完整版本引用。消费者应从同一清单读取全部组成部分，并核对版本、摘要和解密能力，避免把不同批次的文件拼在一起。'),
 'storage-performance':knowledgeSubhead('把操作数、字节数、并发与等待放进同一份账')+
 knowledgeFormula('固定请求大小时','吞吐 = IOPS × 每次字节数；平均在途 I/O ≈ 完成 IOPS × 平均 I/O 时长','第二式要求相同稳态窗口与系统边界；均值关系不直接给 p99 或队列上限。')+
 para('每秒 1000 次、每次 8 KiB，吞吐是 8000 KiB/s，约 7.81 MiB/s；每次改成 1 MiB 才是 1000 MiB/s 的需求。同一个卷还受字节带宽、操作频率和链路限制，因此增大请求后不能假定 IOPS 保持不变。混合请求要逐类相加，不能拿平均大小掩盖大量小随机操作的成本。',
 '若稳定完成 10000 IOPS，平均从提交到完成为 2ms，平均在途约为 20 个。将并发从 1 提到 20 可能覆盖设备等待，但继续加深队列会同时增加排队时长。有效优化应记录完成量与延迟分布：IOPS 上升而 p99 明显恶化，可能只是让更多请求等在设备前面。',
 '应用读取还会穿过页缓存、文件系统、网络客户端和设备队列。热缓存读主要测到了缓存路径；缓冲 write 返回也可能仅完成复制到内存。测试报告要固定工作集、块大小、随机/顺序、读写比例、并发、同步方式、持续时间与错误数，并把应用完成和持久确认分开计时。数据库写入场景应继续看日志同步、脏页刷新与锁等待，而不只比较云盘峰值。'),
 'durability-consistency':knowledgeSubhead('写入确认是一份故障条件下的承诺')+para(
 '持久性回答某个确认之后的数据在约定故障下能否保留；一致性回答不同读写可以按什么顺序被观察；可用性回答故障期间哪些操作还能完成。单机内存中的最新值可以立即被当前进程读取，却未必耐断电；三份保存相同旧值的副本也不会自动让读取满足“读到刚刚提交的版本”。应把确认时点、观察范围与故障模型一起写下。',
 '写前日志的关键顺序是：与脏页修改相关的日志先满足恢复所需的持久化条件，再允许对应数据页持久写出。事务可以在数据页仍脏时完成提交，因为崩溃后引擎能够依据日志恢复，未完成事务再按协议处理。这样把随机数据页写入与提交路径分开；每次提交不必同步写出整个数据库。')+
 figure('v13-write-path','写入路径的两种保证：本地恢复依赖写前日志与提交协议；图中正常生效的半同步 AFTER_SYNC 另等待所需副本持久接收，仍不等于副本已经应用。')+
 table(['保证/对象','主要解决什么','读数应落在哪里'],[['redo / WAL','引擎崩溃恢复与相关页写入顺序','日志持久位置、事务状态、恢复结果'],['复制确认','在指定远端保留相应事务材料','实际参与 ACK 的副本和持久接收点'],['一致性读取','读者按约定看到哪版结果','会话、主/副本路由、快照与应用点'],['备份与历史恢复','误删或损毁后重建指定历史','可信基线、连续日志、目标与消费者校验']])+
 para('多副本可以提高故障容忍，但错误更新也会复制。备份则需要保留可选择的历史，并让备份、日志、密钥与恢复权限在目标故障下仍然可取。只有明确哪些事件属于“已确认”，才能测量丢失窗口；只看磁盘有多份副本，无法推出 RPO。'),
 'database-service':knowledgeSubhead('从查询路径到提交路径，分清索引、版本、锁和日志')+para(
 'B+树索引先按索引键定位范围，再取需要的列。InnoDB 的聚簇索引叶子保存行，二级索引通常保存索引列与主键；覆盖索引可省去一部分回表。联合索引 (tenant_id, created_at, id) 可以先收窄租户，再扫描时间范围；排序和其他条件是否还能由索引完成，要看实际条件、方向、列与优化器。高选择性、范围扫描行数、回表次数和结果数量比“有没有命中索引”更能解释成本。',
 'MVCC 用行版本和可见性规则构成一致读；锁协调冲突的修改与相应的锁定读。MySQL/InnoDB 的 RC 普通一致读通常每条语句建立新快照，RR 在事务内复用相应一致读视图；锁定读和写入又按各自规则访问、加锁。长事务会延长旧版本保留和资源占用，索引范围不合适也可能扩大锁冲突。诊断时先区分连接等待、锁等待、执行扫描和日志/存储等待。')+
 table(['机制','作用','工程后果'],[['undo / 行版本','提供历史版本及事务回滚所需信息','旧快照可能拖延版本清理'],['redo','记录引擎恢复所需修改','提交与脏页刷新可以分离'],['binlog','服务器层事务事件流，用于复制和增量重放','行事件不等于原样 SQL 文本'],['组提交','让多笔事务共享部分日志同步工作','不能按事务数直接推断 fsync 次数']])+
 para('启用 binlog 时，InnoDB 与服务器层通过提交协议协调两份日志。常说的“双 1”分别是 innodb_flush_log_at_trx_commit=1 与 sync_binlog=1：按相应提交规则同步 redo 与 binlog。write 到操作系统缓存与要求存储持久化是两层边界，底层仍要兑现 flush。取 0/2 时的后台同步受调度和配置影响，“约一秒”不是最多丢一秒的硬保证。',
 '托管数据库把部分安装、维护与备份动作交给平台，应用仍需定义事务范围、索引、连接数、超时及操作 ID。客户端断开可能发生在提交之后；恢复调用应查询原业务回执或沿用原幂等键。双 1 解决本地日志的相应耐久性，远端灾备、误删恢复与业务去重仍各有协议。'),
 'replication-failover':knowledgeSubhead('接收、持久接收、应用完成，分别是一根进度线')+para(
 '异步复制允许源端在指定副本收到事务之前回应成功。MySQL 半同步生效时，源端等待规定数量的副本把相应事件写入并同步 relay log；副本执行线程可以仍落后。8.4 的 AFTER_SYNC 等待点在源端 binlog 同步之后、引擎提交之前；AFTER_COMMIT 则在源端引擎提交之后等确认。发生超时回退异步时，保证随实际运行状态变化，不能只凭“已开启半同步”判断每笔成功的远端副本。')+
 figure('v13-replica-fencing','同一账本的可复算快照：B 当前应用到 101 得到 110，应用本地 102 后为 130；再补 103 才得到已确认的 125。数据追齐与剥夺旧主写权是两道放行条件。')+
 para('GTID 标识事务，候选选择需要比较事务集合及所处历史。最大编号看不出集合中有洞、其他源或额外分叉；接收集合和执行集合还要分别核实。图中的 T101 等是课堂顺序标签，不是真实 GTID 或 LSN。若唯一保有必需事件的副本也不可取，切到较旧候选只能承认相应损失或保持写入阻断，不能凭晋升动作补出缺失数据。',
 '切主的另一个任务是排他写权。把 DNS/VIP 指向新主只影响部分新连接，旧连接和内部任务仍可能写旧主。应在实际写入边界落实可证明的隔离或任期校验，并规定旧主恢复后如何重建和重新加入。仲裁复制还要按具体协议讨论多数派和提交点，不能把普通主从、半同步和共识组统一称为“有副本就可自动零损切换”。')+
 knowledgeCheck('为什么 B 本地日志重放完毕，余额 130 仍不能作为成功恢复？','已确认历史还包含 T103 的 −5。B 需要取回并验证同一历史的 T103，恢复到 125；同时证明旧主失去写权，核对读写路由和业务回执后再放行。'),
 'cache-layer':knowledgeSubhead('缓存更新需要处理晚到的旧读')+para(
 'cache-aside 常按“读缓存，未命中则读库回填；写库提交后失效缓存”运行。它把权威状态放在数据库，把缓存当派生结果。一次竞争就能解释陈旧值：读者先取得旧版本 v7，写者提交 v8 并删除缓存，随后旧读者才把 v7 写回。TTL 给陈旧值设置生命周期，却没有建立跨数据库与缓存的原子提交。',
 '解决办法要围绕版本与排序设计。可以在权威写入中产生可排序版本和可靠失效事件，让消费者只推进缓存版本；在需要拒绝晚到回填的场景，保留版本栅栏或墓碑，并原子比较版本。仅做“键不存在才写”仍可能接受刚被删除后到达的旧值。必须同时说明版本依据、比较原子性、记录保留和重试。',
 '缓存失效也改变源站流量。热门键过期时合并并发回源、使用受控旧值或提前刷新，可以缓解击穿；全量清空则可能把原来由缓存承担的请求集中到数据库。验收需同时看陈旧窗口、源站吞吐、锁/连接等待和失败率。需要严格读取新提交时，应提供满足该一致性要求的权威读取路径。'),
 'messaging':knowledgeSubhead('把业务提交、投递和消费确认排成三个事件')+para(
 '队列用于分配待处理工作，分区日志用于保留可顺序重放的记录。消息已进入队列、消费者取得消息、业务事务提交、消息删除或位点推进，分别是不同事实。先确认再做业务，退出可能丢工作；先做业务再确认，退出可能重投。至少一次路径通常选择后者，再由接收方沿稳定业务 ID 去重。',
 '数据库提交后再单独发消息，也有“事务成功而消息没发出”的间隙。事务 outbox 把业务变化和待发事件写入同一事务，发布者随后可靠发送；发送完成与 outbox 标记之间仍可重复，因此消费者还要具备幂等接收。外部服务的副作用不在本地事务里时，要继续沿对方的回执/幂等协议连接确认点。')+
 table(['对象','保持稳定的身份','进度与顺序范围'],[['业务动作','租户 + 操作 ID + 意图摘要','跨重试关联同一效果'],['一次投递','消息 ID、接收回执等运输标识','支持本次确认或批响应'],['分区记录','分区与 offset 等来源坐标','顺序与提交通常只在规定范围内']])+
 para('“事务消息”或“恰好一次”必须说明覆盖哪些系统、哪些消费和外部效果。分区数增加能扩展部分并行度，也会改变键的排序和消费者分配。记录堆积时同时检查生产率、有效完成率、重试与最老消息年龄；仅看取消息的速率可能把重复尝试算成业务进展。'),
 'backup-restore':knowledgeSubhead('恢复到一个点，需要可信基线与连续的增量历史')+para(
 '崩溃恢复让数据库在已有数据与日志上恢复一致；PITR 则从备份重建到指定历史点。MySQL 常见路线是完整备份加后续 binlog；PostgreSQL 物理恢复使用可恢复的 base backup 加连续 WAL 和正确时间线。逻辑导出、物理基线、引擎 redo 与复制事件不能随意拼接；日志收集必须从该基线实际需要的起点开始，不能只按备份完成的墙钟时刻切文件。')+
 figure('v13-pitr-chain','同一教学历史的另一次故障：包含 T103、排除误清零 T104，目标余额为 125。基线后的必需片段缺失时，后面还有日志也无法凭空越过缺口。')+
 para('时间便于寻找误操作，最终边界还需对应完整事务、文件位置或该引擎支持的恢复目标。时区、同秒多笔交易、长事务和目标包含性都影响选择。不要把任意 SQL 的出现位置直接当成 COMMIT 边界，也不要默认跳过一笔坏事务后所有后续事务仍能安全重放。先在隔离目标恢复，避免恢复结果与旧写流量混在一起。',
 '材料清单应包含基线身份、起始坐标、连续日志范围、版本/时间线、校验与解密所需信息。依次验证可下载、可校验、可解析、可重放；数据库启动后再核对关键行、聚合、权限和代表性读写。备份任务成功只是这些步骤的输入。')+
 knowledgeFormula('恢复时间预算的组成','RTO实耗 = 准备 + 取回基线 + 重放 + 启动 + 消费者验证 + 切流','各阶段可能重叠，应按真实关键路径计时；RPO 另以已确认历史与实际恢复点衡量。')+
 para('例如 200 GiB 基线按持续 100 MiB/s 取回，理想传输就需 2048 秒，约 34.1 分钟；这还没计日志应用和验收。要承诺更短 RTO，就要实测并优化关键路径，而不是只增加备份频率。恢复到更早的正确状态还意味着之后的合法业务需要对账或重做，应把数据恢复与业务补偿分别记录。')
});
cloudKnowledgeDomain('cloud-data').refs.push('v13Redo','v13Flush','v13Binlog','v13Semi','v13SemiPoint','v13Gtid','v13Pitr','v13Mysqlbinlog','v13PgArchive','v13PgFence','v13SqliteBackup','v13S3Conditional');


;
// cloud-serverless-mechanics.js
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


;
// cloud-delivery-mechanics.js
Object.assign(sources,{
 v13TfState:['Terraform · state 的身份映射','https://developer.hashicorp.com/terraform/language/state/purpose'],
 v13TfLock:['Terraform · state locking 的范围','https://developer.hashicorp.com/terraform/language/state/locking'],
 v13TfPlan:['Terraform · normal / refresh-only / saved plan','https://developer.hashicorp.com/terraform/cli/commands/plan'],
 v13TfApply:['Terraform · 应用已保存计划','https://developer.hashicorp.com/terraform/cli/commands/apply'],
 v13TfData:['Terraform · 内建 terraform_data','https://developer.hashicorp.com/terraform/language/resources/terraform-data'],
 v13ArgoSync:['Argo CD · 自动同步、自愈与清理','https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/'],
 v13ArgoHealth:['Argo CD · 资源健康评估','https://argo-cd.readthedocs.io/en/stable/operator-manual/health/'],
 v13ArgoDiff:['Argo CD · 比较范围与忽略规则','https://argo-cd.readthedocs.io/en/stable/user-guide/diffing/'],
 v13ArgoWaves:['Argo CD · phases、hooks 与 waves','https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/'],
 v13ArgoOptions:['Argo CD · prune、权限与同步选项','https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/'],
 v13FluxSource:['Flux · GitRepository 源与 Artifact','https://fluxcd.io/flux/components/source/gitrepositories/'],
 v13FluxKustom:['Flux · Kustomization 调谐、健康与 inventory','https://fluxcd.io/flux/components/kustomize/kustomizations/']
});
const deliveryDomain=cloudKnowledgeDomain('cloud-delivery');
deliveryDomain.points.splice(4,0,['gitops','GitOps：源版本、调谐、自愈与清理','GitOps 用版本化源声明期望，由控制器持续获取、渲染、比较并协调现场。Git 修订、镜像摘要、同步状态、资源健康与业务验收分别描述一层事实。','明确字段和对象的管理权；selfHeal、prune、暂停与回退按实际控制器配置解释。',['delivery','kubernetes-basics','config-secrets']]);
Object.assign(cloudKnowledgeExplanations,{
 'artifact-contract':knowledgeSubhead('交付单位是一组兼容的输入，而不只是一个标签')+para(
 '制品摘要标识具体内容，Git 提交标识期望配置的版本，部署修订标识平台保存的某次模板，数据契约说明应用怎样读写持久状态。它们共同构成交付记录。可变镜像标签可以先解析到多平台索引，再选择目标架构的清单；实际运行记录应落到相应内容摘要和架构，才能解释同标签在不同节点的差异。',
 '构建可重复要求固定源代码、依赖解析、工具链和构建输入；部署可追溯要求知道某个环境当时采用了哪些制品与配置。一次构建产物在多个环境中提升使用，可以减少“测试了 A、线上又重建出 B”的差异。密钥和环境参数在授权运行边界注入，既要保护值，也要记录其受控版本或引用。')+
 table(['版本维度','应记录的身份','验证什么'],[['代码与制品','提交、构建输入、内容摘要、平台','跑的是经过检查的那份内容'],['运行配置','版本引用、校验摘要、生效记录','进程实际采用了预期参数'],['数据/接口契约','schema 兼容窗口、依赖版本','新旧消费者可在过渡期工作'],['身份与策略','工作负载主体、授权范围、策略版','相同动作在目标环境可获正确权限']])+
 para('版本记录应能让故障时的恢复选择具体输入：旧制品是否还保留，旧配置能否取得，当前数据能否被旧程序理解。一个 digest 可以证明拿到相同字节；它需要与可信来源、测试和运行结果连接，才支持完整的交付判断。'),
 'ci-cd':knowledgeSubhead('把构建验证、变更计划和运行验收接成可追溯链')+para(
 'CI 在提交进入共享主线前发现集成问题；交付链随后构建并发布制品、更新期望配置、推动部署和验证。各阶段的输入和产物要能关联：提交 ID → 测试记录 → 制品摘要 → 配置修订 → 现场修订 → 业务结果。失败时从首个不一致的交接点定位，能比只看流水线最后一个红灯更快找到原因。',
 '快速检查适合在变更前暴露语法、类型、单元和静态契约问题；集成与目标环境检查负责数据库版本、权限、路由和真实依赖行为。测试数据、调用身份与版本也要固定。把检查全放在发布后会增大影响范围，只检查构建又会漏掉环境与数据兼容问题。')+
 table(['阶段','固定输入/输出','通过后仍需下一步核对'],[['构建','固定源与依赖 → 制品摘要','目标架构、运行配置与依赖'],['变更计划','期望配置 + 已观察状态 → 明确计划','执行时权限、外部变化与部分失败'],['部署','计划/源修订 → API 对象和运行进程','端点、配置生效和数据版本'],['验收','代表性业务输入 → 结果与 SLI','观察窗口、用户分组与后续稳定性']])+
 para('流水线身份应只持有它负责阶段的能力。构建不必拥有生产写权，部署也不必把长期凭据写入仓库。保存检查结果和计划要按内容身份关联，避免审阅了一份计划，执行阶段却悄悄换成另一份。部署成功之后仍要记录用户结果与停止条件，使“何时算完成”具有可检查的含义。'),
 'iac':knowledgeSubhead('Terraform 同时连接配置、state 身份和真实对象')+para(
 '配置描述期望管理的资源，state 将 Terraform 资源实例地址关联到远端对象 ID，并保存必要的已知属性。provider 再读取远端对象，提供新的观察。地址、远端 ID 与显示名称是三个量：改配置地址不总是改远端名称，云上已有资源也不会因为被列出来就自动归入 state。导入、地址迁移和资源移除都需要保持归属清楚，防止两份 state 同时认为自己拥有同一个对象。')+
 figure('v13-iac-three-states','同一个受管容量字段：期望 2、state 旧值 2、现场 5。应用 refresh-only 计划只更新记录为 5；按仍为 2 的期望做正常 apply，才会要求把现场改回 2。')+
 para('正常 plan 默认读取已受管远端对象，再按配置计算创建、更新、替换和删除。只运行 plan 不执行这些资源变更。refresh-only 则计算如何把 state 与相关输出对齐到现场，审阅并 apply 该刷新计划后才提交记录；它不会替人把期望配置改成现场值。接受临时扩容为长期目标时，应修改并评审配置；若现场是误改，则按原期望修复。',
 'plan -out=change.tfplan 保存执行计划，show 用于查看，apply change.tfplan 执行文件中的计划。没有传计划文件的 apply 会重新计划。保存计划固定了当时的输入和动作，却没有锁住云端世界；状态变化可使计划失效，外部权限或 API 失败也会阻止执行。配套真实 CLI 实验会先保存 v1 计划、再把文件改成 v2，证明执行 v1 计划仍产生 v1 状态；随后制造状态变化，验证陈旧计划被拒绝。',
 'remote state 是状态的存放方式，不等于执行一定在远端。只有支持锁的 backend 才提供相应 state 锁，它协调同一状态的并发写入，不阻止控制台、另一份 state 或 HPA 改现场。state 与 plan 可能含敏感值，需要访问控制和版本恢复；输出标为 sensitive 也不意味着底层记录已自动加密或 JSON 导出会隐藏值。')+
 knowledgeCheck('refresh-only 后 state=5，为什么下一次正常计划还要改回 2？','因为配置仍声明 2。刷新接受的是新的观察，不是新的期望。明确由谁拥有这个字段，再选择将配置改为 5，或按已审阅的正常计划把受管字段恢复为 2。'),
 'controller-api':knowledgeSubhead('声明式 API 需要可重复推进的协议')+para(
 '控制器通常按当前观察计算下一步，而不是把一次事件当作必须完整执行到底的命令。一个对象可能被重复入队，watch 断线后可能重新列举，动作完成与状态写回也可能分离。因此调谐应幂等、可恢复，并把正常等待、可重试错误和无效配置区分处理。有限速率与退避减少故障时对 API 和下游的放大。',
 'spec 描述期望，status 报告观察与进度。创建外部资源时，用稳定标识关联对象身份，先查询是否已有对应效果，再推进创建或更新；超时后不随手换新名字重建。写 status 要带上对应观察代际与明确条件，遇到版本冲突则重新观察，避免过期执行者覆盖新事实。相同事件被处理两次，应仍向同一个目标收敛。')+
 table(['生命周期','所需协议','可以核对的证据'],[['创建/更新','稳定外部身份、幂等动作、并发版本检查','对象 ID、观察代际、动作与回执'],['等待依赖','可恢复条件、限速重排、超时策略','当前阻塞原因与下一检查条件'],['删除','标记删除、执行外部清理、确认后移除 finalizer','外部对象已清理或明确采用保留策略']])+
 para('finalizer 让控制器在 API 对象删除前完成必要清理。它需要配套恢复和故障处理：控制器长期不可用时，删除可能停在等待清理；直接移除 finalizer 则可能留下外部资源。CRD 提供 API 结构，Operator 把领域知识编码进这些控制协议；拥有一个 CRD 不等于已经实现了数据库主身份、备份和恢复。'),
 'gitops':knowledgeSubhead('沿制品、源修订、现场和用户结果逐层确认')+
 figure('v13-gitops-reconcile','CI 产生制品摘要，Git 保存期望，控制器拉取并调谐；源修订、同步状态、资源健康和业务断言按不同证据验收。c42 与摘要省略号仅为示意。')+
 para('GitOps 把版本化源作为期望入口，由控制器持续拉取、渲染和比较现场。Git 提交里改了什么、构建路径实际渲染出什么、目标集群接受了什么，应逐层对应。改了未使用的 overlay、目标 namespace 错误或源引用仍旧，都可能让“有新提交”与“现场没有目标变化”同时成立。',
 'Argo CD 的 Synced 描述纳入比较的受管资源与目标之间的关系，比较会受默认值、忽略规则和资源跟踪影响；Healthy 依据资源类型或自定义检查评估健康。对象清单已经一致但新 Pod 拉不下镜像，可以 Synced 而不 Healthy；资源健康但报表用错数据版本，则业务断言仍失败。一次 sync operation 的结果也不同于当前持续状态。')+
 figure('v13-drift-prune','两个独立问题：现场字段由 2 手改成 5，selfHeal 决定相应自动修复；从源中移除一个受管 ConfigMap，prune 决定是否发起清理。图保留 Deployment，未混入全空保护。')+
 para('Argo CD 自动同步开启后，selfHeal 控制单纯现场漂移是否按策略自动修复；关闭时，下一次其他同步仍可能覆盖手工改动，所以不能把它当作永久接管现场的方式。prune 控制目标中已移除的受管对象清理，还受 allowEmpty、资源级保护、权限和 finalizer 影响。HPA 合法管理 replicas 时，应明确字段所有权和比较/同步策略，避免两个控制器反复争夺。',
 'Flux 将源获取交给 GitRepository 等对象，报告 Artifact/revision；Kustomization 在指定路径构建、应用，并按 inventory 和配置持续调谐。suspend 暂停新修订与漂移修复，恢复后要核对实际目标与已应用修订。Ready=False 可能来自获取、渲染、依赖、准入或健康阶段；失败重试不是自动回滚到旧版。Argo 的 selfHeal/prune 参数不能原样套到 Flux 对象。')+
 knowledgeCheck('Argo 显示 Synced，服务仍返回 503，先核对哪几层？','核对源修订与渲染范围，再查资源健康、Pod 与 EndpointSlice、配置和真实请求。若对象已对齐而进程未就绪，继续追执行层；若资源健康但内容错误，则追数据版本与业务验收。'),
 'release-strategy':knowledgeSubhead('发布策略控制变化范围，验收决定何时继续')+para(
 '滚动更新逐步替换副本，蓝绿保留可切换的环境，灰度把部分真实流量交给新版本，特性开关在同一部署中选择行为。副本比例、请求比例和用户分组可能完全不同：长连接、权重路由和会话保持会改变新版本实际接到的工作。观察应按版本与人群分组，同时记录请求量、错误和延迟，避免小流量样本或全站均值掩盖差异。',
 '声明发布前提、扩展步幅、观察窗口与停止条件，再逐步扩大。新版本启动失败应停在就绪阶段；逻辑错误需要代表性业务断言；共享数据库压力则可能同时拖慢新旧版本。蓝绿的流量切换也没有自动隔离共享状态，旧连接排空和后台任务仍要纳入时序。')+
 table(['机制','解决的排序问题','需要继续验证'],[['readiness / 发布预算','哪些副本有资格接流量，允许怎样替换','真实请求、容量与停止信号'],['Argo phase / wave','不同阶段和资源批次的先后','早期资源健康、依赖与重入'],['PostSync 业务检查','同步与资源健康之后检查指定行为','覆盖的发布路径、测试身份与结果版本']])+
 para('Argo 的排序先看 phase，再看 wave 等规则；早期 wave 不健康可以阻止后续推进。hook 要能重入、超时和清理，选择性同步不运行 hooks，因此一个 PostSync Job 不能被当成所有路径都会执行的强制验收。数据库迁移已提交后，后面的 hook 失败也不会自动撤销数据。应把发布控制流与持久副作用分开处理。'),
 'rollback-compatibility':knowledgeSubhead('回退是否可行，先检查当前数据还能被谁读取')+
 figure('v12-compatibility-matrix','三版应用与三种数据结构的题设矩阵：扩展、兼容过渡、验证消费者，最后收缩。勾叉来自本例能力定义，并非部署工具的默认保证。')+
 para('扩展后收缩先增加兼容结构，保留旧字段；再部署能处理过渡状态的程序，回填并校验；确认所有消费者已切换后才删除旧契约。回填应能从已确认进度继续，重复执行不产生额外效果。双写若跨系统，必须定义权威源和部分失败协议；同一代码分支里连续调用两个写入没有自动原子性。',
 'Git revert 产生一份新的期望变更，控制器再向该目标推进。它不会回到过去的数据库、撤销已经发送的消息或恢复被覆盖的外部对象。Argo 自动同步开启时的历史 rollback 也有工具约束，不能把命令名当作数据恢复协议。需要回到旧制品时，先确认制品可取、配置和接口兼容，再运行同一套业务断言；不兼容时应设计向前修复或单独恢复/补偿。',
 '供应链校验负责确认内容身份和可信构建来源，例如固定依赖、产物摘要、构建证明及适用签名验证。它降低来源和篡改风险，但通过签名验证的程序仍可能有业务缺陷。最终的交付证据应能连接可信输入、计划与执行、现场版本以及用户结果，让“可追溯”和“可恢复”都落到具体对象。')
});
deliveryDomain.refs.push('v13TfState','v13TfLock','v13TfPlan','v13TfApply','v13TfData','v13ArgoSync','v13ArgoHealth','v13ArgoDiff','v13ArgoWaves','v13ArgoOptions','v13FluxSource','v13FluxKustom');


;
// cloud-field-cases.js
/* Specific cases follow the complete field knowledge, never precede it. */
function fieldLabCode(file,label){return '<details class="full-code"><summary>'+label+'</summary>'+code(file,file.endsWith('.yaml')?'YAML':file.endsWith('.tf')?'HCL':'PYTHON',cloudDeepLabFiles[file])+'</details>';}
function fieldLabLinks(file){return '<p class="practice-links"><a href="labs/cloud-deepening.zip" download>下载完整代码与验证记录 ↓</a><a href="labs/cloud-deepening/'+file+'" download>下载本例源码 ↓</a><a href="labs/cloud-deepening/validation.json" target="_blank" rel="noopener">查看执行结果与源码摘要 ↗</a></p>';}
const cloudFieldCases={
 'cloud-data':()=>para('案例：一条确认历史经过 T101/+10、T102/+20、T103/−5，从基线余额 100 变成 125，T104 随后误清零。先预测需要哪些材料、在哪停止，再运行恢复。程序使用真实 SQLite 备份与事务；增量历史是自定义应用日志，用来隔离恢复链、原子重放与消费者验收这三件事。')+
 code('解压实验包后运行 · Python 3.9+ / 标准库','SH','python3 recovery_lab.py')+
 table(['检查顺序','操作','应当核对的结果'],[['完整恢复','基线100 + 连续101–103；排除104','余额125，进度103'],['缺段反例','移除102，仍要求到103','创建恢复库前拒绝，不跳过缺段'],['重复/冲突','原103重放，再用同序号换参数','原意图不再生效；异参拒绝'],['消费者继续','从恢复点执行新104/+5','余额130，进度104']])+
 code('本次实际运行的核心结果','JSON',JSON.stringify((()=>{const r=cloudDeepLabValidation.programs['recovery_lab.py'];return {restored:r.restored,gap_102_rejected:r.gap_102_rejected_before_restore,duplicate_103_no_effect:r.duplicate_103_no_effect,consumer_balance:r.consumer_balance};})(),null,2))+
 para('恢复不是把一个文件复制回来就结束。代码先验证目标前的连续序号和意图，再通过 Backup API 复制一致基线；每笔效果、回执和进度在同一事务内提交，最后做 integrity_check 与真实后续写入。它没有模拟数据库内部 WAL 重放，也没有测断电、跨区或并发备份。')+
 fieldLabCode('recovery_lab.py','展开完整恢复程序：连续性、事务与验收')+
 '<h3>迁移到 MySQL：把教学序号换成真实恢复坐标</h3>'+
 para('下载包的 MySQL 8.4 手册给出一致逻辑导出、文件位置核对、完整 binlog 链重放与消费者验收步骤。目标必须与源隔离；先确定完整事务边界，再设置开始与停止位置。手册中的命令已按官方选项核对，本次环境没有 MySQL 服务，因此没有把它计入实测结果。')+
 '<p><a href="labs/cloud-deepening/mysql-pitr.md" download>下载 MySQL 8.4 PITR 操作手册 ↓</a></p>'+
 knowledgeCheck('复习追问：日志文件“后面都有”，为什么仍恢复不到目标？','基线到目标之间必须有该引擎所需的连续历史，还要匹配版本、时间线、事务边界与解密条件。本例缺102就无法证明得到包含103的余额125；应补材料、换可覆盖目标的可信基线或明确选择可达恢复点。')+
 fieldLabLinks('recovery_lab.py'),
 'serverless':()=>para('案例：A/B/C 三个业务动作进入同一批。先让 A 在数据库提交后、返回响应前真实退出；再重投整批并让 B 临时失败。要验证的不只是函数有没有报错，而是每个动作产生几份效果、谁应该重投、回执能否解释结果未知。')+
 code('解压实验包后运行 · 不调用云 API','SH','python3 event_batch_lab.py')+
 table(['阶段','执行尝试','数据库与批响应'],[['提交间隙','A 提交后 os._exit(23)','效果A存在，调用者没有成功响应'],['再次处理整批','A重试，B失败，C成功','只返回 msg-B；A复用回执'],['恢复B','仅重试B','A=2/B=2/C=1次尝试，共3笔效果'],['并发争抢','两个本地进程处理同一X','2次尝试，1笔效果']])+
 code('本次运行结果的关键字段','JSON',JSON.stringify((()=>{const r=cloudDeepLabValidation.programs['event_batch_lab.py'];return {crash_exit:r.crash_after_commit_exit_code,response:r.second_batch_response,attempts:r.attempts_after_B_recovery,effects:r.effects_after_B_recovery,concurrent_X:r.concurrent_X};})(),null,2))+
 para('messageId 在本地固定数据中模拟运输标识，event_id 表示业务身份；新 messageId 携带同一个动作不会多写一份效果，同 ID 换参数则拒绝。此程序只处理 demo 租户，用本地共享 SQLite 验证真实跨进程原子提交；部署函数时应换成满足所需并发、耐久和权限的共享存储。')+
 fieldLabCode('event_batch_lab.py','展开完整批处理程序：提交、退出与部分失败')+
 para('这里没有启动 SQS，也没有测量云端可见性或弹性。映射到 AWS 时，先开启 ReportBatchItemFailures、按触发器设置超时与 redrive，再核对真实 receive→函数→持久提交→删除。将 /tmp 里的实验数据库直接放进函数，不能获得课程要求的跨环境持久回执。')+
 knowledgeCheck('复习追问：A/C 已提交，B 出错，handler 最后抛异常，是否只重投 B？','应先按整个调用失败处理；不能沿用“正常返回部分批次响应”的结果，A/C仍须防重。标准队列下部分失败需在映射中启用并正常返回相应 messageId；FIFO 还有组内顺序与未处理项规则。')+
 fieldLabLinks('event_batch_lab.py'),
 'cloud-delivery':()=>para('案例分两层：先用真实 Terraform CLI 看计划文件与 state，再用小型调谐模型隔离 GitOps 的状态变化。二者的验证范围分别展示，避免让一个模拟器的绿灯替代真实工具或集群。')+
 '<h3>一、保存了 v1 计划，修改成 v2 后执行哪一版？</h3>'+
 code('Terraform 1.13.0 为本次验证基线；先准备官方 CLI','SH','python3 terraform_lab.py /absolute/path/to/terraform')+
 fieldLabCode('main.tf','展开最小 HCL：只使用内建 terraform_data')+
 table(['阶段','动作','实际观察'],[['计划','保存v1，再把配置文件改v2','尚未改变本地受管状态'],['执行原计划','apply v1.tfplan','输出仍为v1摘要'],['重新计划/执行','为v2生成并应用新计划','记录更新为v2；无变化计划退出0'],['计划过期','另一计划已推进state，再应用旧计划','CLI拒绝陈旧计划']])+
 code('真实 Terraform CLI 验证摘要','JSON',JSON.stringify((()=>{const r=cloudDeepLabValidation.programs['terraform_lab.py'];return {terraform:r.terraform,provider:r.provider,saved_plan_fixed_v1:r.saved_v1_plan_applied_v1_despite_v2_config,no_change_exit:r.unchanged_plan_exit_code,stale_plan_rejected:r.stale_saved_plan_rejected};})(),null,2))+
 para('terraform_data 是内建 provider 的本地状态资源，不会创建两个 Pod 或云实例。此实验验证真实 init/validate/plan/show/apply 与保存计划语义；三方漂移图中的 provider 读取远端字段、remote backend 锁及真实云资源变更仍需目标环境验证。')+
 fieldLabCode('terraform_lab.py','展开 Terraform 实验驱动：逐步检查实际计划与结果')+
 '<h3>二、手改字段与删除对象，为什么是两套策略？</h3>'+
 code('运行确定性的调谐模型','SH','python3 gitops_model.py')+
 para('模型先固定 Git 期望 replicas=2，把现场手改为5；自愈关闭保持5，开启后恢复受管字段为2。应用 spec 后 available 仍为0，展示同步与健康的区别。随后保留 Deployment、从期望中移除受管 ConfigMap：prune关闭保留，开启清理受管ConfigMap，未受管对象仍在。最后让资源健康而业务返回旧版本，验收应失败。')+
 fieldLabCode('gitops_model.py','展开调谐教学模型：观察、修复、清理与验收')+
 fieldLabCode('argocd-application.yaml','查看需替换仓库与目标的 Argo CD 配置示例')+
 para('Argo 示例开启自动同步与 selfHeal，关闭自动 prune；使用前需要已有控制器、真实清单、源访问和项目权限。本次未执行集群同步。学习时分别改变一个策略、观察源修订/对象/status/业务结果，再测试清理保护、finalizer 与实际权限。')+
 knowledgeCheck('复习追问：state 刷新成功、Git 显示同步，为什么仍不足以宣布发布成功？','刷新对齐记录，GitOps同步对齐其比较范围；还需确认预期制品与配置生效、资源健康、数据兼容以及用户断言。计划、状态、对象与业务分别留下自己的证据。')+
 fieldLabLinks('terraform_lab.py')
};
function cloudFieldLabs(module){return cloudFieldCases[module]?'<div class="field-cases" id="field-lab">'+cloudFieldCases[module]()+'</div><h3>继续阅读领域详解</h3>':'';}
for(const [id,module,title]of [
 ['storage-recovery','cloud-data','配套实战：完整恢复、缺段拒绝与消费者继续'],
 ['serverless-execution','serverless','配套实战：批次部分失败与提交后退出'],
 ['delivery','cloud-delivery','配套实战：真实 Terraform 计划与 GitOps 调谐模型']
]){
 const article=articleByIdForCloud(id);
 article.sections.push([title,cloudFieldCases[module]()]);
 article.refs=[...new Set([...article.refs,...cloudKnowledgeDomain(module).refs])];
 article.updated='2026.11.04';
 article.minutes=Math.ceil(article.sections.reduce((n,s)=>n+s[1].replace(/<[^>]*>/g,'').length,0)/220);
}


;
// cloud-ops-lab-files.js
const cloudOpsLabFiles={"README.md": "# 身份、容量与 SRE 实验包\n\n先读对应领域的知识正文，再运行案例。Python程序要求3.9+且仅使用标准库；HTTP只绑定127.0.0.1临时端口，数据库位于程序自己的临时目录。此包不连接云账户、不部署集群。\n\n## 1. 真实 HTTP 授权与效果核对\n\n```sh\npython3 authorization_http_lab.py\n```\n\n本地签发受限的HMAC capability，服务端验证固定信任密钥、签发者、受众和时间，再按当前策略、租户及SQLite中实际行归属判定。14组请求包括正例、跨租户、路径伪装、只读写入、超出服务端策略、过期/零期限、错误受众、伪造签名、策略撤销及新旧密钥切换。结果应只有A获准的1次写入，B为0，审计14条；不输出密钥或完整凭证。\n\n这是有明确输入范围的教学协议，不是JWT/OIDC实现或生产认证库。正式服务应使用经过维护的协议库、可信签发和资源授权，不把本文件当作可直接部署的身份平台。\n\n`rbac-readonly.yaml` 给出独立测试namespace中的SA、只读指定ConfigMap的Role和RoleBinding；关闭不必要的自动token挂载。配置按官方语义审阅，没有实际创建集群对象。目标环境中要同时核对必要get成功、其他资源拒绝、其他绑定/authorizer及间接工作负载权限；使用冒充身份测试还需要相应权限。\n\n## 2. 精确排队、准入与单位成本\n\n```sh\npython3 capacity_lab.py\n```\n\nFraction流体模型：100/s输入，前10s能力80/s，之后120/s。无限缓冲下10s积压200，20s清空，30s完成3000；空队列时实际完成100/s。积压面积2000请求·秒。\n\n把积压上限改为160，前10s应完成800、剩160、拒绝40；到30s完成2960、拒绝40。每一步检查累计到达=累计完成+拒绝+剩余积压。它是按固定区间积分的模型，不是OS队列、HPA生效时限或真实压力测试。\n\n另核对稳态接纳100/s、等0.12s、执行墙钟0.20s分别对应12/20在途；每次0.010CPU秒对应1核当量。成本130/1000=0.130，117/1000=0.117，117/900仍为0.130；所有成本为题设单位。\n\n## 3. 两个 HTTP 服务的 trace 与指标\n\n```sh\npython3 telemetry_lab.py\n```\n\n实际启动API和backend两个本地HTTP服务，发送正常、注入等待与503请求。结果应为3个请求、1个坏请求、2个backend跨度，trace-id贯通、父子span关联正确；非法入站上下文按本例策略新建trace。指标只使用route/outcome标签，trace-id留作单请求关联。\n\n等待180ms和处理60ms使用sleep注入墙钟延迟，不是CPU执行时间；实际API延迟与阶段计时保留在validation.json，包含调度/HTTP开销。正文300ms图是独立的理想时间账，不能直接当作本机测量。这只是最小version-00传播演示，不是完整W3C/OTel兼容、采样和导出实现。\n\n## 4. 真实 Prometheus 规则引擎\n\n自行准备官方promtool，本次验证基线为Prometheus3.5.0。二进制不包含在此包。\n\n```sh\npython3 promtool_lab.py /absolute/path/to/promtool\n# 或直接运行：\npromtool check rules slo.rules.yaml\npromtool test rules slo.test.yaml\n```\n\n7组固定序列覆盖：\n\n1. A/B请求合并成功率0.91，避免实例平均0.95。\n2. 长短窗持续热故障触发快速告警。\n3. 长窗仍热、短窗恢复后该AND组合解除。\n4. 兼容经典桶先rate再合并，p99估计0.99；错误的实例均值0.545。\n5. 有请求但没有错误序列时坏率为0。\n6. 零流量不产生100%成功率（0/0为NaN）。\n7. 无采集序列与已有的零计数器分别判断。\n\n规则明确使用30天、99.9%目标及14.4倍阈值，两窗口为1h/5m，另有1m持续条件。课堂1000请求的99%预算是另一题设，不混用分母。`fuzzy_compare`只容忍最后位浮点差异，不放松标签、分支和数学断言。\n\n这验证真实解析和规则求值；未启动Prometheus抓取服务、Alertmanager通知或真实值班流程。生产还需核对测量完整性、标签、抓取/评估周期、路由与行动。\n\n## 记录\n\n`validation.json` 保存四程序结果、环境、源码SHA256和未覆盖范围。源码与记录一起发布；修改程序/规则后应重跑。官方资料入口：\n\n- https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/\n- https://kubernetes.io/docs/reference/access-authn-authz/rbac/\n- https://www.w3.org/TR/trace-context/\n- https://sre.google/workbook/alerting-on-slos/\n", "authorization_http_lab.py": "\"\"\"Real loopback HTTP/SQLite authorization checks. Local HMAC capability, NOT JWT/OIDC.\"\"\"\nimport base64\nimport hashlib\nimport hmac\nfrom http.server import BaseHTTPRequestHandler, ThreadingHTTPServer\nimport json\nfrom pathlib import Path\nimport secrets\nimport sqlite3\nimport tempfile\nimport threading\nimport time\nimport urllib.error\nimport urllib.request\n\n\ndef b64(value):\n    return base64.urlsafe_b64encode(value).decode().rstrip('=')\n\n\ndef issue(keys, subject='reader-A', tenant='A', scopes=('read',), kid='K1',\n          audience='reports-api', expires=None, epoch=1):\n    payload={'sub':subject,'tenant':tenant,'scopes':list(scopes),'kid':kid,\n             'iss':'infra-lab','aud':audience,'exp':expires if expires is not None else int(time.time())+60,'epoch':epoch}\n    encoded=b64(json.dumps(payload,sort_keys=True,separators=(',',':')).encode())\n    return encoded+'.'+b64(hmac.new(keys[kid],encoded.encode(),hashlib.sha256).digest())\n\n\nclass Handler(BaseHTTPRequestHandler):\n    def log_message(self,*args):\n        pass\n\n    def respond(self,status,reason):\n        body=json.dumps({'reason':reason}).encode()\n        self.send_response(status)\n        self.send_header('Content-Type','application/json')\n        self.send_header('Content-Length',str(len(body)))\n        self.end_headers()\n        self.wfile.write(body)\n\n    def run_request(self):\n        request_id=secrets.token_hex(8)\n        reason='invalid_credential'\n        status=401\n        subject=None\n        try:\n            header=self.headers.get('Authorization','')\n            if not header.startswith('Bearer ') or len(header)>4096:\n                raise ValueError('credential')\n            encoded,signature=header[7:].split('.')\n            payload=json.loads(base64.urlsafe_b64decode(encoded+'='*(-len(encoded)%4)))\n            key=self.server.keys.get(payload['kid'])  # fixed trusted set; never fetch a user URL\n            if key is None:\n                raise ValueError('key')\n            expected=b64(hmac.new(key,encoded.encode(),hashlib.sha256).digest())\n            if not hmac.compare_digest(signature,expected):\n                raise ValueError('signature')\n            if payload['iss']!='infra-lab' or payload['aud']!='reports-api' or payload['exp']<=time.time():\n                raise ValueError('claims')\n            if type(payload['exp']) is not int or not isinstance(payload['scopes'],list):\n                raise ValueError('claim types')\n            subject=payload['sub']\n            policy=self.server.policy.get(subject)\n            parts=self.path.strip('/').split('/')\n            action='read' if self.command=='GET' else 'write'\n            status,reason=403,'scope_or_resource'\n            if policy and len(parts)==4 and parts[0]=='tenants' and parts[2]=='reports':\n                target_tenant=parts[1]\n                allowed=(payload['epoch']==policy['epoch'] and target_tenant==payload['tenant']==policy['tenant']\n                         and action in payload['scopes'] and action in policy['actions'])\n                if allowed:\n                    with sqlite3.connect(self.server.database) as db:\n                        # Actual row ownership is checked independently of the caller's path.\n                        row=db.execute('SELECT tenant FROM reports WHERE id=?',(parts[3],)).fetchone()\n                        if row and row[0]==target_tenant:\n                            if action=='write':\n                                db.execute('INSERT INTO effects(tenant) VALUES(?)',(target_tenant,))\n                            status,reason=200,'allowed'\n        except (ValueError,KeyError,TypeError):\n            status,reason=401,'invalid_credential'\n        self.server.audit.append({'request_id':request_id,'subject':subject,\n                                  'action':self.command,'resource':self.path,'status':status,'reason':reason})\n        self.respond(status,reason)\n\n    do_GET=run_request\n    do_POST=run_request\n\n\ndef run():\n    with tempfile.TemporaryDirectory(prefix='infra-auth-') as tmp:\n        database=str(Path(tmp)/'effects.sqlite')\n        with sqlite3.connect(database) as db:\n            db.executescript(\"CREATE TABLE reports(id TEXT PRIMARY KEY,tenant TEXT);\"\n                             \"INSERT INTO reports VALUES('rA','A'),('rB','B');\"\n                             'CREATE TABLE effects(tenant TEXT);')\n        keys={'K1':secrets.token_bytes(32),'K2':secrets.token_bytes(32)}\n        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)\n        server.keys=dict(keys)\n        server.database=database\n        server.audit=[]\n        server.policy={'reader-A':{'tenant':'A','actions':['read'],'epoch':1},\n                       'writer-A':{'tenant':'A','actions':['write'],'epoch':1}}\n        worker=threading.Thread(target=server.serve_forever,daemon=True)\n        worker.start()\n        cases=[]\n        def call(name,token,path='/tenants/A/reports/rA',method='GET',expected=200):\n            request=urllib.request.Request('http://127.0.0.1:%d%s'%(server.server_port,path),\n                                           headers={'Authorization':'Bearer '+token},method=method)\n            try:\n                with urllib.request.urlopen(request,timeout=5) as response:status=response.status\n            except urllib.error.HTTPError as error:\n                status=error.code\n                error.close()\n            assert status==expected,(name,status,expected)\n            cases.append({'case':name,'http_status':status})\n        try:\n            reader=issue(keys)\n            call('read_own',reader)\n            call('read_other_tenant',reader,'/tenants/B/reports/rB',expected=403)\n            call('path_claim_does_not_change_row_owner',reader,'/tenants/A/reports/rB',expected=403)\n            call('read_scope_cannot_write',reader,method='POST',expected=403)\n            call('signed_scope_cannot_expand_server_policy',issue(keys,scopes=('write',)),method='POST',expected=403)\n            call('expired',issue(keys,expires=int(time.time())-5),expected=401)\n            call('zero_expiry',issue(keys,expires=0),expected=401)\n            call('wrong_audience',issue(keys,audience='another-api'),expected=401)\n            encoded,signature=reader.split('.')\n            forged=encoded+'.'+('A' if signature[0]!='A' else 'B')+signature[1:]\n            call('forged_signature',forged,expected=401)\n            server.policy['reader-A']['epoch']=2\n            call('policy_revoked',reader,expected=403)\n            call('new_policy_epoch',issue(keys,epoch=2))\n            call('new_key_accepted',issue(keys,kid='K2',epoch=2))\n            del server.keys['K1']\n            call('old_verification_key_removed',issue(keys,epoch=2),expected=401)\n            call('authorised_write',issue(keys,subject='writer-A',scopes=('write',),kid='K2'),method='POST')\n            with sqlite3.connect(database) as db:\n                effects=dict(db.execute('SELECT tenant,count(*) FROM effects GROUP BY tenant'))\n            assert effects=={'A':1}\n            assert len(server.audit)==len(cases) and len({x['request_id'] for x in server.audit})==len(cases)\n            return {'status':'passed','cases':cases,'writes_A':1,'writes_B':0,\n                    'audit_events':len(server.audit),'credentials_logged':False,\n                    'scope':'Real loopback HTTP, HMAC and SQLite effects. Fixed local policy and keys; not JWT/OIDC, cloud IAM, Kubernetes RBAC or production key rotation.'}\n        finally:\n            server.shutdown()\n            server.server_close()\n            worker.join(timeout=5)\n\n\nif __name__=='__main__':\n    print(json.dumps(run(),ensure_ascii=False,indent=2))\n", "capacity_lab.py": "\"\"\"Exact, deterministic fluid queue and cost arithmetic; not a load generator.\"\"\"\nfrom fractions import Fraction as F\nimport json\n\n\ndef simulate(limit=None):\n    step=F(1,10)\n    backlog=F(0)\n    arrivals=completed=rejected=area=F(0)\n    snapshots=[]\n    peak=F(0)\n    for tick in range(300):\n        # Over each interval: constant arrival/service rates, no in-service granularity.\n        rate=F(80 if tick<100 else 120)\n        incoming=F(100)*step\n        net=incoming-rate*step\n        before=backlog\n        after=max(F(0),before+net)\n        dropped=F(0)\n        if limit is not None and after>limit:\n            dropped=after-limit\n            after=F(limit)\n        actual_done=before+incoming-after-dropped\n        assert actual_done>=0 and actual_done<=rate*step\n        arrivals+=incoming\n        completed+=actual_done\n        rejected+=dropped\n        backlog=after\n        area+=(before+after)/2*step\n        peak=max(peak,after)\n        assert arrivals==completed+rejected+backlog\n        if tick+1 in (100,200,300):\n            snapshots.append({'seconds':int((tick+1)*step),'backlog':float(backlog),\n                              'arrivals':int(arrivals),'completed':int(completed),'rejected':int(rejected)})\n    return {'snapshots':snapshots,'peak_backlog':float(peak),'backlog_area_request_seconds':float(area)}\n\n\ndef run():\n    unbounded=simulate()\n    assert unbounded['snapshots'][0]['backlog']==200\n    assert unbounded['snapshots'][1]['backlog']==0\n    assert unbounded['snapshots'][2]['completed']==3000\n    assert unbounded['backlog_area_request_seconds']==2000\n    bounded=simulate(F(160))\n    assert bounded['snapshots'][0]['rejected']==40\n    assert bounded['snapshots'][0]['completed']==800\n    assert bounded['snapshots'][0]['backlog']==160\n    assert bounded['snapshots'][2]['completed']==2960\n    # 100 admitted attempts/s; waiting/execution are wall time, CPU use is separate.\n    waiting=F(100)*F(12,100)\n    executing=F(100)*F(20,100)\n    cpu=F(100)*F(10,1000)\n    assert waiting==12 and executing==20 and cpu==1\n    cost_before=F(100+20+10,1000)\n    cost_after=F(117,1000)\n    assert 1-cost_after/cost_before==F(1,10)\n    assert F(117,900)==cost_before\n    return {'status':'passed','unbounded':unbounded,'bounded_160':bounded,\n            'stable_admitted_100_per_second':{'waiting':12,'executing':20,'total_inflight':32,'cpu_core_equivalent':1},\n            'cost':{'before_per_unique_success':float(cost_before),'after_same_1000_successes':float(cost_after),\n                    'reduction_percent':10,'after_only_900_successes':float(F(117,900))},\n            'scope':'Exact Fraction arithmetic in a piecewise fluid model. Not real CPU, HPA, a cloud bill or a benchmark. Finite buffer is work backlog in this model, not an OS connection queue.'}\n\n\nif __name__=='__main__':\n    print(json.dumps(run(),ensure_ascii=False,indent=2))\n", "promtool_lab.py": "\"\"\"Run the real Prometheus parser/rule evaluator against fixed teaching fixtures.\"\"\"\nimport json\nfrom pathlib import Path\nimport subprocess\nimport sys\n\n\ndef run(binary):\n    executable=str(Path(binary).resolve()) if '/' in binary else binary\n    folder=Path(__file__).resolve().parent\n    results=[]\n    for arguments in [('check','rules','slo.rules.yaml'),('test','rules','slo.test.yaml')]:\n        result=subprocess.run([executable,*arguments],cwd=folder,text=True,capture_output=True,timeout=60)\n        if result.returncode!=0:\n            raise RuntimeError(result.stdout+'\\n'+result.stderr)\n        results.append({'command':'promtool '+' '.join(arguments),'exit_code':result.returncode})\n    version=subprocess.run([executable,'--version'],text=True,capture_output=True,check=True)\n    return {'status':'passed','version':(version.stdout+version.stderr).splitlines()[0],\n            'commands':results,'fixture_groups':7,\n            'checks':['weighted request ratio .91','hot 1h/5m alert','short-window recovery',\n                      'merged classic p99 .99 versus wrong mean .545','no error series with positive traffic',\n                      'zero traffic not 100%','absent telemetry separate'],\n            'scope':'Real Prometheus promtool parser and rule engine on synthetic input series. No Prometheus scraping server, Alertmanager delivery, production SLO or oncall response test.'}\n\n\nif __name__=='__main__':\n    print(json.dumps(run(sys.argv[1] if len(sys.argv)>1 else 'promtool'),ensure_ascii=False,indent=2))\n", "rbac-readonly.yaml": "# Reviewed teaching configuration, not a cluster-executed test.\n# Use an isolated test cluster and an identity authorised to create these objects.\napiVersion: v1\nkind: Namespace\nmetadata:\n  name: infra-security-lab\n---\napiVersion: v1\nkind: ServiceAccount\nmetadata:\n  name: report-reader\n  namespace: infra-security-lab\nautomountServiceAccountToken: false\n---\napiVersion: rbac.authorization.k8s.io/v1\nkind: Role\nmetadata:\n  name: read-one-config\n  namespace: infra-security-lab\nrules:\n  - apiGroups: ['']\n    resources: ['configmaps']\n    resourceNames: ['reports-v1']\n    verbs: ['get']\n---\napiVersion: rbac.authorization.k8s.io/v1\nkind: RoleBinding\nmetadata:\n  name: report-reader-config\n  namespace: infra-security-lab\nsubjects:\n  - kind: ServiceAccount\n    name: report-reader\n    namespace: infra-security-lab\nroleRef:\n  apiGroup: rbac.authorization.k8s.io\n  kind: Role\n  name: read-one-config\n", "slo.rules.yaml": "# Teaching rule: request-based 99.9% SLO over 30 days.\n# \"bad\" is already classified by the chosen business result/latency contract.\n# Missing telemetry and no traffic need separate operational interpretation.\ngroups:\n  - name: reports-slo\n    interval: 1m\n    rules:\n      - record: job:slo_bad_ratio5m\n        expr: |\n          (\n            sum by (job) (rate(http_requests_total{outcome=\"bad\"}[5m]))\n            or on (job) (0 * sum by (job) (rate(http_requests_total[5m])))\n          ) / sum by (job) (rate(http_requests_total[5m]))\n      - record: job:slo_bad_ratio1h\n        expr: |\n          (\n            sum by (job) (rate(http_requests_total{outcome=\"bad\"}[1h]))\n            or on (job) (0 * sum by (job) (rate(http_requests_total[1h])))\n          ) / sum by (job) (rate(http_requests_total[1h]))\n      - alert: ReportsFastBurn\n        expr: |\n          (job:slo_bad_ratio1h{job=\"reports\"} > 14.4 * 0.001)\n          and on (job) (job:slo_bad_ratio5m{job=\"reports\"} > 14.4 * 0.001)\n          and on (job) (sum by (job) (rate(http_requests_total{job=\"reports\"}[5m])) > 0)\n        for: 1m\n        labels:\n          severity: page\n        annotations:\n          summary: reports error budget is burning fast\n", "slo.test.yaml": "rule_files:\n  - slo.rules.yaml\nevaluation_interval: 1m\n# Ignore only last-bit float differences; assertions and labels remain strict.\nfuzzy_compare: true\ntests:\n  - name: request_weighted_ratio\n    interval: 1m\n    input_series:\n      - series: 'http_requests_total{job=\"reports\",instance=\"A\",outcome=\"good\"}'\n        values: '0+20x65'\n      - series: 'http_requests_total{job=\"reports\",instance=\"A\",outcome=\"bad\"}'\n        values: '0+0x65'\n      - series: 'http_requests_total{job=\"reports\",instance=\"B\",outcome=\"good\"}'\n        values: '0+162x65'\n      - series: 'http_requests_total{job=\"reports\",instance=\"B\",outcome=\"bad\"}'\n        values: '0+18x65'\n    promql_expr_test:\n      - expr: job:slo_bad_ratio5m\n        eval_time: 5m\n        exp_samples:\n          - labels: 'job:slo_bad_ratio5m{job=\"reports\"}'\n            value: 0.09\n      - expr: sum(increase(http_requests_total[5m]))\n        eval_time: 5m\n        exp_samples:\n          - labels: '{}'\n            value: 1000\n      - expr: 1 - job:slo_bad_ratio5m\n        eval_time: 5m\n        exp_samples:\n          - labels: '{job=\"reports\"}'\n            value: 0.91\n  - name: continuous_hot_window_fires\n    interval: 1m\n    input_series:\n      - series: 'http_requests_total{job=\"reports\",outcome=\"good\"}'\n        values: '0+98x65'\n      - series: 'http_requests_total{job=\"reports\",outcome=\"bad\"}'\n        values: '0+2x65'\n    alert_rule_test:\n      - eval_time: 60m\n        alertname: ReportsFastBurn\n        exp_alerts:\n          - exp_labels:\n              job: reports\n              severity: page\n            exp_annotations:\n              summary: reports error budget is burning fast\n  - name: short_window_recovery_stops_fast_alert\n    interval: 1m\n    input_series:\n      - series: 'http_requests_total{job=\"reports\",outcome=\"good\"}'\n        values: '0+98x60 5980+100x4'\n      - series: 'http_requests_total{job=\"reports\",outcome=\"bad\"}'\n        values: '0+2x60 120+0x4'\n    promql_expr_test:\n      - expr: count(job:slo_bad_ratio1h > 14.4 * 0.001)\n        eval_time: 65m\n        exp_samples:\n          - labels: '{}'\n            value: 1\n      - expr: job:slo_bad_ratio5m\n        eval_time: 65m\n        exp_samples:\n          - labels: 'job:slo_bad_ratio5m{job=\"reports\"}'\n            value: 0\n    alert_rule_test:\n      - eval_time: 65m\n        alertname: ReportsFastBurn\n        exp_alerts: []\n  - name: compatible_classic_buckets_merge_before_quantile\n    interval: 1m\n    input_series:\n      - series: 'http_request_duration_seconds_bucket{job=\"reports\",instance=\"A\",le=\"0.1\"}'\n        values: '0+20x10'\n      - series: 'http_request_duration_seconds_bucket{job=\"reports\",instance=\"A\",le=\"1\"}'\n        values: '0+20x10'\n      - series: 'http_request_duration_seconds_bucket{job=\"reports\",instance=\"A\",le=\"+Inf\"}'\n        values: '0+20x10'\n      - series: 'http_request_duration_seconds_bucket{job=\"reports\",instance=\"B\",le=\"0.1\"}'\n        values: '0+0x10'\n      - series: 'http_request_duration_seconds_bucket{job=\"reports\",instance=\"B\",le=\"1\"}'\n        values: '0+180x10'\n      - series: 'http_request_duration_seconds_bucket{job=\"reports\",instance=\"B\",le=\"+Inf\"}'\n        values: '0+180x10'\n    promql_expr_test:\n      - expr: histogram_quantile(0.99, sum by (job, le) (rate(http_request_duration_seconds_bucket[5m])))\n        eval_time: 5m\n        exp_samples:\n          - labels: '{job=\"reports\"}'\n            value: 0.99\n      - expr: avg(histogram_quantile(0.99, sum by (instance, le) (rate(http_request_duration_seconds_bucket[5m]))))\n        eval_time: 5m\n        exp_samples:\n          - labels: '{}'\n            value: 0.545\n  - name: traffic_without_error_series_is_zero_bad\n    interval: 1m\n    input_series:\n      - series: 'http_requests_total{job=\"reports\",outcome=\"good\"}'\n        values: '0+100x65'\n    promql_expr_test:\n      - expr: job:slo_bad_ratio5m\n        eval_time: 5m\n        exp_samples:\n          - labels: 'job:slo_bad_ratio5m{job=\"reports\"}'\n            value: 0\n  - name: zero_traffic_is_not_a_success_ratio\n    interval: 1m\n    input_series:\n      - series: 'http_requests_total{job=\"reports\",outcome=\"good\"}'\n        values: '0+0x65'\n    promql_expr_test:\n      - expr: sum by (job) (rate(http_requests_total[5m]))\n        eval_time: 5m\n        exp_samples:\n          - labels: '{job=\"reports\"}'\n            value: 0\n      # A NaN ratio does not equal itself; avoid presenting it as 100% success.\n      - expr: job:slo_bad_ratio5m == job:slo_bad_ratio5m\n        eval_time: 5m\n        exp_samples: []\n    alert_rule_test:\n      - eval_time: 65m\n        alertname: ReportsFastBurn\n        exp_alerts: []\n  - name: absent_series_is_separate_from_zero_counter\n    interval: 1m\n    input_series: []\n    promql_expr_test:\n      - expr: job:slo_bad_ratio5m\n        eval_time: 5m\n        exp_samples: []\n      - expr: absent_over_time(http_requests_total{job=\"reports\"}[5m])\n        eval_time: 5m\n        exp_samples:\n          - labels: '{job=\"reports\"}'\n            value: 1\n    alert_rule_test:\n      - eval_time: 65m\n        alertname: ReportsFastBurn\n        exp_alerts: []\n", "telemetry_lab.py": "\"\"\"Two real loopback HTTP services with a small version-00 traceparent example.\"\"\"\nfrom http.server import BaseHTTPRequestHandler,ThreadingHTTPServer\nimport json\nimport re\nimport secrets\nimport threading\nimport time\nimport urllib.error\nimport urllib.request\n\n\ndef context(value):\n    match=re.fullmatch(r'00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})',value or '')\n    if match and int(match[1],16) and int(match[2],16):\n        return match[1],match[2],match[3]\n    return secrets.token_hex(16),None,'01'\n\n\ndef request(url,header):\n    req=urllib.request.Request(url,headers={'traceparent':header})\n    try:\n        with urllib.request.urlopen(req,timeout=5) as result:\n            return result.status,json.load(result)\n    except urllib.error.HTTPError as error:\n        with error:\n            return error.code,json.load(error)\n\n\nclass Base(BaseHTTPRequestHandler):\n    def log_message(self,*args):\n        pass\n\n    def respond(self,status,payload):\n        data=json.dumps(payload).encode()\n        self.send_response(status)\n        self.send_header('Content-Type','application/json')\n        self.send_header('Content-Length',str(len(data)))\n        self.end_headers()\n        self.wfile.write(data)\n\n\nclass Backend(Base):\n    def do_GET(self):\n        trace,parent,flags=context(self.headers.get('traceparent'))\n        span=secrets.token_hex(8)\n        start=time.perf_counter()\n        slow=self.path=='/lookup?slow=1'\n        time.sleep(.180 if slow else .001)  # injected waiting, not CPU work\n        waited=time.perf_counter()\n        time.sleep(.060 if slow else .001)  # injected processing wall time\n        end=time.perf_counter()\n        self.server.spans.append({'service':'backend','trace_id':trace,'span_id':span,'parent_id':parent,\n                                  'waiting_ms':round((waited-start)*1000,3),'processing_ms':round((end-waited)*1000,3)})\n        self.respond(200,{'trace_id':trace,'span_id':span})\n\n\nclass API(Base):\n    def do_GET(self):\n        start=time.perf_counter()\n        trace,parent,flags=context(self.headers.get('traceparent'))\n        span=secrets.token_hex(8)\n        if self.path=='/reports?fail=1':\n            status=503\n        else:\n            slow=self.path=='/reports?slow=1'\n            time.sleep(.020 if slow else .001)\n            child_header='00-%s-%s-%s'%(trace,span,flags)\n            status,_=request(self.server.backend+('/lookup?slow=1' if slow else '/lookup'),child_header)\n            time.sleep(.030 if slow else .001)\n        elapsed=time.perf_counter()-start\n        self.server.rows.append({'route':'/reports','outcome':'bad' if status>=500 else 'good',\n                                 'status':status,'seconds':elapsed,'trace_id':trace,'span_id':span,'parent_id':parent})\n        self.respond(status,{'trace_id':trace,'span_id':span})\n\n\ndef start(handler):\n    server=ThreadingHTTPServer(('127.0.0.1',0),handler)\n    thread=threading.Thread(target=server.serve_forever,daemon=True)\n    thread.start()\n    return server,thread\n\n\ndef run():\n    backend,bthread=start(Backend)\n    backend.spans=[]\n    api,athread=start(API)\n    api.rows=[]\n    api.backend='http://127.0.0.1:%d'%backend.server_port\n    base='http://127.0.0.1:%d'%api.server_port\n    try:\n        parents=[]\n        for path in ['/reports','/reports?slow=1','/reports?fail=1']:\n            trace,parent=secrets.token_hex(16),secrets.token_hex(8)\n            parents.append((trace,parent))\n            if 'slow=1' in path:time.sleep(.010)  # client pre-request delay, outside API span\n            status,body=request(base+path,'00-%s-%s-01'%(trace,parent))\n            assert body['trace_id']==trace\n            assert status==(503 if 'fail=1' in path else 200)\n        assert len(api.rows)==3 and len(backend.spans)==2\n        for row,(trace,parent) in zip(api.rows,parents):\n            assert row['trace_id']==trace and row['parent_id']==parent\n        for child in backend.spans:\n            parent=next(row for row in api.rows if row['trace_id']==child['trace_id'])\n            assert child['parent_id']==parent['span_id']\n        assert len({row['span_id'] for row in api.rows})==3\n        invalid_trace,invalid_parent,_=context('untrusted-invalid-header')\n        assert len(invalid_trace)==32 and invalid_parent is None\n        buckets={str(edge):sum(row['seconds']<=edge for row in api.rows) for edge in (.1,.5,1.)}\n        buckets['+Inf']=len(api.rows)\n        assert list(buckets.values())==sorted(buckets.values())\n        assert sum(row['outcome']=='bad' for row in api.rows)==1\n        return {'status':'passed','requests':3,'bad_requests':1,'backend_spans':2,\n                'parent_child_links_verified':True,'invalid_header_starts_new_trace':True,\n                'metric_labels':['route','outcome'],'classic_bucket_counts':buckets,\n                'measured_api_ms':[round(row['seconds']*1000,3) for row in api.rows],\n                'measured_slow_backend':{key:value for key,value in backend.spans[1].items() if key.endswith('_ms')},\n                'scope':'Actual loopback HTTP and monotonic timing; injected sleeps are wall time, not CPU. Minimal version-00 propagation example, not an OTel SDK/interoperability test. No exported production telemetry or representative load.'}\n    finally:\n        api.shutdown();backend.shutdown()\n        api.server_close();backend.server_close()\n        athread.join(timeout=5);bthread.join(timeout=5)\n\n\nif __name__=='__main__':\n    print(json.dumps(run(),ensure_ascii=False,indent=2))\n"};
const cloudOpsLabValidation={"status": "passed", "verified_at_utc": "2026-11-04T05:25:24.947946+00:00", "python": "3.9.6", "platform": "macOS-26.2-arm64-arm-64bit", "programs": {"authorization_http_lab.py": {"status": "passed", "cases": [{"case": "read_own", "http_status": 200}, {"case": "read_other_tenant", "http_status": 403}, {"case": "path_claim_does_not_change_row_owner", "http_status": 403}, {"case": "read_scope_cannot_write", "http_status": 403}, {"case": "signed_scope_cannot_expand_server_policy", "http_status": 403}, {"case": "expired", "http_status": 401}, {"case": "zero_expiry", "http_status": 401}, {"case": "wrong_audience", "http_status": 401}, {"case": "forged_signature", "http_status": 401}, {"case": "policy_revoked", "http_status": 403}, {"case": "new_policy_epoch", "http_status": 200}, {"case": "new_key_accepted", "http_status": 200}, {"case": "old_verification_key_removed", "http_status": 401}, {"case": "authorised_write", "http_status": 200}], "writes_A": 1, "writes_B": 0, "audit_events": 14, "credentials_logged": false, "scope": "Real loopback HTTP, HMAC and SQLite effects. Fixed local policy and keys; not JWT/OIDC, cloud IAM, Kubernetes RBAC or production key rotation."}, "capacity_lab.py": {"status": "passed", "unbounded": {"snapshots": [{"seconds": 10, "backlog": 200.0, "arrivals": 1000, "completed": 800, "rejected": 0}, {"seconds": 20, "backlog": 0.0, "arrivals": 2000, "completed": 2000, "rejected": 0}, {"seconds": 30, "backlog": 0.0, "arrivals": 3000, "completed": 3000, "rejected": 0}], "peak_backlog": 200.0, "backlog_area_request_seconds": 2000.0}, "bounded_160": {"snapshots": [{"seconds": 10, "backlog": 160.0, "arrivals": 1000, "completed": 800, "rejected": 40}, {"seconds": 20, "backlog": 0.0, "arrivals": 2000, "completed": 1960, "rejected": 40}, {"seconds": 30, "backlog": 0.0, "arrivals": 3000, "completed": 2960, "rejected": 40}], "peak_backlog": 160.0, "backlog_area_request_seconds": 1600.0}, "stable_admitted_100_per_second": {"waiting": 12, "executing": 20, "total_inflight": 32, "cpu_core_equivalent": 1}, "cost": {"before_per_unique_success": 0.13, "after_same_1000_successes": 0.117, "reduction_percent": 10, "after_only_900_successes": 0.13}, "scope": "Exact Fraction arithmetic in a piecewise fluid model. Not real CPU, HPA, a cloud bill or a benchmark. Finite buffer is work backlog in this model, not an OS connection queue."}, "telemetry_lab.py": {"status": "passed", "requests": 3, "bad_requests": 1, "backend_spans": 2, "parent_child_links_verified": true, "invalid_header_starts_new_trace": true, "metric_labels": ["route", "outcome"], "classic_bucket_counts": {"0.1": 2, "0.5": 3, "1.0": 3, "+Inf": 3}, "measured_api_ms": [6.126, 299.793, 0.021], "measured_slow_backend": {"waiting_ms": 180.213, "processing_ms": 65.025}, "scope": "Actual loopback HTTP and monotonic timing; injected sleeps are wall time, not CPU. Minimal version-00 propagation example, not an OTel SDK/interoperability test. No exported production telemetry or representative load."}, "promtool_lab.py": {"status": "passed", "version": "promtool, version 3.5.0 (branch: HEAD, revision: 8be3a9560fbdd18a94dedec4b747c35178177202)", "commands": [{"command": "promtool check rules slo.rules.yaml", "exit_code": 0}, {"command": "promtool test rules slo.test.yaml", "exit_code": 0}], "fixture_groups": 7, "checks": ["weighted request ratio .91", "hot 1h/5m alert", "short-window recovery", "merged classic p99 .99 versus wrong mean .545", "no error series with positive traffic", "zero traffic not 100%", "absent telemetry separate"], "scope": "Real Prometheus promtool parser and rule engine on synthetic input series. No Prometheus scraping server, Alertmanager delivery, production SLO or oncall response test."}}, "source_sha256": {"README.md": "0f70b6bfd5cd474bcd3d9c7f8c3c9828b2f6baf4743c3a82e40662c06d38f7fa", "authorization_http_lab.py": "8bd6b24a5366a3224d954128c4d14131fdb5726789ae8e0d32d666fe43490e2d", "capacity_lab.py": "fb5aef14dcf41dd8526b6e6fc5bab259bafcf07379f77f6fa2954b0ee1ae357f", "promtool_lab.py": "d9dd1a22046e8ef575a85e2621dc7152c93c4939cd099a4b89df814d020416bc", "rbac-readonly.yaml": "8cbfceef557b086c8cd4586a2948a508bc626666af6799d7b9deb68f1caabe2c", "slo.rules.yaml": "3a10455323e375389a05cb6e0046290533794b96cbd0303767302496dbec8269", "slo.test.yaml": "6806854a81fe4dfbbea0ad7efa997d93d6037b27880f86fe36dd1fd501288c42", "telemetry_lab.py": "c955615d2917b3573c13644eaff6bc0107140662a8ffcc0d5f037d911d8f4e1d"}, "not_executed": ["Production OIDC/JWT/cloud IAM", "Kubernetes admission/RBAC/network isolation", "Cloud autoscaling or production load/cost", "Prometheus scraping/Alertmanager notification", "Real cross-region recovery or oncall response"], "configuration_review_only": ["rbac-readonly.yaml"]};


;
// cloud-security-mechanics.js
Object.assign(sources,{
 v15Rbac:['Kubernetes · RBAC、作用域与权限累加','https://kubernetes.io/docs/reference/access-authn-authz/rbac/'],
 v15Authz:['Kubernetes · 请求授权与 authorizer 组合','https://kubernetes.io/docs/reference/access-authn-authz/authorization/'],
 v15SA:['Kubernetes · ServiceAccount 与受众','https://kubernetes.io/docs/concepts/security/service-accounts/'],
 v15SAAdmin:['Kubernetes · 绑定 token 与对象状态','https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/'],
 v15SAToken:['Kubernetes · token 投射、刷新与挂载','https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/'],
 v15Multi:['Kubernetes · 多租户威胁与隔离','https://kubernetes.io/docs/concepts/security/multi-tenancy/'],
 v15PSS:['Kubernetes · Pod Security Standards','https://kubernetes.io/docs/concepts/security/pod-security-standards/'],
 v15PSA:['Kubernetes · Admission 的 enforce/audit/warn','https://kubernetes.io/docs/concepts/security/pod-security-admission/'],
 v15Audit:['Kubernetes · API 审计策略','https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/'],
 v15AwsEval:['AWS IAM · 策略求值的实际规则','https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html'],
 v15Deputy:['AWS IAM · Confused deputy 与委托边界','https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html']
});
Object.assign(cloudKnowledgeExplanations,{
 'authentication-authorization':knowledgeSubhead('把主体、委托和目标资源写成一次判定')+para(
 '认证将请求绑定到可被系统信任的主体；授权判断该主体能否在当前条件下对某个资源做某个动作。服务可以通过会话、证书或签名凭证建立身份，但判定最终仍要落到具体的 subject、action、resource 和 context。JSON 合法只说明参数形状正确；带了合法凭证也只完成身份链上的一部分。',
 '一个用户让平台导出租户 A 的报表，平台可能派工作者访问数据服务。数据服务看到的是工作者身份，并不会自动知道用户的原始委托。任务记录应固定获准的租户、动作、资源与预算，下游再核对实际资源归属。如果只凭工作者的大权限和请求里的 tenant 字段执行，攻击者可以把受托服务变成跨租户代理。')+
 figure('v15-identity-chain','身份链把“是谁”“谁委托了哪次任务”和“下游允许访问什么”分开。最后产生数据效果的服务仍要执行资源级授权。')+
 table(['决策层','必须确定的事实','典型核对'],[['认证','可信主体与凭证适用范围','签发者、签名/会话、受众、时效'],['任务委托','这次任务被允许做什么','稳定任务身份、租户、动作和目标集合'],['资源授权','实际对象是否落在允许范围','服务端对象归属、动作和当前策略'],['结果','允许或拒绝后发生了什么','业务回执、无额外写入与审计']])+
 para('不同策略系统的组合方式要分别学习。Kubernetes RBAC 的权限累加，没有通用 deny 规则；RoleBinding 的授权落在其 namespace，引用 ClusterRole 也不等于自动跨域授权。AWS IAM 则要按身份/资源策略、边界、组织策略和主体类型求值；适用的显式 Deny 可以覆盖 Allow。不能把 AWS 的优先级抄成 RBAC 规则，也不能把所有 AWS 策略简单画成同一种交集。',
 '最小权限需要正反两种结果：A 能读必要的 A 对象，也不能用同一接口读 B；只让所有请求都失败没有证明可用性。实际执行点还应读取权威资源归属，而不是接受调用方对对象归属的自报。配套实验同时检查 HTTP 决定和数据库效果，避免只测返回了 403 却漏掉提前发生的写入。'),
 'workload-identity':knowledgeSubhead('运行实例取得身份，数据权限仍由目标服务判断')+para(
 '工作负载身份让运行中的服务或任务以可审计主体访问依赖，避免把一个长期管理员密钥复制到所有实例。身份链通常包含运行平台、签发服务、凭证分发和资源服务验证。每次交接都要明确允许的主体、用途、受众与期限；“运行在可信集群里”本身不是任意数据请求的授权依据。',
 'Kubernetes ServiceAccount 是 namespace 内的工作负载主体。常见的绑定投射 token 由 kubelet 通过 TokenRequest 获取，并投射到 Pod，之后在到期前刷新。应用若把 token 永久缓存在内存里，就可能忽略文件的新版本；不需要调用 API 的工作负载可以关闭相应自动挂载。外部业务服务应使用匹配的 audience，而不是因为一枚给 kube-apiserver 的 token 能验签就接受它。')+
 table(['信息','验证目的','容易混淆之处'],[['issuer / 可信密钥','凭证由谁签发、用哪套信任验证','kid 只是候选选择，不是信任来源'],['audience','凭证签给哪个接收方','能验证签名不等于适用于本服务'],['exp 与有效期','当前是否仍在协议有效窗口','刷新文件不保证应用已经重读'],['业务策略/任务绑定','现在允许哪些动作和资源','短期凭证也可能有过大的权限']])+
 para('在线 TokenReview 和离线 JWT/JWKS 验证的失效行为不同。离线验证可以核对签名、issuer、audience 和时间，却不会自动获知 Pod 或 ServiceAccount 已删除；在线验证还会按集群规则检查绑定对象与 UID 等状态，删除期间也存在规定的时间边界。应按实际接收方测试失效，而不把 delete 请求发出的一刻当成所有会话立即撤销。',
 '部署者能创建什么工作负载也属于身份链。允许创建 Pod 或 Deployment，可能间接获得同域 Secret 或使用更强的 ServiceAccount；只检查没有 get secrets 不足以证明秘密无法取得。授权管理、绑定、提权和 impersonate 等能力需要按平台职责限制，目标服务仍要核对任务与租户。'),
 'secret-lifecycle':knowledgeSubhead('轮换签发材料、更新消费者和撤销旧能力是三件事')+para(
 'Secret 保存敏感配置，base64 是编码；在未配置静态加密的 Kubernetes 中，不能由 Secret 类型推出 etcd 中已有密文保护。传输加密保护链路，静态加密保护存储介质，业务授权限制实际使用者，三者作用不同。信封加密还会区分数据密钥与保护该密钥的上层密钥，解密权和数据访问权需要共同评估。',
 '轮换要跟踪源版本、分发版本与进程实际使用版本。普通卷投射按规则传播更新，subPath 与环境变量有不同刷新行为；修改 API 对象不等于既有进程已经采用新凭据。应让新旧版本在受控窗口兼容，核对签发、验证与消费者记录，再撤下旧能力。')+
 figure('v15-key-rotation','有条件的轮换算例：10:10 停止 K1 签发，最长旧 token 为 60 分钟，验证容差最多 5 分钟，因此兼容窗口按最迟 11:15 推导。它不是 Kubernetes 默认期限。')+
 knowledgeFormula('计划轮换的一项时间预算','旧验证材料保留上界 ≥ 最后一次旧签发 + 最长有效期 + 约定验证容差','成立还依赖所有签发端已切换、时钟/缓存受控、没有更长会话或其他认证路径。')+
 para('签名私钥用于签发，公钥用于验证。先让目标验证者具备 K2 的验证能力，再切换签发，才能让新凭证正常工作。停止 K1 签发不会让已有 K1 token 自行消失，移除一个普通 Secret 也不会收回已读数据或已完成的动作。长期 legacy token、明确绑定的 Secret 与普通密钥载体又有不同语义，需要分别核对。',
 '私钥泄露时的目标是阻断伪造，不能机械等待正常轮换窗口。可选择紧急撤信、在线策略检查或清理会话，并验证实际拒绝与可用性影响。课程只解释协议和验收条件；本地实验验证固定信任集合的切换，不把它当作托管控制面密钥轮换已经完成的证据。'),
 'tenant-isolation':knowledgeSubhead('先定义互信程度，再逐层安排隔离')+para(
 '同公司协作团队、SaaS 客户和可以提交任意镜像的外部用户，威胁模型不同。namespace 提供命名和部分 API 资源作用域，不能自动隔离共享内核、集群级对象、网络、外部数据库或控制面。为强对抗租户选择独立集群、虚拟控制面、专用资源或更强运行沙箱时，也应继续检查共享身份和数据服务。')+
 figure('v15-tenant-boundaries','隔离按身份、数据、网络、资源、执行与审计逐层落实。每层需要自己的允许路径和拒绝证据，单一 namespace 不包办这些约束。')+
 table(['层','边界与控制','最小对照'],[['数据','服务端租户/行/对象键/卷授权','A 自有对象成功，A 访问 B 失败'],['网络','实际插件实施 ingress/egress 策略','必要依赖可达，禁止路径不可达'],['资源','quota、requests/limits 与调度/运行约束','租户额度与共享资源干扰分别测量'],['执行','宿主接口、权限、沙箱/独立内核','按允许系统调用、设备与挂载检查'],['管理与审计','API 权限、配置变更与访问记录','租户不能修改另一域的身份/策略']])+
 para('网络策略需要兼容实现真正执行，源端出站与目标端入站在相应方向被隔离时都要满足允许规则。只看到 YAML 已接受，或只有一次 ping 失败，不能代替目标协议和业务请求测试。配额约束 namespace 中的消费总量，也不等于已经为它预留了独占硬件或保证数据保密。',
 'noisy neighbor 还会通过共享缓存、磁盘、连接池和控制面放大干扰。测试应同时观察租户的用户结果、资源限额和共享依赖；分开判断越权、容量争用与故障传播，才能为不同信任等级选到合适的边界。'),
 'execution-security':knowledgeSubhead('运行权限在准入、进程与宿主三处收敛')+para(
 '准入检查控制允许创建什么对象，运行时配置约束进程能做什么，宿主和沙箱架构再决定隔离强度。非 root、能力集裁剪、只读根文件系统、seccomp、挂载限制与网络出口分别减少不同攻击面；它们是可组合控制，不是一个“安全容器”开关。保留哪些系统调用、设备和写目录，应由实际业务最小需求决定。',
 'Pod Security Standards 的 Privileged、Baseline、Restricted 描述不同约束档位，执行需要 Admission 或等效机制。Pod Security Admission 的 enforce 才会在适用边界拒绝不合规 Pod，audit/warn 主要留下记录或警告。上层 Deployment 对象已被接受，也不证明后续 Pod 可以创建并运行。')+
 table(['控制点','解释什么','继续核对'],[['准入策略','字段/来源/权限是否符合部署要求','模式、版本、适用对象与绕过路径'],['进程配置','UID、capabilities、系统调用与可写路径','所需功能是否仍成功，禁止动作是否失败'],['宿主/沙箱','内核、设备、文件与网络接口的隔离','兼容性、逃逸面、凭证与数据端授权']])+
 para('普通容器通常共享宿主内核；用户态内核、轻量 VM 和专用节点有不同边界与代价。Restricted 档位不会凭空创建独立内核。评估不可信代码时，应把接口暴露、可用凭证和外部数据写权一起列出，再以目标环境证据检验，而不是仅按产品名或某个标签判断隔离完成。'),
 'audit-accountability':knowledgeSubhead('记录决定与实际效果，才能解释允许和拒绝')+para(
 '一次可追查事件至少关联主体、任务/请求 ID、动作、资源、策略版本、判定原因、结果与时间。API 审计说明控制面接受了什么，业务审计说明数据服务怎样处理资源；两者需要关联，而不是互相替代。匿名或认证失败事件也应保留适当线索，避免只有成功日志时无法解释攻击与误拒绝。',
 '日志本身也是受保护数据。不要把 bearer token、Secret 值、密码或完整敏感业务正文写进审计；路径和查询参数也要按敏感性裁剪。对审计读取、保留、完整性和时间源建立管理边界，并记录丢失与导出失败，避免把“没有看到记录”直接当作“请求没有发生”。')+
 knowledgeFormula('最小权限的正反验收','必要操作成功 ∧ 禁止操作被拒绝 ∧ 拒绝路径无未授权效果','返回码、策略决定和资源事实分别核查；已发生的效果不因后续撤权自动撤回。')+
 para('配套本地服务处理真实 HTTP 请求，用 HMAC（共享密钥消息认证码）保护一个明确受限的教学 capability，再按服务端策略与数据库行归属检查。实验包含正常读取、跨租户、同路径伪装归属、只读写入、错误受众、到期、伪造签名与策略撤销；最后检查 A 只有获准的一次写入、B 为零。它提供可重现的执行边界，不宣称实现了 JWT/OIDC 或真实集群 RBAC。')+
 knowledgeCheck('一个 RoleBinding 引用 ClusterRole，会让主体自动跨 namespace 读 Secret 吗？','该绑定的授权作用域仍是它所在的 namespace。还需检查其他绑定、authorizer 和间接权限，例如创建能挂载 Secret 的工作负载；“没有 get”也不能排除 list/watch 等路径。')
});
cloudKnowledgeDomain('cloud-security').refs.push('v15Rbac','v15Authz','v15SA','v15SAAdmin','v15SAToken','v15Multi','v15PSS','v15PSA','v15Audit','v15AwsEval','v15Deputy');


;
// cloud-capacity-mechanics.js
Object.assign(sources,{
 v15Little:['Little · 排队平均量关系原论文（1961）','https://pubsonline.informs.org/doi/abs/10.1287/opre.9.3.383'],
 v15Overload:['Google SRE · Handling Overload','https://sre.google/sre-book/handling-overload/'],
 v15Cascade:['Google SRE · Addressing Cascading Failures','https://sre.google/sre-book/addressing-cascading-failures/'],
 v15LoadModel:['Grafana k6 · 开放与闭合负载模型','https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/'],
 v15Dropped:['Grafana k6 · dropped iterations 的含义','https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/dropped-iterations/'],
 v15Wrk2:['wrk2 · 计划到达与 coordinated omission','https://github.com/giltene/wrk2/blob/master/README.md'],
 v15UnitCost:['FinOps Foundation · Unit Economics','https://www.finops.org/framework/capabilities/unit-economics/'],
 v15Allocation:['FinOps Foundation · 成本归属与分摊','https://www.finops.org/framework/capabilities/allocation/']
});
Object.assign(cloudKnowledgeExplanations,{
 'capacity-units':knowledgeSubhead('先确定计数边界，再把平均值放进公式')+para(
 '业务意图、网络尝试和唯一成功是不同计数。一次超时后的重试增加了尝试量，未必增加成功业务量；准入拒绝没有进入执行，执行完成又可能是业务失败。容量报告至少应连接首次请求、重试、接纳、拒绝、在途、完成和唯一合格产出，说明每一项在哪里计数。')+
 figure('v15-capacity-units','同一稳态题设：首次100/s、重试10/s，共110次尝试；拒绝10/s后接纳100/s。0.12秒等待、0.20秒执行墙钟和0.010 CPU秒分别记账。')+
 knowledgeFormula('同类工作、同一系统边界的长期平均关系','L = λ × W','L 是平均在途数，λ 是通过该边界的同类工作率，W 是对应平均停留墙钟时间；本课采用均值有限且没有持续积压增长的稳定观察。')+
 para('按图中接纳100次/秒、平均等0.12秒、执行0.20秒，等待中平均12个、执行中平均20个，从准入到完成约32个。若每次实际消费0.010 CPU秒，平均计算需求为1 CPU秒/秒，即一核当量。执行中的20个调用可能主要在等网络、锁或下游；把20个调用直接写成20核，会把墙钟和CPU时间混成一笔账。',
 '公式不要求本课额外假设泊松到达或指数服务，但必须保持统计单位、范围和窗口一致。p99不是平均W，当前一秒的到达率也不能随手乘另一个窗口的延迟去预测瞬时队列。若在途持续增长，应先做流量守恒和容量分段，而不是把发来的量当成已成功处理的量。',
 '有限窗口内的平均占用来自占用曲线面积除以窗口时长。窗口开始前已在途、窗口结束时仍未完成的工作，也贡献窗口内的占用时间。只收集完成日志会漏掉长期卡住的请求，既可能低估等待，也可能让成功率和延迟看起来一起变好。'),
 'queue-backpressure':knowledgeSubhead('积压守恒负责解释过载，排队模型解释等待如何变化')+
 knowledgeFormula('给定分段容量的流体模型','积压变化 = 接纳工作 − 实际处理工作 − 约定的丢弃/取消','处理能力是上限，空队列时不能把能力全记为实际完成。若精确区分等待与在服，等待数还需按开始执行计数。')+
 para('当输入长期超过可交付能力，积压持续增加；扩大缓冲只推迟溢出的时刻。有限队列给出资源上限，准入决定哪些工作进入，背压把消费条件向上游传播，降级则改变交付内容。它们解决不同问题，应把拒绝、取消和降级结果纳入用户口径，而不是从延迟统计中删除。',
 '每个等待任务还占内存、句柄或连接，并可能在执行前已经过期。检查deadline并取消不再有价值的工作，可以减少恢复后的无效消耗。重试应有总预算、退避和随机化；多层各自重试会把一次失败变成更多尝试，加重原本的瓶颈。为不同优先级保留有界容量，还要防止低优先级工作长期饥饿。')+
 figure('v12-queue-curve','M/M/1 是帮助理解非线性的独立解析模型：均值逗留时间随负载逼近能力而陡增。它不是生产p99、CPU阈值或本次压测结果。')+
 knowledgeFormula('M/M/1 的明确假设与均值','ρ = λ/μ < 1；E[T] = 1/(μ−λ)','泊松到达、指数服务时间、单服务台、无限缓冲；T含服务与排队，ρ=0.8时均值为平均服务时间的5倍。')+
 para('实际系统可能多副本、批处理、长尾、相关到达和共享下游。先用简单模型暴露容量接近上限时的风险，再用匹配业务的压测检验分布和拒绝行为。不要从一条理论曲线推出“CPU到80%一定失控”，也不要靠降低接纳量制造更漂亮的已完成请求p99。'),
 'scaling-delay':knowledgeSubhead('新副本建议与有效处理能力之间有一条关键路径')+para(
 '扩容经过指标观察、控制决策、资源供应、放置、镜像/初始化、Ready、端点传播和实际接流量。阶段可能并行，应该沿同一次变更的依赖找关键路径；把每个阶段各自最慢的一次相加，会制造一条实际并不存在的时间线。HPA同步周期是控制参数，不是从过载到获得有效容量的完成时限。',
 'CPU utilization 目标依赖request分母。基础建议可以按当前副本数×当前/目标利用率取整，随后还受缺数、未就绪、容差、上下界、速率和稳定窗口影响。若主要瓶颈是数据库等待，CPU可能并未上升；增加Pod又可能放大连接与下游尝试量。需要同时看有效工作量、积压年龄、可用槽和下游完成能力。')+
 figure('v15-scaling-backlog','给定容量阶跃的合成账：输入100/s，前10秒能力80/s，积压到200；之后能力120/s，净排出20/s，再用10秒清空。第10秒只是题设，不是真实HPA时限。')+
 knowledgeFormula('有积压时才按净能力排空','排空时长 = 已有积压 / (有效能力 − 到达率)','本式要求区间内各量固定、净能力为正且无额外丢弃/重试；变动能力按时间逐段积分。')+
 para('图中第20秒清空后，到达只有100/s，实际完成也回到100/s；120/s是能力而非额外产生的完成量。能力恰好等于到达只能停止继续增长，无法清理旧工作。预留应同时考虑扩容空窗、突发和故障域丢失后的承载，缩容还需确认积压、在途任务、长连接和检查点，而不只等CPU均值下降。'),
 'performance-budget':knowledgeSubhead('先让压测产生目标负载，再用分布判断瓶颈')+para(
 '端到端等待可以来自计算、排队、连接池、锁、网络和数据依赖。剖析显示CPU热点，只说明采样到的计算花在哪里；trace里的长跨度也可能包含等待。先用资源、等待与有效完成量定位限制，再做受控对照。优化一个已非瓶颈的阶段，往往只改变局部数字。',
 '闭合负载固定用户数，用户通常等上次结束再发下一次；开放负载按外部到达计划发起新工作。服务暂停时，闭合生成器也会减少新请求，若本想模拟恒定到达，就可能漏掉本该到达的等待样本，这类协调遗漏会低估尾部。闭合模型可以符合真实业务，但要明确所模拟的用户行为。开放模型也需检查生成器是否因自身能力不足而错过迭代。')+
 table(['压测环节','必须报告','才能解释什么'],[['生成','计划到达、实际发起、客户端错过','是否真正施加了目标需求'],['服务','接纳、拒绝、超时、完成、唯一成功','延迟改善是否来自少接工作'],['计时','起止点、重试、连接复用、热身与样本数','不同报告是否可比较'],['资源','输入/版本/质量固定，CPU、I/O、锁与下游','局部改动是否改善端到端结果']])+
 para('分位数也不是可相加的预算。若A有100个10ms请求、B有900个1000ms请求，按最近秩定义，总体第ceil(0.99×1000)=990个样本属于B，因此p99为1000ms；两实例p99平均505ms、按请求数加权901ms，都不等于总体p99。应合并同窗原始样本或可合并分布，再重新求分位。',
 'Prometheus经典直方图先对每条原始bucket counter取rate以识别独立reset，再按le及需要保留的服务标签合并，最后求histogram_quantile；Summary里已经算出的实例quantile不能这样聚合。桶的边界与插值影响估计精度。若目标就是“300ms内完成”，已有0.3秒边界的累计桶可以直接计数，比把估计p99再转成达标率更清楚。'),
 'cost-efficiency':knowledgeSubhead('资源效率与成功交付成本，分别回答两类问题')+para(
 '每算力小时费用描述购买资源的效率，每份合格报表或每次成功业务动作的费用描述业务效率。比较前先固定期间、产品/租户、质量门槛、成功身份和成本范围。计算、存储、传输与已分摊共享费用应去重；跨期任务还需说明按会计期还是按完成批次归属。')+
 figure('v15-unit-cost','题设成本100+20+10=130，交付1000个唯一成功，单位0.130；同产出下总117，单位0.117，改善10%。优化后只给合计，不推断各项都下降10%。')+
 knowledgeFormula('同口径的业务单位成本','单位成功成本 = 归属总成本 / 满足相同质量门槛的唯一成功量','重试尝试不能重复计为新成功；没有成功时另行报告支出和失败，不能用零作分母。')+
 para('总成本130降为117，若仍有1000个合格唯一成功，单位成本下降10%；若只交付900个，117/900仍为0.130，单位成本没有改善。压低内存、并发或副本可能同时增加超时、重试与失败，必须把质量和用户目标一起比较。',
 '资源计量也要保留单位：CPU/实例时间、存储容量×时长、请求、传输、执行GB·s和预置容量各有计费范围。按量、承诺和可中断资源还涉及利用率、供给、期限及恢复重做。先用可核对的用量与业务分母建账，再代入实际区域、架构和模式的价格；本课的成本单位不是云报价。')+
 knowledgeCheck('总成本从130降到117，就能说单位成本优化10%吗？','只有同范围、同质量、同样1000个唯一成功时成立。若成功量只有900，单位仍是0.130。还应核对共享费用分摊和重试是否被重复计数。')
});
cloudKnowledgeDomain('cloud-capacity').refs.push('v15Little','v15Overload','v15Cascade','v15LoadModel','v15Dropped','v15Wrk2','v15UnitCost','v15Allocation','histogram');


;
// cloud-sre-mechanics.js
Object.assign(sources,{
 v15Slo:['Google SRE Workbook · 定义与实施 SLO','https://sre.google/workbook/implementing-slos/'],
 v15Burn:['Google SRE Workbook · 多窗口燃烧率告警','https://sre.google/workbook/alerting-on-slos/'],
 v15Hist:['Prometheus · 直方图、Summary 与聚合','https://prometheus.io/docs/practices/histograms/'],
 v15Quantile:['Prometheus · histogram_quantile 与 rate','https://prometheus.io/docs/prometheus/latest/querying/functions/#histogram_quantile'],
 v15RuleTests:['Prometheus · promtool 规则单元测试','https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/'],
 v15OtelContext:['OpenTelemetry · Context propagation','https://opentelemetry.io/docs/concepts/context-propagation/'],
 v15W3C:['W3C · Trace Context','https://www.w3.org/TR/trace-context/'],
 v15Sampling:['OpenTelemetry · 采样与观察偏差','https://opentelemetry.io/docs/concepts/sampling/'],
 v15Incident:['Google SRE · Managing Incidents','https://sre.google/sre-book/managing-incidents/'],
 v15Postmortem:['Google SRE · Postmortem Culture','https://sre.google/sre-book/postmortem-culture/']
});
Object.assign(cloudKnowledgeExplanations,{
 'sli-slo':knowledgeSubhead('把用户结果定义成可计数事件，再谈可靠性目标')+para(
 'SLI是测量口径，SLO是在指定窗口内对该口径的目标，SLA还涉及对外承诺及相应后果。先确定工作单位：用户操作、API尝试、一次流式生成还是时间片。然后定义合格事件和好事件，例如正确身份取得正确版本且在截止时间内完成。分子必须是同口径分母的子集，不能把探针成功混入用户分子却不计相应分母。',
 '重试可能把一次用户操作变成多次API尝试；流式回应可能首字节很快却最终失败。接纳、超时、取消、尚未终结和没有完成日志的请求如何计入，需要在测量前约定。只统计成功到达终点的记录，会让最严重的卡死从图表中消失。入口计数、截止规则和权威业务回执共同校核完整性。')+
 figure('v15-slo-denominator','同窗合格请求：A为100次且全好，B为900次、90次坏；总体910/1000=91%，不能平均两实例的100%和90%。图的99%目标对应10次允许坏事件。')+
 knowledgeFormula('请求型 SLI 与同窗预算','好事件比例 = G/N；允许坏事件 = N×(1−SLO)；预算余额 = 允许坏事件 − 实际坏事件','N、G、窗口及完成条件先固定。零请求是没有样本；分母缺失则是测量完整性问题。')+
 para('图中坏事件90次，预算余额10−90=−80。若指标确实承诺等权租户体验，可以另外定义租户均值或逐租户门槛，但不要把它称为总体请求成功率。可靠性评估应同时保留大流量总体与关键小群体，避免一个平均值隐藏某个租户持续失败。',
 '窗口决定判断发生在何时。固定日历月、滚动30天和最近5分钟解决不同问题；不能把一个5分钟错误比例直接当成整月预算已使用的比例。对低流量业务，另看失败绝对数与独立探测，并说明它们与用户SLI各自负责的判断。'),
 'observability-signals':knowledgeSubhead('指标界定范围，轨迹解释样本，日志核对具体状态')+para(
 '指标把事件聚合成趋势和分布，适合回答某路由、版本、区域在一个窗口内受到多大影响。trace将被记录的一次请求连接成跨组件路径，日志保存某个状态变化或回执，剖析则定位运行成本。信号通过受控的请求/trace ID及版本连接，仍各有采集、采样、时间和保留限制。')+
 figure('v15-observation-evidence','独立合成慢请求：10+20+180等待+60执行+30响应=300ms，等待占60%。串行片段可相加，重叠子跨度则需按关键路径解释。配套HTTP程序另记录实际墙钟。')+
 para('W3C traceparent包含版本、trace-id、parent-id和标志。接收方从上游上下文建立当前跨度；向下游传递时延续trace-id，但parent-id应换成当前发送跨度的span ID。把整个头原样沿链转发可能丢失正确父子层级。追踪ID不是已认证主体，不应据此授予业务权限；不可信入站上下文需要按边界验证、限制或重建。',
 '标签决定能否聚合，也决定开销。路由模板、状态类、服务和有限版本集合通常适合指标；每请求ID、用户ID和任意URL会制造高基数组合，应放在受控日志或trace中。监测导出失败、丢样和时间源，否则图表变化可能来自观察系统而非业务。',
 '经典直方图先对原始bucket counter取rate，再保留le及服务标签聚合，最后估计分位；这样才能识别实例分别发生的counter reset。原生直方图有不同表达式。采样trace也不能替代全量合格事件计数：尾采样富集慢请求和错误后，样本错误占比不再代表整体错误率；没有错误trace也不能证明没有故障。'),
 'alert-burn':knowledgeSubhead('预算消耗量与消耗速率，使用两个不同分母')+
 knowledgeFormula('观察窗中的燃烧率','burn = 观察坏事件比例 / (1−SLO)','图中99%目标、9%坏率对应9×。若观察窗只是长周期的一小段，不能据此断言整周期已经消耗900%预算。')+
 para('累计预算用于解释已经花掉多少，燃烧率用于判断按当前速度继续会怎样。请求型预算还取决于事件量；只有流量近似均匀时，才方便用时间比例近似推算预算份额。告警阈值要连到损失规模、发现速度和团队来得及采取的动作，而不是把某个CPU值机械映射成紧急程度。',
 '多窗口组合用长窗口确认损耗规模，用短窗口确认故障仍在持续。一组内部用AND，不同快慢组合可以用OR。Google Workbook的30天、99.9%示例，一小时与五分钟均超过14.4×作为快速候选；近似均匀流量下14.4×1/720约对应2%的周期预算。两个窗口重叠，不能把其事件量再相加。')+
 table(['条件','需要的判定','避免的误报/漏报'],[['长窗高、短窗已恢复','该快速组合不再满足','故障结束后仍持续紧急呼叫'],['短窗尖峰、长窗尚低','看其他规则及业务影响','把偶发样本直接视作持续大损失'],['没有流量/指标缺失','单独判断无样本与采集故障','把缺数填为100%成功'],['低流量关键路径','失败绝对数、实际业务与独立探测','大量正常流量稀释关键失败']])+
 para('配套PromQL以99.9%为明确测试目标，错误率阈值因此是14.4×0.001=1.44%。规则和输入序列一起提供：持续热故障触发，短窗口恢复后该组合解除，无流量与无序列不被伪造为用户成功。代码测试校验表达式与规则结果；真实采集完整性、告警路由和响应流程还需目标环境核对。'),
 'diagnosis-method':knowledgeSubhead('用一次能区分解释的探测缩小范围')+para(
 '先把“系统慢了”变成对象、时间窗、用户范围和目标：哪些操作、哪些租户、从何时、错误还是延迟、最后正常版本是什么。然后按请求路径找到最后一个可证实成功的边界。将指标、日志、trace和变更关联到同一个时间与版本，避免把不同实例、不同窗口的读数拼成一个并不存在的现场。')+
 table(['共同现象','竞争解释','有区分力的下一步'],[['CPU低、延迟高','连接池等待 / 数据库执行慢','对齐取得连接前后时间、池占用和DB执行证据'],['外部失败、Pod直连成功','入口选择/端口/策略差异','从同一源、同一协议核对入口与端点路径'],['新版本后失败增多','代码回归 / 流量或共享依赖改变','按版本与同类输入分组，并做受控回退或对照'],['日志少、指标也低','业务少 / 采集丢失 / 请求未到达','入口计数、采集健康、独立探测与权威结果']])+
 para('一次探测应说明它支持什么、排除了什么、下一步还缺什么。图中的180ms等待连接，首先指向池等待；它没有自动证明应增加连接上限，因为下游可能已经饱和。需要查看连接持有时长、队列和下游有效完成量，再用改变一个条件的对照检验。',
 '止损与归因可以分开推进。限流或回退让用户恢复之后，还要保留版本、输入、时间线和关键回执，继续确认原因；反过来，发现一个相关变更也不等于已经得到因果证明。用可反驳假设和最少必要探测组织排障，比无目标地重复命令更容易产生可审查结论。'),
 'incident-change':knowledgeSubhead('事故流程把影响、行动和恢复条件保持在同一张账上')+para(
 '事故开始时确定影响与严重程度，明确协调、技术处置与信息记录职责。所有行动关联对象、时间、理由、预期改善和观察结果。并行调查需共享当前事实与正在执行的变更，减少相互覆盖。课程中的响应步骤是工程组织方法，不代表已经在真实生产值班中执行。',
 '止损优先考虑可解释、可验证的动作：限制超额工作，暂停危险发布，回到兼容版本或隔离故障依赖。每步都需要停止条件和副作用范围；回退镜像不会撤销数据迁移，切新主也不能代替旧主写权隔离。确认恢复时应重做原来失败的业务条件，并覆盖不同身份、代表性输入与必要观察窗。')+
 table(['记录','要回答的问题','后续价值'],[['影响与SLI','用户什么时候受损、范围多大','与恢复时间、告警效果对照'],['决策和变更','为什么此刻做这一步、改变了谁','重建关键路径与排除并发干扰'],['恢复验收','哪些业务条件重新成立','避免只以进程/图表变绿结束'],['改进项','机制怎样改变、由什么结果验收','可执行的修复、演练或监测提升']])+
 para('复盘应解释触发、放大、检测与恢复为何如此，形成可以验证的改进：例如“补一个含超时的恢复用例”“让已过期任务在入队前被拒绝”“对某版本保留可查询配置摘要”。只写加强意识无法检验。改进应有负责对象、可追踪状态和完成证据，后续通过实验或演练检验是否减少相同风险。'),
 'resilience-patterns':knowledgeSubhead('冗余、超时、重试和熔断各自控制不同失败')+para(
 '副本分散故障影响，超时限制等待预算，重试尝试恢复暂时失败，熔断限制继续冲击已知异常依赖，限流和降级则控制系统过载时的工作。组合前先给出触发条件、作用范围、恢复条件和业务语义。特别是写入超时，只能说明调用方没有取得结果，不能证明对端没有提交；重试需要稳定操作身份与可查询回执。')+
 knowledgeFormula('极端失败路径中的尝试放大','三层各最多3次尝试 → 最下游最多3×3×3 = 27次','这里每层的3次包含首次，不是“另重试3次”；只算题设完整失败路径，不当作正常平均值。')+
 para('退避、随机化、总deadline和重试预算共同限制放大；熔断器半开时也要限制试探并发，避免恢复瞬间的流量重新击穿依赖。限流后产生的拒绝仍是用户结果，应明确如何重试、降级或查询已有回执。边界不清时，多叠几个保护组件可能创造新的恢复循环。',
 '故障域应画到共享数据库、身份、入口、制品、网络出口与控制面。三个应用副本若共享单一关键依赖，不能按副本数宣称相应可用性。即使假设多个串行依赖相互独立，链路成功概率才可按乘积作简化估计；实际相关故障、缓存和降级会改变模型，应以同一用户结果验收。剩余容量、状态一致性与写入排他是切换时的共同约束。'),
 'recovery-evidence':knowledgeSubhead('恢复耗时与恢复点缺口，沿不同时间轴核对')+
 figure('v15-recovery-timeline','题设以t0用户中断起算：2分钟发现、10分钟基础恢复、14分钟业务验证、15分钟切流完成；实际恢复耗时15分钟。恢复数据停在t−1，时间缺口为1分钟，二者不相加。')+
 para('RTO、RPO是事先设定的上限，演练测得的恢复耗时和数据点缺口再与目标比较。若从发现才起算，图中会得到13分钟；若到数据库可读就结束，又只算到10分钟，都改变了这份业务口径。必须约定起点、终点和已确认数据的含义，并记录从准备、材料取回、恢复、验证到切流的关键路径。',
 '目标RTO若为12分钟，图中实际超出3分钟；目标RPO若为2分钟，1分钟缺口在范围内，但不因此代表业务已经恢复。恢复多种状态时还需对齐共同提交点：数据库可读而对象附件缺失、权限失败或消费者无法继续，都可能让用户任务仍失败。数据缺口的分钟数也不能直接换算成某个确定条数。',
 '在新主开放写入前，先取得旧写者被实际阻断的证据。心跳丢失和控制面记录已提升，不证明旧主停止接受写入。恢复材料还要核对版本、完整链、校验、密钥与重放边界，并用业务读写和回执验收。把演练的故障域、时间记录、实际损失与未覆盖条件保存下来，才能让下一次恢复有可用依据。')+
 knowledgeCheck('数据服务在t10已能读取，为什么这次恢复仍计15分钟？','题设终点是授权用户经正式入口重新取得正确服务，包含业务验证和切流；其完成在t15。数据点缺口另由t−1到t0计算1分钟，不能与停机时长混为一个指标。')
});
cloudKnowledgeDomain('sre').refs.push('v15Slo','v15Burn','v15Hist','v15Quantile','v15RuleTests','v15OtelContext','v15W3C','v15Sampling','v15Incident','v15Postmortem','v13PgFence');


;
// cloud-operations-cases.js
function opsLabCode(file,label){return '<details class="full-code"><summary>'+label+'</summary>'+code(file,file.endsWith('.yaml')?'YAML':'PYTHON',cloudOpsLabFiles[file])+'</details>';}
function opsLabLinks(file){return '<p class="practice-links"><a href="labs/cloud-operations.zip" download>下载身份、容量与 SRE 实验包 ↓</a><a href="labs/cloud-operations/'+file+'" download>下载本例源码 ↓</a><a href="labs/cloud-operations/validation.json" target="_blank" rel="noopener">查看本次结果与源码摘要 ↗</a></p>';}
function telemetryCase(){const r=cloudOpsLabValidation.programs['telemetry_lab.py'];return para('案例：本地API调用backend，依次发送正常、注入等待和503请求。先预测哪些请求会有子跨度、trace-id与parent-id如何连接，再核对实际请求记录。图中的300ms是理想账本，程序保留本机测得的墙钟和HTTP开销。')+
 code('Python 3.9+ · 两个本地 HTTP 服务','SH','python3 telemetry_lab.py')+
 table(['核对对象','本次观察','判断'],[['业务计数',r.requests+'个请求、'+r.bad_requests+'个坏请求','不会因为503没有backend跨度而丢掉失败'],['路径关联',r.backend_spans+'个backend跨度，父子验证通过','trace-id延续，下一跳parent对应API跨度'],['指标标签','route / outcome','逐请求ID不作为指标标签'],['实际API毫秒',r.measured_api_ms.join(' / '),'实际测量，不能当作生产压测或固定时限']])+
 opsLabCode('telemetry_lab.py','展开完整 HTTP 计时与 trace 传播程序')+
 para('180ms等待与60ms处理用sleep注入，均为墙钟延迟，不是CPU耗时。示例只覆盖最小version-00上下文，不是OTel SDK兼容或采样导出验证；真实跨主机还需考虑时钟、丢样和边界策略。')+opsLabLinks('telemetry_lab.py');}
function promtoolCase(){const r=cloudOpsLabValidation.programs['promtool_lab.py'];return '<h3>在真实规则引擎中检验聚合与告警</h3>'+para('规则明确使用30天、99.9%目标，1h和5m均超过14.4倍，另有1m持续条件。输入序列与断言一起下载；先手算，再让promtool求值。课堂图里的99%预算与这份规则是不同题设，代入时要读取各自分母。')+
 code('本次基线 Prometheus 3.5.0 · 不启动抓取服务','SH','python3 promtool_lab.py /absolute/path/to/promtool\n# 或直接运行\npromtool check rules slo.rules.yaml\npromtool test rules slo.test.yaml')+
 table(['输入/对照','预期与实际核对'],[['请求按A/B合并','总体成功率0.91；实例等权平均0.95不能使用'],['持续热故障 / 短窗恢复','先触发，短窗恢复后该快速组合解除'],['兼容经典桶','合并后p99估计0.99，实例p99均值0.545是另一结果'],['无错误序列 / 零流量 / 无数据','分别得到坏率0、无成功比例、缺序列；不混填100%']])+
 code('本次规则执行摘要','JSON',JSON.stringify({version:r.version,fixture_groups:r.fixture_groups,commands:r.commands},null,2))+
 opsLabCode('slo.rules.yaml','查看可执行的 recording / alerting rules')+
 opsLabCode('slo.test.yaml','展开七组输入序列与独立数学预期')+
 opsLabCode('promtool_lab.py','展开调用真实 promtool 的验证驱动')+
 para('直方图计算存在最后位浮点差异，测试只用promtool官方fuzzy_compare容忍该差异，保留标签与分支断言。这里只运行解析和规则求值，没有抓取生产指标、发送Alertmanager通知或执行真实值班处置。')+opsLabLinks('promtool_lab.py');}
Object.assign(cloudFieldCases,{
 'cloud-security':()=>{const r=cloudOpsLabValidation.programs['authorization_http_lab.py'];return para('案例：读者A有读自己报表的能力，尝试换租户、伪装路径归属、扩大动作范围；另测试过期、错误受众、签名伪造和策略撤销。HTTP结果与SQLite实际写入分别核对，成功与拒绝都要成立。')+
 code('Python 3.9+ · 标准库 / 真实 loopback HTTP','SH','python3 authorization_http_lab.py')+
 table(['组别','结果','验证的边界'],[['正常读与获准写','200，A最终只有1次获准写','必要功能仍可用'],['跨租户/错误对象/只读写入','403，B写入0','参数与路径不能自授归属和能力'],['过期/零期限/错误受众/伪造签名','401','验证凭证的适用性与可信性'],['策略撤销/新代际/密钥集合切换','按当前策略与信任集合分别通过或拒绝','签发、验证、授权是不同状态']])+
 code('本次实际效果','JSON',JSON.stringify({cases:r.cases.length,writes_A:r.writes_A,writes_B:r.writes_B,audit_events:r.audit_events,credentials_logged:r.credentials_logged},null,2))+
 opsLabCode('authorization_http_lab.py','展开完整授权程序：凭证、策略、对象与效果')+
 para('本地capability使用HMAC和固定信任集合。HMAC用共享密钥校验内容，持有该密钥的一方也能签发本例凭证；它与只持公钥的验签不是同一种信任分工。此例刻意限定协议与输入，不是JWT/OIDC实现。正式身份协议需要成熟实现与实际签发/验证环境；实验没有接入云IAM或Kubernetes。')+
 opsLabCode('rbac-readonly.yaml','查看按官方语义审阅的最小 RBAC 配置')+
 knowledgeCheck('为什么本例既检查403，也检查数据库写入？','返回拒绝只是一份回应。必须确认受保护效果没有提前发生，同时让必要正例成功；否则可能漏掉“已经写入但最后返回拒绝”，或让不可用的全部拒绝误充最小权限。')+opsLabLinks('authorization_http_lab.py');},
 'cloud-capacity':()=>{const r=cloudOpsLabValidation.programs['capacity_lab.py'];return para('案例：输入100/s，前10秒只有80/s能力，之后120/s。先手算积压峰值、排空时刻和每段实际完成，再给缓冲设160上限。程序用Fraction精确积分，每一步核对到达、完成、拒绝和剩余工作的守恒。')+
 code('Python 3.9+ · 精确流体模型，不生成网络压力','SH','python3 capacity_lab.py')+
 table(['观察点','无限缓冲','上限160'],[['10s','到达1000、完成800、积压200','完成800、积压160、拒绝40'],['20s','到达2000、完成2000、积压0','完成1960、拒绝40、积压0'],['30s','完成3000，空队列实际完成100/s','完成2960、拒绝40']])+
 code('本次成本与单位关系核对','JSON',JSON.stringify({stable:r.stable_admitted_100_per_second,cost:r.cost,backlog_area:r.unbounded.backlog_area_request_seconds},null,2))+
 opsLabCode('capacity_lab.py','展开积压、有限缓冲、CPU单位与成本程序')+
 para('模型把工作当作连续可处理量，容量在给定时刻阶跃，省略服务颗粒度、真实竞争与伸缩过程。它验证公式和守恒，不作为真实HPA或压测证据；成本也是题设单位。')+
 knowledgeCheck('10秒扩到120/s，为什么仍不能说过载已完全恢复？','当时还有200积压，净余量仅20/s，再需10秒。实际还应核对到达、有效完成、积压年龄、失败与用户延迟；空队列后也不能把120/s能力当作实际完成量。')+opsLabLinks('capacity_lab.py');},
 'sre':()=>telemetryCase()+promtoolCase()+knowledgeCheck('一条慢trace能证明全站错误率或p99吗？','不能。轨迹用于解释被记录的样本，全局比例与分布需要完整且同口径的事件计数或可合并桶；采样、缺数和标签边界都要核对。')
});
for(const [id,module,title,body]of [
 ['iam-security','cloud-security','配套实战：真实HTTP授权与无副作用验收',cloudFieldCases['cloud-security']],
 ['elasticity','cloud-capacity','配套实战：积压守恒、有限缓冲与单位成本',cloudFieldCases['cloud-capacity']],
 ['observability','sre','配套实战：两段HTTP与父子trace关联',telemetryCase],
 ['slo','sre','配套实战：真实Prometheus规则求值',promtoolCase]
]){
 const article=articleByIdForCloud(id);
 article.sections.push([title,body()]);
 article.refs=[...new Set([...article.refs,...cloudKnowledgeDomain(module).refs])];
 article.updated='2026.11.04';
}
const cloudStageFields=[['foundation'],['compute','network','cloud-data'],['native'],['serverless','cloud-delivery'],['cloud-security','cloud-capacity'],['sre']];
const cloudStageGates=[
 '区分运行与等待、虚拟内存与OOM、重试与重复效果；已有基础可跳过补课。',
 '画请求往返，说明索引/事务确认，从完整恢复材料选择目标并验证数据。',
 '从API声明追到Pod、端点与卷，复算放置资源、发布和伸缩。',
 '区分受理/执行/提交，解释保存计划、状态刷新与自愈/清理。',
 '让必要授权成功、越权无效果；算出积压、排空与唯一成功成本。',
 '聚合SLI与桶，解释等待段，再按约定起止点验收RPO/RTO。'
];
function cloudStageStudyHTML(index){return '<p class="stage-field-links"><b>先读系统知识：</b>'+cloudStageFields[index].map(id=>'<a href="/module/'+id+'/">'+moduleFor(id).n+' '+moduleFor(id).name+' →</a>').join(' ')+'</p><p class="stage-gate"><b>过关任务：</b>'+cloudStageGates[index]+'</p>';}


;
// attention-interactive.js
function attentionExample(position,causal,changeFuture){
 const {queries,keys,values}=attentionValidation.report.attention;
 const query=queries[position],count=causal?position+1:keys.length;
 const scores=keys.slice(0,count).map(key=>query.reduce((sum,x,i)=>sum+x*key[i],0)/Math.sqrt(query.length));
 const exps=scores.map(x=>Math.exp(x-Math.max(...scores))),denominator=exps.reduce((x,y)=>x+y,0);
 const weights=exps.map(x=>x/denominator).concat(Array(keys.length-count).fill(0));
 const adjusted=values.map((v,i)=>changeFuture&&i===3?[999,-999]:v);
 return {weights,output:values[0].map((_,j)=>weights.reduce((sum,p,i)=>sum+p*adjusted[i][j],0))};
}
function initAttentionDemo(){const root=document.getElementById('attention-demo');if(!root)return;let position=0,causal=true,change=false;
 const render=()=>{const r=attentionExample(position,causal,change);root.innerHTML=`<div class="interactive"><div class="demo-title">选一个query位置，观察它能读取谁<span>固定向量的数学演示 · 不是模型生成</span></div><div class="segmented">${[0,1,2,3].map(i=>`<button data-position="${i}" class="${i===position?'active':''}" aria-pressed="${i===position}">位置 ${i}</button>`).join('')}</div><div class="attention-controls"><label><input type="checkbox" data-causal ${causal?'checked':''}> 使用因果mask</label><label><input type="checkbox" data-future ${change?'checked':''}> 将位置3的V改为[999, −999]</label></div><div class="attention-weights">${r.weights.map((w,i)=>`<div class="${causal&&i>position?'masked':''}"><small>KEY / VALUE ${i}</small><b>${(w*100).toFixed(1)}%</b><span>${causal&&i>position?'未来位置 · 被屏蔽':'参与加权'}</span></div>`).join('')}</div><p class="attention-output" aria-live="polite">位置${position}的输出向量：[${r.output.map(x=>x.toFixed(3)).join(', ')}]</p><p class="demo-caption">先保持位置0与因果mask，修改未来V：输出仍为[10, 0]。再移除mask，观察未来信息如何影响过去。</p></div>`;root.querySelectorAll('[data-position]').forEach(b=>b.onclick=()=>{position=Number(b.dataset.position);render()});root.querySelector('[data-causal]').onchange=e=>{causal=e.target.checked;render()};root.querySelector('[data-future]').onchange=e=>{change=e.target.checked;render()}};render();}


;
// reader-experience.js
function publicRoute(value){const [path,query]=value.replace(/^#/,'').split('?');return hostedPath((path==='/'?'/':path.replace(/\/$/,'')+'/')+(query?'?'+query:''))}
function cleanInternalHTML(html){return html.replace(/href="#\/([^\"]*)"/g,(_,path)=>'href="'+publicRoute('/'+path)+'"')}
function normalizeInternalLinks(){document.querySelectorAll('a[href^="#/"],a[href^="/"]').forEach(a=>{const href=a.getAttribute('href');a.setAttribute('href',href.startsWith('#/')?publicRoute(href):hostedPath(href))})}
const publicSiteOrigin='https://cloud-infra-guide-llh.tautagave4.chatgpt.site';
function readerActionsHTML(a){return `<section class="reader-actions"><h2>阅读反馈与分享</h2><details><summary>留下本章阅读记录与具体反馈</summary><label>我的练习答案或实验结果<textarea data-reader-answer rows="3" maxlength="1800" placeholder="写下你算出的结果，或实验报告中最关键的一项。"></textarea></label><label>哪句话没理解，或还缺哪个例子？<textarea data-reader-question rows="3" maxlength="1800" placeholder="具体到一句解释、一个假设或一段代码，方便下一次改进。"></textarea></label><button class="btn secondary" data-download-note="${a.id}">下载阅读记录 ↓</button><p class="evidence-note">内容不会自动发送。下载后可作为评论或私信反馈给分享这篇文章的人。</p><p class="reader-error" role="status"></p></details><details><summary>分享这一章</summary><label>可直接打开的章节链接<input class="share-url" readonly value="${publicSiteOrigin}/article/${a.id}/" aria-label="章节分享链接"></label><p class="evidence-note">选中链接复制；也可以直接分享浏览器中的当前地址。</p></details></section>`}
function initReaderActions(){document.querySelectorAll('[data-download-note]').forEach(button=>button.onclick=()=>{const block=button.closest('details'),answer=block.querySelector('[data-reader-answer]').value.trim(),question=block.querySelector('[data-reader-question]').value.trim(),error=block.querySelector('.reader-error');if(!answer&&!question){error.textContent='先写下一项练习结果或一个具体问题，再下载。';return}error.textContent='';const a=articles.find(x=>x.id===button.dataset.downloadNote),body=['InfraGuide 阅读记录',a.number+' '+a.title,publicSiteOrigin+'/article/'+a.id+'/','','练习答案 / 实验结果：',answer||'未填写','','卡点 / 希望补充的例子：',question||'未填写','','这是一份读者主动填写的记录，不代表网站已自动收到反馈。'].join('\n');const url=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='infraguide-'+a.id+'-notes.txt';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);error.textContent='阅读记录已生成，可回到原文评论或私信中分享。'});document.querySelectorAll('.share-url').forEach(input=>input.onclick=()=>input.select())}
function startPage(){simplePage('从全貌开始，学会解释一个系统','START HERE · 初学者与面试准备','初学者先看知识地图，面试前按核心问题复习。需要深入时，每个主题都能回到完整章节与实验。',`${studyIntroHTML()}<section class="quality-section"><h2>用一个小成果验证理解</h2><p>选一个与你当前问题接近的样章，亲手算一次或运行一个小实验。</p></section><div class="start-paths">${[
 ['Cloud Infra','10分钟','服务成功率到底怎么算？','slo','用两组不同流量算出全局成功率、错误预算与消耗率。','将计算器设为总事件1000、好事件990、目标99%。解释为什么预算剩余0、消耗率1×。','不需要额外环境'],
 ['AI Infra','20分钟','KV Cache为什么能避免重复计算？','model-serving','理解缓存成立的条件，并观察逐token与整段注意力的一致性。','运行attention_lab.py，找到cache_max_abs_error，再解释移除因果mask会改变什么。','实验需要Python 3.9+，无需GPU'],
 ['Agent Infra','20分钟','工具成功了，为什么任务还没完成？','agent-recovery','复现工具已提交、runner退出的窗口，解释尝试数与效果数为何不同。','运行agent_lab.py，核对attempts=2、tool_effects=1，并说明去重由谁保证。','实验需要Python 3.9+，无需模型服务']
 ].map(([track,time,title,id,result,task,env],i)=>`<section class="start-card"><div class="start-meta"><span>0${i+1} / ${track}</span><b>${time}</b></div><h2>${title}</h2><p>${result}</p><div class="start-outcome"><strong>这次带走什么</strong><p>${task}</p></div><div class="buttons"><a class="btn" href="${articleURL(id)}">阅读样章并完成练习 →</a></div><small>${env}</small></section>`).join('')}</div><p class="evidence-note">时间是建议阅读与尝试预算，环境准备和深入源码另计。完成练习后，章节末尾可下载个人阅读记录；网站不把点击或勾选当作真实学习成效。</p><section class="quality-section"><h2>第一次接触训练术语？先补上这段桥梁</h2><p>从一组token ID开始，看它怎样成为向量、经过Attention、产生loss，再进入反向与参数更新。每一步都连接到云工程中的资源与状态。</p><a class="btn secondary" href="${articleURL('gpu-cluster')}">从token到GPU集群 →</a></section><section class="quality-section"><h2>读完样章，再选择完整路线</h2><div class="track-grid">${Object.keys(trackDefinitions).map(trackCard).join('')}</div></section>`)}


;
// system-interactive.js
function sloCalculation(total,good,target){
 if(!Number.isSafeInteger(total)||!Number.isSafeInteger(good)||total<0||good<0||good>total||!Number.isFinite(target)||target<=0||target>=100)return {error:'请输入有效整数事件数，且好事件不超过总数；目标需大于0%且小于100%。'};
 if(total===0)return {empty:true};
 const allowed=total*(1-target/100),bad=total-good;
 return {success:good/total*100,remaining:allowed-bad,burn:bad/allowed};
}
function kvCalculation(layers,heads,dimension,bytes,tokens,requests){
 const values=[layers,heads,dimension,bytes,tokens,requests];
 if(values.some(v=>!Number.isSafeInteger(v)||v<1||v>1000000))return {error:'请输入1到1000000之间的正整数；这是未分片的逻辑容量估算。'};
 const perToken=2*layers*heads*dimension*bytes,total=perToken*tokens*requests;
 if(!Number.isSafeInteger(total))return {error:'输入组合过大，超出精确整数计算范围。请缩小参数。'};
 return {perToken,perRequestGiB:perToken*tokens/2**30,totalGiB:total/2**30};
}
function initSystemInteractive(){
 const slo=document.getElementById('slo-demo');
 if(slo){slo.innerHTML='<div class="interactive"><div class="demo-title">错误预算计算器 <span>同一统计窗口 · 示例数据</span></div><div class="calc-fields"><label>总事件数<input id="slo-total" type="number" min="0" step="1" value="1000"></label><label>好事件数<input id="slo-good" type="number" min="0" step="1" value="989"></label><label>SLO目标（%）<input id="slo-target" type="number" min="0.001" max="99.999" step="0.01" value="99"></label></div><div class="calc-result" aria-live="polite"></div></div>';
 const calculate=()=>{const raw=['slo-total','slo-good','slo-target'].map(id=>document.getElementById(id).value);const r=raw.some(x=>x.trim()==='')?{error:'请填写全部字段。'}:sloCalculation(...raw.map(Number));slo.querySelector('.calc-result').innerHTML=r.error?'<p class="calc-error">'+r.error+'</p>':r.empty?'<p class="demo-caption">无数据：总事件数为0，不能声称100%可靠。</p>':`<div class="calc-output"><div><strong>${r.success.toFixed(2)}%</strong><small>全局好事件比例</small></div><div><strong>${r.remaining.toFixed(2)}</strong><small>剩余坏事件预算</small></div><div><strong>${r.burn.toFixed(2)}×</strong><small>预算消耗率</small></div></div>`};slo.querySelectorAll('input').forEach(i=>i.addEventListener('input',calculate));calculate();}
 const kv=document.getElementById('kv-demo');
 if(kv){const fields=[['layers','层数',32],['heads','KV头数',8],['dimension','头维度',128],['bytes','元素字节数',2],['tokens','每请求保留token',4096],['requests','并发请求',16]];kv.innerHTML='<div class="interactive"><div class="demo-title">KV逻辑容量计算器 <span>不含权重、工作区或分页开销</span></div><div class="calc-fields">'+fields.map(([id,label,value])=>`<label>${label}<input id="kv-${id}" type="number" min="1" max="1000000" step="1" value="${value}"></label>`).join('')+'</div><div class="calc-result" aria-live="polite"></div><p class="demo-caption">常规稠密注意力、各层维度一致、无跨请求共享。结果是逻辑总量，不是多卡情况下的每卡实测。</p></div>';
 const calculate=()=>{const r=kvCalculation(...fields.map(([id])=>Number(document.getElementById('kv-'+id).value)));kv.querySelector('.calc-result').innerHTML=r.error?'<p class="calc-error">'+r.error+'</p>':`<div class="calc-output"><div><strong>${(r.perToken/1024).toFixed(1)}</strong><small>KiB / token</small></div><div><strong>${r.perRequestGiB.toFixed(3)}</strong><small>GiB / 请求</small></div><div><strong>${r.totalGiB.toFixed(3)}</strong><small>GiB / 总逻辑KV</small></div></div>`};kv.querySelectorAll('input').forEach(i=>i.addEventListener('input',calculate));calculate();}
}


;
// infra-knowledge.js
/* Systematic reading surfaces for AI and Agent. Existing article URLs stay stable. */
const infraKnowledgeDomains=[];
const infraFieldCases={};
const infraDomain=id=>infraKnowledgeDomains.find(d=>d.module===id);
// Add reading spaces in prose while preserving code bytes, URLs and HTML attributes.
function infraReadableHTML(html){let codeDepth=0;return html.split(/(<[^>]+>)/g).map(part=>{if(part.startsWith('<')){if(/^<(?:pre|code)\b/i.test(part))codeDepth++;if(/^<\/(?:pre|code)\s*>/i.test(part))codeDepth=Math.max(0,codeDepth-1);return part;}return codeDepth?part:part.replace(/([\u3400-\u9fff])([A-Za-z0-9])/g,'$1 $2').replace(/([A-Za-z0-9])([\u3400-\u9fff])/g,'$1 $2');}).join('');}
function infraKnowledgePoint(p,i){return '<section class="knowledge-point" id="knowledge-'+p.id+'"><h2><span>'+String(i+1).padStart(2,'0')+'</span>'+p.title+'</h2><p>'+p.lead+'</p>'+p.body+'</section>';}
function infraKnowledgeTOC(d){return conceptTOCLink('/module/'+d.module+'/')+d.points.map((p,i)=>'<a href="/module/'+d.module+'/#knowledge-'+p.id+'">'+(i+1)+'. '+p.title+'</a>').join('');}
function infraKnowledgePage(m){
 const d=infraDomain(m.id),track=trackDefinitions[m.track];
 document.title=m.name+' · '+track.label+' · InfraGuide';
 const fieldLinks=infraKnowledgeDomains.filter(x=>x.track===m.track).map(x=>'<a href="/module/'+x.module+'/">'+moduleFor(x.module).name+'</a>').join('');
 const toc=infraKnowledgeTOC(d);
 const mobile='<details class="mobile-contents"><summary>领域目录与本页知识点</summary><div class="mobile-field-links">'+fieldLinks+'</div>'+toc+'<a href="/module/'+m.id+'/#examples">代码实验与具体案例</a></details>';
 const references='<section class="knowledge-references"><h2>原始资料</h2><div>'+d.refs.map(k=>'<a href="'+sources[k][1]+'" target="_blank" rel="noopener">'+sources[k][0]+' ↗</a>').join('')+'</div></section>';
 $('#app').innerHTML=infraReadableHTML('<main class="doc-layout knowledge-layout" id="main" tabindex="-1">'+sidebar(m.id)+'<article class="article knowledge-article">'+breadcrumbs(m)+'<div class="eyebrow">'+track.label.toUpperCase()+' / 系统知识</div><h1>'+m.name+'</h1>'+readingToolbarHTML()+mobile+moduleConceptIntro(m)+'<div class="knowledge-body">'+explainFirstConceptTerms(d.points.map(infraKnowledgePoint).join(''),conceptSeen(moduleConceptPaths[m.id]))+'</div>'+'<section class="knowledge-examples" id="examples"><h2>代码实验与具体案例</h2>'+(infraFieldCases[m.id]?.()||'')+'<h3>继续阅读机制详解</h3>'+articles.filter(a=>a.module===m.id).map(chapterLink).join('')+'</section>'+references+resourceRecommendations(m.id)+'<div class="knowledge-exit"><a href="/roadmap/?track='+m.track+'">学习顺序与过关任务 →</a><a href="/resources/#'+m.track+'">原始资料与课程 →</a></div></article><aside class="toc"><div class="toc-title">本领域知识点</div>'+toc+'<a href="/module/'+m.id+'/#examples">代码实验与案例</a></aside></main>'+footer());
}
function infraArticleKnowledge(a){const d=infraDomain(a.module);if(!d)return '';return '<p class="article-context-link"><a href="/module/'+d.module+'/">本领域系统知识：'+moduleFor(d.module).name+' →</a></p>';}

function infraSearchText(a){const d=infraDomain(a.module);return d?d.points.filter(p=>p.articles.includes(a.id)).map(p=>p.title+" "+p.lead+" "+p.body.replace(/<[^>]+>/g," ")).join(" "):"";}

