# CUDA 算子：从数据契约到设备回读

这是一份教学实现：逐行求和、稳定 softmax、16×16 分块矩阵乘法。输入为有限 float32、连续行主序、正尺寸；不含掩码、Tensor Core 或自动调优。源码中的线程数与共享内存大小是固定契约。

## 编译与执行分开

Linux x86_64、Python 3.9+、可用的 C++ 主机编译器。构建脚本按 `toolchain-lock.json` 下载并校验 NVIDIA 官方 CUDA 12.9.1 组件，约 83 MB。已有缓存同样检查大小与 SHA256。脚本只编译、链接并探测设备，不发起内核。

```sh
python3 reference.py --self-test
python3 build.py --fetch-toolkit --output-dir build
```

要在 NVIDIA GPU 上执行，另需兼容 CUDA 12.9 的驱动及计算能力 8.0 或更新的设备。本包包含 sm_80 机器码与 compute_80 PTX；目标驱动仍须能够处理相应代码。

```sh
./build/cuda_lab --json gpu-results.json
python3 reference.py --check-gpu gpu-results.json
```

程序回读 13 组正例的每个输出及一组故意不归一化的 softmax 结果；后者必须与正确结果不同。独立 Python 校验器重新生成输入和参考，逐项要求 `abs(actual-reference) <= 1e-5 + 1e-5*abs(reference)`，同时检查形状、组数、源码摘要和负例。它检查报告中的数值与结构，不为外部 JSON 的硬件来源背书。

- 求和及 softmax：3 行，列数分别 1、5、129、257，共 8 组。
- 稳定 softmax：`[1000,1001,999,-1000,0]`，1 组，加错误归一化对照。
- GEMM：`M,K,N` 为 `(1,1,1)`、`(17,19,13)`、`(32,32,32)`、`(31,33,29)`，共 4 组。

没有设备时，程序记录 `status: not-run`、`device_execution: false`，退出码 2。`--probe-only` 仅查询设备；即使发现设备也不发起内核。CPU oracle 自检用合成报告与错误变异，始终标注 `device_execution: false`，不代替 GPU 数值验证。

## 先验证正确，再采集性能

具备 Nsight 工具与目标设备时可选做：

```sh
nsys profile --trace=cuda --output=gemm-timeline ./build/cuda_lab --profile-gemm
ncu --kernel-name-base function --kernel-name tiled_matmul_kernel \
  --set basic --export gemm-kernel ./build/cuda_lab --profile-gemm
```

`--profile-gemm` 只执行一个 512³ GEMM 并检查结果；不提供完整 13 组验收，独立校验器会拒绝把该模式的报告当完整通过。程序没有报告 GPU 加速比。额外采集会改变执行开销，轨迹与无采集计时需要分别解释。

## 当前证据

`validation.json` 指向真实 Linux CI、不可变源码提交、编译输出与 PTX 入口。`compile-record.json` 是原始构建记录，`host-oracle.json` 是 CPU 校验器自检记录；这些记录不代表 GPU 内核已运行。本站尚无此实验的 GPU 数值回读、Nsight 轨迹或性能结论。

官方依据：[CUDA 12.9.1 编程指南](https://docs.nvidia.com/cuda/archive/12.9.1/cuda-c-programming-guide/index.html)、[NVCC 12.9.1](https://docs.nvidia.com/cuda/archive/12.9.1/cuda-compiler-driver-nvcc/index.html)。
