"""Original byte grids, event timelines and recovery checks tied to executed fixtures."""
from html import escape
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RECORD=json.loads((ROOT/'dist/labs/transport-recovery/validation.json').read_text())
OUT=ROOT/'dist/diagrams'
INK,BLUE,GREEN,RED,MUTED='#1c283d','#315dce','#287b69','#ad5147','#66738a'


class SVG:
    def __init__(self,height,title,desc):
        self.items=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 {height}" width="1120" height="{height}" role="img" aria-labelledby="title desc">',
                    '<title id="title">'+escape(title)+'</title><desc id="desc">'+escape(desc)+'</desc>',
                    '<style>text{font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif}</style>',
                    f'<rect width="1120" height="{height}" fill="white"/>',
                    '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#315dce" stroke-width="1.5"/></marker></defs>']

    def text(self,x,y,value,size=24,color=INK,weight=400,anchor='start'):
        self.items.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(value))}</text>')

    def rect(self,x,y,width,height,fill='#f2f5fa',stroke='#dbe2ed'):
        self.items.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="5" fill="{fill}" stroke="{stroke}"/>')

    def line(self,x1,y1,x2,y2,color='#dbe2ed',arrow=False,dashed=False):
        self.items.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="2"'+
                          (' marker-end="url(#arrow)"' if arrow else '')+(' stroke-dasharray="7 6"' if dashed else '')+'/>')

    def save(self,name,metadata):
        self.items.append('<metadata>'+escape(json.dumps(metadata,ensure_ascii=False))+'</metadata>')
        (OUT/(name+'.svg')).write_text('\n'.join(self.items+['</svg>']))


def sequence():
    s=SVG(780,'从初始序号到32字节请求与半关闭','教学序号：客户端初始1000、服务端7000；SYN各消耗一个位置。两帧共32字节，客户端结束写方向后仍接收17字节应用回执。不是实际抓包。')
    s.text(32,48,'先数流中的位置，再看应用读写',32,weight=650)
    s.text(32,90,'固定教学序号；箭头表示逻辑顺序，省略可合并的ACK与其他报文。',22,MUTED)
    s.text(155,142,'客户端',27,BLUE,600,'middle');s.text(965,142,'服务端',27,GREEN,600,'middle')
    s.line(155,162,155,674,dashed=True);s.line(965,162,965,674,dashed=True)
    rows=[(205,True,'SYN：seq=1000'),(285,False,'SYN + ACK：seq=7000，ack=1001'),
          (365,True,'ACK：seq=1001，ack=7001'),(445,True,'两帧32B：字节区间 [1001,1033)'),
          (525,True,'结束写方向：FIN使用位置1033'),(605,False,'应用回执17B：字节区间 [7001,7018)')]
    for y,to_server,label in rows:
        s.line(168 if to_server else 952,y,952 if to_server else 168,y,BLUE,True)
        s.text(560,y-17,label,24,INK,500,'middle')
    s.rect(32,690,1056,63,'#edf7f3')
    s.text(52,730,'服务端先读到EOF，随后发回执；客户端已结束写入，仍能读取。',25,GREEN,550)
    s.save('v45-tcp-byte-positions',{'kind':'declared_sequence_arithmetic','client_isn':1000,'server_isn':7000,
                                  'request_bytes':32,'reply_bytes':4+len('已接收2条'.encode()),'packet_trace':False})


def frames():
    s=SVG(735,'两条中文消息的长度头与字节网格','每条4个汉字占12个UTF-8字节，再加4字节大端长度头。两帧各16字节，TCP不提供消息边界。')
    s.text(32,48,'“4个汉字”与“12个字节”是不同的长度',32,weight=650)
    s.text(32,92,'每帧：4B长度头 + 12B正文 = 16B；两帧共32B。',25,BLUE,550)
    for row,text in enumerate(['云上训练','恢复完成']):
        y=148+row*174
        values=list((len(text.encode()).to_bytes(4,'big')+text.encode()))
        s.text(32,y,text,26,weight=600)
        for i,value in enumerate(values):
            x=32+i*66
            s.text(x+30,y+34,row*16+i,18,MUTED,anchor='middle')
            s.rect(x,y+47,60,58,'#e8efff' if i<4 else '#eaf5ef')
            s.text(x+30,y+84,f'{value:02x}',24,BLUE if i<4 else GREEN,550,'middle')
        s.text(32,y+142,'00 00 00 0c → 正文12字节',22,BLUE)
        s.text(470,y+142,'UTF-8正文；收齐后再解码',22,GREEN)
    s.rect(32,516,1056,158,'#f5f7fb')
    s.text(54,558,'同一输入的三种解析对照',25,weight=600)
    s.text(54,600,'整段32B / 每次1B / 先2B再5B再25B',25,BLUE,550)
    s.text(54,644,'只要字节相同，完整消息都应为：“云上训练”“恢复完成”。',23)
    s.text(32,713,'网格是协议字节；真实recv块长是另一项运行观察。',22,MUTED)
    s.save('v45-tcp-frame-grid',{'kind':'byte_grid','payloads':['云上训练','恢复完成'],
                              'header_bytes':4,'wire_bytes':32,'source_sha256':RECORD['source_sha256']['tcp_framing.py']})


