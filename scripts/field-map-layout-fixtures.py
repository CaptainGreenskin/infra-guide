#!/usr/bin/env python3
"""Meaningful in-memory controls for the field-layout regression."""
from pathlib import Path
import argparse
import copy
import importlib.util
import json
import xml.etree.ElementTree as ET

ap=argparse.ArgumentParser()
ap.add_argument('--output',type=Path)
args=ap.parse_args()
script=Path(__file__).with_name('field-map-layout.py')
spec=importlib.util.spec_from_file_location('independent_layout',script)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
raw=Path('dist/diagrams/field-agent.svg').read_text()
limits=argparse.Namespace(text_margin=2.,label_gap=8.,node_gap=6.,edge_gap=3.,endpoint_gap=8.)
assert not m.check('agent',raw,None,limits)['issues']
cases=[]
def check_xml(root,wanted,name,only=False):
    r=m.check('agent',ET.tostring(root,encoding='unicode'),None,limits)
    kinds=[x['kind'] for x in r['issues']]
    assert wanted in kinds,(name,kinds)
    if only:assert kinds==[wanted],(name,kinds)
    cases.append({'mutation':name,'expected':wanted,'hard_issues':kinds})
def reject(callback,name):
    try:callback()
    except ValueError as error:cases.append({'mutation':name,'rejected':True,'reason':str(error)})
    else:raise AssertionError('Invalid case accepted: '+name)
root=ET.fromstring(raw)
label=next(x for x in root.iter() if x.get('data-relation-label')=='1')
box=next(x for x in label if x.tag.endswith('rect'))
label.set('transform',f'translate({20-float(box.get("x"))} {88-float(box.get("y"))})')
check_xml(root,'label_detached_from_own_edge','move label1 to empty (20,88) area',only=True)
for attr in ['data-concept','data-relation-label']:
    root=ET.fromstring(raw)
    root.append(copy.deepcopy(next(x for x in root.iter() if x.get(attr))))
    changed=ET.tostring(root,encoding='unicode')
    reject(lambda changed=changed:m.parse_svg(changed),'duplicate '+attr)
reject(lambda:m.path_segments('M0 0 L10 0 Z 20 30',m.IDENTITY),'bare numbers after closepath Z')
root=ET.fromstring(raw);root.set('transform','scale(2 1)')
reject(lambda:m.parse_svg(ET.tostring(root,encoding='unicode')),'non-translation affine transform')
root=ET.fromstring(raw);edge=next(x for x in root.iter() if x.get('data-edge'))
source=edge.get('data-edge').split()[0];edge.set('data-edge',source+' ag-retrieval')
check_xml(root,'edge_end_far_from_declared_target','declare known but wrong target node')
root=ET.fromstring(raw);edge=next(x for x in root.iter() if x.get('data-edge'))
edge.set('d',edge.get('d')+' L20 88')
check_xml(root,'edge_end_far_from_declared_target','append a visibly dangling final segment')
root=ET.fromstring(raw);edge=next(x for x in root.iter() if x.get('data-edge'))
start=m.parse_svg(raw)['edges'][0]['segments'][0][0]
edge.set('d',f'M20 88 L{start[0]} {start[1]} '+edge.get('d'))
check_xml(root,'edge_start_far_from_declared_source','prepend a visibly dangling initial segment')
report={'scope':'actual current Agent SVG mutated in memory only; no repository SVG is written',
        'positive_control':'unmodified current Agent has zero hard geometry issues',
        'cases':cases,'status':'passed'}
if args.output:args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'passed','rejected_controls':len(cases),'output':str(args.output) if args.output else None}))
