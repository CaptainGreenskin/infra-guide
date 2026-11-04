/* Coherent replacements inside existing topics. All examples and programs are original. */
Object.assign(sources,{
 v20CacheAside:['Microsoft · Cache-aside与一致性边界','https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside'],
 v20Outbox:['AWS · 事务outbox与重复投递','https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html'],
 v20SQLite:['SQLite · 事务与写入序列','https://www.sqlite.org/lang_transaction.html'],
 v20Scheduler:['vLLM · 分块预填充、预算与调优','https://docs.vllm.ai/en/stable/configuration/optimization/'],
 v16BEIR:['BEIR · 检索评估原论文','https://arxiv.org/abs/2104.08663']
});
const consistencyResult=name=>servingConsistencyValidation.programs[name].result;
const transportCostLesson=pdTransferLesson.replace('沿用每位置128KiB','本独立题设中，每位置KV为128KiB');
const cacheNormalPath=infraReadableHTML(knowledgeSubhead('先把正常读写路径画清楚')+
 para('旁路缓存（cache-aside）的读路径是：查缓存，未命中才读数据库，再回填。写路径是：提交权威数据库，再失效相应缓存。键要包含租户、对象和影响结果的查询条件；若不同主体能看到的字段不同，缓存命中后仍不能跳过相应授权。缓存保存的是可重建副本，不负责替数据库判定业务提交。'));

const cacheCommitWindow=infraReadableHTML(
 knowledgeSubhead('数据库已提交，失效事件还没到：先承认这个窗口')+
 para('订单A/O-104原为v7“待发货”。慢读者拿到v7，尚未回填；写者提交v8“已发货”，随后进程退出。调用方没有正常回执，仍需从原操作身份查询，不能把进程退出当回滚。此时源库已经是v8，缓存却仍可能命中v7。“防止旧值覆盖”与“每次都读到最新”是不同保证。',
 '另一条时间线中，即使删除已经成功，旧值也可能回来：R先读到v7，W提交v8并删缓存，R随后才回填v7。若60秒TTL（条目存活时间）从这次回填起算，旧值又获得了新的寿命。删除前后都成功，不代表不同组件的动作已经成为一个事务。',
 '若写库之后再单独发失效通知，退出可能让通知根本不存在。事务发件箱（outbox）把业务变化和待发送事件放进同一数据库事务：业务回滚，事件也回滚；业务提交，发布者之后还能找到事件。发布者把事件送到缓存接收方，再标记已发送；两个系统没有跨库原子事务，接收成功到源端标记之间退出，事件就可能重投。')+
 code('先保证业务与事件同提交，再处理外部投递','SQL',
 'BEGIN;\nUPDATE orders SET version = 8, state = \'shipped\'\n WHERE tenant = \'A\' AND id = \'O-104\' AND version = 7;\n-- 必须检查更新行数为1；以下事件与本次修改同属一个事务\nINSERT INTO outbox(event, tenant, id, version)\n VALUES (\'A:O-104:v8\', \'A\', \'O-104\', 8);\nCOMMIT;')+
 para('outbox保证可恢复地记录“要通知什么”，不让缓存瞬间同步，也不替业务接口实现重试幂等。还需监控未投递事件、最老事件年龄、错误重试和接收回执。业务成功后删除缓存只失败一次，也不能悄悄吞掉这次失败；必须留下能继续处理的记录。'));

