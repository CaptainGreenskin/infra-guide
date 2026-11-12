const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const pack='native-ngram-speculation';
const folder=path.join(root,'dist','labs',pack);
const sources=['README.md','make_fixture.py','ngram_lab.py'];
const rawFiles=['native-responses.json','native-stderr.log'];
const read=(directory,name)=>fs.readFileSync(path.join(directory,name));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const modes=['none','ngram-simple'];
const outputs=[7,8,9,10,11,12];
const prompts={
 all_match:[1,4,5,6,7,8,9,10,11,4,5,6],
 late_mismatch:[1,4,5,6,7,8,9,10,4,5,6],
 early_mismatch:[1,4,5,6,7,8,3,10,4,5,6],
 no_match:[1,11,5,6],
};

function propose(prompt){
 const history=[...prompt,outputs[0]],end=history.length;
 for(let at=end-6;at>=0;at--){
  if(history[at]===history[end-2]&&history[at+1]===history[end-1])
   return history.slice(at+2,at+6);
 }
 return [];
}

function parseBatches(log){
 const sections=log.split(/^\[(none|ngram-simple)\]\s*$/m);
 assert.deepEqual([sections[0],sections[1],sections[3]],['',...modes]);
 return Object.fromEntries(modes.map((mode,index)=>{
  const tasks=sections[2+index*2].split(/^.*?id\s+0 \| task (\d+) \| new prompt,.*$/m);
  assert.equal(tasks.length,1+2*Object.keys(prompts).length);
  return [mode,Object.fromEntries(Object.keys(prompts).map((name,i)=>{
   const text=tasks[2+2*i];
   const batches=text.split('added ubatch to split:').slice(1).map(segment=>
    [...segment.matchAll(/ubatch_print:\s+\d+: id =\s+(\d+) .*pos =\s+(\d+), .*seq_id = \[0\], output = ([01])/g)]
     .map(([,token,position,output])=>[Number(position),Number(token),Number(output)]));
   const selected=[...text.matchAll(/next token:\s+(\d+)/g)].map(match=>Number(match[1]));
   const end=text.match(/stop processing: n_tokens = (\d+), truncated = 0/);
   const cut=text.match(/accepted (\d+)\/(\d+) draft tokens, new n_tokens = (\d+)/);
   const vote=text.match(/add accepted tokens: sampled=(\d+), ids.size=(\d+), n_draft=(\d+)/);
   return [name,{batches,selected,retained:Number(end?.[1]),cut:cut?.slice(1).map(Number),
    vote:vote?.slice(1).map(Number),draftEvents:[...text.matchAll(/generate_draft:/g)].length}];
  }))];
 }));
}

function verify(report,responses,log){
 assert.equal(report.schema,'native-ngram-speculation-v1');
 assert.equal(report.status,'passed');
 assert.deepEqual(report.engine,{version:'b12110',commit:'cd959bae99ff4bed22bef2604f45241c09bbb8c8',
  sha256:'e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959'});
 assert.equal(report.fixture_sha256,'d0a1a3cdf9e6517b20e60099e9f7b46d4c45dd7432512c0b15b95bf06410ed66');
 assert.deepEqual(report.environment,{system:'Darwin',architecture:'arm64',device:'CPU'});
 assert.deepEqual(report.lookup,{suffix:2,draft:4,min_hits:1});
 const runs=parseBatches(log);
 assert.deepEqual(Object.keys(report.modes),modes);
 assert.deepEqual(Object.keys(responses),modes);
 for(const mode of modes){
  assert.deepEqual(Object.keys(report.modes[mode]),Object.keys(prompts));
  assert.deepEqual(Object.keys(responses[mode]),Object.keys(prompts));
  for(const [name,prompt] of Object.entries(prompts)){
   const native=runs[mode][name];
   const raw=responses[mode][name],final=raw.events.at(-1);
   assert.equal(raw.status,200);
   assert.deepEqual(raw.request,{prompt,cache_prompt:false,stream:true,return_tokens:true,
    temperature:0,n_predict:6,id_slot:0,seed:7});
   assert.equal(raw.events.length,7);
   raw.events.slice(0,-1).forEach((event,i)=>{assert.equal(event.stop,false);assert.deepEqual(event.tokens,[outputs[i]]);});
   assert.equal(final.stop,true);
   assert.deepEqual(native.selected,outputs);
   const draft=mode==='none'?[]:propose(prompt);
   const reject=draft.findIndex((value,i)=>value!==outputs[i+1]);
   const accepted=reject<0?draft.length:reject;
   const retained=prompt.length+outputs.length-1;
   assert.deepEqual(report.modes[mode][name],{selected:outputs,drafted:draft.length,accepted,retained});
   assert.equal(final.timings.draft_n??0,draft.length);
   assert.equal(final.timings.draft_n_accepted??0,accepted);
   assert.equal(final.tokens_cached,retained);
   assert.equal(native.retained,retained);
   assert.equal(native.draftEvents,Number(draft.length>0));
   const expected=[prompt.map((id,pos)=>[pos,id,Number(pos===prompt.length-1)])];
   let extra=0;
   if(draft.length){
    expected.push([outputs[0],...draft].map((id,i)=>[prompt.length+i,id,1]));
    assert.deepEqual(native.vote,[outputs[1+accepted],1+accepted,draft.length]);
    if(reject>=0)assert.deepEqual(native.cut,[accepted,draft.length,prompt.length+1+accepted]);
    extra=accepted+1;
   }
   for(let i=extra;i<outputs.length-1;i++)expected.push([[prompt.length+i,outputs[i],1]]);
   assert.deepEqual(native.batches,expected);
  }
 }
 return runs;
}

