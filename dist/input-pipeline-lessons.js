/* Input correctness and supply capacity: separate invariants, then actual worker evidence. */
const inputObjects=infraReadableHTML(
 '<div class="mechanism-core" id="input-dataset-sampler-loader">'+knowledgeSubhead('先沿一条样本路径，分清六个职责')+
 para('训练数据管道把存储中的原始资料变成当前训练进程可以使用的张量。Dataset描述“有哪些数据、怎样取得一个样本”；Sampler决定索引顺序及分给谁；BatchSampler或批处理规则决定哪些样本组成一批；collate把一组样本整理成张量；DataLoader负责调度读取、worker与批次交付。rank是分布式进程编号，worker是某个进程内负责加载数据的子进程，两者不能混用。',
 'Map-style Dataset按索引取样，例如dataset[7]；IterableDataset由迭代器连续产出，例如流式读取分片。在前者中，主进程可按Sampler分配索引给worker；在后者中，每个worker拥有自己的数据集副本，必须由数据逻辑明确划分迭代范围。只把num_workers从0改成4，不会自动替任意流式数据源做好去重分流。')+
 table(['阶段','典型输入与输出','应有的正确性证据'],[
 ['读取与解码','对象/文件 → 样本ID与内容','来源版本、读取成功、坏样本规则'],
 ['分词与变换','内容 → 词元或其他特征','分词器/变换版本、随机种子与长度'],
 ['采样与分流','样本ID → rank/worker序列','重复、遗漏、补齐和顺序'],
 ['组批与collate','多个样本 → 对齐张量','padding、mask、位置与标签'],
 ['交付与消费','主机批次 → 当前训练步','真正被消费的ID、有效目标与步数']])+
 para('读文件成功、批次交付成功和样本参与一次有效更新，是三个时点。预取队列里的数据可能尚未训练，当前微批也可能在梯度累积完成前中断。统计进展和恢复游标时，必须先定义“已完成”到哪一层。单纯把读取位置存为检查点，会跳过读了却还没消费的数据。')+'</div>');

const inputSampler=infraReadableHTML(
 knowledgeSubhead('11个样本分给2个rank：两层drop_last分别在哪里生效')+
 para('固定样本ID为0到10，shuffle=False，两个rank，batch_size=4。DistributedSampler默认可补齐索引，使两个rank获得相同数量的样本。本例先把序列补成12项，末尾再加一个0，再交错分配：rank0得到[0,2,4,6,8,10]，rank1得到[1,3,5,7,9,0]。唯一ID有11个，实际交付12次；这是一项明确的补齐规则，不是数据源真的有12条不同记录。')+
 table(['Sampler丢尾','Loader丢尾','每rank分到的项数 / 交付批数','总交付与缺失'],[
 ['False','False','各6项 → 两批，大小4+2','12次，0重复一次，不漏ID'],
 ['True','False','各5项 → 两批，大小4+1','10次，漏ID 10'],
 ['False','True','各6项 → 只交付首批4项','8次，漏8/9/10'],
 ['True','True','各5项 → 只交付首批4项','8次，漏8/9/10']])+
 code('固定版本接口用法 · Sampler可与batch_size一起使用','PYTHON',
 'sampler = DistributedSampler(dataset, num_replicas=2, rank=rank,\n                             shuffle=True, seed=17, drop_last=False)\nloader = DataLoader(dataset, sampler=sampler, batch_size=4,\n                    drop_last=False, num_workers=2)\nfor epoch in range(epochs):\n    sampler.set_epoch(epoch)  # 在创建本轮迭代器前设置\n    for batch in loader:\n        train_step(batch)\n# 若显式传batch_sampler，则按其互斥规则配置其他组批参数')+
 para('Sampler的drop_last处理“整个数据集能否均分给rank”；DataLoader的drop_last处理“某个交付批次是否够batch_size”。两者不能只写成一个“丢尾开关”。如果每个rank都不用分布式Sampler，可能每个进程完整读11项，合计22次。若shuffle开启却不调用set_epoch，本例两轮仍会使用相同排列；改变epoch才得到下一份可复现排列。',
 '样本数相同仍不足以证明损失权重正确。补齐的重复ID会再次贡献训练，验证集也可能因此重复计分；变长样本的有效词元数不同，平均每rank损失再求均值未必等于全部有效词元的均值。明确训练、验证与最后一批的口径，再选择补齐、丢尾或带权汇总。'));

