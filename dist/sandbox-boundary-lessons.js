/* Launch hygiene, OS resource limits and security isolation are different control layers. */
const sandboxLaunch=infraReadableHTML(
 '<div class="mechanism-core" id="sandbox-authority-boundary">'+knowledgeSubhead('子进程继承哪些能力，先于脚本写了什么')+
 para('启动一个新进程会建立新的地址空间，但不会自动产生新的租户边界。进程身份、环境变量、当前目录、可继承文件描述符和网络能力，决定它能触及什么。一个已经打开的文件描述符（FD）也代表访问能力：即使脚本没有文件名，只要继承了FD，仍可能直接读取。',
 'Python默认将新FD设为不可继承，Popen默认close_fds=True。实验刻意将一个假文件FD标为可继承、设置close_fds=False，再传入合成环境项，复现“启动者把能力带了进去”；另一条路径关闭非必需FD、只传少量环境项，两者都不再可见。不能将这个刻意放开的反例描述为Python默认不安全。')+
 figure('v26-launch-boundary','实际子进程对照：减少继承能关闭两条通道，但同UID按路径读取假文件仍然成功。它直接说明启动卫生没有隔离文件系统。')+
 para('最小启动仍在同一用户权限下，实验按路径重新打开canary照样成功。这不是启动参数失效，而是它们只解决自己覆盖的通道。真正的执行边界还需要受限用户、挂载视图、内核接口、网络和资源管理。受控工作目录只是默认相对路径的起点，chdir并不会禁止访问绝对路径。',
 '控制平面应自己选择可执行入口、环境和挂载，不能允许不可信文档把任意宿主目录、运行时套接字或长期凭据加入参数。工具授权在可信服务端限制业务动作，沙箱再限制异常代码能接触的能力；两者配合，不能指望模型主动遵守作为隔离机制。')+'</div>');

const sandboxBudgets=infraReadableHTML(
 knowledgeSubhead('资源限制的单位和覆盖对象，比一个“超时”参数更重要')+
 table(['控制','限制什么','不能据此推断什么'],[
 ['RLIMIT_CPU','单进程累计CPU秒数','不能限定等网络的墙钟时长，也不是周期带宽'],
 ['cgroup cpu.max','组在每周期可消费的CPU预算','不能当单线程固定速度或总任务截止时间'],
 ['RLIMIT_FSIZE','单个可创建文件的大小','多个小文件仍可能用掉大量磁盘'],
 ['RLIMIT_NOFILE','单进程打开FD数量','不等于进程树数量或总文件数'],
 ['cgroup memory.max / pids.max','组内存硬限/内核任务数量约束','不等于每个进程各获同一份预算'],
 ['墙钟截止与清理宽限','从约定起点到停止/回收的总时间','不能证明远端效果被撤销']])+
 para('Linux cgroup v2按层次组织进程与线程。公平类调度下cpu.max的“50000 100000”表示每100000微秒周期最多用50000微秒CPU时间；两个同时运行线程消耗的是这份共同预算，不各得0.5核。父级限制还可能更紧。memory.max触发回收与必要的组内OOM处理，个别情形可短暂超出；memory.high主要是回收压力与节流，不等于同一条硬杀进程线。pids控制器按内核任务计数，线程也可能计入。',
 'POSIX本地实验分别验证单文件4096B后EFBIG、FD上限64后EMFILE、CPU累计上限触发终止，以及低CPU睡眠任务的墙钟回收。它不设置宿主限制，也不验证Linux cgroup。将单进程rlimit当成不可信进程树的全部预算，子进程分摊、总磁盘或网络等待就可能漏出。')+
 figure('v26-process-budgets','真实POSIX子进程CPU与墙钟观测。两种不同工作展示两种限制，不是性能优劣比较；墙钟包含启动与回收，等待任务的250ms预算从就绪后开始。')+
 para('容量接纳还要计启动峰值和清理中的实例。原容量题最多20份是稳定预留账；如果旧实例尚未回收就立即把额度给新实例，现场可能出现21份甚至更多。将待清资源独立计数，只有达到约定的回收证据才归还对应额度；远端任务和可继续使用的凭据另有退出条件。'));

