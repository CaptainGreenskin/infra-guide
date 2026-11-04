/* Collective semantics and matching contracts, then waits and measured local probes. */
const collectiveObjects=infraReadableHTML(
 '<div class="mechanism-core" id="collective-members-layout">'+knowledgeSubhead('先写谁参加、各自持有什么、结束后谁得到什么')+
 para('集合通信是一个进程组共同参与的数据操作。rank是组内参与者编号；全局rank、本机local rank、GPU设备编号不是天然同一个值。子进程组还会有自己的成员顺序，例如全局rank 2和6组成两人组，组内编号与这两个全局数字需要明确映射。AllGather或ReduceScatter的数据布局随组内rank顺序解释，不能随意换成设备枚举顺序。',
 'Gloo是本章实际使用的CPU通信后端；NCCL用于GPU集合通信。通信语义与具体算法分别讨论：AllReduce规定每个参与者得到归约结果，运行库再根据后端、消息、拓扑和配置选择实现。画一个环，不等于证明这次真实运行选择了环形算法。')+
 table(['独立操作；rank0=[1,2,3,4]，rank1=[10,20,30,40]','rank0结束后','rank1结束后'],[
 ['Broadcast，从组内rank0广播','[1,2,3,4]','[1,2,3,4]'],
 ['Reduce SUM，到组内rank0','[11,22,33,44]','不承诺持有最终归约结果'],
 ['AllReduce SUM','[11,22,33,44]','[11,22,33,44]'],
 ['AllGather，按rank顺序收集','[1,2,3,4,10,20,30,40]','同一完整拼接'],
 ['ReduceScatter SUM，等分两片','[11,22]','[33,44]']])+
 para('这几行各自从同一输入独立开始，不是一条连续执行记录。SUM是逐元素求和，不自动除进程数。默认DDP以组内平均的梯度语义同步副本，但这与底层AllReduce SUM是不同层；通信钩子或其他训练方式还可能改写行为。要回答“算出的是什么”，先把完整输入输出写出来。')+'</div>');

const collectiveArithmetic=infraReadableHTML(
 knowledgeSubhead('分片布局与均值分母，都属于正确性')+
 para('本章固定整数输入在float64中可精确表示。一般浮点加法不满足结合律，改变归约次序后，数学等价的实现也可能有末位差异；应先约定逐位一致还是误差阈值，再用目标任务核验，不能把本例精确相等推广到任意大张量。')+
 figure('v24-reduce-scatter-gather','本次实际Gloo组合支持张量ReduceScatter；再AllGather可重建完整和。图中间的和仅是数学表示，不是集中到rank0的真实数据路径。')+
 para('ReduceScatter后的每个rank只持有归约结果的一片，AllGather把这些片按成员顺序收齐。它可以在语义上重建AllReduce SUM，但两次调用与融合实现的开销、调度和选择可能不同，不能仅因数值相同就宣布两者性能相同。具体后端还可能不支持某种接口变体，所以实验要记录版本与能力，而不是套一张永远不变的支持表。',
 '变长输入再设一组独立数值：rank0有[2,4,6]，rank1有[20]。总和32、有效项4，整体均值8；先各自求均值4与20再平均，会得到12。若为了固定shape补成[20,0,0]，又把补零计入分母，就得到32/6≈5.3333。零值作为传输填充与零值作为真实样本，语义不同。')+
 code('本例变长汇总：先收长度，再收定长张量，最后按长度取值','PYTHON',
 'length = torch.tensor([len(local_values)], dtype=torch.int64)\nlengths = [torch.zeros_like(length) for _ in range(world_size)]\ndist.all_gather(lengths, length)\nmax_length = max(item.item() for item in lengths)\npadded = torch.zeros(max_length, dtype=local_values.dtype)\npadded[:len(local_values)] = local_values\nparts = [torch.zeros_like(padded) for _ in range(world_size)]\ndist.all_gather(parts, padded)\nreal = [part[:size.item()] for part, size in zip(parts, lengths)]\n# 计算均值时另外汇总sum与有效count；填充不增加count')+
 para('变长输入能否直接AllGather，取决于所选接口与后端能力。上例显式交换长度并补齐，便于核对各项，不声称是所有场景最省带宽的方法。对于训练损失和梯度，还要接回有效词元分母与DDP默认平均：各rank有效目标不同，就应按全局目标定义权重，而不是靠通信函数猜。全局有效count为0时也要有统一分支，避免除零或只有部分rank跳步。')+
 linkTo('distributed-training','复习并行策略和有效目标权重')+
 linkTo('data-pipeline','检查样本分流、尾批与有效目标'));

