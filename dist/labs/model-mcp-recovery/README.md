# 报告已经发布，新工作进程怎样接回回执

运行器先调用 [模型发现补录的实验](../model-plan-revision/README.md)中的原程序。本机 Qwen 收到订单清单 10、27 和补录编号，实际提出修订计划、读补录和生成草稿。原程序把计划第 2 版、补录 5 和金额 42 的草稿写入任务库。发布从同一任务库取草稿。

发布由独立 MCP 服务处理。旧的测试批准只对应第 1 版和金额 37，工作进程先拒绝，服务没有收到发布请求。新批准绑定当前草稿摘要，工作进程先写待确认的操作 `report-A/v3:publish`，再通过 MCP Streamable HTTP 发出发布。接收方把报告和回执提交到自己的 SQLite 库，监督进程在服务发送响应前终止发布进程。恢复进程只按原操作查询回执，再保存完成状态。

## 复跑

准备 Python 3.12、支持 POSIX 信号的 macOS arm64 环境，以及原实验固定的公开模型和运行时。解压本实验和 [原模型规划包](../model-plan-revision.zip) 至独立目录。原包的 `model_plan_lab.py`、`fixture.json` 和 `assets.json` 按摘要验证后直接复用，无需先跑一遍旧实验。不要把模型或运行时放进实验目录。

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B model_mcp_recovery.py run \
  --planning-pack ../model-plan-revision \
  --server /path/to/llama-server --model /path/to/Qwen3-0.6B-Q8_0.gguf \
  --output-dir replay
```

`replay` 必须尚不存在。模型服务、工作进程与接收服务各自运行，网络只用本机回环地址。下载后运行无需访问外网。原模型阶段用同一提示、同一组四工具，`tool_choice=auto`。发布与恢复由宿主程序决定，批准由测试夹具提供。

## 按顺序查证据

1. 在 `model-turns.jsonl` 查模型实际提出的四个工具和下一轮 `tool_call_id`。在 `task.sqlite` 的 `plans`、`facts` 与 `task` 查第 2 版计划和已经保存的草稿。
2. 在 `validation.json` 的 `stale` 查旧批准前后任务仍在等待，接收库没有报告或回执，也没有业务请求记录。`cut` 中的任务已有待确认操作，回执为空。接收库已有一份报告和一份回执，直到发布进程退出后，服务端仍未记录发布响应开始。
3. `recovery.wire` 是新工作进程收到的实际查询响应。将请求的操作号、返回的草稿摘要和两份源版本与 `cut` 中的意图对上。最后只读打开两份数据库核对任务状态与接收方效果。

```sh
sqlite3 replay/task.sqlite 'SELECT status, draft FROM task; SELECT * FROM dispatch;'
sqlite3 replay/receiver.sqlite 'SELECT * FROM reports; SELECT * FROM receipts;'
```

接收方应保留一份金额 42 的报告和一份回执，恢复进程只执行一次查询。原发布进程已退出，后续服务端尝试发送旧响应也无法代替恢复。验证的是同宿主多进程、两个独立数据库和一次指定窗口的进程终止。测试批准与固定来源属于公开实验夹具。
