"""Six original teaching figures: bits, state table, mask grid, fault map, budget and history."""
from html import escape
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/diagrams'
RECORD=json.loads((ROOT/'dist/labs/mechanism-walkthroughs/validation.json').read_text())['results']
INK,MUTED,BLUE,GREEN,RED='#1c283d','#66738a','#315dce','#287b69','#ad5147'


class SVG:
    def __init__(self,height,title,desc):
        self.p=[f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img" aria-labelledby="title desc">',
                '<title id="title">'+escape(title)+'</title><desc id="desc">'+escape(desc)+'</desc>',
                '<style>text{font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif}</style>',f'<rect width="1120" height="{height}" fill="white"/>']
    def text(self,x,y,t,size=24,color=INK,weight=400,anchor='start'):
        self.p.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(t))}</text>')
    def rect(self,x,y,w,h,fill='#f2f5fa',stroke='#dbe2ed'):
        self.p.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="{fill}" stroke="{stroke}"/>')
    def line(self,x1,y1,x2,y2,color='#dbe2ed'):
        self.p.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="2"/>')
    def save(self,name,data):
        self.p.append('<metadata>'+escape(json.dumps(data,ensure_ascii=False))+'</metadata>')
        (OUT/(name+'.svg')).write_text('\n'.join(self.p+['</svg>']),encoding='utf-8')


def routes():
    s=SVG(720,'CIDR与最长前缀匹配','目标10.30.8.42，前三个八位组对应24位网络前缀；基础表命中/24，加入/32后选择更具体的主机路由。')
    s.text(32,48,'先看地址的位，再选最具体的路',32,weight=650)
    s.text(32,92,'目标地址 10.30.8.42；每个十进制段对应8个二进制位。',23,MUTED)
    bits=['00001010','00011110','00001000','00101010']
    for group,(decimal,binary) in enumerate(zip(['10','30','8','42'],bits)):
        x=32+group*272
        s.text(x+128,142,decimal,28,BLUE,600,'middle')
        for i,bit in enumerate(binary):
            s.rect(x+i*31,162,28,42,'#e8efff' if group<3 else '#f0f1f4')
            s.text(x+i*31+14,192,bit,23,BLUE if group<3 else MUTED,anchor='middle')
    s.text(32,246,'/24固定前24位：10.30.8.*；剩余8位可表示256个地址。',25,BLUE,600)
    for i,(prefix,matched,meaning) in enumerate([('0.0.0.0/0','匹配','没有固定前缀位，作为默认项'),('10.20.0.0/16','不匹配','第二段20与目标30不同'),('10.30.8.0/24','匹配 · 基础表选中','比/0更具体，交给peer'),('10.30.8.42/32','新增后选中','只匹配这个地址，交给inspection')]):
        y=292+i*77;s.rect(32,y,1056,65,'#edf7f3' if i>=2 else '#f6f7fa')
        s.text(52,y+42,prefix,25,weight=550);s.text(380,y+42,matched,24,GREEN if i>=2 else MUTED)
        s.text(668,y+42,meaning,21)
    s.text(32,657,'选择下一跳以后，还要分别验证回程、访问规则和程序监听。',25,weight=550)
    s.text(32,699,'地址范围图与规则计算；未在真实VPC修改路由。同前缀优先级另查产品规则。',21,MUTED)
    s.save('v43-cidr-selection',{'kind':'route_model','result':RECORD['route_walk.py']})


def reconcile():
    s=SVG(750,'声明、观察和就绪是不同状态','状态模型从期望3副本、实际0，经过重复调谐到3个未就绪实例，再到3个就绪实例。UID防止旧请求误作用于同名新对象。')
    s.text(32,48,'同一个期望，经过几轮控制才成为可用实例',32,weight=650)
    s.text(32,89,'generation标明期望的代次；observedGeneration标明状态对应哪一代。',22,MUTED)
    columns=[(48,'观察时刻'),(383,'期望代次'),(575,'已观察代次'),(790,'实例数'),(965,'就绪数')]
    for x,title in columns:s.text(x,146,title,23,BLUE,600)
    rows=[('API已接受3副本','2','0','0','0'),('重复调谐8轮后','2','2','3','0'),('实例满足就绪条件后','2','2','3','3'),('改成1副本并收敛后','3','3','1','1')]
    for i,row in enumerate(rows):
        y=177+i*72;s.rect(32,y,1056,62,'#edf7f3' if i==2 else '#f3f5f9')
        for (x,_),value in zip(columns,row):s.text(x,y+40,value,24,GREEN if i==2 else INK)
    s.text(32,510,'对象名可以复用，UID区分是不是原来的那一个。',26,weight=600)
    s.rect(32,542,490,95);s.rect(558,542,530,95,'#fff2ed')
    s.text(52,580,'旧 p0：UID pod-1 → 删除',24,BLUE,550)
    s.text(52,615,'新 p0：UID pod-4',24,BLUE,550)
    s.text(580,580,'带旧UID的迟到删除：uid-mismatch',23,RED,550)
    s.text(580,615,'保留同名新实例，不按名字误删。',23)
    s.text(32,694,'resourceVersion只按相等检查；状态更新也可改变它，不能拿来当业务代次。',23,MUTED)
    s.text(32,733,'数据来自本地状态模型；真实集群继续用API对象、事件与流量验证。',21,MUTED)
    s.save('v43-reconcile-states',{'kind':'reconciliation_model','result':RECORD['reconcile_walk.py']})


