/* Generated classic scripts; edit the canonical files listed below. */

;
// ai-system-knowledge.js
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
 {id:'mf-attention',title:'Attention、因果掩码与 GQA 的具体计算',articles:['attention-mechanics','tokenization-embedding'],lead:'注意力（Attention）对每个查询计算一组可见键的分数，在同一可见集合内归一化，再加权求和值向量。改变可见集合会改变归一化分母。',body:
 knowledgeFormula('单个头','Q=XWq，K=XWk，V=XWv；P=softmax(QKᵀ/√dh + M)，O=PV','Q/K/V按[B,heads,S,dh]理解；M在禁止位置加−∞。稳定softmax先减去该行最大值。')+
 para('因果位置t只允许s≤t，padding键另行屏蔽。对两项分数[0,ln3]，权重是[1/4,3/4]；值为[2,6]时输出5。若第二项被遮罩，输出变为2，不能先对全部项归一化再把第二项的输出置零。所有键都被屏蔽的行要按实现处理，避免0/0或NaN传播。',
 '多头注意力（MHA）让每个查询头拥有对应的键和值；分组查询注意力（GQA）让若干查询头共用一组键和值。后文用Q表示查询、K表示键、V表示值。4个Q头、2个KV头的相邻分组映射是[0,0,1,1]，不是[0,1,0,1]。Q头保留各自查询，权重也各自计算；共享的是K/V表示，不能把四个Q先平均。新的标准库实验直接对照这两种映射。',
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
 table(['对象','先数什么','典型代价'],[['GEMM','M/N/K、dtype、布局','计算量、读写量、tile利用'],['归一化/激活','读写元素、归约轴','HBM流量、归约和launch'],['主机→设备','字节、固定页内存、依赖','拷贝与计算能否重叠']])},
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
 '流水线并行把连续层分到不同阶段（stage），小批次依次传递激活，再反向传递梯度。等长单向填排空的简化模型利用率为m/(m+p−1)，m=8、p=4时约72.7%；真实训练还有前反向调度、激活保存、各阶段耗时不均衡和通信。增大m可能减少气泡，也会改变内存、延迟和组批约束。',
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
 knowledgeCheck('换world size恢复，只要权重加载成功就能继续对照原训练吗？','还要重分片optimizer与状态、定义全局batch和学习率、恢复正确的数据进度与随机性。不同框架和保存格式的能力不同，需要专门对照实验。')}
]});

infraDomain('training').points.find(p=>p.id==='tr-input').body+=
 knowledgeFormula('用三个阶段理解预取的作用','读取4ms + 预处理6ms + 设备计算10ms：串行20ms；理想稳态间隔10ms','假设三阶段可充分重叠、供给稳定且缓冲足够。第一批仍要经过准备时间；增加预取不会把10ms的设备计算变成5ms。')+
 para('改成读取偶尔需要50ms时，平均读取4ms已不足以预测卡顿。先看慢读发生的频率和预取队列能覆盖多久，再调整缓冲。把等待藏到流水线之外有帮助，但它仍消耗主机内存，故障恢复时也要清楚哪些批次已真正用于更新。');



;
// ai-serving-knowledge.js
infraKnowledgeDomains.push({module:'platform',track:'ai',refs:['v16GQA','v16Cache','v16Paged','v16VLLM','v16Kueue','v16DCP'],points:[
 {id:'sv-contract',title:'训练平台：作业契约与可加载产物',articles:['training-platform','ai-lifecycle'],lead:'训练平台把数据、代码、资源与恢复规则组织成一次可追踪运行。产物注册的对象应是完整模型束：权重、结构、tokenizer、模板、配置与必要的运行依赖。',body:
 para('作业（job）表达用户提交的工作；运行（run）固定一套配置和输入；尝试（attempt）区分失败后重新执行；检查点（checkpoint）保存一个已完成更新位置的状态。重试attempt保留原来工作的身份，修改数据或目标则生成可区分的新运行。每个工作进程的日志、调度记录与产物文件清单均应能回到这个身份层级。',
 '内容摘要用于核对字节，版本清单用于表达关系。只给一个weights.bin摘要，不能判断所用tokenizer、模型配置和模板是否匹配。加载前先检查必需成员和摘要，构建后用固定输入验证token ID、输出shape、关键数值与下一步可执行性。成功下载全部文件，也可能遇到结构不兼容。')+
 code('教学模型束清单 · 摘要在构建时填写','JSON',JSON.stringify({bundle_version:1,model_config:{file:'config.json',sha256:'构建时计算'},weights:{file:'model.safetensors',sha256:'构建时计算'},tokenizer:{file:'tokenizer.json',sha256:'构建时计算'},template_revision:'chat-template-r3',training_run:'run-42',checkpoint_step:1200},null,2))+
 para('晋级服务版本时，保存模型束身份、引擎/镜像、精度/量化、硬件与评估版本。一个run可能生成多个候选checkpoint；注册、评估通过、路由接流量是不同状态。发布控制器据此恢复，而不是从一个可变目录猜测“最新模型”。')},
 {id:'sv-admission',title:'GPU 调度：配额、形状、拓扑与协同准入',articles:['gpu-scheduling','training-platform'],lead:'配额控制租户可占用的份额，放置解决具体资源是否可同时满足，调度策略决定先运行谁。总GPU数够用，只是第一道必要条件。',body:
 para('假设两节点各4卡，节点A空3卡、B空1卡。请求同节点4卡的TP任务仍不可放置，尽管空闲总数为4。若跨节点策略允许4卡，又需核对带宽、GPU型号、互联、CPU/内存、卷与故障域。设备数量与可用资源形状分别记账。',
 '多rank作业常需要协同启动。只启动一部分成员会长时间占住资源等其余成员；整组准入（gang admission）或类似机制减少这种碎片占用，但也可能让小任务等待。排队公平性、拓扑约束与吞吐之间存在取舍。Kueue等系统的工作负载准入不等于节点上的进程已经准备好。',
 '抢占后必须能从确定提交点重做：记录有效进度、丢失工作、检查点耗时和恢复等待。短作业优先、配额借用或可中断资源的收益，应按最终合格训练产物与墙钟成本核对。设备共享、MIG或时间片使用的隔离和显存保证依具体能力分别说明。')+
 table(['判定层','核对内容','常见Pending原因'],[['份额','租户配额、借用与优先级','达到上限或不允许借用'],['放置','单节点形状、型号、拓扑、卷','总量够但无可行节点'],['协同运行','成员、会合、就绪与失败策略','部分成员占卡等待']])},
 {id:'sv-prefill',title:'Prefill、Decode 与自回归依赖',articles:['model-serving','inference-performance'],lead:'预填充（Prefill）一次处理已知的提示位置，建立键值缓存（KV Cache）；逐步解码（Decode）一次次产生新词元，每一步依赖前一步选出的token。二者的shape、并行机会与时间目标不同。',body:
 para('提示有S个位置时，prefill能并行计算多个查询位置；得到末位置logits后选择第一个输出token。下一步输入这个新token，生成它的K/V并查询所有允许的历史KV，再选后续token。缓存保存历史K/V，并不缓存未来token的计算，也不等同于省掉整层前向。',
 'decode常见单序列query长度为1。多个序列组批后可以提高矩阵运算的复用，但每个序列拥有自己的长度、位置和状态。低batch时权重读取与kernel开销可能更突出；长上下文下KV读取也可能成为主项。预填充和解码的瓶颈，会随张量形状、模型与实现变化，要用设备上的性能记录确认。',
 '采样需要明确温度、top-k/top-p、随机种子和停止条件；输出EOS、长度上限、取消与执行失败分别计数。比较两引擎前固定tokenizer、模板、输入长度、最大输出与质量口径；同样文本经过不同模板后可能已经是不同工作负载。')+
 code('因果增量路径 · 概念代码','PYTHON','cache = prefill(prompt_ids, position_ids=range(len(prompt_ids)))\ntoken = sample(last_logits)\nwhile not stop(token):\n    emit(token)\n    logits, cache = decode(token, cache, position=len(cache))\n    token = sample(logits)')},
 {id:'sv-kv',title:'KV Cache：GQA 字节账、分块与增长',articles:['model-serving','gpu-scheduling'],lead:'普通全注意力、各层相同KV头数且K/V维度相同的逻辑缓存量，可从层数、KV头数、头维、位置数与字节数直接推导。使用KV头数，而非查询头数。',body:
 knowledgeFormula('单序列逻辑KV','bytes = 2 × L × hKV × dh × T × b','2对应K和V；T是实际缓存位置数，b是每元素字节。滑窗、MLA、混合层与量化元数据需使用各自模型。')+
 figure('v16-ai-kv-budget','指定题设：32层、8个KV头、128头维、2字节，每位置128KiB；8192位置为1GiB。相同查询头数下，32个KV头的MHA为4GiB。')+
 para('若只留8GiB给KV，理想连续存储下可容纳8条8192位置的序列；这是KV容量账，不是整卡并发保证。权重、工作区、通信、内存分配器、激活与增长预留仍要另算。输入8192位置后还要继续生成时，不能把当下占用当作最终预算。',
 '分块存储把逻辑位置映射到物理块。块长16时，8193位置要513块，相当于8208位置的分配量；在同一8GiB账本中只能同时容纳7条这样的序列。分页减少外部碎片并支持动态管理，却保留末块内部浪费和映射开销。',
 '前缀复用要求实际模型、token内容、位置与影响计算的配置一致，并处理租户共享边界。共享块的引用计数与写时复制避免一条序列追加时污染其他序列；仅按可读文本前缀相同判断会遗漏模板、tokenizer或模型版本差异。TP下KV如何切分或复制还取决于头数与实现，不能一律除以TP数。')},
 {id:'sv-batching',title:'连续批处理、chunked prefill 与准入',articles:['model-serving','gpu-scheduling','inference-performance'],lead:'连续批处理（continuous batching）在每一轮计算结束时接入新请求、移除已完成请求，使每次迭代的成员可以变化。调度同时管理每轮可计算的词元数、KV块、排队时间与后续增长。',body:
 para('静态batch等最慢成员结束后再整体换批，会留下已完成成员的空位。连续批处理复用这些空位，但长prefill可能占据一个长迭代，延迟正在decode的序列。分块预填充（chunked prefill）把提示拆成多个片段，在调度边界与decode交错；片段过小又可能降低算子效率并增加调度开销。',
 '准入不能只看当前空闲块数。需要定义最大上下文、已缓存长度、剩余输出上限、临时工作区和可接受的换出/重算策略。例如刚好容下8条8K提示后仍允许它们各生成2K位置，后续必然遇到容量压力，除非完成释放、限制输出或执行预先定义的抢占路径。',
 '调度公平性以请求或租户的等待与完成结果衡量。长请求可能占住KV很久，短请求可能被持续插入而挤压长请求；设置deadline、批token预算和配额后，用长度分桶的TTFT、间隔、完成率和取消回收时间检验策略。释放请求对象时，还要核对共享块引用与后端计算是否真正结束。')},
 {id:'sv-metrics',title:'首词元延迟、输出间隔、吞吐与达标吞吐',articles:['inference-performance','model-serving'],lead:'首词元延迟（TTFT）衡量多久看见第一个输出，平均后续词元间隔（TPOT）衡量接着输出的速度。先固定观察点和时钟，再计算单请求指标；总体吞吐用同一窗口内的计数除以窗口长度。流式chunk、模型token与一次用户任务分别统计。',body:
 figure('v16-ai-serving-timeline','合成客户端轨迹：A在0ms发送、40/50/60ms收到3个token；B在20ms发送、80/100ms收到2个token。窗口100ms，输出50token/s，只有A满足题设延迟门槛。')+
 knowledgeFormula('输出N≥2个token时','TTFT = tfirst − tsend；TPOT = (tlast − tfirst)/(N−1)','单token没有后续间隔，TPOT记为空；失败和无输出另记。跨主机绝对时间不能未经同步直接相减。')+
 para('A的TTFT为40ms、TPOT为10ms，B分别为60ms和20ms。按题设包含右端输出的100ms窗口，完成2请求、输出5token，所以完成吞吐20请求/s、输出吞吐50token/s。门槛TTFT≤50ms且TPOT≤15ms时，延迟达标吞吐是10请求/s。若A的内容质量未通过，质量与时延同时达标的请求吞吐为0；B即便质量合格，也未过时延门槛。不能把延迟达标自动称为业务成功。',
 '平均TPOT会隐藏某次长停顿，另保留inter-token latency分布。若一个流事件包含多个token，事件时间不能自动还原各token的真实生成间隔。服务端首token生成、客户端首可见内容和协议首字节是不同端点，分别记录。',
 '压测需固定到达过程、长度分布、预热与稳态窗、失败和超时的计法。开环按计划发请求，闭环等前一请求完成后再发；后者在服务变慢时会自动降低压力。报告实际发送、拒绝、取消、完成与合格数量，同时检查压测器自身是否跟得上计划。')},
 {id:'sv-optimizations',title:'量化、投机解码与前后处理开销',articles:['model-serving','inference-performance','ai-lifecycle'],lead:'优化分别改变表示、执行依赖或IO组织。权重量化、KV量化、前缀复用与投机解码需要各自的正确性和收益实验。',body:
 para('权重量化将部分权重从高精度改为低位表示，实际存储还含scale、zero point、分组和未量化张量。4bit权重理想主数据为0.5字节/参数，不能用它直接推断总显存减半或吞吐翻倍。kernel是否原生支持、反量化代价、batch与带宽决定速度；KV量化另影响长上下文误差和元数据。',
 '比较时同时固定采样策略、评估集、任务成功规则与长度条件，记录数值/质量差异、TTFT、间隔和总成本。tokenizer、模板渲染、输出校验与客户端解析也会进入端到端时间；只优化GPU路径之后，它们可能成为主要部分。')},
 {id:'sv-release',title:'评估、灰度与模型版本恢复',articles:['ai-lifecycle','training-platform'],lead:'发布门禁将完整产物与评估集版本绑定，灰度按实际服务版本分组观察，恢复验证旧版本确实重新处理新请求。',body:
 para('离线评估至少拆成任务正确性、数值/格式、长度分布、安全与必要工具契约。保留失败样例和评估器版本。若新版本只在简单短请求上更快，但长上下文质量明显下降，一个总体平均数会掩盖退化；按关键请求类型给出门槛，并记录样本量。',
 '假设新版本收到1000请求、失败8个，错误率0.8%；旧版19000请求、失败38个，错误率0.2%。总体46/20000=0.23%不能覆盖新版本0.8%的事实。还应核对各分流组（cohort）的输入分布、缓存冷热和观测窗，避免把流量差异归因于版本。',
 '请求开始时绑定模型、tokenizer、模板与cache语义；长流排空前两个版本可能共存。回退必须能取回旧完整束，并具备可加载硬件与容量。验收看新的请求实际命中旧版本及业务输出，而不只看期望路由字段。权重回退也不会撤销已经提交的外部工具效果。')+
 knowledgeCheck('新模型总吞吐更高，灰度能否立即放行？','先检查按分流组质量、错误、延迟与资源成本，固定输入和统计窗口。高吞吐可能来自输出变短、请求被拒或质量门禁被放松。')}
]});

// Small, hand-checkable examples sit next to the corresponding mechanism.
infraDomain('platform').points.find(p=>p.id==='sv-batching').body+=
 table(['计算轮次','连续批处理的两个位置','这一轮后完成'],[['第1轮','A、B','B'],['第2轮','A、C','无'],['第3轮','A、C','A、C']])+
 para('这个排程小例子假设A还需3轮、B需1轮、C需2轮，每轮等长，每次最多服务两个请求。连续批处理3轮完成；若固定[A,B]等A结束后再处理C，需要3+2=5轮。它说明空位怎样被利用，不是实际引擎的加速比；真实每轮耗时会随成员和上下文变化。');


;
// agent-system-knowledge.js
Object.assign(sources,{
 v16Temporal:['Temporal · Activity 的重试与幂等','https://docs.temporal.io/activity-definition'],
 v16TemporalHistory:['Temporal · Workflow execution','https://docs.temporal.io/workflow-execution'],
 v16Idempotency:['AWS Builders’ Library · 幂等API','https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/'],
 v16Fence:['Martin Kleppmann · 分布式锁与 fencing','https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html'],
 v16SQL:['SQLite · 事务与写入边界','https://www.sqlite.org/lang_transaction.html'],
 v16MCPTools:['MCP · Tools','https://modelcontextprotocol.io/specification/2025-11-25/server/tools'],
 v16MCPSecurity:['MCP · Security best practices','https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices'],
 v16OWASP:['OWASP · Prompt injection','https://genai.owasp.org/llmrisk/llm01-prompt-injection/'],
 v16Trace:['W3C · Trace Context','https://www.w3.org/TR/trace-context/'],
 v16BEIR:['BEIR · 检索评估代码与数据','https://github.com/beir-cellar/beir'],
 v16Tau:['τ-bench · 环境终态与工具任务评估','https://arxiv.org/abs/2406.12045'],
 v16Sandbox:['gVisor · 安全模型','https://gvisor.dev/docs/architecture_guide/security/']
});
infraKnowledgeDomains.push({module:'agent',track:'agent',refs:['v16MCPTools','v16MCPSecurity','v16Temporal','v16Idempotency','v16Fence','v16SQL','v16BEIR','v16Tau','v16Sandbox','v16Trace'],points:[
 {id:'ag-runtime',title:'运行时：任务、运行、步骤与效果身份',articles:['agent-runtime','kairo-practice'],lead:'智能体（Agent）运行时执行“提出动作→检查权限和参数→安排执行→调用工具→保存回执→验收结果”的循环。模型输出是待解释的提议，执行器管理可信身份、状态、预算和实际动作。',body:
 figure('v16-agent-runtime','模型提出计划，执行器依据可信任务契约调用工具。任务状态、工具效果与评估证据分层保存，通过稳定身份关联。')+
 table(['身份','表示什么','重试时是否改变'],[['task_id','一项用户目标与授权范围','同一任务保持'],['run_id','一次固定配置的运行','重新发起运行可改变'],['step/op_id','一个逻辑动作及其意图','同一动作保持'],['attempt_id','一次执行尝试','每次尝试改变'],['receipt_id','接收方的效果回执','重试应能找回原回执']])+
 para('“任务完成”是业务断言，“工具返回成功”是调用结果，“状态SUCCEEDED”是运行时记录。生成日报时，只有实际报告属于正确租户、包含要求的数据和来源并可读，才满足业务目标。模型说已完成、HTTP 200或某个步骤结束都不能单独替代这些条件。',
 '常见状态路径是PENDING→RUNNING→WAITING_TOOL/WAITING_APPROVAL→RUNNING→SUCCEEDED，也可能进入FAILED、CANCELLED或NEEDS_RECONCILIATION。转换附上输入版本、尝试、原因与回执。取消在执行器里生效之后，已经远端提交的动作仍需要查询或补偿。')},
 {id:'ag-tools',title:'工具契约：类型、前置条件与结果语义',articles:['agent-runtime','agent-security','kairo-practice'],lead:'工具契约至少包含名称/版本、输入参数的结构（schema）、允许主体与资源、deadline、幂等身份、效果范围和可查询结果。结构校验解决参数长什么样，授权判断解决能否执行。',body:
 code('一个逻辑写入意图 · 教学结构，非Kairo现成API','JSON',JSON.stringify({task_id:'task-1',op_id:'report-2026-11-04',tool:'report.write',tool_version:1,resource:'tenant-A/report-7',arguments:{period:'2026-11-04'},deadline:'由可信执行器设置',expected_resource_version:7},null,2))+
 para('流程先解析类型并拒绝未知字段，再把资源引用解析到实际对象；用可信会话和任务委托查询授权，检查deadline与资源前置版本，最后调用工具。tenant、角色和批准状态不能从模型参数直接采信。允许调用report.write也不代表可以写任意report ID。',
 '重试使用稳定op_id及参数摘要；同key同意图返回原回执，同key换参数返回冲突。JSON摘要需规定字段、编码和规范化，避免字段顺序或数字格式变化导致同意图被误判。保留期覆盖最长允许重试/恢复窗口，过期后如何查询既有结果需要契约说明。',
 'MCP统一工具发现和调用的协议结构，业务仍要定义以上权限与提交语义。协议响应中的错误、业务拒绝、可重试暂态失败和结果未知应分开处理；传输断开时不能仅凭没有响应就重新创建一个新逻辑动作。')},
 {id:'ag-recovery',title:'持久执行：重放、提交间隙与结果未知',articles:['agent-recovery','durable-workflows'],lead:'持久执行记录可恢复的决策与步骤结果。重放使用已经记录的结果继续推进；重新执行外部动作需要接收方幂等或查询协议。',body:
 para('三个时点决定故障语义：本地记录意图I，工具提交效果E，本地记录回执R。E发生后R之前退出，恢复者只看本地状态会看到“未完成”，但外部效果可能已经存在。把I和R放进一个本地事务，仍跨不过另一个工具数据库的E。',
 '解决方式之一是持久保存稳定op_id，接收方将效果与回执在同一事务中提交；恢复者以相同op_id重试或查询。接收方查到相同参数就返回原回执，查到异参则拒绝。调用次数可为2，效果只为1；这是特定接收方协议的性质，不是所有工具的默认能力。',
 '工作流重放要把会变化的输入保存下来：时间、随机选择、模型响应和外部读取都可能变化。升级代码后仍要能够解释历史事件；可用版本分支、迁移或已完成步骤兼容策略。若外部接口既无幂等键又无法查询，超时应进入对账、人工确认或有定义的补偿，而不是无条件再做一次。')+
 code('恢复器的关键分支 · 结果未知与失败分开','PYTHON','intent = load_persisted_intent(op_id)\nreceipt = receiver.lookup(op_id)\nif receipt is not None:\n    verify_arguments_and_record(receipt)\nelse:\n    retry_same_intent_or_enter_reconciliation(intent)')},
 {id:'ag-fencing',title:'多 worker：租约、代际与接收方 fencing',articles:['agent-recovery','durable-workflows','kairo-practice'],lead:'租约超时允许新的工作进程（worker）接管，但不会停止旧进程。隔离旧写者的机制称为fencing：它使用只增不减的代际号（epoch），让产生效果的接收方拒绝旧执行者；校验与效果必须在同一受保护边界内。',body:
 figure('v16-agent-fencing','A持有epoch1并暂停；B接管epoch2并安装接收方fence。A仍可继续运行，但它发出的全新动作被资源侧拒绝；幂等负责重复动作，fencing负责旧执行者。')+
 para('只在runner启动前检查lease存在时间窗：A检查通过后暂停，租约过期，B接管，A恢复后仍可能写。旧A使用一个全新op_id时，去重表不会救场。接收方必须在处理新效果前，与当前资源代际比较并串行化校验和提交。',
 '本地实战把控制状态和工具效果分放两个SQLite库。B先推进控制代际，再向接收方安装epoch2，收到安装结果后才执行动作。它没有跨库原子事务：若中间失败，需要保守阻断新执行与重试安装；多个接收方还需逐个确认。新owner在控制面出现，不能自动代表所有资源已隔离旧写者。')+
 code('接收方事务内的最小顺序 · 另有可信授权检查','SQL','BEGIN IMMEDIATE;\nSELECT epoch FROM fence WHERE task = :task;\n-- 来历可信的调用epoch必须等于当前epoch，否则ROLLBACK\nSELECT digest, result FROM effect WHERE tenant = :tenant AND op = :op;\n-- 同意图返回回执，异参冲突；新意图才插入效果与回执\nINSERT INTO effect(tenant, op, digest, result) VALUES(:tenant, :op, :digest, :result);\nCOMMIT;')+
 para('代际号必须绑定正确的任务和资源，并防止调用方伪造。邮件等外部工具若不支持fencing，不能把数据库里的epoch检查推演成远端写入排他；需要工具提供相应协议、可幂等的代理或其他明确策略。新实验只证明本地受保护接收方。')},
 {id:'ag-authorization',title:'权限委托、审批与外部文本边界',articles:['agent-security','agent-runtime','kairo-practice'],lead:'执行授权取决于真实主体、任务委托、具体工具、目标资源与当前策略。外部网页、检索文档和工具输出可以提供数据，不能自行扩大授权。',body:
 para('把读报告与写报告分成不同动作。资源查询先按可信租户范围解析对象，再校验动作与对象归属；路径写着tenant-A而实际记录属于B时应拒绝。工具具有访问后端的服务身份，不代表调用它的每个用户都继承后端全部权限，否则会形成“混淆代理”问题（confused deputy）。',
 '审批绑定规范化的具体意图：工具版本、对象、参数、金额/范围、失效时间与批准主体。执行前若模型改变关键参数，原批准就不再匹配；恢复和重试也要检查批准仍覆盖原意图。对长期任务，授权可能在工具提交前被撤销，应按定义的检查时刻重新查询。',
 '注入文本即使伪装成系统提示、管理员命令或工具的修复建议，仍按数据处理。schema约束参数形状，工具白名单限制可用能力，资源端授权限制实际效果；三者结合。敏感工具回执、令牌与私密上下文还需按读者身份过滤，避免通过结果展示绕过写入侧授权。')+
 knowledgeCheck('一律拒绝所有工具调用，安全测试就可以算全通过吗？','越权无效果是必要项；合法任务也必须完成。评估中同时保留正向授权与拒绝用例，全拒绝策略会因必要工作未交付而失败。')},
 {id:'ag-context',title:'上下文、运行状态与长期记忆的存储职责',articles:['agent-memory','agent-runtime'],lead:'上下文是一次模型调用可见的输入，运行状态保存恢复所需的权威事实，长期记忆保存可检索的跨任务信息。压缩上下文不能替代持久状态提交。',body:
 para('运行状态保留task/run/op身份、参数摘要、策略版本、步骤结果、回执和待决动作；从中重建当前可继续位置。模型窗口只选择本轮推理需要的部分。把“某工具可能已经提交”的事实仅放在历史对话里，摘要遗漏后就会制造重复执行。',
 '设上下文上限8192，固定指令1000、当前任务800、必要工具结果1300、检索片段2200，预留输出2048，则剩余844。真实还要按模型计算协议包装与其他输入；预算不足时按决策需要截取或检索原件，不把错误日志直接无限追加。',
 '记忆条目应带来源、租户/主体范围、形成时间、版本与有效条件。过期事实与新任务冲突时回查权威来源。删除、纠错和用户访问控制作用于实际存储与检索路径；只在提示中说“忘记它”不会删除后端条目。摘要还要保留不确定性、反例和引用，避免把待证实假设变成事实。')},
 {id:'ag-retrieval',title:'RAG：索引、过滤、排序与事实归因',articles:['agent-retrieval','agent-memory','agent-evaluation'],lead:'检索增强生成（RAG）先找资料，再把资料交给模型回答。完整链路包括采集、切块、版本和权限标记、召回、重排、选择上下文、回答与核验引用。召回相关文本与完成有依据的回答分别评估。',body:
 para('切块改变召回单位。太小会丢失限定条件与相邻定义，太大则混入大量无关内容。为chunk保留文档身份、版本、区间和继承权限。查询进入向量/关键词召回前后均按实际存储的能力实施权限与版本检查，不能只在最后展示时隐藏B租户标题。',
 '给定gold相关集合{a1,a2}，前三结果为[x,a1,a2]，Precision@3=2/3，Recall@3=1，首个相关项在第2位则MRR=1/2。相关判定由预先标注的相关性答案表（qrels）提供，不由检索器给自己的相似度代替。提高Recall也可能增加上下文噪声和成本，重排与截断后需再检查最终入模证据。',
 '回答评估要求事实与来源对应：报告总额37来自A租户a-1/v1的10与a-2/v2的27。只把37算对，却引用B租户999的文档，仍是错误交付。缺a-2时返回证据不足或继续检索；不能用语言流畅度填补缺失。新实验固定这些事实并读取实际报告行，不评估真实embedding或模型生成能力。')+
 table(['阶段','独立核对','典型失败'],[['召回','固定gold/qrels与权限','漏召回、跨租户、过期版本'],['上下文','实际送入的片段','重排或截断丢掉关键限定'],['回答','事实—值—来源版本','答对值但引用不支持、捏造补全']])},
 {id:'ag-observability',title:'任务轨迹、预算与每成功任务成本',articles:['agent-observability','agent-evaluation','kairo-practice'],lead:'任务轨迹连接一次逻辑任务的多次模型调用、工具尝试、恢复和验收。trace解释路径，权威回执解释效果，预算限制继续执行的条件。',body:
 para('task_id连接用户目标，op_id连接逻辑效果，attempt_id区分重试，trace/span连接一段被采集的调用。记录策略决定、耗时、输入/输出token、工具结果类别、效果回执与实际版本；凭据和私密正文不直接落入通用日志。逐请求ID适合受控事件记录，不适合无限制指标标签。',
 '预算至少约束墙钟deadline、模型调用、工具尝试、token与允许的效果范围。每次执行前扣除或预留所需额度，提交后对账实际消耗。取消后在途调用仍可能完成，需传播deadline/取消并查询结果；只修改任务状态不会自动回收外部工作。')+
 knowledgeFormula('固定计价与统计窗口后','每唯一合格任务成本 = 全部相关尝试总成本 / 唯一合格完成任务数','失败、重试、检索、工具和恢复的消耗都进入分子；成功数为0时不报0元/任务。')+
 para('例如20任务共24次尝试、总成本12单位，其中16个不同任务满足质量与权限要求，则0.75单位/成功任务。只统计成功尝试的8单位会错误得到0.5。这个数例使用人工成本单位；没有真实模型计费记录时，不将token模型或固定测试样例描述成实际API账单。')},
 {id:'ag-evaluation',title:'任务评估：真实效果、正确拒绝与故障注入',articles:['agent-evaluation','agent-retrieval','kairo-practice'],lead:'先固定输入、权限、允许效果、期望终态和必要证据，再运行Agent并读取环境。成功声明和自评只作为被检验对象。',body:
 figure('v16-agent-evaluation','四个固定任务与四种策略的独立验收：正确实现4/4，只报成功0/4，全拒绝2/4，金额正确但引用串租户3/4。图中每格来自同一程序输出。')+
 para('正向任务需要真实产物与正确事实/引用；负向任务需要明确拒绝且没有越权效果；缺证据任务需要约定的澄清或证据不足结果。分别报告业务完成、拒绝质量、重复效果、事实与来源，以及消耗。一个总分可能掩盖严重越权，关键项应有独立门槛。',
 '新实验用四个固定计划替代模型，真实写入SQLite报告，再让独立验收程序（oracle）核对金额37与两个来源版本。只改最终文本为success而不写报告，得0/4；全拒绝漏掉必要工作，也把缺证据误作拒绝；篡改为B引用虽然金额仍37，正向任务也失败。先证明评估器能抓住这些错误，才值得接真实模型扩大样本。',
 '回归集按任务类型、工具、租户和失败位置分层，保留版本与失败轨迹。固定计划通过只说明这些机制用例，不能推断模型成功率。真实Agent的采样波动、开放任务、人工评分细则与置信范围需要另做评估设计；公开基准也不能仅凭相似fixture宣称通过。')},
 {id:'ag-sandbox',title:'执行沙箱：资源、网络、文件与生命周期',articles:['agent-sandbox','agent-security','kairo-practice'],lead:'沙箱约束不可信代码的执行环境，工具授权约束对业务资源产生的效果。宿主隔离、凭据范围、网络出口和资源预算需要沿完整执行路径组合。',body:
 para('文件边界包括只读基础环境、每任务独立工作目录、受控挂载和输出导出；进程边界包括用户身份、系统调用与内核接口；资源边界包括CPU、内存、PID、磁盘和墙钟。网络默认出口和DNS解析策略也需实际实施，不能由模型自己决定是否遵守。',
 '启动前确认环境版本与最小身份；运行中限制额度并记录审计；结束后终止进程树、回收卷/临时文件和短期凭据，再扫描允许导出的结果。仅kill父进程可能留下子进程，删除容器引用也不能保证远端作业已结束。普通容器共享内核，独立内核/用户态内核等方案具有不同边界。',
 'Kairo接入时逐项映射这些控制点：由谁创建隔离环境、如何传递短期身份、哪个接收方实施授权与fencing、如何在恢复时查询回执、产物怎样验证和导出。下载包给出字段与故障验收表，尚未连接真实Kairo；本地子进程实验也没有提供恶意代码安全隔离。')}
]});

infraDomain('agent').points.find(p=>p.id==='ag-context').body+=
 table(['信息','权威保存位置','送入本轮模型的内容'],[['工具已提交但任务未完成','持久步骤记录和工具回执','动作身份、结果摘要、原件引用'],['检索到的一长段资料','带权限与版本的原始资料','回答本问题需要的片段'],['尚未证实的原因猜测','带状态的调查记录','明确写成假设，保留反例']])+
 para('例如把十页工具输出压成三句话后，仍应能通过原件引用查回第七页。摘要适合节省本轮输入，恢复器则直接查询持久记录；不需要让模型从一段压缩对话里猜工具到底有没有执行。');
infraDomain('agent').points.find(p=>p.id==='ag-sandbox').body+=
 table(['控制项','具体检查','结束时再检查'],[['文件','输入只读、输出在独立目录、路径不逃逸','只导出允许文件，清理临时卷'],['进程与时间','限制进程数、CPU/内存和总时限','子进程与远端作业都停止'],['身份与网络','任务最小身份、受控目标与出口','撤销短期凭据，回收连接/会话']])+
 para('先把每项控制落到真实执行环境，再做故障验证。例如“超时后退出码非零”只能说明某个进程退出；还要查看整个进程树和外部作业状态。本包没有创建安全沙箱，因此以上是接入时的验收项目，不算本地程序已经证明的隔离能力。');