function checked(directory){
 const report=JSON.parse(read(directory,'validation.json'));
 assert.deepEqual(report.source_sha256,Object.fromEntries(sources.map(name=>[name,digest(read(folder,name))])));
 assert.deepEqual(report.artifact_sha256,Object.fromEntries(rawFiles.map(name=>[name,digest(read(directory,name))])));
 return {report,responses:JSON.parse(read(directory,rawFiles[0])),log:read(directory,rawFiles[1]).toString()};
}
const {report,responses,log}=checked(folder);
const runs=verify(report,responses,log);
const changed=structuredClone(responses);
changed['ngram-simple'].early_mismatch.events[2].tokens=[3];
assert.throws(()=>verify(report,changed,log),assert.AssertionError);
assert.throws(()=>verify(report,responses,log.replace('accepted 1/4 draft tokens, new n_tokens = 13','accepted 1/4 draft tokens, new n_tokens = 16')),assert.AssertionError);
assert.deepEqual(read(folder,'make_fixture.py'),read(path.join(folder,'..','native-metal-inference'),'make_fixture.py'));
if(process.env.NATIVE_NGRAM_SERVER){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ngram-evidence-'));
 try{
  const output=path.join(temp,'replay');
  execFileSync('python3',['-B',path.join(folder,'ngram_lab.py'),'--server',process.env.NATIVE_NGRAM_SERVER,'--output-dir',output],{timeout:90000});
  const fresh=checked(output);
  verify(fresh.report,fresh.responses,fresh.log);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
const dist=path.join(root,'dist');
const svg=fs.readFileSync(path.join(dist,'diagrams','native-ngram-rollback.svg'),'utf8');
const mismatch=runs['ngram-simple'].early_mismatch;
assert.deepEqual(JSON.parse(svg.match(/<metadata>([^<]+)<\/metadata>/)[1]),{
 record:'labs/native-ngram-speculation/validation.json',case:'early_mismatch',
 positions:mismatch.batches[1].map(row=>row[0]),verification:mismatch.batches[1].map(row=>row[1]),
 draft_accepted:mismatch.cut[0],retained_after_reject:mismatch.cut[2],next_input:mismatch.batches[2][0].slice(0,2),
});
const page=fs.readFileSync(path.join(dist,'article','speculative-decoding','index.html'),'utf8');
const practice=page.split('id="native-ngram-speculation"')[1].split('id="section-9"')[0];
assert(practice.includes('diagrams/native-ngram-rollback.svg'));
for(const [name,native] of Object.entries(runs['ngram-simple'])){
 const row=report.modes['ngram-simple'][name];
 assert(practice.includes('<td>'+row.accepted+' / '+row.drafted+'</td><td>'+native.batches.length+'</td>'));
}
const context={};vm.createContext(context);
const shell=fs.readFileSync(path.join(root,'src','page-shell.html'),'utf8');
for(const [,file] of shell.matchAll(/<script defer src="([^"]+)"/g)){
 if(file!=='app.js')vm.runInContext(fs.readFileSync(path.join(dist,file),'utf8'),context,{filename:file});
}
const body=vm.runInContext('articles.find(a=>a.id==="speculative-decoding").sections[7][1]',context);
const [before,accounting,...duplicates]=body.split('<h3 id="native-ngram-work-accounting">');
assert(accounting&&!duplicates.length&&before.includes('id="native-ngram-speculation"'));
const cases=['all_match','late_mismatch','early_mismatch'];
const counts=(mode,name)=>{
 const batches=runs[mode][name].batches;
 return [batches[0].length,batches.length,batches.slice(1).reduce((rows,batch)=>rows+batch.length,0)];
};
for(const name of cases){
 const [prompt,baseBatches,baseRows]=counts('none',name);
 const [draftPrompt,draftBatches,draftRows]=counts('ngram-simple',name);
 assert.equal(prompt,draftPrompt);
 assert(accounting.includes(`<td>${baseBatches} → ${draftBatches}</td><td>${baseRows} → ${draftRows}</td>`),name);
}
for(const mode of modes){
 const response=responses[mode].early_mismatch.events.at(-1);
 assert(accounting.includes(`<code>timings.prompt_n=${response.timings.prompt_n}</code>`));
 assert(accounting.includes(`<code>tokens_cached=${response.tokens_cached}</code>`));
}
const snippets=[...accounting.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)];
assert.equal(snippets.length,1,'the original raw log has one runnable reading command');
const command=snippets[0][1].replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const output=execFileSync('sh',['-s'],{cwd:folder,input:command,encoding:'utf8',timeout:15000});
assert.deepEqual(output.trim().split('\n'),modes.flatMap(mode=>cases.map(name=>[mode,name,...counts(mode,name)].join(' '))));
const archive=folder+'.zip';
const entries=execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries,[...sources,...rawFiles,'validation.json'].map(file=>pack+'/'+file).sort());
for(const member of entries)assert.deepEqual(execFileSync('unzip',['-p',archive,member]),read(folder,path.basename(member)));
console.log('PASS: eight native HTTP runs, independent proposals, verified batch positions and rollback, executable batch/row readback, diagrams and exact archive.');
