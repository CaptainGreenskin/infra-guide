# 弹性控制、集合通信与任务观测：三组独立实验

本目录为原创教学程序。三组实验分别运行，不要求它们组成一个系统。统一保存源码SHA-256、实际软件版本与执行结果，不把本地数学、CPU通信或内存导出外推成集群已验证。

## 一、扩容参考与真实Prometheus规则引擎

Python 3.9+标准库：

```sh
python3 -B scaling_reference.py
```

单位为m CPU（1000m=1核）。参考函数核对Kubernetes v1.34.1的Resource利用率计算：匹配样本的用量求和除以对应request求和，先转为整数百分数；缺指标的缩容分支以max(100,target%)的request补值，扩容分支按零补值。其余Pod统一视为ready，未实现完整分类、策略或控制器。

固定结果：四个180m/200m的Pod建议6；request改400m建议3。异构request为100m与900m、用量均90m，整体利用率18%，错误逐Pod平均为50%。缺指标的三个180m及一个缺失项，调整为67%，建议5；三个60m与一个缺失项调整为47%，建议仍4。

这是对特定已核对实现的教学参考，不是完整Kubernetes控制器，不用来预测任意版本的现场结果。模型不运行metrics-server、HPA、VPA、节点扩容或云资源。真实集群仍需核对版本、Pod分类、请求、指标窗口、容差与伸缩策略。

队列为每秒一步的流体模型：输入180/s、旧容量120/s，75秒后新容量到达。新容量180/s时积压4500不会消失；240/s时到第150秒排空；队列上限500时拒绝4000，按一步一秒模型到第84秒排空。没有测逐请求延迟，也没有承诺限流后所有请求都成功。

另从Prometheus官方发行包获取适配自己平台的promtool 3.5.0，运行：

```sh
python3 -B prometheus_cpu.py /absolute/path/to/promtool
```

程序实际调用check rules与test rules。四组输入是合成gauge：不同request的加权利用率、缺指标、真实测到零、全部遥测缺失。规则里的CPU比值是教学看板数学，不是HPA适配器或metrics-server实现；缺指标时不能直接拿朴素比值替代控制器的保守分支。fuzzy_compare仅容许浮点末位差异，值和标签仍核对。

## 二、两进程真实CPU/Gloo集合通信

建议独立CPython 3.12环境，本次为CPython3.12.13 / PyTorch2.5.1：

```sh
python -m pip install torch==2.5.1
python -B collective_contracts.py
```

保存为文件运行。程序用spawn启动两个rank，先执行正确算例，再分别启动两个独立进程组验证形状不一致和操作不一致；反例打开DETAIL调试包装器，错误在下发数据操作前被发现。不是通过故意无限等待来演示错误。

- AllReduce SUM：[1,2,3,4]+[10,20,30,40]=[11,22,33,44]，两个rank都得到全量结果。再显式除2才是按rank平均。
- 本次Gloo组合实际支持reduce_scatter_tensor：rank0得到[11,22]，rank1得到[33,44]；AllGather后重建完整和。不能据此推断所有后端/版本均支持该变体；代码有不支持时的明确分支。
- 变长输入[2,4,6]与[20]：先收长度、补齐、收张量，再按长度移除填充。总和32、有效项4、全局均值8；逐rank均值再平均为12；把两个补零计入分母则是32/6。
- rank1在调用前故意睡80ms，随后双方做异步AllReduce并wait后读结果。分别记录本地call+wait耗时；数值每次不同，等待多不代表该rank网络慢。该计时不用于GPU/NCCL性能比较。

没有运行NCCL、RDMA、跨主机、真实梯度桶或多机训练。调试包装器会增加同步；性能测试应另行固定设备、规模、算法和测量窗口。

## 三、真实OpenTelemetry SDK与HTTP传播

另建CPython3.12虚拟环境，安装本包固定的依赖：

```sh
python -m pip install -r requirements-otel.txt
python -B otel_attempts.py
```

本次实际使用API/SDK1.44.0（复现基线，不宣称最新版）。程序手动创建span，用W3C traceparent通过真实HTTP请求传播；服务端提取父上下文，在内存导出器中得到5个真实span。

客户端与工具端使用不同TracerProvider和service.name，但同在本机一个进程的两个线程中；共享内存导出器仅用于检查关系，没有部署两个远端服务。指标也由同一夹具的MeterProvider记录，未测试分布式指标后端汇总。

span起止时间为同一主机的Unix纳秒，以十进制字符串保存，避免JavaScript把大整数转成浮点数后丢精度；它们不是跨主机时钟已校准的证据。

本例显式使用ALWAYS_ON以完整核对五个span，不在此程序中测试概率或尾部采样策略。

第一次写入SQLite后故意返回503；调用方只能保留结果未知。第二次沿同op_id重试，接收方返回原回执，效果仍1。根任务经独立产物检查后OK，首次HTTP尝试仍ERROR。成功HTTP跨度默认UNSET，不把未设置状态当作任务已完成。

真实计数器记录2次工具尝试、1次效果、1个合格任务；直方图记录两次本地耗时。指标标签只含有限的tool/outcome/category/task_type，业务ID放在受控测试span中。traceparent传递追踪关联，不签发业务授权。

教学成本按两次工具尝试各2点、验收1点，总5点；每个合格任务为5点。仅取成功HTTP的2点会遗漏重试及验收。这些点数由夹具定义，不是模型调用或云服务真实账单。随机trace/span ID与实际耗时每次都会变化，复核父子关系、类别与计数，不要求原始JSON逐字相同。

本例不调用LLM，不实现真实认证或Kairo，不启动Collector、Jaeger或远端遥测后端；没有验证网络导出重试或持久保留。真实接入还需要分别验证这些链路，避免把内存导出成功写成生产可观测性已达标。

## 证据

validation.json为四个程序的实际执行结果和环境，网页内嵌源码、目录源码、ZIP对应同一份文件。生成脚本也保存两个Prometheus YAML的SHA-256。CI实际重跑标准库参考，并用独立数学和关系规则复核三个真实工具执行记录；不自动安装PyTorch、Prometheus或OpenTelemetry。

