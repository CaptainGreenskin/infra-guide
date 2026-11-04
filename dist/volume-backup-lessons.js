/* Knowledge, derivation, controlled example, then operational runbook. */
const volumeLayers=infraReadableHTML(
 knowledgeSubhead('先分清文件放在哪里，再讨论重启会不会丢')+
 para('应用写入/data/progress.sqlite时，看到的是容器内路径。这个路径可能属于容器可写层，也可能被某个卷覆盖；文件名相同，并不说明数据落在同一个位置。先确认/data实际挂载了什么，再讨论Pod删除、节点故障和备份。挂载覆盖镜像里已有目录时，镜像原有文件通常只是被遮住，并不会自动复制进新卷。')+
 table(['数据位置','容器重启与Pod变化','适合承担的职责'],[
 ['容器可写层','容器实例重建时不能作为保留数据的保证','可丢的进程内临时文件'],
 ['emptyDir','同一Pod内容器重启可保留；Pod被删除后数据随之移除','Pod内共享的临时工作区'],
 ['节点本地路径','依赖特定节点；换节点不自动搬运文件','有明确重建或恢复方案的本地缓存'],
 ['PVC关联的持久卷','生命周期可独立于单个Pod；实际保留、连接与恢复看卷和策略','需要跨Pod替换继续使用的数据']])+
 para('持久卷解决的是“新进程如何重新找到存储”，不直接解决“里面的数据是否正确”。应用把错误金额写进同一卷，重建Pod仍会读到错误金额。数据库也可能在重启后先重放日志；文件系统挂载成功和数据库恢复完成不是同一个时点。'));

const volumeBinding=infraReadableHTML(
 '<div class="mechanism-core" id="volume-binding-path">'+knowledgeSubhead('PVC、PV、StorageClass与CSI各管哪一段')+
 para('持久卷声明（PVC）是应用在命名空间里提出的需求，例如容量10Gi、访问模式和存储类。持久卷（PV）是集群里的卷对象，记录实际存储的驱动、卷身份和约束。存储类（StorageClass）描述怎么制备一类卷；容器存储接口（CSI）让Kubernetes与具体存储驱动协作。真实数据保存在后端卷，不在PVC这段YAML里。')+
 figure('v22-volume-path','从声明到文件内容：先确认对象关系，再检查节点路径，最后验证应用读写与数据版本。')+
 para('静态供应先由管理员准备PV，再让PVC匹配；动态供应由PVC选择StorageClass，驱动按策略创建后端卷与关联PV。一个PVC绑定一个PV，不等于后端只有一份副本，也不等于只有一个应用进程可以写。PVC与PV的名字、CSI的volumeHandle、应用的/data路径要能串成同一条证据。')+
 table(['阶段','完成了什么','还没有证明什么'],[
 ['PVC Bound','声明与某个PV已绑定','Pod已经调度，或节点已经挂载'],
 ['节点连接/挂载完成','该节点获得可用的卷访问路径','进程身份有权限，或数据库可恢复'],
 ['应用打开文件','路径与本次权限检查通过','读到目标版本，或写入已按业务协议提交'],
 ['业务读写校验通过','指定操作满足验收条件','其他故障域与历史恢复点也已覆盖']])+
 para('不是所有CSI驱动都需要独立的设备attach步骤；文件类驱动和块设备驱动的实现可能不同。排查时查当前驱动实际的控制组件、节点组件和事件。若使用文件系统卷，容器通常通过volumeMounts访问目录；原始块卷则使用volumeDevices等对应方式，不能把设备路径当目录直接套用。')+'</div>');

const volumeTopology=infraReadableHTML(
 knowledgeSubhead('卷的区域与Pod的位置，要在同一张可行性表里判断')+
 para('设Pod需要2核CPU、4GiB内存，已存在的卷只能在AZ-a连接。下表的空余资源是已经扣除其他请求后的余量。选择节点时要同时满足计算资源、Pod放置条件和卷拓扑，不能先把全站资源加起来。')+
 table(['节点','空余CPU / 内存','区域','本例结果'],[
 ['n1','2核 / 2GiB','AZ-a','区域正确，内存不够'],
 ['n2','4核 / 8GiB','AZ-a','三项均满足，是可行候选'],
 ['n3','8核 / 16GiB','AZ-b','资源最多，但既有卷的区域不匹配']])+
 para('Immediate绑定可能在消费者位置未知时就创建卷。WaitForFirstConsumer把选择或制备延后到有使用该PVC的Pod，再结合资源、节点选择器、亲和等约束决定位置，要求目标驱动支持。因此，没有消费者时PVC Pending可能是正常等待；先去看它等待什么，不要把Pending一概解释成存储故障。',
 '延迟绑定也不能凭空消除矛盾。若业务硬性要求AZ-b，却要复用只能在AZ-a访问的既有卷，仍需改放置或按受支持方式迁移数据。直接给Pod设置nodeName会绕过调度器，可能让延迟绑定停住；有定点需求时使用合适的节点选择或亲和规则，让调度器参与完整判断。')+
 knowledgeCheck('把n3的CPU再翻倍，能解决本题的卷挂载吗？','不能。CPU不改变卷的可访问区域。先说明要复用哪一份数据、卷支持哪里连接，再决定节点位置或迁移方案。'));

