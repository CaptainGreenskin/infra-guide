"""Original authority/state diagrams and actual BPE/Unicode observations."""
from html import escape
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
RECORD=json.loads((ROOT/'dist/labs/agent-boundaries/validation.json').read_text())
AUTH=RECORD['programs']['authorization_commit.py'];CTX=RECORD['programs']['context_budget.py']
OUT=ROOT/'dist/diagrams';BLUE,GREEN,RED,INK,MUTED='#315dce','#287b69','#ad5147','#1c283d','#66738a'
class SVG:
    def __init__(self,h,title,desc):
        self.parts=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 {h}" width="1120" height="{h}" role="img" aria-labelledby="title desc">',
                    '<title id="title">'+escape(title)+'</title><desc id="desc">'+escape(desc)+'</desc>',
                    '<style>text{font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif}</style>',f'<rect width="1120" height="{h}" fill="white"/>',
                    '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#315dce" stroke-width="1.5"/></marker></defs>']
    def text(self,x,y,value,size=24,color=INK,weight=400,anchor='start'):
        self.parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(value))}</text>')
    def box(self,x,y,w,h,fill='#f3f5fa',stroke='#dce3ed'):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="{fill}" stroke="{stroke}"/>')
    def line(self,x,y,x2,y2,arrow=False,color=BLUE):
        self.parts.append(f'<line x1="{x}" y1="{y}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="2"'+(' marker-end="url(#arrow)"' if arrow else '')+'/>')
    def title(self,t,sub):self.text(32,48,t,32,weight=650);self.text(32,89,sub,22,MUTED)
    def save(self,name,meta):
        self.parts.append('<metadata>'+escape(json.dumps(meta,ensure_ascii=False))+'</metadata>');(OUT/(name+'.svg')).write_text('\n'.join(self.parts+['</svg>']))

def authority():
    s=SVG(650,'可信授权与外部材料的不同路径','可信主体、任务、策略和具体批准约束资源服务；外部文字只产生候选，不扩大委托。SQLite实验里的政策与效果共享一个本地提交边界。')
    s.title('授权来自可信记录，材料只能提出候选','主体lin / 租户A / 任务R18；不是从工具正文读取新的许可。')
    s.box(32,137,290,134,'#eaf0ff');s.text(52,178,'可信会话与任务',27,BLUE,600);s.text(52,219,'身份、租户、委托范围',23);s.text(52,251,'具体批准：37 / 版本7',22)
    s.box(32,323,290,117,'#fff0e9');s.text(52,365,'外部报告与备注',27,RED,600);s.text(52,406,'可以出现“请改写B”',23)
    s.box(404,323,268,117);s.text(424,365,'模型提出候选',27,BLUE,600);s.text(424,406,'提议不等于授权',23)
    s.box(754,137,334,303,'#edf6f2');s.text(774,178,'资源服务实施检查',27,GREEN,600)
    for i,t in enumerate(['当前策略与实际归属','动作与规范参数','具体批准与资源版本','原操作ID与提交回执']):s.text(774,225+i*48,t,23)
    s.line(322,199,754,199,True);s.text(440,177,'可信范围',21,BLUE)
    s.line(322,381,404,381,True);s.line(672,381,754,381,True)
    s.box(32,501,1056,103);s.text(52,542,'本地提交边界：策略复检 + 批准消费 + 业务修改 + 工具回执',27,BLUE,600)
    s.text(52,580,'本实验共享SQLite；跨服务策略与外部工具需要各自定义生效点。',23,MUTED)
    s.save('v47-authority-path',{'kind':'authority_and_effect_boundary','principal':AUTH['principal_fixture'],'approved_intent':AUTH['approved_intent'],'scope':AUTH['scope']})

