// Original self-checks. Employer sources below describe expectations, not these prompts.
const codingReference = `def peak_jobs(intervals):
    events = []
    for start, end in intervals:
        if end <= start:
            raise ValueError("expected start < end")
        events.extend([(start, 1), (end, -1)])
    active = peak = 0
    for _, delta in sorted(events):
        active += delta
        peak = max(peak, active)
    return peak`;

function mockInterviewPractice() {
 return `<details class="interview-extra"><summary>做一轮模拟面试 · 编码、设计、项目各一题</summary>
 <p>下面是本站原创练习。先在纸上或编辑器里作答，再展开核对。建议用时由本站设定。</p>
 <h3>01　现场编码 · 20 分钟</h3>
 <p>已完成作业以整数时间区间 [start, end) 记录，保证 start &lt; end，输入无序。返回同时运行作业数的峰值。例子 [(1,4), (2,4), (4,7)] 应得到 2。先说明在第 4 秒该如何计数。</p>
 <details><summary>核对实现、复杂度和边界</summary>
 ${trainingCode('Python 参考解 · 同一时刻先结束再开始', 'PYTHON', codingReference)}
 <p>每个区间产生两个事件。元组排序让同一时刻的 −1 排在 +1 前面，结束于 4 的作业不会与开始于 4 的作业重叠。处理 n 个区间需要 O(n log n) 时间和 O(n) 额外空间。自测空输入 → 0，[(1,2),(2,3)] → 1，两个相同区间 → 2，再检查乱序和非法区间。</p></details>
 <h3>02　系统设计 · 25 分钟</h3>
 <p>四台各有 8 卡的机器，当前空闲卡数为 [8,4,4,0]。一个训练作业需要两台机器各提供 8 卡，四台机器都在同一网络域。画出提交、排队、整组准入、运行和恢复的路径。产品还要求小作业能及时开始。</p>
 <details><summary>核对约束与追问</summary><p>空闲卡共 16 张，满足形状的机器却只有一台。先说明准入条件、资源预留与释放，再比较等待、回填或有约束的抢占。解释如何避免大作业长期饥饿。恢复要处理失败节点、checkpoint 和重复提交。验收至少比较排队时延、有效吞吐、恢复耗时与成本。追问：小作业实际运行时间超过估计，预留的第二台机器如何兑现？</p>
 <a href="/article/gpu-scheduling/">对照 GPU 准入章节 →</a></details>
 <h3>03　项目复盘 · 10 分钟</h3>
 <p>选一件你亲手处理过的故障，写明用户影响、你负责的决定、被证据排除的一种解释，以及恢复后验证效果的指标。追问你为什么放弃另一个方案，哪个环节由同事负责。</p>
 <details><summary>核对回答是否经得起追问</summary><p>标出你的行动和团队的行动，给出前后指标的口径与观察窗口。没有精确数据时说明当时保留下来的证据。最后再说一次，如果今天重做，会提前加哪条监测或演练。</p><a href="/article/incident/">对照故障时间线 →</a></details>
 </details>`;
}

