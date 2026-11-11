(function(){
'use strict';

const staticReadingVersion="0f0cb89d2c299afa8e79d8f94b94a4220a1a85ec1176a26f0d55d5625ef795dc";

const articles=[{"id":"linux-resource","module":"foundation","number":"P0.1","title":"进程、线程与资源：为什么机器空闲，程序仍然很慢"},{"id":"virtual-memory-oom","module":"foundation","number":"P0.2","title":"虚拟内存与 OOM：导出任务为什么被终止"},{"id":"concurrency-pools","module":"foundation","number":"P0.3","title":"并发与线程池：锁、排队和容量"},{"id":"distributed-systems","module":"foundation","number":"P0.4","title":"超时、重试与幂等：系统最难处理的是“结果未知”"},{"id":"cloud-overview","module":"compute","number":"C1.1","title":"云计算架构：服务模型、资源与责任边界"},{"id":"cloud-compute","module":"compute","number":"C1.2","title":"计算资源：虚拟化、规格与容量预算"},{"id":"vpc-network","module":"network","number":"C2.1","title":"云网络：DNS、路由、访问控制与返回路径"},{"id":"network-diagnosis","module":"network","number":"C2.2","title":"网络诊断：连接、首字节与传输时序"},{"id":"tcp-event-loop","module":"network","number":"C2.3","title":"TCP与I/O：从连接、字节流到epoll事件循环"},{"id":"training-storage","module":"cloud-data","number":"C3.1","title":"云存储：块、文件、对象与访问性能"},{"id":"database-index-locks","module":"cloud-data","number":"C3.2","title":"数据库访问：索引、事务与锁等待"},{"id":"cache-consistency","module":"cloud-data","number":"C3.3","title":"缓存一致性与击穿：旧值为何重新出现"},{"id":"storage-recovery","module":"cloud-data","number":"C3.4","title":"存储发布与恢复：版本、提交点与校验"},{"id":"mysql-recovery","module":"cloud-data","number":"C3.5","title":"MySQL日志与恢复：从提交、崩溃到按点重放"},{"id":"mysql-replication","module":"cloud-data","number":"C3.6","title":"MySQL复制与切换：先解释旧读，再证明谁能写"},{"id":"container-runtime","module":"native","number":"C4.1","title":"容器运行原理：镜像、进程、隔离与资源"},{"id":"kubernetes-basics","module":"native","number":"C4.2","title":"Kubernetes 控制面：对象、调谐与生命周期"},{"id":"k8s-workloads","module":"native","number":"C4.3","title":"Kubernetes 工作负载：从声明到可用与滚动更新"},{"id":"scheduling-resources","module":"native","number":"C4.4","title":"Kubernetes 调度：资源、亲和与拓扑约束"},{"id":"k8s-networking","module":"native","number":"C4.5","title":"Kubernetes 网络：从 DNS、Service 到容器回包"},{"id":"k8s-storage","module":"native","number":"C4.6","title":"Kubernetes 存储：PVC、拓扑、挂载与数据恢复"},{"id":"config-secrets","module":"native","number":"C4.7","title":"配置与密钥：传播、重读与版本生效"},{"id":"k8s-autoscaling","module":"native","number":"C4.8","title":"Kubernetes 弹性：HPA、节点容量与排队预算"},{"id":"control-plane-consensus","module":"native","number":"C4.9","title":"控制面协调存储：从多数派提交到观察与恢复"},{"id":"serverless-execution","module":"serverless","number":"C5.1","title":"Serverless 与事件驱动：执行、重试、幂等与成本"},{"id":"message-delivery","module":"serverless","number":"C5.2","title":"消息投递与确认：从入队、处理到业务完成"},{"id":"delivery","module":"cloud-delivery","number":"C6.1","title":"平台交付：制品、配置、数据迁移与回退"},{"id":"terraform-state","module":"cloud-delivery","number":"C6.2","title":"Terraform状态与漂移：配置、锁、刷新和资源归属"},{"id":"gitops-reconciliation","module":"cloud-delivery","number":"C6.3","title":"GitOps调谐：从Git期望到对象、进程与业务结果"},{"id":"iam-security","module":"cloud-security","number":"C7.1","title":"身份与最小权限：谁能让系统做什么"},{"id":"elasticity","module":"cloud-capacity","number":"C8.1","title":"容量与弹性：故障域、扩容时序与排队"},{"id":"slo","module":"sre","number":"C9.1","title":"可靠性目标：SLI、SLO 与错误预算"},{"id":"observability","module":"sre","number":"C9.2","title":"可观测性：用指标定位范围，用日志和追踪解释路径"},{"id":"incident","module":"sre","number":"C9.3","title":"故障诊断：影响、时间线、假设与验证"},{"id":"resilience","module":"sre","number":"C9.4","title":"恢复工程：故障域、RPO、RTO 与演练"},{"id":"transformer-model","module":"model-foundations","number":"A1.1","title":"Transformer 全貌：下一个词是怎么预测出来的"},{"id":"tokenization-embedding","module":"model-foundations","number":"A1.2","title":"Token、词表与 Embedding：标签如何对齐"},{"id":"attention-mechanics","module":"model-foundations","number":"A1.3","title":"Attention 深入推导：QKV、掩码与多头"},{"id":"transformer-block","module":"model-foundations","number":"A1.4","title":"Decoder Block：前馈、残差与归一化"},{"id":"position-encoding","module":"model-foundations","number":"A1.5","title":"位置编码与 RoPE：相对位置怎样进入点积"},{"id":"autograd-training","module":"model-foundations","number":"A1.6","title":"交叉熵与自动求导：完成一次真实更新"},{"id":"gpu-execution","module":"model-foundations","number":"A1.7","title":"GPU 执行与存储：线程如何处理张量"},{"id":"roofline-model","module":"model-foundations","number":"A1.8","title":"Roofline：从计算量与字节判断瓶颈"},{"id":"flash-attention-io","module":"model-foundations","number":"A1.9","title":"FlashAttention：分块如何保持全局 Softmax"},{"id":"tensor-parallel-math","module":"model-foundations","number":"A1.10","title":"张量与流水线并行：切分后的计算与通信"},{"id":"operator-profiling","module":"model-foundations","number":"A1.11","title":"动手算子与性能分析：从数值正确到执行证据"},{"id":"gpu-cluster","module":"training","number":"A2.1","title":"云上训练全景：从任务提交到首个更新","group":0},{"id":"distributed-training","module":"training","number":"A2.2","title":"并行策略：DDP、FSDP、TP 与 PP 的取舍","group":0},{"id":"gpu-memory","module":"training","number":"A2.3","title":"GPU 显存与混合精度：建立可检查的预算","group":0},{"id":"ddp-code","module":"training","number":"A2.4","title":"写对一份 DDP 训练程序","group":1},{"id":"training-communication","module":"training","number":"A2.5","title":"NCCL 与集合通信：定位等待发生在哪里","group":1},{"id":"data-pipeline","module":"training","number":"A2.6","title":"数据管道：让 GPU 持续获得有效输入","group":1},{"id":"multinode-lab","module":"training","number":"A2.7","title":"两机四卡 DDP：从环境检查到训练验收","group":2},{"id":"checkpoint-recovery","module":"training","number":"A2.8","title":"检查点与恢复：证明训练能从中断继续","group":2},{"id":"training-performance","module":"training","number":"A2.9","title":"性能与成本：建立公平的扩展实验","group":2},{"id":"training-platform","module":"platform","number":"A3.1","title":"AI平台在管理什么：从提交契约到可信训练产物"},{"id":"gpu-scheduling","module":"platform","number":"A3.2","title":"GPU队列与调度：从配额准入到拓扑可行性"},{"id":"kubernetes-training","module":"platform","number":"A3.3","title":"走向 Kubernetes：把训练程序变成可管理的作业"},{"id":"model-serving","module":"platform","number":"A3.4","title":"模型推理为什么不同：Prefill、Decode与KV Cache"},{"id":"quantization-serving","module":"platform","number":"A3.5","title":"模型量化：从比例尺到打包、校准与执行"},{"id":"inference-performance","module":"platform","number":"A3.6","title":"推理性能怎样测：统一TTFT、TPOT、吞吐与质量口径"},{"id":"ai-lifecycle","module":"platform","number":"A3.7","title":"模型怎样进入生产：完整产物、评估、发布与回退"},{"id":"moe-routing","module":"platform","number":"A3.8","title":"MoE路由与专家执行：从Top-k到分发、容量与合并"},{"id":"speculative-decoding","module":"platform","number":"A3.9","title":"推测解码：从接受概率到批量验证与缓存回退"},{"id":"agent-runtime","module":"agent","number":"G1","title":"Agent Infra在解决什么：从模型提议到任务完成"},{"id":"mcp-protocol","module":"agent","number":"G1.1","title":"MCP协议与真实SDK：发现、调用、进度与取消"},{"id":"agent-security","module":"agent","number":"G2","title":"Agent的权限边界：谁授权，在哪里拦截，怎样限制效果"},{"id":"agent-sandbox","module":"agent","number":"G3","title":"Agent 沙箱：隔离、资源与生命周期"},{"id":"agent-recovery","module":"agent","number":"G4","title":"工具已经执行，任务却没完成：持久化、幂等与崩溃恢复"},{"id":"agent-memory","module":"agent","number":"G5","title":"上下文、运行状态与长期记忆：三种信息不要混存"},{"id":"agent-evaluation","module":"agent","number":"G6","title":"Agent怎样验收：任务结果、执行轨迹、拒绝行为与成本"},{"id":"durable-workflows","module":"agent","number":"G7","title":"持久工作流：事件重放、接管与提交"},{"id":"agent-retrieval","module":"agent","number":"G8","title":"检索与上下文：让答案有可验证的证据"},{"id":"agent-observability","module":"agent","number":"G9","title":"Agent 观测：任务、重试与成本归因"},{"id":"kairo-practice","module":"agent","number":"G10","title":"Kairo 接入验收：任务、权限与结果证据"},{"id":"training-lab","module":"practice","number":"S1","title":"综合实战：两进程训练、完整恢复与三个失败对照"},{"id":"cloud-service-lab","module":"practice","number":"S2","title":"综合实战：一个服务的探针、版本发布与指标验证"},{"id":"production-readiness","module":"practice","number":"S3","title":"综合设计评审：让Cloud、AI与Agent形成一条可验收链路"}];
const modules=[{"id":"foundation","n":"P0","name":"前置基础知识","track":"cloud"},{"id":"compute","n":"C1","name":"云计算与虚拟化","track":"cloud"},{"id":"network","n":"C2","name":"云网络与流量","track":"cloud"},{"id":"cloud-data","n":"C3","name":"云存储与数据服务","track":"cloud"},{"id":"native","n":"C4","name":"容器与 Kubernetes 编排","track":"cloud"},{"id":"serverless","n":"C5","name":"Serverless 与事件驱动","track":"cloud"},{"id":"cloud-delivery","n":"C6","name":"平台工程、IaC 与 GitOps","track":"cloud"},{"id":"cloud-security","n":"C7","name":"身份、安全与多租户","track":"cloud"},{"id":"cloud-capacity","n":"C8","name":"容量、弹性与成本","track":"cloud"},{"id":"sre","n":"C9","name":"SRE、可观测与故障恢复","track":"cloud"},{"id":"model-foundations","n":"A1","name":"模型计算与 GPU 原理","track":"ai"},{"id":"training","n":"A2","name":"云上 AI 训练","track":"ai"},{"id":"platform","n":"A3","name":"AI 作业平台与推理服务","track":"ai"},{"id":"agent","n":"G","name":"Agent 运行时与 Kairo 实践","track":"agent"},{"id":"practice","n":"S","name":"综合设计与工程实战","track":"shared"}];
const trackDefinitions={"cloud":{"label":"Cloud Infra","modules":["foundation","compute","network","cloud-data","native","serverless","cloud-delivery","cloud-security","cloud-capacity","sre"],"start":"cloud-overview"},"ai":{"label":"AI Infra","modules":["model-foundations","training","platform"],"start":"transformer-model"},"agent":{"label":"Agent Infra","modules":["agent"],"start":"agent-runtime"}};
const courseReadingStages={"cloud":[["先看全貌，再按需补系统前置",["cloud-overview","linux-resource","virtual-memory-oom","concurrency-pools","distributed-systems"]],["云资源、网络与数据主干",["cloud-compute","vpc-network","network-diagnosis","tcp-event-loop","training-storage","database-index-locks","cache-consistency","storage-recovery","mysql-recovery","mysql-replication"]],["从容器到 Kubernetes 运行路径",["container-runtime","kubernetes-basics","k8s-workloads","scheduling-resources","k8s-networking","k8s-storage","config-secrets","k8s-autoscaling","control-plane-consensus"]],["事件平台与可追溯交付",["serverless-execution","message-delivery","delivery","terraform-state","gitops-reconciliation"]],["身份隔离、容量与成本",["iam-security","elasticity"]],["可靠性与完整验收",["slo","observability","incident","resilience","cloud-service-lab"]]],"ai":[["模型与计算原理",["transformer-model","tokenization-embedding","attention-mechanics","transformer-block","position-encoding","autograd-training"]],["GPU 执行、IO 与层内并行",["gpu-execution","roofline-model","flash-attention-io","tensor-parallel-math","operator-profiling"]],["训练系统与资源模型",["gpu-cluster","distributed-training","gpu-memory"]],["执行、恢复与作业平台",["ddp-code","training-communication","data-pipeline","multinode-lab","checkpoint-recovery","training-performance","training-platform","gpu-scheduling","kubernetes-training","training-lab"]],["推理、量化与模型发布",["model-serving","quantization-serving","inference-performance","ai-lifecycle","moe-routing","speculative-decoding"]]],"agent":[["任务与执行边界",["agent-runtime","mcp-protocol","agent-security","agent-sandbox"]],["恢复、上下文与评估",["agent-recovery","agent-memory","agent-evaluation"]],["持久工作流与知识检索",["durable-workflows","agent-retrieval"]],["观测、接入与综合验收",["agent-observability","kairo-practice","production-readiness"]]]};
const learningProfiles={"cloud-platform":{"track":"cloud","label":"云平台与云原生","targets":["cloud-compute","iam-security","k8s-workloads","scheduling-resources","k8s-networking","k8s-storage","config-secrets","k8s-autoscaling","control-plane-consensus","serverless-execution","terraform-state","gitops-reconciliation","cloud-service-lab"],"route":["cloud-overview","linux-resource","cloud-compute","iam-security","virtual-memory-oom","container-runtime","kubernetes-basics","k8s-workloads","scheduling-resources","vpc-network","k8s-networking","training-storage","k8s-storage","config-secrets","k8s-autoscaling","distributed-systems","control-plane-consensus","serverless-execution","storage-recovery","delivery","terraform-state","gitops-reconciliation","slo","cloud-service-lab"],"gateChapters":["cloud-service-lab","vpc-network","k8s-workloads","config-secrets","k8s-storage","gitops-reconciliation","iam-security","serverless-execution","delivery"]},"cloud-sre":{"track":"cloud","label":"SRE 与稳定性","targets":["cloud-compute","iam-security","tcp-event-loop","database-index-locks","cache-consistency","mysql-recovery","mysql-replication","k8s-networking","control-plane-consensus","elasticity","observability","resilience","cloud-service-lab"],"route":["cloud-overview","linux-resource","cloud-compute","iam-security","vpc-network","network-diagnosis","tcp-event-loop","concurrency-pools","training-storage","database-index-locks","cache-consistency","storage-recovery","mysql-recovery","mysql-replication","virtual-memory-oom","container-runtime","kubernetes-basics","k8s-workloads","k8s-networking","distributed-systems","control-plane-consensus","elasticity","slo","observability","incident","resilience","delivery","cloud-service-lab"],"gateChapters":["observability","cloud-compute","slo","network-diagnosis","elasticity","database-index-locks","resilience","cache-consistency","storage-recovery"]},"ai-training":{"track":"ai","label":"分布式训练与作业平台","targets":["gpu-memory","training-communication","data-pipeline","multinode-lab","training-performance","gpu-scheduling","kubernetes-training","training-lab"],"route":["transformer-model","tokenization-embedding","attention-mechanics","transformer-block","autograd-training","gpu-execution","gpu-cluster","distributed-training","gpu-memory","ddp-code","training-communication","data-pipeline","multinode-lab","checkpoint-recovery","training-performance","training-platform","gpu-scheduling","kubernetes-training","training-lab"],"gateChapters":["ddp-code","gpu-memory","training-communication","data-pipeline","checkpoint-recovery","multinode-lab","training-platform","gpu-scheduling","kubernetes-training"]},"ai-inference":{"track":"ai","label":"模型推理与服务","targets":["position-encoding","roofline-model","model-serving","quantization-serving","inference-performance","ai-lifecycle","speculative-decoding"],"route":["transformer-model","tokenization-embedding","attention-mechanics","transformer-block","position-encoding","gpu-execution","roofline-model","model-serving","quantization-serving","inference-performance","ai-lifecycle","speculative-decoding"],"gateChapters":["model-serving","transformer-block","position-encoding","inference-performance","speculative-decoding","ai-lifecycle","quantization-serving"]},"ai-operators":{"track":"ai","label":"GPU 与算子性能","targets":["position-encoding","autograd-training","flash-attention-io","tensor-parallel-math","operator-profiling"],"route":["transformer-model","tokenization-embedding","attention-mechanics","transformer-block","position-encoding","autograd-training","gpu-execution","roofline-model","flash-attention-io","tensor-parallel-math","operator-profiling"],"gateChapters":["operator-profiling","tensor-parallel-math","flash-attention-io"]},"agent-app":{"track":"agent","label":"Agent 应用与评估","targets":["mcp-protocol","agent-security","agent-recovery","agent-memory","agent-retrieval","agent-evaluation","agent-observability"],"route":["agent-runtime","mcp-protocol","agent-security","agent-recovery","agent-memory","agent-retrieval","agent-evaluation","agent-observability"],"gateChapters":["agent-runtime","agent-retrieval","agent-memory","production-readiness","agent-evaluation","agent-observability"]},"agent-platform":{"track":"agent","label":"Agent 运行平台","targets":["mcp-protocol","agent-sandbox","durable-workflows","agent-retrieval","agent-observability","kairo-practice","production-readiness"],"route":["agent-runtime","mcp-protocol","agent-security","agent-sandbox","agent-recovery","durable-workflows","agent-memory","agent-retrieval","agent-evaluation","agent-observability","kairo-practice","production-readiness"],"gateChapters":["agent-sandbox","mcp-protocol","durable-workflows","kairo-practice","agent-observability","production-readiness"]}};
const conceptDirectoryTitles={"linux-resource":"进程、线程与资源","virtual-memory-oom":"虚拟内存与 OOM","concurrency-pools":"并发、锁与线程池","distributed-systems":"超时、重试与幂等","cloud-overview":"云计算架构与服务模型","cloud-compute":"虚拟化与计算资源","vpc-network":"DNS、路由与网络边界","network-diagnosis":"网络诊断与请求时序","tcp-event-loop":"TCP、I/O 与 epoll","training-storage":"块、文件与对象存储","database-index-locks":"SQL 索引、事务与锁","cache-consistency":"缓存一致性与击穿","storage-recovery":"存储版本、发布与恢复","mysql-recovery":"MySQL 日志与恢复","mysql-replication":"MySQL 复制与切换","container-runtime":"容器、镜像与隔离","kubernetes-basics":"Kubernetes 对象与控制面","k8s-workloads":"工作负载与滚动更新","scheduling-resources":"调度、亲和与拓扑","k8s-networking":"Pod、Service 与容器网络","k8s-storage":"PVC、持久卷与恢复","config-secrets":"配置、密钥与生效过程","k8s-autoscaling":"HPA 与节点容量","control-plane-consensus":"etcd、多数派与恢复","serverless-execution":"Serverless 与事件驱动","message-delivery":"消息投递与确认","delivery":"制品、发布与回退","terraform-state":"Terraform 状态与漂移","gitops-reconciliation":"GitOps 与持续调谐","iam-security":"身份、授权与最小权限","elasticity":"容量、排队与弹性","slo":"SLI、SLO 与错误预算","observability":"指标、日志与追踪","incident":"故障诊断与时间线","resilience":"RPO、RTO 与恢复工程","transformer-model":"Transformer 整体结构","tokenization-embedding":"Token、词表与 Embedding","attention-mechanics":"Attention、QKV 与多头","transformer-block":"FFN、残差与归一化","position-encoding":"位置编码与 RoPE","autograd-training":"损失、梯度与参数更新","gpu-execution":"GPU 执行与存储层次","roofline-model":"Roofline 与性能瓶颈","flash-attention-io":"FlashAttention 与分块","tensor-parallel-math":"张量并行与流水线并行","operator-profiling":"算子实现与性能分析","gpu-cluster":"云上训练的完整流程","distributed-training":"DDP、FSDP 与并行策略","gpu-memory":"训练显存与混合精度","ddp-code":"DDP 程序与全局目标","training-communication":"NCCL 与集合通信","data-pipeline":"数据读取、分片与组批","multinode-lab":"两机四卡 DDP 实战","checkpoint-recovery":"检查点与训练恢复","training-performance":"训练性能、扩展与成本","training-platform":"训练作业与平台契约","gpu-scheduling":"GPU 队列、配额与调度","kubernetes-training":"Kubernetes 训练作业","model-serving":"Prefill、Decode 与 KV Cache","quantization-serving":"量化、打包与校准","inference-performance":"TTFT、TPOT 与服务吞吐","ai-lifecycle":"模型产物、评估与发布","moe-routing":"MoE 路由与专家执行","speculative-decoding":"推测解码与缓存回退","agent-runtime":"Agent 组成与执行循环","mcp-protocol":"MCP 工具协议与 SDK","agent-security":"Agent 身份与权限","agent-sandbox":"沙箱与执行隔离","agent-recovery":"持久状态、幂等与恢复","agent-memory":"上下文、状态与长期记忆","agent-evaluation":"任务评估与产物验收","durable-workflows":"持久工作流与接管","agent-retrieval":"检索、证据与上下文","agent-observability":"任务追踪与成本归因","kairo-practice":"Kairo 接入与综合验收","training-lab":"训练与恢复综合实战","cloud-service-lab":"云服务发布与观测实战","production-readiness":"跨领域系统设计实战"};
const conceptDirectoryGroups={"transformer-model":"模型结构与计算","gpu-execution":"GPU 与算子","training-platform":"训练作业平台","model-serving":"推理服务","moe-routing":"专家模型与生成优化","agent-runtime":"任务与工具","agent-recovery":"状态、恢复与验收","durable-workflows":"工作流、检索与观测","kairo-practice":"Kairo 接入"};
const trainingDirectoryGroupTitles=["训练状态与资源","分布式执行与数据供给","多机训练、恢复与性能"];
const quantizationLegacyAnchors={"section-8":"section-1","quantization-number-map":"quantization-number-map","section-9":"section-3","section-10":"section-4","section-11":"section-5"};
const legacyTrackKnowledgeAnchors={"cloud":["concept-path","knowledge-service-model","knowledge-control-data-plane","knowledge-fault-domain","knowledge-vm-runtime","virtualization-resource-contract","knowledge-cpu-memory-placement","knowledge-instance-lifecycle","knowledge-resource-contract","concept-relations","resource-aws-reliability","resource-terraform-state","examples"],"ai":["concept-path","knowledge-mf-tensors","knowledge-mf-attention","knowledge-mf-decoder","knowledge-mf-autograd","knowledge-mf-gpu","knowledge-mf-roofline","concept-relations","examples","resource-d2l-zh","resource-one-gpu-lm","resource-ntu-genai"],"agent":["concept-path","knowledge-ag-runtime","tool-task-contract","tool-finite-loop","knowledge-ag-tools","knowledge-ag-recovery","cancel-request-and-effect","knowledge-ag-fencing","knowledge-ag-authorization","approval-records","knowledge-ag-context","context-state-authority","stale-context-recovery","knowledge-ag-retrieval","retrieval-lexical-foundation","retrieval-evidence-pipeline","knowledge-ag-observability","agent-observation-signals","agent-trace-effect-boundary","knowledge-ag-evaluation","evaluation-metric-contract","knowledge-ag-sandbox","sandbox-authority-boundary","concept-relations","examples","resource-hf-agents","resource-ntu-genai","resource-berkeley-agents"]};
const attentionValidation={"report":{"attention":{"queries":[[1,0],[0,1],[1,1],[-1,1]],"keys":[[1,0],[0,1],[1,1],[1,-1]],"values":[[10,0],[0,20],[30,10],[5,-5]],"weights":[[1,0,0,0],[0.3302384506733431,0.6697615493266569,0,0],[0.2482550782577231,0.2482550782577231,0.5034898434845538,0],[0.13098547884644676,0.5387760704802101,0.26565361202674675,0.06458483864659637]],"output":[[10,0],[3.302384506733431,13.395230986533138],[17.587246087113847,10],[9.602387342499853,13.109133336638688]],"cache_max_abs_error":0,"future_value_cannot_change_past":true,"unmasked_negative_control_changes_past":true,"uniform_oracle":[2,3,35.33333333333333],"visible_value_changes_output":true}}};

const infraBasePath=document.querySelector('base')?.getAttribute('href')||'/';

const $=s=>document.querySelector(s);
const articleById=id=>articles.find(a=>a.id===id);
const moduleFor=id=>modules.find(m=>m.id===id);
const articleURL=id=>hostedPath('/article/'+id+'/');
const sidebar=(moduleId,current)=>sidebarView(moduleId,current);

const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const trainingEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Sharing keeps the canonical deployment origin and project prefix, including in local preview.
const publicSiteOrigin=(()=>{try{const canonical=new URL(document.querySelector('link[rel=canonical]').href);return canonical.origin+canonical.pathname.replace(/\/(?:article|track)\/[^/]+\/?$/,'').replace(/\/$/,'')}catch{return location.origin}})();

const hostedPath=function hostedPath(value){if(infraBasePath==='/'||!value.startsWith('/')||value.startsWith('//'))return value;const prefix=infraBasePath.replace(/\/$/,'');return value===prefix||value.startsWith(prefix+'/')?value:prefix+value;};
const documentPathname=function documentPathname(){const path=location.pathname;if(infraBasePath==='/')return path;const prefix=infraBasePath.replace(/\/$/,'');return path===prefix?'/':path.startsWith(prefix+'/')?path.slice(prefix.length):path;};
const publicRoute=function publicRoute(value){
 const raw=value.replace(/^#/,''),hashAt=raw.indexOf('#'),fragment=hashAt<0?'':raw.slice(hashAt),withoutHash=hashAt<0?raw:raw.slice(0,hashAt);
 const queryAt=withoutHash.indexOf('?'),path=queryAt<0?withoutHash:withoutHash.slice(0,queryAt),query=queryAt<0?'':withoutHash.slice(queryAt);
 return hostedPath((path==='/'?'/':path.replace(/\/$/,'')+'/')+query+fragment);
};
const readerInternalHref=function readerInternalHref(value){
 const normalized=value.startsWith('#/')?publicRoute(value):hostedPath(value.startsWith('article/')?'/'+value:value);
 return typeof learningContextHref==='function'?learningContextHref(normalized):normalized;
};
const cleanInternalHTML=function cleanInternalHTML(html){return html.replace(/href="((?:#\/|\/(?!\/)|article\/)[^"]*)"/g,(_,href)=>'href="'+readerInternalHref(href.replace(/&amp;/g,'&')).replace(/&/g,'&amp;')+'"');};
const normalizeInternalLinks=function normalizeInternalLinks(){document.querySelectorAll('a[href^="#/"],a[href^="/"],a[href^="article/"]').forEach(a=>a.setAttribute('href',readerInternalHref(a.getAttribute('href'))))};
const initReaderActions=function initReaderActions(){document.querySelectorAll('[data-download-note]').forEach(button=>button.onclick=()=>{const block=button.closest('details'),answer=block.querySelector('[data-reader-answer]').value.trim(),question=block.querySelector('[data-reader-question]').value.trim(),error=block.querySelector('.reader-error');if(!answer&&!question){error.textContent='先写下一项练习结果或一个具体问题，再下载。';return}error.textContent='';const a=articles.find(x=>x.id===button.dataset.downloadNote),body=['InfraGuide 阅读记录',a.number+' '+a.title,publicSiteOrigin+'/article/'+a.id+'/','','练习答案 / 实验结果：',answer||'未填写','','卡点 / 希望补充的例子：',question||'未填写','','这是一份读者主动填写的记录，不代表网站已自动收到反馈。'].join('\n');const url=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='infraguide-'+a.id+'-notes.txt';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);error.textContent='阅读记录已生成，可回到原文评论或私信中分享。'});document.querySelectorAll('.share-url').forEach(input=>input.onclick=()=>input.select())};
const chapterDirectoryTitle=function chapterDirectoryTitle(article){return conceptDirectoryTitles[article.id]||article.title;};
const courseDirectoryEntries=function courseDirectoryEntries(chapters){
 const groups=[];let current;
 for(const article of chapters){
  const title=conceptDirectoryGroups[article.id]||(article.module==='training'?trainingDirectoryGroupTitles[article.group]:'')||'';
  if(!current||current.module!==article.module||(title&&title!==current.title)){
   current={id:article.id,module:article.module,title,entries:[]};groups.push(current);
  }
  current.entries.push({article,label:chapterDirectoryTitle(article),fullTitle:article.title});
 }
 return groups;
};
const chapterReadingContext=function chapterReadingContext(a){
 if(!a)return {track:'shared',ids:[],index:-1,previous:null,next:null,stage:''};
 for(const[track,stages]of Object.entries(courseReadingStages)){
  const ids=stages.flatMap(s=>s[1]),index=ids.indexOf(a.id);
  if(index>=0)return {track,ids,index,previous:articleById(ids[index-1]),next:articleById(ids[index+1]),stage:stages.find(s=>s[1].includes(a.id))[0]};
 }
 return {track:moduleFor(a.module).track,ids:[a.id],index:0,previous:null,next:null,stage:''};
};
const chapterReadingNav=function chapterReadingNav(a){
 const r=chapterReadingContext(a),label=trackDefinitions[r.track]?.label||'综合实战';
 return '<nav class="article-nav" aria-label="相邻文章"><p class="reading-sequence-label">按学习路线连续阅读 · '+label+'</p>'+
 (r.previous?'<a data-reading-direction="previous" href="'+articleURL(r.previous.id)+'"><small>← 上一篇</small>'+r.previous.number+' '+r.previous.title+'</a>':'<a href="/roadmap/?track='+r.track+'#route-'+r.track+'"><small>← 开始之前</small>本方向的整体路线</a>')+
 (r.next?'<a data-reading-direction="next" href="'+articleURL(r.next.id)+'"><small>下一篇 →</small>'+r.next.number+' '+r.next.title+'</a>':'<a href="/roadmap/?track='+r.track+'#synthesis-'+r.track+'"><small>串起整条主线 →</small>完成跨章推演</a>')+'</nav>';
};
const selectedLearningProfile=function selectedLearningProfile(){if(typeof location==='undefined')return null;const path=location.pathname?.match(/\/roadmap\/([a-z-]+)\/?$/)?.[1];return learningProfiles[path]||learningProfiles[new URLSearchParams(location.search).get('goal')]||null;};
const trackRoadmapLink=function trackRoadmapLink(track){
 const profile=selectedLearningProfile();
 const goal=profile?.track===track?Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile):null;
 return goal?{href:'/roadmap/'+goal+'/#learning-goal',label:profile.label+'路线 →'}:
  {href:'/roadmap/?track='+track+'#route-'+track,label:'学习路线 →'};
};
const learningProfilePriority=function learningProfilePriority(id,profile){const ids=learningProfileRoute(profile);return profile.targets.includes(id)?'岗位重点':ids.includes(id)?'先修基础':'选学专题';};
const learningProfileGateChapters=function learningProfileGateChapters(profile){
 return profile.gateChapters||[...new Set(profile.gate.checks.flatMap(check=>[check.primary,...check.more].map(([id])=>id)))];
};
const readingArticleURL=function readingArticleURL(id){const profile=selectedLearningProfile();return articleURL(id)+(profile&&learningProfileRoute(profile).includes(id)?'?goal='+Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile):'');};
const learningGoalChapterNav=function learningGoalChapterNav(a){
 const profile=selectedLearningProfile();if(!profile)return '';
 const id=Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile),route=learningProfileRoute(profile),index=route.indexOf(a.id);
 const isGateChapter=learningProfileGateChapters(profile).includes(a.id);
 const gateReturn='<a href="/roadmap/'+id+'/#goal-gate">回到这条路线的交付题 →</a>';
 if(index<0)return isGateChapter?
  '<nav class="goal-reading-nav" aria-label="当前岗位验收"><span>“'+profile.label+'”的验收对照</span>'+gateReturn+'</nav>':'';
 const previous=articleById(route[index-1]),next=articleById(route[index+1]);
 const gateLink=next?(isGateChapter?gateReturn:''):'<a href="/roadmap/'+id+'/#goal-gate">打开这条路线的交付题 →</a>';
 return '<nav class="goal-reading-nav" aria-label="当前岗位路线"><span>正在按“'+profile.label+'”学习 · '+(index+1)+' / '+route.length+'</span><a href="/roadmap/'+id+'/#learning-goal">查看这条路线</a>'+gateLink+(previous?'<a href="'+readingArticleURL(previous.id)+'">← 上一章：'+previous.number+' '+previous.title+'</a>':'')+(next?'<a href="'+readingArticleURL(next.id)+'">本路线下一章：'+next.number+' '+next.title+' →</a>':'')+'</nav>';
};
const learningContextHref=function learningContextHref(href){
 if(typeof href!=='string'||!href.startsWith('/')||href.startsWith('//'))return href;
 const hashAt=href.indexOf('#'),fragment=hashAt<0?'':href.slice(hashAt),withoutHash=hashAt<0?href:href.slice(0,hashAt);
 const queryAt=withoutHash.indexOf('?'),pathname=queryAt<0?withoutHash:withoutHash.slice(0,queryAt);
 const query=new URLSearchParams(queryAt<0?'':withoutHash.slice(queryAt+1));
 const articleId=pathname.match(/\/article\/([a-z0-9-]+)\/?$/)?.[1],moduleId=pathname.match(/\/module\/([a-z0-9-]+)\/?$/)?.[1];
 const position=/\/roadmap\/?$/.test(pathname)?fragment.match(/^#route-chapter-(cloud|ai|agent)-([a-z0-9-]+)$/):null;
 const labTask=/\/labs\/?$/.test(pathname)&&/^#lab-[a-z0-9-]+$/.test(fragment);
 if(!articleId&&!moduleId&&!position&&!labTask)return href;
 const profile=selectedLearningProfile(),explicitGoal=query.has('goal');
 const currentPath=typeof location==='undefined'?'':location.pathname||'';
 const currentParams=new URLSearchParams(typeof location==='undefined'?'':location.search);
 const currentId=currentPath.match(/\/article\/([a-z0-9-]+)\/?$/)?.[1];
 const currentGate=profile&&currentId&&learningProfileGateChapters(profile).includes(currentId);
 if(labTask){
  if(explicitGoal||!profile||query.get('track')!==profile.track)return href;
  query.set('goal',Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile));
  return pathname+'?'+query.toString()+fragment;
 }
 if(position){
  if(explicitGoal||profile?.track!==position[1]||query.get('track')!==position[1])return href;
  const inRoute=learningProfileRoute(profile).includes(position[2]);
  if(!inRoute&&!(currentGate&&currentId===position[2]))return href;
  const goal=Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile);
  query.delete('track');
  const rest=query.toString();
  return pathname.replace(/\/roadmap\/?$/,'/roadmap/'+goal+'/')+(rest?'?'+rest:'')+(inRoute?'#goal-chapter-'+position[2]:'#goal-gate');
 }
 let changed=false;
 if(articleId&&articleId===currentId&&!query.has('fromConcept')&&currentParams.has('fromConcept')){
  query.set('fromConcept',currentParams.get('fromConcept'));
  if(!explicitGoal&&!query.has('returnGoal')&&currentParams.has('returnGoal'))query.set('returnGoal',currentParams.get('returnGoal'));
  changed=true;
 }
 if(moduleId==='practice'){
  const current=articles.find(a=>a.id===currentId);
  const explicitProfile=explicitGoal?learningProfiles[query.get('goal')]:null;
  const track=query.get('track')||explicitProfile?.track||profile?.track||currentParams.get('track')||(current?chapterReadingContext(current).track:null);
  if(track&&Object.hasOwn(trackDefinitions,track)&&!query.has('track')){query.set('track',track);changed=true;}
  if(!explicitGoal&&profile&&profile.track===track){query.set('goal',Object.keys(learningProfiles).find(id=>learningProfiles[id]===profile));changed=true;}
 }else if(!explicitGoal&&profile){
  const matches=articleId?learningProfileRoute(profile).includes(articleId)||(currentGate&&currentId===articleId):modules.some(m=>m.id===moduleId&&m.track===profile.track);
  const goal=Object.keys(learningProfiles).find(id=>learningProfiles[id]===profile);
  if(matches){query.set('goal',goal);changed=true;}
  else if(articleId&&query.has('fromConcept')&&!query.has('returnGoal')){
   const fromField=query.get('fromConcept').split('.')[0],activeField=currentPath.match(/\/module\/([a-z0-9-]+)\/?$/)?.[1];
   if(fromField===activeField&&modules.some(m=>m.id===fromField&&m.track===profile.track)){query.set('returnGoal',goal);changed=true;}
  }
 }
 return changed?pathname+'?'+query.toString()+fragment:href;
};
const practiceArticleForContext=function practiceArticleForContext(){
 const requested=new URLSearchParams(typeof location==='undefined'?'':location.search).get('track'),track=requested||selectedLearningProfile()?.track;
 return articles.find(a=>a.module==='practice'&&chapterReadingContext(a).track===track)||articles.find(a=>a.module==='practice');
};
const sidebarView=function sidebarView(moduleId, current) {
 const track = current?chapterReadingContext(articleById(current)).track:moduleFor(moduleId).track;
 const routeIds=courseReadingStages[track]?.flatMap(s=>s[1]);
 const topicArticles = articles.filter(article => routeIds?routeIds.includes(article.id):trackForModule(article.module) === track);
 const topicModules = modules.filter(module => topicArticles.some(a=>a.module===module.id));
 const read = topicArticles.filter(article => progress[article.id]).length;
 const label = trackDefinitions[track]?.label || '综合实战';
 const sections = topicModules.map(module => {
  const active = module.id === moduleId;
  const chapters = topicArticles.filter(article => article.module === module.id);
  const links = courseDirectoryEntries(chapters).map(group => {
   const entries=group.entries.map(({article,label,fullTitle})=>{
    const selected = article.id === current ? 'class="current" aria-current="page"' : '';
    return `<a href="${readingArticleURL(article.id)}" title="${trainingEscape(fullTitle)}" ${selected}>${article.number} ${trainingEscape(label)}${progress[article.id]?'<span class="read-mark">✓</span>':''}</a>`;
   }).join('');
   return group.title?'<section class="directory-group side-directory-group" data-directory-group="'+group.id+'" aria-label="'+trainingEscape(group.title)+'"><h3 class="side-group">'+trainingEscape(group.title)+'</h3><div class="directory-group-items">'+entries+'</div></section>':entries;
  }).join('');
  const summaryHref=readingArticleURL(chapters[0].id);
  return `<details data-directory-module="${module.id}" ${active?'open':''}><summary><a href="${summaryHref}" ${active&&!current?'class="current" aria-current="page"':''}><span>${module.n}</span>${module.name}</a></summary><div class="side-links">${links}</div></details>`;
 }).join('');
 const overview=track==='ai'?`<a class="side-home" data-track-overview href="${readingArticleURL('transformer-model')}#ai-infra-map">AI Infra 全貌</a>`:'';
 return `<aside class="sidebar" aria-label="章节导航">${overview}<a class="side-home" href="/outline/">← 全站大纲</a>
  <div class="side-heading"><span>${label} · 目录</span><span>${topicArticles.filter(a=>a.module!=='practice').length} 章${topicArticles.some(a=>a.module==='practice')?' + 1 实战':''}</span></div>${sections}
  <div class="side-progress"><div><span>本主题阅读进度</span><b>${read} / ${topicArticles.length}</b></div>
   <div class="progress-bar"><span style="width:${read/topicArticles.length*100}%"></span></div><span>仅保存在当前浏览器</span></div></aside>`;
};
const courseRedirectFor=function courseRedirectFor(path,search='',hash=''){
 if(path==='/start/'||path==='/start')return '/'+search+hash;
 // Previously a track URL rendered a full field reference. Preserve its deep links.
 const legacyTrack=path.match(/^\/track\/(cloud|ai|agent)\/?$/);
 if(legacyTrack){
  let anchor;try{anchor=decodeURIComponent(hash.slice(1));}catch{return null;}
  if(legacyTrackKnowledgeAnchors[legacyTrack[1]].includes(anchor)){
   const moduleId={cloud:'compute',ai:'model-foundations',agent:'agent'}[legacyTrack[1]];
   return '/module/'+moduleId+'/'+search+hash;
  }
 }
 if(path!=='/article/model-serving/'&&path!=='/article/model-serving')return null;
 const query=new URLSearchParams(search);
 let anchor=hash.slice(1);
 try{anchor=decodeURIComponent(anchor)}catch{return null}
 if(!anchor&&query.has('section'))anchor='section-'+query.get('section');
 const target=quantizationLegacyAnchors[anchor];
 if(!target)return null;
 query.delete('section');
 return '/article/quantization-serving/'+(query.toString()?'?'+query.toString():'')+'#'+target;
};
const legacySectionTarget=function legacySectionTarget(articleId,section){return articleId==='network-diagnosis'&&section==='7'?'network-timing-lab':section};
const restoreDocumentFragment=function restoreDocumentFragment(){const hash=location.hash;if(!hash||hash.startsWith('#/'))return;let id;try{id=decodeURIComponent(hash.slice(1))}catch{return}requestAnimationFrame(()=>{if(location.hash!==hash)return;const target=document.getElementById(id);for(let node=target;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;const child=target?.querySelector?.(':scope > details.article-case');if(child)child.open=true;target?.scrollIntoView({behavior:'instant'})})};
const hydrateStaticArticle=function hydrateStaticArticle(){
 const shell=$('#app'),path=documentPathname();
 if(shell?.getAttribute?.('data-static-path')!==path)return false;
 if(typeof staticReadingVersion==='undefined'||shell.getAttribute('data-static-version')!==staticReadingVersion)return false;
 const parts=path.split('/').filter(Boolean),id=shell.getAttribute('data-static-article');
 const expected=parts[0]==='article'?parts[1]:parts[0]==='track'?trackDefinitions[parts[1]]?.start:parts[0]==='module'&&parts[1]==='practice'?practiceArticleForContext()?.id:null;
 const article=articles.find(a=>a.id===id);
 if(!article||expected!==id||!$('.doc-layout .article'))return false;
 currentPath=path;
 // Only the small personal navigation changes with local progress and a chosen role.
 const side=$('.sidebar');
 if(Object.keys(progress).some(key=>progress[key])&&side){
  const expanded=[...(side.querySelectorAll?.('details')||[])].map(detail=>detail.open);
  side.outerHTML=sidebar(article.module,article.id);
  [...($('.sidebar')?.querySelectorAll?.('details')||[])].forEach((detail,index)=>{if(index<expanded.length)detail.open=expanded[index];});
 }
 const roleNav=learningGoalChapterNav(article),currentNav=$('.goal-reading-nav')||$('.article-nav');
 if(roleNav&&currentNav)currentNav.outerHTML=roleNav;
 if(parts[0]==='track'&&location.search){
  const jump=$('.track-entry-head a');
  jump?.setAttribute('href',location.pathname+location.search+'#section-1');
 }
 const roadmap=$('[data-track-roadmap]');
 if(roadmap&&location.search){
  const {href,label}=trackRoadmapLink(chapterReadingContext(article).track);
  roadmap.setAttribute('href',href);
  roadmap.textContent=label;
 }
 const read=document.querySelector('[data-read="'+id+'"]');
 if(read){read.classList.toggle('done',!!progress[id]);read.textContent=progress[id]?'✓ 已读 · 点击取消':'标记为已读';}
 let changedChecks=false;
 for(const input of document.querySelectorAll('input[data-check]')){
  const key=input.dataset.check;
  if(input.checked!==input.defaultChecked){checks[key]=input.checked;changedChecks=true;}
  else input.checked=!!checks[key];
 }
 if(changedChecks)writeStore('cloudinfra-checks',checks);
 document.querySelectorAll('.top-nav a').forEach(a=>a.classList.remove('active'));
 document.querySelector('.top-nav a[href="'+publicRoute('#/track/'+chapterReadingContext(article).track)+'"]')?.classList.add('active');
 normalizeInternalLinks();initInteractive();initReadingComfort();initFieldConceptMaps();
 shell.setAttribute('data-hydrated-static','true');
 const queryTarget=legacySectionTarget(id,new URLSearchParams(location.search||'').get('section'));
 const engaged=document.activeElement?.matches?.('input,textarea,select,button,summary,a[href]');
 const reveal=(target,forceScroll)=>{
  let opened=false;
  for(let node=target;node;node=node.parentElement)if(node.tagName==='DETAILS'&&!node.open){node.open=true;opened=true;}
  const child=target?.querySelector?.(':scope > details.article-case');if(child&&!child.open){child.open=true;opened=true;}
  if(!engaged&&(opened||forceScroll))target?.scrollIntoView({behavior:'instant'});
 };
 // The browser has already positioned ordinary static fragments. Only a newly
 // revealed target or the legacy query syntax needs an extra startup scroll.
 if(location.hash&&!location.hash.startsWith('#/'))requestAnimationFrame(()=>{
  let targetId;try{targetId=decodeURIComponent(location.hash.slice(1));}catch{return;}
  reveal(document.getElementById(targetId),false);
 });
 else if(queryTarget)requestAnimationFrame(()=>reveal(document.getElementById(/^\d+$/.test(queryTarget)?'section-'+queryTarget:queryTarget),true));

 return true;
};
const initInteractive=function initInteractive(){initReaderActions();initAttentionDemo();initSystemInteractive();if($('#topology-demo')){let mode=0;const render=()=>{const info=[['单卡训练','一张 GPU 承载训练：先关注显存容量、算子效率与数据输入。'],['单机多卡','多张 GPU 在同一节点协作：新增梯度同步、数据分片与机内互联问题。'],['多机多卡','跨节点通信成为关键路径之一：同时验证网络、拓扑、任务协调与整体恢复。']];const node=(n,c)=>`<div class="gpu-node"><small>NODE ${n}</small><div class="gpu-chips">${Array.from({length:c},(_,i)=>`<span>GPU ${i}</span>`).join('')}</div></div>`;$('#topology-demo').innerHTML=`<div class="interactive"><div class="segmented" aria-label="训练拓扑">${info.map((x,i)=>`<button data-topology="${i}" class="${i===mode?'active':''}" aria-pressed="${i===mode}">${x[0]}</button>`).join('')}</div><div class="topology-nodes">${node('A',mode?2:1)}${mode===2?'<div class="network-bridge">⇄<br>节点间网络</div>'+node('B',2):''}</div><p class="demo-caption" aria-live="polite">${info[mode][1]}</p></div>`;$('#topology-demo').querySelectorAll('button').forEach(b=>b.onclick=()=>{mode=Number(b.dataset.topology);render()})};render()}
if($('#scaling-demo')){$('#scaling-demo').innerHTML=`<div class="interactive"><p class="demo-caption">计算示例：初始数值仅演示公式，不是实测基准。可填入同口径的真实结果。</p><div class="calc-fields"><label>单卡吞吐（样本/秒）<input id="base-throughput" type="number" min="0.01" step="any" value="100"></label><label>多卡吞吐（样本/秒）<input id="multi-throughput" type="number" min="0.01" step="any" value="620"></label><label>GPU 数量<input id="gpu-count" type="number" min="1" max="100000" step="1" value="8"></label></div><div id="calc-result" aria-live="polite"></div></div>`;const calc=()=>{const a=Number($('#base-throughput').value),b=Number($('#multi-throughput').value),n=Number($('#gpu-count').value);$('#calc-result').innerHTML=(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b<=0||!Number.isInteger(n)||n<1||n>100000)?'<p class="calc-error">请输入正数吞吐和有效的整数 GPU 数量。</p>':`<div class="calc-output"><div><strong>${(b/a).toFixed(2)}×</strong><small>吞吐加速比</small></div><div><strong>${(b/a/n*100).toFixed(1)}%</strong><small>扩展效率</small></div></div>${b/a/n>1?'<p class="demo-caption">效率超过 100%，请检查比较口径；缓存和工作负载变化也可能带来超线性结果。</p>':''}`};document.querySelectorAll('.calc-fields input').forEach(i=>i.addEventListener('input',calc));calc()}};
const attentionExample=function attentionExample(position,causal,changeFuture){
 const {queries,keys,values}=attentionValidation.report.attention;
 const query=queries[position],count=causal?position+1:keys.length;
 const scores=keys.slice(0,count).map(key=>query.reduce((sum,x,i)=>sum+x*key[i],0)/Math.sqrt(query.length));
 const exps=scores.map(x=>Math.exp(x-Math.max(...scores))),denominator=exps.reduce((x,y)=>x+y,0);
 const weights=exps.map(x=>x/denominator).concat(Array(keys.length-count).fill(0));
 const adjusted=values.map((v,i)=>changeFuture&&i===3?[999,-999]:v);
 return {weights,output:values[0].map((_,j)=>weights.reduce((sum,p,i)=>sum+p*adjusted[i][j],0))};
};
const initAttentionDemo=function initAttentionDemo(){const root=document.getElementById('attention-demo');if(!root)return;let position=0,causal=true,change=false;
 const render=()=>{const r=attentionExample(position,causal,change);root.innerHTML=`<div class="interactive"><div class="demo-title">选一个query位置，观察它能读取谁<span>固定向量的数学演示 · 不是模型生成</span></div><div class="segmented">${[0,1,2,3].map(i=>`<button data-position="${i}" class="${i===position?'active':''}" aria-pressed="${i===position}">位置 ${i}</button>`).join('')}</div><div class="attention-controls"><label><input type="checkbox" data-causal ${causal?'checked':''}> 使用因果mask</label><label><input type="checkbox" data-future ${change?'checked':''}> 将位置3的V改为[999, −999]</label></div><div class="attention-weights">${r.weights.map((w,i)=>`<div class="${causal&&i>position?'masked':''}"><small>KEY / VALUE ${i}</small><b>${(w*100).toFixed(1)}%</b><span>${causal&&i>position?'未来位置 · 被屏蔽':'参与加权'}</span></div>`).join('')}</div><p class="attention-output" aria-live="polite">位置${position}的输出向量：[${r.output.map(x=>x.toFixed(3)).join(', ')}]</p><p class="demo-caption">先保持位置0与因果mask，修改未来V：输出仍为[10, 0]。再移除mask，观察未来信息如何影响过去。</p></div>`;root.querySelectorAll('[data-position]').forEach(b=>b.onclick=()=>{position=Number(b.dataset.position);render()});root.querySelector('[data-causal]').onchange=e=>{causal=e.target.checked;render()};root.querySelector('[data-future]').onchange=e=>{change=e.target.checked;render()}};render();};
const sloCalculation=function sloCalculation(total,good,target){
 if(!Number.isSafeInteger(total)||!Number.isSafeInteger(good)||total<0||good<0||good>total||!Number.isFinite(target)||target<=0||target>=100)return {error:'请输入有效整数事件数，且好事件不超过总数；目标需大于0%且小于100%。'};
 if(total===0)return {empty:true};
 const allowed=total*(1-target/100),bad=total-good;
 return {success:good/total*100,remaining:allowed-bad,burn:bad/allowed};
};
const kvCalculation=function kvCalculation(layers,heads,dimension,bytes,tokens,requests){
 const values=[layers,heads,dimension,bytes,tokens,requests];
 if(values.some(v=>!Number.isSafeInteger(v)||v<1||v>1000000))return {error:'请输入1到1000000之间的正整数；这是未分片的逻辑容量估算。'};
 const perToken=2*layers*heads*dimension*bytes,total=perToken*tokens*requests;
 if(!Number.isSafeInteger(total))return {error:'输入组合过大，超出精确整数计算范围。请缩小参数。'};
 return {perToken,perRequestGiB:perToken*tokens/2**30,totalGiB:total/2**30};
};
const sinusoidalPositionPair=function sinusoidalPositionPair(width,pair,position){
 const frequency=10000**(-2*pair/width),angle=position*frequency;
 return {frequency,angle,sine:Math.sin(angle),cosine:Math.cos(angle)};
};
const sinusoidalPositionGraphic=function sinusoidalPositionGraphic(width,pair,position){
 const left=45,right=429,top=22,mid=79,bottom=136,band=182,rowHeight=13;
 const x=p=>left+12*p,y=value=>mid-57*value;
 const columns=Array.from({length:33},(_,p)=>
  Array.from({length:width/2},(_,i)=>sinusoidalPositionPair(width,i,p)));
 const curve=key=>columns.map((values,p)=>x(p)+','+y(values[pair][key]).toFixed(2)).join(' ');
 const cells=columns.map((values,p)=>values.flatMap(({sine,cosine})=>[sine,cosine]).map((value,d)=>
  '<rect x="'+(x(p)-6)+'" y="'+(band+d*rowHeight)+'" width="12" height="'+rowHeight+'" class="pe-cell '+(value<0?'pe-negative':'pe-positive')+'" fill-opacity="'+Math.abs(value).toFixed(4)+'"/>').join('')).join('');
 const matrixBottom=band+width*rowHeight;
 const current=columns[position][pair],marker=x(position);
 return `<svg class="pe-plot" viewBox="0 0 452 ${matrixBottom+29}" role="img" aria-label="宽度 ${width}，第 ${pair} 对特征在位置 0 到 32 的曲线与编码矩阵。标出位置 ${position}。">
  <rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" class="pe-plot-surface"/>
  <path d="M${left} ${top}H${right}M${left} ${mid}H${right}M${left} ${bottom}H${right}" class="pe-grid"/>
  <text x="34" y="${top+5}" text-anchor="end">1</text><text x="34" y="${mid+5}" text-anchor="end">0</text><text x="34" y="${bottom+5}" text-anchor="end">−1</text>
  <polyline points="${curve('sine')}" class="pe-sine-line"/><polyline points="${curve('cosine')}" class="pe-cosine-line"/>
  <text x="${left-6}" y="166">编码矩阵</text><text x="${right+6}" y="166" text-anchor="end">一列对应一个位置</text>
  <rect x="${left-6}" y="${band}" width="396" height="${width*rowHeight}" class="pe-matrix-surface"/>
  ${cells}
  <rect x="${left-6}" y="${band+pair*2*rowHeight}" width="396" height="${2*rowHeight}" class="pe-pair-outline"/>
  <text x="32" y="${band+pair*2*rowHeight+11}" text-anchor="end">${2*pair}</text>
  <text x="32" y="${band+(pair*2+1)*rowHeight+11}" text-anchor="end">${2*pair+1}</text>
  <path d="M${marker} ${top}V${bottom}M${marker} ${band-6}V${matrixBottom+3}" class="pe-position-line"/>
  <circle cx="${marker}" cy="${y(current.sine)}" r="4.6" class="pe-sine-point"/><circle cx="${marker}" cy="${y(current.cosine)}" r="4.6" class="pe-cosine-point"/>
  ${[0,8,16,24,32].map(p=>`<text x="${x(p)}" y="${matrixBottom+21}" text-anchor="middle">${p}</text>`).join('')}
 </svg>`;
};
const sinusoidalPositionReading=function sinusoidalPositionReading(width,pair,position){
 const {frequency,angle,sine,cosine}=sinusoidalPositionPair(width,pair,position);
 return `<span><b>p = ${position}</b> · 维度 ${2*pair} 和 ${2*pair+1}</span>
  <span>每格转 ${Number(frequency.toPrecision(5))} 弧度 · 相位 ${Number(angle.toPrecision(5))} 弧度</span>
  <span>[sin, cos] = <b>[${sine.toFixed(4)}, ${cosine.toFixed(4)}]</b></span>
  <span>连续周期约 ${(2*Math.PI/frequency).toFixed(3)} 个位置单位</span>`;
};
const sinusoidalPositionOptions=function sinusoidalPositionOptions(width){
 return Array.from({length:width/2},(_,i)=>'<option value="'+i+'">第 '+i+' 对 · '+2*i+' / '+(2*i+1)+'</option>').join('');
};
const initSinusoidalPositionDemo=function initSinusoidalPositionDemo(){
 const demo=document.getElementById('sinusoidal-position-demo');
 if(!demo)return;
 const width=demo.querySelector('[data-pe-width]'),pair=demo.querySelector('[data-pe-pair]');
 const position=demo.querySelector('[data-pe-position]'),chart=demo.querySelector('[data-pe-chart]');
 const reading=demo.querySelector('[data-pe-reading]');
 const draw=()=>{
  const dimension=width.value==='8'?8:4;
  const selected=Math.min(Number(pair.value)||0,dimension/2-1);
  const p=Number(position.value);
  if(pair.options.length!==dimension/2){
   pair.innerHTML=sinusoidalPositionOptions(dimension);
   pair.value=String(selected);
  }
  chart.innerHTML=sinusoidalPositionGraphic(dimension,selected,p);
  reading.innerHTML=sinusoidalPositionReading(dimension,selected,p);
 };
 width.onchange=pair.onchange=position.oninput=draw;
 demo.querySelector('fieldset').disabled=false;
 draw();
};
const initSystemInteractive=function initSystemInteractive(){
 initSinusoidalPositionDemo();
 const slo=document.getElementById('slo-demo');
 if(slo){slo.innerHTML='<div class="interactive"><div class="demo-title">错误预算计算器 <span>同一统计窗口 · 示例数据</span></div><div class="calc-fields"><label>总事件数<input id="slo-total" type="number" min="0" step="1" value="1000"></label><label>好事件数<input id="slo-good" type="number" min="0" step="1" value="989"></label><label>SLO目标（%）<input id="slo-target" type="number" min="0.001" max="99.999" step="0.01" value="99"></label></div><div class="calc-result" aria-live="polite"></div></div>';
 const calculate=()=>{const raw=['slo-total','slo-good','slo-target'].map(id=>document.getElementById(id).value);const r=raw.some(x=>x.trim()==='')?{error:'请填写全部字段。'}:sloCalculation(...raw.map(Number));slo.querySelector('.calc-result').innerHTML=r.error?'<p class="calc-error">'+r.error+'</p>':r.empty?'<p class="demo-caption">无数据：总事件数为0，不能声称100%可靠。</p>':`<div class="calc-output"><div><strong>${r.success.toFixed(2)}%</strong><small>全局好事件比例</small></div><div><strong>${r.remaining.toFixed(2)}</strong><small>剩余坏事件预算</small></div><div><strong>${r.burn.toFixed(2)}×</strong><small>预算消耗率</small></div></div>`};slo.querySelectorAll('input').forEach(i=>i.addEventListener('input',calculate));calculate();}
 const kv=document.getElementById('kv-demo');
 if(kv){const fields=[['layers','层数',32],['heads','KV头数',8],['dimension','头维度',128],['bytes','元素字节数',2],['tokens','每请求保留token',4096],['requests','并发请求',16]];kv.innerHTML='<div class="interactive"><div class="demo-title">KV逻辑容量计算器 <span>不含权重、工作区或分页开销</span></div><div class="calc-fields">'+fields.map(([id,label,value])=>`<label>${label}<input id="kv-${id}" type="number" min="1" max="1000000" step="1" value="${value}"></label>`).join('')+'</div><div class="calc-result" aria-live="polite"></div><p class="demo-caption">常规稠密注意力、各层维度一致、无跨请求共享。结果是逻辑总量，不是多卡情况下的每卡实测。</p></div>';
 const calculate=()=>{const r=kvCalculation(...fields.map(([id])=>Number(document.getElementById('kv-'+id).value)));kv.querySelector('.calc-result').innerHTML=r.error?'<p class="calc-error">'+r.error+'</p>':`<div class="calc-output"><div><strong>${(r.perToken/1024).toFixed(1)}</strong><small>KiB / token</small></div><div><strong>${r.perRequestGiB.toFixed(3)}</strong><small>GiB / 请求</small></div><div><strong>${r.totalGiB.toFixed(3)}</strong><small>GiB / 总逻辑KV</small></div></div>`};kv.querySelectorAll('input').forEach(i=>i.addEventListener('input',calculate));calculate();}
};
const readStore=function readStore(k,fallback){try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}};
const writeStore=function writeStore(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}};
const toast=function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2200)};

