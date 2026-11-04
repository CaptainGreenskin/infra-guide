/* Fresh audit repairs: virtualization before capacity cases; TCP mechanisms before timing diagnostics. */
Object.assign(sources,{
 v28KVM:['Linux · KVM的VM、vCPU与内存接口','https://www.kernel.org/doc/html/latest/virt/kvm/api.html'],
 v28MMU:['Linux · KVM客户机与宿主地址转换','https://www.kernel.org/doc/html/latest/virt/kvm/x86/mmu.html'],
 v28Virtio:['Linux · virtio驱动、设备与共享队列','https://www.kernel.org/doc/html/latest/driver-api/virtio/virtio.html'],
 v28CPUOptions:['Amazon EC2 · CPU核心与每核线程','https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-cpu-options-rules.html'],
 v28Credits:['Amazon EC2 · CPU积分与基线','https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html'],
 v28TCP:['IETF RFC9293 · TCP连接、序号与关闭','https://www.rfc-editor.org/rfc/rfc9293.html'],
 v28Congestion:['IETF RFC5681 · 流控窗口与经典拥塞控制','https://www.rfc-editor.org/rfc/rfc5681.html'],
 v28Redo:['MySQL8.4 · InnoDB日志刷新选项','https://dev.mysql.com/doc/refman/8.4/en/innodb-parameters.html#sysvar_innodb_flush_log_at_trx_commit'],
 v28Binlog:['MySQL8.4 · binlog提交组与sync_binlog','https://dev.mysql.com/doc/refman/8.4/en/replication-options-binary-log.html#sysvar_sync_binlog']
});

function computeTransportLab(name,full=true){
 const r=computeTransportValidation.programs[name].result;
 let lead,rows,scope;
 if(name==='cpu_and_wall.py'){
  lead='实际测量一个CPU阶段、一个等待阶段，以及两个线程各消耗至少0.10 CPU秒。计时来自本机CPython3.9.6/macOS，数值不作为通用速度标准。';
  rows=Object.entries(r.cases).map(([id,v])=>[({one_cpu_phase:'单线程CPU阶段',one_wait_phase:'只等待阶段',two_cpu_threads:'两个CPU线程'})[id],(v.elapsed_seconds*1000).toFixed(3)+' ms墙钟',(v.process_cpu_seconds*1000).toFixed(3)+' ms进程CPU']);
  scope='CPU停止目标是一份有限工作量，不是cgroup配额。两线程的并行能力依GIL、构建与平台；逻辑CPU数量不是独占物理核承诺。';
 }else{
  lead='真实回环TCP：接收应用先不读，发送方非阻塞写到受控上限或阻塞；然后放行读取，按可写事件继续发送，最后半关闭并核对应用回执。';
  rows=[['固定负载',r.payload_bytes+'字节','最终收到'+r.received_bytes+'字节并匹配SHA256'],['应用开始读之前','本次send已接收'+r.accepted_before_application_read+'字节','观察到阻塞：'+r.blocked_before_application_read],['缓冲设置的实际返回值','发送'+r.send_buffer_setting+'字节','接收'+r.receive_buffer_setting+'字节'],['成功send调用',String(r.successful_send_calls),'本次短写'+r.short_writes_observed+'次'],['关闭发送方向后','仍读到接收方JSON回执','应用收到全部字节，不能只靠TCP ACK猜测']];
  scope='没有抓包或读取cwnd。应用未读时，内核仍可能接收并ACK；是否在受控上限前阻塞、短写和缓冲值依系统变化。本次未遇到短写，代码仍按send实际返回值推进。';
 }
 return infraReadableHTML(para(lead)+code('Python 3.9+ · 标准库 · 临时回环连接/有限CPU工作','SHELL','python3 '+name)+table(['阶段/检查','观察一','观察二'],rows)+
 (full?'<details class="full-code"><summary>展开完整'+name+'：与下载源码一致</summary>'+code(name,'PYTHON',computeTransportFiles[name])+'</details>':'')+
 '<p class="practice-links"><a href="labs/compute-and-transport.zip" download>下载CPU记账与套接字背压实验 ↓</a><a href="labs/compute-and-transport/'+name+'" download>下载'+name+' ↓</a><a href="labs/compute-and-transport/validation.json" target="_blank" rel="noopener">实际输出与源码摘要 ↗</a></p>'+para('<small>'+scope+'</small>'));
}

