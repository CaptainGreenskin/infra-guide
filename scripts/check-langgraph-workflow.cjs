/* Offline record/source regression by default; fresh SDK execution is opt-in. */
const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert');
const root=path.resolve(__dirname,'..');process.chdir(root);
const folder='dist/labs/langgraph-workflow/',bridge='langgraph-workflow-bridge.js';
const sdkPython=process.env.LANGGRAPH_PYTHON,python=sdkPython||'python3';
const record=JSON.parse(fs.readFileSync(folder+'validation.json','utf8'));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const contentSha=value=>sha(JSON.stringify(ordered(value)));
const source=JSON.parse(fs.readFileSync(folder+'orders.json','utf8'));
const expectedDraft={target:source.target,total:source.base.values.reduce((s,x)=>s+x,0)+source.extra.values.reduce((s,x)=>s+x,0),sources:['base','extra'].map(key=>({resource:source[key].resource,version:source[key].version,values_sha256:contentSha(source[key].values)}))};
assert.equal(expectedDraft.total,42);
for(const[name,hash]of Object.entries(record.source_sha256))assert.equal(sha(fs.readFileSync(folder+name)),hash,'source differs from recorded execution: '+name);
assert.equal(record.program.environment.packages.langgraph,'1.2.20');
assert.equal(record.program.environment.packages['langgraph-checkpoint-sqlite'],'3.1.3');
assert(record.official_source_verification.every(release=>release.files.length&&release.files.every(file=>file.matches_release&&/^[a-f0-9]{64}$/.test(file.sha256))));

