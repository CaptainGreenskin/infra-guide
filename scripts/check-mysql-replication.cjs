/* MySQL native evidence and an independent business/GTID oracle. No Docker run here. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert'),vm=require('vm'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function gtidSet(text){
 const result=new Map();assert.equal(typeof text,'string');
 for(const group of text.split(',').map(s=>s.trim()).filter(Boolean)){
  const [uuid,...parts]=group.split(':');assert(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(uuid));
  assert(parts.length);const ranges=result.get(uuid.toLowerCase())||[];
  for(const p of parts){assert(/^\d+(?:-\d+)?$/.test(p));const [lo,hi=lo]=p.split('-').map(Number);assert(Number.isSafeInteger(lo)&&Number.isSafeInteger(hi)&&lo>=1&&hi>=lo);ranges.push([lo,hi]);}
  ranges.sort((a,b)=>a[0]-b[0]);const merged=[];for(const r of ranges){const tail=merged.at(-1);if(tail&&r[0]<=tail[1]+1)tail[1]=Math.max(tail[1],r[1]);else merged.push([...r]);}result.set(uuid.toLowerCase(),merged);
 }
 return result;
}
function subset(left,right){const a=gtidSet(left),b=gtidSet(right);return [...a].every(([uuid,ranges])=>ranges.every(([lo,hi])=>(b.get(uuid)||[]).some(([l,h])=>l<=lo&&h>=hi)));}
function account(state,expected){
 const actual=Object.fromEntries(state.receipts.map(r=>[r.id,r.delta]));assert.equal(Object.keys(actual).length,state.receipts.length);
 assert.deepStrictEqual(actual,expected);assert.equal(state.balance,100+Object.values(expected).reduce((n,x)=>n+x,0));
}
function verifyNative(record,source){
 assert.equal(record.status,'passed');assert.deepStrictEqual(record.cleanup_errors,[]);assert.equal(record.source_sha256,hash(source));
 assert(/^\d{4}-\d\d-\d\d$/.test(record.verified_on));
 const r=record.result,env=r.environment;assert.equal(env.image_requested,'mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902');
 assert.equal(env.source_version.split('-')[0],'8.4.13');assert.equal(env.replica_version.split('-')[0],'8.4.13');assert.notEqual(env.source_uuid,env.replica_uuid);assert(/^sha256:[\da-f]{64}$/.test(env.image));assert(env.repo_digests.some(d=>d.includes('sha256:')));
 assert.equal(env.local_unix_endpoint_verified,true);
 assert.equal(r.initial.balance,100);assert.equal(r.initial.replica_wait,0);
 for(const uuid of gtidSet(r.initial.source_bootstrap_gtid).keys())assert.equal(uuid,env.source_uuid);
 for(const uuid of gtidSet(r.initial.replica_bootstrap_gtid).keys())assert.equal(uuid,env.replica_uuid);
 const rr=r.read_views.rr,rc=r.read_views.rc;
 assert.equal(rr.begin_before_update,true);assert.deepStrictEqual([rr.first.balance,rr.same_transaction.balance,rr.after_commit.balance],[110,110,130]);
 assert(rr.first.connection>0);assert.equal(rr.first.connection,rr.same_transaction.connection);assert.equal(rr.first.connection,rr.after_commit.connection);assert.equal(rr.first.isolation,'REPEATABLE-READ');
 assert.deepStrictEqual([rc.first.balance,rc.same_transaction.balance],[130,135]);assert.equal(rc.first.connection,rc.same_transaction.connection);assert.equal(rc.first.isolation,'READ-COMMITTED');
 const before={BEFORE_FIRST_READ:10,AFTER_FIRST_READ:20,RC_UPDATE:5},old={...before,RECEIVED_NOT_APPLIED:7};
 account(r.lag.source,old);account(r.lag.replica,before);
 assert.equal(r.lag.status.Replica_IO_Running,'Yes');assert.equal(r.lag.status.Replica_SQL_Running,'No');
 assert.equal(r.lag.status.Last_IO_Errno,'0');assert.equal(r.lag.status.Last_SQL_Errno,'0');assert.equal(r.lag.status.Auto_Position,'1');
 assert(subset(r.lag.source_target,r.lag.status.Retrieved_Gtid_Set));assert(!subset(r.lag.source_target,r.lag.status.Executed_Gtid_Set));
 assert(!subset(r.lag.source_target,r.lag.replica.executed));assert(subset(r.lag.source_target,r.lag.source.executed));
 assert.deepStrictEqual([r.lag.received_contains_target,r.lag.executed_contains_target,r.lag.wait_before_apply],[1,0,1]);assert.equal(r.lag.promote_allowed,false);
 assert.equal(r.caught_up.wait,0);account(r.caught_up.replica,old);assert(subset(r.lag.source_target,r.caught_up.replica.executed));
 const sw=r.switchover;assert.equal(sw.wait,0);account(sw.source_before_stop,old);account(sw.replica_before_promotion,old);
 assert(subset(sw.frozen_target,sw.source_before_stop.executed)&&subset(sw.source_before_stop.executed,sw.frozen_target));
 assert(subset(r.initial.source_bootstrap_gtid,sw.frozen_target));
 assert(subset(sw.frozen_target,sw.replica_before_promotion.executed));
 // A fresh official image can create local initialization GTIDs. Only the
 // BEFORE-replication captured baseline may supplement the source handover G.
 assert.equal(sw.allowed_initial_gtids,r.initial.replica_bootstrap_gtid);
 const allowed=sw.frozen_target+(sw.allowed_initial_gtids?','+sw.allowed_initial_gtids:'');
 assert(subset(sw.allowed_target_gtids,allowed)&&subset(allowed,sw.allowed_target_gtids));
 assert(subset(sw.replica_before_promotion.executed,allowed));assert(subset(allowed,sw.replica_before_promotion.executed));
 assert.equal(sw.unexpected_target_gtids,'');assert.equal(sw.missing_target_gtids,'');
 assert(['1142','1290'].includes(sw.old_writer_error));assert.equal(sw.old_admin_error,'1290');assert.equal(sw.old_container_running,false);assert(sw.old_stopped_write_exit>0);
 account(sw.new_primary,{...old,NEW_WRITER:3});assert.equal(sw.new_primary.server_uuid,env.replica_uuid);assert.notEqual(sw.new_primary.server_uuid,env.source_uuid);
 assert.equal(sw.oracle.balance,145);assert.equal(sw.oracle.ledger_difference,0);assert.deepStrictEqual([...sw.oracle.receipt_ids].sort(),[...Object.keys(old),'NEW_WRITER'].sort());
 return r;
}
module.exports={verifyNative,gtidSet,subset};
if(require.main===module){
 process.chdir(root);const dir='dist/labs/mysql-replication/',source=fs.readFileSync(dir+'replication_lab.py'),native=JSON.parse(fs.readFileSync(dir+'native-record.json'));
 cp.execFileSync('python3',['-c',`import importlib.util,os,types\nfrom unittest.mock import patch\nspec=importlib.util.spec_from_file_location('lesson','dist/labs/mysql-replication/replication_lab.py')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nfor endpoint in ['unix:///var/run/docker.sock','unix:///run/user/1000/docker.sock']: m.validate_local_endpoint(endpoint)\nfor endpoint in ['tcp://remote:2375','ssh://remote','http://remote','unix://remote/sock','unix:relative','unix:///sock?x=1','unix:///sock#x','']:\n try: m.validate_local_endpoint(endpoint)\n except ValueError: pass\n else: raise AssertionError('nonlocal endpoint accepted')\nwith patch.dict(os.environ,{'DOCKER_HOST':'tcp://remote:2375'}),patch.object(m.subprocess,'run') as run:\n try: m.verify_local_docker()\n except ValueError: pass\n else: raise AssertionError('remote override accepted')\n run.assert_not_called()\nwith patch.dict(os.environ,{'DOCKER_HOST':''}),patch.object(m.subprocess,'run',side_effect=[types.SimpleNamespace(returncode=0,stdout='example\\n'),types.SimpleNamespace(returncode=0,stdout='ssh://remote\\n')]) as run:\n try: m.verify_local_docker()\n except ValueError: pass\n else: raise AssertionError('remote context accepted')\n assert len(run.call_args_list)==2\n assert all(call.args[0][1]=='context' for call in run.call_args_list)\n`]);
 const r=verifyNative(native,source),record=JSON.parse(fs.readFileSync(dir+'validation.json'));
 assert.equal(record.status,'passed');assert.deepStrictEqual(record.execution,r);assert.equal(record.checked_on,native.verified_on);
 for(const[file,sha]of Object.entries(record.source_sha256))assert.equal(hash(fs.readFileSync(dir+file)),sha,file+': record source binding');
 assert(/^https:\/\/github.com\/CaptainGreenskin\/infra-guide\/actions\/runs\/\d+$/.test(record.ci.run_url));assert(/^[a-f0-9]{40}$/.test(record.ci.commit));
 assert.equal(hash(cp.execFileSync('git',['show',record.ci.commit+':dist/labs/mysql-replication/replication_lab.py'])),hash(source),'native CI commit must contain this exact program');
 const uuid='11111111-1111-1111-1111-111111111111';assert(subset(uuid+':2:4-5',uuid+':1-6'));assert(!subset(uuid+':3-5',uuid+':1-3:5'));assert(!subset(uuid+':1','22222222-2222-2222-2222-222222222222:1'));assert.throws(()=>gtidSet(uuid+':0'));
 // Enumerate only these tiny teaching sets, independently of interval containment.
 const replicaUuid='22222222-2222-2222-2222-222222222222';
 const atoms=text=>{const values=new Set();for(const[id,ranges]of gtidSet(text))for(const[lo,hi]of ranges)for(let n=lo;n<=hi;n++)values.add(id+':'+n);return values;};
 const minus=(a,b)=>{const other=atoms(b);return [...atoms(a)].filter(id=>!other.has(id)).sort();};
 const sourceGoal=uuid+':1-8',bootstrap=replicaUuid+':1-2',allowed=sourceGoal+','+bootstrap;
 const missing=uuid+':1-6:8,'+bootstrap,extra=sourceGoal+','+replicaUuid+':1-3';
 assert.deepStrictEqual(minus(sourceGoal,missing),[uuid+':7']);assert.deepStrictEqual(minus(missing,allowed),[]);
 assert(subset(sourceGoal,extra));assert.deepStrictEqual(minus(sourceGoal,extra),[]);assert.deepStrictEqual(minus(extra,allowed),[replicaUuid+':3']);
 assert.deepStrictEqual(minus(sourceGoal,allowed),[]);assert.deepStrictEqual(minus(allowed,allowed),[]);
 for(const mutate of [x=>{x.lag.replica.balance=142;},x=>{x.lag.promote_allowed=true;},x=>{x.switchover.old_container_running=true;},x=>{x.switchover.new_primary.receipts.pop();},x=>{x.switchover.new_primary.receipts[0].delta++;},x=>{x.switchover.replica_before_promotion.executed+=','+x.environment.replica_uuid+':99999';}]){const bad=JSON.parse(JSON.stringify(native));mutate(bad.result);assert.throws(()=>verifyNative(bad,source));}
 const decode=s=>s.replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 for(const [name,expected]of [['views',r.read_views],['pipeline',r.lag],['switch',r.switchover]]){
  const svg=fs.readFileSync('dist/diagrams/mysql-replication-'+name+'.svg','utf8');assert(svg.includes('<title')&&svg.includes('<desc'));
  const metadata=JSON.parse(decode(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));assert.deepStrictEqual(metadata,expected);
 }
 const c={};vm.createContext(c);for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
 if(!vm.runInContext('articles.some(a=>a.id==="mysql-replication")',c))vm.runInContext(fs.readFileSync('dist/mysql-replication.js','utf8'),c);
 const a=JSON.parse(vm.runInContext('JSON.stringify(articles.find(a=>a.id==="mysql-replication"))',c));assert.equal(a.module,'cloud-data');assert(a.sections.length>=8);assert(a.minutes>=40);
 const reviews=require('./content-review-records.cjs');
 const currentReview=[...reviews.new_chapter_reviews,...reviews.body_revisions].filter(r=>r.id===a.id).at(-1);
 assert(currentReview,'replication chapter needs a signed current-body review');
 assert.equal(a.updated,currentReview.reviewed_at.slice(0,10).replaceAll('-','.'));
 assert.equal(hash(JSON.stringify({title:a.title,sections:a.sections})),currentReview.reviewed_content_sha256,'native evidence and the current full-body review must both remain valid');
 const body=a.sections.map(s=>s[1]).join(''),code=[...body.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>decode(m[1]));assert(code.includes(source.toString().trim()));assert(body.includes('id="mysql-replication-run"'));
 assert.equal(code.length,4,'SQL walkthrough, exact gate excerpt, command and complete Python source');
 const nativeLines=source.toString().split(/\r?\n/),gateStart=nativeLines.findIndex(line=>line.startsWith('    allowed_target='));assert(gateStart>=0);
 const gateLines=nativeLines.slice(gateStart,gateStart+4);assert(gateLines[3].startsWith('    assert unexpected_target=='));
 const gateExcerpt=gateLines.map(line=>line.slice(4)).join('\n');
 assert.equal(vm.runInContext('mysqlReplicationGateExcerpt',c),gateExcerpt);assert(code.includes(gateExcerpt),'gate excerpt must be the same four native source lines with only common indent removed');
 assert(a.sections[3][1].includes('S:1-6:8')&&a.sections[3][1].includes('S:7')&&a.sections[3][1].includes('R:3'),'locally explain missing and unknown-extra GTIDs');
 assert(a.sections[1][1].includes('100（事务41）→110（事务47）→130（事务50）→135（事务51）'));
 assert(a.sections[1][1].includes('全部是用于解释的教学假设')&&a.sections[3][1].includes('连续四行'),'separate teaching identities and the actual code excerpt');
 const walkthrough=vm.runInContext('mysqlReplicationReadSQL',c).trim();assert(code.includes(walkthrough),'inline SQL must match the authored role walkthrough');
 const sql=walkthrough.replace(/--[^\n]*/g,'').replace(/\s+/g,' ').trim();
 assert.equal((sql.match(/SELECT JSON_OBJECT/gi)||[]).length,5);
 assert(sql.includes('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;'));
 assert(sql.includes('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;'));
 for(const[op,delta]of [['BEFORE_FIRST_READ',10],['AFTER_FIRST_READ',20],['RC_UPDATE',5]]){
  assert(sql.includes('START TRANSACTION; UPDATE replica_lab.account SET balance=balance+('+delta+') WHERE id=1; INSERT INTO replica_lab.receipt VALUES (\''+op+'\','+delta+'); COMMIT;'),'writer excerpt must retain the same-transaction receipt for '+op);
 }
 assert(a.sections[1][1].includes('每次Lab.change另开写连接')&&a.sections[1][1].includes('不能把整段交给同一个连接'),'explain the read/write roles and the excerpt execution boundary');
 cp.execFileSync('python3',['-c',`from pathlib import Path\nimport zipfile\np=Path('dist/labs/mysql-replication')\nwith zipfile.ZipFile(p.with_suffix('.zip')) as z:\n assert z.testzip() is None\n expected=['replication_lab.py','README.md','native-record.json','validation.json']\n assert sorted(z.namelist())==sorted('mysql-replication/'+n for n in expected)\n for n in expected: assert z.read('mysql-replication/'+n)==(p/n).read_bytes(),n\n`]);
 console.log('PASS: real MySQL 8.4.13 native-source binding, independent RR/RC and GTID interval/ledger checks, receiver-versus-apply gate, old-write isolation and new145, rejection probes, exact complete source/ZIP and three data-bound diagrams. Docker is not rerun by this page check.');
}
