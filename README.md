# InfraGuide

给中文初学者和面试准备者的基础设施学习站：**Cloud Infra、AI Infra、Agent Infra**。
先讲系统知识，再用图、手算、代码和故障实验把机制走通。

[在线阅读](https://captaingreenskin.github.io/infra-guide/) · [学习大纲](https://captaingreenskin.github.io/infra-guide/outline/) · [复习路线](https://captaingreenskin.github.io/infra-guide/roadmap/) · [实验室](https://captaingreenskin.github.io/infra-guide/labs/)

## 学什么

| 方向 | 内容 |
| --- | --- |
| Cloud Infra | 系统基础、虚拟化、网络、存储与数据库、Kubernetes、Serverless、IaC/GitOps、安全、容量与SRE |
| AI Infra | Transformer与GPU基础、分布式训练、数据/通信/检查点、作业调度、KV缓存、模型推理与发布 |
| Agent Infra | 运行时、工具契约、幂等与恢复、多worker接管、权限、上下文、检索、评估与沙箱；结合Kairo设计接入验收 |

当前66章：Cloud 28、AI 25、Agent 10、综合实战3。领域入口提供系统知识，详细文章按机制展开。内容正在持续精修，质量以解释是否清楚、例子能否复算和代码是否对应为准。

## 本地运行

前端没有安装依赖的步骤。需要Node.js 20+和Python 3.9+：

```sh
node scripts/render-pages.cjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。`dist`也可以直接部署到支持目录`index.html`的静态托管服务。

## 做一次实验

下载的完整程序、环境、运行结果和源码摘要都在`dist/labs`。下列程序彼此独立，可按章节选择：

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
| `dist/*.js` | 课程数据、知识正文、渲染与交互源码 |
| `dist/diagrams/` | SVG图 |
| `dist/labs/` | 实验源码、下载包、执行记录 |
| `scripts/` | 页面生成、内容检查与实验验证 |
| `docs/` | 内容审阅与迭代记录 |
| `dist/**/index.html` | 生成的100个独立页面；由内容脚本重新生成 |

修改正文后：

```sh
node scripts/render-pages.cjs
node scripts/check-content.cjs
node scripts/check-public-pages.cjs
node scripts/check-textbooks.cjs
node scripts/check-cloud-course.cjs
node scripts/check-knowledge-resources.cjs
node scripts/check-mechanism-models.cjs
node scripts/check-cloud-deepening.cjs
node scripts/check-cloud-operations.cjs
node scripts/check-ai-agent-systems.cjs
node scripts/check-learning-mechanisms.cjs
node scripts/check-serving-consistency.cjs
node scripts/check-editorial-evidence.cjs
```

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
