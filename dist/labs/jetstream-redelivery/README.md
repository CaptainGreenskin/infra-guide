# JetStream 重投后，旧执行者还能写吗

真实 NATS Server 在回环地址启动一个临时 JetStream。两条独立客户端连接从同一个持久拉取消费者接收消息。A 收到第一次投递，保持连接并暂不确认。确认等待时限 AckWait 到期后，B 收到同一条流序号的第二次投递。三组各用独立流和 SQLite 文件，业务输入均为 report-27:publish，金额 37。

## 运行

准备 Python 3.12 和官方 NATS Server v2.15.2。下载适合自己系统的压缩包，用发行页的 SHA256SUMS 核对后解压。

- macOS arm64 压缩包 SHA-256 为 cbd2219d01502c38733485ac684269da585ee479fa3b1377264beecdefdf9e9d。
- Linux amd64 压缩包 SHA-256 为 67cb8e10bc6f0c4b47f75a728529a20953dbae2a4f9a4a52ae8517d65ae303ff。

[官方 NATS Server v2.15.2 发行包](https://github.com/nats-io/nats-server/releases/tag/v2.15.2) · [官方 Python 客户端 v2.16.0](https://github.com/nats-io/nats.py/releases/tag/v2.16.0)

    python3.12 -m venv .venv
    .venv/bin/python -m pip install --only-binary=:all: --require-hashes -r requirements.txt
    .venv/bin/python -B jetstream_redelivery.py --server /path/to/nats-server --output native-record.json

程序使用由系统选择的临时端口和自有临时目录，完成后终止自建服务器并清理数据。运行记录给出服务端、SDK 和实际二进制摘要。

随包的 `validation.json` 来自 Linux x86_64 实跑，使用 Python 3.12.16 和 SQLite 3.46.1。`ci-record.json` 记录来源提交、验证记录和二进制的摘要。[查看 Linux CI 原始运行](https://github.com/CaptainGreenskin/infra-guide/actions/runs/42575586293)

## 怎样读结果

1. 看发布确认中的流序号。A 和 B 两次接收的流序号不变，投递次数从 1 变 2。B 收到时，A 的连接仍在。
2. 监督者在业务库中把可写代际从 1 推进为 2，随后让 A 先尝试写，再让 B 写。业务代际由接收方负责，与代理记录的投递次数分开。
3. 比较 SQLite 的 attempts、effects 和 inbox。直接追加会有两份金额 37。只按业务 ID 去重时，旧 A 先写成功，B 复用原记录。事务同时校验代际和去重时，A 的旧代际被拒，B 提交一份。
4. 三组均由 B 调用 ack_sync 等待代理确认。核对待确认数量从 1 降为 0，以及确认进度对应原流序号，再分别检查业务账本。

JetStream 可以接受某些迟到的确认。本实验只由 B 确认，观察的是超时重投、业务写权限和实际账本。两个执行上下文在同一个 Python 进程中，分别持有独立的真实客户端连接。实验范围是单机 JetStream 和 SQLite。Lambda 批响应、SQS 接收句柄和托管重试的语义按各自接口核对。

[NATS 官方确认与重投](https://docs.nats.io/learn/jetstream/acknowledgment) · [NATS Server v2.15.2 确认实现](https://github.com/nats-io/nats-server/blob/v2.15.2/server/consumer.go)
