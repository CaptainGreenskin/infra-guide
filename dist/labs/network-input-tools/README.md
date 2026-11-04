# 网络、训练输入与工具执行：三组独立实验

所有程序均为本项目原创的教学实验。先在章节中完成机制与预测，再运行程序。它们共用一个下载包，不代表一个跨 Cloud / AI / Agent 的生产系统。

## 环境与命令

Python 3.9+ 的标准库实验：

```sh
python3 -B tls_identity.py
python3 -B packing_boundaries.py
python3 -B tool_runtime.py
```

tls_identity.py 还需要 PATH 中有 openssl。实测命令行实现为 LibreSSL 3.3.6；Python ssl 使用 LibreSSL 2.8.3。程序创建一天有效的临时 CA 和服务证书，显式将该 CA 加入本次客户端上下文，不修改系统信任、不关闭证书/主机名校验、不修改 DNS。只绑定本机回环随机端口，退出删除临时私钥。不同 Python/OpenSSL 环境的 TLS 版本可能不同，不将 TLSv1.2 当作必须输出。

sampler_coverage.py 需要 PyTorch 2.5.1。可在独立虚拟环境安装适用于自己平台的 CPU 包，再运行：

```sh
python -m pip install torch==2.5.1
python -B sampler_coverage.py
```

本次使用 CPython 3.12.13 / PyTorch 2.5.1 / CPU / Gloo，两个实际进程，每进程两个实际 DataLoader worker。默认启动方式为 spawn；务必保存成文件运行，不在交互式 stdin 中粘贴运行。程序不执行训练步或 GPU 拷贝，不测吞吐。第一次启动进程可能较慢，程序保留超时。

## 先预测，再看输出

- TLS：TCP 成功后，错误证书名仍失败；不信任 CA 仍失败；证书名正确但 HTTP Host 错误，TLS 成功而应用返回 421。四次 SNI 与两次实际 HTTP 请求分别记录。直接连接的是 127.0.0.1；服务名由 server_hostname 和 HTTP Host 显式传入，不执行真实 DNS。
- Map-style：11 样本 / 2 rank / batch_size=4。Sampler 补齐产生 12 次交付、11 个唯一 ID；Sampler 丢尾产生 10 次；DataLoader 再丢尾后两种均为 8 次。查看每个 rank 的实际索引和批次。
- Iterable：只按 rank 切分、忽略 worker 时，每条流被两个 worker 重复。按 rank × worker 分流后覆盖全部 11 个 ID，但两进程批次数为 4 与 3。drop_last 按 worker 尾批处理，剩 8 个 ID、各 2 批。
- Packing：正确文档内因果 mask 与文档内位置编号，输出和逐文档计算相同；只插 EOS 但允许跨文档注意力，输出改变。直接把整段位置编号延续下去，也不等价于本例独立文档契约。位置向量仅为教学用，未实现 RoPE。
- Agent：正常执行、同操作重试、类型修复、越权资源、错误工具输出、假完成、无限读取、一次 503、合法结构但错误总数、原操作换参数，共十组实际 HTTP 对照。只有通过独立产物验收才成功。

## Agent 实验的明确范围

tool_runtime.py 运行真实本地 HTTP、JSON-RPC 请求和 SQLite 事务。提议来自固定脚本，没有调用 LLM。使用 tools/list、tools/call 和结构化结果的消息形状，未实现 MCP 初始化、会话、完整传输或鉴权协议，不能称作完整 MCP 服务端或 Kairo 已接入。

principal-A 为测试夹具预先注入，未实现真实身份认证；orders-B 的真实测试资料值为 999，资源授权在服务端读取资料前拒绝该主体。validate 只识别本文件明确列出的 schema 子集，不是通用 JSON Schema 校验器。

proposal 预算 4，实际工具尝试预算 3；发现列表另算。只对只读调用的一次 503 做一次受限重试，重试计入工具预算。写调用传输不确定时保持 UNKNOWN，不把“没有收到回应”当作“没有提交”。循环本身未持久化，不覆盖进程崩溃恢复；相关实验见 agent-recovery 章节。

写回采用同事务去重：逻辑操作 ID 绑定全部参数，重复同参数返回原回执，换参数报冲突。工具允许保存任意整数，因此总数 38 可以成功写入并产生一次效果；最后的任务验收仍会拒绝。这正是工具成功不等于任务正确的反例。

## 证据与复现

validation.json 保存实际环境、源码 SHA-256 与实际输出。页面内完整代码、此目录源码和 ZIP 对应同一份程序。CI 实际重跑三份标准库程序；PyTorch 程序的本次执行记录与分片、批次覆盖由独立规则复核，CI 不自动安装 PyTorch，也不冒充重跑了训练。

上述输出均为固定夹具。未验证 Kubernetes CNI、真实 DNS、GPU 性能、真实模型规划、真实身份服务或 Kairo。运行后允许软件版本、TLS 协议协商和浮点末位存在环境差异；整数覆盖、授权结果和状态迁移应一致。

