const cloudModules=trackDefinitions.cloud.modules;
const aiModules=trackDefinitions.ai.modules;
const articleById=id=>articles.find(a=>a.id===id);
const trackForModule=id=>moduleFor(id)?.track;
function chapterLink(a){return `<a class="chapter-row" href="${articleURL(a.id)}"><div class="chapter-top"><span>CHAPTER ${a.number}</span><span>${a.level} · ${progress[a.id]?'已读 ✓':'开始阅读 ↗'}</span></div><h2>${a.title}</h2><p>${a.desc}</p></a>`}
function learningContract(a){const content=`<div class="learning-contract"><strong>读完这一章，你应该能</strong><ul>${a.objectives.map(t=>'<li>'+t+'</li>').join('')}</ul>${prerequisiteConnectionsHTML(a)}<p class="evidence-note">约 ${a.minutes} 分钟 · ${a.baseline||'训练代码基线 PyTorch 2.5.1'} · <a href="#/labs">实验验证范围 ↗</a></p></div>`;return '<details class="guided-contract"><summary>先修、学习目标与验证范围 · 约'+a.minutes+'分钟</summary>'+content+'</details>'}
function mobileContents(a){return `<details class="mobile-contents"><summary>章节导航与本文目录</summary><a href="#/module/${a.module}">← 返回本模块目录</a>${conceptTOCLink(articleURL(a.id))}${a.sections.map((s,i)=>`<a href="${articleURL(a.id)}#section-${i+1}">${i+1}. ${s[0]}</a>`).join('')}</details>`}
function courseIntro(){return `<div class="course-intro"><span class="small-badge">训练专题 / ${articles.filter(a=>a.module==='training').length} 章</span><h2>先理解一步训练，再走向多机多卡。</h2><p>从资源预算、数据与通信，到完整DDP程序、两机四卡手册和恢复对照。同一份实验贯穿执行机制与故障验证。</p><div class="course-links"><a class="btn" href="#/article/gpu-cluster">从全景开始 →</a><a class="btn secondary" href="#/labs">实验与验证记录 ↗</a></div><small>CPU/Gloo已有实测；真实GPU/NCCL与Kubernetes仍需目标环境验证。</small></div>`}
function sectionGroup(list){return trainingGroups.map((g,i)=>`<section class="course-group"><div class="group-label">${g}</div>${list.filter(a=>a.group===i).map(chapterLink).join('')}</section>`).join('')}
function simplePage(title,kicker,desc,body){document.title=title+' · InfraGuide';$('#app').innerHTML=`<main id="main" class="container collection" tabindex="-1"><div class="breadcrumb"><a href="#/">知识库</a><span>／ ${title}</span></div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p class="description">${desc}</p>${body}</main>${footer()}`}
function trackCard(key){const t=trackDefinitions[key],n=articles.filter(a=>t.modules.includes(a.module)).length;return `<a class="track-card ${key}" href="#/track/${key}"><span class="track-index">${{cloud:'01',ai:'02',agent:'03'}[key]} / ${n} 章</span><h2>${t.label}<span>↗</span></h2><h3>${t.subtitle}</h3><p>${t.story}</p><div class="track-steps">${{cloud:'请求 → 资源 → 交付 → 恢复',ai:'数据 → 训练 → 评估 → 推理',agent:'目标 → 工具 → 状态 → 验收'}[key]}</div></a>`}
function homePage(){
 document.title='InfraGuide · Cloud / AI / Agent';
 $('#app').innerHTML=`<main id="main" class="container home-reading" tabindex="-1">
 <section class="infra-hero"><div class="eyebrow"><span class="dot"></span> 给中国初学者与面试准备者的基础设施指南</div>
 <div class="hero-grid"><div><h1>先看懂全貌，<br>再把系统讲清楚。</h1><p>Cloud 管应用运行，AI Infra 管模型训练与推理，Agent Infra 管任务和工具执行。先认识对象与关系，再沿一条主线读机制、算例和代码。</p>
 <div class="buttons"><a class="btn" href="/outline/">先看知识地图 →</a><a class="btn secondary" href="/interview/">按重点准备面试 →</a></div>
 <p class="home-route-link"><a href="/roadmap/">已有基础？按学习路线继续 →</a></p></div>
 <aside class="home-reading-order" aria-label="一章的阅读顺序"><h2>一章，顺着四步读</h2><ol><li><b>认识对象</b><span>这个概念是什么？</span></li><li><b>弄清关系</b><span>它与前面的知识怎样连接？</span></li><li><b>跟算例子</b><span>每一步为什么得到这个结果？</span></li><li><b>运行验证</b><span>换一个条件，结论还成立吗？</span></li></ol></aside></div></section>
 <section class="track-grid" aria-label="三条学习路线">${Object.keys(trackDefinitions).map(trackCard).join('')}</section>
 <div class="shared-line"><b>共同的工程底座</b><span>计算与数据路径 · 身份与权限 · 可观测性 · 版本与恢复</span><a href="/article/cloud-overview/">建立系统地图 →</a></div>
 <section class="section" id="sample-readings"><div class="section-heading"><div><h2>先读一章，亲手验证一个结果</h2><p>选一个方向尝试。建议时间只覆盖阅读与首轮练习，环境准备另计。</p></div></div>
 <div class="start-paths">${[
 ['Cloud Infra','约10分钟','服务成功率到底怎么算？','slo','把不同流量的实例合起来，算清全局成功率和错误预算。','设总事件1000、好事件990、目标99%。解释预算为什么刚好用完。','无需额外环境'],
 ['AI Infra','约20分钟','KV Cache 为什么能减少重复计算？','model-serving','沿三个 token 的生成过程，区分输入位置、输出和缓存。','运行 attention_lab.py，核对 cache_max_abs_error，再解释移除因果 mask 的变化。','Python 3.9+，无需 GPU'],
 ['Agent Infra','约20分钟','工具成功了，任务为什么还没完成？','agent-recovery','复现工具提交后进程退出，观察恢复时的尝试数与实际效果。','运行 agent_lab.py，核对 attempts=2、tool_effects=1，解释由谁完成去重。','Python 3.9+，无需模型服务']
 ].map(([track,time,title,id,result,task,env],i)=>`<section class="start-card"><div class="start-meta"><span>0${i+1} / ${track}</span><b>${time}</b></div><h3>${title}</h3><p>${result}</p><div class="start-outcome"><strong>动手核对</strong><p>${task}</p></div><a class="inline-link" href="${articleURL(id)}">阅读样章并完成练习 →</a><small>${env}</small></section>`).join('')}</div></section>
 <nav class="home-tools" aria-label="继续学习"><a href="/outline/">完整大纲 · ${articles.length} 章 →</a><a href="/labs/">代码与实验 →</a><a href="/problems/">按问题查机制 →</a><a href="/resources/">资料与视频 →</a></nav>
 </main>${footer()}`;
}

