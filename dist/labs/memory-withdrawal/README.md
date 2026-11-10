# 撤回长期记忆后，已经暂停的任务会发出什么？

A 用户曾选择短版日报。旧任务从 LangGraph 的长期记忆库读到该偏好，保存进任务检查点，然后在发送前暂停。独立调用从记忆库删除 A 的条目，B 的偏好保留。两个新进程分别恢复各自保存的旧任务，一组沿用检查点快照，另一组在发送前重读记忆库。

## 运行

需要 Python 3.12 和本机回环网络。安装依赖后，实验只访问 127.0.0.1 和临时目录里的三个 SQLite 文件。实验的“发送”是向本地 HTTP 接收方发送一个格式选择，接收方保存独立回执。无需模型、云账号或密钥。

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
run_dir="$(mktemp -d)"
python memory_lab.py run --output-dir "$run_dir/run"
```

每次给程序一个尚不存在的输出目录。分别查看 `unchecked/` 和 `rechecked/` 中的 `memory.sqlite`、`checkpoints.sqlite` 和 `collector.sqlite`，以及共同的 `validation.json`。

## 对照

| 查看对象 | 沿用快照 | 发送前重查 |
| --- | --- | --- |
| 删除后再次查询 A 的记忆 | 空 | 空 |
| 暂停任务的已保存快照 | 短版 v1 | 短版 v1 |
| 接收方收到的旧任务 | 短版 | 标准版 |
| 接收方收到的新任务 | 标准版 | 标准版 |
| 清除旧任务历史后，接收方回执数 | 2 | 2 |

在 `validation.json` 中找 `stage_old.paused.checkpoint_id` 和 `resume_old.before.checkpoint_id`，验证两个进程重用了同一个检查点。再对照 `resume_old.history`、`history_purge` 与 `collector`。接收方的真实入库数据还可独立读取：

```bash
python - "$run_dir/run" <<'PY'
from pathlib import Path
import sqlite3
import sys

root = Path(sys.argv[1])
for case in ("unchecked", "rechecked"):
    with sqlite3.connect((root / case / "collector.sqlite").as_uri() + "?mode=ro", uri=True) as db:
        print(case, list(db.execute("SELECT seq, payload FROM receipts ORDER BY seq")))
PY
```

发送前重读展示的是**撤回先发生，发送随后恢复**这一顺序。若撤回可与发送并发，还需要定义最后检查与提交的先后规则，并由接收方参与。删除任务检查点验证的是本机数据库的逻辑可见性。接收方已保存的副本、审计记录和备份各有保留规则。
