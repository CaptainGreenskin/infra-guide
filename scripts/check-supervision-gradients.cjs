const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const folder='dist/labs/supervision-gradients',source=fs.readFileSync(folder+'/supervision_gradients.py','utf8'),record=JSON.parse(fs.readFileSync(folder+'/validation.json'));
assert.equal(record.status,'passed');assert.equal(record.source_sha256,crypto.createHash('sha256').update(source).digest('hex'));
const actual=record.observed,expected=actual.reference;
assert.equal(actual.torch,'2.5.1');assert.equal(actual.device,'cpu');assert.equal(actual.dtype,'float64');
assert.equal(actual.python,'3.12.13');assert.equal(record.stdlib_reference.python,'3.9.6');
assert.deepEqual(actual.inputs,[[1,5,5,6],[1,3,2,0]]);assert.deepEqual(actual.targets,[[5,5,6,2],[3,2,-100,-100]]);assert.equal(expected.valid_targets,6);
const E=[[0,0],[0,1],[0,-1],[1,0],[-1,0],[2,0],[0,2],[0,0]],pairs=[[1,5],[5,5],[5,6],[6,2],[1,3],[3,2]];
// Independent scalar objective, no program import or autograd dependency.
function loss(weights){return pairs.reduce((total,[input,target])=>{const h=weights[input].map(v=>v/2),z=weights.map(row=>row[0]*h[0]+row[1]*h[1]);return total+Math.log(z.reduce((s,v)=>s+Math.exp(v),0))-z[target];},0)/pairs.length;}
const close=(a,b,tolerance=1e-12)=>{if(Array.isArray(a)){assert.equal(a.length,b.length);a.forEach((v,i)=>close(v,b[i],tolerance));}else assert(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance,`${a} != ${b}`);};
close(expected.mean_nll,loss(E));close(expected.mean_nll,2.352920745976079);
for(let row=0;row<8;row++)for(let column=0;column<2;column++){
 const plus=E.map(r=>[...r]),minus=E.map(r=>[...r]),h=1e-5;plus[row][column]+=h;minus[row][column]-=h;
 const numerical=(loss(plus)-loss(minus))/(2*h);close(actual.observed_gradients.joint[row][column],numerical,1e-8);
 close(actual.observed_gradients.joint[row][column],actual.observed_gradients.lookup[row][column]+actual.observed_gradients.output[row][column]);
}
const padGradient=[0,0];for(const [input]of pairs){const h=E[input].map(v=>v/2),p0=1/E.reduce((sum,row)=>sum+Math.exp(h[0]*row[0]+h[1]*row[1]),0);h.forEach((v,i)=>padGradient[i]+=p0*v/6);}
close(actual.observed_gradients.lookup[0],[0,0]);close(actual.lookup_padding_probe,[0,0]);
close(actual.observed_gradients.output[0],padGradient);close(actual.pad_row_after_sgd,padGradient.map(v=>-.1*v));
assert(actual.observed_gradients.output[4].every(v=>v>0));close(actual.observed_gradients.lookup[4],[0,0]);
const scalar=actual.unequal_supervision;
const allLoss=(.5+2+2+2)/4,allGradient=(1-2-2-2)/4,meansLoss=(.5+2)/2,meansGradient=(1-2)/2;
assert.deepEqual(scalar.all_tokens,{loss:allLoss,gradient:allGradient,after_sgd:1-.1*allGradient});
assert.deepEqual(scalar.micro_sum_over_four,scalar.all_tokens);assert.deepEqual(scalar.mean_of_means,{loss:meansLoss,gradient:meansGradient,after_sgd:1-.1*meansGradient});

const replay=(python,args)=>{const r=cp.spawnSync(python,[folder+'/supervision_gradients.py',...args],{encoding:'utf8',timeout:45000,maxBuffer:1024*1024});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
const stdlib=replay('python3',['--reference-only']);close(stdlib.reference.joint_gradient,expected.joint_gradient);close(stdlib.reference.mean_nll,expected.mean_nll);assert(stdlib.finite_difference_max_error<1e-8);assert(!stdlib.observed_gradients);
if(process.env.INFRA_SUPERVISION_PYTHON){const rerun=replay(process.env.INFRA_SUPERVISION_PYTHON,[]);close(rerun.observed_gradients.joint,actual.observed_gradients.joint);close(rerun.pad_row_after_sgd,actual.pad_row_after_sgd);assert.deepEqual(rerun.unequal_supervision,scalar);}

const c={};vm.createContext(c);for(const [,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
assert.equal(vm.runInContext('supervisionGradientFiles["supervision_gradients.py"]',c),source);
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const html=fs.readFileSync('dist/article/tokenization-embedding/index.html','utf8'),blocks=[...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>decode(m[1]).trim());assert(blocks.includes(source.trim()));assert(html.includes('labs/supervision-gradients.zip'));
const article=vm.runInContext('articles.find(a=>a.id==="tokenization-embedding")',c);assert(article.sections[4][1].includes('v34-label-alignment'));assert(article.sections[6][1].includes('v34-shared-embedding-grad'));assert(article.sections[8][1].includes('supervision_gradients.py'));
const lookup=article.sections[2][1],scores=article.sections[3][1],visibility=article.sections[5][1];
assert(lookup.includes('前四项'+JSON.stringify(actual.inputs[0])+'作输入，后四项'+JSON.stringify(actual.targets[0])+'作目标'),'the first lookup explains why it uses only four tokens');
assert(scores.includes('编号5对应从左数第六列，分数是2'),'the candidate ID and the displayed column are distinct');
assert(visibility.includes('位置2是结束符EOS，它能读取位置0、1、2，自己却没有真实的下一项目标。'));
assert(visibility.includes('href="/article/attention-mechanics/#subsection-1-bc8625"'),'the visibility example leads directly to computing reading weights');
assert(vm.runInContext('articles.find(a=>a.id==="autograd-training").sections.find(s=>s[0].includes("微批不等长"))[1]',c).includes('v34-microbatch-denominators'));
const metadata=name=>{const s=fs.readFileSync('dist/diagrams/'+name+'.svg','utf8'),m=s.match(/<metadata>([\s\S]*?)<\/metadata>/);assert(m);return JSON.parse(decode(m[1]));};
assert.equal(metadata('v34-label-alignment').valid_targets,6);assert.equal(metadata('v34-label-alignment').rectangle_positions,8);
close(metadata('v34-shared-embedding-grad').gradient,padGradient);assert.deepEqual(metadata('v34-microbatch-denominators').observed,scalar);
const zip=cp.spawnSync('python3',['-c',`from pathlib import Path
import zipfile
p=Path('${folder}')
with zipfile.ZipFile(str(p)+'.zip') as z:
 assert sorted(z.namelist())==['supervision-gradients/README.md','supervision-gradients/supervision_gradients.py','supervision-gradients/validation.json']
 for name in z.namelist(): assert z.read(name)==(p/Path(name).name).read_bytes(),name
`],{encoding:'utf8'});assert.equal(zip.status,0,zip.stderr);
console.log('PASS: independent six-position CE and16 finite differences, shared lookup/output gradient conservation, actual PAD update record and unequal-weight scalar oracle; stdlib replay, exact inline source/ZIP/SVG'+(process.env.INFRA_SUPERVISION_PYTHON?' and actual CPU autograd rerun.':'; set INFRA_SUPERVISION_PYTHON for CPU autograd replay.'));
