# 升级工作流后，旧批准会交给谁

先把 `[10,27]` 和补录 `[5]` 汇总成 42。第 1 版工作流在批准节点等着发布到 `A/daily`。测试者预先在接收库中给这项操作保存批准 `approval-A-1`。第 2 版保留批准节点的名字，却在原问题之前插入一问，是否共享给 `B/daily`。

三组都先用第 1 版暂停。启动进程退出后，另一个进程重新打开同一份 SQLite 检查点。它用旧 `thread_id` 和旧中断编号提交这份批准。另起的 `fresh-v2` 只用于观察第 2 版的第一个问题。

| 对照 | 恢复后真正读取批准的代码 | 接收库实际写入 |
| --- | --- | --- |
| `unsafe` 故意只认批准编号 | 第 2 版先把 A 的批准交给 B 的共享，再次停下等 A | A 0 份，B 1 份 |
| `bound` 核对批准绑定的操作 | 第 2 版仍把批准交给 B，接收方比对目标和操作后拒绝 | A 0 份，B 0 份 |
| `version-routed` 按已保存的版本选图 | 第 1 版把批准交给原来的 A 发布，任务结束 | A 1 份，B 0 份 |

## 复跑

使用 Python 3.12。输出目录要尚不存在，重跑时可换一个目录。

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B resume_lab.py --output-dir replay
```

先看 `validation.json` 里的 `waiting_v1.interrupts` 和 `resume.fresh_v2_pause.interrupts`，找到旧任务的问题和新任务的第一问。再对照 `resume.resume_interrupt_id`，确认恢复传的确实是旧编号。最后到 `receiver_final.decisions` 和 `receiver_final.writes` 核对接收方实际收到的意图和最终写入。图状态由 `checkpoints.sqlite` 保存，接收方记录在另一个文件 `receiver.sqlite`。

```sh
sqlite3 replay/unsafe/receiver.sqlite 'SELECT approval_id,requested,approved,outcome FROM decisions; SELECT * FROM writes;'
sqlite3 replay/bound/receiver.sqlite 'SELECT outcome FROM decisions; SELECT count(*) FROM writes;'
sqlite3 replay/version-routed/receiver.sqlite 'SELECT approval_id,intent FROM writes;'
```

本实验用实际 LangGraph 1.2.20 和 SQLite 检查点包 3.1.3，每组分别启动暂停进程和恢复进程。B 的写入只发生在隔离的教学数据库，用来展示错误处理。批准、对象与数据是固定夹具，发布记录由 SQLite 接收函数生成。保留的执行记录绑定源码摘要。每次重跑的进程号和检查点编号会变。

[LangGraph 节点内中断顺序](https://docs.langchain.com/oss/python/langgraph/interrupts#do-not-reorder-interrupt-calls-within-a-node) · [LangGraph 已有检查点的兼容性](https://docs.langchain.com/oss/python/langgraph/backward-compatibility)
