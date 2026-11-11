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
 p('对一个 [2,3] 的张量逐行求和，会得到两个数。这个“逐行求和”是算子，负责规定怎么算。CPU 可以用一个循环求完一行，GPU 可以让几个线程分担同一行再合并。实际执行计算的底层程序叫内核（kernel）。框架中的一行表达式也可能调用多个内核。',
 '形状 [2,3] 表示两行三列。若采用连续行主序，内存先放第一行三项，再放第二行三项。从 A[0,0] 到 A[1,0] 跨 3 个元素，行步长就是 3。若用每项 4 字节的 float32，这一步跨 12 字节。转置后的视图可以只改步长；本章的内核接收连续数组。',
 '本章用 C 在 CPU 上算 float64（每项 8 字节），再用 NVIDIA 的 CUDA 在 GPU 上实现 float32 版（每项 4 字节）。各自用固定输入校验输出。后面比较时间时，要用同一设备、形状和类型。')+
 table(['算子','本章 CUDA 输入与输出','接口前提'],[
  ['逐行求和','[R,C] → [R]','R、C 为正；每行归约成一个数'],
  ['逐行 softmax','[R,C] → [R,C]','每行归一化，输入有限，不含掩码'],
  ['矩阵乘法 GEMM','[M,K]×[K,N] → [M,N]','尺寸为正、行主序、输入输出不重叠']
 ])+p('空输入、掩码、非有限数和不连续视图都需要另订契约。CPU 求和程序还测试空和为 0，CUDA 这份接口则明确要求正尺寸。每一种实现都按自己的契约验证，不能把另一份接口支持的输入直接搬过来。'),

 p('softmax 把一行分数变成非负、和为 1 的权重。直接计算 exp(1000) 可能溢出；真正需要的是分数的相对差。减去同一最大值，不改变指数之间的比例：')+
 knowledgeFormula('稳定 softmax','m=maxⱼ xⱼ；pⱼ=exp(xⱼ−m) / Σₜ exp(xₜ−m)','分子分母共同乘 exp(−m)；有限输入的最大指数变成 1。')+keep(old[1])+
 p('CPU 例子的 [1000,1001,1002] 减后为 [−2,−1,0]，结果约为 [0.090031,0.244728,0.665241]。三个全零分数则各占 1/3。很小的指数仍可能下溢成 0；仅检查行和为 1 还不够，错放位置也可能通过行和检查，必须逐项比较参考值。',
 '原 C 实现先检查输入，再计算最大值、指数和分母，最后归一化。它拒绝 NaN、无穷和零列；不支持注意力中的 −∞ 掩码。下面保留这段核心代码，完整输入检查在第 8 节：')+
 (old[1].match(/<div class="code-block">[\s\S]*?<\/pre><\/div>/)?.[0]||'')+
 p('把这条公式放到设备上，先让一个线程算一行，再让一组线程合算。<a href="/article/operator-profiling/#native-metal-softmax">看 Apple GPU 怎样验证两版 softmax →</a>'),

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

 p('代码用 <code>lesson_linear</code> 圈住 <code>x @ w</code>，相乘的张量形状是 [32,64] 和 [64,32]。在 CPU 轨迹里展开这个区间，可以看到里面的 <code>aten::matmul</code>。Profiler（性能分析器）把外层区间和内层算子都记了下来。')+keep(old[6])+
 p('5 次 <code>lesson_linear</code> 一共是 365.626 µs（<code>inclusive_cpu_us</code>），其中 104.375 µs 已经算在它里面，是内层 <code>aten::matmul</code> 的总时间。扣掉内层事件，外层自身是 261.251 µs（<code>self_cpu_us</code>）。相加会把矩阵乘法多算一遍。',
 '原程序用 1 个 CPU 线程，预热 3 次后记录 5 次。每次给矩阵乘法、逐行 softmax 和求和各加一个标签，轨迹里共 15 个这样的区间。这些数字含记录开销，适合练习读事件，单独计时请用上一节的方法。')+
 '<p><a href="/labs/operators-routing/cpu-trace.json" download>下载本次真实CPU Chrome Trace格式轨迹 ↓</a></p>'+
 fold('目标 GPU 选做：把一条真实内核接到 Nsight',
 p('先完成下一节全部正确性测试，再使用 --profile-gemm 选择单个 512×512×512 乘法。这个开关仅保留一个较大 GEMM，不是 13 组验收。Nsight Systems 用来看主机发起、拷贝与设备计算的时序；Nsight Compute 用于选定内核的访存、占用和指令等指标。采集可能回放工作并增加开销。')+
 code('在具备兼容 GPU、驱动和 Nsight 工具的 Linux 环境执行','BASH',
 'nsys profile --trace=cuda --output=gemm-timeline ./build/cuda_lab --profile-gemm\nncu --kernel-name-base function --kernel-name tiled_matmul_kernel \\\n  --set basic --export gemm-kernel ./build/cuda_lab --profile-gemm')+
 p('先解释轨迹里的分配、拷贝和计算边界，再读具体指标。上述 CUDA 命令是待执行方法，设备加速比与 Nsight 结果需实测后记录。')),

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

 a.sections[6][1]+=
 '<h3 id="torch-compile-graph-break">一行 .item() 怎样切开计算图</h3>'+
 code('触发断图的函数','PYTHON',
 'def python_branch(x):\n    shifted = x + 1\n    if shifted.sum().item() > 0:\n        return shifted * 2\n    return shifted - 2')+
 p('给它输入 <code>[-1, 1, 2]</code>，输出是 <code>[0, 4, 6]</code>。用 <code>torch.compile</code> 运行，输出一样，用来记录运算的后端却收到了两张图。第一张图只有加法和求和，第二张图只有乘法。分界就在第三行。')+
 p('TorchDynamo 是 <code>torch.compile</code> 里负责记录运算的一层。它把张量运算和数据依赖记成计算图，交给后端。本次实验关闭了标量捕获。<code>shifted.sum()</code> 能记下来，<code>.item()</code> 把结果取成 Python 数值 <code>5.0</code> 时，记录停下。Python 接着判断 <code>5.0 &gt; 0</code>，Dynamo 再把选中的乘法记成第二张图。这种从函数中间切开、稍后再继续记录的情况叫断图（graph break）。')+
 p('本实验的后端只记录收到的运算，再执行它们。设 <code>fullgraph=True</code>，要求整个函数放进一张图。同一个输入会在 <code>Tensor.item</code> 报错，后端一张图也收不到。')+
 p('本例只需在两个张量结果里选一个。让比较留在张量里，用 <code>torch.where</code> 根据条件选择结果。')+
 code('用两行张量运算替换函数体','PYTHON',
 'shifted = x + 1\nreturn torch.where(shifted.sum() > 0, shifted * 2, shifted - 2)')+
 trainingFigure('torch-compile-graph-break','同一个正例，.item() 写法先记加法和求和，再记乘法。where 把这些运算和选择一起记进一张图。')+
 p('传给 <code>where</code> 的两边会先求值。本例只是多算一条简单表达式。若分支要写文件、改状态，或只有在特定输入下才有效，得保留只执行一边的语义。')+
 table(['输入','加 1 后求和','两种写法的输出'],[
  ['[−1,1,2]','5，乘 2','[0,4,6]'],
  ['[−4,−2,0]','−3，减 2','[−5,−3,−1]'],
  ['[−2,−1,0]','0，减 2','[−3,−2,−1]']
 ])+
 p('按表中顺序跑三组，再跑一次正例。Python 写法各新增 2、1、1、0 张图。张量写法四次共用第一次捕获的图，里面依次有 add、sum、gt、mul、sub、where。两种写法的输出都和手算一致。')+
 fold('换输入再跑：旧图为什么不能用？',
 p('Dynamo 会检查旧图能否用于这次输入，检查的条件叫守卫（guard）。在 Python 写法里，和为 −3 的输入不满足正例留下的 <code>== 5.0</code>，零也不满足 <code>== −3.0</code>。负数和零都执行减法，但实验中各自捕获了一张新图。再输入正例时，原来的两张图都能用。',
 '张量版固定 <code>dynamic=False</code> 后，输入从长度 3 换成 4，记录里写的是 <code>expected 3, actual 4</code>。这次仍可捕获一张完整图，只是为新长度编译了一次。再换回长度 3，就会用回原来的图。断图发生在一次调用中间，重编译发生在旧图的复用条件被打破时。'))+
 '<p class="practice-links"><a href="/labs/torch-compile-graph.zip" download>下载源码与记录 ↓</a> · <a href="/labs/torch-compile-graph/validation.json">查看捕获的图和对照结果</a></p>'+
 p('按包内说明安装 PyTorch 2.5.1，再运行 <code>python -B compile_graph.py --write-record replay.json</code>。<code>new_graph_ids</code> 是本次新增的图，<code>executed_graph_ids</code> 是这次真正走过的图。再跑正例时，前者为空，后者仍是两张。')+
 fold('选做：看看后端生成了什么',
 p('有 C++ 编译器和 OpenMP 运行库时，可在命令后加 <code>--inductor</code>，让 TorchInductor 把张量图编译成 CPU 程序。本站的 CPU 记录包含一份 C++ 源文件及其动态库，四次输出均通过逐项比较。框架的两个计数分别是 2 个生成内核、1 个生成的 C++ 向量化内核。图数和内核数记的是不同对象。要判断提速多少，需另外计时。'))+
 '<p class="source-at"><a href="https://docs.pytorch.org/docs/stable/user_guide/torch_compiler/compile/programming_model.graph_breaks_index.html">PyTorch 断图与严格捕获 ↗</a></p>';
 a.updated='2026.11.11';

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

 a.sections[7][1]+=
 '<h3 id="native-metal-gemm">在 Apple GPU 上实测分块矩阵乘法</h3>'+
 p('取 A[35,19] 和 B[19,67]。输出 C[35,67] 的每一项都把 A 的一行和 B 的一列做点积，要相乘再相加 19 项。朴素版每个线程自己去读这 19 对数。分块版让 16×16 个线程组成一组，合作把 A、B 的小块搬到组内共享的内存，每个线程仍只算一个输出。两个小块各有 256 个 FP32 元素，每项 4 字节，一共占 2048 字节。')+
 trainingFigure('metal-gemm','输出分成 3 行 × 5 列块。右下角只有 3×3 个有效输出。K 轴最后一段只有 3 项，其余 13 项在组内补零。')+
 p('同一组线程先装前 16 项，再装剩下 3 项。越界的输入位置填零，越界的输出位置跳过写回。即使某个线程负责的输出无效，它也要参加装载和同步。例如，右下角输出块里只有前三列有效，但 A 的小块还需要第 4 到第 16 列的线程搬入数据。')+
 trainingCode('分块内核的装载、乘加与写回','METAL',[
  'for (uint base = 0; base < shape.k; base += TILE) {',
  '    const uint ak = base + lane.x, bk = base + lane.y;',
  '    a_tile[lane.y][lane.x] = row < shape.m && ak < shape.k ? a[row * shape.k + ak] : 0.0f;',
  '    b_tile[lane.y][lane.x] = bk < shape.k && col < shape.n ? b[bk * shape.n + col] : 0.0f;',
  '    threadgroup_barrier(mem_flags::mem_threadgroup);',
  '    for (uint k = 0; k < TILE; ++k) {',
  '        sum += a_tile[lane.y][k] * b_tile[k][lane.x];',
  '    }',
  '    threadgroup_barrier(mem_flags::mem_threadgroup);',
  '}',
  'if (row < shape.m && col < shape.n) c[row * shape.n + col] = sum;'
 ].join('\n'))+
 p('第一道屏障等全组写完小块再读，第二道等全组读完再覆盖。如果用最后的写回条件让无效线程在循环前退出，有些输入就没人搬了，退出的线程也无法参加同步。')+
 '<h4>先检查边界，再计时</h4>'+
 p('在 Apple Silicon Mac 上解压，进入 <code>metal-gemm</code> 目录后运行 <code>swift -O metal_gemm.swift &gt; replay.json</code>。程序用 Metal 编译并提交两个内核，先用 CPU 双精度参考逐项验数值。每个版本核对六种形状的 266,860 项输出，每份输出末尾另放 8 个用来检查越界写的标记值 −777。两版输出都与参考完全相等，标记值都未被改写。')+
 p('计时固定在同一张 Apple M4 Pro 上计算 512×512×512，每次只提交一个内核。两版各预热三次，正式跑九对样本，轮流谁先运行。每次取 GPU 命令缓冲区的结束时间减开始时间，分配、编译和校验都在计时外。')+
 table(['实现','组内共享内存','GPU 时间中位数'],[['朴素版','0 字节','1892.083 μs'],['分块版','2048 字节','1170.667 μs']])+
 p('逐对用朴素版时间除以分块版时间，九个比值的中位数约为 1.60。复跑时可对照自己的九对数据，绝对用时会波动。这组结果只对应这台设备和这个形状。分块改变了数据复用，也增加了同步，仅凭耗时无法推断实际显存流量。')+
 '<p class="practice-links"><a href="labs/metal-gemm.zip" download>下载源码与复跑脚本 ↓</a> · <a href="labs/metal-gemm/kernels.metal">查看完整内核 →</a> · <a href="labs/metal-gemm/validation.json">查看逐项校验与九对原始计时 →</a></p>'+
 '<p class="source-at"><a href="https://developer.apple.com/documentation/metal/mtlcommandbuffer/gpustarttime">Apple Metal 的 GPU 时间戳 ↗</a> · <a href="https://triton-lang.org/main/getting-started/tutorials/03-matrix-multiplication.html">Triton 官方分块矩阵乘法教程 ↗</a></p>';

 a.sections[7][1]+=
 '<h3 id="native-python-extension">从 C 源码到 import，哪一步出了错</h3>'+
 p('前面的 CPU 实验用 ctypes 调用普通 C 动态库。本例把同一个三项点积包成可直接 import 的 CPython 扩展。C 源码先编译成目标文件 .o，再链接成扩展文件。扩展把两个三元素序列转成 double 数组，交给同目录的点积库计算，再把结果转回 Python 浮点数。')+
 trainingFigure('python-extension-loader','从编译、链接、搜索扩展到装载依赖和查找入口。补回点积动态库后，同一扩展给出 2.375 和 5.0。')+
 table(['停在哪一步','实验只改变这一项','先检查什么'],[
  ['编译源码','省去 Python 头文件目录，编译器找不到 Python.h','编译命令中的 <code>-I</code> 和当前解释器的头文件目录'],
  ['链接扩展','保留目标文件和 Python 库，省去点积库，链接器找不到 <code>_infraguide_rowdot3</code>','链接输入中是否有提供该符号的库'],
  ['查找文件','扩展只改文件名，后缀不匹配，报 <code>ModuleNotFoundError</code>','当前解释器的搜索目录与 <code>EXTENSION_SUFFIXES</code>'],
  ['装载依赖','扩展文件名正确，旁边的点积动态库缺失，dyld 报 <code>Library not loaded</code>','用 <code>otool -L</code> 查看依赖名，再核对 <code>@rpath</code> 的搜索位置'],
  ['查找初始化函数','文件和依赖都在，扩展却导出 <code>PyInit_other</code>','用 <code>nm -gU</code> 查导出。<code>import infra_rowdot</code> 要求 <code>PyInit_infra_rowdot</code>']
 ])+
 p('在这台 macOS arm64 机器上，CPython 3.12 通过 <code>sysconfig</code> 给出 <code>.cpython-312-darwin.so</code>。文件名改成 <code>infra_rowdot.foreign-fixture.so</code> 后，同样的二进制在搜索阶段就被略过。正确命名的文件被找到后，dyld 还要按依赖名找库。这里把 <code>@loader_path</code> 写进运行时搜索路径，展开后就是扩展所在目录。',
 '补回同一动态库后，扩展的 SHA-256 没变。调用 <code>dot3</code>，前面 GEMM 例子的一项再次得到 (−1.25)×(−1.5)+0.5×1+(−0.5)×0＝2.375，另一组得到 5.0。两元素输入报 <code>TypeError</code>。每次导入都在新进程中测试，以便直接观察这次的文件搜索和装载。',
 '在具备开发头文件和共享 Python 库的 macOS arm64 上解压后，运行 <code>python3.12 -B extension_loader.py &gt; replay.json</code>。结果记录编译器、链接器和导入器的实际诊断。实测范围为 CPython 扩展和 CPU 数值。')+
 '<p class="practice-links"><a href="labs/python-extension-loader.zip" download>下载 C 源码与复跑脚本 ↓</a> · <a href="labs/python-extension-loader/README.md">查看运行说明 →</a> · <a href="labs/python-extension-loader/validation.json">查看原始故障与恢复记录 →</a></p>'+
 '<p class="source-at"><a href="https://docs.python.org/3.12/extending/building.html">CPython 扩展的构建与初始化 ↗</a> · <a href="https://docs.python.org/3.12/library/importlib.html#importlib.machinery.EXTENSION_SUFFIXES">Python 识别的扩展后缀 ↗</a> · <a href="https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/DynamicLibraries/100-Articles/RunpathDependentLibraries.html">Apple 动态库搜索路径 ↗</a></p>';

 a.sections[7][1]+=
 '<h3 id="triton-tail-mask-run">Triton 尾块：掩码挡住读写，填充值决定归约</h3>'+
 p('前面用 CUDA 指定每个线程处理哪些数据。Triton 用程序实例描述一块数据上的计算。本例让一个实例处理一行。行长是 5，计算块宽度取 8。三个超出行长的计算位置叫尾块中的无效位置。掩码 <code>col &lt; width</code> 为每个位置给出一个真假值，读写只对为真的位置生效。'+
 ' 归约会把计算块里的多个值合为一个值。求最大值和求和都覆盖这 8 个位置，所以还要给三个无效位置填值。')+
 trainingFigure('triton-tail-mask','行长为 5、块宽为 8。掩码保护读写，填充值控制三个无效位置是否改变 softmax 分母。')+
 p('softmax 先减去整行最大值，再取指数，最后除以指数和。无效位置填负无穷时，有限的有效分数决定最大值。负无穷减去这个最大值仍是负无穷，取指数得到 0。写回时再用同一掩码，保留前五项。')+
 table(['内核代码','这一步的作用'],[
  ['<code>col = tl.arange(0, BLOCK)</code>','生成 0 到 7 的列号，行首偏移由行号乘步长得到'],
  ['<code>tl.load(inputs + offset, mask=valid, other=PAD)</code>','从有效列读入，其他位置使用指定的填充值'],
  ['<code>maximum = tl.max(values, axis=0)</code>','取得计算块的最大分数，供每项指数共用'],
  ['<code>normalizer = tl.sum(exponentials, axis=0)</code>','把整个计算块的指数加起来'],
  ['<code>tl.store(outputs + offset, exponentials / normalizer, mask=valid)</code>','归一化后只写入有效列']
 ])+
 p('把第一行设为 −ln 2、−2 ln 2，直到 −5 ln 2。不减最大值时，五项指数是 1/2、1/4、1/8、1/16、1/32，和为 31/32，所以第一项概率是 16/31。保持读写掩码，只将填充值从负无穷改为 0，便多加三个 exp(0)。分母变成 127/32，第一项概率变成 16/127。最终写回的五项加起来只有 31/127。减最大值会对分子分母乘同一因子，结果保持相同。')+
 p('解压实验包，在 Linux x86_64 的 Python 3.12 虚拟环境内安装 <code>requirements-linux.txt</code>，再执行 <code>TRITON_INTERPRET=1 python -B triton_tail_mask.py &gt; replay.json</code>。实验用 NumPy float64 独立计算参考值，逐项核对 5、8、33 列两种填法的输出。8 列恰好用满计算块，两种填法的结果完全一样。另一行从 1000 递减，核对减最大值能避开指数溢出。有效列之外的输出一直是 −777，即使填零把分母算错，写回检查也能通过。')+
 '<p class="practice-links"><a href="labs/triton-tail-mask.zip" download>下载 Triton 实验包 ↓</a> · <a href="labs/triton-tail-mask/triton_tail_mask.py" download>查看完整内核和对照脚本 ↓</a> · <a href="labs/triton-tail-mask/README.md">安装与复跑说明 →</a> · <a href="labs/triton-tail-mask/validation.json">查看逐项执行记录 →</a></p>'+
 p('执行记录来自 Triton 3.3.1 官方 CPU 解释器。它顺序运行各实例，核对掩码、填充和归约语义。编译、GPU 访存安全和计时需要目标设备上的证据。理解这个分母后，可接着看 '+linkTo('flash-attention-io','分块注意力怎样跨块合并最大值与指数和')+'。')+
 '<p class="source-at"><a href="https://triton-lang.org/main/programming-guide/chapter-3/debugging.html">Triton 解释器 ↗</a> · <a href="https://triton-lang.org/main/getting-started/tutorials/02-fused-softmax.html">Triton 官方 softmax 教程 ↗</a></p>';

 a.sections[7][1]+=
 '<h3 id="native-metal-softmax">一行 Softmax，怎样由 64 个 GPU 线程合算</h3>'+
 p('回到第 2 节的稳定公式。两版都要找一行的最大值，再求指数和，最后逐列写出概率。第一版一个线程包办一整行。第二版 64 个线程组成一组，按列号分工。宽度 65 时，线程 0 读第 0 和第 64 列，其他线程各读一列。宽度 31 时，剩余线程仍参加同步，求最大值用负无穷作初值，求和用 0。')+
 trainingFigure('metal-softmax-reduction','同一行的最大值和指数和分别保存在两个共享数组，写回时每个线程仍处理原来的列。')+
 trainingCode('Metal 内核节选 · 在同一组里合并最大值','METAL',[
  'maxima[lane] = local_max;',
  'threadgroup_barrier(mem_flags::mem_threadgroup);',
  'for (uint step = lanes / 2; step > 0; step /= 2) {',
  '    if (lane < step) maxima[lane] = max(maxima[lane], maxima[lane + step]);',
  '    threadgroup_barrier(mem_flags::mem_threadgroup);',
  '}',
  'const float maximum = maxima[0];'
 ].join('\n'))+
 p('第一轮由前 32 个线程各合并两项，随后减半，直到 <code>maxima[0]</code> 保存全行最大值。屏障等全组完成这一轮写入。指数和也逐轮合并，使用另一个数组 <code>sums</code>，这样读最大值时不会被下一阶段覆盖。两个数组各占 64×4 字节。')+
 p('两版在 Apple M4 Pro 上各逐项核对 1,118,062 个概率，并用 CPU 双精度结果独立验证。最大逐项误差小于 7×10⁻⁸，输出后的八个 −777 均未改变。另用同一 GPU 对 [512,512,512] 直接取指数而不减最大值，得到 3 个非有限输出。稳定版在同样的平坦行上得到约 1/3。')+
 table(['相同输入形状','每线程一行 · μs','每组一行 · μs'],[
  ['1024×64','76.42（76.00–77.46）','32.54（32.38–241.79）'],
  ['1024×1025','578.75（538.50–2322.25）','29.04（28.75–124.46）']
 ])+
 p('每格是九次设备时间的中位数，括号内是最小值和最大值。两版共用输入和队列，预热后轮换先后。每个 Metal 命令缓冲区只派发一次，完成后才读 GPU 时间戳。短行的两个用时范围有重叠，长行在这批样本中分开。比较时在同一行内对照。同步、调度和实际内存流量需要不同的测量来区分。')+
 p('解压后进入 <code>metal-softmax</code> 目录，运行 <code>swift -O metal_softmax.swift &gt; replay.json</code>。先看 <code>validation</code> 与溢出对照，再用 <code>benchmarks</code> 的原始样本复算中位数。实验覆盖 Apple Metal 上的连续有限 FP32 数据。注意力掩码、CUDA 与端到端时延各有单独的验证条件。')+
 '<p class="practice-links"><a href="labs/metal-softmax.zip" download>下载实验包 ↓</a> · <a href="labs/metal-softmax/kernels.metal">完整内核 →</a> · <a href="labs/metal-softmax/validation.json">GPU 回读与原始计时 →</a></p>'+
 '<p class="source-at"><a href="https://developer.apple.com/documentation/metal/creating-threads-and-threadgroups">Apple Metal 线程组 ↗</a> · <a href="https://developer.apple.com/documentation/metal/mtlcommandbuffer/gpustarttime">GPU 时间戳 ↗</a></p>'+
 p('下一步用真实推理请求定位同类运算。llama.cpp 使用自己的 Metal 内核，注意力中的 Softmax 节点叫 <code>kq_soft_max-0</code>。沿一条请求看它出现在哪几轮，再核对最终输出。<a href="/article/model-serving/#native-metal-inference">从 GPU 算子走到真实推理请求 →</a>');
})();
