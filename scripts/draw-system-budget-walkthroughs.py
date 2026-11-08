"""Original diagrams for capacity, linear-layer bytes, trace identities and dependencies."""
from html import escape
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'dist/diagrams'
BLUE, INK, MUTED, LINE = '#315dce', '#17263e', '#56667d', '#cdd9e9'
GREEN, AMBER = '#12725b', '#936013'


def text(x, y, value, size=21, color=INK, weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(str(value))}</text>'


def box(x, y, w, h, fill='#fff'):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{LINE}"/>'


def line(x1, y1, x2, y2, color=LINE, dash=''):
    return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{color}" stroke-width="2"'+(f' stroke-dasharray="{dash}"' if dash else '')+'/>'


def arrow(x1, y1, x2, y2):
    return f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{BLUE}" stroke-width="2.5" fill="none" marker-end="url(#arrow)"/>'


def save(name, title, desc, height, items, metadata):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img" aria-labelledby="title desc">'
           f'<title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc><metadata>{escape(json.dumps(metadata,ensure_ascii=False))}</metadata>'
           '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#315dce"/></marker></defs>'
           '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">'
           + box(1, 1, 1118, height-2, '#f7f9fd') + text(36, 48, title, 28, INK, 700)
           + text(36, 85, desc, 18, MUTED) + ''.join(items) + '</g></svg>\n')
    (ROOT/(name+'.svg')).write_text(svg)


items = [text(38, 132, '未完成工作量 / 请求', 20, BLUE, 700)]
left, right, bottom, peak_y = 110, 1040, 450, 190
peak_x = left+(right-left)*120/480
items += [line(left, 160, left, bottom, MUTED), line(left, bottom, right, bottom, MUTED),
          line(left, peak_y, right, peak_y, LINE, '5 5'), line(peak_x, 160, peak_x, bottom, GREEN, '6 5'),
          f'<path d="M{left} {bottom}L{peak_x} {peak_y}L{right} {bottom}Z" fill="#dbe6ff"/>',
          f'<path d="M{left} {bottom}L{peak_x} {peak_y}L{right} {bottom}" fill="none" stroke="{BLUE}" stroke-width="4"/>',
          text(38, peak_y+7, '7200', 22), text(73, bottom+7, '0', 20),
          text(left-3, 485, '0s', 20), text(peak_x-25, 485, '120s', 20, GREEN, 700), text(right-35, 485, '480s', 20),
          text(peak_x+18, 171, '新增能力统一在此时有效', 20, GREEN, 700),
          text(400, 345, '净余量决定排空速度', 24, BLUE, 700),
          text(400, 385, '200 − 180 = 20/s', 22),
          text(400, 425, '7200 ÷ 20 = 360秒', 22),
          box(36, 523, 500, 115), box(564, 523, 520, 115, '#edf6f3'),
          text(58, 561, '0—120秒：积压增长', 23, BLUE, 700), text(58, 601, '(180 − 120) × 120 = 7200', 22),
          text(586, 561, '120—480秒：积压下降', 23, GREEN, 700), text(586, 601, '输入180/s，旧积压另用20/s排空', 21),
          text(38, 685, '排空以后，若仍只有180/s输入，实际完成不能按200/s能力继续虚增。', 20, MUTED),
          text(38, 721, '固定流体模型，无拒绝、无过期、工作等价；不代表实际伸缩耗时或逐请求p99。', 18, MUTED)]
save('v52-capacity-backlog','新增副本可用，不等于原有积压已清空','同一组输入180/s、原能力120/s、新能力200/s，分两段计算。',756,items,
     {'kind':'piecewise_backlog','arrival_per_second':180,'old_capacity':120,'new_capacity':200,'capacity_arrives_at':120,'points':[[0,0],[120,7200],[480,0]],'real_autoscaler':False})

items = [text(38, 132, 'K=N=4096，BF16每元素2字节；同一横轴，条形长度按MiB比较。', 21)]
scale=820/36
for y,m,xbytes,ybytes in [(188,1,8192,8192),(360,256,2097152,2097152)]:
    wbytes=33554432
    items += [text(38,y+35,f'M={m}',25,BLUE,700)]
    cursor=224
    for size,color in [(wbytes,'#315dce'),(xbytes,'#79b9a4'),(ybytes,'#d8b16d')]:
        width=size/(2**20)*scale
        items += [f'<rect x="{cursor}" y="{y}" width="{width}" height="48" fill="{color}"/>']
        cursor+=width
    items += [text(224,y+88,f'权重 {wbytes} B  +  输入 {xbytes} B  +  输出 {ybytes} B',20),
              text(224,y+122,'合计 '+str(wbytes+xbytes+ybytes)+' B',22,INK,700)]