const collectiveContract=infraReadableHTML(
 '<div class="mechanism-core" id="collective-signature-order">'+knowledgeSubhead('每次调用都有约定，不能只看所有rank都写了“通信”')+
 para('可以把一次调用的约定写成：进程组、调用序号、操作、dtype、元素规模、根rank或分片布局。相应成员必须在匹配的顺序进入兼容操作。rank0第7次做AllReduce，rank1第7次做Broadcast，即使两个张量都是float32[2]，也不是同一个集合操作。一个rank因为本地条件提前return，其他rank可能继续等它；超时只说明约定没被及时满足，不能单独定位为网络故障。')+
 figure('v24-collective-signature-wait','两个错误对照由实际DETAIL调试包装器给出指纹不一致诊断。下方80ms是明确注入的调用前睡眠，旁边数值是各rank本次本地call+wait耗时。')+
 para('本章程序分别用独立进程组测试[2]对[3]的AllReduce形状差异，以及相同[2]但AllReduce对Broadcast的操作差异。调试包装器在真正下发前比较指纹，双方快速收到RuntimeError；没有用“永远卡住”证明错误。调试检查本身增加同步，不能把开启它之后的耗时拿来与无调试性能混比。',
 '多组通信还要明确建组与操作顺序，线程并发时也要协调发起次序。把某组操作挪到另一条流，并不会自动证明组间依赖和张量生命周期正确。先完成数值与协议验证，再讨论重叠。')+'</div>');

const collectiveWait=infraReadableHTML(
 knowledgeSubhead('异步发起、结果可用和真正重叠不是一件事')+
 para('async_op=True返回一个工作句柄，表示可以按后端约定继续安排工作。它不是“结果已经可读”或“通信耗时已被隐藏”的证明。本章CPU实验显式work.wait后才读取张量；GPU后端还涉及CUDA流上的排队与依赖，当前流、其他流与主机的同步保证要按实际API核对。张量仍被通信使用时，也不能提前复用或释放其存储。',
 '同步调用或wait区间可能包含其他rank尚未到达的时间。本章先让两rank会合，再让rank1在发起前睡80ms：rank0往往在集合操作里等待较久，rank1真正进入后很快完成。两边都得到3。这个受控对照说明“某rank通信区间长”可以由另一个rank的输入或计算迟到造成；它没有测网卡独立传输时间，也没有证明真实NCCL集群存在相同根因。')+
 code('本章实际CPU核心：完成等待后再读结果','PYTHON',
 'started = time.perf_counter_ns()\nwork = dist.all_reduce(value, op=dist.ReduceOp.SUM, async_op=True)\nwork.wait()\nelapsed_ms = (time.perf_counter_ns() - started) / 1e6\nassert value.item() == 3\n# elapsed_ms覆盖本地发起和等待，不单独等于网络传输')+
 para('比较各rank时先记录进入同一逻辑操作前发生了什么：取得批次、CPU变换、前向/反向、桶就绪、调用发起、完成等待。跨主机绝对时钟可能有偏差，先用本地持续时间和共同阶段身份关联；不能把未校准时间戳的差值当成精确网络延迟。'));

const collectiveOverlap=infraReadableHTML(
 knowledgeSubhead('只优化暴露在关键路径上的尾部，才可能缩短step')+
 para('反向传播中，不同参数的梯度在不同时间就绪。DDP将梯度组织成桶，满足就绪与发起次序后，某些桶通信可以与后续计算重叠。桶大可能等很久才就绪，桶小则增加启动和调度开销；还要考虑梯度副本、缓冲寿命与内存峰值，不能只按网络带宽选桶大小。',
 '独立教学时间线：反向计算0—6ms；第一桶在2ms就绪，通信2—5ms；第二桶在6ms就绪，通信6—8ms。假设资源独立且无额外等待，总墙钟为8ms，不是6+3+2=11ms。把第一桶从3ms优化到1ms，第二桶仍在6ms才就绪，整体可能还是8ms；先消掉不影响结束时刻的部分，不会必然带来用户可见加速。')+
 table(['比较','已知事实','可以推断'],[
 ['独立collective更快','该固定规模的通信路径耗时下降','尚不能推出训练step等比例下降'],
 ['通信更早启动','计算与通信区间有重叠','仍需检查资源争用和最终完成时刻'],
 ['等待最长rank改变','瓶颈位置或到达顺序改变','需对照输入、计算、通信和同步'],
 ['显存峰值上涨','更多缓冲可能同时存活','优化不能突破容量或质量约束']])+
 para('GPU计算和通信也会争用带宽或执行资源，时间轴重叠不等于免费。强扩展比较固定全局任务，弱扩展固定每rank任务；报告时说明有效词元、全局batch和步数是否一致。按全rank汇总有效完成量、使用作业墙钟时间，并看最慢rank，而不是把各rank吞吐平均后当作全作业吞吐。'));

const collectiveRing=infraReadableHTML(
 knowledgeSubhead('环形通信公式用来估量级，先声明单位与假设')+
 para('另设4个rank，每rank输入16MiB，选择理想环形ReduceScatter加AllGather；分4块，每块4MiB。每阶段N−1=3轮，每rank发送3块、12MiB；两阶段合计发送24MiB，也会接收24MiB。若B表示每rank有效单向载荷带宽，估算发送时间时不再把接收字节重复加到同一个分母。')+
 knowledgeFormula('理想环形AllReduce','T ≈ 2(N−1)α + 2(N−1)M/(NB)','α为每轮启动项，M为每rank输入字节；忽略竞争、分层、协议和其他开销。')+
 para('固定B=8GiB/s=8192MiB/s，α=10μs，发送项24/8192秒≈2.93ms，六轮启动共0.06ms，总约2.99ms。这里GiB是二进制字节，若链路规格是Gb/s，还需先把bit与byte、十进制与二进制换清。2.99ms是本题理论量级，不是本站实测NCCL结果。',
 '真实库可能按大小选择不同算法、协议、通道和拓扑；机内GPU互联、PCIe、NUMA与GPU到网卡的位置，都会改变路径。nccl-tests的算法带宽与总线带宽也有各自折算，不能当成某一网卡的现场读数。先保存输入规模、参与组、设备映射、算法与指标定义，才有可比较的性能结论。'));

