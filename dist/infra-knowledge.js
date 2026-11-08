/* Systematic reading surfaces for AI and Agent. Existing article URLs stay stable. */
const infraKnowledgeDomains=[];
const infraFieldCases={};
const infraDomain=id=>infraKnowledgeDomains.find(d=>d.module===id);
// Add reading spaces in prose while preserving code bytes, URLs and HTML attributes.
function infraReadableHTML(html){let codeDepth=0;return html.split(/(<[^>]+>)/g).map(part=>{if(part.startsWith('<')){if(/^<(?:pre|code)\b/i.test(part))codeDepth++;if(/^<\/(?:pre|code)\s*>/i.test(part))codeDepth=Math.max(0,codeDepth-1);return part;}return codeDepth?part:part.replace(/([\u3400-\u9fff])([A-Za-z0-9])/g,'$1 $2').replace(/([A-Za-z0-9])([\u3400-\u9fff])/g,'$1 $2');}).join('');}
function infraKnowledgePoint(p,i){return '<section class="knowledge-point" id="knowledge-'+p.id+'"><h2><span>'+String(i+1).padStart(2,'0')+'</span>'+p.title+'</h2><p>'+p.lead+'</p>'+p.body+'</section>';}
function infraKnowledgeTOC(d){return conceptTOCLink('/module/'+d.module+'/')+'<a href="/module/'+d.module+'/#concept-relations">核心概念关系图</a>'+d.points.map((p,i)=>'<a href="/module/'+d.module+'/#knowledge-'+p.id+'">'+(i+1)+'. '+p.title+'</a>').join('');}
function infraKnowledgePage(m){
 const d=infraDomain(m.id),track=trackDefinitions[m.track];
 document.title=m.name+' · '+track.label+' · InfraGuide';
 const fieldLinks=infraKnowledgeDomains.filter(x=>x.track===m.track).map(x=>'<a href="/module/'+x.module+'/">'+moduleFor(x.module).name+'</a>').join('');
 const toc=infraKnowledgeTOC(d);
 const mobile='<details class="mobile-contents"><summary>领域目录与本页知识点</summary><div class="mobile-field-links">'+fieldLinks+'</div>'+toc+'<a href="/module/'+m.id+'/#examples">代码实验与具体案例</a></details>';
 const references='<section class="knowledge-references"><h2>原始资料</h2><div>'+d.refs.map(k=>'<a href="'+sources[k][1]+'" target="_blank" rel="noopener">'+sources[k][0]+' ↗</a>').join('')+'</div></section>';
 $('#app').innerHTML=infraReadableHTML('<main class="doc-layout knowledge-layout" id="main" tabindex="-1">'+sidebar(m.id)+'<article class="article knowledge-article">'+breadcrumbs(m)+'<div class="eyebrow">'+track.label.toUpperCase()+' / 系统知识</div><h1>'+m.name+'</h1>'+readingToolbarHTML()+mobile+moduleConceptIntro(m)+'<div class="knowledge-body">'+explainFirstConceptTerms(d.points.map(infraKnowledgePoint).join(''),conceptSeen(moduleConceptPaths[m.id]))+'</div>'+fieldConceptMapHTML(m.id)+'<section class="knowledge-examples" id="examples"><h2>代码实验与具体案例</h2>'+(infraFieldCases[m.id]?.()||'')+'<h3>继续阅读机制详解</h3>'+articles.filter(a=>a.module===m.id).map(chapterLink).join('')+'</section>'+references+resourceRecommendations(m.id)+'<div class="knowledge-exit"><a href="/roadmap/?track='+m.track+'">学习顺序与过关任务 →</a><a href="/resources/#'+m.track+'">原始资料与课程 →</a></div></article><aside class="toc"><div class="toc-title">本领域知识点</div>'+toc+'<a href="/module/'+m.id+'/#examples">代码实验与案例</a></aside></main>'+footer());
}
function infraArticleKnowledge(a){const d=infraDomain(a.module);if(!d)return '';return '<p class="article-context-link"><a href="/module/'+d.module+'/">本领域系统知识：'+moduleFor(d.module).name+' →</a></p>';}

function infraSearchText(a){const d=infraDomain(a.module);return d?d.points.filter(p=>p.articles.includes(a.id)).map(p=>p.title+" "+p.lead+" "+p.body.replace(/<[^>]+>/g," ")).join(" "):"";}
