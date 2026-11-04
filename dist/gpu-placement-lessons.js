/* Admission, feasible placement, coherent reservation and first useful update have distinct witnesses. */
const placementStages=infraReadableHTML(
 '<div class="mechanism-core" id="gpu-placement-stages">'+knowledgeSubhead('先拆五个事实：额度预留、获准、绑定、就绪、有效训练')+
 para('GPU作业提交后，队列先判断是否能占用相应资源额度，调度过程再找满足形状和硬约束的节点；运行时准备设备、镜像、卷和网络，训练成员完成会合后，才可能产生第一次有效更新。任一阶段失败，用户都可能只看到“还没开始”，平台必须报告具体阻塞点。')+
 table(['观察层','能证明的事实','仍不能推出'],[
 ['配额预留','账面留出了某类资源份额','具体节点和设备已分配'],
 ['Workload获准','所需准入条件在该控制器语义下满足','全部Pod已绑定/Ready'],
 ['PodScheduled/节点绑定','选择了节点','设备可用、卷可挂、成员能通信'],
 ['Ready/成员会合','相应就绪与成员条件通过','损失、梯度与优化器更新正确'],
 ['首个有效更新','按契约完成一次实际训练进展','检查点已持久提交或模型质量达标']])+
 para('这些不是五种统一的API状态名。Kueue的Workload条件、训练控制器状态和Pod条件来自不同对象，字段以目标版本为准。记录同一run、attempt、Pod UID、rank和时间，才能把“排队20分钟”分成等配额、等位置、等准备和等训练，而不是统称GPU不足。')+'</div>');

const placementQuota=infraReadableHTML(
 knowledgeSubhead('配额是份额与借用规则，不是固定设备编号')+
 para('沿用32卡的题设集群，租户A、B名义额度各16，当前A用12、B用4。A再要16，使用量会到28，需要借max(0,12+16−16)=12。B账面未用额度12，只是供给侧条件；若A借用上限8，仍不能过；上限12才可能通过这份简化配额检查。')+
 knowledgeFormula('题设中的借用必要条件','所需借用 = max(0,当前使用 + 新请求 − 名义额度)','还须不超过允许借用及可出借额度；真实系统另有flavor、cohort、优先级、准入检查和策略。')+
 para('Kueue的ResourceFlavor描述资源变体及与节点的关联，ClusterQueue为这些资源规定nominalQuota、borrowingLimit等份额规则，LocalQueue连接命名空间内的工作负载与集群队列。混合GPU型号不能只合成一个“空闲卡数”：程序、显存和设备资源名可能要求特定flavor，CPU与内存也要同时满足。',
 '借用何时归还取决于策略，不能将暂借容量默认为永久保底。配额公平与隔离分别验收：有额度不意味着有权读其他租户数据；临时借用也不应使别人长期饥饿。部署时锁定Kueue版本、集成控制器、资源类型和实际配置；本章不把有限参考程序当成真实调度器。'));

const placementShape=infraReadableHTML(
 knowledgeSubhead('资源请求是形状与约束的交集，不是GPU整数求和')+
 para('四台各8卡节点，题设空闲[8,4,4,0]，总空闲16。作业要两台各8卡，只有第一台能满足一个worker，第二台不存在。将第二、三台的4+4相加，不能让一个8卡Pod横跨两台机器。换成[8,4,4]的三个worker，则可分别放到前三台；这同时改变程序的进程与通信结构，不能只在申请单上偷偷改数字。')+
 figure('v26-gpu-shape','题设槽位的放置参考：同样16份空闲，形状不同结果不同。蓝色表示空闲，灰色表示已用，不读取真实设备。')+
 table(['约束','判断单位','不能靠什么绕过'],[
 ['单Pod资源','同一候选节点的GPU、CPU、内存和卷','跨节点相加空闲量'],
 ['硬件/设备flavor','匹配模型、驱动与设备资源能力','把不同型号全部计成等价GPU'],
 ['拓扑要求','如同rack、同block或特定节点关系','只看每个Pod独立能放'],
 ['硬约束/偏好','required必须成立；preferred可按机制降级','把偏好当保证，或默默放松硬约束']])+
 para('有限参考还给出一个更小反例：[8,4]空闲，先放需求4的任务到第一台，就留下[4,4]，随后需求8放不下；回溯则能把4放第二台、8放第一台。这说明一次贪心失败不能证明不存在可行解。生产求解还需控制搜索成本，结合排序、回填、预留和超时，不能承诺一般装箱问题都被瞬间最优解决。',
 '拓扑感知调度（TAS）把Pod集合放进目标拓扑域。required与preferred表达不同承诺；节点标签、Topology与ResourceFlavor配置、工作负载注解及版本支持共同决定行为。同rack可能减少某类跨域通信，也可能让空闲资源更难拼齐；要用目标作业的集合通信与实际更新进展验证收益。')+
 linkTo('training-communication','复习集合通信、迟到成员与本地等待'));

