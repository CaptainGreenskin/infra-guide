# 同一设备上比较三个 CUDA GEMM

三份内核都计算连续行主序 FP32 矩阵 `C[M,N] = A[M,K] × B[K,N]`，使用 FP32 乘加。三者共享同一份输入和逐元素参考。一个乘加按两次浮点运算计数。

| 版本 | 线程和输出 | 本次改变 |
|---|---|---|
| `naive` | 16×16 线程，每线程计算一个输出 | 直接从全局地址读 A、B。缓存可能命中 |
| `tiled` | 16×16 线程，每块计算 16×16 输出 | 每次把 `K` 轴上的 16 项输入搬入共享内存，在块内复用 |
| `reuse` | 16×16 线程，每块计算 32×16 输出 | 每线程计算两行同一列。一次取得的 B 值用于两条累加链 |

以覆盖同一块 32×16 输出和 `K` 轴上一段 16 项为例，两个 `tiled` 块分别搬入一块 B，合计读取 `32×16 + 2×16×16 = 1,024` 个 FP32 元素。一个 `reuse` 块只搬入一块 B，读取 `32×16 + 16×16 = 768` 个元素。源代码在这个完整分块上少请求 1,024 字节。缓存会改变实际显存流量，两条累加链和更大的共享内存也会影响驻留。哪种内核更快，由同设备测量决定。

## 编译

沿用本站 CUDA core 实验的 Linux x86_64、CUDA 12.9.1 工具链，其中 NVCC 为 12.9.86。使用同一条命令编译三个内核，保留 `sm_80` 机器码和 `compute_80` PTX。运行需要兼容的 NVIDIA 驱动和计算能力至少为 8.0 的设备。

```sh
source_sha=$(python3 -c 'import hashlib,pathlib; print(hashlib.sha256(pathlib.Path("gemm_variants.cu").read_bytes()).hexdigest())')
nvcc -O3 -std=c++17 \
  -gencode arch=compute_80,code=sm_80 \
  -gencode arch=compute_80,code=compute_80 \
  "-DGEMM_SOURCE_SHA256=\"$source_sha\"" \
  gemm_variants.cu -o gemm_variants
```

归档真实执行时保留源码、命令、`nvcc --version`、二进制摘要、标准输出及退出码。JSON 记录内嵌的源码摘要、NVCC 版本、CUDA 运行时与驱动版本和实际所选设备。`CUDA_VISIBLE_DEVICES` 可限定只暴露待测设备，程序使用可见序号 0。

## 先验数值

```sh
./gemm_variants --probe-only
./gemm_variants --validate > validate.json
```

五组 `(M,K,N)` 分别为 `(1,1,1)`、`(17,19,13)`、`(32,32,32)`、`(31,33,29)`、`(35,67,19)`。末组同时测试 32 行输出块、16 列输出块和 16 项 K 分块的尾部。所有仍在块内的线程都通过同步点，越界装载用零填充，越界输出跳过写回。程序给输出预填 NaN，每个有效位置都必须被写成有限数，再按 `abs(got−want) <= 1e-5 + 1e-5×abs(want)` 检查。`--validate` 返回三版本五形状的全部 8,430 个读回值。

下列标准库代码从形状重新构造输入和答案，可以独立检查 `validate.json`。

```python
import hashlib
import json
import math
from pathlib import Path

r = json.loads(Path('validate.json').read_text())
assert (r['schema_version'], r['mode'], r['status'], r['device_execution']) == (1, 'validate', 'passed', True)
assert r['source_sha256'] == hashlib.sha256(Path('gemm_variants.cu').read_bytes()).hexdigest()
assert (r['dtype'], r['layout'], r['atol'], r['rtol']) == ('float32', 'row-major', 1e-5, 1e-5)
shapes = {(1, 1, 1), (17, 19, 13), (32, 32, 32), (31, 33, 29), (35, 67, 19)}
expected = {(v, s) for v in ('naive', 'tiled', 'reuse') for s in shapes}
assert len(r['cases']) == len(expected)
for case in r['cases']:
    m, k, n = case['shape_mkn']
    expected.remove((case['variant'], (m, k, n)))
    assert len(case['values']) == case['elements'] == m * n
    errors = []
    for i, got in enumerate(case['values']):
        row, col = divmod(i, n)
        want = math.fsum((((3 * row + 5 * h) % 17 - 8) / 8)
                         * (((7 * h + 2 * col) % 19 - 9) / 16) for h in range(k))
        error = abs(got - want)
        assert math.isfinite(got) and error <= 1e-5 + 1e-5 * abs(want)
        errors.append(error)
    assert math.isclose(case['max_abs_error'], max(errors), rel_tol=1e-6, abs_tol=1e-12)
assert not expected
print('15 组矩阵的 8,430 个读回值通过独立校验')
```

