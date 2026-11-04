"""Original recovery/bundle/search mechanisms plus a Matplotlib ranked-gain plot."""
from html import escape
import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

BASE=Path(__file__).resolve().parents[1]
ROOT=BASE/"dist/diagrams"
E=json.loads((BASE/"dist/labs/recovery-artifacts-retrieval/validation.json").read_text())
B,D,M,L,G,R="#315dce","#17263e","#56667d","#ccd8e8","#12725b","#b53e3e"


def t(x,y,value,size=20,color=D,bold=False):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{700 if bold else 400}">{escape(str(value))}</text>'


def box(x,y,w,h,fill="#fff",stroke=L):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}"/>'


def arrow(x1,y1,x2,y2):
    return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{B}" stroke-width="3" marker-end="url(#arrow)"/>'


def save(name,title,subtitle,items,height=740):
    (ROOT/(name+".svg")).write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img">'
        f'<title>{escape(title)}</title><desc>{escape(subtitle)}</desc>'
        '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#315dce"/></marker></defs>'
        '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">'
        +box(1,1,1118,height-2,"#f7f9fd")+t(36,49,title,28,D,True)+t(36,85,subtitle,18,M)+"".join(items)+'</g></svg>\n')


items=[t(38,131,"提交序号",21,B,True),t(220,131,"题设时间",21,B,True),t(426,131,"数据库报告",21,B,True),t(758,131,"恢复侧对象",21,B,True)]
for i,(seq,time,report,obj,present) in enumerate([(100,"11:30","R1","v1",True),(101,"11:42","R2","v2",True),(102,"11:54","R3","v3",False),(103,"11:57","R4","v4",True)]):
    y=153+i*83
    items += [box(36,y,1048,66,"#edf6f3" if i<2 else "#f9ecec" if not present else "#fff"),
              t(58,y+42,seq,25,B,True),t(220,y+42,time,25),t(426,y+42,report+" → object-"+obj,24),
              t(758,y+42,"存在且摘要匹配" if present else "缺失：R3无法读取",23,G if present else R,True)]
items += [box(36,526,1048,112,"#edf2ff"),t(58,567,"数据库到103且integrity_check=ok；业务仍缺R3附件。",24,B,True),
          t(58,611,"本题最后完整前缀101：12:00−11:42=18分钟，超过15分钟RPO。",23,R,True),
          t(38,690,"v4在也不能跳过缺失的102；本题要求保留所有报告。分钟为声明输入，非恢复耗时实测。",18,M)]
save("v27-consistent-recovery-cut","恢复点要能被业务完整读取","实际SQLite备份/应用日志重放与对象摘要核对；不是数据库物理WAL恢复。",items,727)

items=[box(36,125,500,92),box(584,125,500,92),t(58,164,"应用旧备份：outbox=PENDING",23,B,True),
       t(606,164,"独立接收方：通知37已提交",23,G,True),t(58,199,"原业务ID notify-R27",20),t(606,199,"曾在提交后注入HTTP 503",20)]
items += [arrow(286,225,286,271),arrow(834,225,834,271),box(36,283,500,105,"#edf2ff"),box(584,283,500,105,"#edf6f3"),
          t(58,325,"恢复应用后，又看见PENDING",23,B,True),t(58,365,"数据库倒回，外部通知没有倒回。",21),
          t(606,325,"接收方代际1→2，保留原回执",22,G,True),t(606,365,"旧代际新写409；同ID异参409",20)]
items += [arrow(421,415,697,415),t(199,454,"当前代际 + 原业务ID → duplicate=true / 200",24,B,True)]
items += [box(36,492,500,111,"#edf6f3"),t(58,533,"正确恢复",25,G,True),t(58,575,"outbox=DONE，仍1笔效果",24),
          box(584,492,500,111,"#f9ecec"),t(606,533,"错换新ID的独立反例",24,R,True),t(606,575,"接收方视为新动作，变2笔效果",22)]
items += [t(38,675,"真实本机HTTP/SQLite。代际号不是凭据；提升权限与真实认证未在本夹具实现。",18,M)]
save("v27-restored-outbox","恢复旧任务状态，不能再发送一份已完成通知","稳定业务身份跨备份与恢复；接收方在同一事务核对代际、意图和回执。",items,712)

items=[t(38,131,"相同shape：embedding [3,1] / readout [1,1] / bias [1]",22,B,True)]
rows=[("r17","A→0 / B→1","[1,2,0]","A=1 / B=2","#edf6f3",G),
      ("r18","A→1 / B→0","[1,2,0]","A=2 / B=1","#f9ecec",R),
      ("r19","A→1 / B→0","[2,1,0]","A=1 / B=2","#edf6f3",G)]
for i,(name,vocab,weights,values,fill,color) in enumerate(rows):
    y=169+i*128
    items += [box(36,y,1048,102,fill),t(57,y+43,name,28,B,True),t(190,y+39,"词表ID",18,M),t(190,y+77,vocab,22),
              t(473,y+39,"权重三行",18,M),t(473,y+77,weights,24),t(749,y+39,"实际CPU输出",18,M),t(749,y+77,values,25,color,True)]
items += [box(36,590,1048,67,"#edf2ff"),t(58,634,"r18文件摘要和形状都正确，固定语义合同仍失败；r19配套更新后通过。",22,B,True),
          t(38,704,"实际Safetensors/CPU小模型；固定A=1、B=2，不是LLM效果基准。混装r19权重+r17词表也失败。",18,M)]
