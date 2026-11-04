"""Original diagrams; only the response-body chart uses observed local counts."""
from html import escape
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/"dist/diagrams"
BLUE, GREEN, TEXT, MUTED, LINE, SOFT = "#315dce", "#287b69", "#1c283d", "#6b768b", "#e4e9f0", "#f2f5fa"


class SVG:
    def __init__(self, width, height, title, description):
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
          f'<title id="title">{escape(title)}</title><desc id="desc">{escape(description)}</desc>',
          '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9" fill="#6b768b"/></marker></defs>',
          '<style>text{font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif}</style>',
          f'<rect width="{width}" height="{height}" fill="white"/>']

    def text(self, x, y, value, size=24, color=TEXT, weight=400, anchor="start"):
        self.parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(value))}</text>')

    def box(self, x, y, w, h, fill=SOFT, stroke=LINE):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')

    def arrow(self, x1, y1, x2, y2, dash=False):
        self.parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{MUTED}" stroke-width="2.5" marker-end="url(#arrow)"'+(' stroke-dasharray="7 6"' if dash else '')+'/>')

    def save(self, name, metadata=None):
        if metadata:
            self.parts.append('<metadata>'+escape(json.dumps(metadata, ensure_ascii=False))+'</metadata>')
        (OUT/(name+'.svg')).write_text('\n'.join(self.parts+['</svg>']), encoding='utf-8')


def interfaces():
    s = SVG(1120, 650, '对象、文件、块：接口把哪些责任交给应用', '三列责任示意；不是性能排序。具体一致性、锁和共享以产品协议为准。')
    s.text(32, 46, '对象、文件、块：先分责任，再选产品', 32, weight=650)
    s.text(32, 84, '同一批训练输入，可以组合权威对象、节点缓存与共享工程文件。', 22, MUTED)
    columns = [
      ('对象接口', ['应用：键、版本与清单', '自己定位样本与切片'], ['HTTP GET / Range', '取完整对象或范围'], ['服务：对象命名与字节', '应用：跨对象发布', '清单、版本与校验']),
      ('文件接口', ['应用：路径与文件操作', '读、写、目录与锁'], ['文件系统客户端', '例如共享 NFS 协议'], ['服务：目录与文件', '共享、锁和缓存行为', '逐项核对目标协议']),
      ('块接口', ['应用 / 文件系统 / 数据库', '自己安排数据布局'], ['块设备读写', '应用负责上层文件语义'], ['服务：可寻址块设备', '上层协调文件系统', '挂载与多写者'])]
    for i, (name, upper, middle, lower) in enumerate(columns):
        x = 32+i*363
        s.box(x, 124, 330, 445, 'white')
        s.text(x+18, 163, name, 27, BLUE, 650)
        s.box(x+17, 186, 296, 94)
        for j, line in enumerate(upper): s.text(x+30, 222+j*32, line, 22)
        s.arrow(x+165, 286, x+165, 310)
        s.box(x+17, 320, 296, 84, '#edf2fe')
        for j, line in enumerate(middle): s.text(x+30, 354+j*30, line, 22, BLUE)
        s.arrow(x+165, 410, x+165, 434)
        for j, line in enumerate(lower): s.text(x+29, 468+j*31, line, 22)
    s.text(32, 610, '接口责任示意；一致性、性能、故障域与恢复方式须核对具体产品。', 22, MUTED)
    s.save('v32-storage-interfaces', {'kind':'responsibility_diagram','performance_order':False})


def tp_chain():
    s = SVG(1120, 940, '两进程张量并行：前向部分和与反向输入梯度', '对应长度2输入的小算例。输出先求和再加一次偏置；输入梯度也要合并两份贡献。')
    s.text(32, 44, '同一条输入，两份特征：前向和反向都要算全', 32, weight=650)
    s.text(32, 83, '形状：X [1,2]、W [2,4]、U [4,2]；输入数值见蓝框。', 23, MUTED)
    s.box(363, 112, 394, 57, '#edf2fe', BLUE)
    s.text(560, 150, '共同输入 X = [1,2]', 26, BLUE, 600, 'middle')
    s.arrow(460, 175, 285, 211); s.arrow(660, 175, 835, 211)
    for x, rank, h, z in [(32,0,'[1,2]','[1,2]'),(582,1,'[2,4]','[10,2]')]:
        s.box(x, 222, 506, 203, 'white')
        s.text(x+24, 263, 'rank '+str(rank)+'：W 的两列、U 的两行', 25, BLUE, 600)
        s.text(x+24, 307, 'W'+str(rank)+' [2,2] → ReLU → H'+str(rank)+' = '+h, 23)
        s.text(x+24, 350, 'H'+str(rank)+' × U'+str(rank)+' [2,2]', 24)
        s.text(x+24, 394, '局部输出 Z'+str(rank)+' = '+z, 26, weight=600)
    s.arrow(285, 432, 445, 467); s.arrow(835, 432, 675, 467)
    s.box(362, 477, 396, 60, '#edf2fe', BLUE)
    s.text(560, 517, 'SUM：Z0 + Z1 = [11,4]', 25, BLUE, 600, 'middle')
    s.arrow(560, 543, 560, 572)
    s.box(362, 582, 396, 59, '#edf2fe', BLUE)
    s.text(560, 621, '只加一次 b → Y = [12,5]', 25, BLUE, 600, 'middle')
    s.text(785, 602, '若各加一次再求和', 22, MUTED)
    s.text(785, 633, '错误得到 [13,6]', 24, '#a84444', 600)
    s.text(32, 690, '目标 [3,−1]；平方误差的一半 → dY = [9,6]，传给两条局部路径。', 23)
    for x, rank, dx in [(32,0,'[9,6]'),(582,1,'[30,36]')]:
        s.box(x, 720, 506, 69, '#edf7f3', GREEN)
        s.text(x+24, 764, 'rank '+str(rank)+' 的输入梯度贡献 = '+dx, 25, GREEN, 600)
    s.arrow(285, 796, 445, 830); s.arrow(835, 796, 675, 830)
    s.box(362, 840, 396, 59, '#edf7f3', GREEN)
    s.text(560, 879, 'SUM → dX = [39,42]', 26, GREEN, 600, 'middle')
    s.text(32, 927, '本例显式传递 dY；普通集合操作位于自动求导图之外。', 21, MUTED)
    s.save('v32-tp-chain-rule', {'kind':'observed_cpu_gloo_and_hand_math','world_size':2,'y':[12,5],'dx':[39,42],'wrong_bias':[13,6]})


def pp_schedule():
    s = SVG(1120, 410, '等时两阶段四微批的前向流水线', '五个时间槽、十个阶段槽，其中八个工作，两个填充或排空。不是完整训练调度。')
    s.text(32, 45, '前向流水线：4 个微批，为什么要 5 个时间槽', 31, weight=650)
    s.text(32, 84, '只画等时前向，不含反向、通信、阶段不均或实际 GPU 测量。', 22, MUTED)
    p, m = 2, 4
    for slot in range(m+p-1):
        s.text(286+slot*164, 128, '槽 '+str(slot), 23, MUTED, anchor='middle')
    for stage in range(p):
        s.text(32, 182+stage*78, '阶段 '+str(stage), 26, weight=600)
        for slot in range(m+p-1):
            batch = slot-stage
            active = 0 <= batch < m
            s.box(210+slot*164, 145+stage*78, 152, 59, '#edf2fe' if active else SOFT, BLUE if active else LINE)
            s.text(286+slot*164, 184+stage*78, '微批 '+str(batch) if active else '空', 24, BLUE if active else MUTED, anchor='middle')
    s.text(32, 340, '8 个工作阶段槽 ÷ 10 个总阶段槽 = 80% = m / (m+p−1)', 26, BLUE, 600)
    s.text(32, 382, '增加微批可摊薄填充/排空；不能据此直接承诺训练利用率。', 22, MUTED)
    s.save('v32-pp-forward-slots', {'kind':'declared_equal_time_forward_model','p':p,'m':m,'slots':5,'occupied':8,'capacity':10})


def acceptance_sequence():
    s = SVG(1120, 690, '重复提交与断线重连的两条验收时序', '题设时序，不是Kairo运行记录；断线不取消是本题约定，真实版本必须声明契约。')
    s.text(32, 46, '两次传输不等于两项任务；断线也不等于已取消', 31, weight=650)
    s.text(32, 86, '题设时序，并非 Kairo 运行记录；本题明确约定“断线不取消”。', 22, MUTED)
    s.box(32, 118, 516, 501, 'white'); s.box(572, 118, 516, 501, 'white')
    s.text(55, 158, 'A：重复提交，仍沿同一请求找任务', 25, BLUE, 600)
    s.text(595, 158, 'B：重连后查询原任务', 25, BLUE, 600)
    for x, label in [(104,'客户端'),(462,'运行时'),(640,'客户端'),(818,'运行时'),(1015,'工具')]:
        s.text(x, 205, label, 22, anchor='middle')
        s.parts.append(f'<line x1="{x}" y1="219" x2="{x}" y2="571" stroke="{LINE}" stroke-width="2" stroke-dasharray="5 5"/>')
    s.arrow(110, 262, 452, 262); s.text(123, 249, '0秒：R1 + 参数摘要', 22)
    s.box(351, 278, 172, 41, '#edf2fe'); s.text(437, 306, '持久化 T1', 22, BLUE, anchor='middle')
    s.parts.append(f'<line x1="452" y1="359" x2="255" y2="359" stroke="{MUTED}" stroke-width="2.5" stroke-dasharray="7 6"/>')
    s.parts.append('<path d="M247 351 L263 367 M247 367 L263 351" stroke="#a84444" stroke-width="3"/>')
    s.text(287, 345, '受理响应丢失', 22, '#a84444')
    s.arrow(110, 421, 452, 421); s.text(123, 407, '1秒：同 R1、同摘要', 22)
    s.arrow(452, 497, 114, 497); s.text(144, 482, '2秒：返回同一 T1', 22)
    s.text(59, 590, '两次请求传输，一项逻辑任务', 23, GREEN, 600)
    s.arrow(825, 262, 1004, 262); s.text(837, 248, '3秒：读 A', 22)
    s.text(599, 326, '4秒：客户端断线', 22, '#a84444')
    s.arrow(1005, 382, 830, 382); s.text(841, 368, '6秒：工具回执', 22)
    s.arrow(647, 462, 807, 462); s.text(650, 447, '8秒：查询 T1', 22)
    s.arrow(807, 532, 648, 532); s.text(661, 518, '原状态与结果', 22)
    s.text(595, 590, '交付原任务，不新建第二项', 23, GREEN, 600)
    s.text(32, 657, '另核对：允许的读确实成功，B 的版本/摘要不变，引用来自已读材料。', 22, MUTED)
    s.save('v32-acceptance-sequences', {'kind':'declared_acceptance_scenarios','kairo_executed':False,'disconnect_cancels':False})


def access_chart():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.family':'Arial Unicode MS','svg.fonttype':'path','font.size':15})
    d = json.loads((ROOT/'dist/labs/storage-parallel-acceptance/validation.json').read_text())['programs']['shard_range.py']
    methods = ['整分片\n含本次请求内缓存','按样本 Range\n每样本一次请求']
    fig, axes = plt.subplots(1, 2, figsize=(12, 5.2), dpi=120)
    for ax, values, title, suffix in zip(axes,
       [[d['full_shards_with_request_cache']['requests'],d['indexed_ranges']['requests']],
        [d['full_shards_with_request_cache']['body_bytes'],d['indexed_ranges']['body_bytes']]],
       ['成功 HTTP 请求数','响应体字节数'],['次','B']):
        bars = ax.bar(methods,values,color=[BLUE,GREEN],width=.55)
        ax.set_title(title,fontsize=19,pad=19)
        ax.set_ylim(0,max(values)*1.30)
        ax.spines[['top','right']].set_visible(False)
        ax.set_axisbelow(True);ax.grid(axis='y',alpha=.16)
        for bar,value in zip(bars,values):ax.text(bar.get_x()+bar.get_width()/2,value+max(values)*.035,str(value)+' '+suffix,ha='center',fontsize=18,fontweight='bold')
    fig.suptitle('同样的 5 个样本：更少请求与更少字节，不总是同一方案',fontsize=21,y=.98)
    fig.text(.5,.025,'本机 HTTP 实际计数；每样本 64 B。未计响应头、索引与连接开销，不是吞吐基准。',ha='center',fontsize=13,color=MUTED)
    fig.tight_layout(rect=[0,.09,1,.89])
    fig.savefig(OUT/'v32-storage-access-counts.svg',bbox_inches='tight')
    plt.close(fig)
    file=OUT/'v32-storage-access-counts.svg'
    results=[d['full_shards_with_request_cache'],d['indexed_ranges']]
    data={'kind':'actual_loopback_http_body_counts','requests':[v['requests'] for v in results],
          'body_bytes':[v['body_bytes'] for v in results],'useful_bytes':[v['useful_sample_bytes'] for v in results]}
    file.write_text(file.read_text().replace('</svg>','<metadata id="experiment-counts">'+escape(json.dumps(data))+'</metadata></svg>'))


if __name__ == '__main__':
    interfaces();tp_chain();pp_schedule();acceptance_sequence();access_chart()
