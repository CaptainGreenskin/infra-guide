/* Fresh real subprocesses plus a separate source/SQLite/HTML oracle. */
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');process.chdir(root);
const folder='dist/labs/agent-planning/',python=process.env.INFRA_LAB_PYTHON||'python3';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const canonical=x=>JSON.stringify(x&&typeof x==='object'?(Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))]))):x);
const r=JSON.parse(fs.readFileSync(folder+'validation.json'));
assert.equal(r.schema,'agent-planning-v1');assert.equal(r.status,'passed');
for(const name of ['planning_lab.py','README.md'])assert.equal(sha(fs.readFileSync(folder+name)),r.source_sha256[name],name+': stale source record');

function inspectResult(result){
 assert.equal(result.status,'passed');const c=result.cases;
 assert.equal(Object.keys(c).length,9);
 const count=s=>s.facts.reduce((out,f)=>(out[f.name]=(out[f.name]||0)+1,out),{});
 for(const name of ['adaptive','fixed','changed_input','early_signal']){
  const x=c[name];assert.equal(x.done.state.phase,'DONE');assert.equal(x.done.reports.length,1);
  assert.equal(x.done.reports[0].total,10+27+5);assert.equal(x.oracle.accepted,true);
  assert.equal(x.oracle.report_count,1);
 }
 assert.equal(c.adaptive.first_phase,'NEEDS_REPLAN');assert.equal(c.fixed.first_phase,'WAITING_APPROVAL');
 assert.equal(c.adaptive.done.state.revision,2);assert.equal(c.fixed.done.state.revision,1);
 assert.equal(c.adaptive.done.state.proposal_budget,2);assert.equal(c.fixed.done.state.proposal_budget,0);
 assert.deepEqual(count(c.adaptive.done),{read_base:1,read_extra:1,sum:1});
 assert.deepEqual(count(c.fixed.done),{read_base:1,read_extra:1,sum:1});
 for(const name of ['adaptive','fixed'])assert(c[name].duplicate_resume_unchanged);
 assert.equal(c.changed_input.old_draft_total,10+27);assert.equal(c.changed_input.new_draft_total,10+27+5);
 assert.equal(c.changed_input.old_duplicate.reason,'duplicate_signal');assert.equal(c.changed_input.old_duplicate.applies_current,false);
 assert.deepEqual(count(c.changed_input.done),{read_base:2,sum:2,read_extra:1});
 const old=c.changed_input.done.signals.find(s=>s.id==='approve-v1'),current=c.changed_input.done.signals.find(s=>s.id==='approve-v2');
 assert(old&&!old.consumed);assert(current&&current.consumed);assert.equal(old.body.revision,1);assert.equal(current.body.revision,2);
 assert.notEqual(old.body.input_digest,current.body.input_digest);assert.notEqual(old.body.draft_digest,current.body.draft_digest);
 const early=c.early_signal.done.events.map(e=>e.kind);
 assert(early.indexOf('approval_received')<early.indexOf('waiting'));assert(early.indexOf('waiting')<early.indexOf('report_committed'));
 for(const[name,status]of [['no_progress','STOPPED_NO_PROGRESS'],['budget','STOPPED_BUDGET']]){
  const x=c[name];assert.equal(x.state.phase,status);assert.equal(x.reports.length,0);
 }
 const repeats=c.no_progress.events.filter(e=>e.kind==='proposal');assert.equal(repeats.length,2);
 assert.deepEqual(repeats[0].body.steps,repeats[1].body.steps);assert.notEqual(repeats[0].body.reason_text,repeats[1].body.reason_text);
 assert.equal(c.no_progress.state.proposal_budget,1);assert.equal(c.budget.state.proposal_budget,0);
 assert.equal(c.budget.events.filter(e=>e.kind==='proposal').length,1);
 assert.equal(c.invalid_plan.outcome.accepted,false);assert.equal(c.invalid_plan.snapshot.state.revision,1);
 assert.equal(c.invalid_plan.snapshot.reports.length,0);assert.equal(c.invalid_plan.snapshot.plans.length,1);
 const bad=c.wrong_cache_key;assert.equal(bad.done.state.phase,'DONE');assert.equal(bad.done.reports[0].total,37);
 assert.equal(bad.oracle.accepted,false);assert.equal(bad.oracle.expected_total,42);
 assert.deepEqual(count(bad.done),{read_base:2,sum:1,read_extra:1});
 assert.equal(c.corrupt_artifact.actual_total,42);assert.equal(c.corrupt_artifact.accepted,false);
 // Reconstruct every stored input and draft digest in JavaScript, not by asking the producer.
 for(const name of ['adaptive','fixed','changed_input','early_signal','wrong_cache_key']){
  const s=c[name].done.state,d=s.draft;
  assert.equal(d.draft_digest,sha(canonical(d.body)));
  assert.equal(d.input_digest,sha(canonical({task:s.task,target:s.target,manifest:d.body.manifest})));
  assert.deepEqual(c[name].done.reports,[d.body]);
 }
}
inspectResult(r.program);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'infra-planning-oracle-'));
try{
 const runs=path.join(temporary,'runs');
 const fresh=JSON.parse(cp.execFileSync(python,['-B',folder+'planning_lab.py','--output-dir',runs],{encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024}));
 inspectResult(fresh);
 // This separate process imports no lab code. Read source tables and actual reports
 // independently; intentionally ignore runtime status and the lab's own oracle.
 const direct=JSON.parse(cp.execFileSync(python,['-B','-c',`
import hashlib,json,pathlib,sqlite3,sys
out={}
for file in pathlib.Path(sys.argv[1]).glob('*.sqlite'):
 with sqlite3.connect(file) as db:
  version=db.execute('SELECT version FROM source_head WHERE id=1').fetchone()[0]
  base=json.loads(db.execute('SELECT body FROM sources WHERE version=?',(version,)).fetchone()[0])
  batches=[base]
  if base['extra']:
   ref=base['extra'];batches.append(json.loads(db.execute('SELECT body FROM batches WHERE resource=? AND version=?',(ref['resource'],ref['version'])).fetchone()[0]))
  manifest=[]
  for batch in batches:
   raw=json.dumps(batch['values'],ensure_ascii=False,separators=(',',':')).encode()
   manifest.append({'resource':batch['resource'],'version':batch['version'],'sha256':hashlib.sha256(raw).hexdigest()})
  expected={'report':'report-A','total':sum(sum(b['values']) for b in batches),'manifest':manifest}
  reports=[json.loads(x[0]) for x in db.execute('SELECT body FROM reports')]
  out[file.stem]={'expected':expected,'reports':reports,'exact':reports==[expected]}
print(json.dumps(out))
`,runs],{encoding:'utf8',timeout:15000}));
 for(const name of ['adaptive','fixed','changed-input','early-signal']){
  assert.equal(direct[name].exact,true,name+': actual SQLite artifact must match authoritative inputs');
  assert.equal(direct[name].expected.total,42);
 }
 for(const name of ['no_progress','budget','invalid-plan'])assert.deepEqual(direct[name].reports,[]);
 assert.equal(direct['wrong-cache'].exact,false);assert.equal(direct['wrong-cache'].reports[0].total,37);
 assert.equal(direct['wrong-cache'].expected.total,42);assert.equal(direct['corrupt-artifact'].exact,false);
 assert.equal(direct['corrupt-artifact'].reports[0].total,42);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}

