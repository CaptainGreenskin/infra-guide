/* Evidence-backed teaching material; each experiment has a deliberately bounded scope. */
Object.assign(sources,{
 v24HPA:['Kubernetes · HPA算法、指标与伸缩行为','https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/'],
 v24HPARatio:['Kubernetes v1.34.1 · 资源利用率计算实现','https://raw.githubusercontent.com/kubernetes/kubernetes/v1.34.1/pkg/controller/podautoscaler/metrics/utilization.go'],
 v24HPAMissing:['Kubernetes v1.34.1 · 缺指标的保守计算','https://raw.githubusercontent.com/kubernetes/kubernetes/v1.34.1/pkg/controller/podautoscaler/replica_calculator.go'],
 v24PromTest:['Prometheus · 规则单元测试与浮点比较','https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/'],
 v24Collectives:['PyTorch · 分布式集合通信与调试','https://docs.pytorch.org/docs/stable/distributed.html'],
 v24NCCL:['NVIDIA NCCL · 集合操作的数据语义','https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html'],
 v24OTel:['OpenTelemetry · Python手动埋点','https://opentelemetry.io/docs/languages/python/instrumentation/'],
 v24Propagation:['OpenTelemetry · 跨服务上下文传播','https://opentelemetry.io/docs/languages/python/propagation/']
});
const sctResult=name=>scalingCollectiveTraceValidation.programs[name].result;
function sctLab(name,full=true){
 const result=sctResult(name);let lead,rows,scope,command;
 if(name==='scaling_reference.py'){
  lead='按已核对的Kubernetes v1.34.1资源计算写出受限参考，再单独计算75秒容量空窗、滚动建议窗口和数据库连接预算。';
  rows=[['同样180m使用量，request 200m→400m','4个就绪Pod基础建议6→3'],['异构request 100m/900m，各用90m','合并利用率18%；逐Pod百分比平均会得到50%'],['3个180m，另1个指标缺失','补值后67%，本例建议5，直接套原90%会建议6'],['3个60m，另1个指标缺失','按所核对版本补request的100%，调整为47%，建议仍4'],['新容量仅180/s','75秒积压4500，之后没有净余量排空'],['新容量240/s','积压4500，第150秒排空；上限500则拒4000，第84秒排空']];
  scope='标准库参考与固定流体队列；未运行真实HPA、指标API、节点扩容或逐请求延迟。';
  command='python3 scaling_reference.py';
 }else if(name==='prometheus_cpu.py'){
  lead='用真实Prometheus promtool 3.5.0解析规则并执行四组固定CPU gauge输入，独立检查加权比值、缺指标、测到零和全部遥测缺失。';
  rows=[['不同request','实际规则输出0.18；错误逐Pod平均0.5'],['一个Pod用量缺失','朴素比值0.09，完整性标记0'],['明确测到零用量','比值0，完整性标记1'],['全部遥测不存在','没有结果；不会伪装成完整性0或CPU 0'],['浮点处理','fuzzy_compare只允许末位差异，仍检查数值与标签']];
  scope='已运行真实规则引擎，输入是合成gauge；不是CPU采样、metrics-server、HPA适配器或真实集群。';
  command='python3 prometheus_cpu.py /absolute/path/to/promtool';
 }else if(name==='collective_contracts.py'){
  const normal=result.modes.correct;
  lead='PyTorch '+result.torch+'实际启动两rank CPU/Gloo作业，先执行数值与变长汇总，再用独立进程组验证形状和操作不一致。';
  rows=[['AllReduce SUM','两rank都得到[11,22,33,44]，除2才是按rank平均'],['ReduceScatter → AllGather','本次组合通过；各得[11,22]和[33,44]，再收齐全量和'],['变长[2,4,6]与[20]','有效和32、项数4、均值8；逐rank均值再平均为12'],['把填充0也计入分母','错误变成32/6，约5.333333'],['形状/操作不匹配','双方均收到指纹不一致诊断'],['rank1调用前睡80ms','本次rank0 call+wait '+normal[0].delayed_arrival.local_call_and_wait_ms.toFixed(3)+'ms；rank1 '+normal[1].delayed_arrival.local_call_and_wait_ms.toFixed(3)+'ms']];
  scope='真实本机CPU集合操作；耗时每次变化，不是NCCL/RDMA、跨机或GPU吞吐测量。';
  command='python collective_contracts.py';
 }else{
  lead='OpenTelemetry API/SDK '+result.sdk+'真实创建跨度，通过HTTP传traceparent；第一次SQLite提交后返回503，同操作重试后从原回执确认。';
  rows=[['实际跨度','根任务1 + CLIENT尝试2 + SERVER执行2，共5个'],['传播关系','同trace_id；每个SERVER父ID等于对应CLIENT span_id，父标记remote'],['错误与最终状态','首次尝试ERROR保留；根任务独立验收后OK'],['实际计数器','2次HTTP尝试，1笔效果，1个合格任务'],['固定教学成本','2+2+1=5点；仅取成功HTTP的2点会漏计'],['指标标签','有限tool/outcome/category/task_type；业务ID不放指标标签']];
  scope='实际SDK、HTTP与本地SQLite；只在内存导出，没有Collector/后端、LLM、真实认证、Kairo或真实计费。';
  command='python -m pip install -r requirements-otel.txt\npython otel_attempts.py';
 }
 return infraReadableHTML(para(lead)+code(name==='scaling_reference.py'?'Python 3.9+ · 标准库':'环境与安装步骤见包内README','SHELL',command)+table(['检查','实际结果'],rows)+
 (full?'<details class="full-code"><summary>展开完整'+name+'：与下载源码一致</summary>'+code(name,'PYTHON',scalingCollectiveTraceFiles[name])+'</details>':'')+
 '<p class="practice-links"><a href="labs/scaling-collectives-traces.zip" download>下载弹性、集合通信与观测实验 ↓</a><a href="labs/scaling-collectives-traces/'+name+'" download>下载'+name+' ↓</a><a href="labs/scaling-collectives-traces/validation.json" target="_blank" rel="noopener">实际输出与源码摘要 ↗</a></p>'+para('<small>'+scope+'</small>'));
}

