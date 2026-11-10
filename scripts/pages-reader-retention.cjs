/* Compact only the deploy copy. The repository keeps the immutable archive. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const manifestPath='dist/reader-runtime-manifest.json';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

module.exports=function retainedReaderFiles(root,livePath=process.env.PAGES_LIVE_READER_MANIFEST){
 if(!livePath)return null;
 const live=fs.readFileSync(livePath),current=fs.readFileSync(path.join(root,manifestPath));
 const recent=new Map([[hash(current),current]]);
 const commits=execFileSync('git',['log','--format=%H','HEAD','--',manifestPath],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 let liveKnown=live.equals(current);
 for(const commit of commits){
  const bytes=execFileSync('git',['show',commit+':'+manifestPath],{cwd:root});
  if(recent.size<4)recent.set(hash(bytes),bytes);
  if(live.equals(bytes))liveKnown=true;
  if(liveKnown&&recent.size===4)break;
 }
 if(!liveKnown){
  console.warn('Live Pages reader manifest is absent from the checked-out history. Keeping the full reader archive.');
  return null;
 }
 recent.set(hash(live),live);
 const retained=new Set();
 for(const bytes of recent.values()){
  const manifest=JSON.parse(bytes);
  if(manifest.schema!==1||!Array.isArray(manifest.assets)||!manifest.assets.length)throw Error('Invalid reader manifest');
  for(const asset of manifest.assets){
   const fingerprint=asset.file?.match(/^reader-assets\/[a-z0-9-]+\.([a-f0-9]{12})\.(?:js|json)$/)?.[1];
   if(!fingerprint||asset.url!=='/'+asset.file||asset.sha256?.slice(0,12)!==fingerprint)throw Error('Invalid immutable reader asset: '+asset.file);
   const source=fs.readFileSync(path.join(root,'dist',asset.file));
   if(source.length!==asset.bytes||hash(source)!==asset.sha256)throw Error('Incorrect immutable reader asset: '+asset.file);
   retained.add(path.basename(asset.file));
  }
 }
 for(const file of fs.readdirSync(path.join(root,'dist','reader-assets'))){
  if(/^reader-bootstrap\.[a-f0-9]{12}\.js$/.test(file))retained.add(file);
 }
 return retained;
};
