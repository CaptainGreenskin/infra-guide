/* Shared reading controls; the document remains fully readable without JavaScript. */
function readingToolbarHTML(){return '<div class="reading-toolbar" role="group" aria-label="阅读工具"><button type="button" data-reader-contents aria-haspopup="dialog">本页目录 <span aria-hidden="true">≡</span></button><div class="reading-display"><button type="button" data-reader-large aria-pressed="false" title="切换大字阅读">大字</button><button type="button" data-reader-focus aria-pressed="false">专注阅读</button></div></div>';}

let comfortAbort,collectionAbort;
function ensureToolbarLeftGroup(toolbar){
 let left=toolbar.querySelector('.reading-tools-left');
 if(!left){
  left=document.createElement('div');
  left.className='reading-tools-left';
  const contents=toolbar.querySelector('[data-reader-contents]');
  toolbar.prepend(left);
  if(contents)left.appendChild(contents);
 }
 return left;
}
function initReadingConceptReturn(article,toolbar){
 const params=new URLSearchParams(location.search);
 const source=params.get('fromConcept');
 if(!source||!toolbar)return;
 const footer=article.querySelector('.chapter-map-link[data-concept-returns]');
 if(!footer)return;
 const choices=JSON.parse(footer.dataset.conceptReturns);
 if(!Object.hasOwn(choices,source))return;
 const [path,label,track]=choices[source],role=params.get('returnGoal');
 const optionalRole=!params.has('goal')&&learningProfiles[role]?.track===track?role:null;
 const [before,fragment]=path.split('#');
 const href=readerInternalHref(before+(optionalRole?'&goal='+optionalRole:'')+'#'+fragment);
 footer.setAttribute('href',href);
 footer.textContent='返回概念图 · '+label+' →';
 let shortcut=toolbar.querySelector('.reader-concept-return');
 if(!shortcut){
  shortcut=document.createElement('a');
  shortcut.className='reader-concept-return';
  shortcut.textContent='返回概念图';
  ensureToolbarLeftGroup(toolbar).appendChild(shortcut);
 }
 shortcut.setAttribute('href',href);
 shortcut.setAttribute('aria-label','返回概念图 · '+label);
 if(params.has('returnGoal')&&!optionalRole)return;
 const goal=params.get('goal');
 for(const link of article.querySelectorAll('.chapter-lab-evidence[data-lab-concepts]')){
  if(!link.dataset.labConcepts.split(' ').includes(source))continue;
  const lab=new URL(link.href);
  if(lab.searchParams.get('track')!==track||(params.has('goal')&&lab.searchParams.get('goal')!==goal))continue;
  lab.searchParams.set('fromConcept',source);
  if(optionalRole)lab.searchParams.set('returnGoal',optionalRole);
  link.setAttribute('href',lab.pathname+lab.search+lab.hash);
 }
}
function initReadingGateReturn(toolbar){
 if(toolbar.querySelector('.reader-concept-return, .reader-gate-return'))return;
 const chapter=documentPathname().match(/^\/article\/([a-z0-9-]+)\/?$/)?.[1];
 const evidence=chapter&&learningGoalEvidenceReturn(chapter);
 if(!evidence)return;
 const shortcut=document.createElement('a');
 shortcut.className='reader-gate-return';
 shortcut.textContent='返回验收';
 shortcut.setAttribute('aria-label','返回本项岗位验收');
 shortcut.setAttribute('href',readerInternalHref(evidence));
 ensureToolbarLeftGroup(toolbar).appendChild(shortcut);
}
// Reading pace for the remaining-time hint: technical Chinese ~350 characters/min, Latin words ~180/min.
const chapterReadingMinutes={'linux-resource':8,'virtual-memory-oom':10,'concurrency-pools':11,'distributed-systems':11,'cloud-overview':7,'cloud-compute':17,'vpc-network':26,'network-diagnosis':20,'tcp-event-loop':13,'training-storage':12,'database-index-locks':18,'cache-consistency':15,'storage-recovery':15,'mysql-recovery':12,'mysql-replication':16,'container-runtime':13,'kubernetes-basics':13,'k8s-workloads':13,'scheduling-resources':11,'k8s-networking':14,'k8s-storage':15,'config-secrets':12,'k8s-autoscaling':13,'control-plane-consensus':14,'serverless-execution':24,'message-delivery':11,'delivery':20,'terraform-state':12,'gitops-reconciliation':13,'iam-security':22,'elasticity':23,'slo':20,'observability':15,'incident':12,'resilience':21,'transformer-model':12,'tokenization-embedding':16,'attention-mechanics':21,'transformer-block':18,'position-encoding':18,'autograd-training':18,'gpu-execution':14,'roofline-model':11,'flash-attention-io':20,'tensor-parallel-math':18,'operator-profiling':27,'gpu-cluster':12,'distributed-training':19,'gpu-memory':24,'ddp-code':14,'training-communication':20,'data-pipeline':22,'multinode-lab':21,'checkpoint-recovery':23,'training-performance':14,'training-platform':12,'gpu-scheduling':16,'kubernetes-training':15,'model-serving':33,'quantization-serving':13,'inference-performance':28,'ai-lifecycle':16,'moe-routing':15,'speculative-decoding':16,'agent-runtime':14,'mcp-protocol':18,'agent-security':13,'agent-sandbox':25,'agent-memory':13,'agent-recovery':18,'agent-evaluation':22,'durable-workflows':20,'agent-retrieval':21,'agent-observability':25,'kairo-practice':20,'training-lab':9,'cloud-service-lab':7,'production-readiness':15};
const chapterAnimatedScenes={'cloud-overview':'C01','linux-resource':'C02','vpc-network':'C03','database-index-locks':'C04','delivery':'C05','elasticity':'C06','tcp-event-loop':'C07','k8s-workloads':'C08','mysql-replication':'C09','slo':'C10','transformer-model':'A01','attention-mechanics':'A02','autograd-training':'A03','gpu-memory':'A04','distributed-training':'A05','inference-performance':'A06','gpu-execution':'A07','flash-attention-io':'A08','model-serving':'A09','tensor-parallel-math':'A10','quantization-serving':'A10','ai-lifecycle':'S03','roofline-model':'S16','agent-runtime':'G01','agent-security':'G02','agent-recovery':'G03','durable-workflows':'G04','agent-memory':'G05','mcp-protocol':'G07','agent-sandbox':'G08','agent-retrieval':'G09','agent-observability':'G10','agent-evaluation':'G10','production-readiness':'S29'};
const foundationChapterSet=new Set(['cloud-overview','linux-resource','distributed-systems','vpc-network','network-diagnosis','transformer-model','tokenization-embedding','attention-mechanics','autograd-training','virtual-memory-oom','concurrency-pools','database-index-locks','cache-consistency']);
const deepChapterSet=new Set(['operator-profiling','multinode-lab','training-performance','kubernetes-training','quantization-serving','moe-routing','speculative-decoding','kairo-practice','training-lab','cloud-service-lab','production-readiness','tcp-event-loop','mysql-recovery','mysql-replication','control-plane-consensus','terraform-state','gitops-reconciliation','serverless-execution']);
function defaultChapterPriorityLabel(id){
 const profile=typeof selectedLearningProfile==='function'?selectedLearningProfile():null;
 if(profile&&typeof learningProfilePriority==='function')return learningProfilePriority(id,profile);
 if(foundationChapterSet.has(id))return '基础必修';
 if(deepChapterSet.has(id))return '专题深入';
 return '岗位重点';
}

