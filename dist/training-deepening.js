const attentionDownload='<div class="download-box"><div><strong>15分钟机制实验：Attention与有效token</strong><span>Python 3.9+ · 标准库 · 固定向量、反例与实际验证记录</span></div><a href="labs/attention-mechanics.zip" download>下载机制实验 ↓</a></div>';
Object.assign(sources,{
 attentionPaper:['Vaswani等 · Attention Is All You Need','https://arxiv.org/abs/1706.03762'],
 kvExplanation:['Hugging Face · KV缓存的机制','https://huggingface.co/docs/transformers/main/en/cache_explanation'],
 sdpa:['PyTorch · 注意力mask与非方阵语义','https://docs.pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html'],
 ddpDesign:['PyTorch 2.5.1 · DDP设计与梯度平均','https://github.com/pytorch/pytorch/blob/v2.5.1/docs/source/notes/ddp.rst']
});
const overview=articles.find(a=>a.id==='gpu-cluster');
overview.title='云上训练全景：从token到GPU集群';
overview.desc='沿着一段文本经过张量、loss与参数更新的路径，理解训练为什么需要算力、显存、网络和可恢复状态。';
overview.prereq='了解进程、网络与数组；本章会解释token、张量形状和训练循环。';
overview.minutes=20;
overview.baseline='机制实验 Python 3.9+ · DDP路线 PyTorch 2.5.1';
overview.objectives=['沿token→logits→loss说明一次训练','把张量形状和状态映射到资源需求','区分运行时健康与训练有效进展'];
overview.intro='做云与SRE的工程师已经熟悉请求、队列、进程和持久化。进入AI Infra后，还需要看懂系统究竟在计算什么：同样是扩容，为什么有时显存仍然不够，有时网络先成为瓶颈？本章从一小段输入开始，把模型计算连到你熟悉的工程职责。';
overview.sections=[
 ['先让每个新概念有一个位置',para('我们以常见的decoder-only自回归Transformer为例：给定前面的token，预测下一个token。token是分词器定义的离散单位，可能对应一个字、词片段或其他符号；token ID是编号，不是天然带有语义大小的数值。模型通过embedding把编号映射成可计算向量。','Infra工程师需要理解形状与状态如何变化，才能解释数据传输、矩阵计算、显存和通信的代价。不同模型架构会改变这些细节，本章并不把Transformer当作所有AI模型的唯一结构。')],
 ['先走通一组输入与标签',code('玩具token ID：不是实际中文分词结果','PYTHON','ids = [0, 1, 2, 3, 4]\ninputs = ids[:-1]   # [0, 1, 2, 3]\ntargets = ids[1:]   # [1, 2, 3, 4]')+para('输入位置0用token 0预测token 1，位置1用已允许的前缀预测token 2，以此类推。训练文本已经给出了目标，因此可以同时计算多个位置的预测误差；可见性仍由因果mask约束，不能偷看未来位置。','有些模型接口内部完成标签移位，有些要求调用者完成。接入真实模型前先核对接口契约，避免移位两次或完全没有移位。padding位置是否进入loss，也必须显式确定。')],
 ['跟着形状走过一层，再走到loss',figure('token-training-step','从输入到参数更新的逻辑路径。形状用于检查责任与量级，不表示每个张量都长期驻留。')+table(['阶段','形状示例：B=2，T=4','解释'],[['输入ID','[2, 4]','两段文本，每段四个输入位置'],['Embedding','[2, 4, 8]','d_model=8，每个位置成为8维向量'],['多头Q/K/V','[2, 2, 4, 4]','普通MHA：2个头，每头4维'],['单层输出','[2, 4, 8]','混合上下文后保持隐藏维度'],['词表投影logits','[2, 4, 6]','玩具词表大小6，每位置有6个未归一化分数'],['loss','标量或逐位置值','按有效标签计算误差，再按约定归一化']])+para('这里使用教学尺寸，不能据此估计大模型性能。标准MHA把d_model拆成多个头；GQA等结构的KV头数可以与查询头数不同。Attention负责混合位置间信息，FFN通常逐位置变换特征；残差与归一化连接各层，使训练更稳定。')],
 ['Attention究竟混合了什么',para('把Q看成当前位置用于匹配的向量，K用于计算相关分数，V提供被加权汇总的内容。这是理解计算角色的比喻；Q、K、V都来自模型的投影，并非人工标注的检索字段。','先计算QKᵀ/√d_head，再在不允许的位置加上负无穷的逻辑mask，最后对允许位置做softmax。结果是权重，用这些权重加权求和V。将mask简单乘成0并不等价：softmax(0)通常不是0。')+code('单头的形状关系','TEXT','Q: [T, d_head]   K: [T, d_head]   V: [T, d_value]\nQ @ K.T         → [T, T]\nsoftmax(分数 + mask) @ V → [T, d_value]')+figure('causal-attention-map','训练可同时计算多个已知输入位置，生成则需要等待下一步输入确定。')+'<div id="attention-demo"></div>'],
 ['从预测误差到一次参数更新',para('logits经过损失函数与正确标签比较。对单个目标，交叉熵可以理解为−log(模型赋给正确token的概率)：概率越低，损失越大。反向传播按链式法则计算参数如何影响loss，优化器再利用梯度和自身状态更新参数。','一次forward不等于一次optimizer step。梯度累积可以让多个微批次共同形成一次更新；DDP还要使各rank参与匹配的梯度同步。权重、梯度、优化器状态和反向所需激活，是不同类别的内存需求。')+table(['模型侧对象','工程侧要观察什么'],[['输入与预处理','CPU、存储、网络读取和batch等待'],['Attention与FFN','算子时间、张量形状与设备吞吐'],['梯度同步','进程组、通信次序、拓扑和慢rank'],['优化器状态与激活','显存峰值、精度与分片策略'],['恢复状态','参数、优化器、随机数、数据顺序与版本']])],
 ['把一步计算放回集群',figure('cloud-training','控制、计算和数据三个平面协作，让训练能开始、持续进展并恢复。')+para('控制平面处理任务契约、准入与调度；计算平面运行训练进程；数据平面供给输入并保存恢复资产。这是职责划分，不要求部署在三个独立集群。','单卡先检查计算和容量；单机多卡加入数据分片与机内同步；多机再加入网络、共享数据和协同失败。每卡一个进程是本课程DDP实验的选择。')+'<div id="topology-demo"></div>'],
 ['用一个反例检验你是否真正理解',para('两卡扩到四卡后吞吐几乎不变，可能是每卡工作变少、通信占比提高，也可能是数据供给跟不上。先固定模型、精度和batch口径，对齐各rank时间线，再解释变化。','序列长度翻倍时，常规密集注意力的逻辑分数对数量约变为四倍，而逐token的部分计算接近两倍；总step time不会因此必然变为四倍。融合或FlashAttention类实现也不必把完整T×T矩阵存入高带宽显存。区分数学量级、实际存储与实测耗时，是资源判断的关键。')],
 ['先完成小实验，再进入并行训练',code('标准库机制实验','BASH','python3 attention_lab.py --output runs/attention-report.json')+para('实验真实计算四个位置的单头因果注意力：修改未来V不改变过去输出；移除mask后过去输出会变化；逐token追加KV与整段计算一致。它还用解析导数与有限差分检查有效token归一化。','这些实验不包含真实tokenizer、Transformer训练、GPU内核或DDP进程。后续6.4的完整DDP实验验证执行协议；6.7—6.10继续扩展到多机手册、恢复、性能和平台。')+attentionDownload+linkTo('distributed-training','理解数据与模型如何分到多张卡')]
];
overview.refs=['attentionPaper','kvExplanation','ddpDesign','ddp','gpu'];
overview.related=['distributed-training','gpu-memory','model-serving'];
overview.exercise=['把T从4改为8，其他维度固定：逻辑Attention分数矩阵、Embedding输出分别怎样变化？这能直接推出训练耗时吗？','每个头的分数矩阵由4×4变为8×8，元素数变为4倍；Embedding输出的token维翻倍，元素数变为2倍。实际耗时还受FFN、融合内核、数据、通信与重叠影响，不能据此直接推定整体耗时倍数。'];
overview.check=['能用四个token解释输入、标签与因果mask','能说清权重、梯度、优化器状态与激活的不同','能解释资源占用为何不能证明参数正在更新'];
Object.assign(trainingChapters.find(a=>a.id==='gpu-cluster'),overview);

