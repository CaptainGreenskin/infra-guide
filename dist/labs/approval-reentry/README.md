# 同一份报告的批准、撤权与恢复

固定任务读取三个金额 10、27 和 5，发布一份 42 的报告。工作流保存发布意图、等待状态和返回结果。接收库保存当前权限、批准、报告与回执。每个场景使用独立文件。

## 运行

准备 Python 3.12 和支持 POSIX 进程信号的环境。在解压目录执行。

```sh
python3.12 -m venv .graph
python3.12 -m venv .mcp
.graph/bin/python -m pip install -r requirements-graph.txt
.mcp/bin/python -m pip install -r requirements-mcp.txt
.graph/bin/python -B workflow.py --mcp-python "$PWD/.mcp/bin/python" > my-validation.json
```

安装依赖后，实验通过本机标准输入输出使用官方 MCP SDK。主体、批准与金额都来自本地测试数据。

需要查看两份数据库时，加 `--output-dir runs`。选择一个尚不存在的目录。

## 先预测，再对照两份数据库

| 改动 | 图的结果 | 接收库中实际报告 |
| --- | --- | --- |
| 正常批准 | 确认原始回执 | 1 份，金额 42 |
| 等待期间撤销写权限 | 拒绝发布 | 0 份 |
| 保留原批准，把 42 改成 41 | 参数绑定失败 | 0 份 |
| 提交后退出，只撤销写权限 | 查询原回执后完成 | 1 份，金额 42 |
| 提交后退出，同时撤销写入和回执读取权限 | 保留待确认 | 1 份，金额 42 |
| 故意沿用等待前的授权快照 | 图收到回执，独立验收拒绝 | 留下一份越权报告 |

检查点回答下一步做什么。接收库回答实际发生了什么。每次恢复后都先标出这两项，再看当前动作的权限。发布与查回执分开判断。

[实际运行记录](validation.json)保留两侧的状态和源码摘要。证据范围是单宿主 LangGraph、MCP stdio 和 SQLite。目标平台需按真实身份来源、审批与资源接口复跑对应场景。

[LangGraph 中断与恢复](https://docs.langchain.com/oss/python/langgraph/interrupts) · [MCP 授权适用范围](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) · [SQLite 事务](https://www.sqlite.org/lang_transaction.html)