// Categorized beginner glossary for instant inline explanation & searchable dictionary modal.
const beginnerGlossaryCategories=['系统与计算','云网络与存储','容器与 K8s','交付与可靠性','模型与注意力','GPU 与分布式训练','推理服务','Agent 与工作流'];
// [term, catIdx, plainDefinition, chapterId, inlineAllowed]
const beginnerGlossary=[
 ['CPU',0,'中央处理器，擅长处理复杂分支与系统调度指令。','linux-resource',0],
 ['GPU',0,'图形与并行数值处理器，拥有成千上万个计算单元，适合矩阵与张量并行运算。','gpu-execution',0],
 ['进程',0,'正在运行的一份程序实例，拥有独立的虚拟地址空间与文件描述符表。','linux-resource',0],
 ['线程',0,'进程内部的一条执行流；同一进程的多个线程共享内存，但各有自己的调用栈。','concurrency-pools',0],
 ['虚拟机',0,'通过虚拟化层模拟出独立 CPU、内存与网卡并运行完整客户机内核的计算环境。','cloud-compute',0],
 ['容器',0,'共享宿主机 Linux 内核，用 namespace 隔离视图、用 cgroup 限制资源的应用运行实例。','container-runtime',0],
 ['vCPU',0,'云主机对外提供的逻辑 CPU 执行单元，通常对应物理核上的硬件线程而非独占物理核。','cloud-compute',1],
 ['Hypervisor',0,'虚拟机监控器（如 KVM），负责将物理 CPU、内存和设备安全切分给多台虚拟机。','cloud-compute',1],
 ['namespace',0,'Linux 命名空间，决定进程“能看到哪些进程号、网卡、挂载点与主机名”。','container-runtime',1],
 ['cgroup',0,'Linux 控制组，决定一组进程“最多能用多少 CPU 时间配额与内存上限”。','linux-resource',1],
 ['KVM',0,'Linux 内核内置的硬件辅助虚拟化模块，让 Linux 宿主机直接承载虚拟机运行。','cloud-compute',1],
 ['NUMA',0,'非一致内存访问架构：多路服务器上 CPU 访问本插槽内存更快、跨插槽访问更慢。','cloud-compute',1],
 ['SMT',0,'同时多线程（如超线程），让单个物理核心暴露两个共享底层执行单元的硬件线程。','cloud-compute',1],
 ['EPT',0,'扩展页表，硬件辅助把客户机物理地址再翻译成宿主机真实物理地址的二阶段页表。','cloud-compute',1],
 ['TLB',0,'地址转换旁路缓存，保存最近用过的虚拟地址到物理地址映射，未命中时需查多级页表。','virtual-memory-oom',1],
 ['IOMMU',0,'设备侧内存管理单元，控制网卡或 GPU 直接读写内存（DMA）时的地址映射与隔离。','cloud-compute',1],
 ['virtio',0,'半虚拟化标准设备接口，让虚拟机与宿主机高效收发网络包和磁盘块。','cloud-compute',1],
 ['OOM',0,'Out Of Memory（内存耗尽）：当系统或容器内存超限时，内核按规则终止进程以回收内存。','virtual-memory-oom',1],
 ['epoll',0,'Linux 高效 I/O 事件通知机制，让单线程同时监听成千上万个网络连接而无需轮询。','tcp-event-loop',1],
 ['IaaS',0,'基础设施即服务：云厂商提供虚拟机、网络和磁盘，用户自己管操作系统与应用。','cloud-overview',1],
 ['PaaS',0,'平台即服务：云平台托管数据库或运行环境，用户专注部署业务代码与配置。','cloud-overview',1],
 ['FaaS',0,'函数即服务（Serverless 函数）：按事件或请求拉起函数运行，空闲时不常驻计费。','serverless-execution',1],
 ['VPC',1,'虚拟私有云：用户在云上独享的一块逻辑隔离网络空间，可自定义网段、子网与路由表。','vpc-network',1],
 ['CIDR',1,'无类别域间路由表示法（如 10.0.0.0/16），用斜杠后的前缀位数说明网段范围大小。','vpc-network',1],
 ['DNS',1,'域名系统，把好记的服务域名（如 api.example.com）解析成网络可路由的 IP 地址。','vpc-network',1],
 ['TCP',1,'面向连接的可靠字节流传输协议，通过序号、确认与重传保证字节按序不丢；需应用自己切分消息边界。','tcp-event-loop',1],
 ['UDP',1,'无连接的数据报协议，发包开销小但不替应用重传或排序，常用于底层隧道封装与实时通信。','vpc-network',1],
 ['TLS',1,'传输层安全协议（HTTPS 的加密层），通过证书校验服务端身份并协商对称密钥加密通信。','vpc-network',1],
 ['NAT',1,'网络地址转换，在网关处改写数据包的源或目的 IP/端口，常用于私有子网访问公网。','vpc-network',1],
 ['MTU',1,'最大传输单元，单帧网络包允许的最大字节数；隧道封装后若超出上限会导致分片或丢包。','vpc-network',1],
 ['TTL',1,'生存时间：在 DNS 中表示解析结果可缓存多少秒，在 IP 包中表示最多还能经过几跳路由。','vpc-network',1],
 ['Overlay',1,'叠加网络：在物理底层网络之上用报文封装虚拟出的逻辑二层或三层网络（常见于容器跨机通信）。','k8s-networking',1],
 ['VXLAN',1,'一种把二层以太网帧装进 UDP 包跨三层网络传输的 Overlay 隧道技术。','vpc-network',1],
 ['ACL',1,'访问控制列表，按无状态或预定规则逐条匹配来源、目标与端口以放行或拦截流量。','vpc-network',1],
 ['IOPS',1,'每秒输入/输出操作次数，衡量随机小块读写密集型存储（如数据库日志盘）的关键指标。','training-storage',1],
 ['POSIX',1,'可移植操作系统接口标准；支持完整 POSIX 文件语义的共享盘才能直接做同目录原子替换。','training-storage',1],
 ['MVCC',1,'多版本并发控制：数据库保留行数据的历史版本，让普通读取无需阻塞正在进行的写入事务。','database-index-locks',1],
 ['WAL',1,'Write-Ahead Logging（预写式日志）：数据页改写落盘前，必须先把变更日志持久化到磁盘以支持崩溃恢复。','storage-recovery',1],
 ['redo',1,'重做日志（如 InnoDB redo log），记录物理页修改，崩溃重启后用来把已提交事务重放完整。','mysql-recovery',1],
 ['undo',1,'回滚日志，用来撤销未提交事务的改动，并为 MVCC 一致性视图提供旧版本数据。','mysql-recovery',1],
 ['binlog',1,'MySQL Server 层的二进制归档日志，按逻辑事件记录已提交变更，用于主从复制与时间点恢复。','mysql-replication',1],
 ['Kubernetes',2,'容器编排系统（简称 K8s）：接收“期望运行什么”的声明，自动跨多台机器调度、自愈与扩缩容器。','kubernetes-basics',1],
 ['Pod',2,'Kubernetes 调度的最小单位：把一个或多个紧密协作的容器放进同一个网络 IP 与存储挂载上下文。','kubernetes-basics',1],
 ['Deployment',2,'管理无状态服务副本的 K8s 对象，通过切换底层 ReplicaSet 实现滚动升级与版本回退。','k8s-workloads',1],
 ['ReplicaSet',2,'专门负责“维持指定数量 Pod 副本在线”的 K8s 控制器，通常由 Deployment 自动创建管理。','k8s-workloads',1],
 ['StatefulSet',2,'管理有状态负载的 K8s 对象，为每个副本提供固定的序号名称（如 db-0）与独享持久卷。','k8s-workloads',1],
 ['DaemonSet',2,'确保每个符合条件的节点上都恰好运行一个守护 Pod（如日志采集、CNI 网络插件）的 K8s 对象。','k8s-workloads',1],
 ['Service',2,'为一组动态生灭的 Pod 提供稳定虚拟 IP 与 DNS 名称的 K8s 入口，仅把流量转给已就绪后端。','k8s-networking',1],
 ['ConfigMap',2,'存放非敏感明文配置项的 K8s 对象；挂载文件可热更新，注入为环境变量则需重建 Pod 才生效。','config-secrets',1],
 ['Secret',2,'存放密码、证书或密钥等敏感凭据的 K8s 对象，应配合最小 RBAC 权限与加密存储保护。','config-secrets',1],
 ['NetworkPolicy',2,'声明 Pod 之间允许哪些入站和出站流量的 K8s 规则，实际拦截依赖集群安装了支持它的 CNI 插件。','k8s-networking',1],
 ['CRI',2,'容器运行时接口：kubelet 通过它命令 containerd 等底层运行时拉取镜像和启停容器。','container-runtime',1],
 ['CNI',2,'容器网络接口：Pod 创建时由 CNI 插件（如 Cilium/Calico）分配网卡、IP 并打通跨节点路由。','k8s-networking',1],
 ['CSI',2,'容器存储接口：连接 K8s 与云盘/文件存储驱动的标准扩展层，负责动态建盘、挂盘与卸载。','k8s-storage',1],
 ['PV',2,'PersistentVolume（持久卷），集群里一块具体的底层存储资源对象。','k8s-storage',1],
 ['PVC',2,'PersistentVolumeClaim（持久卷申领），Pod 用来申请“需要多大、什么读写模式的存储”的订单。','k8s-storage',1],
 ['HPA',2,'水平 Pod 自动扩缩器：根据 CPU 或自定义负载指标自动增减工作负载的期望副本数。','k8s-autoscaling',1],
 ['allocatable',2,'节点真正可分给业务 Pod 的资源净额（等于机器总量减去内核、kubelet 和系统守护进程预留）。','scheduling-resources',1],
 ['etcd',2,'Kubernetes 控制面的强一致键值存储，用 Raft 多数派协议保存整个集群的对象声明与状态。','control-plane-consensus',1],
 ['调谐',2,'Reconciliation（调谐循环）：控制器不断对比“声明的期望状态”与“观察到的实际状态”并消除差异。','kubernetes-basics',1],
 ['亲和性',2,'Affinity：指导调度器把 Pod 优先或强制放到特定节点、或与某类 Pod 同机/反同机部署的规则。','scheduling-resources',1],
 ['污点',2,'Taint：打在节点上的“排斥标签”（如专用 GPU 节点），只有声明了对应容忍（Toleration）的 Pod 才能调度上去。','scheduling-resources',1],
 ['RBAC',3,'基于角色的访问控制：把权限授予角色，再把角色绑定给用户或服务账号，避免逐人硬编码授权。','iam-security',1],
 ['OIDC',3,'构建在 OAuth 2.0 之上的开放身份认证协议，用签名令牌向资源方证明“当前调用者是谁”。','iam-security',1],
 ['JWT',3,'JSON Web Token，带数字签名的结构化声明令牌；必须先验签名、签发者、受众与有效期才能采信。','iam-security',1],
 ['IaC',3,'基础设施即代码（如 Terraform）：用可进 Git 评审的声明文件创建和变更云资源，告别手工点控制台。','terraform-state',1],
 ['GitOps',3,'以 Git 仓库中的声明清单为唯一可信源，由集群内控制器持续把实际环境同步到目标版本并纠正漂移。','gitops-reconciliation',1],
 ['SRE',3,'站点可靠性工程：用软件工程、自动化和误差预算管理大规模分布式系统的可用性与演进速度。','slo',1],
 ['SLI',3,'服务质量指标：站在用户视角量化的真实好事件比例（例如“300ms 内返回正确账单的请求占比”）。','slo',1],
 ['SLO',3,'服务质量目标：要求 SLI 在统计窗口内达到的目标线（如 30 天内 ≥ 99.9%），剩余空间即错误预算。','slo',1],
 ['SLA',3,'服务等级协议：写入商业合同、未达标需承担赔付或履约责任的对外服务承诺。','slo',1],
 ['RPO',3,'恢复点目标：灾难发生时业务最多允许丢失多久以内的数据（决定备份与日志同步频率）。','resilience',1],
 ['RTO',3,'恢复时间目标：故障发生后必须在多长时间内让服务重新对用户可用（决定切换与演练自动化程度）。','resilience',1],
 ['p99',3,'99 分位延迟：把窗口内请求按耗时排序后排在 99% 位置的值；跨实例合并必须合直方图而非平均分位数。','observability',1],
 ['背压',3,'Backpressure：当下游处理不过来时，通过有界队列或拒绝信号让上游减速，防止内存被无界队列撑爆。','concurrency-pools',1],
 ['熔断',3,'下游持续故障时暂时快速失败、停止盲目打满下游，并定期放少量探测请求验证恢复的保护机制。','resilience',1],
 ['限流',3,'限制单位时间内放行的请求或 token 速率，在流量洪峰下守住系统有效吞吐而不雪崩。','elasticity',1],
 ['幂等',3,'同一个逻辑操作无论因超时重发执行一次还是多次，对底层资源产生的最终业务效果完全一致。','distributed-systems',1],
 ['Transformer',4,'现代大语言模型的核心架构，用自注意力横向汇总上下文信息、用前馈网络逐位置加工特征。','transformer-model',1],
 ['tokenizer',4,'分词器：按词表规则把原始字符串切分成离散词元（token）并映射成整数编号。','tokenization-embedding',1],
 ['词表',4,'模型认识的所有离散词元（子词/字符）与整数 ID 的双向对照表，决定嵌入表与输出打分层的行数。','tokenization-embedding',0],
 ['Embedding',4,'嵌入查表层：用词元整数 ID 作为行号，从权重矩阵里取出一行连续浮点数向量送入后续网络。','tokenization-embedding',1],
 ['logit',4,'模型最后一层输出、尚未经过 Softmax 归一化的原始候选词打分（可正可负）。','transformer-model',1],
 ['Attention',4,'注意力机制：当前位置发出查询（Q），与可见位置的键（K）算相关度权重，再按权重汇总对应的值（V）。','attention-mechanics',1],
 ['Softmax',4,'把一组任意实数打分指数化并除以总和，转换成“非负且相加等于 1”的概率分布；实现时先减最大值防溢出。','attention-mechanics',1],
 ['FFN',4,'前馈神经网络层：在注意力跨位置通信之后，对每个位置的向量独立做升维、非线性激活与降维变换。','transformer-block',1],
 ['LayerNorm',4,'层归一化：对单个词元位置的特征向量减均值、除标准差再做仿射缩放，稳定深层训练数值。','transformer-block',1],
 ['RMSNorm',4,'均方根归一化：省略减均值步骤、只按均方根缩放特征向量，计算更省，广泛用于现代大模型。','transformer-block',1],
 ['RoPE',4,'旋转位置编码：按词元位置角度成对旋转 Q 和 K 的分量，使点积自然只依赖两词元的相对距离。','position-encoding',1],
 ['SwiGLU',4,'现代大模型常用的门控前馈层变体，用一条 SiLU 激活分支门控另一条线性投影分支后再降维。','transformer-block',1],
 ['GQA',4,'分组查询注意力：让多个查询头（Q）共享同一组键头（K）和值头（V），显著压缩推理时的 KV Cache 显存。','model-serving',1],
 ['梯度',4,'损失函数对每个参数的偏导数，指示“参数往哪个方向微调能让预测误差变小”。','autograd-training',0],
 ['CUDA',5,'NVIDIA GPU 的并行计算平台与编程模型，负责组织核函数（kernel）在成千上万线程上运行。','gpu-execution',1],
 ['SM',5,'Streaming Multiprocessor（流多处理器），GPU 芯片上的核心执行单元块，负责调度和运行线程束。','gpu-execution',1],
 ['warp',5,'GPU 硬件调度的基本单位，通常由 32 条锁步执行的线程组成；连续对齐访存才能合并成最少内存事务。','gpu-execution',1],
 ['HBM',5,'高带宽显存（GPU 主显存）：容量大、总带宽极高，但相比片上 SRAM 每次读写延迟和能耗更高。','gpu-execution',1],
 ['Roofline',5,'屋顶线性能模型：用“算术强度（每搬运 1 字节能做多少次运算）”判断算子是卡在显存带宽还是卡在计算峰值。','roofline-model',1],
 ['FlashAttention',5,'不把巨大的 N×N 注意力矩阵写回高带宽显存，而是在片上高速缓存分块在线维护最大值与分母的精确注意力算法。','flash-attention-io',1],
 ['NVLink',5,'GPU 之间的高速专用直连通道，单机多卡集合通信带宽远高于普通主板 PCIe 总线。','gpu-execution',1],
 ['RoCE',5,'基于融合以太网的 RDMA 技术，允许跨机网卡绕过内核协议栈直接读写远端内存以降低多机训练通信延迟。','training-communication',1],
 ['rank',5,'分布式通信组内每个工作进程的唯一整数编号（0 到 world_size−1），决定它读哪片数据或管哪片参数。','ddp-code',0],
 ['DDP',5,'分布式数据并行：每张卡持有一份完整模型副本、各读不同数据切片，反向传播时用 AllReduce 平均梯度。','distributed-training',1],
 ['FSDP',5,'完全分片数据并行（对应 ZeRO-3 思想）：把参数、梯度和优化器状态切分到各卡，计算某层前临时收齐、算完即释放。','distributed-training',1],
 ['ZeRO',5,'零冗余优化器：消除数据并行中各卡重复保存的优化器状态（ZeRO-1）、梯度（ZeRO-2）与参数（ZeRO-3）显存。','distributed-training',1],
 ['TP',5,'张量并行：把同一层的大矩阵按列或按行切到多张卡上协同相乘，适合高带宽的机内 NVLink 互联。','tensor-parallel-math',1],
 ['PP',5,'流水线并行：把深层模型按层切分成多个阶段放到不同卡上，用微批次（microbatch）交替填充流水线减少气泡。','tensor-parallel-math',1],
 ['MoE',5,'混合专家模型：每层准备多个专家前馈网络，每个词元经路由器打分后只激活其中少数几个专家计算。','moe-routing',1],
 ['NCCL',5,'NVIDIA 集合通信库，针对机内 NVLink 与跨机高速网络优化多 GPU 的 AllReduce、AllGather 等通信原语。','training-communication',1],
 ['Gloo',5,'PyTorch 内置的跨平台集合通信后端，无需 GPU 即可在 CPU 多进程上实跑和验证分布式训练协议。','ddp-code',1],
 ['AllReduce',5,'集合通信原语：把所有进程对应位置的张量求和（或取平均），再让每个进程都拿到同一份完整结果。','training-communication',1],
 ['ReduceScatter',5,'集合通信原语：先把各卡张量对应求和，再按卡切分，使每张卡只保留归约结果中的自己那一片。','training-communication',1],
 ['AllGather',5,'集合通信原语：每张卡贡献自己手头的一小片张量，通信结束后每张卡都拼出完整张量（常用于 FSDP 前向聚参）。','training-communication',1],
 ['FP32',5,'32 位单精度浮点数（每元素 4 字节），常用于主权重与优化器动量累加，数值范围和尾数精度充足。','gpu-memory',1],
 ['FP16',5,'16 位半精度浮点数（每元素 2 字节），算得快省显存但动态范围窄，训练时需配合损失缩放器防下溢/上溢。','gpu-memory',1],
 ['BF16',5,'Brain Float 16（每元素 2 字节），指数位与 FP32 一样宽，不易溢出，现代 GPU 训练常直接替代 FP16。','gpu-memory',1],
 ['scaler',5,'GradScaler（梯度缩放器）：FP16 训练中先放大损失防梯度下溢，更新前反缩放并在出现 Inf/NaN 时安全跳过本步。','gpu-memory',1],
 ['DCP',5,'PyTorch Distributed Checkpoint：各 rank 并行读写分片检查点目录，并支持改变卡数或并行拓扑后重映射恢复。','checkpoint-recovery',1],
 ['Prefill',6,'预填充阶段：推理服务一次性并行处理用户输入的全部提示词，算出首个输出词并填好初始 KV Cache（偏算力密集）。','model-serving',1],
 ['Decode',6,'自回归解码阶段：每次只送入刚生成的 1 个词元，读取整段历史 KV Cache 逐词往后生成（偏显存带宽受限）。','model-serving',1],
 ['KV Cache',6,'键值缓存：推理时把历史词元在各层算好的 K 和 V 张量留在显存复用，避免每吐一个新词都重算整段前文。','model-serving',1],
 ['PagedAttention',6,'借鉴操作系统虚拟内存分页，把请求的 KV Cache 切成固定大小的块按需分配，消除连续显存预留碎片。','inference-performance',1],
 ['TTFT',6,'Time To First Token（首词元延迟）：从发出请求到收到第一个生成词元的耗时，含排队等待与 Prefill 计算。','inference-performance',1],
 ['TPOT',6,'Time Per Output Token：首个词元之后，每继续吐出一个后续词元的平均时间间隔，直接决定肉眼打字流畅度。','inference-performance',1],
 ['INT8',6,'8 位整数量化表示（每元素 1 字节），通过缩放因子把浮点权重或激活压缩一半以上以提升容量与带宽利用率。','quantization-serving',1],
 ['INT4',6,'4 位整数量化表示（每两元素打包占 1 字节），在可控精度损失下把大模型权重显存压缩至 FP16 的约四分之一。','quantization-serving',1],
 ['Agent',7,'智能体系统：在明确的任务边界内，由模型提议下一步、由受控运行时验权调工具并核对真实产物的执行闭环。','agent-runtime',0],
 ['MCP',7,'Model Context Protocol（模型上下文协议）：统一规定宿主应用怎样向工具服务端发现、验权并调用工具或读取资源。','mcp-protocol',1],
 ['schema',7,'结构契约（如 JSON Schema）：校验工具入参字段名和类型是否合法；注意格式合法绝不等于业务上有权限执行。','mcp-protocol',1],
 ['沙箱',7,'Sandbox：通过容器、微虚拟机、系统调用过滤与网络白名单隔离不可信代码或工具进程，限制失陷爆炸半径。','agent-sandbox',1],
 ['inbox',7,'接收端去重表：工具服务端在执行业务写入的同一事务里记下已处理的 operation_id，重试重发直接返回原回执。','agent-recovery',1],
 ['outbox',7,'事务发件箱：先把“业务状态变更”和“待发事件”写进同一本地事务，再由后台可靠投递，防止改了库却丢了通知。','message-delivery',1],
 ['fencing',7,'栅栏隔离令牌（Fencing Token）：每次换新执行者递增代际号，存储端拒绝任何携带旧代际号的僵尸进程滞后写入。','durable-workflows',1],
 ['租约',7,'Lease：带过期时间的执行所有权约定；注意发送端时钟以为租约未过期不代表远端没发生停顿，仍需接收方 fencing。','durable-workflows',0],
 ['RAG',7,'检索增强生成：先按问题检索获准且当前有效的外部资料片段放进上下文，再让模型基于证据作答并附上引用。','agent-retrieval',1],
 ['BM25',7,'经典词面相关性打分算法，综合词频、逆文档稀有度与文档长度归一化，擅长精确匹配专有名词、报错码与编号。','agent-retrieval',1],
 ['RRF',7,'倒数排名融合（Reciprocal Rank Fusion）：不直接相加不同量纲的分数，而是按多路检索各自的名次合并候选集。','agent-retrieval',1],
 ['nDCG',7,'归一化折损累计增益：评估检索排序质量的指标，高相关文档排在越靠前得分越高。','agent-retrieval',1],
 ['trace',7,'分布式追踪：用同一个 trace_id 把一次用户请求或 Agent 任务跨网关、模型和多个工具的完整调用树串起来。','agent-observability',0],
 ['span',7,'追踪跨度：一条 trace 里的单个工作片段（如一次模型调用或一次数据库写入），记录起止时间、父子关系与属性。','agent-observability',0],
 ['SSE',7,'Server-Sent Events：基于单向 HTTP 长连接按行推送文本事件流的标准协议，常用于流式返回大模型词元与进度。','agent-runtime',1]
];
const beginnerGlossaryMap=new Map(beginnerGlossary.map(([term,cat,def,ch,inline])=>[term,{term,cat,category:beginnerGlossaryCategories[cat],def,ch,inline}]));
const inlineGlossaryTerms=beginnerGlossary.filter(x=>x[4]).map(x=>x[0]).sort((a,b)=>b.length-a.length);
const inlineGlossaryRegex=new RegExp(inlineGlossaryTerms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');

let activeGlossaryDialog=null,activeGlossaryPopover=null,activeGlossaryAnchor=null;
function closeGlossaryPopover(){
 if(activeGlossaryPopover){activeGlossaryPopover.remove();activeGlossaryPopover=null;activeGlossaryAnchor=null;}
}
function positionGlossaryPopover(){
 if(!activeGlossaryPopover||!activeGlossaryAnchor||!activeGlossaryAnchor.isConnected)return closeGlossaryPopover();
 const rect=activeGlossaryAnchor.getBoundingClientRect();
 if(rect.bottom<-20||rect.top>window.innerHeight+20)return closeGlossaryPopover();
 const pRect=activeGlossaryPopover.getBoundingClientRect();
 const left=Math.min(window.innerWidth-pRect.width-12,Math.max(12,rect.left+(rect.width-pRect.width)/2));
 const below=rect.bottom+8+pRect.height<=window.innerHeight-8;
 const top=below?rect.bottom+8:Math.max(12,rect.top-pRect.height-8);
 activeGlossaryPopover.style.left=Math.round(left)+'px';
 activeGlossaryPopover.style.top=Math.round(top)+'px';
}
function openGlossaryDialog(initialQuery=''){
 closeGlossaryPopover();
 if(!activeGlossaryDialog){
  const dlg=document.createElement('dialog');
  dlg.className='reader-dialog glossary-dialog';
  dlg.setAttribute('aria-labelledby','glossary-dialog-title');
  dlg.innerHTML='<div class="reader-dialog-head"><h2 id="glossary-dialog-title">基础设施白话术语词典（'+beginnerGlossary.length+' 词）</h2><button type="button" data-glossary-close aria-label="关闭词典">关闭 ×</button></div>'+
   '<div class="glossary-dialog-controls"><input type="search" class="glossary-dialog-search" placeholder="输入缩写或概念，如 KV Cache、Pod、幂等、AllReduce…" aria-label="搜索术语"><div class="glossary-cats" role="tablist" aria-label="按技术领域筛选术语"><button type="button" class="active" data-glossary-cat="all">全部 ('+beginnerGlossary.length+')</button>'+
   beginnerGlossaryCategories.map((c,i)=>'<button type="button" data-glossary-cat="'+i+'">'+escapeHTML(c)+'</button>').join('')+'</div></div>'+
   '<div class="glossary-list" aria-live="polite"></div>';
  const input=dlg.querySelector('.glossary-dialog-search'),list=dlg.querySelector('.glossary-list');
  let currentCat='all';
  function render(){
   const q=input.value.trim().toLowerCase();
   const rows=beginnerGlossary.filter(([term,cat,def])=>(currentCat==='all'||String(cat)===currentCat)&&(!q||term.toLowerCase().includes(q)||def.toLowerCase().includes(q)||beginnerGlossaryCategories[cat].toLowerCase().includes(q)));
   if(!rows.length){list.innerHTML='<div class="glossary-empty">没有找到匹配“'+escapeHTML(input.value.trim())+'”的术语，试试缩短关键词或用全站搜索（⌘K / Ctrl+K）。</div>';return;}
   list.innerHTML=rows.map(([term,cat,def,ch])=>{
    const meta=typeof articleById==='function'?articleById(ch):null;
    const chLabel=meta?meta.number+' '+meta.title:ch;
    return '<article class="glossary-card"><div class="glossary-card-top"><strong>'+escapeHTML(term)+'</strong><span class="glossary-cat-pill">'+escapeHTML(beginnerGlossaryCategories[cat])+'</span></div><p>'+escapeHTML(def)+'</p><a href="'+escapeHTML(hostedPath('/article/'+ch+'/'))+'">深入讲解：'+escapeHTML(chLabel)+' →</a></article>';
   }).join('');
  }
  input.addEventListener('input',render);
  dlg.querySelector('.glossary-cats').addEventListener('click',e=>{
   const btn=e.target.closest('[data-glossary-cat]');
   if(!btn)return;
   currentCat=btn.dataset.glossaryCat;
   dlg.querySelectorAll('[data-glossary-cat]').forEach(b=>b.classList.toggle('active',b===btn));
   render();
  });
  const close=()=>{dlg.close();if(!document.querySelector('dialog.reader-dialog[open]'))document.body.classList.remove('reader-modal-open');};
  dlg.querySelector('[data-glossary-close]').addEventListener('click',close);
  dlg.addEventListener('close',()=>{if(!document.querySelector('dialog.reader-dialog[open]'))document.body.classList.remove('reader-modal-open');});
  dlg.addEventListener('click',e=>{if(e.target===dlg){const box=dlg.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)close();}});
  dlg._renderWith=q=>{currentCat='all';dlg.querySelectorAll('[data-glossary-cat]').forEach(b=>b.classList.toggle('active',b.dataset.glossaryCat==='all'));input.value=q||'';render();};
  document.body.appendChild(dlg);
  activeGlossaryDialog=dlg;
 }
 activeGlossaryDialog._renderWith(initialQuery);
 document.body.classList.add('reader-modal-open');
 if(!activeGlossaryDialog.open)activeGlossaryDialog.showModal();
 activeGlossaryDialog.querySelector('.glossary-dialog-search')?.focus({preventScroll:true});
}

