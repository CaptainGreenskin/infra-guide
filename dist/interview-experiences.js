// Public candidate recollections; summaries are paraphrases, answer criteria are original.
const publicInterviewSamples = [
 {id:'t1',company:'腾讯',title:'腾讯运维面经 oc了，可以开摆了',role:'运维 / 数据库相关；招聘类型未明确',url:'https://www.nowcoder.com/feed/main/detail/a3e49f06e6b34c8abd60edd2cd0f2f1d',date:'首发 2024-03-29 · 编辑 2024-04-15',interview:'正文记一面 3/28、二面 3/29、三面 4/2、HR 4/9',questions:[
 ['Pod 排障','Pod 一直不能启动，先从哪里定位？','k8s-workloads','先区分未调度、镜像未就绪、进程退出和探针失败；分别找 Events、containerStatuses、上一次容器日志。','延伸：Pod 已 Running，为什么 Service 仍可能没有可用端点？'],
 ['Linux 文件系统','删掉大文件，磁盘空间为何没有如期释放？','linux-resource','区分文件名、inode、打开的文件描述符；对比 df 与 du，用 lsof +L1 寻找仍被进程引用的已删除文件。先确认持有者，再决定如何释放。','延伸：文件名消失后，原进程能否继续写？如何证明实际释放了空间？'] ]},
 {id:'t2',company:'腾讯',title:'我的 2024 暑期实习面经 · 腾讯 TEG 网络研发部小节',role:'网络研发 · 暑期实习',url:'https://alrisha.cn/2024/05/97feaabb.html',date:'发布 2024-05-01 · 页面更新 2026-01-01',interview:'该小节明确一面 2024-03-11；与下方阿里 ECS 样本来自同一作者、同一文章',questions:[
 ['事件驱动 I/O','比较 select、poll、epoll，并说明 ET 与 LT。','network-diagnosis','解释就绪通知与实际读写的关系，指出 ET 通常配合非阻塞读到 EAGAIN；不能把 epoll 等同于异步完成通知。','延伸：一次没有读完，下一次一定还会收到通知吗？'],
 ['网络设计','高并发网络服务怎么设计？Docker 的网络模式如何区分？','k8s-networking','先约束连接数、消息大小、活跃比例与延迟；画连接接入、事件循环、业务执行和回包。容器网络模式要回到地址、命名空间及路由。','延伸：慢客户端会占住哪些队列与缓冲？'] ]},
 {id:'t3',company:'腾讯',title:'腾讯CSIG腾讯云后端一面面经',role:'腾讯云后端 · 正式岗位语境，批次未明确',url:'https://www.nowcoder.com/feed/main/detail/5cffed50c9e0408ca074ae2fc84ba69f',date:'首发 2025-11-01 · 无独立编辑日',interview:'作者记 2025 年 10 月面试，未给具体日',questions:[
 ['数据结构','实现可在常数时间压入、弹出、查询最大值的栈。','concurrency-pools','维护元素栈与同步的前缀最大值；重复最大值必须保留足够计数或逐层记录。先声明空栈行为，再给时间与空间复杂度。','本站延伸：加入并发调用后，两个栈之间要维护什么不变量？'],
 ['消息系统','Kafka 的实现与 leader 选举怎样解释？','distributed-systems','先确认讨论的是分区副本 leader 还是集群元数据控制器，以及版本与部署模式。分别说明日志、同步副本和提交条件。','延伸：副本追上、客户端收到确认、消息持久化是同一时刻吗？'] ]},
 {id:'t4',company:'腾讯',title:'腾讯——技术运维实习一面',role:'技术运维 · 实习；团队未披露',url:'https://www.nowcoder.com/feed/main/detail/d72f7495d00d4b08a73b6162c0c96ffc',date:'首发 2026-04-26 · 无独立编辑日',interview:'面试具体日未给出；与 t5 为同一公开作者',questions:[
 ['组件与调度','kube-proxy、scheduler 各做什么？节点亲和是必须还是优先？','scheduling-resources','scheduler 为未绑定 Pod 选择节点；服务转发由实际数据面实现。required 影响可行节点集合，preferred 影响候选评分；空闲资源不能覆盖硬约束。','延伸：亲和条件无可行节点时，增加原有类型节点有用吗？'],
 ['持久化','项目里 Kafka 的 PVC 回收与元数据丢失怎样处理？','k8s-storage','先还原 PVC、PV、底层卷和 reclaimPolicy 的生命周期；确认是删 claim、删卷还是挂错数据。保留卷不等于已备份，也不等于数据库恢复一致。','延伸：如何给出一次实际恢复验证，而不是只修改为 Retain？'] ]},
 {id:'t5',company:'腾讯',title:'腾讯云智-技术运维实习面经',role:'腾讯云智 · 技术运维实习',url:'https://www.nowcoder.com/feed/main/detail/ec6ec908bade410db2c81f9c8a8ecbbc',date:'首发 2026-05-20 · 编辑 2026-05-28',interview:'正文记一面 4/28、二面 5/8（2026）；与 t4 同作者',questions:[
 ['现场脚本','备份最近一周的日志，文件按日期命名。','delivery','先约定时区、时间字段、开闭区间和目录范围；处理空结果、空格文件名、重复运行、部分归档失败。不能只给一条未定义“最近”的 find 命令。','本站延伸：以固定时间作为输入，为午夜、夏令时和重试写边界样例。'],
 ['可观测设计','200 台机器原先没有监控，怎样用一个月建体系？','observability','先列用户服务与资产，再落地采集、标签、保留与告警接收；按发现问题的价值分阶段交付。区分主机活着与业务正常，并验证告警有人响应。','延伸：第一周交付什么？怎样避免两百台机器同时制造重复告警？'] ]},
 {id:'a1',company:'阿里',title:'阿里云技术线-SRE技术部-运维开发工程师 一面',role:'SRE / 运维开发；招聘类型未明确',url:'https://www.nowcoder.com/feed/main/detail/34b4be90be8a400ab03712d2d1dbb830',date:'原页显示 05-12 17:11 · 年份未核实',interview:'未另给面试日期；不归入某一届校招统计',uncertain:true,questions:[
 ['项目交付','自己的项目如何部署？本地运行环境是什么？','delivery','从构建产物、配置、身份、依赖与数据库契约解释部署；明确本人做过哪一步。能复现某个版本，并说明怎么判断上线正确。','延伸：换一台干净机器，哪些隐式依赖会导致失败？'],
 ['现场实现','用熟悉的语言采集网卡信息，再按指定格式输出。','network-diagnosis','先界定操作系统、可用接口、字段来源和权限；网卡标称速率、协商速率与当前吞吐分别展示。不把虚拟设备缺字段当作零。','本站延伸：把字段缺失、设备断开与命令失败作为不同输出。'] ]},
 {id:'a2',company:'阿里',title:'阿里云暑期实习java后端面经',role:'Java 后端 · 暑期实习；多个部门以字母匿名',url:'https://www.nowcoder.com/feed/main/detail/7b4c0a7a695f42e3be2bd0d8649f3748',date:'页面编辑 2025-03-03',interview:'正文记 02-20、02-21、02-26、02-28 各轮',questions:[
 ['故障域设计','三 AZ 架构怎样落地，跨机房的服务与 MQ broker 怎样选路？','resilience','画出流量入口、应用副本、数据仲裁与同步边界；计算失去一个 AZ 后的剩余容量。就近访问不能代替副本一致性与故障切换规则。','延伸：网络分区而非整个机房断电时，谁仍可写？'],
 ['容器使用','实际怎样使用 Kubernetes 和 Docker？','container-runtime','从镜像构建到容器进程，再到 Pod、控制器与发布，说出具体交付物。能解释在哪层查看日志、资源、退出与健康。','延伸：同一个镜像在本地正常，到集群里为什么可能失败？'] ]},
 {id:'a3',company:'阿里',title:'我的 2024 暑期实习面经 · 阿里云 ECS 小节',role:'ECS 弹性计算 · 暑期实习',url:'https://alrisha.cn/2024/05/97feaabb.html',date:'发布 2024-05-01 · 页面更新 2026-01-01',interview:'该小节一面 2024-03-02；与 t2 共用一篇原文',questions:[
 ['并发执行','结合项目，解释自己对协程的理解。','concurrency-pools','区分任务、用户态调度、内核线程与阻塞点；说明运行时如何让任务让出执行机会。异步 API 不自动让 CPU 密集工作并行。','延伸：在事件循环里做一次阻塞调用，会影响哪些任务？'] ]},
 {id:'a4',company:'阿里',title:'【暑期实习】阿里云 AI infra一面复盘',role:'AI Infra · 暑期实习',url:'https://www.nowcoder.com/discuss/872458402981560320',date:'首发 2026-04-11 · 同日编辑',interview:'面试具体日未给出；发帖日不替代面试日',questions:[
 ['性能归因','项目里怎样判断先优化单个算子，还是做算子融合？','roofline-model','对齐输入形状、数值语义与正确性，再看耗时、启动间隙、访存和中间张量。融合可能减少 IO，也可能增加寄存器压力，结论要由同口径剖析支持。','延伸：单算子更快，为什么端到端可能不变甚至变慢？'],
 ['精度与累加','权重、激活与累加为何采用不同精度？','gpu-memory','分别计算存储、乘法范围与累加误差；量化格式、缩放粒度和累加类型不能混称。用小矩阵误差与模型质量共同验证。','延伸：降低权重位宽，能否保证运行时峰值显存同比下降？'] ]},
 {id:'a5',company:'阿里',title:'阿里云（serverless平台）面经（如果有后续会更新）',role:'函数平台 · 招聘类型未明确',url:'https://www.nowcoder.com/discuss/353156401667186688',date:'页面编辑 2020-05-01 · 历史样本',interview:'记述函数平台一面；不作为近年题型证据',historical:true,questions:[
 ['容器网络','怎样解释 Docker 的容器网络？','k8s-networking','从网络命名空间、接口、路由与地址转换解释隔离及回程；明确当前模式，不将 bridge、host 和 overlay 混为一条固定路径。','延伸：函数实例和普通容器部署在责任边界上有什么差别？'],
 ['镜像故障','是否遇到过拉取容器镜像失败？','container-runtime','下面是本站补充排查框架：确认镜像引用、平台架构、registry 解析与连接、认证、配额和节点磁盘，再按事件核实。','延伸：ImagePullBackOff 是重试状态，还是唯一根因？'] ]},
 {id:'b1',company:'字节',title:'字节-机器学习平台-编排调度 一面',role:'机器学习平台编排调度 · 2025 秋招',url:'https://www.nowcoder.com/feed/main/detail/4424b426b7b24f6ea46461dcbf1842fd',date:'首发 / 编辑 2024-07-23',interview:'作者记面试 2024-07-23',questions:[
 ['容器机制','解释联合文件系统、namespace、cgroup 怎样组成容器。','container-runtime','分开回答镜像/文件视图、可见范围与资源约束；普通容器共享宿主内核。还需能力集、系统调用与权限配置理解安全边界。','延伸：有独立 PID 视图是否就等于有独立内核？'],
 ['调度机制','介绍熟悉的 Kubernetes 组件，并解释资源怎样影响调度。','scheduling-resources','从待绑定 Pod、过滤、评分和绑定讲 scheduler；与 Linux 给线程分配 CPU 时间区分。requests 参与放置，运行时限制另由节点实施。','延伸：已经被绑定的 Pod，后续一定获得足够 CPU 吗？'] ]},
 {id:'b2',company:'字节',title:'字节后端一面面经-4.3',role:'后端实习 · 团队未披露，按简历追问调度',url:'https://www.nowcoder.com/feed/main/detail/79b8654b36f042c58584f6cc46961783',date:'首发 2025-04-03 · 编辑 2025-04-07',interview:'标题记 4.3；不推定为容器产品团队',questions:[
 ['容器出站','容器访问外部域名，返回包怎样回到原容器？','k8s-networking','依次画 DNS、路由、源地址转换及回程状态，注明网络模式。DNS 成功、TCP 建连和应用响应分别验证。','延伸：去程放通而回程路由错误，会留下哪些观察？'],
 ['依赖与调度','依赖图中同时有 CPU 密集和 I/O 密集节点，怎样安排执行？','concurrency-pools','先找满足依赖的就绪集合，再按资源、并发上限和背压选择。拓扑序只证明合法，不能单独证明执行时间最短。','本站延伸：先完成依赖排序编码题，再给资源上限与反例。'] ]},
 {id:'b3',company:'字节',title:'字节SRE一面',role:'SRE · 招聘类型未明确',url:'https://www.nowcoder.com/feed/main/detail/e2a502f37ad04bbabdb760e5925a1716',date:'首发 / 编辑 2025-11-26',interview:'面试具体日未给出',questions:[
 ['交付与流量','CI/CD 自动化、灰度发布与 Kubernetes 网络怎样解释？','k8s-workloads','这是同场数项提问的合并复习：沿构建、不可变产物、控制器、可用端点与入口流量走一次；副本占比与请求占比可能不同。','延伸：新版本健康而业务错误，如何停止并证明回退成功？'],
 ['数据库恢复','MySQL 高可用如何处理一致性、节点故障与恢复？','storage-recovery','先明确复制方式、确认点、写主身份与 RPO，再讨论提升副本和防止旧主继续写。用已确认交易与重复写的检查证明恢复结果。','延伸：提升副本后，客户端超时的上一笔交易如何核实？'] ]},
 {id:'b4',company:'字节',title:'字节火山方舟一面，项目被问得有点狠',role:'火山方舟机器学习平台研发 / 系统调度 · 秋招',url:'https://www.nowcoder.com/discuss/921927475611869184',date:'首发 2026-08-26 · 编辑 2026-08-27',interview:'作者记面试 2026-08-26；文中预想的 GPU/Gang/RDMA 题未作为实际提问收录',questions:[
 ['沙箱容错','Agent 调用沙箱时，执行中崩溃怎样处理？','agent-sandbox','区分执行进程、外部效果、回执与任务状态；先核实操作是否生效，再决定是否重试。沙箱隔离不能自动提供业务幂等。','延伸：崩溃前已完成外部写入，但回执未提交，如何避免重复效果？'],
 ['TCP 故障','连接建立后对端突然掉电，另一端会观察到什么？','network-diagnosis','空闲本身不一定立即产生通知；继续发送后的重传、TCP keepalive 与应用心跳取决于各自配置。用时间线说明何时超时。','延伸：连接未收到 FIN/RST，应用怎样在截止时间内作出决定？'] ]},
 {id:'b5',company:'字节',title:'后端/全栈面经一次性放出 · 字节云 AI算力基础设施段',role:'字节云 AI 算力基础设施 · 后端秋招',url:'https://www.nowcoder.com/discuss/932058602422956032',date:'首发 2026-09-22 · 编辑 2026-09-24',interview:'该岗位段落面试 2026-08-26；不混入相邻公司的问题',questions:[
 ['内存机制','使用虚拟内存时发生缺页，系统接下来做什么？','virtual-memory-oom','按地址是否合法、页表状态及是否需要 I/O 分支；缺页不等于 swap，更不等于 OOM。区分虚拟空间、驻留与容器记账。','延伸：匿名页第一次写入与文件映射缺页，成本可能怎样不同？'],
 ['现场缓存','实现固定容量、统一 TTL 的 LRU；优先清除过期项。','cache-consistency','先定义同一时间源、到期边界、更新是否续期及淘汰次序。哈希表加双向链表提供 LRU；过期索引的维护不能含糊成所有操作天然 O(1)。','本站延伸：使用可注入时钟，为重复更新、恰好到期和容量为零给测试。'] ]}
];

