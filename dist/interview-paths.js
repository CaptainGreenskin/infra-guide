const interviewUnits = {
 plan: ['复习顺序与学习重点', '先学共用基础，再选一个岗位方向。每一步都有一个可以交出来的结果。'],
 companies: ['腾讯、阿里、字节岗位对照', '从具体岗位职责选重点，用本站原创题核对自己能做到哪一步。'],
 coding: ['现场编码 · 数据结构与作业依赖', '先检查最大栈的不变量，再处理依赖、孤立作业和环，用可运行自测核对边界。'],
 database: ['数据库诊断 · 一次作业列表查询', '比较三种索引下的查询计划，再用两个真实连接验证读事务能看到哪个版本。'],
 design: ['系统设计 · 一个可恢复的训练平台', '把到达率、整组容量、幂等提交和故障恢复写成一份可核对的设计。']
};
const unitURL = id => '/interview/'+id+'/';
const unitLink = (id, text) => '<a href="'+unitURL(id)+'">'+text+' →</a>';
const readLink = (id, text) => '<a href="'+articleURL(id)+'">'+text+' →</a>';

function priorityMap() {
 return `<section class="priority-map" aria-label="知识体系与学习优先级">
 <div class="priority-intro"><div><small>学习重点 / START HERE</small><h2>先打底，再选方向</h2></div>${unitLink('plan','查看复习顺序')}</div>
 <ol><li><b>01 · 共同必修</b><strong>请求、资源与数据</strong><span>画一次请求，区分计算、等待与读写。</span></li>
 <li><b>02 · 岗位重点</b><strong>三条主线选一条</strong><span>云看编排与可靠性，AI 看训练与推理，Agent 看执行与权限。</span></li>
 <li><b>03 · 进阶验收</b><strong>从解释到交付</strong><span>写出实现，复算容量，注入一次故障。</span></li></ol>
 <p class="path-links"><a href="/interview/companies/">对照腾讯、阿里、字节的岗位重点 →</a><a href="/interview/experiences/">公开面试题：看实际问了什么 →</a></p></section>`;
}

function interviewEntry() {
 return `<section class="interview-entry"><div><small>面试准备 / 先决定怎么学</small><h2>复习从哪一步开始？</h2><p>基础还不牢，先走六次学习。已经有项目经验，先限时诊断，再补失分项。</p></div>
 <div class="path-links"><a class="btn" href="/interview/plan/">打开复习路线 →</a><a href="/interview/companies/">腾讯 · 阿里 · 字节岗位重点 →</a></div>
 <div class="unit-links">${unitLink('experiences','公开面试题与重点')}${unitLink('coding','01 现场编码')}${unitLink('database','02 数据库诊断')}${unitLink('design','03 系统设计')}</div></section>`;
}