function showGlossaryPopover(anchorEl,entry){
 closeGlossaryPopover();
 const pop=document.createElement('div');
 pop.className='glossary-popover';
 pop.setAttribute('role','dialog');
 pop.setAttribute('aria-label',entry.term+' 术语解释');
 const meta=typeof articleById==='function'?articleById(entry.ch):null;
 const chLabel=meta?meta.number+' '+(typeof chapterDirectoryTitle==='function'?chapterDirectoryTitle(meta):meta.title):entry.ch;
 pop.innerHTML='<div class="glossary-pop-head"><div><strong>'+escapeHTML(entry.term)+'</strong><span class="glossary-cat-pill">'+escapeHTML(entry.category)+'</span></div><button type="button" class="glossary-pop-close" aria-label="关闭解释">×</button></div>'+
  '<p>'+escapeHTML(entry.def)+'</p>'+
  '<div class="glossary-pop-foot"><a href="'+escapeHTML(hostedPath('/article/'+entry.ch+'/'))+'">对应章节：'+escapeHTML(chLabel)+' →</a><button type="button" data-pop-all>全部词典 ↗</button></div>';
 document.body.appendChild(pop);
 activeGlossaryPopover=pop;
 activeGlossaryAnchor=anchorEl;
 positionGlossaryPopover();
 pop.querySelector('.glossary-pop-close').addEventListener('click',closeGlossaryPopover);
 pop.querySelector('[data-pop-all]').addEventListener('click',()=>openGlossaryDialog(entry.term));
}

