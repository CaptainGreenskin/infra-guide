/* Model foundations 0.10, after the module and existing chapter() helpers exist. */
{
  Object.assign(sources, {
    v9RopePaper: ['Su 等 · RoFormer（旋转与相对位置推导）', 'https://arxiv.org/abs/2104.09864'],
    v9PosTransformer: ['Vaswani 等 · 原 Transformer 的正弦位置表示', 'https://arxiv.org/abs/1706.03762'],
    v9RopeConfig: ['Hugging Face Transformers · Rotary embeddings utilities', 'https://huggingface.co/docs/transformers/main/en/internal/rope_utils'],
    v9RopeImpl: ['Transformers v4.47.1 · Llama 的旋转与 position_ids 实现', 'https://github.com/huggingface/transformers/blob/v4.47.1/src/transformers/models/llama/modeling_llama.py'],
    v9PosInterp: ['Chen 等 · Position Interpolation', 'https://arxiv.org/abs/2306.15595']
  });
  const prose = text => para(...text.trim().split(/\n\s*\n/));
  const ropeScript = "\"\"\"Fixed-vector RoPE checks; Python 3 standard library, no model weights.\"\"\"\nimport json\nimport math\n\n\ndef rotate(vector, position, frequencies, layout=\"adjacent\"):\n    pairs = len(frequencies)\n    if len(vector) != 2 * pairs or layout not in {\"adjacent\", \"halves\"}:\n        raise ValueError(\"this experiment requires a complete paired vector\")\n    out = [0.0] * len(vector)\n    for i, frequency in enumerate(frequencies):\n        a, b = (2 * i, 2 * i + 1) if layout == \"adjacent\" else (i, i + pairs)\n        theta = position * frequency\n        c, s = math.cos(theta), math.sin(theta)\n        out[a] = c * vector[a] - s * vector[b]\n        out[b] = s * vector[a] + c * vector[b]\n    return out\n\n\ndef score(q, k, m, n, frequencies, layout=\"adjacent\"):\n    # Algebraic Q·K score before attention's 1/sqrt(head_dim) scaling.\n    left = rotate(q, m, frequencies, layout)\n    right = rotate(k, n, frequencies, layout)\n    return sum(a * b for a, b in zip(left, right))\n\n\ndef check(number, expected):\n    assert math.isclose(number, expected, rel_tol=1e-12, abs_tol=1e-12), (number, expected)\n\n\ndef main():\n    q, k, omega = [1, 2], [3, 2], [math.pi / 2]\n    original = score(q, k, 2, 1, omega)\n    shifted = score(q, k, 4, 3, omega)\n    wrong_query_offset = score(q, k, 0, 1, omega)\n    check(original, -4)\n    check(shifted, -4)\n    check(wrong_query_offset, 4)\n\n    q2 = k2 = [1, 0]\n    second = score(q2, k2, 3, 1, [math.pi / 3])\n    check(second, -0.5)\n    check(score(q2, k2, 6, 4, [math.pi / 3]), -0.5)\n\n    q4, k4, freqs = [1, 2, 3, 4], [4, 3, 2, 1], [math.pi / 2, math.pi]\n    adjacent = score(q4, k4, 1, 0, freqs, \"adjacent\")\n    wrong_layout = score(q4, k4, 1, 0, freqs, \"halves\")\n    check(adjacent, -15)\n    check(wrong_layout, -20)\n    # Permute both projections into the half-pair basis; dot products agree.\n    q_half = q4[::2] + q4[1::2]\n    k_half = k4[::2] + k4[1::2]\n    remapped = score(q_half, k_half, 1, 0, freqs, \"halves\")\n    check(remapped, adjacent)\n    print(json.dumps({\"original\": original, \"translated\": shifted,\n                      \"wrong_query_offset\": wrong_query_offset, \"second_pair\": second,\n                      \"adjacent_pairs\": adjacent, \"unconverted_halves\": wrong_layout,\n                      \"converted_halves\": remapped}, indent=2))\n\n\nif __name__ == \"__main__\":\n    main()\n";
  chapter('model-foundations','0.10','position-encoding',
    '位置怎样进入注意力：从排列到 RoPE 与缓存偏移',
    '证明旋转如何把一对绝对位置变成点积中的相对相位，再检验配对布局、缓存偏移和长上下文声明。',
    '先读 0.2 的 Q/K/V 与因果 mask，以及 0.3 的 decoder block 和位置机制概览。',
    ['推导：从排列性质到相对相位内积','实现：核对频率、配对布局与绝对位置','验收：区分位置可表达、容量可承载与质量可用'],
    [
      ['把位置打乱，再问模型能发现什么',prose(`先考虑无 mask、没有位置信号、各位置共用投影的单头自注意力，关闭 dropout。用 P 表示重新排列 token 行的置换矩阵。输入变成 PX，得到的 Q、K、V 分别为 PQ、PK、PV；打分矩阵变成 P(QKᵀ)Pᵀ，行列一起重排。对每行的列次序做同样的置换，softmax 的权重也跟着重排。因此新输出恰好是原输出按 P 重排。这个性质叫排列等变：输出位置一起换位，不是无论怎么排列输出都保持原样。

这说明内容匹配能从别处读信息，却没有单独提供“相隔几格”的坐标。例如一条包含两个相同词的序列，若它们的隐藏输入相同且可见集合也相同，本层没有理由凭内容知道哪一个在前。把依赖位置的信号加入模型，可以让相同词出现在不同位置时对匹配产生不同作用。传递先后与确定绝对位置并不等价，平台需要知道模型实际采用何种方案才能正确组织 batch 和缓存。

把这一证明照搬到 causal decoder 会出错。固定的下三角掩码本身表达了前缀可见关系；调换两个输入而保持掩码的坐标不动，一般不会得到简单重排的输出。上面的等变推导要求没有此约束，或连同 mask 的行列一起按 P 重排。因果可见性告诉位置能看见谁，显式位置信号则能进一步影响两者怎样匹配。读论文或画计算图时要分别写出这两条路径。`)+linkTo('attention-mechanics','回看 0.2：哪些列可以进入 softmax')],
      ['先看两种绝对位置表示',prose(`一种做法是给每个整数位置 p 一行可学习向量 A[p]，查 token 词表得到 E[id] 后相加。若位置表形状 [4,8]，只有索引 0 到 3 这四行，参数数为 32。输入位置 3 与 0 的 token 相同，它们仍可因位置项而不同。0.4 的小 decoder 采用这个方案。直接传入位置 4 属于接口越界；扩展表的行数可以解决索引问题，新行对语言建模是否有效还要训练与评估。

原 Transformer 的正弦方案将每对特征写为 sin(pωᵢ)、cos(pωᵢ)，ωᵢ=10000^(−2i/D)。固定频率，不必给每个位置保存独立可学习参数。若 D=4，两对频率是 1 和 0.01 弧度/位置；p=0 时两对都是 [0,1]，p=1 时分别形成 [sin 1,cos 1] 和 [sin 0.01,cos 0.01]。三角加法使位置加固定偏移后的每一对仍能由原来的一对线性表达。

这些正弦向量通常与内容向量相加。仅对一对位置向量求点积，可以出现与差值有关的余弦项；但整个隐藏状态包含内容、位置以及后续学习的投影，不能直接宣称实际 QK 打分只依赖距离。RoPE 选择了另一处作用点：在 Q 与 K 已生成以后，把其中成对分量按各自位置旋转。理解这个区别，才能解释为什么绝对位置表插值与修改旋转频率不是同一个操作。`)+linkTo('transformer-block','回看 0.3：位置机制放在哪条计算路径上')],
      ['从单位圆构造二维旋转',prose(`约定向量写成列，逆时针旋转角 θ。矩阵 R(θ) 的第一行为 [cos θ,−sin θ]，第二行为 [sin θ,cos θ]。将它乘 [x,y]ᵀ，就得到 [x cos θ−y sin θ, x sin θ+y cos θ]ᵀ。两列互相垂直且各自长度为一，故 R(θ)ᵀR(θ)=I。旋转保持单个向量的范数，却可以改变它同另一个未同步旋转向量的夹角。这正是位置影响匹配、又不必凭空改变向量长度的原因。

对位置 m 的查询 q，令 q′=R(mω)q，ω 是每移动一格增加的角度，以弧度计。对位置 n 的键 k，类似令 k′=R(nω)k。这里位置乘频率得到角度，不能把“位置 2”直接解释为“旋转两度”。取 ω=π/2，q=[1,2]，m=2，角度 π，得到 q′=[−1,−2]。取 k=[3,2]，n=1，角度 π/2，得到 k′=[−2,3]。点积于是为 2−6=−4，这是第一组手算基准。

注意这里算的是缩放前 Q·K。实际 attention 还会除以 √d，加入相应 mask，再与其他合法 key 一起归一化。一个点积变号并不自动意味着某个输出按相同比例变化；若只有一个合法 key，它的权重仍为一。先单独核对旋转后的点积，再放回有多个候选的整行，是比直接观察最终生成文本更清楚的验证方式。`)],
      ['为什么留下的是 n−m，再平移一次验证',prose(`利用 R(a)ᵀ=R(−a) 与 R(a)R(b)=R(a+b)，可把旋转后的内积改写为 q′ᵀk′=qᵀR(mω)ᵀR(nω)k=qᵀR((n−m)ω)k。假设两组向量、频率与配对规则不变，只把位置同时加 c，则 (n+c)−(m+c)=n−m。绝对角度各自改变了，内积保持不变。符号采用 query 在左、key 在右的列向量约定；交换定义会得到相反的差值记号，实际计算必须同所用旋转方向一致。

把第一组例子同时平移两格，m=4、n=3。q′ 回到 [1,2]，k′=[2,−3]，点积仍为 −4。只把 query 的位置错误地重置为 0，key 保持 n=1，点积却变成 [1,2]·[−2,3]=4。这不是同平移，不能引用上一段的等价结论。再算第二组：q=k=[1,0]，ω=π/3，m=3、n=1，相对角为 −2π/3，点积 cos(−2π/3)=−1/2；平移到 m=6、n=4，仍为 −1/2。

定义里固定了内容向量。真实多层模型的 q、k 来自前层隐藏，前缀、边界条件、此前使用的位置机制及掩码都可能改变它们。上述证明只刻画给定向量对的旋转项，不是“任意平移文本后整模型预测严格不变”的证明。两组非零偏移的对照还说明，仅在位置零检查很弱：R(0) 是单位矩阵，旋转方向写反或特征配错都可能在这一点蒙混过关。`)],
      ['多频率怎样装进一个 attention head',prose(`设参与旋转的维数为偶数 r，将其分成 r/2 个二维平面。常见基线令 ωᵢ=θ_base^(−2i/r)，第 i 对按 pωᵢ 旋转。各对频率不同，向量内积是所有二维对的贡献之和。低频对在相邻位置的相位变化慢，高频对变化快；它们一起提供不同尺度的信息。某些模型只旋转 head_dim 中的一个偶数前缀，其余维度原样参与点积；底数、频率缩放、实际旋转范围和配对布局都属于模型约定。

一个小反例能查出布局错误。令四维 q=[1,2,3,4]、k=[4,3,2,1]，query 位置 1，key 位置 0，两对频率为 π/2 与 π。按相邻配对 (0,1)、(2,3) 旋转 q 得 [−2,1,−3,−4]，与 k 点积为 −15。若按前后半配对 (0,2)、(1,3)，不更换投影坐标却直接套用，旋转 q 会得到 [−3,−2,1,−4]，点积变为 −20。两者都保持向量长度，所以仅检查范数并不足够。

相邻配对和前后半配对本身都可以正确；在二维平面顺序及旋转方向一致时，同时重排 q、k 的坐标和频率映射即可得到等价计算。问题出在使用一种约定训练的投影，却只替换位置函数。转换 checkpoint 应用已知位置和已知分量的点积作独立基准。某一框架版本中名为 rotate_half 的函数，不是所有模型所有版本都必须采用的布局规范。`)],
      ['缓存里有两种“位置”：逻辑序号与物理槽位',prose(`prefill 处理四个真实提示 token，逻辑位置是 0、1、2、3。在一条常见的逐 token 解码路径中，各层缓存此时已保存四个位置的 K、V，最后一行 logits 给出下一 token。这个被选中的 token 还要在下一次 forward 中作为位置 4 输入，才产生它自己的 K、V。若误把新 query 的 position_id 重新设为 0，它与旧 key 的相位差全部改变，缓存的形状与长度却都可以看起来正常。

用于定位的 position_id、用于可见性的 mask、用于访问存储的 cache 索引是三个概念。左 padding 的 batch 可能有两条不同长度的真实提示；位置应该怎样编号，必须遵从模型和接口约定，不能直接把物理数组列号一律当作语义位置。分页缓存把不同请求的块放在不同物理页，页号不构成 RoPE 相位。滑动窗口若只保留最近几项，也不能在保留已旋转 K 的同时擅自把新位置从零编号。若设计协议允许整体重基，就要一致处理所有保留项。

做一个缓存身份的快照：记录 run、请求、模型配置摘要、该段 token 的逻辑起点与长度，再列出缓存页的物理映射。只交换页的位置但正确更新映射时，原来位置的 K 应仍以同样的相位被读到；如果一重排页号就改变了点积，说明实现把存储地址当成了位置坐标。这个验证也能帮助定位批次压缩、请求提前结束或缓存迁移之后才出现的续写偏差。

在许多实现中，缓存的是已经按原位置旋转的 K。对它再旋转一次、用另一套频率读取旧缓存、跨模型版本复用前缀，都可能产生数值错误而没有越界异常。先比较固定输入的完整前向与逐段续算，在第一个非零历史偏移处核对每层的新 query、旧 key、打分和输出。即使索引完全正确，还要按实际 cached key 长度给分块 query 构造可见掩码；位置旋转不会替你遮住未来。不同库的缓存参数与实现请按运行版本查看。`)],
      ['把长度调大之前，需要证明哪件事',prose(`正弦或旋转公式能在更大的整数位置上计算出数值，这只回答“坐标可以表示”。模型学到怎样利用这些相位，是另一个问题。位置插值等方案调整从逻辑位置到相位的映射，有的配合额外训练，不同模型配置会使用不同缩放策略。若推理过程改变了频率计划，而旧 K 仍按旧计划旋转，则同一次请求内的键与查询也可能失去一致口径。应固定模型、精度、上下文配置与缓存协议，在预期使用范围内验证。

容量也有独立账本。设每层完整保留上下文，模型有 32 层、每层 8 个 KV 头、每头 128 维，缓存元素按两字节。每 token 的逻辑 KV 为 2×32×8×128×2=131072 字节，即 128 KiB。单个请求从 32768 延长到 65536 个 token，逻辑缓存由 4 GiB 变为 8 GiB，还未计权重、分页浪费与分片方式。能分配第二份容量不等于模型在那个距离上回答得好；位置方案优于另一种也不能仅凭服务不 OOM 下结论。

验收要分层。先在短上下文比目标实现与参考实现的 logits，检查负载布局、精度和非零偏移；再按长度与关键信息的位置分桶，检验真实任务质量、困难负例和已有短上下文的退化；最后用相同输入输出分布观察预填充、逐 token 输出、错误率与资源成本。单个长文检索样例通过不足以覆盖推理、问答与多项证据组合，也不能把一次纯公式演算当成具体模型的可用长度承诺。`)],
      ['用一份标准库脚本检查三个独立不变量',prose(`把固定向量的例子单独做成脚本，不依赖真实权重或设备。第一项检查保持相对偏移的共同平移，第二项检查只重置 query 会改变点积，第三项检查配对布局未转换时会错、两边按同一坐标转换后会恢复。比较使用浮点容差，因为 π 的三角函数不会在计算机中总是精确得到整数。脚本刻意输出缩放前点积，便于和前文 −4、4、−1/2、−15、−20 的基准逐项对照。

面试追问：改了 KV cache 布局后，长提示开头相同、续写开始偏离，你会先收集什么？固定 token 而不让采样反馈扩大差异，分别记录首个续算 query 的实际逻辑位置、有效前缀范围、缓存来自哪个模型与频率方案、读出 K 是否已经旋转，以及显式配对布局。先找最早不同的点积，再排查输出与采样；若短位置一致而长位置系统性偏离，则将精度和相位缩放列为独立假设，用长度分桶的结果检验。`)+code('Python 标准库，运行后查看各项点积','BASH','python3 rope.py')+
        '<details class="full-code"><summary>展开完整位置实验源码</summary>'+code('rope.py · 固定向量的旋转与配对检查','PYTHON',ropeScript)+'</details><p><a class="inline-link" href="labs/model-foundations/rope.py" download>下载标准库位置实验 ↓</a></p>'+linkTo('model-serving','进入 7.3：跟踪实际生成请求的 KV 状态')]
    ],
    ['沿用 q=[1,2]、k=[3,2]、ω=π/2。正确的 m=2、n=1 得 −4。若只把 key 的位置重置为 0，点积是多少？若同时减去 1 使 m=1、n=0 呢？',
     '仅把 n 改为 0，旋转后 q=[−1,−2]、k=[3,2]，点积 −7。两者同时减一，q=[−2,1]、k=[3,2]，点积 −4。第二次保持相对位移，第一次改变了它。'],
    ['v9PosTransformer','v9RopePaper','v9RopeConfig','v9RopeImpl','v9PosInterp'],['attention-mechanics','transformer-block','model-serving']);
}
