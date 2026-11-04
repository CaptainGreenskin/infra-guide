"""Original VM/TCP mechanisms, declared credit ledger and actual CPU accounting plot."""
from html import escape
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"dist/diagrams"
E=json.loads((ROOT/"dist/labs/compute-and-transport/validation.json").read_text())
B,D,M,L,G,R="#315dce","#17263e","#56667d","#ccd8e8","#12725b","#b53e3e"

def t(x,y,text,size=21,color=D,bold=False):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{700 if bold else 400}">{escape(str(text))}</text>'

def box(x,y,w,h,fill="#fff"):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{L}"/>'

def arrow(x1,y1,x2,y2):
    return f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{B}" stroke-width="3" marker-end="url(#arrow)"/>'

def save(name,title,subtitle,items,height):
    (OUT/(name+".svg")).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img">'
        f'<title>{escape(title)}</title><desc>{escape(subtitle)}</desc>'
        '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#315dce"/></marker></defs>'
        '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">'+box(1,1,1118,height-2,"#f7f9fd")
        +t(36,49,title,28,D,True)+t(36,85,subtitle,18,M)+''.join(items)+'</g></svg>\n')

items=[t(36,135,"客户机里看见的对象",23,B,True),t(407,135,"虚拟化机制",23,B,True),t(807,135,"最终资源与限制",23,B,True)]
rows=[(163,"CPU","vCPU、寄存器与中断状态","KVM/硬件辅助执行与退出","物理逻辑CPU、调度与竞争"),
      (316,"内存","应用虚拟地址 → 客户机物理地址","二阶段/影子映射等机制","宿主物理页面、NUMA与带宽"),
      (469,"I/O","客户机设备驱动与缓冲","virtio队列 / 模拟 / 设备直通","后端、物理设备与服务配额")]
for y,label,left,middle,right in rows:
    items += [box(36,y,320,111),box(399,y,320,111,"#edf2ff"),box(762,y,322,111,"#edf6f3"),
              t(52,y+35,label,23,B,True),t(778,y+65,right,22),
              arrow(362,y+55,391,y+55),arrow(725,y+55,754,y+55)]
    if label=="内存":
        items += [t(52,y+66,"应用虚拟地址 →",22),t(52,y+95,"客户机物理地址",22)]
    else:
        items += [t(52,y+80,left,22)]
    if label=="I/O":
        items += [t(415,y+48,"virtio队列 / 模拟",23),t(415,y+82,"或设备直通",23)]
    else:
        items += [t(415,y+65,middle,22)]
items += [t(38,632,"规格是接口和资源合同，不等于应用始终独占相同数量物理核。",23,B,True),
          t(38,678,"容器可以运行在VM内：共享的是这台VM的客户机内核。此图为机制说明，不是本机VM测试。",18,M)]
save("v28-vm-three-maps","虚拟机分别虚拟化CPU、内存和设备", "以Linux/KVM为机制示意；具体云产品、架构与设备实现仍按目标环境核对。",items,715)

items=[t(239,132,"发起方A",25,B,True),t(738,132,"接收方B",25,G,True),
       '<path d="M300 150V817M805 150V817" fill="none" stroke="#aab8cd" stroke-width="2" stroke-dasharray="6 5"/>']
for y,reverse,label,left,right in [
 (191,False,"SYN：seq=100","SYN-SENT","LISTEN → SYN-RECEIVED"),
 (269,True,"SYN + ACK：seq=900，ack=101","确认B的序号","SYN-RECEIVED"),
 (347,False,"ACK：seq=101，ack=901","ESTABLISHED","ESTABLISHED"),
 (491,False,"FIN：A不再发送","FIN-WAIT-1","CLOSE-WAIT"),
 (569,True,"ACK：确认A的FIN","FIN-WAIT-2","等待应用close"),
 (647,True,"FIN：B也不再发送","收到B的结束","LAST-ACK"),
 (725,False,"ACK：确认B的FIN","TIME-WAIT","CLOSED")]:
    items += [arrow(805 if reverse else 300,y,300 if reverse else 805,y),t(337,y-15,label,20,B,True),
              t(37,y+7,left,18),t(838,y+7,right,16)]
