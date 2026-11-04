# AI / Agent systems: run, compare, inspect effects

本包提供四个完整程序。Python 3.9+；`token_ddp.py`另外需要PyTorch。
本次运行版本为Python 3.12.13 / PyTorch 2.5.1 CPU（以validation.json实际记录为准）。
不下载模型、不调用付费API、不创建云资源。

```sh
# 使用已有匹配平台的PyTorch环境；本次基线为2.5.1
python token_ddp.py
python3 gqa_serving.py
python3 worker_fencing.py
python3 agent_evaluation.py
```

## 先预测，再核对输出

1. `token_ddp.py`真的创建两个CPU/Gloo进程，标量MSE梯度为2与4/6/8。
   错误rank均值得到4，正确全局token分母得到5；学习率0.1后权重分别−0.4与−0.5。
   另检验no_sync累积、一个rank空目标、全局空目标不更新；与单进程梯度5比较。
   这是梯度语义实验，不测LLM、GPU、混合精度、FSDP或网络性能。
2. `gqa_serving.py`用4Q头/2KV头/二维RoPE比较全量因果计算与增量缓存。
   正确路径相等，错头映射与错位置偏移必须出现显著差异；每份输出还要满足完整[T,4,2]形状。
   大模型容量使用独立题设：32层/8KV头/128维/每元素2字节，8192位置逻辑KV为1GiB。
   16位置块下8193位置需513块，8GiB只够7条。另手算固定客户端事件：50token/s、
   延迟达标10请求/s。这些是数值/确定性模型，不是vLLM压测。
3. `worker_fencing.py`真实启动暂停A、接管B；A进程仍存活，但全新op被接收方拒绝。
   单独启动另一个进程在提交后退出23，再启动C以相同逻辑动作找回回执。
   最后核对3笔效果、值总和31、同键异参/旧代际/越权均无新增效果。
   租约时间为注入的逻辑时钟；控制库与效果库分离，显式先安装接收方fence再允许新owner执行。
   两库不构成原子分布式事务：独立负例实际演示“控制代际推进但接收方未安装”时A仍可写。
   只有接收方读回精确代际才宣布armed；被更高代际超越的B不能误报准备就绪。
   身份来自固定可信任务fixture，程序没有实现身份认证；不支持fencing的外部工具不因此获得保护。
4. `agent_evaluation.py`用固定计划运行4任务，读取真实SQLite报告与来源版本。
   normal=4/4，claim_only=0/4，deny_all=2/4，citation_swap=3/4。
   正常情况实际报告1条、金额37、引用A租户a-1/v1与a-2/v2。
   另注入“先读出/返回B内容、再自报denied”：独立读回执与返回内容会让此策略降为3/4。
   公开状态响应多出越权内容字段也会因严格schema失败，不能在未检查的附加字段里泄漏。
   合法报告任务的公开契约只返回状态：产物正确但对外报denied/insufficient_evidence，均为3/4、效果1、合格任务0。
   先读B再正确生成报告，以及直接返回缓存的B内容，也都为3/4；读取记录与返回内容分别校验。
   批次之外另写unexpected-task报告使环境契约失败，计0/4、效果2。
   合法来源允许重复读取或调整顺序；评分不要求唯一执行轨迹。
   固定fixture检验评估器，未测LLM、向量检索服务、公开基准或真实Kairo。

完整输出、源码SHA-256、环境与未覆盖范围见`validation.json`。
Kairo接入契约与故障验收见`kairo-adapter-contract.md`；该文件是映射设计，不是现有API说明。