save("v27-bundle-semantics","同样的张量形状，不同的词表含义","输入先变成ID，ID再选择权重行；保存与加载成功只证明其中一层。",items)

bundle=E["programs"]["artifact_bundle.py"]["result"]
items=[]
for x,label,generation,color in [(36,"r17",1,B),(404,"r19",2,G),(772,"r17",3,B)]:
    items += [box(x,153,312,123,"#edf6f3"),t(x+20,197,label,31,color,True),t(x+20,239,"发布代际 "+str(generation),24)]
items += [arrow(354,215,394,215),arrow(722,215,762,215),t(341,310,"验证候选后切换",21,G,True),t(711,350,"完整旧束可用才回退",21,B,True)]
items += [box(36,390,500,165,"#f9ecec"),t(58,432,"拒绝r18",25,R,True),t(58,473,"摘要/形状过，语义门禁不过",22),t(58,516,"路由保持r17/1",23),
          box(584,390,500,165,"#fff1e6"),t(606,432,"拒绝迟到发布者与残缺回退",23,R,True),t(606,473,"旧期望r17/1不能覆盖r19/2",21),t(606,516,"缺tokenizer时不切指针",22)]
items += [t(38,619,"条件更新同时核对：旧版本 + 旧代际 + 旧清单摘要。回到r17，代际仍向前走。",22,B,True),
          t(38,695,"实际SQLite指针与CPU对象；未实现分布式路由/灰度排空。正在处理的请求固定完整r17对象。",18,M)]
save("v27-publication-pointer","生产别名可以变，模型版本束与请求引用要固定","先验证不可变成员，再条件切换指针；指针更新与所有副本生效分别观察。",items,735)

items=[box(36,128,1048,112),t(58,169,"原文：数据库备份支持恢复。恢复前校验日志链。",25,B,True),
       t(58,211,"unicode61将连续汉字作为较长词；本语料查询“恢复”没有独立词命中。",21)]
items += [arrow(559,250,559,290),box(36,304,1048,106,"#edf2ff"),t(58,346,"教学二元切分：数据 / 据库 / 库备 / 备份 / … / 恢复",24,B,True),
          t(58,386,"查询“数据库恢复” → 数据 OR 据库 OR 库恢 OR 恢复",22)]
items += [arrow(559,420,559,460),box(36,474,1048,120,"#edf6f3"),t(58,515,"MATCH → 合法租户/当前版本/索引版本 → BM25 → LIMIT",23,G,True),
          t(58,557,"SQLite BM25分数越小越靠前；分词或索引版本不对，先修这一步。",21)]
items += [t(38,651,"另一路排名在实验中明确给定，再用RRF按名次融合；没有调用embedding模型。",22,B,True),
          t(38,700,"实际FTS5。二元片段不是通用中文分词；共享索引的全语料统计也不等于租户统计隔离。",18,M)]
save("v27-chinese-fts","中文检索先看切词，再谈相关性排序","8条固定中文材料，实际运行SQLite FTS5、BM25和索引版本检查。",items)

search=E["programs"]["chinese_fts_rrf.py"]["result"]
plt.rcParams.update({"font.family":"Arial Unicode MS","font.size":13,"svg.fonttype":"path",
                     "figure.facecolor":"#f7f9fd","axes.facecolor":"#f7f9fd","text.color":D,
                     "axes.labelcolor":D,"xtick.color":M,"ytick.color":M})
grades=search["grades"]
orders=[[r["id"] for r in search["actual_lexical_results"][:3]],[r["id"] for r in search["rrf_results"][:3]]]
contributions=[[ (2**grades.get(identity,0)-1)/math.log2(rank+1) for rank,identity in enumerate(order,1)] for order in orders]
contributions.append([(2**g-1)/math.log2(rank+1) for rank,g in enumerate(sorted(grades.values(),reverse=True)[:3],1)])
fig,ax=plt.subplots(figsize=(11.2,6.5),layout="constrained")
positions=np.arange(3)
for shift,values,label,color in [(-.25,contributions[0],f"BM25，nDCG={search['lexical_metrics']['ndcg_at_3']:.4f}",B),
                               (0,contributions[1],f"RRF，nDCG={search['rrf_metrics']['ndcg_at_3']:.4f}",G),
                               (.25,contributions[2],"本例理想排序，nDCG=1", "#8b72b8")]:
    bars=ax.bar(positions+shift,values,.22,label=label,color=color)
    ax.bar_label(bars,fmt="%.3f",padding=4,fontsize=11)
ax.set_xticks(positions,["第1位","第2位","第3位"])
ax.set_ylim(0,9.3)
ax.set_ylabel("该位置的DCG贡献：(2^相关性等级−1) / log₂(名次+1)")
ax.set_title("命中数相同，分级相关性的排列仍改变得分\n固定标签：3/2/1/2；不是模型检索基准",loc="left",pad=20)
ax.legend(frameon=False,loc="upper right")
ax.spines[["right","top"]].set_visible(False)
ax.grid(axis="y",alpha=.18)
ax.set_axisbelow(True)
fig.text(.03,-.01,"两种排序P@3=1、Recall@3=0.75、RR=1；RRF仍未达到理想前3名。第二路排名是声明输入。",fontsize=11)
fig.savefig(ROOT/"v27-ranked-gains.svg",bbox_inches="tight",metadata={"Date":None})
plt.close(fig)
print("PASS: 5 original recovery/bundle/search SVGs + 1 Matplotlib ranked-gain plot generated from actual records.")
