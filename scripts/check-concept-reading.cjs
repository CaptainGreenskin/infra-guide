/* Check the actual hierarchy and diagram geometry, not a claim of reader mastery. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const data=JSON.parse(vm.runInContext('JSON.stringify({articles,maps:fieldConceptMaps,guides:fieldConceptReadings,titles:conceptDirectoryTitles,sections:conceptSectionTitles,standalone:[...optionalConceptReviews]})',c));
const searchTopics=JSON.parse(vm.runInContext('JSON.stringify(Object.fromEntries(buildSiteSearchIndex().filter(e=>e.type==="article").map(e=>[e.id.slice(8),Object.fromEntries(e.segments.filter(s=>s.anchor.startsWith("section-")).map(s=>[s.anchor,s.heading]))])))',c));
assert.deepEqual(Object.keys(data.titles).sort(),data.articles.map(a=>a.id).sort(),'every existing chapter has a reviewed concept name');
assert.deepEqual(Object.keys(data.sections).sort(),data.articles.map(a=>a.id).sort(),'every chapter has reviewed section topics');
for(const a of data.articles){
 assert.equal(data.sections[a.id].length,a.sections.length,a.id+': all section positions retained');
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
  assert(nav[i].title.length>=3&&nav[i].title.length<=36,a.id+': concise subject heading');
  assert(!/为什么|怎样|如何|证明|先.*再/.test(nav[i].title),a.id+': section heading names its knowledge subject');
  assert.equal(searchTopics[a.id]['section-'+(i+1)].replace(/\s+/g,''),nav[i].title.replace(/\s+/g,''),a.id+': search heading matches actual lesson');
 }
}
const first=data.standalone;
assert.equal(first.length,78,'all seventy-eight reviewed standalone bodies');
for(const id of first){
 const a=data.articles.find(x=>x.id===id);assert.equal(data.sections[id].length,a.sections.length);
 const page=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert(page.includes('<details class="concept-review"><summary>概念回顾：本章对象与关系</summary>'));
 assert(!/<details class="concept-review"[^>]*\bopen\b/.test(page));
 assert(page.includes('id="concept-path"'),'published concept anchor retained');
 assert(page.indexOf('id="section-'+a.sections.length+'"')<page.indexOf('id="concept-path"'),id+': concept review follows the full standalone body');
 const toc=page.match(/<aside class="toc">([\s\S]*?)<\/aside>/)?.[1];assert(toc);
 assert(toc.indexOf('#section-'+a.sections.length+'"')<toc.indexOf('#concept-path"'),id+': contents follow the real reading order');
 c.a=a;assert.equal(vm.runInContext('chapterInitialConceptTerms(a).size',c),0,id+': never assume optional definitions were read');
}
const model=data.articles.find(a=>a.id==='transformer-model');
for(const term of ['Embedding','Attention','FFN','归一化','残差连接','输出投影'])assert(model.sections[0][1].includes(term),'model components precede matrix arithmetic: '+term);
const decoderExample=model.sections[0][1].split('id="tiny-decoder-input"')[1];
assert(/前四项作输入[^<]*后四项作目标/.test(decoderExample),'the first reading defines the label shift in the decoder example');
assert(model.sections[6][1].includes('将有效目标对应的行纳入损失'),'the training explanation specifies which targets count');
assert(model.sections[6][1].includes('分别保留 1 项和 3 项有效目标'),'the CPU example states both effective target counts');
const cloud=data.articles.find(a=>a.id==='cloud-overview');assert(cloud.sections[2][1].includes('在请求路径中的作用'));
const agent=data.articles.find(a=>a.id==='agent-runtime');
let taskPosition=-1;
for(const step of ['指定位置却找不到报告','工具从 orders-A 的第 3 版取回两笔订单 [10, 27]','合计 10+27=37','写工具返回后，验收器到指定位置另读一次']){
 const next=agent.sections[0][1].indexOf(step);
 assert(next>taskPosition,'the runtime example follows the same input, expected result and independent readback');
 taskPosition=next;
}
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
assert.equal(edgeCount,90);
console.log('PASS: 78 complete concept-based chapter outlines and matching search headings, '+first.length+' standalone bodies with closing optional reviews, preserved anchors/full titles, and '+edgeCount+' visible relation words across14 maps with no node/label overlap. Reader comprehension still requires trials.');

// Author-defined full names and code identifiers must not receive unrelated word senses.
c.example='<p>旋转位置编码（<dfn>Rotary Position Embedding</dfn>，RoPE）；前向跟读函数<code>trace</code>返回中间量。</p>';
const literal=vm.runInContext('explainFirstConceptTerms(example)',c);
assert(!literal.includes('data-concept-term="Embedding"'));
assert(!literal.includes('data-concept-term="trace"'));
assert(literal.includes('<dfn>Rotary Position Embedding</dfn>'));
c.example='<p>矩阵乘积<var>PV</var>。</p>';assert(!vm.runInContext('explainFirstConceptTerms(example)',c).includes('持久卷'));

for(const id of first){c.reviewedId=id;c.example='<p>Pod是容器运行的单位。<var>PV</var>表示矩阵乘积。</p>';assert.equal(vm.runInContext('chapterConceptProse(articleById(reviewedId),example,new Set())',c),c.example,id+': authored definitions remain natural prose');}
c.example='<p>GPU计算。</p>';c.unreviewedProbe={id:"__new_unreviewed_chapter__"};assert(vm.runInContext('chapterConceptProse(unreviewedProbe,example,new Set())',c).includes('data-concept-term="GPU"'),'new unreviewed bodies keep first-use support independently of existing review coverage');

for(const a of data.articles){const page=fs.readFileSync("dist/article/"+a.id+"/index.html","utf8"),refs=page.match(/<section[^>]*id="references"[^>]*>([\s\S]*?)<\/section>/)?.[1];assert(refs,a.id+": source list");const urls=[...refs.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(urls).size,urls.length,a.id+": each reference URL appears once");}
