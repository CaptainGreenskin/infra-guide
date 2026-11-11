Object.assign(sources,{
 v16Attention:['Attention Is All You Need · 原论文','https://arxiv.org/abs/1706.03762'],
 v16GQA:['GQA · 原论文','https://aclanthology.org/2023.emnlp-main.298/'],
 v16DDP:['PyTorch 2.5 · DDP 归约与 no_sync','https://pytorch.org/docs/2.5/generated/torch.nn.parallel.DistributedDataParallel.html'],
 v16AMP:['PyTorch 2.5 · AMP examples','https://pytorch.org/docs/2.5/notes/amp_examples.html'],
 v16FSDP:['PyTorch · FSDP2 分片机制','https://docs.pytorch.org/tutorials/intermediate/FSDP_tutorial.html'],
 v16NCCL:['NVIDIA NCCL · 集合通信','https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html'],
 v16CUDA:['NVIDIA · CUDA Best Practices','https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/'],
 v16Flash:['FlashAttention · 原论文','https://arxiv.org/abs/2205.14135'],
 v16Cache:['Transformers · Cache explanation','https://huggingface.co/docs/transformers/en/cache_explanation'],
 v16VLLM:['vLLM · 性能指标与测试口径','https://docs.vllm.ai/en/stable/benchmarking/cli/'],
 v16Paged:['PagedAttention · 原论文','https://arxiv.org/abs/2309.06180'],
 v16DCP:['PyTorch · Distributed checkpoint','https://docs.pytorch.org/docs/stable/distributed.checkpoint.html'],
 v16Kueue:['Kueue · Workload admission','https://kueue.sigs.k8s.io/docs/concepts/workload/']
});
infraKnowledgeDomains.push({module:'model-foundations',track:'ai',refs:['v16Attention','v16GQA','v16CUDA','v16Flash','v16Cache'],points:[
 {id:'mf-tensors',title:'Token、张量形状与预测目标',articles:['transformer-model','tokenization-embedding'],lead:'基础单位是有效预测目标。这里把模型处理文本的基本单位称为词元（token）。分词器（tokenizer）把文本变成编号；嵌入查表（Embedding）把编号变成向量；输出层为词表里的每个词元算出一个未归一化得分（logit）。输入长度、模型维度和词表大小分别影响不同的内存与计算。',body:
 figure('v9-model-flow','小模型的形状账本：2条样本、每条4个位置，依次经过嵌入、注意力、前馈和词表输出。图用小尺寸看清每个轴，正文再用长序列计算显存。')+
 knowledgeFormula('只使用解码器的模型：常见张量形状','IDs [B,S] → X [B,S,d] → logits [B,S,V]','B为批内序列数，S为对齐后长度，d为隐藏维，V为词表大小；logits是所有候选词元的得分，还没有完成选词。下文1MiB=2²⁰字节，1GiB=2³⁰字节。')+
 para('自回归训练对齐的是“当前位置预测下一位置”。序列 [BOS,A,B,EOS] 可取输入 [BOS,A,B]、标签 [A,B,EOS]，有3个有效目标。padding的位置和不计损失的提示部分要从分母排除。注意力掩码（attention mask）决定能看见哪些位置；损失掩码（loss mask）决定哪些预测参与训练。它们可以不同。',
 '若B=2、S=2048、d=4096、V=32000且用2字节表示，仅这份隐藏张量约32MiB，物化全部logits约250MiB。参数数目没有变化，S或V变化仍会改变峰值。推理只需某些位置logits时，执行器可能避免保留完整矩阵；训练实现也可能融合损失计算。必须按实际物化的张量记账。',
 '样本拼接（packing）把多段样本放进一条序列，减少用于对齐的填充（padding），但EOS符号本身不会阻止后一段看见前一段。如果任务要求样本独立，需正确的块因果mask、位置规则和标签mask。先把一行输入、标签与可见集合逐格写出，再谈“提高有效token利用率”。')+
 knowledgeCheck('两段独立样本拼接后只插入EOS，能保证互不注意吗？','不能。EOS是模型输入，不是强制隔离边界；显式可见性规则决定哪些K/V参与每个查询。')},
 {id:'mf-attention',title:'Attention、因果掩码与 GQA 的具体计算',articles:['attention-mechanics','tokenization-embedding'],lead:'注意力（Attention）让当前位置从允许读取的位置汇总信息。查询向量 Q 和键向量 K 用于计算匹配分数，值向量 V 提供要汇总的内容。分数在合法位置间换成权重，权重之和为 1。',body:
 knowledgeFormula('一个注意力头','Q=XWq，K=XWk，V=XWv；P=softmax(QKᵀ/√dₕ + M)，O=P·V','X 是输入表示，Wq、Wk、Wv 是三组投影权重。每个头的向量有 dₕ 项。掩码 M 让禁止位置的分数变成 −∞。Softmax 沿每行分数求出权重 P，稳定计算时先减去本行最大值。O 是加权汇总后的输出。')+
 para('因果位置t只允许s≤t，padding键另行屏蔽。对两项分数[0,ln3]，权重是[1/4,3/4]；值为[2,6]时输出5。若第二项被遮罩，输出变为2，不能先对全部项归一化再把第二项的输出置零。所有键都被屏蔽的行要按实现处理，避免0/0或NaN传播。',
 '多头注意力（MHA）让每个查询头拥有对应的键和值；分组查询注意力（GQA）让若干查询头共用一组键和值。4个Q头、2个KV头的相邻分组映射是[0,0,1,1]，不是[0,1,0,1]。Q头保留各自查询，权重也各自计算；共享的是K/V表示，不能把四个Q先平均。新的标准库实验直接对照这两种映射。',
 '全量注意力的分数张量约为B×h×S²；长度翻倍使这一项变为四倍，QKV投影却只随S线性增加。因果语义允许专门算法跳过禁止区域，但不同kernel的实际FLOP和内存流量要从实现及剖析确认。')},
 {id:'mf-decoder',title:'Decoder Block、FFN、残差与位置',articles:['transformer-block','position-encoding'],lead:'以常见的“先归一化、再计算”结构（Pre-Norm）为例，一个解码器块可以写成x←x+Attention(Norm(x))，再x←x+FFN(Norm(x))。残差保持同形状相加；归一化、位置编码和激活函数各有自己的计算语义，是否含可学习参数取决于具体方案。',body:
 para('前馈网络（FFN）的普通两层结构将d映射到dff，再映回d，忽略bias有2ddff参数；门控FFN常有两个上投影与一个下投影，共3ddff。比如d=4096、dff=11008，门控部分约1.353亿参数。扩展维度、激活中间量与融合方式都会影响峰值，而不仅是Attention。',
 '旋转位置编码（RoPE）在每个二维子空间按位置旋转Q和K，使点积包含相对位置差。在缓存已旋转K的实现中，旧K保留原位置的旋转；增量解码的新Q与新K使用正确的绝对位置或等价偏移。若保存的是未旋转K，读取时也须按对应位置处理。每次都把新Q位置重置为0，会与全量路径产生不同结果。新实验保留这个错误反例。',
 'Norm的统计轴也必须明确：LayerNorm常在一个token的隐藏维上计算均值与方差；RMSNorm采用均方根尺度且结构不同。它们不会让批内其他样本互相看到。读模型配置时同时核对norm位置、epsilon、门控函数、权重共享与tokenizer，不能把同样层数当成同样计算图。')+
 code('简化Pre-Norm结构 · 只展示依赖','PYTHON','x = x + attention(norm1(x), position_ids, causal_mask)\nx = x + down(silu(gate(norm2(x))) * up(norm2(x)))')},
 {id:'mf-autograd',title:'反向传播、共享参数与有效 token 分母',articles:['autograd-training','tokenization-embedding'],lead:'反向传播沿计算图把上游梯度乘以局部导数；同一参数在多个位置使用时，所有路径贡献相加。平均损失的分母决定优化的是哪个目标。',body:
 knowledgeFormula('以有效目标为单位','L = Σ有效token ℓt / N；∇L = Σ有效token ∇ℓt / N','先求和再除全局有效目标数；不同长度序列的局部均值等权平均会改变目标。')+
 para('对标量模型ŷ=w、单目标损失ℓ=½(w−y)²，w=0、y为−2/−4/−6/−8时，四个梯度为2/4/6/8，均值5。若第一组只有第一个目标，第二组有后三个目标，两组均值为2和6；再等权平均得到4。两种实现都能正常运行，但更新不同。',
 'microbatch梯度默认累加。若每批有效目标数不同，简单将每个mean loss除以microbatch数量仍会算成批均值。应在一个优化窗口内使用一致总分母，完成累积后再执行一次step与zero_grad。最后不足一个完整累积窗口时，使用实际计数。',
 '有限差分可独立检查某参数的导数：(L(w+ε)−L(w−ε))/(2ε)。测试需固定随机性，关闭会改变比较的dropout，并选合适ε；随后还要把真实optimizer更新与预期对照。一个梯度数值正确，不能自动证明目标mask、数据标签或全局分母正确。')},
 {id:'mf-gpu',title:'GPU 执行层级、访存与资源约束',articles:['gpu-execution','roofline-model'],lead:'CUDA核函数（kernel）把线程块分配到流多处理器（SM），线程再按线程束（warp）执行。寄存器、共享内存、二级缓存和高带宽显存（HBM）处于不同层级，具有不同容量、共享范围和访问成本。',body:
 para('线程块可以协作，把一个数据块（tile）加载到共享内存后同步；寄存器通常承载每线程局部值。更多寄存器或shared memory使用可能减少同一SM驻留的块/warp数量。占用率（occupancy）描述能同时驻留多少线程束，不能直接当作算力利用率：仍可能受数据依赖、访存、指令种类或同步等待限制。',
 '合并访存把邻近线程的地址访问组织为较少内存事务。矩阵布局、跨度（stride）、对齐和数据块形状决定能否有效搬运；转置是逻辑视图还是物理拷贝，要看随后算子的布局需求。非连续张量引起的隐式数据拷贝，可能抵消某个算子局部加速。',
 '核函数融合通过减少中间量写回、重复读取和launch次数提高效率，也可能增大寄存器压力、改变并行度。算子层先比较相同shape/dtype/布局与数值误差，再用设备事件或同步后的计时区分提交耗时和执行耗时；主机上的异步调用很快返回不等于kernel很快。')+
 table(['对象','先数什么','典型代价'],[['GEMM','M/N/K、dtype、布局','计算量、读写量、tile利用'],['归一化/激活','读写元素、归约轴','HBM流量、归约和launch'],['主机→设备','字节、固定页内存、依赖','拷贝与计算能否重叠']])+
 para('算子交给编译器后，先看哪些运算进入同一张图，再看设备执行。用<a href="/article/operator-profiling/#torch-compile-graph-break">断图实验</a>核对 Python 标量、张量条件和输入形状各怎样影响图的捕获。',
 '同一份矩阵怎样由一组线程合作计算？<a href="/article/operator-profiling/#native-metal-gemm">Apple GPU 分块实验</a>用一个不整除的形状核对边界，再用同卡计时比较朴素版和分块版。')},
 {id:'mf-roofline',title:'Roofline、在线 Softmax 与算子优化',articles:['roofline-model','flash-attention-io','tensor-parallel-math'],lead:'优化先写工作量F和内存流量D。算术强度I=F/D；理想性能上界受峰值计算吞吐与内存带宽两者约束，实际时间还含调度、同步和未计入的流量。',body:
 knowledgeFormula('同一设备、同一工作负载的理想下界','T ≥ max(F / Pcompute, D / Bmemory)','GEMM [M,K]×[K,N] 常按2MNK计FLOP；D必须说明是HBM实际流量还是理想最低搬运量。')+
 para('FlashAttention通过分块和在线归一化避免在HBM物化完整S×S概率矩阵。对已经处理的分块保留最大值m、指数和l与未归一化输出o。新块最大值m′改变后，旧量用exp(m−m′)重缩放，再加新块贡献，最后o/l。分块softmax各自归一后简单平均，通常与全量softmax不同。',
 '它优化的是IO组织与kernel执行，仍需计算所要求的注意力关系。长序列训练中节省的大中间矩阵，不等于推理的持久KV被消除。dropout、反向重算、不同head维和mask支持由具体实现决定。先用数值对照确认结果相同，再从性能记录中检查显存读写量和执行时间。',
 '端到端收益还受Amdahl约束：原来占40%的部分即使快2倍，总时间也只从1降到0.6+0.2=0.8，整体1.25倍。预处理、通信或同步成为新瓶颈后，继续优化同一kernel的收益会下降。')}
]});

