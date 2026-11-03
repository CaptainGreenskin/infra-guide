"""Idealized CPU budget arithmetic; this is not a scheduler trace."""
from pathlib import Path
from html import escape
import xml.etree.ElementTree as ET

def text(x,y,value,size=16,color='#203553',weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(value)}</text>'

def bar(y,run_width,label):
    return (f'<rect x="160" y="{y}" width="720" height="46" rx="6" fill="#e5eaf2"/>'
            f'<rect x="160" y="{y}" width="{run_width}" height="46" rx="6" fill="#315dce"/>'
            +text(177,y+29,label,14,'#fff')
            +text(160+run_width+15,y+29,'预算已耗尽：示意等待',14,'#61748e'))

body=text(30,31,'INFRAGUIDE / CPU TIME IS A SHARED BUDGET',11,'#315dce',600)
body+=text(30,70,'0.5核配额：线程更多，总预算仍然相同',25,weight=700)
body+=text(30,105,'理想示意：cpu.max = 50000 100000；每100ms周期，共享50ms的CPU时间。',15,'#61748e')
for ms in [0,25,50,75,100]:
    x=160+ms*7.2
    body+=text(x-8,150,str(ms)+'ms',13,'#61748e')
body+=text(30,200,'一个线程',17,weight=600)+bar(173,360,'1 × 50ms = 50ms CPU')
body+=text(30,305,'两个线程',17,weight=600)+bar(278,180,'线程A：25ms')+bar(338,180,'线程B：25ms')
body+=text(160,416,'两个线程各执行25ms，合计已经使用50ms CPU时间。',17,'#315dce',600)
body+='<rect x="30" y="455" width="900" height="110" rx="8" fill="#edf2fe"/>'
body+=text(48,484,'图中假设：线程一直可运行，可在不同CPU并行；无额外burst和更紧父级限制。',15)
body+=text(48,514,'实际调度有粒度、分配和竞争差异，图中等待长度不是内核行为的精确预测。',15)
body+=text(48,544,'0.5 / 16 = 3.125%：主机总量很低与目标容器用满配额可以同时成立。',15)
body+=text(30,601,'原创教学示意 · 未执行真实Linux容器节流实验 · 蓝色表示执行，灰色表示理想化剩余周期',13,'#61748e')
svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 630" role="img" aria-labelledby="title desc"><title id="title">CPU配额与并行线程的时间预算</title><desc id="desc">一个线程使用50毫秒CPU时间，或两个线程各使用25毫秒，都耗尽100毫秒周期内的50毫秒总预算。这是教学算例，不是实际调度轨迹。</desc><style>text{font-family:"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif}</style><rect width="960" height="630" rx="12" fill="#f6f8fc"/>'+body+'</svg>'
out=Path(__file__).resolve().parents[1]/'dist/diagrams/cpu-quota-budget.svg'
out.write_text(svg)
ET.parse(out)
print('Generated CPU quota budget diagram with explicit idealization boundary.')