const volumeAccess=infraReadableHTML(
 knowledgeSubhead('访问模式描述挂载能力，业务写入仍需要自己的并发协议')+
 table(['模式','主要含义','常见误读'],[
 ['ReadWriteOnce / RWO','可由一个节点读写挂载','不是“整个集群只有一个Pod能写”'],
 ['ReadOnlyMany / ROX','可由多个节点只读挂载的能力声明','仍需实际只读挂载与权限保护，不能只靠名称'],
 ['ReadWriteMany / RWX','可由多个节点读写挂载','不等于任意文件格式支持并发覆盖'],
 ['ReadWriteOncePod / RWOP','支持该模式的CSI环境中，限制单个Pod挂载','不自动提供数据库复制、主身份隔离和备份']])+
 para('同一节点上的两个Pod可能共用RWO卷。若二者都先读count=0，再各自写count=1，最终仍是1，丢掉了一次更新；“挂载被允许”没有把两段读改写变成事务。共享文件系统也一样：必须选用它真正支持的锁、原子更新或数据库协议。普通文件系统同时被多台机器当本地块盘写入，还可能损坏元数据。',
 '存储故障切换时，旧节点失联不等于旧写者已停。新Pod使用同一业务身份前，需要按存储和数据库方案确认旧写者隔离、连接与恢复状态。强删旧Pod的API对象不能替代这项确认。访问模式是这条链的一部分，不能单独承担所有排他写入保证。'));

const volumePerformance=infraReadableHTML(
 knowledgeSubhead('容量、操作数、吞吐和等待，分别记一笔')+
 para('10Gi是容量需求，不是性能承诺。每秒能完成多少次读写叫IOPS，每秒传多少字节叫吞吐；同样的IOPS，操作大小不同，能搬运的字节数就不同。应用还要经过排队、系统调用、文件系统、缓存、驱动和后端，看到的p99延迟取决于整个路径。')+
 knowledgeFormula('固定16KiB操作、理想完成3000次/s','3000 × 16KiB = 46.875MiB/s',
 '若后端还有125MiB/s吞吐上限，此负载先受3000IOPS限制。换成1MiB操作，理想125次/s就触及吞吐上限。这里忽略其他限制，不是存储产品实测。')+
 para('并发也要与等待配套。在稳定窗口、平均完成3000次/s、平均响应4ms的题设里，平均在途约为3000×0.004=12次。它是平均量关系，不能把12当作所有场景的最佳队列深度。把并发堆得很高，可能只让请求排队更久；要同时看有效完成量、错误、超时和尾延迟。',
 '测试至少固定操作大小、随机或顺序、读写比例、并发与缓存冷热。热页缓存的读速度不能当作远端冷读能力。扩容时又要分别观察PVC请求容量、后端卷容量、节点文件系统容量和应用可见空间；StorageClass允许扩容只是前提，驱动和文件系统的完成过程仍需核对。缩容与跨区迁移另有流程，不能通过删除PVC代替。'));

