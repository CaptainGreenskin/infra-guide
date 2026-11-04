# 身份、容量与 SRE 实验包

先读对应领域的知识正文，再运行案例。Python程序要求3.9+且仅使用标准库；HTTP只绑定127.0.0.1临时端口，数据库位于程序自己的临时目录。此包不连接云账户、不部署集群。

## 1. 真实 HTTP 授权与效果核对

```sh
python3 authorization_http_lab.py
```

本地签发受限的HMAC capability，服务端验证固定信任密钥、签发者、受众和时间，再按当前策略、租户及SQLite中实际行归属判定。14组请求包括正例、跨租户、路径伪装、只读写入、超出服务端策略、过期/零期限、错误受众、伪造签名、策略撤销及新旧密钥切换。结果应只有A获准的1次写入，B为0，审计14条；不输出密钥或完整凭证。

这是有明确输入范围的教学协议，不是JWT/OIDC实现或生产认证库。正式服务应使用经过维护的协议库、可信签发和资源授权，不把本文件当作可直接部署的身份平台。

`rbac-readonly.yaml` 给出独立测试namespace中的SA、只读指定ConfigMap的Role和RoleBinding；关闭不必要的自动token挂载。配置按官方语义审阅，没有实际创建集群对象。目标环境中要同时核对必要get成功、其他资源拒绝、其他绑定/authorizer及间接工作负载权限；使用冒充身份测试还需要相应权限。

## 2. 精确排队、准入与单位成本

```sh
python3 capacity_lab.py
```

Fraction流体模型：100/s输入，前10s能力80/s，之后120/s。无限缓冲下10s积压200，20s清空，30s完成3000；空队列时实际完成100/s。积压面积2000请求·秒。

把积压上限改为160，前10s应完成800、剩160、拒绝40；到30s完成2960、拒绝40。每一步检查累计到达=累计完成+拒绝+剩余积压。它是按固定区间积分的模型，不是OS队列、HPA生效时限或真实压力测试。

另核对稳态接纳100/s、等0.12s、执行墙钟0.20s分别对应12/20在途；每次0.010CPU秒对应1核当量。成本130/1000=0.130，117/1000=0.117，117/900仍为0.130；所有成本为题设单位。

## 3. 两个 HTTP 服务的 trace 与指标

```sh
python3 telemetry_lab.py
```

实际启动API和backend两个本地HTTP服务，发送正常、注入等待与503请求。结果应为3个请求、1个坏请求、2个backend跨度，trace-id贯通、父子span关联正确；非法入站上下文按本例策略新建trace。指标只使用route/outcome标签，trace-id留作单请求关联。

等待180ms和处理60ms使用sleep注入墙钟延迟，不是CPU执行时间；实际API延迟与阶段计时保留在validation.json，包含调度/HTTP开销。正文300ms图是独立的理想时间账，不能直接当作本机测量。这只是最小version-00传播演示，不是完整W3C/OTel兼容、采样和导出实现。

## 4. 真实 Prometheus 规则引擎

自行准备官方promtool，本次验证基线为Prometheus3.5.0。二进制不包含在此包。

```sh
python3 promtool_lab.py /absolute/path/to/promtool
# 或直接运行：
promtool check rules slo.rules.yaml
promtool test rules slo.test.yaml
```

7组固定序列覆盖：

1. A/B请求合并成功率0.91，避免实例平均0.95。
2. 长短窗持续热故障触发快速告警。
3. 长窗仍热、短窗恢复后该AND组合解除。
4. 兼容经典桶先rate再合并，p99估计0.99；错误的实例均值0.545。
5. 有请求但没有错误序列时坏率为0。
6. 零流量不产生100%成功率（0/0为NaN）。
7. 无采集序列与已有的零计数器分别判断。

规则明确使用30天、99.9%目标及14.4倍阈值，两窗口为1h/5m，另有1m持续条件。课堂1000请求的99%预算是另一题设，不混用分母。`fuzzy_compare`只容忍最后位浮点差异，不放松标签、分支和数学断言。

这验证真实解析和规则求值；未启动Prometheus抓取服务、Alertmanager通知或真实值班流程。生产还需核对测量完整性、标签、抓取/评估周期、路由与行动。

## 记录

`validation.json` 保存四程序结果、环境、源码SHA256和未覆盖范围。源码与记录一起发布；修改程序/规则后应重跑。官方资料入口：

- https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/
- https://kubernetes.io/docs/reference/access-authn-authz/rbac/
- https://www.w3.org/TR/trace-context/
- https://sre.google/workbook/alerting-on-slos/
