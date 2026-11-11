const inventory=require('./content-inventory.cjs');
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm'),crypto=require('crypto');
const dist=path.resolve(__dirname,'../dist');
const xml=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]));
assert.equal(urls.length,inventory.canonical);assert.equal(new Set(urls.map(u=>u.href)).size,inventory.canonical);
const primaryOrder=['/outline/','/track/cloud/','/track/ai/','/track/agent/','/labs/','/resources/','/interview/'];
const trialReturns=[];
function checkPrimaryOrder(html,route){
 const nav=html.match(/<nav class="top-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
 assert(nav,route+': primary navigation exists');
 const hrefs=markup=>[...markup.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(([,href])=>href);
 assert.deepEqual(hrefs(nav),primaryOrder,route+': study paths before interview review');
 const fallback=html.match(/<noscript><details class="static-mobile-nav"><summary>导航<\/summary><nav aria-label="主导航">([\s\S]*?)<\/nav><\/details><\/noscript>/)?.[1];
 assert(fallback,route+': native mobile navigation with JavaScript disabled');
 assert.deepEqual(hrefs(fallback),hrefs(nav),route+': both navigation modes lead to the same pages');
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
 for(const [,id] of html.matchAll(/href="\/about\/#reader-trial-questions-([^"]+)"/g))trialReturns.push([url.pathname,id]);
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
 const contents=[...html.matchAll(/data-toc="([^"]+)" href="([^"]+)"/g)];
 assert.equal(contents.filter(([,id])=>id==='section-2').length,2,track+': native and desktop outlines show the same second section');
 for(const [,id,href] of contents)assert.equal(href,'/track/'+track+'/#'+encodeURIComponent(id),track+': local outline stays on the track page');
 const chapter=html.match(/data-static-article="([^"]+)"/)?.[1];
 assert(chapter,track+': first chapter identity');
 const article=fs.readFileSync(path.join(dist,'article',chapter,'index.html'),'utf8');
 assert(article.includes('data-toc="section-2" href="/article/'+chapter+'/#section-2"'),chapter+': standalone chapter outline stays on the article page');
}
assert(home.includes('href="/about/#reader-trial"'),'home links directly to the public trial');
const about=fs.readFileSync(path.join(dist,'about/index.html'),'utf8');
const validationScope=about.match(/<section class="quality-section" id="validation-scope">[\s\S]*?<\/section>/)?.[0];
assert(validationScope,'public evidence scope has a direct reading anchor');
for(const [chapter,anchor] of [
 ['k8s-networking','kubernetes-network-policy-run'],['k8s-storage','native-csi-storage'],
 ['kubernetes-training','native-kubernetes-gloo-job'],['operator-profiling','native-metal-softmax'],
 ['model-serving','native-metal-inference'],['checkpoint-recovery','native-mps-checkpoint-resume'],
 ['model-serving','rtx-pro-6000-cache-case'],['operator-profiling','cuda-core-run'],
 ['multinode-lab','native-ddp-target-preflight'],['kairo-practice','kairo-read-evidence']
]){
 const href='/article/'+chapter+'/#'+anchor;
 assert(validationScope.includes('href="'+href+'"'),href+': the scope links to the exact evidence or preflight');
 const html=fs.readFileSync(path.join(dist,'article',chapter,'index.html'),'utf8');
 assert.equal(html.split('id="'+anchor+'"').length,2,href+': unique evidence anchor');
}
assert(validationScope.includes('配套项目 One GPU LM 记录了'));
assert(validationScope.includes('完成编译，NVIDIA 设备执行与 Nsight 性能分析待验证'));
const trial=about.match(/<section class="quality-section" id="reader-trial"[\s\S]*?(?=<section class="quality-section">)/)?.[0];
assert(trial?.includes('15 分钟试读')&&trial.includes('公开显示你的账号名和内容'),'the invitation explains the optional public feedback');
for(const phrase of ['第 2 分钟','第 10 分钟','第 15 分钟','愿意反馈时','选好愿意公开的内容后再提交','请省略姓名、单位与联系方式']){
 assert(trial.includes(phrase),'reader trial guidance: '+phrase);
}
assert(!/<(?:form|input|textarea)\b/.test(trial),'the trial collects no form data on the site');
const cases=[
 ['cloud','Cloud Infra','tcp-event-loop',3,'TCP 与 I/O，第 1–3 节'],
 ['ai','AI Infra','operator-profiling',2,'算子与性能分析，第 1–2 节'],
 ['agent','Agent Infra','agent-retrieval',2,'检索与上下文，第 1–2 节']
];
const trialTargets=[...trial.matchAll(/href="(\/article\/[^"]+?\/#section-1)"/g)].map(([,href])=>href);
assert.deepEqual(trialTargets,cases.map(([, ,chapter])=>'/article/'+chapter+'/#section-1'));
const taskBlocks=[...trial.matchAll(/<section id="reader-trial-([a-z]+)">([\s\S]*?)<\/section>/g)];
assert.deepEqual(taskBlocks.map(([,id])=>id),cases.map(([id])=>id),'each direction has a stable task anchor');
assert.deepEqual([...trial.matchAll(/id="reader-trial-questions-([^"]+)"/g)].map(([,id])=>id),cases.map(([id])=>id),'each direction has a unique question anchor');
assert.equal((trial.match(/<details class="article-case">/g)||[]).length,3,'the three question sets are closed initially');
const version=fs.readFileSync(path.join(dist,'static-reading-version.js'),'utf8').match(/const staticReadingVersion="([a-f0-9]{64})";/)?.[1];
assert(version&&about.includes('data-static-version="'+version+'"'),'the trial uses the full rendered content version');
const drafts=[];
for(const [index,[id,track,chapter,end,reading]] of cases.entries()){
 const task=taskBlocks[index][2],article='/article/'+chapter+'/',start=article+'#section-1';
 assert(task.includes('href="'+start+'">阅读'+reading),'reader trial reading range: '+id);
 const questions=task.match(/<details class="article-case">[\s\S]*?<\/details>/)?.[0];
 assert(questions?.includes('id="reader-trial-questions-'+id+'"')&&questions.includes('<b>迁移题</b>'),'linked questions and transfer exercise: '+id);
 assert.equal((questions.match(/<li>/g)||[]).length,2,'two concept questions: '+id);
 const draftLinks=[...questions.matchAll(/href="(https:\/\/github\.com\/CaptainGreenskin\/infra-guide\/issues\/new\?[^"]+)"/g)];
 assert.equal(draftLinks.length,1,'the question set has exactly one GitHub issue draft: '+id);
 const feedback=new URL(draftLinks[0][1].replaceAll('&amp;','&'));
 assert.equal(feedback.searchParams.get('title'),'15 分钟试读反馈 · '+track);
 const fields=feedback.searchParams.get('body')?.split('\n')||[];
 for(const field of ['- 方向：'+track,'- 指定范围：'+reading,'- 阅读入口：https://captaingreenskin.github.io/infra-guide'+start,'- 内容版本：'+version,'- 第 2 分钟找到的位置','- 最后读到哪里和实际用时','- 卡住的术语或原句','- 两道概念题的回答','- 迁移题的判断和依据']){
  assert(fields.includes(field),'feedback draft field for '+id+': '+field);
 }
 drafts.push(feedback.href);
 const page=fs.readFileSync(path.join(dist,article,'index.html'),'utf8');
 const sectionStart=number=>page.indexOf('<section class="article-section" id="section-'+number+'">');
 const section=sectionStart(end),next=sectionStart(end+1);
 assert(sectionStart(1)>=0&&section>=0&&next>section,'trial start and end section exist: '+id);
 assert(page.slice(section,next).includes('href="/about/#reader-trial-questions-'+id+'"'),'the return is in the last assigned section: '+id);
}
assert.equal(new Set(drafts).size,cases.length,'one distinct feedback draft per direction');
assert.deepEqual(trialReturns.sort(),cases.map(([id, ,chapter])=>['/article/'+chapter+'/',id]).sort(),'exactly one trial return for each assigned article');
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