const sandboxPaths=infraReadableHTML(
 knowledgeSubhead('路径字符串校验与打开的真实对象之间，可能被换一次')+
 para('路径检查发生在t1，真正打开发生在t2，中间对象可能被替换。这类检查与使用间隙称为TOCTOU。实验先确认/work/report.txt的字符串前缀合规，再将该叶子替换成指向夹具外文件的symlink，随后普通open读到了fixture-B。前缀检查即使写得更仔细，也没有将t1的判断与t2打开的对象绑定。',
 '本例把问题限制为一个固定文件名：由可信侧先打开允许目录，按该目录FD相对打开report.txt，同时使用O_NOFOLLOW拒绝叶子symlink。这样普通文件仍可读，替换成symlink的这次输入被拒。该条件只覆盖固定单级叶子，不处理任意多级路径、硬链接、不可信挂载或错误目录权限，不应包装成通用安全路径函数。',
 '生产文件边界应先由独立挂载、只读输入、受限用户和每任务可写区缩小可达集合，再选择适合目标系统的安全解析方式。产物也是来宾输入：验证真实格式、大小、像素/对象数量、所属任务与最终版本；复杂解析器自己也要限资源。HTML/SVG等活动内容需要明确隔离策略，不能把来宾文件原样搬到与控制面同源的公共目录。'));

const sandboxLinux=infraReadableHTML(
 knowledgeSubhead('在Linux运行时落实边界：字段只负责各自那一层')+
 para('普通Linux容器通常共享宿主内核：namespace改变可见视图，cgroup约束组资源，用户与权限、能力集、seccomp等缩小可执行接口。独立用户态内核或微型虚拟机改变来宾到宿主的接口面，但仍需要正确配置、更新和验证。进程限制实验不能证明任一容器或虚拟机的安全水平。')+
 code('Pod字段片段 · 省略镜像、挂载和网络，不能独立部署','YAML',
 'spec:\n  automountServiceAccountToken: false\n  securityContext:\n    runAsNonRoot: true\n    runAsUser: 10001\n    runAsGroup: 10001\n    seccompProfile:\n      type: RuntimeDefault\n  containers:\n    - name: runner\n      securityContext:\n        allowPrivilegeEscalation: false\n        capabilities:\n          drop: ["ALL"]\n        readOnlyRootFilesystem: true')+
 para('Restricted Pod安全标准要求的非root、禁止提权、seccomp和能力集等有具体版本与OS条件；readOnlyRootFilesystem是这里另外加的收紧项，不能声称它由Restricted自动要求。只读根文件系统也不意味着所有挂载只读：输入、临时区和输出卷的权限仍需分别设置。镜像必须能以指定UID运行，并提供必要的受限可写路径。',
 '若采用gVisor等运行时，需要平台在目标节点配置相应handler和RuntimeClass，并验证实际Pod使用了它；写一个runtimeClassName不会安装运行时。网络默认拒绝、受控出口和DNS策略也需要数据面执行，seccomp或非root不能替代资源级业务授权。入口能否访问元数据服务、控制面端点或其他租户，必须在实际网络与身份环境测试。')+
 table(['层','典型证据','不足的替代物'],[
 ['身份/权限','实际用户、能力、受限服务身份与授权拒绝','只看namespace名字'],
 ['文件/挂载','目标容器的真实挂载与跨任务读取反例','只看工作目录字符串'],
 ['内核/运行时','实际RuntimeClass、运行时与系统调用策略','只看对象叫“sandbox”'],
 ['资源/进程树','组统计、限制命中与回收后残留','主进程退出码'],
 ['网络/凭据','真实目的地与资源访问结果、撤销后验证','策略对象已保存']]))
;

