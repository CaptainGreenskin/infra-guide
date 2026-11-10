/* Context must survive a prose/search/field detour, without changing explicit choices. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const files=[...fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g)].map(m=>m[1]).filter(f=>f!=='app.js');
const gateTargets={
 'cloud-platform':[['cloud-service-lab','kubernetes-service-run'],['k8s-workloads','native-pdb-eviction-rollout'],['config-secrets','native-config-projection'],['k8s-storage','native-csi-storage'],['serverless-execution','native-jetstream-redelivery'],['iam-security','native-spiffe-workload-identity'],['vpc-network','native-tls-proxy']],
 'cloud-sre':[['observability','section-9'],['observability','collector-sampling-check'],['slo','live-prometheus-burn'],['slo','native-alert-notification'],['elasticity','section-7'],['resilience','section-9'],['cache-consistency','native-redis-client-tracking'],['storage-recovery','native-postgres-pitr'],['elasticity','native-cpu-quota-http']],
 'ai-training':[['gpu-memory','native-amp-window'],['ddp-code','native-ddp-join'],['training-platform','native-training-submission-preflight'],['gpu-scheduling','native-kueue-admission'],['kubernetes-training','native-kubernetes-gloo-job'],['training-communication','ragged-ring-communication'],['multinode-lab','multinode-launch-run'],['multinode-lab','native-ddp-target-preflight']],
 'ai-inference':[['model-serving','section-4'],['quantization-serving','native-int8-batch-quality'],['model-serving','native-inference-prefix'],['model-serving','rtx-pro-6000-cache-case'],['inference-performance','vllm-block-lifecycle'],['inference-performance','section-2'],['inference-performance','native-inference-queue'],['inference-performance','native-pd-split'],['inference-performance','tp-placement'],['ai-lifecycle','section-8'],['ai-lifecycle','native-model-rollout']],
 'ai-operators':[['operator-profiling','native-python-extension'],['operator-profiling','operator-profile-run'],['operator-profiling','torch-compile-graph-break'],['tensor-parallel-math','section-9'],['tensor-parallel-math','native-pipeline-schedules'],['flash-attention-io','ragged-ring-training'],['operator-profiling','triton-tail-mask-run']],
 'agent-platform':[['agent-sandbox','native-sandbox-container'],['agent-sandbox','native-sandbox-egress'],['mcp-protocol','mcp-http-cancellation-run'],['mcp-protocol','native-mcp-http-authorization'],['mcp-protocol','native-mcp-catalog-refresh'],['mcp-protocol','native-mcp-result-receipt'],['durable-workflows','mcp-commit-recovery'],['durable-workflows','native-approval-reentry'],['durable-workflows','native-parallel-merge'],['agent-observability','native-tail-sampling-ledger'],['agent-observability','native-mcp-trace-reentry'],['kairo-practice','kairo-read-evidence']]
};
for(const base of ['/','/infra-guide/']){
 const c={URLSearchParams,location:{pathname:base+'article/tokenization-embedding/',search:'',hash:''},document:{querySelector:s=>s==='base'?{getAttribute:()=>base}:null},articleURL:id=>base+'article/'+id+'/'};vm.createContext(c);
 for(const file of files)vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
 const data=JSON.parse(vm.runInContext('JSON.stringify({profiles:learningProfiles,articles,modules,labs:labLearningCatalog})',c));
 const run=href=>{c.href=href;return vm.runInContext('readerInternalHref(href)',c);};
 for(const[key,p]of Object.entries(data.profiles)){
  c.location.search='?goal='+key;c.profileKey=key;
  const ids=JSON.parse(vm.runInContext('JSON.stringify(learningProfileRoute(learningProfiles[profileKey]))',c));
  const id=ids.at(-1),mod=data.articles.find(a=>a.id===ids[0]).module;
  const expected=base+'article/'+id+'/?section=2&goal='+key+'#detail';
  assert.equal(run('#/article/'+id+'?section=2#detail'),expected,key+': prose link');
  assert.equal(run('article/'+id+'/?section=2#detail'),expected,key+': relative API bridge');
  assert.equal(run(base+'article/'+id+'/?section=2#detail'),expected,key+': search destination');
  const other=data.articles.find(a=>!ids.includes(a.id));
  assert.equal(run('/article/'+other.id+'/'),base+'article/'+other.id+'/',key+': no route imposed outside the chosen curriculum');
  assert.equal(run('/article/'+id+'/?goal=agent-app#detail'),base+'article/'+id+'/?goal=agent-app#detail',key+': explicit choice wins');
  assert.equal(run('/article/'+id+'/?goal=#detail'),base+'article/'+id+'/?goal=#detail',key+': explicit reset wins');
  assert.equal(run('/module/'+mod+'/?concept=opaque#concept-relations'),base+'module/'+mod+'/?concept=opaque&goal='+key+'#concept-relations',key+': field detour keeps context');
  assert.equal(run('/module/'+mod+'/?concept=opaque#map-concept-opaque'),base+'module/'+mod+'/?concept=opaque&goal='+key+'#map-concept-opaque',key+': focused field detour keeps context');
  const unit=data.labs.find(lab=>lab.track===p.track&&ids.includes(lab.chapter));
  const task='#lab-'+unit.id,labPath='/labs/?track='+p.track;
  assert.equal(run(labPath+task),base+labPath.slice(1)+'&goal='+key+task,key+': lab evidence keeps active role');
  assert.equal(run(labPath+'&goal='+task),base+labPath.slice(1)+'&goal='+task,key+': explicit lab context reset wins');
  const crossTrack=p.track==='cloud'?'ai':'cloud';
  assert.equal(run('/labs/?track='+crossTrack+task),base+'labs/?track='+crossTrack+task,key+': different track has independent lab view');
  assert.equal(run(labPath+'#labs-'+p.track),base+labPath.slice(1)+'#labs-'+p.track,key+': plain lab directory stays generic');
  c.location.pathname=base+'labs/';c.location.search='?track='+p.track+'&goal='+key;
  c.selectedLab=unit;
  const runTarget=vm.runInContext('labCatalogRunPath(selectedLab)',c),[runPath,runAnchor]=runTarget.split('#');
  assert(runAnchor);
  assert.equal(run(runTarget),base+runPath.slice(1)+'?goal='+key+'#'+runAnchor,key+': from lab back to exact lesson anchor');
  c.location.pathname=base+'article/tokenization-embedding/';c.location.search='?goal='+key;
  const gate=vm.runInContext('learningGoalHTML(learningProfiles[profileKey])',c);
 const staticRole=base==='/'?fs.readFileSync('dist/roadmap/'+key+'/index.html','utf8'):'';
 for(const chapter of ids){
  const path='/roadmap/?track='+p.track,legacy='#route-chapter-'+p.track+'-'+chapter;
  const rolePath=base+'roadmap/'+key+'/',anchor='#goal-chapter-'+chapter;
  assert.equal(run(path+legacy),rolePath+anchor,key+': exact position inside the chosen role');
  assert.equal(run(path+'&source=chapter'+legacy),rolePath+'?source=chapter'+anchor,key+': retain context parameters');
  assert.equal(run(path+'&goal='+legacy),base+path.slice(1)+'&goal='+legacy,key+': explicit full route wins');
  const row='id="'+anchor.slice(1)+'" href="'+base+'article/'+chapter+'/?goal='+key+'"';
  assert(gate.includes(row),key+': exact focusable role row');
  if(staticRole)assert.equal(staticRole.split(row).length,2,key+': exact role row is unique in the static page');
 }
 const unrelatedPosition='/roadmap/?track='+p.track+'#route-chapter-'+p.track+'-'+other.id;
 assert.equal(run(unrelatedPosition),base+unrelatedPosition.slice(1),key+': optional chapter retains full-course location');
  assert(gate.includes('id="goal-gate" tabindex="-1"'),key+': direct gate target');
  c.lastArticle=id;
  const lastNav=vm.runInContext('learningGoalChapterNav(articleById(lastArticle))',c);
  assert(lastNav.includes('href="/roadmap/'+key+'/#goal-gate"'),key+': last chapter can return directly to its gate');
  if(gateTargets[key]){
   const actual=[...p.gate.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
   const expected=gateTargets[key].map(([id,fragment])=>{
    const article=data.articles.find(a=>a.id===id),section=fragment.match(/^section-(\d+)$/);
    assert(ids.includes(id),key+': gate remains on its course');
    assert(section?article.sections[Number(section[1])-1]:article.sections.some(([,body])=>body.includes('id="'+fragment+'"')),key+': exact practice target');
    const href='/article/'+id+'/?goal='+key+'#'+fragment;
    assert(gate.includes('href="'+href+'"')&&run(href)===base+href.slice(1),key+': gate preserves role context');
    return href;
   });
   assert.deepEqual(actual,expected);
  }
  const capstone={cloud:'cloud-service-lab',ai:'training-lab',agent:'production-readiness'}[p.track];
  assert.equal(run('/module/practice/'),base+'module/practice/?track='+p.track+'&goal='+key,key+': correct shared project');
  c.location.pathname=base+'module/practice/';
  assert.equal(vm.runInContext('practiceArticleForContext().id',c),capstone);
  c.location.pathname=base+'article/tokenization-embedding/';
 }
 c.location.pathname=base+'module/training/';c.location.search='?goal=ai-inference';
 c.trainingPractice=vm.runInContext('fieldPracticeHTML("training",{"tr-recovery":"检查点恢复"})',c);
 assert(c.trainingPractice.includes('岗位选读'),'the inference role sees the training field exercise as optional');
 const trainingExercise=c.trainingPractice.match(/href="([^"]+)"/)[1];
 assert.equal(run(trainingExercise),base+trainingExercise.slice(1),'optional field exercises do not take over the role route');
 c.location.search='?goal=ai-training';
 assert(!vm.runInContext('fieldPracticeHTML("training",{"tr-recovery":"检查点恢复"})',c).includes('岗位选读'),'the training role owns its core exercise');
 c.location.pathname=base+'article/tokenization-embedding/';
 c.profileKey='agent-app';
 const applicationRoute=JSON.parse(vm.runInContext('JSON.stringify(learningProfileRoute(learningProfiles[profileKey]))',c));
 assert(applicationRoute.includes('agent-recovery')&&!applicationRoute.includes('agent-sandbox'),'the application route retains an independent recovery lesson');
 const recoveryOpening=data.articles.find(a=>a.id==='agent-recovery').sections[0][1];
 assert(!/^<p>上一章/.test(recoveryOpening),'recovery prose must not assume the sandbox chapter on a route that skips it');
 const recoveryAnchor='#mcp-commit-recovery',recoveryPath='/article/durable-workflows/';
 const mcpClosing=data.articles.find(a=>a.id==='mcp-protocol').sections.at(-1)[1];
 const recoveryBody=data.articles.find(a=>a.id==='durable-workflows').sections[8][1];
 assert(mcpClosing.includes('href="'+recoveryPath+recoveryAnchor+'"'),'MCP points straight to the optional write-recovery experiment');
 assert(recoveryBody.includes('id="'+recoveryAnchor.slice(1)+'"'),'native experiment keeps its section anchor');
 assert(!applicationRoute.includes('durable-workflows'),'the optional experiment does not extend the application route');
 c.location.pathname=base+'article/mcp-protocol/';
 c.location.search='?goal=agent-app';
 assert.equal(run(recoveryPath+recoveryAnchor),base+recoveryPath.slice(1)+recoveryAnchor);
 c.location.search='?goal=agent-platform';
 const platformRecovery=recoveryPath+'?goal=agent-platform'+recoveryAnchor;
 assert.equal(run(recoveryPath+recoveryAnchor),base+platformRecovery.slice(1));
 assert(vm.runInContext('learningGoalHTML(learningProfiles["agent-platform"])',c).includes('href="'+platformRecovery+'"'),'platform practice links to the experiment with its selected goal');
 const servicePath='/article/production-readiness/',serviceAnchor='#integrated-service-run';
 const applicationService=servicePath+'?goal=agent-app'+serviceAnchor;
 const service=data.articles.find(a=>a.id==='production-readiness');
 assert(service.sections.some(([,body])=>body.includes('id="'+serviceAnchor.slice(1)+'"')),'shared service keeps the exact experiment anchor');
 assert(!applicationRoute.includes(service.id),'the shared experiment is optional on the application route');
 c.location.pathname=base+'roadmap/agent-app/';
 c.location.search='';
 const retrievalPath='/article/agent-retrieval/?goal=agent-app#native-qdrant-retrieval';
 assert(applicationRoute.includes('agent-retrieval'),'application route covers retrieval');
 assert(data.articles.find(a=>a.id==='agent-retrieval').sections.some(([,body])=>body.includes('id="native-qdrant-retrieval"')),'retrieval lab anchor exists');
 assert(vm.runInContext('learningGoalHTML(selectedLearningProfile())',c).includes('href="'+retrievalPath+'"'),'application gate links to actual retrieval');
 assert.equal(run(retrievalPath),base+retrievalPath.slice(1),'retrieval experiment retains the application goal');
 assert(vm.runInContext('learningGoalHTML(selectedLearningProfile())',c).includes('href="'+applicationService+'"'),'application gate links to the exact experiment');
 assert.equal(run(applicationService),base+applicationService.slice(1),'shared experiment keeps the explicit application goal and fragment');
 c.location.pathname=base+servicePath.slice(1);
 c.location.search='?goal=agent-app';
 assert.equal(vm.runInContext('learningGoalChapterNav(articleById("production-readiness"))',c),'','optional visit does not show an application-route position');
 assert.equal(run('/module/practice/'),base+'module/practice/?track=agent&goal=agent-app','shared experiment keeps its Agent practice context');
 c.location.search='';
 for(const[track,id]of Object.entries({cloud:'cloud-service-lab',ai:'training-lab',agent:'production-readiness'})){
  c.location.pathname=base+'article/'+id+'/';
  assert.equal(run('/module/practice/'),base+'module/practice/?track='+track,track+': ordinary project breadcrumb stays in its track');
  c.location.pathname=base+'module/practice/';c.location.search='?track='+track;
  assert.equal(vm.runInContext('practiceArticleForContext().id',c),id);c.location.search='';
 }
 assert.equal(run('https://example.org/article/agent-runtime/'),'https://example.org/article/agent-runtime/');
 assert.equal(run('//example.org/article/agent-runtime/'),'//example.org/article/agent-runtime/');
 assert.equal(run('#section-2'),'#section-2');
 c.location.pathname=base+'article/tokenization-embedding/';c.location.search='?goal=ai-inference';
 c.fixture='<a href="/article/attention-mechanics/?source=map&amp;section=2#detail">Attention</a>';
 assert.equal(vm.runInContext('cleanInternalHTML(fixture)',c),'<a href="'+base+'article/attention-mechanics/?source=map&amp;section=2&amp;goal=ai-inference#detail">Attention</a>');
}
console.log('PASS: seven learning routes retain context through prose/search/field links and exact chapter returns at root and Pages paths; explicit choices, external URLs, fragments and HTML entities preserved; shared projects stay in the correct track.');
