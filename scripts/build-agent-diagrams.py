#!/usr/bin/env python3
"""Generate the two self-contained Agent Infra teaching diagrams."""

from html import escape
from pathlib import Path
import xml.etree.ElementTree as ET


OUTPUT = Path(__file__).resolve().parents[1] / "dist" / "diagrams"
BLUE = "#315dce"
INK = "#203553"
MUTED = "#61748e"
STROKE = "#d7e1ef"


def text(x, y, value, cls="body", anchor="start"):
    return (f'<text x="{x}" y="{y}" class="{cls}" '
            f'text-anchor="{anchor}">{escape(value)}</text>')


def rect(x, y, width, height, fill="#ffffff", stroke=STROKE, radius=10):
    return (f'<rect x="{x}" y="{y}" width="{width}" height="{height}" '
            f'rx="{radius}" fill="{fill}" stroke="{stroke}"/>')


def arrow(path, dashed=False):
    dash = ' stroke-dasharray="6 5"' if dashed else ""
    return (f'<path d="{path}" fill="none" stroke="{BLUE}" '
            f'stroke-width="2" marker-end="url(#arrow)"{dash}/>')


def card(x, y, width, height, title, lines, emphasis=False):
    parts = [rect(x, y, width, height,
                  "#edf2fe" if emphasis else "#ffffff",
                  "#7e9ee5" if emphasis else STROKE),
             text(x + width / 2, y + 30, title, "label", "middle")]
    for index, line in enumerate(lines):
        parts.append(text(x + width / 2, y + 55 + index * 20,
                          line, "small", "middle"))
    return "\n".join(parts)


