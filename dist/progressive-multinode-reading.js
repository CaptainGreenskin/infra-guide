/* Read the fixed two-node launch as a process and state lifecycle, then run its commands.
   Load after the progressive lessons and before first-reading-flow.js. */
(()=>{
 const a=articles.find(x=>x.id==='multinode-lab');
 const titles=['环境与实验边界','安装与检查','逐级启动，再加入第二台节点','核对成功的证据','故障定位与结束实验','迁移到真实 Transformer 工作负载'];
 if(!a||a.title!=='两机四卡 DDP：从环境检查到训练验收'||a.sections.length!==6||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Multinode lesson layout changed');
 const old=a.sections.map(s=>s[1]);
 const all=(s,re)=>[...s.matchAll(re)].map(m=>m[0]);
 const blocks=s=>all(s,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const fig=s=>all(s,/<figure\b[\s\S]*?<\/figure>/g);
 const p=(...rows)=>rows.map(x=>'<p>'+x+'</p>').join('');
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="progressive-detail"><summary>'+title+'</summary>'+body+'</details>';
 const links=all(old[1],/<a\b[^>]*\bhref=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/g).join(' ');
 const install=blocks(old[1]),launch=blocks(old[2]);
 if(install.length!==1||launch.length!==4||fig(old.join('')).length!==1)throw Error('Multinode preserved material layout changed');
 if(typeof multinodeLaunchSource!=='string'||typeof multinodeLaunchWorkerSource!=='string'||typeof multinodeLaunchValidation!=='object')throw Error('Load multinode launch sources before the reading lesson');
 const v=multinodeLaunchValidation;
 if(v.environment.physical_hosts!==1||v.environment.launchers!==2||v.environment.workers_per_launcher!==2||v.configuration.samples!==8192||v.configuration.batch_size_per_rank!==64||v.configuration.accum!==2||v.configuration.hidden!==32)throw Error('Multinode CPU fixture configuration changed');
 const numeric=v.recovery_numerical_comparison;
 if(numeric.bitwise_equal!==false||!numeric.within_declared_contract||numeric.contract.floating_atol!==1e-6||numeric.contract.floating_rtol!==0||v.full_state_comparison.exit_code!==1||v.continuous_repeat_comparison.exit_code!==0)throw Error('Review the recorded multinode recovery boundary');
 const practiceLinks='<p class="practice-links"><a href="labs/multinode-launch.zip" download>下载四进程启动与恢复实验 ↓</a> <a href="labs/multinode-launch/README.md" target="_blank" rel="noopener">运行说明与比较契约 ↗</a> <a href="labs/multinode-launch/validation.json" target="_blank" rel="noopener">实际记录与源码摘要 ↗</a> <a href="labs/multinode-launch/verify_launch.py" download>下载 verify_launch.py ↓</a></p>';
 const newPractice='<span id="multinode-launch-run"></span>'+p('本次新增实验把两个启动器真正运行起来，每个创建两个 CPU/Gloo worker，使用原字节 train_ddp.py。verify_launch.py 在本机为两组启动器选择共同的回环入口，以同一临时目录保存状态；launch_worker.py 先记录各 worker 取得的身份，再执行训练程序。输入为8192样本、每rank小批64、累积2，隐藏宽度明确设为32，与GPU手册默认256分别记录。')+
 code('解压新实验包后，在已有 PyTorch 2.5.1 环境中直接运行','SHELL','python verify_launch.py --report run-report.json')+
 table(['实际核对','本次记录'],[
 ['worker 身份 (RANK, LOCAL_RANK, GROUP_RANK)','(0,0,0)、(1,1,0)、(2,0,1)、(3,1,1)'],
 ['每轮全局输入 / 有效 batch','8192 / 512；每rank32小批、16窗口、16次实际调用'],
 ['连续两轮 / 一轮保存后恢复到两轮','每rank32次实际调用 / 16＋16次，next_epoch=2'],
 ['结构、配置、计数与随机状态','逐项相同，保留4份rank随机状态'],
 ['原严格比较器','拒绝逐位相等：state.model.0.weight存在浮点差异'],
 ['单列浮点数值契约','atol=1e−6（绝对差上限为百万分之一）、rtol=0；最大绝对差约'+numeric.max_absolute_error.toExponential(6)]
 ])+
 p('GROUP_RANK 是这里实际记录的启动器组编号，本次分别对应两个静态节点编号。程序从每个 worker 的环境读取这些身份，核对四份记录来自同一宿主，再独立读取各轮日志和检查点。记录显示两个启动器都以0退出，完整训练的32次调用与恢复前后16＋16次相符。',
 '比较分开保留两种结果：位级一致性未达成；本程序声明的数值契约及状态、更新核对通过。atol=1e−6限制每个浮点元素的绝对差，rtol=0不追加随参考值放大的相对余量；模型与Adam浮点状态按此比较，计数、结构、配置及4份随机状态仍要求精确相同。实际最大绝对差为'+numeric.max_absolute_error.toExponential()+'。本次另做的连续重复运行逐位相同，因此恢复对照差异的具体原因尚未查明，不能直接归因于Gloo。',
 '负例保持模型权重不变，只改Adam矩量或rank1随机状态，原严格比较器分别拒绝；改变accum后恢复也被配置签名拒绝。这让检查覆盖下一次更新所依赖的状态。该数值契约只适用于这份小型CPU程序；物理双机网络、GPU/NCCL、模型任务质量及任意轮中故障恢复继续按各自目标验证。')+
 fold('verify_launch.py 完整源码：启动、独立读取、两种比较与负例',code('verify_launch.py','PYTHON',multinodeLaunchSource))+
 fold('launch_worker.py 完整源码：记录身份后执行原训练程序',code('launch_worker.py','PYTHON',multinodeLaunchWorkerSource))+
 practiceLinks;
 const newFigure='<figure class="training-figure"><a href="diagrams/v69-ddp-rank-processes.svg" target="_blank" rel="noopener" aria-label="放大：两个启动器、四个训练进程与独立通信路径"><img src="diagrams/v69-ddp-rank-processes.svg" width="1080" height="760" alt="两机四卡目标布局：每台torchrun启动两个worker，按local rank绑定可见GPU；会合初始化与NCCL训练通信分开表示" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>两机四卡的目标逻辑布局。图在本机绘制，不表示已在物理双机或 GPU 上执行。<a href="diagrams/v69-ddp-rank-processes.svg" download>下载 SVG ↗</a></figcaption></figure>';
 const topologyNode=(label,count)=>'<div class="gpu-node"><small>'+label+'</small><div class="gpu-chips">'+
  Array.from({length:count},(_,i)=>'<span>GPU '+i+'</span>').join('')+'</div></div>';
 const topologyChoice=(label,description,nodes,reading,open=false)=>
  '<details class="progressive-detail" name="ddp-training-topology"'+(open?' open':'')+'><summary>'+label+'</summary>'+
  '<div class="topology-nodes" role="img" aria-label="'+description+'">'+nodes+'</div>'+p(reading)+'</details>';
 const topology='<div class="interactive" id="topology-demo" data-training-topology>'+
  p('<strong>从一张卡到两台机器</strong>。每个进程一次读 64 条样本，累积两批。每多一个进程，每次更新就多覆盖 128 条。展开各级，看进程在哪台机器上、怎样加入同一组。')+
  topologyChoice('单卡 · 1 个进程 · 128 条样本',
   '节点 A 或 B 单独运行。训练进程 rank 0 使用本机 GPU 0。',
   topologyNode('单台节点 · rank 0',1),
   '在 A、B 上分别运行。每次用 <code>--standalone</code> 在本机建立会合，先核对 GPU 能否完成一次更新。',true)+
  topologyChoice('单机双卡 · 2 个进程 · 256 条样本',
   '同一台节点。进程 rank 0 使用 GPU 0，进程 rank 1 使用 GPU 1。',
   topologyNode('单台节点 · rank 0、1',2),
   '仍用本机会合。两个进程各读一份分开的数据，汇合梯度时只走本机的 GPU 通信路径。')+
  topologyChoice('双机四卡 · 4 个进程 · 512 条样本',
   '节点 A 的 GPU 0、1 对应全局 rank 0、1。节点 B 的 GPU 0、1 对应全局 rank 2、3。两台机器经节点间网络通信。',
   topologyNode('节点 A · rank 0、1',2)+'<div class="network-bridge">⇄<br>节点间网络</div>'+topologyNode('节点 B · rank 2、3',2),
   '两台启动器都填 A 的会合地址，让四个进程加入同一组。之后 NCCL 汇合梯度时还会用到跨节点网络。')+
  p('图示是启动方案。已有本机 CPU/Gloo 实跑记录了两个启动器和四个进程。物理双机与 GPU/NCCL 仍需<a href="/article/multinode-lab/#native-ddp-target-preflight">在目标机器预检</a>。')+
  '</div>';
 const bodies=[
 p('前面的分布式数据并行（DDP）程序已经让模型副本处理各自数据、汇合梯度并更新。本章把相同程序分到两台机器：每台运行一个启动器，由它创建两个训练进程，每个进程使用一张 GPU，四个进程组成固定通信组。先明确谁启动谁、谁和谁通信，再执行安装与启动命令。',
 '节点是承载程序的机器；launcher 是启动器，本例使用 torchrun；worker 是实际运行 train_ddp.py 的 Python 进程。启动器为本机 worker 分配身份、启动并监视它们，worker 自己执行取数据、前反向和更新。DDP 包装每个 worker 中的模型，负责相应梯度同步。')+
 table(['编号或数量','本章含义','两节点、每节点两进程'],[
 ['NODE_RANK / --node-rank','传给本节点启动器的节点编号','A 为 0，B 为 1'],
 ['LOCAL_RANK','worker 在本节点内的编号','两台各有 0、1'],
 ['RANK','worker 在整个通信组内的编号','A 为 0、1；B 为 2、3'],
 ['WORLD_SIZE','组内 worker 总数','2 台×2 进程＝4'],
 ['可见 GPU 编号','当前进程看到的设备序号','每台的 worker 分别绑定 cuda:0、cuda:1']
 ])+
 p('这里采用固定成员、每台相同进程数的启动方式，全局编号可按 NODE_RANK×2＋LOCAL_RANK 核对。节点 B 的 local rank 0 因而是全局 rank 2。CUDA_VISIBLE_DEVICES 可以重排可见设备，cuda:0 指当前可见列表的第一个设备；启动时同时保存可见列表与设备身份，才能对应到实际卡。编号关系只用于这份固定布局，弹性成员变化需要重新确认身份与状态归属。',
 '会合（rendezvous）让参与者找到彼此、交换初始化信息。两端使用同一 MASTER_ADDR:MASTER_PORT，本章是 A 的内网地址 10.0.1.10:29500。launch_2nodes.sh 在 PyTorch 2.5.1 下采用默认的 static 会合后端、两个固定节点和 --max-restarts=0；两台都启动后，worker 从环境变量取得身份，再由 init_process_group 建立用于集合通信的进程组。')+
 newFigure+
 p('会合入口属于初始化路径。训练中归约梯度等张量通信由后端组织：本例 CUDA 路径选择 NCCL，CPU 路径选择 Gloo。NCCL 会按实际设备和互联建立节点内、跨节点通信；仅让 29500 端口可达，还不足以确认训练数据通信。网络规则要覆盖这两台节点之间实际需要的双向路径，使用所选网卡或 RDMA 时再核对对应条件。',
 '目标环境是两台 Linux 节点、每台至少两张可见 NVIDIA GPU，Python 3.10—3.12、PyTorch 2.5.1、相同代码与训练配置。原有记录已验证本机 CPU/Gloo；物理双机、CUDA/NCCL 和 GPU 精度仍按目标环境留证。小型合成模型用于核对执行与恢复关系。')+
 fold('选读：原有 rank 与 GPU 简图',fig(old[0]).join('')),

 p('先准备同一份实验包与独立输出位置。包中的 train_ddp.py 完成训练和轮末保存，launch_2nodes.sh 在每台启动两个 worker，check_env.py 列出本机环境，compare_checkpoints.py 比较连续与恢复运行的完整状态。两端使用相同源码摘要，才能把差异归到这次环境或执行过程。')+
 '<p class="practice-links">'+links+'</p>'+
 p('GPU 驱动管理硬件，PyTorch 包携带相应 CUDA 运行时；下面安装基线选择 CUDA 12.4 包，主机驱动需支持它。check_env.py 读取 PyTorch 版本、后端支持与本机可见设备；nvidia-smi 再提供驱动及设备信息。先读这些结果，再进入跨节点启动。')+
 install[0]+
 p('检查点还有一条共享存储路径。本例不是每个 rank 各写一片：轮末各 rank 把自己的随机状态交给 rank0，rank0 保存完整模型、优化器和这些状态。恢复时每个 rank 都执行 torch.load，读取同一已提交文件。因此 A、B 上的 TRAIN_OUT 必须指向同一份持久文件，而不只是拼写相同的路径。',
 '例如两台分别 mkdir /mnt/shared/cloudinfra-ddp/run-001，得到的可能是两块本地盘上的两个目录。A 的 rank0 保存后，B 仍看不到它。挂载真实共享 POSIX 文件系统后，在专用实验目录写入一个临时标记，从另一端读回相同内容并核对权限，再删除标记；这是共享可见性的检查，训练保存和恢复随后继续核对。对象存储 URL 需要自己的提交与读取实现，本程序的 Path 不负责这层转换。')+
 table(['启动前固定','正常关系'],[
 ['程序与环境','两端代码摘要、PyTorch 版本和配置一致；驱动支持所选运行时'],
 ['设备','每台至少两个可见 GPU，两个 local rank 各有独立绑定'],
 ['网络','同一会合入口，加上后端实际使用的双向通信路径'],
 ['输出与权限','双方可访问同一专用 POSIX 目录，保留检查点与实验记录'],
 ['成本与退出','使用已获准的实验节点，记录开始时间及自建资源范围，结束后按该范围释放']
 ]),

 p('逐级启动是在保持程序不变时增加一个执行条件。先在每台单独运行单 GPU，再在每台运行两个 GPU worker，最后让两台各自的启动器加入同一组。单机阶段的 --standalone 建立本机独立会合；跨节点阶段改用共同的 A 端入口。每次实验使用独立目录，并等上一组进程退出后再开始下一组。')+
 topology+launch[0]+
 p('这两条命令采用本程序默认 CUDA、FP32、8192 样本、每 rank 小批 64、累积 2 批，先只运行一轮。单 GPU 的有效 batch 为 128，单机双 GPU 为 256；这一步验证启动与训练能推进，尚未固定同一全局 batch 来比较速度。两台本机阶段都通过后，再运行下面的四进程目标。',
 '节点 A 的 NODE_RANK=0；两端 MASTER_ADDR 都填写 A 的真实内网地址，不能在 B 上改成 B 自己。MASTER_PORT 在脚本中默认为 29500，双方必须一致且未与其他作业冲突。TRAIN_OUT 则是已经核对共享可见性的同一个专用目录。节点 A 与 B 分别执行：')+
 launch[1]+launch[2]+
 p('两端启动器读取 --nnodes=2 与 --nproc-per-node=2，建立各自的两个 worker。train_ddp.py 按 LOCAL_RANK 设置 CUDA 设备，再初始化 NCCL 进程组，随后构造相同的合成数据和初始模型。DistributedSampler 按全局 rank 分配样本，DDP 在同步反向中汇合梯度；每个 worker 用相同优化器规则更新自己的模型副本。',
 '完整启动脚本末尾的 "$@" 把附加参数传给训练程序，后续恢复命令据此指定累计目标轮数和检查点。当前脚本固定成员并关闭自动重启；成员失败后先结束本次实验、保存各端首个异常，再决定从哪个已提交检查点启动新一组进程。')+
 fold('launch_2nodes.sh 完整源码：两端执行同一份脚本',launch[3]),

 p('用这份默认输入先算训练量。8192 条固定合成分类样本由四个 rank 分担，每个获得 2048 条；每小批 64 条，得到 32 个小批。两批累积成一个更新窗口，所以每 rank 每轮 16 个窗口，一个完整窗口覆盖 4×64×2＝512 条样本。本例可整除，采样器和 DataLoader 的 drop_last 不丢数据；更换样本数后要按实际处理数重新核对。')+
 table(['同一默认配置','计算','应核对的记录'],[
 ['进程组','2 节点×2 worker＝4','start.world_size=4，各全局 rank 唯一'],
 ['每 rank 样本','8192÷4＝2048','采样与全局 epoch.samples=8192'],
 ['每 rank 小批','2048÷64＝32','本地迭代次数'],
 ['更新窗口','32÷2＝16','attempted_update_windows=16'],
 ['有效 batch','64×2×4＝512','start.effective_batch=512'],
 ['实际优化器调用','默认 FP32 正常路径为 16','applied_optimizer_steps 与各 rank 一致']
 ])+
 p('前一小批在 no_sync 中完成前向和反向，梯度留在本地；第二小批同步反向后再尝试优化器调用、清梯度。程序通过 step 完成后触发的回调（post hook）记录实际 AdamW.step 次数，并归约检查各 rank 的计数相同。FP16 的缩放器可能因非有限梯度跳过调用，尝试窗口与实际调用因而分别记录。rank0 汇总输出，日志只有一份 epoch 记录并不表示其他进程没有训练。',
 '完成一轮后，save_checkpoint 先汇集各 rank 的 CPU、DataLoader 随机状态，CUDA 路径再包含各自 CUDA 随机状态。rank0 将完整模型、优化器、缩放器、next_epoch、配置签名与随机状态写入同目录临时文件，刷新缓冲、用 fsync 请求同步该文件，再 os.replace 为 checkpoint.pt；各 rank 随后在组屏障 barrier 会合，全部到达后 rank0 才打印 checkpoint 记录。适用文件系统的同目录替换提供文件切换语义，存储掉电与其他存储协议另需验证。',
 '恢复会重新创建进程组、数据、模型与优化器。每个 rank 读取同一文件，校验 world size、设备类型、精度、batch、累积和数据/模型配置，再载入模型与优化器，最后恢复自己编号对应的随机状态，并从 next_epoch 开始。这样初始化新模型消耗的随机数不会挤占恢复后的 Dropout 序列。本程序只提交整轮状态，轮中故障会重做尚未提交的那一轮。',
 '默认脚本训练四轮。保留相同 TRAIN_OUT 和固定训练配置，在两端都执行 bash launch_2nodes.sh --epochs=6 --resume="$TRAIN_OUT/checkpoint.pt"，表示总目标为六轮；若检查点 next_epoch=4，就再运行第5、6轮。下一章再对照连续运行与恢复运行的最终状态，覆盖参数、优化器、缩放器、各 rank 随机状态、游标和配置。')+
 table(['验证阶段','具体动作与结果','结论范围'],[
 ['本机设备','检查可见设备与实际绑定','本机设备输入成立'],
 ['会合与组身份','核对四个 rank 与 WORLD_SIZE=4','组成员符合这次固定布局'],
 ['首次集合通信','各 rank 贡献 rank＋1，同组 SUM 应为 10','该次集合调用在组内完成'],
 ['训练更新','核对8192样本、16窗口、实际调用与有限 loss','相应输入与训练路径推进'],
 ['保存与恢复','各端可读取已提交状态，再做连续/恢复比较','固定配置、指定边界的恢复通过']
 ])+
 p('1＋2＋3＋4＝10 是四进程的集合通信检查目标，原 GPU 手册尚未执行该检查。检查点存在以后还要真正恢复，loss 有限以后还要按任务评估质量。合成小模型的训练量与结果用于核对机制，性能结论留给固定负载、精度和质量目标的测量。'),

 p('失败定位沿正常依赖链回到第一处未满足条件。保留两端启动器和各 worker 的记录，按节点、rank、阶段与时间关联；一个 worker 先报错退出后，其他 worker 的集合通信超时可能只是等待它的后果。优先处理最早异常，才能避免把输入或存储错误误当成通信调优问题。')+
 table(['最先停住的阶段','先核对什么','为什么'],[
 ['启动前或设备绑定','代码、Python 环境、可见设备数、LOCAL_RANK','两个本机 worker 各要有自己的可见 GPU'],
 ['会合初始化','两端存活、固定节点数、不同 NODE_RANK、相同 MASTER_ADDR/PORT','成员需要通过同一入口加入同一组'],
 ['集合通信或反向','所有 rank 首个异常、所选网卡、后端双向路径、输入是否齐备','端口连通与其他成员仍在运行是不同条件'],
 ['轮末保存','rank0 写权限、共享挂载、存储空间、临时文件和替换结果','其他 rank 在等待共同保存完成'],
 ['重新启动恢复','检查点已提交且双方可读、配置签名相同','每个 rank 都独立加载并恢复自身状态']
 ])+
 p('成功结束时先保存完整命令、环境、各端退出码和所需检查点，再确认本次启动器及其 worker 已退出，检查相关 GPU 进程与本次通信端口。失败或主动停止时，向两端本次作业的启动器发出停止，核对所属子进程是否结束；对照启动记录处理遗留进程，避免影响同机其他任务。训练程序在正常异常清理路径中销毁进程组，强制终止后的资源状态仍由实际进程与平台记录核对。',
 '保留最后一个已提交检查点与失败日志，确认不再写入后再清理本次临时文件。共享输出若将用于恢复，不能随训练进程退出一起删除；实验结束后按预先记录的范围释放自建节点、卷和其他资源，并记录终止时间。小模型在两机跑通说明这条执行路径成立，真实跨节点带宽、NCCL 性能与单位成本随后分别测量。'),

 newPractice+
 fold('复习：旧两进程恢复与四进程启动记录',p('现有 validation.json 的两进程 CPU/Gloo 对照使用另一份固定配置：1024 样本、每 rank 小批32、累积2，每轮16小批、8个窗口、8次实际优化器调用。连续四轮与两轮保存后恢复到四轮的模型、优化器、缩放器、next_epoch、配置及逐 rank 随机状态精确一致；accum=3 和改变 batch 后恢复分别被程序拒绝。它是本机逻辑基线，与前面的8192/64四进程目标分开记录。',
 '既有两启动器记录也在同一主机运行四个 CPU rank，使用1024样本、每 rank小批32，得到有效batch256、每轮4个更新窗口。它验证启动脚本的两个节点编号与本机四进程路径；两份“节点”仍共用宿主和回环网络。物理两机、GPU/NCCL、BF16/FP16 需要各自目标环境的设备、通信、数值与恢复记录。',
 '两进程的精确比较与四进程的数值契约各自保留，改变进程规模后重新执行相同状态检查。'))+
 p('迁移到 Transformer 时，先在单 GPU 替换模型和数据，保留同一组固定输入，核对词元与标签对齐、忽略位置、前反向及实际优化器调用；再逐级增加进程。有效词元数不同的 rank 需要按整个更新窗口的全局目标数归一化，不能直接沿用本例等样本小批的 loss/accum。',
 '随后扩展检查点清单：加入所用学习率计划、数据游标、分词器和数据版本、模型配置及并行分片关系。明确这次保存对应哪次更新、哪个数据位置与哪些随机流，再选择整轮或更细的恢复边界。最后对固定模型、数据、精度、全局 batch 和质量目标测延迟、吞吐与成本，让一次“能启动”自然走到“能更新、能恢复、结果可比较”。')
 ];
 const before=old.join(''),after=bodies.join('');
 const pres=s=>all(s,/<pre\b[\s\S]*?<\/pre>/g);
 const hrefs=s=>all(s,/\bhref=["'][^"']+["']/g).sort();
 const ids=s=>[...s.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
 if(JSON.stringify([...pres(before),...pres(newPractice)])!==JSON.stringify(pres(after)))throw Error('Original multinode code order or declared practice changed');
 if(JSON.stringify(fig(before).sort())!==JSON.stringify(fig(after.replace(newFigure,'')).sort()))throw Error('Original multinode figures changed');
 if(JSON.stringify(hrefs(before))!==JSON.stringify(hrefs(after.replace(newFigure,'').replace(practiceLinks,'').replace(topology,''))))throw Error('Original multinode links changed');
 const published=[]; // docs/SUBSECTION_LINKS_2026-11-08.json has no published subsection IDs here.
 for(const id of [...ids(before),...published])if(!ids(after).includes(id))throw Error('Multinode anchor lost: '+id);
 if(new Set(ids(after)).size!==ids(after).length||/<h[23]\b/.test(after))throw Error('Extra multinode heading or duplicate anchor');
 bodies.forEach((body,i)=>a.sections[i][1]=body);
 a.desc='先把两个启动器、四个训练进程、会合与通信组连起来，再按同一输入核对启动、更新、共享检查点和恢复。';

 const targetSetup='目标环境是两台 Linux 节点、每台至少两张可见 NVIDIA GPU，Python 3.10—3.12、PyTorch 2.5.1、相同代码与训练配置。';
 const legacySetup='GPU 驱动管理硬件，PyTorch 包携带相应 CUDA 运行时；下面安装基线选择 CUDA 12.4 包，主机驱动需支持它。';
 if(!a.sections[0][1].includes(targetSetup)||!a.sections[1][1].includes(legacySetup))throw Error('Missing multinode environment handoff');
 a.sections[0][1]=p('先按手头的机器选择验收范围。只有一台机器时，用 PyTorch 2.5.1 的 CPU/Gloo 探针检查四个进程。已有实跑中，四个进程都读回 [1,2,3,4] 与 10，真机验收返回 <code>target_ready=false</code>（退出码 2）。有两台目标节点时，先按实际 GPU 选择 PyTorch 包，再检查四个进程的绑卡与通信。<a href="/article/multinode-lab/#native-ddp-target-preflight">打开四进程记录与两种运行步骤 →</a>')+
  a.sections[0][1].replace(targetSetup,'真机步骤要求两台 Linux 节点、每台至少两张可见 NVIDIA GPU、Python 3.10—3.12，以及两端相同的代码与训练配置。PyTorch 包按设备型号选择。');
 a.sections[1][1]=a.sections[1][1].replace(legacySetup,
  'GPU 驱动管理硬件，PyTorch 包携带相应 CUDA 运行时。先按 GPU 型号选安装路径。RTX PRO 6000 Blackwell（计算能力 12.0）用 <a href="/article/multinode-lab/#native-ddp-target-preflight">PyTorch 2.7.1 / CUDA 12.8 的独立安装与预检</a>，跳过下面的历史安装命令。下方 PyTorch 2.5.1 / CUDA 12.4 基线用于兼容这组版本的设备。两条路径都在解压的 DDP 包中执行 <code>python -B check_env.py</code>。<a href="/article/operator-profiling/#cuda-core-run">算子章的 CUDA 12.9.1 编译记录</a>使用独立工具链，训练端以本次检查报告的 CUDA 运行时为准。');
 a.sections[3][1]+=
 '<h3 id="native-ddp-target-preflight">先用四个数验收节点、绑卡与通信</h3>'+
 p('完整训练同时依赖数据、梯度同步和保存。排查时先运行一个只发四个整数的探针。四个 rank 各提交自己的全局编号加 1，AllGather 把每份值按 rank 顺序交给所有进程，AllReduce 把值求和并返回给所有进程。每个进程实际读回 <code>[1, 2, 3, 4]</code> 和 <code>10</code> 后再写一份记录。')+
 trainingFigure('ddp-target-preflight','集合通信读回相同的四个数，还要核对它们来自哪个内核、哪张卡和哪个后端。')+
 table(['按顺序查','记录里应看到什么','可排除的常见误判'],[
 ['谁在这一组','同一会话、同一脚本摘要，四个固定 rank','把上次或别的启动器的记录混进来'],
 ['两个节点','各组内的两个 rank 共用同一内核启动标记，两组标记不同','把同一内核上的两个启动器当作两台机器'],
 ['各用哪张卡','cuda 序号等于 LOCAL_RANK；四个不同的整卡 UUID 标记','把进程内的 cuda:0 当作整机或全局卡号；两个进程绑到一张卡'],
 ['这组是否通信','同一套 PyTorch、CUDA、NCCL；每个进程实读 [1, 2, 3, 4] 和 10','把会合成功或一个端口能连接当作训练通信已完成']
 ])+
 p('设备编号先按进程可见列表解释，再核对设备身份。CUDA 报告的 UUID 要能在本机 nvidia-smi 的整卡列表找到。内核和 GPU 标识按会话处理后保存。同一个 Linux 内核通常给出同一启动标记，能拦下常见的同宿主伪双节点。两个不同的内核也可能是同一物理宿主上的两个虚拟机，物理节点仍由资源分配记录核对。')+
 code('本机在现有 PyTorch 2.5.1 CPU 环境复跑','SHELL','python -B run_local.py > replay.json')+
 p('本机实跑用了两个启动器、四个 CPU/Gloo 进程，四份读回全部正确。目标检查仍以退出码 2 拒绝，原因包括共用内核、后端不符与缺少 CUDA 绑定。用这个负例可区分“探针跑完”和“满足两机四卡检查”。')+
 p('RTX PRO 6000 Blackwell 对应计算能力 12.0。若两端用这种卡，单独建环境选官方 PyTorch 2.7.1 / CUDA 12.8 包，核对驱动和设备能力后，再运行下面的实际探针。'+
 ' <a href="https://developer.nvidia.com/cuda/gpus">NVIDIA 计算能力表 ↗</a> · <a href="https://pytorch.org/blog/pytorch-2-7/">PyTorch 2.7 的 Blackwell 支持 ↗</a> · <a href="https://pytorch.org/get-started/previous-versions/#v271">PyTorch 2.7.1 安装方式 ↗</a>')+
 code('Blackwell 专用环境，在两端各安装一次','SHELL',`
python3 -m venv .venv-blackwell
. .venv-blackwell/bin/activate
python -m pip install torch==2.7.1 --index-url https://download.pytorch.org/whl/cu128
 `)+
 p('两端各自激活选定的 PyTorch 环境，进入解压的预检实验目录。在 A 执行下面生成会话号的 <code>python</code> 命令，把同一个号设为两端的 <code>PREFLIGHT_SESSION</code>。在当前 shell 中设置 <code>NODE_RANK</code>（A 为 0，B 为 1），<code>MASTER_ADDR</code>（两端都填 A 的真实内网地址）与 <code>MASTER_PORT</code>（两端填同一空闲端口）。',
 'A 执行 <code>export NODE_RANK=0</code>，B 执行 <code>export NODE_RANK=1</code>。两端都用 <code>export MASTER_ADDR=10.0.1.10 MASTER_PORT=29500</code> 的写法，换成本次的地址与端口，再用 <code>export PREFLIGHT_SESSION=实际会话号</code> 填入 A 打印的值。上一节通过 <code>export</code> 设置的值在同一终端中仍然有效，换终端时重新设置。设置完成后，两端运行下面的 <code>torchrun</code>，结束后收集四份记录和两端退出码。')+
 code('两台节点分别执行，把记录汇总到本机再检查','SHELL',String.raw`
# 只在一端生成，复制同一输出作为两端的 PREFLIGHT_SESSION
python -c 'import secrets; print(secrets.token_hex(16))'
torchrun --nnodes=2 --nproc-per-node=2 --node-rank="$NODE_RANK" \
  --master-addr="$MASTER_ADDR" --master-port="$MASTER_PORT" --max-restarts=0 \
  target_probe.py worker --device=cuda --session="$PREFLIGHT_SESSION" \
  --out-dir="target-$PREFLIGHT_SESSION-node-$NODE_RANK"

# 四份 JSON 收到同一个空目录之后执行
python -B target_probe.py check collected/rank-*.json
 `)+
 p('真机通过后再运行训练和恢复检查。这个小消息的结果用于证明本次集合操作确实完成。NCCL 具体走的网卡、是否使用 RDMA、真实带宽和训练质量要用相应日志和测量核对。本次记录保留为本机 CPU/Gloo 验收，物理两机 GPU/NCCL 步骤待目标环境执行。')+
 '<p class="practice-links"><a href="labs/ddp-target-preflight.zip" download>下载预检与验收程序 ↓</a> · <a href="labs/ddp-target-preflight/target_probe.py">查看探针源码 →</a> · <a href="labs/ddp-target-preflight/README.md">完整步骤 →</a> · <a href="labs/ddp-target-preflight/validation.json">核对四进程实跑 →</a></p>';
 const inPlaceResume='默认脚本训练四轮。保留相同 TRAIN_OUT 和固定训练配置，在两端都执行 bash launch_2nodes.sh --epochs=6 --resume="$TRAIN_OUT/checkpoint.pt"，表示总目标为六轮；若检查点 next_epoch=4，就再运行第5、6轮。下一章再对照连续运行与恢复运行的最终状态，覆盖参数、优化器、缩放器、各 rank 随机状态、游标和配置。';
 if(!a.sections[3][1].includes(inPlaceResume))throw Error('Missing multinode continuation instruction');
 a.sections[3][1]=a.sections[3][1].replace(inPlaceResume,()=>
  '默认脚本训练四轮。只需在原目录续跑时，两端保持相同 TRAIN_OUT 和训练配置，运行 <code>bash launch_2nodes.sh --epochs=6 --resume="$TRAIN_OUT/checkpoint.pt"</code>。从 <code>next_epoch=4</code> 继续第 5、6 轮时，每轮都会替换原目录的 <code>checkpoint.pt</code>。要验收恢复，先按<a href="/article/checkpoint-recovery/#section-4">下一章的三目录步骤</a>保留第 4 轮来源，另外保存连续运行与恢复运行的终点。');
 a.intro=a.desc;a.updated='2026.11.12';

 a.sections[3][1]+=
  '<h3 id="ddp-target-record-readback">四个进程都读对，预检为什么仍未通过</h3>'+
  p('<a href="/article/kubernetes-training/#native-kubernetes-gloo-job">两节点 kind 实跑</a>里，两个 Pod 分别绑定到不同工作节点，用 CPU/Gloo 把权重更新到了 1.125。下面换成本机四进程预检的记录，看物理两机开训前还缺哪些证据。')+
  '<ol><li><strong>交齐四份。</strong>四个 rank 都读回 <code>[1, 2, 3, 4]</code> 和 <code>10</code>，但 <code>boot_tag</code> 都相同，后端也都是 Gloo。验收返回 <code>two_distinct_kernels</code> 等五项，下一步核对实际分配的两台机器和两端 CUDA/NCCL 环境。</li>'+
  '<li><strong>少交 rank 3 的记录。</strong>程序只报告 <code>four_rank_records_required</code>。这时先找本次会话的四份记录，再看两端最早的启动或进程异常。</li></ol>'+
  fold('用 Python 标准库执行两次记录验收',
   p('在上方下载的预检实验目录执行。命令把 <code>validation.json</code> 的四条记录写到临时目录，原样交给 <code>target_probe.py check</code>。每行显示记录数、退出码和具体原因。两次退出码都是 2。')+
   trainingCode('核对交齐四份与少交一份的预检结果','SHELL',`python3 -B - <<'PY'
import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

rows = json.loads(Path("validation.json").read_text())["rank_records"]
with TemporaryDirectory() as directory:
    files = []
    for row in rows:
        file = Path(directory) / f"rank-{row['rank']}.json"
        file.write_text(json.dumps(row))
        files.append(file)
    for selected in (files, files[:-1]):
        result = subprocess.run(
            [sys.executable, "-B", "target_probe.py", "check", *selected],
            capture_output=True, text=True,
        )
        gate = json.loads(result.stdout)
        print(json.dumps([len(selected), result.returncode, gate["blockers"]]))
PY`));

 a.sections[3][1]+=
  '<h3 id="shared-checkpoint-readback">两端路径一样，怎样确认读到同一份检查点</h3>'+
  p('四个进程可以通过集合通信，同时各自只看到本机的磁盘。两端都写 <code>/mnt/shared</code>，路径字符串也会一样。训练时只有 rank 0 发布 <code>checkpoint.pt</code>，恢复时每个 rank 都要从同一份文件读回。先用两个小文件检查目标目录。')+
  p('把下面的程序保存为 <code>shared_checkpoint_probe.py</code>。两端都用训练账号运行。若训练在容器里，就在对应容器里执行，沿用它的挂载。令 <code>RECOVERY_ROOT</code> 指向训练要用的共享根目录，用 <code>python3 -c &quot;import secrets; print(secrets.token_hex(16))&quot;</code> 生成一个新会话号，两端都设为 <code>SHARED_PROBE_SESSION</code>。A 执行 <code>python3 -B shared_checkpoint_probe.py &quot;$RECOVERY_ROOT&quot; &quot;$SHARED_PROBE_SESSION&quot; A</code>，B 同时执行相同命令，把最后一项换成 B。')+
  fold('展开完整 Python 程序 · 双向读回',trainingCode('检查两端是否看到同一组文件','PYTHON',String.raw`import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import time

parser = argparse.ArgumentParser()
parser.add_argument("root", type=Path)
parser.add_argument("session")
parser.add_argument("side", choices=("A", "B"))
parser.add_argument("--timeout", type=float, default=15.0)
args = parser.parse_args()
if not args.root.is_dir():
    parser.error("root must be an existing training directory")
if not re.fullmatch(r"[0-9a-f]{32}", args.session):
    parser.error("use a fresh 32-character hexadecimal session")
if not math.isfinite(args.timeout) or args.timeout <= 0:
    parser.error("timeout must be a finite positive number")

def probe_path(side, suffix):
    return args.root / f".ddp-probe-{args.session}-{side}.{suffix}"

try:
    probe_path(args.side, "claim").touch(exist_ok=False)
except FileExistsError:
    parser.error("side already used in this session; start a new session")

own = json.dumps({
    "session": args.session,
    "side": args.side,
    "nonce": secrets.token_hex(16),
}).encode("utf-8")
staged = probe_path(args.side, "tmp")
with staged.open("xb") as file:
    file.write(own)
    file.flush()
    os.fsync(file.fileno())
os.replace(staged, probe_path(args.side, "json"))

peer = "B" if args.side == "A" else "A"
deadline = time.monotonic() + args.timeout
while True:
    try:
        observed = probe_path(peer, "json").read_bytes()
        break
    except FileNotFoundError:
        if time.monotonic() >= deadline:
            print(json.dumps({"status": "peer_missing", "side": args.side}))
            raise SystemExit(2)
        time.sleep(0.05)

record = json.loads(observed)
if record["session"] != args.session or record["side"] != peer:
    parser.error("the observed file belongs to another session or side")
print(json.dumps({
    "status": "passed",
    "session": args.session,
    "side": args.side,
    "own_sha256": hashlib.sha256(own).hexdigest(),
    "peer_sha256": hashlib.sha256(observed).hexdigest(),
}))`))+
  p('收齐两端输出。两条都要是 <code>passed</code>，会话号相同，A 的 <code>own_sha256</code> 等于 B 的 <code>peer_sha256</code>，B 写出的摘要也要等于 A 读到的摘要。若一端报 <code>peer_missing</code>，先核对对端是否运行、会话号是否相同，再查两端实际挂载和读写权限。')+
  p('本机用两个独立进程复跑。同用一个目录时，两条摘要交叉吻合。各用一个同名目录时，两边都等不到对方。这个探针只验证本次目录的小文件发布和读回，完整检查点的可恢复性接着用<a href="/article/checkpoint-recovery/#section-4">三目录训练对照</a>验收。');
})();