function verify(result){
 assert.equal(result.status,'passed');
 assert.equal(result.environment.packages.langgraph,'1.2.20');
 assert.equal(result.environment.packages['langgraph-checkpoint-sqlite'],'3.1.3');
 for(const name of ['stable','new_id_on_reentry','parallel_failure']){
  const row=result.cases[name];
  assert.equal(row.parallel_overlap_proven,true);assert.equal(row.counts.approval_publish,2);
  assert.equal(row.counts.read_base,1);assert.equal(row.counts.read_extra,1);assert.equal(row.counts.draft,1);
  assert.deepEqual(row.waiting.state.next,['approval_publish']);assert.deepEqual(row.resumed.state.next,[]);
  assert.notEqual(row.waiting.pid,row.resumed.pid);
  assert.equal(row.before_resume_receiver.reports.length,0);assert.equal(row.before_resume_receiver.effects.length,1);
  assert.equal(row.oracle.expected_total,42);assert.equal(row.oracle.published_effects,1);assert.equal(row.oracle.report_count,1);
  assert.equal(row.same_operation_changed_content,'operation_conflict_409');
  assert.deepEqual(row.wrong_thread.state.values,{});
  // Recompute the business result from the recorded receiver data and original
  // orders, independently of graph state and the lab's oracle.accepted flag.
  const receiver=row.receiver,staged=receiver.effects.filter(effect=>effect.phase==='stage'),published=receiver.effects.filter(effect=>effect.phase==='publish');
  const expectedStaged=name==='new_id_on_reentry'?2:1;
  assert.equal(receiver.effects.length,staged.length+published.length,'unexpected receiver phase');
  assert.equal(staged.length,expectedStaged);assert.equal(published.length,1);assert.equal(receiver.reports.length,1);
  assert.equal(new Set(receiver.effects.map(effect=>effect.op)).size,receiver.effects.length,'duplicate effect identity');
  for(const effect of receiver.effects)assert.deepEqual(effect.draft,expectedDraft,'effect differs from source: '+name);
  const report=receiver.reports[0];
  assert.equal(report.target,source.target);assert.deepEqual(report.draft,expectedDraft,'report differs from source: '+name);
  assert.equal(report.op,published[0].op);assert.equal(report.op,'report-A:publish');
  const actualAccepted=staged.length===1&&published.length===1&&receiver.reports.length===1;
  assert.equal(actualAccepted,name!=='new_id_on_reentry');assert.equal(row.oracle.accepted,actualAccepted);
  assert.equal(row.oracle.staged_effects,staged.length);assert.equal(row.oracle.published_effects,published.length);assert.equal(row.oracle.report_count,receiver.reports.length);
  for(const effect of row.before_resume_receiver.effects){assert.equal(effect.phase,'stage');assert.deepEqual(effect.draft,expectedDraft);}
  assert.equal(row.resumed.state.values.publish_receipt.draft_digest,contentSha(expectedDraft));
 }
 assert.equal(result.cases.stable.oracle.accepted,true);
 assert.equal(result.cases.stable.oracle.staged_effects,1);
 assert.equal(result.cases.stable.receiver.attempts.filter(r=>r.phase==='stage').length,2);
 assert.equal(result.cases.stable.receiver.attempts.filter(r=>r.phase==='stage'&&r.duplicate).length,1);
 assert.equal(result.cases.new_id_on_reentry.oracle.accepted,false);
 assert.equal(result.cases.new_id_on_reentry.oracle.staged_effects,2);
 assert.equal(result.cases.new_id_on_reentry.oracle.checks.one_staged_draft,false);
 assert.equal(result.cases.parallel_failure.oracle.accepted,true);
 assert.equal(result.cases.parallel_failure.counts.check_total,1);
 assert.equal(result.cases.parallel_failure.counts.check_sources,2);
 assert.equal(result.cases.parallel_failure.after_parallel_failure.error,'injected_source_check');
 assert.deepEqual(result.cases.parallel_failure.after_parallel_failure.state.values.checks,['total']);
 assert.equal(result.cases.corrupt_report.accepted,false);
 assert.equal(result.cases.corrupt_report.checks.report_matches_source,false);
 assert.equal(result.cleanup.receiver_children_reaped,true);assert.equal(result.cleanup.worker_children_reaped,true);
}
verify(record.program);
// ZIP/XML need only Python's standard library; no LangGraph environment or
// dependency installation is needed for the default Pages regression.
cp.execFileSync(python,['-B','-c',`
import pathlib,zipfile,xml.etree.ElementTree as ET
lab=pathlib.Path('dist/labs/langgraph-workflow')
with zipfile.ZipFile('dist/labs/langgraph-workflow.zip') as z:
 assert sorted(z.namelist())==['README.md','orders.json','requirements.txt','validation.json','workflow_lab.py']
 for name in z.namelist():assert z.read(name)==(lab/name).read_bytes(),name
for name in ['langgraph-workflow-graph','langgraph-workflow-reentry']:
 svg=ET.parse('dist/diagrams/'+name+'.svg').getroot()
 assert svg.find('{http://www.w3.org/2000/svg}title') is not None
 assert svg.find('{http://www.w3.org/2000/svg}desc') is not None
`],{encoding:'utf8',timeout:15000});
if(sdkPython){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'verify-langgraph-workflow-'));
 try{
 const runs=path.join(temporary,'runs');
 const live=JSON.parse(cp.execFileSync(python,['-B',folder+'workflow_lab.py','--output-dir',runs],{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024}));
 verify(live);
 // Independently read the retained databases, rather than trusting only the
 // graph state or even the lab's own oracle implementation.
 cp.execFileSync(python,['-B','-c',`
import json,pathlib,sqlite3,sys,hashlib
root=pathlib.Path(sys.argv[1])
def canonical(x):return json.dumps(x,sort_keys=True,ensure_ascii=False,separators=(',',':'))
def digest(x):return hashlib.sha256(canonical(x).encode()).hexdigest()
for name,staged,valid in [('stable',1,True),('new-id',2,False),('parallel-failure',1,True),('corrupt',1,False)]:
 folder=root/name;s=json.loads((folder/'orders.json').read_text())
 expected={'target':s['target'],'total':sum(s['base']['values'])+sum(s['extra']['values']),
           'sources':[{'resource':s[k]['resource'],'version':s[k]['version'],'values_sha256':digest(s[k]['values'])} for k in ['base','extra']]}
 with sqlite3.connect(folder/'receiver.sqlite') as con:
  effects=list(con.execute('SELECT phase,draft FROM effects'));reports=list(con.execute('SELECT target,draft FROM reports'))
 assert sum(phase=='stage' for phase,_ in effects)==staged
 assert sum(phase=='publish' for phase,_ in effects)==1
 assert len(reports)==1 and expected['total']==42
 actual_valid=staged==1 and all(json.loads(body)==expected for _,body in effects) and reports[0][0]==expected['target'] and json.loads(reports[0][1])==expected
 assert actual_valid==valid,name
`,runs],{encoding:'utf8',timeout:15000});
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}

