# 同一段提示进 vLLM 调度器，哪几个位置还要算？

这个实验直接执行 vLLM v0.10.2 的 V1 调度器。每轮先读调度器给模型的输入位置和块表，再送回事先约定的输出编号，最后查等待队列和空闲块。记录的是本机 CPU 上的请求与缓存元数据。模型前向、采样、显存和耗时不在本实验的测量范围内。

## 先算一遍

块长 4，块 0 保留，块 1、2、3 可用。每轮最多安排 4 个输入位置，同时运行的请求上限为 2。采用先到先服务，开启分块预填充与前缀缓存。

|请求|提示词元编号|输出上限|
|---|---|---:|
|A|[1,2,3,4,5,6,7,8]|1|
|B|与 A 相同|2|
|C|[9,2,3,4]|1|

A 的提示要占两个块，冷启动分两轮处理。B 到来时，旧缓存里的两个块都还可查到。为了获得首个输出的候选分数，这个版本至少保留最后一个提示位置供重算。上限是 8−1=7，前缀按整块命中，只能复用第一块的 4 个位置。要继续生成，B 还得把首个输出送进第 8 号位置，也就是第三个逻辑块的开头。

|轮次|本轮新算的输入位置|当前有效块|返回与结束|
|---|---|---|---|
|A 前半|A 的 0–3|A [1]|没有输出|
|A 后半|A 的 4–7|A [1,2]|编号 90，A 结束|
|B 首项|B 的 4–7|B [1,3]|编号 90，复用位置数 4|
|B 下一项|B 的 8|B [1,3,2]|编号 91，B 结束|
|C 取得空闲块后|C 的 0–3|C [2]|编号 99，复用位置数 0，C 结束|

C 在 B 下一轮之前入队。安排 B 后还有 3 个输入位置的额度，但三个块都已分配，C 仍在等待。B 的结束回复处理完成时，空闲队列变为 [2,3,1]。下一轮 C 得到块 2。调度器收到 B 已结束批次的一份迟到输出 [92] 时，返回空结果，队列、请求表和块引用均不变。

## 复跑

用 Python 3.12 在解压后的目录运行：

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B upstream.py --dest upstream-cache
PYTHONHASHSEED=0 .venv/bin/python -B scheduler_lab.py --source-dir upstream-cache --output replay.json
```

下载器只从固定提交获取源码，核对字节数、SHA-256 和 Git blob 标识后写入。已有缓存也重新核对。下载包不含上游源码。记录来自 macOS ARM64、Python 3.12.13 和 msgspec 0.19.0。

在 `result.rounds` 中，把每轮 `scheduled.positions`、`after_schedule` 和 `after_reply` 对照来看。第 4 轮先看到 C 在等待、空闲块为 0，再看到 B 结束后块被归还。`finished_notices` 记录下一轮通知执行器清理的请求。A、B 的原始词元哈希链相同，C 首块仅改第一个词元，哈希不同。

## 实际执行的边界

`source-manifest.json` 固定了提交和完整 AST 定义的范围。运行器用原始方法体执行 `Scheduler` 的构造、`add_request`、`schedule` 和 `update_from_output`。请求转换、词元块哈希、真实请求队列、`KVCacheManager`、协调器和 `BlockPool` 也来自同一提交。延后类型注解求值，包级兼容性登记装饰器在独立运行器中无操作。外层配置和采样参数采用数据夹具，禁用多模态、结构化输出、跨实例 KV、事件发布和推测解码。返回的编号 90、91、99 和迟到的 92 由夹具提供，直接传给上游的 `ModelRunnerOutput`。这里只验证该版本的调度与分配行为，其他版本、实际推理结果和性能需要各自验证。

- [Scheduler 与出入队处理](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/vllm/v1/core/sched/scheduler.py)
- [缓存命中和块分配](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/vllm/v1/core/kv_cache_manager.py#L152-L212)
- [上游调度测试](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/tests/v1/core/test_scheduler.py)
- [固定版本 Apache-2.0 许可](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/LICENSE)
