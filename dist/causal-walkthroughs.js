/* Three middle-of-chapter rewrites. Original executable blocks and section URLs stay intact. */
const causalWalkthroughRevisions=[];
Object.assign(sources,{causalTorchTiming:['PyTorch 2.5.1 · CUDA事件、流与计时边界','https://github.com/pytorch/pytorch/blob/v2.5.1/docs/source/notes/cuda.rst']});
function reviseCausalSection(id,index,edit){
 const a=articleById(id),section=a.sections[index],before=section[1];
 edit(section);if(before===section[1])throw Error('Unapplied causal walkthrough: '+id+'/'+index);
 causalWalkthroughRevisions.push({id,section:index+1});a.updated='2026.11.08';
}
function replaceCausalText(section,from,to){if(!section[1].includes(from))throw Error('Missing reviewed prose: '+from);section[1]=section[1].replace(from,to);}
const causalTeachingCode={
 slo:`from fractions import Fraction

# 同一观察窗、同一种用户事件；每对数是“总事件、好事件”。
groups = [(900, 899), (100, 90)]
total = sum(n for n, good in groups)
good = sum(good for n, good in groups)
target = Fraction(99, 100)
allowed_bad = total * (1 - target)
bad = total - good
print("SLI", Fraction(good, total))
print("允许坏事件", allowed_bad, "剩余预算", allowed_bad - bad)
print("燃烧倍数", Fraction(bad, total) / (1 - target))`,
 gpu:`n, block_size = 2500, 256
grid_size = (n + block_size - 1) // block_size
covered, protected = [], 0
for block_id in range(grid_size):
    for thread_id in range(block_size):
        i = block_id * block_size + thread_id
        if i < n:
            covered.append(i)
        else:
            protected += 1
assert covered == list(range(n))  # 没有遗漏、重复或乱序
print("block数", grid_size, "有效编号", len(covered), "保护编号", protected)
print("逻辑读写字节", len(covered) * (4 + 4))`
};

