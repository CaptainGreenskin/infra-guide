"""Draw source-bound block layouts, lifecycle and scheduler opportunities."""
from pathlib import Path
import html
import json

ROOT = Path(__file__).resolve().parent.parent
RESULT = json.loads((ROOT/'dist/labs/inference-cache/validation.json').read_text())['result']


def figure(name, title, height, metadata):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 {height}" role="img" aria-labelledby="title desc">',
            f'<title id="title">{html.escape(title)}</title>',
            '<desc id="desc">固定CPU实验的对象、状态和迭代结果。不是设备内存或GPU性能测量。</desc>',
            '<metadata>'+html.escape(json.dumps(metadata, ensure_ascii=False))+'</metadata>',
            f'<rect width="1120" height="{height}" rx="12" fill="#f8fafc"/>',
            '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">',
            f'<text x="40" y="46" fill="#20314e" font-size="27" font-weight="650">{html.escape(title)}</text>']


def text(out, x, y, value, size=21, color='#20314e', weight='400', anchor='start'):
    out.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" fill="{color}" font-size="{size}" font-weight="{weight}">{html.escape(str(value))}</text>')


def save(name, out):
    (ROOT/'dist/diagrams'/f'inference-cache-{name}.svg').write_text('\n'.join(out+['</g></svg>'])+'\n')


def draw_blocks():
    trace = RESULT['pressure']['trace']
    out = figure('blocks', '逻辑前缀相同，可以指向同一物理块', 950,
                 {'block_size': 4, 'before': trace[0], 'after': trace[1]})
    text(out, 40, 82, '块长4位置、物理池4块；方框内是输入词元，空格是尚未使用的槽位。', 19, '#536783')
    palettes = ['#e4edff', '#e5f3e9', '#eee9f8', '#fff0d5']
    for phase, top, rows in [(0, 130, [('A', '[1,2,3,4 | 5,6]', '[P0, P1]'), ('B', '[1,2,3,4 | 7,8]', '[P0, P2]')]),
                             (1, 530, [('A', '[1,2,3,4 | 5,6]', '[P0, P1]'), ('B', '[1,2,3,4 | 7,8]', '[P0, P2]'), ('C', '[1,2,3,4 | 5,6,9]', '[P0, P3]')])]:
        text(out, 40, top, '① A、B处理完各自6个输入' if phase == 0 else '② C从A分叉，追加9前复制尾块', 23, '#234d9f', '600')
        for i, (name, tokens, mapping) in enumerate(rows):
            y = top+54+i*84
            text(out, 55, y, name+' '+tokens, 22, '#20314e', '600')
            text(out, 85, y+31, '逻辑块表 → '+mapping, 19, '#536783')
        data = trace[phase]['physical']
        values = [['1','2','3','4'], ['5','6','·','·'], ['7','8','·','·'], ['·']*4 if phase == 0 else ['5','6','9','·']]
        for i, block in enumerate(data):
            y = top+26+i*68
            out.append(f'<rect x="610" y="{y}" width="455" height="55" rx="7" fill="{palettes[i] if block["refs"] else "#eef1f5"}" stroke="#c2cce0"/>')
            text(out, 624, y+35, 'P'+str(i), 22, '#234d9f', '600')
            for j, token in enumerate(values[i]):
                text(out, 703+j*56, y+35, token, 22, anchor='middle')
            text(out, 954, y+35, '引用 '+str(block['refs']), 20)
    text(out, 40, 879, '完整前缀缓存只登记满块；fork共享未满尾块，是需要写时复制的另一条路径。', 20, '#20314e')
    text(out, 40, 918, '第二幅：19个逻辑位置，11份已计算位置值，4块共16槽；本图不换算Python对象内存。', 18, '#536783')
    save('blocks', out)


