# 真实本地 HTTP 代理：连接、排空与安全重试边界

先读 C2.1 云网络第六节，区分四层/七层、前端连接/上游连接、资格/连接池、排空/断连，再运行本实验。

## 运行

需要 Python 3.9+，只用标准库，无第三方依赖。已在 Python 3.9.6、macOS 本机运行。所有监听者仅绑定 `127.0.0.1` 的临时端口；每轮使用独立临时目录、SQLite 数据库和线程，结束关闭连接、等待线程并清理临时目录。不修改 DNS、信任库、用户数据库或外部服务。

下载 `cloud-proxy.zip`，解压并进入 `cloud-proxy/`：

```sh
python3 -B proxy_lab.py > proxy-run.json
python3 -m json.tool proxy-run.json
```

返回非零表示断言或执行失败。JSON 的 `positive` 是受限策略，`unsafe_write_retry` 是在另一个全新环境中运行的故意错误策略。端口每次不同，关系与结果应保持一致。程序会用约 0.25 秒触发受控慢查询的上游总预算，不以固定睡眠猜测排空进度。

## 对象和先后关系

- P：HTTP/1.1 代理，前端 Host 为 `orders.lab.test`。
- A/B：真实 HTTP/1.1 订单后端，接受 Host 为 `orders.internal.test`。代理显式改写此字段；不依赖这两个名称的 DNS 解析。
- P-c1/P-c2/P-c3、A-c1、B-c1/B-c2：监听者按实际 TCP accept 顺序分配的连接编号，`accepted` 和 `upstream_attempt` 同时保存真实两端套接字地址。
- `rid`：贯穿两端的请求标识，仅用于观测。本实验没有把它建成数据库唯一键；这正是负例能产生重复效果的原因。
- `Control.active`：已经分配、尚未释放的工作，包括等连接锁的部分；不等同后端正在计算的并发线程数。

先仅允许 A 接收新工作，连续查询两次再换前端查询一次；再允许 B，令 B 接到请求后由事件暂停。开始排空 B 后，在原请求未放行时发新查询，确认它走 A；最后放行 B 并关闭其池连接。恢复 B 资格后继续受限 GET 重试、次数耗尽、总预算耗尽和未知写入实验。

## 预期结果与独立事实

| 场景 | 客户端结果 / 尝试数 | 另一侧的事实 |
| --- | --- | --- |
| 前端 Host 错误 | 421 / 0 | 无对应后端请求 |
| 三次顺序查询 | 200 / 各 1 | 两条前端连接共用 A-c1，订单 O-104、金额 37 |
| B 处理中开始排空 | 新旧请求都 200 | drain_started 的 active=1；新请求到 A，旧 B 请求随后完成 |
| B 503，A 正常 | 200 / 2 | B→A 两次请求，同一 rid，attempt=1/2 |
| 两后端都 503 | 503 / 2 | 仅 B→A，没有第三次 |
| B 等到共同预算耗尽 | 504 / 1 | slow-first 仅到 B，没有给 A 新开预算 |
| 默认 POST 丢失响应 | 502 / 1、结果未知 | SQLite 已提交一次 total=37 |
| 负例 POST 无条件重试 | 502 / 2 | SQLite 两次提交，总计 74 |

正例整轮 P 接受 3 条连接，A 接受 1 条，B 接受 2 条。B-c1 被排空，恢复资格后建立 B-c2。数连接要读真实 `accepted`，数尝试要读后端实际 `backend_request`，数业务效果要读 SQLite 查询结果 `effects`，不能只看代理响应头。`upstream_response` 是代理读完上游响应，`client_received` 是驱动读完下行响应。后端写完之后才追加的 `backend_finished` 日志可能被线程调度延迟，不能把它与另一线程的响应日志直接当作网络完成先后。事件 seq 是记录顺序，不是生产耗时。

## 沿源码阅读

1. `Server` / `Handler.setup`：真实监听与每条 accept 的地址记录。
2. `Control.reserve` → `Pool.exchange` → `Control.release`：先筛后端资格，再借连接，最后释放已分配工作。
3. `Pool.exchange`：单后端一个连接和一个锁；读取完整响应后才能复用。共同截止时间覆盖等锁、连接和响应；定时器到期关闭本次 socket。清除定时器的动作发生在释放池锁之前，避免伤到下一次借用。
4. `Control.drain_b`：停止新分配，保留旧工作，在途归零后关闭连接。事件通知而非猜测 sleep 控制实验顺序。
5. `Proxy.process`：GET 只读契约、最多两次、同一绝对截止时间；POST 响应丢失标记未知，不自动重放。普通上游窗口 2 秒，慢查询 0.25 秒。
6. `Backend.process`：先真实 SQLite commit，再关闭真实 TCP 连接丢失响应；用数据库行数解释 37/74。

预算从入口 Host/小请求体验证完成后开始，不包含客户端建连、入口读取请求体或下行响应写入。Socket timeout 约束 I/O 等待，额外的截止时间定时器防止整个上游响应无限延长。超时后驱动仍可放行 B 的业务处理，通信失败不等于业务被撤销。

## 范围与后续

这是实际 loopback TCP/HTTP/SQLite 实验，不是纯计算模拟。为让对象关系可读，程序只处理受控的小 JSON、Content-Length 和固定方法/路径，不实现流式反代、通用 HTTP 校验、HTTP/2、多个池槽、多进程共享池和生产代理性能。没有 TLS、外部 DNS、云负载均衡、Kubernetes 或生产延迟验收。`unsafe_write_retry` 是程序内部故意负例，不是生产配置建议。

TLS 身份的实际验证复用本站 `network-input-tools/tls_identity.py`，包括正确证书、错误服务名、不信任 CA 和错误 Host；本实验不重复声称新增 TLS 实测。部署前需分别设计外部 TLS、后端 TLS 信任和后端授权。

`validation.json` 保存本轮执行事实、Python 版本、源码 SHA256 与官方来源核对日期。它是作者运行记录；自己的运行请写入另一个文件。仓库内可以运行 `node scripts/check-cloud-proxy.cjs`，它用独立于程序断言的连接、日志顺序和 SQLite 结果预期验证存档与新运行，核对正文内完整源码及 ZIP。

## 技术来源（2026-11-08 核对）

- Python 3.9 `http.client`：https://docs.python.org/3.9/library/http.client.html （完整读取响应后复用连接、异常语义）
- Python 3.9 `http.server`：https://docs.python.org/3.9/library/http.server.html （HTTP/1.1、准确 Content-Length）
- NGINX HTTP proxy：https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_next_upstream （重试条件、次数、时间、非幂等方法；没有直接照搬其配置实现）
- NGINX upstream：https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive （空闲连接缓存与并发上限的区别）
- NGINX stream：https://nginx.org/en/docs/stream/ngx_stream_proxy_module.html （传输层代理边界）
- Kubernetes Pod lifecycle：https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination （终止端点不再接常规新流量，保留处理在途连接的退出阶段）

讲解与程序为本站原创。依赖只有 Python 标准库；CPython API 另用 Context7 的 `/python/cpython/v3.9.22` 文档核对。NGINX 文档用作实现边界对照，本实验未运行 NGINX，也不把其重试时间参数等同于这里覆盖完整响应的截止时间。
