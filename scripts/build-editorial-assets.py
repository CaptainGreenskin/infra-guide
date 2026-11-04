"""Package the deterministic incident lesson and draw figures from its actual output."""
import hashlib
import json
from html import escape
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
LAB = DIST / 'labs/incident-model'
report = json.loads((LAB / 'report.json').read_text())
assert report['assertions'] == 'PASS'
assert report['source_sha256'] == hashlib.sha256((LAB / 'incident_model.py').read_bytes()).hexdigest()
files = {p.name: p.read_text() for p in LAB.iterdir() if p.is_file() and p.suffix in ('.py', '.md')}
(DIST / 'editorial-lab-files.js').write_text('const editorialLabFiles=' + json.dumps(files, ensure_ascii=False) + ';\n')
with ZipFile(DIST / 'labs/incident-model.zip', 'w', ZIP_DEFLATED) as archive:
    for name in ('incident_model.py', 'README.md', 'report.json'):
        archive.write(LAB / name, 'incident-model/' + name)


def text(x, y, content, size=19, color='#273852', anchor='start', weight=400):
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" font-weight="{weight}" fill="{color}">{escape(content)}</text>'


def line(x1, y1, x2, y2, color='#c7d2e1', width=1, extra=''):
    return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{color}" stroke-width="{width}" {extra}/>'


def rect(x, y, w, h, fill='#edf2fd', stroke='#c3d0ea'):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}"/>'


def save(name, title, desc, body, height):
    (DIST / 'diagrams' / f'{name}.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 {height}" role="img" aria-labelledby="title desc">'
        f'<title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc>'
        '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#315dce"/></marker></defs>'
        '<style>text{font-family:"PingFang SC","Microsoft YaHei",sans-serif}</style>'
        f'<rect width="960" height="{height}" fill="#f7f9fd" rx="12"/>'
        + text(32, 44, title, 25, weight=650) + body + '</svg>')


# A chart, rather than another box diagram: every point is taken from the run.
b = text(32, 81, '同样1000个请求、4个连接；整批排空后统计。单位：毫秒', 18)
left, top, width, height = 105, 125, 805, 320
for value in (0, 500, 1000, 1500, 2000, 2500):
    y = top + height - value / 2600 * height
    b += line(left, y, left + width, y) + text(left - 12, y + 6, str(value), 18, anchor='end')
for index in (1, 201, 401, 601, 801, 1000):
    x = left + (index - 1) / 999 * width
    b += text(x, top + height + 29, str(index), 18, anchor='middle')
for key, color, dash, stroke in [('holding_external_wait', '#315dce', '', 5),
                                  ('competing_slow_sql', '#a83a68', 'stroke-dasharray="10 9"', 3),
                                  ('fixed', '#167e67', '', 4)]:
    points = ' '.join(f'{left + i / 999 * width:.2f},{top + height - r["latency_ms"] / 2600 * height:.2f}'
                      for i, r in enumerate(report['runs'][key]['requests']))
    b += f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="{stroke}" {dash}/>'
b += text(910, 500, '请求序号 →', 18, anchor='end')
for y, color, label, dash in [(531, '#315dce', '故障：持连接外等30ms + SQL20ms', ''),
                              (565, '#a83a68', '竞争解释：只有SQL50ms（与蓝线完全重合）', 'stroke-dasharray="10 9"'),
                              (599, '#167e67', '修复：SQL20ms，释放后再等30ms', '')]:
    b += line(38, y - 6, 86, y - 6, color, 4, dash) + text(101, y, label, 19)
b += text(32, 640, '蓝线与虚线同为p95 2430ms；绿线p95 60ms。原因要靠区间探测区分。', 18)
save('v17-incident-latency', '相同延迟曲线，可以对应不同原因', '蓝色故障与红色虚线竞争解释逐请求延迟完全相同；绿色修复保持60毫秒。图来自确定性教学模型，不是压测。', b, 672)

