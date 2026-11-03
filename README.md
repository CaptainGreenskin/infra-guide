# CloudInfra Guide

中文 Cloud Infra + AI Infra 工程知识站。Agent Infra × Kairo 保持独立系列规划。

## 本版范围

8 个模块、20 篇内容，其中云上训练为 10 章深入教程，其余为基础导读。
专题包含 5 张原创 SVG、可复制代码、DDP 实验包、两机四卡运行手册、恢复对照与性能测量方法。
GPU/NCCL、混合精度、多物理节点和 Kubernetes 尚未实测。实际 CPU 结果见 dist/labs/ddp/validation.json。

## 本地运行

无需安装前端依赖或构建：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

访问 http://127.0.0.1:4173/ 。路由使用 hash，无需服务器重写规则。

## 文件

- dist/content.js：基础模块、导读和官方来源。
- dist/training-content.js：训练第 1—6 章与渲染辅助函数。
- dist/training-advanced.js：第 7—10 章，替换原训练入门条目并保留旧 URL。
- dist/training-exercises.js：迁移练习、参考答案和真实工作负载补充。
- dist/site-pages.js：主题、实验室、问题索引与内容建设路线。
- dist/app.js：路由、搜索、本地进度、交互示例和代码复制。
- dist/style.css、dist/course.css：桌面与手机阅读、浅色和深色主题。
- dist/labs/ddp/：完整训练代码、启动器、比较器和中文手册。
- scripts/build-training-assets.py：生成原创图、浏览器代码文本和实验 ZIP。
- scripts/verify-lab.py：执行 CPU/Gloo 验收，写入实际验证记录。
- scripts/check-content.cjs：检查文章标识、章节顺序和来源引用。

修改实验代码后先重跑相关验证，再运行资源生成器，避免正文和下载包不一致。
不要将虚拟环境、检查点、运行日志或私有项目代码放进 dist。

## 发布标准

深入教程包含问题、前置知识、机制与取舍、图解、实验或明确标注的示例、失败场景、自我检验与官方来源。
完整实验提供固定版本、命令、预期输出和验收条件。已执行、待验证与规划内容分别标示。
规划不计入完成数量，基础导读不自动标为已验证教程。

文章字段为 id、module、number、title、desc、level、tags、intro、sections、check、refs。
训练专题另有 group、objectives、prereq、minutes。HTML 仅供可信本地作者使用，不直接接收用户输入。
统计来自内容数组。新增章节后执行完整性检查。

## 验证

```sh
node --check dist/app.js
node --check dist/training-content.js
node --check dist/training-advanced.js
node --check dist/site-pages.js
node scripts/check-content.cjs
bash -n dist/labs/ddp/launch_2nodes.sh
```

在装有 PyTorch 2.5.1 的隔离 Python 环境中：

```sh
python scripts/verify-lab.py
python scripts/build-training-assets.py
```

CPU 验收覆盖两进程训练、连续训练与恢复完整状态相等、无效累积参数和不兼容恢复被拒绝；还覆盖两端启动脚本的同机四进程模拟。
本机合成任务的时间不是 GPU 或 LLM 基准。恢复仅支持固定 world size、固定配置、epoch 边界。

## 行为与来源

阅读进度、自我评估与主题只保存在当前浏览器。Google Fonts 不可用时回退本地字体。
结构参考 https://caomaolufei.github.io/AIInfraGuide/ 的章节树、正文与页内目录；文章、图和实验代码原创。
当前私有站点标识位于 .openai/hosting.json；更新复用同一站点，不改变访问范围。