const learningProfileRoute=profile=>profile.route;

let progress=readStore('cloudinfra-progress',{});if(!progress||typeof progress!=='object'||Array.isArray(progress))progress={};
let checks=readStore('cloudinfra-checks',{});if(!checks||typeof checks!=='object'||Array.isArray(checks))checks={};
let searchIndex=-1,searchItems=[],toastTimer,currentPath='';
const ordered=modules.flatMap(m=>articles.filter(a=>a.module===m.id));

/* Shared reading controls; the document remains fully readable without JavaScript. */
function readingToolbarHTML(){return '<div class="reading-toolbar" role="group" aria-label="阅读工具"><button type="button" data-reader-contents aria-haspopup="dialog">本页目录 <span aria-hidden="true">≡</span></button><div class="reading-display"><button type="button" data-reader-large aria-pressed="false" title="切换大字阅读">大字</button><button type="button" data-reader-focus aria-pressed="false">专注阅读</button></div></div>';}

let comfortAbort;
function initReadingConceptReturn(article,toolbar){
 const params=new URLSearchParams(location.search);
 const source=params.get('fromConcept');
 if(!source||!toolbar)return;
 const footer=article.querySelector('.chapter-map-link[data-concept-returns]');
 if(!footer)return;
 const choices=JSON.parse(footer.dataset.conceptReturns);
 if(!Object.hasOwn(choices,source))return;
 const [path,label,track]=choices[source],role=params.get('returnGoal');
 const [before,fragment]=path.split('#');
 const href=readerInternalHref(before+(!params.has('goal')&&learningProfiles[role]?.track===track?'&goal='+role:'')+'#'+fragment);
 footer.setAttribute('href',href);
 footer.textContent='返回概念图 · '+label+' →';
 let shortcut=toolbar.querySelector('.reader-concept-return');
 if(!shortcut){
  shortcut=document.createElement('a');
  shortcut.className='reader-concept-return';
  shortcut.textContent='返回概念图';
  toolbar.querySelector('.reading-display').before(shortcut);
 }
 shortcut.setAttribute('href',href);
 shortcut.setAttribute('aria-label','返回概念图 · '+label);
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
  return;
 }
 comfortAbort=new AbortController();
 const signal=comfortAbort.signal;
 // The sticky toolbar replaces the repeated inline mobile contents only when it works.
 root.classList.add('reading-controls-ready');
 const toolbar=article.querySelector('.reading-toolbar');
 initReadingConceptReturn(article,toolbar);
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
  link.textContent=((section.id==='concept-path'||section.matches('.chapter-lab-links'))?desktopTarget||heading:heading).textContent.trim().replace(/^(\d{2})(?=\D)/,'$1 · ');
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
 if(sidebar){
  const overview=sidebar.querySelector('[data-track-overview]')?.cloneNode(true);
  if(overview){
   overview.classList.remove('side-home');
   overview.addEventListener('click',()=>closeModal(directory),{signal});
   directoryNav.prepend(overview);
  }
  const chapters=document.createElement('details');chapters.className='reader-chapters';
  const summary=document.createElement('summary');summary.textContent='切换本方向章节';chapters.appendChild(summary);
  const chapterList=document.createElement('div');chapterList.className='reader-chapter-list';
  for(const group of sidebar.querySelectorAll('details'))chapterList.appendChild(group.cloneNode(true));
  chapters.appendChild(chapterList);directory.appendChild(chapters);
 }
 document.body.appendChild(directory);
 toolbar.querySelector('[data-reader-contents]').addEventListener('click',()=>openModal(directory),{signal});

 function openModal(dialog){document.body.classList.add('reader-modal-open');dialog.showModal();}
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
  if(active===lastActive)return;lastActive=active;
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

