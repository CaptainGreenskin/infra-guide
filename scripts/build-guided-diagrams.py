"""Original teaching diagram; no model execution or performance claim."""
from pathlib import Path
from html import escape
import xml.etree.ElementTree as ET

OUT = Path(__file__).resolve().parents[1] / 'dist/diagrams/generation-ledger.svg'

def text(x, y, value, size=16, color='#203553', weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(value)}</text>'

def rect(x, y, w, h, fill='#fff', stroke='#d7e1ef', dashed=False):
    dash = ' stroke-dasharray="5 4"' if dashed else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{fill}" stroke="{stroke}"{dash}/>'

parts = [text(30, 31, 'INFRAGUIDE / ONE REQUEST, THREE OUTPUT TOKENS', 11, '#315dce', 600),
         text(30, 70, '生成了一个token，不等于已经处理了它', 25, weight=700),
         text(30, 103, '普通自回归循环 · 12个提示token · 每一行结束时观察每层的逻辑KV', 15, '#61748e')]
for x, label in [(45, '执行阶段'), (235, '本次模型输入'), (510, '采样输出'), (690, '结束后的KV位置数')]:
    parts.append(text(x, 145, label, 15, '#61748e', 600))
for i, (stage, entered, output, count, detail) in enumerate([
    ('Prefill', '12个提示token', 'A', '12', '提示已处理；A还没作为输入'),
    ('Decode 1', 'A', 'B', '13', 'A已处理；B还没作为输入'),
    ('Decode 2', 'B', 'C', '14', 'B已处理；C还没作为输入'),
]):
    y = 165 + i * 91
    parts += [rect(30, y, 900, 76), text(45, y+33, stage, 18, weight=600),
              text(235, y+33, entered, 17), text(510, y+34, output, 24, '#315dce', 600),
              text(690, y+30, count, 24, '#315dce', 600), text(690, y+56, detail, 13, '#61748e')]
parts += [rect(30, 458, 900, 81, '#edf2fe'), text(48, 489, '到此停止：保留12个提示 + A + B；C是刚产生的输出。', 18, '#315dce', 600),
          text(48, 518, '若继续，下一步才会输入C。物理缓存预留、裁剪、推测解码不在这张简化账本内。', 15, '#61748e'),
          text(30, 572, '原创逻辑示意 · 字母仅表示输出标签 · 图中大小不表示时间、显存或真实模型行为', 13, '#61748e')]
svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" role="img" aria-labelledby="title desc"><title id="title">一次请求的输入、输出与KV位置数</title><desc id="desc">12-token提示经过预填充产生A，输入A产生B，输入B产生C后停止。每层缓存依次包含12、13、14个已处理位置。</desc><style>text{font-family:"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif}</style><rect width="960" height="600" rx="12" fill="#f6f8fc"/>' + ''.join(parts) + '</svg>'
OUT.write_text(svg, encoding='utf-8')
ET.parse(OUT)
print('Generated generation-ledger.svg (logical teaching diagram).')
