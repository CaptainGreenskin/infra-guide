/* Check native graph outputs against two independent raw SQLite stores. */
const assert=require('node:assert/strict'), crypto=require('node:crypto'), fs=require('node:fs');
const os=require('node:os'), path=require('node:path'), {execFileSync}=require('node:child_process');
const folder='dist/labs/langgraph-parallel-merge';
const files=['README.md','checkpoints.sqlite','fixture.json','parallel_merge.py','receiver.sqlite','requirements.txt','validation.json'];
const operation='report-A:publish';
const receipt=operation+':receipt-1';
const body=total=>JSON.stringify({report:'ops-daily',total});
const proposals=(total,origins)=>({[operation]:{[body(total)]:origins}});
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=(dir,file)=>fs.readFileSync(path.join(dir,file),'utf8');
const names=['default_channel','append_only','canonical_same','canonical_conflict','canonical_conflict_reverse'];

function readDatabases(dir){
 const code=`
import json, pathlib, sqlite3, sys
root = pathlib.Path(sys.argv[1]).resolve()
def database(name):
    db = sqlite3.connect((root/name).as_uri() + '?mode=ro&immutable=1', uri=True)
    db.row_factory = sqlite3.Row
    return db
def rows(db, sql):
    return [dict(row) for row in db.execute(sql)]
with database('receiver.sqlite') as receiver, database('checkpoints.sqlite') as checkpoints:
    print(json.dumps({
        'visits': rows(receiver, 'SELECT * FROM visits ORDER BY seq'),
        'requests': rows(receiver, 'SELECT * FROM requests ORDER BY seq'),
        'effects': rows(receiver, 'SELECT * FROM effects ORDER BY case_id,operation_id'),
        'checkpoints': rows(checkpoints, "SELECT checkpoint_id,parent_checkpoint_id FROM checkpoints WHERE thread_id='canonical_same' AND checkpoint_ns=''")
    }))
`;
 return JSON.parse(execFileSync('python3',['-B','-c',code,dir],{encoding:'utf8'}));
}

function verifyEvidence(record,raw){
 assert.equal(record.status,'passed');
 assert.equal(record.environment.langgraph,'1.2.20');
 assert.equal(record.environment.langgraph_checkpoint_sqlite,'3.1.3');
 const cases=record.cases;
 assert.deepEqual(Object.keys(cases),names);
 for(const name of names){
  const row=cases[name];
  for(const type of ['visits','requests','effects']){
   assert.deepEqual(row[type],raw[type].filter(x=>x.case_id===name),name+' raw '+type);
  }
  const entered=row.visits.filter(x=>x.node.startsWith('draft_')&&x.stage==='entered');
  const emitted=row.visits.filter(x=>x.node.startsWith('draft_')&&x.stage==='emitted');
  assert.deepEqual(entered.map(x=>x.node).sort(),['draft_a','draft_b']);
  assert.equal(new Set(entered.map(x=>x.pid)).size,1);
  assert.equal(new Set(entered.map(x=>x.tid)).size,2);
  assert(entered.every(x=>x.seq<emitted[0].seq),'both branches enter before any emission');
  const order=name==='canonical_conflict_reverse'?['draft_b','draft_a']:['draft_a','draft_b'];
  assert.deepEqual(emitted.map(x=>x.node),order,name+' emission order');
  const decision=row.visits.filter(x=>x.node==='decide');
  assert.equal(decision.length,name==='default_channel'?0:1);
  if(decision.length)assert(decision[0].seq>emitted.at(-1).seq,'join follows both emissions');
  if(name!=='canonical_same')assert.deepEqual([row.requests,row.effects],[[],[]]);
 }
 assert.equal(cases.default_channel.error_type,'InvalidUpdateError');
 assert.match(cases.default_channel.error,/proposals.*[Oo]ne value per step/);
 const naive=cases.append_only;
 assert.equal(naive.decision,'list_observed');
 assert.deepEqual([...naive.proposals].sort((a,b)=>a.origin.localeCompare(b.origin)),['draft_a','draft_b'].map(origin=>({
  operation_id:operation,payload:{report:'ops-daily',total:42},origin
 })));
 assert.equal(naive.proposals.reduce((sum,item)=>sum+item.payload.total,0),84);

 const same=cases.canonical_same;
 assert.deepEqual(same.proposals,proposals(42,['draft_a','draft_b']));
 assert.deepEqual([same.decision,same.receipt,same.replay_checkpoint_next],['publish',receipt,['publish']]);
 assert.deepEqual(same.replay,{decision:'publish',receipt});
 assert.match(same.replay_checkpoint_id,/^[a-f\d-]{36}$/);
 const publications=same.visits.filter(x=>x.node==='publish');
 assert.equal(publications.length,2);
 assert.deepEqual(same.requests.map(x=>[x.operation_id,x.payload,x.result,x.receipt,x.pid]),[
  [operation,body(42),'committed',receipt,publications[0].pid],
  [operation,body(42),'duplicate',receipt,publications[1].pid],
 ]);
 assert.notEqual(publications[0].pid,publications[1].pid,'publish replay enters a separate process');
 assert.deepEqual(same.effects,[{case_id:'canonical_same',operation_id:operation,payload:body(42),receipt}]);
 const children=raw.checkpoints.filter(x=>x.parent_checkpoint_id===same.replay_checkpoint_id);
 assert(raw.checkpoints.some(x=>x.checkpoint_id===same.replay_checkpoint_id),'raw pre-publication checkpoint');
 assert.equal(new Set(children.map(x=>x.checkpoint_id)).size,2,'both publications branch from the same raw checkpoint');

 const expectedConflict={[operation]:{[body(41)]:['draft_b'],[body(42)]:['draft_a']}};
 for(const name of ['canonical_conflict','canonical_conflict_reverse']){
  assert.equal(cases[name].decision,'review_required');
  assert.deepEqual(cases[name].proposals,expectedConflict);
  assert(!cases[name].visits.some(x=>x.node==='publish'));
 }
}

