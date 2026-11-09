const inventory=require('./content-inventory.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm'),crypto=require('crypto');
const dist=path.resolve(__dirname,'../dist');
const xml=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]));
assert.equal(urls.length,inventory.canonical);assert.equal(new Set(urls.map(u=>u.href)).size,inventory.canonical);
const primaryOrder=['/outline/','/track/cloud/','/track/ai/','/track/agent/','/labs/','/resources/','/interview/'];
function checkPrimaryOrder(html,route){
 const nav=html.match(/<nav class="top-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
 assert(nav,route+': primary navigation exists');
 assert.deepEqual([...nav.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(([,href])=>href),primaryOrder,route+': study paths before interview review');
}

for(const url of urls){
 const file=path.join(dist,url.pathname,'index.html'),html=fs.readFileSync(file,'utf8');
 checkPrimaryOrder(html,url.pathname);
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
checkPrimaryOrder(fs.readFileSync(path.join(dist,'start/index.html'),'utf8'),'/start/');
const home=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert(home.includes('<h1>基础设施学习指南</h1>')&&home.includes('AI Infra 与 Agent Infra 中文学习指南</title>'),'the homepage identifies the course in its heading and title');
for(const [track,label,topic] of [['cloud','Cloud Infra','Kubernetes'],['ai','AI Infra','分布式训练'],['agent','Agent Infra','智能体运行时']]){
 const html=fs.readFileSync(path.join(dist,'track',track,'index.html'),'utf8');
 assert(html.includes('<title>'+label+' 中文学习路线 · InfraGuide</title>'),track+': distinguish the learning entry from its first article');
 const description=html.match(/<meta name="description" content="([^"]+)"/)?.[1];
 assert(description?.startsWith(label+' 中文学习路线。')&&description.includes(topic),track+': search description reflects the subject');
}
assert(home.includes('href="/about/#reader-trial"'),'home links directly to the public trial');
const about=fs.readFileSync(path.join(dist,'about/index.html'),'utf8');
const trial=about.match(/<section class="quality-section" id="reader-trial"[\s\S]*?(?=<section class="quality-section">)/)?.[0];
assert(trial?.includes('15 分钟试读')&&trial.includes('公开显示你的账号名和内容'),'the invitation explains the optional public feedback');
const trialTargets=[...trial.matchAll(/href="(\/article\/[^"]+?\/#section-1)"/g)].map(([,href])=>href);
assert.deepEqual(trialTargets,['tcp-event-loop','operator-profiling','agent-retrieval'].map(chapter=>'/article/'+chapter+'/#section-1'));
assert.equal((trial.match(/<details class="article-case">/g)||[]).length,3,'the three question sets are closed initially');
const feedback=new URL(trial.match(/href="(https:\/\/github.com\/CaptainGreenskin\/infra-guide\/issues\/new[^"]+)"/)?.[1].replaceAll('&amp;','&'));
assert.equal(feedback.searchParams.get('title'),'15 分钟试读反馈');
assert(feedback.searchParams.get('body').includes('卡住的术语或原句'));
const outline=fs.readFileSync(path.join(dist,'outline/index.html'),'utf8');
const outlineTree=outline.slice(outline.indexOf('<h2>完整学习大纲</h2>'));
assert(!outline.includes('learning-goal-selector')&&!outlineTree.includes('aria-current="page"'),'the outline is a stable chapter directory');
assert(outline.includes('href="/roadmap/">学习路线与岗位重点 →'),'a single link leads to the route selector');
const roadmap=fs.readFileSync(path.join(dist,'roadmap/index.html'),'utf8');
assert.equal((roadmap.match(/class="learning-goal-selector"/g)||[]).length,3,'the course and role selector stays on the roadmap');
for(const role of ['cloud-platform','cloud-sre','ai-training','ai-inference','ai-operators','agent-app','agent-platform']){
 const href='/roadmap/'+role+'/#learning-goal';
 assert(roadmap.includes(href),role+': keep the exact role destination');
 const rolePage=fs.readFileSync(path.join(dist,'roadmap',role,'index.html'),'utf8');
 const selector=rolePage.match(/id="learning-goal"><nav class="learning-goal-selector"[\s\S]*?<\/nav>/)?.[0];
 assert(selector?.includes('href="'+href+'" aria-current="page"'),role+': opening a role lands on its visibly selected path');
}
const outlineChapterCount=new Set([...outlineTree.matchAll(/href="\/article\/([^"/]+)\//g)].map(m=>m[1])).size;
assert.equal(outlineChapterCount,inventory.chapters);
assert(outline.includes('Infra（基础设施）')&&outline.includes('计算、网络、数据和权限是共同底座。'),'define the three directions before their directory');
assert(!outline.includes('class="outline-intro"')&&!outline.includes('class="outline-map"'),'one introduction before the actual course directory');
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
console.log('PASS: '+inventory.canonical+' canonical full-text routes plus a retained start alias, ordered primary navigation, social metadata, crawlable links, sitemap and attention calculations/evidence.');

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
for (const [route, total, mustContain, mustOmit, capstone] of [
 ['/module/training', inventory.tracks.ai, 'model-serving', 'linux-resource','training-lab'],
 ['/article/network-diagnosis', inventory.tracks.cloud, 'linux-resource', 'gpu-memory','cloud-service-lab'],
 ['/article/agent-security', inventory.tracks.agent, 'agent-runtime', 'gpu-cluster','production-readiness'],
 ['/module/practice', inventory.tracks.ai, 'training-lab', 'agent-runtime','training-lab']
]) {
 const sidebar = fs.readFileSync(path.join(dist, route, 'index.html'), 'utf8')
   .match(/<aside class="sidebar"[\s\S]*?<\/aside>/)[0];
 assert(sidebar.includes(total+' 章') && sidebar.includes('本主题阅读进度'));
 assert(sidebar.includes('/article/'+mustContain+'/') && !sidebar.includes('/article/'+mustOmit+'/'));
 const chapterLinks=[...sidebar.matchAll(/<a href="\/article\/([^/]+)\/"[^>]*>/g)].map(m=>m[1]);
 assert.equal(new Set(chapterLinks).size,total+1);
 assert(sidebar.includes(' + 1 实战')&&chapterLinks.includes(capstone));
 for(const other of ['training-lab','cloud-service-lab','production-readiness'])if(other!==capstone)assert(!chapterLinks.includes(other));
 assert.equal((sidebar.match(/aria-current="page"/g) || []).length, 1);
}
assert(interview.includes('面试覆盖对照') && interview.includes('现场编码') && interview.includes('careers.microsoft.com'));
console.log('PASS: topic-specific sidebar, current page highlight, interview scope and mock prompts.');

const pageText = id => fs.readFileSync(path.join(dist,'interview',id,'index.html'),'utf8');
for (const id of ['plan','companies','coding','database','design','experiences','cloud']) {
 assert(interview.includes('/interview/'+id+'/'), 'interview entry '+id);
 assert(pageText(id).includes('aria-current="page"'), 'active workshop '+id);
}
for(const track of ['cloud','ai','agent'])assert(outline.includes('href="/outline/#outline-'+track+'"'),'direct direction jump '+track);
assert.equal((outline.match(/class="chapter-priority"/g)||[]).length,inventory.chapters);
assert(pageText('plan').includes('三轮考前复习'));
const sample=pageText('companies');
for (const phrase of ['腾讯','阿里','字节','8 份公开岗位说明','12 组能力','8 组已有','4 组有']) assert(sample.includes(phrase),phrase);
const db=JSON.parse(fs.readFileSync(path.join(dist,'labs/interview-database/validation.json'),'utf8'));
assert.equal(db.source_sha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'labs/interview-database/query_lab.py'))).digest('hex'));
assert.deepEqual(db.snapshot_reads,['queued','queued','running']);
assert.equal(db.plans.length,3);
for (const item of db.plans) assert.deepEqual(item.result_ids,db.plans[0].result_ids);
assert(pageText('database').includes('SQLite '+db.sqlite));
console.log('PASS: 7 interview destinations, '+inventory.chapters+' priority labels, role evidence and SQL results.');
