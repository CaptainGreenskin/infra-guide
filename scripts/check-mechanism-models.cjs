const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const c={};vm.createContext(c);
vm.runInContext(fs.readFileSync('dist/cloud-mechanics-interactive.js','utf8'),c);
const cpu=(p,q,n)=>vm.runInContext(`cpuQuotaModel(${p},${q},${n})`,c);
const latency=(...args)=>vm.runInContext(`latencyModel(${args.map(x=>String(x)).join(',')})`,c);
// Independent CPU-time ledgers: each concurrently running thread consumes wall time.
for(const [p,q,n,active,idle,cores,unused] of [
 [100,50,1,50,50,.5,0], [100,50,2,25,75,.5,0],
 [100,200,2,100,0,2,0], [100,300,2,100,0,2,100],
 [80,120,3,40,40,1.5,0], [1000,8000,8,1000,0,8,0]
]){const m=cpu(p,q,n);assert(!m.error);assert.equal(m.active,active);assert.equal(m.idle,idle);assert.equal(m.usedCores,cores);assert.equal(m.unused,unused);assert.equal(m.active*n+unused,q);}
for(const args of [[0,50,2],[100,-1,2],[100,50,1.5],[100,50,9],[1001,50,2],[100,8001,2],[NaN,50,2]])assert(cpu(...args).error);
const fresh=latency(20,30,40,120,40,false);
assert.deepEqual(Array.from(fresh.cumulative),[20,50,90,210,250]);assert.equal(fresh.ttfb,210);assert.equal(fresh.postTls,120);
const reused=latency(20,30,40,120,40,true);
assert.deepEqual(Array.from(reused.cumulative),[0,0,0,120,160]);assert.equal(reused.ttfb,120);assert.equal(reused.total,160);
assert.equal(latency(0,0,0,0,0,false).total,0);
assert.equal(latency(3,5,7,11,13,false).total,39);
for(const args of [[-1,0,0,0,0],[0,0,0,60001,0],[0,0,0,NaN,0],[Infinity,0,0,0,0]])assert(latency(...args).error);
assert(vm.runInContext('latencyResultHTML(latencyModel(20,30,40,120,40,true))',c).includes('就绪连接至首字节'));
console.log('PASS: CPU-time conservation, saturated/unused budgets, input bounds, cumulative timing, connection reuse and zero-time path.');
