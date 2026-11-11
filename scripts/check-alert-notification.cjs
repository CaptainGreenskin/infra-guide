const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const name='alert-notification',folder='dist/labs/'+name+'/',archive='dist/labs/'+name+'.zip';
const read=file=>fs.readFileSync(folder+file);
const record=JSON.parse(read('validation.json'));
const cases=['long','short','silenced'];
const alertname='GuideNotificationDelivery';
const files=['README.md','alert_notification.py','release-provenance.json','validation.json'];
function verify(data){
 assert.equal(data.status,'passed');
 assert.equal(data.environment.system,'Darwin');
 assert.equal(data.environment.machine,'arm64');
 assert.equal(data.environment.transport,'loopback HTTP');
 for(const [name,version] of [['prometheus','3.5.0'],['alertmanager','0.34.2']]){
  const tool=data.environment.tools[name];
  assert(tool.version.startsWith(name+', version '+version+' '));
  assert.match(tool.binary_sha256,/^[0-9a-f]{64}$/);
 }
 const {rules,prometheus,alertmanager}=data.configuration;
 const [rule]=rules.groups[0].rules;
 assert.deepEqual(rule,{alert:alertname,expr:'lab_notification_active == 1',for:'1s',labels:{severity:'teaching'}});
 assert.deepEqual(alertmanager.route,{receiver:'fallback',group_by:['alertname','case'],group_wait:'5s',
  group_interval:'2s',repeat_interval:'60s',routes:[{receiver:'reports',matchers:['severity="teaching"']}]});
 const receiver=prometheus.scrape_configs[0].static_configs[0].targets[0];
 const manager=prometheus.alerting.alertmanagers[0].static_configs[0].targets[0];
 assert.match(receiver,/^127\.0\.0\.1:\d+$/);
 assert.match(manager,/^127\.0\.0\.1:\d+$/);
 assert.deepEqual(data.active_target.activeAlertmanagers,[{url:'http://'+manager+'/api/v2/alerts'}]);
 assert.deepEqual(alertmanager.receivers,['fallback','reports'].map(path=>({
  name:path,webhook_configs:[{url:'http://'+receiver+'/'+path,send_resolved:true}],
 })));
 assert.deepEqual(data.inputs.map(({case:key,value})=>[key,value]),
  [['short',1],['long',1],['silenced',1],['short',0],['long',0],['silenced',0]]);
 const [start,,,shortOff,longOff,silencedOff]=data.inputs.map(row=>row.at_ms);
 assert(data.inputs.slice(0,3).every(row=>row.at_ms===start));
 for(const snapshot of [data.prometheus_firing,data.alertmanager_ingress]){
  assert.deepEqual(Object.keys(snapshot.alerts).sort(),cases);
  for(const key of cases){
   const labels=snapshot.alerts[key].labels;
   assert.deepEqual(labels,{alertname,case:key,instance:receiver,job:'reports',severity:'teaching'});
  }
 }
 assert(data.prometheus_firing.at_ms>=start+1000);
 assert(data.alertmanager_ingress.at_ms>=data.prometheus_firing.at_ms);
 assert(shortOff>=data.alertmanager_ingress.at_ms);
 for(const key of cases)assert.equal(data.prometheus_firing.alerts[key].state,'firing');
 assert.match(data.silence_id,/^[0-9a-f-]{36}$/);
 const checkAlertmanagerState=alerts=>{
  for(const row of alerts){
   const silenced=row.labels.case==='silenced';
   assert.equal(row.status.state,silenced?'suppressed':'active');
   assert.deepEqual(row.status.silencedBy,silenced?[data.silence_id]:[]);
   assert.deepEqual(row.status.inhibitedBy,[]);
   assert.deepEqual(row.receivers,[{name:'reports'}]);
  }
 };
 checkAlertmanagerState(Object.values(data.alertmanager_ingress.alerts));
 for(const snapshot of [data.short_cleared,data.after_group_wait]){
  assert.deepEqual(snapshot.alerts.map(row=>row.labels.case).sort(),['long','silenced']);
  checkAlertmanagerState(snapshot.alerts);
 }
 assert(data.short_cleared.at_ms>=shortOff&&data.short_cleared.at_ms-start<5000);
 assert(data.after_group_wait.at_ms>=data.alertmanager_ingress.at_ms+6000);
 assert(silencedOff===longOff&&longOff>=data.after_group_wait.at_ms);
 assert.deepEqual(data.receiver_events.map(({path,payload})=>[path,payload.status]),
  [['/reports','firing'],['/reports','resolved']]);
 for(const {payload} of data.receiver_events){
  assert.equal(payload.receiver,'reports');
  assert.deepEqual(payload.groupLabels,{alertname,case:'long'});
  assert.equal(payload.alerts.length,1);
  const [alert]=payload.alerts;
  assert.equal(alert.status,payload.status);
  assert.deepEqual(alert.labels,data.prometheus_firing.alerts.long.labels);
 }
 const [firing,resolved]=data.receiver_events;
 assert(firing.at_ms>=start+5000&&firing.at_ms<=longOff);
 assert(resolved.at_ms>=longOff&&data.observed_until_ms>=resolved.at_ms);
 return {firing_cases:cases,early_clear:['short'],silenced:['silenced'],
         delivered:data.receiver_events.map(({payload})=>[payload.groupLabels.case,payload.status]),group_wait_seconds:5};
}
const trace=verify(record);
for(const mutate of [
 r=>{r.short_cleared.at_ms=r.observed_until_ms;},
 r=>{r.alertmanager_ingress.alerts.silenced.status.silencedBy=[];},
 r=>{r.receiver_events[0].path='/fallback';},
 r=>{r.receiver_events.pop();},
]){
 const changed=structuredClone(record);mutate(changed);
 assert.throws(()=>verify(changed),assert.AssertionError);
}
const sha=data=>createHash('sha256').update(data).digest('hex');
assert.deepEqual(record.source_sha256,Object.fromEntries(files.slice(0,-1).map(file=>[file,sha(read(file))])));
const provenance=JSON.parse(read('release-provenance.json'));
assert.equal(provenance.platform,'darwin-arm64');
assert.equal(provenance.prometheus.archive_sha256,'c17bc2c992f0b5515eebe2b4ccd626214f8e309a0fe6ec40ed13c42ec13d05fb');
assert.equal(provenance.alertmanager.archive_sha256,'dc1fcd4ad3e8bef111683eaf385aa5b2b02493277bca9126c129e0a39fc68a4f');
assert.deepEqual(execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).trim().split('\n'),files.map(file=>name+'/'+file));
for(const file of files)assert.deepEqual(execFileSync('unzip',['-p',archive,name+'/'+file]),read(file));
const svg=fs.readFileSync('dist/diagrams/alert-notification.svg','utf8');
assert.deepEqual(JSON.parse(svg.match(/<metadata>([^<]+)<\/metadata>/)[1]),trace);
const page=fs.readFileSync('dist/article/slo/index.html','utf8');
for(const marker of ['id="alert-notification-handoff"','id="native-alert-notification"','id="alert-notification-record-check"','diagrams/alert-notification.svg','labs/alert-notification.zip','labs/alert-notification/validation.json'])assert(page.includes(marker),marker);
const handoff=page.split('id="alert-notification-handoff"')[1].split('id="native-alert-notification"')[0];
assert.match(handoff,/href="[^"]*\/article\/slo\/#alert-notification-record-check"/);
const example=page.split('id="alert-notification-record-check"')[1].split('</section>')[0];
const ingressTime=record.alertmanager_ingress.at_ms,firstReceiptTime=record.receiver_events[0].at_ms;
for(const time of [ingressTime,firstReceiptTime,firstReceiptTime-ingressTime])assert(example.includes(time+' ms'),time);
const encoded=example.match(/<pre\b[^>]*><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
assert(encoded,'rendered alert record checker');
const entities={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
const program=encoded.replace(/&(?:amp|lt|gt|quot|#39);/g,entity=>entities[entity]);
const runExample=file=>execFileSync('python3',['-B','-c',program,file],{
 encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000,
}).trim().split('\n');
assert.deepEqual(runExample(folder+'validation.json'),[
 'short absent []',
 'silenced suppressed []',
 "long active [('/reports', 'firing'), ('/reports', 'resolved')]",
]);
const temp=fs.mkdtempSync(join(tmpdir(),'infra-alert-reading-'));
try{
 const changedPath=join(temp,'validation.json');
 for(const mutate of [
  r=>{r.receiver_events.pop();},
  r=>{r.after_group_wait.alerts.find(alert=>alert.labels.case==='silenced').status.silencedBy=[];},
 ]){
  const changed=structuredClone(record);mutate(changed);
  fs.writeFileSync(changedPath,JSON.stringify(changed));
  assert.throws(()=>runExample(changedPath),error=>error.status===1&&error.stderr.includes('AssertionError'));
 }
}finally{
 fs.rmSync(temp,{recursive:true,force:true});
}
console.log('PASS: real Prometheus and Alertmanager API observations, early recovery and persistent silence, raw firing/resolved webhook, source, figure and ZIP.');
