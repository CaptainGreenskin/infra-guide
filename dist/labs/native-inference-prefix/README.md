# 原生前缀复用：空闲、保留与清除

本实验使用真实 llama.cpp b12110 原生 CPU 引擎、本站生成的人工 GGUF 权重，不下载外部模型。三次独立重启，每次按 A → 暖 B → erase → 冷 B 顺序请求固定 slot 0。它验证缓存控制路径，不评价模型质量、GPU 性能或生产容量。

## 先预测，再查记录

A 的提示编号为 `[1,4,5,6]`，输出 `[7,8,9]`；B 为 `[1,4,5,5,10]`，输出 `[11,12,13]`。相同模型、位置、采样配置和单槽位条件下，B 与 A 已处理序列仅前三个位置相同。遇到第四个编号不同时，复用到此结束，不能把后面任意相同编号算作命中。

| 状态 | 本次复用位置 cache_n | 本次新算提示位置 prompt_n | 结束时槽位保留位置 |
|---|---:|---:|---:|
| 冷 A | 0 | 4 | 6 |
| 暖 B | 3 | 2 | 7 |
| 显式 erase | — | — | 0（返回 n_erased=7） |
| 冷 B | 0 | 5 | 7 |

暖 B 的实际前向批次依次输入 `[5,10]`、`[11]`、`[12]`，位置为 `[3,4]`、`[5]`、`[6]`。冷 B 则输入 `[1,4,5,5,10]`、`[11]`、`[12]`，位置从 0 开始。两种路径最后都选出 13；13 尚未再次输入模型，因此保留位置是 `5+3−1=7`，不能误算为 8。

`responses.json` 保留直接请求体、响应与各阶段 `/slots` 快照；`native-logs.json` 保留原生日志中批次、采样、清除和设备信息的原文及原日志行号。日志会同时打印输入批次与内部拆分批次，核对时只取 `input batch info` 后的第一组，不能重复计数。`validation.json` 绑定源码与原始证据的 SHA-256。计时字段保留原始值，但不作为稳定性能结论。

## 复跑

需要 Python 3 标准库，以及官方 macOS ARM64 b12110 发布包。当前入口严格校验记录中使用的二进制；其他平台需先建立该平台独立证据，不能悄悄替换二进制后沿用记录。

```sh
python3 -B prefix_lab.py --engine /path/to/llama-b12110/llama-server --output prefix-results
```

脚本自行生成 fixture，三轮各启动一个只监听 127.0.0.1 的进程，结束后关闭。设置 `--device none --n-gpu-layers 0`，每槽上下文 128，线程 1，batch/ubatch 32；不启用上下文移位、推测解码或模型预热。`cache_prompt=true` 控制槽位前缀复用。`--cache-ram 0` 关闭另一个跨槽提示缓存机制；`--cache-reuse 0` 不做非前缀片段移动复用，并不关闭槽位的连续前缀命中。`--slot-save-path` 开启槽位管理路径；本实验只调用 erase，不写缓存快照文件。

## 槽位空闲不等于缓存为空

完成暖 B 后 `/slots` 同时给出 `is_processing=false` 和 `n_prompt_tokens=7`。前者说明当前无任务执行，后者是该槽位保留的已处理序列长度。它不是当次命中数；命中数应读完成响应的 `timings.cache_n`。erase 返回 7，随后快照长度为 0，下一次 B 的命中也为 0，三份证据才构成清除后的闭环。

源码的 erase 分支先记下 token 列表长度，再执行 `prompt_clear()`；后者移除该序列的 KV 关联并清空提示状态。这里没有测进程 RSS、分配器或物理块归还，不能据此声称内存已交还操作系统。更不能把此单 slot 行为直接套到 vLLM 多请求共享块的引用计数。

完全相同提示也有边界：此前“原生引擎四请求实验”已观察到四位置提示重复时复用三位置并重算末位置；固定版本源码在整段匹配时把 n_past 减一，以取得选首个输出需要的末位置分数。本实验 B 是部分命中，不把上述全命中路径算进本轮测量。

## 自我检查（10 分）

1. 写出暖/冷 B 的三个实际输入批次及位置（4 分）。
2. 解释 7 为何不是输出总数、为何不是命中数（2 分）。
3. 指出 idle、erase 响应、清除后快照和下一次冷请求各证明什么（2 分）。
4. 反驳“少算 3/5 提示，所以端到端一定快 60%”；给出还需记录的排队、解码与交付阶段（2 分）。

答案见前两节。输出编号一致只验证这份人工模型和输入；不能证明任意模型数值逐位一致。改 seed、温度、位置、模型或适配器后应重新建立对照。

## 固定版本原始来源

- [发布包](https://github.com/ggml-org/llama.cpp/releases/download/b12110/llama-b12110-bin-macos-arm64.tar.gz)，归档 SHA-256 `4f5b8de12e0b9516658ca6a5764c6ffb3d7c659c3dd538556b1413c7b4050662`。
- [服务端源码：搜索 cache_prompt、TAG_PROMPT_LOGITS、SERVER_TASK_TYPE_SLOT_ERASE、prompt_clear](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/server-context.cpp)。本页主动使用符号定位，避免依赖旧行号。
- [原生 HTTP 接口：slot erase 与 cache_prompt](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/README.md#post-slotsid_slotactionerase-erase-the-prompt-cache-of-the-specified-slot)。
- [批次日志实现](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/src/llama-batch.cpp)。

本站原创实验；2026-11-09 在 macOS ARM64 CPU 实际执行三轮。独立门禁 `scripts/check-inference-prefix.cjs` 从请求、原生批次和槽位快照重新推导计数，并核对下载包。
