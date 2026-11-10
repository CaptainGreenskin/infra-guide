# 受理响应丢了，重传之后还是原任务吗

提交只读日报请求 `R1`。服务把任务写进 SQLite 后立即断开连接，客户端没收到 HTTP 状态行。重新连上并提交相同的 `R1`，收到 HTTP 202 和已有的任务标识。本文把这个标识记作 `T1`，每次复跑会生成一个新的值。把请求中的来源版本改成 `A-v2`，仍用 `R1` 提交，则收到 HTTP 409。

随后让本机程序执行任务。固定步骤通过官方 MCP SDK 的 Streamable HTTP 读取 `reports-A`，取得 A-v1 的三个事件。另一次调用试读 `reports-B`，资源服务按已配置的主体和对象归属拒绝，审计中只有 A 的一次正文读取。原会话 `session-17` 查到 23 和三条实际引用，换一个会话查同一结果得到 404。

| 先看什么 | 到哪里核对 |
| --- | --- |
| 首次连接中断，任务是否已受理 | `client[0]` 和 `task_after_lost`。客户端没收到状态，任务库里已有一行 `ACCEPTED` |
| 重传或改参会怎样 | `client[1]`、`client[2]` 和 `task_final.submissions`。同一摘要复用原任务，另一摘要产生冲突 |
| B 是否实际读过 | `mcp` 的两条工具调用、`resource.decisions` 和 `resource.body_reads`。拒绝的响应里没有正文 |
| 最后在哪里交付 | `task_final.deliveries` 和原会话的 GET 响应，核对 5+7+11=23 以及 `A-e1`、`A-e2`、`A-e3` |

## 复跑

准备 Python 3.12 和支持 POSIX 子进程的环境。输出目录必须尚不存在，两项服务都只绑定本机回环地址。

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B reconnect_lab.py --output-dir replay
```

如果已有 G10 实验中的 `acceptance_record.py`，可再运行一遍并加 `--checker /path/to/acceptance_record.py`。两次使用不同输出目录。程序从实际客户端结果、任务库和资源审计生成 `readonly-evidence.json`。校验器检查记录与同一份只读契约是否相符。保留的执行记录包括本次实际校验结果和校验器摘要。

可以直接查看三份数据库。`reports.sqlite` 保存测试者提供的原始资源，工具进程以只读模式打开它。`resource-audit.sqlite` 记录决策和实际读取。任务状态与会话交付写入 `tasks.sqlite`。

```sh
sqlite3 replay/tasks.sqlite 'SELECT transport_id, request_id, task_id, outcome FROM submissions; SELECT * FROM deliveries;'
sqlite3 replay/resource-audit.sqlite 'SELECT attempt_id, resource, status FROM decisions; SELECT * FROM body_reads;'
```

实测范围是本机参考实现、固定测试身份、固定执行步骤与独立资源账本。记录中的 `target_export` 指这份参考实现。`provenance_verified` 仍为 `false`，因为 G10 校验器只检查字段和业务判据。真实 Kairo、模型选择和目标身份系统各需自己的执行记录。
