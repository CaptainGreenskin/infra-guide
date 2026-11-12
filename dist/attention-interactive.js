function attentionExample(position,causal,changeFuture){
 const {queries,keys,values}=attentionValidation.report.attention;
 const query=queries[position],count=causal?position+1:keys.length;
 const scores=keys.slice(0,count).map(key=>query.reduce((sum,x,i)=>sum+x*key[i],0)/Math.sqrt(query.length));
 const exps=scores.map(x=>Math.exp(x-Math.max(...scores))),denominator=exps.reduce((x,y)=>x+y,0);
 const weights=exps.map(x=>x/denominator).concat(Array(keys.length-count).fill(0));
 const adjusted=values.map((v,i)=>changeFuture&&i===3?[999,-999]:v);
 return {weights,output:values[0].map((_,j)=>weights.reduce((sum,p,i)=>sum+p*adjusted[i][j],0))};
}
function attentionDemoHTML(){
 const {queries,keys,values}=attentionValidation.report.attention;
 const vector=items=>'['+items.join(', ').replaceAll('-','−')+']';
 const output=(position,causal,change)=>vector(attentionExample(position,causal,change).output.map(value=>value.toFixed(3)));
 return '<details class="progressive-detail"><summary>四位置实验 · 改一项值，再切换因果掩码</summary>'+
  '<div id="attention-demo" data-attention-demo tabindex="-1">'+
  '<p>另取四个位置的固定向量。先选查询位置 0，保持 Q、K 不变，只把位置 3 的 V 从 [5, −5] 改为 [999, −999]。掩码开启时位置 0 读不到位置 3，关掉后再比较两次输出。</p>'+
  table(['位置','查询 Q','键 K','值 V'],queries.map((query,i)=>[String(i),vector(query),vector(keys[i]),vector(values[i])]))+
  '<div data-attention-live></div>'+
  '<details class="progressive-detail"><summary>查看四个位置的结果对照</summary>'+
  '<p>每次只改变位置 3 的 V。输出保留三位小数。</p>'+
  table(['查询位置','因果掩码','原值时的输出','改值后的输出'],queries.flatMap((_,i)=>[true,false].map(causal=>[
   String(i),causal?'开启':'关闭',output(i,causal,false),output(i,causal,true)
  ])))+'</details>'+
  '<p class="practice-links"><a href="/labs/attention/validation.json">查看固定向量与 Python 验证记录 →</a></p></div></details>';
}
function initAttentionDemo(){
 const root=document.querySelector('[data-attention-demo]'),panel=root?.querySelector('[data-attention-live]');
 if(!panel||panel.firstElementChild)return;
 let position=0;
 const {queries}=attentionValidation.report.attention;
 panel.innerHTML=`<div class="interactive">
  <div class="segmented" role="group" aria-label="选择查询位置">${queries.map((_,i)=>`<button type="button" data-position="${i}">位置 ${i}</button>`).join('')}</div>
  <div class="attention-controls"><label><input type="checkbox" data-causal checked> 使用因果掩码</label><label><input type="checkbox" data-future> 把位置 3 的 V 改为 [999, −999]</label></div>
  <div class="attention-weights"></div>
  <p class="attention-output" aria-live="polite"></p>
 </div>`;
 const buttons=[...panel.querySelectorAll('[data-position]')];
 const causal=panel.querySelector('[data-causal]'),future=panel.querySelector('[data-future]');
 const weights=panel.querySelector('.attention-weights'),output=panel.querySelector('.attention-output');
 function update(){
  const useMask=causal.checked;
  const result=attentionExample(position,useMask,future.checked);
  buttons.forEach((button,i)=>{
   const selected=i===position;
   button.classList.toggle('active',selected);
   button.setAttribute('aria-pressed',String(selected));
  });
  weights.innerHTML=result.weights.map((weight,i)=>{
   const masked=useMask&&i>position;
   return `<div class="${masked?'masked':''}"><small>位置 ${i}</small><b>${(weight*100).toFixed(1)}%</b><span>${masked?'屏蔽':'参与加权'}</span></div>`;
  }).join('');
  output.textContent=`位置 ${position} 的输出向量 [${result.output.map(value=>value.toFixed(3)).join(', ').replaceAll('-','−')}]`;
 }
 buttons.forEach((button,i)=>button.onclick=()=>{position=i;update();});
 causal.onchange=update;
 future.onchange=update;
 update();
}
