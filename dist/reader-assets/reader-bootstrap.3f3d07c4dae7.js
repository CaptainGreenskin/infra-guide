(function(){
 'use strict';
 const version="03e0be6430d48019acbcf1b2c21531ec3a0d63cc2c97147c9652d1df90c28a0e",articleIds=["linux-resource","virtual-memory-oom","concurrency-pools","distributed-systems","cloud-overview","cloud-compute","vpc-network","network-diagnosis","tcp-event-loop","training-storage","database-index-locks","cache-consistency","storage-recovery","mysql-recovery","mysql-replication","container-runtime","kubernetes-basics","k8s-workloads","scheduling-resources","k8s-networking","k8s-storage","config-secrets","k8s-autoscaling","control-plane-consensus","serverless-execution","message-delivery","delivery","terraform-state","gitops-reconciliation","iam-security","elasticity","slo","observability","incident","resilience","transformer-model","tokenization-embedding","attention-mechanics","transformer-block","position-encoding","autograd-training","gpu-execution","roofline-model","flash-attention-io","tensor-parallel-math","operator-profiling","gpu-cluster","distributed-training","gpu-memory","ddp-code","training-communication","data-pipeline","multinode-lab","checkpoint-recovery","training-performance","training-platform","gpu-scheduling","kubernetes-training","model-serving","quantization-serving","inference-performance","ai-lifecycle","moe-routing","speculative-decoding","agent-runtime","mcp-protocol","agent-security","agent-sandbox","agent-recovery","agent-memory","agent-evaluation","durable-workflows","agent-retrieval","agent-observability","kairo-practice","training-lab","cloud-service-lab","production-readiness"],runtimeURL="/reader-assets/reader-runtime.b179369fe2ae.js";
 const base=document.querySelector('base')?.getAttribute('href')||'/';
 const hosted=value=>base==='/'?value:base.replace(/\/$/,'')+value;
 const pathname=base==='/'?location.pathname:location.pathname.startsWith(base)?'/'+location.pathname.slice(base.length):location.pathname;
 let mode='pending';
 function failed(reason){
  document.documentElement.setAttribute('data-reader-fallback',reason);
  if(document.getElementById('site-recovery'))return;
  const banner=document.createElement('aside');banner.id='site-recovery';banner.className='site-recovery';banner.setAttribute('role','status');
  const message=document.createElement('p');message.textContent='阅读控件加载失败，正文仍可阅读。请重新载入重试。';
  const retry=document.createElement('button');retry.type='button';retry.className='site-recovery-retry';retry.textContent='重新载入';retry.onclick=()=>location.reload();
  banner.append(message,retry);document.body.append(banner);
 }
 function full(reason){
  if(mode==='full')return;mode='full';
  document.documentElement.removeAttribute('data-site-ready');
  document.documentElement.setAttribute('data-reader-runtime','full');
  document.documentElement.setAttribute('data-reader-fallback',reason);
  const template=document.querySelector('#reader-full-runtime');
  const scripts=[...(template?.content?.querySelectorAll('script[src]')||[])];
  if(scripts.length!==9){failed('完整阅读控件清单缺失，请重新载入重试。');return;}
  (async()=>{for(const original of scripts)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=original.getAttribute('src');script.async=false;script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});})().catch(()=>{
   failed('完整阅读控件加载失败，请重新载入重试。');
  });
 }
 window.addEventListener('reader-full-runtime',event=>full(event.detail?.reason||'explicit runtime fallback'));
 const app=document.querySelector('#app'),id=pathname.match(/^\/article\/([a-z0-9-]+)\/$/)?.[1];
 const reason=!id?'noncanonical article route or alias':!articleIds.includes(id)?'unknown article':app?.getAttribute('data-static-path')!==pathname?'static path mismatch':app.getAttribute('data-static-version')!==version?'static version mismatch':app.getAttribute('data-static-article')!==id?'static article mismatch':!document.querySelector('.doc-layout .article')?'missing static article':document.querySelector('[data-field-map]')?'unsupported article field map':null;
 if(reason){full(reason);return;}
 mode='light';
 const script=document.createElement('script');script.src=hosted(runtimeURL);script.onerror=()=>full('light runtime asset failed');document.head.appendChild(script);
})();
