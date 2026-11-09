/* Context must survive a prose/search/field detour, without changing explicit choices. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const files=[...fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g)].map(m=>m[1]).filter(f=>f!=='app.js');
for(const base of ['/','/infra-guide/']){
 const c={URLSearchParams,location:{pathname:base+'article/tokenization-embedding/',search:'',hash:''},document:{querySelector:s=>s==='base'?{getAttribute:()=>base}:null},articleURL:id=>base+'article/'+id+'/'};vm.createContext(c);
 for(const file of files)vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
 const data=JSON.parse(vm.runInContext('JSON.stringify({profiles:learningProfiles,articles,modules})',c));
 const run=href=>{c.href=href;return vm.runInContext('readerInternalHref(href)',c);};
 for(const[key,p]of Object.entries(data.profiles)){
  c.location.search='?goal='+key;c.profileKey=key;
  const ids=JSON.parse(vm.runInContext('JSON.stringify(learningProfileRoute(learningProfiles[profileKey]))',c));
  const id=ids.at(-1),mod=data.articles.find(a=>a.id===ids[0]).module;
  const expected=base+'article/'+id+'/?section=2&goal='+key+'#detail';
  assert.equal(run('#/article/'+id+'?section=2#detail'),expected,key+': prose link');
  assert.equal(run('article/'+id+'/?section=2#detail'),expected,key+': relative API bridge');
  assert.equal(run(base+'article/'+id+'/?section=2#detail'),expected,key+': search destination');
  const other=data.articles.find(a=>!ids.includes(a.id));
  assert.equal(run('/article/'+other.id+'/'),base+'article/'+other.id+'/',key+': no route imposed outside the chosen curriculum');
  assert.equal(run('/article/'+id+'/?goal=agent-app#detail'),base+'article/'+id+'/?goal=agent-app#detail',key+': explicit choice wins');
  assert.equal(run('/article/'+id+'/?goal=#detail'),base+'article/'+id+'/?goal=#detail',key+': explicit reset wins');
  assert.equal(run('/module/'+mod+'/?concept=opaque#concept-relations'),base+'module/'+mod+'/?concept=opaque&goal='+key+'#concept-relations',key+': field detour keeps context');
  const capstone={cloud:'cloud-service-lab',ai:'training-lab',agent:'production-readiness'}[p.track];
  assert.equal(run('/module/practice/'),base+'module/practice/?track='+p.track+'&goal='+key,key+': correct shared project');
  c.location.pathname=base+'module/practice/';
  assert.equal(vm.runInContext('practiceArticleForContext().id',c),capstone);
  c.location.pathname=base+'article/tokenization-embedding/';
 }
 c.profileKey='agent-app';
 const applicationRoute=JSON.parse(vm.runInContext('JSON.stringify(learningProfileRoute(learningProfiles[profileKey]))',c));
 assert(applicationRoute.includes('agent-recovery')&&!applicationRoute.includes('agent-sandbox'),'the application route retains an independent recovery lesson');
 const recoveryOpening=data.articles.find(a=>a.id==='agent-recovery').sections[0][1];
 assert(!/^<p>上一章/.test(recoveryOpening),'recovery prose must not assume the sandbox chapter on a route that skips it');
 const recoveryAnchor='#mcp-commit-recovery',recoveryPath='/article/durable-workflows/';
 const mcpClosing=data.articles.find(a=>a.id==='mcp-protocol').sections.at(-1)[1];
 const recoveryBody=data.articles.find(a=>a.id==='durable-workflows').sections[8][1];
 assert(mcpClosing.includes('href="'+recoveryPath+recoveryAnchor+'"'),'MCP points straight to the optional write-recovery experiment');
 assert(recoveryBody.includes('id="'+recoveryAnchor.slice(1)+'"'),'native experiment keeps its section anchor');
 assert(!applicationRoute.includes('durable-workflows'),'the optional experiment does not extend the application route');
 c.location.pathname=base+'article/mcp-protocol/';
 c.location.search='?goal=agent-app';
 assert.equal(run(recoveryPath+recoveryAnchor),base+recoveryPath.slice(1)+recoveryAnchor);
 c.location.search='?goal=agent-platform';
 const platformRecovery=recoveryPath+'?goal=agent-platform'+recoveryAnchor;
 assert.equal(run(recoveryPath+recoveryAnchor),base+platformRecovery.slice(1));
 assert(vm.runInContext('learningGoalHTML(learningProfiles["agent-platform"])',c).includes('href="'+platformRecovery+'"'),'platform practice links to the experiment with its selected goal');
 c.location.search='';
 for(const[track,id]of Object.entries({cloud:'cloud-service-lab',ai:'training-lab',agent:'production-readiness'})){
  c.location.pathname=base+'article/'+id+'/';
  assert.equal(run('/module/practice/'),base+'module/practice/?track='+track,track+': ordinary project breadcrumb stays in its track');
  c.location.pathname=base+'module/practice/';c.location.search='?track='+track;
  assert.equal(vm.runInContext('practiceArticleForContext().id',c),id);c.location.search='';
 }
 assert.equal(run('https://example.org/article/agent-runtime/'),'https://example.org/article/agent-runtime/');
 assert.equal(run('//example.org/article/agent-runtime/'),'//example.org/article/agent-runtime/');
 assert.equal(run('#section-2'),'#section-2');
 c.location.pathname=base+'article/tokenization-embedding/';c.location.search='?goal=ai-inference';
 c.fixture='<a href="/article/attention-mechanics/?source=map&amp;section=2#detail">Attention</a>';
 assert.equal(vm.runInContext('cleanInternalHTML(fixture)',c),'<a href="'+base+'article/attention-mechanics/?source=map&amp;section=2&amp;goal=ai-inference#detail">Attention</a>');
}
console.log('PASS: seven learning routes retain context through prose/search/field links at root and Pages paths; explicit choices, external URLs, fragments and HTML entities preserved; shared projects stay in the correct track.');
