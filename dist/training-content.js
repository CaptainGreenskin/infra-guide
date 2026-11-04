const trainingEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trainingCode=(name,lang,code)=>`<div class="code-block"><div class="code-toolbar"><span>${trainingEscape(name)} <small>${lang}</small></span><button data-copy-code aria-label="复制 ${trainingEscape(name)}">复制代码</button></div><pre tabindex="0"><code>${trainingEscape(code.trim())}</code></pre></div>`;
const trainingFigure=(name,caption)=>`<figure class="training-figure"><a href="diagrams/${name}.svg" target="_blank" rel="noopener" aria-label="放大：${trainingEscape(caption)}"><img src="diagrams/${name}.svg" width="${diagramWidths[name]||960}" height="${diagramHeights[name]||480}" alt="${trainingEscape(caption)}" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>${caption}<a href="diagrams/${name}.svg" download>下载 SVG ↗</a></figcaption></figure>`;
const trainingTable=(heads,rows)=>`<div class="table-wrap"><table><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const trainingNote=(title,body)=>`<div class="callout"><strong>${title}</strong><p>${body}</p></div>`;
const labDownload='<div class="download-box"><div><strong>配套 DDP 实战包</strong><span>完整 Python 脚本 · 两端启动脚本 · 恢复对照 · 环境与验证记录</span></div><a href="labs/cloud-training-ddp.zip" download>下载代码 ↓</a></div>';
Object.assign(sources,{
torchrun:['PyTorch · torchrun 进程启动','https://docs.pytorch.org/docs/stable/elastic/run.html'],
amp:['PyTorch · 混合精度与梯度累积','https://docs.pytorch.org/docs/stable/notes/amp_examples.html'],
data:['PyTorch · 数据加载与采样器','https://docs.pytorch.org/docs/stable/data.html'],
fsdp2:['PyTorch · FSDP2 教程','https://docs.pytorch.org/tutorials/intermediate/FSDP_tutorial.html'],
ncclNetwork:['NVIDIA · NCCL 网络排查','https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/troubleshooting/networking_troubleshooting.html'],
ncclLogs:['NVIDIA · NCCL 日志','https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/troubleshooting/logging.html'],
install:['PyTorch · 版本安装命令','https://pytorch.org/get-started/previous-versions/'],
profiler:['PyTorch · 性能分析教程','https://docs.pytorch.org/tutorials/recipes/recipes/profiler_recipe.html']
});
const trainingGroups=['一、建立系统与资源模型','二、理解训练执行机制','三、完成云上训练实验'];
const trainingChapters=[
{id:'gpu-cluster',number:'6.1',title:'云上训练全景：从任务到 GPU 集群',group:0,level:'原理',minutes:12,tags:['系统架构','GPU 集群','学习地图'],desc:'划分控制、计算与数据平面，跟踪一个训练任务的完整生命周期。',objectives:['画出训练系统的三个平面','区分资源就绪、通信就绪与训练完成','为每个环节定义可观测证据'],prereq:'了解进程、网络和基本的神经网络训练循环。',intro:'一次训练不是一个孤立的 Python 进程。数据从持久化存储进入 CPU，再传到 GPU；多个进程协同更新模型；调度器、日志和检查点负责让任务可运行、可解释、可恢复。先看全景，后续每一种优化才有明确的作用位置。',sections:[
['用三个平面拆解系统',trainingFigure('cloud-training','图 6-1 · 云上训练的控制、计算与数据平面。')+'<p><strong>控制平面</strong>接受任务声明、管理配额、选择节点、跟踪状态。<strong>计算平面</strong>运行训练进程、执行 GPU 计算和进程间通信。<strong>数据平面</strong>提供数据集、缓存和检查点持久化。可观测性覆盖三者，帮助解释等待发生在哪里。</p><p>这是分析方法，不要求它们部署在三个独立集群。小型实验可把控制操作放在终端里，关键是职责和失败边界清楚。</p>'],
['一轮训练的生命周期',trainingTable(['阶段','主要动作','验收证据'],[['提交','固定代码、数据和超参数','任务标识、配置摘要'],['就绪','启动全部 rank，建立通信','设备映射、集合通信完成'],['迭代','读数据，前向、反向、更新','损失、有效样本数、step time'],['保存','提交可恢复状态','完成版本、保存耗时'],['完成','写结果、释放资源','退出码、产物、质量指标']])+'<p>Pod 显示 Running，只说明运行时已经启动；显存被占用也不证明梯度在更新。验收必须向上检查业务结果。</p>'],
['从一张卡到一个集群','<p>单卡首先考虑显存和计算。单机多卡增加进程映射、数据分片与机内同步；多机又加入网络选择、拓扑、共享存储与成组失败。</p><div id="topology-demo"></div><p>每卡一个进程是本教程 DDP 路线的选择，不是所有训练系统唯一的实现方式。</p>'],
['用一次变慢事件建立系统视角','<p>假设从 2 卡扩到 4 卡，吞吐几乎没变。至少有四个假设：每卡工作变少导致通信占比上升；某个节点的数据读取更慢；任务选中了低速互联；模型太小，调度与启动开销占据主要时间。</p><p>先固定模型、精度、数据和 batch 口径，再比较各 rank 的数据等待、计算和通信时间。定位限制因素后，资源和配置调整才有解释力。</p>'+trainingNote('工程判断','检查有效样本吞吐、达到目标质量的时间，以及等待和失败造成的资源消耗。单个 GPU 利用率数字不能替代系统诊断。')],
['本专题的实验闭环','<p>6.2–6.6 建立并行、显存、DDP 与通信模型；6.7 完成两机四卡启动；6.8 验证恢复；6.9 建立性能对照；6.10 将任务表达为平台工作负载。</p><p>实战用合成分类数据与小型 MLP 隔离系统机制。它不代表大模型的算力需求，不应拿实验吞吐给真实模型选型。</p>'+labDownload]
],check:['能解释一个任务从提交到完成的过程','能区分运行时健康和训练有效进展','能列出扩卡无收益时需要的证据'],refs:['ddp','nccl','gpu']},
{id:'distributed-training',number:'6.2',title:'并行策略：DDP、FSDP、TP 与 PP 的取舍',group:0,level:'原理',minutes:15,tags:['DDP','FSDP','张量并行','流水线并行'],desc:'先识别容量与吞吐问题，再比较状态、计算和通信如何分配。',objectives:['解释四种策略的切分对象','区分显存节省与加速','结合拓扑和模型提出方案'],prereq:'完成 6.1，理解参数、梯度和优化器状态。',intro:'一张 GPU 装不下与一张 GPU 跑不够快，是不同问题。前者需要改变状态或计算的放置；后者需要减少完成目标的时间。并行策略要同时从显存、通信、计算和收敛评估。',sections:[
['数据并行：分数据，复制副本','<p>本教程的 DDP 模式中，各进程持有完整模型和优化器状态，读取不同样本。反向时同步梯度，之后各副本执行相同更新。它适合单卡能容纳模型状态、希望利用更多数据并行计算的场景。</p><p>DDP 不自动切分数据。输入分片、训练步数一致性与采样策略仍由程序负责。不均匀输入需要额外设计，不能直接让一个 rank 提前退出。</p>'+trainingFigure('ddp-step','图 6-2 · DDP 逻辑更新流程，实际通信可与反向计算重叠。')],
['分片：减少长期持有的状态','<p>FSDP 与 ZeRO 类方法按策略分摊训练状态。完整分片可把参数、梯度与优化器状态分布到不同设备，计算模块前聚合所需参数，计算后释放或归约相应状态。</p><p>临时聚合、预取、激活与通信缓冲仍贡献峰值。分片过粗会拉高显存峰值，过细又可能增加小通信与调度开销。</p>'+trainingNote('版本边界','FSDP1 与 FSDP2 的接口和参数表示不同。配套可运行实验选择 DDP；FSDP2 使用官方教程作为进阶入口，不把接口片段标为已验证的完整方案。')],
['模型并行：切分计算图','<p><strong>TP</strong>把层内矩阵计算切到多个设备，频繁的层内或层间通信更依赖互联。<strong>PP</strong>把层分成阶段，用微批次填充流水线；阶段不均衡和流水线空闲会降低效率。</p><p>可以组合数据、张量与流水线并行，但组合会增加进程组、布局和调试难度。先验证单一策略，再逐步组合。</p>'],
['按限制因素选择策略',trainingTable(['限制','优先调查','主要代价'],[['能放下，吞吐不足','DDP、batch、数据供给','梯度同步与收敛变化'],['参数/优化器占用高','分片、卸载、精度','聚合与主机传输'],['单层过大','TP 与层实现','高频通信与拓扑要求'],['深模型跨设备','PP 与微批次','流水线空闲、阶段不均'],['激活主导','序列长度、微批次、重算','额外计算或配置改变']])],
['用相同口径评价扩展','<p>吞吐加速比 S = Q<sub>N</sub> / Q<sub>1</sub>；扩展效率 E = S / N。需要相同计量单位和可比较负载；还要比较最终质量与达到该质量的时间。</p><div id="scaling-demo"></div><p>固定每卡 batch 扩卡会增大全局 batch；固定全局 batch 则会减少每卡工作。它们回答不同问题，报告必须标明。</p>']
],check:['能说清四种策略分别切什么','能解释分片后仍可能 OOM','能区分两种 batch 扩展口径'],refs:['ddp','fsdp2','nccl']},
{id:'gpu-memory',number:'6.3',title:'GPU 显存与混合精度：建立可检查的预算',group:0,level:'原理 + 代码',minutes:15,tags:['显存','BF16','FP16','梯度累积'],desc:'拆分参数、梯度、优化器和激活，理解 AMP 与累积的能力边界。',objectives:['建立显存预算并说明边界','计算有效 batch','正确安排 AMP 更新'],prereq:'完成 6.2；理解前向、反向与优化器更新。',intro:'显存不足时，先确定哪类状态增长。参数量只是起点；激活随微批次、序列长度与模型结构改变，通信和分配器也贡献峰值。',sections:[
['先估算状态，再测真实峰值',trainingFigure('memory-budget','图 6-3 · FP32 Adam 的简化显存预算。')+'<p>若参数、梯度与 Adam 的两份动量均为 FP32，状态近似 4P + 4P + 8P = 16P 字节。10 亿参数约为 16 GB（十进制），不包含激活、工作空间、通信缓冲和框架开销。</p><p>优化器、参数存储类型与分片不同，公式也会改变。先写明口径，再用峰值统计验证。</p>'],
['微批次与有效 batch','<p>各 rank 样本数相同、使用均值损失且累积组完整时：</p><div class="formula">B<sub>effective</sub> = B<sub>micro</sub> × accumulation × world_size</div><p>两机四卡、每卡 64、累积 2 次，有效 batch 为 512。减小微批次通常降低激活峰值，再增加累积可保持有效 batch，但时间和通信行为会变化。</p><p>累积不缩小模型和优化器状态，这部分放不下时还要考虑分片或卸载。</p>'],
['FP16 与 BF16 的区别','<p>FP16 指数范围较窄，常配合损失缩放减少小梯度下溢。BF16 指数范围更接近 FP32，常见流程不需要 FP16 式 GradScaler，但仍要验证硬件支持和数值稳定性。</p><p>autocast 按算子策略选择计算精度，不会简单把所有参数与优化器状态改成 16 位，因此总显存不一定减半。</p>'],
['在有效 batch 边界更新',trainingCode('累积与混合精度关键片段','PYTHON',`update = (step + 1) % accum == 0
# no_sync 同时覆盖 forward 和 backward。
with nullcontext() if update else model.no_sync():
    with torch.autocast("cuda", dtype=torch.float16):
        loss = criterion(model(x), y)
    scaler.scale(loss / accum).backward()