const collectiveDiagnosis=infraReadableHTML(
 knowledgeSubhead('会合、小通信、持续大通信和训练，是四级不同验收')+
 table(['阶段','要证明什么','不能跳过的下一步'],[
 ['作业会合','进程找到同一作业、成员和配置','绑定设备并成功完成小集合操作'],
 ['小消息数值','成员、约定和基本数据路径可工作','真实规模、持续运行和错误恢复'],
 ['目标规模通信','相应拓扑下能持续传输','回到真实梯度桶、输入与计算'],
 ['完整训练','有效更新、损失与质量口径符合要求','性能、成本、故障与恢复验收']])+
 para('MASTER_ADDR/PORT用于作业会合，不覆盖全部NCCL数据连接。实例支持RDMA、驱动可用、容器可见设备、实际选中网卡与跨节点路径，是不同检查项。功能可用TCP完成，不代表已经验证RDMA或机内GPU互联；强制某个接口后改善，先记录实际选路和代价，再验证其他节点。',
 '当一个rank先OOM或退出，其他rank可能稍后才报集合超时。收集所有节点日志，按共同任务和阶段定位第一处异常，不能只拿最后一条NCCL报错归因。若各rank在同一collective的到达时刻已经差很大，先查输入与计算；若到达接近而大消息暴露尾部很长，再查路径、拓扑与资源竞争。',
 '本地条件分支也要检查。某rank发现坏样本或没有有效目标时，若需要整组跳过，应在所有成员仍能参与的阶段通过一致协议决定，而不是只有本地跳过通信。已经崩溃的rank无法靠再做一次标志归约自动救回，仍需作业层故障与恢复机制。')+
 linkTo('checkpoint-recovery','继续核对中断、原检查点与完整恢复')+
 linkTo('multinode-lab','把阶段验收带到两机四卡手册'));

const collectivePractice=infraReadableHTML(
 knowledgeSubhead('完整实战：三组真实进程组与逐项数值')+sctLab('collective_contracts.py')+
 para('运行前先手算[11,22,33,44]、两个分片和变长均值8。运行后分别看correct、shape_mismatch、order_mismatch；错误记录里的operators与shapes来自真实异常指纹，而不是程序预先给结论。再比较rank1注入80ms之前和之后的位置，解释为什么两段本地call+wait不相同。',
 '变化题：让rank1没有有效项，rank0仍[2,4,6]，全局和12、有效count3，正确均值4。直接求空rank均值会引入NaN；应定义空输入的合法传输、全局count与统一分支。把原fixture改空时也必须更新断言，不能让“原预期失败”冒充库出错。',
 '最后把两rank CPU功能结果与两节点GPU手册的证据逐项对照：本章没有验证NCCL、RDMA、网卡、GPU互联或多机吞吐。已有局部正确性证据可复用，缺的目标环境证据仍要实际取得，不能靠把backend字符串改成nccl就宣布完成。'));

{
 const a=articles.find(a=>a.id==='training-communication');
 a.sections=[
  ['参与与布局：进程组、rank和操作结果',collectiveObjects],
  ['数值正确性：分片、变长与全局分母',collectiveArithmetic],
  ['调用契约：顺序、操作、shape与dtype',collectiveContract],
  ['等待含义：异步句柄与慢rank到达',collectiveWait],
  ['计算重叠：桶就绪和暴露的通信尾部',collectiveOverlap],
  ['量级估算：环形字节账与带宽单位',collectiveRing],
  ['分层诊断：会合、数值、规模与完整训练',collectiveDiagnosis],
  ['实战与变化题：真实Gloo数值和协议反例',collectivePractice]
 ];
 a.refs=nitRefs([...a.refs,'v24Collectives','v24NCCL']);a.minutes=55;a.updated='2026.11.04';
}
infraDomain('training').points.find(p=>p.id==='tr-collectives').body=collectiveObjects+collectiveArithmetic+collectiveContract+collectiveWait+collectiveOverlap+collectiveRing+collectiveDiagnosis;
infraDomain('training').refs=nitRefs([...infraDomain('training').refs,'v24Collectives','v24NCCL']);
const collectiveCasesBeforeSCT=infraFieldCases.training;
infraFieldCases.training=()=>'<h3>先验证集合协议，再解释通信等待</h3>'+sctLab('collective_contracts.py',false)+linkTo('training-communication','阅读通信、重叠、量级与完整源码')+collectiveCasesBeforeSCT();

