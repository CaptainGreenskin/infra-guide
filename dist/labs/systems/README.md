# InfraGuide · Cloud / AI / Agent 系统实验包

Python 3.9+，仅使用标准库。本地实验不申请云资源、不访问外部业务、不调用真实模型或 Kairo。
本包用小系统验证语义，不是生产实现或性能基准。

## 1. 一次执行 Cloud 与 AI 机制实验

```bash
python3 infra_lab.py --output runs/core-report.json
```

包含五项：
- HTTP：真实 loopback 请求，区分 200、503、404；readiness 变为 503 时 liveness 仍为 200，业务路径仍能执行。没有编排器，所以不会自动摘除流量。
- 存储：完整版本校验后发布 CURRENT；半成品不发布；摘要不匹配被拒绝；最后完整版本可恢复。
- SLO：人工事件计数 fixture，989/1000 成功；99%目标下允许10个坏事件，实际11个，burn rate约1.1。空窗口返回无数据。
- 推理指标：人工时间线fixture；A的客户端TTFT为400ms，调度至首token为200ms，TPOT为20ms；单token请求TPOT为空；没有执行模型。
- 任务契约：必要字段和形状校验；缺数据版本被拒绝。示例摘要、代码版本、URI为虚构占位，校验不证明工件存在或有权访问。

断言失败时进程非零退出；正常时所有 results.*.status 为 passed。
HTTP时间是本机单次观察，不可作为服务SLA、云延迟或容量基准。

## 2. Agent崩溃恢复与幂等实验

```bash
python3 agent_lab.py --output runs/agent-report.json
```

runner.sqlite 和 tool.sqlite 是独立数据库。子进程在工具效果已提交后，以23退出，模拟完成记录尚未写入的窗口。
重启用同一 operation ID 再调用工具；工具端原子去重，最终 runner=SUCCEEDED、attempts=2、tool_effects=1。
还验证重复读取已完成结果、同ID不同payload拒绝、未授权工具拒绝。

关键限制：效果只有一次依赖接收工具支持稳定幂等键与原子去重；只在runner记账不足以保证外部效果只有一次。
本实验只有一个worker，不覆盖多worker租约、fencing、远程服务网络分区、断电耐久性、LLM质量或Kairo实现。
脚本用临时目录创建数据库，退出后自动清理；报告保留在指定路径。

## 3. Kubernetes探针与发布手册（目标集群待验证）

需要已有独立测试集群与kubectl权限。确认当前context指向测试环境。
python:3.12-slim 是便于实验的可变标签；可重复的正式环境应记录实际镜像digest。

```bash
kubectl config current-context
kubectl create namespace infra-guide-lab
kubectl -n infra-guide-lab create configmap infra-lab-code --from-file=probe_server.py
kubectl apply -f deployment.yaml
kubectl -n infra-guide-lab rollout status deployment/infra-demo --timeout=120s
kubectl -n infra-guide-lab get pods
kubectl -n infra-guide-lab get endpointslices -l kubernetes.io/service-name=infra-demo -o yaml
```

使readiness失败（仅此专用实验部署）：

```bash
kubectl -n infra-guide-lab exec deploy/infra-demo -- python -c "from pathlib import Path; Path('/tmp/not-ready').touch()"
kubectl -n infra-guide-lab get pods
kubectl -n infra-guide-lab get endpointslices -l kubernetes.io/service-name=infra-demo -o yaml
kubectl -n infra-guide-lab get pods -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.containerStatuses[0].restartCount}{"\n"}{end}'
```

预期：Pod Ready=False，EndpointSlice对应endpoint的ready条件为false；容器不因readiness本身重启。
不要求EndpointSlice中的IP条目一定消失。直接port-forward到Pod可能绕过Service后端选择，不能据此证明readiness失效。

恢复并演练模板发布/回滚：

```bash
kubectl -n infra-guide-lab exec deploy/infra-demo -- python -c "from pathlib import Path; Path('/tmp/not-ready').unlink(missing_ok=True)"
kubectl -n infra-guide-lab set env deployment/infra-demo APP_VERSION=v2
kubectl -n infra-guide-lab rollout status deployment/infra-demo --timeout=120s
kubectl -n infra-guide-lab rollout undo deployment/infra-demo
kubectl -n infra-guide-lab rollout status deployment/infra-demo --timeout=120s
```

可在另一个终端运行 `kubectl -n infra-guide-lab port-forward deployment/infra-demo 18080:8080`，再用 `curl http://127.0.0.1:18080/` 核对响应版本。Pod替换后可能需要重新运行port-forward；这一步只验证应用版本，不验证Service摘流。

核对Pod模板中的APP_VERSION和实际响应都回到v1。这里回滚的是Pod模板，不是外部数据库或模型仓库。
清理只针对本实验创建的专用命名空间：kubectl delete namespace infra-guide-lab。
若命名空间已存在，应先检查归属，不要将别人的资源混入实验或删除。

## 4. 验证记录与复现

validation.json记录本次实际执行环境、结果、脚本摘要和未验证项。
改变Python脚本后需重跑相应验证再生成发布包。
不用把临时目录内容、真实token或私有项目数据写入报告。