function interviewCoverage() {
 const source = (url, label) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
 const chapter = (id, label) => `<a href="${articleURL(id)}">${label} →</a>`;
 const evidence = (goal, id, anchor, label) => `<a href="${learningGoalEvidenceURL(goal,id,anchor)}">${label} →</a>`;
 const capabilities = [
  ['云 / SRE', '可复跑排障', chapter('network-diagnosis','分层排障')+'、'+chapter('incident','故障复盘')+'、'+chapter('slo','错误预算')+'、'+evidence('cloud-sre','incident','incident-connection-lease','连接池实测'), '用应用事件区分锁等待与下游等待，再从恢复后的用户入口回读。跨区容灾与容量还要在目标环境验证。'],
  ['训练平台', '两进程实测，规模待验', chapter('distributed-training','DDP 单步')+'、'+chapter('gpu-memory','显存预算')+'、'+chapter('multinode-lab','多机手册')+'、'+evidence('ai-training','data-pipeline','sampler-matched-tail','尾批同步'), '用两进程记录核对有效样本和权重。迁移到多机训练时，再记录各进程的放置、吞吐、内存和恢复进度。'],
  ['推理 / 性能', 'CPU 调度已跑', chapter('model-serving','KV 缓存')+'、'+chapter('speculative-decoding','精确采样与缓存回退')+'、'+chapter('inference-performance','推理指标')+'、'+evidence('ai-inference','inference-performance','native-vllm-scheduler','真实调度器'), '解释剩余计算额度与空闲缓存块为什么是两笔账。速度、显存和跨版本性能须用目标模型及负载测量。'],
  ['Agent 平台', '运行与接收端可核对', chapter('agent-recovery','工具恢复')+'、'+chapter('agent-security','权限实验')+'、'+chapter('agent-evaluation','任务评估')+'、'+evidence('agent-platform','durable-workflows','native-parallel-merge','回放与业务写入'), '对照工作流检查点和接收库回执。目标 Kairo 接入时，按同一任务核对读取、写入和交付。'],
  ['算法、编程与测试', '有排序与图两题', '<a href="/interview/coding/">依赖排序与本地判题 →</a>，下方另有作业峰值题。', '需系统练习哈希、树、图与复杂度，在限时条件下独立编码、测试并解释。'],
  ['系统设计、数据库', '有原生锁等待对照', '<a href="/interview/database/">查询计划与事务快照 →</a> · <a href="/interview/design/">整组容量设计 →</a> · <a href="/article/database-index-locks/#native-innodb-lab">InnoDB 等待边 →</a>', '在 InnoDB 记录中找出持锁方和等待方，再解释事务结束后怎样核对业务读数。分区复制与真实负载需另做验证。'],
  ['个人项目与行为面', '有复盘提纲', chapter('incident','证据时间线')+'，下方有一题项目追问。', '准备自己的决策、分工、失败与量化结果，练习解释替代方案和实际代价。']
 ];
 return `<details class="interview-extra"><summary>面试覆盖对照 · 按岗位看本站能练什么</summary>
 <p>按目标岗位选一行，从实测记录练习判断和追问。公开样本用于说明岗位能力，题目由本站编写。</p>
 ${trainingTable(['准备方向','本站深度','从哪里开始','还要独立完成什么'],capabilities)}
 <h3>官方面试说明</h3>
 <p>Amazon 的 SDE II 指南分别说明编码、系统设计和过往经历。Microsoft 的技术面试指南要求展示问题拆解、可运行的实现和测试，技术范围因岗位而异。两者适合用来检查通用准备环节。${source('https://amazon.jobs/content/en/how-we-hire/sde-ii-interview-prep','Amazon SDE II')} · ${source('https://careers.microsoft.com/v2/global/en/hiring-tips/technical-interviewing.html','Microsoft 技术面试')}</p>
 <h3>官方岗位说明</h3>
 <p>岗位职责提供能力样本。下面的题目和章节映射由本站编写。初学者可先学机制，有经验的候选人还需提供实际负责过的系统、规模和结果。</p>
 <ul><li>腾讯 IaaS 计算产品 SRE 涵盖可观测、变更治理和容灾，要求开发及常见数据库性能排查能力。${source('https://careers.tencent.com/jobdesc.html?postId=2113177003082559488','腾讯 IaaS SRE')}</li>
 <li>百度 AI Infra 平台强调工件追踪、拓扑感知调度及抢占恢复。腾讯推理框架岗位关注预填充与解码分离调度、异构芯片与推理成本。${source('https://talent.baidu.com/jobs/detail/SOCIAL/2216e7ae-f75d-4e7c-b14d-669a4171a1ff','百度 AI Infra 平台')} · ${source('https://careers.tencent.com/jobdesc.html?postId=2108854783036272640','腾讯推理框架')}</li>
 <li>百度云原生 Agent Infra 涉及多租户隔离、沙箱编排与治理。AWS Agentic AI 把冷启动、资源利用、会话身份与跨账号访问列入工程职责。${source('https://talent.baidu.com/jobs/detail/SOCIAL/4b326f6b-2c39-461c-ae64-69b4201c680e','百度 Agent Infra')} · ${source('https://www.amazon.jobs/en/jobs/10584176/software-development-engineer-aws-agentic-ai','AWS Agentic AI')}</li></ul>
 </details>`;
}
