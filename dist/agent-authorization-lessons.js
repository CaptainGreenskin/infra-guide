/* Preserve the original nine anchors and experiments; deepen the actual effect boundary. */
Object.assign(sources,{
 abAuthorization:['OWASP · 授权判断与实施位置','https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html'],
 abTransaction:['SQLite · 写事务、快照与BEGIN IMMEDIATE','https://sqlite.org/lang_transaction.html'],
 abMcp:['MCP 2025-11-25 · HTTP传输授权边界','https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization'],
 abRag:['检索增强生成 · 原论文','https://arxiv.org/abs/2005.11401'],
 abTokenizer:['tiktoken 0.12.0 · BPE与编码接口','https://pypi.org/project/tiktoken/0.12.0/'],
 abRagSecurity:['OWASP · RAG数据与权限边界','https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html']
});
function agentBoundarySource(file){return '<details class="full-code"><summary>展开完整源码 · '+file+'</summary>'+code(file,'PYTHON',agentBoundaryFiles[file])+'</details>';}
function agentBoundaryRun(file,anchor,command){return '<h3 id="'+anchor+'" class="walkthrough-run">运行 '+file+'</h3>'+code('解压完整包，在文件目录运行','BASH',command)+
 '<p><a href="/labs/agent-boundaries.zip" download>下载完整实验包 ↓</a> · <a href="/labs/agent-boundaries/'+file+'" download>下载本例源码 ↓</a> · <a href="/labs/agent-boundaries/validation.json">核对环境、结果与源码摘要 →</a></p>'+agentBoundarySource(file);}
const abSecurity=articles.find(a=>a.id==='agent-security');
abSecurity.sections[0][0]='先分清身份、委托与外部材料';
abSecurity.sections[0][1]=para('认证核对调用者是谁；授权判断这个主体现在能否对某个对象执行某种动作。委托把用户允许本次任务使用的范围交给执行系统，审批再对某个具体意图提供额外批准。回执由实际接收方记录已经发生的效果。本地事务把相关变更放在同一提交或回退边界。五者的来源、有效期和用途不同，不能用一句“模型说已获批”替代。',
 '一个后台服务可以持有比当前任务更宽的访问能力。执行任务时，仍应同时受用户当前权限、任务委托和资源边界约束；需要审批的写入还要匹配批准的具体意图。下面先沿一个只读任务追踪越界提议，再进入审批、撤权与提交之间的真实交错。')+
 figure('v47-authority-path','任务范围从可信会话和委托进入执行器；外部材料只能产生候选提议。真正产生效果的服务继续检查当前权限、对象、具体批准与版本。')+abSecurity.sections[0][1];
abSecurity.sections[1][1]=para('把一次调用展开成主体、租户、动作、资源与审批五项。主体包括实际调用的服务以及它代表的用户和任务；租户表达归属范围；资源应由服务端解析成实际对象。参数通过结构校验，只能说明“长得像合法请求”，不能说明有权执行。')+abSecurity.sections[1][1]+
 para('执行器可以拒绝明显越界的提议，但资源服务还要覆盖直接调用、队列消费与重试入口。把所有检查只放在模型之前，会让别的入口绕开同一条策略。策略服务作决定，真正能读正文或提交修改的组件负责实施，二者之间也要规定结果何时失效。');
