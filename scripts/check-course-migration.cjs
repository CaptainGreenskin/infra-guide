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
// TOCs from the first Pages release linked to these now-removed section numbers.
const earlySections={
 'training-lab':{'section-8':'section-4','section-9':'section-1','section-10':'section-3'},
 'agent-observability':{'section-9':'subsection-6-1q7kv9j'},
 'k8s-networking':{'section-8':'section-6'}
};
function assertLegacySection(html,oldAnchor,target){
 assert.equal(html.split('id="'+oldAnchor+'"').length,2,oldAnchor+': one static target');
 const pattern=new RegExp('id="'+target+'"[^>]*>(?:</span>)?<span class="legacy-subsection-anchor" id="'+oldAnchor+'"');
 assert(pattern.test(html),oldAnchor+': static fragment must be adjacent to '+target);
}
c.hostedPath=p=>'/infra-guide'+p;
for(const [id,anchors] of Object.entries(earlySections)){
 for(const [oldAnchor,target] of Object.entries(anchors)){
  const articlePath='/article/'+id+'/',expected=articlePath+'?campaign=reader#'+target;
  for(const [query,hash] of [['?section='+oldAnchor.slice(8)+'&campaign=reader',''],['?campaign=reader','#'+oldAnchor]]){
   c.args=[articlePath,query,hash];
   assert.equal(vm.runInContext('courseRedirectFor(...args)',c),expected);
   c.legacyHash='#'+articlePath.slice(0,-1)+query+hash;
   const spa=vm.runInContext('publicRoute(legacyHash)',c);
   assert.equal(spa,'/infra-guide'+articlePath+query+hash);
   const url=new URL(spa,'https://example.test');
   c.args=[url.pathname.slice('/infra-guide'.length),url.search,url.hash];
   assert.equal(vm.runInContext('courseRedirectFor(...args)',c),expected);
  }
  assertLegacySection(body(page(id)),oldAnchor,target);
  if(id==='training-lab'){
   c.args=['/module/practice/','?campaign=reader','#'+oldAnchor];
   assert.equal(vm.runInContext('courseRedirectFor(...args)',c),expected);
   assertLegacySection(body(read('dist/module/practice/index.html')),oldAnchor,target);
  }
 }
 c.args=['/article/'+id+'/','?section=8','#section-1'];
 assert.equal(vm.runInContext('courseRedirectFor(...args)',c),null,'an existing fragment takes precedence');
 c.args=['/article/'+id+'/','','#constructor'];
 assert.equal(vm.runInContext('courseRedirectFor(...args)',c),null,'only published aliases can redirect');
}
for(const query of ['?track=cloud&section=8','?track=agent&section=8','?goal=cloud-sre&section=8','?goal=agent-app&section=8','?track=cloud&goal=ai-training&section=8']){
 c.args=['/module/practice/',query,''];
 assert.equal(vm.runInContext('courseRedirectFor(...args)',c),null,'keep the selected non-AI practice');
}
c.args=['/module/practice/','?track=ai&goal=cloud-sre&section=8',''];
assert.equal(vm.runInContext('courseRedirectFor(...args)',c),'/article/training-lab/?track=ai&goal=cloud-sre#section-4','explicit AI practice track takes precedence');
for(const [fragment,lesson,marker] of [
 ['attention-demo','attention-mechanics','data-attention-demo'],
 ['topology-demo','multinode-lab','data-training-topology']
]){
 const path='/article/gpu-cluster/',target='/article/'+lesson+'/',hash='#'+fragment;
 const search='?goal=ai-training&campaign=reader',expected=target+search+hash;
 for(const [oldQuery,oldHash] of [[search,hash],[search+'&section='+fragment,''],[search+'&section=2',hash]]){
  c.args=[path,oldQuery,oldHash];
  assert.equal(vm.runInContext('courseRedirectFor(...args)',c),expected);
 }
 c.legacyHash='#/article/gpu-cluster'+search+hash;
 const bridged=vm.runInContext('publicRoute(legacyHash)',c);
 assert.equal(bridged,'/infra-guide'+path+search+hash);
 c.args=[target,search,hash];
 assert.equal(vm.runInContext('courseRedirectFor(...args)',c),null,'canonical demonstration must stay in its own lesson');
 const old=body(page('gpu-cluster')),current=body(page(lesson)),id='id="'+fragment+'"';
 assert.equal(old.split(id).length,2,'one static legacy destination');
 assert(old.includes('<p '+id+' class="practice-links"><a href="'+target+hash+'"'),fragment+': without JavaScript, the old anchor offers the exact move');
 assert.equal(current.split(id).length,2,'one canonical demonstration destination');
 assert(current.includes(id+' '+marker),fragment+': real activity at the new address');
}
for(const hash of ['#section-2','#self-check','#unknown','#%ZZ']){
 c.args=['/article/gpu-cluster/','?section=2',hash];
 assert.equal(vm.runInContext('courseRedirectFor(...args)',c),null,'ordinary GPU chapter fragments stay there');
}
const numericalFixture='<p>读数7.5，版本6.4。</p><code>7.5</code><a href="https://example.test/">7.5 读数</a>';
c.html=numericalFixture+'<a href="/article/ai-lifecycle/">7.5 模型发布</a>';
assert.equal(vm.runInContext('courseRenumberLinks(html)',c),numericalFixture+'<a href="/article/ai-lifecycle/">A3.7 模型发布</a>','renumber only the actual target chapter label');
const home=read('dist/index.html'),outline=read('dist/outline/index.html'),start=read('dist/start/index.html');
assert.equal((home.match(/class="start-card"/g)||[]).length,3,'one sample collection');
assert(home.includes('<section class="track-grid" id="module-grid" aria-label="三条学习路线">'),'the old home catalog fragment lands on the current learning tracks');
assert(!home.includes('class="module-grid"'),'the full catalog belongs to the outline');
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
