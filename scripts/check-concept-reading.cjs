/* Check the actual hierarchy and diagram geometry, not a claim of reader mastery. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const data=JSON.parse(vm.runInContext('JSON.stringify({articles,maps:fieldConceptMaps,guides:fieldConceptReadings,titles:conceptDirectoryTitles,sections:conceptSectionTitles})',c));
assert.deepEqual(Object.keys(data.titles).sort(),data.articles.map(a=>a.id).sort(),'every existing chapter has a reviewed concept name');
for(const a of data.articles){
 const label=data.titles[a.id];assert(label.length>=4&&label.length<=32);
 assert(!/为什么|怎样|如何|证明|先.*再/.test(label),a.id+': navigation should name its subject');
 const page=fs.readFileSync('dist/article/'+a.id+'/index.html','utf8');
 assert(page.includes('<h1>'+a.number+' '+a.title+'</h1>'),a.id+': full article title remains available');
 assert(page.includes('title="'+a.title.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"'),a.id+': short directory link keeps the full title');
 c.a=a;const nav=JSON.parse(vm.runInContext('JSON.stringify(chapterNavigation(a))',c));
 for(let i=0;i<nav.length;i++){
  assert.equal(nav[i].originalTitle,a.sections[i][0]);
  assert.equal(nav[i].title,data.sections[a.id]?.[i]||a.sections[i][0]);
  assert(page.includes('id="section-'+(i+1)+'"'));
  assert(page.includes(nav[i].title),a.id+': body and contents use the same subject name');
 }
}
const first=['cloud-overview','transformer-model','agent-runtime'];
for(const id of first){
 const a=data.articles.find(x=>x.id===id);assert.equal(data.sections[id].length,a.sections.length);
 const page=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert(page.includes('<details class="concept-review"><summary>概念回顾：本章对象与关系</summary>'));
 assert(!/<details class="concept-review"[^>]*\bopen\b/.test(page));
 assert(page.includes('id="concept-path"'),'published concept anchor retained');
}
const model=data.articles.find(a=>a.id==='transformer-model');
for(const term of ['Embedding','Attention','FFN','归一化','残差连接','输出投影'])assert(model.sections[0][1].includes(term),'model components precede matrix arithmetic: '+term);
assert(model.sections[0][1].includes('训练章节还会把部分目标标为忽略'));
assert(model.sections[0][1].includes('input=s[:-1]、target=s[1:]'));
const cloud=data.articles.find(a=>a.id==='cloud-overview');assert(cloud.sections[2][1].includes('在请求路径中的作用'));
const agent=data.articles.find(a=>a.id==='agent-runtime');
assert(agent.sections[0][1].includes('读取这版数据→计算 10+27→提交报告→由验收器读取报告'));
assert(agent.sections[0][1].includes('<details class="concept-task-detail">'));
const agentPage=fs.readFileSync('dist/article/agent-runtime/index.html','utf8');
assert.equal((agentPage.match(/<details class="article-case">/g)||[]).length,2,'two long cases are optional after the core concepts');
assert(!/<details class="article-case"[^>]*\bopen\b/.test(agentPage));

const identityPage=fs.readFileSync('dist/article/iam-security/index.html','utf8');
const identityNormal=identityPage.slice(identityPage.indexOf('id="kubernetes-identity-normal"'),identityPage.indexOf('id="kubernetes-identity-rbac"'));
assert(identityNormal.includes('命名空间（namespace）'),'native namespace has a local Kubernetes definition');
assert(!identityNormal.includes('Linux中划分一组进程所见系统对象'),'Kubernetes namespace must not receive a Linux namespace definition');

const decode=s=>s.replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const rectangle=html=>{
 const r=html.match(/<rect\b([^>]+)>/);assert(r);
 return ['x','y','width','height'].map(name=>{const value=r[1].match(new RegExp('\\b'+name+'="([^"]+)"'));assert(value);return Number(value[1]);});
};
const overlap=(a,b)=>Math.min(a[0]+a[2],b[0]+b[2])>Math.max(a[0],b[0])+1&&Math.min(a[1]+a[3],b[1]+b[3])>Math.max(a[1],b[1])+1;
let edgeCount=0;
for(const[id,graph]of Object.entries(data.maps)){
 const guide=data.guides[id];assert(guide&&guide.lead.length>=25);assert.equal(new Set(guide.main).size,guide.main.length);
 for(const i of guide.main)assert(Number.isInteger(i)&&i>=0&&i<graph.edges.length);
 const svg=fs.readFileSync('dist/diagrams/field-'+id+'.svg','utf8');
 const boxes=[...svg.matchAll(/<g data-concept="[^"]+">([\s\S]*?)<\/g>/g)].map(m=>rectangle(m[1]));
 const badges=[...svg.matchAll(/<g data-relation-label="(\d+)">([\s\S]*?)<\/g>/g)].map(m=>({index:Number(m[1])-1,bounds:rectangle(m[2]),text:decode(m[2].match(/<text\b[^>]*>([^<]+)<\/text>/)[1])}));
 assert.equal(badges.length,graph.edges.length);assert.equal(boxes.length,graph.nodes.length);
 for(const badge of badges){
  assert.equal(badge.text,(badge.index+1)+' · '+graph.edges[badge.index][1],id+': relation must be readable on its arrow');
  for(const box of boxes)assert(!overlap(badge.bounds,box),id+': word hidden by concept box');
 }
 for(let i=0;i<badges.length;i++)for(let j=i+1;j<badges.length;j++)assert(!overlap(badges[i].bounds,badges[j].bounds),id+': relation words overlap');
 assert.equal((svg.match(/data-emphasis="main"/g)||[]).length,guide.main.length);
 const page=fs.readFileSync('dist/module/'+id+'/index.html','utf8');
 const note=page.match(/<p class="field-map-note">([\s\S]*?)<\/p>/)?.[1];assert(note,id+': missing authored reading path');
 assert.equal(decode(note.replace(/<[^>]+>/g,'')).replace(/\s+/g,''),guide.lead.replace(/\s+/g,''),id+': reading path changed');
 edgeCount+=badges.length;
}
assert.equal(edgeCount,87);
console.log('PASS: 78 concise concept labels, three concept-led opening chapters with shared body/contents topics, preserved anchors/full titles, and87 visible relation words across14 maps with no node/label overlap. Reader comprehension still requires trials.');
