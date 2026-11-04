const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),{execFileSync}=require('child_process');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=vm.runInContext('({articles,mechanismLabFiles,mechanismLabValidation})',c);
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const pairs=[['network-diagnosis','tcp_framing.py','tcp-message-boundary'],['checkpoint-recovery','checkpoint_commit.py','checkpoint-consistent-state'],['agent-security','approval_receipt.py','approval-records']];
for(const[id,name,anchor]of pairs){
 const source=fs.readFileSync('dist/labs/learning-mechanisms/'+name,'utf8'),record=d.mechanismLabValidation.programs[name];
 assert.equal(d.mechanismLabFiles[name],source);
 assert.equal(record.sha256,crypto.createHash('sha256').update(source).digest('hex'));
 const article=d.articles.find(a=>a.id===id),html=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert(article.sections[0][1].includes('id="'+anchor+'"'));
 assert(html.indexOf('id="'+anchor+'"')<html.indexOf('本次实际执行结果'));
 assert(html.includes('data-reader-contents')&&html.includes('data-reader-large')&&html.includes('data-reader-focus'));
 assert([...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(match=>decode(match[1])===source.trim()),'static source mismatch: '+name);
 const actual=JSON.parse(execFileSync('python3',['dist/labs/learning-mechanisms/'+name],{encoding:'utf8',timeout:25000}));
 if(name==='tcp_framing.py'){
  assert.equal(actual.wire_bytes,32);assert.equal(actual.parser_probes.segmentation_patterns_passed,3);
  assert.equal(actual.server.recv_chunk_bytes.reduce((a,b)=>a+b,0),32);
  assert(actual.server.recv_chunk_bytes.every(x=>x>0&&x<=7));
  assert.deepEqual(actual.reply_after_half_close,['已接收2条']);
 }else if(name==='checkpoint_commit.py'){
  assert(actual.complete_state_exact_match&&!actual.weights_only_match);
  assert.equal(actual.mixed_generation,'mixed_generation');assert.equal(actual.corruption,'file_integrity');
  assert.equal(actual.next_sample_cursor,6);assert.equal(actual.pointer_after_failed_publish,'step-3');
 }else{
  assert(actual.signed_claim_valid_before_effect&&actual.tampered_claim_rejected);
  assert.equal(actual.unavailable_receipt,'unknown');assert.equal(actual.commit_then_exit_code,23);
  assert.equal(actual.effects,1);assert.equal(actual.same_intent_retry,'duplicate');
  assert.equal(actual.same_key_changed_intent,'conflict');assert.equal(actual.changed_parameter,'approval_mismatch');
  assert.equal(actual.cross_tenant_receipt,'denied');assert.equal(actual.revoked_receipt,'denied');
 }
}
execFileSync('python3',['-c',`import pathlib,zipfile
root=pathlib.Path('dist/labs/learning-mechanisms')
with zipfile.ZipFile('dist/labs/learning-mechanisms.zip') as z:
 assert z.testzip() is None
 for p in root.iterdir():
  if p.is_file(): assert z.read('learning-mechanisms/'+p.name)==p.read_bytes(),p.name
`],{encoding:'utf8'});
const resources=fs.readFileSync('dist/resources/index.html','utf8');
assert(!resources.includes('github-projects')&&!resources.includes('research-project'));
assert(!fs.existsSync('dist/github-research-data.js'));
for(const route of ['module/network','module/training','module/agent'])assert(fs.readFileSync('dist/'+route+'/index.html','utf8').includes('reading-toolbar'));
console.log('PASS: 3 independent executable mechanism labs, fault probes, source hashes, ZIP bytes, static inline code, direct lessons and shared reading controls.');
