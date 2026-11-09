/* Independent mask and weighted-mean oracles for the fixed native SDPA exercise. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const folder='dist/labs/prefix-attention',file=folder+'/prefix_attention.py';
const record=JSON.parse(fs.readFileSync(folder+'/validation.json','utf8'));
assert.equal(record.status,'passed');
assert.deepEqual(record.environment,{torch:'2.5.1',device:'cpu',dtype:'float64',backend:'SDPBackend.MATH'});
assert.deepEqual(record.source_sha256,{'prefix_attention.py':crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});

const keys=[0,1,2,3],visibility=rule=>keys.map(row=>keys.map(key=>rule(row,key)));
const causal=visibility((row,key)=>key<=row);
const prefix=visibility((row,key)=>row===0&&key===1||key<=row);
const shifted=visibility((row,key)=>key<=row+1);
assert.deepEqual(record.allowed,{causal,prefix,shifted});
const base=[2,6,10,14],newPrefix=[2,14,10,14],newSuffix=[2,6,10,30];
assert.deepEqual(record.values,{base,changed_prefix_position_1:newPrefix,changed_suffix_position_3:newSuffix});
const mean=(values,mask)=>mask.map(row=>{
 const read=values.filter((_,key)=>row[key]);
 return read.reduce((total,value)=>total+value,0)/read.length;
});
const expected={
 causal:mean(base,causal),prefix:mean(base,prefix),
 causal_after_prefix_change:mean(newPrefix,causal),prefix_after_prefix_change:mean(newPrefix,prefix),
 prefix_after_suffix_change:mean(newSuffix,prefix),shifted:mean(base,shifted),
 shifted_after_suffix_change:mean(newSuffix,shifted)
};
assert.deepEqual(Object.keys(record.output),Object.keys(expected));
for(const [name,values] of Object.entries(expected)){
 const actual=record.output[name];
 assert.equal(actual.length,values.length);
 values.forEach((value,index)=>assert(Math.abs(value-actual[index])<1e-12,name+' row '+index));
}
assert.deepEqual(record.stages,{prefill:[4,4],decode_position_2:[6],decode_position_3:[8],early_prefix_row_0:[2],split_vs_full_max_abs_error:0});
const svg=fs.readFileSync('dist/diagrams/prefix-attention-mask.svg','utf8');
assert.deepEqual(JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/)[1]),{prefix_length:2,causal,prefix});
const html=fs.readFileSync('dist/article/attention-mechanics/index.html','utf8');
for(const entry of ['id="prefix-attention-mask"','data-toc="prefix-attention-mask"','diagrams/prefix-attention-mask.svg',
 'labs/prefix-attention.zip','labs/prefix-attention/validation.json','python -B prefix_attention.py &gt; replay.json']){
 assert(html.includes(entry),entry);
}
cp.execFileSync('python3',['-B','-c',`
from pathlib import Path
from zipfile import ZipFile
folder = Path("dist/labs/prefix-attention")
with ZipFile(folder.with_suffix(".zip")) as archive:
    expected = {"README.md", "prefix_attention.py", "validation.json"}
    assert set(archive.namelist()) == {"prefix-attention/" + name for name in expected}
    for name in expected:
        assert archive.read("prefix-attention/" + name) == (folder / name).read_bytes()
`]);
if(process.env.INFRA_TORCH_PYTHON){
 const replay=JSON.parse(cp.execFileSync(process.env.INFRA_TORCH_PYTHON,['-B',file],{encoding:'utf8',timeout:45000}));
 replay.environment.torch=replay.environment.torch.split('+')[0];
 assert.deepEqual(replay,record);
}
console.log('PASS: native SDPA source and ZIP, independent mask/mean checks, forbidden future and premature-prefix counterexamples, exact chapter and diagram targets.');