const inputWorkers=infraReadableHTML(
 '<div class="mechanism-core" id="input-worker-batch-count">'+knowledgeSubhead('流式分流还要切worker；不重不漏后再查批次数')+
 figure('v23-sampler-worker-batches','上半为Map-style实际索引；下半为Iterable实际worker批次。样本覆盖与训练步数一致是两项独立检查。')+
 para('设每个rank有两个worker，world_size=2。若迭代器只按index % 2 == rank过滤，同rank的两个worker会重复产出相同序列。对本章有限的固定样本流，可把全局worker编号定为rank×num_workers+worker_id，再保留index % (world_size×num_workers)等于此编号的项。真实对象存储更常按分片或源分区分工，避免每个worker都从头扫描全部数据；还要定义worker数量变化后的接管和去重。')+
 code('本章固定流的分流核心 · 完整实现见实验','PYTHON',
 'info = get_worker_info()\nworkers = info.num_workers if info else 1\nworker_id = info.id if info else 0\npartitions = world_size * workers\nmy_partition = rank * workers + worker_id\nfor index, value in enumerate(source):\n    if index % partitions == my_partition:\n        yield value')+
 para('分流正确后，rank0的两个worker分别有[0,4,8]和[1,5,9]，rank1则为[2,6,10]和[3,7]。batch_size=2且保留尾批时，四个worker分别交付2、2、2、1批，于是两个rank总批数是4与3。所有11个ID都出现一次，仍不意味着两个rank有相同步数。本实验只在加载结束后做一次集合通信，因此不会把不等批次写成一个必然卡死的演示；若训练循环每批都要求各rank进入同一集合操作，就必须另行处理不等输入。',
 'IterableDataset多worker的drop_last按各worker副本的尾批处理。本例三个只含1项的尾批被丢弃，剩[0,4]、[1,5]、[2,6]、[3,7]，两个rank各2批，总计8项。选择固定步数、受控补齐或框架支持的不等输入协议后，还要核对损失归一化与同步语义；不能看到“进程不再等待”就认定数据训练正确。')+'</div>');

const inputPacking=infraReadableHTML(
 knowledgeSubhead('padding与packing：先写训练目标，再决定边界')+
 para('padding把短样本补到统一长度，便于组成规则张量；padding位置通常不应参与相同的损失统计，还要按模型要求设置注意力mask。packing把多个短样本放进同一物理序列，可能减少空位置，却会改变文档邻接。目标若要求各文档独立，就要分别处理注意力、位置与预测标签；目标若有意允许跨文档训练，也应明确这是另一份任务契约。',
 '本例文档A=[11,12,EOS]，B=[21,EOS]。独立的下一词元目标有A0预测A1、A1预测EOS、B0预测EOS，共3个。直接串成一段并整体右移，会额外产生A的EOS预测B0，变成4个目标；EOS只是词元，不能自动把该位置的label设为忽略，也不会自动阻断B对A的注意力。')+
 figure('v23-packing-mask','本例契约为独立文档：允许注意力的位置必须同时满足“不看未来”和“文档相同”，跨文档预测目标设为忽略。')+
 code('本例显式边界 · 数值实验按同一约定计算','TEXT',
 'tokens       = [11, 12, EOS, 21, EOS]\ndocument_ids = [ 0,  0,   0,  1,   1]\npositions    = [ 0,  1,   2,  0,   1]\nshifted_y    = [12, EOS, -100, EOS]\nallowed(i,j) = (j <= i) and (document_ids[j] == document_ids[i])\n# 最后一个位置没有本段下一词元目标；-100为本例损失忽略值')+
 para('位置编号是否重置取决于模型与训练语义。本例采用对绝对位置敏感的教学向量，按文档归零才与独立计算一致；不能把这个数值结果直接外推成“所有RoPE模型延续编号都会算错”。某些纯相对位置机制在满足条件时对共同平移不敏感，实际还受位置缩放、实现和模型契约影响。验证应直接比较预期参考输出和实际模型输入，而不是只检查数组有没有EOS。',
 '有效词元吞吐应只统计本轮真正参与目标的项，并说明时间窗口。padding比例降低，可能减少无效算量，却不保证步耗时同比降低；打包索引、变长内核和内存访问也有成本。先确认目标、边界和损失分母相同，再谈性能收益。'));

