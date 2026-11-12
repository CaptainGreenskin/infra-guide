const cloudModules=trackDefinitions.cloud.modules;
const aiModules=trackDefinitions.ai.modules;
const articleById=id=>articles.find(a=>a.id===id);
const trackForModule=id=>moduleFor(id)?.track;
function chapterLink(a){return `<a class="chapter-row" href="${articleURL(a.id)}"><div class="chapter-top"><span>CHAPTER ${a.number}</span><span>${a.level} · ${progress[a.id]?'已读 ✓':'开始阅读 ↗'}</span></div><h2>${a.title}</h2><p>${a.desc}</p></a>`}
function learningContract(a,m,overview){
 const baseline=a.baseline||(a.module==='training'?'训练代码基线 PyTorch 2.5.1':'');
 return `<details class="guided-contract"><summary>先修与实验条件</summary><div class="learning-contract">
  <p class="description">${a.desc}</p>
  <div class="article-meta"><span class="category">${m.name}</span><span>${a.level}</span><span>·</span><span>${a.edition||'训练专题'}</span></div>
  ${tags(a.tags)}
  <strong>读完这一章，你应该能</strong><ul>${a.objectives.map(t=>'<li>'+t+'</li>').join('')}</ul>${prerequisiteConnectionsHTML(a)}
  <p class="evidence-note">${baseline?baseline+' · ':''}<a href="#/labs">实验验证范围 ↗</a></p>${cloudArticleKnowledge(a)}${infraArticleKnowledge(a)}${overview}${guidedIntro(a)}
 </div></details>`;
}
function mobileContents(a,contents){return `<details class="mobile-contents"><summary>章节导航与本文目录</summary><a href="#/module/${a.module}">← 返回本模块目录</a>${contents}</details>`}
function courseIntro(){return `<div class="course-intro"><span class="small-badge">训练专题 / ${articles.filter(a=>a.module==='training').length} 章</span><h2>先理解一步训练，再走向多机多卡。</h2><p>从资源预算、数据与通信，到完整DDP程序、两机四卡手册和恢复对照。同一份实验贯穿执行机制与故障验证。</p><div class="course-links"><a class="btn" href="#/article/gpu-cluster">从全景开始 →</a><a class="btn secondary" href="#/labs">实验与验证记录 ↗</a></div><small>CPU/Gloo已有实测；真实GPU/NCCL与Kubernetes仍需目标环境验证。</small></div>`}
function sectionGroup(list){return trainingGroups.map((g,i)=>`<section class="course-group"><div class="group-label">${g}</div>${list.filter(a=>a.group===i).map(chapterLink).join('')}</section>`).join('')}
function simplePage(title,kicker,desc,body){document.title=title+' · InfraGuide';$('#app').innerHTML=`<main id="main" class="container collection" tabindex="-1"><div class="breadcrumb"><a href="#/">知识库</a><span>／ ${title}</span></div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p class="description">${desc}</p>${body}</main>${footer()}`}
function trackCard(key){const t=trackDefinitions[key],n=articles.filter(a=>t.modules.includes(a.module)).length;return `<a class="track-card ${key}" href="#/track/${key}"><span class="track-index">${{cloud:'01',ai:'02',agent:'03'}[key]} / ${n} 章</span><h2>${t.label}<span>↗</span></h2><h3>${t.subtitle}</h3><p>${t.story}</p><div class="track-steps">${{cloud:'请求 → 资源 → 交付 → 恢复',ai:'数据 → 训练 → 评估 → 推理',agent:'目标 → 工具 → 状态 → 验收'}[key]}</div></a>`}
function homePage(){
 document.title='InfraGuide · 云计算、AI Infra 与 Agent Infra 中文学习指南';
 $('#app').innerHTML=`<main id="main" class="container home-reading" tabindex="-1">
 <section class="infra-hero"><div class="eyebrow"><span class="dot"></span> 给中国初学者与面试准备者的基础设施指南</div>
 <div class="hero-grid"><div><h1>基础设施学习指南</h1><p>Cloud Infra 讲服务如何上线和恢复。AI Infra 从模型计算讲到多卡训练和推理。Agent Infra 用一份订单报告讲工具调用、权限和任务恢复。</p>
 <div class="buttons"><a class="btn" href="/outline/">先看知识地图 →</a><a class="btn secondary" href="/interview/">按重点准备面试 →</a></div>
 <p class="home-route-link"><a href="/roadmap/">已有基础？按学习路线继续 →</a></p></div></div></section>
 <section class="track-grid" id="module-grid" aria-label="三条学习路线">${Object.keys(trackDefinitions).map(trackCard).join('')}</section>
 <div class="shared-line"><b>共同的工程底座</b><span>计算与数据路径 · 身份与权限 · 可观测性 · 版本与恢复</span><a href="/article/cloud-overview/">建立系统地图 →</a></div>
 <section class="section" id="sample-readings"><div class="section-heading"><div><h2>先读一章，亲手验证一个结果</h2><p>选一个方向尝试。建议时间只覆盖阅读与首轮练习，环境准备另计。 <a class="inline-link" href="/about/#reader-trial">参加 15 分钟试读 →</a></p></div></div>
 <div class="start-paths">${[
 ['Cloud Infra','约10分钟','服务成功率到底怎么算？','slo','把不同流量的实例合起来，算清全局成功率和错误预算。','设总事件1000、好事件990、目标99%。解释预算为什么刚好用完。','无需额外环境'],
 ['AI Infra','约20分钟','KV Cache 为什么能减少重复计算？','model-serving','沿三个 token 的生成过程，区分输入位置、输出和缓存。','运行 attention_lab.py，核对 cache_max_abs_error，再解释移除因果 mask 的变化。','Python 3.9+，无需 GPU'],
 ['Agent Infra','约20分钟','工具成功了，任务为什么还没完成？','agent-recovery','复现工具提交后进程退出，观察恢复时的尝试数与实际效果。','运行 agent_lab.py，核对 attempts=2、tool_effects=1，解释由谁完成去重。','Python 3.9+，无需模型服务']
 ].map(([track,time,title,id,result,task,env],i)=>`<section class="start-card"><div class="start-meta"><span>0${i+1} / ${track}</span><b>${time}</b></div><h3>${title}</h3><p>${result}</p><div class="start-outcome"><strong>动手核对</strong><p>${task}</p></div><a class="inline-link" href="${articleURL(id)}">阅读样章并完成练习 →</a><small>${env}</small></section>`).join('')}</div></section>
 <nav class="home-tools" aria-label="继续学习"><a href="/outline/">完整大纲 · ${articles.length} 章 →</a><a href="/labs/">代码与实验 →</a><a href="/problems/">按问题查机制 →</a><a href="/resources/">资料与视频 →</a></nav>
 </main>${footer()}`;
}

