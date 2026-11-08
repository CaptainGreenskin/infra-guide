/* Check native etcd evidence and independently reconstruct its observed state. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert'),vm=require('vm'),os=require('os');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const folder='dist/labs/etcd-consensus/',read=f=>fs.readFileSync(f,'utf8');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const record=JSON.parse(read(folder+'validation.json')),native=record.execution,o=native.observation;
assert.equal(record.status,'passed');assert.equal(native.status,'passed');assert.equal(native.system,'Linux');
assert.equal(native.version,'3.6.16');assert.equal(native.image,'gcr.io/etcd-development/etcd:v3.6.16@sha256:b29d816b546a1966fe7034a33b34e231fa98c47ce4d2883f70b0555020b22132');
assert(/^https:\/\/github\.com\/CaptainGreenskin\/infra-guide\/actions\/runs\/\d+$/.test(record.origin.run_url));
assert(/^[0-9a-f]{40}$/.test(record.origin.source_commit));
for(const[name,digest]of Object.entries(record.source_sha256))assert.equal(sha(fs.readFileSync(folder+name)),digest,name+': package source binding');
assert.equal(native.source_sha256['etcd_lab.py'],record.source_sha256['etcd_lab.py']);
assert(native.cleanup.complete);assert.deepEqual(native.cleanup.remaining,[]);

const key='/lesson/config/limit',prefix='/lesson/config/';
function independent(observed){
 const initial=observed.initial,p=observed.partition,q=observed.lost_quorum,s=observed.snapshot,r=observed.restore;
 assert.equal(initial.members.length,3);assert.equal(new Set(initial.members.map(m=>m.id)).size,3);
 assert(initial.members.every(m=>typeof m.id==='string'&&/^\d+$/.test(m.id)),'64-bit identities must remain exact strings');
 const quorum=Math.floor(initial.members.length/2)+1;assert.equal(quorum,2);assert.equal(initial.quorum,quorum);
 assert(initial.members.some(m=>m.id===initial.leader_id));assert.equal(initial.read.rows[key].value,'37');
 const w=observed.watch;assert(w.events_revision>w.list_revision);assert.equal(w.events.length,2);
 assert.deepEqual(w.events.map(e=>[e.key,e.value,e.mod_revision]).sort(),[[prefix+'release','v2',w.events_revision],[prefix+'route','A',w.events_revision]].sort());
 assert(observed.compaction.old_watch.canceled);assert.equal(observed.compaction.old_watch.compact_revision,w.events_revision);
 assert.equal(observed.lease.ttl_seconds,4);assert.equal(observed.lease.id,observed.lease.initial_lease_id);assert(observed.lease.initial_present&&observed.lease.expired_absent);
 assert.equal(p.isolated_member_id,initial.leader_id);assert.notEqual(p.majority_leader_id,p.isolated_member_id);assert(p.majority_term>initial.term);
 assert.equal(p.majority_after_write.rows[key].value,'42');assert.equal(p.minority_serializable.rows[key].value,'37');
 assert(p.majority_after_write.revision>p.minority_serializable.revision);assert.notEqual(p.minority_linearizable_exit,0);assert.notEqual(p.minority_write_exit,0);
 assert.equal(p.after_rejoin.rows[key].value,'42');assert(p.after_rejoin.revision>=p.majority_after_write.revision);
 assert.equal(observed.cas.old_revision_succeeded,false);assert.equal(observed.cas.verified_value,'42');
 assert.equal(q.running_members,1);assert(q.running_members<quorum);assert.equal(q.required_quorum,quorum);
 assert.notEqual(q.linearizable_exit,0);assert.notEqual(q.write_exit,0);assert.equal(q.after_second_member.rows[key].value,'43');
 assert.equal(q.all_members_recovered.length,3);assert(q.all_members_recovered.every(row=>row.rows[key].value==='43'));
 assert.equal(s.captured.rows[key].value,'37');assert.equal(s.revision,s.captured.revision);assert(s.bytes>0&&/^[0-9a-f]{64}$/.test(s.sha256));
 assert.equal(r.before_new_write.rows[key].value,'37');assert.notEqual(r.before_new_write.cluster_id,s.captured.cluster_id);
 assert.equal(r.bump_revision,1000);assert(r.mark_compacted);assert(r.before_new_write.revision>=s.revision+r.bump_revision);
 const previousMax=Math.max(...q.all_members_recovered.map(row=>row.revision));assert(r.before_new_write.revision>previousMax);
 assert(r.old_watch.canceled&&r.old_watch.compact_revision>previousMax);
 assert(r.relist.revision>=r.before_new_write.revision);assert.equal(r.relist.rows[key].value,'37');
 const cache=Object.fromEntries(Object.entries(r.relist.rows).map(([key,row])=>[key,row.value]));
 assert.equal(r.restarted_watch.canceled,false);assert.equal(r.restarted_watch.events.length,1);
 for(const event of r.restarted_watch.events){assert(event.mod_revision>r.relist.revision);cache[event.key]=event.value;}
 assert.deepEqual(cache,r.rebuilt_cache);assert.deepEqual(cache,Object.fromEntries(Object.entries(r.full_range_after.rows).map(([key,row])=>[key,row.value])));
 assert.equal(r.restarted_watch.events[0].key,key);assert.equal(r.restarted_watch.events[0].value,'47');
 assert.equal(r.after_new_write.rows[key].value,'47');assert(r.after_new_write.revision>r.relist.revision);
 assert.equal(r.after_new_write.rows[key].mod_revision,r.restarted_watch.events[0].mod_revision);
}
independent(o);
for(const mutate of [
 x=>x.initial.members[1].id=x.initial.members[0].id,
 x=>x.partition.minority_serializable.rows[key].value='42',
 x=>x.partition.minority_linearizable_exit=0,
 x=>x.lost_quorum.write_exit=0,
 x=>x.restore.before_new_write.cluster_id=x.snapshot.captured.cluster_id,
 x=>x.restore.old_watch.canceled=false,
 x=>x.restore.rebuilt_cache[key]='37',
 x=>x.restore.restarted_watch.events[0].mod_revision=x.restore.relist.revision,
 x=>x.lease.initial_lease_id='different'
]){const changed=JSON.parse(JSON.stringify(o));mutate(changed);assert.throws(()=>independent(changed),assert.AssertionError);}

// Reconstruct key/value observations from the exact CLI stdout, not just a
// task-level success flag. Large member IDs are deliberately never Number().
const decode=text=>Buffer.from(text,'base64').toString('utf8');
function cliRange(text){const value=JSON.parse(text);return {revision:value.header.revision,rows:Object.fromEntries((value.kvs||[]).map(k=>[decode(k.key),decode(k.value||'')]))};}
const commands=native.commands,iso=o.partition.isolated_name;
const matches=(row,words)=>words.every(word=>row.argv.includes(word));
const disconnect=commands.findIndex(row=>matches(row,['network','disconnect',iso]));
const majorityWrite=commands.findIndex((row,i)=>i>disconnect&&matches(row,['/usr/local/bin/etcdctl','put',key,'42']));
const serial=commands.findIndex((row,i)=>i>majorityWrite&&matches(row,['exec',iso,'get',key,'--consistency=s']));
const reconnect=commands.findIndex((row,i)=>i>serial&&matches(row,['network','connect',iso]));
assert(disconnect>=0&&majorityWrite>disconnect&&serial>majorityWrite&&reconnect>serial);
assert.equal(commands[disconnect].exit_code,0);assert.equal(commands[majorityWrite].exit_code,0);assert.equal(commands[reconnect].exit_code,0);
const old=cliRange(commands[serial].stdout);assert.equal(old.rows[key],'37');assert.equal(old.revision,o.partition.minority_serializable.revision);
const failedBetween=commands.slice(serial,reconnect).filter(row=>matches(row,['exec',iso,'/usr/local/bin/etcdctl'])&&row.exit_code!==0);
assert(failedBetween.some(row=>matches(row,['get',key])));assert(failedBetween.some(row=>matches(row,['put',key,'99'])));
assert(commands.some(row=>matches(row,['/usr/local/bin/etcdutl','snapshot','restore','--bump-revision=1000','--mark-compacted'])&&row.exit_code===0));
assert(!commands.some(row=>row.argv.includes('prune')));
for(const row of commands.filter(row=>row.argv[1]==='rm'||(['volume','network'].includes(row.argv[1])&&row.argv[2]==='rm')))
 assert(row.argv.at(-1).startsWith('infra-etcd-'),'cleanup must name only owned lesson resources');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'infra-etcd-check-'));
try{
 const input=path.join(temp,'native.json');fs.writeFileSync(input,JSON.stringify(native));
 execFileSync('python3',['-B',folder+'etcd_lab.py','--check-record',input],{encoding:'utf8'});
}finally{fs.rmSync(temp,{recursive:true,force:true});}
// Verify both endpoint override paths stop before any daemon operation, even
// on a machine where Linux and Docker preflight are otherwise satisfied.
execFileSync('python3',['-B','-c',`import os,runpy
from types import SimpleNamespace
from unittest.mock import patch
module=runpy.run_path('dist/labs/etcd-consensus/etcd_lab.py')
for host,context in [('tcp://example.invalid:2375','unix:///safe.sock'),('unix:///safe.sock','ssh://example.invalid'),('', 'tcp://example.invalid:2375')]:
 calls=[]
 lab=module['Lab']()
 def docker(*args,**kwargs):
  calls.append(args)
  assert args[:2]==('context','inspect'), 'daemon accessed before local endpoint check'
  return SimpleNamespace(stdout=context,returncode=0)
 lab.docker=docker
 with patch.dict(os.environ,{'DOCKER_HOST':host,'DOCKER_CONTEXT':'selected'},clear=True),patch('platform.system',return_value='Linux'),patch('shutil.which',return_value='/usr/bin/docker'):
  try: lab.run()
  except RuntimeError: pass
  else: raise AssertionError('remote daemon accepted')
 assert len(calls)==(0 if host.startswith('tcp://') else 1)
`],{encoding:'utf8'});

const c={articles:[],sources:{},para:(...texts)=>texts.map(t=>'<p>'+t+'</p>').join(''),trainingCode:(label,lang,text)=>'<pre><code>'+text+'</code></pre>'};
vm.createContext(c);vm.runInContext(read('dist/control-plane-consensus.js'),c);
const source=vm.runInContext('etcdConsensusSource',c),embedded=JSON.parse(vm.runInContext('JSON.stringify(etcdConsensusEvidence)',c));
assert.equal(source,read(folder+'etcd_lab.py'));assert.deepEqual(embedded.execution.observation,o);assert.deepEqual(embedded.origin,record.origin);
const article=JSON.parse(JSON.stringify(c.articles[0]));assert.equal(article.id,'control-plane-consensus');assert.equal(article.number,'C4.9');assert(article.sections.length>=8);
assert.equal(article.updated,'2026.11.08');assert(article.objectives.length>=3&&article.check.length>=3);
const body=article.sections.map(s=>s[1]).join('');assert(body.includes('id="etcd-consensus-run"'));assert.equal((body.match(/class="training-figure"/g)||[]).length,3);
const unescape=text=>text.replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const metadata={};for(const name of ['objects','partition','recovery']){
 const svg=read('dist/diagrams/etcd-consensus-'+name+'.svg');assert(svg.includes('<title')&&svg.includes('<desc'));
 metadata[name]=JSON.parse(unescape(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
 assert.deepEqual(metadata[name].source_sha256,native.source_sha256);
}
assert.deepEqual(metadata.objects.initial,o.initial);assert.deepEqual(metadata.partition.partition,o.partition);assert.deepEqual(metadata.partition.lost_quorum,o.lost_quorum);
assert.deepEqual(metadata.recovery.snapshot,o.snapshot);assert.deepEqual(metadata.recovery.restore,o.restore);
execFileSync('python3',['-c',`from pathlib import Path
import zipfile
lab=Path('dist/labs/etcd-consensus')
with zipfile.ZipFile(lab.with_suffix('.zip')) as archive:
 expected=['README.md','etcd_lab.py','validation.json']
 assert archive.testzip() is None
 assert sorted(archive.namelist())==sorted('etcd-consensus/'+n for n in expected)
 for name in expected: assert archive.read('etcd-consensus/'+name)==(lab/name).read_bytes(),name
`],{encoding:'utf8'});
console.log('PASS: native 3-member etcd network partition, exact CLI observations, majority/read/CAS/lease/watch invariants, real relist/event-applied cache recovery, new-cluster snapshot identity, source/ZIP/3 SVGs and both remote-daemon rejection paths.');
