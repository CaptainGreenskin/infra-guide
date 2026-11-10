# 已批准的提交，和真正拿到的发布制品

报表服务的发布清单保存版本名与制品文件的 SHA-256 摘要。Git 提交记录这份清单，签名绑定提交内容和签名密钥。发布端用自己维护的 `allowed_signers` 识别获准密钥，再独立计算实际制品的摘要。

| 发布尝试 | `git verify-commit` | 实际制品摘要匹配清单 | 发布后独立读取 |
| --- | --- | --- | --- |
| 可信签名，名称指向 v1 | 0 | 是 | `report-v1` |
| 同一份可信清单，名称改指 v2 | 0 | 否 | 保持 `report-v1` |
| 另一把密钥签署 v2，摘要匹配 | 1，`No principal matched.` | 是 | 保持 `report-v1` |
| 仍用可信清单，按摘要选 v1 | 0 | 是 | `report-v1` |

两份提交使用同一个 Git 作者字符串。`other_signer_check` 仅用另一份名单验证 v2，确认它具有有效签名。正常发布仍只采用第一份名单，另一把密钥并未获得发布权限。 [Git verify-commit](https://git-scm.com/docs/git-verify-commit) · [Git SSH allowedSignersFile](https://git-scm.com/docs/git-config#Documentation/git-config.txt-gpgsshallowedSignersFile)

## 复跑

需要 Python 3.9+、支持 SSH 签名的 Git 2.34+，以及支持 `ssh-keygen -Y` 的 OpenSSH。进入实验目录执行。

```sh
python3 -B release_artifact_trust.py --output my-validation.json
```

本次使用 macOS arm64、Git 2.50.1 和 OpenSSH 10.0p2。程序在独立临时目录创建 Git 仓库、两对一次性密钥、两份单文件 tar 包和当前发布文件。它不读取用户 Git 配置，不配置远程仓库。结束后临时目录和密钥一起删除。

`validation.json` 的 `signature` 保存实际 Git 退出码和输出，`manifest` 保存从指定提交读取的清单。`candidate_sha256` 来自实际候选包的字节，`active_readback` 重新打开发布文件，并取出归档里的版本值。提交标识和公钥指纹每次会变，比较四种判断和读取结果即可。

这份实验把本地符号链接当作可变名称，把 tar 当作制品。它验证签名、发布者信任和制品字节的对应关系。容器镜像的摘要解析、构建证明和集群准入要在各自的系统上验证。 [OCI Distribution 规范](https://github.com/opencontainers/distribution-spec/blob/main/spec.md)
