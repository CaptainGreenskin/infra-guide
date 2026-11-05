/* Test reader-facing ordering and markup preservation, not a claim of comprehension. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const data=vm.runInContext('({articles,modules,moduleConceptPaths,chapterConceptPaths,conceptGlossary})',c);
assert.equal(data.articles.length,66);assert.equal(Object.keys(data.chapterConceptPaths).length,66);
assert.equal(Object.keys(data.moduleConceptPaths).length,14);
assert.equal(new Set(data.conceptGlossary.map(e=>e.term)).size,data.conceptGlossary.length);
const bodies=new Set();
for(const[kind,paths]of [['module',data.moduleConceptPaths],['chapter',data.chapterConceptPaths]])for(const[id,p]of Object.entries(paths)){
 assert.equal(p.steps.length,3,id+': three dependency stages');
 for(const[title,body]of p.steps){assert(title.length>=4&&body.length>=35,id+': substantive authored step');assert(!bodies.has(body),id+': repeated filler');bodies.add(body);}
 assert(p.terms.length>=3,id+': introduced objects');
 for(const term of p.terms)assert(p.steps.flat().join(' ').includes(term),id+': unexplained declared term '+term);
 if(p.diagram)assert(fs.existsSync('dist/diagrams/'+p.diagram+'.svg'),id+': diagram');
 const html=fs.readFileSync('dist/'+(kind==='chapter'?'article':'module')+'/'+id+'/index.html','utf8');
 assert.equal((html.match(/id="concept-path"/g)||[]).length,1,id+': unique intro anchor');
 assert(html.includes('data-concept-kind="'+kind+'"'),id+': visible intro');
 assert(/href="[^"]+\/#concept-path"/.test(html),id+': direct contents link');
 const introAt=html.indexOf('id="concept-path"'),advancedAt=html.search(kind==='chapter'?/class="article-section"/:/class="knowledge-point"/);
 assert(advancedAt>introAt,id+': concepts before advanced prose');
 if(kind==='chapter'){
  const article=data.articles.find(a=>a.id===id);assert(article,id+': live chapter');
  assert(introAt<html.indexOf('class="description"'),id+': concepts before advanced chapter summary');
  for(let i=1;i<=article.sections.length;i++)assert(html.includes('id="section-'+i+'"'),id+': preserve section anchor '+i);
  assert(!/<details[^>]*class="concept-question-preview"[^>]*\bopen\b/.test(html),id+': case preview optional');
 }
}
const run=html=>{c.fixture=html;return vm.runInContext('explainFirstConceptTerms(fixture)',c);};
const count=(s,t)=>(s.match(new RegExp('data-concept-term="'+t+'"','g'))||[]).length;
assert.equal(count(run('<p>GPU计算，再交给GPU。</p>'),'GPU'),1);
assert.equal(count(run('<p>GPU计算。</p>'),'GPU'),1,'new page resets first occurrence');
assert(!run('<p>GPU是适合并行计算的处理器。</p><p>再用GPU。</p>').includes('data-concept-term'));
assert(!run('<p>中央处理器（<strong>CPU</strong>）执行指令。</p><p>CPU继续运行。</p>').includes('data-concept-term'));
for(const text of ['HTTPServer','pool-limit','my_GPU','CPU.limit','token-id','"GPU":3'])assert.equal(run('<p>'+text+'</p>'),'<p>'+text+'</p>','identifier / field preserved: '+text);
for(const tag of ['pre','code','a','button','summary','figure','h2','label']){
 const html='<'+tag+' title="GPU">GPU CPU Kubernetes</'+tag+'>';assert.equal(run(html),html,tag+': protected markup');
}
assert.equal(run('<p>归一化后的结果。</p>'),'<p>归一化后的结果。</p>','do not split Chinese compound');
const ambiguous=run('<p>trace里的节点，CPU代际，整数索引和追踪上下文。</p>');
for(const term of ['节点','代际','索引','上下文'])assert(!ambiguous.includes('data-concept-term="'+term+'"'),'ambiguous meaning must be explained by context: '+term);
// Whole existing code, link and figure blocks survive the real prose pass byte-for-byte.
const protectedBlocks=html=>html.match(/<(pre|code|a|figure)\b[^>]*>[\s\S]*?<\/\1>/g)||[];
for(const a of data.articles){c.a=a;const seen=vm.runInContext('conceptSeen(chapterConceptPaths[a.id])',c);c.seen=seen;
 for(const[,body]of a.sections){c.body=body;const output=vm.runInContext('explainFirstConceptTerms(body,seen)',c);assert.deepEqual(protectedBlocks(output),protectedBlocks(body),a.id+': unchanged code / links / figures');}
}
const cloud=fs.readFileSync('dist/track/cloud/index.html','utf8');
assert(cloud.indexOf('先有程序和用户请求')<cloud.indexOf('IaaS'),'Cloud basic objects before service models');
const conceptHit=vm.runInContext('rankSiteSearch("取回内容").find(r=>r.id==="article:attention-mechanics")',c);
assert(conceptHit&&conceptHit.anchor==='concept-path','search finds new explanation at the actual concept anchor');
assert.equal(vm.runInContext('buildSiteSearchIndex().length',c),161,'do not add duplicate chapter results');
const record=JSON.parse(fs.readFileSync('docs/CONCEPT_REVIEW_2026-11-05.json','utf8'));
for(const[file,sha]of Object.entries(record.source_sha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha,file+': reviewed revision');
assert.equal(record.chapters.length,66);assert.equal(record.modules.length,14);
console.log('PASS: 66 chapter / 14 system-page concept sequences, preserved section anchors and protected code/links, first-use boundaries, ambiguous meanings, original diagrams and reviewed revisions. Reader comprehension still needs human feedback.');