function studyOrder() {
 const sessions = [
  ['01','画出一条请求','先弄清工作经过哪些组件。这样看 CPU、延迟或错误码时，知道信号来自哪里。',readLink('cloud-overview','一次查询')+readLink('linux-resource','执行与等待'),'合上正文画出客户端到数据源的路径，用一句话解释主机空闲时请求仍可能很慢。'],
  ['02','用证据缩小范围','有了请求路径，再读客户端时间戳，比较连接、首字节和传输结束。',readLink('network-diagnosis','网络排查')+unitLink('database','数据库计划'),'分别指出等待落在哪个网络区间，以及 SQL 的哪份计划还要排序。写下下一次探测。'],
  ['03','动手写一份实现','把作业依赖写成输入、输出和错误契约，自己处理空图、重复边和环。',unitLink('coding','依赖排序'),'通过本地判题，并解释为什么有多个正确顺序、算法复杂度怎样计算。'],
  ['04','选一个岗位专项','从下面三条主线选一条。先完成该方向的必修练习，再按职位决定是否深入真实集群或沙箱。',unitLink('companies','三家公司岗位样本'),'交一张状态图或一次复算，再换一个条件讲出失败边界。'],
  ['05','把局部机制组合成设计','带着资源、数据与失败边界画控制面和执行面。先算容量，再讨论调度策略。',unitLink('design','训练平台设计')+readLink('production-readiness','综合设计评审'),'写明到达率、瓶颈、重试身份和恢复点，用评分表核对；至少留下两种故障的验收证据。'],
  ['06','闭卷复述，补最弱的一步','隔天重做失分题。用你自己的项目描述一次取舍、结果与不足。',readLink('incident','故障复盘')+'<a href="/interview/">回到十二道口述题 →</a>','两分钟内交代个人决策、证据、替代方案。被追问时给出一个能推翻原判断的条件。']
 ];
 const roles = [
  ['Cloud / SRE', readLink('linux-resource','① 资源')+readLink('network-diagnosis','② 请求')+readLink('container-runtime','③ 容器')+readLink('k8s-workloads','④ 编排')+readLink('k8s-networking','⑤ 网络')+readLink('k8s-storage','⑥ 持久化')+readLink('slo','⑦ SLO'),'重点是解释哪个信号能排除哪个原因。能定位后再深入跨可用区容灾。'],
  ['AI Infra',readLink('transformer-model','① 模型与GPU基础')+readLink('gpu-cluster','② 一步训练')+readLink('distributed-training','③ DDP')+readLink('gpu-memory','④ 显存')+readLink('model-serving','⑤ 推理'),'先手算一次更新与状态预算，再按职位选训练通信或推理时延。'],
  ['Agent Infra',readLink('agent-runtime','① 执行')+readLink('agent-recovery','② 恢复')+readLink('agent-security','③ 权限')+readLink('agent-evaluation','④ 评估'),'先说清谁授权、谁产生效果、谁持有回执，再进入 Kairo 的目标环境验收。']
 ];
 return `<section class="plan-content"><nav class="plan-jumps" aria-label="选择学习节奏"><a href="/interview/plan/#first-pass">初次学习 · 从第 1 步开始 ↓</a><a href="/interview/plan/#quick-review">面试在即 · 跳到三轮复习 ↓</a></nav><h2 id="first-pass">初学路径 · 六次学习</h2><p>建议每次留 30–45 分钟，动手题可以单独占一次。遇到已经掌握的内容，先做过关题，通过就跳过阅读。</p>
 <ol class="session-list">${sessions.map(([n,title,why,links,gate])=>`<li><small>${n}</small><div><h3>${title}</h3><p>${why}</p><div class="path-links">${links}</div><p class="pass-gate"><b>过关</b> ${gate}</p></div></li>`).join('')}</ol>
 <h2>第 4 步 · 只选一个方向</h2><div class="role-sequence">${roles.map(([name,links,gate])=>`<section><h3>${name}</h3><div class="path-links">${links}</div><p>${gate}</p></section>`).join('')}</div>
 <h2 id="quick-review">有基础的读者 · 三轮考前复习</h2>
 <ol class="review-rounds"><li><b>第一轮，找薄弱项。</b> 用 30 分钟做${unitLink('coding','编码题')}或${unitLink('database','数据库题')}，先写自己的结果，再打开参考答案。</li>
 <li><b>第二轮，集中补岗位重点。</b> 在${unitLink('companies','岗位对照')}选与目标职位相近的一行。用 45 分钟复做该方向第一道未通过的题，写出反例。</li>
 <li><b>第三轮，做完整表达。</b> 独立完成${unitLink('design','设计题')}，再讲一次个人项目。按证据给自己评分，次日重做失分项。</li></ol></section>`;
}

function workshopPage(id) {
 const renderers = {plan:studyOrder, companies:companyStudyGuide, coding:codingInterviewWorkshop,
                    database:databaseInterviewWorkshop, design:designInterviewWorkshop, experiences:interviewExperienceGuide};
 const [title, description] = interviewUnits[id];
 simplePage(title, 'INTERVIEW PRACTICE · 面试工作台', description,
  '<nav class="workshop-nav" aria-label="面试工作台"><a href="/interview/">面试总览</a>'+
  Object.entries({plan:'顺序',companies:'岗位',experiences:'面经',coding:'编码',database:'数据库',design:'设计'}).map(([key,label])=>
    '<a href="'+unitURL(key)+'"'+(key===id?' aria-current="page"':'')+'>'+label+'</a>').join('')+
  '</nav>'+renderers[id]()+
  '<p class="path-links workshop-return"><a href="/interview/plan/">查看学习顺序 →</a><a href="/interview/">返回面试总览 →</a></p>');
}

const foundationChapters = new Set(['cloud-overview','linux-resource','distributed-systems','vpc-network','network-diagnosis','transformer-model','tokenization-embedding','attention-mechanics','autograd-training']);
const focusChapters = new Set(['virtual-memory-oom','concurrency-pools','database-index-locks','cache-consistency','position-encoding','transformer-block','gpu-execution','roofline-model','flash-attention-io','tensor-parallel-math','durable-workflows','agent-retrieval','agent-observability','agent-sandbox','kubernetes-basics','delivery','slo','observability','incident','gpu-cluster','distributed-training','gpu-memory','training-communication','checkpoint-recovery','model-serving','inference-performance','gpu-scheduling','agent-runtime','agent-recovery','agent-security','agent-evaluation']);
function chapterPriority(id) {
 const level = foundationChapters.has(id) ? '基础必修' : focusChapters.has(id) ? '岗位重点' : '按需深入';
 return '<small class="chapter-priority">'+level+'</small> ';
}
