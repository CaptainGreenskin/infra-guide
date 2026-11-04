/* Original lessons. Keep knowledge before experiments and preserve chapter fragments. */
Object.assign(sources,{
 v21PodLife:['Kubernetes · Pod终止与强删的确认范围','https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination'],
 v21Probes:['Kubernetes · 探针动作与连续阈值','https://kubernetes.io/docs/concepts/workloads/pods/probes/'],
 v21DDP:['PyTorch 2.5 · DDP与no_sync','https://pytorch.org/docs/2.5/generated/torch.nn.parallel.DistributedDataParallel.html'],
 v21AMP:['PyTorch 2.5 · 累积、unscale与裁剪','https://pytorch.org/docs/2.5/notes/amp_examples.html'],
 v21Cancel:['MCP 2025-11-25 · 请求取消','https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation'],
 v21Temporal:['Temporal · Activity取消与等待','https://docs.temporal.io/activity-execution#cancellation']
});

const podProbeMechanism=infraReadableHTML(
 knowledgeSubhead('探针检查的是条件，触发的动作并不相同')+
 para('先把“正在运行”“可以接新请求”“还值得继续运行”分开。进程存在，只说明容器里还有进程；依赖没准备好时，它可能不能接业务；应用发生死锁时，进程又可能一直不退出。三个探针用不同动作处理这些情况。')+
 table(['探针','达到失败阈值后的动作','不能据此推出'],[
 ['startup：启动是否完成','触发该容器终止及适用的重启；成功前不执行所配readiness/liveness','启动成功就等于此后每个业务请求成功'],
 ['readiness：是否适合接流量','把相应就绪条件置为失败，继续探测；不因该失败重启容器','原有连接已断开，或者后台任务已停止'],
 ['liveness：是否需要结束此容器','触发该容器终止，按适用restartPolicy处理重启','一定生成新Pod，或者重启就能修复共享依赖']])+
 para('存活检查应足够便宜，判断“重启本进程有机会恢复”的局部故障。若把共享数据库的短暂失败当作所有前端的存活失败，就可能把依赖抖动放大成集中重启。就绪检查可以考虑必要依赖，但要定义依赖降级、连接池恢复和请求承载能力；直接堆叠昂贵查询也会反过来压垮依赖。容器重启次数增加与Pod UID变化，是两种不同证据。'));

const podProbeThresholds=infraReadableHTML(
 '<div class="mechanism-core" id="pod-probe-thresholds">'+knowledgeSubhead('连续计数与探测间隔，不能乘成严格恢复时限')+
 para('failureThreshold数的是连续失败，成功会打断连续失败；successThreshold数的是失败后恢复所需的连续成功。后者在startup和liveness上必须为1，readiness则可以大于1，用来抑制来回切换。periodSeconds描述探测间隔配置，timeoutSeconds约束一次探测等待，二者不是同一段时间。')+
 code('只看这组明确观测，不把估算当平台时限','TEXT',
 '实际开始时刻：0s、10s、20s\n每次都在1s后超时：1s、11s、21s\n连续失败阈值3：第3次失败在21s被观察到\n随后还要处理终止、宽限、适用的重启和重新就绪')+
 para('因此，3×10=30秒不能当作这组观测下的精确触发点，更不能当作业务恢复上限。实际起点、调度、探测响应、节点状态和重启退避都会影响时间；容器未就绪时，readiness还可能在配置间隔之外执行，以便尽早恢复。先用时间戳核对实际探测，再讨论恢复耗时。')+
 code('Pod spec片段 · 应用必须自己实现三个HTTP端点','YAML',
 'spec:\n  terminationGracePeriodSeconds: 30\n  containers:\n    - name: app\n      image: your-registry/app:tested-version\n      ports:\n        - containerPort: 8080\n      startupProbe:\n        httpGet: {path: /startup, port: 8080}\n        periodSeconds: 5\n        failureThreshold: 12\n      readinessProbe:\n        httpGet: {path: /ready, port: 8080}\n        periodSeconds: 5\n        timeoutSeconds: 1\n        failureThreshold: 2\n        successThreshold: 3\n      livenessProbe:\n        httpGet: {path: /live, port: 8080}\n        periodSeconds: 10\n        timeoutSeconds: 1\n        failureThreshold: 3')+
 para('这是API字段示例，不是可直接运行的完整工作负载；镜像名和端点需由自己的服务提供。本节没有运行Kubernetes集群，不能将示例阈值当作实测承诺。')+'</div>');

