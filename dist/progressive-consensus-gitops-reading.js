/* Shared control state -> observed versions; Git intent -> objects -> processes -> HTTP.
   Load after existing progressive lessons and before first-reading-flow.js. */
(()=>{
 const p=(...rows)=>rows.map(x=>'<p>'+x+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="full-code"><summary>'+title+'</summary>'+body+'</details>';
 const take=(s,re)=>[...s.matchAll(re)].map(m=>m[0]);
 const pres=s=>take(s,/<pre\b[\s\S]*?<\/pre>/g);
 const blocks=s=>take(s,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=s=>take(s,/<figure\b[\s\S]*?<\/figure>/g);
 const hrefs=s=>take(s,/\bhref=["'][^"']+["']/g);
 const ids=s=>[...s.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
 const bag=xs=>JSON.stringify(xs.slice().sort());
 const links=s=>take(s.replace(/<figure\b[\s\S]*?<\/figure>/g,'').replace(/<pre\b[\s\S]*?<\/pre>/g,''),/<a\b[^>]*\bhref=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/g);
 const linkRow=xs=>xs.length?'<p class="practice-links">'+xs.join(' · ')+'</p>':'';
 const published={'control-plane-consensus':['etcd-consensus-run','subsection-8-gy93cg'],'gitops-reconciliation':['gitops-native-run']};
 function select(id,titles,counts){
  const a=articles.find(x=>x.id===id);
  if(!a||a.sections.length!==titles.length||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Consensus/GitOps source layout changed: '+id);
  const s=a.sections.map(x=>x[1]).join('');
  if(JSON.stringify([pres(s).length,figures(s).length,hrefs(s).length])!==JSON.stringify(counts))throw Error('Consensus/GitOps source inventory changed: '+id);
  return a;
 }
 function rewrite(a,bodies,desc){
  const before=a.sections.map(s=>s[1]).join(''),after=bodies.join('');
  if(bodies.length!==a.sections.length||/<h2\b/i.test(after))throw Error('Consensus/GitOps H2 layout changed: '+a.id);
  if(JSON.stringify(pres(before))!==JSON.stringify(pres(after)))throw Error('Original consensus/GitOps code bytes or order changed: '+a.id);
  if(bag(figures(before))!==bag(figures(after)))throw Error('Original consensus/GitOps figure changed: '+a.id);
  if(bag(hrefs(before))!==bag(hrefs(after)))throw Error('Consensus/GitOps href multiset changed: '+a.id);
  const afterIds=ids(after);
  for(const id of [...ids(before),...published[a.id]])if(!afterIds.includes(id))throw Error('Consensus/GitOps anchor lost: '+a.id+'/'+id);
  if(new Set(afterIds).size!==afterIds.length)throw Error('Consensus/GitOps duplicate explicit anchor: '+a.id);
  bodies.forEach((body,i)=>a.sections[i][1]=body);a.desc=desc;a.intro=desc;a.updated='2026.11.09';
 }

 const consensus=select('control-plane-consensus',['先定位：控制面究竟要共同保存什么','三成员怎样把一次修改变成共同承诺','用revision解释读、事务与并发条件','先列举，再从同一版本继续观察','租约管理期限，不替你停止外部执行','网络分区与成员停机，分开验证','从快照恢复：数据基线、集群身份与缓存要一起处理','完整实战：从命令与状态读到独立验收'],[2,3,7]);
 const e=consensus.sections.map(s=>s[1]),e8=blocks(e[7]);
 if(e8.length!==2)throw Error('Consensus original code extraction changed');
 rewrite(consensus,[
 p('Kubernetes把运行期望保存为API对象，例如Deployment描述副本和Pod模板。API服务校验请求并读写对象；控制器读取这些对象，观察当前结果，再创建或调整工作负载。多个API实例需要共同认可一份状态，控制器也需要知道自己依据的是哪个版本。',
 'etcd为这类控制状态提供分布式键值存储：键定位一条记录，值保存内容；多个服务进程称为成员，共同保存并提交修改。每个成员有本地数据和协议状态，其中一个leader领导者组织复制。客户端可以连接成员执行读写，观察者还可持续接收变化。')+
 figures(e[0]).join('')+
 p('把图中的对象缩小到三个教学键。/lesson/config/limit保存并发配额37，即允许同时处理多少请求；release保存发布版本，route保存路由选择。客户端先读37，再请求改为42，存储确认后，观察者更新本地缓存并按新配额安排后续工作。存储提交、缓存处理和真实业务执行依次连接。')+
 table(['路径上的对象','持有什么','下一步使用什么'],[['API服务或其他客户端','本次读写请求与返回结果','确认的值及响应版本'],['etcd成员','复制日志和已应用的键值状态','集群可认可的修改顺序'],['观察者与缓存','已列举对象及已处理的变更位置','调谐所依据的当前状态'],['业务进程','正在处理的请求和外部数据','落实配置后产生的用户结果']])+
 p('配套实验用etcdctl直接访问自己的/lesson键，不运行Kubernetes API。真实Kubernetes的对象编码、校验和resourceVersion仍由API语义管理；应用数据库、文件和持久卷另由各自存储保存。'),

 p('以limit从37改42说明正常写路径。leader为操作安排Raft日志位置，将记录复制给其他投票成员；达到协议要求的多数确认后推进提交，再将已提交操作应用到键值状态，给客户端返回结果。Raft是一致性协议，借助日志、选举和提交规则，让成员在故障后仍沿相容的已提交历史继续。',
 '任期term是领导选举轮次，日志索引index定位Raft日志条目；已提交位置与已应用位置分别表示协议已确认到哪里、状态机已执行到哪里。成员可能已保存某条日志却尚未应用，客户端成功也不要求每个成员都已完成应用。写前日志WAL把恢复需要的有序记录留在持久存储，文件系统与设备需兑现对应持久性。')+
 table(['投票成员数N','多数门槛floor(N/2)+1','最多失去几个仍可能有多数'],[['3','2','1'],['4','3','1'],['5','3','2']])+
 p('floor表示向下取整。三成员的一票不足以提交，三票中的两票则可能继续；五成员需要三票。多数集合相交，配合Raft选举及日志规则，才保证后来的有效leader与已提交历史相容。四成员比三成员多一份成本，故障容忍数量仍为1。',
 '数量达标以后，成员还需能通信、选举和完成存储操作。第6节让两个互通成员提交42，而隔离的旧leader仍保留37，正好把共同提交与某个进程的本地状态分开。',
 '成功回复给出已完成操作的相应保证；客户端超时则可能发生在提交之前，也可能是提交后的响应丢失。恢复通信后应读取实际状态，条件更新还要重新检查前提。反复提交同一个业务效果时，仍需应用的操作身份与去重规则。'),

 p('键值层另外使用revision标记整个键空间的逻辑版本。修改键集合的事务按版本排序，一笔事务改多个键只推进一个相应revision。Raft日志还处理成员变化等协议工作，不能把日志索引当作键值修改次数；只读请求也不因此推进键空间版本。',
 '每个键还有三个字段：create_revision标记当前这次创建，mod_revision标记最近修改，version记录这次创建以来的版本次数。创建时version=1，后续PUT递增；删除再创建是新的创建历史。读取响应头的revision描述本次读取对应的键空间版本，即使这个键长期没改，响应版本仍可因其他键变化而前进。')+
 table(['这份实际记录中的读取','响应revision','limit值 / mod_revision / version'],[['初次写入并读limit','2','37 / 2 / 1'],['完成配置事务及租约实验后','6','37 / 2 / 1'],['多数侧写42后','7','42 / 7 / 2'],['原集群再次写43后','8','43 / 8 / 3']])+
 p('37并不对应revision37，42也不对应revision42。业务值、键的修改位置和全局读取位置是三个量。Kubernetes的resourceVersion还必须按API规定视为不透明值，业务程序不能因为底层用了etcd，就把它自行当整数计数器。',
 '默认get是线性化读取：可把操作看作在开始与完成之间某点发生。一次写42已经成功返回，此后才开始的线性化读不能退回该写之前的37；读期间若有并发修改，则按重叠操作的顺序解释。etcdctl --consistency=s允许从成员本地已应用状态返回，可能落后多数侧；这里称为可陈旧读取，它与SQL的可串行化事务隔离不是同一概念。',
 '有条件的修改把读取和下一次决定连起来。客户端最初取得limit的mod_revision=2；之后用服务端事务比较“这个键的mod_revision仍为2”，成立才写入。多数侧已经改成42、mod_revision变7后，旧比较失败，失败分支读取42。这个CAS比较并更新必须在服务端作为一个事务判断，不能由客户端先读后写模拟。'),

 p('控制器的缓存要先有基线，再接上变化。前缀/lesson/config/选中limit、release、route这一组键；list列举前缀下当前全部记录，返回对应revision R。watch订阅后续事件，从R+1开始便可补上列举结束到观察启动之间的变化，条件是这段历史仍被保留。',
 '实际程序先写limit=37、release=v1，列举得到R=3；然后开启从4接续的观察，用一笔服务端事务把release改v2、route设A。两个事件都带mod_revision=4，观察者将这一组变更应用到缓存。它们属于同一个键空间变化，watch不会把同一操作拆成只有一半的可见事件。',
 '事件交付以后，控制器还要更新缓存并执行调谐，Pod和业务结果又有各自进展。watch不提供线性化读的实时性保证；尚未收到事件，不能据此断言服务端尚未提交。接口的事件顺序与版本用于接续，业务是否已落实则由后续对象和请求检查。',
 '历史压缩compaction回收相应旧revision的历史访问能力，当前键仍保留。程序压缩到4后，再从旧R=3开始watch，收到取消及compact_revision；此时应重列举，取得新R，再从R+1接续。直接忽略取消会让缓存永久漏掉中间变化。',
 '键值历史压缩、数据库文件空间整理和Raft内部快照分别管理历史版本、文件空间与协议日志。它们不是同一次维护动作；本题压缩成功只说明旧历史观察失效。'),

 p('租约lease把一组键交给服务端按期限管理。客户端申请存活时长TTL，再在PUT时关联租约；需要继续有效就发送keepalive续约，撤销或到期后相关键被删除。owner键因此可表示“服务端仍认可这份限时登记”。',
 '程序在健康集群申请TTL=4秒，将/lesson/ephemeral/owner写为worker-A并关联租约，先读到键及匹配租约ID，随后不发送续约，轮询到键消失。这份键位于config前缀之外，仍属于同一键空间，所以写入和删除也会推进全局revision；后面快照在这些事件完成后取得revision6。',
 '4秒是请求的租约期限，观察到删除还经过服务端处理、提交与客户端轮询，程序给出总体等待期限，不要求恰好4.000秒出现。集群失去多数时，键删除同样需要取得相应提交条件。',
 '租约解决登记有效多久，外部业务系统决定谁能继续产生效果。旧worker与etcd断开后，可能仍能访问另一个存储；若要防止它继续写，效果接收方需校验当前获准身份或递增代次，并处理重复操作。键到期不能代替接收方的授权和提交。'),

 p('现在只改变成员间通信。三个etcd进程仍活着，将原leader断开专用Docker网络；客户端通过docker exec在该容器内连接127.0.0.1，仍能接触旧服务。其余两个成员互通，选出更高任期的新leader，再提交limit=42。多数侧的正常写路径仍然成立。')+
 figures(e[5]).join('')+
 table(['同一分区时段的操作','实际结果','对应前置条件'],[['多数侧写后默认读取','42，revision7','两个投票成员保持有效提交路径'],['隔离成员可陈旧读取','37，revision6','只使用自己的已应用状态'],['隔离成员默认读取、写99','均退出1','本题期限内无法完成所需一致性条件'],['原成员重新接入','默认读取42，revision至少7','接上有效历史并追平']])+
 p('旧成员可回答、回答37、多数已确认42，这三件事同时存在。因此不能把“集群多数能写”变成“任意旧leader都能返回最新值”。重连后的独立读取确认值仍为42，隔离时那次写99没有成为本例恢复后的状态；通用超时是否生效仍需另查实际结果。',
 '再恢复网络，改为停止原三成员中的两个。剩下一份完整数据只有1票，默认读写均失败；启动第二个原成员后，集群重新获得2票，写入并读到43，revision8；启动第三个后，三者都读43。恢复用的是原成员与原数据，没有把剩余成员另建成一个新集群。',
 '断网与停机是两次独立干预，均在同一Linux宿主的容器中实施。真实API与调度没有运行；控制面暂停时旧业务进程可能继续，配置更新、调度及用户请求要在它们各自的系统路径上观察。'),

 p('原成员数据还在时，可以像前节恢复原集群多数；多数数据永久丢失时，可信快照则提供另一个恢复起点。快照保存某个时点的键值基线，恢复工具据此建立新的成员与集群身份，再启动新集群。它不包含快照之后才提交的修改。',
 '本例在limit仍为37、全局revision6时保存快照，实际文件20512字节并记录SHA256。原集群后来到42、43，最高观察版本为8；将旧快照恢复成独立单成员后，值理应先回37。程序指定新的成员、集群配置和token，使这条恢复历史与仍存在的旧集群分开。',
 '缓存已经看过旧集群版本8，不能继续假定新存储必然拥有那段历史。恢复时--bump-revision=1000将快照版本6提高到1006，超过本题旧观察上界；--mark-compacted再把相应旧位置标为已压缩，迫使旧watch取消。提高版本号为观察者建立重新取基线的条件，数据本身仍来自旧快照。')+
 figures(e[6]).join('')+
 table(['新集群恢复后的推进','实际状态','观察者应做什么'],[['恢复后读取','header revision1006，limit=37，mod_revision仍2','识别新集群身份及恢复基线'],['沿旧历史从9观察','被取消，compact_revision1006','丢弃原缓存完整性的假设'],['重新列举config前缀','R=1006，取得三个当前键','建立完整缓存，再从1007观察'],['真正写入47','事件mod_revision1007','将事件应用到新缓存'],['独立完整前缀读取','与更新后缓存逐键相同','再单独读limit=47，核对新写可用']])+
 p('1006不是1000次新业务修改，47才是恢复以后真正的新写。本题只含一个受控PUT，缓存更新后还与另一条完整读取逐项核对，因而验收经过了取消、重列举、接续和处理四步。1000的增量只覆盖这份已知历史；真实规模须按观察上界与版本恢复指引选择。',
 '实际Kubernetes恢复还要协调API服务、成员配置、证书、所有观察者和缓存。etcd快照恢复的是控制状态，持久卷、数据库及外部业务历史仍要选择相容的恢复点，再在用户路径中共同验收。'),

 p('etcd_lab.py以真实etcd 3.6.16、etcdctl和etcdutl执行上述路径。输入只有三个配置键和一个临时owner键；服务进程在同一Linux本地Docker中运行，镜像固定官方摘要。脚本只创建随机命名的内部网络、容器和卷，不映射宿主端口，结束逐项回收并检查没有遗留。')+
 h('etcd-consensus-run','运行真实三成员、分区与快照恢复')+e8[0]+linkRow(links(e[7]))+
 p('第一条命令执行原生操作；--check-record只读取现有原生报告，检查源码摘要、环境及观察不变量，不启动容器。报告中的commands保留CLI原始输出，observation将ID规范成十进制字符串、版本保留为整数；成员ID、集群ID和租约ID可能超过JavaScript安全整数范围，不能先转成失真的普通数值再比较。')+
 table(['源码位置','沿正常链验证什么'],[['start、healthy、status','三投票成员、共同leader及可完成操作的服务'],['get前缀、watch、update_pair','列举R3、同事务双键R4事件、压缩后旧观察取消'],['lease grant、put、poll','先确认关联，再观察到期键消失'],['disconnect、read、txn','多数42与旧37、两种读、旧mod_revision条件失败'],['stop、start、read','恢复原多数后43，三个原成员追平'],['snapshot restore、relist、watch','旧快照37、新身份与1006、重建缓存接到47'],['verify、cleanup','从实际状态组合验收，逐项回收自有资源']])+
 h('subsection-8-gy93cg','沿完整源码核对每一份观察')+
 fold('完整etcd_lab.py：原生CLI、阶段记录与独立状态检查',e8[1])+
 p('已发布执行记录来自Linux CI。本页源码与图绑定同一记录；离线验收可以核对读数、事件、身份、快照和缓存关系，原生重跑则需要相同工具环境。记录覆盖这一组单宿主控制存储场景，没有执行Kubernetes恢复、生产权限配置或业务持久卷恢复。')
 ],'沿同一配额的37→42读写理解多数提交、日志位置与键值版本，再从列举观察、租约和分区走到快照恢复及缓存重建47。');

 const gitops=select('gitops-reconciliation',['先画出Git、控制器、集群和业务四层关系','Synced、Healthy与业务正确，分别证明什么','自动同步、自愈和清理，是三个不同开关','清理依据受管关系，不是删除所有多余对象','环境变量为什么不会随ConfigMap自动改值','三个固定提交，把控制面绿灯与用户结果对上','回退要改变期望，再验证旧版本还能工作','从源到响应，按最后成功阶段排障','在独立kind集群重放，再读完整源码'],[8,3,11]);
 const g=gitops.sections.map(s=>s[1]),g3=blocks(g[2]),g5=blocks(g[4]),g9=blocks(g[8]);
 if(g3.length!==1||g5.length!==1||g9.length!==6)throw Error('GitOps original code extraction changed');
 rewrite(gitops,[
 p('发布一个服务，需要把想运行的版本变成实际进程，再让请求取得预期结果。Git保存版本化文件，每个提交SHA标识一份确定内容；GitOps让控制器持续读取这些声明、观察集群、比较差异并推进调整。这种“观察→比较→执行→再观察”的循环称为调谐。',
 'Argo CD是本章的GitOps工具。Application对象记录仓库、修订、路径和目标集群/命名空间。仓库服务取得选定提交，把文件渲染为Kubernetes清单；渲染就是将源文件及参数转换为准备提交的API对象，本例直接使用目录内的JSON清单。应用控制器比较期望清单与现场，再通过API创建、更新或清理受管对象。',
 'API接受声明后，Deployment控制器依据副本数与Pod模板管理ReplicaSet，由ReplicaSet维持所需Pod副本。Pod组织一起运行的容器，调度器为它安排节点，节点再启动容器。服务进程处理请求，Service把请求交给相应后端。这些执行者依次交接，Git提交不会同步完成整条链。')+
 figures(g[0]).join('')+
 p('配套服务guide-web只有一个期望副本，进程启动时取得BUSINESS_VERSION，访问/version返回版本JSON。沿同一请求核对：Git选的是哪份内容，API对象写成什么，哪个Pod在运行，最后Service路径返回什么。Pod UID是Kubernetes分配的对象唯一身份，重建同名Pod也会得到新UID；它帮助区分旧进程与新进程。'),

 p('正常v1发布时，Argo CD取得固定提交，应用ConfigMap、Service和Deployment。Kubernetes使声明的Pod就绪后，HTTP查询返回v1。沿这条链会产生三类独立状态：声明是否对齐、资源是否符合健康规则、业务是否返回目标结果。')+
 table(['信号','由谁判断','本例怎样使用'],[['Synced','Argo CD的期望与现场比较','管理和比较范围内没有待同步差异'],['Healthy','对应资源的健康规则','Deployment等达到其健康条件'],['操作Succeeded','本次同步操作状态','这次操作已完成，不代表以后不再漂移'],['HTTP JSON中的version','实际服务进程及独立验收','与这次发布要求的v1或v2逐次比较']])+
 p('Healthy采用资源类型对应的规则，可包含代次和副本状态；自定义资源还可配置自己的规则。它不是逐用户运行应用验收。只改ConfigMap时，既有Pod仍可就绪、返回200，却读取着启动时的v1；第6节会让Synced、Healthy与业务拒绝在同一真实记录中同时出现。',
 '发布前先声明用户应得到什么，再从相应路径执行断言。本实验要求/version的version匹配目标，真实服务还需自己的数据、权限、关键操作及性能条件。'),

 p('比较发现差异以后，还需决定何时执行。automated.enabled开启自动同步；selfHeal决定现场漂移时是否自动重新同步；prune决定是否自动删除从期望移除的受管对象。它们改变不同决策，不能用一个“自动”概括。')+
 g3[0]+
 p('这段来自原生实验的初始策略：自动同步开启，自愈和清理先关闭。Git声明1副本，程序手工将现场扩到2个；控制器看见OutOfSync，健康仍为Healthy，现场保留2个。只把selfHeal开启，目标SHA不变，控制器才重新同步到1个。')+
 figures(g[2]).join('')+
 p('接着源修订改变，自动同步可以应用新清单；是否清掉旧对象仍由prune控制。enabled=false会停止这一自动执行，即使另外填了selfHeal或prune也不会因此自动生效。检测、排队和执行都有时序，同修订去重、失败重试也遵守具体策略；程序用刷新和明确状态等待取证。',
 '这里原生Application名为guide，Git期望始终1副本，现场漂移2→自愈1。另有reports-lab配置审阅例，以及将reports副本5修到2的标准库调谐模型；它们各自解释配置或规则，实际Argo记录继续使用guide与后面的三个固定提交。'),

 p('受管关系回答“哪些现场对象属于这个Application”。Argo CD按所配置的资源跟踪方式记录关联，同步时据此识别已创建或接管的对象。清理prune在期望中找不到某个原受管对象时，才对它执行相应删除；同一命名空间只是位置相同，不自动建立这份管理关系。',
 'v1提交声明guide-retired ConfigMap；ConfigMap保存非敏感键值配置，实际服务版本另放在guide-version。v2移除guide-retired，自动同步先应用仍存在的清单。prune关闭时旧受管对象继续存在，同步操作可为Succeeded，整体仍为OutOfSync；开启prune后才将它删除。')+
 table(['同命名空间中的对象','v2源中的位置','prune关闭 → 开启'],[['guide-retired','原先由guide管理，现从源移除','保留 → 删除'],['unmanaged','实验直接创建，从未交给guide管理','保留 → 保留'],['guide-version','仍由guide声明，内容改v2','同步新内容，继续保留']])+
 p('程序同时检查旧受管对象与未受管对象，才能区分按归属清理和按命名空间批量删除。删除权限、保护注解及终结器还会影响完成时刻；终结器要求负责清理的控制器完成相应工作，才能最终移除对象。源变成空集合时，也有allowEmpty等额外策略。这次两份普通ConfigMap的结果不能替代其他资源的删除协议。'),

 p('ConfigMap对象和进程读到的配置由读取方式连接。本例Pod的env配置通过configMapKeyRef取guide-version的version键，容器启动时形成BUSINESS_VERSION环境变量。Python服务再从自身环境读取它，返回给/version。')+
 g5[0]+
 p('第一份提交启动Pod时，变量为v1。第二份提交把ConfigMap改成v2，却没有改Deployment的Pod模板；既有Pod及其进程环境仍为v1。更新API对象不会重新给已运行进程注入环境变量，因此配置对象v2与HTTP返回v1可以同时成立。',
 '本例第三份提交在Pod模板中修改guide/revision注解，令Deployment创建替换Pod。新容器启动时再次读取ConfigMap，得到v2。注解没有Argo CD专用执行能力，作用来自“Pod模板改变→Kubernetes替换Pod→新启动读取配置”这条关系。',
 '卷文件投射与应用主动热重载是其他路径：文件更新后，进程还要按协议重新打开、解析并切换。版本化配置引用或把摘要纳入Pod模板也可使版本关系更明确；选择哪条路径，要从进程何时读取配置开始设计。')+linkRow(links(g[4])),

 p('现在把源、对象、进程和响应放进同一记录。三个提交固定同一仓库及目录：fb18c80提供v1，872b300只改配置到v2并移除旧配置，703f38b再修改Pod模板注解。短SHA用于阅读，gitops-revisions.json保存完整SHA，Application状态必须对应完整目标。')+
 figures(g[5]).join('')+
 table(['源提交及阶段','API配置 / Pod','Argo状态','Service HTTP / 本次要求'],[['fb18c80：初次同步','version=v1，初始Pod','Synced / Healthy','v1 / v1，通过'],['872b300：清理已开启并完成','version=v2，仍是同一Pod UID','Synced / Healthy','v1 / v2，拒绝'],['703f38b：Pod模板改变','version=v2，新Pod UID','Synced / Healthy','v2 / v2，通过']])+
 p('第二行取自真正的HTTP请求和API查询。程序先等副本恢复为1，记录Pod UID；切到872b300、完成清理以后再经Service请求/version，仍得到v1，UID也相同。它证明同步和健康已经满足，而这次v2业务目标未兑现。',
 '第三行不是把期望标签改成“通过”：模板变化后，程序等新Pod就绪，取得新的UID，并重新请求相同Service，返回v2后业务判据才通过。UID变化说明对象替换，实际响应说明这条服务路径读到了目标配置；两份证据共同连接原因与结果。'),

 p('回退先改变受控期望，再让同一执行链重新落实。程序将Application.targetRevision改回第一份固定SHA；控制器恢复v1清单，Deployment据旧模板创建新Pod，启动环境重新为v1，Service查询返回v1。v1仍声明guide-retired，因此这份受管配置也被重新创建。',
 '这里修改目标修订，继续走自动调谐；没有调用Argo CD的rollback API，自动同步开启时该API有另外的限制。现场手改而不改变期望，可能被selfHeal重新覆盖；紧急接管应明确由谁控制，再将修复纳入声明或完成正式交接。',
 '这个服务没有数据库迁移。真实旧版本重新接管之前，需要确认它仍能读取当前数据结构、取得凭据并调用外部接口；删除掉的产物、已经产生的业务写入和外部效果不会因Git修订回退自动倒流。用发布前同一组用户断言验收，才能判断回退是否可用。')+linkRow(links(g[6])),

 p('排障时沿最后成功的交接继续，而不是只看总状态。源尚未取得，先查仓库身份、完整修订和路径；清单已经生成，才查比较及API操作；对象已更新，才查Pod和进程；进程已运行，再查Service路由与用户结果。')+
 table(['阶段','已有对象或记录','下一步检查'],[['Git与渲染','repoURL、targetRevision、目录内容、渲染结果','访问是否成功，生成的是不是这次目标清单'],['比较与同步','资源差异、操作结果、Application条件','忽略字段、受管关系、同步策略及API权限'],['Kubernetes执行','Deployment模板与代次、ReplicaSet、Pod事件和UID','调度、镜像、启动配置及就绪'],['服务与业务','进程环境、Service选择器及实际JSON','请求到哪个后端，版本及业务要求是否匹配']])+
 p('AppProject把Application允许使用的源仓库、目标命名空间和资源类型限定下来。本例只允许对应仓库、guide-demo和ConfigMap、Service、Deployment；它是Argo CD的项目规则，Kubernetes执行身份仍需获得相应API权限。业务租户隔离则由应用及资源授权另行实现。',
 '保留源选择、控制器观察、对象同步、新Pod就绪与首个正确响应的先后记录，就能定位哪次交接没有继续。控制器看到新revision、Pod Ready和/version返回v2是三个时点；图中箭头表示依赖，不以绘图间距代替实测耗时。'),

 p('gitops_reconcile.py已在Linux运行Argo CD Core v3.6.1、kind v0.33.0和Kubernetes v1.35.8。Core提供本实验所需仓库与调谐组件，通过Application等Kubernetes资源操作，无需向外暴露管理界面。程序使用公开夹具仓库、固定三份提交及专门的guide-demo命名空间。',
 '脚本创建随机命名kind集群，所有kubectl明确使用自己临时kubeconfig和context，服务请求也在该集群内发起。结束删除该集群；原生执行需要可用的本地Docker、kind、kubectl和相应镜像。')+
 h('gitops-native-run','运行 gitops_reconcile.py')+g9[0]+linkRow(links(g[8]))+
 p('顺源码读patch_app如何改变策略或targetRevision，wait如何等待明确条件，app_status如何分别读取同步、健康和操作状态，response如何从就绪Pod经Service请求/version并读取Pod UID及配置。记录按v1、自愈关闭/开启、清理关闭/开启、模板换版、回到v1保存，业务判据独立比较返回JSON。')+
 fold('完整gitops_reconcile.py：Git读取、API调谐与真实HTTP验收',g9[1])+
 fold('gitops-revisions.json：仓库、路径与三个完整提交',g9[2])+
 fold('gitops-app/configmap.json：第三份提交的v2配置',g9[3])+
 fold('gitops-app/deployment.json：第三份提交的模板、环境注入与版本接口',g9[4])+
 fold('gitops-app/service.json：实际请求入口与选择器',g9[5])+
 p('随包JSON清单对应第三份703f38b提交，guide-version已为v2，Pod模板注解也为v2；前两份内容从各自固定提交读取，不能将这份清单当作初次v1源。已有执行记录及源码摘要可离线核对：期望副本1、漂移现场2、自愈回1；旧受管配置被清理而unmanaged保留；配置v2/旧UID/HTTP v1拒绝，模板换版后新UID/HTTP v2通过，最后回到v1。',
 '这些记录覆盖单宿主kind中的真实Argo Git读取、Kubernetes调谐和HTTP结果。它们没有运行生产数据迁移、跨主机网络或云高可用控制面；进入这些环境时，沿同一源→对象→进程→用户路径补足对应验收。')
 ],'沿Git修订、清单、API对象、Pod启动与Service响应走通调谐，再用自愈、清理和三个固定提交区分同步、健康与业务生效。');
 gitops.sections[4][1]+=
 h('gitops-config-input-path','配置已经更新，进程从哪里读')+
 p('打开 <code>v2_synced_but_old_business</code> 这条记录。<code>desired_config</code> 是脚本通过 API 读到的 <code>guide-version</code> 的值，这时已经是 v2。用 <code>http.pod</code> 对上 <code>pod.name</code>，再比较这次的 <code>pod.uid</code> 和较早的 <code>self_heal_on</code>。两者是同一个 Pod，<code>http.version</code> 仍为 v1。上面的清单负责注入 <code>BUSINESS_VERSION</code>，第 9 节的服务代码从 <code>os.environ</code> 读取它来构造响应。')+
 p('另一个独立的 kind 实验也把配置从 v1 改到 v2。原进程重新打开普通投射路径读到 v2，保留的旧文件描述符、只挂载单个文件的 <code>subPath</code> 和启动环境仍读到 v1。改成从文件加载后，要验证应用确实重开文件、校验新内容，再检查请求用的是哪一版。<a href="/article/config-secrets/#native-config-projection">查看同一个 Pod 的四种读数 →</a>')+
 '<p class="practice-links"><a href="/labs/delivery-systems/validation.json">查看 Argo 的 API 与响应记录 →</a> · <a href="/article/gitops-reconciliation/#gitops-response-evidence">用替换后的 UID 和响应复判发布 →</a></p>';
 gitops.sections[5][1]+=
 h('gitops-response-evidence','用运行记录核对实际发布版本')+
 p('按<a href="/article/delivery/#section-6">C6.1 的发布观测顺序</a>，先找 Git 声明的版本，再看集群配置、应用实例和响应。这个程序从同一次 Argo CD 实验的 JSON 复判初次发布、只改配置、换模板和回退四条记录。')+
 p('下载 <a href="/labs/delivery-systems/validation.json" download>原始记录 validation.json</a>，将下面的代码保存为 <code>check_gitops.py</code>，在同一目录运行 <code>python3 check_gitops.py validation.json</code>。只需 Python 标准库。')+
 trainingCode('读取原始 JSON，逐条重算发布结果','PYTHON',`import json
import sys
from pathlib import Path

record = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
gitops = record["native"]["gitops"]
stages = [
    ("v1", "v1"),
    ("v2_synced_but_old_business", "config_only_v2"),
    ("v3_new_pod", "rollout_v2"),
    ("return_to_v1", "v1"),
]

print("提交 模板 配置 Pod_UID 响应 验收")
for stage, source in stages:
    row = gitops["records"][stage]
    revision = gitops["sources"][source]
    files = record["git_history"][source]
    expected = files["configmap.json"]["object"]["data"]["version"]
    template = files["deployment.json"]["object"]["spec"]["template"]
    status, pod, reply = row["status"], row["pod"], row["http"]
    passed = (
        status["revision"] == revision
        and status["sync"] == "Synced"
        and status["health"] == "Healthy"
        and status["operation"] == "Succeeded"
        and row["desired_config"] == expected
        and reply["pod"] == pod["name"]
        and reply["version"] == expected
    )
    print(revision[:7], template["metadata"]["annotations"]["guide/revision"],
          row["desired_config"], pod["uid"][:8], reply["version"],
          "通过" if passed else "拒绝")`)+
 p('这四条记录的状态都是 Synced、Healthy、Succeeded。加上响应核对，四行依次是通过、拒绝、通过、通过。第二行现场配置已经是 v2，原 Pod 仍用 v1 的启动配置，HTTP 返回 v1。最后一行回到原提交，启动的是另一份 v1 Pod。程序用响应里的 Pod 名字对应 API 记录，再从 API 取得 UID。')+
 p('要生成自己的原生记录，按<a href="/article/gitops-reconciliation/#gitops-native-run">第 9 节运行 kind 实验</a>。本节的离线命令只读取已发布的实验输出。');
 gitops.updated='2026.11.12';
})();