abSecurity.sections[3]=['批准要绑定规范意图，参数校验先于摘要',
 para('批准应回答“谁代表谁，为哪个任务，对哪个对象，执行哪一种版本的动作，带什么参数，何时有效”。本例R18只批准lin在租户A用report.v1把A/draft从预期版本7写成37，操作标识K1。批准号只是查找这份记录的名字，不是允许任意新参数的通行证。',
 '先定义参数契约，再计算内容摘要。本例金额与版本必须是整数，布尔值和37.0均不当作37，额外字段与重复JSON键拒绝。主体、租户、任务和工具版本来自服务端夹具，正文不能覆盖。随后用固定字段、排序键与固定编码生成意图摘要；JSON键顺序改变可以保持相同意图，金额、对象或版本改变则不相同。',
 '只做sort_keys并不能替业务定义全部规范化。若协议允许多种数字、Unicode表示、路径别名或默认值，就要先规定等价规则、解析资源并固定版本。否则两端可能对“同一意图”产生不同理解。摘要只用于比较内容，可信审批记录与当前授权另有来源；摘要相同也不证明那份批准由有权的人作出。')+
 code('核心片段 · 类型逐项检查见完整程序','PYTHON','if not isinstance(request, dict) or set(request) != set(APPROVED):\n    raise ValueError("unexpected_fields")\nif type(request["amount"]) is not int:\n    raise ValueError("invalid_integer")\nintent = {**PRINCIPAL, **request}\nencoded = json.dumps(intent, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()\nfingerprint = hashlib.sha256(encoded).hexdigest()')+
 para('资源当前版本还要与批准时的预期版本相符。其他写入已把草稿推进到版本8时，旧版本7的批准不应悄悄覆盖它。应返回版本冲突，重新读取并决定是否需要新的意图与批准；这与网络重试是不同问题。',
 'MCP的HTTP授权规范规定客户端访问受保护服务的传输授权流程，并要求令牌面向相应资源。业务对象的租户归属、具体写入参数和审批消费仍要由工具服务的策略定义。工具schema描述输入结构，不能凭工具名或注解推断用户已授权；向上游调用还需使用适用于上游的凭据。')];
abSecurity.sections[4]=['撤权与提交：必须定义谁先发生',
 para('准备执行时允许，不代表排队结束时仍允许。检查与实际使用之间状态可能变化，这类检查后再使用的竞态常称TOCTOU问题。本例先在策略epoch1得到允许，再由另一个数据库连接把撤权提交为epoch2。写入请求随后抵达：若只信旧判断，仍可能产生效果；若在本地提交边界读取当前策略，则会拒绝。epoch是策略代际编号，不是调用者自行填写的授权凭据。')+
 figure('v47-revocation-commit','同一条实际顺序：prepare(1)→撤权提交(2)→写入。正确实现效果0；旧快照负例效果1。数字来自真实HTTP与SQLite连接的执行记录。')+
 para('本实验让策略变化、业务写入、批准消费与回执都通过同一个SQLite串行写事务边界。BEGIN IMMEDIATE取得写事务后，读取当前策略、检查对象与批准、比较版本，再更新数据和回执；另一写事务不能插进中间。它给出本协议的先后顺序，不提供所有远端工具通用的原子性。',
 '若业务先提交、撤权后提交，原效果已经发生，不能要求撤权倒流时间。若撤权先于本次准入生效，后续写入应按新策略判断。跨服务策略缓存、短期凭据、正在执行的网络请求和外部系统提交之间，还需定义检查点、传播延迟及已经在途的动作如何处理；启动时的一份快照无法承诺全球即时停止。',
 '超时也不自动表示零效果。恢复沿原操作标识和同一意图查回执，既有事实与新的授权分别判断。写权限撤销但回执读取仍允许时，可以查询原K1；连读取也撤销，就不能从旧缓存向该主体披露结果。保留受控未知状态，交给有权流程核对，而不是换一个操作标识再写。')+
 figure('v47-receipt-permissions','已提交K1的效果始终是1份。写入权和回执读取权可以分别改变；禁止再写或再读，不会抹去原效果。')];
abSecurity.sections[5]=['把工具权限与代码隔离分别落实',
 para('授权决定允许对哪个对象做什么，隔离限制程序实际能接触的系统能力。某任务获准生成一份报表，并不因此需要访问宿主全部文件、任意网络或其他任务的凭据。工具越接近代码执行和远端运维，越需要把这些能力写成具体边界。',
 '文件系统要区分可读目录、可写目录与共享状态；网络要区分允许的目标和出站路径；进程与资源要规定子进程、CPU、内存、文件描述符及墙钟期限。凭据只在已准入调用中交给对应工具，不作为普通材料放进模型输入。容器、沙箱与业务授权各有职责，不能用“在容器里”代替对象级判断。',
 '取消后还要核对子进程和外部效果。杀掉执行器不等于撤销已提交写入，清理本地文件不等于远端资源已经释放。后面的沙箱章与持久工作流章分别验证这些边界。')+
 '<p>'+linkTo('agent-sandbox','继续检查受信子进程的资源与路径边界')+linkTo('durable-workflows','追踪取消请求与已经发生的效果')+'</p>'];
