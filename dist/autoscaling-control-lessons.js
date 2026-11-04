/* Closed-loop scaling: metric semantics, conservative decisions, delayed capacity, then practice. */
const scalingLoop=infraReadableHTML(
 '<div class="mechanism-core" id="scaling-control-chain">'+knowledgeSubhead('扩容是一条控制链，建议、期望和可用容量分别观察')+
 para('弹性伸缩根据观察到的负载调整资源。水平伸缩增加副本，垂直伸缩改变单副本资源，节点伸缩增加能承载Pod的机器。它们作用在不同对象上：HPA（水平Pod自动伸缩器）改目标工作负载的scale期望；工作负载控制器创建或删除Pod；调度器挑节点；节点与应用完成准备后，才成为用户能使用的容量。',
 '把这条链写成三个数：建议副本、目标期望副本、实际可接请求副本。它们可以暂时不同。HPA建议6，目标仍4，要看伸缩写入及限制；目标6但只创建4，要看准入、配额与控制器；创建了6但2个Pending，要看节点与硬约束；6个都绑定却只有4个Ready，要看镜像、卷、探针与预热。每一层都有自己的延迟，不能把一次CPU下降当作扩容验收。')+
 table(['机制','改变什么','主要限制'],[
 ['HPA','工作负载期望副本数','信号、上下界、策略与Pod实际可用性'],
 ['VPA类机制','单Pod资源建议或配置','实现/版本、调整方式及与HPA分母的耦合'],
 ['节点伸缩','可放置的节点资源和形状','配额、库存、加入时间、亲和与存储拓扑'],
 ['事件驱动伸缩','按外部事件或队列触发容量变化','触发器语义、冷启动、消费与确认协议']])+
 para('如果新建节点也满足不了硬亲和或卷拓扑，节点伸缩无从解决；如果瓶颈是固定容量的数据库，多建应用副本也不会让数据库自动扩展。先定位哪一层的可用能力不足，再选择控制对象。')+'</div>');

const scalingCPU=infraReadableHTML(
 knowledgeSubhead('CPU利用率先对齐单位、匹配集合与request分母')+
 para('Kubernetes的1000m CPU等于1个CPU单位，180m表示观测窗口内约0.18核的使用水平。CPU request表达调度所依据的请求，limit表达运行约束；HPA的CPU Utilization相对相关request计算，不是占宿主机总CPU的比例，也不是使用量除以limit。CPU配额已被明显节流时，测得的使用量还未必反映全部需求。',
 '先设四个就绪Pod各request 200m、各用180m，目标60%，所有指标有效。总用量720m除以总request 800m，利用率90%；基础建议ceil(4×90/60)=6。总工作量保持720m且可均匀分摊时，六个副本各约120m，恰好是200m的60%。这是公式成立的固定条件，不是六个实例瞬间就绪的保证。')+
 knowledgeFormula('先计算基础比例','建议副本 = ceil(参与副本 × 当前指标 / 目标指标)','先明确参与集合；真实控制器另处理缺指标、未就绪、容差、策略和上下界。')+
 para('把相同四个Pod的request改400m，工作量并没变，利用率却成为720/1600=45%，基础建议3。request还改变节点放置能力，因此VPA调整request时可能同时影响HPA信号。讨论“CPU目标设多少”之前，要知道分母是谁决定的，修改分母又会改动哪些控制回路。')+
 figure('v24-cpu-request-ratio','异构request算例按所核对的资源实现汇总匹配用量与request，得到18%；真实Prometheus固定输入也验证了错误逐Pod平均会得到50%。')+
 para('异构request更容易算错：Pod A用90m、request 100m，Pod B用90m、request 900m。按Kubernetes v1.34.1已核对的资源利用率函数，先合并匹配的用量与request，得到180/1000=18%，再使用整数百分数；不是(90%+10%)/2=50%。同request时两种算法碰巧相同，不能据此把逐Pod比值平均当成通用公式。其他指标类型有自己的汇总口径，升级时也要核对实际实现。'));