const trackEntryOverviews={
 cloud:{lead:'查一次订单，请求先过网络，再由应用读数据库。服务上线后，还要管权限、容量和故障恢复。',rows:[
  ['请求怎样跑起来',[['compute','计算与虚拟化'],['network','云网络'],['cloud-data','存储与数据']]],
  ['应用怎样上线',[['native','容器与 Kubernetes'],['serverless','Serverless'],['cloud-delivery','IaC 与 GitOps']]],
  ['系统怎样长期运转',[['cloud-security','身份安全'],['cloud-capacity','容量与成本'],['sre','SRE 与恢复']]]
 ],extra:['foundation','按需补系统基础']},
 ai:{lead:'先看模型怎样预测下一个词，再看多张 GPU 怎样一起训练，以及训练好的模型怎样回答请求。',rows:[
  ['理解模型计算',[['model-foundations','Transformer、GPU 与算子']]],
  ['完成训练与恢复',[['training','并行、数据、通信与检查点']]],
  ['部署并验证服务',[['platform','作业调度、推理与交付']]]
 ]},
 agent:{lead:'把订单汇总成报告并保存。模型提出下一步，运行时核对权限、调用工具，再检查报告是否真的写入。',rows:[
  ['安全执行工具',[['/article/mcp-protocol/','工具接口'],['/article/agent-security/','授权'],['/article/agent-sandbox/','隔离']]],
  ['处理状态与证据',[['/article/agent-recovery/','回执与恢复'],['/article/durable-workflows/','持久工作流'],['/article/agent-memory/','上下文'],['/article/agent-retrieval/','检索与证据']]],
  ['核对实际任务',[['/article/agent-observability/','追踪'],['/article/agent-evaluation/','评估'],['/article/kairo-practice/','Kairo 接入']]]
 ],extra:['agent','查看 Agent 核心关系图']}
};
function trackEntryOverviewHTML(article,showTrackOverview){
 const track=Object.keys(trackEntryOverviews).find(key=>trackDefinitions[key].start===article.id);
 if(!track)return '';
 const {lead,rows,extra}=trackEntryOverviews[track];
 const link=([target,label])=>'<a href="'+(target.startsWith('/')?target:fieldMapURL(target))+'">'+label+'</a>';
 const heading='track-overview-'+track;
 const bodyPath=showTrackOverview?hostedPath('/track/'+track+'/')+location.search:readingArticleURL(article.id);
 const roadmap=trackRoadmapLink(track);
 return '<section class="track-entry-overview" aria-labelledby="'+heading+'"><div class="track-entry-head"><h2 id="'+heading+'">'+trackDefinitions[track].label+' 学习全貌</h2><a href="'+trainingEscape(bodyPath)+'#section-1">读正文 ↓</a></div><p>'+lead+'</p><ol>'+rows.map(([label,links])=>'<li><b>'+label+'</b><span>'+links.map(link).join('')+'</span></li>').join('')+'</ol><div class="track-entry-links">'+(extra?link(extra):'')+'<a data-track-roadmap href="'+roadmap.href+'">'+roadmap.label+'</a></div></section>';
}