// Module field-map widgets are explicitly unsupported on the article path.
function initFieldConceptMaps(){if(document.querySelector('[data-field-map]'))throw Error('unsupported article field map');}

const searchPlainText=function searchPlainText(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|#39|nbsp);/gi,(_,entity)=>{const key=entity.toLowerCase();if(key[0]==='#'){const n=key[1]==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return n>=0&&n<=0x10ffff?String.fromCodePoint(n):' ';}return {amp:'&',lt:'<',gt:'>',quot:'"',nbsp:' '}[key]||"'";}).replace(/([\u3400-\u9fff])([A-Za-z0-9])/g,'$1 $2').replace(/([A-Za-z0-9])([\u3400-\u9fff])/g,'$1 $2').replace(/\s+/g,' ').trim();};
const normalizeSearchText=function normalizeSearchText(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/([\u3400-\u9fff])([a-z0-9])/g,'$1 $2').replace(/([a-z0-9])([\u3400-\u9fff])/g,'$1 $2').replace(/[^\p{L}\p{N}._+]+/gu,' ').trim();};
const searchFind=function searchFind(text,term,from=0){let at=text.indexOf(term,from);while(at>=0){if(!/^[a-z0-9_.+]+$/.test(term)||(!/[a-z0-9]/.test(text[at-1]||'')&&!/[a-z0-9]/.test(text[at+term.length]||'')))return at;at=text.indexOf(term,at+1);}return -1;};
const searchContains=function searchContains(text,term){return searchFind(text,term)>=0;};
const siteSearchExcerpt=function siteSearchExcerpt(text,terms){
 const plain=String(text||'').replace(/\s+/g,' ').trim(),lower=plain.toLowerCase();
 const candidates=[...terms].sort((a,b)=>b.length-a.length).map(t=>searchFind(lower,t)).filter(i=>i>=0);
 const at=candidates[0]??0;let start=Math.max(0,at-34);
 while(start>0&&/[a-z0-9_.-]/i.test(plain[start])&&/[a-z0-9_.-]/i.test(plain[start-1])&&at-start<64)start--;
 const end=Math.min(plain.length,start+136);
 return (start?'…':'')+plain.slice(start,end)+(end<plain.length?'…':'');
};
const rankSiteSearch=function rankSiteSearch(value,availableIndex){
 const query=normalizeSearchText(value),terms=[...new Set(query.split(' ').filter(Boolean))];
 const index=availableIndex??(()=>{throw Error('pass search candidates explicitly')})();
 if(!terms.length&&String(value).trim())return [];
 if(!terms.length){const suggestions=['article:cloud-overview','knowledge:mf-tensors','knowledge:tr-ddp','knowledge:sv-kv','knowledge:ag-runtime','knowledge:ag-recovery'];return suggestions.map(id=>index.find(e=>e.id===id)).filter(Boolean).map(e=>({...e,excerpt:siteSearchExcerpt(e.desc,[]),terms:[],matchLabel:'从这里开始'}));}
 const all=text=>terms.every(term=>searchContains(text,term)),coverage=text=>terms.filter(term=>searchContains(text,term)).length,results=[];
 for(const e of index){
  if(!all(e.allNorm))continue;
  let tier=7,segment=null,label='关键词分布在本页';
  if(all(e.titleNorm)){tier=e.titleNorm===query?0:searchContains(e.titleNorm,query)?1:2;label='标题匹配';}
  else if((segment=e.segments.find(s=>s.conceptNorm&&s.conceptNorm===query))){tier=2;label='概念匹配';}
  else if(all(e.descNorm)){tier=3;label='简介或主题匹配';}
  else if((segment=e.segments.find(s=>all(s.headingNorm)))){tier=4;label='小节标题匹配';}
  else {const candidates=e.segments.filter(s=>all(s.norm));candidates.sort((a,b)=>Number(all(b.proseNorm))-Number(all(a.proseNorm))||coverage(b.headingNorm)-coverage(a.headingNorm)||Number(searchContains(b.norm,query))-Number(searchContains(a.norm,query)));if((segment=candidates[0])){tier=all(segment.proseNorm)?5:6;label=tier===5?'正文匹配':'源码匹配';}}
  let anchor=e.type==='article'?segment?.anchor:segment?.anchor||e.anchor;
  if(e.type==='article'&&tier>=5&&coverage(e.titleNorm)>0&&segment&&!coverage(segment.headingNorm)){anchor=undefined;label='标题与正文匹配';}
  // A heading hit should explain its opening, rather than jump to a later download label.
  const excerptText=segment&&(tier===4||label==='概念匹配')?segment.heading+'。'+segment.text:segment?.text||e.desc;
  results.push({...e,titlePhraseStart:Number(e.titleNorm.startsWith(query)),path:e.path+(segment?.query?'?'+segment.query:''),anchor,tier,titleCoverage:coverage(e.titleNorm),descCoverage:coverage(e.descNorm),phraseMatch:Number(searchContains(segment?.norm||e.allNorm,query)),matchLabel:label,excerpt:siteSearchExcerpt(excerptText,terms),terms});
 }
 return results.sort((a,b)=>a.tier-b.tier||b.titlePhraseStart-a.titlePhraseStart||b.titleCoverage-a.titleCoverage||b.descCoverage-a.descCoverage||b.phraseMatch-a.phraseMatch||a.order-b.order);
};
const siteSearchHighlight=function siteSearchHighlight(value,terms){
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=String(value),lower=text.toLowerCase(),hits=[];
 for(const term of terms){let at=searchFind(lower,term);while(at>=0){hits.push([at,at+term.length]);at=searchFind(lower,term,at+term.length);}}
 hits.sort((a,b)=>a[0]-b[0]||b[1]-a[1]);let cursor=0,html='';
 for(const[start,end]of hits){if(start<cursor)continue;html+=escape(text.slice(cursor,start))+'<mark>'+escape(text.slice(start,end))+'</mark>';cursor=end;}
 return html+escape(text.slice(cursor));
};

