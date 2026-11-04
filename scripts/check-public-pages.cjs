const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm'),crypto=require('crypto');
const dist=path.resolve(__dirname,'../dist');
const xml=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]));
assert.equal(urls.length,100);assert.equal(new Set(urls.map(u=>u.href)).size,100);
for(const url of urls){
 const file=path.join(dist,url.pathname,'index.html'),html=fs.readFileSync(file,'utf8');
 assert(html.includes('<link rel="canonical" href="'+url.href+'">'),url.pathname+': canonical');
 assert(/<h1[ >]/.test(html),url.pathname+': initial heading');
 assert(html.includes('property="og:title"')&&html.includes('property="og:description"'),url.pathname+': sharing metadata');
 assert(!/href="#\//.test(html),url.pathname+': fragment route remains');
 const ld=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);assert.equal(ld.url,url.href);
 if(url.pathname.startsWith('/article/')){assert.equal(ld['@type'],'TechArticle');assert((html.match(/class="article-section(?:\s|")/g)||[]).length>=8);assert(html.includes('迁移练习'));assert(html.includes('data-download-note'))}
 for(const [,href] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   if(/^(https?:|data:|#)/.test(href))continue;
   const target=new URL(href,url.origin+'/').pathname;
   assert(fs.existsSync(path.join(dist,target)),url.pathname+': missing '+target);
 }
}
const outline=fs.readFileSync(path.join(dist,'outline/index.html'),'utf8');
const outlineTree=outline.slice(outline.indexOf('<h2>完整学习大纲</h2>'));
assert.equal(new Set([...outlineTree.matchAll(/href="\/article\/([^"/]+)\//g)].map(m=>m[1])).size,66);
const interview=fs.readFileSync(path.join(dist,'interview/index.html'),'utf8');
assert.equal((interview.match(/class="interview-card"/g)||[]).length,12);
assert.equal((interview.match(/<dt>说明边界<\/dt>/g)||[]).length,12);
for(const id of ['cloud-overview','model-serving','agent-runtime','linux-resource','distributed-training','agent-recovery','network-diagnosis','gpu-memory','agent-security']){const page=fs.readFileSync(path.join(dist,'article',id,'index.html'),'utf8');assert(page.includes('class="guided-intro"'));assert(page.includes('class="guided-contract"'));assert(page.includes('合上页面，试着讲清楚'));assert(page.includes('第一次遇到这些词'));assert(page.includes('展开推理，检查遗漏'))}
const ctx={};vm.createContext(ctx);for(const f of ['attention-files.js','attention-interactive.js'])vm.runInContext(fs.readFileSync(path.join(dist,f),'utf8'),ctx);
for(let i=0;i<4;i++){
 const values=vm.runInContext(`({actual:attentionExample(${i},true,false),expected:attentionValidation.report.attention.output[${i}]})`,ctx);
 values.actual.output.forEach((x,j)=>assert(Math.abs(x-values.expected[j])<1e-12));
}
assert.equal(vm.runInContext('attentionExample(0,true,true).output[0]',ctx),10);
assert(vm.runInContext('attentionExample(0,false,true).output[0]!==attentionExample(0,false,false).output[0]',ctx));
const record=JSON.parse(fs.readFileSync(path.join(dist,'labs/attention/validation.json'),'utf8'));
assert.equal(record.source_sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'labs/attention/attention_lab.py'))).digest('hex'));
assert.equal(record.report.status,'passed');
console.log('PASS: 100 full-text HTML pages, canonical/social metadata, crawlable internal links, sitemap and attention calculations/evidence.');

const ddpRecord=JSON.parse(fs.readFileSync(path.join(dist,'labs/ddp-step/validation.json'),'utf8'));
assert.equal(ddpRecord.report.status,'passed');
assert.equal(ddpRecord.report.world_size,2);
assert.equal(ddpRecord.source_sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'labs/ddp-step/ddp_step.py'))).digest('hex'));
assert.equal(ddpRecord.report.rank_results.length,2);
for(const rows of ddpRecord.report.rank_results){assert.equal(rows.length,4);assert(Math.abs(rows[0].weight_after_step-1.1)<1e-12);assert(Math.abs(rows[3].weight_after_step-1.125)<1e-12)}
console.log('PASS: nine guided chapters and source-matched two-process DDP evidence.');

