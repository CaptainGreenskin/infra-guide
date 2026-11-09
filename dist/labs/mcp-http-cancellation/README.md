# 关闭 MCP 响应流后，报告提交了吗

沿用 `report-A` 第 3 版的两批固定订单 `[10,27]` 和 `[5]`。两个独立接收库都处理同一操作 `report-A/v3:publish`。唯一变化是报告与回执提交发生在首个进度事件之前，还是尚未发生。

## 运行

解压后使用 Python 3.12 和固定依赖。`replay` 必须尚不存在。

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B cancellation_lab.py --output-dir replay
```

每个场景启动独立 Uvicorn 服务端进程，仅监听临时回环端口。客户端和服务端都使用官方 Python SDK `mcp==2.3.0`，实际发送 2026-07-28 版 Streamable HTTP 请求。两个进程间传输真实 HTTP 与 SSE。工具没有连接模型、远端工具服务或生产身份系统。

## 观察边界

| 场景 | 等待开始前的接收方状态 | 关闭响应流后的结果 |
| --- | --- | --- |
| `before` | 已打开固定输入，报告和回执尚未提交 | handler 被取消且文件关闭。数据库两表都为空，同一客户端查询返回空回执 |
| `after` | 报告与回执已在同一 SQLite 事务中提交 | handler 被取消且文件关闭。数据库两表各一条，同一客户端查询原操作返回 42 |

客户端收到 `1/2` 进度后才取消等待。SDK 将内部取消动作映射为关闭那一次请求的 SSE 流。在两个 `*-server.jsonl` 中按同一请求 ID 对齐 `http_request`、进度帧、`http_disconnect`、`handler_cancelled` 和 `handler_cleaned`。取消的流没有最终 JSON-RPC 响应，线上的 HTTP 请求也没有 `notifications/cancelled` POST。已经正常返回结果的请求结束时同样可能出现断开事件，要结合该请求有没有最终响应判断。

`*-client.jsonl` 记录真实进度回调、调用者取消和同一客户端的后续查询。`*.sqlite` 是接收方实际数据库。独立校验从 `orders.json` 重算 42，读取报告与回执表，核对返回的结构化对象及文本内容。正常收尾会等待服务端进程退出。

`validation.json` 绑定源代码、固定依赖、原始证据和本次平台。仓库的 `node scripts/check-mcp-http-cancellation.cjs` 默认用 Node 与 Python 标准库重算原始证据。设定 `MCP_HTTP_PYTHON` 指向安装过固定依赖的 Python，可额外重跑并校验新结果。

本例在同一台机器上验证请求取消与本地事务回执。远端身份、网关缓冲、跨节点传播和 Kairo 的目标环境需要分别验证。

- [固定版 Streamable HTTP 的取消规则](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#cancellation)
- [MCP 取消模式与业务边界](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/cancellation)
- [SQLite 事务](https://www.sqlite.org/lang_transaction.html)