const sandboxStop=infraReadableHTML(
 knowledgeSubhead('停止信号、进程退出、资源回收与效果撤销分别确认')+
 para('本地实验为自己启动的子进程建立独立进程组。等待任务就绪后给250ms运行预算，TERM后再给200ms宽限；本例故意忽略TERM，最终KILL并wait确认直接子进程回收。这验证自己的监督程序按期限收回了指定夹具，不能证明任意不可信子进程树都被约束：来宾可能改变会话/进程组，还需要真实运行时的进程树控制。',
 'KILL也不会撤销已经发到外部服务的请求。取消任务应先停止新授权与新调用，再按协议处理在途效果、受管进程、挂载、临时卷、凭据和额度。清理记录使用不可混淆的资源身份与代际，避免旧清理器按复用名称删掉新实例。交付产物进入独立受控位置后，才能释放生成它的临时工作区。')+
 linkTo('agent-recovery','复习提交后响应丢失与结果未知')+
 linkTo('config-secrets','区分凭据撤销与既有会话退出'));

const sandboxActualPractice=infraReadableHTML(
 knowledgeSubhead('实战一：真实资源命中与墙钟回收')+lpsLab('subprocess_limits.py')+
 knowledgeCheck('4096B单文件限制足以保证临时盘最多4096B吗？','不能。程序可创建多个小文件，元数据和其他路径也有开销；应按真实卷/文件系统和任务边界设置总预算并验证。这个实验只证明单文件限制命中。')+
 knowledgeSubhead('实战二：继承能力、同用户路径与叶子symlink')+lpsLab('descriptors_and_paths.py')+
 knowledgeCheck('关掉继承FD、清空环境，为什么仍可读canary？','子进程身份与文件可达权限没有改变。它可以按路径重新打开同用户可读的文件；启动卫生只关闭继承通道，还要落实实际身份、挂载和内核边界。')+
 para('将这些条件带到自己的Linux隔离环境，分别验证获准输入可读、其他租户不可读、出口受限、资源限制、超时后的进程树与卷回收、撤权后的新增请求、产物导出。每项保存实际环境和版本。没有执行目标运行时反例之前，保持“本地机制已验证、目标隔离待验”的结论。'));

{
 const a=articles.find(a=>a.id==='agent-sandbox'),old=a.sections.slice();
 a.sections=[old[0],old[1],['启动能力：环境、文件描述符与用户权限',sandboxLaunch],['资源预算：容量、CPU、内存与进程树',old[2][1]+sandboxBudgets],['文件与产物：挂载、对象解析与检查间隙',old[3][1]+sandboxPaths],old[4],['运行时配置：Linux控制与Pod安全字段',sandboxLinux],['生命周期：停止、回收与效果',old[5][1]+sandboxStop],old[7],['真实本地实战：限制、继承与路径反例',sandboxActualPractice],old[6],old[8]];
 a.refs=nitRefs([...a.refs,'v26Rlimit','v26Cgroup','v26PSS']);a.minutes=70;a.updated='2026.11.05';
 a.objectives=['按身份、文件、内核、资源、网络与生命周期识别实际边界','区分启动卫生、进程rlimit、组资源与安全隔离','复现本地限制及权限反例，并给实际运行时设计验收'];
}
{
 const d=infraDomain('agent'),p=d.points.find(p=>p.id==='ag-sandbox');
 p.body=sandboxLaunch+p.body+sandboxBudgets+sandboxPaths+sandboxLinux+sandboxStop;
 d.refs=nitRefs([...d.refs,'v26Rlimit','v26Cgroup','v26PSS']);
}
const sandboxCasesBeforeLPS=infraFieldCases.agent;
infraFieldCases.agent=()=>'<h3>本地进程边界：限制命中，不冒充容器隔离</h3>'+lpsLab('subprocess_limits.py',false)+lpsLab('descriptors_and_paths.py',false)+linkTo('agent-sandbox','阅读完整执行边界与目标环境验收')+sandboxCasesBeforeLPS();
