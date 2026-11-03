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
function initSystemInteractive(){
 const slo=document.getElementById('slo-demo');
 if(slo){slo.innerHTML='<div class="interactive"><div class="demo-title">错误预算计算器 <span>同一统计窗口 · 示例数据</span></div><div class="calc-fields"><label>总事件数<input id="slo-total" type="number" min="0" step="1" value="1000"></label><label>好事件数<input id="slo-good" type="number" min="0" step="1" value="989"></label><label>SLO目标（%）<input id="slo-target" type="number" min="0.001" max="99.999" step="0.01" value="99"></label></div><div class="calc-result" aria-live="polite"></div></div>';
 const calculate=()=>{const raw=['slo-total','slo-good','slo-target'].map(id=>document.getElementById(id).value);const r=raw.some(x=>x.trim()==='')?{error:'请填写全部字段。'}:sloCalculation(...raw.map(Number));slo.querySelector('.calc-result').innerHTML=r.error?'<p class="calc-error">'+r.error+'</p>':r.empty?'<p class="demo-caption">无数据：总事件数为0，不能声称100%可靠。</p>':`<div class="calc-output"><div><strong>${r.success.toFixed(2)}%</strong><small>全局好事件比例</small></div><div><strong>${r.remaining.toFixed(2)}</strong><small>剩余坏事件预算</small></div><div><strong>${r.burn.toFixed(2)}×</strong><small>预算消耗率</small></div></div>`};slo.querySelectorAll('input').forEach(i=>i.addEventListener('input',calculate));calculate();}
 const kv=document.getElementById('kv-demo');
 if(kv){const fields=[['layers','层数',32],['heads','KV头数',8],['dimension','头维度',128],['bytes','元素字节数',2],['tokens','每请求保留token',4096],['requests','并发请求',16]];kv.innerHTML='<div class="interactive"><div class="demo-title">KV逻辑容量计算器 <span>不含权重、工作区或分页开销</span></div><div class="calc-fields">'+fields.map(([id,label,value])=>`<label>${label}<input id="kv-${id}" type="number" min="1" max="1000000" step="1" value="${value}"></label>`).join('')+'</div><div class="calc-result" aria-live="polite"></div><p class="demo-caption">常规稠密注意力、各层维度一致、无跨请求共享。结果是逻辑总量，不是多卡情况下的每卡实测。</p></div>';
 const calculate=()=>{const r=kvCalculation(...fields.map(([id])=>Number(document.getElementById('kv-'+id).value)));kv.querySelector('.calc-result').innerHTML=r.error?'<p class="calc-error">'+r.error+'</p>':`<div class="calc-output"><div><strong>${(r.perToken/1024).toFixed(1)}</strong><small>KiB / token</small></div><div><strong>${r.perRequestGiB.toFixed(3)}</strong><small>GiB / 请求</small></div><div><strong>${r.totalGiB.toFixed(3)}</strong><small>GiB / 总逻辑KV</small></div></div>`};kv.querySelectorAll('input').forEach(i=>i.addEventListener('input',calculate));calculate();}
}