const cacheVersionProtocol=infraReadableHTML(
 knowledgeSubhead('一个版本水位，怎样挡住重投、乱序和晚回填')+
 para('本例所有写入口都由权威数据库单调推进版本，事件来源可信。缓存接收方为每个“租户＋对象”保存最低可接受版本floor；缓存值另外保存自己的版本。接收失效时把floor提高到max(原水位,事件版本)，仅移除低于新水位的值。回填在同一受保护动作内同时比较水位和现有值，不能先检查、过一会儿再写。')+
 figure('v20-cache-floor','同一订单按事件9、8、9接收：水位只前进，旧事件不删除已经回填的v9。最后一行是独立的水位丢失负例。')+
 table(['动作','水位与缓存','判断'],[
 ['先收到失效9','floor=9；低版本值移除','可以确认已安装版本9的下限'],
 ['慢读者回填7','7＜9，拒绝','失效之后仍不会复活这份旧值'],
 ['回填源库9，再收到失效8','floor仍9，缓存9保留','旧失效不能把新结果一并删除'],
 ['重复收到事件9','按事件身份返回已有接收结果','同一事件ID换内容则报冲突'],
 ['只驱逐值，保留floor=9','慢读7仍被拒','值为空不等于历史水位为空']])+
 para('真正难的是水位的寿命。若值和floor一起过期或在重启中丢失，尚在途的v7就可能重新被接受；把TTL调长并不能覆盖任意长的暂停。要么能证明旧读者已排空，要么用受保护的新代际拒绝旧在途工作，或在允许回填前重建可信水位。只知道“缓存现在是空的”，不能推出“任意版本都可回填”。')+
 knowledgeSubhead('读者要的是最新、读己之写，还是允许旧几秒')+
 para('展示列表可以约定陈旧窗口，并从业务提交到实际读取计算；条目回填后才开始的TTL不是这份承诺。若调用方已经从可信写回执或权威查询确认最低版本8，则缓存7不能满足这次读取，应改走满足该要求的权威路径，或明确返回暂时不能确认。版本令牌只能约束最低版本，不能让落后的副本凭空追平。',
 '缓存故障时也要守住源站容量。若正常只有1%的请求回库，缓存全失效可能把回源需求放大到原来的100倍；这是假设请求量不变、原命中率99%的需求比，不是数据库吞吐必然增长100倍。按请求重要性限制回源、合并热点刷新，再核对队列、失败和用户读到的版本。')+
 knowledgeCheck('保留去重回执，却丢了版本水位，重投旧事件就能自动修复吗？','不能直接推断。接收方可能因事件已处理而只返回duplicate，水位却仍缺失。去重状态和水位的恢复必须一起设计；未重建下限前不要放行任意旧回填。'));

const schedulingContract=infraReadableHTML(
 '<div class="mechanism-core" id="serving-two-budgets">'+knowledgeSubhead('一轮算多少，与请求占多久，是两份预算')+
 para('连续批处理在迭代边界接入新请求、移除完成者。一次迭代里既可有正在解码的请求，也可有提示尚未处理完的请求。分块预填充（chunked prefill）把一个长提示拆开，让调度器有机会更早处理其他请求；它改变等待的分配，也可能增加调度与算子开销。')+
 table(['预算','限制什么','本例的明确规则'],[
 ['每轮计算预算','本轮实际送入计算的输入位置','最多40个：先给每个解码者1个位置，再安排prefill'],
 ['KV驻留预算','跨迭代保留的状态与预留增长','按最大长度完整预留；请求结束才释放'],
 ['单请求prefill上限','一个提示本轮最多处理多少','比较32和8，其他规则保持一致']])+
 para('一次prefill处理P个输入位置，最后位置的logits产生第一个输出。之后每次decode消费上一个输出，再产生下一个。若要求G个输出，本例需要G−1次decode，已处理KV位置上限是P+G−1；最后刚输出的那个词元尚未再次前向，不能同时算作已写入KV。')+
 knowledgeFormula('本例块长4、无共享与滑动窗口','预留槽位 = ceil((P + G − 1) / 4) × 4',
 '这是完整长度预留的教学策略，不是所有引擎的实际分配方式。模型权重和工作区另计；槽位换字节还需乘该模型每位置KV字节数。')+
 para('给KV池44个槽位。A的P=32、G=4，预留36；B的P=4、G=2，预留8。二者已用满44。C的P=8、G=2，要12槽；即使这一轮还能算更多，也不能把C放进这份已满的驻留预算。B结束只释放8仍不够，本例要等A结束，C才在7.6毫秒获准。永久大于整个KV池的请求应提前拒绝或分流，不能无限排队。',
 '本例G是上限，实际也恰好输出到上限。真实请求可能提前结束，完整预留会闲置部分空间；按需分配则要定义后续空间不足时的抢占、重算或其他路径。取消请求后，也要等计算与块引用按协议回收，再把容量重新分配；仅断开客户端连接，不代表后端已停止。')+'</div>');

