'use strict';
const crypto=require('node:crypto');

const ROUTE_BUCKETS=64;
const SHARD_BYTES=100_000;

function routingGrams(term){
 const width=Math.min(3,term.length);
 if(!width)return [];
 const last=term.length-width;
 return [...new Set([0,Math.floor(last/2),last].map(i=>term.slice(i,i+width)))];
}

function routingBucket(gram,count){
 let hash=2166136261;
 for(let i=0;i<gram.length;i++)hash=Math.imul(hash^gram.charCodeAt(i),16777619);
 return (hash>>>0)%count;
}

function restoreSearchEntry(packed){
 const {segments:packedSegments,order,...entry}=packed;
 const titleText=searchPlainText(entry.title);
 const titleNorm=normalizeSearchText(titleText);
 const descNorm=normalizeSearchText(entry.desc+' '+(entry.tags||[]).join(' '));
 const segments=packedSegments.map(({proseNorm,...segment})=>({
  ...segment,
  proseNorm:proseNorm??normalizeSearchText(segment.text),
  norm:normalizeSearchText(segment.heading+' '+segment.text),
  headingNorm:normalizeSearchText(segment.heading),
  conceptNorm:normalizeSearchText(segment.conceptTitle||'')
 }));
 const allNorm=[titleNorm,descNorm,...segments.map(segment=>segment.norm)].join(' ');
 return {...entry,titleText,titleNorm,descNorm,segments,allNorm,order};
}

function packSearchEntry(entry,normalizeSearchText){
 const {titleText,titleNorm,descNorm,segments,allNorm,order,...fields}=entry;
 return {...fields,segments:segments.map(({norm,headingNorm,conceptNorm,proseNorm,...segment})=>{
  if(proseNorm===normalizeSearchText(segment.text))return segment;
  return {...segment,proseNorm};
 }),order};
}

function shardEntries(index,normalizeSearchText){
 const modules=new Map();
 for(const entry of index){
  if(!modules.has(entry.module))modules.set(entry.module,[]);
  modules.get(entry.module).push(entry);
 }
 const shards=[];
 for(const entries of modules.values()){
  let group={entries:[],rows:[]},bytes=2;
  for(const entry of entries){
   const row=packSearchEntry(entry,normalizeSearchText);
   const size=Buffer.byteLength(JSON.stringify(row));
   if(group.rows.length&&bytes+1+size>SHARD_BYTES){
    shards.push(group);
    group={entries:[],rows:[]};bytes=2;
   }
   bytes+=size+(group.rows.length?1:0);
   group.entries.push(entry);group.rows.push(row);
  }
  if(group.rows.length)shards.push(group);
 }
 return shards;
}

function shardGrams(entries){
 const words=new Set();
 for(const entry of entries)for(const word of entry.allNorm.split(' '))if(word)words.add(word);
 const grams=new Set();
 for(const word of words){
  for(let i=0;i<word.length;i++){
   for(let n=1;n<=3&&i+n<=word.length;n++)grams.add(word.slice(i,i+n));
  }
 }
 return grams;
}

function buildSearchData({index,normalizeSearchText,asset,version,suggestions}){
 const shards=shardEntries(index,normalizeSearchText);
 const buckets=Array.from({length:ROUTE_BUCKETS},()=>new Map());
 function leaf(kind,rows){
  const json=JSON.stringify(rows);
  const token=crypto.createHash('sha256').update(json).digest('hex').slice(0,16);
  const body=JSON.stringify({schema:2,kind,token,rows});
  return {...asset('search-'+kind,'json',body),token};
 }
 const shardAssets=shards.map(({entries,rows},ordinal)=>{
  for(const gram of shardGrams(entries)){
   const bucket=buckets[routingBucket(gram,ROUTE_BUCKETS)];
   if(!bucket.has(gram))bucket.set(gram,[]);
   bucket.get(gram).push(ordinal);
  }
  return leaf('entries',rows);
 });
 const routeAssets=buckets.map(bucket=>leaf('routes',[...bucket.keys()].sort().map(gram=>[gram,bucket.get(gram)])));
 const descriptor=({url,sha256,token})=>({url,sha256,token});
 const catalog={schema:2,kind:'catalog',staticReadingVersion:version,
                routes:routeAssets.map(descriptor),shards:shardAssets.map(descriptor)};
 const catalogAsset=asset('search-catalog','json',JSON.stringify(catalog));
 return {catalogAsset,routeAssets,shardAssets,suggestions,knowledgeCount:index.filter(e=>e.type==='knowledge').length};
}

module.exports={buildSearchData,routingGrams,routingBucket,restoreSearchEntry};
