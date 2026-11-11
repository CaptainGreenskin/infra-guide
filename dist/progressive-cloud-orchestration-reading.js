/* Follow one application from image and process to replica control and node placement.
   Load after the existing progressive lessons and before first-reading-flow.js. */
(()=>{
 const p=(...rows)=>rows.map(x=>'<p>'+x+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const anchor=id=>'<span id="'+id+'"></span>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="full-code"><summary>'+title+'</summary>'+body+'</details>';
 const matches=(html,re)=>[...html.matchAll(re)].map(m=>m[0]);
 const blocks=html=>matches(html,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=html=>matches(html,/<figure\b[\s\S]*?<\/figure>/g);
 const links=html=>{
  const rest=html.replace(/<figure\b[\s\S]*?<\/figure>/g,'').replace(/<pre\b[\s\S]*?<\/pre>/g,'');
  const found=matches(rest,/<a\b[^>]*\bhref=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/g);
  return found.length?'<p class="practice-links">'+found.join(' ')+'</p>':'';
 };
 const select=(id,titles)=>{
  const a=articles.find(x=>x.id===id);
  if(!a||a.sections.length!==titles.length||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Orchestration source changed: '+id);
  return a;
 };
 const published={
  'container-runtime':['container-native-run'],
  'k8s-workloads':['subsection-4-4ww5rs','subsection-4-15h5yam','subsection-7-aclmrr'],
  'scheduling-resources':['scheduler-native-run']
 };
 function replace(a,bodies,desc){
  const before=a.sections.map(s=>s[1]).join(''),after=bodies.join('');
  const pres=html=>matches(html,/<pre\b[\s\S]*?<\/pre>/g);
  const hrefs=html=>[...html.matchAll(/\bhref=["']([^"']+)["']/g)].map(m=>m[1]).sort();
  const ids=html=>[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
  if(bodies.length!==a.sections.length)throw Error('Orchestration section count changed: '+a.id);
  if(JSON.stringify(pres(before))!==JSON.stringify(pres(after)))throw Error('Orchestration original code changed: '+a.id);
  if(JSON.stringify(figures(before).sort())!==JSON.stringify(figures(after).sort()))throw Error('Orchestration original figure changed: '+a.id);
  if(JSON.stringify(hrefs(before))!==JSON.stringify(hrefs(after)))throw Error('Orchestration href multiset changed: '+a.id);
  const nextIds=ids(after);
  for(const id of [...ids(before),...published[a.id]])if(!nextIds.includes(id))throw Error('Orchestration anchor lost: '+a.id+'/'+id);
  if(new Set(nextIds).size!==nextIds.length)throw Error('Orchestration duplicate anchor: '+a.id);
  bodies.forEach((body,i)=>a.sections[i][1]=body);a.desc=desc;a.intro=desc;a.updated='2026.11.09';
 }

 const runtime=select('container-runtime',['先分清镜像、容器、进程与内核','镜像层、可写层和挂载怎样组成文件系统','namespace隔离视图，cgroup限制消费','从Pod声明走到宿主进程','PID 1与停止信号：有限时间内完成排空','CPU、内存和线程限制，要看不同证据','实际比较namespace时，先固定生命周期','运行容器实验，保留完整条件和结果']);
 const r=runtime.sections.map(s=>s[1]),r1=blocks(r[1]),r3=blocks(r[3]),r4=blocks(r[4]),r7=blocks(r[7]);
 if(r1.length!==1||r3.length!==1||r4.length!==1||r7.length!==3)throw Error('Container code layout changed');
 replace(runtime,[
 p('前面的云计算章说明应用可以运行在虚拟机或容器中。本章沿一个查询服务走到实际进程：先用镜像交付程序，再由容器运行时准备文件、隔离视图与资源配置，最后启动服务进程。容器运行时是执行这些创建、启动、停止操作的软件；内核仍负责调度线程、管理内存并访问设备。',
 '镜像是可用于创建容器的文件系统变更集合与启动配置，例如应用文件、依赖库、入口命令和默认环境。容器是基于它创建的运行实例，带有自己的实例身份和运行状态。进程是已启动的程序及其状态，线程是其中被调度执行的单位。同一镜像可以创建两个容器，产生两组独立进程。')+
 figures(r[0]).join('')+
 table(['对象','正常运行时负责什么','怎样认出它'],[['镜像','提供程序文件与默认启动配置','镜像引用、内容摘要与平台架构'],['容器实例','组织本次文件视图、挂载和运行配置','运行时实例 ID 与容器状态'],['进程与线程','执行程序，维护地址空间和打开的文件','宿主上的进程身份与所在命名空间'],['宿主内核','调度、系统调用、内存和设备管理','所在 Linux 环境与内核版本']])+
 p('普通 Linux 容器共享所在宿主的内核；镜像中的发行版文件提供用户态程序与库。容器也可运行在 Linux 虚拟机中，此时共享的是虚拟机内的 Linux 内核。Kubernetes 再用 Pod 组织一个或多个容器，约定共同放置、网络与卷等资源，后面的工作负载章会继续管理这些 Pod。'),

 p('镜像内容需要先定位。标签 tag 是便于使用的名字，可重新指向其他内容；摘要 digest 是按内容计算的标识。多平台镜像引用可能先指向镜像索引，再按节点架构选择具体内容。记录实际摘要与平台，才能说明这次进程使用了哪份程序。',
 '镜像层记录相对前层新增、修改或删除的文件。运行时准备根文件系统，让进程通过 /app 等路径访问应用；常见实现把只读镜像层与本次可写层组合起来。采用 OverlayFS 时，修改下层已有文件可能先复制到上层，这叫 copy-up；它会为一次看似很小的修改增加复制工作。',
 '挂载把另一份存储接到某个路径。例如把卷挂到 /data，程序写 /data/orders.db 才会写到该卷；若把目录挂到 /app，原镜像中的 /app/config.json 会被新目录遮住。运行时还按配置选择用户，文件访问由实际用户、路径权限和挂载选项共同决定。')+r1[0]+
 p('上面三条命令分别核对镜像内容身份、实例实际挂载和配置用户。持久数据的保存依赖实际写入位置：Docker 重启同一个容器可保留其可写层，删除后新建容器则有新的可写层；Kubernetes 在同一 Pod 中重启失败容器时，也不能依赖旧容器可写层继续存在。卷按自身生命周期保留。',
 '镜像各层还属于分发内容。把凭证写入一层，再在下一层删除，只改变最终文件视图，历史层中的原字节仍可能存在。凭证应通过专门的运行时注入与权限机制交给应用。'),

 p('创建容器时，运行时把进程放进约定的 namespace 和 cgroup。namespace（命名空间）划分进程看见的系统视图：PID namespace 给进程编号与可见进程集合，mount namespace 给挂载视图，network namespace 给网络接口、路由与端口。同一 Pod 内容器通常共享网络视图，因此可以经 localhost 通信；是否共享进程视图由另外的配置决定。',
 'cgroup（控制组）把进程按层级组织起来，对相应资源记账并实施控制。视图与资源是两条配置：进程可以只看见本组网络和文件，却仍与别人争用宿主 CPU；同一 cgroup 的消费还可能受祖先组限制。容器内显示的 cgroup 根也可能只是宿主层级的一部分。')+
 table(['内核接口','记录或约束什么','与执行的关系'],[['/proc/1/ns/pid','目标进程所在 PID namespace 的身份','同一数字 PID 可以出现在不同视图'],['cpu.max','每周期 CPU 时间预算','预算耗尽后可能节流，稍后继续'],['memory.max','组内存硬限制','分配和触页会引发回收，无法满足时可能 OOM'],['pids.max','组内内核任务数量上限','线程也占名额，达到上限可拒绝创建']])+
 p('OOM 是 out of memory，即无法满足内存需要的状态。CPU 节流、内存 OOM 和线程创建失败各由不同机制触发，后面的真实实验分别取证。namespace 和 cgroup 之外，用户权限、capabilities（拆分后的特权能力）与系统调用过滤还限制程序可做的动作；本章实验不测试容器逃逸。'),

 p('把单个容器放进集群后，控制面管理 Pod 声明，节点负责实际启动。Pod 声明列出容器镜像、启动方式、资源与挂载；API Server 接收它，调度器 scheduler 为尚未绑定的 Pod 选择节点，节点代理 kubelet 再协调容器创建。若 Pod 由 Deployment 等工作负载管理，控制器会先按模板创建 Pod 对象。')+
 figures(r[3]).join('')+
 p('图中“选节点”与“启动进程”是相邻的两个边界。kubelet 通过 CRI（容器运行时接口）调用运行时服务；运行时继续准备镜像、文件系统与进程，具体实现可使用符合 OCI（开放容器标准）运行规范的低层工具。CRI 定义组件调用，OCI 规范定义容器配置与生命周期，二者分工不同。',
 '节点准备还包括网络和存储。CNI 是容器网络插件接口，CSI 是存储插件接口；相应实现参与设置网络或提供、挂载卷。绑定节点后发生镜像拉取或卷准备失败，业务进程可能尚未出现，应沿事件和容器状态继续定位。')+r3[0]+
 p('核对同一个 Pod 时保留命名空间、名称和 UID。UID 标识这一次 API 对象，容器实例 ID 标识其中某次容器运行；Pod UID 不变而容器 ID 改变，可能只是容器重启。--previous 读取该容器前一次实例的日志，只有对应历史仍存在时才有内容。工作负载章接着解释谁负责补回丢失的 Pod。'),

 p('停止进程也是运行流程的一部分。PID 1 是一个 PID namespace 中的首个进程身份，Linux 对它的信号处理与子进程回收有特殊规则。容器入口若先启动 shell 再启动业务，运行时停止信号可能先交给 shell；使用 exec 以业务进程替换入口 shell，可以让业务直接处理信号。共享 PID 视图时，应用不一定是该视图中的 PID 1。')+r4[0]+
 p('业务排空是停止接收新工作，并让已接工作完成、明确中止或留下可恢复身份的过程。在 Kubernetes 中，preStop 是停止容器前执行的生命周期钩子，terminationGracePeriodSeconds 是终止宽限预算。若预算 30 秒，preStop 先用 12 秒，应用通常只剩约 18 秒处理停止，而不是获得新的 30 秒。',
 'readiness 是接流量资格检查，它失败后端点和入口会异步更新；旧连接及已经进入的请求仍可继续。程序需要明确何时停止接新请求、何时关闭连接，以及超时工作按什么身份继续核对。宽限期最终可能以强制终止收尾，已提交的数据库或外部操作仍由原回执确认。工作负载章会把入口、节点和业务三份停止证据接起来。')+links(r[4]),

 p('下面用三份独立容器观察 CPU、内存与任务数限制，每份配置为 0.5 CPU、96 MiB 内存和 16 个任务名额。cpu.max 读到 50000 100000，单位是微秒，表示每 100 毫秒周期最多消费 50 毫秒 CPU 时间。两个线程若同时各运行 25 毫秒，就可能共同用完预算；预算没有把它们固定绑定到半个物理核。')+
 figures(r[5]).join('')+
 table(['这次 Linux CI 实际观察','怎样解释'],[['忙循环墙钟约 2.500 秒；usage_usec 增加 1,247,581','约 1.248 CPU 秒对应约 2.5 秒墙钟，与 0.5 CPU 预算相符'],['nr_periods、nr_throttled 均增加 25','采样内 25 个周期都出现节流'],['throttled_usec 增加 1,249,294','是该次组节流计数，不是某个请求的独立等待时长'],['触页分配超过 96 MiB；退出 137、OOMKilled=true','运行时原因与退出状态共同支持本例 OOM 判断'],['15 个等待线程加主线程达到 16；再创建失败','pids.current 达上限，pids.events 的 max 增加 1']])+
 p('CPU 时间是线程实际占用处理器的时间，墙钟时间是从开始到结束经过的时间；两者相除才有本例的消费速率。内存程序实际分配并触碰页面，避免只保留虚拟地址却没有消费相应内存。任务数程序让已建线程保持等待，使名额在继续创建时仍被占用。',
 '137 通常对应进程被 SIGKILL 强制结束，人为终止也能产生它，所以要联合 OOMKilled 和组事件。线程创建失败还可能有其他系统限制。现场诊断沿本例方法，把同一窗口的配置、计数差值与用户请求时序关联起来，再判断哪一种机制影响了工作。'),

 p('同一进程在容器内的 PID 与宿主上的 PID 属于不同观察视角。判断两个容器是否共享 namespace，可以比较 /proc/1/ns/pid、mnt、net 指向的内核对象身份，并同时记录容器身份和存活时间。本实验让两个容器同时运行，本次三个视图的标识分别不同；两者内部都能看到 PID 1，宿主却是在运行不同进程。',
 '早期程序先后运行两个短容器，再比较它们退出前记录的 namespace 编号，遇到了编号复用。内核释放旧对象后可以再使用该编号，因此跨生命周期的数字相等不足以证明共享。修订程序让两个容器同时存活，完成观察后只删除自己的随机命名实例，修订与 CI 记录均保留。',
 '把这个方法带到文件与资源排查：文件写失败时固定实例、实际路径、用户和挂载；CPU 受限时固定 cgroup 与采样窗口。每次只改变一个条件，例如容器可写路径改为卷路径，或调整 CPU 预算，再比较预期变化。这样可以把现象接回一个具体机制。'),

 h('container-native-run','运行 container_limits.py，核对三类内核事实')+
 p('container_limits.py 是实验驱动程序，container_probe.py 是放进容器内执行的探针。驱动程序先解析一次 Python 镜像摘要，再以同一份内容分别创建 CPU、pids 和 OOM 容器；另建两个同时存活的容器比较 namespace。它不是后面 kind 调度实验的工作负载。',
 '已有记录来自公共 Linux CI：Docker 29.4.2、cgroup v2，保存实际镜像摘要、内核版本、计数差值和源码摘要。实验使用 network=none，只对自建容器施加负载，不修改宿主 cgroup 文件。复跑需要可用的本地 Linux Docker 环境，程序拒绝非本地 Unix socket 上下文。macOS 上的 Docker 客户端读到的是其 Linux 容器环境中的内核事实。')+r7[0]+
 p('执行前先按上节预测：CPU 预算与节流计数对应；内存分支联合检查退出码和 OOM 原因；pids 分支核对线程数及事件。具体耗时和计数可随机器变化，程序检查机制条件。下面保留与下载文件一致的完整源码，便于看清负载、等待线程和实例清理。')+
 links(r[7])+fold('container_limits.py 完整源码',r7[1])+fold('container_probe.py 完整源码',r7[2])
 ],'从镜像创建实际进程，沿文件视图、内核隔离、资源预算与停止流程理解容器，再用真实 Linux 记录核对运行事实。');

 const workloads=select('k8s-workloads',['apply 成功，只完成了哪一步','先选工作负载，再写副本数','三副本滚动更新，先算允许范围','三种探针：动作、连续阈值与故障放大','四种失败，四个取证入口','PDB、滚动更新和节点故障分别约束什么','排空与退出：逐条核对完成证据','一份清单，三次单变量练习']);
 const w=workloads.sections.map(s=>s[1]),w2=blocks(w[2]),w3=blocks(w[3]),w6=blocks(w[6]);
 if(w2.length!==1||w3.length!==2||w6.length!==1)throw Error('Workload code layout changed');
 replace(workloads,[
 p('容器运行时负责启动实例，Kubernetes 工作负载负责持续维护一组 Pod。Pod 把一个或多个容器共同放在一台节点上，带有共享网络和可挂载的卷；工作负载用模板描述这些 Pod 应该怎样运行，再由控制器维持副本或完成条件。控制器是反复读取期望与实际状态、执行相应调整的程序。',
 '以三副本日报服务为声明案例：Deployment 保存“使用这份 Pod 模板、需要三个副本”的期望；ReplicaSet 按选择器和归属关系管理对应 Pod 数量；调度器为新 Pod 选节点；kubelet 启动容器。一个 Pod 丢失后，ReplicaSet 创建新的 Pod 对象，拥有新的 UID，而不是把原对象搬到另一个节点继续使用。')+
 figures(w[0]).join('')+
 p('正常提交时，API Server 先做身份认证、权限检查、准入和对象校验，再保存声明。apply 成功说明这一步已完成。接下来的控制循环可以异步重试：创建子对象、调度、启动和就绪分别更新自己的事实。status.observedGeneration 表示控制器已观察到哪一代期望配置；实际 Pod、就绪与业务响应还需继续核对。',
 '业务请求经过另一条路径：Service 提供稳定访问入口，按标签选择一组 Pod；实际后端地址和就绪条件进入 EndpointSlice，再由转发组件使用。如果用户仍收到 503，先沿 Deployment→ReplicaSet→Pod 追到同一代模板，再核对绑定、容器启动、就绪及请求去向。对象数量、可用副本和用户响应是不同观察点。'),

 p('选择工作负载，是先选择“系统要持续维护什么”，再填写数量。无状态在线服务通常允许相同模板的副本互相替换；数据库成员或完成型任务则需要不同的身份与完成协议。')+
 table(['工作负载','控制器维护的正常目标','应用接着承担什么'],[['Deployment','可替换的 Pod 副本，并按模板进行版本更新','持久数据、会话与外部效果按应用协议管理'],['StatefulSet','带稳定序号和相应网络、卷身份的成员','数据库复制、主身份仲裁与备份'],['DaemonSet','在符合条件的节点上运行节点级组件','组件自身健康与节点加入、移除后的业务行为'],['Job / CronJob','完成规定工作；按时间计划创建 Job','重复执行、并发与业务回执']])+
 p('例如三份无状态日报 API 可以使用 Deployment，状态保存在独立数据库；每台节点上的日志代理适合 DaemonSet；有限的数据导出适合 Job。StatefulSet 的稳定成员身份帮助应用找到原卷，却不替数据库选主。CronJob 的计划和 Job 的重试也需要配合稳定业务身份，才能区分重做同一任务与新建另一笔业务。'),

 p('滚动更新 rollout 是用新 Pod 模板逐步替换旧副本。Deployment 为新模板建立或使用对应 ReplicaSet，逐步增加新副本、减少旧副本。只改 replicas 调整数量，修改 template 中的镜像或环境等字段才触发这类模板发布；回滚同样围绕模板历史进行。',
 '三副本题设中，maxSurge=25% 向上取整为 1，允许在期望数量之外增加一个副本；maxUnavailable=25% 向下取整为 0，更新时要求保留至少三个可用副本。清单还配置 minReadySeconds=5：一个 Pod 持续处于就绪条件 Ready 满五秒后，才计入 Deployment 的可用数量 Available。两者因此不是同一时刻。')+w2[0]+
 p('假设旧三个副本都可用，控制器先尝试增加一个新 Pod。新 Pod 运行、通过就绪检查并满足五秒后，才有条件减少一个旧副本。若节点容量只容纳三份，新 Pod 持续 Pending，零 unavailable 又限制减少旧的可用副本，发布就会等待；若新 Pod 启动后始终不 Ready，问题则发生在后一个阶段。',
 'surge 约束不能直接当作所有进程的瞬时资源硬上限。旧 Pod 进入终止后还可能在宽限期中占用资源，需同时预算启动与排空。这里三副本来自 reports.yaml 教学清单；已有 service_lab.py 原生发布记录另用两个副本，后面只借它验证模板变化确实产生新 Pod 和新版本响应，不把它当作本题四份容量的实测。'),

 anchor('pod-probe-thresholds')+h('subsection-4-4ww5rs','先分清运行、启动完成与接流量资格')+
 p('探针是 kubelet 按配置执行的检查。应用提供的 HTTP 端点只是其中一种检查方式；程序必须让端点返回值表达预定条件。startup 判断初始化是否完成，readiness 判断能否接新流量，liveness 判断是否需要终止并重启这个容器。')+
 table(['探针','连续失败达到阈值后','正常恢复路径'],[['startup','终止该容器，按适用重启策略处理；成功前暂停所配 readiness/liveness','初始化成功后转入后续健康检查'],['readiness','将相应就绪条件置为失败，继续探测','恢复足够连续成功后重新就绪；不因该失败重启'],['liveness','终止该容器，按适用 restartPolicy 重启','新容器完成启动与就绪检查']])+
 p('用独立的双副本原生实验对照：service_lab.py 在一个 Pod 的容器中创建 not-ready 标记，使 /ready=503、/live=200；该 Pod UID 与重启次数不变，稳定的新连接样本只收到另一就绪 Pod。移除标记后同一 UID 重新接流量。再单独使 /live=503、/ready=200，容器重启一次，Pod UID 保持，进程实例 ID 改变。这分别对应“调整接流量资格”和“创建新容器实例”。',
 '存活检查适合重启本进程有机会恢复的局部故障，例如无法继续工作的死锁。把共享数据库抖动直接作为所有前端的存活失败，会让依赖故障叠加集中重启。就绪检查可以按业务依赖判断承载能力，但检查本身也要轻量，避免高频探测反过来拖慢依赖。')+
 h('subsection-4-15h5yam','按实际探测时刻理解连续阈值')+
 p('failureThreshold 是连续失败次数，成功会打断连续失败；successThreshold 是失败后恢复所需的连续成功次数，在 startup 与 liveness 上必须为 1，readiness 可以更大。periodSeconds 配置探测间隔，timeoutSeconds 限制单次等待。下面先固定一组观测，再按时间线找第三次失败。')+w3[0]+
 p('探测在 0、10、20 秒开始，各等一秒超时，所以第三次失败在 21 秒被观察到。3×10＝30 秒只是忽略相位和单次耗时的粗估，终止、重启与重新就绪还在后面。未就绪容器的 readiness 也可能更频繁执行，以尽快恢复。')+w3[1]+
 p('这段 YAML 是另一份 API 字段示例，需要自己的镜像和三个端点，并未运行这个配置；它与 reports.yaml 的端点及阈值不同。前述双副本原生实验验证了 readiness/liveness 的动作，没有执行本节 startup 示例，也没有把连续阈值当成固定业务恢复时限。'),

 p('把故障放回对象链，先判断最早没有完成的步骤。Pod phase 是粗粒度生命周期，容器 Waiting 的 reason 是等待原因，Ready 是就绪条件；它们来自不同字段。CrashLoopBackOff 和 ImagePullBackOff 常出现在容器状态或命令输出中，分别描述反复退出后的重试退避与镜像拉取退避。')+
 table(['现场','先读取什么','接着查哪段机制'],[['Pod 未绑定，PodScheduled=False','nodeName、调度条件、Events、requests 与约束','可行节点、污点、亲和或卷拓扑'],['容器等待 ImagePullBackOff','镜像引用、容器状态、凭据与节点网络','下载身份、内容与重试原因'],['容器反复退出','lastState、exitCode、reason、previous logs','入口异常、OOM、探针终止与应用错误'],['Pod Running 但无流量','Ready、EndpointSlice、Service 端口及业务请求','接流量资格与实际转发路径']])+
 p('退避表示系统暂缓下一次尝试，根因仍在之前的失败中。退出 137 要联合 OOMKilled、组内存事件和终止事件判断，不能只由一个数字推定 OOM。一次探针成功也可能落在抖动间隙，记录要对齐容器重启、端点条件和请求时间。下一章再把“无可行节点”拆成资源与放置规则。'),

 p('PodDisruptionBudget（PDB）为一组由标签选中的 Pod 规定可用数量预算。节点维护常用的 drain 通过 Eviction API 请求自愿驱逐，PDB 用来判断当前是否允许这次中断。reports.yaml 设三副本、minAvailable=2：三个都健康时通常可驱逐一个，若已有一个不健康，就不能再按同一预算驱逐另一个健康副本。',
 'Deployment 发布使用自己的 maxUnavailable 和 maxSurge，并不由 PDB 直接控制；发布造成的不可用仍会占用健康数量，从而影响同时进行的维护驱逐。节点突然故障属于非自愿中断，PDB 无法阻止它；直接删除 Pod 也不等于通过 Eviction API 做预算检查。',
 '预算需要和放置、剩余容量一起设计。三个副本若都在同一故障域，一个节点事件仍可能同时影响它们；预算不允许任何中断时，维护也需要明确的恢复或放宽流程。调度器能否为替代 Pod 找到位置，是下一章的放置问题。'),

 anchor('pod-stop-evidence')+anchor('subsection-7-aclmrr')+
 p('终止一个 Pod 会同时推进两条路径：API 记录删除时间和宽限预算后，kubelet 处理本地容器停止；控制面更新相应 EndpointSlice。EndpointSlice 是记录服务后端地址与条件的 API 对象，代理据此调整请求转发。两条路径异步传播，不能假定所有入口先摘流、业务才收到信号。')+
 figures(w[6]).join('')+
 p('终止端点标记 terminating=true，通常 ready=false，退出常规新流量选择；serving 还可表示终止期间的实际服务能力。publishNotReadyAddresses 等特殊配置另有行为。既有 TCP 连接与已进入的请求仍可能继续，应用的排空协议应主动处理它们。',
 'preStop 先于容器停止信号执行，并消耗同一份 terminationGracePeriodSeconds。图中从 kubelet 处理起算 30 秒，钩子花 5 秒，收到默认 TERM 后再排空 20 秒，合计 25 秒退出。停止信号还可能受镜像 STOPSIGNAL 或受支持配置影响。钩子超期时的小幅延长用于收尾，不应成为日常业务预算。')+w6[0]+
 p('上面的观察分别读取 Pod、后端条件和带时间戳的应用日志，再对照请求侧的新连接、旧连接及业务回执。readiness 失败只改变接流量资格，不停止进程，也不撤销原连接上的写入。独立 service_lab.py 记录的是受控新连接与版本响应，未验证此处长连接排空或 preStop 窗口。',
 '强制删除 API 对象不等待节点确认原进程已终止。节点失联时，对象消失也可能留下仍执行的旧写者；替代有状态实例前，要核对写入资格与卷等资源。无论正常退出还是强制终止，已经提交的业务效果仍要沿原身份读取回执。'),

 p('本章 reports.yaml 将三副本 Deployment、Service、HPA 与 PDB 写在同一清单中，先以离线结构检查确认字段；它是面向已有测试集群的手册，需要可用镜像、metrics-server 与足够资源。本轮没有将这份三副本配置改写成已运行的记录。',
 '按三次单变量练习分别修改镜像引用、requests 或 Service selector（后端标签选择条件）。先预测最早失败点，再保存“声明→事件→容器状态→端点→用户响应”。错误镜像应追下载与启动，不可满足请求应追调度条件，错误 selector 应追后端选择；直接 curl 一个 Pod IP 成功，只验证该地址上的应用。',
 '配套 verify.py 可在本机核对本地 HTTP 端点、SIGTERM 退出和独立事务、算式；它不创建 Kubernetes。另一个原生 service_lab.py 使用自己的双副本、持续 ClusterIP 客户端和 API 快照，已有 readiness、liveness、v1→v2→v1 记录。两份程序分别取证：前者验证清单外的本地机制，后者验证实际集群链，二者均不替代本题三副本与容量条件的目标验证。')+links(w[7])
 ],'沿 Deployment、ReplicaSet 与 Pod 的正常补副本过程，解释滚动更新、探针、维护预算与终止，再按对象和请求核对结果。');

 workloads.sections[5][1]+=
 h('native-pdb-eviction-rollout','同一组三副本，驱逐、直接删除与发布各走哪条路')+
 p('隔离集群里只有一组 <code>app=reports</code> Pod。Deployment 维持三个副本，PDB 用同一个标签选中它们。用 <code>currentHealthy</code> 读取 PDB 当前统计的健康数，用 <code>disruptionsAllowed</code> 读取还可申请的驱逐数。等控制器都观察到当前配置、上一轮驱逐结清后，三个就绪减去最少两个，剩一个名额。')+
 trainingFigure('kubernetes-pdb-rollout','从同一组 reports Pod 读四个时刻。驱逐记录看 HTTP 状态和 Pod UID，发布记录看版本与就绪条件。')+
 table(['动作','用什么证据判断'],[
  ['最少保留 2 个，向 Pod 的 <code>/eviction</code> 发 POST','本次驱逐返回 HTTP 201。旧 UID 消失，新 UID 就绪后健康数回到 3。'],
  ['改为最少保留 3 个，尝试驱逐一个健康 Pod','<code>disruptionsAllowed=0</code>，HTTP 429 的原因详情是 <code>DisruptionBudget</code>。同一 UID 仍存在。'],
  ['对刚被拒绝的 Pod 发直接 DELETE','带 UID 条件的 DELETE 返回 HTTP 200，副本控制器随后补回第三个 Pod。'],
  ['以 <code>maxSurge=0</code>、<code>maxUnavailable=1</code> 发布永远未就绪的 v2','一份旧副本已被替换。两个 v1 就绪，一个 v2 正在运行但未就绪。此时维护驱逐仍返回 429，撤销发布后回到三个就绪 v1。']])+
 p('记录中的两个 429 都有预算原因。实际排障还要读错误详情与 PDB 的 <code>observedGeneration</code>，因为 429 也可能来自限流，控制器可能尚未处理新配置。发布停在两个就绪，是 Deployment 的不可用额度已经用满。若要让发布全程保留三个就绪，可改用 <code>maxUnavailable=0</code>、<code>maxSurge=1</code>，并预留新 Pod 所需资源。')+
 p('在 Linux 本机 Docker 上解压后运行 <code>python3 -B pdb_rollout.py --output replay.json</code>。先对照 <code>blocked_eviction</code> 和 <code>direct_delete</code> 的请求路径与 UID，再按 <code>before_rollout</code>、<code>stalled_rollout</code>、<code>after_undo</code> 逐份核对版本、健康数和预算。这里运行的是单节点 kind。多节点排空、故障域和实际服务流量要到对应环境验证。')+
 '<p class="practice-links"><a href="labs/kubernetes-pdb-rollout.zip" download>下载实验包 ↓</a> · <a href="labs/kubernetes-pdb-rollout/pdb_rollout.py">查看完整源码</a> · <a href="labs/kubernetes-pdb-rollout/README.md">分步复跑</a> · <a href="labs/kubernetes-pdb-rollout/validation.json">查看真实 API 记录</a> · <a href="https://kubernetes.io/docs/concepts/scheduling-eviction/api-eviction/">Eviction API 文档 ↗</a></p>';

 const scheduling=select('scheduling-resources',['一个Pod从提交到运行，要过哪些关','request、limit和用量是三笔账','配额拒绝后，为什么查不到那个Pod','逐节点检查资源，再求可行集合','标签、亲和、污点与抢占分别改变哪道条件','把调度等待放回端到端完成时间','用对象、条件和事件判断卡在哪里','在隔离kind集群重放完整链条']);
 const s=scheduling.sections.map(x=>x[1]),s2=blocks(s[2]),s6=blocks(s[6]),s7=blocks(s[7]);
 if(s2.length!==1||s6.length!==1||s7.length!==2)throw Error('Scheduling code layout changed');
 replace(scheduling,[
 p('工作负载控制器决定需要多少 Pod，调度器决定每个新 Pod 放在哪里。节点是执行容器的机器或节点环境；一个普通 Pod 的容器整体绑定到同一个节点。调度器先过滤不满足条件的节点，得到可行集合，再按评分与策略选择一个，提交绑定关系；目标 kubelet 随后准备并启动容器。')+
 figures(s[0]).join('')+
 p('调度前还有 API 准入，即接收对象时的规则处理。Kubernetes namespace（命名空间）在 API 层组织对象及相应策略，容器章的 namespace 则在内核层划分进程视图。ResourceQuota 控制一个 Kubernetes 命名空间的资源总预算；它拒绝直接创建的 Pod 时，这个 Pod 尚未进入调度队列。通过准入、选中节点和启动就绪因此是三个不同阶段。',
 '绑定通常使 Pod 固定在该节点，调度器不会因另一节点后来更空闲，就把运行中的进程直接搬过去。丢失 Pod 后可由控制器创建替代对象，再安排新的放置。AI 作业平台还可能先用队列判断整组资源许可，再创建 Pod；平台排队、API 拒绝与已有 Pod 不可调度应分别记录。'),

 p('request 是供调度与资源分配使用的请求量，limit 是运行时使用的限制，实际用量是采样内观察到的消费。CPU 的 1000m 表示 1 CPU，250m＝0.25 CPU；Mi、Gi 是二进制内存单位。节点 Allocatable 是可分给 Pod 的资源口径，不是机器标称总量，也不是监控中这一秒空闲多少。',
 '调度资源检查按节点上已分配的请求记账。一个 Pod 请求 250m，即使实际几乎不忙，这份请求仍占用调度账；CPU 运行限制可以体现为带宽节流，内存限制则涉及回收与 OOM。容器章的 0.5 CPU、96 MiB 负载解释运行账，本章的声明解释配额与节点账。')+
 table(['账本','回答什么','本章例子'],[['命名空间配额','还能接受多少资源声明','requests.cpu 上限 300m'],['节点请求','一个 Pod 能放进哪台节点','两个工作节点各报告 4 CPU Allocatable'],['运行消费','放下后实际使用多少、是否受限','50m 小请求；实验的 pause 容器只保持存活'],['用户时间','任务从接受到完成用了多久','排队、启动、执行与结果提交']])+
 p('还需按容器生命周期计算 Pod 的有效请求。普通 init container 依次完成初始化，常规容器随后并行运行；例如常规容器 100m＋200m，初始化最大 500m，则两阶段最大为 500m，若还有 20m Pod overhead，总需求为 520m。这是手算示例。sidecar 是与主应用共同运行的辅助容器，其资源会与后续阶段重叠；可重启初始化容器及 Pod 级资源配置也有相应规则。真实清单按版本核算，本章原生实验只有一个常规容器，避免混入这些项。'),

 p('在独立的 quota-lab 命名空间中，requests.cpu 硬额度为 300m。第一个 Pod 请求 250m，创建后已用预算 250m；再创建一个 100m Pod，总请求将达 350m，超过预算 50m。API 拒绝第二个创建请求，程序随后按名称查询确认第二个对象不存在。')+s2[0]+
 p('上面 ResourceQuota 是本次实验所用的预算。它控制声明，不以第一个 pause 容器此刻 CPU 很低为理由退回 250m。对象删除、终止与配额状态更新各有过程，复查时读取当前资源对象和服务端结果，而不是由客户端提交次数自行推算。',
 '若改由 Deployment 创建副本，父 Deployment 可以先被接受，再由 ReplicaSet 创建子 Pod 时遇到配额拒绝。应沿工作负载→子对象→事件查清失败所在层。这正是上章“apply 成功”与“副本已经存在”分开的原因；尚不存在的 Pod 不会有调度条件。'),

 p('通过准入后，把一个 Pod 的全部要求逐节点求交集。A 剩 4 CPU/4 Gi，B 剩 2 CPU/8 Gi，待放 Pod 要 3 CPU/6 Gi：A 的内存不足，B 的 CPU 不足，可行集合为空。两节点的总资源再多，也不能把 CPU 与内存分开拼给一个普通 Pod。')+
 figures(s[3]).join('')+
 p('原生 kind 记录另用两个各报告 4 CPU Allocatable 的工作节点。程序取最大 CPU 再加 1，生成 5 CPU 请求；too-large Pod 的 PodScheduled=False、reason=Unschedulable，nodeName 为空。另建 fits Pod，只请求 50m，可进入运行状态。两个对象有不同 UID，不是原地把同一个 Pod 从 5 CPU 改成 50m。',
 '资源过滤通过后，还需满足标签、污点、亲和与卷等约束；多个节点都可行时，评分才用于选择。若集合为空，调度器等待状态或资源变化后再尝试。单 Pod 要四张 GPU、两节点各只有两张可用，也属于同类形状问题；拆成两个 Pod 则改变了应用成员与通信协议，需另行设计。'),

 p('标签是对象上的键值标记。nodeSelector 要求节点标签匹配；节点亲和性表达节点条件，Pod 亲和与反亲和分别表达与其他 Pod 接近或分开的关系。required 是硬条件，preferred 参与偏好评分。拓扑域按节点标签分组，本例用 kubernetes.io/hostname 区分主机域。',
 '污点是节点上的排斥规则，容忍是 Pod 对特定污点的匹配许可。NoSchedule 阻止不匹配的新放置；NoExecute 还可影响已经运行的 Pod，具体驱逐取决于容忍配置。添加容忍只是消除这一项阻挡，还要继续通过资源、亲和及其他过滤。')+
 figures(s[4]).join('')+
 p('原生程序给两个工作节点加上可选标签，并给 B 添加 dedicated=training:NoSchedule。spread-0 无容忍而落在 A；spread-1 起初在 A 被硬反亲和挡住、在 B 被污点挡住。给同一个 spread-1 增加匹配容忍后，它在 B 就绪，UID 保持。spread-2 虽有容忍，两个主机域已各有一个 app=spread，仍因硬反亲和等待。',
 '优先级影响待调度次序与潜在抢占；抢占是尝试移走较低优先级 Pod，使某节点变得可行。它可以释放相应已占资源，却不能把节点总容量扩大，也不能增加主机域或忽略污点等硬条件。调度抢占对 PDB 的遵守是尽力而为，与维护驱逐通过 Eviction API 检查预算的路径不同。'),

 p('放置策略要服务于完成目标。设方案甲排队 4 分钟、执行 18 分钟，合计 22 分钟；方案乙排队 15 分钟、执行 10 分钟，合计 25 分钟。忽略其他阶段时，计算更快的乙仍让用户更晚拿到结果。记录还要覆盖准入、绑定、镜像与卷准备、应用启动和结果提交。',
 '提高节点利用率、缩短排队、照顾高优先级和改善通信拓扑，可能要求不同选择。把小 Pod 填进空隙会提高当下利用率，也可能留下不适合大 Pod 的碎片。先固定资源形状和目标，再比较等待与实际完成，而不是只比较 GPU 计算时间。',
 '节点自动扩容是另一条供给流程。系统先判断某种节点模板能否满足等待 Pod，再申请和启动节点、等待注册与准备；还受配额、库存、设备与数据条件影响。Pending 不会自动生成任意所需机器。将这些阶段分别记时，才能区分调度过滤、节点供给和应用执行的问题。')+links(s[5]),

 p('诊断顺序沿创建、绑定、启动、服务四个边界展开。条件和对象身份给出当前事实，事件补充失败原因；先找到最早没有完成的一步，再选择下一条观察命令。')+
 table(['问题','直接证据','对应检查'],[['对象有没有创建','API 返回、按名查询、父控制器事件','配额、校验与子对象创建'],['是否已绑定节点','spec.nodeName、PodScheduled 条件','请求量、标签、污点、亲和和拓扑'],['容器是否启动','容器状态、Events 和日志','镜像、网络、卷与入口'],['能否提供服务','Ready、端点与业务响应','探针、依赖和真实请求']])+s6[0]+
 p('事件可能聚合、延迟或过期，某一条英文消息还可能汇总多个节点的不同失败。本实验用“对象是否存在、条件值、nodeName 和 UID”核对机制，事件用于解释，避免把一句特定版本消息当作唯一判据。',
 '自检：配额 12 CPU、已承诺 10 CPU，再请求 3 CPU，首先在准入预算处失败。把配额提高到 16 后，A 剩 4 CPU/4 Gi、B 剩 2 CPU/8 Gi，而 Pod 要 3 CPU/6 Gi，仍无可行节点。前一步解决总预算，后一步仍需同节点资源交集；只提高优先级不会补出缺少的内存。'),

 h('scheduler-native-run','按三组独立 Pod 核对准入、过滤与绑定')+
 p('schedule_lab.py 创建自己的随机命名 kind 集群：一个控制面、两个工作节点。kind 的节点是同一 Linux 宿主上的容器，API Server 与调度器真实执行，但不是两台独立物理机。已有公共 Linux CI 使用 kind v0.33.0 与固定摘要的 Kubernetes v1.35.8 节点镜像；容器章的 Docker 限制负载在另一项实验中运行。',
 '三组对象分别放在 quota-lab、shape-lab 和 spread-lab 命名空间，避免一组配额误当另一组状态。程序的每条 kubectl 都指定临时 kubeconfig 与本次 context，结束只删除自己创建的集群。下面是目标环境复跑入口，本轮正文审阅只离线核对既有记录，没有新建集群。')+s7[0]+
 table(['实验分支','核对结果'],[['配额：250m 后再加 100m，硬额度 300m','第二对象不存在，API 报配额拒绝'],['形状：请求 5 CPU 与另建 50m 小 Pod','前者不可调度、无绑定，后者运行'],['约束：反亲和、污点，再加容忍','同一第二 Pod 从等待到 B 就绪'],['继续添加第三 Pod','两主机域均被同类 Pod 占据，仍等待']])+
 p('这些条件解释真实调度行为，不把两个节点报告的 Allocatable 相加当宿主物理供给，也不提供跨主机通信、云 CNI/CSI、生产伸缩或性能结论。源码保留对象创建、条件轮询、UID 比较和清理顺序，可对照原始执行记录逐项复查。')+links(s[7])+fold('schedule_lab.py 完整源码',s7[1])
 ],'从副本创建接到 Pod 放置，按配额、节点资源、过滤与评分解释调度，再用真实 kind 对象与条件核对每一道边界。');
 scheduling.sections[2][1]+=h('quota-admission-forbidden','读到 Forbidden，先找拒绝的规则')+
 p('打开 kind 实验记录，在 <code>quota_rejection.error</code> 找到 <code>(Forbidden)</code>，后面还有 <code>exceeded quota: cpu-budget</code>，给出了配额名称。记录的 <code>quota</code> 显示已用 250m、上限 300m，本次再请求 100m，超出 50m。随后按名称查询，<code>object_exists</code> 为 <code>false</code>。第二个 Pod 尚未创建，先查命名空间的配额。')+
 p('若消息写的是 <code>cannot create resource</code>，先按响应中的主体、动作和命名空间检查授权。<a href="/article/iam-security/#native-kubernetes-admission">对照 C7.1 的授权与策略拒绝 →</a>')+
 '<p class="practice-links"><a href="/labs/runtime-scheduling/validation.json">查看配额与对象的原始记录 →</a> · <a href="/article/scheduling-resources/#scheduler-native-run">运行同一份 kind 实验 →</a></p>';
 scheduling.sections[7][1]+=p('批作业还有一种常见的「没有 Pod」。本节的 ResourceQuota 会直接拒绝超额的 Pod 创建；另一项实验中，Kueue 接收并暂停一个 Job，等队列额度后才让 Job 创建 Pod。它获准后，两个 Pod 又因节点标签不匹配而等待。沿对象确认卡点，才能知道该改配额还是节点条件。<a href="/article/gpu-scheduling/#native-kueue-admission">走完批作业从排队到执行的原生实验 →</a>');
 scheduling.updated='2026.11.12';
})();
