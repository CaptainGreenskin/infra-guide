/* Service discovery, forwarding and application identity, taught before diagnosis. */
const serviceNames=infraReadableHTML(
 '<div class="mechanism-core" id="service-name-address-identity">'+knowledgeSubhead('名字、地址、端口和身份分别回答不同问题')+
 para('Pod是会被替换的运行实例。若客户端把某个Pod IP写死，实例重建后就可能找不到它。Service为一组后端提供相对稳定的访问入口；DNS让客户端按名字找到这个入口。这里至少有四个对象：用于发现的名字、用于传输的IP和端口、当前可用的后端集合，以及应用要验证的身份。它们互相连接，却不是同一个值。',
 '普通ClusterIP Service的A/AAAA记录通常指向Service虚拟IP；无头服务（headless，clusterIP: None）可以返回后端地址集合。ExternalName则通过CNAME别名指向其他名字。查到了记录只证明这次解析拿到了某份答案，不证明记录对应的地址可达、端点健康、证书可信或业务允许访问。客户端自己的DNS缓存和连接池，还可能继续使用旧答案或旧连接。')+
 table(['对象','固定教学例','负责什么'],[
 ['服务名','reports.apps.svc.cluster.local','让集群内客户端发现服务；实际集群域不一定是cluster.local'],
 ['Service地址和端口','10.96.0.20:443','客户端连接的稳定入口，不是一台固定Pod'],
 ['Pod地址和监听端口','10.42.2.8:8443','当前某个实际工作负载的传输目标'],
 ['TLS与HTTP身份','证书SAN、server_hostname、Host','校验对端身份，再选择正确的应用虚拟主机']])+
 figure('v23-service-tls-identity','假定工作负载直接终止TLS，地址经Service转发，而证书与HTTP路由仍按应用约定的名字判断。示意域名与下面本地实验域名各自独立。')+
 para('TLS客户端用server_hostname指定校验的服务名，支持时也将它放入SNI，供服务端选择证书。HTTP/1.1的Host或HTTP/2的:authority用于应用路由。证书链受信、名字匹配与HTTP资源存在要分别满足。IP形式访问若要验证IP身份，还需证书声明相应IP，不能把“改成Pod IP后能建连”当作正确解决办法。',
 '若入口代理终止TLS，外部客户端验证的是入口，入口到后端又是另一段连接：可能使用明文，也可能使用另一套TLS身份与信任。排查时画出每个终止点和每段校验责任。不要用关闭证书校验来掩盖名字、信任或代理配置错误。')+'</div>');

const serviceSelection=infraReadableHTML(
 knowledgeSubhead('Service先确定后端集合，再解释端口映射')+
 para('有selector的Service通常由控制器根据Pod标签维护EndpointSlice。selector匹配、Pod就绪、端口名或端口值解析都影响最终可用目标。containerPort是容器声明的端口信息，不会替进程调用listen，也不会凭空打开防火墙。Service的port是客户端访问端口，targetPort是后端目标；命名targetPort还必须能解析到相应Pod声明的端口。')+
 code('端口与标签示例 · 仅为知识说明，实际进程须监听0.0.0.0:8443','YAML',
 'apiVersion: v1\nkind: Service\nmetadata:\n  name: reports\n  namespace: apps\nspec:\n  selector:\n    app: reports\n  ports:\n    - name: https\n      protocol: TCP\n      port: 443\n      targetPort: https\n---\n# 对应Pod模板片段，省略镜像等其他字段\nmetadata:\n  labels:\n    app: reports\nspec:\n  containers:\n    - name: app\n      ports:\n        - name: https\n          containerPort: 8443')+
 para('检查EndpointSlice要取这个Service的全部相关切片，合并并去重，而不是看到一个地址就停止。ready、serving和terminating共同描述端点条件；常规ready可理解为正在服务且未终止，但publishNotReadyAddresses等设置会改变其含义。终止期的特殊转发和排空还取决于服务代理规则，不能写成“readiness失败，全部在途连接立刻断开”。',
 'EndpointSlice属于控制面里的后端事实。节点上的代理或其他服务实现需要观察变化，再更新实际转发状态；这个过程有传播延迟。API中后端已经改变，与某台源节点已经采用新规则，可能不是同一个时刻。')+
 knowledgeCheck('Service没有可用端点，先重启CoreDNS有依据吗？','先检查selector、Pod标签、就绪和全部EndpointSlice；DNS可以正常返回Service地址，而后端集合仍为空。只有解析链的证据指向DNS时，才继续定位DNS。'));

