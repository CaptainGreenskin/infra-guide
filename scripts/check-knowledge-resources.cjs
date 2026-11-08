const fs=require('fs'),vm=require('vm'),assert=require('assert');
const c={};vm.createContext(c);for(const [,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c);
const d=vm.runInContext('({articles,cloudKnowledgeDomains,cloudPrerequisites,learningResources,cloudRoleSources,interviewFollowUps})',c);
assert.equal(d.cloudKnowledgeDomains.length,9);assert.equal(d.cloudPrerequisites.length,5);
assert.equal(d.cloudKnowledgeDomains.flatMap(domain=>domain.points).length,62);
const ids=new Set(d.articles.map(a=>a.id));
for(const domain of d.cloudKnowledgeDomains){assert(domain.points.length>=5);for(const point of domain.points){assert(point[2].length>45&&point[3].length>25);for(const id of point[4])assert(ids.has(id));}}
assert.equal(new Set(d.learningResources.map(r=>r.id)).size,d.learningResources.length);
for(const r of d.learningResources){assert(new URL(r.url).protocol==='https:');assert(r.first&&r.prereq&&r.gate&&r.access);assert(['cloud','ai','agent'].includes(r.track));for(const id of r.chapters)assert(ids.has(id));}
for(const track of ['cloud','ai','agent'])assert(d.learningResources.filter(r=>r.track===track&&r.video).length>=3);
assert.equal(d.cloudRoleSources.length,3);
const html=route=>fs.readFileSync('dist/'+route+'/index.html','utf8');
for(const [route,first]of [['module/compute','云计算服务模型'],['module/network','VPC、子网与地址规划'],['module/native','镜像、容器与运行时']]){
 const page=html(route);assert(page.includes('class="knowledge-point"'));assert(page.indexOf(first)<page.indexOf('id="examples"'));
 const sidebar=page.match(/<aside class="sidebar"[\s\S]*?<\/aside>/)[0];assert(!sidebar.includes('模块概览')&&!sidebar.includes('系统知识</a>'));assert(sidebar.includes('<summary><a href="/article/'));
 assert(!page.includes('从第一章开始')&&!page.includes('先看全貌，再走平台主干'));
}
for(const [route,title]of [['track/ai','Transformer 全貌'],['track/agent','从模型提议到任务完成'],['module/training','云上训练全景']])assert(html(route).includes(title),route);
const resources=html('resources');assert.equal((resources.match(/class="resource-row"/g)||[]).length,d.learningResources.length);
assert(!resources.includes('github-projects')&&!resources.includes('research-project'));
assert(!fs.existsSync('dist/github-research-data.js'));
assert.equal(d.interviewFollowUps.length,6);
assert.equal((html('interview/experiences').match(/class="experience-question research-followup"/g)||[]).length,6);
assert(html('interview/cloud').includes('IaaS、网络、存储与站点架构专项'));
console.log('PASS: 9 actual fields / 62 knowledge points, separate prerequisites, direct reading without overview rows, '+d.learningResources.length+' source-mapped resources and 3 official role samples.');
