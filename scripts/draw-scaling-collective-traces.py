"""Original editable vector diagrams: resource accounting, control delay, collectives and traces."""
from html import escape
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE / "dist/diagrams"
EVIDENCE = json.loads((BASE / "dist/labs/scaling-collectives-traces/validation.json").read_text())
BLUE, DARK, MUTED, LINE, GREEN, RED = "#315dce", "#17263e", "#56667d", "#ccd8e8", "#12725b", "#b53e3e"


def text(x, y, value, size=20, color=DARK, bold=False):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{700 if bold else 400}">{escape(str(value))}</text>'


def box(x, y, width, height, fill="#fff", stroke=LINE, radius=10):
    return f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>'


def path(points, color=BLUE, dashed=False, width=3):
    d = " ".join(("M" if i == 0 else "L") + str(x) + " " + str(y) for i, (x, y) in enumerate(points))
    return f'<path d="{d}" stroke="{color}" stroke-width="{width}" fill="none"' + (' stroke-dasharray="8 6"' if dashed else '') + '/>'


def arrow(x1, y1, x2, y2):
    return path([(x1,y1),(x2,y2)])[:-2] + ' marker-end="url(#arrow)"/>'


def save(name, title, subtitle, items, height=740):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img">'
           f'<title>{escape(title)}</title><desc>{escape(subtitle)}</desc>'
           '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto">'
           '<path d="M0 0L8 4L0 8" fill="#315dce"/></marker></defs>'
           '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">'
           + box(1,1,1118,height-2,"#f7f9fd",LINE,16)
           + text(36,49,title,28,DARK,True) + text(36,85,subtitle,18,MUTED)
           + "".join(items) + '</g></svg>\n')
    (ROOT / (name + ".svg")).write_text(svg)


items = [text(38,132,"同一把尺：每个像素宽度对应相同的CPU请求量",21,BLUE,True)]
for y, label, request, usage in [(173,"Pod A",100,90),(266,"Pod B",900,90),(359,"合计",1000,180)]:
    items += [text(38,y+31,label,22,DARK,True),box(197,y,request*.7,48,"#edf0f5"),
              box(197,y,usage*.7,48,BLUE,BLUE,5),
              text(197,y+77,f"用量{usage}m / request {request}m = {usage/request*100:.0f}%",20)]
items += [box(36,479,1048,141,"#edf2ff","#b4c6f0"),
          text(58,518,"按匹配request合并：180 / 1000 = 18%",26,BLUE,True),
          text(58,560,"先算各Pod百分比再平均：(90% + 10%) / 2 = 50%",23,RED,True),
          text(58,596,"request相同，两种算法可能刚好相同；分母不同就必须核对实际汇总口径。",19)]
items += [text(38,664,"资源利用率公式按Kubernetes v1.34.1实现核对；Prometheus固定输入也实际得到0.18与0.5。",18,MUTED),
          text(38,699,"图是题设账本，不是实时CPU采样；缺指标还要经过控制器保守计算，不能直接套此看板比值。",18,MUTED)]
save("v24-cpu-request-ratio","CPU利用率：先对齐分子和分母","本例m为千分之一核：两Pod都用90m，但request分别为100m与900m。",items)

items = [text(38,126,"容量（次/秒）",20,DARK,True)]
x=lambda t:90+t*6.4
yc=lambda n:310-n*.56
yq=lambda n:640-n*.045
items += [path([(90,136),(90,310),(1050,310)],LINE,width=2)]
for n in [120,180,240]:
    items += [text(43,yc(n)+6,n,16,MUTED)]
items += [path([(x(0),yc(180)),(x(150),yc(180))],RED,True),
          path([(x(0),yc(120)),(x(75),yc(120)),(x(75),yc(240)),(x(150),yc(240))],BLUE),
          text(121,198,"输入180/s",18,RED),text(614,154,"新容量240/s",20,BLUE,True),
          text(190,267,"旧容量120/s",19),text(570,295,"75秒：新容量到达",18,BLUE)]
items += [text(38,362,"积压（项）",20,DARK,True),path([(90,391),(90,640),(1050,640)],LINE,width=2)]
for n in [0,500,4500]:
    items += [text(33,yq(n)+6,n,16,MUTED)]
