/* Real-SDK record binding plus independent message, source and cleanup oracles.
   Set INFRA_MCP_PYTHON to rerun the pinned SDK; plain CI does not install it. */
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const folder='dist/labs/mcp-protocol/',record=JSON.parse(fs.readFileSync(folder+'validation.json'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const source=JSON.parse(fs.readFileSync(folder+'orders.json'));
const fields=['task_id','version','batch_ids','values','total'];
const outgoing=connection=>connection.trace.filter(row=>row.direction==='client_to_server').map(row=>row.message);
const incoming=connection=>connection.trace.filter(row=>row.direction==='server_to_client').map(row=>row.message);
function validData(value,batches){
 const values=batches.flatMap(id=>source.batches[id]);
 assert.equal(value.task_id,source.task_id);assert.equal(value.version,source.version);
 assert.deepStrictEqual(value.batch_ids,batches);assert.deepStrictEqual(value.values,values);
 assert.equal(value.total,values.reduce((n,x)=>n+x,0));
}
function validate(program){
 assert.equal(program.status,'passed');assert.equal(program.sdk,'2.3.0');
 const {modern,legacy,wrong_total:wrong}=program;
 for(const connection of [modern,legacy,wrong]){
  assert.equal(connection.server_exit_event,true);assert.equal(connection.server_process_reaped,true);
  assert.equal(connection.events.at(-1).event,'server_stopped');
  assert.deepStrictEqual(Object.keys(connection.tools).sort(),['read_batch','scan_batches','watch_batch']);
 }
 assert.deepStrictEqual(modern.metadata.supportedVersions,['2026-07-28']);
 assert.equal(modern.metadata.capabilities.tools.listChanged,false);
 assert.equal(legacy.metadata.protocolVersion,'2025-11-25');
 const sent=outgoing(modern),received=incoming(modern),requests=sent.filter(x=>Object.hasOwn(x,'id'));
 assert.equal(sent[0].method,'server/discover');assert(!sent.some(x=>x.method==='initialize'));
 assert.equal(requests.length,9);assert.equal(new Set(requests.map(x=>x.id)).size,requests.length);
 for(const request of requests){
  const meta=request.params._meta;
  assert.equal(meta['io.modelcontextprotocol/protocolVersion'],'2026-07-28');
  assert.deepStrictEqual(meta['io.modelcontextprotocol/clientInfo'],{name:'infra-guide-host',version:'1.0.0'});
  assert.deepStrictEqual(meta['io.modelcontextprotocol/clientCapabilities'],{});
 }
 const call=name=>requests.find(x=>x.method==='tools/call'&&x.params.name===name);
 const response=id=>received.find(x=>x.id===id);
 const watch=call('watch_batch'),cancel=sent.find(x=>x.method==='notifications/cancelled');
 assert(cancel&&!Object.hasOwn(cancel,'id'));assert.equal(cancel.params.requestId,watch.id);
 assert.equal(modern.cancelled_waiter,true);
 assert.equal(modern.server_cleanup.request_id,watch.id);assert.equal(modern.server_cleanup.file_closed,true);
 for(const request of requests)assert.equal(received.filter(x=>x.id===request.id).length,request.id===watch.id?0:1,'one reply per normal request, none for cancelled request');
 for(const message of [...sent,...received])if(message.method?.startsWith('notifications/'))assert(!Object.hasOwn(message,'id'));
 for(const message of received)if(Object.hasOwn(message,'id')){
  assert(requests.some(x=>x.id===message.id));assert.notEqual(Object.hasOwn(message,'result'),Object.hasOwn(message,'error'));
 }
 const definitions=response(requests.find(x=>x.method==='tools/list').id).result.tools;
 const scanDefinition=definitions.find(x=>x.name==='scan_batches');
 assert.deepStrictEqual(scanDefinition.outputSchema.required,fields);
 assert.equal(scanDefinition.outputSchema.properties.total.type,'integer');
 assert.equal(definitions.find(x=>x.name==='read_batch').inputSchema.properties.batch_id.type,'string');
 const invalid=requests.find(x=>x.method==='tools/call'&&x.params.arguments?.batch_id===27);
 const missing=requests.find(x=>x.method==='tools/call'&&x.params.arguments?.batch_id==='missing');
 assert.equal(response(invalid.id).result.isError,true);assert.equal(response(missing.id).result.isError,true);
 assert.equal(modern.invalid_is_error,true);assert.equal(modern.missing_is_error,true);
 const unknown=call('unknown_tool');assert.equal(response(unknown.id).error.code,-32602);
 assert.equal(modern.protocol_error.code,-32602);
 validData(modern.base,['base']);validData(modern.scan,['base','late']);validData(modern.after_cancel,['late']);validData(legacy.base,['base']);
 const scan=call('scan_batches'),token=scan.params._meta.progressToken;
 const progress=received.filter(x=>x.method==='notifications/progress');
 const scanProgress=progress.filter(x=>x.params.progressToken===token).map(x=>x.params);
 assert.deepStrictEqual(scanProgress.map(x=>[x.progress,x.total,x.message]),[[1,2,'read base'],[2,2,'read late']]);
 assert.deepStrictEqual(modern.progress.map(x=>[x.done,x.total,x.message]),[[1,2,'read base'],[2,2,'read late']]);
 const watchToken=watch.params._meta.progressToken;
 assert.notEqual(token,watchToken);assert.equal(progress.filter(x=>x.params.progressToken===watchToken).length,1);
 assert.equal(progress.length,3);
 for(const update of progress)assert(requests.some(x=>x.params._meta.progressToken===update.params.progressToken));
 const names=modern.events.map(x=>x.event),opened=names.indexOf('watch_opened'),cancelled=names.indexOf('watch_cancelled'),cleaned=names.indexOf('watch_cleanup');
 assert(opened>=0&&opened<cancelled&&cancelled<cleaned);
 assert.equal(modern.events[cleaned].file_closed,true);
 const after=modern.events.findIndex((x,i)=>i>cleaned&&x.event==='call_received'&&x.name==='read_batch');assert(after>cleaned);
 assert(modern.events.filter(x=>x.request_id!==undefined).every(x=>x.protocol===undefined||x.protocol==='2026-07-28'));
 const legacySent=outgoing(legacy);
 assert.equal(legacySent[0].method,'initialize');assert.equal(legacySent[0].params.protocolVersion,'2025-11-25');
 assert.equal(legacySent[1].method,'notifications/initialized');assert(!Object.hasOwn(legacySent[1],'id'));
 assert.equal(legacySent[2].method,'tools/list');assert(!legacySent.some(x=>x.method==='server/discover'));
 assert.equal(wrong.is_error,false);assert.equal(wrong.semantic_error_rejected,true);assert.equal(wrong.independent_expected,42);
 assert.deepStrictEqual(wrong.scan.values,source.batches.base.concat(source.batches.late));assert.equal(wrong.scan.total,41);
 assert.throws(()=>validData(wrong.scan,['base','late']),assert.AssertionError);
 const wrongScan=outgoing(wrong).find(x=>x.method==='tools/call'&&x.params.name==='scan_batches');
 const wrongResponse=incoming(wrong).find(x=>x.id===wrongScan.id).result;
 assert.equal(wrongResponse.isError,false);assert.equal(wrongResponse.resultType,'complete');
 assert.deepStrictEqual(Object.keys(wrongResponse.structuredContent).sort(),[...fields].sort());
 assert.equal(wrongResponse.structuredContent.total,41);
 assert.deepStrictEqual(program.independent_oracle,{expected_total:42,cancel_request_id:watch.id,cancelled_response_absent:true,all_modern_requests_carry_metadata:true,modern_first_method:'server/discover',legacy_first_method:'initialize'});
}
assert.equal(record.status,'passed');validate(record.program);
for(const mutate of [
 p=>{p.modern.scan.total=41;},
 p=>{outgoing(p.modern).find(x=>x.method==='notifications/cancelled').params.requestId=99;},
 p=>{incoming(p.modern).find(x=>x.method==='notifications/progress').params.progressToken=999;},
 p=>{delete outgoing(p.modern)[0].params._meta['io.modelcontextprotocol/protocolVersion'];},
 p=>{p.modern.server_cleanup.file_closed=false;},
 p=>{p.modern.server_process_reaped=false;},
 p=>{p.legacy.metadata.protocolVersion='2026-07-28';},
 p=>{p.wrong_total.is_error=true;}
]){const changed=JSON.parse(JSON.stringify(record.program));mutate(changed);assert.throws(()=>validate(changed));}
for(const[file,hash]of Object.entries(record.source_sha256))assert.equal(sha(fs.readFileSync(folder+file)),hash,file+': recorded source revision');
assert(fs.readFileSync(folder+'requirements.txt','utf8').split('\n').includes('mcp==2.3.0'));
if(process.env.INFRA_MCP_PYTHON){
 const actual=JSON.parse(execFileSync(process.env.INFRA_MCP_PYTHON,['-B',folder+'client_lab.py'],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024}));
 validate(actual);
}
const context={};vm.createContext(context);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),context,{filename:file});
if(!vm.runInContext('articles.some(a=>a.id==="mcp-protocol")',context))vm.runInContext(fs.readFileSync('dist/mcp-protocol.js','utf8'),context,{filename:'mcp-protocol.js'});
const data=JSON.parse(vm.runInContext('JSON.stringify({files:mcpProtocolFiles,evidence:mcpProtocolEvidence,article:articles.find(a=>a.id==="mcp-protocol")})',context));
for(const[file,embedded]of Object.entries(data.files))assert.equal(embedded,fs.readFileSync(folder+file,'utf8'),file+': exact authored source embed');
assert.deepStrictEqual(data.evidence.source_sha256,record.source_sha256);
assert.equal(data.article.module,'agent');assert.equal(data.article.sections.length,9);assert(/^\d{4}\.\d{2}\.\d{2}$/.test(data.article.updated)&&data.article.updated>='2026.11.08','protocol lesson retains a valid date at or after its native-source review; later body dates are checked by the editorial ledger');
const body=data.article.sections.map(s=>s[1]).join('');assert(body.includes('id="mcp-protocol-run"'));
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&');
const blocks=[...body.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(x=>decode(x[1]));
assert.equal(blocks.length,8);
for(const file of ['client_lab.py','server.py'])assert(blocks.includes(data.files[file].trim()),file+': complete source in lesson');
const sent=outgoing(record.program.modern),received=incoming(record.program.modern);
assert.deepStrictEqual(data.evidence.call_request,sent.find(x=>x.method==='tools/call'&&x.params.name==='read_batch'));
assert.deepStrictEqual(data.evidence.call_response,received.find(x=>x.id===data.evidence.call_request.id));
assert.deepStrictEqual(data.evidence.protocol_error_response,received.find(x=>x.error));
assert.deepStrictEqual(data.evidence.cancel_notification,sent.find(x=>x.method==='notifications/cancelled'));
// The early teaching bridge comes from the same actual tools/list and executed source.
const listRequest=sent.find(x=>x.method==='tools/list');
const readTool=received.find(x=>x.id===listRequest.id).result.tools.find(tool=>tool.name==='read_batch');
assert.deepStrictEqual(data.evidence.read_batch_contract,{name:readTool.name,inputSchema:readTool.inputSchema});
assert.deepStrictEqual(data.evidence.read_batch_contract.inputSchema.required,['task_id','batch_id']);
const excerpt=data.evidence.normal_sdk_excerpt,lines=data.files['client_lab.py'].split('\n');
assert.equal(excerpt.fragments.length,3);
assert.deepStrictEqual(excerpt.fragments.map(fragment=>fragment.method),['server/discover','tools/list','tools/call']);
for(const fragment of excerpt.fragments){
 assert.equal(fragment.file,'client_lab.py');
 assert(Number.isInteger(fragment.start_line)&&Number.isInteger(fragment.end_line));
 assert(fragment.start_line>0&&fragment.end_line>=fragment.start_line);
 assert(lines.slice(fragment.start_line-1,fragment.end_line).join('\n').includes(fragment.expression),'SDK excerpt differs from its original source lines');
}
assert.equal(excerpt.fragments[0].expression,'await session.discover()');
assert.equal(excerpt.fragments[1].expression,'await session.list_tools()');
assert.equal(excerpt.fragments[2].expression,'await session.call_tool("read_batch", {"task_id": "report-A", "batch_id": "base"})');
assert.equal(excerpt.text,excerpt.fragments.map(fragment=>fragment.expression).join('\n'));
const early=data.article.sections[2][1];
const earlyBlocks=[...early.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(match=>decode(match[1]));
assert.deepStrictEqual(earlyBlocks,[excerpt.text,JSON.stringify(data.evidence.call_request,null,2)]);
assert(early.indexOf('已发现的契约项目')<early.indexOf('跟读实际执行的现代SDK表达式'));
assert(early.indexOf('跟读实际执行的现代SDK表达式')<early.indexOf('这些概念放回真实请求'));
assert(early.includes('这里省略了返回值赋值、观察记录及断言')&&early.includes('不是一份可单独运行的程序'));
assert(early.indexOf('同一次调用的响应id为')>early.indexOf('这些概念放回真实请求'));
assert(early.indexOf('同一次调用的响应id为')<early.indexOf('2025-11-25及更早版本'));
assert(early.includes('响应id为<code>'+data.evidence.call_response.id+'</code>'));
assert(early.includes('values为<code>'+JSON.stringify(data.evidence.call_response.result.structuredContent.values)+'</code>'));
assert(early.includes('total为<code>'+data.evidence.call_response.result.structuredContent.total+'</code>'));
const metadata={};for(const[name,height]of [['objects',660],['versions',780],['cancellation',820]]){
 const svg=fs.readFileSync('dist/diagrams/mcp-protocol-'+name+'.svg','utf8');
 assert(svg.includes('viewBox="0 0 1120 '+height+'"')&&svg.includes('<title')&&svg.includes('<desc'));
 assert(body.includes('width="1120" height="'+height+'"'));
 metadata[name]=JSON.parse(decode(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
}
assert.deepStrictEqual(metadata.objects.source,source);assert.equal(metadata.objects.normal_total,42);assert.equal(metadata.objects.wrong_total,41);
assert.deepStrictEqual(metadata.versions.modern_discovery,record.program.modern.metadata);
assert.deepStrictEqual(metadata.versions.legacy_metadata,record.program.legacy.metadata);
assert.deepStrictEqual(metadata.cancellation.server_cleanup,record.program.modern.server_cleanup);
assert.deepStrictEqual(metadata.cancellation.cancel_notification,data.evidence.cancel_notification);
execFileSync('python3',['-c',`from pathlib import Path
import zipfile
folder=Path('dist/labs/mcp-protocol')
with zipfile.ZipFile(folder.with_suffix('.zip')) as archive:
 assert archive.testzip() is None
 names=['client_lab.py','server.py','orders.json','requirements.txt','README.md','validation.json']
 assert sorted(archive.namelist())==sorted('mcp-protocol/'+name for name in names)
 for name in names: assert archive.read('mcp-protocol/'+name)==(folder/name).read_bytes(),name
`],{encoding:'utf8'});
console.log('PASS: source-bound official SDK2.3 modern/legacy stdio record; independent request/response/progress/cancellation and authoritative42-vs41 oracles; actual tools/list contract and exact executed SDK excerpt precede raw request; cleanup/exit evidence, rejection probes, complete source, 3 data-bound SVGs and ZIP. Set INFRA_MCP_PYTHON for a fresh SDK replay.');