const podStopMechanism=infraReadableHTML(
 '<div class="mechanism-core" id="pod-stop-evidence">'+knowledgeSubhead('删除Pod时，入口、节点与业务各自完成')+
 para('删除请求先进入API，记录删除时间与宽限期。kubelet观察后推进本地终止；控制面同时更新相应EndpointSlice。两条路径异步进行，不能假定“先全部摘流，再立即发信号”，也不能靠一次固定sleep保证所有入口已经观察到变化。')+
 figure('v21-pod-stop','三条进度线：API意图、常规流量资格、节点进程退出。0秒从本题kubelet开始处理计，不代表跨组件精确同时。')+
 para('终止端点会标记terminating=true，通常ready=false，用于退出常规新流量选择；serving条件还能表达终止期间的实际服务能力。配置publishNotReadyAddresses等特殊路径时还需核对自身语义。代理更新有传播过程，已有TCP连接、长连接和正在执行的请求也不会因Ready变false自动消失。应用需要停止接新工作、完成或中止在途工作，并按协议关闭连接。',
 'preStop先于容器停止信号执行，而且消耗同一份terminationGracePeriodSeconds预算。本题从kubelet处理起算30秒，preStop用5秒，应用收到默认TERM后再排空20秒，在25秒退出；不能认为preStop之后还有新的30秒。停止信号也可能由镜像STOPSIGNAL或受支持的配置改变，必须核对实际配置。preStop超期时的一次小幅延长不是可长期依赖的业务预算。')+
 code('只读观察 · 在自己的命名空间替换名称','SHELL',
 'kubectl get pod app-pod -n study -o yaml\nkubectl get endpointslice -n study \\\n  -l kubernetes.io/service-name=app -o yaml\nkubectl logs app-pod -n study -c app --timestamps\n# 同时从请求侧记录：新请求失败、旧连接结束、业务操作回执')+
 para('强制删除API对象不等待kubelet确认原进程已终止。节点失联时，列表里消失的旧Pod仍可能在旧节点执行；为有状态写者建立替代实例前，还要处理旧写者隔离、卷和权威身份。正常容器退出也不回滚已经提交到数据库或远端工具的操作。验收要分别找入口证据、节点退出证据和业务回执。')+
 knowledgeCheck('readiness已经失败，为什么旧连接还在写数据库？','它改变常规流量资格，不是进程停止指令，也不撤销已建立连接。先核对真实请求和连接，再让应用在终止协议中处理在途工作；已经提交的结果另查权威回执。')+'</div>');

const updateNormalization=infraReadableHTML(
 knowledgeSubhead('一次更新对应一个全局目标，先把分母写出来')+
 knowledgeFormula('固定进程组、默认DDP梯度平均','本rank反传损失 = (W / N) × 本rank在整个窗口内的有效损失总和',
 'W为实际参与平均的进程数，N为本次更新内所有rank、所有微批次的有效目标数。DDP最后除以W，留下全局总梯度除以N。')+
 para('例如四个有效目标的梯度是2、4、6、8。rank0只有2，rank1有4、6、8；先算各自均值再平均，得到(2+6)/2=4，正确的全局均值却是5。两个副本即使一起更新到同一个错误参数，也没有证明目标正确。',
 '有效目标数必须与真实损失定义一致。语言模型要在标签移位和忽略规则之后数目标词元；若使用目标权重、序列级均值或多个损失项，分母可能是权重和或其他量，不能直接套词元数。下面可运行实验改用有效回归样本验证更新规则，不把样本数叫作语言模型词元数。自定义通信hook、join和不同进程组还会改变平均前提。'));