const scalingMissing=infraReadableHTML(
 knowledgeSubhead('缺指标不会自动等于零，保守计算也会改变方向')+
 para('一份指标有对象、值、单位、采样时刻和覆盖窗口。缺失、过期、进程刚启动、Pod不再接流量，是不同状态。CPU伸缩会按就绪与初始化规则暂时排除某些样本，再处理缺指标；控制器知道的Pod集合，也可能与看板中有时间序列的集合不同。部分容器缺少相关request时，利用率还可能无法定义。',
 '下面明确使用已核对的Kubernetes v1.34.1资源计算，不把它概括成全部版本或指标的算法：扩容时，缺指标项按零用量补入，降低扩容幅度；缩容时，按max(100%,目标百分比)的request补值。本题目标60%，因此补的是request的100%，不是60%。随后重新算比例；落入容差或反转伸缩方向时保持当前副本。')+
 table(['4个Pod，各request 200m；目标60%','仅已知样本的利用率','补值后的整数利用率','本例基础结果'],[
 ['3个各180m，1个缺指标','90%','540/800 → 67%','ceil(4×67/60)=5，原简单公式会给6'],
 ['3个各170m，1个缺指标','85%','510/800 → 63%','与目标差5%，在本例10%容差内，保持4'],
 ['3个各60m，1个缺指标','30%','(180+200)/800 → 47%','ceil(4×47/60)=4'],
 ['1个20m，3个缺指标','10%','(20+600)/800 → 77%','从缩容变成扩容方向，保持4']])+
 para('表中参考程序将其余Pod统一视为Ready，未复刻控制器的全部Pod分类或策略。状态里展示的原始平均利用率，也可能没有包含这次保守补值；因此看见status利用率90%，不能单独推出最后必定建议6。定位时保留指标时刻、覆盖Pod集合、就绪变化和伸缩事件，而不是只截一个百分数。',
 'Prometheus看板若简单用sum(有样本的用量)/sum(所有request)，缺项常被隐含当作零；这不是上述缩容保守规则。先显示完整性与采样新鲜度，再解释比值。实测0意味着拿到了零值；没有时间序列则需要定位采集，不应在看板里默默补成健康的0%。'));

const scalingMetrics=infraReadableHTML(
 knowledgeSubhead('换指标前，先说明它怎样映射到完成能力')+
 table(['指标或目标','含义','适用边界'],[
 ['Resource / Utilization','用量相对相关request的比例','request与容器覆盖必须合理'],
 ['Resource / AverageValue','每Pod的原始平均用量','不使用同一百分比request分母，仍需单位和时窗'],
 ['ContainerResource','只看指定应用容器的资源','容器名和滚动版本须匹配，不自动包含新容器名'],
 ['Pods / 自定义指标','每Pod的业务负载，如在途工作','定义采样集合、均值与业务完成能力'],
 ['Object / External','对象或集群外部信号，如队列积压','需真实指标适配、权限与可用性，不直接等于Pod CPU']])+
 para('CPU对I/O等待型工作可能不敏感：请求都堵在数据库，CPU很低，队列却很长。队列深度又是一份存量，同样1000项若到达率与平均执行时间不同，所需容量也不同。定义每副本在目标时延下的有效完成率、输入速率及希望的排空时间，才能把积压换成容量需求。',
 '多个HPA指标分别计算建议时，通常取较大者；一个指标抓取失败，其余仅建议缩容时，可能跳过缩容，以免因缺信号误删容量；仍有有效指标要求扩容时则可能继续扩。具体以运行版本为准。零到一也需要零副本时仍可取得的外部信号；是否原生支持minReplicas=0、支持哪些指标或需何种事件驱动组件，必须按集群版本核对，不能靠不存在的Pod CPU唤醒自己。'));

