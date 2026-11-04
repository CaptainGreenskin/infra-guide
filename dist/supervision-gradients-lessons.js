/* A single toy vocabulary connects visible positions, parameter use and loss weights. */
const supervisionGradientLinks='<p class="practice-links"><a href="labs/supervision-gradients.zip" download>下载标签与共享梯度实验 ↓</a><a href="labs/supervision-gradients/README.md" target="_blank" rel="noopener">环境与逐项运行说明 ↗</a><a href="labs/supervision-gradients/validation.json" target="_blank" rel="noopener">实际数值与源码摘要 ↗</a></p>';
{
 const a=articles.find(a=>a.id==='tokenization-embedding');
 a.sections[4][1]+=figure('v34-label-alignment','先按列读：当前位置输入什么、应预测哪一个目标。右侧填充不计监督，真实 EOS 保留；键标记与损失位置分别判断。');
 a.sections[6][1]+='<h3>padding 行是否更新，要检查参数的全部用途</h3>'+para(
  '给输入查表设置 padding_idx=0，只能说明该次查表反向不给第 0 行贡献。共享输出矩阵仍会用第 0 行计算候选 PAD 的分数；每个真实目标位置的 softmax 分母包含这个候选，因而输出路径可能给它梯度。这个开关没有把共享参数的整行从优化器中冻结。',
  '沿本章两条输入、六项有效标签继续算，仍取 H=E[id]/2。程序分别保留输入路径、输出路径和两条共同路径，三次前向数值相同；用 detach 只切断被隔离路径的导数。检查三份梯度是否逐元素满足“共同 = 输入 + 输出”，再把每一项与手写链式法则和中心差分比较。')+
  figure('v34-shared-embedding-grad','本机 PyTorch 2.5.1、CPU/float64 的实际梯度账本。普通 SGD、学习率 0.1、无权重衰减；没有把结果推广成所有优化器或真实模型的训练行为。')+
  para('这次第 0 行输入贡献是 [0,0]，输出贡献约为 [0.029895,0.027481]，一次 SGD 后从 [0,0] 变为约 [−0.002990,−0.002748]。第 4 行“端”没出现在输入中，也仍会从输出候选路径收到梯度。前面手工指定上游导数的“第 5 行相加”是另一道练习，其 [0.5,−0.3] 不能拿来冒充本次交叉熵的数值。');
 a.sections[8][1]+='<h3>继续实测：共享参数的三路梯度</h3>'+para(
  '先保留上面的标准库分词与前向实验，再运行这份独立程序。默认模式需要已有 PyTorch 2.5.1 环境；本次是 Python 3.12.13、CPU、float64、单线程，没有下载权重。只看独立手算与数值差分时，可用 Python 3.9+ 的标准库模式。')+
  code('解压后进入 supervision-gradients 目录','SHELL','python supervision_gradients.py\npython3 supervision_gradients.py --reference-only')+
  table(['本次实际检查','结果'],[['与原前向实验的均值交叉熵','2.352920745976079；有效目标 6 项'],['输入 / 输出 / 共同梯度','全部 16 项对照显式链式法则'],['中心差分与共同梯度','16 项最大误差约 3.4e−11'],['单独 PAD 查表，上游给全 1','第 0 行梯度仍为 [0,0]'],['共享输出后的一次 SGD','第 0 行实际改变']])+
  para('该模型刻意只有局部查表和线性输出，没有实现注意力、位置编码、因果语言模型或完整训练。标准库模式核对参考算式；实际自动求导与更新由默认 PyTorch 模式完成。跨 Python 数学库的末位舍入允许 1e−12 的绝对/相对容差。')+
  supervisionGradientLinks+'<details class="full-code"><summary>展开完整 supervision_gradients.py：与下载文件一致</summary>'+code('supervision_gradients.py','PYTHON',supervisionGradientFiles['supervision_gradients.py'])+'</details>';
 a.updated='2026.11.05';a.minutes=55;
 a.check.push('区分输入 padding 查表、损失忽略位置与共享输出候选的梯度');
 a.sections=a.sections.map(([title,body])=>[title,infraReadableHTML(body)]);
}
{
 const a=articles.find(a=>a.id==='autograd-training');
 const section=a.sections.find(s=>s[0].includes('微批不等长'));
 if(!section)throw Error('Missing unequal-supervision mechanism');
 section[1]+=figure('v34-microbatch-denominators','独立标量例子：一项与三项监督，原始单项梯度为 1、−2、−2、−2。两种权重产生两种目标，程序实际复核 loss、梯度与一次 SGD。')+
  '<h3>把同一个目标分别做整批与两次反向</h3>'+para(
  '配套共享梯度程序末尾另开一个标量实验，保持 w=1、学习率 0.1。整批按四项平均，或两次对各批损失之和除以同一个 4 后反向，两路都得到 loss=1.625、梯度 −1.25，最后 w=1.125。把两批局部均值等权平均则得到 loss=1.25、梯度 −0.5，最后 w=1.05。一次更新窗内只在最后 step，才能比较同一个初值。',
  '这里没有要求所有任务必须按 token 等权；若需求就是每条序列等权，应明确写出另一个目标，再验证实现。不能目标写全窗口有效项等权，代码却悄悄改成每个微批等权。这个例子没有 DDP 平均、混合精度、裁剪或优化器动量，相关因子在对应章节分别推导。')+
  supervisionGradientLinks+linkTo('tokenization-embedding','查看共享词表、六项监督与完整实验源码');
 a.updated='2026.11.05';a.minutes=55;
 a.sections=a.sections.map(([title,body])=>[title,infraReadableHTML(body)]);
}
{
 const p=infraKnowledgeDomains.flatMap(d=>d.points).find(p=>p.id==='mf-autograd');
 p.body+=para('补充图解与独立验证：先区分共享参数的两条反向路径，再区分有效项与微批的平均权重。两幅图来自不同输入：共享词表有六项交叉熵监督；不等长微批例子另有四项平方损失。')+
  linkTo('tokenization-embedding','沿标签位置追踪共享梯度')+linkTo('autograd-training','推导不等长微批的共同分母');
}