const updateWindowMechanism=infraReadableHTML(
 '<div class="mechanism-core" id="optimizer-update-window">'+knowledgeSubhead('尾窗、空窗与正常窗口，都要有明确更新规则')+
 para('微批次是一次取数据与前反向；累积窗口是一组共同贡献一次优化器更新的微批次。先按输入契约确定所有rank对齐的实际窗口，再统计整个窗口的N。在同一窗口里，每批损失总和都使用这个共同分母；已经按N归一化，就不要再次机械地除以名义累积数。')+
 figure('v21-update-windows','本例每个rank都有五个对齐微批次。不是某rank提前退出；本地零有效样本仍保持需要的反向与通信。')+
 table(['情况','本例怎么做','为什么'],[
 ['正常窗口：2批，N=7','前批no_sync，末批同步；随后裁剪、step','每批相加恰好形成一次全局均值梯度'],
 ['全局空窗：2批，N=0','所有rank一致跳过反向和step','避免除零，也不让动量等优化器状态空转'],
 ['尾窗：实际1批，N=3','这批直接同步，以实际N归一化','名义累积2不代表还存在另一份有效数据'],
 ['某rank局部为空','通过模型建立可微零损失，参与对应同步','一个rank跳过必要集合调用会让其他rank等待']])+
 para('no_sync必须同时包住前向与反向；只包backward，前向阶段的同步设置可能已按另一条路径准备。所有rank的同步点、调用次序和张量协议仍要匹配。这个实验用对齐输入检验空贡献，没有验证不等迭代数、动态分支或任意模型对空输入的支持；迁移时要按模型处理空输入。')+
 code('窗口循环的关键顺序 · loss_sum由实际有效目标构造','PYTHON',
 'N = global_valid_count(actual_window)  # 所有rank先完成同一计数归约\noptimizer.zero_grad(set_to_none=True)\nif N > 0:                              # 全体一致的决定\n    for i, batch in enumerate(actual_window):\n        sync = i == len(actual_window) - 1\n        with nullcontext() if sync else ddp.no_sync():\n            loss_sum = summed_valid_loss(ddp, batch)\n            (loss_sum * world_size / N).backward()\n    clip_grad_norm_(ddp.parameters(), 1.0)\n    optimizer.step()                    # 末次归约完成之后\n    actual_updates += 1')+
 para('也可以明确丢弃尾窗，但那是数据选择策略，必须记录丢弃多少有效目标。不能一边声称消费了所有数据，一边因只在整除点step而悄悄丢掉最后的累积梯度。')+'</div>');

const updateClipMechanism=infraReadableHTML(
 knowledgeSubhead('先得到全局梯度，再裁剪，再更新动量')+
 para('L2范数裁剪把过大的整个梯度向量按比例缩小，是非线性操作。两rank局部梯度为[6,0]与[0,2]时，先平均得到[3,1]，再裁剪到范数1，方向约为[0.94868,0.31623]；各自先裁剪再平均则约为[0.5,0.5]。方向已经不同，之后再同步也不能补回正确结果。这里的“整个”指本例复制式DDP各参数的联合范数；分片训练不能直接把本地分片范数当全模型范数。')+
 knowledgeFormula('本例SGD，无dampening、Nesterov与weight decay','vₜ = 0.9vₜ₋₁ + gₜ；θₜ = θₜ₋₁ − 0.1vₜ',
 'gₜ为全局归一化且按需裁剪后的梯度，初始v=0。即使当前没有有效数据，调用step也可能推进历史动量；因此空窗明确不step。')+
 para('接入自动混合精度（AMP）后，整个有效窗口保持相同缩放因子。所有缩放梯度累积并完成同步后，对同一优化器unscale一次，再裁剪未缩放的梯度，然后scaler.step、scaler.update。不能在窗口中间unscale之后再累积缩放梯度，也不能把scaler.update放到每个微批次。',
 'scaler.step可能因为非有限梯度跳过实际optimizer.step；它的返回值来自底层优化器，常为None，不能直接当“是否更新”的布尔值。学习率计划、更新计数和检查点要采用明确的实际更新口径，并保留缩放器状态。下方CPU/float64实验用计数优化器直接记录实际调用，未执行AMP或GPU溢出路径。')+
 knowledgeCheck('副本权重相同、loss也下降，还需比什么？','固定同一全局输入与目标，逐次对照裁剪前梯度、裁剪后梯度、参数、优化器状态和实际更新次数。一次错误可能被裁剪掩盖；尾窗低于裁剪阈值时再检查，可以暴露分母减半。'));

