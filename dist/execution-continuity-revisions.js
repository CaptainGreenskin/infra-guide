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
  '你让智能体汇总订单并保存报告。假如它回复“保存好了”，指定位置却找不到报告，要从哪查？模型可以提出读订单或保存报告。运行时核对当前任务和权限，把获准的动作交给工具。真正读取数据、写入报告的是这些工具。',
  '这次由身份 A 发起任务，只允许访问 A 的资源。工具从 orders-A 的第 3 版取回两笔订单 [10, 27]。运行时保存进度，把这次读到的内容交给模型，模型可以据此提出下一步。这样根据工具返回继续选择动作，就形成了智能体（Agent）的执行循环。',
  '要完成这次任务，report-A 的第 1 版必须写入指定位置，合计 10+27=37，并标明来源是第 3 版。写工具返回后，验收器到指定位置另读一次，核对这三项。下文的本机 HTTP 实验用脚本给出提议，沿用这份日报。恢复章用另一笔动作，检验怎样按原操作身份认回实际效果。'));
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

 const multinode=articleById('multinode-lab');
 multinode.sections[3][1]+=p('启动器也能在 worker 退出后重新拉起整组。<a href="/article/checkpoint-recovery/#native-elastic-restart-step">先用本机两进程核对自动重启</a>，再把同样的检查带到目标集群。重点看新进程读回了哪一步。');
 multinode.updated='2026.11.10';
})();