# Fixed-request decomposition; scaled to the same time axis.
b = text(32, 83, '第201号请求：2000ms到达，2560ms完成；时间为教学模型事件', 18)
scale, x, y = 1.48, 56, 152
for duration, fill, label in [(500, '#dbe4f8', '等连接 500ms'), (30, '#f1ceac', ''),
                              (20, '#b6dacb', ''), (10, '#d7ccf2', '')]:
    w = duration * scale
    b += rect(x, y, w, 62, fill, '#aab8cf')
    if label: b += text(x + w / 2, y + 38, label, 22, anchor='middle', weight=600)
    x += w
b += text(56, 136, '到达 2000', 18)
b += text(796, 253, '获连接 2500', 18, anchor='end')
b += line(796, 215, 796, 234, '#8c9ab2', 2)
b += text(884, 136, '完成 2560', 18, anchor='end')
for yy, label, detail, fill in [(299, '① 外部等待', '2500→2530：30ms，连接仍被占用', '#f1ceac'),
                                (343, '② SQL执行', '2530→2550：20ms，然后归还连接', '#b6dacb'),
                                (387, '③ 应用处理', '2550→2560：10ms，连接已释放', '#d7ccf2')]:
    b += rect(56, yy - 21, 22, 22, fill) + text(94, yy, label, 19, weight=600) + text(278, yy, detail, 19)
b += text(56, 441, '560 = 500 + 30 + 20 + 10；其中连接实际持有50ms', 22, weight=600)
save('v17-incident-request', '一条请求，把等待与占用分开', '同一请求的560毫秒由500毫秒池等待、30毫秒持连接外等、20毫秒SQL和10毫秒归还后处理构成。', b, 480)

# Architecture tailored to the two-rank teaching job, not the four-GPU lab.
b = text(32, 82, 'run-017 / attempt-1 · 两个rank · 图示职责，不代表真实云部署记录', 18)
for x, label, sub in [(32, '提交契约', '程序、数据、身份'), (352, '控制平面', '准入、放置、成员'), (672, '持久产物', '检查点与清单')]:
    b += rect(x, 118, 256, 86) + text(x + 128, 151, label, 22, anchor='middle', weight=600) + text(x + 128, 181, sub, 18, anchor='middle')
b += line(288, 161, 352, 161, '#315dce', 3, 'stroke-dasharray="7 5"')
for x, label in [(172, 'rank0：32条 × 2批'), (536, 'rank1：32条 × 2批')]:
    b += rect(x, 287, 252, 104, '#e6edf9') + text(x + 126, 322, label, 20, anchor='middle', weight=600) + text(x + 126, 355, '前反向 → 累积梯度', 19, anchor='middle')
b += line(480, 204, 298, 287, '#315dce', 2, 'stroke-dasharray="7 5"')
b += line(480, 204, 662, 287, '#315dce', 2, 'stroke-dasharray="7 5"')
b += line(424, 339, 536, 339, '#315dce', 3, 'marker-start="url(#arrow)"') + text(480, 326, '同步', 18, anchor='middle')
b += rect(32, 466, 256, 88, '#e8f2eb') + text(160, 500, '固定版本输入', 22, anchor='middle', weight=600) + text(160, 532, '各rank有可读分片', 18, anchor='middle')
b += rect(352, 466, 256, 88, '#e8f2eb') + text(480, 500, '首次实际step', 22, anchor='middle', weight=600) + text(480, 532, '不等于轮末保存', 18, anchor='middle')
b += line(160, 466, 270, 391, '#167e67', 3)
# The second data path bends around, rather than through, the step box.
b += '<path d="M288 486L310 486L310 420L662 420L662 391" fill="none" stroke="#167e67" stroke-width="2"/>'
b += line(298, 391, 438, 466, '#315dce', 2) + line(662, 391, 522, 466, '#315dce', 2)
b += line(608, 510, 800, 510, '#315dce', 3) + line(800, 510, 800, 204, '#315dce', 3)
b += text(712, 448, '轮末提交', 18) + text(32, 609, '虚线：控制依赖；实线：输入、同步、更新和产物。每一阶段单独核对证据。', 18)
b = b.replace('<path ', '<path marker-end="url(#arrow)" ')
save('v17-training-first-update', '从受理到首个更新，再到恢复点', '控制平面让两个rank启动；固定输入分别进入两个进程，累计后汇合，再实际step，轮末才提交持久产物。', b, 642)
print('Packaged incident model and generated 3 source-derived/architectural figures.')