const parallelChapter=articles.find(a=>a.id==='distributed-training');
parallelChapter.sections.splice(1,0,
 ['平均梯度为什么可能对应错的目标',para('默认DDP按进程组规模平均梯度。如果每个rank有效token数相同，各自平均loss后再平均梯度可以对应全局token平均；如果有效token数不同，这种平均就给了每个rank相同权重，而非给每个token相同权重。','构造一个可算的例子：rank A只有1个有效token，rank B有3个。采用教学损失0.5×(w−y)²，w=1，A的目标是[0]，B是[3,3,3]。A平均loss为0.5，B为2；直接平均得到1.25，全局四个token平均却是1.625。梯度也分别为−0.5与−1.25，更新方向虽同，幅度已不同。')+table(['计算方式','loss','对w的梯度'],[['平均两个rank的局部均值','1.25','−0.5'],['四个有效token的全局均值','1.625','−1.25']])],
 ['让归一化对齐一个完整更新',code('默认DDP平均梯度下的代数关系','TEXT','N = 本次更新中，所有rank、所有微批次的有效token总数\nW = 实际参与平均的进程组规模\n每个rank反传：W × 本rank的loss总和 / N\nDDP平均后：Σ所有有效token的梯度 / N')+para('梯度累积时，N必须覆盖整个更新窗口。每个微批次使用相同全局分母，累积各自loss总和；这时不要再机械地除以accum，否则会重复缩放。真实代码需要先得到整个窗口的有效数量，并确保各rank按匹配次序完成计数与梯度通信。日志另行归约总loss与总有效数量，不能把本地反传标量直接当作全局loss。','某个rank全是padding时，仍需按框架约定保持计算图与集合通信参与，贡献零损失梯度；所有rank全局有效token为0时，应协同跳过更新，避免除零与优化器副作用。计数必须在标签移位与忽略规则之后确定；加权交叉熵若以目标权重总和为分母，就不能机械使用token数。自定义通信hook、join或不同目标权重会改变前提，必须重新推导。','标准库实验验证上述代数、有限差分与空输入边界，没有执行真实DDP。迁移到模型前，再用单进程全局batch结果和分布式结果做对照。')+attentionDownload]
);
parallelChapter.minutes=20;
parallelChapter.refs.push('ddpDesign');
parallelChapter.related=['gpu-cluster','ddp-code','multinode-lab'];
Object.assign(trainingChapters.find(a=>a.id==='distributed-training'),parallelChapter);

