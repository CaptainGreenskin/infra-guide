# 从真实 Collector 的采样结果回到账本

三项任务各自尝试发布总数为 37 的报告。先预测，遇到一次失败跨度、随后成功的任务是否会被保留。再比较全量任务的成功比例与留下的轨迹。

| 任务 | HTTP 尝试 | 接收方效果 | 最终任务结果 |
| --- | --- | --- | --- |
| `R27-normal` | 200 | 提交 1 份 | 核对成功 |
| `R27-retry` | 提交后 503，同一操作重试 200 | 原回执复用，仍为 1 份 | 核对成功 |
| `R27-failed` | 提交前 500 | 0 份 | 失败 |

## 复现

解压后进入实验目录。使用 Python 3.12 和固定依赖。另取同平台的官方 `otelcol-contrib` 0.130.0 发行归档。`collector-lock.json` 保存 Darwin arm64 和 Linux x86_64 的发行资产 ID 与 SHA-256，`official-assets.json` 保留 GitHub Release API 中对应资产的 `digest` 与下载地址。归档由运行器核对摘要，只把其中的 Collector 二进制解出到临时目录。

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B tail_ledger.py \
  --collector-archive /absolute/path/to/otelcol-contrib_0.130.0_darwin_arm64.tar.gz \
  --output-dir replay
```

`replay` 必须尚不存在。若直链下载较慢，可通过官方 GitHub CLI 请求资产，Darwin arm64 使用 `273023084`，Linux x86_64 使用 `273023092`。

```sh
gh api repos/open-telemetry/opentelemetry-collector-releases/releases/assets/273023084 \
  -H 'Accept: application/octet-stream' > collector.tar.gz
```

## 跟读

1. `run_tasks` 建立每项任务的根跨度。每次真实 HTTP 尝试新建客户端跨度，向独立工具进程传 `traceparent`。工具进程恢复上游父身份，并将实际尝试和写入写进 SQLite。
2. 两个进程通过真实 OTLP/HTTP 导出。`collector.yaml` 的同一个 `otlp` receiver 把同一批跨度分到 `traces/full` 与 `traces/sampled`。后者的 `tail_sampling` 在等待窗口后按 `ERROR` span 保留 trace。运行器同时等待三份采样决定和两个实际文件导出，避免仅凭睡眠推断丢弃。
3. 按 `ledger.sqlite` 的 `tasks`、`attempts`、`effects` 分别计数。再从 `full-traces.jsonl` 和 `sampled-traces.jsonl` 分别找根跨度，按原任务和父子身份重建路径。预期全量有 3 条 trace、11 个 span，采样有 2 条、8 个 span。重试成功的根为 `OK`，它仍因子跨度的 `ERROR` 被保留。账本成功为 2/3，采样根成功为 1/2。两条业务效果均为 37。

`collector-effective.yaml` 记录本次实际监听配置，`collector-metrics.txt` 保留采样决策计数。`validation.json` 给出源码、配置、原始导出和账本摘要。仓库内的 `scripts/check-otel-tail-ledger.cjs` 直接读取原始 OTLP 与 SQLite 做独立对照，普通运行使用 Node 和 Python 标准库。显式同时设置 `OTEL_TAIL_PYTHON` 和 `OTEL_TAIL_COLLECTOR_ARCHIVE` 可以重新运行官方组件并校验新输出。

此实验的范围是回环接口、真实 Collector 和三条固定任务。跨节点按 trace ID 汇合、迟到跨度、队列过载和后端持久化需要各自的目标环境验证。

- [Collector 接收器分发](https://opentelemetry.io/docs/collector/architecture/#receivers)
- [0.130.0 尾部采样政策与等待窗口](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.130.0/processor/tailsamplingprocessor/README.md)
- [0.130.0 `status_code` 对所有收到的跨度求值](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.130.0/processor/tailsamplingprocessor/internal/sampling/status_code.go)