const volumeBackup=infraReadableHTML(
 '<div class="mechanism-core" id="backup-consistency-point">'+knowledgeSubhead('把保留、快照、备份和恢复点分成四个问题')+
 para('Retain让相应回收路径保留后端卷供后续管理；它保留当前数据，也会保留误写。快照记录某一存储切面，具体一致性、故障域和保留规则由实现决定。备份应有可管理的副本、版本与恢复流程。恢复点则回答：消费者究竟可以回到哪一个已确认业务状态？这些词不能互相代替。',
 '数据库的当前状态可能分布在主数据文件与日志中。以SQLite WAL模式为例，新提交可以先存在WAL，随后由checkpoint写回主文件。本地实验特意先把v1余额100写入主文件，再提交v2=120；只复制主文件的副本可以正常打开，却仍只有100。这个反例说明“文件没坏”不等于“包含目标提交”，不能据此把拆文件热拷贝当作备份方法。')+
 figure('v22-wal-snapshots','本例最低要求v3：主文件副本v1和旧事务备份v2都不合格；新连接备份v3在隔离恢复后还能继续工作。')+
 para('一致性也不等于新鲜度。一个读事务在v2建立快照，另一连接提交v3后，它仍可读取一致的v2。从这个读连接做备份会得到与该读快照一致的内容；从新的连接备份则得到本题的v3。旧备份可能内部完全正确，但不满足本次恢复最低版本3。验收必须同时核对格式/摘要、数据库一致性和业务恢复点。',
 'CSI卷快照需要相应快照资源、控制器与驱动能力；看到VolumeSnapshot就绪，只能在其契约内解释存储快照结果。多卷数据库、日志与数据分离、外部消息位点还需协调。应用一致备份一般要结合数据库自己的备份、日志或冻结协议；不能从“底层支持快照”推导任意应用都能在任意时点正确恢复。',
 '本例隔离恢复后也会产生自己的v4，它与原库误写的v4属于不同历史分支。同一个整数不能充当跨库的全局版本；正式切换还要标明恢复身份或代际，并隔离旧写者。本地实验没有自动接管权威身份。')+
 knowledgeCheck('v2备份的integrity_check为ok，而业务要求至少v3，能上线吗？','不能。它证明了本例的结构完整性，没有满足恢复版本。继续查可用的更近备份和日志链，或者明确接受数据损失后按约定处理。')+'</div>');

const volumeRunbook=infraReadableHTML(
 knowledgeSubhead('把机制变成一条能复查的排查顺序')+
 code('只读观察 · 替换成测试命名空间、声明与Pod名称','SHELL',
 'kubectl get pvc app-data -n infra-guide-storage -o yaml\nkubectl describe pvc app-data -n infra-guide-storage\nkubectl get pv\nkubectl get storageclass\nkubectl describe pod app-pod -n infra-guide-storage\nkubectl logs app-pod -n infra-guide-storage --timestamps\n# 已运行的测试容器内，核对真实路径和身份\nkubectl exec -n infra-guide-storage app-pod -- id\nkubectl exec -n infra-guide-storage app-pod -- df -h /data')+
 para('先看PVC选择了哪个PV和存储类，再看Pod是否被调度到兼容节点。调度阶段的卷亲和冲突、连接或挂载失败、进程打开文件时的权限错误，发生在不同阶段。事件名称、驱动日志与节点状态要按实际版本解释；应用报EACCES时，重点核对运行用户、目录权限和安全上下文，不能因为PVC已绑定就排除存储路径。',
 '在自己的测试集群里，可按三个单变量练习推进：先只建延迟绑定PVC，观察无消费者时的等待；再创建使用它的测试Pod，追踪从绑定到应用读写；最后只改变一个条件，例如一个不兼容节点选择，说明它在哪个阶段失败。记录卷ID、Pod UID、实际节点、事件时间和校验数据，恢复原条件后再次验证。本文没有运行CSI集群，不把这些预期观察伪装成实测输出。')+
 code('PVC片段 · 使用集群已存在且符合要求的StorageClass','YAML',
 'apiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: app-data\n  namespace: infra-guide-storage\nspec:\n  storageClassName: your-csi-class\n  accessModes: [ReadWriteOnce]\n  resources:\n    requests:\n      storage: 1Gi')+
 para('消费者通过persistentVolumeClaim.claimName引用app-data，并把该卷挂到应用实际使用的路径。先解释这份关联再写工作负载；如果程序仍写另一个未挂载目录，PVC再正确也不会替它保存数据。集群清单与驱动测试负责验证平台路径，下面的本地数据库程序负责验证恢复内容，两份证据不能互换。')+
 knowledgeSubhead('两次独立Job复用同一PVC：给测试者一套完整输入')+
 para('下载包另有四份JSON清单，kubectl可以直接读取：命名空间infra-guide-storage、1Gi的app-data声明、两个独立Job。先把storage-claim.json中的your-csi-class改成测试集群已有且符合需求的存储类。两个Job都挂载/data，运行与本地核对完全相同的volume_writer.py；示例镜像为python:3.12-slim，复查时记录实际imageID。')+
 code('在自己的测试集群执行 · 每一步保留真实输出','SHELL',
 'kubectl get storageclass\n# 编辑storage-claim.json中的storageClassName\nkubectl apply -f storage-namespace.json\nkubectl apply -f storage-claim.json\nkubectl get pvc -n infra-guide-storage\nkubectl apply -f storage-job-1.json\nkubectl wait -n infra-guide-storage --for=condition=complete \\\n  --timeout=180s job/storage-writer-1\nkubectl logs -n infra-guide-storage job/storage-writer-1\nkubectl apply -f storage-job-2.json\nkubectl wait -n infra-guide-storage --for=condition=complete \\\n  --timeout=180s job/storage-writer-2\nkubectl logs -n infra-guide-storage job/storage-writer-2')+
 para('全新空卷且按顺序完成时，第一份原回执应为0→1，第二份应为1→2。Job重试并不承诺业务恰好一次，因此程序为每份逻辑写入保存稳定操作ID与事务回执；重投write-1返回原after=1，而当前总计数可已是2。若卷已有测试数据或逻辑操作已执行，先按回执解释结果，不把数字不等于首次预期直接判断成卷损坏。')+
 sqcLab('volume_writer.py')+
 para('这套清单没有在本轮集群上执行。集群验收还需保存PVC/PV身份、两份Job各自Pod UID与节点、应用输出以及驱动事件。两个Pod成功只能说明本次路径可用；节点故障后的重新连接、旧写者隔离与备份恢复仍要单独演练。'));

