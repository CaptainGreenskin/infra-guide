(function(){
'use strict';

const staticReadingVersion="59613700e235a8f7b59d5db2485056114d0cdcbc27ec4c43b8123c00ddacdd89";

const articles=[{"id":"linux-resource","module":"foundation","number":"P0.1","title":"进程、线程与资源：为什么机器空闲，程序仍然很慢"},{"id":"virtual-memory-oom","module":"foundation","number":"P0.2","title":"虚拟内存与 OOM：导出任务为什么被终止"},{"id":"concurrency-pools","module":"foundation","number":"P0.3","title":"并发与线程池：锁、排队和容量"},{"id":"distributed-systems","module":"foundation","number":"P0.4","title":"超时、重试与幂等：系统最难处理的是“结果未知”"},{"id":"cloud-overview","module":"compute","number":"C1.1","title":"云计算架构：服务模型、资源与责任边界"},{"id":"cloud-compute","module":"compute","number":"C1.2","title":"计算资源：虚拟化、规格与容量预算"},{"id":"vpc-network","module":"network","number":"C2.1","title":"云网络：DNS、路由、访问控制与返回路径"},{"id":"network-diagnosis","module":"network","number":"C2.2","title":"网络诊断：连接、首字节与传输时序"},{"id":"tcp-event-loop","module":"network","number":"C2.3","title":"TCP与I/O：从连接、字节流到epoll事件循环"},{"id":"training-storage","module":"cloud-data","number":"C3.1","title":"云存储：块、文件、对象与访问性能"},{"id":"database-index-locks","module":"cloud-data","number":"C3.2","title":"数据库访问：索引、事务与锁等待"},{"id":"cache-consistency","module":"cloud-data","number":"C3.3","title":"缓存一致性与击穿：旧值为何重新出现"},{"id":"storage-recovery","module":"cloud-data","number":"C3.4","title":"存储发布与恢复：版本、提交点与校验"},{"id":"mysql-recovery","module":"cloud-data","number":"C3.5","title":"MySQL日志与恢复：从提交、崩溃到按点重放"},{"id":"mysql-replication","module":"cloud-data","number":"C3.6","title":"MySQL复制与切换：先解释旧读，再证明谁能写"},{"id":"container-runtime","module":"native","number":"C4.1","title":"容器运行原理：镜像、进程、隔离与资源"},{"id":"kubernetes-basics","module":"native","number":"C4.2","title":"Kubernetes 控制面：对象、调谐与生命周期"},{"id":"k8s-workloads","module":"native","number":"C4.3","title":"Kubernetes 工作负载：从声明到可用与滚动更新"},{"id":"scheduling-resources","module":"native","number":"C4.4","title":"Kubernetes 调度：资源、亲和与拓扑约束"},{"id":"k8s-networking","module":"native","number":"C4.5","title":"Kubernetes 网络：从 DNS、Service 到容器回包"},{"id":"k8s-storage","module":"native","number":"C4.6","title":"Kubernetes 存储：PVC、拓扑、挂载与数据恢复"},{"id":"config-secrets","module":"native","number":"C4.7","title":"配置与密钥：传播、重读与版本生效"},{"id":"k8s-autoscaling","module":"native","number":"C4.8","title":"Kubernetes 弹性：HPA、节点容量与排队预算"},{"id":"control-plane-consensus","module":"native","number":"C4.9","title":"控制面协调存储：从多数派提交到观察与恢复"},{"id":"serverless-execution","module":"serverless","number":"C5.1","title":"Serverless 与事件驱动：执行、重试、幂等与成本"},{"id":"message-delivery","module":"serverless","number":"C5.2","title":"消息投递与确认：从入队、处理到业务完成"},{"id":"delivery","module":"cloud-delivery","number":"C6.1","title":"平台交付：制品、配置、数据迁移与回退"},{"id":"terraform-state","module":"cloud-delivery","number":"C6.2","title":"Terraform状态与漂移：配置、锁、刷新和资源归属"},{"id":"gitops-reconciliation","module":"cloud-delivery","number":"C6.3","title":"GitOps调谐：从Git期望到对象、进程与业务结果"},{"id":"iam-security","module":"cloud-security","number":"C7.1","title":"身份与最小权限：谁能让系统做什么"},{"id":"elasticity","module":"cloud-capacity","number":"C8.1","title":"容量与弹性：故障域、扩容时序与排队"},{"id":"slo","module":"sre","number":"C9.1","title":"可靠性目标：SLI、SLO 与错误预算"},{"id":"observability","module":"sre","number":"C9.2","title":"可观测性：用指标定位范围，用日志和追踪解释路径"},{"id":"incident","module":"sre","number":"C9.3","title":"故障诊断：影响、时间线、假设与验证"},{"id":"resilience","module":"sre","number":"C9.4","title":"恢复工程：故障域、RPO、RTO 与演练"},{"id":"transformer-model","module":"model-foundations","number":"A1.1","title":"Transformer 全貌：下一个词是怎么预测出来的"},{"id":"tokenization-embedding","module":"model-foundations","number":"A1.2","title":"Token、词表与 Embedding：标签如何对齐"},{"id":"attention-mechanics","module":"model-foundations","number":"A1.3","title":"Attention 深入推导：QKV、掩码与多头"},{"id":"transformer-block","module":"model-foundations","number":"A1.4","title":"Decoder Block：前馈、残差与归一化"},{"id":"position-encoding","module":"model-foundations","number":"A1.5","title":"位置编码与 RoPE：相对位置怎样进入点积"},{"id":"autograd-training","module":"model-foundations","number":"A1.6","title":"交叉熵与自动求导：完成一次真实更新"},{"id":"gpu-execution","module":"model-foundations","number":"A1.7","title":"GPU 执行与存储：线程如何处理张量"},{"id":"roofline-model","module":"model-foundations","number":"A1.8","title":"Roofline：从计算量与字节判断瓶颈"},{"id":"flash-attention-io","module":"model-foundations","number":"A1.9","title":"FlashAttention：分块如何保持全局 Softmax"},{"id":"tensor-parallel-math","module":"model-foundations","number":"A1.10","title":"张量与流水线并行：切分后的计算与通信"},{"id":"operator-profiling","module":"model-foundations","number":"A1.11","title":"动手算子与性能分析：从数值正确到执行证据"},{"id":"gpu-cluster","module":"training","number":"A2.1","title":"云上训练全景：从任务提交到首个更新","group":0},{"id":"distributed-training","module":"training","number":"A2.2","title":"并行策略：DDP、FSDP、TP 与 PP 的取舍","group":0},{"id":"gpu-memory","module":"training","number":"A2.3","title":"GPU 显存与混合精度：建立可检查的预算","group":0},{"id":"ddp-code","module":"training","number":"A2.4","title":"写对一份 DDP 训练程序","group":1},{"id":"training-communication","module":"training","number":"A2.5","title":"NCCL 与集合通信：定位等待发生在哪里","group":1},{"id":"data-pipeline","module":"training","number":"A2.6","title":"数据管道：让 GPU 持续获得有效输入","group":1},{"id":"multinode-lab","module":"training","number":"A2.7","title":"两机四卡 DDP：从环境检查到训练验收","group":2},{"id":"checkpoint-recovery","module":"training","number":"A2.8","title":"检查点与恢复：证明训练能从中断继续","group":2},{"id":"training-performance","module":"training","number":"A2.9","title":"性能与成本：建立公平的扩展实验","group":2},{"id":"training-platform","module":"platform","number":"A3.1","title":"AI平台在管理什么：从提交契约到可信训练产物"},{"id":"gpu-scheduling","module":"platform","number":"A3.2","title":"GPU队列与调度：从配额准入到拓扑可行性"},{"id":"kubernetes-training","module":"platform","number":"A3.3","title":"走向 Kubernetes：把训练程序变成可管理的作业"},{"id":"model-serving","module":"platform","number":"A3.4","title":"模型推理为什么不同：Prefill、Decode与KV Cache"},{"id":"quantization-serving","module":"platform","number":"A3.5","title":"模型量化：从比例尺到打包、校准与执行"},{"id":"inference-performance","module":"platform","number":"A3.6","title":"推理性能怎样测：统一TTFT、TPOT、吞吐与质量口径"},{"id":"ai-lifecycle","module":"platform","number":"A3.7","title":"模型怎样进入生产：完整产物、评估、发布与回退"},{"id":"moe-routing","module":"platform","number":"A3.8","title":"MoE路由与专家执行：从Top-k到分发、容量与合并"},{"id":"speculative-decoding","module":"platform","number":"A3.9","title":"推测解码：从接受概率到批量验证与缓存回退"},{"id":"agent-runtime","module":"agent","number":"G1","title":"Agent Infra在解决什么：从模型提议到任务完成"},{"id":"mcp-protocol","module":"agent","number":"G1.1","title":"MCP协议与真实SDK：发现、调用、进度与取消"},{"id":"agent-security","module":"agent","number":"G2","title":"Agent的权限边界：谁授权，在哪里拦截，怎样限制效果"},{"id":"agent-sandbox","module":"agent","number":"G3","title":"Agent 沙箱：隔离、资源与生命周期"},{"id":"agent-recovery","module":"agent","number":"G4","title":"工具已经执行，任务却没完成：持久化、幂等与崩溃恢复"},{"id":"agent-memory","module":"agent","number":"G5","title":"上下文、运行状态与长期记忆：三种信息不要混存"},{"id":"agent-evaluation","module":"agent","number":"G6","title":"Agent怎样验收：任务结果、执行轨迹、拒绝行为与成本"},{"id":"durable-workflows","module":"agent","number":"G7","title":"持久工作流：事件重放、接管与提交"},{"id":"agent-retrieval","module":"agent","number":"G8","title":"检索与上下文：让答案有可验证的证据"},{"id":"agent-observability","module":"agent","number":"G9","title":"Agent 观测：任务、重试与成本归因"},{"id":"kairo-practice","module":"agent","number":"G10","title":"Kairo 接入验收：任务、权限与结果证据"},{"id":"training-lab","module":"practice","number":"S1","title":"综合实战：两进程训练、完整恢复与三个失败对照"},{"id":"cloud-service-lab","module":"practice","number":"S2","title":"综合实战：一个服务的探针、版本发布与指标验证"},{"id":"production-readiness","module":"practice","number":"S3","title":"综合设计评审：让Cloud、AI与Agent形成一条可验收链路"}];
const modules=[{"id":"foundation","n":"P0","name":"前置基础知识","track":"cloud"},{"id":"compute","n":"C1","name":"云计算与虚拟化","track":"cloud"},{"id":"network","n":"C2","name":"云网络与流量","track":"cloud"},{"id":"cloud-data","n":"C3","name":"云存储与数据服务","track":"cloud"},{"id":"native","n":"C4","name":"容器与 Kubernetes 编排","track":"cloud"},{"id":"serverless","n":"C5","name":"Serverless 与事件驱动","track":"cloud"},{"id":"cloud-delivery","n":"C6","name":"平台工程、IaC 与 GitOps","track":"cloud"},{"id":"cloud-security","n":"C7","name":"身份、安全与多租户","track":"cloud"},{"id":"cloud-capacity","n":"C8","name":"容量、弹性与成本","track":"cloud"},{"id":"sre","n":"C9","name":"SRE、可观测与故障恢复","track":"cloud"},{"id":"model-foundations","n":"A1","name":"模型计算与 GPU 原理","track":"ai"},{"id":"training","n":"A2","name":"云上 AI 训练","track":"ai"},{"id":"platform","n":"A3","name":"AI 作业平台与推理服务","track":"ai"},{"id":"agent","n":"G","name":"Agent 运行时与 Kairo 实践","track":"agent"},{"id":"practice","n":"S","name":"综合设计与工程实战","track":"shared"}];
const trackDefinitions={"cloud":{"label":"Cloud Infra","modules":["foundation","compute","network","cloud-data","native","serverless","cloud-delivery","cloud-security","cloud-capacity","sre"],"start":"cloud-overview"},"ai":{"label":"AI Infra","modules":["model-foundations","training","platform"],"start":"transformer-model"},"agent":{"label":"Agent Infra","modules":["agent"],"start":"agent-runtime"}};
const courseReadingStages={"cloud":[["先看全貌，再按需补系统前置",["cloud-overview","linux-resource","virtual-memory-oom","concurrency-pools","distributed-systems"]],["云资源、网络与数据主干",["cloud-compute","vpc-network","network-diagnosis","tcp-event-loop","training-storage","database-index-locks","cache-consistency","storage-recovery","mysql-recovery","mysql-replication"]],["从容器到 Kubernetes 运行路径",["container-runtime","kubernetes-basics","k8s-workloads","scheduling-resources","k8s-networking","k8s-storage","config-secrets","k8s-autoscaling","control-plane-consensus"]],["事件平台与可追溯交付",["serverless-execution","message-delivery","delivery","terraform-state","gitops-reconciliation"]],["身份隔离、容量与成本",["iam-security","elasticity"]],["可靠性与完整验收",["slo","observability","incident","resilience","cloud-service-lab"]]],"ai":[["模型与计算原理",["transformer-model","tokenization-embedding","attention-mechanics","transformer-block","position-encoding","autograd-training"]],["GPU 执行、IO 与层内并行",["gpu-execution","roofline-model","flash-attention-io","tensor-parallel-math","operator-profiling"]],["训练系统与资源模型",["gpu-cluster","distributed-training","gpu-memory"]],["执行、恢复与作业平台",["ddp-code","training-communication","data-pipeline","multinode-lab","checkpoint-recovery","training-performance","training-platform","gpu-scheduling","kubernetes-training","training-lab"]],["推理、量化与模型发布",["model-serving","quantization-serving","inference-performance","ai-lifecycle","moe-routing","speculative-decoding"]]],"agent":[["任务与执行边界",["agent-runtime","mcp-protocol","agent-security","agent-sandbox"]],["恢复、上下文与评估",["agent-recovery","agent-memory","agent-evaluation"]],["持久工作流与知识检索",["durable-workflows","agent-retrieval"]],["观测、接入与综合验收",["agent-observability","kairo-practice","production-readiness"]]]};
const learningProfiles={"cloud-platform":{"track":"cloud","label":"云平台与云原生","targets":["cloud-compute","iam-security","k8s-workloads","scheduling-resources","k8s-networking","k8s-storage","config-secrets","k8s-autoscaling","control-plane-consensus","serverless-execution","terraform-state","gitops-reconciliation","cloud-service-lab"],"route":["cloud-overview","linux-resource","cloud-compute","iam-security","virtual-memory-oom","container-runtime","kubernetes-basics","k8s-workloads","scheduling-resources","vpc-network","k8s-networking","training-storage","k8s-storage","config-secrets","k8s-autoscaling","distributed-systems","control-plane-consensus","serverless-execution","storage-recovery","delivery","terraform-state","gitops-reconciliation","slo","cloud-service-lab"],"gateChapters":["cloud-service-lab","serverless-execution","vpc-network","k8s-workloads","config-secrets","k8s-storage","gitops-reconciliation","iam-security","scheduling-resources","delivery","control-plane-consensus"],"gateEvidence":["goal-evidence-cloud-service-lab-kubernetes-service-run","goal-evidence-cloud-service-lab-kubernetes-service-rollout","goal-evidence-serverless-execution-section-2","goal-evidence-serverless-execution-jetstream-inflight-counts","goal-evidence-vpc-network-native-dns-cache","goal-evidence-vpc-network-native-dns-connection-handoff","goal-evidence-vpc-network-native-tls-proxy","goal-evidence-k8s-workloads-native-pdb-eviction-rollout","goal-evidence-config-secrets-native-config-projection","goal-evidence-k8s-storage-native-csi-storage","goal-evidence-gitops-reconciliation-gitops-response-evidence","goal-evidence-iam-security-native-kubernetes-admission","goal-evidence-scheduling-resources-quota-admission-forbidden","goal-evidence-iam-security-native-spiffe-workload-identity","goal-evidence-iam-security-kubernetes-identity-changes","goal-evidence-serverless-execution-broker-ack-business-ledger","goal-evidence-delivery-native-release-artifact-trust","goal-evidence-delivery-native-controller-reconcile","goal-evidence-control-plane-consensus-section-7"]},"cloud-sre":{"track":"cloud","label":"SRE 与稳定性","targets":["cloud-compute","iam-security","tcp-event-loop","database-index-locks","cache-consistency","mysql-recovery","mysql-replication","k8s-networking","control-plane-consensus","elasticity","observability","resilience","cloud-service-lab"],"route":["cloud-overview","linux-resource","cloud-compute","iam-security","vpc-network","network-diagnosis","tcp-event-loop","concurrency-pools","training-storage","database-index-locks","cache-consistency","storage-recovery","mysql-recovery","mysql-replication","virtual-memory-oom","container-runtime","kubernetes-basics","k8s-workloads","k8s-networking","distributed-systems","control-plane-consensus","elasticity","slo","observability","incident","resilience","delivery","cloud-service-lab"],"gateChapters":["observability","slo","incident","cloud-compute","network-diagnosis","elasticity","database-index-locks","resilience","cache-consistency","storage-recovery","mysql-recovery"],"gateEvidence":["goal-evidence-observability-section-9","goal-evidence-slo-service-observed-denominator","goal-evidence-observability-slo-event-to-trace","goal-evidence-incident-incident-connection-lease","goal-evidence-cloud-compute-native-qemu-vcpu","goal-evidence-observability-collector-sampling-check","goal-evidence-slo-live-prometheus-burn","goal-evidence-slo-native-alert-notification","goal-evidence-slo-cpu-quota-sli-events","goal-evidence-network-diagnosis-proxy-502-origin-evidence","goal-evidence-network-diagnosis-curl-no-first-byte","goal-evidence-elasticity-section-7","goal-evidence-elasticity-bounded-queue-downstream-wait","goal-evidence-elasticity-native-cpu-quota-http","goal-evidence-database-index-locks-native-sqlite-shard-routing","goal-evidence-elasticity-proxy-drain-readback","goal-evidence-resilience-subsection-5-1dwp2yh","goal-evidence-resilience-native-haproxy-report-failover","goal-evidence-resilience-native-kind-r3-node-loss","goal-evidence-resilience-section-9","goal-evidence-cache-consistency-native-redis-client-tracking","goal-evidence-cache-consistency-native-redis-replica-promotion","goal-evidence-storage-recovery-native-postgres-pitr","goal-evidence-mysql-recovery-mysql-missing-binlog"]},"ai-training":{"track":"ai","label":"分布式训练与作业平台","targets":["gpu-memory","training-communication","data-pipeline","multinode-lab","training-performance","gpu-scheduling","kubernetes-training","training-lab"],"route":["transformer-model","tokenization-embedding","attention-mechanics","transformer-block","autograd-training","gpu-execution","gpu-cluster","distributed-training","gpu-memory","ddp-code","training-communication","data-pipeline","multinode-lab","checkpoint-recovery","training-performance","training-platform","gpu-scheduling","kubernetes-training","training-lab"],"gateChapters":["ddp-code","autograd-training","data-pipeline","gpu-memory","training-communication","checkpoint-recovery","training-performance","multinode-lab","training-platform","gpu-scheduling","kubernetes-training"],"gateEvidence":["goal-evidence-ddp-code-native-ddp-join","goal-evidence-autograd-training-tiny-decoder-rank-update","goal-evidence-data-pipeline-sampler-matched-tail","goal-evidence-gpu-memory-native-amp-window","goal-evidence-gpu-memory-rtx-activation-scaling","goal-evidence-training-communication-ragged-ring-communication","goal-evidence-data-pipeline-native-prefetch-resume","goal-evidence-checkpoint-recovery-checkpoint-ddp-optimizer-state","goal-evidence-checkpoint-recovery-native-elastic-restart-step","goal-evidence-checkpoint-recovery-native-ddp-accumulation-restart","goal-evidence-checkpoint-recovery-native-tiny-decoder-handoff","goal-evidence-checkpoint-recovery-native-mps-checkpoint-resume","goal-evidence-checkpoint-recovery-native-async-dcp-commit","goal-evidence-checkpoint-recovery-single-gpu-recovery-contrast","goal-evidence-training-performance-single-gpu-recovery-timing","goal-evidence-multinode-lab-multinode-launch-run","goal-evidence-training-platform-native-training-submission-preflight","goal-evidence-gpu-scheduling-native-kueue-admission","goal-evidence-kubernetes-training-native-kubernetes-gloo-job","goal-evidence-training-communication-native-job-collective-update","goal-evidence-multinode-lab-topology-demo","goal-evidence-multinode-lab-native-ddp-target-preflight","goal-evidence-multinode-lab-ddp-target-record-readback","goal-evidence-multinode-lab-shared-checkpoint-readback"]},"ai-inference":{"track":"ai","label":"模型推理与服务","targets":["position-encoding","roofline-model","model-serving","quantization-serving","inference-performance","ai-lifecycle","speculative-decoding"],"route":["transformer-model","tokenization-embedding","attention-mechanics","transformer-block","position-encoding","gpu-execution","roofline-model","model-serving","quantization-serving","inference-performance","ai-lifecycle","speculative-decoding"],"gateChapters":["model-serving","transformer-block","position-encoding","inference-performance","speculative-decoding","ai-lifecycle","quantization-serving"],"gateEvidence":["goal-evidence-model-serving-section-4","goal-evidence-model-serving-same-prompt-serving-rounds","goal-evidence-model-serving-sdpa-cache-storage-bytes","goal-evidence-transformer-block-native-tiny-decoder-context","goal-evidence-model-serving-serving-rows-and-history","goal-evidence-model-serving-native-inference-prefix","goal-evidence-position-encoding-native-rope-window-cache","goal-evidence-model-serving-native-metal-inference","goal-evidence-model-serving-rtx-pro-6000-cache-case","goal-evidence-inference-performance-vllm-v1-request-path","goal-evidence-inference-performance-native-vllm-scheduler","goal-evidence-inference-performance-native-vllm-cache-scope","goal-evidence-inference-performance-vllm-block-lifecycle","goal-evidence-inference-performance-native-slot-handoff","goal-evidence-inference-performance-native-inference-queue","goal-evidence-inference-performance-section-2","goal-evidence-inference-performance-rtx-prefill-decode-timing","goal-evidence-inference-performance-native-metal-queue","goal-evidence-speculative-decoding-native-ngram-speculation","goal-evidence-inference-performance-native-pd-split","goal-evidence-inference-performance-tp-placement","goal-evidence-speculative-decoding-native-ngram-work-accounting","goal-evidence-ai-lifecycle-native-model-rollout","goal-evidence-model-serving-request-version-binding","goal-evidence-ai-lifecycle-rollout-kv-reuse-decision","goal-evidence-quantization-serving-native-int8-batch-quality","goal-evidence-ai-lifecycle-int8-batch-release-gate","goal-evidence-ai-lifecycle-section-8"]},"ai-operators":{"track":"ai","label":"GPU 与算子性能","targets":["position-encoding","autograd-training","flash-attention-io","tensor-parallel-math","operator-profiling"],"route":["transformer-model","tokenization-embedding","attention-mechanics","transformer-block","position-encoding","autograd-training","gpu-execution","roofline-model","flash-attention-io","tensor-parallel-math","operator-profiling"],"gateChapters":["operator-profiling","tensor-parallel-math","flash-attention-io","roofline-model"],"gateEvidence":["goal-evidence-operator-profiling-operator-profile-run","goal-evidence-operator-profiling-native-python-extension","goal-evidence-operator-profiling-torch-compile-graph-break","goal-evidence-operator-profiling-triton-tail-mask-run","goal-evidence-tensor-parallel-math-section-9","goal-evidence-tensor-parallel-math-native-dp-tp-mesh","goal-evidence-tensor-parallel-math-native-pipeline-schedules","goal-evidence-flash-attention-io-context-parallel-row-backward","goal-evidence-flash-attention-io-ring-context-training","goal-evidence-flash-attention-io-ragged-ring-training","goal-evidence-flash-attention-io-native-metal-online-attention","goal-evidence-flash-attention-io-native-metal-empty-attention-row","goal-evidence-operator-profiling-native-metal-gemm","goal-evidence-roofline-model-roofline-metal-gemm","goal-evidence-operator-profiling-native-metal-softmax","goal-evidence-operator-profiling-same-device-gemm"]},"agent-app":{"track":"agent","label":"Agent 应用与评估","targets":["mcp-protocol","agent-security","agent-recovery","agent-memory","agent-retrieval","agent-evaluation","agent-observability"],"route":["agent-runtime","mcp-protocol","agent-security","agent-recovery","agent-memory","agent-retrieval","agent-evaluation","agent-observability"],"gateChapters":["agent-runtime","agent-retrieval","agent-evaluation","agent-memory","production-readiness","agent-observability"],"gateEvidence":["goal-evidence-agent-runtime-native-model-mcp-tool-choice","goal-evidence-agent-retrieval-native-rag-citation-oracle","goal-evidence-agent-evaluation-citation-version-check","goal-evidence-agent-evaluation-native-model-evaluation-bridge","goal-evidence-agent-retrieval-native-qdrant-retrieval","goal-evidence-agent-retrieval-retrieval-revocation-boundaries","goal-evidence-agent-memory-native-memory-withdrawal","goal-evidence-production-readiness-integrated-service-run","goal-evidence-agent-evaluation-evaluation-read-output-check","goal-evidence-agent-evaluation-mcp-receipt-effect-verdict","goal-evidence-agent-evaluation-approval-at-commit-verdict","goal-evidence-agent-evaluation-delegation-run-comparison","goal-evidence-agent-observability-runtime-attempts-and-effects","goal-evidence-production-readiness-publication-pointer-effect-count"]},"agent-platform":{"track":"agent","label":"Agent 运行平台","targets":["mcp-protocol","agent-sandbox","durable-workflows","agent-retrieval","agent-observability","kairo-practice","production-readiness"],"route":["agent-runtime","mcp-protocol","agent-security","agent-sandbox","agent-recovery","durable-workflows","agent-memory","agent-retrieval","agent-evaluation","agent-observability","kairo-practice","production-readiness"],"gateChapters":["agent-sandbox","kairo-practice","mcp-protocol","durable-workflows","agent-recovery","agent-observability","production-readiness"],"gateEvidence":["goal-evidence-agent-sandbox-native-sandbox-container","goal-evidence-agent-sandbox-native-sandbox-egress","goal-evidence-agent-sandbox-native-sandbox-process-group","goal-evidence-agent-sandbox-native-sandbox-docker-lifecycle","goal-evidence-kairo-practice-kairo-reused-worker-readback","goal-evidence-mcp-protocol-native-mcp-http-authorization","goal-evidence-mcp-protocol-native-mcp-catalog-refresh","goal-evidence-durable-workflows-native-model-mcp-recovery","goal-evidence-durable-workflows-native-model-plan-revision","goal-evidence-kairo-practice-native-agent-task-reconnect","goal-evidence-kairo-practice-kairo-native-readonly-reconnect","goal-evidence-kairo-practice-kairo-resume-evidence","goal-evidence-kairo-practice-kairo-native-commit-readback","goal-evidence-mcp-protocol-mcp-http-cancellation-run","goal-evidence-mcp-protocol-native-mcp-result-receipt","goal-evidence-agent-recovery-mcp-rejected-receipt-recovery","goal-evidence-agent-recovery-recovery-lookup-after-commit","goal-evidence-agent-recovery-section-7","goal-evidence-durable-workflows-mcp-commit-recovery","goal-evidence-durable-workflows-native-approval-reentry","goal-evidence-durable-workflows-delegated-results-boundary","goal-evidence-durable-workflows-native-parallel-merge","goal-evidence-durable-workflows-native-workflow-version-resume","goal-evidence-durable-workflows-receiver-writer-after-takeover","goal-evidence-agent-observability-native-mcp-trace-reentry","goal-evidence-agent-observability-otel-r27-interval-coverage","goal-evidence-agent-observability-trace-reentry-ledger-lookup","goal-evidence-agent-observability-native-tail-sampling-ledger","goal-evidence-agent-observability-native-model-mcp-recovery-observation","goal-evidence-kairo-practice-kairo-audit-coverage-check","goal-evidence-kairo-practice-kairo-read-evidence","goal-evidence-production-readiness-same-total-model-binding"]}};
const conceptDirectoryTitles={"linux-resource":"进程、线程与资源","virtual-memory-oom":"虚拟内存与 OOM","concurrency-pools":"并发、锁与线程池","distributed-systems":"超时、重试与幂等","cloud-overview":"云计算架构与服务模型","cloud-compute":"虚拟化与计算资源","vpc-network":"DNS、路由与网络边界","network-diagnosis":"网络诊断与请求时序","tcp-event-loop":"TCP、I/O 与 epoll","training-storage":"块、文件与对象存储","database-index-locks":"SQL 索引、事务与锁","cache-consistency":"缓存一致性与击穿","storage-recovery":"存储版本、发布与恢复","mysql-recovery":"MySQL 日志与恢复","mysql-replication":"MySQL 复制与切换","container-runtime":"容器、镜像与隔离","kubernetes-basics":"Kubernetes 对象与控制面","k8s-workloads":"工作负载与滚动更新","scheduling-resources":"调度、亲和与拓扑","k8s-networking":"Pod、Service 与容器网络","k8s-storage":"PVC、持久卷与恢复","config-secrets":"配置、密钥与生效过程","k8s-autoscaling":"HPA 与节点容量","control-plane-consensus":"etcd、多数派与恢复","serverless-execution":"Serverless 与事件驱动","message-delivery":"消息投递与确认","delivery":"制品、发布与回退","terraform-state":"Terraform 状态与漂移","gitops-reconciliation":"GitOps 与持续调谐","iam-security":"身份、授权与最小权限","elasticity":"容量、排队与弹性","slo":"SLI、SLO 与错误预算","observability":"指标、日志与追踪","incident":"故障诊断与时间线","resilience":"RPO、RTO 与恢复工程","transformer-model":"Transformer 整体结构","tokenization-embedding":"Token、词表与 Embedding","attention-mechanics":"Attention、QKV 与多头","transformer-block":"FFN、残差与归一化","position-encoding":"位置编码与 RoPE","autograd-training":"损失、梯度与参数更新","gpu-execution":"GPU 执行与存储层次","roofline-model":"Roofline 与性能瓶颈","flash-attention-io":"FlashAttention 与分块","tensor-parallel-math":"张量并行与流水线并行","operator-profiling":"算子实现与性能分析","gpu-cluster":"云上训练的完整流程","distributed-training":"DDP、FSDP 与并行策略","gpu-memory":"训练显存与混合精度","ddp-code":"DDP 程序与全局目标","training-communication":"NCCL 与集合通信","data-pipeline":"数据读取、分片与组批","multinode-lab":"两机四卡 DDP 实战","checkpoint-recovery":"检查点与训练恢复","training-performance":"训练性能、扩展与成本","training-platform":"训练作业与平台契约","gpu-scheduling":"GPU 队列、配额与调度","kubernetes-training":"Kubernetes 训练作业","model-serving":"Prefill、Decode 与 KV Cache","quantization-serving":"量化、打包与校准","inference-performance":"TTFT、TPOT 与服务吞吐","ai-lifecycle":"模型产物、评估与发布","moe-routing":"MoE 路由与专家执行","speculative-decoding":"推测解码与缓存回退","agent-runtime":"Agent 组成与执行循环","mcp-protocol":"MCP 工具协议与 SDK","agent-security":"Agent 身份与权限","agent-sandbox":"沙箱与执行隔离","agent-recovery":"持久状态、幂等与恢复","agent-memory":"上下文、状态与长期记忆","agent-evaluation":"任务评估与产物验收","durable-workflows":"持久工作流与接管","agent-retrieval":"检索、证据与上下文","agent-observability":"任务追踪与成本归因","kairo-practice":"Kairo 接入与综合验收","training-lab":"训练与恢复综合实战","cloud-service-lab":"云服务发布与观测实战","production-readiness":"跨领域系统设计实战"};
const conceptDirectoryGroups={"transformer-model":"模型结构与计算","gpu-execution":"GPU 与算子","training-platform":"训练作业平台","model-serving":"推理服务","moe-routing":"专家模型与生成优化","agent-runtime":"任务与工具","agent-recovery":"状态、恢复与验收","durable-workflows":"工作流、检索与观测","kairo-practice":"Kairo 接入"};
const trainingDirectoryGroupTitles=["训练状态与资源","分布式执行与数据供给","多机训练、恢复与性能"];
const quantizationLegacyAnchors={"section-8":"section-1","quantization-number-map":"quantization-number-map","section-9":"section-3","section-10":"section-4","section-11":"section-5"};
const legacyArticleSectionAnchors={"training-lab":{"section-8":"section-4","section-9":"section-1","section-10":"section-3"},"agent-observability":{"section-9":"subsection-6-1q7kv9j"},"k8s-networking":{"section-8":"section-6"}};
const legacyGpuDemoTargets={"attention-demo":"attention-mechanics","topology-demo":"multinode-lab"};
const legacyTrackKnowledgeAnchors={"cloud":["concept-path","knowledge-service-model","knowledge-control-data-plane","knowledge-fault-domain","knowledge-vm-runtime","virtualization-resource-contract","knowledge-cpu-memory-placement","knowledge-instance-lifecycle","knowledge-resource-contract","concept-relations","resource-aws-reliability","resource-terraform-state","examples"],"ai":["concept-path","knowledge-mf-tensors","knowledge-mf-attention","knowledge-mf-decoder","knowledge-mf-autograd","knowledge-mf-gpu","knowledge-mf-roofline","concept-relations","examples","resource-d2l-zh","resource-one-gpu-lm","resource-ntu-genai"],"agent":["concept-path","knowledge-ag-runtime","tool-task-contract","tool-finite-loop","knowledge-ag-tools","knowledge-ag-recovery","cancel-request-and-effect","knowledge-ag-fencing","knowledge-ag-authorization","approval-records","knowledge-ag-context","context-state-authority","stale-context-recovery","knowledge-ag-retrieval","retrieval-lexical-foundation","retrieval-evidence-pipeline","knowledge-ag-observability","agent-observation-signals","agent-trace-effect-boundary","knowledge-ag-evaluation","evaluation-metric-contract","knowledge-ag-sandbox","sandbox-authority-boundary","concept-relations","examples","resource-hf-agents","resource-ntu-genai","resource-berkeley-agents"]};
const attentionValidation={"report":{"attention":{"queries":[[1,0],[0,1],[1,1],[-1,1]],"keys":[[1,0],[0,1],[1,1],[1,-1]],"values":[[10,0],[0,20],[30,10],[5,-5]],"weights":[[1,0,0,0],[0.3302384506733431,0.6697615493266569,0,0],[0.2482550782577231,0.2482550782577231,0.5034898434845538,0],[0.13098547884644676,0.5387760704802101,0.26565361202674675,0.06458483864659637]],"output":[[10,0],[3.302384506733431,13.395230986533138],[17.587246087113847,10],[9.602387342499853,13.109133336638688]],"cache_max_abs_error":0,"future_value_cannot_change_past":true,"unmasked_negative_control_changes_past":true,"uniform_oracle":[2,3,35.33333333333333],"visible_value_changes_output":true}}};
const readerConceptChapterIndex={"foundation.prerequisite-1":["linux-resource","virtual-memory-oom"],"foundation.prerequisite-2":["concurrency-pools"],"foundation.prerequisite-3":["network-diagnosis"],"foundation.prerequisite-4":["database-index-locks","cache-consistency","distributed-systems"],"foundation.prerequisite-5":["delivery"],"compute.service-model":["cloud-overview"],"compute.control-data-plane":["cloud-overview","kubernetes-basics"],"compute.fault-domain":["cloud-compute","resilience"],"compute.vm-runtime":["cloud-compute","container-runtime"],"compute.cpu-memory-placement":["cloud-compute","linux-resource"],"compute.instance-lifecycle":["cloud-compute","delivery"],"compute.resource-contract":["cloud-compute","scheduling-resources"],"network.vpc-subnet":["vpc-network"],"network.route-overlay":["vpc-network","k8s-networking"],"network.dns-discovery":["vpc-network","k8s-networking"],"network.nat-conntrack":["vpc-network","network-diagnosis"],"network.lb-tls":["vpc-network","k8s-networking"],"network.transport-timeout":["network-diagnosis","distributed-systems","tcp-event-loop"],"network.io-model":["network-diagnosis","concurrency-pools","tcp-event-loop"],"network.network-boundary":["vpc-network","k8s-networking","iam-security"],"cloud-data.storage-model":["training-storage"],"cloud-data.storage-performance":["training-storage","cloud-compute"],"cloud-data.durability-consistency":["storage-recovery","distributed-systems"],"cloud-data.database-service":["database-index-locks","storage-recovery","mysql-recovery","mysql-replication"],"cloud-data.replication-failover":["distributed-systems","storage-recovery","mysql-replication","resilience"],"cloud-data.cache-layer":["cache-consistency"],"cloud-data.messaging":["serverless-execution","distributed-systems","message-delivery"],"cloud-data.backup-restore":["storage-recovery","resilience","k8s-storage","mysql-recovery"],"native.container-isolation":["container-runtime"],"native.reconciliation":["kubernetes-basics","k8s-workloads","control-plane-consensus"],"native.workload-type":["k8s-workloads"],"native.placement":["scheduling-resources","container-runtime"],"native.service-network":["k8s-networking"],"native.persistent-volume":["k8s-storage"],"native.health-rollout":["k8s-workloads","delivery","cloud-service-lab"],"native.configuration":["config-secrets","iam-security"],"native.autoscaling":["k8s-autoscaling","elasticity"],"serverless.execution-environment":["serverless-execution"],"serverless.trigger-delivery":["serverless-execution","message-delivery"],"serverless.event-idempotency":["serverless-execution","distributed-systems","message-delivery"],"serverless.concurrency-instances":["serverless-execution","k8s-autoscaling"],"serverless.serverless-cost":["serverless-execution","elasticity"],"cloud-delivery.artifact-contract":["delivery"],"cloud-delivery.ci-cd":["delivery","production-readiness"],"cloud-delivery.iac":["delivery","cloud-compute","terraform-state"],"cloud-delivery.controller-api":["kubernetes-basics","distributed-systems","training-platform"],"cloud-delivery.gitops":["delivery","kubernetes-basics","config-secrets","gitops-reconciliation"],"cloud-delivery.release-strategy":["delivery","k8s-workloads"],"cloud-delivery.rollback-compatibility":["delivery","ai-lifecycle"],"cloud-security.authentication-authorization":["iam-security"],"cloud-security.workload-identity":["iam-security","agent-security"],"cloud-security.secret-lifecycle":["config-secrets","iam-security"],"cloud-security.tenant-isolation":["iam-security","scheduling-resources","agent-sandbox"],"cloud-security.execution-security":["container-runtime","iam-security","agent-sandbox"],"cloud-security.audit-accountability":["iam-security","observability","agent-security"],"cloud-capacity.capacity-units":["cloud-compute","elasticity"],"cloud-capacity.queue-backpressure":["elasticity","concurrency-pools"],"cloud-capacity.scaling-delay":["elasticity","k8s-autoscaling"],"cloud-capacity.performance-budget":["cloud-compute","network-diagnosis","observability","elasticity"],"cloud-capacity.cost-efficiency":["cloud-compute","elasticity","serverless-execution"],"sre.sli-slo":["slo"],"sre.observability-signals":["observability"],"sre.alert-burn":["slo","observability"],"sre.diagnosis-method":["incident","network-diagnosis"],"sre.incident-change":["incident","delivery"],"sre.resilience-patterns":["resilience","distributed-systems"],"sre.recovery-evidence":["resilience","storage-recovery"],"model-foundations.mf-tensors":["transformer-model","tokenization-embedding"],"model-foundations.mf-attention":["attention-mechanics","tokenization-embedding","transformer-block","position-encoding","flash-attention-io"],"model-foundations.mf-decoder":["transformer-block","position-encoding","moe-routing"],"model-foundations.mf-autograd":["autograd-training","tokenization-embedding"],"model-foundations.mf-gpu":["gpu-execution","roofline-model","operator-profiling"],"model-foundations.mf-roofline":["roofline-model","flash-attention-io","tensor-parallel-math","operator-profiling"],"training.tr-step":["gpu-cluster","ddp-code"],"training.tr-memory":["gpu-memory","gpu-cluster"],"training.tr-ddp":["distributed-training","ddp-code"],"training.tr-sharding":["distributed-training","gpu-memory"],"training.tr-parallel":["distributed-training","tensor-parallel-math","moe-routing"],"training.tr-collectives":["training-communication","training-performance","multinode-lab"],"training.tr-input":["data-pipeline","gpu-cluster"],"training.tr-recovery":["checkpoint-recovery","multinode-lab","kubernetes-training","training-performance","training-lab"],"platform.sv-contract":["training-platform","ai-lifecycle","kubernetes-training"],"platform.sv-admission":["gpu-scheduling","training-platform","kubernetes-training"],"platform.sv-prefill":["model-serving","inference-performance"],"platform.sv-kv":["model-serving","gpu-scheduling"],"platform.sv-batching":["model-serving","gpu-scheduling","inference-performance"],"platform.sv-metrics":["inference-performance","model-serving"],"platform.sv-quantization":["quantization-serving","gpu-memory"],"platform.sv-optimizations":["model-serving","inference-performance","ai-lifecycle","speculative-decoding"],"platform.sv-release":["ai-lifecycle","training-platform"],"agent.ag-runtime":["agent-runtime","kairo-practice"],"agent.ag-tools":["agent-runtime","mcp-protocol","agent-security","kairo-practice"],"agent.ag-planning":["durable-workflows"],"agent.ag-recovery":["agent-recovery","durable-workflows","kairo-practice"],"agent.ag-fencing":["agent-recovery","durable-workflows","kairo-practice"],"agent.ag-authorization":["agent-security","agent-runtime","kairo-practice","mcp-protocol"],"agent.ag-context":["agent-memory","agent-runtime"],"agent.ag-retrieval":["agent-retrieval","agent-memory","agent-evaluation"],"agent.ag-observability":["agent-observability","agent-evaluation","kairo-practice"],"agent.ag-evaluation":["agent-evaluation","agent-retrieval","kairo-practice","production-readiness"],"agent.ag-sandbox":["agent-sandbox","agent-security","kairo-practice"]};

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
const selectedLearningProfile=function selectedLearningProfile(){
 if(typeof location==='undefined')return null;
 const path=location.pathname?.match(/\/roadmap\/([a-z-]+)\/?$/)?.[1];
 const requested=new URLSearchParams(location.search).get('goal');
 const role=[path,requested].find(key=>Object.hasOwn(learningProfiles,key));
 return role?learningProfiles[role]:null;
};
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
const learningGoalEvidenceID=function learningGoalEvidenceID(chapter,anchor){return 'goal-evidence-'+chapter+'-'+anchor;};
const learningGoalEvidenceKeys=function learningGoalEvidenceKeys(profile){
 return profile.gate.checks.flatMap(({primary,more})=>[primary,...more].map(([chapter,anchor])=>learningGoalEvidenceID(chapter,anchor)));
};
const learningGoalEvidenceReturn=function learningGoalEvidenceReturn(chapter,profile=selectedLearningProfile()){
 if(!profile)return '';
 const anchor=location.hash?.slice(1);
 if(!anchor)return '';
 const id=learningGoalEvidenceID(chapter,anchor);
 const keys=profile.gateEvidence??learningGoalEvidenceKeys(profile);
 if(!keys.includes(id))return '';
 const role=Object.keys(learningProfiles).find(id=>learningProfiles[id]===profile);
 return '/roadmap/'+role+'/#'+id;
};
const learningGoalChapterNav=function learningGoalChapterNav(a){
 const profile=selectedLearningProfile();if(!profile)return '';
 const id=Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile),route=learningProfileRoute(profile),index=route.indexOf(a.id);
 const isGateChapter=learningProfileGateChapters(profile).includes(a.id);
 const evidence=learningGoalEvidenceReturn(a.id,profile);
 const gateReturn=evidence?'<a href="'+evidence+'">回到本项验收 →</a>':
  '<a href="/roadmap/'+id+'/#goal-gate">回到这条路线的交付题 →</a>';
 if(index<0)return isGateChapter?
  '<nav class="goal-reading-nav" aria-label="当前岗位验收"><span>“'+profile.label+'”的验收对照</span>'+gateReturn+'</nav>':'';
 const previous=articleById(route[index-1]),next=articleById(route[index+1]);
 let gateLink=isGateChapter?gateReturn:'';
 if(!next&&!evidence)gateLink='<a href="/roadmap/'+id+'/#goal-gate">打开这条路线的交付题 →</a>';
 return '<nav class="goal-reading-nav" aria-label="当前岗位路线"><span>正在按“'+profile.label+'”学习 · '+(index+1)+' / '+route.length+'</span><a href="/roadmap/'+id+'/#learning-goal">查看这条路线</a>'+gateLink+(previous?'<a href="'+readingArticleURL(previous.id)+'">← 上一章：'+previous.number+' '+previous.title+'</a>':'')+(next?'<a href="'+readingArticleURL(next.id)+'">本路线下一章：'+next.number+' '+next.title+' →</a>':'')+'</nav>';
};
const learningConceptChapters=function learningConceptChapters(source){
 const match=source.match(/^([a-z0-9-]+)\.([a-z0-9-]+)$/);
 if(!match)return [];
 // The article reader receives the same associations without the full graph data.
 if(typeof readerConceptChapterIndex!=='undefined')return readerConceptChapterIndex[source]||[];
 const [,field,concept]=match;
 if(!Object.hasOwn(fieldConceptMaps,field)||!fieldConceptMaps[field].nodes.some(([id])=>id===concept))return [];
 const point=fieldPointRecords(field).find(item=>item.id===concept);
 if(!point)return [];
 const evidence=new Set(fieldConceptLabIds(field,concept));
 const labChapters=labLearningCatalog.filter(lab=>evidence.has(lab.id)).map(lab=>lab.chapter);
 return [...new Set([...fieldConceptRelatedChapters(field,point),...labChapters])];
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
  if(explicitGoal||query.has('returnGoal')||!profile||query.get('track')!==profile.track)return href;
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
 if(articleId&&currentId&&!query.has('fromConcept')&&currentParams.has('fromConcept')){
  const source=currentParams.get('fromConcept');
  const sameChapter=articleId===currentId;
  const related=sameChapter?[]:learningConceptChapters(source);
  if(sameChapter||(related.includes(currentId)&&related.includes(articleId))){
   query.set('fromConcept',source);
   if(!explicitGoal&&!query.has('returnGoal')&&currentParams.has('returnGoal'))query.set('returnGoal',currentParams.get('returnGoal'));
   changed=true;
  }
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
 const articleId=path.match(/^\/article\/([a-z0-9-]+)\/?$/)?.[1];
 const legacyPractice=path==='/module/practice/'||path==='/module/practice';
 const sourceId=legacyPractice?'training-lab':articleId;
 const legacyGpuArticle=sourceId==='gpu-cluster';
 if(!legacyGpuArticle&&sourceId!=='model-serving'&&!Object.hasOwn(legacyArticleSectionAnchors,sourceId))return null;
 const anchors=sourceId==='model-serving'?quantizationLegacyAnchors:legacyArticleSectionAnchors[sourceId];
 const query=new URLSearchParams(search);
 if(legacyPractice){
  const track=query.get('track')||learningProfiles[query.get('goal')]?.track;
  if(track==='cloud'||track==='agent')return null;
 }
 let anchor=hash.slice(1);
 try{anchor=decodeURIComponent(anchor)}catch{return null}
 if(!anchor&&query.has('section')){
  const section=query.get('section');
  anchor=legacyGpuArticle?section:'section-'+section;
 }
 const demoArticle=legacyGpuArticle&&Object.hasOwn(legacyGpuDemoTargets,anchor)?legacyGpuDemoTargets[anchor]:null;
 if(!demoArticle&&(!anchors||!Object.hasOwn(anchors,anchor)))return null;
 const target=demoArticle?anchor:anchors[anchor],destination=demoArticle||(sourceId==='model-serving'?'quantization-serving':sourceId);
 query.delete('section');
 return '/article/'+destination+'/'+(query.toString()?'?'+query.toString():'')+'#'+target;
};
const legacySectionTarget=function legacySectionTarget(articleId,section){return articleId==='network-diagnosis'&&section==='7'?'network-timing-lab':section};
const restoreDocumentFragment=function restoreDocumentFragment(focusTarget=false){
 const hash=location.hash;
 if(!hash||hash.startsWith('#/'))return;
 let id;
 try{id=decodeURIComponent(hash.slice(1))}catch{return}
 requestAnimationFrame(()=>{
  if(location.hash!==hash)return;
  const target=document.getElementById(id);
  if(!target)return;
  for(let node=target;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
  const child=target.querySelector?.(':scope > details.article-case');
  if(child)child.open=true;
  if(focusTarget){
   if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
   target.focus({preventScroll:true});
  }
  target.scrollIntoView({behavior:'instant'});
 });
};
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
const initInteractive=function initInteractive(){initReaderActions();initAttentionDemo();initSystemInteractive();
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
const initAttentionDemo=function initAttentionDemo(){
 const root=document.querySelector('[data-attention-demo]'),panel=root?.querySelector('[data-attention-live]');
 if(!panel||panel.firstElementChild)return;
 let position=0;
 const {queries}=attentionValidation.report.attention;
 panel.innerHTML=`<div class="interactive">
  <div class="segmented" role="group" aria-label="选择查询位置">${queries.map((_,i)=>`<button type="button" data-position="${i}">位置 ${i}</button>`).join('')}</div>
  <div class="attention-controls"><label><input type="checkbox" data-causal checked> 使用因果掩码</label><label><input type="checkbox" data-future> 把位置 3 的 V 改为 [999, −999]</label></div>
  <div class="attention-weights"></div>
  <p class="attention-output" aria-live="polite"></p>
 </div>`;
 const buttons=[...panel.querySelectorAll('[data-position]')];
 const causal=panel.querySelector('[data-causal]'),future=panel.querySelector('[data-future]');
 const weights=panel.querySelector('.attention-weights'),output=panel.querySelector('.attention-output');
 function update(){
  const useMask=causal.checked;
  const result=attentionExample(position,useMask,future.checked);
  buttons.forEach((button,i)=>{
   const selected=i===position;
   button.classList.toggle('active',selected);
   button.setAttribute('aria-pressed',String(selected));
  });
  weights.innerHTML=result.weights.map((weight,i)=>{
   const masked=useMask&&i>position;
   return `<div class="${masked?'masked':''}"><small>位置 ${i}</small><b>${(weight*100).toFixed(1)}%</b><span>${masked?'屏蔽':'参与加权'}</span></div>`;
  }).join('');
  output.textContent=`位置 ${position} 的输出向量 [${result.output.map(value=>value.toFixed(3)).join(', ').replaceAll('-','−')}]`;
 }
 buttons.forEach((button,i)=>button.onclick=()=>{position=i;update();});
 causal.onchange=update;
 future.onchange=update;
 update();
};
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
  if(e.titleNorm===query){tier=0;label='标题匹配';}
  else if(e.type==='article'&&(segment=e.segments.find(s=>s.headingNorm===query&&(s.subsection||/^section-\d+$/.test(s.anchor))))){tier=4;label='小节标题匹配';}
  else if(all(e.titleNorm)){tier=searchContains(e.titleNorm,query)?1:2;label='标题匹配';}
  else if((segment=e.segments.find(s=>s.conceptNorm&&s.conceptNorm===query))){tier=2;label='概念匹配';}
  else if(all(e.descNorm)){tier=3;label='简介或主题匹配';}
  else if((segment=e.segments.find(s=>all(s.headingNorm)))){tier=4;label='小节标题匹配';}
  else {const candidates=e.segments.filter(s=>!s.subsection&&all(s.norm));candidates.sort((a,b)=>Number(all(b.proseNorm))-Number(all(a.proseNorm))||coverage(b.headingNorm)-coverage(a.headingNorm)||Number(searchContains(b.norm,query))-Number(searchContains(a.norm,query)));if((segment=candidates[0])){tier=all(segment.proseNorm)?5:6;label=tier===5?'正文匹配':'源码匹配';}}
  let anchor=e.type==='article'?segment?.anchor:segment?.anchor||e.anchor;
  if(e.type==='article'&&tier>=5&&coverage(e.titleNorm)>0&&segment&&!coverage(segment.headingNorm)){anchor=undefined;label='标题与正文匹配';}
  // A heading hit should explain its opening, rather than jump to a later download label.
  let excerptText=segment&&(tier===4||label==='概念匹配')?segment.heading+'。'+segment.text:segment?.text||e.desc;
  if(segment?.subsection){
   const parent=e.segments.find(s=>s.anchor===segment.parent),[start,end]=segment.range;
   excerptText=segment.heading+'。'+parent.text.slice(start,Math.min(end,start+137)).trimStart();
  }
  results.push({...e,titlePhraseStart:Number(e.titleNorm.startsWith(query)),headingExact:Number(tier===4&&segment.headingNorm===query),path:e.path+(segment?.query?'?'+segment.query:''),anchor,tier,titleCoverage:coverage(e.titleNorm),descCoverage:coverage(e.descNorm),phraseMatch:Number(searchContains(segment?.norm||e.allNorm,query)),matchLabel:label,excerpt:siteSearchExcerpt(excerptText,terms),terms});
 }
 return results.sort((a,b)=>a.tier-b.tier||b.headingExact-a.headingExact||b.titlePhraseStart-a.titlePhraseStart||b.titleCoverage-a.titleCoverage||b.descCoverage-a.descCoverage||b.phraseMatch-a.phraseMatch||a.order-b.order);
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
 const segments=packedSegments.map(({proseNorm,proseRanges,...segment})=>{
  const plainNorm=normalizeSearchText(segment.text);
  let prose=proseNorm??plainNorm;
  if(proseRanges){
   const words=plainNorm.split(' '),chunks=[];
   for(let i=0;i<proseRanges.length;i+=2)chunks.push(words.slice(proseRanges[i],proseRanges[i+1]).join(' '));
   prose=chunks.join(' ');
  }
  return {...segment,proseNorm:prose,norm:normalizeSearchText(segment.heading+' '+segment.text),
   headingNorm:normalizeSearchText(segment.heading),conceptNorm:normalizeSearchText(segment.conceptTitle||'')};
 });
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
const searchCatalog={"url":"/reader-assets/search-catalog.d574849e3521.json","sha256":"d574849e35215da2ff7135e2be68a45e033f527e23ebfadb0db6965a5b7710d0"},searchSuggestions=[{"id":"article:cloud-overview","type":"article","titleText":"云计算架构：服务模型、资源与责任边界","desc":"服务已经启动，用户却仍可能访问失败。沿着一次查询请求，建立资源、数据、身份与可靠性的共同地图。","module":"compute","number":"C1.1","path":"/article/cloud-overview/"},{"id":"knowledge:mf-tensors","type":"knowledge","titleText":"Token、张量形状与预测目标","desc":"基础单位是有效预测目标。这里把模型处理文本的基本单位称为词元（token）。分词器（tokenizer）把文本变成编号；嵌入查表（Embedding）把编号变成向量；输出层为词表里的每个词元算出一个未归一化得分（logit）。输入长度、模型维度和词表大小分别影响不同的内存与计算。","module":"model-foundations","path":"/module/model-foundations/","anchor":"knowledge-mf-tensors"},{"id":"knowledge:tr-ddp","type":"knowledge","titleText":"DDP：副本一致与全局目标是两件检查","desc":"分布式数据并行（DDP）让每个工作进程持有模型副本，并在反向中对梯度做跨 rank 平均。它不替你切分输入，也不知道每个 rank 有多少有效目标。","module":"training","path":"/module/training/","anchor":"knowledge-tr-ddp"},{"id":"knowledge:sv-kv","type":"knowledge","titleText":"KV Cache：GQA 字节账、分块与增长","desc":"普通全注意力、各层相同 KV 头数且 K/V 维度相同的逻辑缓存量，可从层数、KV 头数、头维、位置数与字节数直接推导。使用 KV 头数，而非查询头数。","module":"platform","path":"/module/platform/","anchor":"knowledge-sv-kv"},{"id":"knowledge:ag-runtime","type":"knowledge","titleText":"运行时：任务、运行、步骤与效果身份","desc":"智能体（Agent）运行时执行“提出动作→检查权限和参数→安排执行→调用工具→保存回执→验收结果”的循环。模型输出是待解释的提议，执行器管理可信身份、状态、预算和实际动作。","module":"agent","path":"/module/agent/","anchor":"knowledge-ag-runtime"},{"id":"knowledge:ag-recovery","type":"knowledge","titleText":"持久执行：恢复、取消与效果回执","desc":"持久执行记录可恢复的决策与步骤结果。重放使用已经记录的结果继续推进；重新执行外部动作需要接收方幂等或查询协议。","module":"agent","path":"/module/agent/","anchor":"knowledge-ag-recovery"}],searchKnowledgeCount=96;
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
   const validRanges=ranges=>Array.isArray(ranges)&&ranges.length%2===0&&ranges.every(
    (value,index)=>Number.isSafeInteger(value)&&value>=0&&(index===0||value>ranges[index-1]));
   const validSegment=s=>s&&typeof s.heading==='string'&&typeof s.text==='string'&&
    (s.proseNorm===undefined||typeof s.proseNorm==='string')&&
    (s.proseRanges===undefined||(s.proseNorm===undefined&&validRanges(s.proseRanges)));
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
function focusLocalSearchResult(href){
 const target=new URL(href,location.href);
 if(target.origin!==location.origin||target.pathname!==location.pathname||target.search!==location.search||!target.hash||target.hash.startsWith('#/'))return false;
 $('#search-dialog').close();
 if(location.hash!==target.hash)location.hash=target.hash;
 restoreDocumentFragment(true);
 return true;
}
listen($('#search-input'),'compositionstart',()=>{if($('#search-dialog').open){searchComposing=true;suspendSearch()}});
listen($('#search-input'),'compositionend',e=>{if(searchComposing&&$('#search-dialog').open){searchComposing=false;search(e.target.value)}});
listen($('#search-input'),'input',e=>{if($('#search-dialog').open&&!searchComposing&&!e.isComposing)search(e.target.value)});
listen($('#search-dialog'),'click',e=>{
 const dialog=$('#search-dialog'),result=e.target.closest('.search-result');
 if(result&&!e.defaultPrevented&&e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&focusLocalSearchResult(result.href))e.preventDefault();
 else if(result||e.target===dialog)dialog.close();
});
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
  e.preventDefault();
  const result=searchItems[Math.max(0,searchIndex)],href=learningContextHref(hostedPath(result.path)+(result.anchor?'#'+result.anchor:''));
  if(!focusLocalSearchResult(href)){location.assign(href);$('#search-dialog').close();}
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

const followCourseRedirect=function followCourseRedirect(){
 const destination=courseRedirectFor(documentPathname(),location.search||'',location.hash||'');
 if(!destination)return false;
 const url=hostedPath(destination);
 if(url.split('#',1)[0]===location.pathname+location.search){
  history.replaceState(history.state,'',url);
  restoreDocumentFragment();
  return false;
 }
 location.replace(url);
 return true;
};

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