const schedulingTradeoff=infraReadableHTML(
 knowledgeSubhead('改变分块大小后，谁获益、谁多等')+
 para('下面固定一个可手算的调度模型：每个prefill位置0.1毫秒，每个decode输入1毫秒，一轮耗时相加，输出在轮末交付。先安排已有decode，再用剩余预算处理prefill；新提示先于未完成提示。没有真实GPU、网络、kernel启动或计算重叠，数字用于检查因果与预算。')+
 figure('v20-serving-timeline','同一到达、预算与成本，只改单请求预填充上限。A持续输出更平稳时，B的首个输出反而更晚；圆点标记A的每次输出。')+
 table(['独立负载','整段上限32','分块上限8','应怎样解释'],[
 ['新短提示B的首输出等待','2.6毫秒','1.6毫秒','B更早进入一轮；A首输出由3.2变3.6毫秒'],
 ['长提示到来时，A的最大输出间隔','4.2毫秒','1.8毫秒','分块让A更频繁获得解码机会'],
 ['同一长提示B的首输出等待','5.1毫秒','8.1毫秒','B完整提示处理结束更晚'],
 ['第二组全部结束时刻','9.6毫秒','9.6毫秒','本模型没有省掉工作，只改变了谁在等']])+
 para('第二组A在0毫秒到达，P=4、G=6；B在0.5毫秒到达，P=32、G=2，KV池48槽。整段模式在1.4毫秒开始的一轮中做A的一次decode和B的32位置prefill：1+32×0.1=4.2毫秒，因此A从1.4等到5.6毫秒才再输出。分块后相应轮为1+8×0.1=1.8毫秒，但B要跨多轮才能产生首输出。',
 '实际调优要按输入长度、输出长度和租户切片，比较TTFT、输出间隔、达标完成率、抢占/重算与资源成本。不能把教学模型里9.6毫秒不变推广到真机：真实小批效率、启动、上下文读取和重叠会改变总耗时。短请求优先也可能饿住长请求，应另设等待与配额约束。vLLM文档可用于核对相应版本的分块与预算设计，不能把这里的成本和完整预留规则当作其实现。')+
 knowledgeCheck('一个请求只输出1个词元，这个模型还需要安排一次decode吗？','不需要。prefill末位置即可产生首输出，没有后续输出间隔。程序另外检查decode_steps=0、间隔为空，避免首输出重复记账。'));

const retrievalPoolMechanism=infraReadableHTML(
 '<div class="mechanism-core" id="retrieval-evidence-pipeline">'+knowledgeSubhead('候选分数高，还要先满足权限与版本')+
 para('用一份独立的数值日报跑通链路：A租户需要a-1/v1的10与a-2/v2的27，合计37。这两份才是任务要求的完整证据；金额样例只验证取证与交付，不证明另一场事故的原因。检索服务可以维护全局索引，但交给A任务的候选和正文必须遵守A的权限与本题当前版本要求。')+
 table(['全局排序：固定教学分数','归属 / 版本','对本题的作用'],[
 ['b-secret / 0.99','B租户','不能交给A任务'],
 ['a-2/v1 / 0.98','A，旧版本，值99','本题只允许当前v2'],
 ['a-note / 0.95','A，当前手册','允许访问，但缺少两项所需数值'],
 ['a-1/v1 / 0.90','A，当前，值10','必要证据一'],
 ['a-2/v2 / 0.85','A，当前，值27','必要证据二']])+
 para('若先全局取top2，再按元数据过滤，留下0项；后面的合法资料根本没有进入候选。若先按权限和版本缩小范围，再取top2，会拿到手册与a-1，仍漏a-2。适当扩大合法候选池，再按当前任务重排，才有机会把a-1、a-2同时放到前面。过滤顺序影响有效召回，不能只把召回数量调大就称为权限设计。',
 '关键词检索有利于精确名称和标识，向量召回有利于部分语义改写；混合召回还需去重与统一排序。重排只能重新排列已有候选，不能从空池里找出缺失证据。这里用按任务字段的固定规则重排，未测试embedding或语义模型效果。')+'</div>');
