/* Concept names for scanning a directory. Full article titles remain the page title. */
const conceptDirectoryTitles={
 'linux-resource':'进程、线程与资源',
 'virtual-memory-oom':'虚拟内存与 OOM',
 'concurrency-pools':'并发、锁与线程池',
 'distributed-systems':'超时、重试与幂等',
 'cloud-overview':'云计算架构与服务模型',
 'cloud-compute':'虚拟化与计算资源',
 'vpc-network':'DNS、路由与网络边界',
 'network-diagnosis':'网络诊断与请求时序',
 'tcp-event-loop':'TCP、I/O 与 epoll',
 'training-storage':'块、文件与对象存储',
 'database-index-locks':'SQL 索引、事务与锁',
 'cache-consistency':'缓存一致性与击穿',
 'storage-recovery':'存储版本、发布与恢复',
 'mysql-recovery':'MySQL 日志与恢复',
 'mysql-replication':'MySQL 复制与切换',
 'container-runtime':'容器、镜像与隔离',
 'kubernetes-basics':'Kubernetes 对象与控制面',
 'k8s-workloads':'工作负载与滚动更新',
 'scheduling-resources':'调度、亲和与拓扑',
 'k8s-networking':'Pod、Service 与容器网络',
 'k8s-storage':'PVC、持久卷与恢复',
 'config-secrets':'配置、密钥与生效过程',
 'k8s-autoscaling':'HPA 与节点容量',
 'control-plane-consensus':'etcd、多数派与恢复',
 'serverless-execution':'Serverless 与事件驱动',
 'message-delivery':'消息投递与确认',
 'delivery':'制品、发布与回退',
 'terraform-state':'Terraform 状态与漂移',
 'gitops-reconciliation':'GitOps 与持续调谐',
 'iam-security':'身份、授权与最小权限',
 'elasticity':'容量、排队与弹性',
 'slo':'SLI、SLO 与错误预算',
 'observability':'指标、日志与追踪',
 'incident':'故障诊断与时间线',
 'resilience':'RPO、RTO 与恢复工程',
 'transformer-model':'Transformer 整体结构',
 'tokenization-embedding':'Token、词表与 Embedding',
 'attention-mechanics':'Attention、QKV 与多头',
 'transformer-block':'FFN、残差与归一化',
 'position-encoding':'位置编码与 RoPE',
 'autograd-training':'损失、梯度与参数更新',
 'gpu-execution':'GPU 执行与存储层次',
 'roofline-model':'Roofline 与性能瓶颈',
 'flash-attention-io':'FlashAttention 与分块',
 'tensor-parallel-math':'张量并行与流水线并行',
 'operator-profiling':'算子实现与性能分析',
 'gpu-cluster':'云上训练的完整流程',
 'distributed-training':'DDP、FSDP 与并行策略',
 'gpu-memory':'训练显存与混合精度',
 'ddp-code':'DDP 程序与全局目标',
 'training-communication':'NCCL 与集合通信',
 'data-pipeline':'数据读取、分片与组批',
 'multinode-lab':'两机四卡 DDP 实战',
 'checkpoint-recovery':'检查点与训练恢复',
 'training-performance':'训练性能、扩展与成本',
 'training-platform':'训练作业与平台契约',
 'gpu-scheduling':'GPU 队列、配额与调度',
 'kubernetes-training':'Kubernetes 训练作业',
 'model-serving':'Prefill、Decode 与 KV Cache',
 'quantization-serving':'量化、打包与校准',
 'inference-performance':'TTFT、TPOT 与服务吞吐',
 'ai-lifecycle':'模型产物、评估与发布',
 'moe-routing':'MoE 路由与专家执行',
 'speculative-decoding':'推测解码与缓存回退',
 'agent-runtime':'Agent 组成与执行循环',
 'mcp-protocol':'MCP 工具协议与 SDK',
 'agent-security':'Agent 身份与权限',
 'agent-sandbox':'沙箱与执行隔离',
 'agent-recovery':'持久状态、幂等与恢复',
 'agent-memory':'上下文、状态与长期记忆',
 'agent-evaluation':'任务评估与产物验收',
 'durable-workflows':'持久工作流与接管',
 'agent-retrieval':'检索、证据与上下文',
 'agent-observability':'任务追踪与成本归因',
 'kairo-practice':'Kairo 接入与综合验收',
 'training-lab':'训练与恢复综合实战',
 'cloud-service-lab':'云服务发布与观测实战',
 'production-readiness':'跨领域系统设计实战'
};
const conceptDirectoryGroups={
 'transformer-model':'模型结构与计算',
 'gpu-execution':'GPU 与算子',
 'training-platform':'训练作业平台',
 'model-serving':'推理服务',
 'moe-routing':'专家模型与生成优化',
 'agent-runtime':'任务与工具',
 'agent-recovery':'状态、恢复与验收',
 'durable-workflows':'工作流、检索与观测',
 'kairo-practice':'Kairo 接入'
};
const trainingDirectoryGroupTitles=['训练状态与资源','分布式执行与数据供给','多机训练、恢复与性能'];
// Both course directories use the same subject names and group boundaries.
function courseDirectoryEntries(chapters){
 const groups=[];let current;
 for(const article of chapters){
  const title=conceptDirectoryGroups[article.id]||(article.module==='training'?trainingDirectoryGroupTitles[article.group]:'')||'';
  if(!current||current.module!==article.module||(title&&title!==current.title)){
   current={id:article.id,module:article.module,title,entries:[]};groups.push(current);
  }
  current.entries.push({article,label:chapterDirectoryTitle(article),fullTitle:article.title});
 }
 return groups;
}
// A section has one visible topic in the body and in both contents controls.
// Original authored titles still identify the source lesson; section URLs are stable.
const conceptSectionTitles={
 ...progressiveCloudSectionTitles,
 ...progressiveAiSectionTitles,
 ...progressiveAgentSectionTitles,
 'training-lab':['完整训练状态与恢复边界','更新语义与恢复对照','两进程训练与新进程恢复实战','状态比较与运行日志','配置与优化器反例','恢复差异的定位方法','GPU、多机与集群验收'],
 'durable-workflows':['任务目标与步骤依赖','历史、检查点与事实复用','确定性重放与活动结果','工具提交与框架恢复','执行接管与代际安装','旧写隔离与业务去重','接管窗口与提交恢复','计划、审批与持久等待','工作流恢复与框架实战','工作流升级与历史保留'],
 'cloud-service-lab':['服务实例、探针与控制链','探针条件与容器重启','Service 请求与后端条件','模板修订、发布与回退','原生实验、源码与验收'],
 'cloud-overview':['云计算的基本对象','一次云上请求','运行职责、数据面与控制面','HTTP 状态与健康检查','Cloud、AI 与 Agent 的关系'],
 'transformer-model':['Transformer 整体结构','张量与形状','矩阵乘法与线性层','Decoder 的核心模块','模型形状与参数账本','计算量与存储规模','训练与自回归生成','序列长度与注意力复杂度','标签对齐与因果验证'],
 'training-storage':['存储接口与读写路径',...progressiveCloudSectionTitles['training-storage'].slice(1)],
 'model-serving':['模型服务的对象与生成路径',...progressiveAiSectionTitles['model-serving'].slice(1)],
 'operator-profiling':['算子、类型与内存布局','稳定 Softmax 与数值参考','GPU 线程映射与树形归约','GEMM 访问、分块与同步','FLOP、字节与算术强度','预热、异步计时与测量边界','CPU 轨迹与 GPU 采集边界','CPU/CUDA 实现与数值验收','算子正确性与性能判据'],
 'training-platform':['作业、worker、rank 与执行轮次','准入、启动与训练生命周期','任务契约与控制器协调','训练终态与不可变产物','失败分类、重试与取消','控制、执行与发布的交接','提交、等待与终态仲裁练习'],
 'agent-runtime':['Agent 的组成与职责','工具调用契约','执行循环与预算','错误分类与重试','任务状态与操作身份','任务完成与产物验证','Kairo 接入关系','HTTP 工具实战','流式工具调用']
};
function chapterDirectoryTitle(article){return conceptDirectoryTitles[article.id]||article.title;}
function chapterSectionTitle(article,index){return conceptSectionTitles[article.id]?.[index]||article.sections[index][0];}
const optionalConceptReviews=new Set(['cloud-overview','transformer-model','agent-runtime','cloud-compute','kubernetes-basics','tokenization-embedding','attention-mechanics','agent-security','agent-memory','transformer-block','position-encoding','agent-sandbox','agent-recovery','cloud-service-lab','storage-recovery','k8s-storage','autograd-training','gpu-memory','durable-workflows','vpc-network','network-diagnosis','training-communication','data-pipeline','agent-observability','serverless-execution','message-delivery','model-serving','inference-performance','agent-evaluation','agent-retrieval','linux-resource','virtual-memory-oom','concurrency-pools','distributed-systems','training-platform','gpu-scheduling','kubernetes-training','mcp-protocol','kairo-practice','operator-profiling','training-storage','database-index-locks','cache-consistency','gpu-execution','roofline-model','flash-attention-io','tensor-parallel-math']);
function chapterInitialConceptTerms(article){return optionalConceptReviews.has(article.id)?new Set():conceptSeen(chapterConceptPaths[article.id]);}
const optionalCaseSections={'agent-runtime':[7,8]};
function isOptionalCaseSection(article,index){return optionalCaseSections[article.id]?.includes(index)||false;}
function chapterSectionBody(article,index,html){
 return isOptionalCaseSection(article,index)
  ?'<details class="article-case"><summary>展开实战：运行方法、结果对照与变化题</summary>'+html+'</details>'
  :html;
}

// Reviewed standalone bodies carry their own definitions; their old preview is a chapter-end review.
function chapterReadingContentsHTML(article,navigation=chapterNavigation(article)){
 const topics=chapterContentsHTML(article,navigation);
 const concept=conceptTOCLink(readingArticleURL(article.id),optionalConceptReviews.has(article.id)?'概念回顾':'概念起点与关系');
 return optionalConceptReviews.has(article.id)?topics+concept:concept+topics;
}

// These standalone chapters define their objects in authored prose. Do not
// append a second generic definition or reinterpret a mathematical symbol.
function chapterConceptProse(article,html,seen){return optionalConceptReviews.has(article.id)?html:explainFirstConceptTerms(html,seen);}
