# 回执被拒绝后，先查原操作

同一份 report-A/v3 的基础批次是 `[10,27]`，补录是 `[5]`，合计 `42`。三次独立运行都先在宿主保存待确认的操作 `report-A/v3:publish`。接收进程在一个 SQLite 事务里写入报告和回执，然后才通过官方 MCP SDK 返回结果。每次对照使用新的宿主库和接收库。

| 对照 | 实际响应 | 宿主第一次处理结果 | 怎样确认原操作 |
| --- | --- | --- | --- |
| `valid` | 结构化结果含原操作键和整数 `42` | 直接保存回执 | 核对接收库一份报告和一份回执 |
| `malformed` | 结构化结果是字符串 `"42"`，兼容文本是整数 `42` | SDK 报结构校验错误，宿主仍待确认 | 用原操作键调用只读 `lookup_receipt` |
| `wrong-operation` | 数值是整数 `42`，操作键却指向 v2 | SDK 接收，宿主发现操作键不同，仍待确认 | 用原操作键调用只读 `lookup_receipt` |

三次发布的 HTTP 响应都是 `200`，JSON-RPC 都有 `result`。直接打开接收库能看到拒绝发生前就已提交的两行。异常分支各发一次查询，三次运行最终均只保留一份报告、一份接收回执和一份被宿主接纳的回执。报告仍为 `42`。

## 运行

需要 macOS 或 Linux 与 Python 3.12。接收服务只绑定本机回环地址，由脚本分配临时端口。

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B receipt_lab.py --output-dir replay
```

`replay` 要是尚不存在的目录。重跑时换一个目录。依赖固定为本次使用版本，MCP SDK 为 `2.3.0`，协议版本为 `2026-07-28`。

## 怎么核对

1. 在 `replay/validation.json` 的 `cases.*.http` 里找 `tools/call`。先对上请求和响应 ID，再对比 `content`、`structuredContent` 和工具目录中的 `outputSchema`。记录来自 SDK 客户端实际收到的 HTTP 响应。
2. 看 `after_publish`。后两组的宿主状态还是 `pending`，接收库里已有原操作的报告和回执。
3. 比较 `after_publish.receiver` 和 `final.receiver`。它们保留相同的报告和回执。后两组第二个 `tools/call` 是以原操作键查询。
4. 需要直接检查数据库时，可执行 `sqlite3 replay/malformed-receiver.sqlite 'SELECT * FROM reports; SELECT * FROM receipts;'` 和 `sqlite3 replay/malformed-host.sqlite 'SELECT operation_id, state, receipt FROM intent;'`。

`receipt_lab.py` 的 `call_tool` 把响应故障放在提交之后。`accept_receipt` 将结构化结果和按原始批次重新计算的预期逐字段比较。`check_case` 独立读取两份数据库的快照，核对实际消息顺序、接纳状态和报告份数。

MCP 对声明输出结构的工具要求服务端返回符合规则的结果，也建议客户端校验。实验用两个故障分支分别观察 SDK 的结构校验和宿主的业务判定。[MCP 2026-07-28 输出结构规范](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#output-schema)

测试用固定输入和故意损坏的响应隔离两个边界。结论适用于这次本机 HTTP 与 SQLite 对照。生产环境还要定义查询失败时的待确认状态、接收方重试语义和权限，以及它是否会保存可按原操作键查询的持久回执。
