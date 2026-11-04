/* Original exercises derived from a review of teaching methods, not employer question claims. */
const researchLessonIds=['gpu-memory','model-serving','inference-performance','agent-runtime','agent-evaluation'];
function researchLessonSection(id,title,html){const a=articles.find(x=>x.id===id),s=a.sections.find(x=>x[0].includes(title));if(!s)throw Error('Missing research revision '+id+'/'+title);s[1]+=infraReadableHTML(html);a.updated='2026.11.04';}
Object.assign(sources,{
 v18Prefix:['vLLM · 自动前缀缓存与块引用','https://docs.vllm.ai/en/latest/design/prefix_caching/'],
 v18DistServe:['DistServe · 预填充与解码拆分（OSDI 2024）','https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin'],
 v18Deadlocks:['MySQL 8.4 · InnoDB死锁处理','https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks-handling.html']
});
const prefetchLifetimeLesson=knowledgeSubhead('把预取放进同一张显存时间线')+
 para('另设一组只计算缓冲寿命的题：单rank常驻4GiB，已经包含本地分片；A组计算另需1GiB完整缓冲，B组另需0.5GiB。两个缓冲与常驻区不共用存储，暂不计激活和其他开销。它不是前面16GiB峰值账本，也不表示某个FSDP版本必然这样分配。')+
 figure('v18-fsdp-buffer-lifetime','常驻状态相同，缓冲重叠改变峰值。题设容量5.25GiB：顺序执行最高5GiB，提前预取最高5.5GiB。')+
 table(['动作','先释放再申请','A未释放便预取B'],[['初始','4GiB','4GiB'],['收齐A','4+1=5GiB','4+1=5GiB'],['准备B','先释放A，再申请B：4.5GiB','A与B同时存活：4+1+0.5=5.5GiB'],['完成','释放B回到4GiB','依次释放A、B，回到4GiB']])+
 para('5.25GiB预算下，第一种安排通过，第二种超出0.25GiB。增加预取可能遮住通信，也可能先造成OOM；要同时看按rank的分配时间线与步耗时。FSDP的收齐粒度、释放、重分片和预取策略共同决定真实峰值，静态分片表只解释常驻项。')+
 '<details class="knowledge-check"><summary>追问：把B缓冲改成0.2GiB，会怎样？</summary>'+para('顺序最高仍为5GiB；重叠最高5.2GiB，按本题简化账可放入5.25GiB。但这不证明真实GPU能运行，也不证明预取更快；还需把省略项和实际重叠收益测出来。')+'</details>';
infraDomain('training').points.find(p=>p.id==='tr-sharding').body+=prefetchLifetimeLesson;
researchLessonSection('gpu-memory','根据失败阶段',prefetchLifetimeLesson);

const sharedPrefixLesson=knowledgeSubhead('两条请求怎样共享同一块KV')+
 para('本题把块长改成4个位置，每位置仍按128KiB计算，所以每块512KiB。A=[1,2,3,4,5,6]，B=[1,2,3,4,7,8]，两条都已完整前向处理；权重、位置规则、适配器与允许复用域相同，首块已登记。只共享完整的前四个位置，两个未满尾块各自持有。')+
 figure('v18-kv-shared-blocks','两条逻辑序列共12个位置；相同完整前缀只存一份，物理占用由4块降到3块。A结束后，共享块仍有B持有。')+
 table(['账本','独立分配','共享首块'],[['每条逻辑位置','A6、B6，共12','仍为12'],['物理块','2+2=4块','1共享+2私有=3块'],['已分配字节','4×512=2048KiB','3×512=1536KiB'],['实际保存的唯一KV位置','12个','4+2+2=8个'],['未使用槽位','两尾块各2，共4','仍为4']])+
 para('A结束时，共享块活动引用数从2减到1，仍不能覆盖B的数据。引用归零表示没有活动持有者，不代表缓存索引已经删除；是否继续保留以便后续命中、何时驱逐，由具体缓存策略决定。空闲可回收、哈希仍可查和请求正在引用，是不同状态。')+
 para('B若换了适配器、位置语义或隔离域，不能只因文本前四项相同就复用。对后续块还要考虑前缀上下文；相同的块内token接在不同前缀后，KV也可能不同。跨租户允许共享与否由可信隔离策略决定，不能让模型正文自行声明。')+
 '<details class="knowledge-check"><summary>追问：共享能让Decode跳过全部历史读取吗？</summary>'+para('不能。它节省重复前缀计算与物理存储；各自的新查询仍要读取所需历史KV。共享物理块与减少每步计算不是同一项收益。')+'</details>';
infraDomain('platform').points.find(p=>p.id==='sv-kv').body+=sharedPrefixLesson;
researchLessonSection('model-serving','三种优化',sharedPrefixLesson);
articles.find(a=>a.id==='model-serving').refs.push('v18Prefix');
infraDomain('platform').refs.push('v18Prefix','v18DistServe');

