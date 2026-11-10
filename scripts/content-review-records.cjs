/* Later editorial stages append separate ledgers; completed records remain byte-for-byte. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const root=path.resolve(__dirname,'..'),files=['CONTENT_EXPANSIONS_2026-11-07.json','CONTENT_EXPANSIONS_2026-11-08.json','CONTENT_EXPANSIONS_2026-11-08_DELIVERY.json'];
const registry=path.join(root,'docs','CONTENT_LATER_STAGES.json');
if(fs.existsSync(registry)){
 const later=JSON.parse(fs.readFileSync(registry,'utf8'));assert(Array.isArray(later)&&new Set(later).size===later.length);
 for(const file of later){assert(/^[A-Z0-9_-]+\.json$/.test(file));assert(!files.includes(file));files.push(file);}
}
const stages=files.map(f=>JSON.parse(fs.readFileSync(path.join(root,'docs',f),'utf8')));
for(const stage of stages){
 assert(stage.historical_eight_hour_counts_unchanged);
 for(const[file,sha]of Object.entries(stage.preserved_previous_records||{}))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),sha,file+': completed stage record changed');
}
module.exports=Object.fromEntries(['new_chapter_reviews','new_knowledge_reviews','knowledge_revisions','body_revisions','revised_teaching_units','new_concept_reviews'].map(key=>[key,stages.flatMap(s=>s[key]||[])]));
module.exports.historical_eight_hour_counts_unchanged=true;
