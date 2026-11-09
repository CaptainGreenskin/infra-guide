# 在 Qdrant 取候选，到来源库核对版本

固定 7 个二维向量，查询 [1,0]。集合用点积计算相似度，因此得分就是候选向量的第一项。Qdrant 1.19.1 实际执行 6 次精确向量查询。SQLite 另存每份资料的真实租户、读取资格、版本和金额。

## 运行

Linux amd64、Python 3 标准库。先下载 [Qdrant 1.19.1 官方 Linux amd64 发布包](https://github.com/qdrant/qdrant/releases/download/v1.19.1/qdrant-x86_64-unknown-linux-musl.tar.gz)。在本实验解压目录中核对归档摘要，再运行。

```sh
asset=qdrant-x86_64-unknown-linux-musl.tar.gz
printf '%s  %s\n' 70a40529e2ebe0a2787d574d3a2e28437cfe94f26f24fa419f6ac57b4ae817c9 "$asset" | sha256sum --check --strict
mkdir qdrant-bin
tar -xzf "$asset" -C qdrant-bin
python3 -B qdrant_retrieval.py --qdrant qdrant-bin/qdrant --output replay
```

运行器监听本机回环地址和临时端口，退出时停止进程并清理临时集合。输出目录 `replay` 由运行器新建。该例观察精确排序、候选范围和一次装配内的来源读取。真实嵌入质量、近似搜索召回、分布式权限同步及生成结果各有自己的验收条件。

## 沿请求读结果

1. 全局取两项得到 B 的 701、702，事后按 A 和可读标记筛选，留下零项。
2. 只限制租户 A，前两项是 105、101。105 在索引里的可读标记为假。
3. 把 A 和可读标记同时写入 `filter.must`，前两项变为 101、102。初始来源版本一致，实际读取金额 10 和 27。
4. 再取一次这两个候选，保留结果。随后在 SQLite 撤回 102 的资格，并把 103 的正文从第 1 版金额 41 更新为第 2 版金额 42。用旧结果装配时，102 被拒绝，只读 101。
5. 在仍旧的索引取四项，101、102、103、104 都进入候选。资格检查挡住 102，版本检查挡住 103/v1。正文读取结果是 101/v1=10、104/v1=7。
6. 刷新两个变化的索引点，前两项变为 101、103。对照正文读取记录，应得到 101/v1=10、103/v2=42。

请求的 `with_payload` 只返回租户、可读标记和来源版本。装配器在同一个 SQLite 事务中先读这三项权威属性，满足约束才读取金额并记正文回执。固定租户 A 来自实验配置。用范围限制和版本门禁分开处理候选选择与正文交付。

## 独立核对

- `source.json` 声明点积输入和两项来源变化。
- `exchanges.json` 保留真实 HTTP 请求、响应、原生版本、集合字段索引及分数。响应耗时随运行变化。
- `authority.sqlite` 保留最后一份来源状态和各场景实际读取的正文。可查询 `SELECT scenario,source_id,source_version,amount FROM body_reads ORDER BY ordinal;`。
- `validation.json` 将结果绑定到源码和两份原始证据的 SHA-256。
- `ci-record.json` 绑定 [Linux CI 实跑](https://github.com/CaptainGreenskin/infra-guide/actions/runs/42581362152)及其源提交。

[Qdrant 查询接口](https://api.qdrant.tech/api-reference/search/query-points) · [Qdrant 字段索引](https://qdrant.tech/documentation/concepts/indexing/)
