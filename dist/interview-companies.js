// Each group names a public role sample, one study activity and its boundary.
const employerSources = {
  txSre: ['腾讯 IaaS 计算产品 SRE · 社招','https://careers.tencent.com/jobdesc.html?postId=2113177003082559488'],
  txInference: ['腾讯 大模型推理框架研发 · 社招','https://careers.tencent.com/jobdesc.html?postId=2108854783036272640'],
  txSandbox: ['腾讯 AI Infra SRE（Agent 沙箱）· 社招','https://careers.tencent.com/jobdesc.html?postId=2113089274038628352'],
  aliSre: ['阿里集团 AI SRE · 2027 届校招','https://campus-talent.alibaba.com/campus/position/199907820042'],
  aliInfra: ['阿里集团 AI Infra 工程师 · 2027 届校招','https://campus-talent.alibaba.com/campus/position/199907640056'],
  aliAgent: ['阿里集团 Agent Infra 工程师 · 2027 届校招','https://campus-talent.alibaba.com/campus/position/199907640058'],
  byteSite: ['字节 火山引擎站点架构专家 · 社招','https://jobs.bytedance.com/experienced/position/7641877352831830277/detail'],
  byteAI: ['字节 AI 训推优化 · 实习','https://jobs.bytedance.com/campus/position/7613277572923869445/detail']
};
function roleSource(key) {
 const [label,url] = employerSources[key];
 return '<a href="'+url+'" target="_blank" rel="noopener">'+label+' ↗</a>';
}

