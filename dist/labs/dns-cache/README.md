# 权威 DNS 已经改了，解析器为什么还给旧答案

实验在 `127.0.0.1` 的两个临时高端口分别启动 Unbound。一个进程对 `example.test.` 提供权威回答，另一个进程只向它查询并保存缓存。用 `dig` 显式指定地址和端口，可以绕过系统的解析路径，对照两边的实际响应。

| 时点 | 权威的 `api` / `preview` | 同一个解析器的 `api` / `preview` |
|---|---|---|
| 缓存填好 | `192.0.2.10` / `NXDOMAIN` | `192.0.2.10` / `NXDOMAIN` |
| 权威重载后 | `192.0.2.20` / `192.0.2.30` | `192.0.2.10` / `NXDOMAIN` |
| 负缓存先过期 | `192.0.2.20` / `192.0.2.30` | `192.0.2.10` / `192.0.2.30` |
| 两份旧缓存都过期 | `192.0.2.20` / `192.0.2.30` | `192.0.2.20` / `192.0.2.30` |

用 Python 3.8+、Unbound 和 `dig` 运行。记录来自 Darwin arm64、Unbound 1.24.2 与 DiG 9.10.6。若 Unbound 不在 PATH 中，用 `--unbound` 指定可执行文件。

```sh
python3 -B dns_cache.py --unbound /path/to/unbound --output local-observation.json
```

先查 `phases.before` 的两个响应。`api` 的 A 记录 TTL 为 8 秒，`preview` 的状态是 `NXDOMAIN`，权威部分的 SOA 记录给出 5 秒的负缓存期限。程序只向权威进程发送重载信号。到 `phases.changed_authority` 时，两边使用相同的名字，答案仍然不同。最后分别核对两个缓存过期时点。`raw` 是 `dig` 原文，`args` 保留端口、查询名和是否请求递归，`elapsed_ms` 只是本机采样时刻。

程序退出后终止自己启动的两个进程并删除临时配置。实验没有查询外部 DNS，也没有改系统 DNS 设置。它验证的是一个受控解析器的正、负缓存，应用和浏览器缓存、已建立的 TCP 连接以及公网 DNS 传播需分别观察。

- [Unbound 本地区、stub-zone 与缓存参数](https://unbound.docs.nlnetlabs.nl/en/latest/manpages/unbound.conf.html)
- [RFC 2308 §5 负回答缓存](https://www.rfc-editor.org/rfc/rfc2308#section-5)
