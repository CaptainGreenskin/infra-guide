# InfraGuide

给中文初学者和面试准备者的基础设施学习站：**Cloud Infra、AI Infra、Agent Infra**。
先定义概念和关系，再讲系统机制，用图、手算、代码和故障实验把它走通。

[在线阅读](https://captaingreenskin.github.io/infra-guide/) · [学习大纲](https://captaingreenskin.github.io/infra-guide/outline/) · [复习路线](https://captaingreenskin.github.io/infra-guide/roadmap/) · [实验室](https://captaingreenskin.github.io/infra-guide/labs/)

## 学什么

| 方向 | 内容 |
| --- | --- |
| Cloud Infra | 系统基础、虚拟化、网络、存储与数据库、Kubernetes、Serverless、IaC/GitOps、安全、容量与SRE |
| AI Infra | Transformer与GPU基础、分布式训练、数据/通信/检查点、作业调度、KV缓存、模型量化、推理与发布 |
| Agent Infra | 运行时、工具契约、幂等与恢复、多worker接管、权限、上下文、检索、评估与沙箱；结合Kairo设计接入验收 |

当前78章：Cloud 35、AI 29、Agent 11、综合实战3；45个完整实验包、85项学习任务。三个方向入口直接进入第一章，侧栏直接进入正文；领域知识页用于查阅概念和关系，详细推导按需展开。14张领域关系图前置，图和文字共用100个节点、87条关系。[学习路线](https://captaingreenskin.github.io/infra-guide/roadmap/)提供完整课程和7条岗位路线：云平台、SRE、训练、推理、算子、Agent应用、Agent平台，自动补齐必要先修。选择岗位后，本文目录和上下章继续保留该路线。Agent不以完成Cloud或GPU训练课程为前提。

这轮[状态、存储与继续执行](docs/ITERATION_2026-11-08_PERSISTENCE_LEARNING.md)重写存储恢复、Kubernetes存储、自动求导、训练内存与持久工作流五章，沿对象、状态、正常执行和完整程序连续展开。19章由正文自然定义概念，原预览保留为章末回顾；独立算例、框架恢复和真实环境范围分别说明。

<details>
<summary>历次内容修订与执行记录</summary>

这轮[从对象关系到实际执行](docs/ITERATION_2026-11-08_EXECUTION_READING.md)继续重排Decoder、位置编码、Agent执行环境与恢复的正文，并把云服务实战接到原生kind请求、探针、发布和回退。14章将概念预览收为章末回顾，完整源码和证据按需展开；正文、搜索、图谱跳转保留已选岗位路线。

这轮[逐层讲解与连续阅读](docs/ITERATION_2026-11-08_PROGRESSIVE_READING.md)统一全站小节的概念名称，使正文、本文目录和搜索结果使用同一套标题；计算资源、Kubernetes、分词与嵌入、注意力、Agent权限和记忆六章重排整章解释。九个已独立介绍对象的章节把概念预览收为章末回顾，代码和完整实验按需展开。

本轮[概念层次与精炼阅读](docs/ITERATION_2026-11-08_CONCEPT_READING.md)统一78章导航短名，14张图直接标明关系，三个入门章先讲组件与正常过程，再读推导与实战；原生DCP、SDPA、LangGraph与ServiceAccount/RBAC分别接回对应机制，详细证据按需展开。

本轮新增[协调存储、数据库复制与MCP协议](docs/ITERATION_2026-11-08_STATE_PROTOCOL.md)三个独立章：先解释对象、版本和执行链，再读真实etcd/MySQL/官方MCP SDK。原生Linux CI核对网络分区、快照后重新观察、复制应用落后和受控写入交接；SDK实跑两代版本、进度、取消与独立结果验收。保留原75章的正文、编号和公开链接，新增内容纳入领域图谱、先修与岗位路线。

上一轮[把机制接到真实实现](docs/ITERATION_2026-11-08_IMPLEMENTATION_BRIDGES.md)：云网络沿两段连接、排空和重试走到HTTP代理；推理沿物理块、引用和写时复制走到真实CPU注意力；工作流沿计划、事实、等待和审批走到新进程恢复。三个实验均有独立结果检查、失败对照、图解和完整源码。长章节的桌面、手机目录支持正文小节定位，保留旧锚点和岗位路线。

训练并行章另有[双进程手工分片实验](https://captaingreenskin.github.io/infra-guide/article/distributed-training/#manual-sharding-run)：三个更新逐项对照独立完整批次的梯度、参数和SGD动量，并保留错误分母的失败对照。它实际运行CPU/Gloo，不把手工算法写成FSDP或GPU显存实测。

上一轮[深化容量、Roofline与Agent观测](docs/ITERATION_2026-11-08_SYSTEM_BUDGETS.md)，先把对象、单位和因果讲清，再跟读原有程序；补四张图并重放本地实战，保留各环境验证边界。

前一轮[精修三章正文](docs/ITERATION_2026-11-08_CAUSAL_WALKTHROUGHS.md)：沿同一组输入讲清SLO事件与预算、GPU执行和计时、Agent状态与记忆，再跟读已有完整实验。新增四种图解、两段标准库算例；保留已发布代码与真实环境边界。

全站[概念关系与易读性修订](docs/ITERATION_2026-11-08_READABILITY.md)把95个领域知识点和5组前置基础连接起来，修正6章的跨章引用、解释衔接与错误分层。目录按领域组织，连续阅读按先修顺序推进，旧URL及小节锚点保留。

C5.2消息投递、C6.2 Terraform状态、C6.3 GitOps调谐配有[隔离Linux CI](https://github.com/CaptainGreenskin/infra-guide/actions/runs/42445552027)：实际运行RabbitMQ、Terraform官方local提供程序、kind内Argo CD，分别核对运输确认与业务效果、状态与实际文件、声明同步与真实HTTP版本。完整代码、反例、图和结果使用同一组输入；本地状态和单机kind不当作生产云验收。详见[机制章审阅](docs/ITERATION_2026-11-08_DELIVERY.md)。

已有实验包括Linux TCP/epoll、MySQL日志恢复、Docker资源与Kubernetes调度、CPU/Gloo训练恢复、手写算子与MoE进程分发、精确推测采样、Agent授权与崩溃窗口、中文检索及实际分词预算。CUDA/Nsight、GPU/NCCL、物理多节点、云CNI/CSI、生产负载和Kairo接入分别保留待验范围，不由CPU或kind结果推断。

</details>

[首批15分钟试读材料](docs/reader-trial/brief.md)已准备，当前真人试读样本0人。检查和作者审读用于发现错误，读者能否独立画出知识关系、解释条件并完成迁移题，仍需实际试读验证。

本次集中迭代的修订范围、执行证据和待验缺口见 [8小时迭代交付清单](docs/EIGHT_HOUR_ACCEPTANCE_2026-11-05.md)。

后续内容按 [中文初学者编写规则](docs/CONCEPT_FIRST_AUTHORING.md) 维护：入口和每章先讲对象与依赖，再进入机制和案例。本轮[高关注项目复核](docs/GITHUB_RESEARCH_2026-11-05.md)与[概念修订记录](docs/CONCEPT_REVIEW_2026-11-05.json)单独保留。

正文继续按这条顺序修订：[六章机制与实战迭代](docs/BODY_ITERATION_2026-11-05.md)覆盖云网络、Kubernetes控制面、注意力、解码器、上下文与持久工作流，附六张图和五个可运行程序。

目录与学习路线按 **P0/C1–C9、A1–A3、G1–G10、S1–S3** 组织；量化已独立成章。首页负责选择方向，大纲提供地图与完整章节，旧 `/start/` 自动回到首页。修改编号和归属时维护 `dist/course-map.js`；旧链接迁移与审阅边界见 [结构迭代记录](docs/STRUCTURE_ITERATION_2026-11-07.md)。

## 配套独立项目

从 [自动微分与训练](https://captaingreenskin.github.io/infra-guide/article/autograd-training/) 或 [Transformer 模块](https://captaingreenskin.github.io/infra-guide/article/transformer-block/) 读到梯度更新和因果注意力时，可以转到 [One GPU LM](https://github.com/CaptainGreenskin/one-gpu-lm)，跟着实验从随机权重训练一个中文小模型。训练代码与原始结果由该仓库维护。[首次 RTX PRO 6000 实测](https://github.com/CaptainGreenskin/one-gpu-lm/tree/main/experiments/002-first-train/results/pro6000-first) 记录了 100 步训练的吞吐、显存和验证损失。

## 本地运行

前端没有安装依赖的步骤。需要Node.js 20+和Python 3.9+：

```sh
node scripts/render-pages.cjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。`dist`也可以直接部署到支持目录`index.html`的静态托管服务。

## 做一次实验

下载的完整程序、环境、运行结果和源码摘要都在`dist/labs`。下列程序彼此独立，可按章节选择。[实验目录](https://captaingreenskin.github.io/infra-guide/labs/) 按三个方向整理学习任务，注明先修、环境、观察目标与本机/目标环境证据；同一个 ZIP 可能含多个独立程序：

```sh
# Python标准库
python3 dist/labs/ai-agent-systems/gqa_serving.py
python3 dist/labs/ai-agent-systems/worker_fencing.py
python3 dist/labs/ai-agent-systems/agent_evaluation.py
python3 dist/labs/learning-mechanisms/tcp_framing.py
python3 dist/labs/learning-mechanisms/checkpoint_commit.py
python3 dist/labs/learning-mechanisms/approval_receipt.py
python3 dist/labs/serving-consistency/cache_outbox.py
python3 dist/labs/serving-consistency/serving_scheduler.py
python3 dist/labs/serving-consistency/retrieval_pipeline.py

# 已安装PyTorch的环境；本次验证基线是2.5.1 CPU
python dist/labs/ai-agent-systems/token_ddp.py
```

它们分别验证GQA全量/增量对照、接收方代际与崩溃恢复、真实报告与引用验收、两个CPU/Gloo进程的全局梯度，以及TCP解帧与半关闭、同一步检查点、审批声明与工具回执。另有存储恢复、事件重投、Terraform、Prometheus规则和完整DDP训练实验。

每个实验说明自己的范围。本地CPU与SQLite结果不代表已验证GPU/NCCL、物理多机、生产推理、远端工具或真实Kairo；Kairo目前提供待接入契约。

## 修改与检查

| 路径 | 用途 |
| --- | --- |
| `src/page-shell.html` | 页面外壳与脚本依赖顺序 |
| `dist/*.js`（除 `runtime-*.js`） | 课程数据、知识正文、渲染与交互规范源码 |
| `dist/diagrams/` | SVG图 |
| `dist/labs/` | 实验源码、下载包、执行记录 |
| `scripts/` | 页面生成、内容检查与实验验证 |
| `docs/` | 内容审阅与迭代记录 |
| `dist/**/index.html` | 生成的119个页面（118个规范入口与1个旧入口兼容页）；由内容脚本重新生成 |

修改正文后，用与 CI 相同的入口检查。`--pages` 另检查 GitHub 项目路径：

源码保留检查会对照已发布的Git基线；CI获取完整历史，浅克隆需要先补齐历史。

```sh
node scripts/check-all.cjs --pages
```

此命令重新生成页面，再执行全部内容与路径检查；不会安装 PyTorch 或冒充重跑需要额外环境的实验。普通标准库实验会按各检查的实际逻辑复跑，外部工具及 PyTorch 记录按源码摘要、独立算式和下载包复核；修改相关程序后仍需按实验说明实际重跑。

浏览器加载的 `dist/runtime-*.js`、`runtime-manifest.json` 和各目录 HTML 都是生成物。修改规范内容文件后运行上述命令，不手改合并脚本。顺序来自 `src/page-shell.html`；新增课程脚本后，运行时检查会比较合并前后全部路由。

修改本轮实验后，用已有PyTorch环境重新执行并生成对应的源码包与记录：

```sh
python3 scripts/verify-ai-agent-systems.py --torch-python /absolute/path/to/venv/bin/python
node scripts/render-pages.cjs
```

三个独立机制实验更新后，运行 `python3 scripts/verify-learning-mechanisms.py` 重建网站源码、执行记录和ZIP。阅读页提供目录、标准/大字和专注模式，图解可在原页放大与滑动。

缓存/outbox、推理迭代调度与检索链路更新后，运行 `python3 scripts/verify-serving-consistency.py`，同步完整代码、实际输出和下载包。三个程序分别说明本地SQLite、固定成本模型与受控检索夹具的范围。

其他实验有各自的验证脚本。变更源码后应更新实际结果和摘要，不能沿用旧的通过记录。

## 内容标准

- 中文先讲清概念，必要英文术语就近解释。
- 一个小节解决一个问题，图、公式和代码围绕同一例子展开。
- 计算给出变量、单位和假设；用反例检查结论。
- 完整代码可下载，教学模型与真实环境实测分别说明。
- 优先引用论文和官方文档；不以篇数、字数或未经核实的面试覆盖率代替质量。

本站正文、图与实验独立编写。欢迎通过Issue指出难懂的段落、错误和可复现的改进。

## GitHub Pages 自动发布

推送到`main`后，`.github/workflows/pages.yml`会生成页面、运行内容检查，再发布GitHub Pages。
使用标准Ubuntu运行器；部署包仅保留1天，不配置缓存或付费运行器。

本地检查项目子路径：

```sh
node scripts/build-github-pages.cjs
node scripts/check-github-pages.cjs
python3 -m http.server 4174 --bind 127.0.0.1 --directory .pages
```

打开`http://127.0.0.1:4174/infra-guide/`。构建产物在`.pages/infra-guide`，不提交生成目录。
网页右上角的GitHub入口始终指向本仓库。