function routingGrams(term){
 const width=Math.min(3,term.length);
 if(!width)return [];
 const last=term.length-width;
 return [...new Set([0,Math.floor(last/2),last].map(i=>term.slice(i,i+width)))];
}
function routingBucket(gram,count){
 let hash=2166136261;
 for(let i=0;i<gram.length;i++)hash=Math.imul(hash^gram.charCodeAt(i),16777619);
 return (hash>>>0)%count;
}
function restoreSearchEntry(packed){
 const {segments:packedSegments,order,...entry}=packed;
 const titleText=searchPlainText(entry.title);
 const titleNorm=normalizeSearchText(titleText);
 const descNorm=normalizeSearchText(entry.desc+' '+(entry.tags||[]).join(' '));
 const segments=packedSegments.map(({proseNorm,...segment})=>({
  ...segment,
  proseNorm:proseNorm??normalizeSearchText(segment.text),
  norm:normalizeSearchText(segment.heading+' '+segment.text),
  headingNorm:normalizeSearchText(segment.heading),
  conceptNorm:normalizeSearchText(segment.conceptTitle||'')
 }));
 const allNorm=[titleNorm,descNorm,...segments.map(segment=>segment.norm)].join(' ');
 return {...entry,titleText,titleNorm,descNorm,segments,allNorm,order};
}
const clearSearchSelection=function clearSearchSelection(){
 searchItems=[];searchIndex=-1;
 $('#search-input').removeAttribute('aria-activedescendant');
};

