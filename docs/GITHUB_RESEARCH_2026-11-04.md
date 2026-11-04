# GitHub项目深度调研与第18轮改进

核对日期：2026-11-04。读取15个原仓库的目录、代表样章或实现，记录固定提交。未运行第三方程序、下载模型或复现其GPU结果。

## 借鉴的方法

1. 总览、重点问题、深读与动手分层；按读者缺口进入，不要求先读完全部目录。
2. 同一问题连续追问：机制是什么、条件变了会怎样、凭什么判断。用明确反例检查理解。
3. 系统设计先限定目标与负载，再算资源、画图和注入故障；正常总量与故障后容量分开。
4. 源码讲解同时跟踪对象归属、正常路径和失败清理；终态正确还需核对过程中禁止的动作。
5. 题目发生的证据、岗位职责、社区整理和本站原创题分开。GitHub的“高频”标签没有抽样分母，不能换算公司题频。

## 15个项目与读法

|项目|借鉴的优点|落实到本站|
|---|---|---|
|[JavaGuide](https://github.com/Snailclimb/JavaGuide)|总览、专题与项目准备分层|复习步骤对应实际产出，按薄弱点回教材|
|[CS-Base / 小林](https://github.com/xiaolincoder/CS-Base)|同一对象多场景图解|缓冲寿命、共享块与失败条件逐项变化|
|[huihut/interview](https://github.com/huihut/interview)|基础范围清晰、短段速查|完整地图与深读出口分开，速查后仍需跟算|
|[Back-End Developer Interview Questions](https://github.com/arialdomartini/Back-End-Developer-Interview-Questions)|开放式讨论取舍|评分要求说明条件、反例和证据|
|[CS-Notes](https://github.com/CyC2018/CS-Notes)|沿业务对象讲系统基础|事务单向等待与环形等待对照|
|[System Design Primer](https://github.com/donnemartin/system-design-primer)|先范围、估算，再架构与扩展|三区查询服务的故障后容量设计|
|[DevOps Exercises](https://github.com/bregman-arie/devops-exercises)|先预测、操作、观察再解释|Pod逐张证据题；修正容器重启与Pod替换的混称|
|[Kubernetes Handbook](https://github.com/feiskyer/kubernetes-handbook)|从症状逆向进入排查|Pending之后继续看绑定、镜像、退出与UID|
|[AIInfraGuide](https://github.com/caomaolufei/AIInfraGuide)|机制、形状、图与源码紧密连接|逻辑KV账继续到物理块与引用|
|[AI-Infra-101](https://github.com/ShengxuanQiu/AI-Infra-101)|正常路径、运行时状态与性能归因|P/D拆分按同一观测点比较排队与交接|
|[ai-infra-book](https://github.com/bojieli/ai-infra-book)|保持约束、定量推导与证据边界|固定常驻状态，只改变预取次序重算峰值|
|[llm-rl-infra-interview](https://github.com/XFWang522/llm-rl-infra-interview)|原理后继续追问峰值和版本|从分片表追到何时OOM；整理标签不作公司真题证据|
|[AI Agents for Beginners](https://github.com/microsoft/ai-agents-for-beginners)|按小任务练工具与权限边界|可信批准、执行声明、工具回执分别列账|
|[MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)|从真实SDK区分失败层次|令牌受众、对象授权、业务失败与结果未知|
|[τ-bench](https://github.com/sierra-research/tau2-bench)|任务终态和用户交付独立验收|修复状态、访问、返回内容与额外效果的漏判|

每库实际阅读文件、固定提交、许可线索、观察与适用限制见[完整调研记录](GITHUB_RESEARCH_2026-11-04.json)。版本新旧、聚合题源和第三方材料的限制均保留，未把仓库星数作为质量分。

## 本轮落地

- 原有面经页增加6组原创连续追问；15个岗位语境样本、14篇候选人原帖和29组题意转述独立保留。
- 系统设计增加三区查询服务：1/1/1与2/1/1失最大区后80/s，2/2/1后120/s；解释5副本下限和后端可用前提。
- 数据库练习补单向等待与环形等待；问题索引补Pending、已绑定拉镜像、同UID容器重启与新UID四种证据。
- AI正文与系统知识同步补预取缓冲寿命、共享KV引用和PD交接下界，三张原创图配明确算例。
- Agent评估同时检查公开状态、产物、来源、读取、返回内容和任务集合之外的效果。原4策略仍为4/0/2/3；两个错误状态、越权读后正确、缓存泄漏为3/4；额外未知报告导致环境契约失败为0/4。
- 复习路线改为可反复执行的6个步骤，明确不承诺6次学完全部课程。

所有新题、文字与图均独立撰写。研究项目提供组织方法与选题线索，技术解释另以协议、框架官方文档及原始论文核对。

## 后续优先补充

1. TCP状态、字节解析、epoll的独立机制与本地网络实验。
2. MySQL日志、复制确认和真实引擎故障恢复，避免用SQLite替代InnoDB证据。
3. GPU profiling、FSDP预取和P/D拆分的目标环境对照，固定硬件总预算、负载、质量与时延。
4. Kairo适配与真实任务验收；现有机制实验不写成已经接入。
