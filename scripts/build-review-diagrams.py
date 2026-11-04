"""Original explanatory SVGs, each using an encoding suited to its question."""
from pathlib import Path
from html import escape
import math
OUT=Path(__file__).resolve().parents[1]/'dist/diagrams'

def txt(x,y,value,size=18,color='#24344d',anchor='start',weight='400'):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" text-anchor="{anchor}" font-weight="{weight}">{escape(value)}</text>'
def rect(x,y,w,h,color,stroke='none',radius=6):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{color}" stroke="{stroke}"/>'
def line(x1,y1,x2,y2,color='#315dce',dash=False):
    return f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{color}" stroke-width="2" fill="none"'+(' stroke-dasharray="6 5"' if dash else '')+'/>'
def save(name,height,title,desc,parts,defs=''):
    head=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 {height}" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc><defs>{defs}</defs><rect width="960" height="{height}" fill="#fff"/><g font-family="system-ui,sans-serif">'
    (OUT/(name+'.svg')).write_text(head+txt(30,46,title,26,weight='700')+''.join(parts)+'</g></svg>')

# Log/checkpoint ledger, with missing committed items highlighted.
p=[txt(30,90,'教学序号：100 为快照点，101–110 为之后已确认的业务提交',17,'#60708d')]
for y,label,upto in [(150,'权威提交',110),(245,'恢复材料',108),(340,'恢复结果',108)]:
    p+=[txt(30,y+30,label,18,weight='600'),rect(175,y,70,52,'#e8eefc'),txt(210,y+33,'100',18,anchor='middle')]
    for n in range(101,111):
        x=262+(n-101)*64
        available=n<=upto
        p+=[rect(x,y,55,52,'#d7eee9' if available else '#ffebd7',stroke='#b8d6cf' if available else '#e0b58d'),txt(x+27.5,y+33,str(n),18,anchor='middle')]
    p+=[txt(178,y+77,'快照',16,'#60708d'),txt(450,y+77,'快照之后需要日志、版本或等价恢复材料',16,'#60708d')]
p += [txt(30,480,'复制 / 备份存在 ≠ 所有已确认结果都能恢复',23,weight='600'),txt(30,523,'材料只到 108 时，109、110 仍是已确认却未恢复的提交。',18),txt(30,559,'RPO 需结合确认时间与恢复点定义，不能把序号差直接当秒数。',17,'#60708d'),txt(30,594,'这里只比较恢复范围；不模拟数据库日志格式、断电持久性或恢复耗时。',16,'#60708d')]
save('v12-recovery-ledger',625,'快照、日志与恢复范围：逐项对账','快照和恢复日志覆盖到108，权威提交已到110，最后两项无法由现有材料证明恢复。',p)

# Two windows: budget consumption versus recent error rate.
p=[txt(30,92,'同一组合成事件：1000 次里有 6 次坏事件，且都在最近 200 次中',17,'#60708d'),txt(30,144,'全窗口 SLO = 99% → 允许坏事件 10 次',21,weight='600')]
for n in range(10):
    x=40+n*88
    p += [rect(x,178,74,78,'#efb476' if n<6 else '#b5dbd3'),txt(x+37,224,str(n+1),22,anchor='middle')]
p += [txt(40,292,'已消耗 6 / 10 = 60%',20,'#9a5b26'),txt(555,292,'剩余预算 4 次',20,'#236857'),line(30,328,930,328),txt(30,375,'最近窗口：6 / 200 = 3% 错误率',22,weight='600'),txt(30,417,'允许错误率 1% → 当前消耗速率 = 3% / 1% = 3×',20),txt(30,476,'全窗口：6 / 1000 = 0.6% → 同口径速率 0.6×',18,'#60708d'),txt(30,531,'60% 是已用掉多少预算；3× 是近期按什么速度消耗。',19,weight='600'),txt(30,568,'示意不含缺数与零流量；实际告警需定义事件、窗口及行动。',16,'#60708d')]
save('v12-budget-windows',603,'错误预算：累计用量与近期速率分开','十格预算中六格已消耗；近期200个事件包含全部6个错误，因此近期消耗速率3倍，但累计消耗为60%。',p)

# Analytical M/M/1 queue curve, not a measured graph.
p=[txt(30,88,'M/M/1：泊松到达、指数服务时间、单服务台、无限队列，且 ρ < 1',16,'#60708d')]
x0,y0,w,h=125,500,720,340
for yval in [0,5,10,15,20]:
    y=y0-h*yval/20;p += [line(x0,y,x0+w,y,'#e1e7f0'),txt(105,y+6,str(yval),17,anchor='end')]
for xval in [0,.5,.8,.9,.95]:
    x=x0+w*xval/.95;p += [line(x,y0,x,y0+6),txt(x,y0+30,str(xval),16,anchor='middle')]
p += [line(x0,y0,x0+w,y0),line(x0,y0,x0,y0-h),txt(125,126,'平均总逗留时间 / 平均服务时间',18),txt(485,561,'利用率 ρ = λ / μ',18,anchor='middle')]
coords=[]
for i in range(191):
    rho=i*.005;norm=1/(1-rho);coords.append((x0+w*rho/.95,y0-h*norm/20))
p += ['<path d="'+' '.join(('M' if i==0 else 'L')+f'{x:.2f} {y:.2f}' for i,(x,y) in enumerate(coords))+'" stroke="#315dce" stroke-width="4" fill="none"/>']
for rho,label,dy in [(.5,'0.5 → 2 倍',-18),(.8,'0.8 → 5 倍',-18),(.9,'0.9 → 10 倍',-18)]:
    x=x0+w*rho/.95;y=y0-h/(1-rho)/20;p += [f'<circle cx="{x}" cy="{y}" r="5" fill="#258b80"/>',txt(x-12,y+dy,label,17,'#236857',anchor='end')]
