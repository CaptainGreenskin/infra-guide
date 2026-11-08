/* Original MySQL lesson; generated source and evidence come from a native run. */
const mysqlReplicationSource = __MYSQL_REPLICATION_SOURCE__;
const mysqlReplicationEvidence = __MYSQL_REPLICATION_EVIDENCE__;
const mysqlReplicationGateExcerpt = __MYSQL_REPLICATION_GATE_EXCERPT__;
Object.assign(sources,{
 mysqlRViews:['MySQL 8.4：一致性非锁定读','https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html'],
 mysqlRViewCode:['MySQL 8.4.13：ReadView可见性判断的实现','https://github.com/mysql/mysql-server/blob/mysql-8.4.13/storage/innobase/include/read0types.h'],
 mysqlRThreads:['MySQL 8.4：复制接收与应用线程','https://dev.mysql.com/doc/refman/8.4/en/replication-threads.html'],
 mysqlRGTID:['MySQL 8.4：GTID格式与存储','https://dev.mysql.com/doc/refman/8.4/en/replication-gtids-concepts.html'],
 mysqlRFunctions:['MySQL 8.4：GTID集合与等待函数','https://dev.mysql.com/doc/refman/8.4/en/gtid-functions.html'],
 mysqlRReadOnly:['MySQL 8.4：read_only与super_read_only','https://dev.mysql.com/doc/refman/8.4/en/server-system-variables.html#sysvar_read_only'],
 mysqlRSwitch:['MySQL 8.4：GTID与切换','https://dev.mysql.com/doc/refman/8.4/en/replication-gtids-failover.html'],
 mysqlRSemi:['MySQL 8.4：半同步复制的确认边界','https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html'],
 mysqlRPartition:['MySQL 8.4：表分区概览','https://dev.mysql.com/doc/refman/8.4/en/partitioning-overview.html']
});
const mysqlReplicationTable=(headers,rows)=>'<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const mysqlReplicationFigure=(name,height,caption)=>'<figure class="training-figure"><a href="diagrams/mysql-replication-'+name+'.svg" target="_blank" rel="noopener" aria-label="放大：'+caption+'"><img src="diagrams/mysql-replication-'+name+'.svg" width="1120" height="'+height+'" loading="lazy" alt="'+caption+'"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>'+caption+'</figcaption></figure>';
const mysqlReplicationReadSQL=`-- 按完整程序的执行顺序，交替查看读角色A与写角色B。
-- 本段起点：account(id=1).balance=100，receipt为空。
-- A：RR读连接，先开始事务，暂不读表。
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

-- B：Lab.change(source,'BEFORE_FIRST_READ',10)的完整事务。
START TRANSACTION;
UPDATE replica_lab.account SET balance=balance+(10) WHERE id=1;
INSERT INTO replica_lab.receipt VALUES ('BEFORE_FIRST_READ',10);
COMMIT;

-- A：Session.balance()中的普通SELECT；首次读到110。
SELECT JSON_OBJECT('balance',balance,'connection',CONNECTION_ID(),
                   'isolation',@@transaction_isolation)
FROM replica_lab.account WHERE id=1;

-- B：+20与其回执一起提交，当前源余额成为130。
START TRANSACTION;
UPDATE replica_lab.account SET balance=balance+(20) WHERE id=1;
INSERT INTO replica_lab.receipt VALUES ('AFTER_FIRST_READ',20);
COMMIT;

-- A：原RR事务仍读110；结束后再读130。
SELECT JSON_OBJECT('balance',balance,'connection',CONNECTION_ID(),
                   'isolation',@@transaction_isolation)
FROM replica_lab.account WHERE id=1;
COMMIT;
SELECT JSON_OBJECT('balance',balance,'connection',CONNECTION_ID(),
                   'isolation',@@transaction_isolation)
FROM replica_lab.account WHERE id=1;

-- 关闭原A，另开RC读连接；仍称读角色A。
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
SELECT JSON_OBJECT('balance',balance,'connection',CONNECTION_ID(),
                   'isolation',@@transaction_isolation)
FROM replica_lab.account WHERE id=1; -- 130

-- B：Lab.change(source,'RC_UPDATE',5)仍保证两表共同提交。
START TRANSACTION;
UPDATE replica_lab.account SET balance=balance+(5) WHERE id=1;
INSERT INTO replica_lab.receipt VALUES ('RC_UPDATE',5);
COMMIT;

-- A：同一个RC事务的下一次普通读取得新视图，返回135。
SELECT JSON_OBJECT('balance',balance,'connection',CONNECTION_ID(),
                   'isolation',@@transaction_isolation)
FROM replica_lab.account WHERE id=1;
COMMIT;`;
articles.push({
 id:'mysql-replication',module:'cloud-data',number:'C3.6',title:'MySQL复制与切换：先解释旧读，再证明谁能写',
 desc:'从InnoDB行版本、读视图和复制进度，走到GTID准入、旧写隔离与双实例受控切换。',
 intro:'数据库已经提交，另一次查询为什么还读到旧值？先沿单实例中的行版本理解读取，再把同一笔提交放到两个实例之间，最后讨论谁有资格接收新写入。',
 level:'机制 + 原生实验',minutes:50,edition:'复制与切换',updated:'2026.11.08',
 baseline:'MySQL 8.4.13 · 单机Docker双实例 · Python标准库',
 prereq:'先读索引与事务、存储恢复和MySQL日志恢复；会区分事务提交、binlog与业务回执。',
 tags:['InnoDB','MVCC','GTID','复制','受控切换'],
 objectives:['解释同一实例的快照旧读与副本应用落后，选择对应的检查方法。','沿接收、应用和业务读取核对GTID目标，说明等待成功与失败各允许做什么。','用真实双实例结果核对旧写拒绝、完整回执、新实例继续写入，并界定计划切换的条件。'],
 check:['RR事务第一次查询之前别的事务已提交，这笔提交是否可见？','副本已接收目标GTID，为什么还可能读不到相应业务？','目标覆盖源GTID集合以后，还需要哪些证据才允许新写入？'],
 exercise:['副本已应用到写请求返回的GTID，但同一条RR读事务仍读旧值。此时再等一次复制能解决吗？','先确认读请求在副本哪个事务中。若该RR事务的读视图早于应用完成，普通一致性读仍可沿旧视图读取；结束旧事务并建立新的读取，才重新判断最新可见状态。GTID应用进度与读视图分别检查，不能互相替代。'],
 related:['mysql-recovery','database-index-locks','cache-consistency'],
 refs:['mysqlRViews','mysqlRViewCode','mysqlRThreads','mysqlRGTID','mysqlRFunctions','mysqlRReadOnly','mysqlRSwitch','mysqlRSemi','mysqlRPartition'],
 sections:[
 ['从一行数据，分清提交、版本与读视图',
  para('前一章说明提交事实怎样依靠日志恢复。本章继续看读取：InnoDB是一种事务存储引擎；一个逻辑行可以对应多个历史版本。事务把余额从100改为110时，其他正在读取的事务未必都应立即看见110。',
  '多版本并发控制（MVCC）让普通查询按规定选择可见版本。更新后的行带有修改它的事务信息，undo记录保存回滚与重建旧版本所需的信息；读取需要旧版本时，沿这些历史信息构造相应结果。undo不是另一条用来复制所有业务的binlog。',
  '读视图是一次一致性读取使用的可见性规则：它区分在其建立时已经提交的事务、仍活动的事务及之后的事务。判断依靠事务身份与活动集合等状态，不是简单比较两次查询的墙钟时间。这里的普通一致性读，就是没有FOR UPDATE或FOR SHARE的相应SELECT。')+
  mysqlReplicationTable(['对象','回答的问题','本章中的位置'],[
   ['事务提交','这组修改是否已经完成提交','写连接的+10或+20及对应回执共同提交'],
   ['行版本与undo','旧值如何被重建，哪些变化属于哪个事务','100、110、130的版本关系'],
   ['读视图','本次普通查询允许看见哪些版本','RR与RC对视图寿命的不同规定'],
   ['复制进度','另一个实例已经收到、应用了哪些提交','后文135与142的差别'],
   ['写入资格','现在允许哪个实例接收新的业务修改','受控切换时的拒绝、追齐和停止旧源']
  ])+
  para('这五项沿因果连接，却不是同一个状态。“源端已经提交”不能自动推出“所有副本已应用”，副本已应用也不能自动替换某个旧读事务的视图。先把单实例里的规则讲清，再把实例数量增加。')+
  '<h3>用一组事务号，把“可见”变成可判断的规则</h3>'+
  para('另外设一组便于手算的内部事务号：视图建立时，下一个可分配事务号为50，其他仍活动的读写事务为42、45，读者自己的事务号为48。对一份行版本，先看它由哪个事务修改；若不可见，再沿undo寻找更早的可见版本。')+
  mysqlReplicationTable(['行版本的修改事务号','对这份视图是否可见','原因'],[
   ['41','可见','比最早仍活动的42更早，属于该视图之前已完成的范围'],
   ['42','不可见','建立视图时仍活动；它之后再提交，也不改写这份旧视图'],
   ['47','可见','小于50，且不在当时的活动集合中'],
   ['50','不可见','落在视图建立以后分配的范围'],
   ['48（当前读者自己）','自身修改可见','当前事务自己的修改有专门的可见性处理']
  ])+
  para('这张表解释的是8.4.13的ReadView判断关系，事务号是教学题设，并非后文实验读取的内部字段。InnoDB事务号与复制GTID是两套身份，不能把41、42或50填入GTID等待函数。下一节回到真实SQL，观察这些规则怎样决定账户的返回值。')],

 ['用两条真实连接理解RR与RC',
  '<h3>RR保留首次普通一致性读建立的视图</h3>'+
  para('REPEATABLE READ（RR，可重复读）通常让同一事务内的普通一致性读复用首次此类读取建立的视图。START TRANSACTION只是开始事务；本例没有使用WITH CONSISTENT SNAPSHOT，因此开始事务与第一次读表之间仍可能有其他提交。',
  '账户初始为100。读连接A先开始RR事务，写连接B提交+10，A才第一次查询，所以A看见110。B再提交+20，源的当前值已经是130；A在原事务内第二次普通查询仍为110。A提交自己的读事务，下一次读取建立新视图，才读到130。')+
  '<h3>RC在每条普通一致性读时取得新视图</h3>'+
  para('READ COMMITTED（RC，读已提交）在同一事务的每条普通一致性读使用新的视图。本例RC连接先看见130；写连接提交+5以后，RC事务中的第二次普通查询看见135。两种隔离级别都没有读取另一个事务尚未提交的余额。')+
  para('现在把前节的手算规则接到账户上：假设余额版本依次是100（事务41）→110（事务47）→130（事务50）→135（事务51）。沿用前节旧视图的上界50与活动集合42、45；这两笔活动事务操作其他数据，不修改本题账户。RR首次读取110时，47已经提交，因而110可见。源随后提交130，旧视图并不会把50从“视图之后”改成“视图之前”。')+
  mysqlReplicationTable(['哪次读取','对版本链做什么判断','选中的账户版本'],[
   ['RR原事务再次读取，当前行已是130','130的修改者50达到旧上界50，先跳过；沿undo找到47，47可见','110；读视图选择旧版本，并非把当前行改回110'],
   ['结束RR事务后再读；或随后RC首次读','此时50已提交；新视图的上界可设为51，50也不在活动集合中','130；这次无需再回溯到47'],
   ['+5由51提交后，RC同一事务下一条普通读','重新取得视图；假设新上界为52，已提交的51可见','135；RC换了视图，原生实验没有重用RR那份旧视图']
  ])+
  para('上面的41、47、50、51及视图界限全部是用于解释的教学假设；原生实验实际测到的是余额110→110→130、130→135以及连接ID，没有采集这些内部事务号。连接ID、InnoDB事务号和后面的复制GTID分别标识不同对象，不能相互替换。')+
  mysqlReplicationFigure('views',820,'真实连接上的读取时间线：RR为110、110、130；RC为130、135。开始事务和首次读表是两个时刻。')+
  mysqlReplicationTable(['观察','RR实际返回','RC实际返回','应检查的边界'],[
   ['首次普通读取','110','130','视图分别在各自实验的这个位置建立'],
   ['另一写连接提交后，同一事务再读','110','135','视图是复用还是重新取得'],
   ['结束RR读事务后再读','130','此对照无需额外读取','旧视图的寿命到事务结束为止']
  ])+
  para('程序把连接ID一起写入结果，防止“其实每次换了新连接”冒充同一事务。RR与RC使用同一账户顺序执行，初始余额分别不同，图中明确标注；不能把两段时间线的第一次读误当成同一时刻。',
  '当前事务自己的修改另有可见性规则，普通SELECT也不能概括UPDATE、DELETE或锁定读的全部行为。SELECT FOR UPDATE是带锁的读取，需要结合当前记录、访问路径和锁等待解释；本例没有把它混进普通一致性读的对照。长时间持有旧视图还可能延长历史版本的保留，增加undo清理压力；应从事务寿命和实际负载检查，而不是看到旧读就修改复制参数。')+
  '<h3>把时间线对应到A/B角色的SQL</h3>'+
  para('下面按读角色A、写角色B重排完整程序中已经执行的语句，供就地跟读。完整程序的Session保持读连接；每次Lab.change另开写连接，并把余额修改与回执放进同一事务。RC部分另建一个读连接。注释指出每一步属于谁，不能把整段交给同一个连接顺序执行来验证并发；实际运行使用第8节的完整Python程序。',
  '本段从新建账户100、空回执表开始。先看RR的110→110→130，再接RC的130→135。JSON_OBJECT只把余额、连接ID和隔离级别包装为可核对的返回值，访问account的仍是普通一致性读。')+
  trainingCode('已执行程序的SQL跟读版 · 按注释区分A/B角色','SQL',mysqlReplicationReadSQL)],

 ['把一次源提交放进复制链',
  para('源实例接收本章的业务写入；副本实例从源取回变化，再在本地应用。这里讨论的是异步复制：源完成自己的提交后即可向客户端确认，不能由这个确认推断副本已经接收或应用。',
  'binlog是服务器层的事务事件流。源上的发送线程把事件发给副本；副本的I/O接收线程取回事件并写入relay log（中继日志）；应用线程再读取这些事件，推进副本数据。多线程应用还会增加协调与工作线程；本实验配置一个应用worker，便于检查先后关系。')+
  mysqlReplicationTable(['阶段','持有的事实','仍不能推出什么'],[
   ['源提交','源账户与业务回执已经提交','副本已经获得这次变化'],
   ['副本接收','该复制通道已经收到相应GTID事件','副本查询可以看见该业务'],
   ['副本应用','事务已在副本执行进度中','某个旧RR读视图已被替换'],
   ['副本查询','这个连接和事务实际返回了数据','其他连接必然使用同一视图'],
   ['写入口开放','控制逻辑允许向候选目标发新写入','旧实例已经失去写入能力']
  ])+
  para('复制延迟可能出现在取回、落盘、应用或查询所处的不同阶段。本例只停SQL应用线程，保留接收线程运行，让“收到了却没读到”的边界可直接观察。接收集合本身不是宿主机断电后的持久化验收；日志同步策略、存储和故障条件仍需另外验证。',
  '半同步复制是在源确认路径上增加副本接收确认的一类模式，确认边界仍需要看具体配置；接收确认不等于所有副本都已应用。本实验按前述异步链运行；半同步在这里用于区分接收与应用的确认条件。')],

 ['GTID记录事务身份，集合表达应用目标',
  '<h3>从单个事务身份到一组已完成工作</h3>'+
  para('本章使用的全局事务标识GTID采用默认的“来源服务器UUID:事务序号”形式。UUID用来区分事务来源，序号标记该来源中的事务身份；它不是磁盘字节位置，也不是业务操作ID。一个实例可能接收不同来源的事务，因此进度表达为GTID集合。',
  '例如用S简写一个来源UUID，S:1-8表示该来源的1到8号事务；S:1-5:8表示还缺6与7，不能仅比较最大的数字8。这个S只是讲解用缩写，不能直接送给MySQL函数。实际程序使用每次初始化产生的完整UUID和集合。',
  '本章把源提交+7后记录的目标叫G₁；停止旧写以后，另取最终交接目标G₂。两次取值的时机不同，不能混用。实际运行还揭示一个准备条件：官方镜像启动副本时，已经存在它自己UUID下的初始化事务。程序在创建本题业务、开始复制之前，把这一可信初始集合记为B。切换时，目标只允许含G₂与已知B中的事务，并分别核对缺少和多出。不能先看到额外事务，再事后把它们全部命名为“初始化”；同一副本UUID下以后出现的新事务，也不能自动并入B。')+
  mysqlReplicationTable(['状态或函数','含义','本章的用法'],[
   ['Retrieved_Gtid_Set','这个复制通道已接收到的事务集合','确认源的目标已取回'],
   ['@@GLOBAL.gtid_executed / Executed_Gtid_Set','服务器已执行的GTID集合','确认目标事务已应用；注意可能含其他来源'],
   ['GTID_SUBSET(目标,执行集合)','目标中每个GTID是否都在执行集合内','检查覆盖关系，返回1或0'],
   ['GTID_SUBTRACT(集合A,集合B)','A里有哪些事务不在B内','查缺少或额外历史，不能只看覆盖'],
   ['WAIT_FOR_EXECUTED_GTID_SET(目标,正数秒)','在给定时间内等待目标全部执行','0是成功，1是超时；其他失败应检查错误']
  ])+
  para('再用一组小集合手算。S代表源的完整UUID，R代表候选副本的完整UUID，均为教学缩写。假设最终源目标G₂=S:1-8，复制开始前已经采集的可信初始集合B=R:1-2；允许的集合就是G₂∪B。对于候选当前执行集合C，要分别算G₂−C（缺少的源事务）和C−(G₂∪B)（没有可信来源的额外事务）。')+
  mysqlReplicationTable(['候选C','缺少','未知额外'],[
   ['S:1-6:8，R:1-2','S:7','空'],
   ['S:1-8，R:1-3','空','R:3'],
   ['S:1-8，R:1-2','空','空']
  ])+
  para('第一行的最大源序号虽已是8，却仍缺少事务7，不能通过。第二行已经覆盖G₂，但多出不属于先验B的本地事务R:3，同样不能通过。第三行的两个差集都为空，才通过本例的集合核对；业务回执、旧写隔离与开放顺序仍须继续检查。')+
  para('S、R不能直接作为MySQL的GTID参数。下一段是replication_lab.py中从allowed_target开始的连续四行，展示时仅去掉共同缩进。frozen_gtid是实际冻结后的G₂，replica_bootstrap是实际复制开始前的B；lab.scalar在指定实例执行SQL并读取单值，replica是候选实例名称，quoted把集合转成SQL字符串字面量。完整程序先建立这些对象，再执行本段，完整上下文见第8节。')+
  trainingCode('原程序连续四行摘录 · 依赖完整实验上下文','PYTHON',mysqlReplicationGateExcerpt)+
  para('B不为空时，逗号把两个GTID集合串接给MySQL按并集解释；空B直接使用G₂。第一条GTID_SUBTRACT从候选已执行集合里扣掉允许集合，第二条从最终源目标里扣掉候选已执行集合。任一差集非空，就停止本次交接流程并记录失败，实验资源仍由清理逻辑回收。这四行只解释集合准入，不代替完整程序中的账本核对与旧写隔离。')+
  '<h3>等待对象是明确集合，不是“落后大概为零”</h3>'+
  para('本例在源提交+7以后读出一份目标集合G₁，副本接收集合覆盖G₁，但执行集合不覆盖G₁。等待G₁、最多1秒，返回1。副本当前新查询仍为135，而源为142；这一结果足以拒绝本题的提前放开新写。',
  '恢复应用后，最多25秒的等待返回0，接着用新查询核对账户和回执。时间窗口是测试上限，不是承诺复制在生产中25秒必定完成。函数的0秒或省略超时表示无限等待，不是“立即看看”；程序明确只传正数。',
  'Seconds_Behind_Source是一个诊断信号，受线程和时间等条件影响；它不是按某一写请求建立的完成凭据。要确认读到某次写入，可把该次写入对应的GTID目标交给实际读取候选，限时等待并检查结果，再建立合适的读事务。超时后选择回源、返回重试提示或失败，要由业务的时延和一致性约定决定。')],

 ['旧读要分别查事务视图和复制应用',
  mysqlReplicationFigure('pipeline',840,'源为142、副本新查询为135；接收线程运行、应用线程暂停，目标G₁已收到但尚未应用。')+
  mysqlReplicationTable(['表现','事实来自哪里','有效检查','不能替代的动作'],[
   ['同一源实例，RR两次读110','旧读视图仍然有效，源当前已为130','连接ID、隔离级别、首次读与事务结束位置','反复等副本复制'],
   ['副本新查询135，源142','+7已收到却未应用','接收/执行集合、线程状态、等待函数返回','单纯重连副本'],
   ['副本已应用到G₁，旧RR事务仍旧读','应用完成与视图建立存在先后','结束旧视图或按契约采用新的读取','看到WAIT返回0就忽略当前事务'],
   ['结果来自缓存而非数据库','应用还有另一份已缓存状态','确认真正读取路径、缓存版本和失效条件','把缓存返回当作数据库查询证据']
  ])+
  para('第三行是把前两条机制连起来的推论，不是本次脚本新增的一组副本RR测量。先说清证据和推理的边界，再设计需要补做的实验。缓存的版本与回填问题继续读<a href="#/article/cache-consistency">缓存一致性</a>；复制线程的应用进度无法替它自动处理旧缓存。',
  '业务要求“我刚写过，随后必须读到”时，至少要明确：写确认来自哪个实例，候选副本要覆盖哪个目标，读取在哪个事务中发生，等待超过期限怎么办。读写分离只是流量分配方式，不能单凭“读走副本”推出某种一致性保证。')],

 ['计划切换：先收回旧写，再追齐与开放新写',
  para('计划切换发生在旧源仍可联系、可以安排停止写入的条件下。本章先撤销旧业务账号的写权限，再设置super_read_only，实际发起写请求核对拒绝，随后记录冻结后的最终源目标G₂。到此才能把“追齐某个目标”变成有限问题；如果源还在不断接受新写，先前记录的G₁并不是最终交接点。撤销权限等管理变化也可能形成事务，最终交接集合要在冻结后实际取得；余额同为142，不等于GTID集合相同。',
  'read_only限制普通客户端写入，但某些有管理权限的连接仍有例外；super_read_only进一步限制相应管理连接的客户端更新。复制应用线程仍可执行复制变化，且这些实例级开关不会自动复制成另一实例的同值设置。有权限的管理员也可以重新关闭开关，所以这不是能在任意网络分区下强制隔离旧写的完整机制。')+
  mysqlReplicationFigure('switch',880,'本题的五道交接条件：收回旧写、取得冻结目标、候选追齐、停止旧实例、最后开放新写。')+
  mysqlReplicationTable(['交接条件','本次怎样实际检查','失败时保持什么状态'],[
   ['旧写停止','撤销业务写权限；super_read_only；业务与管理员写都尝试并被拒绝','不开放候选新写'],
   ['候选包含最终源目标','正数超时等待G₂成功；核对实际账户和完整回执','继续等待或终止这次切换'],
   ['业务历史一致','两边读取账户、操作ID集合与每笔增量；GTID只允许G₂与先验B','不因一个余额相同而放行'],
   ['旧执行实例不能继续写','真实停止本次创建的旧容器，查Running=false及旧端写失败','不把入口已改名当成旧写隔离'],
   ['新实例接管后能继续业务','停止旧复制通道、明确新端权限，再提交唯一NEW_WRITER +3','保留冻结与错误证据，按既定方案处理']
  ])+
  para('fencing指让已经失去资格的旧执行者无法继续影响受保护资源。这里仅对自己创建的旧容器兑现：硬停止该容器，然后才开放新端。生产中若旧主失联但仍可能服务另一批客户端，需要与平台、网络、存储或资源端授权结合设计可兑现的隔离；“连不上它”本身不是停止证明。',
  '本例没有业务代理或DNS入口切流，客户端由脚本直接选择明确的实例。它也没有模拟旧源失联时的自动故障切换。后者可能拿不到最终已确认历史，应先说明允许的数据丢失窗口RPO、可接受的恢复时间RTO和可获得的证据，不能把这组受控计划切换外推成任意故障零丢失。')],

 ['读副本、分片与热点，各解决哪种容量问题',
  para('增加读副本可以把允许读取副本的查询分散出去，但新增写入仍须经过相应写入规则，复制应用本身也要消耗资源。单个写热点、重复应用的成本与一致性要求，不会因为副本数量增加而自动消失。',
  '分片是把不同数据放到不同实例或实例组。分片键决定一条记录归属哪片，路由规则把请求送到拥有它的目标；每片内部的索引再定位具体行。按范围切分便于连续范围访问，却可能让最新区间很热；按散列分配通常更容易分散大量不同键，但范围查询可能需要多片汇总。',
  '下面声明各次请求的成本相同，单片在这组固定负载下可完成600次/秒；只比较路由后的工作分布，新增汇总和跨片事务成本另算。')+
  mysqlReplicationTable(['规则与题设','推导','要付出的代价'],[
   ['按tenant_id路由；T1为800请求/秒，T2/T3各100','即使有4片，T1仍可能单独压在一片；总量1000不能简单除4','增加片数不等于拆开同一个热租户'],
   ['声明单片可承受600请求/秒','T1的800超过单片假设上限；其他片有空闲也不能直接代它读本地数据','先核对访问单位、写路径和可移动数据'],
   ['把T1按账户子键拆成两组，各400请求/秒','两组在题设中都低于600，才有新的可行放置','租户范围查询需要汇合，跨组修改需要新的事务安排'],
   ['同一账户本身承受800次串行余额更新','按账户键散列后仍是同一个热键','需要评估业务是否允许合并、批量或改变写入模型']
  ])+
  para('这些数字是声明的容量算例，没有运行分布式分片基准。跨片转账涉及两个数据拥有者的共同提交；原来一个InnoDB事务的原子性不能直接覆盖两个独立实例。全局唯一约束、关联查询、迁移期间的路由版本与重复写入，都要重新设计。',
  'MySQL表分区把一张表按规则拆成内部存储部分；它不自动提供跨独立服务器的分片路由、全局事务与故障切换。选型前先画清“分的是表内存储、不同实例的数据，还是同一数据的副本”。')],

 ['沿完整程序核对读视图、复制和交接',
  '<div id="mysql-replication-run">'+
  para('完整实验只用Python标准库调用Docker与mysql客户端，不需要真实业务账号或外部数据库。它创建两个隔离MySQL实例，所有数据与密码均为本地教学夹具；不暴露宿主机端口。每个容器内存上限1GiB，首次镜像下载时间另计。',
  '服务器固定为MySQL 8.4.13的官方镜像摘要；完整摘要、实际image ID与两个server UUID写入执行记录。脚本同时记录自身SHA256，网页、源码包与图都以这一份实际运行绑定。')+
  trainingCode('下载并解压完整mysql-replication目录，在该目录执行','SHELL','python3 -B replication_lab.py --output mysql-result.json\npython3 -m json.tool mysql-result.json')+
  para('<a href="labs/mysql-replication.zip" download>下载完整实验包 →</a> · <a href="labs/mysql-replication/README.md">逐步解释与运行条件</a> · <a href="labs/mysql-replication/replication_lab.py">完整程序</a> · <a href="labs/mysql-replication/validation.json">实际执行与CI来源</a>。输出是本次真实读数；UUID和事务序号随初始化改变，应比较关系与业务结果，不照抄固定GTID坐标。')+
  mysqlReplicationTable(['源码入口','把哪条机制落实到对象','应核对什么'],[
   ['Session.request与balance','一个mysql子进程维持一条实际连接','两次读取连接ID相同，RR/RC返回值不同'],
   ['Lab.change','账户修改与唯一回执在一个事务提交','不出现只改余额却缺少同笔回执'],
   ['replication_status、wait_gtid','分别观察接收/应用，再等明确目标集合','应用暂停时1秒等待返回1，恢复后正数等待返回0'],
   ['受控切换段','撤销写、冻结目标、核对候选、停止旧容器、开放新写','步骤顺序及真实旧写拒绝，而非只修改一个状态标识'],
   ['oracle与state','重新读取实际账户和每笔回执','初始100加五笔增量为145，所有操作恰好一次']
  ])+
  '<details class="knowledge-check"><summary>展开完整replication_lab.py：与下载文件逐字一致</summary>'+trainingCode('replication_lab.py · 两个真实MySQL实例','PYTHON',mysqlReplicationSource)+'</details>'+
  para('程序在失败时保留failed结果并非零退出，清理也只针对自己成功创建的资源。普通网页CI核对原生执行记录、程序SHA、独立GTID与业务算式、SVG数据和ZIP内容，不会在未运行Docker时冒充重跑。源码变动后，需要重新执行原生实验。',
  '目标是单机双实例和受控切换；跨机房、生产负载、宿主机断电、云数据库与真实应用切流均不在这份通过记录内。新副本从这组很小的完整binlog历史建立；已有大数据集的基线、日志与恢复目标，接着核对前一章的<a href="#/article/mysql-recovery">MySQL恢复实验</a>。')+'</div>'],

 ['把图上的边界变成面试追问',
  mysqlReplicationTable(['追问','沿哪条因果回答','答案缺少什么就不能下结论'],[
   ['提交后读旧，是不是数据库不一致','确认读取实例、事务视图、复制应用与缓存路径','没有确定读取对象，只给复制加等待'],
   ['GTID最大的副本能否直接提升','先检查完整集合缺口与额外历史，再解释业务完整性和旧写资格','只比较一个最大序号或一个余额'],
   ['主从切换怎样保证没有双写','说明旧主可达条件、停止旧写的实际机制，以及新写开放顺序','只更新路由或只发一个readonly命令'],
   ['复制和备份为什么都需要','复制延续变化，备份与连续日志允许选择历史恢复目标','把误删复制成功解释成误删可撤销'],
   ['加副本和分库分表为什么还会有热点','回到访问单位、分片键、写入顺序与跨片约束','只把总QPS平均分给机器数']
  ])+
  para('合上页面，先画单实例的读视图时间线，再画两实例的提交、接收、应用和查询，最后在图上标出停止旧写与开放新写的条件。如果这三张图还能相互对应，才把相同思路迁移到缓存、消息消费者或其他数据库。不同系统的具体保证仍要分别核对。')]
 ]
});