function initInlineGlossary(article,signal){
 const skipSelector='pre,code,a,button,summary,figure,table,h1,h2,h3,h4,h5,h6,.glossary-term,.first-concept-term,.interactive,.position-lab,.callout>strong';
 const seen=new Set();
 const blocks=article.querySelectorAll('.article-section > p, .article-section > ul > li, .article-section > ol > li');
 for(const block of blocks){
  if(seen.size>=20)break;
  const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
  const textNodes=[];
  let node;
  while((node=walker.nextNode())){
   if(node.nodeValue&&node.nodeValue.length>=2&&!node.parentElement?.closest(skipSelector))textNodes.push(node);
  }
  for(const textNode of textNodes){
   if(seen.size>=20)break;
   const raw=textNode.nodeValue;
   inlineGlossaryRegex.lastIndex=0;
   let match,cursor=0,frag=null;
   while((match=inlineGlossaryRegex.exec(raw))!==null){
    const term=match[0],at=match.index;
    if(seen.has(term)||seen.size>=20)continue;
    const before=raw.slice(0,at),after=raw.slice(at+term.length);
    if(/[A-Za-z0-9_]/.test(term[0])&&/[A-Za-z0-9_.-]$/.test(before))continue;
    if(/[A-Za-z0-9_]/.test(term[term.length-1])&&/^[A-Za-z0-9_.-]/.test(after))continue;
    if(/[\u3400-\u9fff]/.test(term)&&/^[\u3400-\u9fff]/.test(after)&&!/^(?:是|指|与|和|或|的|在|中|下|后|前|时|把|会|让|可|能)/.test(after))continue;
    seen.add(term);
    if(!frag)frag=document.createDocumentFragment();
    if(at>cursor)frag.appendChild(document.createTextNode(raw.slice(cursor,at)));
    const span=document.createElement('span');
    span.className='glossary-term';
    span.tabIndex=0;
    span.setAttribute('role','button');
    span.dataset.glossaryTerm=term;
    span.textContent=term;
    frag.appendChild(span);
    cursor=at+term.length;
   }
   if(frag){
    if(cursor<raw.length)frag.appendChild(document.createTextNode(raw.slice(cursor)));
    textNode.replaceWith(frag);
   }
  }
 }
 article.addEventListener('click',e=>{
  const el=e.target.closest('.glossary-term');
  if(!el)return;
  e.stopPropagation();
  const entry=beginnerGlossaryMap.get(el.dataset.glossaryTerm);
  if(entry)showGlossaryPopover(el,entry);
 },{signal});
 article.addEventListener('keydown',e=>{
  if(e.key!=='Enter'&&e.key!==' ')return;
  const el=e.target.closest?.('.glossary-term');
  if(!el)return;
  e.preventDefault();
  const entry=beginnerGlossaryMap.get(el.dataset.glossaryTerm);
  if(entry)showGlossaryPopover(el,entry);
 },{signal});
 document.addEventListener('click',e=>{
  if(activeGlossaryPopover&&!activeGlossaryPopover.contains(e.target)&&!e.target.closest?.('.glossary-term'))closeGlossaryPopover();
 },{signal});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeGlossaryPopover();},{signal});
 window.addEventListener('scroll',()=>{if(activeGlossaryPopover)positionGlossaryPopover();},{passive:true,signal});
 window.addEventListener('resize',()=>{if(activeGlossaryPopover)positionGlossaryPopover();},{passive:true,signal});
 signal.addEventListener('abort',closeGlossaryPopover,{once:true});
}

