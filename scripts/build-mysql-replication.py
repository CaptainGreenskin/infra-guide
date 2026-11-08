"""Build original diagrams/lesson/package only from a successful native MySQL record."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parents[1]
LAB=ROOT/'dist/labs/mysql-replication'
DIAGRAMS=ROOT/'dist/diagrams'


def dump(value):
    return json.dumps(value,ensure_ascii=False,indent=2)+'\n'


def text(x,y,value,style='body',anchor=None):
    return '<text x="'+str(x)+'" y="'+str(y)+'" class="'+style+'"'+(' text-anchor="'+anchor+'"' if anchor else '')+'>'+html.escape(str(value))+'</text>'


def rect(x,y,width,height,fill='#edf2ff',stroke='#d4dff3'):
    return f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="10" fill="{fill}" stroke="{stroke}"/>'


def line(x1,y1,x2,y2,color='#60718b',arrow=True,dashed=False):
    result=f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{color}" stroke-width="2.5" fill="none"'+(' stroke-dasharray="8 6"' if dashed else '')+'/>'
    if arrow:
        length=((x2-x1)**2+(y2-y1)**2)**.5
        dx,dy=(x2-x1)/length,(y2-y1)/length
        points=[(x2,y2),(x2-14*dx+5*dy,y2-14*dy-5*dx),(x2-14*dx-5*dy,y2-14*dy+5*dx)]
        result+='<polygon points="'+' '.join(str(x)+','+str(y) for x,y in points)+'" fill="'+color+'"/>'
    return result


def figure(name,height,title,desc,metadata,parts):
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img" aria-labelledby="title desc">
<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(desc)}</desc>
<metadata>{html.escape(json.dumps(metadata,ensure_ascii=False))}</metadata>
<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#60718b"/></marker></defs>
<style>text{{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;fill:#203047}}.title{{font-size:30px;font-weight:700}}.head{{font-size:25px;font-weight:650}}.body{{font-size:22px}}.small{{font-size:19px}}.muted{{fill:#60718b}}.blue{{fill:#315dce}}.bad{{fill:#a44328}}.good{{fill:#28664d}}</style>
<rect width="1120" height="{height}" fill="#f9fbff"/>
{text(32,48,title,'title')}
{text(32,82,desc,'small muted')}
'''+''.join(parts)+'</svg>\n'
    (DIAGRAMS/('mysql-replication-'+name+'.svg')).write_text(svg)


def draw(result):
    views=result['read_views'];p=[]
    p += [text(32,124,'同一账户，RR与RC顺序运行；横向只表示事件先后，不表示耗时比例。','small muted'),
          text(32,155,'蓝点是读连接动作，橙点是另一写连接提交；数字是该事件对应的账户值。','small muted')]
    # Two timelines separate commands, commits and each actual persistent reader.
    for title,top,points in [
        ('RR：开始事务后，首次读表才取得本例视图',198,
         [('开始RR',None),('提交+10',110),('首次读110',110),('提交+20',130),('仍读110',110),('提交读事务',None),('新读130',130)]),
        ('RC：同一事务，每条普通一致读取得新视图',470,
         [('开始RC',None),('首次读130',130),('提交+5',135),('再次读135',135),('提交读事务',None)])]:
        p.append(text(32,top,title,'head'))
        p.append(line(70,top+80,1070,top+80))
        step=980/max(1,len(points)-1)
        for index,(label,value) in enumerate(points):
            x=70+index*step
            write=label.startswith('提交+')
            p.append(f'<circle cx="{x}" cy="{top+80}" r="7" fill="'+('#b76a2e' if write else '#315dce')+'"/>')
            p.append(text(x,top+42,label.replace('提交+','写方提交+'),'small','middle'))
            if value is not None:p.append(text(x,top+128,str(value),'head blue','middle'))
    p += [rect(32,660,1056,98,'#eaf5ef'),text(52,697,'RR真实连接 '+str(views['rr']['first']['connection'])+'：110 → 110；结束读事务后130','body good'),
          text(52,732,'RC真实连接 '+str(views['rc']['first']['connection'])+'：130 → 135；两次仍在同一事务','body good'),
          text(32,795,'只对照普通SELECT；自身写入、锁定读和DDL有各自规则。','small muted')]
    figure('views',820,'同一实例：读视图决定这条查询能看见什么','从实际MySQL读数与连接ID生成。开始事务和首次普通读分别标出。',views,p)

    lag=result['lag'];p=[]
    boxes=[(32,'源提交','账户142 / 四笔回执'),(260,'binlog发送','本次目标G₁'),(488,'副本接收','已收到G₁'),(716,'relay log','等应用继续')]
    for x,title,detail in boxes:
        p += [rect(x,140,202,128),text(x+16,182,title,'head'),text(x+16,222,detail,'small')]
        if x<716:p.append(line(x+202,204,x+222,204))
    p += [line(918,204,1052,204),line(1052,204,1052,370),line(1052,370,950,370),
          rect(700,316,250,128,'#fff0e9','#e4bdac'),text(720,357,'应用线程已暂停','head bad'),text(720,400,'SQL_Running = No','small bad'),
          line(700,380,500,380,arrow=False,dashed=True),rect(210,316,280,128,'#edf7f0'),text(230,357,'副本新查询仍135','head good'),text(230,400,'不是旧事务造成的旧读','small')]
    p += [rect(32,490,1056,144,'#fff6dc','#e5d39b'),text(52,530,'接收集合包含G₁：'+str(lag['received_contains_target']),'head'),text(52,570,'执行集合包含G₁：'+str(lag['executed_contains_target'])+'；限时等待返回'+str(lag['wait_before_apply']),'head bad'),
          text(52,609,'本题准入：拒绝提前开放新写入；恢复应用后再等G₁并核对实际业务。','body')]
    p += [text(32,689,'G₁ = 本次源提交+7后取得的完整GTID集合，原值保存在执行记录。','small muted'),
          text(32,728,'接收运行：'+lag['status']['Replica_IO_Running']+'；应用运行：'+lag['status']['Replica_SQL_Running']+'；源 '+str(lag['source']['balance'])+' / 副本 '+str(lag['replica']['balance']),'body'),
          text(32,800,'图中各阶段表达职责；接收集合不是断电持久化或生产时延验收。','small muted')]
    figure('pipeline',840,'两实例：源已提交，副本也可能只接收未应用','单机真实异步复制；暂停SQL应用线程，I/O接收线程继续工作。',lag,p)

    switch=result['switchover'];p=[]
    steps=[('1 收回旧写','撤销业务写；super_read_only；两类写入实际被拒绝','#edf2ff'),
           ('2 固定交接目标','旧源冻结后取得G₂；此后不再接收本题的新写','#edf2ff'),
           ('3 候选追齐与核对','等待返回'+str(switch['wait'])+'；仅含G₂与先验B；两边142、四笔旧回执相同','#eaf5ef'),
           ('4 停止旧实例','旧容器Running = false；旧端实际写入失败','#fff0e9'),
           ('5 开放新端写入','新server UUID；NEW_WRITER +3；账本结果145','#eaf5ef')]
    for i,(label,detail,color) in enumerate(steps):
        y=128+i*125
        p += [rect(65,y,990,98,color),text(87,y+37,label,'head'),text(87,y+75,detail,'body')]
        if i<len(steps)-1:p.append(line(560,y+98,560,y+123))
    p += [text(32,800,'最终：100 + 10 + 20 + 5 + 7 + 3 = '+str(switch['oracle']['balance'])+'；账本差额 = '+str(switch['oracle']['ledger_difference']),'head good'),
          text(32,846,'本地停止旧容器兑现本题隔离；没有模拟失联旧主、跨机房或生产入口切流。','small muted')]
    figure('switch',880,'从能读到数据，走到只有新实例继续接收写入','计划切换按准入条件推进；任一步不成立，就不开放本题的新写。',switch,p)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record',type=Path,required=True)
    parser.add_argument('--run-url',required=True)
    parser.add_argument('--ci-commit',required=True)
    args=parser.parse_args()
    assert re.fullmatch(r'https://github\.com/CaptainGreenskin/infra-guide/actions/runs/\d+',args.run_url)
    assert re.fullmatch('[a-f0-9]{40}',args.ci_commit)
    native=json.loads(args.record.read_text())
    source=(LAB/'replication_lab.py').read_text()
    subprocess.run(['node','-e',"const fs=require('fs');require('./scripts/check-mysql-replication.cjs').verifyNative(JSON.parse(fs.readFileSync(process.argv[1])),fs.readFileSync('dist/labs/mysql-replication/replication_lab.py'));",str(args.record.resolve())],cwd=ROOT,check=True)
    (LAB/'native-record.json').write_bytes(args.record.read_bytes())
    record={'status':'passed','checked_on':native['verified_on'],
            'source_sha256':{name:hashlib.sha256((LAB/name).read_bytes()).hexdigest() for name in ['replication_lab.py','README.md','native-record.json']},
            'ci':{'run_url':args.run_url,'commit':args.ci_commit},'execution':native['result'],
            'scope':'Actual Linux Docker two-instance MySQL, read-view/GTID/apply-lag/planned-switch observations. No production HA or cross-host fencing claim.'}
    (LAB/'validation.json').write_text(dump(record))
    draw(native['result'])
    template=(ROOT/'scripts/mysql-replication.template.js').read_text()
    source_lines=source.splitlines()
    gate_start=next(i for i,line in enumerate(source_lines) if line.startswith('    allowed_target='))
    gate_lines=source_lines[gate_start:gate_start+4]
    assert gate_lines[-1].startswith('    assert unexpected_target==')
    gate_excerpt='\n'.join(line[4:] for line in gate_lines)
    template=template.replace('__MYSQL_REPLICATION_SOURCE__',json.dumps(source,ensure_ascii=False))
    template=template.replace('__MYSQL_REPLICATION_GATE_EXCERPT__',json.dumps(gate_excerpt,ensure_ascii=False))
    template=template.replace('__MYSQL_REPLICATION_EVIDENCE__',json.dumps({'verified_on':native['verified_on'],'ci':record['ci'],'read_views':native['result']['read_views'],'lag_target':native['result']['lag']['source_target']},ensure_ascii=False))
    (ROOT/'dist/mysql-replication.js').write_text(template)
    with zipfile.ZipFile(LAB.with_suffix('.zip'),'w',zipfile.ZIP_DEFLATED) as archive:
        for name in ['replication_lab.py','README.md','native-record.json','validation.json']:
            info=zipfile.ZipInfo('mysql-replication/'+name,date_time=(2026,11,8,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
            archive.writestr(info,(LAB/name).read_bytes())
    print('Built MySQL native evidence, original lesson, three diagrams and exact source ZIP.')


if __name__=='__main__':main()
