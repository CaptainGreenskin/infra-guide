/* Audit native wire evidence independently of the lab's Python decoder. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const cp=require('node:child_process'),os=require('node:os'),path=require('node:path');
const folder='dist/labs/redis-client-tracking/';
const read=file=>fs.readFileSync(file,'utf8');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const key='order:104',v7='v7/pending',v8='v8/shipped',v9='v9/delivered';
const tarSha='78dd7326c5c959202c6c3849d3ea9c61896d78d647c20f6542b52c0917f96eac';
const push=['invalidate',[key]];

function decode(raw){
 let position=0;
 function parse(){
  const lineEnd=raw.indexOf('\r\n',position);
  assert(lineEnd>position,'RESP line delimiter');
  const type=raw[position],body=raw.slice(position+1,lineEnd);
  position=lineEnd+2;
  if(type==='+')return body;
  if(type===':'){assert.match(body,/^\d+$/);return Number(body);}
  assert.match(body,/^(0|[1-9]\d*)$/);
  const count=Number(body);
  assert(count<=4096);
  if(type==='$'||type==='='){
   const end=position+count;
   assert.equal(raw.slice(end,end+2),'\r\n');
   const data=raw.slice(position,end);
   position=end+2;
   if(type==='='){assert(data.startsWith('txt:'));return data.slice(4);}
   return data;
  }
  if(type==='*'||type==='>')return Array.from({length:count},parse);
  assert.equal(type,'%');
  const pairs=[];
  for(let i=0;i<count;i++)pairs.push([parse(),parse()]);
  return Object.fromEntries(pairs);
 }
 const output=parse();
 assert.equal(position,raw.length,'one complete RESP frame');
 return output;
}

function verify(record){
 assert.equal(record.schema,'redis-client-tracking-v1');
 assert.equal(record.status,'passed');
 assert.deepEqual(record.cleanup,{redis_exit_code:0,scratch_removed:true});
 assert.equal(record.source_sha256['tracking_lab.py'],sha(folder+'tracking_lab.py'));
 assert.equal(record.environment.redis_archive_sha256,tarSha);
 assert.match(record.environment.redis,/^Redis server v=8\.2\.6\b/);
 assert.match(record.environment.redis_binary_sha256,/^[a-f0-9]{64}$/);
 const events=new Map();
 record.wire.forEach(({step,direction,connection,raw},i)=>{
  assert.match(raw,/^[\x00-\x7f]*$/);
  assert(['sent','received','eof'].includes(direction));
  assert(!events.has(step+'/'+direction),'duplicate wire observation '+step);
  if(direction==='eof')assert.equal(raw,'');
  else if(direction==='sent')assert.equal(raw[0],'*');
  events.set(step+'/'+direction,{i,connection,value:direction==='eof'?null:decode(raw)});
 });
 const event=(step,direction,conn,value)=>{
  const e=events.get(step+'/'+direction);
  assert(e,step+'/'+direction);
  assert.equal(e.connection,conn,step);
  if(value!==undefined)assert.deepEqual(e.value,value,step);
  return e;
 };
 const sent=(step,conn,value)=>event(step,'sent',conn,value);
 const received=(step,conn,value)=>event(step,'received',conn,value);
 function order(...selected){
  assert(selected.every((e,i)=>i===0||selected[i-1].i<e.i),'wire observation order');
 }
 function exchange(step,conn,request,response){
  const s=sent(step,conn,request),r=received(step,conn,response);
  order(s,r);
  return r;
 }
 function hello(conn){
  const e=exchange(conn+'-hello',conn,['HELLO','3']);
  assert.deepEqual([e.value.server,e.value.version,e.value.proto,e.value.mode],['redis','8.2.6',3,'standalone']);
  assert(Number.isInteger(e.value.id));
  return e.value.id;
 }
 const ids=Object.fromEntries(['writer','single-D','split-D','split-I','drop-D','drop-I','recover-D','recover-I'].map(conn=>[conn,hello(conn)]));
 assert.equal(new Set(Object.values(ids)).size,Object.keys(ids).length);
 function tracking(reader,redirect){
  const options=['CLIENT','TRACKING','ON'];
  if(redirect)options.push('REDIRECT',String(ids[redirect]));
  return exchange(reader+'-track',reader,options,'OK');
 }
 const set=(step,value,target=key)=>exchange(step,'writer',['SET',target,value],'OK');
 function fence(label,reader,oldStep,counts){
  const stats=step=>exchange(step,'writer',['INFO','commandstats']);
  const calls=e=>Number(e.value.match(/^cmdstat_get:calls=(\d+),/m)?.[1]||0);
  const base=stats(label+'-get-baseline'), old=sent(oldStep,reader,['GET',key]);
  const suffixes=[...events.keys()].filter(name=>name.startsWith(label+'-get-fence-')&&name.endsWith('/received'));
  const checks=suffixes.map(name=>stats(name.split('/')[0]));
  assert(checks.length>=1&&checks.length<=50);
  order(base,old,...checks);
  assert.deepEqual(checks.map(calls),[...Array(checks.length-1).fill(counts[0]),counts[1]]);
  assert.equal(calls(base),counts[0]);
  return checks.at(-1);
 }
 order(set('single-start',v7),tracking('single-D'),fence('single','single-D','single-old-get',[0,1]),
       set('single-untracked-write',v8,'order:105'),set('single-tracked-write',v8),
       sent('single-barrier','single-D',['ECHO','single-done']),received('single-old-reply','single-D',v7),
       received('single-invalidate','single-D',push),received('single-barrier','single-D','single-done'),
       exchange('single-fresh-get','single-D',['GET',key],v8));
 order(set('split-start',v7),tracking('split-D','split-I'),fence('split','split-D','split-old-get',[2,3]),
       set('split-tracked-write',v8),received('split-invalidate','split-I',push),
       sent('split-fresh-get','split-D',['GET',key]),received('split-old-reply','split-D',v7),
       received('split-fresh-reply','split-D',v8));
 order(set('drop-start',v8),tracking('drop-D','drop-I'),exchange('drop-warm-get','drop-D',['GET',key],v8),
       fence('drop','drop-D','drop-pending-get',[5,6]),
       exchange('drop-kill-invalidation-socket','writer',['CLIENT','KILL','ID',String(ids['drop-I'])],1),
       event('drop-observe-eof','eof','drop-I',null),set('drop-write-during-gap',v9),
       received('drop-pending-reply','drop-D',v8),received('drop-redis-redirect-broken','drop-D',['tracking-redir-broken',ids['drop-I']]),
       tracking('recover-D','recover-I'),exchange('recover-fresh-get','recover-D',['GET',key],v9));
 assert.deepEqual(record.wire.filter(e=>e.raw.startsWith('>')).map(e=>e.step),
                  ['single-invalidate','split-invalidate','drop-redis-redirect-broken']);
 assert.deepEqual(record.cases,{
  single:{get_calls:[0,1],ordered_delivery:[v7,push],fresh_value:v8,push_before_barrier:1},
  split:{get_calls:[2,3],tickets:[1,2],naive_after_old_reply:v7,old_fill_accepted:false,fresh_fill_accepted:true,guarded_value:v8},
  disconnect:{get_calls:[5,6],eof:true,redirect_ids:[ids['drop-I'],ids['recover-I']],naive_retained_value:v8,
              guarded_value_during_gap:null,old_fill_accepted:false,guarded_value_after_reconnect:v9}
 });
}

const evidence=JSON.parse(read(folder+'validation.json'));
assert.deepEqual([evidence.environment.system,evidence.environment.machine],['Darwin','arm64']);
verify(evidence);
const row=(d,step)=>d.wire.find(e=>e.step===step&&e.direction==='received');
for(const mutate of [
 d=>{row(d,'split-invalidate').raw=row(d,'split-invalidate').raw.replace(key,'order:105');},
 d=>{const a=d.wire.indexOf(row(d,'split-invalidate')),b=d.wire.indexOf(row(d,'split-old-reply'));[d.wire[a],d.wire[b]]=[d.wire[b],d.wire[a]];},
 d=>{d.cases.split.old_fill_accepted=true;},
 d=>{row(d,'drop-redis-redirect-broken').raw='>2\r\n$21\r\ntracking-redir-broken\r\n:0\r\n';},
 d=>{row(d,'split-get-fence-0').raw=row(d,'split-get-fence-0').raw.replace('cmdstat_get:calls=3','cmdstat_get:calls=2');},
 d=>{d.cases.disconnect.guarded_value_during_gap=v8;}
]){
 const copy=JSON.parse(JSON.stringify(evidence));mutate(copy);assert.throws(()=>verify(copy));
}
const svg=read('dist/diagrams/redis-client-tracking.svg');
assert.deepEqual(JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/)[1]),{
 key,single:[v7,'invalidate',v8],split:['invalidate',v7,v8],guarded_old_fill:false,after_reconnect:v9
});
assert.match(svg,/viewBox="0 0 460 558"/);
const html=read('dist/article/cache-consistency/index.html');
assert(html.includes('id="native-redis-client-tracking"')&&html.includes('data-toc="native-redis-client-tracking"'));
assert(html.includes('src="diagrams/redis-client-tracking.svg" width="460" height="558"'));
for(const target of ['labs/redis-client-tracking.zip','labs/redis-client-tracking/tracking_lab.py','labs/redis-client-tracking/validation.json'])
 assert(html.includes('href="'+target+'"'),target);
cp.execFileSync('python3',['-B','-c',`from pathlib import Path
from zipfile import ZipFile
p=Path('dist/labs/redis-client-tracking')
with ZipFile(p.with_suffix('.zip')) as z:
    names={'README.md','tracking_lab.py','validation.json'}
    assert z.testzip() is None
    assert sorted(z.namelist())==sorted(p.name+'/'+name for name in names)
    for name in names:
        assert z.read(p.name+'/'+name)==(p/name).read_bytes()
`]);
if(process.env.REDIS_TRACKING_BINARY||process.env.REDIS_TRACKING_SOURCE){
 assert(process.env.REDIS_TRACKING_BINARY&&process.env.REDIS_TRACKING_SOURCE);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'redis-tracking-recheck-'));
 try {
  const output=path.join(dir,'validation.json');
  cp.execFileSync('python3',['-B',folder+'tracking_lab.py','--redis-server',process.env.REDIS_TRACKING_BINARY,
                           '--source-archive',process.env.REDIS_TRACKING_SOURCE,'--output',output],{timeout:15000});
  verify(JSON.parse(read(output)));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
console.log('PASS: native Redis RESP3 bytes, two-channel old fill and reconnect oracle, six rejected mutations, exact source/ZIP and chapter targets.');
