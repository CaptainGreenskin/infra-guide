# 响应超时后，怎样复用原动作

使用 Python 3.9 及以上版本，无需安装依赖。脚本在本机临时回环端口启动 HTTP 服务，SQLite 数据库随实验清理。

```sh
python3 -B http_operation_retry.py
```

调用方预留 2 本书。 `X-Operation-Id` 标识一次预留动作， `X-Attempt-Id` 标识一次 HTTP 尝试。这两个请求头是本实验约定。接收方从 JSON 读取商品和数量，用固定租户与动作编号查找回执，把新效果与回执放进同一 SQLite 事务。相同参数换字段顺序，比较结果仍相同。

首次处理提交后，服务端用信号告诉实验控制程序，然后暂缓返回响应头。调用方在这时开始限时读取，实际得到超时。调用方先关闭连接，再开新连接重试。第一次请求的处理函数仍被暂停。

| 请求 | 结果 | 另开连接读到的效果和回执 |
| --- | --- | --- |
| `reserve-1`，预留 2 本 | 读取响应头超时 | 均有一条，效果编号 1 |
| `reserve-1`，仍是 2 本，交换 JSON 字段顺序 | 200，返回效果编号 1 | 数量保持一条 |
| `reserve-1`，改为 3 本 | 409，参数冲突 | 数量保持一条 |
| `reserve-2`，再次发送 2 本 | 201，返回效果编号 2 | 均增加为两条 |

`before_header_read` 与 `after_timeout` 是实验控制程序从另一条数据库连接查询的结果。在真实服务中，调用方通常只能通过授权接口查询回执。这里使用固定租户、有限的请求参数与同库事务，适合验证重试身份、参数冲突与本地提交边界。跨库效果、身份系统和键的保留期要按各自协议处理。

- [SQLite 事务与 BEGIN IMMEDIATE](https://www.sqlite.org/lang_transaction.html)
- [HTTP 方法的幂等语义](https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods)