def revoke():
    s=SVG(570,'检查之后撤权，提交时谁作决定','真实HTTP与独立SQLite连接中，prepare epoch1之后policy_change epoch2，正确拒绝效果0，信旧快照负例效果1。')
    s.title('检查过一次，仍可能在过期的许可下写入','共同顺序：准备允许(1) → 撤权提交(2) → 本次工具写入。')
    for x,label in [(60,'准备检查'),(360,'撤权提交'),(660,'写入边界'),(959,'效果数')]:s.text(x,152,label,26,BLUE,600)
    for y,label,color in [(228,'正确实现',GREEN),(358,'旧快照负例',RED)]:
        s.text(32,y,label,23,color,600);s.line(55,y+56,951,y+56,True)
        for x,text in [(60,'允许 / epoch1'),(360,'策略 / epoch2'),(660,'重查→拒绝' if color==GREEN else '信epoch1→提交')]:s.box(x,y+18,238,62,'#edf6f2' if color==GREEN else '#fff0e9');s.text(x+119,y+58,text,23,color,550,'middle')
        s.text(1000,y+60,AUTH['states']['revoked_at_commit' if color==GREEN else 'snapshot_negative']['effects'],42,color,650,'middle')
    s.text(32,516,'本例撤权先提交；业务已先提交的另一顺序，不能靠撤权抹去历史效果。',23,MUTED)
    s.save('v47-revocation-commit',{'kind':'actual_authorization_interleaving','correct':AUTH['states']['revoked_at_commit'],'negative':AUTH['states']['snapshot_negative'],'source_sha256':AUTH['source_sha256']})

def receipts():
    s=SVG(510,'既有回执的读取与新的写入分别授权','K1已提交版本8金额37且只有一份效果，先撤写权保留读权，后连读权也撤销。原效果不会被撤权抹除。')
    s.title('已经发生的效果，与现在允许做什么分开','同一个A/K1：版本8、金额37；业务效果始终1份。')
    rows=[(32,'正常提交','写允许 / 读允许','committed',BLUE),(402,'撤销写权限','写拒绝 / 读允许','receipt found',GREEN),(772,'再撤读取权限','写拒绝 / 读拒绝','read_denied',RED)]
    for x,title,rights,status,color in rows:
        s.box(x,146,316,230);s.text(x+20,193,title,27,color,600);s.text(x+20,249,rights,23);s.text(x+20,316,status,25,color,550)
    s.line(350,261,398,261,True);s.line(720,261,768,261,True)
    s.text(32,446,'允许查询原事实，不等于批准一次新写入；拒绝读取，也不等于原提交不存在。',23,MUTED)
    s.save('v47-receipt-permissions',{'kind':'actual_receipt_permissions','normal':AUTH['results']['normal'],'write_revoked':AUTH['results']['write_after_revoke'],'read_allowed':AUTH['results']['write_revoked_receipt_readable'],'read_revoked':AUTH['results']['receipt_read_revoked'],'final_effects':AUTH['states']['normal']['effects']})

def pipeline():
    s=SVG(640,'从检索索引到实际提示交付','搜索索引只给候选，正文按当前版本和权限读取，完整提示计数并验证证据，发送前重查，再由真实HTTP收集器记录。')
    s.title('检索找到，不代表最终输入已经拿到','a-1/v1=10；a-2/v2=27。身份、版本与预算沿路径保留。')
    boxes=[(32,139,'01 资料与索引','按范围查候选'),(404,139,'02 权威正文','取同版、获准内容'),(776,139,'03 完整输入','模板+来源+正文'),
           (776,338,'04 预算与证据','完整237；缺项则停'),(404,338,'05 发送前复检','读取资格与来源版本'),(32,338,'06 提示接收端','实际仅正常请求1份')]
    for x,y,title,sub in boxes:
        s.box(x,y,312,128,'#edf6f2' if title.startswith('06') else '#f3f5fa');s.text(x+20,y+45,title,26,BLUE,600);s.text(x+20,y+91,sub,23)
    for a in [(344,203,400,203),(716,203,772,203),(932,267,932,334),(776,402,720,402),(404,402,348,402)]:s.line(*a,True)
    s.box(32,520,1056,75,'#fff0e9');s.text(52,564,'取回后撤权 / 版本推进：在指定检查点停止，接收端新增请求0。',25,RED,550)
    s.save('v47-context-path',{'kind':'actual_context_stages','cases':{k:{field:v.get(field) for field in ['status','candidate_ids','selected_ids','prompt_tokens','requests_delivered']} for k,v in CTX['cases'].items()},'receiver':CTX['receiver'],'scope':CTX['scope']})

