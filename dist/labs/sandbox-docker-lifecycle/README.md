# 同一容器接第二项任务，停止另一容器后读回报告

需要 Linux/amd64、cgroup v2、Python 3.9+ 和本机 Docker Unix 套接字。Docker 主机和运行脚本的 Linux 主机需一致，因为脚本会从宿主的 `/proc` 和 `/sys/fs/cgroup` 核对容器进程。先拉取固定镜像，再开始观察。

```sh
docker pull docker.io/library/python:3.13-alpine3.22@sha256:7f7ee17311e0273954ffe76a7b84a2d8c8ecf16f9992e780e4d46c86175df431
python3 -B docker_lifecycle.py --output my-record.json
python3 -B docker_lifecycle.py --check-record my-record.json
```

校验随包记录时，把最后一条命令的文件名改成 `validation.json`。校验已保存记录无需 Docker。

## 先读两种记录

- 同一个容器。第一项任务留下 `previous` 标记和报告。直接派发第二项会被夹具拒绝，独立读回的报告仍属于第一项。删除这两个固定文件并确认报告消失后，重新派发第二项，读回属于第二项的金额 37。Docker ID、启动时刻和主进程保持一致。`docker exec` 每次会启动新命令。
- 两个同时运行的容器。两组父子进程都就绪后停止 A。检查引擎的退出码、宿主的两份 PID 与启动时刻，以及 A 的 cgroup 是否已空或移除。随后向原来的 B 发出完成请求，读取它的金额 37。最后核对实验创建的三个容器均已从引擎移除。

## 计时与范围

`cold_create_to_ready_ms` 从创建容器计到就绪。冷路径的 `cold_create_to_first_readback_ms` 和已启动容器的 `request_to_readback_ms` 都以独立读回为终点，起点分别是创建和派发。耗时包含 Docker CLI、就绪轮询或记录开销。镜像预先拉取，单次记录仅用来核对阶段边界。

实验使用固定合成输入、单机 Docker、关闭网络和只读根文件系统，任务在指定临时目录写报告。状态清理只覆盖夹具列出的两个文件。生产运行时、跨租户复用、绑定卷、凭据以及外部提交的回收需在目标系统单独验证。

[Docker exec](https://docs.docker.com/reference/cli/docker/container/exec/) · [Docker stop](https://docs.docker.com/reference/cli/docker/container/stop/) · [Linux cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html#un-populated-notification)