const vmObjects=infraReadableHTML(
 '<div class="mechanism-core" id="virtualization-resource-contract">'+knowledgeSubhead('先分清交付的是机器、客户机，还是一组进程')+
 table(['计算形态','内核与可控制对象','容量与恢复仍需检查'],[
 ['裸金属','直接运行自己的主机系统，按产品提供物理设备','并不自动解决应用并发、数据恢复与跨机故障'],
 ['虚拟机VM','有自己的客户机内核，看到虚拟CPU、内存与设备','宿主调度、设备路径、数据盘与镜像/初始化合同'],
 ['普通Linux容器','共享所在主机的内核，以namespace/cgroup等组织进程','组与父级资源限制、共享内核、卷及进程生命周期']])+
 para('Hypervisor（虚拟机监控器）在客户机与宿主资源之间提供执行和隔离机制。以Linux/KVM为例，虚拟机管理程序创建VM、内存区域与vCPU，KVM和硬件辅助机制参与执行；不是把客户机每条普通指令都逐条交给用户态解释。需要处理的退出、设备与内存操作仍会产生相应成本。',
 'VM和容器可以叠放：云主机中运行容器时，容器共享的是这台VM的客户机内核。镜像里的发行版文件与用户态库，不是另一份正在运行的Linux内核。选择形态要核对内核/设备兼容、租户信任、启动频率、运维责任和实际负载，不能按“名字更轻就一定更快”排序。')+
 figure('v28-vm-three-maps','CPU执行、地址转换与设备路径分别解释。以KVM作机制示意；不是本机创建VM或特定云产品的内部架构。')+'</div>');

const vmCpu=infraReadableHTML(
 knowledgeSubhead('vCPU数量、独占核心与持续算力不是一回事')+
 para('vCPU是客户机可见的处理单元；物理核心、硬件线程和软件工作线程是不同对象。支持SMT的物理核可提供多个硬件线程，它们共享部分执行资源。EC2的CPU选项按核心数×每核线程数得到vCPU数，具体架构和规格不同，不能把“8 vCPU”统一读成“独占8颗物理核”。',
 '超分指对共享资源作出超过某一物理供给量的虚拟分配，可利用不同负载不同时繁忙的特点；它不凭空增加执行能力。实际独占、共享、调度和供给保证以产品合同为准，不能看见VM就断言它必然超分，也不能看见专用宿主就跳过应用层限制。')+
 table(['限制位置','问题','应对照的证据'],[
 ['客户机内部','线程是否可运行，是否在等锁或I/O','进程/线程CPU时间、运行队列与等待'],
 ['容器及父cgroup','可运行但时间预算是否耗尽','cpu.max、cpu.stat增量及祖先限制'],
 ['虚拟化与资源合同','vCPU得到哪些调度与持续能力承诺','云规格/模式、可见的宿主等待线索及对照负载'],
 ['物理与程序','SMT、频率、缓存和内存带宽怎样影响每CPU秒产出','同一工作量的完成数、CPU成本与尾延迟']])+
 para('CPU时间便于记账，却不是跨架构不变的工作单位。两个环境都消耗1 CPU秒，不保证完成相同数量指令或业务请求。下文用CPU秒推导候选规格，最终仍要在目标CPU、线程布局和真实请求混合上验证。'));

