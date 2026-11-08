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
 ['C2','云网络与协议','有 VPC、DNS、路由、NAT、入口、TCP/I/O 知识与时序实验。','BGP/IPv6、真实转发、MTU/conntrack 与大规模网络故障需深化。',['vpc-network','network-diagnosis','tcp-event-loop']],
 ['C3','存储、数据库与缓存','展开提交、undo/redo/binlog与PITR；真实MySQL容器验证恢复、RR/RC旧读、复制应用及两实例计划切换，另有SQLite与附件恢复。','MySQL实测限于隔离容器和计划切换；PostgreSQL、生产自动故障切换、物理断电与跨区恢复仍待目标环境。',['database-index-locks','cache-consistency','storage-recovery','mysql-recovery','mysql-replication']],
 ['跨域','分布式协调与消息','讲超时、幂等与事件确认；真实etcd三成员实验验证多数派与历史观察，RabbitMQ单节点验证提交后重投、过早ACK和业务效果。','Raft算法实现、Kafka/RocketMQ与再均衡仍需专项；同宿主etcd及单节点RabbitMQ不代表跨物理故障域高可用已验收。',['distributed-systems','message-delivery']],
 ['C4','容器与 Kubernetes','覆盖运行时、控制面、工作负载、调度、网络、存储、配置与弹性。Linux CI已实测容器约束、kind放置和etcd协调存储。','kind与etcd均为同宿主实验；多物理节点、云CNI/CSI、生产控制面恢复和Operator实现仍需专项。',['container-runtime','scheduling-resources','k8s-networking','k8s-storage']],
 ['C5','Serverless 与事件','展开执行环境、三种触发契约、部分批次响应、并发/下游与成本；真实进程退出和并发事务验证效果去重。','云函数、SQS 可见性/重驱、冷启动和真实伸缩尚未在供应商环境实测。',['serverless-execution']],
 ['C6','平台 API、IaC 与 GitOps','展开配置、状态与实物，以及源修订、集群对象、进程和业务结果；真实 Terraform 本地提供程序验证锁与漂移，Argo CD 在 kind 中验证自愈、清理与实际 HTTP 版本。','云提供程序、远端状态后端、client-go/Operator 实现及生产规模治理仍需专项；本地状态和单机 kind 有各自范围。',['delivery','terraform-state','gitops-reconciliation']],
 ['C7','身份、安全与多租户','展开认证、委托、授权及RBAC；原生ServiceAccount以同一凭证核对200→403→200，另有HMAC/HTTP与SQLite效果对照。','原生ServiceAccount与RBAC已在隔离kind验证；云IAM、准入策略、凭证投射/刷新与生产对抗隔离仍待目标环境。',['iam-security','agent-security','agent-sandbox']],
 ['C8','容量、性能与成本','展开同边界单位、积压守恒、准入、扩容关键路径、压测模型与单位成本；Fraction模型验证有限缓冲和排空。','模型不是压测；生产负载、完整账单归因与跨AZ故障后容量仍需实际交付证据。',['elasticity','k8s-autoscaling','cloud-compute']],
 ['C9','SRE 与恢复','展开请求加权SLI、多窗燃烧率、分布聚合、trace/日志、诊断与恢复；真实两段HTTP和promtool七组序列附源码证据。','未运行生产抓取、Alertmanager通知、真实oncall或跨区演练；规则求值不等于处置流程已验证。',['slo','observability','incident','resilience']]
];
function cloudCoverageGuide(){
 const path=(ids)=>ids.map(id=>'<a href="/module/'+id+'/">'+moduleFor(id).n+' '+moduleFor(id).name+' →</a>').join('');
 return '<section class="cloud-coverage-intro"><h2>当前覆盖了知识骨架，岗位深度还要分方向</h2><p>Cloud 正文按九个实际领域组织，前置基础独立收纳。知识点、机制详解、本地实验、真实环境和资深项目经验是不同层次。下表逐项记录现有深度与缺口，不用章节数量推算面试覆盖率。</p><p class="evidence-note">领域与实验证据更新于2026-11-08；岗位来源仍按各自核对日期记录。<a href="/labs/#labs-cloud">查看Cloud实验、源码与验证范围 →</a></p></section>'+
 '<section class="cloud-role-paths"><h2>按目标岗位选择深入路径</h2><section><h3>Cloud / SRE</h3><p>前置：主力语言、Linux、网络与数据库。主线掌握资源、数据路径、编排、发布、容量与事故响应；Serverless 按岗位需求补充。</p><div class="path-links">'+path(['compute','network','cloud-data','native','cloud-delivery','cloud-capacity','sre'])+'</div><p><b>过关证据：</b>定位一个真实故障，写清止损和恢复条件，给出用户结果与复盘改进。</p></section><section><h3>云原生平台研发</h3><p>前置：Go/C++ 等主力语言、并发、Linux。重点深入 API、控制器、调度、网络/存储接口与多租户；需要写出可重试的控制逻辑。</p><div class="path-links">'+path(['native','network','cloud-data','cloud-delivery','cloud-security','cloud-capacity'])+'</div><p><b>当前缺口：</b>client-go/Operator的完整实现与规模化控制面性能。</p></section><section><h3>IaaS、网络、存储与站点架构专项</h3><p>从计算、网络或存储选一条深入到实现、性能和故障域，再组合容量、安全与可靠性。资深架构岗位还需要跨团队交付和可量化治理结果。</p><div class="path-links">'+path(['compute','network','cloud-data','cloud-security','cloud-capacity','sre'])+'</div><p><b>当前缺口：</b>虚拟化、路由与存储内核等专项，以及跨 Region/AZ 的真实治理经验。通用指南不能代替这些深度。</p></section></section>'+
 '<section class="coverage-matrix"><h2>知识领域、现有证据与待补深度</h2>'+trainingTable(['领域','知识与证据','仍要补什么','进入正文'],cloudCoverageRows.map(([number,title,have,gap,ids,unit])=>[number+'<br>'+title,have,gap,(cloudModulePlan.find(row=>row[1]===number)?'<a href="/module/'+cloudModulePlan.find(row=>row[1]===number)[0]+'/">完整系统知识 →</a><br>':'')+ids.map(id=>readLink(id,articleById(id).title)).join('<br>')+(unit?'<br>'+unitLink(unit,'限时编码'):'')]))+'</section>'+
 '<section class="cloud-role-sources"><h2>本轮复核的三份官方岗位</h2>'+cloudRoleSources.map(role=>'<article><h3><a href="'+role.url+'" target="_blank" rel="noopener">'+role.name+' ↗</a></h3><p>'+role.type+' · '+role.date+'</p><p>'+role.skills+'</p>'+(role.data?'<p><a href="'+role.data+'" target="_blank" rel="noopener">官方岗位正文数据 ↗</a></p>':'')+'</article>').join('')+'<p class="evidence-note">核对于 2026-11-04。JD 用于确认工作要求；它们不是考题清单，资历与批次也不能混为一类。'+unitLink('experiences','公开面经另看来源索引')+'</p></section>'+
 '<p class="path-links"><a href="/track/cloud/">直接读 Cloud 系统知识 →</a><a href="/resources/#cloud">按缺口选课程、文档与视频 →</a></p>';
}
interviewUnits.cloud=['Cloud 岗位要求与知识深度','把前置基础、实际领域、岗位重点和验证缺口分别看清楚。'];
