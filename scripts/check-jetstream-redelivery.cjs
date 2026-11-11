/* Check transport and business outcomes independently from the native runner. */
'use strict';
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const pack='jetstream-redelivery',folder='dist/labs/'+pack+'/';
const read=file=>readFileSync(path.join(root,file),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const sha=file=>hash(readFileSync(path.join(root,file)));
const sourceFiles=['jetstream_redelivery.py','requirements.txt'];
const event={operation_id:'report-27:publish',amount:37};
const outcomes={
 append_only:{writers:['A','B'],attempts:['committed','committed'],revisions:[1,2]},
 business_id:{writers:['A'],attempts:['committed','duplicate'],revisions:[1,1]},
 receiver_fence:{writers:['B'],attempts:['stale_writer','committed'],revisions:[null,1]}
};
const emptyLedger=generation=>({
 authority:[{operation_id:event.operation_id,generation}],effects:[],inbox:[],attempts:[]
});

function verifyCase(mode,c){
 const stream=mode.toUpperCase(),consumer='WORK',expected=outcomes[mode];
 assert.deepEqual(c.consumer,{name:consumer,ack_policy:'explicit',ack_wait_seconds:1,max_ack_pending:1,max_deliver:3});
 assert.deepEqual(c.publish_ack,{stream,stream_seq:1});
 assert.deepEqual(c.deliveries,[1,2].map(n=>({stream,consumer,stream_seq:1,consumer_seq:n,delivery_count:n,event})));
 assert.deepEqual(Object.keys(c.client_ids).sort(),['A','B']);
 assert(Object.values(c.client_ids).every(id=>Number.isInteger(id)&&id>0));
 assert.notEqual(c.client_ids.A,c.client_ids.B);
 assert.equal(c.old_client_connected_after_redelivery,true);
 assert.deepEqual(c.initial_ledger,emptyLedger(1));
 assert.deepEqual(c.before_writes,emptyLedger(1),mode+' redelivery precedes any business write');
 assert.deepEqual(c.after_transfer,emptyLedger(2),mode+' receiver advances authority before either attempt');
 const generation=writer=>writer==='A'?1:2;
 const effects=expected.writers.map((writer,i)=>({revision:i+1,operation_id:event.operation_id,writer,generation:generation(writer),amount:event.amount}));
 const inbox=mode==='append_only'?[]:[{operation_id:event.operation_id,digest:hash(JSON.stringify({amount:event.amount,operation_id:event.operation_id})),revision:1}];
 const attempts=['A','B'].map((writer,i)=>({seq:i+1,writer,generation:generation(writer),authority:2,
                                        outcome:expected.attempts[i],revision:expected.revisions[i]}));
 assert.deepEqual(c.ledger,{...emptyLedger(2),effects,inbox,attempts},mode+' raw SQLite receipt and effect rows');
 assert.deepEqual(c.before_ack,{ack_pending:1,pending:0,ack_floor_stream_seq:0,delivered_consumer_seq:2});
 assert.deepEqual(c.ack_confirmation,{writer:'B',returned:true});
 assert.deepEqual(c.after_ack,{ack_pending:0,pending:0,ack_floor_stream_seq:1,delivered_consumer_seq:2});
}

function checkZip(){
 const script=[
  'from pathlib import Path',
  'from zipfile import ZipFile',
  'import sys',
  'name, *files = sys.argv[1:]',
  "folder = Path('dist/labs') / name",
  "with ZipFile(folder.with_suffix('.zip')) as archive:",
  "    assert sorted(archive.namelist()) == sorted(name + '/' + file for file in files)",
  '    for file in files:',
  "        assert archive.read(name + '/' + file) == (folder / file).read_bytes(), file"
 ].join('\n');
 execFileSync('python3',['-B','-c',script,pack,'README.md','ci-record.json',...sourceFiles,'validation.json'],{cwd:root,timeout:15000});
}

function checkChapterAndFigure(cases,proofUrl){
 const context=vm.createContext({});
 for(const [,file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)){
  if(file!=='app.js')vm.runInContext(read('dist/'+file),context,{filename:file});
 }
 const articles=vm.runInContext('articles',context);
 const article=id=>articles.find(a=>a.id===id),serverless=article('serverless-execution'),delivery=article('message-delivery');
 for(const chapter of [serverless,delivery])assert(chapter.updated>='2026.11.09',chapter.id+': includes the reviewed JetStream lesson');
 const anchor='native-jetstream-redelivery',body=serverless.sections[10][1],target='/article/serverless-execution/#'+anchor;
 const native=body.split('<h3 id="'+anchor+'">');
 assert.equal(native.length,2,'native unit has exactly one anchor');
 assert(!/<pre\b/.test(native[1]),'native unit adds no source code blocks');
 for(const link of ['/labs/'+pack+'.zip','/labs/'+pack+'/README.md','/labs/'+pack+'/validation.json','diagrams/'+pack+'.svg',proofUrl]){
  assert(native[1].includes('href="'+link+'"'),anchor+' missing '+link);
 }
 for(const incoming of [serverless.sections[4][1],delivery.sections[7][1]])assert(incoming.includes('href="'+target+'"'));
 const earlyAck=JSON.parse(read('dist/labs/delivery-systems/validation.json')).native.mq.execution.cases.ack_before_effect_negative;
 assert.equal(earlyAck.business_oracle_passed,false);
 const comparisonId='broker-ack-business-ledger';
 const comparison=native[1].split('<h3 id="'+comparisonId+'">');
 assert.equal(comparison.length,2,'one anchored comparison in the native experiment');
 assert(delivery.sections[4][1].includes('href="/article/serverless-execution/#'+comparisonId+'"'),'The early-ACK section links to the comparison');
 for(const link of ['/article/message-delivery/#section-5','/labs/delivery-systems/validation.json']){
  assert(comparison[1].includes('href="'+link+'"'),comparisonId+' missing '+link);
 }
 const tableBody=comparison[1].match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1]||'';
 const rowsFromRecords=[['RabbitMQ 先 ACK','<code>ready='+earlyAck.ready_messages+'</code>',earlyAck.business.effects+' 笔，验收失败']];
 for(const [mode,label] of [
  ['append_only','JetStream 直接追加'],
  ['business_id','JetStream 按业务 ID 去重'],
  ['receiver_fence','JetStream 去重并校验代际']
 ]){
  const {after_ack:ack,ledger:{effects}}=cases[mode];
  const writers=effects.map(row=>row.writer).join('、');
  const accounting=effects.length===1?' 写 1 笔':' 各 1 笔';
  const sum=effects.reduce((total,row)=>total+row.amount,0);
  rowsFromRecords.push([label,'<code>'+ack.pending+' / '+ack.ack_pending+'</code>',writers+accounting+'，共 '+sum]);
 }
 const comparisonRows=[...tableBody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
  .map(([,row])=>[...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([,cell])=>cell));
 assert.deepEqual(comparisonRows,rowsFromRecords,'Comparison uses each broker status and its own SQLite effects');
 const [authorizedWrite]=cases.receiver_fence.ledger.effects;
 assert(comparison[1].includes('写入者是 '+authorizedWrite.writer+'，代际是 '+authorizedWrite.generation));
 const workflow=article('durable-workflows').sections[5][1];
 const takeoverId='receiver-writer-after-takeover';
 assert(comparison[1].includes('/article/durable-workflows/#'+takeoverId));
 const takeoverComparison=workflow.split('<h3 id="'+takeoverId+'">')[1]?.split('</details>')[0];
 assert(takeoverComparison,'Agent receiver transaction section includes the optional writer comparison');
 for(const [mode,label] of [['business_id','仅按业务 ID 去重'],['receiver_fence','提交前再核对代际']]){
  const [effect]=cases[mode].ledger.effects;
  const qualifier=mode==='business_id'?'留下一笔':'仍留下一笔';
  assert(takeoverComparison.includes(label+'，账本'+qualifier+'金额 '+effect.amount+'，写入者是 '+effect.writer+'/'+effect.generation));
 }
 for(const value of ['<code>writer</code>','<code>generation</code>',
  '/article/serverless-execution/#'+comparisonId,'/labs/'+pack+'/validation.json']){
  assert(takeoverComparison.includes(value),value);
 }
 const svg=read('dist/diagrams/'+pack+'.svg');
 assert.match(svg,/<svg\b[^>]*role="img"[^>]*aria-labelledby="jetstream-title jetstream-desc"/);
 assert.deepEqual([...svg.matchAll(/data-stage="([^"]+)"/g)].map(m=>m[1]),['timeout_redelivery','receiver_authority']);
 const labels={committed:'提交',duplicate:'复用',stale_writer:'拒绝'};
 const rows=[...svg.matchAll(/data-mode="([^"]+)">([\s\S]*?)<\/g>/g)];
 assert.deepEqual(rows.map(m=>m[1]),Object.keys(outcomes));
 for(const [,mode,row] of rows){
  const cells=[...row.matchAll(/<text\b[^>]*>([^<]+)<\/text>/g)].map(m=>m[1]);
  assert.deepEqual(cells.slice(1),[...cases[mode].ledger.attempts.map(r=>labels[r.outcome]),String(cases[mode].ledger.effects.length)]);
 }
}

const record=JSON.parse(read(folder+'validation.json')),proof=JSON.parse(read(folder+'ci-record.json'));
assert.equal(record.schema,'jetstream-redelivery-v1');
assert.equal(record.status,'passed');
assert.match(proof.url,/^https:\/\/github\.com\/CaptainGreenskin\/infra-guide\/actions\/runs\/[0-9]+$/);
assert.match(proof.headSha,/^[0-9a-f]{40}$/);
assert.equal(proof.conclusion,'success');
assert.equal(proof.record_sha256,sha(folder+'validation.json'));
assert.equal(proof.source_sha256,sha(folder+'jetstream_redelivery.py'));
assert.equal(proof.server_archive_sha256,'67cb8e10bc6f0c4b47f75a728529a20953dbae2a4f9a4a52ae8517d65ae303ff');
assert(read(folder+'README.md').includes(proof.url));
assert.deepEqual(record.source_sha256,Object.fromEntries(sourceFiles.map(file=>[file,sha(folder+file)])));
assert.deepEqual(record.fixture,event);
assert.equal(record.loopback_address,'127.0.0.1');
assert.deepEqual([record.environment.server,record.environment.nats_py],['2.15.2','2.16.0']);
assert.deepEqual([record.environment.system,record.environment.machine],['Linux','x86_64']);
assert.match(record.environment.server_binary_sha256,/^[0-9a-f]{64}$/);
assert.equal(proof.server_binary_sha256,record.environment.server_binary_sha256);
assert.deepEqual(record.cleanup,{broker_stopped:true,scratch_removed:true});
assert.deepEqual(Object.keys(record.cases).sort(),Object.keys(outcomes).sort());
for(const [mode,c] of Object.entries(record.cases))verifyCase(mode,c);
checkZip();
checkChapterAndFigure(record.cases,proof.url);
console.log('PASS: 3 native JetStream timeout contrasts, independent SQLite ledger, RabbitMQ ACK comparison, source/ZIP and teaching anchors.');
