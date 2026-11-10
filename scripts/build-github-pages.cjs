/* Keep root-host dist intact; emit an independent project-Pages artifact. */
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist'),readerDirectory=path.join(dist,'reader-assets');
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const base=arg('--base-path')||'/infra-guide/';
const origin=new URL(arg('--origin')||'https://captaingreenskin.github.io').origin;
if(!/^\/[A-Za-z0-9_-]+\/$/.test(base)&&base!=='/')throw Error('Use a root or single repository base path.');
if(new URL(origin).protocol!=='https:')throw Error('Pages origin must use HTTPS.');
const output=path.join(root,'.pages',base==='/'?'root':base.slice(1,-1));
const retained=require('./pages-reader-retention.cjs')(root);
fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
fs.cpSync(dist,output,{recursive:true,filter:source=>!retained||path.dirname(source)!==readerDirectory||retained.has(path.basename(source))});
const oldOrigin='https://cloud-infra-guide-llh.tautagave4.chatgpt.site',newOrigin=origin+base.replace(/\/$/,'');
function rewrite(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){
 if(directory===output&&item.name==='reader-assets')continue; // Immutable reader bytes must never be rewritten.
 const file=path.join(directory,item.name);if(item.isDirectory()){rewrite(file);continue;}
 if(!/\.(html|js|xml|txt)$/.test(item.name))continue;
 let text=fs.readFileSync(file,'utf8').replaceAll(oldOrigin,newOrigin);
 if(item.name.endsWith('.html'))text=text.replace(/(href|src)="\/(?!\/)([^"]*)"/g,(_,attr,rest)=>attr+'="'+base+rest+'"');
 fs.writeFileSync(file,text);
}}
rewrite(output);
const crypto=require('crypto');
function refreshHashes(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory()){refreshHashes(file);continue;}if(item.name.endsWith('.html')){const html=fs.readFileSync(file,'utf8').replace(/((?:src|href)=")(?:([A-Za-z0-9_-]+\.(?:js|css)))\?v=[a-f0-9]{12}"/g,(_,prefix,name)=>prefix+name+'?v='+crypto.createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex').slice(0,12)+'"');fs.writeFileSync(file,html);}}}
refreshHashes(output);
fs.writeFileSync(path.join(output,'.nojekyll'),'');
console.log('Built GitHub Pages artifact: '+output+(retained?' ('+retained.size+' compatible reader assets)':''));
