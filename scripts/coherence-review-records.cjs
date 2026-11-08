/* Preserve the published relationship audit; later source reviews form an explicit chain. */
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const baseFile='docs/COHERENCE_REVIEW_2026-11-08.json',baseBytes=fs.readFileSync(baseFile),base=JSON.parse(baseBytes);
const update=JSON.parse(fs.readFileSync('docs/COHERENCE_READABILITY_2026-11-08.json'));
const bodyUpdate=JSON.parse(fs.readFileSync('docs/CAUSAL_WALKTHROUGHS_2026-11-08.json'));
const systemUpdate=JSON.parse(fs.readFileSync('docs/SYSTEM_BUDGET_WALKTHROUGHS_2026-11-08.json'));
// New reviews append separate files; published reviews are never rewritten.
const registryFile='docs/COHERENCE_LATER_STAGES.json';
const laterFiles=fs.existsSync(registryFile)?JSON.parse(fs.readFileSync(registryFile,'utf8')):[];
assert(Array.isArray(laterFiles)&&new Set(laterFiles).size===laterFiles.length);
for(const file of laterFiles)assert(/^[A-Z0-9_-]+\.json$/.test(file),'invalid later review filename');
const laterUpdates=laterFiles.map(file=>JSON.parse(fs.readFileSync('docs/'+file,'utf8')));
const source_sha256={...base.source_sha256};
const relationships={};
for(const stage of [update,bodyUpdate,systemUpdate,...laterUpdates]){
 for(const[file,expected]of Object.entries(stage.preserved_previous_records))assert.equal(sha(fs.readFileSync(file)),expected,file+': published review must remain unchanged');
 for(const[file,review]of Object.entries(stage.source_revisions)){
  let previous=source_sha256[file];
  if(previous===undefined){try{previous=sha(cp.execFileSync('git',['show',stage.base_source_commit+':'+file],{stdio:['ignore','pipe','ignore']}));}catch{previous=null;}}
  assert.equal(review.previous_sha256,previous,file+': source-review continuity');
  assert(review.scope&&review.reviewed_sha256);source_sha256[file]=review.reviewed_sha256;
 }
 if(stage.relationship_snapshot)for(const key of ['chapter_relations','knowledge_targets','system_models','route_stages']){
  assert(stage.relationship_snapshot[key],key+': incomplete current relationship review');
  relationships[key]=stage.relationship_snapshot[key];
 }
}
module.exports={record:{...base,...relationships,source_sha256},update,bodyUpdate,systemUpdate,laterUpdates};
