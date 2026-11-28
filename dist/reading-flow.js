/* One continuous reading sequence for navigation, route location and shared capstones. Directory grouping stays by field. */
function chapterReadingContext(a){
 if(!a)return {track:'shared',ids:[],index:-1,previous:null,next:null,stage:''};
 for(const[track,stages]of Object.entries(courseReadingStages)){
  const ids=stages.flatMap(s=>s[1]),index=ids.indexOf(a.id);
  if(index>=0)return {track,ids,index,previous:articleById(ids[index-1]),next:articleById(ids[index+1]),stage:stages.find(s=>s[1].includes(a.id))[0]};
 }
 return {track:moduleFor(a.module).track,ids:[a.id],index:0,previous:null,next:null,stage:''};
}
function chapterReadingNav(a){
 const r=chapterReadingContext(a),label=trackDefinitions[r.track]?.label||'综合实战';
 return '<nav class="article-nav" aria-label="相邻文章"><p class="reading-sequence-label">按学习路线连续阅读 · '+label+'</p>'+
 (r.previous?'<a data-reading-direction="previous" href="'+articleURL(r.previous.id)+'"><small>← 上一篇</small>'+r.previous.number+' '+r.previous.title+'</a>':'<a href="/roadmap/?track='+r.track+'#route-'+r.track+'"><small>← 开始之前</small>本方向的整体路线</a>')+
 (r.next?'<a data-reading-direction="next" href="'+articleURL(r.next.id)+'"><small>下一篇 →</small>'+r.next.number+' '+r.next.title+'</a>':'<a href="/roadmap/?track='+r.track+'#synthesis-'+r.track+'"><small>串起整条主线 →</small>完成跨章推演</a>')+'</nav>';
}

