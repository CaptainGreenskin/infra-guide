/* Mechanisms first; three independent experiments and their actual evidence boundaries. */
const spaDownload='<p class="practice-links"><a href="labs/storage-parallel-acceptance.zip" download>下载存储、张量并行与验收实验 ↓</a><a href="labs/storage-parallel-acceptance/README.md" target="_blank" rel="noopener">环境与逐项运行说明 ↗</a><a href="labs/storage-parallel-acceptance/validation.json" target="_blank" rel="noopener">实际记录与源码摘要 ↗</a></p>';
function spaSource(name){return '<details class="full-code"><summary>展开完整 '+name+'：与下载文件一致</summary>'+code(name,name.endsWith('.json')?'JSON':'PYTHON',storageParallelFiles[name])+'</details>';}
function spaProof(id){const [title,url]=sources[id],label=String(title).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));return '<p class="evidence-note">继续核对：<a href="'+url+'" target="_blank" rel="noopener">'+label+' ↗</a></p>';}
sources.s3GetObjectReference=['Amazon S3 · 条件与范围读取','https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html'];
sources.s3ChecksumReference=['Amazon S3 · ETag 与对象校验','https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html'];
{
 const a=articles.find(a=>a.id==='training-storage');
 a.desc=a.intro='先按对象、文件、块接口分清数据责任，再计算请求粒度、带宽与读取放大。用本机 HTTP 对照整分片与范围读取，核对同一批样本。';
 a.prereq='先读云网络与请求路径，了解文件读取。配套程序使用 Python 3.9+ 标准库。';
 a.objectives=['解释三种接口的组织、共享与恢复责任','用请求数、有效字节和带宽计算访问成本','对照索引、版本、范围和样本摘要的验证边界'];a.check=[...a.objectives];
 a.updated='2026.11.05';a.level='机制 + 实验';a.edition='访问协议对照';a.minutes=40;
 a.sections[2][1]+=figure('v32-storage-interfaces','接口把命名、布局、共享和发布责任分给不同层。具体一致性、锁、性能与故障语义仍按目标产品核对。');
 const first=a.sections[3][1].match(/<p>[\s\S]*?<\/p>/)?.[0];
 if(!first||!first.includes('一万个样本'))throw Error('Storage cost paragraph changed: review before replacing');
 a.sections[3][1]=a.sections[3][1].replace(first,para('先给串行模型写单位。请求固定成本 L 用秒，请求数 N 无量纲；响应体字节总量 D 与有效传输率 B 使用一致的字节单位。假设每请求固定等待与传输不重叠，且串行执行：')+
  code('本节的串行数量级模型，不是测量结果','TEXT','T ≈ N × L + D / B\nD = 10000 × 64 KiB = 625 MiB\nL = 0.005 s / 请求；B = 125 MiB/s')+
  table(['同一份 625 MiB 输入','逐样本读取','每 100 样本一个分片'],[['请求数','10000','100'],['固定请求成本','50 秒','0.5 秒'],['字节传输成本','5 秒','5 秒'],['模型总时间','55 秒','5.5 秒']])+
  para('表中的分片方案假设每次顺序读完整分片。它少付了请求固定成本，未减少这次完整扫描的有效数据总量。接下来改变访问方式，原结论就需要重算。'));
 a.sections[5][1]+=para('范围读取还需要区分对象身份与样本身份。读回一个 64 字节范围后，不能用这段字节的摘要去匹配整个 256 字节对象的摘要。可由可信清单绑定对象版本、范围偏移、长度及样本或块摘要；完整读取则另核对整对象。摘要用于检查字节，版本用于定位内容，发布者是否可信还需要单独保证。',
  '在真实 S3 中，ETag 是条件请求使用的实体标记，并不总等于对象 MD5。固定 versionId、If-Match 条件与校验和分别解决定位、条件匹配和完整性问题；一份多对象清单仍需完整发布。选择范围读取时，同时核对产品支持的范围形式、压缩是否可定位、索引版本和失败重读边界。')+spaProof('s3GetObjectReference')+spaProof('s3ChecksumReference');
 a.sections[5][0]='冷/热缓存、版本与范围要一起验收';
 a.sections.splice(a.sections.length-1,0,['实战：三份整分片与五次范围读取',para(
  '本次改用更小的独立夹具：20 个样本，每个 64 字节，每 4 个拼为一份 256 字节分片，共 5 份。选取 ID 为 0、1、6、7、17 的五个样本。样本横跨第 0、1、4 份分片，与前面 64 KiB 的串行模型不是同一组单位。',
  '第一路按需读完整分片，并在本次请求内缓存，因此同一分片只取一次。第二路按每个样本的索引发送一个 Range 请求。两路都用清单固定对象，核对样本摘要，再逐字节比较相同顺序的五个样本。')+
  figure('v32-storage-access-counts','实际本机 HTTP：整分片 3 次、768 字节响应体；范围读取 5 次、320 字节响应体。两路都交付 320 字节有效样本，不含响应头、索引和连接开销。')+
  para('整分片这次多取了 448 字节，却少发两个请求。范围读取少取无用响应体，但要付更多请求和头部开销。对于真实网络延迟、压缩与客户端并发，须在同一版本和样本访问模式下比较端到端结果；本图只测请求与响应体计数，没有计时结论。')+
  code('解压后进入 storage-parallel-acceptance 目录','SHELL','python3 shard_range.py --report storage-report.json')+
  table(['只改变一项','程序实际检查'],[['对象字节替换，继续使用旧清单','If-Match 不符，HTTP 412'],['对象未变，索引错误地指向下一个样本','HTTP 可返回正确范围；样本摘要不符'],['范围跨过对象末尾','HTTP 416']])+
  para('这份服务只实现本实验需要的 HTTP 子集。为了直观看到条件变化，夹具把整对象 SHA256 放进 ETag；真实 S3 没有这条通用约定。错误偏移的反例说明，状态码 206 和对象版本都正确时，仍需验证“这些字节是不是请求的样本”。')+spaDownload+spaSource('shard_range.py')]);
 a.refs.push('s3GetObjectReference','s3ChecksumReference');
 a.sections=a.sections.map(([title,body])=>[title,infraReadableHTML(body)]);
 cloudKnowledgeExplanations['storage-model']+=figure('v32-storage-interfaces','先分接口和责任。对象键、文件路径与逻辑块处在不同层，不能直接按“谁最快”排列；具体语义以产品协议为准。');
}
{
 const a=articles.find(a=>a.id==='tensor-parallel-math');
 const ps=[...a.sections[0][1].matchAll(/<p>[\s\S]*?<\/p>/g)].map(m=>m[0]);
 if(!ps[0]?.includes('ReLU(z)')||!ps[1]?.includes('简化FFN'))throw Error('TP opening changed: inspect prose order');
 a.sections[0][1]=a.sections[0][1].replace(ps[0]+ps[1],ps[1]+ps[0]);
 a.sections[0][1]=para('张量并行（TP）让多个工作进程合作计算同一层。下面先拆线性层的输入、权重与输出，形状按 XW 的数学约定书写；实战使用两个 CPU 进程验证同一分片规则。')+a.sections[0][1];
 a.desc=a.intro='从两个部分输出和两份输入梯度，推导张量并行的通信位置。用真实 CPU 两进程与未分片基线复核，再理解进程组、有效样本与流水空泡。';
 a.prereq='先读矩阵乘法、非线性与自动求导。实战基线 Python 3.12、PyTorch 2.5.1、CPU/Gloo。';
 a.objectives=['逐卡计算前向部分和与反向输入梯度','与完整基线比较参数梯度和一次更新','区分 DP/TP/PP 组与独立数据副本','在等时前向模型中计算填充与排空'];a.check=[...a.objectives];
 a.updated='2026.11.05';a.level='推导 + 两进程实战';a.edition='前向与反向对照';a.minutes=60;
 a.sections[3][0]='非线性与反向梯度：哪些贡献要先求和';
 a.sections[2][1]+=figure('v32-tp-chain-rule','图对应本节长度 2 的输入：先看上半部的输出部分和；下半部的两份输入梯度在下一节推导。程序实际用两成员 CPU/Gloo 组复核。');
 a.sections[3][1]+='<h3>反向要合并对同一个 X 的贡献</h3>'+para(
  '接着第三节带一次偏置的输出 Y=[12,5]，另设目标 t=[3,−1]，损失 L=0.5×Σ(Y−t)²。因此 dY=[9,6]。每张卡的局部输出都参与同一个 Y，局部路径收到同一份 dY；求和节点对每个输入的导数都是 1。',
  '本题 H 的四个分量是 1、2、2、4，均大于零，因此 ReLU 在这些点的导数是 1。改变输入让分量跨过零时，需要重算激活分支。下面把局部链式法则写全：')+
  code('两卡各计算自己的参数梯度，再合并输入贡献','TEXT','H_i = ReLU(X W_i)          # [1,2]\ndU_i = H_i^T dY           # [2,2]\ndH_i = dY U_i^T           # [1,2]；本题 ReLU 导数为 1\ndW_i = X^T dH_i           # [2,2]\ndX_i = dH_i W_i^T         # [1,2]\ndX = dX_0 + dX_1 = [9,6] + [30,36] = [39,42]')+
  table(['对象','rank 0','rank 1'],[['局部 dH','[9,6]','[15,18]'],['dW 的两列','[[9,6],[18,12]]','[[15,18],[30,36]]'],['dU 的两行','[[9,6],[18,12]]','[[18,12],[36,24]]'],['对同一 X 的贡献','[9,6]','[30,36]']])+
  para('W 和 U 的参数块不同，各自梯度保留在对应卡。X 却在两条路径中复用，所以它的完整梯度必须加上两份贡献。若误按两卡取平均，会得到 [19.5,21]；这不再是原函数对 X 的导数。DDP 中的平均约定不能直接搬到 TP 的部分和上。',
  '本题偏置在完整求和之后加入，db=[9,6]。若每张卡保存一份相同偏置副本，各副本应用这份逻辑梯度；不要把前向里重复加入的偏置当成需要再次求和的独立参数。一次学习率 0.01 的 SGD 后，W 左上角从 1 变为 0.91，也应与完整模型相同。');
 a.sections[7][1]+=figure('v32-pp-forward-slots','两阶段、四微批的等时前向模型：五个槽、八个工作阶段槽，利用率 8/10=80%。没有把它作为完整训练或真实 GPU 利用率。');
 a.sections.splice(a.sections.length-1,0,['实战：两个真实进程复核前向、梯度与更新',para(
  '本次启动两个实际 CPU 进程，使用 Gloo 后端完成 CPU 张量的集合通信。rank 是组内进程编号，每进程持有 W 两列、U 两行，局部自动求导，显式合并前向输出与输入梯度。使用与第三节相同的 X、W、U，并加入上节的偏置、目标和损失；旧标准库程序继续作为单进程数值参照。',
  '程序先用未分片的 PyTorch 自动求导得到完整基线，再按手算矩阵检查基线本身。两进程各自的局部参数梯度、合并后的 dX 和一次 SGD 更新逐项对照；数值容差为绝对 1e−12，dtype 为 float64。')+
  code('先准备独立 PyTorch 2.5.1 CPU 环境，再运行','SHELL','python tp_forward_backward.py --report tp-report.json')+
  table(['本次实际结果','值'],[['两份局部输出','[1,2]、[10,2]'],['加一次偏置的 Y / loss','[12,5] / 58.5'],['两份输入梯度贡献 / 合并值','[9,6]、[30,36] / [39,42]'],['各局部先加偏置，再实际归约','错误得到 [13,6]'],['参数梯度与单次更新','两 rank 均与完整基线相同']])+
  para('程序把普通 all_reduce 明确放在自动求导图之外：复制局部输出做归约得到 Y，计算 dY，再对仍持有本地图的 partial 调用 backward(dY)，最后合并 dX。这里没有宣称普通集合调用会自动替你构造正确的跨卡反向。它是一份显式链式法则参考，生产 TP 层需实现并验证自己的前反向契约。',
  '世界中只有这两个 TP 成员；八 rank 的 DP/PP/TP 组表仍是另一组教学坐标。没有 GPU、NCCL、多主机或性能证据。父进程只监督自己的受信子进程，超时后回收，不提供恶意代码隔离。')+spaDownload+spaSource('tp_forward_backward.py')]);
 a.sections=a.sections.map(([title,body])=>[title,infraReadableHTML(body)]);
 const point=infraKnowledgeDomains.flatMap(d=>d.points).find(p=>p.id==='tr-parallel');
 if(!point)throw Error('Missing parallel knowledge point');
 point.body=point.body.replace(/(<p>流水线并行[\s\S]*?<\/p>)/,match=>match+figure('v32-pp-forward-slots','图中另取两阶段、四微批，得到 8/10=80%；上文四阶段、八微批仍为 8/11。两者都只是等时前向模型。'));
}
{
 const a=articles.find(a=>a.id==='kairo-practice');
 a.title='Kairo 接入验收：任务、权限与结果证据';
 a.desc=a.intro='先把任务、权限与结果写成独立契约，再检查重复提交、断线、越权与假完成。用通用记录校验器练习十个反例，真实 Kairo 版本另行验收。';
 a.prereq='先读 Agent 运行时、权限与评估。通用校验只需 Python 3.9+；真实接入需要目标版本与接口。';
 a.objectives=['区分用户端、运行时、工具与业务验收的证据职责','用测试者契约核对允许结果和禁止效果','识别记录一致性与目标行为、来源真实性的边界'];a.check=[...a.objectives];
 a.updated='2026.11.05';a.level='机制 + 通用验收';a.edition='记录校验与待接入契约';a.minutes=40;
 a.sections[1][1]+=table(['谁提供','本次要证明的事实','不能单独替代'],[
  ['用户端','请求身份、参数摘要、当前会话','后台已完成'],['运行时','步骤、尝试、调度与停止请求','任务状态已经持久化'],['状态存储','原任务、回执提交边界与权威版本','外部工具实际生效'],['工具服务','受信主体、资源版本、读取或提交回执','最终业务答案正确'],['独立验收器','结果数值、引用来源、B 的版本与摘要','目标记录来源可信']]);
 a.sections[2][1]+=figure('v32-acceptance-sequences','声明的两条验收时序：重复传输仍关联同一任务，断线后查询原任务。不是 Kairo 实机记录；断线是否取消必须由目标版本声明。');
 a.sections.splice(2,0,['权限和标准答案由测试者提供',para(
  '把输入拆成两份。contract 由测试者控制，固定允许主体、资源、源版本、事件与答案；evidence 收集这次提交、工具回执、权威终态和业务快照。模型可以提出动作和生成结果，但不能给自己的结果改权限或改标准答案。',
  '本节另设一个可机械判分的只读日报：A 的三条事件值为 5、7、11，合计 23；结果至少引用两条已读事件，交付 session-17。B 的初始版本为 7，摘要固定。只读委托不允许写 A 或 B；越权尝试被拒时，还要确认拒绝响应没有带回私有数据。')+
  table(['可信契约字段','本例取值及用途'],[['request_id / 参数摘要','R1，绑定相同业务意图的重传'],['主体 / 资源 / 源版本','fixture-A / reports-A / A-v1'],['事件与结果','A-e1=5、A-e2=7、A-e3=11；total=23'],['会话 / 来源引用','session-17；至少两条，全部来自已读 A'],['禁止效果','无任何业务写入；B 版本与摘要不变']])+
  para('成功读取的回执要覆盖契约规定的来源版本和值。引用看起来合理而没有允许读取，不能通过；引用正确但 total=38，也要拒绝。B 内容未变但版本从 7 变 8，同样触发禁止效果检查，因为内容相同不能抹掉一次未授权写入的事实。',
  '本例参数摘要绑定一组固定字段与序列化规则。它帮助检测同请求换参数，不提供身份认证或通用 JSON 签名。证据导出器、主体来源与快照采集仍需要目标平台的可信链路。')]);
 a.sections.splice(a.sections.length-1,0,['实战：一份正例、十个反例，再看校验器的边界',para(
  '以下程序只读取声明的 JSON 夹具与独立契约，不调用模型、工具后端或 Kairo。先运行内置正反例，再用下载包里的两份 JSON 走同一个命令行入口。正例把两次传输关联到一个 T1，允许读 A、拒绝写 B，最终 total=23。')+
  code('在解压后的 storage-parallel-acceptance 目录执行','SHELL','python3 acceptance_record.py --report acceptance-report.json\npython3 acceptance_record.py --contract readonly-contract.example.json --evidence readonly-evidence.example.json')+
  table(['只改一项','必须出现的拒绝'],[['全部拒绝却生成像答案的文字','缺少允许读取'],['任务仍在运行，B 没变','原任务没有完成'],['B 摘要相同但版本提高','禁止快照发生变化'],['合法引用却把总数写成 38','业务总数错误'],['引用加入 B 的事件','来源不支持引用'],['重传产生第二任务 / 同 R1 换参数','逻辑任务数 / 请求意图不符'],['目标版本仍写“待接入”','目标版本没有绑定'],['拒绝响应带回 B 数据 / 只读任务写 A','拒绝泄露 / 只读效果违规']])+
  para('十项都核对具体错误码，不能把任意异常当成反例通过。输出 record_consistent 只表示给定记录与给定契约相容，provenance_verified 始终为 false。把 source 改成 target_export 并填一个版本字符串，仍不能让程序证明记录来自真实目标；版本字段用于定位，不是来源证明。',
  '迁移到 Kairo 时，由实现者导出指定版本的真实记录，测试者独立控制夹具、快照与评分。保留通用校验结果，再补目标运行、记录真实性及真实禁止效果的证据。前一节的目标验收表仍保持待接入；本地夹具通过不会自动修改它。')+spaDownload+spaSource('acceptance_record.py')+spaSource('readonly-contract.example.json')+spaSource('readonly-evidence.example.json')]);
 a.sections=a.sections.map(([title,body])=>[title,infraReadableHTML(body)]);
}