def svg(title, description, height, elements):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="960" height="{height}" viewBox="0 0 960 {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title>
<desc id="desc">{escape(description)}</desc>
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="{BLUE}"/></marker></defs>
<style>
text{{font-family:'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;fill:{INK}}}
.title{{font-size:23px;font-weight:700}}
.label{{font-size:17px;font-weight:600}}
.body{{font-size:15px}}
.small{{font-size:14px;fill:{MUTED}}}
.eyebrow{{font-size:11px;fill:{BLUE};letter-spacing:2px}}
.accent{{font-size:15px;fill:{BLUE};font-weight:600}}
</style>
<rect width="960" height="{height}" rx="14" fill="#f6f8fc"/>
{chr(10).join(elements)}
</svg>
'''


def execution():
    elements = [
        text(30, 30, "INFRAGUIDE / AGENT SYSTEMS", "eyebrow"),
        text(30, 67, "Agent 执行链路：提议、授权、验证分别负责", "title"),
        text(30, 95, "模型提出下一步；运行时决定能否执行，并依据实际结果推进任务。", "small"),
        card(45, 135, 235, 85, "检索内容 / 记忆", ["任务数据，不是权限来源"]),
        card(315, 135, 230, 85, "授权来源（模型之外）", ["身份 · 用户委托 · 管理策略"], True),
        arrow("M245 220 L245 275", True),
        text(258, 251, "提供信息", "small"),
        arrow("M402 220 L402 275", True),
        text(415, 251, "提供权限依据", "small"),
    ]
    steps = [
        (28, "任务", ["目标与约束", "预算 / 截止时间"]),
        (184, "模型提议", ["生成工具提议", "尚未获授权"]),
        (340, "策略校验", ["参数 + 作用域", "允许 / 拒绝"]),
        (496, "工具执行", ["在隔离边界内", "返回结构化结果"]),
        (652, "业务验证", ["检查实际结果", "是否满足目标"]),
        (808, "状态更新", ["记录结果 / 事件", "完成或继续"]),
    ]
    for x, title, lines in steps:
        elements.append(card(x, 280, 124, 100, title, lines, x == 340))
        if x < 808:
            elements.append(arrow(f"M{x + 129} 330 L{x + 151} 330"))
    elements.extend([
        arrow("M870 380 L870 421 L246 421 L246 385", True),
        text(558, 411, "未完成且仍有预算：进入下一步", "small", "middle"),
        rect(28, 457, 904, 118),
        text(50, 487, "运行时落实执行边界", "label"),
        text(50, 514, "策略拒绝或参数不合法时，不进入工具执行；取消与超时另行记录。", "body"),
        text(50, 543, "检索文本和工具返回不能扩展权限；工具调用成功仍需业务结果验证。", "body"),
        text(30, 605, "实线：执行路径　虚线：信息 / 策略输入与下一步控制", "small"),
    ])
    return svg("Agent 执行链路与权限来源",
               "执行顺序是任务、模型提议、策略校验、工具执行、业务验证、状态更新。"
               "模型外的身份、用户委托和管理策略提供权限依据；检索内容和记忆只提供信息，不能授予权限。"
               "未完成且预算允许时进入下一步。策略拒绝时不执行工具。", 630, elements)


def commit():
    elements = [
        text(30, 30, "INFRAGUIDE / DURABLE EXECUTION", "eyebrow"),
        text(30, 67, "提交窗口：有执行记录，还需要工具端幂等", "title"),
        text(30, 95, "runner.db 与 tool.db 是两个独立持久化域；两者之间没有原子事务。", "small"),
        rect(28, 118, 432, 515, "#f0f4fa"),
        rect(500, 118, 432, 515, "#f0f4fa"),
        text(244, 149, "runner.db · 执行器状态", "label", "middle"),
        text(716, 149, "tool.db · 模拟业务服务", "label", "middle"),
        text(244, 175, "持久化意图、尝试与完成结果", "small", "middle"),
        text(716, 175, "业务效果与幂等回执共同提交", "small", "middle"),
        card(60, 200, 368, 76, "① 提交执行意图", ["稳定 key + 参数指纹 + 未完成状态"]),
        card(532, 200, 368, 76, "② 工具效果 + 回执：同一事务", ["业务变更与该 key 的结果一起提交"], True),
        arrow("M434 238 L526 238"),
        text(480, 226, "调用", "small", "middle"),
        arrow("M716 276 L716 307"),
        rect(60, 315, 840, 64, "#e5edfc", "#7e9ee5"),
        text(480, 341, "崩溃窗口：工具已提交，runner 尚未记录完成", "label", "middle"),
        text(480, 365, "此时结果未知，不代表业务效果尚未发生。", "small", "middle"),
        arrow("M244 379 L244 405", True),
        card(60, 411, 368, 76, "③ 恢复：读取未完成意图", ["重试复用同一 key 与同一参数指纹"]),
        card(532, 411, 368, 76, "工具端按 key 去重", ["同指纹返回原回执；不同指纹拒绝"], True),
        arrow("M434 449 L526 449", True),
        text(480, 437, "重试", "small", "middle"),
        arrow("M716 487 L716 578 L434 578"),
        text(716, 520, "返回同一结果", "accent", "middle"),
        text(716, 543, "业务效果不再重复发生", "small", "middle"),
        card(60, 540, 368, 76, "④ runner 提交完成状态", ["业务验证通过后保存结果"]),
        text(30, 665, "幂等由工具侧落实；仅有 runner ledger 无法保证外部效果不重复。", "body"),
        text(30, 694, "实验范围：单机、单活 runner；不覆盖多 worker 协调与真实远程服务。", "small"),
    ]
    return svg("独立持久化域之间的提交窗口与幂等恢复",
               "runner.db 先提交稳定操作键和参数指纹。tool.db 在一个事务内提交业务效果与回执。"
               "如果工具已经提交而 runner 尚未记录完成时发生崩溃，恢复后使用同一键和同一参数指纹重试。"
               "工具端返回已保存的结果，参数不一致则拒绝，业务效果不会重复。"
               "runner 验证业务结果后提交完成状态。此实验仅涵盖单机单活执行器，不覆盖多 worker 协调。",
               720, elements)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, content in (("agent-execution.svg", execution()),
                          ("agent-commit.svg", commit())):
        root = ET.fromstring(content)
        assert root.attrib["width"] == "960"
        assert root.find("{http://www.w3.org/2000/svg}title") is not None
        assert root.find("{http://www.w3.org/2000/svg}desc") is not None
        destination = OUTPUT / name
        destination.write_text(content, encoding="utf-8")
        ET.parse(destination)
        print(f"XML valid: {destination.name}")


if __name__ == "__main__":
    main()
