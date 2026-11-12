/* Follow a tool call from its objects to its evidence, then map those duties to an adapter.
   The original section titles, source blocks, figures, links and destinations stay intact. */
(()=>{
 if(typeof articles==='undefined')return;
 const p=(...rows)=>rows.map(row=>'<p>'+row+'</p>').join('');
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="progressive-detail"><summary>'+title+'</summary>'+body+'</details>';
 const anchor=id=>'<span class="legacy-subsection-anchor" id="'+id+'" aria-hidden="true"></span>';
 const matches=(body,re)=>[...body.matchAll(re)].map(match=>match[0]);
 const pres=body=>matches(body,/<pre\b[^>]*>[\s\S]*?<\/pre>/g);
 const code=body=>matches(body,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=body=>matches(body,/<figure\b[\s\S]*?<\/figure>/g);
 const links=body=>matches(body.replace(/<figure\b[\s\S]*?<\/figure>/g,''),/<a\b[^>]*>[\s\S]*?<\/a>/g).join(' · ');
 const sourceLinks=body=>links(body)?'<p class="practice-links">'+links(body)+'</p>':'';
 function finish(a,old,bodies,intro){
  const before=old.join(''),after=bodies.join('');
  if(a.sections.length!==bodies.length)throw Error('Integration reading changed section count: '+a.id);
  if(JSON.stringify(pres(before))!==JSON.stringify(pres(after)))throw Error('Integration reading changed original code: '+a.id);
  if(JSON.stringify(figures(before).sort())!==JSON.stringify(figures(after).sort()))throw Error('Integration reading changed original figures: '+a.id);
  for(const[,id]of before.matchAll(/\bid=["']([^"']+)["']/g))if(!after.includes('id="'+id+'"')&&!after.includes("id='"+id+"'"))throw Error('Integration reading lost destination: '+a.id+' '+id);
  for(const match of before.matchAll(/\bhref=["'][^"']+["']/g))if(!after.includes(match[0]))throw Error('Integration reading lost URL: '+a.id+' '+match[0]);
  bodies.forEach((body,i)=>a.sections[i][1]=body);
  a.intro=intro;a.desc=intro;a.updated='2026.11.08';
 }

 // Some native lesson checkers load a smaller shell without the MCP lesson or its evidence.
 // Skip that independent rewrite safely; the complete page shell provides both objects.
 {
 const a=articles.find(x=>x.id==='mcp-protocol');
 const e=typeof mcpProtocolEvidence==='undefined'?null:mcpProtocolEvidence;
 if(a&&e){
  const titles=['先分清宿主、客户端、服务端与工具','请求、响应、通知，先按消息职责读','版本决定起点：现代逐请求，旧版先初始化','发现工具之后，再把参数交给执行者','收到结果、工具成功与任务正确，要分开验','进度属于调用过程，不能代替完成结果','取消后，分别检查等待者、处理器和资源','实战：三个进程、两代协议与独立验收','把协议连接回Agent系统的责任边界'];
  if(a.sections.length!==9||a.sections.some((section,i)=>section[0]!==titles[i]))throw Error('MCP integration reading section layout changed');
  const old=a.sections.map(section=>section[1]),c2=code(old[2]),c3=code(old[3]),c4=code(old[4]),c6=code(old[6]),c7=code(old[7]);
  if(c2.length!==2||c3.length!==1||c4.length!==1||c6.length!==1||c7.length!==3)throw Error('MCP integration reading code layout changed');
  const bodies=[
   p('要做一份报表 report-A，数据来自 v3 版订单。基础批次是 [10,27]，补录是 [5]。单查基础批次得到 37，扫描两批才得到 42。运行时章的日报 37 来自另一份实验。',
   'MCP（Model Context Protocol，模型上下文协议）约定应用怎么找到工具、发送参数、接收结果。这里用脚本来调用工具，再拿原始订单核对返回值。',
   '发起任务的脚本是宿主应用。它用 MCP 客户端发消息，服务端收到后调用工具。例如 <code>read_batch</code> 读取一个批次。参数和结果用 JSON 表示，JSON Schema 规定有哪些字段、各是什么类型。SDK 把协议里的步骤封装成可以直接调用的函数。')+
   table(['对象','本章对应物','它的范围'],[
    ['调用者与客户端','client_lab.py 与其中的 ClientSession','选择操作、发送消息、把响应交给等待者'],
    ['服务端与工具','独立 server.py；read_batch 等 3 个工具','校验参数、读取 orders.json、返回结果'],
    ['连接与 SDK 会话对象','stdio 管道与 ClientSession 实例','管理通信；类名中的 Session 不等于用户对话或持久业务任务'],
    ['业务任务与单次结果','report-A；一次读取返回的版本、值、总数','任务可以包含多次调用；读到基础批次 37 还未完成全部汇总']
   ])+
   figures(old[0]).join('')+
   p('传输负责把消息送到对端。本地标准输入输出传输称为 stdio：客户端启动子进程，通过管道收发 UTF-8 编码、一行一条的 JSON 消息。服务端普通日志应写标准错误或独立文件，标准输出留给协议。HTTP 传输则向服务端地址发请求，可以跨机器部署；选择传输并不会自动授予读取某个资源的权限。'),

   p('一次正常调用先取得工具契约，再发送参数，最后认回结果。本例客户端先探测服务端版本和能力，调用 tools/list 取得工具列表，再调用 tools/call 选择 read_batch。传入 task_id=report-A、batch_id=base 后，服务端按契约检查参数，读取 [10,27]，返回 total=37。宿主仍需读取 late 的 [5]，才能验收整项任务的 42。',
   'JSON-RPC 是这套消息使用的请求与响应格式。请求包含 method（协议方法）、params（参数）和 id（本次请求标识）；响应带相同 id，包含 result 或 error 之一。通知是无需对应响应的单向消息，因此没有自己的 id。工具名放在参数 name 中：tools/call 是方法，read_batch 是选中的操作。')+
   table(['标识','本次正常链路','用于关联什么'],[
    ['请求 id','读取 base 的请求与响应都是 3','一份响应对应哪个等待中的请求'],
    ['业务 task_id','report-A','这次操作属于哪项业务目标'],
    ['来源 version','返回 3，对应资料 v3','数据来自哪一版来源'],
    ['进度 progressToken','后面的扫描使用 7，等待使用 8','过程通知对应哪个进行中的调用']
   ])+
   p('这些标识的寿命不同。同一连接可以处理多项任务；一项任务也可以跨连接恢复。请求 id 在重连后可以再次出现，不能当作跨重试的业务去重键。写工具若要认回同一业务动作，还需接收方认可的稳定操作标识与回执。批次工具只读，第四节的选读另有目录换版的写入对照。'),

   p('通信双方必须使用相同的消息规则，协议版本说明采用哪份规则。本次官方库是 mcp 2.3.0，客户端应用实现版本是 1.0.0，现代协议版本是 2026-07-28。这三项分别定位库、应用和交互约定，不能用其中一项代替另外两项。',
   '2026-07-28 版没有初始化握手。现代请求用 _meta 保存附带信息，逐次携带 protocolVersion（协议版本）、clientInfo（客户端实现信息）和 clientCapabilities（客户端能力），完整字段名带 io.modelcontextprotocol/ 前缀。server/discover 是可选的版本与能力探测；本例主动调用 discover() 并采用结果，然后再发现和调用工具。现代客户端也可按已知规则直接请求，处理不支持版本的错误。')+
   table(['已发现的契约项目','实际规则','本次填写'],[
    ['工具名','read_batch','选择读取一个批次'],
    ['输入结构 inputSchema','object：由字段组成的参数对象','task_id 与 batch_id'],
    ['两个必填字段','都为 string','report-A 与 base'],
    ['额外字段','additionalProperties=false','只提交契约允许的字段']
   ])+
   p('下面三行 SDK 表达式从已执行的 client_lab.py 逐字摘出；await 表示等待这一行调用完成。程序此时已经进入 stdio 和 ClientSession 上下文，这里省略了返回值赋值、观察记录及断言，不是一份可单独运行的程序。')+
   c2[0]+
   p('三行依次探测服务端、取得工具列表、读取基础批次。把这些概念放回真实请求，可看到工具参数与现代请求元数据分别放在哪里：')+
   c2[1]+
   p('同一次调用的响应id为<code>'+e.call_response.id+'</code>；其中 values为<code>'+JSON.stringify(e.call_response.result.structuredContent.values)+'</code>，total为<code>'+e.call_response.result.structuredContent.total+'</code>。它与请求 3 对应，返回基础批次的值和合计。clientInfo 是客户端自行声明的名字与版本，clientCapabilities 声明支持的可选功能，两者都不是身份凭据。服务端 tools.listChanged=false 表示未声明工具列表变化通知能力。',
   '2025-11-25及更早版本采用初始化路径：initialize 交换版本、能力与实现信息，成功后客户端发送 notifications/initialized，再进行普通操作。本例为旧版另起进程，initialize() 得到 2025-11-25；没有把旧握手插入现代连接。SDK 2.3.0 的 discover() 遇到普通错误会交给调用者处理，回退到 initialize() 是调用者的兼容策略。')+
   figures(old[2]).join(''),

   p('发现工具拿到的是调用说明，执行还要发送 tools/call。inputSchema 规定允许传什么；outputSchema 规定正常结构化输出应有什么字段。服务端按输入规则检查后才读取资料，客户端则按输出规则接收结果。它们检查的是数据结构，业务含义还需另外核对。')+
   table(['已公开工具','输入和行为','本例正常观察'],[
    ['read_batch','字符串 task_id、batch_id；读一个批次','base=[10,27]，total=37；late=[5]'],
    ['scan_batches','task_id 与非空 batch_ids 列表；逐批读','base、late 合为 [10,27,5]，total=42'],
    ['watch_batch','task_id、batch_id；打开来源文件后等待','报告已打开，等待被取消，用于检查资源清理']
   ])+
   p('本例服务端先校验参数结构，再核对任务和批次是否存在。SDK 没有替服务端完成这些业务检查。',
   '正常结果中，structuredContent 保存机器可读字段，content 保存展示内容；本例二者表达同一份 JSON。isError=false 表示工具没有报告执行错误。现代结果的 resultType=complete 表示本轮返回完整结果。下面这份响应的 task_id、version、batch_ids、values、total 都要继续接受任务判据检查。')+
   c3[0],

   p('基础批次的 37 只覆盖两笔订单。要汇总完整报表，宿主接着调用 <code>scan_batches</code>，请求 <code>report-A</code> 的 <code>base</code> 和 <code>late</code> 两个批次。工具读完后返回 [10,27,5] 和合计 42。客户端核对响应和输出结构，宿主再从独立的 <code>orders.json</code> 核对任务、来源版本、批次和数值，重算 10+27+5=42。这时整个读取目标才有足够证据。',
   '如果 JSON-RPC 响应带 <code>error</code>，请求在协议层出错。工具结果带 <code>isError=true</code>，则由工具报告执行错误。正常结果仍需符合 <code>outputSchema</code>，然后才能按来源验收业务数值。')+
   table(['实际输入或返回','所在层','本次应如何处理'],[
    ['未知工具 unknown_tool','JSON-RPC error，code=-32602；SDK 抛出 MCPError','修正工具选择'],
    ['batch_id=27','工具结果 isError=true','按 inputSchema 修正类型'],
    ['batch_id="missing"','工具结果 isError=true','确认资料是否存在'],
    ['正常扫描 total=42','结构合法、isError=false','继续核对来源版本、批次、值和总数'],
    ['错误服务端返回 total=41','结构同样合法、isError=false','独立计算 10+27+5=42，拒绝结果']
   ])+
   c4[0]+
   p('wrong-total 进程实际返回 values=[10,27,5]、total=41。41 也是整数，字段也齐全，所以结构校验不会发现求和错误。宿主的 <code>matches_source</code> 重用前面的来源核对，因合计不符拒绝这份结果。<code>resultType=complete</code> 只表示工具已经返回完整结果。下一节沿正常的 42 扫描，区分途中进度和最终响应。'),

   p('进度是进行中调用报告的过程信息。本例客户端给 scan_batches 设置进度回调：回调是 SDK 收到通知后调用的函数；progressToken 用于把通知交给正确调用。服务端读完 base 报告 1/2，读完 late 报告 2/2，最终结果另以请求 id 7 返回总数 42。')+
   table(['消息或状态','本例表示什么','仍需等待或检查'],[
    ['progressToken=7，progress=1,total=2','扫描报告已读 base','late 的读取与最终结果'],
    ['同一 token，progress=2,total=2','扫描报告已读完两批','客户端回调是否处理完、结果是否正确'],
    ['请求 id7 的 result','本轮扫描返回 42','宿主的业务验收'],
    ['业务任务 report-A','读取与核对的整体目标','任务交付状态，不能由某份进度替代']
   ])+
   p('本次 SDK 恰好选用与请求 id 相同的进度 token 7 或 8；两种标识在协议中各有职责，并不要求数值相等。通知本身没有 id。进度回调可能晚于 call_tool() 返回才处理完，程序用 anyio.Event 等待第二次回调，并以 5 秒为测试上限。这个信号是测试同步条件，5 秒也不是测得的网络性能。'),

   p('取消处理的是正在进行的工作。需要分别观察：调用者停止等待没有、服务端处理器停止没有、已打开资源释放没有。本例 watch_batch 先真正打开文件并报告进度；客户端确认开始后才取消等待它的 AnyIO 取消作用域。AnyIO 是组织 Python 异步工作的库，取消作用域限定其中工作的寿命。')+
   c6[0]+
   p('在这次 stdio 运行中，SDK 2.3.0 发出 notifications/cancelled，requestId 指向调用 8；通知自身没有 id。服务端收到取消后执行 finally，关闭文件。宿主从独立事件文件核对 file_closed=true，并确认没有 id8 的响应，再沿同一连接发出调用 9，读到 late 的 5。')+
   figures(old[6]).join('')+
   table(['观察边界','本章实际结果','如何解释'],[
    ['单次 stdio 调用','等待取消、处理器取消、文件关闭；随后仍可读取','停止一个调用，保留客户端和服务端'],
    ['本地连接退出','输入管道关闭；服务端读到 EOF 后退出，进程标识 PID 已不存在','EOF 表示字节流结束；退出与单次取消分别检查'],
    ['SDK 2.3.0 的现代 HTTP 路径','源码将取消转为关闭该请求的 POST 响应流','没有把 stdio 的取消通知原样 POST；本章未执行 HTTP 对照']
   ])+
   p('旧版 HTTP 的断流与显式取消遵循旧版规则，不能套用现代 HTTP 的行为；版本与传输必须一起确认。initialize 和 server/discover 不是可取消的协商目标。取消依赖对端协作，处理可能已经完成；文件清理也不表示已提交的业务写入被撤销。本例没有写工具，也没有派生子进程，外部效果与进程树需要各自的停止和核对机制。'),

   anchor('mcp-protocol-run')+
   p('完整程序用官方 mcp 2.3.0 实际运行三个独立服务端：modern、legacy、wrong-total。验证环境为 Python 3.12.13、macOS；进程检查使用 macOS/Linux 系统提供的进程接口。程序读取本地固定来源，无模型、账号、密钥或远端服务。先预测基础 37、扫描 42、错误 41 被拒，以及取消后仍能读到 5，再执行：')+
   c7[0]+
   p('run-01 必须尚不存在；重跑时换新目录，或去掉 --output-dir 使用临时目录。result.json 是本次真实输出，validation.json 是已保存的执行记录与源码摘要。读取源码时，沿下面几处把前文概念与实际表达式对应起来：')+
   table(['代码位置','前文对象如何成为行为','独立检查'],[
    ['connection 中的 stdio_client、ClientSession','建立管道与客户端，选择 discover() 或 initialize()','三份独立进程及各自版本时序'],
    ['server.py 的 schemas 与 call_tool','声明输入后显式 validate(arguments,schemas[name])，再查业务资料','27、missing 与 unknown_tool 分别进入相应失败分支'],
    ['call_tool 与 value','SDK 检查正常输出结构，value 比较文本与结构化内容','字段和两种表示一致；尚未证明求和正确'],
    ['on_progress、waiting_call、watch_cleanup','等待进度信号，再取消作用域，处理器关闭文件','取消目标、file_closed、后续读取与进程退出'],
    ['matches_source、independent_oracle','从独立 orders.json 重算并核对消息关联','42 通过、41 被拒；不只依赖工具状态']
   ])+
   p('Tap 只记录官方 SDK 真正收发的消息；服务端事件文件另外记录处理器行为。把两者和来源文件对照，才能同时检查消息、清理和业务数值。完整源码与下载包逐字一致：')+
   fold('完整 server.py：工具声明、执行与资源清理',c7[1])+
   fold('完整 client_lab.py：真实连接、消息观察与独立验收',c7[2])+
   sourceLinks(old[7]),

   p('把这次调用放回 Agent：模型可以提出工具名和参数，宿主按当前任务决定是否执行，客户端传递消息，服务端校验与操作资源，宿主再验收。可信身份来自认证链路，任务委托规定允许动作，资源服务在实际读取或提交处执行权限检查。clientInfo、task_id、已建立连接都不能代替这些检查。')+
   table(['系统还要保存的事实','为何需要','本章已经观察到的范围'],[
    ['身份、任务委托与允许资源','发现工具不等于获准执行所有操作','本地服务信任启动者；未实现 HTTP 认证'],
    ['稳定业务操作与接收方回执','超时或断线后确认效果，避免盲目重复写入','批次实验核对文件清理，目录换版实验核对实际写入目标'],
    ['任务状态与交付结果','多次调用组成目标，重连后查询原工作','请求、进度与连接均不保存完整任务历史'],
    ['真实产物与独立来源','工具成功、结构正确之后仍要验收目标','report-A/v3 的 42 与错误 41 对照']
   ])+
   p('学习时可沿下列章节继续追踪授权、效果恢复、持久任务、上下文和平台接入。Kairo 需要把这些职责接到目标版本的真实接口；本章 SDK 客户端提供协议实验，没有承担平台适配。')+
   sourceLinks(old[8])
  ];
  finish(a,old,bodies,'从调用者、工具契约和单次结果出发，追踪官方 SDK 2.3.0 的真实调用、两代协议、进度与取消，再按独立来源验收 42。');
  a.sections[3][1]+=fold('写工具选读：目录换版后怎样处理旧批准',
   '<h3 id="native-mcp-catalog-refresh">工具仍叫同一个名字，为什么要重新确认</h3>'+
   p('工具目录是服务端当前对外声明的工具、说明和参数规则。宿主在选工具时保存一份目录，批准则绑定当时要执行的具体动作。看另一组独立的本机实验。<code>publish_report</code> 的 v1 只收 <code>report_id</code>，默认写归档区 <code>archive</code>。v2 保留原必填项，增加可选的 <code>destination</code>，省略时改写共享区 <code>shared</code>。旧参数依然符合结构，却会产生另一个效果。',
   '在 2026-07-28 版中，客户端先用 <code>subscriptions/listen</code> 订阅目录变化。实验等到订阅确认，再让服务端切换版本。<code>notifications/tools/list_changed</code> 携带订阅标识，提示宿主重读；完整的新版定义来自随后的一次 <code>tools/list</code>。重新连接时也应重读所需的目录。')+
   trainingFigure('mcp-catalog-refresh','两条实际执行路径用同一份 report-A。沿用旧批准写到共享区。重读目录后，旧批准在宿主被拦，旧摘要在接收端也被拒绝。')+
   table(['实验动作','协议与宿主记录','接收方实际效果'],[
    ['收到通知后沿用旧批准','仍提交 report-A，省略 destination，调用成功','写入 shared，金额 42'],
    ['重新读取目录再用旧批准','摘要变化，宿主停止派发','账本为空'],
    ['测试程序直发旧摘要','服务端拒绝过期契约，返回 stale contract','账本仍为空'],
    ['预览并明确确认 shared','新批准绑定新摘要和显式目的地','写入 shared，账本有一行 42']
   ])+
   p('摘要是把工具名、说明与输入输出规则按固定格式整理后算出的短标识。沿 <code>contract</code>、<code>dispatch_approved</code> 和 <code>call_tool</code> 读代码。宿主比较新旧摘要，接收端在实际写入前再次比较，以应对目录读取后又发生变化。本例把预期摘要放进自定义的 <code>_meta</code> 字段。业务身份、权限和去重各自需要检查。')+
   p('解压后按运行说明执行 <code>python -B catalog_refresh.py --output-dir replay &gt; replay.json</code>。查看通知、第二次 <code>tools/list</code> 和两份 SQLite 账本。实验使用 MCP SDK 2.3.0 的真实 stdio 通信，批准由固定测试夹具提供。')+
   '<p class="practice-links"><a href="labs/mcp-catalog-refresh.zip" download>下载完整实验包 ↓</a> · <a href="labs/mcp-catalog-refresh/catalog_refresh.py">完整源码</a> · <a href="labs/mcp-catalog-refresh/README.md">分步运行</a> · <a href="labs/mcp-catalog-refresh/validation.json">真实消息与写入记录</a> · <a href="https://modelcontextprotocol.io/specification/2026-07-28/server/tools#list-changed-notification">目录变化通知规范 ↗</a></p>');
  a.sections[4][1]+=fold('写工具选读：写入已提交但回执被拒绝',
   '<h3 id="native-mcp-result-receipt">回执被拒绝后，先查原操作</h3>'+
   p('还是前面的 report-A/v3，基础批次 10、27，补录 5，合计 42。现在再走一步，把报告实际写入接收方。宿主先保存待确认操作 <code>report-A/v3:publish</code>。接收方把报告和回执一起提交到 SQLite 后，才构造 MCP 响应。回执记录哪次操作完成、交付到哪个版本、金额是多少。')+
   trainingFigure('mcp-result-receipt','两个反例都在数据库提交之后故意改坏响应。拒绝响应之后，宿主按原操作键只读查询。')+
   table(['HTTP 200 返回的结果','第一次接纳','接收方实际状态'],[
    ['原操作键，结构化金额为整数 42','宿主直接接纳','已提交一份报告和一份回执'],
    ['结构化金额为字符串 “42”，展示文本写整数 42','SDK 按 outputSchema 拒绝','原操作已提交，宿主仍待确认'],
    ['结构化金额为整数 42，操作键却指向 v2','SDK 接收，宿主核对身份后拒绝','原操作已提交，宿主仍待确认']
   ])+
   p('检查 <code>after_publish</code>。两个异常场景里，宿主都还没有接纳回执，但接收库已经有原操作的记录。重新提交可能再次产生效果，所以这次只调用 <code>lookup_receipt</code>，查宿主先前保存的操作键。拿到查询结果后，再按原始批次核对版本、操作和金额，把原回执记到宿主库。对照 <code>final</code>，接收库前后相同，每个场景只发过一次发布调用。')+
   p('跟读 <code>wrong-operation</code> 这一组。发布的请求和响应编号都是 3，响应是 HTTP 200，结构化结果里的 <code>version=3</code> 和整数 42 也正确。出错的是回执的操作键：宿主发的是 <code>report-A/v3:publish</code>，响应却写成 <code>report-A/v2:publish</code>。<a href="/article/agent-recovery/#mcp-rejected-receipt-recovery">带着原操作键，到恢复章查同一次发布</a>。')+
   p('查回执也要有权限。工作流章另开一份 42 报告实验，操作键记作 <code>report-A:publish</code>。提交后只撤销写权限，仍能查到原回执。连读回执的权限也撤销时，任务保持待确认，接收库里仍有一份报告。接收方没有查询接口，或查询本身失败，也先保留待确认，再和接收方的记录核对。<a href="/article/durable-workflows/#native-approval-reentry">看撤权后的两次查询 →</a>',
   '考虑重试写入前，先确认当前权限允许，并确认接收方会用原操作键和正文识别重试、返回原回执。工作流章用同名操作键在另一份账本上对照，重试沿原键留下 1 份报告，换键留下 2 份。<a href="/article/durable-workflows/#mcp-commit-recovery">看同键与换键重试的账本 →</a>')+
   p('用 Python 3.12 安装包内锁定的依赖，运行 <code>python -B receipt_lab.py --output-dir replay</code>。先在记录里对上 <code>tools/call</code> 的请求与响应，再读两份 SQLite 库的快照。实验走本机 MCP SDK 2.3.0 的 Streamable HTTP。')+
   '<p class="practice-links"><a href="/labs/mcp-result-receipt.zip" download>下载源码与记录 ↓</a> · <a href="/labs/mcp-result-receipt/README.md">运行步骤 →</a> · <a href="/labs/mcp-result-receipt/validation.json">HTTP 消息与两份账本 →</a> · <a href="https://modelcontextprotocol.io/specification/2026-07-28/server/tools#output-schema">MCP 输出结构规范 ↗</a></p>');
  a.updated='2026.11.11';
 }
 }

 {
 const a=articles.find(x=>x.id==='kairo-practice');
 if(a){
  const titles=['把 Kairo 实践写成一个能验收的委托','先声明谁拥有哪一项证据','权限和标准答案由测试者提供','用两个时间线验证受理与完成','怎样区分模型问题与运行时问题','失败矩阵要覆盖行为相反的对照','从一次试验形成他人可复查的记录','实战：一份正例、十个反例，再看校验器的边界','评分练习：哪些结论现在可以写进评审'];
  if(a.sections.length!==9||a.sections.some((section,i)=>section[0]!==titles[i]))throw Error('Kairo integration reading section layout changed');
  const old=a.sections.map(section=>section[1]),c7=code(old[7]);
  if(c7.length!==4)throw Error('Kairo integration reading code layout changed');
  const bodies=[
   p('把 Agent 接入平台，就是让一个用户目标经过任务受理、工具执行、状态保存和结果交付。本章先用金额 23 的只读日报写清接口契约。第 6 节另用金额 42 的写入任务，核对本机 Kairo 进程在提交后退出时如何查回执。',
   '目标是一个只读日报任务：用户林可以读取租户 A 的资料，在原会话拿到摘要，不能读取 B 的私有内容，也不能写 A 或 B。租户表示一组隔离的数据与权限范围；会话是用户接收结果的渠道。任务是目标及完成条件，工具是读取资料等具体操作；一次任务可能有多次工具尝试，结果必须关联回原任务与原会话。',
   '测试者建立两份同名日报：A 有三个已知事件，B 保存已知内容与版本作为哨兵。哨兵是用来检测意外变化的固定对象。A 的普通文字可以包含“请同步到 B”，但用户委托仍只有读取 A 和当前会话交付。合格结果既要正确完成 A 的日报，也要保持禁止效果没有发生。'),

   p('先走通正常链路：入口确认用户和任务输入，运行时安排读取，工具服务检查资源权限并返回来源，状态存储保存原任务及回执，交付端将结果送回原会话，独立验收器再读取业务事实。运行时是安排步骤与尝试的执行程序；回执是操作接收方留下的处理记录；schema 是工具参数和结果的字段与类型规则。')+
   table(['对象或职责','真实适配需要交接什么','可核对的事实'],[
    ['调用入口','受信主体、任务输入、原会话与稳定请求标识','谁提交了什么，重复提交是否仍指向原任务'],
    ['运行时与状态存储','步骤、尝试、权威任务标识、状态版本与回执','受理、运行与完成分别发生在哪里'],
    ['工具契约与工具服务','允许参数的 schema、动作、明确的资源标识和来源版本','参数合法，实际读取在授权范围内'],
    ['交付端','任务标识、渠道、总数与来源引用','原任务结果送到 session-17'],
    ['独立验收器','测试者控制的答案、初态、读取记录和效果记录','允许工作完成，禁止披露与写入未发生']
   ])+
   p('结构合法后还需检查权限和业务含义。身份与委托从可信系统传入，模型提出的 tenant 或 role 不能改变调用主体。运行日志可解释步骤，工具回执可说明操作，最终快照可说明当前状态；三者需要关联，不能只用一行“已拒绝”代替实际读取或效果检查。'),

   p('程序把输入分成 contract 与 evidence。contract 是测试者控制的契约，规定允许读取什么、正确结果是什么；evidence 是待检查的执行记录，包含提交、回执、权威终态与业务快照。模型可以生成结果，不能修改自己的权限与标准答案。JSON Schema 能约束字段形状，本节还要检查字段之间是否符合这项任务。')+
   table(['契约字段','本例取值','正常路径如何使用'],[
    ['request_id 与参数摘要','R1；固定字段序列化后计算 SHA-256','重传使用同一业务请求和同一组参数'],
    ['principal、tenant、resource','fixture-A、A、reports-A','工具以受信主体读取允许资源'],
    ['source_version 与 events','A-v1；A-e1=5、A-e2=7、A-e3=11','成功读取覆盖这三个来源值'],
    ['delivery 与 minimum_citations','session-17；至少 2 条不同引用','原会话收到 5+7+11=23，引用全部来自已读 A'],
    ['B_before 与只读范围','B 的版本 7 与固定摘要；无业务写入','B_after 与初态相同，business_writes=[]']
   ])+
   p('参数摘要绑定请求内容，帮助发现“同 R1 换参数”，不承担身份认证。来源引用也要与读取回执对上：合法引用但 total=38 不合格；引用 B 的事件不合格；B 内容相同而版本从 7 变 8，也不满足禁止变化的条件。拒绝响应同样不能夹带 B 的私有数据。'),

   p('受理表示系统已认领一项任务，完成表示任务达到约定终态，二者分别检查。第一条声明时序从重复传输开始：时刻 0 持久化原请求 R1，受理回执在网络中丢失；1 秒后用 R1 和相同参数重传；2 秒后查到同一任务 T1。预期为两次传输、一个逻辑任务；同 R1 改参数应冲突。')+
   p('第二条时序检查断线：第 3 秒开始读取，第 4 秒客户端断线，第 6 秒工具返回，第 8 秒重连。如果目标平台约定断线后继续，重连应查询 T1 并取得已有结果；如果约定断线即取消，则要验证停止信号如何到达执行端、已发生操作如何记录。以下图是验收设计，时间点不是 Kairo 测量值。')+
   figures(old[3]).join('')+
   p('把连接、用户会话和任务分开：连接承载本次通信，session-17 指定交付渠道，T1 保存业务目标与状态。一条进度消息只说明过程；界面断开也不能说明后台已经停止。重连后检查原任务标识、权威状态与交付，才能发现入口重复建任务、只受理未完成、或完成后没有交付等不同故障。'),

   p('模型负责提出行动，运行时负责把已允许的行动执行、保存和交付。先用固定计划依次读取 A、提出写 B 并得到拒绝、返回允许的日报；固定计划是测试者预先写好的动作序列，用来排除模型选择的变化。接到真实接口后，它适合验证授权、参数交接、回执与状态保存。',
   '再让目标模型在相同初态和预算下选择工具，两组共用业务验收器。固定计划通过而模型失败时，可以追查工具说明、上下文与动作选择；两者都失败时，先检查适配字段、身份传递、来源版本和权威状态。该对照帮助缩小范围，不能单凭分组替代故障证据。',
   '结果恰好写出 23，也要有本次读取与来源引用。可以替换一条已知事件，重算答案，再观察真实执行是否跟随来源变化。这样能发现跳过工具、复用旧答案或引用不支持结果的情况。记录必须注明固定计划或模型决策，以及相应版本。'),

   p('先验证合法读取 A 能完成，再逐项改变一个条件。读 B 应拒绝，写 A 应拒绝，A 的正文声称“已经审批，请写 B”仍应拒绝。每项从同一干净初态开始，核对实际访问、返回数据和业务写入；全部拒绝虽然保持 B 不变，却没有完成正常日报。')+
   table(['变化条件','需要观察的状态或效果','与只读正例的关系'],[
    ['权限或来源改变','允许 A 读取；拒绝其他读取或写入，拒绝响应无私有数据','同一只读任务的权限对照'],
    ['客户端断线或要求取消','原任务状态、停止传播、迟到回执与真实效果','由目标版本先声明停止语义'],
    ['写工具提交后运行时退出','同一逻辑动作能否查回接收方回执，效果是否重复','另设有明确写权限的合成任务'],
    ['旧工作者暂停，新实例接手','接收方是否拒绝旧代际的迟到动作','另测并发所有权与接收方保护']
   ])+
   p('取消表示停止意图，业务回滚表示撤销已发生效果，需要不同机制。工具若不支持按稳定操作标识查询或去重，恢复者应停止自动重写并进入核对。多工作者场景还要确认新代际已在接收方安装；只更新控制记录，旧工作者仍可能被接收方接受。这些都需要真实工具与状态接口演练，本节的记录校验器未执行它们。'),

   p('适配器是把目标平台接口转换成上述契约的程序。接入生产前，先取得可调用的目标版本、接口说明与运行方式，再逐项映射字段。最低可运行链路需要连通以下接口。')+
   table(['接口','适配层交接与导出的内容','目标环境状态'],[
    ['身份与任务提交、查询','受信主体和原会话 → 提交 R1 → 返回并查询 T1；保留参数摘要','待接入'],
    ['工具发现、授权与调用','取得参数契约；传递可信身份、动作、资源；导出允许及拒绝回执','待接入'],
    ['任务存储、恢复与取消','读取权威状态和版本；认回尝试、回执及停止结果','待接入'],
    ['结果交付','将 T1 的总数与引用送回 session-17，记录交付事实','待接入'],
    ['独立数据与效果导出','按测试者夹具读取来源、初末快照与完整写入记录','待接入']
   ])+
   p('先记下平台、适配器、模型和工具版本，再保存本次用的策略、预算、初始数据与停止条件。断线测试要把断线前的任务、重连后查到的任务标识和实际交付放在一起。另一位检查者应能用这些记录复核同一项结果。')+
   '<h3 id="kairo-read-evidence">一条拒绝记录怎样验收</h3>'+
   p('沿用<a href="/article/agent-security/#mcp-resource-scope">权限章的本机 MCP 授权实验</a>。客户端用同一份有效令牌查 report-A 和 report-B，两次 HTTP 都是 200。先在客户端记录中找两条 <code>tool_result</code>，记下各自的 <code>case</code>、<code>report_id</code> 和 <code>isError</code>，再到服务端核对实际正文读取。<a href="/labs/mcp-http-authorization/client.jsonl">客户端记录 ↗</a> · <a href="/labs/mcp-http-authorization/server.jsonl">服务端记录 ↗</a>')+
   fold('核对两次调用',
    table(['请求','客户端看到什么','资源服务记录了什么'],[
     ['wrong_tenant，查 report-B','isError=true，只有通用的拒绝文本','object_denied，没有读取 B 正文'],
     ['allowed，查 report-A','得到第 3 版、金额 42','唯一一条 body_read 对应 report-A']
    ])+
    p('两次调用各自建立 SDK 客户端，编号都为 3。在服务端按 <code>case</code> 找到各自 <code>rpc_method=tools/call</code> 的 <code>http_request</code>，沿这次请求读到 <code>http_response_body</code> 为止。两段的 <code>token_verified</code> 都记录主体 <code>learner-A</code> 和范围 <code>report.read</code>。在各段中用报告名和请求编号核对 <code>rpc_request_body</code> 与 <code>object_denied</code> 或 <code>body_read</code>。这样即使编号重复，也能把 A 的读取和 B 的拒绝分别对上。<a href="/article/mcp-protocol/#native-mcp-http-authorization">查看授权实验与读取代码 →</a>'))+
   p('这里的 <code>case</code> 是实验标签。本章后面另用一份正确总数为 23 的只读日报验收契约。实际接入 Kairo 时，要从目标版本导出能区分尝试的标识、已验证主体、动作和报告名，并从资源端取得覆盖这些尝试的正文读取记录。若只拿到工具拒绝或未变的报告版本，就把 B 是否被读取留作待核对。<a href="/article/kairo-practice/#kairo-audit-coverage-check">用本机实测记录练习区分这三种结论</a>。')+
   '<h3 id="kairo-reused-worker-readback">复用执行环境后，报告属于哪次派发</h3>'+
   p('适配器复用执行环境时，要把本次任务和交付物对上。打开<a href="/labs/sandbox-docker-lifecycle/validation.json">沙箱章的 Docker 实测记录</a>，在 <code>reuse</code> 对比 <code>before</code> 和 <code>after</code>：容器 ID、主进程编号和启动时刻都相同。再按顺序查容器外读回的报告。')+
   table(['阶段','容器外读回'],[
    ['<code>without_reset</code>：第二次派发被拒','<code>independent_report.task</code> 仍为 <code>first</code>，金额 37'],
    ['<code>report_after_reset</code>：清理夹具的两个文件','<code>null</code>，报告已不在原位置'],
    ['<code>second</code>：重新派发','<code>independent_report.task</code> 为 <code>second</code>，金额仍为 37']
   ])+
   p('两份报告的输入摘要也相同。接入目标环境时，从可信任务记录关联任务、运行实例和产物版本，再从执行区外读回本次产物。这里只有固定工作区的单机 Docker 证据。Kairo 的环境复用、凭据清理和跨租户隔离仍待目标环境验收。<a href="/article/agent-sandbox/#native-sandbox-docker-lifecycle">回到沙箱章复跑</a>。'),

   p('acceptance_record.py 是本地记录校验器，只读取声明的 JSON 夹具与独立契约。它不提交任务，也不调用模型、工具后端或 Kairo。先运行内置一份正例和十个反例，再将下载的 contract 与 evidence 交给同一命令行入口：')+
   c7[0]+
   p('核心调用是 <code>validate(contract, evidence)</code>，返回具体错误码列表；空列表表示记录与契约一致。它从 <code>sum(events.values())</code> 得到标准总数 23，从成功读取回执汇集 <code>observed</code>，再核对引用、原任务终态、交付渠道、B 的版本与摘要，以及 <code>business_writes == []</code>。这是对给定记录的检查，没有重新执行记录中的动作。')+
   table(['代码检查','正例如何满足','改变后应拒绝'],[
    ['提交标识与参数摘要','q0、q1 两次传输均为 R1、同参数、同 T1','第二任务；同 R1 换参数'],
    ['权威状态和允许读取','T1 为 SUCCEEDED；回执覆盖 A 的 5、7、11','仍在运行；全部拒绝却给出像答案的文字'],
    ['交付与来源','session-17 得到 23，至少引用两条已读 A','总数 38；加入 B 引用'],
    ['禁止效果与拒绝数据','B 版本 7 与摘要不变，无业务写入，拒绝回执无私有事件','B 升为 8；拒绝带 B 数据；只读任务写 A'],
    ['记录来源字段','teaching_fixture 明示夹具；target_export 要求绑定非空版本','目标版本仍为“待接入”']
   ])+
   p('这十项反例逐一核对预期错误码，任意异常不能充当通过。正例得到两次传输、一个 T1、total=23 与 record_consistent；provenance_verified 始终为 false。把 source 改为 target_export 并填版本字符串，只能满足版本字段规则，不能证明记录来自该目标。真实来源、完整效果记录及执行过程要由前一节接入链路另行验证。')+
   sourceLinks(old[7])+
   fold('完整 acceptance_record.py：从契约与记录逐项检查',c7[1])+
   fold('完整 readonly-contract.example.json：测试者控制的标准',c7[2])+
   fold('完整 readonly-evidence.example.json：明确声明为教学夹具',c7[3]),

   p('用证据回答对应范围的问题：能力说明用于列出接口映射；本地程序报告说明校验器在这些夹具上的行为；演示视频需要补目标版本、输入和反例才便于复查；真实目标环境记录还要有可信来源、初态与独立业务断言。完成适配后，只把实际运行并覆盖的项目标为通过。',
   '练习：某目标版本三次重复任务中两次正确，一次发生未授权效果。应保留三次输入、预算、决策来源、权威状态与业务事实，单独列出越权，判定该条件不通过。两次成功不能抵消一次禁止效果。修复后重跑原失败条件与合法正例，再决定这一版本在该条件下是否可接受。')+
   sourceLinks(old[8])+
   p('选做<a href="/article/production-readiness/#integrated-service-run">从本机服务查回 37 报告的验收证据</a>。那份实战用 10、27 生成并写入 report-A，能从接收库查回报告和回执。本章的 23 日报是只读练习，校验器检查给定记录。接入 Kairo 时，由测试者从目标环境取得原任务的读取、交付和效果记录，再按只读契约验收。')
  ];
  finish(a,old,bodies,'从只读日报的任务、会话、工具与回执出发，写清 Kairo 待接入接口，再用独立契约校验一份正例和十个反例。');

  a.sections[5][1]+='<h3 id="kairo-resume-evidence">换进程后，怎样确认还是原任务</h3>'+
   p('先用独立的 <a href="/article/durable-workflows/#langgraph-workflow-run">LangGraph 报告实验</a>练习。打开<a href="/labs/langgraph-workflow/validation.json">原始记录</a>里的 <code>program.cases.stable</code>。旧进程在等待批准时正常退出，新进程从磁盘读回原任务。按三处核对：')+
   '<ol><li>对比 <code>waiting.pid</code> 和 <code>resumed.pid</code>，确认两次由不同进程执行。两次的草稿金额、报告目标和来源版本保持一致。</li>'+
   '<li>对比 <code>wrong_thread.state</code>。用另一个任务键查询时，检查点计数为 0，状态为空。再查 <code>counts</code>，原任务的主清单和补录各读过一次。</li>'+
   '<li>在接收方核对 <code>before_resume_receiver.reports</code> 与 <code>receiver.reports</code>。等待批准时没有发布报告，恢复后只有一份，金额为 42。</li></ol>'+
   p('换到下面的本机 Kairo 实验，仍然核对执行进程、原任务和接收库。故障发生在提交之后，恢复进程还要用原操作键查回执，才能判定那份报告是否符合预期。');

  a.sections[5][1]+='<h3 id="kairo-native-commit-readback">Kairo 在提交后退出，怎样验收原回执</h3>'+
   p('用本机 Kairo 跑一份合成报告。模型按预定步骤做决策，接收方用本机 H2 数据库保存结果。准备进程先读主清单 10、27 和补录 5，保存会话与发布意图。另一个 Java 进程（JVM）提交了金额 42、来源第 3 版的报告。工具还没把回执返回给运行时，这个进程就以状态码 23 退出。')+
   table(['阶段','运行时或查询结果','独立读接收库'],[
    ['保存意图','保存 6 条会话消息','两次正文读取，0 份报告'],
    ['提交后退出','本地回执尚未保存','1 份报告，来源第 3 版，金额 42'],
    ['新 JVM 查询匹配回执','<code>RECEIPT_CONFIRMED</code>，写处理调用 0 次','仍是原来那一份'],
    ['新 JVM 要求来源第 4 版','<code>NEEDS_VERIFICATION</code>，写处理调用 0 次','仍是第 3 版的原报告']
   ]).replace('class="table-wrap"','class="table-wrap table-wrap-compact"')+
   p('两次恢复都按原操作查询。Kairo 运行状态均为 <code>COMPLETED</code>，业务验收分别得出上表的结论。宿主在四个阶段通过 Java 的数据库接口 JDBC，独立只读查询接收库。公开包可核对脱敏结果，公开来源仍标为未独立核实。第 8 节另有本机 Kairo 的 23 日报只读验收。生产接口、真实身份和远端工具仍待目标环境验收。')+
   p('这份 Kairo 记录对应 10+27+5=42 的写入实验。第 8 节的<a href="/article/kairo-practice/#native-agent-task-reconnect">本机任务重连实验</a>用参考服务跑另一份契约。原会话应收到 5+7+11=23，接收端的业务写入计数应为 0。两份记录分别回答写入后怎样查回执，以及提交响应丢失后怎样找回只读任务。')+
   trainingCode('解压后复核脱敏记录','SHELL','python3 -B verify_receipt_readback.py validation.json')+
   '<p class="practice-links"><a href="/labs/kairo-receipt-readback.zip" download>下载校验程序与记录 ↓</a> · <a href="/labs/kairo-receipt-readback/validation.json">查看四阶段记录 →</a> · <a href="/labs/kairo-receipt-readback/README.md">核对实验范围 →</a></p>';

  a.sections[7][1]+='<h3 id="native-agent-task-reconnect">受理响应没到，怎样找回原任务</h3>'+
  p('用同一份只读日报契约跑一遍本机参考实现。客户端提交 R1，服务把一条任务写进 SQLite，随即关闭连接。客户端连 HTTP 状态行也没收到。先从任务库查，已经有一行 <code>ACCEPTED</code>。这次生成的任务标识很长，下面把它叫作 T1。')+
  trainingFigure('agent-task-reconnect','客户端没收到响应时，任务库已有 T1。原样重传和修改参数，在服务端走两条不同分支。')+
  p('服务将请求内容算成摘要，与 R1 一起保存。重连原样提交，HTTP 202 返回同一个 T1。把来源从 A-v1 改成 A-v2，仍用 R1 提交，返回 HTTP 409。三次提交有三条记录，但只有一行任务。这里的摘要用于判断请求是否仍是原来的那份内容。')+
  p('接下来按固定步骤执行 T1。通过官方 MCP SDK 的 Streamable HTTP 读取 <code>reports-A</code>，得到 A-v1 的 5、7、11。另一条请求试读 <code>reports-B</code>。两次传输的 HTTP 状态都是 200，B 的工具结果带 <code>isError=true</code>。资源侧审计只记录到 A 的正文读取，没有 B 的正文或业务写入。')+
  table(['到哪核对','这次实际看到什么'],[
   ['客户端提交记录','首次断开，原样重传 202，改来源 409'],
   ['独立任务与交付库','一个 T1 结束为 SUCCEEDED，原会话收到 23，引用 A-e1、A-e2、A-e3'],
   ['换会话请求同一结果','HTTP 404'],
   ['资源服务的读取与效果记录','工具只读 A，B 拒绝且未读正文，前后资源版本和文件摘要相同']
  ])+
  p('任务受理、工具读取和会话交付各有记录。把它们按 T1 对上，再检查金额和引用。程序从这些记录导出 G10 的 JSON，交给前面的公开校验器，结果是 <code>record_consistent</code>。这个结论只说明记录满足契约，真实来源仍由客户端和两份独立账本核对。',
   '在<a href="/labs/agent-task-reconnect/validation.json">同一份实测记录</a>中，<code>g10.evidence.tool_receipts</code> 的 <code>a1</code> 表示 B 的请求被拒绝，返回的事件为空。验证正文访问还要查独立的 <code>resource.body_reads</code>，其中只有 <code>a0</code> 对 <code>reports-A</code> 的一条读取。若另有一条 <code>a1</code> 读取 B 的审计行，公开校验器的输入仍可能原样通过，因为导出契约没有收录正文读取审计。')+
  trainingCode('解压后运行本机参考实现，输出到新目录','SHELL','python -m pip install -r requirements.txt\npython -B reconnect_lab.py --output-dir replay')+
  p('参考服务使用固定身份和工具步骤。在目标环境验收时，保留同样的断线位置、原会话、两次读取和资源审计，用目标版本自己的接口与记录再跑一遍。')+
  '<p class="practice-links"><a href="/labs/agent-task-reconnect.zip" download>下载参考实现与记录 ↓</a> · <a href="/labs/agent-task-reconnect/README.md">复跑步骤 →</a> · <a href="/labs/agent-task-reconnect/validation.json">核对提交、MCP 调用和交付 →</a></p>'+
  p('本例在入口用原请求键 <code>R1</code> 找回已受理的任务 <code>T1</code>。<a href="/article/production-readiness/#admission-vs-tool-commit">综合实验在工具提交后退出</a>，由新工作进程沿原操作键重试，取回已保存的写入回执。两份实验分别核对任务数与实际写入数。')+
  p('在上方的 23 日报参考服务记录中，从 <code>task_after_lost</code> 到 <code>task_final</code>，始终只有原任务 T1，交付记录从 0 条增至 1 条。资源侧的 <code>resource.after.business_writes</code> 为空。只读约束的是业务资料，受理和交付仍要写入任务库。',
   '再看<a href="/article/kairo-practice/#kairo-native-commit-readback">第 6 节本机 Kairo 的 42 日报</a>。<a href="/labs/kairo-receipt-readback/validation.json">四阶段记录</a>里，发布进程提交后，接收库的报告数从 0 变为 1。两个恢复进程沿原操作查询，<code>write_handler_entries</code> 都为 0，库里仍保留原先那份第 3 版报告。')+
  '<h3 id="kairo-audit-coverage-check">从拒绝回执查到实际正文读取</h3>'+
  p('<a href="/article/agent-observability/#native-tail-sampling-ledger">G9 的采样实验</a>里，<code>R27-normal</code> 的追踪被过滤，接收库仍有金额 37 的提交。这里改查金额 23 的<a href="/labs/agent-task-reconnect/validation.json">本机参考服务记录</a>。用任务、尝试和对象标识，把工具回执与资源端的 <code>resource.body_reads</code> 逐行对上。允许读 A 的 <code>a0</code> 有一行，拒绝读 B 的 <code>a1</code> 没有读取行。',
   '确认审计覆盖整个任务、重试和所有正文读取入口，才把下方的 <code>coverage_complete</code> 设为真。只有部分记录时，即使可见行都对得上，零额外读取仍待核对。验收时还要单独核实记录来源。<a href="/article/kairo-practice/#kairo-native-readonly-reconnect">看另一组本机 Kairo 实跑公开了哪些读取证据</a>。')+
  '<details class="progressive-detail"><summary>展开只读核对程序</summary>'+
  p('把上面的 <code>validation.json</code> 和下方代码放在同一目录。将代码存为 <code>check_reads.py</code>，执行 <code>python3 check_reads.py</code>。修改仅发生在程序内存里的记录副本。')+
  trainingCode('核对允许的尝试与正文服务的读取次数','PYTHON',`import json
from collections import Counter
from pathlib import Path

record = json.loads(Path("validation.json").read_text(encoding="utf-8"))
task_id = record["task_final"]["tasks"][0]["task_id"]
receipts = record["g10"]["evidence"]["tool_receipts"]
reads = record["resource"]["body_reads"]
fields = ("task_id", "attempt_id", "resource")

def key(row):
    return tuple(row[field] for field in fields)

allowed = Counter(key(row) for row in receipts
                  if row["task_id"] == task_id and row["status"] == "success")

def check_body_reads(audit, *, coverage_complete):
    if audit is None:
        return "pending"
    observed = Counter(key(row) for row in audit if row["task_id"] == task_id)
    if observed - allowed:
        return "fail"
    if coverage_complete is not True:
        return "pending"
    return "pass" if observed == allowed else "fail"

denied = next(row for row in receipts
              if row["task_id"] == task_id and row["status"] == "denied")
extra_read = {field: denied[field] for field in fields}
cases = [("recorded", reads, True), ("extra-read", reads + [extra_read], True),
         ("partial-audit", reads, False), ("no-audit", None, False)]
for name, audit, coverage_complete in cases:
    result = check_body_reads(audit, coverage_complete=coverage_complete)
    print(name, record["g10"]["checker"]["status"], result)`)+
  p('本机完整审计只记录 A 的读取，输出 <code>recorded record_consistent pass</code>。加入 B 的读取后，独立核对变成 <code>extra-read record_consistent fail</code>。保留原来的行，只把覆盖标记改为不完整，输出 <code>partial-audit record_consistent pending</code>。完全缺少审计也得到 <code>pending</code>。',
   '四组的 <code>record_consistent</code> 来自同一份导出，表示该记录与契约相符。原始记录中 <code>provenance_verified</code> 仍为 <code>false</code>。验收目标环境时，要从目标版本另取资源端的完整审计，独立核实来源与覆盖范围。')+'</details>'+
  '<h3 id="kairo-native-readonly-reconnect">本机 Kairo 重连后，原会话怎样收到 23</h3>'+
  p('沿用<a href="/article/kairo-practice/#native-agent-task-reconnect">本节参考实验</a>的只读契约，在本机换用 Kairo 的工具执行器和权限检查。测试宿主提供仅本机可访问的 HTTP 入口，用 H2 保存任务和交付。首个 Java 进程受理 R1、保存 T1 后，在发出 HTTP 状态行前退出。第二个进程重开同一库，按原请求找回 T1，再由 Kairo 执行工具。')+
  table(['核对处','实测结果'],[
   ['入口与任务库','退出后只有一条 T1，状态为 <code>ACCEPTED</code>，尚无读取或交付。改来源仍用 R1 得到 HTTP 409，原样重提交得到 HTTP 200，沿用 T1 并进入 <code>SUCCEEDED</code>。'],
   ['Kairo 权限与独立库查询','A-v1 读取一次，取回 5、7、11。读 B、写 B 都由 Kairo 拒绝。独立只读 JDBC 查询显示 B 正文读取 0 次、业务写入 0 次，B 的版本和内容摘要前后一致。'],
   ['交付路由','<code>session-17</code> 取回唯一一份结果，金额 23，含三条来源引用。换会话查询同一 T1 得到 HTTP 404。']
  ]).replace('class="table-wrap"','class="table-wrap table-wrap-compact"')+
  p('<a href="/labs/kairo-local-readonly/validation.json">查看脱敏实测记录</a>。<code>resumed.body_reads</code> 按资源汇总，<code>reports-A</code> 为 1，<code>reports-B</code> 为 0。这份公开汇总没有逐次读取行，无法用上面的程序按尝试对账，<code>boundary.public_provenance_verified</code> 仍为 <code>false</code>。',
   '任务受理和会话路由由测试宿主负责，模型使用固定脚本。生产接口和真实身份验收仍需目标环境取证。');
  a.updated='2026.11.12';

 }
 }
})();
