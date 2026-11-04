const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const query=value=>{c.query=value;return JSON.parse(JSON.stringify(vm.runInContext('rankSiteSearch(query).map(r=>({id:r.id,path:r.path,anchor:r.anchor,tier:r.tier,label:r.matchLabel}))',c)));};
const index=JSON.parse(JSON.stringify(vm.runInContext('buildSiteSearchIndex().map(e=>({id:e.id,type:e.type,path:e.path,anchor:e.anchor}))',c)));
assert.equal(index.length,161);assert.equal(new Set(index.map(e=>e.id)).size,161);assert.equal(index.filter(e=>e.type==='knowledge').length,95);
for(const entry of index){const file=path.join('dist',entry.path,'index.html');assert(fs.existsSync(file),entry.id+': destination');if(entry.anchor)assert(fs.readFileSync(file,'utf8').includes('id="'+entry.anchor+'"'),entry.id+': point anchor');}
assert.equal(query('traceparent')[0].id,'article:agent-observability');assert.equal(query('traceparent')[0].anchor,'section-2');
assert(query('traceparent').every(r=>!['article:gpu-cluster','article:agent-runtime'].includes(r.id)));
assert.equal(query('SQL 索引')[0].id,'article:database-index-locks');
assert.equal(query('cpu.max')[0].id,'article:linux-resource');assert.equal(query('cpu.max')[0].anchor,'section-3');
assert.equal(query('KV Cache')[0].id,'knowledge:sv-kv');
assert.deepEqual(query('ＴＣＰ'),query('tcp'));assert.deepEqual(query('  KV   Cache  '),query('kv cache'));
assert.deepEqual(query('完全不存在的条目xyz'),[]);assert.deepEqual(query('<>'),[]);
assert.equal(query('').length,6);

// Independent corpus distinguishes title/prose/code priority and abbreviation boundaries.
const fixture={modules:[{id:'test'}],cloudKnowledgeDomains:[],cloudKnowledgeExplanations:{},infraKnowledgeDomains:[],articles:[
 {id:'http',module:'test',number:'1',title:'连接',desc:'只讲协议',tags:[],sections:[['协议','<p>HTTP transport keeps a connection.</p>']]},
 {id:'code',module:'test',number:'2',title:'源码',desc:'标准库',tags:[],sections:[['示例','<pre><code>traceparent = "fixture"</code></pre>']]},
 {id:'prose',module:'test',number:'3',title:'原理',desc:'传播',tags:[],sections:[['字段','<p>traceparent carries the upstream context.</p>']]},
 {id:'title',module:'test',number:'4',title:'traceparent',desc:'字段',tags:[],sections:[['说明','<p>TP means tensor parallel here.</p>']]},
 {id:'split',module:'test',number:'5',title:'两个词',desc:'cpu activity',tags:[],sections:[['范围','<p>The max count is ten.</p>']]}
]};vm.createContext(fixture);vm.runInContext(fs.readFileSync('dist/site-search.js','utf8'),fixture);
const ask=value=>{fixture.q=value;return JSON.parse(JSON.stringify(vm.runInContext('rankSiteSearch(q).map(e=>e.id)',fixture)));};
assert.deepEqual(ask('traceparent'),['article:title','article:prose','article:code']);
assert.deepEqual(ask('TP'),['article:title']);assert.deepEqual(ask('cpu.max'),[]);
const highlighted=vm.runInContext('siteSearchHighlight(\'<img src="x"> & text\',["img"])',fixture);
assert(!highlighted.includes('<img'));assert(highlighted.includes('&lt;<mark>img</mark>'));assert(highlighted.includes('&amp;'));
console.log('PASS:161 actual entries/95 point anchors, direct body and identifier matches, multiword and full-width queries, independent title/prose/code ranking, TP/HTTP boundary and escaped snippets.');