const cancelMechanism=infraReadableHTML(
 '<div class="mechanism-core" id="cancel-request-and-effect">'+knowledgeSubhead('取消请求、执行停止、效果提交，分别记账')+
 para('用户点击取消，表达“不再继续这项任务”。取消请求被持久记录，不代表工作进程已经收到，更不代表远端效果不存在。至少分别保存取消意图、执行者状态和操作回执。任务可以显示“正在取消”；不要刚写下一个标记，就把已经在途的发布、扣款或云任务显示为从未发生。')+
 table(['时点','处理方式','完成依据'],[
 ['尚未派发','条件修改待执行状态，阻止后续派发','派发与取消共享受保护的状态转换'],
 ['执行中，尚未提交','请求停止；执行者在约定检查点确认','停止确认、资源回收与效果查询'],
 ['效果已经提交','保留成功回执，说明取消到达过晚','同一操作身份的权威提交结果'],
 ['请求已发出，回执未知','停止新增写动作，按授权对账','远端回执、可核验结果或人工确认']])+
 figure('v21-cancel-commit','同一权威库内的两个先后顺序。图中的取消检查与效果提交有本地原子边界，跨系统时必须另行设计。')+
 para('在本地事务能够覆盖的范围里，可以让提交者加锁后先检查取消状态，再决定写效果与回执；取消先提交则阻止后续效果，效果先提交则返回已完成。这解决的是这份权威状态内的竞争，不是让本地任务表自动控制另一个工具的数据库。',
 '协作取消要求执行者轮询、接收取消信号或在等待点响应；CPU计算、阻塞调用和外部任务不一定立即返回。超时只说明等待预算耗尽；进程还活着、执行者已退出、外部任务已结束仍需各自证据。强制终止直接子进程后要回收它，不能据此宣称它创建的全部远端资源也已停止。')+'</div>');

const cancelRemoteMechanism=infraReadableHTML(
 knowledgeSubhead('协议通知不是业务回滚，补偿也不是改个状态')+
 para('MCP普通请求可发送notifications/cancelled通知，关联此前发出的同方向在途请求；接收方可能因已完成或无法取消而忽略。不要取消initialize；任务化请求使用tasks/cancel及其任务状态协议。传输层的取消与工具业务提交是不同层；本地取消通知已发出，不是远端零效果证明。',
 '持久工作流还需明确：请求取消后是等待执行者确认，还是继续走另一条分支。以Temporal普通Activity为例，取消的传达与心跳、SDK行为有关；执行代码也可能捕获取消后继续。设计等待策略时必须同时考虑资源清理和仍在途的效果，不能把工作流分支结束等同于所有Activity已停止。',
 '取消后不要为了“查成功没”自动重新发起写操作。用稳定op_id查询已有回执；查询也需要相应权限。查不到不能直接推出没提交，尤其当回执服务暂时不可用时。补偿则是新的业务动作，例如撤销已发布对象；它需要新的操作身份、明确授权、幂等与失败处理，原任务取消并不自动授予任意补偿权限。')+
 code('恢复分支示意 · lookup失败时仍保留未知，不重新写','PYTHON',
 'record_cancel_intent(task_id)\nrequest_executor_stop(task_id)\nreceipt = authorized_lookup(original_op_id)  # 超时/不可用须单独处理\nif receipt.committed:\n    keep_committed_result(receipt)\nelif receipt.definitely_absent and executor_stopped:\n    mark_cancelled_without_effect()\nelse:\n    keep_result_unknown_for_reconciliation()')+
 knowledgeCheck('任务已显示取消，怎么避免它又被恢复器重试写入？','恢复器先检查持久取消意图，停止发起新的业务写动作；原操作回执继续对账。取消检查与本地派发/提交需要条件更新或事务保护，远端已在途动作则需要对方的查询、取消或隔离协议。'));