const placementReservation=infraReadableHTML(
 knowledgeSubhead('计划会过期：整组提交前重验版本，失败不能留下半组')+
 para('若两个调度者都读到两台节点各空8，分别承诺一份[8,8]，只检查各自旧快照就可能重复预留。需要定义权威资源账、并发仲裁、预留身份和回收条件。只是先给第一worker占8，再希望第二worker以后能获得8，可能形成长时间无训练进展的部分占用。')+
 figure('v26-group-reservation','真实本地两进程争抢同一单库整组预留；版本检查、双节点扣减、分配和额度记录在同一事务。箭头表示协议顺序。')+
 para('配套实验把整组承诺缩到同一个SQLite事务：BEGIN IMMEDIATE获得写事务→核对两个节点的资源版本→扣减两节点→写同一job的分配→记额度→提交。第一节点扣减后注入失败，所有变化回滚；两进程从同一版本竞争，只有一个成功，另一个看到版本改变后返回stale_snapshot。节点不为负、额度不超限、每个获准组完整，是本例验收条件。',
 'Kubernetes API的多个资源对象不自动加入这份数据库事务。实际平台需要基于自身的预留、条件更新、控制器调谐和超时协议协调，不应把示例表结构包装成Kueue的内部实现。即使预留成立，还可能镜像失败、设备不健康或成员没到齐，必须继续观察并释放不能兑现的占用。'));

const placementReady=infraReadableHTML(
 knowledgeSubhead('整组获准以后，仍要给启动与恢复设退出条件')+
 para('Kueue的waitForPodsReady提供基于就绪等待的控制：工作负载获准后若在配置期限内仍未达到所需就绪条件，可以取消准入、挂起相应Job并重新排队。已经运行后成员失去就绪，还涉及恢复期限。功能开关、时间字段、blockAdmission与支持的工作负载集成随版本配置核对；不能由“安装了Kueue”推断所有任务已获得同样语义。',
 '把准备失败、训练失败和恢复失败分开。某worker拉镜像失败，其他worker可能在会合处空等；一个rank读数据退出，其他rank的通信超时可能只是后果。先找最早未完成的环节，再决定是重排、修输入、恢复检查点还是取消，不要每层各自无限重试。')+
 table(['故障注入','需要的证据','通过条件示例'],[
 ['一个成员镜像不可用','所有成员启动状态、就绪期限、回收记录','未形成整组时按协议退出，额度最终归还'],
 ['重复预留/迟到事件','稳定workload身份、活动预留、资源版本','没有重复占用或错误回收新实例'],
 ['训练中一个rank退出','最早异常、存活成员、恢复点与重算','按声明策略终止/恢复，不能永久空占'],
 ['取消后控制器重启','权威取消与待清资源记录','不重新启动已取消任务，清理可重入']])+
 code('目标集群只读排查 · 对象名与API版本按安装环境替换','SHELL',
 'kubectl get clusterqueues,localqueues,workloads -A\nkubectl -n training get workload <workload-name> -o yaml\nkubectl -n training get pods -o wide\nkubectl -n training get events --sort-by=.metadata.creationTimestamp\n# 继续核对训练控制器、成员日志、首个有效更新和检查点；不要只看一行Running'));

