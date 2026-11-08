"""Original teaching diagrams: counting ledger, execution hierarchy, timeline and information flow."""
from html import escape
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "dist/diagrams"
BLUE, INK, MUTED, LINE = "#315dce", "#17263e", "#56667d", "#cdd9e9"
GREEN, AMBER = "#12725b", "#936013"


def text(x, y, value, size=21, color=INK, weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(str(value))}</text>'


def box(x, y, w, h, fill="#fff", stroke=LINE):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}"/>'


def arrow(x1, y1, x2, y2):
    return f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{BLUE}" stroke-width="2.5" fill="none" marker-end="url(#arrow)"/>'


def save(name, title, desc, height, items, metadata):
    data = json.dumps(metadata, ensure_ascii=False)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 {height}" width="1120" height="{height}" role="img" aria-labelledby="title desc">'
           f'<title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc><metadata>{escape(data)}</metadata>'
           f'<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="{BLUE}"/></marker></defs>'
           '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">'
           + box(1, 1, 1118, height-2, "#f7f9fd") + text(36, 48, title, 28, INK, 700)
           + text(36, 84, desc, 18, MUTED) + ''.join(items) + '</g></svg>\n')
    (ROOT / (name + '.svg')).write_text(svg)


items = [box(36, 121, 1048, 90, "#edf2ff"), text(58, 155, "同一个用户事件：归属正确 + 版本正确 + 端到端 ≤ 500毫秒", 23, BLUE, 700),
         text(58, 189, "先分类、等待结果成熟，再合并；超时不能因缺少结束日志而消失。", 20)]
for y, name, total, good, bad in [(244, "甲", 900, 899, 1), (324, "乙", 100, 90, 10), (418, "合并", 1000, 989, 11)]:
    items += [box(36, y, 1048, 64, "#edf6f3" if name == "合并" else "#fff"), text(58, y+40, name, 23, GREEN if name == "合并" else INK, 700)]
    for x, label, value in [(215, "总", total), (492, "好", good), (788, "坏", bad)]:
        items += [text(x, y+40, f"{label} {value}", 24)]
items += [arrow(558, 391, 558, 413), box(36, 518, 504, 145), box(564, 518, 520, 145, "#fff6e8"),
          text(58, 555, "SLI：已经发生的好率", 23, BLUE, 700), text(58, 599, "989 ÷ 1000 = 98.9%", 27),
          text(58, 642, "先加计数，再求比率", 20, MUTED),
          text(586, 555, "SLO 99% → 允许坏事件10", 23, AMBER, 700), text(586, 599, "剩余预算：10 − 11 = −1", 25),
          text(586, 642, "燃烧倍数：1.1% ÷ 1% = 1.1", 20),
          text(38, 707, "固定教学计数；不是生产采集。99.9%的双窗口告警属于后面的独立题设。", 19, MUTED)]
save('v51-slo-event-ledger', '从一笔用户结果，走到总体指标与预算', '分母、好事件与目标各有职责；机器数量不参与请求权重。', 742, items,
     {'kind': 'fixed_count_ledger', 'total': 1000, 'good': 989, 'bad': 11, 'target': '99/100', 'allowed_bad': 10, 'remaining': -1, 'production_measurement': False})

items = [box(36, 122, 1048, 218, "#edf2ff"), text(58, 159, "一次内核启动的网格：10个线程块", 24, BLUE, 700)]
for b in range(10):
    x = 58+b*101
    items += [box(x, 185, 90, 108, "#fff6e8" if b == 9 else "#fff"), text(x+12, 218, f"块 {b}", 20, INK, 700),
              text(x+12, 251, "256线程", 17), text(x+12, 280, "8个warp", 16, MUTED)]
items += [text(58, 323, "第0—8块：2304个有效编号；第9块：196个有效编号 + 60个保护编号。", 20),
          box(36, 383, 660, 147), text(58, 422, "一个元素的编号从哪里来", 24, BLUE, 700),
          text(58, 464, "i = 块号 × 256 + 块内线程号", 25), text(58, 502, "块9、线程196 → i=2500；不小于n，不能访问。", 20),
          box(728, 383, 356, 147, "#edf6f3"), text(750, 422, "一组warp = 32线程", 23, GREEN, 700),
          text(750, 464, "定义指令执行分组", 21), text(750, 502, "不等于32个CPU核心", 20),
          arrow(365, 344, 365, 378), box(36, 577, 1048, 106), text(58, 615, "硬件SM负责执行块；驻留数量还受资源限制", 24, BLUE, 700),
          text(58, 653, "软件块编号不指定物理SM编号；10块不表示10个SM或全部同时运行。", 21),
          text(38, 727, "固定索引示意 + Python覆盖复算；没有运行CUDA内核或测量真实GPU。", 19, MUTED)]