abSecurity.sections[6][1]+=para('再预测新实验的提交窗口：先得到允许、再撤权、最后写入，正确分支与旧快照分支各产生几份效果？原K1已经提交后，只有写权撤销与连读权也撤销，回执查询又有什么不同？先写判断，再看第十节的数据库状态。');
abSecurity.sections.push(['实战：提交时重查，抓住旧授权快照',
 para('本程序实际启动回环HTTP服务，每个请求使用独立SQLite连接，可信身份和批准由固定测试夹具注入。它没有实现登录或令牌认证。先按服务端规则解析请求，再检查实际资源归属；业务与回执在同一事务内产生。')+
 agentBoundaryRun('authorization_commit.py','authorization-commit-run','python3 authorization_commit.py --report authorization-local.json')+
 table(['请求/交错','实际结果','独立业务判据'],[['正常K1、同键同参','committed / duplicate','版本8、金额37，效果始终1'],['同键换金额','operation_conflict','原效果不被覆盖'],['准备后撤权，再写','write_denied','效果0，仍为版本7'],['故意信旧epoch1','负例仍提交','当前epoch2却有效果1，判失败'],['撤写权，保留读取','能读原K1','允许恢复事实，不创建新效果'],['再撤读取','read_denied','原效果仍在，不披露旧回执'],['布尔金额/额外字段/重复键','分别拒绝','对应隔离用例效果均0']])+
 para('检查本次record.states：正确撤权用例的审计顺序是prepare/1、policy_change/2、denied/2；错误分支最后却是effect/1。把审计与真实效果同时核对，才能发现“前面确实检查过权限”仍不足够。过期比较使用声明的逻辑时间，不作为传播时延测试；本实验也没有证明OAuth、MCP或Kairo已接入。')]);
abSecurity.minutes=35;abSecurity.updated='2026.11.07';
abSecurity.desc='先分清认证、委托、审批与回执，再把参数、资源版本、撤权和实际提交连起来；真实HTTP/SQLite对照旧授权快照为何仍会写入。';
abSecurity.objectives=['按主体、任务、资源与动作定义实际授权','绑定规范意图，区分审批、幂等与资源版本','用提交顺序和业务状态验证撤权及回执读取'];
abSecurity.check=['认证、委托、具体批准与工具回执分别证明什么？','37、37.0和true是否等价，应由哪里规定？','先检查后撤权，为什么必须说明实际写入的判断边界？','写入权撤销后，查询既有回执还需检查什么？'];
for(const ref of ['abAuthorization','abTransaction','abMcp'])if(!abSecurity.refs.includes(ref))abSecurity.refs.push(ref);

abSecurity.prereq='先读G1，认识任务、工具与运行时。认证、授权与提交边界在本章说明；需要云IAM时再补C7.1。';

for(const domain of infraKnowledgeDomains)for(const point of domain.points){
 if(point.id==='ag-authorization')point.body+=para('权限的判断还要对应实际提交时刻。新实验先得到策略代际1的允许，再在另一个连接提交代际2的撤权：写入边界重查时效果0，信任旧快照的错误分支效果1。当前写入权、回执读取权与原效果分别检查。')+'<p><a href="/article/agent-security/#authorization-commit-run">运行实际HTTP与SQLite提交边界实验 →</a></p>';
 if(point.id==='ag-context')point.body+=para('词元预算应覆盖真正发送的完整输入，而非只数资料正文。新实验固定一种把文本转换成词元编号的分词器，并使用纯字符串模板：正文单计36，含系统、任务、来源与分隔后的整包237；再预留96输出。收紧后虽然未超限，却缺一份必要证据，因此停止交付。')+'<p><a href="/article/agent-retrieval/#context-budget-run">核对完整计数与实际提示交付 →</a></p>';
 if(point.id==='ag-retrieval')point.body+=para('从候选到最终输入仍要维护来源身份。正文取回后若读取资格撤销或当前版本改变，新实验在指定发送前检查点拒绝；索引滞后时先排除，加入新版本后再取证。实际HTTP收集器核对送达材料，但不证明语言模型回答正确。')+'<p><a href="/article/agent-retrieval/#section-9">继续理解权限、版本与交付的分层边界 →</a></p>';
}