const vmMemoryIO=infraReadableHTML(
 knowledgeSubhead('内存有多层地址，设备有独立的数据路径')+
 para('客户机应用的虚拟地址先由客户机页表解释为客户机物理地址，再由虚拟化机制关联到宿主物理页面。x86可使用EPT/NPT等二阶段分页机制，也存在影子映射等实现。不要把这张逻辑路径误读成每次访存必然执行两次完整内存读取：TLB、页表缓存、页大小和硬件路径会改变成本。',
 '“32 GiB内存”给出容量信息，没有完整描述带宽、延迟或页面位置。NUMA（非一致内存访问）使不同CPU与内存位置的访问代价可能不同；虚拟机可见的拓扑和宿主实际放置又是两层。把线程绑到一个位置，不表示过去已分配的页自动跟着迁移。先测工作集、访存与放置，再决定是否需要绑核、大页或拓扑调整。')+
 para('I/O虚拟化把驱动与后端连接起来。virtio用约定的设备接口与共享队列传递缓冲描述符；设备模拟和直通采用不同路径。绕过某些中间层也不会消除物理带宽、设备队列或后端服务配额，直通还要核对IOMMU隔离、设备能力及迁移限制。',
 '因此同样“8 vCPU、32 GiB”的实例，也可能因CPU代际、NUMA、网络/磁盘基线、突发条件、驱动或设备路径表现不同。规格比较至少同时固定程序、输入、架构、持续时间和存储/网络条件；不要拿一段热缓存CPU循环概括整个云主机。'));

const vmCredits=infraReadableHTML(
 knowledgeSubhead('突发性能要算时间余额，不能把短压测当持续能力')+
 para('以CPU积分型产品的通用账本作题：1积分表示1 vCPU以100%用1分钟。设2 vCPU、每vCPU基线20%，每分钟赚2×0.2=0.4积分；若两者持续满用，每分钟花2积分，净扣1.6。已有48积分时，理想账本可支持48÷1.6=30分钟的这一负载。题设不是某个当前实例报价，也没有测量真实限速曲线。')+
 figure('v28-credit-balance','明确题设的积分账本。满载前10分钟仍有32积分，20分钟余16，30分钟到0；不是云实例实测。')+
 para('Standard与Unlimited等模式决定余额耗尽后的行为。前者可能逐步回到基线，后者可使用额外积分并按相应规则计费；不能把“还能继续满载”当成“永远免费”。积分上限、生命周期、统计窗口和费用按具体产品核对。',
 '用这种规格跑5分钟压测，很可能尚未触及长期边界。报告要保存初始余额、持续时间、负载、实际完成量和相关模式。CPU积分也不同于Kubernetes CPU配额：前者是产品跨时间的能力/计费账本，后者是目标组的调度带宽约束，二者可能同时存在。')+
 knowledgeCheck('把工作线程从2加到8，能把30分钟余额延长吗？','不能仅凭线程数推导。若总CPU使用仍为2 vCPU满载，账本净扣仍1.6积分/分；若资源路径或程序改变使CPU成本下降，应按新的实际用量重算。线程数不是积分来源。'));

const cpuAccountingPractice=infraReadableHTML(
 knowledgeSubhead('本机实测：等了多久，与消耗多少CPU分开看')+
 figure('v28-cpu-wall','真实CPython3.9.6/macOS单次计时。等待消耗墙钟而几乎不消耗本进程CPU；两线程合计CPU时间仍要独立记账。')+
 computeTransportLab('cpu_and_wall.py')+
 para('先预测只等待阶段两根柱子的相对大小，再运行程序。本次两个CPU线程没有展示两倍的墙钟速度，不能据此归因云超分；它们在同一Python进程，解释器GIL等条件就足以影响并行。要验证真实VM或cgroup限额，另按目标机器记录其资源合同、限制与同一负载。'));

const tcpConnection=infraReadableHTML(
 '<div class="mechanism-core" id="tcp-connection-contract">'+knowledgeSubhead('连接先同步双向序号，字节确认不等于业务确认')+
 para('TCP在一条连接内提供可靠、有序的字节流。两端IP和端口标识连接端点，结合TCP协议形成常说的五元组；中间有代理时，每段连接是独立的。发送和接收各有自己的序号空间，ACK里的确认号通常表示下一段连续期望的字节位置。它不是订单号，也不是一次send的编号。',
 '用题设序号看三次握手：A发SYN/seq100；B发SYN/seq900并ACK101；A回ACK901。SYN占一个序号，所以后续A的数据从101起。再发送100字节并被连续接收，对端期待201。握手同步双向状态并处理旧重复连接发起等问题，不应只背成“双方各证明能收发”。')+
 figure('v28-tcp-open-close','握手与常见主动关闭的两条时间线；序号为教学输入。ACK/FIN可合并，同时关闭有其他状态分支，不是抓包记录。')+
 para('TCP ACK证明的是协议层接收进度，不证明应用已解析消息、鉴权或持久提交。send返回成功只表示字节被本地发送路径接受。下文的业务超时、半包和应用回执，都在这层字节服务之上另有定义。')+'</div>');

