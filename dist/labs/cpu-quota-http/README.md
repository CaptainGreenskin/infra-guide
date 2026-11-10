# 同样的 HTTP 流量，缩小 CPU 配额会怎样

每隔 60 ms 发起一个请求，共 100 个。服务只有一个工作线程，另有四个排队位。线程收到请求后按请求 ID 计算固定轮数的摘要，做完返回 HTTP 200。排队位用尽时，服务直接返回 HTTP 503。两轮用同一份程序、同一份镜像，服务容器的 CPU 配额分别设为 1.0 和 0.25。

## 复跑

需要 Python 3.9+、启用了 cgroup v2 的本地 Docker 和已有的 `python:3.11-slim` 镜像。脚本从本地镜像 ID 启动两个临时容器。服务容器使用关闭外部网络的 Docker 网络，负载容器只共享该网络命名空间，走 `127.0.0.1` 访问服务。两者各有自己的 cgroup，服务的 `cpu.stat` 只统计服务端。运行时没有端口映射、磁盘挂载或自动拉取镜像，退出时清理本次创建的容器。

```bash
docker image inspect python:3.11-slim
python3 -B cpu_quota_http.py --output replay.json
```

本机使用 Colima 默认实例时，可以仅为这条命令指定 Docker 套接字。

```bash
DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" \
  python3 -B cpu_quota_http.py --output replay.json
```

## 先看预算，再核对结果

`cpu.max` 的两个数字都是微秒。`25000 100000` 表示调度器每 100 ms 补充 25 ms 的 CPU 时间预算。服务容器用完本周期的预算时，仍需 CPU 的线程要等预算补充后再运行。等待中的请求仍占排队位，新请求可能收到 503。 [Linux cgroup v2 CPU 接口](https://docs.kernel.org/admin-guide/cgroup-v2.html#cpu-interface-files) · [Linux CPU 带宽控制](https://docs.kernel.org/scheduler/sched-bwc.html) · [Docker CPU 配额](https://docs.docker.com/engine/containers/resource_constraints/#configure-the-default-cfs-scheduler)

负载以每秒约 16.7 次尝试发起请求。宽配额一轮，工作线程处理一个请求的 CPU 时间中位数为 36.280 ms。按这个数粗算，输入每秒需要约 0.60 个 CPU 的工作时间，尚未计入 HTTP 和调度开销。这个估算帮助解释为什么 0.25 CPU 难以跟上，也提醒我们用实测验收，不能从配额比例直接推出拒绝数。

| 本次实测 | 1.0 CPU | 0.25 CPU |
| --- | ---: | ---: |
| `cpu.max` | `100000 100000` | `25000 100000` |
| HTTP 200 / 503 | 100 / 0 | 35 / 65 |
| 成功请求往返 p95 | 39.351 ms | 1171.512 ms |
| 成功请求从进入处理函数到开始计算的 p95 | 0.058 ms | 890.325 ms |
| `nr_throttled` 增量 | 0 | 70 |
| 最晚一次发起尝试偏离计划 | 10.511 ms | 11.095 ms |

1. 对照 `arrivals` 里的 `target_ns` 和 `sent_ns`，确认负载按预定时刻发起，发起下一个请求时无需等待上一个响应。`sent_ns` 在客户端开始建立连接前记录，往返时间包含建连和读取响应。
2. 核对 `counts` 和 `server_counts`。全部请求都有一条响应，发起数等于获准数加拒绝数。等待队列排空后，获准数等于拿到 200 的完成数。客户端逐个校验成功响应中的请求 ID 和摘要。
3. 比较 `cpu_stat_before` 和 `cpu_stat_after`。这段时间包括发起负载和等待剩余请求完成。`nr_throttled` 是 CPU 限流计数，`throttled_usec` 是 cgroup 的累计限流时间。两项都来自内核，不能逐个换算成请求的等待时间。
4. 联读拒绝数与成功请求的 p95。p95 只对 200 响应排序，65 个 503 应单独计入请求失败。大量快失败会改变总体延迟分布，单看总体延迟可能漏掉过载。

`validation.json` 保存这次实测的逐请求记录、镜像标识和两个程序的 SHA-256。复跑时，操作系统调度、CPU 性能和后台负载会改变具体结果。脚本要求发起时刻的偏差小于一个间隔，且窄配额下确实发生内核限流、拒绝增加、仍有请求完成。否则记录为 `inconclusive`。可以用 `--iterations` 或 `--interval-ms` 调整负载，调整后的两轮仍使用相同输入。
