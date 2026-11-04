"""Original logical-index/timeline figures and observed SQLite callback plot."""
from html import escape
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/diagrams'
R=json.loads((ROOT/'dist/labs/sql-paths-snapshots/validation.json').read_text())
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


def covering():
    result=R['programs']['query_paths.py']['runs'][0]['cases']['covering']['result']
    s=SVG(790,'复合索引与覆盖索引的逻辑记录','同一租户和状态下，按created和id倒序。非覆盖时amount还需读取表行；覆盖索引包含该查询全部字段。这是逻辑示意，不是物理B树页或I/O计数。')
    s.text(32,46,'先定位 tenant=1、status=paid，再按时间顺序取 5 项',30,weight=650)
    s.text(32,85,'索引键：tenant → status → created DESC → id DESC；本例 created=1000+id。',22,MUTED)
    s.text(32,136,'非覆盖：索引里没有 amount',27,BLUE,600)
    for x,label in [(95,'tenant'),(230,'status'),(393,'created'),(556,'id'),(920,'表行 id → amount')]:s.text(x,182,label,22,MUTED,anchor='middle')
    for i,(ident,amount) in enumerate(result):
        y=202+i*49
        s.box(32,y,588,42,'#edf2fe')
        for x,value in [(95,1),(230,'paid'),(393,1000+ident),(556,ident)]:s.text(x,y+29,value,24,BLUE,anchor='middle')
        s.box(776,y,312,42,'#edf7f3')
        s.text(932,y+29,str(ident)+' → '+str(amount),24,GREEN,anchor='middle')
        s.arrow(634,y+21,761,y+21)
    s.text(650,475,'amount 需从表行取',22,MUTED)
    s.text(32,520,'覆盖：把 amount 也放入索引，仍保留同一查询顺序',27,GREEN,600)
    for x,label in [(105,'tenant'),(280,'status'),(485,'created'),(685,'id'),(915,'amount')]:s.text(x,563,label,22,MUTED,anchor='middle')
    for i,(ident,amount) in enumerate(result[:2]):
        y=584+i*50;s.box(32,y,1056,42,'#edf7f3',GREEN)
        for x,value in [(105,1),(280,'paid'),(485,1000+ident),(685,ident),(915,amount)]:s.text(x,y+29,value,25,GREEN,anchor='middle')
    s.text(560,704,'其余三项同理：全部所需字段已在索引中',23,MUTED,anchor='middle')
    s.text(32,759,'逻辑记录示意，非物理页图或磁盘访问计数；增添备注等返回字段后要重新核对覆盖。',22,MUTED)
    s.save('v35-covering-index',{'kind':'logical_index_layout','result':result,'physical_io_measured':False,'query_limit':5})


def callbacks():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.family':'Arial Unicode MS','svg.fonttype':'path','font.size':14})
    runs=R['programs']['query_paths.py']['runs']
    names=['no_index','tenant_only','composite','covering']
    labels=['无索引','仅 tenant','复合顺序','复合加 amount 覆盖']
    fig,ax=plt.subplots(figsize=(12,5.7),dpi=120)
    for offset,run,color in [(-.17,runs[0],BLUE),(.17,runs[1],GREEN)]:
        values=[run['cases'][name]['progress_callbacks_n1'] for name in names]
        bars=ax.barh([i+offset for i in range(4)],values,height=.29,color=color,label='SQLite '+run['sqlite'])
        for bar,value in zip(bars,values):ax.text(value+12,bar.get_y()+bar.get_height()/2,str(value),va='center',fontsize=13,color=color)
    ax.set_yticks(range(4),labels,fontsize=16);ax.invert_yaxis()
    ax.set_xlim(0,1250);ax.set_xlabel('N=1 进度回调次数（语句预热后）',fontsize=15,labelpad=12)
    ax.spines[['top','right','left']].set_visible(False);ax.set_axisbelow(True);ax.grid(axis='x',alpha=.15)
    ax.legend(loc='lower right',frameon=False,fontsize=13)
    fig.suptitle('同样返回 5 条订单，观察到的内部工作量不同',fontsize=22,y=.97)
    fig.text(.5,.045,'固定 240 行、固定查询；回调不是精确指令、扫描行、磁盘 I/O、耗时或跨版本性能分数。',ha='center',fontsize=12,color=MUTED)
    fig.tight_layout(rect=[0,.10,1,.91]);file=OUT/'v35-query-callbacks.svg'
    fig.savefig(file,bbox_inches='tight');plt.close(fig)
    metadata={'kind':'actual_sqlite_progress_callbacks','n':1,'cases':names,'runs':[{'sqlite':r['sqlite'],'callbacks':[r['cases'][name]['progress_callbacks_n1'] for name in names]}for r in runs], 'timing_measured':False}
    file.write_text(file.read_text().replace('</svg>','<metadata id="experiment-counts">'+escape(json.dumps(metadata))+'</metadata></svg>'))


