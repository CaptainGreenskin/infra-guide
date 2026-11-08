"""Bind an actual Linux etcd record, authored chapter, figures and download package."""
import argparse
import hashlib
from html import escape
import json
from pathlib import Path
import re
import runpy
import zipfile

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT/'dist/labs/etcd-consensus'
DIAGRAMS = ROOT/'dist/diagrams'


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2)+'\n'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def label(x, y, text, size=22, color='#263448', weight=400, anchor='start'):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(text))}</text>'


def box(x, y, w, h, fill='#eef3ff', stroke='#cbd6eb', radius=10):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>'


def arrow(x1, y1, x2, y2, color='#5275b9', dashed=False):
    return f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{color}" stroke-width="3" marker-end="url(#arrow)"'+(' stroke-dasharray="9 7"' if dashed else '')+'/>'


def svg(name, height, title, description, metadata, content):
    text = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title><desc id="desc">{escape(description)}</desc>
<metadata>{escape(json.dumps(metadata,ensure_ascii=False,separators=(',',':')))}</metadata>
<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10" fill="#5275b9"/></marker></defs>
<rect width="1120" height="{height}" fill="#fbfcff"/>
<g font-family="-apple-system,BlinkMacSystemFont,'Noto Sans CJK SC','Microsoft YaHei',sans-serif">
{label(36,48,title,29,'#202d41',700)}
{label(36,83,description,18,'#65748a')}
{content}
</g></svg>'''
    (DIAGRAMS/f'etcd-consensus-{name}.svg').write_text(text+'\n')


def figures(record):
    o=record['observation'];initial=o['initial'];p=o['partition'];snapshot=o['snapshot'];rest=o['restore'];q=o['lost_quorum']
    members=initial['members'];alias={m['id']:m['name'].rsplit('-',1)[-1] for m in members}
    bits=[]
    bits += [box(36,132,246,116,'#f1f3f7'),label(59,169,'API 服务',24,weight=700),label(59,204,'校验、存取共享对象',20),label(59,231,'职责示意：本实验未运行',17,'#65748a'),arrow(286,190,365,190)]
    bits += [box(382,121,700,261,'#f7f9ff'),label(405,158,'真实 etcd 三成员：同一份 limit=37',23,weight=700)]
    for i,m in enumerate(members):
        x=405+i*221;leader=m['id']==initial['leader_id'];fill='#fff1d3' if leader else '#e9effd'
        bits += [box(x,187,200,102,fill),label(x+20,221,alias[m['id']],24,weight=700),label(x+20,255,'初始 leader' if leader else '投票成员',20)]
    bits += [label(405,333,'多数门槛 = floor(3/2)+1 = 2',24,'#315dce',700),label(405,363,'保存、提交、应用有职责差别；不要求三份同时应用',18,'#65748a')]
    bits += [box(36,452,256,101,'#f1f3f7'),label(57,488,'API 层观察接口',22,weight=700),label(57,522,'向客户端交付对象变化',18),box(382,452,310,101,'#e9f4ed'),label(405,488,'控制器本地缓存',22,weight=700),label(405,522,'收到事件，再推进调谐',18),box(780,452,302,101,'#f1f3f7'),label(803,488,'实际进程与用户结果',22,weight=700),label(803,522,'继续单独检查就绪与流量',18),arrow(298,503,374,503),arrow(698,503,772,503)]
    # The actual store is accessed through the API responsibility, not directly by controllers.
    bits += [f'<path d="M730 389 L730 438 L166 438 L166 447" fill="none" stroke="#5275b9" stroke-width="3" marker-end="url(#arrow)"/>',label(36,603,'本轮真实读取：',21,weight=700),label(213,603,'limit=37；全局 revision='+str(initial['read']['revision'])+'；该键 version=1',21),label(36,650,'etcd CLI 为实际执行；API、控制器和业务层为职责示意。',20,'#65748a'),label(36,686,'控制状态恢复，与应用持久卷或数据库恢复分别定义目标。',20,'#65748a')]
    svg('objects',740,'从 API 请求到共享状态，再到观察与执行','先定位各层职责，再进入三成员协议；箭头不表示一次 RPC 或固定耗时。',{'source_sha256':record['source_sha256'],'initial':initial,'conceptual_layers':['api','controller','business']},''.join(bits))

    bits=[label(70,132,'隔离侧：旧 leader '+alias[p['isolated_member_id']],23,weight=700),label(664,132,'多数侧：另外两个成员',23,weight=700),
          '<path d="M558 154 L558 824" stroke="#c5cfe0" stroke-width="2" stroke-dasharray="8 8"/>']
    rows=[(169,'① 分区前',f'limit=37；读状态 revision={snapshot["revision"]}','三个成员可共同提交'),
          (295,'② 断开专用网络','进程仍存活；客户端 exec 访问本机127.0.0.1',f'选出 {alias[p["majority_leader_id"]]}；任期 {initial["term"]} → {p["majority_term"]}'),
          (423,'③ 多数提交42',f'本地状态仍是37 / revision={p["minority_serializable"]["revision"]}',f'真实写入42 / revision={p["majority_after_write"]["revision"]}'),
          (551,'④ 按读语义观察','可陈旧读：37；默认读与写：退出码1','默认读：42；具备多数提交条件'),
          (685,'⑤ 恢复原网络',f'追平，默认读取42 / revision={p["after_rejoin"]["revision"]}','当前历史继续有效')]
    for y,title,left,right in rows:
        bits += [label(36,y,title,21,'#315dce',700),box(36,y+20,500,77,'#fff4e4' if y==551 else '#f0f4fd'),box(584,y+20,500,77,'#eaf4ee'),label(54,y+64,left,18),label(604,y+64,right,18)]
    bits += [arrow(596,765,526,765),label(36,846,'另行停机：3成员停掉2个 → 仅1个，无2票多数；恢复第二个原成员后写43成功。',19,'#46556a'),label(36,884,'记录的是同一宿主中的实际网络隔离与进程停机；纵向先后不是墙钟比例。',18,'#65748a')]
    svg('partition',920,'成员能返回37，不等于它能代表已提交的42','把网络、成员存活、读取语义和多数提交分别核对。',{'source_sha256':record['source_sha256'],'partition':p,'initial_term':initial['term'],'lost_quorum':q},''.join(bits))

    old_revision=q['all_members_recovered'][0]['revision'];sr=snapshot['revision'];br=rest['before_new_write']['revision'];ar=rest['after_new_write']['revision']
    bits=[box(38,130,320,119,'#eef3ff'),label(58,168,'快照：limit=37',25,weight=700),label(58,204,'revision='+str(sr),23),label(58,234,'这是恢复的数据基线',18,'#65748a'),arrow(369,190,445,190),box(458,130,280,119,'#eaf4ee'),label(479,168,'原集群继续写',24,weight=700),label(479,206,'42 → 43',24),label(479,234,'最后读 revision='+str(old_revision),18),box(801,130,280,119,'#fff1d3'),label(823,168,'观察者记得',24,weight=700),label(823,206,'旧 revision='+str(old_revision),23),label(823,234,'下一次想从'+str(old_revision+1)+'接续',18),
          arrow(197,257,197,337),box(38,350,700,153,'#f0ecfa'),label(60,389,'独立新集群恢复：数据37，revision='+str(br),26,weight=700),label(60,431,'本例声明 bump='+str(rest['bump_revision'])+'，并标记 mark-compacted',22),label(60,473,'旧数据没有因此变成43；键 mod_revision='+str(snapshot['captured']['rows']['/lesson/config/limit']['mod_revision'])+'，version='+str(snapshot['captured']['rows']['/lesson/config/limit']['version']),19,'#65748a'),
          arrow(941,260,941,352),box(800,368,280,135,'#fff0ee'),label(820,405,'旧观察起点被拒绝',22,weight=700),label(820,446,'compact_revision='+str(rest['old_watch']['compact_revision']),19),label(820,481,'缓存必须重新建立',20),
          arrow(940,511,940,575),box(626,590,454,150,'#edf4ff'),label(648,630,'重新列举：当前真实状态37',23,weight=700),label(648,671,'取得新R='+str(rest['relist']['revision']),21),label(648,706,'请求从R+1接续观察',21),arrow(620,647,551,647),box(38,590,500,150,'#e9f4ed'),label(60,630,'新写47，事件更新缓存',24,weight=700),label(60,671,'revision='+str(ar)+' > '+str(br),22),label(60,706,'缓存47 = 独立全量读取',21),
          label(38,778,'新集群身份不同，revision提升和缓存失效解决观察者接续问题。',21,'#46556a'),label(38,818,'快照之后的42/43属于原历史；不会由“恢复成功”自动补回。',21,'#46556a'),label(38,856,'真实记录：独立单成员教学恢复；不是 Kubernetes 全套或生产高可用验收。',18,'#65748a')]
    svg('recovery',880,'恢复不是让旧数据自动变成最新','全局revision、新集群身份、键的历史与观察者缓存，需要分别核对。',{'source_sha256':record['source_sha256'],'snapshot':snapshot,'restore':rest,'source_latest_revision':old_revision},''.join(bits))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record',type=Path,required=True)
    parser.add_argument('--run-url',required=True)
    parser.add_argument('--source-commit',required=True)
    args=parser.parse_args()
    assert re.fullmatch(r'https://github.com/CaptainGreenskin/infra-guide/actions/runs/\d+',args.run_url)
    assert re.fullmatch(r'[0-9a-f]{40}',args.source_commit)
    record=json.loads(args.record.read_text())
    assert record['status']=='passed' and record['cleanup']['complete'] and not record['cleanup']['remaining']
    assert record['source_sha256']['etcd_lab.py']==sha(LAB/'etcd_lab.py')
    program=runpy.run_path(str(LAB/'etcd_lab.py'))
    assert record['version']==program['VERSION'] and record['image']==program['IMAGE']
    program['verify'](record['observation'])
    validation={'checked_on':'2026-11-08','status':'passed',
                'source_sha256':{name:sha(LAB/name) for name in ['etcd_lab.py','README.md']},
                'origin':{'kind':'isolated Linux Docker in GitHub Actions','run_url':args.run_url,
                          'source_commit':args.source_commit},'execution':record}
    (LAB/'validation.json').write_text(dump(validation))
    chapter=ROOT/'dist/control-plane-consensus.js'
    source=chapter.read_text();start='// ETCD_CONSENSUS_DATA_START';end='// ETCD_CONSENSUS_DATA_END'
    evidence={**validation,'execution':{k:v for k,v in record.items() if k!='commands'}}
    replacement=start+'\nconst etcdConsensusSource = '+json.dumps((LAB/'etcd_lab.py').read_text(),ensure_ascii=False)+';\nconst etcdConsensusEvidence = '+json.dumps(evidence,ensure_ascii=False,separators=(',',':'))+';\n'
    source=source[:source.index(start)]+replacement+source[source.index(end):]
    chapter.write_text(source)
    figures(record)
    with zipfile.ZipFile(LAB.with_suffix('.zip'),'w',zipfile.ZIP_DEFLATED) as archive:
        for name in ['README.md','etcd_lab.py','validation.json']:
            archive.write(LAB/name,'etcd-consensus/'+name)
    print('PASS: actual Linux record preserved; source-bound chapter, three diagrams, validation and ZIP built.')


if __name__=='__main__':
    main()
