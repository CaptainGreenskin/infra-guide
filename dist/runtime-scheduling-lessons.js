/* C4: knowledge before the native Docker/kind cases. Stable chapter URLs and section IDs. */
Object.assign(sources,{
 rtCgroup:['Linux内核 · cgroup v2接口','https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html'],
 rtNamespace:['Linux man-pages · namespaces','https://man7.org/linux/man-pages/man7/namespaces.7.html'],
 rtDocker:['Docker · 资源限制','https://docs.docker.com/engine/containers/resource_constraints/'],
 rtKind:['kind · 本地集群与固定节点镜像','https://kind.sigs.k8s.io/docs/user/quick-start/'],
 rtResources:['Kubernetes · Pod与容器资源管理','https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/'],
 rtQuota:['Kubernetes · ResourceQuota','https://kubernetes.io/docs/concepts/policy/resource-quotas/'],
 rtAssign:['Kubernetes · 节点选择与Pod亲和性','https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/'],
 rtTaint:['Kubernetes · 污点与容忍','https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/']
});
const containerDepth=articles.find(a=>a.id==='container-runtime');
containerDepth.sections=[
 ['先分清镜像、容器、进程与内核',
 para('进程是正在执行的程序及其运行状态；内核负责调度、内存和设备访问。镜像是一组只读文件内容与启动配置，容器是运行时按这些内容创建的一次实例。实例通常有自己的可写层、资源视图和限制，真正消耗CPU时间的仍是进程中的线程。普通Linux容器共享宿主内核，不会因镜像中带了一套发行版文件就获得另一份内核。',
 '同一个镜像启动两个容器，会得到两组独立的运行状态。一次容器重启、删除后重建和替换镜像是不同操作：前者重新启动进程，后两者可能换掉实例与可写层。Kubernetes的Pod再组织一个或多个容器，让它们共享部分资源与生命周期；Pod不是一份镜像，也不能机械地等同于一个进程。')+
 figure('v48-container-object-layers','从分发内容、运行实例到宿主内核分层看：镜像提供文件，运行时建立进程环境，namespace与cgroup分别划定视图和资源。')+
 table(['对象','保存或负责什么','生命周期改变时查什么'],[['镜像','只读文件层与启动配置','实际内容摘要、平台架构'],['容器实例','可写层、挂载和启动环境','重建后哪些内容还存在'],['进程与线程','执行、地址空间、文件描述符','信号、退出、CPU与内存'],['宿主内核','调度、系统调用与设备管理','共享内核的限制与安全边界']])],
 ['镜像层、可写层和挂载怎样组成文件系统',
 para('镜像标签是一个可变名字；摘要按内容计算，用于指向确定的内容。多平台标签可能先指向一个索引，再根据节点架构选择具体镜像。排查“同版本行为不同”时，应记录标签、实际解析的摘要与平台，不能只保存latest这个名字。',
 '运行时把只读镜像层与容器可写层组合成进程看到的根文件系统。采用OverlayFS等实现时，修改下层文件可能先复制到上层，称为copy-up；具体是否发生、复制多大与文件系统实现有关。把数据库直接放进可写层，会让数据承诺依赖实例生命周期；卷挂载则按卷自身规则保存数据，仍不自动提供事务一致或异地备份。',
 '挂载还会遮住原路径。镜像里存在/app/config.json，启动时把另一目录挂到/app，进程看到的是挂载后的内容；不能只查看镜像就判断运行中一定能读到该文件。权限也由实际用户、目录模式与挂载选项共同决定。凭证曾写进镜像某层，即使后续层删除文件，历史层中的字节也不因此消失。')+
 code('先记录实际内容和挂载；替换自己的容器名','BASH','docker image inspect IMAGE --format \'{{json .RepoDigests}}\'\ndocker inspect CONTAINER --format \'{{json .Mounts}}\'\ndocker inspect CONTAINER --format \'{{json .Config.User}}\'')],
 ['namespace隔离视图，cgroup限制消费',
 para('namespace是内核为一组进程提供独立系统视图的机制。PID是进程编号，PID视图决定可见的进程编号，mount视图决定挂载表，network视图包含网络接口、路由和端口等。是否新建或共享这些视图由运行配置决定：同一Pod内容器通常共享网络，所以可经localhost通信；进程编号是否共享还要看另一项配置。',
 'cgroup是组织进程、统计和控制资源的机制。相同的namespace视图不代表相同的资源额度，独立视图也不保证有足够资源。cgroup v2以树组织组，子组还受祖先限制；容器内看到的根目录可能只是整棵树的一部分，因此本组显示不受限也不能直接排除父组限制。',
 '资源限制还要分类型。CPU带宽到限通常表现为暂时不能继续运行；内存上限涉及回收和内存不足（OOM）处理；pids控制器限制可创建的任务数量，线程也占用名额。它们不是一个统一的“容器大小”。namespace与cgroup也不替代权限、系统调用过滤和宿主防护；下面实验验证隔离视图与资源机制，不测试容器逃逸。')+
 table(['读数','解释','容易混淆'],[['/proc/1/ns/pid','目标进程所在PID视图的标识','编号不等于独立内核'],['cpu.max','每个周期可用的CPU时间预算','不是固定绑到半个核心'],['memory.max','该组内存硬限制','不等于某进程RSS'],['pids.max','可创建的内核任务上限','不仅统计用户眼中的进程数']])],
 ['从Pod声明走到宿主进程',
 para('Kubernetes负责把期望转成实际运行。API Server接收对象，控制器补齐所需子对象，scheduler给未绑定的Pod选择节点；目标节点的kubelet再请求运行时拉镜像和启动容器。CRI是kubelet与运行时之间的接口，OCI规范描述容器配置和运行要求，二者解决不同边界的问题。',
 '一次Pod绑定成功只说明已经选中节点。镜像下载、卷准备、网络设置和入口执行仍可能失败。CNI是容器网络插件接口，CSI是存储插件接口；看到它们相关事件时，应继续查对应路径，而不是假定业务已经执行过。没有容器日志，也可能因为进程尚未启动。')+
 figure('v10-pod-path','沿对象创建、节点绑定、运行时执行与流量资格分别取证；本章的Docker实验不代替所有Kubernetes插件验收。')+
 code('同一对象分阶段观察','BASH','kubectl -n demo get pod POD -o wide\nkubectl -n demo describe pod POD\nkubectl -n demo get pod POD -o json\n# 只有确实存在上一次容器实例时，--previous才有对应日志\nkubectl -n demo logs POD -c app --previous')],
 ['PID 1与停止信号：有限时间内完成排空',
 para('容器主进程通常是其PID视图中的1号进程，承担信号处理和子进程回收等责任。运行时发出的停止信号不会自动变成所有业务线程都已排空的证明。用shell启动应用却没有exec或明确转发，可能让真正的业务进程收不到预期信号；exec会用业务进程替换当前shell，减少这一层转发问题。',
 'preStop是容器终止前运行的生命周期钩子。Kubernetes终止宽限期包含preStop与应用停止所花时间。设总预算30秒，钩子先花12秒，应用不能再按完整30秒安排排空。已有连接、入口缓存和端点更新还在并行发生：就绪探针readiness变为false表示不再满足常规接流量条件，不等于所有旧连接立刻消失。',
 '排空至少要说明何时停止接新工作、已接任务如何完成、超时后哪些结果需要恢复核对。重要副作用不能靠“预计能在宽限期内退出”保证，应保存操作身份与可查询结果。进程被强制结束后，恢复协议仍需成立。')+
 code('让业务替换入口shell','SH','#!/bin/sh\nset -eu\nexec python -m report_api')+
 linkTo('agent-recovery','继续理解强制退出后的效果与回执')],
 ['CPU、内存和线程限制，要看不同证据',
 para('本实验给容器设置0.5 CPU、96MiB内存和16个任务名额。cgroup v2读到cpu.max="50000 100000"，单位为微秒，表示每100毫秒周期预算50毫秒CPU时间。若两个线程并行消费，各运行25毫秒就可能用完预算；这不等于它们只能绑在某个固定核心的一半时间，也不保证每周期一定按理想时刻节流。')+
 figure('v48-container-resource-evidence','同一组限制拆成三类真实观察：忙循环的统计差值、96MiB容器的OOM原因、16个任务名额对线程创建的限制。')+
 para('Linux CI中，忙循环经过约2.500秒墙钟，usage_usec增加1,247,581，nr_periods与nr_throttled都增加25。它支持“这一负载确实受到带宽限制”，不证明所有请求延迟都来自节流。throttled_usec增加1,249,294也是该次采样的组计数；不能把单次累计值直接当作某一请求的等待时间，更不能用它替代锁、I/O或连接池诊断。',
 '内存对照在96MiB限制内持续分配并触碰页面，Docker记录退出137且OOMKilled=true。137通常表示进程因强制终止信号SIGKILL结束，单看它无法区分OOM与人为kill；需要结合运行时原因和相应组事件。pids对照实际建成15个等待线程，加主线程为16，再创建被拒绝，pids.events的max增加1。这也解释了“内存足够，仍然无法创建线程”的一种原因；其他现场还应排查用户限制和资源不足。')+
 table(['现象','本实验直接证据','不能只看'],[['CPU忙循环被限','cpu.max+同窗口cpu.stat差值','宿主CPU均值'],['内存分配被终止','96MiB配置+OOMKilled+退出状态','退出137'],['线程创建失败','pids.current=16、max=16、事件+1','只数进程条目']])],
 ['实际比较namespace时，先固定生命周期',
 para('两个同时运行的容器分别读取/proc/1/ns/pid、mnt和net，本次三个视图的标识均不同。两个容器内部主进程都能看到自己是PID 1，却不表示它们是同一个宿主进程，也不表示有两份内核。实验不给容器特权、不共享宿主PID或网络空间，结果只适用于这组配置。',
 '第一轮程序曾先后运行两个短容器，退出后比较namespace标识，结果遇到编号复用。内核对象释放后，旧编号可以再次出现；“编号相等”只有结合生命周期才有意义。现在让两个容器同时存活再比较，并在结束时仅删除本实验随机命名的容器。这个修订也保留在Git提交和CI记录中。',
 '现场排障应先写能被推翻的判断。例如“CPU慢是配额耗尽”就要对齐配置、组计数增量和请求时间；“文件写失败是只读挂载”就要核对实际路径、用户与挂载。逐次改变一个条件，比直接增加privileged或把所有限制调大更容易找到原因。')],
 ['运行容器实验，保留完整条件和结果',
 para('公共Linux CI实际使用Docker 29.4.2、cgroup v2与一次解析后固定的Python镜像摘要；完整记录包含镜像身份、内核版本、计数差值与源码摘要。容器只运行本章程序，网络设为none，内存和任务数有限，不读取用户业务数据。',
 '本机需要可用的Linux Docker引擎或提供Linux容器的本地Docker环境。程序只接受本地Unix socket上下文，检查cgroup v2；不把本地上下文误当远程生产环境。先读README，再运行；macOS客户端读到的是Docker Linux环境的内核事实，不能当成macOS宿主内核事实。')+
 depthRun('runtime-scheduling','container_limits.py','container-native-run','python3 -B container_limits.py --output runs/container-record.json')+
 depthSource('runtime-scheduling','container_probe.py')]
];
Object.assign(containerDepth,{textbook:true,minutes:40,updated:'2026.11.08',refs:['rtNamespace','rtCgroup','rtDocker','cnCRI','cnOCI','cnLife']});

