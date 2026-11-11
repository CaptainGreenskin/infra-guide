# 同一个词元，换前文后为什么选了另一项

沿用 Transformer 入门的 664 参数 TinyDecoder。实验先按原程序做一次 SGD 更新，再固定权重。每轮只输入两个编号，位置从 0 数起。

|输入|观察哪一行|结果|
|---|---|---|
|[0,1]|位置 1|候选 1 的分数约 3.7804，高于候选 7 的 3.4653，选 1|
|[4,1]|位置 1|候选 7 的分数约 3.5940，高于候选 1 的 3.5822，选 7|
|[0,7]|位置 0|和 [0,1] 的位置 0 比较，八个分数逐项相同|

前两轮的位置 1 使用同一个词元、同一行位置向量。它的查询向量也相同。读位置 0 时，另一行的 K 和 V 变了。先按记录核对头 0 的读取权重，再看拼头、两次回加和词表投影。最后一轮从反方向验证因果规则。

## 复跑

下载本包与本站的 `sdpa-cache.zip`，把两个解压目录并排放置。在本实验目录运行：

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r ../sdpa-cache/requirements.txt
.venv/bin/python -B trace_forward.py --sdpa-pack ../sdpa-cache --output replay.json
```

`runs` 记录三次原模型前向。先对照 `layers.x` 和 `layers.joined`。前者是词嵌入与位置向量之和，后者是两头的原生注意力结果拼接后、输出投影前的向量。 `reference.weights` 是从同次前向拿到的 Q、K、V 重算的教学对照，程序用它们复算 `joined`，与原生结果比较。最后可用 `layers.normalized` 和 `token_weight` 手算任一候选分数。

发布记录来自 PyTorch 2.5.1、macOS ARM64、CPU 双精度，固定 SDPA 的 MATH 后端。编号来自实验夹具。这里验证前向依赖、逐项打分和选词，不评价文本质量或设备性能。

[PyTorch 2.5.1 模块 hook 实现](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/nn/modules/module.py)
