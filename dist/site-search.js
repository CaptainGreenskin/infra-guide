/* Search real chapters and knowledge points; concept relationships enrich their existing entries. */
let siteSearchCache=null;
function knowledgeSearchSegments(moduleId,id,body){
 const segments=[body],graph=typeof fieldConceptMaps==='undefined'?null:fieldConceptMaps[moduleId],node=graph?.nodes.find(n=>n[0]===id);
 if(node){const names=Object.fromEntries(graph.nodes.map(n=>[n[0],n[1]]));segments.push({heading:'核心关系：'+node[1],conceptTitle:node[1],text:node[2]+' '+graph.edges.filter(e=>e[0]===id||e[2]===id).map(([from,verb,to,why])=>names[from]+' '+verb+' '+names[to]+'。'+why).join(' '),anchor:'concept-relations',query:'concept='+encodeURIComponent(id)});}
 return segments;
}
function searchPlainText(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|#39|nbsp);/gi,(_,entity)=>{const key=entity.toLowerCase();if(key[0]==='#'){const n=key[1]==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return n>=0&&n<=0x10ffff?String.fromCodePoint(n):' ';}return {amp:'&',lt:'<',gt:'>',quot:'"',nbsp:' '}[key]||"'";}).replace(/([\u3400-\u9fff])([A-Za-z0-9])/g,'$1 $2').replace(/([A-Za-z0-9])([\u3400-\u9fff])/g,'$1 $2').replace(/\s+/g,' ').trim();}
function normalizeSearchText(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/([\u3400-\u9fff])([a-z0-9])/g,'$1 $2').replace(/([a-z0-9])([\u3400-\u9fff])/g,'$1 $2').replace(/[^\p{L}\p{N}._+]+/gu,' ').trim();}
function searchFind(text,term,from=0){let at=text.indexOf(term,from);while(at>=0){if(!/^[a-z0-9_.+]+$/.test(term)||(!/[a-z0-9]/.test(text[at-1]||'')&&!/[a-z0-9]/.test(text[at+term.length]||'')))return at;at=text.indexOf(term,at+1);}return -1;}
function searchContains(text,term){return searchFind(text,term)>=0;}
function searchableSubsections(section){
 const titles=new Map(section.children.map(heading=>[heading.id,heading.title]));
 const headings=[...section.html.matchAll(/<h([34])\b([^>]*)>[\s\S]*?<\/h\1\s*>/gi)];
 return headings.flatMap((heading,index)=>{
  const id=heading[2].match(/\bid=(["'])([^"']+)\1/i)?.[2],title=titles.get(id);
  if(!title)return [];
  const body=section.html.slice(heading.index+heading[0].length,headings[index+1]?.index);
  const prose=searchPlainText(body.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/g,''));
  return [{heading:title,text:prose.slice(0,136),anchor:id,subsection:true}];
 });
}
function buildSiteSearchIndex(){
 const entries=[];
 const add=(entry,segments)=>{entry.titleText=searchPlainText(entry.title);entry.titleNorm=normalizeSearchText(entry.titleText);entry.desc=searchPlainText(entry.desc);entry.descNorm=normalizeSearchText(entry.desc+' '+(entry.tags||[]).join(' '));entry.segments=segments.map(s=>({...s,proseNorm:normalizeSearchText(searchPlainText(s.text.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/g,''))),text:searchPlainText(s.text),heading:searchPlainText(s.heading)})).map(s=>({...s,norm:normalizeSearchText(s.heading+' '+s.text),headingNorm:normalizeSearchText(s.heading),conceptNorm:normalizeSearchText(s.conceptTitle||'')}));entry.allNorm=[entry.titleNorm,entry.descNorm,...entry.segments.map(s=>s.norm)].join(' ');entry.order=entries.length;entries.push(entry);};
 for(const a of modules.flatMap(m=>articles.filter(a=>a.module===m.id))){
  const segments=a.sections.map(([heading,text],i)=>({heading:typeof chapterSectionTitle==='function'?chapterSectionTitle(a,i):heading,text,anchor:'section-'+(i+1)}));
  if(typeof chapterNavigation==='function')segments.push(...chapterNavigation(a).flatMap(searchableSubsections));
  const primer=typeof chapterConceptPaths!=='undefined'?chapterConceptPaths[a.id]:null;
  if(primer){const review=typeof optionalConceptReviews!=='undefined'&&optionalConceptReviews.has(a.id);const segment={heading:review?'概念回顾':'概念起点与关系',text:primer.steps.map(([title,body])=>'<p>'+title+'。'+body+'</p>').join(''),anchor:'concept-path'};if(review)segments.push(segment);else segments.unshift(segment);}
  add({id:'article:'+a.id,type:'article',title:a.title,desc:a.desc,tags:a.tags,module:a.module,number:a.number,path:'/article/'+a.id+'/'},segments);
 }
 for(const d of cloudKnowledgeDomains)for(const p of d.points)add({id:'knowledge:'+p[0],type:'knowledge',title:p[1],desc:p[2],module:d.module,path:'/module/'+d.module+'/',anchor:'knowledge-'+p[0]},knowledgeSearchSegments(d.module,p[0],{heading:p[1],text:cloudKnowledgeExplanations[p[0]]||''}));
 for(const d of infraKnowledgeDomains)for(const p of d.points)add({id:'knowledge:'+p.id,type:'knowledge',title:p.title,desc:p.lead,module:d.module,path:'/module/'+d.module+'/',anchor:'knowledge-'+p.id},knowledgeSearchSegments(d.module,p.id,{heading:p.title,text:p.body}));
 return entries;
}
function siteSearchExcerpt(text,terms){
 const plain=String(text||'').replace(/\s+/g,' ').trim(),lower=plain.toLowerCase();
 const candidates=[...terms].sort((a,b)=>b.length-a.length).map(t=>searchFind(lower,t)).filter(i=>i>=0);
 const at=candidates[0]??0;let start=Math.max(0,at-34);
 while(start>0&&/[a-z0-9_.-]/i.test(plain[start])&&/[a-z0-9_.-]/i.test(plain[start-1])&&at-start<64)start--;
 const end=Math.min(plain.length,start+136);
 return (start?'…':'')+plain.slice(start,end)+(end<plain.length?'…':'');
}
function rankSiteSearch(value,availableIndex){
 const query=normalizeSearchText(value),terms=[...new Set(query.split(' ').filter(Boolean))];
 const index=availableIndex??(siteSearchCache||(siteSearchCache=buildSiteSearchIndex()));
 if(!terms.length&&String(value).trim())return [];
 if(!terms.length){const suggestions=['article:cloud-overview','knowledge:mf-tensors','knowledge:tr-ddp','knowledge:sv-kv','knowledge:ag-runtime','knowledge:ag-recovery'];return suggestions.map(id=>index.find(e=>e.id===id)).filter(Boolean).map(e=>({...e,excerpt:siteSearchExcerpt(e.desc,[]),terms:[],matchLabel:'从这里开始'}));}
 const all=text=>terms.every(term=>searchContains(text,term)),coverage=text=>terms.filter(term=>searchContains(text,term)).length,results=[];
 for(const e of index){
  if(!all(e.allNorm))continue;
  let tier=7,segment=null,label='关键词分布在本页';
  if(e.titleNorm===query){tier=0;label='标题匹配';}
  else if(e.type==='article'&&(segment=e.segments.find(s=>s.headingNorm===query&&(s.subsection||/^section-\d+$/.test(s.anchor))))){tier=4;label='小节标题匹配';}
  else if(all(e.titleNorm)){tier=searchContains(e.titleNorm,query)?1:2;label='标题匹配';}
  else if((segment=e.segments.find(s=>s.conceptNorm&&s.conceptNorm===query))){tier=2;label='概念匹配';}
  else if(all(e.descNorm)){tier=3;label='简介或主题匹配';}
  else if((segment=e.segments.find(s=>all(s.headingNorm)))){tier=4;label='小节标题匹配';}
  else {const candidates=e.segments.filter(s=>!s.subsection&&all(s.norm));candidates.sort((a,b)=>Number(all(b.proseNorm))-Number(all(a.proseNorm))||coverage(b.headingNorm)-coverage(a.headingNorm)||Number(searchContains(b.norm,query))-Number(searchContains(a.norm,query)));if((segment=candidates[0])){tier=all(segment.proseNorm)?5:6;label=tier===5?'正文匹配':'源码匹配';}}
  let anchor=e.type==='article'?segment?.anchor:segment?.anchor||e.anchor;
  if(e.type==='article'&&tier>=5&&coverage(e.titleNorm)>0&&segment&&!coverage(segment.headingNorm)){anchor=undefined;label='标题与正文匹配';}
  // A heading hit should explain its opening, rather than jump to a later download label.
  const excerptText=segment&&(tier===4||label==='概念匹配')?segment.heading+'。'+segment.text:segment?.text||e.desc;
  results.push({...e,titlePhraseStart:Number(e.titleNorm.startsWith(query)),headingExact:Number(tier===4&&segment.headingNorm===query),path:e.path+(segment?.query?'?'+segment.query:''),anchor,tier,titleCoverage:coverage(e.titleNorm),descCoverage:coverage(e.descNorm),phraseMatch:Number(searchContains(segment?.norm||e.allNorm,query)),matchLabel:label,excerpt:siteSearchExcerpt(excerptText,terms),terms});
 }
 return results.sort((a,b)=>a.tier-b.tier||b.headingExact-a.headingExact||b.titlePhraseStart-a.titlePhraseStart||b.titleCoverage-a.titleCoverage||b.descCoverage-a.descCoverage||b.phraseMatch-a.phraseMatch||a.order-b.order);
}
function siteSearchHighlight(value,terms){
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=String(value),lower=text.toLowerCase(),hits=[];
 for(const term of terms){let at=searchFind(lower,term);while(at>=0){hits.push([at,at+term.length]);at=searchFind(lower,term,at+term.length);}}
 hits.sort((a,b)=>a[0]-b[0]||b[1]-a[1]);let cursor=0,html='';
 for(const[start,end]of hits){if(start<cursor)continue;html+=escape(text.slice(cursor,start))+'<mark>'+escape(text.slice(start,end))+'</mark>';cursor=end;}
 return html+escape(text.slice(cursor));
}
