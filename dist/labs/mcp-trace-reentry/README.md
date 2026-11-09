# Agent 恢复运行后，怎样接回第一次的追踪

发布任务 `report-A` 汇总两批源数据，合计 `10 + 27 + 5 = 42`。应用把操作号固定为 `report-A/v3:publish`。第一次调用方保存待处理的操作和当前追踪上下文，调用 MCP 工具发布报告，随后退出。实验特意留下待处理检查点，模拟恢复入口缺少本地完成确认。第三轮是关闭跨度链接的对照。

## 运行

用 Python 3.12 创建独立环境。实验只在 `127.0.0.1` 的临时端口通信。

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -B trace_reentry.py replay
```

`replay` 必须是一个尚不存在的目录。再次运行请选择新目录。

## 检查顺序

1. 在 `trace-record.json` 查三个客户端进程、一个服务端进程。每个客户端对应一个根跨度、一个发送跨度，服务端有三个接收跨度。
2. 查 `clients.resume-linked.spans` 里的 `agent.report.run`。它有自己的追踪号、没有父跨度，唯一一条 `links` 记录指向第一次的根跨度。`resume-unlinked` 的根跨度没有链接。
3. 对照服务端收到的 `traceparent`、客户端发送跨度的 `context` 和服务端跨度的 `parent_id`。三次调用都要连回各自的发送跨度。
4. 对照三轮工具返回的 `structured_content` 摘要和 `ledger.sqlite`，三次都返回同一回执和合计 42。尝试依次是 `committed`、`reused`、`reused`。

```sh
python -c 'import sqlite3; db=sqlite3.connect("replay/ledger.sqlite"); print(db.execute("SELECT * FROM reports").fetchall()); print(db.execute("SELECT number, outcome FROM attempts ORDER BY number").fetchall())'
```

验收输出里的 `traces=3`、`links=1`、`effects=1`、`attempts=3` 可以重现。进程号、追踪号、跨度号和记录时间每次重新生成。这里使用固定业务输入、完整本地导出和直接落 SQLite 的工具，范围是追踪传播、恢复关联及一次发布的重放效果。