const serviceForwarding=infraReadableHTML(
 '<div class="mechanism-core" id="service-flow-return">'+knowledgeSubhead('沿一条连接追地址变化，也要追回包')+
 para('CNI（容器网络接口）连接Pod网络并配置所需网络资源；Service实现处理稳定入口到后端的转发；DNS处理名字解析。常见Linux实现中，kube-proxy观察Service和EndpointSlice，配置内核规则，数据包随后在数据面转发，并不逐包经过API Server或kube-proxy进程。也有替代服务实现，不能把某一种iptables路径当作所有集群的唯一路径。',
 '以本章固定示意为例：客户端10.42.1.7:53000连接10.96.0.20:443，某次连接选择10.42.2.8:8443，目的地址转换称为DNAT。视入口、流量策略与实现，源地址还可能保持，也可能被SNAT改写。报文目的地址决定往哪里送，应用看到的来源决定它怎样记录与授权，因此保留来源和能否转发是两项独立要求。')+
 code('假定使用有连接跟踪的NAT实现 · 不是所有CNI的固定抓包结果','TEXT',
 '客户端原始连接：10.42.1.7:53000 → 10.96.0.20:443\n选择后端之后：10.42.1.7:53000 → 10.42.2.8:8443\n若无SNAT，Pod看到客户端Pod IP；若有SNAT，按实际路径改写\n回程必须经过正确路由及相应连接/NAT状态，还原客户端预期的连接')+
 para('conntrack是连接跟踪：它保存这条流的方向、状态及相关转换信息。在这种实现中，新连接的后端选择可以被后续报文沿用；Service加了一个副本，不会自动把既有TCP连接拆开搬到新Pod。HTTP keep-alive、HTTP/2或数据库长连接会把许多请求复用到少数连接上，所以“副本数一半”不保证“业务请求量一半”。七层代理若按请求选择上游，应另看它的连接池与调度策略。',
 '跨节点还要经过Pod路由、底层网络和可能存在的封装。小包通而大请求卡住，应考虑MTU、分片或路径MTU发现，不是直接认定应用慢；单向请求到达而回应丢失，则继续核对回程路由、NAT、策略和连接状态。只有结合实际实现、同一连接五元组和两端观测，才能定位在哪段丢失。')+'</div>');

const servicePolicies=infraReadableHTML(
 knowledgeSubhead('NetworkPolicy的允许范围，要从选择器逐项算出来')+
 para('NetworkPolicy是对选中Pod流量的声明，只有网络插件实际支持并实施它，声明才会变成限制。ingress控制进入目的Pod，egress控制离开源Pod；某个方向没有被隔离时默认允许，被隔离后须满足该方向允许规则。一条连接若两端相应方向都已隔离，就要同时满足源egress和目的ingress。同一端同一方向的多条允许策略取并集，不存在通用的“后写规则覆盖前写规则”。')+
 figure('v23-policy-selector-logic','同一个from条目中的namespaceSelector与podSelector相交；拆成两个条目则允许来源合并。然后再独立判断源egress与目的ingress。')+
 code('只允许analytics命名空间中role=reader的Pod访问apps里的reports','YAML',
 'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: reports-from-readers\n  namespace: apps\nspec:\n  podSelector:\n    matchLabels:\n      app: reports\n  policyTypes: [Ingress]\n  ingress:\n    - from:\n        - namespaceSelector:\n            matchLabels:\n              team: analytics\n          podSelector:\n            matchLabels:\n              role: reader\n      ports:\n        - protocol: TCP\n          port: 8443')+
 para('team=analytics是命名空间的标签，不是命名空间名字本身。上例只声明目的端入站规则；若reader也被出口隔离，还要另外放行所需目标。DNS查询也是出站流量，解析器地址与UDP/TCP端口须按集群实际DNS路径处理，不能只允许业务端口后假定名字解析继续可用。',
 'Service转发前后按哪组地址匹配策略，与具体实现和NAT时点相关；节点流量、hostNetwork等也有专门语义。回答设计题时先说明实际控制对象与实现，再给规则。网络策略到L3/L4为止，即使连接放行，应用仍要验证主体和资源权限。'));

const serviceIngress=infraReadableHTML(
 knowledgeSubhead('入口、代理与重试，要放到同一条请求时间线')+
 para('Ingress或Gateway资源描述入口规则，实际接受流量的是对应控制器和数据面。资源存在不保证控制器安装、地址可达、证书有效或后端路由正确。边车或服务网格还会增加出站与入站代理，每一层可能有自己的发现缓存、连接池、超时和重试。',
 '假定客户端总截止时间800ms，入口建立连接与校验共80ms，入口排队120ms，后端一次尝试需250ms。若完全串行且无其他开销，留给后端的是600ms，可容纳两次250ms尝试与最多100ms间隔，但不能给每层都独立再分配800ms。真实系统中步骤会重叠、取消会传播延迟，要按实际关键路径计时。')+
 knowledgeFormula('重试放大先按最坏尝试算账','客户端最多3次 × 入口每次最多2次 × 服务每次最多2次 = 下游最多12次尝试','这是独立嵌套重试、未共享预算的固定题设，不是所有系统的默认行为。')+
 para('读失败与写结果未知的处理不同。写操作可能已经提交，只是回应未到；代理自动重试若不理解业务幂等，就可能重复产生效果。为每层规定哪些错误可重试、谁拥有总截止时间、重试是否计费及计入并发，业务写入再使用稳定操作身份与可查询回执。负载均衡健康、网络可达和业务提交分别用证据说明。'));

