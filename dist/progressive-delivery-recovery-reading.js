/* Read one release contract through migration, then recover a usable business state.
   Load after the existing progressive lessons and before first-reading-flow.js. */
(()=>{
 const p=(...rows)=>rows.map(x=>'<p>'+x+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const anchor=id=>'<span id="'+id+'"></span>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body,id='')=>'<details class="full-code"'+(id?' id="'+id+'"':'')+'><summary>'+title+'</summary>'+body+'</details>';
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const code=(title,source)=>'<div class="code-block"><div class="code-toolbar"><span>'+esc(title)+' <small>PYTHON</small></span><button type="button" data-copy-code>复制代码</button></div><pre tabindex="0"><code class="language-python">'+esc(source)+'</code></pre></div>';
 const matches=(html,re)=>[...html.matchAll(re)].map(m=>m[0]);
 const pres=html=>matches(html,/<pre\b[\s\S]*?<\/pre>/g);
 const blocks=html=>matches(html,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=html=>matches(html,/<figure\b[\s\S]*?<\/figure>/g);
 const hrefs=html=>[...html.matchAll(/\bhref=["']([^"']+)["']/g)].map(m=>m[1]);
 const ids=html=>[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
 const bag=values=>JSON.stringify(values.slice().sort());
 const links=html=>matches(html.replace(/<figure\b[\s\S]*?<\/figure>/g,'').replace(/<pre\b[\s\S]*?<\/pre>/g,''),/<a\b[^>]*\bhref=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/g);
 const linkRow=values=>values.length?'<p class="practice-links">'+values.join(' ')+'</p>':'';
 const stdlibCommand=block=>block.replaceAll('标准库 Python 3.9+；模型例环境见 README','Python 3.9+ · 标准库').replaceAll('标准库Python 3.9+；模型例环境见README','Python 3.9+ · 标准库');
 const published={delivery:['subsection-8-1mpi7nq','subsection-8-lctfpe'],resilience:['subsection-1-1ww2dsc','subsection-5-1dwp2yh','subsection-6-vxh3b7','subsection-7-1bgmbh8','subsection-9-xbrzl7','subsection-9-qtm6c2']};
 function select(id,titles){
  const a=articles.find(x=>x.id===id);
  if(!a||a.sections.length!==titles.length||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Delivery/recovery source layout changed: '+id);
  return a;
 }
 function rewrite(a,bodies,desc,addedFigures=[],addedPres=[],addedHrefs=[]){
  const before=a.sections.map(s=>s[1]).join(''),after=bodies.join('');
  if(bodies.length!==a.sections.length||/<h2\b/i.test(after))throw Error('Delivery/recovery H2 layout changed: '+a.id);
  const remaining=pres(after).slice();
  for(const block of addedPres){const at=remaining.indexOf(block);if(at<0||remaining.lastIndexOf(block)!==at)throw Error('New projection source missing or duplicated');remaining.splice(at,1);}
  if(JSON.stringify(pres(before))!==JSON.stringify(remaining))throw Error('Original delivery/recovery pre bytes or order changed: '+a.id);
  if(bag(figures(after))!==bag([...figures(before),...addedFigures]))throw Error('Original delivery/recovery figure changed: '+a.id);
  if(bag(hrefs(after))!==bag([...hrefs(before),...addedFigures.flatMap(hrefs),...addedHrefs]))throw Error('Delivery/recovery href multiset changed: '+a.id);
  const nextIds=ids(after);
  for(const id of [...ids(before),...published[a.id]])if(!nextIds.includes(id))throw Error('Delivery/recovery anchor lost: '+a.id+'/'+id);
  if(new Set(nextIds).size!==nextIds.length)throw Error('Delivery/recovery duplicate explicit anchor: '+a.id);
  bodies.forEach((body,i)=>a.sections[i][1]=body);a.desc=desc;a.intro=desc;a.updated='2026.11.09';
 }

 const projectionSource=String.raw`"""SQLite migration fixture: fixed delimiter projection, not model summarization."""
import json
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE reports(
  id INTEGER PRIMARY KEY, body TEXT NOT NULL, body_version INTEGER NOT NULL,
  summary TEXT, evidence TEXT,
  summary_source_version INTEGER, evidence_source_version INTEGER
);
INSERT INTO reports(id,body,body_version) VALUES(17,'摘要甲|证据甲',1);
""")


def read_report():
    body, version, summary, evidence, sv, ev = db.execute(
        "SELECT body,body_version,summary,evidence,summary_source_version,"
        "evidence_source_version FROM reports WHERE id=17").fetchone()
    allowed = summary is not None and evidence is not None and sv == ev == version
    return {"body_version": version, "projection_versions": [sv, ev],
            "allow_new": allowed,
            "selected": {"summary": summary, "evidence": evidence} if allowed else {"body": body}}


def publish(version, summary, evidence):
    with db:
        return db.execute(
            "UPDATE reports SET summary=?,evidence=?,summary_source_version=?,"
            "evidence_source_version=? WHERE id=17 AND body_version=?",
            (summary, evidence, version, version, version)).rowcount


def rebuild():
    body, version = db.execute("SELECT body,body_version FROM reports WHERE id=17").fetchone()
    summary, evidence = body.split("|", 1)
    return publish(version, summary, evidence)


initial = read_report()
assert rebuild() == 1
v1_ready = read_report()
with db:
    db.execute("UPDATE reports SET body=?,body_version=body_version+1 WHERE id=17",
               ("摘要乙|证据乙",))
body_advanced = read_report()
stale_publish_rows = publish(1, "摘要甲", "证据甲")
assert stale_publish_rows == 0
# Deliberately incomplete repair: one projection catches up, the other does not.
with db:
    db.execute("UPDATE reports SET summary=?,summary_source_version=2 WHERE id=17", ("摘要乙",))
summary_only = read_report()
assert rebuild() == 1
v2_ready = read_report()
assert [x["allow_new"] for x in [initial, v1_ready, body_advanced, summary_only, v2_ready]] == [False, True, False, False, True]
assert body_advanced["selected"] == {"body": "摘要乙|证据乙"}
assert summary_only["projection_versions"] == [2, 1]
assert v1_ready["selected"] == {"summary": "摘要甲", "evidence": "证据甲"}
assert v2_ready["selected"] == {"summary": "摘要乙", "evidence": "证据乙"}
db.close()
print(json.dumps({"fixture": "fixed_delimiter_sqlite_projection_pair", "initial": initial,
                  "v1_ready": v1_ready, "body_advanced": body_advanced,
                  "stale_publish_rows": stale_publish_rows, "summary_only": summary_only,
                  "v2_ready": v2_ready}, ensure_ascii=False, indent=2))
`;
 const projectionCode=code('delivery_projection_pair.py · Python 3.9+ / sqlite3',projectionSource);
 const compatibilityFigure='<figure class="training-figure"><a href="diagrams/v69-delivery-compatibility.svg" target="_blank" rel="noopener" aria-label="放大：兼容迁移的读写条件与退出边界"><img src="diagrams/v69-delivery-compatibility.svg" width="1120" height="800" alt="兼容迁移：保留body，推进源版本，两份投影同版后切读，旧读写者与回退窗口退出后再删旧列。" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>声明的迁移契约。summary 与 evidence 都要对应当前 body_version；现场程序分别验证局部机制，不是一次已执行的生产迁移。<a href="diagrams/v69-delivery-compatibility.svg" download>下载 SVG ↗</a></figcaption></figure>';

 const delivery=select('delivery',['一个新镜像为什么能让旧服务一起出错','滚动发布改变的是哪一层状态','先扩展数据契约，再切换读写','用可比较的流量判断是否扩大','恢复旧镜像之前先问还能读写什么','在练习环境核验控制面与用户行为','评分练习：为删除旧列写退出条件','配套实战：真实 Terraform 计划与 GitOps 调谐模型']);
 const d=delivery.sections.map(s=>s[1]),d3=blocks(d[2]),d6=blocks(d[5]),d8=blocks(d[7]);
 if(d3.length!==1||d6.length!==1||d8.length!==7||pres(d.join('')).length!==9)throw Error('Delivery original code extraction changed');
 rewrite(delivery,[
 p('发布把一套确定的软件与运行条件交给实际请求。制品是构建得到的交付内容，容器镜像是其中一种；配置给程序提供地址、开关等参数；数据契约规定程序读写哪些字段、它们表达什么。镜像、配置和数据一起满足约定，应用才能按预期处理请求。',
 '正常路径是：固定制品与配置版本，准备兼容的数据结构，启动新实例，检查它具备接流量条件，再逐步把请求交给它。滚动替换期间，新旧实例会同时存在，旧连接和后台任务也可能继续运行。因此一次发布要同时解释“新程序如何工作”和“尚未退出的旧程序如何工作”。',
 '下面固定八副本日报服务作设计题。旧读者从 body 取得完整记录；新读者准备读取 summary 与 evidence，分别表达摘要和原始证据。本章保留 body 作为兼容期的权威源，新字段是由某个确定源版本产生的投影，即面向另一种读取方式组织出的数据。新写入在兼容期仍需维护完整 body。')+
 table(['交付对象','要固定的内容','正常验收'],[['制品','镜像内容摘要、平台架构及运行依赖','实际实例运行了这一内容'],['配置','内容版本、引用及读写开关','进程已加载目标版本'],['数据契约','body 与两个投影的含义、源版本和兼容范围','新旧程序均能处理约定输入'],['流量与验证','新旧版本归属、任务样本和停止条件','实际输出、权限和服务指标符合目标']])+
 p('交付清单把这些版本及验证方法关联起来。可变标签最终解析到哪个镜像、同名配置当时是什么内容，都要能追回。日报的行为条件也写进清单：授权用户能读到所属报告，摘要与证据来自同一份内容，已确认更新不丢失。后面的发布、灰度和回退围绕这一组条件判断。'),

 p('Deployment 保存 Pod 模板，由 ReplicaSet 控制器维持相应模板的副本。修改镜像、环境变量或配置引用会改变模板，控制器据此逐步增减新旧 ReplicaSet；单独调整副本数不会因此产生新的模板修订。调度、镜像拉取和容器启动再把声明变成实例。',
 'Ready 表示 Pod 达到配置的接流量条件；Available 还考虑 Deployment 要求的最短就绪时间。它们帮助控制滚动过程，业务断言则检查实际报告。就绪探针应覆盖该副本提供服务的必要条件；仅探测端口可能漏掉配置或数据契约错误，反复依赖一个偶发慢的共享服务又可能使所有副本同时失去流量资格。')+
 table(['八副本的控制预算','手算','含义'],[['maxSurge=25%','8×25%=2','滚动过程中允许比期望多创建两个副本'],['maxUnavailable=25%','8×25%=2','控制器的可用副本目标下界为8−2=6'],['资源准备','为额外实例准备资源','终止宽限期内的旧Pod还可能继续占用资源']])+
 p('六个可用副本是这组参数的控制预算，前提是资源和启动条件允许控制器推进。每个副本能贡献多少有效吞吐，要在相同负载下验证。正在终止的连接、正在回填的数据和共享数据库连接池，也都要纳入发布容量。',
 'rollout undo 恢复的是相应 Pod 模板修订。数据库记录、外部调用、已覆盖文件和模板所引用的同名配置，有各自的变化历史。回退方案需先确认旧程序还能使用眼前的数据和配置。'),

 p('数据迁移先扩展结构，再迁移读写，最后退出旧契约。先加允许为空的 summary、evidence 和各自的源版本，保留 body；旧读者继续读 body，新读者在投影不完整时沿旧路径读取。兼容期的新写接口也先形成完整 body，再按该源版本生成两份投影，避免只更新新列而让旧读者读到旧内容。每次改 body，都在同一数据库事务推进 body_version，使每次源变化有可判断的身份。',
 '回填按旧记录补齐投影。声明有十二万行、每分钟处理四千行，忽略竞争和重试，工作量下界为120000÷4000=30分钟。回填仍与在线写入共享数据库，需要控制锁等待和负载；“扫过所有行”只证明处理覆盖，不证明结果对应最新源版本。')+
 table(['时刻','源记录','投影与版本','能否使用新读路径'],[['回填完成','body为甲版，版本1','summary甲、evidence甲，两个源版本均1','两份内容有效时允许'],['旧写者随后修改','body为乙版，版本2','两份投影仍标记版本1','拒绝旧投影，读取body'],['只修复摘要','body仍为乙版，版本2','summary版本2，evidence版本1','仍拒绝不成套的投影'],['两份追平','body仍为乙版，版本2','summary乙、evidence乙，两个源版本均2','允许按同版组合读取']])+
 p('投影发布要与源版本关联：先读取某版 body，计算两份投影，再以“body_version 仍等于这一版”为条件，在一个事务中发布两份内容和源版本。读者从同一一致性视图取出源版本和投影，只在两份内容均有效、两个源版本均非空且都等于 body_version 时切读。这样既拦住迟到的旧回填，也拦住只追平一个字段的半成品。',
 '下面保留的旧片段解释 summary 单投影的版本条件。完整日报还需对 evidence 执行相同检查，并让两份内容按上述事务边界一起发布；下一份 SQLite 程序把这个缺口补成可运行的正反例。')+d3[0]+
 p('delivery_projection_pair.py 使用独立内存 SQLite。为使转换可复算，body 固定写成“摘要甲|证据甲”，按第一个竖线分出两段，乙版同理；这是字段迁移夹具，不调用摘要模型。程序先使甲版成套，推进 body 后拒绝旧投影，再故意只更新 summary 验证仍被拒绝，最后一起追平。')+
 fold('展开完整SQLite程序：两份投影的同版门禁与迟到回填',projectionCode,'delivery-projection-pair-lab')+
 p('程序的 allow_new 依次为 false、true、false、false、true；迟到甲版的条件更新影响0行。它验证这份字段契约的事务与版本条件。真实摘要与证据的有效性仍需应用自己的内容检查，不能把字段有值或版本相等当成内容正确。')+
 compatibilityFigure+
 p('切读前还要覆盖全部写入口。可以先升级或冻结只写 body 的旧写者，等待在途写入排空，再追平并对账；若必须让旧写者继续存在，就用覆盖所有入口的可靠机制在每次修改 body 的同一事务推进源版本，再让投影跟进。旧客户端能绕过版本推进时，读者会误把旧投影当成当前版。',
 '变更捕获把源修改传给投影处理者，但事件可能积压、重复或乱序。处理者仍需条件提交和追平判断。确认完整契约后小范围切读，并保留回切 body 的能力；删除 body 要等旧读写者、延迟消息、离线任务及回退窗口都退出。'),

 p('灰度是把一部分实际流量交给候选版本，并按实际服务版本分别观察结果。先确认新旧候选都能处理当前数据契约，再确定分流单位，例如请求、用户或租户；日志保留实际版本，避免把配置上的5%当成观测分母。',
 '在独立的十分钟计数题中，新版处理500次、失败8次，旧版处理9500次、失败19次。新版错误率8÷500=1.6%，旧版19÷9500=0.2%；合并为27÷10000=0.27%。发布判定要保留这两组分母，混合总表会稀释候选版本的退化。',
 '比较还要对齐输入难度与环境。若新版只处理大日报或只在一个可用区运行，两个比例包含了这些差异。按报告大小、租户类别和部署位置对照同类请求，记录延迟分布、摘要与证据一致性、权限负例及迁移滞后。小样本结论需结合观察窗口与预设停止条件。',
 '放量同时改变资源需求。新实例预热缓存，新旧实例共用数据库连接，回填又消耗I/O，这些工作会叠加。暂停扩大流量、把读开关切回 body、恢复旧模板和重建数据是不同动作。先选能阻止影响继续扩大的动作，再按兼容条件决定下一步。'),

 p('回退先匹配一个仍能工作的平台组合：旧制品、对应配置、当前数据契约、消息格式及所需容量。兼容矩阵把“哪版读者能解释哪版数据、哪版写者会产生什么格式”列在一起，才能判断改回某个版本后会发生什么。')+
 table(['当前状态','旧版本能否直接回来','需要先满足的条件'],[['body仍完整，旧配置可取用','具备回退基础','核对旧程序读写、权限与当前数据'],['summary/evidence已切读，body仍维护','可先按开关回到旧读路径','body未落后，两种路径结果一致'],['body已删除或旧消息格式已不兼容','不能仅恢复旧镜像','先恢复兼容接口，或制定向前修复方案']])+
 p('例如旧模板引用 report-config，而发布时覆盖了这个同名对象的地址。模板回退后，旧程序仍可能读到新地址。让引用绑定内容版本，并观察进程实际加载的非敏感标识，才能恢复原组合。',
 '消息也有读写契约。新版本已经发送的事件可能仍在队列、延迟重试或离线消费者中。先让消费者同时理解两种格式，再切生产者；退出旧格式前，核对保留期和积压。回退镜像不会撤回已发送消息。',
 '若变化已经不可逆，先停止继续写错，再依据可信来源对受影响记录做带条件的修复。整库倒回旧快照会同时丢掉故障后合法提交的新业务，需按恢复目标另行设计。兼容矩阵因此既是发布入口条件，也是回退出口条件。'),

 p('把观察分成控制对象、运行实例和用户结果三层。先记录 Deployment 模板修订、镜像与配置引用；再记录 Pod UID、就绪状态和进程已加载版本；最后从实际入口发送请求，核对返回版本、报告内容和权限。UID 是对象身份，Pod 同名重建后仍是另一个实例。',
 '下面的既有练习使用专用命名空间 infra-guide-lab 和 Deployment infra-demo，只改变 Pod 模板中的 APP_VERSION，再执行回退。它用于核对模板修订与响应版本，不执行前面的日报字段迁移。')+d6[0]+
 p('rollout status 等待相应发布状态；随后仍需按实验包部署的入口发送多次请求，记录时刻、目标和实际版本。控制面保存模板、节点开始运行新实例、用户拿到正确新版结果之间，还有调度、拉取、就绪和端点传播。',
 '滚动前已建立的连接可能继续由旧实例处理。分别观察旧连接、新连接和终止宽限期，才能解释短时混合版本。回退后重复同一组请求和数据断言，确认旧程序能继续读写。这组命令留作目标集群练习。前面的 SQLite 实验验证独立的字段迁移条件。',
 'S2 用独立 kind 集群实跑。客户端每次用新连接访问同一个 Service <code>10.96.63.29:80</code> 的 <code>/work</code>。三个稳定窗口各取连续 20 条响应，均为 HTTP 200，返回版本依次是 v1、v2、v1。各窗口首条响应的 Pod UID 分别以 <code>23cdd057</code>、<code>595b17c8</code>、<code>e04bc396</code> 开头。发布 v2 生成修订 2。指定回退到修订 1 后，模板中的 <code>APP_VERSION</code> 恢复为 v1，Deployment 当前修订推进到 3。<a href="/article/cloud-service-lab/#kubernetes-service-rollout">对照三个阶段的模板、端点和实际响应 →</a>')+linkRow(links(d[5])),

 p('沿八副本题继续决策：maxSurge与maxUnavailable各为2，回填还余两万行、每分钟四千行。仅工作量就还需20000÷4000=5分钟；这个时刻不能因“新版已就绪”就删除 body。还要追到最新源版本，并核对 summary/evidence 两份内容。',
 '给迁移写出能执行的退出条件：所有只读或只写旧契约的实例和任务已退出；积压事件与延迟重试已跨过边界；投影有效且同版；回退窗口及恢复材料已有安排。每个条件都应对应对象清单、版本、计数或实际查询。',
 '再看三个变化：summary已追平而evidence仍旧，读者应走 body；新版失败率1.6%却只看见全局0.27%，应停止扩大并分组调查；旧模板恢复而配置被覆盖，应重新组装兼容版本。把答案落到这三条可观察关系，才能说明自己的回退动作会改变什么。',
 '同样的交付清单也用于模型服务：权重、分词器、模板和评估版本共同决定输入输出含义。恢复某个镜像后，仍需核对这些成员是否配套。')+linkRow(links(d[6])),

 p('前面的发布流程依赖“明确期望、审阅变化、执行后再观察”。基础设施即代码 IaC 用可版本化配置表达资源期望；Terraform 是实现这种工作流的工具。配置说明想要什么，state 保存配置地址与受管对象的绑定及已知属性，plan 保存本次准备执行的动作，apply 执行相应计划。provider 是读取和修改相应资源类型的插件。')+
 h('subsection-8-1mpi7nq','保存计划后，编辑配置会改变待执行内容吗？')+
 p('既有 terraform_lab.py 使用真实 Terraform 1.13.0 CLI 和内建 terraform_data。这个资源把声明输入保存在本地状态中；replicas=2与digest只是发布清单数据，不会创建两个Pod。程序先保存v1计划，再把配置改为v2，执行保存计划，核对实际输出仍为v1。')+d8[0]+
 fold('展开main.tf：本地发布清单及内建资源',d8[1])+
 table(['实际CLI步骤','结果','对交付的意义'],[['保存v1计划后编辑为v2，再apply v1.tfplan','仍得到v1摘要','审阅和执行应绑定同一份计划'],['重新计划并应用v2','state中的输出更新为v2','新的期望需要新的计划'],['无变化计划','详细退出码为0','在本次比较范围内没有变化'],['另一份apply已推进state，再执行旧计划','拒绝陈旧计划','执行前仍需满足计划的状态前提']])+
 fold('展开既有Terraform验证摘要',d8[2])+
 p('init准备工作目录，validate检查配置，show展示计划或状态，output读取输出值。上面的结果来自真实CLI记录，覆盖本地state与保存计划；远端资源漂移读取、远程backend的状态存放和锁，不属于这份内建资源实验。下一章继续把配置、state和实际资源放到同一条刷新路径。')+
 fold('展开terraform_lab.py完整驱动',d8[3])+
 h('subsection-8-lctfpe','持续调谐中的修复、清理与业务验收')+
 p('GitOps让控制器持续读取版本库中的期望、观察目标系统，再推进差异。受管对象是这条控制链明确负责的对象；self-heal表示修复现场对受管内容的偏离，prune表示清理已从期望移除的受管对象。同步一致、资源健康与业务结果在不同层，需分别检查。',
 '既有 gitops_model.py 用普通字典表示这些对象，是独立的标准库模型。声明reports副本为2、现场手改为5；关闭自愈保持5，开启后spec回到2但available仍0，随后把available设为2才得到模型健康。这里spec是期望字段，available是模型记录的可用数量。')+d8[4]+
 table(['模型中的变化','结果'],[['自愈关闭 / 开启','现场副本5 / 受管spec恢复2'],['spec匹配但available=0','synced_model=true，healthy_model=false'],['从期望移除已登记config','prune关闭保留；开启后只删这份受管对象'],['现场有未登记unmanaged对象','清理后仍保留'],['资源健康但HTTP返回旧版本','业务断言失败']])+
 fold('展开gitops_model.py完整程序',d8[5])+
 p('模型用config这条字典记录代表配置资源，未调用Kubernetes API。下面的Argo CD Application则是一份目标配置示例：它指定源仓库、修订、路径和目标集群，开启自动同步与selfHeal，关闭prune。allowEmpty=false保留自动清空资源集合时的删除保护；它不代替对象归属与清理策略。repoURL等占位值需要替换，控制器、源访问和项目权限也需预先具备。')+
 fold('展开既有Argo CD配置示例',d8[6])+
 p('本章这两份程序分别提供真实CLI与确定性调谐模型证据，后者没有执行Argo CD集群同步。继续学习时，把源修订、受管对象、资源状态和真实HTTP版本分别记录；清理还需核对对象归属、删除保护与权限。state刷新、Git同步或资源健康都各自回答一层问题，交付仍以完整契约下的请求结果收口。')+linkRow(links(d[7]))
 ],'从制品、配置和数据契约走通发布；用成套投影、滚动预算和分组流量判断兼容迁移与回退。',[compatibilityFigure],pres(projectionCode),['/article/cloud-service-lab/#kubernetes-service-rollout']);

 delivery.sections[0][1]+=h('native-release-artifact-trust','提交验签通过，制品还是原来那份吗')+
 p('报表服务审批的是 v1。部署时再按同一个候选名称取文件，却拿到了 v2。审批没有被改动，变的是名称指向的内容。容器镜像的可变标签也有这类问题。固定内容摘要，可以让发布端知道自己应当取到哪份内容。')+
 p('发布清单记录版本和制品的 SHA-256 摘要，也就是用制品字节计算出的固定长度值。签名绑定保存清单的 Git 提交。发布端先用预先信任的公钥验签，确认提交由获准的密钥签署，再计算实际取得的制品摘要，与清单比较。这两步分别回答谁批准了发布、现场拿到的是哪份制品。')+
 '<figure class="training-figure"><a href="diagrams/release-artifact-trust.svg" target="_blank" rel="noopener" aria-label="放大发布清单签名与制品字节对照"><img src="diagrams/release-artifact-trust.svg" width="460" height="440" alt="四次发布分别通过、因摘要不匹配拒绝、因发布者未获准拒绝、按固定摘要再次通过。每次实际读到的发布版本都是 v1。" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>Git 验签和实际制品校验都通过后，才替换运行方要读取的发布文件。<a href="diagrams/release-artifact-trust.svg" download>下载 SVG ↗</a></figcaption></figure>'+
 table(['这次取的制品','可信签名','实际摘要匹配','尝试后读到'],[
  ['可信清单，候选名最初指向 v1','通过','是','v1'],
  ['同一份清单，候选名改指 v2','通过','否','保持 v1'],
  ['另一把密钥签署 v2 清单，候选是 v2','未获准','是','保持 v1'],
  ['可信清单，按摘要取回 v1','通过','是','v1']
 ])+
 p('第三次的 Git 输出先说签名有效，随后提示 <code>No principal matched.</code>，命令返回 1。另一份名单可以识别这把密钥，但发布端只信任原来的名单。排查时看退出码和实际用的信任名单，单凭第一行的 <code>Good "git" signature</code> 容易误判。')+
 fold('沿程序检查实际读入的制品字节',code('release_artifact_trust.py · 发布门禁',`verification = execute(git + ["-c", "gpg.ssh.allowedSignersFile=" + str(signer_file),
                              "verify-commit", revision], env)
received = artifact_path.read_bytes()
received_digest = sha(received)
content_matches = received_digest == manifest["artifact_sha256"]
approved = verification["returncode"] == 0 and content_matches
if approved:
    staged = active_path.with_suffix(".verified")
    staged.write_bytes(received)
    staged.replace(active_path)`))+
 p('程序校验和发布使用同一次读取的字节。两次拒绝后都独立重读当前发布文件，值仍为 v1。本地实验用符号链接模拟可变名称，用 tar 包模拟制品。实际镜像发布还需核对目标仓库、镜像摘要和平台架构。')+
 '<p class="practice-links"><a href="labs/release-artifact-trust.zip" download>下载代码与运行说明 ↓</a> · <a href="labs/release-artifact-trust/release_artifact_trust.py">查看完整程序</a> · <a href="labs/release-artifact-trust/validation.json">核对 Git 输出与实测结果</a> · <a href="https://git-scm.com/docs/git-config#Documentation/git-config.txt-gpgsshallowedSignersFile">Git SSH 信任名单文档 ↗</a></p>';


 delivery.sections[7][1]+=h('native-controller-reconcile','外部已创建，控制器退出后会不会再建一份')+
 p('向 Kubernetes 提交一份 <code>ReportSink</code>，指定 <code>spec.target</code> 为 <code>weekly-report</code>。这是用自定义资源定义（CRD）加到 API 上的对象。API 保存期望，控制器负责让外部服务拥有对应的接收位置。外部服务按对象的 UID 保存一份文件。同名对象删掉再建会获得新 UID。')+
 p('控制器用 client-go 的 informer 先列出当前对象，再监听变化。事件只把“命名空间/名字”放进队列。程序通过 <code>WaitForCacheSync</code> 等初始同步完成，再从队列取任务。处理时重新向 API 读取对象，取得 UID、代际和删除标记。<code>generation</code> 是 API 维护的期望代际，<code>status.observedGeneration</code> 表示控制器已处理到哪一代。对象更新时用来检查并发冲突的是另一个字段 <code>resourceVersion</code>。')+
 trainingFigure('controller-reconcile','控制器退出时，外部文件和 Kubernetes 的状态处在不同阶段。跟着同一个 UID 查看 PUT、DELETE 和 API GET。')+
 p('没有清理标记时，控制器先保存自己的 <code>finalizer</code>，然后结束这轮处理。等下一轮读到标记已保存，才发外部 PUT。这样对象进入删除流程后，控制器仍有机会根据原 UID 清理。外部成功后才回写 <code>status</code>。')+
 trainingCode('外部成功以后、回写状态以前的故障点','GO',`if err := c.changeSink(ctx, http.MethodPut, uid, target); err != nil {
    return err
}
if c.crashAfterCreate {
    os.Exit(crashExitCode)
}
obj.Object["status"] = map[string]any{"observedGeneration": obj.GetGeneration(), "sinkUID": uid}
_, err = api.UpdateStatus(ctx, obj, metav1.UpdateOptions{})`)+
 table(['检查时刻','从 API 读到的结果','外部服务实际记录'],[
  ['正常对象处理完','已处理代际 1','PUT 201，创建 1 份'],
  ['replay 对象写入后退出 73','GET 200，状态尚未回写','PUT 201，创建 1 份'],
  ['用正常配置重启','同一个 UID，已处理代际 1','同 UID 的第二次 PUT 返回 200，仍只创建 1 份'],
  ['停下控制器，再提交删除','GET 200，删除时间和 finalizer 仍在','尚未收到 DELETE，文件仍在'],
  ['重启并完成清理','移除 finalizer 后，GET 404','DELETE 204，文件已清理']
 ])+
 p('第一次 PUT 已经成功，所以光看 <code>status</code> 为空会判断错。重启后，informer 的初始列表会再次看到该对象。控制器用原 UID 重试，外部服务识别到同一个对象。删除请求到达时，API 先标出删除时间。控制器看到它，就先执行外部 DELETE，再移除自己的 finalizer。')+
 p('这次重启的是控制器，API 和外部接收方一直运行。<a href="/article/control-plane-consensus/#section-7">C4.9 的独立快照恢复实验</a>里，旧观察因历史压缩而取消，重列举从 revision 1006 读到 37，接续观察才收到后来写入的 47。')+
 trainingCode('解压后用独立 API Server 和 etcd 复跑','SHELL','go run . --assets /path/to/controller-tools/envtest --output replay.json')+
 p('按包内说明准备 Kubernetes 1.35.0 的 envtest 二进制。启动器在本机回环地址运行 API Server、etcd 和 HTTP 接收方，再启动独立的控制器进程。先核对 <code>provider_events</code> 的 UID、请求和状态码，再看对象快照。这里验证自定义对象、状态写回和清理顺序。多副本控制器、实际云 API 与集群权限需要另验。')+
 '<p class="practice-links"><a href="/labs/controller-reconcile.zip" download>下载 Go 源码与运行记录 ↓</a> · <a href="/labs/controller-reconcile/README.md">准备环境与复跑 →</a> · <a href="/labs/controller-reconcile/validation.json">核对 API 对象与 HTTP 记录 →</a> · <a href="https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/">Kubernetes finalizer 说明 ↗</a></p>';
 delivery.updated='2026.11.12';
 delivery.sections[5][1]+=p('要把这三层观察放进同一份真实记录，可以<a href="/article/gitops-reconciliation/#gitops-response-evidence">复判 C6.3 的 Argo CD 发布</a>。控制器同步到目标 Git 修订、现场配置更新后，继续用 Pod 身份和 HTTP 响应核对实际收到的版本。');

 const resilience=select('resilience',['恢复条件：材料、业务、权威与消费者','先说明这次恢复究竟要救什么','故障域要画到最后一个共享依赖','RPO 衡量缺失的时间边界，RTO 衡量恢复时长','共同恢复点：连续提交与对象版本','恢复关键路径：阶段预算与数据规模','写入接管与效果：旧写者、回执和重新消费','演练如何证明备份真的可用','实战：完整前缀与恢复后的外部效果','评分练习：恢复点合格是否意味着服务已恢复']);
 const r=resilience.sections.map(s=>s[1]),r9=blocks(r[8]),r9links=links(r[8]);
 if(r9.length!==4||r9links.length!==6||figures(r.join('')).length!==2)throw Error('Recovery original evidence extraction changed');
 const localReadback=trainingCode('复跑并核对 R3','SHELL',String.raw`python3 -B consistent_recovery_cut.py > r3-readback.json &&
python3 - r3-readback.json <<'PY'
import json
import sys
from pathlib import Path

run = json.loads(Path(sys.argv[1]).read_text())
r3 = next(row for row in run["commits"] if row["report"] == "R3")
assert (r3["seq"], r3["object"]) == (102, "object-v3")
latest = run["naive_latest_database"]
assert (latest["seq"], latest["physical_integrity"]) == (103, "ok")
assert "R3" in latest["A_report_rows"]
assert "R3" not in latest["A_readable_reports"]
assert latest["business_problems"] == [
    {"report": "R3", "object": "object-v3", "reason": "missing_object_version"}
]
prefix = run["last_complete_business_prefix"]
assert (prefix["seq"], prefix["stopped"]["at_seq"]) == (101, 102)
complete = run["all_materials_present"]
assert complete["seq"] == 103
assert complete["A_readable_reports"] == ["R1", "R2", "R3", "R4"]
print("数据库 103 缺 R3 附件，完整前缀 101，材料齐备时到 103")
PY`);
 const failoverLinks=['/labs/haproxy-report-failover.zip','/labs/haproxy-report-failover/README.md','/labs/haproxy-report-failover/validation.json','https://github.com/CaptainGreenskin/infra-guide/actions/runs/43113784181'];
 const nodeLossLinks=['/labs/kind-r3-node-loss.zip','/labs/kind-r3-node-loss/README.md','/labs/kind-r3-node-loss/validation.json',
  'https://github.com/CaptainGreenskin/infra-guide/actions/runs/43116921403','/article/k8s-storage/#csi-node-placement-evidence'];
 const readbackLinks=['/article/resilience/#subsection-9-xbrzl7','/labs/recovery-artifacts-retrieval/validation.json',...failoverLinks,...nodeLossLinks];
 rewrite(resilience,[
 anchor('recovery-business-contract')+
 p('恢复让中断后的系统重新提供约定服务。先看正常业务：授权用户请求一份日报，应用从数据库取得报告及附件引用，按引用读取对象存储中的内容，再把可核对的结果交给用户。数据库保存业务记录，对象存储保留附件字节，身份与授权控制谁能读取。恢复需要把这条依赖链重新接通。',
 '备份保存过去某个状态的材料；日志记录随后发生的变化；副本保留另一份正在同步的运行状态。副本可以帮助持续承载，历史材料则帮助找回过去。合法但错误的删除可能迅速复制到所有副本，因此多副本和可恢复历史分别解决不同问题。')+
 h('subsection-1-1ww2dsc','恢复涉及哪些对象')+
 table(['对象','正常职责','恢复时检查'],[['业务记录与附件','按报告引用取得对应版本的内容','数据库行、对象版本和摘要能相互对应'],['备份与连续变化','提供可取用的历史状态','材料齐全，密钥、权限和版本可用'],['查询者与后台任务','读取或继续处理业务记录','目标查询及权限负例通过，任务进度可核对'],['写入执行者与外部接收方','修改业务或完成通知等动作','允许的执行者明确，既有结果可查询']])+
 p('业务提交清单记录一笔提交依赖的不可变对象版本与摘要，帮助从“文件都在”走到“这份报告确实可读”。清单要求保留哪些对象，由业务历史决定：本章报告夹具要求恢复前缀中的每份报告都有附件；已按协议合法删除的中间文件不因此需要永久保留。写入接管与外部结果的机制，在第七节按请求路径展开。'),

 p('固定一个故障设计题：日报服务跨甲乙两个可用区，各有两个查询副本；它们读取同一业务数据及附件。午间一次错误迁移删除证据索引，删除又同步到备用数据库。四个查询实例仍健康，用户却拿不到带完整证据的日报。要恢复的是正确、授权可读的业务状态。',
 '先定义最低服务：允许授权用户查询故障前约定范围内的报告和附件；暂时只读，避免修复过程中继续写错；后台通知待核对原结果后再继续。这样数据库连通、只读查询恢复和全面开放写入各有明确终点。',
 '再固定故障假设。单副本退出、整个可用区不可达、逻辑误删、密钥不可用与网络分区，影响的材料和权限不同。恢复手册应说明这次覆盖哪一种、哪些记录仍可信、谁能开始恢复。后面的分钟预算是这组业务目标下的声明题，不是一次云容灾实测。'),

 p('故障域是一组可能因同一原因一起失效的对象。沿一次查询画依赖，比只数应用副本更有用：两个区的应用可能共用数据库主写入口、对象索引、身份策略或发布流水线。一份错误配置也可能同时进入所有实例。机器分散能隔开某些硬件故障，仍需检查这些共享依赖。',
 '再沿恢复动作画一条路径：谁取得备份、凭什么解密、经哪条网络装载、用哪个账号切换入口。备份在异地，密钥和恢复身份却只在故障区域可用时，材料虽在，恢复仍无法开始。独立性要相对于既定故障判断；两个账号也可能共用一条会同时撤销权限的组织策略。',
 '复制链同样可能扩大错误。备用库很快应用删除，有助于保持副本接近，却没有保存误删之前的历史。设计时分别列出持续服务副本、受保护的备份与日志保留、恢复权限和可验证历史；演练再检查它们是否会被同一故障或操作一起破坏。'),

 p('恢复点目标 RPO 规定允许回到多旧的业务状态；恢复时间目标 RTO 规定从约定中断起点到最低服务恢复的时长。它们各有起止点：前者沿数据历史向后看，后者沿恢复过程向前计时。都要注明业务范围、故障类型及允许只读等降级条件。',
 '声明目标为RPO 15分钟、RTO 45分钟，故障发生于12:00。若可验证业务状态完整到11:54，恢复点距故障6分钟，满足前一目标；若只装回11:30基线，则是30分钟，超过目标。备份每15分钟启动一次，尚不能说明这份材料何时完成、能否取用及覆盖到哪个提交。')+
 table(['材料能证明的历史','距12:00','本题恢复点判断'],[['基线11:30，所需首段日志已缺且无替代材料','30分钟','只能证明基线，超出15分钟'],['连续前缀到11:42，之后缺段','18分钟','可保留此前缀，仍超目标'],['连续且业务完整到11:54','6分钟','恢复点满足目标']])+
 p('连续是指基线之后所需的变化能按对应恢复协议衔接，不能跳过未知段直接套后面的事件。业务完整还包括附件、索引和授权读取：数据库到11:54而必要附件缺失，不能据数据库位置单独宣布通过。选择哪个共同恢复点，下一节用实际对象夹具计算。'),

 h('subsection-5-1dwp2yh','用报告引用求最后完整前缀')+
 p('租户 A 想找回报告 R3 和它的附件。用独立的本机实验复现：11:30 的 SQLite 备份记录到提交 100，A 已有 R1 和它的附件，备份还保留租户 B 的一份报告。此后每条应用日志新增一份报告，记下提交号、附件版本和内容摘要。摘要由附件字节算出，用来核对恢复后读到的内容。')+
 table(['提交','题设时刻','新增报告的依赖'],[['100基线','11:30','R1→object-v1'],['101','11:42','R2→object-v2'],['102','11:54','R3→object-v3'],['103','11:57','R4→object-v4']])+
 p('故障设在 12:00，只从恢复材料中移除 <code>object-v3</code>。<code>R3</code> 是提交 102 加入的报告，103 是重放到 <code>R4</code> 后的整库位置。只重放数据库时，<code>integrity_check</code> 返回 <code>ok</code>，表里有 R1 至 R4，数据库位置距故障 3 分钟，应用能完整读回的只有 R1、R2 和 R4。')+figures(r[4]).join('')+
 p('按完整提交前缀恢复时，每次插入报告和推进进度后，在同一事务中检查所有必要引用。102发现缺v3，回滚这一步并停止，最后完整状态为101/11:42，可读R1、R2。12:00−11:42=18分钟，超过15分钟目标。18分钟表示恢复点的年龄，不表示恰好少了18分钟里每一笔业务，也不是报告数量。',
 '补齐v3后可到103，缺口3分钟；日志缺102时不能跳到103，只能到101；v2内容摘要不符时101也不能接受，剩100基线。v4存在不能替代v3。本题要求保留前缀里全部报告，若业务允许跳过、重建或补偿某笔提交，必须另外定义可验证的协议。')+
 p('从<a href="'+readbackLinks[0]+'">第 9 节下载实验包</a>，解压后在脚本所在目录运行。程序实际复制 SQLite、重放日志，再读取附件文件并核对内容摘要。下面的断言用同一份输出对照三条恢复路径。也可先看<a href="'+readbackLinks[1]+'">保存的运行记录</a>。')+
 fold('展开本机复跑命令与读回断言',localReadback,'recovery-r3-local-readback')+
 h('recovery-report-readback-gate','怎样从实际入口验收同一份报告')+
 p('目标演练若承诺恢复到提交 103，先记下租户 A 的报告 ID <code>R3</code>、附件版本 <code>object-v3</code> 和原始内容摘要。故障后用外部客户端从正常入口按该租户身份查询报告，再下载它引用的附件，保存请求 ID 和返回字节的摘要。报告、版本和内容都对得上，才记为一次合格读回。若最后完整状态停在 101，把 R3 记入数据缺口。只用这一份报告做探针时，完整恢复点仍须核对整份提交清单。',
 '跨可用区演练要用同一时间基准，记录约定的中断起点（如故障注入）和最低服务恢复时刻。若本轮要求只读，在事先约定的连续读回探针全部合格时停止计时。开放写入另用测试写请求和独立读回验收。比较有效吞吐时，固定负载和观察窗，按请求 ID 去重，数清发起数、截止前合格数和失败或超时数，再用合格数除以窗口秒数。本机记录的 11:42 和 11:57 是题设提交时刻，跨区恢复耗时与有效吞吐要到目标环境采集。')+
 h('native-haproxy-report-failover','主后端退出后，备用后端能读全 R3 吗')+
 p('在同一台 Linux 机器上，用真实 HAProxy 接两份独立的 HTTP 后端。两边都能在 SQLite 里查到租户 A 的 <code>R3</code>，备用后端 B 还缺 <code>object-v3</code>。客户端先从主后端读到整份报告，再关闭主后端的监听。两次实验各自保持原入口，只更换 HAProxy 检查的路径。')+
 table(['备用后端的检查条件','代理状态','客户端读回'],[
  ['<code>/healthz</code> · 进程能响应','B 可接流量','B 的报告 200，附件 404'],
  ['<code>/readyz</code> · 核对固定附件','B 暂不接流量','主、备均不可用，入口两次返回 503'],
  ['补齐 <code>object-v3</code>','两组 B 都可接流量','各连续三轮从 B 读到报告和正确附件']
 ])+
 p('每轮分别请求报告和附件，再把两个请求 ID、后端标记和返回字节放在一起核对。<code>incomplete_trial</code> 指向缺附件时的一轮，<code>stable_trials</code> 指向补齐后连续合格的三轮。恢复用时从本机故障注入算到第三轮结束，包含实验中故意保留的缺附件阶段。')+
 p('按包内说明准备 HAProxy 3.2.26，再运行 <code>python3 -B failover_lab.py --haproxy ./haproxy-3.2.26/haproxy --output my-run.json</code>。用 <code>python3 -B verify_record.py my-run.json</code> 核对两组记录。')+
 '<p class="practice-links"><a href="'+failoverLinks[0]+'" download>下载可复跑实验 ↓</a> · <a href="'+failoverLinks[1]+'">查看运行步骤 →</a> · <a href="'+failoverLinks[2]+'">查看代理与客户端原始记录 →</a> · <a href="'+failoverLinks[3]+'">核对 Linux CI 运行 ↗</a></p>'+
 h('native-kind-r3-node-loss','工作节点停机后，用新卷从原入口读回 R3')+
 p('这次沿用 <code>R3</code> 与 <code>object-v3</code>，在一台 Linux 机器上创建一个 kind 控制面节点和两个工作节点。集群外客户端一直访问同一个 NodePort，也就是 Service 暴露在节点上的固定端口。起初请求经控制面节点转发到工作节点 A，报告和附件从 A 的本地卷读出。')+
 table(['实际步骤','要看的证据'],[
  ['停掉工作节点 A 的容器','Docker 确认容器已停，随后 Kubernetes 将 A 的 <code>Ready</code> 记为 <code>Unknown</code>'],
  ['让 B 上的新 Pod 引用 A 的旧 PVC','Pod 保持 <code>Pending</code>。调度事件显示原卷的节点亲和性与 B 冲突'],
  ['用宿主机事先保存的备份在 B 建新卷','新 PV 和 PVC 的身份都变了。Service UID 和 NodePort 保持原样']
 ])+
 p('第 30 轮，客户端已从 B 读全报告和附件，第 31 轮的报告请求又失败。直到 EndpointSlice 显示只有 B 就绪，客户端才以第 67、68、69 轮的连续读回通过验收。每轮把请求 ID、Pod UID 和节点名与实际响应对上，再重算附件摘要。')+
 p('这里的卷是 Kubernetes 原生 <code>local</code> PV，数据在各工作节点各自的目录里。<a href="'+nodeLossLinks[4]+'">C4.6 的示例 CSI 卷</a>记录的是同一节点换 Pod。本次另在 B 恢复了一份卷，跨可用区的独立性和恢复耗时还要在目标环境实测。')+
 '<p class="practice-links"><a href="'+nodeLossLinks[0]+'" download>下载节点停机与恢复实验 ↓</a> · <a href="'+nodeLossLinks[1]+'">查看运行方法 →</a> · <a href="'+nodeLossLinks[2]+'">查看调度事件和请求记录 →</a> · <a href="'+nodeLossLinks[3]+'">核对 Linux CI 运行 ↗</a></p>'+
 p('真实数据库物理恢复需遵守自己的日志与基线规则。例如PostgreSQL连续归档需要合适的物理基线和所需连续WAL；逻辑导出不能充当这种WAL重放的基线，配置文件也需单独保护。本节SQLite程序检查应用层依赖，没有实现PostgreSQL物理恢复或跨系统原子快照。'),

 h('subsection-6-vxh3b7','从故障到最低服务，逐段计算时间')+
 p('另给一组串行演练预算：12:00中断，目标是在45分钟内恢复授权只读查询。恢复点选在哪里决定可接受的数据历史；下面各阶段耗时决定服务何时回来，两条时间轴分别计算。')+
 table(['依赖阶段','时间区间','耗时'],[['发现中断','12:00→12:04','4分钟'],['判断并冻结错误写入','12:04→12:08','4分钟'],['取得恢复权限','12:08→12:12','4分钟'],['装载数据','12:12→12:28','16分钟'],['重放所需变化','12:28→12:33','5分钟'],['消费者与权限校验','12:33→12:38','5分钟'],['切流并观察稳定','12:38→12:42','4分钟']])+
 p('按本题串行依赖，RTO口径的恢复时长为4+4+4+16+5+5+4=42分钟，距离45分钟目标还有3分钟。单看启动恢复命令到装载结束的16分钟，会漏掉发现、决策、权限、重放和用户验证；把前节18分钟的恢复点年龄再加进来，则混合了数据历史与操作耗时。',
 '装载量320GiB、有效吞吐20GiB/分钟时，仅传输就需16分钟。数据翻倍且吞吐不变，装载变32分钟，总预算变58分钟，超过目标13分钟。解压、写入竞争和重放也可能随规模改变，应按实际阶段测量，再判断增加下载带宽能否缩短瓶颈。',
 '若部分工作可以并行，应沿依赖图求最长路径。例如独立目标的预置可提前完成，但在缺密钥时不能假定已完成解密。手册同时记录阶段起止、数据量、吞吐与输出验证，下一次演练才能比较预置热数据、并行恢复或更快存储改善了哪一段。'),

 p('准备开放写入时，还要确定现在由谁接收新业务。网络分区下，联系不上旧主库，并不说明它已停止写入。写入权威是系统认可的执行资格；接管机制必须使已经过时的执行者无法继续产生受保护效果。改DNS、宣布提升或停止某个进程，都需与接收方实际拒绝旧请求的证据对应。',
 '一种表达方式是代际号：每次获准接管推进一个单调变化的编号，请求携带相应编号，真正执行修改的一侧在提交处检查它。检查和修改必须受同一原子条件保护，否则“先查代际、后无条件写”仍留下旧执行者插入的间隙。代际号用来识别新旧资格，认证与谁有权提升它另由可信机制负责。')+
 h('subsection-7-1bgmbh8','旧应用状态与接收方效果分别恢复')+
 p('再看独立的 recovered_effects.py。outbox是应用保存待发送动作的表；接收方回执是另一侧保存的动作结果。业务动作ID notify-R27标识同一次通知，total=37是它的内容，PENDING/DONE表达应用尚待确认或已确认。本例接收方把动作ID和内容一起检查：同ID同内容返回原回执，同ID换内容拒绝。',
 '程序先备份PENDING应用库，再发送通知。接收方已提交效果后注入HTTP 503，因此发送者看到失败时，效果仍可能存在。沿原ID确认后应用标为DONE；恢复旧应用备份，又会看到PENDING，接收方那一笔效果并未倒退。')+figures(r[6]).join('')+
 p('受信夹具控制器把接收方独立数据库中的代际从1升到2。接收方用BEGIN IMMEDIATE事务先核对代际，再检查动作身份和内容、写入效果；旧代际的新请求得到409，当前代际沿原ID得到200/duplicate=true。应用据原回执恢复DONE，效果仍是一笔37；独立反例换成新动作ID，接收方便新增第二笔。',
 '接收方的权威记录和回执不随应用备份回退，否则旧执行者和旧动作可能重新被接受。本例演示本机HTTP与事务条件，未实现生产身份或分区中的权威存储。真实接管需验证授权提升、存储一致性和旧写拒绝；无法查询且没有幂等协议的外部动作，恢复后应进入受控核对。',
 '开放入口还要逐步接纳工作：缓存冷启动、旧积压和客户端重试会一起访问刚恢复的下游。按并发与截止预算放量，观察好事件、连接等待、积压与重复结果，再从只读推进到完整服务。'),

 p('演练先固定故障范围、源版本、最低服务和两个时间目标，再准备隔离数据及可核对的初始结果。报告行、附件版本、摘要、权限正反例和已发送动作，都应能从预置清单查回；外部通知使用隔离接收方。这样注入故障后，验证者有明确的预期。',
 '按手册选择基线与连续材料，恢复到隔离目标，逐项验证记录依赖、授权查询和实际内容。数据物理校验通过而索引错误，或查询成功却跨租户泄露，都不能进入接流量阶段。要恢复写入，再核对旧执行者已被拒绝及外部动作沿原身份得到正确确认。',
 '同时记录实际发现、决策、取权、装载、重放、校验和切流的起止。数据完整到允许恢复点、服务在目标时间内恢复，两项分别出结论。演练结束核对临时资源清理、备份保留和审计材料，避免清理破坏后续恢复所需历史。',
 '已有存储程序可验证版本与提交清单，工具恢复程序可验证提交后的确认间隙，下一节两份本地程序各提供一段机制证据。多区入口、真实密钥、备份协议和身份仍需在其目标环境演练；库大小、索引、权限或加密配置变化后，重测受影响路径。')+linkRow(links(r[7])),

 h('subsection-9-xbrzl7','真实SQLite备份与完整报告前缀')+
 p('先运行 consistent_recovery_cut.py。程序自己创建源库、基线库、应用日志和对象目录，使用SQLite Backup API复制数据库。每条日志插入一份报告，并保存对象名与SHA256内容摘要。恢复器逐事务验证前缀，既检查数据库结构，也按应用查询读取附件。')+stdlibCommand(r9[0])+
 table(['改变的材料','检查结果'],[['只缺object-v3，直接重放到103','integrity_check=ok；R3附件缺失，业务不合格'],['按提交验证完整状态','停101/11:42，可读R1/R2，恢复点年龄18分钟'],['全部材料齐备','到103/11:57，四份A报告可读，年龄3分钟'],['日志缺102','不能跳103，停101'],['object-v2摘要不符','101事务回滚，保留100/11:30'],['按A租户执行查询','取不到B-report，验证本例消费者谓词']])+
 fold('展开consistent_recovery_cut.py完整源码',r9[1])+linkRow(r9links.slice(0,3))+
 p('源码中的minute是声明输入，用来计算恢复点年龄；程序没有测出云端RTO，也没有实现数据库物理WAL。A租户谓词通过只是这份查询的负例，不替代已部署IAM。先手算缺v3与缺102的停止位置，再把输出中的报告行集合、可读集合和停止原因逐项核对。')+
 h('subsection-9-qtm6c2','本机HTTP回执与旧写者拒绝')+
 p('再运行 recovered_effects.py。它使用另一组临时SQLite数据库和127.0.0.1随机端口，与前一个报告前缀实验相互独立；通知R27/37也不是其中R1至R4的一次重放。它验证应用备份倒退后，怎样沿原业务身份确认仍存在的接收方效果。')+stdlibCommand(r9[2])+
 table(['本次步骤','实际观察'],[['提交后注入503，再沿原ID确认','效果存在，确认返回原回执'],['恢复旧应用备份','outbox从DONE倒回PENDING'],['接收方代际升2，旧代际发起新动作','409 stale_owner_generation'],['当前代际沿notify-R27/37重投','200 duplicate=true，仍一笔37'],['同ID把37改38','409 intent_conflict'],['独立接收方副本改用新ID','效果计数变2']])+
 fold('展开recovered_effects.py完整源码',r9[3])+linkRow(r9links.slice(3))+
 p('两份程序只使用自己的临时数据；HTTP程序在结束时关闭服务线程。确认恢复后的应用最终为DONE、接收方仍只有原动作，再检查独立反例确实多一笔。本轮可在本地复跑这些标准库机制；真实故障切换、认证、密钥与用户恢复时间沿前节手册另验。'),

 p('最后换一组独立时间题：14:00发生中断，可验证业务状态完整到13:52，14:48授权只读查询恢复。目标RPO为10分钟、RTO为45分钟。恢复点年龄是8分钟，符合目标；服务恢复历时48分钟，超出3分钟。14:20完成数据装载只代表中间阶段，不能替换用户恢复时刻。',
 '解释这份结论时，给出证明13:52业务完整的提交清单、附件与权限结果，再沿恢复阶段找出超出的时间。随后提出能影响该路径的改进，例如预置大数据、提前验证恢复身份或缩短串行校验，并在同一故障范围下复测。',
 '再判断两个变化：若数据库位置仍到13:52却缺一份必要附件，应先修正业务恢复点结论；若查询已恢复而旧执行者仍能写入，完整写服务尚未通过接管条件。这样每个目标都落到具体状态与观察，而不是归结为副本更多或备份更频繁。')+linkRow(links(r[9]))
 ],'从正常业务依赖定义恢复对象，分别计算恢复点与恢复时间，再用真实SQLite和HTTP核对完整前缀、旧写拒绝与外部回执。',[],pres(localReadback),readbackLinks);
 resilience.sections[8][1]+=
 h('recovery-postgres-native-checkpoints','用真实 PostgreSQL 记录核对恢复点')+
 p('换到 C3.4 的 PostgreSQL 17.10 账户实验。三个分支都从同一份基础备份开始，余额是 100。只改变停止位置或归档材料，再看恢复出来的账户和交易账本。')+
 table(['恢复操作','日志位置或归档文件','实际结果'],[
  ['停在具名点 <code>after_t103</code>','<code>0/800420</code>','余额 125，账本含 T101、T102、T103'],
  ['重放到归档末尾','分叉位置 <code>0/900000</code>','余额 0，账本多了误清零的 T104'],
  ['仍指定具名点，移走目标段','归档文件 <code>000000010000000000000008</code>','恢复未到目标，实例启动失败']
 ])+
 p('在具名分支提交新事务 T105 后，余额从 125 变成 130。这个检查证明该恢复实例可以继续写。<a href="/article/storage-recovery/#native-postgres-pitr">到 C3.4 核对恢复命令、WAL 文件和账户查询</a>。')+
 p('计算恢复点落后多久，还要取得 T103 的业务提交时刻和事故参考时刻。计算服务恢复耗时，要记录中断何时开始、授权用户何时能查到符合要求的账户结果。这份记录保留了数据库位置和 SQL 结果，缺少这些时刻和应用侧验收。按<a href="/article/resilience/#section-4">第 4 节的起止条件</a>填演练记录时，两条时间线要分别记。');
 resilience.updated='2026.11.12';
})();
