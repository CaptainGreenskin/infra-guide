const inventory=require('./content-inventory.cjs');
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const query=value=>{c.query=value;return JSON.parse(JSON.stringify(vm.runInContext('rankSiteSearch(query).map(r=>({id:r.id,path:r.path,anchor:r.anchor,tier:r.tier,label:r.matchLabel}))',c)));};
const index=JSON.parse(JSON.stringify(vm.runInContext('buildSiteSearchIndex().map(e=>({id:e.id,type:e.type,path:e.path,anchor:e.anchor}))',c)));
assert.equal(index.length,inventory.search);assert.equal(new Set(index.map(e=>e.id)).size,inventory.search);assert.equal(index.filter(e=>e.type==='knowledge').length,95);
for(const entry of index){const file=path.join('dist',entry.path,'index.html');assert(fs.existsSync(file),entry.id+': destination');if(entry.anchor)assert(fs.readFileSync(file,'utf8').includes('id="'+entry.anchor+'"'),entry.id+': point anchor');}
assert.equal(query('traceparent')[0].id,'article:agent-observability');assert.equal(query('traceparent')[0].anchor,'section-2');
assert(query('traceparent').every(r=>!['article:gpu-cluster','article:agent-runtime'].includes(r.id)));
assert.equal(query('SQL 索引')[0].id,'article:database-index-locks');
assert.equal(query('cpu.max')[0].id,'article:linux-resource');assert.equal(query('cpu.max')[0].anchor,'section-3');
assert.equal(query('KV Cache')[0].id,'knowledge:sv-kv');
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
const highlighted=vm.runInContext('siteSearchHighlight(\'<img src="x"> & text\',["img"])',fixture);
assert(!highlighted.includes('<img'));assert(highlighted.includes('&lt;<mark>img</mark>'));assert(highlighted.includes('&amp;'));
console.log('PASS:'+inventory.search+' actual entries/'+inventory.points+' point anchors, direct body and identifier matches, multiword and full-width queries, independent title/prose/code ranking, TP/HTTP boundary and escaped snippets.');