items += [path([(x(0),yq(0)),(x(75),yq(4500)),(x(150),yq(4500))],RED,True),
          path([(x(0),yq(0)),(x(75),yq(4500)),(x(150),yq(0))],BLUE),
          path([(x(0),yq(0)),(x(500/60),yq(500)),(x(75),yq(500)),(x(84),yq(0)),(x(150),yq(0))],GREEN),
          text(606,421,"若新容量仅180/s，4500项不再下降",18,RED),
          text(820,473,"新容量240/s",18,BLUE),
          text(820,503,"净余量60/s",18,BLUE),
          text(820,533,"第150秒排空",18,BLUE),
          text(184,600,"上限500：拒绝4000项，离散模型第84秒排空",18,GREEN)]
for t in [0,75,150]:
    items += [text(x(t)-9,668,t,17,MUTED)]
items += [text(1007,696,"秒",18,MUTED),
          text(38,710,"固定流体模型、每秒一步；非逐请求时延实测。限流改变了接纳量，须另核对业务目标。",18,MUTED)]
save("v24-scaling-queue","扩容晚到75秒，净余量再决定能否排空","新容量刚好追平输入，只能止住增长；排空旧积压还需要额外容量。",items)

items = [box(36,124,1048,87),text(58,159,"rank0输入 [1,2,3,4]     rank1输入 [10,20,30,40]",24,BLUE,True),
          text(58,191,"归约约定：逐元素求和；分片顺序：按rank排列。",19)]
items += [arrow(559,216,559,254),box(250,264,620,79,"#edf2ff"),
          text(275,297,"数学结果：[11,22 | 33,44]",25,BLUE,True),
          text(275,328,"这是一份数值表示，不代表先集中到rank0。",18,MUTED)]
items += [arrow(440,349,296,396),arrow(681,349,825,396)]
for x0,label,value in [(36,"ReduceScatter后 rank0","[11,22]"),(584,"ReduceScatter后 rank1","[33,44]")]:
    items += [box(x0,406,500,96,"#edf6f3"),text(x0+20,441,label,22,GREEN,True),text(x0+20,482,value,27)]
items += [arrow(286,508,286,553),arrow(834,508,834,553)]
for x0,label in [(36,"AllGather后 rank0"),(584,"AllGather后 rank1")]:
    items += [box(x0,563,500,91),text(x0+20,596,label,22,BLUE,True),text(x0+20,636,"[11,22,33,44]",26)]
items += [text(38,704,"本次CPU/Gloo实际验证这两步可重建AllReduce SUM的结果；不声称所有后端/版本支持相同变体。",18,MUTED)]
save("v24-reduce-scatter-gather","归约散片，再收齐：数值怎样回到每个rank","AllReduce交付全量和；ReduceScatter交付各自一片；AllGather只有收集，没有再求和。",items)

rows = EVIDENCE["programs"]["collective_contracts.py"]["result"]["modes"]["correct"]
a,b=[row["delayed_arrival"]["local_call_and_wait_ms"] for row in rows]
items = [text(38,130,"同一进程组 / 同一调用序号",21,BLUE,True)]
for y,left,right,outcome,fill in [
    (157,"ALLREDUCE / shape [2]","ALLREDUCE / shape [2]","约定一致","#edf6f3"),
    (242,"ALLREDUCE / shape [2]","ALLREDUCE / shape [3]","形状不一致","#fff1e6"),
    (327,"ALLREDUCE / shape [2]","BROADCAST / shape [2]","操作不一致","#f9ecec")]:
    items += [box(36,y,1048,67,fill),text(55,y+40,"rank0: "+left,18),
              text(466,y+40,"rank1: "+right,18),text(896,y+40,outcome,18,GREEN if outcome=="约定一致" else RED,True)]
items += [text(38,435,"后两行由DETAIL调试包装器在真正下发前拒绝；没有故意无限等待。",19)]
for x0,label,lines in [(36,"rank0",["没有注入睡眠",f"本次call + wait约{a:.3f}ms"]),(584,"rank1",["调用前故意睡80ms",f"本次call + wait约{b:.3f}ms"])]:
    items += [box(x0,476,500,129),text(x0+20,512,label,22,BLUE,True)]
    items += [text(x0+20,548+i*34,line,20) for i,line in enumerate(lines)]
