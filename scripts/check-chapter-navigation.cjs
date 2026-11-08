/* Preserve authored source/IDs and share actual subsection targets across navigation. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const c={URLSearchParams,location:{search:''},articleURL:id=>'/article/'+id+'/'};vm.createContext(c);
for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const articles=JSON.parse(JSON.stringify(vm.runInContext('articles',c)));let count=0;
const published=JSON.parse(fs.readFileSync('docs/SUBSECTION_LINKS_2026-11-08.json','utf8'));
assert.equal(published.chapters.length,articles.length);
for(const a of articles){
 c.article=a;const before=JSON.stringify(a),nav=JSON.parse(JSON.stringify(vm.runInContext('chapterNavigation(article)',c)));
 assert.equal(JSON.stringify(a),before);assert.equal(nav.length,a.sections.length);
 const used=new Set(),page=fs.readFileSync('dist/article/'+a.id+'/index.html','utf8');
 for(let i=0;i<nav.length;i++){
  const original=a.sections[i][1],output=nav[i].html;
  assert.deepEqual(output.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)||[],original.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)||[]);
  for(const[,id]of original.matchAll(/\bid=["']([^"']+)["']/g))assert(output.includes('id="'+id+'"')||output.includes("id='"+id+"'"));
  for(const heading of nav[i].children){assert(!used.has(heading.id));used.add(heading.id);assert(page.includes('id="'+heading.id+'"')||page.includes("id='"+heading.id+"'"));assert(page.includes('data-toc="'+heading.id+'"'));count++;}
 }
 const old=published.chapters.find(row=>row.id===a.id);assert(old,a.id+': missing published navigation review');
 const current=nav.flatMap(section=>section.children.map(h=>h.id));
 for(const id of old.targets)assert(current.includes(id),a.id+': published subsection target removed; preserve its authored ID when changing a heading');
}
const run=html=>{c.test={id:'fixture',sections:[['Mechanism',html]]};return JSON.parse(JSON.stringify(vm.runInContext('chapterNavigation(test)[0]',c)));};
const original='<h3 id="author-id">真实标题</h3><pre><code>&lt;h3&gt;示例&lt;/h3&gt;</code></pre><details><summary>选读</summary><h3>隐藏说明</h3></details><h3>先讲对象</h3><h4>再讲关系</h4>';
const first=run(original);assert.deepEqual(first.children.map(h=>h.title),['真实标题','先讲对象','再讲关系']);assert.equal(first.children[0].id,'author-id');
assert.deepEqual(run('<h3>新增内容</h3>'+original).children.slice(1).map(h=>h.id),first.children.map(h=>h.id),'inserting an earlier heading must not renumber old targets');
assert.equal(new Set(run('<h3>同名</h3><h3>同名</h3>').children.map(h=>h.id)).size,2);
assert(run('<h3><code>x &lt; y</code> 与状态</h3>').children[0].title==='x < y 与状态');
c.location.search='?goal=ai-inference';c.article=articles.find(a=>a.id==='model-serving');assert(vm.runInContext('chapterContentsHTML(article)',c).includes('?goal=ai-inference#subsection-'));
console.log('PASS: '+articles.length+' source-preserving navigation renders; '+count+' visible subsection links, preserved original code/IDs, stable text-based targets and role-context links.');
