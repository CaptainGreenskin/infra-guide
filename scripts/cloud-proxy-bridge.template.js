/* Authored source. build-cloud-proxy.cjs embeds the exact downloadable Python file. */
const cloudProxyLabSource = __CLOUD_PROXY_SOURCE__;
const cloudProxyBridgeEdits = [];

{
  const article = articleById('vpc-network');
  const table = (head, rows) => '<div class="table-wrap"><table><thead><tr>' +
    head.map(value => '<th>' + value + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(row => '<tr>' + row.map(value => '<td>' + value + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
  const figure = (name, alt, caption) => '<figure class="training-figure"><a href="diagrams/cloud-proxy-' + name + '.svg" target="_blank" rel="noopener" aria-label="放大：' + alt + '"><img src="diagrams/cloud-proxy-' +
    name + '.svg" width="1120" height="700" loading="lazy" alt="' + alt + '"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>' + caption + '</figcaption></figure>';

  article.sections[5][1] = infraReadableHTML(`
<p>前面五节已经把名字、地址、路由、访问控制和 NAT 分开。现在把入口代理展开：它收到一个请求后，还要选择后端、建立或借用连接、等待结果，再把响应发给用户。请求穿过代理，并不意味着从头到尾只有一条连接。</p>

<h3>先区分四层转发和七层代理</h3>
<p>这里的“层”是协议分工：第四层是 TCP 等传输协议，第七层是 HTTP 等应用协议。四层设备可以按源/目的地址、端口和连接状态选择去向；七层 HTTP 代理还可以读懂请求中的主机名、路径和方法，例如把 <code>/orders</code> 发往订单服务。若 HTTP 内容被 TLS 加密，代理必须先解密，才能依据这些内容作决定。</p>
${table(['模式', '按什么选择去向', '连接与加密边界'], [
  ['四层地址转换或直接返回', '地址、端口、连接状态等', '可能只转发报文；不能一概画成两个应用层套接字'],
  ['四层完整 TCP 代理', '通常在连接建立时选择后端', '接收前端 TCP，再另建后端 TCP；可透明传递 TLS 字节'],
  ['七层 HTTP 代理', '可按每个请求的 Host、路径、方法选择', '前后两段连接独立；解析 HTTPS 需要终止入口 TLS']
])}
<p>本节后面实际运行的是第三种：客户端 → P → A/B，P 是代理，A/B 是两个订单后端。<strong>前端连接</strong>是客户端与 P 之间的 TCP 连接；<strong>上游连接</strong>是 P 与后端之间的 TCP 连接。“上游”只是代理对被调用服务的称呼。每一段都有自己的两端地址、临时端口、超时和关闭时刻。</p>
${figure('two-legs', '两个前端连接先后借用同一个 A 后端连接；P 另有通向 B 的连接池', '同一组实验对象：P-c1/P-c2 是不同前端连接，三次顺序查询共用 A-c1。连线表示实际 TCP 连接，箭头上的请求不是新的连接。')}

<h3>地址、HTTP 主机名和 TLS 身份各负责什么</h3>
<p>连接到某个 IP:端口，只决定把字节交给哪个监听者。HTTP 的 <code>Host</code> 字段再告诉监听者：这次请求访问哪个站点。实验前端接受 <code>orders.lab.test</code>，P 转发时明确改写成后端接受的 <code>orders.internal.test</code>；两者都是请求字段，不需要修改本机 DNS。错把前端名称原封不动传入只接受内部名称的后端，TCP 即使连通，应用仍可能拒绝。</p>
<p>若加上 TLS，还要多问“对端是谁”。<strong>证书</strong>把公钥与服务器身份联系起来；客户端用自己信任的<strong>证书颁发机构（CA）</strong>验证签发链，再核对证书中的名称是否匹配它要访问的服务。<strong>SNI</strong>是 TLS 握手时发送的服务名称，帮助服务器选证书；<strong>Host</strong>是握手完成后 HTTP 请求中的站点名称。这两个字段所在阶段不同，选到了证书也不等于完成了证书验证。</p>
${table(['部署方式', '谁验证谁', '真正需要独立检查的边界'], [
  ['TCP 透传 TLS', '客户端验证最终后端证书', 'TCP 可以分两段转发，TLS 仍是一条端到端会话；P 不读取加密的 HTTP 路径'],
  ['P 终止入口 TLS，向后端发 HTTP', '客户端验证 P 的证书', '后端段没有 TLS 加密；入口证书有效不会给后端段自动增加保护'],
  ['P 终止入口 TLS，再以 TLS 连接后端', '客户端验证 P；P 另行验证后端的信任链和服务名', '两条 TLS 会话、两次信任判断；还要正确设置后端 SNI 和 HTTP Host']
])}
<p>客户端认证、授权策略与上述服务器身份验证又是不同的事。验证了服务器名称，仍要由服务判断调用者能否读这笔订单。已有的<a href="#/article/k8s-networking?section=7">TLS、证书名称和 HTTP Host 实验</a>用真实握手区分这三件事；本节新增实验专门观察 HTTP 代理的连接、排空与重试。</p>

<h3>先选合格后端，再借用连接</h3>
<p>代理通常先得到一组<strong>可接收新工作的后端</strong>，再按轮询、权重或其他规则选择其中一个。就绪检查回答“现在是否允许分配新工作”，不保证下一次调用必然成功。选到 A 以后，P 可以新建连接，也可以从<strong>连接池</strong>中借用已经连到 A 的空闲连接。</p>
<p>复用节省了反复建连的开销，但连接数和请求数因此不再一一对应。实验先在 P-c1 上查询两次，再换成 P-c2 查询一次；A 实际接受连接的日志仍只有 A-c1。这说明的是三个<strong>先后完成</strong>的 HTTP/1.1 请求共用连接。实验用锁把一次请求和完整响应读取包在一起；同一连接还在读取前一个响应时，后一个请求先等待。它没有实现 HTTP/2 的多个请求流并行传输。</p>
<p>这里有两个容易混淆的上限：允许同时处理多少工作，与保留多少空闲连接。前者控制在途并发，后者控制可复用的连接缓存。生产代理的参数需要逐项读定义，例如 NGINX 的 <code>upstream keepalive</code> 数值约束每个工作进程保留的空闲上游连接，并非整个服务能打开的全部连接。空闲连接很多、当前请求很少，与当前请求很多、池槽位不够，是两种不同现象。</p>

<h3>排空：先停止分配，再等已经接收的请求结束</h3>
<p><strong>排空</strong>是让实例退出新工作分配，同时尽量完成已经分配的工作。把 B 标记为排空后，P 即使手里还保留着连到 B 的空闲连接，也不应继续把新请求送给 B。后端资格决定“能否派活”，连接池只解决“怎样连接”，顺序不能反过来。</p>
<p>用一个请求就能检验时序：先让 B 接到查询但暂不返回；再把 B 从新请求候选中移除，此时 B 的在途请求数仍为 1；随后发来的查询必须走 A；最后放行 B 原来的查询，等它完成后关闭 B 的池连接。实验用事件通知控制这四步，图上是先后关系，不是猜测的生产耗时。</p>
${figure('drain', 'B 原有请求继续执行，排空以后新查询改走 A，B 在途归零后关闭连接', '选后端、借连接、完成响应、释放在途计数是四个动作；停止派活与立即断开连接不是同一个动作。')}
<p>生产发布还需要给排空设置最长等待时间，并与应用退出顺序配合。等到期限仍未完成，就要决定继续等待、拒绝还是强制关闭。强行关闭连接只结束了本次通信；后端已经提交的写入可能仍然存在。Kubernetes 中先后端资格变化、再停止进程的传播过程，接着在<a href="#/article/k8s-networking">服务网络</a>与<a href="#/article/k8s-workloads">工作负载生命周期</a>中核对。</p>

<h3>重试：先判断能否重放，再同时限制次数和总时间</h3>
<p><strong>重试</strong>是再次发送同一个业务操作，不是给所有错误换个后端。先问操作能否安全重放：本实验查询订单的 GET 没有写入副作用，B 返回 503（暂时无法提供服务）后允许尝试 A；POST 发布会产生业务记录，后端提交后若响应丢失，代理只能知道“结果未知”，不能由 502 就推断“没有执行”。HTTP 方法本身也不能替代业务契约，实际把写操作藏在 GET 里仍有重复执行风险。</p>
<p>然后给<strong>同一个请求</strong>设置尝试次数上限和共同的截止时间。每换一次后端，都应从原截止时间扣除已经花掉的部分。下面的预算按串行阶段、同一计时起点估算：</p>
${table(['步骤', '固定题设', '算出的约束'], [
  ['从用户预算切出上游窗口', '用户愿意等 800 ms；入口建连 80 ms，已排队 120 ms', '最多剩 600 ms 给上游处理与尝试间等待'],
  ['安排两次尝试', '每次最多 250 ms，中间等待 100 ms', '2 × 250 + 100 = 600 ms，已经没有额外余量'],
  ['另一个情形：只设共同截止时间，未设单次上限', '第一次已用 430 ms，又等待 100 ms', '原 600 ms 窗口只剩 70 ms；不能再给第二次完整 250 ms'],
  ['协调多层重试', '客户端、网关、服务分别独立尝试 3、2、2 次', '最坏可放大成 3 × 2 × 2 = 12 次后端调用']
])}
<p>这张预算表要求先定义时间从哪里开始。后面的程序在入口校验和读取小请求体后，才启动上游窗口；普通请求共用 2 秒，受控慢请求共用 0.25 秒。它既限制池等待，也限制上游响应等待。底层 socket 超时主要约束某次 I/O 等待，所以程序还在共同截止时间关闭本次上游 socket，防止对端靠持续零星发字节拖过总期限。入口读请求体和把响应送到客户端的时间没有计入这个窗口。</p>
<p>重发还需要保留可重放的请求体，并确认没有把前一次响应发送给客户端。本实验先缓冲最多 4096 字节的受控请求体，等上游完整响应和重试决策结束后才发下行响应；流式上传、流式下载需要另一套策略。若客户端已经读到一部分正文，代理再把另一个后端的完整正文接上去，会破坏同一份响应的含义。</p>
<p>尝试次数也不能替代时间约束：最多两次，仍可能第一次就用光全部时间；时间有余量，也不能突破次数上限。收到 503 后是否重试、收到部分响应后能否换后端、POST 是否允许重放，都要有明确策略。NGINX 的 <code>proxy_next_upstream</code>、次数和时间参数体现了这些不同控制项；不要把它的“允许传给下一个后端的时间窗口”直接当成本实验覆盖整个响应的共同截止时间。</p>

<h3>最后回到用户：提交、代理收到、用户收到是三个时刻</h3>
<p>假设客户端在 500 ms 放弃，入口 50 ms 建连，100 ms 开始向后端转发，后端 460 ms 完成处理。后端完成后，结果还要经过上游连接、代理处理和前端连接。460 ms 完成并不保证用户在 500 ms 前读到完整响应；取消等待也不自动撤销后端写入。</p>
<p>因此排障要把一笔请求的前端连接、每次上游尝试、实际业务提交与用户结果对起来。第七节先把它们落实为连接日志和 SQLite 记录，再回到路由与访问控制练习；下一章<a href="#/article/network-diagnosis">网络排障</a>继续用这些边界缩小问题范围。</p>
`);

  const practice = infraReadableHTML(`
<h3 id="cloud-proxy-run">先运行：两个后端、连接复用、排空与受限重试</h3>
<p>这次不只在字典里计算路由。程序在 <code>127.0.0.1</code> 的临时端口启动三个真实 HTTP/1.1 监听者 P、A、B，客户端通过 P 查询订单 O-104，金额固定为 37。P 有独立的后端选择器和连接池；A/B 另外记录接受到的 TCP 连接与请求；写入效果由临时 SQLite 数据库记录。三份事实可以互相核对。</p>
<p>先预测三个结果再运行：换一条前端连接后，上游是否必须重连？B 进入排空时在途为 1，新查询应走哪里？写入提交后断开响应，客户端看到失败是否就能再发一次？</p>
<p>需要 Python 3.9+ 标准库，无第三方安装。下载并解压 <a href="labs/cloud-proxy.zip" download>完整实验包</a>，进入 <code>cloud-proxy/</code> 后执行：</p>
`) + trainingCode('在解压后的 cloud-proxy 目录运行', 'sh', 'python3 -B proxy_lab.py > proxy-run.json\npython3 -m json.tool proxy-run.json') + infraReadableHTML(`
<p>JSON 的 <code>positive</code> 是受限策略，<code>unsafe_write_retry</code> 是在全新临时环境里故意放开 POST 重试的负例。每次运行的端口会变；P-c1、A-c1 等编号按各监听者接受连接的先后生成。读下面的状态和关系，不照抄临时端口。</p>
${table(['情形', '客户端结果 / 上游尝试数', '从另一侧核对'], [
  ['错误前端 Host', '421 / 0', '后端实际请求日志没有 wrong-host'],
  ['同一前端查询两次，再换前端查询', '三个 200 / 每次 1', 'P-c1、P-c2 两条前端连接，后端三次都是 A-c1'],
  ['B 正在处理时开始排空', '新查询 A 返回 200；旧查询 B 最后返回 200', 'drain_started 时 active=1；新查询先完成，旧查询放行后在途才归零'],
  ['B 暂时繁忙', '200 / 2', 'transient 的请求日志依次是 B:503、A:200'],
  ['A、B 都繁忙', '503 / 2', 'always-busy 只有 B、A 两次，没有第三次尝试'],
  ['B 持有慢查询直到预算耗尽', '504 / 1', 'slow-first 仅抵达 B；没有用新预算再向 A 发起尝试'],
  ['POST 提交后丢失响应，禁止重放', '502 / 1，结果未知', 'SQLite 实际仍有一次 total=37 的效果'],
  ['负例：同一 POST 无条件换后端重放', '502 / 2', 'SQLite 有 A、B 各一次效果，合计 74，失败响应没有阻止重复写入']
])}
<p>排空的顺序由 B 的通知事件与驱动程序放行事件控制；日志中的 <code>seq</code> 只表达观测顺序。对照 <code>drain-held</code>、<code>drain-new</code> 两个请求，确认新查询抵达 A 时，B 的旧查询仍在等待。查询输出里的连接编号，再对照 <code>accepted</code> 与 <code>upstream_attempt</code> 中真实套接字两端地址，可以验证两段 TCP 和连接复用，不必只相信代理返回的标签。</p>
<p>判断完成顺序时，<code>client_received</code> 是驱动完整读到下行响应，<code>upstream_response</code> 是 P 完整读到上游响应。新查询的前一类事件先出现，旧查询的后一类事件随后才出现，接着才有 B 的 <code>drain_finished</code>。后端写出响应后追加的日志可能被线程调度延迟，用接收方的实际读取事件，更能对齐本题要验证的边界。</p>
<p>慢查询还有一个细节：P 的预算耗尽后已经给客户端返回 504，驱动才放行 B 的处理。B 随后可以完成自己的逻辑，但响应已经无法交还本次调用者。限时等待控制的是通信资源与调用者等待；业务是否完成，要继续查业务证据。写入负例就是把这一点变成了可数的 37 和 74。</p>

<h3>沿实现读一遍：资格、连接、响应和业务效果</h3>
${table(['按顺序找源码', '实现承担的责任', '可以独立检查的事实'], [
  ['Control.reserve / drain_b / release', '先排除未就绪、排空、已试过的后端；记录已分配工作', '排空前已分配给 B 的工作保留；新请求选 A'],
  ['Pool.exchange', '拿池锁、借连接、发送请求、读完有长度边界的完整响应，再释放池锁', 'reuse 三次的上游地址对应同一个 A 接受连接'],
  ['deadline 与 interrupt_at_deadline', '锁等待、建连、响应都扣同一上游窗口；期限到关闭本次连接', 'slow-first 只有一次尝试，耗尽后不再派给 A'],
  ['Proxy.process 的 retryable 与 tries', '只读契约和错误条件决定是否重放；最多两次，逐次换后端', '业务标识 rid 不变；请求日志保留每次 attempt'],
  ['Backend.process 的 SQLite INSERT / commit / shutdown', '先提交真实业务效果，再真实关闭套接字丢失响应', '默认策略一次 37；无条件写重试两次共 74']
])}
<p>源码里每个后端只有一个可借用连接，因此同一后端的并发请求需要等锁。<code>active</code> 计的是已经分配、尚未释放的工作，包含等连接的部分；不是后端 CPU 正在执行的线程数。若要扩展为多个池槽位，应分别记录分配量、池等待量与后端实际在途量，再决定谁负责限流。</p>
<p>本实验只接受受控的小型、带 Content-Length 的 HTTP 消息，不实现流式转发、HTTP/2、多进程共享池或生产代理性能。它没有新增 TLS、DNS、云负载均衡和 Kubernetes 实测。证书与主机名去前述 TLS 实验核对；生产代理配置可继续阅读本章官方资料中的 NGINX 指令定义。</p>
<p><a href="labs/cloud-proxy/README.md">运行说明与读源码顺序</a> · <a href="labs/cloud-proxy/proxy_lab.py">完整源码文件</a> · <a href="labs/cloud-proxy/validation.json">实际运行记录与源码摘要</a></p>
<details><summary>展开完整 proxy_lab.py（与下载文件对应）</summary>
`) + trainingCode('proxy_lab.py', 'Python', cloudProxyLabSource) + infraReadableHTML(`
</details>
<p>迁移到真实服务前，再回答两个问题：B 有一条可复用连接，但已经停止接收新工作，应由选择器还是连接池阻止新请求？若确实要重试写入，服务需要怎样保存“同一业务操作的唯一标识与已提交结果”，才能让后端的真实效果仍只有一次？后一项继续读<a href="#/article/distributed-systems">超时、重试与幂等</a>，不能仅给请求加一个日志编号就视为去重完成。</p>
<h3>再单独核对路由、访问控制与返回路径</h3>
`);

  article.sections[6][1] = practice + article.sections[6][1];
  article.updated = '2026.11.08';
  article.minutes = 45;
  Object.assign(sources, {
    cloudProxyHttp: ['NGINX · HTTP 转发、重试次数与时间边界', 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_next_upstream'],
    cloudProxyPool: ['NGINX · 上游连接组与空闲连接缓存', 'https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive'],
    cloudProxyStream: ['NGINX · TCP/UDP 流代理', 'https://nginx.org/en/docs/stream/ngx_stream_proxy_module.html'],
    cloudProxyPython: ['Python 3.9 · HTTPConnection 与完整响应读取', 'https://docs.python.org/3.9/library/http.client.html'],
    cloudProxyDrain: ['Kubernetes · Pod 终止、端点资格与连接排空', 'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination']
  });
  article.refs = [...new Set([...article.refs, 'cloudProxyHttp', 'cloudProxyPool', 'cloudProxyStream', 'cloudProxyPython', 'cloudProxyDrain'])];
  cloudProxyBridgeEdits.push({id: article.id, sections: [6, 7], newCodeBlocks: 2});
}
