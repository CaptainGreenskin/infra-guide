# 可见性、整组放置与子进程边界

五个程序均为本站原创教学夹具，Python 3.9+、仅标准库。未调用云API，也不创建真实GPU作业或容器。SQLite与文件写入自己的临时目录。后两例要求POSIX的resource、dir_fd和O_NOFOLLOW支持；本次在macOS实际运行，Linux可按同源复跑。

```sh
python3 visibility_receipts.py
python3 batch_response_reference.py
python3 placement_reservations.py
python3 subprocess_limits.py
python3 descriptors_and_paths.py
```

`validation.json` 保存逐项源码SHA256、Python/平台版本和本次完整输出。整组争抢的胜者可能改变，耗时与打开FD数量也可能因系统而变；验收核对不变量，不要求这些观测值逐字相同。

## 可见性、消息身份与确认

`visibility_receipts.py` 用实际SQLite事务实现一个有意受限的队列参考，时钟是可控的整数秒，不等待真实云端时间。0秒取得msg-A第1次接收句柄、30秒到期；31秒第2次接收得到新句柄。第1执行者仍能在到期后提交业务效果，第2执行者从业务inbox确认相同结果，只有一笔37。旧句柄确认被此参考拒绝，新句柄确认成功。新运输message_id携带相同业务event_id仍复用回执，同业务ID换参数拒绝。另验证20秒续30秒后截止点为50，31秒仍隐藏、51秒再接收。

这里有两份数据库：消息状态与业务状态；业务效果和inbox在同一个业务库事务，队列确认在另一个事务。没有“跨库恰好一次”。本参考严格拒绝旧/过期确认；真实SQS文档说明旧ReceiptHandle的删除请求也可能成功却未删除，所以它不是SQS兼容实现。即使最新确认成功，真实标准队列仍需容忍重复。

`batch_response_reference.py` 使用声明的A成功/B失败/C成功标签，算四种策略：启用部分响应且正常返回只重投B；未启用而吞掉异常正常返回会将B也当整次成功；最终抛异常则整批失败；FIFO首错后停止，B和未处理C都返回。它检验策略表，不是假装实际执行Lambda。正文另保留已有真实跨进程SQLite批次提交/退出实验。

## GPU形状与整组竞争

`placement_reservations.py` 前半是有限穷举参考：给定整数GPU槽、CPU、内存、flavor和可选同rack约束。资源都是题设，不读取硬件。总空闲[8,4,4,0]不能放[8,8]，可放[8,4,4]；在[8,4]上先贪心放4会挡住8，回溯可得[小任务→第二节点、大任务→第一节点]。配额借8/借12的判断和物理可行性分别计算。

后半实际启动两个spawn进程，争抢本地数据库里的同一组两节点额度。先注入第一节点扣减后的失败，核对整组回滚；随后两进程从相同版本出发，BEGIN IMMEDIATE事务内检查版本、扣两节点、写分配并记额度。应恰好一个admitted、一个stale_snapshot，只有同一胜者的两条分配，节点余量不负、总额度16。真实Kubernetes API不提供跨多个对象的这份单库事务；生产控制器要按实际预留、调谐和超时协议实现，不能照搬该SQLite结构当Kueue。

## 子进程限制和启动权限

`subprocess_limits.py` 只限制自己启动的子进程，宿主和父进程限制不变。实际执行：单文件4096B上限后写入失败EFBIG；FD上限64后打开失败EMFILE；CPU软/硬上限1/2秒，子进程被SIGXCPU或SIGKILL终止；另一个几乎不消耗CPU的sleep任务，在就绪后250ms墙钟预算到期，忽略TERM，200ms宽限后被KILL。记录真实墙钟和子进程CPU时间，不把两者混为一谈。禁用子进程core文件。程序不测试内存或进程数限制，不制造大量进程。

RLIMIT_FSIZE只限制单文件，不能当总临时磁盘预算；RLIMIT_CPU是进程累计CPU，不是cgroup的周期带宽；进程组管理也不是安全容器。真实来宾还需要身份、挂载、内核接口、网络和进程树级资源约束。

`descriptors_and_paths.py` 只使用合成canary。反例刻意把FD设可继承、close_fds=False并传入假环境项；安全启动例关闭非必需FD并只传少量环境项。Python默认本来就会让新FD不可继承、Popen默认close_fds=True，不暗示默认行为不安全。两种例子都仍能按路径读取同UID可访问的canary，直接证明这些启动措施没有隔离文件系统。

文件例演示“先检查前缀→被替换为symlink→再打开”读到外部夹具；固定单文件名、可信目录FD和O_NOFOLLOW可拒绝该叶子symlink，同时正常文件可读。它不处理任意多级路径、硬链接、不可信挂载和目录权限，不是通用安全路径库。

## 带到目标平台

SQS/Lambda需验证真实映射选项、可见性与重投；Kueue需锁版本、核准入/拓扑/就绪超时；沙箱需在实际Linux运行时验证挂载、网络、进程树、撤权与产物。本站只将上述本地执行标为实测。
