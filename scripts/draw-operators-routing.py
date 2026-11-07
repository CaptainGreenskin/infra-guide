"""Original numerical maps and actual CPU timeline, derived from the recorded experiments."""
from html import escape
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
RECORD=json.loads((ROOT/'dist/labs/operators-routing/validation.json').read_text())
OUT=ROOT/'dist/diagrams'
BLUE,GREEN,RED,INK,MUTED='#315dce','#287b69','#ad5147','#1c283d','#66738a'
class SVG:
    def __init__(self,h,title,desc):
        self.parts=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 {h}" width="1120" height="{h}" role="img" aria-labelledby="title desc">',
                    '<title id="title">'+escape(title)+'</title><desc id="desc">'+escape(desc)+'</desc>',
                    '<style>text{font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif}</style>',f'<rect width="1120" height="{h}" fill="white"/>']
    def text(self,x,y,value,size=24,color=INK,weight=400,anchor='start'):
        self.parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(value))}</text>')
    def box(self,x,y,w,h,fill='#f3f5fa',stroke='#dce3ed'):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="{fill}" stroke="{stroke}"/>')
    def line(self,x,y,x2,y2,color='#dce3ed'):
        self.parts.append(f'<line x1="{x}" y1="{y}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="2"/>')
    def title(self,t,sub):self.text(32,48,t,32,weight=650);self.text(32,89,sub,22,MUTED)
    def save(self,name,meta):
        self.parts.append('<metadata>'+escape(json.dumps(meta,ensure_ascii=False))+'</metadata>')
        (OUT/(name+'.svg')).write_text('\n'.join(self.parts+['</svg>']))

def softmax():
    r=RECORD['programs']['operator_lab.py']['softmax']
    s=SVG(530,'softmax先减最大值，再取指数','实际C程序输入1000、1001、1002，平移后计算稳定输出；NaN和无穷不在本例契约内。')
    s.title('共同偏移很大，真正需要的是相对差','float64；每行归一化，输入必须有限。')
    labels=['输入x','减去最大值1002','指数','除以指数和']
    rows=[['1000','1001','1002'],['−2','−1','0'],['0.135335','0.367879','1'],[f'{v:.6f}' for v in r['output'][0]]]
    for i,(label,values) in enumerate(zip(labels,rows)):
        y=125+i*78;s.text(32,y+37,label,23,BLUE,550)
        for j,value in enumerate(values):
            x=330+j*245;s.box(x,y,215,58,'#edf6f2' if i==3 else '#f3f5fa');s.text(x+107,y+38,value,27,GREEN if i==3 else INK,550,'middle')
    s.text(32,480,'对照：直接exp(1000)溢出；平移后比例不变，逐项参考与行和同时检查。',23,RED)
    s.save('v46-softmax-shift',{'kind':'actual_softmax','result':r,'source_sha256':RECORD['source_sha256']['cpu_ops.c']})

def reduction():
    r=RECORD['programs']['operator_lab.py']['reduce'];s=SVG(560,'浮点求和改变顺序就可能改变结果','相同输入一万万亿、1、负一万万亿、1，左折叠1，两两树形0，高精度参考2。')
    s.title('同一份输入，三种结果','[10¹⁶, 1, −10¹⁶, 1]；float64每次加法都会舍入。')
    columns=[(32,'从左向右',['10¹⁶ + 1 → 10¹⁶','再加 −10¹⁶ → 0','再加 1 → 1'],r['left_fold'],BLUE),
             (402,'本例两两树形',['10¹⁶ + 1 → 10¹⁶','−10¹⁶ + 1 → −10¹⁶','两项相加 → 0'],r['tree'],RED),
             (772,'高精度参考',['math.fsum','保留多个部分和','本例数学和为2'],r['high_accuracy_reference'],GREEN)]
    for x,label,steps,value,color in columns:
        s.box(x,128,316,322);s.text(x+20,169,label,27,color,600)
        for j,t in enumerate(steps):s.text(x+20,222+j*49,t,22)
        s.text(x+158,414,f'{value:g}',48,color,650,'middle')
    s.text(32,500,'树形有利于并行，不保证比每一种顺序都更准确；误差容限与累加精度须明示。',23,MUTED)
    s.save('v46-reduction-order',{'kind':'actual_reduction','result':r,'source_sha256':RECORD['source_sha256']['cpu_ops.c']})

def gemm():
    r=RECORD['programs']['operator_lab.py']['gemm_shapes'][0];s=SVG(640,'矩阵乘法的行主序与访问路径','2×3乘3×4；同一C00为2.375，ijk读取B列跨4元素，ikj访问B行连续4元素。')
    s.title('先算同一个输出，再比较访问顺序','A[2,3] × B[3,4] → C[2,4]；连续行主序，每元素8字节。')
    s.text(32,145,'B的行列与线性偏移',25,BLUE,600)
    vals=[-1.5,0,1.5,-.5,1,-1,.5,-1.5,0,1.5,-.5,1]
    for t in range(3):
        for j in range(4):
            x=32+j*150;y=173+t*98
            s.box(x,y,132,80,'#eaf0ff' if j==0 else '#f3f5fa');s.text(x+66,y+30,f'[{t},{j}] → {t*4+j}',19,MUTED,anchor='middle');s.text(x+66,y+62,f'{vals[t*4+j]:g}',25,weight=550,anchor='middle')
    s.text(690,207,'ijk：B[0,0] → B[1,0] → B[2,0]',22,BLUE,550)
    s.text(690,248,'每次跨4元素，即32字节。',23)
    s.text(690,313,'ikj：固定t，连续遍历j',23,GREEN,550)
    s.text(690,354,'B[t,0] → B[t,1] → …',23)
    s.text(690,395,'A[i,t]可用于这一行的多个输出。',22)
    s.box(32,492,1056,95,'#edf6f2');s.text(52,531,'C[0,0] = (−1.25)×(−1.5) + 0.5×1 + (−0.5)×0 = 2.375',26,GREEN,550)
    s.text(52,566,'尾块另验：5×7乘7×3，tile=4；图不表示缓存命中或硬件流量。',22,MUTED)
    s.save('v46-gemm-access',{'kind':'layout_and_reference','shape_result':r,'element_bytes':8,'b_column_stride_elements':4,'traffic_measured':False})

