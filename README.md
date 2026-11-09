# InfraGuide

给中文初学者和面试准备者的基础设施学习站：**Cloud Infra、AI Infra、Agent Infra**。
先定义概念和关系，再讲系统机制，用图、手算、代码和故障实验把它走通。

[在线阅读](https://captaingreenskin.github.io/infra-guide/) · [学习大纲](https://captaingreenskin.github.io/infra-guide/outline/) · [复习路线](https://captaingreenskin.github.io/infra-guide/roadmap/) · [实验室](https://captaingreenskin.github.io/infra-guide/labs/)

## 学什么

| 方向 | 内容 |
| --- | --- |
| Cloud Infra | 系统基础、虚拟化、网络、存储与数据库、Kubernetes、Serverless、IaC/GitOps、安全、容量与SRE |
| AI Infra | Transformer与GPU基础、分布式训练、数据/通信/检查点、作业调度、KV缓存、模型量化、推理与发布 |
| Agent Infra | 运行时、工具契约、幂等与恢复、多worker接管、权限、上下文、检索、评估与沙箱；结合Kairo设计接入验收 |

当前 78 章，覆盖 Cloud 35 章、AI 29 章、Agent 11 章与综合实战 3 章。[实验室](https://captaingreenskin.github.io/infra-guide/labs/)按方向列出实跑记录、下载包和目标环境手册。三个方向入口直接进入第一章，侧栏直接进入正文。领域知识页前置 14 张关系图，图和文字共用 100 个节点、87 条关系。每张图下有一道判断题，可展开结果并查看原始记录，也能直达正文实战。[学习路线](https://captaingreenskin.github.io/infra-guide/roadmap/)提供完整课程和 7 条岗位路线，自动补齐必要先修。选择岗位后，正文的目录、上下章与路线定位都保留当前岗位。Agent 可独立学习。

Transformer 首章沿「红 圆 → red circle」连接查表、源端编码、目标右移、交叉注意力和实际的三轮生成。需要深入时，从同一例子进入掩码实验，再切换到独立的仅解码器算例。文章内搜索打开即显示推荐，查询时只下载可能含匹配项的索引分片。 [一句话走完 Transformer](https://captaingreenskin.github.io/infra-guide/article/transformer-model/#translation-reading-path)

用同一个 Indexed Job 连接 Kubernetes 节点调度与 AI 作业准入。Kueue 实验依次解除额度占用和节点标签限制，再按索引核对两份实际 CPU 工作结果。Cloud 调度章、AI 作业平台和训练岗位路线都能直达这段实验。 [从排队到作业完成](https://captaingreenskin.github.io/infra-guide/article/gpu-scheduling/#native-kueue-admission)

推理性能章对照两个真实请求的单槽排队与双槽活跃，再用客户端流事件复算首词元等待。Agent 工作流章沿同一份报告区分批准后发布、崩溃后查回执和撤权后的待确认状态。 [推理并发实验](https://captaingreenskin.github.io/infra-guide/article/inference-performance/#native-inference-queue) · [批准后恢复实验](https://captaingreenskin.github.io/infra-guide/article/durable-workflows/#native-approval-reentry)

同一个推理槽保留的前缀可以复用，显式清除后同一提示会重新计算。训练章用真实 Gloo 收发核对不等长分片的有效行与反向梯度。Cloud 与 Agent 共用一套 Collector 实验，比较全量导出、错误采样和接收库任务账本。 [前缀复用与清除](https://captaingreenskin.github.io/infra-guide/article/model-serving/#native-inference-prefix) · [不等长环形注意力](https://captaingreenskin.github.io/infra-guide/article/flash-attention-io/#ragged-ring-training) · [采样与业务对账](https://captaingreenskin.github.io/infra-guide/article/agent-observability/#native-tail-sampling-ledger)

事件驱动章用 JetStream 观察同一消息被重投时仍活着的旧执行者。推理章运行固定 vLLM 提交的块池，跟踪引用归零和再分配。Agent 章在真实 MCP HTTP 响应流上分别于提交前后断流，再沿原操作查询回执。 [消息重投](https://captaingreenskin.github.io/infra-guide/article/serverless-execution/#native-jetstream-redelivery) · [vLLM 块生命周期](https://captaingreenskin.github.io/infra-guide/article/inference-performance/#vllm-block-lifecycle) · [MCP 断流](https://captaingreenskin.github.io/infra-guide/article/mcp-protocol/#mcp-http-cancellation-run)

推理交付章用三个实际 CPU 模型服务分开检验探活、输出和已接入的流。MCP 章沿同一枚签名令牌核对 HTTP 入口与报告读取权限。Cloud 身份章在 Linux 上核对 SPIRE 签发、双向 TLS 和接收方授权。 [模型发布与回退](https://captaingreenskin.github.io/infra-guide/article/ai-lifecycle/#native-model-rollout) · [MCP HTTP 授权](https://captaingreenskin.github.io/infra-guide/article/mcp-protocol/#native-mcp-http-authorization) · [SPIRE 工作负载身份](https://captaingreenskin.github.io/infra-guide/article/iam-security/#native-spiffe-workload-identity)

缓存章实跑 Redis 失效推送与迟到回包，训练章用两个微批追踪混合精度溢出、跳步和检查点恢复。Agent 检索章用 Qdrant 与 SQLite 分开检查候选、实时权限和正文读取。 [Redis 客户端缓存](https://captaingreenskin.github.io/infra-guide/article/cache-consistency/#native-redis-client-tracking) · [混合精度与检查点](https://captaingreenskin.github.io/infra-guide/article/gpu-memory/#native-amp-window) · [向量检索与来源授权](https://captaingreenskin.github.io/infra-guide/article/agent-retrieval/#native-qdrant-retrieval)

算子章沿同一个 C 扩展实跑编译、链接和加载错误。Agent 工作流章沿同一个发布动作核对并行提议、冲突处理和检查点重放。SLO 章运行 Prometheus 抓取两个实例，并记录计数器归零和长短窗状态。 [CPython 扩展装载](https://captaingreenskin.github.io/infra-guide/article/operator-profiling/#native-python-extension) · [并行归并与重放](https://captaingreenskin.github.io/infra-guide/article/durable-workflows/#native-parallel-merge) · [真实抓取与告警](https://captaingreenskin.github.io/infra-guide/article/slo/#live-prometheus-burn)

本轮细化 [AI Infra 入门与课程全貌](docs/AI_READING_BENCHMARK_2026-11-09.md)。从文本、词元和三种 Transformer 架构接到 GPU 算子、分布式训练与推理。正文增加注意力和归一化手算、实际 CPU 生成缓存轨迹，以及两阶段流水线的前向、反向和激活寿命。桌面侧栏与手机目录都可直达全貌。

入门进一步用两个目标位置和三个源位置解释交叉注意力，并把训练的真实前缀与生成的回填输入逐格对照。GPU 章补上从主机、显存与 L2 到 SM 的硬件图，以及按型号核对资源上限和互联的方法。 [Transformer 入门](https://captaingreenskin.github.io/infra-guide/article/transformer-model/) · [GPU 执行与存储](https://captaingreenskin.github.io/infra-guide/article/gpu-execution/)

FlashAttention 章沿在线归一化接入上下文并行。先画两个进程各自能读取的位置，再手算远端块如何进入同一个分母，最后用两进程 CPU/Gloo 对照完整矩阵。 [上下文并行](https://captaingreenskin.github.io/infra-guide/article/flash-attention-io/#context-parallel-attention) · [实验与记录](https://captaingreenskin.github.io/infra-guide/labs/?track=ai#lab-ai-context-parallel)

推理路线从提示词元、预填充与采样接到真实的 llama.cpp CPU 请求，比较同槽复用和重新计算。再读固定版本的 vLLM V1 调度、块表和引用归还，沿整块边界手算实际前向工作量。 [引擎实跑](https://captaingreenskin.github.io/infra-guide/article/model-serving/#native-inference-engine-lab) · [vLLM V1 源码跟读](https://captaingreenskin.github.io/infra-guide/article/inference-performance/#vllm-v1-request-path)

长序列实验继续验证逐块环传、反向梯度归还和一次参数更新，两、三进程 CPU/Gloo 均已复跑。算子章给出同卡比较三个 GEMM 的源码、逐项校验、轮换计时和 Nsight 步骤，设备测量待实际 GPU。 [环形训练](https://captaingreenskin.github.io/infra-guide/article/flash-attention-io/#ring-context-training) · [CUDA 同卡实验](https://captaingreenskin.github.io/infra-guide/article/operator-profiling/#same-device-gemm)

位置编码章增加共享位置轴的波形与编码矩阵，可切换特征宽度、特征对和位置。按同一对分量手算固定偏移，再接到 RoPE 的旋转约定。 [正弦位置编码图](https://captaingreenskin.github.io/infra-guide/article/position-encoding/#sinusoidal-position-pairs)

三条主线各补一段可复跑的连续实验。Cloud 分开观测 Cilium 策略下的 DNS 与 Pod IP 连接。AI 用同一组源词和目标词核对右移、掩码、交叉注意力及逐词译文。Agent 在工具回执已到而图尚未保存时结束进程，用接收库核对恢复是否重复发布。 [网络策略](https://captaingreenskin.github.io/infra-guide/article/k8s-networking/#kubernetes-network-policy-run) · [原版翻译结构](https://captaingreenskin.github.io/infra-guide/article/transformer-model/#encoder-decoder-translation) · [MCP 提交与恢复](https://captaingreenskin.github.io/infra-guide/article/durable-workflows/#mcp-commit-recovery)

数据库章从执行树的扫描行数读到 InnoDB 的真实等待边和死锁回滚。分片章用原生 FSDP 两进程对照全批次梯度、两轮 Adam 更新和完整状态。Agent 平台路线把工具发现与调用派发分开，并用恢复后的一份或两份报告做自检。 [InnoDB 实验](https://captaingreenskin.github.io/infra-guide/article/database-index-locks/#native-innodb-lab) · [FSDP 实验](https://captaingreenskin.github.io/infra-guide/article/distributed-training/#native-fsdp-run) · [Agent 平台路线](https://captaingreenskin.github.io/infra-guide/roadmap/agent-platform/)

存储章用单节点 kind 观察 CSI 延迟绑定、两个 Pod 接续读写和后端卷回收。检查点章用两个 CPU/Gloo rank 保存模型与 Adam，换成三个新进程加载并继续更新。正文图解在完整阅读器就绪前也能打开。 [CSI 实验](https://captaingreenskin.github.io/infra-guide/article/k8s-storage/#native-csi-storage) · [FSDP 检查点恢复](https://captaingreenskin.github.io/infra-guide/article/checkpoint-recovery/#fsdp-dcp-reshard)

Transformer 入门用同一组四格输入比较循环、卷积与注意力，再沿可见矩阵和统计轴做两组 PyTorch 对照。Cloud 配置章用 kind 观察同一 Pod 在 ConfigMap 更新后从四个入口读到什么。Agent 应用路线的交付题可以直达本机报告实验。 [序列关系](https://captaingreenskin.github.io/infra-guide/article/transformer-model/#sequence-models) · [前缀掩码](https://captaingreenskin.github.io/infra-guide/article/attention-mechanics/#prefix-attention-mask) · [归一化](https://captaingreenskin.github.io/infra-guide/article/transformer-block/#normalization-axes) · [ConfigMap 实验](https://captaingreenskin.github.io/infra-guide/article/config-secrets/#native-config-projection) · [Agent 应用路线](https://captaingreenskin.github.io/infra-guide/roadmap/agent-app/)

本轮把三段机制接到真实执行。专家并行用两个 CPU/Gloo rank 核对非等长收发、回包顺序与梯度。HPA 实验区分期望副本、已创建 Pod 与可用副本。Agent 容器实验对照只读与可写输入，由宿主检查报告与输入完整性。七条岗位路线的交付题都已链接到相应练习或记录。 [专家并行](https://captaingreenskin.github.io/infra-guide/article/moe-routing/#native-expert-parallel) · [HPA 控制链](https://captaingreenskin.github.io/infra-guide/article/k8s-autoscaling/#native-hpa-control) · [容器边界](https://captaingreenskin.github.io/infra-guide/article/agent-sandbox/#native-sandbox-container)

<details>
<summary>历次内容修订与执行记录</summary>

本轮[先修说明与试读范围](docs/ITERATION_2026-11-09_PREREQUISITE_READERS.md)对齐七处页头准备说明和岗位路线，把位置编码、训练恢复、沙箱等按需专题与必要先修分开；Agent观测例子就地解释CPU单位。14张领域图加大加深关系文字，连线避开其他标签。[15分钟试读](docs/reader-trial/brief.md)改为连续小节，题目只使用指定范围内的概念。78章已完成逐章正文修订，修订覆盖率不代表读者掌握率。

本轮[控制状态、弹性与稀疏推理](docs/ITERATION_2026-11-09_CONTROL_ELASTICITY_ROUTING.md)精修五章43节：从共同状态走到版本与观察，从Git期望走到进程和响应，从接纳工作走到有效容量，再串起专家路由、采样概率与缓存。78章均完成逐章正文修订；原代码、图、链接与旧小节目标保留。大纲前的重复介绍合为一段领域关系说明，随后直接展开目录。修订覆盖率不代表读者掌握率。

本轮[请求、数据库、训练与SRE](docs/ITERATION_2026-11-09_TRANSPORT_DATABASE_TRAINING_SRE.md)精修八章67节：从字节流走到业务消息，从事务提交走到历史恢复和复制应用，从明确训练配置走到新进程恢复，再用事件、分布和请求路径解释可靠性。73章由正文逐层定义概念；新增观测图将同一组请求的统计和并行路径画清，原代码、真实记录与公开链接保持可核对。

本轮[身份、训练更新与完整服务](docs/ITERATION_2026-11-09_IDENTITY_TRAINING_SERVICE.md)精修五章41节：从资源配置走到真实状态，从请求身份走到授权效果，从同一训练目标走到梯度合并与状态分片。65章由正文逐层定义概念；综合实战补上HTTP入口、真实CPU模型、独立报告接收方和新进程恢复，图、源码与六组实际结果对应同一份输入。

本轮[交付、恢复与证据链](docs/ITERATION_2026-11-09_RELEASE_RECOVERY_RETRIEVAL.md)重排五章49节：先走通发布、恢复、四进程训练、检索和工作流的正常关系，再展开机制与独立案例。60章由正文逐层定义概念；新增双投影SQLite程序、两幅图和两启动器四CPU进程实战。四进程记录保留逐位比较失败及声明数值契约，设备与真实读者边界继续单独核对。

本轮[网络、配置与模型交付](docs/ITERATION_2026-11-09_NETWORK_CONFIG_MODEL_DELIVERY.md)重排五章35节，连接服务发现与回程、配置与进程快照、指标与可用容量、量化格式与真实算子、模型版本与请求输出。57章由正文逐层定义概念。78个文章页直接沿用静态正文，正常阅读只加载轻量控件，完整搜索索引在首次搜索时加载；失败时保留完整运行时回退。

本轮[编排、恢复与继续执行](docs/ITERATION_2026-11-09_ORCHESTRATION_RECOVERY.md)重排五章39节，串起容器、副本、调度，以及训练更新、恢复与成本；另补 Agent 工具的正向接线。52章由正文逐层定义概念，复习与资料分别归入章末可展开区域。

本轮[统一目录层次](docs/ITERATION_2026-11-09_DIRECTORY_HIERARCHY.md)，全站大纲与章节侧栏共用概念名称和主题分组。目录先显示知识范围，点击直接进入完整正文。

这轮[存储、数据与GPU计算](docs/ITERATION_2026-11-09_DATA_COMPUTE_CONTINUITY.md)重写七章63节，另修13章的跨章指引、训练对象对应和Agent夹具边界。47章由正文逐层介绍概念；图、代码与实际记录沿同一组对象核对，完整程序按需展开。

这轮[系统基础、训练平台与工具接入](docs/ITERATION_2026-11-08_PREREQUISITES_PLATFORM_CUDA.md)重写十章83节，40章由正文逐层介绍概念；补齐求和、softmax和分块GEMM的真实CUDA源码、线程/尾块图及[Linux编译记录](https://github.com/CaptainGreenskin/infra-guide/actions/runs/42497594271)。设备数值执行和性能仍待GPU验收。

这轮[事件、推理与任务评估](docs/ITERATION_2026-11-08_EVENTS_SERVING_QUALITY.md)重写 Serverless、消息投递、模型推理、推理性能、Agent 评估与检索六章，共65节。30章直接从连续正文讲解概念；82个阅读入口复用已有静态正文，启动时保留笔记、练习展开、自检和所选岗位路线。

这轮[请求、通信与观测](docs/ITERATION_2026-11-08_NETWORK_COMMUNICATION.md)沿一次请求、一次训练同步和一次任务执行重写五章。概念在进入推导前定义，22处重复标题收为旧锚点；24章直接进入连续正文，完整源码和补充对照按需展开。

这轮[状态、存储与继续执行](docs/ITERATION_2026-11-08_PERSISTENCE_LEARNING.md)重写存储恢复、Kubernetes存储、自动求导、训练内存与持久工作流五章，沿对象、状态、正常执行和完整程序连续展开。19章由正文自然定义概念，原预览保留为章末回顾；独立算例、框架恢复和真实环境范围分别说明。

这轮[从对象关系到实际执行](docs/ITERATION_2026-11-08_EXECUTION_READING.md)继续重排Decoder、位置编码、Agent执行环境与恢复的正文，并把云服务实战接到原生kind请求、探针、发布和回退。14章将概念预览收为章末回顾，完整源码和证据按需展开；正文、搜索、图谱跳转保留已选岗位路线。

这轮[逐层讲解与连续阅读](docs/ITERATION_2026-11-08_PROGRESSIVE_READING.md)统一全站小节的概念名称，使正文、本文目录和搜索结果使用同一套标题；计算资源、Kubernetes、分词与嵌入、注意力、Agent权限和记忆六章重排整章解释。九个已独立介绍对象的章节把概念预览收为章末回顾，代码和完整实验按需展开。

本轮[概念层次与精炼阅读](docs/ITERATION_2026-11-08_CONCEPT_READING.md)统一78章导航短名，14张图直接标明关系，三个入门章先讲组件与正常过程，再读推导与实战；原生DCP、SDPA、LangGraph与ServiceAccount/RBAC分别接回对应机制，详细证据按需展开。

本轮新增[协调存储、数据库复制与MCP协议](docs/ITERATION_2026-11-08_STATE_PROTOCOL.md)三个独立章：先解释对象、版本和执行链，再读真实etcd/MySQL/官方MCP SDK。原生Linux CI核对网络分区、快照后重新观察、复制应用落后和受控写入交接；SDK实跑两代版本、进度、取消与独立结果验收。保留原75章的正文、编号和公开链接，新增内容纳入领域图谱、先修与岗位路线。

上一轮[把机制接到真实实现](docs/ITERATION_2026-11-08_IMPLEMENTATION_BRIDGES.md)：云网络沿两段连接、排空和重试走到HTTP代理；推理沿物理块、引用和写时复制走到真实CPU注意力；工作流沿计划、事实、等待和审批走到新进程恢复。三个实验均有独立结果检查、失败对照、图解和完整源码。长章节的桌面、手机目录支持正文小节定位，保留旧锚点和岗位路线。

训练并行章另有[双进程手工分片实验](https://captaingreenskin.github.io/infra-guide/article/distributed-training/#manual-sharding-run)：三个更新逐项对照独立完整批次的梯度、参数和SGD动量，并保留错误分母的失败对照。它实际运行CPU/Gloo，不把手工算法写成FSDP或GPU显存实测。

上一轮[深化容量、Roofline与Agent观测](docs/ITERATION_2026-11-08_SYSTEM_BUDGETS.md)，先把对象、单位和因果讲清，再跟读原有程序；补四张图并重放本地实战，保留各环境验证边界。

前一轮[精修三章正文](docs/ITERATION_2026-11-08_CAUSAL_WALKTHROUGHS.md)：沿同一组输入讲清SLO事件与预算、GPU执行和计时、Agent状态与记忆，再跟读已有完整实验。新增四种图解、两段标准库算例；保留已发布代码与真实环境边界。

全站[概念关系与易读性修订](docs/ITERATION_2026-11-08_READABILITY.md)把95个领域知识点和5组前置基础连接起来，修正6章的跨章引用、解释衔接与错误分层。目录按领域组织，连续阅读按先修顺序推进，旧URL及小节锚点保留。

C5.2消息投递、C6.2 Terraform状态、C6.3 GitOps调谐配有[隔离Linux CI](https://github.com/CaptainGreenskin/infra-guide/actions/runs/42445552027)：实际运行RabbitMQ、Terraform官方local提供程序、kind内Argo CD，分别核对运输确认与业务效果、状态与实际文件、声明同步与真实HTTP版本。完整代码、反例、图和结果使用同一组输入；本地状态和单机kind不当作生产云验收。详见[机制章审阅](docs/ITERATION_2026-11-08_DELIVERY.md)。

已有实验包括Linux TCP/epoll、MySQL日志恢复、Docker资源与Kubernetes调度、CPU/Gloo训练恢复、手写算子与MoE进程分发、精确推测采样、Agent授权与崩溃窗口、中文检索及实际分词预算。CUDA/Nsight、GPU/NCCL、物理多节点、云CNI/CSI、生产负载和Kairo接入分别保留待验范围，不由CPU或kind结果推断。

</details>

[首批15分钟试读材料](docs/reader-trial/brief.md)已准备，当前真人试读样本0人。检查和作者审读用于发现错误，读者能否独立画出知识关系、解释条件并完成迁移题，仍需实际试读验证。

本次集中迭代的修订范围、执行证据和待验缺口见 [8小时迭代交付清单](docs/EIGHT_HOUR_ACCEPTANCE_2026-11-05.md)。

后续内容按 [中文初学者编写规则](docs/CONCEPT_FIRST_AUTHORING.md) 维护：入口和每章先讲对象与依赖，再进入机制和案例。本轮[高关注项目复核](docs/GITHUB_RESEARCH_2026-11-05.md)与[概念修订记录](docs/CONCEPT_REVIEW_2026-11-05.json)单独保留。

正文继续按这条顺序修订：[六章机制与实战迭代](docs/BODY_ITERATION_2026-11-05.md)覆盖云网络、Kubernetes控制面、注意力、解码器、上下文与持久工作流，附六张图和五个可运行程序。

目录与学习路线按 **P0/C1–C9、A1–A3、G1–G10、S1–S3** 组织；量化已独立成章。首页负责选择方向，大纲提供地图与完整章节，旧 `/start/` 自动回到首页。修改编号和归属时维护 `dist/course-map.js`；旧链接迁移与审阅边界见 [结构迭代记录](docs/STRUCTURE_ITERATION_2026-11-07.md)。

## 配套独立项目

从 [自动微分与训练](https://captaingreenskin.github.io/infra-guide/article/autograd-training/) 或 [Transformer 模块](https://captaingreenskin.github.io/infra-guide/article/transformer-block/) 读到梯度更新和因果注意力时，可以转到 [One GPU LM](https://github.com/CaptainGreenskin/one-gpu-lm)，跟着实验从随机权重训练一个中文小模型。训练代码与原始结果由该仓库维护。[首次 RTX PRO 6000 实测](https://github.com/CaptainGreenskin/one-gpu-lm/tree/main/experiments/002-first-train/results/pro6000-first) 记录了 100 步训练的吞吐、显存和验证损失。

## 本地运行

前端没有安装依赖的步骤。需要Node.js 20+和Python 3.9+：

```sh
node scripts/render-pages.cjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。`dist`也可以直接部署到支持目录`index.html`的静态托管服务。

## 做一次实验

下载的完整程序、环境、运行结果和源码摘要都在`dist/labs`。下列程序彼此独立，可按章节选择。[实验目录](https://captaingreenskin.github.io/infra-guide/labs/) 按三个方向整理学习任务，注明先修、环境、观察目标与本机/目标环境证据；同一个 ZIP 可能含多个独立程序：

```sh
# Python标准库
python3 dist/labs/ai-agent-systems/gqa_serving.py
python3 dist/labs/ai-agent-systems/worker_fencing.py
python3 dist/labs/ai-agent-systems/agent_evaluation.py
python3 dist/labs/learning-mechanisms/tcp_framing.py
python3 dist/labs/learning-mechanisms/checkpoint_commit.py
python3 dist/labs/learning-mechanisms/approval_receipt.py
python3 dist/labs/serving-consistency/cache_outbox.py
python3 dist/labs/serving-consistency/serving_scheduler.py
python3 dist/labs/serving-consistency/retrieval_pipeline.py

# 已安装PyTorch的环境；本次验证基线是2.5.1 CPU
python dist/labs/ai-agent-systems/token_ddp.py
```

它们分别验证GQA全量/增量对照、接收方代际与崩溃恢复、真实报告与引用验收、两个CPU/Gloo进程的全局梯度，以及TCP解帧与半关闭、同一步检查点、审批声明与工具回执。另有存储恢复、事件重投、Terraform、Prometheus规则和完整DDP训练实验。

每个实验说明自己的范围。本地CPU与SQLite结果不代表已验证GPU/NCCL、物理多机、生产推理、远端工具或真实Kairo；Kairo目前提供待接入契约。

## 修改与检查

| 路径 | 用途 |
| --- | --- |
| `src/page-shell.html` | 页面外壳与脚本依赖顺序 |
| `dist/*.js`（除 `runtime-*.js`） | 课程数据、知识正文、渲染与交互规范源码 |
| `dist/diagrams/` | SVG图 |
| `dist/labs/` | 实验源码、下载包、执行记录 |
| `scripts/` | 页面生成、内容检查与实验验证 |
| `docs/` | 内容审阅与迭代记录 |
| `dist/**/index.html` | 生成的119个页面（118个规范入口与1个旧入口兼容页）；由内容脚本重新生成 |

修改正文后，用与 CI 相同的入口检查。`--pages` 另检查 GitHub 项目路径：

源码保留检查会对照已发布的Git基线；CI获取完整历史，浅克隆需要先补齐历史。

```sh
node scripts/check-all.cjs --pages
```

此命令重新生成页面，再执行全部内容与路径检查；不会安装 PyTorch 或冒充重跑需要额外环境的实验。普通标准库实验会按各检查的实际逻辑复跑，外部工具及 PyTorch 记录按源码摘要、独立算式和下载包复核；修改相关程序后仍需按实验说明实际重跑。

浏览器加载的 `dist/runtime-*.js`、`runtime-manifest.json`、`reader-assets/`、`reader-runtime-manifest.json` 和各目录 HTML 都是生成物。轻量阅读器的构建源在 `scripts/article-reader/`。文章元数据和搜索索引独立生成，有效查询先按词片段过滤候选分片，再使用全站同一套搜索排序。 `multinode-launch-data.js` 由 `scripts/embed-multinode-launch.cjs` 从实验源码与固定记录生成。修改规范内容文件后运行上述命令，不手改合并脚本。顺序来自 `src/page-shell.html`；新增课程脚本后，运行时检查会比较合并前后全部路由。 `integrated-service-data.js` 由 `scripts/embed-integrated-service.cjs` 从完整服务源码和实际验证记录生成。

修改本轮实验后，用已有PyTorch环境重新执行并生成对应的源码包与记录：

```sh
python3 scripts/verify-ai-agent-systems.py --torch-python /absolute/path/to/venv/bin/python
node scripts/render-pages.cjs
```

三个独立机制实验更新后，运行 `python3 scripts/verify-learning-mechanisms.py` 重建网站源码、执行记录和ZIP。阅读页提供目录、标准/大字和专注模式，图解可在原页放大与滑动。

缓存/outbox、推理迭代调度与检索链路更新后，运行 `python3 scripts/verify-serving-consistency.py`，同步完整代码、实际输出和下载包。三个程序分别说明本地SQLite、固定成本模型与受控检索夹具的范围。

其他实验有各自的验证脚本。变更源码后应更新实际结果和摘要，不能沿用旧的通过记录。

## 内容标准

- 中文先讲清概念，必要英文术语就近解释。
- 一个小节解决一个问题，图、公式和代码围绕同一例子展开。
- 计算给出变量、单位和假设；用反例检查结论。
- 完整代码可下载，教学模型与真实环境实测分别说明。
- 优先引用论文和官方文档；不以篇数、字数或未经核实的面试覆盖率代替质量。

本站正文、图与实验独立编写。欢迎通过Issue指出难懂的段落、错误和可复现的改进。

## GitHub Pages 自动发布

推送到`main`后，`.github/workflows/pages.yml`会生成页面、运行内容检查，再发布GitHub Pages。
使用标准Ubuntu运行器；部署包仅保留1天，不配置缓存或付费运行器。

本地检查项目子路径：

```sh
node scripts/build-github-pages.cjs
node scripts/check-github-pages.cjs
python3 -m http.server 4174 --bind 127.0.0.1 --directory .pages
```

打开`http://127.0.0.1:4174/infra-guide/`。构建产物在`.pages/infra-guide`，不提交生成目录。
网页右上角的GitHub入口始终指向本仓库。
