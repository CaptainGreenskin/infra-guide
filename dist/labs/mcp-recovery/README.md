# LangGraph 崩溃后用同一操作身份重进真实 MCP 工具

固定任务是发布 report-A/v3。权威输入的基础批次为 10、27，补录为 5。图先把发布意图写进自己的 SQLite 检查点，真实 MCP 服务另用一个 SQLite 事务保存报告与回执。两份数据库分别回答图接下来要跑什么、报告实际是否已经提交。

## 运行

使用两个 Python 3.12 虚拟环境。图环境沿用 InfraGuide `dist/labs/langgraph-workflow/requirements.txt`（LangGraph 1.2.20 和 SqliteSaver 3.1.3），MCP 环境沿用 `dist/labs/mcp-protocol/requirements.txt`（官方 MCP SDK 2.3.0）。从本目录执行：

```sh
/path/to/langgraph-env/bin/python -B workflow.py --mcp-python /path/to/mcp-env/bin/python
```

可加 `--output-dir runs` 保留每例的两个数据库和崩溃屏障。路径必须不存在。默认使用临时目录，运行后自动清理。实验需要 POSIX 子进程和信号，只通过本机标准输入输出收发 MCP 消息。

## 看同一个提交窗口

1. 第一个工作进程以 `durability="sync"` 推进图。意图节点保存稳定的 `report-A:publish`。发布节点通过官方 `ClientSession` 发现并调用 `publish_report`。MCP 服务提交报告和回执，返回原生工具结果。
2. 发布节点在**收到回执后、返回图状态更新前**停住。监督者同时从图检查点读到 `next=["publish"]`，从接收库读到一份已提交报告。它向自有工作进程发 `SIGKILL`。
3. 新工作进程对同一个 `thread_id` 执行 `invoke(None)`，另起一个 MCP stdio 会话。工具收到同一操作身份和同一正文摘要后返回原回执。新进程把回执写入图状态。
4. 独立判据直接读取源 JSON 和接收库。正常例有两次工具尝试、一份报告和一份回执，金额 42。负例把进程尝试号拼入操作身份，同一图也会到达终点，但接收库产生两份报告，独立判据拒绝。

`validation.json` 记录实际执行版本、两个工作进程、MCP 服务端请求身份、检查点、数据库读数和源码哈希。PID 与检查点 UUID 每次不同。两个 MCP 会话内的数字请求 ID 可以重复，业务操作身份由发布意图固定。

本次范围是本机 stdio、进程崩溃与一个固定发布工具。观察点在 MCP 响应之后。图检查点和接收方提交各自独立，模型选择、授权、远端故障和 Kairo 属于其他验证范围。