const tcpWindows=infraReadableHTML(
 knowledgeSubhead('流量控制保护接收方，拥塞控制约束网络中的在途数据')+
 table(['机制','主要状态','不要混淆'],[
 ['流量控制','接收方通告的接收窗口rwnd','应用不读后，内核仍可能暂存并确认一批字节'],
 ['拥塞控制','发送方拥塞窗口cwnd及算法状态','丢包/时延反馈与接收应用处理能力不是同一信息'],
 ['重传与确认','累计ACK、必要的选择确认及重传定时','重传修复字节交付，不重做业务提交协议'],
 ['应用背压','有界队列、读写节奏、截止时间与取消','TCP缓冲不能吸收无限业务积压']])+
 para('可发送范围受rwnd与cwnd等状态共同约束；已有未确认字节会占用这份窗口。经典慢启动、拥塞避免、快速重传和快速恢复解释网络反馈如何改变发送节奏，具体系统算法和丢包恢复实现可能不同。不要把某个教科书增长曲线当成所有内核的实际曲线。')+
 knowledgeFormula('固定窗口的理想吞吐上界','有效字节率 ≲ min(路径字节带宽, min(rwnd,cwnd) / RTT)','假设长流、窗口稳定、持续有数据且确认正常；真实发送还受在途数据、pacing、应用、CPU与协议开销影响。')+
 para('题设路径100 Mbit/s、RTT50 ms，带宽时延积为100,000,000÷8×0.05=625,000字节，约610 KiB。若当前有效窗口只有256 KiB，窗口项为256 KiB÷0.05s=5 MiB/s，低于链路约11.92 MiB/s的字节能力。只把链路升级而保持同一窗口/RTT，不能突破本题窗口上界。',
 '这不是建议把缓冲一律调大。若应用消费慢、排队严重或真实瓶颈是磁盘，扩大缓冲可能只增加驻留量和延迟。先核对数据量、RTT、窗口/重传线索、接收读取和有效完成率；下面真实程序只观察本地套接字背压，没有测量cwnd或公网吞吐。'));

const tcpClosing=infraReadableHTML(
 knowledgeSubhead('关闭的是两个方向，TIME_WAIT与CLOSE_WAIT回答不同问题')+
 para('FIN表示本端不再发送新的字节，不要求另一个方向立刻停止。常见主动关闭中，一方先发FIN，另一方确认后等待自己的应用结束，再发FIN；最后的确认使对方完成关闭。ACK与FIN可以合在一个报文中，因此“挥手”不是固定必须看到四个独立包。')+
 table(['状态/观察','含义','优先验证'],[
 ['TIME_WAIT','为旧连接后续报文与结束确认保留必要状态','主动关闭位置、短连接速率、连接复用及端口/状态容量'],
 ['CLOSE_WAIT','已收到对方FIN，等待本地应用结束发送方向','对应进程、关闭路径、未结束工作及持续时间'],
 ['SYN_SENT/SYN-RECEIVED','连接同步尚在推进','实际地址/方向、回应、策略及排队证据'],
 ['ESTABLISHED但业务超时','连接状态并不代表应用持续取得进展','读写、缓冲、下游和任务权威结果']])+
 para('TIME_WAIT不是固定属于客户端；同时关闭时双方也可能进入。协议以2×MSL描述等待，具体栈及允许的复用机制需按实现核对，不能给所有系统套一个固定秒数。数量多可能只是高短连接率的结果；长期增长的CLOSE_WAIT则值得结合进程和关闭逻辑调查，仍不能仅凭状态数宣布根因。',
 'TCP keepalive探测空闲连接的存活条件，HTTP持久连接减少重复建连，应用心跳表达自己定义的工作信号。是否启用与超时都要按协议和配置核对，它们都不自动证明一次任务已提交。取消调用方等待，也不会自动让远端查询、线程或副作用停止。')+
 knowledgeCheck('A已经shutdown(SHUT_WR)，还能收到B的应用回执吗？','可以。它只关闭A的发送方向；B读到该方向EOF后仍可发送剩余结果。本站两份实际回环程序都按这个方向验证，业务回执仍须由应用协议自己定义。'));

