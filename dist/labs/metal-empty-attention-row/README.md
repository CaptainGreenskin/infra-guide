# Metal 在线注意力的空查询行

沿用上一个实验的 2053 个预制分数和二维 V。把可见前缀长度设为 0、1025、2053，两种块宽取 128 和 257。一次运行共用同一份 GPU 块统计，分别交给原合并内核和增加 `denominator == 0` 判断的内核。

## 复跑

在装有 Swift 并支持 Metal 3.0 的 macOS 上，[下载独立实验包](../metal-empty-attention-row.zip)并解压。进入其中的 `metal-empty-attention-row/` 目录运行下面的命令。

```sh
python3 -B empty_row.py --base-dir ../metal-online-attention > replay.json
```

若单独下载，将 [Python 入口](empty_row.py) 和 [Swift 扩展](empty_row.swift) 放在一起，把[上一实验包](../metal-online-attention.zip)中的 `online_attention.swift`、`kernels.metal`、`validation.json` 放到相邻的 `metal-online-attention/`，或用 `--base-dir` 指向它们所在目录。入口按 SHA-256 核对三个旧文件，从旧 Swift 源码提取设备工具和固定输入，再与扩展合成临时程序。两版内核由本机 Metal 编译后执行，临时程序运行后清理。

## 核对输出

- `empty_tiles` 的每一项依次为最大值 m、指数和 z、加权和 u 的两个分量。可见前缀为 0 时，宽度 128 的 17 个块和宽度 257 的 8 个块都得到 `["-inf",0,0,0]`。
- `original_empty` 和 `guarded_empty` 的最后两项是输出。原版直接除以 0，得到 `["nan","nan"]`。加判断后输出 `[0,0]`，前四项统计保持相同。JSON 用字符串表示负无穷与 NaN。
- `positive_rows` 中，长度 1025 和 2053 的查询在两版内核中六个 FP32 字段按位一致。Swift 另用 CPU Double 整行计算对照。两版输出缓冲区尾部的四个哨兵都保持 `-777`。

[冻结记录](validation.json)来自 Apple M4 Pro、macOS 26.2、Metal 3.0 precise 浮点模式。该验证使用预制分数，范围是分块归一化与 V 汇总。
