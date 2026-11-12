/* Read serving as request state, then calculate capacity, execution and delivery separately. */
(()=>{
 const p=(...items)=>items.map(x=>'<p>'+x+'</p>').join('');
 const table=(heads,rows,className='table-wrap')=>'<div class="'+className+'"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const formula=(title,body,note)=>'<div class="knowledge-formula"><small>'+title+'</small><div>'+body+'</div>'+(note?'<p>'+note+'</p>':'')+'</div>';
 const fold=(title,body)=>'<details class="full-code"><summary>'+title+'</summary>'+body+'</details>';
 const heading=(id,title,level=3)=>'<h'+level+' id="'+id+'">'+title+'</h'+level+'>';
 const figures=html=>html.match(/<figure\b[\s\S]*?<\/figure>/g)||[];
 const codes=html=>html.match(/<div class="code-block">[\s\S]*?<\/pre><\/div>/g)||[];
 const pres=html=>html.match(/<pre\b[\s\S]*?<\/pre>/g)||[];
 const hrefs=html=>[...html.matchAll(/\bhref="([^"]+)"/g)].map(m=>m[1]).sort();
 const ids=html=>[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 const select=id=>{const a=articles.find(a=>a.id===id);if(!a||a.sections.length!==8)throw Error('Inference reading sections: '+id);return a;};
 // Retain the original citation/download markup and multiplicity without copying old exposition.
 const retainLinks=(before,after)=>{
  const available=new Map();for(const m of after.matchAll(/\bhref="([^"]+)"/g))available.set(m[1],(available.get(m[1])||0)+1);
  const missing=[];for(const m of before.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g)){const n=available.get(m[1])||0;if(n)available.set(m[1],n-1);else missing.push(m[0]);}
  return after+(missing.length?'<p class="practice-links">'+missing.join(' · ')+'</p>':'');
 };
 const replace=(a,bodies,description)=>{
  const before=a.sections.map(s=>s[1]);
  if(bodies.length!==before.length)throw Error('Inference reading body count: '+a.id);
  const after=bodies.map((body,i)=>{
   body=retainLinks(before[i],body);
   const existing=new Set(ids(body));
   for(const id of ids(before[i]))if(!existing.has(id)){body+='<span class="legacy-subsection-anchor" id="'+id+'" aria-hidden="true"></span>';existing.add(id);}
   return body;
  });
  if(JSON.stringify(pres(before.join('')))!==JSON.stringify(pres(after.join(''))))throw Error('Inference reading changed source: '+a.id);
  if(JSON.stringify(figures(before.join('')).sort())!==JSON.stringify(figures(after.join('')).sort()))throw Error('Inference reading changed figures: '+a.id);
  if(JSON.stringify(hrefs(before.join('')))!==JSON.stringify(hrefs(after.join(''))))throw Error('Inference reading changed links: '+a.id);
  a.sections.forEach((s,i)=>{s[1]=after[i];});a.desc=description;a.intro=description;a.updated='2026.11.08';
 };

 const serving=select('model-serving'),s=serving.sections.map(x=>x[1]);
 const sc=s.map(codes),sf=s.map(figures);
 // Native checkers sometimes omit this bridge so they can inspect it independently later.
 const hasSDPA=s[2].includes('id="sdpa-cache-path"')&&s[6].includes('id="sdpa-cache-run"');
 const sdpaPath=hasSDPA?heading('sdpa-cache-path','把模型前向改成增量调用')+
  p('TinyDecoder是前面模型基础章的同一个小模型：词表8项、隐藏宽8、两个注意力头、位置表4项，共664个参数。完整前缀路径每次从起点重算；缓存适配器保留上次的K/V，只把新位置送入原有层。两路使用同一次随机梯度下降SGD更新后的相同权重，才能把输出差异归因到执行路径。',
  '先处理[0,1]，再处理[2,3]。第二次输入有2项，但它们在完整序列中的位置是2、3；位置查表与可见性判断都要加上已缓存长度past=2。新K/V沿位置轴拼到旧K/V后，Q只属于本次两项；注意力后仍要经过残差、前馈和输出投影，才得到各候选词元的原始分数logits。')+
  sf[2].join('')+
  p('第二次的可见矩阵为[[True,True,True,False],[True,True,True,True]]：位置2读取0…2，位置3读取0…3。在本例PyTorch 2.5.1 SDPA接口中，布尔mask的True表示允许读取。显式交付该矩阵时设is_causal=False，并用dropout_p=0.0关闭接口内的随机丢弃。下面节选中的past、length、k分别表示旧长度、新输入长度和拼接后的全部K。')+
  sc[2][1]+
  p('若直接把非方阵调用设为is_causal=True，接口的局部左上三角不会自动加入past偏移。例如一个新query对3个key，本应全部可见，却只会看到第一项。第七节会用原生API的实际输出证明这个差异，并逐项核对同一模型的全部logits。'):'';
 const sdpaRun=hasSDPA?'<div id="sdpa-cache-run">'+
  p('<strong>再用同一个模型检查原生SDPA。</strong>SDPA是scaled dot-product attention，即缩放点积注意力的框架接口。tiny_decoder.py保留原forward作完整前缀参照；cache_lab.py继承同样的层，增加forward_cached。程序先复现两条序列原来的有效标签数[1,3]及一次更新，再逐项载入相同state_dict，即参数名到张量的对应表。新增缓存仍为664参数。',
  '完整解压实验包后运行下列命令。requirements.txt固定torch==2.5.1；保留记录使用Python 3.12.13、CPU、float64、单线程，并用SDPBackend.MATH明确选择数学实现。先在第二位置续算时写出上节的可见矩阵，再检查JSON中的query_positions、visible与required_visible。')+
  sc[6][2]+
  table(['实际对照','保留记录','对应的检查'],[
   ['Attention章同一组三行Q/K/V','完整[[2,0],[0.5,3],[3.5,2]]；最后query的输出为[3.5,2]','纸笔加权结果接到原生接口'],
   ['同权重模型：1+1+1+1、2+2、2+1+1','全部logits最大误差约1.776e−15','不只比较形状或输出ID'],
   ['缓存调用误设is_causal=True','logits最大误差1.204146；断言实际拒绝','第一个decode是1个query、3个key'],
   ['提示[0,1]，连续选3项argmax','输出1、1、1；缓存2→3→4','选中最大分数ID后，下次才把它作为输入'],
   ['CPU profiler观察算子派发','aten::_scaled_dot_product_attention_math','本次实际走CPU MATH路径']
  ])+
  p('三行手算的最后query本应读全部3项，得到[3.5,2]；错误调用实际只读第一项，得到[2,0]。同一错误放进模型后，由未改动的完整前缀forward发现logits差异。只核对最终argmax可能漏掉错误，因为分数已经变化时，最高分ID仍可能相同。',
  '生成轨迹只用原模型4个可输入位置：prefill处理2项，随后两次decode各处理1项，最后逻辑序列含5项而缓存为2+3−1=4项。第3个输出尚未前向，因而没有访问第5个位置表项。这个极小模型输出的ID用于核对执行状态。',
  '本记录证明CPU原生SDPA与此连续、无padding的缓存适配相符；没有执行GPU FlashAttention，也没有GQA、RoPE、分页块池或服务调度。数学实现的派发记录没有提供速度比较，CPU双精度误差也不能直接变成低精度设备的容差。')+
  fold('完整cache_lab.py：与下载源码逐字一致',sc[6][3])+
  fold('完整tiny_decoder.py：原模型参照逐字保留',sc[6][4])+'</div>':'';

 replace(serving,[
  p('模型推理用固定参数把输入变成候选分数，再选择输出。模型服务还要接收请求、安排计算、保存生成状态并把结果交回客户端。一个请求通常包括提示文本、输出上限和选择规则；分词器把文本切成词元token并转换为词表编号。词元不一定是完整汉字或单词。',
  '服务中的对象分工不同：模型权重是跨请求使用的参数；输入ID是本次提示；KV缓存是已处理位置在注意力层中留下的状态；调度器决定下一轮推进哪些请求；执行器在设备上运行模型算子；流式连接把已产生的内容逐段交付。网络收到一段文本与模型刚选出一个词元，是两个事件。',
  '先采用普通自回归Transformer：每次根据已有前缀选择下一词元，再将所选项用于后续生成。已知提示可以一次处理多个位置，称为prefill（预填充）；有了首个输出后，继续消费刚选出的词元，称为decode（解码）。二者都运行模型层，只是本次已知输入的位置数不同。',
  '用户的两种等待由此出现：首个输出前要经过入口、排队、提示计算和传回；首个输出后还要等待后续各轮及传输。Prefill的多个已知位置可在因果约束下组织并行计算；未来输出尚未选定，普通decode沿生成方向逐步依赖。具体速度仍由长度、批量、实现与设备共同决定。'),

  p('用一个请求走完正常生成：提示已经分成12项，希望输出A、B、C共3项。A/B/C只是编号的教学标签。前向forward指让本次输入经过嵌入、注意力、前馈及输出投影；最后输入位置的logits用于选择下一项。选择可以取最高分，也可以按概率采样，本表只追踪状态，不规定随机策略。')+
  sf[1][0]+
  table(['轮次','本次真正前向的输入','随后选出的输出','每层已写入的KV位置'],[
   ['Prefill','12个提示词元','A','12'],
   ['Decode第1步','刚选出的A','B','13'],
   ['Decode第2步','刚选出的B','C，达到上限后停止','14']
  ])+
  p('表中缓存计数发生在本轮前向完成之后。产生C的输入是B；停止时C还没有被送回模型，所以没有C自己的KV。设提示长度P、实际输出数G≥1，普通循环做1次prefill、G−1次decode，停止前已处理位置为P+G−1。本例是12+3−1=14；逻辑文本序列则已有12+3=15项。',
  '服务为请求保留提示ID、已经选择的输出、已处理长度、缓存引用及停止状态。下一轮从这些对象继续，通常不需要从客户端重新上传全部前缀。达到输出上限、选中停止标记或收到取消后，运行时结束请求、回收其引用并关闭输出流；设备仍在使用的存储必须等待在途计算结束。',
  '逻辑缓存长度与物理预留容量不同。引擎可能按整块预分配、为未来增长预留空间或裁剪历史；推测解码还可能临时计算候选。本章先固定普通循环的观察时点，下一节解释哪些数值可以留下，后面再计算块分配。')+
  (sf[1][1]||''),

  p('注意力用当前位置的查询向量Q，与允许读取位置的键向量K计算相似分数；Softmax将分数归一化为权重，再对值向量V加权相加。Q、K、V由本层输入经过不同投影得到。K/V中的“键值”描述匹配与取值的角色，缓存保存的是向量。',
  '因果约束规定一个位置只能读取自己及此前位置。模型参数、位置规则和可见前缀相同且推理过程确定时，追加未来词元不会改变旧位置原先算出的表示；因此各层旧K/V都可以保存。新一轮只算新输入的Q/K/V，把新K/V追加后，用新Q读取可见的全部K/V。',
  '旧Q用于计算旧位置的输出，而本轮需要新位置的输出，所以普通增量路径不必留住全部旧Q。缓存节省重复计算旧表示；当前注意力仍会读取所需历史KV，长上下文仍可能增加读取与计算成本。对相同文本换模型、适配参数或位置含义，不能直接沿用原缓存。',
  '下面的固定向量实验把完整因果注意力与逐位置追加KV比较，误差小于10⁻¹²；还通过修改未来V及移除mask构造反例。mask是规定哪些位置可读的掩码。此例只有单头固定向量，先验证“未来不可影响过去”和“缓存路径应等价”，框架坐标另用后面的原生实验核对。')+
  sc[2][0]+sdpaPath,

  p('先算一个已处理位置在所有层保留多少KV。L为注意力层数，Hkv为每层KV头数，d为一个头的维度，b为每元素字节数。每层两份向量各有Hkv×d项，所以每位置为2×L×Hkv×d×b。头是注意力中并行的一组投影和读取；分组查询注意力GQA让多组Q共享一组K/V，因而这里必须数KV头。')+
  sc[3][0]+
  p('上面的大模型容量题取L=32、Hkv=8、d=128、b=2，每位置是2×32×8×128×2=131072字节，即128KiB。KiB=1024字节，MiB=1024KiB，GiB=1024MiB。一条保留4096位置的请求占4096×128KiB=512MiB；16条彼此不共享的请求共8192MiB=8GiB。')+
  '<div id="kv-demo"></div>'+
  p('若这16条都保留8192位置，逻辑KV变成16GiB。题设只给KV预算10GiB，则前者8GiB尚未超出逻辑预算，后者16GiB已经超出。权重、临时工作区、分页尾部空位和分配器元数据要另计；10GiB是给定输入，没有测量任何设备。',
  '逻辑字节数统计这些向量的有效载荷；分配字节数统计实际给它们占下多少存储；逐设备占用还取决于分片和复制。张量并行怎样分布KV、是否有滑动窗口、精度是否改变、前缀是否共享，都要从具体实现确认。状态放得下之后，仍需计算与搬运时间才能判断速度。'),

  p('静态批次先凑好一组请求再一起运行。读一轮调度时，分别数参与的请求和送进模型的输入行。上面两条解码请求各送一行，预填充一次可以送入同一请求的多行。队列里还没轮到的请求另计。')+
  table(['机制','具体改变的对象','直接影响'],[
   ['连续批处理','每轮参与计算的请求集合','设备工作量及请求等待机会'],
   ['分块prefill','一个长提示本轮处理的位置数','提示跨轮数及对decode的干扰'],
   ['前缀缓存','满足同一计算身份的历史K/V','重复计算与共享存储'],
   ['按块管理KV','逻辑位置到物理存储的映射','按需增长、尾部空位及回收']
  ])+
  p('调度器先做准入：判断能否让请求进入活动集合；再做选取：决定本轮给谁多少输入位置。假设每轮最多处理8位置，策略先为3条decode各给1位置，则只剩8−3=5位置给提示。即使请求数量上限还有空位、计算也剩5位置，若KV没有可分配块，新位置仍无法安全写入。请求数上限、每轮工作量、状态驻留空间是三项约束。',
  '长提示若一次处理太多位置，会延长同轮其他请求等待下一次输出的时间。分块让调度器在提示尚未完成时重新分配机会，却可能增加提示的轮数及执行开销。要在相同到达与长度分布下比较首输出和输出间隔，才能知道等待转移给了谁。')+
  heading('subsection-5-qvstci','从两条逻辑序列算到三个物理块')+
  p('物理块是存放一组KV位置的实际存储，块表记录请求的第几个逻辑块放在哪里；它与CUDA线程块是不同对象。独立题设：块长4，每位置仍为128KiB，故每块512KiB。A=[1,2,3,4,5,6]、B=[1,2,3,4,7,8]均已前向处理，计算身份相同，共同完整首块已登记可复用，两个未满尾块分别保存。')+
  sf[4].join('')+
  table(['计数对象','各自分配','共享完整首块'],[
   ['逻辑位置','6+6=12','仍为12'],
   ['分配的物理块','2+2=4','1共享+2私有=3'],
   ['分配字节','4×512=2048KiB','3×512=1536KiB'],
   ['唯一有效KV位置','12','4+2+2=8'],
   ['尾部空位','2+2=4','仍为4']
  ])+
  p('引用计数记录当前多少活动请求持有一个块。A结束时，共享首块从2个引用减到1，B仍在读取，不能覆盖它；引用归零后，缓存策略可以继续保留完整块供未来命中，也可以在压力下逐出。结束一个请求、删除缓存索引、让存储重新可分配，是不同状态变化。',
  '复用键要绑定模型、位置规则、适配器和允许共享的范围。适配器是改变基础模型计算的附加参数；深层KV还依赖此前完整上下文，因此块内词元相同、祖先前缀不同也未必相同。分叉若共享未满尾块，之后写入需先复制或采用其他隔离办法。性能章用实际CPU块池逐步检查这些所有权变化。',
  '共享省掉重复前缀的计算和部分存储，各自的新Q仍需读取其合法历史。权重量化改变另一组对象，不能把权重压缩比例直接套到KV或每步耗时。'),

  p('容量限制表示状态或工作区放不下；延迟表示某个事件到另一个事件隔了多久；吞吐表示同一时间窗口完成多少工作。三者需要分别观测。例如“第一句话慢”可能是入口排队、提示计算、选择输出或传输中任何一段较长。先给请求记录到达、获准、执行及交付事件，再判断扩容能改变哪段。')+
  table(['症状','需要对齐的观察','据此检查'],[
   ['首输出晚','到达→获准，获准→首输出生成，生成→客户端收到','准入空间、队列、prefill和传输'],
   ['首输出快，之后停顿','逐输出生成与接收时刻、每轮所选请求','decode机会、设备执行和网络合并'],
   ['并发增长后不能接入','权重以外的KV、工作区、块池和重算','限制来自状态驻留还是每轮工作量'],
   ['完成量增加但体验恶化','完成请求、失败、超时、长度与间隔分布','是否用排队和长尾换取吞吐']
  ])+
  p('GPU利用率反映设备活动的某个采样口径，不能独自说明请求在哪等，也不能证明输出质量。比较方案时同时保留输入输出长度、任务评价和错误结果，并固定模型及负载。下一章从客户端时间戳算TTFT、TPOT和窗口吞吐，再把它们接回调度轨迹。'),

  p('第一个实验gqa_serving.py只需Python 3.9+标准库。GQA为分组查询注意力：本例4个Q头共享2组K/V，正确映射是[0,0,1,1]。位置规则用二维RoPE，即按位置旋转Q/K向量；旧K保留其原位置，新Q必须使用完整序列位置。输入为[1,2,−1,3]，每位置每头输出2个数。')+
  sc[6][0]+
  p('程序两条路径分别从完整可见前缀重建KV、向历史列表追加KV；逐位置比较输出，并用首位置精确值和第二位置闭式值作独立参照。它还故意改成错组映射[0,1,0,1]，以及把新Q位置重置为0，观察数值怎样偏离。')+
  table(['检查','保留结果','说明'],[
   ['全前缀与增量','最大误差0','同一头映射、位置和因果前缀'],
   ['错误Q→KV组映射','最大误差3.851930','形状仍正确，数值已错'],
   ['新Q错误使用位置0','最大误差4.015659','旧K坐标与新Q不再对应'],
   ['大模型独立字节题','128KiB/位置；8192位置为1GiB','32层、8KV头、128维、2字节'],
   ['8GiB池，16位置/块，8193位置/请求','每条513块，最多7条','按整块向上取整']
  ])+
  p('最后一行的每块为16×128KiB=2MiB，8GiB一共4096块；8192位置要512块，而8193要ceil(8193/16)=513块，所以floor(4096/513)=7。多出的一个逻辑位置会使每条多占整块。这里没有跨请求共享，也没有计算权重与工作区；不是把四位置小向量例子放大后实际分配设备内存。',
  '程序另带固定客户端事件A=(到达0，输出40/50/60ms)、B=(到达20，输出80/100ms)。A的TTFT=40ms、TPOT=10ms，B为60ms和20ms。在含右端输出的100ms窗口里共5项，得到50token/s；按TTFT≤50ms且TPOT≤15ms筛选，只有A，得到10请求/s。时间全部为给定输入，下一章展开这些分母。')+
  fold('完整gqa_serving.py：GQA、位置、容量和合成时间分开计算',sc[6][1])+
  p('上述实验实际执行手写数值计算和算术校验，没有完整Decoder、分页分配器、服务引擎或GPU。下载记录提供源码摘要与原始结果，可先检查同一源码再复跑；不同实验中的相似数字只在各自题设内成立。')+
  sdpaRun,

  p('量化用较少位数表示指定的数值对象。权重量化、KV量化和激活量化会改变不同存储与算子；还要计比例尺、零点、打包和必要的展开缓冲。模型服务先完成请求、缓存和调度的对象区分，再去量化章逐项算字节并比较数值与任务质量。',
  '独立量化章保留整数与比例尺、分组打包、字节与执行账本、校准，以及INT4打包和CPU INT8实验。阅读时把每项压缩明确对应到本章权重、KV或临时结果，才能推导它实际影响哪份容量与执行。')+
  (s[7].match(/<ul class="chapter-migration-links">[\s\S]*?<\/ul>/)?.[0]||'')
 ],'沿一次请求走完预填充、逐步生成与KV回收，再从位置、头数和物理块计算容量，并核对CPU缓存实验。');

 const kvBudgetStart='因而这里必须数KV头。</p>';
 const kvBackingStorage=heading('sdpa-cache-storage-bytes','同一份 KV，为什么会有两个字节数？')+
  p('先沿用<a href="/article/model-serving/#sdpa-cache-run">原生 SDPA 实验</a>的 TinyDecoder。模型只有一层、两个 KV 头，每头四项，CPU 双精度每项 8 字节。每个位置的逻辑 KV 是 2×1×2×4×8=128 字节。提示 [0,1] 预填充后有两个位置，所以 K 和 V 合计 256 字节。',
  '第一次调用一次算出形状为 [1,2,24] 的 QKV 张量。K 和 V 是指向其中不同片段的视图，共同保留整份 384 字节。旧 Q 后面用不到，它占的字节还在这份存储里。下一轮用 <code>torch.cat</code> 分别拼接旧 K 和新 K、旧 V 和新 V，返回两份独立的存储。')+
  table(['位置数','KV 逻辑字节','底层字节','存储份数'],[
   ['2','256','384','1'],
   ['3','384','384','2'],
   ['4','512','512','2']
  ],'table-wrap table-wrap-compact')+
  p('表中只数每轮返回后 K、V 引用的存储，同一份存储只加一次。拼接时还会有同时存活的新旧张量，内存峰值要另测。<a href="/article/gpu-memory/#memory-state-objects">回看显存章怎样按存储去重</a>。')+
  fold('复跑 · 在 CPU 上同时读出两个字节数',
   p('解压<a href="/labs/sdpa-cache.zip" download>原 SDPA 实验包</a>，按<a href="/labs/sdpa-cache/README.md">运行说明</a>安装 PyTorch 2.5.1，再在解压目录运行。程序重做一次原来的更新，然后按同一提示生成三项。')+
   trainingCode('用原缓存函数检查逻辑字节与底层存储','SHELL',`python -B - <<'PY'
import torch
from torch.nn.attention import SDPBackend, sdpa_kernel
from cache_lab import CachedTinyDecoder, update

torch.manual_seed(7)
torch.set_num_threads(1)
model = CachedTinyDecoder().double()
rows = torch.tensor([[0, 1, 2, 3, 4], [4, 5, 6, 7, 0]])
ids, labels = rows[:, :-1], rows[:, 1:].clone()
labels[0, 1:] = -100
labels[1, 3:] = -100

with sdpa_kernel(SDPBackend.MATH):
    update(model, ids, labels, micro_size=2)
    model.eval()
    cache, next_ids = None, [0, 1]
    observed, selected = [], []
    with torch.inference_mode():
        for _ in range(3):
            scores, cache, event = model.forward_cached(
                torch.tensor([next_ids]), cache
            )
            logical = sum(t.numel() * t.element_size() for t in cache)
            storages = [t.untyped_storage() for t in cache]
            unique = {s.data_ptr(): s.nbytes() for s in storages}
            observed.append((event["cache_length"], logical,
                             sum(unique.values()), len(unique)))
            next_ids = [int(scores[0, -1].argmax())]
            selected.extend(next_ids)

assert selected == [1, 1, 1]
assert observed == [(2, 256, 384, 1), (3, 384, 384, 2), (4, 512, 512, 2)]
print("位置数 KV逻辑字节 底层字节 存储份数")
for row in observed:
    print(*row)
PY`)+
   p('<code>numel()</code> 数当前张量可见的元素。<code>data_ptr()</code> 在这一轮区分底层存储，<code>nbytes()</code> 读整份存储的大小。读表时先确认统计的是哪一层。'));
 if(serving.sections[3][1].split(kvBudgetStart).length!==2)throw Error('Serving KV storage insertion point changed');
 serving.sections[3][1]=serving.sections[3][1].replace(kvBudgetStart,kvBudgetStart+kvBackingStorage);

 serving.sections[4][1]=p('客户端先发 A，收到 A 的首个输出后才发 B。在 Apple M4 Pro 的一次 llama.cpp 双槽运行中，B 在 A 结束前获得另一个槽位。槽位保存一条请求的进度和历史。本轮送进模型的输入行合成一个批次，下面是这份记录的第 5 个引擎分批，位置从 0 数。')+
  '<ul><li>A 送入词元 9（位置 6），接着选出 10。</li><li>B 送入词元 11（位置 5），接着选出 12。</li></ul>'+
  p('两行一起算，仍各自读取自己的历史，输出也各回各的请求。新请求可以在已有请求生成途中加入后续批次，完成的请求可以移出，这叫连续批处理。<a href="/article/inference-performance/#native-metal-queue">核对同一批的输入、设备日志和两个输出流 →</a>')+serving.sections[4][1];

 const servingBlockBoundary='<h3 id="subsection-5-qvstci">';
 const servingRows=heading('serving-rows-and-history','这一轮算几行，要留下多少历史？')+
  p('把刚才的 8 个位置接到模型里。第 i 条请求已有 Tᵢ 个已处理位置，本轮再处理 qᵢ 个新位置。本轮进入逐位置线性层的总行数是 M=Σqᵢ。三条解码请求各取 1 个位置，长提示取 5 个，就是 M=1+1+1+5=8；队列中还没轮到的请求没有计入这 8 行。')+
  trainingFigure('serving-rows-and-history','本轮的 8 行决定线性层的工作量；各请求已有的历史继续占用 KV，处理完后再追加这 8 个位置。')+
  p('沿用 <a href="/article/roofline-model/#section-4">Roofline 的 4096×4096 线性层</a>，本轮计算是 X[M,4096]×W[4096,4096]。M 变大，同一份权重可以服务更多行。注意力还要让各请求的新查询读取各自允许看到的历史。即使 M 相同，Tᵢ 不同，注意力要处理的上下文和缓存容量也会不同。')+
  p('再接回第 4 节的模型预算，每个位置在全部层的 KV 合计为 128KiB。先按各请求独立保存、处理后保留全部历史计算，新增逻辑 KV=M×128KiB，轮后逻辑 KV=Σ(Tᵢ+qᵢ)×128KiB。上面的混合批新增 8×128KiB=1MiB，原来的历史仍要保存。')+
  table(['本轮安排','线性层行数 M','轮后逻辑 KV'],[
   ['一条新提示，一次处理 256 位置','256','256×128KiB=32MiB'],
   ['16 条各有 4096 位置的请求，各解码一次','16','16×4097×128KiB=8GiB+2MiB'],
   ['256 条各有 4096 位置的请求，各解码一次','256','256×4097×128KiB=128GiB+32MiB']
  ])+
  p('第一行和第三行的线性层同为 M=256，第三行光逻辑 KV 就超过题设的 10GiB 预算。能给线性层凑出多少行，要受请求历史与可用空间约束。调度器分配本轮位置、执行器计算这些行、缓存管理器保存和回收历史，这三项工作由此接在一起。上述是形状与容量的算术，分页尾部和工作区在后面的分配账中另计，实际时延再按请求事件测量。')+
  '<p class="source-at"><a href="https://huggingface.co/docs/transformers/main/en/cache_explanation#cache-class">Transformers 的新输入与历史缓存形状 ↗</a> · <a href="https://docs.vllm.ai/en/v0.10.2/configuration/optimization.html#chunked-prefill">vLLM 0.10.2 的混合批与位置预算 ↗</a></p>';
 if(serving.sections[4][1].split(servingBlockBoundary).length!==2)throw Error('Serving rows bridge insertion point changed');
 serving.sections[4][1]=serving.sections[4][1].replace(servingBlockBoundary,servingRows+servingBlockBoundary);
 const reuseBoundary='性能章用实际CPU块池逐步检查这些所有权变化。';
 if(serving.sections[4][1].split(reuseBoundary).length!==2)throw Error('Missing cache reuse bridge insertion point');
 serving.sections[4][1]=serving.sections[4][1].replace(reuseBoundary,reuseBoundary+'<a href="/article/inference-performance/#native-vllm-cache-scope">对照词元完全相同时，租户范围怎样改变缓存命中 →</a>');

 const performance=select('inference-performance'),q=performance.sections.map(x=>x[1]);
 const qc=q.map(codes),qf=q.map(figures);
 const hasPool=q[2].includes('id="inference-cache-mechanism"')&&q[5].includes('id="inference-cache-run"');
 const poolMechanism=hasPool?'<div id="inference-cache-mechanism">'+heading('subsection-3-1nk63tb','按需块池怎样取得和归还空间')+
  p('按需分配时，新位置要写入才申请空间。请求保存逻辑输入和块表，池保存实际 K/V、引用数和前缀索引。调度器查可用块，决定请求能否继续。完整预留则会提前占下未来位置的空间。')+
  heading('subsection-3-icqxg5','用块表找到一个逻辑位置',4)+
  p('逻辑位置从0数，块长4时，位置5位于逻辑块floor(5/4)=1、块内偏移1。若A块表为[P0,P1]，读取先取表中第1项P1，再取P1的第1格。B块表可为[P0,P2]，与A共享首块，同时有独立尾部。块号描述映射，物理槽实际保存数值。',
  '本例A=[1,2,3,4,5,6]、B=[1,2,3,4,7,8]，共12个逻辑位置；共享首块后只保存4+2+2=8格有效KV，分配3×4=12格容量，4格是尾部空位。每格对应的真实模型字节需另乘层数、KV头数和格式，Python对象内存不等于128KiB/位置的另一道字节题。')+
  heading('subsection-3-10ydz4e','完整前缀复用与分叉尾块',4)+
  p('前缀是从序列起点开始的连续输入。此池只把完整块放入公共前缀索引；键是计算身份加截至该块的完整词元元组，因而相同尾部接在不同祖先后不会误命中。计算身份包括模型、位置版本、适配器和共享域；适配器为改变模型计算的附加参数。实际引擎可用绑定父链的指纹，还需处理碰撞和隔离。',
  '引用数refs只数活动请求持有者。A/B共享首块时为2。分叉fork把A已有状态复制为C，两者可暂时共享A的未满尾块；C追加9前要先分配新块、复制旧尾部两格，再让C改指新块并写入。这叫写时复制COW，目的是让两个后续分支各自保留正确历史。先分配成功再改变引用，才能在池满失败时保住原状态。')+
  qf[2].slice(1).join('')+
  heading('subsection-3-cwmlui','释放引用、逐出索引与恢复重算',4)+
  p('完成或暂停请求时，close只释放该请求持有的引用。归零的完整块仍可被前缀索引找到，未来请求能重新引用；有压力时allocate可以逐出它、删除旧索引，再把物理槽交给新内容。正在被活动请求引用的块不会被覆盖。异步设备实现还需等待在途读写结束，本例是同步CPU。',
  '同一个槽可能被多次重用，因此句柄Handle同时带槽号与代次generation。P2第1代已释放重分配成第2代后，旧句柄不能再读取。恢复请求若只保留词元而旧KV已逐出，就需要重新前向；这部分重算也要计入工作预算和等待。此实验采用空闲未索引块优先，其次逐出最久未触及的零引用缓存。')+
  heading('subsection-3-nrn0x9','把空间许可变成执行机会',4)+
  p('有块可写只代表状态能增长，还要在本轮预算中选中该请求。新提示一直优先会使已开始输出的长请求连续等待；轮转把未完成者放回队尾，让它再次取得机会，同时可能推迟晚到的短请求。比较时须一起读长请求输出空档、短请求首输出等待和完成工作量。第六节在相同注意力核与负载上运行这两种策略。')+'</div>':'';
 const poolRun=hasPool?'<div id="inference-cache-run">'+heading('subsection-6-lachm','实际块池：先验证数值和所有权')+
  p('paged_cache.py用Python 3.9+标准库建立真正保存数值的列表块池。数值核为两层标量因果注意力，每层K/V各1个数；词元用整数代替，没有完整Decoder权重或分词器。标量仍保留第二层KV依赖完整历史的性质，足以让错误共享产生可检查的差异。')+
  heading('subsection-6-i6f5lp','一格KV怎样算出并与完整前缀对照',4)+
  p('第i位置的输入t先算k₁=0.13t+0.03i、v₁=0.17t−0.02i、q₁=0.11t。q₁乘可见各k₁得到分数，Softmax归一化后加权各v₁，得到z。再算k₂=0.7z+0.05i、v₂=0.9z+0.02t、q₂=0.8z，重复同样的注意力得到预测分数。只有1维，缩放因子为√1=1；改变适配器时第一层k另加0.4。',
  'Block.cells每格实际存(k₁,v₁,k₂,v₂)。增量step读取历史格只算新输入；独立reference用自己的循环从完整前缀重算。audit逐格比较KV及最后分数，容差10⁻¹²，并从全部块表重新计数引用。这样既能发现指错槽，也能发现槽号正确但内容已被另一分支修改。')+
  heading('subsection-6-10lmpd4','沿同一组A、B、C观察分配',4)+
  p('压力实验固定4个物理块、每块4位置。先打开A/B，再从A分叉C并追加9。computed只统计实际执行新位置前向的次数；reused统计直接使用完整前缀的位置；copies统计尾块复制次数，复制旧数值不算一次新前向。')+
  table(['操作','状态或失败结果','累计computed / reused / copies'],[
   ['打开A与B','首块2引用，分配3块，8格有效KV','8 / 4 / 0'],
   ['分叉C，C追加9','首块3引用，C新尾块P3','9 / 4 / 1'],
   ['D申请4位置','所有块均被引用，拒绝且旧状态不变','9 / 4 / 1'],
   ['关闭B后再申请D','重用P2为第2代，旧句柄报stale_generation','13 / 4 / 1'],
   ['暂停A、关闭C，D增长，打开E','零引用的A首块被逐出，索引删除','25 / 4 / 1'],
   ['关闭D并恢复A','A原6位置均需重算','31 / 4 / 1']
  ])+
  qf[5][0]+
  p('此池索引只保存KV，没有保存最后的预测分数。open复用时至少留下最后一个输入重算该分数；块粒度可能留下整个尾块。因此相同提示命中也不代表零计算。全部请求结束后活动引用总数必须为0，仍保留零引用完整缓存则符合此处明确的保留策略。')+
  qc[5][0]+
  heading('subsection-6-10t5wk9','按一次追加的调用链读源码',4)+
  table(['对象或函数','实际负责的变化','检查点'],[
   ['Sequence / Block / Handle','逻辑词元与块表 / KV格与引用 / 槽和代次','第5位置怎样定位'],
   ['open → append → step','命中完整前缀，申请或复制，计算新格','命中后为什么仍算尾部'],
   ['fork → append共享尾块分支','先申请和复制，再改C的引用','失败后原快照是否相同'],
   ['close → release；allocate → resolve','归零、逐出、更新代次、拒绝旧句柄','有无引用泄漏与陈旧访问'],
   ['reference → audit','独立重算数值并重数引用','输出相等与所有权正确同时成立']
  ])+
  fold('完整paged_cache.py：与下载文件逐字一致',qc[5][1])+
  heading('subsection-6-38l2a0','让共享写与前缀身份真的出错',4)+
  p('反例命令关闭COW后，C先向共享尾块追加9，A再追加8；audit实际发现cached_cell_differs_from_full_prefix并使程序非零退出。另有只剩1块的分叉案例，复制无空间时会报all_blocks_referenced，失败前后内容与引用快照完全相同。失败必须保持旧状态才能安全等待或重试。',
  '身份反例把[1,2,3,4,5,6,7,8]的后4格，错误交给[9,9,9,9,5,6,7,8]。块内输入相同，第二层却依赖不同祖先，最终分数误差约0.206779。正确实现改变适配器后原前缀不命中，重新计算5位置、复用0。这些对照检查数值，单看缓存命中计数无法发现错误历史。')+
  heading('subsection-6-1i98zxe','同样20个输入位置的两种调度',4)+
  p('调度对照换成32块池以排除空间压力。A在迭代0到达，提示1位置、输出4项；迭代1…8每轮到达2条提示1位置、输出1项的短请求，合计17请求。每轮最多处理2个输入位置，每请求最多1位置；数值分数经固定choose规则选择输出，所有生成序列再与独立完整前缀路径核对。',
  '新提示优先在每轮先选还没有输出的请求；轮转则选队首，未完成者回队尾。A的输出迭代分别为[0,9,10,11]与[0,1,2,4]。例如前者最大空档9−0=9轮，后者最大为4−2=2轮；迭代8到达的B81在前者当轮输出，后者还要等2轮。')+
  qf[5][1]+
  table(['实际运行结果','新提示优先','轮转'],[
   ['A最大输出空档','9迭代','2迭代'],
   ['B81首输出等待','0迭代','2迭代'],
   ['计算输入位置 / 完成请求','20 / 17','20 / 17'],
   ['全部完成轮数','12','11']
  ])+
  p('20个输入来自A的1+4−1=4位置，加16条单输出请求各1位置。末尾只剩A时每轮只能用1份预算，所以总轮数还受每请求上限约束。上述迭代数是离散机会，不是毫秒；程序实际执行CPU注意力、块分配和调度转换，没有测GPU每轮用时，也不能把轮数变化换算为真实服务吞吐提升。')+'</div>':'';
 const schedulerOffset=hasPool?2:0;
 const transferLowerBound=fold('交接数据量怎样换成耗时下界',
  p('若把预填充与解码放在不同机器，解码侧需要取得其历史KV。独立题设每位置128KiB，4096位置为512MiB=536870912字节；链路有效载荷速率25GB/s，GB为十进制。假定交接完全串行、不压缩、不复用、不能与计算重叠，暂不计启动和协议。')+
  table(['同一观察点到第2项输出','25GB/s','12.5GB/s'],[
   ['搬运的理想时间下界','536870912/(25×10⁹)=21.47ms','42.95ms'],
   ['共置100ms，拆池省30ms排队','100−30+21.47=91.47ms','100−30+42.95=112.95ms']
  ])+
  p('下界为91.47ms只表示有改善机会，真实复制、同步和新队列仍会增加时间；112.95ms在题设内已超过原100ms。若首词元由prefill侧先返回，交接主要影响第1到第2项间隔，不能把交接全部加到TTFT。支持重叠时需重新画关键路径，并固定硬件总预算和请求分布比较。'));

 replace(performance,[
  p('请求 B 发出去后，约 23.588 ms 才收到第一项输出。接下来的 31 个间隔平均约 0.215 ms。这是第 6 节本机 CPU 实验的第一轮记录。客户端收到 A 的第一项输出后马上发送 B。合成模型为 A 生成 110 项，为 B 生成 32 项。引擎同一时间只保存一条正在生成的序列及其推理状态，这个位置叫槽位。服务端日志显示 B 等过槽位，客户端记录的是从发送到接收的整段时间。',
  '模型生成的每一项叫作词元。要把开头的等待和后续输出分开，先记客户端发送 t₀、服务端开始调度 tₛ、客户端收到首词元 t₁、客户端收到末词元 tₙ。TTFT（time to first token，首词元等待）是 t₁−t₀，其中可能有上传、排队、预填充和结果传回。预填充（prefill）负责处理提示并准备后续生成所需的状态。服务端也可能从入队或执行开始计时，比较前先核对两端量的是哪一段。',
  '一条流式事件是客户端收到的一条消息，可能带多个词元，也可能只带状态。知道消息与词元的对应关系，才能用事件时间量词元间隔。对应关系未知时，报告消息间隔。同一客户端用单调时钟量时间差，避免系统时间校准影响结果。若要用两台机器的时间戳算同一段耗时，还要核对时钟同步和误差。'),

  p('从 B 收到第一项开始，再数到第 32 项，一共走过 31 个间隔。TPOT（time per output token）在本章就指首词元之后的平均间隔。一般地，N 项输出有 N−1 个相邻间隔。下面另用一条有 51 项输出的教学轨迹，按秒记录每个时点。')+
  table(['事件','时间或数量'],[
   ['客户端发送t₀','0.0s'],['服务端开始调度tₛ','0.2s'],['客户端收到首项t₁','0.4s'],['客户端收到末项tₙ','1.4s'],['输出数N','51']
  ])+
  formula('同一请求的三个区间','TTFT = 0.4−0.0 = 0.4s = 400ms<br>首项之后持续时间 = 1.4−0.4 = 1.0s<br>TPOT = 1.0/(51−1) = 0.02s = 20ms','发送到末项为1.4s，包含首项前等待；不能拿这1.4s代替TPOT的分子。')+
  p('调度开始到客户端首项为0.4−0.2=0.2s，这个跨端区间同时含执行和交付。若另外记录服务端首项生成为0.35s，调度到生成是150ms，生成到接收是50ms；仍要先核对两端时钟，才能把它们当作可靠分段。单凭四个事件无法继续拆出纯prefill耗时。',
  '若N=1，就有0个后续间隔，TPOT应为空，而非0。若50个间隔中49个为10ms、1个为510ms，合计490+510=1000ms，平均依然20ms，却出现一次半秒停顿。应另外统计逐间隔分布或最长无输出时长，并说明是按请求还是按全部间隔聚合。',
  '每请求先求TPOT再平均，会给不同长度请求相同权重；把全部间隔合并平均则让长输出贡献更多项。两种统计回答不同问题，报告要写清分母。模型、tokenizer、停止规则和输出质量也会改变N，比较速度时需固定这些条件。'),

  '<div class="mechanism-core" id="serving-two-budgets">'+heading('subsection-3-zgqy1s','一轮工作量与跨轮驻留空间')+
  p('每轮调度决定推进哪些请求、各算几个位置，并为新增位置安排可写的块。执行时把新增的键、值向量（K/V）写进缓存，供后续注意力读取。引擎交付本轮产生的输出，结束的请求归还块引用。',
  '连续批处理会在每轮重新组合请求。分块预填充给长提示设单轮上限，给正在逐步生成的请求留出机会，这个生成阶段叫解码（decode）。判断请求能否推进，要同时看本轮还可计算多少位置，以及跨轮还可保存多少历史。即使计算有余量，新位置也要等到有块可写才能开始。')+'</div>'+
  '<details class="progressive-detail"><summary>算例 · 分块怎样改变首词元等待</summary>'+
  heading('subsection-3-svno8c','逐轮计算分块怎样转移等待')+
  table(['约束','固定成本教学模型的规则'],[
   ['工作预算','每轮最多40个输入位置；先给已有decode各1项'],
   ['驻留预算','按提示与输出上限完整预留，结束后归还'],
   ['单提示本轮上限','只比较32与8；新提示先于未完成提示'],
   ['交付时点','一轮全部完成时交付该轮产生的输出']
  ])+
  p('设提示P≥1、输出上限G≥1，prefill结束已经选出第1项，只需G−1个后续decode输入。已处理KV上限为P+G−1，块长4时要向上取整。ceil表示向上取整：长度35也占9块、36槽。这里G既是上限，也恰好是实际输出数。')+
  formula('完整长度预留，无共享与滑动窗口','预留槽位 = ceil((P + G − 1) / 4) × 4','该模型预留未来增长，槽位不代表已经写入的KV数量；乘具体模型每位置字节后才得到预留字节。')+
  p('第一组请求为A：到达0ms、P=32、G=4；B：到达2ms、P=4、G=2；C：到达2ms、P=8、G=2。KV池44槽。A预留ceil(35/4)×4=36，B预留8，两者占44；C需12槽，不能获准。B结束归还8仍不够，C必须等A也结束，两种分块策略均在7.6ms接入。',
  '程序用到达顺序准入，队首放不下会阻挡后面的请求，即便本轮工作量尚有余量。某请求自身就大于整个池，应提前拒绝或分流；否则等待永远不能解决。真实请求可提前结束，完整预留会闲置空间；按需增长则必须定义后续空间不足的处理。取消后也要按执行和引用协议回收容量。')+
  p('以下耗时是给定成本：每个prefill输入0.1ms，每个decode输入1ms，同轮成本直接相加。没有设备、网络或重叠。第一组32上限时，A在0→3.2ms一次处理完提示；B虽在2ms到达，也要等这轮结束。下一轮做A一次decode与B的4位置，共1+0.4=1.4ms，B在4.6ms首输出，从到达算为2.6ms。',
  '把上限改为8后，A的提示分为多个片段；B可在A未完成时进入某轮，其首输出等待变1.6ms。A却从3.2ms首输出变3.6ms。C仍受同一44槽约束，分块没有凭空增加驻留容量。')+
  qf[2][0]+
  table(['两组独立负载的比较','上限32','上限8'],[
   ['第一组B首输出等待','2.6ms','1.6ms'],['第一组A首输出等待','3.2ms','3.6ms'],
   ['第二组A最大输出间隔','4.2ms','1.8ms'],['第二组B首输出等待','5.1ms','8.1ms'],['第二组全部结束','9.6ms','9.6ms']
  ])+
  p('第二组换成48槽池，A在0ms到达、P=4/G=6，B在0.5ms到达、P=32/G=2。整段模式在1.4ms开一轮：A做1次decode，B处理32项，耗时1+32×0.1=4.2ms，因此A下一项到5.6ms才交付。分块时每轮相应片段最多1+8×0.1=1.8ms，A间隔缩短，B却要等更多轮才能完成提示。',
  '两组负载不能拼成一条请求轨迹。此固定成本模型中总工作没减少，第二组完成时刻同为9.6ms；真实设备的批量效率、启动、上下文读取与重叠会改变总耗时，必须在目标实现重新测量。G=1时prefill已给唯一输出，无decode、无后续间隔。')+
  '</details>'+poolMechanism,

  p('到达率λ是每秒进入同一服务边界的请求数；并发数是在该边界内尚未结束的请求数。闭环压测固定客户端数量，每个客户端等完成后再发下一条；响应越慢，它自动发得越少。开环压测按外部计划时间发请求，可以保持给定到达节奏，因此更容易显出持续排队。',
  '在稳定且流入流出平衡、平均值存在的同一边界内，Little定律给平均在途数L=λW，W为平均停留时间。λ=20请求/s、W=2s时L=40条。这里2s含这个边界内的等待与处理，并非只用模型执行时间；系统持续积压时不能用稳态等式推断固定并发上限。',
  '若每秒到达20条、每秒只能完成18条，又没有拒绝或取消，积压以2条/s增长，60秒约多120条。只统计此时已完成的成功请求，会漏掉仍在队列中的慢请求。需要同时报告计划发送、实际发送、完成、失败、超时与窗口末未完成数。',
  '负载生成器自身的CPU、连接或网络不足也会使实际发送落后计划。先检查这份偏差，再把等待归因于服务。开环与闭环都可用于相应问题，但闭环自动降速后的平稳吞吐，不能证明固定外部20请求/s不会积压。'),

  p('窗口吞吐先声明统计对象与边界：输出词元总数/窗口秒数是词元吞吐，完成请求数/窗口秒数是请求吞吐。可以按窗口内实际交付事件计数，也可以限定某批到达请求直到全部完成；两种方法的分子和时间范围不同，需说明预热、跨窗请求以及右端点是否计入。',
  '沿用模型服务章gqa_serving.py的给定轨迹：A到达0ms，在40、50、60ms输出；B到达20ms，在80、100ms输出。窗口为0至100ms且含右端输出，合计3+2=5项，词元吞吐5/0.1=50token/s。A的TTFT/TPOT为40/10ms，B为60/20ms；门槛TTFT≤50ms且TPOT≤15ms时只有A，时延达标请求率1/0.1=10请求/s。',
  '再独立给任务质量评分：A质量失败，B质量通过。B没有过时延门槛，A没有过质量门槛，所以同时过两项的为0条，质量且时延达标请求率0/0.1=0请求/s。这个质量标签是另加评价输入，不是该脚本按时间推断的结果，也不是50token/s自动附带的质量结论。')+
  table(['聚合对象','合适分母与方法','常见错误'],[
   ['并发请求的总体词元吞吐','同一窗口所有实际交付词元数/窗口时间','平均各请求token/s代替服务总量'],
   ['请求时延p95','合并请求或可合并直方图后求95%位置','直接平均各实例p95'],
   ['版本与任务比较','保持输入输出分布、评分和失败口径','用短回答或删超时改善指标']
  ])+
  p('p95是排序后95%样本不超过的分位位置。设实例A有1000条10ms请求，B只有10条1000ms请求；全体1010条的95%位置约第960项，仍为10ms，而(10+1000)/2=505ms不是全局p95。直方图聚合还应说明桶边界与插值精度。',
  '按输入长度、输出长度和任务类型切片，可以发现总体改善掩盖的长请求恶化。请求ID适合关联日志或trace，不宜无限增加指标标签。trace是把同一请求各阶段关联起来的记录，直方图则用于聚合分布，二者承担不同用途。'),

  poolRun+
  heading('subsection-6-1ajl0y9','固定成本调度：把每轮日志接到时间指标')+
  p('serving_scheduler.py与上述块池独立：不计算注意力，按完整最大长度预留空间，用整数微秒累计给定成本。1000微秒=1毫秒；simulate按到达顺序准入，先选已有decode，再按newcomers与旧提示安排prefill，轮末生成输出并释放完成者。只改chunk=32或8，其余请求、预算与成本保持。')+
  qc[5][schedulerOffset]+
  table(['日志或代码字段','读法'],[
   ['Request.reservation','ceil((prompt+output_limit−1)/4)×4'],
   ['admitted / reserved_before','本轮哪些请求获准、执行前预留多少槽'],
   ['decode / prefill','本轮每请求真正处理的输入位置'],
   ['start_us / end_us / emitted','成本相加得到轮末，各输出用该轮末时刻'],
   ['output_times_us / ttft_us / max_gap_us','由事件列表计算首等待及最大相邻间隔']
  ])+
  p('先找第二组上限32的1.4→5.6ms轮：decode中有A、prefill中B为32，复算1000+32×100=4200微秒。再从A相邻output_times相减得到4200，而非用全请求用时除输出数。第一组则查C的admitted_us=7600，并用36、8、12槽解释为什么计算预算有余也要等待。')+
  table(['程序已有断言','结果'],[
   ['第一组B首输出；A首输出','2.6→1.6ms；3.2→3.6ms'],
   ['第一组C获准','两种策略均7.6ms'],
   ['第二组A最大间隔；B首输出','4.2→1.8ms；5.1→8.1ms'],
   ['第二组全部结束','两种均9.6ms'],
   ['单输出请求 / 永久放不下的请求','decode为0、间隔为空 / 提前拒绝']
  ])+
  fold('完整serving_scheduler.py：与下载源码逐字一致',qc[5][schedulerOffset+1])+
  p('这是准入与分块的确定性模型，实际执行Python调度计算，没有模型推理、GPU或vLLM运行。若修改成本、空间策略、请求顺序或每轮交付假设，应重算轨迹并更改预期，不能保留原数字当作新配置的结果。')+
  fold('选读：原合成轨迹的指标计算命令',
   p('infra_lab.py另用固定客户端轨迹检查TTFT、TPOT、单词元边界、总体吞吐和失败请求。它检验指标计算，不向模型服务发请求。运行后按该实验自身的输入核对结果；这些输入不能作为服务端 TTFT 或设备计时。')+
   qc[5][schedulerOffset+2]),

  p('容量实验要找在约定体验和质量门槛内可持续接收的负载。先固定模型与tokenizer版本、设备与副本数、服务版本、输入输出长度分布、停止规则及评价集；再声明TTFT、输出间隔、错误与质量的门槛。达标条件要在看结果前确定，避免只挑最快的一档。',
  '按开环到达率逐档增加，每档保留实际发送、排队、准入、未完成量、KV与重算、完成量及客户端事件。若窗口末未完成量持续增长，即使短期完成吞吐很高，也没有证明该到达率可稳定承受。预热后测稳定窗口，另外记录冷启动、空缓存与重启路径，因为用户也可能遇到这些状态。',
  '再观察少一个实例时的路由和重试：同一逻辑请求的重试尝试要可关联，既记录执行成本，也避免把重复交付当成额外成功任务。量化或新算子需要同时对照数值和任务评价。例如吞吐增加20%，坏事件率却从0.2%升至1.2%，应按预先门槛判断能否采用，并准备可观测的回退条件。',
  '本章用本机实验分别核对 CPU 缓存数值、块池所有权、固定成本算术和两条真实流式请求的调度顺序。要做部署容量判断，还需在目标负载下测设备内存峰值、算子时延、排队与交接。'),

  p('甲只报告“51token，一秒完成”。先追问它已有事件的含义，再补发送、首项、末项、输出总数和流式映射。用本章0、0.4、1.4s轨迹，答案为TTFT400ms、TPOT20ms、总时长1.4s；若那一秒只指首项到末项，就不能当作端到端耗时。再构造49个10ms与1个510ms间隔，说明平均值为何漏掉停顿。',
  '乙平均两实例p95。给出1000条10ms与10条1000ms，让它先合并计数再求95%位置，得到10ms而非505ms。最后为“生成很顺却客户端停顿”设计对照：同时记录服务端逐项生成和客户端逐消息接收；前者平稳、后者成团时，继续查交付链，前者本身有空档时，再关联调度与执行。',
  '可按五项各2分检查答案：端点与单位明确；51项用50间隔且单项为空；分位数和窗口分子可复算；对照能区分计算与交付；失败、质量及未完成请求有明确口径。最后从一次循环指出输入、输出、KV长度各何时变化，时间与容量两份账才能闭合。')
 ],'先固定首输出、逐项间隔与窗口分母，再逐轮复算准入和分块，最后对照CPU物理缓存与调度的实际证据。');

 serving.sections[1][1]+=
  heading('native-inference-request-path','把三轮生成放进真实引擎')+
  p('上一张表只看模型输入和输出。现在沿同一过程看服务怎么执行。llama-server 收到 HTTP 请求后将提示变成词元编号，创建任务，再把任务交给空闲的 slot。这里的 slot 是执行位置，保存当前任务、已处理的位置和生成状态。服务需要等待空位时，任务还没有开始模型前向。')+
  trainingFigure('v77-engine-path','提示的末位置产生首个输出。若继续生成，上一轮选出的词元才进入模型，写入自己的 K/V。')+
  p('引擎把本轮待前向的词元组成一批，交给 <code>llama_process</code>。这个版本的预填充和逐词解码都经过这条执行路径。调用结束后，采样器读取所需位置的候选分数。本实验把温度设为 0，按最高分选词。选出的词元进入输出队列。若服务继续生成，同一个编号成为下一轮输入，客户端可以稍后收到它。',
  '请求完成后，slot 回到空闲状态。允许复用时，下一条请求可以沿用这个 slot 里与新提示相同的前缀。引擎从序列起点逐个比较编号，遇到第一个不同的编号就停。若整条提示都匹配，这个版本仍要重算最后一个提示词元，从该位置取得首个输出的候选分数。')+
  p('换进程时，先数清输出与缓存各到了哪里。两个本机 llama.cpp 进程加载同一份合成模型。源进程处理 [1,4,5,6] 后输出 7，保存的历史只有四个位置。接收方恢复这四格，再用 [1,4,5,6,7] 发起新请求。第一个新算位置是 4，送入的是词元 7。<a href="/article/inference-performance/#native-slot-handoff">核对恢复回执和真正送入模型的批次 →</a>')+
  '<p class="practice-links"><a href="article/model-serving/#native-inference-engine-lab">用实际请求检查新算与复用的位置 →</a> · <a href="https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/server-context.cpp#L4103-L4326">该版本的前缀逻辑 ↗</a> · <a href="https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/server-context.cpp#L4684-L4700">模型批次调用 ↗</a></p>';
 serving.sections[1][1]+=
  heading('request-version-binding','发布切换时，流式请求用哪个模型')+
  p('本机 llama.cpp CPU 实验中，入口在接纳流式请求时选定模型实例。旧请求绑定 <code>stable/1</code>。客户端收到首个词元后暂时停读。入口发布 <code>good/2</code>，再回退到 <code>stable/3</code>。切换后和回退后各发一条新请求，两条都输出 [7,8,9]，末帧的 <code>model</code> 分别为 <code>rollout-good</code> 和 <code>rollout-stable</code>。',
  '旧客户端恢复读取，沿原 HTTP 连接读完这条流。算上暂停前的首个词元，它共收到 32 个词元，绑定仍为 <code>stable/1</code>。最后一帧的 <code>tokens_cached=35</code> 对应 4 个提示位置和前 31 个输出位置，也就是 4+32−1。实验关闭跨请求的提示复用，<code>timings.cache_n=0</code>。这里暂停的是客户端读取，引擎可以继续计算并把输出留在缓冲区。',
  '在原始记录里，从每条请求的 <code>binding</code> 取得模型摘要与发布代际，再对照末帧的模型别名。两个不同的权重文件可以给出同一组 [7,8,9]。<a href="/labs/native-model-rollout/observations.json">查看接纳记录与原始 SSE →</a> · <a href="/article/ai-lifecycle/#native-model-rollout">沿原生发布实验看版本切换与回退 →</a>');

 serving.sections[4][1]+=
  '<p class="practice-links"><a href="article/inference-performance/#vllm-v1-request-path">把这张块表接进 vLLM V1 的调度、写入和归还 →</a></p>';
 serving.sections[6][1]+=
  heading('native-inference-engine-lab','在本机跟四次真实请求')+
  p('实验用 llama.cpp b12110 的 HTTP 服务，固定一个 slot，模型为本地生成的单层 Llama 合成权重。GGUF 是把权重、词表与模型配置一起存放的文件格式。程序先请求 <code>/tokenize</code>，再把返回的 [1,4,5,6] 或 [1,4,5,10] 送给 <code>/completion</code>。开头的 1 是起始标记。四次请求都生成三个词元。')+
  table(['本轮请求','复用的提示词元','实际新算的提示词元','输出编号'],[
   ['首次 red green blue','0','4','[7,8,9]'],
   ['原样重发，开启复用','3','1','[7,8,9]'],
   ['改成 red green four，开启复用','3','1','[11,12,13]'],
   ['原样重发 red green four，关闭复用','0','4','[11,12,13]']
  ])+
  p('对照前两行，引擎找到 4 个相同提示位置，随后把可复用长度降到 3。两行选出相同的输出，第二行实际少算 3 个提示位置。对照最后两行，输入相同且只切换复用，输出仍相同。用响应的 <code>timings.cache_n</code> 与 <code>timings.prompt_n</code> 分别核对复用和新算的提示词元。',
  '再对照第一行的实际批次。首先把 [1,4,5,6] 送到位置 0–3，只取位置 3 的候选分数，选出编号 7。随后输入 [7] 到位置 4，选出 8。再输入 [8] 到位置 5，选出 9 后结束。所以响应中的 <code>tokens_cached</code> 是留在槽中的 4+3−1=6 个已计算位置。它和本次省去的提示计算数量分别回答不同问题。')+
  p('脚本从原生响应和批次日志核对这些数字。把每批输入的编号抄到第 2 节图里，就能看出哪个输出进入了下一轮。流式响应还带有提示处理进度事件，脚本先按事件类型将它们分开，再数实际输出。')+
  trainingCode('解压后运行，指定已安装的 llama-server','SHELL','python3 engine_walkthrough.py --server /absolute/path/to/llama-server --output-dir ./replay')+
  '<p class="practice-links"><a href="labs/native-inference.zip" download>下载实验包 ↓</a> · <a href="labs/native-inference/README.md">环境与运行步骤</a> · <a href="labs/native-inference/engine_walkthrough.py">请求和校验源码</a> · <a href="labs/native-inference/validation.json">实际记录与源码摘要</a></p>'+
  p('本次在 macOS arm64 上使用 CPU，单槽逐条执行。下面先用同一个模型对比 CPU 与 GPU 上的实际运算。<a href="/article/inference-performance/#native-inference-queue">继续看两个请求怎样排队与计时 →</a>')+
  heading('native-metal-inference','同一条请求，哪些运算实际交给了 GPU')+
  p('保持 llama.cpp b12110、合成权重与请求不变，启动两次服务。第一次禁用 GPU，第二次选择 Apple M4 Pro 的 Metal 设备 MTL0。Metal 是 Apple 平台提交 GPU 运算的接口。两个进程都关闭融合注意力，便于在计算日志中逐项找出矩阵乘法与 Softmax。')+
  trainingFigure('native-metal-inference-path','同一条冷请求的三个批次。设备日志指出哪些节点由 Metal 编码，客户端原始响应给出三次选词和最终缓存计数。')+
  p('先核对第一条请求。词元 [1,4,5,6] 进入位置 0–3，产生 7。第二批把 7 送入位置 4，产生 8。第三批把 8 送入位置 5，产生 9。两边都返回 [7,8,9]，槽内都保留 6 个已计算位置。最后选出的 9 还没被送回模型。')+
  table(['Metal 日志里的节点','本轮计算里负责什么'],[
   ['<code>Qcur-0</code>、<code>Kcur-0</code>、<code>Vcur-0</code>','把这一批的新输入变成查询、匹配键与内容'],
   ['<code>kq_soft_max-0</code>','把查询与键的匹配分数换成读取权重'],
   ['<code>result_output</code>','把模型最后的特征变成词表候选分数']
  ])+
  p('模型加载日志能说明权重与缓存放在哪里。要确认本次请求用了哪些设备算子，展开原始日志，按批次找到位置编号，再在同一批查 <code>ggml_metal_op_encode_impl</code> 的节点名。首次请求的三批在 Metal 路径都有这组记录。CPU 对照的批次位置和词元输出相同，Metal 节点计数为 0。复用或关闭提示缓存的其余三条请求也用同样的办法核对。')+
  trainingCode('解压后在 Apple Silicon 上运行，替换 llama-server 路径','SHELL','python3 -B metal_inference.py --server /absolute/path/to/llama-server --output-dir ./replay')+
  '<p class="practice-links"><a href="labs/native-metal-inference.zip" download>下载实验包 ↓</a> · <a href="labs/native-metal-inference/README.md">环境与复跑步骤</a> · <a href="labs/native-metal-inference/native-responses.json">原始 HTTP 事件</a> · <a href="labs/native-metal-inference/native-stderr.log">引擎批次与节点日志</a> · <a href="labs/native-metal-inference/validation.json">核对结果</a></p>'+
  p('这次复跑覆盖本机单槽、合成模型和四条固定请求。GPU 节点日志用来确认执行路径。端到端时延、生产模型容量和 CUDA 行为需要各自的测量。<a href="/article/operator-profiling/#native-metal-softmax">回看单个 GPU Softmax 内核怎样做归约 →</a>');
 serving.sections[2][1]+=
  heading('serving-rope-window-handoff','槽位复用以后，哪个位置还该读得到')+
  p('上面的 TinyDecoder 按绝对位置查表，保留连续历史。换成旋转位置编码（RoPE）和固定容量的滑动窗口后，新增位置还要决定什么时候覆盖旧槽。四槽的原生 CPU 对照中，位置 3 和 4 同批计算，位置 4 最后会写进槽 0，位置 3 此时仍需要读逻辑位置 0。')+
  p('沿同一份记录分别核对两件事。<code>phase_positions</code> 告诉你用什么序号旋转，<code>visible_keys</code> 告诉你每个查询实际读到什么。用槽 0 代替逻辑位置 4，最早影响位置 4。先覆盖槽 0，再计算这一批，最早影响位置 3。<a href="/article/position-encoding/#native-rope-window-cache">复跑四槽的完整对照</a>，再看<a href="/article/model-serving/#section-4">如何从各层形状计算缓存字节</a>。');

 performance.sections[5][1]+=
  heading('native-inference-queue','同样两条请求，单槽与双槽怎样调度')+
  p('沿用 A3.4 的合成模型和 llama.cpp b12110 CPU 引擎。槽位保存一条正在生成的序列及其推理状态。先发长请求 A，收到首个输出后再发短请求 B。两种配置都关闭提示缓存，固定同一对请求与每槽 128 个位置。A 生成 110 项，B 生成 32 项。')+
  trainingFigure('native-inference-queue','引擎日志核对任务的进入、推迟与释放。图表示观测顺序，间距不代表耗时。')+
  p('单槽时，原生任务日志显示 B 被推迟，实际指标样本读到 1 个处理中、1 个等待。等 A 释放槽后，B 获得槽 0。双槽时，A 和 B 分别占用槽 0 和槽 1，两个任务都开始后才有任一槽释放。实际指标样本读到 2 个处理中、0 个等待。客户端仍要分别跟踪两条请求。')+
  p('客户端在发送前、收到首项、收到末项和收到结束事件时，使用同一个单调时钟记时间。首项减发送是首词元等待 TTFT。末项减首项，再除以相邻间隔数，是平均输出间隔 TPOT。A 有 109 个间隔，B 有 31 个间隔。生成结束帧单独记录。')+
  p('复算第一轮单槽的 B。相对本轮时钟起点，发送、首项和末项分别在 5.714583、29.302750 和 35.956500 毫秒。TTFT 约为 23.588 毫秒，TPOT 为 6.653750÷31，约 0.215 毫秒。这两个数字来自一次请求。服务端另用日志和指标证明 B 等过槽，客户端时钟记录整个接收过程。每种配置各运行三次，实跑范围是固定合成权重与单机 CPU。')+
  trainingCode('解压后生成固定模型并运行，替换引擎路径','SHELL',`python3 -B make_fixture.py fixture.gguf
python3 -B concurrency_lab.py --server /absolute/path/to/llama-server --fixture fixture.gguf --output replay --repeat 3`)+
  '<p class="practice-links"><a href="/labs/native-inference-queue.zip" download>下载源码和实际记录 ↓</a> · <a href="/labs/native-inference-queue/validation.json">查看六次对照</a> · <a href="/labs/native-inference-queue/events.jsonl">查看原生事件和计时</a></p>';

 performance.sections[5][1]+=
  heading('native-metal-queue','两个活跃槽，怎样组成一个解码批')+
  p('槽位保存请求已经处理到哪一步，以及它的历史 K/V。K/V 是历史词元留下的匹配键和内容向量。批次是本轮一起送入模型的输入行。沿用上面的 A、B 和同一份模型，这次在 Apple M4 Pro 的 Metal 路径上比较一个槽和两个槽，查看两个槽活跃后，是否真的有输入行进入同一批。')+
  trainingFigure('native-metal-queue','双槽记录中，从请求开始数起，第 5 个引擎分批同时包含槽 0 和槽 1 的解码行。两行在同一个 Metal 批次处理，下一项分别返回 A、B。')+
  p('从这一次分批看，A 把上一轮选出的 9 放在自己的位置 6，B 把 11 放在自己的位置 5。日志中的 <code>seq_id = [0.]</code> 和 <code>seq_id = [.1]</code> 对应两条序列，<code>output = 1</code> 表示两行都要取得候选分数。紧接着能找到 Metal 上的匹配点积 <code>kq-0</code>、归一化 <code>kq_soft_max-0</code>、内容汇总 <code>kqv-0</code> 和输出投影 <code>result_output</code>。采样日志与两个 HTTP 流各自对上，A 选出 10，B 选出 12。')+
  p('两条序列一起执行这一轮，仍按各自的序列 ID 和位置读取可见的历史。这里关闭了提示复用。跨请求复用一段缓存时，还要核对前缀是否匹配以及哪些请求允许使用它。')+
  table(['本次记录','B 如何开始','两条解码行同批且各自选词','引擎调用数'],[
   ['单槽','等 A 释放槽 0','0 批','142'],
   ['双槽','A 未完成时进入槽 1','31 批','110']
  ])+
  p('两轮各处理 9 项提示、返回 142 项生成结果，完整编号都与 CPU 实验相符。引擎调用数来自 <code>n_decode_total</code>，包含提示预填充和逐项解码。31 只数能从原生日志同时核对两条解码行、Metal 节点和各自选词的批次。B 到达的位置随运行调度变化。本次核对合批与输出归属，耗时另测。')+
  trainingCode('解压后在 Apple Silicon 上运行，替换 llama-server 路径','SHELL',
   'python3 -B metal_queue.py --server /absolute/path/to/llama-server --output-dir ./replay')+
  '<p class="practice-links"><a href="/labs/native-metal-queue.zip" download>下载实验包 ↓</a> · <a href="/labs/native-metal-queue/README.md">环境与复跑步骤</a> · <a href="/labs/native-metal-queue/native-stderr.log">批次、Metal 节点与选词日志</a> · <a href="/labs/native-metal-queue/native-responses.json">原始 HTTP 流</a> · <a href="/labs/native-metal-queue/validation.json">查看首个共同解码批</a></p>'+
  p('这里一批处理多条序列的下一步。推测解码把一条序列的几个候选位置交给目标模型验证，再接受匹配的候选前缀。<a href="/article/speculative-decoding/#native-ngram-speculation">继续看一次怎样验证同一条请求的多个候选 →</a>');

 performance.sections[2][1]+=
  p('预填充和解码分到不同进程时，解码侧要先拿到历史 K/V，才能从正确位置继续。先用整数程序核对交接，再用本机 llama.cpp 查看接收进程实际重算了哪些位置。')+
  '<details class="progressive-detail"><summary>本机实战 · 分池与缓存交接</summary>'+
  transferLowerBound+
  '<div class="mechanism-core" data-practice="pd-split">'+
  heading('native-pd-split','实战：把预填充和逐步生成交给不同进程')+
  p('共置时，一个工作进程既处理输入，也继续生成。若调度器先取新来的长提示，已经开始输出的短请求就要等。分池时，预填充进程 P 处理输入并选出首个输出，解码进程 D 继续生成。D 需要同一请求的提示长度、首个输出和历史 K/V，才能在正确的位置继续写入。')+
  trainingFigure('pd-split-handoff','共置路径保留进程内状态。分池路径先产生首项，再通过本机套接字交接 KV；接收端验收后，才开始下一步解码。')+
  p('三组对照使用相同输入和整数计算规则。A 有 4 个提示位置、生成 4 项，B 有 8192 个提示位置、生成 2 项。每个位置存两个 16 位整数 K 和 V，共 4 字节。分池按 4 字节长度前缀、9 字节请求头、KV 数值、32 字节校验摘要传输。先手算 A 为 4+9+4×4+32=61 字节，B 为 4+9+8192×4+32=32813 字节。两项都是应用消息的字节数。')+
  table(['对照','从记录核对','回答什么问题'],[
   ['单进程共置','B 先于 A 的下一步占用共用进程','首项已经收到，后续仍可能排队'],
   ['分池','独立进程验收 A 的交接，再输出 A 的第二项','等待被拆成了交接、接收检查和解码执行'],
   ['双进程共置','每个请求留在自己的进程，核对 B 预填充和 A 解码是否重叠','增加工作进程也能减少这组请求的相互等待'],
   ['交接失败','破坏校验摘要后重跑接收校验','已经产生的首项与后续失败分别记录']
  ])+
  p('先算 A 的首项。提示 [3,1,4,1] 按位置 i 生成 K=(词元+i) mod 257、V=(3×词元+2×i) mod 257，得到 (3,9)、(2,5)、(6,16)、(4,9)。最后一个提示词元为 1，所以查询值 q=1+(1 mod 11)=2。每个 K 的权重是 1+(q×K mod 19)，加权和为 377，权重之和为 34。向下取整后加上缓存长度，得到首项 floor(377/34)+4=15。',
  '下一轮把 15 放到位置 4，追加 K/V 为 (19,53)，按同一规则得到 16。继续两轮应得到 25、36。实验用这套整数规则核对接收后的历史状态与位置，省去模型权重和浮点误差。')+
  p('实验用本机单调时钟，所有进程共用一个计时起点。首词元延迟（TTFT）从协调进程接到请求算到工作进程产生首项。平均后续间隔（TPOT）用末项减首项，再除以输出数减一。这里 P 在交接前就产生首项，交接因此落在首项到第二项之间。真实服务的客户端计时还要跟踪输出的网络和协议传输。')+
  trainingCode('解压后运行三组对照和一次失败路径','SHELL',`python3 -B pd_split.py --write-record replay.json`)+
  p('在 <code>report.split.events</code> 中找 A 的首项、<code>kv_ready</code> 和第二项。把第二项减首项，得到首次停顿。再用 <code>decode_start</code> 减 <code>max(decode_queued, kv_ready)</code>，得到缓存和任务都就绪之后的排队。交接耗时与排队可能重叠，按事件关系算，避免重复相加。',
  '默认门槛是 TTFT≤30 毫秒且 TPOT≤1.5 毫秒。先复算单条请求是否同时达标，再用达标完成数除以从首个到达到最后完成的时间。')+
  table(['一次保留记录','A 排入解码到开算','A / B 平均后续间隔','达标完成数'],[
   ['单进程共置','1.820 ms','1.171 / 0.721 ms','2 / 2'],
   ['分池','0.058 ms','0.611 / 2.644 ms','1 / 2'],
   ['双进程共置','0.071 ms','0.605 / 0.644 ms','2 / 2']
  ])+
  p('这次分池里，A 排入解码后等得更短，B 的平均后续间隔却超过门槛。B 从发送 KV 到接收侧验收用了 1.366 毫秒，缓存和任务都就绪后只再等 0.020 毫秒。只看 A 或只看解码就绪队列，都会漏掉 B 的变化。三组输出都相同，重跑的时长会变。')+
  p('本机运行的是整数玩具核。单进程共置展示排队，双进程共置和分池都展示重叠，分池另有状态交接。同步门固定比较中的相对顺序。记录验证跨进程的实际字节、输出一致性和观测方法。GPU 上的吞吐、跨机网络及固定总算力下的收益需要在目标引擎上重测。'+
  ' <a href="https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin">DistServe 论文中的设备预算与达标请求率 ↗</a>')+
  '<p class="practice-links"><a href="/labs/pd-split.zip" download>下载源码与记录 ↓</a> · <a href="/labs/pd-split/validation.json">查看原始时间线和验收结果</a></p></div>';

 performance.sections[2][1]+=
  heading('native-slot-handoff','用原生引擎保存缓存，交给新进程续写')+
  p('在 llama.cpp 中，槽位（slot）是服务进程给一条序列保存历史的地方。源进程处理词元 [1,4,5,6] 后选出 7，槽位只有四个已处理位置。要得到 7 自己的 K/V，仍要把它送回模型。这是交接时容易错一位的地方。')+
  trainingFigure('native-slot-handoff','源进程保存四个位置并退出。接收侧先恢复这四个位置，再把词元 7 从位置 4 送入模型。')+
  p('实验用两个实际的 llama.cpp b12110 服务进程。它们加载同一份合成模型，使用各自的槽位目录。源进程把缓存写成 396 字节的文件并退出。运行器复制文件、核对摘要，接收进程再读入。源端报告保存 4 个位置，接收端报告恢复 4 个位置。之后提交新的请求，提示仍需带齐 [1,4,5,6,7]。')+
  trainingCode('保存和恢复的两个管理请求，分别发给源端和接收端','HTTP','POST /slots/0?action=save\n{"filename":"prefix.bin"}\n\nPOST /slots/0?action=restore\n{"filename":"prefix.bin"}')+
  table(['接收侧','复用 / 新算的提示位置','实际送入模型的批次','新输出'],[
   ['恢复完整文件后','4 / 1','7 在位置 4，随后 8 在位置 5','8、9'],
   ['恢复损坏文件失败后','0 / 5','[1,4,5,6,7] 在位置 0–4，随后 8 在位置 5','8、9']
  ])+
  p('先读管理请求的回执。恢复成功时 <code>n_restored=4</code>，此时新槽位还没接过请求，<code>/slots</code> 快照没有 <code>n_prompt_tokens</code> 字段。再看新请求的完成响应，<code>timings.cache_n=4</code> 表示本次复用四格，<code>timings.prompt_n=1</code> 表示只新算一格。原生批次把这格定位为词元 7、位置 4。',
  '缓存文件截到 12 字节后，恢复返回 HTTP 400。此时 <code>/slots</code> 的 <code>n_prompt_tokens</code> 从 6 变为 0，说明旧历史也被清掉了。再发同一请求，<code>timings.cache_n=0</code>、<code>timings.prompt_n=5</code>，原生批次从位置 0 处理完整提示。两条路径都输出 8、9，完成响应的 <code>tokens_cached</code> 都是 6，它计数的是结束时保留的位置。')+
  p('解压后在 macOS ARM64 上执行 <code>python3 -B slot_handoff.py --engine /绝对路径/llama-server --output replay</code>。这里导入的是同版本、同模型的历史缓存，再新发一个贪心请求。生产上的续传还要核对模型与租户身份，并交接已输出的位置和采样状态。文件拷贝和同机 CPU 记录也不能代替跨机 GPU 的交接计时。')+
  '<p class="practice-links"><a href="/labs/native-slot-handoff.zip" download>下载可复跑实验 ↓</a> · <a href="/labs/native-slot-handoff/validation.json">查看原生回执与输入位置 →</a> · <a href="https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/server-context.cpp#L3024-L3050">固定版本的恢复和失败清理 ↗</a></p></details>';

 const vllmSource='https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/vllm/v1/';
 const vllmLink=(file,lines,text)=>'<a href="'+vllmSource+file+'#'+lines+'">'+text+' ↗</a>';
 performance.sections[2][1]+=
  p('沿 vLLM V1 的请求编号，从入队读到归还。下面既可以看固定版本的源码，也可以在 CPU 上复跑这段调度与分块。')+
  '<details class="progressive-detail"><summary>vLLM V1 · 请求源码与块池实跑</summary>'+
  heading('vllm-v1-request-path','沿 vLLM V1 源码看请求怎样使用块池')+
  p('A3.4 模型服务章用真实 llama-server 单 slot 复用一段历史。多请求引擎还要知道每条请求分到哪些物理块、这轮算多少位置。下面固定 vLLM v0.10.2 的 V1 路径，只跟一条普通文本生成请求，关闭推测解码与外部 KV 传输。请求编号贯穿等待队列、本轮任务和输出。')+
  '<ol>'+
  '<li><strong>进入等待队列。</strong>请求编号、提示词元编号、采样参数进入 <code>EngineCoreRequest</code>，随后成为调度器的等待项。 '+vllmLink('engine/processor.py','L424-L436','准备输入')+' · '+vllmLink('core/sched/scheduler.py','L1094-L1106','登记请求')+'</li>'+
  '<li><strong>为本轮选词元、分配块。</strong>查询连续命中的整块，减去已计算位置，再按本轮的词元额度取一段。KV 管理器给这些位置分块。若空间不足，这条请求可能延后。 '+vllmLink('core/sched/scheduler.py','L380-L489','预算与分块')+' · '+vllmLink('core/kv_cache_manager.py','L153-L212','命中与分配')+'</li>'+
  '<li><strong>执行模型批次。</strong>执行器按各请求的已计算长度准备待处理编号和逻辑位置。块表给出位置对应的物理存储，写入映射告诉注意力算子新 K/V 应存在哪里。 '+vllmLink('engine/core.py','L280-L299','一次执行循环')+' · '+vllmLink('worker/gpu_model_runner.py','L862-L969','准备模型输入')+'</li>'+
  '<li><strong>收下输出，归还引用。</strong>调度器把采样得到的编号追加到对应请求，判断输出上限等结束条件。结束后归还该请求的块引用。仍有其他引用的块继续使用，归零的块可以成为可分配候选。 '+vllmLink('core/sched/scheduler.py','L909-L970','收下输出')+' · '+vllmLink('core/block_pool.py','L236-L266','引用与归还')+'</li>'+
  '</ol>'+
  p('输出处理器把新编号逐步转回文本，组装请求结果。客户端的接收时刻还要经过传输。 '+vllmLink('engine/output_processor.py','L408-L434','逐步解码与组装输出'))+
  p('用一个整块边界算例核对源码。设每块 4 个位置，8 个提示位置全部与旧请求相同，两块也仍可命中。该版本为最后位置留出重算机会，命中上限先从 8 减为 7。可复用单位是完整块，所以实际命中 4 个位置。若本轮预算与可用块都足够，就重算位置 4–7，由位置 7 的分数选出首个输出。再继续一轮时，才把这个输出作为位置 8 的输入，需要第三个逻辑块。',
  '可以顺着问三个问题。刚入队的新请求已经写入自己的 K/V 了吗？收到首个输出后，哪个位置还未前向？请求结束后，归零的块还可能命中吗？用这四步分别定位答案。这里的 4 格块用于手算，块命中、排程和回收是固定版本源码走读。'+
  ' <a href="article/model-serving/#native-inference-engine-lab">返回单 slot 实跑对照 →</a> <a href="/article/inference-performance/#native-vllm-scheduler">用真实调度器核对同一组位置 →</a>');
 performance.sections[2][1]+=
  heading('vllm-block-lifecycle','执行上游块池：空闲之后，什么时候才驱逐？')+
  p('上面的固定版本源码走读说到“引用归零的块可以成为分配候选”。现在直接执行同一提交的 BlockPool，把这句话拆成可检查的状态。实验在 CPU 上运行上游完整块池、块元数据和空闲队列类，保留原始方法体；没有运行完整 vLLM、调度器或模型，也没有分配 GPU KV 张量。',
  '池大小设为 4，但块 0 是该版本保留的空块，只有 1、2、3 可用。A、B、C 是我们给持有者起的名字。实验提供一个固定预计算键给 group 0，隔离块池行为；没有执行完整 Request 的词元哈希链，不能用这份结果证明模型、词元、位置或适配器身份已经校验。')+
  trainingFigure('vllm-block-lifecycle','同一块 1 从占用到空闲、再到驱逐。所有数字来自上游 CPU 元数据执行，未测设备显存。')+
  table(['实际调用后','块 1 引用数','空闲队列（左端先分配）','旧键查询'],[
   ['A 分配并登记满块','1','[2,3]','命中 1'],['B 命中后 touch','2','[2,3]','命中 1'],
   ['A free','1','[2,3]','命中 1'],['B free','0','[2,3,1]','仍命中 1'],
   ['C 只查询 / 再 touch','0 → 1','[2,3,1] → [2,3]','命中 1'],
   ['C free，再分配两块','0','[1]','仍命中 1'],['再分配一块，取出 1','1','[]','旧键未命中']
  ])+
  p('沿着表手算：A 和 B 同时持有时引用为 2。A 结束只减到 1，不能把块交给新用途；B 也结束才减到 0，块 1 被放到空闲队列末尾。此时哈希索引还在，所以查询仍命中。空闲描述可分配状态，命中描述旧索引是否存在，两者可以同时成立。',
  '再看 C。get_cached_block 只查询，不替调用者建立引用；touch 才把引用从 0 加到 1，并从空闲队列移除块 1。C 归还后，队列又是 [2,3,1]。接着申请两块先取 2、3，块 1 仍可命中；再申请一块才取到 1。get_new_blocks 发现它带有旧哈希，先驱逐旧索引，再把编号交给新用途。引用归零与驱逐因此不是同一步。',
  '池耗尽后再申请 1 块会得到 ValueError；实验比较异常前后的全部队列、引用和哈希快照，状态不变。最后归还三块，完成一次有清理的生命周期。get_usage 用三个可用块作分母，只表示元数据分配比例；它不是 GPU 利用率，也没有证明进程或设备归还了多少字节。',
  '复跑分两步：先用下载包里的 fetch_upstream.py 下载固定提交的两份文件并检查 SHA-256、Git blob ID 与字节数，再用 block_lifecycle.py 指向该目录。运行器抽取完整原始 AST 定义，只增加延后类型注解的设置；事件路径关闭，未运行依赖不加载。来源清单、选中定义的行范围、实际轨迹及原创源码哈希都随记录提供。包内不转载上游源文件。')+
  '<p class="practice-links"><a href="labs/vllm-block-lifecycle.zip" download>下载原创运行器与证据 ↓</a> · <a href="labs/vllm-block-lifecycle/block_lifecycle.py">实验源码</a> · <a href="labs/vllm-block-lifecycle/fetch_upstream.py">固定来源下载器</a> · <a href="labs/vllm-block-lifecycle/source-manifest.json">来源与哈希清单</a> · <a href="labs/vllm-block-lifecycle/validation.json">实际12步状态</a> · <a href="labs/vllm-block-lifecycle/README.md">复跑说明与自测答案</a></p>'+
  p('用 10 分自测：分别解释 A 结束、B 结束、C 查询与 touch、按队头重分配、耗尽拒绝这五步，每步 2 分。必须给出引用数或队列，不能只说“用了缓存”。追问：查到后却未建立引用，若允许其他分配穿插，为什么不能假设编号仍属于旧内容？本实验按顺序调用，未验证任意多线程访问的同步安全。'+
  ' 对照 '+vllmLink('core/block_pool.py','L170-L266','分配、驱逐、touch 与 free')+' · '+vllmLink('core/kv_cache_utils.py','L158-L405','块与双向空闲队列')+'，再回到本节四步请求路径，找出真正负责调用这些方法的层次。')+'</details>';
 performance.sections[2][1]+=
  '<details class="progressive-detail"><summary>vLLM V1 实战 · 还有计算额度，为什么仍要等？</summary>'+
  heading('native-vllm-scheduler','运行 vLLM 调度器，追踪三条请求')+
  p('一轮最多计算 4 个词元位置。缓存池另有 3 个可用块，每块 4 格。前一个数字决定这轮还能算多少，后一个决定新结果有没有地方放。A 和 B 的提示都是 [1,2,3,4,5,6,7,8]，C 的提示是 [9,2,3,4]。先处理完 A，再送 B；B 选出首项后送 C。')+
  trainingFigure('vllm-scheduler','同一调度器的实际排程。A 分两轮算完，B 命中一个整块，C 等到 B 归还块后才获准执行。')+
  table(['轮次','实际安排的位置','块或输出怎样变化'],[
   ['1–2 · 冷 A','A 先算 0–3，再算 4–7','没有旧块可用。A 输出 90 后结束'],
   ['3 · 暖 B','B 只算 4–7','复用 A 的首块。B 输出 90，仍在运行'],
   ['4 · B 与 C','B 算位置 8；C 等待','B 持有 [1,3,2]，空闲块为 0，计算额度还剩 3 格。B 输出 91 后释放三块'],
   ['5 · C 入场','C 算 0–3','首块从第一个词元起就不同，无复用。C 输出 99 后结束']
  ])+
  p('第 3 轮的 B 和 A 完全同前缀。固定版本仍要计算末位置来选首项，所以可命中的上限是 7。整块大小是 4，实际复用 4 个位置。第 4 轮把 B 已选出的 90 送回位置 8，占去第三个块。此时 C 虽然排在等待队列里，首块却无处存放。先检查空闲块数，再看计算额度，才能解释为什么这一轮只算了一个位置。')+
  p('看记录时先对照 <code>scheduled.positions</code> 和 <code>after_schedule</code>，确认 C 此时仍等待。再看 <code>after_reply</code>，B 达到输出上限后块已归还。把一个迟到的 B 输出 92 再交给调度器，结果没有新的输出，请求和块状态也没有变化。下一轮开始时，C 才得到自己的块。')+
  trainingCode('解压后在实验目录复跑','SHELL',`python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B upstream.py --dest upstream-cache
PYTHONHASHSEED=0 .venv/bin/python -B scheduler_lab.py --source-dir upstream-cache --output replay.json`)+
  p('实验在 CPU 上调用 vLLM v0.10.2 的原始请求、调度与块管理方法。90、91、99 和迟到的 92 是测试程序提供的固定模型返回值。记录回答的是哪轮计算哪些位置、占用哪些块，以及结束后怎样清理。设备显存、生成质量和延迟要用完整推理服务测量。')+
  '<p class="practice-links"><a href="/labs/vllm-scheduler.zip" download>下载源码与记录 ↓</a> · <a href="/labs/vllm-scheduler/validation.json">查看逐轮记录 →</a> · <a href="/labs/vllm-scheduler/README.md">复跑说明与源码范围 →</a></p>'+
  p('前面通过修改词元让 C 无法复用 A 的历史。下一份对照只改共享范围，<a href="/article/inference-performance/#native-vllm-cache-scope">看相同词元怎样按租户查缓存 →</a>')+'</details>';
 performance.sections[2][1]+=
  '<details class="progressive-detail"><summary>vLLM V1 实战 · 相同词元怎样按租户查缓存</summary>'+
  heading('native-vllm-cache-scope','三个请求的词元相同，缓存命中怎样变')+
  p('先用租户 A 的输入 [1,2,3,4,5,6,7,8] 预热缓存，每块 4 格。三组对照都从同样的预热状态开始。后续请求的词元完全相同，也都提交 <code>demo-A</code>。服务端先根据已经确认的身份选择允许的共享范围，再把对应标识填到 vLLM 请求的 <code>cache_salt</code> 字段。实验里的身份和标识都是固定输入。')+
  trainingFigure('vllm-cache-scope','词元、块大小和模型回复都固定，只改变服务端最终交给 vLLM 的缓存标识。')+
  table(['后续请求','交给 vLLM 的标识','前缀复用','本次新计算位置'],[
   ['同一租户 A','demo-A','4 格','4–7'],
   ['租户 B，服务端按身份赋值','demo-B','0 格','先 0–3，再 4–7'],
   ['租户 B，原样转发提交的值','demo-A','4 格','4–7']
  ])+
  p('首块的缓存哈希由词元和共享标识共同决定。第二块的哈希还包含第一块的哈希。换成 <code>demo-B</code> 后，虽然两块的词元都相同，两项哈希都和 A 不同。保留 <code>demo-A</code> 时两个旧键可查到，实际调度只复用 4 格，因为还要计算末位置来选首个输出。')+
  p('对照结果里的原始哈希、前缀命中数和每轮位置，可以看到错误发生在服务端把请求参数直接当共享范围。实际服务要由已验证的身份决定这个范围。实验执行的是固定版本的请求、哈希和调度代码，用固定回复替代模型计算，验证范围是缓存键与排程。')+
  p('解压本实验和<a href="/labs/vllm-scheduler.zip">前一份调度实验包</a>到同一级目录，先按调度实验的说明下载固定源码，再用 <code>cache_scope.py --scheduler-dir ../vllm-scheduler --source-dir upstream-cache</code> 复跑。完整命令见包内说明。')+
  '<p class="practice-links"><a href="/labs/vllm-cache-scope.zip" download>下载对照程序与记录 ↓</a> · <a href="/labs/vllm-cache-scope/validation.json">查看三条实际排程 →</a> · <a href="/labs/vllm-cache-scope/README.md">复跑与哈希说明 →</a> · '+vllmLink('core/kv_cache_utils.py','L509-L574','固定版本的前缀键计算')+'</p></details>';
 serving.sections[6][1]+=
  heading('native-inference-prefix','沿同一槽位追踪：暖前缀、清除与冷请求')+
  p('上一份实验已看到重复提示可以少算。这次多追一步：请求完成、槽位空闲之后，哪些状态还留着？我们用同一原生 CPU 引擎和人工权重，三次独立重启，各运行 A → 暖 B → 显式清除 → 冷 B。A 的提示是 [1,4,5,6]，B 是 [1,4,5,5,10]，固定 slot 0、温度 0、输出上限 3。')+
  trainingFigure('native-inference-prefix','三轮实际记录一致：B 命中前三位置；清除后全部重算。图中编号是人工模型词元，不代表业务文本质量。')+
  table(['阶段','复用 / 新算提示位置','完成后的保留位置','输出编号'],[
   ['冷 A','0 / 4','6','[7,8,9]'],['暖 B','3 / 2','7','[11,12,13]'],
   ['显式 erase','返回 n_erased=7','0','无生成'],['冷 B','0 / 5','7','[11,12,13]']
  ])+
  p('先手算暖 B：A 结束时已处理 [1,4,5,6,7,8]，与 B 从起点比较，在第四个编号处不同。因此本次真正送入预填充批次的是 [5,10]，位置是 3、4；再送入 11 和 12，位置是 5、6，最终选出 13。冷 B 先送完整五个提示，再送 11、12。两条路径的输出相同，但新算提示位置分别是 2 和 5。最后输出的 13 没有再次进入模型，所以保留长度是 5+3−1=7。',
  '暖 B 完成的快照同时包含 is_processing=false 与 n_prompt_tokens=7：空闲说明无任务在执行，不能据此说缓存为空。erase 返回 7 后，快照变为 0；再发相同 B，响应 cache_n=0、prompt_n=5。把这三处记录接起来，才能判断下一条请求确实走了冷路径。快照里的保留长度也不是本次命中数，后者应看完成响应的 timings.cache_n。',
  '这里调用的 prompt_clear 会移除该序列的 KV 关联并清空提示状态；实验未测分配器或进程 RSS，不能说底层缓冲区已交还操作系统。它也不代表 vLLM 共享块的引用归零或驱逐策略。少算 3 个提示位置同样不能推出端到端快 60%：还存在排队、解码和交付阶段，这份微型模型记录没有证明生产性能。',
  '复跑下载包中的 <code>python3 -B prefix_lab.py --engine /path/to/llama-server --output prefix-results</code>。脚本校验固定 macOS ARM64 b12110 二进制，使用标准库生成模型并完成三轮请求。完整请求体、槽位快照、原生批次行和源码哈希都随包提供。完全匹配提示仍重算末位置的边界，已由上一份四请求实验验证；本次 B 为部分命中，二者要分开读。')+
  '<p><a href="labs/native-inference-prefix.zip" download>下载完整前缀实验</a> · <a href="labs/native-inference-prefix/prefix_lab.py">完整 Python 源码</a> · <a href="labs/native-inference-prefix/validation.json">执行记录</a> · <a href="labs/native-inference-prefix/responses.json">原始响应与快照</a> · <a href="labs/native-inference-prefix/native-logs.json">原生批次日志</a> · <a href="labs/native-inference-prefix/README.md">复跑说明与自测</a></p>'+
  p('自测：不看结果表，写出暖 B 的三个输入批次，并解释为何 idle 与缓存为空不是同一判断。再提出“全部提示命中就不再前向”的反例：固定版本需要末位置分数，上一份重复请求仍处理最后一个提示位置。源码定位见 '+
  '<a href="https://github.com/ggml-org/llama.cpp/blob/cd959bae99ff4bed22bef2604f45241c09bbb8c8/tools/server/server-context.cpp" target="_blank" rel="noopener">cache_prompt、TAG_PROMPT_LOGITS、SERVER_TASK_TYPE_SLOT_ERASE 与 prompt_clear</a>。')+
  p('暖 B 和冷 B 都指定同一个槽位。换成两个能独立接单的副本，一个留有前缀，一个没有，同一请求在两边需要新分配的缓存块就不同。<a href="/article/inference-performance/#tp-placement">用两个副本的空闲块算这次请求交给谁 →</a>');
 const rtxCacheSource='https://github.com/CaptainGreenskin/one-gpu-lm/blob/6e96479924f90e4b0ccd22dba858c51b8516d3ce/experiments/009-training-to-serving/';
 const rtxCacheResults=rtxCacheSource+'results/2026-11-05/';
 serving.sections[6][1]+=
  heading('rtx-pro-6000-cache-case','同一张 RTX PRO 6000 上，静态 KV 何时省时间')+
  p('前面的 CPU 对照验证跨请求复用。这里沿同一条请求比较两种前向路径。全前缀重算每轮重新处理提示和已有词元；静态 KV 先为历史键和值预留张量，再把新词元写到下一个位置，读取已写入的历史。两种路径都只为最后一个位置算输出头。')+
  p('配套实验把实际训练过的 85,596,576 参数模型导出成带权重和分词器摘要的模型包。GPU 是 RTX PRO 6000 Blackwell，模型用 BF16，12 层、每层 12 个头、头维 64。两条路径吃同一固定词元流，热身后交替顺序，各做 5 次，每次测 32 个解码步。另用 84 个位置核对最高分词元，GPU 上全部一致，候选分数最大绝对差为 0.125。')+
  table(['批大小 / 提示词元数','全前缀重算','静态 KV','缓存 / 重算'],[
   ['1 / 32','286 token/s','265 token/s','0.93×'],
   ['32 / 320','4,354 token/s','8,366 token/s','1.92×']
  ])+
  trainingFigure('rtx-pro-6000-cache-crossover','同一模型与设备上的八组解码对照。竖线 1.00× 代表吞吐相同。右列给出两条路径各自的批量 token/s，均取五次实际测量的中位数。')+
  p('八组中仅 32 / 320 的缓存解码更快。这一组同时把预填充中位数从 6.65 ms 提高到 7.77 ms，PyTorch 峰值分配从 457 MiB 提高到 803 MiB。用第 4 节的字节账复算，静态缓存为 2 × 12 × 32 × 352 × 768 × 2 字节，即 396 MiB。峰值还包括权重和执行中间量，需要和缓存张量预算分开读。')+
  p('复跑时，按固定提交的环境说明，在配套仓库根目录生成本机模型包 <code>python experiments/009-training-to-serving/pipeline.py --out runs/system</code>，再执行 <code>python experiments/009-training-to-serving/bench.py --bundle runs/system/bundle --out runs/system/extended.json --extended</code>。原始权重留在工作站，公开记录提供复现输入、脚本和摘要。表格用设备端批量解码吞吐；串行 HTTP 验收另记，分池调度和内核性能需各自测量。')+
  '<p class="practice-links"><a href="'+rtxCacheResults+'README.md">实测条件与完整结果 ↗</a> · <a href="'+rtxCacheResults+'inference.json">初始四组逐次记录 ↗</a> · <a href="'+rtxCacheResults+'extended.json">追加四组逐次记录 ↗</a> · <a href="'+rtxCacheSource+'README.md">固定输入与复现步骤 ↗</a></p>';
 performance.sections[6][1]+=p('想把“暖缓存”拆成可核对的输入位置，继续看 <a href="/article/model-serving/#native-inference-prefix">原生前缀、清除与冷请求对照</a>：同一请求新算 2 或 5 个提示位置，输出仍相同。先证明少算了哪些位置，再设计完整时延对照。');
 serving.sections[6][1]+=p('在本章的 TinyDecoder 对照里，可以先观察缓存怎样改变前向路径。还可以用同一个模型，从双进程训练恢复后导出权重，由新进程加载，再逐项比较缓存与完整前缀的分数。<a href="/article/checkpoint-recovery/#native-tiny-decoder-handoff">查看推理加载的参数来自哪次训练更新 →</a>');
 serving.updated='2026.11.12';
 performance.updated='2026.11.09';

 performance.sections[6][1]+=
  heading('tp-placement','八张卡怎样分给推理服务')+
  p('同样八张卡，可以让八张卡一起算一条请求，也可以分成两组，每组四张卡，各自接单。张量并行（TP）把一次模型前向的计算分给多张卡。一个副本则是一套能独立接单的模型。在这里，TP8 只有一个副本，两组 TP4 各存一整套分片权重，各自管理队列和缓存。')+
  trainingFigure('inference-placement','同一条请求只能由一个副本接下。即使 A 已有前缀，它当前剩余的块也不够，路由选择冷副本 B。')+
  p('用一个 70B 稠密模型算账。参数固定为 700 亿，BF16 每个参数 2 字节，合计 140 GB。每卡按 48 GiB 计，先留 4 GiB 给工作区、通信等额外开销。理想均分权重后，TP8 每卡是 17.5 GB，约 16.30 GiB，TP4 每卡是 35 GB，约 32.60 GiB。GB 按十进制换算，GiB 按 2³⁰ 字节换算。')+
  p('模型有 80 层，每层 8 个键值头，头维 128。每个历史位置的键和值分别存一份，每元素占 2 字节。TP8 每卡分到一个键值头，所以每个位置每卡占 2 × 80 × 1 × 128 × 2 = 40 KiB。TP4 每卡分到两个头，每位置是 80 KiB。这个题设能把 8 个头整除，实际头数不足时可能复制同一头。')+
  p('每个块存 16 个位置。提示 7,168 词元，最多输出 1,024 词元。最后一个输出无需再送进模型，这份预算按 8,191 个位置预留，向上取整为 512 块。先用单卡剩余字节除以单块大小，再用该卡的块数除以 512。组内各卡共同服务同一条请求，得出的条数按副本计。')+
  table(['每卡与副本的账','一组 TP8','两组 TP4'],[
   ['每卡权重','约 16.30 GiB','约 32.60 GiB'],
   ['每卡一个缓存块','640 KiB','1,280 KiB'],
   ['每卡可放缓存块','45,386','9,341'],
   ['每副本可预留的冷请求','88','18'],
   ['整机可预留的冷请求','88','36']
  ])+
  p('两组 TP4 复制了一份权重，合起来仍只有 36 条冷请求的预留空间。两套独立执行队列也能分开接流量。哪种布局每秒能完成更多请求、首词元更快，取决于每组算子、卡间通信、批大小和排队，得在同负载下测。')+
  p('路由再算一次。A 已有 6,144 个匹配提示位置，占 384 个完整块，空闲数已经扣掉它们。这个请求送给 A 只需新增 128 块，并重算 1,024 个提示位置。送给冷副本 B 则需要 512 块，重算 7,168 个提示位置。复用前先核对模型版本、位置与租户共享规则。')+
  table(['A / B 空闲块','结果','依据'],[
   ['96 / 640','去 B','A 的前缀省了空间，仍凑不够新增的 128 块。'],
   ['160 / 480','去 A','只有 A 满足空间条件。'],
   ['100 / 500','等待或到期拒绝','两边合计 600 块，任何一组都无法单独接下。'],
   ['160 / 640','看各自队列','两边都能接。练习按排队中待算位置数加本次待算位置数比较，暖副本积压过大时会选 B。']
  ])+
  p('先运行 <code>python3 placement_budget.py</code>。用 32 GiB 卡重算 TP4 的反例，会发现连权重和预留都放不下。最后把提示从 7,168 改成 6,500，重新核对块尾空位和 A 能否接单。实际路由拿到的是某一时刻的队列与缓存视图，副本接单时还需要再次核对并占用空间。')+
  p('包内另有四进程 CPU/Gloo 实验。用一层小注意力分别运行一组 TP4 和两组 TP2，核对每组拥有的键值头，以及各卡的输出投影局部和能否合成同一结果。八卡 70B 账本和这个四进程实验分别验证容量算术和分片机制。真机选型要固定模型、拓扑、到达率、输入输出长度和缓存冷热，再记录每组显存、准入、首词元延迟、输出间隔与达标完成率。')+
  '<p class="practice-links"><a href="/labs/inference-placement.zip" download>下载代码和记录 ↓</a> · <a href="/labs/inference-placement/README.md">复跑和目标环境对照 →</a> · <a href="/labs/inference-placement/validation.json">查看核对结果 →</a> · <a href="https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/vllm/model_executor/models/llama.py#L119-L166">vLLM 键值头分片与复制 ↗</a> · <a href="https://docs.vllm.ai/en/stable/serving/data_parallel_deployment/">vLLM 多副本部署 ↗</a></p>';
 performance.updated='2026.11.12';
 infraDomain('platform').points.find(point=>point.id==='sv-batching').body+=
  p('用<a href="/article/inference-performance/#tp-placement">八张卡的推理部署练习</a>算每副本可用的块数，再看前缀命中怎样改变接单选择。');

 const loadModel = performance.sections[3];
 loadModel[1] = loadModel[1].replace('窗口末未完成数。</p>', '$&' +
  trainingFigure('inference-load-loop','闭环单个客户端等响应再发下一条。开环按每秒 20 条到达、完成 18 条，60 秒内未完成请求增加 120 条。'));
})();