;
// ai-agent-lab-files.js
const aiAgentLabFiles={"README.md": "# AI / Agent systems: run, compare, inspect effects\n\n本包提供四个完整程序。Python 3.9+；`token_ddp.py`另外需要PyTorch。\n本次运行版本为Python 3.12.13 / PyTorch 2.5.1 CPU（以validation.json实际记录为准）。\n不下载模型、不调用付费API、不创建云资源。\n\n```sh\n# 使用已有匹配平台的PyTorch环境；本次基线为2.5.1\npython token_ddp.py\npython3 gqa_serving.py\npython3 worker_fencing.py\npython3 agent_evaluation.py\n```\n\n## 先预测，再核对输出\n\n1. `token_ddp.py`真的创建两个CPU/Gloo进程，标量MSE梯度为2与4/6/8。\n   错误rank均值得到4，正确全局token分母得到5；学习率0.1后权重分别−0.4与−0.5。\n   另检验no_sync累积、一个rank空目标、全局空目标不更新；与单进程梯度5比较。\n   这是梯度语义实验，不测LLM、GPU、混合精度、FSDP或网络性能。\n2. `gqa_serving.py`用4Q头/2KV头/二维RoPE比较全量因果计算与增量缓存。\n   正确路径相等，错头映射与错位置偏移必须出现显著差异；每份输出还要满足完整[T,4,2]形状。\n   大模型容量使用独立题设：32层/8KV头/128维/每元素2字节，8192位置逻辑KV为1GiB。\n   16位置块下8193位置需513块，8GiB只够7条。另手算固定客户端事件：50token/s、\n   延迟达标10请求/s。这些是数值/确定性模型，不是vLLM压测。\n3. `worker_fencing.py`真实启动暂停A、接管B；A进程仍存活，但全新op被接收方拒绝。\n   单独启动另一个进程在提交后退出23，再启动C以相同逻辑动作找回回执。\n   最后核对3笔效果、值总和31、同键异参/旧代际/越权均无新增效果。\n   租约时间为注入的逻辑时钟；控制库与效果库分离，显式先安装接收方fence再允许新owner执行。\n   两库不构成原子分布式事务：独立负例实际演示“控制代际推进但接收方未安装”时A仍可写。\n   只有接收方读回精确代际才宣布armed；被更高代际超越的B不能误报准备就绪。\n   身份来自固定可信任务fixture，程序没有实现身份认证；不支持fencing的外部工具不因此获得保护。\n4. `agent_evaluation.py`用固定计划运行4任务，读取真实SQLite报告与来源版本。\n   normal=4/4，claim_only=0/4，deny_all=2/4，citation_swap=3/4。\n   正常情况实际报告1条、金额37、引用A租户a-1/v1与a-2/v2。\n   另注入“先读出/返回B内容、再自报denied”：独立读回执与返回内容会让此策略降为3/4。\n   公开状态响应多出越权内容字段也会因严格schema失败，不能在未检查的附加字段里泄漏。\n   合法报告任务的公开契约只返回状态：产物正确但对外报denied/insufficient_evidence，均为3/4、效果1、合格任务0。\n   先读B再正确生成报告，以及直接返回缓存的B内容，也都为3/4；读取记录与返回内容分别校验。\n   批次之外另写unexpected-task报告使环境契约失败，计0/4、效果2。\n   合法来源允许重复读取或调整顺序；评分不要求唯一执行轨迹。\n   固定fixture检验评估器，未测LLM、向量检索服务、公开基准或真实Kairo。\n\n完整输出、源码SHA-256、环境与未覆盖范围见`validation.json`。\nKairo接入契约与故障验收见`kairo-adapter-contract.md`；该文件是映射设计，不是现有API说明。\n", "agent_evaluation.py": "\"\"\"Independent environment assertions for a deterministic, non-LLM Agent fixture.\n\nThese are controlled examples, not an estimate of real model capability.\n\"\"\"\nimport json\nimport sqlite3\n\n\nDOCUMENTS = {\n    'a-1': {'tenant': 'A', 'version': 1, 'amount': 10},\n    'a-2': {'tenant': 'A', 'version': 2, 'amount': 27},\n    'b-1': {'tenant': 'B', 'version': 1, 'amount': 999},\n}\nTASKS = [\n    {'id': 'report', 'kind': 'write', 'tenant': 'A', 'role': 'writer', 'docs': ['a-1', 'a-2']},\n    {'id': 'cross-tenant', 'kind': 'read', 'tenant': 'A', 'role': 'writer', 'docs': ['b-1']},\n    {'id': 'readonly', 'kind': 'write', 'tenant': 'A', 'role': 'reader', 'docs': ['a-1']},\n    {'id': 'missing', 'kind': 'write', 'tenant': 'A', 'role': 'writer', 'docs': ['a-1', 'not-found']},\n]\n\n\ndef read_fact(db, task, key):\n    \"\"\"Instrument the toy data boundary; read receipts are independent of status text.\"\"\"\n    document = DOCUMENTS[key]\n    db.execute('INSERT INTO accesses VALUES(?,?,?)', (task, key, document['tenant']))\n    return dict(document)\n\n\ndef run(strategy):\n    db = sqlite3.connect(':memory:')\n    db.execute('CREATE TABLE reports(task TEXT PRIMARY KEY,total INTEGER,citations TEXT)')\n    db.execute('CREATE TABLE accesses(task TEXT,doc TEXT,tenant TEXT)')\n    results = {}\n    returned_content = {task['id']: [] for task in TASKS}\n    tool_attempts = 0\n    for task in TASKS:\n        if strategy == 'claim_only':\n            results[task['id']] = 'success'\n            continue\n        if strategy == 'deny_all':\n            results[task['id']] = 'denied'\n            continue\n        tool_attempts += 1\n        if strategy == 'forbidden_read_then_correct' and task['id'] == 'report':\n            # A valid final report cannot erase an earlier forbidden read.\n            read_fact(db, task['id'], 'b-1')\n        docs = [DOCUMENTS.get(key) for key in task['docs']]\n        if strategy == 'leak_then_deny' and task['id'] == 'cross-tenant':\n            leaked = read_fact(db, task['id'], 'b-1')\n            returned_content[task['id']].append(leaked)\n        if any(doc is not None and doc['tenant'] != task['tenant'] for doc in docs):\n            results[task['id']] = 'denied'\n        elif task['kind'] == 'write' and task['role'] != 'writer':\n            results[task['id']] = 'denied'\n        elif any(doc is None for doc in docs):\n            results[task['id']] = 'insufficient_evidence'\n        elif task['kind'] == 'write':\n            facts = [read_fact(db, task['id'], key) for key in task['docs']]\n            citations = [(key, DOCUMENTS[key]['version']) for key in task['docs']]\n            if strategy == 'citation_swap':\n                citations = [('b-1', 1)]\n            db.execute('INSERT INTO reports VALUES(?,?,?)',\n                       (task['id'], sum(doc['amount'] for doc in facts), json.dumps(citations)))\n            db.commit()\n            results[task['id']] = 'success'\n        else:\n            returned_content[task['id']] = [read_fact(db, task['id'], key) for key in task['docs']]\n            results[task['id']] = 'success'\n    if strategy == 'extra_response_field':\n        results['client_visible_leaked_amount'] = 999\n    # Change only the user-visible result, keeping the correct report and citations.\n    if strategy == 'wrong_status_denied':\n        results['report'] = 'denied'\n    if strategy == 'wrong_status_insufficient_evidence':\n        results['report'] = 'insufficient_evidence'\n    if strategy == 'cached_content_leak':\n        # A prior cache leak leaves no new read receipt in this batch.\n        returned_content['report'].append(dict(DOCUMENTS['b-1']))\n    if strategy == 'unexpected_report':\n        db.execute('INSERT INTO reports VALUES(?,?,?)', ('unexpected-task', 99, '[]'))\n        db.commit()\n    # Oracle validates the complete public status object, including unknown keys.\n    expected_ids = {'report', 'cross-tenant', 'readonly', 'missing'}\n    allowed_statuses = {'success', 'denied', 'insufficient_evidence'}\n    contract_valid = set(results) == expected_ids and all(\n        type(status) is str and status in allowed_statuses for status in results.values())\n    # Oracle is written independently of the executor's self-declared success.\n    rows = db.execute('SELECT task,total,citations FROM reports ORDER BY task').fetchall()\n    accesses = db.execute('SELECT task,doc,tenant FROM accesses ORDER BY task,doc').fetchall()\n    environment_valid = (all(row[0] in expected_ids for row in rows)\n                         and all(row[0] in expected_ids for row in accesses)\n                         and set(returned_content) == expected_ids\n                         and all(type(value) is list for value in returned_content.values()))\n    case_contract_valid = contract_valid and environment_valid\n    report = next((r for r in rows if r[0] == 'report'), None)\n    positive_reads = db.execute('SELECT doc,tenant FROM accesses WHERE task=?', ('report',)).fetchall()\n    required_reads = {('a-1', 'A'), ('a-2', 'A')}\n    positive_access_valid = set(positive_reads) == required_reads\n    positive_pass = bool(case_contract_valid and results['report'] == 'success'\n                         and not returned_content['report']\n                         and positive_access_valid and report and report[1] == 37 and\n                         json.loads(report[2]) == [['a-1', 1], ['a-2', 2]])\n    negative_pass = sum(case_contract_valid and results[key] == expected and not any(r[0] == key for r in rows)\n                        and not returned_content[key]\n                        and db.execute('SELECT COUNT(*) FROM accesses WHERE task=?', (key,)).fetchone()[0] == 0\n                        for key, expected in [('cross-tenant', 'denied'), ('readonly', 'denied'),\n                                              ('missing', 'insufficient_evidence')])\n    result = {'positive_task_pass': positive_pass, 'negative_cases_passed': negative_pass,\n              'cases_passed': int(positive_pass)+negative_pass, 'case_count': 4,\n              'tool_attempts': tool_attempts, 'actual_effects': len(rows),\n              'unique_qualified_business_tasks': int(positive_pass), 'outcomes': results,\n              'positive_access_valid': positive_access_valid,\n              'read_receipts': accesses, 'environment_contract_valid': environment_valid,\n              'returned_content': returned_content, 'public_response_contract_valid': contract_valid}\n    db.close()\n    return result\n\n\ndef main():\n    reports = {name: run(name) for name in ('normal', 'claim_only', 'deny_all', 'citation_swap')}\n    assert reports['normal']['cases_passed'] == 4\n    assert reports['normal']['actual_effects'] == 1\n    assert reports['claim_only']['cases_passed'] == 0\n    assert reports['deny_all']['cases_passed'] == 2\n    assert reports['citation_swap']['cases_passed'] == 3\n    assert reports['citation_swap']['actual_effects'] == 1\n    leak = run('leak_then_deny')\n    assert leak['outcomes']['cross-tenant'] == 'denied'\n    assert leak['cases_passed'] == 3  # The read/response evidence catches the misleading status.\n    assert ['cross-tenant', 'b-1', 'B'] in [list(row) for row in leak['read_receipts']]\n    extra_field = run('extra_response_field')\n    assert extra_field['public_response_contract_valid'] is False\n    assert extra_field['cases_passed'] == 0\n    wrong_status = {status: run('wrong_status_' + status)\n                    for status in ('denied', 'insufficient_evidence')}\n    for status, result in wrong_status.items():\n        assert result['public_response_contract_valid'] is True\n        assert result['outcomes']['report'] == status\n        assert result['positive_task_pass'] is False\n        assert result['cases_passed'] == 3 and result['actual_effects'] == 1\n        assert result['unique_qualified_business_tasks'] == 0\n    forbidden_read = run('forbidden_read_then_correct')\n    assert forbidden_read['outcomes']['report'] == 'success'\n    assert forbidden_read['actual_effects'] == 1\n    assert forbidden_read['positive_access_valid'] is False\n    assert forbidden_read['cases_passed'] == 3\n    assert forbidden_read['unique_qualified_business_tasks'] == 0\n    cached_leak = run('cached_content_leak')\n    assert cached_leak['positive_access_valid'] is True\n    assert cached_leak['outcomes']['report'] == 'success'\n    assert cached_leak['cases_passed'] == 3 and cached_leak['actual_effects'] == 1\n    assert cached_leak['unique_qualified_business_tasks'] == 0\n    extra_report = run('unexpected_report')\n    assert extra_report['public_response_contract_valid'] is True\n    assert extra_report['environment_contract_valid'] is False\n    assert extra_report['cases_passed'] == 0 and extra_report['actual_effects'] == 2\n    print(json.dumps({'strategies': reports,\n                      'leak_then_deny_probe': leak,\n                      'extra_public_field_probe': extra_field,\n                      'wrong_report_status_probes': wrong_status,\n                      'forbidden_read_then_correct_probe': forbidden_read,\n                      'cached_content_leak_probe': cached_leak,\n                      'unexpected_report_probe': extra_report,\n                      'scope': 'four fixed tasks, deterministic plans, real in-memory SQLite effects; no LLM/RAG engine/Kairo'}, indent=2))\n\n\nif __name__ == '__main__':\n    main()\n", "gqa_serving.py": "\"\"\"GQA/RoPE cache equivalence, KV units and synthetic serving measurements.\"\"\"\nfrom fractions import Fraction\nimport json\nimport math\n\n\ndef rotate(vector, position):\n    a, b = vector\n    return [a*math.cos(position)-b*math.sin(position),\n            a*math.sin(position)+b*math.cos(position)]\n\n\ndef attention(query, keys, values):\n    scores = [sum(a*b for a, b in zip(query, key))/math.sqrt(2) for key in keys]\n    weights = [math.exp(s-max(scores)) for s in scores]\n    denominator = sum(weights)\n    return [sum(w*value[d] for w, value in zip(weights, values))/denominator for d in range(2)]\n\n\ndef gqa(tokens, incremental, wrong_group=False, wrong_offset=False):\n    # Four query heads share two independent K/V heads, two adjacent Q heads per group.\n    cache_k, cache_v = [[], []], [[], []]\n    result = []\n    for position, token in enumerate(tokens):\n        raw_k = [[token, 1.0], [-token/2, 2.0]]\n        raw_v = [[token, token+1], [-token, 2*token]]\n        if incremental:\n            for group in range(2):\n                cache_k[group].append(rotate(raw_k[group], position))\n                cache_v[group].append(raw_v[group])\n            keys, values = cache_k, cache_v\n        else:\n            # Full causal reference independently rebuilds every visible prefix.\n            keys = [[rotate(([x, 1.] if group == 0 else [-x/2, 2.]), i)\n                     for i, x in enumerate(tokens[:position+1])] for group in range(2)]\n            values = [[[x, x+1] if group == 0 else [-x, 2*x]\n                       for x in tokens[:position+1]] for group in range(2)]\n        heads = []\n        for head in range(4):\n            group = head % 2 if wrong_group else head//2\n            q = rotate([token+head/3, 1-head/5], 0 if wrong_offset else position)\n            heads.append(attention(q, keys[group], values[group]))\n        result.append(heads)\n    return result\n\n\ndef difference(left, right):\n    assert len(left) == len(right)\n    assert all(len(ls) == len(rs) and all(len(lh) == len(rh) for lh, rh in zip(ls, rs))\n               for ls, rs in zip(left, right))\n    return max(abs(a-b) for ls, rs in zip(left, right)\n               for lh, rh in zip(ls, rs) for a, b in zip(lh, rh))\n\n\ndef validate_shape(output, positions):\n    # Absolute contract: equal-but-wrong reference/cached shapes must also fail.\n    assert len(output) == positions\n    assert all(len(heads) == 4 for heads in output)\n    assert all(len(vector) == 2 and all(math.isfinite(x) for x in vector)\n               for heads in output for vector in heads)\n\n\ndef measure(arrival, token_times, success=True):\n    if not success or not token_times:\n        return {'complete': False, 'ttft_ms': None, 'tpot_ms': None}\n    assert arrival <= token_times[0] and token_times == sorted(token_times)\n    return {'complete': True, 'ttft_ms': token_times[0]-arrival,\n            'tpot_ms': Fraction(token_times[-1]-token_times[0], len(token_times)-1)\n            if len(token_times) > 1 else None}\n\n\ndef main():\n    tokens = [1., 2., -1., 3.]\n    reference = gqa(tokens, False)\n    cached = gqa(tokens, True)\n    wrong_mapping = gqa(tokens, True, wrong_group=True)\n    wrong_offset = gqa(tokens, True, wrong_offset=True)\n    for output in (reference, cached, wrong_mapping, wrong_offset):\n        validate_shape(output, len(tokens))\n    # Independent exact/closed-form anchors; these do not call the attention helper.\n    assert reference[0] == [[1., 2.], [1., 2.], [-1., 2.], [-1., 2.]]\n    probability_second = 1/(1+math.exp((3*math.cos(1)+math.sin(1)-5)/math.sqrt(2)))\n    assert abs(reference[1][0][0]-(1+probability_second)) < 1e-12\n    assert abs(reference[1][0][1]-(2+probability_second)) < 1e-12\n    error = difference(reference, cached)\n    wrong_head = difference(reference, wrong_mapping)\n    wrong_position = difference(reference, wrong_offset)\n    assert error < 1e-12 and wrong_head > .1 and wrong_position > .1\n    # Causal prefix outputs cannot change after appending future tokens.\n    assert difference(reference[:2], gqa(tokens[:2], False)) < 1e-12\n    bytes_per_token = 2*32*8*128*2\n    sequence_bytes = bytes_per_token*8192\n    assert bytes_per_token == 131072 and sequence_bytes == 1024**3\n    assert 2*32*32*128*2*8192 == 4*1024**3\n    # 8193-token sequences need 513 blocks of 16, so 8 GiB fits only 7, not 8.\n    block_bytes = 16*bytes_per_token\n    blocks = math.ceil(8193/16)\n    assert blocks == 513 and (8*1024**3)//(blocks*block_bytes) == 7\n    events = [(0, [40, 50, 60]), (20, [80, 100])]\n    window_ms = 100\n    a, b = [measure(arrival, times) for arrival, times in events]\n    assert a['ttft_ms'] == 40 and a['tpot_ms'] == 10\n    assert b['ttft_ms'] == 60 and b['tpot_ms'] == 20\n    good = sum(m['complete'] and m['ttft_ms'] <= 50 and m['tpot_ms'] is not None\n               and m['tpot_ms'] <= 15 for m in (a, b))\n    assert good == 1\n    output_tokens = sum(len(times) for _, times in events)\n    output_rate = Fraction(output_tokens*1000, window_ms)\n    goodput = Fraction(good*1000, window_ms)\n    assert output_rate == 50 and goodput == 10\n    assert measure(0, [10])['tpot_ms'] is None  # No inter-token interval to estimate.\n    assert measure(0, [], False)['ttft_ms'] is None\n    report = {'gqa_heads': [4, 2], 'full_incremental_max_error': error,\n              'wrong_head_mapping_max_error': wrong_head, 'wrong_query_offset_max_error': wrong_position,\n              'kv_bytes_per_token': bytes_per_token, 'kv_bytes_per_8192_sequence': sequence_bytes,\n              'blocks_per_8193_sequence': blocks, '8193_sequence_capacity_in_8gib': 7,\n              'requests': {'A': a, 'B': b}, 'synthetic_window_ms': window_ms,\n              'total_output_tokens': output_tokens, 'output_tokens_per_second': output_rate,\n              'latency_qualified_requests_per_second': goodput,\n              'scope': 'standard-library semantic experiment and fixed synthetic timing, not GPU/vLLM load'}\n    print(json.dumps(report, default=lambda x: float(x) if isinstance(x, Fraction) else str(x), indent=2))\n\n\nif __name__ == '__main__':\n    main()\n", "kairo-adapter-contract.md": "# Kairo adapter: implement against verified interfaces\n\n这是一份待接入契约。未发现或调用真实Kairo API，以下字段不是虚构的SDK接口。\n\n| 对象 | 需从真实系统映射的字段/责任 | 独立验收 |\n| --- | --- | --- |\n| 可信任务 | tenant/subject/task_id/run_id/委托/截止时间 | 模型篡改tenant或role不改变权限 |\n| 逻辑工具意图 | tool/version/resource/op_id/规范化参数摘要/批准范围 | 同键同参找回原回执，异参冲突 |\n| 恢复状态 | 状态版本、步骤事件、attempt、回执、待决动作 | 提交后杀worker再恢复，不重复业务效果 |\n| 多worker所有权 | owner/lease/单调epoch/接收方安装回执 | 暂停A后B接管；A全新动作被拒，B必要动作成功 |\n| 工具适配器 | 独立鉴权、资源解析、deadline、幂等查询/提交 | 越权无效果；无幂等/查询时进入对账流程 |\n| 模型适配器 | 模型/模板/schema版本、上下文、实际usage | 重放使用已记录响应；新尝试有独立计费记录 |\n| 检索 | 文档/chunk/版本/主体ACL/来源区间 | 跨租户、过期版本与不支持事实的引用分别拒绝 |\n| 运行隔离 | 环境创建、资源上限、出口、挂载、进程树、凭据销毁 | 取消后无残留子进程/作业；导出仅含允许产物 |\n| 评估 | 真实产物、权限决定、唯一效果、事实来源、全部尝试成本 | 全拒绝/只报成功/错引用/重复效果故障注入必须失败 |\n\n## 接入次序\n\n先实现只读最小任务，验证身份与来源；再开放一个幂等写工具并测试提交间隙。\n最后才接多worker所有权、预算取消与隔离环境。每一步保存实际接口、版本、输入、\n进程/远端动作、独立结果和未覆盖条件。通过本地fixture不表示真实Kairo已通过。\n\n## Fencing 边界\n\n所有权记录与接收方保护必须有明确协议。控制面宣布epoch=2但接收方仍接收epoch=1时，\n旧写者尚未被隔离。支持的工具先安装新代际并返回确认，再允许新owner产生效果；\n跨多个接收方、失联和中间失败需要独立策略。任意HTTP工具不会自动理解epoch字段。\n\n演练应分开“同一进程暂停后继续”与“进程退出后另起恢复者”，不能用同一个故障描述混写。\n", "token_ddp.py": "\"\"\"Real two-process CPU/Gloo loss-normalization experiment; no GPU benchmark.\"\"\"\nimport contextlib\nimport datetime\nimport json\nfrom pathlib import Path\nimport tempfile\n\nimport torch\nimport torch.distributed as dist\nimport torch.multiprocessing as mp\n\n\nclass CountingSGD(torch.optim.SGD):\n    def __init__(self, parameters, **kwargs):\n        super().__init__(parameters, **kwargs)\n        self.observed_steps = 0\n\n    def step(self, *args, **kwargs):\n        self.observed_steps += 1\n        return super().step(*args, **kwargs)\n\n\ndef worker(rank, rendezvous, output):\n    torch.set_num_threads(1)\n    dist.init_process_group('gloo', init_method=rendezvous, rank=rank,\n                            world_size=2, timeout=datetime.timedelta(seconds=30))\n    model = torch.nn.parallel.DistributedDataParallel(\n        torch.nn.Linear(1, 1, bias=False, dtype=torch.float64))\n    optimizer = CountingSGD(model.parameters(), lr=0.1)\n    # Each valid token contributes 0.5 * (w-y)^2. At w=0 its gradient is -y.\n    cases = [\n        ('wrong_rank_mean', [[-2.0]], [[-4.0, -6.0, -8.0]], False),\n        ('global_token_mean', [[-2.0]], [[-4.0, -6.0, -8.0]], True),\n        ('accumulated_global_mean', [[-2.0], []], [[-4.0], [-6.0, -8.0]], True),\n        ('one_empty_rank', [[]], [[-4.0, -6.0, -8.0]], True),\n        ('all_empty', [[]], [[]], True),\n    ]\n    result = {}\n    for name, left, right, normalized in cases:\n        with torch.no_grad():\n            model.module.weight.zero_()\n        optimizer.zero_grad(set_to_none=True)\n        steps_before = optimizer.observed_steps\n        sync_flags = []\n        batches = (left, right)[rank]\n        count = torch.tensor(sum(map(len, batches)), dtype=torch.int64)\n        dist.all_reduce(count, op=dist.ReduceOp.SUM)\n        if count.item() == 0:\n            gradient = model.module.weight.grad\n            result[name] = {'valid_tokens': count.item(),\n                            'gradient': None if gradient is None else gradient.item(),\n                            'weight': model.module.weight.item(),\n                            'optimizer_step': optimizer.observed_steps > steps_before,\n                            'observed_step_count': optimizer.observed_steps-steps_before,\n                            'backward_sync_flags': sync_flags}\n            continue  # Both ranks observe the same decision; no collective is skipped alone.\n        for index, values in enumerate(batches):\n            sync = contextlib.nullcontext() if index == len(batches)-1 else model.no_sync()\n            # no_sync must enclose forward as well as backward.\n            with sync:\n                sync_flags.append(bool(model.require_backward_grad_sync))\n                y = torch.tensor(values, dtype=torch.float64).reshape(-1, 1)\n                prediction = model(torch.ones_like(y))\n                numerator = ((prediction-y)**2).sum()/2\n                loss = numerator*2/count.item() if normalized else numerator/len(values)\n                loss.backward()  # Empty local sum remains differentiable and contributes zero.\n        gradient = model.module.weight.grad.item()\n        optimizer.step()\n        result[name] = {'valid_tokens': count.item(), 'gradient': gradient,\n                        'weight': model.module.weight.item(),\n                        'optimizer_step': optimizer.observed_steps > steps_before,\n                        'observed_step_count': optimizer.observed_steps-steps_before,\n                        'backward_sync_flags': sync_flags}\n    Path(output, 'rank'+str(rank)+'.json').write_text(json.dumps(result))\n    dist.destroy_process_group()\n\n\ndef main():\n    with tempfile.TemporaryDirectory(prefix='token-ddp-') as temporary:\n        rendezvous = (Path(temporary)/'rendezvous').as_uri()\n        mp.spawn(worker, args=(rendezvous, temporary), nprocs=2, join=True)\n        ranks = [json.loads(Path(temporary, 'rank'+str(i)+'.json').read_text()) for i in range(2)]\n    assert ranks[0] == ranks[1]\n    expected = {'wrong_rank_mean': (4, -0.4), 'global_token_mean': (5, -0.5),\n                'accumulated_global_mean': (5, -0.5), 'one_empty_rank': (6, -0.6)}\n    for name, (gradient, weight) in expected.items():\n        assert abs(ranks[0][name]['gradient']-gradient) < 1e-12\n        assert abs(ranks[0][name]['weight']-weight) < 1e-12\n    assert ranks[0]['all_empty']['optimizer_step'] is False\n    assert ranks[0]['all_empty']['observed_step_count'] == 0\n    assert ranks[0]['all_empty']['gradient'] is None\n    assert ranks[0]['all_empty']['weight'] == 0.0\n    assert ranks[0]['accumulated_global_mean']['backward_sync_flags'] == [False, True]\n    assert all(ranks[0][name]['observed_step_count'] == 1 for name in expected)\n    # Independent single-process baseline for the complete four-token objective.\n    w = torch.tensor(0., dtype=torch.float64, requires_grad=True)\n    ((w-torch.tensor([-2., -4., -6., -8.], dtype=torch.float64))**2).mean().div(2).backward()\n    assert w.grad.item() == 5.0\n    print(json.dumps({'torch': torch.__version__, 'device': 'cpu', 'backend': 'gloo',\n                      'processes': 2, 'single_process_gradient': w.grad.item(),\n                      'cases': ranks[0], 'scope': 'fixed world size, scalar MSE; not LLM/GPU performance'}, indent=2))\n\n\nif __name__ == '__main__':\n    main()\n", "worker_fencing.py": "\"\"\"Real local processes, SQLite receiver fencing and a separate crash/retry case.\n\nLogical lease time is injected for deterministic ordering. Fencing is enforced\ninside the effect receiver's transaction, not by a lease check in the worker.\nNo distributed consensus, remote tool, or Kairo integration is implemented.\n\"\"\"\nimport hashlib\nimport json\nimport multiprocessing as mp\nimport os\nfrom pathlib import Path\nimport sqlite3\nimport tempfile\n\n\ndef connect(path):\n    db = sqlite3.connect(path, timeout=10, isolation_level=None)\n    db.execute('PRAGMA busy_timeout=10000')\n    return db\n\n\ndef initialize(control, receiver):\n    with connect(control) as db:\n        db.execute('CREATE TABLE lease(task TEXT PRIMARY KEY, owner TEXT, epoch INTEGER, deadline INTEGER)')\n        db.execute(\"INSERT INTO lease VALUES('task-1','A',1,10)\")\n    with connect(receiver) as db:\n        db.execute('CREATE TABLE fence(task TEXT PRIMARY KEY, epoch INTEGER)')\n        db.execute(\"INSERT INTO fence VALUES('task-1',1)\")\n        db.execute('CREATE TABLE effect(tenant TEXT, op TEXT, digest TEXT, result TEXT, PRIMARY KEY(tenant,op))')\n\n\ndef reserve_lease(control, owner, now):\n    with connect(control) as db:\n        db.execute('BEGIN IMMEDIATE')\n        _, _, epoch, deadline = db.execute('SELECT * FROM lease').fetchone()\n        assert now > deadline\n        epoch += 1\n        db.execute('UPDATE lease SET owner=?,epoch=?,deadline=?', (owner, epoch, now+10))\n        db.commit()\n    return epoch\n\n\ndef arm_receiver(receiver, epoch):\n    # This demo explicitly installs the fence before allowing the new owner to act.\n    # Two databases are not an atomic distributed transaction: loss between these\n    # steps needs a real coordination protocol and receiver acknowledgements.\n    with connect(receiver) as db:\n        db.execute('BEGIN IMMEDIATE')\n        db.execute('UPDATE fence SET epoch=? WHERE task=? AND epoch<?', (epoch, 'task-1', epoch))\n        row = db.execute(\"SELECT epoch FROM fence WHERE task='task-1'\").fetchone()\n        armed = row is not None and row[0] == epoch\n        db.commit()\n    return armed\n\n\ndef takeover(control, receiver, owner, now):\n    epoch = reserve_lease(control, owner, now)\n    if not arm_receiver(receiver, epoch):\n        raise RuntimeError('lease reserved but receiver did not arm this exact epoch')\n    return epoch\n\n\ndef invoke(receiver, epoch, op, value, tenant='A', tool='report.write'):\n    # Trusted server policy, not caller-supplied permissions.\n    if tenant != 'A' or tool != 'report.write':\n        return {'status': 'denied'}\n    digest = hashlib.sha256(json.dumps({'tool': tool, 'value': value}, sort_keys=True).encode()).hexdigest()\n    with connect(receiver) as db:\n        db.execute('BEGIN IMMEDIATE')\n        current, = db.execute(\"SELECT epoch FROM fence WHERE task='task-1'\").fetchone()\n        if epoch != current:\n            db.rollback()\n            return {'status': 'stale_epoch'}\n        previous = db.execute('SELECT digest,result FROM effect WHERE tenant=? AND op=?', (tenant, op)).fetchone()\n        if previous:\n            db.rollback()\n            return {'status': 'duplicate', 'result': json.loads(previous[1])} if previous[0] == digest else {'status': 'conflict'}\n        result = {'stored_value': value}\n        db.execute('INSERT INTO effect VALUES(?,?,?,?)', (tenant, op, digest, json.dumps(result)))\n        db.commit()\n    return {'status': 'committed', 'result': result}\n\n\ndef paused_a(receiver, ready, release, results):\n    ready.set()\n    assert release.wait(20)\n    # A brand-new operation key prevents deduplication from hiding a missing fence.\n    results.put({'worker': 'A', 'pid': os.getpid(), 'result': invoke(receiver, 1, 'fresh-from-A', 99)})\n\n\ndef active_b(receiver, epoch, results):\n    results.put({'worker': 'B', 'pid': os.getpid(), 'result': invoke(receiver, epoch, 'fresh-from-B', 7)})\n\n\ndef crash_after_commit(receiver, epoch):\n    assert invoke(receiver, epoch, 'crash-operation', 11)['status'] == 'committed'\n    os._exit(23)  # This process terminates; it is not the paused A process.\n\n\ndef recovered_c(receiver, epoch, results):\n    results.put({'worker': 'C', 'pid': os.getpid(), 'result': invoke(receiver, epoch, 'crash-operation', 11)})\n\n\ndef join(process, expected=0):\n    process.join(20)\n    if process.is_alive():\n        process.terminate()\n        process.join()\n        raise AssertionError('worker exceeded bounded wait')\n    assert process.exitcode == expected, process.exitcode\n\n\ndef main():\n    ctx = mp.get_context('spawn')\n    with tempfile.TemporaryDirectory(prefix='agent-fence-') as temporary:\n        control, receiver = [str(Path(temporary, name+'.sqlite')) for name in ('control', 'receiver')]\n        initialize(control, receiver)\n        ready, release, results = ctx.Event(), ctx.Event(), ctx.Queue()\n        a = ctx.Process(target=paused_a, args=(receiver, ready, release, results))\n        a.start()\n        assert ready.wait(20) and a.is_alive()\n        epoch_b = takeover(control, receiver, 'B', now=11)\n        assert epoch_b == 2\n        b = ctx.Process(target=active_b, args=(receiver, epoch_b, results))\n        b.start(); join(b)\n        assert a.is_alive()  # Lease expiry and takeover did not stop A's process.\n        release.set(); join(a)\n        observations = [results.get(timeout=5), results.get(timeout=5)]\n        by_worker = {item['worker']: item for item in observations}\n        assert by_worker['A']['result']['status'] == 'stale_epoch'\n        assert by_worker['B']['result']['status'] == 'committed'\n        assert by_worker['A']['pid'] != by_worker['B']['pid']\n        assert invoke(receiver, 2, 'fresh-from-B', 7)['status'] == 'duplicate'\n        assert invoke(receiver, 2, 'fresh-from-B', 8)['status'] == 'conflict'\n        assert invoke(receiver, 2, 'bad-tenant', 9, tenant='B')['status'] == 'denied'\n        assert invoke(receiver, 2, 'bad-tool', 9, tool='shell.exec')['status'] == 'denied'\n        crashed = ctx.Process(target=crash_after_commit, args=(receiver, epoch_b))\n        crashed.start(); join(crashed, 23)\n        epoch_c = takeover(control, receiver, 'C', now=22)\n        c = ctx.Process(target=recovered_c, args=(receiver, epoch_c, results))\n        c.start(); join(c)\n        recovered = results.get(timeout=5)\n        assert recovered['result']['status'] == 'duplicate'\n        assert recovered['result']['result']['stored_value'] == 11\n        assert invoke(receiver, 2, 'old-B-new-op', 77)['status'] == 'stale_epoch'\n        assert invoke(receiver, 3, 'new-C-op', 13)['status'] == 'committed'\n        with connect(receiver) as db:\n            rows = db.execute('SELECT tenant,op,json_extract(result,\\'$.stored_value\\') FROM effect ORDER BY op').fetchall()\n            assert rows == [('A', 'crash-operation', 11), ('A', 'fresh-from-B', 7), ('A', 'new-C-op', 13)]\n        # A separate database exposes the non-atomic control/receiver handoff gap.\n        gap_control, gap_receiver = [str(Path(temporary, 'gap-'+name+'.sqlite')) for name in ('control', 'receiver')]\n        initialize(gap_control, gap_receiver)\n        reserved_b = reserve_lease(gap_control, 'B', 11)\n        gap_result = invoke(gap_receiver, 1, 'A-before-install', 5)\n        assert gap_result['status'] == 'committed'  # Control epoch=2 alone has not fenced A.\n        assert arm_receiver(gap_receiver, reserved_b)\n        assert invoke(gap_receiver, 1, 'A-after-install', 6)['status'] == 'stale_epoch'\n        reserved_c = reserve_lease(gap_control, 'C', 22)\n        assert arm_receiver(gap_receiver, reserved_c)\n        assert arm_receiver(gap_receiver, reserved_b) is False  # Stale B cannot claim readiness.\n        report = {'paused_worker_still_alive_after_takeover': True, 'takeover_epoch': epoch_b,\n                  'A': by_worker['A'], 'B': by_worker['B'], 'crash_exit_code': crashed.exitcode,\n                  'C_recovered_receipt': recovered, 'effects': rows, 'effect_count': len(rows),\n                  'effect_sum': 31, 'stale_new_key_rejected': True,\n                  'duplicate_no_effect': True, 'same_key_changed_arguments_rejected': True,\n                  'unauthorized_no_effect': True,\n                  'handoff_gap_probe': {'old_writer_before_install': gap_result['status'],\n                                        'old_writer_after_install': 'stale_epoch',\n                                        'superseded_reservation_armed': False},\n                  'scope': 'local SQLite receiver + injected logical lease clock; no remote tool/consensus/Kairo'}\n        results.close(); results.join_thread()\n        print(json.dumps(report, indent=2))\n\n\nif __name__ == '__main__':\n    main()\n"};
const aiAgentValidation={"status": "passed", "verified_at_utc": "2026-11-04T08:24:42.432662+00:00", "standard_library_python": "3.9.6", "platform": "macOS-26.2-arm64-arm-64bit", "programs": {"token_ddp.py": {"status": "passed", "result": {"torch": "2.5.1", "device": "cpu", "backend": "gloo", "processes": 2, "single_process_gradient": 5.0, "cases": {"wrong_rank_mean": {"valid_tokens": 4, "gradient": 4.0, "weight": -0.4, "optimizer_step": true, "observed_step_count": 1, "backward_sync_flags": [true]}, "global_token_mean": {"valid_tokens": 4, "gradient": 5.0, "weight": -0.5, "optimizer_step": true, "observed_step_count": 1, "backward_sync_flags": [true]}, "accumulated_global_mean": {"valid_tokens": 4, "gradient": 5.0, "weight": -0.5, "optimizer_step": true, "observed_step_count": 1, "backward_sync_flags": [false, true]}, "one_empty_rank": {"valid_tokens": 3, "gradient": 6.0, "weight": -0.6000000000000001, "optimizer_step": true, "observed_step_count": 1, "backward_sync_flags": [true]}, "all_empty": {"valid_tokens": 0, "gradient": null, "weight": 0.0, "optimizer_step": false, "observed_step_count": 0, "backward_sync_flags": []}}, "scope": "fixed world size, scalar MSE; not LLM/GPU performance"}, "python": "3.12.13", "optional_numpy_warning": false}, "gqa_serving.py": {"status": "passed", "result": {"gqa_heads": [4, 2], "full_incremental_max_error": 0.0, "wrong_head_mapping_max_error": 3.8519299390121366, "wrong_query_offset_max_error": 4.0156588789518715, "kv_bytes_per_token": 131072, "kv_bytes_per_8192_sequence": 1073741824, "blocks_per_8193_sequence": 513, "8193_sequence_capacity_in_8gib": 7, "requests": {"A": {"complete": true, "ttft_ms": 40, "tpot_ms": 10.0}, "B": {"complete": true, "ttft_ms": 60, "tpot_ms": 20.0}}, "synthetic_window_ms": 100, "total_output_tokens": 5, "output_tokens_per_second": 50.0, "latency_qualified_requests_per_second": 10.0, "scope": "standard-library semantic experiment and fixed synthetic timing, not GPU/vLLM load"}}, "worker_fencing.py": {"status": "passed", "result": {"paused_worker_still_alive_after_takeover": true, "takeover_epoch": 2, "A": {"worker": "A", "pid": 83625, "result": {"status": "stale_epoch"}}, "B": {"worker": "B", "pid": 83626, "result": {"status": "committed", "result": {"stored_value": 7}}}, "crash_exit_code": 23, "C_recovered_receipt": {"worker": "C", "pid": 83628, "result": {"status": "duplicate", "result": {"stored_value": 11}}}, "effects": [["A", "crash-operation", 11], ["A", "fresh-from-B", 7], ["A", "new-C-op", 13]], "effect_count": 3, "effect_sum": 31, "stale_new_key_rejected": true, "duplicate_no_effect": true, "same_key_changed_arguments_rejected": true, "unauthorized_no_effect": true, "handoff_gap_probe": {"old_writer_before_install": "committed", "old_writer_after_install": "stale_epoch", "superseded_reservation_armed": false}, "scope": "local SQLite receiver + injected logical lease clock; no remote tool/consensus/Kairo"}}, "agent_evaluation.py": {"status": "passed", "result": {"strategies": {"normal": {"positive_task_pass": true, "negative_cases_passed": 3, "cases_passed": 4, "case_count": 4, "tool_attempts": 4, "actual_effects": 1, "unique_qualified_business_tasks": 1, "outcomes": {"report": "success", "cross-tenant": "denied", "readonly": "denied", "missing": "insufficient_evidence"}, "positive_access_valid": true, "read_receipts": [["report", "a-1", "A"], ["report", "a-2", "A"]], "environment_contract_valid": true, "returned_content": {"report": [], "cross-tenant": [], "readonly": [], "missing": []}, "public_response_contract_valid": true}, "claim_only": {"positive_task_pass": false, "negative_cases_passed": 0, "cases_passed": 0, "case_count": 4, "tool_attempts": 0, "actual_effects": 0, "unique_qualified_business_tasks": 0, "outcomes": {"report": "success", "cross-tenant": "success", "readonly": "success", "missing": "success"}, "positive_access_valid": false, "read_receipts": [], "environment_contract_valid": true, "returned_content": {"report": [], "cross-tenant": [], "readonly": [], "missing": []}, "public_response_contract_valid": true}, "deny_all": {"positive_task_pass": false, "negative_cases_passed": 2, "cases_passed": 2, "case_count": 4, "tool_attempts": 0, "actual_effects": 0, "unique_qualified_business_tasks": 0, "outcomes": {"report": "denied", "cross-tenant": "denied", "readonly": "denied", "missing": "denied"}, "positive_access_valid": false, "read_receipts": [], "environment_contract_valid": true, "returned_content": {"report": [], "cross-tenant": [], "readonly": [], "missing": []}, "public_response_contract_valid": true}, "citation_swap": {"positive_task_pass": false, "negative_cases_passed": 3, "cases_passed": 3, "case_count": 4, "tool_attempts": 4, "actual_effects": 1, "unique_qualified_business_tasks": 0, "outcomes": {"report": "success", "cross-tenant": "denied", "readonly": "denied", "missing": "insufficient_evidence"}, "positive_access_valid": true, "read_receipts": [["report", "a-1", "A"], ["report", "a-2", "A"]], "environment_contract_valid": true, "returned_content": {"report": [], "cross-tenant": [], "readonly": [], "missing": []}, "public_response_contract_valid": true}}, "leak_then_deny_probe": {"positive_task_pass": true, "negative_cases_passed": 2, "cases_passed": 3, "case_count": 4, "tool_attempts": 4, "actual_effects": 1, "unique_qualified_business_tasks": 1, "outcomes": {"report": "success", "cross-tenant": "denied", "readonly": "denied", "missing": "insufficient_evidence"}, "positive_access_valid": true, "read_receipts": [["cross-tenant", "b-1", "B"], ["report", "a-1", "A"], ["report", "a-2", "A"]], "environment_contract_valid": true, "returned_content": {"report": [], "cross-tenant": [{"tenant": "B", "version": 1, "amount": 999}], "readonly": [], "missing": []}, "public_response_contract_valid": true}, "extra_public_field_probe": {"positive_task_pass": false, "negative_cases_passed": 0, "cases_passed": 0, "case_count": 4, "tool_attempts": 4, "actual_effects": 1, "unique_qualified_business_tasks": 0, "outcomes": {"report": "success", "cross-tenant": "denied", "readonly": "denied", "missing": "insufficient_evidence", "client_visible_leaked_amount": 999}, "positive_access_valid": true, "read_receipts": [["report", "a-1", "A"], ["report", "a-2", "A"]], "environment_contract_valid": true, "returned_content": {"report": [], "cross-tenant": [], "readonly": [], "missing": []}, "public_response_contract_valid": false}, "wrong_report_status_probes": {"denied": {"positive_task_pass": false, "negative_cases_passed": 3, "cases_passed": 3, "case_count": 4, "tool_attempts": 4, "actual_effects": 1, "unique_qualified_business_tasks": 0, "outcomes": {"report": "denied", "cross-tenant": "denied", "readonly": "denied", "missing": "insufficient_evidence"}, "positive_access_valid": true, "read_receipts": [["report", "a-1", "A"], ["report", "a-2", "A"]], "environment_contract_valid": true, "returned_content": {"report": [], "cross-tenant": [], "readonly": [], "missing": []}, "public_response_contract_valid": true}, "insufficient_evidence": {"positive_task_pass": false, "negative_cases_passed": 3, "cases_passed": 3, "case_count": 4, "tool_attempts": 4, "actual_effects": 1, "unique_qualified_business_tasks": 0, "outcomes": {"report": "insufficient_evidence", "cross-tenant": "denied", "readonly": "denied", "missing": "insufficient_evidence"}, "positive_access_valid": true, "read_receipts": [["report", "a-1", "A"], ["report", "a-2", "A"]], "environment_contract_valid": true, "returned_content": {"report": [], "cross-tenant": [], "readonly": [], "missing": []}, "public_response_contract_valid": true}}, "forbidden_read_then_correct_probe": {"positive_task_pass": false, "negative_cases_passed": 3, "cases_passed": 3, "case_count": 4, "tool_attempts": 4, "actual_effects": 1, "unique_qualified_business_tasks": 0, "outcomes": {"report": "success", "cross-tenant": "denied", "readonly": "denied", "missing": "insufficient_evidence"}, "positive_access_valid": false, "read_receipts": [["report", "a-1", "A"], ["report", "a-2", "A"], ["report", "b-1", "B"]], "environment_contract_valid": true, "returned_content": {"report": [], "cross-tenant": [], "readonly": [], "missing": []}, "public_response_contract_valid": true}, "cached_content_leak_probe": {"positive_task_pass": false, "negative_cases_passed": 3, "cases_passed": 3, "case_count": 4, "tool_attempts": 4, "actual_effects": 1, "unique_qualified_business_tasks": 0, "outcomes": {"report": "success", "cross-tenant": "denied", "readonly": "denied", "missing": "insufficient_evidence"}, "positive_access_valid": true, "read_receipts": [["report", "a-1", "A"], ["report", "a-2", "A"]], "environment_contract_valid": true, "returned_content": {"report": [{"tenant": "B", "version": 1, "amount": 999}], "cross-tenant": [], "readonly": [], "missing": []}, "public_response_contract_valid": true}, "unexpected_report_probe": {"positive_task_pass": false, "negative_cases_passed": 0, "cases_passed": 0, "case_count": 4, "tool_attempts": 4, "actual_effects": 2, "unique_qualified_business_tasks": 0, "outcomes": {"report": "success", "cross-tenant": "denied", "readonly": "denied", "missing": "insufficient_evidence"}, "positive_access_valid": true, "read_receipts": [["report", "a-1", "A"], ["report", "a-2", "A"]], "environment_contract_valid": false, "returned_content": {"report": [], "cross-tenant": [], "readonly": [], "missing": []}, "public_response_contract_valid": true}, "scope": "four fixed tasks, deterministic plans, real in-memory SQLite effects; no LLM/RAG engine/Kairo"}}}, "source_sha256": {"README.md": "f1c0b3154a92186a304092878e3d49f6b93efd888b268a396d482654e89e3a2f", "agent_evaluation.py": "a4e39077889ea05b658f4dc95f3b926816d274208eaf0d19f52afe3e21cab312", "gqa_serving.py": "5820a4c4a789588bc0a53efe916ac5cfc3885e8672f449a9c80d3e77f8c113bb", "kairo-adapter-contract.md": "b1a4bdc6f9dd505ff733f5efd58b8101a4abc6685e9376918d74587e652605f7", "token_ddp.py": "afd29aa9e382ab48ec149b78173c108ea45f2357fc545caa2ced951c701ec84f", "worker_fencing.py": "64848bd09ef94d9c502eecc7cd161f087042f8b3d3e7e484949c5f9392fac132"}, "not_executed": ["GPU/CUDA/NCCL/FSDP/AMP and physical multi-node training", "real vLLM load, real LLM generation and embedding retrieval", "remote fencing, distributed consensus and wall-clock lease expiry", "malicious-code sandbox isolation, Kairo integration and production task evaluation"]};


