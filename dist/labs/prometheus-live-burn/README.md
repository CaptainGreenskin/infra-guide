# 用真实抓取验证双窗口燃烧告警

实验启动两个回环 HTTP 指标端点和一个 Prometheus 3.5.0 进程。端点按脚本在每次抓取时增加计数，模拟一批业务请求，甲实例的归零也由脚本注入。抓取、时序存储、PromQL 查询和告警求值都由真实 Prometheus 执行。告警规则以 99.9% 目标的 14.4 倍燃烧阈值为例，使用 6 秒和 16 秒窗口、1 秒求值周期与 4 秒持续条件来缩短运行时间。

| 原始记录 | 要核对的现象 |
| --- | --- |
| `healthy` | 两窗为零，当前没有活跃告警。 |
| `counter_reset` | 甲的坏计数从 1000 变为 0，乙保持 600。先逐实例求速率再合并得到零，先合并再求速率得到正值。 |
| `pending` | 两窗均超过 1.44%，`ALERTS` 里出现待确认状态。 |
| `firing` | 同一组标签持续满足条件，求值样本跨过 4 秒后进入触发。 |
| `recovered` | 短窗归零，长窗仍高，当前活跃告警消失。 |

手算重启的一步时，对每条序列将重置前的读数加回变化量。甲为 `0 − 1000 + 1000 = 0`，乙为 `600 − 600 = 0`。提前合并让两条序列变成 `1600 → 600`，重置补偿得到 `600 − 1600 + 1600 = 600`。这 600 是外推前的误计增量。`rate` 再按实际样本间隔和窗口边界估算每秒速率。 [Prometheus 函数语义](https://prometheus.io/docs/prometheus/latest/querying/functions/#rate)

## 复跑

准备 Python 3.9 或更高版本，从官方发布页获取适合本机架构的 Prometheus 3.5.0。实际运行使用 Linux amd64 的官方归档，下载归档摘要见 `ci-record.json`。 [Linux 实跑记录](https://github.com/CaptainGreenskin/infra-guide/actions/runs/42583213180)解压实验包和 Prometheus，在实验目录执行下列命令，把二进制路径换成实际位置。 [Prometheus 3.5.0 发布](https://github.com/prometheus/prometheus/releases/tag/v3.5.0)

```sh
python3 -B prometheus_live_burn.py \
  --prometheus /path/to/prometheus \
  --output local-validation.json
```

程序只绑定本机回环地址和临时端口，结束后清理 Prometheus 进程和临时时序库。五份快照中，`raw_counters` 保存从实际查询读到的四条序列，`alert_history` 保存状态样本及其求值时刻。对照 `observed_scrapes` 核对脚本发出的计数；用 `active_at`、首次 `pending` 和首次 `firing` 样本检查持续条件。运行时刻和估计速率会随采样对齐变化，复跑核对五阶段关系即可。 [Prometheus 告警状态](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)

验证范围为受控端点的真实抓取和规则状态。用户结果分类、生产窗口选型、Alertmanager 投递及值班处置需要各自的证据。
