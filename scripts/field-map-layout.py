#!/usr/bin/env python3
"""Independent geometry checks of actual field SVG output; stdlib only.

Does not import draw-field-maps.py or trust metadata/claimed bounding boxes.
Text extents are conservative advance estimates, NOT browser font measurements.
Foreign-edge intersections use the actual path, stroke width and label rectangle.
Baseline mode reads pinned git objects without checking out or changing files.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import unicodedata
import xml.etree.ElementTree as ET

BASELINE = 'd8b72dc0520f6a86d1871514c99bdf57eb3ce738'
NUM = r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?'
TOKEN = re.compile(r'[A-Za-z]|' + NUM)
IDENTITY = (1., 0., 0., 1., 0., 0.)


def number(value, default=0.):
    if value is None:
        return default
    if not re.fullmatch(NUM + r'(?:px)?', str(value).strip()):
        raise ValueError('Unsupported coordinate/font unit: ' + str(value))
    return float(re.match(NUM, str(value)).group())


def multiply(a, b):
    a0, a1, a2, a3, a4, a5 = a
    b0, b1, b2, b3, b4, b5 = b
    return (a0*b0+a2*b1, a1*b0+a3*b1, a0*b2+a2*b3,
            a1*b2+a3*b3, a0*b4+a2*b5+a4, a1*b4+a3*b5+a5)


def transform(value):
    result = IDENTITY
    if not value:
        return result
    parts = list(re.finditer(r'(matrix|translate|scale)\s*\(([^)]*)\)', value))
    remainder = re.sub(r'(matrix|translate|scale)\s*\([^)]*\)', '', value)
    if remainder.strip(' ,\t\r\n'):
        raise ValueError('Unsupported transform: ' + value)
    for part in parts:
        kind, raw = part.groups()
        v = [float(x) for x in re.findall(NUM, raw)]
        if kind == 'matrix' and len(v) == 6:
            item = tuple(v)
        elif kind == 'translate' and len(v) in (1, 2):
            item = (1., 0., 0., 1., v[0], v[1] if len(v) == 2 else 0.)
        elif kind == 'scale' and len(v) in (1, 2):
            item = (v[0], 0., 0., v[1] if len(v) == 2 else v[0], 0., 0.)
        else:
            raise ValueError('Invalid transform: ' + value)
        result = multiply(result, item)
    # This graph family uses untransformed paths. Translation is also used by
    # the independent relocation negative control. Reject other affine changes
    # rather than underestimate their effective stroke radius or marker scale.
    if any(abs(result[i]-IDENTITY[i]) > 1e-12 for i in range(4)):
        raise ValueError('Non-translation SVG transforms are outside this regression scope')
    return result


def point(p, matrix):
    a, b, c, d, e, f = matrix
    return (a*p[0]+c*p[1]+e, b*p[0]+d*p[1]+f)


def extent(points):
    xs, ys = zip(*points)
    return (min(xs), min(ys), max(xs), max(ys))


def rect(el, matrix):
    x, y = number(el.get('x')), number(el.get('y'))
    w, h = number(el.get('width')), number(el.get('height'))
    return extent([point(v, matrix) for v in [(x, y), (x+w, y), (x, y+h), (x+w, y+h)]])


def expand(box, padding):
    return (box[0]-padding, box[1]-padding, box[2]+padding, box[3]+padding)


def intersects(a, b):
    return min(a[2], b[2]) > max(a[0], b[0])+1e-7 and min(a[3], b[3]) > max(a[1], b[1])+1e-7


def contains(outer, inner, margin=0.):
    return (inner[0] >= outer[0]+margin and inner[1] >= outer[1]+margin
            and inner[2] <= outer[2]-margin and inner[3] <= outer[3]-margin)


def advance(text, font):
    # Explicit, reviewable estimates; widths come from actual text/font size.
    # CJK W/F glyphs are one em. Latin is deliberately rounded upwards.
    width = 0.
    for ch in text:
        if unicodedata.combining(ch):
            unit = 0.
        elif unicodedata.east_asian_width(ch) in ('W', 'F'):
            unit = 1.
        elif ch.isspace():
            unit = .34
        elif ch in '·•':
            unit = .60
        elif ch.isdigit():
            unit = .64
        elif ch.isupper():
            unit = .74
        elif ch.islower():
            unit = .62
        else:
            unit = .60
        width += unit*font
    return width


def text_box(el, style, matrix):
    if len(el):
        raise ValueError('Multiline/tspan text needs a browser measurement')
    text = ''.join(el.itertext()).strip()
    if el.get('textLength') or el.get('rotate'):
        raise ValueError('textLength/rotate is not supported by estimate')
    font = number(style.get('font-size'), 16.)
    w = advance(text, font) + max(0, len(text)-1)*number(style.get('letter-spacing'))
    x, y = number(el.get('x')), number(el.get('y'))
    anchor = style.get('text-anchor', 'start')
    left = x-w/2 if anchor == 'middle' else x-w if anchor == 'end' else x
    box = extent([point(v, matrix) for v in [(left, y-.90*font), (left+w, y-.90*font),
                                            (left, y+.25*font), (left+w, y+.25*font)]])
    return {'text': text, 'font_size': font, 'estimated_bounds': box,
            'font_family': style.get('font-family', 'unspecified')}


def line_hits(a, b, box):
    # Liang-Barsky clipping: actual segment versus an expanded rectangle.
    dx, dy = b[0]-a[0], b[1]-a[1]
    lo, hi = 0., 1.
    for p, q in [(-dx, a[0]-box[0]), (dx, box[2]-a[0]),
                 (-dy, a[1]-box[1]), (dy, box[3]-a[1])]:
        if abs(p) < 1e-12:
            if q < 0:
                return False
        else:
            t = q/p
            if p < 0:
                lo = max(lo, t)
            else:
                hi = min(hi, t)
            if lo > hi:
                return False
    return True


def distance_to_boundary(p, box):
    x0,y0,x1,y1 = box
    dx,dy = max(x0-p[0],0.,p[0]-x1), max(y0-p[1],0.,p[1]-y1)
    if dx or dy:
        return math.hypot(dx,dy)
    return min(p[0]-x0,x1-p[0],p[1]-y0,y1-p[1])


def path_segments(data, matrix):
    tokens = TOKEN.findall(data)
    if re.sub(r'[\s,]', '', TOKEN.sub('', data)):
        raise ValueError('Unparsed path data')
    commands = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'Q': 4, 'Z': 0}
    at, command, current, start = 0, None, (0., 0.), (0., 0.)
    segments, maximum_error = [], 0.
    while at < len(tokens):
        if tokens[at].isalpha():
            command = tokens[at]
            at += 1
        if command is None or command.upper() not in commands:
            raise ValueError('Unsupported SVG path command: ' + str(command))
        upper, relative = command.upper(), command.islower()
        count = commands[upper]
        values = [float(x) for x in tokens[at:at+count]]
        if len(values) != count:
            raise ValueError('Incomplete path command')
        at += count
        def xy(x, y):
            return (x+current[0], y+current[1]) if relative else (x, y)
        if upper == 'M':
            current = xy(*values)
            start = current
            command = 'l' if relative else 'L'
            continue
        if upper == 'Z':
            target = start
        elif upper == 'H':
            target = (current[0]+values[0] if relative else values[0], current[1])
        elif upper == 'V':
            target = (current[0], current[1]+values[0] if relative else values[0])
        elif upper == 'L':
            target = xy(*values)
        elif upper in ('C', 'Q'):
            controls = [current]+[xy(values[i], values[i+1]) for i in range(0, count, 2)]
            controls = [point(v, matrix) for v in controls]
            n = 128
            second = [(controls[i+2][0]-2*controls[i+1][0]+controls[i][0],
                       controls[i+2][1]-2*controls[i+1][1]+controls[i][1]) for i in range(len(controls)-2)]
            multiplier = 6 if upper == 'C' else 2
            error = multiplier*max(math.hypot(*v) for v in second)/(8*n*n)
            maximum_error = max(maximum_error, error)
            previous = controls[0]
            for sample in range(1, n+1):
                t = sample/n
                if upper == 'C':
                    weights = [(1-t)**3, 3*(1-t)**2*t, 3*(1-t)*t*t, t**3]
                else:
                    weights = [(1-t)**2, 2*(1-t)*t, t*t]
                value = tuple(sum(w*p[axis] for w,p in zip(weights,controls)) for axis in (0,1))
                segments.append((previous, value))
                previous = value
            current = xy(values[-2], values[-1])
            continue
        segments.append((point(current, matrix), point(target, matrix)))
        current = target
        if upper == 'Z':
            # Z has no implicit numeric repetition. Without resetting this,
            # malformed "Z 10 20" would repeatedly consume zero tokens.
            command = None
    return segments, maximum_error


def parse_svg(raw):
    root = ET.fromstring(raw)
    if any(el.tag.rsplit('}', 1)[-1] in ('style', 'use', 'foreignObject') for el in root.iter()):
        raise ValueError('External/CSS/reused content requires browser geometry')
    view = [float(x) for x in root.get('viewBox').split()]
    nodes, labels, edges, texts = {}, {}, [], []
    def walk(el, inherited, matrix, owner=None):
        style = dict(inherited)
        style.update(el.attrib)
        for declaration in el.get('style', '').split(';'):
            if ':' in declaration:
                key, value = declaration.split(':', 1)
                style[key.strip()] = value.strip()
        matrix = multiply(matrix, transform(el.get('transform')))
        if el.get('data-concept'):
            owner = {'id': el.get('data-concept'), 'kind': 'node', 'texts': [], 'rectangles': []}
            if owner['id'] in nodes:
                raise ValueError('Duplicate actual concept group: '+owner['id'])
            nodes[owner['id']] = owner
        if el.get('data-relation-label'):
            owner = {'id': el.get('data-relation-label'), 'kind': 'label', 'texts': [], 'rectangles': []}
            if owner['id'] in labels:
                raise ValueError('Duplicate actual relation group: '+owner['id'])
            labels[owner['id']] = owner
        tag = el.tag.rsplit('}', 1)[-1]
        if tag == 'rect' and owner:
            owner['rectangles'].append(rect(el, matrix))
        if tag == 'text':
            item = text_box(el, style, matrix)
            item['owner'] = None if not owner else owner['kind']+':'+owner['id']
            texts.append(item)
            if owner:
                owner['texts'].append(item)
        if el.get('data-edge'):
            segments, error = path_segments(el.get('d'), matrix)
            edges.append({'id': str(len(edges)+1), 'nodes': el.get('data-edge').split(),
                          'emphasis': el.get('data-emphasis'), 'segments': segments,
                          'stroke': number(style.get('stroke-width'), 1.), 'curve_error_bound': error})
        for child in el:
            walk(child, style, matrix, owner)
    walk(root, {}, IDENTITY)
    for group in list(nodes.values())+list(labels.values()):
        if len(group['rectangles']) != 1 or len(group['texts']) != 1:
            raise ValueError('Expected one actual rect and one single-line text in '+group['id'])
        group['box'] = group['rectangles'][0]
        group['text'] = group['texts'][0]
    return {'view': (view[0],view[1],view[0]+view[2],view[1]+view[3]),
            'nodes': nodes, 'labels': labels, 'edges': edges, 'texts': texts}


def check(name, raw, expected, args):
    svg = parse_svg(raw)
    issues, warnings = [], []
    def add(kind, **detail):
        # Estimated font bounds are auxiliary, never a fabricated hard overlap.
        target = warnings if kind.startswith('estimated_') else issues
        target.append({'kind': kind, **detail})
    # Semantics compared with old actual SVG, not generator metadata/count claims.
    if expected is not None:
        if {k:v['text']['text'] for k,v in svg['nodes'].items()} != {k:v['text']['text'] for k,v in expected['nodes'].items()}:
            add('concept_identity_or_text_changed')
        if [(x['nodes'],x['emphasis']) for x in svg['edges']] != [(x['nodes'],x['emphasis']) for x in expected['edges']]:
            add('edge_identity_order_or_emphasis_changed')
        if {k:v['text']['text'] for k,v in svg['labels'].items()} != {k:v['text']['text'] for k,v in expected['labels'].items()}:
            add('relation_number_or_text_changed')
    if set(svg['labels']) != {str(i+1) for i in range(len(svg['edges']))}:
        add('edge_label_correspondence')
    for edge in svg['edges']:
        if len(edge['nodes']) != 2 or any(n not in svg['nodes'] for n in edge['nodes']):
            add('edge_has_unknown_endpoint', edge=edge['id'], nodes=edge['nodes'])
        elif not edge['segments']:
            add('edge_has_no_drawn_segment',edge=edge['id'])
        else:
            start,end = edge['segments'][0][0],edge['segments'][-1][1]
            source,target = (svg['nodes'][n] for n in edge['nodes'])
            ds,dt = distance_to_boundary(start,source['box']),distance_to_boundary(end,target['box'])
            if ds > args.endpoint_gap+1e-7:
                add('edge_start_far_from_declared_source',edge=edge['id'],node=source['id'],distance=ds)
            if dt > args.endpoint_gap+1e-7:
                add('edge_end_far_from_declared_target',edge=edge['id'],node=target['id'],distance=dt)
    if len({tuple(x['nodes']) for x in svg['edges']}) != len(svg['edges']):
        add('duplicate_edge_pair')
    for text in svg['texts']:
        if not contains(svg['view'], text['estimated_bounds']):
            add('estimated_text_clipped', text=text['text'], box=text['estimated_bounds'])
    nodes, labels = list(svg['nodes'].values()), list(svg['labels'].values())
    for group in nodes+labels:
        if not contains(group['box'], group['text']['estimated_bounds'], args.text_margin):
            add('estimated_text_not_padded_in_own_rect', owner=group['kind']+':'+group['id'],
                text=group['text']['text'], estimated=group['text']['estimated_bounds'], actual_rect=group['box'])
    for i, label in enumerate(labels):
        own = next((edge for edge in svg['edges'] if edge['id'] == label['id']), None)
        if own is not None:
            # A collision-free badge in empty space is not an attached label.
            # Only a curve interpolation allowance is used here, not edge_gap.
            if not any(line_hits(a,b,expand(label['box'],own['curve_error_bound']+1e-6))
                       for a,b in own['segments']):
                add('label_detached_from_own_edge',label=label['id'],edge_nodes=own['nodes'])
        for other in labels[i+1:]:
            if intersects(expand(label['box'], args.label_gap/2), expand(other['box'], args.label_gap/2)):
                add('relation_label_clearance', labels=[label['id'],other['id']], boxes=[label['box'],other['box']])
            if intersects(expand(label['text']['estimated_bounds'], args.label_gap/2), expand(other['text']['estimated_bounds'], args.label_gap/2)):
                add('estimated_relation_text_clearance', labels=[label['id'],other['id']])
        for node in nodes:
            if intersects(expand(label['box'], args.node_gap), node['box']):
                add('label_rect_near_or_over_node', label=label['id'], node=node['id'])
            if intersects(expand(label['text']['estimated_bounds'], args.node_gap), node['box']):
                add('estimated_label_text_near_or_over_node', label=label['id'], node=node['id'])
        for edge in svg['edges']:
            if edge['id'] == label['id']:
                continue
            padding = args.edge_gap+edge['stroke']/2+edge['curve_error_bound']
            if any(line_hits(a,b,expand(label['box'],padding)) for a,b in edge['segments']):
                add('foreign_edge_crosses_label_region', label=label['id'], foreign_edge=edge['id'],
                    edge_nodes=edge['nodes'], label_box=label['box'])
    for i, node in enumerate(nodes):
        for other in nodes[i+1:]:
            if intersects(expand(node['box'],args.node_gap/2),expand(other['box'],args.node_gap/2)):
                add('concept_rect_clearance', nodes=[node['id'],other['id']])
        for edge in svg['edges']:
            if node['id'] in edge['nodes']:
                continue
            padding=args.edge_gap+edge['stroke']/2+edge['curve_error_bound']
            if any(line_hits(a,b,expand(node['box'],padding)) for a,b in edge['segments']):
                add('edge_crosses_unrelated_concept', edge=edge['id'], node=node['id'])
    literal_overlaps=sum(intersects(a['box'],b['box']) for i,a in enumerate(labels) for b in labels[i+1:])
    return {'field': name, 'sha256': hashlib.sha256(raw.encode()).hexdigest(),
            'nodes':len(nodes), 'edges':len(svg['edges']), 'labels':len(labels),
            'literal_relation_rect_overlap_count':literal_overlaps,
            'label_font_sizes':sorted(set(x['text']['font_size'] for x in labels)),
            'maximum_curve_linearization_error_bound': max((x['curve_error_bound'] for x in svg['edges']),default=0),
            'issue_count':len(issues),'issues':issues,'font_estimate_warning_count':len(warnings),
            'font_estimate_warnings':warnings,'status':'failed' if issues else 'passed'}


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo',type=Path,default=Path.cwd())
    ap.add_argument('--baseline-ref','--commit',dest='baseline_ref',default=BASELINE)
    ap.add_argument('--mode',choices=['working','baseline'],default='working')
    ap.add_argument('--geometry-only',action='store_true',help='Current output only; no historical git object needed. Existing semantic checks retain canonical text/edges.')
    ap.add_argument('--output',type=Path)
    ap.add_argument('--text-margin',type=float,default=2.)
    ap.add_argument('--label-gap',type=float,default=8.)
    ap.add_argument('--node-gap',type=float,default=6.)
    ap.add_argument('--edge-gap',type=float,default=3.)
    ap.add_argument('--endpoint-gap',type=float,default=8.)
    args=ap.parse_args();args.repo=args.repo.resolve()
    if args.label_gap < 8 or args.node_gap < 6 or args.edge_gap < 3:
        ap.error('Hard clearances cannot be reduced below label=8, node=6, foreign-edge=3 SVG units')
    if not 0 <= args.endpoint_gap <= 8:
        ap.error('Endpoint allowance must be between 0 and the hard maximum 8 SVG units')
    def git(*parts):
        return subprocess.check_output(['git',*parts],cwd=args.repo,text=True)
    if args.geometry_only and args.mode=='baseline':
        ap.error('--geometry-only is for working output, not the pinned old negative control')
    names=([str(p.relative_to(args.repo)) for p in sorted((args.repo/'dist/diagrams').glob('field-*.svg'))]
           if args.geometry_only else
           [x for x in git('ls-tree','-r','--name-only',args.baseline_ref,'dist/diagrams').splitlines()
            if re.fullmatch(r'dist/diagrams/field-[a-z-]+\.svg',x)])
    rows=[]
    for name in names:
        baseline=None if args.geometry_only else git('show',args.baseline_ref+':'+name)
        raw=baseline if args.mode=='baseline' else (args.repo/name).read_text()
        rows.append(check(Path(name).stem.removeprefix('field-'),raw,parse_svg(baseline) if baseline is not None else None,args))
    inventory={'fields':len(rows),'nodes':sum(x['nodes'] for x in rows),'edges':sum(x['edges'] for x in rows)}
    expected={'fields':14,'nodes':101,'edges':90} if args.geometry_only else {'fields':14,'nodes':100,'edges':87}
    inventory_ok=inventory==expected
    result={'schema':1,'method':'independent actual-SVG geometry; stdlib, no generator import/self-report',
            'mode':args.mode,'historical_semantics_compared':not args.geometry_only,
            'baseline_ref':None if args.geometry_only else args.baseline_ref,'inventory':inventory,'inventory_ok':inventory_ok,
            'tolerances_svg_units':{'text_inner_margin':args.text_margin,'label_gap':args.label_gap,
                                    'label_node_gap':args.node_gap,'foreign_edge_gap':args.edge_gap,
                                    'path_endpoint_to_declared_node_boundary':args.endpoint_gap},
            'limitations':['Text boxes use conservative CJK/Latin advance and baseline estimates, not actual browser glyph metrics; font findings are warnings and do not drive the geometry exit code.',
                           'Hard label gap is 8 SVG units, about 5.14 CSS px at 720/1120 display scale; this is an explicit minimum clearance, not a measured visual-comfort guarantee.',
                           'Rounded rectangle corners are conservatively treated as full rectangles.',
                           'M/L/H/V/C/Q/Z paths supported; cubic/quadratic curves use 128 segments plus a computed interpolation-error buffer.',
                           'Arrowhead marker geometry and font fallback/substitution are not measured; unsupported CSS, tspan, rotate, arcs or reuse fail explicitly.',
                           'Actual path start/end points must be within 8 SVG units of the declared source/target rectangle boundary; this permits the generated 4-unit target gap, but does not prove exact port direction or marker/arrowhead placement.',
                           'Non-translation affine transforms are explicitly rejected, so transformed stroke widths cannot silently bypass the hard geometry gate. Current generated field paths are untransformed.',
                           'Foreign path entering another relation badge is rejected even if the badge background masks the line: masking obscures the unrelated relation.',
                           'Readability, color contrast, displayed CSS font size and desktop/mobile composition still need actual rendering review.'],
            'browser_supplement':'Root should open actual SVG through Cua and read text.getBBox()/getBoundingClientRect after fonts.ready; compare actual text pairs/node boxes and inspect all rendered graphs.',
            'fields':rows,'issue_count':sum(x['issue_count'] for x in rows),
            'font_estimate_warning_count':sum(x['font_estimate_warning_count'] for x in rows),
            'literal_relation_rect_overlap_count':sum(x['literal_relation_rect_overlap_count'] for x in rows)}
    result['status']='passed' if inventory_ok and not result['issue_count'] else 'failed'
    if args.output:
        output=args.output.resolve()
        if output.is_relative_to(args.repo):
            raise ValueError('This external audit must not write inside repository')
        output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'mode':args.mode,'status':result['status'],'inventory':inventory,
                      'issues':result['issue_count'],'font_estimate_warnings':result['font_estimate_warning_count'],
                      'literal_relation_rect_overlaps':result['literal_relation_rect_overlap_count'],
                      'failed_fields':{x['field']:x['issue_count'] for x in rows if x['issue_count']},
                      'output':str(args.output) if args.output else None},ensure_ascii=False))
    raise SystemExit(0 if result['status']=='passed' else 1)


if __name__=='__main__':
    main()
