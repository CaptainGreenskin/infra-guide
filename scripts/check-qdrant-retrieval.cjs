/* Recompute exact ranks, then independently read actual source and body-read rows. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const os=require('node:os');
const path=require('node:path');

const dir='dist/labs/qdrant-retrieval';
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const digestFile=file=>digest(fs.readFileSync(file));
const read=(folder,name)=>JSON.parse(fs.readFileSync(path.join(folder,name),'utf8'));
const fixture=read(dir,'source.json');
const sources=fixture.sources;
const change=fixture.authority_change;
const tenant=fixture.tenant;
const current=sources.map(row=>row.id===change.revoke?{...row,eligible:false}:
 row.id===change.revise.id?{...row,...change.revise}:row);
const sha=/^[a-f0-9]{64}$/;

function python(code,args){
 const result=cp.spawnSync('python3',['-B','-c',code,...args],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||String(result.error||'Python failed'));
 return JSON.parse(result.stdout);
}
function readDatabase(folder){
 return python(`
import json, pathlib, sqlite3, sys
path=pathlib.Path(sys.argv[1]).resolve()
with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as db:
 print(json.dumps({
  'sources':db.execute('SELECT id,tenant,eligible,version,amount FROM sources ORDER BY id').fetchall(),
  'reads':db.execute('SELECT scenario,source_id,source_version,amount FROM body_reads ORDER BY ordinal').fetchall()
 }))
`,[path.join(folder,'authority.sqlite')]);
}

const headers=row=>({tenant:row.tenant,eligible:row.eligible,source_version:row.version});
const point=row=>({id:row.id,vector:row.vector,payload:headers(row)});
const exactRank=(items,limit,allowedTenant,eligible)=>items
 .filter(row=>(allowedTenant===null||row.tenant===allowedTenant)&&(!eligible||row.eligible))
 .map(row=>({id:row.id,payload:headers(row),score:row.vector.reduce((sum,x,i)=>sum+x*fixture.query[i],0)}))
 .sort((a,b)=>b.score-a.score)
 .slice(0,limit);

function verify(record,transcript,db){
 assert.equal(record.status,'passed');
 assert.deepEqual(transcript.map(row=>row.label),[
  'engine','collection','payload_index_tenant','payload_index_eligible','initial_index','collection_info',
  'global_k2','tenant_k2','baseline_k2','retained_k2','stale_k4','refresh_index','refreshed_k2'
 ]);
 const entries=Object.fromEntries(transcript.map(row=>[row.label,row]));
 assert(transcript.every(row=>row.http_status===200));
 assert.deepEqual(entries.engine.response,record.environment.qdrant);
 assert.equal(entries.engine.response.version,'1.19.1');
 assert.equal(entries.engine.response.commit,'6ab21cac18ebb6f4ae29102c7f8f5cc11affd5de');
 assert.deepEqual(entries.collection.request,{vectors:{size:2,distance:'Dot'}});
 assert.equal(entries.collection.path,'/collections/evidence');
 assert.equal(entries.collection.method,'PUT');
 assert.equal(entries.collection.response.result,true);
 for(const [name,schema] of [['tenant','keyword'],['eligible','bool']]){
  const row=entries['payload_index_'+name];
  assert.equal(row.path,'/collections/evidence/index?wait=true');
  assert.equal(row.method,'PUT');
  assert.deepEqual(row.request,{field_name:name,field_schema:schema});
  assert.equal(row.response.result.status,'completed');
  assert.equal(entries.collection_info.response.result.payload_schema[name].data_type,schema);
 }
 assert.deepEqual(entries.collection_info.response.result.config.params.vectors,{size:2,distance:'Dot'});
 for(const [label,rows] of [
  ['initial_index',sources],['refresh_index',current.filter(x=>[change.revoke,change.revise.id].includes(x.id))]
 ]){
  const row=entries[label];
  assert.equal(row.path,'/collections/evidence/points?wait=true');
  assert.equal(row.method,'PUT');
  assert.equal(row.response.result.status,'completed');
  assert.deepEqual(row.request,{points:rows.map(point)});
 }
 const queryCases=[
  ['global_k2',2,null,false,sources],['tenant_k2',2,tenant,false,sources],
  ['baseline_k2',2,tenant,true,sources],['retained_k2',2,tenant,true,sources],
  ['stale_k4',4,tenant,true,sources],['refreshed_k2',2,tenant,true,current]
 ];
 const rankings={};
 for(const [label,limit,allowedTenant,eligible,rows] of queryCases){
  const entry=entries[label];
  const filter=[...(allowedTenant===null?[]:[{key:'tenant',match:{value:allowedTenant}}]),
   ...(eligible?[{key:'eligible',match:{value:true}}]:[])];
  const expectedQuery={query:fixture.query,limit,params:{exact:true},with_vector:false,
   with_payload:['tenant','eligible','source_version'],...(filter.length?{filter:{must:filter}}:{})};
  assert.equal(entry.path,'/collections/evidence/points/query');
  assert.equal(entry.method,'POST');
  assert.deepEqual(entry.request,expectedQuery);
  assert.equal(entry.response.status,'ok');
  const points=entry.response.result.points;
  const expected=exactRank(rows,limit,allowedTenant,eligible);
  assert.equal(points.length,expected.length,label);
  for(const [i,want] of expected.entries()){
   const got=points[i];
   assert.equal(got.id,want.id,label);
   assert(Math.abs(got.score-want.score)<1e-6,label+' dot score');
   assert.deepEqual(got.payload,want.payload,label+' indexed metadata');
   assert(!('vector' in got),label+' metadata-only response');
  }
  rankings[label]=points;
 }
 const ids=points=>points.map(hit=>hit.id);
 assert.deepEqual(record.global_top2,ids(rankings.global_k2));
 assert.deepEqual(record.postfiltered_global_top2,ids(rankings.global_k2.filter(
  hit=>hit.payload.tenant===tenant&&hit.payload.eligible)));
 assert.deepEqual(record.tenant_only_top2,ids(rankings.tenant_k2));
 assert.deepEqual([record.global_top2,record.postfiltered_global_top2,record.tenant_only_top2],
  [[701,702],[],[105,101]]);
 const scenarios=['baseline_k2','retained_k2','stale_k4','refreshed_k2'];
 assert.deepEqual(Object.keys(record.cases),scenarios);
 const bodyReads=[];
 for(const scenario of scenarios){
  const rows=scenario==='baseline_k2'?sources:current;
  const hits=rankings[scenario];
  const decisions=[],evidence=[];
  for(const hit of hits){
   const source=rows.find(row=>row.id===hit.id);
   const {tenant:sourceTenant,eligible,version}=source;
   const decision=sourceTenant!==tenant?'wrong_tenant':!eligible?'revoked':
    version!==hit.payload.source_version?'stale_version':'delivered';
   decisions.push({id:hit.id,index_version:hit.payload.source_version,
    authoritative_header:{tenant:sourceTenant,eligible,version},decision});
   if(decision==='delivered'){
    evidence.push({id:hit.id,version,amount:source.amount});
    bodyReads.push([scenario,hit.id,version,source.amount]);
   }
   if(evidence.length===fixture.required_evidence)break;
  }
  assert.deepEqual(record.cases[scenario],{candidate_ids:ids(hits),decisions,evidence,
   status:evidence.length===fixture.required_evidence?'ready':'insufficient'},scenario);
 }
 assert.deepEqual(db.sources,[...current].sort((a,b)=>a.id-b.id)
  .map(({id,tenant,eligible,version,amount})=>[id,tenant,Number(eligible),version,amount]));
 assert.deepEqual(db.reads,bodyReads);
 assert.deepEqual(bodyReads.map(row=>row.slice(1)),[
  [101,1,10],[102,1,27],[101,1,10],[101,1,10],[104,1,7],[101,1,10],[103,2,42]
 ]);
}

function verifyFiles(folder){
 const record=read(folder,'validation.json');
 const transcript=read(folder,'exchanges.json');
 const db=readDatabase(folder);
 assert.deepEqual(record.source_sha256,Object.fromEntries(['qdrant_retrieval.py','source.json']
  .map(name=>[name,digestFile(path.join(dir,name))])));
 assert.deepEqual(record.raw_sha256,Object.fromEntries(['exchanges.json','authority.sqlite']
  .map(name=>[name,digestFile(path.join(folder,name))])));
 assert.match(record.environment.qdrant_binary_sha256,sha);
 verify(record,transcript,db);
 return {record,transcript,db};
}

const published=verifyFiles(dir);
const proof=read(dir,'ci-record.json');
assert.match(proof.url,/^https:\/\/github\.com\/CaptainGreenskin\/infra-guide\/actions\/runs\/\d+$/);
assert.equal(proof.conclusion,'success');
assert.match(proof.headSha,/^[a-f0-9]{40}$/);
assert.equal(proof.archive_sha256,'70a40529e2ebe0a2787d574d3a2e28437cfe94f26f24fa419f6ac57b4ae817c9');
assert.equal(proof.qdrant_binary_sha256,'7951936099f2bdc05776f875f5b683fe49beeb8c8ad71e4ff7ae042e984efc83');
assert.equal(proof.qdrant_binary_sha256,published.record.environment.qdrant_binary_sha256);
assert.deepEqual(proof.source_sha256,published.record.source_sha256);
assert.deepEqual(proof.raw_sha256,published.record.raw_sha256);
assert.equal(proof.validation_sha256,digestFile(path.join(dir,'validation.json')));
assert.deepEqual([published.record.environment.system,published.record.environment.machine],['Linux','x86_64']);
for(const mutate of [
 x=>x.transcript.find(row=>row.label==='tenant_k2').response.result.points[0].id=701,
 x=>x.transcript.find(row=>row.label==='stale_k4').request.filter.must.pop(),
 x=>x.transcript.find(row=>row.label==='refreshed_k2').response.result.points[1].payload.source_version=1,
 x=>x.record.cases.retained_k2.status='ready',
 x=>x.db.reads.splice(3,0,['retained_k2',102,1,27]),
 x=>x.db.reads.splice(4,0,['stale_k4',103,1,41])
]){
 const changed=structuredClone(published);
 mutate(changed);
 assert.throws(()=>verify(changed.record,changed.transcript,changed.db),assert.AssertionError);
}

const expectedFiles=['README.md','authority.sqlite','ci-record.json','exchanges.json','qdrant_retrieval.py','source.json','validation.json'];
const archive=python(`
import hashlib, json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
 names=archive.namelist()
 assert len(set(names))==len(names)
 print(json.dumps({name:hashlib.sha256(archive.read(name)).hexdigest() for name in names}))
`,[dir+'.zip']);
assert.deepEqual(Object.keys(archive).sort(),expectedFiles);
for(const name of expectedFiles)assert.equal(archive[name],digestFile(path.join(dir,name)),name+' ZIP');

const svg=fs.readFileSync('dist/diagrams/qdrant-retrieval.svg','utf8');
assert.deepEqual(JSON.parse(svg.match(/<metadata>([\s\S]+?)<\/metadata>/)[1]),{
 global:published.record.global_top2,restricted_stale:published.record.cases.stale_k4.candidate_ids,
 body_reads_after_check:published.record.cases.stale_k4.evidence.map(row=>row.id),
 refreshed:published.record.cases.refreshed_k2.candidate_ids,refreshed_103_version:2
});
const author=fs.readFileSync('dist/progressive-agent-retrieval-workflow-reading.js','utf8');
for(const token of ['id="native-qdrant-retrieval"','trainingFigure(\'qdrant-retrieval\'','labs/qdrant-retrieval.zip',
 'labs/qdrant-retrieval/validation.json',proof.url])assert(author.includes(token),token);

const boundaryArticle=fs.readFileSync('dist/article/agent-retrieval/index.html','utf8');
const boundary=boundaryArticle.split('id="retrieval-revocation-boundaries"')[1].split('id="section-10"')[0];
const retained=published.record.cases.retained_k2;
const retainedReads=published.db.reads.filter(([scenario])=>scenario==='retained_k2');
assert.equal(retainedReads.length,1);
const [,readId,readVersion]=retainedReads[0];
assert(boundary.includes('候选 '+retained.candidate_ids.join('、')));
assert(boundary.includes('本次只记录 '+readId+'/v'+readVersion));
assert(boundary.includes('/article/agent-retrieval/#native-qdrant-retrieval'));
if(process.env.QDRANT_BIN){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'qdrant-replay-'));
 try{
  const output=path.join(temporary,'record');
  const result=cp.spawnSync('python3',['-B',path.join(dir,'qdrant_retrieval.py'),
   '--qdrant',process.env.QDRANT_BIN,'--output',output],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr||String(result.error||'Qdrant replay failed'));
  verifyFiles(output);
 }finally{fs.rmSync(temporary,{force:true,recursive:true});}
}
console.log('PASS: Qdrant native HTTP vectors, independent rank/filter and SQLite read oracles, six rejected mutations, exact teaching and ZIP bindings.');
