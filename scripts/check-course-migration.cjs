/* Migration guarantees: existing links and code survive a change in the reading structure. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const read=p=>fs.readFileSync(p,'utf8');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const c={URLSearchParams};vm.createContext(c);
for(const[,file]of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(read('dist/'+file),c,{filename:file});
const data=JSON.parse(JSON.stringify(vm.runInContext('({articles,modules,trackDefinitions,courseDomainPlan,courseReadingStages})',c)));
const record=JSON.parse(read('docs/COURSE_MIGRATION_2026-11-07.json'));
const page=id=>read('dist/article/'+id+'/index.html');
function body(html){
 const start=html.indexOf('<article class="article">');assert(start>=0);
 let depth=0;
 for(const match of html.slice(start).matchAll(/<\/?article\b[^>]*>/g)){
  depth+=match[0].startsWith('</')?-1:1;
  if(!depth)return html.slice(start,start+match.index+match[0].length);
 }
 throw Error('unclosed reading article');
}
const ids=data.articles.map(a=>a.id);
const declared=data.courseDomainPlan.flatMap(row=>row[2]);
assert.equal(new Set(declared).size,declared.length,'a chapter must belong to exactly one domain');
assert.deepEqual([...declared].sort(),[...ids].sort(),'the domain plan must account for every chapter');
for(const[module,prefix,chapters]of data.courseDomainPlan){
 const m=data.modules.find(m=>m.id===module);assert(m&&m.n===prefix,module+': matching domain label');
 let mainChapter=0;const nested={'mcp-protocol':'G1.1'};
 chapters.forEach((id,index)=>{
  const a=data.articles.find(a=>a.id===id);assert.equal(a.module,module);
  assert.equal(a.number,nested[id]||prefix+(/\d$/.test(prefix)?'.':'')+(++mainChapter));
 });
}
assert.equal(data.articles.find(a=>a.id==='kubernetes-training').number,'A3.3');
assert.equal(data.articles.find(a=>a.id==='quantization-serving').number,'A3.5');
assert.equal(data.articles.find(a=>a.id==='agent-security').number,'G2');
for(const[track,stages]of Object.entries(data.courseReadingStages)){
 const routeIds=stages.flatMap(stage=>stage[1]);
 assert.equal(new Set(routeIds).size,routeIds.length,track+': no repeated chapter in a route');
 const expected=data.articles.filter(a=>data.trackDefinitions[track].modules.includes(a.module)).map(a=>a.id).sort();
 assert.deepEqual(routeIds.filter(id=>expected.includes(id)).sort(),expected,track+': route must cover its whole track');
 for(const id of routeIds)assert(ids.includes(id),track+': unknown route chapter '+id);
}
const aiRoute=data.courseReadingStages.ai.flatMap(s=>s[1]);
assert(aiRoute.indexOf('gpu-scheduling')<aiRoute.indexOf('kubernetes-training'));
assert(aiRoute.indexOf('model-serving')<aiRoute.indexOf('quantization-serving'));
assert(aiRoute.indexOf('quantization-serving')<aiRoute.indexOf('inference-performance'));
for(const legacy of record.legacy_articles){
 assert(ids.includes(legacy.id),legacy.id+': public article removed');
 const html=body(page(legacy.id));
 for(const anchor of legacy.anchors)assert(html.includes('id="'+anchor+'"'),legacy.id+': old fragment lost: '+anchor);
}
const quant=body(page('quantization-serving'));
const actualCode=[...quant.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>sha(m[1]));
for(const hash of record.moved_quantization.code_sha256)assert(actualCode.includes(hash),'a moved code block changed or disappeared');
for(const source of record.moved_quantization.diagrams)assert(quant.includes('src="'+source+'"'),'moved figure: '+source);
for(const[oldAnchor,newAnchor]of Object.entries(record.moved_quantization.anchor_targets)){
 c.args=['/article/model-serving/','?campaign=reader','#'+oldAnchor];
 assert.equal(vm.runInContext('courseRedirectFor(...args)',c),'/article/quantization-serving/?campaign=reader#'+newAnchor);
 assert(quant.includes('id="'+newAnchor+'"'),'new fragment missing: '+newAnchor);
}
c.args=['/article/model-serving/','?section=10&campaign=reader',''];
assert.equal(vm.runInContext('courseRedirectFor(...args)',c),'/article/quantization-serving/?campaign=reader#section-4');
for(const hash of ['#section-1','#kv-demo','#self-check','#references','#unknown','#%E0%A4%A']){
 c.args=['/article/model-serving/','',hash];assert.equal(vm.runInContext('courseRedirectFor(...args)',c),null,'unmoved/invalid fragment must stay in its chapter');
}
c.args=['/start/','','#sample-readings'];assert.equal(vm.runInContext('courseRedirectFor(...args)',c),'/#sample-readings');
c.args=['/start/','','#/article/gpu-cluster'];assert.equal(vm.runInContext('courseRedirectFor(...args)',c),'/#/article/gpu-cluster','retain an old SPA destination through the start alias');
const numericalFixture='<p>读数7.5，版本6.4。</p><code>7.5</code><a href="https://example.test/">7.5 读数</a>';
c.html=numericalFixture+'<a href="/article/ai-lifecycle/">7.5 模型发布</a>';
assert.equal(vm.runInContext('courseRenumberLinks(html)',c),numericalFixture+'<a href="/article/ai-lifecycle/">A3.7 模型发布</a>','renumber only the actual target chapter label');
const home=read('dist/index.html'),outline=read('dist/outline/index.html'),start=read('dist/start/index.html');
assert.equal((home.match(/class="start-card"/g)||[]).length,3,'one sample collection');
assert(!home.includes('id="module-grid"'),'the full catalog belongs to the outline');
assert(!outline.includes('class="start-card"')&&!outline.includes('class="sample-paths"'));
assert(!start.includes('class="start-card"')&&start.includes('noindex,follow'));
assert(start.includes('<link rel="canonical" href="https://cloud-infra-guide-llh.tautagave4.chatgpt.site/">'));
assert(!read('dist/sitemap.xml').includes('/start/</loc>'),'alias must not compete with the home page');
const about=read('dist/about/index.html');
for(const[track,label]of [['cloud','Cloud'],['ai','AI'],['agent','Agent']]){
 const total=data.articles.filter(a=>data.trackDefinitions[track].modules.includes(a.module)).length;
 assert(about.includes(label+' '+total+'章'),track+': stale public count');
}
const labs=read('dist/labs/index.html');
const lab=labs.slice(labs.indexOf('id="lab-ai-quantization"'),labs.indexOf('</li>',labs.indexOf('id="lab-ai-quantization"')));
assert(lab.includes('/article/quantization-serving/#section-5'),'lab links to the relocated executable section');
for(const a of data.articles){
 const html=body(page(a.id));
 assert(/<details class="chapter-practice" id="chapter-practice">/.test(html),a.id+': optional practice closed by default');
 assert(html.includes('id="self-check"')&&html.includes('data-download-note="'+a.id+'"'));
 assert(html.includes('id="references"')&&html.includes('class="article-nav"'),a.id+': sources and continuation retained');
}
console.log('PASS: domain partitions and complete reading routes, 66 stable article/fragment inventories, six moved code blocks/two figures, precise legacy destinations, protected numerical text, one home sample collection and readable chapter endings.');
