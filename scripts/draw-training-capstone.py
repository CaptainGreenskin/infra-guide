"""Plot actual per-epoch optimizer calls; cumulative values are derived from run logs."""
import json
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
record = json.loads((ROOT/"dist/labs/training-capstone/validation.json").read_text())
plt.rcParams.update({"font.family": "Arial Unicode MS", "svg.fonttype": "path",
                     "font.size": 14, "axes.spines.top": False, "axes.spines.right": False})
fig, axes = plt.subplots(1, 2, figsize=(11.6, 5.5), dpi=110, sharey=True)
fig.patch.set_facecolor("#f7f9fd")
for ax in axes:
    ax.set_facecolor("#f7f9fd")
    ax.set(xticks=range(5), yticks=[0, 8, 16, 24, 32], xlim=(-.2, 4.4), ylim=(-2, 37),
           xlabel="完成的轮次 / epoch")
    ax.grid(axis="y", alpha=.18)
axes[0].set_ylabel("累计实际调用 / 次")

def series(label, initial=0):
    rows = [r for r in record["runs"][label]["records"] if r["event"] == "epoch"]
    x, y = [], []
    value = initial
    for row in rows:
        value += row["applied_optimizer_steps"]
        x.append(row["epoch"]); y.append(value)
    return x, y

x, y = series("full")
axes[0].plot([0]+x, [0]+y, "o-", color="#315dce", linewidth=2.8)
axes[0].set_title("路径 A：连续四轮", loc="left", fontsize=20, pad=15)
x0, y0 = series("split")
x1, y1 = series("resumed", y0[-1])
axes[1].plot([0]+x0, [0]+y0, "o-", color="#b16a17", linewidth=2.8, label="split：本次16次")
axes[1].plot([x0[-1]]+x1, [y0[-1]]+y1, "s--", color="#12725b", linewidth=2.8, label="resumed：本次16次")
axes[1].axvline(2, color="#7f8ba0", linestyle=":")
axes[1].annotate("轮末保存后退出\n新进程读取 next_epoch=2", (2, 16), xytext=(.4, 26),
                 fontsize=13, arrowprops={"arrowstyle": "->", "color": "#56667d"})
axes[1].set_title("路径 B：两轮＋新进程恢复两轮", loc="left", fontsize=20, pad=15)
axes[1].legend(loc="lower right", fontsize=12, frameon=False)
for ax in axes:
    ax.annotate("32次；下一轮索引4", (4, 32), xytext=(2.1, 34.5), fontsize=13, color="#17263e")
fig.text(.045, .07, "本次实测：CPU/Gloo，2 rank；每轮1024样本、8次实际AdamW.step调用。", fontsize=13)
fig.text(.045, .023, "累计值由各轮日志相加，不是检查点中的历史累计字段；两份最终逻辑状态逐项精确相等。", fontsize=12, color="#56667d")
fig.tight_layout(rect=(.015, .13, 1, 1))
fig.savefig(ROOT/"dist/diagrams/v29-training-recovery.svg", bbox_inches="tight", metadata={"Date": None})
plt.close(fig)
