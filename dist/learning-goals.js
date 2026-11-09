/* Learning goals are views over the same curriculum, never separate copies of lessons.
   Each route adds its real prerequisite closure before offering a next lesson. */
const learningProfiles={
 'cloud-platform':{track:'cloud',label:'云平台与云原生',aim:'能解释应用从资源申请到上线的完整路径，写出部署、配置与交付方案。',targets:['cloud-compute','iam-security','k8s-workloads','scheduling-resources','k8s-networking','k8s-storage','config-secrets','k8s-autoscaling','serverless-execution','terraform-state','gitops-reconciliation','cloud-service-lab'],gate:'为一个有持久数据的服务写部署与回退方案。用<a href="/article/cloud-service-lab/?goal=cloud-platform#kubernetes-service-run">服务实战</a>核对同一入口的实际后端和回退版本，再分别用<a href="/article/config-secrets/?goal=cloud-platform#native-config-projection">配置实验</a>与<a href="/article/k8s-storage/?goal=cloud-platform#native-csi-storage">卷实验</a>说明更新配置与换 Pod 后该看哪些证据。再用<a href="/article/serverless-execution/?goal=cloud-platform#native-jetstream-redelivery">事件重投实战</a>判断旧执行者仍活着时，哪一层可以拒绝它的写入。最后用<a href="/article/iam-security/?goal=cloud-platform#native-spiffe-workload-identity">工作负载身份实验</a>解释为什么两次双向 TLS 握手成功后，写报告分别得到 403 和 201。用<a href="/article/vpc-network/?goal=cloud-platform#native-tls-proxy">双段 TLS 对照</a>判断入口已握手时，如何确认 502 是上游证书校验失败。'},
 'cloud-sre':{track:'cloud',label:'SRE 与稳定性',aim:'能从用户结果定位瓶颈，算清容量与恢复目标，再验证故障保护。',targets:['cloud-compute','iam-security','tcp-event-loop','database-index-locks','cache-consistency','mysql-recovery','k8s-networking','elasticity','observability','resilience','cloud-service-lab'],gate:'从<a href="/article/observability/?goal=cloud-sre#section-9">两段 HTTP 追踪</a>取出同一请求的时间线。用<a href="/article/observability/?goal=cloud-sre#collector-sampling-check">采集管道对账</a>判断哪份记录能回答业务成功率。用<a href="/article/slo/?goal=cloud-sre#live-prometheus-burn">真实告警实战</a>解释单实例计数器归零和长短窗怎样影响规则状态。用<a href="/article/elasticity/?goal=cloud-sre#section-7">容量算例</a>写出积压与清空时间，再用<a href="/article/resilience/?goal=cloud-sre#section-9">恢复实验</a>核对恢复点和外部效果。再用<a href="/article/cache-consistency/?goal=cloud-sre#native-redis-client-tracking">Redis 失效对照</a>说明为什么旧回复还能回填，以及断线后从哪一层重新读取。分别标清每个判断所依据的信号。'},
 'ai-training':{track:'ai',label:'分布式训练与作业平台',aim:'从一步参数更新出发，讲清训练状态、通信、数据供给、检查点和作业调度。',targets:['gpu-memory','training-communication','data-pipeline','multinode-lab','training-performance','gpu-scheduling','kubernetes-training','training-lab'],gate:'先用<a href="/article/gpu-memory/?goal=ai-training#native-amp-window">混合精度实战</a>区分前向损失和实际更新，再用<a href="/article/gpu-scheduling/?goal=ai-training#native-kueue-admission">Kueue 作业实验</a>区分等待额度、等待节点和工作完成。用<a href="/article/training-communication/?goal=ai-training#ragged-ring-communication">不等长切分对照</a>解释如何识别真实位置和通信填充。再用<a href="/article/multinode-lab/?goal=ai-training#multinode-launch-run">双启动器四进程实战</a>比较连续两轮与保存后恢复的一加一轮，核对各进程的样本数、更新次数和状态差异。迁移到物理两机四卡时，分别列出会合、设备和共享检查点的验收证据。'},
 'ai-inference':{track:'ai',label:'模型推理与服务',aim:'沿输入、模型计算、历史缓存、请求调度和输出计时理解推理服务。',targets:['position-encoding','roofline-model','model-serving','quantization-serving','inference-performance','ai-lifecycle','speculative-decoding'],gate:'用<a href="/article/model-serving/?goal=ai-inference#section-4">KV 字节算例</a>估算缓存。用<a href="/article/model-serving/?goal=ai-inference#native-inference-prefix">前缀复用实验</a>区分槽空闲与缓存清除，再用<a href="/article/inference-performance/?goal=ai-inference#vllm-block-lifecycle">vLLM 块池实验</a>解释块引用归零后何时仍能命中。沿<a href="/article/inference-performance/?goal=ai-inference#section-2">逐词元时间线</a>练习计时，再用<a href="/article/inference-performance/?goal=ai-inference#native-inference-queue">真实双请求实验</a>区分服务端排队与客户端首词元等待。最后用<a href="/article/ai-lifecycle/?goal=ai-inference#section-8">CPU 模型发布实验</a>核对实际输出和版本指针，再用<a href="/article/ai-lifecycle/?goal=ai-inference#native-model-rollout">真实模型切换</a>检查健康探测漏掉的问题和旧流归属。'},
 'ai-operators':{track:'ai',label:'GPU 与算子性能',aim:'从形状、数值和访存账走到实现与性能轨迹；先确认等价，再判断瓶颈。',targets:['position-encoding','autograd-training','flash-attention-io','tensor-parallel-math','operator-profiling'],gate:'给定形状，先手算运算量与字节。用<a href="/article/operator-profiling/?goal=ai-operators#native-python-extension">扩展装载实战</a>定位构建与导入的失败阶段，再用<a href="/article/operator-profiling/?goal=ai-operators#operator-profile-run">CPU 算子轨迹</a>定位操作，用<a href="/article/tensor-parallel-math/?goal=ai-operators#section-9">两进程实战</a>核对输出和梯度，再用<a href="/article/flash-attention-io/?goal=ai-operators#ragged-ring-training">环形注意力对照</a>查出填充位置为什么会改变归一化。用<a href="/article/operator-profiling/?goal=ai-operators#triton-tail-mask-run">Triton 尾块实战</a>核对加载、归约和写回掩码。最后指出实际 GPU 仍要采集哪些计时和内存证据。'},
 'agent-app':{track:'agent',label:'Agent 应用与评估',aim:'先走通受控工具任务，再组织上下文与检索，最后用真实产物验收。',targets:['agent-security','agent-recovery','agent-memory','agent-retrieval','agent-evaluation','agent-observability'],gate:'完成一个读资料、生成报告并保存的任务。先用<a href="/article/agent-retrieval/?goal=agent-app#native-qdrant-retrieval">向量检索对照</a>核对高分候选何时能进入模型输入。再运行<a href="/article/production-readiness/?goal=agent-app#integrated-service-run">S3 本机综合实验</a>，也可以直接用实验记录自检。核对正常报告金额为 37，跨租户读取与撤权后的新请求均返回 403。再看提交后恢复的对照。沿用原操作 ID，两次工具尝试只留一份效果。换新 ID 则留下两份。实验按固定步骤执行，用本机 CPU 线性模型求和。'},
 'agent-platform':{track:'agent',label:'Agent 运行平台',aim:'围绕持久状态、执行权限、沙箱、接管与可观测性建立运行时。',targets:['agent-sandbox','durable-workflows','agent-retrieval','agent-observability','kairo-practice','production-readiness'],gate:'先用<a href="/article/agent-sandbox/?goal=agent-platform#native-sandbox-container">容器边界实验</a>核对输入和产物权限。用<a href="/article/mcp-protocol/?goal=agent-platform#mcp-http-cancellation-run">HTTP 断流对照</a>区分工具清理与业务提交。再用<a href="/article/mcp-protocol/?goal=agent-platform#native-mcp-http-authorization">HTTP 授权对照</a>判断令牌检查通过后，谁仍可以拒绝读报告。用<a href="/article/durable-workflows/?goal=agent-platform#mcp-commit-recovery">本地恢复实验</a>解释为什么操作身份不能随尝试变化。再跑<a href="/article/durable-workflows/?goal=agent-platform#native-approval-reentry">批准后恢复实验</a>，分别预测发布前撤权与提交后撤权的效果数。指出什么时候能查原回执，什么时候只能保留待确认。用<a href="/article/durable-workflows/?goal=agent-platform#native-parallel-merge">并行归并实战</a>判断分支冲突何时要转审核，并核对重放后的实际写入次数。再用<a href="/article/agent-observability/?goal=agent-platform#native-tail-sampling-ledger">采样与账本实战</a>分开统计错误尝试、完成任务和实际效果。再用<a href="/article/agent-observability/?goal=agent-platform#native-mcp-trace-reentry">MCP 进程恢复实验</a>区分 HTTP 父子跨度、跨追踪链接和业务回执。'}
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
 const route=learningProfileRoute(profile),goal=Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile);
 return '<section class="learning-goal" id="learning-goal"><h2>'+profile.label+'</h2><p>'+profile.aim+'</p><p class="evidence-note">'+route.length+' 章，已把需要的先修排在前面。会做本章练习的内容可跳过；没有要求先学完整的其他方向。</p><ol class="goal-chapters">'+route.map(id=>{const a=articleById(id);return '<li><a id="goal-chapter-'+id+'" href="'+articleURL(id)+'?goal='+goal+'"><small>'+learningProfilePriority(id,profile)+'</small><span>'+a.number+' '+a.title+'</span></a></li>';}).join('')+'</ol><p class="goal-gate" id="goal-gate" tabindex="-1"><b>学完要交出的结果</b>'+profile.gate+'</p></section>';
}
function learningGoalChapterNav(a){
 const profile=selectedLearningProfile();if(!profile)return '';
 const id=Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile),route=learningProfileRoute(profile),index=route.indexOf(a.id);
 if(index<0)return '';
 const previous=articleById(route[index-1]),next=articleById(route[index+1]);
 return '<nav class="goal-reading-nav" aria-label="当前岗位路线"><span>正在按“'+profile.label+'”学习 · '+(index+1)+' / '+route.length+'</span><a href="/roadmap/'+id+'/#learning-goal">查看这条路线</a>'+(previous?'<a href="'+readingArticleURL(previous.id)+'">← 上一章：'+previous.number+' '+previous.title+'</a>':'')+(next?'<a href="'+readingArticleURL(next.id)+'">本路线下一章：'+next.number+' '+next.title+' →</a>':'<a href="/roadmap/'+id+'/#goal-gate">打开这条路线的交付题 →</a>')+'</nav>';
}