function readingMinutes(text){const han=(text.match(/[\u3400-\u9fff]/g)||[]).length,words=(text.replace(/[\u3400-\u9fff]/g,' ').match(/[A-Za-z0-9_]+/g)||[]).length;return han/350+words/180;}
// Last section and completion per chapter, kept in this browser only; entries older than 60 days are ignored.
function readingResumeStore(){const value=readStore('infraguide-reading-position',{});return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function canonicalChapterFromPath(pathname){
 const clean=String(pathname||'').replace(/^\/infra-guide(?=\/)/,'');
 const m=clean.match(/^\/article\/([a-z0-9-]+)\/?$/);
 if(m)return m[1];
 const t=clean.match(/^\/track\/(cloud|ai|agent)\/?$/);
 return t&&typeof trackDefinitions!=='undefined'?trackDefinitions[t[1]]?.start||'':'';
}
function saveChapterReadingState(key,patch){
 const next=readingResumeStore(),prev=next[key]&&typeof next[key]==='object'?next[key]:{};
 next[key]={...prev,...patch,done:Boolean(prev.done||patch.done),at:Date.now()};
 const keys=Object.keys(next);if(keys.length>120)keys.sort((a,b)=>(next[a].at||0)-(next[b].at||0)).slice(0,keys.length-120).forEach(k=>delete next[k]);
 writeStore('infraguide-reading-position',next);
}
function initReadingProgress(article,toolbar,signal){
 const bar=document.createElement('span');bar.className='reading-progress';bar.setAttribute('aria-hidden','true');
 const remaining=document.createElement('span');remaining.className='reading-remaining';
 toolbar.appendChild(bar);toolbar.querySelector('.reading-display')?.prepend(remaining);
 // Count prose a reader actually meets: skip code listings and folded optional material.
 const prose=[...article.querySelectorAll('h1,h2,h3,h4,p,li,th,td,figcaption,blockquote')].filter(el=>!el.closest('pre,details:not([open]),.reading-toolbar,.chapter-compass,li li,blockquote p,td p')).map(el=>el.textContent).join(' ');
 const total=Math.max(1,Math.round(readingMinutes(prose)));
 const key=location.pathname,chapterId=canonicalChapterFromPath(documentPathname());
 let shown='',markedDone=Boolean(readingResumeStore()[key]?.done);
 signal.addEventListener('abort',()=>{bar.remove();remaining.remove();},{once:true});
 return function update(){
  // 0 at the page position where the chapter first fills the screen, 1 when its end reaches the bottom edge.
  const box=article.getBoundingClientRect(),top=box.top+window.scrollY,start=Math.max(0,top-window.innerHeight),end=Math.max(start+1,top+box.height-window.innerHeight);
  const ratio=Math.min(1,Math.max(0,(window.scrollY-start)/(end-start)));
  bar.style.transform='scaleX('+ratio.toFixed(4)+')';
  const left=Math.max(1,Math.ceil(total*(1-ratio)));
  const text=ratio>=0.98?'已读完':ratio<0.02?'约 '+total+' 分钟':'剩余约 '+left+' 分钟';
  if(text!==shown){shown=text;remaining.textContent=text;remaining.title='按正文字数估算，全文约 '+total+' 分钟';}
  if(ratio>=0.98&&!markedDone&&window.scrollY>0){markedDone=true;saveChapterReadingState(key,{chapter:chapterId,done:true});}
 };
}
function initReadingResume(toolbar,sections,signal){
 const key=location.pathname,store=readingResumeStore(),saved=store[key];
 const chapterId=canonicalChapterFromPath(documentPathname());
 const fresh=saved&&typeof saved.id==='string'&&Date.now()-Number(saved.at||0)<60*864e5;
 const target=fresh&&!location.hash&&sections.find(section=>section.id===saved.id);
 if(target&&target!==sections[0]&&!target.closest('details:not([open])')){
  const heading=target.matches('h3,h4')?target:target.querySelector('h2,summary');
  const note=document.createElement('p');note.className='reader-resume';
  const go=document.createElement('a');go.href=location.pathname+location.search+'#'+target.id;
  go.textContent='继续上次阅读：'+(heading?.textContent||'').trim().replace(/^(\d{2})(?=\D)/,'$1 · ')+' ↓';
  const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','不再提示上次位置');close.textContent='×';
  note.append(go,close);toolbar.after(note);
  go.addEventListener('click',event=>{event.preventDefault();history.pushState(null,'',go.getAttribute('href'));note.remove();target.scrollIntoView({behavior:'instant',block:'start'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true});},{signal});
  close.addEventListener('click',()=>note.remove(),{signal});
  signal.addEventListener('abort',()=>note.remove(),{once:true});
 }
 let last=fresh?saved.id:'';
 return function remember(active){
  if(!active||active===last)return;last=active;
  const sec=sections.find(s=>s.id===active),heading=sec&&(sec.matches('h3,h4')?sec:sec.querySelector('h2,summary'));
  const label=(heading?.textContent||'').trim().replace(/^(\d{2})(?=\D)/,'$1 · ');
  saveChapterReadingState(key,{id:active,label,chapter:chapterId});
 };
}

function initChapterCompass(article,toolbar,signal){
 const chapterId=canonicalChapterFromPath(documentPathname());
 if(!chapterId||!toolbar)return;
 const meta=typeof articleById==='function'?articleById(chapterId):null;
 const ctx=meta&&typeof chapterReadingContext==='function'?chapterReadingContext(meta):null;
 const trackLabel=(ctx&&typeof trackDefinitions!=='undefined'&&trackDefinitions[ctx.track]?.label)||'综合实战';
 let stageText='';
 if(ctx&&typeof courseReadingStages!=='undefined'&&courseReadingStages[ctx.track]){
  const stages=courseReadingStages[ctx.track];
  const sIdx=stages.findIndex(s=>s[1].includes(chapterId));
  if(sIdx>=0){
   const pos=stages[sIdx][1].indexOf(chapterId)+1;
   stageText='第 '+(sIdx+1)+'/'+stages.length+' 阶段：'+stages[sIdx][0]+'（'+pos+'/'+stages[sIdx][1].length+'）';
  }
 }
 const priority=defaultChapterPriorityLabel(chapterId);
 const spaceCjk=s=>s.replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g,'$1 $2').replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g,'$1 $2');
 const steps=[...article.querySelectorAll('#concept-path .concept-step')].slice(0,3).map((el,i)=>{
  const rawTitle=spaceCjk((el.querySelector('h3')?.textContent||'').replace(/^\s*\d+\s*/,'').trim());
  const body=spaceCjk((el.querySelector('p')?.textContent||'').trim());
  return {no:'0'+(i+1),title:rawTitle,body};
 }).filter(s=>s.title&&s.body);
 const causalLinks=[];
 for(const p of article.querySelectorAll('.chapter-connection > p')){
  const kind=(p.querySelector('b')?.textContent||'').trim();
  const link=p.querySelector('a[href]');
  if(kind&&link)causalLinks.push('<span><b>'+escapeHTML(kind)+'</b><a href="'+escapeHTML(link.getAttribute('href'))+'">'+escapeHTML(link.textContent.trim())+'</a></span>');
 }
 if(!steps.length&&!stageText)return;
 const doneSet=collectChapterStatus().done;
 const storedPref=readStore('infraguide-compass-collapsed',null);
 const startCollapsed=storedPref===true||(storedPref===null&&(doneSet.has(chapterId)||window.innerWidth<=650));
 const compass=document.createElement('section');
 compass.className='chapter-compass'+(startCollapsed?' is-collapsed':'');
 compass.setAttribute('aria-label','本章知识脉络与三步直觉导读');
 compass.innerHTML='<div class="compass-bar"><div class="compass-loc"><span class="compass-track">'+escapeHTML(trackLabel)+'</span>'+(stageText?'<span>'+escapeHTML(stageText)+'</span>':'')+'<span class="compass-priority">'+escapeHTML(priority)+'</span></div><button type="button" class="compass-fold-btn" data-compass-fold aria-expanded="'+(!startCollapsed)+'">'+(startCollapsed?'展开 30 秒导读 ▾':'收起导读 ▴')+'</button></div>'+
  '<div class="compass-body">'+(steps.length?'<p class="compass-kicker">读正文前，用 30 秒抓住本章三个核心直觉：</p><div class="compass-steps">'+steps.map(s=>'<div class="compass-step"><strong><span>'+s.no+'</span>'+escapeHTML(s.title)+'</strong><p>'+escapeHTML(s.body)+'</p></div>').join('')+'</div>':'')+
  (causalLinks.length?'<div class="compass-links">'+causalLinks.join('')+'</div>':'')+'</div>';
 const insertAfter=article.querySelector(':scope > .reader-resume')||toolbar;
 insertAfter.after(compass);

 const left=ensureToolbarLeftGroup(toolbar);
 const tbBtn=document.createElement('button');
 tbBtn.type='button';
 tbBtn.className='reader-companion-pill reader-compass-toggle';
 tbBtn.dataset.compassToggle='1';
 const foldBtn=compass.querySelector('[data-compass-fold]');
 function syncCompassUI(collapsed){
  compass.classList.toggle('is-collapsed',collapsed);
  foldBtn.setAttribute('aria-expanded',String(!collapsed));
  foldBtn.textContent=collapsed?'展开 30 秒导读 ▾':'收起导读 ▴';
  tbBtn.setAttribute('aria-pressed',String(!collapsed));
  tbBtn.textContent=collapsed?'脉络导读 ▾':'脉络导读';
 }
 syncCompassUI(startCollapsed);
 function toggleCompass(){
  const next=!compass.classList.contains('is-collapsed');
  syncCompassUI(next);
  writeStore('infraguide-compass-collapsed',next);
 }
 foldBtn.addEventListener('click',toggleCompass,{signal});
 tbBtn.addEventListener('click',()=>{
  if(compass.classList.contains('is-collapsed')){syncCompassUI(false);writeStore('infraguide-compass-collapsed',false);compass.scrollIntoView({behavior:'smooth',block:'nearest'});}
  else toggleCompass();
 },{signal});
 left.appendChild(tbBtn);
 signal.addEventListener('abort',()=>{compass.remove();tbBtn.remove();},{once:true});
}

