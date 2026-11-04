"""Original mechanism SVGs and Matplotlib plots, drawn from the recorded run."""
from html import escape
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE / "dist/diagrams"
E = json.loads((BASE / "dist/labs/config-memory-evaluation/validation.json").read_text())
B, D, M, L, G, R = "#315dce", "#17263e", "#56667d", "#ccd8e8", "#12725b", "#b53e3e"


def t(x, y, value, size=20, color=D, bold=False):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{700 if bold else 400}">{escape(str(value))}</text>'


def box(x, y, w, h, fill="#fff", stroke=L):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}"/>'


def arrow(x1, y1, x2, y2):
    return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{B}" stroke-width="3" marker-end="url(#arrow)"/>'


def save(name, title, subtitle, items, height=730):
    (ROOT / (name + ".svg")).write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img">'
        f'<title>{escape(title)}</title><desc>{escape(subtitle)}</desc>'
        '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#315dce"/></marker></defs>'
        '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">'
        + box(1, 1, 1118, height-2, "#f7f9fd") + t(36, 49, title, 28, D, True)
        + t(36, 85, subtitle, 18, M) + "".join(items) + '</g></svg>\n')


items = [t(38, 132, "两份真正发布过的配置", 22, B, True)]
for x, label, values in [(36, "v1", "pool=4 / timeout_ms=100"), (584, "v2", "pool=6 / timeout_ms=50")]:
    items += [box(x, 155, 500, 91), t(x+20, 191, label, 25, B, True), t(x+20, 227, values, 24)]
items += [box(36, 287, 1048, 113, "#f9ecec"), t(58, 324, "错误读取：先读pool，再换路径，再读timeout_ms", 24, R, True),
          t(58, 370, "得到4 / 50：这组参数从未作为一个版本发布。", 25, R, True)]
items += [box(36, 438, 500, 145, "#edf6f3"), t(58, 476, "完整读取 + 校验 + 发布引用", 24, G, True),
          t(58, 520, "新请求拿到完整v2：6 / 50", 24), t(58, 559, "在途请求仍持有完整v1：4 / 100", 22)]
items += [box(584, 438, 500, 145), t(606, 476, "路径与已打开文件不是同一事实", 23, B, True),
          t(606, 520, "旧FD读到v1；重新打开路径读到v2", 22), t(606, 559, "文件已更新，内存仍需主动重载。", 22)]
items += [t(38, 634, "候选失败：保留v2，不发布半份对象。回退旧业务值：发布新代际7。", 23, B, True),
          t(38, 686, "实际POSIX文件/进程夹具；不是Kubernetes投射实现。两份版本目录在实验内保留。", 18, M)]
save("v25-config-snapshot", "配置快照：一次切换，不等于多次读取属于同一版", "先理解文件、内存对象和请求各持有什么，再设计热加载。", items)

items = []
steps = [("① 启用新凭据", "服务端接受v1、v2", "旧客户端仍用v1"),
         ("② 探测并切换", "v2新认证200", "客户端重载后用v2"),
         ("③ 撤销旧凭据", "v1新认证401 / v2仍200", "旧会话在本协议下仍200"),
         ("④ 独立处理旧会话", "撤销该会话后401", "按服务协议核对退出条件")]
for i, (title, server, client) in enumerate(steps):
    y = 130 + i*120
    items += [box(36, y, 1048, 94, "#edf6f3" if i in [1, 3] else "#fff"),
              t(58, y+37, title, 23, B, True), t(342, y+37, server, 22), t(342, y+75, client, 22)]
    if i < 3:
        items += [arrow(178, y+98, 178, y+116)]
items += [t(38, 647, "反例：先撤v1，客户端还没重载 → 401；重载v2后才恢复200。", 23, R, True),
          t(38, 693, "本机HTTP实测。会话与签发凭据独立撤销是此夹具协议，不能推广到所有身份服务。", 18, M)]
save("v25-credential-overlap", "轮换顺序：新凭据可用，旧客户端退出，再撤销", "源文件更新、客户端缓存、服务端接受版本和既有会话分别验证。", items)

# Standard plotting tools for quantitative plots. Font outlines keep Chinese portable in SVG.
plt.rcParams.update({"font.family": "Arial Unicode MS", "font.size": 13, "svg.fonttype": "path",
                     "axes.labelcolor": D, "text.color": D, "xtick.color": M, "ytick.color": M,
                     "figure.facecolor": "#f7f9fd", "axes.facecolor": "#f7f9fd"})
data = E["programs"]["tensor_state_bytes.py"]["result"]
stages = ["created", "after_backward", "after_first_step", "after_zero_grad_none", "after_second_step"]
labels = ["刚创建", "首次反向后", "首次更新后", "清梯度后", "再次更新后"]
fig, ax = plt.subplots(figsize=(11.2, 7.2), layout="constrained")
x = np.arange(5)
for offset, mode, color, label in [(-.21, "fp32_autocast_bf16", B, "FP32参数 + BF16 autocast"),
                                  (.21, "bf16_parameters", G, "直接BF16参数（用于观察dtype）")]:
    values = [data["modes"][mode]["stages"][s]["total_retained_payload_bytes"] for s in stages]
    bars = ax.bar(x+offset, values, .38, color=color, label=label)
    ax.bar_label(bars, padding=4, fontsize=12)