for (const [directory, script] of [['network-timing', 'timing_lab.py'], ['permissions', 'policy_lab.py']]) {
 const folder = path.join(dist, 'labs', directory);
 const report = JSON.parse(fs.readFileSync(path.join(folder, 'validation.json'), 'utf8'));
 assert.equal(report.status, 'passed');
 assert.equal(report.source_sha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(folder, script))).digest('hex'));
}
for (const [id, anchor, script] of [['network-diagnosis', 'network-timing-lab', 'network-timing/timing_lab.py'], ['agent-security', 'agent-permission-lab', 'permissions/policy_lab.py']]) {
 const page = fs.readFileSync(path.join(dist, 'article', id, 'index.html'), 'utf8');
 assert(page.includes('id="'+anchor+'"') && page.includes('labs/'+script), id+': stable lab entry target');
 assert(fs.readFileSync(path.join(dist,'labs','index.html'),'utf8').includes('/article/'+id+'/#'+anchor),id+': lab catalog deep link');
}
console.log('PASS: timing, authorization evidence and lab deep links.');
for (const [route, total, mustContain, mustOmit] of [
 ['/module/training', 25, 'model-serving', 'linux-resource'],
 ['/article/network-diagnosis', 28, 'linux-resource', 'gpu-memory'],
 ['/article/agent-security', 10, 'agent-runtime', 'gpu-cluster'],
 ['/module/practice', 3, 'production-readiness', 'agent-runtime']
]) {
 const sidebar = fs.readFileSync(path.join(dist, route, 'index.html'), 'utf8')
   .match(/<aside class="sidebar"[\s\S]*?<\/aside>/)[0];
 assert(sidebar.includes(total+' 章') && sidebar.includes('本主题阅读进度'));
 assert(sidebar.includes('/article/'+mustContain+'/') && !sidebar.includes('/article/'+mustOmit+'/'));
 assert.equal((sidebar.match(/href="\/article\//g) || []).length, total);
 assert.equal((sidebar.match(/aria-current="page"/g) || []).length, 1);
}
assert(interview.includes('面试覆盖对照') && interview.includes('现场编码') && interview.includes('careers.microsoft.com'));
console.log('PASS: topic-specific sidebar, current page highlight, interview scope and mock prompts.');

const pageText = id => fs.readFileSync(path.join(dist,'interview',id,'index.html'),'utf8');
for (const id of ['plan','companies','coding','database','design','experiences','cloud']) {
 assert(interview.includes('/interview/'+id+'/'), 'interview entry '+id);
 assert(pageText(id).includes('aria-current="page"'), 'active workshop '+id);
}
assert(outline.includes('先打底，再选方向'));
assert.equal((outline.match(/class="chapter-priority"/g)||[]).length,66);
assert(pageText('plan').includes('三轮考前复习'));
const sample=pageText('companies');
for (const phrase of ['腾讯','阿里','字节','8 份公开岗位说明','12 组能力','8 组已有','4 组有']) assert(sample.includes(phrase),phrase);
const db=JSON.parse(fs.readFileSync(path.join(dist,'labs/interview-database/validation.json'),'utf8'));
assert.equal(db.source_sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'labs/interview-database/query_lab.py'))).digest('hex'));
assert.deepEqual(db.snapshot_reads,['queued','queued','running']);
assert.equal(db.plans.length,3);
for (const item of db.plans) assert.deepEqual(item.result_ids,db.plans[0].result_ids);
assert(pageText('database').includes('SQLite '+db.sqlite));
console.log('PASS: 7 interview destinations, 66 priority labels, role evidence and SQL results.');
