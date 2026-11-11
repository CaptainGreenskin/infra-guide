/* First reading: identify the components before calculations, contracts and failure cases. */
function conceptReadingTable(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
const firstReadingChanges=[];
{
 const a=articleById('transformer-model'),section=a.sections[0],before=section[1];
 const overview=before.match(/<figure\b[\s\S]*?<\/figure>/)?.[0];
 const blockFlow=a.sections[3][1].match(/<figure\b[\s\S]*?<\/figure>/)?.[0];
 if(!overview||!overview.includes('v42-ai-concepts.svg'))throw Error('Missing model overview figure');
 if(!blockFlow||!blockFlow.includes('v9-model-flow.svg'))throw Error('Missing decoder block flow figure');
 const sequenceReading=`<h3 id="sequence-models">循环、卷积和注意力怎样传递前文</h3>`+
 para('把「红牌、蓝牌、绿牌、找红」当成四个示意词元。第 4 格要利用第 1 格的红牌。这里只允许每格读取自己和前文。前面的信息怎样到达第 4 格，取决于这一层连接了哪些位置。',
 '循环神经网络（RNN）为每格计算一个状态，也就是要传给下一格的一组数字。普通单向 RNN 用本格输入和上一格状态算出新状态。红牌的信息可以从状态 1 依次传到状态 4，中间各格都要等前一格算完。',
 '卷积神经网络（CNN）把同一组系数沿序列滑动。设每个窗口只取本格和前一格，系数按相对位置固定。第 4 格的一层输出只读第 3、4 格。叠两层时，第 2 格能经第 3 格的上一层输出传入。按同样规则叠三层，第 1 格的信息才传得到。',
 '自注意力在同一条序列内汇总信息。第 4 格直接把自己的表示和第 1 至 4 格做匹配，按分数分配权重。下面两组权重是题设。末格是「找红」时取 [0.6, 0.1, 0.1, 0.2]，换成「找蓝」时取 [0.1, 0.6, 0.1, 0.2]。只跟踪红色标记这一项，四格供给 [1, 0, 0, 0]，汇总结果便从 0.6 变为 0.1。两次的可读范围一样，变的是分给各格的权重。')+
 trainingFigure('sequence-models','同一四格输入传向第 4 格的三种路径。图中权重对应「找红」的示意算例。')+
 para('输入已经给定时，卷积和自注意力可并行算同一层的多个位置。全范围注意力能在一层内连接相隔很远的合法位置，也要对更多位置打分。逐词生成时仍要等上一步选出词元，第 7、8 节会分别解释生成顺序与注意力的计算量。<a href="/article/attention-mechanics/#section-1">从一个查询开始手算注意力的权重 →</a>')+
 '<p class="source-at"><a href="https://doi.org/10.1207/s15516709cog1402_1">循环状态原论文</a> · <a href="https://proceedings.mlr.press/v70/gehring17a.html">序列卷积原论文</a> · <a href="https://arxiv.org/html/1706.03762v7#S4">Transformer 原论文的路径对照</a></p>';
 const architectureReading=`<h3 id="transformer-architecture-choices">三种架构的区别在于谁能读取谁</h3>`+
 para('注意力让一个位置从一组允许读取的位置汇总信息。同一条序列内部读取叫自注意力，从另一条序列的表示中读取叫交叉注意力。翻译时，中文是源序列，已经有的英文是目标前缀。三种结构对输入的组织方式不同。')+
 conceptReadingTable(['结构','位置能读取什么','任务例子'],[
  ['仅编码器（Encoder-only）','同一输入内的左右上下文都可参与计算，填充位置可被屏蔽','用整句表示做分类，如 <a href="https://arxiv.org/abs/1810.04805">BERT</a>'],
  ['编码器与解码器（Encoder–Decoder）','编码器先整理源句。解码器用自注意力读取目标前缀，再用得到的目标表示查询源句表示','先读完整中文，再逐步生成英文，如 <a href="https://arxiv.org/abs/1706.03762">原始 Transformer</a>'],
  ['仅解码器（Decoder-only）','指令、原文和已生成文本在一条序列里，每个位置只读自己及之前的位置','接在「把红 圆翻译成英文」后续写，如 <a href="https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf">GPT</a>']
 ]);
 const translationReading=`<h3 id="translation-reading-path">沿一句「红 圆」走完 Transformer</h3>`+
 para('先看源端。实验把「红」和「圆」分别查成向量，加上各自的位置向量。编码器用自注意力让两个位置互相读取，得到两条带上下文的源表示。接下来，解码器每次都能查询这两条表示。',
 '再看训练输入怎样构造。BOS 标记开始，EOS 标记结束。若用 red circle 做训练样本，目标输入是 [BOS, red, circle]，预测标签是 [red, circle, EOS]。每行预测下一项。预测 circle 的那一行只能从目标侧读到 [BOS, red]。限制每个位置只能读自己与前文的规则叫因果约束。训练时把正确的前缀交给模型，叫教师强制（teacher forcing）。',
 '这一行再用交叉注意力从「红」「圆」两条源表示汇总信息。一套独立的匹配与汇总叫一个注意力头。对每个头，三个目标位置各产生一行分数，两个源位置各占一列。')+
 '<div class="translation-reading-trace">'+conceptReadingTable(['轮次','本轮目标输入','选出的词'],[
  ['1','[BOS]','red'],['2','[BOS, red]','circle'],['3','[BOS, red, circle]','EOS，结束']
 ])+'</div>'+
 para('「红 圆」实际留作测试。表里的词由 CPU 实验逐轮选出。生成时只给源句和 BOS，解码器每轮把自己选出的词接回目标输入。固定第二轮的 [BOS, red]，把源句改成「红 方」，下一词就从 circle 变为 square。圆和方的差别来自源端，交叉注意力负责把源端信息传给当前预测。<a href="/article/transformer-model/#encoder-decoder-translation">用可运行的翻译小模型检查两侧输入与掩码 →</a>');
 const infraReading=`<h3 id="ai-infra-map">AI Infra 全貌与四条学习线</h3>`+
 para('模型把已有内容变成新的候选分数。中间会反复做矩阵乘法，把一组特征变成另一组特征。执行一次这类运算的程序叫算子。写算子时要管数字怎么算、从哪取。训练时要管参数怎么更新。提供翻译服务时，还要让多个请求共用有限的显存。')+
 conceptReadingTable(['学习线','沿同一个模型追什么','从哪章继续'],[
  ['模型基础','编号怎样变成向量，向量怎样读取上下文，最后怎样得出候选分数','<a href="/article/tokenization-embedding/">词元与嵌入</a> → <a href="/article/attention-mechanics/">注意力</a> → <a href="/article/transformer-block/">完整解码器块</a>'],
  ['GPU 与算子','矩阵乘法和注意力怎样落到 GPU 的计算与存储。序列变长时，哪些数字值得留在芯片上继续用','<a href="/article/gpu-execution/">GPU 怎样执行算子</a> → <a href="/article/operator-profiling/">实现、测量与验证</a>'],
  ['分布式训练与作业平台','样本怎样分给各个进程，多个设备怎样合成同一次更新，作业如何启动及从保存的状态继续','<a href="/article/gpu-cluster/">一次训练的全过程</a> → <a href="/article/training-platform/">训练作业与平台</a>'],
  ['推理与交付','已有参数怎样服务请求，逐词生成时哪些历史结果能复用，系统怎样用有限显存接更多请求','<a href="/article/model-serving/">生成与缓存</a> → <a href="/article/inference-performance/">服务性能</a> → <a href="/article/ai-lifecycle/">模型交付</a>']
 ])+
 para('需要补基础时，从本章第 2、3 节练习形状和矩阵乘法。<a href="/article/autograd-training/">用 PyTorch 跟一遍前向、反向与更新</a>，再按需要补<a href="/article/training-communication/">多进程怎样交换结果</a>。<a class="inline-link" href="/roadmap/?track=ai#route-ai">查看各方向的阅读顺序与练习 →</a>');
 section[1]=`<h3 id="text-to-next-token">一次续写怎样发生</h3>`+para(
  '「明天可能会下」后面接「雨」还是「雪」？如果前面多一句「冷空气已经来了」，判断可能会变。文本模型先把文字切成词元（token），每项可以是一个字、一个词或词的一部分，再查词表换成编号。下面用一个只有 8 个编号的小模型看前文怎样改变预测。这些编号是实验输入。',
  '训练能调整的数字叫参数。保持参数不变，在 CPU 上做两次预测，得到 [0,1] → 1，[4,1] → 7。两次输入最后一项都是 1，只换了前一项，选出的下一项就变了。<a href="/article/attention-mechanics/#same-position-different-prefix">查看两次预测的实际记录 →</a>')+
 '<ol><li>查表。每个编号从词嵌入表（Embedding）取一行数字。这一行叫向量。</li><li>读取前文。模型有一层专门更新这些向量，叫解码器块。它让每行先读取自己和前文，再加工读回的信息。</li><li>选下一项。每行给出 8 个候选分数（logits）。续写只看最后一行，本实验选分数最高的编号。</li></ol>'+
 trainingFigure('transformer-first-forward','沿 [0,1] 这一路走一遍。末位的向量读过前文后，用它的八个候选分数选出编号 1。')+
 para('对 [0,1] 来说，第一行猜 [0] 后面接什么，第二行猜 [0,1] 后面接什么。续写整段输入要看第二行。将分数最高的 1 接到末尾，下一轮输入就是 [0,1,1]。把每次选出的词元接回去再预测，叫自回归生成。<a href="/article/transformer-model/#repeat-next-token">看同一模型的三轮生成 →</a>',
  '词嵌入表和各层权重都可以通过训练调整。从输入算到分数叫前向计算。用固定的参数对新输入做预测，称为推理。下一节先看 [0,1] 的两个编号各查到哪一行。')+
 '<details class="progressive-detail"><summary>选读 · 同一模型怎样读训练样本</summary>'+
 `<h3 id="tiny-decoder-input">同一模型怎样读训练样本</h3>`+para(
 '训练用样本里的正确答案检查预测、调整参数。把训练样本 [0,1,2,3,4] 的前四项送进去，后四项就是各位置的目标。读到 [0,1] 时，样本里的下一项是 2。每个位置只读取自己和前文，这叫因果约束。')+
 conceptReadingTable(['输入位置','允许使用的前文','要预测的目标'],[
  ['0','[0]','1'],['1','[0,1]','2'],['2','[0,1,2]','3'],['3','[0,1,2,3]','4']
 ])+
 para('损失衡量预测与目标的差异。梯度描述参数变化对损失的影响，优化器据此更新参数。图里多出来的这条路径，正是训练在前向计算之后要做的事。<a href="/article/transformer-model/#training-versus-generation">比较同一个模型的训练目标与生成 →</a> <a href="/article/transformer-model/#translation-reading-path">编码器与解码器的翻译对照</a>使用另一组输入。')+overview+'</details>'+
 '<details class="progressive-detail"><summary>选读 · 循环、卷积与注意力的连接方式</summary>'+sequenceReading+'</details>'+
 '<details class="progressive-detail"><summary>选读 · 三种架构与中英翻译对照</summary>'+architectureReading+translationReading+'</details>'+
 '<details class="progressive-detail"><summary>学完本章后 · 模型计算怎样连接 AI Infra</summary>'+infraReading+'</details>';
 a.updated='2026.11.12';firstReadingChanges.push({id:a.id,section:1,before,after:section[1]});

 const tensorDetail=a.sections[1][1].match(/<details class="progressive-detail"><summary>写代码时，形状和存储步长怎样对应？<\/summary>[\s\S]*?<\/details>/)?.[0];
 const linearDetail=a.sections[2][1].match(/<details class="progressive-detail"><summary>上面的 W 怎样写进 PyTorch Linear？<\/summary>[\s\S]*?<\/details>/)?.[0];
 if(!tensorDetail||!linearDetail)throw Error('Missing decoder tensor and linear details');
 a.sections[1][1]=para(
  '先给开头的 [0,1] 查表。位置从 0 数。位置 0 放着编号 0，取词嵌入表第 0 行。位置 1 放着编号 1，取第 1 行。每行有 8 项特征，取出的两行形状就是 [2,8]。换成 [4,1] 时，只改查第 4 行，末位仍取第 1 行。',
  '把数字按一个或多个方向排列得到张量，每个方向叫一根轴。形状 [2,8] 就是在数两个位置、每个位置八项特征。词嵌入表 E 有 8 行，每行 8 项，64 个参数可供所有位置重复使用。如果把这两条输入放在同一批，就有 B=2 条样本，每条有 T=2 个位置。查表后每个位置多出 D=8 项特征，形状就是 [B,T,D]=[2,2,8]。')+
 '<details class="progressive-detail"><summary>展开 · 两条四项训练输入的形状</summary>'+para(
  '训练用 [0,1,2,3] 与 [4,5,6,7]，第二条的位置 1 放的是编号 5，查 E 的第 5 行。批大小 B=2，每条长度 T=4，编号的形状为 [2,4]。查表得到 [2,4,8]，这批产生 2×4×8=64 个特征值。输入变长会增加查表次数，表本身的行数和每行的特征数照旧。')+'</details>'+tensorDetail;

 a.sections[2][1]=para(
  '继续看 [0,1] 查出的两行。线性层用同一组可学习的系数逐行计算新特征。以解码器里的一个 8→8 变换为例，先把一行的八项分别乘上系数，再加起来，得到新行的第一项。换一组系数就能算下一项。两行各算各的，输入是 [2,8]，输出也是 [2,8]。',
  '因此，[0,1] 换成 [4,1] 后，只要输入到线性层的末行相同，这一步就给出同样的末行结果。下一节会让末行读前一行，看看差别在哪里产生。')+
 '<details class="progressive-detail"><summary>独立手算 · 每行怎样从 3 项变成 2 项</summary>'+para(
  '这里另取便于手算的数字，跟开头实验的八项特征无关。两行输入为 x₀=[1,2,1]、x₁=[0,1,2]。系数排成矩阵 W，三行依次为 [2,0]、[1,−1]、[0,3]，形状为 [3,2]。',
  '计算 XW 时，输出第一项来自输入行与 W 第一列的点积，也就是对应项相乘再相加。对 x₀，第一项是 1×2+2×1+1×0=4，第二项是 1×0+2×(−1)+1×3=1，输出为 [4,1]。对 x₁ 做同样的计算，得到 [1,5]。两行共用一组系数，形状从 [2,3] 变为 [2,2]。',
  '偏置是在每行结果上再加的一组可学习数。两行都加 [1,−1]，得到 [5,0] 和 [2,4]。')+linearDetail+'</details>';

 a.sections[3][1]=para(
  '[0,1] 和 [4,1] 的最后一格都放着编号 1，所以查到同一行词向量。小模型还给每个位置查一行位置向量，与词向量相加，帮助模型分辨先后。两条输入的最后一格连位置也相同，相加结果一样。加完得到块的输入 X，每条都是 [2,8]。',
  '每个分支先做归一化，用每行自己的数调整这一行的数值尺度。注意力分支让最后一格读到前文，把结果加回 X，得到 H₁。前馈网络逐格加工 H₁，把分支结果加回 H₁，得到 H₂。整个块从两行八项开始，算完仍是两行八项。')+
 trainingFigure('tiny-decoder-two-branches','沿中间看注意力和前馈。右侧两条线保留各分支计算前的表示，分别加回 X 和 H₁。')+
 `<h3 id="decoder-attention-first-pass">注意力先决定读取哪些位置，再决定读多少</h3>`+
 para('生成时，每格只读自己和前文，这条规则叫因果约束。用第 3 节的逐行线性变换，从归一化后的本行算出三组向量。查询 Q 发起匹配，键 K 用来匹配，值 V 提供可读回的内容。两次输入的末行相同，这一步只用本行，末格的 Q 也相同。',
  '小模型把 Q、K、V 各分成两组，每组 4 项。一套独立的匹配和汇总叫一个注意力头。看第 0 个头的末格，用自己的 Q 与两个位置的 K 分别逐项相乘再相加，然后除以 √4=2，得到两个匹配分数。Softmax 将分数取指数、再各除以指数和，得到读取比例。',
  '用这两个比例加权读回 V。下面按前一格、末格的顺序列数值，只算读回向量的第一项。数字已四舍五入。')+
 '<ul><li>[0,1] 的匹配分数为 0.20132、−0.01798，读取比例为 0.5546、0.4454。<br>0.5546×0.8441 + 0.4454×0.2124 ≈ 0.5627。</li><li>[4,1] 的匹配分数为 −0.15440、−0.01798，读取比例为 0.4659、0.5341。<br>0.4659×0.3079 + 0.5341×0.2124 ≈ 0.2569。</li></ul>'+
 para('只换前一项，前一格的 K 改变了读取比例，前一格的 V 改变了提供的内容。两个头各读回 4 项，拼成 8 项后再做一次线性变换。<a href="/article/attention-mechanics/">逐行手算 Q、K、V 与多头注意力 →</a>')+
 '<details class="progressive-detail"><summary>选读 · 训练样本的可读范围</summary>'+para('取第一条训练输入 [0,1,2,3]，它的下一项目标依次是 [1,2,3,4]。位置从 0 数，位置 2 读到编号 2，要预测下一项 3。这个答案就在位置 3，所以计算位置 2 时只能读位置 0、1、2。')+
 conceptReadingTable(['位置','允许读取','被屏蔽'],[
  ['0','0','1、2、3'],['1','0、1','2、3'],['2','0、1、2','3'],['3','0、1、2、3','无']
 ])+'</details>'+
 '<details class="progressive-detail"><summary>手算 · 三个分数怎样变成 1/6、1/3、1/2</summary>'+para(
 '另取一组便于计算的数字。假设三格各自提供的第一项是 6、0、2，分到的权重是 1/6、1/3、1/2。位置 2 读回的第一项就是 6/6+0/3+2/2=2。其余特征沿用这组权重，被遮住的位置分不到权重。',
 '取位置 2 的 Q 为 [2,0,0,0]，位置 1 的 K 为 [ln 2,0,0,0]，ln 表示自然对数。两个向量的点积是 2×ln 2，再除以 √4=2，得到位置 1 的分数 ln 2。在常见的初始化假设下，这个除法能让特征变多时的分数波动小一些。',
 '同样取位置 0、2 的 K 为 [0,0,0,0] 和 [ln 3,0,0,0]，缩放后的三个分数是 [0, ln 2, ln 3]。Softmax 先取指数得到 [1,2,3]，再除以总和 6，得权重 [1/6,1/3,1/2]。拿这三个数乘前面给出的内容，就能核对结果 2。')+'</details>'+
 '<details class="progressive-detail"><summary>选读 · 注意力分数的形状</summary>'+para(
  '第 5 节把分数记作 [B,H,T,T]。H 是头数，最后两根轴分别对应发起匹配的位置和可供匹配的位置。')+'</details>'+
 `<h3 id="decoder-ffn-position">前馈网络怎样加工每个位置</h3>`+
 para('注意力把前文的信息送到当前格，前馈网络（FFN）接着变换这一格已有的特征。每格各自计算，共用同一组参数。本例把八项扩到十二项，中间让各项的调整幅度随输入变化，再用线性层变回八项。中间这一步让前馈网络能做单个线性层做不到的变换。')+
 '<details class="progressive-detail"><summary>选读 · 8 项特征怎样经过 SwiGLU</summary>'+para(
  '本例先用两组不同的权重，把 8 项特征分别变成两组 12 项。一组提供内容，另一组先对每一项应用 SiLU 函数，例如输入 0 得到 0，输入 2 得到约 1.76。处理后的这一组充当调节系数。两组逐项相乘，再从 12 项投影回 8 项。这种带门控的前馈结构叫 SwiGLU，12 记作中间宽度 F。')+'</details>'+
 '<details class="progressive-detail"><summary>选读 · 位置编码还有哪些做法</summary>'+para('本例把位置向量加到词嵌入上。旋转位置编码（RoPE）则在注意力里按位置旋转 Q、K，让匹配分数随相对位置变化。<a href="/article/position-encoding/">从二维旋转推导 RoPE →</a>')+'</details>'+
 `<h3 id="decoder-block-order">两次回加怎样组成一层</h3>`+
 para('图中的两条回加路径叫残差连接。沿右侧直接送去相加的 X 和 H₁ 保持原样。分支输出为零时，原表示沿这条路径保留下来。',
  'H₂ 可以交给下一块。最后一块的输出经过归一化，再做词表投影。这次线性变换从每格的八项特征算出八个候选分数，每个分数对应词表中的一个编号。<a href="/article/transformer-block/">跟代码核对两次回加与完整前向 →</a>')+
 para('这就回到了开头的问题。前文改变了最后一格读回的内容，整个块算出的最后一行也变了。模型拿这一行给候选项打分，[0,1] 的最高分是编号 1，[4,1] 的最高分是编号 7。')+
 '<details class="progressive-detail"><summary>实测 · 核对输入、注意力和候选分数</summary>'+
 para('两条输入最后一格的词向量首项都是 0.923456，位置向量首项都是 −0.880069，相加得到 0.043387。再看第 0 个注意力头，追踪汇总结果的第一项。每行的两项乘积分别来自前一格和自己，数值已四舍五入。')+
 '<ul><li>[0,1] 汇总得到 0.5546051×0.8440784 + 0.4453949×0.2123563 ≈ 0.562713。</li><li>[4,1] 汇总得到 0.4659462×0.3079029 + 0.5340538×0.2123563 ≈ 0.256876。</li></ul>'+
 para('自己提供的内容 0.2123563 相同，前一格提供的内容和两格的读取比例都变了。下面是经过完整解码器块和词表投影后，最后一行的两个候选分数。')+
 '<ul><li>[0,1] 给编号 1 打 3.780366 分，给编号 7 打 3.465295 分，最高是 1。</li><li>[4,1] 给编号 1 打 3.582167 分，给编号 7 打 3.594005 分，最高是 7。</li></ul>'+
 para('<a href="labs/tiny-decoder-forward/validation.json">核对同一次 CPU 实验的两个前向记录 →</a>')+'</details>'+
 '<details class="progressive-detail"><summary>选读 · 两条四项训练输入的整层形状</summary>'+
 para('图中输出框的 V 指词表大小。左下角 Q、K、V 的 V 指注意力读回的值。')+blockFlow+'</details>'+
 '<details class="progressive-detail"><summary>手算 RMSNorm 与 LayerNorm</summary>'+para(
 '小模型用均方根归一化（RMSNorm）。把一个位置的特征平方求平均，加上很小的正数后开方，再用每项特征除以这个数，最后乘各自可学习的缩放系数。输入 [1,3] 时，若忽略小常数并取缩放为 1，分母是 √((1²+3²)/2)=√5，结果为 [1/√5,3/√5]。',
 '层归一化（LayerNorm）先减去均值，再除以标准差，并可学习缩放和偏置。仍用 [1,3]，暂取小常数为 0、缩放为 1、偏置为 0，先减均值 2，再除以标准差 1，得到 [−1,1]。')+'</details>'+
 '<h3 id="repeat-next-token">沿最后一行完成三轮生成</h3>'+
 para('沿 [0,1] 继续生成。每轮把已有的完整序列送进模型重新算分，取最后一行的最高分，把选出的编号接到末尾。然后用更长的序列继续下一轮。')+
 conceptReadingTable(['本轮已有序列','整段重算取哪行','接到末尾的编号'],[
  ['[0,1]','第 2 行','1'],['[0,1,1]','第 3 行','1'],['[0,1,1,1]','第 4 行','1']
 ])+
 para('整段重算三轮分别送入 2、3、4 项。三轮后，完整序列 [0,1,1,1,1] 已有 5 项。最后一个 1 刚被选出，第三轮的输入到 [0,1,1,1] 为止。<a href="/article/transformer-model/#generation-cache-steps">看缓存版每轮实际送入什么</a> · <a href="/article/transformer-model/#training-versus-generation">看同一个模型怎样利用已知答案训练</a>');

 a.sections[4][1]=para('从两项输入加到四项，只要仍在位置表允许的长度内，同一层就能继续使用原有的参数。多出来的是这次计算产生的中间结果，例如查出的词向量和注意力分数。算显存时要把这两笔账分开。')+
 '<details class="progressive-detail"><summary>展开形状与 664 个参数的账本</summary>'+a.sections[4][1]+'</details>';

 a.sections[5][1]=para('从两项加到四项，逐位置的线性变换多算两行，工作量翻倍。一个注意力头的完整分数表从 2×2 变成 4×4，格数变成四倍。注意力的每一行是一个发起匹配的位置，每一列是一个候选位置。因果约束会挡住未来的位置，具体实现也可以少存一些中间结果。<a href="/article/transformer-model/#section-8">看位置总数相同、分组不同时有多少分数格 →</a>')+
 '<details class="progressive-detail"><summary>展开元素数、字节与计算量的算例</summary>'+a.sections[5][1]+'</details>';

 a.sections[6][1]=
 '<h3 id="generation-cache-steps">下一轮要重算哪些数字</h3>'+
 para('还是从 [0,1] 开始。整段重算三轮送入 2、3、4 项。KV 缓存把算过的键 K 和值 V 留给下一轮，三轮实际只送入 2、1、1 项。第一轮送入 [0,1]，后两轮各只送入上轮选出的 1。缓存格数依次为 2、3、4。',
  'CPU 实验逐轮核对最后一行的候选分数，分数只差浮点舍入，两条路径都选出了 [1,1,1]。完整序列长 5，缓存里有 4 格，因为最后选出的 1 要到下一轮才会送进模型。<a href="/article/transformer-model/#repeat-next-token">回看完整序列怎样逐轮增长</a>')+
 '<details class="progressive-detail"><summary>展开 KV 缓存与 CPU 复现记录</summary>'+
 para('缓存保存已经算过的匹配键 K 和内容 V，合称 KV Cache。追加词元时，新位置仍要计算自己的 Q、K、V，再用 Q 读取合法的历史位置；旧位置的 K、V 可以继续使用。下面同时记录输入、选择结果与缓存长度。')+
 conceptReadingTable(['阶段','本轮送入模型','本轮选出的编号','计算结束时已有几格缓存'],[
  ['读提示（prefill）','[0,1]','1','2'],['逐词生成（decode）','上一轮选出的 1','1','3'],['逐词生成（decode）','上一轮选出的 1','1','4']
 ])+
 para('在固定参数和相同可见规则下，过去位置读不到未来，所以追加新词元不会改变旧位置的 K、V。最后一轮选出的 1 已经可以输出，但尚未作为输入完成前向，所以完整序列长度为 5，缓存长度为 4。实验在第三次选词后结束，位置表的四个位置正好用完。<a href="labs/sdpa-cache/validation.json">查看实际 CPU 记录中的 generation →</a>',
 '按单请求、单层估算，2 个头、每头 4 项、每项 2 字节，每缓存一格要为 K 和 V 共留 2×2×4×2=32 字节。第 3 轮的四格共 128 字节。这个预算按两字节格式假设计算，实验实际采用 CPU 双精度。增加层数或同时服务更多请求，需把对应的缓存项一起计入。<a href="/article/model-serving/">继续看缓存容量、批处理与显存分配 →</a>')+
 '<h4>在 CPU 上复现这三轮预测</h4>'+para(
 '解压<a href="labs/sdpa-cache.zip" download>实验包</a>，按<a href="labs/sdpa-cache/README.md">运行说明</a>安装 PyTorch 2.5.1，执行 <code>python -B cache_lab.py &gt; local-record.json</code>。在源码的 <code>greedy</code> 函数里，<code>reference(torch.tensor([prefix]))[:, -1]</code> 取每条输入的最后一行分数，<code>full[0].argmax()</code> 找到第一条输入最高分的编号。',
 '在输出的 <code>generation</code> 中核对 <code>generated_ids</code> 为 [1,1,1]，三轮的 <code>cache_length</code> 分别为 2、3、4。程序在每一轮都用完整前缀重新计算分数，和缓存路径的最后一行逐项比较。')+
 '</details>'+
 '<details><summary>如果只生成两个词元，序列与缓存分别有多长？</summary>'+para('完整序列有 4 项，包含 2 项提示和 2 项新输出。缓存有 3 格，因为第 2 个新输出是在本轮结束时选出的，下一轮才会处理它。')+'</details>'+
`<h3 id="training-versus-generation">训练怎样利用已知答案</h3>`+
 para('生成时，模型给 [0,1] 选了 1，再把它接回输入。训练样本 [0,1,2,3,4] 已经给出整段答案，可以直接拿 [0,1,2,3] 当输入，拿 [1,2,3,4] 当逐行的预测目标。所以在这份样本里，[0,1] 对应的目标是 2。',
  '程序可以只选部分目标来训练。这个 CPU 实验在第一条样本只选位置 0 的目标 1，在第二条样本选前三个目标 5、6、7。四项有效损失取平均，再计算梯度，也就是参数稍微改动时损失的变化率。优化器用这些梯度更新参数。',
  '下面单独用更新后的参数算一道题。第 3 行（从 0 数是位置 2）读到 [0,1,2]，目标是 3。原 CPU 更新跳过了目标 3，这里只用它演示怎样从一行分数算出一项损失。',
  '编号 3 的分数约 −3.974，八个候选的最高分约 6.645。计算 softmax 时，先把八个分数各减去最高分，再取指数。每项除以指数之和就是它的概率。',
  '编号 3 的概率 p ≈ 0.00002444 ÷ 1.25050 ≈ 0.00001954，单项损失 −ln p ≈ 10.84。ln 是自然对数，正确答案的概率越低，这一项的损失越大。<a href="/article/transformer-model/#section-9">用第 9 节核对标签和单项损失 →</a>')+
 '<details class="progressive-detail"><summary>展开标签对齐与损失计算</summary>'+
 para('训练把样本里的正确前文直接交给模型，这叫教师强制。取编号 3 的概率 p，单项损失是 −ln p。若 p=1/2，损失约为 0.69；若 p=1/4，损失约为 1.39。',
 '第 4 节的 softmax 在前文位置之间分配读取权重。这里给词表候选分配概率。')+
 '<h4>CPU 实验怎样筛选训练目标</h4>'+para(
 '两条序列分别保留 1 项和 3 项有效目标。<a href="labs/sdpa-cache/cache_lab.py">CPU 实验源码</a>把跳过的目标标为 <code>-100</code>，例如第一条的目标 2。拆成两次计算时，每次累加有效损失，再统一除以总目标数 4。这样才能和整批求平均的更新对齐。')+
 '</details>'+
 '<details class="progressive-detail"><summary>延伸 · 同一模型怎样从训练恢复到生成</summary>'+
 para('下面的恢复实战使用两条训练样本 [0,1,2,3,4] 和 [4,5,6,7,0]。各取前四项作输入，分别交给两个训练进程。完成更新后保存状态，换一组进程继续训练，再把导出的参数交给推理进程，从同一个 [0,1] 开始生成。<a href="/article/checkpoint-recovery/#native-tiny-decoder-handoff">沿同一个 664 参数模型走完训练、恢复和生成 →</a>')+
 '</details>'+
 '<details class="progressive-detail"><summary>延伸 · 从模型计算走向系统优化</summary>'+ `<h3 id="model-compute-to-infra">沿着瓶颈选择优化对象</h3>`+
 para('注意力先算位置间分数，再拿分数得到汇总。如果把每个中间结果都写回显存再读回来，长序列会产生大量搬运。FlashAttention 按块计算和合并归一化统计，减少完整中间矩阵的搬运。它与第 6 节的分数形状对应，<a href="/article/flash-attention-io/">下一步可以推导分块如何保持同一注意力结果</a>。',
 '设备放不下一层的矩阵时，可以让不同设备各算部分输出列，再按需要交换结果，这叫张量并行。数据并行则让模型副本各读一部分样本，合成用于同一次更新的梯度。前者切计算，后者分样本。读到“多卡更快”时，先问拆开的是哪一项，以及哪一步需要各设备等到彼此。<a href="/article/tensor-parallel-math/">看分片矩阵怎样合成</a> · <a href="/article/distributed-training/">看多个副本怎样完成一次更新</a>。')+'</details>';

 a.sections[7][1]=para('接着第 6 节数注意力分数。这里另用一个支持至少 8 个位置的模型做纸上比较。同样八个输入位置，四条各长 2 时，两个头合计有 32 个分数格。一条长 8 时，合计有 128 格。完整分数表只对同一条序列内的位置配对。<a href="/article/transformer-model/#section-9">用第 9 节核对哪些位置实际可读 →</a>')+
 '<details class="progressive-detail"><summary>算例 · 同样八个位置，怎样分组更费计算</summary>'+a.sections[7][1]+'</details>';

 const lossExercise='只让这个位置参与训练损失，按第 7 节对这行候选分数做 softmax，取编号 3 的概率 p，再算 −ln p，与程序返回的单目标损失对照。';
 if(!a.sections[8][1].includes(lossExercise))throw new Error('Transformer loss exercise changed');
 a.sections[8][1]=a.sections[8][1].replace(lossExercise,'按<a href="/article/transformer-model/#training-versus-generation">第 7 节的实算</a>，只取这行分数做 softmax，取编号 3 的概率 p，再算 −ln p，与程序返回的单目标损失对照。');
 const exercise='<h3 id="verify-next-token-loss">复算位置 2 对目标 3 的损失</h3>'+para(
 '解压<a href="labs/sdpa-cache.zip" download>同一个小模型的实验包</a>，按<a href="labs/sdpa-cache/README.md">运行说明</a>安装 PyTorch 2.5.1。在解压后的实验目录运行下面的命令。程序先按第 7 节做一次参数更新，再取第一条输入位置 2 的分数。',
 '输出第一行是编号 0 到 7 的八个分数。第二行是目标 3 的单项损失，约为 <code>10.843026769187</code>。先对第一行做 softmax，取编号 3 的概率 p，再算 −ln p 与第二行对照。')+
 trainingCode('复算位置 2 对目标 3 的单项损失','SHELL',`python -B - <<'PY'
import torch
from torch.nn.functional import cross_entropy
from torch.nn.attention import SDPBackend, sdpa_kernel
from cache_lab import TinyDecoder, update

torch.manual_seed(7)
torch.set_num_threads(1)
reference = TinyDecoder().double()
rows = torch.tensor([[0, 1, 2, 3, 4], [4, 5, 6, 7, 0]])
ids, labels = rows[:, :-1], rows[:, 1:].clone()
labels[0, 1:] = -100
labels[1, 3:] = -100
with sdpa_kernel(SDPBackend.MATH):
    update(reference, ids, labels, micro_size=2)
    reference.eval()
    with torch.inference_mode():
        scores = reference(ids)[0, 2]
        print(scores.tolist())
        print(cross_entropy(scores[None, :], rows[0, 3:4]).item())
PY`);
 const firstExerciseParagraph=a.sections[8][1].indexOf('</p>')+'</p>'.length;
 a.sections[8][1]=a.sections[8][1].slice(0,firstExerciseParagraph)+exercise+a.sections[8][1].slice(firstExerciseParagraph);
 a.sections[8][1]+='<details class="progressive-detail"><summary>选读实战 · 编码器与解码器的翻译模型</summary><h3 id="encoder-decoder-translation">把源句编码、目标右移和逐词翻译跑一遍</h3>'+para(
 '接下来换用第 1 节选读中的「红 圆」翻译模型。它有一层编码器、一层解码器，两侧各有词嵌入表，位置用固定正弦和余弦表示。编码器输出的源表示在代码里叫 <code>memory</code>。把“红”和“红 方”放到同一批，检查长短句怎样一起计算。',
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
 '<p class="practice-links"><a href="labs/encoder-decoder.zip" download>下载源码、样本与记录 ↓</a> · <a href="labs/encoder-decoder/README.md">运行说明 →</a> · <a href="labs/encoder-decoder/validation.json">查看训练、掩码与生成记录 →</a> · <a href="https://github.com/pytorch/pytorch/blob/v2.5.1/torch/nn/modules/activation.py#L1072-L1122">PyTorch 掩码参数 ↗</a></p></details>';
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
 a.sections[3][1]+=para('学到容器编排时，可以先看<a href="/article/k8s-networking/#section-1">Kubernetes 怎样把应用副本接到统一入口</a>。Kubernetes 用 Pod 承载应用，用 Service 给一组应用提供稳定入口。综合实战只改一个副本的 <code>/ready</code>，分别直连这个应用、通过 Service 发请求，检查<a href="/article/cloud-service-lab/#kubernetes-service-probes">就绪信号怎样改变实际流量</a>。');
 a.updated='2026.11.12';firstReadingChanges.push({id:a.id,section:3,before,after:section[1]});
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
