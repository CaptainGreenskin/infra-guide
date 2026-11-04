/* One focused reading fix per reviewed chapter. Keep section IDs and tested code. */
const chapterReadingEdits=[];
function readingEdit(id,title,description,change){const a=articles.find(x=>x.id===id),s=a.sections.find(x=>x[0].includes(title));if(!s)throw Error('Reading review target missing: '+id+' / '+title);change(s,a);a.updated='2026.11.04';chapterReadingEdits.push({id,section:s[0],change:description});}
const readingPrefix=(s,html)=>{s[1]=html+s[1];};
const readingFirstParagraph=(s,text)=>{s[1]=s[1].replace(/<p>[\s\S]*?<\/p>/,para(text));};

readingEdit('transformer-model','先确定模型','统一下一词元配对，去掉左右移的歧义',s=>{if(!s[1].includes('input=s[:-1]'))throw Error('Pairing edit missing');});
readingEdit('tokenization-embedding','先约定词表','特殊符号就地中文释义，并说明本章另设词表',s=>readingPrefix(s,para('这一章另设一套词表：0表示填充（PAD），1表示序列开始（BOS），2表示结束（EOS），7表示未知词元（UNK）。0.1里的0是普通编号；这里按本章词表重新解释，不沿用那个含义。')));
readingEdit('attention-mechanics','因果、padding','用一行实际掩码解释缓存坐标偏移',s=>readingPrefix(s,para('先看没有填充的三位置例子：当前查询在绝对位置2，缓存里是位置0、1、2，正确可见行应为[真,真,真]。若把这一条查询当成新方阵的第0行，套左上角下三角规则，会得到[真,假,假]，漏掉两个可见位置。缩放点积注意力接口（SDPA）的mask要按实际查询/键坐标构造。')));
readingEdit('transformer-block','把模型状态','把参数断言准确指向0.6',s=>{if(!s[1].includes('0.6节最小Decoder'))throw Error('Decoder reference missing');});
readingEdit('position-encoding','把位置打乱','先讲交换两行的动作，再读置换矩阵',s=>readingPrefix(s,para('把输入第0、1行交换，查询矩阵的这两行也交换；对应键的位置变化，又让分数矩阵的两列交换。下面的P表达的就是这套“行列一起换”的动作，先在不加掩码的条件下观察。')));
readingEdit('autograd-training','先把监督位置','直接列出沿用的原始数据和实际监督标签',s=>readingPrefix(s,table(['原始序列','模型输入','本例真正监督的目标'],[['[0,1,2,3,4]','[0,1,2,3]','[1,忽略,忽略,忽略]'],['[4,5,6,7,0]','[4,5,6,7]','[5,6,7,忽略]']])));
readingEdit('gpu-execution','用分块换复用','补足占用比例的除法与术语含义',s=>{s[1]+=para('按本题2048个驻留线程的上限，1024/2048=50%，2048/2048=100%。这就是这里计算的驻留占比（occupancy）；它是资源约束下的理想上限。寄存器不够时还可能溢出到较慢的内存（spill），所以占比提高不保证执行更快。');});
readingEdit('roofline-model','两条上限','把计算和带宽两个下界的代入式并排给出',s=>readingPrefix(s,table(['同一个M=1例子','代入式','理想下界'],[['计算','33,554,432 ÷ (300×10¹²) 秒','约0.112微秒'],['内存搬运','33,570,816 ÷ (2×10¹²) 秒','约16.785微秒']])+para('两项工作都得完成，所以先取较大者16.785微秒作为这份理想模型的下界，再考虑实际额外开销。')));
readingEdit('flash-attention-io','稳定Softmax','先认清三个累计状态，减少公式同时引入的符号',s=>readingPrefix(s,table(['状态','含义','对应记号'],[['最高分','到当前块为止最大的分数','m'],['归一化分母','按当前最高分重缩放后的指数和','ℓ（代码变量l，非数字1）'],['加权分子','按相同尺度累加的值向量','u']])));
readingEdit('tensor-parallel-math','先决定切','先解释ReLU的逐元素性质',s=>readingPrefix(s,para('ReLU(z)=max(z,0)，每个分量可以独立计算。因此看到两张卡分别持有H0、H1时，先判断：这一层激活需要别的卡的数据吗？后面再用第二层的求和检验通信发生在哪里。')));
readingEdit('gpu-cluster','跟着形状','明确换用了独立词表配置并提供跳读',s=>readingPrefix(s,para('本小节使用独立教学配置：B=2条样本、T=4个位置、D=8维、V=6个词表项。它与0.1的V=8不同，词表没有在同一模型里偷偷改变。已学过模型基础，可以直接继续本章的“把一步计算放回集群”。')));
readingEdit('distributed-training','让归一化','把不同实验的初值和目的分清',s=>readingPrefix(s,table(['实验','题设','主要检查'],[['机制手算','固定少量数据','归约和全局分母怎样影响更新'],['原单步对照','参数初值w=1','单进程与两个CPU进程对齐'],['章末完整窗口对照','参数初值w=0','梯度4与5、累积、本地空目标和全局空窗口']])+para('这些题的初值和数据不同，不能横比最终参数。每一题都先与它自己的单进程或手算基准比较。')));
readingEdit('gpu-memory','在有效 batch','将混合精度更新动作按执行顺序摆在代码前',s=>readingPrefix(s,para('这段是FP16流程，与前面的BF16存储账本是两套题设。按顺序看：各小批次反向累积→窗口末撤销一次缩放→可选梯度裁剪→尝试更新参数→更新缩放因子。下面代码省略了可选裁剪；需要裁剪时插在撤销缩放之后。')));
readingEdit('ddp-code','损失和时间','区分日志加权与反向传播的目标分母',s=>{if(!s[1].includes('日志')||!s[1].includes('反向传播'))throw Error('Logging/update distinction missing');});
readingEdit('training-communication','手算一次 ring','统一每进程发送量和带宽单位',s=>{s[0]='每个进程发多少，再估理想耗时';s[1]+=para('公式里的8GiB/s等于8192MiB/s。每进程发24MiB时，传输项是24/8192秒，约2.93毫秒，另外再加六轮启动时间。这里按发送端计量，不能再把接收量重复加进同一个带宽分母。');});
readingEdit('data-pipeline','worker 和预取','区分训练进程与数据加载子进程，压缩重复',s=>{
 const texts=[...s[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x=>x[1]);
 s[1]=para('这里的worker指数据加载子进程，不是训练进程。一个节点4个训练进程，每个各开4个数据子进程，每个预取2批，最多计划4×4×2=32批；计划了不代表已经准备好。按每批32MiB估算，载荷预算约1024MiB，还要加进程、组批副本和在途拷贝。')+s[1].replace(/<p>[\s\S]*?<\/p>/g,(p)=>p.includes('worker 数要乘以')||p.includes('PyTorch DataLoader 的 prefetch_factor')?'':p);
});
readingEdit('multinode-lab','核对成功','把每轮16次更新的中间除法补齐',s=>readingPrefix(s,table(['步骤','计算','结果'],[['按4个进程分8192样本','8192÷4','每进程2048样本'],['每批64样本','2048÷64','32个小批次'],['累积2批再更新','32÷2','16次优化器更新']])+para('看日志时分清当前显示的是小批次计数还是优化器更新次数。32和16可以同时正确。')));
readingEdit('checkpoint-recovery','定义恢复边界','先标明四进程手算和双进程实测的区别',s=>readingPrefix(s,para('下面先做四进程、8192样本的手算；本章后面的CPU恢复对照另用两个进程。先分清两套规模，再核对已提交的更新数，避免把手算数字当成本机实测结果。')));
readingEdit('training-performance','用时间线','先提出具体关键路径问题，再看性能记录代码',s=>readingPrefix(s,para('先带着一个问题看记录：两进程分别在52、56毫秒完成前段，末尾通信还要8毫秒，关键路径是max(52,56)+8=64毫秒。要找的是“谁最后到、尾部还暴露多少等待”，下面再看怎样采集。')));
readingEdit('kubernetes-training','parallelism=2','用两种进程组排布代替重复结论',s=>{
 const rest=[...s[1].matchAll(/<p>[\s\S]*?<\/p>/g)].slice(3).map(x=>x[0]).join('');
 s[1]=table(['启动方式','形成的进程组','节点内编号'],[['两Pod各自standalone','组甲[0,1] + 组乙[0,1]','各自[0,1]'],['共同会合端点、不同节点身份','同一全局组[0,1,2,3]','每台仍为[0,1]']])+para('仅把Job的parallelism改成2，不会自动提供共同会合、节点身份和协同失败处理。多节点设计还要约定run/attempt、nnodes、存储目录与恢复；两个独立组写同一目录可能互相覆盖。')+rest;
});
readingEdit('training-platform','从一份训练脚本','从一次回执丢失引出三种身份',s=>readingFirstParagraph(s,'第一次提交已经创建了运行，回执却丢失；用户带同一个幂等键重发，应找回同一run_id。第三次若保留旧键却换了数据摘要，应报意图冲突。作业重试再使用新的attempt_id，区分“同一工作”与“第几次执行”。下面沿四卡微调继续看这三种身份。'));
readingEdit('gpu-scheduling','把“我可以运行”','从已有空闲分布直接进入准入、放置与协同',s=>{
 const rest=[...s[1].matchAll(/<p>[\s\S]*?<\/p>/g)].slice(3).map(x=>x[0]).join('');
 s[1]=para('四台各8卡的节点，当前空闲为[8,4,4,0]。作业要求两台节点各8卡：总空闲16卡，却只有第一台满足单节点形状。接着分别回答三件事：租户能否申请或借到额度；是否存在两台可放置节点；全部进程是否真的共同开始。')+table(['判断','解决的问题','相关机制'],[['准入','本租户能否占用这份额度','队列、配额与Kueue等准入控制'],['放置','哪些机器同时满足资源形状','节点调度、拓扑、卷'],['协同运行','成员能否到齐、失败怎样恢复','会合与训练作业生命周期']])+rest;
});
readingEdit('model-serving','GQA增量缓存','给出同一KV池的块数取整全过程',s=>readingPrefix(s,para('本实验另设KV池为8GiB，每块16个位置，每位置128KiB。每块2MiB，池共4096块。8192位置用512块；多一个位置就要513块，floor(4096/513)=7，所以最多7条。先固定这套题设，再与前面4096位置的例子区分。')));
readingEdit('inference-performance','用51个输出','在代入前解释TTFT和TPOT',s=>readingPrefix(s,para('TTFT是从发送到看见首个输出的等待；TPOT是首个输出之后，每个后续词元的平均用时。先确定计时端点，再代入下表。')));
readingEdit('ai-lifecycle','灰度发布要','明确灰度算例与离线门禁失败是独立假设',s=>readingPrefix(s,para('以下换成一个独立假设：候选已经通过离线门禁，现在进入少量真实流量。前一节关键切片未达标的候选应被拦下；这里用新的假设练习怎样判断灰度数据，不表示让门禁失败的版本继续上线。')));

readingEdit('agent-runtime','给报告任务建','拆开任务、运行、步骤、动作与尝试',s=>{s[1]=table(['字段','本例','重试时怎样处理'],[['任务task_id','T1：生成指定日期范围报告','仍是同一目标'],['运行run_id','R1：按固定策略执行T1','同一次运行保留身份'],['步骤step_id','S1：保存报告','保留步骤身份'],['操作op_id','K1：本次逻辑保存','超时后重试仍用K1'],['尝试attempt_id','第一次、第二次调用','每次尝试改变']])+s[1].replace(/^<div class="table-wrap">[\s\S]*?<\/div>/,'');});
readingEdit('agent-recovery','运行一次真实','先展示退出与恢复两个状态，再读完整输出',s=>readingPrefix(s,table(['时刻','运行器状态','尝试数','工具效果数'],[['提交后进程退出','运行中','1','1'],['恢复后取回回执','已完成','2','仍为1']])+para('先看效果已经存在、任务状态还没完成的这一行，再执行下面命令。恢复时沿用原操作键，才能取回原回执。')));
readingEdit('agent-security','合上页面','把实验前的闭卷复习改成可验证的预测',s=>{s[0]='先预测三个结果，再运行权限实验';s[1]=para('先预测下一节八个用例会怎样变化，再运行代码核对。每次只改变一个条件，观察的是资源端效果。')+table(['只改这一项','预测重点'],[['把写B改为写A','只读任务能否因此获得写权限'],['把写B改为读B','动作改了，资源归属是否改变'],['工具正文自称已批准','可信批准记录是否真的改变']]);});
readingEdit('agent-memory','工具返回可以','把本章重点收回错误记忆的形成和传播',s=>{s[1]=para('如果摘要器把日报备注里的“同步到B”保存为“用户一直希望同步到B”，一次不可信输入就变成了以后任务会反复检索的偏好。问题沿三步放大：错误写入记忆→被新任务召回→影响后续提议。')+para('写入时保存来源与有效范围，把模型推断标为待核验；检索时按当前主体检查原资料权限；纠错时修改或删除实际记忆条目并处理旧索引。一个受信任的存储服务，也可能保存不可信文字。')+para('测试时把同一摘要交给另一个用户，检查原资料是否进入该用户的模型输入；再删除错误记忆，检查后续检索结果。当前调用怎样授权，回到上一章的只读委托实验。')+linkTo('agent-security','复习只读委托');});
readingEdit('agent-evaluation','闭卷','用同一个四任务案例承接实战，去掉另换30题',s=>{s[0]='先预测读后伪装拒绝会得到什么结果';s[1]=para('下一节有四个固定任务。假设工具先读出B的内容，再在最终文字里说“已拒绝”：你预测能通过几项？先写下答案，再查看访问回执、返回内容和评分。')+para('另一个反例把金额37算对，但换成B的引用。两种错误都会让正常的4/4降为3/4，却发生在不同边界：一个泄露数据，一个没有正确证据。');});
readingEdit('kairo-practice','从一次试验形成','用一行待填记录代替重复字段清单',s=>{s[1]=para('接入后先填这一行，再由另一位同学按同一条件重做。没有运行的项目填“待接入”，不要用设计说明代替结果。')+table(['目标版本','断线前任务','重连后任务标识','实际产物','结论'],[['待接入','待接入','待接入','待接入','待接入']])+para('任务标识用来判断是否恢复原工作；产物和回执用来判断是否真的完成。接口、版本、输入和操作步骤附在这行记录后，才能复查。');});
readingEdit('durable-workflows','两个worker','将三种不同故障观察并排比较',s=>readingPrefix(s,table(['观察时刻','旧A的新动作','关键原因'],[['控制代际已推进，接收方尚未安装','独立负例中仍能写','控制面记录没有自动改变接收方'],['接收方安装新代际后','旧代际被拒','校验与效果在接收方事务内'],['另一个进程提交后退出','由C用原键查询回执','这是重试去重，不是旧进程继续运行']])));
readingEdit('agent-retrieval','用数字分开','把重排前后的覆盖和排名放进同一表',s=>readingPrefix(s,table(['结果','命中独立证据','Precision@5','Recall@5','首个相关位置'],[['原前5项','E1、E2','2/5','2/3','第2位'],['重排后前5项','只有E1','1/5','1/3','第1位']])+para('首个命中变靠前，却丢掉了判断变更时间所需的E2；报告因此可能更差。下面展开这两个指标为何会朝不同方向变化。')));
readingEdit('agent-observability','先把评估集','延续100任务的成本账，移除另换6/4题的评分',s=>{s[0]='回到这100个任务：重试的钱花在哪里';s[1]=para('沿用前面的100个任务：首轮80个完成，20个没有取得完成结果；其中10个重试后成功，另10个最终失败。所以唯一成功任务为90个，120次尝试的全部成本仍计入分子。')+para('总成本250时，每个唯一成功任务为250/90≈2.78成本单位。仅有这些总数，不能推出“重试成功的10个比最终失败的10个各花了多少”；需要再按任务与尝试关联成本明细。失败花掉的成本不能删除。')+para('正确拒绝和缺资料的评分回到任务评估章；这里继续用同一批任务解释等待、重试和成本。')+linkTo('agent-evaluation','查看任务与拒绝的独立评分');});
readingEdit('agent-sandbox','在本地验证','保留关键清理条件，完整源码只在后面的下载节展开',(s,a)=>{const complete=s[1].match(/<div class="code-block">[\s\S]*?<\/pre><\/div>/)?.[0];if(!complete)throw Error('Sandbox source missing');const appendix=a.sections.find(x=>x[0]==='配套代码与本次运行结果');appendix[1]='<details class="full-code"><summary>展开完整容量与清理程序</summary>'+complete+'</details>'+appendix[1];s[1]=s[1].replace(/<div class="code-block">[\s\S]*?<\/div><pre[\s\S]*?<\/pre><\/div>/,code('按实例身份清理，槽位名不够','PYTHON','if active.get(slot) != (run_id, epoch):\n    return False\ndel active[slot]\nreturn True'));s[1]+=para('slot-3可以重复利用；run_id和代际号才能区分旧实例与新实例。完整容量和清理程序在本章后面的配套源码中，观察结果应为20、28和空字典。');});

if(new Set(chapterReadingEdits.map(x=>x.id)).size!==35)throw Error('Expected a reading revision for all 35 AI/Agent chapters.');
