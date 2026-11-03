"""Generate original teaching diagrams and package reproducible numeric experiments."""
from pathlib import Path
from html import escape
import argparse
import datetime
import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile

ROOT=Path(__file__).resolve().parents[1]
LAB=ROOT/'dist/labs/attention'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--verify',action='store_true')
args=parser.parse_args()
digest=hashlib.sha256((LAB/'attention_lab.py').read_bytes()).hexdigest()
if args.verify:
    with tempfile.TemporaryDirectory(prefix='attention-lab-') as temporary:
        output=Path(temporary)/'report.json'
        subprocess.run([sys.executable,str(LAB/'attention_lab.py'),'--output',str(output)],check=True,capture_output=True,text=True,timeout=20)
        report=json.loads(output.read_text())
    assert report['status']=='passed'
    record={'date':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec='seconds'),'source_sha256':digest,'report':report}
    (LAB/'validation.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
else:
    record=json.loads((LAB/'validation.json').read_text())
    assert record['source_sha256']==digest,'Changed experiment requires --verify'
files={name:(LAB/name).read_text() for name in ['attention_lab.py','README.md','validation.json']}
(ROOT/'dist/attention-files.js').write_text('const attentionLabFiles='+json.dumps(files,ensure_ascii=False)+';\nconst attentionValidation='+json.dumps(record,ensure_ascii=False)+';\n')
with zipfile.ZipFile(ROOT/'dist/labs/attention-mechanics.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for name in files:archive.write(LAB/name,name)

def text(x,y,value,size=16,color='#203553',bold=False):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{600 if bold else 400}">{escape(value)}</text>'
def box(x,y,w,h,title,sub):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="white" stroke="#ccd8eb"/>'+text(x+18,y+30,title,17,bold=True)+text(x+18,y+56,sub,14,'#61748e')
def arrow(x1,y1,x2,y2):
    return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="#315dce" stroke-width="2" marker-end="url(#a)"/>'
def save(name,title,desc,body,height):
    s=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 {height}" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc><defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#315dce"/></marker></defs><style>text{{font-family:"PingFang SC","Noto Sans SC",sans-serif}}</style><rect width="960" height="{height}" rx="12" fill="#f6f8fc"/>'+text(30,30,'INFRAGUIDE / FOLLOW ONE TRAINING STEP',11,'#315dce')+text(30,68,title,23,bold=True)+body+'</svg>'
    (ROOT/'dist/diagrams'/f'{name}.svg').write_text(s)
body=box(30,105,420,82,'① 输入与右移标签','tokens [B, T] → targets [B, T]')+box(510,105,420,82,'② Embedding + 位置信息','隐藏状态 X：[B, T, d_model]')+arrow(450,146,510,146)
body+=box(510,235,420,82,'③ Attention / FFN / 残差与归一化','堆叠多层；隐藏状态仍为 [B, T, d_model]')+arrow(720,187,720,235)
body+=box(30,235,420,82,'④ 输出投影 → logits','[B, T, vocab_size]；每个位置预测下一 token')+arrow(510,276,450,276)
body+=box(30,365,420,82,'⑤ 有效位置的 loss','忽略 padding；明确总 token 分母')+box(510,365,420,82,'⑥ 反向 → 梯度同步 → 参数更新','梯度与优化器状态也占显存')+arrow(240,317,240,365)+arrow(450,406,510,406)
body+=text(32,497,'工程对应：CPU与存储负责供给；GPU执行算子；网络同步梯度；检查点保存可恢复状态。',16)
body+=text(32,531,'图示为常见 decoder-only 自回归训练路径；并非所有模型都采用相同结构。',14,'#61748e')
save('token-training-step','一次训练：把张量形状连到系统职责','从token、embedding和Transformer层，到logits、loss、反向和分布式更新的逻辑路径。',body,560)
body=text(32,107,'行是正在计算的 query 位置；列是可读取的 key / value 位置。',16)
for i in range(4):
    body+=text(55,178+i*66,'位置 '+str(i),16)
    body+=text(185+i*112,143,str(i),16)
    for j in range(4):
        fill='#dbe6fc' if j<=i else '#e9edf3'
        body+=f'<rect x="{150+j*112}" y="{155+i*66}" width="100" height="54" rx="5" fill="{fill}"/>'
        body+=text(166+j*112,188+i*66,'可读取' if j<=i else '屏蔽',16,'#315dce' if j<=i else '#7e8da2')
body+=box(640,155,288,87,'训练 / Prefill','整段输入已知，可并行处理')
body+=box(640,274,288,87,'Decode','新query读取历史KV与当前KV')
body+=text(35,475,'未来位置权重应为0；softmax只在允许的位置归一化。',17,bold=True)
body+=text(35,512,'标签在训练前已知，因此能并行计算多个位置的预测；生成时下一个输入尚未确定。',15,'#61748e')
save('causal-attention-map','训练可以并行，为什么生成通常要逐步继续？','四个位置的下三角因果可见性与训练、prefill、decode关系。',body,548)
print('PASS: attention and normalization evidence; 2 diagrams; 3-file experiment package.')