// A direction opens its first lesson. The sidebar is the curriculum, not another landing page.
function trackPage(kind){
 const track=trackDefinitions[kind];
 articlePage(articleById(track.start),null,true);
 document.title=track.label+' 中文学习路线 · InfraGuide';
}

function sidebarView(moduleId, current) {
 const track = current?chapterReadingContext(articleById(current)).track:moduleFor(moduleId).track;
 const routeIds=courseReadingStages[track]?.flatMap(s=>s[1]);
 const topicArticles = articles.filter(article => routeIds?routeIds.includes(article.id):trackForModule(article.module) === track);
 const topicModules = modules.filter(module => topicArticles.some(a=>a.module===module.id));
 const read = topicArticles.filter(article => progress[article.id]).length;
 const label = trackDefinitions[track]?.label || '综合实战';
 const sections = topicModules.map(module => {
  const active = module.id === moduleId;
  const chapters = topicArticles.filter(article => article.module === module.id);
  const links = courseDirectoryEntries(chapters).map(group => {
   const entries=group.entries.map(({article,label,fullTitle})=>{
    const selected = article.id === current ? 'class="current" aria-current="page"' : '';
    return `<a href="${readingArticleURL(article.id)}" title="${trainingEscape(fullTitle)}" ${selected}>${article.number} ${trainingEscape(label)}${progress[article.id]?'<span class="read-mark">✓</span>':''}</a>`;
   }).join('');
   return group.title?'<section class="directory-group side-directory-group" data-directory-group="'+group.id+'" aria-label="'+trainingEscape(group.title)+'"><h3 class="side-group">'+trainingEscape(group.title)+'</h3><div class="directory-group-items">'+entries+'</div></section>':entries;
  }).join('');
  const summaryHref=readingArticleURL(chapters[0].id);
  return `<details data-directory-module="${module.id}" ${active?'open':''}><summary><a href="${summaryHref}" ${active&&!current?'class="current" aria-current="page"':''}><span>${module.n}</span>${module.name}</a></summary><div class="side-links">${links}</div></details>`;
 }).join('');
 const overview=track==='ai'?`<a class="side-home" data-track-overview href="${readingArticleURL('transformer-model')}#ai-infra-map">AI Infra 全貌</a>`:'';
 return `<aside class="sidebar" aria-label="章节导航">${overview}<a class="side-home" href="/outline/">← 全站大纲</a>
  <div class="side-heading"><span>${label} · 目录</span><span>${topicArticles.filter(a=>a.module!=='practice').length} 章${topicArticles.some(a=>a.module==='practice')?' + 1 实战':''}</span></div>${sections}
  <div class="side-progress"><div><span>本主题阅读进度</span><b>${read} / ${topicArticles.length}</b></div>
   <div class="progress-bar"><span style="width:${read/topicArticles.length*100}%"></span></div><span>仅保存在当前浏览器</span></div></aside>`;
}
function moduleOverview(m,list){return `<div class="module-intro"><b>这一模块的学习出口</b><ul>${m.outcomes.map(t=>'<li>'+t+'</li>').join('')}</ul><span>${list.length}章 · 先理解机制，再用问题和实验检验理解</span></div>`}
function relatedReading(a){
 if(!a.related?.length)return '';
 const linked=chapterConnectionLinks(a).map(([,id])=>id);
 const related=a.related.filter(id=>!linked.includes(id));
 if(!related.length)return '';
 return `<section class="related-reading"><h2>延伸章节</h2>${related.map(id=>`<a href="${articleURL(id)}"><span>${articleById(id).number}</span>${articleById(id).title}<b>↗</b></a>`).join('')}</section>`;
}
function roadmapPage(){
 const stages=courseReadingStages,key=new URLSearchParams(location.search).get('track'),candidate=selectedLearningProfile(),selected=candidate?.track||(trackDefinitions[key]?key:'cloud');
 const enhanced=typeof document.createElement==='function',profile=candidate?.track===selected?candidate:null;
 simplePage(profile?profile.label+'学习路线':'选择你的学习路线','LEARN THE CONNECTIONS','Cloud提供计算、网络和存储，AI把模型计算组织成训练与推理服务，Agent调用模型服务和工具完成任务。Agent可以直接使用已有模型服务，无需先学GPU训练；权限、版本、观测和恢复贯穿三条主线。',
 `<nav class="route-selector" aria-label="学习方向">${Object.keys(trackDefinitions).map(k=>`<a href="/roadmap/?track=${k}#route-${k}" ${k===selected?'aria-current="page"':''}>${trackDefinitions[k].label} ↓</a>`).join('')}</nav>`+
 Object.entries(stages).map(([k,ss])=>`<section class="route-block" id="route-${k}" ${enhanced&&k!==selected?'hidden':''}><div class="route-title"><h2>${trackDefinitions[k].label}</h2></div>${profile?.track===k?learningGoalHTML(profile):learningGoalSelectorHTML(k)}<details class="complete-course" ${!profile||profile.track!==k?'open':''}><summary>完整课程、领域图谱与阶段任务</summary>${trackModelHTML(k)}${ss.map(([title,ids],i)=>`<div class="roadmap-step"><span class="step-num">0${i+1}</span><div><h3>${title}</h3>${stageConnectionHTML(k,i)}${k==='cloud'?cloudStageStudyHTML(i):infraStageStudyHTML(k,i)}${ids.map(id=>`<a id="route-chapter-${k}-${id}" href="${articleURL(id)}">${articleById(id).number} ${articleById(id).title}${progress[id]?' ✓':' ↗'}</a>`).join('')}</div></div>`).join('')}${trackSynthesisHTML(k)}<a class="inline-link" href="/track/${k}/">开始阅读第一章 →</a></details></section>`).join(''));
 let anchor=null;try{const requested=decodeURIComponent(location.hash.slice(1));if(requested==='learning-goal'||(profile&&(requested==='goal-gate'||requested.startsWith('goal-chapter-')))||requested.startsWith('route-'+selected)||requested.startsWith('route-chapter-'+selected+'-'))anchor=requested;}catch{}
 if(anchor)requestAnimationFrame(()=>{const target=document.getElementById(anchor);target?.scrollIntoView();if(anchor==='goal-gate'||anchor.startsWith('goal-chapter-')||anchor.startsWith('route-chapter-'))target?.focus({preventScroll:true});});
}
function labsPage(){renderLabCatalog()}
const problemItems=[['服务已经启动，用户却访问失败','沿DNS、连接、TLS和HTTP定位最后成功阶段。','vpc-network','Cloud'],['机器CPU不高，请求仍然很慢','区分执行时间、连接池与下游等待。','linux-resource','Cloud'],['集群还有GPU，Pod却无法调度','检查资源形状、单节点可行性与放置约束。','scheduling-resources','Cloud'],['readiness失败，为什么进程没重启','分清启动、存活和流量资格。','kubernetes-basics','Cloud'],['回滚镜像后，行为没有恢复','检查配置、数据与外部产物版本。','delivery','Cloud'],['多个实例的p99怎么合并','回到分布与可聚合直方图。','observability','SRE'],['备份成功，却无法恢复服务','验证清单、提交点和实际消费者。','storage-recovery','SRE'],['训练OOM，增加GPU仍没解决','先算状态与激活，再判断复制还是分片。','gpu-memory','AI'],['多机启动等待或通信超时','找最早异常，再区分会合与数据通信。','training-communication','AI'],['GPU经常等待数据','用三组输入对照定位关键路径。','data-pipeline','AI'],['保存了检查点，却不能继续','核对状态、规模、进度和数据顺序。','checkpoint-recovery','AI'],['权重放得下，并发却上不去','按上下文和并发估算KV容量。','model-serving','AI'],['首token延迟报告互相矛盾','统一客户端与服务端计时边界。','inference-performance','AI'],['工具已生效，任务还停在运行中','检查提交间隙与接收方幂等语义。','agent-recovery','Agent'],['工具结果要求提升权限','把外部文本与可信授权分开。','agent-security','Agent'],['Agent说成功，实际产物却不对','用环境断言验收任务结果。','agent-evaluation','Agent']];
function problemsPage(){simplePage('问题索引','START WITH A SYMPTOM','先选择现象，再通过证据判断原因。这里提供排查入口，不预先替你认定根因。',`<div class="problem-list">${problemItems.map(([t,d,id,tag])=>`<a href="${articleURL(id)}"><span class="tag">${tag}</span><div><h2>${t}</h2><p>${d}</p></div><b>↗</b></a>`).join('')}</div>`)}
const readerTrialTasks=[
  {
   id:'cloud',track:'Cloud Infra',chapter:'tcp-event-loop',end:3,reading:'TCP 与 I/O，第 1–3 节',
   focus:'套接字与字节流 → 字节序号 → 消息解帧',
   questions:['连接、字节流和应用消息是什么关系？','长度头应写正文的字符数还是编码后的字节数，为什么？'],
   transfer:'4 字节长度头写明正文长 6 字节，正文是 abcdef。三次读到的块依次为「头前 2 字节」「头后 2 字节 + abc」「def」。在哪次能交付消息？前两次保留什么？'
  },
  {
   id:'ai',track:'AI Infra',chapter:'operator-profiling',end:2,reading:'算子与性能分析，第 1–2 节',
   focus:'输入与输出约定 → 稳定 softmax',
   questions:['减去同一最大值为什么不改变 softmax 的比例？','输出行和为 1，为什么还不能认定计算正确？'],
   transfer:'一行输入是 [3,3,3]，程序输出 [1,0,0]，行和为 1。它通过了吗？预期每项是什么，应该怎样核对？'
  },
  {
   id:'agent',track:'Agent Infra',chapter:'agent-retrieval',end:2,reading:'检索与上下文，第 1–2 节',
   focus:'检索到最终主张 → 片段与来源版本',
   questions:['索引、来源正文与最终上下文是什么关系？','同一文档的旧版与当前版为什么不能直接互换？'],
   transfer:'检索第一名是旧调整 99，真正送入上下文的只有当前调整 27。能交付「本月总额 27」吗？还缺哪份材料，需要核对哪些身份与条件？'
  }
];
function readerTrialEarlyLink(chapter,section){
 if(section!==1)return '';
 const task=readerTrialTasks.find(item=>item.chapter===chapter);
 return task?'<p class="reader-trial-early"><a href="/about/#reader-trial-quick-'+task.id+'">提前结束试读，反馈一个卡点 →</a></p>':'';
}
function readerTrialSectionLink(chapter,section){
 const task=readerTrialTasks.find(item=>item.chapter===chapter&&item.end===section);
 return task?'<p class="reader-trial-return"><a href="/about/#reader-trial-questions-'+task.id+'">这一段的试读题 →</a></p>':'';
}
function readerTrialFeedbackURL(task,quick=false){
 const readingURL='https://captaingreenskin.github.io/infra-guide/article/'+task.chapter+'/#section-1';
 const readingContext=[
  '### 阅读范围','- 方向：'+task.track,'- 指定范围：'+task.reading,'- 阅读入口：'+readingURL,
  '- 内容版本：'+staticReadingVersion
 ];
 const fields=quick?['','### 阅读卡点','- 最后读到哪一节','- 哪个词或哪句没看懂']:[
  '- 对这个主题的基础','- 设备（手机或电脑）',
  '','### 实际进度','- 第 2 分钟找到的位置','- 最后读到哪里和实际用时',
  '','### 卡点与回答','- 卡住的术语或原句','- 两道概念题的回答','- 迁移题的判断和依据'
 ];
 const title=(quick?'试读卡点 · ':'15 分钟试读反馈 · ')+task.track;
 return 'https://github.com/CaptainGreenskin/infra-guide/issues/new?title='+encodeURIComponent(title)+'&amp;body='+encodeURIComponent([...readingContext,...fields].join('\n'));
}
function readerTrialHTML(){
 return `<section class="quality-section" id="reader-trial" aria-labelledby="reader-trial-title">
 <h2 id="reader-trial-title">15 分钟试读</h2>
 <p>选一个你不熟悉的方向，只读指定小节。手机或电脑都可以，无需安装软件。</p>
 <ol><li><b>第 2 分钟</b> 记下找到的位置和卡住的术语或原句。</li><li><b>第 10 分钟</b> 合上正文，用自己的话回答两道概念题。</li><li><b>第 15 分钟</b> 做一道迁移题，写出判断依据。时间到了就记下读到的位置。</li></ol>
 <p>第 1 节可以提前结束，只反馈停在哪一节、哪个词或哪句没看懂。最后一个指定小节有返回试读题的链接。愿意反馈时，可打开 GitHub 草稿，选好愿意公开的内容后再提交。提交需要登录 GitHub，且会公开显示你的账号名和内容。请省略姓名、单位与联系方式。</p>
 ${readerTrialTasks.map(task=>`<section id="reader-trial-${task.id}"><h3>${task.track}</h3><p><a href="${articleURL(task.chapter)}#section-1">阅读${task.reading} →</a><br>${task.focus}</p><p class="reader-trial-quick" id="reader-trial-quick-${task.id}" tabindex="-1"><a href="${readerTrialFeedbackURL(task,true)}" target="_blank" rel="noopener noreferrer">只反馈一个卡点 ↗</a></p><details class="article-case"><summary>展开 ${task.track} 读后题</summary><div class="reader-trial-questions" id="reader-trial-questions-${task.id}" tabindex="-1"><ol>${task.questions.map(question=>`<li>${question}</li>`).join('')}</ol><p><b>迁移题</b> ${task.transfer}</p><p><a href="${readerTrialFeedbackURL(task)}" target="_blank" rel="noopener noreferrer">打开这一方向的 GitHub 反馈草稿 ↗</a></p></div></details></section>`).join('')}
 </section>`;
}