// Follow a selected learning route through prose, search and field references.
// An explicit destination goal wins; an unrelated chapter keeps its normal URL.
function learningContextHref(href){
 if(typeof href!=='string'||!href.startsWith('/')||href.startsWith('//'))return href;
 const hashAt=href.indexOf('#'),fragment=hashAt<0?'':href.slice(hashAt),withoutHash=hashAt<0?href:href.slice(0,hashAt);
 const queryAt=withoutHash.indexOf('?'),pathname=queryAt<0?withoutHash:withoutHash.slice(0,queryAt);
 const query=new URLSearchParams(queryAt<0?'':withoutHash.slice(queryAt+1));
 const articleId=pathname.match(/\/article\/([a-z0-9-]+)\/?$/)?.[1],moduleId=pathname.match(/\/module\/([a-z0-9-]+)\/?$/)?.[1];
 const position=/\/roadmap\/?$/.test(pathname)?fragment.match(/^#route-chapter-(cloud|ai|agent)-([a-z0-9-]+)$/):null;
 if(!articleId&&!moduleId&&!position)return href;
 const profile=selectedLearningProfile(),explicitGoal=query.has('goal');
 if(position){
  if(explicitGoal||profile?.track!==position[1]||query.get('track')!==position[1]||!learningProfileRoute(profile).includes(position[2]))return href;
  const goal=Object.keys(learningProfiles).find(key=>learningProfiles[key]===profile);
  query.delete('track');
  const rest=query.toString();
  return pathname.replace(/\/roadmap\/?$/,'/roadmap/'+goal+'/')+(rest?'?'+rest:'')+'#goal-chapter-'+position[2];
 }
 let changed=false;
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
