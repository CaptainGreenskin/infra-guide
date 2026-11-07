/* Append explicit post-window body revisions after intentional canonical-content changes.
   Loads the same pipeline as check-editorial-evidence.cjs, recomputes chapter signatures,
   verifies the existing hash chain, and appends one revision per changed reviewed chapter.
   Usage: node scripts/update-post-window-reviews.cjs <reviewed_at YYYY-MM-DD> <scope> <observation> */
const fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ctx={};vm.createContext(ctx);
for(const[,file]of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(read('dist/'+file),ctx,{filename:file});
const data=vm.runInContext('({articles,modules})',ctx);
const signature=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const args=process.argv.slice(2);
if(args.length!==3){console.error('Usage: node scripts/update-post-window-reviews.cjs <YYYY-MM-DD> <scope> <observation>');process.exit(2);}
const[reviewedAt,scope,observation]=args;
if(!/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)){console.error('reviewed_at must be YYYY-MM-DD');process.exit(2);}
const fresh=JSON.parse(read('docs/QUALITY_AUDIT_2026-11-04.json'));
const later=JSON.parse(read('docs/POST_WINDOW_BODY_REVIEWS.json'));
const reviewed=fresh.chapters.filter(x=>/^(substantial_v\d+|fresh_review_v\d+)$/.test(x.review));
let appended=0,backfilled=0;
for(const row of reviewed){
 const a=data.articles.find(a=>a.id===row.id);
 if(!a)throw Error(row.id+': reviewed chapter missing from articles');
 let expected=row.reviewed_content_sha256;
 for(const revision of later.revisions.filter(r=>r.id===row.id)){
  if(revision.previous_content_sha256!==expected)throw Error(row.id+': broken review continuity before update');
  expected=revision.reviewed_content_sha256;
 }
 const current=signature({title:a.title,sections:a.sections});
 if(current===expected){
  // Backfill headings for revisions recorded before this field existed (content signature already matches).
  const tip=later.revisions.filter(r=>r.id===row.id).at(-1);
  if(tip&&!tip.headings){tip.headings=a.sections.map(s=>s[0]);backfilled++;}
  continue;
 }
 later.revisions.push({id:row.id,previous_content_sha256:expected,reviewed_content_sha256:current,reviewed_at:reviewedAt,scope,observation,headings:a.sections.map(s=>s[0])});
 appended++;
}
if(appended||backfilled)fs.writeFileSync(path.join(root,'docs/POST_WINDOW_BODY_REVIEWS.json'),JSON.stringify(later,null,2)+'\n');
console.log('PASS: verified existing chain; appended '+appended+' post-window body revisions; backfilled '+backfilled+' heading records for '+reviewedAt+'.');
