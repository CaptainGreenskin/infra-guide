# AI Infra 课程对照与本轮修订

2026-11-09 对照参考站的公开学习路线、四个课程目录、面试目录、更新日志和计划。遍历各目录的分组，选读 Transformer 入门、GPU 与 CUDA 算子、训练通信与排程、推理引擎及各类面经的代表正文。章节导读和有实现的正文按各自交付范围比较。 [学习路线](https://caomaolufei.github.io/AIInfraGuide/guides/ai-infra学习路线/) · [更新日志](https://caomaolufei.github.io/AIInfraGuide/blog/update-log/) · [更新计划](https://caomaolufei.github.io/AIInfraGuide/about/roadmap/)

| 板块 | 参考站怎样展开 | InfraGuide 的差距与落点 |
| --- | --- | --- |
| 前置知识 | 从编程、数学与模型走到框架、GPU 和集合通信。Transformer 入门集中讲架构变体、注意力、前馈、位置、归一化与生成 | 已有分专题的推导和真实 CPU 数值。A1.1 需要把部件与工程问题连成一篇。Python 扩展的构建、链接与加载仍可补一条故障定位链。 [前置目录](https://caomaolufei.github.io/AIInfraGuide/prerequisites/) |
| CUDA 与算子 | 基础线程和存储模型之后，用 Reduce、GEMM、Softmax、Attention 对照实现，接到 Triton 与工具链 | A1.11 已有 CUDA 源码、编译与回读判据，A1.9 有在线归一的 CPU 对照。下一层是让同一个 GPU 输入经历朴素、分块与一种复用优化，记录数值、计时和计数器。Triton 仍缺可核对实现。 [CUDA 目录](https://caomaolufei.github.io/AIInfraGuide/cuda/) |
| 分布式训练 | 按集合通信、优化器、DP、ZeRO、TP/SP、PP、精度、长序列、专家和混合并行分类 | 已有 DDP 的全局目标与恢复、Gloo 归约、分片状态和八 rank 分组。A1.10 的前向时序需要接上反向与激活寿命。跨 rank 的长序列注意力仍需沿在线归一展开。 [分布式训练目录](https://caomaolufei.github.io/AIInfraGuide/distributed/) |
| 推理 | 从单请求到块缓存、连续批处理、量化、推测解码、多机推理，再沿固定版本追真实引擎的状态与调用 | 现有两层标量块池、原生 CPU SDPA、推测采样和交接预算能校验机制。还缺从一个请求追踪真实引擎的请求入队、缓存分配、执行结果和块回收，以及设备上同口径的部署比较。 [推理目录](https://caomaolufei.github.io/AIInfraGuide/inference/) |
| 面试 | 按公司与方向组织岗位和轮次，再分项目、原理和现场题 | 本站已有有出处的岗位样本、题目与评分。算子岗位可增加带尾块、数值判据和性能追问的限时任务，沿已有实验核对思路。 [面试目录](https://caomaolufei.github.io/AIInfraGuide/interview/) |

## 这次的三处正文修订

- **A1.1** 用一条续写路径解释词元、向量和候选分数，再比较三种架构的可见范围。四条工程学习线从模型部件直达后续章节。第 4 节手算合法位置的权重、内容汇总和两种归一化，第 7 节把同一小模型的生成记录拆成三轮。读者能复算两个提示词元加三个输出为什么只有四格已计算缓存。 [AI Infra 全貌](https://captaingreenskin.github.io/infra-guide/article/transformer-model/#ai-infra-map) · [CPU 生成记录](../dist/labs/sdpa-cache/validation.json)
- **A1.3** 先用中文语境建立可见位置，再跟原三位置手算。每个头读完整的输入向量，先推导投影权重拼列，再看程序怎样拆头和拼回。 [注意力](https://captaingreenskin.github.io/infra-guide/article/attention-mechanics/) · [原论文](https://arxiv.org/html/1706.03762#S3.SS2)
- **A1.10** 复用两阶段四微批题设，列出 GPipe 与 1F1B 的完整前向、反向及激活寿命。两种排程的前反向均为 10 槽，阶段激活峰值分别为 4/4 和 2/1。这里是等时算例，参数更新耗时另计。 [完整时序](https://captaingreenskin.github.io/infra-guide/article/tensor-parallel-math/#pipeline-training-schedules)

AI 侧栏及手机「本页目录」都能返回首章全貌。后续用同一输入、同一判据贯通 CUDA 实现、训练排程与推理引擎的走读。初学者能否按这条线复述并迁移，留给真实试读。 [试读办法](reader-trial/brief.md)
