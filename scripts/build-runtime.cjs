// Preserve the canonical classic-script order; generate stable cache groups for the public HTML.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const boundaryFiles=['guided-foundations.js','cloud-course-map.js','infra-knowledge.js','research-driven-lessons.js','collective-contract-lessons.js'];
const standalone=['reading-comfort.js','site-search.js','app.js'];
function runtimePlan(shell,read){
 const sources=[...shell.matchAll(/<script defer src="([^"?]+)"\s*><\/script>/g)].map(m=>m[1]);
 if(new Set(sources).size!==sources.length)throw Error('Duplicate canonical scripts');
 if(sources.slice(-standalone.length).join('|')!==standalone.join('|'))throw Error('Keep reader, search and app as the final standalone scripts');
 const content=sources.slice(0,-standalone.length),groups=[],declared=new Map();let pending=[],boundary=0;
 for(const name of content){
  const source=read(name);
  if(/^\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*(['"])use strict\1/.test(source))throw Error(name+': per-file strict directive must remain a separate script');
  for(const[,functionName]of source.matchAll(/^function\s+([\w$]+)\s*\(/gm)){if(declared.has(functionName))throw Error('Review cross-file function hoisting: '+functionName);declared.set(functionName,name);}
  pending.push({file:name,source,sha256:hash(source),bytes:Buffer.byteLength(source)});
  if(name===boundaryFiles[boundary]){groups.push(pending);pending=[];boundary++;}
 }
 if(boundary!==boundaryFiles.length)throw Error('Canonical runtime boundary missing or reordered');
 if(pending.length)groups.push(pending);
 const bundles=groups.map((members,i)=>{
  const file='runtime-'+String(i+1).padStart(2,'0')+'.js';
  const source='/* Generated classic scripts; edit the canonical files listed below. */\n'+members.map(m=>'\n;\n// '+m.file+'\n'+m.source+'\n').join('');
  new vm.Script(source,{filename:file});
  return {file,source,sha256:hash(source),bytes:Buffer.byteLength(source),sources:members.map(({source,...m})=>m)};
 });
 const publicFiles=[...bundles.map(b=>b.file),...standalone];
 let first=true;
 const publicShell=shell.replace(/<script defer src="([^"?]+)"\s*><\/script>/g,()=>{
  if(!first)return '';first=false;return publicFiles.map(file=>'<script defer src="'+file+'"></script>').join('');
 });
 return {bundles,publicFiles,shell:publicShell,manifest:{format:1,canonical_script_count:sources.length,public_script_count:publicFiles.length,bundles:bundles.map(({source,...b})=>b),standalone:standalone.map(file=>({file,sha256:hash(read(file)),bytes:Buffer.byteLength(read(file))}))}};
}
function buildRuntime(shell,dist){
 const plan=runtimePlan(shell,file=>fs.readFileSync(path.join(dist,file),'utf8'));
 for(const bundle of plan.bundles)fs.writeFileSync(path.join(dist,bundle.file),bundle.source);
 fs.writeFileSync(path.join(dist,'runtime-manifest.json'),JSON.stringify(plan.manifest,null,2)+'\n');
 return plan;
}
module.exports={runtimePlan,buildRuntime};
