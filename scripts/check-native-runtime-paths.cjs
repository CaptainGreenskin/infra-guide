/* Native evidence from expert communication, Kubernetes scaling and isolated tool execution. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const expertFolder='dist/labs/native-expert-parallel';
const evidence=read(expertFolder+'/validation.json');
assert.equal(evidence.status,'passed');
assert.deepEqual(evidence.source_sha256,{'expert_parallel.py':sha(expertFolder+'/expert_parallel.py')});
assert.deepEqual(evidence.environment,{python:'3.12.13',torch:'2.5.1',backend:'gloo',device:'cpu',dtype:'float64',world_size:2});
const ids=[0,1,2,3,4,5],route=[1,0,0,0,1,0];
const x=[[1,2],[2,1],[3,-1],[-1,2],[2,-2],[1,3]],y=[[-2,-1],[-1,0],[0,1],[1,-1],[2,0],[3,1]];
const weights=[[[2,-1],[1,1]],[[-1,1],[2,1]]];
assert.deepEqual(evidence.fixture,{expert_by_token:route,inputs:x,targets:y,expert_weights:weights,
 objective:'0.5 * sum((output - target)**2) over all tokens and features'});
const source=[[0,1,2],[3,4,5]],sent=[[1,2,0],[3,5,4]],received=[[1,2,3,5],[0,4]];
const sendSplits=[[2,1],[2,1]],receiveSplits=[[2,2],[1,1]];
assert.equal(evidence.ranks.length,2);
evidence.ranks.forEach((r,i)=>{
 assert.equal(r.rank,i);assert.equal(r.local_expert,i);
 assert.deepEqual(r.local_parameters,{weight:[2,2]});assert.equal(r.local_parameter_elements,4);
 assert.deepEqual(r.source_token_ids,source[i]);assert.deepEqual(r.sent_token_ids,sent[i]);
 assert.deepEqual(r.dispatch_send_splits,sendSplits[i]);assert.deepEqual(r.dispatch_receive_splits,receiveSplits[i]);
 assert.deepEqual(r.expert_token_ids,received[i]);assert.deepEqual(r.returned_token_ids,sent[i]);
 assert.deepEqual(r.restored_token_ids,source[i]);assert.deepEqual(r.output_shape,[3,2]);
});
function reference(ordered){
 const result={outputs:[],input_grads:[],expert_weight_grads:[[[0,0],[0,0]],[[0,0],[0,0]]],loss:0};
 const sourceLosses=[0,0];
 ordered.forEach((id,row)=>{
  const w=weights[route[id]],value=x[id];
  const output=w.map(([a,b])=>a*value[0]+b*value[1]);
  const residual=output.map((item,col)=>item-y[row][col]);
  const loss=(residual[0]**2+residual[1]**2)/2;
  result.outputs.push(output);
  result.input_grads[id]=[0,1].map(col=>w[0][col]*residual[0]+w[1][col]*residual[1]);
  residual.forEach((dy,i)=>value.forEach((input,j)=>result.expert_weight_grads[route[id]][i][j]+=dy*input));
  result.loss+=loss;
  sourceLosses[Math.floor(row/3)]+=loss;
 });
 return {result,sourceLosses};
}
const compare=(r,variant,rank,sourceLoss)=>{
 assert.deepEqual(r.outputs,variant.outputs.slice(rank*3,rank*3+3));
 assert.deepEqual(r.input_grads,variant.input_grads.slice(rank*3,rank*3+3));
 assert.deepEqual(r.expert_weight_grad,variant.expert_weight_grads[rank]);
 assert.equal(r.loss,sourceLoss);
};
const baseline=reference(ids),wrong=reference(sent.flat());
assert.deepEqual(evidence.dense_reference,baseline.result);
evidence.ranks.forEach((r,i)=>{
 compare(r.correct,baseline.result,i,baseline.sourceLosses[i]);
 compare(r.wrong_order,wrong.result,i,wrong.sourceLosses[i]);
});
assert.deepEqual(evidence.correct_max_abs_error,{outputs:0,input_grads:0,expert_weight_grads:0,loss:0});
const distance=Object.fromEntries(Object.entries(baseline.result).map(([key,a])=>{
 const original=[a].flat(3),altered=[wrong.result[key]].flat(3);
 return [key,Math.max(...original.map((n,i)=>Math.abs(n-altered[i])))];
}));
assert.deepEqual(evidence.wrong_order_max_abs_error,distance);
assert.deepEqual(distance,{outputs:6,input_grads:4,expert_weight_grads:6,loss:10});
const figure=fs.readFileSync('dist/diagrams/native-expert-parallel.svg','utf8');
const layout=JSON.parse(figure.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]);
for(const [key,rows] of Object.entries({source_token_ids:source,dispatch_send_splits:sendSplits,expert_token_ids:received,
 dispatch_receive_splits:receiveSplits,returned_token_ids:sent,restored_token_ids:source}))assert.deepEqual(layout[key],rows);

const configs=[
 {pack:'kubernetes-hpa',runner:'hpa_control_lab.py',run:42561685247,head:'3be08c311d9e6f84226ea5e8644d5efaae25c378',article:'k8s-autoscaling',anchor:'native-hpa-control',diagram:'kubernetes-hpa-control'},
 {pack:'sandbox-container',runner:'sandbox_container.py',run:42561457636,head:'a0c50848dd666087e2b2ab9508a83e60428d6195',article:'agent-sandbox',anchor:'native-sandbox-container',diagram:'sandbox-container-boundaries'}
];
function checkPage(article,anchor,pack,diagram,extra=[]){
 const body=fs.readFileSync('dist/article/'+article+'/index.html','utf8');
 for(const text of ['id="'+anchor+'"','data-toc="'+anchor+'"','diagrams/'+diagram+'.svg','labs/'+pack+'.zip','labs/'+pack+'/validation.json',...extra])assert(body.includes(text),text);
}
checkPage('moe-routing','native-expert-parallel','native-expert-parallel','native-expert-parallel');
for(const item of configs){
 const folder='dist/labs/'+item.pack,runner=folder+'/'+item.runner,record=folder+'/validation.json',ci=read(folder+'/ci-record.json');
 assert.equal(ci.url,'https://github.com/CaptainGreenskin/infra-guide/actions/runs/'+item.run);
 assert.equal(ci.headSha,item.head);
 assert.equal(ci.conclusion,'success');assert.equal(ci.source_sha256,sha(runner));assert.equal(ci.record_sha256,sha(record));
 cp.execFileSync('python3',['-B',runner,'--check-record',record]);
 checkPage(item.article,item.anchor,item.pack,item.diagram,[ci.url]);
}
const archiveFiles={
 'native-expert-parallel':['README.md','expert_parallel.py','validation.json'],
 'kubernetes-hpa':['README.md','ci-record.json','hpa_control_lab.py','validation.json'],
 'sandbox-container':['README.md','ci-record.json','sandbox_container.py','source.json','validation.json'],
};
cp.execFileSync('python3',['-B','-c',`
import json, sys
from pathlib import Path
from zipfile import ZipFile
root = Path("dist/labs")
for package, names in json.load(sys.stdin).items():
    with ZipFile(root / (package + ".zip")) as archive:
        assert set(archive.namelist()) == {package + "/" + name for name in names}
        for name in names:
            member = package + "/" + name
            assert archive.read(member) == (root / member).read_bytes()
`],{input:JSON.stringify(archiveFiles)});
console.log('PASS: native expert outputs and gradients including wrong-order control, HPA and sandbox records with CI provenance, complete ZIPs and exact reading targets.');
