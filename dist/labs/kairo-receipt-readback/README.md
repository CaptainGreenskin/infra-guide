# Kairo 本机提交后退出与回执复核

同一个合成报告先读主清单 10、27 和补录 5。接收库提交金额 42 和来源第 3 版后，工具还没把回执返回给运行时，测试 JVM 就退出。两个新的 JVM 分别沿同一操作核对回执。匹配来源版本时验收通过，要求第 4 版时停在待核对。两次核对都没有进入写处理。

公开包可以复核脱敏记录。运行需要 Python 3.9+ 标准库。

```sh
python3 -B verify_receipt_readback.py validation.json
```

先看 `prepare` 与 `after_commit_exit`，独立接收库从 0 份报告变成 1 份。再比较 `matched` 和 `version_mismatch`。两次运行状态均为 `COMPLETED`，业务验收结论分别是 `RECEIPT_CONFIRMED` 和 `NEEDS_VERIFICATION`，接收库各只有原来那一份。

记录来自指定版本 Kairo 的本机测试、脚本化模型与 H2 接收库。宿主用独立只读 JDBC 查询观察四个阶段，公开文件只保留合成数据和必要结论。公开校验器核对记录内部关系。运行时、适配器、原始日志和数据库留在原本机环境。生产接口、真实模型、远端工具和 G10 的 23 日报只读契约仍需各自验收。