const scalingQueue=infraReadableHTML(
 '<div class="mechanism-core" id="scaling-delay-queue">'+knowledgeSubhead('75秒容量空窗：先积分积压，再算排空净余量')+
 para('另设独立容量题：旧容量120次/秒，输入从120突然变180次/秒。等待指标20秒、控制与放置15秒、初始化40秒，假定三段串行且新容量统一在第75秒到达。容量空窗积压(180−120)×75=4500项。真实资源常逐渐可用，也可能并行准备，必须按时间分段，不把75秒当作所有平台的固定扩容时长。')+
 knowledgeFormula('积压的守恒关系','新积压 = 旧积压 + 接纳量 − 完成量 − 明确丢弃/过期量','队列不为负；若容量与输入随时间变化，要按各段或时间步计算。')+
 figure('v24-scaling-queue','固定流体模型：新容量180/s只能止涨；240/s多出60/s，另需75秒排空。上限500的模型主动拒绝4000项，不能把更短队列当作全部请求完成。')+
 para('新容量如果仅180次/秒，没有净余量，旧4500项就不会减少；240次/秒则净余量60，理论还需4500/60=75秒，到第150秒才清空。在线请求可能早已超过截止时间，不能等指标最后变绿才认定用户体验恢复。提前保留余量、预热、分级接纳与有界队列都在容量真正到达之前起作用。',
 '把队列上限设500，参考程序在75秒内拒绝4000项，之后按一步一秒的模型到第84秒清空。这改变了接纳量，适合什么业务取决于契约：同步请求可以明确拒绝或降级，必须完成的异步工作可能需要持久排队及另一份时限。程序不模拟逐请求FIFO与超时分布，不能用84秒推断某个请求的p99。')+'</div>');

const scalingPolicies=infraReadableHTML(
 knowledgeSubhead('稳定窗口保存近期建议，速率限制控制每段增减量')+
 para('缩容稳定窗口是用历史建议抑制抖动，不是看到低负载便机械睡五分钟。固定窗口300秒，记录t=0建议6、t=60建议3、t=180建议4、t=301建议3、t=481建议3。在本例窗口规则下，t=60仍取6；t=301虽然最初的6已离开窗口，t=180的4仍在，取4；t=481才取3。需要保存建议的时间与值，不能只看当前CPU。',
 '速率限制回答“这一段最多增减多少”，与稳定窗口不同。伸缩还受min/maxReplicas、允许的方向和选择策略影响；多个速率规则的Max/Min会改变允许动作，过去一段已经伸缩多少也可能进入计算。配置中的periodSeconds不意味着控制器只在这一段结束时才检查一次。')+
 code('autoscaling/v2示例 · Deployment reports、CPU requests和指标链须先存在','YAML',
 'apiVersion: autoscaling/v2\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: reports\n  namespace: apps\nspec:\n  scaleTargetRef:\n    apiVersion: apps/v1\n    kind: Deployment\n    name: reports\n  minReplicas: 4\n  maxReplicas: 8\n  metrics:\n    - type: Resource\n      resource:\n        name: cpu\n        target:\n          type: Utilization\n          averageUtilization: 60\n  behavior:\n    scaleUp:\n      stabilizationWindowSeconds: 0\n      policies:\n        - type: Pods\n          value: 2\n          periodSeconds: 60\n    scaleDown:\n      stabilizationWindowSeconds: 300\n      policies:\n        - type: Pods\n          value: 1\n          periodSeconds: 60')+
 para('这是配置示例，尚未在集群运行；它不为目标工作负载自动安装指标服务、补CPU request或提供节点。策略应结合故障余量、启动时间、连接排空和业务突发验证。降低到最小副本之前，也要确认余下容量能承担重新扩回前的负载。'));

const scalingBudget=infraReadableHTML(
 knowledgeSubhead('扩应用副本前，重算数据库连接和其他全局预算')+
 para('以下是独立的连接预算题；上节maxReplicas=8只演示字段，不能原样照搬到这组数据库约束。')+
 para('设数据库允许200个连接，其他客户端稳定占80，每个应用Pod最多40。应用只有120个连接预算，所以按池上限最多3个Pod。前面容量题若每Pod60次/秒，3个只能180次/秒，刚好追平输入而不能清旧积压。为了用4个Pod得到240次/秒，单Pod池上限至少需受控到不超过floor((200−80)/4)=30，且数据库实际吞吐仍须能承接。',
 '连接池上限不是数据库真实并发能力的证明，还要检查查询、锁、I/O和事务持有时间。副本数增加会放大启动连接、重试和缓存预热；若每层各自扩并发，下游可能先崩。maxReplicas必须结合资源、配额、全局预算和实际负载验证，不应只设一个很大的数字。')+
 table(['观测','可能解释','下一份证据'],[
 ['副本增多、CPU下降、用户超时更多','下游队列或连接竞争加重','连接等待、数据库完成率与重试次数'],
 ['HPA建议增加但Pod一直Pending','节点形状或硬约束不满足','调度事件、配额、节点/卷拓扑'],
 ['扩容后流量仍集中旧Pod','旧长连接继续复用','连接数、每连接请求与新连接后端分布'],
 ['缩容后短时失败','排空、终止时序或预算不够','停止接新工作、在途请求及真实回执']])+
 linkTo('k8s-networking','复习连接复用与Service后端选择'));

