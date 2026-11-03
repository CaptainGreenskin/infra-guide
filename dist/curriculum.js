const systemChapters=[];
const para=(...items)=>items.map(t=>'<p>'+t+'</p>').join('');
const bullet=items=>'<ul>'+items.map(t=>'<li>'+t+'</li>').join('')+'</ul>';
const table=trainingTable, code=trainingCode, figure=trainingFigure, note=trainingNote;
const linkTo=(id,label)=>'<a class="inline-link" href="#/article/'+id+'">'+label+' →</a>';
const systemDownload='<div class="download-box"><div><strong>配套系统实验包</strong><span>Python 标准库 · Cloud / AI 指标 / Agent 恢复 · 附实测记录</span></div><a href="labs/infra-systems.zip" download>下载实验包 ↓</a></div>';
function chapter(module,number,id,title,desc,prereq,objectives,sections,exercise,refs,related=[],lab=null){
 systemChapters.push({module,number,id,title,desc,prereq,objectives,sections,exercise,refs,related,lab,
 level:lab?'机制 + 实验':'机制 + 设计',minutes:18,tags:objectives.map(x=>x.split('：')[0]).slice(0,3),
 intro:desc,edition:'系统课程',baseline:lab?'Python 3.9+ · 标准库实验':'原理、案例与设计验收'});
}
Object.assign(sources,{
linux:['Linux · cgroup v2','https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html'],
resources:['Kubernetes · 容器资源管理','https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/'],
probes:['Kubernetes · 容器探针','https://kubernetes.io/docs/concepts/workloads/pods/probes/'],
endpoints:['Kubernetes · EndpointSlices','https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/'],
deploy:['Kubernetes · Deployment','https://kubernetes.io/docs/concepts/workloads/controllers/deployment/'],
routing:['AWS · VPC 路由表','https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html'],
securitygroup:['AWS · 安全组','https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html'],
s3model:['AWS · S3 一致性模型','https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel'],
s3version:['AWS · 对象版本','https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html'],
s3replication:['AWS · 复制的范围','https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-what-is-isnot-replicated.html'],
slopractice:['Google SRE · 实施 SLO','https://sre.google/workbook/implementing-slos/'],
sloalert:['Google SRE · SLO 告警','https://sre.google/workbook/alerting-on-slos/'],
histogram:['Prometheus · Histograms and summaries','https://prometheus.io/docs/practices/histograms/'],
retry:['AWS Builders Library · 超时、重试与抖动','https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/'],
iam:['AWS · IAM 最佳实践','https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html'],
tenants:['Kubernetes · 多租户','https://kubernetes.io/docs/concepts/security/multi-tenancy/'],
config:['Kubernetes · ConfigMap','https://kubernetes.io/docs/concepts/configuration/configmap/'],
secrets:['Kubernetes · Secret','https://kubernetes.io/docs/concepts/configuration/secret/'],
kueue:['Kueue · 工作队列与资源准入','https://kueue.sigs.k8s.io/docs/overview/'],
clusterqueue:['Kueue · ClusterQueue','https://kueue.sigs.k8s.io/docs/concepts/cluster_queue/'],
kv:['vLLM · Paged attention','https://docs.vllm.ai/en/stable/design/paged_attention/'],
servingopt:['vLLM · 优化与调度','https://docs.vllm.ai/en/stable/configuration/optimization/'],
servingbench:['vLLM · 性能测量','https://docs.vllm.ai/en/stable/benchmarking/cli/'],
pythonhttp:['Python · http.server','https://docs.python.org/3/library/http.server.html'],
sqlite:['Python · sqlite3','https://docs.python.org/3/library/sqlite3.html'],
transactions:['SQLite · Transactions','https://www.sqlite.org/lang_transaction.html'],
agentpatterns:['Anthropic · Building effective agents','https://www.anthropic.com/research/building-effective-agents'],
mcptools:['MCP · Tools 2025-11-25','https://modelcontextprotocol.io/specification/2025-11-25/server/tools'],
mcpauth:['MCP · Authorization 2025-11-25','https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization'],
mcpcancel:['MCP · Cancellation 2025-11-25','https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation'],
activity:['Temporal · Activity definition','https://docs.temporal.io/activity-definition'],
workflow:['Temporal · Workflow execution','https://docs.temporal.io/workflow-execution'],
context:['Anthropic · Context engineering','https://www.anthropic.com/research/effective-context-engineering-for-ai-agents'],
evals:['Anthropic · Agent evaluations','https://www.anthropic.com/research/demystifying-evals-for-ai-agents']
});
const moduleDesign={
foundation:{track:'cloud',name:'系统基础与工程思维',desc:'从请求、进程和失败语义出发，建立学习三类基础设施的共同语言。',outcomes:['画出一条端到端路径','区分资源用量与系统进展','解释超时后的未知结果']},
compute:{track:'cloud',name:'计算、弹性与身份',desc:'从资源需求推导容量，理解扩容时序、故障域和身份权限。',outcomes:['解释规格选择依据','估算容量与扩容延迟','设计最小权限边界']},
network:{track:'cloud',name:'网络、存储与数据路径',desc:'沿着请求和数据流，理解连通、性能、持久化与恢复。',outcomes:['分层定位连接失败','比较存储语义与访问模式','证明一个版本能恢复']},
native:{track:'cloud',name:'云原生与可控交付',desc:'连接期望状态、调度、探针与发布，让应用变化可以解释和回退。',outcomes:['解释控制器与节点职责','验证健康信号的效果','设计可追踪的交付单元']},
sre:{track:'cloud',name:'可靠性与系统诊断',desc:'用用户结果定义目标，用证据判断故障，用演练检验恢复。',outcomes:['计算错误预算与消耗率','构建可验证的故障假设','定义并演练恢复目标']},
training:{track:'ai',name:'云上 AI 训练',outcomes:['解释计算、通信与数据依赖','完成分布式训练机制实验','验证恢复与扩展口径']},
platform:{track:'ai',name:'AI 平台与推理服务',tags:['任务契约','推理服务','KV Cache','模型交付'],desc:'把训练产物交付成可运行、可度量、可回滚的模型服务。',outcomes:['拆分准入、调度和运行','理解 KV Cache 与推理时序','设计模型发布与性能验收']},
practice:{track:'shared',name:'综合设计与工程实战',tags:['完整案例','恢复演练','设计验收'],desc:'用完整案例连接三条路线，提交架构、实验和验收证据。',outcomes:['整合跨层依赖','写出可复现运行记录','用故障演练验证设计']},
agent:{track:'agent',name:'Agent 运行时与 Kairo 实践',desc:'围绕任务、工具、状态与权限，构建可恢复、可评估的执行系统。',outcomes:['定义工具执行的可靠性语义','检验副作用与崩溃恢复','建立 Kairo 能力验收映射']}
};
modules.push({id:'agent',n:'09',name:'Agent 运行时与 Kairo 实践',en:'AGENT INFRASTRUCTURE',icon:'layers',desc:'',tags:['Runtime','工具执行','持久化','Kairo']});
modules.forEach(m=>Object.assign(m,moduleDesign[m.id]));
const trackDefinitions={
cloud:{label:'Cloud Infra',subtitle:'让服务可靠地运行',modules:['foundation','compute','network','native','sre'],start:'cloud-overview',story:'从一个服务上线，到流量增长、故障诊断与恢复。',accent:'cloud'},
ai:{label:'AI Infra',subtitle:'让算力成为有效的模型能力',modules:['training','platform'],start:'gpu-cluster',story:'从数据进入训练，到模型成为可度量、可回滚的推理服务。',accent:'ai'},
agent:{label:'Agent Infra',subtitle:'让任务可靠地完成',modules:['agent'],start:'agent-runtime',story:'从模型提出工具调用，到副作用、崩溃恢复、权限与结果评估。',accent:'agent'}
};

