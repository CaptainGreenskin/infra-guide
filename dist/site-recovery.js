/* Keep full static reading usable when a later startup script fails. */
(()=>{
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const ready=()=>document.documentElement.hasAttribute?.('data-site-ready');
 function recover(){
  if(ready()||!document.body||document.getElementById('site-recovery'))return;
  const banner=document.createElement('aside');banner.id='site-recovery';banner.className='site-recovery';banner.setAttribute('role','status');
  const message=document.createElement('p');message.textContent='互动功能暂未载入，正文仍可阅读。重新载入后可使用目录、搜索和图解放大。';
  const retry=document.createElement('button');retry.type='button';retry.className='site-recovery-retry';retry.textContent='重新载入';retry.addEventListener('click',()=>location.reload());
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='site-recovery-dismiss';dismiss.textContent='继续阅读';dismiss.setAttribute('aria-label','关闭提示，继续阅读正文');dismiss.addEventListener('click',()=>banner.remove());
  banner.append(message,retry,dismiss);document.body.append(banner);retry.focus({preventScroll:true});
 }
 document.addEventListener('DOMContentLoaded',recover,{once:true});
 window.addEventListener('infra-ready',()=>document.getElementById('site-recovery')?.remove());
})();
