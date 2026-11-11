# 同一条推理请求在 CPU 和 Apple Metal 上执行

把同一份模型加载两次。CPU 路径指定 `--device none --n-gpu-layers 0`，Metal 路径指定 `--device MTL0 --n-gpu-layers 99`。其余条件相同。两个服务都只监听本机，各用一个槽位和同一套请求。主机侧的模型线程与批处理线程都设为 1。两边都关闭融合注意力（`--flash-attn off`），便于从普通注意力图中找到独立的 Softmax 节点。

## 运行

使用 Apple Silicon Mac、Python 3.9 或更新版本，以及固定的 macOS arm64 llama.cpp **b12110**。如果已有上一份 CPU 实验的官方二进制，可直接使用。还没安装时，先从官方发布下载整套文件：

~~~sh
curl -fLO https://github.com/ggml-org/llama.cpp/releases/download/b12110/llama-b12110-bin-macos-arm64.tar.gz
printf '%s  %s\n' 4f5b8de12e0b9516658ca6a5764c6ffb3d7c659c3dd538556b1413c7b4050662 llama-b12110-bin-macos-arm64.tar.gz | shasum -a 256 -c -
tar -xzf llama-b12110-bin-macos-arm64.tar.gz
python3 -B metal_inference.py --server "$(pwd)/llama-b12110/llama-server" --output-dir ./replay
~~~

程序核对服务程序、同目录 Metal 动态库的 SHA-256，使用随包生成器得到与 CPU 实验相同的 22,144 字节合成 GGUF，无需下载权重。指定尚不存在的输出目录；每个服务进程会在各自请求跑完后退出。

## 沿四条请求查记录

| 请求 | 两边都复用的提示项 | 两边都新算的提示项 | 两边返回的编号 |
| --- | ---: | ---: | --- |
| 首次 [1,4,5,6] | 0 | 4 | [7,8,9] |
| 原样重发并允许复用 | 3 | 1 | [7,8,9] |
| 末项改成 10 并允许复用 | 3 | 1 | [11,12,13] |
| 原样重发后一个提示并关闭复用 | 0 | 4 | [11,12,13] |

冷请求先前向 `[1,4,5,6]`，再分别把刚选出的 `[7]`、`[8]` 送回模型。编号 `9` 已经发出，此次没有再送入前向，所以槽位最终保留六个位置。三条后续请求同样各有一次提示批和两次单项解码批。

核对设备需要沿两种原始记录读。启动日志给出层归属和模型、KV、计算缓冲区的位置。Metal 对照中也记录了 CPU 缓冲区。每次请求从开始到槽位释放之间，`GGML_METAL_GRAPH_DEBUG=1` 给出每一批实际送去编码的节点。先看 `Qcur-0`、`Kcur-0`、`Vcur-0` 的矩阵乘法，再看 `kq-0` 点积、`kq_soft_max-0` 归一化、`kqv-0` 汇总与 `result_output` 输出投影。CPU 请求有相同的输入批和输出编号，里面没有 Metal 的计算节点行。

- [native-stderr.log](native-stderr.log) 保留两条路径的原生放置、批次、Metal 节点和选词行。为便于对照，去掉了时间戳、行尾填充和无关启动日志。
- [native-responses.json](native-responses.json) 保留两边的请求、分词响应和流式 JSON。生成编号只数普通输出事件，提示进度事件中的编号是占位符。
- [validation.json](validation.json) 汇总原始记录中的两条设备路径和四条请求，并绑定模型、引擎、源码与记录的摘要。

这份记录来自 Apple M4 Pro 和一个单层合成模型。设备日志与返回结果合起来可以核对具体节点使用 Metal，采样、服务流程与剩余 CPU 工作仍要按各自阶段理解。调试日志会影响时间，本实验只验证路径和数值。

[固定版本的 Metal 节点编码](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/ggml/src/ggml-metal/ggml-metal-ops.cpp#L243-L249) · [编码后提交命令缓冲区](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/ggml/src/ggml-metal/ggml-metal-context.m#L755-L785)
