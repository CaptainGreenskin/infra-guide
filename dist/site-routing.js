// The same source runs at / on the existing host and /infra-guide/ on Pages.
const infraBasePath=typeof document!=='undefined'?(document.querySelector('base')?.getAttribute('href')||'/'):'/';
function hostedPath(value){if(infraBasePath==='/'||!value.startsWith('/')||value.startsWith('//'))return value;const prefix=infraBasePath.replace(/\/$/,'');return value===prefix||value.startsWith(prefix+'/')?value:prefix+value;}
function documentPathname(){const path=location.pathname;if(infraBasePath==='/')return path;const prefix=infraBasePath.replace(/\/$/,'');return path===prefix?'/':path.startsWith(prefix+'/')?path.slice(prefix.length):path;}
