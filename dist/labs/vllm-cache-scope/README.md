# 提示完全一样，另一位调用者能复用缓存吗？

三个场景都从空缓存开始，用 A 的提示 [1,2,3,4,5,6,7,8] 预热。再发同一组词元。这三次都携带相同的客户端字段 `cache_salt=demo-A`，实际区别是入口把哪个值送进引擎。

缓存盐（cache salt）是参与前缀缓存键的一段附加值。固定 vLLM v0.10.2 将它放进首块的键。后面的块又把前一块的键作为输入，所以改盐会使两个块的键都变。测试里的 A、B 是入口已经认出的调用者。入口策略用字典模拟，盐值也只用来做对照。

|后续请求|引擎收到的盐|两块键与 A 的比较|实际调度的位置|复用位置数|
|---|---|---|---|---:|
|A，入口按调用者选盐|demo-A|都相同|一轮 4–7|4|
|B，入口按调用者选盐|demo-B|都不同|先 0–3，再 4–7|0|
|B，入口直接转发客户端给的盐|demo-A|都相同|一轮 4–7|4|

A 预热完后两块都能在索引中查到，但这个版本要重算最后一个提示位置来取候选分数。8−1=7 只允许复用一个 4 格整块。三组的最终输出编号 90 由测试程序固定，方便核对复用和输出各在哪一轮发生。

## 复跑

下载本站已有的 `vllm-scheduler.zip` 与本实验包，解压成相邻的两个目录。该包里的源码清单、加载器、调度器配置和依赖文件由本实验校验 SHA-256。上游文件按原清单下载，本包不再复制。

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r ../vllm-scheduler/requirements.txt
.venv/bin/python -B ../vllm-scheduler/upstream.py --dest upstream-cache
PYTHONHASHSEED=0 .venv/bin/python -B cache_scope.py \
  --scheduler-dir ../vllm-scheduler --source-dir upstream-cache --output replay.json
```

先读 `key_matches`，确认盐怎样传到两块键。再看 `matching_blocks_before_schedule` 与 `follow_rounds`，区分“索引能查到两个块”和“本轮只复用一个块”。`free_after_reply` 用于核对结束后的回收。

这里直接执行原版 vLLM 的请求转换、前缀哈希、调度与块管理。CPU 上只处理元数据。样本中的调用者和入口策略是夹具，服务端实际鉴权、完整模型推理、设备显存和侧信道需要各自验证。

[固定版本的前缀键与父块哈希](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/vllm/v1/core/kv_cache_utils.py#L509-L613) · [固定版本的请求字段](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/vllm/v1/request.py#L120-L146)
