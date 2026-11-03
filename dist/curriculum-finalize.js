// Preserve existing training URLs and replace the introductory Cloud/Platform articles.
articles.splice(0,articles.length,...articles.filter(a=>a.module==='training'),...systemChapters);
for(const a of systemChapters){
 a.check=[...a.objectives];
 a.minutes=Math.max(8,Math.ceil(a.sections.map(s=>s[1].replace(/<details[\s\S]*?<\/details>/g,'').replace(/<[^>]*>/g,'')).join('').length/240)+3);
}
articles.sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));
sources.curl=['curl · 命令与计时字段','https://curl.se/docs/manpage.html'];
articles.find(a=>a.id==='network-diagnosis').refs.push('curl');
