/* Read the storage objects and normal path before publishing, restoring or diagnosing them.
   Load after the progressive/bridge lessons and before first-reading-flow.js. */
(()=>{
 const p=(...rows)=>rows.map(row=>'<p>'+row+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="full-code"><summary>'+title+'</summary>'+body+'</details>';
 const blocks=html=>[...html.matchAll(/<div class="code-block">[\s\S]*?<\/pre><\/div>/g)].map(m=>m[0]);
 const figures=html=>[...html.matchAll(/<figure\b[\s\S]*?<\/figure>/g)].map(m=>m[0]);
 const paragraphs=(html,cls)=>[...html.matchAll(new RegExp('<p class="'+cls+'">[\\s\\S]*?<\\/p>','g'))].map(m=>m[0]).join('');
 const select=(id,titles)=>{
  const a=articles.find(x=>x.id===id);
  if(!a||a.sections.length!==titles.length||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Progressive storage source changed: '+id);
  return a;
 };
 const replace=(a,bodies)=>{
  const before=a.sections.map(s=>s[1]).join(''),after=bodies.join('');
  if(bodies.length!==a.sections.length)throw Error('Storage section count changed: '+a.id);
  const pre=html=>html.match(/<pre\b[\s\S]*?<\/pre>/g)||[];
  if(JSON.stringify(pre(before))!==JSON.stringify(pre(after)))throw Error('Storage original code changed: '+a.id);
  if(JSON.stringify(figures(before).slice().sort())!==JSON.stringify(figures(after).slice().sort()))throw Error('Storage original figure changed: '+a.id);
  for(const m of before.matchAll(/\bid=["']([^"']+)["']/g))if(!after.includes('id="'+m[1]+'"')&&!after.includes("id='"+m[1]+"'"))throw Error('Storage anchor lost: '+m[1]);
  const hrefs=[...after.matchAll(/\bhref=["']([^"']+)["']/g)].map(m=>m[1]);
  for(const m of before.matchAll(/\bhref=["']([^"']+)["']/g))if(!hrefs.includes(m[1]))throw Error('Storage source URL lost: '+m[1]);
  bodies.forEach((body,i)=>a.sections[i][1]=body);
  const summaries={'storage-recovery':'从一组文件组成可恢复版本，讲清保存、发布、校验与恢复的先后关系。','k8s-storage':'沿应用目录找到后端数据，再把卷的创建、挂载与业务恢复连起来。'};
  a.desc=summaries[a.id];a.intro=a.desc;a.updated='2026.11.08';
 };

 const recovery=select('storage-recovery',['两个文件写完了，哪个版本可交给读者','先固定一致的训练切面，再列清单','把慢速数据写入与短小的发布动作分开','两个发布者竞争时，谁能推进当前引用','在本地分别观察中断、损坏和成功恢复','副本保护可用性，恢复还要看历史与时间','验收：让真实消费者说恢复完成了','配套实战：完整恢复、缺段拒绝与消费者继续']);
 const r=recovery.sections.map(s=>s[1]),r4=blocks(r[4]),r7=blocks(r[7]);
 if(r4.length!==3||r7.length!==3)throw Error('Storage recovery code layout changed');
 replace(recovery,[
 p('前面的存储读取章解释了对象、文件和块设备怎样提供字节。本章接着回答：一份需要多个文件的状态，怎样成为可交给程序恢复的版本？以训练检查点为例，权重决定模型当前数值，优化器状态决定下一次怎样更新，数据游标记录读到哪里，随机数状态影响后续随机操作；恢复所需成员由训练程序约定。',
 '保存检查点的程序是生产者，加载它继续工作的程序是消费者。一个版本把同一次保存的成员组织在一起；清单列出成员身份及校验信息；当前版本引用 CURRENT 指向已经发布的清单。数据文件可以很大，引用通常很小，二者承担不同职责。')+
 table(['对象','保存什么','消费者怎样使用'],[['版本成员','权重分片、游标等实际内容','按清单给出的身份读取'],['版本清单','必需成员、训练步号、格式与摘要','检查集合、内容及兼容性'],['当前引用 CURRENT','被选为当前版本的清单身份','开始恢复时读取一次，固定本次版本'],['恢复结果','加载后的状态与后续工作','由目标程序运行并校核']])+
 p('例如 v2 约定包含两份权重分片、一份优化器状态和一份游标。只上传两份分片时，目录中确实有文件，但 v2 还没有备齐。生产者继续准备 v2，消费者仍沿 CURRENT 读取已发布的 v1；准备过程与已发布集合因此可以同时存在。'),

 p('先确定“保存哪一次状态”，再生成清单。一致切面是按程序约定可以共同恢复的一组状态：例如完成 step 240 的参数更新后，同时保存对应权重、优化器、随机数和下一批数据的位置。若权重来自 240、优化器来自 241，文件各自可读，组合却可能无法正确继续训练。',
 '分布式训练中的 rank 是一个参与训练的进程编号。多个 rank 分别保存分片时，框架或协调协议需要规定保存时点、成员集合及完成条件。协调者收齐成功回执之后，还要检查它们是否属于同一次保存；拷贝各进程碰巧可读的状态，不能建立这种关联。')+
 table(['题设：4 个 rank 保存 step 240','检查结果','发布决定'],[['只收到 3 份必需分片','成员不齐','继续等待或终止本次保存'],['收到 4 份，其中一份标为 step 241','成员齐，切面不同','拒绝组合为 step 240'],['必需成员齐全，切面与校验均符合约定','得到可验证版本','写清单，进入发布阶段']])+
 p('清单为每项记录不可变的对象键或文件名、字节数、内容摘要和格式版本。摘要是按内容计算的校验值，用来发现相对可信清单的变化；格式版本告诉消费者怎样解释字节。清单还应记录共同训练步号和本次保存身份，使“少了一项”和“拿错一项”都能被明确报告。')+
 fold('清单来自外部时，还要验证什么',p('摘要的参照物是清单，因此清单本身需要来自可信发布方。若同一人能同时替换文件和摘要，普通散列无法证明来源。解析清单还要限制允许的路径、对象前缀与大小，避免恢复程序按不可信路径读取任意文件。')),

 p('正常发布按四步完成：在新版本位置写成员；核对成员和共同切面；写入完整清单；最后更新 CURRENT。已发布版本的成员保持不变，修改内容时生成另一个版本。这样较慢的多文件写入可以并行，改变当前版本只需要一个短小的提交动作。',
 '消费者先读一次 CURRENT，记住清单身份，再按这份清单加载全部成员。即使期间 CURRENT 从 v1 切到 v2，这次恢复仍使用 v1。若每打开一个文件都重新寻找“最新版本”，反而可能混用两个版本。图中数据、清单和引用三层，分别对应写内容、验证版本和选择版本。')+figures(r[2]).join('')+
 p('本地实验通过 os.replace 替换 CURRENT：在支持其语义的同一文件系统内，成功替换让其他读者看到旧名字内容或新名字内容。对象存储则可以把 CURRENT 做成一个小对象，利用该产品的单对象更新和条件写机制提交；S3 的单键强一致性使成功写入可被后续读取观察。多份成员仍由清单协议组织。')+
 fold('实现边界与原始资料',p('原子可见性描述读者会看到哪一个完整引用；持久性描述故障后还能保存哪些内容。os.replace 本身没有验证掉电后的数据与目录持久化，跨文件系统也可能失败。对象存储没有可直接照搬的目录 rename；应按真实 API 设计提交单位，并分别验证写入、权限与故障恢复。')+paragraphs(r[2],'source-at')),

 p('发布者只有一个时，它按业务顺序推进 CURRENT。发布者有多个时，需要同时约束“谁可以提交”和“提交基于哪个前值”。条件写可把预期前值与更新放在同一个存储操作中检查；这种“仍等于我刚才读到的值才修改”的方式，也称比较并交换。',
 '设 A、B 都读到 v1。A 准备 v2 较慢，B 先把 CURRENT 从 v1 推到 v3。A 再提交时携带“当前仍为 v1”的条件，检查失败便不能覆盖 v3。A 重新读取当前引用，再决定放弃、重新准备或发起一次明确的回退；版本数字本身不会替系统执行这项规则。',
 'S3 的 If-Match 条件使用当前对象的 ETag 作比较。ETag 在这里用于识别所比较的对象状态，文件内容另按清单摘要核对。若发布请求超时，生产者先读取 CURRENT 与本次提交身份，判断是否已经成功，再决定重试。消费者固定版本期间，旧版本成员还要保留到读者使用结束；可用读者登记、保留窗口或租约管理删除时机。')+
 fold('条件写的产品语义',paragraphs(r[3],'source-at')+p('条件失配、并发删除和可重试错误的处理由所用 API 规定。ETag 也不应在各种分段上传或加密方式下一概解释为文件的通用密码学摘要。')),

 h('subsection-5-1aqdkow','本地发布：中断草稿与损坏版本')+
 p('先运行发布实验，观察失败发生在哪一层。infra_lab.py 用固定示例字节模拟版本成员，创建 v1 及摘要清单，再以本地原子替换发布 CURRENT；v2 留下未提交草稿；v3 的内容与清单不符，校验失败。恢复读者继续使用通过清单验证的 v1。')+
 table(['准备状态','消费者应采取的动作'],[['v1 成员及清单有效，CURRENT 指向 v1','固定 v1 并读取其成员'],['v2 只写了一部分，尚未发布','忽略草稿，继续使用当前版本'],['v3 内容与摘要不符','报告校验失败，拒绝恢复该版本']])+r4[0]+
 (r[4].match(/<div class="download-box">[\s\S]*?<\/a><\/div>/)?.[0]||'')+
 p('核对记录时，要把 CURRENT 的值、清单成员和最终读入内容串在一起。进一步注入故障时，可分别选在“清单完成、引用未更新”和“引用已更新、生产者未记成功”两处：前者应继续提供旧版本，后者需要通过读取引用消除生产者的结果未知。')+
 '<div class="mechanism-core" id="backup-consistency-point">'+h('subsection-5-98f1by','数据库备份：一致状态还要达到目标版本')+
 p('数据库把相关状态放在数据文件和日志中。SQLite 的 WAL 是预写日志，已提交修改可以先留在 WAL，随后由 checkpoint 写回主文件。本例先把余额 100 / v1 写入主文件，再提交 120 / v2；此时只复制主文件，会漏掉 WAL 中的 v2。',
 '读事务又引入另一个时间点：读连接在 v2 建立快照后，写连接提交 v3，它仍读取一致的 v2。从这个旧读事务做 backup 得到 v2；从新连接做 backup 才得到本题要求的 v3。图中的三个副本都要分别检查结构、业务账本和最低版本。')+figures(r[4]).join('')+
 table(['实际运行的副本或后续动作','余额 / 版本','本题最低要求 v3'],[['只复制主文件','100 / v1；integrity_check 为 ok','未达到'],['旧读事务的 backup','120 / v2','未达到'],['新连接的 backup','130 / v3','达到'],['在原库提交误写','999 / v4','保留原库也保留误写'],['把 v3 恢复到隔离库，再正常写入','130 / v3 → 131 / v4','验证恢复后可以继续工作']])+'</div>'+
 p('运行下面程序可复查这组结果。恢复库和原库各自产生的 v4 属于不同历史分支，正式切换还要给恢复目标确定身份并隔离旧写者。两项实验分别验证本地发布可见性和真实 SQLite 的备份、事务；云存储、CSI 与主机掉电需要各自的环境验证。')+r4[1]+
 fold('wal_backup.py 完整源码',r4[2])+paragraphs(r[4],'practice-links'),

 p('副本是在另一处维护数据，主要帮助系统承受相应设备或节点故障；复制也可能传播误写。版本历史保留过去状态；备份把某个恢复状态及所需材料纳入保留、权限和恢复流程。设计时先列出要承受的事件，例如节点丢失、误删或同一账号误操作，再检查恢复材料是否也会在该事件中一起失去。',
 'RPO 是业务允许损失多少近期数据的恢复点目标；事故中的实际缺口，要从故障时刻回看最近可用内容所属时刻。题设 10:00 捕获一致快照，10:08 完成上传与校验，10:20 故障，期间没有可用日志或更新快照。能够恢复的内容仍属于 10:00，因此时间缺口为 20 分钟。',
 'RTO 是从约定起点到恢复服务的时间目标。若本题从故障开始计时，确认故障与选版本 5 分钟、取得权限与下载 8 分钟、加载和一致性检查 4 分钟、业务探测 3 分钟，串行路径合计 20 分钟。RTO 若为 15 分钟，就要缩短整条路径；预置权限、并行下载和优化加载分别影响其中不同阶段。')+
 fold('对象版本与复制的产品资料',paragraphs(r[5],'source-at')),

 p('恢复完成由消费者的工作定义。模型需要加载约定的全部状态、核对训练步与数据游标，并继续一小步；数据库需要验证业务 ID、金额及跨表关系，再执行代表性后续事务。文件能下载、进程能启动和简单查询成功，分别是恢复链中的阶段证据。',
 '跨系统的业务还需要共同恢复点。例如数据库中的一条报告记录，引用某个不可变对象版本；数据库恢复到较新的提交，而对象版本缺失，用户仍然打不开报告。恢复程序应逐项验证引用内容，选择材料齐全且满足业务目标的历史。')+
 fold('配套完整切面实验：数据库进度与报告内容',p('consistent_recovery_cut.py 使用真实 SQLite 备份和事务，报告对象为本地固定样本，增量历史为自定义应用日志。故障时刻设为 12:00，RPO 设为 15 分钟。缺少 object-v3 时，数据库可前进到 11:57 / 序号 103，结构检查为 ok，但其中报告不可读；最后完整业务前缀停在 11:42 / 序号 101，缺口 18 分钟，未达到目标。补齐对象后才可恢复到 11:57，缺口 3 分钟。这里的分钟是题设时间，并非实测恢复耗时。')+
 '<p class="practice-links"><a href="labs/recovery-artifacts-retrieval/consistent_recovery_cut.py" download>下载完整切面实验源码 ↓</a><a href="labs/recovery-artifacts-retrieval/validation.json" target="_blank" rel="noopener">查看切面实验记录 ↗</a></p>')+
 p('练习：v5 需要四个分片和一份游标，故障时只写完三份。说明消费者选择什么；若后来收齐成员，但一份属于下一训练步，说明提交检查怎样处理。再分别为模型和数据库写出一次实际后续操作，并计算上节的恢复点缺口与串行恢复时间。')+
 fold('核对答案与演练记录',p('消费者固定已提交引用，尚未提交的 v5 保持草稿；成员齐全但切面不同仍拒绝提交。模型继续训练并核对游标，数据库核对业务关系并完成后续事务。上节两项时间均为 20 分钟。演练记录还应给出恢复发起身份、凭据来源、隔离目标和切换条件，使恢复流程能在原节点不可用时执行。'))+
 '<p><a class="inline-link" href="#/article/checkpoint-recovery">继续验证训练检查点恢复 →</a></p>',

 p('把前面的清单与恢复点用在账户案例中。基线余额为 100，确认历史依次是 T101/+10、T102/+20、T103/−5，目标停在 T103，余额应为 125；T104 随后误清零，不属于目标。可用材料是一份一致基线和从基线到目标的连续日志。',
 '程序先检查日志序号和每笔意图，再通过 SQLite Backup API 复制基线；重放时把余额效果、操作回执和恢复进度放在同一事务里提交。稳定序号用于识别重复请求，相同序号却不同参数则拒绝。这里的 T101 等由应用定义，日志也是自定义应用日志。')+
 table(['运行分支','关键检查','实际结果'],[['完整恢复到 103','基线加连续 101—103，排除 104','余额 125，进度 103'],['缺少 102，仍要求到 103','验证连续历史','创建恢复库前拒绝'],['再次提交 103，或同序号改参数','核对已有回执与原意图','重复无效果；异参拒绝'],['恢复后执行新 104/+5','提交新事务并核对账本','余额 130，进度 104']])+r7[0]+
 fold('本次完整执行结果',r7[1])+
 fold('recovery_lab.py 完整源码',r7[2])+
 h('subsection-8-1oqqcgn','衔接 MySQL：从教学序号到引擎恢复坐标')+
 p('下一章的 <a href="#/article/mysql-recovery">MySQL 恢复</a>把这条流程放进真实 InnoDB 与 binlog 环境：一致导出带上源坐标，重放连续日志，在误写事务前停止，再核对回执并继续写入。已有 MySQL 8.4.13 实验记录还对照了数据库进程强制退出与历史恢复，帮助区分“恢复当前已提交状态”和“回到误写前”。')+
 fold('旧操作手册与实验范围',p('包内 MySQL 8.4 PITR 手册是早期仅审阅的操作步骤；它当时没有执行数据库服务。后来 mysql-recovery 章的独立实验已有真实 MySQL 执行记录，两份材料应分别查看。上面的 SQLite 程序验证备份、事务和应用日志重放，不把自定义日志解释成 MySQL binlog 或数据库内部 WAL。')+
 '<p><a href="labs/cloud-deepening/mysql-pitr.md" download>下载 MySQL 8.4 PITR 操作手册 ↓</a></p><p><a href="labs/transport-recovery/validation.json" target="_blank" rel="noopener">查看真实 MySQL 恢复记录 ↗</a></p>')+
 paragraphs(r[7],'practice-links')
 ]);

 recovery.sections[7][1]+=
 h('native-postgres-pitr','实战 · PostgreSQL 重放到误清零之前')+
 p('沿用上面的账户。基线是 100，T101 加 10，T102 加 20，T103 减 5，余额为 125。T104 把余额误清为 0。把这份输入放到 PostgreSQL，业务序号只用来查账。数据库内部用预写日志（WAL）记录能够重做的变化，并用日志位置（LSN）定位记录。')+
 trainingFigure('postgres-pitr-wal','同一份基础备份和归档日志可以恢复到不同位置。先选停在哪一条记录，再核对业务余额。')+
 p('基础备份保存一份可以作为恢复起点的数据目录。归档把已完成的 WAL 段保存到独立位置。恢复实例从基础备份启动，按需取回 WAL 段，逐段重做。只要一段缺失，后面的段即使齐全也无法跨过缺口。')+
 p('T103 提交后，在源库写下具名恢复点。它在 WAL 中占一个位置。恢复目录里的 <code>recovery.signal</code> 让 PostgreSQL 进入归档恢复，<code>restore_command</code> 从归档取所需文件，<code>recovery_target_name</code> 让实例在指定标记处结束重放。若沿源时间线重放到归档末端，则会把 T104 一起重做。')+
 trainingCode('在隔离恢复目录指定停止位置','TEXT',"recovery_target_timeline = '1'\nrecovery_target_name = 'after_t103'\nrecovery_target_action = 'promote'")+
 table(['核对对象','停在 T103 后','重放到归档末端'],[
  ['SQL 读到的余额','125','0'],
  ['确认历史','T101、T102、T103','还包括误清零的 T104'],
  ['恢复验收','与选定历史相符，随后验证可写','进程可用，但账户状态不符恢复目标']
 ])+
 p('先用 <code>pg_verifybackup</code> 核对基础备份，再用同一份备份与归档分别启动两个独立数据目录。具名副本提升后写入 T105，加 5，余额从 125 变为 130。重新查原库，仍是误清零后的 0。两份副本提升后各自得到时间线 2，分叉点不同，核对恢复材料时要把时间线编号和分叉位置一起看。')+
 h('postgres-missing-wal','缺少目标 WAL 段，恢复停在哪里')+
 p('只从归档副本移除 <code>archive.target_segment</code> 指定的 WAL 段，再要求停在 <code>after_t103</code>。<code>missing_wal.started</code> 为 <code>false</code>，服务端日志记录 <code>recovery ended before configured recovery target was reached</code>，即归档重放结束时还没到配置的恢复点。已核对的基础备份依然可用，缺少的是从备份走到目标的一段历史。')+
 p('另一套独立实验使用相同的账户变更，目标也停在 T103 之后。MySQL 脚本自行选择交给工具的日志文件，后续行事件能恢复余额 125，仍需用回执发现 T101 缺失。<a href="/article/mysql-recovery/#mysql-missing-binlog">回到 MySQL 的缺文件实验 →</a>')+
 p('按实验包说明准备 PostgreSQL 17 镜像后，运行 <code>python3 -B postgres_pitr.py --output replay.json</code>。在结果中分别定位归档文件、具名恢复点、两条历史的查询结果和启动失败记录。实例就绪只是验收的一步，切流前还要核对余额、事务范围和新事务。')+
 p('带着这三组恢复结果到<a href="/article/resilience/#recovery-postgres-native-checkpoints">C9.4 填恢复验收记录</a>。先核对 T103 是不是允许的业务恢复点，再查哪些数据还需要从应用和用户侧取得。')+
 '<p class="practice-links"><a href="/labs/postgres-pitr.zip" download>下载 PostgreSQL 实战包 ↓</a> · <a href="/labs/postgres-pitr/validation.json">查看 WAL、恢复点和 SQL 验收记录</a></p>'+
 '<p class="source-at"><a href="https://www.postgresql.org/docs/17/continuous-archiving.html">PostgreSQL 17 连续归档与时间点恢复 ↗</a></p>';
 recovery.updated='2026.11.12';
 cloudKnowledgeExplanations['backup-restore']+=p('从同一份基础备份分别恢复到具名标记和归档末端，观察账户为什么会得到两个结果。<a href="/article/storage-recovery/#native-postgres-pitr">运行 PostgreSQL WAL 对照 →</a>');

 const storage=select('k8s-storage',['文件放在哪里：容器、临时卷与持久卷','从PVC到应用路径：绑定只是中间一步','拓扑与延迟绑定：一起选择节点和卷','访问模式、并发写入与旧写者隔离','容量、IOPS、吞吐与扩容','快照与备份：一致性和恢复点分别验收','从Pending到文件内容的排查实战','恢复练习：让消费者继续完成工作']);
 const k=storage.sections.map(s=>s[1]),k6=blocks(k[6]),k7=blocks(k[7]);
 if(k6.length!==5||k7.length!==2)throw Error('Kubernetes storage code layout changed');
 replace(storage,[
 h('subsection-1-trt373','容器路径与数据生命周期')+
 p('前面的工作负载章节说明了 Pod 怎样被重建。本章给重建后的进程找回数据：应用打开 /data/progress.sqlite 时，/data 是进程看到的目录；目录背后可以是容器可写层，也可以是挂载进来的卷。挂载是把一份存储接到进程的某个路径，因此先认清这条关联，才能判断文件随什么对象保留。')+
 table(['数据位置','随什么保留','典型用途'],[['容器可写层','随本次容器实例；重建容器应预期重新开始','可重新生成的临时文件'],['emptyDir 临时卷','随同一个 Pod；容器重启可继续使用，Pod 删除后移除','Pod 内容器共享的临时工作区'],['节点本地路径','随指定节点上的文件；换节点需要重建或恢复','可重建缓存，或有专门恢复方案的本地数据'],['持久卷','卷生命周期可独立于单个 Pod','替换 Pod 后继续使用的数据库等状态']])+
 p('例如旧 Pod 把已确认进度写在持久卷，替换 Pod 把同一卷挂到 /data，程序便能读取同一份进度。若程序实际写入 /tmp/progress.sqlite，/data 的持久卷就没有参与这次写入。挂载还会遮住镜像中同路径的原有内容，镜像文件通常不会自动复制进新卷。',
 '找到原数据之后，数据库可能还要用日志恢复事务。下面依次走过声明、卷、节点、容器路径和业务读写，使每一步都能对应一个可检查对象。'),

 '<div class="mechanism-core" id="volume-binding-path">'+h('subsection-2-1ac2xpk','声明、卷对象与驱动接口')+
 table(['对象或接口','负责什么','本章示例'],[['PVC：持久卷声明','命名空间内应用提出的容量、模式和类别需求','app-data 请求 1Gi'],['PV：持久卷对象','集群级对象，记录后端存储身份及访问约束','与 app-data 绑定的卷对象'],['StorageClass：存储类','规定一类卷的制备驱动、参数与绑定策略','清单中的 your-csi-class 占位名'],['CSI：容器存储接口','让 Kubernetes 与具体存储驱动协作','按驱动能力创建、连接或挂载后端卷'],['后端卷与容器挂载','实际保存字节，并把访问路径交给应用','卷中的数据库出现在 /data']])+
 p('静态供应先由管理员准备 PV，再让 PVC 匹配；动态供应由 PVC 选择 StorageClass，制备组件调用驱动创建后端卷并关联 PV。绑定成功时，PVC 与 PV 建立一对一关系，PVC 的状态成为 Bound。真正的数据仍在后端存储。',
 '使用卷的 Pod 通过 persistentVolumeClaim.claimName 引用 app-data，再通过 volumeMounts 把这个卷放到容器 /data。调度器选择兼容节点，存储组件完成该驱动所需的连接和挂载，应用最后用自己的运行身份打开文件。图中的箭头把 API 对象、节点操作与应用内容连成同一条路径。')+figures(k[1]).join('')+
 table(['到达的阶段','可以核对的证据','下一步'],[['PVC Bound','PVC 的 volumeName 与 PV 的 claimRef 对应','检查 Pod 放置与卷拓扑'],['节点卷路径可用','相关事件、驱动状态和实际挂载','检查容器路径与进程权限'],['文件成功打开','运行身份与目标路径','核对数据库及业务版本'],['业务操作成功','提交回执、数据校验与后续读写','记录本次验证覆盖的故障场景']])+'</div>'+
 fold('不同驱动和卷形式',p('CSI 驱动并非都需要独立的设备 attach 步骤，应按实际驱动查看控制组件、节点组件和事件。文件系统卷通常用 volumeMounts 提供目录，原始块卷用 volumeDevices 提供设备路径；应用及格式化职责也随卷形式而变。')+'<p><a href="https://kubernetes.io/docs/concepts/storage/persistent-volumes/" target="_blank" rel="noopener">Kubernetes · 持久卷、声明与访问模式 ↗</a></p>'),

 h('subsection-3-meie0t','让节点资源与卷拓扑共同参与放置')+
 p('卷拓扑规定存储能从哪些位置访问，例如某个可用区中的块卷只支持该区节点连接。Pod 放置还要满足 CPU、内存、节点选择器等条件。已有卷时，调度器需要找出这些条件的交集；空余资源总量不能代替逐节点判断。',
 '题设：Pod 请求 2 核、4GiB，现有卷只可在 AZ-a 连接。下表资源均为扣除已有请求后的余量。')+
 table(['节点','空余 CPU / 内存','可用区','本题判断'],[['n1','2 核 / 2GiB','AZ-a','卷可访问，内存不足'],['n2','4 核 / 8GiB','AZ-a','资源与卷位置都满足'],['n3','8 核 / 16GiB','AZ-b','资源充足，卷位置不匹配']])+
 p('StorageClass 的 Immediate 模式在 PVC 创建后就进行相应绑定或制备。WaitForFirstConsumer（等待首个消费者）则延后到出现使用该 PVC 的 Pod，再把 Pod 的资源与放置条件一起纳入选择或制备。后者适用于相应驱动支持的拓扑场景，尚无消费者时 PVC Pending 可以是正常等待。',
 '延迟绑定只协调已有可选条件。若 Pod 被硬性要求放在 AZ-b，卷却只能在 AZ-a 使用，仍需修改放置或按存储支持的方式迁移数据。需要限定节点时，用节点选择器或亲和规则让调度器参与；直接填写 nodeName 会绕过调度器，使相关延迟绑定可能一直等待。')+
 fold('绑定模式原始资料','<p><a href="https://kubernetes.io/docs/concepts/storage/storage-classes/" target="_blank" rel="noopener">Kubernetes · StorageClass 与 volumeBindingMode ↗</a></p>'),

 h('subsection-4-zqe3e','访问模式、文件协议与业务事务')+
 p('访问模式描述卷可怎样被节点或 Pod 使用。先按应用需要选择模式，再确认驱动支持及实际挂载方式；并发修改同一份数据时，还要选择适合该存储的文件锁、原子操作或数据库事务。')+
 table(['模式','主要含义','对应用的影响'],[['ReadWriteOnce / RWO','由单个节点读写挂载','同节点多个 Pod 仍可能共享此卷'],['ReadOnlyMany / ROX','支持多节点只读挂载','实际只读挂载和后端权限共同限制写入'],['ReadWriteMany / RWX','支持多节点读写挂载','应用文件格式和并发协议需要支持这种共享'],['ReadWriteOncePod / RWOP','在支持该模式的 CSI 环境中限制为单个 Pod 使用','用于需要单 Pod 访问的工作负载']])+
 p('例如两个进程都读到 count=0，再各自写成 1，最终值可能仍为 1。卷成功共享，只意味着两者访问到了同一份内容；数据库事务要把读取旧值、修改和回执组织成受保护的操作。后面的 volume_writer.py 用 SQLite 事务演示这层关系。将普通文件系统同时交给多台机器当作本地块盘写入，还可能破坏文件系统结构，必须按存储支持的共享方式使用。',
 '故障切换还有旧写者问题：旧节点失联时，它可能只是与控制面断开，仍有能力写存储。让新 Pod 接管业务身份前，存储或数据库方案要确认旧写者已被停止或拒绝写入，这称为写入隔离。删除旧 Pod 的 API 对象不能完成对旧进程与存储访问的确认。')+
 fold('访问模式的适用范围',p('RWO、ROX、RWX 本身不在卷挂载后实施文件写保护，仍需实际挂载参数、后端权限及应用协议。RWOP 仅支持 CSI 卷，需要相应 Kubernetes 与驱动组件支持；它限制 Pod 使用范围，业务主身份、复制和历史恢复由对应系统管理。')),

 h('subsection-5-11rv5av','用操作大小连接 IOPS、吞吐与延迟')+
 p('容量是可存多少字节；IOPS 是每秒完成多少次 I/O 操作；吞吐是每秒搬运多少字节；延迟是一次操作从发起到完成花多久。声明 10Gi 只提出容量需求，性能还取决于存储类、后端、节点和应用访问方式。')+
 table(['题设操作','由哪项先限制','理想上界'],[['16KiB，3000 IOPS，上限 125MiB/s','IOPS','3000 × 16KiB = 46.875MiB/s'],['1MiB，同样上限 125MiB/s','吞吐','125 次/s']])+
 p('这些是固定操作大小、忽略其他限制的容量题。应用实际经过队列、系统调用、文件系统、缓存与后端；测试要固定读写比例、顺序或随机、并发及缓存冷热，再记录有效完成量和尾延迟。热页缓存的读取结果描述的是缓存路径。',
 '在稳定窗口中，若平均完成 3000 次/s、平均驻留 4ms，平均在途数约为 3000×0.004=12。这里的在途数同时包含执行与等待；增加并发能否提高完成量，要通过同一工作负载验证，队列增长也可能只增加等待。',
 '扩容沿另一条状态链完成：提高 PVC 请求容量，由支持扩容的存储类和驱动扩展后端，再由节点侧完成所需文件系统处理，最后核对应用可见空间。分别记录这几层的实际容量和事件。缩容与跨区迁移使用各自支持的流程。'),

 h('subsection-6-98f1by','从保留后端卷到恢复目标状态')+
 p('Pod 替换通常继续使用当前卷；历史恢复则要选回过去的一份状态。PV 回收策略 Retain 表示 PVC 删除后保留后端数据供后续管理；快照保存某一时刻或协调边界的存储状态；备份把可恢复内容、所需日志与恢复流程一起管理；恢复点说明消费者要回到哪一笔已确认业务。')+
 '<div class="mechanism-core" id="backup-consistency-point">'+p('以本章数据库为例：SQLite 在 WAL 模式下先把新提交留在日志，随后通过 checkpoint 写回主文件。实验把 100 / v1 固定在主文件，再提交 120 / v2；仅复制主文件仍可打开，却只得到 v1。复制了哪个文件，与备份覆盖哪个提交，需要分别检查。',
 '读事务还会固定自己的快照：旧连接停在 120 / v2，另一连接已提交 130 / v3。旧连接做 backup 得到内部一致的 v2，新连接的 backup 得到 v3。若本次最低要求是 v3，便选择后者，再恢复到隔离位置并尝试后续写入。')+figures(k[5]).join('')+'</div>'+
 p('CSI 快照需要快照资源、控制器和支持该功能的驱动。VolumeSnapshot 就绪表示对应快照流程达到该接口的就绪状态。数据库若依赖多个卷、日志或外部消费进度，应通过数据库备份、日志衔接或协调冻结确定共同恢复点，再用应用读取验证。Retain 会同时保留正确写入和后续误写，因此历史恢复仍需可选的旧状态。')+
 fold('快照资料与恢复分支身份','<p><a href="https://kubernetes.io/docs/concepts/storage/volume-snapshots/" target="_blank" rel="noopener">Kubernetes · 卷快照所需组件与对象 ↗</a></p>'+p('本例原库误写后为 999 / v4，隔离恢复库后续正常写入后为 131 / v4。两个 v4 属于不同历史分支；切换时应标明恢复目标身份，并完成旧写者隔离。下面的 SQLite 实验验证数据库内容，没有执行 CSI 快照。')),

 h('subsection-7-1lng3cb','沿声明、节点、路径和内容定位故障')+
 p('排查从应用要读写的路径出发，把 app-data、其绑定 PV、后端卷身份、Pod 节点和容器 /data 串起来。按阶段找第一个未完成环节，就能选择下一条检查，而不是反复重建 Pod。')+
 table(['观察','检查对象','下一步问题'],[['PVC Pending','StorageClass、PVC 事件与消费者 Pod','正常延迟绑定、匹配失败，还是制备失败？'],['PVC Bound，Pod 未运行','Pod 调度条件、卷拓扑与节点事件','能否找到同时满足计算和卷条件的节点？'],['Pod 已调度，卷不可用','实际驱动的连接、挂载事件','哪个节点或存储操作失败？'],['应用报权限错误','实际挂载路径、运行用户与安全上下文','进程是否有目录和文件权限？'],['数据库能开，业务值错误','版本、回执与历史材料','读到的是不是本次目标状态？']])+
 fold('只读检查命令：替换命名空间、PVC 与 Pod 名称',k6[0])+
 p('下面的 PVC 片段提出 1Gi、RWO 和存储类需求。your-csi-class 需要换成测试集群已有的存储类。消费者另用 claimName: app-data 引用声明，再挂到程序实际使用的 /data；仅创建声明还没有建立应用路径。')+
 fold('PVC 声明片段',k6[1])+
 h('subsection-7-1ip16iv','两个独立 Job 读取同一份已提交进度')+
 p('下载包提供四份 JSON：命名空间、app-data 声明、storage-writer-1 和 storage-writer-2 两个 Job。Job 是把一项工作运行到完成的工作负载。两个 Job 顺序使用同一 PVC，将 volume_writer.py 放到 python:3.12-slim 容器内运行，并把 SQLite 文件写在 /data。复查时记录实际镜像身份 imageID、PVC/PV 身份、Pod 的唯一标识 UID 与节点。',
 '每项逻辑写入带一个稳定操作 ID：write-1 或 write-2。程序在同一 SQLite 事务内更新计数并保存回执，重复 ID 返回原回执。全新空卷第一次执行 write-1 得到 0→1，再执行 write-2 得到 1→2；重投 write-1 时，原回执仍是 after=1，当前计数保持 2。这样才能把 Job 重试与新的业务动作区分开。')+
 fold('测试集群执行步骤与预期观察',p('先替换存储类，按下面顺序等待第一项完成，再创建第二项。若卷已有数据或操作曾执行，按保存的回执解释结果。无消费者的延迟绑定 PVC 可先等待；创建 Job 后，再追踪绑定、放置、挂载和业务输出。')+k6[2]+
 '<p class="practice-links"><a href="labs/storage-quant-context/storage-namespace.json" download>命名空间清单 ↓</a><a href="labs/storage-quant-context/storage-claim.json" download>PVC 清单 ↓</a><a href="labs/storage-quant-context/storage-job-1.json" download>Job 1 清单 ↓</a><a href="labs/storage-quant-context/storage-job-2.json" download>Job 2 清单 ↓</a></p>')+
 p('这份相同源码已在本地 SQLite 实际执行，以下命令运行临时目录测试。集群 JSON 已生成，记录中的 cluster_executed 为 false；上述 Job 流程还需在目标 CSI 环境执行，才能取得平台存储路径的证据。')+k6[3]+
 table(['本地实际操作','原回执 before → after','当前计数'],[['首次 write-1','0 → 1','1'],['首次 write-2','1 → 2','2'],['再次 write-1，duplicate=true','0 → 1','2']])+
 fold('volume_writer.py 完整源码',k6[4])+paragraphs(k[6],'practice-links')+
 p('两个 Job 的成功可以验证这次路径与数据连续性。若目标还包括节点故障后的恢复，则继续演练新节点访问、旧写者隔离和数据库恢复，并保存相应事件与消费者结果。'),

 h('subsection-8-7y42a4','以业务恢复点与后续事务验收')+
 p('题设：10:00 备份包含业务序号 100，10:01 确认序号 101，10:02 故障。卷重新挂载后只读到 100。说明缺少哪一笔确认工作，以及还有哪些材料可能把它恢复出来；再列出挂载之后到恢复服务之前的步骤。',
 '验收应从最低目标版本开始：选择覆盖目标的一致备份和连续历史，在隔离位置加载，核对结构、业务回执及金额，再执行新的事务。若最低版本是 v3，旧事务得到的 v2 备份即使 integrity_check 为 ok，仍未达到目标。下面程序实际把 130 / v3 恢复后写到 131 / v4，验证该恢复库能继续本题的业务。')+
 fold('核对恢复题',p('已确认的序号 101 尚未出现在恢复库中；需要检查备份后的日志或其他可信材料，确定它是否可达。从故障开始计时的 RTO，还包括材料获取、数据库恢复、业务校验、身份及流量切换等约定步骤。若材料不足，应明确可达恢复点及其缺口。'))+
 fold('复跑 SQLite WAL 备份与恢复实验',p('程序创建真实数据库及独立读写连接，依次检查主文件副本、旧读快照、新连接备份和隔离恢复。它与前节卷写入程序检查不同层：前者选恢复内容，后者检查同一路径上的事务效果。')+k7[0]+
 table(['保存或恢复分支','本次实际值'],[['主文件副本','100 / v1，结构检查 ok'],['旧读事务 backup','120 / v2'],['新连接 backup','130 / v3'],['原库后续误写','999 / v4'],['隔离恢复并继续','130 / v3 → 131 / v4']])+
 fold('wal_backup.py 完整源码',k7[1]))+paragraphs(k[7],'practice-links')+
 p('将同样的验收条件用于集群时，还要给出恢复卷身份、目标 Pod 与实际业务输出。数据库程序结果、CSI 操作结果和业务切换结果在同一份记录中关联，才能回答数据从哪里来、到了哪个恢复点，以及消费者是否已继续工作。')
 ]);

 storage.sections[2][1]+=p('第 7 节用一个节点实测从等待到绑定。先看 PVC 为 Pending 且没有绑定的 PV，再创建 Pod，核对新卷指向调度选中的节点。<a href="/article/k8s-storage/#native-csi-storage">查看动态供应与挂载实战 →</a>');

 storage.sections[6][1]+=h('native-csi-storage','原生 CSI 实战：等待绑定、替换 Pod 与回收')+
 p('这次在 Linux 上创建单节点 kind 集群，安装 Kubernetes CSI 社区的 Hostpath 示例驱动。驱动用 kind 节点内的目录保存数据。应用 Pod 引用 <code>app-data</code> PVC，由 kubelet 经驱动挂载到 <code>/data</code>。实战复用同一份 <code>volume_writer.py</code>，使用两个依次创建和删除的 Pod。')+
 '<figure class="training-figure"><a href="diagrams/csi-storage-lifecycle.svg" target="_blank" rel="noopener" aria-label="放大：两个 Pod 先后使用同一 CSI 卷"><img src="diagrams/csi-storage-lifecycle.svg" width="440" height="541" alt="PVC 等待首个 Pod，替换 Pod 接着用同一卷，最后检查 API 中的 PV 和节点内的目录均被回收" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>从延迟绑定到同卷换 Pod，再分别核对 PV 与后端目录。<a href="diagrams/csi-storage-lifecycle.svg" download>下载 SVG ↗</a></figcaption></figure>'+
 p('先创建 1Gi PVC。记录里有 <code>WaitForFirstConsumer</code> 事件，此时状态为 Pending，尚无 PV 引用这份声明。首个 Pod 就绪时，PVC 已绑定到 CSI PV。该 PV 的节点亲和性指向这个 kind 节点，<code>VolumeAttachment</code> 也显示驱动已将卷连接到该节点。')+
 table(['需要区分的身份','两次挂载的实际记录'],[['运行实例','首个 Pod UID 为 4e3e51ee…，替换 Pod UID 为 315ee23a…'],['声明和绑定','PVC UID 与 PV UID 均相同，PV 的 claimRef.uid 指向这份 PVC'],['后端卷','两次的 volumeHandle 均为 0795aef7…'],['应用数据','首个 Pod 执行 write-1，计数 0→1。替换 Pod 先只读取得计数 1 和原回执；复投仍为 1，新操作 write-2 推进到 2']])+
 p('两次写入后，容器文件和节点后端文件的 SHA-256 分别一致。替换 Pod 写入前读到的文件摘要也与首个 Pod 写入后的摘要相同。最后先删替换 Pod，再删 PVC。该 PV 的回收策略为 <code>Delete</code>。程序分别确认 PV 对象消失、同一个卷句柄对应的节点目录消失，再核对自建集群已清理。这里验证的是示例驱动在一个节点上的回收过程，数据仍以本地目录为后端。')+
 p('解压后进入 <code>csi-storage</code> 目录。第一条命令在 Linux amd64 Docker 上复跑并保存新记录；第二条离线检查随包发布的 CI 原始记录。')+
 trainingCode('复跑 CSI 实验并校验随包记录','SHELL','python3 -B csi_storage_lab.py --writer volume_writer.py \\\n  --output native-record.json\npython3 -B csi_storage_lab.py --check-record validation.json')+
 '<p class="practice-links"><a href="labs/csi-storage.zip" download>下载完整源码、说明和记录 ↓</a> · <a href="labs/csi-storage/validation.json">查看对象身份与回执 →</a> · <a href="https://github.com/CaptainGreenskin/infra-guide/actions/runs/42558047546">Linux CI 执行 ↗</a> · <a href="https://github.com/kubernetes-csi/csi-driver-host-path/blob/6fab18ae4fc4f486193b618114eeb817d9929242/deploy/kubernetes-1.35/hostpath/csi-hostpath-plugin.yaml">上游 CSI 驱动清单 ↗</a></p>';
 storage.updated='2026.11.09';
})();
