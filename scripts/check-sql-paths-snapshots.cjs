const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const folder='dist/labs/sql-paths-snapshots',record=JSON.parse(fs.readFileSync(folder+'/validation.json'));
assert.equal(record.status,'passed');
const c={};vm.createContext(c);for(const [,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const files=vm.runInContext('sqlPathSnapshotFiles',c);
for(const name of ['query_paths.py','snapshot_retry.py']){
 const bytes=fs.readFileSync(folder+'/'+name);assert.equal(files[name],bytes.toString('utf8'));
 assert.equal(record.programs[name].source_sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
 assert.equal(record.programs[name].runs.length,2);
}
const ids=Array.from({length:240},(_,i)=>i+1),eligible=ids.filter(id=>(id-1)%3===1&&id%4===0&&1000+id>=1100).sort((a,b)=>b-a);
const expected=eligible.slice(0,5).map(id=>[id,id*7]);assert.deepEqual(expected,[[236,1652],[224,1568],[212,1484],[200,1400],[188,1316]]);
const counts={all_rows:240,tenant_rows:ids.filter(id=>(id-1)%3===1).length,tenant_status_rows:ids.filter(id=>(id-1)%3===1&&id%4===0).length,all_predicates_rows:eligible.length,returned_rows:5};
const cases=['no_index','tenant_only','composite','covering'];
for(const run of record.programs['query_paths.py'].runs){
 assert.deepEqual(run.distribution_counts,counts);for(const name of cases){assert.deepEqual(run.cases[name].result,expected);assert(run.cases[name].progress_callbacks_n1>0);}
 // These are the recorded fixed-version plans, not a parser contract for application SQL.
 const details=name=>run.cases[name].plan.map(row=>row[3]).join(' | ');
 assert(details('no_index').includes('SCAN orders')&&details('no_index').includes('TEMP B-TREE'));
 assert(details('tenant_only').includes('tenant=?')&&details('tenant_only').includes('TEMP B-TREE'));
 assert(details('composite').includes('tenant=? AND status=? AND created>?')&&!details('composite').includes('TEMP B-TREE'));
 assert(details('covering').includes('COVERING INDEX')&&!details('covering').includes('TEMP B-TREE'));
 assert(run.expression_sort.plan.some(row=>row[3].includes('TEMP B-TREE')));assert.deepEqual(run.expression_sort.result,expected);
 assert(run.metric_scope.includes('not exact VM instructions'));
}
const validateSnapshot=run=>{
 for(const [name,final]of [['revalidate',100+10-5],['reuse_stale_absolute_value',100-5]]){
  const row=run[name];assert.equal(row.final_units,final);assert.equal(row.business_expected_units,105);assert.equal(row.conserves_business_changes,final===105);
  assert.deepEqual(row.events.map(e=>e.step),[1,2,3,4,5,6,7]);assert.equal(row.events[0].units,100);assert.equal(row.events[1].units,110);assert.equal(row.events[2].units,100);
  assert.equal(row.events[3].event,'write_upgrade_rejected');assert.equal(row.events[4].event,'rollback_old_snapshot');
  assert.equal(row.events[6].units,final);
 }
 assert.equal(run.revalidate.events[5].fresh_units,110);assert.equal(run.reuse_stale_absolute_value.events[5].units,95);
};
for(const run of record.programs['snapshot_retry.py'].runs)validateSnapshot(run);
assert.equal(record.programs['snapshot_retry.py'].runs[1].revalidate.events[3].sqlite_errorcode,517);
assert.equal(record.programs['snapshot_retry.py'].runs[1].revalidate.events[3].sqlite_errorname,'SQLITE_BUSY_SNAPSHOT');

for(const name of ['query_paths.py','snapshot_retry.py']){
 const p=cp.spawnSync('python3',[folder+'/'+name],{encoding:'utf8',timeout:20000,maxBuffer:1024*1024});assert.equal(p.status,0,p.stderr);const run=JSON.parse(p.stdout);assert.equal(run.status,'passed');
 if(name==='snapshot_retry.py')validateSnapshot(run);else{assert.deepEqual(run.distribution_counts,counts);for(const key of cases)assert.deepEqual(run.cases[key].result,expected);}
}
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const html=fs.readFileSync('dist/article/database-index-locks/index.html','utf8'),blocks=[...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>decode(m[1]).trim());
for(const name of ['query_paths.py','snapshot_retry.py'])assert(blocks.includes(files[name].trim()),name+': static source mismatch');
for(const id of ['sql-plan-lab','sql-snapshot-lab'])assert(html.includes('id="'+id+'"'));
assert(html.includes('labs/sql-paths-snapshots.zip'));
const article=vm.runInContext('articles.find(a=>a.id==="database-index-locks")',c);assert(['定位缩小候选范围','排序','覆盖','EXPLAIN QUERY PLAN'].every(term=>article.sections[3][1].includes(term)),'query plan explains localization, ordering and coverage separately');assert(article.sections[6][1].includes('query_paths.py'));
const metadata=name=>{const source=fs.readFileSync('dist/diagrams/'+name+'.svg','utf8'),m=[...source.matchAll(/<metadata[^>]*>([\s\S]*?)<\/metadata>/g)].find(m=>!m[1].includes('<rdf:'));assert(m);return JSON.parse(decode(m[1]));};
assert.deepEqual(metadata('v35-covering-index').result,expected);
const chart=metadata('v35-query-callbacks');assert.equal(chart.n,1);assert.equal(chart.timing_measured,false);
chart.runs.forEach((run,i)=>assert.deepEqual(run.callbacks,cases.map(name=>record.programs['query_paths.py'].runs[i].cases[name].progress_callbacks_n1)));
const timeline=metadata('v35-snapshot-retry');assert.equal(timeline.revalidate,105);assert.equal(timeline.stale_absolute,95);assert.equal(timeline.errorcode,517);
const zip=cp.spawnSync('python3',['-c',`from pathlib import Path
import zipfile
p=Path('${folder}')
with zipfile.ZipFile(str(p)+'.zip') as z:
 assert len(z.namelist())==4
 for n in z.namelist(): assert z.read(n)==(p/Path(n).name).read_bytes(),n
`],{encoding:'utf8'});assert.equal(zip.status,0,zip.stderr);
console.log('PASS: actual SQLite replays, independent240/80/20/12/5 distribution and result oracle, recorded localization/sort/covering differences, 105-vs95 business conservation; exact inline sources, ZIP, three figure metadata and stable run anchors. No IO/time or MySQL claim.');