const context={};vm.createContext(context);let injected=false;
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g)){
 if(file==='app.js')continue;
 vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),context,{filename:file});
 if(file==='agent-planning-bridge.js')injected=true;
 // Also support checking this isolated deliverable before the parent integrates its loader.
 if(file==='capacity-roofline-observation.js'&&!fs.readFileSync('src/page-shell.html','utf8').includes('src="agent-planning-bridge.js"')){
  vm.runInContext(fs.readFileSync('dist/agent-planning-bridge.js','utf8'),context,{filename:'agent-planning-bridge.js'});injected=true;
 }
}
assert(injected);
const current=JSON.parse(JSON.stringify(vm.runInContext("articles.find(a=>a.id==='durable-workflows')",context)));
const baseline=require('./content-at-commit.cjs')('b06a0633d54a0ecfad39e6e3d55850a0caa0d36e').find(a=>a.id==='durable-workflows');
assert.equal(current.title,baseline.title);assert.deepEqual(current.sections.map(s=>s[0]),baseline.sections.map(s=>s[0]));
// Later reviewed prose may advance the publication date; require its signed body,
// rather than freezing the date of the original implementation bridge forever.
const proseRevisions=JSON.parse(fs.readFileSync('docs/POST_WINDOW_BODY_REVIEWS.json')).revisions.filter(row=>row.id==='durable-workflows');
const latestProse=proseRevisions.at(-1);
if(latestProse)assert.equal(latestProse.reviewed_content_sha256,sha(JSON.stringify({title:current.title,sections:current.sections})),'current workflow body must match its latest explicit review');
assert.equal(current.updated,latestProse?latestProse.reviewed_at.slice(0,10).replaceAll('-','.'):'2026.11.08');assert.equal(current.minutes,55);
const all=current.sections.map(s=>s[1]).join(''),before=baseline.sections.map(s=>s[1]).join('');
const pre=s=>[...s.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)].map(m=>m[0]);
const oldPre=pre(before),newPre=pre(all);
// The original planning stage added two blocks; the independently checked
// native framework bridge added six, and the MCP recovery exercise adds one command.
const mcpExercise=current.sections[8][1].split('<h3 id="mcp-commit-recovery">');
assert.equal(mcpExercise.length,2);
assert.equal(pre(mcpExercise[1]).length,1);
assert.equal(newPre.length,oldPre.length+2+6+1);
let cursor=-1;for(const original of oldPre){const at=newPre.indexOf(original,cursor+1);assert(at>cursor,'old complete pre bytes/order changed');cursor=at;}
for(const[,id]of before.matchAll(/\bid="([^"]+)"/g))assert(all.includes('id="'+id+'"'),'missing old inner anchor '+id);
const full=[...all.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>decode(m[1]));
assert(full.includes(fs.readFileSync(folder+'planning_lab.py','utf8').trim()),'inline full source differs');
assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('agentPlanningEvidence.source_sha256',context))),r.source_sha256);
for(const text of ['计划版本revision','源版本属于某一份数据','草稿摘要draft_digest','输入摘要input_digest','同样的无效提议','wrong_cache_key','id="agent-planning-run"'])assert(all.includes(text),'missing concept relation '+text);
assert(current.refs.includes('planningInterrupts'));