reviseCausalSection('slo',0,s=>{
 s[1]=para('日报查询服务希望用户“及时拿到属于自己的正确版本”。入口返回HTTP 200却交付旧日报，或请求卡住而没有结束日志，都不能算满足这个目标。先决定什么算一次用户事件，再决定到哪里收集证据。')+
 table(['名称','回答什么','本章固定例子'],[
  ['好事件','一次工作是否满足事先约定的条件','用户归属与版本正确，端到端不超过500毫秒'],
  ['SLI：服务水平指标','按选定口径实际观察到了什么','好查询数 ÷ 全部符合范围的查询数'],
  ['SLO：服务水平目标','在多长窗口内，希望指标达到多少','后面的计数题要求该观察窗好率至少99%'],
  ['错误预算','该目标允许多少坏事件','总事件数 × (1 − 目标好率)']
 ])+para('SLI是观测结果，SLO是拿来比较的目标，预算再把目标换成可计数的损耗。先有事件定义，才能写分子、分母；先有目标和窗口，才能谈是否用完预算。CPU利用率能帮助诊断资源，但不能直接代替这里的用户结果指标。',
 '本章把一次合法查询作为事件，排除健康探针和约定范围之外的非法输入。排除规则要在看到结果前定好。好事件同时满足结果正确和延迟不超500毫秒；若把可用性和延迟分别做指标，应分别定义分母，不将两份独立好率简单相乘当作复合好率。',
 '假设请求在12:00:59.900进入，以到达时刻归入12:00这一分钟。它到12:01:00.400才满500毫秒，因此刚到12:01不能立刻把上一分钟判完。需要留出结果成熟与采集到达的时间；在结果尚未确定时显示待结算，到了约定判定点仍没及时成功则计为坏事件。成熟是等证据，不是额外放宽用户的500毫秒要求。',
 '同一用户操作若因客户端重试产生两次API尝试，要选择统计哪一层：统计用户操作时，按稳定操作身份核对最终结果与总等待；统计调用尝试时，两次都进入分母。两种口径都能成立，但不能用用户操作的分子除以调用尝试的分母。后面的算例假定事件已经完成上述分类与对账。');
});
reviseCausalSection('slo',1,s=>{
 s[1]=para('沿用同一观察窗的查询：甲处理900次，其中899次为好；乙处理100次，其中90次为好。先把事件相加：总数1000，好989，坏11。总体好率989/1000=98.9%。')+
 figure('v51-slo-event-ledger','先按同一规则分类，再合并计数。图中99%目标只用于这组1000次查询；后面的告警规则另用99.9%。')+
 para('如果先求两台实例的好率再简单平均，结果约94.94%。这等于让乙的100次查询和甲的900次查询各占一半权重。用户经历没有改变，仅把甲拆成两台机器，实例均值却可能改变，因此它不适合作为这里的总体请求好率。',
 '正确的聚合次序是先合并同口径的好事件和总事件，再做一次除法。跨实例、可用区或版本同样如此。若希望每个租户都得到保护，可以另设租户级目标；它与总体请求目标是两份承诺，不能用总体达标掩盖某个租户长期失败。',
 '时间也必须对齐。进程重启会让累计计数器重置，采集程序需按可解释的增量处理；新旧版本若改变了好事件定义，也不能直接合并。对照同一批原始查询重算，检查入口数、成熟结果数与上报数，才能发现遗漏、重复和时间归属差异。');
});
reviseCausalSection('slo',2,s=>{
 const pos=s[1].indexOf('</p>');
 s[1]=s[1].slice(0,pos+4)+code('Python 3标准库复算 · 同一批1000次查询，不是线上测量','PYTHON',causalTeachingCode.slo)+
 para('程序输出SLI为989/1000，允许坏事件10、剩余预算−1、燃烧倍数11/10。Fraction保存精确分数，便于把1.1与99%目标逐项核对；它没有采集请求。改变目标时保留这批事件，先预测允许损耗和燃烧倍数怎样变化，再运行。')+s[1].slice(pos+4);
});
reviseCausalSection('slo',3,s=>{
 s[1]=para('燃烧倍数比较“当前坏率”与“目标允许坏率”。设30天窗口按720小时估算，目标99.9%，允许坏率0.1%；最近一小时坏率1.44%，燃烧倍数就是1.44%/0.1%=14.4。倍数没有时间单位；把它外推成还能撑多久，需要额外说明流量与故障速度。',
 '先作均匀流量估算：假定每小时1万次请求，整窗为720万次，允许坏事件7200。上述一小时坏144次，占整窗预算144/7200=2%，也等于14.4×1/720。若同样速度持续，从完整预算开始约50小时用完。它是固定条件下的外推，不是未来承诺。',
 '再对照一份已经结束的30天窗口：实际总请求只有100万次，允许坏事件1000；其中某个繁忙小时仍为1万次、坏144次。局部燃烧倍数没变，但这小时实际花掉14.4%的整窗预算。流量不均匀时，精确复盘应使用事件量，不能直接把一小时当作月流量的1/720。')+
 table(['题设','整窗请求 / 允许坏事件','该小时坏事件','消耗整窗预算'],[
  ['每小时固定1万次的估算','720万 / 7200','144','2%'],
  ['已结束窗口的不均匀流量复盘','100万 / 1000','144','14.4%']
 ])+para('常见告警同时看长、短两个窗口：长窗口说明损耗持续达到一定规模，短窗口确认当前仍有快速损耗。例如一小时和五分钟都超过同一快速阈值才触发该级别信号；更缓慢的损耗需要另一组更长窗口。具体阈值与响应级别应对应团队来得及采取的行动。',
 '双窗口不是两笔预算。五分钟位于一小时内，同一个失败会参与两个观察窗，不能把两份计数再相加。长窗仍超阈值而短窗已经恢复，可能解除这一快速信号；它并不抹掉历史坏事件，也不自动批准恢复发布。',
 '只在整月预算耗尽时才报警，响应余量已经很小，修复也不能撤销先前发生的失败；瞬时坏率稍高便唤醒值班，又可能在人员响应前已经恢复。设计时一起考虑检测速度、误报与恢复消退，并附上版本、租户、入口和依赖证据。告警召唤行动，仪表盘解释原因，二者需要配合。');
});
reviseCausalSection('slo',7,s=>{
 const reading=table(['在代码中找到','它负责什么','先独立核对'],[
  ['http_requests_total{outcome="bad"}','业务已经分类好的坏事件计数器','outcome不能仅由HTTP状态码代替'],
  ['rate → sum by(job) → 除法','先处理各序列增量，再合并同组流量，最后求坏率','避免跨实例简单平均；job的分组范围一致'],
  ['job:slo_bad_ratio1h / 5m','同一事件流的两个观察窗口','两者有重叠，不能再相加'],
  ['ReportsFastBurn / for: 1m','两个比例均超阈值且有流量，条件还需持续满足','恢复短窗与恢复整月预算分开'],
  ['slo.test.yaml → promtool_lab.py','固定输入与断言交给真实规则求值器','先读七组输入，再看通过结果']
 ]);
 // Keep all four original source blocks and the existing immutable execution record.
 const firstCode=s[1].indexOf('<div class="code-block"');
 if(firstCode<0)throw Error('Missing Prometheus reading point');
 s[1]=s[1].slice(0,firstCode)+reading+s[1].slice(firstCode);
});