const schedulingDepth=articles.find(a=>a.id==='scheduling-resources');
schedulingDepth.sections=[
 ['一个Pod从提交到运行，要过哪些关',
 para('Pod描述要一起放在一个节点上运行的容器及其资源要求，节点是执行这些工作的机器或节点环境。调度器为尚未绑定节点的Pod选择位置；节点上的kubelet再推进容器创建。因此“没有运行起来”至少要分清对象是否被接收、是否选中节点、节点能否启动和应用是否就绪。',
 '准入是API接收对象前的一组规则检查，ResourceQuota是按命名空间控制资源总预算的对象；命名空间用于组织API对象和相应策略范围。若配额不允许新Pod，对象可能根本不存在。通过准入以后，调度还要找到可行节点；绑定以后，镜像、网络、卷和探针继续影响运行。')+
 figure('v48-scheduler-stage-path','本次实测分别出现：配额拒绝后无Pod对象；CPU请求超单节点后Pending；添加容忍后成功绑定。每个结论读取对应层事实。')+
 para('本章先讨论普通Pod。AI平台还可能在前面放一层作业队列准入，等待整组资源或配额；控制器随后才创建工作Pod。平台“排队”、API拒绝和Pod不可调度不是同一个状态，不能仅给用户一个持续旋转的“启动中”。')],
 ['request、limit和用量是三笔账',
 para('request声明调度时需要承诺的资源，limit规定运行时允许使用的上限，实际用量是在某个采样窗口内观察到的消费。CPU常用m表示千分之一核，250m=0.25 CPU；内存Mi与Gi是二进制单位。节点Allocatable表示可交给Pod使用的容量口径，区别于机器标称容量和此刻空闲量。',
 '调度器按已分配的请求及规则检查可行性，不会因为监控上CPU现在很低，就把这些承诺全部忽略。CPU limit通常由运行时映射到带宽预算，内存到限则涉及回收和OOM；因此“调度成功”和“运行不受限制”也要分开。')+
 table(['账本','主要问题','例子'],[['配额账','命名空间还能接多少声明','requests.cpu总额300m'],['节点账','一个Pod能放进哪台节点','本例两节点各4 CPU'],['运行账','被放下后怎样消费','50m请求、实际接近空闲'],['用户时间账','多久真正完成','排队+启动+执行+收尾']])+
 para('Pod请求不应只把常规容器机械相加。普通初始化容器（init container）在业务容器前依次运行；持续提供辅助工作的容器通常称为sidecar，其中一种实现是可重启的初始化容器。串行初始化的最大需求、并行常规容器的合计、这些持续运行的辅助容器，以及Pod运行额外开销（overhead），会影响有效请求。规则还受版本与配置影响。本实验只用一个常规容器，无这些附加项，便于核对单一机制；生产清单要按实际版本计算。')],
 ['配额拒绝后，为什么查不到那个Pod',
 para('命名空间quota-lab的requests.cpu硬额度为300m。先创建250m的Pod，剩余50m；再申请100m，总承诺将变为350m，超过300m。API拒绝第二个声明，随后按名称查询确认对象不存在。此时再去排查调度器为什么没选节点，方向已经错了。',
 '配额看的是声明和已使用预算，不是某秒钟的CPU消耗。即使第一个Pod实际几乎空闲，250m也仍计入请求账。删除、终止和配额使用状态更新存在各自过程，平台应按实际对象与服务端返回复核，不能仅凭客户端提交次数扣账。')+
 code('与真实实验相同的预算','YAML','apiVersion: v1\nkind: ResourceQuota\nmetadata:\n  name: cpu-budget\n  namespace: quota-lab\nspec:\n  hard:\n    requests.cpu: 300m')+
 para('本例用直接创建Pod把准入失败看清楚。若提交的是Deployment，Deployment对象可能被接受，但其控制器创建子Pod时遇到配额错误；应沿父对象、子对象与事件查证，不能把“父对象存在”误当“每个副本都已通过准入”。')],
 ['逐节点检查资源，再求可行集合',
 para('一个普通Pod整体绑定一个节点。声明的CPU与内存必须在同一个节点上同时满足，不能把A剩余CPU与B剩余内存拼成一台虚拟节点。手算例：A剩4 CPU/4Gi，B剩2 CPU/8Gi，待放3 CPU/6Gi；A缺内存，B缺CPU，两台总量够也没有可行节点。')+
 figure('v48-scheduler-feasibility','左侧为声明手算的资源矩阵；右侧为实际kind记录：两个节点各Allocatable 4 CPU，单Pod请求5 CPU仍Pending。不可把kind节点容量相加当物理总容量。')+
 para('实际kind集群的两个工作节点各报告4 CPU可分配。程序按其中最大值再加1 CPU生成5 CPU请求，两个节点都放不下，Pod的PodScheduled=False、reason=Unschedulable且nodeName为空；另一个50m小Pod可以运行。它们是两个独立对象，不是原地修改一个Pod的CPU声明。',
 '这也解释单Pod请求4张GPU时，两个节点各空2张不能满足。若拆成两个Pod，就已经改成多工作进程任务，还需定义它们怎样发现彼此、共同启动与恢复。节点可放只是第一步，网络拓扑、设备型号与存储约束仍可能决定训练是否值得这样放。')],
 ['标签、亲和、污点与抢占分别改变哪道条件',
 para('标签是对象上的键值标记，nodeSelector要求节点标签匹配。Pod亲和性让某些Pod相近放置，反亲和性让它们分开；required表示调度时必须满足，preferred只影响偏好。拓扑域由某个节点标签划分，例如kubernetes.io/hostname表示主机域。',
 '污点是节点声明的排斥条件，容忍是Pod对相应排斥的匹配许可。NoSchedule会阻止新放置的、不匹配容忍的Pod；添加容忍只是通过这一道检查，不要求一定选这台节点，也不解除资源与反亲和限制。NoExecute还涉及对已运行Pod的驱逐，不能把两种效果混用。')+
 figure('v48-scheduler-constraint-matrix','实际三步：A已有spread-0、B有污点时spread-1无处可放；添加匹配容忍后放到B；第三个Pod即使有容忍，也因两个主机域都已有同类Pod而等待。')+
 para('本例要求app=spread的Pod在不同主机域，B又有dedicated=training:NoSchedule污点。第二个Pod一开始在A被反亲和挡住，在B被污点挡住；只给它添加匹配容忍，就能在B就绪。第三个带同样容忍的Pod仍Pending，因为两个域都已有同类Pod。容忍是许可，不是容量，也不是反亲和的豁免。',
 '优先级决定调度与潜在抢占的顺序。抢占是尝试移走较低优先级工作以获得可行位置，不会把5 CPU节点变成6 CPU，不会创造第三个主机域，也不能随意消除污点等硬约束。Pod中断预算（PDB）限制特定自愿中断中允许减少的可用副本；调度抢占对它的遵守是尽力而为，不能当成绝不被抢占的保证。')],
 ['把调度等待放回端到端完成时间',
 para('设方案甲排队4分钟、执行18分钟，方案乙排队15分钟、执行10分钟。忽略其他阶段时，甲22分钟、乙25分钟；乙运行更快，用户却更晚完成。真实记录还需拆开对象接收、队列准入、调度绑定、镜像与卷准备、应用启动、执行及结果提交。',
 '调度优化先明确目标：降低等待、提高吞吐、满足优先级或改善通信拓扑，可能有不同选择。单个节点利用率高不能替代用户完成时间，填满所有空隙还可能增加碎片或影响大作业启动。数据读取与结果落盘也在任务路径内，不能只给GPU计算阶段计时。',
 '节点自动扩容同样不是“Pending出现就必然有机器”。模板是否能满足资源形状、配额是否允许、供应商是否有库存、启动与注册多久、数据和设备是否准备好，都要逐项看证据。把仍在供应商申请阶段的等待记成调度器故障，会误导排障和SLO。')+
 linkTo('gpu-scheduling','继续学习AI作业队列与整组放置')],
 ['用对象、条件和事件判断卡在哪里',
 table(['观察顺序','直接证据','下一步'],[['对象是否存在','API错误与按名查询','配额、校验或控制器创建失败'],['是否已选节点','spec.nodeName、PodScheduled条件','资源、标签、污点、亲和与拓扑'],['节点是否启动容器','容器状态与Events','镜像、网络、卷与入口'],['应用是否能接流量','Ready、端点与业务请求','探针语义、依赖与响应内容']])+
 code('只读排查；上下文与命名空间换成目标测试集群','BASH','kubectl --context TEST -n demo get pod POD -o json\nkubectl --context TEST -n demo describe pod POD\nkubectl --context TEST -n demo get resourcequota -o yaml\nkubectl --context TEST get nodes -o json')+
 para('事件可能聚合、延迟或过期；人类可读原因也可能包含多个候选节点的失败汇总。实验以API对象是否存在、条件值和实际绑定为核心判据，保留事件辅助解释，不把某个版本的整句英文消息硬编码成唯一真相。',
 '复习题：先有配额12 CPU、已承诺10 CPU，再来3 CPU，在哪一层失败？把配额改16后，若A仅剩4 CPU/4Gi、B仅剩2 CPU/8Gi，而Pod要3 CPU/6Gi，为什么仍等待？答案分别是准入预算与无可行节点；提高优先级不自动补出缺少的内存。')],
 ['在隔离kind集群重放完整链条',
 para('程序创建随机命名的kind集群：一个控制面节点、两个工作节点；每次kubectl都显式指定本次临时kubeconfig与context，结束只删除自己创建的集群。本轮实际运行kind v0.33.0和固定摘要的Kubernetes v1.35.8节点镜像。README给出安装与核对方式，实验不会使用用户当前默认集群。',
 'kind的“节点”是同一台Linux宿主上的容器。它让API与调度器真实运行，但两个节点报告的CPU/内存不是两台独立物理机的总供给。此处只验证配额、过滤、约束和绑定行为，没有验证跨主机通信、云CNI/CSI、生产伸缩或性能。')+
 depthRun('runtime-scheduling','schedule_lab.py','scheduler-native-run','python3 -B schedule_lab.py --output runs/scheduling-record.json')]
];
Object.assign(schedulingDepth,{textbook:true,minutes:45,updated:'2026.11.08',refs:['rtResources','rtQuota','rtAssign','rtTaint','rtKind','kueue']});
const c4Coverage=cloudCoverageRows.find(r=>r[0]==='C4');
c4Coverage[2]='八篇展开运行时、控制面、工作负载、调度、CNI、CSI、配置与HPA；已在Linux Docker读取实际namespace/cgroup限制，并用kind验证配额拒绝、CPU形状、污点与反亲和。';
c4Coverage[3]='kind是单机节点容器实验；真实多物理节点、云CNI/CSI、生产伸缩与Operator实现仍待专项验证。';
