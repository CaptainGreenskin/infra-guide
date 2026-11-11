# DNS 已指向新地址，原连接上的请求去了哪里

同一个名称 `api.example.test.`，同一个 HTTP 端口，同一个查询 `/orders/O-104`。两个 HTTP/1.1 服务分别标记为 A 和 B。Linux 实验只改一条 A 记录，从 `127.0.0.1` 改到 `127.0.0.2`。

| 请求 | 发送前看到的 DNS 状态 | 这次怎样发送 | 实际对端与响应 |
|---|---|---|---|
| `r1` | 解析器返回旧地址 | 新建连接 | `127.0.0.1`，`A-c1` |
| `r2` | 同一解析器已返回新地址 | 沿 `r1` 的连接发送 | `127.0.0.1`，`A-c1` |
| `r3` | 使用刚读到的新地址 | 新建连接 | `127.0.0.2`，`B-c1` |

## 复跑

解压后保留 `dns-cache/` 与 `dns-connection-handoff/` 的并列目录。发布记录使用 Ubuntu 24.04 容器。在两个目录的共同父目录运行下面的命令，结果写到 `native-results/linux.json`。

```sh
mkdir -p native-results
docker run --rm --mount "type=bind,source=$PWD,target=/work,readonly" \
  --mount "type=bind,source=$PWD/native-results,target=/results" \
  --workdir /work ubuntu:24.04 bash -euc '
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y unbound dnsutils python3
    python3 -B dns-connection-handoff/dns_connection_handoff.py \
      --unbound /usr/sbin/unbound --output /results/linux.json
  '
```

[Ubuntu 24.04 实际运行记录](https://github.com/CaptainGreenskin/infra-guide/actions/runs/43026912329)

本机已有 Python 3.9+、Unbound 和 `dig` 时，也可以直接运行。将 `/path/to/unbound` 换成本机的 Unbound 路径。

```sh
cd dns-connection-handoff
python3 -B dns_connection_handoff.py --unbound /path/to/unbound --output local-observation.json
```

`dns.changed_authority` 保存权威更新后两边的原始回答，`dns.after_expiry` 保存解析器追上更新后的回答。`requests` 记录客户端实际套接字的本地与对端地址，`origins` 独立记录服务端每次接入和读取的请求。先对照两边的端口，再核对 `r1`、`r2` 都归于 `A-c1`。三个响应都应返回订单 `O-104`、金额 `37`。

Darwin 版用同一端口上的 IPv4 `127.0.0.1` 与 IPv6 `::1` 做相同对照，地址记录从 A 改为 AAAA。实验只启动自己的回环监听、临时权威区和解析器，退出时清理。程序显式读取 `dig` 答案，选择其中的数字地址建立新连接；这里验证一条 HTTP/1.1 连接的复用。操作系统 DNS 缓存、浏览器、连接池调度与公网切流需要各自测量。

- [HTTP/1.1 持久连接](https://www.rfc-editor.org/rfc/rfc9112.html#section-9.3)
- [Unbound 本地区、stub-zone 与缓存参数](https://unbound.docs.nlnetlabs.nl/en/latest/manpages/unbound.conf.html)
