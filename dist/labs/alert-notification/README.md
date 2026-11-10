# 告警触发后，谁真的收到了通知

程序在本机启动指标端点、Prometheus 3.5.0、Alertmanager 0.34.2 和 HTTP 接收端。三条序列只相差一个 `case` 标签。每条序列先变成 1，满足规则 1 秒后进入 `firing`。Alertmanager 按告警名和 `case` 分组，等 5 秒发出首条通知。程序让 `short` 提前恢复，让 `long` 持续，并提前为 `silenced` 建立静默。 [Prometheus 规则状态](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/) [Alertmanager 路由配置](https://prometheus.io/docs/alerting/latest/configuration/#route)

| 证据位置 | 看什么 |
| --- | --- |
| `prometheus_firing` | 三个 `case` 都进入 `firing`。 |
| `alertmanager_ingress` | 三条告警都进了 Alertmanager。静默例的 `silencedBy` 包含创建时返回的 ID。 |
| `short_cleared` | 先从 Alertmanager 的活跃列表消失，比 5 秒的首发等待更早。 |
| `after_group_wait` | 首发等待过去后，`silenced` 仍在 Alertmanager，仍带这条静默的 ID。 |
| `receiver_events` | 只有 `long` 进入 `/reports`，先收到触发，再收到恢复。默认路由 `/fallback` 没收到请求。 |

## 复跑

准备 Python 3.9 或更新版本，获取适合本机架构的固定版本二进制。原始运行使用 macOS arm64 版本，从发布接口核对了归档摘要，见 `release-provenance.json`。将参数替换成解压后的二进制路径。 [Prometheus 3.5.0](https://github.com/prometheus/prometheus/releases/tag/v3.5.0) [Alertmanager 0.34.2](https://github.com/prometheus/alertmanager/releases/tag/v0.34.2)

```sh
python3 -B alert_notification.py \
  --prometheus /path/to/prometheus \
  --alertmanager /path/to/alertmanager \
  --output local-validation.json
```

实验只使用本机回环地址和临时端口，完成后退出两个子进程并清理临时存储。记录保留发送条件、Prometheus 和 Alertmanager 的实际 API 响应、接收端原始 HTTP JSON、版本和源码摘要。时刻按本机单调时钟记录，复跑应核对顺序和收到的事件。生产通知渠道、Alertmanager 高可用和人员响应另行验收。
