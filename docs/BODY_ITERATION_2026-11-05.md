# 第43轮：把概念顺序落实到正文

本轮范围是六章正文，每条主线两章。替换20个原编号小节的正文，并在7处继续补充推导、反例或实战；保留原编号与锚点。不是把“开头已有概念段”视为正文已完成。

|方向|章节|正文推进方式|
|---|---|---|
|Cloud|云网络|名字/IP/端口 → 通信层次 → 解析缓存与连接 → CIDR位与集合 → 最长前缀和回程 → 五元组与NAT → 路由程序与诊断|
|Cloud|Kubernetes控制面|对象字段 → 组件负责什么 → UID/版本/期望代次 → 重新观察与调谐 → 放置/启动/就绪 → 端点条件 → 模型与集群观察命令|
|AI|注意力|Q/K/V与行列 → 点积与每行归一化 → 纸笔输出 → 填充和监督的不同约束 → 缓存绝对位置 → 分头的具体坐标 → 真实CPU对照|
|AI|解码器块|两次残差 → 标量变化率 → 归一化统计量与轴 → FFN/SwiGLU → 参数账 → 每层实际数值 → 首个不同中间量定位|
|Agent|上下文与记忆|模型参数/输入/存储的关系 → 完整请求预算 → 必要事实和材料选择 → 压缩保留语义 → 来源版本与撤回 → 原SQLite程序验证|
|Agent|持久工作流|工作流/活动/命令/事件 → 有序历史 → 已完成结果复用 → 实际提交前后退出 → 命令相容性 → 原外部效果与接管实验|

六章的学习出口和建议阅读预算同时调整。建议时间用于首次理解正文，不意味着可在同一时间内完成环境准备、全部源码和实战。

## 图与程序

新增六张原创SVG：地址位与前缀、控制状态表、缓存mask网格、解码器首次差异矩阵、上下文预算条、历史提交边界。组成、状态、数值、预算、时间关系分别采用相应表达，避免所有内容都画成同一种方框箭头。

新增五个可运行程序，集中在 `dist/labs/mechanism-walkthroughs`：

- `route_walk.py`：实际执行地址集合与选择规则，覆盖/0、/24、/32、表格顺序、无回程和同前缀拒绝；是规则模型，未配置VPC。
- `reconcile_walk.py`：检查重复唤醒收敛、无需动作时不写回、版本冲突、同名新UID与就绪数；是本地控制状态模型，未调用Kubernetes API。
- `attention_trace.py`：PyTorch 2.5.1 CPU float64实际执行，手算输出与SDPA最大差0；另检查未来扰动、无效key、错误缓存mask、非对称Q/K方向与分头坐标。
- `decoder_trace.py`：实际追踪664参数模型，核对四种形状相容错误、零分支、归一化、SwiGLU与标量梯度。依赖的 `tiny_decoder.py` 与原模型逐字节相同。
- `workflow_history.py`：真实SQLite历史库、独立调用计数库与子进程退出；结果记录后恢复使用23，结果未记录后重做读取得到999。活动只读资料、生成文字，不是Temporal SDK或Kairo执行。

上下文与记忆章继续使用原 `context_state.py` 的真实SQLite验证，避免重复造一份相同实验。新的组装接口示例用声明成本的独立计数夹具执行检查；未把它写成真实模型分词器测量。

## 本轮复核的主要技术来源

按官方文档和固定版本源码核对，不搬运第三方教程正文：

- [Amazon VPC路由优先级](https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html)：最长前缀与同前缀来源规则分开；本地模型不猜测未实现的产品优先级。
- [Kubernetes控制器](https://kubernetes.io/docs/concepts/architecture/controller/)、[API资源版本](https://kubernetes.io/docs/reference/using-api/api-concepts/#resource-versions)：对象观察、期望和并发条件分开；不同资源的代次语义查对应API。
- [PyTorch 2.5.1 SDPA源码与文档](https://raw.githubusercontent.com/pytorch/pytorch/v2.5.1/torch/nn/functional.py)、[归一化源码与文档](https://raw.githubusercontent.com/pytorch/pytorch/v2.5.1/torch/nn/modules/normalization.py)：布尔mask、非方阵对齐、dropout=0、特征轴与ε均与本次环境对齐。
- [Anthropic上下文工程](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)：借鉴按任务维护有限输入的方法。8192及各项预算是本站教学题设，未引用为某个产品上限。
- [Temporal工作流定义](https://docs.temporal.io/workflow-definition)：核对重放与命令相容性的职责。本地解释器只检查自己声明的身份、类型与顺序，不声称实现完整SDK语义。

## 检查与维护

执行 `INFRA_WALK_TORCH_PYTHON=../ddp-step-env/bin/python node scripts/check-all.cjs --pages`，包括实际CPU张量重跑、标准库与进程重跑、独立数学判据、源码/内嵌/ZIP一致性、历史审阅连续性和Pages路径。完整命令当前有33项检查；实验目录59项任务、26个包，84份源码或输入引用绑定执行摘要，3份目标环境文件继续明确待验。

本地浏览器逐一查看六张图，检查桌面正文、390px手机公式与源码、实验锚点定位、代码复制和整页宽度。新增运行锚点采用与固定页头匹配的滚动间距；旧小节和深链接保留。

审阅见 [POST_WINDOW_BODY_REVIEWS.json](POST_WINDOW_BODY_REVIEWS.json)。旧8小时审阅与完成数字保持原样，后续正文修订按内容摘要连续关联。没有新增人类读者掌握效果或真实GPU/VPC/Kubernetes/Kairo验收结论。

## 接下来的正文优先顺序

1. Cloud容器原理与调度资源：进程、视图、资源记账、挂载、放置条件与实际观察逐层展开。
2. AI GPU执行与Roofline：先追踪线程与数据位置，再推导计算/字节单位，最后做目标设备分析。
3. Agent工具权限与检索排序：先讲主体和对象、查询和候选，再走协议与数值，最后接已有HTTP和SQLite实验。

其他章节按已有依赖继续复核。章节长短用于定位可能缺口，最终仍以推理是否连贯、示例是否能跟算和结果是否可独立验证判断。
