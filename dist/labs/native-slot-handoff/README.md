# 两个 llama.cpp 进程交接一份 KV 缓存

在 macOS ARM64 上解压官方 [llama.cpp b12110 发布包](https://github.com/ggml-org/llama.cpp/releases/download/b12110/llama-b12110-bin-macos-arm64.tar.gz)，保留可执行文件和随包动态库的目录结构。本实验用 Python 3 标准库生成单层合成 Llama 模型，启动两个只监听本机的 CPU 服务，无需下载模型权重。程序检查二进制、随包依赖和模型的 SHA-256。

```sh
python3 -B slot_handoff.py --engine /absolute/path/to/llama-server --output replay
```

## 什么在交接，什么要另传

源进程处理 `[1,4,5,6]`，生成词元 7 后停止这次请求。模型此时已算过四个提示位置，还没有拿词元 7 做下一次前向。因此槽位文件只恢复四个位置。保存 396 字节后，源服务正常退出。接收侧是一个新进程，使用独立的槽位目录。运行器复制文件并核对摘要，再调用 `POST /slots/0?action=restore`。新请求仍要提交完整词元序列 `[1,4,5,6,7]`。这两个新请求的采样固定温度 0，每一步取最高分词元。

| 对照 | 复用的提示位置 | 新算的提示位置 | 实际输入批次（词元 @ 位置） | 新输出 |
| --- | ---: | ---: | --- | --- |
| 导入后 | 4 | 1 | 7 @ 4，再算 8 @ 5 | 8、9 |
| 损坏导入后重算 | 0 | 5 | [1,4,5,6,7] @ 0–4，再算 8 @ 5 | 8、9 |

把文件截到 12 字节后，服务仍在运行，但恢复返回 HTTP 400，并清空此前的六个已处理位置。通过后续新算的五个位置验证没有误用缓存。另一个细节是这个版本的新槽位尚未运行请求时，`/slots` 不显示 `n_prompt_tokens`，即使恢复已经成功。以恢复回执、`cache_n` 和实际输入批次共同判断。

`validation.json` 保存两次进程的退出状态、原生 HTTP 响应与选定的原生日志。日志会重复打印内部分批，核对输入时看 `input batch info` 后的第一组。归档中的 `prefix.bin` 是合成模型实际写出的原生文件，恢复侧的长度和 SHA-256 与它一致。文件有引擎头部、词元序列和缓存状态，396 字节不是四个位置的显存账。

本实验只比较同机 CPU、同一引擎和同一模型的贪心续写。槽位缓存恢复和运行中的请求恢复是两个层次。生产系统还要交接请求编号、已发出的输出和采样状态，并核对模型版本、位置和租户边界。记录不用于估算跨机传输、GPU 解码或服务时延。

- [固定版本的槽位保存与恢复接口](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/README.md#post-slotsid_slotactionsave-save-the-prompt-cache-of-the-specified-slot-to-a-file)
- [恢复失败时清空槽位的实现](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/server-context.cpp#L3024-L3050)
