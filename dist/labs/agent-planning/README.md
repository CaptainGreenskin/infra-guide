# 计划、事实与持久等待

Python 3.9+ 标准库，无需模型、API key、网络服务或数据库安装。在完整实验目录运行：

```sh
python3 -B planning_lab.py > record.json
```

程序为每个场景启动全新子进程执行推进、提议、批准等命令，使用实际 SQLite 文件。
默认使用独立临时目录，退出后清理。若要检查数据库，使用一个**尚不存在**的目录：

```sh
python3 -B planning_lab.py --output-dir runs > record.json
python3 -B planning_lab.py inspect --db runs/adaptive.sqlite
```

## 一项贯穿任务

给 `report-A` 生成当前订单清单的报告。`orders-A/v3` 有 `[10,27]`，清单还引用
`late-A/v1` 补录批次，真正读取补录表才得到 `[5]`，正确总数是42。

固定工作流事先写好补录分支；动态版本初始计划只有读取、汇总、发布，发现补录引用
后进入重规划。固定提议夹具把补录读取插到汇总之前，计划1变计划2；已有基础读取结果
保留。两种设计都得到42，动态版本额外消耗一次提议。这里不证明需要模型规划。

`plans` 保存不同版本的未来步骤；`facts` 按步骤和输入身份保存已确认结果；`runtime`
保存游标、预算和当前草稿；`signals` 保存批准输入；`reports` 保存实际产物。事实记录数
不是 SQL 次数：每次恢复仍可读取版本号与历史元数据。

## 分步体验一次等待

以下命令在同一目录执行，每条命令都启动新进程。先 `mkdir -p manual`：

```sh
python3 planning_lab.py init --db manual/task.sqlite
python3 planning_lab.py advance --db manual/task.sqlite
# NEEDS_REPLAN：基础清单含有补录引用，原计划缺少相应读取
python3 planning_lab.py propose --db manual/task.sqlite --behavior good
python3 planning_lab.py advance --db manual/task.sqlite
# WAITING_APPROVAL：进程已退出，数据库中仍保留草稿与等待条件
python3 planning_lab.py approval_message --db manual/task.sqlite
```

最后一条输出本地教学协议期望的绑定字段。检查内容后，把整个 JSON 作为 `--message`
参数交给 `approve`，再运行 `advance`。例如用 shell 变量保存完整 JSON（不拼接字段）：

```sh
approval_payload=$(python3 planning_lab.py approval_message --db manual/task.sqlite)
python3 planning_lab.py approve --db manual/task.sqlite --message "$approval_payload"
python3 planning_lab.py advance --db manual/task.sqlite
python3 planning_lab.py inspect --db manual/task.sqlite
```

`operator-A` 是测试入口预设的可信操作者夹具；这个 CLI 没有真实认证系统，生产中不能
靠调用者自己填写 actor 字符串获得批准权限。`approval_message` 只生成字段，不签发授权。

## 看哪些实际结果

|场景|应检查的结果|
|---|---|
|adaptive|计划2；基础读取、补录读取、汇总各一份事实；一个42报告；提议预算3→2|
|fixed|计划1；同一42报告；提议预算保持0；预置分支已足够解决本例|
|changed_input|先有已批准的37草稿，再把来源切到v4并新增补录；新草稿42，旧信号仍可确认已收，但不能批准新计划|
|early_signal|DRAFT_READY后先保存批准，再进入等待；不需要发送第二个批准|
|no_progress|相同观察与语义相同的提议反复出现，虽然理由措辞变化，第二次仍停止|
|budget|允许一次提议，下一次触发预算停止；没有报告|
|invalid_plan|把发布排在补录读取与汇总之前，计划不升级、没有报告|
|wrong_cache_key|真实错误执行：仅按步骤名缓存汇总，旧37进入新输入任务；状态DONE且有批准，独立验收仍拒绝（应为42）|
|corrupt_artifact|报告总数仍42，但来源摘要被改写，独立验收拒绝|

`DONE` 再恢复时，完整事件、事实、信号和报告快照不变。计划升级不会删除旧历史，旧事实
只有在输入身份也匹配时才能用于当前计算。

## 实际范围

提议来源是固定夹具，不调用 LLM，也不测规划质量。等待时完成提交并正常退出，下一条命令
在全新进程读取状态；没有测试 SIGKILL 的写入中断、磁盘断电、网络分区或并发执行者。
来源、状态、批准和报告位于一个 SQLite 事务域内，报告与完成状态共同提交；没有任意远端
业务接口或通用工作流框架的恢复保证。跨服务去重与接管应继续运行本站原有恢复实验。