infraKnowledgeDomains.push({module:'training',track:'ai',refs:['v16DDP','v16AMP','v16FSDP','v16NCCL','v16DCP','v16Kueue'],points:[
 {id:'tr-step',title:'一次训练更新：数据、计算、通信、提交',articles:['gpu-cluster','ddp-code'],lead:'一次更新以固定输入和参数状态开始，经过前向、损失、反向、梯度同步，再由优化器更新参数。更新次数（step）、小批次计数（microstep）、样本进度和检查点提交点分别记录。一次作业可以有多个工作进程；后文用rank表示进程在通信组内的编号。',body:
 figure('v16-ai-training-path','一次训练更新的依赖路径与不等token分母：rank0梯度和2、rank1梯度和18，全局4个目标的平均梯度为5。')+
 para('数据平面负责读取、解码、分词、组批与传输；计算平面运行算子与梯度通信；作业控制平面处理准入、启动、成员和恢复。主进程已经创建并不表示所有rank已完成会合；所有rank连通也不表示下一次集合通信的张量大小和顺序一致。',
 '在进程总数固定时，全局样本批量常写作：数据并行副本数×每个小批次（microbatch）的样本数×梯度累积次数。若目标是每有效token平均，样本批量并不能替代有效token总数；padding、截断与提示部分的损失掩码都会改变它。训练日志至少同时保留样本数、有效目标数、step和成功提交的检查点。')+
 table(['阶段','状态变化','完成信号'],[['取批/拷贝','数据游标、批次、设备输入','版本与有效mask匹配'],['反向/归约','梯度与通信桶','需要的归约全部完成'],['step','参数、优化器与缩放器','本次更新完成或数值溢出被跳过'],['保存','完整状态与清单','读者可校验的提交标记']])},
 {id:'tr-memory',title:'训练显存：状态账本、峰值与混合精度',articles:['gpu-memory','gpu-cluster'],lead:'显存至少拆成参数、梯度、优化器状态、激活、临时工作区、通信缓冲与分配器保留量。总峰值取决于这些对象在哪个时刻同时存活。',body:
 knowledgeFormula('一个明确的教学账本','P×（参数2 + 梯度2 + 主权重4 + Adam状态8）字节 = 16P字节','这是指定存储策略，不是所有BF16/AMP实现的固定常数；实际梯度与优化器状态使用哪种数据类型，要从运行对象核对。GB按10亿字节计算，GiB按2³⁰字节计算。')+
 para('P=10亿时，上述持久状态为16GB≈14.90GiB；用四个进程做复制式数据并行，每进程仍占约14.90GiB，并非总量除4。激活还取决于B、S、层数、保存策略和算子融合。梯度检查点丢弃部分前向中间量，在反向时重算，交换的是计算与激活峰值。',
 '混合精度（AMP）的autocast会按算子选择计算类型。它不会把全部参数、梯度和优化器状态都改成低精度。使用FP16时，为减轻小梯度下溢，常在反向前把损失乘以缩放因子；更新前再除回来并检查溢出。一个累积窗口内保持同一缩放因子。需要裁剪梯度时，先正确归一并除回缩放因子，再裁剪；出现无穷大或NaN时，按规则跳过更新并保存缩放器状态。',
 '排查显存耗尽（OOM），先定位发生阶段：加载、前向、反向、参数聚合还是保存。分别记录张量正在使用的内存（allocated）、分配器保留的内存（reserved）和峰值，结合对象生命周期；释放某个Python引用后，分配器缓存仍可能保留内存。重启后能跑一小批，不能据此认定长期峰值已受控。')},
 {id:'tr-ddp',title:'DDP：副本一致与全局目标是两件检查',articles:['distributed-training','ddp-code'],lead:'分布式数据并行（DDP）让每个工作进程持有模型副本，并在反向中对梯度做跨rank平均。它不替你切分输入，也不知道每个rank有多少有效目标。',body:
 knowledgeFormula('固定W、默认梯度平均时的本地损失','Lr = (W / N) × Σ本进程的有效目标损失','W是进程总数，N是整个累积窗口的有效目标数。DDP随后把梯度除以W，最终得到全局梯度总和除以N。')+
 para('对梯度[2]与[4,6,8]，本地均值2与6经DDP平均得到4；按全局总数4归一，则两rank本地反向量为1与9，平均得到5。学习率0.1、初值0时，参数分别变为−0.4和−0.5。即使两个rank的参数完全相等，训练目标仍可能算错。',
 '累积时，前几个小批次放在no_sync范围内执行，前向和反向都要包含在内；最后一个小批次才同步。每个rank执行相同的同步阶段与集合调用顺序；本地有效目标为0也须提供可微的零贡献并参与所需同步。全窗口有效目标数为0时，所有rank统一跳过本次更新。')+
 code('默认DDP平均 · 伪代码中的分母来自全窗口计数','PYTHON','N = all_reduce_sum(local_valid_tokens_in_window)\nif N > 0:  # 所有rank判断一致\n    # 前几批在ddp.no_sync()内同时执行forward/backward\n    loss = local_loss_sum * world_size / N\n    loss.backward()\n    # 最后一批同步后才step；不要再除world_size\n    optimizer.step()')+
 knowledgeCheck('两个rank的权重相等，是否足以证明DDP训练正确？','还要与同一目标、同一全局输入的单进程更新比较。新实验同时检验错误均值、正确分母、累积、本地空目标与全局空窗口。')},
 {id:'tr-sharding',title:'FSDP 与 ZeRO：分片的是哪些状态',articles:['distributed-training','gpu-memory'],lead:'分片减少每rank常驻状态；计算某个模块时，又可能需要临时收齐参数。全分片数据并行（FSDP）就是管理这套收齐、计算和重新分散的机制。持久状态节省与瞬时峰值、通信量应分开计算。',body:
 para('ZeRO的典型分片阶段依次拆分优化器状态、梯度和参数；全分片策略将这些状态沿数据并行组分散。FSDP在模块计算前收齐所需参数（AllGather），反向时把梯度合并并分发到各自分片（ReduceScatter）。什么时候重新分片、什么时候预取下一模块，由具体策略决定。',
 '若前述16GB持久状态理想均匀分到4rank，基础账本约4GB/rank；但当前聚合模块、尚未释放的激活、预取模块与通信缓冲可能同时存活。用“参数总量/卡数”直接决定能否启动，会遗漏这一峰值。分片粒度太粗会抬高聚合峰值；太细会增加调用、调度和通信开销。',
 '检查点的组织也随分片改变。只保存某rank的本地分片不足以恢复全模型；需要全局元数据、分片身份、优化器映射和一致提交点。改变进程总数时要靠支持重分片的加载路径，并重新核对数据游标与随机状态。课程的CPU DDP实验不承担FSDP或重分片验证。')+
 table(['策略','常驻状态','运行时新增代价'],[['复制式DP','每rank完整模型/梯度/optimizer','梯度归约'],['状态分片','部分持久状态','相应聚合/归约及分片映射'],['参数全分片','本rank参数与状态片','计算前参数聚合、梯度分发、峰值管理']])},
 {id:'tr-parallel',title:'张量并行、流水线并行与混合专家',articles:['distributed-training','tensor-parallel-math'],lead:'数据并行切输入与副本，张量并行（TP）切层内张量，流水线并行（PP）切层。混合专家模型（MoE）再通过路由，把词元分派给不同专家。组合策略先说明每一组rank承担哪种切分。',body:
 figure('v16-ai-parallel-matrix','并行策略矩阵：分别追踪状态驻留、计算对象和关键通信，不把所有“多卡”归为同一种机制。')+
 para('列并行将W=[W0,W1]，两rank分别计算XW0和XW1，得到输出特征的两片；后续算子若可直接消费分片，可暂不拼接。行并行将X=[X0,X1]、W按输入维切片，完整输出Y=X0W0+X1W1，需要相应归约。切分位置决定通信在哪里发生。',
 '当两个数据副本又各自切成两个 TP 进程，沿行合并前向部分和，沿列同步同一参数片的梯度。<a href="/article/tensor-parallel-math/#native-dp-tp-mesh">在四进程记录里核对这两种分组</a>。',
 '流水线并行把连续层分到不同阶段（stage），小批次依次传递激活，再反向传递梯度。等长单向填排空的简化模型利用率为m/(m+p−1)，m=8、p=4时约72.7%；真实训练还有前反向调度、激活保存、各阶段耗时不均衡和通信。增大m可能减少气泡，也会改变内存、延迟和组批约束。',
 '用<a href="/article/tensor-parallel-math/#native-pipeline-schedules">四个微批的实跑记录</a>，比较同一阶段有几条微批还等着反向。再检查排程改变后，两阶段的梯度是否仍等于整批参考。',
 'MoE的路由器（router）为每个词元选择专家。专家参数总量、每token激活参数量和实际算量不是同一个数；分发词元和收回输出常需要各进程互相交换数据（AllToAll）。热点专家、容量限制、丢弃/补算和跨节点带宽会改变效率。先查看每个专家收到多少词元、分发花多少时间，再判断增加专家是否能提高有效吞吐。')},
 {id:'tr-collectives',title:'集合通信：数据量、顺序与重叠',articles:['training-communication','training-performance'],lead:'AllReduce先把各进程的数值合并（例如求和），再让每个进程得到结果；ReduceScatter合并后只留下各自负责的一片；AllGather则让每个进程收齐所有片。正确调用要求成员、顺序、dtype与张量规模符合协议。',body:
 knowledgeFormula('理想ring AllReduce，W个rank、每rank输入S字节','T ≈ 2(W−1)α + [2(W−1)/W]×S/β','α为每轮延迟，β为同口径有效带宽；这是单链路等速简化模型，不是NCCL性能承诺。')+
 para('W=8、S=1GiB时，每rank理想发送约1.75GiB；若假设有效带宽100GiB/s，纯传输下界约17.5ms，另加启动与同步。实际算法会按规模和拓扑选取，跨节点链路可能成为瓶颈。不能把每卡HBM带宽拿来代替网卡或互联的有效带宽。',
 'DDP把梯度分成通信桶（bucket），在反向中逐桶启动归约，前部bucket可与后续反向重叠；最终暴露在关键路径上的尾部通信决定实际损失。bucket过小启动次数增多，过大则等待更多梯度就绪。timeline中“通信持续时间很长”与“端到端都在等通信”需要分开。',
 '挂起先找最早失败rank和最后完成的集合序号，再核对分支、数据耗尽、OOM与异常退出；一个rank提前结束也可能让其他rank停在通信。会合控制通道可用，并不证明NCCL数据路径、网卡选择、MTU或GPU拓扑正确。')},
 {id:'tr-input',title:'数据流水线：供给、packing 与跨 rank 一致性',articles:['data-pipeline','gpu-cluster'],lead:'取样、存储读取、解压、分词、组批、主机→设备与设备计算构成依赖流水。平均供给速度足够，仍可能因抖动、长尾和同步拖慢整个step。',body:
 para('用三组同shape对照分层：设备上的固定张量隔离模型计算；内存中的预处理批次加入传输；真实存储管线再加入读取与CPU处理。保持有效token、mask和更新次数一致，才能把差值解释为相应供给路径。各阶段完全重叠时稳态间隔受最慢阶段限制；同步或串行依赖会让耗时相加。',
 '分布式采样器（DistributedSampler）按工作进程分样本，但padding或drop_last会改变尾部样本。每轮应按要求调用set_epoch，否则可能重复同一洗牌顺序。流式数据恢复要保存可定义的分片、游标、shuffle缓冲和消费确认边界；“读过”与“已用于成功optimizer step”不是同一进度。',
 'packing提升token密度后，重新核对块因果mask、标签与位置。用有效训练token/s衡量供给收益，另报丢弃、重复和截断比例。预取深度增大会占用主机内存与缓存，CPU线程数增大也可能争抢解码、I/O和通信线程。')},
 {id:'tr-recovery',title:'检查点、重启与训练作业的验收',articles:['checkpoint-recovery','multinode-lab','kubernetes-training','training-performance'],lead:'检查点是可继续更新的完整状态提交。权重、optimizer、scaler、随机状态、数据进度和配置共同决定下一步；保存成功必须能被读者完整加载并校验。',body:
 para('一套可检查的保存顺序是：各进程写入独立版本的分片→核对长度与摘要→汇总文件清单（manifest）→最后发布“已提交”的指针。读者只加载manifest指向的完整集合。写到一半的目录不能以“文件存在”判成功；不同存储的rename、条件写、可见性与持久性保证要分别使用。',
 '恢复对照分两路：连续执行K步得到基线；执行k步保存，启动新进程加载后再执行K−k步。固定输入顺序、随机性、并行规模与数值策略，比较参数、optimizer、计数和下一批样本。训练轮次（epoch）结束处恢复成功，不代表任意小批次中断后都能正确恢复；中途梯度若未保存，必须从已承诺边界重做。',
 '多机手册的验收顺序是设备/运行时→名称与网络→会合→小集合通信→短训练→保存/终止/恢复→同工作量性能对照。Kubernetes中再核对Job重试、GPU资源形状、卷与故障成员处理。配额准入、资源实际放置和所有rank协同运行分别留下状态，不以Pod Running代替训练完成。')+
 para('启动器可以替换失败的进程组，恢复点仍由程序读出的检查点决定。<a href="/article/checkpoint-recovery/#native-elastic-restart-step">观察两个新进程怎样重算未提交的第 2 步</a>。',
 '异步保存还要确认后台使用的是哪一步的参数。<a href="/article/checkpoint-recovery/#native-async-dcp-commit">对照写入成功、状态错步与写入失败</a>，再看恢复后下一步是否正确。')+
 knowledgeCheck('换world size恢复，只要权重加载成功就能继续对照原训练吗？','还要重分片optimizer与状态、定义全局batch和学习率、恢复正确的数据进度与随机性。不同框架和保存格式的能力不同，需要专门对照实验。')}
]});

infraDomain('training').points.find(p=>p.id==='tr-input').body+=
 knowledgeFormula('用三个阶段理解预取的作用','读取4ms + 预处理6ms + 设备计算10ms：串行20ms；理想稳态间隔10ms','假设三阶段可充分重叠、供给稳定且缓冲足够。第一批仍要经过准备时间；增加预取不会把10ms的设备计算变成5ms。')+
 para('改成读取偶尔需要50ms时，平均读取4ms已不足以预测卡顿。先看慢读发生的频率和预取队列能覆盖多久，再调整缓冲。把等待藏到流水线之外有帮助，但它仍消耗主机内存，故障恢复时也要清楚哪些批次已真正用于更新。');

