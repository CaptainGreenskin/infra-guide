const inventory=require('./content-inventory.cjs');
/* Test reader-facing ordering and markup preservation, not a claim of comprehension. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const data=vm.runInContext('({articles,modules,moduleConceptPaths,chapterConceptPaths,conceptGlossary,optionalConceptReviews})',c);
assert.equal(data.articles.length,inventory.chapters);assert.equal(Object.keys(data.chapterConceptPaths).length,inventory.chapters);
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
 const reviewedBody=kind==='chapter'&&data.optionalConceptReviews.has(id);
 if(reviewedBody){assert(advancedAt<introAt,id+': reviewed standalone body precedes optional review');assert(html.indexOf('id="section-'+data.articles.find(a=>a.id===id).sections.length+'"')<introAt,id+': review follows the complete chapter');}
 else assert(advancedAt>introAt,id+': concept sequence precedes advanced prose');
 if(kind==='chapter'){
  const article=data.articles.find(a=>a.id===id);assert(article,id+': live chapter');
  if(!reviewedBody)assert(introAt<html.indexOf('class="description"'),id+': concepts before advanced chapter summary');
  for(let i=1;i<=article.sections.length;i++)assert(html.includes('id="section-'+i+'"'),id+': preserve section anchor '+i);
  if(html.includes('class="guided-intro"')){
   const guideStart=html.indexOf('<details class="guided-contract">');
   const question=html.indexOf('class="guided-intro"');
   assert(guideStart>=0&&question>guideStart&&question<advancedAt,id+': introductory question lives in the closed guide');
  }
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
assert(!run('<p>归一化。</p>').includes('data-concept-term'),'probability, feature, length and text normalization require context-specific definitions');
// The same word must not force a model definition into protocol/security prose.
for(const text of ['携带该token，当前进度和说明。','访问token已过期。','词元token是模型处理文本的离散单位。']){
 assert(!run('<p>'+text+'</p>').includes('data-concept-term="token"'),'ambiguous token needs an authored local definition: '+text);
}
const mcpProgress=data.articles.find(a=>a.id==='mcp-protocol').sections[5][1];
assert(mcpProgress.includes('progressToken')&&mcpProgress.includes('把通知交给正确调用')&&mcpProgress.includes('通知本身没有 id'),'MCP progress token is an authored call correlation, separate from a model token');
assert(!run(mcpProgress).includes('模型处理文本的离散单位'),'actual MCP progress text must not acquire a model-token meaning');
const namespaced=run('<p>namespace划定对象范围。</p>');assert(namespaced.includes('命名空间')&&!namespaced.includes('Linux中划分'),'generic namespace must not force Linux isolation into Kubernetes prose');
const cluster=run('<p>恢复为独立新单成员集群。</p>');
assert(cluster.includes('可部署在一台或多台机器上')&&!cluster.includes('由多台机器及其管理组件共同组成'),'logical cluster membership must not imply multiple physical machines');
// Whole existing code, link and figure blocks survive the real prose pass byte-for-byte.
const protectedBlocks=html=>html.match(/<(pre|code|a|figure)\b[^>]*>[\s\S]*?<\/\1>/g)||[];
for(const a of data.articles){c.a=a;const seen=vm.runInContext('conceptSeen(chapterConceptPaths[a.id])',c);c.seen=seen;
 for(const[,body]of a.sections){c.body=body;const output=vm.runInContext('explainFirstConceptTerms(body,seen)',c);assert.deepEqual(protectedBlocks(output),protectedBlocks(body),a.id+': unchanged code / links / figures');}
}
const cloud=fs.readFileSync('dist/track/cloud/index.html','utf8');
assert(cloud.includes('从用户的一次访问认识服务')&&cloud.indexOf('id="section-1"')<cloud.indexOf('id="concept-path"'),'Cloud standalone first lesson retains its closing concept review');
const conceptHit=vm.runInContext('rankSiteSearch("取回内容").find(r=>r.id==="article:attention-mechanics")',c);
assert(conceptHit&&conceptHit.anchor==='concept-path','search finds new explanation at the actual concept anchor');
assert.equal(vm.runInContext('buildSiteSearchIndex().length',c),inventory.search,'do not add duplicate chapter results');
const record=JSON.parse(fs.readFileSync('docs/CONCEPT_REVIEW_2026-11-05.json','utf8'));
// Preserve the published concept audit; the current source is checked by the
// append-only coherence review, including the later ambiguous-kernel repair.
for(const[file,sha]of Object.entries(record.source_sha256))assert.equal(crypto.createHash('sha256').update(require('child_process').execFileSync('git',['show','814dfe982040fe1ea79b7b2a4ebb9645c5e11d48:'+file])).digest('hex'),sha,file+': published reviewed revision');
assert.equal(record.chapters.length,75);assert.equal(record.modules.length,14);
const originalConcepts=require('./content-at-commit.cjs').evaluate('da60d2825a5f5a93a08b68a871ace14a69ab7c6e','chapterConceptPaths');
for(const[id,path]of Object.entries(originalConcepts))assert.deepEqual(JSON.parse(JSON.stringify(data.chapterConceptPaths[id])),path,id+': original concept sequence changed without a separate review');
const additions=require('./content-review-records.cjs').new_concept_reviews;
const addedConcepts=Object.keys(data.chapterConceptPaths).filter(id=>!Object.hasOwn(originalConcepts,id));
assert.deepEqual(addedConcepts.sort(),additions.map(row=>row.id).sort());
for(const row of additions){assert(row.scope&&row.observation&&row.reviewed_at);assert.equal(crypto.createHash('sha256').update(JSON.stringify(data.chapterConceptPaths[row.id])).digest('hex'),row.reviewed_path_sha256,row.id+': unreviewed new concept sequence');}
console.log('PASS: '+inventory.chapters+' chapter / 14 system-page concept sequences, preserved section anchors and protected code/links, first-use boundaries, ambiguous meanings, original diagrams and reviewed revisions. Reader comprehension still needs human feedback.');
