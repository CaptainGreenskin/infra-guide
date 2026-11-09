/* The same numerical contract, from a CPU reference to an explicit CUDA implementation. */
(()=>{
 const a=articles.find(x=>x.id==='operator-profiling');
 if(!a||a.sections.length!==9)throw Error('Operator section layout changed');
 const old=a.sections.map(s=>s[1]),p=(...rows)=>rows.map(x=>'<p>'+x+'</p>').join('');
 const fold=(title,html)=>'<details class="progressive-detail"><summary>'+title+'</summary>'+html+'</details>';
 const blocks=s=>[...s.matchAll(/<pre\b[\s\S]*?<\/pre>/g)].map(m=>m[0]);
 const keep=s=>[...s.matchAll(/<figure\b[\s\S]*?<\/figure>/g)].map(m=>m[0]).join('');
 const cu=cudaCoreFiles['cuda_lab.cu'];
 function kernel(name){
  const start=cu.indexOf('extern "C" __global__ void '+name+'('),end=cu.indexOf('\n}',start);
  if(start<0||end<start)throw Error('Missing CUDA kernel '+name);
  return code(name+' · 完整内核','CUDA',cu.slice(start,end+2));
 }
 Object.assign(sources,{
  cudaCoreGuide:['NVIDIA · CUDA 12.9.1 编程指南','https://docs.nvidia.com/cuda/archive/12.9.1/cuda-c-programming-guide/index.html'],
  cudaCoreCompiler:['NVIDIA · CUDA 12.9.1 编译与链接','https://docs.nvidia.com/cuda/archive/12.9.1/cuda-compiler-driver-nvcc/index.html']
 });
 const body=[
 p('算子是对输入执行一种明确计算的操作，例如逐行求和、softmax 或矩阵乘法。内核（kernel）是执行该计算的一种底层实现。先写明输入、输出和边界，再检查程序是否算对，最后讨论速度。框架里的一行表达式可能调用多个内核。',
 '张量用形状描述各条轴的长度，用数据类型描述每个数如何表示。布局描述元素在内存里的排列；连续行主序把一行里的相邻列放在相邻地址。A 的形状为 [M,K] 时，A[i,t] 的元素偏移为 i×K+t。步长表示沿一条轴前进一步所跨的元素或字节数，必须注明单位。',
 'CPU 是通用处理器；GPU 是适合大量并行计算的处理器；CUDA 是 NVIDIA 提供的 GPU 编程平台。本章先在 CPU 上运行用 C 语言写的 float64（每数 8 字节）程序，再把相同的计算规则写成 GPU 上的 float32（每数 4 字节）CUDA 内核。两组程序的数据类型和固定输入不同，各自对照独立参考；不把它们的时间放在一起排名。转置视图可能只改变步长，这里的接口只接收连续数组。')+
 table(['算子','本章 CUDA 输入与输出','接口前提'],[
  ['逐行求和','[R,C] → [R]','R、C 为正；每行归约成一个数'],
  ['逐行 softmax','[R,C] → [R,C]','每行归一化，输入有限，不含掩码'],
  ['矩阵乘法 GEMM','[M,K]×[K,N] → [M,N]','尺寸为正、行主序、输入输出不重叠']
 ])+p('空输入、掩码、非有限数和不连续视图都需要另订契约。CPU 求和程序还测试空和为 0，CUDA 这份接口则明确要求正尺寸。每一种实现都按自己的契约验证，不能把另一份接口支持的输入直接搬过来。'),

 p('softmax 把一行分数变成非负、和为 1 的权重。直接计算 exp(1000) 可能溢出；真正需要的是分数的相对差。减去同一最大值，不改变指数之间的比例：')+
 knowledgeFormula('稳定 softmax','m=maxⱼ xⱼ；pⱼ=exp(xⱼ−m) / Σₜ exp(xₜ−m)','分子分母共同乘 exp(−m)；有限输入的最大指数变成 1。')+keep(old[1])+
 p('CPU 例子的 [1000,1001,1002] 减后为 [−2,−1,0]，结果约为 [0.090031,0.244728,0.665241]。三个全零分数则各占 1/3。很小的指数仍可能下溢成 0；仅检查行和为 1 还不够，错放位置也可能通过行和检查，必须逐项比较参考值。',
 '原 C 实现先检查输入，再计算最大值、指数和分母，最后归一化。它拒绝 NaN、无穷和零列；不支持注意力中的 −∞ 掩码。下面保留这段核心代码，完整输入检查在第 8 节：')+
 (old[1].match(/<div class="code-block">[\s\S]*?<\/pre><\/div>/)?.[0]||''),

 p('归约把多项合成一项，例如求和、最大值。CPU 顺序求和沿一条累加链推进；GPU 可先让多个线程各算一部分，再合并。线程是执行同一内核的一份工作；线程块把一组线程组织起来；网格由本次启动的所有块组成。本例一个块负责一整行。',
 'CUDA 的 blockIdx.x 标识行，threadIdx.x 标识块内位置。求和块固定 256 个线程：线程 0 处理第 0、256、512…列，线程 1 处理第 1、257、513…列。列数 257 时，线程 0 读两项，其余线程读一项；列数只有 5 时，未读到数据的线程以 0 参与合并。',
 '共享内存是同一块线程可以共同读写的临时存储。每个线程先把局部和写进 partial，再经过块内屏障 __syncthreads()；屏障等待块内参与线程到齐，并让前面的共享内存写入对块内线程可见。此后每轮把待合并数量减半，直到 partial[0] 保存全行之和。所有线程都走到每轮屏障，不能让“没数据”的线程提前返回。下面函数用 __global__ 标明由主机发起、在 GPU 上执行，用 __shared__ 声明块内共享数组；SUM_THREADS 固定为 256。')+
 figure('v64-cuda-row','本例真实启动配置：一行一个块，256 个线程按列跨步读取，再经过 8 轮树形合并。箭头表示数据依赖，不是设备实测时间。')+
 kernel('row_sum_kernel')+
 p('浮点加法会舍入，改变合并顺序可能改变结果。原 float64 反例 [10¹⁶,1,−10¹⁶,1]，左折叠为 1、指定树形为 0、math.fsum 参考为 2；这不表示树形总是更准确。CUDA 使用 float32，仍需为每个输出定义绝对和相对误差容限。')+keep(old[2])+
 fold('展开 CUDA softmax：先归约最大值，再归约指数和',
 p('softmax 每行使用 128 个线程。先以负无穷作最大值归约的初值，再用 expf(x−最大值) 归约分母，最后每个线程写回自己负责的列。expf 是 float32 指数函数。maxima 和 totals 分开保存：还没有读完的最大值不会被分母的写入覆盖。每个屏障与数据复用阶段一一对应。')+kernel('row_softmax_kernel')),

 p('矩阵乘法的输出 C[i,j] 是 A 第 i 行与 B 第 j 列的点积：沿 K 对 A[i,t]×B[t,j] 求和。原 CPU 例子 [2,3]×[3,4] 的 C[0,0]=(−1.25)×(−1.5)+0.5×1+(−0.5)×0=2.375。先核对同一个输出，再看访问方式。')+keep(old[3])+
 p('在行主序里，ijk 循环沿 B 的列跨步读取，ikj 则连续扫 B、C 的行。分块把较小数据片留在近处，供多次计算使用。CPU 的缓存由硬件管理；下面 CUDA 实现显式把片块搬进共享内存，不能把两者当成同一种实现。',
 'CUDA 每块有 16×16=256 个线程，一个线程累计一个输出。每轮读取 A、B 各一个 16×16 片块，共用 2×16²×4=2048 字节共享内存：先协作装载→屏障→做 16 项乘加→屏障→装载下一片。第二道屏障让本轮所有读取结束后才覆盖片块。fmaf 以一次融合乘加更新累计值，舍入路径可能与分开的乘、加不同。',
 '测试形状 M=17、K=19、N=13：输出需 2 行×1 列的线程块，K 分两轮。第二行块只有一个有效输出行，第二轮 K 只有 3 项；其余装载写 0，所有线程仍参与屏障。最后仅有效的行列写回 C。')+
 figure('v64-cuda-tiles','17×19 乘 19×13：输出有两行线程块；K 的两轮有效宽度分别为 16 和 3。无效位置补零，不能在屏障前退出。')+
 fold('展开完整 CUDA 分块矩阵乘法内核',kernel('tiled_matmul_kernel'))+
 p('这份实现用于看清索引、复用与同步，没有双缓冲、Tensor Core 或厂商库的打包调度。是否更快，要在相同设备、类型、形状与测量边界下验证。'),

 p('FLOP 表示一次浮点运算；按一次乘法加一次加法计 2 FLOP，GEMM 常用工作量为 2MKN。算术强度是工作量除以搬运字节量。若 A、B 各读一次，C 只写一次，float64 理想字节量为 8(MK+KN+MN)；这是复用理想时的账，不是实际硬件流量。')+
 knowledgeFormula('原 CPU 96³ 例子的声明账','2×96³=1,769,472 FLOP；8×3×96²=221,184 B；强度=8 FLOP/B','同形状 float32 的理想字节量减半；若实际反复装载，实际强度还会改变。')+
 p('Roofline 用算术强度连接内存带宽与计算吞吐上界，帮助提出瓶颈假设。小算子也可能主要耗在发起调用、分配或框架调度。共享内存用得更多还会影响每个计算单元同时驻留多少块，因此“分块”本身不能证明变快。',
 '本例求和每块共享内存 256×4=1024 字节，softmax 为 2×128×4=1024 字节，GEMM 为 2048 字节。寄存器用量、实际驻留、合并访存和设备带宽需要编译信息或设备指标，不能从这些静态字节数直接推出。')+
 '<p>'+linkTo('gpu-execution','复习线程、块与存储层次')+linkTo('roofline-model','继续推导带宽与算力上界')+'</p>',

 p('计时前先规定要量哪段工作。编译、内存分配、首次初始化、数据拷贝与内核计算是不同阶段。原 CPU 程序先准备数组，两种 GEMM 各预热 3 次，再采 7 组，每组调用 3 次，报告全部每次微秒样本和中位数；ctypes 调用开销仍包含在内。',
 'GPU 发起调用通常是异步的，主机计时器只围住启动语句，可能仅量到提交工作。端到端墙钟需等约定的工作完成，设备区间可用 CUDA 事件；多流还要说明事件与依赖。额外同步会改变重叠，所以先选测量目标，再安排同步。',
 '本次 CUDA 正确性程序在启动后检查启动错误、同步设备、再复制回 CPU。这样可以验证执行结果，不能拿这段含分配与拷贝的时间当作纯内核耗时。程序没有输出 GPU 性能数字。')+
 table(['记录','能核对什么','仍需什么'],[
  ['CPU C 数值与采样','该源码、输入和本机下的结果与调用时间','不能代替 GPU 执行'],
  ['Linux NVCC 编译与 PTX','三个真实 CUDA 内核完成设备编译与主机链接','GPU 的实际数值回读仍待验'],
  ['目标 GPU 正确性记录','13 组输出与独立参考，错误归一化被拒绝','需在目标卡运行；本站尚无此记录'],
  ['设备性能与轨迹','目标设备上实际内核与搬运指标','需正确性通过后单独采集']
 ]),

 p('Profiler 记录执行事件。原 PyTorch CPU 程序做 [32,64]×[64,32] 线性映射，再逐行 softmax 与求和；固定 1 个 CPU 线程，预热 3 次后记录 5 次。lesson_linear、lesson_softmax、lesson_reduce 三个命名区间共 15 条。')+keep(old[6])+
 p('inclusive_cpu_us 包含事件及嵌套工作，self_cpu_us 分开本事件自身与子事件，不能把父子总时间再次相加。区间之间还可能有 Python、验证与记录器工作；这条轨迹没有 GPU 活动。')+
 '<p><a href="/labs/operators-routing/cpu-trace.json" download>下载本次真实CPU Chrome Trace格式轨迹 ↓</a></p>'+
 fold('目标 GPU 选做：把一条真实内核接到 Nsight',
 p('先完成下一节全部正确性测试，再使用 --profile-gemm 选择单个 512×512×512 乘法。这个开关仅保留一个较大 GEMM，不是 13 组验收。Nsight Systems 用来看主机发起、拷贝与设备计算的时序；Nsight Compute 用于选定内核的访存、占用和指令等指标。采集可能回放工作并增加开销。')+
 code('在具备兼容 GPU、驱动和 Nsight 工具的 Linux 环境执行','BASH',
 'nsys profile --trace=cuda --output=gemm-timeline ./build/cuda_lab --profile-gemm\nncu --kernel-name-base function --kernel-name tiled_matmul_kernel \\\n  --set basic --export gemm-kernel ./build/cuda_lab --profile-gemm')+
 p('先解释轨迹里的分配、拷贝和计算边界，再读具体指标。上述命令是待执行方法，本站没有 Nsight 结果或 GPU 加速比。')),

 p('CPU 路径先解压原实验包。operator_lab.py 只需 Python 标准库和 C11 编译器，会编译临时动态库；cpu_profile.py 另需 PyTorch。两组固定输入独立，原始完整程序与命令如下。')+
 fold('展开原 CPU 运行命令与全部源码',old[7])+
 '<span id="cuda-core-run" class="legacy-subsection-anchor" aria-hidden="true"></span>'+
 p('CUDA 路径下载下方独立实验包，在 Linux x86_64 上执行。构建脚本按锁定版本准备 CUDA 12.9.1 的 nvcc。nvcc 把 .cu 的设备部分编成 GPU 代码，并用主机编译器链接驱动程序。PTX 是设备代码的中间表示；生成 PTX 不代表任何线程已经在 GPU 上执行。本包同时生成 sm_80 机器码与 compute_80 PTX，目标设备要求计算能力 8.0 或更新，仍需兼容驱动。')+
 code('先编译，再在目标 GPU 回读与验收','BASH',
 'python3 reference.py --self-test\npython3 build.py --fetch-toolkit --output-dir build\n./build/cuda_lab --json gpu-results.json\npython3 reference.py --check-gpu gpu-results.json')+
 p('--fetch-toolkit 允许下载缺失的官方组件；已有缓存也要重新核对归档大小和 SHA256。脚本随后编译，只探测设备，不发起内核。真正数值执行是上面的第三条命令。无兼容设备时返回 not-run、退出码 2，不能当作正确性通过。')+
 table(['CUDA 固定输入','要抓住的边界','独立核对'],[
  ['每行列数 1、5、129、257，各 3 行','少于线程数、超过一轮、非整块','求和和 softmax 共 8 组，逐个回读值'],
  ['[1000,1001,999,−1000,0]','大共同偏移与下溢','稳定 softmax 1 组；跳过归一化的结果必须被拒绝'],
  ['1×1×1、17×19×13、32³、31×33×29','最小尺寸、行列尾块、K 尾项','4 组 GEMM，逐个输出比较']
 ])+
 p('共 13 组正例与 1 组错误归一化对照，统一逐项条件为 |实际−参考|≤10⁻⁵+10⁻⁵×|参考|。Python 校验器重新生成输入和参考，拒绝缺组、错形状、非有限值、源码不匹配和 profile-only 记录。它核对文件中的数值，不证明一份外部上传 JSON 的硬件来源；实际设备与执行日志需一起保存。')+
 '<p class="practice-links"><a href="/labs/cuda-core.zip" download>下载 CUDA 完整实验包 ↓</a> · <a href="/labs/cuda-core/cuda_lab.cu" download>下载完整 CUDA 源码 ↓</a> · <a href="/labs/cuda-core/reference.py" download>下载独立数值校验器 ↓</a> · <a href="/labs/cuda-core/validation.json">查看真实编译记录与待验范围 →</a></p>'+
 fold('展开 CUDA 完整驱动：分配、发起、同步、回读与错误处理',code('cuda_lab.cu · 完整原文件','CUDA',cu))+
 p('本站的 Linux CI 记录绑定源码提交与工具链，已经验证编译、链接和 PTX 内核入口；CPU 参考校验器另做变异自检。GPU 数值回读、Nsight 和性能结论仍是待验项。'),

 table(['复习问题','答到实现层'],[
  ['怎样开始写算子','轴、形状、类型、布局、边界与独立参考'],
  ['softmax 为什么减最大值','比例保持，再说两次归约、同步与接口不含掩码'],
  ['列数 257，256 个线程怎么办','线程按列跨步；无数据线程以中性值参与屏障'],
  ['GEMM 为什么有两道屏障','本轮装载完成后读取；所有读取结束后才能覆盖共享片块'],
  ['尾块能直接 return 吗','需要屏障的块中不能这样退出；无效装载补零，输出再判界'],
  ['编译通过证明什么','语法、设备编译与主机链接；数值正确和性能仍要真实设备记录']
 ])+
 p('读完应能把一个输出映射到输入下标、参与线程和共享数据，解释每道屏障在保护哪次读写。先用小输入及独立参考抓错，再固定工作量做性能比较。可把这些复用与搬运方法接到注意力，再看专家路由怎样改变计算分发。')+
 '<p>'+linkTo('flash-attention-io','继续理解注意力怎样减少中间搬运')+linkTo('moe-routing','连接专家路由与计算分发')+'</p>'
 ];
 const before=old.join(''),after=body.join(''),now=blocks(after);let at=0;
 for(const b of blocks(before)){const i=now.indexOf(b,at);if(i<at)throw Error('Lost original operator code');at=i+1;}
 for(const f of before.match(/<figure\b[\s\S]*?<\/figure>/g)||[])if(!after.includes(f))throw Error('Lost original operator figure');
 for(const[,id]of before.matchAll(/\bid=["']([^"']+)["']/g))if(!after.includes('id="'+id+'"')&&!after.includes("id='"+id+"'"))throw Error('Lost operator anchor '+id);
 for(const m of before.matchAll(/\bhref=["'][^"']+["']/g))if(!after.includes(m[0]))throw Error('Lost operator URL '+m[0]);
 body.forEach((b,i)=>a.sections[i][1]=b);
 a.level='原理 + C/CUDA源码 + 编译验证';a.minutes=60;
 a.desc=a.intro='从数据契约与数值参考出发，逐步读懂求和、softmax 和分块矩阵乘法的线程映射、共享内存与同步，再区分正确性、编译证据和性能测量。';
 a.baseline='CPU实验：Python 3.9+与C11；CUDA编译：Linux x86_64、CUDA12.9.1；GPU执行另需兼容设备与驱动';
 a.refs=[...new Set([...a.refs,'cudaCoreGuide','cudaCoreCompiler'])];a.updated='2026.11.08';

 a.sections[3][1]+=
 '<h3 id="gemm-two-row-reuse">每线程多算一行，少搬哪一块数据</h3>'+
 p('接着前面的分块乘法，固定行主序 FP32 输入和乘加顺序。朴素版每个线程直接读 A 的一行与 B 的一列，计算一个输出。分块版先把 A、B 的小块装入共享内存，块里的线程再各算一个输出。双行复用版保持 16×16 个线程，每个线程多算一行同一列。它读到一个 B 值后，分别乘两行对应的 A 值，累加到两个寄存器。')+
 trainingFigure('v77-gemm-reuse','覆盖同样的 32×16 输出时，两个分块线程块各装载一次 B。同一块内计算两行，可以只装载一次 B。')+
 p('只看 K 轴上 16 项的完整一段。两个普通线程块分别装入 16×16 的 A 和 B，共请求 1024 个 FP32 值。双行复用的一个线程块装入 32×16 的 A 和 16×16 的 B，共请求 768 个值，少 256 个值，即 1024 字节。这是从源码数出的装载量，缓存命中会改变实际显存流量。共享内存和寄存器也会变动，所以速度需要在同一设备上测。');
 a.sections[7][1]+=
 '<h3 id="same-device-gemm">同卡对照三种 GEMM</h3>'+
 p('先用同一参考逐项检查三个版本。设备验收程序会对五种形状的 8430 个结果逐项回读，其中 35×67×19 同时触发行、列和 K 轴的尾块。越界装载补零，屏障仍由整块线程到达，只有有效位置写回。')+
 trainingCode('按实验说明编译后，在同一张卡上验数值并计时','SHELL','./gemm_variants --validate > validate.json\n./gemm_variants --benchmark > benchmark.json')+
 p('计时固定 512×512×512、同一张卡、同一个流和同一组设备输入。三个版本分别预热，九组采样轮换先后顺序。每组用同流的两个 CUDA 事件圈住 20 次启动，除以 20 得到每次样本。分配、拷贝和校验放在计时外。用各组样本比较中位数和波动，再单独用 Nsight Compute 查访存与驻留。采集指标可能回放内核，所以它与计时分开运行。',
 '实验包保留实际编译与设备探测记录。设备数值回读、计时与计数器需在可用 NVIDIA GPU 上执行后填写。')+
 '<p class="practice-links"><a href="labs/gemm-variants.zip" download>下载三版本实验 ↓</a> · <a href="labs/gemm-variants/README.md">编译、复跑与 Nsight 步骤</a> · <a href="labs/gemm-variants/validation.json">编译与探测记录</a> · <a href="https://docs.nvidia.com/cuda/archive/12.9.1/cuda-runtime-api/group__CUDART__EVENT.html">CUDA 事件接口 ↗</a></p>';
})();
