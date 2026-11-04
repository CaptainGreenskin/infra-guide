/* Keep the existing AMP, five-buffer, FSDP and CUDA derivations; add actual object accounting. */
const stateObjects=infraReadableHTML(
 '<div class="mechanism-core" id="memory-state-objects">'+knowledgeSubhead('先说明数的是什么：元素、底层存储、分配器和设备')+
 para('张量有shape（形状）、dtype（元素类型）和底层存储。FP32每元素4字节，BF16和FP16每元素2字节，存储类型与算子计算类型要分别核对。元素数量乘每元素字节数，得到这个张量的逻辑载荷；参数、梯度、优化器状态、前向保存的中间量则是不同用途的张量。讨论“模型占多少”时，必须先说包含哪些用途、是否共享存储、在哪个设备及哪个时刻。P表示参数元素数，不是参数张量个数，也不是模型文件大小。',
 '两个view可能共享同一块底层存储。实验用8个FP32元素，实际底层32字节；取前6个和后6个得到两个view，逻辑元素合计12个、48字节，却只指向同一块32字节存储。反过来，一个小view也可能让整块更大的底层存储继续存活。所以逐张量numel×element_size相加，不能无条件当作分配器实际用量。')+
 table(['口径','计算或含义','典型误用'],[
 ['张量逻辑载荷','numel×element_size','共享view重复相加'],
 ['唯一底层存储载荷','按共享关系去重，统计仍被持有的存储','当作allocator峰值或RSS'],
 ['CUDA allocated','PyTorch分配器统计的张量分配','以为覆盖所有CUDA/NCCL分配'],
 ['CUDA reserved','分配器保留的总内存，已包含其中的allocated','把allocated再加一次'],
 ['设备级读数 / CPU RSS','各工具按自身口径观察进程或设备','与前面张量载荷混成同一列']])+
 para('本章先用小模型把对象和寿命数清，再回到GPU峰值。CPU实验中的944字节是四类保留状态的载荷，不是训练进程只占944字节；解释器、算子、临时区和激活都没有进入这份数。')+'</div>');

const stateDtypes=infraReadableHTML(
 knowledgeSubhead('16P是一份指定账本，不是打开AMP就固定得到的结果')+
 para('以本次PyTorch 2.5.1、AdamW foreach=False为例，FP32模型有58个参数元素，分在4个参数张量里。参数232字节，梯度232字节，AdamW的两份矩量（moment，梯度历史统计）exp_avg与exp_avg_sq各232字节；每个参数张量另有一个FP32 step标量，共16字节。首次更新之后保留这些对象时，总计4×58×4+4×4=944字节。',
 '同一模型只在前向使用CPU BF16 autocast（按算子自动选择计算精度），输出变成BF16，但保留的参数、梯度与两份moment仍是FP32，所以这份状态账仍944字节。直接将参数转为BF16时，本例梯度和moment也跟随BF16，变成4×58×2+16=480字节；它没有额外创建一份FP32主权重。这里观察的是实际实现，不能因此建议任意模型直接低精度训练。')+
 figure('v25-state-payload','实际CPU状态载荷随阶段变化。FP32与FP32参数加BF16 autocast的状态相同；图只比较后者与直接BF16参数，不包含激活和整步临时峰值。')+
 table(['阶段','FP32或FP32参数加autocast','直接BF16参数','为什么'],[
 ['创建后','232B','116B','梯度和Adam状态尚未建立'],
 ['首次反向后','464B','232B','有梯度，Adam尚未首次step'],
 ['首次step后','944B','480B','两份moment和4个step标量建立'],
 ['zero_grad(set_to_none=True)后','712B','364B','不再持有这些梯度张量'],
 ['再次step后','944B','480B','本例状态尺寸不再增长']])+
 para('因此，刚加载模型能放下、首个backward能放下，都不能证明首次step能放下。优化器状态可能延迟创建；不同optimizer、foreach/fused路径、主权重策略、梯度dtype、状态卸载和分片会改变账本与临时区。原来“五类状态”的16P题保留为明确指定的另一种策略；两份账本有时总数相同，组成却不一样。实际核对时遍历运行对象，不靠名字推断。')+
 knowledgeCheck('这个模型把set_to_none=True改为保留并清零梯度，能直接沿用清梯度后712B吗？','不能。若梯度张量仍分配，FP32四类状态载荷仍944B；数值为零不等于对象没有存储。分配器reserved还可能在解除梯度引用后继续保留缓存。'));