const scalingPractice=infraReadableHTML(
 knowledgeSubhead('实战一：参考计算与容量守恒')+sctLab('scaling_reference.py')+
 para('先手算表中的七种建议，再运行核对。特别检查缩容缺指标时用什么补值；把三个缺项都当零，会得出更激进且没有证据支撑的缩容。变化题：将容量空窗从75秒改120秒，积压变7200；新容量仍240/s时再需120秒排空，总计240秒。再检查有界队列接纳了多少，别把拒绝量从账上删掉。')+
 knowledgeSubhead('实战二：真实规则引擎复核看板分母')+sctLab('prometheus_cpu.py')+
 '<details class="full-code"><summary>展开实际cpu.rules.yaml</summary>'+code('cpu.rules.yaml','YAML',scalingCollectiveTraceFiles['cpu.rules.yaml'])+'</details>'+
 '<details class="full-code"><summary>展开四组cpu.test.yaml</summary>'+code('cpu.test.yaml','YAML',scalingCollectiveTraceFiles['cpu.test.yaml'])+'</details>'+
 para('这两组实验分别证明数学参考和真实规则评估，不替代HPA集群验收。到自己的测试集群时，沿同一负载记录指标时间、conditions、desiredReplicas、Pod创建/绑定/Ready、新容量完成率、拒绝和积压。每次只改变一个策略或资源条件，才能判断改善来自哪里。')+
 code('只读检查 · 在自己的测试集群替换对象名','SHELL',
 'kubectl -n apps get hpa reports -o yaml\nkubectl -n apps describe hpa reports\nkubectl -n apps get deployment reports -o yaml\nkubectl -n apps get pods -l app=reports -o wide\nkubectl -n apps get events --sort-by=.metadata.creationTimestamp')+
 knowledgeCheck('CPU已经下降，为什么还不能宣布弹性成功？','可能因为用户已被拒绝、请求堵在I/O、指标丢失或新Pod尚未接到工作。把接纳、完成、拒绝、积压和实际可用容量按同一窗口核对，再看延迟与成本。'));

{
 const a=articles.find(a=>a.id==='k8s-autoscaling');
 a.sections=[
  ['控制链：建议、期望与实际可用容量',scalingLoop],
  ['CPU口径：单位、request与匹配集合',scalingCPU],
  ['保守计算：缺指标、容差与方向变化',scalingMissing],
  ['指标选择：资源、容器、业务与外部信号',scalingMetrics],
  ['容量空窗：积压、净余量与有界接纳',scalingQueue],
  ['伸缩行为：稳定窗口、速率与上下界',scalingPolicies],
  ['下游预算：副本、连接与实际完成率',scalingBudget],
  ['实战与变化题：数学参考和真实规则引擎',scalingPractice]
 ];
 a.refs=nitRefs([...a.refs,'v24HPA','v24HPARatio','v24HPAMissing','v24PromTest']);a.minutes=55;a.updated='2026.11.04';
}
cloudKnowledgeExplanations.autoscaling=scalingLoop+scalingCPU+scalingMissing+scalingMetrics+scalingQueue+scalingPolicies+scalingBudget;
cloudKnowledgeDomain('native').refs=nitRefs([...cloudKnowledgeDomain('native').refs,'v24HPA','v24HPARatio','v24HPAMissing','v24PromTest']);
const scalingLabsBeforeSCT=cloudFieldLabs;
cloudFieldLabs=id=>(id==='native'?'<h3>容量建议到达用户之前：补值、排队与预算</h3>'+sctLab('scaling_reference.py',false)+linkTo('k8s-autoscaling','阅读完整伸缩机制与Prometheus实战'):'')+scalingLabsBeforeSCT(id);

