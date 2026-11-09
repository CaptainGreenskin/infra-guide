/* Learning goals are views over the same curriculum, never separate copies of lessons.
   Each route adds its real prerequisite closure before offering a next lesson. */
const learningProfiles={
 'cloud-platform':{track:'cloud',label:'云平台与云原生',aim:'能解释应用从资源申请到上线的完整路径，写出部署、配置与交付方案。',targets:['cloud-compute','iam-security','k8s-workloads','scheduling-resources','k8s-networking','k8s-storage','config-secrets','k8s-autoscaling','serverless-execution','terraform-state','gitops-reconciliation','cloud-service-lab'],gate:'部署一个有持久数据的服务，说明请求怎样抵达、配置怎样生效，以及一次失败发布怎样回退。'},
 'cloud-sre':{track:'cloud',label:'SRE 与稳定性',aim:'能从用户结果定位瓶颈，算清容量与恢复目标，再验证故障保护。',targets:['cloud-compute','iam-security','tcp-event-loop','database-index-locks','cache-consistency','mysql-recovery','k8s-networking','elasticity','observability','resilience','cloud-service-lab'],gate:'给出一条故障时间线、一个容量预算和一次恢复对照；每个判断都指向相应信号。'},
 'ai-training':{track:'ai',label:'分布式训练与作业平台',aim:'从一步参数更新出发，讲清训练状态、通信、数据供给、检查点和作业调度。',targets:['gpu-memory','training-communication','data-pipeline','multinode-lab','training-performance','gpu-scheduling','kubernetes-training','training-lab'],gate:'用同一训练任务比较正常执行与恢复执行的更新结果，并说明扩到多机时新增哪些环境条件。'},
 'ai-inference':{track:'ai',label:'模型推理与服务',aim:'沿输入、模型计算、历史缓存、请求调度和输出计时理解推理服务。',targets:['position-encoding','roofline-model','model-serving','quantization-serving','inference-performance','ai-lifecycle','speculative-decoding'],gate:'估算一个请求的 KV 缓存和并发容量，复算首词元延迟，再解释一次版本切换的验收条件。'},
 'ai-operators':{track:'ai',label:'GPU 与算子性能',aim:'从形状、数值和访存账走到实现与性能轨迹；先确认等价，再判断瓶颈。',targets:['position-encoding','autograd-training','flash-attention-io','tensor-parallel-math','operator-profiling'],gate:'给定形状，手算运算量与字节；比较参考实现的输出与梯度，再说明轨迹支持了哪个性能判断。'},
 'agent-app':{track:'agent',label:'Agent 应用与评估',aim:'先走通受控工具任务，再组织上下文与检索，最后用真实产物验收。',targets:['agent-security','agent-recovery','agent-memory','agent-retrieval','agent-evaluation','agent-observability'],gate:'完成一个读资料、生成报告并保存的任务。可以运行<a href="/article/production-readiness/?goal=agent-app#integrated-service-run">S3 本机综合实验</a>，也可以直接用实验记录自检。核对正常报告金额为 37，跨租户读取与撤权后的新请求均返回 403。再看提交后恢复的对照。沿用原操作 ID，两次工具尝试只留一份效果。换新 ID 则留下两份。实验按固定步骤执行，用本机 CPU 线性模型求和。'},
 'agent-platform':{track:'agent',label:'Agent 运行平台',aim:'围绕持久状态、执行权限、沙箱、接管与可观测性建立运行时。',targets:['agent-sandbox','durable-workflows','agent-retrieval','agent-observability','kairo-practice','production-readiness'],gate:'用<a href="/article/durable-workflows/?goal=agent-platform#mcp-commit-recovery">本地恢复实验</a>自检。工具已返回回执，图恢复同一任务时仍要重跑 publish。先预测沿用操作 ID 或按尝试生成 ID 各会留下几份报告，再用两份数据库的记录核对金额、回执和图的终态。可只读记录，也可运行实验。目标平台另按适配器契约验收。'}
};
function selectedLearningProfile(){if(typeof location==='undefined')return null;const path=location.pathname?.match(/\/roadmap\/([a-z-]+)\/?$/)?.[1];return learningProfiles[path]||learningProfiles[new URLSearchParams(location.search).get('goal')]||null;}
function learningProfileRoute(profile){
 const result=[],seen=new Set(),visiting=new Set();
 function visit(id){if(seen.has(id))return;if(visiting.has(id))throw Error('Learning prerequisite cycle: '+id);visiting.add(id);for(const[dep]of chapterDependencies[id]||[])visit(dep);visiting.delete(id);seen.add(id);result.push(id);}
 profile.targets.forEach(visit);return result;
}
function learningProfilePriority(id,profile){const ids=learningProfileRoute(profile);return profile.targets.includes(id)?'岗位重点':ids.includes(id)?'先修基础':'选学专题';}
function readingArticleURL(id){const profile=selectedLearningProfile();return articleURL(id)+(profile&&learningProfileRoute(profile).includes(id)?'?goal='+Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile):'');}
function learningGoalSelectorHTML(track){
 const candidate=selectedLearningProfile(),current=candidate?.track===track?candidate:null,base='/roadmap/?track='+track;
 return '<nav class="learning-goal-selector" aria-label="按学习目标选择重点"><a href="'+base+'#route-'+track+'" '+(!current?'aria-current="page"':'')+'>完整课程</a>'+Object.entries(learningProfiles).filter(([,p])=>p.track===track).map(([id,p])=>'<a href="/roadmap/'+id+'/#learning-goal" '+(current===p?'aria-current="page"':'')+'>'+p.label+'</a>').join('')+'</nav>';
}
function learningGoalHTML(profile){
 if(!profile)return '';
 const route=learningProfileRoute(profile);
 return '<section class="learning-goal" id="learning-goal"><h2>'+profile.label+'</h2><p>'+profile.aim+'</p><p class="evidence-note">'+route.length+' 章，已把需要的先修排在前面。会做本章练习的内容可跳过；没有要求先学完整的其他方向。</p><ol class="goal-chapters">'+route.map(id=>{const a=articleById(id);return '<li><a href="'+articleURL(id)+'?goal='+Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile)+'"><small>'+learningProfilePriority(id,profile)+'</small><span>'+a.number+' '+a.title+'</span></a></li>';}).join('')+'</ol><p class="goal-gate"><b>学完要交出的结果</b>'+profile.gate+'</p></section>';
}
function learningGoalChapterNav(a){
 const profile=selectedLearningProfile();if(!profile)return '';
 const id=Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile),route=learningProfileRoute(profile),index=route.indexOf(a.id);
 if(index<0)return '';
 const previous=articleById(route[index-1]),next=articleById(route[index+1]);
 return '<nav class="goal-reading-nav" aria-label="当前岗位路线"><span>正在按“'+profile.label+'”学习 · '+(index+1)+' / '+route.length+'</span><a href="/roadmap/'+id+'/#learning-goal">查看这条路线</a>'+(previous?'<a href="'+readingArticleURL(previous.id)+'">← 上一章：'+previous.number+' '+previous.title+'</a>':'')+(next?'<a href="'+readingArticleURL(next.id)+'">本路线下一章：'+next.number+' '+next.title+' →</a>':'<p>已到本路线最后一章。回到路线页，用交付任务检查理解。</p>')+'</nav>';
}