function trackPage(kind){if(kind==='cloud')cloudKnowledgePage(moduleFor('compute'));else infraKnowledgePage(moduleFor(kind==='ai'?'model-foundations':'agent'));}

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
  const links = chapters.map((article, index) => {
   const startsGroup = article.group !== undefined && (!index || chapters[index-1].group !== article.group);
   const group = startsGroup ? '<div class="side-group">'+trainingGroups[article.group]+'</div>' : '';
   const selected = article.id === current ? 'class="current" aria-current="page"' : '';
   return `${group}<a href="${articleURL(article.id)}" ${selected}>${article.number} ${article.title}${progress[article.id]?'<span class="read-mark">✓</span>':''}</a>`;
  }).join('');
  const summaryHref=module.id==='practice'?articleURL(chapters[0].id):'/module/'+module.id+'/';
  return `<details ${active?'open':''}><summary><a href="${summaryHref}" ${active&&!current?'class="current" aria-current="page"':''}><span>${module.n}</span>${module.name}</a></summary><div class="side-links">${links}</div></details>`;
 }).join('');
 return `<aside class="sidebar" aria-label="章节导航"><a class="side-home" href="/outline/">← 全站大纲</a>
  <div class="side-heading"><span>${label} · 目录</span><span>${topicArticles.filter(a=>a.module!=='practice').length} 章${topicArticles.some(a=>a.module==='practice')?' + 1 实战':''}</span></div>${sections}
  <div class="side-progress"><div><span>本主题阅读进度</span><b>${read} / ${topicArticles.length}</b></div>
   <div class="progress-bar"><span style="width:${read/topicArticles.length*100}%"></span></div><span>仅保存在当前浏览器</span></div></aside>`;
}
function moduleOverview(m,list){return `<div class="module-intro"><b>这一模块的学习出口</b><ul>${m.outcomes.map(t=>'<li>'+t+'</li>').join('')}</ul><span>${list.length}章 · 先理解机制，再用问题和实验检验理解</span></div>`}
function relatedReading(a){if(!a.related?.length)return '';return `<section class="related-reading"><h2>把这一章连回系统</h2>${a.related.map(id=>`<a href="${articleURL(id)}"><span>${articleById(id).number}</span>${articleById(id).title}<b>↗</b></a>`).join('')}</section>`}
function roadmapPage(){
 const stages=courseReadingStages,key=new URLSearchParams(location.search).get('track'),selected=trackDefinitions[key]?key:'cloud';
 const enhanced=typeof document.createElement==='function';
 simplePage('选择你的学习路线','LEARN THE CONNECTIONS','Cloud提供计算、网络和存储，AI把模型计算组织成训练与推理服务，Agent调用模型服务和工具完成任务。Agent可以直接使用已有模型服务，无需先学GPU训练；权限、版本、观测和恢复贯穿三条主线。',
 `<nav class="route-selector" aria-label="学习方向">${Object.keys(trackDefinitions).map(k=>`<a href="/roadmap/?track=${k}#route-${k}" ${k===selected?'aria-current="page"':''}>${trackDefinitions[k].label} ↓</a>`).join('')}</nav>`+
 Object.entries(stages).map(([k,ss])=>`<section class="route-block" id="route-${k}" ${enhanced&&k!==selected?'hidden':''}><div class="route-title"><h2>${trackDefinitions[k].label}</h2></div>${trackModelHTML(k)}${ss.map(([title,ids],i)=>`<div class="roadmap-step"><span class="step-num">0${i+1}</span><div><h3>${title}</h3>${stageConnectionHTML(k,i)}${k==='cloud'?cloudStageStudyHTML(i):infraStageStudyHTML(k,i)}${ids.map(id=>`<a id="route-chapter-${k}-${id}" href="${articleURL(id)}">${articleById(id).number} ${articleById(id).title}${progress[id]?' ✓':' ↗'}</a>`).join('')}</div></div>`).join('')}${trackSynthesisHTML(k)}<a class="inline-link" href="/track/${k}/">继续读这条主线的系统知识 →</a></section>`).join(''));
 let anchor=null;try{const requested=decodeURIComponent(location.hash.slice(1));if(requested.startsWith('route-'+selected)||requested.startsWith('route-chapter-'+selected+'-'))anchor=requested;}catch{}
 if(anchor)requestAnimationFrame(()=>{const target=document.getElementById(anchor);target?.scrollIntoView();if(anchor.startsWith('route-chapter-'))target?.focus({preventScroll:true});});
}
function labsPage(){renderLabCatalog()}
const problemItems=[['服务已经启动，用户却访问失败','沿DNS、连接、TLS和HTTP定位最后成功阶段。','vpc-network','Cloud'],['机器CPU不高，请求仍然很慢','区分执行时间、连接池与下游等待。','linux-resource','Cloud'],['集群还有GPU，Pod却无法调度','检查资源形状、单节点可行性与放置约束。','scheduling-resources','Cloud'],['readiness失败，为什么进程没重启','分清启动、存活和流量资格。','kubernetes-basics','Cloud'],['回滚镜像后，行为没有恢复','检查配置、数据与外部产物版本。','delivery','Cloud'],['多个实例的p99怎么合并','回到分布与可聚合直方图。','observability','SRE'],['备份成功，却无法恢复服务','验证清单、提交点和实际消费者。','storage-recovery','SRE'],['训练OOM，增加GPU仍没解决','先算状态与激活，再判断复制还是分片。','gpu-memory','AI'],['多机启动等待或通信超时','找最早异常，再区分会合与数据通信。','training-communication','AI'],['GPU经常等待数据','用三组输入对照定位关键路径。','data-pipeline','AI'],['保存了检查点，却不能继续','核对状态、规模、进度和数据顺序。','checkpoint-recovery','AI'],['权重放得下，并发却上不去','按上下文和并发估算KV容量。','model-serving','AI'],['首token延迟报告互相矛盾','统一客户端与服务端计时边界。','inference-performance','AI'],['工具已生效，任务还停在运行中','检查提交间隙与接收方幂等语义。','agent-recovery','Agent'],['工具结果要求提升权限','把外部文本与可信授权分开。','agent-security','Agent'],['Agent说成功，实际产物却不对','用环境断言验收任务结果。','agent-evaluation','Agent']];
function problemsPage(){simplePage('问题索引','START WITH A SYMPTOM','先选择现象，再通过证据判断原因。这里提供排查入口，不预先替你认定根因。',`<div class="problem-list">${problemItems.map(([t,d,id,tag])=>`<a href="${articleURL(id)}"><span class="tag">${tag}</span><div><h2>${t}</h2><p>${d}</p></div><b>↗</b></a>`).join('')}</div>`)}
function editorialPage(){simplePage('内容与证据标准','EXPLAIN THE SYSTEM · SHOW THE EVIDENCE','高信息量来自清晰的因果链：知道为什么，理解怎样工作，能够计算或验证，再讨论选择。',`<section class="quality-section"><h2>同一网站，三条独立主线</h2><div class="track-grid">${Object.keys(trackDefinitions).map(trackCard).join('')}</div><p>Cloud建立系统底座；AI展开训练与推理；Agent研究工具执行、状态与任务验收，并连接Kairo实践。可靠性、权限、版本和成本贯穿三条路线，综合实战连接跨层依赖。</p></section><section class="quality-section"><h2>一章内容怎样展开</h2><p>默认读者第一次接触这个领域。入口和每章都先介绍基本对象，接着解释对象之间的关系，再讲机制、推导和边界，最后进入案例与代码。专业词在进入推理前给出含义；图、表、代码围绕同一组对象与数字展开，最后改变条件检验理解。</p>${trainingTable(['阅读顺序','必须回答的问题','读者得到什么'],[['对象与关系','概念是什么，彼此怎样连接，为什么需要它','学习起点与全局地图'],['机制与因果','输入如何经过状态变化成为输出','可以解释的执行路径'],['走通一个例子','具体数字、事件或代码怎样对应机制','可复查的推导'],['选择与失败','什么时候成立，什么条件下失效','工程判断与反例'],['练习与验证','换一个条件，你能否独立解释','迁移能力与证据']])}<p>本站文章、图和实验代码独立编写。领域知识、详细章节与实验相互连接，学习后可以改变条件，重新解释结果。</p></section><section class="quality-section"><h2>当前交付与验证边界</h2><p>共${articles.length}章：Cloud ${courseChapterCount('cloud')}章、AI ${courseChapterCount('ai')}章、Agent ${courseChapterCount('agent')}章、综合实战${courseChapterCount('shared')}章。全部提供前置知识、学习出口、机制正文、迁移练习和来源。章节齐备与真实环境已验证是两种不同状态。</p><p>Linux容器、消息代理、MySQL恢复、Terraform本地提供程序、kind调度与Argo CD调谐，以及CPU/Gloo实验均附范围、结果与源码摘要。真实GPU、物理多节点、云CNI/CSI、生产负载和Kairo仍需对应环境验收。<a href="#/labs">查看逐项验证记录 →</a></p></section><section class="quality-section"><h2>内容维护的质量门槛</h2>${trainingTable(['门槛','检查方式'],[['准确性','优先官方资料，注明产品语义、版本与假设'],['可理解性','先定义对象与关系，再有连续推导、例子和反例'],['可复现性','完整代码、命令、依赖、预期结果与源码摘要一致'],['可审查性','保留失败边界，不用CPU结果推断GPU或集群结果'],['可维护性','修改实验后重跑相关验证；版本变化复查对应事实']])}<p>当前优先按读者理解卡点，逐章深化连续解释、手算例子与反例；有合适环境时，再补真实GPU、Kubernetes和Kairo验收。新章节按问题价值增加，已有章节按错误、过时信息和验证缺口持续修订。</p></section><section class="quality-section"><h2>阅读与隐私</h2><p>学习路线按依赖组织；目录按系统领域组织；实验室提供代码和证据；问题索引连接现象与机制。搜索覆盖正文，阅读勾选与主题仅保存在当前浏览器。</p></section>`)}

function chapterPracticeHTML(a){
 const exercise=a.exercise?'<section class="article-section applied-exercise"><h2><span class="section-index">?</span>迁移练习</h2><p>'+a.exercise[0]+'</p><details class="full-code"><summary>展开参考答案与推理</summary><p>'+a.exercise[1]+'</p></details></section>':'';
 return `<details class="chapter-practice" id="chapter-practice"><summary>练习、自检与阅读反馈</summary>${exercise}<section class="article-section" id="self-check"><h2>自我检验</h2><div class="checklist">${a.check.map((c,i)=>`<label><input type="checkbox" data-check="${a.id}:${i}" ${checks[`${a.id}:${i}`]?'checked':''}>${c}</label>`).join('')}<small>勾选表示自我评估，记录仅保存在当前浏览器。</small></div></section>${readerActionsHTML(a)}</details>`;
}
function chapterFurtherReadingHTML(a){
 const content=resourceRecommendations(a.module,a.id)+relatedReading(a);
 return content?'<details class="chapter-further"><summary>延伸资料与相关章节</summary>'+content+'</details>':'';
}