const renderSearch=function renderSearch(q,ranked,knowledgeCount){
 clearSearchSelection();
 searchItems=ranked.slice(0,24);
 $('#search-status').textContent=q.trim()?(ranked.length?'找到 '+ranked.length+' 项'+(ranked.length>24?'，先显示前24项；可补充关键词缩小范围。':''):'没有找到匹配内容。'):'可搜'+articles.length+'章、'+knowledgeCount+'个知识点；先选一项，或输入技术名。';
 $('#search-results').innerHTML=searchItems.length?searchItems.map((r,i)=>`<a class="search-result" id="site-search-${i}" role="option" aria-selected="false" tabindex="-1" href="${learningContextHref(hostedPath(r.path)+(r.anchor?'#'+r.anchor:''))}"><small>${r.type==='knowledge'?'系统知识点':'章节 '+r.number} · ${escapeHTML(moduleFor(r.module).name)}<span>${r.matchLabel}</span></small><strong>${siteSearchHighlight(r.titleText,r.terms)}</strong><p>${siteSearchHighlight(r.excerpt,r.terms)}</p></a>`).join(''):`<p class="search-empty">试试「GPU」「幂等」或「恢复」。多个关键词之间加空格。</p>`;
};

// Routing only rules out shards. Every remaining entry uses the shared ranker.
const readerAbort=new AbortController();
const listen=(target,type,handler,options={})=>target.addEventListener(type,handler,{...options,signal:readerAbort.signal});
const searchCatalog={"url":"/reader-assets/search-catalog.d7d480553bdc.json","sha256":"d7d480553bdce97b4a65127354b675031d3c62cafc160ce8c35c3fa055419756"},searchSuggestions=[{"id":"article:cloud-overview","type":"article","titleText":"云计算架构：服务模型、资源与责任边界","desc":"服务已经启动，用户却仍可能访问失败。沿着一次查询请求，建立资源、数据、身份与可靠性的共同地图。","module":"compute","number":"C1.1","path":"/article/cloud-overview/"},{"id":"knowledge:mf-tensors","type":"knowledge","titleText":"Token、张量形状与预测目标","desc":"基础单位是有效预测目标。这里把模型处理文本的基本单位称为词元（token）。分词器（tokenizer）把文本变成编号；嵌入查表（Embedding）把编号变成向量；输出层为词表里的每个词元算出一个未归一化得分（logit）。输入长度、模型维度和词表大小分别影响不同的内存与计算。","module":"model-foundations","path":"/module/model-foundations/","anchor":"knowledge-mf-tensors"},{"id":"knowledge:tr-ddp","type":"knowledge","titleText":"DDP：副本一致与全局目标是两件检查","desc":"分布式数据并行（DDP）让每个工作进程持有模型副本，并在反向中对梯度做跨 rank 平均。它不替你切分输入，也不知道每个 rank 有多少有效目标。","module":"training","path":"/module/training/","anchor":"knowledge-tr-ddp"},{"id":"knowledge:sv-kv","type":"knowledge","titleText":"KV Cache：GQA 字节账、分块与增长","desc":"普通全注意力、各层相同 KV 头数且 K/V 维度相同的逻辑缓存量，可从层数、KV 头数、头维、位置数与字节数直接推导。使用 KV 头数，而非查询头数。","module":"platform","path":"/module/platform/","anchor":"knowledge-sv-kv"},{"id":"knowledge:ag-runtime","type":"knowledge","titleText":"运行时：任务、运行、步骤与效果身份","desc":"智能体（Agent）运行时执行“提出动作→检查权限和参数→安排执行→调用工具→保存回执→验收结果”的循环。模型输出是待解释的提议，执行器管理可信身份、状态、预算和实际动作。","module":"agent","path":"/module/agent/","anchor":"knowledge-ag-runtime"},{"id":"knowledge:ag-recovery","type":"knowledge","titleText":"持久执行：恢复、取消与效果回执","desc":"持久执行记录可恢复的决策与步骤结果。重放使用已经记录的结果继续推进；重新执行外部动作需要接收方幂等或查询协议。","module":"agent","path":"/module/agent/","anchor":"knowledge-ag-recovery"}],searchKnowledgeCount=96;
const searchAssetCache=new Map();
let latestSearchQuery='',searchGeneration=0;