## 再测时间

```sh
./gemm_variants --benchmark > benchmark.json
```

`--benchmark` 先跑全部小形状。固定 `512×512×512` 后，三个版本使用同一设备、同一流和同一对设备输入缓冲区。每个版本在大形状上先验数值，再预热 3 次。随后跑 9 组，每组轮换三个版本的先后顺序，每版本连续执行 20 次。起止 CUDA event 记录在同一流，等待结束事件后，将该组毫秒数除以 20。计时区间排除分配、拷贝、CPU 参考和回读，可能包含流等待主机提交的间隙。最后逐元素检查每个版本的末次大矩阵输出。

`benchmark.variants` 中每个版本保留各组 `event_ms_per_launch`。先看中位数和组间波动，再计算朴素版与其他版的时间比。这个工作负载的有效运算量是 `2×512³`。连续使用同一对输入会影响缓存状态，结论限于报告的设备、配置和形状。

## 可选 Nsight Compute 采集

```sh
for variant in naive tiled reuse; do
  ncu --set basic --kernel-name-base function \
    --kernel-name "gemm_${variant}_kernel" --launch-count 1 \
    --export "gemm-${variant}" ./gemm_variants --profile "$variant"
done
```

`--profile` 只执行选中版本的一次大 GEMM 并检查结果。可用 `ncu --list-sections` 确认工具支持的节，再分别读设备内存流量、共享内存、寄存器或实际驻留指标。计数器的采集可能回放内核。性能报告用上一节独立 event 测量，profiling 用于解释访问和资源行为。保存工具版本和 `.ncu-rep` 后，才有已采集指标。

## 报告与退出码

- 各模式的共同字段为 `schema_version`、`mode`、`source_sha256`、`nvcc_version`、`status`、`device_execution`。可读取设备时另有 `cuda_runtime_version`、`cuda_driver_version`、`device`，其中 `device` 包含 `ordinal`、`name`、`compute_capability`、`sm_count`、`warp_size`。
- `validate`、`benchmark`、`profile` 成功时还含 `dtype`、`layout`、`atol`、`rtol`、`cases`。每个 case 有 `variant`、`shape_mkn`、`elements`、`max_abs_error`、`values`。`profile` 成功只含一个大形状 case，并省去逐项 `values`。
- `benchmark` 额外含 `benchmark` 对象。字段为 `shape_mkn`、`useful_flop_per_launch`、`warmup_per_variant`、`groups`、`launches_per_group`、`order_per_group`、`variants`。每个版本有 `variant`、9 个 `event_ms_per_launch` 样本、`median_event_ms_per_launch`、`elements_checked_after_timing`、`max_abs_error_after_timing`。
- `probe` 成功报告 `device-detected` 和 `device_execution:false`。没有设备或当前设备不符合条件时输出 `not-run`、`device_execution:false` 和 `reason`，退出码 2。参数、CUDA 调用、计时或数值失败写标准错误并退出 1。成功执行或探测退出 0。

本实验的设备回读、event 时间和 Nsight 指标需要在目标机器采集。编译成功、PTX 入口或探测到设备分别是各自阶段的证据。独立校验可发现报告中的数值或结构问题，执行环境与记录来源需要另行绑定。

依据：[CUDA C++ Programming Guide 12.9.1](https://docs.nvidia.com/cuda/archive/12.9.1/cuda-c-programming-guide/index.html)、[CUDA Event Management 12.9.1](https://docs.nvidia.com/cuda/archive/12.9.1/cuda-runtime-api/group__CUDART__EVENT.html)、[Nsight Compute Profiling Guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html)。

## 本次编译记录

[Linux CI 运行](https://github.com/CaptainGreenskin/infra-guide/actions/runs/42549260483)以 NVCC 12.9.86 编译并链接这份源码，验证三个内核入口和无设备探测。包内 [validation.json](validation.json) 绑定源码与 PTX 摘要，探测返回设备数 0。这里没有生成设备结果或时间样本。
