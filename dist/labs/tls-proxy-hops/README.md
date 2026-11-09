# HTTPS 代理的两段 TLS 校验

先读 C2.1 云网络第六节，知道证书里的 SAN（可校验的服务名称）、握手里的 SNI（客户端带给服务端的名称），以及 HTTP 里的 Host（这次请求要访问的站点）。

## 运行

用 Python 3.9+ 标准库和本机的 OpenSSL 或 LibreSSL 命令。解压 `tls-proxy-hops.zip`，进入 `tls-proxy-hops/`。

```sh
python3 -B tls_proxy_hops.py > replay.json
python3 -m json.tool replay.json
```

可用 `--openssl /path/to/openssl` 指定命令。三个监听器都绑定 `127.0.0.1` 的临时端口。程序在临时目录创建两份根证书与三个服务端证书，只将根证书加载到各自的客户端配置。程序结束时关闭套接字并清理证书和密钥。无需配置 DNS、修改系统信任库或访问外部服务。

## 沿一次查询读代码

1. `replay` 建立 P、A、B。客户端信任入口 CA，向 P 发送 `edge.lab.test` 作为 SNI，也按它校验证书。P 信任另一份上游 CA，并按选中后端的名称校验证书。
2. `proxy_handler` 解密收到 HTTP 后，按 Host 与路径查路由。A、B 各有自己的上游 TLS 名称和 HTTP Host。上游 Host 由路由配置给出。
3. `OriginPool.query` 按 `Route` 查连接。这个键包含后端、实际地址、预期证书名称和上游 Host，整个池使用同一份上游信任配置。第一次访问建立连接并校验，读完完整响应后保留连接，第二次访问同一路由借用它。
4. `TLSListener` 分别在收到 SNI、完成 TLS 握手、进入 HTTP 处理器时记账。失败请求可同时在入口 HTTP 账本、上游 SNI 账本和客户端结果中找到。

| 请求 | P 收到的 HTTP Host | P 校验的上游证书名称 | 发给上游的 HTTP Host | 实际结果 |
| --- | --- | --- | --- | --- |
| a1 | `orders.lab.test` | `a.origin.test` | `orders.origin.test` | P-1 → 新建 A-1，200 |
| a2 | `orders.lab.test` | `a.origin.test` | `orders.origin.test` | P-2 → 借用 A-1，200 |
| b1 | `audit.lab.test` | `b.origin.test` | `audit.origin.test` | P-3 → 新建 B-1，200 |
| bad | `audit.lab.test` | `a.origin.test` | 路由仍配置 `audit.origin.test`，握手失败，未发送 | P-4 → B 的新连接握手失败，502 |

所有查询使用同一个订单 O-104，两个后端正常时都返回金额 37。故障路由只改 B 的预期证书名称，B 的地址、上游 CA 和 HTTP Host 保持一致。B 收到 `b.origin.test`、`a.origin.test` 两次 SNI，但只有一次握手完成和一条 HTTP 请求。对照 `validation.json` 的 `listeners.B` 与 `responses[3]`，可以区分“代理曾连接 B”和“B 收到了订单查询”。

本实验记录的是本机 HTTP/1.1 连接与服务端身份校验。真实代理配置还要核对上游连接池怎样按目标和信任配置隔离，以及请求重试与失败码的处理方式。

- [Python SSL 客户端与证书校验](https://docs.python.org/3/library/ssl.html#ssl.PROTOCOL_TLS_CLIENT)
- [HTTP Host 与目标站点](https://www.rfc-editor.org/rfc/rfc9110.html#section-7.2)