const pdTransferLesson=knowledgeSubhead('拆开预填充与解码，先给交接算下界')+
 para('沿用每位置128KiB，4096个已处理位置要搬128KiB×4096=512MiB=536870912字节。固定题设：跨机链路按有效载荷25GB/s，GB为十进制；交接完全串行、不压缩、不复用，不能与计算重叠，暂忽略启动和协议开销。')+
 table(['同一观测点到第二个输出','25GB/s','12.5GB/s'],[['理想交接时间','536870912/(25×10⁹)≈21.47ms','约42.95ms'],['共置基线100ms；拆池去掉30ms排队','100−30+21.47≈91.47ms','100−30+42.95≈112.95ms'],['判断','下界更低，有改善机会','即使理想下界也超过原100ms']])+
 para('第一列不证明真机快8.53ms：新队列、同步、复制和完成确认都可能继续加时。第二列则在这些固定条件下已足以否定“只要拆池就更快”。若支持分块传输或计算重叠，需重画关键路径，不能继续把全部交接时长都作为串行增量。')+
 para('还要说明输出来自哪里。若首词元先由预填充侧返回，交接可能主要拉长首个与第二个输出之间的间隔，不能把21.47ms机械加到TTFT上。比较时固定硬件总预算、请求长度分布、质量和负载，同时看两池队列、TTFT、输出间隔与达标交付率。')+
 '<p><a href="https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin" target="_blank" rel="noopener">继续读DistServe的工作负载、放置与测量条件 ↗</a></p>';
infraDomain('platform').points.find(p=>p.id==='sv-batching').body+=pdTransferLesson;
researchLessonSection('inference-performance','Prefill与Decode',pdTransferLesson);
articles.find(a=>a.id==='inference-performance').refs.push('v18DistServe');

const agentFailureLayers=knowledgeSubhead('凭据失败、业务拒绝与结果未知，恢复动作不同')+
 table(['教学观测：已确认的边界','工具是否进入','效果能否判定','下一步'],[['令牌不属于此资源服务，入口在调用前拒绝','未进入','本次调用没有业务效果','修正凭据与受众；不把它记为工具执行失败'],['凭据通过，但A主体请求修改B资源；对象授权拒绝','未进入写动作','本次写次数0','保持拒绝，核查目标和真实委托'],['合法查询进入工具，按契约确认资料不存在','进入','已知业务失败；本题无写入','修正资料范围或返回证据不足'],['工具已提交，回执到达前连接断开','进入','运行时尚不能确认最终结果','从原意图找K1，经授权查回执或同键重试']])+
 para('这些是判断边界的题设，不是一次OAuth/MCP实测。只看到HTTP错误码，未必足够知道工具走到哪一步。第四种情况不能换新键盲写；恢复查询也要按当前身份重新检查权限。可信审批或签名能证明谁批准/声明了什么，动作是否真正提交还要看效果接收方的记录。');
researchLessonSection('agent-runtime','画出执行边界',agentFailureLayers);

function cloudAZDesignExercise(){return '<section class="design-workshop" id="cloud-az"><h2>Cloud设计：三个可用区，为什么总容量够仍扛不住故障？</h2>'+para('本站原创，建议先用15分钟独立作答。用户要求授权查询在500ms内完成；正常输入90次/秒。题设每个应用副本可在这一时延目标下承接40次/秒，三个可用区，失去任意一个区后仍要承接原输入。以下容量都是题设，不是真实集群测量。')+
 '<ol><li>先画入口、身份校验、应用和数据库；明确数据库、缓存与入口是否也承受该故障。</li><li>比较副本布局1/1/1、2/1/1、2/2/1，分别算正常容量和失去最大区后的容量。最少几个副本？</li><li>容量足够之后，怎样证明故障发现、摘除、切流与查询真的完成？如果数据库只有一个写主，还缺什么设计？</li></ol>'+
 '<details class="interview-extra"><summary>展开容量推导、图和验收条件</summary>'+figure('v18-az-capacity','正常总容量不是故障后容量。失去最大区后，前两种布局剩80次/秒；2/2/1剩120次/秒。')+
 table(['副本布局','正常容量','失去最大区后','与90次/秒比较'],[['1/1/1','120次/秒','80次/秒','缺10次/秒'],['2/1/1','160次/秒','80次/秒','仍缺10次/秒'],['2/2/1','200次/秒','120次/秒','容量条件通过']])+
 para('故障后至少要ceil(90/40)=3个副本。4个副本放进3个区，最大区至少有2个，失去它最多剩2个，因此4个不够。5个按2/2/1分布，失去任一区至少剩3个，构成一个可行的容量下限。若每区都放2个，总数6也可行，但不是本题最少。')+
 para('这只在存活副本可均匀分流、性能仍满足题设、后端和入口可用、切流已经完成时成立。故障发现和重试会制造短时额外负载；剩余120次/秒不保证任意突发都能在500ms内结束。实际SLO还需固定有效请求分母、窗口与错误分类后验证。')+
 table(['追加观测','该怎样验收'],[['应用副本Ready，数据库写主却在故障区','应用绿灯不能证明查询成功。核对数据副本、确认点、写主隔离与授权查询'],['故障后立即重试全部请求','给重试设预算、退避与幂等；检查重试放大是否用掉余量'],['流量已切到存活区','观察实际后端分布、队列、错误和达标查询，不能只看控制器期望状态']])+
 '<p>自评四项：推出5副本下限；明确故障域；区分容量与实际SLO；给出切流后的用户结果证据。'+readLink('resilience','复习恢复边界')+' '+readLink('slo','复习有效事件分母')+'</p></details></section>';}
