# 原生 llama.cpp CPU 流式排队与两槽对照

同一版引擎、同一人工模型、同一对请求。请求 A 用 `[1,4,5,6]` 生成 110 项。请求 B 在客户端收到 A 的首个生成词元后发送，用 `[1,4,5,5,10]` 生成 32 项。两个请求都忽略 EOS，以固定上限结束。A、B 的前三个输出分别为 `[7,8,9]`、`[11,12,13]`，完整输出在两种配置之间逐项相同。独立进程分别开一个和两个槽，每槽上下文都用 `/slots` 确认为 128 项。提示复用、RAM 提示缓存和跨上下文重用关闭。

## 运行

冻结记录使用 macOS arm64、Python 3.9.6 标准库与 llama.cpp **b12110**（`cd959bae99ff4bed22bef2604f45241c09bbb8c8`）。先取得 [官方 macOS arm64 发布资产](https://github.com/ggml-org/llama.cpp/releases/expanded_assets/b12110)。

```sh
curl -fLO https://github.com/ggml-org/llama.cpp/releases/download/b12110/llama-b12110-bin-macos-arm64.tar.gz
printf '%s  %s\n' 4f5b8de12e0b9516658ca6a5764c6ffb3d7c659c3dd538556b1413c7b4050662 llama-b12110-bin-macos-arm64.tar.gz | shasum -a 256 -c -
tar -xzf llama-b12110-bin-macos-arm64.tar.gz
python3 -B make_fixture.py fixture.gguf
python3 -B concurrency_lab.py --server ./llama-b12110/llama-server --fixture ./fixture.gguf --output ./replay --repeat 3
```

`make_fixture.py` 与上一份单请求实验的生成器一致，产生 22,144 字节的固定模型。程序校验引擎二进制与 GGUF 的摘要。每组新起一台只监听 `127.0.0.1` 的服务器，日志确认 CPU 放置。已归档三对成功运行。复跑可能受到系统调度影响。如果没有捕获实际重叠或单槽排队，程序会报错。

## 读记录

- [validation.json](validation.json) 列出源码与记录摘要、每组客户端时刻、生成计数、槽位和原生日志行号。`record_range` 是 [events.jsonl](events.jsonl) 中从 1 开始、包含两端的记录索引。JSONL 中 `kind` 区分 `/slots` 起止状态、客户端请求、实际 SSE `data:` 载荷、指标采样和精选原生行。`native_log.line` 指向原日志行号，`index` 只用于定位记录。不同记录类型按各自时间或原日志行号阅读，JSONL 写出次序不代表时间顺序。
- 单槽中，B 的同一个引擎任务 ID 先出现 `defer task`，等 A 释放槽 0 才在槽 0 开始。双槽中，A 与 B 的不同槽位都出现 `new prompt`，随后才有首条释放日志。`/metrics` 采样也分别捕获了 `(processing, deferred)=(1,1)` 与 `(2,0)`。
- `sent_ns` 在已建立连接上发出 POST 前记录。真正携带生成词元的 SSE 行有各自的客户端观测时刻。跳过 `prompt_progress` 占位事件以及停止帧。`TTFT = first_token_ns − sent_ns`，`TPOT = (last_token_ns − first_token_ns) / (output_count − 1)`。本实验检查一条生成事件携带一项。客户端时钟与引擎日志时间基准分别读取，不能直接相减。
- 每组实际处理 9 个提示词元、发出 142 个生成词元。单槽的 `n_decode_total` 差分为 142，双槽为 110。该指标数本版引擎的 `llama_decode` 调用，包含预填充和后续解码。这份固定输入和详细日志下的读数用于解释队列和流式时间线。模型质量、GPU 性能及生产吞吐另行测量。

[固定版服务 API 与指标](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/README.md) · [固定版无槽时的延后分支](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/server-context.cpp#L3029-L3051)
