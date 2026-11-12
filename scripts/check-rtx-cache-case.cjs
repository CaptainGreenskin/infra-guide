/* Audit the published external measurement separately from InfraGuide's native CPU labs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const os=require('node:os'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const dist=path.resolve(__dirname,'../dist');
const commit='6e96479924f90e4b0ccd22dba858c51b8516d3ce';
const source='https://github.com/CaptainGreenskin/one-gpu-lm/blob/'+commit+'/experiments/009-training-to-serving/';
const results=source+'results/2026-11-05/';
const checkpoint='bfd6e9ce8e5da810393b74b066b55a8e9531bd1c6ca81c2a7f0dfb2d5548951d';
const recordDigests=['7ec8de679c9377c7311ffe3f44007557c705d5bf9b316be9def2fd50398756ec','2f1d365eee81b24a93036de5c0c749c2cd1a16a8538a2f53b894fbbe40887214'];
// Each row retains the five original throughput samples per mode, in measurement order.
const pairedSamples=[
 [1,32,[287.07173002535444,285.5672033125327,287.22293697815036,276.1716168652515,286.06916474232986],[245.36282849547484,258.14671084067163,266.62572187038325,265.34825069946584,265.62805872814]],
 [1,128,[284.09069723273234,285.3251506042259,285.2249720396748,285.46838271698834,283.80094290649083],[266.19099661988434,266.2724657981327,265.9467775439746,265.90595850892817,271.08706199800156]],
 [8,32,[2271.1127342743166,2264.604011438813,2220.659587151868,2272.047010042139,2268.260808691916],[2016.0798273648825,2012.569661060001,2105.643489374694,2039.7495392445599,2020.3073882565893]],
 [8,128,[2264.958870155128,2296.124751371488,2300.8213967958077,2302.453327128188,2301.7163316043057],[2012.7319919802987,2006.971906686326,2014.716353763675,2011.1682688257595,1987.8450266634059]],
 [1,320,[286.06167953776156,286.8022854963825,288.5590762894761,283.7583068184474,288.99506608606987],[266.30880529453606,266.5379932398428,270.794186148187,270.3779236145054,266.7356356236548]],
 [8,320,[2276.390009399986,2293.2060059045415,2261.9141022167437,2274.660774927944,2284.0749116392335],[1968.3932631845225,1970.3804557391575,1935.242272911403,1939.4527840792166,1968.0135526737372]],
 [32,128,[9046.131781912634,8894.59192890977,8993.082177368626,8985.457679047116,9003.699264157198],[7994.344188729206,7964.94589966232,8481.434867388734,8494.209219407436,8129.389845338615]],
 [32,320,[4360.8604159076685,4358.622709312038,4118.693059650226,4353.812671788268,4112.111037187667],[8313.454178319018,8366.166931018957,8388.290632007505,8165.519025864959,8383.225395999863]]
];
const smallestPrefill=[
 [3.5216769902035594,3.5127770097460598,3.497347002848983,3.4987269900739193,3.4811160003300756],
 [4.1945579869206995,4.171526990830898,4.210548009723425,4.14333600201644,4.155036003794521]
];
const largestPrefill=[
 [6.63679200806655,6.637982005486265,7.414935011183843,6.651242001680657,7.428274984704331],
 [7.772817014483735,6.973601994104683,8.264085015980527,6.961620005313307,7.9615089925937355]
];
const largestPeakBytes=[479192064,841880064];
const median=values=>{assert.equal(values.length,5);return [...values].sort((a,b)=>a-b)[2];};
const windows=[[0,smallestPrefill],[7,largestPrefill]].map(([index,prefill])=>{
 const [batch,prompt,full,cached]=pairedSamples[index];
 const runs=[full,cached].map((rates,mode)=>({batch,prompt_tokens:prompt,decode_steps:32,cached:Boolean(mode),
  samples:rates.map((rate,i)=>({prefill_ms:prefill[mode][i],ms_per_decode_step:1000*batch/rate}))}));
 const totals=runs.map(run=>median(run.samples.map(sample=>sample.prefill_ms+run.decode_steps*sample.ms_per_decode_step)).toFixed(2));
 return {batch,prompt,runs,totals};
});
const mib=1024*1024;
const prefillMedians=largestPrefill.map(samples=>Number(median(samples).toFixed(2)));
const peakMib=largestPeakBytes.map(bytes=>Math.round(bytes/mib));
const comparison=pairedSamples.map(([batch,prompt,full,cached])=>({
 batch,prompt,full:Math.round(median(full)),cached:Math.round(median(cached)),ratio:Number((median(cached)/median(full)).toFixed(2))
}));
assert.deepEqual(comparison.filter(row=>row.ratio>1).map(row=>[row.batch,row.prompt]),[[32,320]]);
assert.equal(2*12*32*(320+32)*768*2/mib,396);
const svg=fs.readFileSync(path.join(dist,'diagrams/rtx-pro-6000-cache-crossover.svg'),'utf8');
const svgEvidence=JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/s)[1]);
assert.equal(svgEvidence.commit,commit);
assert.equal(svgEvidence.experiment,'009-training-to-serving');
assert.deepEqual(svgEvidence.pairs,comparison.map(row=>[row.batch,row.prompt,row.full,row.cached]));
assert.deepEqual(svgEvidence.final_case,{batch:32,prompt:320,allocated_mib:peakMib,prefill_ms:prefillMedians});

// Passing downloaded originals audits every preserved sample against immutable source bytes.
const originals=process.argv.slice(2);
if(originals.length){
 assert.equal(originals.length,2,'provide inference.json followed by extended.json');
 for(const [index,filename] of originals.entries()){
  const bytes=fs.readFileSync(filename);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),recordDigests[index]);
  const record=JSON.parse(bytes);
  assert.equal(record.gpu,'NVIDIA RTX PRO 6000 Blackwell Workstation Edition');
  assert.equal(record.dtype,'bfloat16');
  assert.equal(record.bundle_checkpoint_sha256,checkpoint);
  assert.equal(record.equivalence.gpu_bf16.per_logit_max_abs,0.125);
  assert.equal(record.equivalence.gpu_bf16.argmax_matches,84);
  assert.equal(record.equivalence.gpu_bf16.positions,84);
  assert.equal(record.equivalence.greedy_24_identical_bf16,true);
  assert.equal(record.runs.length,8);
  for(const [offset,[batch,prompt,full,cached]] of pairedSamples.slice(index*4,index*4+4).entries()){
   for(const [mode,samples] of [full,cached].entries()){
    const row=record.runs[2*offset+mode];
    assert.deepEqual([row.batch,row.prompt_tokens,row.decode_steps,row.cached],[batch,prompt,32,Boolean(mode)]);
    assert.deepEqual(row.samples.map(sample=>sample.decode_tokens_s),samples);
    for(const [metric,value] of Object.entries(row.median))assert.equal(value,median(row.samples.map(sample=>sample[metric])));
    for(const sample of row.samples)assert(Math.abs(sample.decode_tokens_s*sample.ms_per_decode_step/(1000*batch)-1)<1e-12);
    if(batch===1&&prompt===32)assert.deepEqual(row.samples.map(sample=>sample.prefill_ms),smallestPrefill[mode]);
    if(batch===32&&prompt===320){
     assert.deepEqual(row.samples.map(sample=>sample.prefill_ms),largestPrefill[mode]);
     assert(row.samples.every(sample=>sample.peak_allocated_bytes===largestPeakBytes[mode]));
    }
   }
  }
 }
}
const html=fs.readFileSync(path.join(dist,'article/model-serving/index.html'),'utf8');
const start=html.indexOf('id="rtx-pro-6000-cache-case"');
assert(start>html.indexOf('id="native-inference-prefix"')&&start<html.indexOf('id="section-8"'));
const caseHtml=html.slice(start,html.indexOf('id="section-8"'));
for(const row of [comparison[0],comparison.at(-1)]){
 const format=value=>value.toLocaleString('en-US');
 assert(caseHtml.includes(`<td>${row.batch} / ${row.prompt}</td><td>${format(row.full)} token/s</td><td>${format(row.cached)} token/s</td><td>${row.ratio.toFixed(2)}×</td>`));
}
assert(caseHtml.includes(`从 ${prefillMedians[0]} ms 提高到 ${prefillMedians[1]} ms`));
assert(caseHtml.includes(`从 ${peakMib[0]} MiB 提高到 ${peakMib[1]} MiB`));
for(const href of [source+'README.md',...['README.md','inference.json','extended.json'].map(file=>results+file)])assert(caseHtml.includes(`href="${href}"`),href);
assert(caseHtml.includes('原始权重留在工作站'));
assert(caseHtml.includes('rtx-pro-6000-cache-crossover.svg'));
assert(caseHtml.includes('396 MiB'));
const context={};vm.createContext(context);
const shell=fs.readFileSync(path.resolve(__dirname,'../src/page-shell.html'),'utf8');
for(const [,file] of shell.matchAll(/<script defer src="([^"]+)"/g)){
 if(file!=='app.js')vm.runInContext(fs.readFileSync(path.join(dist,file),'utf8'),context,{filename:file});
}
const lesson=vm.runInContext('articles.find(a=>a.id==="inference-performance").sections[1][1]',context)
 .split('<h3 id="rtx-prefill-decode-timing">')[1];
const sourceLesson=vm.runInContext('articles.find(a=>a.id==="model-serving").sections[6][1]',context);
assert(lesson?.includes('/article/model-serving/#rtx-pro-6000-cache-case'));
assert(lesson.includes('/article/model-serving/#rtx-timing-readback'));
assert(sourceLesson.includes('/article/inference-performance/#rtx-prefill-decode-timing'));
for(const {batch,prompt,totals} of windows)assert(lesson.includes(`<td>${batch} / ${prompt}</td><td>${totals[0]} ms</td><td>${totals[1]} ms</td>`));
const steps=windows[1].runs.map(run=>median(run.samples.map(sample=>sample.ms_per_decode_step)).toFixed(2));
assert(lesson.includes(`从 ${steps[0]} 降到 ${steps[1]} ms`));
const [readback,...duplicates]=sourceLesson.split('id="rtx-timing-readback">').slice(1);
assert(readback&&!duplicates.length);
const command=readback.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
assert(command,'the lesson includes one executable readback');
const decoded=command.replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'infra-rtx-phase-readback-'));
try{
 for(const [i,name] of ['inference.json','extended.json'].entries()){
  const destination=path.join(scratch,name);
  if(originals.length)fs.copyFileSync(originals[i],destination);
  else fs.writeFileSync(destination,JSON.stringify({runs:windows[i].runs}));
 }
 const output=execFileSync('sh',['-s'],{cwd:scratch,input:decoded,encoding:'utf8',timeout:15000});
 assert.deepEqual(output.trim().split('\n'),windows.flatMap(({batch,prompt,totals})=>
  totals.map((total,mode)=>`${batch} ${prompt} ${mode?'True':'False'} ${total}`)));
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
console.log('PASS: external RTX cache case, eight sample-derived ratios, exact reproduction links, separate prefill/peak measures and executable paired-window readback.');
