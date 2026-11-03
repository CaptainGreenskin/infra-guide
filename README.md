# InfraGuide

面向初学者与面试准备者，一个网站，三条一级路线：Cloud Infra、AI Infra、Agent Infra。
首页优先进入 /outline/ 的12主题知识地图与完整大纲，或 /interview/ 的12问题复习框架，再深入章节与实验。
Agent课程以通用机制为基础，Kairo作为独立实践载体；具体实现仍待目标环境验收。

## 内容与验证

42章：Cloud 18、AI 15（训练10＋平台推理5）、Agent 6、综合实战3。
16张原创SVG，完整代码与实验包，迁移练习、官方来源、交互SLO/KV容量计算器与因果注意力演示。
每章沿问题、机制、具体例子、边界和验证展开。62个独立HTML页面，包含完整初始正文、canonical、分享元数据、结构化数据与sitemap。
原hash文章URL自动转到独立页面，并保留section参数。

实际证据：
- dist/labs/ddp/validation.json：CPU/Gloo训练、完整状态恢复对照、错误配置拒绝及同机双启动代理模拟。
- dist/labs/systems/validation.json：本地HTTP、版本提交、合成指标与契约、独立数据库间的Agent崩溃恢复。
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
training-deepening.js补充token到训练的桥梁、有效token归一化和KV复用边界。study-guides.js维护入门地图和面试复习。
新增内容通过chapter()声明，含id、编号、前置知识、学习出口、正文、练习、来源和关联章节。
HTML只供可信本地作者编写，不接收用户注入。

## 验证与资源生成

```sh
python3 scripts/build-system-labs.py
python3 scripts/build-attention-assets.py
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
