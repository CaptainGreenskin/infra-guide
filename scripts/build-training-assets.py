"""Generate original SVG teaching diagrams and embed downloadable lab text."""
from pathlib import Path
from html import escape
import json
import hashlib
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/diagrams'
OUT.mkdir(exist_ok=True)

def box(x, y, w, h, title, sub='', accent=False):
    fill, stroke = ('#edf2fe', '#7e9ee5') if accent else ('#ffffff', '#d7e1ef')
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}"/><text x="{x+w/2}" y="{y+30}" text-anchor="middle" class="label">{escape(title)}</text><text x="{x+w/2}" y="{y+53}" text-anchor="middle" class="small">{escape(sub)}</text>'

def line(x1, y1, x2, y2, dashed=False):
    dash = 'stroke-dasharray="5 5"' if dashed else ''
    return f'<path d="M{x1} {y1} L{x2} {y2}" stroke="#315dce" stroke-width="2" fill="none" marker-end="url(#arrow)" {dash}/>'

def text(x, y, s, cls='small'):
    return f'<text x="{x}" y="{y}" class="{cls}">{escape(s)}</text>'

def save(name, title, desc, body, height=480):
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 {height}" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#315dce"/></marker></defs><style>text{{font-family:'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;fill:#203553}}.label{{font-size:16px;font-weight:600}}.small{{font-size:12px;fill:#61748e}}.title{{font-size:22px;font-weight:700}}.eyebrow{{font-size:10px;fill:#315dce;letter-spacing:2px}}</style><rect width="960" height="{height}" rx="14" fill="#f6f8fc"/>{text(30,30,'CLOUDINFRA GUIDE / TRAINING SYSTEMS','eyebrow')}{text(30,67,title,'title')}{body}</svg>'''
    (OUT/f'{name}.svg').write_text(svg)

body=box(35,100,230,70,'任务声明','镜像 / 数据版本 / 超参数')+box(360,100,230,70,'调度与作业控制','配额 / 拓扑 / 失败策略')+box(685,100,230,70,'可观测性','指标 / 日志 / 运行记录')
body+=line(265,135,360,135,True)+line(590,135,685,135,True)
body+=box(205,225,240,100,'训练节点 A','GPU 0 / 1 · RANK 0 / 1',True)+box(520,225,240,100,'训练节点 B','GPU 0 / 1 · RANK 2 / 3',True)
body+=line(445,268,520,268)+line(520,288,445,288)+text(451,255,'NCCL')+line(475,170,325,225,True)+line(475,170,640,225,True)
body+=box(70,390,280,70,'版本化数据集 / 缓存','读取 → 解码 → 批处理')+box(610,390,280,70,'持久化检查点','模型 / 优化器 / 进度 / RNG')
body+=line(160,390,250,325)+line(330,390,570,325)+line(440,325,750,390)+text(365,417,'所有 rank 读取输入')+text(365,440,'本实验由 rank 0 提交检查点')
body+=text(365,465,'实线：数据 / 虚线：控制')
save('cloud-training','云上训练：控制、计算与数据三个平面','调度器控制两台训练节点，各节点读取数据，节点间双向 NCCL 通信，节点 A 的 rank 0 提交检查点。',body,490)

body=box(35,110,405,240,'NODE A · 10.0.1.10','NODE_RANK = 0',True)+box(520,110,405,240,'NODE B · 10.0.1.11','NODE_RANK = 1',True)
for node_x, ranks in [(55,[0,1]),(540,[2,3])]:
    for i,r in enumerate(ranks):
        body+=box(node_x+i*195,205,175,100,f'GPU {i} / 进程',f'LOCAL_RANK={i} · RANK={r}')
body+=line(440,245,520,245)+line(520,265,440,265)+text(448,230,'NCCL')+text(35,390,'WORLD_SIZE = 4     ·     每进程 1 张 GPU     ·     LOCAL_RANK 只在当前节点内唯一','label')
body+=text(35,425,'两端以同一 MASTER_ADDR:MASTER_PORT 加入同一作业；训练张量并不都经过此端口。')
save('ranks','两机四卡：节点、进程与 GPU 的映射','节点 A 的全局 rank 为 0 和 1，节点 B 为 2 和 3，每台机器的 local rank 都从零开始。',body,455)

body=text(32,115,'不同 rank 处理不同数据分片，但在同步点得到一致的平均梯度。')
for row, y in [(0,155),(1,295)]:
    body+=text(35,y+35,f'RANK {row}','label')
    for x,t,s in [(145,'数据分片',f'batch {row}'),(330,'前向 / 反向','本地梯度'),(535,'AllReduce','梯度归约'),(740,'Optimizer','更新副本')]:
        body+=box(x,y,165,80,t,s,x==535)
    body+=line(310,y+40,330,y+40)+line(495,y+40,535,y+40)+line(700,y+40,740,y+40)
body+=line(617,235,617,295)+text(35,420,'图示是逻辑依赖；实际 DDP 会按梯度桶发起通信，并可与反向计算重叠。')
save('ddp-step','一次 DDP 更新：计算与通信如何配合','两条 rank 流水线分别执行数据读取和前反向，通过 AllReduce 同步梯度，最后更新各自模型副本。',body,450)

body=text(35,115,'示例口径：FP32 参数 + FP32 梯度 + Adam 一阶与二阶状态；不含激活和临时缓冲。')
labels=[('参数','4 bytes / parameter',190),('梯度','4 bytes / parameter',190),('Adam 状态','8 bytes / parameter',380)]
x=35
for t,s,w in labels:body+=box(x,155,w,100,t,s,True);x+=w+15
body+=text(35,300,'训练状态近似：16 × 参数量（bytes）','label')+text(35,337,'1B 参数 → 约 16 GB（十进制）训练状态；实际显存峰值还要加激活、通信与分配器开销。')
body+=text(35,378,'DDP 复制这些状态；分片策略按规则拆分部分状态。切换 BF16 不等于整体显存直接减半。')
save('memory-budget','显存预算：参数只是其中一部分','训练状态分为参数、梯度和优化器状态；在这个 FP32 Adam 示例中分别为 4、4 和 8 字节每参数。',body,415)

body=box(35,125,200,80,'完成 epoch N','所有 rank 到达保存点',True)+box(285,125,200,80,'提交检查点','临时文件 → 原子替换',True)+box(535,125,180,80,'重新启动作业','同一配置 / world size')+box(765,125,160,80,'恢复并继续','从 epoch N+1 开始')
body+=line(235,165,285,165)+line(485,165,535,165)+line(715,165,765,165)
body+=box(125,285,710,80,'持久化内容','模型 + 优化器 + scaler + epoch + 各 rank RNG + 配置签名')
body+=line(385,205,385,285)+line(835,325,845,205)
body+=text(35,420,'本实验仅保证固定 world size 的 epoch 边界恢复；中途故障会重做最后一个未提交的 epoch。')
save('checkpoint-flow','保存成功之后，还必须能恢复','所有 rank 在 epoch 边界提交状态，rank 零原子替换共享检查点，新作业读取同一版本并恢复各 rank 随机数状态。',body,450)

LAB=ROOT/'dist/labs/ddp'
files={p.name:p.read_text() for p in sorted(LAB.iterdir()) if p.is_file() and p.suffix in ('.py','.sh','.md','.yaml','.txt','.json')}
if 'validation.json' in files:
    record=json.loads(files['validation.json'])
    assert record['train_sha256']==hashlib.sha256((LAB/'train_ddp.py').read_bytes()).hexdigest(), 'Training code changed: rerun verification before building.'
(ROOT/'dist/lab-files.js').write_text('const labFiles = '+json.dumps(files,ensure_ascii=False)+';\n' + ('const labValidation = '+files['validation.json'].strip()+';\n' if 'validation.json' in files else ''))
with ZipFile(ROOT/'dist/labs/cloud-training-ddp.zip','w',ZIP_DEFLATED) as z:
    for name in files:z.write(LAB/name, f'cloud-training-ddp/{name}')
print(f'Generated 5 diagrams; packaged {len(files)} lab files.')