items += [text(38, 544, '蓝：权重      绿：输入      金：输出', 20),
          text(38, 582, 'M=1的输入与输出很细，按数字核对；图中没有将它们单独放大。', 19, MUTED),
          box(36, 617, 1048, 120, '#edf2ff'), text(58, 656, '输入行数扩大256倍，权重仍只读一份', 24, BLUE, 700),
          text(58, 699, '计算量增256倍；算法字节量约增12.4%。M是词元行，不是用户请求数。', 21),
          text(38, 781, '只读X、读W、写Y；不读旧输出、不含额外转换。这是算法账本，不是硬件流量测量。', 18, MUTED)]
save('v52-roofline-byte-ledger','同一份权重，为什么能服务更多输入行','先把三笔读写列全，再算浮点工作与字节的比例。',816,items,
     {'kind':'byte_composition','weights_bytes':33554432,'cases':[{'M':1,'input':8192,'output':8192,'total':33570816},{'M':256,'input':2097152,'output':2097152,'total':37748736}],'unit':'MiB=2^20B','gpu_measurement':False})

items = [box(335, 124, 450, 116, '#edf2ff'), text(357, 162, '根跨度 s0：agent.task / OK', 24, BLUE, 700),
         text(357, 202, 'task_id=R27；所有节点共用trace=T',20),
         arrow(420,245,285,309),arrow(700,245,835,309)]
for x,client,server,parent,status,http,event,dup in [(36,'c1','s1','c1','ERROR',503,'effect_committed','false'),(580,'c2','s2','c2','UNSET',200,'receipt_reused','true')]:
    items += [box(x,315,504,115),text(x+20,353,f'CLIENT {client} / {status}',24,BLUE,700),
              text(x+20,392,'执行器；parent_id=s0',21),arrow(x+252,435,x+252,485),
              box(x,491,504,164,'#fff6e8' if http==503 else '#edf6f3'),
              text(x+20,529,f'SERVER {server} / {status}',24,AMBER if http==503 else GREEN,700),
              text(x+20,566,f'工具；parent_id={parent}，remote=true',20),
              text(x+20,603,f'HTTP {http}；duplicate={dup}',21),text(x+20,636,event,19)]
items += [box(36,700,1048,100),text(58,739,'两次请求：同一个op_id=R27:publish；实际效果总数37，只写一行',23,INK,700),
          text(58,777,'5个span ≠ 5次尝试。这里是2次HTTP尝试、1笔效果、1个合格任务。',21),
          text(38,844,'占位身份用于读关系，不是有效W3C头值；树无耗时比例。本机SDK/HTTP/SQLite，无远端采集器。',17,MUTED)]
save('v52-agent-five-spans','同一逻辑操作，两次尝试，五条观测跨度','第一次提交后返回503，第二次找回原回执；中途错误与最终成功同时保留。',880,items,
     {'kind':'span_parent_tree','names_are_placeholders':True,'nodes':['s0','c1','s1','c2','s2'],'edges':[['s0','c1'],['c1','s1'],['s0','c2'],['c2','s2']],'attempts':2,'effects':1,'total':37,'root_status':'OK','first_pair_status':'ERROR','second_pair_status':'UNSET','collector_execution':False})

items=[]
x0,x1=170,1060
tx=lambda t:x0+(x1-x0)*t/1000
rows=[('根任务',0,1000,146,'#dbe6ff'),('身份',0,50,222,'#cad5eb'),('查询A',50,350,298,'#9ccab9'),('查询B',50,450,374,'#5a9b83'),('汇合后续',450,1000,450,'#d8b16d')]
for name,start,end,y,color in rows:
    items += [text(38,y+31,name,21),f'<rect x="{tx(start)}" y="{y}" width="{tx(end)-tx(start)}" height="44" rx="5" fill="{color}"/>']
    if end-start>100: items += [text(tx(start)+14,y+30,f'{start}—{end}ms',20)]
for t in [0,50,350,450,1000]:
    items += [line(tx(t),130,tx(t),512,LINE,'4 5'),text(tx(t)-12,543+(24 if t==50 else 0),str(t),18,MUTED)]
items += [text(1005,581,'毫秒',18,MUTED),box(36,608,1048,112,'#edf2ff'),
          text(58,646,'50 + max(300,400) + 30 + 300 + 70 + 30 + 60 + 60 = 1000ms',22,BLUE,700),
          text(58,688,'逐段相加会得到1300ms，重复计算两条查询重叠的300ms。',21),
          text(38,763,'只缩短查询A：仍等B；B从400ms减到300ms：本题后续才能提前100ms。',20),
          text(38,804,'后续550ms为装配、模型、首次发布、等待、重试和验收。独立教学输入，不是HTTP实测。',18,MUTED)]
save('v52-agent-critical-path','读父子关系之后，还要读时间重叠与等待','下一阶段要等A和B都完成；先找汇合点，再算用户总等待。',840,items,
     {'kind':'parallel_timeline','measured':False,'intervals':[[0,50],[50,350],[50,450],[450,480],[480,780],[780,850],[850,880],[880,940],[940,1000]],'elapsed_ms':1000,'sum_child_ms':1300,'parallel_overlap_ms':300})
print('PASS: 4 original system-budget diagrams generated.')
