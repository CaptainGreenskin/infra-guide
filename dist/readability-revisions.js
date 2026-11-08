/* Targeted body edits: keep existing section IDs and every executed source block. */
const readabilityRevisionLog=[];
function reviseReadingSection(id,index,change){const a=articles.find(a=>a.id===id),before=JSON.stringify(a.sections[index]);change(a.sections[index]);if(before===JSON.stringify(a.sections[index]))throw Error('Unapplied reading revision: '+id+'/'+index);readabilityRevisionLog.push([id,index]);}
reviseReadingSection('cloud-overview',4,s=>{
 s[1]=para('这条请求依赖的计算、网络和存储，也是AI与Agent的底座；变化的是要保存的状态，以及“完成”怎样判断。先把三种工作分开，不需要在这里提前学习训练算法。',
 '训练把样本交给模型，反复调整模型中的参数，也就是可学习的数字。它通常是一项长时间作业，进程活着却可能一直等数据。验收要看参数更新有没有推进、模型文件是否完整，以及能否从已保存状态继续；一个健康接口不足以证明这些条件。',
 '推理使用已经确定的参数处理新输入。生成文本时，模型通常根据已有内容继续产生下一项，用户会分别感受到开始输出前的等待和之后的输出间隔。它仍是服务请求，却新增了模型版本和生成状态的管理。',
 'Agent再把模型输出当作动作提议，例如查询订单后保存报告。运行时负责检查权限、安排工具和保存观察；报告是否真的写好，要读取实际产物或接收方回执。调用超时后，效果可能已经发生，因此任务进度与工具事实需要分别保存。')+
 linkTo('transformer-model','沿输入、模型与参数理解AI主线')+linkTo('agent-runtime','沿任务、工具与结果理解Agent主线')+
 para('回到Cloud，每种产品都可以放回一个具体关系：谁提供执行资源，请求怎样抵达，数据由谁保留，动作在哪里授权，失败后按什么条件恢复。后面的计算、网络、数据和编排领域分别展开这些关系。');
});
reviseReadingSection('transformer-model',3,s=>{
 s[1]=s[1].replace('第 0.3 章将手算跨位置汇总，第 0.4 章将展开逐位置变换。','<a href="/article/attention-mechanics/">A1.3手算跨位置汇总</a>，<a href="/article/transformer-block/">A1.4展开逐位置变换</a>。');
 const needle='沿一个位置跟踪计算。';
 if(!s[1].includes(needle))throw Error('Missing matrix-to-attention bridge');
 s[1]=s[1].replace(needle,'前一节的矩阵乘法只改变每个位置的特征，两个位置还没有交换信息。注意力增加跨位置读取，前馈网络再分别变换各位置；把这两种作用分开，才容易理解完整层为什么同时需要它们。'+needle);
});
reviseReadingSection('transformer-model',6,s=>{
 const from=s[1].lastIndexOf('<p>');if(from<0)throw Error('Missing parallel paragraph');
 s[1]=s[1].slice(0,from)+para('扩展到多设备以后，先问切开的是什么。数据并行让多个模型副本各读部分样本，再同步用于更新的梯度；参数分片把需要保存的参数分散；张量并行切开层内矩阵计算。布局不同，需要交换的数据与时机也不同。',
 '例如一个参与进程慢读数据，其他进程就可能在共同通信处等待。性能记录显示通信耗时很长，仍需向前检查谁晚到、为什么晚到。A2会把这些对象逐一展开；本章先保留“输入→计算→更新”和“固定参数→生成”两条主干。');
});
Object.assign(sources,{readingHttp503:['RFC 9110 · HTTP 503与服务暂时不可用','https://www.rfc-editor.org/rfc/rfc9110.html#section-15.6.4']});
reviseReadingSection('agent-runtime',3,s=>{
 s[0]='错误与重试：连接、HTTP、工具协议与任务验收';
 s[1]=s[1].replace('<td>传输</td><td>一次 HTTP 503；或发出写入后连接断开</td><td>只读暂态可受限重试；写入未明先保持 UNKNOWN 并沿原操作查证</td>',
  '<td>连接与HTTP响应</td><td>HTTP 503是明确响应；写入后断连则可能没有收到响应</td><td>先区分是否已收到HTTP状态；只读暂态可受限重试，写入结果未明时保留UNKNOWN并沿原操作查证</td>');
 let figureChanged=false;
 s[1]=s[1].replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/g,block=>{if(!block.includes('v23-tool-error-layers'))return block;figureChanged=true;return figure('v50-tool-error-layers','连接结果、HTTP响应、工具协议、执行结果与任务验收分别核对。503已是HTTP响应，连接断开后的未知结果另按原操作查证。');});
 if(!figureChanged)throw Error('Missing tool-layer figure');
 const needle='是否重试由错误阶段和动作语义共同决定。';
 if(!s[1].includes(needle))throw Error('Missing HTTP distinction');
 s[1]=s[1].replace(needle,'HTTP 503已经是一份应用层响应，表示响应方暂时无法处理请求；它与TCP连接未建立、或写入后断连而没有拿到结果不同。先区分这些事实，再谈重试，不能把它们统称为网络没通。'+needle);
});
const readingRuntime=articles.find(a=>a.id==='agent-runtime');if(!readingRuntime.refs.includes('readingHttp503'))readingRuntime.refs.push('readingHttp503');
function replaceReadingReference(id,from,to){
 const a=articles.find(a=>a.id===id),index=a.sections.findIndex(s=>s[1].includes(from));
 if(index<0)throw Error('Missing authored reference: '+id+' '+from);
 reviseReadingSection(id,index,s=>{s[1]=s[1].replace(from,to);});
}
replaceReadingReference('tokenization-embedding','0.1 里的 0 是普通编号','<a href="/article/transformer-model/">A1.1示例</a>里的0是普通编号');
replaceReadingReference('tokenization-embedding','手写编码器没有学习归一化、预切分或多轮合并','手写编码器没有实现通用的文本归一化（如按规则统一字符形式）与预切分，也没有训练出多轮合并规则');
replaceReadingReference('transformer-block','这是0.6节最小Decoder脚本应满足的一条独立断言；0.5节先解释位置编码。','这是<a href="/article/autograd-training/">A1.6最小Decoder脚本</a>应满足的一条独立断言；<a href="/article/position-encoding/">A1.5先解释位置编码</a>。');
replaceReadingReference('training-lab','先用 6.2 的独立单进程全局目标','先用<a href="/article/distributed-training/">A2.2的独立单进程全局目标</a>');
replaceReadingReference('training-lab','与 6.4 的下载源码逐字节一致','与<a href="/article/ddp-code/">A2.4的下载源码</a>逐字节一致');
replaceReadingReference('training-lab','仍按 6.8 的提交边界重做','仍按<a href="/article/checkpoint-recovery/">A2.8的提交边界</a>重做');
for(const id of new Set(readabilityRevisionLog.map(row=>row[0])))articles.find(a=>a.id===id).updated='2026.11.08';