def readiness():
    result=RECORD['native']['epoll']
    s=SVG(815,'原生epoll的LT、ET与应用就绪队列','写入abcdef后先读ab，还剩cdef。无新写入时LT再次通知，ET不重复通知。应用队列用一次内核通知完成ab、cd、ef、EAGAIN四轮。')
    s.text(32,48,'内核没有新通知，缓冲里仍可能有数据',32,weight=650)
    s.text(32,92,'Linux实际管道：写入abcdef → 第一次通知 → 只读走ab。',23,MUTED)
    for x,label,color in [(32,'水平触发 LT',BLUE),(574,'边沿触发 ET',GREEN)]:
        s.rect(x,126,514,274,'#f4f7fc')
        s.text(x+24,172,label,27,color,600)
        for i,char in enumerate('cdef'):
            s.rect(x+24+i*100,200,84,64,'#edf2ff')
            s.text(x+66+i*100,243,char,29,BLUE,600,'middle')
        s.text(x+24,311,'管道还剩4字节；没有新的写入。',23)
        s.text(x+24,362,'再次poll → '+('可读通知' if label.endswith('LT') else '没有新事件'),26,color,600)
    s.text(32,456,'ET下保留应用处理责任：每轮最多读2B',26,weight=600)
    for i,label in enumerate(['ab','cd','ef','EAGAIN']):
        x=32+i*276;s.rect(x,486,228,81,'#eaf5ef' if i<3 else '#f2f4f8')
        s.text(x+114,538,label,29,GREEN if i<3 else MUTED,600,'middle')
        if i<3:s.line(x+234,526,x+270,526,BLUE,True)
    s.text(32,615,'内核通知1次；应用尝试4轮；到EAGAIN才暂时交回等待。',25,BLUE,550)
    s.rect(32,650,1056,105,'#fff5ed')
    s.text(54,693,'另一个实测：没有待发数据，却持续关注可写。',24,weight=550)
    s.text(54,732,'三次poll都返回可写；撤销写关注后，新通知为0。',24,RED)
    s.text(32,795,'这是通知与读写行为的证据，不是CPU占用或吞吐基准。',21,MUTED)
    s.save('v45-epoll-readiness',{'kind':'native_event_observations','execution':result,'ci':RECORD['ci']})


def logs():
    s=SVG(775,'数据页、redo、binlog与业务回执的分工','一次事务同时更新账户和插入回执。引擎页恢复材料与服务器事务事件分层记录；数据页可后续写回。图不表达固定fsync次数。')
    s.text(32,48,'同一笔事务，留下不同层次的恢复材料',32,weight=650)
    s.rect(32,98,1056,80,'#edf2ff')
    s.text(560,148,'事务：账户加20，并插入回执T102',28,BLUE,600,'middle')
    columns=[(32,'页、版本与undo','内存中的账户变为130','回滚与历史可见性'),
             (398,'redo日志','恢复相关页修改的记录','引擎崩溃恢复'),
             (764,'binlog行事件','账户的新值130 + 回执行','复制 / 备份后的重放')]
    for x,title,line1,line2 in columns:
        s.line(x+162,183,x+162,220,BLUE,True)
        s.rect(x,232,324,188,'#f4f7fb')
        s.text(x+18,277,title,26,BLUE,600)
        s.text(x+18,331,line1,21)
        s.text(x+18,384,line2,22,GREEN)
    s.text(32,471,'提交协调引擎状态与服务器日志；必要的持久化顺序必须满足。',25,weight=550)
    s.line(52,505,1060,505,BLUE,True)
    for x,label in [(52,'引擎准备'),(400,'相应日志保证'),(840,'完成提交')]:s.text(x,548,label,24,BLUE,550)
    s.rect(32,588,1056,112,'#edf7f3')
    s.text(54,631,'脏数据页可以随后写回：崩溃时依靠对应日志恢复一致状态。',24,GREEN,550)
    s.text(54,675,'业务回执与账户同事务，但仍需独立核对它们是否完整恢复。',23)
    s.text(32,744,'顺序示意；组提交可以合并物理工作，不按图中阶段数计算fsync。',21,MUTED)
    s.save('v45-mysql-log-roles',{'kind':'layer_and_commit_responsibilities','statement':'UPDATE balance+20; INSERT T102',
                                'declared_before':110,'declared_after':130,'fixed_fsync_count':False})