function companyStudyGuide() {
 const groups = [
  ['语言、编码与边界','txSre',true,unitLink('coding','写出作业依赖排序'),'通过本地判题，并能解释非唯一解和图的复杂度。'],
  ['Linux 资源与等待','txSre',true,readLink('linux-resource','读 CPU 时间预算'),'算出两个线程何时耗尽配额，指出还要采哪些证据。'],
  ['网络路径与诊断','byteSite',true,readLink('network-diagnosis','定位额外的等待'),'从累计时刻算出慢在哪段，选一项能区分入口和应用的探测。'],
  ['数据库访问与可见性','txSre',true,unitLink('database','比较三份查询计划'),'返回行一致，能解释临时排序与旧快照。目标数据库另行实测。'],
  ['可观测与事故处置','txSre',true,readLink('incident','写出故障时间线'),'写出用户影响、可证伪的假设、回滚条件和恢复证据。'],
  ['跨可用区容灾','byteSite',false,'<a href="'+articleURL('resilience')+'#subsection-5-1dwp2yh">按应用读回核对恢复点 →</a> · <a href="'+articleURL('resilience')+'#native-haproxy-report-failover">复跑原入口切换 →</a> · <a href="'+articleURL('resilience')+'#native-kind-r3-node-loss">核对节点与卷恢复 →</a>','本机 HAProxy 对照与单机 kind 实验均从原入口读报告和附件。目标环境再测跨区切换时的请求结果、可接受的数据损失和恢复用时。'],
  ['分布式训练机制','aliInfra',true,readLink('distributed-training','两进程梯度对照')+' <a href="'+articleURL('checkpoint-recovery')+'#native-ddp-accumulation-restart">复跑累积中断 →</a>','手算样本数不等时的正确更新。再对照同一份检查点从两个位置续跑，检查哪种恢复遗漏了微批。'],
  ['训练状态与容量','byteAI',true,readLink('gpu-memory','复算显存账本'),'复算模型状态和临时峰值，解释缩小微批能省哪一项。'],
  ['训练/推理底层性能','byteAI',false,readLink('training-performance','分析对照实验')+
    '<a href="'+articleURL('operator-profiling')+'#torch-compile-graph-break">诊断图捕获 →</a> '+
    '<a href="'+articleURL('operator-profiling')+'#same-device-gemm">CUDA 同卡验收步骤 →</a>',
    '已有 CPU 图捕获对照和 Apple GPU 同卡 GEMM 计时。CUDA 三版已在 Linux 编译。到目标 NVIDIA 卡先运行 <code>./gemm_variants --probe-only</code>，探测通过后留存数值回读、CUDA event 计时和 Nsight 指标。'],
  ['推理引擎与调度','txInference',false,'<a href="'+articleURL('inference-performance')+'#native-pd-split">复算分池后的等待 →</a>','已有本机分池和缓存交接对照。迁移到真实推理引擎后，需按相同模型、硬件预算和负载重新测量。'],
  ['Agent 运行时与授权','aliAgent',true,readLink('agent-security','运行工具授权实验'),'说明可信委托与参数的区别，核对拒绝后的实际效果。'],
  ['沙箱隔离与性能','txSandbox',false,'<a href="'+articleURL('agent-sandbox')+'#native-sandbox-container">核对容器文件边界 →</a> · <a href="'+articleURL('agent-sandbox')+'#native-sandbox-egress">核对网络出口 →</a> · <a href="'+articleURL('agent-sandbox')+'#native-sandbox-process-group">核对进程组回收 →</a> · <a href="'+articleURL('agent-sandbox')+'#native-sandbox-docker-lifecycle">核对容器复用与并发回收 →</a>','已有单机 Linux Docker 记录，覆盖固定任务的文件、出口、复用和并发停止。生产环境仍需验证跨租户复用、资源回收和性能。']
 ];
 const practiced = groups.filter(group => group[2]).length;
 return `<section class="company-sample"><h2>先找与你要投的岗位相近的一行</h2><p class="path-links"><a href="/interview/experiences/">看候选人公开面经与题目转述 →</a></p>
 <p>本次选取腾讯、阿里、字节的 ${Object.keys(employerSources).length} 份公开岗位说明，按三条 Infra 主线归纳为 ${groups.length} 组能力。其中 ${practiced} 组已有独立作答任务和可检查的过关条件，其余 ${groups.length-practiced} 组有学习材料，仍需目标环境验证。统计单位是下表的能力组；实际考题、出现频率和面试通过率不在这个统计中。核对日期为 2026 年 11 月 4 日。</p>
 <section class="role-row"><span>01 / 腾讯</span><h3>先分清 SRE、推理框架和沙箱方向</h3><p>SRE 先练 Linux、SQL 和故障恢复；推理框架先读模型时序与并行，再做性能归因；沙箱岗位要从控制面指标定位数据面的资源问题。</p>
 <div class="path-links">${unitLink('database','SRE 首题')}${readLink('model-serving','推理首章')}<a href="${articleURL('agent-sandbox')}#native-sandbox-container">沙箱文件边界 →</a></div><p class="evidence-note">${roleSource('txSre')} · ${roleSource('txInference')} · ${roleSource('txSandbox')}</p></section>
 <section class="role-row"><span>02 / 阿里</span><h3>从 AI SRE、AI Infra、Agent Infra 选一个校招方向</h3><p>AI SRE 岗要求编程、分布式或云原生基础，并涉及可观测诊断与安全发布；AI Infra 岗涉及训练通信、推理加速或资源调度；Agent Infra 岗涉及工具执行、身份和状态恢复。先巩固共用基础，再按对应职责做题。这里列的是集团招聘样本，具体部门以岗位页为准。</p>
 <div class="path-links">${unitLink('coding','共同编码题')}${readLink('distributed-training','训练机制')}${readLink('agent-runtime','运行时')}</div><p class="evidence-note">${roleSource('aliSre')} · ${roleSource('aliInfra')} · ${roleSource('aliAgent')}</p></section>
 <section class="role-row"><span>03 / 字节</span><h3>实习训推优化，与社招站点架构分别准备</h3><p>训推实习从实现、调试和性能对照入手；站点架构岗位强调跨 Region、AZ 的网络路径、高可用和已经交付的设计。后者面向有经验的候选人。按自己的目标选择一条。</p>
 <div class="path-links">${readLink('training-performance','训推性能')}${readLink('vpc-network','站点请求路径')}${unitLink('design','容量设计')}</div><p class="evidence-note">${roleSource('byteAI')} · ${roleSource('byteSite')}</p></section>
 <details><summary>查看 ${groups.length} 项能力、过关题和待补边界</summary>
 ${trainingTable(['能力与岗位样本','当前深度','先做什么','过关条件或缺口'],groups.map(([title,key,ready,link,gate])=>[title+'<br><small>'+roleSource(key)+'</small>',ready?'可做过关题':'需目标环境',link,gate]))}</details>
 <details><summary>哪些材料明确讲到了考察形式？</summary><p>阿里控股集团的校招说明写明，部分岗位可能安排在线笔试，内容可包括编程题。字节大陆校招 FAQ 说明，有笔试安排的岗位采用线上形式，具体题型要看邀请。腾讯会议 2021 年的官方案例描述过面试中的代码考察，能说明该案例当时的做法。</p><p class="evidence-note"><a href="https://talent-holding.alibaba.com/campus/notice?tab=delivery">阿里控股校招说明 ↗</a> · <a href="https://jobs.bytedance.com/campus/page-6272Gc">字节校园招聘 FAQ ↗</a> · <a href="https://meeting.tencent.com/news/interview.html">腾讯历史案例 ↗</a></p></details>
 <p class="evidence-note">岗位说明用于确认工作能力。学习顺序与练习均由本站编写。请以目标团队和招聘批次的通知为准。</p></section>`;
}