reviseCausalSection('gpu-execution',0,s=>{
 s[1]=para('前面已经把文本变成张量，并用矩阵运算得到输出。现在只追踪其中最小的一步：给2500个FP32元素各加1。FP32表示每元素占4字节的浮点表示。数学式y=x+1规定结果，GPU执行还要决定哪些线程处理哪些位置、从哪里取数、何时算完。',
 'CPU执行主机程序，GPU执行交给它的设备工作。CUDA是NVIDIA提供的并行计算平台和编程模型，这里用它解释工作怎样被提交。host指主机侧，device指设备侧；这些角色与某个Python变量叫什么没有关系。',
 '框架先检查形状、设备和数据类型，再选择实现。kernel称为设备内核，是一次提交到GPU执行的函数；它不等于完整模型层。一层可能启动多个内核，编译器也可能把相邻小操作融合。普通CUDA设备内核启动对主机通常是异步的：函数返回表示提交已推进，不表示结果已经可供主机读取。',
 '先把优化分到两个位置：主机准备慢，设备会等下一份工作；内核访存或计算慢，设备已经在处理却迟迟不结束。把输入放进显存不能自动消除前者。接下来先分工，再看存储、布局、复用与计时，最后回到一次工作真正何时完成。')+sourceAt('cudaModel');
});
reviseCausalSection('gpu-execution',1,s=>{
 const oldCode=(s[1].match(/<div class="code-block"[\s\S]*?<\/pre><\/div>/)||[])[0];
 if(!oldCode)throw Error('Missing original CUDA index code');
 s[1]=para('先区分“程序分给谁”与“硬件在哪里执行”。线程负责一个逻辑执行位置；线程块（block）把一组可以协作的线程组织起来；一次启动的所有线程块组成网格（grid）。流式多处理器（SM）是GPU上的硬件执行资源，设备负责将块安排到可用SM。')+
 table(['对象','本例是什么','不能混成什么'],[
  ['thread：线程','块内编号0到255的一份执行位置','不是独占一个物理核心'],
  ['block：线程块','256个线程；本例共10块','不固定等于一个SM或整张GPU'],
  ['warp：线程束','CUDA中32个线程的一组指令执行单位；每块8组','不等于32个独立CPU线程'],
  ['SM：流式多处理器','实际安排块与线程束执行的硬件资源','不等于程序中的块编号']
 ])+para('CUDA规定同一warp内线程按相应执行模型推进，遇到不同分支时，硬件可能分路径处理。块与warp是不同层次：块定义协作边界，warp影响指令执行与访存。当前常用CUDA模型中warp为32线程；不要把这个数推广成所有GPU平台的通用常量。')+
 oldCode+para('这里把二维编号“块号、块内线程号”映射成一维元素号i=块号×256+线程号。10块启动2560个逻辑线程。第0到8块覆盖0到2303；第9块覆盖2304到2559，前196个编号有效，最后60个必须由i&lt;n挡住。向下取整只开9块，会漏196个元素。')+
 figure('v51-gpu-work-mapping','网格、线程块、线程束是软件组织，SM是硬件资源。最后一块196个有效编号、60个受保护编号；本图没有指定真实硬件驻留数量。')+
 code('无GPU也可运行：Python只复算编号覆盖，不模拟CUDA调度','PYTHON',causalTeachingCode.gpu)+
 para('标准库程序输出10块、2500个有效编号、60个保护编号，以及20000逻辑读写字节。先改成2560：保护编号应为0；再改成2561：需要11块且保护255个编号。覆盖正确只证明没有遗漏或越界，不证明内核性能，也不代表所有线程同时驻留。下一节继续问每个有效线程从哪里读、向哪里写。');
});
reviseCausalSection('gpu-execution',2,s=>{
 s[1]=para('编号决定线程处理哪一项，存储层次决定这项数据在哪里。高带宽显存（HBM）承担大容量设备存储；寄存器保存线程工作值；共享内存（shared memory）允许同一块内线程显式复用数据；缓存则由硬件按自身规则保留近期数据。先分清“谁可以使用”和“放在哪里”，再看下图。')+s[1];
});
reviseCausalSection('gpu-execution',3,s=>{
 replaceCausalText(s,'张量的逻辑形状不能独自告诉你访问顺序。',
  '张量步长（stride）表示沿某个维度前进一步，要跨过多少个存储元素。例如连续的[2,3]数组，其行、列步长为[3,1]；转置成[3,2]视图后为[1,3]，底层六个值还在原处。沿转置后一行读取，访问的是相隔3个元素的地址。形状描述逻辑索引范围，步长才把索引变成地址。张量的逻辑形状不能独自告诉你访问顺序。');
});
reviseCausalSection('gpu-execution',4,s=>{
 s[1]=para('前面一次加法几乎没有跨线程复用，矩阵乘法则让同一个输入参与多个输出。占用率（occupancy）在这里指驻留线程束数相对硬件所支持上限的比例，用来理解可供调度的工作，不是计算单元的有效产出百分比。下面固定每块256线程，再分别限制寄存器、线程总量和共享内存，最后取能同时满足条件的数量。')+s[1];
});
reviseCausalSection('gpu-execution',6,s=>{
 const oldCode=(s[1].match(/<div class="code-block"[\s\S]*?<\/pre><\/div>/)||[])[0];
 if(!oldCode)throw Error('Missing original CUDA timing code');
 s[1]=para('现在分别记录提交时刻和完成时刻。CUDA流（stream）组织一列有序设备工作，同一流中的操作按约定顺序推进；事件（event）是在流中插入的标记，设备经过标记时记录进度或计时信息。主机调用record()只安排标记，不是当场读到设备已经完成。')+
 figure('v51-gpu-time-boundaries','示意时间线无真实耗时。主机提交返回、设备执行、事件完成分别观察；事件区间并不自动包含输入准备与结果消费。')+
 oldCode+para('逐行看这份原有示意：start.record()和end.record()默认记录到当前流，把100次加法夹在中间；end.synchronize()让主机等结束标记完成；elapsed_time返回两个已记录事件之间的毫秒数，再除100得到这段工作按次数的平均。它不是100个用户请求的端到端延迟，也不保证只包含理想内核执行、不含流在区间内等待新提交的空档。',
 '若不等待设备完成，只量Python调用前后，常常主要量到提交开销。若每次迭代都取item()或搬回CPU，又可能反复同步而破坏原本流水。这里需要等待的是选定结束事件；它不等于任意其他流上的全部工作也已经结束。使用多个流时，需显式建立相关依赖并重新定义测量边界。',
 '先预热，再测稳态；首次初始化、分配、编译和算法选择单独报告。若要量用户等待，从输入准备开始计主机时间，在正确的结果完成边界结束，数据复制与同步开销一起计算。两个计时都可以有价值，但起止点与包含的工作必须写清。',
 '这段代码仍要求真实CUDA设备、PyTorch环境和事先准备好的x，本站没有新增GPU计时结果。无GPU时先运行编号复算，再到下文关联的CPU算子实验核对数值与数据访问；CPU结果不能用来填GPU吞吐。')+sourceAt('causalTorchTiming')+linkTo('operator-profiling','继续做可在CPU复现的算子与性能证据实验');
});