p += [txt(30,618,'E[T] = 1 / (μ − λ)；这里是均值，不是 p99，也不是实测容量阈值。',18),txt(30,654,'真实工作负载若有批量、重试、相关到达或多服务台，应另建模型并压测。',16,'#60708d')]
save('v12-queue-curve',687,'排队为何非线性：一条有明确假设的曲线','M/M/1理论模型，利用率越接近1，均值总逗留时间越大；曲线不是生产测试。',p)

# Compatibility heat map for a hypothetical three-version migration.
p=[txt(30,89,'假设版本能力；绿色为本例兼容，橙色为本例不兼容',17,'#60708d')]
cols=[(325,'只有旧列'),(535,'新旧列共存'),(745,'只有新列')]
for x,label in cols:p += [txt(x+85,150,label,19,anchor='middle',weight='600')]
rows=[('应用 v1：只读写旧列',[1,1,0]),('应用 v2：过渡双写',[0,1,0]),('应用 v3：只读写新列',[0,1,1])]
for i,(label,bits) in enumerate(rows):
    y=185+i*108;p += [txt(30,y+49,label,19)]
    for (x,_),value in zip(cols,bits):p += [rect(x,y,170,82,'#d7eee9' if value else '#ffebd7'),txt(x+85,y+49,'兼容' if value else '不兼容',20,anchor='middle')]
p += [txt(30,557,'保留旧版本入口不等于保留旧数据契约。',22,weight='600'),txt(30,599,'先扩展 → 兼容过渡与回填 → 核实消费者 → 再收缩',19,'#315dce'),txt(30,640,'撤回镜像不会自动撤回迁移和已发生的写入；矩阵需按真实版本验证。',16,'#60708d')]
save('v12-compatibility-matrix',672,'回退能否成立：先检查版本兼容矩阵','用假设的三版应用和三种数据库契约画出兼容关系；镜像回退不能自动恢复数据库。',p)

# Explicit policy intersection, deliberately not the complete AWS IAM evaluator.
defs='<clipPath id="ca"><circle cx="365" cy="290" r="150"/></clipPath><clipPath id="cb"><circle cx="565" cy="290" r="150"/></clipPath>'
p=[txt(30,89,'简化教学模型：各必要条件同时成立，显式拒绝不能被允许覆盖',17,'#60708d'),'<circle cx="365" cy="290" r="150" fill="#e7eefb" stroke="#315dce" stroke-width="2"/>','<circle cx="565" cy="290" r="150" fill="#e4f2ee" stroke="#258b80" stroke-width="2" fill-opacity=".65"/>','<circle cx="465" cy="415" r="150" fill="#fff0df" stroke="#c98843" stroke-width="2" fill-opacity=".6"/>','<g clip-path="url(#ca)"><g clip-path="url(#cb)"><circle cx="465" cy="415" r="150" fill="#8cc7bc"/></g></g>',txt(300,237,'动作允许',21,anchor='middle',weight='600'),txt(640,237,'资源允许',21,anchor='middle',weight='600'),txt(465,511,'可信委托范围',21,anchor='middle',weight='600'),rect(394,326,142,52,'#fff'),txt(465,359,'有效交集',20,anchor='middle',weight='600'),txt(30,630,'还需：可信主体、租户与条件满足，并且没有有效显式拒绝。',18),txt(30,666,'参数 schema 合法只是形状检查；此图不是某个云厂商完整的策略求值器。',16,'#60708d')]
save('v12-policy-intersection',700,'授权是约束交集：身份与参数均不能代替许可','三个必要约束的交集，叠加主体、租户、条件与显式拒绝。',p,defs)

# Same event, commit/response gap, then inbox replay.
p=[txt(30,88,'单数据库事务中的业务效果 + inbox 回执；不包含任意远端 API',17,'#60708d')]
xs=[175,480,790]
for x,label in zip(xs,['队列 / 调用方','工作者','业务库 + inbox']):
    p += [txt(x,139,label,20,anchor='middle',weight='600'),line(x,160,x,580,'#9caecc',True)]
def arrow(x1,y1,x2,y2,label):
    return line(x1,y1,x2,y2)+f'<path d="M{x2-8 if x2>x1 else x2+8} {y2-5}L{x2} {y2}L{x2-8 if x2>x1 else x2+8} {y2+5}" stroke="#315dce" fill="none"/>'+txt((x1+x2)/2,(y1+y2)/2-10,label,17,anchor='middle')
p += [arrow(175,207,480,237,'事件 E / 意图 H'),arrow(480,282,790,312,'原子写效果与回执'),txt(790,352,'COMMIT',18,'#236857',anchor='middle',weight='600'),line(458,370,502,414,'#b76c22'),line(502,370,458,414,'#b76c22'),txt(510,397,'退出，尚未 ACK',17,'#9a5b26'),arrow(175,450,480,480,'仍为 E / H，再投递'),arrow(480,522,790,552,'查到原回执，返回旧结果'),txt(30,635,'身份稳定 + 参数绑定 + 同一原子提交边界，才封住本例重复窗口。',18),txt(30,671,'换成外部付款服务时，本地 inbox 不能自动覆盖远端提交；需额外协议。',16,'#60708d')]
save('v12-event-commit-gap',705,'提交成功但回应丢失：重投查回原结果','工作者在业务和inbox同库原子提交后退出，重投同一事件返回原回执；单库教学边界。',p)
print('Built 6 original mechanism diagrams.')
