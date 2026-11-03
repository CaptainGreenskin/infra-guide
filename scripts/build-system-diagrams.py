"""Generate seven original, self-contained system teaching diagrams.

Only the named SVG files in dist/diagrams are written. Coordinates describe
logical relationships, not measured timing, throughput, or resource usage.
"""
from pathlib import Path
from html import escape
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/diagrams'
BLUE = '#315dce'
INK = '#203553'
MUTED = '#61748e'
LINE = '#d7e1ef'
SOFT = '#edf2fe'
BG = '#f6f8fc'


def text(x, y, value, size=16, color=INK, anchor='start', weight=400):
    return (f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" '
            f'text-anchor="{anchor}" font-weight="{weight}">{escape(value)}</text>')


def rect(x, y, w, h, fill='#fff', stroke=LINE, dashed=False):
    dash = ' stroke-dasharray="6 5"' if dashed else ''
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="1.5"{dash}/>')


def node(x, y, w, h, title, lines=(), accent=False):
    result = rect(x, y, w, h, SOFT if accent else '#fff', '#7e9ee5' if accent else LINE)
    result += text(x+w/2, y+31, title, 18 if w >= 165 else 16, anchor='middle', weight=600)
    for i, line in enumerate(lines):
        result += text(x+w/2, y+59+i*23, line, 14, MUTED, 'middle')
    return result


def arrow(x1, y1, x2, y2, dashed=False, color=BLUE):
    dash = ' stroke-dasharray="6 5"' if dashed else ''
    return (f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{color}" '
            f'stroke-width="2" marker-end="url(#arrow)"{dash}/>')


def elbow(points, dashed=False):
    d = 'M' + ' L'.join(f'{x} {y}' for x, y in points)
    dash = ' stroke-dasharray="6 5"' if dashed else ''
    return f'<path d="{d}" fill="none" stroke="{BLUE}" stroke-width="2" marker-end="url(#arrow)"{dash}/>'


def note(x, y, w, title, lines=(), height=100):
    result = rect(x, y, w, height, SOFT, '#b6c9ef')
    result += text(x+18, y+29, title, 16, BLUE, weight=600)
    for i, line in enumerate(lines):
        result += text(x+18, y+55+i*23, line, 14, MUTED)
    return result


def save(name, title, description, body, height, subtitle):
    title_id, desc_id = f'{name}-title', f'{name}-desc'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 {height}" role="img" aria-labelledby="{title_id} {desc_id}">