const trainingDesignBeforeResearch=designInterviewWorkshop;
designInterviewWorkshop=()=>infraReadableHTML(cloudAZDesignExercise())+trainingDesignBeforeResearch();
interviewUnits.design=['系统设计 · 容量、故障域与恢复','先完成三区查询服务的容量推导，再设计可恢复的训练平台；每题都给约束、追问与验收。'];

function databaseWaitGraphExercise(){return '<section class="workshop-body" id="wait-graph"><h2>继续追问：锁等待很久，就一定死锁了吗？</h2>'+para('本站原创教学时间线，假设行17与42都是单实例排他锁。箭头约定“等待者→持有者”。这不是前面SQLite实验的运行输出，也不是已经执行的InnoDB实验。')+
 table(['记录','持锁与请求','等待图'],[['甲：T1持有17，T2等17；T1不等其他锁','T2→T1','只有一条边'],['乙：T1持有17并等42；T2持有42并等17','T1→T2，T2→T1','本题形成等待环']])+
 '<details><summary>展开判断与失败边界</summary>'+para('甲可能很慢，但从这些证据看没有环；T1提交或回滚释放锁后，T2有机会继续。乙双方都在等对方释放单实例排他锁，满足本例死锁；数据库选择受害者后，应按实际回执处理并准备重试整个事务。图本身不能指定一定牺牲T1或T2。')+
 para('若两者都先锁17再锁42，本例的反向等待环消失；不能据此宣称系统永远不会死锁，还需检查其他索引、范围锁与访问路径。重试应受截止时间和次数限制。若事务里还调用了库外工具，数据库回滚不会撤销已提交的外部效果，须另外核对稳定操作键与回执。')+
 '<p><a href="https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks-handling.html" target="_blank" rel="noopener">MySQL 8.4官方：避免与处理死锁 ↗</a> · '+readLink('concurrency-pools','复习锁顺序')+'</p></details></section>';}
const databaseWorkshopBeforeResearch=databaseInterviewWorkshop;
databaseInterviewWorkshop=()=>databaseWorkshopBeforeResearch()+infraReadableHTML(databaseWaitGraphExercise());

function podEvidenceExercise(){return '<section class="quality-section" id="pod-evidence"><h2>先判断，再打开下一份证据</h2>'+para('本站原创合成观测。先只给你Pod阶段Pending：它一定还没被调度吗？写下一项能区分解释的证据，再展开。')+
 '<details><summary>证据一：PodScheduled=True，nodeName=node-a，容器等待ImagePullBackOff</summary>'+para('Pod已绑定节点；继续检查镜像引用、认证、网络和节点事件。Pending还可覆盖启动准备期，不能等同于调度失败。ImagePullBackOff描述重试状态，仍需找具体拉取失败原因。')+
 '<details><summary>证据二：UID=p-17未变，app容器restartCount由0变1</summary>'+para('同一Pod中的指定容器重启了一次。检查上一轮退出原因和日志；这不能证明Pod被替换。')+
 '<details><summary>证据三：原UID=p-17，补建对象UID=p-28</summary>'+para('这是新Pod对象，即使标签和控制器相同也不是原来的Pod。关联所属ReplicaSet和事件，再比较删除、驱逐或发布路径。')+'</details></details></details><p>'+readLink('k8s-workloads','读容器状态与控制器')+' '+readLink('kubernetes-basics','读Pod生命周期')+'</p></section>';}
const problemsBeforeResearch=problemsPage;
problemsPage=()=>{problemsBeforeResearch();const app=$('#app');app.innerHTML=app.innerHTML.replace('<div class="problem-list">',infraReadableHTML(podEvidenceExercise())+'<div class="problem-list">');};

