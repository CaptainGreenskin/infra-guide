# 算子、CPU分析与MoE路由

先完成正确性，再解释测量。四个程序使用声明的小输入，不运行真实大模型，也不会申请云资源。

## 从C算子开始

需要Python 3.9+和本地C11编译器（macOS的命令行工具或Linux的cc/gcc/clang）。本程序不自动安装编译器。

```sh
python3 operator_lab.py --report operators-local.json
```

实际编译`cpu_ops.c`并经ctypes调用float64 softmax、树形求和和两份矩阵乘法。用独立Python公式验证数值、非整块形状、非有限输入拒绝；再预热3次、采7组每组3次的96×96×96矩阵乘法时间。计时包括ctypes调用，数组分配/编译在计时外；没有使用BLAS，不承诺分块总会更快。不要添加`-ffast-math`后还沿用此数值记录。

CPU C函数假定输入尺寸与数组容量匹配、输入输出不重叠，矩阵是连续行主序，tile为正。本包的Python调用端固定满足这些前提；它不是接受任意指针的安全通用库。

## 收集真正的CPU轨迹

使用已有PyTorch环境；本次验收版本2.5.1。新环境可按自己的平台从PyTorch官方渠道安装匹配版本。

```sh
python3 cpu_profile.py --report cpu-profile.json --trace cpu-trace-local.json
```

记录CPU上的5次linear/softmax/reduce命名区间与真实算子事件。先预热3次，固定一个CPU线程。`record_shapes`、内存观察和每步正确性检查都会引入开销；轨迹用于学习执行关系，不与前一个C程序比较性能。`cpu-trace.json`是本次实际记录，可在兼容Chrome Trace格式的工具打开。它不含CUDA事件。发布包仅将轨迹元数据的输出路径traceName改为文件名，事件与数值不改，避免携带本机目录。

## 分发、算完、按原身份合并

```sh
python3 moe_routing.py --report moe-local.json
```

4个固定token向量、3个小线性专家、每token选2个。先在入选专家中归一化权重，再按token顺序做容量准入；丢弃贡献不重新归一化，作为一个明确的教学策略。两个真实本地子进程各持有指定专家，逆序回包，父进程按token/slot身份合并，与手算结果比较。没有模型训练、GPU、NCCL或网络All-to-All。

正常专家负载2/3/3；偏斜负载4/4/0。在容量3下保留6条、丢2条，最后token的MoE分支输出为0。通信160字节是5条跨rank分配×2维×8字节×往返两次的有效载荷算式，不是进程队列实际开销或网络带宽测量。

`validation.json`绑定源码与实际执行结果。每个实验范围分别记录；CPU正确性、参考策略和GPU性能不能相互替代。
