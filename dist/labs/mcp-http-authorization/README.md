# 令牌能进入 MCP 服务，能读哪份报告

任务读取 A 租户的 report-A 第 3 版订单，源文件固定为两批 [10,27] 和 [5]。资源库另外保存 B 租户的 report-B。客户端以同一份有效令牌分别请求 A 与 B。服务端用已验证的主体确定租户，先核对对象归属，再从只读 SQLite 连接取正文。

## 运行

用 Python 3.12，`replay` 必须尚不存在。

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B authorization_lab.py --output-dir replay
```

客户端与独立 Uvicorn 子进程通过回环 HTTP 通信。官方 MCP Python SDK 2.3.0 提供受保护资源元数据、Bearer 中间件、Streamable HTTP 和工具客户端。临时夹具在内存生成 RSA 私钥，资源服务用公钥检查 JWT 签名、签发者和有效期。SDK 再用令牌受众核对本服务 URL，并检查入口所需的 `report.read`。运行结束后移除临时公钥文件。记录只保存校验后的声明和凭据是否存在。

## 核对运行

| 请求 | HTTP 或工具结果 | 正文读取 |
| --- | --- | --- |
| 未携带令牌 | HTTP 401，返回资源元数据地址 | 0 |
| 访问元数据地址 | HTTP 200，给出资源和授权服务器地址 | 0 |
| 正确签名但受众为另一服务 | HTTP 401 | 0 |
| 受众正确但只有 report.write | HTTP 403，insufficient_scope | 0 |
| 同一有效令牌请求 B | HTTP 200，工具 isError=true | 0 |
| 同一有效令牌请求 A | HTTP 200，工具返回 v3、42 | 1 |

用 `server.jsonl` 对齐 HTTP 请求、已验证声明、挑战头、真实响应正文与具体对象读取。 `client.jsonl` 记录客户端观察。 `reports.sqlite` 是服务端真实资源库，前后摘要相同。独立校验直接读取库中两份初始报告，从订单夹具重算 42，并检查只读出 A、拒绝响应没有 B 的正文。

`validation.json` 绑定源码、依赖和原始记录。仓库内运行 `node scripts/check-mcp-http-authorization.cjs` 可用 Node 与 Python 标准库核对记录。设置 `MCP_HTTP_AUTH_PYTHON` 为安装了固定依赖的解释器，可额外复跑。

签发者地址是本机测试夹具的标识。本实验验证资源服务端边界。浏览器登录、OAuth 授权码与 PKCE、令牌刷新、远端 TLS、真实身份服务和 Kairo 接入分别验收。

- [MCP 2026-07-28 授权规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [固定 Python SDK 的 Bearer 中间件](https://github.com/modelcontextprotocol/python-sdk/blob/v2.3.0/src/mcp/server/auth/middleware/bearer_auth.py)