items += [text(38,657,"一端先到，等待里含另一端迟到。数字是各rank本地持续时间，每次不同，不是独立网络耗时。",18,MUTED),
          text(38,697,"本图来自实际CPU/Gloo；调试包装器增加同步，不作NCCL、RDMA或跨机性能结论。",18,MUTED)]
save("v24-collective-signature-wait","集合操作：协议先一致，再解释等待","形状相同还不够；操作、成员、顺序、dtype等都应符合约定。",items)

items = [box(36,129,1048,77,"#edf2ff"),text(58,162,"agent.task / task R27",24,BLUE,True),
          text(58,192,"根跨度在产物验收后OK；首次尝试的ERROR仍保留。",20)]
items += [arrow(378,211,286,258),arrow(744,211,834,258)]
for x0,label,status in [(36,"tool.attempt 1 / CLIENT","HTTP 503 → 结果未知 / ERROR"),(584,"tool.attempt 2 / CLIENT","同op_id重试 → 收到原回执")]:
    items += [box(x0,269,500,101),text(x0+20,305,label,22,BLUE,True),text(x0+20,347,status,20)]
items += [arrow(286,375,286,415),arrow(834,375,834,415)]
for x0,label,meaning in [(36,"tool.execute / SERVER","先提交效果，再注入503"),(584,"tool.execute / SERVER","查原回执，duplicate=true")]:
    items += [box(x0,425,500,102,"#edf6f3"),text(x0+20,460,label,22,GREEN,True),text(x0+20,500,meaning,21)]
items += [box(36,574,1048,92),text(58,610,"W3C traceparent：同trace_id，不同attempt的span_id",23,BLUE,True),
          text(58,646,"5个真实span / 2次HTTP尝试 / 1笔SQLite效果 / 1个验收合格任务",22)]
items += [text(38,707,"树表示父子关联，不是耗时比例。traceparent只传关联，不能代替业务授权；未运行Collector或LLM。",18,MUTED)]
save("v24-otel-attempt-tree","任务成功，首次HTTP错误也不该被抹掉","实际OpenTelemetry SDK 1.44.0通过HTTP注入与提取父上下文，在内存中导出五个跨度。",items)

items=[box(36,128,500,367),box(564,128,520,367)]
items += [text(58,169,"实际计数，分母分别定义",24,BLUE,True)]
for y,name,value in [(222,"工具尝试",2),(285,"业务效果",1),(348,"合格任务",1)]:
    items += [text(58,y,name,23),text(427,y,value,31,BLUE,True)]
items += [text(58,411,"指标标签：tool / outcome / task_type",19),
          text(58,452,"任务与操作ID放受控trace或日志。",19,MUTED)]
items += [text(586,169,"教学成本账本，不是实际账单",23,BLUE,True)]
for y,label,value in [(223,"第一次尝试（503）",2),(286,"同操作重试（200）",2),(349,"产物验收",1)]:
    items += [text(586,y,label,21),text(1018,y,value,27,DARK,True)]
items += [path([(586,378),(1058,378)],LINE,width=2),text(586,425,"总成本 / 唯一合格任务 = 5 / 1",22,BLUE,True),
          text(586,464,"只取成功HTTP的2点，会丢掉其他开销。",18,RED)]
items += [box(36,544,1048,121,"#edf2ff"),text(58,585,"Trace解释路径；指标看总体；账本确认业务结果。",25,BLUE,True),
          text(58,626,"采样轨迹缺一条，不等于那次任务或费用没有发生。高基数ID不作为无限扩张的指标标签。",19)]
items += [text(38,709,"计数由本地SDK实际导出；成本单价由固定夹具定义，未调用计费API、模型或云服务。",18,MUTED)]
save("v24-observability-ledgers","一项任务，尝试、效果和成本三份账","把重试归到原操作，再按唯一合格任务核算；保留失败和后台开销。",items)
print("PASS: 6 original resource, queue, collective and trace SVG diagrams generated from fixed facts and actual record.")