const stateCheckpoint=infraReadableHTML(
 knowledgeSubhead('重计算改变中间状态寿命，保存多少与峰值多少分别测')+
 para('前向为了反向会保存某些输入和中间结果。activation checkpoint（激活重计算）在指定边界少保留部分中间量，反向需要时再运行相关计算。它与持久化checkpoint不同：前者交换内存和计算，后者把训练状态写到故障后仍可恢复的存储。它不会凭空减少参数和优化器状态。',
 '本例三个Block都是Linear(32,64)→GELU→Linear(64,32)，输入16×32，复制相同权重后分别执行。用saved_tensors_hooks观察前向结束时为反向保留的对象，按底层存储去重并排除参数；普通反向32768字节，非重入重计算8192字节。差24576字节，只是这个观察点的非参数保存量减少，不是整步显存峰值下降24576字节。')+
 figure('v25-checkpoint-storage','实际CPU反向保存对象对照与数值一致性。本例无dropout；重算入口次数不是整块完成次数或耗时比例。')+
 para('反向结束后，每块forward入口普通调用1次、重计算调用2次。非重入方式能在所需中间量重建后提前停止，因此不能说整个前向完整重跑一次，更不能直接断言两倍步耗时。输出、每个参数及输入梯度都对照，最大误差本次均0；换成有随机数、状态更新、数据依赖分支或副作用的计算时，必须另查兼容性。',
 '边界太细会增加重算和调度，边界太粗又可能保留很大的输入。真实选择应固定模型、批次与精度，同时测逐rank完整更新的峰值、时间和梯度/质量。若OOM发生在Adam首次建立状态或参数聚合，减少激活未必解决；若只是一个时刻临时重叠，多卡平均显存又会掩盖失败rank。')+
 linkTo('flash-attention-io','比较减少注意力中间矩阵读写的另一条路径')+
 linkTo('checkpoint-recovery','区分持久化训练状态与激活重计算'));

const statePractice=infraReadableHTML(
 knowledgeSubhead('实战一：实际张量与延迟建立的状态')+cmeLab('tensor_state_bytes.py')+
 knowledgeCheck('P增加1000个元素但仍是4个参数张量，FP32状态载荷增多少？','这份实现与阶段下增加4×1000×4=16000字节；step标量仍4个，不增加。若改成更多参数张量，step标量数量也会变。激活、临时区和分配器不在这个推导中。')+
 knowledgeSubhead('实战二：保存供反向使用的对象与重算')+cmeLab('checkpoint_saved_tensors.py')+
 para('先预测重计算能影响哪类状态，再跑程序核对。到GPU环境，保留本章已有CUDA同步、重置和完整更新测量步骤；分别记录首次与稳态、每个rank的allocated/reserved峰值、步耗时和数值结果。CPU保存对象实验解释机制，不能替代GPU峰值。'));

{
 const a=articles.find(a=>a.id==='gpu-memory'),old=a.sections.slice();
 a.sections=[['统计对象：逻辑元素、共享存储与设备口径',stateObjects],old[0],['实际状态：dtype、AdamW与首次更新',stateDtypes],old[1],old[2],old[3],old[4],['激活重计算：保存对象、重算与数值核对',stateCheckpoint],old[5],old[6],['实战与变化题：真实CPU张量和重计算',statePractice]];
 a.refs=nitRefs([...a.refs,'v25AdamW','v25Checkpoint']);a.minutes=65;a.updated='2026.11.05';
 a.objectives=['按对象、dtype和寿命推导状态载荷与峰值','解释autocast、梯度累积、重计算与分片分别改变什么','复现CPU对象计数并设计逐rank的GPU测量'];
 a.prereq='理解前向、反向与优化器更新；先读6.1—6.2，能区分参数元素、张量与数据并行副本。';
}
{
 const d=infraDomain('training'),p=d.points.find(p=>p.id==='tr-memory');
 p.body=stateObjects+stateDtypes+p.body+stateCheckpoint;p.lead='先分张量逻辑载荷、共享底层存储、分配器和设备读数，再按dtype与对象寿命建立训练显存账。16P只属于指定策略；总峰值取决于哪些对象同一时刻存活。';
 d.refs=nitRefs([...d.refs,'v25AdamW','v25Checkpoint']);
}
const stateCasesBeforeCME=infraFieldCases.training;
infraFieldCases.training=()=>'<h3>训练状态：先数对象，再测完整更新</h3>'+cmeLab('tensor_state_bytes.py',false)+cmeLab('checkpoint_saved_tensors.py',false)+linkTo('gpu-memory','阅读状态、峰值和重计算推导')+stateCasesBeforeCME();