const retrievalPreparation=infraReadableHTML(knowledgeSubhead('切块、索引、检索与回答，各自留下什么身份')+
 para('先沿文档结构切块，保留标题、限定条件、表格和代码的必要上下文；片段需要带原文身份、版本、位置、时效和访问范围。索引负责找到可能有关的材料，回答负责把具体主张与这些材料对应。相似标题、检索分数和旧复盘都不能直接证明今天发生了相同原因。',
 '同一事实的多个重叠片段应按约定去重，避免把重复命中当成多份独立证据。正文、摘要、向量与缓存更新也要沿源版本关联；跳转引用应能找到支持那句话的原文版本，而不是一个已被改写的首页。'));

const retrievalBudgetMechanism=infraReadableHTML(
 knowledgeSubhead('排序命中之后，再检查真正送进上下文的证据')+
 para('本实验人为规定每段占8个正文预算单位，专门观察完整片段是否被保留。预算16可放a-1与a-2；预算12只放第一段，不能把后半段截掉后仍按完整证据计分。接入真实模型时，应使用实际tokenizer，并在正文预算之外先扣除指令、工具包装、历史和输出预留。')+
 figure('v20-retrieval-funnel','候选、排序、上下文和业务答案分别验收。两份必要证据都已排进前二，也可能在预算裁剪时丢掉第二份。')+
 table(['规则重排后的阶段','保留的必要证据','Recall@2','倒数排名RR'],[
 ['排序前二','a-1/v1、a-2/v2','1','1'],
 ['正文预算16','两份都在','1','1'],
 ['正文预算12','只有a-1/v1','1/2','仍为1']])+
 para('RR只回答第一项相关结果排在哪里，不回答必要材料是否齐全。预算12时，排序Recall是1、最终上下文Recall却是1/2；即使RR仍为1，也必须承认证据不足。不能把只读到的10当成完整总额，或凭记忆补上27。若允许继续取证，可在授权和任务预算内增加上下文或分步提取，再逐项保留来源。')+
 para('精确率（Precision）看前k项中有多少有效材料，召回率（Recall）看必要证据覆盖了多少，倒数排名（RR）只看第一项相关结果的位置。多个查询的RR按约定平均，才得到平均倒数排名MRR。先固定评估单位与分母，再比较检索器。')+
 knowledgeFormula('本题按两个固定位置和两份必要证据评分','Precision@2 = 命中数 / 2；Recall@2 = 命中数 / 2；RR = 1 / 首个相关位置',
 '两项分母碰巧同为2，是本题的设置。即使不足两条，Precision@2仍按2作分母；无命中时RR为0。真实评估还需定义查询集合、相关性标签和平均方式。'));

const retrievalPermissionMechanism=infraReadableHTML(
 knowledgeSubhead('取候选时合法，获取正文时还要再判断')+
 para('候选阶段的身份与资源范围不能由检索文本自己声明。正文获取时，按约定检查点重新判断当前授权和实际版本；程序专门在候选排好之后、取正文之前撤销权限，此时应返回denied，交给任务的正文数量为0。快照引用说明读过哪版，不会让已经撤销的读取权限继续有效。',
 '还要分清两种“先取后过滤”。可信服务只在内部取全局元数据，再过滤后返回合法正文，可能损失召回，却不等于已经泄漏正文。另一种实现先把B的正文交给A任务的执行上下文，之后才从最终列表删掉它，泄漏已经发生。程序把实际交给任务的正文逐项记账；这个负例最后即使返回“证据不足”，也必须因不当交付失败。',
 '合格答案同时检查：总额37、来源a-1/v1与a-2/v2、用户可见状态、当前任务允许的正文交付。排名、语言流畅或HTTP成功都不能替代这些条件。生产验收还应增加无答案、跨租户、撤权、索引滞后、引用跳转和长文截断样本；固定夹具通过不代表开放任务回答准确率。'));

