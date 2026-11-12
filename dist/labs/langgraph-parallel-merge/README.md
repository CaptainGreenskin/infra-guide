# 两个并行分支怎样归并一份报告

两条 LangGraph 分支都为操作 `report-A:publish` 产出「ops-daily」报告候选。候选的正文是 `report` 和 `total`，来源分支另记。图用同步点确认两条分支确实在两个线程上重叠，再指定记录候选输出的先后。输出日志的先后与框架内部应用更新的顺序分别取证。

| 路径 | 两支的金额 | 汇合或提交 |
| --- | --- | --- |
| 普通状态字段 | 42、42 | 同一步两次写入触发 `InvalidUpdateError`，汇合节点未进入 |
| 列表相加 | 42、42 | 两项原样保留，直接相加会得到 84 |
| 按操作和正文归并 | 42、42 | 合成一版正文，保留两个来源，发布一次 |
| 有冲突的归并 | 42、41 | 两版都保留，进入 `review_required`，没有发布请求 |
| 交换冲突输出的先后 | 41、42 | 候选与复核决定相同 |

`merge_candidates` 对每个操作保存多种正文，正文按字段名排序并序列化为固定 JSON 字符串。合并仅对同一正文的来源做集合并集。这样交换两次更新，或者重复合并同一来源，归并结果都一致。汇合节点再根据正文版本数选择发布或停下等待复核。本练习只处理一项操作，使用由程序固定的候选输入。

## 复跑

实跑环境为 macOS arm64、Python 3.12.13、LangGraph 1.2.20、LangGraph SQLite 检查点 3.1.3。解压并进入实验目录，把 `observed` 作为一个尚未存在的输出目录。

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -B parallel_merge.py --output observed
```

运行器把图检查点和接收方账本分开保存在两个 SQLite 文件。首次发布后，另起一个进程打开同一个检查点库，选择 `next=["publish"]` 的历史检查点执行 `invoke(None, checkpoint_config)`。两个草稿节点和汇合节点各进入一次，发布节点进入两次。第一次的接收方请求是 `committed`，第二次是 `duplicate`，两次返回同一个回执。实际效果表只有一行。

```sh
sqlite3 observed/receiver.sqlite \
  'SELECT case_id,operation_id,result,receipt FROM requests ORDER BY seq;'
sqlite3 observed/receiver.sqlite \
  'SELECT case_id,operation_id,payload,receipt FROM effects;'
sqlite3 -readonly observed/checkpoints.sqlite \
  "SELECT checkpoint_id,parent_checkpoint_id,CAST(metadata AS TEXT)
   FROM checkpoints WHERE thread_id='canonical_same' AND checkpoint_ns='' ORDER BY checkpoint_id;"
```

`validation.json` 记录报错、候选、节点访问、接收方请求和效果。两份原始数据库可独立检查。节点访问里的 PID 和线程编号会因运行改变，判断时比较同一次运行中的身份关系。

在 `checkpoints.sqlite` 中，`replay_checkpoint_id` 指向发布前第 2 步。按父 ID 向后查，有两个直接子检查点，原运行完成发布的 `loop` 第 3 步，以及重放先建立的 `fork` 第 3 步。重放完成的 `loop` 第 4 步是这个 `fork` 的子检查点。最后查 `receiver.sqlite`，两次请求拿到同一份回执，接收方只提交一份报告。

这里的验证边界是本机进程、固定输入、单项业务操作和受控 SQLite 事务。生产部署仍需按真实的权限、接收方事务和恢复策略验收。[LangGraph 并发更新错误](https://docs.langchain.com/oss/python/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE) · [LangGraph 历史检查点重放](https://docs.langchain.com/oss/python/langgraph/use-time-travel)
