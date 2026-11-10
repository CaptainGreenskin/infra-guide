"""Draw the 14 authored field graphs from the same node/edge data as the site.

No third-party artwork or graph service. Long edges use outside lanes so they
cannot run through an unrelated concept. Numbers refer to the HTML edge legend.
"""
from pathlib import Path
import subprocess
import json
import html
import math

ROOT = Path(__file__).resolve().parent.parent
EXPORT = r"""
const fs=require('fs'),vm=require('vm'),c={};vm.createContext(c);
for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))
 if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c);
process.stdout.write(JSON.stringify(vm.runInContext('({maps:fieldConceptMaps,guides:fieldConceptReadings,names:Object.fromEntries(modules.map(m=>[m.id,m.name]))})',c)));
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
 'training': [['tr-input'],['tr-step','tr-ddp','tr-parallel'],['tr-memory','tr-collectives','tr-sharding'],['tr-recovery']],
 'platform': [['sv-contract','sv-release'],['sv-admission','sv-prefill'],['sv-optimizations','sv-kv','sv-batching'],['sv-quantization','sv-metrics']],
 'agent': [['ag-retrieval','ag-sandbox'],['ag-context','ag-runtime','ag-tools'],['ag-authorization','ag-planning'],['ag-fencing','ag-recovery'],['ag-observability','ag-evaluation']],
}

def escape(value):
    return html.escape(str(value), quote=True)

LABEL_SIZE, LABEL_HEIGHT = 22, 40
LABEL_GAP, NODE_GAP, EDGE_GAP = 18, 12, 8


def overlaps(a, b, gap=0):
    return (min(a[0]+a[2], b[0]+b[2])+gap > max(a[0], b[0]) and
            min(a[1]+a[3], b[1]+b[3])+gap > max(a[1], b[1]))


def segment_hits_box(p, q, bounds, gap=0):
    """Clip a real arrow segment against a padded label rectangle."""
    x, y, width, height = bounds
    x, y, width, height = x-gap, y-gap, width+2*gap, height+2*gap
    dx, dy = q[0]-p[0], q[1]-p[1]
    low, high = 0.0, 1.0
    for start, delta, lower, upper in ((p[0], dx, x, x+width), (p[1], dy, y, y+height)):
        if not delta:
            if start < lower or start > upper:
                return False
        else:
            a, b = (lower-start)/delta, (upper-start)/delta
            low, high = max(low, min(a, b)), min(high, max(a, b))
            if low > high:
                return False
    return True


def label_width(label):
    # CJK glyphs occupy a full em. Include the number, separator and padding;
    # counting just the verb made the old badges too optimistic at page width.
    return max(92, 28+sum(LABEL_SIZE if ord(c) > 255 else
                          LABEL_SIZE*.64 if c.isdigit() else LABEL_SIZE*.4
                          for c in label))


def render_at_spacing(key, graph, spacing):
    rows = ROWS[key]
    assert sorted(n[0] for n in graph['nodes']) == sorted(n for row in rows for n in row)
    width, box_width, box_height = 1120, 264, 84
    spacing = [spacing]*(len(rows)-1) if isinstance(spacing,int) else spacing
    main_edges = set(DATA['guides'][key]['main'])
    assert main_edges and all(0 <= i < len(graph['edges']) for i in main_edges)
    main_nodes = {node for i in main_edges for node in (graph['edges'][i][0],graph['edges'][i][2])}
    row_index = {node: ri for ri,row in enumerate(rows) for node in row}
    # A same-row arrow and a returning/long arrow must not share the same
    # horizontal run. Reserve distinct tracks in the gap above each row.
    tracks = {ri: [] for ri in range(len(rows))}
    for ei,(source,verb,target,why) in enumerate(graph['edges']):
        sr,tr = row_index[source],row_index[target]
        boundaries = [sr] if tr == sr else [] if tr == sr+1 else [sr if tr < sr else sr+1,tr]
        for boundary in boundaries:
            tracks[boundary].append(ei)
    for ri in tracks:
        tracks[ri] = sorted(set(tracks[ri]),key=lambda ei:(
            row_index[graph['edges'][ei][0]] == row_index[graph['edges'][ei][2]],
            ei in main_edges,-ei))
    def track_room(count):
        return 2*NODE_GAP+count*LABEL_HEIGHT+max(0,count-1)*LABEL_GAP+12
    if any(spacing[ri-1]-box_height < track_room(len(edges)) for ri,edges in tracks.items() if ri and edges):
        return None
    top = max(144, 98+track_room(len(tracks[0]))) if tracks[0] else 144
    row_y = [top]
    for step in spacing:
        row_y.append(row_y[-1]+step)
    height = row_y[-1]+box_height+84
    positions = {}
    for ri, row in enumerate(rows):
        gap = 34
        start = (width - len(row)*box_width - (len(row)-1)*gap)/2
        for ci, node in enumerate(row):
            positions[node] = (start + ci*(box_width+gap), row_y[ri], ri)
    track_y = {}
    for ri,edges in tracks.items():
        for index,ei in enumerate(edges):
            track_y[ri,ei] = (row_y[ri]-NODE_GAP-LABEL_HEIGHT/2-6
                              -(len(edges)-1-index)*(LABEL_HEIGHT+LABEL_GAP))
    # Distinct ports keep converging arrows legible before the arrowhead reaches
    # a concept. Sorting by the other endpoint retains the left-to-right order.
    connections = {}
    for ei,(source,verb,target,why) in enumerate(graph['edges']):
        sr,tr = row_index[source],row_index[target]
        face = 'top' if tr <= sr else 'bottom'
        for node,side,other,role in ((source,face,target,'source'),(target,'top',source,'target')):
            connections.setdefault((node,side),[]).append((positions[other][0],row_index[other],ei,role))
    ports = {}
    for (node,side),ends in connections.items():
        for index,(_,_,ei,role) in enumerate(sorted(ends)):
            offset = 0 if len(ends) == 1 else -116+232*index/(len(ends)-1)
            ports[ei,role] = positions[node][0]+box_width/2+offset
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
           f'<title id="title">{escape(DATA["names"][key])}：核心概念关系</title>',
           '<desc id="desc">箭头直接标明概念间的关系；粗线突出主干，细线补充其他依赖。数字对应正文说明，方向不表示所有概念串行执行。</desc>',
           '<defs><marker id="arrow-main" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#315fe5"/></marker><marker id="arrow-other" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#8b9bb3"/></marker></defs>',
           f'<rect width="{width}" height="{height}" rx="12" fill="#f8fafc"/>',
           '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">',
           f'<text x="560" y="48" text-anchor="middle" font-size="26" font-weight="650" fill="#20314e">{escape(DATA["names"][key])}</text>',
           '<text x="560" y="81" text-anchor="middle" font-size="18" fill="#536783">粗线：主干关系　细线：补充关系　箭头直接标明含义</text>',
           '<metadata>'+escape(json.dumps({'module':key,'main_edges':sorted(main_edges),'rows':rows},ensure_ascii=False))+'</metadata>']
    lane = 0
    edge_elements, relation_labels, arrow_points = [], [], []
    fractions = sorted((i/40 for i in range(41)), key=lambda t: (abs(t-.5), t))
    for ei, (source, verb, target, why) in enumerate(graph['edges']):
        sx, sy, sr = positions[source]
        tx, ty, tr = positions[target]
        sc, tc = ports[ei,'source'], ports[ei,'target']
        if tr == sr+1:
            y1, y2 = sy+box_height, ty
            mid = (y1+y2)/2
            path = f'M{sc} {y1} C{sc} {mid} {tc} {mid} {tc} {y2-4}'
            lx, ly = (sc+tc)/2, mid
            def point(t):
                return (sc+(tc-sc)*(3*t*t-2*t*t*t),
                        (1-t)**3*y1+3*(1-t)**2*t*mid+3*(1-t)*t*t*mid+t**3*(y2-4))
            candidates = [point(t) for t in fractions]
            samples = max(64, math.ceil((abs(tc-sc)+y2-y1)/3))
            points = [point(i/samples) for i in range(samples+1)]
        elif tr == sr:
            # Route above same-row nodes: relation words need more room than
            # the narrow gap between boxes, and must never be covered by a box.
            y = track_y[sr,ei]
            path = f'M{sc} {sy} V{y} H{tc} V{ty-4}'
            lx, ly = (sc+tc)/2, y
            candidates = [(sc+(tc-sc)*t,y) for t in fractions]
            points = [(sc,sy),(sc,y),(tc,y),(tc,ty-4)]
        else:
            # Outside the 2–3-column node area. A distinct lane per long edge.
            side = lane % 2
            margin = 26 + (lane//2)*12
            x = margin if side == 0 else width-margin
            lane += 1
            # Leave/enter vertically; horizontal runs stay in the gutters.
            start_y = sy if tr<sr else sy+box_height
            y1 = track_y[sr if tr<sr else sr+1,ei]
            y2 = track_y[tr,ei]
            path = f'M{sc} {start_y} V{y1} H{x} V{y2} H{tc} V{ty-4}'
            lx, ly = (sc+x)/2, y1
            candidates = [(sc+(x-sc)*t,y1) for t in fractions]+[(x+(tc-x)*t,y2) for t in fractions]
            points = [(sc,start_y),(sc,y1),(x,y1),(x,y2),(tc,y2),(tc,ty-4)]
        primary = ei in main_edges
        color, stroke, marker = ('#315fe5',3.8,'arrow-main') if primary else ('#8b9bb3',1.8,'arrow-other')
        dash = '' if primary else ' stroke-dasharray="5 4"'
        label = f'{ei+1} · {verb}'
        badge_width = label_width(label)
        edge_elements.append(f'<path data-edge="{escape(source)} {escape(target)}" data-emphasis="'+('main' if primary else 'other')+f'" d="{path}" fill="none" stroke="{color}" stroke-width="{stroke}"{dash} marker-end="url(#{marker})"/>')
        relation_labels.append((ei,primary,color,label,badge_width,candidates))
        arrow_points.append(points)
    # Keep the authored rows and arrows. Expand only a graph whose actual words
    # need more room: every badge remains on its own arrow and clears all other
    # arrows, nodes and labels, rather than merely covering a crossing with paint.
    svg += edge_elements
    occupied = [(x,y,box_width,box_height) for x,y,_ in positions.values()]
    occupied += [(0,0,width,98),(0,height-42,width,42)]
    choices = {}
    for ei,primary,color,label,badge_width,candidates in relation_labels:
        choices[ei] = []
        for lx,ly in candidates:
            lx = max(badge_width/2+8,min(width-badge_width/2-8,lx))
            bounds = (lx-badge_width/2,ly-LABEL_HEIGHT/2,badge_width,LABEL_HEIGHT)
            other_arrow = any(segment_hits_box(p,q,bounds,EDGE_GAP)
                              for other,points in enumerate(arrow_points) if other != ei
                              for p,q in zip(points,points[1:]))
            if not any(overlaps(bounds,b,NODE_GAP) for b in occupied) and not other_arrow:
                if bounds not in choices[ei]:
                    choices[ei].append(bounds)
        if not choices[ei]:
            return None
    def place(remaining,placed):
        if not remaining:
            return placed
        available={ei:[b for b in choices[ei] if not any(overlaps(b,p,LABEL_GAP) for p in placed.values())] for ei in remaining}
        ei=min(remaining,key=lambda k:(len(available[k]),k not in main_edges,k))
        for bounds in available[ei]:
            result=place([n for n in remaining if n!=ei],{**placed,ei:bounds})
            if result is not None:
                return result
        return None
    placement=place(list(choices),{})
    if placement is None:
        return None
    for ei,primary,color,label,badge_width,candidates in relation_labels:
        bounds=placement[ei];lx,ly=bounds[0]+badge_width/2,bounds[1]+LABEL_HEIGHT/2
        text_color = '#315fe5' if primary else '#536783'
        svg.append(f'<g data-relation-label="{ei+1}"><rect x="{bounds[0]}" y="{bounds[1]}" width="{badge_width}" height="{LABEL_HEIGHT}" rx="6" fill="#f8fafc"/><text x="{lx}" y="{ly+8}" text-anchor="middle" fill="{text_color}" font-size="{LABEL_SIZE}">{escape(label)}</text></g>')
    for ni, (node, label, meaning) in enumerate(graph['nodes']):
        x,y,_ = positions[node]
        fill = '#edf3ff' if node in main_nodes else '#fff'
        svg += [f'<g data-concept="{escape(node)}"><rect x="{x}" y="{y}" width="{box_width}" height="{box_height}" rx="9" fill="{fill}" stroke="#b9ccef" stroke-width="1.5"/>',
                f'<text x="{x+box_width/2}" y="{y+51}" text-anchor="middle" fill="#234d9f" font-size="26" font-weight="600">{escape(label)}</text></g>']
    svg += [f'<text x="560" y="{height-22}" text-anchor="middle" fill="#536783" font-size="17">先理解主干，再补充约束与反馈 · 点图放大</text>','</g></svg>']
    return '\n'.join(svg)+'\n'


def render(key, graph):
    for step in range(156, 497, 20):
        svg = render_at_spacing(key, graph, step)
        if svg is not None:
            # A busy first gap must not stretch an already clear lower chain.
            # Minimise each independent row gap after finding a valid layout.
            spacing = [step]*(len(ROWS[key])-1)
            for boundary in range(len(spacing)):
                for candidate in range(156,spacing[boundary],20):
                    trial = spacing.copy()
                    trial[boundary] = candidate
                    compact = render_at_spacing(key,graph,trial)
                    if compact is not None:
                        spacing,svg = trial,compact
                        break
            print(f'{key}: row steps {spacing}, {len(graph["edges"])} visible relation labels')
            return svg
    raise ValueError(f'{key}: arrows and relation labels require an authored layout review')


# Compute and validate the complete set before replacing any published asset.
drawings = {key: render(key,graph) for key,graph in DATA['maps'].items()}
for key, svg in drawings.items():
    (ROOT/'dist'/'diagrams'/f'field-{key}.svg').write_text(svg)
nodes = sum(len(graph['nodes']) for graph in DATA['maps'].values())
edges = sum(len(graph['edges']) for graph in DATA['maps'].values())
print(f'Drew {len(DATA["maps"])} field maps from {nodes} nodes and {edges} authored relationships.')
