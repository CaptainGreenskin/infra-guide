# 把章节中段的机制讲顺

本轮接续领域图谱与连续阅读改进，专门顺读并修订Cloud、AI、Agent各一章。重点是概念进入推理的顺序、同一组数据的因果关系，以及代码怎样验证前文。没有增加章节数、实验包数或历史八小时计数。

## 三章修改

|章节|发现的问题|本轮落实|
|---|---|---|
|C9.1 SLI、SLO与错误预算|用户事件、指标、目标与预算缺少就地分工；成熟期只被提到；时间比例容易被误用为任意流量下的预算消耗|先定义与分类，再处理跨分钟结果归属，沿989/1000走到预算−1；对照均匀与不均匀流量的2%/14.4%，最后跟读实际Prometheus规则|
|A1.7 GPU执行与存储|线程、线程块、线程束、SM在同段进入；异步计时示例先于流与事件解释|先分逻辑分工与硬件资源，再追2500个元素、尾块196/60和20000字节；解释步长与布局，最后分别定义提交、事件完成和端到端边界|
|G5 上下文、运行状态与长期记忆|适用性与撤回说明重复；完整程序缺少沿函数跟读；本地同库事务易被读成跨服务恢复保证|连起权威事实、记忆选择和本轮输入；按实际四张表、五个分支跟读；明确同SQLite事务、固定主体、教学时钟及当前版本选择的范围|

图解为四张原创可编辑SVG：请求分类与计数账本、GPU执行层次、主机/设备时间线、Agent信息流。分别使用计数行、嵌套分组、时间泳道和信息路径，图文共享对象、数值与假设。它们是教学示意，没有新增GPU、模型或生产遥测测量。

新增两段可直接复制运行的Python标准库代码：用Fraction复算SLI/预算，及复算逻辑线程的编号覆盖。后者不模拟CUDA调度，不输出GPU性能。既有完整CUDA与PyTorch示意、SQLite源码、规则文件及下载包均保持字节不变。

## 核对与证据

- 原始资料：Google SRE Workbook的[目标定义](https://sre.google/workbook/implementing-slos/)与[多窗口告警](https://sre.google/workbook/alerting-on-slos/)，NVIDIA的[编程模型](https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/programming-model.html)与[异步执行](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/asynchronous-execution.html)，[PyTorch 2.5.1 CUDA文档](https://github.com/pytorch/pytorch/blob/v2.5.1/docs/source/notes/cuda.rst)，以及Anthropic的[上下文工程说明](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)。核对日期2026-11-08；本轮中文解释、图和固定算例为本站组织。
- 两段新增代码实际在CPU标准库运行；编号另检查0、1、255、256、257、2500、2560、2561、5001九个边界。预算比例另按整数事件数核对，不把浮点打印误差当概念差异。
- 实际重跑context_state.py，核对正常恢复一次效果、错误新操作两次效果、旧版本写入零行、当前资料选择与撤回后零条结果。它不调用模型、身份平台或Kairo。
- 比较已发布基线8d5b31e：72章正文完全相同，三章原完整代码块按原顺序逐字保留，小节标题与URL不变；本轮仅增加两段代码。旧V50审阅在其已发布提交处继续核对，当前三章另外核对，不能因新编辑跳过历史检查。
- 已发布的两份COHERENCE审阅原始字节保持不变；新源文件与三章签名记录在CAUSAL_WALKTHROUGHS_2026-11-08.json。POST_WINDOW_BODY_REVIEWS仅追加三章审阅，原92条记录保留。

统一回归入口为`node scripts/check-all.cjs --pages`，含新增机制跟读检查后共42项。页面验收检查桌面与手机的正文、图解放大、代码复制、目录和跨章链接；实际截图、UI观察与发布记录存放工作区outputs。

真实读者试读仍为0。本轮改善解释与可复核性，不据此声明初学者已经掌握三领域，也不将本地算术、SQLite结果描述为云上、GPU或Kairo环境验证。
