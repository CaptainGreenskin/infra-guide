/* V60: execution objects before failure windows. Keep published sections, code,
   figures and deep links; this file changes only the two authored bodies. */
(()=>{
 const p=(...items)=>items.map(x=>'<p>'+x+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="progressive-detail"><summary>'+title+'</summary>'+body+'</details>';
 const matches=(body,re)=>[...body.matchAll(re)].map(m=>m[0]);
 const pres=body=>matches(body,/<pre\b[^>]*>[\s\S]*?<\/pre>/g);
 const figures=body=>matches(body,/<figure\b[\s\S]*?<\/figure>/g);
 const code=(body,index=0)=>matches(body,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g)[index]||'';
 const oldTable=(body,index=0)=>matches(body,/<div class="table-wrap"><table>[\s\S]*?<\/table><\/div>/g)[index]||'';
 const practiceLinks=body=>matches(body,/<p class="practice-links">[\s\S]*?<\/p>/g).join('');
 const sources=(...items)=>'<p class="source-at">'+items.map(([name,url])=>'<a href="'+url+'" target="_blank" rel="noopener">'+name+' ↗</a>').join(' · ')+'</p>';
 function finish(a,before){
  a.updated='2026.11.08';
  const old=before.join(''),now=a.sections.map(s=>s[1]).join('');
  const earlier=before.flatMap(pres),later=a.sections.flatMap(s=>pres(s[1]));
  if(earlier.length!==later.length||earlier.some((x,i)=>x!==later[i]))throw Error('Execution reading changed original code: '+a.id);
  const ef=before.flatMap(figures).sort(),lf=a.sections.flatMap(s=>figures(s[1])).sort();
  if(ef.length!==lf.length||ef.some((x,i)=>x!==lf[i]))throw Error('Execution reading changed original figures: '+a.id);
  for(const[,id]of old.matchAll(/\bid=["']([^"']+)["']/g))if(!now.includes('id="'+id+'"')&&!now.includes("id='"+id+"'"))throw Error('Execution reading lost anchor: '+id);
  const urls=new Set([...now.matchAll(/\bhref=["']([^"']+)["']/g)].map(m=>m[1]));
  for(const[,url]of old.matchAll(/\bhref=["']([^"']+)["']/g))if(!urls.has(url))throw Error('Execution reading lost URL: '+url);
 }

 {
  const a=articleById('agent-sandbox'),before=a.sections.map(s=>s[1]),old=[...before];
  a.sections[0][1]=
   p('权限章已经说明：资源服务依据林的身份和任务委托，决定能否读取A日报。现在设立画图任务R27：控制面取出获准的数据行，安排一段脚本生成统计图，再把合格图片交给林。R27是本章的独立任务；前章R17用于只读委托、R18用于审批写入，它们不是同一次运行依次改名。',
     '执行环境是承载脚本及其依赖的一组系统资源。控制面是管理任务、分配资源和接收结果的可信程序；执行区是实际运行脚本的地方。控制面先把任务要求转换成明确的输入、运行身份、可用能力和输出约定，再启动一个可追踪的运行实例。')+
   table(['R27中的对象','正常工作时的关系'],[
    ['输入','资源服务按委托取出获准的数据行，交给脚本只读使用'],
    ['脚本与依赖','读取输入、计算统计并生成图片；在执行区内运行'],
    ['运行实例','用实例ID标识这次执行，配置运行用户、临时工作区和资源预算'],
    ['产物','脚本写入任务输出区；控制面核对格式、大小、归属后交付'],
    ['运行记录','关联任务、实例、阶段、退出原因、产物版本与清理进度']
   ])+
   p('正常顺序是申请资源→准备输入和环境→启动脚本→生成图表→核验并导出→回收临时资源。沙箱是为工作负载设置能力边界的执行环境：文件决定能读写什么，网络决定能连接哪里，凭据决定能以什么权限请求服务，进程与资源控制决定能消耗多少。执行区内的生成脚本和外部依赖按不受信任代码管理，控制面保留资源分配、授权与交付决定。')+
   figures(old[0])[0];

  a.sections[1][1]=
   p('脚本首先作为进程运行。进程是操作系统安排执行和管理资源的对象，拥有虚拟地址空间、用户身份、打开的文件和线程。父进程负责启动它，并选择程序入口、环境变量、当前目录和可继承的资源。一个运行实例可能包含主进程和它创建的多个子进程，因此预算与回收常要覆盖整组工作负载。',
     'Linux容器把一组进程放进配置好的系统边界。命名空间（namespace）提供文件挂载、进程编号、网络等资源的不同视图；控制组（cgroup）按组管理资源；用户权限、能力集和系统调用过滤进一步限制可用接口。普通Linux容器共享宿主内核，R27只看到哪些文件、以哪个用户运行，取决于实际挂载与运行配置。',
     '虚拟机运行客户机内核，通过虚拟设备和虚拟机监控程序与宿主交互。微型虚拟机缩小设备和管理范围，适合一类轻量工作负载。gVisor采用另一条路线，用用户态应用内核处理许多工作负载系统调用。选择执行方式时，先列出R27需要的语言、依赖与系统接口，再比较兼容性、启动时间、内存开销和需要信任的组件。')+
   sources(['gVisor：应用内核与接口面','https://gvisor.dev/docs/'],['Firecracker：microVM架构','https://firecracker-microvm.github.io/']);

  a.sections[2][1]=
   '<div class="mechanism-core" id="sandbox-authority-boundary">'+h('subsection-3-1v63ba3','运行身份与启动时继承的能力')+
   p('为R27启动脚本时，控制面选择一个适合任务的受限用户，指定只读输入、任务工作区和必要环境。用户ID（UID）参与操作系统的文件访问判断；当前目录只决定相对路径从哪里开始解析。脚本仍能尝试绝对路径，实际能否打开由文件权限和可见文件系统共同决定。',
     '文件描述符（FD）是进程已经打开文件或其他内核对象的句柄。继承一个可读FD，就继承了一条已建立的读取通道。环境变量也可能携带地址、配置或密钥。启动器因此显式选择需要的环境项，关闭非必需FD，只把任务所需资源交给执行区；程序入口和挂载清单由控制面确定。',
     '本地夹具用无敏感内容的canary文件对照两种启动。canary是用于观察访问结果的标记文件。Python创建的新FD默认不可继承，Popen默认close_fds=True；反例刻意把假文件FD设为可继承，并设置close_fds=False、传入假环境项。最小启动分支只传必要环境、关闭非必需FD，于是两条继承通道都消失。')+
   figures(old[2])[0]+
   p('图中还有一个独立结果：两个分支都能按路径重新打开同UID可读的canary。关闭继承通道没有改变用户和文件可达范围。后面的文件节继续给出挂载与对象解析约束；把这两种机制接上，才能说明脚本实际可以读什么。')+'</div>'+
   sources(['Python：FD继承规则','https://docs.python.org/3/library/os.html#inheritance-of-file-descriptors'],['Python：Popen启动参数','https://docs.python.org/3/library/subprocess.html']);

  a.sections[3][1]=
   p('资源预算分成接纳与执行两步。接纳决定节点还能安排多少个R27这样的环境；执行限制规定每个环境实际可以使用多少CPU、内存和其他资源。两步使用相应的单位，才能把“还能接一个任务”落实到运行中。',
     '设教学节点有12个可用核、24 GiB内存，系统与控制组件预留2核和3 GiB，可分配10核、21 GiB。每个环境预留0.5核、0.75 GiB，暂不超卖：CPU容纳floor(10/0.5)=20个，内存容纳floor(21/0.75)=28个，同时满足两项约束的上限为20。独占卷、可用地址或租户配额还可能形成更紧的限制。',
     '这份0.5核预留随后映射到运行时规则。以Linux公平调度的CPU带宽为例，cpu.max写为50000 100000，表示整组每100000微秒周期最多消费50000微秒CPU时间。两个同时运行的线程各用约25毫秒，就共同耗尽这一份周期额度；父级控制组还可能给出更紧的限制。')+
   h('subsection-4-cz65tx','资源单位、覆盖对象与时间预算')+
   p('CPU累计时间是实际计算消耗，墙钟时间是从约定起点到截止的经过时长。等待网络的脚本几乎不消耗CPU，却仍占着环境与任务槽；因此R27同时需要CPU控制和墙钟期限。单文件大小、FD数量、进程/线程数、总临时磁盘、输出大小也分别计量。',
     'cgroup v2按层次约束组内进程。memory.max是内存硬限制，达到后会回收并可能触发组内OOM处理，个别情形允许短暂超出；memory.high主要施加回收压力与节流。pids控制器按内核任务计数，线程也会占用额度。单进程rlimit则分别限制该进程的累计CPU、单文件大小或FD数量，两者覆盖范围不同。')+
   oldTable(old[3])+
   fold('POSIX执行记录：CPU消耗与墙钟回收',p('配套程序在自己创建的子进程里设置限制：CPU计算任务与低CPU等待任务展示两种不同的时间控制。仓库记录的CPU约1.002秒；等待任务就绪后预算250ms，TERM后宽限200ms，再KILL并回收。第10节给出运行命令和完整源码。')+figures(old[3])[0])+
   p('容量账还要包含准备中与清理中的实例。若20份额度已用满，旧实例尚未回收就把它的额度交给新实例，实际占用会超过20份。清理完成后才归还对应额度；第8节把这条规则接到完整生命周期，第11节用代际标识避免清错实例。')+
   sources(['Linux：cgroup v2控制器','https://docs.kernel.org/admin-guide/cgroup-v2.html'],['Python：resource与rlimit','https://docs.python.org/3/library/resource.html']);

  a.sections[4][1]=
   p('R27的文件流从获准输入走向待交付产物。控制面把筛选后的数据表作为只读输入挂入执行环境，为本次实例创建独有的可写临时区和输出区。挂载是把指定文件系统对象接到环境中的某个路径；基础镜像提供程序和依赖，输入与输出卷再分别设置读写权限。',
     '脚本正常读取输入、计算统计、写出图片。控制面随后打开产物，检查真实格式、字节大小、像素或对象数量、所属任务及最终版本，把通过的产物导出到独立受控位置。复杂解析器也按输入与资源预算运行；HTML、SVG等可包含活动内容的格式，需要明确的发布隔离规则。')+
   h('subsection-5-1d8xng1','从路径名称绑定到打开的对象')+
   p('路径是对象的查找方式，打开的文件才是本次操作实际接触的对象。先检查路径字符串、稍后再打开，中间对象可能变化，这称为检查与使用间隙（TOCTOU）。仅把当前目录设为/work/R27，或只检查字符串以该目录开头，都没有把两次操作绑定起来。',
     '本地实验把问题缩成固定单级文件名report.txt。正常路径由可信侧先打开允许目录，再按目录FD相对打开该叶子，配合O_NOFOLLOW拒绝叶子符号链接，读到fixture-A。随后加入对照：先让前缀检查通过，再把叶子换成指向夹具外文件的符号链接（symlink），普通open便读到fixture-B；同一链接在受限叶子打开路径被拒绝。',
     '这一条件覆盖固定目录中的单级叶子。任意多级路径、硬链接、不可信挂载和可被来宾修改的目录权限还需对应机制。系统先用受限用户、独立挂载、只读输入和每任务可写区缩小可达集合，再为允许的文件操作选择安全解析方式。宿主根目录、控制面配置、运行时套接字和其他任务工作区不属于R27所需的输入。');

  a.sections[5][1]=
   p('网络出口决定脚本可以向哪些目的地建立连接；凭据证明调用者身份或授予某种访问能力。R27只处理已经准备好的本地数据时，可以在无网络出口的环境中完成画图。确实需要访问对象服务时，由受控代理提供任务需要的方法和资源范围，上游凭据保留在可信侧。',
     '一次获准访问同时经过三层判断：网络允许到达目的服务，服务识别任务身份，资源策略允许本次动作。受控代理据此检查服务、方法、路径、租户、受众和有效期，并按目标系统处理DNS解析后的地址与重定向。只读输入控制本地写入方式，出口控制读到的数据还能被送往哪里。',
     'Kubernetes NetworkPolicy主要约束地址、端口等三、四层通信，实际执行依赖支持策略的网络插件。它可以限制R27连接哪项服务；服务内部哪一个租户对象可读，继续由应用身份和资源授权决定。节点本地服务、元数据端点和现有连接的行为需要在具体网络实现中核对。',
     '凭据也随任务生命周期管理。任务范围、受众和时效受限的能力可以缩小使用范围；长期云凭据若曾被复制，删除工作目录不会使副本失效。撤权对新增请求何时生效、已开始的请求如何处理，由目标服务的协议明确。停止执行和撤销服务能力因此分别留下记录。')+
   sources(['Kubernetes：NetworkPolicy的范围与执行条件','https://kubernetes.io/docs/concepts/services-networking/network-policies/']);

  a.sections[6][1]=
   h('subsection-7-3sckdo','把执行边界映射到Linux与Pod配置')+
   p('前面已明确R27的用户、文件、出口和预算。部署时把它们映射到具体运行时：Linux namespace组织可见视图，cgroup管理组资源；用户权限、能力集和seccomp限制可调用接口。seccomp是系统调用过滤机制。Kubernetes的Pod字段负责表达其中一部分条件，镜像、挂载、网络与节点运行时继续各自配置。',
     '下面保留非root用户、禁止提权、能力集收紧和seccomp的Pod字段片段，并额外把根文件系统设为只读。输入卷只读、受限临时区可写，让程序仍能完成正常读入和输出。这一片段省略镜像、挂载及网络，不能单独部署。')+
   code(old[6])+
   p('Restricted Pod安全标准对非root、禁止提权、seccomp和能力集的要求有具体版本与操作系统条件；readOnlyRootFilesystem是本例额外加入的收紧项。只读根文件系统不改变其他挂载的权限；镜像须能以指定UID运行，程序需要的可写路径也须预先提供。',
     '选用gVisor等运行时，平台先在目标节点配置对应handler，再用RuntimeClass供Pod选择。RuntimeClass把Pod关联到已配置的运行时；一个runtimeClassName字段不会安装运行时。配置提交后，仍要核对实际Pod使用的身份、挂载、运行时、系统调用策略、网络和资源组。')+
   fold('部署核对：每一层保存什么证据',oldTable(old[6]))+
   sources(['Kubernetes：Pod安全标准','https://kubernetes.io/docs/concepts/security/pod-security-standards/'],['Kubernetes：RuntimeClass','https://kubernetes.io/docs/concepts/containers/runtime-class/']);

  a.sections[7][1]=
   p('运行实例从申请到回收，依次经过申请、准备、就绪、执行、停止请求、回收、回收确认。申请时占用配额；准备阶段取得镜像、挂载与输入；就绪后才开始约定的执行计时。脚本完成后，控制面核验并导出产物，停止受管工作负载，移除临时资源，再归还额度。',
     '设整个任务期限90秒，排队与准备已用18秒，核验和清理预留12秒，则脚本可用60秒。第一次执行45秒后失败，只剩15秒执行预算。重试继续使用剩余预算；不足时进入明确终态，或按任务规则等待延长期限，不能再无条件重置为60秒。')+
   h('subsection-8-1um1h4','停止确认、资源回收与外部效果')+
   p('用户取消时，控制面先停止新增授权与工具派发，再请求运行时停止工作负载，经过宽限后按规则强制终止。停止请求表示要求已经发出，进程退出表示对应进程已停止，回收确认表示约定资源已释放。主进程退出之后，控制面还要检查受管子进程、卷、连接、任务凭据和配额。',
     '本地监督程序为自己创建的子进程建立独立进程组。等待任务就绪后计250ms，先TERM、宽限200ms，故意忽略TERM的夹具随后被KILL，父进程wait确认直接子进程已回收。任意不可信子进程可能改变会话或进程组，真实运行时还需覆盖整组工作负载；本地进程组实验的结论限定到它实际管理的夹具。',
     '清理器使用任务标识、不可混淆的运行实例ID和代际编号记录待清资源。代际表示同一逻辑位置的第几次实例：旧清理请求只删除它原来负责的那一代。产物进入独立受控位置后，生成它的临时区才能释放。清理器重启后仍可按记录继续确认，达到条件才归还相应额度。',
     '外部效果另走工具协议。停止脚本不能撤回已经发给服务的写请求；已经提交的动作沿原操作身份查询回执，需要撤销时再按授权发起补偿。恢复章将从这条边界展开。')+
   '<p><a class="inline-link" href="#/article/agent-recovery">复习提交后响应丢失与结果未知 →</a> <a class="inline-link" href="#/article/config-secrets">区分凭据撤销与既有会话退出 →</a></p>';

  a.sections[8][1]=
   p('现在可以沿R27的完整路径验收：A工作区取得获准输入，生成预期图，交付后即使临时区已回收，产物仍可读取。再一次改变一个条件：尝试读取B工作区、连接未允许目的地、超过某项资源预算、取消执行。分别检查访问结果、实际对象内容与版本、限制命中和回收记录。',
     '生命周期的故障点也分别核对：准备失败是否归还预留资源，运行时重启能否发现无主实例，清理器崩溃后能否接续，清理超时是否仍占着应保留的额度。记录各阶段耗时、退出类别和清理滞留数，才能区分排队、准备、执行与回收的瓶颈。',
     '预热复用环境时，先说明共享哪些只读镜像层，哪些可写层、句柄、缓存和凭据按任务隔离。让A留下标记后启动B，核对B不可读取；无法可靠消除旧状态时，改用新实例，并测量启动与容量代价。')+
   fold('本章证据的范围与目标环境验收',p('配套POSIX程序真实创建子进程，观察继承、单进程rlimit、固定叶子路径和直接子进程回收；容量与代际程序是算术和字典模型。Pod片段说明配置关系，未运行容器验收。两类本地程序与片段均不构成生产沙箱或Kairo已验证的结论。接到目标环境后，保存运行时与版本、正常任务结果、越界输入、实际资源及清理证据，再判断对应边界是否成立。'))+
   '<p><a class="inline-link" href="#/article/kairo-practice">回到 Kairo，建立对应环境的验收清单 →</a> <a class="inline-link" href="#/article/agent-security">回看工具调用的授权边界 →</a></p>';

  a.sections[9][1]=
   h('subsection-10-nb0s8','POSIX实战：资源命中与墙钟回收')+
   p('第一个程序把第4节的单位变成可观察结果。它只对自己创建的子进程设置单文件、FD、CPU限制，再由父进程按独立墙钟预算停止等待任务。先预测计算任务与睡眠任务分别由哪种预算结束，再运行命令。')+
   code(old[9],0)+p('下表保留仓库已有执行记录；FD的额外打开数量与CPU耗时可能随系统变化，限制命中、退出类别和回收顺序才是要核对的关系。')+
   oldTable(old[9],0)+fold('完整subprocess_limits.py',code(old[9],1))+
   practiceLinks(old[9]).split('</p>')[0]+'</p>'+
   fold('变化题：单文件4096B是否等于任务总磁盘4096B？',p('单文件限制只约束每个文件；多个小文件与元数据仍会占空间。总临时盘预算应由相应卷或文件系统机制承担。'))+
   h('subsection-10-hi6ix7','POSIX实战：继承能力与叶子路径')+
   p('第二个程序先用普通文件完成读取，再比较刻意放开的继承与最小启动，最后让固定叶子被替换为symlink。夹具A/B是两份合成文件，与正文中的真实租户服务无连接。按下面命令运行，先检查正常叶子能读fixture-A，再核对各对照分支。')+
   code(old[9],2)+oldTable(old[9],1)+fold('完整descriptors_and_paths.py',code(old[9],3))+
   practiceLinks(old[9]).split('</p>')[1]+'</p>'+
   p('读完两个程序，再回到R27：启动器关闭了哪些继承通道？实际用户与挂载还允许哪些路径？预算覆盖单进程还是整组？停止以后哪些资源需要继续确认？按这四个问题迁移到第9节的目标环境验收。');

  a.sections[10][1]=
   p('容量与清理程序把两条规则缩成可运行模型。第一条沿第4节计算最紧资源：用整数毫核和MiB表示预算，得到CPU上限20、内存上限28，接纳取20。第二条沿第8节核对实例身份：slot-3只是可复用位置，run_id和代际号指向特定一次运行；旧代清理请求遇到新代时保持新实例。')+
   code(old[10])+
   p('先预测旧代清理后的字典，再执行针对新代的合法清理，最终应为空。把可分配内存减半，可观察瓶颈何时从CPU转向内存。完整程序和原执行记录在下一节。',
     '字典中的检查与删除是单线程操作；真实控制器应使用服务端条件删除或同等原子机制，保证检查之后对象没有换代。容量模型再补启动峰值、碎片、租户配额和实际开销，压测并发吞吐与相邻租户尾延迟。算术上限是接纳规则的起点。');

  a.sections[11][1]=
   p('下面集中保存容量与清理模型的完整源码，以及仓库原有输出与验证记录。它们对应上一节的20、28和清理后空字典；POSIX限制与路径程序的下载在第10节。运行时先核对相同初始条件，再比较关系与结果。')+
   fold('容量与清理完整源码',code(old[11],0))+practiceLinks(old[11])+
   fold('原执行输出',code(old[11],1))+
   p('R27完成画图后，控制面有产物版本和回收记录。如果它还调用外部工具发布结果，就会多出工具端提交与本地确认两份事实。下一章沿一次独立写操作，说明响应丢失后新进程怎样认回原结果。');
  finish(a,before);
  a.sections[6][1]+=p('根文件系统只读时，单独挂载的输入仍有自己的读写属性。<a href="/article/agent-sandbox/#native-sandbox-container">在真实容器里对照只读输入和可写输入 →</a>');
  const oldScope='Pod片段说明配置关系，未运行容器验收。两类本地程序与片段均不构成生产沙箱或Kairo已验证的结论。';
  if(!a.sections[8][1].includes(oldScope))throw Error('Missing sandbox evidence scope');
  a.sections[8][1]=a.sections[8][1].replace(oldScope,'Pod 片段说明配置关系。第 10 节另用 Docker 实跑文件边界，生产沙箱与 Kairo 仍需在对应环境验收。');
  a.sections[9][1]+=h('native-sandbox-container','在真实容器里读输入、写输出并检查越界写入')+
   p('用独立任务 R27-lab 把文件边界缩成一份报告。启动器把合成的 10 和 27 放入 <code>/input</code>，提供独立的可写 <code>/output</code>。容器以非 root 身份运行，用户和组编号都为 65534。根文件系统只读，容器移除了额外的 Linux 特权能力，并禁止通过执行新程序取得额外权限。两例各自创建容器和夹具，只改变输入挂载的读写属性。',
     '脚本先读输入并保存报告 37，再尝试向输入追加标记。两例的宿主输入文件都允许这个 UID 写入，因此只读组的 EROFS 来自挂载约束。EROFS 表示文件系统只读。另一处未挂载的合成标记文件在宿主仍存在，两次容器访问该路径都得到 ENOENT，表示路径不存在。')+
   trainingFigure('sandbox-container-boundaries','只改变输入挂载的读写属性。报告相同，输入完整性和独立验收结果不同。')+
   table(['实际观察','只读输入','可写输入对照'],[
    ['从输入生成报告','写入 37','写入 37'],
    ['在宿主核对输入字节','写入返回 EROFS，字节不变','写入成功，文件追加标记'],
    ['写根文件系统中的 /tmp','EROFS','EROFS'],
    ['独立验收','通过','输入被改动，拒绝']
   ])+
   p('两个进程都正常退出。容器外的校验器从原资料重算 37 和来源摘要，直接读取产物及宿主输入文件，最后核对两个容器 ID 都已从引擎列表消失。可写对照的报告也正确，输入完整性仍不合格。')+
   p('记录来自一台 Linux/amd64 CI 主机，使用 Docker 28.0.4 和固定的官方 Python 3.13 镜像。网络模式为 <code>none</code>，本次只记录到私有回环接口 <code>lo</code>。实际出口策略与生产隔离各需对应环境的用例。解压后可按说明拉取镜像，用第一条命令复跑。第二条只校验随包记录，无需 Docker。')+
   trainingCode('运行容器文件边界对照','SHELL','python3 -B sandbox_container.py --output my-record.json\npython3 -B sandbox_container.py --check-record validation.json')+
   '<p class="practice-links"><a href="/labs/sandbox-container.zip" download>下载源码、说明与记录 ↓</a> · <a href="/labs/sandbox-container/validation.json">查看实际记录 →</a> · <a href="https://github.com/CaptainGreenskin/infra-guide/actions/runs/42561457636">Linux CI 运行 ↗</a> · <a href="https://docs.docker.com/engine/storage/bind-mounts/#use-a-read-only-bind-mount">Docker 只读挂载 ↗</a></p>';
  a.sections[5][1]+=
   h('native-sandbox-egress','实战 · 给 R27 一条可核对的出口')+
   p('R27 要读取本租户的报告。实验后端预置金额 37，沿用前面 10 加 27 的业务结果。工作进程所在的沙箱网只接到出口代理。对象服务在另一条内部网。出口代理同时接入两网，只接收固定的 <code>GET /v1/tenants/A/reports/R27</code>，再用自己的凭据请求后端。')+
   trainingFigure('sandbox-egress-boundary','网络层缩小可连接的目的地，应用层限制请求方法和业务资源。核对两层各自留下的证据。')+
   p('先让代理从私有网直接探测同一个后端地址，确认服务确实在监听，再从工作进程直连该地址。前者返回 200，后者无法建立 TCP 连接。固定路径是为这个单任务配置的能力，多任务部署还要验证任务身份与资源的映射。')+
   table(['工作进程的动作','实际观察','后端请求记录'],[
    ['经代理读 A 的 R27','200，报告总额 37','收到一次获准的 GET'],
    ['直连后端地址','TCP 连接失败','无 HTTP 请求'],
    ['读 B、请求秘密路径或带查询参数','403','均未转发'],
    ['改用 POST 或自己提交 Authorization','分别为 405、400','均未转发'],
    ['再次读取 A 时，后端返回 302','代理返回 502，省去 Location','后端只收到原本获准的 GET']
   ])+
   p('把后端的访问记录按来源分开。代理一共发出两次同一路径的 GET，一次成功，一次收到 302。测试另从私有网直接请求 A、B 和秘密路径，三次均可读，证明拒绝来自隔离或代理规则。记录只保存秘密阳性对照是否成功。')+
   p('用实验包中的说明指定本地 Docker Unix 套接字，再运行 <code>python3 -B sandbox_egress.py --docker-host unix:///var/run/docker.sock --output replay.json</code>。先看工作容器的网络与权限，再对比客户端响应和后端账本。这次运行覆盖单机 Docker 与固定 HTTP 路由。公网、生产身份服务与 Kubernetes 网络策略需要在各自环境验收。')+
   '<p class="practice-links"><a href="/labs/sandbox-egress.zip" download>下载出口隔离实战包 ↓</a> · <a href="/labs/sandbox-egress/validation.json">查看网络与上游访问记录</a></p>'+
   sources(['Docker：内部网络与连接配置','https://docs.docker.com/reference/cli/docker/network/create/#network-internal-mode']);
  infraDomain('agent').points.find(point=>point.id==='ag-sandbox').body+=p('从工作进程、受控代理和后端三处观察同一份任务。<a href="/article/agent-sandbox/#native-sandbox-egress">运行沙箱出口对照 →</a>');
  a.updated='2026.11.09';
 }

 {
  const a=articleById('agent-recovery'),before=a.sections.map(s=>s[1]),old=[...before];
  a.sections[0][1]=
   p('沙箱章用R27说明受管脚本执行、停止与资源回收。本章转向一项独立教学动作：给demo账户增加37，最终只增加一次。这里用logical-add-1标识该动作，与R17只读委托、R18审批写入和R27画图任务没有共享数据库或运行链；数字37只是便于核对的固定业务值。',
     '运行器是安排步骤、发起工具调用并保存本地进度的程序；工具服务是真正修改目标资源的接收方。本例运行器用runner.sqlite保存任务，工具用tool.sqlite保存账户计数与回执，双方通过本地HTTP通信。两个文件属于独立持久化域：各自事务可以让域内修改一起提交或回滚。')+
   table(['事实由谁保存','正常一次加37中保存什么','证明什么'],[
    ['运行器的持久意图','原操作编号、参数指纹与阶段；请求参数由冻结的程序常量提供','这项动作已经准备，后续能找到原记录'],
    ['工具的效果及回执','账户由0变37，与原操作回执一起提交','工具已经完成这一次业务修改'],
    ['运行器的本地观察','收到并持久保存工具回执','本地已经拿到可核对的结果'],
    ['运行器的完成状态','业务结果核对后保存完成状态','这项任务按本例规则完成']
   ])+
   p('持久化是把状态提交到声明故障后仍能重新读取的存储。一次正常调用先后留下上面四份记录；它们归不同组件维护，因此工具完成与运行器确认之间存在间隙。恢复的职责是用稳定关联把记录重新接上，让新的进程据此继续。')+
   figures(old[0])[0];

  a.sections[1][1]=
   p('操作（operation）是一项逻辑业务修改，本例身份固定为logical-add-1。尝试（attempt）是投递或确认该操作的一次具体调用：进程恢复后可以再尝试，但仍指向原操作。回执是接收方保存的提交结果，绑定原操作、内容和业务值。任务目标、操作身份与每次尝试因而各有用途。',
     '运行器先把logical-add-1、account=demo、amount=37的参数指纹以及INTENT状态提交到runner.sqlite，再发送HTTP请求。参数指纹是对约定形式的参数计算的摘要，用来检查“同一编号是否仍是同一内容”；本例采用排序键、固定分隔符的JSON与SHA-256。',
     '任务行保存op、fingerprint、phase与observation，没有保存完整请求参数。新进程由原操作记录找回身份，再从同一份冻结程序常量PARAMS取出account=demo、amount=37重建请求，并检查记录指纹与程序指纹一致。指纹不能还原任意参数；一般系统需要持久保存完整参数，或指向可重新读取的固定输入版本。',
     '网络请求放在本地意图事务之后，本地数据库锁不跨越等待过程；运行器和远端工具的提交顺序由调用协议连接。')+
   fold('持久意图的简化顺序',p('这段保留的顺序示意把回执概括为“经核对”。完整夹具实际先提交OBSERVED，再执行内容断言，最后写DONE；第4节按这一源码顺序展开。')+code(old[1]))+
   p('crash_windows.py用固定操作记录、恢复路径与工具审计展示这些尝试，没有单独建立attempt计数表；章末的独立最小程序agent_lab.py才显式记录attempts。两者都保持业务操作身份不变。',
     '实际接口还需约定字段类型、整数范围、缺省值、币种、资源版本与身份授权。本章固定参数缩小了比较范围；摘要负责关联内容，资源服务继续确认请求有权执行。若先发出写入、后保存操作身份，进程可能在工具完成后丢失原身份，恢复时就缺少认回旧动作的线索。');

  a.sections[2][1]=
   p('现在沿正常一次提交走到工具端。接收方验证请求，开启tool.sqlite写事务，按logical-add-1查回执。初次没有记录，于是把账户计数从0加到37，再插入包含操作身份、指纹和amount=37的回执，二者一起提交，然后返回该回执。',
     '幂等协议规定同一逻辑操作重复到达时的结果。已有同键同指纹，接收方返回原回执，不再增加账户；同键不同内容则拒绝为操作冲突。唯一约束与事务保护这项决定，重复可以来自超时、迟到请求或进程恢复。')+
   code(old[2])+
   p('这份程序用BEGIN IMMEDIATE进入SQLite写事务，再查询、修改和插入；同库同时只有一个写事务推进，使重复请求在这份接收协议中汇合。效果与回执共同提交后，查询回执才有确定的本地业务含义。把回执写在另一次事务，会重新出现效果已有、去重记录未落盘的间隙。',
     '不注入崩溃运行同一worker路径，得到DONE、账户37、一份logical-add-1回执，接收审计只有一次effect_commit；这是后面故障窗口共同要恢复到的正常结果。运行器接到回执后的两次本地提交，在下一节继续展开。')+
   fold('回执保留与查询权限',p('回执需保留到允许重试与迟到请求的范围结束，并定义过期身份怎样处理。删除去重记录后若旧请求还能抵达，同一动作可能再次生效。回执查询与新增写入也各自检查当前权限；查旧结果不自动获得新写入资格。接收方若不提供稳定身份与原子回执，运行器本地去重表无法单独保证远端效果一次。'))+
   '<a class="inline-link" href="#/article/agent-security">核对工具提交前授权与回执读取权限 →</a>'+
   sources(['SQLite：事务与单写者语义','https://www.sqlite.org/lang_transaction.html']);

  a.sections[3][1]=
   p('工具已经提交37并返回回执后，运行器先把回执写入observation并提交OBSERVED。随后程序到达observation暂停点，实验可以在此固定崩溃位置；越过该点后，才断言回执的原操作身份、参数指纹和amount=37，满足后提交DONE。因此OBSERVED表示回执已经持久保存，不能据此判断后面的内容断言已完成。',
     '至此正常链路闭合：INTENT→工具效果与回执→OBSERVED→内容断言→DONE。状态名是本程序定义的本地进度，工具效果仍由tool.sqlite确认。')+
   table(['持久状态','新进程已经知道什么','接续方式'],[
    ['INTENT','原操作ID与指纹已保存，参数来自冻结的PARAMS；本地尚无持久观察','按原身份查工具；收到回执先保存观察，为空则依据同键协议用原参数重发'],
    ['OBSERVED','回执已经持久保存，内容断言尚可能未执行','读回观察，断言操作身份、指纹和amount=37，再推进DONE'],
    ['DONE','本例步骤已经完成','返回本地结果，不再请求工具']
   ])+
   p('现在让运行器在任意两个提交之间退出。新进程先读runner.sqlite，而非旧进程内存或聊天摘要。INTENT可能出现在尚未发出、请求在途、工具已提交或响应已收到几个窗口；状态少于网络瞬间的数量，因此需要接收方回执补足事实。',
     '查到回执，本程序先持久保存为OBSERVED，再检查操作身份、指纹和amount=37；查不到，则继续依据接收方协议判断。本例允许沿原身份和冻结参数重试，旧请求和新请求最终由工具事务去重；不具备该语义的服务需要保持待对账。OBSERVED恢复读回持久观察，继续执行同一内容断言；DONE再次恢复不增加工具请求。',
     '本地观察也是需要校验的内容。实验在正确恢复之后故意把观察的37改成99，独立验收会发现它与工具事实不符。第7节用六个确定窗口说明每种状态从哪里来，第8节再比较错误恢复。');

  a.sections[4][1]=
   p('恢复会继续原来的工作，取消则表达停止后续推进的要求。取消意图因此也要持久保存，供当前执行者和以后的恢复器读取。处理时先停止新增派发与业务写入，再确认在途操作、执行者和资源的状态；已经提交的logical-add-1仍保留原事实。')+
   '<div class="mechanism-core" id="cancel-request-and-effect">'+h('subsection-5-kha210','取消意图、执行状态与工具回执')+
   oldTable(old[4],0)+
   p('先看能够在同一权威库内排序的情形：提交者进入事务，读取取消状态，决定是否写效果与回执。取消先提交，后续效果被阻止；效果先提交，取消返回已完成。下面的cancel_receipts.py把取消、效果与回执放在一个本地SQLite权威库，专门观察这两个顺序。')+
   figures(old[4])[0]+
   p('这是一项独立取消实验。它不使用前面runner.sqlite/tool.sqlite分库HTTP协议，也没有把本地取消标记自动传播成远端原子取消。对分库在途请求，恢复器继续沿原操作查权威回执；工具需要提供相应的查询、取消或条件提交协议。',
     '协作取消由执行代码轮询或在等待点处理信号。请求已记录时，进程可能仍在运行；超时表示等待预算用完，之后还需确认退出与回收。强制结束直接子进程也不能据此认定它发出的远端请求已消失。')+'</div>'+
   h('subsection-5-3vclab','协议取消与提交后的补偿')+
   p('本文引用的MCP 2025-11-25版规定，普通请求用notifications/cancelled关联此前同方向、仍在途的请求；接收方可因请求已完成或无法取消而忽略。该旧版握手中的initialize请求不能取消，任务化请求改用tasks/cancel及其状态协议。消息表达停止要求，实际业务提交仍沿工具回执确认。')+
   fold('延伸：Temporal与Activity的取消',p('Temporal是持久工作流框架；Activity是交给工作进程实际执行的工作单元，可以调用服务、读写资源或完成计算。普通Activity通过心跳接收服务端取消，具体接收方式与SDK有关，执行代码也可能捕获取消继续工作。工作流可以选择等待Activity确认取消，或继续其他分支。这些选择决定后续推进方式，执行者与资源状态仍要按协议确认。'))+
   p('提交后的撤销称为补偿，例如撤销已发布对象。补偿是一项新的业务动作，有自己的操作身份、权限、幂等、失败与重试；原操作的成功回执继续保留。取消任务时，恢复器只对账原操作，不能为了查询结果再自动派发写入。')+
   code(old[4],0)+
   fold('独立单库取消实验：命令、记录与完整源码',p('本程序使用真实子进程、Event屏障和一个本地SQLite权威库。屏障把执行停在已知位置，放行后再继续，用来控制取消与提交先后；它与下一节HTTP实验分别运行。仓库记录保留派发前取消、协作与非协作停止、提交后取消四种结果。')+code(old[4],1)+oldTable(old[4],1)+fold('完整cancel_receipts.py',code(old[4],2))+practiceLinks(old[4])+p('范围是该本地事务与自己创建的子进程，未验证远端工具原子取消、任意进程树、MCP/Temporal或Kairo集成。'))+
   sources(['MCP：取消协议','https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation'],['Temporal：Activity取消与心跳','https://docs.temporal.io/activity-execution#cancellation']);

  a.sections[5][1]=
   p('这次只给 demo 账户加一次 37，操作编号是 <code>logical-add-1</code>。运行器发出写请求后，工具服务已经收到请求，但被实验暂停在提交前。此时只结束发请求的运行器，工具服务继续活着。这样的请求仍在途，也就是接收方还有可能把它做完。',
     '先查原操作的回执，结果为空，账户仍是 0。服务返回的正文是 <code>{"receipt":null}</code>。<a href="/article/agent-security/#section-10">G2 的 K1 查询</a>遇到的是 <code>read_denied</code>。那次查询因权限被拒绝，单凭这条响应无法判断接收方有没有回执。',
     '再放行旧请求，接收方把账户改成 37，并在同一次事务中保存回执。此时运行器库里还是 <code>INTENT</code>，表示只保存过原操作意图。新运行器再查同一个编号，取回那张回执，核对金额后推进到 <code>DONE</code>，账户仍是 37。')+
   figures(old[5])[0]+
   p('空回执只说明查询时还没有提交记录。旧请求与重试使用同一个操作编号时，接收方可以按第 3 节的事务规则合为一次效果。若服务无法按原操作查询，也没有可核对的重复处理规则，就保留待确认，等接收方或业务方核实。',
     '在<a href="/labs/agent-crash-windows/validation.json">原始记录</a>里找 <code>before_commit</code>，对照 <code>at_crash</code>、<code>after_old_request</code> 和 <code>recovered</code>。三项分别记录运行器刚退出、旧请求提交后、恢复完成时的两个库。<a href="/article/agent-runtime/#runtime-report-error-cases">回到日报案例，区分已收到的错误与仍未知的结果</a>。');

  a.sections[6][1]=
   p('现在把正常链路拆成六个位置，每次都从独立初态开始。父进程让自己创建的运行器到达屏障，再用SIGKILL结束它；工具HTTP服务保留在父进程中，继续使用自己的tool.sqlite。随后启动全新运行器进程读取runner.sqlite接续，不依靠旧进程内存。')+
   oldTable(old[6])+
   figures(old[3])[0]+
   p('六次杀进程的退出码都为−9，表示POSIX下受到SIGKILL；它描述进程的结束原因。最终的DONE、一次效果和37分别来自运行器状态、工具回执数与账户值。每个窗口恢复后再恢复一次，工具HTTP请求数均不增加；OBSERVED窗口还检查本地观察与工具回执相符。',
     '提交前屏障特别保留上一节的中间证据：原请求仍活着时GET为空，放行后旧请求提交，恢复者再认回这份回执。提交后窗口则在杀运行器之前已经有37，恢复不负责“重新做成37”，而是确认原来已经提交的动作。',
     '这些记录覆盖运行器进程崩溃、存活工具服务与同机SQLite。synchronous=FULL是程序的存储配置，记录没有注入断电、磁盘缓存故障或跨主机网络分区，也没有多个运行器竞争接管。后续工作流章会在稳定操作身份之上继续加入接管资格、代际安装与过期执行者隔离。')+
   '<a class="inline-link" href="#/article/durable-workflows">继续学习租约、接管与过期执行者 →</a>';

  a.sections[7][1]=
   p('正常恢复始终沿logical-add-1。第一个对照只改变这一点：工具已提交37、运行器还未收到响应时崩溃，恢复代码故意生成新操作身份。工具把新编号作为另一笔业务，再加37，得到74和两份回执；运行器仍可写DONE并正常退出。错误来自恢复者把一次业务目标拆成两个操作。',
     '第二个对照保持工具效果一次，在正确恢复后只把本地观察的amount改成99。工具仍是37，DONE仍在，独立验收比较两边记录便拒绝该结果。恢复完成需要内容与业务目标相符，完成标志本身只是其中一份记录。')+
   oldTable(old[7])+
   p('两项检查使用不同记录字段。新身份负例得到independent_oracle_accepted=false；观察篡改发生在原正例成功恢复之后，该正例的independent_oracle_accepted仍为true，另用corrupt_local_observation_rejected=true记录篡改后的验收拒绝。实验通过表示这两个错误分别被识别；读记录时同时比较原操作、账户值、回执集合与本地观察。');

  a.sections[8][1]=
   p('主实验crash_windows.py需要Python 3.9+标准库与POSIX进程信号。仓库原记录使用Python 3.12.13和SQLite；服务监听本机回环随机端口，程序仅结束自己创建的子进程。先写下六个窗口的本地状态与效果数，再运行源码核对。')+
   h('agent-crash-windows-run','运行crash_windows.py：分库HTTP恢复')+
   code(old[8],0)+
   '<p><a href="/labs/agent-crash-windows.zip" download>下载完整实验包 ↓</a> · <a href="/labs/agent-crash-windows/crash_windows.py" download>下载源码 ↓</a> · <a href="/labs/agent-crash-windows/validation.json">查看执行记录与源码摘要 →</a></p>'+
   p('读源码时先追worker如何保存INTENT、接收回执并写OBSERVED/DONE，再看Handler如何把效果与回执一起提交，最后看run_case如何停在屏障、杀进程、重新启动并独立读两库验收。固定教学工具没有真实身份服务或Kairo适配器；接入目标工具时要补上它实际提供的操作身份、授权、查询与验收接口。')+
   fold('完整crash_windows.py',code(old[8],1))+
   fold('独立最小实验：op-001与显式attempts计数',
    p('agent_lab.py是另一份分库实验，操作键为op-001，状态名用RUNNING/SUCCEEDED；它不接续logical-add-1的数据库。程序在工具事务提交后调用os._exit(23)，再启动新子进程。原操作、尝试记录与效果拥有者的职责相同，换编号只是区分独立夹具。')+
    oldTable(old[8],0)+
    p('预测第一次进程退出后：工具效果为1，runner仍为RUNNING。恢复沿op-001再尝试确认，attempts从1变2，接收方返回原回执，效果仍为1。两份数据库都在本程序创建的临时目录中。')+
    code(old[8],2)+code(old[8],3)+
    '<div class="download-box"><div><strong>配套系统实验包</strong><span>Python标准库 · 含独立Agent恢复程序与原执行记录</span></div><a href="labs/infra-systems.zip" download>下载实验包 ↓</a></div>'+
    p('读after_crash与after_recovery时，分别核对状态、attempts和tool_effects。策略先于效果检查，工具效果与回执同事务提交，runner先提交attempt再调用工具、返回后才提交完成。该程序还检查已完成动作读取、同ID不同参数拒绝与未允许工具拒绝。')+
    oldTable(old[8],1)+fold('完整agent_lab.py',code(old[8],4))+
    p('本程序只运行单worker，未测试租约竞争、过期执行者隔离、真实网络分区或断电耐久性。'))+
   p('最后把聊天与旧进程内存排除：原操作、指纹、可重建的固定参数和权威回执是否足以决定下一步？本夹具依赖冻结的程序常量，一般系统还需保存完整参数或固定输入版本。这份执行视图可以交给模型继续工作。记忆章会说明怎样从这些事实组装上下文；工作流章再把单步恢复接到多步骤计划、等待与执行接管。');
  finish(a,before);a.updated='2026.11.12';
  a.sections[8][1]+=
   h('mcp-receipt-before-checkpoint','回执已收到，检查点写到哪一步')+
   p('再做一次独立的发布报告实验。前面的分库 HTTP 实验用操作 <code>logical-add-1</code> 给账户增加了 37。这次用本机 MCP 工具发布 <code>report-A/v3</code>，金额是 42。打开<a href="/labs/mcp-recovery/validation.json">本次发布的原始记录</a>，先只读 <code>cases.stable.cut</code>，看工作进程被终止前的状态。')+
   table(['在 cut 中查找','核对什么'],[
    ['<code>observed_mcp.receipt</code>','工具已经返回 <code>report-A:publish</code> 的回执，<code>amount</code> 是 42，<code>revision</code> 是 1。'],
    ['<code>receiver.receipts[0]</code>','接收库里的回执与刚收到的回执逐字段相同，<code>receiver.reports</code> 里有一份报告。'],
    ['<code>checkpoint.values</code> 与 <code>checkpoint.next</code>','检查点只保存了 <code>intent</code>，没有 <code>receipt</code>，下一步仍是 <code>["publish"]</code>。']
   ])+
   p('先根据检查点预测新进程会跑哪个节点，再根据接收库判断发布是否已经发生。<a href="/article/durable-workflows/#mcp-commit-recovery">继续核对同一份记录里恢复后的工具尝试和报告数 →</a>')+
   h('recovery-lookup-after-commit','本地回执为空，怎么确认发布已经发生')+
   p('上面的进程收到回执后才退出。<a href="/article/durable-workflows/#native-model-mcp-recovery">另一份本机 MCP 实验</a>把退出点提前到接收方提交后、发送响应前。打开<a href="/labs/model-mcp-recovery/validation.json">原始记录</a>的 <code>cut</code>。任务库还在等待确认，回执为空。接收库已经有一份 42 的报告和一份回执。')+
   p('把下面的代码存成 <code>check_gap.py</code>，在原始记录旁运行 <code>python3 check_gap.py validation.json</code>。先查新进程发出的工具名，再核对查询、原任务和回执里的操作号。草稿摘要相同，接收库前后相同，才把这次查询算作对原发布的确认。')+
   trainingCode('从原始记录核对一次只读恢复','PYTHON',`import json
import sys

with open(sys.argv[1], encoding="utf-8") as file:
    record = json.load(file)

cut = record["cut"]
recovery = record["recovery"]
query = recovery["wire"]["request"]["params"]
receipt = recovery["after"]["receipt"]

assert cut["host"]["receipt"] is None
assert query["name"] == "lookup_receipt"
assert query["arguments"]["operation_id"] == cut["host"]["operation_id"]
assert receipt["operation_id"] == cut["host"]["operation_id"]
assert receipt["draft_sha256"] == cut["host"]["draft_sha256"]
assert len(cut["receiver"]["reports"]) == 1
assert record["receiver_final"] == cut["receiver"]

print(query["name"], len(cut["receiver"]["reports"]), recovery["after"]["state"])`)+
   p('这次输出 <code>lookup_receipt 1 DONE</code>。换成相同金额但不同草稿摘要，核对会停在摘要那一行。遇到查询失败时先保留待确认状态，避免用新的操作号再写一次。');
  a.updated='2026.11.12';
 }
})();