function updateCancelCase(name,full=true){
 const r=updateCancelValidation.programs[name].result;const training=name==='update_windows.py';
 const rows=training?[
  ['实际进程与精度','2进程 · CPU/Gloo · float64 · PyTorch '+r.torch],
  ['窗口：实际微批次数 / 全局有效数','2/7 → 2/0 → 1/3'],
  ['实际optimizer.step调用',String(r.actual_updates)+'次；空窗参数与动量不变'],
  ['正确方案最后参数 [w0,w1,b]',r.single_process[2].parameters.map(x=>x.toFixed(6)).join(' / ')],
  ['逐次全局基线','裁剪前后梯度、参数、动量均在1e−11内一致'],
  ['局部均值负例','副本一致，但最终参数偏离全局基线'],
  ['固定名义尾窗负例','末次梯度减半，参数与动量偏离基线']
 ]:[
  ['派发前取消','CANCELLED；未启动worker；效果0'],
  ['提交前协作','请求后仍活着；确认取消并正常退出；效果0'],
  ['提交前不协作','请求后仍活着；终止并join、对账后标记取消；效果0'],
  ['提交后再取消','too_late_committed；终止进程后效果仍1']
 ];
 return infraReadableHTML(para(training?
 '本例从五个对齐微批次运行到两次真实更新，使用带偏置的三参数线性模型。每次都与独立单进程全局batch比较，两个错误方案作为反例；不沿用前一标量实验的初值或数据。':
 '本例用真实子进程、Event屏障和一个本地SQLite权威库。明确控制提交先后，再检查进程、状态和回执，避免用等待几秒猜测竞争结果。')+
 code(training?'在装有PyTorch的虚拟环境中运行':'Python 3.9+ · 标准库','SHELL',training?'python update_windows.py --output runs/update-windows.json':'python3 cancel_receipts.py')+
 table(['本次实际检查','结果'],rows)+
 (full?'<details class="full-code"><summary>展开完整'+name+'：与下载源码一致</summary>'+code(name,'PYTHON',updateCancelFiles[name])+'</details>':'')+
 '<p class="practice-links"><a href="labs/update-and-cancel.zip" download>下载更新与取消实验 ↓</a><a href="labs/update-and-cancel/'+name+'" download>下载本例源码 ↓</a><a href="labs/update-and-cancel/validation.json" target="_blank" rel="noopener">本次输出与源码SHA256 ↗</a></p>'+
 '<p class="evidence-note">'+(training?'实验目标为有效回归样本的平方误差均值；未运行语言模型、GPU/NCCL、AMP或跨主机训练。':'一个本地SQLite事务边界；没有验证远端工具原子取消、进程树清理、MCP/Temporal或Kairo集成。')+'</p>');
}

const priorRolloutKnowledge=cloudKnowledgeExplanations['health-rollout'].replace(/<p>startup 成功前[\s\S]*?<\/p>/,'');
cloudKnowledgeExplanations['health-rollout']=podProbeMechanism+podProbeThresholds+podStopMechanism+priorRolloutKnowledge;
infraDomain('training').points.find(p=>p.id==='tr-ddp').body=updateNormalization+updateWindowMechanism+updateClipMechanism;
const recoveryPoint=infraDomain('agent').points.find(p=>p.id==='ag-recovery');
recoveryPoint.body+=cancelMechanism+cancelRemoteMechanism;
recoveryPoint.title='持久执行：恢复、取消与效果回执';

