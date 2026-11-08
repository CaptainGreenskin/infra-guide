# 同一 TinyDecoder，从完整前缀走到原生 SDPA 缓存

Python 3.12、PyTorch 2.5.1、CPU float64；固定 SDPBackend.MATH。

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -B cache_lab.py > local-record.json
```

`tiny_decoder.py` 是原模型基础实验的逐字副本。`cache_lab.py` 导入它，不改原
forward；先对原来两条输入和有效标签[1,3]执行同一次SGD更新，再把权重原样
载入继承相同层的 CachedTinyDecoder。新增缓存不增加可训练参数，仍为664个。
完整前缀 oracle 始终调用旧 TinyDecoder.forward，不调用缓存适配器。

先核对 Attention 章同一组三行Q/K/V的手算输出：[[2,0],[0.5,3],[3.5,2]]。
原生 SDPA 完整因果路径与正确的最后一个 query 都应对应；最后一行误设
is_causal=True 则实际只读第一项，返回[2,0]。

再追踪相同模型的两条四位置输入：

- 完整路径一次处理4位置。
- single分成1+1+1+1，每一步实际追加K/V。
- two_position分成2+2，后一块query逻辑位置为[2,3]；可见矩阵应是
  [[true,true,true,false],[true,true,true,true]]。
- prefill_then_decode分成2+1+1；每个新query都要看到合法前缀全部K/V。

缓存路径用past_length给Embedding位置和query可见性加偏移。布尔mask中True
表示允许，传显式mask时is_causal=False；dropout_p=0.0明确关闭接口内dropout。
负例真的把缓存路径换成is_causal=True，并实际触发输出断言失败。测试不只
检查shape、缓存长度或没有NaN，还逐项对照全部logits。

最后对prompt=[0,1]生成3个argmax输出，每一步和原完整前缀模型比对logits及
选择。prefill后缓存2位置，两次decode后3、4位置。最后选出的第3个输出尚未
作为输入，因此逻辑序列含5项，缓存只有P+G-1=2+3-1=4项，未越过原模型的
4位置表。输出只是这个极小模型的ID，不代表语言质量。

程序实际用CPU profiler核对aten::_scaled_dot_product_attention_math派发事件，
不报告速度，不把原生SDPA调用等同于执行GPU FlashAttention。本例没有padding、
GQA、RoPE、分页、服务调度或真实分词；缓存只接受连续的合法前缀。

一手实现（固定v2.5.1）：

- https://github.com/pytorch/pytorch/blob/v2.5.1/torch/nn/functional.py#L5607
- https://github.com/pytorch/pytorch/blob/v2.5.1/torch/nn/attention/__init__.py