function loadSearchAsset(asset,kind,shardCount){
 if(!searchAssetCache.has(asset.url)){
  const pending=(async()=>{
   const response=await fetch(hostedPath(asset.url),{credentials:'same-origin',signal:readerAbort.signal});
   if(!response.ok)throw Error('HTTP '+response.status);
   const bytes=await response.arrayBuffer();
   if(globalThis.crypto?.subtle){
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(digest!==asset.sha256)throw Error('搜索分片校验失败');
   }
   const payload=JSON.parse(new TextDecoder().decode(bytes));
   if(payload.schema!==2||payload.kind!==kind)throw Error('搜索格式不匹配');
   if(kind==='catalog'){
    const valid=row=>/^\/(?!\/)[a-z0-9_/-]+\.[a-f0-9]{12}\.json$/i.test(row?.url)&&/^[a-f0-9]{64}$/.test(row.sha256)&&/^[a-f0-9]{16}$/.test(row.token);
    if(payload.staticReadingVersion!==staticReadingVersion||!payload.routes?.length||!payload.shards?.length||
      !Array.isArray(payload.routes)||!Array.isArray(payload.shards)||![...payload.routes,...payload.shards].every(valid))throw Error('搜索目录版本不匹配');
    return payload;
   }
   if(payload.token!==asset.token||!Array.isArray(payload.rows))throw Error('搜索分片版本不匹配');
   if(kind==='routes'){
    const valid=row=>Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&row[0].length>0&&row[0].length<=3&&
     Array.isArray(row[1])&&row[1].every(n=>Number.isInteger(n)&&n>=0&&n<shardCount);
    if(!payload.rows.every(valid))throw Error('搜索路由格式不匹配');
    const postings=new Map(payload.rows);
    if(postings.size!==payload.rows.length)throw Error('搜索路由格式不匹配');
    return postings;
   }
   const validSegment=s=>s&&typeof s.heading==='string'&&typeof s.text==='string'&&
    (s.proseNorm===undefined||typeof s.proseNorm==='string');
   const validEntry=e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&typeof e.desc==='string'&&
    typeof e.path==='string'&&moduleFor(e.module)&&Number.isInteger(e.order)&&e.order>=0&&
    Array.isArray(e.segments)&&e.segments.every(validSegment);
   if(!payload.rows.every(validEntry))throw Error('搜索条目格式不匹配');
   return payload.rows.map(restoreSearchEntry);
  })().catch(error=>{searchAssetCache.delete(asset.url);throw error;});
  searchAssetCache.set(asset.url,pending);
 }
 return searchAssetCache.get(asset.url);
}
async function loadSearchCandidates(value,current=()=>true){
 const terms=[...new Set(normalizeSearchText(value).split(' ').filter(Boolean))];
 if(!terms.length)return [];
 const catalog=await loadSearchAsset(searchCatalog,'catalog');
 if(!current())return null;
 const grams=[...new Set(terms.flatMap(routingGrams))];
 const bucket=gram=>routingBucket(gram,catalog.routes.length);
 const buckets=[...new Set(grams.map(bucket))];
 const postings=new Map(await Promise.all(buckets.map(async slot=>[slot,await loadSearchAsset(catalog.routes[slot],'routes',catalog.shards.length)])));
 if(!current())return null;
 let candidates=null;
 for(const gram of grams){
  const slots=postings.get(bucket(gram)).get(gram)||[];
  const matches=new Set(slots);
  candidates=candidates===null?[...matches]:candidates.filter(slot=>matches.has(slot));
  if(!candidates.length)return [];
 }
 const rows=await Promise.all(candidates.map(slot=>loadSearchAsset(catalog.shards[slot],'entries')));
 return current()?rows.flat():null;
}
function suspendSearch(){
 searchGeneration++;latestSearchQuery='';
 clearSearchSelection();
 $('#search-status').textContent='';
 $('#search-results').innerHTML='';
}
async function search(query=''){
 if(readerAbort.signal.aborted)return;
 latestSearchQuery=query;const generation=++searchGeneration;
 const current=()=>generation===searchGeneration&&!readerAbort.signal.aborted;
 if(!normalizeSearchText(query)){
  renderSearch(query,rankSiteSearch(query,searchSuggestions),searchKnowledgeCount);
  return;
 }
 clearSearchSelection();
 $('#search-status').textContent='正在搜索相关内容…';
 $('#search-results').innerHTML='<p class="search-empty">正在查找匹配的章节、知识点和代码。</p>';
 try{
  await new Promise(resolve=>setTimeout(resolve,100));
  if(!current())return;
  const candidates=await loadSearchCandidates(query,current);
  if(current())renderSearch(latestSearchQuery,rankSiteSearch(latestSearchQuery,candidates),searchKnowledgeCount);
 }catch(error){
  if(!current())return;
  $('#search-status').textContent='搜索数据加载失败，可重试。';
  $('#search-results').innerHTML='<button type="button" class="btn secondary" data-search-retry>重试搜索</button>';
  listen($('#search-results').querySelector('[data-search-retry]'),'click',()=>{if(current())search($('#search-input').value);},{once:true});
 }
}