function checkPackage(dir){
 const code=`
import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(str(root) + '.zip') as pack:
    assert sorted(pack.namelist()) == sorted(sys.argv[2:])
    for file in sys.argv[2:]:
        assert pack.read(file) == (root/file).read_bytes(), file
`;
 execFileSync('python3',['-B','-c',code,dir,...files]);
}

const record=JSON.parse(read(folder,'validation.json')), raw=readDatabases(folder);
assert.deepEqual(record.source_sha256,Object.fromEntries(['parallel_merge.py','fixture.json','requirements.txt'].map(file=>[file,sha(path.join(folder,file))])));
assert.deepEqual(record.raw_sha256,Object.fromEntries(['checkpoints.sqlite','receiver.sqlite'].map(file=>[file,sha(path.join(folder,file))])));
assert.deepEqual(JSON.parse(read(folder,'fixture.json')).cases.map(row=>row.name),names);
verifyEvidence(record,raw);
for(const alter of [
 (data)=>{data.cases.canonical_conflict_reverse.proposals={[operation]:{[body(42)]:['draft_a']}};},
 (data)=>{data.cases.canonical_same.requests[1].result='committed';},
 (data,databases)=>{databases.checkpoints.find(x=>x.parent_checkpoint_id===data.cases.canonical_same.replay_checkpoint_id).parent_checkpoint_id=null;},
 (data,databases)=>{
  const request=data.cases.canonical_same.requests[1], pid=data.cases.canonical_same.requests[0].pid;
  request.pid=pid;
  databases.requests[1].pid=pid;
  data.cases.canonical_same.visits.at(-1).pid=pid;
  databases.visits.at(-1).pid=pid;
 },
]){
 const data=structuredClone(record), databases=structuredClone(raw);
 alter(data,databases);
 assert.throws(()=>verifyEvidence(data,databases),assert.AssertionError);
}
checkPackage(folder);

const svg=fs.readFileSync('dist/diagrams/langgraph-parallel-merge.svg','utf8');
assert.deepEqual(JSON.parse(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]),{
 operation,same:[42,42],conflict:[42,41],same_origins:['draft_a','draft_b'],
 conflict_requests:0,replay_next:['publish'],requests:['committed','duplicate'],effects:1
});
const authored=fs.readFileSync('dist/progressive-agent-retrieval-workflow-reading.js','utf8');
assert.equal(authored.split('id="native-parallel-merge"').length,2);
for(const term of ['a.sections[8][1]','langgraph-parallel-merge.zip','langgraph-parallel-merge/validation.json','trainingFigure(\'langgraph-parallel-merge\'']){
 assert(authored.includes(term),term);
}

if(process.env.NATIVE_LANGGRAPH_MERGE_PYTHON){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'parallel-merge-replay-'));
 const output=path.join(temp,'observed');
 try{
  execFileSync(process.env.NATIVE_LANGGRAPH_MERGE_PYTHON,['-B',path.join(folder,'parallel_merge.py'),'--output',output],{timeout:60000});
  verifyEvidence(JSON.parse(read(output,'validation.json')),readDatabases(output));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
console.log('PASS: real LangGraph parallel channel conflict, canonical candidate merge, pre-publish checkpoint fork and one native SQLite receiver effect; raw stores, four tamper cases and exact ZIP/teaching source.');
