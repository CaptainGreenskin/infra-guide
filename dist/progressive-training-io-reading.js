/* Read the participants and input objects before waits, capacity and recovery.
   Load after the progressive/bridge lessons and before first-reading-flow.js. */
(()=>{
 const p=(...rows)=>rows.map(row=>'<p>'+row+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const anchor=id=>'<span class="legacy-subsection-anchor" id="'+id+'" aria-hidden="true"></span>';
 const t=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="full-code"><summary>'+title+'</summary>'+body+'</details>';
 const blocks=html=>[...html.matchAll(/<div class="code-block">[\s\S]*?<\/pre><\/div>/g)].map(m=>m[0]);
 const figures=html=>html.match(/<figure\b[\s\S]*?<\/figure>/g)||[];
 const downloads=html=>[...html.matchAll(/<p class="practice-links">[\s\S]*?<\/p>/g)].map(m=>m[0]);
 const source=(url,label)=>'<p><a href="'+url+'" target="_blank" rel="noopener">'+label+' ↗</a></p>';
 const select=(id,titles)=>{
  const a=articles.find(x=>x.id===id);
  if(!a||a.sections.length!==titles.length||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Progressive training IO source changed: '+id);
  return a;
 };
 const replace=(a,bodies,ids,desc)=>{
  const before=a.sections.map(s=>s[1]).join(''),after=bodies.join('');
  const pre=html=>html.match(/<pre\b[\s\S]*?<\/pre>/g)||[];
  if(bodies.length!==a.sections.length)throw Error('Training IO section count changed: '+a.id);
  if(JSON.stringify(pre(before))!==JSON.stringify(pre(after)))throw Error('Training IO original code changed: '+a.id);
  if(JSON.stringify(figures(before).slice().sort())!==JSON.stringify(figures(after).slice().sort()))throw Error('Training IO original figure changed: '+a.id);
  for(const m of before.matchAll(/\bid=["']([^"']+)["']/g))if(!after.includes('id="'+m[1]+'"')&&!after.includes("id='"+m[1]+"'"))throw Error('Training IO anchor lost: '+m[1]);
  for(const id of ids)if(!after.includes('id="'+id+'"'))throw Error('Training IO published heading lost: '+id);
  const hrefs=[...after.matchAll(/\bhref=["']([^"']+)["']/g)].map(m=>m[1]);
  for(const m of before.matchAll(/\bhref=["']([^"']+)["']/g))if(!hrefs.includes(m[1]))throw Error('Training IO source URL lost: '+m[1]);
  bodies.forEach((body,i)=>a.sections[i][1]=body);
  a.desc=desc;a.intro=desc;a.updated='2026.11.08';
 };

 const comm=select('training-communication',['参与与布局：进程组、rank和操作结果','数值正确性：分片、变长与全局分母','调用契约：顺序、操作、shape与dtype','等待含义：异步句柄与慢rank到达','计算重叠：桶就绪和暴露的通信尾部','量级估算：环形字节账与带宽单位','分层诊断：会合、数值、规模与完整训练','实战与变化题：真实Gloo数值和协议反例']);
 const c=comm.sections.map(s=>s[1]),c1=blocks(c[1]),c3=blocks(c[3]),c7=blocks(c[7]);
 if(c1.length!==1||c3.length!==1||c7.length!==2||downloads(c[7]).length!==1)throw Error('Collective source block layout changed');
 const ci=['subsection-1-yhnylp','subsection-2-1xgbpee','subsection-3-12u9vvw','subsection-4-9tsq35','subsection-5-1l82yca','subsection-6-pn22ky','subsection-7-1apl07f','subsection-8-g1wiy8'];
 replace(comm,[
 '<div class="mechanism-core" id="collective-members-layout">'+anchor(ci[0])+
 p('上一章的训练循环由多个进程各自执行。进程有自己的模型状态、输入和执行进度；某一时刻需要交换梯度时，它们共同调用集合通信。集合通信的“集合”指参加这一次操作的一组进程。一次集合操作由参与成员、各成员的输入和约定的输出共同确定。',
 '分布式作业先建立默认进程组。world_size 是这个组的进程数，global rank 是进程在默认组中的编号，从 0 开始。local rank 是一台主机内的进程编号，设备编号用于选择当前进程使用的设备；在常见的一进程一卡配置中，启动程序会建立它们的映射。映射需要由程序明确设置，rank 这个数字本身不会替进程选好 GPU。')+
 t(['概念','描述的对象','本章怎样使用'],[['进程','独立执行训练或实验的程序实例','本机启动两个 CPU 进程'],['rank','某个进程组内的成员编号','默认组中的 rank 0、rank 1'],['进程组','本次通信的成员集合及通信上下文','两人组中的两者都参加相应操作'],['后端 backend','实现通信的运行库','程序实际使用 CPU/Gloo；GPU 集合通信常用 NCCL']])+
 p('先用同样的输入比较几种操作：rank 0 持有 [1,2,3,4]，rank 1 持有 [10,20,30,40]。下面每一行都是独立算例，重新从这两份输入开始。shape 表示张量的形状，本例输入都是一维、4 个元素；dtype 表示每个元素的数值类型。SUM 表示逐位置相加。')+
 t(['独立操作','rank 0 的输出','rank 1 的输出'],[['Broadcast，根为本组 rank 0','[1,2,3,4]','[1,2,3,4]'],['Reduce SUM，根为本组 rank 0','[11,22,33,44]','该接口不承诺在非根保留最终和'],['AllReduce SUM','[11,22,33,44]','[11,22,33,44]'],['AllGather，按本组 rank 收齐','[1,2,3,4,10,20,30,40]','同一份 8 元素结果'],['ReduceScatter SUM，等分两片','[11,22]','[33,44]']])+
 p('AllReduce 的输出与输入形状相同；AllGather 在这里使每个进程收齐两份输入；ReduceScatter 则让每个进程只保留归约后的一片。SUM 本身不除以进程数。默认 DDP 的梯度同步具有组内平均的语义，这是训练封装所做的处理，不能把所有 AllReduce SUM 都读成“平均梯度”。自定义通信钩子时还要重新核对实际归一化。')+p('进程组也可以只包含作业的一部分成员。另设一个有 8 个进程的作业：全局 rank 2 和 6 组成两人组，按本例成员顺序，它们在子组中的编号是 0 和 1。子组内的 AllGather 按组内编号排列输出，ReduceScatter 也按这个编号分片。因此，读张量的第几片时，要先知道它属于哪个组、该组怎样映射全局成员。')+'</div>'+
 fold('子组建立与根编号的接口约定',p('本章使用的 PyTorch 2.5.1 中，按默认 new_group 方式建组时，默认组的所有进程都应进入建组调用，即使某进程不是新组成员；各进程按相同顺序建组。后续子组集合操作只由该组成员参加。use_local_synchronization=True 是有额外条件的选项，不能据此随意改变重叠子组的建立顺序。',
 '上表的根编号描述操作语义。写具体调用时要再看参数定义：原生 NCCL 的 root 使用通信器内的 rank；PyTorch 2.5.1 的 dist.broadcast(..., src=2, group=subgroup) 中，src 使用全局 rank。若本例子组由全局 2、6 构成，选择第一个成员作根时传 src=2，不能直接传子组编号 0。')+source('https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/distributed_c10d.py','PyTorch 2.5.1：new_group、broadcast 与 rank 映射')),

 anchor(ci[1])+
 p('现在沿实际数值走一遍。rank 0、rank 1 分别把上一节的输入交给 AllReduce SUM：第一个位置是 1+10=11，第二个是 2+20=22，余下得到 33、44。操作完成后，两者都保存完整的 [11,22,33,44]。如果另从原输入做 ReduceScatter SUM，两个 rank 分别得到前半 [11,22] 和后半 [33,44]；再把这两片 AllGather，便重新得到完整的和。')+
 figures(c[1]).join('')+
 p('图中的中间和用来说明数学结果，并不表示真实实现先把所有输入送到 rank 0。AllReduce 规定“结果是什么”，后端再选择怎样传输。ReduceScatter 加 AllGather 可以构成相同结果，但两次独立调用和一次融合的 AllReduce 可能有不同调度与开销。末节程序实际尝试 reduce_scatter_tensor；记录中的 supported_here=true 只说明所记录的 PyTorch/Gloo 组合支持这个接口。',
 '接着换一组独立输入，研究长度不同的记录：rank 0 有 [2,4,6]，rank 1 只有 [20]。要计算所有真实元素的平均值，先得到总和 32，再除以真实元素数 4，结果为 8。两个 rank 各算均值，得到 4 与 20，再把它们等权平均会得到 12；这种做法给只有一个元素的 rank 与有三个元素的 rank 相同权重，已经改变了问题。',
 '通信还需要接收方知道各片长度。本例先用定长的单元素整数张量交换长度 [3,1]，把数据补到共同长度 3，再收齐两份张量。rank 1 的传输缓冲是 [20,0,0]，后两个 0 只是占位；收齐后按原长度取回 [2,4,6] 与 [20]。下面片段把本 rank 的输入记为 local_values，world_size 是成员数，lengths 收集各成员的长度。')+c1[0]+
 p('补齐把传输形状变成规则的形状，并没有增加两条真实记录。若将填充值也计入分母，就会算成 32/6≈5.3333。实际程序另外归约本地 sum 与有效 count，因此均值的含义由真实数据决定。只需要总均值时，可以直接汇总这些统计量；这里收齐值是为了逐项展示和检查。',
 '训练里的有效 label 数也有同样的分母问题。不同 rank 的有效预测目标数量不同，应先定义全局训练目标，再接回 DDP 的默认平均行为。某个 rank 没有目标时，可贡献 sum=0、count=0；全组 count=0 时，所有成员还要按共同规则处理。单独求空张量均值会引入 NaN，单独跳过通信会改变成员调用顺序。',
 '固定整数例子在 float64 中能够精确表示，程序因而使用精确断言。一般浮点归约受加法顺序影响，换算法或规模后可能出现末位差异；比较真实模型时要按任务约定数值误差范围。')+
 linkTo('distributed-training','把全局分母接回分布式梯度')+linkTo('data-pipeline','继续看有效目标怎样从数据产生'),

 '<div class="mechanism-core" id="collective-signature-order">'+anchor(ci[2])+
 p('正常的一次集合操作可以按四个问题检查：谁参加，做什么，张量怎样解释，排在第几次。两人组中的 AllReduce 需要两人都调用；它们在同一个逻辑位置选择相同操作和归约方式，并提供接口要求的兼容 dtype、元素数量与形状。对于 AllGather、ReduceScatter，还要把发送片与接收片的布局对应起来。',
 '调用顺序把各进程各自执行的代码连接起来。例如先归约梯度，再归约计数，所有成员都按这个顺序执行，前一次才能和前一次配对。rank 0 的第七次调用若是 AllReduce，而 rank 1 的第七次是 Broadcast，即使两边都传 float32[2]，也无法形成所需的同一个操作。只看代码中都出现了“通信函数”还不够。',
 '分支也需要维持这种共同顺序。例如某个 rank 发现一个坏样本，若业务规则要求整组跳过本轮，可以在各成员仍正常运行的共同阶段交换标志，再一致决定是否继续。若只有发现问题的进程提前 return，其他进程就可能等待没有到来的调用。已经退出或崩溃的成员无法再参加标志交换，接下来由作业故障处理和恢复机制接管。',
 '多个进程组之间也有执行次序。尤其使用多个 NCCL 组或多个发起线程时，要显式协调各 rank 的调用及流依赖。另开一个组、线程或 CUDA 流，只是提供了另一个执行上下文，仍需保证共同顺序、数据依赖和缓冲区寿命。')+'</div>'+
 fold('形状和操作不一致的独立对照',p('末节程序在正常数值实验结束后，另起进程与进程组运行两种错误：shape_mismatch 使用 [2] 与 [3] 做 AllReduce；order_mismatch 使用相同 [2]，但一个 rank 做 AllReduce，另一个做 Broadcast。这两种情况互相独立。DETAIL 调试包装器比较调用指纹，记录的双方都收到 RuntimeError，消息包含真实 operators 与 shapes。',
 '此图同时给出两种不匹配和后文的迟到对照。失败对照证明本次调试检查发现了不兼容调用；其他后端、版本或未启用检查时，错误表现可能包括等待或超时。调试检查本身也会改变执行过程，不能拿它的耗时作无调试的性能测量。')+figures(c[2]).join('')),

 anchor(ci[3])+
 p('各 rank 各自读取数据、执行计算，到达同一个集合调用的时间可以不同。较早到达的进程可能先进入通信，然后等其他成员提供输入。于是本地观察到的一段“通信时间”，既可能包含传输，也可能包含别的进程尚未到达的等待。要解释这段时间，先把调用之前的数据取得、计算和张量就绪也放到时间线上。',
 '本章实际程序先执行 barrier，使两个成员经过共同的阶段边界，再让 rank 1 在调用前 sleep 80ms。rank 0 提供数值 1，rank 1 提供 2，然后都执行异步 AllReduce SUM 并等待，最后都读到 3。rank 0 的计时已经开始时，rank 1 可能还在睡眠；rank 1 自己的计时却在睡眠之后才开始。两段本地持续时间因而有不同的起点。',
 'async_op=True 返回 Work 工作句柄，程序可用它建立后续的等待关系。本例是 CPU/Gloo：work.wait() 阻塞当前进程，等该操作完成后才读取结果。下面片段将待归约的单元素张量记为 value、句柄记为 work；计时覆盖本地发起与等待，不能单独命名为网络传输时长。')+c3[0]+
 p('保存的运行记录中，rank 0 的 call+wait 约 81.821ms，rank 1 约 0.452ms；80ms 是程序注入值，这两段耗时是当次测量值，每次运行可以变化。它把“一个成员迟到，使另一个成员等得久”变成了可检查的因果对照。输入读取或反向计算在真实训练中也可能造成迟到，要靠相应训练时间线确认。',
 '换成 CUDA/NCCL 时，要区分主机函数返回与设备执行完成。PyTorch 2.5.1 的 NCCL Work.wait() 会让当前 CUDA 流等待该通信完成；通常依靠流依赖继续安排后续工作，不能把主机返回解释为整张 GPU 的工作已结束。阻塞等待配置等情形还可能让主机等待。转到另一条流消费结果时，仍须建立那条流需要的依赖；通信尚在使用的缓冲也必须保留。',
 '比较 rank 时记录同一任务、同一更新或桶、同一调用序号下的阶段持续时间。跨主机绝对时钟可能有偏差，未经校准的时间戳不能直接相减得到精确传输延迟。先用本地时长及共同阶段身份建立对应关系，再分析到达差和完成差。')+
 fold('CPU 与 CUDA 等待的版本依据',source('https://github.com/pytorch/pytorch/blob/v2.5.1/docs/source/distributed.rst','PyTorch 2.5.1：同步、异步 collective 与跨 CUDA 流使用结果')+source('https://github.com/pytorch/pytorch/blob/v2.5.1/torch/csrc/distributed/c10d/ProcessGroupNCCL.cpp','PyTorch 2.5.1：WorkNCCL 的流等待与阻塞等待实现')),

 anchor(ci[4])+
 p('反向传播逐步得到各参数的梯度，所有参数的梯度并非同时就绪。DDP 把梯度组织成桶，一个桶满足就绪和发起次序条件后便可同步；剩余反向计算继续生成后面桶的梯度。这样，通信与计算才有机会同时推进。异步句柄提供安排工作的方式，真正是否重叠仍取决于依赖、执行资源和时间线。',
 '使用一组独立的教学时刻：反向计算从 0 到 6ms；第一桶在 2ms 就绪，通信占 2—5ms；第二桶在 6ms 就绪，通信占 6—8ms。假设这些工作能够按图景重叠且没有额外竞争，本轮到 8ms 完成。将各段持续时间相加得到 6+3+2=11ms，会把重叠部分重复计算。这里的完成时间由最长依赖链决定，这条链称为关键路径。',
 '若仅将第一桶通信从 3ms 缩到 1ms，第二桶仍要等到 6ms 才能开始，完成时刻仍可能是 8ms。第二桶在反向结束后留下的 2ms，是本例暴露在计算之外的通信尾部。优化一段通信，只有改变了最终依赖链，才会缩短这一轮。')+
 t(['调整或观察','怎样影响机制','继续核对什么'],[['更小的桶','部分梯度可较早达到桶就绪条件','更多启动与调度开销、既定发起顺序'],['更大的桶','一次处理更多数据','等待梯度齐备的时间、缓冲内存'],['计算与通信区间相交','两类工作在时间上重叠','资源争用及最终完成时刻'],['单独通信测试更快','固定条件的通信操作更快','真实输入、桶就绪与训练更新的墙钟时间']])+
 p('GPU 上的计算和通信可能争用内存带宽或执行资源，两个区间相交并不保证二者各自保持原速度。记录桶就绪、发起和完成，再与计算事件对齐，才能判断重叠带来的实际变化。容量也参与约束：更多在途工作会让更多缓冲同时存活。',
 '比较训练吞吐时，先固定口径。强扩展保持全局任务大小，弱扩展保持每 rank 工作量；两者改变了不同条件。全作业吞吐应使用全体 rank 实际完成的有效工作量和作业墙钟时间，同时核对全局批大小、有效目标和更新数。各 rank 的本地吞吐简单平均，不能代替这个作业口径。'),

 anchor(ci[5])+
 p('通信的语义、实现算法和性能指标是三层问题。先知道要做 AllReduce，再选择一个明确算法模型，才能估计数据怎样移动。本节另设 N=4 个 rank，每个 rank 输入 M=16MiB；MiB 表示 2²⁰ 字节。只研究理想环形 ReduceScatter 加 AllGather，每个输入均分为 N 块，因此每块 4MiB。',
 'ReduceScatter 阶段有 N−1=3 轮，每个 rank 每轮发送一块并接收一块，累计发送 12MiB。AllGather 阶段也有 3 轮，累计再发送 12MiB。两阶段中，每 rank 发送 24MiB，也接收 24MiB；若把 4 个 rank 的发送量求和，全组是 96MiB。报告字节量时，要写清是单个 rank、全组，还是发送加接收。')+
 t(['理想环形阶段','每 rank 输入/输出布局','每 rank 发送载荷'],[['ReduceScatter','M 字节输入 → M/N 字节归约片','(N−1)M/N'],['AllGather','M/N 字节片 → M 字节完整结果','(N−1)M/N'],['两阶段合计','AllReduce 的完整输入输出','2(N−1)M/N；本题为 24MiB']])+
 p('设 α 是每轮启动时间，B 是本模型每 rank 的有效单向载荷带宽，T 是估计持续时间。将六轮启动和发送载荷相加，可写成 <code>T ≈ 2(N−1)α + 2(N−1)M/(NB)</code>。这里用发送字节除以 B；接收能够按模型同时进行，不把接收量再加到同一分母。若实际资源不能满足这些条件，就需要另建模型。',
 '继续假设 B=8GiB/s，α=10μs。GiB 为 2³⁰ 字节，所以 B=8192MiB/s；传输项为 24/8192 秒，约 2.93ms，启动项为 6×10μs=0.06ms，合计约 2.99ms。这是指定假设下的量级计算。链路规格中的 Gb/s 使用 bit，常按十进制表示；1 byte=8 bit，比较前还需统一十进制、二进制和位、字节。',
 '真实库可以选择其他算法、协议、通道和分层路径。拓扑、GPU 与网卡的位置以及竞争都可能改变实现成本。nccl-tests 的算法带宽与总线带宽有自己的载荷折算，不能直接当作某块网卡的观测值。本章没有测 NCCL 或物理链路；要评估目标集群，应保留参与组、实际映射、消息大小、版本、配置、算法及指标定义。')+
 fold('集合操作的官方定义',source('https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html','NCCL：集合操作、根 rank 与分片布局')),

 anchor(ci[6])+
 p('一次完整训练先让进程属于同一个作业，再让各进程取得输入、执行计算、交换梯度，最后进行有效更新。会合负责让进程找到共同成员与启动配置；集合通信负责交换训练中的数据。MASTER_ADDR 和 MASTER_PORT 是常见会合配置，知道会合地址，并不等于已经检查全部 NCCL 数据连接。',
 '验证也按这条正常路径展开。先完成会合，确认进程身份和设备映射；再做小张量通信，手算结果并核对双方输出；随后在目标规模、目标拓扑上持续执行通信；最后运行真实训练，检查输入、更新和质量，并测完整路径。每一级都有自己的起点、终点和可证明的范围。')+
 t(['阶段','记录的对象','这一级建立的证据'],[['作业会合','任务身份、成员、版本、设备映射','这些进程按共同配置进入作业'],['小集合操作','组、操作、输入与输出','相应数值和基本通信功能可工作'],['目标规模通信','目标消息、拓扑、重复测量与错误','该规模和配置下的通信表现'],['完整训练','输入消费、有效更新、质量及墙钟时间','所定义训练任务的实际进展和成本']])+
 p('遇到等待时，按同一训练阶段查看所有 rank 的前后关系。若各 rank 到达集合调用之前已经相差很大，先查迟到者的输入、计算或内存；若到达接近，但完成时间仍很长，再结合操作规模、路径与资源竞争调查通信部分。一个 rank 先 OOM 或退出，其他 rank 随后报通信超时，最早的异常更接近起因。',
 '跨节点路径还要分别确认目标环境实际具备和使用了什么：驱动、容器可见设备、选中的网卡、路由、RDMA 配置、GPU 互联与拓扑属于不同对象。TCP 小通信成功只建立相应功能证据。更改接口或参数后，使用同一负载复测，并记录选路和代价，才能判断变化。',
 '继续阅读时，把这里的成员、阶段和计时边界带到多机手册，再把实际输入消费与检查点恢复接起来。末节先用两个本机进程把数值、等待和调用协议逐项变成可检查的结果。')+
 linkTo('checkpoint-recovery','把已完成更新与恢复边界对应起来')+linkTo('multinode-lab','继续执行两机四卡的阶段验证'),

 anchor(ci[7])+
 p('完整程序 collective_contracts.py 使用 Python 3.12.13、PyTorch 2.5.1 的已记录环境，在本机启动两个 CPU/Gloo 进程。主函数依次运行 correct、shape_mismatch、order_mismatch；每一项重新创建临时目录和进程组，前一种失败不会充当下一种实验的输入。正常分支先做数值与变长汇总，最后才做受控迟到。',
 '将文件保存到解压目录，在匹配环境中执行下面的命令。运行前先写下两份向量的和、每个归约片以及变长均值；运行后用输出中的 modes 按实验名称核对。源码把支持能力、数值、错误消息与注入值分别写入结果，便于区分程序条件和实际测量。')+c7[0]+
 t(['输出位置','保存记录中的结果','怎样解释'],[['correct → all_reduce_sum','两个 rank 都是 [11,22,33,44]','原始 SUM；explicit_rank_mean 另除以 2'],['correct → reduce_scatter_tensor / all_gather_shards','本次支持；分别 [11,22]、[33,44]，再收齐','分片顺序和重建结果相符'],['correct → ragged','sum=32、count=4、global_mean=8','逐 rank 均值平均为 12；计入填充为约 5.3333'],['correct → delayed_arrival','注入 0/80ms；call+wait 约 81.821/0.452ms','两 rank 均得到 3；持续时间随运行变化'],['shape_mismatch / order_mismatch','双方 rejected 与 fingerprint_diagnostic 为真','错误指纹分别指向形状与操作']])+
 p('读正常分支时，注意 original 保留原输入，summed 是它的副本；ReduceScatter 使用 original，避免把已经归约的 summed 再归约一次。变长分支中，lengths 决定如何去掉传输填充，totals 汇总真实 sum 和 count。迟到分支在启动计时前才注入睡眠，所以不同 rank 的本地时间包含不同等待。')+
 fold('展开完整 collective_contracts.py：与下载源码一致',c7[1])+downloads(c[7])[0]+
 p('变化练习可以让 rank 1 的变长输入为空，rank 0 仍为 [2,4,6]。此时全局 sum=12、count=3、均值=4；需要同时处理空输入的传输和本地统计，不再执行空均值归约，并更新固定断言。全组都为空时，再定义统一的 count=0 分支。先写清预期，再修改程序，才能解释新的结果。',
 '现有记录验证了真实本机进程间 CPU 集合操作及指定对照，未执行 GPU、RDMA、多主机或吞吐测量。把同一输入输出关系搬到目标训练环境后，还要重新验证流依赖、目标规模和完整更新。')
 ],ci,'从进程和张量开始，手算集合通信，再沿成员到达、异步等待与计时理解一次训练同步。');

 comm.sections[0][1]+=p('沿用上面的两份输入。All-to-All 让每个 rank 按目的地切块，接收方只拿发给自己的块。若每份输入的前两项发给 rank 0、后两项发给 rank 1，两个接收方分别得到 [1,2,10,20] 和 [3,4,30,40]。上表的 AllGather 则让两个 rank 各自收到全部八项。分块不等长时，要把每对发送方、接收方约定的条数对上。<a href="/article/moe-routing/#native-expert-parallel">选读专家并行的真实收发与梯度对照 →</a>');

 comm.sections[6][1]+='<h3 id="native-job-collective-update">沿两份进程日志核对一次更新</h3>'+
  p('接回<a href="/article/kubernetes-training/#native-kubernetes-gloo-job">两个 Pod 的训练 Job</a>。两份进程日志的 <code>rank</code> 分别是 0、1，<code>world_size</code> 都是 2，会合地址都解析到 rank 0 的 Pod IP。接着核对样本数与梯度分别怎样汇总。',
  '先用 <code>all_reduce(SUM)</code> 合计样本数。两个 rank 的 <code>global_samples</code> 都是 4。反向传播前，各自的损失和乘以 2/4，再由 DDP 平均两个 rank 的梯度。每个样本因此都占 1/4。')+
  '<div class="job-collective-results">'+
  t(['进程与样本数','逐样本梯度','更新后权重'],[
   ['rank 0 · 1 条','1','1.125'],
   ['rank 1 · 3 条','−2、−2、−2','1.125'],
  ])+'</div>'+
  p('对四条样本取平均，得到 (1−2−2−2)/4 = −1.25。两份日志的 <code>gradient</code> 都是 −1.25，权重从 1 更新为 1 − 0.1 × (−1.25) = 1.125。<a href="/labs/kubernetes-gloo-job/validation.json">查看两份进程日志 →</a>',
  'Job 的日志证实两个 CPU/Gloo 进程完成了一次参数更新。重启能从哪一步继续，要再查检查点。另一个本机实跑中，两个进程已在内存算出第 2 步的权重 1.375，进程退出时最新检查点仍是第 1 步的权重 0.5。新进程从第 1 步的检查点读回状态，用同一批输入重算第 2 步。<a href="/article/checkpoint-recovery/#native-elastic-restart-step">沿恢复记录核对已保存的步数 →</a>');
 comm.updated='2026.11.12';

 const data=select('data-pipeline',['数据对象：Dataset、Sampler、批次与worker','跨rank分片：补齐、两层丢尾与epoch','多worker流式输入：覆盖正确后还要核对步数','样本打包：注意力、位置与损失目标','供给能力：速率、缓冲、内存与流水重叠','恢复与长尾：消费进展、输入版本与慢rank','实战与变化题：实际分流和打包数值对照']);
 const d=data.sections.map(s=>s[1]),d1=blocks(d[1]),d2=blocks(d[2]),d3=blocks(d[3]),d6=blocks(d[6]),dl=downloads(d[6]);
 if(d1.length!==1||d2.length!==1||d3.length!==1||d6.length!==4||dl.length!==2)throw Error('Input source block layout changed');
 const di=['subsection-1-2kpzoy','subsection-2-3mzhb3','subsection-3-lkc1ar','subsection-4-1xdh65w','subsection-5-pn7hyb','subsection-6-101j0v8','subsection-7-1jzf8j8','subsection-7-1v4jgvi'];
 replace(data,[
 '<div class="mechanism-core" id="input-dataset-sampler-loader">'+anchor(di[0])+
 p('训练循环中的 batch 从哪里来？存储先提供文件或对象中的内容，程序读取、解码、变换，得到单条样本，再按规则组成批次。对语言模型，样本还要经过分词，产生词元编号、位置、可见范围和预测标签；最后交给当前训练进程做前向计算和反向传播。数据管道就是把这些对象和步骤连接起来的程序。',
 '先给每条原始样本一个稳定的 ID。ID 表示“这是哪条记录”，样本内容是模型要处理的数据；一条样本可以变成很多词元，也可能产生多个训练片段。批次 batch 是一次交付给训练进程的一组输入。有效目标则是本轮实际参与损失的预测位置。样本数、物理词元数和有效目标数因而需要分别统计。',
 'PyTorch 的 Dataset 描述数据怎样取得。Map-style Dataset 按索引读取，例如 dataset[7]；IterableDataset 通过迭代器持续产出，适合按流或分片读取。Sampler 为可索引数据产生索引顺序；BatchSampler 把索引组成批；collate_fn 把取到的一组样本整理成模型需要的张量。DataLoader 调度这些步骤，将批次交付给训练进程。')+
 t(['对象','本例中的职责','交给下一步的内容'],[['原始记录与样本 ID','稳定识别内容和来源版本','例如 ID 7 的文本'],['Dataset','把记录读取并变成单条样本','样本 ID、特征及长度'],['Sampler / BatchSampler','确定顺序、分配与组批索引','例如 [0,2,4,6]'],['collate_fn','对齐、填充或组织张量','词元、mask、位置与 labels'],['DataLoader 与 worker','安排加载工作并交付批次','当前 rank 可以消费的主机批次'],['训练进程','搬运输入并执行计算、累积与更新','有效目标、梯度和更新进度']])+
 p('rank 是训练进程的身份，worker 是一个 DataLoader 用于加载数据的子进程。num_workers=0 时在训练进程中加载；num_workers=2 时，该 DataLoader 使用两个加载子进程。两个 rank 每个各设两个 worker，就有四个加载 worker，之外还有两个训练进程。一个 worker 处理更多文件，不会自动增加训练 rank。',
 'Map-style 的采样索引由加载器主进程生成，再分派给 worker 取样；IterableDataset 的每个 worker 则有自己的数据集副本和迭代器。因此，跨 rank 的分配、rank 内的 worker 分工是两个层次。下面先在有限索引表上算清分配，再看流式副本怎样避免重复。')+'</div>',

 anchor(di[1])+
 p('固定一个独立算例：数据集只有 11 条记录，ID 为 0—10；两个训练 rank，shuffle=False，batch_size=4。DistributedSampler 给不同 rank 产生各自索引。drop_last=False 时，它为均分需要把序列补到 12 项：末尾再加入一个 0。然后交错分配，rank 0 得到 [0,2,4,6,8,10]，rank 1 得到 [1,3,5,7,9,0]。',
 '每 rank 的六个索引再由 DataLoader 组成一批 4 项和一批 2 项。总交付 12 次，唯一 ID 仍为 11；ID 0 在这轮出现两次。分片成功让各 rank 有等长索引，也明确引入了补齐重复，训练或验证如何计入这次重复，需要按任务规则决定。',
 '若改成 Sampler 的 drop_last=True，先把总索引截到能被两个 rank 均分的 10 项，再交错分配。两个 rank 各得 5 项，ID 10 没有进入这轮。DataLoader 自己也有 drop_last，它处理的是这些本地索引能否组成完整交付批次。两个开关发生的位置不同，应当逐层计算。')+
 t(['Sampler drop_last','Loader drop_last','每 rank 实际批次大小','全组交付与覆盖'],[['False','False','4、2，共 2 批','12 次；11 个唯一 ID；0 重复'],['True','False','4、1，共 2 批','10 次；漏 ID 10'],['False','True','只有 4，共 1 批','8 次；漏 8、9、10'],['True','True','只有 4，共 1 批','8 次；漏 8、9、10']])+
 p('Sampler 决定索引分配，DataLoader 的 batch_size 决定本地组批，二者可以一起使用。下面保留接口示例；它额外启用了 shuffle，每轮先调用 set_epoch，再创建当轮迭代器。epoch 表示一次按本轮采样规则遍历数据的轮次，种子与 epoch 一起确定可复现排列。')+d1[0]+
 p('示例中的 seed=17 固定基础随机种子。若每轮不更新 epoch，Sampler 会继续使用同一轮排列；末节程序保存了 epoch 0、未更新 epoch、epoch 1 的索引供对照。使用 sampler 时不再要求 DataLoader 自己 shuffle；若显式传 batch_sampler，则应按该接口的互斥规则设置其他组批参数。',
 '若两个 rank 都各自使用普通 DataLoader 完整遍历这 11 项，每个 ID 就被交付两次，总计 22 次。DDP 不负责替输入自动分片。反过来，即使每 rank 索引长度相同，变长记录的有效目标数也可能不同；训练损失要按目标定义归一化，验证指标要明确补齐项是否重复计分。数量一致、覆盖正确和权重正确是不同检查。')+
 fold('采样与加载接口依据',source('https://github.com/pytorch/pytorch/blob/v2.5.1/torch/utils/data/distributed.py','PyTorch 2.5.1：DistributedSampler 的补齐、丢尾与 set_epoch')+source('https://github.com/pytorch/pytorch/blob/v2.5.1/torch/utils/data/dataloader.py','PyTorch 2.5.1：DataLoader 与组批参数')),

 '<div class="mechanism-core" id="input-worker-batch-count">'+anchor(di[2])+
 p('流式数据通常没有一个方便随机访问的完整索引表。IterableDataset 让每个 worker 从自己的迭代器产出数据，因此要明确每份副本读取哪些内容。本节保留同样的 ID 0—10，另设 batch_size=2；每个 rank 有两个 worker。这个流式实验与上一节的 Map-style 实验分别计算，批大小也不同。',
 '对这份有限、各副本都能按同一顺序枚举的源，先把所有 worker 编号为 0、1、2、3。编号等于 rank×每 rank worker 数+本地 worker_id，分区总数为 world_size×每 rank worker 数。ID 的序号除以 4 的余数等于哪个编号，就由哪个 worker 产出。get_worker_info() 提供当前加载 worker 的编号和数量；在主进程加载时返回 None，片段就按单 worker 处理。')+d2[0]+
 t(['训练 rank / worker','负责的样本 ID','保留尾批时，batch_size=2'],[['rank 0 / worker 0','[0,4,8]','[0,4]、[8]'],['rank 0 / worker 1','[1,5,9]','[1,5]、[9]'],['rank 1 / worker 0','[2,6,10]','[2,6]、[10]'],['rank 1 / worker 1','[3,7]','[3,7]']])+
 p('按 ID 核对，11 条记录各出现一次；按批次核对，rank 0 两个 worker 共交付 4 批，rank 1 共交付 3 批。两项结论可以同时成立。若训练循环每批都进入同一梯度集合操作，不等批次数便要求额外的训练协议，例如受控补齐、共同固定的步数，或适用且正确配置的不等输入机制；同时要核对目标权重及其他集合调用。')+figures(d[2]).join('')+
 p('开启流式多 worker 的 drop_last 时，各 worker 副本各自丢掉不满一批的尾部。本例丢掉 [8]、[9]、[10]，只剩四个完整批，共 8 项，两个 rank 各 2 批。把四个 worker 的记录先合成一条全局序列再丢尾，会得出另一种结果，因此不能拿全局样本数直接代替逐 worker 计算。',
 '错误对照仅按 index % world_size == rank 过滤：同一个 rank 的两个 worker 都会产出相同的那一半流。最终 11 个 ID 各交付两次，总计 22 次。真实存储更常按文件分片、对象范围或源分区分工，避免所有 worker 扫描全量内容后丢掉大部分；分工还要处理 worker 数变化、故障重读和交接。',
 '末节程序只在各自加载循环结束后做一次 all_gather_object 收集结果，没有每批训练，也没有逐批集合通信。因此 [4,3] 是不等批次的真实证据，程序本身能够正常结束；把它解释成“本实验必然卡死”会错读代码。')+'</div>',

 anchor(di[3])+
 p('组批之前还要决定模型看到什么。padding 把短样本补到共同长度，让张量形状规则；填充位置是否参与注意力、是否参与损失，需要分别设置。packing 把多个短文档放进一个物理序列，减少空位置。若训练目标要求文档独立，那么物理拼在一起之后，仍需保持文档内的上下文、位置语义和预测关系。',
 '设独立文档 A=[11,12,EOS]，B=[21,EOS]；本例 EOS 的词元编号为 2，表示文档结束。下一词元训练让当前位置预测同文档的下一项：A 的 11 预测 12，12 预测 EOS；B 的 21 预测 EOS，一共 3 个有效目标。各文档最后的 EOS 在这份独立文档任务中没有下一目标。',
 '将两篇文档串成 [11,12,EOS,21,EOS] 后，普通整体移位会额外建立“A 的 EOS 预测 B 的 21”，得到 4 个目标。EOS 是一个输入编号，模型和损失函数不会仅凭这个编号自动去掉跨文档目标。下面用 document_ids 保留文档身份，positions 表示文档内位置；i 是读取上下文的位置，j 是它可能读取的位置，allowed(i,j) 表示这次读取是否允许。')+d3[0]+
 p('上面的 shifted_y 列出前四个输入位置的下一目标，-100 是本例约定的损失忽略值；最后一个输入位置没有本段下一目标，完整模型输入中还需按实现采用对应的忽略处理。有效目标数因而为 3。这里的 allowed(i,j) 表示输入位置 i 能否读取位置 j：既要求 j 不在 i 的未来，也要求二者属于同一文档。')+figures(d[3]).join('')+
 p('文档 B 的第一个词元在物理位置 3。如果只有普通因果 mask，它可以读取 A 的三个位置和自己；文档内因果 mask 则只允许它读取自己。这是可见范围的区别。把跨文档 label 忽略，仅改变该预测位置是否计入损失，并不会自动阻止 B 的其他预测读取 A；两层机制都要与训练目标一致。',
 '位置编号是第三层。本数值参考给 token 向量加上与绝对位置有关的固定向量，因此 B 的位置从 0、1 开始，才能与逐文档独立计算相同。若改为 3、4，输入向量本身已经变化。这个结论针对程序定义的数学；真实 RoPE 或其他位置机制，应根据其平移性质、缩放方式、内核实现和模型契约核对，不能仅用“是否归零”作通用判据。',
 '跨文档连续训练也可以是有意定义的任务，此时应按那份目标设置边界。比较 packing 前后时，先固定语义，再核对模型输出、有效 label 与损失分母。只看到 padding 比例下降，还不能推出训练质量等价或真实速度按同样比例提升。')+
 fold('数据提前结束时怎样处理',p('文档结束、固定长度块结束和整个数据源结束是三种边界。数据中提前出现 EOS 是否结束当前文档，由数据构建规则决定；普通 DataLoader 不会按这个词元编号自动停止读取。源提前读完时，当前未满块可以按任务选择交付变长输入、填充并遮罩、丢弃，或暂存残余与后续文档继续打包；选择会改变覆盖、有效目标数和恢复所需状态。若填入 EOS 或 padding，也要明确其位置究竟是实际训练目标还是纯占位。',
 '某个 rank 的源先结束，还要回到上一节的批次与同步协议。若打包器缓存了半篇文档、部分词元或未交付的残余，这些内容属于输入进度的一部分，后面保存消费游标时不能只记录文件名。')),

 anchor(di[4])+
 p('数据含义正确后，才讨论怎样持续供给。读取、解压、解码、分词、组批、主机到设备搬运和模型计算有前后依赖。worker 可以提前准备下一批，让 CPU 工作与当前批的模型计算有机会重叠；预取缓冲保存已准备或正在准备的后续任务，吸收短暂波动。缓冲并不会提高一个长期过慢阶段的持续处理能力。',
 '先统一速率单位。另设每批 64 个样本，模型每 80ms 消费一批，需求为 1/0.08=12.5 批/s，即 800 样本/s。数据端每 100ms 交付一批，只供给 10 批/s，即 640 样本/s。若当前已有 8 批可消费，且供需恒定，缓冲每秒减少 2.5 批，约 3.2 秒后见底。这是一组流体速率算例，实际批次抖动还要看时间分布。',
 '在本章 PyTorch 配置中，prefetch_factor 表示每 worker 预取的批数。任务可以处于等待调度、读取变换中，或已经就绪；配置的预取数不能直接读成“内存里已有这么多可消费批”。它也不是当前训练实际消费的步数。')+
 t(['独立算例','计算','含义'],[['4 rank × 每 rank 4 worker × prefetch_factor 2','32 个预取批任务','按该配置的计划规模估量'],['每批均为 32MiB，32 批同时物化','1024MiB=1GiB','只统计这部分批张量的载荷'],['串行读取 4ms、变换 6ms、计算 10ms','首批依赖经过 20ms','三阶段还未形成稳态重叠'],['三阶段资源独立、稳定且能理想流水','稳态批间隔下界 10ms','由最慢阶段决定的理想值']])+
 p('真实内存还包括解码对象、数据集副本、拼接临时区、共享内存、页锁定副本及其他缓冲。增 worker 同时增大 CPU 并发、远端存储请求和这些对象的潜在在途数量；应观察交付尾延迟及相应资源，再判断是否减少了训练进程等待。pin_memory 提供页锁定主机内存，non_blocking 请求接口允许的异步行为；流依赖、硬件能力与资源竞争仍决定实际搬运能否和计算重叠。',
 '定位输入路径可使用三组对照：A 在设备侧使用固定张量，B 用内存中的同形状主机批次，C 使用真实存储与变换。保持模型、shape、dtype、目标和计时边界一致，再比较完整轮次。若分别测得 120、145、210ms，25ms、65ms 是这些运行路径的差值；各阶段可能重叠或互相影响，不能直接将差值命名为独立 PCIe 或对象存储耗时。',
 '读取端的 bytes/s、组批端的 samples/s 和模型端的有效 tokens/s 属于不同对象。最后应把时间窗口内实际消费且参与所定义目标的量作为分子，并记录等待、shape 分布和质量口径。上述数字都是说明单位与依赖的独立算例。'),

 anchor(di[5])+
 p('现在把数据管道接回训练更新。读取一个样本，只说明内容进入了加载过程；DataLoader 返回一个 batch，说明训练进程收到了它；forward/backward 完成后，它可能只贡献了累积窗口的一部分梯度；优化器完成一次有效更新，才推进相应参数状态。定义进度时，要先说明记录的是哪一个事件。',
 '例如更新 100 的检查点已经提交，下一批 A 被消费，后面的 B、C 仍在预取队列。若检查点只保存“读取到 C”，恢复后从 C 后面开始，就会跳过未完成的训练工作。若从更新 100 对应的已提交消费边界重做后续输入，则允许按约定重做尚未提交的部分。中途精确继续还需要把输入、随机状态、累积状态及参数状态放到同一个安全边界。',
 '输入身份也属于恢复状态。保存不可变分片清单或内容版本、Dataset 与变换版本、分词器版本、采样种子与 epoch、rank/worker 划分、补齐丢尾规则，以及打包残余的处理方式。随机变换要说明各进程和 worker 的种子及后续状态。源内容或分词器改变时，同一个索引就可能对应另一份训练输入。')+
 t(['需要记录的层次','关联内容','恢复时的用途'],[['输入版本','分片清单、内容版本、变换和分词器','找到同一份原始及派生数据'],['采样状态','seed、epoch、排列或可重建规则','恢复预期顺序与重复规则'],['消费边界','已提交更新对应的样本/词元位置','处理已读未用和需要重做的部分'],['中间状态','累积梯度、随机源、打包残余等','在所承诺的中途边界继续'],['成员配置','world_size、rank/worker 分工','成员数变化时重新解释分配']])+
 p('本站最小 DDP 程序采用 epoch 边界恢复：按它的保存契约，从完成轮次之后继续。它没有保存任意 worker 的预取队列，也没有承诺任意微批边界继续。若 world_size 或 worker 数变化，原 rank 的局部位置通常不能直接作为新分工下的位置；应选择明确的重新分配、重做与去重规则，再验证覆盖和更新结果。',
 '进度记录还能解释慢 rank。比较取得下一批、计算开始、桶就绪、集合调用与更新完成，便能把输入迟到接到上一章的通信等待。独立概率算例中，若每 rank 每步有 1% 的输入停顿概率，8 个 rank 至少一个停顿的概率为 1−0.99⁸≈7.73%。这里明确假设各 rank 独立；共享存储拥塞或公共故障常有相关性，实际分布要重新测量。',
 '恢复验收由训练消费者完成：加载同一输入身份和对应状态，继续执行后续更新，再比较所定义的结果。游标文件存在、下载完成或队列非空，分别建立了局部证据；训练真正推进到预期状态，才回答这次恢复是否可用。')+
 linkTo('checkpoint-recovery','学习训练状态与输入边界的一致恢复')+linkTo('multinode-lab','把样本与更新进度带入多机验收'),

 h(di[6],'采样分流程序与覆盖结果')+
 p('sampler_coverage.py 的保存记录来自 Python 3.12.13、PyTorch 2.5.1、CPU/Gloo。两个 rank 先各自运行 Map-style 对照，这部分 DataLoader 设置 num_workers=0；再分别创建 num_workers=2 的流式加载器，真实启动四个加载 worker。因此，“每 rank 两 worker”描述流式阶段，不能套到程序的所有阶段。',
 '保存文件后执行命令，先比较 map_summary，再比较 iterable_summary，最后进入 ranks 查看每个具体索引和 worker 批次。程序只在各 rank 加载完毕之后汇总记录，training_step_executed=false；它验证输入交付，没有执行模型训练。')+d6[0]+
 t(['实验分支','已保存的交付结果','对应检查'],[['sampler_0_loader_0','12 次，唯一 11；重复 0；批数 [2,2]','Sampler 补齐、Loader 保留尾批'],['sampler_1_loader_0','10 次，漏 10；批数 [2,2]','Sampler 丢尾'],['sampler_0_loader_1 / sampler_1_loader_1','8 次，漏 8/9/10；批数 [1,1]','Loader 丢掉本地尾批'],['no_sampler','22 次；每个 ID 重复；批数 [3,3]','两个 rank 都读全量'],['unsharded_workers','22 次；每个 ID 重复；批数 [6,6]','只分 rank，未分本地 worker'],['sharded_keep / sharded_drop','11 次、批数 [4,3] / 8 次、批数 [2,2]','先分别证明覆盖，再计算每 worker 尾部']])+
 p('四种 Map-style 开关使用同一固定的 11 项数据；流式分支另用批大小 2。shuffle 对照的 first 与 repeated 都属于 epoch 0，second 属于 epoch 1。检查这些前提后，再把程序输出与手算索引对齐，才能解释重复、遗漏和批次数各由哪层产生。')+
 fold('展开完整 sampler_coverage.py：与下载源码一致',d6[1])+dl[0]+
 p('变化练习：只把 Map-style 的 batch_size 改成 3。补齐模式中每 rank 正好 6 项，Loader 无论是否丢尾都会交付两批，全组仍有 12 次交付和重复 ID 0。流式分支仍需逐 worker 重新算。若改变 SIZE、WORLD 或批大小，还要同时更新程序中的固定断言，避免把旧预期触发的失败误读成加载器错误。')+
 h(di[7],'打包程序与逐文档参考')+
 p('packing_boundaries.py 是另一份独立实验，只用 Python 标准库。它固定两篇文档、二维 token 向量和加法位置向量，先逐文档算参考输出，再算正确打包、普通因果 mask、延续绝对位置三个分支。它没有调用分词器、真实语言模型、RoPE 或 GPU。')+d6[2]+
 t(['分支','输出差异或目标数','原因'],[['文档内因果 mask，文档内位置','最大绝对差 0','本程序中输入和可见范围保持一致'],['普通因果 mask','最大绝对差约 0.792277','B 可以读取 A'],['隔离文档但位置延续为 3、4','最大绝对差约 0.678339','本程序的绝对位置输入改变'],['独立文档 labels / 整体直接移位','3 个 / 4 个有效目标','后者多出 A 的 EOS 预测 B 首词元']])+
 p('先看 B 的首位置：参考输出是 [-1,0]，因为它只能读取自己。再检查 allowed_attention 中跨文档的 False，以及 shifted_labels 中的 -100，把输出差异与具体输入关系对应起来。源码对每个位置比较完整输出，而不仅检查是否插入 EOS。')+
 fold('展开完整 packing_boundaries.py：与下载源码一致',d6[3])+dl[1]+
 p('这两份程序分别建立了样本覆盖、实际加载进程和固定注意力数学的证据。接到真实训练时，继续验证模型要求的 mask、位置、labels、全局有效分母，以及检查点后实际继续的更新。相同语义与质量口径成立之后，再测目标硬件上的性能变化。')
 ],di,'沿一条样本认识读取、分片与组批，算清覆盖和有效目标，再理解预取、消费进度与恢复。');

 data.sections[5][1]+=
  h('native-prefetch-resume','实战：worker 已备好五批，训练只提交了一批')+
  p('用 PyTorch 的 DataLoader 取 12 条固定样本，每批 2 条，从批号 0 开始。两个 worker 各预取 2 批，加载器起初分派批号 0–3，训练进程取走第 0 批后，又安排了第 4 批。每个 worker 整理完一批就报告批号和进程编号。这条报告只证明组批已经完成。')+
  trainingFigure('prefetch-resume-step','保存时 0–4 已组批，只有 0 完成参数更新。恢复应从 1 重新取样。')+
  p('第 0 批样本 [4,1] 的训练目标是 [4.5,1.25]。令模型只输出一个权重 w，初始 w=0。每条样本的损失是 (w−y)²/2，取两项均值后梯度为 w−mean(y)=−2.875。首步用这个梯度初始化动量缓冲，学习率 0.25 使 w 变为 0.71875。保存这一步时，下一批编号是 1。')+
  trainingCode('同一次保存写入权重、优化器与下一批编号','PYTHON',`next_batch = updates[-1]["batch"] + 1
torch.save({"weight": weight.detach().clone(), "optimizer": optimizer.state_dict(),
            "data_identity": DATA_IDENTITY, "next_batch": next_batch}, checkpoint)`)+
  p('源训练进程退出。新进程从检查点读回权重和动量，按原顺序取批号 1–5。第 1 批原先由 worker 1 准备，重启后换成 worker 0。两次目标仍是 [8.75,3.75]，因为这里用固定轮次和样本 ID 重建变换。')+
  t(['输入恢复方式','重启后用于更新的批号','最终 w'],[
   ['不中断的基线','从 0 到 5 连续更新','7.361175537109375'],
   ['从检查点保存的 1 开始','1、2、3、4、5','7.361175537109375'],
   ['从 worker 进度推出来的 5 开始','只做 5，漏掉 1–4','2.9296875']
  ])+
  p('解压并安装包内的 PyTorch 版本后，运行 <code>python -B prefetch_resume.py --output replay.json</code>。对照每一步的样本、梯度、动量和参数，而不只看最后的权重。这里从一次已完成的优化器更新继续，输入可以用索引重建。若流式输入还有打包残余，或变换依赖 worker 的随机状态，保存一个批号就不够。')+
  '<p class="practice-links"><a href="/labs/prefetch-resume-step.zip" download>下载代码与复跑步骤 ↓</a> · <a href="/labs/prefetch-resume-step/validation.json">查看 worker 与训练进程的实际记录 →</a></p>';
 data.updated='2026.11.11';

 const overlap = comm.sections[4];
 overlap[1] = overlap[1].replace('才会缩短这一轮。</p>', '$&' +
  trainingFigure('collective-overlap-tail','同一条时间轴上，第一桶同步藏在反向计算里。把它从 3 毫秒缩到 1 毫秒，最后一桶仍在 8 毫秒完成。'));
})();