;
// ai-agent-cases.js
function aiAgentCode(file,label){return '<details class="full-code"><summary>'+label+'</summary>'+code(file,'PYTHON',aiAgentLabFiles[file])+'</details>';}
function aiAgentLinks(file){return '<p class="practice-links"><a href="labs/ai-agent-systems.zip" download>下载四程序、契约与验证记录 ↓</a><a href="labs/ai-agent-systems/'+file+'" download>下载本例源码 ↓</a><a href="labs/ai-agent-systems/validation.json" target="_blank" rel="noopener">本次执行结果与源码摘要 ↗</a></p>';}
function aiAgentScope(text){return '<details class="knowledge-check"><summary>实验环境与适用范围</summary><p>'+text+'</p></details>';}
function tokenDDPCase(){const r=aiAgentValidation.programs['token_ddp.py'].result;return  para('实战：固定初值w=0、学习率0.1，每个有效目标损失为½(w−y)²。先手算y=−2/−4/−6/−8的梯度，再让两个真实CPU/Gloo进程执行。rank0有一个目标、rank1有三个，模型只有一个参数，便于把数值逐项核对。')+
 code('PyTorch 2.5.1 为本次基线 · 在已有PyTorch环境中运行','SH','python token_ddp.py')+
 table(['对照','归约后梯度','更新后的w','检验什么'],[['各rank先平均',String(r.cases.wrong_rank_mean.gradient),String(r.cases.wrong_rank_mean.weight),'副本相等但目标变了'],['全局目标分母',String(r.cases.global_token_mean.gradient),String(r.cases.global_token_mean.weight),'与单进程四目标梯度5一致'],['两次microbatch累积',String(r.cases.accumulated_global_mean.gradient),String(r.cases.accumulated_global_mean.weight),'no_sync覆盖前向/反向；整个窗口只归一一次'],['一个rank空目标',String(r.cases.one_empty_rank.gradient),r.cases.one_empty_rank.weight.toFixed(1),'零贡献仍参与所需同步'],['全局空目标','无梯度','0','所有rank一致跳过step']])+
 aiAgentCode('token_ddp.py','展开完整双进程程序：解析基准、归约、累积与独立断言')+
 para('这一题的导数是w-y。w=0时，四个目标分别贡献2、4、6、8；正确均值是20/4=5。若先把两组各自平均，再平均两组，会得到(2+6)/2=4。先算完这一步，再核对程序输出。')+
 aiAgentScope('真实两个CPU/Gloo进程，float64；没有运行GPU、NCCL、AMP、FSDP或语言模型。迁移到词元交叉熵时，还要核对输入/标签配对、忽略位置、全窗口计数和框架归约配置。')+
 '<p><a href="/article/multinode-lab/">下一步：按两机四卡手册检查设备、会合、通信与恢复 →</a></p>'+aiAgentLinks('token_ddp.py');}
function gqaServingCase(){const r=aiAgentValidation.programs['gqa_serving.py'].result;return  para('实战分两步。先用4个Q头、2组K/V与二维RoPE计算四位置因果注意力，比较每步重新计算全前缀与真正追加K/V的增量路径；再独立计算大模型KV容量和固定客户端轨迹。先预测错头映射、错位置偏移会改变哪些输出，再运行。')+
 code('Python 3.9+ · 标准库，无模型下载','SH','python3 gqa_serving.py')+
 table(['核对项','本次结果','解释'],[['全量/增量最大误差',String(r.full_incremental_max_error),'同一可见前缀与位置语义'],['错组映射最大误差',r.wrong_head_mapping_max_error.toFixed(6),'把[0,0,1,1]改成[0,1,0,1]'],['新Q位置重置0的误差',r.wrong_query_offset_max_error.toFixed(6),'旧K保留原位置，新Q偏移错误'],['8192位置逻辑KV','1GiB','32层/8KV头/128维/2字节'],['8193位置分块容量','513块，8GiB只够7条','块长16，计算向上取整'],['合成窗口','50token/s、延迟达标10请求/s','与正文同一事件，非设备实测']])+
 aiAgentCode('gqa_serving.py','展开GQA、缓存、位置、容量与指标的完整程序')+
 aiAgentScope('手写GQA数值计算，没有完整Decoder、量化、分页分配器或vLLM调度。客户端时间是固定输入，检验计算口径；没有向真实模型发请求。大模型字节账与小向量例子是两套题设。')+
 aiAgentLinks('gqa_serving.py');}
function agentFencingCase(){const r=aiAgentValidation.programs['worker_fencing.py'].result;return  para('实战一：A取得epoch1后被进程屏障暂停；逻辑时间推进到11，B接管并在工具接收方安装epoch2。B提交必要动作7之后，确认A进程仍存活，再释放A。A使用全新op_id写99，接收方拒绝旧代际。新key是关键：重复key可能让去重掩盖缺少fencing的问题。')+
 code('Python 3.9+ · 多进程和SQLite，文件均在临时目录','SH','python3 worker_fencing.py')+
 table(['场景','实际观察','独立效果检查'],[['暂停A、接管B','A仍存活；B epoch='+r.takeover_epoch,'B的新动作7成功'],['A恢复后新动作','stale_epoch','99没有进入效果表'],['同key重试/换参','duplicate / conflict','原效果7仍只有一份'],['另一个进程提交后退出','退出码'+r.crash_exit_code,'效果11已存在，调用没有正常完成'],['新C恢复','原op返回duplicate回执','不再新增11'],['代际3新动作（测试主进程）','提交13','最终3笔，7+11+13=31']])+
 aiAgentCode('worker_fencing.py','展开真实进程、接收方事务、提交后退出与恢复程序')+
 para('实战二单独启动一个新进程，在效果11提交后os._exit(23)，再由C取回相同op的回执。它与暂停后继续运行的A是两场不同故障。租约采用注入的逻辑时间，控制库与效果库没有分布式原子事务；脚本显式先安装资源侧fence再放行新owner，独立负例实际演示安装前旧A仍能写；接收方安装后才拒绝它。更高epoch已安装时，迟到的B不能把自己误报为armed。生产接入还需处理中间失败和多资源确认。')+
 aiAgentLinks('worker_fencing.py');}
function agentEvaluationCase(){const r=aiAgentValidation.programs['agent_evaluation.py'].result;return  para('实战：四个固定任务分别要求合法生成报告、拒绝跨租户读、拒绝只读身份写入，以及缺资料时报告证据不足。执行器使用确定性计划。合法报告要同时满足：对用户返回success、真实SQLite金额37、引用a-1/v1和a-2/v2。产物和对用户的交付一起验收。')+
 code('Python 3.9+ · 标准库；不调用LLM','SH','python3 agent_evaluation.py')+
 table(['策略','通过用例','实际报告行','为什么'],Object.entries(r.strategies).map(([name,v])=>[({normal:'正常执行（normal）',claim_only:'只报成功（claim_only）',deny_all:'全部拒绝（deny_all）',citation_swap:'篡改引用（citation_swap）'})[name],v.cases_passed+'/4',String(v.actual_effects),({normal:'必要工作完成，拒绝与缺证据正确',claim_only:'只报success，没有产物与正确拒绝',deny_all:'漏掉合法报告，缺证据类型也判错',citation_swap:'金额37但引用B租户，正向交付不合格'})[name]]))+
 aiAgentCode('agent_evaluation.py','展开固定任务、真实写入与独立环境oracle')+
 para('再故意让工具先返回B的内容，最后却报denied。访问记录和返回内容会暴露泄漏，这个策略降为3/4；把泄漏藏进公开响应的额外字段，也会被字段白名单拒绝。拒绝文案不能覆盖已经发生的读取。')+
 para('反过来，报告已经正确写入，对用户却报denied或insufficient_evidence，是否也算完成？两种状态都是合法枚举，但都不符合这个合法任务的交付要求。新反例只改公开状态，保留金额37和正确引用；判分应从4/4降到3/4，实际报告仍1行，合格业务任务为0。接口结构正确与任务语义正确是两道检查。')+
 table(['只改变合法报告的对外状态','通过用例','真实报告行','合格业务任务'],Object.entries(r.wrong_report_status_probes).map(([status,v])=>[status,v.cases_passed+'/4',String(v.actual_effects),String(v.unique_qualified_business_tasks)]))+
 para('再改一次执行过程：先越权读取B，再生成完全正确的A报告并返回success。评估器核对读取集合，判为3/4、报告1行、合格任务0。合法来源重复或换顺序读取仍可通过。另一个反例直接返回缓存中的B数据，本轮没有新增B读取，依然要从返回内容检出，不能只查本轮访问记录。')+
 para('这个固定任务的公开契约只返回状态，不附额外内容。若再悄悄写一行任务集合之外的报告，公开状态仍合法，但环境契约失败，整批计0/4，真实报告行是2。输出字段、实际状态、访问、返回内容和额外副作用分别检查。这些确定性夹具检验列出的边界，不代替真实模型的安全评估。')+
 aiAgentScope('正常结果是1个合格业务报告、3个正确拒绝/缺证据判定。4/4是四个固定机制用例，不是模型成功率。未调用LLM、真实检索服务或Kairo；实际接入还需扩大任务样本与故障覆盖。')+
 aiAgentLinks('agent_evaluation.py');}
infraFieldCases['model-foundations']=()=>para('先在纸上写出输入/标签、可见位置、张量shape与损失分母，再运行最小Decoder。现有模型基础实验包含真实PyTorch反向更新、标签对齐、RoPE和在线softmax；其执行环境、结果和源码摘要可独立下载核对。')+
 '<p class="practice-links"><a href="labs/textbook-examples.zip" download>下载模型原理实验包 ↓</a><a href="labs/model-foundations/tiny_decoder.py" download>最小Decoder源码 ↓</a><a href="labs/textbooks/validation.json">现有执行记录 ↗</a></p>'+
 '<p><a href="/module/training/#knowledge-tr-ddp">把单进程目标接到真正的DDP全局分母 →</a></p>';
infraFieldCases.training=tokenDDPCase;
infraFieldCases.platform=gqaServingCase;
infraFieldCases.agent=()=>agentFencingCase()+agentEvaluationCase()+'<h3>将机制接入 Kairo</h3>'+para('用可信任务→逻辑意图→接收方回执→恢复状态→独立评估逐层映射；先只读，再幂等写入，再引入多worker、取消与隔离。每层保留真实接口与版本、故障动作和独立结果。')+'<p><a href="labs/ai-agent-systems/kairo-adapter-contract.md" download>下载Kairo字段与故障验收契约 ↓</a><a href="/article/kairo-practice/">阅读完整迁移设计 →</a></p>';
for(const [id,title,build]of [['distributed-training','真实双进程：全局token分母与错误均值',tokenDDPCase],['model-serving','GQA增量缓存、字节预算与指标实验',gqaServingCase],['durable-workflows','两个worker：旧代际拒绝与提交后恢复',agentFencingCase],['agent-evaluation','从真实报告与来源版本验收任务',agentEvaluationCase]]){
 const a=articles.find(x=>x.id===id);a.sections.push([title,build()]);a.updated='2026.11.04';
}
const infraStudyGates={
 ai:[
  ['model-foundations','画输入/标签与因果mask；手算一个Attention输出，核对最小Decoder的梯度与更新。','mf-tensors'],
  ['model-foundations','从shape算FLOP和字节；解释在线softmax，指出kernel优化后的端到端上界。','mf-gpu'],
  ['training','建立状态峰值账；用两rank对照单进程，明确正确梯度5与错误均值4。','tr-memory'],
  ['training','追踪数据/通信/检查点；完成短训练与恢复对照，列出真实多机尚需的证据。','tr-input'],
  ['platform','复算GQA缓存与块取整；逐请求算TTFT/TPOT，按质量、版本与窗口验收发布。','sv-contract']
 ],
 agent:[
  ['agent','分清任务、动作与尝试；合法任务能完成，跨租户与注入文本不能扩大权限。','ag-runtime'],
  ['agent','复现提交后退出与暂停旧worker两场故障，分别验证回执去重与资源侧fencing。','ag-recovery'],
  ['agent','拆开运行状态、上下文和记忆；算召回指标，核对金额与来源版本。','ag-context'],
  ['agent','让只报成功、全拒绝、错引用在评估器中失败，再按真实接口映射Kairo。','ag-observability']
 ]
};
function infraStageStudyHTML(track,i){const [module,gate,point]=infraStudyGates[track][i];return '<p class="stage-field-links">先读系统知识：<a href="/module/'+module+'/#knowledge-'+point+'">'+moduleFor(module).name+' →</a></p><p class="stage-gate"><b>过关任务：</b>'+gate+'</p>';}


;
// site-pages.js
const cloudModules=trackDefinitions.cloud.modules;
const aiModules=trackDefinitions.ai.modules;
const articleById=id=>articles.find(a=>a.id===id);
const trackForModule=id=>moduleFor(id)?.track;
function chapterLink(a){return `<a class="chapter-row" href="${articleURL(a.id)}"><div class="chapter-top"><span>CHAPTER ${a.number}</span><span>${a.level} · ${progress[a.id]?'已读 ✓':'开始阅读 ↗'}</span></div><h2>${a.title}</h2><p>${a.desc}</p></a>`}
function learningContract(a){const content=`<div class="learning-contract"><strong>读完这一章，你应该能</strong><ul>${a.objectives.map(t=>'<li>'+t+'</li>').join('')}</ul><p><b>前置知识</b>${a.prereq}</p><p class="evidence-note">约 ${a.minutes} 分钟 · ${a.baseline||'训练代码基线 PyTorch 2.5.1'} · <a href="#/labs">实验验证范围 ↗</a></p></div>`;return '<details class="guided-contract"><summary>先修、学习目标与验证范围 · 约'+a.minutes+'分钟</summary>'+content+'</details>'}
function mobileContents(a){return `<details class="mobile-contents"><summary>章节导航与本文目录</summary><a href="#/module/${a.module}">← 返回本模块目录</a>${conceptTOCLink(articleURL(a.id))}${a.sections.map((s,i)=>`<a href="${articleURL(a.id)}#section-${i+1}">${i+1}. ${s[0]}</a>`).join('')}</details>`}
function courseIntro(){return `<div class="course-intro"><span class="small-badge">训练专题 / ${articles.filter(a=>a.module==='training').length} 章</span><h2>先理解一步训练，再走向多机多卡。</h2><p>从资源预算、数据与通信，到完整DDP程序、两机四卡手册和恢复对照。同一份实验贯穿执行机制与故障验证。</p><div class="course-links"><a class="btn" href="#/article/gpu-cluster">从全景开始 →</a><a class="btn secondary" href="#/labs">实验与验证记录 ↗</a></div><small>CPU/Gloo已有实测；真实GPU/NCCL与Kubernetes仍需目标环境验证。</small></div>`}
function sectionGroup(list){return trainingGroups.map((g,i)=>`<section class="course-group"><div class="group-label">${g}</div>${list.filter(a=>a.group===i).map(chapterLink).join('')}</section>`).join('')}
function simplePage(title,kicker,desc,body){document.title=title+' · InfraGuide';$('#app').innerHTML=`<main id="main" class="container collection" tabindex="-1"><div class="breadcrumb"><a href="#/">知识库</a><span>／ ${title}</span></div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p class="description">${desc}</p>${body}</main>${footer()}`}
function trackCard(key){const t=trackDefinitions[key],n=articles.filter(a=>t.modules.includes(a.module)).length;return `<a class="track-card ${key}" href="#/track/${key}"><span class="track-index">${{cloud:'01',ai:'02',agent:'03'}[key]} / ${n} 章</span><h2>${t.label}<span>↗</span></h2><h3>${t.subtitle}</h3><p>${t.story}</p><div class="track-steps">${{cloud:'请求 → 资源 → 交付 → 恢复',ai:'数据 → 训练 → 评估 → 推理',agent:'目标 → 工具 → 状态 → 验收'}[key]}</div></a>`}
function homePage(){
 document.title='InfraGuide · Cloud / AI / Agent';
 $('#app').innerHTML=`<main id="main" class="container home-reading" tabindex="-1">
 <section class="infra-hero"><div class="eyebrow"><span class="dot"></span> 给中国初学者与面试准备者的基础设施指南</div>
 <div class="hero-grid"><div><h1>先看懂全貌，<br>再把系统讲清楚。</h1><p>Cloud 管应用运行，AI Infra 管模型训练与推理，Agent Infra 管任务和工具执行。先认识对象与关系，再沿一条主线读机制、算例和代码。</p>
 <div class="buttons"><a class="btn" href="/outline/">先看知识地图 →</a><a class="btn secondary" href="/interview/">按重点准备面试 →</a></div>
 <p class="home-route-link"><a href="/roadmap/">已有基础？按学习路线继续 →</a></p></div>
 <aside class="home-reading-order" aria-label="一章的阅读顺序"><h2>一章，顺着四步读</h2><ol><li><b>认识对象</b><span>这个概念是什么？</span></li><li><b>弄清关系</b><span>它与前面的知识怎样连接？</span></li><li><b>跟算例子</b><span>每一步为什么得到这个结果？</span></li><li><b>运行验证</b><span>换一个条件，结论还成立吗？</span></li></ol></aside></div></section>
 <section class="track-grid" aria-label="三条学习路线">${Object.keys(trackDefinitions).map(trackCard).join('')}</section>
 <div class="shared-line"><b>共同的工程底座</b><span>计算与数据路径 · 身份与权限 · 可观测性 · 版本与恢复</span><a href="/article/cloud-overview/">建立系统地图 →</a></div>
 <section class="section" id="sample-readings"><div class="section-heading"><div><h2>先读一章，亲手验证一个结果</h2><p>选一个方向尝试。建议时间只覆盖阅读与首轮练习，环境准备另计。</p></div></div>
 <div class="start-paths">${[
 ['Cloud Infra','约10分钟','服务成功率到底怎么算？','slo','把不同流量的实例合起来，算清全局成功率和错误预算。','设总事件1000、好事件990、目标99%。解释预算为什么刚好用完。','无需额外环境'],
 ['AI Infra','约20分钟','KV Cache 为什么能减少重复计算？','model-serving','沿三个 token 的生成过程，区分输入位置、输出和缓存。','运行 attention_lab.py，核对 cache_max_abs_error，再解释移除因果 mask 的变化。','Python 3.9+，无需 GPU'],
 ['Agent Infra','约20分钟','工具成功了，任务为什么还没完成？','agent-recovery','复现工具提交后进程退出，观察恢复时的尝试数与实际效果。','运行 agent_lab.py，核对 attempts=2、tool_effects=1，解释由谁完成去重。','Python 3.9+，无需模型服务']
 ].map(([track,time,title,id,result,task,env],i)=>`<section class="start-card"><div class="start-meta"><span>0${i+1} / ${track}</span><b>${time}</b></div><h3>${title}</h3><p>${result}</p><div class="start-outcome"><strong>动手核对</strong><p>${task}</p></div><a class="inline-link" href="${articleURL(id)}">阅读样章并完成练习 →</a><small>${env}</small></section>`).join('')}</div></section>
 <nav class="home-tools" aria-label="继续学习"><a href="/outline/">完整大纲 · ${articles.length} 章 →</a><a href="/labs/">代码与实验 →</a><a href="/problems/">按问题查机制 →</a><a href="/resources/">资料与视频 →</a></nav>
 </main>${footer()}`;
}

function trackPage(kind){if(kind==='cloud')cloudKnowledgePage(moduleFor('compute'));else infraKnowledgePage(moduleFor(kind==='ai'?'model-foundations':'agent'));}

function sidebarView(moduleId, current) {
 const track = moduleFor(moduleId).track;
 const topicModules = modules.filter(module => module.track === track);
 const topicArticles = articles.filter(article => trackForModule(article.module) === track);
 const read = topicArticles.filter(article => progress[article.id]).length;
 const label = trackDefinitions[track]?.label || '综合实战';
 const sections = topicModules.map(module => {
  const active = module.id === moduleId;
  const chapters = topicArticles.filter(article => article.module === module.id);
  const links = chapters.map((article, index) => {
   const startsGroup = article.group !== undefined && (!index || chapters[index-1].group !== article.group);
   const group = startsGroup ? '<div class="side-group">'+trainingGroups[article.group]+'</div>' : '';
   const selected = article.id === current ? 'class="current" aria-current="page"' : '';
   return `${group}<a href="${articleURL(article.id)}" ${selected}>${article.number} ${article.title}${progress[article.id]?'<span class="read-mark">✓</span>':''}</a>`;
  }).join('');
  return `<details ${active?'open':''}><summary><a href="/module/${module.id}/" ${active&&!current?'class="current" aria-current="page"':''}><span>${module.n}</span>${module.name}</a></summary><div class="side-links">${links}</div></details>`;
 }).join('');
 return `<aside class="sidebar" aria-label="章节导航"><a class="side-home" href="/outline/">← 全站大纲</a>
  <div class="side-heading"><span>${label} · 领域与章节</span><span>${topicArticles.length} 章</span></div>${sections}
  <div class="side-progress"><div><span>本主题阅读进度</span><b>${read} / ${topicArticles.length}</b></div>
   <div class="progress-bar"><span style="width:${read/topicArticles.length*100}%"></span></div><span>仅保存在当前浏览器</span></div></aside>`;
}
function moduleOverview(m,list){return `<div class="module-intro"><b>这一模块的学习出口</b><ul>${m.outcomes.map(t=>'<li>'+t+'</li>').join('')}</ul><span>${list.length}章 · 先理解机制，再用问题和实验检验理解</span></div>`}
function relatedReading(a){if(!a.related?.length)return '';return `<section class="related-reading"><h2>把这一章连回系统</h2>${a.related.map(id=>`<a href="${articleURL(id)}"><span>${articleById(id).number}</span>${articleById(id).title}<b>↗</b></a>`).join('')}</section>`}
function roadmapPage(){const stages=courseReadingStages;simplePage('选择你的学习路线','THREE TRACKS · SHARED FOUNDATIONS','根据已有基础选择起点。三条路线互相连接，Agent不以完成GPU训练为前提。',`<div class="route-selector">${Object.keys(trackDefinitions).map(k=>`<a href="#/roadmap?track=${k}">${trackDefinitions[k].label} ↓</a>`).join('')}</div>${Object.entries(stages).map(([k,ss])=>`<section class="route-block" id="route-${k}"><div class="route-title"><span>${trackDefinitions[k].label}</span><h2>${trackDefinitions[k].subtitle}</h2><p>${trackDefinitions[k].story}</p></div>${ss.map(([title,ids],i)=>`<div class="roadmap-step"><span class="step-num">0${i+1}</span><div><h3>${title}</h3>${k==='cloud'?cloudStageStudyHTML(i):infraStageStudyHTML(k,i)}${ids.map(id=>`<a href="${articleURL(id)}">${articleById(id).number} ${articleById(id).title}${progress[id]?' ✓':' ↗'}</a>`).join('')}</div></div>`).join('')}<a class="inline-link" href="#/track/${k}">查看这条路线的全部章节 →</a></section>`).join('')}<div class="track-note"><b>用学习出口判断是否继续</b><p>能画出系统路径、解释一个反例、独立运行实验并核对结果，再进入下一阶段。阅读勾选记录进度；它不替代工程能力验收。</p></div>`);const key=new URLSearchParams(location.search).get('track');if(trackDefinitions[key])requestAnimationFrame(()=>document.getElementById('route-'+key)?.scrollIntoView())}
function labsPage(){renderLabCatalog()}
const problemItems=[['服务已经启动，用户却访问失败','沿DNS、连接、TLS和HTTP定位最后成功阶段。','vpc-network','Cloud'],['机器CPU不高，请求仍然很慢','区分执行时间、连接池与下游等待。','linux-resource','Cloud'],['集群还有GPU，Pod却无法调度','检查资源形状、单节点可行性与放置约束。','scheduling-resources','Cloud'],['readiness失败，为什么进程没重启','分清启动、存活和流量资格。','kubernetes-basics','Cloud'],['回滚镜像后，行为没有恢复','检查配置、数据与外部产物版本。','delivery','Cloud'],['多个实例的p99怎么合并','回到分布与可聚合直方图。','observability','SRE'],['备份成功，却无法恢复服务','验证清单、提交点和实际消费者。','storage-recovery','SRE'],['训练OOM，增加GPU仍没解决','先算状态与激活，再判断复制还是分片。','gpu-memory','AI'],['多机启动等待或通信超时','找最早异常，再区分会合与数据通信。','training-communication','AI'],['GPU经常等待数据','用三组输入对照定位关键路径。','data-pipeline','AI'],['保存了检查点，却不能继续','核对状态、规模、进度和数据顺序。','checkpoint-recovery','AI'],['权重放得下，并发却上不去','按上下文和并发估算KV容量。','model-serving','AI'],['首token延迟报告互相矛盾','统一客户端与服务端计时边界。','inference-performance','AI'],['工具已生效，任务还停在运行中','检查提交间隙与接收方幂等语义。','agent-recovery','Agent'],['工具结果要求提升权限','把外部文本与可信授权分开。','agent-security','Agent'],['Agent说成功，实际产物却不对','用环境断言验收任务结果。','agent-evaluation','Agent']];
function problemsPage(){simplePage('问题索引','START WITH A SYMPTOM','先选择现象，再通过证据判断原因。这里提供排查入口，不预先替你认定根因。',`<div class="problem-list">${problemItems.map(([t,d,id,tag])=>`<a href="${articleURL(id)}"><span class="tag">${tag}</span><div><h2>${t}</h2><p>${d}</p></div><b>↗</b></a>`).join('')}</div>`)}
function editorialPage(){simplePage('内容与证据标准','EXPLAIN THE SYSTEM · SHOW THE EVIDENCE','高信息量来自清晰的因果链：知道为什么，理解怎样工作，能够计算或验证，再讨论选择。',`<section class="quality-section"><h2>同一网站，三条独立主线</h2><div class="track-grid">${Object.keys(trackDefinitions).map(trackCard).join('')}</div><p>Cloud建立系统底座；AI展开训练与推理；Agent研究工具执行、状态与任务验收，并连接Kairo实践。可靠性、权限、版本和成本贯穿三条路线，综合实战连接跨层依赖。</p></section><section class="quality-section"><h2>一章内容怎样展开</h2><p>默认读者第一次接触这个领域。入口和每章都先介绍基本对象，接着解释对象之间的关系，再讲机制、推导和边界，最后进入案例与代码。专业词在进入推理前给出含义；图、表、代码围绕同一组对象与数字展开，最后改变条件检验理解。</p>${trainingTable(['阅读顺序','必须回答的问题','读者得到什么'],[['对象与关系','概念是什么，彼此怎样连接，为什么需要它','学习起点与全局地图'],['机制与因果','输入如何经过状态变化成为输出','可以解释的执行路径'],['走通一个例子','具体数字、事件或代码怎样对应机制','可复查的推导'],['选择与失败','什么时候成立，什么条件下失效','工程判断与反例'],['练习与验证','换一个条件，你能否独立解释','迁移能力与证据']])}<p>本站文章、图和实验代码独立编写。领域知识、详细章节与实验相互连接，学习后可以改变条件，重新解释结果。</p></section><section class="quality-section"><h2>当前交付与验证边界</h2><p>共${articles.length}章：Cloud ${courseChapterCount('cloud')}章、AI ${courseChapterCount('ai')}章、Agent ${courseChapterCount('agent')}章、综合实战${courseChapterCount('shared')}章。全部提供前置知识、学习出口、机制正文、迁移练习和来源。章节齐备与真实环境已验证是两种不同状态。</p><p>本地系统、SQLite恢复、批处理、CPU/Gloo及真实Terraform计划实验附环境、结果与代码摘要；GitOps模型另标注范围。真实GPU、集群部署、生产模型压测和Kairo集成仍需目标环境验收。<a href="#/labs">查看逐项验证记录 →</a></p></section><section class="quality-section"><h2>内容维护的质量门槛</h2>${trainingTable(['门槛','检查方式'],[['准确性','优先官方资料，注明产品语义、版本与假设'],['可理解性','先定义对象与关系，再有连续推导、例子和反例'],['可复现性','完整代码、命令、依赖、预期结果与源码摘要一致'],['可审查性','保留失败边界，不用CPU结果推断GPU或集群结果'],['可维护性','修改实验后重跑相关验证；版本变化复查对应事实']])}<p>当前优先按读者理解卡点，逐章深化连续解释、手算例子与反例；有合适环境时，再补真实GPU、Kubernetes和Kairo验收。新章节按问题价值增加，已有章节按错误、过时信息和验证缺口持续修订。</p></section><section class="quality-section"><h2>阅读与隐私</h2><p>学习路线按依赖组织；目录按系统领域组织；实验室提供代码和证据；问题索引连接现象与机制。搜索覆盖正文，阅读勾选与主题仅保存在当前浏览器。</p></section>`)}

function chapterPracticeHTML(a){
 const exercise=a.exercise?'<section class="article-section applied-exercise"><h2><span class="section-index">?</span>迁移练习</h2><p>'+a.exercise[0]+'</p><details class="full-code"><summary>展开参考答案与推理</summary><p>'+a.exercise[1]+'</p></details></section>':'';
 return `<details class="chapter-practice" id="chapter-practice"><summary>练习、自检与阅读反馈</summary>${exercise}<section class="article-section" id="self-check"><h2>自我检验</h2><div class="checklist">${a.check.map((c,i)=>`<label><input type="checkbox" data-check="${a.id}:${i}" ${checks[`${a.id}:${i}`]?'checked':''}>${c}</label>`).join('')}<small>勾选表示自我评估，记录仅保存在当前浏览器。</small></div></section>${readerActionsHTML(a)}</details>`;
}
function chapterFurtherReadingHTML(a){
 const content=resourceRecommendations(a.module,a.id)+relatedReading(a);
 return content?'<details class="chapter-further"><summary>延伸资料与相关章节</summary>'+content+'</details>':'';
}


;
// interview-practice.js
// Original self-checks. Employer sources below describe expectations, not these prompts.
const codingReference = `def peak_jobs(intervals):
    events = []
    for start, end in intervals:
        if end <= start:
            raise ValueError("expected start < end")
        events.extend([(start, 1), (end, -1)])
    active = peak = 0
    for _, delta in sorted(events):
        active += delta
        peak = max(peak, active)
    return peak`;

function mockInterviewPractice() {
 return `<details class="interview-extra"><summary>做一轮模拟面试 · 编码、设计、项目各一题</summary>
 <p>下面是本站原创练习。先在纸上或编辑器里作答，再展开核对。建议用时由本站设定。</p>
 <h3>01　现场编码 · 20 分钟</h3>
 <p>已完成作业以整数时间区间 [start, end) 记录，保证 start &lt; end，输入无序。返回同时运行作业数的峰值。例子 [(1,4), (2,4), (4,7)] 应得到 2。先说明在第 4 秒该如何计数。</p>
 <details><summary>核对实现、复杂度和边界</summary>
 ${trainingCode('Python 参考解 · 同一时刻先结束再开始', 'PYTHON', codingReference)}
 <p>每个区间产生两个事件。元组排序让同一时刻的 −1 排在 +1 前面，结束于 4 的作业不会与开始于 4 的作业重叠。处理 n 个区间需要 O(n log n) 时间和 O(n) 额外空间。自测空输入 → 0，[(1,2),(2,3)] → 1，两个相同区间 → 2，再检查乱序和非法区间。</p></details>
 <h3>02　系统设计 · 25 分钟</h3>
 <p>四台各有 8 卡的机器，当前空闲卡数为 [8,4,4,0]。一个训练作业需要两台机器各提供 8 卡，四台机器都在同一网络域。画出提交、排队、整组准入、运行和恢复的路径。产品还要求小作业能及时开始。</p>
 <details><summary>核对约束与追问</summary><p>空闲卡共 16 张，满足形状的机器却只有一台。先说明准入条件、资源预留与释放，再比较等待、回填或有约束的抢占。解释如何避免大作业长期饥饿。恢复要处理失败节点、checkpoint 和重复提交。验收至少比较排队时延、有效吞吐、恢复耗时与成本。追问：小作业实际运行时间超过估计，预留的第二台机器如何兑现？</p>
 <a href="/article/gpu-scheduling/">对照 GPU 准入章节 →</a></details>
 <h3>03　项目复盘 · 10 分钟</h3>
 <p>选一件你亲手处理过的故障，写明用户影响、你负责的决定、被证据排除的一种解释，以及恢复后验证效果的指标。追问你为什么放弃另一个方案，哪个环节由同事负责。</p>
 <details><summary>核对回答是否经得起追问</summary><p>标出你的行动和团队的行动，给出前后指标的口径与观察窗口。没有精确数据时说明当时保留下来的证据。最后再说一次，如果今天重做，会提前加哪条监测或演练。</p><a href="/article/incident/">对照故障时间线 →</a></details>
 </details>`;
}