function initChapterCompanionTools(article,toolbar,signal){
 const chapterId=canonicalChapterFromPath(documentPathname());
 const display=toolbar?.querySelector('.reading-display');
 if(!chapterId||!display)return;
 const left=ensureToolbarLeftGroup(toolbar);
 const scene=chapterAnimatedScenes[chapterId];
 const labs=article.querySelector('#chapter-experiments');
 const added=[];
 if(scene){
  const a=document.createElement('a');
  a.className='reader-companion-pill';
  a.href=hostedPath('/courses/?scene='+scene);
  a.textContent='动画 '+scene+' ↗';
  a.title='打开本章配套 16:9 动画图解（'+scene+'）';
  left.appendChild(a);
  added.push(a);
 }
 if(labs){
  const count=labs.querySelectorAll('li').length;
  const btn=document.createElement('a');
  btn.className='reader-companion-pill reader-lab-pill';
  btn.href=location.pathname+location.search+'#chapter-experiments';
  btn.textContent='实验'+(count?' · '+count:'')+' ↓';
  btn.title='跳到本章可复现实验与记录';
  btn.addEventListener('click',event=>{event.preventDefault();labs.open=true;history.pushState(null,'',btn.getAttribute('href'));labs.scrollIntoView({behavior:'instant',block:'start'});},{signal});
  left.appendChild(btn);
  added.push(btn);
 }
 const glossaryBtn=document.createElement('button');
 glossaryBtn.type='button';
 glossaryBtn.dataset.openGlossary='1';
 glossaryBtn.title='打开基础设施白话术语词典';
 glossaryBtn.textContent='术语';
 glossaryBtn.addEventListener('click',()=>openGlossaryDialog(''),{signal});
 display.querySelector('[data-reader-large]')?.before(glossaryBtn);
 added.push(glossaryBtn);

 signal.addEventListener('abort',()=>added.forEach(p=>p.remove()),{once:true});
 // Enrich bottom continuation cards with estimated reading minutes & completion state.
 const doneSet=collectChapterStatus().done;
 for(const link of article.querySelectorAll('.article-nav a[href*="/article/"], .goal-reading-nav a[href*="/article/"]')){
  const nextId=new URL(link.href,location.href).pathname.match(/\/article\/([a-z0-9-]+)\/?$/)?.[1];
  const mins=nextId&&chapterReadingMinutes[nextId];
  if(!mins)continue;
  const small=link.querySelector('small');
  if(small&&!small.dataset.timed){
   small.dataset.timed='1';
   const dir=link.dataset.readingDirection;
   const status=doneSet.has(nextId)?' · ✓ 已读':'';
   small.textContent=dir==='next'?'下一篇 · 约 '+mins+' 分钟'+status+' →':'← 上一篇 · 约 '+mins+' 分钟'+status;
  }else if(!small&&!link.dataset.timed&&link.textContent.includes('下一章')){
   link.dataset.timed='1';
   link.textContent=link.textContent.replace(/\s*→$/,'（约 '+mins+' 分钟） →');
  }
 }
}
function collectChapterStatus(){
 const manual=readStore('cloudinfra-progress',{}),positions=readingResumeStore();
 const done=new Set(),inProgress=new Map();
 let latest=null;
 if(manual&&typeof manual==='object')for(const [k,v] of Object.entries(manual))if(v)done.add(k);
 const cutoff=Date.now()-60*864e5;
 for(const [pathKey,entry] of Object.entries(positions)){
  if(!entry||typeof entry!=='object'||Number(entry.at||0)<cutoff)continue;
  const id=entry.chapter||canonicalChapterFromPath(pathKey);
  if(!id)continue;
  if(entry.done)done.add(id);
  else if(entry.id&&entry.id!=='section-1'&&!done.has(id))inProgress.set(id,entry);
  if(entry.id&&(!latest||Number(entry.at||0)>Number(latest.at||0)))latest={id,path:pathKey,section:entry.id,label:entry.label||'',at:entry.at,done:Boolean(entry.done)};
 }
 for(const id of done)inProgress.delete(id);
 return {done,inProgress,latest};
}

function initHomeInteractive(signal){
 const panorama=document.querySelector('.request-panorama');
 if(panorama&&typeof homeRequestHops!=='undefined'&&Array.isArray(homeRequestHops)){
  const tabs=[...panorama.querySelectorAll('[data-hop-index]')];
  const domainEl=panorama.querySelector('[data-hop-domain]'),titleEl=panorama.querySelector('[data-hop-title]');
  const whatEl=panorama.querySelector('[data-hop-what]'),flowEl=panorama.querySelector('[data-hop-flow]'),riskEl=panorama.querySelector('[data-hop-risk]');
  const sceneLink=panorama.querySelector('[data-hop-scene]'),chapterLink=panorama.querySelector('[data-hop-chapter]');
  const prevBtn=panorama.querySelector('[data-hop-prev]'),nextBtn=panorama.querySelector('[data-hop-next]');
  let idx=0;
  function selectHop(nextIdx,focusTab=false){
   idx=Math.max(0,Math.min(homeRequestHops.length-1,nextIdx));
   const h=homeRequestHops[idx];
   tabs.forEach((btn,i)=>{btn.classList.toggle('active',i===idx);btn.setAttribute('aria-selected',String(i===idx));if(focusTab&&i===idx)btn.focus({preventScroll:true});});
   if(domainEl){domainEl.className='panorama-badge tag-'+h.tag;domainEl.textContent=h.no+' · '+h.domain;}
   if(titleEl)titleEl.textContent=h.title;
   if(whatEl)whatEl.textContent=h.what;
   if(flowEl)flowEl.textContent=h.flow;
   if(riskEl)riskEl.textContent=h.risk;
   if(sceneLink){sceneLink.href=hostedPath('/courses/?scene='+h.scene);sceneLink.textContent='看 3 分钟动画图解（'+h.scene+'） ↗';}
   if(chapterLink){chapterLink.href=hostedPath('/article/'+h.chapter+'/');chapterLink.textContent='读对应入门章：'+h.chapterLabel+' →';}
   if(prevBtn)prevBtn.disabled=idx===0;
   if(nextBtn)nextBtn.disabled=idx===homeRequestHops.length-1;
  }
  tabs.forEach(btn=>btn.addEventListener('click',()=>selectHop(Number(btn.dataset.hopIndex)),{signal}));
  panorama.querySelector('.panorama-rail')?.addEventListener('keydown',e=>{
   if(e.key==='ArrowRight'){e.preventDefault();selectHop((idx+1)%homeRequestHops.length,true);}
   else if(e.key==='ArrowLeft'){e.preventDefault();selectHop((idx-1+homeRequestHops.length)%homeRequestHops.length,true);}
  },{signal});
  prevBtn?.addEventListener('click',()=>selectHop(idx-1),{signal});
  nextBtn?.addEventListener('click',()=>selectHop(idx+1),{signal});
 }
 const finder=document.querySelector('.persona-finder');
 if(finder){
  const pTabs=[...finder.querySelectorAll('[data-persona-tab]')];
  const panels=[...finder.querySelectorAll('[data-persona-panel]')];
  function selectPersona(id,focusTab=false){
   pTabs.forEach(t=>{const on=t.dataset.personaTab===id;t.classList.toggle('active',on);t.setAttribute('aria-selected',String(on));if(focusTab&&on)t.focus({preventScroll:true});});
   panels.forEach(p=>{p.hidden=p.dataset.personaPanel!==id;});
  }
  pTabs.forEach(t=>t.addEventListener('click',()=>selectPersona(t.dataset.personaTab),{signal}));
  finder.querySelector('.persona-tabs')?.addEventListener('keydown',e=>{
   if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;
   e.preventDefault();
   const cur=Math.max(0,pTabs.findIndex(t=>t.classList.contains('active')));
   const next=e.key==='ArrowRight'?(cur+1)%pTabs.length:(cur-1+pTabs.length)%pTabs.length;
   selectPersona(pTabs[next].dataset.personaTab,true);
  },{signal});
 }
}

function initOutlineControls(signal){
 const firstTree=document.getElementById('outline-cloud');
 if(!firstTree)return;
 const allChapters=[...document.querySelectorAll('#full-outline .outline-chapter')];
 const detailsList=[...document.querySelectorAll('#full-outline details[data-directory-module]')];
 if(!allChapters.length)return;
 const getPrio=link=>(link.querySelector('.chapter-priority')?.textContent||'').trim();
 const basicCount=allChapters.filter(l=>getPrio(l)==='基础必修').length;
 const spineCount=allChapters.filter(l=>{const p=getPrio(l);return p==='基础必修'||p==='岗位重点';}).length;
 const deepCount=allChapters.filter(l=>getPrio(l)==='专题深入').length;

 const bar=document.createElement('div');
 bar.className='outline-controls';
 bar.setAttribute('role','region');
 bar.setAttribute('aria-label','大纲优先级筛选与快速检索');
 bar.innerHTML='<div class="outline-filter-pills" role="group" aria-label="按阅读优先级筛选">'+
  '<button type="button" class="active" data-outline-filter="all">全部 ('+allChapters.length+')</button>'+
  '<button type="button" data-outline-filter="basic">新手必读 · 基础必修 ('+basicCount+')</button>'+
  '<button type="button" data-outline-filter="spine">核心主干 ('+spineCount+')</button>'+
  '<button type="button" data-outline-filter="deep">专题深入 ('+deepCount+')</button></div>'+
  '<div class="outline-tools-right"><input type="search" class="outline-search" placeholder="搜章节或编号（如 KV Cache）…" aria-label="按关键词筛选大纲章节"><button type="button" data-outline-expand>展开全部模块</button><button type="button" data-open-glossary>术语词典 ('+beginnerGlossary.length+')</button></div>'+
  '<p class="outline-filter-status" aria-live="polite" hidden></p>';
 firstTree.before(bar);

 let mode='all',allExpanded=false;
 const searchInput=bar.querySelector('.outline-search'),expandBtn=bar.querySelector('[data-outline-expand]'),statusEl=bar.querySelector('.outline-filter-status');
 const savedOpen=new Map(detailsList.map(d=>[d,d.open]));

 function applyFilter(){
  const q=searchInput.value.trim().toLowerCase();
  const filtering=mode!=='all'||q.length>0;
  let shown=0;
  for(const link of allChapters){
   const prio=getPrio(link);
   const matchMode=mode==='all'||(mode==='basic'&&prio==='基础必修')||(mode==='spine'&&(prio==='基础必修'||prio==='岗位重点'))||(mode==='deep'&&prio==='专题深入');
   const matchQuery=!q||link.textContent.toLowerCase().includes(q)||(link.getAttribute('title')||'').toLowerCase().includes(q);
   const visible=matchMode&&matchQuery;
   link.hidden=!visible;
   if(visible)shown++;
  }
  for(const grp of document.querySelectorAll('#full-outline .outline-directory-group')){
   grp.hidden=![...grp.querySelectorAll('.outline-chapter')].some(l=>!l.hidden);
  }
  for(const d of detailsList){
   const hasVisible=[...d.querySelectorAll('.outline-chapter')].some(l=>!l.hidden);
   d.hidden=filtering&&!hasVisible;
   if(filtering&&hasVisible)d.open=true;
   else if(!filtering&&!allExpanded)d.open=Boolean(savedOpen.get(d));
  }
  for(const tree of document.querySelectorAll('#full-outline .outline-tree')){
   tree.hidden=filtering&&![...tree.querySelectorAll('.outline-chapter')].some(l=>!l.hidden);
  }
  if(filtering){
   statusEl.hidden=false;
   const modeName={basic:'新手必读（基础必修）',spine:'核心主干（必修 + 岗位重点）',deep:'专题深入',all:'全部章节'}[mode];
   statusEl.innerHTML='<span>当前筛选：<b>'+escapeHTML(modeName+(q?' · 含“'+searchInput.value.trim()+'”':''))+'</b>，共匹配 <b>'+shown+'</b> / '+allChapters.length+' 章</span><button type="button" data-outline-reset>清除筛选 ×</button>';
   statusEl.querySelector('[data-outline-reset]')?.addEventListener('click',()=>{
    mode='all';searchInput.value='';
    bar.querySelectorAll('[data-outline-filter]').forEach(b=>b.classList.toggle('active',b.dataset.outlineFilter==='all'));
    applyFilter();
   });
  }else statusEl.hidden=true;
 }

 bar.querySelector('.outline-filter-pills').addEventListener('click',e=>{
  const btn=e.target.closest('[data-outline-filter]');
  if(!btn)return;
  mode=btn.dataset.outlineFilter;
  bar.querySelectorAll('[data-outline-filter]').forEach(b=>b.classList.toggle('active',b===btn));
  applyFilter();
 },{signal});
 searchInput.addEventListener('input',applyFilter,{signal});
 expandBtn.addEventListener('click',()=>{
  allExpanded=!allExpanded;
  detailsList.forEach(d=>{if(!d.hidden)d.open=allExpanded;});
  expandBtn.textContent=allExpanded?'收起全部模块':'展开全部模块';
 },{signal});
 bar.querySelector('[data-open-glossary]')?.addEventListener('click',()=>openGlossaryDialog(''),{signal});
}

