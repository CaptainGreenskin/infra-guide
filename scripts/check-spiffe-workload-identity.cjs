/* Independently verify the native attestation, mTLS authorization and release artifact. */
'use strict';
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const pack='spiffe-workload-identity',folder='dist/labs/'+pack+'/';
const sourceFiles=['spire_identity_lab.py','workload.go','go.mod','go.sum'];
const read=file=>readFileSync(path.join(root,file),'utf8');
const sha=file=>createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex');
const digest=/^[0-9a-f]{64}$/;
const domain='infraguide.test';
const roles=['report-api','worker-a','worker-b'];
const identity=role=>'spiffe://'+domain+'/'+role;
const [reportApi,workerA,workerB]=roles.map(identity);
const fixture={operation_id:'report-27:publish',amount:37};

function verifyCase(r){
 assert.equal(r.schema,'spiffe-workload-identity-v1');
 assert.equal(r.status,'passed');
 assert.equal(r.trust_domain,domain);
 assert.equal(r.agent_id,identity('lab-agent'));
 assert.match(r.bootstrap_bundle_sha256,digest);
 assert.deepEqual(Object.keys(r.registrations).sort(),roles);
 const registrations=Object.entries(r.registrations);
 const parents=new Set();
 for(const [role,entry] of registrations){
  assert.equal(entry.spiffe_id,identity(role));
  assert.match(entry.entry_id,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.match(entry.selector,new RegExp('^unix:path:/tmp/ig-spire-[a-z0-9_]+/'+role+'$'));
  parents.add(path.posix.dirname(entry.selector.slice('unix:path:'.length)));
 }
 assert.equal(new Set(registrations.map(([,entry])=>entry.entry_id)).size,3);
 assert.equal(parents.size,1);
 assert.equal(r.receiver.server_id,reportApi);
 assert.match(r.receiver.address,/^127\.0\.0\.1:[1-9][0-9]{0,4}$/);
 assert(Number(r.receiver.address.split(':')[1])<=65535);
 assert.deepEqual(r.fixture,fixture);
 assert.deepEqual(r.unregistered,{grpc_code:'PermissionDenied',svid_count:0});
 assert.deepEqual(r.worker_b,{http_status:403,response:{status:'denied'},client_id:workerB,server_id:reportApi});
 assert.deepEqual(r.worker_a,{http_status:201,response:{status:'published'},client_id:workerA,server_id:reportApi});
 assert.deepEqual(r.effects_before,[]);
 assert.deepEqual(r.effects_after_denial,[]);
 assert.deepEqual(r.effects,[{peer_id:workerA,report:fixture}]);
 assert.deepEqual(r.audit,[
  {peer_id:workerB,claimed_id:workerA,report:fixture,decision:'denied'},
  {peer_id:workerA,claimed_id:workerA,report:fixture,decision:'published'}
 ]);
 assert.deepEqual(r.cleanup,{processes_stopped:{'report-api':true,'spire-agent':true,'spire-server':true},scratch_removed:true});
}

function verifyArchive(){
 const code=[
  'from pathlib import Path',
  'from zipfile import ZipFile',
  'import sys',
  'name, *files = sys.argv[1:]',
  "folder = Path('dist/labs') / name",
  "with ZipFile(folder.with_suffix('.zip')) as archive:",
  "    assert sorted(archive.namelist()) == sorted(name + '/' + file for file in files)",
  '    for file in files:',
  "        assert archive.read(name + '/' + file) == (folder / file).read_bytes(), file"
 ].join('\n');
 execFileSync('python3',['-B','-c',code,pack,'README.md','ci-record.json','validation.json','receiver-ready.json',...sourceFiles],{cwd:root,timeout:15000});
}

function verifyTeaching(proofUrl){
 const context=vm.createContext({});
 for(const [,file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)){
  if(file!=='app.js')vm.runInContext(read('dist/'+file),context,{filename:file});
 }
 const article=vm.runInContext('articles.find(a=>a.id==="iam-security")',context);
 assert.equal(article.updated,'2026.11.09');
 const anchor='native-spiffe-workload-identity';
 const sections=article.sections;
 assert(sections[1][1].includes('href="/article/iam-security/#'+anchor+'"'));
 assert(sections[5][1].includes('href="/article/iam-security/#'+anchor+'"'));
 assert(sections[8][1].includes('id="kubernetes-identity-run"'));
 const parts=sections[8][1].split('<h3 id="'+anchor+'">');
 assert.equal(parts.length,2);
 assert(!/<pre\b/.test(parts[1]));
 for(const link of ['/labs/'+pack+'.zip','/labs/'+pack+'/README.md','/labs/'+pack+'/validation.json','diagrams/'+pack+'.svg',proofUrl]){
  assert(parts[1].includes('href="'+link+'"'),anchor+' missing '+link);
 }
 const svg=read('dist/diagrams/'+pack+'.svg');
 assert.match(svg,/<svg\b[^>]*role="img"[^>]*aria-labelledby="spire-title spire-desc"/);
 assert.deepEqual([...svg.matchAll(/data-stage="([^"]+)"/g)].map(m=>m[1]),['attestation','mutual_tls','authorization']);
 const rows=[...svg.matchAll(/data-outcome="([^"]+)">([\s\S]*?)<\/g>/g)];
 assert.deepEqual(rows.map(m=>m[1]),['worker-a','worker-b']);
 assert(rows[0][2].includes('发布 37'));
 assert(rows[1][2].includes('拒绝 403'));
}

const record=JSON.parse(read(folder+'validation.json'));
const proof=JSON.parse(read(folder+'ci-record.json'));
assert.match(proof.url,/^https:\/\/github\.com\/CaptainGreenskin\/infra-guide\/actions\/runs\/[0-9]+$/);
assert.match(proof.headSha,/^[0-9a-f]{40}$/);
assert.equal(proof.conclusion,'success');
assert.equal(proof.record_sha256,sha(folder+'validation.json'));
assert.equal(proof.receiver_ready_sha256,sha(folder+'receiver-ready.json'));
assert.deepEqual(JSON.parse(read(folder+'receiver-ready.json')),record.receiver);
const sourceHashes=Object.fromEntries(sourceFiles.map(name=>[name,sha(folder+name)]));
assert.deepEqual(record.source_sha256,sourceHashes);
assert.deepEqual(proof.source_sha256,sourceHashes);
const environment=record.environment;
assert.deepEqual([environment.system,environment.machine],['Linux','x86_64']);
assert.match(environment.go,/^go version go1\.26\.1 linux\/amd64$/);
assert.equal(environment.go_spiffe,'v2.9.0');
assert.equal(environment.spire_server,'1.16.0');
assert.equal(environment.spire_agent,'1.16.0');
assert.match(environment.server_sha256,digest);
assert.match(environment.agent_sha256,digest);
assert.notEqual(environment.server_sha256,environment.agent_sha256);
assert.equal(environment.archive_sha256,'7bcf5e167151a1fc58293768462b44e155ba8784214582aefa6adf18c633d1d5');
assert.equal(proof.archive_sha256,environment.archive_sha256);
assert(read(folder+'README.md').includes(proof.url));
verifyCase(record);
verifyArchive();
verifyTeaching(proof.url);
console.log('PASS: real SPIRE workload attestation, two mTLS clients, independent report effects, source/ZIP and teaching anchors.');
