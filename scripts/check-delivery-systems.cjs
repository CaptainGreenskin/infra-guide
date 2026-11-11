/* Verify actual native records with independent business/state oracles; no Docker installation here. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const c={};vm.createContext(c);for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const d=JSON.parse(JSON.stringify(vm.runInContext('({files:deliveryNativeFiles,report:deliveryNativeValidation,articles})',c)));
const folder='dist/labs/delivery-systems/',r=JSON.parse(fs.readFileSync(folder+'validation.json'));
assert.deepEqual(r,d.report);assert.equal(r.status,'passed');assert.equal(r.ci.run_id,42445552027);assert.equal(r.ci.conclusion,'success');assert.equal(r.ci.source_commit,'778d692f473092e47b0a5147f2f922a3ec10f918');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#(?:39|x27);/g,"'").replace(/&amp;/g,'&');
for(const[file,source]of Object.entries(d.files)){
 assert.equal(source,fs.readFileSync(folder+file,'utf8'));
 if(file.endsWith('.md'))continue;
 assert.equal(sha(source),r.source_sha256[file],file+': source not bound');
 const chapter=file.startsWith('mq_')||file.startsWith('Dockerfile')?'message-delivery':file==='terraform_state.py'?'terraform-state':'gitops-reconciliation';
 const html=d.articles.find(a=>a.id===chapter).sections.map(s=>s[1]).join('');
 assert([...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),file+': complete source differs');
}
const m=r.native.mq,t=r.native.terraform,g=r.native.gitops;
for(const[file,hash]of Object.entries(m.source_sha256))assert.equal(hash,r.source_sha256[file]);
assert.equal(t.source_sha256,r.source_sha256['terraform_state.py']);assert.equal(g.source_sha256,r.source_sha256['gitops_reconcile.py']);assert.equal(g.revision_file_sha256,r.source_sha256['gitops-revisions.json']);
assert.equal(m.execution.broker_version,'4.4.0');assert.equal(m.execution.pika_version,'1.3.2');const mc=m.execution.cases;
assert(mc.mandatory.unroutable_detected);assert(mc.confirm_without_route.publish_returned_normally);assert.equal(mc.confirm_without_route.queue_exists,false);
const crash=mc.effect_before_ack_crash;assert.equal(crash.kill_exit,-9);assert(crash.redelivery.redelivered);assert.equal(crash.redelivery.message_id,crash.first_delivery.message_id);assert.notEqual(crash.republished_message_id,crash.first_delivery.message_id);
for(const x of [crash.at_crash,crash.recovered,crash.after_republish]){assert.equal(x.effects,x.operations.length);assert.equal(x.total,x.operations.reduce((sum,p)=>sum+p[1],0));assert.deepEqual(x.operations,[['report-27',37]]);}
assert(crash.recovered.duplicate&&crash.after_republish.duplicate);
const lost=mc.ack_before_effect_negative;assert.equal(lost.ready_messages,0);assert.equal(lost.business.effects,0);assert.equal(lost.business.total,0);assert.equal(lost.business_oracle_passed,false);
const serverlessAckAnchor='serverless-ack-evidence';
const functionPage=fs.readFileSync('dist/article/serverless-execution/index.html','utf8');
const functionSection=functionPage.split('id="section-6"')[1]?.split('</section>')[0];
const ackBridge=functionSection?.split('id="'+serverlessAckAnchor+'"')[1];
assert(ackBridge,'Show the actual ACK and commit comparison in the function transaction section');
assert(ackBridge.includes('/article/message-delivery/#message-native-run')&&ackBridge.includes('/labs/delivery-systems/validation.json'));
const nativeQueuePage=fs.readFileSync('dist/article/message-delivery/index.html','utf8');
assert(nativeQueuePage.split('id="message-native-run"')[1]?.split('</section>')[0].includes('/article/serverless-execution/#'+serverlessAckAnchor));
const ackRows=ackBridge.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1].split('</tr>').filter(Boolean);
assert.equal(ackRows?.length,3);
for(const [row,token,effects] of [
 [ackRows[0],crash.redelivery.message_id,crash.recovered],
 [ackRows[1],crash.republished_message_id,crash.after_republish]
]){
 assert(row.includes('<code>'+token+'</code>'));
 assert(row.includes(effects.effects+' 笔，总数 '+effects.total),'Broker delivery and committed effects must describe the same recorded case');
}
assert(ackRows[2].includes('<code>ready='+lost.ready_messages+'</code>')&&ackRows[2].includes('<code>effects='+lost.business.effects+'</code>'));
assert(ackBridge.includes('<code>'+crash.recovered.operations[0][0]+'</code>'),'Keep the stable business identity explicit');
assert.deepEqual(mc.prefetch_push,{prefetch:1,delivered_before_ack:1,ready_before_ack:1,delivered_after_ack:2,ready_after_all_ack:0});
assert.equal(mc.prefetch_get_exception.unacked_get_deliveries,2);assert.equal(mc.prefetch_get_exception.prefetch,1);assert.equal(mc.prefetch_get_exception.ready_before_ack,0);
assert.equal(mc.wrong_channel_ack.reply_code,406);assert(mc.wrong_channel_ack.wrong_channel_closed&&mc.wrong_channel_ack.right_channel_open);
assert.equal(m.execution.durable_before_restart.ready_messages,1);assert.deepEqual(m.after_broker_restart.persistent_body,{amount:7,op:'survive-restart'});assert.equal(m.after_broker_restart.ready_after_ack,0);
assert.equal(t.version.terraform_version,'1.13.0');assert.equal(t.version.provider_selections['registry.terraform.io/hashicorp/local'],'2.5.3');assert.equal(t.lock.second_exit,1);assert(t.lock.first_still_running);assert.equal(t.lock.lock_operation,'OperationTypeApply');
const content=state=>state.resources.find(x=>x.address==='local_file.managed')?.content;
assert.equal(content(t.initial),'alpha');assert.equal(content(t.external_edit.cached_state),'alpha');assert.equal(t.external_edit.actual_file,'outside');assert.equal(t.external_edit.cached_plan_exit,0);
assert.equal(t.refresh_only.plan_exit,2);assert.deepEqual(t.refresh_only.drifts,[{address:'local_file.managed',actions:['delete']}]);assert.equal(content(t.refresh_only.state),undefined);assert.equal(t.refresh_only.actual_file_after_apply,'outside');
assert(t.repair.actions.some(x=>x.address==='local_file.managed'&&x.actions.join()==='create'));assert.equal(t.repair.actual_file,'alpha');assert.equal(content(t.repair.state),'alpha');assert(t.initial.serial<t.refresh_only.state.serial&&t.refresh_only.state.serial<t.repair.state.serial);
assert.notEqual(t.workspaces.blue.lineage,t.workspaces.green.lineage);assert.equal(content(t.workspaces.blue),'alpha');assert.equal(content(t.workspaces.green),'beta');assert.equal(t.workspaces.actual_file,'beta');assert.equal(t.workspaces.same_target,'ROOT/managed.txt');assert.equal(t.workspaces.blue_cached_plan_exit,0);assert.equal(t.workspaces.blue_fresh_plan_exit,2);
assert.equal(g.argo_version,'v3.6.1');assert.equal(g.kubernetes,'v1.35.8');const gr=g.records;
assert.equal(gr.self_heal_off.live_replicas,2);assert.equal(gr.self_heal_off.status.sync,'OutOfSync');assert.equal(gr.self_heal_on.live_replicas,1);assert.equal(gr.self_heal_on.status.sync,'Synced');
assert(gr.prune_off.retired_exists&&gr.prune_off.unmanaged_exists);assert.equal(gr.prune_off.status.sync,'OutOfSync');const bad=gr.v2_synced_but_old_business;
assert.equal(bad.retired_exists,false);assert(bad.unmanaged_exists);assert.equal(bad.status.sync,'Synced');assert.equal(bad.status.health,'Healthy');assert.equal(bad.desired_config,'v2');assert.equal(bad.http.version,'v1');assert.equal(bad.business_oracle_passed,false);assert.equal(bad.pod.uid,gr.self_heal_on.pod.uid);
assert.equal(gr.v3_new_pod.http.version,'v2');assert(gr.v3_new_pod.business_oracle_passed);assert.notEqual(gr.v3_new_pod.pod.uid,bad.pod.uid);assert.equal(gr.return_to_v1.http.version,'v1');assert(gr.return_to_v1.managed_config_recreated);
const history=r.git_history;for(const[label,version]of [['v1','v1'],['config_only_v2','v2'],['rollout_v2','v2']])assert.equal(history[label]['configmap.json'].object.data.version,version);
assert.deepEqual(history.v1['deployment.json'].object,history.config_only_v2['deployment.json'].object);assert(history.v1['retired.json']);assert(!history.config_only_v2['retired.json']);
assert.equal(history.config_only_v2['deployment.json'].object.spec.template.metadata.annotations['guide/revision'],'v1');assert.equal(history.rollout_v2['deployment.json'].object.spec.template.metadata.annotations['guide/revision'],'v2');
for(const[file,entry]of Object.entries(history.rollout_v2))assert.equal(entry.sha256,r.source_sha256['gitops-app/'+file]);
for(const[key,row]of [['v1',gr.v1],['config_only_v2',bad],['rollout_v2',gr.v3_new_pod]])assert.equal(row.status.revision,g.sources[key]);
const gitopsAnchor='gitops-response-evidence';
const evidenceSection=html=>html.split('id="'+gitopsAnchor+'"')[1]?.split('</section>')[0];
const evidenceSource=html=>{
 const program=evidenceSection(html)?.match(/<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/)?.[1];
 assert(program,'Show the record verification as copyable Python');
 return decode(program);
};
const gitopsPage=fs.readFileSync('dist/article/gitops-reconciliation/index.html','utf8');
const deliveryPage=fs.readFileSync('dist/article/delivery/index.html','utf8');
assert(evidenceSection(gitopsPage)?.includes('/article/delivery/#section-6'));
assert(evidenceSection(gitopsPage).includes('/labs/delivery-systems/validation.json'));
assert(deliveryPage.split('id="section-6"')[1]?.split('</section>')[0].includes('/article/gitops-reconciliation/#'+gitopsAnchor));
const publishedEvidence=evidenceSource(gitopsPage);
assert.equal(publishedEvidence,evidenceSource(d.articles.find(a=>a.id==='gitops-reconciliation').sections[5][1]));
assert(!publishedEvidence.includes('business_oracle_passed'),'Recompute the verdict instead of reading it');
const replay=program=>cp.execFileSync('python3',['-B','-c',program,folder+'validation.json'],{encoding:'utf8'}).trim().split('\n').slice(1);
const rows=replay(publishedEvidence);
assert.deepEqual(rows,[
 [g.sources.v1,'v1','v1',gr.v1.pod.uid,'v1','通过'],
 [g.sources.config_only_v2,'v1','v2',bad.pod.uid,'v1','拒绝'],
 [g.sources.rollout_v2,'v2','v2',gr.v3_new_pod.pod.uid,'v2','通过'],
 [g.sources.v1,'v1','v1',gr.return_to_v1.pod.uid,'v1','通过']
].map(([sha,template,config,uid,version,verdict])=>[sha.slice(0,7),template,config,uid.slice(0,8),version,verdict].join(' ')));
const versionCheck='        and reply["version"] == expected';
assert(publishedEvidence.includes(versionCheck));
assert.equal(replay(publishedEvidence.replace(versionCheck,''))[1],rows[1].replace('拒绝','通过'),'Ignoring the HTTP version would falsely accept the config-only rollout');
const meta=id=>JSON.parse(decode(fs.readFileSync('dist/diagrams/'+id+'.svg','utf8').match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
assert.deepEqual(meta('v49-mq-commit-windows').effect_first,crash);assert.deepEqual(meta('v49-tf-workspace-collision').execution,t.workspaces);assert.deepEqual(meta('v49-gitops-four-facts').execution,bad);
cp.execFileSync('python3',['-B','-c',`import pathlib,zipfile,xml.etree.ElementTree as ET
with zipfile.ZipFile('dist/labs/delivery-systems.zip') as z:
 for p in pathlib.Path('dist/labs/delivery-systems').rglob('*'):
  if p.is_file(): assert z.read(str(p.relative_to('dist/labs/delivery-systems')))==p.read_bytes(),p
figs=list(pathlib.Path('dist/diagrams').glob('v49-*.svg'));assert len(figs)==12
for p in figs:
 r=ET.parse(p).getroot()
 for name in ['title','desc','metadata']: assert r.find('{http://www.w3.org/2000/svg}'+name) is not None,p
`],{encoding:'utf8'});
console.log('PASS: real AMQP confirms/ACK/restart, independent 37/0 business oracles, actual Terraform state/lock/workspace and Argo HTTP v1/v2 counterexample; immutable revisions, full source/ZIP and 12 original relationship diagrams. Native environments are CI records, not rerun by this offline check.');
