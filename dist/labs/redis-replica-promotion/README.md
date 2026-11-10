# Redis 主节点写成功后，切到副本会读到什么

两个实例先读到同一个订单 `order:104`，值为 `v7/pending`。客户端连主节点，把订单改成 `v8/shipped`。两组都收到 `SET` 的 `OK`，切换后的订单值却不同。

| 写入前的复制链路 | 主节点上的 `SET` / `WAIT 1 500` | 停主前读旧主 | 手动提升副本后读取 |
| --- | --- | --- | --- |
| 在线，主节点报告 1 个副本 | `OK` / `1` | `v8/shipped` | `v8/shipped` |
| 断开，主节点报告 0 个副本 | `OK` / `0` | `v8/shipped` | `v7/pending` |

`WAIT 1 500` 在同一个客户端连接上等待前面的写入，最多等 500 毫秒，返回已确认的副本数量。`0` 表示本次没有等到副本确认，主节点已经执行的 `SET` 仍有效。`1` 表示有一个副本确认到了这次写入的复制位置。本实验还从候选副本独立读取一次，检查它当时的值。 [Redis WAIT](https://redis.io/docs/latest/commands/wait/) · [Redis 复制](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)

## 跑一遍

需要 macOS 或 Linux、Python 3.9+ 以及编译 Redis 的工具。进入实验目录，编译固定版本 Redis 8.2.6 后启动实验。

```sh
curl -fsSLO https://download.redis.io/releases/redis-8.2.6.tar.gz
printf '%s  %s\n' '78dd7326c5c959202c6c3849d3ea9c61896d78d647c20f6542b52c0917f96eac' 'redis-8.2.6.tar.gz' | shasum -a 256 -c -
tar -xzf redis-8.2.6.tar.gz
make -C redis-8.2.6 -j 8 MALLOC=libc OPTIMIZATION=-O2 BUILD_TLS=no redis-server
python3 -B replica_promotion.py \
  --redis-server redis-8.2.6/src/redis-server \
  --source-archive redis-8.2.6.tar.gz \
  --output my-validation.json
```

本次在 macOS arm64、Python 3.9.6 上复跑。程序为每组启动两份 Redis，关闭它们的 TCP 监听和持久化。命令走私有临时目录内的 Unix 套接字，复制经过程序自带的 `127.0.0.1` 中继。断链组会关掉已有中继连接并拒绝重连。程序退出前停掉两个 Redis 和中继，并检查三个端点均不能连接。 [Redis 源包摘要](https://github.com/redis/redis-hashes/blob/master/README)

## 看记录

1. 看 `initial_replication` 和 `initial_replica_value`，确认两组在断链前都完成了复制。断链组的 `replication` 来自写入之前两端的 `INFO replication`，记录 `master_link_status=down` 以及 `connected_replicas=0`。
2. 看 `primary_write`。程序在同一条连接执行 `SET` 和 `WAIT`，前后核对 `CLIENT ID`。`replica_value_before_promotion` 是候选副本上的实际 `GET`。
3. 看 `after_promotion`。程序先独立读旧主，再停止旧主并确认它的套接字不可用。副本执行 `REPLICAOF NO ONE` 后，程序检查它的角色并重读订单。`replica_log` 摘录本次同步、断连、提升日志中稳定的前缀。 [Redis REPLICAOF](https://redis.io/docs/latest/commands/replicaof/)

这里的确认点是复制位置，两个实例都关闭了持久化。恢复后应读到哪个值，取决于实际接管的副本复制到了哪里。磁盘落盘、Sentinel 或 Cluster 自动选主以及业务侧写入保护需要各自验证。