const metadata=name=>JSON.parse(decode(fs.readFileSync('dist/diagrams/'+name+'.svg','utf8').match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
assert.deepEqual(metadata('agent-planning-plan-facts').adaptive_facts,r.program.cases.adaptive.done.facts);
assert.deepEqual(metadata('agent-planning-wait-states').early_signal_events,r.program.cases.early_signal.done.events);
assert.deepEqual(metadata('agent-planning-approval-versions').old_duplicate,r.program.cases.changed_input.old_duplicate);
assert.deepEqual(metadata('agent-planning-approval-versions').oracle,r.program.cases.changed_input.oracle);
cp.execFileSync(python,['-B','-c',`
import pathlib,zipfile,xml.etree.ElementTree as ET
folder=pathlib.Path('dist/labs/agent-planning')
with zipfile.ZipFile('dist/labs/agent-planning.zip') as z:
 assert sorted(z.namelist())==['README.md','planning_lab.py','validation.json']
 for p in folder.iterdir():
  if p.is_file():assert z.read(p.name)==p.read_bytes(),p.name
for f in pathlib.Path('dist/diagrams').glob('agent-planning-*.svg'):
 root=ET.parse(f).getroot();assert root.find('{http://www.w3.org/2000/svg}title') is not None
 assert root.find('{http://www.w3.org/2000/svg}desc') is not None
`],{encoding:'utf8',timeout:15000});
console.log('PASS: nine fresh multi-process SQLite scenarios; independent authoritative-source/artifact oracle rejects DONE/37 and altered manifest; plan/budget/early approval/stale signal invariants; preserved headings, inner IDs and complete old code blocks; full source/SHA/ZIP plus three data-bound SVGs. Local scripted proposals, no LLM/framework claims.');