function openSearch(){$('#search-dialog').showModal();$('#search-input').setAttribute('aria-expanded','true');$('#search-input').value='';search();$('#search-input').focus()}

function bindApplicationEvents(){
$('#search-open').onclick=startSearch;$('#search-close').onclick=()=>$('#search-dialog').close();
let searchComposing=false;
function startSearch(){searchComposing=false;openSearch()}
listen($('#search-input'),'compositionstart',()=>{if($('#search-dialog').open){searchComposing=true;suspendSearch()}});
listen($('#search-input'),'compositionend',e=>{if(searchComposing&&$('#search-dialog').open){searchComposing=false;search(e.target.value)}});
listen($('#search-input'),'input',e=>{if($('#search-dialog').open&&!searchComposing&&!e.isComposing)search(e.target.value)});
listen($('#search-dialog'),'click',e=>{if(e.target===$('#search-dialog'))$('#search-dialog').close();if(e.target.closest('.search-result'))$('#search-dialog').close()});
listen($('#search-dialog'),'close',()=>{
 if($('#search-dialog').open)return;
 searchComposing=false;
 $('#search-input').setAttribute('aria-expanded','false');suspendSearch();
});
listen($('#search-input'),'keydown',e=>{
 if(!$('#search-dialog').open||searchComposing||e.isComposing||e.keyCode===229)return;
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){
  e.preventDefault();if(!searchItems.length)return;
  searchIndex=searchIndex<0?(e.key==='ArrowDown'?0:searchItems.length-1):(searchIndex+(e.key==='ArrowDown'?1:-1)+searchItems.length)%searchItems.length;
  $('#search-input').setAttribute('aria-activedescendant','site-search-'+searchIndex);
  document.querySelectorAll('.search-result').forEach((a,i)=>{a.classList.toggle('selected',i===searchIndex);a.setAttribute('aria-selected',String(i===searchIndex));if(i===searchIndex)a.scrollIntoView({block:'nearest'})});
 }else if(e.key==='Enter'&&searchItems.length){
  e.preventDefault();const result=searchItems[Math.max(0,searchIndex)];location.assign(learningContextHref(hostedPath(result.path)+(result.anchor?'#'+result.anchor:'')));$('#search-dialog').close();
 }
});
listen(document,'keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if($('#search-dialog').open)$('#search-dialog').close();else startSearch()}});
function applyTheme(dark){document.documentElement.classList.toggle('dark',dark);$('#theme').setAttribute('aria-label',dark?'切换浅色模式':'切换深色模式')}
applyTheme(readStore('cloudinfra-dark',false)===true);$('#theme').onclick=()=>{const dark=!document.documentElement.classList.contains('dark');applyTheme(dark);writeStore('cloudinfra-dark',dark)};
$('#mobile-menu').onclick=()=>{const open=$('.top-nav').classList.toggle('mobile-open');$('#mobile-menu').setAttribute('aria-expanded',open)};
listen(document,'click',e=>{const r=e.target.closest('[data-read]');if(r){progress[r.dataset.read]=!progress[r.dataset.read];const saved=writeStore('cloudinfra-progress',progress);r.classList.toggle('done',progress[r.dataset.read]);r.textContent=progress[r.dataset.read]?'✓ 已读 · 点击取消':'标记为已读';const a=articles.find(a=>a.id===r.dataset.read);$('.sidebar').outerHTML=sidebar(a.module,a.id);normalizeInternalLinks();toast(saved?(progress[a.id]?'已保存阅读进度':'已取消已读标记'):'本次进度已更新，浏览器存储不可用')}});
listen(document,'change',e=>{if(e.target.matches('[data-check]')){checks[e.target.dataset.check]=e.target.checked;if(!writeStore('cloudinfra-checks',checks))toast('浏览器存储不可用，勾选仅在本次会话保留')}});
$('.skip').onclick=e=>{e.preventDefault();$('#main')?.focus();$('#main')?.scrollIntoView()};
listen(document,'click',async e=>{const b=e.target.closest('[data-copy-code]');if(!b)return;const code=b.closest('.code-block').querySelector('code').textContent;try{await navigator.clipboard.writeText(code);b.textContent='已复制';toast('代码已复制');setTimeout(()=>b.textContent='复制代码',1800)}catch{toast('无法访问剪贴板，请选中代码复制')}});

}