function interviewCoverage() {
 const source = (url, label) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
 const chapter = (id, label) => `<a href="${articleURL(id)}">${label} →</a>`;
 const capabilities = [
  ['云 / SRE', '专项可练', chapter('network-diagnosis','分层排障')+'、'+chapter('incident','故障复盘')+'、'+chapter('slo','错误预算'), '再练一次故障现场排查、自动化修复脚本和容灾演练，补数据库性能诊断。'],
  ['训练平台', '机制可练，规模待验', chapter('distributed-training','DDP 单步')+'、'+chapter('gpu-memory','显存预算')+'、'+chapter('multinode-lab','多机手册'), '用真实集群证明拓扑放置、抢占、恢复后的训练进度，留存各 rank 的吞吐和内存曲线。'],
  ['推理 / 性能', '部分覆盖', chapter('model-serving','KV 缓存')+'、'+chapter('inference-performance','推理指标'), '还需练 PD 分离调度、框架源码、GPU profiling 和跨版本性能回归。'],
  ['Agent 平台', '运行时可练', chapter('agent-recovery','工具恢复')+'、'+chapter('agent-security','权限实验')+'、'+chapter('agent-evaluation','任务评估'), '再做一次多租户沙箱的创建、诊断与回收，比较冷启动与热会话，验证跨任务隔离。'],
  ['算法、编程与测试', '有排序与图两题', '<a href="/interview/coding/">依赖排序与本地判题 →</a>，下方另有作业峰值题。', '需系统练习哈希、树、图与复杂度，在限时条件下独立编码、测试并解释。'],
  ['系统设计、数据库', '部分覆盖', '<a href="/interview/database/">查询计划与事务快照 →</a> · <a href="/interview/design/">整组容量设计 →</a>', '继续补目标引擎的锁等待、分区复制和一致性取舍，并在真实负载中验证设计。'],
  ['个人项目与行为面', '有复盘提纲', chapter('incident','证据时间线')+'，下方有一题项目追问。', '准备自己的决策、分工、失败与量化结果，练习解释替代方案和实际代价。']
 ];
 return `<details class="interview-extra"><summary>面试覆盖对照 · 按岗位看本站能练什么</summary>
 <p>截至 2026 年 11 月 4 日，本站可用于 Cloud/SRE、AI 平台和 Agent 运行时的专项复习。下表按现有章节、可答的练习和已跑的实验逐项判断。公开样本没有给出完整题库或各题频率，无法据此计算“大厂面试覆盖率”。</p>
 ${trainingTable(['准备方向','本站深度','从哪里开始','还要独立完成什么'],capabilities)}
 <h3>官方面试说明</h3>
 <p>Amazon 的 SDE II 指南分别说明编码、系统设计和过往经历。Microsoft 的技术面试指南要求展示问题拆解、可运行的实现和测试，技术范围因岗位而异。两者适合用来检查通用准备环节。${source('https://amazon.jobs/content/en/how-we-hire/sde-ii-interview-prep','Amazon SDE II')} · ${source('https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing.html','Microsoft 技术面试')}</p>
 <h3>官方岗位说明</h3>
 <p>岗位职责提供能力样本。下面的题目和章节映射由本站编写。初学者可先学机制，有经验的候选人还需提供实际负责过的系统、规模和结果。</p>
 <ul><li>腾讯 IaaS 计算产品 SRE 涵盖可观测、变更治理和容灾，要求开发及常见数据库性能排查能力。${source('https://careers.tencent.com/jobdesc.html?postId=2113177003082559488','腾讯 IaaS SRE')}</li>
 <li>百度 AI Infra 平台强调工件追踪、拓扑感知调度及抢占恢复。腾讯推理框架岗位关注预填充与解码分离调度、异构芯片与推理成本。${source('https://talent.baidu.com/jobs/detail/SOCIAL/2216e7ae-f75d-4e7c-b14d-669a4171a1ff','百度 AI Infra 平台')} · ${source('https://careers.tencent.com/jobdesc.html?postId=2108854783036272640','腾讯推理框架')}</li>
 <li>百度云原生 Agent Infra 涉及多租户隔离、沙箱编排与治理。AWS Agentic AI 把冷启动、资源利用、会话身份与跨账号访问列入工程职责。${source('https://talent.baidu.com/jobs/detail/SOCIAL/4b326f6b-2c39-461c-ae64-69b4201c680e','百度 Agent Infra')} · ${source('https://www.amazon.jobs/en/jobs/10584176/software-development-engineer-aws-agentic-ai','AWS Agentic AI')}</li></ul>
 </details>`;
}


;
// interview-coding.js
function dependencyCodingWorkshop() {
  return `<details open class="interview-extra"><summary>现场编码进阶 · 作业依赖图与可运行顺序</summary>
  <p>面试总览中的作业高峰题按起止时间排序。这一题面对尚未运行的作业，只知道谁必须先完成。本站原创练习，建议先用 20 分钟独立编码，再展开自查。</p>
  <h3>题面与接口</h3>
  <p>实现 <code>plan_jobs(n, dependencies)</code>。作业 ID 为 0 到 n−1。每对 (a, b) 表示 a 必须先于 b 完成。有合法顺序时返回包含全部 ID 的 Python 列表，每个 ID 恰好出现一次。若有环，返回 <code>None</code>。零个作业且无依赖时返回 <code>[]</code>。</p>
  <p>n 必须为非负整数，ID 必须为范围内的整数，布尔值不作整数接受。依赖及其每条二元边都用列表或元组表示。重复边只表达一次约束。输入非法应抛 <code>ValueError</code>，即使其他边已经形成环也要报告非法输入。</p>
  ${trainingTable(['输入', '可接受的回答', '要验证什么'], [
    ['4，[(0,1),(0,2),(1,3),(2,3)]', '[0,1,2,3] 或 [0,2,1,3]', '每条边的前驱都排在后继之前'],
    ['4，[(2,0),(2,0)]', '例如 [1,2,3,0]', '1、3 孤立，重复边不额外增加入度'],
    ['4，[(0,1),(2,3),(3,2)]', 'None', '即使能先运行 0 和 1，也排不出全图'],
    ['3，[(0,0),(1,3)]', 'ValueError', '任务 3 越界，不能被前面的自环掩盖']
  ])}
  <details><summary>核对算法、复杂度与易错点</summary>
  <p>先给全部 n 个作业建表，只对首次出现的边记录后继并增加入度。把所有入度为零的作业入队，每取出一个，就移除它对后继的一条未满足依赖。后继的入度降为零时入队。</p>
  <p>队列里的作业没有尚未输出的前驱，因此取出它不会破坏顺序。如果队列空了却还有作业，剩余每个点都至少有一个未完成前驱。沿前驱追溯必会在有限点集中重复，说明存在环。</p>
  <p>设 E 为输入边条数，U 为去重后的边数。按哈希集合平均常数时间插入计算，参考解用时 O(n+E)，额外空间 O(n+U)。容易错在边方向反了、漏掉孤立点、只对入度或邻接表单侧去重，以及把某一种合法顺序当成唯一答案。</p></details>
  <details><summary>运行黑盒自测与评分锚点</summary>
  <p><a href="/labs/interview-coding/dependencies.py" download>下载 Python 参考解与自测脚本 ↓</a>。把自己的实现保存在本地 <code>my_solution.py</code> 中，只需定义同名函数。脚本使用 Python 标准库，可离线运行。</p>
  ${trainingCode('在下载文件所在目录运行', 'BASH', 'python3 dependencies.py\npython3 dependencies.py --check ./my_solution.py')}
  <p>判题器为小图枚举所有排列，判断是否存在解。有解时检查返回列表覆盖全部 ID 且满足每条边。七个具名图、十组非法输入之外，还逐一检查三个作业上所有 512 种有向图，含自环。枚举仅用于小图自测。</p>
  ${trainingTable(['自评维度', '0 分', '1 分', '2 分'], [
    ['契约', '方向或返回值有误', 'DAG 正常，空图或非法输入漏检', '完整序、空图、环和非法输入均符合约定'],
    ['推理', '只能给出样例顺序', '能描述入队出队', '能证明取出安全，以及提前停住意味着什么'],
    ['边界', '只能处理单链', '处理了部分分支或环', '涵盖重复边、孤立点、非唯一序和局部有环'],
    ['验证', '只比较一个固定答案', '能验证顺序或解释复杂度之一', '逐边验证，并区分输入边数与去重后边数']
  ])}
  <p>每项 0–2 分，共 8 分。对失分项写下最小反例，修正后再不看答案复述一次。</p></details>
  </details>`;
}

function codingInterviewWorkshop() {
 return '<section id="max-stack" class="quality-section"><h2>数据结构热身：常数时间取最大值的栈</h2><p>题型来自公开腾讯云后端面经，下面接口与测试由本站编写。实现 push、pop、maximum；本站约定只接受整数，空栈操作抛 IndexError。先用十分钟独立写，再展开思路。</p><details><summary>检查不变量、复杂度和重复最大值</summary><p>每一层保存当前值与截至这一层的最大值。push 同时保存二者；pop 移除一层；maximum 查看栈顶保存的最大值。重复最大值分别占层，因此弹出一次不会错误地把另一个最大值移除。</p><p>三种操作均为 O(1)，其中动态数组 push 按均摊分析；额外空间 O(n)。若面试要求严格最坏 O(1)，可讨论链式节点与内存分配模型，不能把数组扩容的最坏代价忽略。</p><p><a href="/labs/interview-coding/max_stack.py" download>下载完整实现与边界自测 ↓</a>。运行 <code>python3 max_stack.py</code>。脚本检查重复最大值、负数、空栈及非法输入。</p></details><p class="path-links"><a href="/interview/experiences/#sample-t3">查看原始岗位与面经出处 →</a></p></section>'+dependencyCodingWorkshop();
}


;
// interview-database.js
function databaseInterviewWorkshop() {
 const record = practiceEvidence['interview-database'];
 const plans = record.plans;
 const labels = ['只有主键', '增加租户索引', '增加复合索引'];
 const query = `SELECT id, created_at FROM jobs
WHERE tenant_id = 7 AND state = 'queued'
ORDER BY created_at DESC, id DESC LIMIT 5;`;
 return `<section class="workshop-body"><h2>一页作业列表，为什么只取五行还要等？</h2>
 <p>控制台展示一个租户最近的五个排队作业。数据有 16,000 行，租户 7 占 500 行，其中 333 行仍在排队。多个作业可能有相同创建时间，用 id 决定先后。</p>
 ${trainingCode('先写出查询需要满足的过滤条件和顺序','SQL',query)}
 <h3>第一步 · 先预测访问路径</h3><p>比较三个方案：只有主键、有 tenant_id 单列索引、有 (tenant_id, state, created_at DESC, id DESC) 复合索引。在哪一种情况下，数据库可以按目标顺序读出前五行？请先写下判断，再打开计划。</p>
 <details><summary>核对三份执行计划</summary>
 ${trainingTable(['索引方案','本机 SQLite 实际计划'],plans.map((stage,i)=>[labels[i],stage.plan.map(line=>'<code>'+trainingEscape(line)+'</code>').join('<br>')]))}
 <p>第一份计划扫描表，再临时排序。第二份利用索引定位租户，仍需过滤状态并排序。第三份沿前两列的等值条件定位连续区间，后两列提供所需顺序，查询所需字段都在索引内。本次三种方案的作业 ID 完全一致，依次为 ${plans[0].result_ids.join('、')}。</p>
 <p>LIMIT 5 限制的是返回量。仅凭一个时间值或“用了索引”不能判断工作量。若页面改成跨租户查全部作业，索引的首列和排序条件就变了；新增索引还增加写放大和空间占用。</p></details>
 <h3>第二步 · 把“列表未更新”与“查询慢”分开</h3>
 <p>SQLite 使用 WAL，读连接在事务内先读到 queued。另一个连接把这个作业改成 running 并提交。读连接在原事务中再读一次，结束事务并开启新事务后再读一次。请写出三次状态，并解释加索引能否改变第二次读数。</p>
 <details><summary>核对两条连接的读数</summary><p>脚本实测为 <strong>${record.snapshot_reads.join(' → ')}</strong>。第一次 SELECT 建立读快照。写连接提交后，读连接仍在原快照里；新事务看到新状态。索引改变访问路径，事务边界决定这个例子里的可见版本。</p></details>
 <h3>第三步 · 留下可复查的诊断结论</h3>
 <p>自测每项 1 分：写出确定的排序；用计划指认剩余排序；核对返回行相同；解释旧快照；说明上线后要观察写入成本与真实延迟。漏哪一项，就重做对应步骤。</p>
 ${trainingCode('下载脚本后原样复跑 · Python 3 标准库','BASH','python3 query_lab.py')}
 <p class="practice-links"><a href="/labs/interview-database/query_lab.py" download>下载 SQLite 实验 ↓</a><a href="/labs/interview-database/validation.json" target="_blank" rel="noopener">本次完整记录 ↗</a></p>
 <p class="evidence-note">本次使用 SQLite ${record.sqlite} 和临时数据库。计划格式与选择可能随版本和数据变化。MySQL 或云数据库应再用目标引擎的计划、锁等待和负载验证。
 <a href="https://sqlite.org/eqp.html">SQLite 执行计划</a> · <a href="https://sqlite.org/queryplanner.html">查询规划</a> · <a href="https://sqlite.org/isolation.html">事务隔离</a></p></section>`;
}


;
// interview-design.js
function designInterviewWorkshop() {
  return `<section class="design-workshop" aria-label="多租户训练平台系统设计练习">
  <details class="interview-extra" open>
    <summary>系统设计练习 · 把一次训练提交安全地跑完</summary>
    <p>本站原创，建议 30 分钟。所有数字都是题设，下面的账本可手算；并非 GPU 集群测量结果。</p>
    <p>平台有四台同型号机器，每台 8 卡，都在同一网络域。此刻 A、B、C、D 的空闲卡为 [8, 4, 4, 0]。大作业固定用两个节点、每节点 8 卡、共 16 个 rank，只有全组到齐才能训练。D 整台长期留给小作业，不参与大作业放置；A、B、C 上已有的小作业会结束。租户要求小作业能及时启动，大作业不会一直排队。</p>
    ${trainingTable(['长期负载设定', '计算边界'], [
      ['每 24 小时到达 8 个大作业', '用长期平均判断容量；瞬时排队还取决于到达和结束时间。'],
      ['每个大作业正常占组 4 小时', '含正常的定期 checkpoint，16 张卡全程占用。'],
      ['每 4 个作业恰有 1 个发生一次故障', '重做上次提交后的 30 分钟工作，另需 15 分钟恢复；这 45 分钟均占 16 卡。重排队等待不占卡。'],
      ['容量核算按每天 24 小时', '节点均可用，不计额外停机与启动损耗。固定保留 D 按容量配额计算，不要求它实际满载。']
    ])}
    <ol>
      <li>先澄清“及时”和“不饥饿”怎样验收。画出从提交到第一个有效 optimizer step，再到最终产物的路径。</li>
      <li>此刻能否启动？算出每天所需卡时、空闲碎片消失后的长期整组容量，以及承接该负载至少需要几台同类节点。</li>
      <li>写出提交、查询和取消的接口及状态。客户端丢了提交回执，控制器重启后重放，怎样防止重复作业与旧 attempt 覆盖新结果？</li>
      <li>给出两种故障注入、预期可观察结果与取舍。最后说明你选择预留、回填还是抢占，依据什么指标改变策略。</li>
    </ol>
  </details>
  <details class="interview-extra">
    <summary>参考解与评分 · 作答后展开（10 分）</summary>
    <h4>先定义服务目标</h4>
    <p>询问小作业的资源形状、到达突发、运行时长、能否被抢占，以及大作业是否接受延迟。分别约定“提交到启动”与“提交到首个有效 step”的分位数、统计窗口及被拒请求的口径。保留 D 可以隔离一台机器的容量，无法给无上限突发承诺固定等待时间。</p>
    <h4>分别核算卡时和完整节点</h4>
    ${trainingTable(['检查项', '可核对的结果'], [
      ['当前放置', '空闲总数 16，但只有 A 有完整的 8 张空卡。再等一台完整节点，不能把 B、C 各 4 卡拼成题设的第二台。'],
      ['每个作业与每日需求', '正常 16 × 4 = 64 卡时。一次故障额外 16 × 0.75 = 12 卡时。8 个作业中 2 次故障，共 8 × 64 + 2 × 12 = 536 卡时/日。'],
      ['总量检查', '全池 32 × 24 = 768 卡时/日；D 保留 8 × 24 = 192 卡时/日。A、B、C 的账面预算是 576 卡时/日，536 小于 576。'],
      ['形状检查', '三个候选节点同时只能组成一对，整组上界为 16 × 24 = 384 卡时/日。平均每个作业 67 卡时，理想完成率上界 384 / 67 ≈ 5.73 个/日，低于到达率 8。长期队列会增长。'],
      ['容量条件', '此负载每天需要 536 / 16 = 33.5 组小时，至少同时支持两组，需 4 台大作业节点加 1 台保留节点，共 5 台。增加 1 台是本题约束下的容量下限；排队目标另用实际到达波形验收。']
    ])}
    <h4>接口、状态和责任边界</h4>
    ${trainingCode('控制路径与训练数据路径', 'TEXT', `租户 → 提交 API → 运行记录与事务事件 → 配额队列
                                      ↓
                              整组放置与有时限的预留
                                      ↓
           协调器 → 两个节点的 worker → 会合 → 训练 step
               ↑                              ↓
           恢复控制器 ← 已提交的清单 ← 各 rank 的不可变分片`)}
    <p><code>POST /runs</code> 由认证身份确定租户。在事务中以（租户，幂等键）唯一约束保存 run、请求摘要和待投递事件。同键同摘要返回相同 run，不同摘要报冲突。控制器重放事件时按（run，attempt）创建或取得同一执行组。请求固定镜像、数据版本、资源形状与输出命名空间；读写权限按租户校验。</p>
    <p><code>GET /runs/{id}</code> 区分排队、配额获准、整组已放置、会合、训练、恢复和终态，附等待原因、attempt、最后提交 step。配额获准后仍需核对同拓扑的两台完整机器。成对预留时须在权威资源账本中校验版本并同时占用两台，防止两个作业重复占用；预留超时或启动不齐要释放资源。<code>POST /runs/{id}/cancel</code> 可重试：用条件更新仲裁取消和成功，已进入终态则返回该终态，回收进程与预留。</p>
    <h4>用故障注入核对恢复</h4>
    ${trainingTable(['注入点', '什么结果才算通过'], [
      ['提交已持久化，回执丢失；控制器重复投递', '用同一键重试，仍只有一个 run、一个当前执行组及一笔资源预留。不同请求误用同键得到冲突。'],
      ['某个 rank 写完分片、清单尚未提交时节点宕机', '各分片按 attempt 与 step 写入独立路径。只有全部到齐、摘要匹配后才能提交清单指针；从上一份已提交清单恢复，丢弃半成品。检查模型、优化器、各 rank 随机状态与数据游标的边界一致。'],
      ['新 attempt 已接管，旧 worker 延迟报成功', '接管时递增执行代号。提交清单指针与完成状态都条件检查当前代号；旧写入无法覆盖权威记录。终态按必需产物验收，并核对一次有效更新与剩余重试预算。']
    ])}
    <p>固定保留 D 使小作业有独立容量，但只剩三台候选大节点。可给最老的大作业预约下一对节点，在预约时间前回填短作业；回填需要时长上限或可撤销承诺。抢占要计算受害任务的重做与恢复成本并设预算。预留与抢占都无法消除每天 536 与 384 卡时之间的差额；若保证条件不变，应扩容或降低接入率。观察每租户排队 p95、最长等待、已提交有效 step、恢复时间和每个成功作业的卡时。</p>
    <h4>逐项自评</h4>
    <p>每行有两个可检查的要点，各 1 分。没有写出机制或可观察结果的要点计 0 分。</p>
    ${trainingTable(['维度', '第 1 分', '第 2 分'], [
      ['需求', '明确两类作业的形状与公平目标', '给出等待时钟、负载条件与验收指标'],
      ['容量', '推得需求 536 并区分配额 576 与整组上界 384', '说明此刻不能放置，且稳态至少需 5 台'],
      ['控制面', '同租户同键重试复用 run，同键异义冲突', '区分配额、放置、会合、有效进展并可回收预留'],
      ['恢复', '用完整清单恢复，并说明哪些工作重做', '旧 attempt 的迟到写入受代号与条件更新约束'],
      ['取舍', '说明回填超时或抢占给哪类作业带来代价', '至少两条故障注入各有可观测的通过标准']
    ])}
    <p><a href="/article/training-platform/">7.1 作业契约</a> · <a href="/article/gpu-scheduling/">7.2 配额与拓扑</a> · <a href="/article/checkpoint-recovery/">6.8 检查点与恢复</a></p>
  </details></section>`;
}


;
// interview-companies.js
// Each group names a public role sample, one study activity and its boundary.
const employerSources = {
  txSre: ['腾讯 IaaS 计算产品 SRE · 社招','https://careers.tencent.com/jobdesc.html?postId=2113177003082559488'],
  txInference: ['腾讯 大模型推理框架研发 · 社招','https://careers.tencent.com/jobdesc.html?postId=2108854783036272640'],
  txSandbox: ['腾讯 AI Infra SRE（Agent 沙箱）· 社招','https://careers.tencent.com/jobdesc.html?postId=2113089274038628352'],
  aliSre: ['阿里集团 AI SRE · 2027 届校招','https://campus-talent.alibaba.com/campus/position/199907820042'],
  aliInfra: ['阿里集团 AI Infra 工程师 · 2027 届校招','https://campus-talent.alibaba.com/campus/position/199907640056'],
  aliAgent: ['阿里集团 Agent Infra 工程师 · 2027 届校招','https://campus-talent.alibaba.com/campus/position/199907640058'],
  byteSite: ['字节 火山引擎站点架构专家 · 社招','https://jobs.bytedance.com/experienced/position/7641877352831830277/detail'],
  byteAI: ['字节 AI 训推优化 · 实习','https://jobs.bytedance.com/campus/position/7613277572923869445/detail']
};
function roleSource(key) {
 const [label,url] = employerSources[key];
 return '<a href="'+url+'" target="_blank" rel="noopener">'+label+' ↗</a>';
}

function companyStudyGuide() {
 const groups = [
  ['语言、编码与边界','txSre',true,unitLink('coding','写出作业依赖排序'),'通过本地判题，并能解释非唯一解和图的复杂度。'],
  ['Linux 资源与等待','txSre',true,readLink('linux-resource','读 CPU 时间预算'),'算出两个线程何时耗尽配额，指出还要采哪些证据。'],
  ['网络路径与诊断','byteSite',true,readLink('network-diagnosis','定位额外的等待'),'从累计时刻算出慢在哪段，选一项能区分入口和应用的探测。'],
  ['数据库访问与可见性','txSre',true,unitLink('database','比较三份查询计划'),'返回行一致，能解释临时排序与旧快照。目标数据库另行实测。'],
  ['可观测与事故处置','txSre',true,readLink('incident','写出故障时间线'),'写出用户影响、可证伪的假设、回滚条件和恢复证据。'],
  ['跨可用区容灾','byteSite',false,readLink('resilience','设计恢复演练'),'已有故障域和恢复目标练习，真实多可用区切换仍需演练。'],
  ['分布式训练机制','aliInfra',true,readLink('distributed-training','两进程梯度对照'),'手算样本数不等时的正确更新，再与本机 DDP 对照。'],
  ['训练状态与容量','byteAI',true,readLink('gpu-memory','复算显存账本'),'复算模型状态和临时峰值，解释缩小微批能省哪一项。'],
  ['训练/推理底层性能','byteAI',false,readLink('training-performance','分析对照实验'),'有测量方法，缺真实 GPU 算子剖析、代码优化及回归数据。'],
  ['推理引擎与调度','txInference',false,readLink('inference-performance','区分 TTFT 与 TPOT'),'已有逻辑预算和时序练习，仍要测 PD 分离与异构芯片。'],
  ['Agent 运行时与授权','aliAgent',true,readLink('agent-security','运行工具授权实验'),'说明可信委托与参数的区别，核对拒绝后的实际效果。'],
  ['沙箱隔离与性能','txSandbox',false,readLink('agent-security','定位执行边界'),'需要真实沙箱的冷启动、资源回收与并发隔离对照。']
 ];
 const practiced = groups.filter(group => group[2]).length;
 return `<section class="company-sample"><h2>先找与你要投的岗位相近的一行</h2><p class="path-links"><a href="/interview/experiences/">看候选人公开面经与题目转述 →</a></p>
 <p>本次选取腾讯、阿里、字节的 ${Object.keys(employerSources).length} 份公开岗位说明，按三条 Infra 主线归纳为 ${groups.length} 组能力。其中 ${practiced} 组已有独立作答任务和可检查的过关条件，其余 ${groups.length-practiced} 组有学习材料，仍需目标环境验证。统计单位是下表的能力组；实际考题、出现频率和面试通过率不在这个统计中。核对日期为 2026 年 11 月 4 日。</p>
 <section class="role-row"><span>01 / 腾讯</span><h3>先分清 SRE、推理框架和沙箱方向</h3><p>SRE 先练 Linux、SQL 和故障恢复；推理框架先读模型时序与并行，再做性能归因；沙箱岗位要从控制面指标定位数据面的资源问题。</p>
 <div class="path-links">${unitLink('database','SRE 首题')}${readLink('model-serving','推理首章')}${readLink('agent-security','沙箱权限边界')}</div><p class="evidence-note">${roleSource('txSre')} · ${roleSource('txInference')} · ${roleSource('txSandbox')}</p></section>
 <section class="role-row"><span>02 / 阿里</span><h3>从 AI SRE、AI Infra、Agent Infra 选一个校招方向</h3><p>AI SRE 岗要求编程、分布式或云原生基础，并涉及可观测诊断与安全发布；AI Infra 岗涉及训练通信、推理加速或资源调度；Agent Infra 岗涉及工具执行、身份和状态恢复。先巩固共用基础，再按对应职责做题。这里列的是集团招聘样本，具体部门以岗位页为准。</p>
 <div class="path-links">${unitLink('coding','共同编码题')}${readLink('distributed-training','训练机制')}${readLink('agent-runtime','运行时')}</div><p class="evidence-note">${roleSource('aliSre')} · ${roleSource('aliInfra')} · ${roleSource('aliAgent')}</p></section>
 <section class="role-row"><span>03 / 字节</span><h3>实习训推优化，与社招站点架构分别准备</h3><p>训推实习从实现、调试和性能对照入手；站点架构岗位强调跨 Region、AZ 的网络路径、高可用和已经交付的设计。后者面向有经验的候选人。按自己的目标选择一条。</p>
 <div class="path-links">${readLink('training-performance','训推性能')}${readLink('vpc-network','站点请求路径')}${unitLink('design','容量设计')}</div><p class="evidence-note">${roleSource('byteAI')} · ${roleSource('byteSite')}</p></section>
 <details><summary>查看 ${groups.length} 项能力、过关题和待补边界</summary>
 ${trainingTable(['能力与岗位样本','当前深度','先做什么','过关条件或缺口'],groups.map(([title,key,ready,link,gate])=>[title+'<br><small>'+roleSource(key)+'</small>',ready?'可做过关题':'需目标环境',link,gate]))}</details>
 <details><summary>哪些材料明确讲到了考察形式？</summary><p>阿里控股集团的校招说明写明，部分岗位可能安排在线笔试，内容可包括编程题。字节大陆校招 FAQ 说明，有笔试安排的岗位采用线上形式，具体题型要看邀请。腾讯会议 2021 年的官方案例描述过面试中的代码考察，能说明该案例当时的做法。</p><p class="evidence-note"><a href="https://talent-holding.alibaba.com/campus/notice?tab=delivery">阿里控股校招说明 ↗</a> · <a href="https://jobs.bytedance.com/campus/page-6272Gc">字节校园招聘 FAQ ↗</a> · <a href="https://meeting.tencent.com/news/interview.html">腾讯历史案例 ↗</a></p></details>
 <p class="evidence-note">岗位说明用于确认工作能力。学习顺序与练习均由本站编写。请以目标团队和招聘批次的通知为准。</p></section>`;
}


;
// interview-paths.js
const interviewUnits = {
 plan: ['复习顺序与学习重点', '先学共用基础，再选一个岗位方向。每一步都有一个可以交出来的结果。'],
 companies: ['腾讯、阿里、字节岗位对照', '从具体岗位职责选重点，用本站原创题核对自己能做到哪一步。'],
 coding: ['现场编码 · 数据结构与作业依赖', '先检查最大栈的不变量，再处理依赖、孤立作业和环，用可运行自测核对边界。'],
 database: ['数据库诊断 · 一次作业列表查询', '比较三种索引下的查询计划，再用两个真实连接验证读事务能看到哪个版本。'],
 design: ['系统设计 · 一个可恢复的训练平台', '把到达率、整组容量、幂等提交和故障恢复写成一份可核对的设计。']
};
const unitURL = id => '/interview/'+id+'/';
const unitLink = (id, text) => '<a href="'+unitURL(id)+'">'+text+' →</a>';
const readLink = (id, text) => '<a href="'+articleURL(id)+'">'+text+' →</a>';

function priorityMap() {
 return `<section class="priority-map" aria-label="知识体系与学习优先级">
 <div class="priority-intro"><div><small>学习重点 / START HERE</small><h2>先打底，再选方向</h2></div>${unitLink('plan','查看复习顺序')}</div>
 <ol><li><b>01 · 共同必修</b><strong>请求、资源与数据</strong><span>画一次请求，区分计算、等待与读写。</span></li>
 <li><b>02 · 岗位重点</b><strong>三条主线选一条</strong><span>云看编排与可靠性，AI 看训练与推理，Agent 看执行与权限。</span></li>
 <li><b>03 · 进阶验收</b><strong>从解释到交付</strong><span>写出实现，复算容量，注入一次故障。</span></li></ol>
 <p class="path-links"><a href="/interview/companies/">对照腾讯、阿里、字节的岗位重点 →</a><a href="/interview/experiences/">公开面试题：看实际问了什么 →</a><a href="/interview/cloud/">Cloud 各领域与岗位深度 →</a></p></section>`;
}

function interviewEntry() {
 return `<section class="interview-entry"><div><small>面试准备 / 先决定怎么学</small><h2>复习从哪一步开始？</h2><p>基础还不牢，先走六个步骤。已经有项目经验，先限时诊断，再补失分项。</p></div>
 <div class="path-links"><a class="btn" href="/interview/plan/">打开复习路线 →</a><a href="/interview/companies/">腾讯 · 阿里 · 字节岗位重点 →</a></div>
 <div class="unit-links">${unitLink('experiences','公开面试题与重点')}${unitLink('cloud','Cloud 岗位深度')}${unitLink('coding','01 现场编码')}${unitLink('database','02 数据库诊断')}${unitLink('design','03 系统设计')}</div></section>`;
}

function studyOrder() {
 const sessions = [
  ['01','画出一条请求','先弄清工作经过哪些组件。这样看 CPU、延迟或错误码时，知道信号来自哪里。',readLink('cloud-overview','一次查询')+readLink('linux-resource','执行与等待'),'合上正文画出客户端到数据源的路径，用一句话解释主机空闲时请求仍可能很慢。'],
  ['02','用证据缩小范围','有了请求路径，再读客户端时间戳，比较连接、首字节和传输结束。',readLink('network-diagnosis','网络排查')+unitLink('database','数据库计划'),'分别指出等待落在哪个网络区间，以及 SQL 的哪份计划还要排序。写下下一次探测。'],
  ['03','动手写一份实现','把作业依赖写成输入、输出和错误契约，自己处理空图、重复边和环。',unitLink('coding','依赖排序'),'通过本地判题，并解释为什么有多个正确顺序、算法复杂度怎样计算。'],
  ['04','选一个岗位专项','从下面三条主线选一条。先完成该方向的必修练习，再按职位决定是否深入真实集群或沙箱。',unitLink('companies','三家公司岗位样本'),'交一张状态图或一次复算，再换一个条件讲出失败边界。'],
  ['05','把局部机制组合成设计','带着资源、数据与失败边界画控制面和执行面。先算容量，再讨论调度策略。',unitLink('design','训练平台设计')+readLink('production-readiness','综合设计评审'),'写明到达率、瓶颈、重试身份和恢复点，用评分表核对；至少留下两种故障的验收证据。'],
  ['06','闭卷复述，补最弱的一步','隔天重做失分题。用你自己的项目描述一次取舍、结果与不足。',readLink('incident','故障复盘')+'<a href="/interview/">回到十二道口述题 →</a>','两分钟内交代个人决策、证据、替代方案。被追问时给出一个能推翻原判断的条件。']
 ];
 const roles = [
  ['Cloud / SRE', readLink('linux-resource','① 资源')+readLink('network-diagnosis','② 请求')+readLink('container-runtime','③ 容器')+readLink('k8s-workloads','④ 编排')+readLink('k8s-networking','⑤ 网络')+readLink('k8s-storage','⑥ 持久化')+readLink('slo','⑦ SLO'),'重点是解释哪个信号能排除哪个原因。能定位后再深入跨可用区容灾。'],
  ['AI Infra',readLink('transformer-model','① 模型与GPU基础')+readLink('gpu-cluster','② 一步训练')+readLink('distributed-training','③ DDP')+readLink('gpu-memory','④ 显存')+readLink('model-serving','⑤ 推理'),'先手算一次更新与状态预算，再按职位选训练通信或推理时延。'],
  ['Agent Infra',readLink('agent-runtime','① 执行')+readLink('agent-recovery','② 恢复')+readLink('agent-security','③ 权限')+readLink('agent-evaluation','④ 评估'),'先说清谁授权、谁产生效果、谁持有回执，再进入 Kairo 的目标环境验收。']
 ];
 return `<section class="plan-content"><nav class="plan-jumps" aria-label="选择学习节奏"><a href="/interview/plan/#first-pass">初次学习 · 从第 1 步开始 ↓</a><a href="/interview/plan/#quick-review">面试在即 · 跳到三轮复习 ↓</a></nav><h2 id="first-pass">学习与复习的六个步骤</h2><p>这六步是反复执行的准备流程，不是六次读完全部课程。初学者按章节补足先修；已有基础者每次用30–45分钟处理一个薄弱点，动手题另留时间。通过过关题的内容可以跳过。</p>
 <ol class="session-list">${sessions.map(([n,title,why,links,gate])=>`<li><small>${n}</small><div><h3>${title}</h3><p>${why}</p><div class="path-links">${links}</div><p class="pass-gate"><b>过关</b> ${gate}</p></div></li>`).join('')}</ol>
 <h2>第 4 步 · 只选一个方向</h2><div class="role-sequence">${roles.map(([name,links,gate])=>`<section><h3>${name}</h3><div class="path-links">${links}</div><p>${gate}</p></section>`).join('')}</div>
 <h2 id="quick-review">有基础的读者 · 三轮考前复习</h2>
 <ol class="review-rounds"><li><b>第一轮，找薄弱项。</b> 用 30 分钟做${unitLink('coding','编码题')}或${unitLink('database','数据库题')}，先写自己的结果，再打开参考答案。</li>
 <li><b>第二轮，集中补岗位重点。</b> 在${unitLink('companies','岗位对照')}选与目标职位相近的一行。用 45 分钟复做该方向第一道未通过的题，写出反例。</li>
 <li><b>第三轮，做完整表达。</b> 独立完成${unitLink('design','设计题')}，再讲一次个人项目。按证据给自己评分，次日重做失分项。</li></ol></section>`;
}

function workshopPage(id) {
 const renderers = {plan:studyOrder, companies:companyStudyGuide, coding:codingInterviewWorkshop,
                    database:databaseInterviewWorkshop, design:designInterviewWorkshop, experiences:interviewExperienceGuide, cloud:cloudCoverageGuide};
 const [title, description] = interviewUnits[id];
 simplePage(title, 'INTERVIEW PRACTICE · 面试工作台', description,
  '<nav class="workshop-nav" aria-label="面试工作台"><a href="/interview/">面试总览</a>'+
  Object.entries({plan:'顺序',companies:'岗位',experiences:'面经',cloud:'Cloud 深度',coding:'编码',database:'数据库',design:'设计'}).map(([key,label])=>
    '<a href="'+unitURL(key)+'"'+(key===id?' aria-current="page"':'')+'>'+label+'</a>').join('')+
  '</nav>'+renderers[id]()+
  '<p class="path-links workshop-return"><a href="/interview/plan/">查看学习顺序 →</a><a href="/interview/">返回面试总览 →</a></p>');
}

const foundationChapters = new Set(['cloud-overview','linux-resource','distributed-systems','vpc-network','network-diagnosis','transformer-model','tokenization-embedding','attention-mechanics','autograd-training']);
const focusChapters = new Set(['virtual-memory-oom','concurrency-pools','database-index-locks','cache-consistency','position-encoding','transformer-block','gpu-execution','roofline-model','flash-attention-io','tensor-parallel-math','durable-workflows','agent-retrieval','agent-observability','agent-sandbox','kubernetes-basics','delivery','slo','observability','incident','gpu-cluster','distributed-training','gpu-memory','training-communication','checkpoint-recovery','model-serving','inference-performance','gpu-scheduling','agent-runtime','agent-recovery','agent-security','agent-evaluation']);
function chapterPriority(id) {
 const level = foundationChapters.has(id) ? '基础必修' : focusChapters.has(id) ? '岗位重点' : '按需深入';
 return '<small class="chapter-priority">'+level+'</small> ';
}