const inputSupply=infraReadableHTML(
 knowledgeSubhead('供给速度、缓冲与重叠，用同一单位计算')+
 para('读取端可报bytes/s或对象/s，变换端可报samples/s，模型端还可能报有效tokens/s。若一批64样本，设备平均80ms消费一批，需求是12.5批/s，即800样本/s；数据端100ms才交付一批，只能10批/s，即640样本/s。已就绪缓冲有8批，在恒定供需且忽略其他因素时，会按2.5批/s消耗，约3.2秒后见底。设置prefetch_factor=8不等于已经准备好8批，计划任务、正在处理和可消费缓冲要分开。',
 '以同一节点4个rank、每rank4个worker、prefetch_factor=2为题，计划中的预取批次为4×4×2=32。如果每批都达到32MiB，仅这些批次同时物化就可能约1GiB；原始解码对象、进程副本、拼接临时区、共享内存和页锁定副本还另计。这个估算不是所有预取任务已经占满内存的证明，也不是进程RSS的精确预测。增worker要同时观察CPU、存储并发、内存、共享内存和批次尾延迟。')+
 table(['对照','固定什么','能回答什么'],[
 ['A：设备侧固定张量','shape、dtype、模型与同步口径','设备计算的参考路径'],
 ['B：内存中同shape批次','模型与shape一致，加入交付与搬运','相对A增加的整体输入路径'],
 ['C：真实存储与变换','保持任务、分布和测量窗口一致','实际生产式输入额外影响']])+
 para('若A、B、C分别为120、145、210ms，25ms和65ms是这三条路径的差值，不能直接命名为“PCIe耗时”和“对象存储耗时”，因为阶段重叠、CPU调度和shape分布都可能改变。pin_memory提供页锁定主机内存，non_blocking请求允许的异步行为；它们不会自动证明拷贝与计算有效重叠，仍须检查流、依赖、硬件和时间线。',
 '串行读取4ms、变换6ms、计算10ms，一批合计20ms；理想完全流水、资源独立且供给稳定时，稳态间隔下界可到最慢阶段10ms，首批仍需经过完整依赖。若共享CPU、链路竞争或发生长尾，这个理想下界就不能当作实测速度。先找关键路径，再优化其中真正阻塞消费的阶段。'));

const inputRecovery=infraReadableHTML(
 knowledgeSubhead('可恢复进展绑定消费语义，而非最近读到哪个文件')+
 para('可追溯输入至少包括分片清单与内容版本、Dataset和变换版本、分词器、采样种子与epoch、rank/worker分工及尾批规则。随机变换还要说明不同进程、worker与epoch如何形成可复现随机状态。仅固定主进程种子，不等于任意并行加载、随机变换和库版本下都逐步相同。',
 '恢复先定义检查点在训练哪个安全边界形成。本站最小DDP程序明确采用epoch边界恢复；不能把它描述成可从任意worker预取位置无缝继续。若要中途恢复，必须将已提交的优化器进展与输入消费位置、梯度累积状态、随机状态关联起来，并处理已读未用及重新分流。world_size变化后，各rank局部索引也可能不再适用。',
 '判断慢rank时，先查看它何时取得下一批、何时到达集合通信，再比较等待。假定各rank独立、每步都有1%概率输入停顿，8个rank至少一个停顿的概率是1−0.99⁸，约7.73%；现实的共享存储与网络故障经常相关，不能照搬独立假设。NCCL等待可以是其他rank输入迟到的结果；换通信参数前，先用样本与批次时间线核对。')+
 linkTo('checkpoint-recovery','继续学习完整检查点与一致恢复')+
 linkTo('multinode-lab','把输入口径接到多机训练验收'));

