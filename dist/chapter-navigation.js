/* One outline for desktop, the no-JS fallback and the reading dialog.
   Only real visible prose headings are indexed; source blocks stay byte-for-byte. */
function chapterHeadingText(html){return String(html).replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);|&#(?:x[\da-f]+|\d+);/gi,value=>{
 const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&nbsp;':' '};
 if(named[value.toLowerCase()])return named[value.toLowerCase()];const code=value[2].toLowerCase()==='x'?parseInt(value.slice(3,-1),16):parseInt(value.slice(2,-1),10);return code<=0x10ffff?String.fromCodePoint(code):value;
}).replace(/\s+/g,' ').trim();}
function chapterHeadingKey(text){let hash=2166136261;for(const letter of text){hash^=letter.codePointAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36);}
function chapterNavigation(article){
 const reserved=new Set(article.sections.flatMap(s=>[...s[1].matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1])));
 const protectedTags=new Set(['pre','code','script','style','figure','details']);
 return article.sections.map(([title,body],index)=>{
  const children=[],stack=[];
  const html=body.replace(/<!--[\s\S]*?-->|<(h[34])\b([^>]*)>([\s\S]*?)<\/\1\s*>|<\/?[a-z][^>]*>/gi,(token,heading,attributes,content)=>{
   if(heading){
    if(stack.length)return token;const text=chapterHeadingText(content);if(!text)return token;
    const authored=attributes.match(/\bid=["']([^"']+)["']/i);
    let id=authored?.[1];
    if(!id){const stem='subsection-'+(index+1)+'-'+chapterHeadingKey(text);id=stem;let n=2;while(reserved.has(id))id=stem+'-'+n++;reserved.add(id);}
    children.push({id,title:text,level:Number(heading[1])});
    return authored?token:'<'+heading+attributes+' id="'+id+'">'+content+'</'+heading+'>';
   }
   const tag=token.match(/^<\s*(\/?)([a-z0-9]+)/i);if(tag&&protectedTags.has(tag[2].toLowerCase())){
    const name=tag[2].toLowerCase();if(tag[1]){const i=stack.lastIndexOf(name);if(i>=0)stack.splice(i,1);}else if(!/\/\s*>$/.test(token))stack.push(name);
   }
   return token;
  });
  return {title,html,id:'section-'+(index+1),children};
 });
}
function chapterContentsHTML(article,navigation=chapterNavigation(article)){
 const url=readingArticleURL(article.id),escape=trainingEscape;
 return navigation.map((s,index)=>'<div class="chapter-toc-section"><a data-toc="'+s.id+'" href="'+url+'#'+s.id+'">'+(index+1)+'. '+escape(s.title)+'</a>'+(s.children.length?'<div class="chapter-toc-children">'+s.children.map(h=>'<a class="chapter-toc-level-'+h.level+'" data-toc="'+escape(h.id)+'" href="'+url+'#'+encodeURIComponent(h.id)+'">'+escape(h.title)+'</a>').join('')+'</div>':'')+'</div>').join('');
}