def attention():
    r=RECORD['attention_trace.py']
    s=SVG(750,'增量注意力的查询位置与掩码','当前查询在绝对位置2，合法键为0、1、2；正确输出3.5和2。错误使用单查询左上对齐因果掩码时，只能读键0，输出2和0。')
    s.text(32,48,'一条新query不一定是绝对位置0',32,weight=650)
    s.text(32,89,'同一Q、K、V；只改变可见性。✓允许读取，×不进入Softmax分母。',22,MUTED)
    for i,label in enumerate(['K₀ / V₀','K₁ / V₁','K₂ / V₂']):s.text(520+i*160,153,label,24,BLUE,600,'middle')
    rows=[('完整计算的第2行',[True,True,True],'[3.5, 2]'),('正确缓存查询，绝对位置2',[True,True,True],'[3.5, 2]'),('错误：单行套左上因果mask',[True,False,False],'[2, 0]')]
    for i,(title,mask,value) in enumerate(rows):
        y=189+i*126;s.text(32,y+42,title,23,RED if i==2 else INK,550)
        for j,allowed in enumerate(mask):
            x=450+j*160;s.rect(x,y,140,76,'#eaf5ef' if allowed else '#f1f2f5')
            s.text(x+70,y+49,'✓' if allowed else '×',32,GREEN if allowed else MUTED,600,'middle')
        s.text(970,y+46,value,26,RED if i==2 else GREEN,600,'middle')
    s.rect(32,585,1056,112,'#edf2ff')
    s.text(54,626,'正确的第2行权重 = [1/4, 1/4, 1/2]',27,BLUE,600)
    s.text(54,667,'输出 = 1/4×[2,0] + 1/4×[0,4] + 1/2×[6,2] = [3.5,2]',25)
    s.text(32,734,'PyTorch 2.5.1 / CPU / float64实际对照；不是GPU速度测量。',21,MUTED)
    s.save('v43-cache-mask-grid',{'kind':'actual_cpu_attention','cached':r['cached_last_row'],'wrong':r['wrong_offset_row'],'max_error':r['sdpa_max_error']})


def decoder():
    r=RECORD['decoder_trace.py'];s=SVG(745,'用首个不同的中间量定位解码器接线错误','四种保持输出形状的错误分别最先在n1、n2、gate_product、h2发生差异。归一化时间轴还会泄漏未来。')
    s.text(32,48,'输出形状都合法，哪一步最先算错',32,weight=650)
    s.text(32,89,'●标记首个不同的中间量；先回到这一格检查输入与运算。',23,MUTED)
    steps=['N₁','注意力','H₁','N₂','门控乘积','H₂','输出']
    for j,label in enumerate(steps):s.text(442+j*96,156,label,22,BLUE,550,'middle')
    cases=[('归一化沿时间轴',0),('第二分支错误接回X',3),('激活放到另一条投影',4),('省略第二次残差',5)]
    for i,(label,first) in enumerate(cases):
        y=193+i*88;s.text(32,y+42,label,24,weight=550)
        for j in range(7):
            x=402+j*96;s.rect(x,y,80,60,'#fff0eb' if j==first else '#edf5ef' if j<first else '#f3f4f7')
            s.text(x+40,y+40,'●' if j==first else '=' if j<first else '·',27,RED if j==first else GREEN if j<first else MUTED,600,'middle')
    s.text(32,611,'只改未来的第4个输入，前3个输出：',26,weight=600)
    s.text(32,656,'正确特征轴归一化：误差0；错误时间轴：最大差约'+str(round(r['time_normalized_future_prefix_error'],3)),25,BLUE,550)
    s.text(32,718,'实际664参数CPU模型、固定种子与输入；这些数值不是普遍误差阈值。',22,MUTED)
    s.save('v43-decoder-first-difference',{'kind':'actual_cpu_decoder','faults':r['faults'],'future_error':r['future_prefix_error'],'wrong_axis_future_error':r['time_normalized_future_prefix_error']})


