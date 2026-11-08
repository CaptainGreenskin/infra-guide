/* Original Chinese lesson; build-mcp-protocol.py embeds source and actual observations. */
const mcpProtocolFiles=__MCP_FILES__;
const mcpProtocolEvidence=__MCP_EVIDENCE__;
Object.assign(sources,{
 mcpModernBase:['MCP 2026-07-28 · 消息与逐请求上下文','https://modelcontextprotocol.io/specification/2026-07-28/basic'],
 mcpModernVersions:['MCP 2026-07-28 · 版本与兼容','https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning'],
 mcpModernTools:['MCP 2026-07-28 · 工具与结果','https://modelcontextprotocol.io/specification/2026-07-28/server/tools'],
 mcpModernStdio:['MCP 2026-07-28 · stdio传输','https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio'],
 mcpLegacyInit:['MCP 2025-11-25 · 旧版初始化','https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle'],
 mcpPythonV2:['官方Python SDK 2.3.0 · 版本迁移与取消','https://github.com/modelcontextprotocol/python-sdk/blob/v2.3.0/docs/migration.md']
});
const mcpProtocolTable=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const mcpProtocolFigure=(name,height,caption)=>'<figure class="training-figure"><a href="diagrams/mcp-protocol-'+name+'.svg" target="_blank" rel="noopener" aria-label="放大：'+caption+'"><img src="diagrams/mcp-protocol-'+name+'.svg" width="1120" height="'+height+'" alt="'+caption+'" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>'+caption+'</figcaption></figure>';
const mcpProtocolJSON=(title,value)=>trainingCode(title,'JSON',JSON.stringify(value,null,2));
const mcpProtocolSections=[
 ['先分清宿主、客户端、服务端与工具',
  para('上一章已经把模型提议、工具执行和任务完成分开。现在追踪其中一段：宿主应用想读取订单批次，怎样找到工具、发送参数，并认回这一调用的结果？MCP（Model Context Protocol，模型上下文协议）为这些交互约定消息和能力。本章直接用脚本发起调用，先看清协议如何工作，之后再把模型放回提议位置。',
  '宿主应用是组织任务、模型与工具的程序；MCP客户端是宿主中负责一种协议交互的部件。MCP服务端接收请求，提供工具、资料或提示模板等能力。工具是服务端公开的一项操作，例如read_batch读取一个批次。模型可以提出要调用哪个工具，实际连接、参数交付、超时和结果核对仍由执行系统负责。')+
  mcpProtocolTable(['对象','本例在哪里','负责什么'],[
   ['宿主应用','client_lab.py','固定任务report-A，选择调用，收集结果，按来源独立核对42'],
   ['MCP客户端','宿主中的ClientSession实例','组织协议请求、对应响应，分发进度，传递取消'],
   ['MCP服务端','独立运行的server.py进程','公布3个工具，校验参数，读取固定资料，返回结果'],
   ['资料与业务判据','orders.json及宿主验收函数','基础[10,27]与补录[5]是来源；协议通过后仍要核对总数和版本']
  ])+
  mcpProtocolFigure('objects',660,'同一份订单任务：宿主包含客户端，服务端另起进程，协议连接与权威来源分开。')+
  para('本章使用标准输入输出传输（stdio）：客户端启动服务端子进程，通过管道读写UTF-8编码的一行一条JSON消息。JSON是用字段名和值表示数据的文本格式，工具参数和结果都可以用它表达。服务端标准输出必须留给协议；普通日志写到标准错误或独立文件，否则一句调试文字也可能破坏消息解析。',
  '另一种常见传输通过HTTP连接服务端。本章没有启动HTTP服务器，也没有实现其认证流程；先把同一份消息的责任看清，再按实际部署方式选择传输。MCP还可以公开资料读取和提示模板能力，这个受控服务端只公开工具，发现结果中也只声明tools能力。')],
 ['请求、响应、通知，先按消息职责读',
  para('JSON-RPC规定了请求与响应的基本形状。请求带method方法名、params参数和id请求标识；响应带相同id，并返回result结果或error协议错误。客户端可以同时等待多个调用，依靠id把各份响应交还给正确的等待者。',
  '通知只单向报告一件事，不等待对应响应，因此没有id。进度通知说“做到哪里”，取消通知说“请停止哪项尚在执行的请求”。通知中的progressToken或requestId是被引用的标识，不等于通知本身拥有一个请求id。下一节先明确版本和元数据，再读本例真正发出的完整请求。')+
  mcpProtocolTable(['消息里的名字','属于什么对象','本例怎样使用'],[
   ['JSON-RPC id','本方向的一次协议请求','读取base用id3，等待调用用id8；重连后可以出现相同数字'],
   ['method与工具name','协议方法与服务端公开的操作','tools/call是方法，read_batch是这次选择的工具'],
   ['arguments.task_id','业务任务的显式引用','report-A说明正在读取哪份固定任务资料；不由连接身份暗中推断'],
   ['一次业务操作的稳定标识','需要跨尝试认回的业务意图','本例工具只读；若改为写入，必须另按接收方契约记录稳定身份与回执'],
   ['progressToken','某次进行中调用的进度关联','SDK本次选择与请求id相同的7或8；协议没有要求两者必须相等']
  ])+
  para('请求id用于对应消息，不提供跨连接去重，也不是业务授权。ClientSession是SDK管理消息和连接的类名；现代MCP并不把一条管道当成一次对话或一项任务。需要跨请求保留的业务状态，应有显式标识；宿主中的上下文、服务端资源和连接各有自己的寿命。')],
 ['版本决定起点：现代逐请求，旧版先初始化',
  para('截至本章核对的2026-07-28版，现代MCP没有初始化握手。每个请求在_meta中携带协议版本、客户端实现信息和客户端能力，服务端独立判断该请求。版本不支持时返回明确错误；客户端再选择共同支持版本或报告不兼容。不能把某次较早请求中的上下文当成后来请求的隐含前提。',
  'server/discover用于发现服务端支持的版本和能力，是可选探测。现代客户端也可以直接发带完整元数据的普通请求，处理不支持版本的错误；同时兼容新旧服务端的stdio客户端可以先探测，再根据结果选择相应路径。本例主动调用ClientSession.discover()，目的是把所选路径和返回能力留成可检查记录。')+
  para('下面三个字段都位于_meta，名称统一带io.modelcontextprotocol/前缀。表中使用字段短名，紧接下方的实际消息保留完整名称。')+
  mcpProtocolTable(['字段短名','含义','本次实际值'],[
   ['<code>protocolVersion</code>','这次请求使用的协议版本','2026-07-28'],
   ['<code>clientInfo</code>','客户端自行声明的实现名字和版本','infra-guide-host / 1.0.0'],
   ['<code>clientCapabilities</code>','客户端声明支持的可选能力','空对象；本例未开放其他客户端能力']
  ])+
  para('先沿现代连接走完一次正常读取：本例主动探测版本与能力，调用tools/list发现工具，再按发现到的参数契约调用read_batch，最终认回结果37。这里不是先猜一份请求JSON；服务端已经通过工具列表说明了允许怎样调用。',
  'tools/list返回工具名与输入结构inputSchema。输入结构用JSON Schema描述参数对象的字段和类型；下面只提取本次真实响应中read_batch的必要约束。本次调用的两个字段都必填，值都必须是字符串，而且不接受额外字段。下一节再展开其他工具和输出结构。')+
  mcpProtocolTable(['已发现的契约项目','实际规则','本次调用怎样填写'],[
   ['工具名','<code>'+trainingEscape(mcpProtocolEvidence.read_batch_contract.name)+'</code>','选择read_batch'],
   ['参数整体','<code>'+trainingEscape(mcpProtocolEvidence.read_batch_contract.inputSchema.type)+'</code>：字段组成的对象','填写task_id与batch_id'],
   ['task_id','<code>'+trainingEscape(mcpProtocolEvidence.read_batch_contract.inputSchema.properties.task_id.type)+'</code>；必填','字符串report-A'],
   ['batch_id','<code>'+trainingEscape(mcpProtocolEvidence.read_batch_contract.inputSchema.properties.batch_id.type)+'</code>；必填','字符串base'],
   ['额外字段','additionalProperties='+trainingEscape(String(mcpProtocolEvidence.read_batch_contract.inputSchema.additionalProperties)),'不附带其他字段']
  ])+
  para('对应到官方SDK，下面三行是从已执行的client_lab.py逐字摘出的调用表达式。Python的await表示在这一行等待调用结果；等待期间，可让其他异步工作继续推进。这三行本身仍按顺序等待各自结果。此时程序已经进入stdio和ClientSession上下文；这里省略了返回值赋值、观察记录及断言，也省略了错误与取消对照，不是一份可单独运行的程序。完整程序仍放在本章实战节。')+
  trainingCode('跟读实际执行的现代SDK表达式 · 节选','PYTHON',mcpProtocolEvidence.normal_sdk_excerpt.text)+
  para('第一行读取并采用服务端的发现结果；第二行取得工具契约；第三行把符合该契约的任务与批次交给read_batch。SDK据此组织的完整请求如下；成功响应中的37由下一节继续拆开。')+
  mcpProtocolJSON('这些概念放回真实请求：本次read_batch的完整发送字段',mcpProtocolEvidence.call_request)+
  para('同一次调用的响应id为<code>'+trainingEscape(String(mcpProtocolEvidence.call_response.id))+'</code>，与上面的请求一致；结构化数据字段structuredContent中的values为<code>'+trainingEscape(JSON.stringify(mcpProtocolEvidence.call_response.result.structuredContent.values))+'</code>，total为<code>'+trainingEscape(String(mcpProtocolEvidence.call_response.result.structuredContent.total))+'</code>。至此认回了基础批次的两个值及其合计。完整响应怎样表达工具结果，下一节再逐项拆解。')+
  para('能力说明支持什么协议功能。例如服务端tools.listChanged=false表示没有声明工具列表变化通知能力，不是“工具不能使用”。实现信息也不是身份凭据，攻击者可以自称某个客户端名字。业务授权要回到可信身份、任务委托与资源策略，不能看clientInfo便放行。',
  '2025-11-25及更早版本采用另一条规则：客户端先发initialize，交换版本、能力和实现信息；收到成功响应后，再发notifications/initialized，进入普通操作。本例为它另起一份服务端进程并调用initialize()，协商结果是2025-11-25。两代消息有兼容关系，但不能把旧握手当成现代必经步骤，也不能在同一段时序里任意混用。')+
  mcpProtocolFigure('versions',780,'本次两条真实连接：现代主动discover；旧版initialize后通知就绪。每条连接采用各自版本规则。')+
  para('本实验的SDK包版本是mcp 2.3.0，宿主实现版本是1.0.0，协议版本是日期2026-07-28或2025-11-25。这三个版本回答不同问题：用了哪份库、运行哪个应用实现、按哪一份消息契约交互。遇到文档或示例不一致，先把这三项对齐。')],
 ['发现工具之后，再把参数交给执行者',
  para('tools/list返回工具名、描述和输入结构。输入结构inputSchema使用JSON Schema描述允许的字段、类型和必需项；本例read_batch要求字符串task_id与batch_id，并拒绝额外字段。发现工具是取得调用契约，实际执行仍需另发tools/call。')+
  mcpProtocolTable(['工具','输入与操作','正常输出或结束条件'],[
   ['read_batch','task_id、batch_id；读取一份固定批次','base返回[10,27]与total=37；late返回[5]'],
   ['scan_batches','task_id、batch_ids；依次读取多个批次','base、late合并为[10,27,5]与total=42，并报告进度'],
   ['watch_batch','task_id、batch_id；打开来源文件后等待','保持进行中，供下一节实际取消并检查资源清理']
  ])+
  para('SDK负责消息传递，不替代服务端的业务检查。本例在服务端处理器里明确调用JSON Schema校验；参数形状正确之后，再查任务与批次是否存在。把batch_id写成27属于类型错误；写成字符串missing则形状正确，但找不到业务资料。两种情况都需要清楚反馈，不能等到任意数据库异常再笼统返回失败。',
  '输出结构outputSchema同样约束字段与类型。成功结果可以同时包含便于机器使用的structuredContent和便于展示的content文本；本例两者表达同一份JSON，客户端逐项核对一致。isError表示工具是否报告执行错误；现代结果中的resultType说明结果属于哪种类型，本例complete表示本轮已返回完整结果。结构校验能发现缺字段、错误类型，却不知道某个合法整数是否满足这项任务。')+
  mcpProtocolJSON('本次正常读取的响应：id3对应前面的请求',mcpProtocolEvidence.call_response)],
 ['收到结果、工具成功与任务正确，要分开验',
  para('协议错误在JSON-RPC的error中返回；工具执行错误放在工具结果里，并设isError=true。这里的“工具执行错误”也包括参数值不适用或业务资料不存在。上层要根据错误所属层决定修正参数、报告缺失，还是停止本次任务，不能把所有错误统一重试。')+
  mcpProtocolTable(['本次实际情形','消息或SDK所见','继续核对什么'],[
   ['未知工具unknown_tool','JSON-RPC error，code=-32602；客户端捕获MCPError','先修正工具选择，不把不存在的工具当成临时服务故障'],
   ['batch_id=27','返回工具结果，isError=true','类型不符；用发现到的inputSchema检查调用参数'],
   ['batch_id=missing','返回工具结果，isError=true','类型正确，资料不存在；核对业务目标与来源'],
   ['正常扫描两份批次','isError=false；结构合法；total=42','宿主重新读取权威来源，核对版本、值和总数'],
   ['故意错误的第三个服务端','isError=false；结构合法；total=41','SDK可接收，独立任务判据必须拒绝']
  ])+
  mcpProtocolJSON('未知工具的真实协议错误响应',mcpProtocolEvidence.protocol_error_response)+
  para('现代结果中的resultType=complete表示本轮请求返回了完整结果；它不抹掉isError，也不证明业务正确。第三份进程专门开启wrong-total反例：返回[10,27,5]，却把total写成41。字段齐全、总数也是整数，因此输出结构验证通过；宿主直接读取orders.json，算得10+27+5=42，拒绝把这份报告视为完成。',
  '这个判据不相信服务端自己宣布的成功，也不只比较两份来自同一错误函数的输出。它读取独立来源，并同时核对task_id、来源版本、批次列表、值与总数。完整Agent还要验证权限、实际副作用和用户目标，接着在任务验收章节展开。')],
 ['进度属于调用过程，不能代替完成结果',
  para('客户端希望收到进度时，在这次调用中提供progressToken。服务端随后发送notifications/progress，携带该token、当前进度、可选总量和说明；同一进行中操作的进度数值应递增。宿主提供一个回调函数，即让SDK在收到这类消息后调用的处理函数。进度是过程观察，不要求每个工具都发送，也不是业务提交回执。',
  '本例scan_batches先读base，再读late。真实通知依次是1/2、2/2；它们引用请求7中提供的进度token7，但通知本身没有id。工具最终结果另以id7返回42。请求标识、进度关联、业务任务report-A分别把消息、过程和目标串起来。')+
  mcpProtocolTable(['实际观测','对应对象','不能据此推出'],[
   ['progress=1,total=2','已报告读完base','补录已经读到或总数已经正确'],
   ['progress=2,total=2','已报告读完两份输入','宿主已经处理完全部进度回调'],
   ['id7的工具结果total=42','本次调用已返回结果','更大的用户任务已验收或报告已经发布']
  ])+
  para('真实传输中，进度通知与最终响应分别交付，客户端回调可能还在处理时call_tool()就已返回。本程序用一个可设置、可等待的同步信号确认第二份回调，并给等待设置5秒上限。这里的5秒是测试的停止条件，不是测出来的网络性能；不能靠“睡一会儿”假定回调已经到齐。')],
 ['取消后，分别检查等待者、处理器和资源',
  para('取消至少涉及三份状态：客户端是否还在等，服务端处理器是否停止，处理器持有的资源是否释放。协议取消通知引用一项已发出、被认为仍在进行中的请求。它表达停止意图；处理已经完成、标识未知或工具无法取消时，对端可能无法按意图停下。旧版initialize握手不能作为客户端取消目标。已经发生的外部业务效果也不会因为一份通知自动撤销。',
  'AnyIO是组织Python异步任务的库，让程序在一段工作等待时仍可推进其他工作。取消作用域是用来限定这些工作寿命的代码块。在官方Python SDK 2.3.0中，取消等待请求的任务或其取消作用域，会让SDK消息分发部件发送对应的notifications/cancelled。本例先等watch_batch报告文件已经打开，再取消它的等待作用域，避免在请求尚未开始时就自称验证了服务端取消；这也不是业务审批或回滚事务。')+
  mcpProtocolJSON('SDK本次实际发出的取消通知：通知自身没有id',mcpProtocolEvidence.cancel_notification)+
  mcpProtocolFigure('cancellation',820,'调用8被取消后，文件已关闭，服务端仍能处理调用9；EOF后的进程退出是另一步。')+
  para('服务端处理器捕获取消，finally关闭真实文件；宿主从独立事件文件核对file_closed=true，并确认没有针对id8的响应。随后用同一个客户端、同一份服务端进程读取late，返回5。这证明本例取消了一个调用并清理资源，而不是杀死整个服务来制造“没有响应”。',
  '最后退出stdio上下文：客户端关闭写向服务端的输入管道，服务端读到EOF（字节流结束）并退出。SDK回收它后，宿主再检查该进程标识（PID）已经不存在。本例服务端没有派生其他进程；连接关闭、业务任务结束、所有派生资源退出仍是三种不同边界，真实服务需要各自管理。')],
 ['实战：三个进程、两代协议与独立验收',
  '<div id="mcp-protocol-run">'+
  para('完整实验已经使用官方SDK真实运行。modern、legacy、wrong-total各启动独立server.py；工具只读本地固定资料，没有模型或网络服务，无需账号与密钥。环境为Python 3.12.13与mcp 2.3.0，依赖精确固定在下载包。进程存活检查使用macOS/Linux的进程接口，本次验证macOS；Linux可按同一命令复跑。')+
  trainingCode('解压完整mcp-protocol目录，在该目录执行','SHELL','python3.12 -m venv .venv\n.venv/bin/python -m pip install -r requirements.txt\n.venv/bin/python -B client_lab.py --output-dir run-01 > result.json\npython3 -m json.tool result.json')+
  para('run-01必须尚不存在；要重跑可换新目录，或不传--output-dir，使用自动清理的临时目录。result.json是这次运行实际生成的结果；预先保存的validation.json用于核对源码与作者当时的输出，不能代替自己的执行。')+
  mcpProtocolTable(['先读哪段源码','把哪条知识落实成行为','应看到的检查'],[
   ['server.py的工具声明与call_tool','输入结构、工具错误、JSON-RPC错误分别返回','类型27、missing、unknown_tool落入不同分支'],
   ['client_lab.py的connection','真实stdio、官方ClientSession与两种版本起点','现代所有请求带_meta；旧版有initialize和initialized'],
   ['Tap与服务端事件文件','观察真实传输消息与真实处理器行为','消息方向、请求id、通知引用和资源清理能互相核对'],
   ['watch_batch与waiting_call','等待进度后取消一个调用，保留连接','id8取消，无对应响应；文件关闭；id9仍返回5'],
   ['matches_source与independent_oracle','直接读取权威来源验收','正常42通过；结构合法但错误的41被拒绝']
  ])+
  '<details class="full-code"><summary>展开完整server.py · 与下载源码逐字一致</summary>'+trainingCode('server.py','PYTHON',mcpProtocolFiles['server.py'])+'</details>'+
  '<details class="full-code"><summary>展开完整client_lab.py · 与下载源码逐字一致</summary>'+trainingCode('client_lab.py','PYTHON',mcpProtocolFiles['client_lab.py'])+'</details>'+
  para('<a href="labs/mcp-protocol.zip" download>下载完整实验ZIP ↗</a> · <a href="labs/mcp-protocol/README.md">运行说明与验证边界 ↗</a> · <a href="labs/mcp-protocol/validation.json">源码摘要与真实执行记录 ↗</a>。参数结构、返回值和图中请求编号来自同一次程序输出；Tap只观察真实SDK流，不制造响应。')+'</div>'],
 ['把协议连接回Agent系统的责任边界',
  para('MCP把工具发现和调用变成可互通的契约，宿主仍要负责选择暴露哪些工具、决定何时执行、控制预算和独立验收。客户端实现信息是声明，不是认证；连接已经建立，也不等于当前任务有权读取某份资料。HTTP场景的认证与凭据传递需要另按传输规范实施，不能从这个stdio夹具外推。')+
  mcpProtocolTable(['接下来遇到的问题','继续哪条知识链','本章留下的边界'],[
   ['知道工具名，是否就能执行','<a href="/article/agent-security/">可信身份、任务委托与提交授权</a>','本地启动者受信；未实现HTTP认证或远端身份'],
   ['取消或断线后，外部写入是否发生','<a href="/article/agent-recovery/">效果、回执、恢复与业务去重</a>','本章只有只读工具与文件清理，不证明写入回滚'],
   ['同一连接的多次调用怎样组成任务','<a href="/article/durable-workflows/">计划、事实、持久等待与恢复</a>','协议请求id不替代业务操作身份或持久历史'],
   ['模型应该看到哪些结果与资料','<a href="/article/agent-memory/">模型上下文与执行状态</a>','连接寿命不等于对话记忆或资料有效期'],
   ['怎样接到Kairo','<a href="/article/kairo-practice/">真实接口映射与独立验收</a>','SDK程序不是Kairo适配器，目标平台仍需实际版本与接口证据']
  ])+
  para('用同一份任务复述整条链：宿主说明要读report-A的批次，客户端按确定版本发现和调用工具，服务端校验并读取来源，响应按请求id认回，进度与取消各走自己的通知，最后由宿主核对42。把这几步画在一张图里，再讨论换成远端HTTP、写入工具或多个执行者时，哪一条责任需要新增机制。')]
];
articles.push({
 id:'mcp-protocol',module:'agent',number:'G1.1',title:'MCP协议与真实SDK：发现、调用、进度与取消',
 desc:'先把宿主、客户端、服务端和消息关系讲清，再用官方SDK实际运行现代协议、旧版兼容、失败分层与取消清理。',
 intro:'从一份42的订单汇总出发，沿真实stdio消息和来源事实读懂MCP；协议成功之后，任务仍要独立验收。',
 level:'原理 + 官方SDK实战',minutes:45,edition:'工具协议专题',updated:'2026.11.08',
 tags:['MCP','stdio','协议版本','官方SDK','取消'],
 baseline:'Python 3.12.13 · mcp 2.3.0 · 真实stdio子进程；2026-07-28与2025-11-25分开验证',
 prereq:'先理解Agent任务、工具提议、执行结果与完成判据；本章直接用脚本发起调用，不要求GPU训练知识。',
 objectives:['画清宿主、客户端、服务端、工具与权威来源的关系','区分现代逐请求规则与旧版initialize握手','沿真实消息认回结果、进度与取消，并核对处理器和文件清理','用独立来源拒绝结构合法且isError=false的错误41'],
 check:['为什么2026-07-28连接不需要initialize，而示例中仍可以主动discover？','请求id、进度token、task_id和业务操作身份分别属于谁？','未知工具、错误参数、缺批次、错误总数41分别在哪一层被拒绝？','call_tool返回后，能否断言所有进度回调都处理完？','取消等待之后，需要什么证据证明服务端处理器和资源也已清理？'],
 exercise:['宿主重新连接服务端后，新的请求也使用id8。能否用这个数字认回上次发布操作，或把上次批准应用到这次调用？如果这次工具只读成功且结构合法，total却是41，任务完成了吗？','不能。请求id只在相应消息与连接方向内认回响应，不是跨尝试的业务身份或授权。写入需按效果接收方契约保存稳定操作与批准绑定。只读返回的41也未满足当前来源[10,27,5]的42，必须由独立任务判据拒绝。'],
 related:['agent-runtime','agent-security','agent-recovery','durable-workflows','agent-memory'],
 refs:['mcpModernBase','mcpModernVersions','mcpModernTools','mcpModernStdio','mcpLegacyInit','mcpPythonV2'],
 sections:mcpProtocolSections
});
