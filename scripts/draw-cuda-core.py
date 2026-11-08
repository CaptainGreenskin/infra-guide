"""Original source-bound CUDA data maps; these are not device observations."""
from pathlib import Path
from html import escape
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
SOURCE=hashlib.sha256((ROOT/'dist/labs/cuda-core/cuda_lab.cu').read_bytes()).hexdigest()
class SVG:
 def __init__(self,h,title,desc):
  self.items=[f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{h}" viewBox="0 0 1120 {h}" role="img" aria-labelledby="title desc">',f'<title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc>', '<style>text{font-family:"PingFang SC","Microsoft YaHei",sans-serif}</style>',f'<rect width="1120" height="{h}" fill="#fff"/>']
 def text(self,x,y,t,size=24,color='#1c283d',weight=400,anchor='start'):
  self.items.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(t))}</text>')
 def box(self,x,y,w,h,fill='#f3f5fa'):
  self.items.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="#dce3ed"/>')
 def line(self,x,y,x2,y2):self.items.append(f'<path d="M{x} {y} L{x2} {y2}" fill="none" stroke="#315dce" stroke-width="2"/>')
 def save(self,name,meta):
  meta.update(source_sha256=SOURCE,device_execution=False)
  self.items.append('<metadata>'+escape(json.dumps(meta,ensure_ascii=False))+'</metadata>')
  (ROOT/'dist/diagrams'/f'{name}.svg').write_text('\n'.join(self.items+['</svg>']))

def rows():
 s=SVG(665,'一行257列如何交给256个线程','每行一个线程块。第0线程读取第0和256列，其余各读一列，块内共享内存经过8轮树形合并。')
 s.text(32,48,'同一行的数据怎样变成一个输出',32,weight=650)
 s.text(32,89,'257 列，256 个线程；图示一行，其他行由别的块独立处理。',23,'#66738a')
 cols=[('x[0]','x[256]','线程 0','两项局部和'),('x[1]','—','线程 1','一项局部和'),('x[2]','—','线程 2','一项局部和'),('…','…','…','…'),('x[255]','—','线程 255','一项局部和')]
 for i,(a,b,t,c) in enumerate(cols):
  x=32+i*214;s.box(x,122,194,82,'#eaf0ff');s.text(x+97,155,a,25,anchor='middle');s.text(x+97,186,b,22,'#66738a',anchor='middle');s.line(x+97,204,x+97,234)
  s.box(x,234,194,92);s.text(x+97,269,t,25,weight=550,anchor='middle');s.text(x+97,304,c,21,'#66738a',anchor='middle');s.line(x+97,326,x+97,356)
 s.box(32,356,1050,69,'#edf6f2');s.text(557,386,'partial[0…255]：每个线程写自己的位置',26,'#287b69',550,'middle');s.text(557,413,'屏障：写齐以后，才让其他线程读取',21,'#287b69',anchor='middle')
 s.line(557,425,557,451);s.box(185,451,744,80);s.text(557,484,'128 → 64 → 32 → 16 → 8 → 4 → 2 → 1',27,'#315dce',550,'middle');s.text(557,516,'每轮部分线程相加，全部线程经过屏障',22,anchor='middle');s.line(557,531,557,551)
 s.box(383,551,348,57,'#eaf0ff');s.text(557,589,'线程 0 写 y[row]',27,'#315dce',550,'middle');s.text(32,646,'5 列时，多余线程贡献 0；它们仍参与每一轮屏障。',23,'#66738a')
 s.save('v64-cuda-row',{'kind':'source_mapping','rows':3,'cols':257,'threads':256,'shared_bytes':1024,'reduction_rounds':8})

def tiles():
 s=SVG(750,'分块矩阵乘法的两类尾部','M17 K19 N13；输出需要两个16乘16线程块，K轴分成16和3两轮，无效装载为0，所有线程都经过两道屏障。')
 s.text(32,48,'尾部没有数据，线程仍要参加同步',32,weight=650);s.text(32,89,'A[17,19] × B[19,13] → C[17,13]；块为 16×16 线程。',23,'#66738a')
 # Actual output valid-region ratio within a 16x16 two-block allocation.
 x,y,w,cell=52,140,256,16
 s.box(x-16,y-16,w+32,32*cell+32)
 for r in range(32):
  for c in range(16):
   color='#dce8ff' if r<17 and c<13 else '#f0f2f6'
   s.items.append(f'<rect x="{x+c*cell}" y="{y+r*cell}" width="16" height="16" fill="{color}" stroke="#fff"/>')
 s.items.append(f'<line x1="{x}" y1="{y+256}" x2="{x+w}" y2="{y+256}" stroke="#315dce" stroke-width="3"/>')
 s.text(335,249,'块 (0,0)',23,'#315dce',550);s.text(335,282,'16 行 × 13 列有效',21)
 s.text(335,461,'块 (0,1)',23,'#315dce',550);s.text(335,494,'仅第 17 行有效',21)
 s.text(52,692,'蓝色：写回；灰色：不写回',22,'#66738a')
 s.text(580,145,'每个块沿 K 做两轮',27,'#315dce',550)
 for i,(label,width) in enumerate([('第 1 轮：K=0…15',16),('第 2 轮：K=16…18',3)]):
  yy=181+i*130;s.text(580,yy,label,23)
  for c in range(16):
   s.box(580+c*29,yy+17,27,42,'#dce8ff' if c<width else '#f0f2f6')
  s.text(580,yy+89,'有效 '+str(width)+' 项；其余补 0',21,'#66738a')
 s.box(568,447,505,189,'#edf6f2')
 for i,t in enumerate(['① 协作装载 A/B 片块 → 屏障','② 每线程累加 16 项乘加 → 屏障','③ 再装载下一片块','④ 最后按输出行列判界写回']):s.text(589,486+i*41,t,22,'#287b69')
 s.text(568,692,'两片共享内存：2×16²×4 = 2048 B',23,'#66738a')
 s.save('v64-cuda-tiles',{'kind':'source_mapping','m':17,'k':19,'n':13,'tile':16,'grid':[1,2],'valid_k_per_round':[16,3],'shared_bytes':2048})
rows();tiles()
