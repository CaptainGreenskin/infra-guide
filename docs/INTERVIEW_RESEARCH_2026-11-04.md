# 公开面试记录驱动的 Cloud 主线修订

核对日期：2026-11-04。线上入口 `/interview/experiences/`。

本轮读取腾讯、阿里、字节候选人的公开原帖，精选 15 个岗位语境样本，来自 14 篇不同原文；同篇博客中的腾讯 TEG 与阿里 ECS 分别标注，腾讯两篇同作者记录也不当作独立候选人。主要为 2024–2026 年材料，另列一篇 2020 年函数平台历史记录、一篇年份未核实 SRE 记录。

页面有 29 组题意转述，每组连接本站编写的答题要点、延伸问题与机制章节。没有使用转载答案、招聘 JD 或作者面试前预想的问题冒充现场提问。没有据小样本推算公司统一题型、出题频率或通过率。原帖仍是候选人自述，不是雇主认证题单。

## 课程重点

1. 共用底座先过关：Linux 进程/内存/文件、并发、TCP/DNS、SQL/缓存、一门语言和现场编码。
2. Cloud / SRE 主干走通执行链：容器 → 控制面 → 工作负载与调度 → Service 与网络 → 卷与恢复 → 弹性与交付 → SLO/排障。
3. AI 与 Agent 按岗位深入：计算图/显存/算子/通信，或权限/持久执行/沙箱/评估；仍保留通用系统基础。
4. Serverless 是平台知识中的独立部分。近年直接岗位面经证据有限，不能把普通容器提问改标为近年 Serverless 真题。

Cloud 重新组织成 C0–C7 八个模块、28 章；C0 为可跳过的系统前置，从 C1.1 总览进入。新增六篇完整主干文章：容器运行、Kubernetes 工作负载、网络、存储、扩缩容、Serverless 事件。旧文章 URL 保持，章节号采用独立 C 前缀，避免与 AI/Agent 编号混淆。

## 已完成的证据

- 网站结构、内部链接、主题侧栏、页面 metadata 与 sitemap：66 章、96 个完整 HTML 页面。
- 7 个 Kubernetes 对象对照上游 v1.34.0 OpenAPI 离线校验；识别上游 int-or-string 格式，并检查 selector、命名端口、HPA 目标等对象关系。
- 本地实验使用标准库：真实 HTTP 健康路径与 SIGTERM、SQLite 单库事务、提交后真实进程退出、重投返回旧结果、同 ID 异参拒绝、独立新事件、HPA/积压/用量手算与非法分母，共 7 组检查。
- 最大栈原创参考实现检查重复最大值、负数、空操作与输入契约；明确动态数组 push 为均摊常数时间。
- 三幅原创 SVG 说明 Pod 生命线、Service 路径、扩容与积压；桌面和 390px 移动端检查跳转、展开、文章侧栏与横向溢出。

本轮没有真实 Docker/Kubernetes、CNI/CSI、云消息队列、GPU 或 Kairo 实机环境，清单结构检查与本地事务不扩展为这些环境的运行证据。

## 尚需按题目价值继续深化

- TCP 状态机、连接异常与 epoll 机制的独立深入章节，而非只在排障文章中引用。
- MySQL redo/binlog、复制确认、死锁与真实恢复演练；现有 SQLite 实验不能代替 MySQL。
- 更多限时编码：TTL/LRU、单调队列、树/图、日志聚合、语言并发原语；目前不能声称覆盖全部编码面。
- Kubernetes 在目标 CNI/CSI 下的实际故障注入、节点扩容与排空时序。
- IaC 状态/漂移/变更评审，以及更多有明确岗位与年份的社招公开样本。

## 复查命令

```
python3 scripts/verify-cloud-native.cpython.py
python3 dist/labs/interview-coding/max_stack.py
node scripts/render-pages.cjs
node scripts/check-content.cjs
node scripts/check-public-pages.cjs
node scripts/check-textbooks.cjs
node scripts/check-cloud-course.cjs
git diff --check
```

维护者 schema 校验脚本依赖本机 PyYAML、jsonschema，并在首次执行时获取固定上游 schema；读者下载的本地实验仅用 Python 标准库。源码摘要、实验环境、范围与实际输出见 `dist/labs/cloud-native/validation.json` 和 `schema-check.json`。
