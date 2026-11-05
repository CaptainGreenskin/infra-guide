"""Original conceptual dependency diagrams; no measured performance is implied."""
from html import escape
from pathlib import Path
import json

OUT = Path(__file__).resolve().parents[1] / 'dist' / 'diagrams'
INK, MUTED, BLUE, GREEN = '#1c283d', '#65728a', '#315dce', '#287b69'


class SVG:
    def __init__(self, height, title, desc):
        self.p = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img" aria-labelledby="title desc">',
                  '<title id="title">' + escape(title) + '</title><desc id="desc">' + escape(desc) + '</desc>',
                  '<defs>' + ''.join(f'<marker id="{name}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="{color}"/></marker>' for name, color in [('flow', BLUE), ('dependency', MUTED), ('update', GREEN)]) + '</defs>',
                  '<style>text{font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif}</style>',
                  f'<rect width="1120" height="{height}" fill="#fff"/>']

    def text(self, x, y, value, size=24, color=INK, weight=400, anchor='start'):
        self.p.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(value)}</text>')

    def box(self, x, y, w, h, title, lines=(), tint=False):
        self.p.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{"#edf7f3" if tint else "#f2f5fb"}" stroke="{"#a5cabb" if tint else "#d6dfef"}" stroke-width="2"/>')
        self.text(x+w/2, y+38, title, 26, GREEN if tint else BLUE, 600, 'middle')
        for i, line in enumerate(lines):
            self.text(x+w/2, y+73+i*29, line, 21, MUTED, anchor='middle')

    def line(self, points, kind='flow', dash=False, arrow=True):
        self.p.append('<polyline points="'+' '.join(f'{x},{y}' for x,y in points)+'" fill="none" stroke="'+{'flow':BLUE, 'dependency':MUTED, 'update':GREEN}[kind]+'" stroke-width="2.5"'+(' stroke-dasharray="7 6"' if dash else '')+(' marker-end="url(#'+kind+')"' if arrow else '')+'/>')

    def save(self, name, relationships):
        self.p.append('<metadata>'+escape(json.dumps({'kind':'conceptual_relationships','relationships':relationships,'measured':False,'author':'InfraGuide'},ensure_ascii=False))+'</metadata>')
        (OUT/(name+'.svg')).write_text('\n'.join(self.p+['</svg>']), encoding='utf-8')


def cloud():
    s=SVG(720, '从请求到云资源', '实线表示请求与响应，虚线表示运行依赖；云平台提供资源，服务程序负责处理业务。')
    s.text(32,48,'从一次访问，认识服务依赖的资源',32,weight=650)
    s.text(32,87,'实线：请求与响应　　虚线：运行依赖　　框内包含关系：平台提供资源',22,MUTED)
    s.box(40,170,210,118,'用户',('发起访问',))
    s.box(365,170,230,118,'网络传输',('传递请求与响应',))
    s.box(710,170,370,118,'服务程序',('由运行中的进程处理业务',))
    s.line([(250,205),(365,205)]);s.line([(595,205),(710,205)])
    s.line([(710,255),(595,255)]);s.line([(365,255),(250,255)])
    s.text(305,190,'请求',20,BLUE,anchor='middle');s.text(652,280,'响应',20,BLUE,anchor='middle')
    s.line([(895,288),(895,342)],'dependency',True,False)
    s.line([(170,342),(950,342)],'dependency',True,False)
    for x in [170,430,690,950]:
        s.line([(x,342),(x,420)],'dependency',True)
    s.p.append('<rect x="24" y="395" width="1072" height="244" rx="10" fill="none" stroke="#a7b9dc" stroke-width="2"/>')
    for x,title,lines in [(50,'CPU',['执行指令']),(310,'内存',['暂存运行数据']),(570,'存储',['保留需要留下的数据']),(830,'网络资源',['连接程序与机器'])]:
        s.box(x,420,240,117,title,lines)
    s.text(560,590,'云平台：让这些资源能够按需申请、管理与释放',26,BLUE,600,'middle')
    s.text(32,690,'资源准备好以后，还要运行程序、开放访问，并验证用户真正得到结果。',24,weight=550)
    s.save('v42-cloud-concepts',['user_request→network→service','service→CPU/memory/storage/network','cloud_platform_provides_resources'])


def ai():
    s=SVG(810,'从文本到预测，再到参数更新','推理用当前参数得到预测；训练还要用目标计算损失、梯度，再由优化器更新参数。GPU承担数值执行。')
    s.text(32,48,'推理先走一遍计算，训练还要走更新路径',32,weight=650)
    s.text(32,87,'蓝色：输入到预测　　绿色：训练新增的误差与更新路径',22,MUTED)
    for x,title,lines in [(25,'文本',['原始输入']),(245,'词元编号',['分词后的离散单位']),(465,'向量表示',['编号查表得到数字']),(685,'模型计算',['使用当前参数']),(905,'候选得分',['决定后续输出'])]:
        s.box(x,150,190,132,title,lines)
    for x in [215,435,655,875]:s.line([(x,216),(x+30,216)])
    s.text(32,332,'只读取当前参数、产生预测：推理。下面这条回路：训练。',24,BLUE,550)
    s.box(30,402,235,122,'训练目标',('已知的正确答案',),True)
    s.box(425,402,230,122,'损失',('衡量预测与目标差异',),True)
    s.box(830,402,260,122,'梯度与优化器',('计算影响，再调整参数',),True)
    s.line([(265,462),(425,462)],'update')
    s.line([(1000,282),(1000,358),(540,358),(540,402)],'update')
    s.line([(655,462),(830,462)],'update')
    s.line([(960,524),(960,606),(1107,606),(1107,123),(780,123),(780,150)],'update')
    s.text(538,387,'预测',19,GREEN,anchor='middle');s.text(955,640,'更新模型参数',23,GREEN,600,'middle')
    s.p.append('<rect x="30" y="663" width="1060" height="106" rx="8" fill="#f6f7f9" stroke="#d8dee8"/>')
    s.text(54,704,'GPU是执行这些数值计算的硬件；模型、训练和推理分别描述不同对象与过程。',23,INK,550)
    s.text(54,741,'本图只画概念关系；具体模型还需要位置处理、输出规则及相应运行依赖。',21,MUTED)
    s.save('v42-ai-concepts',['text→token_ids→vectors→model→scores','scores+target→loss→gradients_and_optimizer→parameters','hardware_executes_computation'])


