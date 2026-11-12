const inventory=require('./content-inventory.cjs');
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const query=value=>{c.query=value;return JSON.parse(JSON.stringify(vm.runInContext('rankSiteSearch(query).map(r=>({id:r.id,path:r.path,anchor:r.anchor,tier:r.tier,label:r.matchLabel}))',c)));};
const index=JSON.parse(JSON.stringify(vm.runInContext('buildSiteSearchIndex().map(e=>({id:e.id,type:e.type,path:e.path,anchor:e.anchor}))',c)));
assert.equal(index.length,inventory.search);assert.equal(new Set(index.map(e=>e.id)).size,inventory.search);assert.equal(index.filter(e=>e.type==='knowledge').length,inventory.points);
for(const entry of index){const file=path.join('dist',entry.path,'index.html');assert(fs.existsSync(file),entry.id+': destination');if(entry.anchor)assert(fs.readFileSync(file,'utf8').includes('id="'+entry.anchor+'"'),entry.id+': point anchor');}
const indexedSubsections=JSON.parse(vm.runInContext(`JSON.stringify(buildSiteSearchIndex()
 .filter(e=>e.type==='article').map(e=>[e.id.slice(8),e.segments.filter(s=>s.subsection).map(s=>[s.anchor,s.heading])]))`,c));
for(const [id,rows] of indexedSubsections){
 c.chapterId=id;
 const expected=JSON.parse(vm.runInContext(`JSON.stringify(chapterNavigation(articles.find(a=>a.id===chapterId))
  .flatMap(section=>section.children.map(heading=>[heading.id,searchPlainText(heading.title)])))`,c));
 assert.deepEqual(rows,expected,id+': search uses the same visible subheadings and anchors as the contents');
 const html=fs.readFileSync(path.join('dist','article',id,'index.html'),'utf8');
 for(const [anchor] of rows)assert(html.includes('id="'+anchor+'"'),id+': live target '+anchor);
}
for(const [heading,article,anchor,opening] of [
 ['注意力先决定读取哪些位置，再决定读多少','transformer-model','decoder-attention-first-pass','生成时，每格只读自己和前文'],
 ['工作节点停机后，用新卷从原入口读回 R3','resilience','native-kind-r3-node-loss','这次沿用'],
 ['单卡恢复的两种计时','training-performance','single-gpu-recovery-timing','前章的 RTX 单卡对照'],
 ['梯度累积中断，从哪个微批重读','checkpoint-recovery','native-ddp-accumulation-restart','把微批 0、1 的梯度累积起来'],
 ['两个答案都是 37，为什么有一个不合格','agent-retrieval','native-rag-citation-oracle','前面的提示交付实验'],
 ['用检索章的两份回答检验引用','agent-evaluation','native-model-evaluation-bridge','检索章让本机模型回答'],
]){
 const result=query(heading)[0];
 assert.deepEqual([result.id,result.anchor,result.label],['article:'+article,anchor,'小节标题匹配']);
 c.q=heading;
 const excerpt=vm.runInContext('rankSiteSearch(q)[0].excerpt',c);
 assert(excerpt.startsWith(heading+'。')&&excerpt.includes(opening),heading+': start the excerpt at this subsection');
}
for(const [heading,article,anchor] of [
 ['DP、TP 与 PP 进程组','tensor-parallel-math','section-5'],
 ['INT4 打包与 CPU INT8 执行','quantization-serving','section-5'],
 ['RPO 与 RTO','resilience','section-4'],
]){
 const result=query(heading).find(row=>row.id==='article:'+article);
 assert.deepEqual([result?.anchor,result?.label],[anchor,'小节标题匹配'],heading+': exact heading within this chapter');
}
const propagation=query('traceparent');
assert.deepEqual(propagation.slice(0,2).map(r=>[r.id,r.anchor,r.tier]),[['article:observability','section-9',5],['article:agent-observability','section-2',5]],'both independently explained propagation paths should match their actual prose');
assert.equal(query('Agent traceparent')[0].id,'article:agent-observability','an explicit track term selects the Agent explanation');
assert(query('traceparent').every(r=>!['article:gpu-cluster','article:agent-runtime'].includes(r.id)));
assert.equal(query('SQL 索引')[0].id,'article:database-index-locks');
assert.equal(query('cpu.max')[0].id,'article:linux-resource');assert.equal(query('cpu.max')[0].anchor,'section-3');
assert.equal(query('KV Cache')[0].id,'knowledge:sv-kv');
const planning=query('计划修订与审批状态')[0];
assert.equal(planning.id,'knowledge:ag-planning');
assert.equal(planning.path,'/module/agent/');
assert.equal(planning.anchor,'knowledge-ag-planning');
const planRelation=query('计划与审批')[0];
assert.equal(planRelation.id,'knowledge:ag-planning');
assert.equal(planRelation.path,'/module/agent/?concept=ag-planning');
assert.equal(planRelation.anchor,'concept-relations');
const placement=query('节点放置')[0];assert.equal(placement.id,'knowledge:placement');assert.equal(placement.path,'/module/native/?concept=placement');assert.equal(placement.anchor,'concept-relations');
assert.deepEqual(query('ＴＣＰ'),query('tcp'));assert.deepEqual(query('  KV   Cache  '),query('kv cache'));
assert.deepEqual(query('完全不存在的条目xyz'),[]);assert.deepEqual(query('<>'),[]);
assert.equal(query('').length,6);
c.q='流式';const streamed=JSON.parse(JSON.stringify(vm.runInContext('rankSiteSearch(q).find(r=>r.id==="article:agent-runtime")',c)));
assert.equal(streamed.anchor,'section-9');assert.equal(streamed.tier,4);assert(streamed.excerpt.startsWith('流式工具调用。'));assert(streamed.excerpt.includes('先预测哪些流会真的调用工具'));assert(streamed.excerpt.includes('中国区日报'));assert(!streamed.excerpt.includes('下载流式工具参数实验'));