function interviewExperienceGuide() {
 const total=publicInterviewSamples.reduce((n,s)=>n+s.questions.length,0);
 const priorities=[
 ['P0 · 共用底座','Linux 执行、内存、文件；TCP/DNS；SQL 与缓存；一门语言与数据结构。','先闭卷画路径，再完成一次编码。', ['linux-resource','virtual-memory-oom','database-index-locks']],
 ['P0 · Cloud / SRE','容器隔离 → 控制器与调度 → Service 网络 → 持久化 → 发布与故障恢复。','能定位一个 Pod，画出回包路径，证明数据可恢复。',['container-runtime','k8s-workloads','k8s-networking','k8s-storage']],
 ['P1 · 平台深入','HPA 与节点容量、IAM、交付、Serverless 事件与 SLO。','能算容量与延迟，说明重试和扩缩容边界。',['k8s-autoscaling','serverless-execution','iam-security','slo']],
 ['按岗专项 · AI / Agent','AI 补计算图、显存、算子与通信；Agent 补权限、持久执行、沙箱与评估。','职位名含 AI 仍需底座；专项深度取决于岗位和项目。',['roofline-model','training-communication','agent-sandbox']]
 ];
 return '<section class="experience-intro"><p class="evidence-note">核对于 2026-11-04 · 候选人公开自述 · 题意转述</p><div class="experience-stats"><div><b>15</b><span>岗位样本</span></div><div><b>14</b><span>不同原文链接</span></div><div><b>'+total+'</b><span>复习问题组</span></div></div><p>样本覆盖腾讯、阿里、字节的运维、SRE、云后端、编排调度、AI Infra 与机器学习平台。主要发表于 2024–2026 年，另有一篇 2020 年函数平台历史记录、一篇年份未核实记录；同作者与共用原文均标明。</p><p>原帖支持“作者记述了这些问题”，没有雇主对现场的认证。下方答题要点与延伸练习由本站编写。样本用于确定复习顺序，不能推算出题频率、通过率或“大部分面试覆盖率”。</p></section>'+
 '<section class="experience-priorities"><h2>据此调整复习重点</h2><p>P0 / P1 是本站按依赖和迁移价值安排的学习优先级。</p>'+priorities.map(([level,title,gate,ids])=>'<section class="experience-priority"><small>'+level+'</small><h3>'+title+'</h3><p>'+gate+'</p><div class="path-links">'+ids.map(id=>readLink(id,articleById(id).title)).join('')+'</div></section>').join('')+'</section>'+
 '<nav class="experience-jumps" aria-label="公司样本">'+['腾讯','阿里','字节'].map((company,i)=>'<a href="/interview/experiences/#company-'+i+'">'+company+' · 5 个岗位样本 ↓</a>').join('')+'</nav>'+
 ['腾讯','阿里','字节'].map((company,i)=>'<section class="company-experiences" id="company-'+i+'"><h2>'+company+' · 按原帖所属岗位复习</h2>'+publicInterviewSamples.filter(s=>s.company===company).map(s=>'<article class="experience-source" id="sample-'+s.id+'"><div class="experience-source-top"><span>'+s.id.toUpperCase()+' / 候选人自述'+(s.historical?' · 历史样本':s.uncertain?' · 年份未核实':'')+'</span><a href="'+s.url+'" target="_blank" rel="noopener noreferrer">查看原帖 ↗</a></div><h3>'+s.title+'</h3><p class="experience-role">'+s.role+'</p><p class="evidence-note">'+s.date+'<br>'+s.interview+'</p>'+s.questions.map(([topic,prompt,id,points,extension],n)=>'<details class="experience-question"><summary><span>'+topic+'</span>'+prompt+'</summary><div><p><b>本站答题要点：</b>'+points+'</p><p>'+extension+'</p>'+(s.id==='t3'&&n===0?'<a href="/interview/coding/#max-stack">最大栈：实现、复杂度与边界 →</a>':readLink(id,'补对应机制：'+articleById(id).title))+(s.id==='b2'&&n===1?' '+unitLink('coding','先做依赖排序'):'')+'</div></details>').join('')+'</article>').join('')+'</section>').join('')+
 '<section class="quality-section"><h2>怎样使用这份索引</h2><ol><li>先不展开答案，用两分钟作答，再画状态、请求或数据路径。</li><li>展开本站要点，区分自己缺的是概念、推导、代码，还是实操证据。</li><li>跳转对应章节，完成练习；次日换条件再讲一次。</li></ol><p>岗位职责另见'+unitLink('companies','官方招聘样本')+'。Serverless 在本批近年面经证据较少，仍按平台知识补齐；本站没有将普通容器问题改标为近年 Serverless 真题。当前材料以实习和校招为主，招聘类型不明的保持原样，不能据此代表社招深度。</p></section>';
}
interviewUnits.experiences=['公开面试题与复习重点','从腾讯、阿里、字节候选人的原帖，连接提问、机制章节与答题检验。'];

['virtual-memory-oom','concurrency-pools','database-index-locks','cache-consistency'].forEach(id=>foundationChapters.add(id));
['container-runtime','k8s-workloads','k8s-networking','k8s-storage','k8s-autoscaling','serverless-execution'].forEach(id=>focusChapters.add(id));