const volumeExercise=infraReadableHTML(
 knowledgeSubhead('先独立回答，再运行恢复程序')+
 para('题设：10:00备份达到业务序号100，10:01确认序号101，10:02发生故障。卷已重新挂载，但隔离恢复只读到100。先说明丢失的是哪一笔已确认工作；再说明若约定从故障开始计算RTO，挂载完成之后还应把哪些步骤计入恢复时间。若缺少日志或副本确认信息，不能凭空宣称101一定可恢复。',
 '再做一题：当前库发生误写，但Retain保住了整个卷；旧备份结构完整，版本却低于恢复要求。一个能恢复的方案，要写清目标版本、需要的日志链、隔离恢复位置、消费者验证与切换条件。保留了卷、找到了文件、打开了数据库，各只是中间结果。')+
 sqcLab('wal_backup.py'));

{
 const article=articles.find(a=>a.id==='k8s-storage');
 article.sections=[
  ['文件放在哪里：容器、临时卷与持久卷',volumeLayers],
  ['从PVC到应用路径：绑定只是中间一步',volumeBinding],
  ['拓扑与延迟绑定：一起选择节点和卷',volumeTopology],
  ['访问模式、并发写入与旧写者隔离',volumeAccess],
  ['容量、IOPS、吞吐与扩容',volumePerformance],
  ['快照与备份：一致性和恢复点分别验收',volumeBackup],
  ['从Pending到文件内容的排查实战',volumeRunbook],
  ['恢复练习：让消费者继续完成工作',volumeExercise]
 ];
 article.refs=[...new Set([...article.refs,'v22PV','v22SC','v22Snapshot','v22Wal','v22Backup','v22Isolation'])];
 article.minutes=40;article.updated='2026.11.04';
}
cloudKnowledgeExplanations['persistent-volume']=volumeLayers+volumeBinding+volumeTopology+volumeAccess+
 para('容量和恢复继续沿同一条路径核对：IOPS×操作大小决定相应吞吐；卷保留不撤销误写；可打开的数据库仍可能低于目标恢复版本。')+
 linkTo('k8s-storage','继续学习性能、备份推导与完整恢复实战');
cloudKnowledgeExplanations['backup-restore']+=volumeBackup;
cloudKnowledgeDomain('native').refs=[...new Set([...cloudKnowledgeDomain('native').refs,'v22PV','v22SC','v22Snapshot'])];
cloudKnowledgeDomain('cloud-data').refs=[...new Set([...cloudKnowledgeDomain('cloud-data').refs,'v22Wal','v22Backup','v22Isolation'])];
{
 const a=articles.find(a=>a.id==='storage-recovery');
 a.sections[4][1]+='<h3>再用真实数据库区分“完整”与“足够新”</h3>'+volumeBackup+sqcLab('wal_backup.py');
 a.refs=[...new Set([...a.refs,'v22Wal','v22Backup','v22Isolation'])];a.updated='2026.11.04';
}
const volumeLabsBeforeSQC=cloudFieldLabs;
cloudFieldLabs=id=>(id==='native'?'<h3>挂载之后，数据是否恢复到目标版本</h3>'+sqcLab('wal_backup.py',false)+linkTo('k8s-storage','阅读存储全链与集群排查步骤'): '')+volumeLabsBeforeSQC(id);
