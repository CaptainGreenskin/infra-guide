"""Declared object correspondence, not a recorded Kubernetes execution."""
from pathlib import Path
from html import escape
import json
ROOT=Path(__file__).resolve().parents[1]
parts=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 850" width="1120" height="850" role="img" aria-labelledby="title desc">','<title id="title">同一次训练的作业、队列、Pod与进程组</title>','<desc id="desc">声明R1/A1创建Indexed Job J1。Workload W1通过ownerReferences关联Job，Job管理两个Pod。静态会合将两个本地进程组连为四rank。W1不直接拥有Pod。</desc>','<style>text{font-family:"PingFang SC","Microsoft YaHei",sans-serif}</style>','<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10Z" fill="#315dce"/></marker></defs>','<rect width="1120" height="850" fill="white"/>']
def text(x,y,t,size=24,color='#1c283d',weight=400,anchor='start'):
 parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(t))}</text>')
def box(x,y,w,h,fill='#f3f5fa'):
 parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="#dce3ed"/>')
def arrow(path,dashed=False):
 parts.append(f'<path d="{path}" fill="none" stroke="#315dce" stroke-width="2" marker-end="url(#arrow)"'+(' stroke-dasharray="7 5"' if dashed else '')+'/>')
text(32,47,'一份训练，三类身份',32,weight=650)
text(32,89,'平台记录工作与执行轮次；Kubernetes记录对象；rank标识本次通信组内的进程。',22,'#66738a')
box(32,120,1056,92,'#eaf0ff');text(56,157,'run R1  →  attempt A1',29,'#315dce',600);text(56,193,'相同代码、数据与配置；本轮选择新建 Job，并登记其 UID。',23)
arrow('M852 212 L852 259');text(871,242,'创建与关联',21,'#315dce')
box(32,280,460,121,'#edf6f2');text(55,317,'Workload W1',28,'#287b69',600);text(55,354,'PodSet：2 份相同 Pod 模板',23);text(55,386,'每份申请两卡 → 额度 4 卡',22,'#66738a')
box(665,280,423,121,'#eaf0ff');text(688,317,'Indexed Job J1',28,'#315dce',600);text(688,354,'parallelism = completions = 2',23);text(688,386,'Job UID：本次对象的唯一身份',22,'#66738a')
arrow('M492 333 L653 333',True);text(578,304,'拥有者引用',20,'#315dce',anchor='middle');text(578,366,'指向 Job UID',19,'#315dce',anchor='middle')
arrow('M875 401 L875 430 L707 430 L707 472');arrow('M875 430 L968 430 L968 472');text(720,458,'Job 管理 Pod',21,'#315dce')
for x,index,node,ranks in [(578,0,'节点 A','global rank 0 / 1'),(841,1,'节点 B','global rank 2 / 3')]:
 box(x,485,247,120);text(x+18,521,f'Pod P{index} · {node}',24,weight=550);text(x+18,554,f'索引 {index} · 独立 UID',20);text(x+18,586,'申请两卡，启动两个进程',20,'#66738a');arrow(f'M{x+123} 605 L{x+123} 639')
 box(x,651,247,91,'#eaf0ff');text(x+123,685,ranks,23,'#315dce',550,'middle');text(x+123,723,'local rank 各为 0 / 1',21,anchor='middle')
box(32,485,480,258);text(55,524,'关联时查什么',26,'#287b69',600)
for i,t in enumerate(['W1.ownerReferences → J1 UID','Pod.ownerReferences → J1 UID','平台登记：R1 / A1 / Job UID','训练日志：attempt / Pod UID / rank','Workload 获准后，仍需放置与会合']):text(55,568+i*36,t,21)
text(32,797,'本例静态 node_rank = 完成索引；共同 WORLD_SIZE = 4。整组 A2 使用新对象。',23,'#66738a')
text(32,833,'这是教学映射与平台策略；未声明 Kueue/GPU 已在此场景实跑。',21,'#66738a')
meta={'kind':'declared_training_object_correspondence','run':'R1','attempt':'A1','job':'J1','workload':'W1','podsets':[{'count':2,'gpu_per_pod':2}],'rank_groups':[[0,1],[2,3]],'world_size':4,'owner_reference_edges':[['W1','J1'],['P0','J1'],['P1','J1']],'native_execution':False,'gpu_execution':False}
parts.append('<metadata>'+escape(json.dumps(meta,ensure_ascii=False))+'</metadata>');parts.append('</svg>')
(ROOT/'dist/diagrams/v65-training-object-chain.svg').write_text('\n'.join(parts))