save('v51-gpu-work-mapping', '先分清软件怎样分工，再问硬件怎样执行', '一维数组2500个FP32元素，每块256线程，尾部必须保护。', 762, items,
     {'kind': 'execution_hierarchy', 'elements': 2500, 'threads_per_block': 256, 'blocks': 10, 'warp_size': 32, 'valid_last_block': 196, 'protected_last_block': 60, 'gpu_execution': False})

items = [text(36, 147, "主机侧", 23, BLUE, 700), text(36, 298, "设备流", 23, GREEN, 700)]
for x, w, label in [(166, 190, '准备输入'), (382, 220, '提交事件与工作'), (634, 181, '等待结束事件'), (847, 237, '消费结果')]:
    items += [box(x, 116, w, 78), text(x+18, 163, label, 21)]
for x1, x2 in [(358, 377), (604, 629), (817, 842)]:
    items += [arrow(x1, 155, x2, 155)]
items += [box(382, 257, 433, 105, "#edf6f3"), text(400, 298, "起始事件 → 100次加法 → 结束事件", 21, GREEN, 700),
          text(400, 337, "按同一流的顺序推进", 20), arrow(480, 199, 480, 250), arrow(744, 368, 744, 405),
          box(36, 411, 1048, 106, "#edf2ff"), text(58, 449, "事件计时", 23, BLUE, 700),
          text(58, 489, "两个设备标记之间的时间；不自动包含输入准备和结果消费。", 22),
          box(36, 552, 1048, 106), text(58, 590, "端到端计时", 23, INK, 700),
          text(58, 630, "从准备输入到确认所需结果完成；明确包含复制、排队和同步中的哪些部分。", 21),
          text(38, 705, "示意无比例、无耗时数值；其他流若有依赖，要另建同步与测量边界。", 19, MUTED)]
save('v51-gpu-time-boundaries', '提交返回、设备完成、用户拿到结果是三个时刻', '先定义起止边界，再解释秒表读数；本图没有真实GPU测量。', 742, items,
     {'kind': 'symbolic_timeline', 'iterations': 100, 'numeric_durations': False, 'gpu_execution': False, 'same_stream_events': True})

items = [box(36, 122, 1048, 108, "#edf6f3"), text(58, 161, "① 权威执行记录：先判断已经发生什么", 24, GREEN, 700),
          text(58, 204, "R17 / 任务v2 / SUCCEEDED / 原操作R17:publish / 效果回执13", 22),
          box(36, 276, 500, 155), text(58, 314, "② 资料与记忆：形成候选", 23, BLUE, 700),
          text(58, 355, "本轮主体 → 当前读取资格 → 问题范围", 20), text(58, 393, "来源版本、期限、撤回状态分别检查", 20),
          box(568, 276, 516, 155), text(590, 314, "③ 本轮上下文：组装可见输入", 23, BLUE, 700),
          text(590, 355, "规则 + 当前任务视图 + 选中材料", 21), text(590, 393, "完整请求计数 + 输出预留 ≤ 窗口", 20),
          arrow(536, 354, 562, 354), arrow(827, 235, 827, 270),
          box(36, 477, 1048, 113, "#edf2ff"), text(58, 517, "④ 模型输出：回答或动作提议", 24, BLUE, 700),
          text(58, 558, "交给执行层检查权限、参数与事实；不能直接改写上面的权威记录。", 21),
          arrow(827, 436, 827, 471), box(36, 632, 1048, 109, "#fff6e8"),
          text(58, 671, "旧摘要v1说RUNNING，不能覆盖当前任务v2的成功事实。", 23, AMBER, 700),
          text(58, 712, "任务版本与资料版本各自计数；TTL未到也不证明资料当前有效。", 21),
          text(38, 786, "信息职责示意。原实验验证本地SQLite选择与恢复，未调用LLM、云IAM或Kairo。", 19, MUTED)]
save('v51-agent-information-flow', '从保存了信息，到本轮真正可以使用', '权威状态、长期记忆与上下文各有职责，不能互相代写。', 820, items,
     {'kind': 'information_flow', 'task': 'R17', 'task_version': 2, 'original_op': 'R17:publish', 'receipt': 13, 'llm_execution': False, 'kairo_execution': False, 'source_version_independent': True})
print('PASS: 4 original diagrams generated with explicit teaching and measurement boundaries.')
