"""Run the real official-SDK experiment, then bind original lesson/figures/ZIP.

Use the lab's pinned Python environment. --from-record only regenerates artifacts
after verifying every recorded source hash; it does not claim a fresh execution.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile


ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / "dist/labs/mcp-protocol"
FILES = ["client_lab.py", "server.py", "orders.json", "requirements.txt", "README.md"]


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def svg(name, title, desc, height, metadata, body):
    text = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img" aria-labelledby="title desc">
<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(desc)}</desc>
<metadata>{html.escape(json.dumps(metadata, ensure_ascii=False), quote=False)}</metadata>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#65778f" stroke-width="1.5"/></marker></defs>
<style>text{{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-size:20px;fill:#26364e}}.title{{font-size:27px;font-weight:700}}.heading{{font-size:21px;font-weight:650}}.small{{font-size:18px}}.tiny{{font-size:17px}}.muted{{fill:#5c6d85}}.blue{{fill:#315dce}}.box{{fill:#fff;stroke:#bdcde0;stroke-width:1.5}}.line{{stroke:#65778f;stroke-width:2;fill:none;marker-end:url(#arrow)}}.dashed{{stroke-dasharray:7 6}}.good{{fill:#eaf6f0}}.wait{{fill:#fff4dc}}.bad{{fill:#ffeded}}.soft{{fill:#edf2ff}}</style>
<rect width="1120" height="{height}" rx="16" fill="#f8fafd"/>{body}</svg>\n'''
    (ROOT / "dist/diagrams" / ("mcp-protocol-" + name + ".svg")).write_text(text)


def generate(record):
    program = record["program"]
    modern, legacy = program["modern"], program["legacy"]
    outgoing = [x["message"] for x in modern["trace"] if x["direction"] == "client_to_server"]
    incoming = [x["message"] for x in modern["trace"] if x["direction"] == "server_to_client"]
    call = next(x for x in outgoing if x.get("method") == "tools/call" and x["params"]["name"] == "read_batch")
    response = next(x for x in incoming if x.get("id") == call["id"])
    error = next(x for x in incoming if "error" in x)
    cancel = next(x for x in outgoing if x.get("method") == "notifications/cancelled")
    watch_id = cancel["params"]["requestId"]
    modern_list_id = next(x["id"] for x in outgoing if x.get("method") == "tools/list")
    legacy_outgoing = [x["message"] for x in legacy["trace"] if x["direction"] == "client_to_server"]
    legacy_initialize_id = next(x["id"] for x in legacy_outgoing if x.get("method") == "initialize")
    legacy_list_id = next(x["id"] for x in legacy_outgoing if x.get("method") == "tools/list")
    legacy_call_id = next(x["id"] for x in legacy_outgoing if x.get("method") == "tools/call")
    evidence = {"sdk": program["sdk"], "python": program["python"],
                "modern_metadata": modern["metadata"], "legacy_metadata": legacy["metadata"],
                "call_request": call, "call_response": response, "protocol_error_response": error,
                "cancel_notification": cancel, "source_sha256": record["source_sha256"]}

    svg("objects", "先把四个对象放到同一张图里", "宿主包含MCP客户端，独立服务端提供工具，订单来源由独立判据核对。", 660,
        {"source": json.loads((LAB / "orders.json").read_text()), "tools": list(modern["tools"]),
         "normal_total": modern["scan"]["total"], "wrong_total": program["wrong_total"]["scan"]["total"]}, '''
<text x="34" y="48" class="title">MCP连接怎样进入一项真实任务</text>
<text x="34" y="82" class="small muted">这条图只画modern连接；实际实验还另起legacy与wrong-total两份服务端。</text>
<rect x="34" y="124" width="325" height="269" rx="12" class="box"/>
<text x="54" y="162" class="heading">宿主 · client_lab.py</text><text x="54" y="198">目标：汇总 report-A</text>
<rect x="54" y="223" width="285" height="112" rx="9" class="soft"/>
<text x="73" y="254" class="heading blue">MCP客户端</text><text x="73" y="285" class="small">官方ClientSession</text><text x="73" y="316" class="small">请求、响应、进度与取消</text>
<text x="54" y="366" class="small">保留任务目标和独立验收</text>
<rect x="455" y="124" width="315" height="269" rx="12" class="box"/>
<text x="475" y="162" class="heading">独立进程 · server.py</text><text x="475" y="198">MCP服务端</text>
<rect x="475" y="223" width="275" height="112" rx="9" class="good"/>
<text x="495" y="254" class="heading">公开工具</text><text x="495" y="285" class="small">read_batch / scan_batches</text><text x="495" y="316" class="small">watch_batch</text>
<text x="475" y="366" class="small">验证输入，读取固定来源</text>
<path d="M362 245H447" class="line"/><path d="M447 305H362" class="line"/>
<text x="372" y="225" class="tiny">stdio</text><text x="369" y="285" class="tiny">JSON消息</text>
<rect x="854" y="160" width="232" height="200" rx="12" class="box"/>
<text x="874" y="196" class="heading">orders.json</text><text x="874" y="232">report-A / v3</text><text x="874" y="268">base：[10,27]</text><text x="874" y="304">late：[5]</text><text x="874" y="338" class="small">独立权威输入</text>
<path d="M776 259H845" class="line"/><text x="783" y="238" class="tiny">只读</text>
<path d="M966 371V460H195V405" class="line dashed"/><text x="430" y="449" class="small">宿主另行读取来源，核对版本、值和总数</text>
<rect x="34" y="500" width="1052" height="118" rx="12" class="soft"/>
<text x="54" y="535" class="heading">三种信息，各有自己的职责</text>
<text x="54" y="569">请求id：认回一次响应</text><text x="416" y="569">task_id：说明业务目标</text><text x="789" y="569">来源与判据：核对42</text>
<text x="54" y="601" class="small muted">同一个进程或相同clientInfo不构成认证；连接也不保存隐含对话或任务身份。</text>''')

    svg("versions", "现代与旧版，起点由协议版本决定", "真实ClientSession.discover使用2026-07-28，独立initialize连接协商2025-11-25；不是同一连接混用。", 780,
        {"modern_first": outgoing[0], "modern_discovery": modern["metadata"],
         "legacy_metadata": legacy["metadata"], "legacy_outgoing": legacy_outgoing}, f'''
<text x="34" y="48" class="title">两条真实连接，按各自版本规则前进</text>
<rect x="26" y="83" width="527" height="620" rx="12" class="soft"/>
<rect x="567" y="83" width="527" height="620" rx="12" class="box"/>
<text x="48" y="120" class="heading blue">现代 · 2026-07-28</text><text x="590" y="120" class="heading">旧版 · 2025-11-25</text>
<text x="48" y="155" class="small">本例主动探测；现代协议不要求握手</text><text x="590" y="155" class="small">本例另起进程，明确走初始化路径</text>
<text x="70" y="197">客户端</text><text x="412" y="197">服务端</text><text x="611" y="197">客户端</text><text x="954" y="197">服务端</text>
<path d="M111 214V610M452 214V610M651 214V610M992 214V610" fill="none" stroke="#b7c7dd" stroke-width="2"/>
<path d="M113 252H448" class="line"/><text x="180" y="240" class="small">server/discover · id{outgoing[0]['id']}</text>
<path d="M449 310H115" class="line"/><text x="157" y="298" class="small">支持版本、服务端能力</text>
<path d="M113 408H448" class="line"/><text x="207" y="396" class="small">tools/list · id{modern_list_id}</text>
<path d="M449 458H115" class="line"/><text x="222" y="446" class="small">三个工具及结构</text>
<path d="M113 541H448" class="line"/><text x="198" y="529" class="small">tools/call · id{call['id']}</text>
<path d="M449 590H115" class="line"/><text x="201" y="578" class="small">read_batch → 37</text>
<path d="M653 252H988" class="line"/><text x="738" y="240" class="small">initialize · id{legacy_initialize_id}</text>
<path d="M989 310H655" class="line"/><text x="724" y="298" class="small">协商版本、双方能力</text>
<path d="M653 359H988" class="line"/><text x="684" y="347" class="small">notifications/initialized</text>
<path d="M653 408H988" class="line"/><text x="748" y="396" class="small">tools/list · id{legacy_list_id}</text>
<path d="M989 458H655" class="line"/><text x="760" y="446" class="small">三个工具及结构</text>
<path d="M653 541H988" class="line"/><text x="742" y="529" class="small">tools/call · id{legacy_call_id}</text>
<path d="M989 590H655" class="line"/><text x="742" y="578" class="small">read_batch → 37</text>
<text x="49" y="647" class="small">每个请求携带必需_meta：</text><text x="49" y="678" class="tiny">协议版本、客户端实现、客户端能力</text>
<text x="590" y="647" class="small">先完成本连接的initialize握手</text><text x="590" y="678" class="tiny">成功响应后，客户端通知已就绪</text>
<text x="34" y="745" class="small muted">请求id只认回相应请求；包版本mcp 2.3.0、宿主版本1.0.0与日期协议版本不是同一项。</text>''')

    after_id = next(x["id"] for x in outgoing if x.get("method") == "tools/call" and x["params"]["arguments"].get("batch_id") == "late")
    svg("cancellation", "取消一个调用，与关闭整个服务分别检查", "等待进度后发取消通知，服务端处理器finally关闭文件，随后同连接查询仍成功；最后EOF退出。", 820,
        {"cancel_notification": cancel, "server_cleanup": modern["server_cleanup"],
         "after_cancel": modern["after_cancel"], "server_exit_event": modern["server_exit_event"],
         "server_process_reaped": modern["server_process_reaped"], "cancelled_response_absent": program["independent_oracle"]["cancelled_response_absent"]}, f'''
<text x="34" y="48" class="title">沿同一次调用，把停止事实逐层核对</text>
<text x="34" y="83" class="small muted">下面是受控程序的先后关系，不是毫秒性能报告；没有外部写入或业务回滚。</text>
<text x="40" y="137" class="heading">事件</text><text x="241" y="137" class="heading">客户端等待者</text><text x="518" y="137" class="heading">协议与服务端</text><text x="848" y="137" class="heading">实际资源</text>
<path d="M30 157H1090" stroke="#b7c7dd" stroke-width="2"/>
<rect x="225" y="184" width="260" height="92" rx="8" class="soft"/><rect x="507" y="184" width="310" height="92" rx="8" class="soft"/><rect x="837" y="184" width="251" height="92" rx="8" class="wait"/>
<text x="40" y="220" class="heading">① 发出请求</text><text x="245" y="220">等待 tools/call {watch_id}</text><text x="526" y="220">watch_batch已进入</text><text x="857" y="220">来源文件已打开</text>
<text x="245" y="253" class="small">同一连接还有其他请求</text><text x="526" y="253" class="small">发出一次真实进度</text><text x="857" y="253" class="small">处理器继续等待</text>
<rect x="225" y="303" width="260" height="92" rx="8" class="wait"/><rect x="507" y="303" width="310" height="92" rx="8" class="wait"/><rect x="837" y="303" width="251" height="92" rx="8" class="wait"/>
<text x="40" y="340" class="heading">② 确认已开始</text><text x="245" y="340">进度回调设置事件</text><text x="526" y="340">progressToken={watch_id}</text><text x="857" y="340">文件仍由调用持有</text>
<text x="245" y="373" class="small">现在才取消等待作用域</text><text x="526" y="373" class="small">通知自身没有请求id</text><text x="857" y="373" class="small">尚未宣称清理完成</text>
<rect x="225" y="422" width="260" height="92" rx="8" class="bad"/><rect x="507" y="422" width="310" height="92" rx="8" class="soft"/><rect x="837" y="422" width="251" height="92" rx="8" class="good"/>
<text x="40" y="459" class="heading">③ 发取消通知</text><text x="245" y="459">本地等待已取消</text><text x="526" y="459">requestId={watch_id} → 处理器取消</text><text x="857" y="459">finally关闭文件</text>
<text x="245" y="492" class="small">SDK实际发送cancelled</text><text x="526" y="492" class="small">没有id{watch_id}的结果或错误响应</text><text x="857" y="492" class="small">file_closed=true</text>
<rect x="225" y="541" width="260" height="92" rx="8" class="good"/><rect x="507" y="541" width="310" height="92" rx="8" class="good"/><rect x="837" y="541" width="251" height="92" rx="8" class="good"/>
<text x="40" y="578" class="heading">④ 连接继续用</text><text x="245" y="578">请求{after_id}读取late</text><text x="526" y="578">同一服务端返回5</text><text x="857" y="578">旧文件保持关闭</text>
<text x="245" y="611" class="small">得到另一个正常结果</text><text x="526" y="611" class="small">单调用取消未杀死服务</text><text x="857" y="611" class="small">独立事件文件可核对</text>
<rect x="225" y="660" width="260" height="92" rx="8" class="box"/><rect x="507" y="660" width="310" height="92" rx="8" class="box"/><rect x="837" y="660" width="251" height="92" rx="8" class="good"/>
<text x="40" y="697" class="heading">⑤ 关闭连接</text><text x="245" y="697">退出stdio上下文</text><text x="526" y="697">输入EOF，服务端退出</text><text x="857" y="697">进程已被回收</text>
<text x="245" y="730" class="small">关闭服务端标准输入</text><text x="526" y="730" class="small">留下server_stopped事件</text><text x="857" y="730" class="small">独立PID检查通过</text>
<text x="34" y="793" class="small muted">协议取消不等于外部效果撤销；这里仅验证只读处理器、真实文件关闭与本次服务端退出。</text>''')

    template = (ROOT / "scripts/mcp-protocol.template.js").read_text()
    sources = {name: (LAB / name).read_text() for name in FILES}
    output = template.replace("__MCP_FILES__", json.dumps(sources, ensure_ascii=False)).replace("__MCP_EVIDENCE__", json.dumps(evidence, ensure_ascii=False))
    assert "__MCP_" not in output
    (ROOT / "dist/mcp-protocol.js").write_text(output)
    with zipfile.ZipFile(LAB.with_suffix(".zip"), "w", zipfile.ZIP_DEFLATED) as archive:
        for name in FILES + ["validation.json"]:
            entry = zipfile.ZipInfo("mcp-protocol/" + name, date_time=(2026, 11, 8, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, (LAB / name).read_bytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-record", action="store_true")
    args = parser.parse_args()
    if args.from_record:
        record = json.loads((LAB / "validation.json").read_text())
    else:
        program = json.loads(subprocess.check_output([sys.executable, "-B", str(LAB / "client_lab.py")], text=True, timeout=45))
        assert program["status"] == "passed" and program["sdk"] == "2.3.0"
        record = {"schema": "mcp-protocol-v1", "status": "passed", "verified_on": "2026-11-08",
                  "command": "python -B client_lab.py", "environment": {"python": program["python"], "sdk": program["sdk"], "os": platform.system(), "transport": "actual SDK stdio subprocesses"},
                  "source_sha256": {name: sha(LAB / name) for name in FILES}, "program": program,
                  "scope": "Actual official SDK 2.3.0, modern+legacy stdio and read-only fixture; no HTTP/OAuth/LLM/write-effect rollback/Kairo."}
        (LAB / "validation.json").write_text(dump(record))
    for name in FILES:
        assert sha(LAB / name) == record["source_sha256"][name], name + ": source changed after execution record"
    generate(record)
    print("PASS: real SDK modern/legacy/semantic-negative record, complete source, three original data-bound SVGs and ZIP.")


if __name__ == "__main__":
    main()
