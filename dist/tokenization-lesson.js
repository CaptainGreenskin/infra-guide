// Load with v9-model.js, after curriculum.js and before curriculum-finalize.js.
{
  Object.assign(sources, {
    v9bpe: ['Sennrich 等 · 子词单元与 BPE', 'https://aclanthology.org/P16-1162/'],
    v9tokparts: ['Hugging Face Tokenizers · 规范化、预切分、词表与后处理', 'https://huggingface.co/docs/tokenizers/components'],
    v9embedding: ['PyTorch 2.12 · Embedding 查表与 padding_idx', 'https://docs.pytorch.org/docs/2.12/generated/torch.nn.Embedding.html'],
    v9celoss: ['PyTorch 2.12 · CrossEntropyLoss、ignore_index 与归约', 'https://docs.pytorch.org/docs/2.12/generated/torch.nn.CrossEntropyLoss.html'],
    v9tying: ['Press 与 Wolf · 输入、输出嵌入与权重共享', 'https://aclanthology.org/E17-2025/'],
    v9shift: ['Hugging Face Transformers · GPT-2 语言模型的 labels 约定', 'https://huggingface.co/docs/transformers/model_doc/gpt2']
  });
  const example = "\"\"\"Toy vocabulary -> shifted next-token loss. Python standard library only.\"\"\"\nimport math\n\nTOKENS = [\"<PAD>\", \"<BOS>\", \"<EOS>\", \"云\", \"端\", \"云端\", \"算\", \"<UNK>\"]\nE = [(0, 0), (0, 1), (0, -1), (1, 0), (-1, 0), (2, 0), (0, 2), (0, 0)]\nPAD, BOS, EOS, UNK, IGNORE = 0, 1, 2, 7, -100\n\n\ndef encode(text):\n    ids = [BOS]\n    pos = 0\n    while pos < len(text):\n        if text.startswith(\"云端\", pos):\n            ids.append(5)\n            pos += 2\n        else:\n            c = text[pos]\n            ids.append({\"云\": 3, \"端\": 4, \"算\": 6}.get(c, UNK))\n            pos += 1\n    return ids + [EOS]\n\n\ndef log_probs(logits):\n    m = max(logits)\n    log_z = m + math.log(sum(math.exp(x - m) for x in logits))\n    return [x - log_z for x in logits]\n\n\ndef main():\n    full = [encode(\"云端云端算\"), encode(\"云\")]\n    width = max(map(len, full))\n    inputs, targets, key_masks = [], [], []\n    for row in full:\n        present = [True] * len(row) + [False] * (width - len(row))\n        padded = row + [PAD] * (width - len(row))\n        inputs.append(padded[:-1])\n        targets.append([v if present[i] else IGNORE\n                        for i, v in enumerate(padded[1:], start=1)])\n        key_masks.append(present[:-1])\n    assert inputs == [[1, 5, 5, 6], [1, 3, 2, 0]]\n    assert targets == [[5, 5, 6, 2], [3, 2, IGNORE, IGNORE]]\n    assert key_masks == [[True] * 4, [True, True, True, False]]\n    assert encode(\"云?\") == [BOS, 3, UNK, EOS]\n\n    losses = []\n    for b, row in enumerate(inputs):\n        for t, token in enumerate(row):\n            # Toy transform H=E/2; no attention block or position encoding.\n            h = [x / 2 for x in E[token]]\n            logits = [sum(x * y for x, y in zip(h, out)) for out in E]\n            lp = log_probs(logits)\n            assert math.isclose(sum(math.exp(x) for x in lp), 1.0)\n            if b == 0 and t == 1:\n                assert logits == [0, 0, 0, 1, -1, 2, 0, 0]\n                expected = math.exp(2)/(5 + math.e + math.exp(-1) + math.exp(2))\n                assert math.isclose(math.exp(lp[5]), expected)\n                print(\"target_probability\", round(expected, 6))\n            y = targets[b][t]\n            if y != IGNORE:\n                losses.append(-lp[y])\n    assert len(losses) == 6\n    print(\"inputs\", inputs, \"targets\", targets)\n    print(\"valid_targets\", len(losses), \"mean_nll\", round(sum(losses)/len(losses), 6))\n\n    # Independent lookup-path example with two supplied upstream gradients.\n    row_grad = [0.0, 0.0]\n    for token, grad in [(5, [0.2, -0.4]), (5, [0.3, 0.1])]:\n        assert token == 5\n        row_grad = [old + add for old, add in zip(row_grad, grad)]\n    assert all(math.isclose(x, y) for x, y in zip(row_grad, [0.5, -0.3]))\n    print(\"lookup_row5_gradient\", [round(x, 2) for x in row_grad])\n\n\nif __name__ == \"__main__\":\n    main()\n";
  chapter('model-foundations','0.9','tokenization-embedding','从字符串到下一 token：词表、Embedding、输出头与标签对齐',
    '把“云端云端算”送过一张只有八行的词表，一直算到下一 token 的概率。核对 ID、形状、梯度和训练分母。',
    '先读 0.1，理解 decoder 按前缀预测下一 token，熟悉向量点积。',
    ['编码：说明一条字符串怎样被切分和编号','矩阵：从查表到词表 logits 手算目标概率','目标：逐格核对标签、掩码与共享权重的更新'],[
    ['先约定词表，再说模型看到了什么', para(
      '设想平台接到两个训练样本：“云端云端算”和“云”。调度器问要预留多少序列位置，模型工程师问要读嵌入表的哪些行，训练负责人问有几项损失可以计入均值。这三个问题都从同一段预处理开始。Unicode 字符串本身没有指定分词边界，更没有给“云”规定一个全世界通用的编号。',
      '我们专门为本章定义一套玩具编码器：0 是 PAD，1 是 BOS，2 是 EOS，3 是“云”，4 是“端”，5 是“云端”，6 是“算”，7 是 UNK。从左到右遇到“云端”优先取整个词元，否则取一个字符，词表中找不到就用 UNK。编码器再在开头加 BOS、在末尾加 EOS。这是一条确定的人工规则，后面的所有数字只依赖这张表。',
      '第一句先切成［云端，云端，算］，完整 ID 为 [1,5,5,6,2]；第二句完整 ID 为 [1,3,2]。编号只是选行的依据，5 与 6 相邻不表示含义比 5 与 3 更近。若部署端采用另一张词表，把同一个 5 解作另一个词元，网络仍可能正常执行，结果的语义却已经错位。检查模型版本时，应把 tokenizer 版本、特殊编号及模板都视为模型输入契约。'
    ) + linkTo('transformer-model','先复习 0.1 的下一 token 预测')],
    ['子词为什么值得学，字节又处在哪一层', para(
      '如果把整词当一个单位，罕见组合或新词可能都落到未知符号；如果把每个字符或字节当一个单位，常见短语可能需要更长序列。BPE 风格训练从细粒度符号开始，在语料上统计相邻符号对，逐步把常见对合成新符号，保存学到的合并与顺序。编码时应使用训练好的规则，不能为每条新句临时重新统计词频并改词表。',
      '用极小的语料直观理解合并：假设按字符起步，语料包含两次“云端”和一次“云算”，不跨这些样本边界统计。相邻对（云，端）出现两次，（云，算）出现一次，一次合并可优先产生“云端”。这与本章手写规则在这两类片段上结果相似，但手写编码器没有学习归一化、预切分或多轮合并。真实 BPE 编码按既定合并优先级处理，也不普遍等同于对所有词表项做最长匹配。',
      '字节级 BPE 可从能表示全部字节值的基本集合开始，再学多字节合并。UTF-8 中一个汉字常占多个字节，所以“每个字固定一个 token”和“每个字节永远一个 token”都可能失效。能以字节表示不等于所有 tokenizer 都完全保留原文；规范化、空白处理、特殊符号插入与解码清理还受配置影响。要求逐字节可逆时应直接做往返测试。',
      'BOS、EOS、PAD 是协议符号，要核对是否由模板或后处理自动插入，以及输入文本里的外观相同字串会被当成普通文本还是特殊指令。本例只接受编码器追加的边界标记。若模板和调用方各加一次 BOS，或训练用普通空格、推理时却替换成了不同的空白字符，两边都能返回合法 ID，却可能让模型处理不同前缀。'
    )],
    ['查哪几行，为什么形状变成 [B,T,D]', para(
      '为了展示逐格对齐，先把完整序列右侧补齐到五格，再取前四格作为预测输入。两行分别是 [1,5,5,6] 与 [1,3,2,0]。因此批大小 B=2、输入长度 T=4。嵌入表 E 的形状是 [V,D]，这里词表大小 V=8、向量维 D=2。第 b 个样本、第 t 个位置的向量等于 E[ids[b,t]]，所以查表输出形状为 [2,4,2]。',
      '明确本例的表行：PAD=(0,0)，BOS=(0,1)，EOS=(0,−1)，“云”=(1,0)，“端”=(−1,0)，“云端”=(2,0)，“算”=(0,2)，UNK=(0,0)。于是第一条输入变成 [(0,1),(2,0),(2,0),(0,2)]。两个连续 5 选中同一行，查表不为第二次出现额外创建参数。两处是不同的序列位置，注意力和位置机制可以让它们后续的隐藏状态不同。',
      '把 ID 想成长度 V 的独热向量再乘 E，也能推导出完全相同的选择结果。实际查表无需构造 [B,T,V] 的大张量。词表增长会增加表的行数，序列变长则增加本批的查表位置数；这是两笔不同的开销。整数 ID 用来索引，训练需要优化的是选中的浮点表项以及模型其他参数，编号顺序本身并不从反向传播得到连续梯度。',
      '本章把模型内部压缩成一个明示的算术变换 H=E[ids]/2，使每个分数都可独立核算。它不执行位置编码或上下文注意力。真实 decoder 接受这些输入表示，经过多层基于前缀的运算后仍输出 [B,T,D] 的 H；下文的输出头仍能使用同样的形状与对齐规则。'
    )],
    ['输出头怎样把向量变成八个候选分数', para(
      '输出头保存形状为 [V,D] 的矩阵 W。对隐藏向量 h，给候选 j 的分数是 h 与 W[j] 的点积，本例不加偏置。并行计算所有位置得到 [B,T,V] 的 logits；这里是 [2,4,8]。logits 是任意实数，尚未归一化。推理时可以挑最大分数或按采样策略选词；训练时从八个分数计算已知目标的损失，无需先离散地挑出一个预测。',
      '现在把 W 与 E 共享。第一条样本位置 1 的输入是首个“云端”，h=(1,0)，其目标恰好是第二个“云端”，ID 仍为 5。按词表顺序点积得到 [0,0,0,1,−1,2,0,0]。目标项分数为 2，但概率不能只看这一个分数：softmax 分母为五个 exp(0) 加 exp(1)、exp(−1)、exp(2)。目标概率约为 0.477477，不是 2，也不是 1。',
      '交叉熵对本位置取 −log P(目标)。八个候选一起进入分母，竞争项升高会降低目标概率，即便目标分数不变。实现上可用 log-sum-exp 稳定计算，避免指数溢出；交给接受 logits 的交叉熵函数时也不要先手动做一次 softmax 再当成 logits 传入。',
      '共享权重有明确的数量意义。两张独立的 [8,2] 表共有 32 个参数；共享后是 16 个，线性输出仍然要计算八个分数。放大到 V=32,000、D=4,096，不计偏置和其他层，共享可少一张 131,072,000 参数的矩阵。按每参数两个字节只算权重，是 250 MiB；激活、优化器状态和跨设备放置要分开算。形状兼容且实现真正引用同一参数才叫共享，复制一份相同初值不会自动共享未来的更新。'
    )],
    ['标签向左移一次，每一格回答哪个问题', para(
      '完整序列 s 的正确配对是输入 s[0:-1] 对目标 s[1:]。第一句的位置 0 输入 BOS 应预测第一个 5；位置 1 输入 5 预测第二个 5；位置 2 的输入仍是 5，但这次目标是 6；位置 3 输入 6 预测 EOS。这两处相同输入 ID 有不同目标，并不是标签出错，而是上下文与位置不同。玩具 H 只有局部输入信息，恰好无法区分这两处，真实上下文模型要解决的正是这类差异。',
      '第二句补齐后的完整行是 [1,3,2,0,0]，前四格是 [1,3,2,0]。预测目标原本来自后一格，因此只保留 [3,2,忽略,忽略]。两条样本的有效目标数为四加二，共六个；EOS 是真实下一符号，必须贡献恰当的训练目标。若按矩形总共八格取平均，就会把损失分母人为放大。若把每句各自的平均损失再等权平均，则改变了每个有效 token 的权重。',
      '移位放在哪里取决于 API。手写训练循环若已经显式对齐，只应调用按位置计算损失的接口；某些因果语言模型封装（例如 Hugging Face 的 GPT-2 语言模型）会内部移位 labels，可以按其契约提供完整序列及忽略标记。如果外部和内部各移一次，位置 0 可能被训练去猜第二个正文 token；若两边都不移位并拿当前 ID 作为目标，模型可能仅学习复制看得见的当前输入。形状可以全部正确，两种任务却都错了。'
    )],
    ['注意力掩码、损失忽略和 padding 行各做什么', para(
      '对右补齐的第二句，本例输入位置的“真实键”标记是 [真,真,真,假]。因果注意力还要限制位置 t 只能访问时间上不晚于 t 的键。两条规则同时生效：既不能看未来，也不应把填充键当成真实上下文。各库对布尔掩码、加性掩码的真假及广播方向可能不同，要按实际 API 验证，而不是只看数组里有零有一。',
      '相比之下，ignore_index 作用在目标位置，使那一格不贡献损失及相应分母。它不指挥注意力，也不会自动从真实位置的 softmax 中删除 PAD 这个类别。注意力方面，在未打包的纯右补齐样本里，真实查询本来就看不到末尾未来的填充；这只是因果方向带来的特例。改成左补齐、双向模型、多个样本拼接或其他 mask 后，不能沿用相同推断。打包时还应防止一个样本借到前一个样本的上下文，并定义是否跨样本预测目标。',
      '再看一个容易漏的反例：某些配置让 PAD 与 EOS 共用编号。若简单按“ID 等于 EOS 就忽略”构造 labels，真实结束目标也会消失。应依据原始长度、真实位置或可靠的掩码区分末尾填充和有效 EOS。PyTorch Embedding 的 padding_idx 会改变查表路径上该行的更新行为；若同一参数又参与输出头，它仍可能从输出路径收到梯度。想冻结整行必须检查所有用途，不能仅凭输入侧设置断言。',
      '如果整批所有标签都被忽略，应显式处理零有效目标。手工“总损失除以有效数”会除零，框架归约的细节取决于所用接口。跨微批、跨 rank 时先明确全局有效数；将全忽略的样本记为零损失，再平均进实际有效目标，仍可能改变训练目标。'
    )],
    ['同一 ID 出现两次，反向时写哪一行', para(
      '把查表视为一个可微的行选择。假设只看输入路径，第一处 5 收到上游梯度 (0.2,−0.4)，第二处 5 收到 (0.3,0.1)。两条路径都使用同一参数 E[5]，反向贡献相加为 (0.5,−0.3)。如果用“后一次覆盖前一次”的赋值，就会丢掉第一处样本的学习信号。这个算例假设普通查表、没有按出现频率额外缩放，也没有分母或梯度裁剪的其他改动。',
      '当 E 同时是输出矩阵 W，每个有效位置的交叉熵还会沿输出头把梯度传到各候选行。以一个位置为例，行 j 的输出贡献是 (p[j]−是否为目标 j) 乘 h。即使某个 ID 完全没出现在本批输入中，它作为输出候选仍可能更新；不能把“仅输入查表时哪些行被选中”直接套到共享权重的整个模型。优化器应对同一参数做一次一致的更新，不要把同一张表重复注册成两份要独立踏步的参数。',
      '下列程序把整条主链跑一遍，并用另一个独立的查表梯度练习检验相加。它不下载词表或权重，前向使用已写明的 H=E/2。代码算出的六项均值可以作为后续改写的对照；若把 logits 的最后两维交换，或把 EOS 目标吞掉，就应首先在形状、逐格标签和有效数这三处发现问题。'
    ) + code('玩具词表与六项有效目标 · Python 3 标准库','PYTHON',example)],
    ['验收：不要只看 loss 有没有下降', para(
      '题目共十分。第一题：从“云端云”写出带边界的完整 ID 和三组输入目标，占三分。第二题：保持 V=8，把 D 改成 4，分别说明两表独立和权重共享时输入表及输出头合计参数数，并说明 batch 中两次出现 ID 5 是否会改变参数数，占两分。第三题：解释为何 ignore_index 不能替 attention mask 隐藏填充键，也不能从其他位置的 softmax 分母删除一个类别，占三分。最后两分用于说明如何鉴别标签双重移位。',
      '参考答案：完整 ID 为 [1,5,3,2]，三组分别为 1→5、5→3、3→2。独立输入输出表共有 2×8×4=64 个参数，共享为 32 个，重复 ID 只增加使用次数。用真实位置标记约束注意力键，用标签的忽略位约束监督，再把一个不重复的小序列逐格列出：第一个位置必须预测第一个正文 token 而非后一个。拿这个位置检查封装内部是否还移位，比看损失下降曲线更有辨别力。',
      '进一步思考：更换 tokenizer 后词表大小刚好不变，权重文件也能加载，系统能否直接发布？还需逐项比较 ID 到 token 的语义、特殊符号及模板，重新验证逐格目标和解码结果。权重行与训练语义是成套契约；文件能读和矩阵能乘只验证了机械兼容性。下一章把这里得到的标量损失继续沿梯度传回参数。'
    ) + linkTo('autograd-training','继续 0.4：从标量损失到一次参数更新')]
    ],['一次查表中相同 ID 出现两次，为什么它的行梯度不是最后一次的梯度？','同一参数被两处前向路径使用，默认查表反向应累计两处贡献。若还与输出头共享参数，必须再加入所有有效位置的输出投影贡献。'],
    ['v9bpe','v9tokparts','v9embedding','v9celoss','v9tying','v9shift'],['transformer-model','attention-mechanics','autograd-training']);
}
