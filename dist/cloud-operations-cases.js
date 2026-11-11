function opsLabCode(file,label){return '<details class="full-code"><summary>'+label+'</summary>'+code(file,file.endsWith('.yaml')?'YAML':'PYTHON',cloudOpsLabFiles[file])+'</details>';}
function opsLabLinks(file){return '<p class="practice-links"><a href="labs/cloud-operations.zip" download>下载身份、容量与 SRE 实验包 ↓</a><a href="labs/cloud-operations/'+file+'" download>下载本例源码 ↓</a><a href="labs/cloud-operations/validation.json" target="_blank" rel="noopener">查看本次结果与源码摘要 ↗</a></p>';}
function telemetryCase(){const r=cloudOpsLabValidation.programs['telemetry_lab.py'];return para('案例：本地API调用backend，依次发送正常、注入等待和503请求。先预测哪些请求会有子跨度、trace-id与parent-id如何连接，再核对实际请求记录。图中的300ms是理想账本，程序保留本机测得的墙钟和HTTP开销。')+
 code('Python 3.9+ · 两个本地 HTTP 服务','SH','python3 telemetry_lab.py')+
 table(['核对对象','本次观察','判断'],[['业务计数',r.requests+'个请求、'+r.bad_requests+'个坏请求','不会因为503没有backend跨度而丢掉失败'],['路径关联',r.backend_spans+'个backend跨度，父子验证通过','trace-id延续，下一跳parent对应API跨度'],['指标标签','route / outcome','逐请求ID不作为指标标签'],['实际API毫秒',r.measured_api_ms.join(' / '),'实际测量，不能当作生产压测或固定时限']])+
 opsLabCode('telemetry_lab.py','展开完整 HTTP 计时与 trace 传播程序')+
 para('180ms等待与60ms处理用sleep注入，均为墙钟延迟，不是CPU耗时。示例只覆盖最小version-00上下文，不是OTel SDK兼容或采样导出验证；真实跨主机还需考虑时钟、丢样和边界策略。')+opsLabLinks('telemetry_lab.py');}
function promtoolCase(){const r=cloudOpsLabValidation.programs['promtool_lab.py'];return '<h3>在真实规则引擎中检验聚合与告警</h3>'+para('规则明确使用30天、99.9%目标，1h和5m均超过14.4倍，另有1m持续条件。输入序列与断言一起下载；先手算，再让promtool求值。课堂图里的99%预算与这份规则是不同题设，代入时要读取各自分母。')+
 code('本次基线 Prometheus 3.5.0 · 不启动抓取服务','SH','python3 promtool_lab.py /absolute/path/to/promtool\n# 或直接运行\npromtool check rules slo.rules.yaml\npromtool test rules slo.test.yaml')+
 table(['输入/对照','预期与实际核对'],[['请求按A/B合并','总体成功率0.91；实例等权平均0.95不能使用'],['持续热故障 / 短窗恢复','先触发，短窗恢复后该快速组合解除'],['兼容经典桶','合并后p99估计0.99，实例p99均值0.545是另一结果'],['无错误序列 / 零流量 / 无数据','分别得到坏率0、无成功比例、缺序列；不混填100%']])+
 code('本次规则执行摘要','JSON',JSON.stringify({version:r.version,fixture_groups:r.fixture_groups,commands:r.commands},null,2))+
 opsLabCode('slo.rules.yaml','查看可执行的 recording / alerting rules')+
 opsLabCode('slo.test.yaml','展开七组输入序列与独立数学预期')+
 opsLabCode('promtool_lab.py','展开调用真实 promtool 的验证驱动')+
 para('直方图计算存在最后位浮点差异，测试只用promtool官方fuzzy_compare容忍该差异，保留标签与分支断言。这里只运行解析和规则求值，没有抓取生产指标、发送Alertmanager通知或执行真实值班处置。')+opsLabLinks('promtool_lab.py');}