const serviceDiagnosis=infraReadableHTML(
 knowledgeSubhead('诊断先固定源位置，再逐层缩小范围')+
 table(['同一源发起的检查','通过后说明什么','仍需检查什么'],[
 ['DNS查询得到预期记录','该次名字解析获得了答案','缓存、Service类型与后续路径'],
 ['直连某个Pod的实际端口','该源到该Pod的特定路径可用','全部后端、Service选择、代理与策略'],
 ['连接Service成功','该次传输建立到某个目标','TLS名字/信任、HTTP路由与业务契约'],
 ['入口HTTP返回2xx','收到了某个应用回应','响应版本、内容、权限与持久提交'],
 ['同一业务ID查询到权威回执','相应业务动作已有可核对结果','产物是否满足用户目标与后续消费']])+
 code('只读观测 · 替换命名空间与工作负载名，在自己的测试集群执行','SHELL',
 'kubectl -n apps get service reports -o yaml\nkubectl -n apps get endpointslices -l kubernetes.io/service-name=reports -o yaml\nkubectl -n apps get pods -l app=reports -o wide\nkubectl -n apps get networkpolicy -o yaml\nkubectl -n analytics get networkpolicy -o yaml\n# 从实际失败的客户端Pod读取解析配置；镜像需包含cat\nkubectl -n analytics exec reader -- cat /etc/resolv.conf')+
 para('“从我的电脑成功”不能替代“从失败Pod成功”。命名空间、节点、身份、DNS配置、网络策略和代理都可能不同。每次比较只改变一个条件：同源对Pod与Service、同目标换HTTP Host、同域名换信任根。记录请求时间、源与目标、解析结果、证书名、HTTP状态和业务ID，让下一步能排除一个具体解释。'));

const servicePractice=infraReadableHTML(
 knowledgeSubhead('先预测四种结果，再运行真实TLS/HTTP对照')+nitLab('tls_identity.py')+
 para('运行前分别写出：TCP建立但未发HTTP时，服务端应记录几个HTTP请求？正确CA但证书名字错误，会进入HTTP处理吗？证书名正确、HTTP Host错误，失败应归哪层？程序答案依次为0、不会、应用路由；最终四次TLS尝试中两次到达HTTP处理。注意最初的纯TCP探测不计入SNI。',
 '变化题：把Service targetPort写成8444，而应用只监听8443，应该更换证书吗？不该；先证明后端传输端口正确。再把EndpointSlice目标端口修好，却让HTTP Host指向别的虚拟主机，TCP与TLS可能都成功，但仍不能得到目标报告。这两个故障可表现为完全不同的信号，不能都笼统归为“网络不通”。',
 '回到集群实战，把同样的控制变量方法用于实际源Pod、Service和入口，保存全部EndpointSlice条件与源节点实现。这里的回环程序只证明TLS和HTTP层的差别，不把示意中的DNAT、CNI或集群策略标成已实测。')+
 knowledgeCheck('扩容后新Pod几乎没有请求，是否必定调度失败？','先查新Pod是否已就绪和进入端点，再查实际数据面；即使这些都正常，既有长连接仍可能继续使用旧后端。区分连接数量、每连接请求数与新连接分布后再判断。'));

{
 const a=articles.find(a=>a.id==='k8s-networking');
 a.sections=[
  ['服务发现：名字、地址、端口与应用身份',serviceNames],
  ['后端集合：selector、端口与EndpointSlice',serviceSelection],
  ['数据转发：连接跟踪、来源与完整回程',serviceForwarding],
  ['网络策略：选择器、方向与NAT边界',servicePolicies],
  ['外部入口：TLS终止、代理与重试预算',serviceIngress],
  ['逐层诊断：从同一源位置验证到业务回执',serviceDiagnosis],
  ['实战与变化题：真实TLS、SNI和HTTP Host',servicePractice]
 ];
 a.refs=[...new Set([...a.refs,'v23DNS','v23Proxy','v23Slice','v23Policy','v23SSL'])];
 a.minutes=50;a.updated='2026.11.04';
}
cloudKnowledgeExplanations['service-network']=serviceNames+serviceSelection+serviceForwarding+servicePolicies+serviceIngress+serviceDiagnosis;
cloudKnowledgeDomain('native').refs=[...new Set([...cloudKnowledgeDomain('native').refs,'v23DNS','v23Proxy','v23Slice','v23Policy','v23SSL'])];
const networkLabsBeforeNIT=cloudFieldLabs;
cloudFieldLabs=id=>(id==='native'?'<h3>名称、TLS身份与应用路由：三个独立检查</h3>'+nitLab('tls_identity.py',false)+
 linkTo('k8s-networking','阅读完整发现、转发、策略与入口机制'):'')+networkLabsBeforeNIT(id);

