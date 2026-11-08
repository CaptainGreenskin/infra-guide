/* One continuous reading sequence for navigation, route location and shared capstones. Directory grouping stays by field. */
function chapterReadingContext(a){
 if(!a)return {track:'shared',ids:[],index:-1,previous:null,next:null,stage:''};
 for(const[track,stages]of Object.entries(courseReadingStages)){
  const ids=stages.flatMap(s=>s[1]),index=ids.indexOf(a.id);
  if(index>=0)return {track,ids,index,previous:articleById(ids[index-1]),next:articleById(ids[index+1]),stage:stages.find(s=>s[1].includes(a.id))[0]};
 }
 return {track:moduleFor(a.module).track,ids:[a.id],index:0,previous:null,next:null,stage:''};
}
function chapterReadingNav(a){
 const r=chapterReadingContext(a),label=trackDefinitions[r.track]?.label||'综合实战';
 return '<nav class="article-nav" aria-label="相邻文章"><p class="reading-sequence-label">按学习路线连续阅读 · '+label+'</p>'+
 (r.previous?'<a data-reading-direction="previous" href="'+articleURL(r.previous.id)+'"><small>← 上一篇</small>'+r.previous.number+' '+r.previous.title+'</a>':'<a href="/roadmap/?track='+r.track+'#route-'+r.track+'"><small>← 开始之前</small>本方向的整体路线</a>')+
 (r.next?'<a data-reading-direction="next" href="'+articleURL(r.next.id)+'"><small>下一篇 →</small>'+r.next.number+' '+r.next.title+'</a>':'<a href="/roadmap/?track='+r.track+'#synthesis-'+r.track+'"><small>串起整条主线 →</small>完成跨章推演</a>')+'</nav>';
}