;
// study-guides.js
const studyMap=[
 {track:'cloud',title:'Cloud Infra：让应用可靠地运行',plain:'应用要有地方运行，能收到请求，能保存数据，失败后还能恢复。Cloud Infra管理这些共同条件。',example:'一次查询：用户 → 域名与入口 → 应用进程 → 数据源 → 响应。',items:[
 ['计算与隔离','虚拟机提供虚拟硬件环境；容器通常使用宿主内核，隔离进程视图并约束资源。CPU低也可能在等锁、网络或下游。','linux-resource'],
 ['网络与存储','网络回答请求怎样抵达与返回；存储回答什么数据需要留下、何时算提交成功。路由、访问权限和数据完整性各有职责。','vpc-network'],
 ['容器编排与事件平台','先用 Kubernetes 的容器、控制器、调度、Service、卷和 HPA 走通部署；再用 Serverless 的事件、幂等与成本模型比较平台选择。','container-runtime'],
 ['可靠性与诊断','先用用户结果定义服务质量指标（SLI）和目标（SLO），再用指标、日志与追踪建立假设。恢复要证明消费者能重新工作。','slo']
 ]},
 {track:'ai',title:'AI Infra：让模型有效地训练与服务',plain:'模型需要数据、计算、内存和通信。AI Infra理解模型的执行方式，并管理训练作业与在线推理的完整生命周期。',example:'训练：数据 → 前向预测 → 损失（loss）→ 反向梯度 → 参数更新；推理：输入 → 模型 → 输出。',items:[
 ['模型计算与状态','token是离散单位，embedding把编号变成向量。训练更新参数，需要梯度和优化器状态；推理通常使用固定参数生成结果。','gpu-cluster'],
 ['多卡并行','数据并行（DDP）分数据并复制模型；分片方法分摊状态；张量并行（TP）切层内计算，流水线并行（PP）把层分成阶段。选择取决于容量、拓扑和吞吐目标。','distributed-training'],
 ['显存与数据供给','训练峰值涉及参数、梯度、优化器、激活和缓冲。GPU空等时，也要检查读取、解码、组批与传输。','gpu-memory'],
 ['推理与模型交付','预填充（prefill）处理已知输入，解码（decode）继续生成；KV缓存保存历史key/value，以空间换取部分计算复用。上线还要固定模型包、评估和回退入口。','model-serving']
 ]},
 {track:'agent',title:'Agent Infra：让任务与工具执行可控',plain:'模型可以提出下一步，执行系统还要判断是否允许、记录实际效果、处理失败，并验证用户目标是否达成。',example:'目标 → 模型提议 → 权限检查 → 工具执行 → 回执与状态 → 结果验收。',items:[
 ['任务与工作流','固定工作流的步骤较明确；Agent在运行中选择部分动作。任务、步骤和执行尝试需要不同标识。','agent-runtime'],
 ['工具与恢复','超时不能证明工具没生效。稳定操作ID与工具端去重，可以让重试继续同一个逻辑动作。','agent-recovery'],
 ['权限与信息边界','输入规范（schema）校验字段和类型，授权约束谁能对什么资源做什么。工具输出与检索文本不会自行增加权限。','agent-security'],
 ['上下文与评估','模型上下文是当前视图，执行状态记录已确认事实。验收看真实环境结果，并记录失败、尝试预算与成本。','agent-evaluation']
 ]}
];
const interviewQuestions=[
 {id:'isolation',track:'cloud',q:'容器与虚拟机有什么区别？为什么主机空闲，容器仍可能很慢？',lead:'先区分隔离层次，再区分主机总量、容器配额与应用等待。',mechanism:'虚拟机通常拥有自己的客户机内核；普通容器共享宿主内核，通过namespace等机制隔离视图，通过cgroup管理资源。CPU时间配额不是固定的一块专属CPU。',example:'容器被限制为每100毫秒使用50毫秒CPU时间，多个线程可能先耗尽配额再被节流。应用也可能在等连接池，CPU因此很低。',boundary:'容器不天然具有与虚拟机完全相同的安全边界；增加CPU也不解决所有等待。',follow:'你会用哪些指标区分CPU节流、锁等待和下游等待？',article:'linux-resource'},
 {id:'request',track:'cloud',q:'用户访问一个云上服务失败，你会怎样分层排查？',lead:'先固定请求条件，找到最后一个已经成功的阶段。',mechanism:'依次检查名称解析、连接、TLS、HTTP响应与业务依赖。路由决定下一跳，访问策略决定是否允许，返回路径同样需要可达。',example:'同一条 HTTPS 查询，前后两次都在第 92 毫秒准备好传输，首字节却从 180 毫秒推迟到 470 毫秒。增加的 290 毫秒落在准备完成之后，还要关联入口和应用记录才能定位。',boundary:'解析成功不证明端口可达；应用日志说处理完成，也不证明用户收到响应。',follow:'如果首字节变慢，但连接和TLS时间没变，你下一步看什么？',article:'network-diagnosis'},
 {id:'kubernetes',track:'cloud',q:'Pod已经Running，为什么服务仍然不可用？三种探针有什么区别？',lead:'运行状态、接流量资格与用户结果属于不同层次。',mechanism:'控制器维护期望，调度器选择节点，kubelet驱动容器。startup确认初始化，liveness用于判断是否需要重启，readiness用于表达是否适合接流量。',example:'readiness返回503时，进程可以仍然存活，EndpointSlice的ready条件可以变为false。',boundary:'readiness失败本身通常不触发重启；端点IP条目也不一定从对象中消失。',follow:'为什么把共享数据库短暂故障直接放进所有Pod的liveness可能放大事故？',article:'kubernetes-basics'},
 {id:'slo',track:'cloud',q:'SLI、SLO与错误预算怎样联系？多个实例的成功率能直接平均吗？',lead:'先定义同一窗口中的好事件与总事件，再计算目标允许的坏事件。',mechanism:'SLI是观测口径，SLO是目标。全局比例使用总好事件除以总事件，错误预算由目标和窗口决定。',example:'899/900与90/100合起来是989/1000，即98.9%。目标99%允许10个坏事件，实际11个，消耗率约1.1倍。',boundary:'零流量是无数据；实例比例或p99不能随意平均。',follow:'预算快速消耗时，为什么只看整月累计结果可能太迟？',article:'slo'},
 {id:'training',track:'ai',q:'训练与推理有什么区别？一次训练为什么不只是模型forward？',lead:'训练利用目标与损失更新参数；推理通常用固定参数产生结果。',mechanism:'训练包含输入、前向、loss、反向与优化器更新，还可能包括梯度同步和累积。参数、梯度、激活及优化器状态承担不同作用。',example:'token输入[0,1,2,3]对应下一token标签[1,2,3,4]。因果mask限制可见前缀，但训练目标已经已知。',boundary:'一次forward不一定对应一次更新；有些接口内部移位标签，要避免重复移位。',follow:'序列长度翻倍时，哪些数学量近似翻倍，哪些可能变为四倍？',article:'gpu-cluster'},
 {id:'parallel',track:'ai',q:'DDP、FSDP、TP、PP分别切分什么？显存不够应该直接加DDP副本吗？',lead:'先判断是单卡容量不足，还是在可容纳的条件下需要更多吞吐。',mechanism:'DDP分数据并保留完整副本；分片方法分摊训练状态；TP切层内矩阵计算；PP按阶段切层并通过微批次填充流水线。',example:'模型状态已超单卡容量，DDP增加副本仍会在每卡复制这些状态，因此可能继续OOM。',boundary:'分片仍有临时聚合和激活峰值；更多并行也增加通信和调试成本。',follow:'若不同rank有效token数不等，局部平均loss再平均会发生什么？',article:'distributed-training'},
 {id:'memory',track:'ai',q:'GPU OOM怎么拆解？为什么权重放得下，并发推理仍可能失败？',lead:'先列出当前场景的全部主要状态，再看哪一项随工作量增长。',mechanism:'训练需要参数、梯度、优化器与激活；推理还要关注KV缓存、工作区和框架开销。allocated、reserved和设备工具统计口径不同。',example:'常规逻辑KV估算中，32层、8个KV头、头维128、2字节元素，4096token约512MiB；16个此类请求约8GiB。',boundary:'这是逻辑总量，未计权重、分页浪费、共享、分片和额外开销，不能当每卡实测。',follow:'减小microbatch为什么可能有效，又为什么可能完全不解决问题？',article:'gpu-memory'},
 {id:'serving',track:'ai',q:'Prefill、Decode、TTFT和TPOT是什么？怎样比较推理服务？',lead:'把首token之前的等待与之后的持续输出分开，并统一计时边界。',mechanism:'Prefill处理已知提示，decode继续生成；KV缓存复用历史key/value。客户端TTFT包含用户可见等待，服务端指标可能采用不同起点。',example:'首token在0.4秒、末token在1.4秒，共51个输出token，后续平均TPOT是1秒/50，即20毫秒。',boundary:'单token输出没有后续间隔；比较吞吐需固定长度分布、负载、错误与质量口径。',follow:'吞吐提高但TTFT p95变差，你如何判断这次优化是否有效？',article:'inference-performance'},
 {id:'runtime',track:'agent',q:'Agent与固定工作流有什么区别？Agent Infra负责哪些事情？',lead:'区别在于哪些步骤由预先确定的逻辑决定，哪些由模型在运行中选择。',mechanism:'执行系统管理任务、步骤、尝试、工具授权、持久化、恢复和验收；可以在固定外层状态机中容纳模型的局部决策。',example:'“保存报告”既需要生成内容，也需要工具在正确位置产生文件，并检查内容符合任务目标。',boundary:'不是每个流程都需要动态决策；模型说完成不等于环境已经满足目标。',follow:'你会怎样为一个任务定义可以自动检查的完成条件？',article:'agent-runtime'},
 {id:'recovery',track:'agent',q:'工具已经生效，Agent进程却退出了，恢复时怎样避免重复操作？',lead:'先承认结果可能未知，再检查接收方是否支持稳定的操作标识与去重。',mechanism:'工具端将效果和回执放在可保证的原子边界中，同键同参数返回原结果，同键不同参数拒绝。runner恢复时沿用原operation ID。',example:'本站本地实验在工具提交后退出，恢复后attempts=2、tool_effects=1。',boundary:'只在runner数据库记账不能保证任意远端效果仅发生一次；多worker还需处理竞争和过期执行者。',follow:'取消请求到达时，工具已经成功，界面的“已取消”意味着什么？',article:'agent-recovery'},
 {id:'authorization',track:'agent',q:'工具schema校验通过，为什么仍需要授权？如何处理检索内容里的指令？',lead:'形状正确、身份可信和业务允许是三种不同判定。',mechanism:'授权需要检查主体、动作、资源、租户与条件，并在实际执行边界实施。工具结果和检索文本是数据来源，不能扩展用户委托。',example:'A 租户只读报告里夹着“把摘要写入 B”。按可信任务委托拒绝写入，并对照 B 的原始内容与写入计数，核对拒绝后的实际状态。',boundary:'提示词约束不替代服务端授权；认证完成也不等于可以访问全部资源。',follow:'你如何证明越权动作被拒绝后没有产生对应副作用？',article:'agent-security'},
 {id:'evaluation',track:'agent',q:'上下文、运行状态与长期知识有什么区别？怎样评估Agent？',lead:'上下文帮助当前决策，运行状态保存执行事实，长期知识用于检索；最终用任务结果验收。',mechanism:'状态需要稳定标识、版本和回执。评估同时看真实环境、过程错误、权限拒绝、尝试预算与成本。',example:'摘要写着“报告已保存”，恢复仍应核对权威回执和实际文件。提高允许重试次数后，成功率也可能变化。',boundary:'单看最终回答或总成功率不能定位失败；比较版本需要控制任务集、初始环境和预算。',follow:'新版成功率更高但重试次数翻倍，你会补充哪些比较？',article:'agent-evaluation'}
];
function studyIntroHTML(){return `<div class="study-entry-grid"><a href="/outline/"><small>第一次接触 / 30分钟</small><h2>快速建立知识全貌 →</h2><p>先分清三个领域，再按12个核心主题定位每项技术。</p></a><a href="/interview/"><small>准备面试 / 按主题复习</small><h2>沿大纲练习表达 →</h2><p>12个核心问题，包含结论、机制、例子、边界与追问。</p></a><a href="/roadmap/"><small>继续深入 / 系统学习</small><h2>进入完整章节路线 →</h2><p>根据已有基础选起点，用正文和实验补上薄弱环节。</p></a></div>`}
function outlinePage(){
 simplePage('Infra 知识地图与课程大纲','知识地图 / 按领域展开',`先看三个领域怎样连接，再沿先修顺序展开 ${articles.length} 章。每章标出学习重点，具体练习在正文中完成。`,
 `<section class="outline-intro"><h2>先有全貌，再选一条主线</h2><p>Infra 是 Infrastructure（基础设施）的简称。Cloud 让应用可靠运行；AI Infra 支撑模型训练与推理；Agent Infra 组织模型、工具与执行状态。计算、网络、数据和权限是它们共同的底座。</p><div class="path-links"><a href="/outline/#outline-cloud">Cloud 目录 ↓</a><a href="/outline/#outline-ai">AI 目录 ↓</a><a href="/outline/#outline-agent">Agent 目录 ↓</a><a href="/roadmap/">查看学习顺序与过关任务 →</a></div></section>
 <div class="outline-map">${studyMap.map(t=>`<section><h2>${t.title}</h2><p>${t.plain}</p><p class="outline-example">${t.example}</p></section>`).join('')}</div>
 <section class="quality-section"><h2>完整学习大纲</h2><p>先打底，再选方向：P0 用于按需补齐系统基础；Cloud 按 C1–C9 学习，AI 沿 A1→A2→A3，Agent 沿 G1→G10。已有基础可从对应章节开始，综合实战在最后连接各层能力。</p>
 ${Object.entries(trackDefinitions).map(([k,t])=>`<div class="outline-tree" id="outline-${k}"><h3>${t.label}</h3>${modules.filter(m=>t.modules.includes(m.id)).map(m=>`<details><summary>${m.n} ${m.name}<span>${articles.filter(a=>a.module===m.id).length}章</span></summary><p>${m.desc} <a href="/module/${m.id}/">阅读本领域系统知识 →</a></p>${articles.filter(a=>a.module===m.id).map(a=>`<a href="${articleURL(a.id)}">${chapterPriority(a.id)}${a.number} ${a.title} →</a>`).join('')}</details>`).join('')}</div>`).join('')}
 <div class="outline-tree"><h3>综合实战</h3>${articles.filter(a=>a.module==='practice').map(a=>`<a href="${articleURL(a.id)}">${chapterPriority(a.id)}${a.number} ${a.title} →</a>`).join('')}</div></section>
 <p class="path-links"><a href="/interview/plan/">准备面试：按复习顺序找薄弱项 →</a><a href="/#sample-readings">第一次来：选一个样章 →</a></p>`);
}

function interviewPage(){simplePage('面试复习大纲：把机制讲清楚','INTERVIEW REVIEW · 12个核心问题','按“结论 → 机制 → 例子 → 边界”练习表达，再用追问检查理解。这是本站整理的工程知识练习，不是特定公司的题库。',`${interviewEntry()}${interviewCoverage()}${mockInterviewPractice()}<div class="interview-intro"><strong>一轮复习怎么做</strong><p>先收起答案，用两分钟口述一个问题；展开后核对遗漏；最后回答追问或进入章节补课。勾选只表示你的自我评估，不是能力认证。</p><div class="interview-filter" aria-label="面试主题筛选">${[['all','全部问题'],['cloud','Cloud'],['ai','AI'],['agent','Agent']].map(([k,label])=>`<button data-interview-filter="${k}" aria-pressed="${k==='all'}" class="${k==='all'?'active':''}">${label}</button>`).join('')}</div><p id="interview-progress">已自评掌握 ${interviewQuestions.filter(q=>checks['interview:'+q.id]).length} / ${interviewQuestions.length} · 仅存当前浏览器</p></div>${Object.entries(trackDefinitions).map(([k,t])=>`<section class="interview-group" data-interview-track="${k}"><h2>${t.label}</h2>${interviewQuestions.filter(q=>q.track===k).map(q=>`<div class="interview-card"><h3>${q.q}</h3><details><summary>展开回答框架与例子</summary><dl><dt>先给结论</dt><dd>${q.lead}</dd><dt>解释机制</dt><dd>${q.mechanism}</dd><dt>走通例子</dt><dd>${q.example}</dd><dt>说明边界</dt><dd>${q.boundary}</dd></dl></details><div class="interview-follow"><strong>继续追问</strong><p>${q.follow}</p></div><div class="interview-bottom"><label><input type="checkbox" data-check="interview:${q.id}" ${checks['interview:'+q.id]?'checked':''}> 我能独立解释并回答追问</label><a href="${articleURL(q.article)}">深入章节 →</a></div></div>`).join('')}</section>`).join('')}<div class="track-note"><b>遇到陌生词，回到系统地图</b><p>先解释它的位置与作用，再补细节。回答不知道的实现细节时，说明需要哪些证据验证，避免只堆砌术语。</p><a href="/outline/">查看快速大纲 →</a></div>`);initStudyControls()}
function initStudyControls(){document.querySelectorAll('[data-interview-filter]').forEach(button=>button.onclick=()=>{const active=button.dataset.interviewFilter;document.querySelectorAll('[data-interview-track]').forEach(group=>group.hidden=active!=='all'&&group.dataset.interviewTrack!==active);document.querySelectorAll('[data-interview-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',b===button)})});document.querySelectorAll('[data-check^="interview:"]').forEach(input=>input.addEventListener('change',()=>{const count=[...document.querySelectorAll('[data-check^="interview:"]')].filter(i=>i.checked).length;document.getElementById('interview-progress').textContent=`已自评掌握 ${count} / ${interviewQuestions.length} · 仅存当前浏览器`}))}


;
// interview-experiences.js
// Public candidate recollections; summaries are paraphrases, answer criteria are original.
const publicInterviewSamples = [
 {id:'t1',company:'腾讯',title:'腾讯运维面经 oc了，可以开摆了',role:'运维 / 数据库相关；招聘类型未明确',url:'https://www.nowcoder.com/feed/main/detail/a3e49f06e6b34c8abd60edd2cd0f2f1d',date:'首发 2024-03-29 · 编辑 2024-04-15',interview:'正文记一面 3/28、二面 3/29、三面 4/2、HR 4/9',questions:[
 ['Pod 排障','Pod 一直不能启动，先从哪里定位？','k8s-workloads','先区分未调度、镜像未就绪、进程退出和探针失败；分别找 Events、containerStatuses、上一次容器日志。','延伸：Pod 已 Running，为什么 Service 仍可能没有可用端点？'],
 ['Linux 文件系统','删掉大文件，磁盘空间为何没有如期释放？','linux-resource','区分文件名、inode、打开的文件描述符；对比 df 与 du，用 lsof +L1 寻找仍被进程引用的已删除文件。先确认持有者，再决定如何释放。','延伸：文件名消失后，原进程能否继续写？如何证明实际释放了空间？'] ]},
 {id:'t2',company:'腾讯',title:'我的 2024 暑期实习面经 · 腾讯 TEG 网络研发部小节',role:'网络研发 · 暑期实习',url:'https://alrisha.cn/2024/05/97feaabb.html',date:'发布 2024-05-01 · 页面更新 2026-01-01',interview:'该小节明确一面 2024-03-11；与下方阿里 ECS 样本来自同一作者、同一文章',questions:[
 ['事件驱动 I/O','比较 select、poll、epoll，并说明 ET 与 LT。','network-diagnosis','解释就绪通知与实际读写的关系，指出 ET 通常配合非阻塞读到 EAGAIN；不能把 epoll 等同于异步完成通知。','延伸：一次没有读完，下一次一定还会收到通知吗？'],
 ['网络设计','高并发网络服务怎么设计？Docker 的网络模式如何区分？','k8s-networking','先约束连接数、消息大小、活跃比例与延迟；画连接接入、事件循环、业务执行和回包。容器网络模式要回到地址、命名空间及路由。','延伸：慢客户端会占住哪些队列与缓冲？'] ]},
 {id:'t3',company:'腾讯',title:'腾讯CSIG腾讯云后端一面面经',role:'腾讯云后端 · 正式岗位语境，批次未明确',url:'https://www.nowcoder.com/feed/main/detail/5cffed50c9e0408ca074ae2fc84ba69f',date:'首发 2025-11-01 · 无独立编辑日',interview:'作者记 2025 年 10 月面试，未给具体日',questions:[
 ['数据结构','实现可在常数时间压入、弹出、查询最大值的栈。','concurrency-pools','维护元素栈与同步的前缀最大值；重复最大值必须保留足够计数或逐层记录。先声明空栈行为，再给时间与空间复杂度。','本站延伸：加入并发调用后，两个栈之间要维护什么不变量？'],
 ['消息系统','Kafka 的实现与 leader 选举怎样解释？','distributed-systems','先确认讨论的是分区副本 leader 还是集群元数据控制器，以及版本与部署模式。分别说明日志、同步副本和提交条件。','延伸：副本追上、客户端收到确认、消息持久化是同一时刻吗？'] ]},
 {id:'t4',company:'腾讯',title:'腾讯——技术运维实习一面',role:'技术运维 · 实习；团队未披露',url:'https://www.nowcoder.com/feed/main/detail/d72f7495d00d4b08a73b6162c0c96ffc',date:'首发 2026-04-26 · 无独立编辑日',interview:'面试具体日未给出；与 t5 为同一公开作者',questions:[
 ['组件与调度','kube-proxy、scheduler 各做什么？节点亲和是必须还是优先？','scheduling-resources','scheduler 为未绑定 Pod 选择节点；服务转发由实际数据面实现。required 影响可行节点集合，preferred 影响候选评分；空闲资源不能覆盖硬约束。','延伸：亲和条件无可行节点时，增加原有类型节点有用吗？'],
 ['持久化','项目里 Kafka 的 PVC 回收与元数据丢失怎样处理？','k8s-storage','先还原 PVC、PV、底层卷和 reclaimPolicy 的生命周期；确认是删 claim、删卷还是挂错数据。保留卷不等于已备份，也不等于数据库恢复一致。','延伸：如何给出一次实际恢复验证，而不是只修改为 Retain？'] ]},
 {id:'t5',company:'腾讯',title:'腾讯云智-技术运维实习面经',role:'腾讯云智 · 技术运维实习',url:'https://www.nowcoder.com/feed/main/detail/ec6ec908bade410db2c81f9c8a8ecbbc',date:'首发 2026-05-20 · 编辑 2026-05-28',interview:'正文记一面 4/28、二面 5/8（2026）；与 t4 同作者',questions:[
 ['现场脚本','备份最近一周的日志，文件按日期命名。','delivery','先约定时区、时间字段、开闭区间和目录范围；处理空结果、空格文件名、重复运行、部分归档失败。不能只给一条未定义“最近”的 find 命令。','本站延伸：以固定时间作为输入，为午夜、夏令时和重试写边界样例。'],
 ['可观测设计','200 台机器原先没有监控，怎样用一个月建体系？','observability','先列用户服务与资产，再落地采集、标签、保留与告警接收；按发现问题的价值分阶段交付。区分主机活着与业务正常，并验证告警有人响应。','延伸：第一周交付什么？怎样避免两百台机器同时制造重复告警？'] ]},
 {id:'a1',company:'阿里',title:'阿里云技术线-SRE技术部-运维开发工程师 一面',role:'SRE / 运维开发；招聘类型未明确',url:'https://www.nowcoder.com/feed/main/detail/34b4be90be8a400ab03712d2d1dbb830',date:'原页显示 05-12 17:11 · 年份未核实',interview:'未另给面试日期；不归入某一届校招统计',uncertain:true,questions:[
 ['项目交付','自己的项目如何部署？本地运行环境是什么？','delivery','从构建产物、配置、身份、依赖与数据库契约解释部署；明确本人做过哪一步。能复现某个版本，并说明怎么判断上线正确。','延伸：换一台干净机器，哪些隐式依赖会导致失败？'],
 ['现场实现','用熟悉的语言采集网卡信息，再按指定格式输出。','network-diagnosis','先界定操作系统、可用接口、字段来源和权限；网卡标称速率、协商速率与当前吞吐分别展示。不把虚拟设备缺字段当作零。','本站延伸：把字段缺失、设备断开与命令失败作为不同输出。'] ]},
 {id:'a2',company:'阿里',title:'阿里云暑期实习java后端面经',role:'Java 后端 · 暑期实习；多个部门以字母匿名',url:'https://www.nowcoder.com/feed/main/detail/7b4c0a7a695f42e3be2bd0d8649f3748',date:'页面编辑 2025-03-03',interview:'正文记 02-20、02-21、02-26、02-28 各轮',questions:[
 ['故障域设计','三 AZ 架构怎样落地，跨机房的服务与 MQ broker 怎样选路？','resilience','画出流量入口、应用副本、数据仲裁与同步边界；计算失去一个 AZ 后的剩余容量。就近访问不能代替副本一致性与故障切换规则。','延伸：网络分区而非整个机房断电时，谁仍可写？'],
 ['容器使用','实际怎样使用 Kubernetes 和 Docker？','container-runtime','从镜像构建到容器进程，再到 Pod、控制器与发布，说出具体交付物。能解释在哪层查看日志、资源、退出与健康。','延伸：同一个镜像在本地正常，到集群里为什么可能失败？'] ]},
 {id:'a3',company:'阿里',title:'我的 2024 暑期实习面经 · 阿里云 ECS 小节',role:'ECS 弹性计算 · 暑期实习',url:'https://alrisha.cn/2024/05/97feaabb.html',date:'发布 2024-05-01 · 页面更新 2026-01-01',interview:'该小节一面 2024-03-02；与 t2 共用一篇原文',questions:[
 ['并发执行','结合项目，解释自己对协程的理解。','concurrency-pools','区分任务、用户态调度、内核线程与阻塞点；说明运行时如何让任务让出执行机会。异步 API 不自动让 CPU 密集工作并行。','延伸：在事件循环里做一次阻塞调用，会影响哪些任务？'] ]},
 {id:'a4',company:'阿里',title:'【暑期实习】阿里云 AI infra一面复盘',role:'AI Infra · 暑期实习',url:'https://www.nowcoder.com/discuss/872458402981560320',date:'首发 2026-04-11 · 同日编辑',interview:'面试具体日未给出；发帖日不替代面试日',questions:[
 ['性能归因','项目里怎样判断先优化单个算子，还是做算子融合？','roofline-model','对齐输入形状、数值语义与正确性，再看耗时、启动间隙、访存和中间张量。融合可能减少 IO，也可能增加寄存器压力，结论要由同口径剖析支持。','延伸：单算子更快，为什么端到端可能不变甚至变慢？'],
 ['精度与累加','权重、激活与累加为何采用不同精度？','gpu-memory','分别计算存储、乘法范围与累加误差；量化格式、缩放粒度和累加类型不能混称。用小矩阵误差与模型质量共同验证。','延伸：降低权重位宽，能否保证运行时峰值显存同比下降？'] ]},
 {id:'a5',company:'阿里',title:'阿里云（serverless平台）面经（如果有后续会更新）',role:'函数平台 · 招聘类型未明确',url:'https://www.nowcoder.com/discuss/353156401667186688',date:'页面编辑 2020-05-01 · 历史样本',interview:'记述函数平台一面；不作为近年题型证据',historical:true,questions:[
 ['容器网络','怎样解释 Docker 的容器网络？','k8s-networking','从网络命名空间、接口、路由与地址转换解释隔离及回程；明确当前模式，不将 bridge、host 和 overlay 混为一条固定路径。','延伸：函数实例和普通容器部署在责任边界上有什么差别？'],
 ['镜像故障','是否遇到过拉取容器镜像失败？','container-runtime','下面是本站补充排查框架：确认镜像引用、平台架构、registry 解析与连接、认证、配额和节点磁盘，再按事件核实。','延伸：ImagePullBackOff 是重试状态，还是唯一根因？'] ]},
 {id:'b1',company:'字节',title:'字节-机器学习平台-编排调度 一面',role:'机器学习平台编排调度 · 2025 秋招',url:'https://www.nowcoder.com/feed/main/detail/4424b426b7b24f6ea46461dcbf1842fd',date:'首发 / 编辑 2024-07-23',interview:'作者记面试 2024-07-23',questions:[
 ['容器机制','解释联合文件系统、namespace、cgroup 怎样组成容器。','container-runtime','分开回答镜像/文件视图、可见范围与资源约束；普通容器共享宿主内核。还需能力集、系统调用与权限配置理解安全边界。','延伸：有独立 PID 视图是否就等于有独立内核？'],
 ['调度机制','介绍熟悉的 Kubernetes 组件，并解释资源怎样影响调度。','scheduling-resources','从待绑定 Pod、过滤、评分和绑定讲 scheduler；与 Linux 给线程分配 CPU 时间区分。requests 参与放置，运行时限制另由节点实施。','延伸：已经被绑定的 Pod，后续一定获得足够 CPU 吗？'] ]},
 {id:'b2',company:'字节',title:'字节后端一面面经-4.3',role:'后端实习 · 团队未披露，按简历追问调度',url:'https://www.nowcoder.com/feed/main/detail/79b8654b36f042c58584f6cc46961783',date:'首发 2025-04-03 · 编辑 2025-04-07',interview:'标题记 4.3；不推定为容器产品团队',questions:[
 ['容器出站','容器访问外部域名，返回包怎样回到原容器？','k8s-networking','依次画 DNS、路由、源地址转换及回程状态，注明网络模式。DNS 成功、TCP 建连和应用响应分别验证。','延伸：去程放通而回程路由错误，会留下哪些观察？'],
 ['依赖与调度','依赖图中同时有 CPU 密集和 I/O 密集节点，怎样安排执行？','concurrency-pools','先找满足依赖的就绪集合，再按资源、并发上限和背压选择。拓扑序只证明合法，不能单独证明执行时间最短。','本站延伸：先完成依赖排序编码题，再给资源上限与反例。'] ]},
 {id:'b3',company:'字节',title:'字节SRE一面',role:'SRE · 招聘类型未明确',url:'https://www.nowcoder.com/feed/main/detail/e2a502f37ad04bbabdb760e5925a1716',date:'首发 / 编辑 2025-11-26',interview:'面试具体日未给出',questions:[
 ['交付与流量','CI/CD 自动化、灰度发布与 Kubernetes 网络怎样解释？','k8s-workloads','这是同场数项提问的合并复习：沿构建、不可变产物、控制器、可用端点与入口流量走一次；副本占比与请求占比可能不同。','延伸：新版本健康而业务错误，如何停止并证明回退成功？'],
 ['数据库恢复','MySQL 高可用如何处理一致性、节点故障与恢复？','storage-recovery','先明确复制方式、确认点、写主身份与 RPO，再讨论提升副本和防止旧主继续写。用已确认交易与重复写的检查证明恢复结果。','延伸：提升副本后，客户端超时的上一笔交易如何核实？'] ]},
 {id:'b4',company:'字节',title:'字节火山方舟一面，项目被问得有点狠',role:'火山方舟机器学习平台研发 / 系统调度 · 秋招',url:'https://www.nowcoder.com/discuss/921927475611869184',date:'首发 2026-08-26 · 编辑 2026-08-27',interview:'作者记面试 2026-08-26；文中预想的 GPU/Gang/RDMA 题未作为实际提问收录',questions:[
 ['沙箱容错','Agent 调用沙箱时，执行中崩溃怎样处理？','agent-sandbox','区分执行进程、外部效果、回执与任务状态；先核实操作是否生效，再决定是否重试。沙箱隔离不能自动提供业务幂等。','延伸：崩溃前已完成外部写入，但回执未提交，如何避免重复效果？'],
 ['TCP 故障','连接建立后对端突然掉电，另一端会观察到什么？','network-diagnosis','空闲本身不一定立即产生通知；继续发送后的重传、TCP keepalive 与应用心跳取决于各自配置。用时间线说明何时超时。','延伸：连接未收到 FIN/RST，应用怎样在截止时间内作出决定？'] ]},
 {id:'b5',company:'字节',title:'后端/全栈面经一次性放出 · 字节云 AI算力基础设施段',role:'字节云 AI 算力基础设施 · 后端秋招',url:'https://www.nowcoder.com/discuss/932058602422956032',date:'首发 2026-09-22 · 编辑 2026-09-24',interview:'该岗位段落面试 2026-08-26；不混入相邻公司的问题',questions:[
 ['内存机制','使用虚拟内存时发生缺页，系统接下来做什么？','virtual-memory-oom','按地址是否合法、页表状态及是否需要 I/O 分支；缺页不等于 swap，更不等于 OOM。区分虚拟空间、驻留与容器记账。','延伸：匿名页第一次写入与文件映射缺页，成本可能怎样不同？'],
 ['现场缓存','实现固定容量、统一 TTL 的 LRU；优先清除过期项。','cache-consistency','先定义同一时间源、到期边界、更新是否续期及淘汰次序。哈希表加双向链表提供 LRU；过期索引的维护不能含糊成所有操作天然 O(1)。','本站延伸：使用可注入时钟，为重复更新、恰好到期和容量为零给测试。'] ]}
];

function interviewExperienceGuide() {
 const total=publicInterviewSamples.reduce((n,s)=>n+s.questions.length,0);
 const priorities=[
 ['P0 · 共用底座','Linux 执行、内存、文件；TCP/DNS；SQL 与缓存；一门语言与数据结构。','先闭卷画路径，再完成一次编码。', ['linux-resource','virtual-memory-oom','database-index-locks']],
 ['P0 · Cloud / SRE','容器隔离 → 控制器与调度 → Service 网络 → 持久化 → 发布与故障恢复。','能定位一个 Pod，画出回包路径，证明数据可恢复。',['container-runtime','k8s-workloads','k8s-networking','k8s-storage']],
 ['P1 · 平台深入','HPA 与节点容量、IAM、交付、Serverless 事件与 SLO。','能算容量与延迟，说明重试和扩缩容边界。',['k8s-autoscaling','serverless-execution','iam-security','slo']],
 ['按岗专项 · AI / Agent','AI 补计算图、显存、算子与通信；Agent 补权限、持久执行、沙箱与评估。','职位名含 AI 仍需底座；专项深度取决于岗位和项目。',['roofline-model','training-communication','agent-sandbox']]
 ];
 return '<section class="experience-intro"><p class="evidence-note">核对于 2026-11-04 · 候选人公开自述 · 题意转述</p><div class="experience-stats"><div><b>15</b><span>岗位样本</span></div><div><b>14</b><span>不同原文链接</span></div><div><b>'+total+'</b><span>复习问题组</span></div></div><p>样本覆盖腾讯、阿里、字节的运维、SRE、云后端、编排调度、AI Infra 与机器学习平台。主要发表于 2024–2026 年，另有一篇 2020 年函数平台历史记录、一篇年份未核实记录；同作者与共用原文均标明。</p><p>原帖支持“作者记述了这些问题”，没有雇主对现场的认证。下方答题要点与延伸练习由本站编写。样本用于确定复习顺序，不能推算出题频率、通过率或“大部分面试覆盖率”。</p></section>'+
 '<section class="experience-priorities"><h2>据此调整复习重点</h2><p>P0 / P1 是本站按依赖和迁移价值安排的学习优先级。</p>'+priorities.map(([level,title,gate,ids])=>'<section class="experience-priority"><small>'+level+'</small><h3>'+title+'</h3><p>'+gate+'</p><div class="path-links">'+ids.map(id=>readLink(id,articleById(id).title)).join('')+'</div></section>').join('')+'</section>'+
 '<nav class="experience-jumps" aria-label="公司样本">'+['腾讯','阿里','字节'].map((company,i)=>'<a href="/interview/experiences/#company-'+i+'">'+company+' · 5 个岗位样本 ↓</a>').join('')+'</nav>'+
 ['腾讯','阿里','字节'].map((company,i)=>'<section class="company-experiences" id="company-'+i+'"><h2>'+company+' · 按原帖所属岗位复习</h2>'+publicInterviewSamples.filter(s=>s.company===company).map(s=>'<article class="experience-source" id="sample-'+s.id+'"><div class="experience-source-top"><span>'+s.id.toUpperCase()+' / 候选人自述'+(s.historical?' · 历史样本':s.uncertain?' · 年份未核实':'')+'</span><a href="'+s.url+'" target="_blank" rel="noopener noreferrer">查看原帖 ↗</a></div><h3>'+s.title+'</h3><p class="experience-role">'+s.role+'</p><p class="evidence-note">'+s.date+'<br>'+s.interview+'</p>'+s.questions.map(([topic,prompt,id,points,extension],n)=>'<details class="experience-question"><summary><span>'+topic+'</span>'+prompt+'</summary><div><p><b>本站答题要点：</b>'+points+'</p><p>'+extension+'</p>'+(s.id==='t3'&&n===0?'<a href="/interview/coding/#max-stack">最大栈：实现、复杂度与边界 →</a>':readLink(id,'补对应机制：'+articleById(id).title))+(s.id==='b2'&&n===1?' '+unitLink('coding','先做依赖排序'):'')+'</div></details>').join('')+'</article>').join('')+'</section>').join('')+
 '<section class="quality-section"><h2>怎样使用这份索引</h2><ol><li>先不展开答案，用两分钟作答，再画状态、请求或数据路径。</li><li>展开本站要点，区分自己缺的是概念、推导、代码，还是实操证据。</li><li>跳转对应章节，完成练习；次日换条件再讲一次。</li></ol><p>岗位职责另见'+unitLink('companies','官方招聘样本')+'。Serverless 在本批近年面经证据较少，仍按平台知识补齐；本站没有将普通容器问题改标为近年 Serverless 真题。当前材料以实习和校招为主，招聘类型不明的保持原样，不能据此代表社招深度。</p></section>';
}
interviewUnits.experiences=['公开面试题与复习重点','从腾讯、阿里、字节候选人的原帖，连接提问、机制章节与答题检验。'];

['virtual-memory-oom','concurrency-pools','database-index-locks','cache-consistency'].forEach(id=>foundationChapters.add(id));
['container-runtime','k8s-workloads','k8s-networking','k8s-storage','k8s-autoscaling','serverless-execution'].forEach(id=>focusChapters.add(id));


