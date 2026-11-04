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