const placementPolicy=infraReadableHTML(
 knowledgeSubhead('回填与预留：利用率、等待和恢复代价一起算')+
 para('若队首大作业当前形状不可行，严格不越过队首可能让小作业和空闲资源一起等。回填允许不破坏承诺的小作业先用空隙，但需要知道运行时长是否可靠、能否安全撤销、是否会挡住大作业未来需要的具体节点。只报卡利用率提高，无法说明大任务是否一再被推迟。',
 '设大作业要两台各8卡，第一台已空、第二台12分钟后释放。若第一worker现在占8卡等待配对，按题设空占为8×12/60=1.6卡时，没有训练进展。可以预留节点对并让不妨碍目标形状的短任务回填；若回填超时占住第二台，原承诺又会落空。平台应明确预留是否锁实际资源、时长估计与撤销规则。',
 '抢占不只是把卡数减掉。还要定位释放哪一台、多久真正可用、最近检查点以后损失多少进展、恢复再占用多久，以及低优先任务会否长期饥饿。下一节保留四卡作业6分钟重算+3分钟恢复的0.6卡时推导；它与本节1.6卡时是两份独立题设，不应合成一张实际账单。'));

const placementPractice=infraReadableHTML(
 knowledgeSubhead('实战：有限放置、注入回滚与真实整组竞争')+lpsLab('placement_reservations.py')+
 knowledgeCheck('借用上限从8提高12，为何[8,8]仍不能兑现？','只解决额度必要条件。题设[8,4,4,0]只有一台可提供8槽，第二台形状仍不满足；借用不会把4+4拼成一台。')+
 knowledgeCheck('两进程实验都成功才算吞吐高吗？','在它们争抢同一份两节点容量的题设下，两个都获准反而是超卖。应一组完整提交，另一组拒绝旧快照并重新评估；不能留下半组扣减。')+
 para('将参考带到真实平台，先固定版本与混合负载，再记录提交→额度预留→获准→绑定→就绪→首次更新→可恢复提交。按租户比较长等待、占用卡时、有效进展与抢占重算。不同模型和硬件的进展不能用一个未经归一的step数直接比较；安全隔离也需独立验证。'));

{
 const a=articles.find(a=>a.id==='gpu-scheduling'),old=a.sections.slice();
 a.sections=[['状态与职责：额度、获准、放置、就绪与进展',placementStages],['配额与借用：名义份额、flavor和公平',placementQuota],['资源形状：单节点、拓扑与可行解',placementShape],['并发预留：快照、整组与失败回滚',placementReservation],old[3],['启动与恢复：就绪期限、失效与回收',placementReady],['队列策略：回填、预留与抢占代价',placementPolicy],old[4],old[6],['实战与变化题：穷举参考及真实两进程争抢',placementPractice]];
 a.refs=nitRefs([...a.refs,'v26Quota','v26TAS','v26Ready']);a.minutes=60;a.updated='2026.11.05';
 a.objectives=['区分资源份额、物理可行性、整组启动与实际训练进展','推导形状/拓扑反例和抢占成本','用真实事务竞争验证整组不变量，并设计目标平台故障验收'];
}
{
 const d=infraDomain('platform'),p=d.points.find(p=>p.id==='sv-admission');
 p.body=placementStages+placementQuota+placementShape+placementReservation+placementReady;
 d.refs=nitRefs([...d.refs,'v26Quota','v26TAS','v26Ready']);
}
const placementCasesBeforeLPS=infraFieldCases.platform;
infraFieldCases.platform=()=>'<h3>队列到整组：先算可行，再验证争抢</h3>'+lpsLab('placement_reservations.py',false)+linkTo('gpu-scheduling','阅读配额、形状、拓扑与就绪协议')+placementCasesBeforeLPS();