def budget():
    s=SVG(730,'上下文预算的两次分配','题设窗口8192词元，固定项及输出预留3492，余4700。历史摘要1400、指标1100、待确认600、摘录700占3800，仍余900。题设计数不代表真实分词器结果。')
    s.text(32,48,'先扣固定项，再选择本轮真正需要的材料',32,weight=650)
    s.text(32,90,'统一使用题设词元数；真实请求要用目标模型的计数接口或分词器重算。',22,MUTED)
    s.text(32,146,'第一笔：整个8192窗口',25,weight=600)
    w=1056*3492/8192;s.rect(32,174,w,78,'#dfe8fc');s.rect(32+w,174,1056-w,78,'#e4f3ec')
    s.text(32+w/2,222,'固定项+预留 3492',25,BLUE,600,'middle');s.text(32+w+(1056-w)/2,222,'材料空间 4700',25,GREEN,600,'middle')
    s.text(32,294,'3492 = 系统1200 + 工具620 + 任务672 + 输出900 + 格式100',23,MUTED)
    s.text(32,366,'第二笔：4700材料空间怎样分',25,weight=600)
    x=32
    for label,count,color in [('摘要',1400,'#dfe8fc'),('指标',1100,'#e4f3ec'),('待确认',600,'#f9ecd8'),('摘录',700,'#ece8f5'),('留空',900,'#f2f4f8')]:
        width=1056*count/4700;s.rect(x,396,width,105,color)
        s.text(x+width/2,439,label,25,anchor='middle');s.text(x+width/2,478,count,25,BLUE,600,'middle');x+=width
    s.text(32,555,'占用3800，余900；不必为了填满窗口加入无关历史。',25,GREEN,600)
    s.text(32,617,'选择材料后还要检查：来源版本、适用范围、调用与结果配对、必要限定。',23)
    s.text(32,684,'同一内容在完整请求中的计数才是最终依据；分段计数之和只是候选预算。',23,MUTED)
    s.save('v43-context-budget',{'kind':'declared_teaching_budget','window':8192,'fixed':3492,'available':4700,'selected':3800,'unused':900,'real_tokenizer_measurement':False})


def history():
    r=RECORD['workflow_history.py'];s=SVG(790,'活动结果的提交边界决定恢复是否重新读取','结果23已记录后退出，恢复复用23，只执行草稿；读取发生但结果未提交就退出，恢复再次读取新值999。两个独立SQLite库记录历史与调用次数。')
    s.text(32,48,'进程都退出了，恢复为什么会得到不同的数',32,weight=650)
    s.text(32,90,'活动先读取本地资料；历史记录结果后，重放才能复用它。',23,MUTED)
    s.text(300,151,'已记结果：退出码23',27,BLUE,600,'middle');s.text(830,151,'未记结果：退出码24',27,RED,600,'middle')
    left=['登记 read-1','实际读取 total=23','历史保存结果23','进程退出；源文件改为999','恢复读历史：复用23','只执行草稿：总数23']
    right=['登记 read-1','实际读取 total=23','未保存结果，进程退出','源文件改为999','恢复：再次读取，得到999','执行草稿：总数999']
    for i in range(6):
        y=185+i*75
        for x,lines in [(32,left),(572,right)]:
            s.rect(x,y,516,60,'#edf7f3' if i==5 and x==32 else '#fff2ed' if i==5 else '#f3f5fa')
            s.text(x+18,y+39,str(i+1),22,BLUE,600);s.text(x+58,y+39,lines[i],24)
    s.text(32,699,'读取调用数：1次',26,GREEN,600);s.text(572,699,'读取调用数：2次',26,RED,600)
    s.text(32,757,'本机SQLite与真实子进程结果；活动只读资料、生成文本，不执行远端写入。',22,MUTED)
    s.save('v43-workflow-result-boundary',{'kind':'actual_local_process_and_sqlite','recorded_calls':r['after_resume']['calls'],'unrecorded_calls':r['after_gap_resume']['calls'],'exit_codes':[23,24]})


if __name__=='__main__':
    routes();reconcile();attention();decoder();budget();history()
    print('Wrote 6 original mechanism figures.')
