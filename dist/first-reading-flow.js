/* First reading: identify the components before calculations, contracts and failure cases. */
function conceptReadingTable(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
const firstReadingChanges=[];
{
 const a=articleById('transformer-model'),section=a.sections[0],before=section[1];
 const overview=before.match(/<figure\b[\s\S]*?<\/figure>/)?.[0];
 const blockFlow=a.sections[3][1].match(/<figure\b[\s\S]*?<\/figure>/)?.[0];
 if(!overview||!overview.includes('v42-ai-concepts.svg'))throw Error('Missing model overview figure');
 if(!blockFlow||!blockFlow.includes('v9-model-flow.svg'))throw Error('Missing decoder block flow figure');
 section[1]=`<h3 id="text-to-next-token">一句话怎样变成下一词元的预测</h3>`+para(
 '把「红 圆」译成英文时，模型怎样先选出 red，再选出 circle？每一步都要结合已有内容，为下一项的候选打分。Transformer 是组织这套序列计算的一种结构。可以先认清下面的部件，再<a href="/article/transformer-model/#translation-reading-path">跟同一句翻译走完三轮</a>。',
 '分词器先把文本切成词元（token），再按词表给每个词元查出编号。词元可以是字、词片段或字节片段。模型收到编号后，词嵌入表把每个编号换成向量，也就是一组参与计算的数字。向量经过多层处理，最后变成每个候选编号的得分，称为 logits。生成程序按规则选出一个编号，接到已有序列后面，再预测下一项。这种逐项续写叫自回归生成。')+
 conceptReadingTable(['组件','负责什么','在模型中的关系'],[
  ['分词器与词表','把文本片段转换为编号','为词嵌入提供查表编号'],
  ['词嵌入 <code>Embedding</code>','把编号查成向量','产生每个位置的初始表示'],
  ['位置机制','让表示包含先后位置信息','本例把位置向量加到词嵌入上'],
  ['注意力 <code>Attention</code>','从允许看到的位置汇总信息','让不同位置之间交换信息'],
  ['前馈网络 <code>FFN</code>','分别变换每个位置的特征','接着加工注意力汇总后的表示'],
  ['归一化','按规则调整特征的数值尺度','用于注意力和前馈等变换附近'],
  ['残差连接','把分支输出与原表示相加','保留直接路径，连接连续的计算层'],
  ['输出投影','为词表中的每个候选编号打分','分数用于计算训练损失或选择下一项']
 ])+
 para('图里的参数是模型反复使用、能通过学习调整的数字。训练时，先用参数计算预测，再与目标比较得到损失。梯度描述改变参数会怎样影响损失，优化器据此更新参数。推理时，参数固定，系统把输入变成预测结果。')+overview+
 `<h3 id="sequence-models">循环、卷积和注意力怎样传递前文</h3>`+
 para('把「红牌、蓝牌、绿牌、找红」当成四个示意词元。第 4 格要利用第 1 格的红牌。这里只允许每格读取自己和前文。前面的信息怎样到达第 4 格，取决于这一层连接了哪些位置。',
 '循环神经网络（RNN）为每格计算一个状态，也就是要传给下一格的一组数字。普通单向 RNN 用本格输入和上一格状态算出新状态。红牌的信息可以从状态 1 依次传到状态 4，中间各格都要等前一格算完。',
 '卷积神经网络（CNN）把同一组系数沿序列滑动。设每个窗口只取本格和前一格，系数按相对位置固定。第 4 格的一层输出只读第 3、4 格。叠两层时，第 2 格能经第 3 格的上一层输出传入。按同样规则叠三层，第 1 格的信息才传得到。',
 '自注意力在同一条序列内汇总信息。第 4 格直接把自己的表示和第 1 至 4 格做匹配，按分数分配权重。下面两组权重是题设。末格是「找红」时取 [0.6, 0.1, 0.1, 0.2]，换成「找蓝」时取 [0.1, 0.6, 0.1, 0.2]。只跟踪红色标记这一项，四格供给 [1, 0, 0, 0]，汇总结果便从 0.6 变为 0.1。两次的可读范围一样，变的是分给各格的权重。')+
 trainingFigure('sequence-models','同一四格输入传向第 4 格的三种路径。图中权重对应「找红」的示意算例。')+
 para('输入已经给定时，卷积和自注意力可并行算同一层的多个位置。全范围注意力能在一层内连接相隔很远的合法位置，也要对更多位置打分。逐词生成时仍要等上一步选出词元，第 7、8 节会分别解释生成顺序与注意力的计算量。<a href="/article/attention-mechanics/#section-1">从一个查询开始手算注意力的权重 →</a>')+
 '<p class="source-at"><a href="https://doi.org/10.1207/s15516709cog1402_1">循环状态原论文</a> · <a href="https://proceedings.mlr.press/v70/gehring17a.html">序列卷积原论文</a> · <a href="https://arxiv.org/html/1706.03762v7#S4">Transformer 原论文的路径对照</a></p>'+
 `<h3 id="transformer-architecture-choices">三种架构的区别在于谁能读取谁</h3>`+
 para('注意力让一个位置从一组允许读取的位置汇总信息。同一条序列内部读取叫自注意力，从另一条序列的表示中读取叫交叉注意力。翻译时，中文是源序列，已经有的英文是目标前缀。三种结构对输入的组织方式不同。')+
 conceptReadingTable(['结构','位置能读取什么','任务例子'],[
  ['仅编码器（Encoder-only）','同一输入内的左右上下文都可参与计算，填充位置可被屏蔽','用整句表示做分类，如 <a href="https://arxiv.org/abs/1810.04805">BERT</a>'],
  ['编码器与解码器（Encoder–Decoder）','编码器先整理源句。解码器用自注意力读取目标前缀，再用得到的目标表示查询源句表示','先读完整中文，再逐步生成英文，如 <a href="https://arxiv.org/abs/1706.03762">原始 Transformer</a>'],
  ['仅解码器（Decoder-only）','指令、原文和已生成文本在一条序列里，每个位置只读自己及之前的位置','接在「把红 圆翻译成英文」后续写，如 <a href="https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf">GPT</a>']
 ])+
 `<h3 id="translation-reading-path">沿一句「红 圆」走完 Transformer</h3>`+
 para('先看源端。实验把「红」和「圆」分别查成向量，加上各自的位置向量。编码器用自注意力让两个位置互相读取，得到两条带上下文的源表示。接下来，解码器每次都能查询这两条表示。',
 '再看训练输入怎样构造。BOS 标记开始，EOS 标记结束。若用 red circle 做训练样本，目标输入是 [BOS, red, circle]，预测标签是 [red, circle, EOS]。每行预测下一项。预测 circle 的那一行只能从目标侧读到 [BOS, red]。限制每个位置只能读自己与前文的规则叫因果约束。训练时把正确的前缀交给模型，叫教师强制（teacher forcing）。',
 '这一行再用交叉注意力从「红」「圆」两条源表示汇总信息。一套独立的匹配与汇总叫一个注意力头。对每个头，三个目标位置各产生一行分数，两个源位置各占一列。')+
 '<div class="translation-reading-trace">'+conceptReadingTable(['轮次','本轮目标输入','选出的词'],[
  ['1','[BOS]','red'],['2','[BOS, red]','circle'],['3','[BOS, red, circle]','EOS，结束']
 ])+'</div>'+
 para('「红 圆」实际留作测试。表里的词由 CPU 实验逐轮选出。生成时只给源句和 BOS，解码器每轮把自己选出的词接回目标输入。固定第二轮的 [BOS, red]，把源句改成「红 方」，下一词就从 circle 变为 square。圆和方的差别来自源端，交叉注意力负责把源端信息传给当前预测。<a href="/article/transformer-model/#encoder-decoder-translation">用可运行的翻译小模型检查两侧输入与掩码 →</a>')+
 `<h3 id="ai-infra-map">AI Infra 全貌与四条学习线</h3>`+
 para('做 AI Infra 时，先沿一条数据路径辨认模型在算什么，再按工程问题分流。矩阵乘法是把一组特征转换成另一组特征的基本运算，算子是执行这类运算的程序单元。训练和推理都调用算子，但各自还要管理不同的状态。')+
 conceptReadingTable(['学习线','沿同一个模型追什么','从哪章继续'],[
  ['模型基础','编号怎样变成向量，向量怎样读取上下文，最后怎样得出候选分数','<a href="/article/tokenization-embedding/">词元与嵌入</a> → <a href="/article/attention-mechanics/">注意力</a> → <a href="/article/transformer-block/">完整解码器块</a>'],
  ['GPU 与算子','矩阵乘法和注意力怎样落到 GPU 的计算与存储。序列变长时，哪些数字值得留在芯片上继续用','<a href="/article/gpu-execution/">GPU 怎样执行算子</a> → <a href="/article/operator-profiling/">实现、测量与验证</a>'],
  ['分布式训练与作业平台','样本怎样分给各个进程，多个设备怎样合成同一次更新，作业如何启动及从保存的状态继续','<a href="/article/gpu-cluster/">一次训练的全过程</a> → <a href="/article/training-platform/">训练作业与平台</a>'],
  ['推理与交付','已有参数怎样服务请求，逐词生成时哪些历史结果能复用，系统怎样用有限显存接更多请求','<a href="/article/model-serving/">生成与缓存</a> → <a href="/article/inference-performance/">服务性能</a> → <a href="/article/ai-lifecycle/">模型交付</a>']
 ])+
 para('需要补基础时，从本章第 2、3 节练习形状和矩阵乘法。<a href="/article/autograd-training/">用 PyTorch 跟一遍前向、反向与更新</a>，再按需要补<a href="/article/training-communication/">多进程怎样交换结果</a>。<a class="inline-link" href="/roadmap/?track=ai#route-ai">查看各方向的阅读顺序与练习 →</a>')+
 `<h3 id="tiny-decoder-input">下面用哪组输入计算</h3>`+para(
 '上面的翻译实验有独立的源端和目标端。第 2 节起切换到另一份只用解码器的小模型，在一条编号序列里计算续写。反复堆叠的单元叫解码器块（Decoder Block）。每一块先在合法范围内汇总上下文，再逐位置加工特征。',
 '本章用一组可手算的模型尺寸。词表 V=8，每个位置的特征宽度 D=8，每批样本 B=2，每条输入长度 T=4。两条原始编号序列为 [0,1,2,3,4] 和 [4,5,6,7,0]。编号在这里用于查表，所有编号都是普通词元。',
 '训练时每条取前四项作输入、后四项作目标。第一条的第 0 位看到 0，目标是 1。第 3 位看到 [0,1,2,3]，目标是 4。第 2、3 节先把这些位置和特征变成可以计算的形状，第 4 节再把各运算装回同一块。');
 a.updated='2026.11.09';firstReadingChanges.push({id:a.id,section:1,before,after:section[1]});

 const tensor=a.sections[1];
 tensor[1]=tensor[1].replace('同一块张量可以交换维度后以不同的步长读取；把 [B,T,D] 解释为 [B,T,H,d] 仅在 D=H×d 且布局兼容时简单。随后交换 head 与时间轴，再把头拼回模型轴，有时需要实际重排或复制。','交换张量的两根轴时，程序可以沿不同间隔读取同一份存储，这个间隔叫步长。第 4 节会把特征按多个注意力分支分组。分组后换轴，再合并回一根特征轴时，是否需要复制取决于实际存储布局。');

 a.sections[3][1]=`<h3 id="decoder-attention-first-pass">注意力先决定读取哪些位置，再决定读多少</h3>`+
 para('上一节的线性层只加工同一位置的特征。要把上下文带进来，就让位置之间交换信息。沿用第一条输入 [0,1,2,3]。位置 2 要预测编号 3，可读位置 0、1、2 的向量。位置 3 已经含有目标编号，必须挡住。')+
 conceptReadingTable(['位置','允许读取','被屏蔽'],[
  ['0','0','1、2、3'],['1','0、1','2、3'],['2','0、1、2','3'],['3','0、1、2、3','无']
 ])+
 para('一个注意力头是一套独立的匹配与汇总。小模型有 2 个头。每个头将同一个输入向量分别变成查询 Q、匹配键 K 和待汇总内容 V 三个向量，各有 4 项。位置 2 的 Q 与每个允许位置的 K 都做一次点积，也就是对应项相乘再相加。每个点积除以 √4=2，得到缩放后的分数。',
 '设三个合法位置的缩放分数是 [0, ln 2, ln 3]，ln 表示自然对数。Softmax 先取指数得到 [1,2,3]，再除以总和 6，得权重 [1/6,1/3,1/2]。如果三个内容向量的某个分量分别是 6、0、2，汇总后的这一项就是 6/6+0/3+2/2=2。其余特征同理，禁止读取的位置权重为零。',
 '各头汇总结果拼回 8 项，再经输出投影。第 6 节把分数记作 [B,H,T,T]，H=2 是头数，两根 T 轴分别是查询位置和候选位置。这里的 V 表示内容向量，V=8 表示词表大小。<a href="/article/attention-mechanics/">逐行手算 Q、K、V 与多头注意力 →</a>')+
 `<h3 id="decoder-ffn-position">位置说明先后，前馈加工汇总后的特征</h3>`+
 para('两个相同编号会查到同一条词嵌入。为了让模型还能区分“同一个词出现在第几格”，本例在进块前加上位置向量。另一种方法是旋转位置编码（RoPE），它在注意力里按位置旋转 Q、K，使匹配分数能随相对位置改变。掩码确定可见范围，位置机制给合法的匹配加入顺序信息。<a href="/article/position-encoding/">从二维旋转推导 RoPE →</a>',
 '前馈网络（FFN）在每个位置独立使用同一组权重。普通 FFN 把 8 项特征扩到 12 项，再用激活函数改变中间值，例如把负数置零，最后压回 8 项。去掉非线性激活后，两次投影可以合成一次，偏置也可以合并。小模型的实际代码用 SwiGLU，在中间引入另一组由输入计算的系数来调节各项特征。这里的 12 是本实验的宽度，实际模型按配置选择。')+
 `<h3 id="decoder-block-order">两次回加怎样组成一层</h3>`+
 para('进入这一块的表示记为 X，形状是 [2,4,8]。归一化按一个位置自己的特征调整数值尺度。LayerNorm 先减去特征均值，再除以方差加小常数后的平方根。本例用 RMSNorm，分母换成各项平方的均值加小常数后的平方根，也省去减均值。两种操作都保持特征数，并用可学习的系数缩放。LayerNorm 还可以学习一项偏置。')+
 para('例如用 [1,3] 代表同一个位置的两项特征，暂取缩放系数为 1、偏置和小常数为 0。LayerNorm 减去均值 2，除以标准差 1，得到 [−1,1]。RMSNorm 保留原分子，除以 √((1²+3²)/2)=√5，得到 [1/√5,3/√5]。',
 '本例在分支之前归一化。先把 X 归一化交给注意力，结果加回 X 得到 H₁。再把 H₁ 归一化交给前馈，结果加回 H₁ 得到 H₂。这两次把分支结果加回输入的动作叫残差连接。一个分支输出全零时，对应加法保留原表示。前馈分支的来源是第一次相加后的 H₁，所以它加工的是已经包含上下文的表示。',
 '两个分支内部可以分头或扩宽，回加前要恢复同一 [B,T,D] 坐标。H₂ 可以直接接下一块。各层可拥有各自的参数，最后一块的输出经过归一化与词表投影，得到每位置 V 个候选分数。<a href="/article/transformer-block/">跟代码核对两次回加与完整前向 →</a>')+blockFlow;

 a.sections[6][1]=`<h3 id="training-versus-generation">同一次前向在训练和生成里有什么用</h3>`+
 para('训练时，输入 [0,1,2,3] 和目标 [1,2,3,4] 已经给定。模型可以一次算出四行分数，每行遵守第 4 节的可见范围。将有效目标对应的行纳入损失，梯度沿运算路径返回参数，优化器完成更新。',
 '生成只给提示，下一项要从当前最后一行的分数中选。生成程序得到一个编号后，才知道下一次前向需要处理什么。CPU 对照实验让同一小模型从固定初值完成一次更新，其中两条序列分别保留 1 项和 3 项有效目标。冻结参数后，给定提示 [0,1]，每轮取分数最大的编号。')+
 conceptReadingTable(['阶段','本轮送入模型','本轮选出的编号','计算结束时已有几格缓存'],[
  ['读提示（prefill）','[0,1]','1','2'],['逐词生成（decode）','上一轮选出的 1','1','3'],['逐词生成（decode）','上一轮选出的 1','1','4']
 ])+
 para('第 1 节在翻译里看到的教师强制，同样适用于这里只用解码器的模型。训练序列是 [0,1,2,3]，第 3 个输入读到数据给出的 2。生成从 [0,1] 起步，第一轮选出了 1，第 3 个输入因此是 1。提示之后新增的部分来自模型自己的输出。')+
 para('缓存保存已经算过的匹配键 K 和内容 V，合称 KV Cache。因为过去位置读不到未来，追加词元后，旧位置在固定参数和相同可见规则下的 K、V 可以复用。新位置仍要计算自己的 Q、K、V，再用自己的 Q 匹配包括历史在内的合法位置。最后一轮选出的 1 已经可以输出，但尚未作为输入完成前向，所以完整序列长度为 5，缓存长度为 4。实验在第三次选词后结束，位置表的四个位置正好用完。<a href="labs/sdpa-cache/validation.json">查看实际 CPU 记录中的 generation →</a>',
 '按单请求、单层估算，2 个头、每头 4 项、每项 2 字节，每缓存一格要为 K 和 V 共留 2×2×4×2=32 字节。第 3 轮的四格共 128 字节。这个预算按两字节格式假设计算，实验实际采用 CPU 双精度。增加层数或同时服务更多请求，需把对应的缓存项一起计入。<a href="/article/model-serving/">继续看缓存容量、批处理与显存分配 →</a>')+
 '<details><summary>如果只生成两个词元，序列与缓存分别有多长？</summary>'+para('完整序列有 4 项，包含 2 项提示和 2 项新输出。缓存有 3 格，因为第 2 个新输出是在本轮结束时选出的，下一轮才会处理它。')+'</details>'+
 `<h3 id="model-compute-to-infra">沿着瓶颈选择优化对象</h3>`+
 para('注意力先算位置间分数，再拿分数得到汇总。如果把每个中间结果都写回显存再读回来，长序列会产生大量搬运。FlashAttention 按块计算和合并归一化统计，减少完整中间矩阵的搬运。它与第 6 节的分数形状对应，<a href="/article/flash-attention-io/">下一步可以推导分块如何保持同一注意力结果</a>。',
 '设备放不下一层的矩阵时，可以让不同设备各算部分输出列，再按需要交换结果，这叫张量并行。数据并行则让模型副本各读一部分样本，合成用于同一次更新的梯度。前者切计算，后者分样本。读到“多卡更快”时，先问拆开的是哪一项，以及哪一步需要各设备等到彼此。<a href="/article/tensor-parallel-math/">看分片矩阵怎样合成</a> · <a href="/article/distributed-training/">看多个副本怎样完成一次更新</a>。');

 a.sections[8][1]+='<h3 id="encoder-decoder-translation">把源句编码、目标右移和逐词翻译跑一遍</h3>'+para(
 '回到第 1 节的「红 圆」翻译模型。它有一层编码器、一层解码器，两侧各有词嵌入表，位置用固定正弦和余弦表示。编码器输出的源表示在代码里叫 <code>memory</code>。现在把“红”和“红 方”放到同一批，检查长短句怎样一起计算。',
 '长句按第 1 节的规则构造目标输入 [BOS, red, square] 和标签 [red, square, EOS]。短句少一个源词，也少一个目标位置。用 PAD 把批内长度补齐后，注意力和损失需要分别处理这些填充位置。')+
 trainingFigure('encoder-decoder-translation','混合批的两条样本。交叉注意力矩阵的行来自目标，列来自源。')+
 conceptReadingTable(['计算','读取范围','掩码从哪里来'],[
  ['源端自注意力','每个源位置可读取全部有效源词','源端 PAD 挡住填充列'],
  ['目标自注意力','每个目标位置读取自己与更早的有效目标词','上三角挡住未来，目标端 PAD 挡住填充列'],
  ['交叉注意力','每个目标位置查询全部有效源词','源端 PAD 再挡一次源端填充列']
 ])+
 para('填充掩码屏蔽被读取的列。短句的第三个目标查询行仍有计算，但该行标签为 PAD，交叉熵会跳过它。这个批次有 2 条样本、4 个头、3 个目标位置、2 个源位置。交叉注意力权重形状为 [2,4,3,2]，每头每行沿最后一根源位置轴归一化。短句只有“红”一列有效，权重就是 [1,0]。')+
 trainingCode('源码节选：目标前缀产生查询，源端提供键和值','PYTHON',`def decode(self, target, memory, source_padding, target_padding, causal=True):
    x = self.target_context(target, target_padding, causal)
    read, _ = self.cross_attention(
        x, memory, memory, key_padding_mask=source_padding, need_weights=False
    )
    x = self.decoder_norm[1](x + read)
    return self.to_logits(self.decoder_norm[2](x + self.decoder_ffn(x)))`)+
 para('程序用 20 条合成样本做 400 次 Adam 参数更新。验收先换掉未来目标词、源端填充值，检查受保护的结果是否保持一致。要单独检查目标填充掩码，就把 PAD 放在 [BOS, PAD, square] 中间。最后一行的因果掩码允许读前面的 PAD，此时才看得出目标填充掩码的独立作用。程序也用投影和矩阵乘法独立重算交叉注意力，核对权重与输出。',
 '生成时只先给 BOS，取最后一行分数最高的词作为下一项。训练中未出现的组合“红 圆”依次生成 red、circle、EOS。把目标前缀都固定为 [BOS, red]，源端换成“红 方”，下一个词改为 square。记录保留每步输入与所选词，以及四条留出组合的结果。实验验证固定词表上的数据流与读写范围。')+
 trainingCode('解压后在实验目录运行，使用 Python 3.12 与 PyTorch 2.5.1','SHELL','python -B encoder_decoder.py > my-validation.json')+
 '<p class="practice-links"><a href="labs/encoder-decoder.zip" download>下载源码、样本与记录 ↓</a> · <a href="labs/encoder-decoder/README.md">运行说明 →</a> · <a href="labs/encoder-decoder/validation.json">查看训练、掩码与生成记录 →</a> · <a href="https://github.com/pytorch/pytorch/blob/v2.5.1/torch/nn/modules/activation.py#L1072-L1122">PyTorch 掩码参数 ↗</a></p>';
}
{
 const a=articleById('cloud-overview'),section=a.sections[2],before=section[1];
 const replacements=[
  ['它仍不能单独保证什么','在请求路径中的作用'],
  ['<td>业务数据一定正确</td>','<td>把用户请求交给合适的应用入口</td>'],
  ['<td>下游有足够容量</td>','<td>为应用提供执行环境与资源</td>'],
  ['<td>误删后必然能恢复</td>','<td>在实例替换后继续保存和提供数据</td>'],
  ['<td>网络路径一定连通</td>','<td>判断主体可对哪些对象执行什么动作</td>'],
  ['<td>无状态和有状态系统采用同一恢复方式</td>','<td>发现不可用副本，切换或重建所需状态</td>']
 ];
 for(const[from,to]of replacements){if(!section[1].includes(from))throw Error('Missing cloud responsibility row: '+from);section[1]=section[1].replace(from,to);}
 a.updated='2026.11.08';firstReadingChanges.push({id:a.id,section:3,before,after:section[1]});
}
{
 const a=articleById('agent-runtime'),section=a.sections[0],before=section[1];
 const contract=before.match(/<div class="table-wrap">[\s\S]*?<\/table><\/div>/)?.[0];
 if(!contract||!contract.includes('契约项'))throw Error('Missing original Agent task contract');
 section[1]=before.replace('<h3>先把用户目标改写成可以验证的任务契约</h3>','<h3 id="subsection-1-1s1j8lt">模型、运行时、工具与验收器</h3>').replace(contract,'<details class="concept-task-detail"><summary>本章任务契约：数据、权限与停止预算</summary>'+contract+'</details>');
 const modelIntro='模型可以理解要求、提出读取资料或保存报告的动作；';
 if(!section[1].includes(modelIntro))throw Error('Missing Agent model introduction');
 section[1]=section[1].replace(modelIntro,'模型是根据输入生成文本或动作提议的计算组件。它可以提出读取资料或保存报告的动作；');
 const from='可以预先确定的步骤与分支，适合显式工作流；需要根据内容判断下一步的部分，可以允许模型决策。固定工作流也会有重试、权限和提交间隙；动态决策则还增加不合法提议、循环和误判完成。选择从任务的不确定性出发，先把所有方案都必须满足的任务契约写清。';
 if(!section[1].includes(from))throw Error('Missing Agent workflow comparison');
 section[1]=section[1].replace(from,'步骤和分支已知时，可以用显式工作流组织；需要根据内容选择下一步时，可以让模型提出动作。两者都由运行时维护状态、权限和停止条件。先沿本章的正常任务走完，再逐项展开这些机制。');
 a.updated='2026.11.08';firstReadingChanges.push({id:a.id,section:1,before,after:section[1]});
}