function editorialPage(){
 const evidence=`<p>隔离 Linux 环境已运行容器、消息代理、MySQL 恢复、Terraform 本地提供程序和 Argo CD 调谐实验。在 kind 本地集群中，还验证了<a href="${articleURL('k8s-networking')}#kubernetes-network-policy-run">Cilium 网络策略</a>、<a href="${articleURL('k8s-storage')}#native-csi-storage">CSI 动态卷</a>，以及<a href="${articleURL('kubernetes-training')}#native-kubernetes-gloo-job">同一宿主的两个节点上的 CPU/Gloo 训练作业</a>。</p>
 <p>Apple M4 Pro 已实跑<a href="${articleURL('operator-profiling')}#native-metal-softmax">Metal Softmax 算子</a>、<a href="${articleURL('model-serving')}#native-metal-inference">llama.cpp 推理</a>和<a href="${articleURL('checkpoint-recovery')}#native-mps-checkpoint-resume">PyTorch MPS 单卡续训</a>。配套项目 One GPU LM 记录了<a href="${articleURL('model-serving')}#rtx-pro-6000-cache-case">RTX PRO 6000 单卡上的推理缓存与重算对照</a>。</p>
 <p>本站的 <a href="${articleURL('operator-profiling')}#cuda-core-run">CUDA 内核实验</a>已在固定的 Linux 工具链上完成编译，NVIDIA 设备执行与 Nsight 性能分析待验证。<a href="${articleURL('multinode-lab')}#native-ddp-target-preflight">物理两机的 NCCL 训练</a>、目标托管云的网络与存储插件（CNI/CSI）、生产负载和<a href="${articleURL('kairo-practice')}#kairo-read-evidence">Kairo 实际接入</a>仍待对应环境验证。<a href="#/labs">查看逐项验证记录 →</a></p>`;
 simplePage('内容与证据标准','EXPLAIN THE SYSTEM · SHOW THE EVIDENCE','高信息量来自清晰的因果链：知道为什么，理解怎样工作，能够计算或验证，再讨论选择。',`<section class="quality-section"><h2>同一网站，三条独立主线</h2><div class="track-grid">${Object.keys(trackDefinitions).map(trackCard).join('')}</div><p>Cloud建立系统底座；AI展开训练与推理；Agent研究工具执行、状态与任务验收，并连接Kairo实践。可靠性、权限、版本和成本贯穿三条路线，综合实战连接跨层依赖。</p></section><section class="quality-section"><h2>一章内容怎样展开</h2><p>默认读者第一次接触这个领域。入口和每章都先介绍基本对象，接着解释对象之间的关系，再讲机制、推导和边界，最后进入案例与代码。专业词在进入推理前给出含义；图、表、代码围绕同一组对象与数字展开，最后改变条件检验理解。</p>${trainingTable(['阅读顺序','必须回答的问题','读者得到什么'],[['对象与关系','概念是什么，彼此怎样连接，为什么需要它','学习起点与全局地图'],['机制与因果','输入如何经过状态变化成为输出','可以解释的执行路径'],['走通一个例子','具体数字、事件或代码怎样对应机制','可复查的推导'],['选择与失败','什么时候成立，什么条件下失效','工程判断与反例'],['练习与验证','换一个条件，你能否独立解释','迁移能力与证据']])}<p>本站文章、图和实验代码独立编写。领域知识、详细章节与实验相互连接，学习后可以改变条件，重新解释结果。</p></section><section class="quality-section" id="validation-scope"><h2>当前交付与验证边界</h2><p>共${articles.length}章：Cloud ${courseChapterCount('cloud')}章、AI ${courseChapterCount('ai')}章、Agent ${courseChapterCount('agent')}章、综合实战${courseChapterCount('shared')}章。全部提供前置知识、学习出口、机制正文、迁移练习和来源。章节齐备与真实环境已验证是两种不同状态。</p>${evidence}</section><section class="quality-section"><h2>内容维护的质量门槛</h2>${trainingTable(['门槛','检查方式'],[['准确性','优先官方资料，注明产品语义、版本与假设'],['可理解性','先定义对象与关系，再有连续推导、例子和反例'],['可复现性','完整代码、命令、依赖、预期结果与源码摘要一致'],['可审查性','保留失败边界，不用CPU结果推断GPU或集群结果'],['可维护性','修改实验后重跑相关验证；版本变化复查对应事实']])}<p>审读和试读时，记录读者卡住的概念和推导。优先补上缺失的解释、手算和反例，并复查过时的事实与实验范围。</p></section>${readerTrialHTML()}<section class="quality-section"><h2>阅读与隐私</h2><p>学习路线按依赖组织；目录按系统领域组织；实验室提供代码和证据；问题索引连接现象与机制。搜索覆盖正文，阅读勾选与主题仅保存在当前浏览器。</p></section>`)}

