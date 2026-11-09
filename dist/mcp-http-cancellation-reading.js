/* Append a native HTTP contrast to the original stdio and recovery lessons. */
(()=>{
 const protocol=articleById('mcp-protocol');
 const recovery=articleById('agent-recovery');
 protocol.sections[6][1]+=
  '<h3 id="mcp-http-cancellation-run">在真实 Streamable HTTP 中取消一项调用</h3>'+
  para('前面的 stdio 例子通过通知取消调用。2026-07-28 版 Streamable HTTP 给每次请求单独的响应流。客户端收到 1/2 进度后取消等待，SDK 关闭这一条 SSE 流。服务端能按请求 ID 对齐断开事件、处理器收到取消以及文件关闭。两组实际 HTTP 记录都只有发现、列举工具和工具调用的 POST。',
  '沿用第 3 版订单的 10+27+5=42，两组独立接收库使用同一操作键。提交前取消时，两张表为空。提交后取消时，报告与回执已经共同提交。两次等待都没有拿到最终工具响应，原客户端仍可另发请求查回执，分别得到空值和 42。')+
  trainingFigure('mcp-http-cancellation','同一 SDK 取消流程作用于请求流。查原操作回执可以区分提交前与提交后两种结果。')+
  '<p>解压并安装固定依赖后，运行 <code>python3.12 -B cancellation_lab.py --output-dir replay</code>。<a href="labs/mcp-http-cancellation.zip" download>下载完整实验 →</a> · <a href="labs/mcp-http-cancellation/README.md">复现步骤</a> · <a href="labs/mcp-http-cancellation/validation.json">真实导出与账本记录</a></p>'+
  '<p><a href="https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#cancellation" target="_blank" rel="noopener">固定版本的 Streamable HTTP 取消规则 ↗</a> · <a class="inline-link" href="/article/agent-recovery/#mcp-http-cancellation-receipt">取消后按原操作核对效果 →</a></p>';
 recovery.sections[4][1]+=
  '<h3 id="mcp-http-cancellation-receipt">断流后沿原操作核对提交</h3>'+
  para('关闭 SSE 流后，调用者能确认自己已停止等待，服务端处理器也能收到取消。接收方的持久记录仍需单独核对。同一份 42 报告使用两个独立 SQLite 库，分别在提交前和提交后关闭真实 MCP 响应流。处理器两次均关闭输入文件，提交后那组保留一份报告和一份回执。',
  '恢复时先沿原操作键查回执。查询得到 42 时，可以确认本实验的接收方已有结果。查询为空时，结合服务端已停止和接收库直接读取，本次可以核对没有提交。真实远端查询失败时保留待确认状态，等能再次核对原操作再决定下一步。')+
  '<p><a class="inline-link" href="/article/mcp-protocol/#mcp-http-cancellation-run">真实断流、处理器清理与原回执实验 →</a></p>';
})();
