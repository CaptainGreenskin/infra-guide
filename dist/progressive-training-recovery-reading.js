/* One completed update links input progress, durable recovery and useful training throughput. */
(()=>{
 const p=(...rows)=>rows.map(x=>'<p>'+x+'</p>').join('');
 const fold=(title,html)=>'<details class="progressive-detail"><summary>'+title+'</summary>'+html+'</details>';
 const take=(s,re)=>[...s.matchAll(re)].map(m=>m[0]);
 const codes=s=>take(s,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=s=>take(s,/<figure\b[\s\S]*?<\/figure>/g);
 const anchors=s=>[...s.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
 const bag=x=>JSON.stringify(x.slice().sort());
 const legacy=id=>'<span id="'+id+'" class="legacy-subsection-anchor" aria-hidden="true"></span>';
 function rewrite(id,count,make){
  const a=articles.find(x=>x.id===id);
  if(!a||a.sections.length!==count)throw Error('Training recovery section layout changed: '+id);
  const old=a.sections.map(s=>s[1]),body=make(old);
  if(body.length!==count)throw Error('Incomplete training recovery rewrite: '+id);
  const next=body.map((b,i)=>{
   const links=take(old[i].replace(/<figure\b[\s\S]*?<\/figure>/g,''),/<a\b[^>]*\bhref=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/g);
   return b+(links.length?'<p class="practice-links">'+links.join(' · ')+'</p>':'');
  });
  const before=old.join(''),after=next.join('');
  if(JSON.stringify(take(before,/<pre\b[\s\S]*?<\/pre>/g))!==JSON.stringify(take(after,/<pre\b[\s\S]*?<\/pre>/g)))throw Error('Training recovery original code changed: '+id);
  if(bag(figures(before))!==bag(figures(after)))throw Error('Training recovery figures changed: '+id);
  if(bag(take(before,/\bhref=["'][^"']+["']/g))!==bag(take(after,/\bhref=["'][^"']+["']/g)))throw Error('Training recovery URLs changed: '+id);
  for(const anchor of anchors(before))if(!anchors(after).includes(anchor))throw Error('Lost training recovery anchor: '+anchor);
  if(new Set(anchors(after)).size!==anchors(after).length||/<h[23]\b/.test(after))throw Error('Duplicate or extra training recovery heading: '+id);
  next.forEach((b,i)=>a.sections[i][1]=b);a.updated='2026.11.09';
 }
 rewrite('checkpoint-recovery',8,old=>[
 p('训练把输入变成损失，再用梯度更新参数。前章已经把这条路径交给多个进程共同执行；本章继续问：这些进程结束后，新进程要带着哪些状态、从哪份输入接着更新？检查点（checkpoint）就是为继续训练保存的一组状态，恢复点则是已经完整保存并向恢复方发布的那一次状态。',
 '先沿正常流程走一轮。epoch是一轮约定的数据遍历；微批是每个进程一次前向、反向处理的小批输入。若累积两次微批梯度再调用优化器，就形成一个更新窗口。本章手算把成功应用的一次优化器更新记为step；轮末完成更新、清空累积梯度后，再保存模型、优化器和下一轮输入进度。',
 'rank是通信组中的进程编号，world size是组内进程数。先用四rank作题：每轮8192个全局样本，每rank微批64、累积两次，假定等长批次且每个窗口都实际应用更新。一次更新处理4×64×2=512个样本，每轮16次更新；第二轮末提交的状态包含前32次更新，下一轮从各自采样器的新轮次开始。')+
 figures(old[0])[0]+
 p('若第三轮已完成五次更新，又处理了下一窗口的第一个微批后退出，最后发布的恢复点仍是step 32。重启后重做五次更新对应的2560个样本，以及已处理但尚未应用更新的一个全局微批256个样本。这个重做范围由保存边界决定，和退出前控制台最后打印的编号是两种记录。',
 '下文用三个层次说明同一原则：四rank/8192样本是恢复范围手算；标准库标量程序让每个状态变化都能复算；两CPU进程/1024样本程序验证真实PyTorch保存与加载。它们各有固定输入，分别核对。')+
 legacy('checkpoint-consistent-state')+legacy('subsection-1-zredmh')+
 p('一份恢复点中的模型、优化器、输入位置与随机状态，应属于同一个run、step和配置。run标识整次训练，attempt标识一次共同启动的执行轮次。换进程可以保留训练的逻辑进度，进程编号和尝试身份则按新的执行记录关联；如何创建新Job，由平台自己的恢复策略规定。'),

 p('参数给出当前模型，优化器历史决定接下来怎样使用梯度，输入与随机状态决定接下来算什么。把这些对象放到同一逻辑更新边界，才有一个可继续的状态。下表对应本章原DDP程序：')+
 table(['保存对象','恢复后的作用'],[
 ['model与optimizer','装回参数、AdamW对梯度与梯度平方的滑动统计，以及参数组设置'],
 ['scaler','恢复FP16动态损失缩放的状态；本章FP32路径保存空状态'],
 ['next_epoch','指明下一次开始的轮次，sampler按该轮次生成顺序'],
 ['各rank RNG','恢复CPU、所用CUDA设备及DataLoader generator的随机状态'],
 ['配置签名','核对world size、模型宽度、微批、累积、精度和输入配置']
 ])+
 p('FP32与FP16分别使用32位与16位浮点表示。动态损失缩放在FP16训练中放大损失及梯度，再按规则还原并判断是否更新；scaler保存这项机制的进展。RNG是随机数生成器；保存其状态，才能接着产生后续随机选择。Dropout在训练中按随机选择屏蔽部分中间值，DataLoader也使用自己的generator。输入游标应描述已经随模型更新提交的消费进度，预取到内存的记录另记。四rank题中每rank每轮消费2048样本；轮末保存next_epoch，下一轮由sampler重新确定顺序。')+legacy('subsection-1-1mlk4h4')+
 p('用后面标准库程序的同一输入看动量的作用。它只有一个权重w，损失为(w·x−y)²/2，梯度g=(w·x−y)·x；动量v累积历史梯度，更新为v_new=0.9v+g，w_new=w−0.05v_new。固定seed=17，第一步从w=v=0读x=1.1、y=2.2，得到v=−2.42、w=0.121，游标cursor变为1。',
 '下一步仍读程序给出的x=2.2、y=4.4，梯度为−9.09436。保留动量时，v_new=−11.27236、w_new=0.684618；只把动量清零而保留相同权重和下一输入，会得到w_new=0.575718。权重相同，后续更新仍取决于历史。完整程序还保存游标与随机状态，比较连续6步和3＋3步的全部状态。',
 '本章选择轮末且累积窗口已结束的保存点，因此无需恢复未应用梯度。若改成轮中或微批中间保存，还要把每rank已提交输入游标、累积计数、尚未应用的梯度与预取队列语义一并设计。原DDP实现由rank 0汇集小型RNG状态，把完整载荷写入同目录临时文件、刷新后替换checkpoint.pt；其文件系统前提与大规模分片发布在第6节展开。'),

 p('现在落到可运行的CPU网络：1024条固定合成分类样本，128维输入→32维隐藏层→10类输出，隐藏层含Dropout，优化器为AdamW。两个rank各有512样本；每微批32、每轮16个微批，累积两次，所以一次更新覆盖2×32×2=128样本，每轮8次更新。',
 '连续四轮共32次更新。另一条路径先两轮、16次更新，在轮末保存并正常结束，再由新进程恢复到总共四轮，继续剩余16次。下面--epochs表示目标总轮数；恢复命令的4表示做到第四轮。')+
 codes(old[2])[0]+
 p('固定相同初值、数据、设备、精度、world size和训练配置，两条路径应得到对应的最终状态。比较器递归检查模型、优化器、scaler、RNG、next_epoch和配置签名；张量的类型、形状与数值一起核对。序列化文件的字节、运行时间和目录大小可以不同，逻辑状态才是这里的比较对象。',
 '输入也要独立检查。记录恢复后各rank的首批稳定样本ID，再以相同seed和epoch重建sampler，能核对接上的是哪一段数据。DCP实战已完成这项逐ID对照。配置改变时由签名明确拒绝；若要改变world size重新分片，需要另外定义状态布局和输入划分。本节的DDP对照沿固定配置继续。'),

 p('把相同流程搬到前章两机四卡时，先准备已配置的目标集群、共享目录与完整恢复点，再在两端使用相同启动配置。若原运行已保存到第4轮末，<code>bash launch_2nodes.sh --epochs=6 --resume=/mnt/shared/cloudinfra-ddp/run-001/checkpoint.pt</code>会从第5轮继续到总共6轮。这是目标环境的操作步骤，本站现有复现记录为本机CPU路径。',
 '先核对各rank载入同一版本的状态，next_epoch与恢复后首批输入对应，再观察数值和执行时间。CPU固定路径的精确相等为本实验提供基线；GPU上的舍入、算法选择和通信顺序另按目标确定性设置定义容差。若要求按位一致，需要验证相应算子与通信路径。',
 '恢复记录按阶段展开：等待整组资源→创建新进程并建立通信组→分配目标模型/优化器→读取和安装状态→完成首个有效更新→重做尚未提交的工作。实际初始化与读取顺序由实现决定。每rank记录attempt、设备、文件/分片版本和阶段耗时，便于找到最早停住的位置。',
 '例如一个rank读不到分片，其余rank可能已经进入集合通信并最终timeout。把缺失对象与其他rank所处阶段放到同一条依赖链，才能解释等待。若报告恢复“四分钟”，还需写明是从任务失败开始，还是从重新获得设备开始；这会直接改变下一章的端到端成本。'),

 p('先在独立目录保留一个可用版本，再把中断放到具体边界观察。轮末状态已发布时，新进程应从该点继续；新目录只写到一半时，读取方继续沿上次发布的引用选旧版本。把预期恢复点、重做样本范围和恢复后的首条进度写在演练记录里。',
 '第3轮部分分片上传后退出，完整清单仍属于第2轮，读者就从第2轮恢复。若旧attempt稍后完成上传，新attempt已经接管，候选文件可以保留在各自不可变路径；权威latest指针则只接受当前有效attempt、期望前一版本的更新。这让新旧写入者的文件与发布权分开。',
 '准备练习时同时放入不兼容配置、缺失文件和损坏文件，检查能否保留最后可用版本并给出具体原因。版本、摘要、清单、保留期与加载权限，分别服务于选点、完整性和使用范围。检查点按受信输入处理，只加载本次实验生成或来源可信的材料。',
 '保存频度还要平衡训练暂停和故障重做。声明每20分钟有效训练暂停90秒保存，一个正常周期为1200+90秒，保存占比90/(1200+90)≈6.98%。若故障均匀落在这20分钟计算区间，平均重做10分钟；另需4分钟已分配设备的恢复，则未计排队的恢复加重做约14分钟。这个模型的故障分布、暂停和计时起点都已固定；异步重叠或存储负载变化时再重算。'),

 p('先完成候选状态，再把它选为恢复点，这是分片提交的正常流程。各rank写到包含run、attempt、step和唯一版本的独立路径；协调者核对预期成员、大小、摘要与逻辑进度，形成不可变清单。约定范围的读者可读取全部成员后，协调者以条件更新发布清单引用；恢复方从该引用找到清单，再逐项加载。')+
 p('用标量程序的提交过程对照：CURRENT先指向step 0，step 3的候选文件准备好并校验一致后才发布。摘要验证字节完整；run、step和配置验证它们能组成同一步状态。因此模型来自第3步、动量来自第4步，即使各文件摘要都对，也会被一致性检查发现。')+
 figures(old[0])[1]+
 p('CURRENT只是本地教学指针。权威元数据的事务或单键条件写，规定哪个版本获得发布权；还要结合有效attempt的身份判断。对象存储使用相应版本和条件更新协议，POSIX同目录替换则按文件系统前提使用。发布成功后回执丢失，可以先查询指针与清单；清理候选对象时，还需避开活动写入者与保留期内的恢复版本。')+
 legacy('torch-checkpoint-path')+
 p('PyTorch DCP（Distributed Checkpoint，分布式检查点）负责选定目录中的状态读写；应用的提交引用负责选择哪一个目录。本章真实DCP路径使用第3节同一128→32→10网络、Dropout、AdamW和1024样本。Gloo是这里CPU进程使用的集合通信后端。两个CPU/Gloo rank完成两轮16次更新后共同调用同步save，旧进程退出，新进程创建对象并load，再继续两轮。',
 'state_dict是把运行对象变成可保存状态树的回调，load_state_dict把读回的状态装入对象。TrainState以Stateful接口把模型、优化器、进度、配置与各rank RNG组织到一起；get_state_dict使用0.weight等统一参数名关联模型与Adam历史，set_state_dict恢复相同对应关系。')+
 figures(old[5])[0]+
 p('顺图跟读：新进程先创建模型、优化器和加载器；DCP调用state_dict取得目标状态树，再读入数据，最后调用load_state_dict。恢复本rank的RNG与next_epoch=2之后，下一轮才读取输入。下面保留核心回调；两rank都进入save/load。')+
 codes(old[5])[0]+
 fold('选读PyTorch 2.5.1的目标状态、随机源与文件完成顺序',
 p('这个实现先用all_gather_object把各rank的小型随机状态收成相同列表rng_by_rank，加载后各取自己的项。get_state_dict为新Adam准备目标状态，随后由检查点中的值覆盖；它也统一模型参数名与优化器条目的关联。',
 '同步save先等待数据写入，再由协调者完成.metadata。2.5.1文件实现将元数据写到临时文件后重命名；.metadata记录状态项对应的文件位置。应用仍需记录目录的run、step与发布关系。本实验始终使用新目录，具体调用与两个反例见实战。',
 '异步保存允许训练与存储部分重叠，此时要按版本的暂存契约复制或冻结待保存状态，再等待保存完成。异步句柄返回、状态暂存完成与完整目录可恢复，是需要分别识别的阶段；这里的实际记录使用同步路径。')),

 p('沿四rank、每轮8192样本的题设，故障发生在第37次更新后又处理一个完整微批时。新目录只有三个分片，发布引用仍是第32次更新。说明应选的恢复点、要重做的样本范围、输入游标缺失时可退到的边界，以及旧attempt迟到时需要保护的记录。')+
 fold('展开推导：四项各1分，共4分',
 '<ol><li>从已发布的step 32恢复；三个候选分片仍属于未提交状态。</li><li>重做五次更新的2560样本；另有256样本的微批已经处理，但尚未形成一次完整更新。</li><li>按rank核对输入版本、随机源与游标；本章轮末恢复点提供明确的下一轮起点。</li><li>用当前attempt和期望前一版本仲裁权威指针，候选分片采用独立不可变路径。</li></ol>'),

 p('先运行标准库标量程序，把准备、校验、发布与加载串起来。prepare把模型、动量、输入状态写成三份文件，并记录同一run、step与配置；validate分别查字节摘要和逻辑一致性；publish校验后替换CURRENT；load只沿CURRENT选择状态。')+
 codes(old[7])[0]+
 table(['实际对照','结果'],[
 ['连续6步 / 3步保存后再3步','全部状态精确相同，下一样本cursor=6'],
 ['只恢复权重、step与cursor','动量与随机状态丢失，最终权重不同'],
 ['摘要正确但混合步数','mixed_generation'],
 ['追加字节破坏文件','file_integrity'],
 ['两项发布失败后','CURRENT仍为step-3']
 ])+
 fold('展开完整checkpoint_commit.py：标量状态与本地提交协议',codes(old[7])[1])+
 p('以上记录只覆盖标量SGD和本地文件协议。下面进一步使用原生DCP与真实两个训练进程，检验同一组网络状态怎样在新进程中恢复。')+
 legacy('torch-checkpoint-run')+
 p('reference_train.py是原train_ddp.py的逐字副本，用rank 0的torch.save连续训练四轮作为独立保存基线。train_dcp.py只从DCP目录恢复；run_lab.py等待前一组torchrun及worker全部退出，再启动恢复进程。结束后的comparison.pt供比较器读取，恢复入口使用的是DCP目录。')+
 codes(old[7])[2]+
 table(['实际路径','独立检查与结果'],[
 ['原程序四轮 / DCP两轮后恢复至四轮','模型、完整Adam、scaler空状态、两rank RNG、next_epoch与签名逐项完全一致'],
 ['恢复输入与更新','next_epoch=4，共32次更新；独立DistributedSampler逐项核对各rank两轮输入ID'],
 ['保留输入边界/RNG，清空Adam历史再训练','最终参数最大差0.007780135，完整比较发现差异'],
 ['复制检查点后删除.metadata','新加载进程非零退出，没有导出完成状态']
 ])+
 p('比较器递归遍历原基线的全部字段和每个张量，检查类型、形状与值；独立采样器检查实际消费的输入ID。清空Adam的反例实际完成训练，随后由比较器发现状态不同；缺.metadata的反例在加载阶段停止。两种结果分别检验状态延续与存储入口。')+
 fold('展开完整train_dcp.py：对象、训练循环与同步保存',codes(old[7])[3])+
 fold('展开完整run_lab.py：新进程恢复、逐项比较与反例',codes(old[7])[4])+
 p('上面这份旧记录固定PyTorch 2.5.1、同宿主两个CPU/Gloo进程、FP32和完整轮边界，验证同一进程数下的同步DCP保存和新进程恢复。下面换用独立的六参数FSDP模型，沿一次更新边界观察两个rank保存、三个rank恢复。')
 ]);

 const recovery=articles.find(x=>x.id==='checkpoint-recovery');
 const saveBoundary='<p>本章选择轮末且累积窗口已结束的保存点';
 if(!recovery.sections[1][1].includes(saveBoundary))throw Error('Missing checkpoint state handoff');
 recovery.sections[1][1]=recovery.sections[1][1].replace(saveBoundary,
  '<h3 id="checkpoint-ddp-optimizer-state">模型权重相同，下一步还可能不同</h3>'+
  p('看一次真实 DDP 收尾。原生 PyTorch 的两个本机 CPU/Gloo 进程退出 <code>join()</code> 时，框架广播模型，权重都变成 2.375。两个进程分别执行了 2 次和 1 次更新，SGD 动量各是 −5.5 和 −4。下一步都用目标 5，归约梯度同为 −2.625，权重却分别变成 3.71875 和 3.53125。实验回到同一权重，在内存中同步动量后重做这一步，两边都得到 3.71875。<a href="/article/ddp-code/#native-ddp-join">看两个进程在哪一步分开 →</a> · <a href="labs/ddp-uneven-join/validation.json">核对原始 <code>initial_world</code> 记录 →</a>')+saveBoundary);
 recovery.sections[5][1]+=p('进程数变化时，恢复组先按自己的布局为每个参数名创建接收张量。DCP把保存值读入这些张量，框架再将具名状态装入新的训练分片。下一批读哪几项、游标与优化器是否在同一次更新边界，由训练程序核对。<a href="/article/checkpoint-recovery/#fsdp-dcp-reshard">看两进程保存、三进程恢复的实际对照 →</a>');
 recovery.sections[7][1]+='<h3 id="fsdp-dcp-reshard">两个进程保存，三个进程继续同一次训练</h3>'+p(
 '沿用并行策略章的六参数线性层和同一批三个样本。每个样本有两个标量目标。两进程时分别读一行、两行，三进程时每个读一行。FSDP 会平均各进程的梯度，因此每个进程用 world size × 本地损失总和 ÷ 6 反向。两组算的是同一份全局目标。',
 '第 1 次更新完成后，两个进程各持三项展平训练参数，Adam 的一阶、二阶历史也各有三项。写检查点时，先按原来的 weight、bias 参数名拆回各自的张量，再按各张量的第一轴分片。设备网格 DeviceMesh 描述参与分片的进程，这里是一维 CPU 组。本例使用封装式 FSDP 接口 FSDP1，具名状态以 DTensor 表示，每项带有全局形状和本地片。')+
 trainingFigure('fsdp-dcp-reshard','从两个 rank 的展平参数到具名检查点，再装入三个 rank 的训练分片。')+
 p('保存组把模型、Adam 历史和已完成更新数 1 一起写入 DCP。实际目录包含 .metadata 和两个 .distcp 文件，元数据标明各具名张量的块形状和起点。新组先建三进程的具名接收布局，再 load 并 set_state_dict。weight 只有两行，bias 只有两项，所以 rank 2 的具名接收片为空。装回展平训练布局后，rank 2 负责两项偏置及对应的 Adam 历史。代码中的 SHARDED 将 full_state_dict 设为 False，选择分片状态。')+
 trainingCode('保存和装入具名状态的节选，省略记录与断言','PYTHON',`# 两个 rank 完成更新 1 后一起执行
model_state, optimizer_state = get_state_dict(model, optimizer, options=SHARDED)
dcp.save({"model": model_state, "optimizer": optimizer_state,
          "completed_updates": torch.tensor(1)}, checkpoint_id=folder)

# 三个新 rank 各自构造目标布局，再一起读取
model_state, optimizer_state = get_state_dict(model, optimizer, options=SHARDED)
state = {"model": model_state, "optimizer": optimizer_state,
         "completed_updates": torch.tensor(-1)}
dcp.load(state, checkpoint_id=folder)
set_state_dict(model, optimizer, model_state_dict=state["model"],
               optim_state_dict=state["optimizer"], options=SHARDED)`)+
 p('新建 Adam 的接收槽位由此版本的接口以零学习率初始化，槽位中的零矩量随后由保存值覆盖。程序在装入后核对游标和 Adam 步数都为 1，才开始第 2 次更新。另一组两个 rank 不间断完成两次更新，普通线性层也独立在全批上核对梯度、参数和 Adam 历史。')+
 table(['实际对照','观测结果'],[
  ['保存边界、恢复边界与连续路径的第 1 次更新','完整模型与 Adam 的最大绝对差均为 0'],
  ['三个 rank 完成第 2 次更新','与连续两 rank 的完整状态最大绝对差约 1.73e−18，满足绝对容差 1e−12'],
  ['模型和 Adam 保持第 1 次更新，只把保存的游标改成 0','原生加载成功，应用看到 Adam 步数为 1 后拒绝继续'],
  ['只加载模型与游标','应用拒绝缺失的 Adam。绕过检查更新一次后，参数最大差约 0.0005484']
 ])+
 fold('选读固定版本的空片反例',p('省略 DeviceMesh 时，本例的 FSDP1 采用 ShardedTensor 构造具名状态。第三个 rank 没有该具名张量的本地片，PyTorch 2.5.1 在 get_state_dict 阶段失败，程序尚未调用 dcp.load。正例用 DTensor 描述同一个空片，再完成实际加载。<a href="https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/fsdp/_state_dict_utils.py#L738-L751">核对 DeviceMesh 的状态类型选择 ↗</a>'))+
 trainingCode('在解压目录运行，使用 Python 3.12 和 PyTorch 2.5.1','SHELL','python -B fsdp_reshard.py > replay.json')+
 p('这次实跑在同一台机器上使用 CPU/Gloo、双精度和同步保存，保存完成后另起进程组，恢复点位于完整更新边界。自动扩缩容、异步保存、物理多机和 CUDA/NCCL 仍需对应环境的运行证据。')+
 '<p class="practice-links"><a href="labs/fsdp-reshard.zip" download>下载完整源码、说明和记录 ↓</a> · <a href="labs/fsdp-reshard/README.md">运行说明 →</a> · <a href="labs/fsdp-reshard/validation.json">核对各 rank 的布局和 Adam 历史 →</a> · <a href="https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/state_dict_loader.py#L49-L75">PyTorch 2.5.1 DCP 加载接口 ↗</a></p>';

 rewrite('training-performance',7,old=>[
 p('前章使训练能从一份明确状态继续，现在比较同一训练任务怎样更早、更省资源地完成。正常路径仍是读取输入→前向与反向→合并梯度→应用优化器更新→按周期保存状态。扩卡、改善输入或减少保存暂停，改变的是这条路径中的不同部分；先固定要完成的工作，再比较它的时间与成本。',
 '本章扩卡算例只用数据并行，每卡一个rank，各副本处理不同样本。微批是每rank一次处理的样本数，累积次数决定多久应用一次更新；等长批次下，全局有效batch=数据并行副本数×每rank微批×累积次数。若采用TP/PP，同一次计算会占多卡，应按独立数据副本数计算，沿用张量并行章的组成员关系。',
 '例如每rank微批64，单卡accum=8、两卡accum=4、四卡accum=2，三组都在512样本后更新。这个设置固定了batch大小；各进程的数据划分、浮点顺序和Dropout随机选择仍需记录，质量结果由同一评估方式核对。')+
 table(['实验问题','固定内容','比较结果'],[
 ['强扩展：同一份工作能早完成多少','总工作量、有效batch及其他训练设置','增加设备后的完成时间'],
 ['弱扩展：更多设备能否维持每卡效率','每设备工作量、本地batch与更新安排','随设备数增加的步时和总完成量'],
 ['达到同一质量目标','数据、验证目标与评估方法','所需总训练量、总时间和总成本']
 ])+
 p('下面声明处理八百万有效token，对比单卡与四卡。token是模型输入单位，有效token按约定的真实目标统计，padding填充另计；上面的512是样本单位，需结合长度分布才能换算token。固定八百万token的速度回答完成这段工作的时间；达到验证质量的time-to-quality，还要记录实际需要多少输入与更新。'),

 p('吞吐是规定时间内完成的工作量除以该段墙钟时间。墙钟时间表示实际经过多久；同一批分布式工作由多个rank合作，分母选它们共同完成的窗口，工作量按全局实际处理量统计。原DDP程序在每轮前设屏障、以各rank训练时长的最大值作为分母，把样本数求和，再单独记录保存时间。',
 '跟读原程序的测量位置：计时包含取批、拷贝、前反向、训练中的梯度通信和优化器更新；CUDA路径在区间两端同步设备。轮末汇总统计、打印与检查点保存位于训练窗口外。因而samples_per_second描述该训练段，用户从提交到完成还经历启动、排队、数据准备、保存与失败恢复。')+
 codes(old[1])[0]+
 p('字段中run_id、commit、dataset与配置描述同一次可复查运行，epoch、samples、train_seconds、checkpoint_seconds分开描述进度与时间。先预热、按相同配置重复，再报告正式窗口的中位数、离散程度及尾部。小型MLP（多层感知机）提供功能计时示例，目标性能实验应采用代表实际工作的模型与输入。',
 '用固定八百万有效token复算：声明单卡100,000 token/s，四卡全局250,000 token/s，暂只计训练段。两者需80秒与32秒，加速比80/32=2.5，扩展效率2.5/4=62.5%。四卡数值已经是全局量，单位直接写全局token/s便能看清分子范围。',
 '同价设备的训练段使用量为80卡秒与4×32=128卡秒，后者为1.6倍。一个方案可以更早完成，同时消耗更多分配容量；成本评审会继续加入其余阶段。这些吞吐是本题输入，实际CPU记录与目标GPU测量分别保存。'),

 p('关键路径是决定最后完成时刻的依赖链。训练中的梯度可以分成桶，反向准备好一个桶后启动其通信，部分通信可与后续计算重叠。性能上最直接影响终点的是仍暴露在必要依赖后的等待。先用一个只有最后通信尾段的教学时间线看清这个关系：')+
 table(['同一更新窗口','rank A','rank B','共同完成时刻'],[
 ['原路径','计算52毫秒后就绪','等输入12＋计算44=56毫秒就绪','max(52,56)＋通信8=64毫秒'],
 ['只缩短A计算10毫秒','42毫秒就绪','仍在56毫秒就绪','仍为64毫秒'],
 ['保留原A，只缩短B输入等待','仍在52毫秒就绪','等输入2＋计算44=46毫秒就绪','max(52,46)＋8=60毫秒']
 ])+
 p('第三行局部少等10毫秒，整体只快4毫秒，因为最晚就绪者从B变成A。各行是独立对照。把同一个更新编号的输入、计算、桶就绪和通信放在一起，再用trace（事件时间线）检查真实依赖，才能解释“通信等待长”究竟在等哪一步。',
 'Profiler采集CPU和设备活动。下面保留面向CUDA训练的集成片段，train_one_step、loader与rank来自目标程序；仅CPU练习选择CPU活动。schedule按每次prof.step()推进：先wait=1，warmup=1，再active=3、repeat=1。prof.step推进采集日程，优化器更新由训练函数负责；若循环单位是微批，轨迹还需标出累积窗口对应的更新。')+
 codes(old[2])[0]+
 p('每rank写独立轨迹目录，核对相同更新及阶段关系。多机绝对时钟不一致时，用本地单调时钟、阶段编号和通信依赖重建关系。GPU还要区分主机提交与设备完成。Profiler形状记录等会扰动工作，所以短窗口用于解释，正式时间再用低开销测量复核；上面片段本身没有提供目标GPU轨迹。'),

 p('时间线把现象缩小到某个rank、某个阶段之后，下一次对照只改变一个可解释条件。输入路径可接回数据章的读取、解码和预取，通信路径则接回进程组、拓扑与桶就绪。')+
 table(['已有证据','下一次对照','希望看到的变化'],[
 ['真实数据比合成输入慢','相同样本与长度，改本地缓存、解码或读取并发之一','输入等待下降，后续计算形状保持'],
 ['机内较好、跨机较差','同卡数与输入，对照网卡、拓扑和通信时间线','区分传输成本与某rank迟到'],
 ['固定rank总是晚到','查其输入、CPU、设备与资源争抢','该rank就绪时间前移'],
 ['显存有余且算子很小','调整微批，同时重算累积以保持有效batch','启动/算子效率改善，质量仍可比'],
 ['保存明显延长总时长','测写入和暂停，改变保存周期','总暂停与故障重做在恢复目标内重新平衡']
 ])+
 p('保留相同任务定义能让变化有意义。有效token、长度分布、被剔除样本、失败与重试都进入记录；过滤长序列会减少实际工作，填充比例变化也会改矩阵形状。中位step之外另看尾部，才能反映少量极长输入造成的总成本。',
 '先用短trace提出原因，再以无全面追踪的相同工作复验。例如A先到同步而B仍在读取，改网络带宽未必改变桶的最早开始时间；若本地缓存后等待仍然出现，就继续检查解码或调度。每项修改写出预计改变的事件与保持的输入，结果才有助于下一次判断。'),

 p('先分别给时间和资源记账。相同工作口径下，加速比S=多卡吞吐/单卡吞吐，单卡基线的扩展效率E=S/卡数；设备用量为各设备实际分配时长之和。每卡每小时计价p时，设备费=卡秒×p/3600，再加其他计算、存储与传输费用；p由目标环境报价或实际账单取得。')+
 '<div id="scaling-demo"></div>'+
 p('八百万token题中，训练段从80秒缩为32秒，卡秒从80增为128。做交付决策时，可同时列提前48秒的价值、增加的48卡秒，以及启动、保存、资源空闲和重试。排队影响提交到完成的时间，是否计费则按资源实际分配与计价规则记录。',
 '恢复点把成本与有效进度接起来。故障后，最后未提交的一段工作会重新计算：设备确实消耗了时间，但目标训练轨迹只前进一次。前章20分钟计算、90秒保存的长周期题，平均重做与恢复时间由其故障分布决定；这些损耗应进入整任务用量。训练窗口的瞬时吞吐与整任务完成速度因此各有分母。',
 '最终可按三个层次回答：算子是否更高效、相同一段训练是否更快、达到同一验证目标是否更早且资源更少。更大batch或输入策略可能改变达到质量门槛所需的更新数，故time-to-quality和cost-to-quality都需要实际轨迹。目标集群尚未运行时，交付固定条件、命令和待观察指标即可形成可审阅实验。'),

 p('一次可复现实验先保存代码与镜像摘要、数据清单、设备拓扑、驱动和库版本，再保存微批、累积、精度、随机策略与质量评估方式。若从检查点开始，还记录恢复点版本、next_epoch及实际恢复后的输入边界。这使性能对照从相同训练状态出发。',
 '先练习读取已有CPU证据：解压前章训练实验包，使用已有PyTorch 2.5.1环境运行<code>python verify_run.py --report run-report.json</code>。入口依次启动两CPU/Gloo进程的full、split与resumed。四轮full为32次实际AdamW.step，split与resumed各16次；比较器验证完整状态一致。轮末日志同时给出samples、seconds、samples_per_second与单独checkpoint事件，可以按原计时边界重新核算。',
 '本例每rank每轮16微批、累积2次，FP32下每轮8个更新窗口都调用了优化器。一般混合精度中，FP16动态缩放遇到非有限梯度可能跳过更新；因此程序分别记录attempted_update_windows和applied_optimizer_steps。性能记录把输入处理量、窗口数和实际应用进度分列，更容易连接恢复点中的逻辑进度。',
 '再提出一个对照，例如相同输入改用本地缓存；保留质量、完整状态和有效工作量，再比较输入等待是否前移。重复时交换方案顺序，区分冷缓存、热缓存和预热，让后跑方案继承缓存的影响显现。异常运行连同环境事件保留，报告中位数、离散程度及尾部。',
 '交给另一位工程师时，提供运行命令、配置和恢复点、完整事件记录，以及当前最晚rank的阶段。说明下一次实验预计哪条事件移动、若没有变化再查什么。现有CPU小模型证明这些记录和恢复对照能实际执行；GPU、多机网络和真实任务质量在目标环境各自测量。'),

 p('沿八百万有效token的题设，算四卡加速比、扩展效率和设备用量比；再按两rank时间线说明只缩短A计算10毫秒的结果。最后设计一项保持输入与更新目标的对照，并列出恢复、保存和重试在哪个时间窗口计入。')+
 fold('展开推导：四项各1分，共4分',
 '<ol><li>训练段80秒与32秒，加速比2.5。</li><li>效率62.5%，128对80卡秒，设备用量比1.6。</li><li>B仍在56毫秒才就绪，原窗口继续为64毫秒；独立改善B输入后，A决定尾部，结果60毫秒。</li><li>固定长度分布、质量目标、有效token、batch/累积和测量窗口，另报告提交到完成的保存、恢复、重试与尾部成本。</li></ol>')
 ]);

 const throughput=articles.find(a=>a.id==='training-performance');
 throughput.sections[3][1]+=
 '<h3 id="cpu-useful-token-throughput">实跑：同样 352 个目标，为什么每步耗时不同？</h3>'+
 p('先分清两个数。为让八条长度不同的序列组成同一个张量，每条都补齐到 128 个位置，线性层一次收到 1,024 行。其中只有 352 行带真实分类目标，剩余 672 行是填充。计算位置数描述模型实际接收了多少行，有效目标数决定平均损失和有效吞吐的口径。',
 '本实验每个位置独立分类。补齐路径先算全部 1,024 行分数，用掩码排除 672 个填充目标。紧凑路径在前向前按掩码筛出 352 行，做较小的矩阵计算。两个正例的损失都用同一批目标的损失和除以 352，然后反向计算梯度，执行一次随机梯度下降（SGD）。')+
 trainingFigure('training-useful-tokens','先核对两路训练是否完成相同的工作，再沿整理输入、前向、反向和参数更新比较用时。')+
 trainingCode('关键几行：先排除填充目标，再用有效数归一化','PYTHON',`
if mode == "packed":
    keep = labels != -100
    features, labels = features[keep], labels[keep]

scores = model(features).reshape(-1, CLASSES)
loss_sum = F.cross_entropy(scores, labels.reshape(-1),
                           ignore_index=-100, reduction="sum")
loss = loss_sum / useful
loss.backward()
optimizer.step()
 `)+
 table(['同一初始权重的实跑','前向行数','损失分母','权重 [0, 0] 的梯度 → 更新后值'],[
 ['补齐','1,024','352','−0.011802 → −0.154775'],
 ['紧凑','352','352','−0.011802 → −0.154775'],
 ['错用总位置数','1,024','1,024','−0.004057 → −0.155743']
 ])+
 p('两个正例对照完整梯度和更新后权重。负例的损失和没有变，平均损失却从约 1.399 降到 0.481，梯度也只剩原来的 352 ÷ 1,024。这个损失下降来自分母错误，参数更新已经变了。如果又用 1,024 当吞吐的分子，同一段用时会把有效速度夸大 2.91 倍。')+
 table(['怎么测','包含什么','怎样读'],[
 ['开启 Profiler，各抓一次更新','整理输入和清梯度 → 前向及损失 → 反向 → SGD 更新','先看四段发生顺序。紧凑路径的筛选也占时间，在整理输入里找。'],
 ['关闭 Profiler，预热后交替跑 12 组','每组每条路径各更新 24 次，计时覆盖上述四段','每组总用时先除以 24，再对 12 个组均值取中位数和 P90。有效吞吐用 352 除以中位数步时。']
 ])+
 p('一次单线程 CPU 实跑中，补齐和紧凑路径的中位步时分别约 106.9、91.1 微秒，按 352 个目标折算约 329、386 万有效 token/秒。两路 P90 约为 112.9、116.1 微秒，这次紧凑路径的中位数更低，较慢组的平均步时反而略高。这里的 P90 反映组均值波动，单次更新的尾延迟需要逐步计时。复跑可核对工作量与更新是否一致，耗时随机器和负载变化。',
 '实验只验证逐位置线性分类的 CPU 更新。迁移到有注意力的模型时，还要保证序列之间看不到彼此、位置编号正确、真实目标相同。到了多卡，再把输入筛选与各 rank 的计算、通信等待放进共同的更新窗口。')+
 trainingCode('解压后运行，可选导出两条原始轨迹','SHELL','python -m pip install -r requirements.txt\npython -B useful_tokens.py --trace-dir traces > replay.json')+
 '<p class="practice-links"><a href="labs/training-useful-tokens.zip" download>下载可运行实验 ↓</a> · <a href="labs/training-useful-tokens/useful_tokens.py">查看完整源码 →</a> · <a href="labs/training-useful-tokens/README.md">复跑与读轨迹 →</a> · <a href="labs/training-useful-tokens/validation.json">核对计数、步时与阶段 →</a> · <a href="https://docs.pytorch.org/docs/stable/profiler.html">PyTorch Profiler 接口 ↗</a></p>';

 recovery.sections[7][1]+='<h3 id="native-elastic-restart-step">第 2 步已经算完，为什么重启还要重算</h3>'+
 p('两个 worker 每步各处理一个目标，三步的目标依次是 [1,3]、[2,4]、[3,5]。输入始终是 1，初始权重为 0。损失用平方误差。带动量的 SGD 每步先更新缓冲 m = 0.5 × m + g，再用 w = w − 0.125 × m 更新权重，g 是 DDP 平均后的梯度。第 1 步梯度为 −4，得到 m = −4、w = 0.5，保存时也记下已完成的步数 1。')+
 p('第 2 步两边都更新到 w = 1.375。故障放在这次更新之后、检查点发布之前。rank 1 以退出码 73 结束。<code>torchrun</code> 看到失败后，向仍在等待的 rank 0 发送 SIGTERM，启动两个新进程。原来的两个进程号都变了，<code>TORCHELASTIC_RESTART_COUNT</code> 从 0 变成 1。')+
 trainingFigure('elastic-restart-step','旧组在第 2 步只改变了内存。新组读回已经提交的第 1 步，再消费原来的第 2 批输入。')+
 p('启动器知道该重新启动进程，检查点决定接下来从哪读数据。新组恢复权重 0.5、动量 −4 和游标 1，再读 [2,4]。这次第 2 步才发布检查点。<code>attempts</code> 能看到两次第 2 步计算，最终 <code>checkpoint.history</code> 里只有 1、2、3 各一次。')+
 table(['对照','第 3 步后的权重','第 3 步后的动量'],[
  ['连续三步','2.46875','−8.75'],
  ['重启，恢复权重、动量和游标','2.46875','−8.75'],
  ['重启，只恢复权重和游标','2.15625','−8.25']
 ])+
 p('只恢复权重的进程仍从正确的批次开始，但动量缓冲为空。第 2 步本应把梯度 −5 与旧动量的一半相加得到 −7，少了这段历史，后续权重也会偏。')+
 trainingCode('解压后复跑三组，启动器允许故障组重启一次','SHELL','python -m pip install -r requirements.txt\npython -B elastic_restart.py > replay.json')+
 p('查 <code>launcher.worker_failures</code> 和 <code>stopped_peers</code> 确认是谁退出、谁被停止。再比较两次 <code>start</code> 的游标、动量和进程号。实跑使用本机两进程 CPU/Gloo。检查点以本机文件替换发布，覆盖进程退出后的恢复。云上多机、共享存储与断电要在各自环境验证。')+
 '<p class="practice-links"><a href="/labs/elastic-restart-step.zip" download>下载程序与记录 ↓</a> · <a href="/labs/elastic-restart-step/README.md">复跑步骤 →</a> · <a href="/labs/elastic-restart-step/validation.json">核对进程、更新和检查点 →</a> · <a href="https://docs.pytorch.org/tutorials/beginner/ddp_series_fault_tolerance.html">PyTorch torchrun 恢复教程 ↗</a></p>';
 recovery.sections[7][1]+=
 '<h3 id="native-async-dcp-commit">异步保存时，旧检查点会写进哪一步的权重？</h3>'+
 p('异步保存让后台写检查点，训练可以继续。两张状态表却可能指向同一块内存。训练刚改完第 2 步的权重，后台可能正要把那块内存写进第 1 步的目录。<a href="/article/data-pipeline/#native-prefetch-resume">数据管道的恢复实验</a>确认下一批从哪里读，这里再确认从哪一步的参数接着算。')+
 p('用一个权重 w 来看。两个训练进程在 CPU 上用 Gloo 交换数据，各进程编号叫 rank。输入为 1，预测值就是 w，目标值为 y，损失是 (w−y)²/2。两个进程平均梯度 g 后，用动量 m ← 0.5m + g，再做 w ← w − 0.25m。第 1 步的目标是 2 和 4，从 w=0、m=0 算出 w=0.75、m=−3。第 2 步的目标换成 6 和 10，平均梯度变成 0.75−8=−7.25，得到 w=2.9375、m=−8.75。')+
 trainingFigure('async-dcp-commit','先取第 1 步的状态，后台写入暂缓，前台继续第 2 步。复制与共享存储两条路径都写成功，恢复结果不同。')+
 p('这段代码使用 PyTorch 2.5.1 的分布式检查点（DCP）。先在第 1 步复制一份独立状态，再交给 <code>async_save</code>。返回的 <code>Future</code> 用来等后台写完。最后由训练程序确认保存目录的元数据文件 <code>.metadata</code>，再更新恢复入口 <code>CURRENT</code>。实验故意让后台等到第 2 步做完才开始写。')+
 trainingCode('保存第 1 步的独立副本，等待后台写完再发布','PYTHON',`payload = state(model, optimizer, 1)
argument = copy.deepcopy(payload)
future = dcp.async_save(argument, storage_writer=writer, process_group=pg)
# 实验让前台完成第 2 步，再放行后台 writer
future.result(timeout=35)
# rank 0 确认 .metadata 后替换 CURRENT`)+
 table(['实际读回的路径','已完成步数 / 权重 / 动量','读回后再做第 2 步'],[
  ['复制状态，再异步写入','1 / 0.75 / −3','2.9375'],
  ['共享训练存储，异步写入仍成功','1 / 2.9375 / −8.75','5.296875'],
  ['rank 1 写失败，读取原已发布目录','1 / 0.75 / −3','2.9375']
 ])+
 p('在本实验的 PyTorch 2.5.1 默认 CPU 暂存路径，转到 CPU 的两个张量仍与训练共享地址。第 2 步更新后，后台写入的权重和动量已经变了，独立保存的步数却仍是 1。显式复制后，前台更新不会改到后台要写的副本。第三组让 rank 1 写失败，只有 rank 0 的分片文件留下，没有 <code>.metadata</code>，<code>CURRENT</code> 继续指向上一份已发布目录。')+
 '<details class="progressive-detail"><summary>手算一下。只复制权重，动量仍共享，恢复后会怎样？</summary>'+
 p('会从 w=0.75、m=−8.75 接着算。第 2 步的梯度仍为 −7.25，动量更新为 −11.625，权重变成 3.65625。这是按同一公式推导的变体。')+'</details>'+
 p('解压后按包内命令跑两个本机进程。核对阶段标记、保存完成后的目录和实际读回值，再用一次更新区分两份检查点。本实验固定版本和 CPU 默认写入器，保存后的状态通过新建的模型和优化器加载。复制所需的额外内存和目标环境的吞吐另测。')+
 '<p class="practice-links"><a href="/labs/async-dcp-commit.zip" download>下载源码与复跑命令 ↓</a> · <a href="/labs/async-dcp-commit/validation.json">查看两个 rank 的状态与文件 →</a> · <a href="https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/staging.py#L91-L100">固定版暂存路径 ↗</a></p>';
 const singleGpuResults='https://github.com/CaptainGreenskin/one-gpu-lm/blob/14dca34170e02832a2f36f04be471a0210bcb891/experiments/013-training-infrastructure/results/2026-11-09/';
 recovery.sections[2][1]+=fold('单卡实测 · 第 4 步退出，恢复到第 12 步',
  '<h3 id="single-gpu-recovery-contrast">从哪一步开始出现差异？</h3>'+
  p('同一张 RTX PRO 6000 Blackwell 上，两组按同一顺序处理 12 条样本，底座权重固定，只训练附加的 LoRA 小矩阵。第一组连续更新 12 步，第二组在第 4 步完整保存后退出，新进程读回参数、优化器和随机状态，继续完成第 5–12 步。',
  '首次配对读回的三项状态指纹都匹配。往前查日志，首步损失相同，梯度范数（衡量整组梯度的大小）已经不同，第 2 步的损失也开始分叉。差异出现得比第 4 步退出更早。遇到这种情况，先核对退出前的两条训练轨迹，再检查加载过程。')+
  p('重跑沿用原样本和比较阈值，同时启用确定性算法，固定 GPU 矩阵计算库 cuBLAS 的临时内存设置，并关闭 TF32 这种降低乘法精度的计算模式。第 12 步后，两组 LoRA 参数的最大绝对差为 0，参数、优化器状态及逐步损失均逐位一致，最终随机状态也一致。记录验证了这一组配置在完整更新边界的单卡进程恢复。')+
  '<p class="practice-links"><a href="'+singleGpuResults+'README.md">实验条件与诊断过程 ↗</a> · <a href="'+singleGpuResults+'failed-pairs/recovery-v3/comparison.json">首次配对记录 ↗</a> · <a href="'+singleGpuResults+'comparison.json">重跑对照结果 ↗</a></p>');
 recovery.sections[7][1]+=fold('实跑 · 同一小模型从双进程训练走到推理',
  '<h3 id="native-tiny-decoder-handoff">训练恢复后，推理加载的是哪一步权重？</h3>'+
  p('沿用 <a href="/article/transformer-model/#training-versus-generation">Transformer 章的 664 参数小模型</a>和两条输入。第一步把两条序列分给两个训练进程，分别有 1、3 个有效目标。每个进程先算本地损失和，再乘 2/4 做反向。DDP 把两个进程的梯度平均后，每个有效目标的权重就是 1/4。')+
  trainingFigure('tiny-decoder-handoff','同一份模型参数经过两次更新、一次换进程恢复，再作为文件交给新的推理进程。')+
 p('第一步后保存参数、优化器动量和已完成步数。新训练进程读回检查点，从第二步继续。这一步仍使用两条原输入，但有效目标改为 3、1。单进程用全局四个目标算出的两步平均损失约为 8.628 和 9.196。双进程与单进程两种跑法逐项比较更新后的权重，最大绝对差约为 5.55×10⁻¹⁷。')+
  p('动量是优化器保存的梯度历史。单进程对照只保留第一步的权重并重新初始化动量，同样完成第二步后，最终权重的最大绝对差约为 0.05694。于是恢复验收要同时查步数、参数和优化器状态。')+
  table(['交给推理的权重','从提示 [0,1] 生成','各轮缓存长度'],[
   ['完成第一步','[1,1,1]','[2,3,4]'],
   ['完成第二步','[1,1,1]','[2,3,4]']
  ])+
  p('输出编号恰好相同，两个权重版本的首轮候选分数最大相差约 1.04839。新推理进程先核对制品摘要，再加载导出的权重。把第一步的权重放进声称来自第二步的制品，程序在推理前拒绝。对于正确的第二步权重，完整前缀与增量缓存的候选分数最大误差约为 4.44×10⁻¹⁶。<a href="/article/model-serving/#sdpa-cache-run">回到推理章看逐位置的缓存校验 →</a>')+
  p('解压本实验及<a href="/labs/sdpa-cache.zip">原 SDPA 实验包</a>，按包内说明启动。记录可用来核对本机 CPU/Gloo 的目标数、检查点和推理读回。')+
  '<p class="practice-links"><a href="/labs/tiny-decoder-handoff.zip" download>下载程序与记录 ↓</a> · <a href="/labs/tiny-decoder-handoff/validation.json">查看训练与推理实际记录 →</a> · <a href="/labs/tiny-decoder-handoff/README.md">复跑步骤 →</a></p>');
 recovery.sections[7][1]+=fold('实跑 · 同一小模型换进程后在 Apple GPU 上续训',
  '<h3 id="native-mps-checkpoint-resume">恢复时分别核对动量与设备随机状态</h3>'+
  p('沿用 <a href="/article/transformer-block/#decoder-record-recompute">同一个 664 参数模型</a>、两条输入和两组有效目标。这里让每一步在 GPU 上随机抽取一组目标。Apple 平台的 PyTorch GPU 后端叫 MPS。实验固定 PyTorch 2.5.1、FP32、同一块 Apple M4 Pro，关闭不支持的运算回退到 CPU 的选项。每步记录候选分数与梯度都在 <code>mps:0</code>。')+
  p('连续运行六步，抽到的目标组依次是 [1,0,0,0,1,1]。另一条路径在第 3 步结束时保存，再换进程。检查点带上参数、优化器动量、已完成步数与随机状态。动量保存先前梯度的累积值，随机状态决定后续会抽到哪一组目标。')+
  table(['从第 3 步恢复时带回什么','后 3 步抽到的目标组','最终权重与连续训练的最大绝对差'],[
   ['全部状态','[0,1,1]','0'],
   ['只省去动量','[0,1,1]','约 0.13231'],
   ['只省去 MPS 随机状态','[1,0,0]','约 0.04247']
  ])+
  p('完整恢复在续训前读回相同的参数、动量和设备随机状态，最终动量也逐项相同。只省去动量时，仍会抽到相同目标，更新却已经不同。只省去设备随机状态时，加载出的动量保持原值，目标组从恢复后的第一步就变了。三组恢复初始权重都相同，所以只对比加载出的权重会漏掉两个问题。')+
  trainingCode('解压后进入实验目录，使用 Apple Silicon 与 Python 3.12','SHELL',`python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B mps_resume.py > replay.json`)+
  p('查看原始记录的 <code>runs</code>。先把 <code>save.final</code> 对到 <code>resume.initial</code>，再比较每步的 <code>plan</code>，最后看 <code>comparisons_with_continuous</code>。这次验证覆盖同一设备上的完整更新边界。设备随机状态用于抽目标组，原模型的注意力不使用 dropout。CUDA、NCCL、跨机恢复和吞吐另有验收条件。')+
  '<p class="practice-links"><a href="/labs/mps-checkpoint-resume.zip" download>下载源码与记录 ↓</a> · <a href="/labs/mps-checkpoint-resume/README.md">复跑说明</a> · <a href="/labs/mps-checkpoint-resume/validation.json">查看进程、随机状态与权重差异</a></p>');
 recovery.updated='2026.11.12';

})();