// Follow a selected learning route through prose, search and field references.
// An explicit destination goal wins; an unrelated chapter keeps its normal URL.
function learningContextHref(href){
 if(typeof href!=='string'||!href.startsWith('/')||href.startsWith('//'))return href;
 const hashAt=href.indexOf('#'),fragment=hashAt<0?'':href.slice(hashAt),withoutHash=hashAt<0?href:href.slice(0,hashAt);
 const queryAt=withoutHash.indexOf('?'),pathname=queryAt<0?withoutHash:withoutHash.slice(0,queryAt);
 const query=new URLSearchParams(queryAt<0?'':withoutHash.slice(queryAt+1));
 const articleId=pathname.match(/\/article\/([a-z0-9-]+)\/?$/)?.[1],moduleId=pathname.match(/\/module\/([a-z0-9-]+)\/?$/)?.[1];
 if(!articleId&&!moduleId)return href;
 const profile=selectedLearningProfile(),explicitGoal=query.has('goal');let changed=false;
 if(moduleId==='practice'){
  const currentParams=new URLSearchParams(typeof location==='undefined'?'':location.search);
  const currentId=(typeof location==='undefined'?'':location.pathname||'').match(/\/article\/([a-z0-9-]+)\/?$/)?.[1];
  const current=articles.find(a=>a.id===currentId);
  const explicitProfile=explicitGoal?learningProfiles[query.get('goal')]:null;
  const track=query.get('track')||explicitProfile?.track||profile?.track||currentParams.get('track')||(current?chapterReadingContext(current).track:null);
  if(track&&Object.hasOwn(trackDefinitions,track)&&!query.has('track')){query.set('track',track);changed=true;}
  if(!explicitGoal&&profile&&profile.track===track){query.set('goal',Object.keys(learningProfiles).find(id=>learningProfiles[id]===profile));changed=true;}
 }else if(!explicitGoal&&profile){
  const matches=articleId?learningProfileRoute(profile).includes(articleId):modules.some(m=>m.id===moduleId&&m.track===profile.track);
  if(matches){query.set('goal',Object.keys(learningProfiles).find(id=>learningProfiles[id]===profile));changed=true;}
 }
 return changed?pathname+'?'+query.toString()+fragment:href;
}
function practiceArticleForContext(){
 const requested=new URLSearchParams(typeof location==='undefined'?'':location.search).get('track'),track=requested||selectedLearningProfile()?.track;
 return articles.find(a=>a.module==='practice'&&chapterReadingContext(a).track===track)||articles.find(a=>a.module==='practice');
}
