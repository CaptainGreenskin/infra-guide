/* Transport completion, argument completion and tool admission remain distinct. */
const streamedToolLinks='<p class="practice-links"><a href="labs/streamed-tool-calls.zip" download>下载流式工具参数实验 ↓</a><a href="labs/streamed-tool-calls/README.md" target="_blank" rel="noopener">协议范围、环境与变化题 ↗</a><a href="labs/streamed-tool-calls/validation.json" target="_blank" rel="noopener">十三组实际流与源码摘要 ↗</a></p>';
Object.assign(sources,{
 v37SSE:['WHATWG · SSE 字符编码、事件边界与 EOF','https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream'],
 v37Codecs:['Python 3.12 · 增量编解码状态','https://docs.python.org/3.12/library/codecs.html#incremental-encoding-and-decoding'],
 v37JSON:['Python 3.12 · JSON 重复键与解析钩子','https://docs.python.org/3.12/library/json.html#repeated-names-within-an-object']
});
{
 const a=articles.find(a=>a.id==='agent-runtime');
 a.sections[1][1]+='<h3>流式参数到达时，先识别三种边界</h3>'+para(
  '上游分段给出工具参数时，执行器先面对字节，而不是一个现成的参数对象。一次 HTTP 读取可能停在汉字的 UTF-8 编码中间；服务端事件流（SSE）又用行和空行组织事件，字符还原后还需找到完整事件。事件里的 delta（参数增量）仍可能只是一次调用的部分参数。三个“收齐”分别处理，不能看到片段中出现工具名就执行。',
  '后面的只读日报实验声明自己的 start/delta/done 封装：start 固定工具调用编号 call_id 和名称；delta 为这个调用追加参数字符串；对应 done 才表示这次参数输出结束。不同调用的片段可以交错，按 call_id 分开收集。真实适配时映射所用协议的完结信号，不能把本实验字段直接当作某家模型或 MCP 的通用格式。')+
  figure('v37-stream-boundaries','正常固定流的实际账本：响应体 287 字节、41 次读取、3 个完整事件，最后准入 1 次本地只读回调。每一层只证明自己的完成条件。')+
  table(['收齐哪一层','完成条件','此时能否执行工具'],[
   ['UTF-8 字符','增量解码器保留未完字节，补齐后输出字符','还不知道事件是否完整'],
   ['SSE 事件','本例按空行结束事件，多行 data 先拼合','delta 仍可能只是部分参数'],
   ['单次调用的参数','对应调用的 done 已到，完整参数可解析','还需结构、名称、权限和业务前提检查']])+
  para('合法 JSON 前缀也不能提前下发。先到的片段可能刚好是 {"tenant":"A","report":"中国区日报","limit":3}，下一段却还有 oops；提前解析、提前执行，就在上游实际结束前接受了后来不合法的参数。反过来，到流末尾（EOF）也不表示每次调用都结束：最后一项 done 若没有完整事件边界，应保持未完成。');
 a.sections[3][1]+='<h3>流状态和调用事实分别保留</h3>'+para(
  '流在参数收齐之前结束，保持该调用未执行；若另一调用已经通过准入并完成，则保留它的观察，再记录流错误。不能用一个“整流失败”把已经发生的调用清零。对写工具，更应沿原操作身份查接收方回执，不能因为没收到最终文本就换新操作重复写。',
  '当前连接的 call_id 只帮助拼装参数，不能代替业务 op_id、一次网络尝试的 attempt_id 或持久回执。断线重连时哪些事件可重放、哪些调用已执行、检查点何时提交，需要另外的恢复协议。单次调用的 done 也不等于整个用户任务完成，后文仍按真实产物验收。');
 a.sections.push(['流式实战：十三组完成边界与准入对照',
  '<h3 id="streaming-tool-lab">先预测哪些流会真的调用工具</h3>'+para(
   '另开一份只读任务：主体 A 读取“中国区日报”，工具回调返回固定值 [10,27]。程序实际启动本机 chunked HTTP 服务，发送十三份声明好的事件流；客户端每次读取最多 7 字节。下发后是本地只读函数，不调用真实模型、远端工具或 Kairo。',
   '发送端每个 HTTP chunk 最多 11 字节，读取端的 7 字节也不是 TCP 包或事件边界。正常响应体有 287 字节，读取 41 次。下面只截取中文附近第 28—30 次读取，解释为什么不能把每一块单独 decode 后再拼字符串。')+
  figure('v37-utf8-reads','正常流的实际读取边界：前两块单独 UTF-8 解码失败；增量解码依次输出“中”“国区日”“报”，保留待补字节。偏移从响应体 0 开始，不含 HTTP 头与分块帧头。')+
  code('只需 Python 3.9+ 标准库，解压后执行','SHELL','python3 streamed_tool_calls.py')+
  table(['只改变这一项','本地只读回调','实际判断'],[
   ['正常 start/delta/done','1 次','完整收集、检查后执行'],
   ['A/B 两调用交错','1 次','A 执行，B 按租户拒绝，各自拼装'],
   ['参数未完整就到 EOF','0 次','调用仍未完成'],
   ['done 缺少事件末尾空行','0 次','最后事件没有交付，仍未完成'],
   ['HTTP 不发 chunked 终止块就关闭','0 次','实际 IncompleteRead；记录 http_incomplete'],
   ['合法 JSON 前缀后追加 oops','0 次','完整参数解析失败，未因前缀合法提前执行'],
   ['重复 tenant 键','0 次','拒绝重复键，保留参数含义唯一'],
   ['limit=true','0 次','布尔值不按本契约的整数接收'],
   ['只改为 B 租户','0 次','结构合法，但授权范围拒绝'],
   ['只改未知工具名','0 次','名称检查拒绝'],
   ['参数超过 512 个 UTF-8 字节','0 次','参数预算拒绝'],
   ['调用前出现无效 UTF-8','0 次','解码失败；调用仍未完成'],
   ['调用完成后再出现无效 UTF-8','仍为 1 次','保留执行观察，同时记录流错误']])+
  para('Python 默认的 JSON 对象解析遇到重复名字会保留最后一项。若只检查解析后的字典，就看不见前面出现过另一个 tenant。程序用 object_pairs_hook 拒绝重复键，再做字段集合与类型检查；这些检查仍不能替代真实工具端的身份认证、授权和业务验证。',
   '最后一行特意让 done 先在一次读取中处理，再送来无效字节。它说明调用事实与随后流错误可同时成立，不是在承诺任意缓冲尺寸下都出现同样时序。本程序只保留当前进程观察；重启后的去重、接收方持久回执与任务完成仍按相应章节实现。')+
  '<p class="evidence-note">协议范围：严格 UTF-8、LF/CRLF 的 data 字段子集；EOF 不补发最后一个未终结事件。未实现独立 CR 行尾、自动重连或 Last-Event-ID，不作为完整 EventSource 客户端。当前可信主体、最多 4 次调用、512 字节参数和 64 KiB 流上限都是本例契约。</p>'+
  streamedToolLinks+'<details class="full-code"><summary>展开完整 streamed_tool_calls.py：与下载文件一致</summary>'+code('streamed_tool_calls.py','PYTHON',streamedToolFiles['streamed_tool_calls.py'])+'</details>'+
  linkTo('durable-workflows','继续推导跨进程恢复与接收方回执')]);
 a.sections=a.sections.map(([title,body])=>[title,infraReadableHTML(body)]);
 a.refs.push('v37SSE','v37Codecs','v37JSON');a.updated='2026.11.05';a.minutes=65;
 a.check.push('分开字节、事件与参数完成条件','保留已发生调用，并另外记录后续流错误');
}
{
 const p=infraDomain('agent').points.find(p=>p.id==='ag-tools');
 p.body+='<h3>分段参数先收齐，再判断能否调用</h3>'+para(
  '网络读取、协议事件和单次工具参数各有自己的边界。先增量还原字符，再解析完整事件；按调用身份分开追加参数，等协议规定的完结信号后解析整体并检查名称、字段、类型与当前权限。前缀能解析成 JSON 不证明上游已结束，流到 EOF 也不证明最后调用已完成。',
  '若调用完成后才发生流错误，保留已有事实，再按原操作与接收方回执恢复；不能靠重连后的新调用身份制造第二次业务效果。参数拼装身份、业务效果身份和网络尝试身份分别保存。')+linkTo('agent-runtime','沿真实本机 HTTP 流检查十三个边界对照');
}
