/* Read a training job as an object, then follow its resource and execution lifecycle.
   Load after the existing lessons and before first-reading-flow.js. */
(()=>{
 const p=(...rows)=>rows.map(row=>'<p>'+row+'</p>').join('');
 const t=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const anchor=id=>'<span class="legacy-subsection-anchor" id="'+id+'" aria-hidden="true"></span>';
 const fold=(title,body)=>'<details class="full-code"><summary>'+title+'</summary>'+body+'</details>';
 const blocks=html=>[...html.matchAll(/<div class="code-block">[\s\S]*?<\/pre><\/div>/g)].map(m=>m[0]);
 const figures=html=>html.match(/<figure\b[\s\S]*?<\/figure>/g)||[];
 const links=html=>(html.match(/<p class="practice-links">[\s\S]*?<\/p>/g)||[]).join('');
 const source=(url,label)=>'<a href="'+url+'" target="_blank" rel="noopener">'+label+' ↗</a>';
 const select=(id,titles)=>{
  const a=articles.find(x=>x.id===id);
  if(!a||a.sections.length!==titles.length||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Training platform source changed: '+id);
  return a;
 };
 const replace=(a,bodies,ids,desc)=>{
  const before=a.sections.map(s=>s[1]).join(''),after=bodies.join('');
  const pre=html=>html.match(/<pre\b[\s\S]*?<\/pre>/g)||[];
  if(bodies.length!==a.sections.length)throw Error('Training platform section count changed: '+a.id);
  if(JSON.stringify(pre(before))!==JSON.stringify(pre(after)))throw Error('Training platform original code changed: '+a.id);
  if(JSON.stringify(figures(before).slice().sort())!==JSON.stringify(figures(after).slice().sort()))throw Error('Training platform original figure changed: '+a.id);
  for(const m of before.matchAll(/\bid=["']([^"']+)["']/g))if(!after.includes('id="'+m[1]+'"')&&!after.includes("id='"+m[1]+"'"))throw Error('Training platform anchor lost: '+m[1]);
  for(const id of ids)if(!after.includes('id="'+id+'"'))throw Error('Training platform published heading lost: '+id);
  const hrefs=[...after.matchAll(/\bhref=["']([^"']+)["']/g)].map(m=>m[1]);
  for(const m of before.matchAll(/\bhref=["']([^"']+)["']/g))if(!hrefs.includes(m[1]))throw Error('Training platform source URL lost: '+m[1]);
  bodies.forEach((body,i)=>a.sections[i][1]=body);
  a.desc=desc;a.intro=desc;a.updated='2026.11.08';
 };

 const platform=select('training-platform',['从一份训练脚本到一次可追踪运行','生命周期需要多个可解释的等待状态','先定义最小契约，再谈自动化','完成状态必须连接到产物','失败后的系统动作要可预测','交接给调度和发布时，协议要留下什么','交一份可核对的答案']);
 const a=platform.sections.map(s=>s[1]);
 if(blocks(a[2]).length!==1)throw Error('Training manifest code layout changed');
 replace(platform,[
 p('训练脚本描述怎样读数据、计算损失并更新参数。训练平台把这份程序、确定的输入、所需资源和完成条件组织成一个作业（job）：用户提交一项工作，平台安排它何时执行、怎样观察、失败后从哪里继续。本章把这项工作的记录称为 run；同一个 run 可以经历多次执行尝试 attempt。',
 '作业内部还可按职责划分 task，例如训练 worker 和评估器；同一职责启动几个实例，称为几个副本 replica。这里的副本是执行实例，是否各持完整模型取决于训练方式。rank 则是训练进程在通信组内的编号：一个 worker 容器可能启动两个 rank，因此“两个副本”不能直接读成“两个训练进程”。这些词在不同产品的字段中可能有不同命名，本章始终按这一对象关系解释。')+
 t(['本章的四卡示例','对应对象'],[['一次固定数据版本的微调','一个 run，记录代码、数据、配置和产物'],['两台节点，各一个 worker、各两张卡','worker 职责的两个副本，每副本启动两个训练进程'],['共同通信的四个进程','同一组中的 rank 0、1、2、3'],['节点故障后整组重新启动','仍属原 run，建立新的 attempt']])+
 p('提交接口另用幂等键识别同一个客户端请求的重发。假设第一次已保存 run，但响应丢失；第二次在同一租户内带相同键和相同规范化内容，应返回原 run。第三次沿用原键却更改数据摘要，应报意图冲突。这个结果需要服务端原子登记键与请求摘要；展示名称相同并不能提供去重。键的作用域与保留期也是接口契约的一部分。'),

 p('正常路径从保存作业开始：队列按资源份额允许开始，调度器寻找节点，节点准备容器和存储，训练进程找到共同成员，随后执行第一次有效更新。会合（rendezvous）就是让进程用同一组启动信息找到彼此并建立进程组的过程；它发生在真正交换训练梯度之前。')+
 figures(a[1]).join('')+
 t(['阶段','已经发生的事','下一段工作'],[['提交接受','任务契约已保存','等待队列许可'],['队列获准','允许占用相应资源份额','找到可行节点'],['放置完成','工作负载已选好节点','准备设备、镜像、卷与进程'],['成员会合','进程建立共同通信组','取得输入、计算并更新'],['有效更新','按训练目标完成一次参数更新','继续训练并保存恢复点']])+
 p('用一份声明的时钟跟算：09:00 接受提交，09:12 获得配额，09:17 完成整组放置，09:20 所有 worker 会合，09:23 首次有效更新。总等待为 23 分钟，由 12+5+3+3 组成。若题设四张卡从 09:17 起全部占用，到首步已用 4×6/60=0.4 卡时；真实计费还需对照实际占用边界。',
 '查询记录应带当前 attempt、所在阶段、进入时间、阻塞原因与最后有效进展。容器运行只能证明进程已启动，不能据此填入“优化器已更新”。把相邻阶段的同一作业事件关联起来，才能定位这 23 分钟中的哪一段需要处理；跨节点绝对时钟还要考虑偏差。'),

 p('契约是平台与程序对同一项工作的共同约定。代码修订确定训练逻辑，镜像摘要确定分发内容，数据版本确定输入，输出位置确定结果写到哪里，worker 数和恢复边界确定怎样执行与继续。摘要是按内容计算的标识；URI 是资源位置的写法，写出位置并不证明资源可访问。下面保留最小字段示例。')+
 blocks(a[2])[0]+
 p('这份 JSON 中 workers=2 只声明两个 worker，没有声明每个 worker 的 GPU 数；它不能单独推出四卡布局。前节的四卡 run 还需每副本两卡、共同成员配置、CPU/内存、运行身份、重试预算和独立输出目录。平台从认证上下文确定主体与租户，再核对读输入、用队列和写输出的权限。',
 '可执行的字段实验位于 '+source('labs/systems/infra_lab.py','infra_lab.py 的 manifest_lab')+'：检查必填字符串、正整数 workers，以及 epoch/none 两种恢复边界；删除 data_version 时拒绝输入。'+source('labs/systems/validation.json','保留记录')+'只证明这些字段约束通过，没有访问示例 URI、镜像仓库或云权限。',
 '控制器是持续比较“期望”和“观察”、并推进下一步的程序。若创建 worker 的写入已成功而响应丢失，重试应按 run 与 attempt 的稳定身份查到已有对象。可将 run 与待处理事件放在同一元数据事务中，再异步交接；事件重复时仍取得原执行组。这个设计把一次请求与底层多次通信分开，训练产物还需自己的提交协议。'),

 p('训练程序完成更新后，会产生两类常用结果。检查点保存继续训练所需的参数、优化器历史、随机状态与数据进度；最终模型包保存交付给评估或推理的内容，例如权重、模型配置和 tokenizer。tokenizer 负责把文本与词元编号相互转换，缺失它可能改变模型输入输出的含义。两类产物应分别声明版本和保留策略。',
 '正常完成顺序是：写齐必需文件，校验大小、摘要和格式，再提交一份完整清单。清单关联 run、attempt、训练 step 和输入版本，权威记录只指向已验证的版本。进程退出 0 说明程序报告正常结束；任务契约满足、评估达标和允许上线分别有自己的判定。',
 '例如只写完 weights 就退出，tokenizer 与输出配置仍缺失，发布器应拒绝这个不完整目录。再如旧 attempt 在新 attempt 启动后迟到报成功，提交端应核对当前有效 attempt 和作业期望状态；旧文件可留下排查，但不能改写当前产物引用。读者只读取完整提交的版本，才能在重试之间得到确定的结果。')+
 linkTo('checkpoint-recovery','把完整清单接回可恢复训练状态'),

 p('失败策略先回答“重新执行能改变什么”。暂时没有资源时继续等待；镜像名错误、输入摘要不符或权限被禁止时，先修正确定性输入；节点退出或短暂存储故障时，才按预算尝试恢复。预算可以同时限制次数与占用卡时，避免同一个错误反复消耗整组资源。',
 '本章的四卡训练采用固定成员规模：一个 rank 退出后，其余成员无法靠继续等待完成原来的通信。作业控制器撤销旧 attempt 的有效身份、终止旧组并回收资源，再从最近已提交且兼容的检查点协调启动新组。是否支持成员弹性变化属于另一套训练协议，不能靠增加重试次数获得。',
 '用户取消也进入这条状态机：先保存“不再执行”的期望，再停止成员、释放关联预留并确认清理。控制器重启或迟到事件到来时，仍以这条权威期望为准。保留首次异常、所属 rank、输入版本和最后提交点，才能解释两次 attempt 之间重做了哪些工作。')+
 linkTo('gpu-scheduling','继续看资源准入与调度'),

 p('把正常路径分给明确的负责方，才能知道一次交接完成了什么。控制平面保存作业意图和当前有效 attempt；队列管理获得资源机会的顺序和份额；调度器选择具体节点；节点执行面启动程序；训练程序报告成员与更新；产物提交端校验并登记结果。各方通过稳定身份关联同一 run。')+
 t(['交接','接收方需要的内容','返回的事实'],[['平台→队列','资源形状、租户与队列身份','等待原因或资源许可'],['控制器→执行面','当前 attempt、成员配置与输入版本','对象身份、实际节点与启动状态'],['训练→恢复存储','完整状态与一致的更新边界','可校验的恢复版本'],['训练→产物提交端','完整模型包、指标和摘要清单','满足任务契约的产物版本']])+
 p('例如控制器重启后，先读取 run 的当前期望及已有执行对象，再继续推进；不能仅因本地内存里没有 worker 记录就重新启动一组。发布超时后则先查同一清单是否已登记。状态查询和重复执行各有明确身份，系统才能在“响应丢了”时确定下一步。',
 '平台观测应把排队、启动、有效更新、重试卡时和产物提交连起来。一次请求被接收、一组 Pod 被创建和一个合格模型包被交付，描述的是三个不同结果；用户需要看到自己当前正在等待哪一个。'),

 p('练习沿同一个 run 复核整条链：前两次同键提交内容一致，第三次改了数据摘要；四卡 run 在 09:23 首次更新，旧 attempt 随后迟到报成功。先说明每条记录对应的对象，再计算等待与占用。')+
 fold('展开参考答案：身份、时间与产物',t(['问题','推导'],[['创建几个 run','前两次返回同一 run；第三次键与意图冲突'],['首步等待','09:00→09:23，共 12+5+3+3=23 分钟'],['题设首步前占用','09:17→09:23，四卡共 0.4 卡时'],['迟到成功','核对有效 attempt、取消状态与完整产物，旧事件不得覆盖当前引用']]))+
 p('最后把设计结论与实际程序对照：字段实验只验证声明；两进程训练恢复实验验证了固定边界下完整状态的继续执行。后者由 POSIX 进程组监督本机 CPU/Gloo 程序，先正常结束两轮，再启动新进程恢复，不是四卡节点故障演练。')+
 linkTo('training-lab','阅读完整恢复程序、记录与反例')
 ],[],'从作业、worker、rank 与 attempt 开始，沿提交、排队、执行和产物交付理解训练平台的职责。');

 const gpu=select('gpu-scheduling',['状态与职责：额度、获准、放置、就绪与进展','配额与借用：名义份额、flavor和公平','资源形状：单节点、拓扑与可行解','并发预留：快照、整组与失败回滚','多租户隔离需要多层配合','启动与恢复：就绪期限、失效与回收','队列策略：回填、预留与抢占代价','用用户等待时间衡量调度效果','交一份可核对的答案','实战与变化题：穷举参考及真实两进程争抢']);
 const g=gpu.sections.map(s=>s[1]),gc=blocks(g[9]),gi=['subsection-1-1eob7ee','subsection-2-1iahum4','subsection-3-1c3rqfk','subsection-4-m76720','subsection-6-hkgbar','subsection-7-rj185v','subsection-10-a5hs8s'];
 if(blocks(g[5]).length!==1||gc.length!==2)throw Error('Placement source code layout changed');
 replace(gpu,[
 '<div class="mechanism-core" id="gpu-placement-stages">'+anchor(gi[0])+
 p('训练作业提交的是资源请求：每个 worker 需要多少 GPU、CPU 和内存，以及哪些节点或互联条件必须满足。worker 是执行训练的实例；在 Kubernetes 中，Pod 把一个或多个容器作为整体放到同一节点。每个对象有唯一身份 UID；Pod 的 Ready 是它的就绪条件。',
 '队列保存待执行作业并决定资源机会；配额规定一个租户可占的份额；优先级表达工作获得机会的先后；放置决定具体去哪台节点。队列先给出资源许可，程序才有机会使用设备，这两层回答不同问题。',
 '正常流程中，作业先取得份额，再找到满足全部请求的节点；节点准备镜像、卷、网络与设备，成员会合后执行训练。预留是带身份的一笔资源承诺，用于防止同一份能力被重复答应；预留的究竟是额度还是具体节点，必须在对应系统里说明。')+
 t(['观察点','此时已知的事实','后续还要完成'],[['额度预留','账面为本作业留出资源份额','确认其他准入条件和节点可行性'],['队列获准','该作业满足当前队列准入条件','把各 Pod 放到节点'],['Pod 绑定','Pod 已选中节点','准备设备、镜像、网络和存储'],['Pod Ready / 训练会合','分别满足对象就绪与应用成员条件','完成正确的训练更新'],['首个有效更新','实际产生训练进展','提交恢复点并继续执行']])+
 p('Kueue 是 Kubernetes 上的作业队列系统。它用 Workload 等对象记录队列工作；Pod 的绑定与 Ready 来自另一层对象。上表是观察路径，不是一组通用 API 枚举，也不要求所有条件总按同一时刻出现。按 run、attempt、Pod UID 和 rank 关联记录，才能把“排队 20 分钟”定位到具体阶段。')+'</div>',

 anchor(gi[1])+
 p('配额分配的是资源使用份额。名义额度是租户在这套规则中的基准，借用允许它在条件满足时暂用其他份额。先用一份 32 卡题设计算：A、B 名义额度各 16，目前 A 用 12、B 用 4；A 新请求 16，获准后使用量为 28，超过自身额度 12。')+
 t(['检查','本题计算'],[['A 需要借多少','max(0,12+16−16)=12'],['B 账面剩多少','16−4=12'],['A 借用上限为 8','12&gt;8，配额检查拒绝'],['A 借用上限为 12','在本题可出借额度也为 12 时通过这层检查']])+
 p('这些数值只做份额判断，还没有给出设备位置。GPU 型号、显存和节点能力也会影响能否运行。flavor 表示一类具有指定属性的资源变体；例如模型需要某种 GPU，其他型号的空闲份额不能自动与它互换。',
 '在 Kueue 中，ResourceFlavor 描述资源变体及节点关联，ClusterQueue 配置相应资源的 nominalQuota、borrowingLimit 等额度；命名空间是 Kubernetes 组织对象的范围，LocalQueue 将其中的作业接到集群队列。cohort 是允许按规则共享份额的队列集合。真实借用还受这些关联、优先级和准入策略影响。'+source('https://kueue.sigs.k8s.io/docs/concepts/cluster_queue/','Kueue：队列额度与借用规则'),
 '借用不等于永久保底。B 重新提交时如何归还容量，需要由自然释放或抢占等规则确定；仅提高 A 的借用上限，无法改变下一节的节点形状。'),

 anchor(gi[2])+
 p('资源形状是请求怎样分布到 worker 和节点上。一个普通 Pod 的容器整体放在一台节点上，所以“两个 worker 各 8 卡”与“总计 16 卡”不同。拓扑进一步描述节点和设备之间的位置关系，如同机架、同网络域或 GPU 与网卡连接关系，它可能同时影响可行性与通信性能。',
 '四台各 8 卡节点的题设空闲为 [8,4,4,0]，总和 16；两个各需 8 卡的 worker 只有第一份能放下。把第二、第三台的 4+4 相加不能生成一台 8 卡节点。改为 [8,4,4] 三个 worker 可分别放到前三台，但这同时改变了成员和通信布局，训练程序也要支持。')+
 figures(g[2]).join('')+
 t(['约束','怎样判断'],[['GPU、CPU 和内存','每个 Pod 在同一候选节点上同时满足'],['设备 flavor','匹配程序要求的资源类型和节点属性'],['拓扑硬要求 required','指定的关系必须成立'],['拓扑偏好 preferred','按具体策略尽量满足，不能当作保证']])+
 p('另设 [8,4] 空闲，按顺序先放需求 4 再放需求 8。贪心把 4 放第一台会剩 [4,4] 并失败；回溯尝试另一种分配，可将 4 放第二台、8 放第一台。这说明一次尝试失败不等于没有可行解；更大规模搜索仍需权衡搜索成本与策略。',
 'Kueue 的拓扑感知调度 TAS 按已配置的拓扑域安排 Pod 集合，行为由节点标签、Topology、ResourceFlavor、作业要求及版本共同确定。同 rack 可能减少跨域通信，也可能减少可行位置；是否值得这样约束，还要观察目标训练的通信与更新时间。'+source('https://kueue.sigs.k8s.io/docs/concepts/topology_aware_scheduling/','Kueue：拓扑约束'))+
 linkTo('training-communication','复习集合通信、迟到成员与本地等待'),

 anchor(gi[3])+
 p('有可行计划之后，还要处理别人同时使用资源的情况。快照是某一时刻读取的资源状态；计划完成时它可能已经过期。若两个调度者都读到两台各空 8，并各自承诺 [8,8]，就可能把同一组容量承诺两次。',
 '成组预留把多个成员的承诺作为一个整体处理：要么完整取得，要么失败并撤销已做的变化。gang 调度通常表达一组成员协同获得运行机会的需求，具体保证由选定组件提供；它不能仅从“创建了两个 Pod”或“额度已获准”推导出来。')+
 figures(g[3]).join('')+
 p('本章用一个可执行的小边界解释并发仲裁。placement_reservations.py 将两节点账、分配和额度放入同一 SQLite 数据库：BEGIN IMMEDIATE 开始写事务，核对节点版本，逐节点扣减，再登记同一作业的两条分配并更新额度。第一节点扣减后注入失败，整笔事务回滚；两个本机进程从同版本竞争时，一个获准，另一个返回 stale_snapshot。',
 '这里真实执行的是两进程单库事务，资源是声明的整数槽位。Kubernetes 多个 API 对象不自动参加这笔事务；真实整组放置还要实现各自的预留、条件更新、超时与回收协议。即使承诺成立，设备准备和成员启动仍需后续观察。'),

 p('多租户是在同一平台上运行属于不同主体的作业。份额公平回答“谁能用多少、等多久”；安全隔离回答“谁能读写哪些对象、影响哪些执行”。给 A 十六卡配额，不能据此阻止 A 读取 B 的数据。',
 'namespace 即命名空间，用于组织 Kubernetes 对象与相应策略范围。运行身份和基于角色的授权 RBAC 管 API 权限，存储权限管数据读写，网络策略管允许的网络路径，节点与设备隔离限制共享的执行边界。网络策略能否生效，还取决于实际网络插件；这些机制各管一部分。',
 'GPU 共享也需说明单位：多个容器能看见设备，不足以证明它们拥有独立显存、性能和故障边界。日志与排队诊断同样有访问范围，应按租户限制模型名、数据集和输出路径的可见性。',
 '公平规则则要把借用和归还接起来：B 有新作业时，是等待 A 自然结束，还是按已配置优先级回收？反复抢占恢复代价高的任务，可能让账面分配很多卡时，却很少交付有效进展。应同时观察各租户长等待、获得的资源与恢复后的实际产出。'),

 anchor(gi[4])+
 p('资源获准后，启动也需要一个有限的等待期限。某 worker 的镜像拉取失败，其他 worker 可能已经占卡并等在会合处；一个 rank 读数据失败，其他 rank 随后的通信超时可能只是结果。先沿准备、成员建立和训练进展找到最早阻塞点，再决定回收、修配置或恢复。',
 'Kueue 的 waitForPodsReady 可对获准作业的 Pod 就绪等待设置期限，并在超时后按集成机制撤销准入、停止相应工作并重新排队；恢复就绪、是否阻塞后续准入等还有各自配置。Pod 就绪条件本身不能验证损失与梯度正确。具体选项应对照安装版本及支持的 Job 集成。'+source('https://kueue.sigs.k8s.io/docs/tasks/manage/setup_wait_for_pods_ready/','Kueue：就绪等待与重新排队'))+
 t(['情形','需要连起来的记录'],[['成员镜像失败','各 Pod 启动状态、等待期限、停止与额度归还'],['旧预留或事件迟到','作业身份、当前 attempt、预留版本'],['训练中一个 rank 退出','最早异常、剩余成员、恢复点与重做范围'],['取消后控制器重启','权威取消状态与尚待清理的资源']])+
 p('下面命令查询目标集群的对象和事件。只有安装了对应 Kueue API 才存在这些资源名；替换命名空间与对象名后，还要继续查看训练控制器和成员日志，确认是否完成有效更新。')+
 blocks(g[5])[0],

 anchor(gi[5])+
 p('优先级表达谁应先获得机会。队列优先级影响作业的准入顺序，Pod 的调度优先级影响节点调度；二者需要按集成规则衔接。抢占是撤下较低优先级工作以释放资源，能否使目标任务运行，仍取决于释放了哪些节点、原任务如何退出及恢复。',
 '回填则让短作业先利用等待期间的空隙，同时维护对大作业的承诺。设大作业要两台各 8 卡，第一台已空，第二台 12 分钟后释放。若第一 worker 立刻占住 8 卡等待，空占为 8×12/60=1.6 卡时，没有训练进展。',
 '平台可以为大作业保留未来的节点组合，让不会阻塞它的短任务回填。这样的承诺需要明确预计结束时间、能否撤销、预留是否锁定实际容量；若回填任务超时，原来预计的启动时间就可能落空。单看利用率增加，无法判断大任务是否被反复推迟。',
 '抢占还要计入最后一次检查点之后的重做和新 attempt 的恢复。下一节另设四卡作业，计算 6 分钟重做加 3 分钟恢复的代价；这份 0.6 卡时与本节 1.6 卡时来自不同题设。'),

 p('调度服务的结果是作业完成有效工作所花的时间和资源。正常记录从提交、队列许可、节点绑定，经镜像与数据准备、首次更新，到最终提交；每一段都可能成为等待的主要来源。比较方案时，应固定工作量、训练目标和硬件口径。',
 '另设一份抢占题：四卡作业从最近已提交恢复点又训练 6 分钟，重新启动并恢复需要占卡 3 分钟。按题设，重做加恢复为 4×(6+3)=36 卡分，即 0.6 卡时，尚未计重新排队与额外保存。高优先任务提前多少、低优先任务何时能完成，都应进入决策。',
 '抢占还必须释放目标形状所缺的具体位置。在不相干节点上腾出四卡，可能无法补齐一个需要两台各八卡的作业。若租户总能获准却没有可行节点，应该看放置与拓扑；若资源空着而小任务长期等，应看队列政策和资源类型。',
 '用同一观察窗口统计各租户的阶段延迟、长等待、占卡时间和有效训练进展。平均数可能掩盖长期饥饿，不同模型的 step 也不能未经归一直接相加。本章算例用于理解取舍，真实调度效果要在锁定版本和混合负载下测量。'),

 p('练习：A 名义额度 16、已用 12，想在 [8,4,4,0] 空闲分布上新增两个各 8 卡的 worker。先算份额，再逐节点放置；若考虑抢占一份四卡工作，说明需要它释放哪个位置，并计算题设的恢复代价。')+
 fold('展开参考答案：每一层独立判断',t(['判断','答案'],[['借用上限 8','新增 16 后使用 28，需借 12，因此不足'],['借用上限 12','题设配额层可过，节点形状仍不满足'],['如何让第二个八卡 worker 可放','释放能形成第二台完整八卡节点的具体资源'],['四卡工作重做 6 分钟、恢复 3 分钟','共 0.6 卡时，另核对公平、期限和恢复点']]))+
 p('变化题：把空闲改为 [8,8,0,0]，并假设两台均满足 CPU、内存、flavor 和拓扑约束。此时形状可行，但仍要通过额度、并发预留、启动和训练进展几个阶段；手算找到可行解只是其中一项证据。'),

 anchor(gi[6])+
 p('现在读实际程序。place 在声明的节点槽位上逐个尝试 worker，检查 GPU、每 worker 4 CPU、8GiB 内存、A100-fixture 标签，以及可选的同 rack 关系；失败时回退再试。这个 fixture 名称只是输入标签，程序不探测 A100 设备。reserve 另用真实 SQLite 事务处理并发承诺。')+
 gc[0]+
 t(['源码路径','保留记录中的结果'],[['place([8,4,4,0],[8,8])','无解；改为 [8,4,4] 得到前三台'],['[8,4] 上按 [4,8] 放置','贪心失败；回溯得到 4→第二台、8→第一台'],['只扣第一节点后注入失败','回到两节点各空 8、版本 0、额度 0、无分配'],['两个 spawn 进程竞争','记录中 job-Y 获准，job-X 为 stale_snapshot'],['成功事务提交后','两节点各空 0、版本 1，同一胜者两条分配、额度 16']])+
 p('两进程通过 barrier 从同一快照竞争。谁赢取决于运行次序，验收条件是恰好一组完整提交、另一组拒绝旧快照，而不是必须由 job-Y 获胜。源码还检查错误 flavor、CPU/内存不足及同 rack 要求，逐项改变输入可观察哪一道条件拒绝。')+
 fold('展开完整 placement_reservations.py：与下载源码一致',gc[1])+
 links(g[9])+
 p('这份程序验证有限放置搜索和本机单库事务，没有运行 Kueue、物理 GPU 或跨主机 gang 调度。真实 Kubernetes API 的配额拒绝、节点过滤与绑定已有独立的 kind 记录，可接着对照；它与本例回答不同层的问题。')+
 linkTo('scheduling-resources','读取单宿主 kind 的真实对象、条件和绑定记录')
 ],gi,'先区分队列份额与节点位置，再用配额、形状、拓扑和真实并发预留理解整组训练何时能够开始。');
 const kube=select('kubernetes-training',['平台需要满足的前提','单 Pod 两卡 Job 模板','parallelism=2 不等于两节点 DDP','调度与作业生命周期','作为生产准入前的检查','将整组作业写成可观察的状态机','交一份可核对的答案']);
 const k=kube.sections.map(s=>s[1]);
 if(blocks(k[1]).length!==1)throw Error('Kubernetes training code layout changed');
 replace(kube,[
 p('Kubernetes 把运行意图保存为 API 对象，再由控制组件推进执行。Pod 是一起放在一台节点上运行的容器集合；Job 用来管理有限工作，跟踪 Pod 的完成并按配置处理失败。控制器反复比较期望与实际状态，推进对象创建和清理。训练程序运行在容器进程中，Pod 本身不会计算梯度。')+
 t(['组件','在训练启动中的职责'],[['API Server','接收并保存通过校验和准入的对象'],['Job 或训练控制器','观察对象，创建和管理所需工作 Pod'],['scheduler 调度器','给未绑定的 Pod 选择满足条件的节点'],['节点 kubelet','协调运行时、卷与设备准备，启动和观察容器'],['训练进程','建立通信组，读取数据，更新参数并保存恢复状态']])+
 p('GPU 路径还需要兼容的宿主驱动、容器运行环境与设备插件。设备插件向 kubelet 报告设备并参与分配；节点由此公开可请求的扩展资源，如 nvidia.com/gpu。镜像包含训练代码与相应库，运行身份还须能读取数据并写检查点。请求到 GPU 数量，并不自动证明型号、拓扑或程序兼容。'+source('https://kubernetes.io/docs/tasks/manage-gpus/scheduling-gpus/','Kubernetes：GPU 资源声明'),
 '下面先把两个训练进程放进同一个两卡 Pod，弄清对象与进程的映射，再扩到多个 Pod。rank 是通信组内的进程编号，world size 是组内进程数；local rank 是节点内编号。容器 Running 表示容器在运行，Pod Ready 表示其就绪条件成立，它们都不等于首次有效更新。'),

 p('这个模板创建一个 Job，Job 管理一个 Pod；Pod 中一个 trainer 容器调用 torchrun，后者启动两个本地训练进程。torchrun 是训练进程启动器，负责给进程提供 rank 等启动信息。--standalone 使用本机独立会合；--nproc-per-node=2 指定本机两个进程。',
 '资源里 CPU request=2、内存 request=4Gi 用于节点可行性判断，memory limit=4Gi 限制运行时内存。GPU limit=2 在这种扩展资源写法下也作为相应请求；若同时显式写 GPU request 与 limit，二者必须相等。当前模板要占同一节点的两张设备，两个进程再正确选择各自的可见设备。')+
 fold('展开完整单 Pod 两卡 Job 配置模板',blocks(k[1])[0])+
 p('image 与 PVC 名称是待替换值：镜像需包含 /app/train_ddp.py 及依赖，PVC 是持久卷申领对象，必须存在并允许该 Pod 写入。卷挂到 /checkpoints 后，程序写入自己的 run 目录；Pod 删除后数据能否保留，取决于卷及存储生命周期。正式记录还要固定实际镜像摘要。',
 'restartPolicy: Never 表示失败容器不在原 Pod 内按该策略重启；backoffLimit: 0 将 Job 的常规失败重试预算设为零。它们没有让训练自动加载检查点。正常验收依次确认节点、设备、数据读取、测试写入与完整更新，再检查恢复入口。本模板尚未在 GPU 集群执行。'),

 p('parallelism 控制 Job 期望的并发 Pod 数，completions 指定所需成功完成数。原模板两者均省略时都默认成 1；若在提交前只添加 parallelism: 2，completions 仍为空，进入适合工作队列的模式，可以启动两个 Pod，各自的 standalone 仍会形成独立训练组。若希望固定完成两个单元，则把 completions 与 parallelism 都显式设为 2。两种方式都不会自动组成四 rank DDP，成员关系仍由训练启动协议决定。')+
 t(['两个 Pod 内的启动方式','实际进程关系'],[['各自运行 standalone 两进程','组甲 rank [0,1]，组乙 rank [0,1]，两个独立训练'],['共享会合信息、节点身份分别为 0 和 1','在固定两节点、每节点两进程配置下形成同一组 rank [0,1,2,3]']])+
 p('第二行要共同约定 nnodes=2、每节点进程数、可达的会合端点、run/attempt 和不同 node rank。固定配置下 world size=2×2=4，本地 rank 在每个节点仍为 [0,1]。Job 不会因为 Pod 标签相同，就替程序填齐这些条件。两个独立组也不能共用同一个可覆盖输出目录。',
 'Indexed Job 是 Job 的一种完成跟踪模式，不是另一种训练调度器。设置 completionMode: Indexed 后，完成单元具有从 0 到 completions−1 的索引；容器可经 JOB_COMPLETION_INDEX 取得它。程序可以把索引映射为任务分片或节点身份，但共同会合、端点发现和整组失败处理仍需实现。罕见情况下同一索引可启动多个 Pod，索引不提供外部写入只发生一次的保证。'+source('https://kubernetes.io/docs/concepts/workloads/controllers/job/','Kubernetes：Job 并发与 Indexed 完成模式')),

 p('从单 Pod 扩到一组 Pod，会新增两种协调：资源侧让成员及时获得合适位置，应用侧让它们属于同一个训练组。队列获准只回答前者的一部分；调度器还要逐 Pod 找到节点，训练成员也要完成共同启动。',
 '设三台候选节点各空 [2,1,1] 张卡，要求两个不同节点各提供 2 张。总量四卡，只有第一台满足一个完整 worker；后两台各一张不能合成第二台。即使队列给了四卡份额，第二 Pod 仍无可行位置。反过来，节点空闲但租户额度未获准，则等待发生在队列。',
 '应用验收另算一笔：每 rank 微批 64、累积两次、四 rank，一个共同更新处理 4×64×2=512 条样本。若实际为两个独立二进程组，每组每次更新只处理 256 条，并形成各自的参数状态；系统合计处理 512 条不能将两次更新合成同一个四卡模型。')+
 t(['要确认的关系','直接查看的内容'],[['资源位置','每个 Pod 的节点、资源请求、调度条件和事件'],['共同成员','同一 attempt 的 world size、global/local rank、会合配置'],['训练结果','匹配的更新序号、梯度操作与有效样本口径'],['恢复提交','唯一权威清单与各成员关联的状态版本']]),

 p('先说明整组如何失败，才谈自动恢复。本章选择固定 world size：一个 worker 退出后，其他 rank 的集合操作可能无法继续。恢复方先撤销旧 attempt、终止旧组并释放关联预留，再从最近完整提交点建立新 attempt。只补一个 Pod，不保证其余进程能与新成员重新组成原来的通信组。',
 'CRD（自定义资源定义）给 Kubernetes API 增加一种对象类型和字段规则，例如用一个对象描述训练成员及恢复策略。Operator 是带领域逻辑的控制器模式：观察这类对象，持续创建成员、整理状态并处理生命周期。安装 CRD 只增加了声明入口；是否真正会合、协同终止与恢复，取决于控制器实现及训练程序。'+source('https://kubernetes.io/docs/concepts/extend-kubernetes/operator/','Kubernetes：Operator 模式'),
 '一种实现方案是控制器管理整组 attempt，队列管理份额，scheduler 处理节点绑定，程序负责检查点和数值状态。它们可以组合，却不能互相替代。选型时把正常启动、单成员镜像失败、训练中退出和用户取消分别走通，确认哪一方停止旧组、释放额度、检查恢复版本和拒绝迟到提交。',
 '旧 Pod 可能在控制器认为它失效后继续执行。产物用 run、attempt、step 标识不可变内容，提交权威清单时再核对当前有效 attempt，才能限制迟到写入的影响。Pod 重建和删掉一个对象，并不撤销已经写出的外部数据。'),

 p('把实现写成可重放的状态机：保存作业→等待资源条件→创建当前 attempt 的成员对象→节点绑定与容器准备→应用会合→有效更新→提交检查点或最终产物。每次观察带对象唯一身份 UID、事件时间和 attempt，控制器重启后从权威期望与已有对象继续推进。稳定名称帮助找回旧对象，资源版本与条件更新帮助识别并发变化。',
 '可先对照本站已有的真实执行层证据。'+source('labs/runtime-scheduling/schedule_lab.py','schedule_lab.py')+'在独立 kind 集群创建一个控制面和两个工作节点：300m 配额已用 250m，再要 100m 被 API 拒绝且无第二 Pod；两个节点各报告 4 CPU，单 Pod 请求 5 CPU 时 Unschedulable、nodeName 为空；50m 小 Pod 则能运行。',
 '同一程序还观察反亲和与污点：第二个 Pod 初始无可行节点，加入匹配容忍后绑定另一节点；第三个即使有容忍，仍因两个主机域已占用而等待。'+source('labs/runtime-scheduling/validation.json','记录')+'来自 kind v0.33.0、Kubernetes v1.35.8 的'+source('https://github.com/CaptainGreenskin/infra-guide/actions/runs/42432475291','成功 CI')+'，对应固定'+source('https://github.com/CaptainGreenskin/infra-guide/blob/c79d2fa8f9bd172bcde615d87acdffd900c3511d/dist/labs/runtime-scheduling/schedule_lab.py','源提交')+'。',
 'kind 节点是同一 Linux 宿主上的容器，这些结果证明 API 准入、过滤和绑定；它们没有运行训练 Job、GPU、跨物理主机网络或训练 Operator。训练恢复则有本机 CPU/Gloo 和 POSIX 进程组的独立记录。两组证据分别支撑执行与恢复的一部分，实际多机平台仍要连接整条状态机。')+
 linkTo('scheduling-resources','继续阅读原生调度实验的完整程序与记录')+
 linkTo('training-lab','对照本机两进程训练恢复的状态检查'),

 p('练习：四卡份额已获准，候选节点为空闲 [2,1,1]，要求两个不同节点各两卡，先解释每个对象处在哪一阶段。另设两个成员均已绑定的场景：第一成员已启动、另一成员镜像失败，说明整组应如何退出。')+
 fold('展开参考答案：位置、成员与恢复',t(['问题','答案'],[['当前阻塞','只有一台可容纳两卡 worker；份额许可已通过，第二 Pod 无可行节点'],['共同训练','保持同一会合协议和 world size=4，核对各 global rank'],['启动失败','负责整组生命周期的控制器按期限终止或重排，回收设备和预留'],['恢复与迟到事件','从已提交检查点建立新 attempt，旧 attempt 无权改写当前进度']]))+
 p('再问一个变化：将节点改为 [2,2,0]，两份资源形状可放，是否已证明一个四卡训练？还需观察容器准备、共同进程组、一次 512 样本口径的有效更新和恢复提交。用这条正常路径检查组件组合，才能分清“声明了四卡”和“完成了四卡协同训练”。')
 ],[],'从 Pod、Job 与控制组件的职责出发，将两卡单 Pod、多个完成单元和共同训练组逐步连接到作业生命周期。');

 const kueueLab='<a href="/article/gpu-scheduling/#native-kueue-admission">沿同一个 Job 核对 Kueue 准入、节点绑定和两份输出 →</a>';
 platform.sections[1][1]+=p('下面的作业实验先从真实 API 记录分辨两种等待。配额不够时，Job 已保存但尚未创建 Pod。获得配额后，Pod 可以存在并继续等待合适的节点。两段等待需要查不同的对象。'+kueueLab);
 gpu.sections[0][1]+=p('第 10 节用同一个 Job 走过这几层。先让它等队列额度，再让已获准的两个 Pod 等节点。只改一个条件，观察实际状态怎样推进。'+kueueLab);
 const kueueReading='<h3 id="native-kueue-admission">额度获准后，Pod 为什么仍在等节点</h3>'+
 p('实验用两个 Job 区分两道门。作业用标签选择本命名空间的 LocalQueue，后者指向分配资源的 ClusterQueue。这个集群队列只给默认资源变体 200m CPU 额度。占位作业请求 200m，目标作业的两个 Pod 各请求 100m。只要占位作业还在运行，目标就得等。100m 是 CPU 请求单位，等于 0.1 CPU。')+
 trainingFigure('kueue-admission-path','同一 Job 先等额度，再等匹配节点，最后由两个完成索引输出结果。')+
 p('先看没有 Pod 的阶段。Kueue 为目标 Job 生成 Workload，记录资源请求与准入状态。实跑中，<code>QuotaReserved=False</code> 表示额度尚未预留，原因为 <code>WaitingForQuota</code>。目标 Job 仍暂停，控制器还没有创建它的 Pod。此时即使节点能提供空闲 CPU，调度器也没有目标 Pod 可处理。'+source('https://kueue.sigs.k8s.io/v0.20/docs/concepts/admission/','Kueue v0.20 的准入过程'),
 '让占位作业正常退出，目标 Workload 获准使用 200m，目标 Job 解除暂停并创建两个 Pod。两个 Pod 的 nodeSelector 要求节点带指定标签。此时没有节点匹配，所以它们的 nodeName 都为空，PodScheduled 为 False。队列处理完了自己的账，节点过滤仍在等待。')+
 p('只给实验的工作节点加标签，再看同一 Job 下的 Pod 绑定。这个 Job 指定 parallelism=2、completions=2 和 Indexed 完成模式。容器用 JOB_COMPLETION_INDEX 取得 0 或 1，各自处理一份固定输入。第 0 份计算 10+27=37，第 1 份计算 5+7=12。程序读取两份实际日志，按索引与输入独立核对总和 49，再检查 Job 完成。'+source('https://kubernetes.io/docs/concepts/workloads/controllers/job/#completion-mode','Kubernetes：Job 完成模式'),
 '排障时按顺序查。没有 Pod，先看 Job 是否暂停以及 Workload 为什么未获准。已有 Pod 却没有 nodeName，查看 PodScheduled、事件和节点标签。Pod 已绑定后，最后核对的是实际输出。两个完成索引在这里代表两项独立工作。共同训练还需要按约定建立通信组，并核对一次参数更新。')+
 trainingCode('在实验目录核对记录或创建独立 kind 集群复跑','SHELL',`python3 -B kueue_admission.py --check-record validation.json
python3 -B kueue_admission.py --output ./my-validation.json`)+
 p('记录来自 Linux CI 的单宿主 kind 集群。Kueue 和 Kubernetes 调度器真实执行，两个 CPU 容器分别求和。记录核对了等待节点时和执行完成后的 Pod UID，证明是原来两个 Pod 继续执行。学习共同梯度更新时，再对照<a href="/article/distributed-training/#section-1">分布式训练的进程与全局目标</a>。')+
 '<p class="practice-links"><a href="labs/kueue-admission.zip" download>下载完整实验 ↓</a> · <a href="labs/kueue-admission/validation.json">查看执行记录 →</a> · <a href="https://github.com/CaptainGreenskin/infra-guide/actions/runs/42567524901">核对 Linux CI ↗</a></p>';
 gpu.sections[9][1]=kueueReading+gpu.sections[9][1];
 kube.sections[2][1]+=p('可先运行真实 CPU 例子。两个 Indexed Pod 按各自的完成索引读取不同数据，输出 37 和 12。观察 Kueue 获准、Pod 绑定与 Job 完成，再对照本节的共同会合要求。'+kueueLab);

 platform.sections[2][1]+=
 '<h3 id="native-training-submission-preflight">实跑：重复提交为什么返回原作业</h3>'+
 p('发出提交后连接断了，客户端不知道平台是否已经接收。它重发同一租户下的提交键，平台先查登记。清单按固定的 JSON 键顺序编码后计算摘要，这份规范化摘要代表提交意图。只改变缩进或字段顺序，原始文件摘要会变，规范化摘要保持一致，平台返回原作业。换了数据摘要还沿用旧键，平台报告意图冲突。',
 '首次出现的提交键才继续检查实际输入。清单里的摘要回答“要用哪个版本”，文件路径只回答“去哪里读”。本机程序对训练代码、数据和基础权重计算 SHA-256。数据和权重即使保持同样的文件名与大小，内容变化也会被拒绝。子进程从标准输入接收刚刚校验的那份数据与权重，在更新前再次核对摘要。')+
 trainingFigure('training-submission-preflight','旧提交键检查意图，新提交键核对实际输入。两个拒绝分支都发生在启动 worker 之前。')+
 trainingCode('按提交键决定下一步','TEXT',`
查找 (租户, 提交键)
    已登记，意图摘要相同 → 返回原作业
    已登记，意图摘要不同 → 报告冲突
    未登记 → 检查代码、数据与基础权重摘要
               任一不符 → 拒绝，不登记作业
               全部通过 → 登记作业，启动 worker
 `)+
 t(['本机实跑','返回结果','累计 worker 启动'],[
 ['首次提交，再原样或换排版重发','完成并返回 run-001，两次重发都重用它','1 次'],
 ['新键仍钉住旧输入，但实际数据、权重或代码不同','分别拒绝数据、权重或代码摘要不符','1 次'],
 ['改用新数据的清单，仍带旧键','意图冲突，旧作业保持原样','1 次'],
 ['新清单与新数据一致，使用新键','完成 run-002，重发也只返回它','2 次']
 ])+
 p('子进程确实执行了一次参数更新。模型预测是权重乘以输入，初始权重为 1，步长为 1/8。首个作业的输入与目标是 (1, 3)、(2, 6)。用一半平方误差计算平均梯度，得到 [(1−3)×1＋(2−6)×2]÷2=−5，更新后权重为 13/8。新数据把目标改为 4 和 8，第二个作业的更新后权重为 31/16。分别核对两个权重和两条子进程启动记录，就能确认运行的是预期输入。',
 '实验用 SQLite 把查询和登记放在同一个本机事务。登记后、启动前若发生崩溃，还需要控制器重新读取已登记的意图，协调同一执行尝试。下一节继续用产物清单验证完成状态。这里的摘要只核对字节，云上的身份、存储和训练资源另有各自的验证。')+
 trainingCode('解压后用 Python 标准库复跑','SHELL','python3 -B submission_preflight.py > replay.json')+
 '<p class="practice-links"><a href="labs/training-submission-preflight.zip" download>下载可运行实验 ↓</a> · <a href="labs/training-submission-preflight/submission_preflight.py">查看完整源码 →</a> · <a href="labs/training-submission-preflight/README.md">复跑与检查 →</a> · <a href="labs/training-submission-preflight/validation.json">核对作业与进程记录 →</a> · <a href="https://www.sqlite.org/lang_transaction.html">SQLite 事务接口 ↗</a></p>';
 const nativeJobReading='<h3 id="native-kubernetes-gloo-job">让同一个 Job 跨两个工作节点更新参数</h3>'+
 p('前面的调度实验确认 Pod 能放到哪里，本节继续核对容器里的训练进程做了什么。给同一个 Job 两个完成索引，分别交给 rank 0 和 rank 1。索引说明控制器如何编号，rank 说明进程在训练组中的身份。实验让它们一一对应，然后检查这两个身份是否确实会合。')+
 trainingFigure('kubernetes-gloo-job','同一个 Job 先有一个 Pod 等节点，再让两份日志证明共同更新。')+
 p('先只给一个工作节点加实验标签。Job 要求两个 Pod 都选择带标签的节点，同时要求同一主机上最多放一个这样的 Pod。这条约束叫硬反亲和。观测到一个 Pod 已有节点名，另一个的 <code>PodScheduled=False</code> 且原因为 <code>Unschedulable</code> 后，再给第二个工作节点加标签。按 Pod 的 UID 前后比对，可以确认是原来等待的 Pod 继续推进。')+
 p('两个 Pod 启动后还要找到共同的会合地址。这里用无头 Service <code>ranks</code> 提供各 Pod 的 DNS 名字。它没有一个统一的虚拟 IP。Indexed Job 给 Pod 分配形如 <code>training-ddp-0</code> 的主机名，配上 Service 子域，两个进程就能把 <code>training-ddp-0.ranks</code> 解析到 rank 0 的 Pod IP。<code>publishNotReadyAddresses</code> 允许 DNS 在就绪检查通过前公布地址，进程用同一地址和端口建立 CPU 通信组。'+source('https://kubernetes.io/docs/concepts/workloads/controllers/job/#completion-mode','Indexed Job 的索引与主机名')+' · '+source('https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/#pods','Pod 与无头 Service 的 DNS'))+
 p('对照这次的原始记录。rank 1 自己的 Pod 地址是 <code>10.244.2.2</code>，两份日志的 <code>master_ip</code> 都是 <code>10.244.1.2</code>，与 rank 0 的 <code>after[0].ip</code> 一致。清单里的 <code>publishNotReadyAddresses</code> 允许在 Pod 就绪前公布地址。两份进程日志记录的是各自启动时实际用到的解析结果。<a href="/article/k8s-networking/#service-name-address-identity">回到容器网络，对照普通 Service 的虚拟入口和实际后端 →</a>')+
 trainingCode('从完成索引走到一次同步更新','PYTHON',`rank = int(os.environ["JOB_COMPLETION_INDEX"])
dist.init_process_group("gloo", init_method=f"tcp://{ip}:{port}",
                        rank=rank, world_size=2)
count = torch.tensor(targets.numel(), dtype=torch.float64)
dist.all_reduce(count, op=dist.ReduceOp.SUM)
(loss_sum * 2 / count).backward()
torch.optim.SGD(model.parameters(), lr=.1).step()`)+
 p('这里的 <code>count</code> 起初是本地样本数，归约后变成全局样本数 4。DDP 会平均两个 rank 的梯度，因此反向前把各自的损失和乘以 <code>2/4</code>。和<a href="/article/distributed-training/#section-2">训练章</a>用同一组目标：rank 0 处理 [0]，rank 1 处理 [3,3,3]。参数从 1 开始，四个样本的梯度是 1、−2、−2、−2，均值为 −1.25。学习率 0.1 时，新权重是 1.125。')+
 t(['在哪一层查','实际记录'],[
  ['节点放置','索引 0 先绑定工作节点，索引 1 为 Unschedulable。增加节点标签后，相同的两个 Pod UID 分别绑定到两个 kind 工作节点。'],
  ['通信与参数','两份日志的会合地址都解析到 rank 0 的 Pod IP。两个进程分别看到 4 个全局样本、−1.25 的梯度和 1.125 的新权重。'],
  ['作业结束','两个 Pod 均为 Succeeded，Job 条件为 Complete，并记录两个完成索引。']
 ])+
 trainingCode('解压后创建独立 kind 集群并复跑','SHELL','python3 -B observe_job.py --output ./my-validation.json')+
 p('复跑需要 Docker、kind 和 kubectl。实验发生在同一 Linux 宿主上的两个 kind 节点，使用 CPU/Gloo。训练结束后清理临时集群。GPU 设备、NCCL、物理机间网络和整组恢复需要各自的目标环境证据。')+
 '<p class="practice-links"><a href="labs/kubernetes-gloo-job.zip" download>下载完整实验 ↓</a> · <a href="labs/kubernetes-gloo-job/job.json">查看 Job 与 Service →</a> · <a href="labs/kubernetes-gloo-job/validation.json">核对 Pod 与训练日志 →</a> · <a href="https://github.com/CaptainGreenskin/infra-guide/actions/runs/42599803867">核对 Linux CI ↗</a></p>';
 kube.sections[5][1]+=nativeJobReading+
  p('两个索引完成后，再核对进程实际算出的结果。<a href="/article/training-communication/#native-job-collective-update">沿两份进程日志检查样本归约和权重更新 →</a>')+
  p('记录里的两个节点名说明 Pod 被调度到了不同的 Kubernetes 节点，两个节点仍在同一台 Linux 宿主上。迁到物理两机四卡时，先核对作业分配到的机器，再按四个 rank 的记录核对内核启动标记、整卡绑定和 NCCL 读回。<a href="/article/multinode-lab/#ddp-target-record-readback">用原始记录练一次物理两机预检 →</a>');
 gpu.sections[9][1]+=p('本节两份容器输出验证了独立任务的完成。下一步沿<a href="/article/kubernetes-training/#native-kubernetes-gloo-job">同一个 Job 的两节点共同更新</a>，用 Pod UID、会合地址、全局样本数和新权重依次核对放置与训练。');
 for(const chapter of [platform,gpu])chapter.updated='2026.11.09';
 kube.updated='2026.11.12';
})();
