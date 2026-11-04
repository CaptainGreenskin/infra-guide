# 8小时迭代：交付清单与剩余缺口

本窗口为北京时间 **2026年11月4日22:12—11月5日06:12**。最后30分钟只做验收、修正与发布。以下是本窗口的交付快照；逐轮过程见[目标与进展](EIGHT_HOUR_GOAL_2026-11-04.md)，逐章与逐知识点的审读记录见[审阅数据](QUALITY_AUDIT_2026-11-04.json)。

目标是让中国初学者能顺着知识体系读懂机制、复算例子并运行代码。没有用新增目录、重复文字或单纯加参考链接充当章节补强。

## 目标与结果

|验收项|结果|证据与口径|
|---|---|---|
|完整审读66章和现有知识点|66/66章、95/95点|记录问题、处理结论及正文SHA256；正文变化后旧审读摘要不能继续通过检查。不是仅按字数筛选|
|至少实质补强18章，每方向至少6章|24篇不同章节：Cloud9、AI7、Agent7、综合1|同一章的后续修订只计一次；补链、加术语、只添一小段均不另计|
|每方向至少2套可复现实验|已超过；实验目录按方向和阶段排序|新增12个ZIP；目前全站25包、54项学习任务（Cloud21/AI17/Agent16）。任务数不等于独立实验包数|
|图、代码、运行结果一致|78条源码/输入引用与执行摘要及ZIP字节绑定|另3个目标环境文件明确待验；没有把待验文件算成实际运行记录|
|知识先于案例、重点和阅读顺序明确|三条方向独立，保留先修与重点，实验由机制入口跳到运行段|大纲、复习顺序、正文、实验室互相连接；不增加模块概览中转页|
|阅读、搜索与发布|桌面和390px手机实际操作；两处公开托管同步|静态全文、方向目录、图解Fit/放大/滚动、源码展开、搜索键盘及下载均按各轮记录验收|

相对窗口开始前的提交 `2b12518d5179baba42079e68d1b305d3a7156661`，新增 **54张独立SVG**，包括架构、状态/时序、逐格运算和由实际结果绘制的定量图。这个数字统计不同图文件，不把同一张图在多处引用重复计数，也不作为内容质量的替代指标。

## 24篇实质补强

### Cloud Infra · 9篇