{
 const a=articles.find(a=>a.id==='k8s-workloads');
 a.sections[3]=['三种探针：动作、连续阈值与故障放大',podProbeMechanism+podProbeThresholds];
 a.sections[6]=['排空与退出：逐条核对完成证据',podStopMechanism];
 a.refs=[...new Set([...a.refs,'v21Probes','v21PodLife'])];a.updated='2026.11.04';
}
{
 const a=articles.find(a=>a.id==='kubernetes-basics');
 a.sections[2][1]=podProbeMechanism;
 a.sections[4][1]=podStopMechanism;
 a.refs=[...new Set([...a.refs,'v21Probes','v21PodLife'])];a.updated='2026.11.04';
}
{
 const a=articles.find(a=>a.id==='distributed-training');
 a.sections[2]=['完整更新：归一化、尾窗与裁剪顺序',updateNormalization+updateWindowMechanism+updateClipMechanism];
 a.sections[7]=['真实两进程：从单步梯度走到状态更新',updateCancelCase('update_windows.py')+
  '<details class="full-code"><summary>选读：原标量梯度4与5、累积及空目标对照</summary>'+a.sections[7][1]+'</details>'];
 a.refs=[...new Set([...a.refs,'v21DDP','v21AMP'])];a.updated='2026.11.04';
}
{
 const a=articles.find(a=>a.id==='ddp-code');
 a.sections[2][1]+=knowledgeSubhead('不同窗口大小时，先核对真实更新边界')+
  para('本章固定训练程序的输入契约之外，不能默认每个窗口都恰好等长。下一组独立实验用7、0、3个有效目标，检查尾窗、空窗、裁剪与SGD动量；它使用自己的三参数模型与初值。')+
  linkTo('distributed-training','阅读完整窗口推导与双进程对照');
 a.refs=[...new Set([...a.refs,'v21DDP','v21AMP'])];a.updated='2026.11.04';
}
{
 const a=articles.find(a=>a.id==='agent-recovery');
 a.sections[4]=['取消、停止与提交：用回执决定状态',cancelMechanism+cancelRemoteMechanism+updateCancelCase('cancel_receipts.py')];
 a.refs=[...new Set([...a.refs,'v21Cancel','v21Temporal'])];a.updated='2026.11.04';
}
{
 const a=articles.find(a=>a.id==='durable-workflows');
 a.sections[7][1]+=knowledgeSubhead('取消分支结束，也要追踪执行者与原操作')+
  para('在途动作可能已提交。先持久记录取消意图，停止新增写动作，再通过原op_id查询回执；执行者停止与业务效果不存在需要分别证明。是否等待取消确认，是明确的工作流策略，不能从一个界面状态猜测。')+
  linkTo('agent-recovery','阅读取消状态、提交竞争与真实子进程实验');
 a.refs=[...new Set([...a.refs,'v21Cancel','v21Temporal'])];a.updated='2026.11.04';
}
cloudKnowledgeDomain('native').refs=[...new Set([...cloudKnowledgeDomain('native').refs,'v21Probes','v21PodLife'])];
infraDomain('training').refs=[...new Set([...infraDomain('training').refs,'v21DDP','v21AMP'])];
infraDomain('agent').refs=[...new Set([...infraDomain('agent').refs,'v21Cancel','v21Temporal'])];
const casesBeforeUpdateWindows=infraFieldCases.training;
infraFieldCases.training=()=>'<h3>完整更新：尾窗、空窗与优化器状态</h3>'+updateCancelCase('update_windows.py',false)+
 readLink('distributed-training','阅读推导与完整训练实验')+casesBeforeUpdateWindows();
const casesBeforeCancellation=infraFieldCases.agent;
infraFieldCases.agent=()=>'<h3>取消的完成证据：进程与效果分别检查</h3>'+updateCancelCase('cancel_receipts.py',false)+
 readLink('agent-recovery','阅读取消机制与完整程序')+casesBeforeCancellation();