def boundary():
    mysql=RECORD['native']['mysql']
    s=SVG(755,'一致基线与两个binlog文件的恢复边界','从基线100开始，文件一含T101，文件二含T102、T103、T104、T105。目标停止在清零T104前，需完整连续材料。')
    s.text(32,48,'先选正确历史，再确定日志起点与停止位置',32,weight=650)
    s.text(32,91,'五笔均已提交；本次PITR选择清零之前，后续业务另外对账。',23,MUTED)
    s.rect(32,177,181,233,'#edf2ff')
    s.text(122,236,'一致基线',25,BLUE,600,'middle');s.text(122,303,'100',43,BLUE,600,'middle')
    s.text(122,366,'坐标随备份保存',19,MUTED,anchor='middle')
    s.text(247,153,'文件一',24,BLUE,600);s.text(415,153,'文件二',24,BLUE,600)
    events=[('T101','+10',110),('T102','+20',130),('T103','−5',125),('T104','清零',0),('T105','+7',7)]
    for i,(name,delta,balance) in enumerate(events):
        x=247+i*168;s.rect(x,177,153,233,'#eaf5ef' if i<3 else '#fff0ea')
        s.text(x+76,230,name,26,GREEN if i<3 else RED,600,'middle')
        s.text(x+76,289,delta,26,anchor='middle');s.text(x+76,363,balance,34,weight=600,anchor='middle')
    cut=743;s.line(cut,117,cut,443,RED,dashed=True)
    s.text(cut,482,'停止：T104开始前',24,RED,600,'middle')
    start=mysql['snapshot_next_event'];stop=mysql['exclude_bad_transaction_from']
    s.text(32,539,'实际基线起点：'+start['file']+' : '+str(start['position']),24,BLUE,550)
    s.text(32,581,'实际停止坐标：'+stop['file']+' : '+str(stop['position']),24,RED,550)
    s.rect(32,615,1056,81,'#f3f5f9')
    s.text(52,650,'同一次mysqlbinlog：起点作用于首文件，停止位置作用于末文件。',23)
    s.text(52,680,'坐标属于本次运行；读者重跑应使用自己基线与事务的实际位置。',21,MUTED)
    s.text(32,735,'T101等是业务操作ID，不是GTID；本例关闭GTID以单独讲清文件位置。',21,MUTED)
    s.save('v45-mysql-pitr-boundary',{'kind':'actual_log_boundary','source_sha256':RECORD['source_sha256']['mysql_restore.py'],
                                    'start':start,'stop':stop,'required_files':mysql['required_files'],'events':events})


def oracles():
    mysql=RECORD['native']['mysql']
    s=SVG(745,'相同余额125，不同的业务恢复结果','缺少首个日志和完整恢复都可得到余额125；前者回执缺T101，账本差额为10，不能通过验收。')
    s.text(32,48,'金额正确，仍可能少了一段业务历史',32,weight=650)
    headings=[(52,'恢复路径'),(390,'余额'),(535,'业务回执'),(893,'判断')]
    for x,label in headings:s.text(x,120,label,25,BLUE,600)
    rows=[('只装回基线','baseline_only','无','仍在目标之前'),('完整重放','full_replay','T101—T105','错误也回来'),
          ('漏掉第一个文件','missing_first_log','T102、T103','差额10，拒绝'),('连续重放到目标','point_in_time_recovery','T101、T102、T103','目标一致'),
          ('正确目标再写+3','post_restore_write','原3笔 + TNEW','新写入已验')]
    for i,(label,key,operations,result) in enumerate(rows):
        y=148+i*84;s.rect(32,y,1056,72,'#fff1e9' if i==2 else '#eaf5ef' if i>=3 else '#f3f5f9')
        s.text(52,y+46,label,23,weight=550);s.text(390,y+47,mysql[key]['balance'],31,RED if i==2 else GREEN if i>=3 else INK,600)
        s.text(535,y+46,operations,23);s.text(893,y+46,result,23,RED if i==2 else GREEN if i>=3 else MUTED,550)
    s.rect(32,595,1056,85,'#edf2ff')
    s.text(560,648,'125 − (100 + 20 − 5) = 10；缺失的T101不会由余额相等补回来。',26,BLUE,600,'middle')
    s.text(32,721,'数据来自隔离MySQL实际重放；通过余额、业务ID与账本关系分别验收。',21,MUTED)
    s.save('v45-mysql-recovery-checks',{'kind':'independent_business_oracles','cases':{r[1]:mysql[r[1]] for r in rows},
                                     'reconciliation_gap':mysql['missing_history_reconciliation_gap'],'ci':RECORD['ci']})


if __name__=='__main__':
    for draw in [sequence,frames,readiness,logs,boundary,oracles]:draw()
    print('Drew six original transport/recovery diagrams tied to declared arithmetic and actual environment results.')
