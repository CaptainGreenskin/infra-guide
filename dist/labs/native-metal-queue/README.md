# 两条请求怎样进入同一个 Metal 解码批次

用已有 CPU 并发实验的固定模型、引擎和两条请求。A 的提示是 [1,4,5,6]，生成 110 项。客户端读到 A 的第一项输出后才发送 B，B 的提示是 [1,4,5,5,10]，生成 32 项。每次新起一个服务进程，只监听本机。分别打开一个和两个槽位，每个槽位可保存 128 项历史。两轮都关闭提示复用与融合注意力。

一个槽位时，B 先被延后，等 A 释放才使用槽 0。两个槽位时，B 可以在 A 完成前进入槽 1。两条序列同时活跃只说明调度有重叠；还要看引擎送进模型的那批输入是否确实同时包含两个槽。

## 复跑

在 Apple Silicon Mac 上使用 Python 3.9+ 和官方 macOS arm64 llama.cpp **b12110**，运行：

~~~sh
curl -fLO https://github.com/ggml-org/llama.cpp/releases/download/b12110/llama-b12110-bin-macos-arm64.tar.gz
printf '%s  %s\n' 4f5b8de12e0b9516658ca6a5764c6ffb3d7c659c3dd538556b1413c7b4050662 llama-b12110-bin-macos-arm64.tar.gz | shasum -a 256 -c -
tar -xzf llama-b12110-bin-macos-arm64.tar.gz
python3 -B metal_queue.py --server "$(pwd)/llama-b12110/llama-server" --output-dir ./replay
~~~

`make_fixture.py`、`queue_client.py` 是已发布 CPU 实验的原脚本，用来生成同一份合成权重和复用同样的请求。程序校验服务程序、Metal 动态库及生成模型的摘要。输出目录需尚不存在。程序等待请求全部结束再停止服务进程。

## 核对一次共同解码

从 `native-stderr.log` 找到双槽轮的 `added ubatch to split`。这批正好有两条解码行，`[0.]` 对应槽 0 的序列，`[.1]` 对应槽 1 的序列，两行各有自己的位置与输入编号。`output=1` 表示要取该行的候选分数。随后同一批段的 Metal 编码日志包含 `kq-0`、`kq_soft_max-0`、`kqv-0` 和 `result_output`。最后，两条原生选词行和各自 HTTP 流中的下一项逐个相符。

`validation.json` 的 `first_shared_decode` 定位首个满足上述全部条件的批次。`shared_decode_count` 只数同批出现两条解码行、关键 Metal 节点和两条选词的批次，预填充与解码混合批不计入。复跑时 B 到达的位置和这个批次的编号可能随系统调度变化。

两轮累计处理 9 项提示、输出 142 项。原始流帧、槽位快照和服务指标在 `native-responses.json`。引擎计数 `n_decode_total` 包含预填充和逐项解码。实验比较本机 M4 Pro 上的输入批组织、设备编码记录和结果一致性；它没有做生产吞吐或加速比测量。

[固定版本的服务调度实现](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/server-context.cpp) · [固定版本的 Metal 节点编码](https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/ggml/src/ggml-metal/ggml-metal-ops.cpp#L243-L249)
