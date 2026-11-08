function releaseReader(){
 readerAbort.abort();comfortAbort?.abort();
 for(const selector of ['#search-open','#search-close','#theme','#mobile-menu','.skip']){const node=$(selector);if(node)node.onclick=null;}
}
function requestFullRuntime(reason){releaseReader();window.dispatchEvent(new CustomEvent('reader-full-runtime',{detail:{reason}}));}
listen(window,'reader-full-runtime',releaseReader);
try{
 if('scrollRestoration' in history)history.scrollRestoration='auto';
 if(followCourseRedirect())return;
 if(location.hash.startsWith('#/')){location.replace(publicRoute(location.hash));return;}
 if(!hydrateStaticArticle()){requestFullRuntime('static hydration identity rejected');return;}
 bindApplicationEvents();
 listen(window,'hashchange',()=>{if(followCourseRedirect())return;if(location.hash.startsWith('#/'))location.replace(publicRoute(location.hash));else restoreDocumentFragment();});
 document.documentElement.setAttribute('data-reader-runtime','light');
 document.documentElement.setAttribute('data-site-ready','true');
 window.dispatchEvent(new Event('infra-ready'));
}catch(error){requestFullRuntime('light runtime exception: '+error.message);}