<title id="{title_id}">{escape(title)}</title>
<desc id="{desc_id}">{escape(description)}</desc>
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M1 1L7 4L1 7" fill="none" stroke="{BLUE}" stroke-width="1.3"/></marker></defs>
<style>text{{font-family:'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif}}</style>
<rect width="960" height="{height}" rx="14" fill="{BG}"/>
{text(30,30,'INFRAGUIDE / SYSTEMS FIELD NOTES',11,BLUE,weight=600)}
{text(30,69,title,25,weight=700)}
{text(30,101,subtitle,14,MUTED)}
{body}
{text(30,height-22,'原创教学示意 · 非真实压测 · 图中阶段与尺寸不表示耗时比例',13,MUTED)}
</svg>'''
    OUT.mkdir(parents=True, exist_ok=True)
    destination = OUT / f'{name}.svg'
    destination.write_text(svg, encoding='utf-8')
    ET.parse(destination)
    return destination


files = []

# DNS resolves an address; it is deliberately separate from the HTTP data path.
body = text(35,139,'① 名称解析',15,BLUE,weight=600)
body += node(35,155,235,84,'客户端查询 DNS',['获得入口地址，不转发 HTTP'])
body += arrow(270,197,330,197)
body += node(330,155,235,84,'返回地址 / 缓存',['解析结果、TTL 与来源可观测'])
body += text(600,185,'解析完成后，建立实际连接。',15,MUTED)
body += text(600,212,'DNS 成功不代表服务可达。',15,MUTED)
body += text(35,278,'② 请求与数据路径',15,BLUE,weight=600)
stages = [(35,160,'客户端',['发起连接 / 请求']),
          (275,170,'入口 / 网关',['TLS / 用户身份']),
          (525,170,'业务服务',['业务权限 / 请求处理']),
          (775,150,'持久化存储',['服务身份 / 数据授权'])]
for x,w,title,lines in stages:
    body += node(x,295,w,88,title,lines,x==525)
for x1,x2 in [(195,275),(445,525),(695,775)]:
    body += arrow(x1,339,x2,339)
body += note(35,424,890,'身份校验分层，观测贯穿每一跳',[
    '入口认证与数据授权是不同边界；网络连通不能替代权限检查。',
    '关联请求 ID / trace ID，记录时间、状态和依赖；不要把凭据写进日志。'],122)
for x in (360,610,850):
    body += arrow(x,383,x,424,True)
files.append(save('cloud-request','一条请求：解析、连接、授权与观测',
                  'DNS 是独立的地址解析步骤。随后客户端访问入口、业务服务和持久化存储，入口身份和数据授权边界分别校验，观测信息覆盖各跳。',
                  body,600,'先区分名称解析与业务流量，再逐跳检查路径、权限和结果。'))

# Resource quantities are parallel concepts, not interchangeable sequential stages.
body = text(35,147,'同一工作负载，三种不同的量',17,BLUE,weight=600)
body += node(35,174,270,260,'调度前：requests',[
    '教学配置：CPU 500m / 内存 256Mi',
    '调度器据此评估节点可容纳性',
    'CPU 争用时还影响相对份额',
    '',
    '它不是当前实际用量',
    '也不是一组专属 CPU 核'],True)
body += node(345,174,270,260,'运行时：limits',[
    '教学配置：CPU 1 / 内存 512Mi',
    'CPU：限制可消费的 CPU 时间',
    '内存：超限可能触发 OOM',
    '',
    'CPU 节流与内存 OOM',
    '是不同的执行机制'])
body += node(655,174,270,260,'观测：实际用量',[
    '示例读数：CPU 80m / 内存 180Mi',
    '由指标、采样窗口和范围决定',
    '保留容器 / 节点等维度',
    '',
    '低用量不抹去已有调度请求',
    '单个瞬时值不能代表容量需求'])
body += note(35,469,890,'三个量分别回答：能放在哪里？运行受什么约束？现在消耗多少？',[
    '数字仅用于解释关系；默认值、准入策略、运行时和资源类型会影响具体行为。'],90)
files.append(save('resource-control','资源控制：调度请求、运行限制与实际用量',
                  '三个并列框区分 requests、limits 和观测用量。CPU 配额不是绑核，CPU 节流与内存 OOM 不相同，所有数字为教学示例。',
                  body,610,'requests / limits / usage 分别解释，不能用其中一个代替另外两个。'))

# Publishing requires a complete artifact; failed drafts never become current.
body = text(35,144,'成功提交路径',15,BLUE,weight=600)
steps = [(35,'草稿版本',['写文件 / 分片','记录版本标识']),
         (265,'完整性验证',['校验清单与摘要','确认所需产物齐全']),
         (495,'发布指针',['只指向已完成版本','按存储语义提交']),
         (725,'恢复与读取',['先读已发布版本','再按清单加载 / 校验'])]
for x,title,lines in steps:
    body += node(x,163,190,112,title,lines,x==495)
for x in (225,455,685):
    body += arrow(x,219,x+40,219)
body += arrow(360,275,360,330,True)
body += note(245,330,265,'写入中断 / 验证失败',[
    '保留草稿，不更新发布指针',
    '读者继续使用上次完整版本'],112)
body += arrow(590,275,590,330)
body += note(545,330,370,'发布是可见性的边界',[
    '半成品不进入“当前可读版本”',
    '恢复还要验证格式、版本与加载结果'],112)
body += text(35,492,'本地文件原子替换、对象存储单 key 更新和多对象提交，必须分别设计。',15)
body += text(35,520,'“保存完成”与“成功恢复”是两个独立的验收点。',16,BLUE,weight=600)
files.append(save('artifact-commit','产物提交：让半成品保持不可见',
                  '草稿先通过清单和摘要校验，再发布指向完整版本的指针。中断或验证失败不会更新指针；读者按已发布版本恢复，并再次核对加载结果。',
                  body,580,'将文件存在、版本完整、对读者可见和可恢复四个状态分开。'))

# API objects coordinate components; probes have deliberately separate outcomes.
body = node(35,137,230,85,'声明期望状态',['Deployment / Job 等资源'])
body += arrow(265,179,365,179)
body += node(365,137,250,85,'API Server / 资源对象',['期望、实际状态与协调结果'],True)
body += text(655,166,'持续读取状态、执行协调，',15,MUTED)
body += text(655,192,'再写回结果并进入下一轮。',15,MUTED)
body += node(35,291,270,110,'控制器',['比较期望与实际状态','创建 / 调整受管资源'])
body += node(345,291,270,110,'调度器',['为尚未绑定的 Pod','选择满足条件的节点'])
body += node(655,291,270,110,'节点 / kubelet',['通过运行时执行容器','上报状态并执行探针'],True)
body += arrow(400,222,210,291)
body += arrow(255,291,440,222,True)
body += arrow(490,222,490,291)
body += arrow(580,222,790,291)
body += note(35,452,355,'startup 保护启动阶段',[
    'startup 成功前不执行',
    'readiness 与 liveness'],111)
body += node(440,452,235,111,'readiness',['是否属于常规服务可用后端','失败：NotReady，不因此重启'])
body += node(705,452,220,111,'liveness',['是否需要重启容器','失败：按重启策略处理'])
body += elbow([(790,401),(790,425),(557,425),(557,452)])
body += elbow([(790,425),(815,425),(815,452)])
body += text(35,603,'箭头表达信息依赖；组件通过 API 对象协作，并非依次直接调用。',14,MUTED)
files.append(save('k8s-reconcile','Kubernetes：持续协调与健康判断',
                  '声明进入 API Server。控制器、调度器与节点围绕 API 资源对象协作。startup 控制启动阶段，readiness 决定可用后端资格，liveness 失败按策略触发重启。',
                  body,655,'声明已被接受、Pod 已启动和应用能够服务，是三个不同结论。'))

# Exact event arithmetic, including the absence of observations.
body = text(35,143,'以请求成功率为例',15,BLUE,weight=600)
for x,title,lines,accent in [
    (35,'有效事件',['先定范围与时间窗口','按约定排除无效事件'],False),
    (265,'good / total',['汇总计数后再相除','不能平均实例成功率'],True),
    (495,'SLO 与错误预算',['允许失败 = N × (1 − SLO)','保留已用与剩余预算'],True),
    (725,'行动与复查',['结合燃烧率与用户影响','告警 / 变更 / 改进'],False)]:
    body += node(x,164,190,112,title,lines,accent)
for x in (225,455,685):
    body += arrow(x,219,x+40,219)
body += arrow(360,276,360,322,True)
body += note(245,322,325,'total = 0 → 无数据',[
    '不做除法，也不擅自填成 100%',
    '结合流量、探测与采集状态判断'],112)
body += note(35,470,890,'教学算例：N = 1,000，成功 = 998，SLO = 99.9%',[
    '允许失败 1 次；实际失败 2 次；预算已用 200%，剩余 −1 次。',
    '请求型预算不能直接换算成固定停机分钟数。'],112)
files.append(save('slo-budget','SLO：从有效事件到可执行的可靠性决策',
                  '先确定事件范围与窗口，汇总成功和总数，再根据 SLO 算错误预算并选择行动。零事件表示无数据。例子中的1000次请求、998次成功为教学输入，并非实测。',
                  body,630,'指标口径、预算与处置动作必须连在一起；没有请求不等于服务已被验证。'))

# Six lifecycle milestones, each with independent evidence.
stages = [
    ('01 提交','Submitted',['接受请求','返回任务标识']),
    ('02 准入','Admitted',['配额 / 队列','获准进入执行']),
    ('03 调度','Scheduled',['匹配资源','完成节点分配']),
    ('04 启动','Started',['进程 / 设备','通信与依赖就绪']),
    ('05 进展','Progressing',['有效样本 / step','结果持续更新']),
    ('06 结束','Terminal',['记录结果','释放资源'])]
for i,(title,state,lines) in enumerate(stages):
    x=30+i*155
    body_part=node(x,163,130,148,title,[state]+lines,i==4)
    if i==0:
        body=body_part
    else:
        body+=body_part
    if i<5:
        body+=arrow(x+130,237,x+155,237)
body += note(30,354,285,'管理状态',[
    '提交成功不表示已得到资源',
    '准入不等于最终调度成功'],108)
body += note(337,354,285,'运行状态',[
    'Pod Running 不证明训练有效',
    '启动与有效进展分别观测'],108)
body += note(645,354,285,'业务结果',[
    '终态包括成功 / 失败 / 取消',
    '产物、原因和清理均需记录'],108)
body += text(30,508,'主图是成功路径；中间任一阶段也可能失败或取消，必须进入明确终态。',15)
body += text(30,538,'同一个任务标识关联准入、节点、rank、日志、指标与产物。',15,BLUE,weight=600)
files.append(save('platform-lifecycle','平台生命周期：六个阶段，六类验收证据',
                  '任务依次经过提交、准入、调度、启动、有效进展和结束。每一阶段具有独立证据，失败和取消也需要终态记录与清理。阶段不代表统一平台的固定状态枚举。',
                  body,590,'这些名称是分析模型，不是任何特定平台的 API 状态枚举。'))

# First-token is an observation boundary; KV cleanup is not unconditional free().
body = text(35,142,'请求到达',15,BLUE,weight=600)
body += node(35,173,180,100,'排队',['等待准入 / 执行资源'])
body += node(270,173,180,100,'Prefill',['处理输入上下文','建立相关 KV 状态'],True)
body += node(505,173,220,100,'Decode',['逐步生成后续 token','调度策略影响等待'],True)
body += node(775,173,150,100,'响应结束',['完成 / 取消 / 失败'])
for x1,x2 in [(215,270),(450,505),(725,775)]:
    body+=arrow(x1,223,x2,223)
body+=text(477,140,'首 token 输出观测点',14,BLUE,'middle',600)
body+='<path d="M477 149L477 265" fill="none" stroke="#315dce" stroke-width="1.5" stroke-dasharray="4 4"/>'
body+=note(270,329,455,'KV 状态与请求生命周期',[
    '按实现建立、复用和增长；容量与模型、序列有关',
    '请求结束后释放其占用，前缀缓存可按策略保留'],112)
body+=arrow(360,273,360,329,True)
body+=arrow(615,273,615,329,True)
body+=node(775,329,150,112,'清理请求状态',['归还可用额度','缓存按策略保留'])
body+=arrow(850,273,850,329)
body+=arrow(725,385,775,385,True)
body+=text(35,493,'TTFT = 首 token 输出时间 − 请求到达时间',17,BLUE,weight=600)
body+=text(35,525,'完成耗时 = 响应结束时间 − 请求到达时间；同时记录输入 / 输出 token 数。',15)
body+=text(35,558,'首 token 的内部生成步骤依实现而异；图中阶段宽度不表示延迟占比。',14,MUTED)
files.append(save('inference-lifecycle','一次推理：等待、计算、输出与状态释放',
                  '请求先排队并完成输入 prefill，首 token 输出作为外部观测边界，随后 decode 后续 token，最终结束响应并清理请求占用。KV 前缀缓存可能按策略继续保留。',
                  body,610,'从用户可观测时间定义延迟，再解释调度与 KV 状态如何影响它。'))

assert len(files) == 7
for path in files:
    root=ET.parse(path).getroot()
    assert root.attrib['viewBox'].split()[2] == '960'
    assert root.find('{http://www.w3.org/2000/svg}title') is not None
    assert root.find('{http://www.w3.org/2000/svg}desc') is not None
    assert 'http://' not in path.read_text().replace('http://www.w3.org/2000/svg','')
print('Generated and XML-validated 7 self-contained system diagrams.')
for path in files:
    print(path.relative_to(ROOT))
