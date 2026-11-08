/* Reading destinations and object identities must agree with their real chapter and fixture. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const c={};vm.createContext(c);for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const data=JSON.parse(vm.runInContext('JSON.stringify({articles,routes:courseReadingStages,profiles:learningProfiles,standalone:[...optionalConceptReviews]})',c));
const article=id=>{const a=data.articles.find(x=>x.id===id);assert(a);return a;};
const section=(id,i)=>article(id).sections[i][1];
for(const[id,index,target]of [['model-serving',5,'inference-performance'],['model-serving',6,'inference-performance'],['concurrency-pools',7,'database-index-locks'],['agent-security',5,'agent-sandbox'],['transformer-block',8,'position-encoding']]){
 const html=section(id,index);assert(!html.includes('下一章'),id+': named subject instead of an inaccurate universal next step');assert(html.includes('/article/'+target+'/'),id+': explicit destination');
}
assert(section('autograd-training',8).includes('带到后续训练实验的记录'));
assert(section('operator-profiling',4).includes('回看带宽与算力上界'));
assert(section('operator-profiling',8).includes('回看注意力怎样减少中间搬运'));
assert(section('tensor-parallel-math',5).includes('后续延伸：全局损失分母'));
for(const[id,pair]of Object.entries({'cloud-compute':['compute','cpu-memory-placement'],'storage-recovery':['cloud-data','backup-restore'],'mysql-recovery':['cloud-data','backup-restore'],'tensor-parallel-math':['training','tr-parallel'],'moe-routing':['training','tr-parallel'],'kairo-practice':['agent','ag-evaluation'],'kubernetes-training':['platform','sv-contract']})){c.chapterId=id;assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(chapterFieldConcepts(articleById(chapterId))[0])',c)),pair,id+': authored primary concept');}
c.chapterId='kubernetes-training';assert(JSON.parse(vm.runInContext('JSON.stringify(chapterFieldConcepts(articleById(chapterId)))',c)).some(([m,id])=>m==='training'&&id==='tr-recovery'),'previous recovery relation retained');
const fullAI=data.routes.ai.flatMap(s=>s[1]);assert(fullAI.indexOf('flash-attention-io')<fullAI.indexOf('operator-profiling'));
c.profile=data.profiles['ai-training'];const training=JSON.parse(vm.runInContext('JSON.stringify(learningProfileRoute(profile))',c));
assert(!training.includes('position-encoding'));assert(training.includes('transformer-block')&&training.includes('autograd-training'));
c.profile=data.profiles['agent-app'];const application=JSON.parse(vm.runInContext('JSON.stringify(learningProfileRoute(profile))',c));
assert(!application.includes('agent-sandbox'));assert(application.includes('agent-security')&&application.includes('agent-recovery'));
for(const[id,index,text]of [['mcp-protocol',0,'没有共享任务数据库'],['agent-memory',3,'该数据库独立于运行时章的日报 37'],['agent-observability',0,'不共享任务状态或操作回执']])assert(section(id,index).includes(text),id+': fixture boundary');
const input=section('agent-retrieval',14);for(const term of ['输入交付','业务效果','任务结果','/article/agent-evaluation/','/article/agent-recovery/'])assert(input.includes(term));
const chain=section('kubernetes-training',2);for(const term of ['id="training-object-chain"','ownerReferences','WORLD_SIZE=4','平台策略','rank 用来标识当前通信组','metadata.ownerReferences','workloads.kueue.x-k8s.io'])assert(chain.includes(term));
for(const id of ['training-platform','gpu-scheduling'])assert(section(id,0).includes('/article/kubernetes-training/#training-object-chain'));
const decode=x=>x.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;|&#39;|&apos;/g,"'").replace(/&amp;/g,'&');
const svg=fs.readFileSync('dist/diagrams/v65-training-object-chain.svg','utf8'),meta=JSON.parse(decode(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
assert.equal(meta.run,'R1');assert.equal(meta.attempt,'A1');assert.equal(meta.world_size,4);assert.deepEqual(meta.rank_groups,[[0,1],[2,3]]);
assert.equal(meta.podsets.reduce((total,p)=>total+p.count*p.gpu_per_pod,0),4);
assert.deepEqual(meta.owner_reference_edges,[['W1','J1'],['P0','J1'],['P1','J1']]);assert.equal(meta.native_execution,false);assert.equal(meta.gpu_execution,false);
const page=fs.readFileSync('dist/article/kubernetes-training/index.html','utf8');assert(page.includes('v65-training-object-chain.svg'));assert(page.includes('data-toc="training-object-chain"'));
const old=require('./content-at-commit.cjs')('0ef6f2b7d91ba401577cabc9f997890f534d2988');
for(const id of ['training-storage','database-index-locks','cache-consistency','gpu-execution','roofline-model','flash-attention-io','tensor-parallel-math']){
 const a=article(id),before=old.find(a=>a.id===id);assert(data.standalone.includes(id));assert.equal(a.updated,'2026.11.09');
 assert.notEqual(JSON.stringify(a.sections),JSON.stringify(before.sections));
 assert.deepEqual(a.sections.map(s=>s[0]),before.sections.map(s=>s[0]));
 const body=a.sections.map(s=>s[1]).join(''),previous=before.sections.map(s=>s[1]).join('');
 for(const re of [/<pre\b[\s\S]*?<\/pre>/g,/<figure\b[\s\S]*?<\/figure>/g,/\bhref=["'][^"']+["']/g]){
  const current=body.match(re)||[],former=previous.match(re)||[];
  assert.deepEqual(re.source.startsWith('<pre')?current:current.sort(),re.source.startsWith('<pre')?former:former.sort(),id+': original code, figure and URL inventory');
 }
}
console.log('PASS: named chapter destinations across full and role-specific curricula, independent Agent sample identities and three receipt scopes, declared Workload/Job/Pod/rank ownership and 4-card arithmetic, seven complete bodies with original code/figures/URLs. No Kueue/GPU execution or reader mastery inferred.');
