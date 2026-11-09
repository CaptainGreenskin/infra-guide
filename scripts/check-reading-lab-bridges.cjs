const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');

const lab=name=>'dist/labs/'+name+'/';
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const page=(chapter,fragments)=>{
 const html=readFileSync('dist/article/'+chapter+'/index.html','utf8');
 for(const fragment of fragments)assert(html.includes(fragment),chapter+' missing '+fragment);
};
const verifyHashes=(folder,hashes)=>{
 for(const [file,digest] of Object.entries(hashes))assert.equal(sha(readFileSync(folder+file)),digest,file);
};

const agent=lab('mcp-recovery'),agentRecord=json(agent+'validation.json'),source=json(agent+'source.json');
assert.equal(agentRecord.status,'passed');
verifyHashes(agent,agentRecord.source_sha256);
const amount=Object.values(source.batches).flat().reduce((sum,n)=>sum+n,0);
const body={amount,source_version:source.source_version,task_id:source.task_id};
const intent={...body,operation_id:source.task_id+':publish'};
const bodyDigest=sha(JSON.stringify(body));
for(const [name,caseRecord] of Object.entries(agentRecord.cases)){
 const stable=name==='stable',count=stable?1:2;
 const {cut,resume,oracle}=caseRecord;
 const operationIds=stable?[intent.operation_id,intent.operation_id]:
  [intent.operation_id+':attempt-1',intent.operation_id+':attempt-2'];
 assert.equal(cut.exit_signal,'SIGKILL');
 assert.notEqual(cut.worker_pid,resume.worker_pid);
 assert.deepEqual(cut.checkpoint.next,['publish']);
 assert.deepEqual(cut.checkpoint.values,{intent});
 assert.deepEqual(cut.arguments,{...intent,operation_id:operationIds[0]});
 assert.deepEqual(resume.checkpoint.next,[]);
 assert.deepEqual(resume.checkpoint.values.intent,intent);
 assert.notEqual(cut.checkpoint.checkpoint_id,resume.checkpoint.checkpoint_id);
 assert.equal(cut.receiver.reports.length,1);
 assert.equal(cut.receiver.attempts.length,1);
 assert.deepEqual(cut.receiver.receipts,[cut.observed_mcp.receipt]);
 assert.equal(cut.observed_mcp.is_error,false);
 assert.deepEqual(resume.receiver.attempts.slice(0,1),cut.receiver.attempts);
 assert.deepEqual(resume.receiver.reports.slice(0,1),cut.receiver.reports);
 const {reports,receipts,attempts}=resume.receiver;
 assert.equal(reports.length,count);
 assert.equal(receipts.length,count);
 assert.equal(attempts.length,2);
 assert.notEqual(attempts[0].server_pid,attempts[1].server_pid);
 assert.deepEqual(attempts.map(row=>row.rpc_request_id),['3','3']);
 assert.deepEqual(attempts.map(row=>row.outcome),['committed',stable?'replayed':'committed']);
 assert.deepEqual(attempts.map(row=>row.operation_id),operationIds);
 for(const [i,row] of reports.entries()){
  assert.deepEqual(row,{...body,revision:i+1,operation_id:attempts[i].operation_id});
  assert.deepEqual(receipts[i],{...row,body_digest:bodyDigest});
 }
 assert.deepEqual(resume.checkpoint.values.receipt,receipts.at(-1));
 assert.equal(oracle.accepted,stable);
 assert.equal(oracle.effect_count,count);
 assert.equal(oracle.expected_amount,amount);
}
assert.deepEqual(Object.keys(agentRecord.cases).sort(),['attempt_derived_id','stable']);
page('durable-workflows',['id="mcp-commit-recovery"','diagrams/mcp-commit-recovery.svg','labs/mcp-recovery.zip']);
page('agent-recovery',['article/durable-workflows/#mcp-commit-recovery']);

