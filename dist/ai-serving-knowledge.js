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
 code('因果增量路径 · 概念代码','PYTHON','cache = prefill(prompt_ids, position_ids=range(len(prompt_ids)))\ntoken = sample(last_logits)\nwhile not stop(token):\n    emit(token)\n    logits, cache = decode(token, cache, position=len(cache))\n    token = sample(logits)')+
 para('把两个阶段交给不同进程时，接收方需要先验收提示长度、首词元和历史 K/V，再从下一位置继续。用<a href="/article/inference-performance/#native-pd-split">分池实验</a>核对交接的字节与等待，再用<a href="/article/inference-performance/#native-slot-handoff">原生引擎的保存与恢复</a>核对接收侧实际计算了哪些位置。')},
 {id:'sv-kv',title:'KV Cache：GQA 字节账、分块与增长',articles:['model-serving','gpu-scheduling'],lead:'普通全注意力、各层相同KV头数且K/V维度相同的逻辑缓存量，可从层数、KV头数、头维、位置数与字节数直接推导。使用KV头数，而非查询头数。',body:
 knowledgeFormula('单序列逻辑KV','bytes = 2 × L × hKV × dh × T × b','2对应K和V；T是实际缓存位置数，b是每元素字节。滑窗、MLA、混合层与量化元数据需使用各自模型。')+
 figure('v16-ai-kv-budget','指定题设：32层、8个KV头、128头维、2字节，每位置128KiB；8192位置为1GiB。相同查询头数下，32个KV头的MHA为4GiB。')+
 para('若只留8GiB给KV，理想连续存储下可容纳8条8192位置的序列；这是KV容量账，不是整卡并发保证。权重、工作区、通信、内存分配器、激活与增长预留仍要另算。输入8192位置后还要继续生成时，不能把当下占用当作最终预算。',
 '分块存储把逻辑位置映射到物理块。块长16时，8193位置要513块，相当于8208位置的分配量；在同一8GiB账本中只能同时容纳7条这样的序列。分页减少外部碎片并支持动态管理，却保留末块内部浪费和映射开销。',
 '前缀复用要求实际模型、token内容、位置与影响计算的配置一致，并处理租户共享边界。共享块的引用计数与写时复制避免一条序列追加时污染其他序列；仅按可读文本前缀相同判断会遗漏模板、tokenizer或模型版本差异。TP下KV如何切分或复制还取决于头数与实现，不能一律除以TP数。',
 '即使词元完全相同，服务端仍要按调用者身份限定共享范围。<a href="/article/inference-performance/#native-vllm-cache-scope">看 vLLM 调度器怎样按不同的缓存标识命中 →</a>')},
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
