"""Original mechanism drawings and one quantitative Matplotlib plot from the actual run."""
from html import escape
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE / "dist/diagrams"
E = json.loads((BASE / "dist/labs/leases-placement-sandbox/validation.json").read_text())
B, D, M, L, G, R = "#315dce", "#17263e", "#56667d", "#ccd8e8", "#12725b", "#b53e3e"


def t(x, y, value, size=20, color=D, bold=False):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{700 if bold else 400}">{escape(str(value))}</text>'


def box(x, y, w, h, fill="#fff", stroke=L, radius=10):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>'


def line(x1, y1, x2, y2, color=L, width=2, dashed=False):
    return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{color}" stroke-width="{width}"' + (' stroke-dasharray="8 6"' if dashed else '') + '/>'


def arrow(x1, y1, x2, y2):
    return line(x1, y1, x2, y2, B, 3)[:-2]+' marker-end="url(#arrow)"/>'


def save(name, title, subtitle, items, height=740):
    (ROOT / (name+".svg")).write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img">'
        f'<title>{escape(title)}</title><desc>{escape(subtitle)}</desc>'
        '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#315dce"/></marker></defs>'
        '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">'
        + box(1, 1, 1118, height-2, "#f7f9fd")+t(36, 49, title, 28, D, True)+t(36, 85, subtitle, 18, M)
        + "".join(items)+'</g></svg>\n')


items = [t(38, 136, "控制时钟（秒）", 20, B, True)]
for x, n in [(250, 0), (610, 30), (710, 31), (810, 32), (980, 33)]:
    items += [line(x, 156, x, 535, L, 1, True), t(x-10, 143, n, 20, M)]
items += [t(38, 205, "队列可见性", 22), box(250, 174, 360, 56, "#edf2ff"), t(266, 211, "第1次接收：隐藏到30", 20, B, True),
          box(710, 239, 352, 56, "#edf6f3"), t(726, 276, "第2次接收：新句柄，到61", 20, G, True)]
items += [t(38, 358, "旧执行者", 22), line(250, 348, 810, 348, R, 9),
          t(275, 330, "可见性已到期，代码仍在运行", 21, R, True),
          f'<circle cx="810" cy="348" r="9" fill="{R}"/>', t(738, 391, "仍能提交37", 20, R, True)]
items += [t(38, 447, "新执行者", 22), line(710, 436, 980, 436, G, 9),
          t(705, 481, "查业务inbox，复用37", 21, G, True), t(705, 521, "第2次句柄确认成功", 21)]
items += [box(36, 563, 1048, 101, "#edf2ff"), t(58, 603, "运输消息ID / 每次接收句柄 / 业务动作ID，是三层身份。", 24, B, True),
          t(58, 642, "业务效果与inbox同事务：重复执行只确认旧结果；队列确认仍是另一次提交。", 20)]
items += [t(38, 707, "本地SQLite参考，非云端时间线。此例严格拒绝旧句柄；SQS旧句柄删除可成功却未删。", 18, M)]
save("v26-visibility-not-fencing", "可见性超时只影响重投，不会停止旧执行者", "按事件排布，间距不表示秒数比例；第二次截止61秒在图外。", items)

items = [box(36, 126, 1048, 72, "#edf2ff"), t(58, 169, "固定输入：A成功、B失败；C在标准批中成功，在FIFO首错后不处理。", 23, B, True)]
rows = [("标准队列，部分响应已启用", "正常返回[B]", "只重投B；A/C确认", "#edf6f3", G),
        ("未启用部分响应，吞掉异常", "正常返回[B]", "被当整次成功；B可能丢工作", "#f9ecec", R),
        ("已启用，但handler最终抛异常", "没有正常响应", "整批失败；A/B/C都须防重", "#fff1e6", R),
        ("FIFO，遇到B失败立即停止", "正常返回[B,C]", "B与未处理C重投；只确认A", "#edf6f3", G)]
for i, (condition, response, outcome, bg, color) in enumerate(rows):
    y=226+i*100
    items += [box(36, y, 1048, 84, bg), t(55, y+34, condition, 21, B, True), t(55, y+66, response, 19),
              t(565, y+50, outcome, 22, color, True)]
items += [t(38, 678, "部分响应由事件源映射解释；返回一个同名JSON字段，本身不会改变平台配置。", 21, B, True),
          t(38, 716, "本图来自固定策略参考，不是实际Lambda调用；已有SQLite跨进程批次实验在正文实战末尾。", 18, M)]
save("v26-batch-response-paths", "同样B失败，正常返回与抛异常可能走不同路径", "先核对映射选项，再看handler是否正常返回，最后解释每条消息的确认。", items, 750)