const servingChapter=articles.find(a=>a.id==='model-serving');
servingChapter.sections.splice(2,0,['为什么历史KV可以复用',para('在固定模型、正确位置编码与因果可见性下，过去位置的隐藏表示不会因为未来token追加而改变，因此过去的K、V可以复用。当前query只需与缓存和当前token的KV计算注意力。每一层都需要对应缓存；权重更新、位置错位或mask错误会破坏这种等价关系。','输入已知时，prefill可以处理整段提示；生成时，新输入来自上一步输出，所以沿序列继续。带缓存并不意味着历史上下文不再参与计算：当前query仍需读取相关KV。缓存省去了部分重复计算，同时占用与搬运状态。')+code('在同一组固定向量上对照','BASH','python3 attention_lab.py --output runs/attention-report.json')+para('实验比较整段因果注意力与逐token追加KV，最大误差小于1e−12；再通过修改未来V和移除mask构造反例。它验证单头固定向量的语义，没有验证多层模型、位置编码实现、低精度GPU或真实生成速度。')+attentionDownload]);
servingChapter.sections[2][1]+=note('迁移到框架时，再检查mask的坐标','参考PyTorch SDPA文档时注意：非方阵is_causal的左上对齐语义，不自动表示当前query位于缓存末尾。query长度为1时，合法前缀通常应全部可见；分块decode还需要位置偏移。还需显式处理dropout与精度，不能把单头实验直接当作框架调用的完整验证。');
servingChapter.refs.push('kvExplanation','sdpa');
servingChapter.related.unshift('gpu-cluster');
servingChapter.minutes=12;