// Independent corpus distinguishes title/prose/code priority and abbreviation boundaries.
const fixture={modules:[{id:'test'}],cloudKnowledgeDomains:[],cloudKnowledgeExplanations:{},infraKnowledgeDomains:[],articles:[
 {id:'http',module:'test',number:'1',title:'连接',desc:'只讲协议',tags:[],sections:[['协议','<p>HTTP transport keeps a connection.</p>']]},
 {id:'code',module:'test',number:'2',title:'源码',desc:'标准库',tags:[],sections:[['示例','<pre><code>traceparent = "fixture"</code></pre>']]},
 {id:'prose',module:'test',number:'3',title:'原理',desc:'传播',tags:[],sections:[['字段','<p>traceparent carries the upstream context.</p>']]},
 {id:'title',module:'test',number:'4',title:'traceparent',desc:'字段',tags:[],sections:[['说明','<p>TP means tensor parallel here.</p>']]},
 {id:'split',module:'test',number:'5',title:'两个词',desc:'cpu activity',tags:[],sections:[['范围','<p>The max count is ten.</p>']]},
 {id:'heading',module:'test',number:'6',title:'边界说明',desc:'协议',tags:[],sections:[['完结事件','<p>先收齐参数，再检查是否允许执行。</p><p>'+('背景说明'.repeat(60))+'</p><p>下载完结事件示例</p><pre><code>结束记录</code></pre>']]}
]};vm.createContext(fixture);vm.runInContext(fs.readFileSync('dist/site-search.js','utf8'),fixture);
const ask=value=>{fixture.q=value;return JSON.parse(JSON.stringify(vm.runInContext('rankSiteSearch(q).map(e=>e.id)',fixture)));};
assert.deepEqual(ask('traceparent'),['article:title','article:prose','article:code']);
assert.deepEqual(ask('TP'),['article:title']);assert.deepEqual(ask('cpu.max'),[]);
fixture.q='完结事件';const heading=JSON.parse(JSON.stringify(vm.runInContext('rankSiteSearch(q)[0]',fixture)));
assert.equal(heading.anchor,'section-1');assert.equal(heading.tier,4);assert(heading.excerpt.startsWith('完结事件。先收齐参数，再检查是否允许执行。'));assert(!heading.excerpt.includes('下载完结事件示例'));
// A focused concept title should precede a broad chapter that mentions it later.
fixture.articles.push(
 {id:'wide-cache',module:'test',number:'7',title:'推理服务中的 KV Cache',desc:'同一段说明',tags:[],sections:[['原理','缓存状态']]},
 {id:'focused-cache',module:'test',number:'8',title:'KV Cache：状态与释放',desc:'同一段说明',tags:[],sections:[['原理','缓存状态']]}
);
vm.runInContext('siteSearchCache=null',fixture);
assert.deepEqual(ask('KV Cache'),['article:focused-cache','article:wide-cache']);
const highlighted=vm.runInContext('siteSearchHighlight(\'<img src="x"> & text\',["img"])',fixture);
assert(!highlighted.includes('<img'));assert(highlighted.includes('&lt;<mark>img</mark>'));assert(highlighted.includes('&amp;'));
console.log('PASS:'+inventory.search+' actual entries/'+inventory.points+' point anchors, direct body and identifier matches, multiword and full-width queries, independent title/prose/code ranking, TP/HTTP boundary and escaped snippets.');
