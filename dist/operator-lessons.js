/* A concrete correctness-to-measurement path; CPU evidence is never labelled as a CUDA result. */
Object.assign(sources,{
 opCuda:['NVIDIA · CUDA编程模型','https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/programming-model.html'],
 opNcu:['NVIDIA · Nsight Compute指标与测量开销','https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html'],
 opProfiler:['PyTorch · Profiler使用说明','https://docs.pytorch.org/tutorials/recipes/recipes/profiler_recipe.html'],
 opTorchTiming:['PyTorch · CUDA异步执行与计时','https://docs.pytorch.org/docs/stable/notes/cuda.html#asynchronous-execution'],
 opFsum:['Python 3.12 · 浮点与高精度求和','https://docs.python.org/3.12/library/math.html#math.fsum'],
 opCtypes:['Python 3.12 · ctypes调用约定','https://docs.python.org/3.12/library/ctypes.html']
});
function operatorSource(file){return '<details class="full-code"><summary>展开完整源码 · '+file+'</summary>'+code(file,file.endsWith('.c')?'C':'PYTHON',operatorRoutingFiles[file])+'</details>';}
function operatorRun(file,anchor,command){return '<h3 id="'+anchor+'" class="walkthrough-run">运行 '+file+'</h3>'+code('解压完整包，在文件所在目录执行','BASH',command)+
 '<p><a href="/labs/operators-routing.zip" download>下载完整实验包 ↓</a> · <a href="/labs/operators-routing/'+file+'" download>下载源码 ↓</a> · <a href="/labs/operators-routing/validation.json">查看实际结果、版本与摘要 →</a></p>'+operatorSource(file);}
