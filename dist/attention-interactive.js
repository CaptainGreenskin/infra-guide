function attentionExample(position,causal,changeFuture){
 const {queries,keys,values}=attentionValidation.report.attention;
 const query=queries[position],count=causal?position+1:keys.length;
 const scores=keys.slice(0,count).map(key=>query.reduce((sum,x,i)=>sum+x*key[i],0)/Math.sqrt(query.length));
 const exps=scores.map(x=>Math.exp(x-Math.max(...scores))),denominator=exps.reduce((x,y)=>x+y,0);
 const weights=exps.map(x=>x/denominator).concat(Array(keys.length-count).fill(0));
 const adjusted=values.map((v,i)=>changeFuture&&i===3?[999,-999]:v);
 return {weights,output:values[0].map((_,j)=>weights.reduce((sum,p,i)=>sum+p*adjusted[i][j],0))};
}
function initAttentionDemo(){const root=document.getElementById('attention-demo');if(!root)return;let position=0,causal=true,change=false;
 const render=()=>{const r=attentionExample(position,causal,change);root.innerHTML=`<div class="interactive"><div class="demo-title">选一个query位置，观察它能读取谁<span>固定向量的数学演示 · 不是模型生成</span></div><div class="segmented">${[0,1,2,3].map(i=>`<button data-position="${i}" class="${i===position?'active':''}" aria-pressed="${i===position}">位置 ${i}</button>`).join('')}</div><div class="attention-controls"><label><input type="checkbox" data-causal ${causal?'checked':''}> 使用因果mask</label><label><input type="checkbox" data-future ${change?'checked':''}> 将位置3的V改为[999, −999]</label></div><div class="attention-weights">${r.weights.map((w,i)=>`<div class="${causal&&i>position?'masked':''}"><small>KEY / VALUE ${i}</small><b>${(w*100).toFixed(1)}%</b><span>${causal&&i>position?'未来位置 · 被屏蔽':'参与加权'}</span></div>`).join('')}</div><p class="attention-output" aria-live="polite">位置${position}的输出向量：[${r.output.map(x=>x.toFixed(3)).join(', ')}]</p><p class="demo-caption">先保持位置0与因果mask，修改未来V：输出仍为[10, 0]。再移除mask，观察未来信息如何影响过去。</p></div>`;root.querySelectorAll('[data-position]').forEach(b=>b.onclick=()=>{position=Number(b.dataset.position);render()});root.querySelector('[data-causal]').onchange=e=>{causal=e.target.checked;render()};root.querySelector('[data-future]').onchange=e=>{change=e.target.checked;render()}};render();}
