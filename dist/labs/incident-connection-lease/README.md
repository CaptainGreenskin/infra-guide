# 同样拿不到连接，等待发生在哪

使用 Python 3.9 或以上版本。实验使用标准库、本机 SQLite 文件和临时 HTTP 回环端口。

```sh
python3 -B incident_connection_lease.py
```

A 与 B 查询两条固定订单，结果分别为 42 与 37。应用只提供一个可租借的 SQLite 连接。实验在 A 暂停时提交 B，记录 B 的线程能否从池中取到连接。

| 实验组 | A 暂停处 | 放行前 B 的状态 |
| --- | --- | --- |
| `sqlite_lock` | A 已借连接并尝试 SELECT。另一个连接持有独占锁，A 和独立探测连接均读到 `database is locked` | 尚未取得连接 |
| `external_inside` | A 持连接等 HTTP 响应，尚未执行 SELECT | 尚未取得连接 |
| `external_outside` | A 执行 SELECT 并归还连接，随后等同一个 HTTP 响应 | 已取得连接并查询完成 |

SQLite 组固定使用回滚日志。测试连接将等锁时间设为 0，使冲突直接可见。控制程序释放锁后，A 只重试一次相同查询。HTTP 两组各发出一条实际回环请求，响应均返回 `external-a`。第三组只移动 HTTP 调用的位置，两条订单结果和外部回执保持一致。

`events` 用单调时钟按同一进程中的事件顺序记录借还、SQL、HTTP 和完成。 `snapshot` 在释放测试门之前读取。运行记录保留原始事件，时间差随本机变化。用这组实验证明观测能区分等待位置与干预方向，生产连接池、跨库隔离和压测时延需按目标环境验证。

- [SQLite 事务与独占模式](https://www.sqlite.org/lang_transaction.html)
- [Python SQLite 超时与线程归属](https://docs.python.org/3/library/sqlite3.html#sqlite3.connect)
