# 模型选了工具，谁决定能读哪份报告

客户端先向 MCP 服务取得两个工具，销售查询和事故查询。它把名称、说明和参数规则交给本机模型，使用 `tool_choice=auto`。问题只说要查哪类记录，模型自己返回工具名称和 `report_id`。运行器检查参数后把原值交给 MCP 客户端，再用模型本次调用编号 `tool_call_id` 把工具响应送回模型。

| 问题 | 模型提出的工具和参数 | 资源端实际结果 |
| --- | --- | --- |
| 查 A 的销售总额 | `read_sales_report`，`report_id=A` | 读一次正文，返回 42 和 `sales-v3-9f6a` |
| 查 A 的事故数 | `read_incident_report`，`report_id=A` | 读一次正文，返回 7 和 `incident-v1-2d1b` |
| 查 B 的销售总额 | `read_sales_report`，`report_id=B` | 主体属于 A，资源服务拒绝，正文读取 0 次 |

两条允许路径的证据编号都只在资源端，首次模型请求里没有。查看模型下一轮的文字，核对它是否带回实际返回的编号和数值。B 的请求符合参数结构，MCP HTTP 也是 200，但工具返回 `isError=true`，客户端只收到通用拒绝信息。

## 复跑

实测用 macOS arm64、Python 3.12 和 llama.cpp b12110 的官方发布包。模型是 Qwen3-0.6B 的官方 Q8_0 权重，约 639 MB。实验包只包含脚本和记录，下载的模型和运行时放在自己的临时目录。`assets.json` 固定文件地址和 SHA-256，程序会检查模型大小、权重摘要和 `llama-server` 摘要。下载完成后，程序只与本机回环地址通信。

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B model_tool_lab.py \
  --server /path/to/llama-server \
  --model /path/to/Qwen3-0.6B-Q8_0.gguf \
  --output-dir replay
```

`replay` 必须尚不存在。查看 `validation.json` 的 `mcp_discovery`，再读任一 `cases` 项中的 `first_model_turn`、`mcp_call`、`final_model_turn`。模型调用编号和 MCP 请求编号各自对应一段通信。接收方的真实 SQLite 记录可直接查询：

```sh
sqlite3 replay/resource-audit.sqlite 'SELECT * FROM decisions ORDER BY seq; SELECT * FROM body_reads ORDER BY seq;'
```

模型前后两轮都用 `auto`，运行器直接转交通过检查的模型参数。记录是固定模型、模板、三条合成问题和本机 SDK 的一次结果，供读者追踪真实协议。它没有把这三题换算成工具选择准确率。资源进程以只读方式打开报告库，主体固定为 A，接收库与模型服务独立运行。

[Qwen 官方模型](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF) · [llama.cpp b12110 的工具调用说明](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/docs/function-calling.md) · [MCP 工具规范](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