function initRoadmapJumpRail(done,signal){
 for(const course of document.querySelectorAll('.complete-course')){
  const steps=[...course.querySelectorAll(':scope > .roadmap-step')];
  if(steps.length<2)continue;
  const trackId=course.closest('.route-block')?.id?.replace(/^route-/,'')||'cloud';
  const rail=document.createElement('nav');
  rail.className='stage-jump-rail';
  rail.setAttribute('aria-label','按阶段快速跳转');
  steps.forEach((step,idx)=>{
   if(!step.id)step.id='stage-'+trackId+'-'+(idx+1);
   const title=(step.querySelector('h3')?.textContent||'阶段 '+(idx+1)).trim();
   const links=[...step.querySelectorAll('a[id^="route-chapter-"]')];
   let mins=0,readCount=0;
   for(const a of links){
    const id=new URL(a.href,location.href).pathname.match(/\/article\/([a-z0-9-]+)\/?$/)?.[1];
    if(id){mins+=chapterReadingMinutes[id]||15;if(done.has(id))readCount++;}
   }
   const chip=document.createElement('a');
   chip.className='stage-jump-chip';
   chip.href=location.pathname+location.search+'#'+step.id;
   chip.innerHTML='<b>0'+(idx+1)+'</b><span>'+escapeHTML(title)+'</span><small>'+(readCount?readCount+'/'+links.length+' 已读':links.length+' 章 · 约 '+mins+' 分')+'</small>';
   chip.addEventListener('click',e=>{e.preventDefault();step.scrollIntoView({behavior:'smooth',block:'start'});},{signal});
   rail.appendChild(chip);
  });
  (course.querySelector(':scope > summary')||steps[0]).after(rail);
 }
}

