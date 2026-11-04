// Depth and evidence checks complement the structural site checks.
// They catch empty expansions, stale copied examples and missing source records.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const shell=fs.readFileSync(path.join(root,'src/page-shell.html'),'utf8');
const context={};vm.createContext(context);
for(const [,file] of shell.matchAll(/<script defer src="([^"]+)"/g)){
 if(file==='app.js')continue;
 vm.runInContext(fs.readFileSync(path.join(dist,file),'utf8'),context,{filename:file});
}
const data=vm.runInContext('({articles,expandedChapterIds,refreshedIds,foundationOrder})',context);
assert.equal(data.expandedChapterIds.length,18);
assert.equal(data.refreshedIds.length,29);
assert.equal(data.foundationOrder.length,10);
const prose=article=>article.sections.map(section=>section[1])
 .join('').replace(/<(pre|table|details|figure)\b[^>]*>[\s\S]*?<\/\1>/g,'')
 .replace(/<[^>]+>/g,'');
const ids=new Set([...data.expandedChapterIds,...data.refreshedIds]);
for(const article of data.articles.filter(article=>ids.has(article.id))){
 assert(article.sections.length>=7,article.id+': lesson stages');
 const han=(prose(article).match(/[\u3400-\u9fff]/g)||[]).length;
 assert(han>=(data.expandedChapterIds.includes(article.id)?2000:1700),article.id+': prose too thin: '+han);
 assert(article.refs.length>=2 && article.exercise.length===2 && article.prereq,article.id+': learning contract');
}
const report=JSON.parse(fs.readFileSync(path.join(dist,'labs/textbooks/validation.json'),'utf8'));
assert.equal(report.status,'passed');
assert.equal(Object.keys(report.programs).length,13);
for(const [file,record] of Object.entries(report.programs)){
 assert.equal(record.status,'passed');
 assert.equal(record.source_sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'labs',file))).digest('hex'));
}
const decoder=JSON.parse(report.programs['model-foundations/tiny_decoder.py'].stdout);
assert.equal(decoder.parameters,664);
assert.deepEqual(decoder.valid_targets,[1,3]);
assert(decoder.max_grad_diff<1e-12);
assert(decoder.loss_after<decoder.loss_before);
const io=JSON.parse(report.programs['model-foundations/io_attention.py'].stdout);
assert.equal(io.online_example.tiled[0],7.5);
assert.equal(io.online_example.wrong_tile_average,5);
assert.deepEqual(io.tensor_parallel.reduced,[[11,4]]);
console.log('PASS: 18 substantial new lessons, 29 deepened chapters, 10-part prerequisite sequence and 13 source-matched executable examples.');

const decode=value=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const pairs={
 'autograd-training':'model-foundations/tiny_decoder.py',
 'tokenization-embedding':'model-foundations/tokenization.py',
 'position-encoding':'model-foundations/rope.py',
 'durable-workflows':'agent-foundations/durable-workflows.py',
 'agent-retrieval':'agent-foundations/agent-retrieval.py',
 'agent-observability':'agent-foundations/agent-observability.py',
 'agent-sandbox':'agent-foundations/agent-sandbox.py'
};
for(const [id,file] of Object.entries(pairs)){
 const article=data.articles.find(item=>item.id===id);
 const source=fs.readFileSync(path.join(dist,'labs',file),'utf8').trim();
 const snippets=[...article.sections.map(section=>section[1]).join('').matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(match=>decode(match[1]).trim());
 assert(snippets.includes(source),id+': inline code differs from downloadable source');
}
console.log('PASS: inline model and Agent programs match the executed downloadable source.');