// Whole-site prose fluency, practice-link deduplication, and typography normalization (2026-11-28).
(()=>{
 if(typeof articles==='undefined')return;
 const findArticle=id=>articles.find(a=>a.id===id);
 const proseEdits=[
  ['gpu-memory',0,'先接回664参数TinyDecoder：源码把参数转为float64，每元素8字节，参数逻辑载荷为5312字节；全部梯度建立后再增加5312字节。无momentum SGD不为每项参数维护Adam式历史张量。','先回到 A1.1 那个 664 个参数的 <code>TinyDecoder</code>：实验源码把参数存为 <code>float64</code>，每个元素占 8 字节，参数本身占 5312 字节；全部梯度建立后再增加 5312 字节。这里用的是不带动量的 SGD，不像 Adam 那样为每个参数额外保存历史张量。'],
  ['gpu-memory',1,'下面旧图使用另一份简化配置：','下图换用一份更简单的配置：'],
  ['gpu-memory',5,'优化器完成调用本身也不保证每项权重必有非零变化。','即使优化器执行了 <code>step</code>，也不代表每个权重都发生了非零变化。'],
  ['inference-performance',0,'请求 B 发出去后，约 23.588 ms 才收到第一项输出。接下来的 31 个间隔平均约 0.215 ms。这是第 6 节本机 CPU 实验的第一轮记录。','衡量一次流式推理的快慢，先区分“多久看到第一个词元”和“之后每个词元来得多快”。在第 6 节本机 CPU 实验的第一轮记录里，请求 B 发出后等了约 23.588 ms 才收到第一项输出，随后的 31 个间隔平均只有约 0.215 ms。'],
  ['inference-performance',2,'已处理KV上限为P+G−1，块长4时要向上取整。ceil表示向上取整：长度35也占9块、36槽。','需要缓存的位置最多有 P+G−1 个；块长为 4 时按 <code>ceil</code>（向上取整）对齐整块，例如 32+4−1=35 个位置也要占 9 块、共 36 个槽位。'],
  ['inference-performance',2,'每格对应的真实模型字节需另乘层数、KV头数和格式，Python对象内存不等于128KiB/位置的另一道字节题。','换算成真实显存时，每格还要乘上层数、KV 头数和元素字节数；本例 Python 对象自身占用的内存与此无关，也不能直接套用后文“每位置 128 KiB”的算例。'],
  ['inference-performance',2,' 对照 <a href="https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/vllm/v1/core/block_pool.py#L170-L266">分配、驱逐、touch 与 free ↗</a> · <a href="https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/vllm/v1/core/kv_cache_utils.py#L158-L405">块与双向空闲队列 ↗</a>，再回到本节四步请求路径，找出真正负责调用这些方法的层次。</p>','阅读源码时，可回到本节的四步请求路径，找出真正负责调用这些方法的层次。</p><p class="practice-links"><a href="https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/vllm/v1/core/block_pool.py#L170-L266">分配、驱逐、touch 与 free ↗</a> · <a href="https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/vllm/v1/core/kv_cache_utils.py#L158-L405">块与双向空闲队列 ↗</a></p>'],
  ['inference-performance',5,'simulate按到达顺序准入，先选已有decode，再按newcomers与旧提示安排prefill，轮末生成输出并释放完成者。','调度函数 <code>simulate</code> 按到达顺序准入请求：每轮先给已在解码的请求各留一个位置，再按 <code>newcomers</code>（新提示优先或旧提示优先）安排预填充，轮末统一交付输出并释放已完成请求的空间。'],
  ['inference-performance',7,'甲只报告“51token，一秒完成”。先追问它已有事件的含义，再补发送、首项、末项、输出总数和流式映射。','甲只报告“51 个 token，一秒完成”。应先问清这“一秒”从哪个事件算到哪个事件，再请他补齐发送、首项、末项时间与输出总数，以及流式消息和 token 的对应关系。'],
  ['agent-runtime',0,'恢复章用另一笔动作，检验怎样按原操作身份认回实际效果。','恢复章则用另一笔动作，演示怎样按原操作身份查回已经生效的结果。'],
  ['agent-runtime',3,'HTTP 503已经是一份应用层响应，表示响应方暂时无法处理请求；它与TCP连接未建立、或写入后断连而没有拿到结果不同。','HTTP 503 已经是一份应用层响应，表示服务暂时无法处理请求；它与“TCP 连接根本没建立”或“写入后连接断开、没拿到结果”不是同一回事。'],
  ['agent-runtime',4,'同参数再来，先查原回执，返回 duplicate=true；不能先用当前版本再次拒绝','同一 <code>op_id</code> 以相同参数再次请求时，工具应先查原回执并返回 <code>duplicate=true</code>，而不是先拿当前版本再拒绝一次'],
  ['durable-workflows',0,'动态版本初始计划漏掉补录读取，执行器先保存缺失条件，进入NEEDS_REPLAN，再接纳包含read_extra的新计划，保留仍适用的基础事实。','动态计划的初始版本漏掉了补录读取：执行器发现后先保存缺失条件，将任务置为 <code>NEEDS_REPLAN</code>；等接纳了包含 <code>read_extra</code> 的新计划再继续推进，仍适用的基础事实会保留下来。'],
  ['durable-workflows',2,'需要这些值时，把调用安排为能够记录结果的工作，后续决定消费其保存结果。','需要这些值时，应把调用安排成一项会记录结果的活动；之后的决策代码直接读取已保存的结果，不再重新调用。'],
  ['durable-workflows',3,'checkpointer保存框架检查点；SqliteSaver写入checkpoints.sqlite，thread_id=report-A定位这条执行，与操作系统线程编号分别处理，资源权限仍来自任务委托。','<code>checkpointer</code> 负责保存框架检查点：本例由 <code>SqliteSaver</code> 写入 <code>checkpoints.sqlite</code>，用 <code>thread_id=report-A</code> 标识这条执行。注意这里的 <code>thread_id</code> 与操作系统线程无关，资源权限也仍来自任务委托。'],
  ['durable-workflows',3,'图中历史编号9.2对应现G4。','图中标注的 9.2 是旧章节编号，即现在的 G4。'],
  ['durable-workflows',3,'真实执行器线程的同步点验证了两分支重叠。','实验在执行器线程中设置同步点，证实两个分支确实同时运行。'],
  ['durable-workflows',4,'函数返回True表示该代际已armed，并未在控制库另存一个armed字段','函数返回 <code>True</code> 表示接收方已经装上该代际（armed），控制库并没有另存一个 <code>armed</code> 字段'],
  ['agent-observability',2,'因而不能只数 effect_committed 事件来建设业务去重。','因此，业务去重不能只靠统计 <code>effect_committed</code> 事件来实现。'],
  ['agent-observability',7,'这里观测丢了链接时仍可按操作号找业务记录，正好能与<a href="/article/durable-workflows/">持久工作流</a>一章的恢复条件对照。','可以看到，即使观测数据丢了跨度链接，仍能按操作号查回业务记录；这一点可与<a href="/article/durable-workflows/">持久工作流</a>一章的恢复条件对照阅读。']
 ];
 for(const [id,sectionIndex,before,after] of proseEdits){
  const targetArticle=findArticle(id),section=targetArticle?.sections?.[sectionIndex];
  if(!section||!section[1].includes(before))continue;
  section[1]=section[1].replaceAll(before,after);
  targetArticle.updated='2026.11.28';
 }
 const obsChapter=findArticle('agent-observability');
 if(obsChapter?.exercise?.[1])obsChapter.exercise[1]=obsChapter.exercise[1].replace('按一次成功完成定义为 17/28；总成本 12×2＋5×5＋3×4＝61','尝试合格率为 17/28（约 60.7%）；总成本 12×2+5×5+3×4=61');

 const pinnedProseTokens=[
  '计划版本revision','草稿摘要draft_digest','输入摘要input_digest',
  'A日报：总数23','A日报：总数999','任务表与效果表在同一SQLite事务提交',
  'block数 ','这是0.6节','完整integrated_service.py','已接收2条',
  '2025-11-25及更早版本','同一次调用的响应id为',
  '100（事务41）→110（事务47）→130（事务50）→135（事务51）','每次Lab.change另开写连接',
  '本章用固定FP32输入走通正常更新','19.9毫秒','825毫秒','图中的300ms',
  '位置2是结束符EOS，它能读取位置0、1、2，自己却没有真实的下一项目标。','编号5对应从左数第六列，分数是2',
  '每秒增加20','再需360秒排空','积攒256个请求',
  '连接与HTTP响应','真实HTTP授权','total为','values为'
 ];
 const pinnedProsePatterns=[/两边账户\d+/g,/NEW_WRITER加3后为\d+/g,/个，指向[A-Za-z0-9_-]+/g];
 const protectedProseTags=new Set(['pre','code','a','button','summary','script','style','svg','textarea','select','label','figure','h1','h2','h3','h4','h5','h6','dfn','var','kbd','samp']);
 function dedupePracticeLinks(html){
  return html.replace(/<p(\s+[^>]*\bclass="practice-links"[^>]*)>([\s\S]*?)<\/p>/g,(full,attrs,inner)=>{
   const anchors=[...inner.matchAll(/<a\b[^>]*\bhref=(["'])([^"']+)\1[^>]*>[\s\S]*?<\/a>/g)];
   if(!anchors.length)return full;
   const seen=new Set(),kept=[];
   for(const m of anchors){
    if(seen.has(m[2]))continue;
    seen.add(m[2]);kept.push({tag:m[0],href:m[2]});
   }
   const generic=kept.filter(x=>/>下载本例源码\s*↓<\/a>$/.test(x.tag)&&/\.py$/.test(x.href));
   if(generic.length>1){
    for(const item of generic){
     const file=item.href.split('/').pop();
     item.tag=item.tag.replace(/>下载本例源码\s*↓<\/a>$/,'>下载 '+file+' ↓</a>');
    }
   }
   return '<p'+attrs+'>'+kept.map(x=>x.tag).join(' · ')+'</p>';
  });
 }
 function normalizeProseSpacingAndQuotes(html){
  const parts=dedupePracticeLinks(html).split(/(<[^>]+>)/g),stack=[];
  return parts.map(part=>{
   if(part.startsWith('<')){
    const m=part.match(/^<\s*(\/?)([a-z0-9]+)/i);
    if(m&&protectedProseTags.has(m[2].toLowerCase())){
     const tag=m[2].toLowerCase();
     if(m[1]){const at=stack.lastIndexOf(tag);if(at>=0)stack.splice(at,1);}
     else if(!/\/\s*>$/.test(part))stack.push(tag);
    }
    return part;
   }
   if(stack.length||!part)return part;
   let text=part.replaceAll('「','“').replaceAll('」','”');
   const guards=[];
   for(const pattern of pinnedProsePatterns){
    text=text.replace(pattern,match=>{const key='\uE000'+guards.length+'\uE001';guards.push([key,match]);return key;});
   }
   for(const token of pinnedProseTokens){
    if(text.includes(token)){const key='\uE000'+guards.length+'\uE001';guards.push([key,token]);text=text.replaceAll(token,key);}
   }
   text=text.replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g,'$1 $2').replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g,'$1 $2');
   for(const [key,token] of guards)text=text.replaceAll(key,token);
   return text;
  }).join('');
 }
 // Two chapters have immutable historical section-prefix contracts in their CI evidence checks.
 const immutableSectionPrefixes=new Set(['vpc-network','k8s-workloads']);
 for(const article of articles){
  if(immutableSectionPrefixes.has(article.id))continue;
  let modified=false;
  for(const section of article.sections){
   const next=normalizeProseSpacingAndQuotes(section[1]);
   if(next!==section[1]){section[1]=next;modified=true;}
  }
  if(modified)article.updated='2026.11.28';
 }
})();
