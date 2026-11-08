/* 领域定义表：三条主线编号与章节阅读顺序的单一事实源。
   Cloud 的 P0/C1–C9 由 cloud-course-map.js 先行重排；本表补齐 AI（A1–A3）、Agent（G）与综合实战（S），
   并统一全部模块的显示顺序。文章 id、URL 与锚点不变，只更新显示编号、模块归属与数组顺序。
   模块职责、标签与学习出口仍由各自内容文件维护；此处只裁决“属于哪个领域、第几章、按什么顺序读”。
   阅读顺序依据 roadmap 阶段：kubernetes-training 划入 A3 平台域（排在队列调度之后），
   Agent 按“任务与执行边界 → 恢复与上下文 → 工作流与检索 → 观测与验收”排列。 */
const courseDomainPlan=[
 ...cloudModulePlan.map(row=>[row[0],row[1],[...row[7]]]),
 ['model-foundations','A1',['transformer-model','tokenization-embedding','attention-mechanics','transformer-block','position-encoding','autograd-training','gpu-execution','roofline-model','flash-attention-io','tensor-parallel-math','operator-profiling']],
 ['training','A2',['gpu-cluster','distributed-training','gpu-memory','ddp-code','training-communication','data-pipeline','multinode-lab','checkpoint-recovery','training-performance']],
 ['platform','A3',['training-platform','gpu-scheduling','kubernetes-training','model-serving','quantization-serving','inference-performance','ai-lifecycle','moe-routing','speculative-decoding']],
 ['agent','G',['agent-runtime','mcp-protocol','agent-security','agent-sandbox','agent-recovery','agent-memory','agent-evaluation','durable-workflows','agent-retrieval','agent-observability','kairo-practice']],
 ['practice','S',['training-lab','cloud-service-lab','production-readiness']]
];
const courseChapterById=id=>{const a=articles.find(x=>x.id===id);if(!a)throw Error('course-map: unknown chapter '+id);return a};
const courseOldNumberToId=new Map(articles.map(a=>[a.number,a.id]));
const courseModuleOrder=new Map(courseDomainPlan.map(([id],index)=>[id,index]));
for(const[moduleId,n,ids]of courseDomainPlan){
 const m=modules.find(x=>x.id===moduleId);
 if(!m)throw Error('course-map: unknown module '+moduleId);
 m.n=n;
 let mainChapter=0;
 ids.forEach((articleId,index)=>{
  const a=courseChapterById(articleId);
  a.module=moduleId;
  // The protocol lesson expands G1 without renumbering published G2–G10.
  a.number=articleId==='mcp-protocol'?'G1.1':n+(/\d$/.test(n)?'.':'')+(++mainChapter);
  if(moduleId!=='training'&&a.group!==undefined)delete a.group; // 分组标签只属于 A2 训练模块
 });
}
trackDefinitions.ai.modules=['model-foundations','training','platform'];
trackDefinitions.agent.modules=['agent'];
modules.sort((a,b)=>(courseModuleOrder.get(a.id)??99)-(courseModuleOrder.get(b.id)??99));
articles.sort((a,b)=>(courseModuleOrder.get(a.module)-courseModuleOrder.get(b.module))||a.number.localeCompare(b.number,undefined,{numeric:true}));
const courseChapterCount=track=>articles.filter(a=>modules.find(m=>m.id===a.module)?.track===track).length;
Object.assign(modules.find(m=>m.id==='training'),{
 desc:'九章讲清一步训练、并行与显存、数据与通信、恢复和性能；作业提交与集群管理接到 A3。'
});
Object.assign(modules.find(m=>m.id==='platform'),{
 name:'AI 作业平台与推理服务',
 desc:'从训练作业、GPU 调度和 Kubernetes，走到推理、量化、性能评估与模型发布。'
});
// 阅读路线和目录共用稳定的章节 ID；跨领域的先修与综合实验明确列出。
const courseReadingStages={
 cloud:cloudLearningStages,
 ai:[
  ['模型与计算原理',['transformer-model','tokenization-embedding','attention-mechanics','transformer-block','position-encoding','autograd-training']],
  ['GPU 执行、IO 与层内并行',['gpu-execution','roofline-model','flash-attention-io','tensor-parallel-math','operator-profiling']],
  ['训练系统与资源模型',['gpu-cluster','distributed-training','gpu-memory']],
  ['执行、恢复与作业平台',['ddp-code','training-communication','data-pipeline','multinode-lab','checkpoint-recovery','training-performance','training-platform','gpu-scheduling','kubernetes-training','training-lab']],
  ['推理、量化与模型发布',['model-serving','quantization-serving','inference-performance','ai-lifecycle','moe-routing','speculative-decoding']]
 ],
 agent:[
  ['任务与执行边界',['agent-runtime','mcp-protocol','agent-security','agent-sandbox']],
  ['恢复、上下文与评估',['agent-recovery','agent-memory','agent-evaluation']],
  ['持久工作流与知识检索',['durable-workflows','agent-retrieval']],
  ['观测、接入与综合验收',['agent-observability','kairo-practice','production-readiness']]
 ]
};
// 旧的量化链接落到对应新小节；不把所有深链接挤到同一句迁移说明。
const quantizationLegacyAnchors={
 'section-8':'section-1','quantization-number-map':'quantization-number-map',
 'section-9':'section-3','section-10':'section-4','section-11':'section-5'
};
// Fixed published track fragments, including inner diagrams and executable examples.
const legacyTrackKnowledgeAnchors={
  "cloud": [
    "concept-path",
    "knowledge-service-model",
    "knowledge-control-data-plane",
    "knowledge-fault-domain",
    "knowledge-vm-runtime",
    "virtualization-resource-contract",
    "knowledge-cpu-memory-placement",
    "knowledge-instance-lifecycle",
    "knowledge-resource-contract",
    "concept-relations",
    "resource-aws-reliability",
    "resource-terraform-state",
    "examples"
  ],
  "ai": [
    "concept-path",
    "knowledge-mf-tensors",
    "knowledge-mf-attention",
    "knowledge-mf-decoder",
    "knowledge-mf-autograd",
    "knowledge-mf-gpu",
    "knowledge-mf-roofline",
    "concept-relations",
    "examples",
    "resource-d2l-zh",
    "resource-one-gpu-lm",
    "resource-ntu-genai"
  ],
  "agent": [
    "concept-path",
    "knowledge-ag-runtime",
    "tool-task-contract",
    "tool-finite-loop",
    "knowledge-ag-tools",
    "knowledge-ag-recovery",
    "cancel-request-and-effect",
    "knowledge-ag-fencing",
    "knowledge-ag-authorization",
    "approval-records",
    "knowledge-ag-context",
    "context-state-authority",
    "stale-context-recovery",
    "knowledge-ag-retrieval",
    "retrieval-lexical-foundation",
    "retrieval-evidence-pipeline",
    "knowledge-ag-observability",
    "agent-observation-signals",
    "agent-trace-effect-boundary",
    "knowledge-ag-evaluation",
    "evaluation-metric-contract",
    "knowledge-ag-sandbox",
    "sandbox-authority-boundary",
    "concept-relations",
    "examples",
    "resource-hf-agents",
    "resource-ntu-genai",
    "resource-berkeley-agents"
  ]
};
function courseRedirectFor(path,search='',hash=''){
 if(path==='/start/'||path==='/start')return '/'+search+hash;
 // Previously a track URL rendered a full field reference. Preserve its deep links.
 const legacyTrack=path.match(/^\/track\/(cloud|ai|agent)\/?$/);
 if(legacyTrack){
  let anchor;try{anchor=decodeURIComponent(hash.slice(1));}catch{return null;}
  if(legacyTrackKnowledgeAnchors[legacyTrack[1]].includes(anchor)){
   const moduleId={cloud:'compute',ai:'model-foundations',agent:'agent'}[legacyTrack[1]];
   return '/module/'+moduleId+'/'+search+hash;
  }
 }
 if(path!=='/article/model-serving/'&&path!=='/article/model-serving')return null;
 const query=new URLSearchParams(search);
 let anchor=hash.slice(1);
 try{anchor=decodeURIComponent(anchor)}catch{return null}
 if(!anchor&&query.has('section'))anchor='section-'+query.get('section');
 const target=quantizationLegacyAnchors[anchor];
 if(!target)return null;
 query.delete('section');
 return '/article/quantization-serving/'+(query.toString()?'?'+query.toString():'')+'#'+target;
}
// 旧编号引用映射到新编号。为避免把正文中的普通数值（如算例结果 7.5）误当作章节号，
// 只有两种确定语境参与替换：先修字段（整体由章节引用构成）与 <a> 链接的文字。
// 代码块、实验源码与其余正文逐字不动；正文中的章节引用一律通过链接表达。
const courseOldToNew=new Map([...courseOldNumberToId].map(([oldNumber,id])=>[oldNumber,courseChapterById(id).number]));
const courseRenumberText=text=>String(text).replace(/\b(0|[6-9])\.\d{1,2}\b/g,number=>courseOldToNew.get(number)||number);
const courseRenumberLinks=html=>String(html).replace(/(<a\b[^>]*>)([^<]*)(<\/a>)/g,(whole,open,label,close)=>{
 const target=open.match(/\bhref=["']#?\/article\/([a-z0-9-]+)(?:\/|[?#]|["'])/);
 if(!target)return whole;
 const destination=articles.find(a=>a.id===target[1]);
 if(!destination)return whole;
 return open+label.replace(/\b(0|[6-9])\.\d{1,2}\b/g,number=>courseOldNumberToId.get(number)===destination.id?destination.number:number)+close;
});
for(const a of articles){
 a.prereq=courseRenumberText(a.prereq);
 for(const section of a.sections)section[1]=courseRenumberLinks(section[1]);
}

// Publication metadata follows recorded body changes, never the build date.
const courseEditorialDates={
  "linux-resource": "2026.11.05",
  "concurrency-pools": "2026.11.05",
  "k8s-autoscaling": "2026.11.05",
  "observability": "2026.11.05",
  "position-encoding": "2026.11.05",
  "flash-attention-io": "2026.11.05",
  "gpu-cluster": "2026.11.05",
  "distributed-training": "2026.11.08",
  "ddp-code": "2026.11.05",
  "training-platform": "2026.11.05",
  "inference-performance": "2026.11.05"
};
for(const[id,date]of Object.entries(courseEditorialDates)){const a=courseChapterById(id);if((a.updated||"2026.11.03")<date)a.updated=date;}
courseChapterById("distributed-training").minutes=Math.max(courseChapterById("distributed-training").minutes,32);