|章节|这次讲深的机制|
|---|---|
|[计算资源](https://captaingreenskin.github.io/infra-guide/article/cloud-compute/)|虚拟化三层映射、CPU时间与墙钟、等待与容量口径|
|[网络诊断](https://captaingreenskin.github.io/infra-guide/article/network-diagnosis/)|连接/首字节/传输、TLS身份、非阻塞TCP背压与半关闭|
|[云存储](https://captaingreenskin.github.io/infra-guide/article/training-storage/)|块/文件/对象的接口差异、分片与Range请求、实际读取字节和完整性|
|[Kubernetes网络](https://captaingreenskin.github.io/infra-guide/article/k8s-networking/)|DNS、Service转发、连接状态、策略和回程|
|[Kubernetes存储](https://captaingreenskin.github.io/infra-guide/article/k8s-storage/)|PVC绑定/拓扑/访问模式、挂载与应用一致性、恢复验收|
|[配置与密钥](https://captaingreenskin.github.io/infra-guide/article/config-secrets/)|传播、进程重读、配置快照、版本兼容与旧凭据撤销|
|[Kubernetes弹性](https://captaingreenskin.github.io/infra-guide/article/k8s-autoscaling/)|CPU分母、控制延迟、节点容量、稳定窗口和下游预算|
|[Serverless与事件驱动](https://captaingreenskin.github.io/infra-guide/article/serverless-execution/)|消息/接收/业务三种身份、可见性、部分批次失败与重复效果|
|[恢复工程](https://captaingreenskin.github.io/infra-guide/article/resilience/)|故障域、恢复点、日志/附件一致切面、恢复后的outbox与消费者验收|

### AI Infra · 7篇

|章节|这次讲深的机制|
|---|---|
|[张量与流水线并行](https://captaingreenskin.github.io/infra-guide/article/tensor-parallel-math/)|切分后的前向、链式法则、通信、梯度与参数更新；与完整基线和手算矩阵比较|
|[显存与混合精度](https://captaingreenskin.github.io/infra-guide/article/gpu-memory/)|参数/梯度/优化器/激活/缓冲、实际dtype、延迟状态、瞬时峰值与重计算|
|[集合通信](https://captaingreenskin.github.io/infra-guide/article/training-communication/)|ReduceScatter/AllGather数值、调用次序、等待和故障边界|
|[数据管道](https://captaingreenskin.github.io/infra-guide/article/data-pipeline/)|采样器、rank/worker分流、尾批次、packing边界、有效进展与恢复|
|[GPU队列与调度](https://captaingreenskin.github.io/infra-guide/article/gpu-scheduling/)|份额、资源形状、碎片、拓扑、整组预留、协同启动与回滚|
|[模型推理](https://captaingreenskin.github.io/infra-guide/article/model-serving/)|Prefill/Decode与KV缓存；量化误差、打包字节、算子执行和保存回读|
|[模型生命周期](https://captaingreenskin.github.io/infra-guide/article/ai-lifecycle/)|完整版本束、语义兼容、分层门禁、固定请求、条件发布与回退|

### Agent Infra · 7篇

|章节|这次讲深的机制|
|---|---|
|[Agent运行时](https://captaingreenskin.github.io/infra-guide/article/agent-runtime/)|任务/工具/类型/错误/停止条件；字节到UTF-8、SSE事件、完整参数及工具准入|
|[上下文与记忆](https://captaingreenskin.github.io/infra-guide/article/agent-memory/)|上下文预算、结构化摘要、权威状态、版本条件、撤回与旧信息再出现|
|[Agent评估](https://captaingreenskin.github.io/infra-guide/article/agent-evaluation/)|任务集、独立评分器、负例、类别口径、Wilson区间和同题成对比较|
|[Kairo接入验收](https://captaingreenskin.github.io/infra-guide/article/kairo-practice/)|先定义任务/权限/产物/结果契约，再检查正例与十种错误记录；来源始终标为未核实|
|[检索与上下文](https://captaingreenskin.github.io/infra-guide/article/agent-retrieval/)|中文FTS5/BM25、声明排名输入的RRF、分级nDCG、引用、版本与授权交付|
|[Agent观测](https://captaingreenskin.github.io/infra-guide/article/agent-observability/)|真实OpenTelemetry/HTTP因果轨迹、尝试归因、等待与每成功任务成本|
|[Agent沙箱](https://captaingreenskin.github.io/infra-guide/article/agent-sandbox/)|资源/进程生命周期、FD与环境继承、路径替换反例及隔离边界|

综合实战1篇：[两进程训练、完整恢复与三个失败对照](https://captaingreenskin.github.io/infra-guide/article/training-lab/)。实际运行完整4轮与2+2轮恢复，比较完整状态，并用三个负例证明只看loss、步数或参数还不够。

Token/Embedding、自动求导和SQL索引/事务等章节还得到后续补充：共享词表两条梯度路径、六项有效监督与四项标量权重、定位/排序/覆盖的独立判断、旧快照重试中的105/95分支。这些没有再加到24篇计数中。

## 可复现结果举例

|方向|实际执行|结论的适用范围|
|---|---|---|
|Cloud|真实本机TLS/HTTP、非阻塞TCP、SQLite WAL备份/恢复、文件/子进程配置轮换、Prometheus规则|网络和文件行为来自实际系统调用；SQLite实验不是MySQL存储引擎压测；Kubernetes清单仍需真实集群验收|
|Cloud|四种索引的原始计划与同结果对照；两个独立连接的旧快照/重试|N=1进度回调不是精确扫描行数、IO次数或性能排名；重开事务不自动刷新旧业务决策|
|AI|PyTorch2.5.1 CPU、两rank Gloo、四worker加载、真实保存/回读、链式法则与有限差分|没有运行真实GPU/NCCL或物理多机；CPU结果证明程序和数值机制，不证明生产吞吐|
|AI|共享Embedding的16项梯度、padding输入路径和输出路径、四项损失的两种权重|输入padding零贡献不等于输出参数冻结；两个示例的样本分母分别说明，不能混算|
|Agent|十组真实本机HTTP工具循环、十三组分块HTTP流与本地只读回调、真实OTel链路|流式实验使用自定义start/delta/done契约，不冒充模型API、完整EventSource或MCP协议|
|Agent|中文FTS5检索、真实POSIX资源限制、独立Kairo记录校验|固定相关性标签与排名输入是题设；POSIX限制不是安全容器；契约通过不是Kairo已接入|

源码、环境、结果、SHA256及运行说明保存在各包的 `README.md` / `validation.json` 等文件。实验目录的54项任务可筛选、分享、按阶段学习；25个包中有12个在本窗口新增，既有包也有实质升级。每个任务注明本地记录或目标环境待验。

## 阅读与维护改进

- 搜索161个实际条目（66章+95知识点），按标题、简介、小节、正文和源码分层，保留技术标识符。命中直接到小节；修正“流式”命中标题却从下载区截摘要的问题。
- 134个规范脚本按原顺序生成6个内容脚本，加阅读、搜索和入口共9个公开JS请求；比较生成前后全部100条路由。请求数减少是构建结果，没有伪造用户网络提速数据。
- 图解按宽高同时适合窗口；长图可放大并横纵滚动。手机390px正文不整页横向溢出，代码和宽表在自己的区域滚动，章节锚点避开固定工具栏。
- 配置了保留静态正文的启动恢复入口。实际注入一次后续脚本503，桌面点击和手机Enter重新载入后恢复正常。最初偶发初始化失败的网络原因没有确定；监测脚本本身未载入时也无法由它显示恢复入口。
- 32项学习资料可筛选正文语言和视频；8项中文/译文、4项中文正文带视频入口。英文课程/录像明确标注；不声称已经完整观看全部录像。保留One GPU LM独立项目与右上角GitHub入口。
- 收尾发现并修正大纲旧“60章”统计，改为由实际章节数组生成。审阅记录摘要也改为与24篇不同章节一致。
- 中文复读将“vCPU合同”“恢复合同”“完成合同”等机械译法改为资源保证、恢复条件和任务完成条件，模型例子写清固定输出约定。正文、图文字与包内说明同步；本次措辞修订不重复计入24篇补强。

## 检查与公开版本

统一入口：

```sh
node scripts/check-all.cjs --pages
```

第38轮的31项检查全部通过，包含100条完整静态路由、10255个项目路径下的本地链接/资源、来源与源码摘要、ZIP成员及生成前后运行时对照。该提交的[GitHub Pages工作流](https://github.com/CaptainGreenskin/infra-guide/actions/runs/41916917590)成功，提交为 `8b2459a5b6ac26903964803b5fa8e90d2e7e4794`；镜像版本40也已成功并实际浏览验收。第39轮收尾修改再次通过全部31项检查，新增大纲实际链接数与介绍文案一致、实质修订摘要与不同章节条目一致的回归；对应[工作流41918468056](https://github.com/CaptainGreenskin/infra-guide/actions/runs/41918468056)及镜像版本41成功，两处大纲已实查。第40轮中文修订通过全31项，并复核资产/项目路径与包内字节一致。最终发布提交以仓库HEAD和对应Actions记录为准，两处仍按匹配源码验收。

额外环境的PyTorch、OTel、promtool实验在相关轮次实际运行并记录；普通CI不会安装这些环境并冒充重跑。普通标准库程序按检查逻辑复跑，已有外部执行记录同时核对源码摘要和独立算式。修订这些程序后仍必须按对应说明实际重新执行。

公开入口：[主站](https://captaingreenskin.github.io/infra-guide/) · [镜像](https://cloud-infra-guide-llh.tautagave4.chatgpt.site/) · [源码](https://github.com/CaptainGreenskin/infra-guide)

## 下一阶段仍要做什么

1. **真实环境验收**：物理两机多卡/NCCL、Kubernetes网络与CSI、目标对象存储，以及真实Kairo适配器。已有手册、夹具和本地实验，尚未获得这些目标环境的执行证据。
2. **读者吸收验证**：邀请初学者按大纲读一章、闭卷解释、运行一个实验，记录卡住的位置和完成率。当前没有真实读者样本，不能宣称已达到参考站点的阅读效果或已有人持续阅读。
3. **岗位与面试更新**：用带日期的公开职位和面试样本维护映射，补齐缺口；现有样本不能证明覆盖腾讯、阿里、字节“大部分面试”。
4. **外链可达性**：三份旧PyTorch2.5官方档案在本环境返回403，不等同于确认404。保留与固定2.5.1实验匹配的来源及已核对标签源码；后续继续检查官方档案访问和中文学习资料。

下一轮优先用真实读者和真实环境发现问题，再补内容。全站审读、章节补强、图和源码一致性已经有记录；生产适用性和学习效果还需要外部证据。

## 首批读者怎样试读

这是下一阶段待执行的方案，**当前没有试读结果**。先邀请3—5位不熟悉所选方向、能运行基本Python命令的中文读者，每人只选一个方向。记录已有基础，避免把安装环境的困难、术语不懂和机制没理解混为一类。

每人按同样顺序完成三件事：从首页找到指定知识点；读一个小节及配图后闭卷解释；先预测一个结果，再运行对应程序并解释差异。建议分别给2、10、15分钟观察预算，超时如实记录，不把“27分钟”写成掌握整个方向的承诺。

|方向|试读范围|闭卷解释的问题|实际运行入口|
|---|---|---|---|
|Cloud|计算资源中的CPU时间、墙钟与线程记账|等待时为什么墙钟增加而CPU时间很小？多个线程的CPU时间怎样相加？|[cpu_and_wall.py](https://captaingreenskin.github.io/infra-guide/labs/compute-and-transport/cpu_and_wall.py)|
|AI Infra|模型推理中的分组量化、打包字节与数值误差|为什么INT4权重不能只按元素数×4bit估文件大小？分组大小改变时要同时看哪些代价？|[int4_groups.py](https://captaingreenskin.github.io/infra-guide/labs/storage-quant-context/int4_groups.py)|
|Agent Infra|运行时中的流式参数、结束事件与工具准入|JSON前缀能解析为什么还不能执行？工具已经调用后，流出错是否抹掉这次调用？|[streamed_tool_calls.py](https://captaingreenskin.github.io/infra-guide/labs/streamed-tool-calls/streamed_tool_calls.py)|

三个入口都只需要Python3.9+标准库，不要求先安装GPU环境。程序的固定输入、实际输出和教学边界见同包说明。首次观察先保留原输入；之后再让读者换一个条件，说明原结论是否仍成立。

每人记录：方向与基础、找到目标耗时、卡住的原句、闭卷回答、是否求助、程序环境与退出结果、哪个图或反例帮助了理解。答不出来时先定位依赖、术语、图文或步骤问题；相同卡点出现两次，就优先修那一处。汇总保留原始n/N和失败原因，小样本只指导修订，不拿来证明全站已经达到参考站点或覆盖大部分面试。