if update:
    scaler.step(optimizer)
    scaler.update()
    optimizer.zero_grad(set_to_none=True)`)+'<p>假设微批次大小一致、批次数能整除 accum。末尾不足一组时，需要修正归一化并执行更新；本实验明确拒绝这种配置。梯度裁剪应在完整组累积后先 unscale，再裁剪和 step。</p>'],
['区分张量占用和缓存保留',trainingCode('测量显存峰值','PYTHON',`torch.cuda.reset_peak_memory_stats()
# ...运行待测训练区间...
torch.cuda.synchronize()
print(torch.cuda.max_memory_allocated() / 2**30)
print(torch.cuda.max_memory_reserved() / 2**30)`)+'<p>allocated 统计张量分配，reserved 包含分配器保留内存；它们与 nvidia-smi 也不是同一口径。每次只改变一个变量，同时记录峰值、损失与吞吐。</p>']
],check:['能指出 16P 估算遗漏了什么','能解释 no_sync 为何覆盖前向','能处理末尾不完整累积组'],refs:['amp','ddp','fsdp2']}
];

trainingChapters.push(
{id:'ddp-code',number:'6.4',title:'写对一份 DDP 训练程序',group:1,level:'代码实战',minutes:22,tags:['torchrun','DistributedSampler','DDP','完整代码'],desc:'从设备绑定、数据分片到梯度同步，逐项检查训练的正确性。',objectives:['建立 local rank 与设备映射','保持分片和更新步数一致','运行完整脚本并解读日志'],prereq:'完成 6.1–6.3；准备 Python 与 PyTorch。',intro:'DDP 的问题常发生在模型外部：进程使用了错误设备，各 rank 读了相同数据，某个分支少执行一次同步，或恢复遗漏训练状态。用一份完整小程序把这些约束落实到代码。',sections:[
['进程映射与初始化',trainingFigure('ranks','图 6-4 · 两机四卡的 rank 与 GPU 映射。')+trainingCode('设备绑定与初始化','PYTHON',`local_rank = int(os.environ["LOCAL_RANK"])
torch.cuda.set_device(local_rank)
dist.init_process_group("nccl")
model = MyModel().to(local_rank)
model = DDP(model, device_ids=[local_rank])`)+'<p>LOCAL_RANK 选择本机设备，RANK 标识全局进程，WORLD_SIZE 表示总进程数。第二台机器不能把全局 RANK 直接当作 GPU 序号。模型类与 import 等上下文见下面完整脚本。</p>'],
['数据分片与 epoch',trainingCode('采样器配置','PYTHON',`sampler = DistributedSampler(dataset, shuffle=True, seed=23, drop_last=True)
loader = DataLoader(dataset, sampler=sampler, batch_size=64, drop_last=True)
for epoch in range(start_epoch, target_epochs):
    sampler.set_epoch(epoch)
    for x, y in loader:
        ...`)+'<p>set_epoch 让每轮使用不同且可重复的打乱顺序。两处 drop_last=True 使各 rank 更新次数一致，代价是不能整除时会丢弃尾部数据。</p><p>若改用采样器的补齐策略，可能重复样本；验证集指标尤其要避免把重复样本计入。还需确保 batch 数与累积次数匹配。</p>'],
['损失和时间的汇总口径','<p>这里汇总的是分类示例的日志：先累计每批平均损失×样本数，再跨进程求和，除以全局样本数。它与反向传播使用哪个分母是两件事。完整示例按相同大小的批次用loss/accum累积；换成长度不同的文本时，要用整个更新窗口的有效目标数归一。6.2节的双进程实验展示了局部均值算出4、正确全局梯度为5的区别。</p><p>计时前对齐进程，CUDA 路径同步设备；耗时取各 rank 最大值，吞吐以全局实际样本数相除。它包含该 epoch 的输入与计算，不包含随后的检查点保存。单独记录保存开销才能估算端到端成本。</p>'],
['完整程序',labDownload+'<p>程序包含合成数据、带 Dropout 的 MLP、梯度累积、可选 AMP、JSON 指标与 epoch 边界恢复。CPU/Gloo 和 GPU/NCCL 共用训练循环。</p><details class="full-code"><summary>展开完整 train_ddp.py</summary>'+trainingCode('train_ddp.py','PYTHON',labFiles['train_ddp.py'])+'</details>'],
['执行本机验证',trainingCode('CPU 两进程启动','BASH',`torchrun --standalone --nproc-per-node=2 train_ddp.py \
  --device=cpu --epochs=4 --samples=1024 --hidden=32 \
  --batch-size=32 --accum=2 --save-dir=runs/cpu-full`)+'<p>预期 start.world_size=2、effective_batch=128；每个 epoch 实际处理 1024 样本，每个 rank 做 8 次优化器更新；随后输出 checkpoint 记录。具体 loss 与吞吐以实际输出为准。</p>'+trainingNote('验证边界','此步骤验证进程、采样、更新与保存逻辑。CPU 正常不能证明 GPU/NCCL、跨节点网络或混合精度正确。')]
],check:['能解释进程身份、采样器和同步代码','能由日志计算样本数与更新次数','能指出脚本的恢复范围'],refs:['ddp','torchrun','data','amp']},
{id:'training-communication',number:'6.5',title:'NCCL 与集合通信：定位等待发生在哪里',group:1,level:'原理 + 排障',minutes:16,tags:['AllReduce','NCCL','网络','拓扑'],desc:'连接集合通信语义、实际拓扑与跨节点排障。',objectives:['解释 AllReduce 与梯度同步','区分会合与训练通信','定位慢 rank 与网络问题'],prereq:'完成 6.4，理解 rank 和一次优化器更新。',intro:'集合通信需要一组进程按匹配方式参与。某个 rank 在进入通信前就卡住，其他 rank 也可能表现为通信等待。因此既要看网络，也要看所有参与者的时间线。',sections:[
['AllReduce 做什么','<p>AllReduce 对所有参与者的输入执行归约，并让每个参与者获得结果。典型 DDP 梯度同步归约并按进程组规模平均，使副本使用一致梯度；它不会把所有训练数据集中到 rank 0。</p><p>AllGather 汇集分片，ReduceScatter 归约后分发分片，常见于分片训练。具体算法由库、消息规模与拓扑共同影响，不应把环形示意图当成每次运行的真实路径。</p>'],
['通信与计算的重叠','<p>反向时部分梯度会先就绪。DDP 按桶组织梯度，可以启动已经就绪的桶通信，同时继续计算后续梯度。</p><p>独立通信测试快了，不一定等比例缩短 step，因为部分通信原已被计算覆盖。优化应关注关键路径上尚未被覆盖的时间。</p>'],
['会合与数据通信是两类需求','<p>torchrun 的会合地址帮助进程进入同一作业；NCCL 还要建立进程间连接。只验证 MASTER_PORT 可达，不证明数据通路正常。</p><p>云实例支持 RDMA、驱动与库正确安装、容器可见设备、实际选中网卡，是不同验证项。普通 TCP 可用于功能实验，但不能推断 RDMA 的吞吐。</p>'+trainingNote('网络范围','将访问范围限定到训练节点或相关安全组，按平台要求处理双向访问与通信端口。不要向公网开放整组训练端口。')],
['先找第一处异常',trainingCode('采集诊断信息','BASH',`export NCCL_DEBUG=INFO
# 诊断期间按需开启，性能测试时去除额外检查开销。
export TORCH_DISTRIBUTED_DEBUG=DETAIL
nvidia-smi topo -m
ip -br addr
# 仅在确认真实网卡后指定，例如：
# export NCCL_SOCKET_IFNAME=ens5`)+'<p>收集每个节点日志，找最早失败的 rank。一个进程 OOM 后，其他进程超时通常是后果。网卡名必须来自当前机器，不能直接复制示例。</p>'],
['现象与证据',trainingTable(['现象','可能原因','下一步'],[['初始化等待','节点未加入、地址错误、规则不完整','核对两端参数和退出信息'],['中途同步超时','OOM、输入停顿、控制流分叉','找所有 rank 最早异常'],['跨机扩展差','通信占比、网卡、慢节点','比较单机、时间线和链路'],['设备忙但吞吐低','通信或同步内核占用','看有效吞吐与算子时间线']])+'<p>底层可使用平台带宽/延迟工具或 NCCL tests，但要明确工具环境和参数。禁用 IB/P2P 等回退实验只能帮助定位，不能直接成为长期调优结论。</p>']
],check:['能解释通信等待不一定是网络故障','能区分两类连接需求','能设计一次只改变一个条件的诊断'],refs:['nccl','ncclNetwork','ncclLogs','ddp']},
{id:'data-pipeline',number:'6.6',title:'数据管道：让 GPU 持续获得有效输入',group:1,level:'原理 + 实验',minutes:15,tags:['DataLoader','缓存','预取','数据版本'],desc:'拆解读取、解码、组批与传输，避免把输入瓶颈误判为算力不足。',objectives:['画出数据到 GPU 的阶段','设计合成与真实输入对照','理解 worker、预取与内存的权衡'],prereq:'完成云存储基础与 6.4。',intro:'训练速度受最慢供给环节约束。数据存储、网络、CPU 解码、组批与主机到设备传输都可能造成空闲，而且多机扩展会改变并发读取压力。',sections:[
['拆分输入路径','<div class="flow-line"><span>存储读取</span><b>→</b><span>CPU 解码 / 变换</span><b>→</b><span>组批 / pinned memory</span><b>→</b><span>GPU 传输</span></div><p>分别记录读取量、读取延迟、CPU 时间、batch 等待和设备拷贝。输入管道能与计算重叠，所以各阶段耗时不能简单相加当作 step time，应结合时间线判断暴露在关键路径上的等待。</p>'],
['用三组对照缩小范围','<ol><li><strong>设备上的固定输入：</strong>主要观察模型计算与同步。</li><li><strong>内存合成输入：</strong>加入 DataLoader 和主机传输。</li><li><strong>真实数据：</strong>加入存储、解码和实际样本分布。</li></ol><p>三组要尽量保持形状、精度和 batch 可比。合成输入变快只说明真实输入路径存在额外代价，还不能直接把原因归给存储。</p>'],
['worker 和预取不是越大越好',trainingCode('真实数据的配置起点','PYTHON',`loader = DataLoader(
    dataset, batch_size=64, sampler=sampler,
    num_workers=4, pin_memory=True,
    persistent_workers=True, prefetch_factor=2,
)
for x, y in loader:
    x = x.to(device, non_blocking=True)
    y = y.to(device, non_blocking=True)`)+'<p>这是调参起点，不是通用最优值。worker 数要乘以节点上的训练进程数；4 个训练进程各开 4 个 worker，已产生 16 个数据进程。预取还会扩大内存与 pinned memory 占用。</p><p>non_blocking 允许符合条件的异步传输，但是否与计算真正重叠还取决于数据来源、流使用和硬件。配套最小实验用 num_workers=0，以简化确定性恢复；这两种配置的验证目标不同。</p>'],
['存储布局与数据版本','<p>大量小文件会放大元数据与请求开销。按读取方式设计分片，记录样本数、分片清单和校验信息。缓存键包含数据版本，防止代码与旧缓存混用。</p><p>多机读取还要检查热点：如果所有 rank 同时争抢同一批远端文件，吞吐可能随扩卡下降。先优化布局和分片，再评估共享缓存或本地预热。</p>'],
['数据正确性也是验收项','<p>记录每轮实际处理数、丢弃与补齐规则；采样器的 shuffle seed 和 epoch 要可追踪。真实数据还应检查类别分布、重复、坏样本与变换的一致性。</p><p>从预取中的任意 batch 恢复需要处理 worker RNG、读取游标和在途样本。仅保存模型与 epoch 无法保证样本级恢复。本专题将可执行恢复边界明确限制在 epoch 结束。</p>']
],check:['能设计三组输入对照','能计算一台机器的数据 worker 总数','能解释预取为什么使精确恢复更复杂'],refs:['data','checkpoint','profiler']}
);


