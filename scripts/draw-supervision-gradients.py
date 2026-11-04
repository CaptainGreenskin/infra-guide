"""Original explanatory SVGs; numeric gradient values come from the CPU record."""
from html import escape
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist/diagrams"
RECORD = json.loads((ROOT / "dist/labs/supervision-gradients/validation.json").read_text())
BLUE, GREEN, INK, MUTED = "#315dce", "#287b69", "#1c283d", "#6b768b"


class SVG:
    def __init__(self, height, title, description):
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img" aria-labelledby="title desc">',
                      '<title id="title">'+escape(title)+'</title><desc id="desc">'+escape(description)+'</desc>',
                      '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9" fill="#6b768b"/></marker></defs>',
                      '<style>text{font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif}</style>',
                      f'<rect width="1120" height="{height}" fill="white"/>']

    def text(self, x, y, text, size=24, color=INK, weight=400, anchor="start"):
        self.parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(text))}</text>')

    def box(self, x, y, w, h, fill="#f2f5fa", stroke="#e4e9f0"):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')

    def arrow(self, x1, y1, x2, y2):
        self.parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{MUTED}" stroke-width="2.5" marker-end="url(#arrow)"/>')

    def save(self, name, metadata):
        self.parts.append('<metadata>'+escape(json.dumps(metadata, ensure_ascii=False))+'</metadata>')
        (OUT/(name+'.svg')).write_text('\n'.join(self.parts+['</svg>']))


def alignment():
    s = SVG(790, '标签从完整序列的后一格取得', '两条玩具序列共六项有效目标；EOS是有效目标，填充目标改为忽略。输入键标记与监督位置不是一回事。')
    s.text(32, 46, '同一位置：输入当前符号，监督下一个符号', 32, weight=650)
    s.text(32, 85, '输入 s[:-1]；目标 s[1:]。本图沿用本章人工词表，不是通用分词规则。', 22, MUTED)
    groups = [
        (130, '“云端云端算” → [1,5,5,6,2]', ['1 · BOS','5 · 云端','5 · 云端','6 · 算'], ['5 · 云端','5 · 云端','6 · 算','2 · EOS'], [True]*4),
        (423, '“云”补齐后 → [1,3,2,0,0]', ['1 · BOS','3 · 云','2 · EOS','0 · PAD'], ['3 · 云','2 · EOS','忽略','忽略'], [True,True,False,False])]
    for top, title, inputs, targets, valid in groups:
        s.text(32, top, title, 27, BLUE, 600)
        s.text(32, top+71, '模型输入', 24)
        s.text(32, top+171, '预测目标', 24)
        for i in range(4):
            x = 254+i*204
            s.text(x+89, top+30, '位置 '+str(i), 20, MUTED, anchor='middle')
            s.box(x, top+45, 178, 58, '#edf2fe' if inputs[i]!='0 · PAD' else '#f2f5fa')
            s.text(x+89, top+82, inputs[i], 25, BLUE if inputs[i]!='0 · PAD' else MUTED, anchor='middle')
            s.arrow(x+89, top+109, x+89, top+133)
            s.box(x, top+145, 178, 58, '#edf7f3' if valid[i] else '#f2f5fa', GREEN if valid[i] else '#e4e9f0')
            s.text(x+89, top+182, targets[i], 25, GREEN if valid[i] else MUTED, anchor='middle')
        s.text(254, top+242, '有效目标：4 项' if top==130 else '有效目标：2 项；输入键标记仍是 [真,真,真,假]', 23, GREEN)
    s.text(32, 722, '损失分母是 4+2=6，不是矩形的 2×4=8；两个真实 EOS 都要学习。', 25, weight=600)
    s.text(32, 765, '第二行位置 2 可作为输入键，却没有真实的下一格标签：两种掩码不能互相替代。', 22, MUTED)
    s.save('v34-label-alignment', {'kind':'declared_toy_vocabulary', 'inputs':RECORD['observed']['inputs'], 'targets':RECORD['observed']['targets'], 'valid_targets':6, 'rectangle_positions':8})


def shared():
    observed = RECORD['observed']
    gradient = observed['observed_gradients']['joint'][0]
    after = observed['pad_row_after_sgd']
    s = SVG(770, '共享词表的两条梯度路径', '实际CPU梯度账本：padding查表路径对第0行无贡献，输出投影仍有贡献；普通SGD后第0行变化。')
    s.text(32, 46, '同一张词表用了两次，梯度也要收两路', 32, weight=650)
    s.text(32, 85, '本例 H=E[id]/2，六项有效目标等权；没有注意力或位置编码。', 22, MUTED)
    s.box(350, 116, 420, 68, '#edf2fe', BLUE)
    s.text(560, 160, '同一个参数 E：[8,2]', 28, BLUE, 600, 'middle')
    s.arrow(440, 190, 284, 230); s.arrow(680, 190, 836, 230)
    for x, title, first, second in [
        (32, '输入查表路径', 'H=Embedding(ids)/2', '第 0 行梯度 = [0,0]'),
        (592, '输出打分路径', 'logits=H×Eᵀ', '第 0 行梯度 ≈ [0.029895,0.027481]')]:
        s.box(x, 242, 496, 151, 'white')
        s.text(x+24, 282, title, 27, BLUE, 600)
        s.text(x+24, 326, first, 25)
        s.text(x+24, 369, second, 22, GREEN)
    s.arrow(280, 402, 420, 453); s.arrow(840, 402, 700, 453)
    s.box(244, 465, 632, 91, '#edf7f3', GREEN)
    s.text(560, 500, '对同一参数逐元素相加', 25, GREEN, 600, 'middle')
    s.text(560, 538, 'dE[0] ≈ [0.029895,0.027481]', 27, GREEN, 600, 'middle')
    s.arrow(560, 564, 560, 595)
    s.box(244, 607, 632, 63, '#edf7f3', GREEN)
    s.text(560, 647, 'SGD，lr=0.1 → E[0] ≈ [−0.002990,−0.002748]', 24, GREEN, 600, 'middle')
    s.text(32, 714, 'padding_idx 只约束查表反向；没有冻结共享参数的输出用途。', 24, weight=600)
    s.text(32, 753, '程序另用上游全 1 的 PAD 查表验证零梯度，并逐项比较手算、自动求导和中心差分。', 21, MUTED)
    s.save('v34-shared-embedding-grad', {'kind':'actual_cpu_autograd_and_sgd', 'padding_row':0, 'gradient':gradient, 'after_sgd':after, 'learning_rate':0.1, 'torch':observed['torch']})


def denominators():
    s = SVG(670, '微批均值与有效目标均值', '独立标量平方损失：第一批一项、第二批三项。全目标等权梯度为负1.25，均值再平均为负0.5。')
    s.text(32, 46, '四个有效位置，为什么两批均值不能直接平均', 31, weight=650)
    s.text(32, 85, '另一个独立例子：w=1，每项损失 (w−y)²/2；不是上图的六项交叉熵。', 22, MUTED)
    s.text(32, 139, '目标 y', 24, weight=600)
    s.text(32, 219, '单项梯度 w−y', 24)
    s.text(32, 319, '四项等权', 25, GREEN, 600)
    s.text(32, 354, '每项权重', 22, MUTED)
    s.text(32, 451, '两批均值等权', 25, '#a84444', 600)
    s.text(32, 486, '每项权重', 22, MUTED)
    for i, (target, gradient) in enumerate([(0,1),(3,-2),(3,-2),(3,-2)]):
        x = 270+i*198
        s.box(x, 108, 174, 55, '#edf2fe' if i==0 else '#edf7f3')
        s.text(x+87, 145, target, 27, BLUE if i==0 else GREEN, 600, 'middle')
        s.text(x+87, 219, gradient, 27, anchor='middle')
        s.box(x, 285, 174, 90, '#edf7f3')
        s.text(x+87, 342, '1/4', 29, GREEN, 600, 'middle')
        s.box(x, 417, 174, 90, '#fff4f0')
        s.text(x+87, 474, '1/2' if i==0 else '1/6', 29, '#a84444', 600, 'middle')
    s.text(270, 258, '第 0 批：1 项', 21, BLUE)
    s.text(540, 258, '第 1 批：3 项', 21, GREEN)
    s.text(32, 562, '正确目标：(1−2−2−2)/4 = −1.25 → SGD 后 w=1.125', 25, GREEN, 600)
    s.text(32, 604, '另一目标：(1−2)/2 = −0.5 → SGD 后 w=1.05', 25, '#a84444', 600)
    s.text(32, 650, '同样 lr=0.1、窗口内参数不变；这不是随机误差，而是每项权重发生了变化。', 22, MUTED)
    s.save('v34-microbatch-denominators', {'kind':'actual_scalar_autograd_with_declared_inputs', 'counts':[1,3], 'initial_w':1, 'per_item_gradients':[1,-2,-2,-2], 'observed':RECORD['observed']['unequal_supervision']})


if __name__ == '__main__':
    alignment(); shared(); denominators()
    print('Wrote three original supervision and gradient diagrams.')
