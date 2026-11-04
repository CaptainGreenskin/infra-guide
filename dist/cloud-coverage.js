// Official roles establish capabilities; candidate recollections establish reported questions.
const cloudRoleSources = [
 {id:'tencent',name:'腾讯 · IaaS计算产品SRE工程师',type:'社招 · 三年以上',url:'https://careers.tencent.com/jobdesc.html?postId=2113177003082559488',data:'https://careers.tencent.com/tencentcareer/api/post/ByPostId?postId=2113177003082559488&language=zh-cn',date:'官方更新 2026-10-22；首发未确认',skills:'Python/Go 研发、Linux/网络/数据库、性能诊断、观测与变更治理、高可用和容灾。'},
 {id:'alibaba',name:'阿里集团 · AI SRE',type:'2027 届校招 · 意向业务含阿里云等',url:'https://campus-talent.alibaba.com/campus/position/199907820042',date:'官方数据修改 2026-08-24；首发为空',skills:'编程与软件工程、分布式与 Kubernetes、可观测数据和故障隔离、安全发布，以及用 Agent 工具组织运维任务。'},
 {id:'bytedance',name:'字节 · 站点架构专家/架构师-火山引擎',type:'社招 · 五年以上',url:'https://jobs.bytedance.com/experienced/position/7641877352831830277/detail',data:'https://jobs.bytedance.com/api/v1/job/posts/7641877352831830277',date:'官方发布 2026-05-20；更新日未确认',skills:'跨 Region/AZ/IDC 站点、VPC/NAT/LB/DNS、控制面与数据面、容量稳定性成本治理、可量化项目结果及跨团队推进。'}
];
const cloudCoverageRows=[
 ['前置','语言、算法与并发','有依赖图、最大栈与并发机制练习。','主力语言的运行时、网络编程及更多限时编码仍需专项训练。',['concurrency-pools'],'coding'],
 ['前置','Linux 与系统机制','有进程资源、虚拟内存、cgroup 与锁的详解和本地程序。','内核 tracing、调度器源码和生产内存故障不由这些实验覆盖。',['linux-resource','virtual-memory-oom']],
 ['C1','计算、虚拟化与故障域','有系统知识、规格与容量推导。','KVM、virtio、NUMA 绑定与设备直通的实机/源码深度仍需专向课。',['cloud-compute']],
 ['C2','云网络与协议','有 VPC、DNS、路由、NAT、入口、TCP/I/O 知识与时序实验。','BGP/IPv6、真实转发、MTU/conntrack 与大规模网络故障需深化。',['vpc-network','network-diagnosis']],
 ['C3','存储、数据库与缓存','展开 redo/binlog、复制接收/应用、旧主隔离与 PITR；真实 SQLite 备份和应用日志实验验证恢复、缺段、重复与后续写入。','MySQL/PostgreSQL 引擎重放、实际切主与跨区恢复仍需目标环境证据；本地应用日志不是数据库 WAL。',['database-index-locks','cache-consistency','storage-recovery']],
 ['跨域','分布式协调与消息','讲超时、幂等、复制边界与事件确认，运行单库回执实验。','Raft/etcd 实现、Kafka/RocketMQ 消费与再均衡尚不足以独立应对深入研发面。',['distributed-systems','serverless-execution']],
 ['C4','容器与 Kubernetes','八篇展开运行时、控制面、工作负载、调度、CNI、CSI、配置和 HPA。','清单经离线 schema 核对；未在真实集群/CNI/CSI 下验证，Operator 编码还需补。',['container-runtime','k8s-workloads','k8s-networking','k8s-storage']],
 ['C5','Serverless 与事件','展开执行环境、三种触发契约、部分批次响应、并发/下游与成本；真实进程退出和并发事务验证效果去重。','云函数、SQS 可见性/重驱、冷启动和真实伸缩尚未在供应商环境实测。',['serverless-execution']],
 ['C6','平台 API、IaC 与 GitOps','展开三方状态、保存计划、调谐、自愈/清理与兼容发布；真实 Terraform 1.13.0 内建 provider 实验和独立 GitOps 教学模型。','云 provider/remote backend、Argo/Flux 集群执行与 client-go/Operator 实现仍需专项；模型不是控制器实测。',['delivery','kubernetes-basics']],
 ['C7','身份、安全与多租户','讲 IAM、RBAC、凭证、Secret 与隔离，连接工具授权本地实验。','集群准入、真实云 IAM、沙箱对抗与多租户网络需要目标环境验证。',['iam-security','agent-security','agent-sandbox']],
 ['C8','容量、性能与成本','有资源账本、HPA 分母、排队/伸缩时序和用量公式。','缺生产负载压测、完整账单归因与跨 AZ 故障后的容量实测。',['elasticity','k8s-autoscaling','cloud-compute']],
 ['C9','SRE 与恢复','有 SLI/SLO、观测、故障推理、变更和 RPO/RTO；本地验证部分数学与状态。','真实 oncall、跨区演练和大型横向项目经验仍需个人交付证据。',['slo','observability','incident','resilience']]
];
function cloudCoverageGuide(){
 const path=(ids)=>ids.map(id=>'<a href="/module/'+id+'/">'+moduleFor(id).n+' '+moduleFor(id).name+' →</a>').join('');
 return '<section class="cloud-coverage-intro"><h2>当前覆盖了知识骨架，岗位深度还要分方向</h2><p>Cloud 正文按九个实际领域组织，前置基础独立收纳。知识点、机制详解、本地实验、真实环境和资深项目经验是不同层次。下表逐项记录现有深度与缺口，不用章节数量推算面试覆盖率。</p></section>'+
 '<section class="cloud-role-paths"><h2>按目标岗位选择深入路径</h2><section><h3>Cloud / SRE</h3><p>前置：主力语言、Linux、网络与数据库。主线掌握资源、数据路径、编排、发布、容量与事故响应；Serverless 按岗位需求补充。</p><div class="path-links">'+path(['compute','network','cloud-data','native','cloud-delivery','cloud-capacity','sre'])+'</div><p><b>过关证据：</b>定位一个真实故障，写清止损和恢复条件，给出用户结果与复盘改进。</p></section><section><h3>云原生平台研发</h3><p>前置：Go/C++ 等主力语言、并发、Linux。重点深入 API、控制器、调度、网络/存储接口与多租户；需要写出可重试的控制逻辑。</p><div class="path-links">'+path(['native','network','cloud-data','cloud-delivery','cloud-security','cloud-capacity'])+'</div><p><b>当前缺口：</b>client-go/Operator、etcd 一致性与规模化控制面性能的完整实现课。</p></section><section><h3>IaaS、网络、存储与站点架构专项</h3><p>从计算、网络或存储选一条深入到实现、性能和故障域，再组合容量、安全与可靠性。资深架构岗位还需要跨团队交付和可量化治理结果。</p><div class="path-links">'+path(['compute','network','cloud-data','cloud-security','cloud-capacity','sre'])+'</div><p><b>当前缺口：</b>虚拟化、路由与存储内核等专项，以及跨 Region/AZ 的真实治理经验。通用指南不能代替这些深度。</p></section></section>'+
 '<section class="coverage-matrix"><h2>知识领域、现有证据与待补深度</h2>'+trainingTable(['领域','知识与证据','仍要补什么','进入正文'],cloudCoverageRows.map(([number,title,have,gap,ids,unit])=>[number+'<br>'+title,have,gap,(cloudModulePlan.find(row=>row[1]===number)?'<a href="/module/'+cloudModulePlan.find(row=>row[1]===number)[0]+'/">完整系统知识 →</a><br>':'')+ids.map(id=>readLink(id,articleById(id).title)).join('<br>')+(unit?'<br>'+unitLink(unit,'限时编码'):'')]))+'</section>'+
 '<section class="cloud-role-sources"><h2>本轮复核的三份官方岗位</h2>'+cloudRoleSources.map(role=>'<article><h3><a href="'+role.url+'" target="_blank" rel="noopener">'+role.name+' ↗</a></h3><p>'+role.type+' · '+role.date+'</p><p>'+role.skills+'</p>'+(role.data?'<p><a href="'+role.data+'" target="_blank" rel="noopener">官方岗位正文数据 ↗</a></p>':'')+'</article>').join('')+'<p class="evidence-note">核对于 2026-11-04。JD 用于确认工作要求；它们不是考题清单，资历与批次也不能混为一类。'+unitLink('experiences','公开面经另看来源索引')+'</p></section>'+
 '<p class="path-links"><a href="/track/cloud/">直接读 Cloud 系统知识 →</a><a href="/resources/#cloud">按缺口选课程、文档与视频 →</a></p>';
}
interviewUnits.cloud=['Cloud 岗位要求与知识深度','把前置基础、实际领域、岗位重点和验证缺口分别看清楚。'];