Object.assign(cloudFieldCases,{
 'cloud-security':()=>{const r=cloudOpsLabValidation.programs['authorization_http_lab.py'];return para('案例：读者A有读自己报表的能力，尝试换租户、伪装路径归属、扩大动作范围；另测试过期、错误受众、签名伪造和策略撤销。HTTP结果与SQLite实际写入分别核对，成功与拒绝都要成立。')+
 code('Python 3.9+ · 标准库 / 真实 loopback HTTP','SH','python3 authorization_http_lab.py')+
 table(['组别','结果','验证的边界'],[['正常读与获准写','200，A最终只有1次获准写','必要功能仍可用'],['跨租户/错误对象/只读写入','403，B写入0','参数与路径不能自授归属和能力'],['过期/零期限/错误受众/伪造签名','401','验证凭证的适用性与可信性'],['策略撤销/新代际/密钥集合切换','按当前策略与信任集合分别通过或拒绝','签发、验证、授权是不同状态']])+
 code('本次实际效果','JSON',JSON.stringify({cases:r.cases.length,writes_A:r.writes_A,writes_B:r.writes_B,audit_events:r.audit_events,credentials_logged:r.credentials_logged},null,2))+
 opsLabCode('authorization_http_lab.py','展开完整授权程序：凭证、策略、对象与效果')+
 para('本地capability使用HMAC和固定信任集合。HMAC用共享密钥校验内容，持有该密钥的一方也能签发本例凭证；它与只持公钥的验签不是同一种信任分工。此例刻意限定协议与输入，不是JWT/OIDC实现。正式身份协议需要成熟实现与实际签发/验证环境；实验没有接入云IAM或Kubernetes。')+
 opsLabCode('rbac-readonly.yaml','查看按官方语义审阅的最小 RBAC 配置')+
 knowledgeCheck('为什么本例既检查403，也检查数据库写入？','返回拒绝只是一份回应。必须确认受保护效果没有提前发生，同时让必要正例成功；否则可能漏掉“已经写入但最后返回拒绝”，或让不可用的全部拒绝误充最小权限。')+opsLabLinks('authorization_http_lab.py');},
 'cloud-capacity':()=>{const r=cloudOpsLabValidation.programs['capacity_lab.py'];return para('案例：输入100/s，前10秒只有80/s能力，之后120/s。先手算积压峰值、排空时刻和每段实际完成，再给缓冲设160上限。程序用Fraction精确积分，每一步核对到达、完成、拒绝和剩余工作的守恒。')+
 code('Python 3.9+ · 精确流体模型，不生成网络压力','SH','python3 capacity_lab.py')+
 table(['观察点','无限缓冲','上限160'],[['10s','到达1000、完成800、积压200','完成800、积压160、拒绝40'],['20s','到达2000、完成2000、积压0','完成1960、拒绝40、积压0'],['30s','完成3000，空队列实际完成100/s','完成2960、拒绝40']])+
 code('本次成本与单位关系核对','JSON',JSON.stringify({stable:r.stable_admitted_100_per_second,cost:r.cost,backlog_area:r.unbounded.backlog_area_request_seconds},null,2))+
 opsLabCode('capacity_lab.py','展开积压、有限缓冲、CPU单位与成本程序')+
 para('模型把工作当作连续可处理量，容量在给定时刻阶跃，省略服务颗粒度、真实竞争与伸缩过程。它验证公式和守恒，不作为真实HPA或压测证据；成本也是题设单位。')+
 knowledgeCheck('10秒扩到120/s，为什么仍不能说过载已完全恢复？','当时还有200积压，净余量仅20/s，再需10秒。实际还应核对到达、有效完成、积压年龄、失败与用户延迟；空队列后也不能把120/s能力当作实际完成量。')+opsLabLinks('capacity_lab.py');},
 'sre':()=>telemetryCase()+promtoolCase()+knowledgeCheck('一条慢trace能证明全站错误率或p99吗？','不能。轨迹用于解释被记录的样本，全局比例与分布需要完整且同口径的事件计数或可合并桶；采样、缺数和标签边界都要核对。')
});
for(const [id,module,title,body]of [
 ['iam-security','cloud-security','配套实战：真实HTTP授权与无副作用验收',cloudFieldCases['cloud-security']],
 ['elasticity','cloud-capacity','配套实战：积压守恒、有限缓冲与单位成本',cloudFieldCases['cloud-capacity']],
 ['observability','sre','配套实战：两段HTTP与父子trace关联',telemetryCase],
 ['slo','sre','配套实战：真实Prometheus规则求值',promtoolCase]
]){
 const article=articleByIdForCloud(id);
 article.sections.push([title,body()]);
 article.refs=[...new Set([...article.refs,...cloudKnowledgeDomain(module).refs])];
 article.updated='2026.11.04';
}
const cloudStageFields=[['foundation'],['compute','network','cloud-data'],['native'],['serverless','cloud-delivery'],['cloud-security','cloud-capacity'],['sre']];
const cloudStageGates=[
 '先算并发任务的内存峰值，再观察请求超时后为何还能取回同一笔操作的结果。',
 '画出经过代理的请求和回包，恢复数据库到误操作之前并核对业务数据。',
 '从调度事件解释 Pod 为什么等待，再跟踪卷如何按节点拓扑绑定和回收。',
 '沿消息核对重投与提交结果，再用 Terraform 的计划和状态解释资源漂移。',
 '核对获准操作成功、越权操作没有产生写入。算出积压峰值、排空时间与每次成功交付的成本。',
 '核对服务指标的聚合结果，用实际恢复出的业务状态验证恢复点。'
];
const cloudStagePractices=[
 [['virtual-memory-oom','section-9','跑并发内存对照'],['distributed-systems','http-operation-retry','核对超时后的同一操作']],
 [['vpc-network','cloud-proxy-run','追踪代理请求与回包'],['storage-recovery','native-postgres-pitr','恢复到误操作之前']],
 [['scheduling-resources','scheduler-native-run','核对 Pod 调度结果'],['k8s-storage','native-csi-storage','核对卷绑定和回收']],
 [['serverless-execution','native-jetstream-redelivery','核对消息重投与效果'],['serverless-execution','serverless-ack-evidence','用 RabbitMQ 记录判断何时确认'],['terraform-state','terraform-state-run','复现 Terraform 状态漂移']],
 [['iam-security','section-9','核对允许、拒绝与写入'],['elasticity','section-8','算积压和单位成本']],
 [['slo','live-prometheus-burn','验证 Prometheus 聚合与告警'],['resilience','section-9','核对实际恢复点']]
];
function stageGateHTML(task,exercises){
 const links=exercises.map(([article,anchor,label])=>'<a href="'+articleURL(article)+'#'+anchor+'">'+label+' →</a>');
 return '<p class="stage-gate"><b>过关任务</b> '+task+' <span class="stage-practice-links">'+links.join(' ')+'</span></p>';
}
function cloudStageStudyHTML(index){
 const fields=cloudStageFields[index].map(id=>'<a href="'+fieldMapURL(id)+'">'+moduleFor(id).n+' '+moduleFor(id).name+' →</a>');
 return '<p class="stage-field-links"><b>先读系统知识</b> '+fields.join(' ')+'</p>'+
  stageGateHTML(cloudStageGates[index],cloudStagePractices[index]);
}
