# 同一个入口切走后，报告与附件是否都能读回

租户 A 要读取报告 R3。报告在提交 102 写入，引用附件 object-v3。主、备后端分别有一个临时 SQLite 库，整库位置都是 103。两边能查到 R3，只有主后端一开始有附件。附件的原始字节为 **A report 3**，不带换行。实验沿用 C9.4 恢复实验的这一条数据，重新构造两个后端。

## 复跑

需要 Linux、Python 3.9+、HAProxy 3.2.26。如果机器上没有对应版本，可在当前目录编译官方源包。编译需要 C 编译器和 make。脚本运行期间只使用回环地址、一个私有 Unix socket 和临时目录。

~~~sh
curl -fSLO https://www.haproxy.org/download/3.2/src/haproxy-3.2.26.tar.gz
printf '%s  %s\n' 760ef35fafc1e05844e73ad07e138e9e96fddbf5de02f606249c027f754827da \
  haproxy-3.2.26.tar.gz | sha256sum -c -
tar -xzf haproxy-3.2.26.tar.gz
make -C haproxy-3.2.26 -j 2 TARGET=linux-glibc
python3 -B failover_lab.py --haproxy "$PWD/haproxy-3.2.26/haproxy" --output my-run.json
python3 -B verify_record.py my-run.json
~~~

`--haproxy` 也可指向已有的同版本二进制。校验器独立检查读回内容、文件摘要、时刻顺序、后端健康和实际客户端响应。可加 `--reference ../recovery-artifacts-retrieval/validation.json` 核对原 C9.4 报告、对象名和整库位置。

## 先预测，再核对

两次都先通过同一个 HAProxy 入口从主后端读到报告和附件。驱动关闭主后端的监听，用直连失败核对监听关闭。HAProxy 的状态由私有 stats socket 独立读取，客户端继续请求原入口。两次仅更换被健康检查访问的 URL。

| 备用后端缺附件时 | 预期代理状态 | 客户端要核对什么 |
| --- | --- | --- |
| `/healthz` 只查后端是否能响应 | B `UP` | B 返回报告 `200`，附件 `404` |
| `/readyz` 在这份合成夹具上查固定附件 | B `DOWN` | 主、备都不可用时，两个请求都由代理返回 `503`，没有应用回显 |
| 两组分别补齐同一附件 | B `UP` | 连续三次从 B 读到报告与附件，逐次重算实际附件摘要 |

`reads` 的一项是同一轮的两个独立 GET，有各自请求 ID。按 `incomplete_trial` 找到缺附件时的成对响应。`stable_trials` 是补齐后连续三轮合格的试读序号。`elapsed_ms_from_fault` 从驱动关闭主监听之前算到第 3 轮完整响应的结束，其中包含人为留出的缺附件对照阶段。本机探针间隔、数据量、故障操作和网络均已固定；跨可用区的服务恢复时间和有效吞吐仍需在相应环境测量。租户头是合成查询条件，不接入身份系统。

[HAProxy HTTP 健康检查](https://www.haproxy.com/documentation/haproxy-configuration-tutorials/reliability/health-checks/) · [HAProxy show stat](https://www.haproxy.com/documentation/haproxy-runtime-api/reference/show-stat/) · [HAProxy 3.2 官方源包](https://www.haproxy.org/download/3.2/src/)