ax.set_xticks(x, labels)
ax.set_ylim(0, 1170)
ax.set_ylabel("保留的参数、梯度、moment与step标量（字节）")
ax.set_title("状态随阶段变化；autocast没有把FP32状态全部变成BF16\n实际CPU / PyTorch 2.5.1 / 58个参数元素、4个参数张量", loc="left", pad=20)
ax.legend(loc="upper left", frameon=False)
ax.spines[["right", "top"]].set_visible(False)
ax.grid(axis="y", alpha=.18)
ax.set_axisbelow(True)
fig.text(.03, -.015, "只数保留张量载荷；不含激活/临时区，不是GPU峰值、allocator reserved或CPU RSS。", fontsize=12)
fig.savefig(ROOT / "v25-state-payload.svg", bbox_inches="tight", metadata={"Date": None})
plt.close(fig)

record = E["programs"]["checkpoint_saved_tensors.py"]["result"]
items = [t(38, 130, "相同输入 → 三个相同Block → 相同损失；复制权重后对照", 22, B, True)]
for x0, label, key, fill in [(36, "普通反向", "normal", "#fff"), (584, "非重入重计算", "checkpointed", "#edf6f3")]:
    r = record[key]
    items += [box(x0, 157, 500, 337, fill), t(x0+20, 199, label, 25, B, True),
              t(x0+20, 251, "前向结束：保存供反向使用的", 22), t(x0+20, 289, "非参数底层存储，已去重", 22),
              t(x0+20, 348, str(r["unique_non_parameter_saved_storage_bytes"])+" 字节", 37, G if key=="checkpointed" else B, True),
              t(x0+20, 406, "前向入口计数："+str(r["forward_calls"]), 22),
              t(x0+20, 451, "反向后入口计数："+str(r["total_calls_after_backward"]), 22)]
items += [box(36, 533, 1048, 104, "#edf2ff"), t(58, 572, "本次输出最大误差0；参数及输入梯度最大误差0。", 25, B, True),
          t(58, 612, "入口多调用一次 ≠ 每块完整重跑两遍 ≠ 步耗时两倍。非重入重算可提前停止。", 20)]
items += [t(38, 692, "实际CPU saved-tensor hook观察；不是整步峰值或RSS。本例无dropout，未检验随机状态兼容。", 18, M)]
save("v25-checkpoint-storage", "重计算少保存了什么？先观察对象，再测整步峰值", "activation checkpoint管理前向中间状态；持久化checkpoint管理故障后的训练恢复。", items)

stats = E["programs"]["evaluation_statistics.py"]["result"]
intervals = stats["wilson_95_examples"]
rows = [intervals["five_of_five"], intervals["hundred_of_hundred"]]
fig, ax = plt.subplots(figsize=(11.2, 6.2), layout="constrained")
for y, row in enumerate(rows):
    ax.errorbar(row["observed"]*100, y, xerr=[[(row["observed"]-row["lower"])*100], [(row["upper"]-row["observed"])*100]],
                fmt="o", color=B if y==0 else G, capsize=9, linewidth=4, markersize=10)
    ax.text(row["lower"]*100, y+.24, f"下界 {row['lower']*100:.2f}%", fontsize=16, ha="left")
ax.set_yticks([0, 1], ["5/5，观察到100%", "100/100，观察到100%"])
ax.set_xlim(0, 105)
ax.set_ylim(-.45, 1.6)
ax.invert_yaxis()
ax.set_xlabel("Wilson 95%区间（%）")
ax.set_title("全对也有不确定性：小样本的区间更宽\n合成计数演示；假设各次观察独立、同一二项机制", loc="left", pad=20)
ax.spines[["right", "top"]].set_visible(False)
ax.grid(axis="x", alpha=.18)
fig.text(.03, -.015, "这是区间方法示意，不是真实Agent成绩；频率学区间不能解释为本次真实成功率有95%概率落在区间内。", fontsize=11)
fig.savefig(ROOT / "v25-wilson-counts.svg", bbox_inches="tight", metadata={"Date": None})
plt.close(fig)

cells = stats["paired_comparison"]["cells"]
items = [t(383, 132, "B通过", 25, B, True), t(753, 132, "B失败", 25, B, True),
         t(40, 228, "A通过", 25, B, True), t(40, 365, "A失败", 25, B, True)]
for x0, y, n, label, fill in [(270, 159, cells["both_pass"], "两者都通过", "#edf6f3"),
                             (640, 159, cells["a_only"], "仅A通过", "#fff1e6"),
                             (270, 296, cells["b_only"], "仅B通过", "#edf2ff"),
                             (640, 296, cells["both_fail"], "两者都失败", "#f9ecec")]:
    items += [box(x0, y, 328, 112, fill), t(x0+23, y+48, n, 38, B, True), t(x0+87, y+48, label, 23)]
items += [t(38, 469, "A=18/25=72%；B=20/25=80%；差8个百分点。", 25, B, True),
          t(38, 516, "成对信息在2与4这两格：6个变化中，B方向占4个。", 24),
          t(38, 563, "双侧精确二项检验：2×(1+6+15)/64 = 0.6875。", 24),
          t(38, 616, "尚不足以据此宣布普遍改进；p大也不证明两版本等价。", 23, R, True),
          t(38, 685, "固定CSV标签，不是模型运行。独立题对与零假设下方向可交换，是此示例的统计条件。", 18, M)]
save("v25-paired-outcomes", "相同25题：别只对比72%和80%", "同一道题必须配对；边际区间是否重叠，不能替代成对检验。", items)
print("PASS: 4 original mechanism SVGs + 2 Matplotlib quantitative SVG plots generated from recorded results.")