reviseCausalSection('agent-memory',0,s=>{
 s[1]=para('前面的运行时已经能安排工具和保存结果。现在增加一个问题：执行记录、旧聊天和用户偏好都在，下一次模型调用究竟看哪一份？先分清模型计算用的参数、应用保存的记录，以及本轮实际发给模型的输入。')+
 para('模型参数是决定数值计算的数字，通常在一次推理中固定。应用保存一句“用户喜欢短日报”，不会立即改写这些参数。上下文是本轮模型实际可见的输入：当前问题、规则、必要历史、工具信息与选中的资料。长期保存只是让信息以后有机会被选入，不等于模型本轮已经看到。')+
 table(['保存对象','内容从哪里来','本轮怎样使用'],[
  ['权威运行状态','执行层按任务协议记录身份、步骤、版本、原操作与结果','先查当前事实，再决定已完成什么、还可做什么'],
  ['长期记忆与资料','不同来源形成偏好、知识、假设或事实引用','按主体、问题、来源与有效条件选择'],
  ['本轮上下文','组装器将获准且适用的记录投影成输入','只在本次模型计算中提供这些可见内容']
 ])+para('权威的意思是：相应事实由哪个系统负责确认。任务库负责本地推进状态，工具接收方负责实际效果，资料库负责文档版本；它们不一定都存于一台数据库。聊天摘要是这些事实的派生描述，没有因为字数更多或出现更晚就取得改写执行结果的资格。')+
 figure('v51-agent-information-flow','先恢复执行事实，再选择本轮可用资料，最后核算完整输入。模型输出回到执行层检查；不会直接改写权威账本。')+
 para('例如R17的旧聊天仍说“正在保存”，当前回执却已确认成功。恢复者先沿任务身份和原操作查证，再重建本轮视图。扩大聊天窗口不能替代这一步；否则越长的历史可能只是保存了更多互相冲突的旧说法。后文依次解决装得下、压缩不失真、恢复不重复、记忆仍适用四个问题。');
});
reviseCausalSection('agent-memory',1,s=>{
 replaceCausalText(s,'候选按已经确定的任务优先级排序；一个工具调用及它的结果作为同一组保留。',
  '候选先完成权限与适用性检查，再按本轮任务优先级排序；代码里的groups是一组组不可随意拆开的材料，例如一次工具调用及它的对应结果。');
 const anchor='分词可能受相邻文本和消息包装影响，';
 replaceCausalText(s,anchor,'跟读assemble时，先看base中的规则和当前任务视图没有被丢掉，再看它逐组构造候选请求并交给count_complete。若固定内容加输出预留已超窗，直接报错；某组放不下则保留当前视图并继续试下一组，最后返回选定视图及完整输入成本。优先级来自调用方，不是这个循环自动学出来的。分词可能受相邻文本和消息包装影响，');
});
reviseCausalSection('agent-memory',3,s=>{
 const needle='并发更新的基本保护';
 const at=s[1].indexOf('<div class="code-block"');if(at<0||!s[1].includes(needle))throw Error('Missing state version example');
 const ledger=table(['观察顺序','程序中实际发生什么','恢复应该相信什么'],[
  ['读旧视图','stale_summary保留R17/v1/RUNNING','它只描述形成摘要时的状态'],
  ['完成本地事务','complete_task写效果13，并把任务改为v2/SUCCEEDED','本例两表在同一SQLite事务提交'],
  ['丢掉聊天后恢复','按original_op查到原回执，效果数为1','使用已确认结果，不创造新操作'],
  ['旧版本条件更新','WHERE version=1影响0行','拒绝覆盖，重新读取当前版本']
 ]);
 s[1]=s[1].slice(0,at)+ledger+para('注意这个实验的边界：任务表和效果表在同一SQLite库、同一事务内更新。它验证“旧摘要与新事实冲突时怎样选择”，没有在两张表提交之间模拟远端网络故障。跨服务先提交效果、任务库尚未确认的窗口，必须继续核对接收方回执，见'+linkTo('agent-recovery','工具效果与任务恢复')+'。')+s[1].slice(at);
});
reviseCausalSection('agent-memory',4,s=>{
 const repeated=s[1].indexOf('<h3>检索出来之后，按本次问题重新判定适用性</h3>');
 if(repeated<0)throw Error('Missing duplicated memory paragraph');s[1]=s[1].slice(0,repeated);
 replaceCausalText(s,'有效期未到，不代表事实仍是最新。','存活时间（TTL）规定保存或使用的期限，不自动保证事实是最新版本。有效期未到，不代表事实仍是最新。');
 s[1]+=table(['context_state.py中的候选','本地检查','回答当前值时的结果'],[
  ['old：user-A，来源v1，期限1000','现在100尚未过期，但来源已是v2','拒绝作为当前事实，列入stale_for_current_fact'],
  ['current：user-A，来源v2，期限1000','主体、时间、未撤回和版本均满足本例条件','接受pool-limit/v2=10'],
  ['other-user：user-B','本轮主体为user-A','不会进入本用户候选结果'],
  ['expired：期限10','现在100已经超期','不接受'],
  ['已缓存的current引用，随后撤回','组装时再次查retracted','即使还拿着引用，也不再接受']
 ])+para('这里的100、1000是固定教学时钟，身份与资料状态也是本地夹具，不代表真实身份服务的访问控制已验收。R17的任务版本v2与pool-limit的资料版本v2各自计数，只是数值碰巧一样；不能把“任务已更新”推成“资料也已更新”。问题若问v1事故，同一份旧资料可能适用，但本程序只演示当前事实选择，并没有实现任意历史版本检索。');
});
reviseCausalSection('agent-memory',6,s=>{
 const at=s[1].indexOf('<details');if(at<0)throw Error('Missing complete context source');
 const walkthrough=table(['先读这个函数或分支','跟踪的对象','运行后核对'],[
  ['setup → complete_task','任务、效果、资料、记忆四张表；固定旧摘要','任务v2成功，原操作效果13'],
  ['run的正常恢复与条件写入','original_op和version分别决定查什么、能否写回','效果仍1，旧更新影响0行'],
  ['lookup_memory','主体、时钟、撤回、来源版本，以及可选引用集合','只接受current；撤回后接受0条'],
  ['bad-policy.sqlite分支','独立数据库中相信旧摘要并创造新操作','效果变2；不是正常恢复再次产生效果'],
  ['preserves_slots','固定样本的版本、时间、单位和假设状态','槽位相等通过，改为confirmed被拒']
 ]);
 s[1]=s[1].slice(0,at)+walkthrough+para('先按上表把要观察的值写下来，再分别看建立数据、选择规则和错误恢复分支。preserves_slots逐字段比较固定对象，不评判任意自然语言摘要；assemble则需要匹配目标模型的完整请求计数器。两者和SQLite恢复是三种不同检查，不能因为其中一种通过就宣称全部上下文工程已通过。')+s[1].slice(at);
});

if(!articleById('gpu-execution').refs.includes('causalTorchTiming'))articleById('gpu-execution').refs.push('causalTorchTiming');
