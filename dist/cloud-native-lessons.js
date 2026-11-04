// Cloud mechanisms: original prose and examples, stable Linux/Kubernetes APIs.
{
const first = systemChapters.length;
Object.assign(sources, {
 cnOCI:['OCI Runtime Spec 1.2.1 · Linux configuration','https://github.com/opencontainers/runtime-spec/blob/v1.2.1/config-linux.md'],
 cnCRI:['Kubernetes · CRI','https://kubernetes.io/docs/concepts/containers/cri/'],
 cnLife:['Kubernetes · Pod lifecycle and termination','https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/'],
 cnWork:['Kubernetes · Workload management','https://kubernetes.io/docs/concepts/workloads/controllers/'],
 cnDisrupt:['Kubernetes · Disruptions and PDB','https://kubernetes.io/docs/concepts/workloads/pods/disruptions/'],
 cnService:['Kubernetes · Service','https://kubernetes.io/docs/concepts/services-networking/service/'],
 cnCNI:['Kubernetes · Network plugins','https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/'],
 cnPolicy:['Kubernetes · NetworkPolicy','https://kubernetes.io/docs/concepts/services-networking/network-policies/'],
 cnPV:['Kubernetes · Persistent volumes','https://kubernetes.io/docs/concepts/storage/persistent-volumes/'],
 cnSC:['Kubernetes · StorageClass and binding','https://kubernetes.io/docs/concepts/storage/storage-classes/'],
 cnCSI:['Kubernetes · CSI volumes','https://kubernetes.io/docs/concepts/storage/volumes/#csi'],
 cnHPA:['Kubernetes · Horizontal Pod Autoscaling','https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/'],
 cnEnv:['AWS Lambda · Execution environment lifecycle','https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html'],
 cnRetry:['AWS Lambda · Invocation retries','https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html'],
 cnSQS:['AWS Lambda · SQS event source mapping','https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html'],
 cnConcurrency:['AWS Lambda · Concurrency','https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html'],
 cnPrice:['AWS Lambda · Pricing units','https://aws.amazon.com/lambda/pricing/'],
 cnFC:['阿里云函数计算 · 计费概述','https://help.aliyun.com/zh/functioncompute/billing-overview-of-fc'],
 cnEvent:['Knative Eventing · Event delivery','https://knative.dev/docs/eventing/event-delivery/']
});
const nativeDownload='<p class="practice-links"><a href="labs/cloud-native.zip" download>下载本章配套文件 ↓</a><a href="labs/cloud-native/validation.json" target="_blank" rel="noopener">查看本地验证范围 ↗</a></p>';

chapter('native','C4.1','container-runtime','容器运行原理：镜像、进程、隔离与资源',
 '从一个镜像启动到进程退出，分清 namespace、cgroup、CRI 与 Kubernetes 各自做了什么。',
 '知道进程、文件描述符和 CPU / 内存；内存基础可先读 C0 的虚拟内存章节。',
 ['镜像：解释层、摘要与可写层','隔离：区分资源视图、配额和内核边界','执行：沿运行时与停止信号定位失败'],[
 ['同一个镜像，为什么换一处就失败',para('日报 API 在开发机上运行正常，进入集群后却无法写缓存，退出时还丢了最后一批请求。先不要把“镜像一样”解释为“环境完全一样”：镜像携带文件系统与启动配置，运行时还提供挂载、用户身份、环境变量、网络、资源边界及内核。开发机挂载的宿主目录、当前工作目录和本地凭证不会自动进入集群。','把启动拆成三个对象。镜像是只读内容与配置；容器是根据镜像创建的一次运行实例，通常有独立可写层；进程是实际被内核调度的执行实体。Kubernetes 的 Pod 再包一层共同生命周期和部分共享资源。一个容器内可以有多个进程，一个 Pod 也可以有多个容器，不能把任何一层机械地等同于一个进程。')],
 ['镜像层不是一次完整机器快照',para('镜像清单引用配置与各层内容，摘要用于验证内容身份。多平台标签可能先指向镜像索引，再按节点架构选出具体清单；因此记录标签、索引与实际平台摘要，比只记一个 latest 更可追溯。容器增加可写层，底层的联合文件系统把层组合成应用看到的路径。修改只读底层文件时可能发生 copy-up，随机写入大文件可能带来额外开销。','删除上层路径不会让基础镜像层中的字节从镜像分发内容里消失。把凭证写入某层、再在下一层删除，不能保证凭证没有留在历史层。运行时可写层也不适合作为数据库的持久承诺：容器重建可能换一份可写层，临时目录是否保留应查具体卷与环境的生命周期。')+table(['对象','留下什么','不保证什么'],[['镜像摘要','可核对的文件与启动配置','数据库状态、外部配置、宿主内核一致'],['容器可写层','该实例对镜像的改动','重建后业务数据仍存在'],['volume 挂载','由卷类型定义的数据生命周期','应用事务一致、已异地备份']])],
 ['namespace 回答能看见什么，cgroup 回答能用多少',para('Linux namespace 划分进程看到的 PID、挂载、网络、IPC 等视图。它不是每个容器拥有一份内核；具体哪些 namespace 新建、哪些共享，由运行配置决定。普通 Pod 内容器共享网络空间，通常可以经 localhost 互访；PID 空间是否共享另有配置，不能顺着网络共享推导所有资源都共享。','cgroup 把进程归组并对资源记账或约束。CPU request 影响集群放置与竞争权重；CPU limit 通常映射到配额，运行一阵后耗尽预算的线程会等待，即使主机其他核暂时空闲。内存限制涉及回收、记账与 OOM 路径；不是超出一字节就立即由 Kubernetes 杀 Pod。namespace 隔离了视图，cgroup 约束了消费，两者仍不能替代能力集、系统调用过滤、只读根文件系统与宿主安全。')],
 ['从 Pod 到宿主进程：沿职责查一遍',figure('v10-pod-path','从声明、绑定、CRI 到进程与流量；各阶段都有独立证据。')+para('API Server 接受声明后持久化对象；控制器根据期望创建 Pod，scheduler 为尚未绑定的 Pod 选择节点。绑定不等于容器已经运行。目标节点的 kubelet 通过 CRI 请求运行时管理 sandbox、镜像和容器；CRI 是 gRPC 接口，OCI 是描述容器配置与运行要求的一组规范，二者处在不同边界。','创建 sandbox 时网络插件失败、拉镜像失败、挂载卷失败、执行入口不存在，会停在不同阶段。先查对象状态和 Events，再决定去看 registry、CSI、CNI 还是应用日志。只用一次 kubectl logs 没有输出，无法证明业务程序没有错误，也可能程序根本还未被执行。')+code('分阶段取证（替换命名空间与 Pod 名）','SH',[
 'kubectl -n demo get pod reports-xxxxx -o wide',
 'kubectl -n demo describe pod reports-xxxxx',
 'kubectl -n demo get pod reports-xxxxx -o json',
 'kubectl -n demo logs reports-xxxxx -c api --previous',
 '# --previous 只适用于该容器确实存在上一次实例；无实例时转查 Events'
 ].join('\n'))],
 ['停止信号先到谁，谁负责排空',para('容器的主进程承担接收停止信号和处理子进程的责任。常见默认停止信号是 SIGTERM，也需核对镜像 STOPSIGNAL 与运行时。用 shell 启动业务却不 exec、也不转发信号，可能让业务进程错过优雅退出。终止不是“立即切断所有请求”：端点传播、已有连接、入口缓存和本地停止分别发生，应用要在有限宽限期内停止接新工作并排空已接工作。','preStop 和业务排空消耗同一份 terminationGracePeriodSeconds 预算。假设总预算 30 秒，preStop 已用 12 秒，应用不能再假设还有完整 30 秒。预算耗尽后可能收到强制终止信号，因此重要任务的提交点、幂等标识和检查点要独立设计。readiness 变为 false 也不能证明所有现存 TCP 连接已经断开。')+code('入口脚本：让业务成为主进程','SH',['#!/bin/sh','set -eu','exec python -m report_api'].join('\n'))],
 ['三个读数，分别证明三层事实',table(['观察','能够支持','仍需核查'],[['镜像拉取成功','内容已到节点并通过相应解析','入口命令、动态库和权限'],['进程 Running','进程存在且未退出','监听地址、健康条件和 Service 端点'],['节点 CPU 低、容器慢','主机瞬时用量低','cpu.stat 节流、锁等待、网络、连接池']])+para('只读诊断可以比较容器 cgroup 的 cpu.stat、memory.current、memory.events 与进程状态。统计单位和采样区间必须一致：一次累计 throttled_usec 不是这一秒节流时长，需做差并对齐负载。进程 RSS、容器记账与宿主 used 口径不同，不应相加后宣称发生了“丢失的内存”。')],
 ['把容器故障改写成可验证假设',para('现场先写一句可证伪的判断：“容器因只读根目录而无法创建缓存文件”。下一步应验证实际运行用户、挂载和报错路径，而不是先加 privileged。再如“主进程未转发信号”，需要观察进程树、信号到达和退出时间；仅把宽限期调大可能掩盖同一个错误。','练习时固定镜像，逐次只改一项：运行用户、写入路径、CPU 配额或入口脚本。每次留下运行条件、观察与结论。这些是测试集群操作建议，本站没有用本地数学实验替代容器运行验证。')+nativeDownload]
 ],['容器内看到 PID 1，能否证明它有自己的内核？停止时所有子进程一定都收到 SIGTERM 吗？','不能。PID 是 namespace 中的视图；普通容器共享宿主内核。停止信号送达主进程后的转发与回收取决于入口和程序实现，需观察进程树与退出时间。'],['cnOCI','cnCRI','cnLife','resources'],['linux-resource','virtual-memory-oom','k8s-workloads']);

chapter('native','C4.3','k8s-workloads','Kubernetes 工作负载：从声明到可用与滚动更新',
 '用三副本 HTTP 服务贯穿 Deployment、调度、探针、端点与排空，定位每一种“没有起来”。',
 '先读容器运行原理与 Kubernetes 控制面；知道 Pod、Service 和期望状态。',
 ['控制：区分 Deployment、Job 与 StatefulSet','发布：计算 surge 与 unavailable','排障：按调度、启动、健康和业务取证'],[
 ['apply 成功，只完成了哪一步',para('提交三副本日报服务后，API 返回成功，但用户仍收到 503。apply 成功先说明声明已被服务端接受，不说明三个进程已经存在，更不说明业务可用。API Server 做认证、授权、准入与对象校验，状态通过存储进入系统；控制器观察变化再创建子对象。整个过程由多个持续调谐的控制循环推进，不是一条可靠执行到底的同步脚本。','Deployment 维护 ReplicaSet，ReplicaSet 维护 Pod 数量；scheduler 给未绑定 Pod 找节点；kubelet 执行节点上的工作。各组件可以短时失败并继续调谐，因此排障要追踪实际对象链和当前版本。status.observedGeneration 有助于判断控制器是否已经观察到期望的新一代配置，但不能单独证明下游业务正确。')+figure('v10-pod-path','对象链、节点执行与流量端点是三个相连但独立的过程。')],
 ['先选工作负载，再写副本数',table(['类型','需要的语义','必须补的边界'],[['Deployment','可替换副本，适合常见无状态在线服务','应用状态和外部副作用另行管理'],['StatefulSet','稳定序号、网络标识与卷关联','不自动提供数据库复制、备份或主从仲裁'],['DaemonSet','在符合条件的节点上运行节点级组件','并非全群固定副本数，也受节点选择与资源影响'],['Job / CronJob','以完成为目标；定时产生作业','失败重试、并发策略和应用幂等，不能假设调度恰好一次']])+para('工作负载类型表达期望，不能代替应用协议。把 MySQL 换成 StatefulSet 不会自动变成高可用集群；用 Job 执行一次扣款也不代表只扣一次。状态存在哪里、谁决定主身份、重复执行如何核实，都要由相应系统回答。')],
 ['三副本滚动更新，先算允许范围',para('设期望 replicas=3，maxSurge=25%，maxUnavailable=25%。surge 向上取整得到 1；unavailable 向下取整得到 0。更新目标是保持至少 3 个可用副本，同时通常允许多创建 1 个新 Pod。若集群只够放 3 个 Pod，新增副本一直 Pending，旧副本又不能降低可用数，更新就可能卡住。','不要把“通常最多四个”当成瞬时资源总量的硬保证：终止中的 Pod 仍可能在宽限期里占 CPU、内存和连接，资源回收有延迟。对容量紧张的集群，应同时预算新副本、旧副本排空和下一批的启动峰值。更新 Pod template 才触发新的 rollout；仅改 replicas 是伸缩。')+code('Deployment 关键字段；完整清单见下载包','YAML',[
 'spec:', '  replicas: 3', '  minReadySeconds: 5', '  strategy:', '    type: RollingUpdate', '    rollingUpdate:', '      maxSurge: 25%', '      maxUnavailable: 25%', '  template:', '    spec:', '      terminationGracePeriodSeconds: 30'
 ].join('\n'))],
 ['三种探针为什么不能共用一个昂贵依赖检查',para('startup 给慢启动进程留出初始化窗口；配置它后，liveness 与 readiness 等启动成功再执行。readiness 决定常规服务流量资格，失败本身不重启进程；liveness 达到连续失败阈值后触发容器终止，再依适用重启策略处理。把数据库短时失败塞进 liveness，可能在数据库最繁忙时重启所有前端，制造恢复风暴。','健康路径应轻量、含义明确。进程活着不代表能接新工作；readiness 应反映当前接流量资格，但也要避免让一个共享依赖故障摘掉所有副本。阈值、周期、超时决定发现延迟，端点和代理更新又有传播延迟。探针成功之后仍要从真实 Service 路径验收响应内容与时延。')+code('示例容器探针','YAML',[
 'startupProbe:', '  httpGet: {path: /healthz, port: http}', '  periodSeconds: 2', '  failureThreshold: 30', 'readinessProbe:', '  httpGet: {path: /readyz, port: http}', '  periodSeconds: 3', '  failureThreshold: 2', 'livenessProbe:', '  httpGet: {path: /healthz, port: http}', '  periodSeconds: 10', '  failureThreshold: 3'
 ].join('\n'))],
 ['四种失败，四个取证入口',table(['现场','先查看','要区分的原因'],[['Pending / PodScheduled=False','Events、资源 requests、亲和、taint、卷拓扑','放不下、不允许、卷未准备'],['Waiting / ImagePullBackOff','容器状态、镜像引用、registry 凭证、节点网络','错误镜像与暂时回退状态'],['反复退出 / CrashLoopBackOff','lastState、exitCode、reason、previous logs','入口异常、程序崩溃、OOM、探针终止'],['Running 但无流量','Ready、EndpointSlice、Service 端口和业务探测','就绪问题与网络转发问题']])+para('CrashLoopBackOff 和 ImagePullBackOff 是等待重试的表现，不是完整根因。137 通常意味着被 SIGKILL 结束，但不能仅凭退出码判定内存超限；应结合 OOMKilled、memory.events、节点压力与终止事件。一次正常探针响应也不能排除间歇性失败，要对齐重启时间和流量变化。')],
 ['PDB、滚动更新和节点故障分别约束什么',para('PodDisruptionBudget 用于限制经 Eviction API 发起的自愿驱逐，例如节点维护时 drain 发出的驱逐请求。Deployment 自己做滚动更新不受 PDB 直接约束，它看的是自己的更新策略。滚动更新产生的不可用仍会占用 disruption budget，因此可以阻止同时进行的另一次维护驱逐。','节点突然故障等非自愿中断会影响可用性，PDB 无法预防；直接删除 Pod 也不等同于遵守预算的驱逐实验。真正的高可用还需故障域分布、剩余容量与依赖可用性。预算设为不允许任何中断时，也要设计维护出口，避免只把运维长期卡住。')],
 ['排空与回退：对象恢复后还要核对用户结果',para('终止期间应停止接新任务、让可完成的请求结束，并在宽限期内关闭。端点摘除、入口的连接复用与应用收到停止信号没有固定的零延迟总顺序。长任务需要检查点或可重放输入；外部写入需要稳定操作标识。单纯 sleep 若没有传播和负载证据，只是在猜等待时间。','rollout undo 恢复的是旧 Pod 模板，不会把数据库迁移或外部配置一并恢复。发布验收应记录镜像摘要、配置、数据契约与用户断言；观察新请求成功率、延迟和旧实例排空，再宣布恢复。')+code('测试集群观察顺序','SH',[
 'kubectl -n infra-lab rollout status deployment/reports --timeout=120s',
 'kubectl -n infra-lab get rs,pod -l app=reports',
 'kubectl -n infra-lab get endpointslices -l kubernetes.io/service-name=reports -o yaml',
 'kubectl -n infra-lab get events --sort-by=.metadata.creationTimestamp'
 ].join('\n'))],
 ['一份清单，三次单变量练习',para('下载包包含三副本 Deployment、Service、HPA 与 PDB，面向已有独立测试集群。先确认镜像可访问、metrics-server 和资源余量。只改一个条件：错误镜像引用、不可满足的 request，或错误的 Service selector；分别预测状态，再检查实际证据。完整清单以稳定 API 编写，已做离线结构核对，目标集群运行、CNI 和探针传播尚未实测。','每次练习保存“声明 → 事件 → 容器状态 → 端点 → 用户响应”五项记录。不能以手动 curl Pod IP 成功，直接宣布 Service 摘流或入口回退已经正确。')+nativeDownload]
 ],['三副本、surge 25%、unavailable 25%，新版本一个也调度不起来，为什么旧版可能一直不减少？PDB 能解决吗？','surge 为 1、unavailable 为 0，控制器需保持可用数；应先找新增 Pod 不可调度的原因并补容量或调整策略。PDB 管自愿驱逐，不会替 Deployment 解开更新资源约束。'],['cnWork','deploy','resources','probes','cnLife','cnDisrupt'],['container-runtime','kubernetes-basics','delivery','k8s-networking']);

chapter('native','C4.5','k8s-networking','Kubernetes 网络：从 DNS、Service 到容器回包',
 '跟踪一次 API 请求与一次容器出站，解释 CNI、Service 数据面、EndpointSlice 与网络策略。',
 '先读 VPC 的路由与回程；认识 Pod、网络命名空间、端口与 TCP 连接。',
 ['路径：画出入口、Pod 和返回方向','发现：区分 DNS、Service 与 EndpointSlice','隔离：同时检查源出站与目的入站'],[
 ['DNS 有答案，为什么请求仍然超时',para('同事从客户端 Pod 查询 reports.infra-lab.svc.cluster.local，返回了 ClusterIP，随后连接超时。DNS 成功说明名称解析这一段有效，尚未证明服务有后端、端口正确、网络允许或程序正在监听。先画“名称 → 服务入口 → 可用后端 → Pod 端口 → 应用处理 → 返回”，每一箭头都需要可区分的证据。','Pod IP 标识当前 Pod 的网络端点，普通 Pod 被替换后地址可以改变；Service 提供相对稳定的访问抽象。对有 selector 的普通 Service，控制面根据标签匹配维护 EndpointSlice。无 selector Service、headless Service、ExternalName 各有不同语义，不能都套入一个 ClusterIP 的转发图。')+figure('v10-service-path','控制面维护后端；数据面处理连接。DNS 解析、端点和监听应分别检查。')],
 ['三个端口和一组标签，最容易在哪接错',code('普通 selector Service','YAML',[
 'apiVersion: v1','kind: Service','metadata:', '  name: reports','  namespace: infra-lab','spec:', '  selector: {app: reports}', '  ports:', '    - name: http','      port: 80','      targetPort: http'
 ].join('\n'))+para('这里客户端连 Service 的 80，后端目标由 Pod 中名为 http 的容器端口解析。containerPort 是声明信息，不会替程序启动监听，也不会让只绑定 127.0.0.1 的进程自动对 Pod IP 开放。selector 拼错时 Service 对象可以正常存在，却没有预期后端。','检查所有标记 kubernetes.io/service-name=reports 的 EndpointSlice，不能只看第一份。端点出现不等于一定接新流量，还要看 ready、serving、terminating 与服务配置。publishNotReadyAddresses 是就绪处理的例外；终止期的路由行为也受代理实现和端点集合影响，不能写成“readiness 一失败，所有连接立刻断开”。')],
 ['CNI、kube-proxy 与 DNS 不在同一层',para('CNI 插件参与 Pod 网络配置，建立接口、地址与相应路由；不同方案可以使用路由、隧道或其他数据面。Service 转发可由 kube-proxy 的规则实现，也可由兼容实现提供，例如使用 eBPF 的数据面。排查前先确认实际组件与模式，不能假设集群里一定有 iptables 规则或一定经某个用户态代理转发。','集群 DNS 把名称变成服务或端点信息，不能代替包转发；CNI 正常不证明 NetworkPolicy 已执行；Service 转发正常也不保证 Pod 到外部 registry 的链路正常。跨节点路径若使用封装，额外头部会影响可用 MTU；只有确认具体 IPv4 / IPv6、隧道和链路开销后，才可计算应该减少多少字节。')],
 ['容器出站要把回程一起画出来',para('以常见桥接加 SNAT 为教学路径：应用调用解析器取得远端地址，内核按路由把包从容器接口送到宿主，宿主按网络方案路由或转发；若使用 SNAT，会改写源地址并维护连接跟踪。远端回包先到转换后的地址，再由状态反向映射到原容器。host 网络、不做 NAT 的可路由 Pod 网络，路径又不同。','因此“出站端口已放通”不是完整连通性证明。还需返回路由、安全组或 ACL 的方向规则、NAT 容量、conntrack 状态与实际监听。大量短连接可能消耗临时端口和连接跟踪项；盲目增加应用重试会进一步放大压力。若 DNS 使用 UDP 和 TCP，两种路径也要按实际解析需求检查。')],
 ['NetworkPolicy 是允许规则的组合，不是顺序防火墙脚本',para('策略用标签选择 Pod，在 ingress 与 egress 两个方向独立定义隔离。源 Pod 的出站若被隔离，需要相应 egress 允许；目的 Pod 的入站若被隔离，也需 ingress 允许。同一端同一方向的多条允许策略取并集，不按文件顺序互相覆盖。策略对象只有在网络实现支持执行时才真正限制流量。','下面只演示允许 client 标签访问 reports 的 TCP 8080，不是完整的默认拒绝套件。它限制目标 Pod 的入站，不自动给客户端开放 DNS 或外部访问；namespaceSelector 需要核对命名空间标签，podSelector 的作用域也要讲清。普通 NetworkPolicy 的 L3/L4 规则不提供 URL、用户或 HTTP 方法授权。')+code('同命名空间的最小入站例子','YAML',[
 'apiVersion: networking.k8s.io/v1','kind: NetworkPolicy','metadata: {name: reports-ingress, namespace: infra-lab}','spec:', '  podSelector: {matchLabels: {app: reports}}','  policyTypes: [Ingress]','  ingress:', '    - from:', '        - podSelector: {matchLabels: {role: client}}','      ports:', '        - {protocol: TCP, port: 8080}'
 ].join('\n'))],
 ['入口、网格与重试：多一层就多一份预算',para('集群外请求还可能经过云负载均衡、Ingress 或 Gateway，再到 Service 和 Pod。L4 入口按传输连接转发，L7 代理理解 HTTP 路由与协议，TLS 在哪里终止决定哪段仍加密及证书由谁持有。Service mesh 通过数据面代理等方式提供服务间流量能力，控制面下发策略；不能把所有网格方案简化成同一种 sidecar 实现。','每层都重试两次时，尝试会成倍放大。要沿调用链传播截止时间，给建连、处理与回包分预算，再限定谁负责重试、哪些动作可安全重试。已有连接复用会让请求流量占比偏离副本占比，因此“新副本占 10%”不等同于“新版本收到恰好 10% 请求”。')],
 ['按能排除原因的顺序探测',table(['测试位置','观察','下一步'],[['客户端 Pod 内解析名称','解析失败 / 地址不符','解析配置、DNS 服务与到 DNS 的网络'],['查看 Service 与全部切片','无端点 / 端口或标签错误','修正选择与就绪条件，再测'],['同位置直连目标 Pod 端口','直连也失败','监听、策略、Pod 网络与回程'],['Pod 直连成功，Service 失败','相同应用不同路径','服务数据面、连接状态和实际代理'],['Service 成功，外部失败','入口之外仍有差异','云 LB、路由、TLS、网关和返回方向']])+code('只读集群证据','SH',[
 'kubectl -n infra-lab get svc reports -o yaml',
 'kubectl -n infra-lab get endpointslices -l kubernetes.io/service-name=reports -o yaml',
 'kubectl -n infra-lab get pods -l app=reports -o wide',
 'kubectl -n infra-lab get networkpolicy -o yaml'
 ].join('\n'))],
 ['把链路图变成面试答案',para('先说明前提：“以普通 ClusterIP、selector Service 和当前集群的 CNI 为例”。随后画去程与回程，标出名称解析、地址转换、策略与端点资格。最后给一个能区分假设的测试，而不是一次性背出所有网络命令。','练习把 selector 写错、targetPort 写错和应用只监听 localhost 分别注入测试环境，预测它们的 DNS、切片、TCP 和日志会有什么不同。本站下载清单可作为起点，未声称已经在真实 CNI 下完成这些注入。')+nativeDownload]
 ],['DNS 返回 ClusterIP，但没有业务响应。直接 curl Pod IP 成功能排除什么，不能排除什么？','说明该测试位置到特定 Pod 端口的应用路径可工作；仍不能证明 Service 的选择、端口、所有后端、代理规则与外部入口都正常。需在同一源位置控制变量并核对切片。'],['cnService','endpoints','cnCNI','cnPolicy'],['container-runtime','vpc-network','network-diagnosis','k8s-workloads']);

chapter('native','C4.6','k8s-storage','Kubernetes 存储：PVC、拓扑、挂载与数据恢复',
 '从一份 10Gi 声明追到底层卷，分清 Pending、Bound、挂载成功和业务恢复。',
 '先知道文件、块与对象存储的差别，认识 Pod 调度和故障域。',
 ['生命周期：追踪 PVC、PV、CSI 与后端卷','拓扑：解释延迟绑定与访问模式','恢复：区分保留、快照、备份和应用一致'],[
 ['PVC 显示 Bound，为什么应用还报错',para('日报任务申请 10Gi 持久卷，PVC 很快变成 Bound，Pod 却仍等待挂载。Bound 说明声明与 PV 已绑定，不说明目标节点上的设备连接、文件系统挂载、权限和应用读写都完成。卷在另一个可用区、驱动组件异常、挂载点权限不匹配，分别会留下不同证据。','画完整链条：用户提交 PVC，控制面匹配静态 PV 或借助 StorageClass 触发动态制备；调度决定消费者的节点；CSI 驱动按实现完成所需的 controller 与 node 操作，最后应用访问挂载路径。不是所有驱动都需要独立 attach 步骤，排查时应按实际驱动而非背固定调用数量。')],
 ['四个对象，四种生命周期',table(['对象','作用域与作用','检查字段'],[['PVC','命名空间内的存储请求','容量、accessModes、storageClassName、绑定 PV'],['PV','集群级的卷抽象','driver、volumeHandle、拓扑、reclaimPolicy'],['StorageClass','制备策略','provisioner、parameters、volumeBindingMode'],['CSI 驱动与后端卷','连接编排与实际存储系统','驱动健康、卷身份、节点状态与存储事件']])+para('PVC 与 PV 的绑定是一对一关系，不表示数据只有一份副本，也不表示只有一个进程在写。PV 对象的元数据和实际卷内容又在不同系统。删除其中一个对象时，后端是否删除、是否仍需人工处理，要回到回收策略、驱动与管理流程。')+code('需替换为目标集群已有的 StorageClass','YAML',[
 'apiVersion: v1','kind: PersistentVolumeClaim','metadata: {name: reports-data, namespace: infra-lab}','spec:', '  storageClassName: standard # 示例名；先核对 kubectl get storageclass', '  accessModes: [ReadWriteOnce]', '  resources:', '    requests: {storage: 10Gi}'
 ].join('\n'))],
 ['为什么等消费者出现反而更容易成功',para('Immediate 模式可能在尚未知道 Pod 要放在哪里时就制备卷。若卷只在 AZ-a 可挂载，而 Pod 因资源或硬亲和只能去 AZ-b，就产生互相矛盾的拓扑要求。WaitForFirstConsumer 延迟到有实际消费者，把节点资源、选择条件和卷拓扑一起考虑，依赖驱动支持。','没有消费者时 PVC Pending 可能是正常等待，不能据此重启存储插件。也不要用 Pod 的 nodeName 强行“帮调度器选好节点”：它会绕过调度器，可能使延迟绑定停住。需要定点测试时使用适合的 nodeSelector 或亲和规则，并看清这些约束是否仍与卷的可用区域一致。')],
 ['RWO 不是一把单 Pod 的文件锁',para('ReadWriteOnce 表示卷可被一个节点读写挂载，同节点上多个 Pod 仍可能使用它。ReadWriteMany 表示支持多节点读写挂载，不等于应用可以无协议地并发改同一文件。ReadWriteOncePod 在支持该模式的 CSI 环境里约束整个集群仅一个 Pod 挂载；它自 Kubernetes 1.29 稳定，仍需核对驱动与配套组件。','访问模式不能代替数据库锁、主身份仲裁和文件格式协议。两个进程同时把 JSON 当整文件覆盖，即使挂载方式允许，也可能丢更新。为数据库部署选择 StatefulSet、RWO 或 RWOP 后，仍应说明复制、写入者身份、事务日志与恢复点。')],
 ['Retain 保留的是卷，不是恢复方案',para('Delete 策略在符合条件的回收路径中通常会删除后端存储，具体由驱动实施；Retain 留下卷供后续人工管理。两者都不自动证明备份存在。误删 PVC、误写内容、勒索加密和区域故障是不同事件，单纯保留同一块卷无法覆盖所有场景。','假设 10:00 的快照只含已经落盘的页面，10:01 客户端收到交易成功，10:02 节点故障。能否恢复这笔交易取决于快照、日志、复制确认点及恢复工具，而不是“我们有快照”五个字。崩溃一致快照可能需要数据库恢复流程，应用一致备份还要协调日志与写入。')],
 ['卷容量、性能与扩容各有不同承诺',para('申请 10Gi 只定义容量需求，不等于承诺固定 IOPS、吞吐或尾延迟；性能可能依赖卷类型、大小、并发、块大小、缓存与后端配额。测试时区分顺序吞吐和小随机写、热缓存和冷读、单任务和多个共享使用者。报告 p99 时还要给样本窗口与错误、超时的计法。','扩容声明也不是所有文件系统和驱动都能在线完成同样过程。检查 StorageClass 是否允许扩容、PVC condition、后端卷大小、节点文件系统大小，逐层确认；不应通过删 PVC 来“刷新容量”。缩容、迁移和跨区复制通常需要另行设计。')],
 ['从 Pending 到文件内容的检查顺序',code('从声明到节点，再到数据','SH',[
 'kubectl get storageclass',
 'kubectl -n infra-lab get pvc reports-data -o yaml',
 'kubectl -n infra-lab describe pvc reports-data',
 'kubectl -n infra-lab describe pod reports-worker',
 '# 从 PVC 的 spec.volumeName 获取实际 PV 名，再检查：',
 'kubectl get pv ACTUAL_PV_NAME -o yaml',
 '# 挂载成功后还需用应用身份验证读写及恢复，不在诊断时格式化卷。'
 ].join('\n'))+para('先把事件按时间对齐。FailedScheduling 可能指出卷节点亲和冲突；FailedMount 或 FailedAttachVolume 指向后续挂载链；应用日志里的 EACCES 更接近用户、组、目录权限或安全上下文。不要在没有确认卷身份和内容时重建、格式化或清理。')],
 ['用一次恢复测试完成闭环',para('给测试数据加入业务序号与摘要，记录写入何时被确认；备份后在隔离环境恢复，验证能否读到约定序号、数据是否完整，以及消费者是否真能继续工作。恢复时间从故障发生还是从开始执行脚本计时，要预先约定；RPO 衡量丢失窗口，也要基于已确认写入。','练习分别解释三种情况：没有消费者导致 Pending、卷与 Pod 不在同一拓扑、PVC Bound 但应用无权限。每次提交对象状态、相关事件、卷身份与下一步验证。下载包只给清单和观察入口，真实 CSI 与数据恢复需要目标集群演练。')+nativeDownload]
 ],['将 PVC 的回收策略改成 Retain，能否证明 Kafka 元数据不会丢失？RWO 是否保证只有一个 Pod 写？','不能。Retain 不防误写或区域损毁，需核对实际卷、应用日志与恢复验证。RWO 限单节点读写挂载，不能当单 Pod 写入锁。'],['cnPV','cnSC','cnCSI'],['training-storage','storage-recovery','scheduling-resources','resilience']);

chapter('native','C4.8','k8s-autoscaling','Kubernetes 弹性：HPA、节点容量与排队预算',
 '手算副本建议，追踪从指标到新容量的延迟，解释为什么扩容了仍会超时。',
 '认识 CPU request / limit、Pod readiness 与单位换算；先读计算容量与弹性。',
 ['计算：用 request 做 CPU 利用率分母','时序：分开建议、创建、调度与就绪','边界：同时限制下游、队列和最大容量'],[
 ['四个副本 CPU 90%，为什么基础建议是六个',para('四个就绪 Pod 各 request 200m CPU，平均实际使用 180m。这里 1000m 等于一个 CPU 的时间配额量级，180/200=90% 是相对 request 的利用率，不是占主机总 CPU 的 90%，也不是相对 limit 的比例。目标设为 60%，基础建议为 ceil(4×90/60)=6。','这表示在当前总 CPU 工作量不变且可均匀分摊的简化条件下，六个副本每个约 120m，正好达到 200m 的 60%。HPA 控制器还处理容差、缺失指标、未就绪 Pod、速率、稳定窗口与上下界，因此公式不等于立刻有六个健康实例。多个指标通常取更大的建议；某指标读取失败而其余只建议缩容时，也可能跳过缩容。')+code('手算公式；具体控制器还有其它约束','TEXT',[
 'current = 4', 'usage = 180m / Pod', 'request = 200m / Pod', 'utilization = 180 / 200 = 0.90', 'target = 0.60', 'base recommendation = ceil(4 * 0.90 / 0.60) = 6'
 ].join('\n'))],
 ['改 request 会同时改变放置和扩缩容',para('若同样 180m 的使用量却把 request 改为 400m，相对利用率就降到 45%，基础建议变成 ceil(4×45/60)=3。应用没有突然变轻，这是分母改变了。request 同时参与调度；抬高它还会减少每节点可容纳的副本。使用 CPU utilization 时必须给相关容器配置合适的 CPU request，否则指标可能无法定义。','limit 是运行时上界，不参与上面这一步分母替换。若容器已被 CPU 配额明显节流，观察到的使用量还可能低估实际需求。并非所有队列工作都适合 CPU 指标：I/O 等待任务 CPU 低而积压很高，可考虑按队列、在途量或应用吞吐等业务指标建模，但必须核对指标延迟与语义。')],
 ['HPA、VPA、节点扩容分别改变哪里',table(['层','改变的量','仍可能卡在哪里'],[['HPA','目标工作负载副本数','Pod Pending、镜像拉取、探针与下游容量'],['VPA 类机制','每个 Pod 的资源建议或配置','重建 / 原地调整能力依版本和实现；与 HPA 指标有耦合'],['节点自动扩容','满足约束的节点容量','云配额、实例库存、节点加入与卷 / 网络拓扑'],['事件驱动伸缩','按事件指标调整副本或触发零到一','实现、触发器、冷启动与消息消费语义']])+para('HPA 发现压力创建 Pod，scheduler 发现放不下，节点扩容器才可能增加节点；接着还需系统组件、镜像、卷和应用预热。增加节点不能修复错误的硬亲和，增加 Pod 也不能让单主数据库无限扩展。观察实际不满足的约束，再选择该扩哪一层。')],
 ['七十五秒容量空窗，积压怎样算',para('教学假设：旧容量持续完成 120 次/秒，流量突然变为 180 次/秒；等待下一轮有效指标 20 秒、控制动作与放置 15 秒、应用初始化 40 秒，总计 75 秒内新容量尚不可用。若这段一直只有旧容量，队列增加 (180−120)×75=4500 次请求。这里是假设固定容量的一段模型；真实过程若逐渐增加容量，应分段积分。','新容量若刚好做到 180 次/秒，只能停止积压增加，不能清掉原有 4500。若新容量为 240 次/秒，流量保持 180，理论排空至少需要 4500/(240−180)=75 秒，尚未计时延分布和失败重试。在线请求若没有足够截止时间，需要提前保有余量、限流或降级，不能把队列无限增长当成扩容成功。')+figure('v10-scale-timeline','先积压，再用超过到达率的净余量排空；建议副本数不等于立即可用容量。')],
 ['稳定窗口取历史建议，不是机械睡眠',para('默认的缩容稳定窗口通常为 300 秒，可配置。简化理解是取近期窗口里的较高副本建议抑制抖动，而不是一看到低负载就开始固定睡五分钟。比如当前六副本，本轮基础建议三，但窗口里仍有六的建议，就不能据这一轮宣布会缩为三。','扩缩速率又是另一层：可以限制每段时间最多增加多少 Pod 或百分比。过快可能击穿下游连接池，过慢可能来不及消化积压。稳定窗口、速率、maxReplicas 与节点扩容时序要一起测试，尤其关注降容后的连接排空和再次突发。')+code('autoscaling/v2 的关键配置','YAML',[
 'apiVersion: autoscaling/v2','kind: HorizontalPodAutoscaler','metadata: {name: reports, namespace: infra-lab}','spec:', '  scaleTargetRef: {apiVersion: apps/v1, kind: Deployment, name: reports}', '  minReplicas: 3', '  maxReplicas: 12', '  metrics:', '    - type: Resource', '      resource:', '        name: cpu', '        target: {type: Utilization, averageUtilization: 60}', '  behavior:', '    scaleDown:', '      stabilizationWindowSeconds: 300'
 ].join('\n'))],
 ['可用性上限常在下游，而非副本数',para('每个副本开 40 个数据库连接，三副本是 120 个，十二副本可能变成 480 个。若数据库只允许 200 个有效连接，扩容会让更多请求争抢同一个瓶颈。为连接池、并发执行和队列设总预算，按副本增长重分配；重试也要计入总尝试量。','maxReplicas 应来自已验证的资源、配额和下游边界。达到上限仍积压时要告警，并决定拒绝、降级或延迟处理；仅监控 CPU 下降会遗漏用户已经大量超时的情况。衡量弹性效果要看实际完成量、等待时间、丢弃和成本。')],
 ['从指标建议追到用户结果',code('按控制链取证','SH',[
 'kubectl -n infra-lab describe hpa reports',
 'kubectl -n infra-lab get hpa reports -w',
 'kubectl -n infra-lab get deploy reports -o yaml',
 'kubectl -n infra-lab get pods -l app=reports -o wide',
 'kubectl -n infra-lab top pods'
 ].join('\n'))+para('先看 HPA conditions、指标时间与 desiredReplicas，再看 Deployment 是否接到目标、Pod 是否 Pending、节点是否增加，最后看 Ready 和业务完成率。top 的瞬时用量不是完整的伸缩决策历史。保存负载生成条件、每阶段时间戳和用户结果，才能回答“到底等在哪一层”。')],
 ['本地先复算，集群再验证时序',para('配套 capacity.py 可运行基础公式、分母变更、简化稳定窗口和固定容量积压算例，记录本次输出。它是单位与数学语义实验，没有模拟完整 HPA 控制器，也不产生真实云容量。测试集群中应再验证 metrics-server、指标就绪、扩缩速率、Pod 放置与应用排空。','练习把到达率翻倍，或把初始化从 40 秒变成 100 秒，重新算峰值积压和排空时间。再说明哪些请求已经超出等待预算，哪些限流措施需要在扩容到达之前触发。')+nativeDownload]
 ],['四副本 request=200m，均用 180m，目标 60%，基础建议多少？扩容到恰好等于到达率的容量能清空积压吗？','基础建议六副本，实际动作还受控制器约束。容量仅等于到达率时没有净排空余量；已有积压需额外吞吐、减小到达量或拒绝策略。'],['cnHPA','resources','v9load'],['elasticity','scheduling-resources','k8s-workloads','slo']);

chapter('serverless','C5.1','serverless-execution','Serverless 与事件驱动：执行、重试、幂等与成本',
 '用一条报告生成事件讲清冷启动、消息重复、业务提交、并发与账单单位，避免“免运维就不用设计”的误解。',
 '知道 HTTP、队列、数据库事务和容器；能区分请求、执行尝试和业务动作。',
 ['执行：区分请求、实例和持久状态','事件：按触发器解释重试与失败去向','预算：计算并发、积压与 GB·s'],[
 ['托管的是哪层，应用还负责哪层',para('报告服务改为函数：用户请求先写任务，队列触发函数生成报告。Serverless 把实例分配、部分伸缩与运行维护交给平台，应用仍负责代码、数据、身份、超时、幂等和业务结果。函数受理、handler 返回、报告已经可读取，是三个不同的完成点。','FaaS 是常见执行模型，Serverless 还包括其他托管服务；Knative Serving / Eventing 是可在 Kubernetes 上组织服务与事件的组件，平台团队仍要运行底层集群。选型先列运行时、最长执行、网络、状态、流量形态和故障要求，再比较托管函数、容器服务或长期运行消费者，不能只按是否叫 Serverless 分类。')],
 ['一次新环境和一次复用，各省掉了什么',para('以普通 Lambda Event Functions 为例，新环境需要初始化扩展、运行时和静态代码，再执行 handler。环境之后可能复用，也可能冻结或销毁；复用连接客户端和已加载依赖能减少初始化开销，但不能依赖下一次任务一定回到同一环境。全局变量与临时目录适合可丢缓存，不适合持久任务进度或唯一回执。','用户端延迟还包含入口、排队、初始化、执行和返回，不能拿 handler 的计时替代端到端 p99。预置并发提前准备部分环境，但突发超过预热数量、配置变化或环境重建时仍需看具体行为。reserved concurrency 约束并划出额度，不等于 provisioned concurrency 的付费预热。')],
 ['谁负责重试，必须按触发器回答',table(['调用路径（AWS 示例）','失败与重投的责任','完成语义'],[['直接同步调用','函数错误不由 Lambda 替调用方自动重试；客户端 / SDK / 上游可能有策略','同步结果需由调用方判定'],['直接异步调用','Lambda 受理后排队；代码错误有相应重试、事件年龄与失败去向配置','受理响应不是业务成功'],['SQS 事件源映射','轮询与可见性超时配合；至少一次处理，源队列有 redrive 策略','成功处理后删除；可能重复'],['Knative Eventing','依 Broker / Channel 实现支持的投递策略','retry、退避及 deadLetterSink 的支持需核对']])+para('同一条“失败重试三次”无法覆盖这张表。异步函数 DLQ、SQS 源队列 DLQ 与 Knative 的失败 sink 不是同一种配置。批处理时 A 已成功、B 失败，如果整个批次重投，A 还可能再来；支持并正确使用部分批次响应只能缩小重试范围，不能消除全部重复。')],
 ['效果提交与 ACK 之间，总有一个需要设计的窗口',para('给每个业务动作稳定 event_id，并将租户、资源与参数绑定到这个 ID。重投时沿用同一 ID，不能每次生成新 UUID。接收方在一个数据库事务中同时写业务效果与 inbox 回执；同键同意图返回原结果，同键异参拒绝。若效果已提交、进程还未返回 ACK 就退出，重投根据回执确认旧结果，而不是再做一次。','这是接收方业务协议，不是消息队列自动提供“恰好一次”。若实际效果发生在另一个付款或文件服务，本地事务不能跨过外部提交窗口；需外部稳定幂等键、可查询回执、outbox / inbox 或补偿。回执保留时间还应覆盖消息保留、人工重放和业务重试的时间跨度。')+code('单库原子提交的伪代码','TEXT',[
 'BEGIN IMMEDIATE', '  old = inbox[event_id]', '  if old exists:', '      reject if old.payload_hash != current_hash', '      return old.result', '  write business effect', '  write inbox(event_id, payload_hash, result)', 'COMMIT', '# ACK 可能在这里之前丢失；同 ID 重投查询上次结果'
 ].join('\n'))],
 ['可运行练习：提交后退出，再投一次',para('下载包的 event_worker.py 使用真实 SQLite 事务，将本地报告记录与 inbox 一起提交；--crash-after-commit 在提交后主动退出 23，模拟尚未返回成功时进程终止。验证器再发送同一 event_id，检查只有一份业务记录并返回原结果；同键改变参数会被拒绝。它没有调用云队列，没有验证供应商重试时序，也不证明跨数据库或外部 API 的原子性。')+code('本地示例：先提交后退出，再重放','SH',[
 'python3 event_worker.py --db demo.sqlite --event sample-event.json --crash-after-commit',
 '# 上一步预期退出码 23；随后重投同一事件',
 'python3 event_worker.py --db demo.sqlite --event sample-event.json',
 'python3 verify.py'
 ].join('\n'))+para('如果先写 inbox，再在另一事务写业务，崩溃会留下“已经处理”但没有报告；若先单独写报告再记 inbox，重投会再创建。练习刻意让两份状态在同一数据库事务里提交。对真实系统应画清每个事务覆盖了哪些实体，不能把这份本地证明随意扩展到远端服务。')],
 ['并发算平均值，队列算净差值',para('稳定窗口内平均执行并发约为调用完成率×平均执行时长。150 次调用/秒、每次 0.20 秒，对应约 30 次执行同时在途；时长变成 0.40 秒而调用率不变，则约 60。这里统一以“函数调用”为单位；每次处理十条消息时，要先换算调用率。平均并发不等于峰值，不等于一定有相同数量实例，更不能把积压的生产者速率当成已经在执行的调用率。','若函数受并发 30 限制且每次 0.2 秒，理想完成上限约 150 次/秒，尚未计初始化和下游等待。生产速率 200 次/秒会持续积压约 50 次/秒。盲目扩大并发又可能压垮数据库；应把队列等待、消息年龄、执行并发、下游连接与限流放在一张预算表里。')],
 ['把成本先写成用量，最后再套当前报价',para('教学假设：十万次调用，每次配置内存 0.5 GB、计费时长 0.20 秒，没有额外重试。执行量为 100000×0.5×0.20=10000 GB·s，另有请求单位。计费时长不一定等于 handler 的 CPU 时间；初始化与计费规则、请求大小、架构、地区和产品类型都需核对。本站不给脱离地区和日期的固定单价。','若预置并发 12，每份 0.5 GB，连续启用整一小时，预置资源量是 21600 GB·s；它的单价和执行用量不同，应分别计费。再加网关、日志、存储、网络和失败重试。阿里云 FC 还按资源种类、实例状态与转换系数折算 CU，不能直接把 Lambda 的 GB·s 价格套过去。')+table(['选型','更适合先验证','常见代价'],[['按调用托管函数','间歇事件、短处理、弹性突发','冷启动、时长约束、调用与依赖开销'],['最小实例 / 预热','持续低延迟或启动重','空闲容量和计费粒度'],['长期运行消费者','稳定负载、长连接、长作业','常驻成本、升级、扩缩容与运维责任']])],
 ['失败留存之后，怎样安全重放',para('DLQ 保留失败样本，不会自动修复数据或回滚业务。调查时先记录事件身份、最后错误、尝试与时间，再修复代码或数据；重放前确认权限、限速、去重保留和旧版本兼容。不能给原事件换个新 ID 来绕开冲突，除非已经明确这是新的业务动作。','面试练习画一条时间线：接收、业务提交、进程退出、消息重投、查回回执、ACK。再换一个条件：效果是外部 API、本地回执已过期，或者一次调用有十条消息。指出原方案在哪个边界失去保证，并给新的核实方法。')+nativeDownload]
 ],['一条事件已提交报告，但函数来不及 ACK 就退出。再投一次一定重复吗？预留并发会消除冷启动吗？','单库业务与回执原子提交、稳定 ID 和参数绑定可让重投返回旧结果；外部效果需额外协议。reserved concurrency 不是预置执行环境，不能据此宣称消除冷启动。'],['cnEnv','cnRetry','cnSQS','cnConcurrency','cnPrice','cnFC','cnEvent'],['container-runtime','distributed-systems','k8s-autoscaling','durable-workflows']);

for (const a of systemChapters.slice(first)) {
 a.check=[...a.objectives];a.edition='Cloud 主干详解';a.updated='2026.11.04';a.textbook=true;
 a.baseline='Kubernetes 稳定 API / Linux 容器；本地实验与目标集群验证分列';
 if(a.id==='serverless-execution') a.baseline='Python 3.9+ / SQLite 本地实验；云触发器行为以各官方文档为准';
 a.minutes=Math.max(15,Math.ceil(a.sections.map(s=>s[1].replace(/<[^>]*>/g,'')).join('').length/220));
 if(!articles.some(x=>x.id===a.id)) articles.push(a);
}
}
