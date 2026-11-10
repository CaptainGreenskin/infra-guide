# 两个答案都是 37，为什么有一个不合格

同一个问题要用两类材料。基础项 `a-base/v1` 是 10，调整项 `a-adjust` 是 27。先给 SQLite FTS5 留一份旧索引，再将权威来源的调整项从 v2 切到 v3，金额仍是 27。题目要求按当前版本回答。

| 这次怎样取资料 | 实际结果 | 独立验收 |
| --- | --- | --- |
| 查新索引，核对当前来源 | Qwen3 输出 37，引用基础 v1、调整 v3 | 接受 |
| 查旧索引，直接把其中的正文送给模型 | Qwen3 也输出 37，引用基础 v1、调整 v2 | 拒绝旧引用 |
| 查旧索引，送出前核对版本 | 剩一条基础资料，宿主报告证据不足 | 本分支发出 0 次模型请求 |

两份索引都用真实 FTS5 查询。无租户过滤时，B 的合成资料能进入候选；送给模型的材料限定在 A。模型用约束字段结构的 JSON 模板生成结果，金额和引用来自本次输入。验收器从另一份来源库读取当前版本，再核对模型写出的金额和引用。

## 复跑

实测用 Python 3.12 标准库、SQLite FTS5、macOS arm64 的 llama.cpp b12110，以及 Qwen3-0.6B 的官方 Q8_0 权重。`assets.json` 给出固定下载地址和 SHA-256。若已经复跑过模型工具实验，可以沿用那两份文件。权重约 639 MB，实验包包含脚本、夹具与记录。运行时仅连接本机回环地址。

```sh
python3.12 -B rag_lab.py \
  --server /path/to/llama-server \
  --model /path/to/Qwen3-0.6B-Q8_0.gguf \
  --output-dir replay
```

输出目录必须尚不存在。先读 `validation.json` 的 `versions` 与 `unscoped_candidates`，再比较 `cases.*.candidates`、`supplied`、`model_http` 和 `oracle`。两次请求的原始 HTTP JSON 都在记录里。也可独立打开数据库：

```sh
sqlite3 replay/sources.sqlite 'SELECT * FROM current ORDER BY source_id;'
sqlite3 replay/index.sqlite "SELECT snapshot,source_id,version,tenant FROM search WHERE search MATCH '费用 AND 汇总' ORDER BY snapshot,source_id;"
```

本实验使用固定模型、同一个问题和合成来源。证据不足分支由宿主的完整性检查拦下。读者可以用这三条路径核对来源与输出，检索或生成质量的总体比例需要独立题集。

[SQLite FTS5](https://sqlite.org/fts5.html) · [Qwen 官方模型](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF)