items = [t(38, 131, "32个题设槽位：蓝色空闲，灰色已用；空闲总数16。", 22, B, True)]
for i, free in enumerate([8, 4, 4, 0]):
    x=36+i*274
    items += [box(x, 159, 250, 162), t(x+17, 192, "节点"+str(i+1)+" / 空闲"+str(free), 22, B, True)]
    for j in range(8):
        items += [box(x+17+(j%4)*54, 210+(j//4)*45, 42, 34, B if j<free else "#dbe1ea", B if j<free else L, 4)]
items += [box(36, 366, 1048, 91, "#f9ecec"), t(58, 404, "[8,8]：需要两处各8槽；第二处不存在。", 25, R, True),
          t(58, 439, "借到12份额度，也不会把节点2与3的4+4物理拼成一台。", 21)]
items += [box(36, 481, 1048, 88, "#edf6f3"), t(58, 519, "[8,4,4]：可分别放到节点1、2、3。", 25, G, True),
          t(58, 553, "形状变了，通信/程序结构也可能变；不能只改GPU总数。", 21)]
items += [t(38, 625, "另例[8,4]放任务[4,8]：先贪心占第一台会失败；回溯可把4放第二台。", 21),
          t(38, 681, "有限参考还检查CPU、内存、硬件flavor与同rack硬约束；不是读取真实GPU或运行Kueue。", 18, M)]
save("v26-gpu-shape", "GPU总数够，整组形状仍可能放不下", "额度回答能否占用；放置回答这些节点是否同时满足约束。", items, 720)

winner = next(r["job"] for r in E["programs"]["placement_reservations.py"]["result"]["group_reservation"]["contenders"] if r["result"]=="admitted")
items = [box(36, 126, 1048, 81), t(58, 164, "共同快照：node-1/2各空8，版本均0，额度已用0。", 24, B, True), t(58, 194, "两进程都从这份快照出发；本次先成功者为"+winner+"。", 19)]
for x, label in [(36, "先获得事务锁者"), (584, "后获得事务锁者")]:
    items += [box(x, 247, 500, 234, "#edf6f3" if x==36 else "#fff1e6"), t(x+20, 287, label, 25, B, True)]
items += [t(58, 334, "BEGIN IMMEDIATE → 核对版本0", 21), t(58, 379, "两节点各扣8 + 写整组分配 + 记额度16", 19),
          t(58, 430, "COMMIT：两节点版本都变1", 22, G, True),
          t(606, 334, "等待前一事务释放写锁", 22), t(606, 379, "读到版本1，与快照0不符", 22), t(606, 430, "stale_snapshot；没有部分扣减", 22, R, True)]
items += [box(36, 527, 1048, 120, "#edf2ff"), t(58, 568, "另一次注入：刚扣第一节点就失败 → 事务整体回滚。", 24, B, True),
          t(58, 612, "两节点仍各空8、版本0、额度0、分配表为空；不留下半组预留。", 22)]
items += [t(38, 704, "真实本机两进程与单库事务；箭头是协议顺序，非耗时。不能当作Kubernetes多对象原子提交。", 18, M)]
save("v26-group-reservation", "整组预留要守住不变量，不是先占一点再说", "快照只是一份观察；提交时必须重新校验，失败必须收回已做的局部修改。", items)

items = [box(36, 128, 1048, 473, "#edf2ff"), t(58, 171, "同一宿主、同一用户权限", 24, B, True)]
for x, label, env, fd in [(60, "刻意保留继承的反例", "假环境项：可见", "假文件FD：可读"),
                         (603, "最小启动参数", "假环境项：不可见", "非必需FD：不可读")]:
    items += [box(x, 204, 455, 158), t(x+20, 246, label, 24, B, True), t(x+20, 292, env, 22), t(x+20, 333, fd, 22)]
items += [arrow(286, 374, 430, 432), arrow(831, 374, 681, 432), box(299, 446, 520, 90, "#f9ecec"),
          t(320, 483, "按路径打开同一假文件", 25, R, True), t(320, 520, "两种子进程都能读取", 24, R, True)]
items += [t(58, 575, "关FD、减环境是启动卫生；它们没有改变用户、挂载视图或网络能力。", 21)]
items += [t(38, 651, "真实隔离还要控制：身份 / 文件与挂载 / 系统调用 / 资源 / 网络 / 生命周期。", 23, B, True),
          t(38, 704, "本例只用合成canary。Python本来默认关闭继承；反例显式设置可继承与close_fds=False。", 18, M)]
save("v26-launch-boundary", "启动参数更干净，不等于创建了安全沙箱", "实际子进程证明继承权限减少了什么，也证明同用户路径访问仍然存在。", items)

plt.rcParams.update({"font.family":"Arial Unicode MS", "font.size":14, "svg.fonttype":"path",
                     "figure.facecolor":"#f7f9fd", "axes.facecolor":"#f7f9fd",
                     "axes.labelcolor":D, "text.color":D, "xtick.color":M, "ytick.color":M})
cases=E["programs"]["subprocess_limits.py"]["result"]["cases"]
fig,ax=plt.subplots(figsize=(11.2,6.4),layout="constrained")
x=np.arange(2)
for offset,key,label,color in [(-.2,"child_cpu_seconds","实际子进程CPU时间",B),(.2,"elapsed_wall_seconds","从启动到回收的墙钟时间",G)]:
    bars=ax.bar(x+offset,[cases[k][key] for k in ["cpu","wall"]],.36,color=color,label=label)
    ax.bar_label(bars,fmt="%.3fs",padding=5,fontsize=14)
ax.set_xticks(x,["持续计算：CPU软/硬上限1/2秒", "睡眠等待：就绪后250ms截止+200ms宽限"])
ax.set_ylabel("秒")
ax.set_ylim(0,max(cases[k][v] for k in ["cpu","wall"] for v in ["child_cpu_seconds","elapsed_wall_seconds"])*1.38)
ax.set_title("CPU时间与墙钟时间限制不同\n实际POSIX子进程；两种不同工作，不作性能优劣比较",loc="left",pad=22)
ax.legend(frameon=False,loc="upper right")
ax.spines[["right","top"]].set_visible(False)
ax.grid(axis="y",alpha=.18)
ax.set_axisbelow(True)
fig.text(.03,-.01,"睡眠任务几乎不消耗CPU，仍须墙钟截止；本次忽略TERM后以KILL收回。数值每次会变，不是容器隔离证据。",fontsize=11)
fig.savefig(ROOT/"v26-process-budgets.svg",bbox_inches="tight",metadata={"Date":None})
plt.close(fig)
print("PASS: 5 original mechanism SVGs + 1 Matplotlib actual process-time plot generated.")