function servingConsistencyCase(name,full=true){
 const r=consistencyResult(name);let description,rows;
 if(name==='cache_outbox.py'){
  description='源端与缓存端使用两个独立SQLite库。真实子进程提交v8后以23退出，随后人为安排9、8、9的失效投递与旧值回填。';
  rows=[['提交后退出','退出码23；源v8，缓存仍v7'],['事件前的最低版本读取','缓存7不满足最低8，权威查询返回8'],['业务回滚','没有留下那次outbox事件'],['乱序与重投','水位最终'+r.final_floor+'；重复事件'+r.duplicate_delivery],['晚回填 / 驱逐后再回填','两次旧v7均被拒'],['最终结果','缓存v9 / delivered；未投递事件0'],['独立水位丢失负例','v7重新被接受，暴露恢复前提']];
 }else if(name==='serving_scheduler.py'){
  description='固定同一工作与到达，只改prefill上限。程序输出每轮的接纳、计算、输出与KV预留，便于逐行复算。';
  const a=r.cases.new_short_prompt,b=r.cases.long_prompt_while_streaming;
  rows=[['第一组B首输出等待',a.whole.requests.B.ttft_us/1000+' → '+a.chunked.requests.B.ttft_us/1000+'毫秒'],['第一组A首输出等待','3.2 → 3.6毫秒'],['C的KV准入','两种策略都到7.6毫秒才获得12槽'],['第二组A最大输出间隔',b.whole.requests.A.max_gap_us/1000+' → '+b.chunked.requests.A.max_gap_us/1000+'毫秒'],['第二组B首输出等待','5.1 → 8.1毫秒'],['第二组全部完成','均为9.6毫秒'],['单输出与过大请求','零decode、间隔为空；永久超出KV池提前拒绝']];
 }else{
  description='五条固定文档、三种候选策略、两种正文预算。程序读取实际正文交付记录与最终答案，另注入候选后撤权。';
  rows=[['全局top2后过滤','合法候选0，未泄漏正文'],['先过滤再top2','Recall@2=1/2，缺调整项'],['规则重排＋预算16','合计37、两份来源、合格交付'],['规则重排＋预算12','排序Recall=1，上下文Recall=1/2，证据不足'],['先交付B正文再过滤','不当正文交付1次；最终拒绝文案不能抹除'],['获取正文前撤权','denied，正文交付0']];
 }
 return infraReadableHTML(para(description)+code('Python 3.9+ · 标准库','SHELL','python3 '+name)+table(['实际检查','结果'],rows)+
 (full?'<details class="full-code"><summary>展开完整'+name+'：与下载源码一致</summary>'+code(name,'PYTHON',servingConsistencyFiles[name])+'</details>':'')+
 '<p class="practice-links"><a href="labs/serving-consistency.zip" download>下载三个独立实验与说明 ↓</a><a href="labs/serving-consistency/'+name+'" download>下载本例源码 ↓</a><a href="labs/serving-consistency/validation.json" target="_blank" rel="noopener">本次输出与源码SHA256 ↗</a></p>'+
  '<p class="evidence-note">'+(name==='cache_outbox.py'?'本地SQLite与受控投递；不代表Redis/MySQL或线性一致缓存验收。':name==='serving_scheduler.py'?'固定成本的调度模型；未执行模型推理、GPU或vLLM。':'固定分数、规则重排与人为预算单位；未执行embedding、LLM或远端授权。')+'</p>');
}

// Knowledge remains before examples; prior article fragment numbers are retained.
cloudKnowledgeExplanations['cache-layer']=cacheNormalPath+cacheCommitWindow+cacheVersionProtocol;
Object.assign(infraDomain('platform').points.find(p=>p.id==='sv-batching'),{
 title:'连续批处理、分块预填充与准入',
 lead:'调度同时约束每轮计算与跨轮KV驻留；分块大小会重新分配请求的等待，首输出与持续输出需要分别验收。',
 body:schedulingContract+schedulingTradeoff
});
infraDomain('platform').points.find(p=>p.id==='sv-kv').body+=transportCostLesson;
infraDomain('agent').points.find(p=>p.id==='ag-retrieval').body=retrievalPreparation+retrievalPoolMechanism+retrievalBudgetMechanism+retrievalPermissionMechanism;