const context={};vm.createContext(context);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g)){
 if(file==='app.js'||file===bridge)continue;
 vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),context,{filename:file});
}
const evaluate=expression=>JSON.parse(JSON.stringify(vm.runInContext(expression,context)));
const baseline=evaluate("articles.find(a=>a.id==='durable-workflows')");
vm.runInContext(fs.readFileSync('dist/'+bridge,'utf8'),context,{filename:bridge});
const current=evaluate("articles.find(a=>a.id==='durable-workflows')");
assert.equal(current.title,baseline.title);assert.deepEqual(current.sections.map(s=>s[0]),baseline.sections.map(s=>s[0]));
for(const[i,section]of baseline.sections.entries()){
 if([7,8].includes(i))assert(current.sections[i][1].startsWith(section[1]),'changed prior body at section '+(i+1));
 else assert.equal(current.sections[i][1],section[1],'changed unrelated section '+(i+1));
}
const added=[7,8].map(i=>current.sections[i][1].slice(baseline.sections[i][1].length)).join('');
const all=current.sections.map(s=>s[1]).join(''),before=baseline.sections.map(s=>s[1]).join('');
const pre=s=>[...s.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)].map(m=>m[0]);
const oldPre=pre(before),newPre=pre(all);assert.equal(newPre.length,oldPre.length+6);
let cursor=-1;for(const original of oldPre){const at=newPre.indexOf(original,cursor+1);assert(at>cursor,'old complete pre bytes/order changed');cursor=at;}
for(const[,id]of before.matchAll(/\bid="([^"]+)"/g))assert(all.includes('id="'+id+'"'),'missing old anchor '+id);
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const full=[...added.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>decode(m[1]));
assert(full.includes(fs.readFileSync(folder+'workflow_lab.py','utf8').trim()),'full inline source differs');
assert.equal((added.match(/<h3\b/g)||[]).length,4);
const visible=added.replace(/<details\b[\s\S]*?<\/details>/g,'');
assert.equal(pre(visible).length,1,'default lesson should expose one short API block');
assert.equal((visible.match(/<figure\b/g)||[]).length,1,'default lesson should expose one diagram');
const chinese=(visible.replace(/<pre\b[\s\S]*?<\/pre>/g,'').replace(/<[^>]+>/g,'').match(/[\u3400-\u9fff]/g)||[]).length;
assert(chinese<=650,'default prose exceeds the requested compact reading budget: '+chinese);
assert.deepEqual(evaluate('langgraphWorkflowEvidence.source_sha256'),record.source_sha256);
assert.deepEqual(evaluate('langgraphWorkflowBridgeReview'),{article:'durable-workflows',sections:[7,8],new_pre:6,new_default_pre:1,new_h3:4,figures:2});
for(const name of ['langgraph-workflow-objects','langgraph-workflow-wait','langgraph-workflow-reentry','langgraph-workflow-run'])assert(added.includes('id="'+name+'"'));
for(const name of ['langgraph-workflow-graph','langgraph-workflow-reentry']){
 const svg=fs.readFileSync('dist/diagrams/'+name+'.svg','utf8');
 const data=JSON.parse(decode(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
 if(name.endsWith('graph'))assert.deepEqual(data.counts,record.program.cases.stable.counts);
 else{assert.deepEqual(data.stable_oracle,record.program.cases.stable.oracle);assert.deepEqual(data.bad_oracle,record.program.cases.new_id_on_reentry.oracle);}
}
console.log('PASS: '+(sdkPython?'fresh official LangGraph/File-SQLite/HTTP suite and direct SQLite verification':'offline LangGraph execution record, receiver effects/reports independently recomputed from orders.json')+'; unchanged original sections/pre/IDs; 4 h3 + 6 pre (1 default), '+chinese+' default Chinese characters, 2 source-bound SVGs and exact ZIP.');
