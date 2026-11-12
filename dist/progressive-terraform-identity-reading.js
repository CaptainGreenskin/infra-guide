/* Follow resource observations and request identities through their own normal paths.
   Load after the progressive lessons and before first-reading-flow.js. */
(()=>{
 const p=(...rows)=>rows.map(x=>'<p>'+x+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const anchor=id=>'<span id="'+id+'"></span>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="full-code"><summary>'+title+'</summary>'+body+'</details>';
 const matches=(html,re)=>[...html.matchAll(re)].map(m=>m[0]);
 const pres=html=>matches(html,/<pre\b[\s\S]*?<\/pre>/g);
 const blocks=html=>matches(html,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=html=>matches(html,/<figure\b[\s\S]*?<\/figure>/g);
 const ids=html=>[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
 const hrefs=html=>[...html.matchAll(/\bhref=["']([^"']+)["']/g)].map(m=>m[1]);
 const bag=values=>JSON.stringify(values.slice().sort());
 const links=html=>matches(html.replace(/<figure\b[\s\S]*?<\/figure>/g,'').replace(/<pre\b[\s\S]*?<\/pre>/g,''),/<a\b[^>]*\bhref=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/g);
 const linkRow=values=>values.length?'<p class="practice-links">'+values.join(' ')+'</p>':'';
 const published={'terraform-state':['terraform-state-run'],'iam-security':['subsection-2-1dlazmr']};
 function select(id,titles){
  const a=articles.find(x=>x.id===id);
  if(!a||a.sections.length!==titles.length||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Terraform/identity source layout changed: '+id);
  return a;
 }
 function rewrite(a,bodies,desc,addedFigures=[]){
  const before=a.sections.map(s=>s[1]).join(''),after=bodies.join('');
  if(bodies.length!==a.sections.length||/<h2\b/i.test(after))throw Error('Terraform/identity H2 layout changed: '+a.id);
  if(JSON.stringify(pres(before))!==JSON.stringify(pres(after)))throw Error('Original Terraform/identity pre bytes or order changed: '+a.id);
  if(bag(figures(after))!==bag([...figures(before),...addedFigures]))throw Error('Original Terraform/identity figure changed: '+a.id);
  if(bag(hrefs(after))!==bag([...hrefs(before),...addedFigures.flatMap(hrefs)]))throw Error('Terraform/identity href multiset changed: '+a.id);
  const afterIds=ids(after);
  for(const id of [...ids(before),...published[a.id]])if(!afterIds.includes(id))throw Error('Terraform/identity anchor lost: '+a.id+'/'+id);
  if(new Set(afterIds).size!==afterIds.length)throw Error('Terraform/identity duplicate explicit anchor: '+a.id);
  bodies.forEach((body,i)=>a.sections[i][1]=body);a.desc=desc;a.intro=desc;a.updated='2026.11.09';
 }

 const terraform=select('terraform-state',['先分清配置、状态记录与实际资源','计划先读取，执行才兑现变更','状态锁保护的是哪一份共同记录','一次关闭刷新，怎样得到误导性的绿灯','只刷新状态，为什么文件仍然没有恢复','工作空间分开了状态，为什么仍会互相覆盖','把计划、状态和交付流程连起来','运行实验，分别读取三份事实']);
 const t=terraform.sections.map(s=>s[1]),t2=blocks(t[1]),t8=blocks(t[7]);
 if(t2.length!==1||t8.length!==2||pres(t.join('')).length!==3||figures(t.join('')).length!==3)throw Error('Terraform original evidence extraction changed');
 rewrite(terraform,[
 p('交付要先明确将要改变什么。基础设施即代码（IaC）把资源期望写成可版本化的配置，再由工具读取目标系统、比较并执行变化。Terraform是这样的工具：它管理一组有名字的资源，通过状态记录把配置里的名字关联到实际对象。',
 '正常路径是：加载配置与所选状态，借助提供程序读取实际对象，生成本次计划，审阅后执行，再保存新的状态并核对实物。配置描述想要什么，状态保存已经绑定了谁及上次记录的属性，实际资源存在于目标系统；一次外部修改可以只改变其中一份事实。')+
 table(['对象','本章的具体值','职责'],[['配置','local_file.managed，路径managed.txt，内容alpha','声明要管理的资源及期望属性'],['提供程序 provider','hashicorp/local 2.5.3','解释local_file类型，读取或修改文件'],['实际资源','文件系统中的managed.txt','保存此刻真正可读的字节'],['状态 state','资源绑定、标识与已知属性','让后续操作找回同一个受管对象'],['后端 backend','本次为local后端','存放状态，并提供相应状态锁'],['计划 plan','根据本次输入提出的变化','交给审阅者及后续apply执行']])+
 p('local提供程序和local后端虽然同名，操作的对象不同：前者管理文件资源，后者保存Terraform自己的状态。本例配置地址local_file.managed也不是文件内容或云平台ID；它是配置内部的资源名字，实际对象的标识规则由提供程序定义。',
 '图中alpha是配置要求，outside是随后人为写入的内容。沿配置、状态和实物分别读数，便能判断变化发生在哪一层。云实例通常由平台ID识别，不能把本例文件内容校验的规则直接用于所有云资源。')+figures(t[0]).join(''),

 p('init准备后端和提供程序，validate检查配置，plan再为本次操作建立观察。普通计划先读所选state，经提供程序刷新资源事实，在内存中比较当前观察与配置，再列出所需动作。保存计划会把这次决定写入计划文件；这一步尚未兑现其中的资源修改。',
 'apply执行计划中的动作，并保存相应state。显式传入保存计划时，执行的是那份计划；没有传计划文件时，apply会先生成新计划。refresh-only则选择另一种目的：仅计划如何把记录对齐到实际观察，不把资源改回配置；应用这份计划以后，新的认识才被持久保存。')+t2[0]+
 p('本章驱动对用于判断变化的plan统一添加-detailed-exitcode。这个选项把“命令执行成功”进一步分成有无差异；自动化必须按这一约定读取退出码。普通plan成功时，不能仅凭其默认退出码区分有变化与无变化。')+
 table(['带-detailed-exitcode的plan退出码','含义','下一步'],[['0','计划成功，差异为空','核对本次观察范围与独立实物读数'],['1','命令失败','先查看锁、配置、权限或读取错误'],['2','计划成功，存在差异','审阅动作，决定是否执行']])+
 p('退出2不是执行失败，也不表示资源已经被修改。退出0只说明这次采用的输入未产生差异；是否读取了最新资源、选了哪个工作空间，仍决定它回答的是哪个问题。后文的“0”和“2”都沿这份详细退出码约定；状态锁冲突返回的1则是一条真正的失败路径。'),

 p('共享一份state的执行者需要协调。两个操作都从旧记录出发，可能各自决定修改并覆盖后保存的结果。支持锁定的后端会为相关操作取得这份状态的锁，按其协议完成读取、执行与保存，再释放，让其他操作重新取得当前记录。',
 '本次local后端通过操作系统API锁定本地状态；.terraform.tfstate.lock.info记录锁的相关信息。是否实现互斥不能只看这个说明文件是否存在，更不能把删除它当作让活跃操作安全结束。')+
 figures(t[2]).join('')+
 p('实验用两个真实Terraform进程固定并发顺序。第一个apply已经创建alpha文件，又在terraform_data.gate的local-exec执行钩子中暂停，此时仍持有状态锁。第二个plan设置-lock-timeout=0s，立即因无法取得锁而退出1；父进程确认第一个仍存活后才放行，首个apply成功结束。随后同配置的详细计划退出0。',
 '屏障是把程序停在指定位置、等待另一方放行的实验控制点；这里的内建terraform_data资源及执行钩子用来稳定制造锁占用窗口。它们不是管理普通云资源所必需的步骤。',
 '状态锁的范围是这一本账。人工写文件、另一个工作空间或另一套state仍可能修改同一实物。远端后端是否支持锁及怎样恢复，取决于后端实现；发现锁占用时先关联持有者与操作结果，确认没有活跃写入后再处理遗留状态。'),

 p('首次apply后，配置要求alpha，state记着alpha，managed.txt也确实是alpha。现在程序绕过Terraform，把同一文件写成outside；这次外部编辑只改变实物，先前状态记录尚未改变。漂移就是实际对象与受管期望或既有观察之间出现的偏离。',
 '接着运行带-detailed-exitcode和-refresh=false的计划。关闭刷新使提供程序不再读取最新文件，计划仍用state中的alpha与配置alpha比较，因此退出0。独立读managed.txt却是outside。这两份结果分别描述比较输入与真实字节，可以同时成立。')+
 table(['时点','配置','持久state中的文件内容','独立读取实物'],[['首次应用完成','alpha','alpha','alpha'],['外部编辑完成','alpha','alpha','outside'],['关闭刷新后生成计划','alpha','alpha','outside；本次计划差异为空']])+
 p('如果流水线把这一行0解释成“环境没有漂移”，就扩大了命令的检查范围。保留刷新选项、后端、工作空间、提供程序版本和直接文件读数，才能复原这次比较。云API权限、缓存及未受管字段同样会影响能观察到的事实，但具体行为应由对应提供程序验证。'),

 p('现在保持配置alpha与磁盘outside，生成refresh-only计划。这次提供程序重新读文件。官方local 2.5.3用保存的内容摘要标识这份文件资源；内容校验不符时，把原受管资源从刷新后的观察中移除。因此resource_drift里出现local_file.managed的delete。这个动作描述原绑定已经失效，尚不是一次删除磁盘文件的操作。',
 '这份详细刷新计划退出2。apply它之后，持久state不再包含local_file.managed，磁盘仍保留outside；内建屏障资源的记录仍在。再生成普通计划，配置要求的文件没有有效绑定，于是resource_changes提出create。执行该计划，提供程序把实际文件写回alpha，并重新记录受管对象。')+
 table(['步骤','变化落在哪一层','实际文件'],[['生成refresh-only计划','内存观察及计划中发现旧绑定不再有效','outside'],['apply刷新计划','把新观察保存到state，移除旧文件绑定','仍为outside'],['生成普通修复计划','按配置提出create','仍为outside'],['apply修复计划','执行文件写入并更新state','恢复alpha']])+
 p('JSON中的resource_drift与resource_changes承担不同说明：前者描述刷新发现的偏离，后者描述该计划准备执行的资源动作。审阅delete/create时，要先确定它属于哪一层、哪一种计划。其他提供程序可能把外部编辑报告为属性变化或替换；本例的删除绑定规则来自这个固定版本的local_file。',
 '有意的外部变更可以通过调整配置及刷新记录纳入管理；无意漂移可以选择按原配置修复。先决定期望，再审阅覆盖内容和影响范围，才能让执行兑现正确目标。'),

 p('CLI工作空间（workspace）让同一配置选择不同state。每份状态历史有自己的lineage标识，serial记录该历史中的快照推进；它们帮助区分历史与版本，不是资源的访问凭据或全局所有权。改变工作空间也不会自动改变配置中的文件路径。',
 '实验创建blue与green。blue用content=alpha应用，green再用content=beta应用；两份state具有不同lineage，却都管理ROOT/managed.txt。green完成后文件是beta，blue还记着alpha。切回blue，用详细退出码计划但关闭刷新，仍得到0；允许刷新以后得到2。')+figures(t[5]).join('')+
 table(['观察位置','记住或读到的内容','说明'],[['blue state','alpha','blue自己的管理历史'],['green state','beta','green的另一份管理历史'],['同一个managed.txt','beta','最后一次实际写入的结果'],['blue重新读取后','发现原文件绑定已失效','可提出变化，不再把缓存认识当成现场']])+
 p('两份状态的锁各保护自己的记录，不能阻止对方操作相同目标。环境隔离还需设计资源名字、账号、目标位置与执行身份；工作空间名本身不会建立这些边界。转交受管对象时，应安排状态迁移或导入、验证原管理者退出，再核对新归属。简单复制state会把同一绑定交给更多执行者。'),

 p('把上述关系带入交付流水线，每次执行都要固定配置修订、变量、提供程序版本、后端与工作空间，记录计划采用了什么观察，再让审阅和执行绑定到同一份计划。之后重新读取目标对象，确认应用真正需要的资源和属性已兑现。',
 '保存计划不会因编辑配置自动升级；另一执行推进state后，旧计划也可能因状态前提失效而被拒绝。交付章的内建资源实验专门验证这两种顺序，本章的local_file则继续验证锁、外部编辑和刷新。两份实验使用不同资源类型，判断时保留各自输入与记录。',
 'state和计划可能包含敏感属性，即使终端隐藏了某些值，也应按保存文件的实际内容控制访问、传输和留存。源代码的公开范围不能直接决定这些运行记录的公开范围。',
 'Terraform可由流水线周期执行，GitOps控制器持续调谐自己的受管对象。若二者反复把同一副本字段改成2和3，会形成来回覆盖。先明确对象或字段由谁管理、另一方怎样引用或退出，才能让自动化形成一条可解释的控制链。')+linkRow(links(t[6])),

 anchor('terraform-state-run')+
 p('既有terraform_state.py在Linux CI以Terraform 1.13.0和官方hashicorp/local 2.5.3执行。它只管理自己临时目录里的文件和状态，使用专用CLI配置；不是云资源或远端后端实验。首次init需要下载该固定提供程序，Docker与Kubernetes不是这项实验的前提。',
 '程序先用两个进程验证锁，再依次外部编辑、关闭刷新、应用refresh-only、按配置修复，最后比较两个工作空间。各阶段同时保存state和实物读数，计划函数明确添加-detailed-exitcode。')+t8[0]+
 table(['固定记录中的检查','实际结果'],[['并发状态锁','第二个plan退出1；第一个apply仍运行，放行后成功'],['外部编辑后不刷新','详细计划退出0；文件outside，state仍记alpha'],['应用refresh-only','详细计划退出2；旧文件绑定移除，磁盘outside保留'],['普通修复','提出create，执行后文件与状态恢复alpha'],['工作空间碰撞','blue/green历史不同、目标同路径；blue不刷新退出0，刷新退出2']])+
 p('可用terraform state pull核对lineage、serial及资源地址，用计划JSON区分漂移与拟执行动作，再直接读取managed.txt。不要拿state里的content代替文件读数，也不要把本例state快照序号当成其他工作空间可比较的统一时钟。完整记录及程序摘要保留在下载包。')+
 fold('展开terraform_state.py：固定版本、并发屏障与逐阶段断言',t8[1])+linkRow(links(t[7]))+
 p('复算一条完整路径：alpha三者一致→实物outside→不刷新计划0→刷新计划2→应用刷新后绑定消失→普通计划create→执行回alpha。然后解释blue为何仍能覆盖green写过的同一个文件。答案要分别落到读取、记录、执行与归属，并能从记录中找出各阶段的独立读数。')
 ],'沿配置、提供程序、计划、状态和实物走通一次变更，再用真实锁、刷新与工作空间记录判断每一步改变了什么。');
 terraform.sections[4][1]+=p('看<a href="/labs/delivery-systems/validation.json">两项独立实验的记录</a>。Terraform 应用仅刷新计划后，<code>managed.txt</code> 仍是 <code>outside</code>，执行普通修复计划才写回 <code>alpha</code>。另一项实验用 Argo CD 按 Git 声明持续检查集群。同一个 Git 提交下，控制器发现差异时仍有 2 个副本，开启自愈后才回到 1 个。<a href="/article/gitops-reconciliation/#section-3">到 C6.3 看哪项设置会触发修复 →</a>');
 terraform.updated='2026.11.12';

 const identityFigure='<figure class="training-figure"><a href="diagrams/v70-identity-models.svg" target="_blank" rel="noopener" aria-label="放大：AWS角色身份与Kubernetes权限规则的不同位置"><img src="diagrams/v70-identity-models.svg" width="1120" height="760" alt="AWS角色是可被代入的身份；Kubernetes ServiceAccount是主体，Role保存权限规则，RoleBinding关联主体与规则。两条请求都先认证再授权。" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>两套对象模型分别解释自己的请求。AWS示意没有实际云执行；Kubernetes具体观测来自独立原生API夹具。<a href="diagrams/v70-identity-models.svg" download>下载 SVG ↗</a></figcaption></figure>';
 const credentialWindowFigure='<figure class="training-figure"><a href="diagrams/iam-credential-window.svg" target="_blank" rel="noopener" aria-label="放大凭据有效期图"><img src="diagrams/iam-credential-window.svg" width="720" height="264" loading="lazy" alt="10:00 签发，10:30 停止签发新凭据，原凭据到 10:45 才到期。接收方可按当前权限或撤销规则决定是否提前拒绝。"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>只停止签发的模型中，原凭据还有 15 分钟的时间有效期。是否允许请求还要查看接收方规则。<a href="diagrams/iam-credential-window.svg" download>下载 SVG ↗</a></figcaption></figure>';
 const identity=select('iam-security',['门能打开，不代表屋里什么都能动','沿着身份链走一遍，找出每次委托','从一项具体任务推导最少的权限','允许、缺少允许、显式拒绝是三种判断','两次拒绝与一次更危险的成功','短期凭证要处理签发、续期和撤销三个时刻','把最小权限验收写成正例和负例','课堂验收：单次成功可以说明多少事','配套实战：真实HTTP授权与无副作用验收']);
 const i=identity.sections.map(s=>s[1]),i2=blocks(i[1]),i3=blocks(i[2]),i9=blocks(i[8]),i9links=links(i[8]);
 if(i2.length!==4||i3.length!==1||i9.length!==6||i9links.length!==7||pres(i.join('')).length!==11||figures(i.join('')).length!==2)throw Error('Identity original evidence extraction changed');
 rewrite(identity,[
 p('A 租户的用户提交导出任务 17。平台确认用户有权提交这项任务，再为后台程序安排获准的身份。程序取得证明身份或委托的材料，也就是凭据。它带上凭据，请求存储服务读取固定版本 v3 的输入，再把结果写到任务 17 的目录。',
 '存储服务先验凭据，识别请求中的用户或程序身份，这一步叫认证。这个被识别的身份叫主体。接着，存储服务根据主体、动作、目标和请求条件，决定是否允许这次读写，这一步叫授权。实际写入后，再查产物和归属，确认导出结果落在指定目录。')+
 table(['决策位置','要确认的事实','本章导出设计题'],[['用户进入平台','用户属于哪个租户，能否提交任务','用户A获准提交任务17'],['平台安排执行者','任务能使用哪个工作负载身份和目标范围','固定输入版本v3与任务17输出位置'],['数据接收方','请求代表谁，当前动作与目标是否被允许','读取A输入，写入A任务17结果'],['业务完成后','实际效果及所属对象是否正确','结果存在、归属正确，拒绝请求没有先写数据']])+
 p('存储拒绝访问时，先查请求实际用了谁的身份、执行了哪个动作、访问的是哪份资源。直接授予管理员权限也会放开其他动作和资源，可能让别的租户借平台越权访问。')+linkRow(links(i[0])),

 p('委托让一个程序以获准身份执行任务，平台仍需把原用户和任务约束落实到目标。人员可以有部署权限，运行中的工作负载则使用自己的主体；下游通常看到该工作负载的调用身份，不会自动取得最初用户的全部业务归属信息。',
 '在AWS中，IAM角色是一种可被代入的身份。信任策略说明谁可取得该角色会话及相应条件，权限策略说明这个角色可访问哪些动作和资源。STS的AssumeRole在规则满足后返回临时凭据：访问密钥ID、秘密访问密钥和会话token；调用者随后用这些材料按AWS API协议发起请求。会话策略可以进一步收窄本次会话的相应权限。',
 '为同账号AWS服务指定运行角色是另一种委托入口。iam:PassRole检查部署者能否把指定角色传给相应服务，服务之后再按自己的信任关系代入角色；它不表示部署者本人已获得该角色会话。应一起约束可传角色、接收服务以及能控制工作负载代码和配置的接口。')+linkRow(links(i[1]))+
 p('Kubernetes采用另一组对象：ServiceAccount为工作负载提供主体身份，Role保存命名空间内的权限规则，RoleBinding把规则关联到主体。这里的Role不是待取得的登录身份，也不负责签发凭据；TokenRequest API负责申请有期限、面向指定受众的ServiceAccount token。受众是这份凭据预期适用的接收方。')+
 identityFigure+
 anchor('kubernetes-identity-normal')+h('subsection-2-1dlazmr','沿ServiceAccount身份读取一份ConfigMap')+
 p('原生identity_lab.py使用独立输入report-a/reports-v1，data.value="37"。report-a是命名空间（namespace），界定对象的命名范围；另一个命名空间中的同名reports-v1是另一份资源。管理路径为report-a中的report-reader申请token；业务客户端加载CA（证书签发机构）的证书来验证HTTPS服务器证书，再携带Authorization: Bearer凭据请求这个ConfigMap。CA证书用于验证服务器，Bearer材料用于让API识别请求者，两者各有用途。',
 'API认证出的完整主体名为system:serviceaccount:report-a:report-reader。授权时通过RoleBinding找到相应Role，核对namespace、get动作、configmaps类型和reports-v1名称，允许后返回200。客户端再核对对象名称、归属及37，才完成这次读取。')+figures(i[1]).join('')+
 p('核心API中的self.k是显式使用本实验私有kubeconfig的管理调用；self.opener是仅加载CA的业务HTTPS客户端；PATH指向上述固定对象。TokenRequest在本例由管理员代为申请，不能由此推断这个只读ServiceAccount本身有签发token的管理权限。')+i2[0]+
 p('token的sub声明主体，aud声明适用接收方，exp声明到期时间；解码这些字段用于观察，验真仍由接收方完成。本记录申请600秒，实际exp−iat也是600秒。SelfSubjectReview返回当前请求实际使用的主体；TokenReview则请API检查给定token对指定受众是否通过认证，不替代具体资源动作的授权。')+
 fold('按需核对凭据声明、TokenRequest与CA/Bearer客户端',i2.slice(1).join(''))+
 p('实际Pod通常可通过kubelet管理的投射凭据取得并更新token，应用仍需按使用方式读取。本实验选择管理申请和独立客户端，未验证投射或自动刷新。业务客户端也未加载管理员证书，否则一次管理员读取成功可能掩盖report-reader没有权限。'),

 p('最小权限从具体工作推导：导出器读取A的固定输入，写A的任务17输出，按需要查询上传结果。读、写、列举和删除是不同动作，目标也要分到正确对象或范围；已知完整对象名的读取不必因此取得列举整个桶的权限。业务版本v3的名字还需映射为所用存储API支持的对象标识与条件。',
 '先算一组宽泛规则的影响：把读、写、删除三个动作都授给A、B两个任务目录，在这个简化直积模型中开放3×2=6种动作目录组合。真正需求应分别表达A输入读取与任务17输出写入，避免用一组动作乘上一组资源扩大组合。真实IAM动作可支持哪些资源粒度，要查对应服务。',
 '条件值还要有可信来源。若用户随意填写tenant，平台再据此签发会话标签或选择输出前缀，用户就能把目标改成B。应先由认证身份及受信任务记录确定归属，再生成目标与受控属性。JSON Schema只能检查字段形状，租户归属由业务权威记录检查。')+
 anchor('kubernetes-identity-rbac')+
 p('在原生读取夹具中，把需求翻译成Role：apiGroups中的空字符串表示核心API组，resources=configmaps选择对象类型，verbs=get允许取得单个已知对象，resourceNames=reports-v1限定名称。Role位于report-a；RoleBinding的subjects指向report-a/report-reader，roleRef指向该权限规则。')+i3[0]+
 table(['请求事实','本例匹配条件','实际负例'],[['主体','report-a/report-reader','从拒绝响应和SelfSubjectReview核对实际主体'],['作用范围','report-a / configmaps / reports-v1','换名称、跨namespace或读Secret均403'],['动作','get单个已知对象','PATCH修改、list列举均403'],['返回对象','预期namespace、名称及data.value=37','状态码之外继续检查内容']])+
 p('Kubernetes API中的get与list是不同权限动作：读取一个已知名称与列举集合，即使用相同HTTP方法，也要分别授权。RBAC规则累加所有适用绑定的允许，没有Deny规则；排查时应检查该主体是否还从其他RoleBinding或ClusterRoleBinding获得权限。配置读取资格也不自动授予报表服务中的任意用户数据访问。'),

 p('再用AWS展开权限求值，先固定这张表的范围：同账号，请求权限来自角色身份策略和本次会话策略，没有资源策略直接授权，也不加入额外边界或组织策略。角色允许读取A输入对象及写任务17输出，会话策略只允许读取该输入；这里对输入的访问用GetObject表示，对输出用PutObject表示。')+
 table(['同一会话的请求','角色策略','会话策略','本例结果'],[['GetObject：A输入','允许','允许','可继续执行相应读取'],['PutObject：任务17输出','允许','未允许','缺少会话允许，拒绝'],['GetObject：B输入','资源不匹配','未允许','拒绝'],['A输入匹配新增显式Deny条件','原有允许仍在','原有允许仍在','显式拒绝覆盖允许']])+
 p('前两层都允许时，再加入一条适用于当前请求的显式Deny，例如禁止读取被标为隔离的对象，匹配请求仍会失败。缺少任何匹配Allow造成的拒绝，通常称隐式拒绝；显式拒绝则来自实际匹配的Deny语句。排查需要找出是哪种结果，不能把每次403都当作存在一条待删除的Deny。',
 '这份角色与会话的交集模型有明确前提。真实AWS请求还可能有资源策略、权限边界与组织策略等授权或限制；同账号资源策略授予角色ARN与授予特定会话的规则也有区别。ARN是AWS资源标识。先列出本次主体和适用策略，再按其组合规则求值，不能把所有来源一律当成同一个交集。',
 '前节Kubernetes的Role规则采用累加允许，本节的AWS策略可以含显式拒绝。两套求值规则分别解释自己的请求，角色同名不意味着规则可以互换。')+linkRow(links(i[3])),

 p('沿正常链定位两种拒绝。若工作负载尚未取得AWS角色会话，先查调用身份、信任主体、角色标识及取得会话所需条件。若已经携带正确会话发起PutObject，则查动作、对象ARN、请求条件和适用策略；对象加密时还可能涉及独立密钥权限。两次失败停在不同决策点。',
 '更需要解释的是越权却成功：B租户请求平台把结果写入A目录，平台用自己的大权限身份执行成功。下游只证明该工作负载被允许，平台仍需证明这项委托来自有权用户。因此应先用任务权威记录确认租户与输出归属，再生成规范目标；能在下游收窄的动作与资源也同时收窄。',
 '部署权限也属于这条链。允许指定高权运行身份、又允许修改执行代码的用户，可能借运行中的服务取得原本没有的能力。对可传角色、工作负载创建或修改、任务目标生成分别设边界，才能使正常部署与越权路径有不同结果。',
 'AWS讨论的confused deputy是受托服务替不适当委托方完成动作的情形。第三方跨账号委托可结合合适的ExternalId条件区分客户上下文；服务主体则可能使用来源账号、来源资源等条件。字段的适用场景需按具体服务核对，最终仍要把本次调用绑定到正确客户和任务。')+linkRow(links(i[4])),

 p('凭据生命周期至少涉及签发、续期和接收方是否接受当前请求。先用独立时间题：10:00签发，10:45到期；10:30停止签发新凭据。在只改变未来签发、既有权限不变的模型中，原凭据还有15分钟有效期。停止续签本身没有改写已签材料的到期时间。',
 '要阻断现有访问，还需按目标机制修改当前权限、撤销相应资格或改变受信密钥等，并观察它们何时在接收方生效。应用缓存和已经建立的会话也有各自退出方式。核对一次原来允许的请求从何时开始失败，比只记录控制台上的修改时刻更接近实际结果。')+
 credentialWindowFigure+anchor('kubernetes-identity-changes')+
 table(['原生API改变的条件','认证结果','同一读取请求'],[['reader-1不变，删除唯一业务RoleBinding','TokenReview仍为true','200→403'],['恢复该RoleBinding','同一主体仍通过认证','403→200，再读出37'],['换为reports-api.invalid受众的token','TokenReview为false','401'],['删除另一枚token所绑定的Pod UID','轮询后观察到认证失败','同token请求401']])+
 p('这些结果来自同一次Kubernetes夹具。前三次200→403→200使用完全相同的reader-1；改变的是当前RBAC允许。错误受众的token由同一来源签发，但并不适用于这个API。401在这条实验路径上表示凭据未被接受，403响应则明确带出已识别的report-reader主体。')+figures(i[5]).join('')+
 p('最后一组另用绑定Pod UID的token。UID标识具体对象，同名重建会是另一个UID。该Pod由一个不存在的调度器保持Pending，只提供API中真实存在的绑定对象，没有运行报表容器。删除命令完成后程序开始计时，经过19次TokenReview检查观察到失败，并用HTTP核对401；包含随后HTTP核对的记录耗时为9.959秒。',
 '这是一次观察，不是所有接收方在发出delete时立即失效的时限。在线TokenReview能按API状态检查绑定对象；只在本地核对签名和时间的验证者，还需考虑自己怎样获知权限或绑定状态变化。原请求已经读出的数据和已经完成的业务效果，也不会随凭据失效自动撤回。',
 '审计用主体、任务、资源、动作、凭据来源或版本及决定关联这条时间线，不保存原始密钥或token。Secret的编码形式也不能代替其存储加密、读取控制和注入机制。'),

 p('最小权限既要保留必要功能，也要在受保护效果发生前拦住越权。先在导出设计题中定义四项调用：读本租户固定输入、写本次任务输出、写另一任务输出、删除输入；前两项应成功，后两项应拒绝。每项同时核对实际主体、目标版本、返回结果和最终产物。',
 '只检查拒绝码可能漏掉“先修改，最后才报拒绝”的错误路径。需要独立读取受保护对象或接收方记录，在请求前后比较。反过来，全部拒绝也不能说明策略正确：应让必要正例持续成功，避免把一个不可用的空身份当作最小权限。')+
 table(['改变一个条件','预期检查','证据位置'],[['主体不变，目标改到其他租户或任务','拒绝且目标未被修改','接收方决定与独立数据读取'],['凭据仍可信，动作超出当前允许','授权拒绝','当前策略、调用上下文与效果'],['受众错误、过期或签名不符','认证失败','验证结果与实际请求'],['恢复必要授权','正例重新成功','目标内容及实际主体']])+
 p('本地工具策略、HTTP服务与Kubernetes API各能验证自己的执行边界。Agent权限实验可继续检查受控工具动作；第九节的HTTP与原生程序则分别查看SQLite效果和API对象。将它们带入真实云身份时，仍需按对应账号、信任与资源策略执行同样的正反核对。')+linkRow(links(i[6])),

 p('回到A租户任务17：用户有提交本租户任务的权限，平台有创建工作者的权限，获准工作负载可读输入v3、写任务17输出。用户却把路径改为任务18，并要求使用运维管理员角色。提交被接受、拿到某个凭据和成功写入，各自能说明哪一层，必须分别回答。',
 '正常实现先从受信任务记录取得租户和任务身份，再生成规范输出目标；运行身份从平台预先允许的集合中选择。数据接收方继续评估实际请求。于是写17可成功，改写18或扩大角色的请求应在产生效果前被相应决策点拒绝。')+
 table(['课堂核对项；各两分','答案应落到的事实'],[['主体与目标分开','谁发起动作，读写哪份输入和输出'],['取得身份与执行权限分开','谁可取得角色会话，取得后可做什么'],['委托来自受信记录','路径与运行身份不能由客户端自授'],['一对必要正反例','允许写17，拒绝写18，独立核对产物'],['停止续签后的现有调用','检查到期、当前权限及接收方实际决定']])+
 p('继续把方案翻译成具体平台：AWS确定角色会话与适用策略；Kubernetes先确定ServiceAccount主体，再关联Role规则。写出这些对象及正常调用顺序，才有条件解释哪次修改会使一次拒绝变成允许。'),

 p('authorization_http_lab.py在本机创建HTTP服务与SQLite，使用自定义HMAC凭据；HMAC用共享密钥校验消息内容。另一份identity_lab.py的固定记录来自Linux上真实kind API。两份程序的主体、对象和信任实现分别核对。',
 '先运行标准库HTTP程序。它有reader-A与writer-A两个主体，报表rA/rB在数据库中分别属于A/B。签发材料带有主体、租户、scopes（声明的动作范围）、受众、到期及策略代际epoch；epoch是本例识别当前策略资格版本的整数。接收方还查当前服务端策略和实际行归属，再决定是否执行写入。')+i9[0]+
 table(['本机HTTP实际检查','结果'],[['读A的rA；writer-A获准写A','200，A最终1次写入'],['跨租户或用A路径包装B的rB','403，B写入0'],['reader-A声明write scope但服务端仍只读','403，签发材料不能扩大当前策略'],['过期、零期限、错误受众、伪造签名','401'],['reader-A的策略代际1→2','旧代际403，新代际200'],['信任K2后移除K1','K2通过，K1凭据401'],['本次审计','14次请求各有独立request_id，不记录凭据']])+
 fold('展开既有HTTP实验结果',i9[1])+
 fold('展开authorization_http_lab.py完整源码',i9[2])+
 p('持有HMAC共享密钥的一方也能签发这份本地凭据；它不是只持公钥验签的信任分工。这个两段式实验格式也不是JWT/OIDC实现。程序核对14项请求；其中A只写一笔是这次固定调用集合的结果，没有提供任意重试的业务去重保证。')+linkRow(i9links.slice(0,3))+
 p('下面另保留rbac-readonly.yaml配置审阅示例，namespace为infra-security-lab。它展示ServiceAccount、只读Role及RoleBinding的对应，未作为上一份HMAC程序的一部分执行，也不是下方原生记录使用的report-a对象。')+
 fold('展开独立最小RBAC配置：infra-security-lab',i9[3])+
 anchor('kubernetes-identity-run')+
 p('原生identity_lab.py在Linux CI实际运行kind v0.33.0、Kubernetes v1.35.8；固定节点镜像摘要、私有kubeconfig和随机命名集群写在程序中。业务请求只使用CA信任和ServiceAccount Bearer材料，管理证书仅用于准备对象、TokenRequest/TokenReview及独立读取。')+i9[4]+
 table(['原生API固定检查','结果'],[['report-a/report-reader读reports-v1','200，ConfigMap内容37；SelfSubjectReview核对完整主体'],['其他名称、namespace、PATCH、Secret、list','五组403，响应主体仍是report-reader'],['同reader-1删除/恢复业务绑定','200→403→200；三个阶段认证均通过'],['错误受众 / 删除绑定Pod后','401 / 401，TokenReview认证失败'],['独立管理员前后读取四个对象','UID、resourceVersion与数据摘要全部不变']])+
 p('独立读数覆盖三个ConfigMap和一个教学Secret，检查拒绝路径是否修改了任何受保护对象；读到37则证明必要正例仍可用。固定执行来自隔离Linux CI，节点镜像有内容摘要，结束时确认本次集群已删除。--check-record只复核已有记录，不启动Docker；完整实验运行分支则会建立自己的集群。')+linkRow(i9links.slice(3,4))+
 fold('展开identity_lab.py完整源码：请求、独立oracle与自有资源清理',i9[5])+linkRow(i9links.slice(4))+
 p('这份原生记录覆盖API认证与RBAC，没有验证kubelet投射自动刷新、云IAM、网络隔离或生产多租户。把案例用于自己的服务时，先替换为实际主体、资源及适用机制，再保留同样的成功内容、拒绝决定与独立效果三类证据。')
 ],'沿工作负载主体、凭据、认证、请求授权到业务效果建立身份链，再分别核对AWS角色会话、Kubernetes规则和两套实际实验。',[identityFigure,credentialWindowFigure]);
 const spiffeHref='/article/iam-security/#native-spiffe-workload-identity';
 const spiffeLink='<a href="'+spiffeHref+'">运行工作负载证书与双向 TLS 实验 →</a>';
 identity.sections[1][1]+=p('工作负载还可以用证书表明身份。SPIFFE 规定身份标识和凭据接口，SPIRE 则能识别本机程序并发放凭据。第 9 节沿同一份报表，核对取得身份、连接对端和获准发布这三个决定。'+spiffeLink);
 identity.sections[5][1]+=p('证书形式的凭据还需要对端验证。第 9 节的 SPIRE 实验只观察一次发证和随后的请求。'+spiffeLink);
 identity.sections[8][1]+=h('native-spiffe-workload-identity','真实 SPIRE：证书可信，谁能发布报表')+
 p('SPIFFE ID 是服务身份标识，例如 <code>spiffe://infraguide.test/worker-a</code>。其中 <code>infraguide.test</code> 是信任域，验证方用该域的信任包核验证书链。X.509-SVID 是携带 SPIFFE ID 的证书凭据，工作负载还持有对应私钥以证明自己有权使用它。')+
 p('本地 SPIRE Server 建立信任包，Agent 用它验证 Server，再以一次性节点令牌注册。应用通过本地 Unix 套接字访问 Agent 的 Workload API。Agent 识别实际调用进程的可执行路径，与注册条目比较，给报表服务、A、B 发放各自的证书。第四个进程的路径没有注册，调用 API 时返回 <code>PermissionDenied</code>，证书数为 0。')+
 '<figure class="training-figure"><a href="diagrams/spiffe-workload-identity.svg" target="_blank" rel="noopener" aria-label="放大：SPIRE 发证、双向 TLS 与报表授权"><img src="diagrams/spiffe-workload-identity.svg" width="440" height="414" alt="SPIRE Agent 按路径发放证书。A 和 B 都通过双向 TLS，报表服务按证书身份允许 A 发布 37、拒绝 B。" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>两次请求报文相同，报表服务从证书辨认实际调用者。<a href="diagrams/spiffe-workload-identity.svg" download>下载 SVG ↗</a></figcaption></figure>'+
 p('双向 TLS（mTLS）要求客户端和服务端都验证对方证书。A、B 都核对服务端身份是 <code>report-api</code>，服务端都接受这两个同信任域的合法证书。两次发布都携带相同业务编号和金额 37，HTTP 头也都自称 A。报表服务从握手验证后的证书读取实际身份，再检查发布资格。')+
 table(['实际调用者','HTTPS 响应','独立读取效果文件'],[['B 先发，同信任域证书，自称 A','403，服务端看到 B','0 笔'],['A 后发，同样的请求内容','201，服务端看到 A','1 笔，金额 37，归 A']])+
 p('在 <code>workload.go</code> 中，<code>NewX509Source</code> 从 Workload API 获取凭据；<code>MTLSClientConfig</code> 固定服务端身份，<code>MTLSServerConfig</code> 验证客户端信任域。HTTP 处理器用证书里的 ID 决定是否写入，驱动在两次请求后分别读取效果文件。这三个进程身份用同一系统用户下的不同可执行路径区分，适合演示匹配。')+
 '<p class="practice-links"><a href="/labs/spiffe-workload-identity.zip" download>下载完整实验包 ↓</a> · <a href="/labs/spiffe-workload-identity/README.md">查看运行说明</a> · <a href="/labs/spiffe-workload-identity/validation.json">查看签发、请求和效果记录</a> · <a href="https://github.com/CaptainGreenskin/infra-guide/actions/runs/42579127780">查看 Linux CI 实跑 ↗</a></p>'+
 '<p><a href="https://github.com/spiffe/spire/blob/v1.16.0/doc/plugin_agent_workloadattestor_unix.md">SPIRE 1.16.0 Unix 选择器 ↗</a> · <a href="https://spiffe.io/docs/latest/spiffe-specs/spiffe_workload_api/">SPIFFE Workload API 规范 ↗</a></p>';
 identity.sections[6][1]+=h('native-kubernetes-admission','有权限创建 Pod，为什么还是提交失败')+
 p('报表发布账号 <code>report-writer</code> 在 <code>report-a</code> 有创建 Pod 的权限。它先提交普通报表 Pod，成功了。再提交一份带 <code>privileged: true</code> 的配置，也就是请求以特权模式运行容器，API 却拒绝写入。')+
 p('授权检查的是这名用户能否在指定命名空间执行 <code>create pods</code>。通过授权后，准入还会在写入前检查这次提交的对象。这里用 <code>ValidatingAdmissionPolicy</code> 定义规则，用 <code>ValidatingAdmissionPolicyBinding</code> 指定规则在哪些命名空间生效，以及校验失败时怎么处理。')+
 '<figure class="training-figure"><a href="diagrams/kubernetes-admission.svg" target="_blank" rel="noopener" aria-label="放大 Kubernetes 授权、准入与写入对照"><img src="diagrams/kubernetes-admission.svg" width="460" height="432" alt="同一报表账号提交四份 Pod。授权、创建、管理员读取依次是允许 201 200、允许 422 404、允许 201 200、拒绝 403 404。" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>授权自查、提交响应与管理员读取各回答一个问题。<a href="diagrams/kubernetes-admission.svg" download>下载 SVG ↗</a></figcaption></figure>'+
 p('CEL 是用来写真假判断的表达式语言。实验用它逐个检查 Pod 的普通容器。只要有一个容器显式设置 <code>privileged: true</code>，校验就失败。规则只匹配 Pod 的 <code>CREATE</code> 操作，绑定再选中带 <code>report-admission=enforced</code> 标签的命名空间。')+
 fold('看策略表达式和绑定选中的标签','<div class="code-block"><pre><code># ValidatingAdmissionPolicy.spec 的校验片段\nvalidations:\n- expression: &gt;-\n    object.spec.containers.all(c, !has(c.securityContext) ||\n    !has(c.securityContext.privileged) || !c.securityContext.privileged)\n  message: report containers must not run privileged\n  reason: Invalid\n\n# ValidatingAdmissionPolicyBinding.spec 的匹配片段\npolicyName: reports-no-privileged\nvalidationActions: [Deny]\nmatchResources:\n  namespaceSelector:\n    matchLabels:\n      report-admission: enforced</code></pre></div>')+
 table(['提交对象','授权自查','API 写入响应','管理员独立读取'],[
  ['report-a/safe，普通容器','允许','201','200，privileged=false'],
  ['report-a/privileged，特权容器','允许','422，Invalid','404'],
  ['report-b/privileged，命名空间无标签','允许','201','200，privileged=true'],
  ['report-c/privileged，账号没有绑定角色','拒绝','403，Forbidden','404']
 ])+
 p('排查时先确认实际主体和授权自查，再看提交响应里的 <code>reason</code> 与 <code>message</code>。本例 422 的 <code>reason</code> 是 <code>Invalid</code>，消息里有 <code>forbidden</code> 和准入策略名。有些准入规则也会返回 403。最后用管理员账号重新读取，确认拒绝的对象没有写入。')+
 p('在 <code>report-c</code> 的记录里，授权自查返回 <code>allowed=false</code>，错误指出 <code>report-writer</code> 无权在这个命名空间创建 Pod。调度章的 kind 实验也读到了 <code>Forbidden</code>，错误信息给出了 CPU 配额的名称和数字。<a href="/article/scheduling-resources/#quota-admission-forbidden">顺着配额名称核对已用和上限 →</a>')+
 p('本地实验启动真实 API Server 与 etcd。成功响应里的对象 UID 与管理员读取一致，记录只覆盖对象的 API 写入，环境中没有调度器和工作节点。')+
 p('要核对运行时的文件限制，还要让进程实际试写，再从宿主读取输入。<a href="/article/agent-sandbox/#native-sandbox-container">G3 的独立 Docker 实验</a>中，两组都写出金额 37，只有只读挂载组保住了输入原文。')+
 '<p class="practice-links"><a href="labs/kubernetes-admission.zip" download>下载代码与运行说明 ↓</a> · <a href="labs/kubernetes-admission/main.go">查看实验程序</a> · <a href="labs/kubernetes-admission/validation.json">核对四组 API 响应</a> · <a href="https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/">Kubernetes 准入策略文档 ↗</a></p>';
 identity.desc=identity.intro='沿工作负载主体、凭据、认证、授权到业务效果建立身份链，再用本地 HTTP、Kubernetes API 和 SPIRE 证书实战核对每一层。';
 identity.updated='2026.11.12';
})();
