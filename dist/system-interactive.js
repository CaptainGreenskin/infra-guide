function sloCalculation(total,good,target){
 if(!Number.isSafeInteger(total)||!Number.isSafeInteger(good)||total<0||good<0||good>total||!Number.isFinite(target)||target<=0||target>=100)return {error:'请输入有效整数事件数，且好事件不超过总数；目标需大于0%且小于100%。'};
 if(total===0)return {empty:true};
 const allowed=total*(1-target/100),bad=total-good;
 return {success:good/total*100,remaining:allowed-bad,burn:bad/allowed};
}
function kvCalculation(layers,heads,dimension,bytes,tokens,requests){
 const values=[layers,heads,dimension,bytes,tokens,requests];
 if(values.some(v=>!Number.isSafeInteger(v)||v<1||v>1000000))return {error:'请输入1到1000000之间的正整数；这是未分片的逻辑容量估算。'};
 const perToken=2*layers*heads*dimension*bytes,total=perToken*tokens*requests;
 if(!Number.isSafeInteger(total))return {error:'输入组合过大，超出精确整数计算范围。请缩小参数。'};
 return {perToken,perRequestGiB:perToken*tokens/2**30,totalGiB:total/2**30};
}
function sinusoidalPositionPair(width,pair,position){
 const frequency=10000**(-2*pair/width),angle=position*frequency;
 return {frequency,angle,sine:Math.sin(angle),cosine:Math.cos(angle)};
}
function sinusoidalPositionGraphic(width,pair,position){
 const left=45,right=429,top=22,mid=79,bottom=136,band=182,rowHeight=13;
 const x=p=>left+12*p,y=value=>mid-57*value;
 const columns=Array.from({length:33},(_,p)=>
  Array.from({length:width/2},(_,i)=>sinusoidalPositionPair(width,i,p)));
 const curve=key=>columns.map((values,p)=>x(p)+','+y(values[pair][key]).toFixed(2)).join(' ');
 const cells=columns.map((values,p)=>values.flatMap(({sine,cosine})=>[sine,cosine]).map((value,d)=>
  '<rect x="'+(x(p)-6)+'" y="'+(band+d*rowHeight)+'" width="12" height="'+rowHeight+'" class="pe-cell '+(value<0?'pe-negative':'pe-positive')+'" fill-opacity="'+Math.abs(value).toFixed(4)+'"/>').join('')).join('');
 const matrixBottom=band+width*rowHeight;
 const current=columns[position][pair],marker=x(position);
 return `<svg class="pe-plot" viewBox="0 0 452 ${matrixBottom+29}" role="img" aria-label="宽度 ${width}，第 ${pair} 对特征在位置 0 到 32 的曲线与编码矩阵。标出位置 ${position}。">
  <rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" class="pe-plot-surface"/>
  <path d="M${left} ${top}H${right}M${left} ${mid}H${right}M${left} ${bottom}H${right}" class="pe-grid"/>
  <text x="34" y="${top+5}" text-anchor="end">1</text><text x="34" y="${mid+5}" text-anchor="end">0</text><text x="34" y="${bottom+5}" text-anchor="end">−1</text>
  <polyline points="${curve('sine')}" class="pe-sine-line"/><polyline points="${curve('cosine')}" class="pe-cosine-line"/>
  <text x="${left-6}" y="166">编码矩阵</text><text x="${right+6}" y="166" text-anchor="end">一列对应一个位置</text>
  <rect x="${left-6}" y="${band}" width="396" height="${width*rowHeight}" class="pe-matrix-surface"/>
  ${cells}
  <rect x="${left-6}" y="${band+pair*2*rowHeight}" width="396" height="${2*rowHeight}" class="pe-pair-outline"/>
  <text x="32" y="${band+pair*2*rowHeight+11}" text-anchor="end">${2*pair}</text>
  <text x="32" y="${band+(pair*2+1)*rowHeight+11}" text-anchor="end">${2*pair+1}</text>
  <path d="M${marker} ${top}V${bottom}M${marker} ${band-6}V${matrixBottom+3}" class="pe-position-line"/>
  <circle cx="${marker}" cy="${y(current.sine)}" r="4.6" class="pe-sine-point"/><circle cx="${marker}" cy="${y(current.cosine)}" r="4.6" class="pe-cosine-point"/>
  ${[0,8,16,24,32].map(p=>`<text x="${x(p)}" y="${matrixBottom+21}" text-anchor="middle">${p}</text>`).join('')}
 </svg>`;
}
function sinusoidalPositionReading(width,pair,position){
 const {frequency,angle,sine,cosine}=sinusoidalPositionPair(width,pair,position);
 return `<span><b>p = ${position}</b> · 维度 ${2*pair} 和 ${2*pair+1}</span>
  <span>每格转 ${Number(frequency.toPrecision(5))} 弧度 · 相位 ${Number(angle.toPrecision(5))} 弧度</span>
  <span>[sin, cos] = <b>[${sine.toFixed(4)}, ${cosine.toFixed(4)}]</b></span>
  <span>连续周期约 ${(2*Math.PI/frequency).toFixed(3)} 个位置单位</span>`;
}
function sinusoidalPositionOptions(width){
 return Array.from({length:width/2},(_,i)=>'<option value="'+i+'">第 '+i+' 对 · '+2*i+' / '+(2*i+1)+'</option>').join('');
}
function sinusoidalPositionDemoHTML(){
 return `<div class="position-lab" id="sinusoidal-position-demo">
  <fieldset class="pe-controls" disabled>
   <legend class="sr-only">正弦位置编码参数</legend>
   <label>特征宽度 D<select data-pe-width><option value="4">4</option><option value="8">8</option></select></label>
   <label>特征对 i<select data-pe-pair>${sinusoidalPositionOptions(4)}</select></label>
   <label>位置 p<input data-pe-position type="range" min="0" max="32" step="1" value="1"></label>
  </fieldset>
  <div class="pe-curve-key" aria-hidden="true"><span class="pe-key-sine">sin · 偶数维</span><span class="pe-key-cosine">cos · 奇数维</span><span>横轴为位置 p</span></div>
  <div data-pe-chart>${sinusoidalPositionGraphic(4,0,1)}</div>
  <p class="pe-matrix-key"><span class="pe-key-negative">负值</span><span>浅色接近 0</span><span class="pe-key-positive">正值</span></p>
  <div class="pe-reading" data-pe-reading role="status" aria-live="polite" aria-atomic="true">${sinusoidalPositionReading(4,0,1)}</div>
  <noscript><p class="pe-matrix-key">图中显示默认示例 D=4、i=0、p=1。开启 JavaScript 可切换参数。</p></noscript>
 </div>`;
}
function initSinusoidalPositionDemo(){
 const demo=document.getElementById('sinusoidal-position-demo');
 if(!demo)return;
 const width=demo.querySelector('[data-pe-width]'),pair=demo.querySelector('[data-pe-pair]');
 const position=demo.querySelector('[data-pe-position]'),chart=demo.querySelector('[data-pe-chart]');
 const reading=demo.querySelector('[data-pe-reading]');
 const draw=()=>{
  const dimension=width.value==='8'?8:4;
  const selected=Math.min(Number(pair.value)||0,dimension/2-1);
  const p=Number(position.value);
  if(pair.options.length!==dimension/2){
   pair.innerHTML=sinusoidalPositionOptions(dimension);
   pair.value=String(selected);
  }
  chart.innerHTML=sinusoidalPositionGraphic(dimension,selected,p);
  reading.innerHTML=sinusoidalPositionReading(dimension,selected,p);
 };
 width.onchange=pair.onchange=position.oninput=draw;
 demo.querySelector('fieldset').disabled=false;
 draw();
}
function initSystemInteractive(){
 initSinusoidalPositionDemo();
 const slo=document.getElementById('slo-demo');
 if(slo){slo.innerHTML='<div class="interactive"><div class="demo-title">错误预算计算器 <span>同一统计窗口 · 示例数据</span></div><div class="calc-fields"><label>总事件数<input id="slo-total" type="number" min="0" step="1" value="1000"></label><label>好事件数<input id="slo-good" type="number" min="0" step="1" value="989"></label><label>SLO目标（%）<input id="slo-target" type="number" min="0.001" max="99.999" step="0.01" value="99"></label></div><div class="calc-result" aria-live="polite"></div></div>';
 const calculate=()=>{const raw=['slo-total','slo-good','slo-target'].map(id=>document.getElementById(id).value);const r=raw.some(x=>x.trim()==='')?{error:'请填写全部字段。'}:sloCalculation(...raw.map(Number));slo.querySelector('.calc-result').innerHTML=r.error?'<p class="calc-error">'+r.error+'</p>':r.empty?'<p class="demo-caption">无数据：总事件数为0，不能声称100%可靠。</p>':`<div class="calc-output"><div><strong>${r.success.toFixed(2)}%</strong><small>全局好事件比例</small></div><div><strong>${r.remaining.toFixed(2)}</strong><small>剩余坏事件预算</small></div><div><strong>${r.burn.toFixed(2)}×</strong><small>预算消耗率</small></div></div>`};slo.querySelectorAll('input').forEach(i=>i.addEventListener('input',calculate));calculate();}
 const kv=document.getElementById('kv-demo');
 if(kv){const fields=[['layers','层数',32],['heads','KV头数',8],['dimension','头维度',128],['bytes','元素字节数',2],['tokens','每请求保留token',4096],['requests','并发请求',16]];kv.innerHTML='<div class="interactive"><div class="demo-title">KV逻辑容量计算器 <span>不含权重、工作区或分页开销</span></div><div class="calc-fields">'+fields.map(([id,label,value])=>`<label>${label}<input id="kv-${id}" type="number" min="1" max="1000000" step="1" value="${value}"></label>`).join('')+'</div><div class="calc-result" aria-live="polite"></div><p class="demo-caption">常规稠密注意力、各层维度一致、无跨请求共享。结果是逻辑总量，不是多卡情况下的每卡实测。</p></div>';
 const calculate=()=>{const r=kvCalculation(...fields.map(([id])=>Number(document.getElementById('kv-'+id).value)));kv.querySelector('.calc-result').innerHTML=r.error?'<p class="calc-error">'+r.error+'</p>':`<div class="calc-output"><div><strong>${(r.perToken/1024).toFixed(1)}</strong><small>KiB / token</small></div><div><strong>${r.perRequestGiB.toFixed(3)}</strong><small>GiB / 请求</small></div><div><strong>${r.totalGiB.toFixed(3)}</strong><small>GiB / 总逻辑KV</small></div></div>`};kv.querySelectorAll('input').forEach(i=>i.addEventListener('input',calculate));calculate();}
}