const tcpBackpressurePractice=infraReadableHTML(
 knowledgeSubhead('实战：不读取时谁在接收，开始读取后怎样继续')+computeTransportLab('socket_backpressure.py')+
 para('先预测“应用没有调用recv”是否必然意味着“发送方第一字节就失败”。程序只在自己的临时连接中暂停应用读取，内核仍有缓冲；本次先接受'+computeTransportValidation.programs['socket_backpressure.py'].result.accepted_before_application_read+'字节才观察到非阻塞写暂不可用。然后应用开始读，可写事件驱动剩余发送，最终核对全部字节和摘要。',
 '本次SO_RCVBUF的实际返回值与设置值不同，短写次数又恰好为0；这两项都提醒我们不要硬编码某台系统的切分边界。若复跑在受控上限前未阻塞，应如实保存结果。生产解析与发送循环始终按实际返回字节推进，并管理队列、预算和关闭，而不是依赖这次碰巧的边界。'));

{
 const a=articles.find(a=>a.id==='cloud-compute'),old=a.sections.slice();
 old[1]=[old[1][0],old[1][1].replace('一个 CPU 秒表示一个核心连续执行一秒所贡献的处理时间。','一个CPU秒是在一颗逻辑CPU上执行一秒所记的处理时间；同一进程的多线程CPU时间可以相加。')];
 a.sections=[['计算形态：裸金属、虚拟机与容器',vmObjects],['vCPU合同：核心、线程、超分与持续能力',vmCpu],['内存与设备：地址转换、NUMA和I/O路径',vmMemoryIO],['突发性能：CPU积分与持续负载',vmCredits],...old.slice(0,-1),['实测：CPU时间、等待与线程',cpuAccountingPractice],old[old.length-1]];
 a.refs=nitRefs([...a.refs,'v28KVM','v28MMU','v28Virtio','v28CPUOptions','v28Credits']);a.updated='2026.11.05';a.minutes=70;
 a.objectives=['区分vCPU、物理核、容器配额与突发积分','解释客户机地址和设备路径，建立有效资源合同','实测CPU/墙钟记账，再按请求混合与下游推导候选规格'];
}
{
 const a=articles.find(a=>a.id==='network-diagnosis'),old=a.sections.slice();
 a.sections=[['TCP连接：序号、确认与握手',tcpConnection],['传输能力：窗口、RTT与应用背压',tcpWindows],['结束与探测：半关闭、状态与超时',tcpClosing],...old,['实战：非阻塞发送、接收读取与应用回执',tcpBackpressurePractice]];
 a.refs=nitRefs([...a.refs,'v28TCP','v28Congestion']);a.updated='2026.11.05';a.minutes=80;
 a.objectives=['理解TCP双向序号、窗口和关闭状态','先分清协议与业务证据，再解释累计时间与分段','运行实际拆包/半关闭和背压程序，定位等待边界'];
}
cloudKnowledgeExplanations['vm-runtime']=vmObjects+vmMemoryIO;
cloudKnowledgeExplanations['cpu-memory-placement']=vmCpu+cloudKnowledgeExplanations['cpu-memory-placement']+vmCredits;
cloudKnowledgeDomain('compute').refs=nitRefs([...cloudKnowledgeDomain('compute').refs,'v28KVM','v28MMU','v28Virtio','v28CPUOptions','v28Credits']);
cloudKnowledgeExplanations['transport-timeout']=tcpConnection+tcpWindows+tcpClosing+cloudKnowledgeExplanations['transport-timeout'];
cloudKnowledgeDomain('network').refs=nitRefs([...cloudKnowledgeDomain('network').refs,'v28TCP','v28Congestion']);
const computeTransportLabsBefore=cloudFieldLabs;
cloudFieldLabs=id=>(id==='compute'?'<h3>CPU记账：分开执行、等待与线程</h3>'+computeTransportLab('cpu_and_wall.py',false):id==='network'?'<h3>套接字背压：发送接受与应用消费</h3>'+computeTransportLab('socket_backpressure.py',false):'')+computeTransportLabsBefore(id);