items += [box(36,397,1048,49,"#edf6f3"),t(57,430,"数据阶段：按字节序号确认与重传；TCP确认不是应用落库回执。",22,G,True),
          t(38,837,"常见顺序示意：ACK与FIN可合并，同时关闭也可能使双方进入TIME-WAIT。",19,M),
          t(38,876,"SYN和FIN各占一个序号；TIME-WAIT并不固定属于客户端，也不等于应用连接泄漏。",19,M)]
save("v28-tcp-open-close","先同步序号，再分别结束两个发送方向","题设序号仅用于解释协议。状态名采用RFC写法；没有宣称本次程序抓到了这些报文。",items,914)

plt.rcParams.update({"font.family":"Arial Unicode MS","svg.fonttype":"path","axes.spines.top":False,"axes.spines.right":False})
fig,ax=plt.subplots(figsize=(11.2,5.6),dpi=110)
fig.patch.set_facecolor("#f7f9fd");ax.set_facecolor("#f7f9fd")
minutes=np.arange(0,31);balance=48-1.6*minutes
ax.plot(minutes,balance,color=B,linewidth=3);ax.fill_between(minutes,balance,color=B,alpha=.10)
for minute in [0,10,20,30]:
    value=48-1.6*minute;ax.scatter([minute],[value],color=B,zorder=3);ax.annotate(f"{minute}分钟：{value:.0f}",(minute,value),xytext=(5,10),textcoords="offset points",fontsize=11)
ax.set(xlim=(-1,35),ylim=(-3,60),xlabel="持续满用2个vCPU的时间 / 分钟",ylabel="积分余额 / vCPU·分钟")
ax.set_title("声明的积分账本：48 ÷ (2 − 0.4) = 30分钟",loc="left",fontsize=17,pad=16)
ax.text(.02,.94,"题设2 vCPU、20%基线：赚0.4积分/分；满载花2积分/分；净扣1.6",transform=ax.transAxes,fontsize=11)
ax.grid(axis="y",alpha=.18)
fig.text(.04,.005,"机制算例，不是某实例实测；Standard/Unlimited耗尽后的处理及收费另按产品合同核对。",fontsize=10.5)
fig.tight_layout(rect=(0,.04,1,1));fig.savefig(OUT/"v28-credit-balance.svg",bbox_inches="tight",metadata={"Date":None});plt.close(fig)

cases=E["programs"]["cpu_and_wall.py"]["result"]["cases"]
names=["one_cpu_phase","one_wait_phase","two_cpu_threads"]
wall=[cases[k]["elapsed_seconds"]*1000 for k in names];cpu=[cases[k]["process_cpu_seconds"]*1000 for k in names]
fig,ax=plt.subplots(figsize=(11.2,5.9),dpi=110);fig.patch.set_facecolor("#f7f9fd");ax.set_facecolor("#f7f9fd")
x=np.arange(3);bars1=ax.bar(x-.18,wall,.34,label="墙钟时间",color=B);bars2=ax.bar(x+.18,cpu,.34,label="进程CPU时间",color=G)
for bars in [bars1,bars2]:
    for bar in bars:
        v=bar.get_height();ax.annotate(f"{v:.3f}",(bar.get_x()+bar.get_width()/2,v),xytext=(0,5),textcoords="offset points",ha="center",fontsize=11)
ax.set_xticks(x,["单线程CPU阶段","只等待阶段","两个CPU线程"])
ax.set_ylabel("毫秒");ax.set_ylim(0,max(wall+cpu)*1.25);ax.grid(axis="y",alpha=.15);ax.legend(frameon=False)
ax.set_title("真实本机记账：经过的时间与实际CPU消耗",loc="left",fontsize=17,pad=20)
fig.text(.04,.008,"CPython3.9.6/macOS单次记录；CPU停止目标不是cgroup配额，两线程不构成VM或吞吐基准。",fontsize=10.5)
fig.tight_layout(rect=(0,.04,1,1));fig.savefig(OUT/"v28-cpu-wall.svg",bbox_inches="tight",metadata={"Date":None});plt.close(fig)
print("PASS: two original VM/TCP SVGs, one declared credit plot and one measured CPU/wall plot.")
