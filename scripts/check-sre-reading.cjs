/* Independently derive the figures' distributions and blocking timeline.
   These are declared teaching inputs, separate from actual HTTP/Prometheus runs. */
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const names=['v71-sre-duration-distribution','v71-sre-parallel-spans'];
const svg=Object.fromEntries(names.map(n=>[n,fs.readFileSync('dist/diagrams/'+n+'.svg','utf8')]));
const metadata=Object.fromEntries(names.map(n=>[n,JSON.parse(svg[n].match(/<metadata[^>]*>([\s\S]*?)<\/metadata>/)[1])]));
const quantile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.ceil(q*values.length)-1];
function distribution(m){
 assert.equal(m.kind,'request-duration-distribution');assert.equal(m.unit,'ms');
 assert.deepEqual(m.groups,[{instance:'A',count:99,duration_ms:10},{instance:'B',count:1,duration_ms:1000}]);
 const samples=m.groups.flatMap(g=>Array(g.count).fill(g.duration_ms)),q=m.quantile;
 assert.equal(q.q,.99);assert(q.method.startsWith('nearest-rank:'));assert.equal(q.rank,Math.ceil(q.q*samples.length));
 assert.equal(q.global_ms,quantile(samples,q.q));
 const locals=m.groups.map(g=>quantile(Array(g.count).fill(g.duration_ms),q.q));
 assert.deepEqual(q.instance_ms,Object.fromEntries(m.groups.map((g,i)=>[g.instance,locals[i]])));
 assert.equal(q.unweighted_mean_ms,locals.reduce((s,x)=>s+x,0)/locals.length);
 assert.equal(q.request_weighted_mean_ms,m.groups.reduce((s,g,i)=>s+g.count*locals[i],0)/samples.length);
 assert.notEqual(q.global_ms,q.unweighted_mean_ms);assert.notEqual(q.global_ms,q.request_weighted_mean_ms);
 assert.deepEqual(m.cumulative_buckets.map(b=>b.le_ms),[10,300,1000,'+Inf']);
 for(const b of m.cumulative_buckets)assert.equal(b.count,samples.filter(v=>v<=(b.le_ms==='+Inf'?Infinity:b.le_ms)).length);
 assert(m.scope.includes('no bucket interpolation'));
}
function union(intervals){
 const sorted=intervals.map(x=>[...x]).sort((a,b)=>a[0]-b[0]);let start=sorted[0][0],end=sorted[0][1],length=0;
 for(const[s,e]of sorted.slice(1)){if(s>end){length+=end-start;start=s;end=e;}else end=Math.max(end,e);}return length+end-start;
}
function timeline(m){
 assert.equal(m.kind,'parallel-request-timeline');assert.equal(m.unit,'ms');
 assert.deepEqual(m.spans.map(s=>[s.id,s.parent,s.start_ms,s.end_ms]),[['entry',null,0,320],['app','entry',10,310],['inventory','app',30,130],['logistics','app',40,270]]);
 const byId=Object.fromEntries(m.spans.map(s=>[s.id,s]));
 for(const s of m.spans){assert(s.end_ms>=s.start_ms);if(s.parent){assert(byId[s.parent]);assert(byId[s.parent].start_ms<=s.start_ms&&s.end_ms<=byId[s.parent].end_ms);}}
 assert.deepEqual(m.join.waits_for,['inventory','logistics']);
 const children=m.join.waits_for.map(id=>byId[id]),ranges=children.map(s=>[s.start_ms,s.end_ms]);
 const sum=children.reduce((v,s)=>v+s.end_ms-s.start_ms,0),covered=union(ranges);
 assert.equal(m.child_sum_ms,sum);assert.equal(m.child_union_ms,covered);assert.equal(m.overlap_ms,sum-covered);
 assert.equal(m.end_to_end_ms,byId.entry.end_ms-byId.entry.start_ms);assert(sum>m.end_to_end_ms);
 assert.equal(m.join.at_ms,Math.max(...children.map(s=>s.end_ms)));
 assert.equal(m.critical_branch,children.reduce((a,b)=>a.end_ms>b.end_ms?a:b).id);
 assert.equal(Object.values(m.logistics_breakdown_ms).reduce((a,b)=>a+b,0),byId.logistics.end_ms-byId.logistics.start_ms);
 const counter=m.counterfactual_ms;assert.equal(counter.shorten_logistics_by,20);assert.equal(counter.shorten_inventory_by,20);
 assert.equal(counter.join_after_logistics_change,Math.max(byId.inventory.end_ms,byId.logistics.end_ms-counter.shorten_logistics_by));
 assert.equal(counter.join_after_inventory_change,Math.max(byId.inventory.end_ms-counter.shorten_inventory_by,byId.logistics.end_ms));
 assert(m.clock.includes('not cross-host'));assert(m.scope.includes('no CPU measurement'));
}
distribution(metadata[names[0]]);timeline(metadata[names[1]]);
const altered=[
 [0,m=>m.quantile.global_ms=505], [0,m=>m.quantile.request_weighted_mean_ms=10],
 [0,m=>m.cumulative_buckets[1].count=100], [0,m=>m.quantile.rank=100],
 [1,m=>m.child_union_ms=330], [1,m=>m.overlap_ms=0],
 [1,m=>m.critical_branch='inventory'], [1,m=>m.counterfactual_ms.join_after_inventory_change=250]
];
for(const[index,edit]of altered){const m=structuredClone(metadata[names[index]]);edit(m);assert.throws(()=>[distribution,timeline][index](m));}
// A second, explicitly distinct 1000-success histogram retains less information.
const histogram=[[100,850],[300,975],[1000,995],[Infinity,1000]],rank=.99*histogram.at(-1)[1];
const i=histogram.findIndex(([,n])=>n>=rank),[upper,count]=histogram[i],[lower,before]=histogram[i-1];
assert.equal(rank,990);assert.equal(lower+(rank-before)/(count-before)*(upper-lower),825);
assert.equal(histogram[1][1]/histogram.at(-1)[1],.975);
assert.equal(Math.pow(.99,6).toFixed(3),'0.941');
const c={};vm.createContext(c);for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const a=vm.runInContext('articles.find(a=>a.id==="observability")',c),body=a.sections.map(s=>s[1]).join(''),page=fs.readFileSync('dist/article/observability/index.html','utf8');
for(const name of names){
 for(const html of [body,page])assert(html.includes('diagrams/'+name+'.svg'));
 assert(svg[name].includes('<title')&&svg[name].includes('<desc'));
 assert(svg[name].includes('viewBox="0 0 1120 '));
}
assert(body.includes('825毫秒')&&body.includes('19.9毫秒')&&body.includes('240ms')&&body.includes('330ms'));
assert(!body.includes('图中的 300ms')&&!body.includes('图中的300ms'));
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const source=fs.readFileSync('dist/labs/cloud-operations/telemetry_lab.py','utf8').trim();
const blocks=html=>(html.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)||[]).map(b=>decode(b.replace(/^<pre\b[^>]*>\s*<code[^>]*>/,'').replace(/<\/code>\s*<\/pre>$/,'')));
assert(blocks(body).includes(source)&&blocks(page).includes(source),'exact actual HTTP program remains in canonical and static lesson');
console.log('PASS: independently sorted100-sample p99 and cumulative buckets, distinct1000-success histogram estimate825,320ms blocking timeline/union/critical path, eight rejected numerical counterexamples, exact HTTP source and both canonical/static figures. No production latency or cross-host clock inference.');
