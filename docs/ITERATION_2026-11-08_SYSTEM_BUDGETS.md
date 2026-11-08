# 从资源预算，走到任务实际完成

本轮继续顺读三条主线的后续章节，修订容量与弹性、Roofline、Agent观测。改动针对正文中的对象、单位和因果跳步，保留原小节URL、代码与实验结果。没有增加章节、实验包或历史八小时计数。

|章节|顺读发现|这次修改|
|---|---|---|
|C8.1 容量与弹性|能力、实际完成率和积压容易混用；扩容后“可用”与“已恢复”之间缺少一条图解；故障分布与总量的关系较抽象|先定义到达、有效容量、完成和积压，沿180/120/200与120秒空窗算到7200积压、第480秒排空；对照追平与继续过载，再逐区扣减故障容量，最后跟读有限缓冲代码|
|A1.8 Roofline|FLOP工作量与处理速率挤在同段；M词元行跳到请求组批；C既表示算力又被用作输出矩阵|逐个定义符号和单位，列X/W/Y三笔读写，明确M不等于用户数；推导时间max与速度min的对应关系，统一用Y表示输出，再跟读实际算例列|
|G9 Agent观测|任务、操作、尝试、span虽被列出，父身份如何过HTTP边界还较跳跃；五跨度与任务总体数字不易对应|沿R27:publish两次尝试画出根/客户端/服务端五节点；分开503回应与业务结果未知、UNSET与UNKNOWN；用并行时间线和100任务账本分别解释时延、分母与成本|

四张原创SVG分别呈现分段积压曲线、按相同比例的字节组成、五节点父子树、并行时间线。数字来自已声明的教学输入或原实验关系，没有生成GPU性能或真实自动扩容测量。新增一段Python标准库代码，对照160/180/200次每秒三种新能力能否排空旧积压。

## 实战与核对

实际重跑capacity_lab.py、roofline-model.py及otel_attempts.py。前两份使用标准库，分别核对积压守恒、有限缓冲拒绝与原有两行Roofline输出。观测程序仍为真实本机HTTP、SQLite及SDK内存导出，得到五个span、两次尝试、一笔效果、一个合格任务、五个教学成本点。

本轮本机已有OpenTelemetry API/SDK为1.41.1，因此新增重放记录明确使用该版本；已发布的1.44.0源码、执行记录与requirements均保持不变，没有把一次1.41.1运行改标成1.44.0。它增加同源关系核对，不宣称升级或覆盖原复现基线。两次环境都没有Collector、远端后端、LLM、Kairo或真实计费。

新增检查独立按一秒步长复算480秒守恒，验证图中三个关键点；从原程序输出复核字节与时间单位；另按明确的并行区间复算1000ms与1300ms，核对五节点父关系。可设置`INFRA_OBSERVATION_PYTHON`明确要求再次执行本机SDK程序，CI继续保留已绑定源码的既有1.44.0记录，不自动安装新依赖。

与发布提交89db380比较，72章正文保持相同；三章全部原代码块逐字、按原顺序保留，仅容量章增加一段代码。原95条后续正文审阅不变，追加三章记录。前面三份COHERENCE/CAUSAL记录保持原字节；本轮源码与章节签名单独记录在SYSTEM_BUDGET_WALKTHROUGHS_2026-11-08.json。旧审阅在其发布边界继续核对，当前语料由本轮新检查另做全量差异检查。

统一入口为`node scripts/check-all.cjs --pages`，当前43项。实际页面验收与截图保存在工作区outputs。真实读者试读仍为0，作者顺读、源码对照和自动检查不能替代初学者复述与迁移练习。

## 本轮核对的原始资料

- [Google SRE：处理过载](https://sre.google/sre-book/handling-overload/)，用来复核容量、排队和保护机制的关系。
- [NVIDIA：矩阵乘法性能](https://docs.nvidia.com/deeplearning/performance/dl-performance-matrix-multiplication/index.html)，用来复核工作量、读写量与性能上界的口径。
- [OpenTelemetry：追踪对象](https://opentelemetry.io/docs/concepts/signals/traces/)、[Python传播](https://opentelemetry.io/docs/languages/python/propagation/)和[W3C Trace Context](https://www.w3.org/TR/trace-context/)，用来复核跨度、父身份和HTTP头的职责。

核对日期2026-11-08。中文正文、固定算例与四张图均由本站组织，不把外部项目清单作为课程内容。