def snapshot():
    observed=R['programs']['snapshot_retry.py']['runs'][1]
    s=SVG(940,'旧快照失败后，重新核对还是照搬旧值','实际SQLite/WAL两独立连接的交错顺序。R看100，W补10提交110，R仍看100且旧快照写入失败。回滚后重新核对得到105；照搬旧计算提交95。步骤不是测得时间。')
    s.text(32,46,'数据库可以提交，业务结果仍可能写错',32,weight=650)
    s.text(32,85,'实际两个 WAL 连接，一进程交错执行；下方按调用顺序排列，不是时间测量。',22,MUTED)
    s.text(280,136,'读者 R',28,BLUE,650,'middle');s.text(840,136,'补货者 W',28,GREEN,650,'middle')
    steps=[(32,168,'1 · BEGIN，读到库存 100',BLUE),(592,260,'2 · 补 10，COMMIT 后库存 110',GREEN),
           (32,352,'3 · 同一快照再读，仍是 100',BLUE),(32,444,'4 · 旧快照升级写入失败', '#a84444'),
           (32,550,'5 · ROLLBACK，结束旧快照',BLUE)]
    for x,y,text,color in steps:
        s.box(x,y,496,65,'#edf7f3' if color==GREEN else '#fff4f0' if color=='#a84444' else '#edf2fe')
        s.text(x+248,y+42,text,25,color,600,'middle')
    s.arrow(540,205,578,282);s.arrow(578,315,540,374);s.arrow(280,423,280,434)
    s.text(32,532,'本次 Python 3.12 返回 SQLITE_BUSY_SNAPSHOT（517）',22,'#a84444')
    s.arrow(280,618,280,657);s.arrow(510,618,840,657)
    for x,title,body,final,color in [(32,'6 · R 新事务重新核对','当前 110，检查条件再扣 5','7 · 提交后库存 105',GREEN),
                                  (592,'6 · R 新事务照搬旧计算','把旧 100−5=95 无条件写回','7 · 提交后库存 95','#a84444')]:
        s.box(x,670,496,166,'#edf7f3' if color==GREEN else '#fff4f0')
        s.text(x+24,711,title,26,color,600);s.text(x+24,759,body,24);s.text(x+24,809,final,27,color,600)
    s.text(32,884,'业务账本应是 100+10−5=105。回滚释放旧快照，不会替应用刷新旧决策。',24,weight=600)
    s.text(32,925,'两分支各用全新数据库；不是 InnoDB 锁、网络重试或多线程性能验证。',22,MUTED)
    s.save('v35-snapshot-retry',{'kind':'actual_local_wal_interleaving','sqlite':observed['sqlite'],'revalidate':observed['revalidate']['final_units'],'stale_absolute':observed['reuse_stale_absolute_value']['final_units'],'errorcode':observed['revalidate']['events'][3]['sqlite_errorcode']})


if __name__=='__main__':
    covering();callbacks();snapshot()
    print('Wrote logical index, observed callback plot and actual snapshot sequence.')
