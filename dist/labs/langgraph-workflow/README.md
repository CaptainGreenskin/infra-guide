# LangGraph：42报告的持久等待、节点重入与并行恢复

这是实际运行官方 Python LangGraph 的实验。固定 `langgraph==1.2.20`、`langgraph-checkpoint-sqlite==3.1.3`，完整传递依赖也精确固定在 `requirements.txt`。需要 Python 3.10+，作者运行 Python 3.12.13。没有语言模型、模型密钥、LangSmith账号或Kairo接口；安装依赖需要联网，实验只访问自己启动的回环HTTP服务。

先预测：基础订单 orders-A/v3 为 `[10,27]`，它引用补录 late-A/v1 的 `[5]`。两份读取按依赖先后执行，草稿为42；金额检查和来源检查可独立并行。获批前只允许暂存草稿，不发布报告。每项任务只应产生一份逻辑暂存和一份发布。

## 安装和完整运行

完整解压ZIP，在包含 `workflow_lab.py` 的目录执行：

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B workflow_lab.py > result.json
# 如需保留每一场景的数据库，用一个尚不存在的目录：
.venv/bin/python -B workflow_lab.py --output-dir runs > retained-result.json
```

默认运行使用临时目录并清理。`--output-dir`拒绝覆盖已有目录，保留的`runs`归你管理。每次工作流推进都启动新Python子进程，退出后才开始下一次；每个场景的接收方是另一个独立进程，最后由父进程终止并wait回收。它监听`127.0.0.1`随机端口，只处理本实验的合成数据。程序不修改宿主资源限制、不启动其他后台任务。

`status=passed`表示正例满足契约，指定负例确实被拒绝，并不表示所有场景的业务都正确。PID、线程编号、interrupt id和负例UUID每次变化，复现核对下面的关系和计数。

|场景|恢复后可核对的结果|
|---|---|
|`stable`|金额42；读取/补录/草稿各1次，两个检查各1次；审批节点进入2次；暂存HTTP尝试2次、暂存效果1份、发布1份；独立oracle接收|
|`new_id_on_reentry`|相同框架检查点、相同42报告，审批节点仍进入2次；节点内新建UUID造成2份暂存；图已结束，独立oracle拒绝|
|`parallel_failure`|来源检查第一次主动抛异常；新进程`invoke(None)`只补来源检查；金额检查总计1次，来源检查2次；两项checks各1份，最终oracle接收|
|`corrupt_report`|复制正确接收方数据库，只把实际报告42改41，保留原效果；独立oracle拒绝|

正常场景还验证：换`thread_id`查询得到空状态；完成后再`invoke(None)`不新增节点进入或接收方记录；同一发布操作换成总数41返回HTTP409，不覆盖原报告。

## 先看对象，再跟API

`ReportState`是本次任务的数据形状，包含读取结果、草稿、稳定操作身份和检查结果。节点接收这份状态并返回更新；边规定哪些节点可以接着执行。`checks: Annotated[list[str], operator.add]`指定两个分支的列表更新怎样合并；分支只返回自己的新增项，不能把整份旧列表重复返回。

`SqliteSaver`把框架检查点写入`checkpoints.sqlite`。`thread_id=report-A`定位同一条执行历史，与宿主线程编号无关，也不提供身份认证或业务去重。`get_state()`读取values、next和tasks；暂停时的task携带`Interrupt(id,value)`。value是任务、42和草稿摘要，描述这次在等什么。

`interrupt(...)`第一次使执行暂停；`Command(resume=...)`中的值在恢复时成为该调用的返回值。恢复会重新进入整个`approval_publish`节点，先再次调用暂存API，然后才走到interrupt并取得批准。`stage_receipt`在暂停前只是节点局部变量，没有作为节点返回更新写进图状态；接收方已经提交的暂存仍然存在。

调用都使用`durability="sync"`，让下一步开始前先写框架检查点。它不把`checkpoints.sqlite`和HTTP接收方的`receiver.sqlite`变成一个事务。接收方用自己的SQLite事务共同提交效果和操作记录，重复同操作同内容返回原回执，同操作换内容冲突。稳定操作身份在初始输入中提交，不能到可能重入的节点里再生成。

## 按源码顺序追踪

1. `receiver()`创建效果、尝试、报告三张表；`POST /effect`在独立事务域里去重。stage只是获准的准备动作；publish在收到匹配批准后才执行。
2. `build_graph()`沿`read_base → read_extra → draft`得到37、5、42；随后两个检查节点在真实执行器线程中并行。Barrier只供观测：两分支均进入后才允许任何一方结束，记录用于核对并行发生过；它不是业务依赖。
3. `add_edge(["check_total", "check_sources"], "approval_publish")`要求两项检查都完成。列表reducer合并`["total"]`与`["sources"]`，程序排序后比较，避免依赖分支完成顺序。
4. `worker()`打开同一个检查点文件、重建同一张图，以相同thread_id执行。start走到中断后进程正常退出；resume由新进程先读取待决中断，再传`Command(resume=...)`。它不继续旧Python调用栈。
5. `case()`记录等待前后接收方状态，核对实际节点次数、两个分支的重叠、错误内容冲突与完成后重复恢复。并行失败是显式异常后的恢复，不是随机拔电或存储损坏测试。
6. `independent_oracle()`重新读取来源JSON和真实接收方数据库，独立检查完整内容、来源摘要、目标、暂存/发布/报告数；它不相信图的next、checks、回执或自报完成。

## 保留数据库后自己查

完整suite结束后接收方已回收，只读检查不需要服务继续存活：

```sh
.venv/bin/python -B workflow_lab.py worker --folder runs/stable --action inspect
.venv/bin/python -B workflow_lab.py worker --folder runs/stable --action inspect --thread-id another-task
```

第一条可读到已完成的42图状态；第二条是空状态。保留目录也含`attempts.sqlite`（节点观测）、`receiver.sqlite`（业务事实）和`orders.json`（独立来源）。检查点文件应来自可信环境，程序启用了严格MsgPack类型限制；本实验仅保存内置JSON兼容类型，不读取未知来源的数据库。

## 事实来源与验证范围

- [LangGraph 1.2.20 的 interrupt 实现及文档字符串](https://github.com/langchain-ai/langgraph/blob/1.2.20/libs/langgraph/langgraph/types.py#L913)：节点重入、Command和中断作用域。
- [LangGraph 1.2.20 的 StateGraph.add_edge](https://github.com/langchain-ai/langgraph/blob/1.2.20/libs/langgraph/langgraph/graph/state.py#L928)：列表起点须全部完成。
- [官方检查点指南](https://docs.langchain.com/oss/python/langgraph/checkpointers)：thread、检查点、pending writes与durability。
- [官方中断指南](https://docs.langchain.com/oss/python/langgraph/interrupts)：暂停和恢复规则。
- [官方SQLite包3.1.3](https://pypi.org/project/langgraph-checkpoint-sqlite/3.1.3/)：文件检查点实现。作者对照了该版本PyPI源码发行包与实际安装源码，摘要见validation.json。

这里验证单宿主、真实SDK、文件SQLite检查点、独立进程HTTP接收方与本地固定批准夹具。没有实现真实审批身份、撤权、多宿主故障转移、远端存储耐久性、任意工具的原子提交、模型规划或Kairo适配。节点执行可能重入；一份业务效果依靠本例接收方的稳定身份协议成立，不能外推为框架让任意副作用只执行一次。
