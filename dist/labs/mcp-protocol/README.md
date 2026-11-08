# 真正运行一次 MCP：发现、调用、进度和取消

本实验用官方 **mcp 2.3.0**。本次实际环境是 Python 3.12.13、macOS；程序要求
POSIX（macOS/Linux），用 `os.kill(pid, 0)` 独立核对服务端进程是否已经被回收。
依赖版本固定在 `requirements.txt`。无 LLM、API key、远端服务和第三方账号。

解压完整目录后执行：

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B client_lab.py > result.json
```

要保留每个独立服务端的真实事件、标准错误与 PID 观察，可指定一个**尚不存在**的目录：

```sh
.venv/bin/python -B client_lab.py --output-dir run-01 > result.json
python3 -m json.tool result.json
```

`result.json` 是客户端真实运行生成的输出，不是本仓库预制答案。客户端的 `Tap`
只观察官方 SDK 在 stdio 传输上实际发送和收到的类型化消息；它不伪造响应、请求ID、
取消或进度。服务端标准输出完全留给协议，事件另写入 JSONL 文件。

## 同一份来源

`orders.json` 的 `report-A/v3` 包含基础批次 `[10,27]` 和补录批次 `[5]`。
每次调用显式传 `task_id` 与批次名，正确总数为42。服务端只提供这份固定资料；
此任务字段用于明确业务目标，不是身份认证或访问凭据。

|独立进程|实际做什么|应观察到什么|
|---|---|---|
|modern|官方 `ClientSession.discover()`，使用2026-07-28；发现3个工具，实际读、扫描、等待、取消|每个请求带版本/客户端信息/能力；读基础37、扫描42；收到2个进度；取消真实关闭等待所持文件；同一连接仍能读取补录5|
|legacy|另一进程调用 `ClientSession.initialize()`，明确使用2025-11-25|`initialize → response → notifications/initialized → tools/list`；不把旧握手拼入现代连接|
|wrong-total|第三进程开启 `--wrong-total`，真正返回结构合法的错误总数41|SDK的输出结构校验通过，`isError=false`，但直接读取权威来源的独立判据拒绝|

2026-07-28版没有初始化握手。`server/discover` 是可选探测，双代 stdio 客户端可以
用它判断兼容路径；它不是每次调用前的必需动作。此实验选择主动探测以留下可检查证据。

## 失败分层

参数 `batch_id=27` 不符合声明的字符串类型；服务端自己的 JSON Schema 校验返回
`isError=true`。`batch_id="missing"` 类型正确，但业务资料不存在，也返回工具错误。
未知工具名则返回 JSON-RPC 错误 `-32602`，由客户端 `MCPError` 捕获。

这些失败不是同一种状态。`resultType="complete"` 表明本轮协议结果已经返回，不证明
工具业务成功；`isError=false` 和结构合法也不证明总数正确。独立判据重新读取
`orders.json`，核对来源版本、值和总数。

## 进度、取消与退出

正常扫描实际发出 `1/2`、`2/2` 两份进度通知，客户端等待回调到齐；真实传输中回调
可能晚于工具最终响应处理，不能仅凭 `call_tool()` 返回便断言回调已跑完。

`watch_batch` 真实打开一个来源文件，报告一次进度后等待。客户端等到这份进度后，
取消等待该调用的 AnyIO 取消作用域。SDK 2.3.0 真正发出 `notifications/cancelled`，
服务端处理器收到取消，`finally` 关闭文件。程序从独立事件文件核对 `file_closed=true`，
再确认同一连接仍然可读补录5；不是把杀死整个服务端冒充单请求取消。

最后退出 stdio 上下文，SDK关闭输入端，服务端收到EOF、退出，客户端独立核对进程
已经被回收。实验服务端没有创建孙进程；不据此推断 SDK 会清理任意服务端派生进程。

协议取消要求协作。它不撤销已经提交的外部业务效果，也不证明任意工具都能立即停止。

## 文件与验证边界

- `server.py`：真正的官方 SDK stdio 服务端；本地只读工具和取消资源清理。
- `client_lab.py`：真正的 `ClientSession`、新服务端子进程、传输观测及独立来源验收。
- `orders.json`：受控的权威输入。
- `requirements.txt`：本次安装的精确依赖版本。
- `validation.json`：源码摘要与本次实际输出；不能替代自己的重跑。

本实验没有实现HTTP/Streamable HTTP、OAuth、远端工具、模型选择、写入幂等、业务回滚
或Kairo适配器。`clientInfo` 是客户端自行声明的实现信息；同一个连接和相同
`task_id` 都不代替可信身份或业务授权。