function initCollectionWorkbench(){
 collectionAbort?.abort();
 collectionAbort=new AbortController();
 const signal=collectionAbort.signal;
 document.querySelectorAll('.learning-workbench,.chapter-meta-badges,.outline-module-progress,.outline-controls,.stage-jump-rail').forEach(el=>el.remove());
 const path=documentPathname();
 const isHome=path==='/',isOutline=path==='/outline/',isRoadmap=path.startsWith('/roadmap/');
 if(isHome)initHomeInteractive(signal);
 if(!isHome&&!isOutline&&!isRoadmap)return;
 const {done,inProgress,latest}=collectChapterStatus();
 const courseRaw=readStore('infraguide-course-progress',null);
 const courseDone=courseRaw?.done&&typeof courseRaw.done==='object'?Object.keys(courseRaw.done).filter(k=>courseRaw.done[k]).length:0;
 const courseLast=courseRaw?.last?.id?courseRaw.last:null;
 const checksRaw=readStore('cloudinfra-checks',{});
 const checksCount=checksRaw&&typeof checksRaw==='object'?Object.values(checksRaw).filter(Boolean).length:0;
 const hasAnyActivity=done.size>0||inProgress.size>0||courseDone>0||Boolean(courseLast)||checksCount>0;
 const totalChapters=typeof articles!=='undefined'&&Array.isArray(articles)?articles.length:78;
 if(hasAnyActivity||isOutline||isRoadmap){
  const bench=document.createElement('section');
  bench.className='learning-workbench'+(hasAnyActivity?'':' is-welcome');
  bench.setAttribute('aria-label','本浏览器学习进度与快捷续学');
  const articleInfo=id=>typeof articleById==='function'&&articleById(id);
  const resumeActions=[];
  if(latest){
   const meta=articleInfo(latest.id);
   const title=meta?meta.number+' '+meta.title:latest.id;
   const sub=latest.label?' · '+latest.label:'';
   const href=hostedPath('/article/'+latest.id+'/')+(latest.section&&!latest.done?'#'+latest.section:'');
   resumeActions.push('<a class="workbench-resume-btn primary" href="'+escapeHTML(href)+'">继续阅读：'+escapeHTML(title+sub)+' →</a>');
  }
  if(courseLast){
   const stepHash=Number.isInteger(courseLast.step)?'/'+courseLast.step:'';
   resumeActions.push('<a class="workbench-resume-btn" href="'+escapeHTML(hostedPath('/courses/#'+courseLast.id+stepHash))+'">继续动画课：'+escapeHTML(courseLast.id)+' ↗</a>');
  }else if(!latest){
   resumeActions.push('<a class="workbench-resume-btn primary" href="'+escapeHTML(hostedPath('/courses/?deck=overview'))+'">先看 30 幕全景动画课 ↗</a>');
   resumeActions.push('<a class="workbench-resume-btn" href="'+escapeHTML(hostedPath('/track/cloud/'))+'">读第一课 C1.1 →</a>');
   resumeActions.push('<button type="button" class="workbench-resume-btn" data-bench-glossary>白话术语词典</button>');
  }
  const readPct=Math.min(100,Math.round(done.size/totalChapters*100));
  const coursePct=Math.min(100,Math.round(courseDone/60*100));
  const headCopy=hasAnyActivity
   ?'<strong>个人学习工作台</strong><span>进度自动保存在当前浏览器</span>'
   :'<strong>第一次来？先选一种最轻松的切入方式</strong><span>无需注册登录 · 你的阅读小节、动画进度与自检勾选会自动保存在本浏览器</span>';
  bench.innerHTML='<div class="workbench-head"><div>'+headCopy+'</div><div class="workbench-actions">'+resumeActions.join('')+'</div></div>'+
   '<div class="workbench-metrics">'+
   '<a class="workbench-metric" href="'+escapeHTML(hostedPath('/outline/'))+'"><div class="metric-top"><span>章节深度阅读</span><b>'+(hasAnyActivity?done.size+' / '+totalChapters+' 章':'含 13 章零基础必修')+'</b></div><div class="metric-bar"><i style="width:'+readPct+'%"></i></div><small>'+(inProgress.size?'进行中 '+inProgress.size+' 章 · 点击查看全局目录':'全站共 '+totalChapters+' 章 · 读到底部或点已读自动点亮')+'</small></a>'+
   '<a class="workbench-metric" href="'+escapeHTML(hostedPath('/courses/'))+'"><div class="metric-top"><span>16:9 动画图解课</span><b>'+(hasAnyActivity?courseDone+' / 60 幕':'60 幕配音推演')+'</b></div><div class="metric-bar"><i style="width:'+coursePct+'%"></i></div><small>'+(courseLast?'上次停在 '+escapeHTML(courseLast.id)+' · 三季共 60 幕':'第一季 18 节 · 第二季 12 节 · 全景 30 幕')+'</small></a>'+
   '<a class="workbench-metric" href="'+escapeHTML(hostedPath('/interview/'))+'"><div class="metric-top"><span>自检与面试演练</span><b>'+(hasAnyActivity?'已掌握 '+checksCount+' 项':'12 道跨层核心题')+'</b></div><div class="metric-bar"><i style="width:'+Math.min(100,checksCount*4)+'%"></i></div><small>按“结论 → 机制 → 算例 → 边界”开口复述</small></a>'+
   '</div>';
  const anchor=isHome?document.querySelector('.infra-hero'):document.querySelector('.collection > .description');
  anchor?.after(bench);
  bench.querySelector('[data-bench-glossary]')?.addEventListener('click',()=>openGlossaryDialog(''),{signal});
 }
 if(!isOutline&&!isRoadmap)return;
 // Annotate chapter rows on /outline/, /roadmap/, and /roadmap/<role>/ with reading time + status pills.
 const selector=isOutline?'.outline-chapter':'[id^="route-chapter-"], [id^="goal-chapter-"]';
 for(const link of document.querySelectorAll(selector)){
  const id=new URL(link.href,location.href).pathname.match(/\/article\/([a-z0-9-]+)\/?$/)?.[1];
  if(!id)continue;
  const mins=chapterReadingMinutes[id],scene=chapterAnimatedScenes[id];
  const isDone=done.has(id),prog=inProgress.get(id);
  const wrap=document.createElement('span');
  wrap.className='chapter-meta-badges';
  if(mins){const t=document.createElement('span');t.className='chapter-time-pill';t.textContent='约 '+mins+' 分钟';wrap.appendChild(t);}
  if(scene){const s=document.createElement('span');s.className='chapter-scene-pill';s.textContent='动画 '+scene;wrap.appendChild(s);}
  if(isDone){
   const b=document.createElement('span');b.className='chapter-status-pill is-done';b.textContent='✓ 已读';wrap.appendChild(b);
   link.dataset.readingState='done';
  }else if(prog){
   const b=document.createElement('span');b.className='chapter-status-pill is-active';b.textContent='阅读中';wrap.appendChild(b);
   link.dataset.readingState='active';
  }
  if(wrap.childNodes.length)link.appendChild(wrap);
 }
 if(isOutline){
  for(const detail of document.querySelectorAll('details[data-directory-module]')){
   const links=[...detail.querySelectorAll('.outline-chapter')];
   if(!links.length)continue;
   const doneInMod=links.filter(l=>l.dataset.readingState==='done').length;
   const activeInMod=links.filter(l=>l.dataset.readingState==='active').length;
   if(doneInMod||activeInMod){
    const badge=document.createElement('em');
    badge.className='outline-module-progress';
    badge.textContent=(doneInMod?'已读 '+doneInMod+'/'+links.length:'')+(doneInMod&&activeInMod?' · ':'')+(activeInMod?'进行中 '+activeInMod:'');
    detail.querySelector(':scope > summary')?.appendChild(badge);
    if(activeInMod&&!location.hash)detail.open=true;
   }
  }
  initOutlineControls(signal);
 }
 if(isRoadmap)initRoadmapJumpRail(done,signal);
}
function initReadingComfort(){
 if(typeof document.createElement!=='function')return; // Static rendering has no browser DOM.
 comfortAbort?.abort();
 const article=document.querySelector('.doc-layout .article'),root=document.documentElement;
 const preference=readStore('infraguide-reading',{large:false,focus:false});
 root.classList.toggle('reading-large',!!article&&preference.large===true);
 root.classList.toggle('reading-focus',!!article&&preference.focus===true);
 if(!article){
  root.classList.remove('reading-controls-ready');
  initCollectionWorkbench();
  return;
 }
 collectionAbort?.abort();
 comfortAbort=new AbortController();
 const signal=comfortAbort.signal;
 // The sticky toolbar replaces the repeated inline mobile contents only when it works.
 root.classList.add('reading-controls-ready');
 const toolbar=article.querySelector('.reading-toolbar');
 ensureToolbarLeftGroup(toolbar);
 initReadingConceptReturn(article,toolbar);
 initReadingGateReturn(toolbar);
 initChapterCompanionTools(article,toolbar,signal);
 const buttons={large:toolbar.querySelector('[data-reader-large]'),focus:toolbar.querySelector('[data-reader-focus]')};
 function sync(){
  buttons.large.setAttribute('aria-pressed',root.classList.contains('reading-large'));
  buttons.large.title=root.classList.contains('reading-large')?'当前大字，点击恢复标准字号':'当前标准字号，点击放大';
  buttons.focus.setAttribute('aria-pressed',root.classList.contains('reading-focus'));
  buttons.focus.textContent=root.classList.contains('reading-focus')?'退出专注':'专注阅读';
 }
 sync();
 function change(key){
  root.classList.add('reading-reflow');
  const line=toolbar.getBoundingClientRect().bottom+12;
  const anchor=[...article.querySelectorAll('h1,h2,h3,p,.table-wrap,figure,.code-block')].find(el=>!el.closest('details:not([open])')&&el.getClientRects().length&&el.getBoundingClientRect().bottom>line);
  const before=anchor?.getBoundingClientRect().top;
  root.classList.toggle('reading-'+key);
  writeStore('infraguide-reading',{large:root.classList.contains('reading-large'),focus:root.classList.contains('reading-focus')});
  sync();
  if(anchor)window.scrollTo({top:window.scrollY+anchor.getBoundingClientRect().top-before,behavior:'instant'});
  root.classList.remove('reading-reflow');
  updateCurrent();
 }
 buttons.large.addEventListener('click',()=>change('large'),{signal});
 buttons.focus.addEventListener('click',()=>change('focus'),{signal});

 const navLinks=[...document.querySelectorAll('.toc a')];
 const desktopTargets=new Map(navLinks.filter(link=>link.dataset.toc).map(link=>[link.dataset.toc,link]));
 // The static track entry carries the same outline without any request query.
 if(article.querySelector(':scope > .track-entry-overview')){
  const current=location.pathname+location.search;
  for(const [id,link] of desktopTargets)link.setAttribute('href',current+'#'+encodeURIComponent(id));
 }
 const sections=[...article.querySelectorAll('.concept-path[id],.article-section[id],.knowledge-point[id],.knowledge-examples[id],.field-concept-map[id],.chapter-lab-links[id],.article-section h3[id],.article-section h4[id]')].filter(el=>el.matches('h3,h4')?desktopTargets.has(el.id)||!el.closest('details'):el.querySelector('h2,summary'));
 // Authored details can have public fragments without adding entries to the outline.
 const optionalDetails=[...article.querySelectorAll('.article-section[id] details:not(.article-case)')]
  .filter(detail=>detail.id||detail.querySelector('h3,h4,[id]'))
  .map(detail=>({detail,section:detail.closest('.article-section[id]'),summary:detail.querySelector(':scope > summary')}));
 const directory=document.createElement('dialog');
 directory.className='reader-dialog reader-directory';
 directory.setAttribute('aria-labelledby','reader-directory-title');
 directory.innerHTML='<div class="reader-dialog-head"><h2 id="reader-directory-title">本页目录</h2><button type="button" data-reader-close aria-label="关闭目录">关闭 <span aria-hidden="true">×</span></button></div><nav class="reader-directory-links" aria-label="本页知识点"></nav>';
 const directoryNav=directory.querySelector('nav');
 const directoryCaseLinks=[];
 for(const section of sections){
  const link=document.createElement('a');
  const desktopTarget=desktopTargets.get(section.id);
  link.href=desktopTarget?.getAttribute('href')||location.pathname+location.search+'#'+section.id;
  const heading=section.matches('h3,h4')?section:section.querySelector('h2,summary');
  const outlineLabel=section.id==='concept-path'||section.matches('.chapter-lab-links,.applied-exercise,.references');
  link.textContent=(outlineLabel?desktopTarget||heading:heading).textContent.trim().replace(/^(\d{2})(?=\D)/,'$1 · ');
  link.dataset.readerTarget=section.id;
  if(section.matches('h3,h4'))link.classList.add('reader-subheading-'+section.tagName.slice(1));
  const caseBody=section.closest('details.article-case');
  if(caseBody){
   link.hidden=!caseBody.open;
   directoryCaseLinks.push({link,caseBody});
  }
  link.addEventListener('click',event=>{event.preventDefault();closeModal(directory);history.pushState(null,'',link.getAttribute('href'));
   // A directory target may live inside the optional practice/further-reading block.
   // pushState does not fire hashchange, so reveal it before attempting to scroll.
   for(let parent=section;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
   const child=section.querySelector(':scope > details.article-case');if(child)child.open=true;
   section.scrollIntoView({behavior:'instant',block:'start'});section.setAttribute('tabindex','-1');section.focus({preventScroll:true});updateCurrent();},{signal});
  directoryNav.appendChild(link);
 }
 // Prerequisite pages without numbered sections still have the top-level map.
 if(!sections.length){const link=document.createElement('a');link.href=location.pathname+location.search+'#main';link.textContent=article.querySelector('h1').textContent;link.onclick=()=>closeModal(directory);directoryNav.appendChild(link);}
 const sidebar=document.querySelector('.sidebar');
 let chapters;
 if(sidebar){
  const overview=sidebar.querySelector('[data-track-overview]')?.cloneNode(true);
  if(overview){
   overview.classList.remove('side-home');
   overview.addEventListener('click',()=>closeModal(directory),{signal});
   directoryNav.prepend(overview);
  }
  chapters=document.createElement('details');chapters.className='reader-chapters';
  const summary=document.createElement('summary');summary.textContent='切换本方向章节';chapters.appendChild(summary);
  const chapterList=document.createElement('div');chapterList.className='reader-chapter-list';
  for(const group of sidebar.querySelectorAll('details'))chapterList.appendChild(group.cloneNode(true));
  chapters.appendChild(chapterList);directoryNav.before(chapters);
  const currentChapter=chapterList.querySelector('[aria-current="page"]');
  chapters.addEventListener('toggle',()=>{
   if(!chapters.open||!currentChapter)return;
   const item=currentChapter.getBoundingClientRect();
   const top=summary.getBoundingClientRect().bottom,bottom=chapters.getBoundingClientRect().bottom;
   if(item.top<top||item.bottom>bottom)chapters.scrollTop+=(item.top+item.bottom-top-bottom)/2;
  },{signal});
 }
 document.body.appendChild(directory);
 toolbar.querySelector('[data-reader-contents]').addEventListener('click',openDirectory,{signal});

 function openDirectory(){
  updateCurrent();
  if(chapters)chapters.open=false;
  document.body.classList.add('reader-modal-open');
  directory.showModal();
  const current=directoryNav.querySelector('[aria-current="location"]:not([hidden])');
  if(!current)return;
  const item=current.getBoundingClientRect();
  const frame=directoryNav.getBoundingClientRect();
  if(item.top<frame.top||item.bottom>frame.bottom){
   directoryNav.scrollTop+=(item.top+item.bottom-frame.top-frame.bottom)/2;
  }
  current.focus({preventScroll:true});
 }
 function unlockModal(){if(!document.querySelector('dialog.reader-dialog[open]'))document.body.classList.remove('reader-modal-open');}
 function closeModal(dialog){dialog.close();unlockModal();}
 for(const dialog of [directory]){
  dialog.querySelector('[data-reader-close]').addEventListener('click',()=>closeModal(dialog),{signal});
  dialog.addEventListener('close',unlockModal,{signal});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeModal(dialog);}},{signal});
 }
 signal.addEventListener('abort',()=>{directory.close();directory.remove();unlockModal();},{once:true});

 function linkTarget(link){const url=new URL(link.href,location.href),section=url.searchParams.get('section'),id=url.hash?decodeURIComponent(url.hash.slice(1)):section?(/^\d+$/.test(section)?'section-'+section:section):'';if(url.pathname!==location.pathname&&!article.contains(document.getElementById(id)))return '';return id;}
 const targets=new Map(navLinks.map(link=>[link,linkTarget(link)]));
 const updateProgress=initReadingProgress(article,toolbar,signal);
 const rememberPosition=initReadingResume(toolbar,sections,signal);
 initChapterCompass(article,toolbar,signal);
 initInlineGlossary(article,signal);
 const directoryLinks=[...directoryNav.querySelectorAll('[data-reader-target]')];
 let queued=false,lastActive='';
 function updateCurrent(){
  queued=false;
  const edge=toolbar.getBoundingClientRect().bottom+48;
  let active=sections[0]?.id||'';
  for(const section of sections){if(section.closest('details:not([open])')||!section.getClientRects().length)continue;if(section.getBoundingClientRect().top<=edge)active=section.id;else break;}
  const optional=optionalDetails.find(({detail,summary})=>!detail.closest('details:not([open])')&&detail.getClientRects().length&&
   (summary||detail).getBoundingClientRect().bottom<=edge&&detail.getBoundingClientRect().bottom>edge);
  if(optional)active=optional.section.id;
  for(const {link,caseBody} of directoryCaseLinks)link.hidden=!caseBody.open;
  updateProgress();
  if(active===lastActive)return;lastActive=active;
  if(window.scrollY>0)rememberPosition(active);
  for(const link of navLinks){
   const current=targets.get(link)===active;
   link.classList.toggle('active',current);
   if(!current){link.removeAttribute('aria-current');continue;}
   link.setAttribute('aria-current','location');
   const caseGroup=link.closest('.chapter-toc-case-details');
   if(caseGroup){
    caseGroup.open=true;
    const toc=caseGroup.closest('.toc'),frame=toc.getBoundingClientRect(),item=link.getBoundingClientRect();
    if(item.top<frame.top)toc.scrollTop+=item.top-frame.top;
    else if(item.bottom>frame.bottom)toc.scrollTop+=item.bottom-frame.bottom;
   }
  }
  for(const link of directoryLinks){if(link.dataset.readerTarget===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(updateCurrent);}}
 window.addEventListener('scroll',schedule,{passive:true,signal});
 window.addEventListener('resize',schedule,{passive:true,signal});
 article.addEventListener('toggle',schedule,{capture:true,signal});
 schedule();
}
