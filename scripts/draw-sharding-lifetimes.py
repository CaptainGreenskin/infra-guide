"""Original time/state matrix for the two-layer manual sharding example."""
from pathlib import Path
import html
import json

phases = ['前向 W₁', '前向 W₂', '反向 W₂', '反向 W₁', '本地更新']
full = [24, 18, 18, 24, 0]
owned_gradient = [0, 0, 9, 21, 21]
momentum = [0, 0, 0, 0, 21]
data = dict(full_parameter_elements=42, ranks=2, owned_parameters=21,
            full_weight_during_phase=full, owned_gradient_after_phase=owned_gradient,
            first_step_momentum_after_phase=momentum, measured_gpu_memory=False)
out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 820" role="img" aria-labelledby="title desc">',
       '<title id="title">两层分片训练：长期持有与临时使用</title>',
       '<desc id="desc">沿前向第一层、前向第二层、反向第二层、反向第一层与更新，比较临时完整权重和本地参数、梯度、动量的逻辑元素数。</desc>',
       '<metadata>'+html.escape(json.dumps(data, ensure_ascii=False))+'</metadata>',
       '<rect width="1120" height="820" rx="12" fill="#f8fafc"/>',
       '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">',
       '<text x="42" y="47" font-size="27" font-weight="650" fill="#20314e">参数分片后，为什么还需要临时完整权重？</text>',
       '<text x="42" y="82" font-size="19" fill="#536783">W₁ 为 4×6，W₂ 为 6×3；2 个进程分别负责 21 个参数。</text>']

def text(x, y, value, size=21, color='#20314e', weight='400'):
    out.append(f'<text x="{x}" y="{y}" text-anchor="middle" font-size="{size}" font-weight="{weight}" fill="{color}">{html.escape(str(value))}</text>')

xs = [340+165*i for i in range(5)]
for i, phase in enumerate(phases):
    text(xs[i], 151, phase, 22, '#234d9f', '600')
    if i < 4:
        out.append(f'<path d="M{xs[i]+66} 143h27l-7 -5m7 5l-7 5" stroke="#7590bd" fill="none" stroke-width="2"/>')
rows = [
    (184, '计算期间', '取齐的完整权重', full, '#fff3db', '#8a5a16'),
    (300, '本进程长期负责', '参数片', [21]*5, '#e9f0ff', '#234d9f'),
    (416, '此阶段结束后', '已有的本地梯度', owned_gradient, '#edf6f0', '#25654b'),
    (532, '首次更新结束后', 'SGD 动量', momentum, '#f0edfa', '#64408d'),
]
for top, label, sub, values, fill, ink in rows:
    out.append(f'<rect x="30" y="{top}" width="1060" height="102" rx="8" fill="{fill}"/>')
    text(145, top+35, label, 19, ink)
    text(145, top+68, sub, 20, ink, '600')
    for x, value in zip(xs, values):
        text(x, top+59, value, 28, ink, '650')
out += [
 '<text x="42" y="679" font-size="20" fill="#20314e">读图：先问“长期负责多少”，再问“这一刻还额外拿了什么”。</text>',
 '<text x="42" y="716" font-size="18" fill="#536783">完整权重用于当前层计算，随后释放；反向所需激活与通信缓冲另记。</text>',
 '<text x="42" y="750" font-size="18" fill="#536783">图为逻辑元素数。实验另保留完整参考模型，不把总内存解释为分片显存。</text>',
 '<text x="42" y="784" font-size="18" fill="#536783">SGD 只有一份动量；正文的 Adam 预算另含两份动量，二者不混算。</text>',
 '</g></svg>'
]
path = Path(__file__).resolve().parent.parent/'dist/diagrams/sharding-lifetimes.svg'
path.write_text('\n'.join(out)+'\n')
print('Drew one sharding lifetime matrix with source-matched shapes and element counts.')
