const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm'),crypto=require('crypto');
const dist=path.resolve(__dirname,'../dist');
const xml=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]));
assert.equal(urls.length,62);assert.equal(new Set(urls.map(u=>u.href)).size,62);
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
assert.equal(new Set([...outlineTree.matchAll(/href="\/article\/([^"/]+)\//g)].map(m=>m[1])).size,42);
const interview=fs.readFileSync(path.join(dist,'interview/index.html'),'utf8');
assert.equal((interview.match(/class="interview-card"/g)||[]).length,12);
assert.equal((interview.match(/<dt>说明边界<\/dt>/g)||[]).length,12);
for(const id of ['cloud-overview','model-serving','agent-runtime']){const page=fs.readFileSync(path.join(dist,'article',id,'index.html'),'utf8');assert(page.includes('class="guided-intro"'));assert(page.includes('class="guided-contract"'));assert(page.includes('合上页面，试着讲清楚'));assert(page.includes('第一次遇到这些词'));assert(page.includes('展开推理，检查遗漏'))}
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
console.log('PASS: 62 full-text HTML pages, canonical/social metadata, crawlable internal links, sitemap and attention calculations/evidence.');
