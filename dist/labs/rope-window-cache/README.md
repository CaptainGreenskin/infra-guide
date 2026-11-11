# 槽位循环复用时，RoPE 与滑窗怎样续算

把 9 个位置分成 3、2、1、3 项四批。两头各四项特征，取固定的 Q、K、V。相邻两项作为一对，按逻辑位置乘频率得到 RoPE 角度。每个位置最多读四项，包含自己。用同一规则分别执行完整序列和四槽缓存。

## 复跑

在解压目录中执行：

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B rope_window_cache.py > replay.json
```

运行记录来自 PyTorch 2.5.1、CPU 双精度的 SDPA 数学实现。输入是固定的投影向量，程序执行旋转、布尔掩码和注意力，并记录每批的槽位与可读位置。这里核对数值与读取关系，模型质量、GPU 性能和生产分页实现各自另验。

## 第二批怎样跨过槽位边界

先处理位置 0、1、2，随后把 3、4 放入同一批。查询 3 需要位置 0、1、2、3，查询 4 需要位置 1、2、3、4。正确实现把这批新 K/V 与旧槽里的 K/V 一起交给注意力，逐行应用掩码，计算后再把位置 4 写进槽 0。若先写两项再算，位置 0 会在查询 3 使用之前被覆盖。

`logical` 按位置取余数找槽，`remapped` 改用另一种四槽映射。两条路径都按逻辑位置旋转、按同一滑窗读取，和完整序列逐项一致。`slot_phase` 改用槽号计算角度，首次偏差出现在位置 4。`write_first` 保留正确角度，却先写完整批，首次偏差出现在位置 3。两类错误可分别通过 `phase_positions` 和 `visible_keys` 定位。

[RoFormer 原论文](https://arxiv.org/abs/2104.09864) · [固定版本的 PyTorch SDPA 实现入口](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/nn/functional.py#L5607)