def draw_lifecycle():
    trace = RESULT['pressure']['trace']
    out = figure('lifecycle', '引用归零后可保留，重分配时必须失效旧身份', 930,
                 {'events': trace, 'stale_handle': RESULT['pressure']['stale_handle']})
    text(out, 40, 82, '活动请求持有 → 请求释放 → 缓存保留或回收。槽号相同，不代表仍是同一份内容。', 19, '#536783')
    for x, title, body, fill in [(40,'活动块','refs > 0；不可覆盖','#e4edff'),
                                  (420,'可回收缓存','refs = 0；仍可命中','#e5f3e9'),
                                  (800,'重分配','代次+1；旧索引移除','#fff0d5')]:
        out.append(f'<rect x="{x}" y="130" width="280" height="96" rx="9" fill="{fill}" stroke="#bdcde8"/>')
        text(out, x+140, 166, title, 23, '#234d9f', '600', 'middle')
        text(out, x+140, 203, body, 19, anchor='middle')
    for x in [330,710]:
        out.append(f'<path d="M{x} 178h70l-10 -7m10 7l-10 7" stroke="#6c88b6" stroke-width="2" fill="none"/>')
    out.append('<path d="M560 226v48H180v-48m0 0l-7 10m7 -10l7 10" stroke="#498765" stroke-width="2" fill="none"/>')
    text(out, 350, 309, '命中完整前缀：重新持有，不重算该块', 19, '#25654b', anchor='middle')
    text(out, 40, 354, '实际对照：B的(P2,代次1)释放后，D得到(P2,代次2)，旧句柄读被拒绝。', 20)
    headers = [(56,'连续事件'),(610,'累计计算位置'),(817,'命中位置'),(982,'COW次数')]
    for x, label in headers: text(out, x, 411, label, 19, '#536783')
    labels = ['A/B共享前缀','C分叉后追加','B释放，D重用槽','暂停A/C，压力逐出','恢复A：重新计算6位置','全部完成：活动引用0']
    for i, (label, event) in enumerate(zip(labels, trace)):
        y=432+i*65
        out.append(f'<rect x="40" y="{y}" width="1040" height="55" rx="5" fill="{"#fff" if i%2==0 else "#edf2fa"}"/>')
        text(out, 56, y+35, label, 20)
        for x, value in [(685,event['computed_positions']),(864,event['reused_positions']),(1022,event['copies'])]:
            text(out, x, y+35, value, 23, '#234d9f', '600', 'middle')
    text(out, 40, 874, '重算恢复逻辑状态，会增加工作；零引用缓存保留与活动引用泄漏需要分开检查。', 19, '#536783')
    text(out, 40, 907, '实际缓存数值逐格对照完整前缀重算；只比较块号不能发现错误上下文。', 19, '#536783')
    save('lifecycle', out)


def draw_fairness():
    a,b=RESULT['schedulers']
    out=figure('fairness','同一份工作，调度先后改变谁在等待',760, {'schedulers':RESULT['schedulers']})
    text(out,40,83,'每轮最多2个输入位置，每请求每轮最多1位置；A要4个输出，迭代1–8每轮新增2个短请求。',18,'#536783')
    start, stride = 292, 66
    for i in range(12): text(out,start+i*stride,147,i,18,'#536783',anchor='middle')
    text(out,40,147,'迭代编号（从0开始）',18,'#536783')
    for result,y,label in [(a,235,'新提示优先'),(b,395,'轮转执行')]:
        text(out,40,y,label,23,'#234d9f','600')
        text(out,40,y+39,'A的输出',19)
        out.append(f'<path d="M{start} {y}H{start+11*stride}" stroke="#c5d1e3" stroke-width="2"/>')
        for iteration in result['A_output_iterations']:
            x=start+stride*iteration
            out.append(f'<circle cx="{x}" cy="{y}" r="10" fill="#315dce"/>')
        arrival=8
        emitted=arrival+result['B81_first_output_wait']
        x1,x2=start+stride*arrival,start+stride*emitted
        out.append(f'<path d="M{x1} {y+56}H{x2}" stroke="#b07a25" stroke-width="5"/>')
        for x in [x1,x2]:out.append(f'<path d="M{x-6} {y+50}L{x+6} {y+50}L{x} {y+62}Z" fill="#b07a25"/>')
        text(out,280,y+94,'B₈₁：迭代8到达，等待 '+str(result['B81_first_output_wait'])+' 轮得到首输出',18,'#8a5a16')
    for i,(title,old,new) in enumerate([('A最大输出间隔',9,2),('B₈₁首输出等待',0,2),('实际处理输入位置',20,20),('全部完成所用迭代',12,11)]):
        x=40+i*270
        out.append(f'<rect x="{x}" y="536" width="250" height="98" rx="8" fill="#eaf0fb"/>')
        text(out,x+125,570,title,18,'#536783',anchor='middle')
        text(out,x+125,612,str(old)+' → '+str(new),27,'#234d9f','650','middle')
    text(out,40,684,'轮转让A更少停顿，但部分短请求多等；本例也减少尾部只有A时的空槽。',20)
    text(out,40,721,'每轮都实际计算CPU注意力；迭代不是毫秒，不能从此图推断GPU性能。',19,'#536783')
    save('fairness',out)


draw_blocks()
draw_lifecycle()
draw_fairness()
print('Drew three cache layout/lifecycle/fairness diagrams from actual program records.')
