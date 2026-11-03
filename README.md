# CloudInfra Guide

中文云计算、云原生、SRE 与云上 AI 训练知识站原型。

## 运行

无需构建或安装依赖。在本目录执行：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

然后访问 http://127.0.0.1:4173/ 。支持部署到提供静态文件托管的服务。路由使用 URL hash，不需要服务器重写规则。

## 文件

- `dist/index.html`：页面入口与全局导航。
- `dist/style.css`：响应式布局、浅色和深色主题。
- `dist/content.js`：8 个模块、12 篇文章和官方参考资料。
- `dist/app.js`：首页、模块、文章、路线、搜索、进度与交互示例。

新增文章时，在 content.js 的 articles 中填写唯一 id、已有 module ID、number、title、desc、level、tags、intro、sections、check 与 refs。sections 的 HTML 仅用于受信任的本地作者内容，不应直接接收用户提交的 HTML。refs 对应 sources 中的键。

当前首页与侧栏的 8 / 12 为首版编辑文案；扩充模块或文章时同步更新，或改为读取数组长度。

## 当前范围

包含云基础、计算、VPC 与存储、Kubernetes 与交付、SLO 与排障、GPU 集群与并行训练、AI 平台工程和恢复设计实验。内容是入门讲解与设计型练习，并非完整生产部署教程。扩展效率的默认数值为练习输入，不是硬件基准。

阅读进度、自检与主题只保存于当前浏览器 localStorage。没有后端账号或跨设备同步。字体从 Google Fonts 加载，无法访问时使用本地中文字体回退。

## 参考与原创内容

结构借鉴 https://caomaolufei.github.io/AIInfraGuide/ 的专题导航、章节树、正文与页内目录；未复制其文章、图片或品牌。本站文章为原创教学内容，各篇附官方资料链接。创建日期：2026-11-03。

## 验证

已完成 JavaScript 语法与内容引用检查，验证章节导航、搜索、阅读进度持久化、主题切换、GPU 拓扑切换、扩展效率计算与无效输入提示，并检查桌面和手机布局。
