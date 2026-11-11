# 从 QEMU 的 vCPU 编号找到 Linux 宿主线程

需要 Python 3.8+ 和 `qemu-system-aarch64`。Ubuntu 24.04 的 `qemu-system-arm` 包提供该程序，x86_64 宿主也能用 TCG（QEMU 的软件模拟器）运行这段 AArch64 指令。Darwin 可用本机 QEMU 重放管理接口部分。

在解压目录运行：

```sh
python3 -B vcpu_probe.py > local-observation.json
```

Linux 需要宿主允许程序为自己的线程设置 CPU 亲和性，并启用 `kernel.sched_schedstats`。可先用 `sysctl kernel.sched_schedstats` 查看。若在专用测试机读到 `0`，由该测试机的管理员执行 `sudo sysctl -w kernel.sched_schedstats=1` 后再运行。实验程序只读取开关。

1. 程序启动一个带两颗 vCPU 的暂停机器，通过私有 Unix 套接字向 QEMU 管理接口发送 `query-cpus-fast`。对照 `cpus` 的顶层 `cpu-index` 和 `thread-id`。`props.thread-id` 属于虚拟拓扑。
2. Linux 将顶层线程号代入 `/proc/<QEMU PID>/task/<TID>`。`proc_threads` 保存实际读到的 `Pid` 和 `Tgid`，分别对应宿主线程号和 QEMU 进程号。随后让 vCPU 0 在一颗宿主 CPU 上执行原地跳转指令。
3. `alone` 和 `same_cpu_contender` 各读取两次 `schedstat`，间隔约 1.5 秒。第二段让另一个持续运算的进程使用同一颗 CPU。比较两段 `delta`，其三项依次是线程执行纳秒数、在运行队列等待的纳秒数和被调度次数。CPU 编号、两段时长和计数增量都以本机输出为准。

Darwin 的 QEMU 11.0.0 实测两颗 vCPU 的顶层 `thread-id` 都等于 QEMU 进程号。该版本在 Darwin 走 `getpid()` 分支，所以这里只读取管理接口，输出中的 `linux` 为 `null`。Linux 实验使用 TCG、单条循环指令和一个竞争进程，验证宿主线程定位与排队统计。程序不启动客户机操作系统，不挂载磁盘、不联网，也不测 KVM、NUMA 或生产负载。

- [QEMU `query-cpus-fast` 接口](https://qemu.readthedocs.io/en/master/interop/qemu-qmp-ref.html#command-QMP-machine.query-cpus-fast)
- [QEMU 11.0.0 的宿主线程 ID 实现](https://github.com/qemu/qemu/blob/v11.0.0/util/oslib-posix.c#L92-L108)
- [Linux 内核 `schedstat` 字段](https://docs.kernel.org/scheduler/sched-stats.html#proc-pid-schedstat)
