const fs=require('fs'),vm=require('vm'),assert=require('assert');
const sink={innerHTML:''},grid={innerHTML:''},noop=()=>{},stub={addEventListener:noop,setAttribute:noop,removeAttribute:noop,focus:noop,close:noop,showModal:noop,classList:{toggle:noop,remove:noop,add:noop}};
const document={title:'',documentElement:{classList:{toggle:noop}},addEventListener:noop,querySelectorAll:()=>[],getElementById:()=>null,querySelector:s=>s==='base'?null:s==='#app'?sink:s==='#module-grid'?grid:stub};
const c={document,window:{addEventListener:noop,scrollTo:noop},location:{pathname:'/resources/',search:'',hash:'',replace:noop},history:{},localStorage:{getItem:()=>null},URLSearchParams,requestAnimationFrame:noop,IntersectionObserver:class{observe(){}disconnect(){}}};
vm.createContext(c);for(const [,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const resources=vm.runInContext('learningResources',c),all=resources.map(r=>r.id);
const chinese=['k8s-basics','cncf-aliyun','aws-reliability','one-gpu-lm','ntu-genai','hf-agents','d2l-zh','aliyun-dlc-contract'];
const chineseVideo=['cncf-aliyun','ntu-genai','hf-agents','d2l-zh'];
const entries=html=>[...html.matchAll(/<article class="resource-row" id="resource-([^"]+)"/g)].map(m=>m[1]);
for(const [query,expected]of [['',all],['?language=zh',chinese],['?language=zh&media=video',chineseVideo],['?language=unexpected&media=unexpected',all]]){
 c.location.search=query;vm.runInContext('resourcesPage()',c);assert.deepEqual(entries(sink.innerHTML).sort(),[...expected].sort(),query+': wrong resource selection');
 assert.equal((sink.innerHTML.match(/aria-current="true"/g)||[]).length,2,'one selected choice per group');
 assert(sink.innerHTML.includes('英文课程导览回放'),'HF translated prose must not imply a Chinese video');
 if(query==='')for(const [first,later]of [['k8s-basics','mit-os'],['d2l-zh','cs336'],['hf-agents','berkeley-agents']])assert(sink.innerHTML.indexOf('id="resource-'+first+'"')<sink.innerHTML.indexOf('id="resource-'+later+'"'),'Chinese entry should precede English deep reading');
}
c.location.search='?media=video';vm.runInContext('resourcesPage()',c);for(const id of entries(sink.innerHTML))assert(resources.find(r=>r.id===id).video);
c.location.search='?language=%3Cimg%20src%3Dx%3E';vm.runInContext('resourcesPage()',c);assert.equal(entries(sink.innerHTML).length,resources.length);assert(!sink.innerHTML.includes('<img src=x>'));
for(const r of resources){assert.equal(new Date(r.checked).toISOString().slice(0,10),r.checked);if(r.originalUrl)assert.equal(new URL(r.originalUrl).protocol,'https:');}
const hf=resources.find(r=>r.id==='hf-agents');assert(hf.url.includes('/zh-CN/unit1/'));assert(hf.language.includes('英文导览'));
assert.equal(resources.find(r=>r.id==='d2l-zh').video,true);assert(resources.find(r=>r.id==='d2l-zh').title.includes('2021'));
const pai=resources.find(r=>r.id==='aliyun-dlc-contract');assert(pai.access.includes('未执行')&&pai.access.includes('计费资源'));
c.chapter='agent-runtime';const recommended=vm.runInContext('resourceRecommendations("agent",chapter)',c);assert.deepEqual(entries(recommended).sort(),['hf-agents','ntu-genai']);
c.chapter='autograd-training';assert(vm.runInContext('resourceRecommendations("model-foundations",chapter)',c).includes('CaptainGreenskin/one-gpu-lm'));
const filterLink=vm.runInContext('resourceFilterHref("zh","video","agent")',c).replace(/&amp;/g,'&');const url=new URL(filterLink,'https://example.test');assert.equal(url.searchParams.get('language'),'zh');assert.equal(url.searchParams.get('media'),'video');assert.equal(url.hash,'#agent');

const article=vm.runInContext('articles.find(a=>a.id==="training-storage")',c),body=article.sections[2][1];
const map=body.slice(body.indexOf('<h3>从通用接口识别国内云产品</h3>'));
const table=map.slice(map.indexOf('<table'),map.indexOf('</table>')+8);
const rows=[...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m=>m[1].replace(/<[^>]*>/g,'').trim())).filter(r=>r.length);
assert.deepEqual(rows,[['块设备','云盘 / EBS','云硬盘 CBS','Amazon EBS'],['共享文件系统','文件存储 NAS','文件存储 CFS','Amazon EFS'],['对象 API','对象存储 OSS','对象存储 COS','Amazon S3']]);
assert(map.includes('help.aliyun.com')&&map.includes('cloud.tencent.com'));
assert(vm.runInContext('cloudKnowledgeExplanations["storage-model"]',c).includes('从通用接口识别国内云产品'));
for(const file of ['style.css','course.css','curriculum.css','reading-comfort.css']){
 const css=fs.readFileSync('dist/'+file,'utf8');assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+(?:url\()?['"]?https?:/i.test(css),file+': remote font/style dependency');
}
assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(fs.readFileSync('src/page-shell.html','utf8')));
console.log('PASS: '+resources.length+' original resources, eight Chinese/translated entries, language/video filters and priority, explicit video language, authoritative product-name mapping, preserved One GPU LM and local font dependencies.');
