/* Fresh dual-projection semantics: a nonempty field is not a same-source-version view. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),c={};vm.createContext(c);
for(const[,file]of fs.readFileSync(path.join(root,'src/page-shell.html'),'utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),c,{filename:file});
const a=vm.runInContext('articles.find(a=>a.id==="delivery")',c),body=a.sections.map(s=>s[1]).join('');
const marker='id="delivery-projection-pair-lab"';assert.equal(body.split(marker).length,2);
const block=body.slice(body.indexOf(marker)).match(/<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/);assert(block,'complete program in its own selected-reading block');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const source=decode(block[1]);
function run(program){return cp.spawnSync('python3',['-c',program],{encoding:'utf8',timeout:10000,maxBuffer:128*1024});}
const result=run(source);assert.equal(result.status,0,result.stderr);const r=JSON.parse(result.stdout);
assert.equal(r.fixture,'fixed_delimiter_sqlite_projection_pair');
const stages=['initial','v1_ready','body_advanced','summary_only','v2_ready'];
assert.deepEqual(stages.map(k=>r[k].allow_new),[false,true,false,false,true]);
assert.deepEqual(stages.map(k=>r[k].body_version),[1,1,2,2,2]);
assert.deepEqual(stages.map(k=>r[k].projection_versions),[[null,null],[1,1],[1,1],[2,1],[2,2]]);
assert.deepEqual(r.initial.selected,{body:'摘要甲|证据甲'});assert.deepEqual(r.v1_ready.selected,{summary:'摘要甲',evidence:'证据甲'});
for(const key of ['body_advanced','summary_only'])assert.deepEqual(r[key].selected,{body:'摘要乙|证据乙'});
assert.deepEqual(r.v2_ready.selected,{summary:'摘要乙',evidence:'证据乙'});assert.equal(r.stale_publish_rows,0);
const broken=[['ignore evidence version','sv == ev == version','sv == version'],['ignore source compare-and-set','WHERE id=17 AND body_version=?','WHERE id=17 AND ? IS NOT NULL']];
for(const[name,before,after]of broken){assert(source.includes(before),name+': mutation boundary');const result=run(source.replace(before,after));assert.notEqual(result.status,0,name+': changed condition must violate a business observation');assert(result.stderr.includes('AssertionError'));}
const page=fs.readFileSync(path.join(root,'dist/article/delivery/index.html'),'utf8');assert(page.includes(marker)&&page.includes('v69-delivery-compatibility.svg'));
assert.equal(decode(page.slice(page.indexOf(marker)).match(/<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/)[1]),source,'static page and canonical program must match');
console.log('PASS: fresh SQLite source advance, dual same-version projection gate and stale-publish CAS; five independently specified consumer states, two altered-condition rejections, exact canonical/static source and compatibility figure. Fixed delimiter, no model/production migration inference.');
