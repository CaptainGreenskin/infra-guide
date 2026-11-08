# 容器资源与Pod放置：两项真实Linux实验

先读C4.1的对象、视图和资源，再读C4.4的准入与节点过滤。两项实验独立运行。

## 环境

- Python 3.9+标准库、可访问的本地Linux Docker引擎、cgroup v2。
- 调度实验另需kubectl与kind v0.33.0。安装方法见 https://kind.sigs.k8s.io/docs/user/quick-start/ 。Linux CI按官方sha256文件校验kind二进制。
- schedule_lab.py固定kindest/node:v1.35.8及内容摘要；需要下载节点镜像和pause:3.10。
- 客户端只接受本地Unix socket上下文，不接受DOCKER_HOST。macOS的Docker环境仍需提供Linux内核；读数属于该Linux环境。
- 实验创建有上限的负载和一个三节点kind集群，会占用本地磁盘/内存。使用可清理的学习或CI环境。

## 容器实验

```sh
python3 -B container_limits.py --output runs/container-record.json
```

只创建随机命名的自有容器。CPU=0.5、memory=96MiB、pids=16、network=none；复制container_probe.py后实际运行。结束删除自有容器，保留报告。

核对：cpu.max为50000 100000；忙循环的usage及nr_throttled增量为正；主进程+等待线程达到pids上限后再创建被拒绝，max事件增加；OOM对照同时满足退出137和OOMKilled=true。两个同时存活的容器比较PID/mount/network namespace，避免退出后的编号复用。实际计数和耗时随机器变化，不比较固定性能。

## 调度实验

```sh
python3 -B schedule_lab.py --output runs/scheduling-record.json
```

创建本次随机命名的kind集群。所有kubectl命令显式指定临时kubeconfig与context，finally只删除该集群。每个节点通过自己的CRI拉取pause镜像，不依赖Docker多平台导出。无需将业务kubeconfig交给实验。

依次核对：300m配额已有250m再加100m被拒绝且无第二对象；单Pod请求超过每个节点CPU时Unschedulable、无绑定；小Pod能运行；反亲和+污点阻止第二Pod，添加容忍后绑定另一节点，第三Pod仍因两个主机域都已占用而等待。

## 已有证据与边界

validation.json来自2026-11-08成功的公共Linux CI，包含运行URL、固定源提交、版本、原始条件/事件、对象UID和程序摘要。它不是本机刚运行的报告。

kind的多节点容器共享一台宿主，不能把节点报告的Allocatable相加当物理供给。本实验不验证跨主机网络、云CNI/CSI、生产伸缩、隔离逃逸或性能。源程序只读cgroup文件，不修改宿主cgroup设置。
