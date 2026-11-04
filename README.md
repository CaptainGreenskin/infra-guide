# InfraGuide

面向初学者与面试准备者，一个网站，三条一级路线：Cloud Infra、AI Infra、Agent Infra。
首页优先进入 /outline/ 的12主题知识地图与完整大纲，或 /interview/ 的12问题复习框架，再深入章节与实验。
Agent课程以通用机制为基础，Kairo作为独立实践载体；具体实现仍待目标环境验收。

## 内容与验证

60章：Cloud 22、AI 25（模型/GPU基础10＋训练10＋平台推理5）、Agent 10、综合实战3。
27张原创SVG，完整代码与实验包，迁移练习、官方来源、交互SLO/KV容量计算器与因果注意力演示。
每章沿问题、机制、具体例子、边界和验证展开。86个独立HTML页面，包含完整初始正文、canonical、分享元数据、结构化数据与sitemap。
原hash文章URL自动转到独立页面，并保留section参数。

实际证据：
- dist/labs/ddp/validation.json：CPU/Gloo训练、完整状态恢复对照、错误配置拒绝及同机双启动代理模拟。
- dist/labs/systems/validation.json：本地HTTP、版本提交、合成指标与契约、独立数据库间的Agent崩溃恢复。
- dist/labs/ddp-step/validation.json：真实两进程CPU/Gloo单步实验，同量/非等量、关闭同步和全局分母修正；对照手算与单进程全局batch。
- dist/labs/attention/validation.json：固定Q/K/V的因果注意力、前缀KV复用等价性、非等量有效样本归一化与有限差分对照；Python标准库数值实验。

未验证：真实GPU/NCCL、GPU混合精度、多物理节点、Kubernetes、真实模型推理、Kairo、多worker/fencing与断电耐久性。
本地实验不替代这些环境的验收；页面与下载包明确说明范围。

## 本地预览

无需安装前端依赖。编辑后用同一套页面函数生成静态正文，再启动预览：

```sh
node scripts/render-pages.cjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

独立页面使用目录中的index.html，不依赖SPA重写。阅读进度、主题与自评勾选只保存在当前浏览器。
章节阅读记录由读者主动下载，不自动发送。当前没有访问分析或服务端反馈数据库。

## 内容组织

src/page-shell.html维护页面外壳和脚本顺序；dist/index.html及各路由index.html是生成物，不直接编辑。
脚本按依赖加载：原始模块与训练内容 → 实验文本 → curriculum公共定义 → Cloud/AI/Agent/实战章节 → finalize → 训练补充 → 页面与交互。
curriculum-finalize.js保留训练章节，并用完整课程替换早期导读。
training-deepening.js补充token到训练的桥梁、有效token归一化和KV复用边界。study-guides.js维护入门地图和面试复习。guided-lessons.js深化请求、生成和Agent任务三个样章；guided-foundations.js深化资源、DDP与恢复。guided-diagnostics.js 深化网络排查、显存预算和 Agent 权限。九章均有必要术语和面试追问。
新增内容通过chapter()声明，含id、编号、前置知识、学习出口、正文、练习、来源和关联章节。
HTML只供可信本地作者编写，不接收用户注入。

## 验证与资源生成

```sh
python3 scripts/build-system-labs.py
python3 scripts/build-attention-assets.py
python3 scripts/build-guided-diagrams.py
python3 scripts/build-resource-diagram.py
python3 scripts/build-ddp-step-assets.py
node scripts/render-pages.cjs
node scripts/check-content.cjs
node scripts/check-public-pages.cjs
```

修改系统实验程序后：

```sh
python3 scripts/build-system-labs.py --verify
```

它运行真实本地实验、记录环境和源码SHA256，再生成浏览器源码文本与ZIP。普通打包拒绝证据摘要不匹配。
修改注意力实验后运行python3 scripts/build-attention-assets.py --verify，再重新生成页面和运行检查。
修改DDP实验后，在隔离的PyTorch 2.5.1环境运行scripts/verify-lab.py，再运行scripts/build-training-assets.py。
图生成器为build-training-assets.py、build-system-diagrams.py和build-agent-diagrams.py。
不将虚拟环境、检查点、私有项目代码或凭据放入dist。

## 发布与维护

沿用.openai/hosting.json中的现有Site，当前public访问范围保持不变。
发布前检查章节/链接/来源/资源/代码摘要、计算边界、62个完整HTML页面及浏览器交互。
独立URL与sitemap支持抓取和分享，不代表搜索引擎已收录，也不代表已有真实读者。
版本与事实变化时重查官方资料，并重跑受影响实验。
结构参考AIInfraGuide；文章、图与实验代码独立编写。

## 渐进样章与后续迭代

当前深入样章为1.1请求路径、1.2资源与隔离、6.2 DDP与并行策略、7.3模型生成、9.1 Agent任务、9.2 Agent恢复。它们采用同一个具体场景贯穿章节，必要术语就近解释，最后给出可展开的面试追问。
维护时先检查：为什么需要这个机制、输入/状态/输出如何变化、例子能否手算、反例推翻了哪个假设、哪些结论尚未在目标环境验证。
类比须注明边界；图、表和代码使用一致的场景与数字。增加内容应弥补解释断层，不以字数或章节数作为质量目标。
网络排查、显存预算和 Agent 权限已完成本轮深化。面试准备后续优先补编码、数据库诊断及完整设计练习，再按读者的实际卡点调整。其余章节已有机制、练习和来源，但不能据此声称都已完成渐进样章改写。
持续优化的阶段目标、读者验证与发布门槛见docs/IMPROVEMENT_PLAN.txt。
DDP单步程序修改后，用安装PyTorch 2.5.1的Python运行scripts/build-ddp-step-assets.py --verify；普通打包会校验源码摘要。

2026-11-04：新增网络排查、显存预算、Agent 权限导读。用 `python3 dist/labs/network-timing/timing_lab.py` 和 `python3 dist/labs/permissions/policy_lab.py` 复跑本地实验。提交新的 validation.json 后运行 `node scripts/render-pages.cjs`，页面用同一份记录生成。

面试工作台提供复习路线、腾讯/阿里/字节的岗位对照，以及编码、数据库、系统设计三个工作坊。用 Python 运行 dist/labs/interview-coding/dependencies.py 和 dist/labs/interview-database/query_lab.py 复做现场题。

教材扩写包含18篇新课与29篇既有正文改写。模型/GPU基础覆盖十篇连续课，Cloud 深入内存/并发/SQL/缓存，Agent 深入事件重放/检索/轨迹/隔离。验证本轮代码先运行 node scripts/extract-textbook-code.cjs，再用 scripts/verify-textbook-labs.py --torch-python 指定已安装 PyTorch 2.5.1 的 Python。
