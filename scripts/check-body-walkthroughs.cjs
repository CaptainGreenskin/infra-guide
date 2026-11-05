const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=JSON.parse(JSON.stringify(vm.runInContext('({articles,modules,bodyWalkthroughEdits,mechanismWalkthroughFiles,mechanismWalkthroughValidation})',c)));
const record=d.mechanismWalkthroughValidation,lab='dist/labs/mechanism-walkthroughs/';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const close=(actual,expected,tol=1e-12)=>assert(Math.abs(actual-expected)<=tol,actual+' != '+expected);
for(const[name,source]of Object.entries(d.mechanismWalkthroughFiles)){
 assert.equal(source,fs.readFileSync(lab+name,'utf8'),name+': embedded source');
 assert.equal(hash(source),record.source_sha256[name],name+': execution revision');
}
assert.equal(fs.readFileSync(lab+'tiny_decoder.py','utf8'),fs.readFileSync('dist/labs/model-foundations/tiny_decoder.py','utf8'));
const run=(python,name)=>JSON.parse(cp.execFileSync(python,['-B',lab+name],{encoding:'utf8',timeout:30000}));
for(const name of ['route_walk.py','reconcile_walk.py','workflow_history.py'])assert.deepEqual(run(process.env.INFRA_LAB_PYTHON||'python3',name),record.results[name],name+': recorded result differs from actual replay');
const route=record.results['route_walk.py'];
assert.equal(route.cidr.addresses,2**8);assert.equal(route.peer.target,'peer');assert.equal(route.host_route.target,'inspection');
assert.deepEqual(route.peer.matched,['10.30.8.0/24','0.0.0.0/0']);assert.equal(route.missing_return,null);assert.equal(route.fixed_return.target,'peer-back');
assert.equal(route.request_tuple[1],route.response_tuple[3]);assert.equal(route.request_tuple[3],route.response_tuple[1]);assert(route.equal_prefix_rejected);
const state=record.results['reconcile_walk.py'];
assert.deepEqual([state.accepted.generation,state.accepted.status.observedGeneration,state.accepted.status.readyReplicas],[2,0,0]);
assert.deepEqual([state.converged.status.observedGeneration,state.converged.status.readyReplicas,state.ready.status.readyReplicas],[2,0,3]);
assert.notEqual(state.replacement.old_uid,state.replacement.new_uid);assert.equal(state.replacement.stale_delete,'uid-mismatch');assert.equal(state.stale_update,'conflict');
assert(state.noop_keeps_version,'unchanged reconciliation must not manufacture a status update');
const a=record.results['attention_trace.py'];
assert.deepEqual(a.weights,[[1,0,0],[1/4,3/4,0],[1/4,1/4,1/2]]);
assert.deepEqual(a.output,[[2,0],[1/2,3],[7/2,2]]);assert.deepEqual(a.cached_last_row,[7/2,2]);assert.deepEqual(a.wrong_offset_row,[2,0]);
close(a.padding_last_row[0],14/3);close(a.padding_last_row[1],4/3);close(a.future_changed_output[2][0],7/2+(60-6)/2);
close(a.zero_mask_row_1[0],8/5);close(a.zero_mask_row_1[1],14/5);close(a.asymmetric_transpose_error,3-12/(3+Math.exp(.7)));
assert.deepEqual(a.head_0_correct,[[0,1],[10,11]]);assert.deepEqual(a.head_0_wrong,[[0,1],[2,3]]);assert(a.empty_row_rejected);assert(a.sdpa_max_error<1e-12&&a.chunk_max_error<1e-12);
const b=record.results['decoder_trace.py'];
assert.equal(b.parameters,8*8+4*8+4*8*8+3*8*12+3*8);assert.equal(b.residual_scalar_gradient,1.5);
for(const[fault,stage]of Object.entries({stale_input:'n2',swap_gate:'gate_product',skip_residual:'h2',normalize_time:'n1'}))assert.equal(b.faults[fault].first_difference,stage);
assert(b.forward_max_error<1e-12&&b.future_prefix_error<1e-12&&b.time_normalized_future_prefix_error>.4);
for(let i=0;i<8;i++){close(b.first_position.h1[i],b.first_position.x[i]+b.first_position.attn[i]);close(b.first_position.h2[i],b.first_position.h1[i]+b.first_position.ffn[i]);}
const meanSquare=b.first_position.x.reduce((sum,x)=>sum+x*x,0)/8;
for(let i=0;i<8;i++)close(b.first_position.n1[i],b.first_position.x[i]/Math.sqrt(meanSquare+1e-6));
close(b.layer_norm[0][0],-1/Math.sqrt(1+1e-6));close(b.rms_norm[0][1],3/Math.sqrt(5+1e-6));
close(b.swiglu_hand_output[0],3*Math.log(3));close(b.swiglu_hand_output[1],1.5*Math.log(3));assert(b.zero_branches_keep_input);
if(process.env.INFRA_WALK_TORCH_PYTHON)for(const name of ['attention_trace.py','decoder_trace.py']){
 const replay=run(process.env.INFRA_WALK_TORCH_PYTHON,name);assert.equal(replay.device,'cpu');
 if(name==='attention_trace.py'){assert.deepEqual(replay.output,a.output);assert(replay.sdpa_max_error<1e-12);}
 else {assert(replay.forward_max_error<1e-12&&replay.future_prefix_error<1e-12);assert.equal(replay.parameters,b.parameters);}
}
const h=record.results['workflow_history.py'];
assert.equal(h.recorded_result_exit_code,23);assert.equal(h.unrecorded_result_exit_code,24);
assert.deepEqual(h.after_crash.events.map(e=>e.kind),['started','scheduled','completed']);
assert.deepEqual(h.after_resume.calls,['read_metrics','render_draft']);assert.deepEqual(h.after_gap_resume.calls,['read_metrics','read_metrics','render_draft']);
assert.equal(h.after_resume.events.at(-1).payload.draft,'A日报：总数23');assert.equal(h.after_gap_resume.events.at(-1).payload.draft,'A日报：总数999');
assert.equal(h.replay_added_events,0);assert.equal(h.replay_added_calls,0);assert.equal(h.incompatible_code_exit,4);assert.equal(h.extra_command_exit,4);
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const ids=d.bodyWalkthroughEdits.map(e=>e.id);assert.equal(ids.length,6);assert.equal(new Set(ids).size,6);
for(const track of ['cloud','ai','agent'])assert.equal(ids.filter(id=>d.modules.find(m=>m.id===d.articles.find(a=>a.id===id).module).track===track).length,2);
for(const[id,file]of [['vpc-network','route_walk.py'],['kubernetes-basics','reconcile_walk.py'],['attention-mechanics','attention_trace.py'],['transformer-block','decoder_trace.py'],['durable-workflows','workflow_history.py']]){
 const html=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert([...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===d.mechanismWalkthroughFiles[file].trim()),id+': complete static source differs');
}
// Exercise the documented context composition interface with an explicit teaching counter.
const memory=d.articles.find(a=>a.id==='agent-memory');const snippets=[...memory.sections[1][1].matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>decode(m[1]));
const assemble=snippets.find(s=>s.startsWith('def assemble('));assert(assemble);
const contextTest=cp.spawnSync('python3',['-c',assemble+'\n'+`base={"policy":"keep", "input_cost":2592}
groups=[{"cost":n} for n in [1400,1100,600,700,1000]]
def count(view):
 assert view["policy"]=="keep"
 return view["input_cost"]+sum(g["cost"] for g in view["materials"])
view,cost=assemble(base,groups,count,900,8192)
assert [g["cost"] for g in view["materials"]]==[1400,1100,600,700]
assert cost+900==7292
try: assemble(dict(base,input_cost=8000),groups,count,900,8192)
except ValueError: pass
else: raise AssertionError("fixed content silently discarded")
`],{encoding:'utf8'});assert.equal(contextTest.status,0,contextTest.stderr);
for(const file of ['v43-cidr-selection','v43-reconcile-states','v43-cache-mask-grid','v43-decoder-first-difference','v43-context-budget','v43-workflow-result-boundary']){
 const svg=fs.readFileSync('dist/diagrams/'+file+'.svg','utf8');assert(svg.includes('<metadata>')&&svg.includes('<title')&&svg.includes('<desc'));
}
const revisions=JSON.parse(fs.readFileSync('docs/POST_WINDOW_BODY_REVIEWS.json','utf8')).revisions;
for(const id of ids){const article=d.articles.find(a=>a.id===id),r=revisions.filter(r=>r.id===id).at(-1);assert(r);assert.deepEqual(r.headings,article.sections.map(s=>s[0]));assert.equal(r.reviewed_content_sha256,hash(JSON.stringify({title:article.title,sections:article.sections})));}
console.log('PASS: six body revisions / three tracks, actual stdlib and process replays, independent attention/normalization/residual oracles, context interface execution, exact source bindings and figures. Set INFRA_WALK_TORCH_PYTHON for actual CPU tensor replay.');