const followCourseRedirect=function followCourseRedirect(){const destination=courseRedirectFor(documentPathname(),location.search||'',location.hash||'');if(!destination)return false;location.replace(hostedPath(destination));return true};

function releaseReader(){
 readerAbort.abort();comfortAbort?.abort();
 const dialog=$('#search-dialog');
 if(dialog?.open){suspendSearch();$('#search-input').setAttribute('aria-expanded','false');dialog.close();}
 for(const selector of ['#search-open','#search-close','#theme','#mobile-menu','.skip']){const node=$(selector);if(node)node.onclick=null;}
}
function requestFullRuntime(reason){releaseReader();window.dispatchEvent(new CustomEvent('reader-full-runtime',{detail:{reason}}));}
// An explicit fallback can win while the browser is still fetching this script.
if(document.documentElement?.getAttribute?.('data-reader-runtime')==='full')return;
listen(window,'reader-full-runtime',releaseReader);
try{
 if('scrollRestoration' in history)history.scrollRestoration='auto';
 if(followCourseRedirect())return;
 if(location.hash.startsWith('#/')){location.replace(publicRoute(location.hash));return;}
 if(!hydrateStaticArticle()){requestFullRuntime('static hydration identity rejected');return;}
 bindApplicationEvents();
 listen(window,'hashchange',()=>{if(followCourseRedirect())return;if(location.hash.startsWith('#/'))location.replace(publicRoute(location.hash));else restoreDocumentFragment();});
 document.documentElement.setAttribute('data-reader-runtime','light');
 document.documentElement.setAttribute('data-site-ready','true');
 window.dispatchEvent(new Event('infra-ready'));
}catch(error){requestFullRuntime('light runtime exception: '+error.message);}


})();
