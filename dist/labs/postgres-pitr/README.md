# PostgreSQL 17 的具名恢复点与归档末端

从同一份物理基础备份启动两份独立的 PostgreSQL 数据目录。第一份重放 WAL 到具名标记，第二份重放到实验归档的末端。实验同时核对业务行、分叉位置，以及缺少目标日志段时的实际启动拒绝。

## 复跑

需要 Python 3.9+、可用的本机 Docker 及已安装的 PostgreSQL 17 镜像。发布记录来自官方 `postgres:17-alpine`，镜像 ID、仓库摘要和 PostgreSQL 补丁版本见 `validation.json`。脚本使用已安装镜像的 ID 启动一个临时容器。容器内部用本地 Unix 套接字连接数据库，无挂载和端口映射，容器网络关闭。

```bash
docker image inspect postgres:17-alpine
python3 -B postgres_pitr.py --output replay.json
```

如果 Docker CLI 使用 Colima，先选中可用的本机 context，或临时指定当前实例的套接字。

```bash
DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" \
  python3 -B postgres_pitr.py --output replay.json
```

`--image` 可指定另一份本地 PostgreSQL 17 镜像。运行会创建临时容器和测试数据，退出时清理。文件摘要、系统标识和 WAL 位置每次可以不同，下面的账本和分叉关系应保持一致。

## 先手算再看记录

| 观察点 | 余额 | 账本序号 |
| --- | --- | --- |
| `base` | 100 | 空 |
| `restores.named` | 125 | 101、102、103 |
| `restores.latest` | 0 | 101、102、103、104 |
| `named_after_write` | 130 | 101、102、103、105 |
| `primary_after` | 0 | 101、102、103、104 |

1. 基础备份前的账户余额是 100。`pg_basebackup -X stream` 复制物理数据及使备份可恢复的 WAL，`pg_verifybackup` 校验备份清单及该备份所需的日志。到业务恢复目标还要另外取得后续归档。
2. T101、T102、T103 分别增加 10、增加 20、扣除 5。T103 提交后写入 `after_t103`，随后 T104 把余额清零。脚本切换当前 WAL 段并等归档文件落地。
3. 两份恢复都读取时间线 1，具名恢复在 `after_t103` 后提升为可写。末端恢复重放到这次归档可提供的末端。两个隔离副本都分配了时间线编号 2，却记录了不同的 `fork_lsn`。比较历史时，编号和分叉点要一起读。
4. 具名恢复提升后独立提交 T105，再读源库。源库的余额和账本保持为 T104 后的状态。
5. 在归档副本中移除包含 `after_t103` 的日志段。脚本验证该段也不在基础备份自身的 `pg_wal` 内。服务器报告配置的恢复目标未到达，SQL 探测无法建立连接。

`validation.json` 绑定两个程序的 SHA-256，包含实际 SQL 查询、归档段摘要和失败诊断。观察范围是同一台机器上的 PostgreSQL 实例和本地文件归档。远端归档延迟、切流、应用级一致性与恢复用时需要各自测量。 [PostgreSQL 17 归档恢复](https://www.postgresql.org/docs/17/continuous-archiving.html) · [恢复目标参数](https://www.postgresql.org/docs/17/runtime-config-wal.html#RUNTIME-CONFIG-WAL-RECOVERY-TARGET) · [备份清单验证](https://www.postgresql.org/docs/17/app-pgverifybackup.html)
