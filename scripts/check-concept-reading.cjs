/* Check the actual hierarchy and diagram geometry, not a claim of reader mastery. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const decode=s=>s.replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
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
const opening=model.sections[0][1],firstPrediction=opening.split('<details')[0];
assert(firstPrediction.includes('第一行猜 [0] 后面接什么，第二行猜 [0,1] 后面接什么'),'the first prediction explains both score rows');
const contextRuns=JSON.parse(fs.readFileSync('dist/labs/tiny-decoder-forward/validation.json','utf8')).runs;
const contextPair=[contextRuns.base,contextRuns.change_prefix];
const contrast=contextPair.map(run=>JSON.stringify(run.prompt)+' → '+run.selected_id).join('，');
assert(firstPrediction.includes(contrast),'the opening context swap matches both recorded predictions');
assert(firstPrediction.indexOf('词元（token）')<firstPrediction.indexOf(contrast));
assert(/<ol><li>查表。.*?<li>读取前文。.*?<li>选下一项。.*?<\/ol><figure/.test(firstPrediction),
 'introduce the three steps before the intact opening diagram');
assert(firstPrediction.includes('/article/transformer-model/#repeat-next-token'),'the opening offers the complete generation sequence');
for(const term of ['Attention','FFN','归一化','残差连接','输出投影'])assert(!firstPrediction.includes(term),'defer block internals until the block walkthrough: '+term);
assert(!opening.includes('没有参与这次更新'),'keep the experiment-specific training mask in the training section');
assert(opening.includes('<summary>选读 · 同一模型怎样读训练样本</summary><h3 id="tiny-decoder-input">'),'keep the old direct link to the training preview');
const embedding=model.sections[1][1].split('<details')[0],linear=model.sections[2][1].split('<details')[0];
assert(embedding.startsWith('<p>先给开头的 [0,1] 查表')&&embedding.indexOf('[2,8]')<embedding.indexOf('叫一根轴'),
 'explain the actual two looked-up rows before introducing axes');
assert(linear.includes('继续看 [0,1] 查出的两行')&&linear.includes('8→8')&&!linear.includes('x₀='));
assert(!linear.includes('四项训练输入'),'the default text only relies on the two inputs readers have already seen');
assert(!embedding.includes('[V,D]')&&!model.sections[4][1].includes('[B,T,V]'));
assert(model.exercise[0].includes('将词表从 8 项扩大到 16 项'),'the recap avoids reusing the attention symbol V for vocabulary');
assert(model.sections[2][1].includes('<summary>独立手算 · 每行怎样从 3 项变成 2 项</summary>'));
const block=model.sections[3][1],score=block.indexOf('点积是 2×ln 2'),weights=block.indexOf('得权重 [1/6,1/3,1/2]'),sum=block.indexOf('6/6+0/3+2/2=2');
assert(sum>=0&&sum<score&&score<weights,'show a weighted read before deriving the weights from the same numbers');
assert(block.includes('<summary>手算 · 三个分数怎样变成 1/6、1/3、1/2</summary>'),'keep the exact weight derivation available');
const visibleRead=block.slice(block.indexOf('id="decoder-attention-first-pass"')).split('<details')[0];
const measuredRead=block.split('<summary>实测 · 核对输入、注意力和候选分数</summary>')[1]?.split('</details>')[0];
assert(measuredRead,'the raw forward run is available as a separate verification step');
assert(visibleRead.includes('单独手算一项')&&visibleRead.includes('4×3/4 + 2×1/4 = 3.5')&&visibleRead.includes('0×1/4 + 2×3/4 = 1.5'));
assert(!/\d\.\d{6}/.test(block.replace(/<details\b[\s\S]*?<\/details>/g,'')),'recorded decimals do not interrupt the first reading');
assert(block.includes('[0,1] 的最高分是编号 1，[4,1] 的最高分是编号 7'),'the real prediction closes the opening question');
assert.deepEqual(contextPair[0].layers.x[1],contextPair[1].layers.x[1],'same token and position give identical decoder input');
assert.deepEqual(contextPair[0].reference.q[0][1],contextPair[1].reference.q[0][1]);
assert.deepEqual(contextPair[0].reference.k[0][1],contextPair[1].reference.k[0][1]);
assert.notDeepEqual(contextPair[0].reference.k[0][0],contextPair[1].reference.k[0][0]);
assert.deepEqual(contextPair[0].reference.v[0][1],contextPair[1].reference.v[0][1]);
for(const result of contextPair){
 const [first,self]=result.reference.weights[0][1];
 const [firstValue,selfValue]=result.reference.v[0].map(row=>row[0]);
 const joined=result.layers.joined[1][0];
 assert(Math.abs(first*firstValue+self*selfValue-joined)<1e-12,'reference proportions recover the native head component');
 const prompt=JSON.stringify(result.prompt),format=value=>value.toFixed(7);
 const factors=[first,firstValue,self,selfValue].map(format);
 assert.equal((Number(factors[0])*Number(factors[1])+Number(factors[2])*Number(factors[3])).toFixed(6),joined.toFixed(6));
 assert(measuredRead.includes(`${prompt} 汇总得到 ${factors[0]}×${factors[1]} + ${factors[2]}×${factors[3]} ≈ ${joined.toFixed(6)}`));
 const finalScores=result.logits[1];
 assert.equal(finalScores.indexOf(Math.max(...finalScores)),result.selected_id);
 assert(measuredRead.includes(`${prompt} 给编号 1 打 ${finalScores[1].toFixed(6)} 分，给编号 7 打 ${finalScores[7].toFixed(6)} 分，最高是 ${result.selected_id}`));
}
assert(measuredRead.includes('href="labs/tiny-decoder-forward/validation.json"'),'both score lines link the original forward record');
const diagram=fs.readFileSync('dist/diagrams/transformer-first-forward.svg','utf8');
const preview=JSON.parse(diagram.match(/<metadata>([^<]+)<\/metadata>/)[1]);
const run=JSON.parse(fs.readFileSync('dist/'+preview.record,'utf8')).program;
assert.deepEqual(preview.prompt,run.generation.prompt);
assert.equal(preview.vocabulary,run.vocab_size);
assert.equal(preview.selected_id,run.generation.trace[0].selected_id);
assert.deepEqual(preview.next_prefix,[...run.generation.prompt,run.generation.trace[0].selected_id]);
const blockOverview=block.indexOf('diagrams/tiny-decoder-two-branches.svg');
assert(blockOverview>=0&&blockOverview<block.indexOf('id="decoder-attention-first-pass"'),
 'show the two decoder branches and their bypasses before the attention walk-through');
const beforeBlockFigure=block.slice(0,block.lastIndexOf('<figure',blockOverview));
assert(beforeBlockFigure.includes('块的输入 X')&&beforeBlockFigure.includes('加回 X，得到 H₁')&&beforeBlockFigure.includes('加回 H₁，得到 H₂'),
 'introduce all three symbols before readers see the decoder figure');
assert(block.includes('位置 2 读到编号 2，要预测下一项 3'));
assert(block.includes('直接送去相加的 X 和 H₁ 则保持原样'),'the bypass carries the original, unnormalized values');
const continuation=block.slice(block.indexOf('id="repeat-next-token"'));
const prefix=[...run.generation.prompt];
const fullInputLengths=[];
for(const step of run.generation.trace){
 fullInputLengths.push(prefix.length);
 assert(continuation.includes(`<tr><td>${JSON.stringify(prefix)}</td><td>第 ${prefix.length} 行</td><td>${step.selected_id}</td></tr>`),
  'the visible generation table matches each CPU round');
 prefix.push(step.selected_id);
}
assert(continuation.includes(JSON.stringify(prefix)));
for(const anchor of ['generation-cache-steps','training-versus-generation']){
 assert(continuation.includes('/article/transformer-model/#'+anchor));
 assert(model.sections[6][1].includes('id="'+anchor+'"'));
}
for(const index of [4,5]){
 assert(!model.sections[index][1].split('<details')[0].includes('<table'),
  'the resource section leads with the concept and keeps the calculation optional');
}
const decoderExample=opening.split('id="tiny-decoder-input"')[1];
assert(/前四项送进去[^<]*后四项就是各位置的目标/.test(decoderExample),'the first reading defines the label shift in the decoder example');
const training=model.sections[6][1],fixture=JSON.parse(fs.readFileSync('dist/labs/tiny-decoder-handoff/validation.json','utf8')).fixture;
const cache=training.split('id="generation-cache-steps"')[1].split('<details')[0];
const lastStep=run.generation.trace.at(-1);
assert(continuation.includes(`完整序列 ${JSON.stringify(prefix)} 已有 ${prefix.length} 项`)&&continuation.includes(`整段重算三轮分别送入 ${fullInputLengths.join('、')} 项`),
 'finish the first walkthrough using only full-prefix recomputation');
assert(!/缓存|复用/.test(continuation.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g,'')),'introduce cache mechanics at its own section');
const cachedInputLengths=run.generation.trace.map(step=>step.input_ids.length);
assert(cache.includes(`整段重算三轮送入 ${fullInputLengths.join('、')} 项`)&&cache.includes(`三轮实际只送入 ${cachedInputLengths.join('、')} 项`));
assert(cache.includes(`缓存格数依次为 ${run.generation.trace.map(step=>step.cache_length).join('、')}`));
assert(cache.includes(`都选出了 ${JSON.stringify(run.generation.generated_ids)}`)&&cache.includes(`完整序列长 ${prefix.length}，缓存里有 ${lastStep.cache_length} 格`));
assert(cache.includes('/article/transformer-model/#repeat-next-token'),'the implementation explanation links back to the same sequence');
const target=training.split('id="training-versus-generation"')[1].split('<details')[0];
const labels=fixture.rows[0];
assert(target.includes(`训练样本 ${JSON.stringify(labels)}`)&&target.includes(`拿 ${JSON.stringify(labels.slice(0,-1))} 当输入，拿 ${JSON.stringify(labels.slice(1))} 当逐行的预测目标`)&&target.includes(`[0,1] 对应的目标是 ${labels[2]}`),
 'the default training text shows how the real sample defines a different next target');
const lossTarget=labels[3];
assert(target.includes(`它读到 ${JSON.stringify(labels.slice(0,3))}，目标是 ${lossTarget}`));
assert(target.includes(`原 CPU 更新跳过了目标 ${lossTarget}`)&&fixture.labels[0][0][2]===-100);
// Full-precision CPU output from the optional command in the lesson.
const lossScores=[1.4657852413678996,-2.9185050599653573,6.645484889199837,-3.9739954335607424,-0.6178341348679973,5.229123914568767,0.11623921864330786,-4.022945092513323];
const maxLossScore=Math.max(...lossScores);
const exponents=lossScores.map(score=>Math.exp(score-maxLossScore));
const exponentSum=exponents.reduce((sum,value)=>sum+value,0);
const probability=exponents[lossTarget]/exponentSum,loss=-Math.log(probability);
assert(target.includes(`编号 ${lossTarget} 的分数约 ${lossScores[lossTarget].toFixed(3).replace('-','−')}，八个候选的最高分约 ${maxLossScore.toFixed(3)}`));
assert(target.includes(`${exponents[lossTarget].toFixed(8)} ÷ ${exponentSum.toFixed(5)} ≈ ${probability.toFixed(8)}，单项损失 −ln p ≈ ${loss.toFixed(2)}`),
 'show the calculated probability and single-target loss in the default reading');
const lossCommand=training.match(/<code>(python -B - &lt;&lt;[\s\S]+?\nPY)<\/code>/)?.[1];
assert(lossCommand&&training.includes('href="labs/sdpa-cache/cache_lab.py"')&&training.includes(loss.toFixed(12)),
 'provide the exact rerun command, source and expected cross entropy');
if(process.env.TRANSFORMER_TORCH_PYTHON){
 const {execFileSync}=require('child_process');
 const script=decode(lossCommand).match(/^python -B - <<'PY'\n([\s\S]+)\nPY$/)?.[1];
 assert(script);
 const [outputScores,outputLoss]=execFileSync(process.env.TRANSFORMER_TORCH_PYTHON,['-B','-'],{
  cwd:'dist/labs/sdpa-cache',input:script,encoding:'utf8',timeout:30000
 }).trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(outputScores.length,lossScores.length);
 assert(outputScores.every((value,index)=>Math.abs(value-lossScores[index])<1e-12));
 assert(Math.abs(outputLoss-loss)<1e-12);
}
assert(training.includes('将有效目标对应的行纳入损失')&&training.includes('样本里的目标 2 没有参与这次更新'),'explain valid training targets in the experiment that uses them');
assert(training.includes('分别保留 1 项和 3 项有效目标'),'the CPU example states both effective target counts');
assert(training.includes('两条训练样本 '+fixture.rows.map(row=>'['+row.join(',')+']').join(' 和 ')),'give the exact samples used in the linked recovery run');
assert(model.sections[7][1].includes('href="/article/transformer-model/#section-9"')&&model.sections[7][1].includes('<summary>算例 · 同样八个位置'));
const end=model.sections[8][1],next=end.indexOf('/article/tokenization-embedding/'),advanced=end.indexOf('#/article/attention-mechanics');
assert(next>=0&&next<advanced,'the first lesson link in the conclusion follows the sequential chapter order');
assert(model.sections[5][1].split('<details')[0].includes('href="/article/transformer-model/#section-8"'));
assert(target.includes('href="/article/transformer-model/#section-9"')&&end.split('<details')[0].includes('href="/article/transformer-model/#training-versus-generation"'),
 'let readers move directly between the calculated loss and the acceptance exercise');
const cloud=data.articles.find(a=>a.id==='cloud-overview');assert(cloud.sections[2][1].includes('在请求路径中的作用'));
const agent=data.articles.find(a=>a.id==='agent-runtime');
let taskPosition=-1;
for(const step of ['指定位置却找不到报告','<code>read_values</code>','第 3 版的 [10, 27]','10+27=37','<code>write_report</code>','验收器另外读取数据库中的报告']){
 const next=agent.sections[0][1].indexOf(step);
 assert(next>taskPosition,'the runtime example follows the same input, expected result and independent readback');
 taskPosition=next;
}
assert(agent.sections[0][1].includes('<details class="concept-task-detail">'));
const call=agent.sections[1][1];
assert(call.includes('href="/article/mcp-protocol/">下一章章首'));
assert(/<details class="progressive-detail"><summary>[^<]*六步[^<]*<\/summary><p>[^<]*(?:<code>[^<]*<\/code>[^<]*)?[^<]*<a href="\/article\/mcp-protocol\/#mcp-model-tool-observation">/.test(call),'preserve the advanced exact link inside its optional reading');
assert(/<details class="progressive-detail"><summary>[^<]*调用参数[^<]*<\/summary><h3 id="subsection-2-1mih105">/.test(call),'preserve the original streaming anchor in the optional detail');
const protocol=data.articles.find(a=>a.id==='mcp-protocol');
assert(protocol.sections[4][1].includes('重算 10+27+5=42'));
for(const [section,anchor] of [[3,'native-mcp-catalog-refresh'],[4,'native-mcp-result-receipt']]){
 assert(new RegExp('<details class="progressive-detail"><summary>写工具选读[^<]*</summary><h3 id="'+anchor+'"').test(protocol.sections[section][1]),anchor+': keep the advanced evidence deep link without interrupting the read path');
}
const agentPage=fs.readFileSync('dist/article/agent-runtime/index.html','utf8');
assert.equal((agentPage.match(/<details class="article-case">/g)||[]).length,2,'two long cases are optional after the core concepts');
assert(!/<details class="article-case"[^>]*\bopen\b/.test(agentPage));

const identityPage=fs.readFileSync('dist/article/iam-security/index.html','utf8');
const identityNormal=identityPage.slice(identityPage.indexOf('id="kubernetes-identity-normal"'),identityPage.indexOf('id="kubernetes-identity-rbac"'));
assert(identityNormal.includes('命名空间（namespace）'),'native namespace has a local Kubernetes definition');
assert(!identityNormal.includes('Linux中划分一组进程所见系统对象'),'Kubernetes namespace must not receive a Linux namespace definition');

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
