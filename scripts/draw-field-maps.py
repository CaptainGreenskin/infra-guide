"""Draw the 14 authored field graphs from the same node/edge data as the site.

No third-party artwork or graph service. Long edges use outside lanes so they
cannot run through an unrelated concept. Numbers refer to the HTML edge legend.
"""
from pathlib import Path
import subprocess
import json
import html

ROOT = Path(__file__).resolve().parent.parent
EXPORT = r"""
const fs=require('fs'),vm=require('vm'),c={};vm.createContext(c);
for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))
 if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c);
process.stdout.write(JSON.stringify(vm.runInContext('({maps:fieldConceptMaps,names:Object.fromEntries(modules.map(m=>[m.id,m.name]))})',c)));
"""
DATA = json.loads(subprocess.check_output(['node', '-e', EXPORT], cwd=ROOT))
# Explicit rows make the teaching intention reviewable. Feedback is an arrow,
# not a forced claim that all concepts form a linear pipeline.
ROWS = {
 'foundation': [['prerequisite-5'],['prerequisite-1','prerequisite-2'],['prerequisite-3','prerequisite-4']],
 'compute': [['service-model','resource-contract','fault-domain'],['control-data-plane'],['instance-lifecycle'],['vm-runtime'],['cpu-memory-placement']],
 'network': [['vpc-subnet','network-boundary','dns-discovery'],['route-overlay','nat-conntrack'],['lb-tls'],['transport-timeout'],['io-model']],
 'cloud-data': [['storage-model','cache-layer','messaging'],['storage-performance','database-service','replication-failover'],['durability-consistency','backup-restore']],
 'native': [['reconciliation','persistent-volume','autoscaling'],['workload-type','placement','configuration'],['container-isolation'],['health-rollout'],['service-network']],
 'serverless': [['trigger-delivery','concurrency-instances'],['event-idempotency','execution-environment','serverless-cost']],
 'cloud-delivery': [['ci-cd','iac','rollback-compatibility'],['artifact-contract','controller-api'],['gitops','release-strategy']],
 'cloud-security': [['secret-lifecycle','audit-accountability','execution-security'],['workload-identity'],['authentication-authorization'],['tenant-isolation']],
 'cloud-capacity': [['performance-budget','cost-efficiency'],['capacity-units','scaling-delay'],['queue-backpressure']],
 'sre': [['sli-slo'],['observability-signals','alert-burn','resilience-patterns'],['diagnosis-method'],['incident-change','recovery-evidence']],
 'model-foundations': [['mf-tensors'],['mf-attention','mf-gpu'],['mf-decoder','mf-roofline'],['mf-autograd']],
 'training': [['tr-input','tr-ddp','tr-recovery'],['tr-step','tr-collectives','tr-parallel'],['tr-memory','tr-sharding']],
 'platform': [['sv-release','sv-batching','sv-quantization'],['sv-contract','sv-metrics'],['sv-admission','sv-prefill','sv-optimizations'],['sv-kv']],
 'agent': [['ag-retrieval','ag-authorization','ag-sandbox'],['ag-context','ag-fencing','ag-observability'],['ag-runtime','ag-recovery','ag-evaluation'],['ag-tools']],
}

def escape(value):
    return html.escape(str(value), quote=True)

def render(key, graph):
    rows = ROWS[key]
    assert sorted(n[0] for n in graph['nodes']) == sorted(n for row in rows for n in row)
    width, box_width, box_height, step = 1120, 264, 84, 156
    height = 170 + len(rows) * step
    positions = {}
    for ri, row in enumerate(rows):
        gap = 34
        start = (width - len(row)*box_width - (len(row)-1)*gap)/2
        for ci, node in enumerate(row):
            positions[node] = (start + ci*(box_width+gap), 116 + ri*step, ri)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
           f'<title id="title">{escape(DATA["names"][key])}：核心概念关系</title>',
           '<desc id="desc">箭头连接真实概念，数字对应正文关系说明。方向表示作用或依赖，不表示全部串行执行。</desc>',
           '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#7590bd"/></marker></defs>',
           f'<rect width="{width}" height="{height}" rx="12" fill="#f8fafc"/>',
           '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">',
           f'<text x="560" y="48" text-anchor="middle" font-size="26" font-weight="650" fill="#20314e">{escape(DATA["names"][key])}</text>',
           '<text x="560" y="81" text-anchor="middle" font-size="18" fill="#536783">方框：概念　箭头：作用或依赖</text>']
    lane = 0
    for ei, (source, verb, target, why) in enumerate(graph['edges']):
        sx, sy, sr = positions[source]
        tx, ty, tr = positions[target]
        sc, tc = sx+box_width/2, tx+box_width/2
        if tr == sr+1:
            y1, y2 = sy+box_height, ty
            mid = (y1+y2)/2
            path = f'M{sc} {y1} C{sc} {mid} {tc} {mid} {tc} {y2-4}'
            lx, ly = (sc+tc)/2, mid
        elif tr == sr:
            rightward = tx > sx
            x1 = sx+box_width if rightward else sx
            x2 = tx if rightward else tx+box_width
            y = sy+box_height/2
            path = f'M{x1} {y} L{x2+(-4 if rightward else 4)} {y}'
            lx, ly = (x1+x2)/2, y
        else:
            # Outside the 2–3-column node area. A distinct lane per long edge.
            side = lane % 2
            margin = 26 + (lane//2)*12
            x = margin if side == 0 else width-margin
            lane += 1
            # Leave/enter vertically; horizontal runs stay in the gutters.
            y1, y2 = sy+box_height+18, ty-18
            path = f'M{sc} {sy+box_height} V{y1} H{x} V{y2} H{tc} V{ty-4}'
            lx, ly = x, (y1+y2)/2
        svg += [f'<path data-edge="{escape(source)} {escape(target)}" d="{path}" fill="none" stroke="#7590bd" stroke-width="2.3" marker-end="url(#arrow)"/>',
                f'<g><circle cx="{lx}" cy="{ly}" r="13" fill="#fff" stroke="#7590bd"/><text x="{lx}" y="{ly+5}" text-anchor="middle" fill="#36527e" font-size="16">{ei+1}</text></g>']
    for ni, (node, label, meaning) in enumerate(graph['nodes']):
        x,y,_ = positions[node]
        svg += [f'<g data-concept="{escape(node)}"><rect x="{x}" y="{y}" width="{box_width}" height="{box_height}" rx="9" fill="#fff" stroke="#b9ccef" stroke-width="1.5"/>',
                f'<text x="{x+18}" y="{y+24}" fill="#6a7f9e" font-size="15">概念 {ni+1:02d}</text>',
                f'<text x="{x+box_width/2}" y="{y+58}" text-anchor="middle" fill="#234d9f" font-size="26" font-weight="600">{escape(label)}</text></g>']
    svg += [f'<text x="560" y="{height-28}" text-anchor="middle" fill="#536783" font-size="17">圆圈数字对应正文箭头说明 · 点图放大</text>','</g></svg>']
    return '\n'.join(svg)+'\n'

for key, graph in DATA['maps'].items():
    (ROOT/'dist'/'diagrams'/f'field-{key}.svg').write_text(render(key, graph))
print(f'Drew {len(DATA["maps"])} field maps from 100 nodes and 87 authored relationships.')
