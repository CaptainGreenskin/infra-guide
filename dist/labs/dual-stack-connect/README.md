# 双栈地址与建连回退

请求固定为 `GET /orders/O-104`，候选地址始终是 IPv6 回环地址 `::1` 与 IPv4 回环地址 `127.0.0.1`。每组为两种地址使用同一个临时端口，并启动一个新的 curl 进程。curl 的 `--resolve` 直接为域名和端口提供候选地址，所以没有请求 DNS 服务器。四组里的 IPv4 服务都正常。

| 条件 | curl 实际尝试的地址 | 结果 |
| --- | --- | --- |
| IPv6 与 IPv4 均能响应 | `::1` | IPv6 HTTP 200，金额 37 |
| IPv6 无监听 | `::1` 被拒绝，再尝试 `127.0.0.1` | IPv4 HTTP 200，金额 37 |
| IPv6 无监听且指定 `--ipv6` | `::1` 被拒绝 | 退出码 7 |
| IPv6 接受连接并读到请求，但暂不响应 | `::1` | 退出码 28，IPv4 服务没有收到连接 |

## 运行

需要 Python 3.9+、支持 IPv6 的 curl 7.59+，以及本机 IPv4 和 IPv6 回环接口。程序自行选择端口、启动监听并关闭两份服务。

```sh
python3 -B dual_stack_connect.py --output replay.json
```

可用 `--curl /usr/bin/curl` 指定执行文件。发布记录使用 Darwin arm64、Python 3.9.6、系统 curl 8.7.1。

1. 先读每组 `curl.stderr`，找 `Trying`、`Connected` 和 HTTP 状态行。被拒绝的地址也会出现在 `Trying` 中。
2. 再读 `curl.stdout` 中的实际响应正文及标记行。标记行字段顺序是连接对端 IP 和端口、本端 IP 和端口、HTTP 状态码、已成功的新连接数、连接完成累计时刻、收到首字节累计时刻。`000` 表示没有收到 HTTP 状态。
3. 最后对照 `listeners`。建连后等待一组已经有 IPv6 的 `accepted` 和 `request`，仍没有 `response`；IPv4 的事件列表是空的。

实验说明这个 curl 进程如何选连接，以及建连完成后等响应的位置。实际 DNS、远程链路、浏览器和生产流量要按各自路径观测。计时字段只用于辨认阶段。

- [curl 如何尝试多个候选地址](https://curl.se/libcurl/c/CURLOPT_HAPPY_EYEBALLS_TIMEOUT_MS.html)
- [curl 预设地址选项](https://curl.se/docs/manpage.html#--resolve)
