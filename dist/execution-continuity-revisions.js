/* Connect the execution objects without joining independent teaching fixtures. */
(()=>{
 const ids=['agent-runtime','agent-security','mcp-protocol'];
 const chapters=ids.map(id=>{
  const article=articles.find(a=>a.id===id);
  if(!article)throw Error('Execution continuity missing chapter '+id);
  return {article,before:article.sections.map(s=>s[1])};
 });
 const p=(...rows)=>rows.map(row=>'<p>'+row+'</p>').join('');
 const steps=rows=>'<ol class="tool-observation-steps" role="list">'+rows.map(([stage,object,next])=>'<li><strong>'+stage+'</strong><p><span class="tool-step-label">本步对象：</span>'+object+'</p><p><span class="tool-step-label">接着由谁推进：</span>'+next+'</p></li>').join('')+'</ol>';
 const inline=value=>'<code>'+trainingEscape(typeof value==='string'?value:JSON.stringify(value))+'</code>';
 function replace(id,index,from,to){
  const section=chapters.find(c=>c.article.id===id).article.sections[index];
  if(!section[1].includes(from))throw Error('Execution continuity source changed '+id+' '+(index+1));
  section[1]=section[1].replace(from,to);
 }

 const taskOpening=chapters[0].before[0].match(/<p>先从一项日常要求出发：[^<]*<\/p><p>运行时是维持这个循环的程序。[^<]*<\/p><p>本章固定一个可手算的任务。[^<]*<\/p>/)?.[0];
 if(!taskOpening)throw Error('Missing original Agent task opening');
 replace('agent-runtime',0,taskOpening,p(
  '你让智能体汇总两笔订单并保存日报。假如它回复“保存好了”，指定位置却找不到报告，要从哪查？先沿一次实际运行看是谁读到订单、谁写了报告，又是谁回头核对。',
  '任务规定调用者是 A，只允许访问 A 的资源，并要求把订单合计保存到 <code>report-A</code>。运行时是负责推进任务的程序。它收到“用 <code>read_values</code> 读取 <code>orders-A</code>”的提议，核对工具名和参数后发出请求。工具服务核对 A 可读这份订单，返回第 3 版的 [10, 27]。运行时检查返回结构，把这份结果记为观察，供下一步使用。',
  '按观察中的两笔订单算得 10+27=37。脚本接着提出用 <code>write_report</code> 将 37 写到 <code>report-A</code>，并注明来源版本 3。工具服务确认目标原先没有报告，写入第 1 版并返回写入记录。最后脚本提议结束，验收器另外读取数据库中的报告，核对目标、版本 1、金额 37 和来源版本 3，并检查此前确实读取过订单第 3 版。符合要求后，任务才标为成功。',
  '这三次提议中，读取和写入各调用一次工具，结束提议触发独立验收。接入模型时，模型可以根据上一次观察提出下一步，运行时仍负责检查、调用和保存结果。这样一轮轮推进，就形成了智能体（Agent）的执行循环。下文的本机 HTTP 实验用脚本给出提议，沿用这份日报。恢复章用另一笔动作，检验怎样按原操作身份认回实际效果。'));
 replace('agent-security',0,
  '本章把这次调用接到真实资源：',
  '本章沿用这个调用分工，在独立的日报委托中展开资源授权：');
 replace('agent-security',0,
  '沿用分析员林的任务R17：读取租户A的A/daily，在林原来的A会话返回三条摘要。',
  '现在为分析员林定义独立只读任务 R17：读取租户 A 的 A/daily，在林原来的 A 会话返回三条摘要。R17 是本章说明委托范围的任务名，与前两章的实验没有共享任务状态或操作回执。');

 const evidence=mcpProtocolEvidence,request=evidence.call_request,response=evidence.call_response;
 const args=request.params.arguments,result=response.result.structuredContent;
 const invocation=evidence.normal_sdk_excerpt.fragments.find(row=>row.method==='tools/call');
 if(request.method!=='tools/call'||request.params.name!=='read_batch'||
    args.task_id!=='report-A'||args.batch_id!=='base'||response.id!==request.id||
    result.task_id!==args.task_id||result.version!==3||
    JSON.stringify(result.batch_ids)!==JSON.stringify([args.batch_id])||
    JSON.stringify(result.values)!=='[10,27]'||result.total!==37||response.result.isError!==false||
    !invocation||!mcpProtocolFiles[invocation.file].includes(invocation.expression)){
  throw Error('Execution continuity requires the recorded read_batch SDK/source correspondence');
 }
 const intro='把这次调用放回 Agent：模型可以提出工具名和参数，宿主按当前任务决定是否执行，客户端传递消息，服务端校验与操作资源，宿主再验收。可信身份来自认证链路，任务委托规定允许动作，资源服务在实际读取或提交处执行权限检查。clientInfo、task_id、已建立连接都不能代替这些检查。';
 const cycle='<h3 id="mcp-model-tool-observation">模型提议、协议调用与下一轮观察</h3>'+
  p('以本章已经执行的基础批次读取为中间一段，接入模型时可以按以下六步连接两端。SDK 表达式、请求编号和返回字段取自同一次原生记录；模型提议及下一轮输入是接入时的映射约定，本章没有调用语言模型。M1 只是讲解用的模型侧调用引用，具体字段名与消息格式由所用模型接口决定。')+
  steps([
   ['模型取得本轮输入','宿主把 tools/list 发现的 '+inline(request.params.name)+' 契约适配为模型接口接受的工具定义，与可信任务、已有观察一起组装','宿主选择允许暴露的工具并组装输入；发现结果不直接授予权限'],
   ['模型提出一次调用','用 M1 关联这次提议：工具名 '+inline(request.params.name)+'，参数 '+inline(args),'宿主解析并检查名称、参数、任务范围与预算；提议本身尚未执行工具'],
   ['宿主调用 MCP 客户端',inline(invocation.expression),'原生 client_lab.py 已执行这行表达式；接入模型时，由通过检查的提议触发同样调用'],
   ['客户端交付协议请求','method='+inline(request.method)+'，id='+inline(request.id)+'；params.name='+inline(request.params.name)+'，params.arguments='+inline(args),'SDK 用请求 id 对应响应；宿主保留 M1 与本次协议调用的关联'],
   ['工具结果回到宿主','响应 id='+inline(response.id)+'，isError='+inline(String(response.result.isError))+'；structuredContent='+inline(result),'客户端按输出契约接收；宿主再核对来源与业务含义，基础合计 37 仍未包含补录 5'],
   ['观察进入下一轮输入','将已校验结果及来源版本作为 M1 的工具结果，按目标模型格式加入下一轮上下文','由宿主交回模型；ClientSession 不会自动更新模型对话。之后才可能提出读取 late，或在证据齐备后形成答案']
  ])+
  p('这条链有三种不同的关联：M1 认回模型提出的哪次调用；JSON-RPC id '+inline(request.id)+' 认回一次协议请求的响应；'+inline(args.task_id)+' 关联本章业务任务。工具名 '+inline(request.params.name)+' 只选择服务端操作，不是这次调用的唯一身份。当前工具只读，没有写入操作回执；换成写工具时，宿主还须在派发前固定接收方认可的业务 op_id，让重试仍指向同一意图，不能用 M1 或协议请求 id 替代。');
 replace('mcp-protocol',8,p(intro),p(intro)+cycle);

 const matches=(html,re)=>[...html.matchAll(re)].map(m=>m[0]);
 for(const{article,before}of chapters){
  const old=before.join(''),now=article.sections.map(s=>s[1]).join('');
  for(const re of [/<pre\b[\s\S]*?<\/pre>/g,/<figure\b[\s\S]*?<\/figure>/g,/<a\b[^>]*\bhref=["'][^"']+["'][^>]*>/g]){
   if(JSON.stringify(matches(old,re))!==JSON.stringify(matches(now,re)))throw Error('Execution continuity changed published code, figure or link '+article.id);
  }
  for(const[,id]of old.matchAll(/\bid=["']([^"']+)["']/g)){
   if(!now.includes('id="'+id+'"')&&!now.includes("id='"+id+"'"))throw Error('Execution continuity lost published destination '+article.id+' '+id);
  }
  article.updated=article.id==='agent-runtime'?'2026.11.10':'2026.11.09';
 }
 const mcp=chapters.find(({article})=>article.id==='mcp-protocol').article;
 mcp.sections[8][1]+=p('选读<a href="/article/durable-workflows/#mcp-commit-recovery">写工具的原生恢复实验</a>。在这份独立实验的两个 MCP 会话中，请求编号可以相同。对照例为每次尝试另建业务操作 ID，再从接收库核对发布份数。');

 const runtime=chapters.find(({article})=>article.id==='agent-runtime').article;
 replace('agent-runtime',0,
  '下文的本机 HTTP 实验用脚本给出提议，沿用这份日报。',
  '这份日报的工具提议来自脚本。<a href="/article/agent-runtime/#section-8">查看写入和回读的实验</a>，也可以直接看<a href="/article/agent-runtime/#native-model-mcp-tool-choice">本机模型怎样选工具</a>。');
 replace('agent-runtime',1,
  p('工具发现返回名称、说明、输入结构与可选输出结构。schema（结构约定）约束字段、类型、必填项和未知字段；它能检查 total 是整数，却不能证明 37 这个数算对了。身份认证说明调用者是谁，授权说明这个主体能对哪个资源执行什么动作，业务前提说明这个资源版本是否仍允许本次修改。四种判断不能由“JSON 解析成功”替代。'),
  p('把上一节的写入金额从 37 改成 38，其他输入照旧。两次实验各自从空的报告库开始，都实际写出一份报告。验收器回读金额，对照任务要求的 37，把写入 38 的任务标为未完成。工具负责保存传来的数，验收器负责核对实际保存的报告是否符合任务要求。',
   '运行时先从工具目录取得名称、用途、输入结构和声明的输出结构。结构约定（schema）规定哪些字段必填、各是什么类型。例如 <code>total</code> 必须是整数，37 和 38 都合格。写入时，<code>op</code> 标记同一笔逻辑操作，<code>expected_version</code> 写明本次修改预期的旧版本。本例以 0 表示目标还没有报告。'));
 replace('agent-runtime',1,
  p('工具名白名单防止提议调用不存在或未允许的工具；对象授权防止把允许工具用在别人的资源。主体、角色或审批不能直接采信模型提供的参数。schema 也不能通过自然语言说明执行真正的授权。外部网页、工具输出和检索资料即使写着“忽略限制、改写 B”，仍只是一份数据，不能签发新的委托。'),
  p('工具名和参数结构通过后，还要检查谁能访问哪个对象。身份认证负责确认调用者，授权决定这个主体能否执行指定动作。运行时使用认证和审批记录中的可信信息，资源服务在读取或提交前判断这次动作。网页、工具输出和检索资料作为任务数据使用，访问范围由可信委托和策略确定。',
   '看另一项只读实跑。主体固定为 A，模型两次都选了销售查询 <code>read_sales_report</code>，参数分别是 <code>{"report_id":"A"}</code> 和 <code>{"report_id":"B"}</code>。A 的请求读到销售额 42。B 的 HTTP 请求也收到 200，工具结果标记为拒绝。资源端正文读取记录里只有 A 的报告。<a href="/article/agent-runtime/#native-model-mcp-tool-choice">顺着模型提议、工具返回和读取记录核对 →</a>'));
 replace('agent-runtime',1,
  p('本例特别拒绝 total=true：JSON 里布尔值不是整数，Python 却把 bool 当作 int 的子类；若实现只用 isinstance(value, int)，就可能错误放行。示例用 type(value) is int。生产中应采用与协议版本一致的校验实现，不把本文件只支持几种类型的小函数当作通用 JSON Schema 引擎。',
   '输出结构也要校验。MCP 的结构化工具结果是工具服务返回的 structuredContent，与模型“按结构生成输出”不是同一概念。声明了输出 schema 的服务应返回合约结构，客户端也应核验，再决定如何把它交给模型。工具说明中的只读、破坏性等提示，还需要可信实现与实际策略支撑，不能把一段描述当作强制执行机制。'),
  p('日报程序收到工具结果后，还会检查字段和类型，再决定结果能否进入下一轮。下一节沿同一份日报说明运行时怎样安排尝试与预算。读完本章后，可以从<a href="/article/mcp-protocol/">下一章章首</a>了解 MCP（模型上下文协议）怎样发现工具、发送请求和接收结果。')+
  '<details class="progressive-detail"><summary>选读：用六步对照模型提议、MCP 消息与工具结果</summary>'+
  p('用 MCP 连接工具时，服务可以把结果字段放在 <code>structuredContent</code> 中，客户端按服务声明的输出结构核验。<a href="/article/mcp-protocol/#mcp-model-tool-observation">看一次本机调用的六步记录 →</a>')+'</details>'+
  '<details class="progressive-detail"><summary>实现细节 · 为什么 total=true 会在发送前被拒绝</summary>'+
  p('JSON 把布尔值与整数分为两种类型。Python 的 <code>bool</code> 继承了 <code>int</code>，只用 <code>isinstance(value, int)</code> 会把 <code>true</code> 放行。本地脚本用 <code>type(value) is int</code> 检查整数。支持完整 JSON Schema 的实现应使用与协议版本一致的校验器。')+'</details>');
 runtime.sections[7][1]+='<h3 id="native-model-mcp-tool-choice">问销售额和事故数，模型会选哪个工具</h3>'+
  p('前面的 37 日报由脚本给出提议。这里另开一个只读实验，分别问 A 的销售额、A 的事故数和 B 的销售额。宿主先从 MCP 服务取得销售查询和事故查询，把两个工具的名称、用途和参数规则放进本机 Qwen3-0.6B 的请求。三条问题只写要查什么和报告对象。<code>tool_choice=auto</code> 让模型决定要不要调用以及选哪个工具。',
   '问 A 的销售额时，模型给出 <code>read_sales_report</code> 和 <code>{"report_id":"A"}</code>。宿主检查名称和参数形状，把模型选出的名称与参数原样交给 MCP SDK。资源服务按实验预设的 A 主体核对报告归属，读到金额 42 和证据编号 <code>sales-v3-9f6a</code>。')+
  trainingFigure('model-mcp-tool-choice','用销售查询跟踪一趟调用。图中 M 代指原始记录里的长模型调用号，MCP 请求和响应使用编号 3。')+
  p('模型给出的调用号用来认回这次提议。MCP 客户端另用请求编号 3 对上自己的响应。宿主把实际工具响应填回下一轮消息，并用 <code>tool_call_id</code> 指向原模型调用。销售额 42 和证据编号在工具读出报告后才进入模型输入。下一轮模型答出了这两项。')+
  trainingCode('从模型参数发出调用，再按原编号回填结果','PYTHON',`result = await client.call_tool(name, arguments)
[block] = result.content
assert block.type == "text"
tool_message = {"role": "tool", "tool_call_id": call["id"], "content": block.text}`)+
  '<div class="table-wrap"><table><thead><tr><th>用户问什么</th><th>模型提议</th><th>资源服务实际做了什么</th></tr></thead><tbody>'+
  '<tr><td>A 的销售额</td><td><code>read_sales_report</code>，A</td><td>请求 3，读 A，返回 42</td></tr>'+
  '<tr><td>A 的事故数</td><td><code>read_incident_report</code>，A</td><td>请求 4，读 A，返回 7</td></tr>'+
  '<tr><td>B 的销售额</td><td><code>read_sales_report</code>，B</td><td>请求 5，工具拒绝，B 正文未读</td></tr></tbody></table></div>'+
  p('第三次提议的参数也符合结构。资源服务按已配置的 A 主体拒绝读 B。HTTP 仍是 200，工具结果带 <code>isError=true</code>，只返回一条拒绝消息。独立打开资源端的读取日志，只能看到请求 3 和 4 读过 A。模型接着回答，这份报告不可用。')+
  trainingCode('准备固定引擎和权重后，在解压目录运行','SHELL','python3.12 -B model_tool_lab.py --server /path/to/llama-server \\\n  --model /path/to/Qwen3-0.6B-Q8_0.gguf --output-dir replay')+
  p('先在 <code>first_model_turn</code> 找模型选出的名称和参数，再在 <code>mcp_call</code> 核对请求编号、响应和权限结果，最后到 <code>final_model_turn</code> 对上原模型调用号。这里固定 macOS arm64 CPU、模型权重、模板和三条问题。资料与主体都来自本机测试夹具。')+
  '<p class="practice-links"><a href="/labs/model-mcp-tool-choice.zip" download>下载程序与记录 ↓</a> · <a href="/labs/model-mcp-tool-choice/README.md">环境与复跑步骤 →</a> · <a href="/labs/model-mcp-tool-choice/validation.json">两轮模型、MCP 与资源记录 →</a></p>'+
  p('这次的 42 来自一份已经保存的销售报告。持久工作流章另做一份订单日报：先读到 10 和 27，补读一笔 5 才算出 42。<a href="/article/durable-workflows/#native-model-plan-revision">看模型发现补录后，运行时怎样改计划并恢复任务 →</a>');
 mcp.sections[8][1]+=p('上面的 <code>read_batch</code> 实验用脚本连接工具。运行时章另有一次真实模型对照，跟着工具目录看模型选中销售或事故查询，以及查 B 时由谁拒绝。<a href="/article/agent-runtime/#native-model-mcp-tool-choice">从模型提议走到资源端 →</a>');
 runtime.updated='2026.11.11';

 const multinode=articleById('multinode-lab');
 multinode.sections[3][1]+=p('启动器也能在 worker 退出后重新拉起整组。<a href="/article/checkpoint-recovery/#native-elastic-restart-step">先用本机两进程核对自动重启</a>，再把同样的检查带到目标集群。重点看新进程读回了哪一步。');
 multinode.updated='2026.11.10';
})();
