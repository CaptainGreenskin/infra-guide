/* Connect placed Pods to request paths, effective configuration and usable scaled capacity.
   Load after the existing progressive lessons and before first-reading-flow.js. */
(()=>{
 const p=(...rows)=>rows.map(x=>'<p>'+x+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const anchor=id=>'<span id="'+id+'"></span>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="full-code"><summary>'+title+'</summary>'+body+'</details>';
 const matches=(html,re)=>[...html.matchAll(re)].map(m=>m[0]);
 const blocks=html=>matches(html,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=html=>matches(html,/<figure\b[\s\S]*?<\/figure>/g);
 const links=html=>{
  const rest=html.replace(/<figure\b[\s\S]*?<\/figure>/g,'').replace(/<pre\b[\s\S]*?<\/pre>/g,'');
  const found=matches(rest,/<a\b[^>]*\bhref=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/g);
  return found.length?'<p class="practice-links">'+found.join(' ')+'</p>':'';
 };
 const select=(id,titles)=>{
  const a=articles.find(x=>x.id===id);
  if(!a||a.sections.length!==titles.length||a.sections.some((s,i)=>s[0]!==titles[i]))throw Error('Network/config source changed: '+id);
  return a;
 };
 const published={
  'k8s-networking':['subsection-1-rccynd','subsection-2-8a7h3t','subsection-3-4aahv','subsection-4-1jc1u8z','subsection-5-dj0iar','subsection-6-1m57fcl','subsection-7-1njkucl'],
  'config-secrets':['subsection-1-7kw63x','subsection-2-cufyfb','subsection-3-1f8tsyf','subsection-4-yc8oql','subsection-5-42cx9r','subsection-6-dpipfj','subsection-7-wkh4cz','subsection-7-5pl5op'],
  'k8s-autoscaling':['subsection-1-3leldk','subsection-2-5hh76l','subsection-3-okwq7o','subsection-4-1iqesp6','subsection-5-1ye4m7x','subsection-6-nhfr0o','subsection-7-1cxb905','subsection-8-1qdvyvu','subsection-8-cjjpw2']
 };
 function replace(a,bodies,desc){
  const before=a.sections.map(s=>s[1]).join(''),after=bodies.join('');
  const pres=html=>matches(html,/<pre\b[\s\S]*?<\/pre>/g);
  const hrefs=html=>[...html.matchAll(/\bhref=["']([^"']+)["']/g)].map(m=>m[1]).sort();
  const ids=html=>[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
  if(bodies.length!==a.sections.length)throw Error('Network/config section count changed: '+a.id);
  if(JSON.stringify(pres(before))!==JSON.stringify(pres(after)))throw Error('Network/config original code changed: '+a.id);
  if(JSON.stringify(figures(before).sort())!==JSON.stringify(figures(after).sort()))throw Error('Network/config figure changed: '+a.id);
  if(JSON.stringify(hrefs(before))!==JSON.stringify(hrefs(after)))throw Error('Network/config href multiset changed: '+a.id);
  const nextIds=ids(after);
  for(const id of [...ids(before),...published[a.id]])if(!nextIds.includes(id))throw Error('Network/config anchor lost: '+a.id+'/'+id);
  if(new Set(nextIds).size!==nextIds.length)throw Error('Network/config duplicate anchor: '+a.id);
  bodies.forEach((body,i)=>a.sections[i][1]=body);a.desc=desc;a.intro=desc;a.updated='2026.11.09';
 }

 const network=select('k8s-networking',['服务发现：名字、地址、端口与应用身份','后端集合：selector、端口与EndpointSlice','数据转发：连接跟踪、来源与完整回程','网络策略：选择器、方向与NAT边界','外部入口：TLS终止、代理与重试预算','逐层诊断：从同一源位置验证到业务回执','实战与变化题：真实TLS、SNI和HTTP Host']);
 const n=network.sections.map(s=>s[1]),n1=blocks(n[1]),n2=blocks(n[2]),n3=blocks(n[3]),n5=blocks(n[5]),n6=blocks(n[6]);
 if(n1.length!==1||n2.length!==1||n3.length!==1||n5.length!==1||n6.length!==2)throw Error('Kubernetes network code layout changed');
 replace(network,[
 anchor('service-name-address-identity')+anchor('subsection-1-rccynd')+
 p('从集群内一条真实请求开始。客户端访问 <code>http://10.96.63.29/work</code>，第 2 条记录返回 HTTP 200 和版本 <code>v1</code>。响应还回显了请求编号和 Pod UID，也就是处理这次请求的 Pod 的唯一标识。按这个 UID 查集群记录，可以确认接到请求的是 <code>10.244.0.5</code> 上的应用。',
 '客户端连的是 <code>10.96.63.29:80</code>，应用实际监听 <code>10.244.0.5:8080</code>。业务 Pod 被替换后，地址可能变。Service 为这一组 Pod 提供可保持不变的集群内入口，这个入口地址叫 ClusterIP。转发规则负责把新连接送到合格的后端。第 2 节继续用这条请求，看后端名单怎样改变。',
 '刚才直接用了入口 IP。如果从服务名字出发，连接之前还要先用 DNS 查出入口 IP。下图换成一组 HTTPS 报表示意地址。客户端先解析服务名，再连到 Service 的 443 端口，由转发规则送到某个 Pod 的 8443 端口。建立加密连接时，客户端按约定的名字验证 TLS 证书。随后应用处理请求，响应沿网络路径回到客户端。')+
 table(['对象','本章示意值','正常用途'],[['服务名','reports.apps.svc.cluster.local','集群内按名发现；实际集群域由配置决定'],['Service 地址和端口','10.96.0.20:443','客户端建立连接的虚拟入口'],['Pod 地址和实际监听端口','10.42.2.8:8443','本次被选择的应用后端'],['TLS / HTTP 身份','证书 SAN、server_hostname、Host','校验证书名字，再选择应用虚拟主机']])+
 figures(n[0]).join('')+
 '<details class="progressive-detail"><summary>查不同的 Service 名字，或核对 TLS 和 HTTP 身份</summary>'+
 p('普通 ClusterIP Service 像图中这样，DNS 地址记录通常指向它的虚拟 IP。无头服务（headless，<code>clusterIP: None</code>）可以直接返回后端地址，ExternalName 则返回指向另一个名字的 CNAME 别名。排障时，先看客户端是重新查了 DNS、从缓存读了地址，还是直接复用了连接池里的连接。',
 '证书的 SAN 字段列出它适用的名字。客户端用 <code>server_hostname</code> 指定校验名，也可在 TLS 握手时通过 SNI 发送这个名字，由服务端据此选择证书。确认签发链可信、校验名匹配后，客户端才发送 HTTP 请求。应用再按 <code>Host</code> 或 HTTP/2 的 <code>:authority</code> 选择虚拟主机，检查所请求的资源是否存在。若代理在入口终止 TLS，入口到后端是另一段连接，各自有传输和信任配置。')+'</details>',

 anchor('subsection-2-8a7h3t')+
 p('实测 Service 用 <code>selector</code> 按 <code>app=guide-service</code> 这个标签找候选 Pod，<code>port: 80</code> 是入口端口，<code>targetPort: 8080</code> 是后端端口。转发规则据此把送到 80 的连接交给实际监听 8080 的应用。',
 '下面的 YAML 对应上节的 HTTPS 示意。<code>app=reports</code> 选中报表 Pod，<code>targetPort: https</code> 引用 Pod 声明的同名端口 8443。<code>containerPort</code> 只记录端口信息，应用还要在可达地址上监听，例如 <code>0.0.0.0:8443</code>。')+n1[0]+
 p('控制器把匹配的 Pod 地址、端口和条件写入 EndpointSlice，节点上的转发组件再读取这些对象。<code>ready</code> 表示端点能否接常规流量，<code>terminating</code> 标记正在终止，<code>serving</code> 可用来判断终止中的端点能否继续服务。通常，正在服务且未终止的端点才为 <code>ready</code>，<code>publishNotReadyAddresses</code> 等配置会改变这个规则。一个 Service 可以有多个切片，排查时要合并去重，再核对地址、端口和条件。',
 '继续看 <code>/work</code> 实测。把开头处理请求的 <code>10.244.0.5</code> 记作 A，另一份副本 <code>10.244.0.6</code> 记作 B。请求地址不变，只让 A 的就绪检查失败。平台保留了 A 的地址，但把它标为未就绪。接着看新连接实际去了哪里。')+
 table(['阶段','A 的端点条件','每阶段选取的连续 20 条新连接'],[['两个 Pod 都就绪','ready=true','第 2–21 条均为 200，来自 A 和 B'],['A 的就绪检查返回 503','地址仍在，ready=false','第 29–48 条均为 200，只来自 B'],['A 恢复就绪','同一 UID，ready=true','第 61–80 条均为 200，再次来自 A 和 B']])+
 p('A 未就绪时，在 Pod 内直接访问它的 <code>/live</code> 和 <code>/work</code> 仍是 200，两个 Pod 的重启数也没有变化。表中是转发规则收敛后的样本，传播过程中的请求保存在完整记录里。排障时，即使域名已解析到正确的 Service IP，也要查看 EndpointSlice 里的地址、端口和就绪条件。'),

 anchor('service-flow-return')+anchor('subsection-3-4aahv')+
 p('CNI 是容器网络接口，网络插件据此为 Pod 连接和配置所需网络；Service 实现负责稳定入口到后端的选择与转发，DNS 负责名字解析。常见 Linux 集群由 kube-proxy 观察 Service 与 EndpointSlice 并配置内核规则，业务报文随后在内核数据面转发。其他实现可以采用不同机制，报文不会逐包经过 API Server。',
 '沿示意连接追一次地址变化：客户端 10.42.1.7:53000 连 Service 10.96.0.20:443，本次选择 Pod 10.42.2.8:8443。DNAT 改写目的地址，SNAT 改写源地址。是否保留客户端来源，取决于流量策略与具体路径；应用记录或使用来源时，要看它实际收到的地址。')+n2[0]+
 p('conntrack 是连接跟踪，保存连接方向、状态以及相应 NAT 关联。在这种实现中，新连接选定后端后，后续报文沿用该关联，回包再恢复客户端预期的连接。已有 TCP 连接不会因增加一个 Pod 就自动拆成两份。HTTP keep-alive、HTTP/2 和数据库连接池还会在一条连接上发送多个请求，连接分布与请求分布因此需要分别统计。',
 '跨节点路径还包括 Pod 路由、底层网络及可能的封装。MTU 是路径允许的报文大小约束；封装占用部分空间。小包成功、大传输停住时，检查 MTU 和路径 MTU 发现；请求到达而回应未到时，沿回程路由、NAT 与策略核对。固定源/目的 IP、端口和协议这五元组，再关联两端观察，才能找到同一条连接。'),

 anchor('subsection-4-1jc1u8z')+
 p('NetworkPolicy 是按选择器描述 Pod 流量许可的 API 对象，由支持它的网络实现执行。ingress 表示进入目的 Pod 的方向，egress 表示离开源 Pod 的方向；Pod 被声明了相应方向的 NetworkPolicy 选中，就在该方向进入隔离；未隔离时默认允许，隔离后按该方向的允许规则放行。两端相应方向都隔离时，需要源出口与目的入口同时允许。')+
 figures(n[3]).join('')+
 p('下面策略位于 apps，用顶层 podSelector 选中 app=reports 作为目的。同一个 from 条目内，namespaceSelector 和 podSelector 同时成立，表示“team=analytics 命名空间里的 role=reader Pod”；如果拆成两个 from 条目，便变成两个允许来源的并集，范围会改变。')+n3[0]+
 p('team=analytics 是命名空间标签，名称相同并不自动有该标签。此例只声明目的入口 TCP 8443；若 reader 的出口也隔离，还需配置相应出站许可。同一端同一方向的多条允许策略也取并集，规则顺序不提供“后写覆盖前写”的拒绝语义。',
 'DNS 查询同样需要出站路径，按实际解析器地址与 UDP/TCP 端口放行。Service 转发前后匹配哪些地址、hostNetwork 或节点流量如何处理，要对照网络实现和 NAT 时点。这里许可的是网络层与传输层流量，业务接收方继续校验身份、租户和资源权限；两层规则各自取证。'),

 anchor('subsection-5-dj0iar')+
 p('外部客户端还要经过入口。Ingress 或 Gateway 对象保存路由意图，安装的控制器将它交给实际代理或负载均衡数据面。代理接受连接、可终止 TLS，再选择上游后端；边车或服务网格还可能在 Pod 周围增加代理。每多一层，就多一份连接池、发现缓存、超时与重试配置。',
 '给同一请求分配总截止时间 800 ms。假设连接和校验 80 ms、入口排队 120 ms、一次后端尝试 250 ms，且这些阶段串行。剩给后端 600 ms，最多可容纳两次 250 ms 加 100 ms 间隔。传递剩余预算，才能让内层知道用户还愿意等多久；给每层重新发一份 800 ms 会让工作超出原终点。',
 '再单独估算重试放大：客户端最多三次，每次入口最多两次，每次服务再最多两次，在独立嵌套且不共享次数预算的题设中，下游最多 3×2×2＝12 次尝试。实际策略要共同限制错误类别、次数、总时间与并发。',
 '读失败可重新取值，写回应缺失却可能是提交后结果未知。自动重试写入时，需要稳定操作身份和可查回执，由接收方区分同一动作的重投与新业务。网络成功、HTTP 响应和业务提交分别对应连接、应用与数据事实。'),

 anchor('subsection-6-1m57fcl')+
 p('先从发生故障的源位置重现请求，再沿发现、传输、身份、应用和业务缩小范围。同一台电脑与某个 Pod 可能使用不同身份、DNS、策略和代理；每次比较固定源和目标，只改变一项条件。')+
 table(['检查','已经确认什么','接着核对'],[['DNS 得到预期记录','该次解析返回了答案','Service 类型、缓存与后续路径'],['直连某个 Pod 实际端口','同源到这个后端的路径','其他后端与 Service 选择'],['Service 连接建立','这次传输到达某个目标','TLS 名字、信任与 HTTP 路由'],['HTTP 2xx','收到一个应用响应','版本、内容、权限与业务效果'],['按业务 ID 查到权威回执','对应动作存在可核对结果','产物及消费者目标']])+n5[0]+
 p('命令分别读取源 Pod 的解析配置、Service 与全部端点、Pod 网络位置和策略。结合请求时间、源节点、目标、证书名字、HTTP 状态及业务 ID 形成同一次观察。直连 Pod 成功而 Service 失败，提示后端进程可达，可继续查入口到后端的映射；同一域名换信任根或 HTTP Host，则分别定位 TLS 与应用路由。'),

 anchor('subsection-7-1njkucl')+
 p('tls_identity.py 使用独立本机夹具验证传输、身份和 HTTP 路由。临时 CA（证书签发机构）签发 reports.internal.test 证书，客户端始终连接 127.0.0.1，再控制信任根、TLS 校验名与 HTTP Host。它不会查询集群 DNS，也不配置 Service、CNI 或系统信任。')+n6[0]+
 table(['本次实际动作','结果'],[['只建立 TCP，不发送 TLS/HTTP','连接成功，HTTP 请求计数仍为零'],['信任临时 CA，TLS 名字与 Host 都正确','HTTP 200，返回独立报告 R17/v3/37'],['名字错误，或不信任 CA','证书校验失败，没有进入 HTTP 处理'],['TLS 名字正确，HTTP Host 错误','TLS 通过，HTTP 421 unknown_virtual_host'],['最终服务端记录','四次 SNI，两次 HTTP，证书校验始终开启']])+
 p('SNI 出现在 TLS 阶段，最初纯 TCP 探测不计入四次 SNI。两次证书校验失败也没有发送 HTTP 请求。运行前先按这个顺序预测计数，再对照完整代码；HTTP 421 是此夹具为错误虚拟主机选择的应用响应。报告名 R17 与其他章节相近，输入和服务进程仍彼此独立。')+
 fold('tls_identity.py 完整源码',n6[1])+links(n[6])+
 p('变化题：Service targetPort 误写成 8444，应用仍监听 8443，先修传输目标；端口正确但 Host 指向其他虚拟主机，则继续查应用路由。扩容后新 Pod 很少收到请求，先核对它是否就绪、是否进入端点及源节点规则，再看旧连接和新连接分布。原生 Service、地址示意与本机 TLS 各验证一段路径，合并解释时保留各自对象和证据边界。')
 ],'沿 Pod、Service、DNS 与真实请求认识容器网络，再分别核对后端选择、回程、网络策略和 TLS/HTTP 身份。');

 network.updated='2026.11.11';
 network.sections[0][1]=network.sections[0][1].replace('</p>','<a href="/labs/kubernetes-service/validation.json">查看原始记录的 requests →</a></p>');
 network.sections[1][1]+=p('<a href="/article/cloud-service-lab/#kubernetes-service-probes">复现同一组就绪变化 →</a>');
 network.sections[3][1]+=p('把两端都隔离后，判断某条连接要问两次。源 Pod 的出口是否允许这个目标和端口？目的 Pod 的入口是否允许这个来源和端口？两个答案都为真才放行。DNS 查询有不同的目的地址和端口，需要单独判断。<a href="/article/k8s-networking/#kubernetes-network-policy-run">用同一对 Pod 验证两条路径 →</a>');
 network.sections[6][1]+=h('kubernetes-network-policy-run','在 Cilium 上分别验证 DNS 与 Pod 连接')+p(
 '在同一个命名空间创建 trusted、untrusted 和 orders。两个客户端在 kind 控制平面节点，orders 在工作节点。每轮先查 orders 的完整 Service 域名，再用一个新的 TCP 套接字直连 orders Pod IP 的 8080 端口。前者核对解析结果是否等于 Service ClusterIP，后者核对 HTTP 200、订单 O-104、金额 37、请求 ID 与后端 Pod UID。',
 '先让 orders 的入口只接受 trusted，再用一条空出站规则隔离 trusted，最后另加一条只允许它访问 orders TCP 8080 的出站规则。同一方向的许可取并集。空规则本身没有放行项，端口许可加入后订单连接便能通过，解析器所需的出站路径仍未获许可。')+
 trainingFigure('kubernetes-network-policy','DNS 与新建 TCP 连接分别探测。只改变策略，观察两条路径怎样分开。')+
 p('先按下表预测，再从执行记录比较每阶段最后两轮。')+
 table(['策略阶段','trusted：DNS / 直连','untrusted：DNS / 直连'],[
  ['初始无策略','有答案 / 200','有答案 / 200'],
  ['orders 只允许 trusted 入站','有答案 / 200','有答案 / TCP 超时'],
  ['再隔离 trusted 出站','解析失败 / TCP 超时','有答案 / TCP 超时'],
  ['仅补 trusted → orders:8080 出站许可','解析失败 / 200','有答案 / TCP 超时'],
  ['删除 orders 出站许可','解析失败 / TCP 超时','有答案 / TCP 超时'],
  ['删除 trusted 出站隔离','有答案 / 200','有答案 / TCP 超时'],
  ['删除 orders 入站限制','有答案 / 200','有答案 / 200']
 ])+
 p('用 x86-64 Linux、Docker、kind 0.33.0、kubectl 1.35.8 和 Helm 运行。程序用临时 kubeconfig 创建自己的集群，安装固定版本 Cilium 1.20.4，每个阶段保存探测及收敛过程，最后删除该集群。')+
 trainingCode('运行集群实验，再离线核对记录','SHELL','python3 -B network_policy_lab.py --json native-record.json\npython3 -B network_policy_lab.py --check-record native-record.json')+
 p('Linux CI 实跑中，七个阶段各有连续两轮符合表中预期。先看第 4 阶段的分叉，再对照首尾的 Pod UID、重启数和 EndpointSlice。用固定客户端与固定后端观察策略变化，可以排除后端被替换。此实验验证同一台 Linux 主机上的两个容器节点，Service 转发用前文的独立实验验证。<a href="/article/cloud-service-lab/#kubernetes-service-normal">继续核对 ClusterIP 的真实请求与后端选择 →</a>')+
 '<p class="practice-links"><a href="labs/kubernetes-network-policy.zip" download>下载源码、说明与记录 ↓</a> · <a href="labs/kubernetes-network-policy/validation.json">查看七阶段原始记录 →</a> · <a href="https://github.com/CaptainGreenskin/infra-guide/actions/runs/42553604497">Linux CI 执行 ↗</a> · <a href="https://v1-35.docs.kubernetes.io/docs/concepts/services-networking/network-policies/">Kubernetes 策略规范 ↗</a></p>';

 const config=select('config-secrets',['对象与版本：期望、文件、内存和认证','传播路径：环境变量、投射与subPath','一致快照：完整读取、校验和请求切换','全局约束：连接预算、截止时间与回退','Secret与身份：分发、存储和执行权限','凭据轮换：兼容窗口、撤销与旧会话','实战与变化题：文件、进程和真实HTTP']);
 const q=config.sections.map(s=>s[1]),q1=blocks(q[1]),q6=blocks(q[6]);
 if(q1.length!==1||q6.length!==4)throw Error('Configuration code layout changed');
 replace(config,[
 anchor('config-effective-versions')+anchor('subsection-1-7kw63x')+
 p('前面已经有运行中的 Pod、可写卷和可达服务，本章让应用取得本次应该使用的参数与凭据。配置控制程序行为，例如连接池大小与等待时间；凭据证明调用方持有某种身份，例如令牌或密钥；授权判断该身份允许访问哪些资源。ConfigMap 保存普通配置，Secret 保存需限制分发的敏感数据。',
 '正常更新按一条路径推进：保存源对象→传到容器环境或文件→进程读取并校验候选→切换生效快照→用真实请求验证。凭据还多一段：服务端是否接受新认证、旧凭据与会话如何退出。每一步记录版本与时间，才能判断更新停在哪里。')+
 table(['观察对象','记录什么','可能出现的相邻状态'],[['API 源对象','期望配置或凭据版本','源 v2，节点文件仍 v1'],['容器路径','此刻重新打开可读的内容','文件 v2，进程校验失败仍用 v1'],['进程生效快照','已校验并发布的应用代际','配置 v2，旧连接仍复用原会话'],['下游认证与效果','新认证、资源范围与实际请求结果','新密钥可用，旧会话尚未退出']])+
 p('应用代际是为候选生效顺序定义的版本号，可以配合内容摘要识别一次发布。Kubernetes resourceVersion 是用于 API 观察和并发控制的不透明版本值，不按整数作业务代际，也不跨对象比较大小。记录中关联镜像、配置摘要与凭据版本即可定位内容，不保存秘密原文。'),

 anchor('subsection-2-cufyfb')+
 p('注入是把 API 对象变成进程可消费输入的过程，方式不同，刷新路径也不同。环境变量在启动时交给进程；投射卷把 ConfigMap 或 Secret 键呈现在文件路径；外部客户端则按自身订阅、缓存或续期协议取值。')+
 table(['方式','源更新后的正常行为','应用怎样取得新值'],[['env / envFrom','不会自动改变已运行进程的环境','重启或替换实例，在启动时读取；源对象修改本身不触发 Deployment 模板发布'],['普通投射卷','kubelet 最终传播更新，受同步与缓存检测机制影响','重新读取并校验内容，再发布生效快照'],['subPath 挂载','不获得这类源对象的自动更新','重建挂载或采用另一种更新机制'],['外部配置或身份客户端','依赖客户端刷新、缓存和失败策略','观察版本、到期、校验与切换结果']])+
 p('文件路径是重新查找内容的入口，FD（文件描述符）是进程已经打开的对象。路径指向新内容后，旧 FD 可以继续读取旧对象，解析到内存中的配置也会继续存在。收到文件事件时应重新核对完整内容；监视器若绑定的是被替换对象，还需按机制重新建立观察，不能只计事件次数。',
 '本地 config_snapshots.py 明确保留 v1、v2 两个目录，并切换 current 链接，以观察旧 FD 与新路径。真实 kubelet 投射及旧目录清理不在这个程序里。它还启动真实子进程：启动环境模板从 4 改 6，旧子进程仍读 4，新子进程才读 6。若希望 Deployment 自动以新配置重建，可以把版本或摘要放入 Pod 模板，并实际执行相应发布流程。')+q1[0],

 anchor('subsection-3-1f8tsyf')+
 p('配置快照是一组共同生效的字段。声明 v1 为 pool=4、timeout_ms=100，v2 为 6、50。程序先读 current/pool 得 4，路径切换后再读 timeout_ms 得 50，就拼出从未发布的 4/50。两次独立打开成功，不保证属于同一份版本。')+
 figures(q[2]).join('')+
 p('正常加载先一次打开完整 JSON，读完后解析为候选；或先固定保留中的版本目录，再读取该目录全部字段。多文件清单还需核对成员与摘要，确保字段属于同一发布。候选先验证结构、精确类型、单位、范围及共同约束，全部通过再构造不可变快照。',
 '发布是把生效引用切到候选，实际并发环境使用相应锁或版本协议。请求开始时捕获一次引用，整次请求沿用它；切换后的新请求捕获新快照。于是旧请求完整使用 4/100，新请求完整使用 6/50，内存中可以同时保留两个有效版本。旧连接池等资源对象另按排空和释放协议退出。',
 '候选不合法时保留最后已知可用快照，同时报告候选代际、失败类别和上次成功时间。本地 Python 程序只演示单线程发布，不把一个语言的引用行为外推为多线程、多进程的一致切换协议。'),

 anchor('subsection-4-yc8oql')+
 p('字段范围合法以后，还要检查部署整体。配置夹具中四个实例共享 32 个应用连接预算：pool=6 时最多 24，pool=9 虽在允许的 1..12 范围内，总量 36 仍应拒绝。稳定数量之外，滚动更新还可能同时运行新旧实例，需要按“各代际副本数×各自池上限”求和，加上其他客户端与余量。',
 '若实例数改为六，pool=6 也会达到 36；继续用固定四实例校验，就遗漏了变化的条件。副本数量、连接池配置和下游预算应在同一份设计中核对。连接数满足预算以后，还要看数据库的查询、锁和实际完成率，后面的 HPA 章会继续计算扩容对下游的影响。',
 '时间配置要标明作用范围：建连、等池、单次 RPC 或整个请求截止时间。外层仅剩 80 ms，内层再等待 100 ms 后重试，会让工作越过用户终点。将单位、剩余预算与重试归属一起校验，更新后再观察真实等待和完成率。',
 '回退业务值时仍发布新代际。例如把 v2 的 6/50 回到 4/100，代际用 7；迟到的 v1 候选继续被拒。顺序号描述当前决策的先后，值可以合法回退；镜像解析能力和当前凭据的有效性仍要满足，否则回退镜像也无法恢复旧行为。'),

 anchor('subsection-5-42cx9r')+
 p('Secret 是敏感数据的分发对象，正常路径从受限 API 写入，经受控存储和节点分发，交给确实需要它的容器。Secret.data 的 base64 是可逆字节编码；传输 TLS 保护链路，静态加密保护相应存储，RBAC 等授权控制 API 操作，节点和容器权限再约束落地内容的读取。每层承担自己的保护职责。',
 '检查权限时沿实际取得能力的路径看。能在某命名空间创建任意 Pod 的主体，可能通过工作负载挂载其 Secret，即使没有直接 get Secret 的权限。应限制工作负载创建和可用服务账号、挂载对象与容器分发范围；只采集指标的辅助容器不必同时取得业务数据密钥。',
 '工作负载身份把运行实体关联到服务身份，短期令牌还声明受众、范围和到期时间，客户端需要按协议续期。认证确认身份，业务授权判断租户和资源访问。将长期凭据排除在镜像、前端文件、Git 历史与实验输出之外，观察记录使用非敏感版本号与认证结果。本章所有公开实验密钥均为无生产权限的常量。')+links(q[4]),

 anchor('subsection-6-dpipfj')+
 p('凭据轮换是把客户端从旧认证能力迁到新能力，再确认旧能力退出。服务端支持双凭据时，正常顺序为：启用 v2 并保留 v1，验证 v2 的新认证及所需范围，分发并校验候选，逐副本迁移，按约定退出旧客户端，最后撤销 v1 并验证它不能再建立新认证。')+
 figures(q[5]).join('')+
 p('credential_rotation.py 独立控制服务接受的版本、客户端当前版本和会话。先撤 v1、客户端还用 v1 的错误分支得到 401；双版本重叠分支允许迁移后再撤旧。重叠窗口要覆盖刷新、滚动、令牌与连接寿命，同时有截止时间及退出证据。只支持单凭据的服务需要协调切换或维护；已泄露凭据则按事件处置，可能需要立即撤销并承担中断。',
 '撤销密钥与撤销会话不总是同一件事。该夹具用 v1 创建独立会话，撤销 v1 后新认证 401，原会话仍 200；显式撤会话后才 401。真实服务可能逐请求校验、建连时认证或使用另发会话，要分别测试。业务回退也使用当前合法凭据，不能靠重新启用泄露密钥恢复旧版本。'),

 h('subsection-7-wkh4cz','文件、候选与进程环境：三个观察视角')+
 p('先运行 config_snapshots.py。它在本地临时目录保存完整 v1、v2，切换 current，观察独立读字段、保留 FD、请求持有快照和新进程环境。源文件、内存引用与进程环境分别取证，没有运行 Kubernetes 投射或文件 watch。')+q6[0]+
 table(['实际分支','结果'],[['分开读字段','4/50，从未作为一组发布'],['旧 FD / 重新打开路径','完整 v1 / 完整 v2'],['在途请求 / 新请求','完整 v1 / 完整 v2'],['五类无效候选','缺字段、bool 当整数、全局预算、坏 JSON、旧代际，均保留 v2'],['回退原业务值','发布代际 7 的 4/100'],['启动环境模板 4→6','旧子进程仍 4，新子进程 6']])+
 p('Config 用 frozen dataclass 表达不可变值。read_candidate 精确要求整数，避免 Python 的 bool 被当作普通整数接收；先构造通过检查的候选，再替换 active。两个版本目录始终保留，是本实验观察旧 FD 的条件，不承诺真实投射卷旧内容的保留期限。')+
 fold('config_snapshots.py 完整源码',q6[1])+
 h('subsection-7-5pl5op','新认证与原会话：两类退出证据')+
 p('credential_rotation.py 是另一份本机 HTTP 夹具。服务端决定接受哪些实验密钥，客户端只在新候选探测成功后改变 active；独立会话保存在服务端内存中。运行前分别预测撤密钥和撤会话的影响。')+q6[2]+
 table(['实际分支','结果'],[['启用 v2 并保留 v1','v2 探测 200，未重载客户端用 v1 也为 200'],['错误候选','401，active 保持 v2'],['撤销 v1 的新认证','v1 为 401，v2 为 200'],['早先创建的独立会话','撤密钥后仍 200，撤会话后 401'],['先撤 v1 的反例','旧客户端 401，重载 v2 后 200']])+
 fold('credential_rotation.py 完整源码',q6[3])+links(q[6])+
 p('把凭据轮换用于目标服务时，分别记录各副本何时启用新凭据、新认证的结果、旧会话何时退出。用实际业务请求检查轮换后的权限和效果。')
 ],'沿配置源、容器输入、进程快照与下游认证理解生效过程，再用完整候选校验、全局预算和凭据轮换连接更新与真实行为。');

 config.sections[1][1]+=p('第 7 节在同一个 Pod 里比较普通投射、旧 FD、subPath 和启动环境变量，先观察更新后哪些读法仍拿到旧值，再核对替换 Pod 的读数。<a href="/article/config-secrets/#native-config-projection">查看原生投射实验 →</a>');

 const credentialHeading='<h3 id="subsection-7-5pl5op">';
 if(!config.sections[6][1].includes(credentialHeading))throw Error('Configuration lab position changed');
 config.sections[6][1]=config.sections[6][1].replace(credentialHeading,
 h('native-config-projection','原生 Kubernetes：同一配置的四条读取路径')+
 p('在单节点 kind 上，一个 Pod 用三种方式读取 <code>app-config</code> 的 <code>version</code> 键。普通目录投射后读 <code>/projected/version</code>，用 <code>subPath</code> 则单独挂载其中一个文件，环境变量在启动时取值。长驻 Python 进程在启动时打开普通投射文件，并保留文件描述符（FD）。每次采样既重开路径，也用旧描述符从头读取，连同另外两个入口一起记录。')+
 '<figure class="training-figure"><a href="diagrams/kubernetes-config-projection.svg" target="_blank" rel="noopener" aria-label="放大：ConfigMap 更新前后的四条读取路径"><img src="diagrams/kubernetes-config-projection.svg" width="440" height="348" alt="更新 ConfigMap 后，原 Pod 重开普通投射读到 v2，原 FD、subPath 和环境变量仍为 v1；新 Pod 四条路径都读到 v2" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>更新源对象后，比较原进程重开路径与继续使用启动时的输入。<a href="diagrams/kubernetes-config-projection.svg" download>下载 SVG ↗</a></figcaption></figure>'+
 p('只更新 ConfigMap 的值 v1→v2，源 UID 保持不变，API 记录的 resourceVersion 从 442 变为 480。等普通投射读到 v2 后再取样，原 Pod UID 和容器 ID 都未变，重启数仍为 0。对照同一进程的文件编号 inode：重开路径读 v2，编号从 3 变成 7；原 FD 继续读编号 3 上的 v1。此时 subPath 和启动环境变量也仍是 v1。')+
 p('删掉原 Pod，再创建不同 UID 的替换 Pod。新进程启动时取得的是同一份已更新的 ConfigMap，四项读数都是 v2，其中 FD 也是新进程打开的。实验只验到进程可以读出的字节。要判断业务是否生效，还需第 3 节的候选校验与快照切换；<a href="/article/gitops-reconciliation/#gitops-native-run">GitOps 实战</a>另用真实 HTTP 核对进程返回的版本。')+
 trainingCode('复跑配置投射并离线核对随包记录','SHELL','python3 -B config_projection_lab.py --output native-record.json\npython3 -B config_projection_lab.py --check-record validation.json')+
 '<p class="practice-links"><a href="labs/kubernetes-config.zip" download>下载源码、说明和记录 ↓</a> · <a href="labs/kubernetes-config/validation.json">查看四路值、对象身份与 inode →</a> · <a href="https://github.com/CaptainGreenskin/infra-guide/actions/runs/42560029974">Linux CI 执行 ↗</a> · <a href="https://github.com/kubernetes/kubernetes/blob/v1.35.8/pkg/volume/util/atomic_writer.go">kubelet 文件投射实现 ↗</a></p>'+
 credentialHeading);

 const scaling=select('k8s-autoscaling',['控制链：建议、期望与实际可用容量','CPU口径：单位、request与匹配集合','保守计算：缺指标、容差与方向变化','指标选择：资源、容器、业务与外部信号','容量空窗：积压、净余量与有界接纳','伸缩行为：稳定窗口、速率与上下界','下游预算：副本、连接与实际完成率','实战与变化题：数学参考和真实规则引擎']);
 const s=scaling.sections.map(x=>x[1]),s5=blocks(s[5]),s7=blocks(s[7]);
 if(s5.length!==1||s7.length!==7)throw Error('Autoscaling code layout changed');
 replace(scaling,[
 anchor('scaling-control-chain')+anchor('subsection-1-3leldk')+
 p('前面已能创建副本、给 Pod 找节点并让请求到达后端。弹性伸缩再根据负载调整资源：水平伸缩增加同类副本，垂直伸缩改变单副本资源，节点伸缩提供可放置的新节点。HPA 是水平 Pod 自动伸缩器，它通过目标的 scale 接口调整期望副本，随后仍由工作负载控制器、调度器、节点和应用完成执行链。')+
 table(['控制对象','改变什么','完成之后还要看什么'],[['HPA','目标工作负载的副本期望','Pod 创建、绑定、Ready 与有效完成率'],['VPA 类机制','单 Pod 资源建议或配置','调整方式，以及 request 对 HPA 分母的影响'],['节点伸缩','可放置的节点资源与形状','配额、库存、节点加入及设备/卷准备'],['事件驱动伸缩','用队列等外部信号触发容量变化','信号、启动、消费与确认协议']])+
 p('沿同一工作负载记录三个数：指标算法的建议、工作负载的目标期望、实际可接请求副本。原始建议 6，经上下界与行为策略处理后才形成伸缩动作；期望 6 而只创建 4，查配额和控制器；创建 6 而两个 Pending，查节点形状；全部绑定但只有四个 Ready，查节点准备、探针和预热。',
 'HPA 不启动容器，节点伸缩也不替应用修复不匹配的硬亲和或卷拓扑。若固定容量数据库已经饱和，更多前端副本还可能增加争抢。先确定哪一层能力不足，再选择要改变的对象。'),

 anchor('subsection-2-5hh76l')+
 p('CPU 利用率要先规定分母。1000m 等于一个 CPU 单位，180m 表示采样窗口中约 0.18 CPU 的使用水平。HPA 的 CPU Utilization 按相关 request 求比例，request 是调度请求，不是 limit，也不是整台宿主的 CPU 总量。指标通常通过资源指标 API 提供，例如 metrics-server 汇集节点侧用量；HPA 还需将样本匹配到目标 Pod。',
 '先假设四个 Ready Pod，指标完整、各 request 200m、各使用 180m，目标 60%。总量 720m/800m＝90%，ceil 表示向上取整，基础建议 ceil(4×90/60)＝6。若总工作仍为 720m 且可均匀分摊，六个各用 120m，达到 request 的 60%；创建和就绪还需要后续时间。')+
 figures(s[1]).join('')+
 p('只把 request 改成 400m，使用量不变，利用率变为 720/1600＝45%，基础建议变为 3。request 也改变节点放置，所以修改它会同时改变调度账和控制信号。这里先算比例阶段，尚未加 min/maxReplicas；后面的 YAML 设最小四副本，其最终结果不能缩到三。',
 '再用异构请求检查口径：A 用 90m、request 100m，B 用 90m、request 900m。所核对 Kubernetes v1.34.1 资源函数先求匹配用量之和除以请求之和，取整数百分数，得到 18%；逐 Pod 百分比平均却是 (90%＋10%)/2＝50%。同 request 时两者相同，换分布后差别才暴露。CPU 已被节流时，用量还可能低于希望执行的需求，要结合限额和完成情况判断。'),

 anchor('subsection-3-okwq7o')+
 p('指标缺失表示没有可用样本，测得零表示确实观察到零消费。每个样本都应带对象、单位、时刻与覆盖窗口，CPU 计算还涉及就绪和初始化分类。先定位哪些 Pod 与 request 已匹配，再按所用控制器规则处理缺项；把所有缺项直接填零，会把采集失败解释成容量过剩。',
 '以下固定采用已核对的 v1.34.1 资源计算：原方向为扩容时，缺指标按零使用量补入；原方向为缩容时，按 max(100%,目标百分比) 的 request 补值。目标 60% 时，缩容缺项补 100% request。重新计算后，若落入容差或改变伸缩方向，保持当前副本。')+
 table(['四 Pod，各 request 200m，目标 60%','补值后整数利用率','参考结果'],[['三个 180m，一个缺失','540/800 → 67%','ceil(4×67/60)＝5'],['三个 170m，一个缺失','510/800 → 63%','比例仅高 5%，处于本例 10% 容差，保持 4'],['三个 60m，一个缺失','(180＋200)/800 → 47%','ceil(4×47/60)＝4'],['一个 20m，三个缺失','(20＋600)/800 → 77%','由缩转扩，保持 4']])+
 p('第一行仅按已知样本会得到 90% 和六副本，补值后的结果则为五；状态展示的原始平均值也可能仍是 90%。参考程序把其余列出的 Pod 都视为 Ready，未复制完整分类、策略或控制循环。因此现场同时保存 Pod 集合、指标时刻、conditions 和伸缩事件。',
 '看板若用“有样本的用量总和/所有 request 总和”，缺项常被隐含按零处理。这不等于上述缩容保守分支。应另显示完整性和新鲜度，区分零用量、部分缺失与全部遥测不存在。'),

 anchor('subsection-4-1iqesp6')+
 p('指标先表示负载，再通过所选目标换算建议。CPU 适合能随副本分担的计算负载；数据库阻塞时 CPU 低，排队却可以持续增长。队列深度是尚未完成的工作存量，还要结合到达率、每副本有效完成率与期望排空时间，才能计算所需容量。')+
 table(['HPA 指标类型','用于计算的量','接入时核对'],[['Resource / Utilization','用量相对 request 的百分比','匹配容器、请求与采样窗'],['Resource / AverageValue','每 Pod 原始平均资源用量','单位与均值，不沿用同一百分比分母'],['ContainerResource','指定容器的资源','滚动期间容器名与相关 request'],['Pods / 自定义指标','每 Pod 业务量，例如在途工作','适配器、采样集合与完成能力'],['Object / External','对象或外部信号，例如队列积压','指标服务、权限、可用性及目标类型']])+
 p('多个指标各算建议，控制器通常采用较大者。某指标取数失败，而其他有效指标仅要求缩容时，可能跳过缩容；有效指标仍要求扩容时可以继续扩容。最终行为按运行版本与配置核对。',
 '从零启动需要零副本时仍存在的信号，例如独立队列指标。是否支持 minReplicas=0、允许的指标与组件，取决于对应版本和功能配置；不存在的 Pod 无法提供自身 CPU 来触发第一次启动。'),

 anchor('scaling-delay-queue')+anchor('subsection-5-1ye4m7x')+
 p('另设容量题，把建议到真实能力之间的等待放回用户时间。旧容量 120 次/秒，输入由 120 升到 180。指标等待 20 秒、控制与放置 15 秒、初始化 40 秒，题设三段串行，新能力统一在第 75 秒到达。期间净流入 60 次/秒，积压为 60×75＝4500 项。')+
 figures(s[4]).join('')+
 p('按同一窗口记守恒：新积压＝旧积压＋接纳量−完成量−明确丢弃或过期量，队列最低为零。新容量若只有 180 次/秒，刚好处理新输入，4500 项没有净余量排空；若为 240 次/秒，净余量 60，还需 4500/60＝75 秒，到第 150 秒清空。',
 '将队列上限设 500 时，参考程序在前 75 秒拒绝 4000 项，随后按每秒一步模型在第 84 秒清空。它改变接纳量，不能当作同一批用户全部完成得更快。同步请求可明确拒绝或降级，必须完成的异步工作则需持久队列和相应期限。',
 '真实能力可能分批到达，初始化也可重叠，应按各时段重新计算。程序只描述总量，不模拟逐请求 FIFO 或超时分布，所以 84 秒不是某个请求的 p99。把空窗改为 120 秒，未限队列先积压 7200，240/s 容量再需 120 秒排空，总计 240 秒。'),

 anchor('subsection-6-nhfr0o')+
 p('基础建议还要经过稳定窗口、速率与上下界。缩容稳定窗口保留近期建议中的较高值，避免短暂下降立刻删除容量。声明窗口 300 秒，依次记录 t=0 建议 6、60 建议 3、180 建议 4、301 建议 3、481 建议 3；本例在 60 秒取 6，在 301 秒取仍留在窗口中的 4，到 481 秒才取 3。',
 '速率策略规定一段时间最多改变多少副本。下面扩容策略每 60 秒最多增加两个，缩容每 60 秒最多减少一个；periodSeconds 用于约束回看区间，不表示控制器只在其结束时检查一次。多策略的 Max/Min 选择、此前已发生的动作以及 min/maxReplicas 共同约束最终修改。')+s5[0]+
 p('该示例最小四、最大八，CPU 目标 60%，尚未在集群运行；Deployment、CPU requests 与指标链均需预先成立。稳定窗口的 6/4/3 历史是独立算例，不能拿其中三副本直接覆盖这份最小四的配置。对目标系统再验证启动、排空、故障余量和下一次扩回前的承载能力。'),

 anchor('subsection-7-1cxb905')+
 p('扩容还要接回配置章的全局预算。以下独立题设：数据库允许 200 个连接，其他客户端占 80，每个应用 Pod 池上限 40。应用剩余 120，所以按连接预算最多三个 Pod。若每 Pod 能完成 60 次/秒，三个仅提供 180 次/秒，只追平前面的输入，不能清除旧积压。',
 '要用四个 Pod 提供 240 次/秒，floor 表示向下取整，每池上限需不超过 floor((200−80)/4)＝30，且在这种池配置下数据库和应用仍能达到预期完成率。池上限限制潜在连接数，不证明真实并发能力。上节 YAML 的最大八只演示字段，不适用于这份连接预算；滚动额外副本与启动建连也要计入。')+
 table(['观测','沿哪条关系继续核对'],[['副本增加、CPU 下降、超时更多','连接等待、数据库完成率与重试，判断是否把压力移到下游'],['建议增加、Pod 持续 Pending','配额、调度条件、节点形状与卷拓扑'],['新副本已就绪、流量仍在旧 Pod','端点规则、新旧连接数及每连接请求量'],['缩容后短时失败','停止接新工作、排空时序与业务回执']])+
 p('将副本、池上限和实际下游完成率放在同一窗口，才能决定扩容是否有收益。网络章的连接复用还解释了新 Pod 为什么可能暂时没有工作；Ready 数量与实际参与完成的容量也要分别观察。')+links(s[6]),

 h('subsection-8-1qdvyvu','用参考程序复算比例、窗口与队列')+
 p('scaling_reference.py 先按固定 v1.34.1 资源规则处理七组完整或缺指标输入，再独立计算容量空窗、稳定窗口和数据库连接预算。它使用标准库和精确比例，不启动指标 API、HPA 或节点。')+s7[0]+
 table(['实际核对','结果'],[['四个 180m，request 200m→400m','基础建议 6→3'],['100m/900m request，各用 90m','合并利用率 18%，错误逐 Pod 平均 50%'],['三个 180m，一个缺项','补值后 67%，建议 5'],['三个 60m，一个缺项','按 request 的 100% 补值后 47%，建议 4'],['缺项落入容差或导致方向反转','保持四副本'],['180/s 或 240/s 新容量','4500 不减，或第 150 秒清空'],['上限 500 的队列','拒绝 4000，第 84 秒清空']])+
 p('逐项预测后对照 recommendation、queue_model 和历史窗口代码。七种资源建议依次为 6、3、1、5、4、4、4；异构双 Pod 算例的一副本也是策略前结果，不套用示例 YAML 最小四。固定流体模型验证数量守恒，不生成请求延迟分布。')+
 fold('scaling_reference.py 完整源码',s7[1])+
 h('subsection-8-cjjpw2','用真实规则引擎区分缺失与零')+
 p('prometheus_cpu.py 调用 promtool 3.5.0 的规则解析与测试，输入是四组固定 CPU gauge，即给定时刻的用量值。此处规则供看板展示加权比值与完整性，未接入 HPA；它与前面资源控制器参考分别验收。')+s7[2]+
 table(['实际规则输入','输出'],[['不同 request','加权比值 0.18，错误均值 0.5'],['一个 Pod 用量缺失','朴素比值 0.09，完整性 0'],['明确观察到零','比值 0，完整性 1'],['全部遥测不存在','没有结果，不补成 CPU 0 或完整性 0']])+
 p('fuzzy_compare 允许浮点末位差异，测试仍核对数值和标签。下面保留程序与实际规则、四组测试；promtool 执行证明规则引擎按输入工作，不证明 metrics-server、采样或 HPA 适配器已在集群运行。')+
 fold('prometheus_cpu.py 完整源码',s7[3])+fold('cpu.rules.yaml 原规则',s7[4])+fold('cpu.test.yaml 四组测试',s7[5])+links(s[7])+
 p('目标集群验收沿同一负载保存：指标时间与覆盖集合、HPA conditions、desiredReplicas、Pod 创建/绑定/Ready、新容量完成率、接纳、拒绝和积压。再将保存的控制配置与事件对应到下面的只读观察。')+s7[6]+
 p('CPU 下降可能来自更多副本，也可能来自请求被拒、下游阻塞或指标丢失。伸缩完成由用户目标定义：同一窗口内知道实际接纳与完成多少、还积压多少、容量何时可用，再看延迟和成本，才能把伸缩动作接回业务结果。')
 ],'沿指标、HPA 计算、期望副本和实际服务容量解释伸缩，再以整数比例、缺指标、队列空窗与下游预算核对结果。');

 scaling.sections[0][1]+=p('第 8 节用真实 CPU 指标驱动 HPA，再让新增 Pod 暂缓通过就绪探针。沿同一个 Deployment 核对期望何时改变、可用副本何时增加。<a href="/article/k8s-autoscaling/#native-hpa-control">查看原生 HPA 实验 →</a>');

 scaling.sections[7][1]+=h('native-hpa-control','原生 HPA 实战：期望副本先于就绪')+
 p('在单节点 kind 中，Metrics Server v0.9.1 从 kubelet 读取 CPU 用量，经资源指标 API 提供给 HPA。每个工作容器请求 100m，CPU 上限为 200m。HPA 的目标是 request 的 50%，副本范围为 1 到 2。程序用 Pod 内的标记文件启停原 Pod 的忙循环。')+
 '<figure class="training-figure"><a href="diagrams/kubernetes-hpa-control.svg" target="_blank" rel="noopener" aria-label="放大：CPU 指标、期望副本与可用副本"><img src="diagrams/kubernetes-hpa-control.svg" width="440" height="379" alt="空闲时期望和可用均为 1，负载增加后期望为 2 而可用仍为 1，新 Pod 就绪后可用达到 2，撤掉负载后两者回到 1" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>同一次扩容分别核对 HPA 期望、Deployment 可用副本和 Pod 就绪条件。<a href="diagrams/kubernetes-hpa-control.svg" download>下载 SVG ↗</a></figcaption></figure>'+
 p('本次原 Pod 的资源指标样本从约 10.1m 升到 195.0m，越过目标对应的 50m。HPA 的 <code>desiredReplicas</code> 与 Deployment 的 <code>spec.replicas</code> 都变成 2。新增 Pod 已是 Running，但仍缺少通过探针的标记，Deployment 的 <code>availableReplicas</code> 保持 1。补上标记后，同一个新增 Pod UID 变为 Ready，可用副本升到 2。')+
 p('可用副本已经是 2 的那次观察里，HPA 的 <code>currentReplicas</code> 仍显示 1。指标 API 和控制对象分别读取，各自有采样窗口或更新节奏。比较记录时先对齐时间和对象，不能把几个字段当作同一时刻的计数。')+
 p('停止忙循环后，HPA 状态记录 CPU 利用率降至 10%，期望与可用副本回到 1。实验把缩容稳定窗口显式设为 0 秒，仍需等待新样本与控制循环。这次验收覆盖副本变化和 Ready 条件。业务完成率需要前面定义的实际请求与队列观测。')+
 trainingCode('复跑原生 HPA 并离线核对随包记录','SHELL','python3 -B hpa_control_lab.py --output native-record.json\npython3 -B hpa_control_lab.py --check-record validation.json')+
 '<p class="practice-links"><a href="labs/kubernetes-hpa.zip" download>下载源码、说明和记录 ↓</a> · <a href="labs/kubernetes-hpa/validation.json">查看指标窗口、期望和 Pod UID →</a> · <a href="https://github.com/CaptainGreenskin/infra-guide/actions/runs/42561685247">Linux CI 执行 ↗</a> · <a href="https://v1-35.docs.kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/">Kubernetes 资源指标链 ↗</a></p>';

 const packetFigure='<figure class="training-figure" id="service-packet-rewrite"><a href="diagrams/kubernetes-packet-rewrite.svg" target="_blank" rel="noopener" aria-label="放大 Service 的请求与回包路径"><img src="diagrams/kubernetes-packet-rewrite.svg" width="1080" height="548" loading="lazy" alt="控制信息同步到节点规则；客户端 10.42.1.7:53000 请求 Service 10.96.0.20:443，目的改为后端 10.42.2.8:8443；回包按连接记录恢复 Service 源地址。"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>观察同一连接的两端地址。虚线表示规则同步，蓝色和绿色实线分别表示请求与回包。 <a href="diagrams/kubernetes-packet-rewrite.svg" download>下载 SVG ↗</a></figcaption></figure>';
 if(!network.sections[2][1].includes(n2[0]))throw Error('Service packet figure insertion point changed');
 network.sections[2][1]=network.sections[2][1].replace(n2[0],packetFigure+n2[0]);
})();
