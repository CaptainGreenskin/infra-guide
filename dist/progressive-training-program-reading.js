/* Read the real two-rank training program as one update-and-resume sequence.
   Load before first-reading-flow.js; the course map assigns final numbering later. */
(()=>{
 const p=(...rows)=>rows.map(x=>'<p>'+x+'</p>').join('');
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="full-code"><summary>'+title+'</summary>'+body+'</details>';
 const anchor=id=>'<span id="'+id+'" class="legacy-subsection-anchor" aria-hidden="true"></span>';
 const matches=(s,re)=>[...s.matchAll(re)].map(m=>m[0]);
 const blocks=s=>matches(s,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=s=>matches(s,/<figure\b[\s\S]*?<\/figure>/g);
 const links=s=>matches(s.replace(/<figure\b[\s\S]*?<\/figure>/g,'').replace(/<pre\b[\s\S]*?<\/pre>/g,''),/<a\b[^>]*\bhref=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/g);
 const linkRow=items=>items.length?'<p class="practice-links">'+items.join(' ')+'</p>':'';
 const bag=items=>JSON.stringify(items.slice().sort());
 const published={'ddp-code':['subsection-3-r2s4n5'],'training-lab':['subsection-1-1b599gx']};
 const select=(id,titles)=>{
  const a=articles.find(x=>x.id===id);
  if(!a||a.sections.length!==titles.length||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Training program source layout changed: '+id);
  return a;
 };
 function rewrite(a,bodies,desc){
  const before=a.sections.map(s=>s[1]).join(''),after=bodies.join('');
  const pres=s=>matches(s,/<pre\b[\s\S]*?<\/pre>/g);
  const hrefs=s=>matches(s,/\bhref=["'][^"']+["']/g);
  const ids=s=>[...s.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
  if(bodies.length!==a.sections.length||/<h[23]\b/i.test(after))throw Error('Training program heading layout changed: '+a.id);
  if(JSON.stringify(pres(before))!==JSON.stringify(pres(after)))throw Error('Original training program code bytes or order changed: '+a.id);
  if(bag(figures(before))!==bag(figures(after)))throw Error('Original training program figure changed: '+a.id);
  if(bag(hrefs(before))!==bag(hrefs(after)))throw Error('Training program href multiset changed: '+a.id);
  for(const id of [...ids(before),...published[a.id]])if(!ids(after).includes(id))throw Error('Training program anchor lost: '+a.id+'/'+id);
  if(new Set(ids(after)).size!==ids(after).length)throw Error('Training program duplicate anchor: '+a.id);
  const identity=[a.id,a.title,a.number,a.module];
  bodies.forEach((body,i)=>a.sections[i][1]=body);a.desc=desc;a.intro=desc;a.updated='2026.11.09';
  if(JSON.stringify(identity)!==JSON.stringify([a.id,a.title,a.number,a.module]))throw Error('Training program identity changed: '+a.id);
 }

 const ddp=select('ddp-code',['先把两个进程和数据规模固定','采样器决定每个rank拿什么','沿两个小批走完第一个窗口','日志分别回答看过多少和执行过多少','先看核心循环，再展开完整程序','两个尝试窗口，为什么只执行一次','保存边界决定恢复后重做什么','先验收本机，再增加物理节点']);
 const d=ddp.sections.map(s=>s[1]),d1=blocks(d[0]),d2=blocks(d[1]),d5=blocks(d[4]),d6=blocks(d[5]);
 if(d1.length!==1||d2.length!==1||d5.length!==2||d6.length!==1||figures(d.join('')).length!==1)throw Error('DDP preserved material changed');
 rewrite(ddp,[
 p('把训练全景中的128条全局样本窗口落到一份完整程序：启动两个worker，分别读32条、累积两批，在窗口末同步梯度并各自更新模型；一轮结束后保存下一轮需要的状态。本章沿这条正常路径读train_ddp.py，再用独立探针解释精度缩放何时会跳过更新。',
 'worker是执行训练脚本的进程。torchrun是创建这些进程的启动器，给它们传入组内编号rank和进程总数world_size。这里rank为0、1，world_size=2；两个进程在CPU上通过Gloo通信后端建立通信组。分布式数据并行（DDP）包装各自的模型副本，在反向传播时同步梯度；输入由采样器另行分片。',
 '每条合成样本有128个输入数和一个0至9的类别标签。模型先用线性层把128维映射到32维，ReLU把负的中间数值截为0，Dropout在训练时随机屏蔽部分中间数值，再由输出层产生10个类别得分。交叉熵比较得分与正确标签，反向传播求出损失对参数的梯度。AdamW优化器保存梯度及梯度平方的移动平均，称为一阶、二阶矩量，再结合这些历史调整参数。')+
 table(['本章这次运行','固定值','对应工作'],[
 ['输入与模型','1024条样本；128→32→10','固定生成方法，两个rank构造相同全集'],
 ['分片与组批','2个rank；每rank每批32条','每rank512条、16个小批'],
 ['累积与精度','accum=2；CPU FP32','每rank每轮8个更新窗口，全局每窗128条'],
 ['训练目标','epochs=4','连续四轮，或从轮末检查点恢复到第四轮']
 ])+
 p('下面命令显式选择这组入口。原始通用脚本未传参数时仍默认samples=8192、batch-size=64、hidden=256；命令中的1024、32、32覆盖这些默认值。后面的推导与CPU记录都按命令选择的配置计算。')+d1[0]+
 p('GPU迁移时，LOCAL_RANK表示节点内的进程编号，用来绑定该进程可见的一张GPU。当前命令只运行CPU；设备绑定与目标通信后端要在相应GPU环境另行验证。'),

 p('数据集先提供1024条带编号的输入与标签，采样器决定读取编号的顺序，DataLoader再按这些编号取样本并组批。DistributedSampler让各rank以相同采样种子和轮次生成同一全局打乱顺序，再按rank交错取片：rank0取第0、2、4…个位置，rank1取第1、3、5…个位置。每rank因此获得512条，而不是各自遍历全部1024条。',
 'epoch是一轮数据遍历的索引，从0开始。每轮创建DataLoader迭代器之前调用set_epoch(epoch)，使采样器按这一轮生成排列；两个rank传入同一轮次，才能继续划分同一个全局顺序。')+d2[0]+
 p('512÷32=16，所以每rank一轮执行16次数据迭代。采样器的drop_last决定全局样本数不能整除rank数时是否截去尾项；DataLoader的drop_last决定某rank最后不足32条的一批是否丢弃。这里1024、2和32恰好整除，两处规则都没有丢弃样本。',
 '程序还要求每rank小批数能被accum整除，使每个窗口都完整。把accum改成3时，16÷3有余数，入口会明确拒绝；处理不完整尾窗需要另一套按真实目标数归一化的规则，后面的选读练习单独演示。'),

 p('窗口是一次优化器更新所包含的一组小批。参数在第一个小批开始前固定，两边先计算各自32条的损失与梯度，保留在本地；第二批再各处理32条，累加后进入DDP梯度同步。同步完成，各rank持有相同的聚合梯度，再按相同优化器规则更新副本。')+
 figures(d[2]).join('')+
 p('图中左右两路表示两个rank的数据贡献；下面“小批0、1”表示同一rank先后执行的两个时刻。沿时间看，一个完整窗口如下。')+
 table(['窗口内时刻','rank0','rank1','参数与梯度'],[
 ['小批0','32条，交叉熵均值再除以2','另32条，采用相同规则','前向与反向都在no_sync内，只累积本地梯度'],
 ['小批1','再32条，累加并进入同步','再32条，累加并进入同步','这次同步包含两批累计的贡献'],
 ['窗口末','尝试调用优化器，然后清梯度','按相同顺序执行','进入下一窗口时从空梯度开始']
 ])+
 p('四份等长小批共覆盖2×32×2=128条。交叉熵先对本批32条求均值，代码再除以累积数2，DDP跨两rank平均；每条样本的梯度系数是1/32×1/2×1/2=1/128，正好对应这128条的均值目标。',
 'no_sync只延后梯度同步，前向与反向仍照常计算。它必须同时包住首批的前向和反向；第二批前保留首批梯度，第二批反向后才step、再清零。这样首批贡献才能进入同一次更新。')+
 fold('选读：窗口有效目标数不等时，换用独立算例',anchor('subsection-3-r2s4n5')+p('并行策略章的7、0、3个有效目标实验采用自己的三参数模型、初值与SGD动量，演示尾窗、空窗、裁剪和全局分母。本章完整分类程序固定等长窗口；复习该练习时分别保留两套输入。')+linkRow(links(d[2]))),

 p('每轮结束先回答三件事：全组处理了多少样本，到达多少个更新边界，实际执行了多少次优化器调用。尝试计数在窗口末加一；实际计数由优化器的post hook完成，这个回调在非融合AdamW的step实际执行后触发。')+
 table(['日志项','本章每轮数值','由什么得到'],[
 ['每rank小批数','16','1024÷2÷32'],
 ['attempted_update_windows','8','16÷2，在每个窗口末计数'],
 ['applied_optimizer_steps','8','本次CPU FP32实际调用的回调计数'],
 ['samples','全局1024','汇总两rank各自处理的512条'],
 ['loss','全局样本加权均值','本批交叉熵均值×样本数，跨rank求和后除以1024']
 ])+
 p('日志中的loss用于观察这一轮，它汇总未除以accum的本批交叉熵；反向目标仍按上一节的窗口规则计算。分别理解这两处除法，才能看清“按样本报告损失”和“按窗口构造梯度”各自的用途。',
 '训练循环前先同步，同步完成后开始计时，在循环结束时记录，跨rank取最大的轮耗时；并行执行的两段时间不相加。吞吐为全局样本数除以这段时间。它不包含进程启动或后续检查点保存，也不是GPU或大模型性能基准。',
 '两个更新计数每轮重新记录，optimizer_steps保留为实际调用数的兼容别名。实际step调用表示优化器执行过更新规则；参数是否改变、任务质量是否提高，还要分别观察参数与任务指标。'),

 p('现在把采样后的一个小批交给核心循环。FP32路径直接用32位浮点数计算，梯度缩放器处于关闭状态，scale和step按原值传递。GPU精度选项中的自动混合精度AMP会让适合的算子采用较低精度；autocast负责选择算子精度，梯度缩放器负责FP16训练的数值缩放，两者承担不同工作。',
 'FP16能表示的数值范围较小，微小梯度可能下溢。GradScaler先把损失乘以缩放因子S，使反向得到的梯度也乘S，到更新前再撤销缩放。一个累积窗口内保持同一S，才能把各批梯度相加。遇到inf等非有限梯度时，它可以跳过这次优化器调用并调整S；因此程序分别计“尝试”和“实际”。',
 '下面原循环没有梯度裁剪。若扩展为限制梯度范数的裁剪，应在完整窗口累计结束后先unscale撤销缩放，再clip，随后step与update；裁剪阈值作用于真实尺度的梯度。')+d5[0]+
 p('按循环逐行看：update标记最后一个小批；此前使用no_sync，窗口末按同步路径反向。scale作用于loss/accum，step尝试更新，update调整缩放器，zero_grad为下一窗口清空梯度。CPU入口只允许FP32，所以下面的实际CPU记录没有发生FP16数值跳步。')+
 fold('展开完整train_ddp.py：从启动身份读到轮末保存与恢复',d5[1])+linkRow(links(d[4])),

 p('用独立探针只改变梯度是否有限，就能看见“尝试两次、实际一次”。探针在单进程CPU使用FP32参数、GradScaler("cpu")及非融合AdamW，初始参数为1，学习率0.125，weight_decay=0，初始缩放因子S=8。先由有限损失反向得到缩放后的梯度16；撤销缩放并更新后，参数变成0.875。',
 '第二个窗口把损失中的乘数改为inf，反向产生inf梯度。缩放器检查到非有限数，跳过AdamW.step，随后把S从8降至4。Adam的步计数和post hook计数都停留在1。')+
 table(['观察项','有限梯度窗口之后','inf窗口之后'],[
 ['尝试窗口累计','1','2'],['参数','0.875','0.875'],['Adam步计数与实际调用回调','1','1'],['缩放因子','8','4']
 ])+
 p('两次scaler.step返回值都是None，故探针用优化器状态和回调确认实际执行。这个单进程实验没有autocast或DDP，检查的是当前非融合AdamW路径的跳步与计数关系；融合优化器的AMP集成方式需要另查。')+d6[0]+linkRow(links(d[5])),

 p('完成一轮8次更新后，梯度已清空，参数、Adam历史和随机源都位于同一轮末边界。各rank收集自身随机状态，rank0把完整模型、优化器、缩放器、rng_by_rank、下一轮索引next_epoch和配置签名一起写入检查点，其他rank在保存屏障处等待。这里DDP每rank都有完整模型，保存的是完整载荷。',
 '写入先经过同目录临时文件，刷新文件后替换checkpoint.pt。恢复时，新进程先建立数据、模型、DDP与优化器，各rank读取同一受信文件并核对签名，再加载模型、优化器与缩放器，最后恢复属于自身rank的随机状态。下一轮按next_epoch调用set_epoch，然后创建迭代器继续训练。',
 'next_epoch=2表示从零起始索引2、也就是第三轮继续。它标记输入轮次，不能倒推出历史实际step数；当前载荷未持久保存累计回调计数，恢复日志记录本次进程的每轮增量。',
 '这个提交边界也决定故障后的重做范围：在某轮中途退出时，新执行从最近已提交轮末重新计算整轮；若尚未保存过，就从固定初始状态开始。临时文件替换用于本实验的POSIX路径，存储掉电、对象存储与多文件提交需要各自的持久协议。')+
 linkRow(links(d[6]).map(x=>x.replace(/>[^<]*<\/a>$/, '>延伸：原生DCP目录恢复与独立对照 →</a>'))),

 p('先按同一CPU配置核对一轮全局1024条、每rank16个小批、8个尝试窗口与8次实际调用，再比较连续四轮和两轮后恢复到四轮。配套两rankCPU/Gloo记录检查模型、优化器、缩放器、逐rank随机状态、轮次与签名，最终逻辑载荷精确一致。综合实践会展示完整入口与反例。',
 '配置拒绝与成功路径一起限定这份程序：accum=3被16个小批的整除条件拒绝，旧检查点与不匹配batch或模型配置被签名检查拒绝。它们说明固定输入和固定世界规模下的恢复条件。')+
 fold('选读：本机四进程与物理多机分别增加什么',p('早期配套记录还实际运行了本机两个启动器、四个CPU rank的一轮训练：1024条样本、每rank每批32条、累积2批，全局每窗256条，每rank完成4次尝试与实际调用，并保存轮末检查点；这条记录没有恢复比较。后续多机章的独立四rank扩展使用8192条、每批64条、累积2批，全局每窗512条，每rank每轮16次更新，再比较连续两轮与一轮后恢复。后者保留了位级比较失败：最大绝对差为7.450580596923828e-09，另列的程序数值契约通过。差异根因尚未证实，两套四rank输入与本章两rank精确结果分别解释。',
 '迁移到单机GPU时增加设备绑定、目标精度和算子验证；迁移到物理两机时再增加共同会合、真实网络、NCCL及共享持久路径。每一层都在原有更新与恢复逻辑上添加环境条件。'))+
 linkRow(links(d[7]).map(x=>x.replace(/>[^<]*<\/a>$/, '>后续：两机四卡的分阶段验收 →</a>')))
 ],'沿两个CPU进程的一次128样本更新窗口，读懂输入分片、梯度累积、实际step计数与轮末保存，再对照完整可运行源码。');

 ddp.sections[1][1]+='<h3 id="native-ddp-join">一个 rank 提前读完，另一个怎样继续</h3>'+
 p('前面的采样器让两个 rank 拿到相同数量的小批。若在分片后各自过滤数据，或者两个流式数据源提前结束的时刻不同，循环次数仍可能不同。分布式训练中的集合通信要求组员按相同次序进入对应操作。一个 rank 留在循环里，另一个读完就停止参加，等待就出现在下一次需要两者共同参与的位置。')+
 p('本实验把每个小批缩成一个目标值。rank 0 依次读 2、8，rank 1 只读 6。预测值是唯一参数 <code>w</code>，损失为 <code>(w − 目标)² / 2</code>，所以本地梯度为 <code>w − 目标</code>。SGD 动量 <code>m</code> 保存过去梯度对下一次更新的影响。本例每步计算 <code>m = 0.5 × m + g</code>，再用 <code>w = w − 0.25 × m</code> 更新。两者初值均为 0。')+
 trainingFigure('ddp-uneven-join','两进程实跑。从首次同步走到短输入耗尽、尾部归约和模型广播，再核对下一次更新。')+
 p('第一步的梯度是 <code>(−2 − 6) / 2 = −4</code>，两边都得到 <code>w = 1</code>、<code>m = −4</code>。第二步只剩 rank 0 的目标 8，本地梯度为 <code>1 − 8 = −7</code>。下面四组运行只改变 rank 提前读完后的处理方式。')+
 table(['处理方式','第二步通信和梯度','本次观察'],[
 ['直接退出循环','rank 1 等在循环外，未补对应通信','rank 0 的 Gloo 操作超时，第二步没有完成'],
 ['检测到耗尽就报错','<code>throw_on_early_termination=True</code>','两个 rank 各报耗尽相关错误，都只更新一次'],
 ['按初始进程数平均','<code>model.join(divide_by_initial_world_size=True)</code>，梯度 −7 / 2','rank 0 更新到 2.375，退出后两边参数均为 2.375'],
 ['按活跃进程数平均','<code>divide_by_initial_world_size=False</code>，梯度 −7 / 1','rank 0 更新到 3.25，退出后两边参数均为 3.25']
 ])+
 p('<code>join()</code> 让提前读完的 rank 留在通信组里，代为参加 DDP 自己预期的集合操作。归约时它没有本地数据梯度，相当于在求和中加 0。分母取 2 时，第二步仍把每个有效样本梯度乘以 1/2。取 1 时，唯一剩下的样本在这一步得到全权重。先决定尾部样本应占多少，再选参数。用户额外发出的集合操作也需要匹配，存在这类操作时可启用耗尽即报错，再按业务策略处理。')+
 p('如果每步还要手写一次有效数归约，短进程也要参加这次调用。<a href="/article/data-pipeline/#sampler-matched-tail">用原来的 4 批和 3 批做一次配对</a>，看短进程怎样用空批走完第四步。')+
 p('退出时 DDP 同步模型参数。按初始进程数平均的那组，rank 0 的动量走了两步，变成 −5.5。rank 1 只更新一次，动量仍为 −4。让两边下一步都读目标 5，归约梯度都为 −2.625，结果却分别更新到 3.71875 和 3.53125。随后回到同一模型快照，显式把 rank 0 的动量广播给 rank 1，两边重新更新后才都得到 3.71875。真实训练跨边界接续时，还要核对所用优化器、学习率计划、输入与随机状态。')+
 p('保存检查点前，把模型和优化器状态对应到同一次已完成更新，再确认下一批输入的位置。<a href="/article/checkpoint-recovery/#checkpoint-ddp-optimizer-state">带着这两个 rank 的记录检查续训状态 →</a>')+
 p('解压后用带 CPU/Gloo 的 PyTorch 2.5.1 环境执行 <code>python -B ddp_uneven_join.py &gt; replay.json</code>。先读 <code>steps</code> 确认真正执行的更新数，再对照 <code>after_iterator</code> 与 <code>next_balanced_step</code>。本机实验验证两个 CPU 进程和固定的 SGD 动量。本机约 4 秒的 Gloo 超时只用于结束反例，不能用作生产延迟阈值。')+
 '<p class="practice-links"><a href="labs/ddp-uneven-join.zip" download>下载完整实验包 ↓</a> · <a href="labs/ddp-uneven-join/ddp_uneven_join.py">跟读完整源码</a> · <a href="labs/ddp-uneven-join/README.md">环境与复跑说明</a> · <a href="labs/ddp-uneven-join/validation.json">查看两进程实跑记录</a></p>'+
 '<p class="source-at"><a href="https://docs.pytorch.org/tutorials/advanced/generic_join.html">PyTorch Join 通信与提前终止 ↗</a></p>';
 ddp.updated='2026.11.12';

 const lab=select('training-lab',['先讲清：恢复的是下一次更新所需的状态','两套基准，各自检验一件事','实战：一条入口，三次独立训练','先读日志，再看“完全相同”具体比较什么','三个反例：错误原因和拒绝结果必须对得上','出现差异时，从第一个不同字段定位','本机通过后，怎样进入两机四卡']);
 const l=lab.sections.map(s=>s[1]),l3=blocks(l[2]),l4=blocks(l[3]),l6=blocks(l[5]);
 if(l3.length!==2||l4.length!==1||l6.length!==1||figures(l.join('')).length!==1)throw Error('Training capstone preserved material changed');
 rewrite(lab,[
 p('这次把完整训练当作一条可接续的过程：两个worker分别取数，每两个小批形成一次128条全局样本的更新；每轮完成8次实际优化器调用后，保存轮末状态。worker退出后，由新进程读取这份状态，从下一轮继续。实验用同一个终点比较两条路径：连续训练四轮，以及训练两轮、保存退出、重新启动到第四轮。',
 '检查点是一组属于同一训练边界的状态。下一次更新先由输入位置决定读取哪些样本；前向计算同时使用当前参数和随机源产生的Dropout掩码，反向得到梯度后，再由Adam历史参与参数更新。因此保存时把这些对象放在一起，恢复时也一起接回。')+
 table(['共同恢复的对象','下一步怎样使用'],[
 ['model','读取当前参数及必要模型缓冲，计算前向与梯度'],
 ['optimizer','恢复Adam的一阶、二阶矩量、步计数与参数组配置'],
 ['scaler','恢复所用精度的缩放状态；本章FP32为空状态'],
 ['rng_by_rank','每rank各自恢复CPU与DataLoader随机源位置'],
 ['next_epoch','决定从哪一轮重新生成输入顺序'],
 ['signature','核对world size、设备、精度、组批、模型及数据配置']
 ])+
 p('本程序选择完整轮边界：本轮更新已结束，梯度已清空，next_epoch指向下一轮。较旧权重若配上较新输入位置，会漏掉尚未作用到参数的数据；当前权重若配初始Adam状态，下一步的更新规则也会改变。两条路径因而比较整组逻辑载荷。')+
 fold('选读：随机源为什么逐rank保存，为什么最后恢复',anchor('subsection-1-1b599gx')+p('固定种子规定随机序列起点，随机状态记录已经走到的位置。本程序分别使用固定数据生成器构造同一全集，使用采样种子与epoch决定全局排列，并用每rank独立随机流产生Dropout掩码。两个rank的数据生成规则相同，Dropout掩码仍可不同。DataLoader的generator也保存，本例num_workers=0。',
 '恢复时先创建数据、模型、DDP和优化器，加载训练状态，最后恢复对应rank的随机状态。模型初始化会消耗随机数，放在恢复RNG之前，才不会移动已经恢复好的下一次Dropout位置。之后用next_epoch调用set_epoch，重新生成本轮输入顺序。',
 '轮末先汇集两份小型RNG状态，由rank0连同完整模型与优化器保存，再同步保存完成。文件先写同目录临时路径、刷新后替换checkpoint.pt；这段流程覆盖本例POSIX文件路径，存储节点掉电与多文件提交另有条件。')),

 p('先固定要学的函数和输入，再谈两条训练路径是否接上。本章仍用1024条固定合成分类样本、128维输入、隐藏宽32、Dropout与AdamW。每个rank按同一全局排列分到512条，再分成16个32条小批；两个小批累积一次，一轮每rank实际调用优化器8次。')+
 table(['同一份工作量','计算','本章含义'],[
 ['全局样本','1024','每轮两rank合计处理的输入'],
 ['每rank小批','1024÷2÷32=16','每个进程的数据迭代次数'],
 ['完整更新窗口','16÷2=8','每rank本轮的尝试数与本次FP32实际调用数'],
 ['全局每窗样本','2×32×2=128','四份等长小批共同形成均值梯度']
 ])+
 p('验证分为两个互补问题：更新公式是否符合预定全局目标，以及保存前后的训练能否接续。连续与恢复调用相同训练代码，适合检验状态接续；若两路共同使用了错误标签或分母，也可能彼此相等，所以还需要独立目标与输入核对。',
 '并行策略章的'+links(l[1])[0]+'使用自己的三参数回归模型，把窗口有效目标数设为7、0、3，检查全局分母、尾窗、空窗与动量。它负责展示独立重算更新语义的方法。本章分类程序另有模型、数据和初值，比较结果分别解释。')+
 linkRow([links(l[1])[1]]),

 p('verify_run.py是这次实验的监督入口：它使用当前Python依次启动三次真正的两进程CPU/Gloo作业，等待前一次退出后再启动下一次。解压实验包，在已有PyTorch 2.5.1的环境直接执行下面命令；入口自身负责调用torchrun。数据由固定种子生成。')+l3[0]+
 p('入口给train_ddp.py显式传入samples=1024、hidden=32、batch-size=32、accum=2和CPU FP32。这些参数覆盖通用脚本的8192、256、64默认值，使本次实际程序与前面的128条全局窗口一致。')+
 table(['运行名','执行范围','本次进程实际调用'],[
 ['full','从初始状态连续训练第1、2、3、4轮','32次'],
 ['split','另从相同初始状态训练第1、2轮，保存并退出','16次'],
 ['resumed','新进程加载split轮末，从第3轮到第4轮','16次']
 ])+
 p('--epochs=4表示目标总轮数，next_epoch=2表示从第三轮继续，所以resumed只运行两轮。full与split使用独立输出目录，resumed读取split状态；比较的是两条各经历32次实际调用的训练路径。',
 '监督入口先创建临时检查点目录，作业完成后将退出码、日志、比较和反例写入指定JSON，再清理临时目录。每个受信子命令有60秒预算，超时对该进程组发停止信号，另给5秒宽限再按需强制回收。这是本实验的POSIX进程监督方式。')+
 linkRow(links(l[2]))+fold('展开完整verify_run.py：启动、等待、比较与三个反例',l3[1]),

 p('先沿日志读出两条路径的正常进展。每轮samples=1024、attempted_update_windows=8、applied_optimizer_steps=8；resumed的start_epoch为2，只打印第3、4轮。最终两路next_epoch都为4，rng_by_rank各含两个成员，然后比较器加载完整载荷逐字段检查。')+
 figures(l[3]).join('')+
 p('图中的累计实际调用数来自各轮日志相加：full为8、16、24、32，另一条路径先到16，再由新进程完成16次而到32。当前检查点保存next_epoch，未保存这条累计计数曲线；图没有用轮次反推未知精度下的历史实际调用。')+
 table(['比较器实际读取','本次固定两rank CPU结果'],[
 ['model、optimizer、scaler','逐项精确相等'],
 ['两rank随机状态、next_epoch、signature','逐项精确相等'],
 ['张量dtype、shape、每个元素','逐项精确相等'],
 ['耗时和吞吐','保留在报告中，不属于恢复状态相等条件']
 ])+
 p('比较器递归访问字典、列表与张量，并报告第一个不同字段。它检查逻辑状态，文件SHA256则用于标识下载源码或产物字节，两者回答不同问题。只核对模型参数还会漏掉Adam历史、随机源或输入进度，因此完整载荷全部参与比较。')+
 fold('展开完整compare_checkpoints.py：第一个不同字段怎样产生',l4[0]),

 p('成功路径走通后，每个反例只改变一个条件，并要求错误在对应位置出现。监督入口对临时测试副本操作，保留训练主脚本与原始对照。')+
 table(['只改变这一项','机制应在哪一步拒绝','已有CPU记录及本次复跑'],[
 ['accum从2改为3','每rank16个小批不能组成完整三批窗口，配置检查拒绝','退出1，匹配整除错误，无输出检查点'],
 ['hidden从32改为16，再加载旧状态','签名记录了模型形状，恢复检查拒绝','退出1，匹配配置签名错误，无输出检查点'],
 ['权重保持不变，只把一项Adam exp_avg加0.25','完整载荷比较在optimizer路径发现不同','先确认权重相同，比较器再退出1']
 ])+
 p('exp_avg是Adam保存的一阶梯度矩量，参与下一次更新；改变它即使暂时不改权重，也改变了继续训练的条件。第三个反例因此检验比较器能否看见权重之外的状态。前两个反例同时匹配具体错误信息，避免把缺包或路径错误当作预期拒绝。'),

 p('若自己的运行出现差异，从比较器指出的第一个字段回到正常路径：对象创建与配置检查→恢复载荷及随机源→set_epoch和小批窗口→轮末保存。每次只验证这一处所需的前置条件。')+
 table(['第一处证据','沿正常流程回查'],[
 ['resumed从0开始','--resume路径、加载分支与start_epoch'],
 ['恢复后轮数多于两轮','--epochs总目标与next_epoch起点'],
 ['模型相同，optimizer不同','矩量和参数组是否加载，是否多执行一次step'],
 ['随机状态或下一批不同','对应rank的RNG、sampler轮次、初始化与恢复顺序'],
 ['样本相同，梯度统一差一个倍数','全局目标分母、DDP平均与累积除数']
 ])+
 p('本章train_ddp.py与'+links(l[5])[0]+'逐字节一致。下面完整源码中，先找数据生成与模型初始化，再找no_sync包住前向和反向的位置、实际step回调、轮末RNG收集，最后沿resume分支核对加载顺序。固定规模程序通过签名拒绝配置变化；需要弹性规模或分片重排时，应另外定义恢复协议。')+
 fold('展开完整train_ddp.py：按正常流程核对恢复分支',l6[0]),

 p('本章实际保存的是rank0写出的单个torch.save文件，其他rank读取同一完整状态。'+links(l[6])[0]+'中的原生分布式检查点DCP实验使用自己的train_dcp.py与run_lab.py，固定同一1024条样本工作量，比较同步DCP目录保存两轮、由新进程加载再到四轮，与原torch.save连续四轮的结果。两套程序、命令、产物格式与记录分别保留。',
 'DCP让参与rank共同保存和加载目录里的状态。该独立夹具把训练对象包装为Stateful：保存或加载准备时由state_dict提供状态，加载后由load_state_dict把读回的状态写回对象；它额外导出的comparison.pt只供比较，恢复入口仍读取DCP目录。该记录覆盖两rank CPU/Gloo同步保存与新进程加载。')+
 table(['向下一层迁移','保持同一训练逻辑，同时增加的条件'],[
 ['单机GPU','可见设备与LOCAL_RANK绑定、目标精度和算子数值'],
 ['真实两节点','共同world与rank、会合、物理网络与NCCL、共同持久路径'],
 ['GPU或分片恢复','相同提交点、输入进度、状态布局及明确数值契约'],
 ['Kubernetes作业','资源形状、卷、共同启动、成员失败和取消回收'],
 ['性能与质量','有效工作量、预热和正式窗口、任务指标及总成本']
 ])+
 p('这次split在第二轮末正常退出，resumed由新进程接续；轮中故障按最近提交轮末重做。本章两rank的逐项精确结果只对应上述固定CPU条件。多机章的四rankCPU扩展保留了严格位级比较失败，并单列其程序的数值容差结果；它既不能被这里的两rank结果覆盖，也不能替代真实GPU或跨主机恢复证据。')+
 linkRow(links(l[6]).slice(1))
 ],'用完整两进程CPU程序比较连续四轮与两轮后恢复到四轮，沿输入、实际更新、轮末状态和三个反例读懂恢复条件。');
})();
