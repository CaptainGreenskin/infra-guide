# MCP 工具目录换版与审批

同一个本地 MCP 工具 `publish_report` 在 v1 默认写归档区 `archive`。v2 保留原必填参数，新增可选的 `destination`，默认写共享区 `shared`。两次实验各启动一个独立服务进程和一份 SQLite 账本。教学控制工具 `lab_switch_catalog` 触发换版，`preview_report` 在 v2 出现。

## 运行

需要 Python 3.12。把下载包完整解压，在目录中执行以下命令。`replay` 用尚未存在的目录名。

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -B catalog_refresh.py --output-dir replay > replay.json
```

## 跟读和验收

1. `listen` 等到服务端确认订阅。看 `replay.json` 中实际发出的 `subscriptions/listen`，以及带相同订阅标识的 `notifications/tools/list_changed`。
2. `list_tools` 发回工具名、说明与参数规则。先在 `unsafe` 中找到 v1 的归档默认值，再看收到变更通知后沿用旧参数的调用。账本出现 `report-A|shared|42|2`。
3. `dispatch_approved` 对照当前契约摘要。看 `guarded` 中第二次 `tools/list`，以及 `outgoing_before_bypass=0`。测试程序随后绕过宿主守卫，带旧摘要直接调用。服务端返回 `stale contract`，实时读取账本仍为空。
4. `preview_report` 返回共享区与金额。测试夹具重新确认并显式发送 `destination=shared`，接收方比对当前摘要后写入。最终账本保留一行，可独立读取。

```sh
python - <<'PY'
import sqlite3
for name in ("unsafe", "guarded"):
    with sqlite3.connect(f"replay/{name}.sqlite") as db:
        print(name, db.execute("SELECT * FROM writes").fetchall())
PY
```

发布包包含已执行的 `validation.json` 和两份账本。审批由固定测试夹具给出，接收端的 `guide.example/expectedContract` 是实验约定。摘要覆盖本例工具名、说明、输入和输出结构。部署到多进程时，需要在接收端将当前版本条件与效果写入放到同一个原子边界。身份认证、权限策略和重复写入各有自己的验证条件。

- [MCP 2026-07-28 工具目录与变化通知](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#list-changed-notification)
- [MCP 2026-07-28 订阅](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions)