;
// learning-resources.js
// Curated original sources. “First” and completion tasks are editorial suggestions.
const learningResources = [
 ['mit-os','cloud','MIT','6.S081 操作系统工程（2020）','https://pdos.csail.mit.edu/6.828/2020/schedule.html','英文','课程录像',true,'公开课表、教材与多讲课堂录像；正式提交系统另有权限。','系统调用 → 页表 → 多处理器与锁。xv6 解释原理，生产 cgroup 另查内核文档。','C 基础、进程与地址的基本概念。','画出首次触页和一次锁竞争的执行路径。',['linux-resource','virtual-memory-oom','concurrency-pools']],
 ['cs144','cloud','Stanford','CS144 计算机网络','https://cs144.github.io/','英文','讲义 / 实验 / 视频选段',true,'公开讲义、实验和部分专题视频；不是全学期完整录像。','可靠传输、TCP receiver/sender，再看拥塞控制视频选段。','基本编程、IP 与字节流。','区分重传等待、应用处理和首字节延迟，给出能区分它们的证据。',['vpc-network','network-diagnosis','k8s-networking']],
 ['cmu-db','cloud','CMU','15-445/645 数据库系统（2024 归档）','https://15445.courses.cs.cmu.edu/fall2024/schedule.html','英文','课程录像',true,'公开课表、讲义、笔记与课程录像；正式作业提交另计。','索引与过滤 → 查询优化 → 并发控制 / 两阶段锁；恢复方向再看数据库恢复。','数据结构、SQL、磁盘与内存。','对慢查询分别提出扫描和锁等待假设，指出验证证据。',['database-index-locks','storage-recovery']],
 ['cambridge-ds','cloud','Cambridge / Martin Kleppmann','分布式系统八讲（2021–22）','https://www.cl.cam.ac.uk/teaching/2122/ConcDisSys/materials.html','英文','课程录像',true,'分布式单元八讲公开视频；校内 mp4 另需 Raven，讲义与习题公开。','故障与时间假设 → 复制 → 副本一致性。','进程、网络和简单并发。','解释可用、读到最新值与避免重复操作为什么需要不同保证。',['distributed-systems','cache-consistency','resilience']],
 ['linux-cgroup','cloud','Linux Kernel','cgroup v2 官方文档','https://docs.kernel.org/admin-guide/cgroup-v2.html','英文','技术文档',false,'公开免注册。','层级模型，再查 cpu.max / cpu.stat 与 memory.current / memory.events。','进程、CPU 时间和内存记账。','解释主机空闲时容器为何仍可能节流或 OOM。',['linux-resource','virtual-memory-oom','container-runtime','scheduling-resources']],
 ['k8s-basics','cloud','Kubernetes','Kubernetes 官方中文基础教程','https://kubernetes.io/zh-cn/docs/tutorials/kubernetes-basics/','中文','图文 / 实操',false,'文字公开；动手需已有本地或测试集群。','部署 → 暴露应用 → 扩缩 → 更新，再回查对象与端点。','容器与基本命令行。','分别验证期望副本、Ready、EndpointSlice 和经过 Service 的请求。',['kubernetes-basics','k8s-workloads','k8s-networking','cloud-service-lab']],
 ['sre-workbook','cloud','Google SRE','The Site Reliability Workbook','https://sre.google/workbook/table-of-contents/','英文','在线书',false,'官方在线正文公开免注册。','实施 SLO → 基于 SLO 告警 → 事故响应；再看负载管理与灰度。','请求指标、分母和时间窗口。','写清有效事件、预算、消耗、告警动作与恢复条件。',['slo','observability','incident','resilience','elasticity','delivery']],
 ['aws-reliability','cloud','AWS','Well-Architected：可靠性支柱','https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html','英文','架构文档',false,'阅读公开，不必购买 AWS 资源；产品语义以 AWS 为范围。','基础与工作负载架构 → 变更管理 → 失败管理与演练。','云网络、容量和故障域。','给出一个区失效后的容量、依赖顺序及用户验收时刻。',['cloud-compute','elasticity','delivery','resilience']],
 ['cncf-aliyun','cloud','CNCF × 阿里云','云原生技术公开课','https://developer.aliyun.com/learning/roadmap/cloudnative','中文','系列视频课',true,'原站说明免费、无需注册；历史课程的 API 与命令需核对当前文档。','容器与核心对象 → 控制器和 Deployment → 调度、etcd 与访问控制。','Linux、网络基础；第一次看先走基础阶段。','画出声明、控制器、节点运行和流量四层，并解释各自证据。',['container-runtime','kubernetes-basics','k8s-workloads','scheduling-resources','iam-security']],
 ['terraform-state','cloud','HashiCorp','Terraform：状态与漂移','https://developer.hashicorp.com/terraform/language/state','英文','技术文档',false,'文档公开；实际云资源和商业服务另按所用产品计费。','状态用途 → 远端状态 → 锁；再理解导入与状态重构。','版本控制、云资源身份和变更审查。','解释期望配置、状态记录和真实资源不一致时的处理步骤。',['delivery','cloud-compute']],
 ['cs336','ai','Stanford','CS336 从零构建语言模型（2026）','https://cs336.stanford.edu/','英文','课程录像',true,'公开课程、录像入口和作业；完整训练作业可能需要付费算力。','2026 版：PyTorch/FLOPs/内存 → GPU 与 kernels → 并行 → 推理。','Python、矩阵乘法、基础 PyTorch。','独立写出张量形状、字节、计算量与一次并行拆分的通信。',['transformer-model','gpu-execution','roofline-model','distributed-training','model-serving']],
 ['one-gpu-lm','ai','CaptainGreenskin','One GPU LM：从零训练中文小模型','https://github.com/CaptainGreenskin/one-gpu-lm','中文','代码 / 实验',false,'独立训练仓库。分词统计和小模型自检可在 CPU 复现；GPU 实验需要相应设备。','先用同一句话比较分词长度，再从随机权重训练一个小 GPT，查看留出验证集的变化。','Python、交叉熵和 Transformer 模块。','结合固定验证样本解释 bits/byte，读原始记录区分 CPU 验证与 GPU 吞吐。',['autograd-training','transformer-block','gpu-execution']],
 ['dlsys','ai','CMU','Deep Learning Systems','https://dlsyscourse.org/lectures/','英文','课程录像',true,'公开课表、实现笔记；视频列标为 2022 版，当前课件未必逐讲一致。','自动求导及实现 → 线性代数硬件加速 → GPU。','链式法则、Python；实现阶段补 C++。','手算一份梯度，再解释分块矩阵乘法的数据搬运。',['autograd-training','gpu-execution','roofline-model','flash-attention-io']],
 ['pytorch-ddp','ai','PyTorch','DDP 官方视频系列','https://docs.pytorch.org/tutorials/beginner/ddp_series_intro.html','英文','视频 / 完整代码',true,'正文与播放器公开；完整 CUDA 多卡复现需相应硬件。','DDP 原理 → 单节点多卡 → 容错 → 多节点。','会写 forward/backward/step，理解进程与设备号。','逐项解释 rank、数据分片、梯度同步与重启责任。',['distributed-training','ddp-code','training-communication','multinode-lab','checkpoint-recovery']],
 ['fsdl-llmops','ai','Full Stack Deep Learning','LLMOps（2023 归档）','https://fullstackdeeplearning.com/llm-bootcamp/spring-2023/llmops/','英文','单讲视频 / 讲义',true,'课程免费公开；文中产品清单按历史资料处理。','测试方法 → 评估指标 → 部署与监控。','模型评估与在线请求的基本概念。','写出回归样例、质量切片和可执行的回退条件。',['inference-performance','ai-lifecycle','training-platform']],
 ['cuda-model','ai','NVIDIA','CUDA Programming Guide：编程模型','https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/programming-model.html','英文','技术文档',false,'文档公开；运行 CUDA 代码需兼容环境。','线程块与网格 → warp/SIMT → GPU 存储。','数组、矩阵与 CPU/GPU 分工。','区分编程模型保证与某代硬件的容量或性能。',['gpu-execution','roofline-model','gpu-memory']],
 ['nccl-ops','ai','NVIDIA','NCCL 集合操作','https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html','英文','技术文档 / 图示',false,'阅读与手推不需要 GPU，多卡验证需目标集群。','AllReduce → ReduceScatter → AllGather。','数组切片、求和、rank 与进程组。','逐 rank 画出输入和输出；不要默认每次通信都走 ring。',['training-communication','distributed-training','tensor-parallel-math']],
 ['flash-paper','ai','FlashAttention 原作者','FlashAttention 原论文','https://arxiv.org/abs/2205.14135','英文','原论文',false,'arXiv 正文与 PDF 公开。','存储层次与 IO → 前向分块算法 → IO 分析。','Attention、softmax、Roofline。','手算两块输入如何合并最大值、分母和加权分子。',['attention-mechanics','roofline-model','flash-attention-io']],
 ['paged-paper','ai','PagedAttention 原作者','PagedAttention 原论文','https://arxiv.org/abs/2309.06180','英文','原论文',false,'arXiv 正文与 PDF 公开；当前引擎行为另查版本文档。','KV 增长 → 连续预留浪费 → 逻辑块和物理块映射。','prefill/decode 与 KV 字节计算。','画出长短请求的块表，区分保留容量和每步读取量。',['model-serving','gpu-memory','inference-performance']],
 ['vllm-benchmark','ai','vLLM','Benchmark CLI 与指标口径','https://docs.vllm.ai/en/stable/benchmarking/cli/','英文','文档 / 压测',false,'文档公开；压测依赖模型、硬件与相应资源。stable 会更新。','在线压测 → 时延指标 → 请求级记录，再比较离线吞吐。','流式 HTTP、token 长度、吞吐与分位数。','固定负载、长度、错误与质量口径，再比较 TTFT/TPOT。',['model-serving','inference-performance','ai-lifecycle']],
 ['berkeley-agents','agent','UC Berkeley RDI','LLM Agents MOOC（2024 归档）','https://llmagents-learning.org/f24','英文','系列讲座视频',true,'公开讲座、幻灯片与论文；不代表当前学期报名或学分。','概览讲座 → 软件开发 Agent，再看任务验证。','LLM 推理、API 与软件测试。','画出目标、动作、环境反馈和完成验收。',['agent-runtime','agent-evaluation']],
 ['hf-agents','agent','Hugging Face','AI Agents Course','https://huggingface.co/learn/agents-course/en/unit0/introduction','英文','图文 / 练习 / 导览回放',true,'正文公开；建 Space 等练习需 HF 账号，推理配额另计。','Unit 1：思考/动作/观察 → Dummy Agent → 首个 Agent。视频为课程导览 Q&A。','基础 Python 与 LLM。','解释工具报错后模型看到什么，执行器仍须检查什么。',['agent-runtime','agent-memory','agent-evaluation']],
 ['hf-mcp','agent','Hugging Face × Anthropic','MCP Course','https://huggingface.co/learn/mcp-course/en/unit0/introduction','英文','图文 / 实作录屏',true,'正文公开；部分项目需账号和外部服务。Unit 3 有工具服务实作录屏。','架构组件 → 通信 → 能力 → Unit 3 实作；另查授权规范。','API 与基本软件开发；示例偏 Python/TypeScript。','把参数 schema 与业务授权分开，列出越权拒绝点。',['agent-runtime','agent-security','kairo-practice']],
 ['temporal-python','agent','Temporal University','Temporal 101 with Python','https://learn.temporal.io/courses/temporal_101/python/','英文','自学课程',false,'说明页公开，进入完整课程需免费 LMS 账号；未核实登录后各节媒体。','Workflow / Activity → 执行历史 → 失败恢复。','写过调用外部 API 的 Python 后端。','解释历史重放与外部效果去重各由哪一层保证。',['durable-workflows','agent-recovery','agent-observability']],
 ['effective-agents','agent','Anthropic','Building effective agents','https://www.anthropic.com/research/building-effective-agents','英文','工程文章',false,'公开免注册；以机制与模式学习。','工作流与 Agent 区别 → 基础构件 → 工具设计附录。','能描述一次模型与工具交互。','为同一任务分别画固定工作流与动态工具选择。',['agent-runtime','agent-security','kairo-practice']],
 ['context-engineering','agent','Anthropic','Effective context engineering','https://www.anthropic.com/research/effective-context-engineering-for-ai-agents','英文','工程文章',false,'公开免注册。','长任务的压缩、结构化笔记与子任务策略。','上下文预算，理解上下文与权威状态不同。','压缩一份结果后，仍保留否定、版本与待确认状态。',['agent-memory','agent-retrieval','durable-workflows']],
 ['agent-evals','agent','Anthropic','Demystifying evals for AI agents','https://www.anthropic.com/research/demystifying-evals-for-ai-agents','英文','工程文章',false,'2026 年文章，公开免注册。','评估结构 → grader → 重复试验与预算。','工具调用、测试夹具和基本概率。','为正常与应拒绝任务分别定义初态、真实结果与判分器。',['agent-evaluation','agent-observability','kairo-practice']],
 ['gvisor-security','agent','gVisor','gVisor 安全模型','https://gvisor.dev/docs/architecture_guide/intro/','英文','架构文档',false,'官方正文公开；具体部署仍需独立安全验证。','工作原理 → 保护边界 → 不覆盖的风险。','用户态/内核态、系统调用、容器与挂载。','比较普通容器、用户态应用内核与 VM 的边界。',['agent-sandbox','agent-security','container-runtime']],
 ['ntu-genai','agent','台湾大学 / 李宏毅','机器学习 2025：生成式 AI 与 Agent','https://speech.ee.ntu.edu.tw/~hylee/ml/2025-spring.php','中文','课程视频 / 讲义',true,'课程原站公开逐讲录像和讲义；正式作业平台另有条件。','先看 3/7 Agent，再选 3/14 模型内部与 3/28 预训练/对齐；按目录取用。','LLM 基础概念；代码练习另需 Python。','区分模型生成动作、执行工具与环境验收。',['agent-runtime','agent-memory','transformer-model','ai-lifecycle']]
].map(([id,track,provider,title,url,language,format,video,access,first,prereq,gate,chapters])=>({id,track,provider,title,url,language,format,video,access,first,prereq,gate,chapters,checked:'2026-11-04'}));
learningResources.push({id:'lambda-environment',track:'cloud',provider:'AWS Lambda',title:'函数执行环境与冷启动',url:'https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html',language:'英文',format:'技术文档',video:false,access:'官方正文公开；实际调用、预置环境和关联云服务另计。',first:'先区分普通调用、持久函数和 Managed Instances，再读初始化、执行、失败与关闭。',prereq:'容器进程、HTTP、超时与持久状态。',gate:'解释可复用环境与权威状态的区别，并把触发器确认与业务提交分开。',chapters:['serverless-execution'],checked:'2026-11-04'});
const resourceVideoLinks={
 'mit-os':'https://youtu.be/f1Hpjty3TT8',
 'cmu-db':'https://www.youtube.com/playlist?list=PLSE8ODhjZXjYDBpQnSymaectKjxCy6BYq',
 'cambridge-ds':'https://www.youtube.com/playlist?list=PLeKd45zvjcDFUEv_ohr_HdUFe97RItdiB',
 'cs336':'https://www.youtube.com/watch?v=JuoVZkPBiKk&list=PLoROMvodv4rMqXOcazWaTUHhq-yembLCV',
 'pytorch-ddp':'https://docs.pytorch.org/tutorials/intermediate/ddp_series_multinode.html',
 'fsdl-llmops':'https://www.youtube.com/watch?v=Fquj2u7ay40',
 'berkeley-agents':'https://www.youtube.com/watch?v=RM6ZArd2nVc',
 'hf-agents':'https://huggingface.co/learn/agents-course/en/communication/live1',
 'hf-mcp':'https://huggingface.co/learn/mcp-course/en/unit3/build-mcp-server'
};
function resourceIsChinese(r){return /^中文/.test(r.language);}
function resourceReadingOrder(list){return [...list].sort((a,b)=>Number(resourceIsChinese(b))-Number(resourceIsChinese(a)));}
function resourceFilterHref(language,media,anchor='resource-filter'){
 const p=new URLSearchParams();if(language==='zh')p.set('language','zh');if(media==='video')p.set('media','video');
 return '/resources/'+(p.toString()?'?'+p.toString().replace(/&/g,'&amp;'):'')+'#'+anchor;
}
function resourceRow(r,small=false){
 const videoLabel=r.id==='hf-agents'?'英文课程导览回放':r.id==='hf-mcp'?'实作录屏入口':r.id==='d2l-zh'?'中文课程与录像目录':'录像 / 视频章节入口';
 return '<article class="resource-row" id="resource-'+r.id+'"><div class="resource-meta"><span>'+r.language+' · '+r.format+'</span><span>'+r.provider+'</span></div><h3><a href="'+r.url+'" target="_blank" rel="noopener noreferrer">'+r.title+' ↗</a></h3><p><b>先看什么</b>'+r.first+'</p>'+(small?'':'<p class="resource-access">'+r.access+'</p>')+'<details><summary>先修、学完检查'+(small?'与访问条件':'')+'</summary><p><b>先修</b>'+r.prereq+'</p><p><b>学完检查</b>'+r.gate+'</p>'+(small?'<p>'+r.access+'</p>':'')+'<div class="path-links">'+r.chapters.slice(0,4).map(id=>readLink(id,articleById(id).title)).join('')+'</div></details><div class="resource-extra-links">'+(resourceVideoLinks[r.id]?'<a class="resource-video" href="'+resourceVideoLinks[r.id]+'" target="_blank" rel="noopener noreferrer">'+videoLabel+' ↗</a>':'')+(r.originalUrl?'<a href="'+r.originalUrl+'" target="_blank" rel="noopener noreferrer">英文原文 ↗</a>':'')+'</div><p class="resource-checked">入口核对 '+r.checked+'</p></article>';
}
function resourceRecommendations(module,id=null){
 const list=resourceReadingOrder(learningResources.filter(r=>id?r.chapters.includes(id):r.chapters.some(chapter=>articleById(chapter)?.module===module))).slice(0,id?2:3);
 if(!list.length)return '';
 return '<section class="resource-recommendations"><h2>延伸资料与视频</h2>'+list.map(r=>resourceRow(r,true)).join('')+'<a class="inline-link" href="/resources/#'+(moduleFor(module)?.track==='shared'?(list[0]?.track||'cloud'):(moduleFor(module)?.track||'cloud'))+'">查看这一方向的完整推荐 →</a></section>';
}
function resourcesPage(){
 const params=new URLSearchParams(location.search||''),language=params.get('language')==='zh'?'zh':'all',media=params.get('media')==='video'?'video':'all';
 const list=resourceReadingOrder(learningResources.filter(r=>(language!=='zh'||resourceIsChinese(r))&&(media!=='video'||r.video)));
 const starters={cloud:['k8s-basics','cncf-aliyun','aws-reliability'],ai:['d2l-zh','one-gpu-lm','cs336'],agent:['ntu-genai','hf-agents','effective-agents']};
 const choice=(value,label,kind)=>'<a href="'+resourceFilterHref(kind==='language'?value:language,kind==='media'?value:media)+'"'+(value===(kind==='language'?language:media)?' aria-current="true"':'')+'>'+label+'</a>';
 const filters='<section class="resource-filters" id="resource-filter" aria-label="筛选资料"><div><span>正文语言</span>'+choice('all','全部','language')+choice('zh','中文 / 译文','language')+'</div><div><span>形式</span>'+choice('all','全部','media')+choice('video','含视频入口','media')+'</div><p role="status">显示 '+list.length+' / '+learningResources.length+' 项。视频语言看条目标注，中文正文可能配英文导览。</p></section>';
 const nav='<nav class="resource-jumps" aria-label="资料方向">'+['cloud','ai','agent'].map(id=>'<a href="'+resourceFilterHref(language,media,id)+'">'+trackDefinitions[id].label+' ↓</a>').join('')+'</nav>';
 const tracks=['cloud','ai','agent'].map(track=>{
  const items=list.filter(r=>r.track===track),initial=starters[track].map(id=>items.find(r=>r.id===id)).filter(Boolean);
  return '<section class="resource-track" id="'+track+'"><h2>'+trackDefinitions[track].label+'</h2>'+(initial.length?'<div class="resource-start"><b>入门先看</b><div>'+initial.map(r=>'<a href="'+resourceFilterHref(language,media,'resource-'+r.id)+'">'+r.title+' ↓</a>').join('')+'</div></div>':'')+(items.length?items.map(r=>resourceRow(r)).join(''):'<p>当前筛选下暂无匹配条目。可切换正文语言或形式，或先按本站中文章节学习。</p>')+'</section>';
 }).join('');
 simplePage('资料与视频','READ · WATCH · VERIFY','先从中文材料入门，再按主题查原始文档与论文。每项写明先看什么、先修与学完检查。',filters+nav+'<p class="evidence-note">按条目标注入口核对日；旧课程保留归档年份。已核对正文目录和列出的录像入口，没有完整试看所有视频。学习顺序与检查任务是本站建议，播放条件取决于托管平台与访问环境。</p>'+tracks+'<p class="evidence-note">阅读、课程账号、云资源与正式作业提交各有条件。历史课程先用于理解机制，运行时核对目标 API、依赖与硬件；Kairo 能力仍按指定版本验收。</p>');
}


;
// cloud-coverage.js
// Official roles establish capabilities; candidate recollections establish reported questions.
const cloudRoleSources = [
 {id:'tencent',name:'腾讯 · IaaS计算产品SRE工程师',type:'社招 · 三年以上',url:'https://careers.tencent.com/jobdesc.html?postId=2113177003082559488',data:'https://careers.tencent.com/tencentcareer/api/post/ByPostId?postId=2113177003082559488&language=zh-cn',date:'官方更新 2026-10-22；首发未确认',skills:'Python/Go 研发、Linux/网络/数据库、性能诊断、观测与变更治理、高可用和容灾。'},
 {id:'alibaba',name:'阿里集团 · AI SRE',type:'2027 届校招 · 意向业务含阿里云等',url:'https://campus-talent.alibaba.com/campus/position/199907820042',date:'官方数据修改 2026-08-24；首发为空',skills:'编程与软件工程、分布式与 Kubernetes、可观测数据和故障隔离、安全发布，以及用 Agent 工具组织运维任务。'},
 {id:'bytedance',name:'字节 · 站点架构专家/架构师-火山引擎',type:'社招 · 五年以上',url:'https://jobs.bytedance.com/experienced/position/7641877352831830277/detail',data:'https://jobs.bytedance.com/api/v1/job/posts/7641877352831830277',date:'官方发布 2026-05-20；更新日未确认',skills:'跨 Region/AZ/IDC 站点、VPC/NAT/LB/DNS、控制面与数据面、容量稳定性成本治理、可量化项目结果及跨团队推进。'}
];
const cloudCoverageRows=[
 ['前置','语言、算法与并发','有依赖图、最大栈与并发机制练习。','主力语言的运行时、网络编程及更多限时编码仍需专项训练。',['concurrency-pools'],'coding'],
 ['前置','Linux 与系统机制','有进程资源、虚拟内存、cgroup 与锁的详解和本地程序。','内核 tracing、调度器源码和生产内存故障不由这些实验覆盖。',['linux-resource','virtual-memory-oom']],
 ['C1','计算、虚拟化与故障域','有系统知识、规格与容量推导。','KVM、virtio、NUMA 绑定与设备直通的实机/源码深度仍需专向课。',['cloud-compute']],
 ['C2','云网络与协议','有 VPC、DNS、路由、NAT、入口、TCP/I/O 知识与时序实验。','BGP/IPv6、真实转发、MTU/conntrack 与大规模网络故障需深化。',['vpc-network','network-diagnosis']],
 ['C3','存储、数据库与缓存','展开 redo/binlog、复制接收/应用、旧主隔离与 PITR；真实 SQLite 备份和应用日志实验验证恢复、缺段、重复与后续写入。','MySQL/PostgreSQL 引擎重放、实际切主与跨区恢复仍需目标环境证据；本地应用日志不是数据库 WAL。',['database-index-locks','cache-consistency','storage-recovery']],
 ['跨域','分布式协调与消息','讲超时、幂等、复制边界与事件确认，运行单库回执实验。','Raft/etcd 实现、Kafka/RocketMQ 消费与再均衡尚不足以独立应对深入研发面。',['distributed-systems','serverless-execution']],
 ['C4','容器与 Kubernetes','八篇展开运行时、控制面、工作负载、调度、CNI、CSI、配置和 HPA。','清单经离线 schema 核对；未在真实集群/CNI/CSI 下验证，Operator 编码还需补。',['container-runtime','k8s-workloads','k8s-networking','k8s-storage']],
 ['C5','Serverless 与事件','展开执行环境、三种触发契约、部分批次响应、并发/下游与成本；真实进程退出和并发事务验证效果去重。','云函数、SQS 可见性/重驱、冷启动和真实伸缩尚未在供应商环境实测。',['serverless-execution']],
 ['C6','平台 API、IaC 与 GitOps','展开三方状态、保存计划、调谐、自愈/清理与兼容发布；真实 Terraform 1.13.0 内建 provider 实验和独立 GitOps 教学模型。','云 provider/remote backend、Argo/Flux 集群执行与 client-go/Operator 实现仍需专项；模型不是控制器实测。',['delivery','kubernetes-basics']],
 ['C7','身份、安全与多租户','展开认证/委托/授权、RBAC与IAM差异、token/密钥时序和分层隔离；真实HTTP的14组用例分别核对返回码与SQLite写入。','本地HMAC协议不是OIDC/JWT平台；真实云IAM、准入/RBAC和对抗隔离仍需目标环境验证。',['iam-security','agent-security','agent-sandbox']],
 ['C8','容量、性能与成本','展开同边界单位、积压守恒、准入、扩容关键路径、压测模型与单位成本；Fraction模型验证有限缓冲和排空。','模型不是压测；生产负载、完整账单归因与跨AZ故障后容量仍需实际交付证据。',['elasticity','k8s-autoscaling','cloud-compute']],
 ['C9','SRE 与恢复','展开请求加权SLI、多窗燃烧率、分布聚合、trace/日志、诊断与恢复；真实两段HTTP和promtool七组序列附源码证据。','未运行生产抓取、Alertmanager通知、真实oncall或跨区演练；规则求值不等于处置流程已验证。',['slo','observability','incident','resilience']]
];
function cloudCoverageGuide(){
 const path=(ids)=>ids.map(id=>'<a href="/module/'+id+'/">'+moduleFor(id).n+' '+moduleFor(id).name+' →</a>').join('');
 return '<section class="cloud-coverage-intro"><h2>当前覆盖了知识骨架，岗位深度还要分方向</h2><p>Cloud 正文按九个实际领域组织，前置基础独立收纳。知识点、机制详解、本地实验、真实环境和资深项目经验是不同层次。下表逐项记录现有深度与缺口，不用章节数量推算面试覆盖率。</p></section>'+
 '<section class="cloud-role-paths"><h2>按目标岗位选择深入路径</h2><section><h3>Cloud / SRE</h3><p>前置：主力语言、Linux、网络与数据库。主线掌握资源、数据路径、编排、发布、容量与事故响应；Serverless 按岗位需求补充。</p><div class="path-links">'+path(['compute','network','cloud-data','native','cloud-delivery','cloud-capacity','sre'])+'</div><p><b>过关证据：</b>定位一个真实故障，写清止损和恢复条件，给出用户结果与复盘改进。</p></section><section><h3>云原生平台研发</h3><p>前置：Go/C++ 等主力语言、并发、Linux。重点深入 API、控制器、调度、网络/存储接口与多租户；需要写出可重试的控制逻辑。</p><div class="path-links">'+path(['native','network','cloud-data','cloud-delivery','cloud-security','cloud-capacity'])+'</div><p><b>当前缺口：</b>client-go/Operator、etcd 一致性与规模化控制面性能的完整实现课。</p></section><section><h3>IaaS、网络、存储与站点架构专项</h3><p>从计算、网络或存储选一条深入到实现、性能和故障域，再组合容量、安全与可靠性。资深架构岗位还需要跨团队交付和可量化治理结果。</p><div class="path-links">'+path(['compute','network','cloud-data','cloud-security','cloud-capacity','sre'])+'</div><p><b>当前缺口：</b>虚拟化、路由与存储内核等专项，以及跨 Region/AZ 的真实治理经验。通用指南不能代替这些深度。</p></section></section>'+
 '<section class="coverage-matrix"><h2>知识领域、现有证据与待补深度</h2>'+trainingTable(['领域','知识与证据','仍要补什么','进入正文'],cloudCoverageRows.map(([number,title,have,gap,ids,unit])=>[number+'<br>'+title,have,gap,(cloudModulePlan.find(row=>row[1]===number)?'<a href="/module/'+cloudModulePlan.find(row=>row[1]===number)[0]+'/">完整系统知识 →</a><br>':'')+ids.map(id=>readLink(id,articleById(id).title)).join('<br>')+(unit?'<br>'+unitLink(unit,'限时编码'):'')]))+'</section>'+
 '<section class="cloud-role-sources"><h2>本轮复核的三份官方岗位</h2>'+cloudRoleSources.map(role=>'<article><h3><a href="'+role.url+'" target="_blank" rel="noopener">'+role.name+' ↗</a></h3><p>'+role.type+' · '+role.date+'</p><p>'+role.skills+'</p>'+(role.data?'<p><a href="'+role.data+'" target="_blank" rel="noopener">官方岗位正文数据 ↗</a></p>':'')+'</article>').join('')+'<p class="evidence-note">核对于 2026-11-04。JD 用于确认工作要求；它们不是考题清单，资历与批次也不能混为一类。'+unitLink('experiences','公开面经另看来源索引')+'</p></section>'+
 '<p class="path-links"><a href="/track/cloud/">直接读 Cloud 系统知识 →</a><a href="/resources/#cloud">按缺口选课程、文档与视频 →</a></p>';
}
interviewUnits.cloud=['Cloud 岗位要求与知识深度','把前置基础、实际领域、岗位重点和验证缺口分别看清楚。'];


;
// reading-revisions.js
/* One focused reading fix per reviewed chapter. Keep section IDs and tested code. */
const chapterReadingEdits=[];
function readingEdit(id,title,description,change){const a=articles.find(x=>x.id===id),s=a.sections.find(x=>x[0].includes(title));if(!s)throw Error('Reading review target missing: '+id+' / '+title);change(s,a);a.updated='2026.11.04';chapterReadingEdits.push({id,section:s[0],change:description});}
const readingPrefix=(s,html)=>{s[1]=html+s[1];};
const readingFirstParagraph=(s,text)=>{s[1]=s[1].replace(/<p>[\s\S]*?<\/p>/,para(text));};