const ai=lab('encoder-decoder'),aiRecord=json(ai+'validation.json'),aiSource=json(ai+'source.json');
assert.equal(aiRecord.status,'passed');
verifyHashes(ai,aiRecord.source_sha256);
const {training,checks,vocab,held_out:translations}=aiRecord;
const trainSources=[...Object.keys(aiSource.lexicon).map(word=>[word]),...aiSource.train_pairs];
const pad=(ids,length)=>[...ids,...Array(length-ids.length).fill(0)];
const sourceIds=words=>words.map(word=>vocab.source.indexOf(word));
const targetIds=words=>words.map(word=>vocab.target.indexOf(word));
const targetWords=words=>words.map(word=>aiSource.lexicon[word]);
const example=[['红'],['红','方']],labels=example.map(words=>pad([...targetIds(targetWords(words)),2],3));
assert.deepEqual(checks.batch.source,example.map(words=>pad(sourceIds(words),2)));
assert.deepEqual(checks.batch.decoder_input,example.map(words=>pad([1,...targetIds(targetWords(words))],3)));
assert.deepEqual(checks.batch.labels,labels);
assert.deepEqual(checks.batch.source_padding,checks.batch.source.map(row=>row.map(id=>id===0)));
assert.deepEqual(checks.batch.target_padding,checks.batch.decoder_input.map(row=>row.map(id=>id===0)));
assert.equal(checks.batch.valid_labels,labels.flat().filter(id=>id!==0).length);
assert.equal(training.valid_labels,trainSources.reduce((count,words)=>count+words.length+1,0));
assert.equal(training.examples,trainSources.length);
assert.equal(training.updates,400);
assert(training.final_loss>0&&training.final_loss<training.initial_loss/100);
const cross=checks.cross_attention;
assert.deepEqual(cross.q_k_v_shapes,[[2,4,3,8],[2,4,2,8],[2,4,2,8]]);
assert.deepEqual(cross.weight_shape,[2,4,3,2]);
assert.deepEqual(cross.short_source_head0,[[1,0],[1,0],[1,0]]);
for(const key of ['manual_weight_max_abs_error','manual_output_max_abs_error'])assert(cross[key]>=0&&cross[key]<1e-10);
for(const key of ['encoder_source_padding','cross_source_padding','decoder_causal','decoder_target_key_padding']){
 assert(checks[key].masked_max_abs_delta>=0&&checks[key].masked_max_abs_delta<1e-10,key);
 assert(checks[key].without_mask_max_abs_delta>1e-4,key+' negative control');
}
assert.equal(checks.loss_ignore_pad.padded_logits_invariant,true);
assert(checks.loss_ignore_pad.without_ignore_max_abs_delta>1e-4);
assert.equal(translations.length,aiSource.held_out.length);
for(const [i,translation] of translations.entries()){
 const {source,expected}=aiSource.held_out[i];
 assert(!trainSources.some(words=>JSON.stringify(words)===JSON.stringify(source)));
 assert.deepEqual(expected,targetWords(source));
 assert.deepEqual(translation.source,source);
 assert.deepEqual(translation.source_ids,sourceIds(source));
 assert.deepEqual(translation.decoded,expected);
 const generated=[...targetIds(expected),2];
 assert.deepEqual(translation.events,generated.map((selected,t)=>({decoder_input:[1,...generated.slice(0,t)],selected})));
}
assert.deepEqual(aiRecord.same_target_prefix,{prefix:[1,3],source_ids:[[1,5],[1,6]],next_ids:[7,8],next_tokens:['circle','square']});
page('transformer-model',['id="encoder-decoder-translation"','article/transformer-model/#encoder-decoder-translation','diagrams/encoder-decoder-translation.svg','labs/encoder-decoder.zip']);
const tourAnchor='translation-reading-path';
const tourTrace=translations.find(row=>row.source.join(' ')==='红 圆');
assert(tourTrace,'the first reading example must have a held-out replay');
const displayWord=id=>vocab.target[id].replace(/[<>]/g,'').replace(/^(bos|eos)$/,token=>token.toUpperCase());
for(const route of ['article/transformer-model','track/ai']){
 const html=readFileSync('dist/'+route+'/index.html','utf8');
 const tour=html.match(new RegExp('<h3 id="'+tourAnchor+'">[\\s\\S]*?(?=<h3\\b)'))?.[0];
 assert(tour,route+': static first reading example');
 assert(html.includes('href="/article/transformer-model/#'+tourAnchor+'"'),route+': direct access to first reading with a document base');
 assert(tour.includes('/article/transformer-model/#encoder-decoder-translation'),route+': full experiment link');
 for(const [index,event] of tourTrace.events.entries()){
  const prefix=event.decoder_input.map(displayWord).join(', ');
  const word=displayWord(event.selected);
  const result=word==='EOS'?'EOS，结束':word;
  assert(tour.includes('<tr><td>'+(index+1)+'</td><td>['+prefix+']</td><td>'+result+'</td></tr>'),route+': rendered generation diverged from replay at step '+(index+1));
 }
}

const cloud=lab('kubernetes-network-policy'),cloudRecord=json(cloud+'validation.json');
const provenance=json(cloud+'ci-record.json');
assert.equal(cloudRecord.status,'passed');
assert.equal(provenance.conclusion,'success');
assert.match(provenance.headSha,/^[a-f0-9]{40}$/);
assert.match(provenance.url,/^https:\/\/github\.com\/CaptainGreenskin\/infra-guide\/actions\/runs\/\d+$/);
assert.equal(provenance.record_sha256,sha(readFileSync(cloud+'validation.json')));
assert.equal(cloudRecord.source_sha256,sha(readFileSync(cloud+'network_policy_lab.py')));
execFileSync('python3',['-B',cloud+'network_policy_lab.py','--check-record',cloud+'validation.json']);
page('k8s-networking',['id="kubernetes-network-policy-run"','article/k8s-networking/#kubernetes-network-policy-run','diagrams/kubernetes-network-policy.svg','labs/kubernetes-network-policy.zip']);

console.log('PASS: native translation, masking and greedy traces; SDK commit/re-entry receipts and report counts; native Cilium record and CI binding.');
