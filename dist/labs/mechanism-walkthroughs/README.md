# 跟着机制走一遍

这组程序对应云网络、Kubernetes控制面、注意力、解码器块与持久工作流。上下文与记忆章继续使用已验证的 `storage-quant-context/context_state.py`，不重复打包。

## 环境和运行

`route_walk.py`、`reconcile_walk.py`、`workflow_history.py` 使用Python 3.9+标准库。

```sh
python3 route_walk.py
python3 reconcile_walk.py
python3 workflow_history.py
```

`attention_trace.py`、`decoder_trace.py` 需要已有PyTorch的Python；本次记录为Python 3.12、PyTorch 2.5.1 CPU、float64，不下载模型和数据。

```sh
python attention_trace.py
python decoder_trace.py
```

`decoder_trace.py` 导入同目录的 `tiny_decoder.py`。该文件与原 `model-foundations/tiny_decoder.py` 完全一致，用来逐层对照已有664参数模型。

## 先预测，再核对

- 路由：`10.30.8.42` 会命中 `/24` 还是 `/0`？新增相同地址的 `/32` 后怎样变化？回程没有路由会怎样？
- 调谐：声明3副本后立即有几个？重复唤醒8次会创建8个还是3个？同名Pod换UID后，旧删除请求应该针对谁？
- 注意力：三行输出应为 `[2,0]`、`[0.5,3]`、`[3.5,2]`。缓存中的最后一个query若错误套左上角因果mask，会得到哪一行？
- 解码器：把第二分支输入接回旧X、门控接反或省略残差，最早在哪一个中间张量出现差异？沿时间轴归一化会不会让未来影响过去？
- 工作流：已记录读取结果后进程退出，输入由23改成999，恢复应使用哪一个？若读取已经发生但结果尚未记录，恢复又会怎样？

## 范围

路由与调谐程序是明确规则的教学模型，未配置VPC或运行Kubernetes控制面。两个张量程序实际执行CPU算子，不报告GPU速度。工作流程序使用真实SQLite文件、独立调用计数库和子进程退出，活动只读本地资料、生成字符串；它不是Temporal SDK，也未连接LLM、远端写工具或Kairo。

工作流解释器只核对活动身份、类型和顺序，重放已完成结果。不能据此推出Temporal的完整版本兼容规则。结果未提交时活动可能重做；远端写入还需要接收方的幂等与结果核对协议。

`validation.json`保存这次环境、实际输出与六份程序摘要，便于比对本地结果。章节中的纸笔结果与反例另外作为独立判据。