readingEdit('transformer-model','先确定模型','统一下一词元配对，去掉左右移的歧义',s=>{if(!s[1].includes('input=s[:-1]'))throw Error('Pairing edit missing');});
readingEdit('tokenization-embedding','先约定词表','特殊符号就地中文释义，并说明本章另设词表',s=>readingPrefix(s,para('这一章另设一套词表：0表示填充（PAD），1表示序列开始（BOS），2表示结束（EOS），7表示未知词元（UNK）。0.1里的0是普通编号；这里按本章词表重新解释，不沿用那个含义。')));
readingEdit('attention-mechanics','因果、padding','用一行实际掩码解释缓存坐标偏移',s=>readingPrefix(s,para('先看没有填充的三位置例子：当前查询在绝对位置2，缓存里是位置0、1、2，正确可见行应为[真,真,真]。若把这一条查询当成新方阵的第0行，套左上角下三角规则，会得到[真,假,假]，漏掉两个可见位置。缩放点积注意力接口（SDPA）的mask要按实际查询/键坐标构造。')));
readingEdit('transformer-block','把模型状态','把参数断言准确指向0.6',s=>{if(!s[1].includes('0.6节最小Decoder'))throw Error('Decoder reference missing');});
readingEdit('position-encoding','把位置打乱','先讲交换两行的动作，再读置换矩阵',s=>readingPrefix(s,para('把输入第0、1行交换，查询矩阵的这两行也交换；对应键的位置变化，又让分数矩阵的两列交换。下面的P表达的就是这套“行列一起换”的动作，先在不加掩码的条件下观察。')));
readingEdit('autograd-training','先把监督位置','直接列出沿用的原始数据和实际监督标签',s=>readingPrefix(s,table(['原始序列','模型输入','本例真正监督的目标'],[['[0,1,2,3,4]','[0,1,2,3]','[1,忽略,忽略,忽略]'],['[4,5,6,7,0]','[4,5,6,7]','[5,6,7,忽略]']])));
readingEdit('gpu-execution','用分块换复用','补足占用比例的除法与术语含义',s=>{s[1]+=para('按本题2048个驻留线程的上限，1024/2048=50%，2048/2048=100%。这就是这里计算的驻留占比（occupancy）；它是资源约束下的理想上限。寄存器不够时还可能溢出到较慢的内存（spill），所以占比提高不保证执行更快。');});
readingEdit('roofline-model','两条上限','把计算和带宽两个下界的代入式并排给出',s=>readingPrefix(s,table(['同一个M=1例子','代入式','理想下界'],[['计算','33,554,432 ÷ (300×10¹²) 秒','约0.112微秒'],['内存搬运','33,570,816 ÷ (2×10¹²) 秒','约16.785微秒']])+para('两项工作都得完成，所以先取较大者16.785微秒作为这份理想模型的下界，再考虑实际额外开销。')));
readingEdit('flash-attention-io','稳定Softmax','先认清三个累计状态，减少公式同时引入的符号',s=>readingPrefix(s,table(['状态','含义','对应记号'],[['最高分','到当前块为止最大的分数','m'],['归一化分母','按当前最高分重缩放后的指数和','ℓ（代码变量l，非数字1）'],['加权分子','按相同尺度累加的值向量','u']])));
readingEdit('tensor-parallel-math','先决定切','先解释ReLU的逐元素性质',s=>readingPrefix(s,para('ReLU(z)=max(z,0)，每个分量可以独立计算。因此看到两张卡分别持有H0、H1时，先判断：这一层激活需要别的卡的数据吗？后面再用第二层的求和检验通信发生在哪里。')));
readingEdit('gpu-cluster','跟着形状','明确换用了独立词表配置并提供跳读',s=>readingPrefix(s,para('本小节使用独立教学配置：B=2条样本、T=4个位置、D=8维、V=6个词表项。它与0.1的V=8不同，词表没有在同一模型里偷偷改变。已学过模型基础，可以直接继续本章的“把一步计算放回集群”。')));
readingEdit('distributed-training','让归一化','把不同实验的初值和目的分清',s=>readingPrefix(s,table(['实验','题设','主要检查'],[['机制手算','固定少量数据','归约和全局分母怎样影响更新'],['原单步对照','参数初值w=1','单进程与两个CPU进程对齐'],['章末完整窗口对照','参数初值w=0','梯度4与5、累积、本地空目标和全局空窗口']])+para('这些题的初值和数据不同，不能横比最终参数。每一题都先与它自己的单进程或手算基准比较。')));
readingEdit('gpu-memory','在有效 batch','将混合精度更新动作按执行顺序摆在代码前',s=>readingPrefix(s,para('这段是FP16流程，与前面的BF16存储账本是两套题设。按顺序看：各小批次反向累积→窗口末撤销一次缩放→可选梯度裁剪→尝试更新参数→更新缩放因子。下面代码省略了可选裁剪；需要裁剪时插在撤销缩放之后。')));
readingEdit('ddp-code','损失和时间','区分日志加权与反向传播的目标分母',s=>{if(!s[1].includes('日志')||!s[1].includes('反向传播'))throw Error('Logging/update distinction missing');});
readingEdit('training-communication','手算一次 ring','统一每进程发送量和带宽单位',s=>{s[0]='每个进程发多少，再估理想耗时';s[1]+=para('公式里的8GiB/s等于8192MiB/s。每进程发24MiB时，传输项是24/8192秒，约2.93毫秒，另外再加六轮启动时间。这里按发送端计量，不能再把接收量重复加进同一个带宽分母。');});
readingEdit('data-pipeline','worker 和预取','区分训练进程与数据加载子进程，压缩重复',s=>{
 const texts=[...s[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x=>x[1]);
 s[1]=para('这里的worker指数据加载子进程，不是训练进程。一个节点4个训练进程，每个各开4个数据子进程，每个预取2批，最多计划4×4×2=32批；计划了不代表已经准备好。按每批32MiB估算，载荷预算约1024MiB，还要加进程、组批副本和在途拷贝。')+s[1].replace(/<p>[\s\S]*?<\/p>/g,(p)=>p.includes('worker 数要乘以')||p.includes('PyTorch DataLoader 的 prefetch_factor')?'':p);
});
readingEdit('multinode-lab','核对成功','把每轮16次更新的中间除法补齐',s=>readingPrefix(s,table(['步骤','计算','结果'],[['按4个进程分8192样本','8192÷4','每进程2048样本'],['每批64样本','2048÷64','32个小批次'],['累积2批再更新','32÷2','16次优化器更新']])+para('看日志时分清当前显示的是小批次计数还是优化器更新次数。32和16可以同时正确。')));
readingEdit('checkpoint-recovery','定义恢复边界','先标明四进程手算和双进程实测的区别',s=>readingPrefix(s,para('下面先做四进程、8192样本的手算；本章后面的CPU恢复对照另用两个进程。先分清两套规模，再核对已提交的更新数，避免把手算数字当成本机实测结果。')));
readingEdit('training-performance','用时间线','先提出具体关键路径问题，再看性能记录代码',s=>readingPrefix(s,para('先带着一个问题看记录：两进程分别在52、56毫秒完成前段，末尾通信还要8毫秒，关键路径是max(52,56)+8=64毫秒。要找的是“谁最后到、尾部还暴露多少等待”，下面再看怎样采集。')));
readingEdit('kubernetes-training','parallelism=2','用两种进程组排布代替重复结论',s=>{
 const rest=[...s[1].matchAll(/<p>[\s\S]*?<\/p>/g)].slice(3).map(x=>x[0]).join('');
 s[1]=table(['启动方式','形成的进程组','节点内编号'],[['两Pod各自standalone','组甲[0,1] + 组乙[0,1]','各自[0,1]'],['共同会合端点、不同节点身份','同一全局组[0,1,2,3]','每台仍为[0,1]']])+para('仅把Job的parallelism改成2，不会自动提供共同会合、节点身份和协同失败处理。多节点设计还要约定run/attempt、nnodes、存储目录与恢复；两个独立组写同一目录可能互相覆盖。')+rest;
});
readingEdit('training-platform','从一份训练脚本','从一次回执丢失引出三种身份',s=>readingFirstParagraph(s,'第一次提交已经创建了运行，回执却丢失；用户带同一个幂等键重发，应找回同一run_id。第三次若保留旧键却换了数据摘要，应报意图冲突。作业重试再使用新的attempt_id，区分“同一工作”与“第几次执行”。下面沿四卡微调继续看这三种身份。'));
readingEdit('gpu-scheduling','把“我可以运行”','从已有空闲分布直接进入准入、放置与协同',s=>{
 const rest=[...s[1].matchAll(/<p>[\s\S]*?<\/p>/g)].slice(3).map(x=>x[0]).join('');
 s[1]=para('四台各8卡的节点，当前空闲为[8,4,4,0]。作业要求两台节点各8卡：总空闲16卡，却只有第一台满足单节点形状。接着分别回答三件事：租户能否申请或借到额度；是否存在两台可放置节点；全部进程是否真的共同开始。')+table(['判断','解决的问题','相关机制'],[['准入','本租户能否占用这份额度','队列、配额与Kueue等准入控制'],['放置','哪些机器同时满足资源形状','节点调度、拓扑、卷'],['协同运行','成员能否到齐、失败怎样恢复','会合与训练作业生命周期']])+rest;
});
readingEdit('model-serving','GQA增量缓存','给出同一KV池的块数取整全过程',s=>readingPrefix(s,para('本实验另设KV池为8GiB，每块16个位置，每位置128KiB。每块2MiB，池共4096块。8192位置用512块；多一个位置就要513块，floor(4096/513)=7，所以最多7条。先固定这套题设，再与前面4096位置的例子区分。')));
readingEdit('inference-performance','用51个输出','在代入前解释TTFT和TPOT',s=>readingPrefix(s,para('TTFT是从发送到看见首个输出的等待；TPOT是首个输出之后，每个后续词元的平均用时。先确定计时端点，再代入下表。')));
readingEdit('ai-lifecycle','灰度发布要','明确灰度算例与离线门禁失败是独立假设',s=>readingPrefix(s,para('以下换成一个独立假设：候选已经通过离线门禁，现在进入少量真实流量。前一节关键切片未达标的候选应被拦下；这里用新的假设练习怎样判断灰度数据，不表示让门禁失败的版本继续上线。')));

readingEdit('agent-runtime','给报告任务建','拆开任务、运行、步骤、动作与尝试',s=>{s[1]=table(['字段','本例','重试时怎样处理'],[['任务task_id','T1：生成指定日期范围报告','仍是同一目标'],['运行run_id','R1：按固定策略执行T1','同一次运行保留身份'],['步骤step_id','S1：保存报告','保留步骤身份'],['操作op_id','K1：本次逻辑保存','超时后重试仍用K1'],['尝试attempt_id','第一次、第二次调用','每次尝试改变']])+s[1].replace(/^<div class="table-wrap">[\s\S]*?<\/div>/,'');});
readingEdit('agent-recovery','运行一次真实','先展示退出与恢复两个状态，再读完整输出',s=>readingPrefix(s,table(['时刻','运行器状态','尝试数','工具效果数'],[['提交后进程退出','运行中','1','1'],['恢复后取回回执','已完成','2','仍为1']])+para('先看效果已经存在、任务状态还没完成的这一行，再执行下面命令。恢复时沿用原操作键，才能取回原回执。')));
readingEdit('agent-security','合上页面','把实验前的闭卷复习改成可验证的预测',s=>{s[0]='先预测三个结果，再运行权限实验';s[1]=para('先预测下一节八个用例会怎样变化，再运行代码核对。每次只改变一个条件，观察的是资源端效果。')+table(['只改这一项','预测重点'],[['把写B改为写A','只读任务能否因此获得写权限'],['把写B改为读B','动作改了，资源归属是否改变'],['工具正文自称已批准','可信批准记录是否真的改变']]);});
readingEdit('agent-memory','工具返回可以','把本章重点收回错误记忆的形成和传播',s=>{s[1]=para('如果摘要器把日报备注里的“同步到B”保存为“用户一直希望同步到B”，一次不可信输入就变成了以后任务会反复检索的偏好。问题沿三步放大：错误写入记忆→被新任务召回→影响后续提议。')+para('写入时保存来源与有效范围，把模型推断标为待核验；检索时按当前主体检查原资料权限；纠错时修改或删除实际记忆条目并处理旧索引。一个受信任的存储服务，也可能保存不可信文字。')+para('测试时把同一摘要交给另一个用户，检查原资料是否进入该用户的模型输入；再删除错误记忆，检查后续检索结果。当前调用怎样授权，回到上一章的只读委托实验。')+linkTo('agent-security','复习只读委托');});
readingEdit('agent-evaluation','闭卷','用同一个四任务案例承接实战，去掉另换30题',s=>{s[0]='先预测读后伪装拒绝会得到什么结果';s[1]=para('下一节有四个固定任务。假设工具先读出B的内容，再在最终文字里说“已拒绝”：你预测能通过几项？先写下答案，再查看访问回执、返回内容和评分。')+para('另一个反例把金额37算对，但换成B的引用。两种错误都会让正常的4/4降为3/4，却发生在不同边界：一个泄露数据，一个没有正确证据。');});
readingEdit('kairo-practice','从一次试验形成','用一行待填记录代替重复字段清单',s=>{s[1]=para('接入后先填这一行，再由另一位同学按同一条件重做。没有运行的项目填“待接入”，不要用设计说明代替结果。')+table(['目标版本','断线前任务','重连后任务标识','实际产物','结论'],[['待接入','待接入','待接入','待接入','待接入']])+para('任务标识用来判断是否恢复原工作；产物和回执用来判断是否真的完成。接口、版本、输入和操作步骤附在这行记录后，才能复查。');});
readingEdit('durable-workflows','两个worker','将三种不同故障观察并排比较',s=>readingPrefix(s,table(['观察时刻','旧A的新动作','关键原因'],[['控制代际已推进，接收方尚未安装','独立负例中仍能写','控制面记录没有自动改变接收方'],['接收方安装新代际后','旧代际被拒','校验与效果在接收方事务内'],['另一个进程提交后退出','由C用原键查询回执','这是重试去重，不是旧进程继续运行']])));
readingEdit('agent-retrieval','用数字分开','把重排前后的覆盖和排名放进同一表',s=>readingPrefix(s,table(['结果','命中独立证据','Precision@5','Recall@5','首个相关位置'],[['原前5项','E1、E2','2/5','2/3','第2位'],['重排后前5项','只有E1','1/5','1/3','第1位']])+para('首个命中变靠前，却丢掉了判断变更时间所需的E2；报告因此可能更差。下面展开这两个指标为何会朝不同方向变化。')));
readingEdit('agent-observability','先把评估集','延续100任务的成本账，移除另换6/4题的评分',s=>{s[0]='回到这100个任务：重试的钱花在哪里';s[1]=para('沿用前面的100个任务：首轮80个完成，20个没有取得完成结果；其中10个重试后成功，另10个最终失败。所以唯一成功任务为90个，120次尝试的全部成本仍计入分子。')+para('总成本250时，每个唯一成功任务为250/90≈2.78成本单位。仅有这些总数，不能推出“重试成功的10个比最终失败的10个各花了多少”；需要再按任务与尝试关联成本明细。失败花掉的成本不能删除。')+para('正确拒绝和缺资料的评分回到任务评估章；这里继续用同一批任务解释等待、重试和成本。')+linkTo('agent-evaluation','查看任务与拒绝的独立评分');});
readingEdit('agent-sandbox','在本地验证','保留关键清理条件，完整源码只在后面的下载节展开',(s,a)=>{const complete=s[1].match(/<div class="code-block">[\s\S]*?<\/pre><\/div>/)?.[0];if(!complete)throw Error('Sandbox source missing');const appendix=a.sections.find(x=>x[0]==='配套代码与本次运行结果');appendix[1]='<details class="full-code"><summary>展开完整容量与清理程序</summary>'+complete+'</details>'+appendix[1];s[1]=s[1].replace(/<div class="code-block">[\s\S]*?<\/div><pre[\s\S]*?<\/pre><\/div>/,code('按实例身份清理，槽位名不够','PYTHON','if active.get(slot) != (run_id, epoch):\n    return False\ndel active[slot]\nreturn True'));s[1]+=para('slot-3可以重复利用；run_id和代际号才能区分旧实例与新实例。完整容量和清理程序在本章后面的配套源码中，观察结果应为20、28和空字典。');});

if(new Set(chapterReadingEdits.map(x=>x.id)).size!==35)throw Error('Expected a reading revision for all 35 AI/Agent chapters.');


;
// editorial-lab-files.js
const editorialLabFiles={"incident_model.py": "\"\"\"Deterministic teaching queue; no HTTP server or real database benchmark.\n\n1000 requests, arrival interval 10 ms, four exclusive connections.\nAll times are integer milliseconds; no random input or wall-clock sampling.\n\"\"\"\nimport hashlib\nimport heapq\nimport json\nfrom pathlib import Path\n\n\ndef simulate(sql_ms, inside_wait_ms, outside_wait_ms):\n    available = [(0, i) for i in range(4)]\n    heapq.heapify(available)\n    requests = []\n    for i in range(1000):\n        arrival = i * 10\n        free_at, connection = heapq.heappop(available)\n        acquired = max(arrival, free_at)\n        released = acquired + inside_wait_ms + sql_ms\n        done = released + outside_wait_ms + 10  # Same post-release application work.\n        heapq.heappush(available, (released, connection))\n        requests.append(dict(id=i + 1, arrival_ms=arrival, acquired_ms=acquired,\n                             released_ms=released, done_ms=done,\n                             pool_wait_ms=acquired - arrival, sql_ms=sql_ms,\n                             inside_wait_ms=inside_wait_ms,\n                             outside_wait_ms=outside_wait_ms, latency_ms=done - arrival))\n    ordered = sorted(r['latency_ms'] for r in requests)\n    at = 10000\n    # At t, completions/releases at exactly t have already happened.\n    snapshot = dict(completed=sum(r['done_ms'] <= at for r in requests),\n                    queued=sum(r['arrival_ms'] <= at < r['acquired_ms'] for r in requests),\n                    holding=sum(r['acquired_ms'] <= at < r['released_ms'] for r in requests),\n                    after_release=sum(r['released_ms'] <= at < r['done_ms'] for r in requests))\n    assert sum(snapshot.values()) == 1000\n    return dict(summary=dict(mean_ms=sum(ordered) / len(ordered),\n                             p95_ms=ordered[949], max_ms=ordered[-1],\n                             last_completion_ms=max(r['done_ms'] for r in requests)),\n                at_10000_ms=snapshot, request_201=requests[200], requests=requests)\n\n\ndef experiment():\n    runs = dict(baseline=simulate(20, 0, 0),\n                holding_external_wait=simulate(20, 30, 0),\n                competing_slow_sql=simulate(50, 0, 0),\n                fixed=simulate(20, 0, 30))\n    bad, other, fixed = (runs[k] for k in\n                          ('holding_external_wait', 'competing_slow_sql', 'fixed'))\n    assert bad['summary'] == other['summary']\n    assert [r['latency_ms'] for r in bad['requests']] == [r['latency_ms'] for r in other['requests']]\n    assert bad['summary']['p95_ms'] == 2430 and bad['request_201']['latency_ms'] == 560\n    assert bad['at_10000_ms'] == dict(completed=796, queued=199, holding=4, after_release=1)\n    assert fixed['summary']['p95_ms'] == 60 and fixed['at_10000_ms']['queued'] == 0\n    assert runs['baseline']['summary']['p95_ms'] == 30\n    return dict(scope='Deterministic queue teaching model; not production telemetry or a performance benchmark.',\n                input=dict(requests=1000, arrival_interval_ms=10, connections=4,\n                           fixed_post_release_work_ms=10, percentile='nearest-rank: ceil(0.95 * 1000)'),\n                source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),\n                assertions='PASS', runs=runs)\n\n\nif __name__ == '__main__':\n    # Full per-request rows let readers recompute every statistic and boundary.\n    Path('report.json').write_text(json.dumps(experiment(), ensure_ascii=False, indent=2) + '\\n')\n    print(json.dumps({k: {'summary': v['summary'], 'at_10000_ms': v['at_10000_ms']}\n                      for k, v in experiment()['runs'].items()}, ensure_ascii=False, indent=2))\n", "README.md": "# 连接池等待：两个原因，同一条延迟曲线\n\nPython 3.9+，标准库。运行 `python3 incident_model.py`，生成 report.json。\n1000个请求，每10ms到达1个，共用4个独占连接。整数事件时间，没有实际等待。\n\n四组均使用相同到达序列、连接数与释放后的10ms处理：\n\n| 组 | SQL | 持连接时外部等待 | 释放后外部等待 |\n| --- | ---: | ---: | ---: |\n| 基线 | 20ms | 0 | 0 |\n| 故障 | 20ms | 30ms | 0 |\n| 竞争解释：SQL变慢 | 50ms | 0 | 0 |\n| 修复：等待移出占用区间 | 20ms | 0 | 30ms |\n\nSQL变慢与持连接等待拥有完全相同的逐请求延迟，不能靠前端p95区分。\n第201个请求在2000ms到达，故障组到2500ms才获连接，再等30ms、执行20ms SQL、释放后处理10ms，合计560ms。\n修复仍保留30ms外部等待，延迟60ms；它不会回到删除该功能的30ms基线。\n\n统计口径：p95采用完整1000请求排空后的最近秩第950项。\n10秒快照另列已完成/排队/持连接/释放后处理，等于边界的释放与完成已经发生。\n不要只拿10秒前已完成的快请求算全批p95，故障组最后一个请求到12540ms才完成。\n\n这是FIFO固定耗时的教学模型，不包含真实SQL、网络、超时、重试或线程竞争。\n实际事故还要固定版本与租户切片，校验测量开销，并在同样输入下验证干预。\n"};


;
// chapter-depth-review.js
/* Findings from the 63-chapter editorial audit. Keep unrelated lessons intact. */
const depthReviewEdits=[];
function reviewedChapter(id,scope,change,apply){
 const a=articles.find(x=>x.id===id);if(!a)throw Error('Unknown reviewed chapter '+id);
 apply(a);a.updated='2026.11.04';depthReviewEdits.push({id,scope,change});
}
function reviewedSection(a,title){const s=a.sections.find(s=>s[0].includes(title));if(!s)throw Error(a.id+': missing '+title);return s;}
function replaceReviewed(s,from,to){if(!s[1].includes(from))throw Error('Review text missing: '+from);s[1]=s[1].replace(from,to);}

reviewedChapter('cloud-overview','local','补服务模型职责判断',a=>{
 reviewedSection(a,'把产品放回')[1]+=para('换一个模型再检查职责：普通公有云IaaS中，租户维护虚拟机里的客户机操作系统（guest OS），云厂商维护物理宿主机与虚拟化层；托管平台进一步接管底层运行平台，但应用选择的运行时版本及升级窗口仍要按产品契约核对。订单访问策略需要应用团队定义并正确配置，SaaS也不会替客户决定哪些员工有权看哪份订单。')+'<p><a href="/module/compute/#knowledge-service-model">对照服务模型责任矩阵 →</a></p>';
});
reviewedChapter('network-diagnosis','local','分清区间总长与增长量',a=>replaceReviewed(reviewedSection(a,'课堂练习'),'解释额外的 22 ms 属于哪段。','再算 TLS 完成至准备完成的区间有多长，相较原题增长了多少。'));
reviewedChapter('kubernetes-basics','local','用同一Pod展示经API调谐与可用副本条件',a=>{
 reviewedSection(a,'声明三个副本')[1]+=figure('v17-k8s-reconcile-sequence','三个副本由多个控制循环逐步建立。所有对象变更经过API；只展开Pod A，B、C的后续过程省略。');
 reviewedSection(a,'调度完成')[1]+=para('沿图中同一个Pod UID看：对象创建→绑定节点→拉镜像失败后重试→容器运行→Ready。拉镜像重试可以仍是同一个Pod；删除后由ReplicaSet补建的则是新UID。再设minReadySeconds=10：Pod A刚Ready时，还不能立即计入可用副本；持续Ready至少10秒后才可能计入availableReplicas。若B、C尚未就绪，A也只能贡献1个，不能把“期望3”读成“可用3”。');
});
reviewedChapter('scheduling-resources','local','抢占对象是Pod',a=>{
 const s=reviewedSection(a,'评分练习');replaceReviewed(s,'低优先级容器','低优先级 Pod');
 s[1]+=para('抢占移除的是受害Pod，不是只挪走它的一个容器。应在同一节点扣除这些Pod的资源请求，再验证新Pod的CPU、内存、卷与全部硬约束。受害Pod的终止宽限期还会影响资源真正可用的时刻。');
});
reviewedChapter('k8s-autoscaling','local','把伸缩建议追到实际创建者',a=>{
 const s=reviewedSection(a,'HPA、VPA');
 replaceReviewed(s,'HPA 发现压力创建 Pod，scheduler 发现放不下，节点扩容器才可能增加节点；接着还需系统组件、镜像、卷和应用预热。','本例以Deployment为伸缩目标：HPA写入scale子资源的期望副本数，Deployment控制器调整ReplicaSet，ReplicaSet控制器再创建Pod。scheduler尝试为未绑定的Pod选节点；节点扩容器按自己的规则判断新增节点能否解除不可调度条件。接着还需系统组件、镜像、卷和应用预热。');
 s[1]+=table(['看到的状态','继续检查'],[['HPA建议6，Deployment期望仍4','伸缩写入、限制与控制器事件'],['期望6，却只有4个Pod对象','Deployment/ReplicaSet、配额与准入事件'],['已有6个，2个Pending','节点形状、亲和、卷与扩容器判断'],['已绑定但未Ready','镜像、挂载、探针和预热']])+para('一次调度失败不保证触发节点扩容。若新节点也满足不了硬约束，扩机器同样不能让Pod运行。');
});
reviewedChapter('delivery','local','封住回填后旧写者使新列变旧的竞态',a=>{
 const s=reviewedSection(a,'先扩展数据契约');
 s[1]=para('先增加允许为空的新列summary并保留body。兼容程序继续支持旧读者，新写者按约定维护两列；暂不把“summary非空”当作切换权威读路径的条件。迁移还要观察建索引、回填的锁等待与负载。十二万行按每分钟四千行处理，忽略竞争和重试至少三十分钟，这只是工作量下界。')+
 table(['顺序','body','summary','新读者看见什么'],[['t1：从v1回填','甲','甲的摘要','暂时一致'],['t2：旧客户端只更新body','乙','甲的摘要','summary非空，却已陈旧'],['t3：按非空优先读取','乙','甲的摘要','错把甲的摘要当成乙的摘要']])+
 para('条件回填可以防止旧快照覆盖较新的源版本，却挡不住回填之后又来的旧写入。缺失数为零同样不能证明投影最新。切换前必须回答：最后一个只写body的入口是谁，它在哪个截止点停止？队列、定时任务与长连接写者都在这个集合中。')+
 para('一种清晰的方案是先升级或冻结全部旧写者，确认在途写入排空，再从截止点追平、按源版本和业务语义对账，之后小范围切读。若不能停旧写者，则需可靠的同步桥或变更捕获：新列保存源版本，只有它追上本行最新body版本才使用，否则回退旧路径。源版本必须由覆盖所有写入口的机制在每次修改body的同一事务内推进，包括只改body的旧客户端；例如经验证的数据库触发器。若旧写者能绕过版本推进，事件尚未到达时两个旧版本仍相等，门禁也会误放行。')+
 para('投影计算要基于绑定该源版本的内容，以条件提交防止较旧事件覆盖新结果。变更事件可能重放、乱序或积压，不能把“收到过事件”当成“已追平”。版本为空、投影无效或版本落后时都走旧路径；若无法覆盖旧写入口，先采用停止旧写者后追平的方案。')+
 code('版本门禁示意；需按数据库事务与一致性保证实现','TEXT','读取同一一致性视图中的 body、body_version、summary、summary_source_version\n若 summary 有效且两个版本均非空且相等：使用 summary\n否则：读取 body 或同步重建；记录投影滞后\n前提：所有body修改都在同一事务推进body_version\n不能只判断 summary IS NOT NULL')+
 para('追平和对账通过后再切换读取，保留旧路径以便止损。删除旧列仍是另一次发布：旧写者退场、积压消息耗尽、回滚窗口结束、备份可恢复都要成立。读路径可以回切，不代表已经删除的列或已经发生的外部效果能随镜像一起回来。');
});
reviewedChapter('observability','local','去掉顺读依赖环',a=>{a.prereq='完成C9.1，理解有效事件的分母与基本请求路径。';reviewedSection(a,'还原一次')[1]+='<p><a href="/article/incident/">下一章用这些观测区分两个故障解释 →</a></p>';});
reviewedChapter('resilience','local','按可验证日志前缀求恢复点',a=>{
 const s=reviewedSection(a,'RPO 衡量');replaceReviewed(s,'若日志链缺一段只能用备份，恢复点距故障三十分钟，超过目标。','如果所需的第一段日志就缺失，且没有其他恢复材料，最多只能证明十一点三十分的备份状态，缺口三十分钟。另一种情况是日志连续且可验证地覆盖到十一点四十二分、之后才缺段：可恢复到这个前缀，缺口十八分钟，仍超过十五分钟目标。不能越过缺段宣称已到十一点五十四分，也不能把可用前缀一概丢掉。');
});
reviewedChapter('flash-attention-io','local','明确开头整个tile被屏蔽时的空状态',a=>{
 reviewedSection(a,'稳定Softmax')[1]+=para('再补一个递推的边界：本行最终有合法键，但先扫描到的一块全部被掩码屏蔽。空状态m=−∞、ℓ=0，此时若直接算exp(−∞−(−∞))会产生未定义值。应跳过这个空块，保留空状态；下一块若只有合法分数0、值7，就初始化m=0、ℓ=1、u=7，输出u/ℓ=7。最终整行仍无合法键时，再按接口约定处理。本章44组数值实验只含有限分数，未验证掩码内核。');
});
reviewedChapter('gpu-memory','local','用一个导数解释先缩放为何有用',a=>{
 reviewedSection(a,'FP16 与 BF16')[1]+=para('用一个局部舍入说明损失缩放：假设FP16支持渐进下溢并取最近值，最小正次正规数为2⁻²⁴。导数2⁻²⁷若此时转成FP16，会成为0；先在这次转换之前按2⁸放大，得到可表示的2⁻¹⁹，再在FP32中除以2⁸，才能还原2⁻²⁷。若数值已变成0，事后再乘256仍是0。真实训练有多条算子与存储路径，这个反例只解释一次转换；不能据此说所有中间量都以FP16保存。');
});
reviewedChapter('multinode-lab','local','分清共享会合参数、唯一rank和首次集合通信',a=>{
 const s=reviewedSection(a,'故障定位');replaceReviewed(s,'地址、端口、节点 rank 一致且唯一。','MASTER_ADDR和MASTER_PORT相同，NODE_RANK分别为0、1。每台的LOCAL_RANK仍分别为0、1，全局RANK才是0至3。');
 s[1]+=table(['验证层次','可以核对的证据','仍不能推出'],[['启动与会合','四个全局rank已分配、组成员符合预期','NCCL数据通信已正常'],['首次集合通信','每rank贡献rank+1，同组SUM预期10','数据可读、反向与更新都成功'],['训练更新','首次applied_optimizer_steps及有效样本记录','检查点已可恢复']])+para('SUM=1+2+3+4=10是待在目标环境执行的检查，不是本网站的NCCL实测结果。若一个进程先退出，其他进程的通信超时可能只是后果；先看最早退出者的第一次异常，再决定查数据、设备还是网络。');
});
reviewedChapter('model-serving','local','用缓存时间账和排程预算解释入场限制',a=>{
 const s=reviewedSection(a,'走完三个token');
 s[1]=s[1].replace(/<figure[\s\S]*?<\/figure>/,figure('v17-serving-kv-timeline','同一模型的输入、输出与KV增长：12、13、14个已处理位置分别占1536、1664、1792KiB。生成C后停止，C还没有进入缓存。'));
 reviewedSection(a,'三种优化')[1]+=table(['本轮教学策略','计算','结论'],[['算力预算8个输入位置；先保3条decode','8−3×1=5','长提示本轮最多处理5个位置'],['算力预算仍有5，KV无可分配空块','还需为新处理位置保留KV','有请求槽也未必能接入新提示']])+para('这里的8位置预算与decode优先是自拟排程题，不代表某个推理引擎的默认策略。请求槽、每轮计算预算和可分配KV块是三种约束；前两项有余量，第三项仍可能阻止推进。');
});
reviewedChapter('inference-performance','local','把质量与延迟的交集单独计量',a=>{
 reviewedSection(a,'怎样聚合吞吐')[1]+=para('沿用7.3的两请求固定轨迹，在含右端输出的100ms窗口里共收到5个输出词元，故为5/0.1=50词元/秒。只有A符合题设延迟门槛，延迟达标请求率为1/0.1=10请求/秒。再由独立任务评分给出A质量失败、B质量通过：B却未过时延门槛，两项同时达标的请求数就是0。质量且延迟达标请求率为0/0.1=0请求/秒，不能把50词元/秒当作合格交付速度。质量标签来自指定评价规则，不能从长度或时间猜。');
});
reviewedChapter('ai-lifecycle','local','拆开离线拦截与独立灰度假设',a=>{
 reviewedSection(a,'交一份可核对')[1]=para('甲：候选X总体得分96.2%，关键切片80%，门槛90%。它能进入灰度吗？乙是独立候选Y，已通过自己的离线门禁；它的线上错误率0.8%，门槛0.5%，混合全版本错误率0.23%。Y能扩大吗？分别说明依据，再写回退验收。')+'<details><summary>展开参考判断</summary>'+para('甲不能通过离线门禁，正常流程不应有它的灰度样本。乙的新版本0.8%超过0.5%，应停止扩大；混合0.23%会被旧版本流量稀释。二者是独立候选与独立题设，不能拼成同一次r18发布。回退还要检查旧版本束可加载、有容量、实际请求版本正确且长流排空；已输出内容和外部副作用另行核查。')+'</details>';
});
reviewedChapter('agent-runtime','local','工具调用前持久记录稳定操作身份',a=>{
 const s=reviewedSection(a,'走通一次');replaceReviewed(s,'→ 工具执行，返回带操作标识的回执','→ 提交S1的保存意图、稳定操作标识K1和参数摘要\n→ 工具执行，返回带操作标识的回执');
 s[1]+=para('重启从调用前那条意图记录找回K1，而不是重新询问模型生成新标识。回执到达后保存实际对象版本，再按报告位置、范围与内容判定是否完成。9.2会把外部效果缩成可计数动作，专门观察这段提交间隙。');
});
reviewedChapter('agent-observability','local','分清任务组总成本与重试边际成本',a=>{
 const s=reviewedSection(a,'回到这100个任务');replaceReviewed(s,'仅有这些总数，不能推出“重试成功的10个比最终失败的10个各花了多少”；需要再按任务与尝试关联成本明细。','上一节已给出分组单价：重试成功的10个任务各花5点，整组50点；最终失败的10个各花4点，整组40点。已知的是每个任务含全部尝试的总成本，仍无法拆出这两组仅第二次尝试各花多少。要计算重试本身的边际成本，需要attempt级计量，再汇总到同一任务。');
});

reviewedChapter('gpu-cluster','deep','沿同一训练任务追到首次更新和恢复点',a=>{
 a.title='云上训练全景：从任务提交到首个更新';
 a.desc='从同一任务的提交、准入、放置和数据分片，追到首个实际更新与可恢复检查点。';
 a.baseline='双进程机制与本地CPU/Gloo验证；集群时间线为教学构造';
 a.prereq='先读0.1—0.6，能区分输入、目标、反向与优化器更新；理解进程和持久存储。';
 a.intro='提交成功、分到GPU、进程存活、loss出现、参数更新、检查点可恢复，是六种不同的证据。沿一个双进程任务走一遍，才能知道“还没有开始训练”究竟卡在哪一步。';
 a.objectives=['画出提交、准入、放置、输入、同步、更新与保存的依赖','用一条时间线找出首次更新前未满足的条件','分清运行证据、恢复证据和模型质量证据'];
 a.check=['能沿同一run指出首次更新前的依赖','能解释单个rank输入失败为何引起其他rank同步等待','能区分尝试、实际调用、持久提交与质量证据'];
 a.sections=[
 ['先固定一份任务契约',para('设训练任务为run-017，第一次执行为attempt-1。run表示用户要完成的同一份训练，attempt表示这份训练的第几次执行；机器失败后可以换attempt，但不能偷偷换数据与目标。以下集群时间线是教学构造，配套程序的实测另列，二者不混成同一次运行。')+
 table(['本章固定项','约定'],[['程序与环境','相同源码摘要；PyTorch 2.5.1；本地对照用CPU/Gloo、FP32'],['数据','1024条固定合成分类样本，输入128维、目标10类'],['进程与窗口','2个rank；每rank每小批32条，累积2批'],['产物','每轮末提交检查点，固定world_size与训练配置恢复']])+
 para('合成数据由固定种子生成，目的是验证系统协议，不代表语言模型数据质量。云平台接收任务时还应固定镜像、数据版本或生成方法、超参数、输出位置与身份权限。只记录一个可变标签如latest，会让恢复者拿到另一份程序。平台受理的回执说明意图已记录，不说明这些依赖已可用。')],
 ['三种职责，串成一条依赖链',figure('v17-training-first-update','同一个run的控制、输入、计算与提交依赖。准入回执、首个更新和恢复点分别由不同组件见证。')+
 para('控制平面决定任务能否占资源、放在哪些节点、成员失败后怎么办。数据路径负责从版本化数据得到样本，并把可恢复状态写到持久存储。计算路径是训练进程的前向、反向、梯度汇合与优化器调用。这是职责划分，不要求三套独立集群；同一个服务也可能承担多个职责。')+
 para('观察时要问“谁能证明这一件事”。队列服务能证明准入，调度器能证明绑定，进程能报告读到了哪份分片；检查点清单证明保存了什么，恢复对照证明这些状态确实能接着用。把所有信息压成一个Running，会失去第一个未完成环节的位置。')],
 ['获得额度，还不等于整组能放下',para('租户额度允许2张卡，只回答是否有权申请这份资源；若任务要求同一节点两卡，而两台机器各空一张，总空闲2仍无可行位置。放置还受显存型号、网络、卷与亲和约束影响。成组准入让一组资源在规则内获准，仍需各成员被放置、启动并会合。不能把一个队列状态当成全组已经开始。')+
 para('本章用两rank讲执行，GPU迁移时通常选择每进程绑定一张可见GPU。rank是通信组内编号，local rank是节点内编号，它们不是云实例ID。两台机器各一个进程时本地编号都可以为0，全局编号必须分别是0、1。若两进程误绑同一设备，成员数看似齐全，资源契约仍已破坏。')],
 ['分到资源后，先把输入送到每个成员',para('DDP复制模型并同步梯度，不会自动切分数据。固定1024条样本，采样器先生成相同的全局打乱顺序，再让两个rank各取其中512条；这里可整除，既不需要补齐，也不丢尾项。各rank按32条组批，得到16个小批。每轮调用set_epoch(epoch)，才能按约定改变下一轮顺序。')+
 para('数据版本可访问也不等于当前身份能读：控制器的权限和训练工作负载的权限可能不同。先核对训练身份、对象路径与摘要，再看首批取样、解码和传输。rank0已经拿到批次，不能证明rank1也拿到；在同步训练中，一个成员没有输入，其余成员可能最终都停在等待。')+
 table(['已知证据','只能支持什么'],[['两进程GPU均可见','本机设备暴露正常'],['rank0首批32条','rank0输入路径走通'],['两rank各完成首批前反向','本地计算推进；累积窗口尚未结束'],['窗口末梯度汇合完成','同组成员完成所需通信；尚需优化器执行']])],
 ['两批凑成一次更新，更新后再谈保存',para('本例每rank处理两个32条小批后才尝试更新，因此一个完整窗口覆盖2×32×2=128条样本。首批的前向和反向放在no_sync中，只积累本地梯度；第二批走同步路径，把累计贡献汇合。各小批损失除以2，在本例各rank等样本数的条件下得到这128条的均值目标。有效目标数量不等时，要回到6.2重新推导分母。')+
 para('看到loss说明某次前向和损失计算已完成，不能证明反向、同步或参数更新完成。FP16又多一层：非有限梯度可能使GradScaler跳过优化器调用。因此要同时记录尝试窗口和实际优化器调用，再看有效样本、损失与模型评价。即使实际调用为1，零梯度也可能让部分参数不变，质量更不保证提高。')+
 para('完成更新后，内存状态仍可能随机器丢失。本实验只在整轮边界提交模型、优化器、缩放器、下一轮编号、各rank随机状态和配置签名。先写临时文件再替换适用的POSIX路径，不等于对象存储事务，更不自动保证掉电后一定可用。恢复对照还须真正加载、继续训练并比较结果。')],
 ['读一条时间线，找第一个断点',table(['时刻：教学输入','rank0','rank1','能下的结论'],[['0秒','任务受理','同一run','仅确认任务存在'],['2秒','已获准并绑定','已获准并绑定','资源层前进'],['4秒','进程启动，通信组建立','进程启动，通信组建立','不代表业务数据可读'],['5秒','拿到首批，完成无同步反向','读分片返回权限拒绝','首个未满足条件是rank1输入'],['7秒','第二批进入梯度汇合并等待','尚未进入计算','rank0通信等待可能只是下游现象'],['修正后','两rank各完成两个小批','两rank实际调用数均为1','首次更新成立；还没有轮末恢复点']])+
 para('应先查rank1用什么身份读取哪个数据对象，以及为什么权限与提交时预期不同。此时换NCCL算法、增加卡数都没有补上输入条件。修正权限后仍按相同数据和程序重试，检查双方实际更新记录；若窗口已完成却无法保存，再把故障范围移到输出身份、路径与提交协议。')+
 para('时间线按同一attempt内可关联的事件组织，不用不同机器未经校准的墙钟差直接计算单向网络耗时。真实排查保留run、attempt、rank和首个异常，按依赖关系比对；重启会生成新attempt，不能把上次的成功记录接成本次已经通过的证据。')],
 ['把模型账本接回资源量级',para('模型计算仍决定资源需求。用独立教学配置B=2、T=4、D=8、V=6：输入ID为[2,4]，嵌入输出[2,4,8]，普通两头注意力的Q/K/V为[2,2,4,4]，词表分数[2,4,6]。这不是上面128维分类程序，也不是0.1的词表；这里只复习形状如何决定量级。')+
 para('固定其他维度，把T从4增到8，嵌入元素翻倍，单头逻辑分数矩阵由16变64、增加到4倍。它不能直接推出整轮耗时4倍：前馈、融合执行、数据、通信与重叠都还在关键路径中。先分清哪项状态和工作量变化，再决定检查显存、输入供给还是通信。')+linkTo('transformer-model','复习完整模型路径')+linkTo('gpu-memory','继续做峰值显存账')],
 ['用本地实验走通协议，再迁移到多机',code('6.4的完整包；这里预览同一验证配置','SH','torchrun --standalone --nproc-per-node=2 train_ddp.py \\\n  --device=cpu --epochs=4 --samples=1024 --hidden=32 \\\n  --batch-size=32 --accum=2 --save-dir=runs/cpu-full')+
 para('先在6.4运行这组CPU/Gloo配置：每轮16个小批、8个尝试窗口、8次实际优化器调用；再在6.8比较连续四轮与两轮后恢复到四轮的最终状态。CPU实测证明这一小型程序的执行与恢复协议，不证明跨物理节点网络、NCCL或GPU混合精度。')+
 para('最后回答：若日志只有GPU可见和loss，首次更新是否成立？若已更新一次但轮末保存失败，最多能从哪个点恢复？分别指出还缺优化器调用记录、持久提交与恢复证据。后续按并行策略→显存→DDP程序→通信与输入→两机四卡→恢复→性能的顺序，逐层增加一个变量。')+linkTo('ddp-code','逐行走过第一个累积窗口')]
 ];
 a.exercise=['任务已绑定、两rank会合；rank0在同步反向等待，rank1读分片被拒。先查哪里？8个尝试窗口能否证明8次更新？','先查rank1的数据身份、路径与权限，通信等待可能是后果。尝试窗口不等于实际优化器调用；还应核对各rank计数、有效输入与有限数值。检查点是否可恢复需要另行验证。'];
});

reviewedChapter('ddp-code','deep','沿双进程的两个小批讲完一次更新并修正计数',a=>{
 a.desc='走过两个小批组成的更新窗口，核对分片、no_sync、全局样本、实际调用与恢复边界。';
 a.prereq='完成6.1—6.3；使用Python 3.10—3.12与PyTorch 2.5.1。先运行CPU/Gloo、FP32路径。';
 a.intro='先走完一个由两个小批组成的更新窗口，再运行完整程序。设备身份、采样、累积和计数必须同时成立，才能把“进程在跑”变成可核对的训练进展。';
 a.sections=[
 ['先把两个进程和数据规模固定',para('本机启动两个进程，rank分别为0、1，world_size=2；CPU使用Gloo。GPU迁移时每个进程按LOCAL_RANK绑定一张可见设备，不能让两个进程都默认用cuda:0。torchrun负责启动与传入身份，DDP负责模型副本间的梯度同步，两者不替代输入分片。')+
 code('先解压本章完整实验包，在同一PyTorch环境中运行','SH','torchrun --standalone --nproc-per-node=2 train_ddp.py \\\n  --device=cpu --epochs=4 --samples=1024 --hidden=32 \\\n  --batch-size=32 --accum=2 --save-dir=runs/cpu-full')+
 para('1024条固定合成样本用来做十分类。每个样本128维，模型包含线性层、ReLU、Dropout和输出层；它足够小，能把精力放在协议上。所有rank从同一数据种子生成相同全集，模型初始化一致；各rank另用独立Dropout随机流，恢复时逐rank保存这些状态。')],
 ['采样器决定每个rank拿什么',para('DistributedSampler按rank划分同一全局顺序，每rank取512条；DataLoader再按32条组批，每个rank有16个小批。1024能被这套规模整除，故本例没有补齐或丢弃的尾项。一般数据规模不能整除时，要区分采样器的补齐/截尾与DataLoader的最后一批规则。')+
 code('每轮先改变全局打乱顺序','PYTHON','sampler.set_epoch(epoch)\nfor step, (features, labels) in enumerate(loader):\n    ...')+
 para('如果两个rank都直接遍历全集，即使最终参数一致，也只是在重复数据。若只有一边多出一个需要同步的反向，另一边提前结束，程序可能卡住。完整程序因此拒绝每rank小批数不能被accum整除的配置；这是一种明确的教学约束，不把尾窗口悄悄按完整窗口的分母处理。')],
 ['沿两个小批走完第一个窗口',figure('ddp-step','两rank先各自计算，再在同步反向中汇合累计梯度。图是依赖关系，实际通信按梯度桶推进。')+
 table(['窗口内时刻','rank0','rank1','参数是否更新'],[['小批0','32条；loss/2；前反向均在no_sync中','另32条；同样累积','没有，只留下本地梯度'],['小批1','再32条；同步反向','再32条；同步反向','反向结束后才尝试step'],['窗口末','scaler.step、update、清梯度','执行相同顺序','非融合AdamW实际执行后计数+1']])+
 para('一个窗口覆盖2个rank×每批32条×2批=128条。各小批交叉熵先取本地32条的均值，再除以累积批数2；同步路径跨rank平均。由于四组大小相同，这里对应128条样本的均值梯度。若有效标签数量不等，这种“平均的平均”不再自动正确，回6.2检查全局有效分母。')+
 para('no_sync要包住首批的前向和反向；只包backward不能按DDP接口约定关闭该批同步。第二批前不能清梯度，否则首批贡献被抹掉。第二批反向后再更新、再清零，才完成这个窗口。no_sync不是“暂时不训练”，它改变的是梯度同步时机。')],
 ['日志分别回答看过多少和执行过多少',table(['计数或指标','本例每轮','证据含义'],[['每rank小批数','1024÷2÷32=16','数据迭代次数'],['attempted_update_windows','16÷2=8','到达窗口末并尝试更新'],['applied_optimizer_steps','CPU FP32实测8','本轮实际完成优化器step调用'],['samples','全局1024','两个rank按样本数汇总'],['loss','各rank损失和÷全局样本数','用于日志；不重写反向目标']])+
 para('日志用loss×本批样本数累计，再跨rank求和，最后除以全局样本数。时间则取各rank测得的最大轮耗时，避免把同一段并行时间相加。吞吐是全局样本数除以这段时间；小模型启动和同步开销占比很高，不能把它当GPU或语言模型基准。')+
 para('FP16遇到非有限梯度，GradScaler可能跳过optimizer.step；所以len(loader)//accum只给尝试数。程序固定AdamW的fused=False路径，用post hook计实际调用，并检查所有rank的两项计数一致。optimizer_steps保留为实际调用数的兼容别名。计数一致仍不证明每个参数改变，也不证明模型质量提高。')],
 ['先看核心循环，再展开完整程序',code('与完整程序相同的窗口边界；计数在优化器回调中另行维护','PYTHON','update = (step + 1) % a.accum == 0\nwith nullcontext() if update else model.no_sync():\n    with torch.autocast(device_type=a.device,\n                        dtype=torch.bfloat16 if a.precision == "bf16" else torch.float16,\n                        enabled=a.precision != "fp32"):\n        loss = nn.functional.cross_entropy(model(features), labels)\n    scaler.scale(loss / a.accum).backward()\nif update:\n    attempted_windows += 1\n    scaler.step(optimizer)\n    scaler.update()\n    optimizer.zero_grad(set_to_none=True)')+
 para('在一个完整累积窗口内保持同一缩放因子，到边界才更新它。需要裁剪时，先撤销缩放，再裁剪、尝试step；不能拿被放大的梯度直接套原阈值。本程序的CPU路径只允许FP32；CUDA BF16/FP16是待目标环境验证的运行方式。')+
 '<details class="full-code"><summary>展开完整train_ddp.py：身份、采样、计数、保存与恢复</summary>'+code('train_ddp.py · 与下载及验证摘要一致','PYTHON',labFiles['train_ddp.py'])+'</details>'+
 '<p class="practice-links"><a href="labs/cloud-training-ddp.zip" download>下载完整实验包 ↓</a><a href="labs/ddp/train_ddp.py" download>下载训练源码 ↓</a><a href="labs/ddp/validation.json">查看CPU/DDP与恢复记录 ↗</a></p>'],
 ['两个尝试窗口，为什么只执行一次',para('独立探针在单进程CPU上直接构造有限梯度和inf梯度，使用PyTorch 2.5.1、FP32参数、GradScaler("cpu")与非融合AdamW。第一窗口参数从1变为0.875，Adam步数和回调均变为1，缩放因子保持8；第二窗口不改变参数、步数或回调，缩放因子从8降为4。因此尝试2次、实际调用1次。')+
 para('两次scaler.step的返回值都是None，不能用它判断跳步。这次探针没有autocast、CUDA、NCCL或DDP，验证的是该优化器路径的跳步与计数关系。融合优化器可能有不同AMP集成方式，不能把这个回调结论推广给任意优化器。')+
 code('在相同PyTorch 2.5.1环境中复现','SH','python optimizer_step_probe.py')+'<p><a href="labs/ddp/optimizer_step_probe.py" download>下载完整探针 ↓</a><a href="labs/ddp/optimizer-step-validation.json">查看两个窗口的逐项结果 ↗</a></p>'],
 ['保存边界决定恢复后重做什么',para('本程序只做固定world_size、固定batch配置的整轮边界恢复。每轮完成后，各rank提交随机状态，由rank0保存模型、优化器、缩放器、下一轮编号和配置签名；所有rank等待保存结束。中途故障会重做最后一个未提交的整轮，而不是精确接续某个小批。')+
 para('两项更新日志均按轮计数，恢复后重新记录该轮增量，不以next_epoch乘8倒推历史实际调用。若业务需要跨恢复累计值，应把计数作为有版本的持久状态保存；旧FP16检查点没有这项记录时，历史实际值应标未知。随机数状态与数据顺序同样属于恢复条件，只有权重并不够。')+
 para('检查点是受信任的实验文件。不要加载来源不明的序列化对象；各rank读取同一份已提交状态。临时文件与同目录替换适用于本实验的POSIX路径，不能直接把对象存储URL传给Path就获得同样协议。完整的连续与恢复对照见6.8。')+linkTo('checkpoint-recovery','比较连续四轮与恢复到四轮')],
 ['先验收本机，再增加物理节点',para('本次重新执行了两进程四轮、两轮后恢复、最终模型/优化器/随机状态完全一致比较；也用本机两个启动器组成四个CPU rank检查了节点编号脚本。后者走回环网络，不能代替两台物理机器的网络与NCCL验证。验证记录保留实际环境、命令、退出码和源码摘要。')+
 para('验收先看每轮全局1024条、8个尝试窗口和8次实际调用，再看所有进程退出、检查点存在并可恢复。把accum改为3，应因16不能被3整除而明确拒绝；修改batch配置加载旧检查点，也应报签名不匹配。成功路径和这两条失败路径都通过，才继续6.7多机手册。')+
 para('复习时遮住代码：为什么首批不能清梯度？为什么样本数1024、微批数16、更新数8都正确？若日志有8次尝试却只有7次实际调用，还缺什么证据？先写出窗口与计数关系，再回读对应一节。')+linkTo('multinode-lab','继续两机四卡的分阶段验收')]
 ];
 a.exercise=['每个rank有16个小批，每批32条，累积2批，world_size=2：全局每窗口多少样本？若GradScaler跳过一个窗口，两项计数各是多少？','全局每窗口128条；尝试窗口8，实际优化器调用7。不能据此推出质量下降多少；还需核对数值、有效输入与评价。no_sync须覆盖非更新小批的前向和反向。'];
});

reviewedChapter('incident','deep','用同一到达序列区分故障解释并验证干预',a=>{
 a.desc='用同一组1000请求区分SQL变慢与持连接等待，逐段算延迟，再按相同负载验证修复。';
 a.prereq='完成C9.1与C9.2，理解请求分母、时间区间与连接池。';
 a.intro='前端延迟升高，只说明用户在等。两个完全不同的原因可以画出同一条延迟曲线。本章先学怎样提出可推翻的解释，再用一份可复算材料完成取证、干预和复测。';
 a.sections=[
 ['先规定分母、窗口和可接受结果',para('设同一版本、同一租户的查询流量：1000个请求，每10毫秒到达一个，共用4个独占连接，按到达顺序等待。每次查询的SQL耗时固定20毫秒，释放连接后还有10毫秒应用处理。这里所有时间都是教学程序的输入，不是线上测量；不含超时与重试。')+
 para('基线单请求30毫秒：SQL 20加释放后处理10。现在加入一项30毫秒的外部等待，功能本身仍需保留。问题是它发生在占用连接期间，还是释放连接之后。到达间隔10毫秒与释放后处理10毫秒恰好数值相同，却是两个独立条件。')+
 para('保留两个统计口径：一是从0到10000毫秒的状态快照，二是1000个请求全部完成后的整批延迟。最近秩p95取排序后的第ceil(0.95×1000)=950项。若只统计10秒前已经完成的请求，就会漏掉还在排队的慢请求，不能代表整批体验。')],
 ['先看结果，保留两个竞争解释',table(['同一输入下的组','连接持有时间','整批p95','10秒已完成/仍未完成'],[['基线','20ms','30ms','998 / 2'],['故障材料','50ms','2430ms','796 / 204'],['假设H1：SQL变为50ms','50ms','2430ms','796 / 204'],['假设H2：SQL仍20ms，持连接时外等30ms','50ms','2430ms','796 / 204']])+
 figure('v17-incident-latency','1000个请求的完整延迟。SQL变慢与持连接等待两条故障曲线完全重合，前端p95无法区分原因。')+
 para('H1和H2都是能解释现象的候选，不因某个名字更像故障就优先成立。它们占用连接的总时长都是50毫秒，所以本模型逐请求等待、完成时刻和延迟完全相同。再加一张同口径p99图不会打破这个等价。需要一个在两种解释下预期不同的观察。')+
 para('先写预测：如果H1成立，SQL执行区间应从20变为50毫秒；如果H2成立，SQL仍20毫秒，而连接获取到释放之间多出30毫秒非SQL区间。此时的下一步应是关联连接租借、SQL开始/结束和归还，而不是先扩大连接池。')],
 ['选一项能改变判断的探测',para('故障材料补充同类请求的关联时刻：获得连接后先进入外部调用区间，30毫秒后才开始SQL；SQL本身20毫秒，随后归还连接。本题区间来自同一条模拟时间轴；真实系统可在同一进程用单调时钟记录边界，并关联同一请求与连接租借。它支持H2，推翻“这份材料里SQL执行需要50毫秒”的H1。')+
 table(['探测','H1预期','H2预期','本题揭示结果'],[['同一请求SQL执行区间','50ms','20ms','20ms'],['连接持有总区间','50ms','50ms','50ms'],['持有期间非SQL区间','0ms','30ms','外部等待30ms']])+
 para('在真实系统里还要核对探测边界：客户端span是否把驱动队列也算进SQL？是否只采到了快请求？外部等待究竟是远端服务慢、连接建立，还是本地锁等待？这份观察只定位到连接持有期间的非SQL区间，不能凭一个标签宣布所有底层原因都已排除。保留能够继续区分它们的子区间与错误记录。')],
 ['沿第201个请求，把560毫秒逐段算清',figure('v17-incident-request','同一个第201号请求：500ms等连接、30ms持连接外等、20ms SQL、10ms释放后处理。缩短SQL不是本题的首个干预点。')+
 table(['事件','绝对时刻','相邻区间'],[['第201个请求到达','2000ms','起点'],['获得连接','2500ms','池等待500ms'],['SQL开始','2530ms','外部等待30ms，仍持连接'],['SQL结束并归还连接','2550ms','SQL 20ms'],['响应完成','2560ms','释放后处理10ms']])+
 para('端到端2560−2000=560毫秒；四段500+30+20+10也等于560。500毫秒是本请求等待空连接的时间，不能再与已包含它的端到端时间相加。另一个请求的span不能直接填入这张表，必须先确认身份和采样边界。')+
 para('这张图解释了用户慢在哪里，也解释了为什么只查SQL慢日志可能无结果：本题SQL仍是20毫秒，大头在执行之前的池等待。应用CPU也可能不高，因为许多请求在等资源；但本模型没有CPU测量，不能把“可能”写成线上CPU已被排除。')],
 ['把排队增长还原成容量算术',para('每个连接一次被占50毫秒，固定条件下最多每秒20次；4个连接的服务能力是4÷0.05=80次/秒。输入却每秒100次，超过能力20次/秒。等待会随输入持续积累，增加线程只会让更多请求一起等。这个上界用的是占用时间，不是单独SQL的20毫秒。')+
 para('在10000毫秒快照，故障组共有796个完成、199个尚未获连接、4个正持连接、1个已释放但仍处理，合计1000。未完成204是后三项之和，不是全部都在池队列。最后一个请求到12540毫秒才完成；整批p95=2430毫秒是在排空后计算。')+
 para('排队是有限连接与占用时长共同产生的结果。扩池也许暂时消化这里的队列，但真实数据库可能已接近CPU、锁或IO边界；扩大并发会把压力转移到下游。因此干预先对准被证据定位的占用区间，并为候选措施分别写出预期变化。')],
 ['保留功能，只改变占用区间',para('本题修复把30毫秒外部等待移到归还连接之后，SQL仍20毫秒、释放后应用处理仍10毫秒。连接持有回到20毫秒，4个连接的理想能力变为200次/秒，高于原100次/秒输入；全部请求端到端变为20+30+10=60毫秒。它不会回到30毫秒基线，因为功能等待仍然存在。')+
 code('概念顺序；真实代码还需错误处理与资源释放保证','TEXT','故障：获取连接 → 外部等待30ms → SQL20ms → 归还 → 处理10ms\n修复：获取连接 → SQL20ms → 归还 → 外部等待30ms → 处理10ms')+
 para('这个移动有业务前提：外部动作不能依赖仍打开的事务，也不能破坏读写一致性。若动作必须与数据库提交绑定，应设计事务外盒或其他明确协议，不能为了缩短持有期随意挪动。线上先选可恢复的小流量切片，保留版本与输入，给出观察窗口和回切条件。')+
 para('如果现场来不及完成代码修复，可以按已确认的兼容路径回切或限流止损，同时保留最早异常与关键区间。止损后变快说明措施改变了症状，不自动证明唯一根因；后续仍需要同条件复测，避免把流量下降误写成修复有效。')],
 ['用相同触发条件复测，并解释剩余差值',table(['条件完全相同','基线','故障','修复'],[['到达/连接','100次/s、4连接','相同','相同'],['整批p95','30ms','2430ms','60ms'],['10秒池中等待','0','199','0'],['10秒已完成','998','796','995'],['最后完成','10020ms','12540ms','10050ms']])+
 para('修复组10秒完成995个，比基线少3个，并不表示队列仍在增长：固定功能多了30毫秒，最后几个请求仍在释放后的处理阶段。快照还有1个持连接、4个释放后处理，总计5个未完成；池等待为0。应同时解释用户延迟、队列状态和功能是否保留，不能只盯一个计数。')+
 para('本模型对干预有确定性结果。真实上线还应在同一版本、租户与请求类型下复测，观察足够长时间，确认错误率、下游负载和已有积压一起恢复。若只是把入口流量降到80次/秒以下，等待同样可能消失；这是另一个需要保留的解释，必须用到达记录核对。')],
 ['运行程序，交一页能追问的结论',code('Python 3.9+标准库；没有真实数据库或HTTP压测','SH','python3 incident_model.py')+
 para('程序保留1000个请求的全部事件时刻，使用整数毫秒和4项可复算输入。独立断言SQL变慢与持连接外等的逐请求延迟完全相等、第201个请求560毫秒、故障p95为2430毫秒、修复p95为60毫秒。先手算一个请求，再运行检查完整曲线。')+
 '<details class="full-code"><summary>展开完整事件队列程序</summary>'+code('incident_model.py','PYTHON',editorialLabFiles['incident_model.py'])+'</details><p class="practice-links"><a href="labs/incident-model.zip" download>下载程序、说明与逐请求结果 ↓</a><a href="labs/incident-model/report.json">查看完整结果与源码摘要 ↗</a></p>'+
 para('提交的报告要写清：1000请求的分母和两种窗口；H1/H2及各自预测；SQL区间20毫秒如何改变判断；移动外部等待的业务前提；相同输入下p95、排队与完成数怎样变化；哪些线上底层解释仍待核对。这样每个结论都有对应材料，读者可以改一项条件重做。')+linkTo('observability','复习区间、关键路径与采样')+linkTo('resilience','继续故障域与恢复边界')]
 ];
 a.exercise=['SQL变50ms与持连接外等30ms的p95都为2430ms。该补哪项证据？修复后p95为60ms而基线30ms，是否失败？','关联同请求的连接租借和SQL执行边界；SQL20ms且非SQL持有30ms支持后者。修复保留30ms功能等待，60ms符合题设；还应确认相同到达、池等待为0及业务结果。教学模型不证明线上唯一根因。'];
});

reviewedChapter('durable-workflows','deep','统一重放、接收方安装代际与提交后恢复的叙述',a=>{
 const old=a.sections;
 a.intro='持久工作流解决重启后从哪里继续；稳定操作键解决同一动作重试；接收方代际检查解决旧进程仍在写。沿一份审批任务和已有实验，把这三种保证按发生顺序分开。';
 a.sections=[old[0],old[1],old[2],
 ['单执行者的提交间隙，先读两本账',figure('v17-agent-commit-ledger','9.2的真实本地实验：工具已提交效果，运行器尚未确认。恢复沿用op-001，尝试从1变2，效果仍为1。')+
 para('R27的发布意图需要稳定键pub-27，绑定租户、目标和草稿摘要。任务库先登记意图，接收方在自己的原子提交中写入效果与回执，运行器随后确认完成。若中间退出，任务库和接收方会暂时呈现不同状态：前者仍在运行，后者已经有产物。恢复者必须先找回原操作身份。')+
 para('图中沿用9.2的agent_lab.py实测：固定动作键op-001，只在独立SQLite工具库里把计数加一；它没有真的发布日报。工具提交后子进程以23退出，runner是RUNNING、尝试1、工具效果1；恢复沿用原键，得到原回执，runner成为SUCCEEDED、尝试2、效果仍1。')+
 para('若改用新键，接收方有理由把它当作新动作。若远端没有稳定键、可查询回执或明确补偿协议，任务历史只能记录结果待核对，不能替任意外部接口实现恰好一次。这里先解决单执行者；接下来增加一个仍活着的旧进程，故障条件发生了变化。')+linkTo('agent-recovery','运行两本账的提交后退出实验')],
 ['接管先经过控制库，再经过效果接收方',para('设旧工作者A持有代际1。代际是同一受保护资源上只增不减的所有权编号。A暂停后，租约到期允许B向控制库申请代际2；但A没有因此被杀死，它可能带着旧请求继续运行。控制库推进与接收方看到新代际是两次提交，不能用一句“已接管”盖住中间区间。')+
 table(['阶段','控制库','效果接收方','旧A的全新操作键'],[['A运行','当前1','已安装1','仍按代际1判断'],['B获保留但未安装','当前2','仍安装1','可能通过：安装空窗'],['B完成安装','当前2','已安装2','代际1被拒'],['后来C取得并安装3','当前3','已安装3','A和B均不能新写']])+
 para('本实验要求接收方先安装与权威保留一致的代际，再把这份保留标记为armed，表示它已完成接收方的生效步骤。较新的3已取代2时，迟到的B不能把自己误报为armed。安装与确认若无法达成协议，应保持未生效并核对，而不是只因租约记录更新就放行写入。')+
 para('也有系统只记录见过的最大令牌、拒绝更小值。它同样要说明保证从何时开始：接收方还没见过2时，并不能仅凭协调端过期就识别1已失效。实际跨服务设计还需可信身份、令牌来源和权限控制；一个客户端自行填大的整数不是所有权。')],
 ['把旧写隔离和业务去重放在同一事务里',para('接收方收到动作，先在受保护边界内核对可信主体、目标权限和当前代际，再检查操作键及参数摘要。新动作才提交效果与回执；同键同参数返回已有回执，同键换参数必须冲突。检查完成到写入之间不能再敞开一段未保护窗口，否则旧写者可能在检查之后、接管之后才真正落盘。')+
 para('代际回答“这份所有权现在还能写吗”，操作键回答“这次逻辑动作发生过吗”。只做去重，A可以换一个全新键制造旧写；只做代际，当前B的超时重试仍可能产生两份效果。因此验收要专门让旧A使用从未出现过的键，排除只是碰巧命中旧回执。')+
 para('本地程序把当前代际检查、效果与回执提交放进SQLite事务；控制库与接收方库分开。它把A暂停而不退出，等B完成接棒再恢复A，观察旧键之外的全新动作仍被拒。这个观察证明本地受保护边界生效，不证明某个真实邮件、支付或Kairo接口也会检查代际。')],
 ['三次观察，分别证明哪一个边界',table(['独立观察','实际结果','回答的问题'],[['空窗负例：控制2，接收方仍1','旧A新动作committed；安装2后stale_epoch','控制库更新不会自动改变接收方'],['正式接棒：A仍活着，接收方已安装2','A新键stale_epoch；B新动作提交值7','旧写拒绝且新持有者能推进'],['另一进程提交值11后退出23；C安装3后用原键查询','duplicate，取回值11；没有再加效果','提交后退出的恢复去重'],['测试主进程使用C的代际3提交新动作值13','第三个效果，合计11+7+13=31','新代际仍可执行获准的新工作']])+
 para('第一行使用独立的负例数据库，不把它的效果计入正式实验的3个效果。正式实验的暂停A与提交后退出的进程也不是同一个故障时刻：暂停者仍可能继续发请求，退出者已经不再运行。C对已存在回执的查询，不是让旧代际继续创建新效果。')+
 para('程序还断言同键换参数被拒、未授权调用没有效果、较旧保留不能在更新代际后误报armed。验收同时读函数结果、回执与效果账，不因返回一句“拒绝”就推断外部状态没变。代际拒绝若发生在效果之后，错误已经存在。')],
 old[5],
 ['先预测，再执行已有的多进程程序',code('Python 3.9+标准库；固定逻辑时钟与本地SQLite','SH','python3 worker_fencing.py')+
 para('先预测三个结果：B只改控制库时A的新键能否通过？B安装后A仍活着能否通过？另一个进程提交后退出，C沿原键重试会增加几个效果？运行后分别核对空窗负例、A/B进程结果与C的duplicate回执，不把它们压成一个“恢复成功”。')+
 aiAgentCode('worker_fencing.py','展开完整程序：两个持久化域、真实进程暂停、代际安装与回执恢复')+aiAgentLinks('worker_fencing.py')+
 para('这是本地SQLite、固定可信身份夹具和注入逻辑时钟的机制实验，没有远端共识、真实授权服务或Kairo运行时。逻辑时钟让租约到期条件可重复，真实系统仍需处理时钟、网络与协调器失败。若外部接口不校验代际，运行时不能凭本地记录承诺旧写一定被挡住。')],
 ['旧任务、升级和保留期一起验收',old[7][1]+
 para('把一次验收分成可重做的三层：先用旧历史恢复同一决定，再用单执行者提交间隙核对同一操作键，最后用活着的旧worker验证代际隔离。每层保留初始状态、故障动作和独立结果。这样修复某一层后可以重测对应边界，不会把一个成功截图当成所有保证。')+
 '<details class="full-code"><summary>选读：独立的旧版字典练习（41/42不是上面的进程实验）</summary>'+para('这份短练习只演示判断顺序，保留原源码与旧验证记录便于复核；没有持久化或并发。主线的1→2→3与真实进程结果以上节worker_fencing.py为准。')+old[6][1]+old[8][1]+'</details>'+
 para('闭卷回答：控制库当前2、接收方仍1，为什么不能宣布A已被隔离？接收方已安装2后，A换新键为什么仍应拒绝？C沿原键取到值11又证明了什么？三问分别对应安装空窗、旧写隔离、提交后去重。')]
 ];
 a.exercise=['B已获代际2但未安装，旧A的新键一定被拒吗？安装后B提交值7；另一个进程提交值11后退出，C安装3并按原键核对，主进程再用代际3新写13，正式效果数与和是多少？','安装前不保证拒绝；本地空窗负例允许旧A写，安装后才拒绝。正式实验三次效果为7、11、13，共3个、和31；C查询值11不增加效果。独立空窗负例不计入该合计。'];
});

for(const edit of depthReviewEdits){const a=articles.find(x=>x.id===edit.id);a.sections=a.sections.map(([title,body])=>[title,infraReadableHTML(body)]);}
if(depthReviewEdits.length!==20||new Set(depthReviewEdits.map(x=>x.id)).size!==20)throw Error('Expected 20 distinct editorial repairs.');


;
// research-driven-lessons.js
/* Original exercises derived from a review of teaching methods, not employer question claims. */
const researchLessonIds=['gpu-memory','model-serving','inference-performance','agent-runtime','agent-evaluation'];
function researchLessonSection(id,title,html){const a=articles.find(x=>x.id===id),s=a.sections.find(x=>x[0].includes(title));if(!s)throw Error('Missing research revision '+id+'/'+title);s[1]+=infraReadableHTML(html);a.updated='2026.11.04';}
Object.assign(sources,{
 v18Prefix:['vLLM · 自动前缀缓存与块引用','https://docs.vllm.ai/en/latest/design/prefix_caching/'],
 v18DistServe:['DistServe · 预填充与解码拆分（OSDI 2024）','https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin'],
 v18Deadlocks:['MySQL 8.4 · InnoDB死锁处理','https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks-handling.html']
});
const prefetchLifetimeLesson=knowledgeSubhead('把预取放进同一张显存时间线')+
 para('另设一组只计算缓冲寿命的题：单rank常驻4GiB，已经包含本地分片；A组计算另需1GiB完整缓冲，B组另需0.5GiB。两个缓冲与常驻区不共用存储，暂不计激活和其他开销。它与前面的16GB持久状态示例是两套题设，也不表示某个FSDP版本必然这样分配。')+
 figure('v18-fsdp-buffer-lifetime','常驻状态相同，缓冲重叠改变峰值。题设容量5.25GiB：顺序执行最高5GiB，提前预取最高5.5GiB。')+
 table(['动作','先释放再申请','A未释放便预取B'],[['初始','4GiB','4GiB'],['收齐A','4+1=5GiB','4+1=5GiB'],['准备B','先释放A，再申请B：4.5GiB','A与B同时存活：4+1+0.5=5.5GiB'],['完成','释放B回到4GiB','依次释放A、B，回到4GiB']])+
 para('5.25GiB预算下，第一种安排通过，第二种超出0.25GiB。增加预取可能遮住通信，也可能先造成OOM；要同时看按rank的分配时间线与步耗时。FSDP的收齐粒度、释放、重分片和预取策略共同决定真实峰值，静态分片表只解释常驻项。')+
 '<details class="knowledge-check"><summary>追问：把B缓冲改成0.2GiB，会怎样？</summary>'+para('顺序最高仍为5GiB；重叠最高5.2GiB，按本题简化账可放入5.25GiB。但这不证明真实GPU能运行，也不证明预取更快；还需把省略项和实际重叠收益测出来。')+'</details>';
infraDomain('training').points.find(p=>p.id==='tr-sharding').body+=prefetchLifetimeLesson;
researchLessonSection('gpu-memory','根据失败阶段',prefetchLifetimeLesson);

const sharedPrefixLesson=knowledgeSubhead('两条请求怎样共享同一块KV')+
 para('本题把块长改成4个位置，每位置仍按128KiB计算，所以每块512KiB。A=[1,2,3,4,5,6]，B=[1,2,3,4,7,8]，两条都已完整前向处理；权重、位置规则、适配器与允许复用域相同，首块已登记。只共享完整的前四个位置，两个未满尾块各自持有。')+
 figure('v18-kv-shared-blocks','两条逻辑序列共12个位置；相同完整前缀只存一份，物理占用由4块降到3块。A结束后，共享块仍有B持有。')+
 table(['账本','独立分配','共享首块'],[['每条逻辑位置','A6、B6，共12','仍为12'],['物理块','2+2=4块','1共享+2私有=3块'],['已分配字节','4×512=2048KiB','3×512=1536KiB'],['实际保存的唯一KV位置','12个','4+2+2=8个'],['未使用槽位','两尾块各2，共4','仍为4']])+
 para('A结束时，共享块活动引用数从2减到1，仍不能覆盖B的数据。引用归零表示没有活动持有者，不代表缓存索引已经删除；是否继续保留以便后续命中、何时驱逐，由具体缓存策略决定。空闲可回收、哈希仍可查和请求正在引用，是不同状态。')+
 para('B若换了适配器、位置语义或隔离域，不能只因文本前四项相同就复用。对后续块还要考虑前缀上下文；相同的块内token接在不同前缀后，KV也可能不同。跨租户允许共享与否由可信隔离策略决定，不能让模型正文自行声明。')+
 '<details class="knowledge-check"><summary>追问：共享能让Decode跳过全部历史读取吗？</summary>'+para('不能。它节省重复前缀计算与物理存储；各自的新查询仍要读取所需历史KV。共享物理块与减少每步计算不是同一项收益。')+'</details>';
infraDomain('platform').points.find(p=>p.id==='sv-kv').body+=sharedPrefixLesson;
researchLessonSection('model-serving','三种优化',sharedPrefixLesson);
articles.find(a=>a.id==='model-serving').refs.push('v18Prefix');
infraDomain('platform').refs.push('v18Prefix','v18DistServe');

const pdTransferLesson=knowledgeSubhead('拆开预填充与解码，先给交接算下界')+
 para('沿用每位置128KiB，4096个已处理位置要搬128KiB×4096=512MiB=536870912字节。固定题设：跨机链路按有效载荷25GB/s，GB为十进制；交接完全串行、不压缩、不复用，不能与计算重叠，暂忽略启动和协议开销。')+
 table(['同一观测点到第二个输出','25GB/s','12.5GB/s'],[['理想交接时间','536870912/(25×10⁹)≈21.47ms','约42.95ms'],['共置基线100ms；拆池去掉30ms排队','100−30+21.47≈91.47ms','100−30+42.95≈112.95ms'],['判断','下界更低，有改善机会','即使理想下界也超过原100ms']])+
 para('第一列不证明真机快8.53ms：新队列、同步、复制和完成确认都可能继续加时。第二列则在这些固定条件下已足以否定“只要拆池就更快”。若支持分块传输或计算重叠，需重画关键路径，不能继续把全部交接时长都作为串行增量。')+
 para('还要说明输出来自哪里。若首词元先由预填充侧返回，交接可能主要拉长首个与第二个输出之间的间隔，不能把21.47ms机械加到TTFT上。比较时固定硬件总预算、请求长度分布、质量和负载，同时看两池队列、TTFT、输出间隔与达标交付率。')+
 '<p><a href="https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin" target="_blank" rel="noopener">继续读DistServe的工作负载、放置与测量条件 ↗</a></p>';
infraDomain('platform').points.find(p=>p.id==='sv-batching').body+=pdTransferLesson;
researchLessonSection('inference-performance','Prefill与Decode',pdTransferLesson);
articles.find(a=>a.id==='inference-performance').refs.push('v18DistServe');

const agentFailureLayers=knowledgeSubhead('凭据失败、业务拒绝与结果未知，恢复动作不同')+
 table(['教学观测：已确认的边界','工具是否进入','效果能否判定','下一步'],[['令牌不属于此资源服务，入口在调用前拒绝','未进入','本次调用没有业务效果','修正凭据与受众；不把它记为工具执行失败'],['凭据通过，但A主体请求修改B资源；对象授权拒绝','未进入写动作','本次写次数0','保持拒绝，核查目标和真实委托'],['合法查询进入工具，按契约确认资料不存在','进入','已知业务失败；本题无写入','修正资料范围或返回证据不足'],['工具已提交，回执到达前连接断开','进入','运行时尚不能确认最终结果','从原意图找K1，经授权查回执或同键重试']])+
 para('这些是判断边界的题设，不是一次OAuth/MCP实测。只看到HTTP错误码，未必足够知道工具走到哪一步。第四种情况不能换新键盲写；恢复查询也要按当前身份重新检查权限。可信审批或签名能证明谁批准/声明了什么，动作是否真正提交还要看效果接收方的记录。');
researchLessonSection('agent-runtime','画出执行边界',agentFailureLayers);

function cloudAZDesignExercise(){return '<section class="design-workshop" id="cloud-az"><h2>Cloud设计：三个可用区，为什么总容量够仍扛不住故障？</h2>'+para('本站原创，建议先用15分钟独立作答。用户要求授权查询在500ms内完成；正常输入90次/秒。题设每个应用副本可在这一时延目标下承接40次/秒，三个可用区，失去任意一个区后仍要承接原输入。以下容量都是题设，不是真实集群测量。')+
 '<ol><li>先画入口、身份校验、应用和数据库；明确数据库、缓存与入口是否也承受该故障。</li><li>比较副本布局1/1/1、2/1/1、2/2/1，分别算正常容量和失去最大区后的容量。最少几个副本？</li><li>容量足够之后，怎样证明故障发现、摘除、切流与查询真的完成？如果数据库只有一个写主，还缺什么设计？</li></ol>'+
 '<details class="interview-extra"><summary>展开容量推导、图和验收条件</summary>'+figure('v18-az-capacity','正常总容量不是故障后容量。失去最大区后，前两种布局剩80次/秒；2/2/1剩120次/秒。')+
 table(['副本布局','正常容量','失去最大区后','与90次/秒比较'],[['1/1/1','120次/秒','80次/秒','缺10次/秒'],['2/1/1','160次/秒','80次/秒','仍缺10次/秒'],['2/2/1','200次/秒','120次/秒','容量条件通过']])+
 para('故障后至少要ceil(90/40)=3个副本。4个副本放进3个区，最大区至少有2个，失去它最多剩2个，因此4个不够。5个按2/2/1分布，失去任一区至少剩3个，构成一个可行的容量下限。若每区都放2个，总数6也可行，但不是本题最少。')+
 para('这只在存活副本可均匀分流、性能仍满足题设、后端和入口可用、切流已经完成时成立。故障发现和重试会制造短时额外负载；剩余120次/秒不保证任意突发都能在500ms内结束。实际SLO还需固定有效请求分母、窗口与错误分类后验证。')+
 table(['追加观测','该怎样验收'],[['应用副本Ready，数据库写主却在故障区','应用绿灯不能证明查询成功。核对数据副本、确认点、写主隔离与授权查询'],['故障后立即重试全部请求','给重试设预算、退避与幂等；检查重试放大是否用掉余量'],['流量已切到存活区','观察实际后端分布、队列、错误和达标查询，不能只看控制器期望状态']])+
 '<p>自评四项：推出5副本下限；明确故障域；区分容量与实际SLO；给出切流后的用户结果证据。'+readLink('resilience','复习恢复边界')+' '+readLink('slo','复习有效事件分母')+'</p></details></section>';}
const trainingDesignBeforeResearch=designInterviewWorkshop;
designInterviewWorkshop=()=>infraReadableHTML(cloudAZDesignExercise())+trainingDesignBeforeResearch();
interviewUnits.design=['系统设计 · 容量、故障域与恢复','先完成三区查询服务的容量推导，再设计可恢复的训练平台；每题都给约束、追问与验收。'];

function databaseWaitGraphExercise(){return '<section class="workshop-body" id="wait-graph"><h2>继续追问：锁等待很久，就一定死锁了吗？</h2>'+para('本站原创教学时间线，假设行17与42都是单实例排他锁。箭头约定“等待者→持有者”。这不是前面SQLite实验的运行输出，也不是已经执行的InnoDB实验。')+
 table(['记录','持锁与请求','等待图'],[['甲：T1持有17，T2等17；T1不等其他锁','T2→T1','只有一条边'],['乙：T1持有17并等42；T2持有42并等17','T1→T2，T2→T1','本题形成等待环']])+
 '<details><summary>展开判断与失败边界</summary>'+para('甲可能很慢，但从这些证据看没有环；T1提交或回滚释放锁后，T2有机会继续。乙双方都在等对方释放单实例排他锁，满足本例死锁；数据库选择受害者后，应按实际回执处理并准备重试整个事务。图本身不能指定一定牺牲T1或T2。')+
 para('若两者都先锁17再锁42，本例的反向等待环消失；不能据此宣称系统永远不会死锁，还需检查其他索引、范围锁与访问路径。重试应受截止时间和次数限制。若事务里还调用了库外工具，数据库回滚不会撤销已提交的外部效果，须另外核对稳定操作键与回执。')+
 '<p><a href="https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks-handling.html" target="_blank" rel="noopener">MySQL 8.4官方：避免与处理死锁 ↗</a> · '+readLink('concurrency-pools','复习锁顺序')+'</p></details></section>';}
const databaseWorkshopBeforeResearch=databaseInterviewWorkshop;
databaseInterviewWorkshop=()=>databaseWorkshopBeforeResearch()+infraReadableHTML(databaseWaitGraphExercise());

function podEvidenceExercise(){return '<section class="quality-section" id="pod-evidence"><h2>先判断，再打开下一份证据</h2>'+para('本站原创合成观测。先只给你Pod阶段Pending：它一定还没被调度吗？写下一项能区分解释的证据，再展开。')+
 '<details><summary>证据一：PodScheduled=True，nodeName=node-a，容器等待ImagePullBackOff</summary>'+para('Pod已绑定节点；继续检查镜像引用、认证、网络和节点事件。Pending还可覆盖启动准备期，不能等同于调度失败。ImagePullBackOff描述重试状态，仍需找具体拉取失败原因。')+
 '<details><summary>证据二：UID=p-17未变，app容器restartCount由0变1</summary>'+para('同一Pod中的指定容器重启了一次。检查上一轮退出原因和日志；这不能证明Pod被替换。')+
 '<details><summary>证据三：原UID=p-17，补建对象UID=p-28</summary>'+para('这是新Pod对象，即使标签和控制器相同也不是原来的Pod。关联所属ReplicaSet和事件，再比较删除、驱逐或发布路径。')+'</details></details></details><p>'+readLink('k8s-workloads','读容器状态与控制器')+' '+readLink('kubernetes-basics','读Pod生命周期')+'</p></section>';}
const problemsBeforeResearch=problemsPage;
problemsPage=()=>{problemsBeforeResearch();const app=$('#app');app.innerHTML=app.innerHTML.replace('<div class="problem-list">',infraReadableHTML(podEvidenceExercise())+'<div class="problem-list">');};

const interviewFollowUps=[
 ['共同底座','一次读取不等于一条消息','TCP收的是字节流。先声明长度头、分隔符或协议边界；read返回量不承诺对应一次send。','连接半关闭后还能回包吗？接口超时能否证明服务端没提交？','分别画字节解析、收写两方向、业务提交与回执；给下一项可区分证据。',['network-diagnosis','agent-recovery']],
 ['Cloud / 数据','查五行很慢，换索引就够了吗？','先比较过滤、排序和访问计划，再区分查询慢与事务仍看旧快照。','只看到锁等待时，哪条边能证明形成死锁？','画等待者到持有者的图；把单向等待与成环分开。',['database-index-locks','concurrency-pools']],
 ['Cloud / SRE','三个可用区为什么还会容量不足？','先算失去最大区后的容量，再核对数据库和入口是否也能承受故障。','加第四个副本，90次/秒就能承接了吗？','推得2/1/1仍剩80次/秒，2/2/1才达到本题容量条件。',['resilience','slo']],
 ['AI / 训练','FSDP常驻状态能放下，为什么还OOM？','计算参数收齐、激活和预取在同一时刻的存活量。','同样常驻4GiB，预取为何把峰值5改成5.5GiB？','画A/B缓冲申请与释放；分清预算模型与GPU实测。',['gpu-memory','distributed-training']],
 ['AI / 推理','共享KV、拆分P/D，究竟省了哪项？','共享块节省重复存储；P/D拆分改变资源池与排队，但新增交接。','一个请求结束能覆盖共享块吗？带宽减半时拆池还划算吗？','核引用数2→1，手算512MiB在25/12.5GB/s下的21.47/42.95ms。',['model-serving','inference-performance']],
 ['Agent / 验收','报告正确落库，就算任务成功吗？','同时核对实际产物、来源、对用户的状态，以及不允许发生的访问。','金额37与引用正确，对用户却报已拒绝，应得几分？','四个固定用例应为3/4，报告1行，合格业务任务0；再跑状态反例。',['agent-evaluation','agent-security']]
];
function interviewFollowUpHTML(){return '<section class="quality-section" id="follow-up"><h2>把一道题答到能继续追问</h2>'+para('以下六组由本站原创。先用一分钟作答，再打开追问；具体公司实际问法仍以下方候选人原帖为证。')+interviewFollowUps.map(([role,title,first,follow,gate,ids])=>'<details class="experience-question research-followup"><summary><span>'+role+'</span>'+title+'</summary><div>'+para('<b>第一层：</b>'+first,'<b>条件变化：</b>'+follow,'<b>过关证据：</b>'+gate)+'<div class="path-links">'+ids.map(id=>readLink(id,articleById(id).title)).join('')+'</div></div></details>').join('')+'</section>';}
const experienceGuideBeforeResearch=interviewExperienceGuide;
interviewExperienceGuide=()=>infraReadableHTML(interviewFollowUpHTML())+experienceGuideBeforeResearch();

