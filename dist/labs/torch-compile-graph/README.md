# 同一个分支，为什么有时会捕获多张图

本实验用 PyTorch 2.5.1、CPU 和 `float64` 比较两段前向。先算 `shifted = x + 1`。若它的元素和大于零，输出 `shifted * 2`，否则输出 `shifted - 2`。整数样本在这里可以精确表示，代码另用 Python 数值逐项校验输出。

| 样本 | 输入 | `shifted` 元素和 | 输出 |
| --- | --- | ---: | --- |
| positive | `[-1, 1, 2]` | 5 | `[0, 4, 6]` |
| negative | `[-4, -2, 0]` | −3 | `[-5, -3, -1]` |
| zero | `[-2, -1, 0]` | 0 | `[-3, -2, -1]` |
| wide_positive | `[-2, 0, 1, 2]` | 5 | `[-2, 2, 4, 6]` |
| wide_negative | `[-3, -2, -1, 0]` | −2 | `[-4, -3, -2, -1]` |

## 跑一次捕获和执行对照

在有官方 PyTorch 2.5.1 wheel 的平台使用 Python 3.12。解压后进入本目录，在独立虚拟环境中安装依赖。下面第一条安装命令适用于本次记录使用的 macOS arm64。Linux 可把同一条命令换为官方 CPU wheel 索引安装。

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
# Linux CPU: python -m pip install --index-url https://download.pytorch.org/whl/cpu -r requirements.txt
python -B compile_graph.py --write-record replay.json
```

`CaptureBackend` 是传给 `torch.compile` 的后端回调。它保存实际收到的 FX 算子，并执行收到的 `GraphModule.forward`。`new_graph_ids` 记录本次调用捕获的图，`executed_graph_ids` 记录本次实际经过的图。两列分别回答是否重新捕获、运行走了哪条路径。这里固定 `capture_scalar_outputs=False` 与 `dynamic=False`。Dynamo 打印 `.item()` 断图提示属于预期输出。

1. 看 `report.python_partial`。正数第一次经过包含 `add, sum` 的图 1 和包含 `mul` 的图 2。`.item()` 把单元素张量交给 Python，控制流在图外按标量选路。负数和零先后触发标量守卫失败，分别捕获两张各含 `sub` 的续接图。再输入正数，仍执行图 1 和图 2，新增图数为零。
2. 看 `report.python_fullgraph`。对同一个正数输入启用 `fullgraph=True` 后，`Tensor.item` 触发拒绝，后端回调次数为零。`report.dynamo_explain` 在正数首轮另行报告两张图和一次断图。
3. 看 `report.tensor_fullgraph`。`torch.where` 把比较和选择保留为张量操作，正、负、零和再次为正共用一张图。这种写法在本例会构造两条候选结果。带外部效果、代价悬殊或只在特定条件下有效的分支，需要重新核对语义与成本。
4. 看 `report.shape_control`。把同一个张量函数继续喂入长度 4 的样本，严格捕获仍成功，但尺寸守卫要求另一张图。再回长度 3 时复用原图。这与同一次 Python 执行被 `.item()` 切开是两个不同现象。

## 可选的 CPU 原生编译

有可用 C++ 编译器及其 OpenMP 运行库时，再运行下面的命令。本次使用 macOS 的 Apple Clang 和已安装的 `libomp`。程序为这一部分新建临时缓存目录，并关闭图缓存和远端缓存。

```sh
python -B compile_graph.py --inductor --write-record replay-native.json
```

`validation.json` 保存了带 `--inductor` 的一次实际运行。前四次输入在 CPU TorchInductor 路径仍得到相同输出。记录中的两个框架指标 `generated_kernel_count` 与 `generated_cpp_vec_kernel_count` 分别为 2 与 1，同时核对到一份含 `kernel` 定义的 C++ 源码和对应动态库，保留了它们的摘要。不同平台的代码生成数量和摘要可能变化。这些数据用于区分图捕获、后端代码生成和实际输出。该实验范围是单线程 CPU 前向，GPU 执行和性能须在目标设备上另行测量。

[PyTorch 编译排障指南](https://docs.pytorch.org/docs/stable/torch.compiler_troubleshooting.html) · [PyTorch 2.5.1 的 Dynamo 配置](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/_dynamo/config.py)
