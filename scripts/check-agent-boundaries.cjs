const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const c={};vm.createContext(c);for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const d=JSON.parse(JSON.stringify(vm.runInContext('({agentBoundaryFiles,agentBoundaryValidation,articles})',c)));
const folder='dist/labs/agent-boundaries/',r=JSON.parse(fs.readFileSync(folder+'validation.json'));
assert.deepEqual(r,d.agentBoundaryValidation);assert.equal(r.status,'passed');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
for(const[file,source]of Object.entries(d.agentBoundaryFiles)){
 assert.equal(source,fs.readFileSync(folder+file,'utf8'));assert.equal(sha(source),r.source_sha256[file]);
 if(!file.endsWith('.py'))continue;
 const page=fs.readFileSync('dist/article/'+(file==='authorization_commit.py'?'agent-security':'agent-retrieval')+'/index.html','utf8');
 assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),file+': inline full source');
}
function auth(x){
 assert.equal(x.status,'passed');assert.equal(x.source_sha256,r.source_sha256['authorization_commit.py']);assert.equal(Object.keys(x.results).length,17);
 assert.deepEqual(x.states.revoked_at_commit.audit,[['prepare',1],['policy_change',2],['denied',2]]);
 assert.deepEqual(x.states.snapshot_negative.audit,[['prepare',1],['policy_change',2],['effect',1]]);
 assert.equal(x.states.revoked_at_commit.effects,0);assert.equal(x.states.revoked_at_commit.amount,0);
 assert.equal(x.states.snapshot_negative.effects,1);assert.equal(x.states.snapshot_negative.amount,37);assert.equal(x.states.snapshot_negative.policy_epoch,2);
 assert.equal(x.states.normal.effects,1);assert.equal(x.states.normal.version,8);assert.equal(x.states.normal.amount,37);
 assert.equal(x.results.same_operation.status,'duplicate');assert.equal(x.results.same_operation_changed.reason,'operation_conflict');
 assert.deepEqual(x.results.write_revoked_receipt_readable.receipt,{version:8,amount:37});assert.equal(x.results.receipt_read_revoked.reason,'read_denied');
 for(const name of ['changed_amount','cross_tenant','stale_version','expired','bad_integer','bad_float','empty_object','extra_field','duplicate_json'])assert.equal(x.states[name].effects,0,name+': rejection must prevent actual effect');
 assert.equal(x.states.stale_version.amount,99);assert.equal(x.results.bad_float.reason,'invalid_integer');assert.equal(x.results.duplicate_json.reason,'duplicate_json_field');
}
function context(x){
 assert.equal(x.status,'passed');assert.equal(x.source_sha256,r.source_sha256['context_budget.py']);assert.equal(x.tiktoken,'0.12.0');assert.equal(x.encoding,'cl100k_base');
 const normal=x.cases.normal,tight=x.cases.tight_budget;
 assert.deepEqual([...normal.selected_ids].sort(),['a-1','a-2']);assert.equal(normal.prompt_tokens,237);assert.equal(normal.body_only_tokens,36);assert.equal(normal.output_reserve,96);assert.equal(normal.context_limit,512);assert.equal(512-237-96,179);
 assert.equal(tight.context_limit,259);assert.equal(tight.prompt_tokens,163);assert.deepEqual(tight.selected_ids,['a-2']);assert.equal(tight.status,'insufficient_evidence');assert.equal(tight.requests_delivered,0);
 assert.equal(x.cases.revoked_after_fetch.status,'authorization_changed');assert.equal(x.cases.updated_after_fetch.status,'source_version_changed');
 for(const name of ['revoked_after_fetch','updated_after_fetch'])assert.equal(x.cases[name].requests_delivered,0);
 assert.deepEqual(x.cases.index_rebuild.before_ids,['a-1']);assert.deepEqual([...x.cases.index_rebuild.after_versions].sort(),[['a-1',1],['a-2',3]]);assert.equal(x.cases.index_rebuild.reference_total_after_update,10+30);
 assert.equal(x.independent_task_reference.normal_total,10+27);assert.equal(x.receiver.request_count,1);
 const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 // Independently reconstruct the exact sent string, rather than accepting a reported digest.
 const constants=JSON.parse(cp.execFileSync(process.env.INFRA_LAB_PYTHON||'python3',['-B','-c',`import ast,json
tree=ast.parse(open('${folder}context_budget.py').read())
out={}
for node in tree.body:
 if isinstance(node,ast.Assign) and isinstance(node.targets[0],ast.Name) and node.targets[0].id in ['SYSTEM','TASK']:
  out[node.targets[0].id]=ast.literal_eval(node.value)
print(json.dumps(out,ensure_ascii=False))`],{encoding:'utf8'}));
 const prompt=constants.SYSTEM+'\n'+constants.TASK+'\n证据JSON：\n'+JSON.stringify(canonical(normal.source_snapshots))+'\n请输出有依据的结论：';
 assert.equal(sha(prompt),normal.prompt_sha256);assert.equal(sha(prompt),x.receiver.prompt_sha256);assert(!prompt.includes('999')&&!prompt.includes('b-1'));
 assert.deepEqual(x.blocked_fetches,['b-1/1','a-2/1']);
 const u=x.unicode,bytes=Buffer.from(u.token_bytes_hex.join(''),'hex');assert.equal(bytes.toString('utf8'),u.text);
 assert.equal(Buffer.from(u.token_bytes_hex.slice(0,u.invalid_prefix_tokens).join(''),'hex').toString('utf8'),u.lossy_default);assert.equal(u.lossy_default,'中国�');assert.equal(u.safe_prefix,'中国');assert.equal(u.safe_prefix_tokens,1);
 assert.equal(x.special_text.special_token_emitted,false);assert(!x.special_text.ordinary_tokens.includes(100257));
}
auth(r.programs['authorization_commit.py']);context(r.programs['context_budget.py']);
const python=process.env.INFRA_LAB_PYTHON||'python3';auth(JSON.parse(cp.execFileSync(python,['-B',folder+'authorization_commit.py'],{encoding:'utf8',timeout:15000})));
if(process.env.INFRA_CONTEXT_PYTHON)context(JSON.parse(cp.execFileSync(process.env.INFRA_CONTEXT_PYTHON,['-B',folder+'context_budget.py'],{encoding:'utf8',timeout:90000})));
const metadata=name=>JSON.parse(decode(fs.readFileSync('dist/diagrams/'+name+'.svg','utf8').match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
assert.deepEqual(metadata('v47-revocation-commit').correct,r.programs['authorization_commit.py'].states.revoked_at_commit);
assert.deepEqual(metadata('v47-revocation-commit').negative,r.programs['authorization_commit.py'].states.snapshot_negative);
assert.equal(metadata('v47-receipt-permissions').final_effects,1);assert.equal(metadata('v47-context-path').receiver.request_count,1);
assert.deepEqual(metadata('v47-context-token-budget').normal,r.programs['context_budget.py'].cases.normal);assert.equal(metadata('v47-context-token-budget').output_generated,false);assert.deepEqual(metadata('v47-context-token-bytes').result,r.programs['context_budget.py'].unicode);
cp.execFileSync(python,['-B','-c',`import pathlib,zipfile
with zipfile.ZipFile('dist/labs/agent-boundaries.zip') as z:
 for p in pathlib.Path('dist/labs/agent-boundaries').iterdir():
  if p.is_file():assert z.read(p.name)==p.read_bytes(),p.name
`],{encoding:'utf8'});
const retrievalPage=fs.readFileSync('dist/article/agent-retrieval/index.html','utf8');
const securityPage=fs.readFileSync('dist/article/agent-security/index.html','utf8');
const accessSection=securityPage.split('id="section-2"')[1].split('id="section-3"')[0];
assert(accessSection.includes('/article/agent-retrieval/#retrieval-revocation-boundaries'));
const revocation=retrievalPage.split('id="retrieval-revocation-boundaries"')[1].split('id="section-10"')[0];
const beforeSend=r.programs['context_budget.py'].cases.revoked_after_fetch;
const selected=beforeSend.source_snapshots.map(row=>row.id+'/v'+row.version).sort();
assert(revocation.includes(selected.join('、')));
assert(revocation.includes('<code>'+beforeSend.status+'</code>'));
assert(revocation.includes('收到 '+beforeSend.requests_delivered+' 条新请求'));
assert(revocation.includes('/article/agent-security/#section-2'));
assert(revocation.includes('/article/agent-retrieval/#context-budget-run'));
assert(/<(?:div class="mechanism-core"|span class="legacy-subsection-anchor") id="retrieval-evidence-pipeline"/.test(retrievalPage),'restored legacy anchor uses a supported sticky-header target');
assert(/\.legacy-subsection-anchor\{[^}]*scroll-margin-top:calc\(var\(--reader-header\) \+ \d+px\)/.test(fs.readFileSync('dist/reading-comfort.css','utf8')),'retained zero-height targets keep their header offset');
for(const[id,anchor]of [['agent-security','authorization-commit-run'],['agent-retrieval','context-budget-run']]){
 const page=fs.readFileSync('dist/article/'+id+'/index.html','utf8');assert(page.includes('id="'+anchor+'"'));c.id=id;const review=vm.runInContext('optionalConceptReviews.has(id)',c);assert.equal(page.indexOf('id="concept-path"')<page.indexOf('class="article-section"'),!review,id+': reviewed standalone body and remaining prerequisite preview use their documented positions');
}
console.log('PASS: fresh HTTP/SQLite authorization effects and stale-policy counterexample; independent complete prompt digest, 237/36 BPE budget and 163-token evidence loss, version/ACL gates, UTF-8 boundaries, exact sources/ZIP and six figure records. Set INFRA_CONTEXT_PYTHON for a fresh pinned tokenizer replay; no LLM/Kairo claims.');
