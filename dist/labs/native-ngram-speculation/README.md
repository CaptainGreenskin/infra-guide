# 真实服务怎样验证四个草稿词元

固定 llama.cpp b12110，使用站内原有的 22,144 字节合成 GGUF。两次启动都在同一台机器的 CPU 上，开启一个请求槽，逐条发四个提示。每条请求取最高分，最多输出六项，关闭提示缓存复用。第二次只开启 `ngram-simple`，让引擎从历史里查找最近两项，再取旧位置后面的四项作为草稿。

## 复跑

用 Apple Silicon Mac、Python 3.9 或更新版本，以及官方 macOS arm64 的 b12110 归档。将整套 llama.cpp 解压到同一目录，保留其中的动态库。实验生成合成权重，并核对服务程序与权重的字节摘要。

```sh
python3 -B ngram_lab.py --server /absolute/path/to/llama-server --output-dir ./replay
```

输出目录须尚不存在。两次服务都只监听本机，复跑后自动退出。

## 从一批数据读出哪些词元真正提交

四组的最终流式编号都是 [7,8,9,10,11,12]。首项 7 发出后，前缀末尾是 [6,7]。依次构造四种历史：

|提示中的历史|提出|接受|含预填充的目标计算批次|
|---|---:|---:|---:|
|旧 [6,7] 后接 [8,9,10,11]|4|4|2|
|旧 [6,7] 后接 [8,9,10,4]|4|3|3|
|旧 [6,7] 后接 [8,3,10,4]|4|1|5|
|未出现旧 [6,7]|0|0|6|

关闭推测时，每组都是 6 个目标计算批次。第三组验证时把 7 和四个草稿送进位置 11 到 15。第一个草稿 8 被接受，第二个 3 被拒。日志显示已处理位置收回到 13 项，下一批把修正词元 9 重新放到位置 13。真实流式响应只输出提交的编号。

- [native-responses.json](native-responses.json) 保存原始 HTTP 流式事件。终止帧的 `timings` 带请求级草稿计数；无草稿时这两个字段省略。
- [native-stderr.log](native-stderr.log) 保存原生批次的位置、词元与接受记录。只选相关原生日志行，省略时间戳与无关字段。
- [validation.json](validation.json) 把引擎、合成权重、复跑源码和两份原始记录绑定到字节摘要。

实验验证固定合成模型的贪心输出、验证批与回退位置。批次数描述工作如何组织。每批的大小不同，端到端速度和生产接受率需要另测。

[固定版本 b12110 下载](https://github.com/ggml-org/llama.cpp/releases/tag/b12110) · [固定版本 n-gram 的实现说明](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/docs/speculative.md#n-gram-map-ngram-simple-ngram-map-)