// Small reading repairs discovered by the fresh audit; not counted as separate deep chapter rewrites.
cloudKnowledgeExplanations['fault-domain']=cloudKnowledgeExplanations['fault-domain'].replace('设 k 个等容量区域','设 k 个等容量故障域');
articles.find(a=>a.id==='training-storage').sections[0][1]+=para('术语补充：rank是分布式训练组内的进程编号。下文“每个rank”按对应训练进程核算，不是再额外增加一种机器；一台机器可以运行多个训练进程。');
for(const a of articles)if(a.id==='distributed-systems')a.sections=a.sections.map(([h,b])=>[h,b.replace('代际或fencing结合','代际或栅栏令牌（fencing token）结合')]);
cloudKnowledgeExplanations['database-service']=cloudKnowledgeExplanations['database-service'].replace(
 '取 0/2 时的后台同步受调度和配置影响，“约一秒”不是最多丢一秒的硬保证。',
 '这里的0/2专指innodb_flush_log_at_trx_commit：其后台刷新还受innodb_flush_log_at_timeout、调度和其他活动影响，默认“约一秒”不是最多丢一秒的硬保证。sync_binlog是另一套计数：0由操作系统安排刷新，1按提交同步，N>1按N个binlog提交组同步，不是N秒。');
cloudKnowledgeExplanations['backup-restore']=cloudKnowledgeExplanations['backup-restore'].replace(
 'RTO实耗 = 准备 + 取回基线 + 重放 + 启动 + 消费者验证 + 切流',
 '实际恢复耗时 = 发现/判断 + 准备 + 取回基线 + 重放 + 启动 + 消费者验证 + 切流');
cloudKnowledgeDomain('cloud-data').refs=nitRefs([...cloudKnowledgeDomain('cloud-data').refs,'v28Redo','v28Binlog']);
articles.find(a=>a.id==='database-index-locks').sections[4][1]+='<p><a href="/module/cloud-data/#knowledge-database-service">系统知识：InnoDB快照、undo/redo/binlog与提交边界 →</a></p>';
for(const[id,before,after]of [
 ['elasticity','这个数从固定请求分布的测试得到，是满足 SLO 的容量，不是短时间把 CPU 压到满载的极限。','40次/秒是本章教学题设；真实服务应从固定请求分布的测试取得满足SLO的持续容量，而非把CPU短时压满的峰值。'],
 ['slo','负预算表示目标已经违约','负预算表示该窗口已未达到SLO'],
 ['incident','事务外盒','事务发件箱（outbox）']
]){
 const a=articles.find(a=>a.id===id);
 a.sections=a.sections.map(([h,b])=>[h,b.replace(before,after)]);a.updated='2026.11.05';
}
cloudKnowledgeExplanations['secret-lifecycle']=cloudKnowledgeExplanations['secret-lifecycle'].replace(
 '旧验证材料保留上界 ≥ 最后一次旧签发 + 最长有效期 + 约定验证容差',
 '旧验证材料最早撤下时刻 ≥ 最后一次旧签发 + 最长有效期 + 约定验证容差');
cloudKnowledgeExplanations['tenant-isolation']=cloudKnowledgeExplanations['tenant-isolation'].replace('noisy neighbor 还会通过','共享资源干扰（noisy neighbor）还会通过');
{
 const p=cloudKnowledgeDomain('cloud-security').points.find(p=>p[0]==='tenant-isolation');
 p[3]=p[3].replace('noisy neighbor','共享资源干扰');
}
