/* Expected inventory comes from reviewed additions, independently of live content arrays. */
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,'docs',file),'utf8'));
const base=read('QUALITY_AUDIT_2026-11-04.json'),migration=read('COURSE_MIGRATION_2026-11-07.json'),expansion=require('./content-review-records.cjs');
const additions=expansion.new_chapter_reviews;
const ids=[...base.chapters,...migration.new_chapter_reviews,...additions].map(a=>a.id);
assert.equal(new Set(ids).size,ids.length,'reviewed chapter ids must be unique');
const tracks={cloud:28,ai:26,agent:10,shared:3};
for(const row of additions){assert(Object.hasOwn(tracks,row.track));tracks[row.track]++;}
const routeViews=read('CONTENT_READING_2026-11-08.json').route_views;
assert(Array.isArray(routeViews)&&new Set(routeViews).size===routeViews.length);
const canonical=100+additions.length+routeViews.length;
const knowledge=[...base.knowledge_reviews,...expansion.new_knowledge_reviews].map(row=>row.id);
assert.equal(new Set(knowledge).size,knowledge.length,'reviewed knowledge point ids must be unique');
module.exports={ids,chapters:ids.length,tracks,points:knowledge.length,search:ids.length+knowledge.length,canonical,html:canonical+1,pages:canonical+2,additions};