const operatorSections=[
 ['先写清算子的输入、输出与内存布局',
 para('算子是对输入数据执行一种明确计算的操作，例如矩阵乘法、求和或softmax。框架中的一行表达式可以调用一个或多个底层实现。内核（kernel）是执行这类计算的一段实现代码；CPU函数与GPU内核的执行方式不同，先把数学和数据契约写清，才知道优化有没有改错问题。',
 '张量用形状描述每条轴的长度，用数据类型描述每个元素怎样表示。本章的C程序使用float64，即每个数占8字节。矩阵按连续行主序存放：一行里的相邻列在内存中相邻。形状[M,K]的A，其A[i,t]位于i×K+t；不能只把二维下标写对，就默认任意切片或转置视图也具有相同布局。',
 '步长（stride）说明某条轴走一步要跨过多少元素或字节，必须注明单位。转置常能改变形状和步长而不复制数据；把这种视图的地址交给只接受连续数组的C函数，会读到错误元素。本章调用端创建连续数组，约定输入输出不重叠、尺寸与实际容量一致，分块大小为正；这些前提也是源码的一部分。')+
 table(['对象','本章契约','换条件时要重验'],[['softmax','按每行归一化，列数>0，输入均有限','轴、掩码、NaN/无穷与全掩码行'],['求和','固定float64输入，空和为0','累加顺序、溢出与误差容限'],['矩阵乘法','A[M,K]×B[K,N]→C[M,N]','布局、尾块、别名与累加精度']])],
 ['softmax为什么先减最大值',
 para('softmax把一行分数转换成和为1的非负权重。直接对大分数取指数，可能先溢出，再在归一化时得到无效值。对[1000,1001,1002]，Python的exp(1000)就超出了本例可表示范围；真正需要的是分数之间的相对差，而不是共同的巨大偏移。')+
 knowledgeFormula('减去同一个数，保持比例','pⱼ = exp(xⱼ − m) / Σₜ exp(xₜ − m)，m = maxₜ xₜ','分子分母共同乘了exp(−m)。有限输入下最大指数为exp(0)=1，可以避免这一类正向指数溢出；不代表所有数值问题都已消失。')+
 figure('v46-softmax-shift','实际C程序先做最大值归约，再算指数与分母，最后归一化。把整行加1000不应改变输出比例。')+
 para('本例减完最大值是[−2,−1,0]，输出约为[0.090031,0.244728,0.665241]。全零行得到三个1/3；输入整体平移后的两行逐项相等。很小的指数仍可能下溢成0，所以验证既看行和，也比较每个位置与独立参考值，不能只检查“总和等于1”。',
 'C程序在改写输出前检查所有输入；发现NaN或无穷就返回错误码，列数为0也拒绝。本章不支持注意力中的−∞掩码，更不能把“全掩码行”直接套进这份接口。要支持它，应先定义哪些位置有效、全无效时返回什么，再设计实现与测试。')+
 code('行归一化的核心 · 行地址与完整检查见源码','C','double maximum = row[0];\nfor (size_t j = 1; j < cols; ++j)\n    if (row[j] > maximum) maximum = row[j];\ndouble total = 0.0;\nfor (size_t j = 0; j < cols; ++j) {\n    y[j] = exp(row[j] - maximum);\n    total += y[j];\n}\nfor (size_t j = 0; j < cols; ++j) y[j] /= total;')],
 ['归约怎样把并行度与误差连在一起',
 para('归约是把一组输入合成一个结果，例如求和与最大值。顺序累加沿一条依赖链进行；树形归约先合并相邻元素，再合并部分结果。实数加法满足结合律，浮点加法每次都要舍入，换合并顺序可能改变结果。')+
 figure('v46-reduction-order','同一份float64输入，左折叠为1、这棵两两相加的树为0，高精度参考为2。实际C与Python对照；没有声称树形一定更准确。')+
 para('对[10¹⁶,1,−10¹⁶,1]，从左向右先把小数1舍掉，最后得到1；两两合并时，两边的小数都丢失，得到0。math.fsum在本例给出2。由此不能推出“并行求和总是错误”，也不能推出“树形总比顺序准确”。需要根据数据范围、累加精度和任务要求定义误差。',
 '常用逐项条件是|实际−参考|≤atol+rtol×|参考|，分别给绝对和相对误差留预算。接近0的值尤其依赖绝对容限。程序还验证5个元素之和15，以及空输入的和0；非2的幂长度必须保留尾项，不能只在4、8、16这些整齐输入上通过。GPU实现还要验证线程同步、越界与部分活跃线程。')],
 ['矩阵乘法：同一份数学，怎样改变访问顺序',
 para('矩阵乘法的一个输出C[i,j]，是A第i行与B第j列的点积。本实验首个小形状是[2,3]乘[3,4]。例如C[0,0]=(−1.25)×(−1.5)+0.5×1+(−0.5)×0=2.375。这个手算值与两个C实现、独立Python参考共同核对。')+
 figure('v46-gemm-access','先核对形状和同一输出，再看ijk沿B列跨步读取，与ikj在B/C行内连续访问的差别。图中的步长是逻辑元素距离，不是缓存未命中计数。')+
 para('最直接的ijk循环为每个输出沿K累加，B[t,j]在连续行主序中每次跨N个元素。把内部顺序改成ikj，可先取一个A[i,t]，再扫过B[t,:]与C[i,:]的连续列。分块进一步让一小片数据在更多计算中复用，减少工作集压力；本例还用边界条件处理5×7乘7×3、tile=4这种不整块尺寸。',
 '分块不是把循环包装成三层就自动变快。tile过小可能增加控制开销，过大可能失去局部性；编译器、向量化、缓存、形状和类型都会改变结果。真实BLAS库还有更多调度与打包优化，本章不把两份教学C函数与厂商库性能画等号。两个实现都按K的升序累加每个输出，但换dtype、编译选项或融合乘加仍需重新核对误差。')],
 ['先算工作量，再问瓶颈在哪里',
 para('FLOP表示一次浮点运算；本章按一次乘法加一次加法计2 FLOP。GEMM的常用工作量口径为2MKN。字节量另记：在理想复用、A/B各读一次且C只写一次的模型中，float64至少对应8(MK+KN+MN)字节。这个下界不包含缓存重复装载、元数据与调用开销。')+
 knowledgeFormula('96×96乘法的声明账','工作量 = 2×96³ = 1,769,472 FLOP；理想数据量 = 8×3×96² = 221,184 B；强度 = 8 FLOP/B','这是由形状推导的算术强度，不是CPU或GPU的实际内存流量。框架算子耗时、内存计数器和GPU带宽还需对应环境测量。')+
 para('Roofline模型用算术强度连接计算吞吐与内存带宽上界。它帮助提出“应该提高数据复用还是减少算术”的假设；小算子还可能主要受启动、分配或框架调度限制。看到GPU利用率或某一条总耗时，不能直接宣布是带宽瓶颈。需要固定输入与测量边界，再用时序和硬件指标排除其他原因。',
 'CUDA是NVIDIA的GPU编程平台。主机代码发起GPU内核，网格由线程块组成，块内线程参与相应计算；共享内存与同步有其可见范围。把一行分给一个块还要解决列数大于线程数、尾部掩码和归约同步。CPU的缓存局部性与GPU的合并访问有关联的目标，却不能用同一份CPU时间来证明GPU访问效率。')+
 '<p>'+linkTo('gpu-execution','先复习GPU线程、块与存储层次')+linkTo('roofline-model','继续推导带宽与算力上界')+'</p>'],
 ['计时为什么要分开预热、采样和观察开销',
 para('编译、数组分配、第一次初始化和实际计算是不同的工作。本例先编译并创建数组，两种GEMM各预热3次，再采7组、每组连续调用3次，以每次微秒数记录全部样本与中位数。ctypes调用开销仍包含在其中；输入、类型、编译参数和平台随报告保存。',
 '不能从一次最小值宣布优化成功。先检查两份结果一致，再看样本离散程度，必要时改变执行次序、重复整轮并控制其他负载。编译器向量化和频率变化都可能影响结果；源码改变后旧时间不能继续沿用。这里的时间只属于这台机器、这个形状和这组参数。',
 'GPU常异步执行：主机计时器围住发起调用，可能只量到排队工作。测端到端墙钟与测设备区间需要不同的同步或事件安排，多流还要解释依赖。额外同步也会破坏原来的重叠，所以应先说要测什么，再选择边界。正文与下载包只报告CPU实测，GPU与Nsight仍待目标硬件验证。')],
 ['用真实CPU profiler读一条执行链',
 para('Profiler记录程序执行的事件，帮助区分外层调用、内部算子和等待。程序用PyTorch CPU执行[32,64]×[64,32]的线性映射，再做逐行softmax与求和。固定一个CPU线程，先预热3次，再记录5次；命名区间lesson_linear、lesson_softmax、lesson_reduce在原始轨迹中共15条。')+
 figure('v46-cpu-profile','读取本次真实CPU轨迹的首轮三个命名区间，起点统一平移到0。宽度来自这次观察；记录形状、内存和验证步骤会带来开销，不作性能排名。')+
 para('inclusive_cpu_us包含该事件及其嵌套工作，self_cpu_us用于分开本事件自身与子事件；不能把父事件和所有子事件的总耗时再次相加。命名区间之间的空隙还可能有Python、验证与记录器工作，不应当作GPU空转。形状可用于解释同名算子为什么处理了不同工作量。',
 '若要研究GPU，先用系统级时序看CPU发起、拷贝、GPU计算与通信是否重叠，再针对具体内核用Nsight Compute查访存、占用和执行指标。采集器可能回放工作并产生额外开销；采集后的时间不能无条件当成无监控时的端到端表现。')+
 '<p><a href="/labs/operators-routing/cpu-trace.json" download>下载本次真实CPU Chrome Trace格式轨迹 ↓</a></p>'],
 ['运行完整程序，再用失败对照解释结果',
 para('第一条命令只需要Python标准库与本地C11编译器，实际生成临时动态库，结束后清理。第二条需要已有PyTorch；本次记录是2.5.1 CPU。两条实验独立，不把Python框架的小矩阵与C函数计时直接拿来比较。')+
 operatorRun('operator_lab.py','operator-cpu-run','python3 operator_lab.py --report operators-local.json')+operatorSource('cpu_ops.c')+
 operatorRun('cpu_profile.py','operator-profile-run','python3 cpu_profile.py --report cpu-profile-local.json --trace cpu-trace-local.json')+
 table(['先预测','独立判据','故意保留的反例'],[['减最大值的softmax','逐项参考、行和与平移性质','直接exp(1000)溢出'],['改变求和顺序','同一输入的1、0、2','不是逐位相等就能判断实现对错'],['分块矩阵乘法','非整块形状与每个输出','只测整齐方阵会漏掉尾块'],['CPU轨迹','5次×3区间及真实算子事件','不能把CPU时间写成GPU内核耗时']])],
 ['把面试问题落到契约、证据与下一步',
 table(['追问','应当说清楚'],[['怎么开始写一个算子','数学、轴、dtype、布局、边界与独立参考'],['softmax为什么减最大值','指数共同缩放保持比例；再说掩码和非有限输入契约'],['并行归约结果不同就是错吗','累加顺序、舍入、参考精度与容限'],['GEMM为什么分块','实际布局与复用路径，尾块和工作集；再看测量'],['怎样证明性能提高','固定工作量、验证正确、预热采样、说明计时范围和平台'],['还缺怎样的GPU证据','实际CUDA实现与正确性、目标设备轨迹、硬件指标及端到端对照']])+
 para('本章的出口是能读懂一个算子契约、写出CPU参考、解释数值反例并读一份真实轨迹。继续做CUDA/Triton专项时，保留同样的输入和判据，再增加并行边界与设备证据；不能只把“CPU”改成“GPU”，就把目标环境当成已完成。')+
 '<p>'+linkTo('flash-attention-io','用这套方法理解注意力为什么减少中间搬运')+linkTo('moe-routing','继续看路由怎样改变专家计算与数据分发')+'</p>']
];
articles.push({id:'operator-profiling',number:'A1.11',module:'model-foundations',title:'动手算子与性能分析：从数值正确到执行证据',level:'原理 + C代码 + CPU实测',minutes:45,edition:'算子入门',baseline:'Python 3.9+与C11编译器；Profiler记录使用PyTorch 2.5.1 CPU',
 tags:['softmax','归约','GEMM','Profiler'],desc:'从布局与数值契约开始，手写三类C算子，比较累加顺序、尾块和访问路径，再读真实CPU轨迹。GPU专项另按目标硬件验收。',intro:'写得快之前，先证明算的是同一件事。沿一份输入把数学、内存、实现、测量与证据接起来。',prereq:'先读向量矩阵、GPU执行与Roofline；不会写CUDA也能先完成本章CPU实验。',objectives:['写出轴、类型、布局与边界契约','用独立数值参考验证softmax、归约与矩阵乘法','区分工作量、实际时序与硬件性能结论'],sections:operatorSections,check:['减去最大值保留了什么，仍没有处理哪些输入？','浮点求和为什么可能得到1、0和2？','改变布局后，原来的C函数为什么可能不再适用？','Profiler总时间为什么不能逐层相加？'],exercise:['同样96³的GEMM，一份记录含编译与分配，另一份只记录预热后的函数调用。第二份更快，能否证明分块优化有效？','不能。先对齐形状、类型、数据与正确性，再统一测量边界、预热与采样，保存平台和编译参数。两份都测相同工作后，仍需看样本离散程度。CPU对照也不能推出GPU或BLAS的性能结论。'],related:['gpu-execution','roofline-model','flash-attention-io','moe-routing'],refs:['opCuda','opNcu','opProfiler','opTorchTiming','opFsum','opCtypes'],textbook:true,updated:'2026.11.07'});
