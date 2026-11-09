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
const prePattern=/<pre\b[\s\S]*?<\/pre>/g;
const figurePattern=/<figure\b[\s\S]*?<\/figure>/g;
const hrefPattern=/\bhref=["'][^"']+["']/g;
const flashLessons=section('flash-attention-io',7).split('<h3 id="ragged-ring-training">分片长度不等时，哪些位置还可以读</h3>');
assert.equal(flashLessons.length,2,'the ragged ring lesson follows the historical attention lessons');
assert(flashLessons[0].includes('<h3 id="ring-context-training">'));
const cacheLessons=section('cache-consistency',6).split('<h3 id="native-redis-client-tracking">');
assert.equal(cacheLessons.length,2,'native Redis follows the historical cache lesson');
assert(cacheLessons[1].includes('labs/redis-client-tracking/validation.json'));
const gpuLessons=section('gpu-execution',3).split('<h3 id="native-warp-memory-sectors">');
assert.equal(gpuLessons.length,2,'native lane traces follow the historical stride lesson');
assert(gpuLessons[1].includes('labs/warp-memory-sectors/validation.json'));
const tensorGroups=section('tensor-parallel-math',5);
const tensorGroupFigure=(tensorGroups.match(figurePattern)||[]).filter(figure=>figure.includes('src="diagrams/parallel-data-replica-groups.svg"'));
assert.equal(tensorGroupFigure.length,1,'the existing tensor-parallel section has one additional rank-group diagram');
const suffixBoundaries={
 'flash-attention-io':[7,flashLessons[0]],
 'cache-consistency':[6,cacheLessons[0]],
 'gpu-execution':[3,gpuLessons[0]],
 'tensor-parallel-math':[5,tensorGroups.replace(tensorGroupFigure[0],'')]
};
for(const id of ['training-storage','database-index-locks','cache-consistency','gpu-execution','roofline-model','flash-attention-io','tensor-parallel-math']){
 const a=article(id),before=old.find(a=>a.id===id);assert(data.standalone.includes(id));assert.equal(a.updated,'2026.11.09');
 assert.notEqual(JSON.stringify(a.sections),JSON.stringify(before.sections));
 assert.deepEqual(a.sections.map(s=>s[0]),before.sections.map(s=>s[0]));
 // Dedicated lab checks cover the exact suffixes. Preserve the earlier inventory.
 const suffixBoundary=suffixBoundaries[id];
 const body=a.sections.map((s,i)=>i===suffixBoundary?.[0]?suffixBoundary[1]:s[1]).join(''),previous=before.sections.map(s=>s[1]).join('');
 for(const re of [prePattern,figurePattern,hrefPattern]){
  const current=body.match(re)||[],former=previous.match(re)||[];
  if(re===hrefPattern&&id==='tensor-parallel-math'){
   // The added training timeline cites the two papers that define its schedules.
   former.push('href="https://arxiv.org/abs/1811.06965"','href="https://arxiv.org/abs/2104.04473"');
  }
  if(id==='database-index-locks'){
   if(re===prePattern){
    const addition=section(id,6).split('<h3 id="native-innodb-lab">');
    assert.equal(addition.length,2);
    const blocks=addition[1].match(re)||[];
    assert.equal(blocks.length,2);
    assert(blocks[0].includes('EXPLAIN ANALYZE')&&blocks[0].includes('CREATE INDEX ix_orders_tenant_seq'));
    assert(blocks[1].includes('innodb_lab.py --json native-record.json')&&blocks[1].includes('innodb_lab.py --check-record native-record.json'));
    // The InnoDB exercise follows the SQLite code and precedes the last legacy output.
    former.splice(former.length-1,0,...blocks);
   }else if(re===figurePattern){
    const added=current.filter(f=>f.includes('src="diagrams/innodb-lock-waits.svg"'));
    assert.equal(added.length,1);
    former.push(added[0]);
   }else{
    former.push(...[
     'https://dev.mysql.com/doc/refman/8.4/en/explain.html#explain-analyze',
     'diagrams/innodb-lock-waits.svg','diagrams/innodb-lock-waits.svg',
     '/article/database-index-locks/#native-innodb-lab',
     'https://dev.mysql.com/doc/refman/8.4/en/innodb-error-handling.html',
     'labs/innodb.zip','labs/innodb/validation.json',
     'https://github.com/CaptainGreenskin/infra-guide/actions/runs/42555714589',
     'https://dev.mysql.com/doc/refman/8.4/en/performance-schema-data-lock-waits-table.html'
    ].map(url=>'href="'+url+'"'));
   }
  }
  if(id==='flash-attention-io'){
   if(re===prePattern){
    former.push(
     '<pre tabindex="0"><code>dist.all_gather(keys, local_k)\ndist.all_gather(values, local_v)</code></pre>',
     '<pre tabindex="0"><code>python -m torch.distributed.run --standalone --nproc_per_node=2 context_attention.py &gt; local-record.json</code></pre>',
     '<pre tabindex="0"><code>python -m torch.distributed.run --standalone --nproc_per_node=3 ring_training.py --positions 1536</code></pre>');
   }else if(re===figurePattern){
    for(const name of ['v76-context-parallel','v77-ring-training']){
     const figure=current.filter(f=>f.includes('src="diagrams/'+name+'.svg"'));
     assert.equal(figure.length,1);
     former.push(figure[0]);
    }
   }else{
    former.push(...[
     'diagrams/v76-context-parallel.svg','diagrams/v76-context-parallel.svg',
     'https://arxiv.org/html/2310.01889#S3',
     'https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/features/context_parallel.html#context-parallel-overview',
     'labs/context-parallel.zip','labs/context-parallel/context_attention.py','labs/context-parallel/validation.json',
     'diagrams/v77-ring-training.svg','diagrams/v77-ring-training.svg',
     'labs/ring-context-training.zip','labs/ring-context-training/ring_training.py','labs/ring-context-training/validation.json'
    ].map(url=>'href="'+url+'"'));
   }
  }
  assert.deepEqual(re===prePattern?current:current.sort(),re===prePattern?former:former.sort(),id+': original code, figure and URL inventory');
 }
}
const trainingLessons=section('training-communication',5).split('<h3 id="ragged-ring-communication">不等长位置分片怎样约定收发形状</h3>');
assert.equal(trainingLessons.length,2,'the ragged ring bridge follows the historical communication lesson');
assert(trainingLessons[0].includes('/article/flash-attention-io/#context-parallel-attention'));
assert(!training.includes('flash-attention-io'),'the context-parallel lesson remains an optional training extension');
const context=JSON.parse(fs.readFileSync('dist/labs/context-parallel/validation.json','utf8'));
assert.deepEqual([context.status,context.device,context.backend,context.world_size],['passed','cpu','gloo',2]);
assert.equal(context.dtype,'torch.float64');
assert.deepEqual(context.ranks.map(r=>r.positions),[[0,1],[2,3]]);
const values=[[2,0],[0,2],[4,2],[2,4]], masses=[[1],[1,2],[1,2,3],[1,2,1,4]];
const expected=masses.map(row=>[0,1].map(d=>row.reduce((sum,m,i)=>sum+m*values[i][d],0)/row.reduce((a,b)=>a+b)));
const actual=context.ranks.flatMap(r=>r.output);
assert.equal(actual.length,expected.length);
for(const [i,row] of actual.entries()){
 assert.equal(row.length,2);
 for(const [d,n] of row.entries())assert(Math.abs(n-expected[i][d])<1e-12);
}
for(const rank of context.ranks)for(const [i,trace] of rank.trace.entries()){
 const q=rank.positions[i];assert.equal(trace.query_position,q);
 assert.deepEqual(trace.blocks.flatMap(b=>b.visible_keys),Array.from({length:q+1},(_,k)=>k));
}
for(const name of ['local_query_positions','omit_remote_kv']){
 assert.equal(context.negative_cases[name].rejected_rank,1);
 assert(context.negative_cases[name].max_abs_error>1);
}
assert.equal(context.max_abs_error,0);
console.log('PASS: named chapter destinations across full and role-specific curricula, independent Agent sample identities and three receipt scopes, declared Workload/Job/Pod/rank ownership and 4-card arithmetic, seven complete bodies with original code/figures/URLs. No Kueue/GPU execution or reader mastery inferred.');