const inputPractice=infraReadableHTML(
 knowledgeSubhead('实战一：真实rank与worker，逐个ID核对')+nitLab('sampler_coverage.py')+
 para('先不运行程序，独立写出四种drop_last组合的索引和批次。再与validation.json中的ranks逐项比较，不能只对总条数。改变dataset_size或batch_size时，先更新预期覆盖和同步条件，再修改程序断言；原程序断言固定11项，不把换参数后断言失败误认为PyTorch故障。程序另对shuffle做epoch0、未设置新epoch、epoch1三次比较。',
 '变化题：把Map-style的batch_size改为3，在Sampler补齐模式中每rank正好6项，因此Loader丢不丢尾均交付两批，总交付12次，重复0仍在。Iterable场景不能直接套用这条结论，仍要逐worker计算。再回答：不重不漏、各rank样本数相近、各rank批数相同、各rank有效目标权重相同，哪几项已经被你的检查证明？分别列出。')+
 knowledgeSubhead('实战二：打包前后比较完整注意力输出')+nitLab('packing_boundaries.py')+
 para('先看文档B第一个位置：独立计算时它只能看到自己；普通因果mask却让它同时看到A的三个位置。再看把B的位置改成3、4时，本例绝对位置向量怎样变化。运行结果应显示正确打包与逐文档计算完全一致，两个错误对照均有明显差别。',
 '这两份实验验证样本分配与固定数学，不证明实际GPU吞吐或任意模型打包正确。接入真实训练时，把样本ID、有效label数量、模型位置/mask契约和恢复边界一起带到测试中，再用同任务、同精度和同质量口径比较性能。'));

{
 const a=articles.find(a=>a.id==='data-pipeline');
 a.sections=[
  ['数据对象：Dataset、Sampler、批次与worker',inputObjects],
  ['跨rank分片：补齐、两层丢尾与epoch',inputSampler],
  ['多worker流式输入：覆盖正确后还要核对步数',inputWorkers],
  ['样本打包：注意力、位置与损失目标',inputPacking],
  ['供给能力：速率、缓冲、内存与流水重叠',inputSupply],
  ['恢复与长尾：消费进展、输入版本与慢rank',inputRecovery],
  ['实战与变化题：实际分流和打包数值对照',inputPractice]
 ];
 a.refs=[...new Set([...a.refs,'v23Data'])];a.minutes=55;a.updated='2026.11.04';
}
infraDomain('training').points.find(p=>p.id==='tr-input').body=inputObjects+inputSampler+inputWorkers+inputPacking+inputSupply+inputRecovery+
 para('用<a href="/article/data-pipeline/#native-prefetch-resume">两个 DataLoader worker 的恢复实验</a>核对组批记录和优化器更新记录。把 worker 的进度拿去恢复，会跳过已准备、还没训练的四批样本。');
infraDomain('training').refs=[...new Set([...infraDomain('training').refs,'v23Data'])];
const trainingCasesBeforeNIT=infraFieldCases.training;
infraFieldCases.training=()=>'<h3>先证明输入：样本覆盖、worker与批次数</h3>'+nitLab('sampler_coverage.py',false)+
 linkTo('data-pipeline','阅读输入机制及两份完整实验')+trainingCasesBeforeNIT();