{
 const a=articles.find(a=>a.id==='cache-consistency');
 a.sections[2][1]=cacheCommitWindow;
 a.sections[3][1]=cacheVersionProtocol;
 a.sections[6]=['从事件回放走到真实事务',
  '<details class="full-code"><summary>选读：原四事件短回放</summary>'+a.sections[6][1]+'</details>'+knowledgeSubhead('再把业务、事件与接收回执写进真实SQLite')+servingConsistencyCase('cache_outbox.py')];
 a.sections[8][0]='四事件短回放的源码与结果';
 a.refs=[...new Set([...a.refs,'v20CacheAside','v20Outbox','v20SQLite'])];a.updated='2026.11.04';
}
{
 const a=articles.find(a=>a.id==='inference-performance');
 a.sections[2][1]=schedulingContract+schedulingTradeoff+'<details class="knowledge-check"><summary>选读：拆开Prefill与Decode后的交接下界</summary>'+transportCostLesson+'</details>';
 a.sections[5]=['逐轮运行调度，再核对指标',servingConsistencyCase('serving_scheduler.py')+'<details class="full-code"><summary>选读：原合成轨迹的指标计算实验</summary>'+a.sections[5][1]+'</details>'];
 a.refs=[...new Set([...a.refs,'v20Scheduler'])];a.updated='2026.11.04';
}
{
 const a=articles.find(a=>a.id==='agent-retrieval');
 a.sections[2][1]=retrievalPoolMechanism;
 a.sections[3][1]=retrievalBudgetMechanism;
 a.sections[4][1]='<details class="knowledge-check"><summary>迁移到原R27：三个证据点的检索评分</summary>'+a.sections[4][1]+'</details>'+para('数值日报与R27分别有自己的证据集合。前者要齐备10与27两项，后者要齐备延迟、变更与适用说明；不能把一个例子的Recall分母直接搬到另一个例子。');
 a.sections[5][1]=retrievalPermissionMechanism;
 a.sections[6]=['跑通从过滤到证据交付的链路',servingConsistencyCase('retrieval_pipeline.py')+'<details class="full-code"><summary>选读：原前五名指标计算程序</summary>'+a.sections[6][1]+'</details>'];
 a.sections[8][0]='前五名指标程序的源码与结果';
 a.refs=[...new Set([...a.refs,'v16BEIR','v16MCPSecurity','v20SQLite'])];a.updated='2026.11.04';
}
cloudKnowledgeDomain('cloud-data').refs=[...new Set([...cloudKnowledgeDomain('cloud-data').refs,'v20CacheAside','v20Outbox','v20SQLite'])];
infraDomain('platform').refs=[...new Set([...infraDomain('platform').refs,'v20Scheduler'])];

const fieldLabsBeforeConsistency=cloudFieldLabs;
cloudFieldLabs=id=>(id==='cloud-data'?'<h3>缓存同步：提交间隙、乱序与水位恢复</h3>'+servingConsistencyCase('cache_outbox.py',false)+readLink('cache-consistency','阅读机制与完整事务程序 →')+'<h3>存储与数据库恢复</h3>':'')+fieldLabsBeforeConsistency(id);
const platformCasesBeforeConsistency=infraFieldCases.platform;
infraFieldCases.platform=()=>'<h3>逐轮推理调度：谁在等，为什么</h3>'+servingConsistencyCase('serving_scheduler.py',false)+readLink('inference-performance','阅读调度推导与完整程序 →')+'<h3>模型服务与KV数值对照</h3>'+platformCasesBeforeConsistency();
const agentCasesBeforeConsistency=infraFieldCases.agent;
infraFieldCases.agent=()=>'<h3>检索链路：候选、上下文与合格答案</h3>'+servingConsistencyCase('retrieval_pipeline.py',false)+readLink('agent-retrieval','阅读取证链与完整程序 →')+agentCasesBeforeConsistency();