def agent():
    s=SVG(800,'任务、模型、运行时和工具','模型提出建议，运行时核对与安排，工具执行实际动作；状态记录事实，验收判断任务是否完成。')
    s.text(32,48,'先分清谁提议、谁执行、谁确认结果',32,weight=650)
    s.text(32,87,'箭头表示控制与信息传递；工具执行动作后，还要核对任务完成条件。',22,MUTED)
    s.box(30,147,255,130,'任务',('目标、允许范围','完成条件'))
    s.box(425,147,260,130,'模型',('根据输入提出下一步','输出仍只是提议'))
    s.box(825,147,265,130,'运行时',('核对参数与权限','安排调用、保存结果'))
    s.line([(285,212),(425,212)]);s.line([(685,212),(825,212)])
    s.box(825,386,265,125,'工具',('真正读取资料或执行动作',))
    s.box(425,386,260,125,'状态与结果',('哪些已确认、哪些未知',))
    s.box(30,386,255,125,'任务验收',('检查必要与禁止效果',))
    s.line([(958,277),(958,386)]);s.text(976,339,'调用',21,BLUE)
    s.line([(825,451),(685,451)]);s.text(755,432,'观察',21,BLUE,anchor='middle')
    s.line([(425,451),(285,451)]);s.text(355,432,'核对',21,BLUE,anchor='middle')
    s.line([(555,386),(555,277)],'dependency',True);s.text(575,334,'提供后续输入',21,MUTED)
    s.line([(157,511),(157,591),(555,591),(555,511)],'update')
    s.text(352,579,'未完成且仍获准：继续推进',22,GREEN,600,'middle')
    s.box(30,657,1060,100,'完成与停止都应有明确依据',('工具成功、模型声称完成和用户目标完成，需要分别判断。',),True)
    s.save('v42-agent-concepts',['task→model_proposal→runtime_validation→tool_execution','tool_result→state→acceptance','state→next_model_input','acceptance→continue_or_stop'])


def decoder():
    s=SVG(790,'解码器块的两次残差相加','采用前置归一化的示意：H1=X+Attention(Norm1(X))，H2=H1+FFN(Norm2(H1))。第二条残差与前馈均使用H1。')
    s.text(32,48,'沿两次相加，读懂一个解码器块',32,weight=650)
    s.text(32,87,'本图采用前置归一化；两处归一化的参数彼此独立。',22,MUTED)
    for x,title,lines in [(30,'输入 X',['每个位置一组特征']),(330,'归一化 1',['调整当前特征尺度']),(650,'注意力',['汇总可见位置的信息'])]:
        s.box(x,158,240,118,title,lines)
    s.line([(270,217),(330,217)]);s.line([(570,217),(650,217)])
    s.p.append('<circle cx="1010" cy="217" r="31" fill="#edf7f3" stroke="#287b69" stroke-width="2"/>');s.text(1010,227,'+',32,GREEN,600,'middle')
    s.line([(890,217),(977,217)]);s.line([(150,158),(150,121),(1010,121),(1010,183)],'update')
    s.text(1053,226,'H1',24,GREEN,600)
    s.line([(1010,250),(1010,343),(150,343),(150,398)])
    s.text(548,329,'H1 = X + 注意力分支',24,BLUE,550,'middle')
    for x,title,lines in [(30,'中间表示 H1',['不是重新使用旧输入X']),(330,'归一化 2',['接收H1，另有参数']),(650,'前馈网络',['对各位置作非线性变换'])]:
        s.box(x,398,240,118,title,lines)
    s.line([(270,457),(330,457)]);s.line([(570,457),(650,457)])
    s.p.append('<circle cx="1010" cy="457" r="31" fill="#edf7f3" stroke="#287b69" stroke-width="2"/>');s.text(1010,467,'+',32,GREEN,600,'middle')
    s.line([(890,457),(977,457)]);s.line([(150,516),(150,580),(1010,580),(1010,491)],'update')
    s.text(1053,466,'H2',24,GREEN,600)
    s.text(560,620,'H2 = H1 + 前馈分支；两条绿色旁路保留相应输入',24,GREEN,600,'middle')
    s.text(32,696,'形状相同只是相加的必要条件；接错来源，程序仍可能运行却计算了别的函数。',24,weight=550)
    s.text(32,748,'归一化、注意力与门控前馈的具体公式和代码，按下面的正文继续展开。',22,MUTED)
    s.save('v42-decoder-path',['X→Norm1→Attention','H1=X+Attention(Norm1(X))','H1→Norm2→FFN','H2=H1+FFN(Norm2(H1))'])


if __name__=='__main__':
    OUT.mkdir(exist_ok=True)
    cloud(); ai(); agent(); decoder()
    print('Wrote 4 original conceptual dependency diagrams.')