def budget():
    normal,tight=CTX['cases']['normal'],CTX['cases']['tight_budget'];s=SVG(610,'完整提示词元账与证据不足','cl100k_base实际输入237，正文单数36，输出预留96。声明512窗口内合计333；收紧259后输入163只能保一份，拒绝交付。')
    s.title('正文36词元，不能当成完整输入237词元','固定tiktoken 0.12.0 / cl100k_base；纯字符串模板，非模型聊天封装。')
    s.text(32,151,'正常：两份证据齐备，发送1次',26,GREEN,600)
    x=32;y=180
    for value,label,fill,color in [(237,'输入237','#eaf0ff',BLUE),(96,'预留96','#edf6f2',GREEN),(179,'余量179','#f3f5fa',MUTED)]:
        w=value*2;s.box(x,y,w,64,fill);s.text(x+w/2,y+42,label,26,color,550,'middle');x+=w
    s.text(32,291,'237 + 96 = 333 ≤ 512；输入上限416',25)
    s.text(32,357,'收紧：只留a-2/v2，基础费用未进入，发送0次',26,RED,600)
    x=32;y=385
    for value,label,fill,color in [(163,'输入163','#fff0e9',RED),(96,'预留96','#edf6f2',GREEN)]:
        w=value*2;s.box(x,y,w,64,fill);s.text(x+w/2,y+42,label,26,color,550,'middle');x+=w
    s.text(32,505,'163 + 96 = 259，但证据不完整；“没有超限”不是任务可回答的充分条件。',24,RED)
    s.text(32,561,'窗口是本实验声明；只数正文漏掉模板、来源和分隔符，分段计数也可能非加性。',22,MUTED)
    s.save('v47-context-token-budget',{'kind':'actual_bpe_prompt_counts','encoding':CTX['encoding'],'normal':normal,'tight':tight,'output_generated':False})

def unicode():
    u=CTX['unicode'];s=SVG(560,'词元边界与UTF8字符边界可以不同','中国🙂恢复的真实cl100k_base编码。第二词元f09f只含表情的一部分，截前2词元默认解码为中国替换字符，退到严格有效边界为中国。')
    s.title('一个词元，不一定是一整个汉字或表情','实际输入：中国🙂恢复；先看编号，再看它承载的字节。')
    for i,(token,hexbytes) in enumerate(zip(u['ids'],u['token_bytes_hex'])):
        x=32+i*177;s.box(x,148,160,166,'#fff0e9' if i==1 else '#f3f5fa');s.text(x+80,186,f'词元{i+1}',23,MUTED,anchor='middle');s.text(x+80,235,token,28,RED if i==1 else BLUE,600,'middle');s.text(x+80,282,hexbytes,17,INK,anchor='middle')
    s.box(32,359,500,97,'#fff0e9');s.text(52,399,'截前2个：'+u['lossy_default'],29,RED,600);s.text(52,435,'表情尚有字节未收齐。',23)
    s.box(588,359,500,97,'#edf6f2');s.text(608,399,'退回1个：'+u['safe_prefix'],29,GREEN,600);s.text(608,435,'严格解码通过，仍要核对语义。',23)
    s.text(32,517,'保住字符不等于保住事实；证据优先按完整语义段选择，而非盲截词元。',23,MUTED)
    s.save('v47-context-token-bytes',{'kind':'actual_unicode_token_boundaries','encoding':CTX['encoding'],'result':u,'source_sha256':CTX['source_sha256']})

for draw in [authority,revoke,receipts,pipeline,budget,unicode]:draw()
print('Generated six authority, commit, context and byte-boundary diagrams from executed fixtures.')
