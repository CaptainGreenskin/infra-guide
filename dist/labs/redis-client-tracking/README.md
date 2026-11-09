# Redis 客户端缓存实战

Redis 提供远端订单值，应用内存保留一份近端副本。我们用同一键 `order:104` 观察三种路径，先预测应用最终留下哪一版，再读记录。

| 场景 | 读到的证据 | 回填结果 |
|---|---|---|
| 单连接 | Redis 处理旧 GET 后接受 SET v8。D 依次读取 v7 回复、`invalidate` 和后续 v8 回复。对未读的 `order:105` 写入时没有新增推送 | 依序处理回复和失效，后续重读得到 v8 |
| 双连接 | 读连接 D 的旧回复仍未消费，程序先读通知连接 I，再读 D。失效后又开始编号 2 的 GET | 无条件回填会短暂放回 v7。只接受当前加载编号的分支拒绝编号 1，接受编号 2 的 v8 |
| 通知连接断开 | Redis `CLIENT KILL` 返回 1，I 读到 EOF。随后写 v9，D 读取旧 v8 以及 `tracking-redir-broken` | 保留旧副本的分支仍是 v8。按断线清空的分支取消旧回填，新连接重新登记后读取 v9 |

`validation.json` 的 `wire` 保留客户端实际读写的 RESP3 帧。`direction` 区分发送、读取与 EOF，`connection` 标识套接字，JSON 里的 `\r\n` 是线上分隔符。程序用一个写入兼观察连接读取 `INFO commandstats`，在没有其他 GET 的条件下确认服务端已经处理指定旧 GET，然后才发 SET。双连接分支刻意先读取 I，验证这种消费顺序怎样影响本地缓存。

## 本机运行

本次使用 macOS arm64、Python 3.9.6 标准库以及从官方源码编译的 Redis 8.2.6。准备编译器与 `make` 后，下载并核对固定源包，再运行已解压的实验源码。把示例中的 `/path/to/tracking_lab.py` 换成实际路径。 [Redis 官方源码哈希表](https://github.com/redis/redis-hashes/blob/master/README)

```sh
curl -fsSLO https://download.redis.io/releases/redis-8.2.6.tar.gz
printf '%s  %s\n' '78dd7326c5c959202c6c3849d3ea9c61896d78d647c20f6542b52c0917f96eac' 'redis-8.2.6.tar.gz' | shasum -a 256 -c -
tar -xzf redis-8.2.6.tar.gz
make -C redis-8.2.6 -j 8 MALLOC=libc OPTIMIZATION=-O2 BUILD_TLS=no redis-server
python3 -B /path/to/tracking_lab.py \
  --redis-server redis-8.2.6/src/redis-server \
  --source-archive redis-8.2.6.tar.gz \
  --output my-validation.json
```

程序只启动自己的 Redis 进程，在私有临时目录创建 Unix 套接字，关闭 TCP 端口及持久化，结束后回收进程与临时文件。运行会记录源码、源包、二进制摘要。重新编译的二进制摘要和原始计数耗时可能随编译和运行环境改变，比较三个场景的关系、命令结果和本地值即可。

本次验证的是单机 Redis 协议与客户端消费顺序。生产客户端还需处理无响应但尚未收到 EOF 的连接，按自身读承诺选择探活、失效期限和降级路径。加载编号只管本地的在途读取，业务数据库与 Redis 的同步仍按各自提交边界设计。 [Redis 客户端缓存原理](https://redis.io/docs/latest/develop/reference/client-side-caching/) · [Redis 8.2.6 失效实现](https://github.com/redis/redis/blob/8.2.6/src/tracking.c)
