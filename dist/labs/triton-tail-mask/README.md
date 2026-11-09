# 逐行 softmax 的尾块掩码

每个 Triton 程序实例处理一行。计算块的宽度是列数向上取整到 2 的幂。掩码 `col < width` 保护读取和写回。归约仍覆盖整个计算块，读取掩码外的填充值会参与求最大值和求指数和。

| 列数 | 块宽 | 要核对的边界 |
| --- | --- | --- |
| 5 | 8 | 分别填负无穷和零，手算并逐项对照 |
| 8 | 8 | 整块均有效，两种填充值应给出相同结果 |
| 33 | 64 | 几乎半块无效，核对归约和写回 |

每组都有一行负分数和一行从 1000 递减的分数。两行都用 float32 运行，以独立的 NumPy float64 参考逐项比较。物理行在有效列之外填入 123，写回区外保留 −777。填零对照仍使用同一掩码，只更改填充值。它能通过写回边界检查，却会使负分数行的有效概率和小于 1。

## 运行

需要 Linux x86_64、Python 3.12 和可访问官方 wheel 站点的网络。解压后进入 `triton-tail-mask` 目录，在单独虚拟环境中执行。

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-linux.txt
TRITON_INTERPRET=1 python -B triton_tail_mask.py > replay.json
```

命令成功退出表示所有正例和故障对照通过断言。打开 `replay.json`，查看 `cases[0].variants`。正确版的第一个概率约 0.516129，错误版约 0.125984。错误版只把约 0.244094 的概率写到了有效列。再查看两版的 `output_padding`，均应保持 −777。

`validation.json` 是 Linux CI 的原始输出，`ci-record.json` 将该输出和运行提交绑定。Triton 解释器在 CPU 上执行内核，并顺序模拟各程序实例。此实验证明掩码、填充和归约的数值语义。设备编译、GPU 访存安全和性能仍需另外在目标 GPU 上验收。

[Triton 解释器说明](https://triton-lang.org/main/programming-guide/chapter-3/debugging.html) · [Triton 逐行 softmax 教程](https://triton-lang.org/main/getting-started/tutorials/02-fused-softmax.html)
