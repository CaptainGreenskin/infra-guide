/* Actual local effects and declared reference inputs are labeled independently. */
Object.assign(sources,{
 v26Receipt:['Amazon SQS · 接收句柄与删除','https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_DeleteMessage.html'],
 v26TAS:['Kueue · 拓扑感知放置','https://kueue.sigs.k8s.io/docs/concepts/topology_aware_scheduling/'],
 v26Ready:['Kueue · 就绪等待、超时与重新排队','https://kueue.sigs.k8s.io/docs/tasks/manage/setup_wait_for_pods_ready/'],
 v26Quota:['Kueue · ClusterQueue与资源配额','https://kueue.sigs.k8s.io/docs/concepts/cluster_queue/'],
 v26Rlimit:['Python 3.12 · 资源限制的单位与范围','https://docs.python.org/3.12/library/resource.html'],
 v26Cgroup:['Linux Kernel · cgroup v2控制器','https://docs.kernel.org/admin-guide/cgroup-v2.html'],
 v26PSS:['Kubernetes · Pod安全标准','https://kubernetes.io/docs/concepts/security/pod-security-standards/']
});
const lpsResult=name=>leasesPlacementSandboxValidation.programs[name].result;
function lpsLab(name,full=true){
 let lead,rows,scope;
 if(name==='visibility_receipts.py'){
  lead='用真实SQLite保存消息状态和业务状态，按可控整数时钟推进接收、到期、续期与确认；业务效果与inbox在同一业务库事务。';
  rows=[['0秒/31秒接收同消息','运输ID仍msg-A，接收句柄从msg-A:1变msg-A:2'],['旧执行者到期后提交','仍可提交37；新执行者复用业务回执'],['确认','此参考拒绝旧句柄，接受新句柄；效果只有1笔'],['重新发布运输消息','换message_id、同event_id仍复用；同业务ID换参数拒绝'],['20秒续30秒','截止50秒；31秒仍隐藏，51秒再接收；旧句柄续期拒绝']];
  scope='本地受限队列参考，不是SQS。严格拒绝旧句柄属于此程序；真实SQS旧句柄删除请求可成功却未删除。没有跨库或外部API原子性。';
 }else if(name==='batch_response_reference.py'){
  lead='按明确声明的A/B/C标签计算四条处理路径，核对部分响应选项、正常返回、异常和FIFO停止规则。';
  rows=[['标准队列、部分响应启用、正常返回','仅B重投；A/C确认'],['未启用部分响应，却吞掉异常正常返回','整次被当成功，B也确认但没有效果'],['handler最后抛异常','整批A/B/C重投，已经完成的A/C仍须防重'],['FIFO首错停止','只执行A/B，返回失败B和未处理C']];
  scope='固定策略参考，不调用Lambda/SQS，不是云端投递记录。正文另保留真实SQLite跨进程批次提交实验。';
 }else if(name==='placement_reservations.py'){
  const r=lpsResult(name).group_reservation;
  lead='先在题设整数槽位上穷举可行放置，再实际启动两个spawn进程，竞争同一SQLite中的两节点整组预留。';
  rows=[['[8,4,4,0]空闲','[8,8]不可放；[8,4,4]可放'],['[8,4]上先放4再放8','贪心失败，回溯找到4→第二节点、8→第一节点'],['配额与拓扑','需借12；借上限8拒绝，12可过配额但仍须验形状'],['只扣第一节点后注入失败','整库事务回滚：两节点各空8、版本0、额度0、无分配'],['两进程同快照竞争','本次'+r.contenders.find(x=>x.result==='admitted').job+'获准，另一进程stale_snapshot'],['提交后','两节点各空0、版本1；同一胜者的两条分配；额度16']];
  scope='有限资源参考+真实本机单库事务；不是物理GPU、Kueue或Kubernetes。单库原子提交不能推广为Kubernetes多对象事务。';
 }else if(name==='subprocess_limits.py'){
  const c=lpsResult(name).cases;
  lead='在自己启动的POSIX子进程中实际设置单文件、FD和CPU限制，再用独立墙钟预算处理等待任务；父进程和宿主限制不变。';
  rows=[['单文件4096B上限','第一次只写4096，下一次EFBIG；文件实际4096B'],['FD上限64','本次额外打开'+c.descriptors.output.opened_extra+'个后EMFILE；数量随系统已有FD变化'],['CPU软/硬限1/2秒','本次'+c.cpu.termination_signal+'；子进程CPU约'+c.cpu.child_cpu_seconds.toFixed(3)+'秒'],['就绪后250ms墙钟截止','sleep任务忽略TERM，200ms宽限后KILL回收'],['等待任务的CPU时间','本次约'+c.wall.child_cpu_seconds.toFixed(3)+'秒；低CPU也会占执行槽']];
  scope='实际POSIX子进程限制，不创建容器。文件大小限额不是总磁盘，CPU累计时间不是cgroup周期带宽，进程组不等于安全隔离。';
 }else{
  lead='只使用合成canary，实际对照显式继承FD/假环境与最小启动；再复现检查路径后被替换为symlink的顺序。';
  rows=[['刻意放开继承','假环境项与假文件FD可见'],['最小启动','不传假环境、关闭非必需FD，两项不可见'],['两种进程按路径读同UID文件','都仍可读；说明没有隔离文件系统'],['先检查前缀，再替换为symlink','检查通过，随后读到fixture-B'],['可信目录FD+固定叶子名+O_NOFOLLOW','拒绝该symlink；普通叶子仍读fixture-A']];
  scope='实际POSIX夹具，不是安全沙箱或通用路径库。Python默认已有不可继承FD和close_fds=True，反例明确改动默认；多级路径、硬链接与挂载另验。';
 }
 return infraReadableHTML(para(lead)+code('Python 3.9+ · 标准库；后两例需POSIX，详见README','SHELL','python3 '+name)+table(['检查','实际结果或声明的策略输入'],rows)+
 (full?'<details class="full-code"><summary>展开完整'+name+'：与下载源码一致</summary>'+code(name,'PYTHON',leasesPlacementSandboxFiles[name])+'</details>':'')+
 '<p class="practice-links"><a href="labs/leases-placement-sandbox.zip" download>下载事件、放置与子进程实验 ↓</a><a href="labs/leases-placement-sandbox/'+name+'" download>下载'+name+' ↓</a><a href="labs/leases-placement-sandbox/validation.json" target="_blank" rel="noopener">实际输出与源码摘要 ↗</a></p>'+para('<small>'+scope+'</small>'));
}
