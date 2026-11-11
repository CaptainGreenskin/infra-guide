# Apple GPU 上的逐行 Softmax

在带 Metal GPU 和 Swift 工具链的 macOS 上，进入解压目录运行。

```sh
swift -O metal_softmax.swift > replay.json
```

Swift 主程序在运行时编译 `kernels.metal`。输入是连续排列的 FP32 矩阵。两种内核都先找每行最大值，再计算减去最大值后的指数和，最后把每项除以这行的指数和。

- `softmax_serial` 由一个线程处理一整行。每个线程组派发 64 个线程，最后一组多出的线程直接结束。
- `softmax_group` 由 64 个线程合作处理一行。编号为 0 的线程读第 0、64、128 列，编号为 1 的线程读第 1、65、129 列，以此类推。线程先求局部最大值，再在共享内存合并，指数和用同样的方式合并。宽度小于 64 时，没读到数据的线程以负无穷参与最大值归约、以 0 参与加法归约。所有线程都经过屏障。
- `softmax_unshifted` 在 GPU 上用固定输入 `[512,512,512]` 验证直接取指数会溢出。它只运行一行，预期产生 3 个非有限输出。

CPU 用 Double 单独计算参考。GPU 结果逐项检查是否为有限概率，逐行检查和是否为 1，同时检查输出后面八个初值为 −777 的哨兵。宽度 65 和 257 用来核对列数不能整除时的尾部处理，宽度 1 和 31 覆盖线程数多于数据项的情况。输入包含平坦行和不同分数的行，整行偏移为 +512 或 −512。

计时使用 1024 行，分别测 64 列和 1025 列。两种实现在同一形状上共用输入、输出和队列，预热后交替运行顺序。每个命令缓冲区派发一次，等待完成后读取 `gpuEndTime - gpuStartTime`，单位是微秒。记录保留九对原始样本、中位数和范围。比较时看同一形状的两种实现，同时看两组范围的重叠程度。

本例覆盖连续有限 FP32 数据上的单行 Softmax、线程组归约和设备计时。注意力掩码、跨行分块、CUDA、Nsight、端到端延迟与显存流量分别测量。设备与编译选项见 `validation.json`。 [Metal 线程与线程组](https://developer.apple.com/documentation/metal/creating-threads-and-threadgroups) · [Metal 设备计时](https://developer.apple.com/documentation/metal/mtlcommandbuffer/gpustarttime)
