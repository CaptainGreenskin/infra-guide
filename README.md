# InfraGuide

一个网站，三条一级路线：Cloud Infra、AI Infra、Agent Infra。
Agent课程以通用机制为基础，Kairo作为独立实践载体；具体实现仍待目标环境验收。

## 内容与验证

42章：Cloud 18、AI 15（训练10＋平台推理5）、Agent 6、综合实战3。
14张原创SVG，完整代码与实验包，迁移练习、官方来源、交互SLO和KV容量计算器。
每章沿问题、机制、具体例子、边界和验证展开。保留原文章URL。

实际证据：
- dist/labs/ddp/validation.json：CPU/Gloo训练、完整状态恢复对照、错误配置拒绝及同机双启动代理模拟。
- dist/labs/systems/validation.json：本地HTTP、版本提交、合成指标与契约、独立数据库间的Agent崩溃恢复。

未验证：真实GPU/NCCL、GPU混合精度、多物理节点、Kubernetes、真实模型推理、Kairo、多worker/fencing与断电耐久性。
本地实验不替代这些环境的验收；页面与下载包明确说明范围。

## 本地预览

无需安装前端依赖或构建：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

hash路由无需重写。阅读进度、主题与勾选只保存在当前浏览器。

## 内容组织

index.html按依赖加载：原始模块与训练内容 → 系统实验文本 → curriculum公共定义 → Cloud/AI/Agent/实战章节 → finalize → 页面与交互。
curriculum-finalize.js保留训练章节，并用完整课程替换早期导读。
新增内容通过chapter()声明，含id、编号、前置知识、学习出口、正文、练习、来源和关联章节。
HTML只供可信本地作者编写，不接收用户注入。

## 验证与资源生成

```sh
node scripts/check-content.cjs
python3 scripts/build-system-labs.py
```

修改系统实验程序后：

```sh
python3 scripts/build-system-labs.py --verify
```

它运行真实本地实验、记录环境和源码SHA256，再生成浏览器源码文本与ZIP。普通打包拒绝证据摘要不匹配。
修改DDP实验后，在隔离的PyTorch 2.5.1环境运行scripts/verify-lab.py，再运行scripts/build-training-assets.py。
图生成器为build-training-assets.py、build-system-diagrams.py和build-agent-diagrams.py。
不将虚拟环境、检查点、私有项目代码或凭据放入dist。

## 发布与维护

沿用.openai/hosting.json中的现有Site，当前public访问范围保持不变。
发布前检查章节/链接/来源/资源/代码摘要、计算边界及浏览器交互。
版本与事实变化时重查官方资料，并重跑受影响实验。
结构参考AIInfraGuide；文章、图与实验代码独立编写。
