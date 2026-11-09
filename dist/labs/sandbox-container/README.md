# 在真实容器内核对只读输入和可写输出

R27-lab 从固定的 `source.json` 读取 10 和 27，在独立输出目录写一份金额 37 的 JSON 报告。实验先用只读输入挂载，再只把输入挂载改成可写。两例分别创建容器与合成文件，报告内容相同，输入完整性判定不同。

## 运行

需要 Python 3.9+ 标准库、Linux/amd64 Docker 引擎及本地 Unix 套接字。先拉取官方固定镜像，然后在实验目录运行。每例使用随机容器名、自建临时目录和随包固定探针。结束后按容器 ID 删除并核对引擎列表。报告只写到指定路径。

```sh
docker pull docker.io/library/python:3.13-alpine3.22@sha256:7f7ee17311e0273954ffe76a7b84a2d8c8ecf16f9992e780e4d46c86175df431
python3 -B sandbox_container.py --output my-record.json
python3 -B sandbox_container.py --check-record validation.json
```

最后一条只用标准库校验随包分发的原始记录，也可以换成 `my-record.json` 检查自己的结果。

## 核对两条文件路径

脚本以 UID/GID 65534 启动，根文件系统只读，有效能力集为空，`NoNewPrivs=1`。两例只挂载各自的合成输入和输出目录。输入文件在宿主上刻意给测试 UID 写权限，让挂载的 `readonly` 属性成为唯一变化的条件。只读挂载由内核执行。

| 观察 | 只读输入 | 可写输入对照 |
| --- | --- | --- |
| 读输入并写独立输出 | 报告 37 | 报告 37 |
| 向输入追加标记 | EROFS，宿主文件不变 | 成功，宿主文件追加标记 |
| 写镜像根文件系统中的 /tmp | EROFS | EROFS |
| 读取未挂载的夹具标记文件 | ENOENT | ENOENT |
| 容器外校验结果 | 通过 | 拒绝，输入已被修改 |

校验器直接读取宿主文件。它从初始资料重算金额与摘要，核对报告、输出目录的文件名和输入文件的实际字节。两例进程都正常退出，退出码无法单独判定隔离条件。

已保存证据来自 [GitHub Actions Linux 运行](https://github.com/CaptainGreenskin/infra-guide/actions/runs/42561457636)。引擎为 Docker 28.0.4，容器内为 Python 3.13.13。网络模式为 `none`，只记录容器内存在私有回环接口 `lo`。生产多租户、出口策略、系统调用过滤和隔离攻防需要另外验证。

[Docker 只读绑定挂载](https://docs.docker.com/engine/storage/bind-mounts/#use-a-read-only-bind-mount) · [Docker none 网络](https://docs.docker.com/engine/network/drivers/none/)