const interviewFollowUps=[
 ['共同底座','一次读取不等于一条消息','TCP收的是字节流。先声明长度头、分隔符或协议边界；read返回量不承诺对应一次send。','连接半关闭后还能回包吗？接口超时能否证明服务端没提交？','分别画字节解析、收写两方向、业务提交与回执；给下一项可区分证据。',['network-diagnosis','agent-recovery']],
 ['Cloud / 数据','查五行很慢，换索引就够了吗？','先比较过滤、排序和访问计划，再区分查询慢与事务仍看旧快照。','只看到锁等待时，哪条边能证明形成死锁？','画等待者到持有者的图；把单向等待与成环分开。',['database-index-locks','concurrency-pools']],
 ['Cloud / SRE','三个可用区为什么还会容量不足？','先算失去最大区后的容量，再核对数据库和入口是否也能承受故障。','加第四个副本，90次/秒就能承接了吗？','推得2/1/1仍剩80次/秒，2/2/1才达到本题容量条件。',['resilience','slo']],
 ['AI / 训练','FSDP常驻状态能放下，为什么还OOM？','计算参数收齐、激活和预取在同一时刻的存活量。','同样常驻4GiB，预取为何把峰值5改成5.5GiB？','画A/B缓冲申请与释放；分清预算模型与GPU实测。',['gpu-memory','distributed-training']],
 ['AI / 推理','共享KV、拆分P/D，究竟省了哪项？','共享块节省重复存储；P/D拆分改变资源池与排队，但新增交接。','一个请求结束能覆盖共享块吗？带宽减半时拆池还划算吗？','核引用数2→1，手算512MiB在25/12.5GB/s下的21.47/42.95ms。',['model-serving','inference-performance']],
 ['Agent / 验收','报告正确落库，就算任务成功吗？','同时核对实际产物、来源、对用户的状态，以及不允许发生的访问。','金额37与引用正确，对用户却报已拒绝，应得几分？','四个固定用例应为3/4，报告1行，合格业务任务0；再跑状态反例。',['agent-evaluation','agent-security']]
];
function interviewFollowUpHTML(){return '<section class="quality-section" id="follow-up"><h2>把一道题答到能继续追问</h2>'+para('以下六组由本站原创，借鉴开源项目的讲解与练习方法。先用一分钟作答，再打开追问；具体公司实际问法仍以下方候选人原帖为证。')+interviewFollowUps.map(([role,title,first,follow,gate,ids])=>'<details class="experience-question research-followup"><summary><span>'+role+'</span>'+title+'</summary><div>'+para('<b>第一层：</b>'+first,'<b>条件变化：</b>'+follow,'<b>过关证据：</b>'+gate)+'<div class="path-links">'+ids.map(id=>readLink(id,articleById(id).title)).join('')+'</div></div></details>').join('')+'<p><a href="/resources/#github-projects">查看本轮精读的GitHub项目与样章 →</a></p></section>';}
const experienceGuideBeforeResearch=interviewExperienceGuide;
interviewExperienceGuide=()=>infraReadableHTML(interviewFollowUpHTML())+experienceGuideBeforeResearch();

function githubResearchHTML(){const groups={common:'计算机基础与面试表达',cloud:'Cloud、SRE与系统设计',ai:'训练、推理与性能',agent:'Agent执行、授权与评估'};return '<section class="resource-track" id="github-projects"><h2>GitHub项目：该看哪里，学完验证什么</h2>'+para('本轮精读15个原仓库的目录、代表样章或实现，核对日期2026-11-04。下面推荐的是学习方法与阅读入口；课程、作者整理、官方SDK与候选人面经分别看待，项目中的“高频”标签不等于公司的出题统计。')+Object.entries(groups).map(([group,title])=>'<details class="research-group"'+(group==='common'?' open':'')+'><summary>'+title+' · '+githubStudyProjects.filter(p=>p.group===group).length+'项</summary>'+githubStudyProjects.filter(p=>p.group===group).map(p=>'<article class="resource-row research-project"><div class="resource-meta"><span>'+p.kind+'</span><span>'+p.language+'</span></div><h3><a href="'+p.url+'" target="_blank" rel="noopener noreferrer">'+p.repo+' ↗</a></h3><p><b>值得学</b>'+p.strength+'</p><p><b>在本站怎么练</b>'+p.adoption+'</p><div class="path-links">'+p.samples.slice(0,2).map(s=>'<a href="'+s.url+'" target="_blank" rel="noopener noreferrer">'+s.title+' ↗</a>').join('')+'</div><details><summary>样章快照与适用范围</summary><p>'+p.boundary+'</p><p class="evidence-note">阅读链接固定到本轮核对的提交。完整来源与许可记录见<a href="https://github.com/CaptainGreenskin/infra-guide/blob/main/docs/GITHUB_RESEARCH_2026-11-04.json" target="_blank" rel="noopener">调研记录 ↗</a>。</p></details></article>').join('')+'</details>').join('')+'</section>';}
