// One concrete path replaces repeated checklists in the shared training capstone.
const trainingCapstone=trainingCapstoneValidation;
const capstoneDownload='<div class="buttons"><a class="btn" href="labs/training-capstone.zip" download>下载训练恢复综合实验 ↓</a><a href="labs/training-capstone/validation.json" target="_blank" rel="noopener">本次完整记录与源码摘要 ↗</a></div>';
const capstoneSource=name=>'<details class="full-code"><summary>展开完整 '+name+'：与下载源码一致</summary>'+code(name,'PYTHON',trainingCapstoneFiles[name])+'</details>';
{
 const a=articles.find(a=>a.id==='training-lab');
 a.title='综合实战：两进程训练、完整恢复与三个失败对照';
 a.desc=a.intro='先算清样本、更新和恢复状态，再用一条命令运行连续四轮与两轮后恢复。比较器还必须识别“权重没变、优化器变了”的反例。';
 a.prereq='先读6.2、6.4与6.8。Linux/macOS，Python 3.10—3.12、PyTorch 2.5.1；CPU/Gloo即可完成本章。';
 a.objectives=['算清每rank批次数、实际更新数与恢复轮次','逐项比较模型、优化器、随机状态与输入配置','让错误配置和优化器损坏反例被可靠拒绝'];
 a.check=[...a.objectives];
 a.updated='2026.11.05';a.edition='完整实测';a.level='机制 + 实验';a.minutes=60;
 a.tags=['DDP','完整恢复','状态比较','失败对照'];
 a.sections=[
 ['先讲清：恢复的是下一次更新所需的状态',para(
  '一次更新不仅使用当前权重，还会使用优化器历史、数据位置与随机源。固定种子只规定随机序列的起点；已经抽取十次后，重新设置初始种子不会自动来到第十一次。本章选择完整轮边界，轮内尚未提交的梯度无需跨进程保存。',
  '恢复成功的判据是：在相同输入与配置下，连续执行和保存后启动新进程执行，最终逻辑状态一致。文件存在、loss接近或权重能加载，都不足以替代这个比较。')+
  table(['共同恢复的对象','为什么下一步需要它'],[
   ['model','当前参数与必要模型缓冲'],['optimizer','Adam矩量、步计数与参数组配置'],['scaler','所用精度的动态缩放状态；本章FP32为空状态'],['rng_by_rank','各rank的CPU与DataLoader随机源位置；本章模型含Dropout'],['next_epoch','零起始的下一轮索引，不是已完成的微批数'],['signature','world size、设备、精度、batch、累积、模型与数据配置']])+
  para('状态要属于同一提交边界。将较旧权重和较新游标拼起来，会跳过本应训练的数据；只恢复权重而丢掉Adam历史，则会改变下一次更新。实际GPU或不同算子可能需要数值容差，本章固定CPU基线做逐项精确比较。')+
  '<h3>同一份数据、相同参数，随机状态仍可能不同</h3>'+para(
  '本程序有三条不同的随机路径。固定数据生成器重新构造同一全集；DistributedSampler用采样种子与epoch决定这一轮的全局排列，再按rank取片；Dropout使用每个rank自己的随机流。数据相同不代表两rank应使用相同Dropout掩码。把rank0的RNG复制给所有成员，可能仍能启动和保存，却改变后续梯度。DataLoader的generator也单独保存；本章num_workers=0，不含任意多worker预取状态。',
  '恢复顺序同样重要。先创建数据、模型、DDP和优化器，再载入参数、矩量与缩放器，最后恢复对应rank的随机状态，然后以next_epoch调用set_epoch。若先恢复RNG再随机初始化新模型，初始化会继续消耗刚恢复的随机序列；权重后来虽被覆盖，下一次Dropout仍可能错位。next_epoch决定从哪轮重新采样，RNG状态决定从哪个随机位置继续，二者不能互相代替。',
  '这份DDP模型每rank都有完整副本，轮末先汇集两份小型RNG状态，再由rank0连同完整模型与优化器一起保存。它不是让各rank各写一半模型的分片检查点。保存前已完成本轮更新并清梯度，先写同目录临时文件、刷新文件，再替换checkpoint.pt，最后同步保存完成。文件刷新与替换覆盖本例POSIX路径，未验证存储节点掉电；迁移到对象存储、多文件分片或异步保存，要重新定义完整清单与提交顺序。')],
 ['两套基准，各自检验一件事',para(
  '先用6.2的独立单进程全局目标检验DDP归一化：两个rank的窗口有效数为7、0、3，尾窗按实际分母，空窗不推进参数与动量。它使用自己的三参数回归模型，检查的是一次更新算得对不对。',
  '本章另用1024条合成分类样本、128维输入、隐藏宽32、Dropout与AdamW，检查多轮状态能否接续。两套程序的模型、数据和初值不同，不能拿一个实验的loss与另一个比较。')+
  para('为什么不只跑恢复对照？两条路径调用同一训练代码，可能共同保留同一个错误。例如把标签错移一格，连续与恢复仍能完全相同；错误的损失分母也可能在两路重复。独立全局目标基准负责检查更新语义，样本身份与目标对齐负责检查输入，完整恢复对照负责检查状态接续。这三种证据互相补充；把其中一种的通过写成全部正确，会漏掉其看不见的错误。')+
  '<p><a href="#/article/distributed-training">先复算全局分母、裁剪与空窗 →</a></p>'+
  table(['本章固定配置','推导'],[['2个rank','每rank分512条'],['每rank每批32条','512÷32=16个小批'],['累积2批','每轮8个窗口；全局batch=2×32×2=128'],['FP32、各批等长','本次每轮实际调用AdamW.step 8次']])+
  para('窗口数是尝试次数。实际调用由训练程序的优化器回调计数；本次FP32观察到两者均为8，不把这个相等关系推广到FP16跳步或任意优化器。实际调用也不保证每个参数都改变，更不代表模型已经有真实任务质量。')],
 ['实战：一条入口，三次独立训练',para(
  '解压实验包，在已经安装PyTorch 2.5.1的环境直接运行下面命令。入口使用当前Python启动真正的两进程CPU/Gloo作业；请勿再把verify_run.py包进torchrun。数据由固定种子生成，不下载外部模型或语料。')+
  code('在解压后的training-capstone目录执行','SHELL','python verify_run.py --report run-report.json')+
  table(['运行名','执行的轮次','本次实际调用'],[['full','1、2、3、4','32'],['split','1、2，保存后正常退出','16'],['resumed','新进程读取split，从3执行到4','16']])+
  para('训练脚本的--epochs=4表示目标总轮数。恢复点next_epoch=2，故新进程只运行第3、4轮。三次运行各有独立输出目录；比较的是full与split＋resumed两条训练路径，不能把32＋16＋16叫作同一个模型的累计进度。',
  '检查点使用临时目录，验收结束后回收，JSON报告写到指定文件。每个受信子命令有60秒预算，超时对自己的进程组发停止信号，另给5秒宽限再按需强制回收。这不是恶意代码沙箱。')+
  capstoneDownload+capstoneSource('verify_run.py')],
 ['先读日志，再看“完全相同”具体比较什么',figure('v29-training-recovery','实际CPU/Gloo运行。两条路径都完成四轮、32次实际调用；累计数由各轮日志推导，程序没有把它作为历史累计字段写入检查点。')+
  para('每轮日志先核对samples=1024、attempted_update_windows=8、applied_optimizer_steps=8。resumed的start_epoch为2，只打印epoch=3和4。最后检查next_epoch=4，rng_by_rank恰好含两个成员。')+
  table(['比较器实际检查','本次结果'],[['model、optimizer、scaler','逐项精确相等'],['两rank RNG、next_epoch、signature','逐项精确相等'],['张量dtype、shape、元素','逐项精确相等'],['运行耗时、样本吞吐','不作为状态相等条件']])+
  para('compare_checkpoints.py递归比较逻辑载荷，不比较两份序列化文件的SHA256。文件编码或容器元数据不同，不必然代表参数不同。反过来，只比较模型权重相同，也不能证明Adam历史与输入进度相同。原始时长保留在记录里，仅是本机功能运行观察。')+
  capstoneSource('compare_checkpoints.py')],
 ['三个反例：错误原因和拒绝结果必须对得上',table(['只改变这一项','应该在哪里拒绝','本次实际观察'],[
  ['accum由2改3','16个小批不能整除，拒绝这套固定窗口配置','退出1；对应错误匹配；无输出检查点'],
  ['hidden由32改16，再加载旧状态','配置签名不匹配','退出1；对应错误匹配；无输出检查点'],
  ['模型权重完全不变，只将一项Adam exp_avg加0.25','完整比较器的optimizer路径','权重相同断言通过；比较器退出1']])+
  para('前两个反例检查恢复入口，第三个检查比较器本身。只要命令退出非零就报“反例通过”，可能把缺包、路径错误也当成成功；入口同时核对具体错误原因。第三项先证明模型权重没有改，再要求比较器在optimizer路径发现差异。',
  '不要在自己的生产检查点上做这些改动。程序只修改本次临时目录内、由同一受信程序生成的测试副本；训练主脚本和原始对照保留。')],
 ['出现差异时，从第一个不同字段定位',table(['第一处证据','先查什么'],[
  ['resumed从0开始','--resume路径、加载分支与start_epoch'],['恢复后三轮日志而非两轮','--epochs是总目标还是追加轮数'],['模型相同，optimizer不同','是否保存/加载矩量与参数组；是否多调用了一次step'],['RNG或下一批不同','逐rank随机状态、sampler轮次、worker与预取边界'],['样本相同，梯度统一差一个倍数','全局有效分母、默认DDP平均与累积归一化']])+
  para('本章train_ddp.py与6.4的下载源码逐字节一致。查看no_sync包围前向和反向的位置、post hook计数位置、轮末收集RNG的位置，再沿resume分支检查加载顺序。错误配置的拒绝是这份固定规模程序的契约，不代表分片框架永远不能重分片。')+
  capstoneSource('train_ddp.py')],
 ['本机通过后，怎样进入两机四卡',table(['下一层','新增验收'],[
  ['单机GPU','设备绑定、CUDA运行时、目标精度与数值'],['真实两节点','共同world与rank、小集合通信、物理网络及NCCL'],['GPU恢复','同一提交点与数据进度；按算子定义容差'],['Kubernetes作业','资源形状、共同会合、卷、成员失败与取消回收'],['性能与质量','固定有效工作量、预热/正式窗口、质量及总成本']])+
  para('split在第二轮末正常结束，resumed由新进程接续；本次没有注入任意微批中途崩溃，也没有测试掉电、动态world size、GPU或跨主机网络。轮中故障仍按6.8的提交边界重做，不把本章四轮相等推广成任意时刻无损恢复。',
  '闭卷回答：每rank为什么是16个小批、每轮却只有8次更新？两条完整路径各经历多少次调用？权重相同而Adam不同，为何下一步可能偏离？分别提交推导、实际报告和三个反例，不用一张“完成”截图代替。')+
  '<p><a href="#/article/multinode-lab">进入真实两机四卡的分层手册 →</a>　<a href="#/article/training-performance">再设计同口径性能实验 →</a></p>']
 ];
 a.exercise=['full有32次调用，split有16次，resumed有16次；应把最终模型进度记为64次吗？若权重相同但Adam矩量不同，验收该通过吗？','不应。full是一条32次的基线，split＋resumed是另一条16＋16=32次的路径，不能相加两条路径。Adam矩量会影响下一次更新，完整恢复比较应拒绝仅权重相同的错误状态。'];
 a.sections=a.sections.map(([title,body])=>[title,infraReadableHTML(body)]);
 a.desc=infraReadableHTML(a.desc);a.intro=a.desc;
 a.exercise=a.exercise.map(infraReadableHTML);
 a.objectives=a.objectives.map(infraReadableHTML);a.check=[...a.objectives];
 a.refs=a.refs.filter(id=>id!=='activity');
}