def timeline():
    r=RECORD['programs']['cpu_profile.py'];rows=r['named_ranges'][:3];end=max(x['start_us']+x['duration_us'] for x in rows)
    s=SVG(520,'本次实际CPU执行轨迹的首轮命名区间','PyTorch2.5.1 CPU，预热后5次执行，首轮linear、softmax和reduce三段。数据采集有开销，不代表GPU。')
    s.title('先读执行关系，随后才谈性能瓶颈','真实CPU命名区间；第1轮相对起点，采集形状/内存且有正确性检查。')
    left,width=290,770
    for q in range(5):
        x=left+width*q/4;s.line(x,147,x,380);s.text(x,419,f'{end*q/4:.0f}',21,MUTED,anchor='middle')
    for i,row in enumerate(rows):
        y=167+i*80;color=[BLUE,GREEN,RED][i]
        s.text(32,y+32,row['name'].replace('lesson_',''),26,color,600)
        x=left+width*row['start_us']/end;w=width*row['duration_us']/end
        s.box(x,y,w,48,['#eaf0ff','#edf6f2','#fff0e9'][i]);s.text(x+w/2,y+32,f"{row['duration_us']:.1f} μs",21,color,550,'middle')
    s.text(1082,458,'微秒',21,MUTED,anchor='end');s.text(32,487,'区间包含记录器影响；不能把这张CPU图写成CUDA内核时延或设备利用率。',22,MUTED)
    s.save('v46-cpu-profile',{'kind':'actual_cpu_ranges','rows':rows,'trace_sha256':r['trace_sha256'],'device':r['device'],'torch':r['torch'],'profiled_calls':r['profiled_calls']})

def routes():
    r=RECORD['programs']['moe_routing.py'];s=SVG(650,'MoE分发与按原token合并','四个二维输入，每个选择两个固定线性专家。两执行进程逆序回包后仍得到手算四行。')
    s.title('按专家打散以后，仍要找回原token','4个输入 → 8条分配 → 按(token,slot)合并；不是按返回先后拼接。')
    for x,label in [(32,'原token / 输入'),(380,'入选专家与权重'),(820,'合并输出')]:s.text(x,146,label,25,BLUE,600)
    for i,(token,out) in enumerate(zip(r['tokens'],r['two_process_output'])):
        y=174+i*82;s.box(32,y,1056,64,'#f3f5fa' if i%2==0 else '#ffffff')
        assignments=[a for a in r['assignments'] if a['token']==i]
        s.text(48,y+41,f't{i}  {token}',25)
        label=' + '.join(f"E{a['expert']} × {a['weight']:g}" for a in assignments)
        s.text(380,y+41,label,25,BLUE,550);s.text(820,y+41,str(out),25,GREEN,550)
    s.box(32,525,1056,82,'#edf6f2');s.text(52,559,'E0/E2由执行进程0计算；E1由执行进程1计算。回包顺序可变，身份不变。',23,GREEN,550)
    s.text(52,591,'逻辑跨rank分配5条：5 × 2维 × 8B × 往返2次 = 160B有效载荷（算式）。',22,MUTED)
    s.save('v46-moe-routing-map',{'kind':'actual_process_reference','tokens':r['tokens'],'assignments':r['assignments'],'output':r['two_process_output'],'transfer':r['declared_transfer_bytes'],'source_sha256':r['source_sha256']})

def capacity():
    r=RECORD['programs']['moe_routing.py'];c=r['capacity_case'];s=SVG(650,'MoE容量不是平均负载','8条分配、3个专家、容量3。正常2/3/3无丢弃，偏斜4/4/0保留3/3/0，最后token分支输出0。')
    s.title('平均8/3条，不能抹平4/4/0的偏斜','本章容量C=ceil(T×k/E)=3；按token顺序准入，丢弃后不重新归一化。')
    groups=[('正常分配',r['expert_loads'],BLUE),('偏斜分配',c['raw_expert_loads'],RED),('容量准入后',[3,3,0],GREEN)]
    for g,(label,counts,color) in enumerate(groups):
        x=32+g*366;s.text(x,148,label,27,color,600)
        for e,count in enumerate(counts):
            y=190+e*85;s.text(x,y+29,f'E{e}',24,MUTED);s.box(x+58,y,max(2,count*60),42,['#eaf0ff','#fff0e9','#edf6f2'][g]);s.text(x+70+count*60,y+29,count,24,color,600)
    s.box(32,482,1056,118,'#fff0e9');s.text(52,522,'保留6条，丢弃2条；最后token的两个贡献都被拒绝。',27,RED,600)
    s.text(52,560,'该token的MoE分支输出为0；是否还有残差，须看完整模型。',25)
    s.text(52,589,'空闲E2拥有不同参数，不能不改路由语义就顶替E0/E1。',22,MUTED)
    s.save('v46-moe-capacity',{'kind':'declared_policy_actual_execution','normal_loads':r['expert_loads'],'case':c,'source_sha256':r['source_sha256']})

for draw in [softmax,reduction,gemm,timeline,routes,capacity]:draw()
print('Generated six original operator/routing diagrams from execution records.')