function chapterPracticeHTML(a){
 const exercise=a.exercise?'<section class="article-section applied-exercise" id="transfer-practice" tabindex="-1"><h2><span class="section-index">?</span>迁移练习</h2><p>'+a.exercise[0]+'</p><details class="full-code"><summary>展开参考答案与推理</summary><p>'+a.exercise[1]+'</p></details></section>':'';
 return `<details class="chapter-practice" id="chapter-practice"><summary>练习与反馈</summary>${optionalConceptReviews.has(a.id)?chapterConceptIntro(a):''}${guidedReview(a)}${exercise}<section class="article-section" id="self-check" tabindex="-1"><h2>自我检验</h2><div class="checklist">${a.check.map((c,i)=>`<label><input type="checkbox" data-check="${a.id}:${i}" ${checks[`${a.id}:${i}`]?'checked':''}>${c}</label>`).join('')}<small>勾选表示自我评估，记录仅保存在当前浏览器。</small></div></section>${readerActionsHTML(a)}</details>`;
}
function chapterReferencesHTML(a){
 const refs=a.refs.filter((r,i,all)=>all.findIndex(other=>sources[other][1]===sources[r][1])===i).map(r=>`<a href="${sources[r][1]}" target="_blank" rel="noopener noreferrer">${sources[r][0]} ↗</a>`).join('');
 const content='<section class="article-section references" id="references" tabindex="-1"><h2><span class="section-index">↗</span>参考资料</h2>'+refs+'</section>'+resourceRecommendations(a.module,a.id)+relatedReading(a);
 return '<details class="chapter-further"><summary>参考资料与延伸阅读</summary>'+content+'</details>';
}
