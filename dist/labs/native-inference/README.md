# 用 llama.cpp 跟一遍请求和 KV 复用

这份练习用原生 `llama-server` 在单机 CPU 上处理四个请求。程序生成一个 22,144 字节的 GGUF，里面是一层 Llama 结构、人工词表和固定参数。参数让已知编号稳定地生成下一项，便于核对请求经过哪些运算。

## 运行

实测引擎为 macOS arm64 的 llama.cpp **b12110**，提交 `cd959bae99ff4bed22bef2604f45241c09bbb8c8`，客户端使用 Python 3.9 以上的标准库。可从 [官方发布资产](https://github.com/ggml-org/llama.cpp/releases/expanded_assets/b12110) 获取已校验的二进制。

```sh
curl -fLO https://github.com/ggml-org/llama.cpp/releases/download/b12110/llama-b12110-bin-macos-arm64.tar.gz
printf '%s  %s\n' 4f5b8de12e0b9516658ca6a5764c6ffb3d7c659c3dd538556b1413c7b4050662 llama-b12110-bin-macos-arm64.tar.gz | shasum -a 256 -c -
tar -xzf llama-b12110-bin-macos-arm64.tar.gz
python3 engine_walkthrough.py --server "$(pwd)/llama-b12110/llama-server" --output-dir ./replay
```

脚本会在临时目录生成模型，启动一个只监听 `127.0.0.1` 的服务进程，结束后关闭服务。`--device none` 和 `--n-gpu-layers 0` 将本次推理固定到 CPU。发行版启动时仍可能枚举 Metal。证据中可看到模型层、KV 和计算缓冲区都放在 CPU。服务只用一个槽位（slot），即保存这条序列及其推理状态的位置。`--cache-ram 0` 关闭独立的 RAM 提示缓存，同槽位的前缀复用由每次请求的 `cache_prompt` 控制。

## 跟一次请求

`/tokenize` 把 `red green blue` 编为 `[1,4,5,6]`，其中 `1` 是起始标记。脚本把实际返回的编号交给 `/completion`。引擎先处理这四项，只有位置 3 请求输出候选得分。它根据这一行选出 `7` 并返回。下一批只输入 `7`，得到 `8`。再把 `8` 输入，得到 `9`。引擎按三项输出上限结束，所以 `9` 已经发出，仍未进入后续计算。

| 请求 | 提示编号 | `cache_n` | `prompt_n` | 实际三个计算批次 | 输出编号 |
| --- | --- | ---: | ---: | --- | --- |
| 冷请求 | `[1,4,5,6]` | 0 | 4 | `[1,4,5,6]` → `[7]` → `[8]` | `[7,8,9]` |
| 原样重发 | `[1,4,5,6]` | 3 | 1 | `[6]` → `[7]` → `[8]` | `[7,8,9]` |
| 改最后一项 | `[1,4,5,10]` | 3 | 1 | `[10]` → `[11]` → `[12]` | `[11,12,13]` |
| 关闭复用 | `[1,4,5,10]` | 0 | 4 | `[1,4,5,10]` → `[11]` → `[12]` | `[11,12,13]` |

原样重发时四项都匹配。这个版本的引擎把匹配数从 4 回退到 3，重算最后一项以获得本轮选择用的得分。改最后一项时只有前三项匹配，引擎也处理一个新提示位置。关闭复用后，同样的提示要重新处理四项，输出编号仍一致。 [原生前缀复用实现](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/server-context.cpp#L4103-L4114) · [全匹配回退实现](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/server-context.cpp#L4315-L4326)

## 怎么读证据

- `timings.cache_n` 是本轮复用的提示项数。`timings.prompt_n` 是本轮实际新算的提示项数。四例的 `tokens_evaluated` 都是完整的提示长度 4。`prompt_progress.processed` 包含已有前缀，所以暖请求的进度从 3 走到 4。带 `prompt_progress` 的事件携带占位 `tokens: [0]`，生成编号只取普通输出事件。
- `timings.predicted_n` 数选出的输出，四例都是 3。`tokens_cached` 则是结束时该槽位记录的词元数，四例都是 6，即四个提示加两个已回填的输出。它与原生日志中的 `stop processing: n_tokens = 6` 一致。模型缓冲区和物理分配另外由启动日志报告。 [原生结束响应字段](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/server-context.cpp#L2428-L2435)
- [validation.json](validation.json) 是结构化判据和实跑记录。`api` 来自响应，`native` 来自批和槽位日志，`matching_previous_prompt_prefix_ids` 单独按两次提示编号比较。模型、二进制及两个脚本均有 SHA-256。脚本用 `LLAMA_BATCH_DEBUG=1` 捕获 `added ubatch to split` 的每一行，包括词元、位置与是否请求输出得分。 [原生批调试实现](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/src/llama-batch.cpp#L1011-L1099)
- [native-responses.json](native-responses.json) 保存原生 HTTP JSON 和流事件，保留引擎实际报告的耗时。[native-stderr.log](native-stderr.log) 按固定规则选取 CPU 放置、槽位、分批和选词行，去掉时间戳及首尾空白。可用这两份证据核对 `validation.json`，其规范记录省去耗时、内部任务 ID 和端口。

实测覆盖单槽位、人工模型、贪心选词的 CPU 前向。模型的词序是人为构造的。这个夹具用于观察执行顺序，吞吐、生成质量和生产级多请求调度均在本次范围之外。
