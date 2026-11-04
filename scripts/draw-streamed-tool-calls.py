"""Original layer and byte-grid diagrams bound to actual local HTTP fixtures."""
import codecs
from html import escape
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode=True

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/diagrams'
LAB=ROOT/'dist/labs/streamed-tool-calls'
RECORD=json.loads((LAB/'validation.json').read_text())
R=RECORD['runs'][0]['results']
BLUE,GREEN,INK,MUTED='#315dce','#287b69','#1c283d','#6b768b'


class SVG:
    def __init__(self,height,title,description):
        self.parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img" aria-labelledby="title desc">',
                    '<title id="title">'+escape(title)+'</title><desc id="desc">'+escape(description)+'</desc>',
                    '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9" fill="#6b768b"/></marker></defs>',
                    '<style>text{font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif}</style>',
                    f'<rect width="1120" height="{height}" fill="white"/>']
    def text(self,x,y,text,size=24,color=INK,weight=400,anchor='start'):
        self.parts.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(text))}</text>')
    def box(self,x,y,w,h,fill='#f2f5fa',stroke='#e4e9f0'):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
    def arrow(self,x1,y1,x2,y2):
        self.parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{MUTED}" stroke-width="2.5" marker-end="url(#arrow)"/>')
    def save(self,name,metadata):
        self.parts.append('<metadata>'+escape(json.dumps(metadata,ensure_ascii=False))+'</metadata>')
        (OUT/(name+'.svg')).write_text('\n'.join(self.parts+['</svg>']))


def boundaries():
    normal=R['normal']
    s=SVG(890,'流式工具执行的五层边界','正常固定流287字节，客户端41次读取，3个完整事件，最终1次本地只读回调。字节、字符、事件、参数和调用准入分别判定。')
    s.text(32,46,'流里出现了工具参数，什么时候才能执行',32,weight=650)
    s.text(32,85,'本实验声明 start / delta / done 事件；真实协议要映射自己的完结信号。',22,MUTED)
    stages=[('传输层','HTTP 响应体 287 B，客户端读取 41 次','发送块最多 11 B；每次读取最多 7 B，不等于字符边界'),
            ('事件层','先增量解码 UTF-8，再按空行完成事件','正常流得到 3 个完整事件；data 多行先拼合'),
            ('调用层','按 call_id 收集 delta，等对应 done','前缀能解析成 JSON，仍不能提前执行'),
            ('准入层','解析全部参数，检查结构、名称与授权','limit 必须为整数；租户 B 不在本次委托内'),
            ('执行层','本地只读回调 1 次，保留当前进程观察','观察记录不等于持久回执，也不单独证明任务完成')]
    for i,(layer,main,detail) in enumerate(stages):
        y=124+i*133
        s.text(32,y+44,layer,27,BLUE,600)
        s.box(230,y,858,95,'#edf7f3' if i==4 else '#edf2fe',GREEN if i==4 else '#e4e9f0')
        s.text(254,y+38,main,27,GREEN if i==4 else BLUE,600)
        s.text(254,y+75,detail,22,MUTED)
        if i<4:s.arrow(658,y+102,658,y+125)
    s.text(32,828,'尚未准入的调用保持未执行；已经执行的调用保留事实，流错误另记。',24,weight=600)
    s.text(32,869,'顺序与计数来自实际本机 HTTP 固定流；没有调用真实模型或远端工具。',22,MUTED)
    s.save('v37-stream-boundaries',{'kind':'actual_local_http_with_declared_tool_envelopes','body_bytes':normal['bytes_read'],'reads':normal['reads'],'read_size':normal['read_size'],'events':normal['events'],'local_tool_calls':normal['local_tool_calls'],'durable_receipt':False})


def byte_grid():
    spec=importlib.util.spec_from_file_location('stream_fixture',LAB/'streamed_tool_calls.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    body=module.fixtures()['normal'];start=body.index('中国区日报'.encode('utf-8'))
    first,last=start//7,(start+len('中国区日报'.encode('utf-8'))-1)//7
    dec=codecs.getincrementaldecoder('utf-8')('strict');rows=[]
    for i in range(last+1):
        raw=body[i*7:(i+1)*7];text=dec.decode(raw)
        if i>=first:
            try:raw.decode('utf-8');independent=True
            except UnicodeDecodeError:independent=False
            rows.append({'read':i+1,'offset':i*7,'bytes':list(raw),
                         'independent_decode':independent,
                         'chinese_output':''.join(c for c in text if '\u4e00'<=c<='\u9fff'),
                         'pending_bytes':list(dec.getstate()[0])})
    assert len(rows)==3
    s=SVG(800,'实际七字节读取如何切开中文UTF-8','正常流的第28至30次读取，字节偏移189至209；前两块独立解码失败，增量输出依次为中、国区日、报。')
    s.text(32,46,'读了 7 字节，不保证刚好读完一个汉字',32,weight=650)
    s.text(32,85,'“中”是 E4 B8 AD，“国”是 E5 9B BD；按实际响应体字节排列，偏移从 0 起算。',22,MUTED)
    for i,row in enumerate(rows):
        top=144+i*181
        s.text(32,top+38,'读取 '+str(row['read']),27,BLUE,600)
        s.text(32,top+79,'偏移 '+str(row['offset'])+'–'+str(row['offset']+len(row['bytes'])-1),21,MUTED)
        for j,value in enumerate(row['bytes']):
            x=240+j*82;position=row['offset']+j
            in_chinese=start<=position<start+15
            color=BLUE if (position-start)//3%2==0 else GREEN
            s.box(x,top,72,62,'#edf2fe' if in_chinese and color==BLUE else '#edf7f3' if in_chinese else '#f2f5fa')
            s.text(x+36,top+42,format(value,'02X'),28,color if in_chinese else MUTED,600,'middle')
        good=row['independent_decode'];s.text(850,top+29,'单块独立 decode',21,MUTED)
        s.text(850,top+65,'可行' if good else '失败',28,GREEN if good else '#a84444',600)
        pending=' '.join(format(v,'02X') for v in row['pending_bytes']) or '无'
        s.text(240,top+114,'增量输出：'+row['chinese_output']+'；待补字节：'+pending,25,GREEN,600)
    s.text(32,734,'正常流 287 B、41 次读取；独立逐块解码实际失败 2 次，增量方式保留字符状态。',23,weight=600)
    s.text(32,778,'可解码只解决字符边界；完整 SSE 事件、完整工具参数与调用授权仍须分别判断。',22,MUTED)
    s.save('v37-utf8-reads',{'kind':'actual_fixed_stream_read_boundaries','fixture_sha256':RECORD['runs'][0]['fixture_sha256']['normal'],'read_size':7,'rows':rows,'naive_decode_errors':R['normal']['naive_chunk_decode_errors']})


if __name__=='__main__':
    boundaries();byte_grid()
    print('Wrote layer boundary and observed UTF-8 byte-grid diagrams.')
