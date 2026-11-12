/* Verify the exact Linux record, negative controls and reading entry points. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const folder='dist/labs/sandbox-docker-lifecycle',python=process.env.INFRA_LAB_PYTHON||'python3';
const read=path=>fs.readFileSync(path);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const recordBytes=read(folder+'/validation.json'),record=JSON.parse(recordBytes),ci=JSON.parse(read(folder+'/ci-record.json'));
assert.equal(ci.validation_sha256,digest(recordBytes));
assert.equal(ci.run,'https://github.com/CaptainGreenskin/infra-guide/actions/runs/43112666631');
assert.equal(ci.head_sha,'df644dbafd37a655466d283a62d6e47faebd7cdc');
assert.equal(ci.workflow,'.github/workflows/sandbox-docker-lifecycle-evidence.yml');
assert.equal(ci.artifact.name,'sandbox-docker-lifecycle');
assert.match(ci.artifact.digest,/^sha256:[a-f0-9]{64}$/);
assert.deepEqual(ci.source_sha256,record.source_sha256);
for(const file of ['docker_lifecycle.py','fixture.py'])assert.equal(digest(read(folder+'/'+file)),record.source_sha256[file]);
execFileSync(python,['-B',folder+'/docker_lifecycle.py','--check-record',folder+'/validation.json']);
execFileSync(python,['-B','-c',`
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile
import json
import runpy

folder = Path('${folder}')
verify = runpy.run_path(str(folder / 'docker_lifecycle.py'))['verify']
record = json.loads((folder / 'validation.json').read_bytes())
mutations = [
    (('reuse', 'after', 'started_at'), 'different'),
    (('reuse', 'without_reset', 'worker', 'accepted'), True),
    (('reuse', 'report_after_reset'), record['reuse']['first']['independent_report']),
    (('concurrent', 'a_after', 'populated'), 1),
    (('concurrent', 'a_after', 'members_retired'), [True, False]),
    (('concurrent', 'b_after', 'members', 1, 'start_ticks'), -1),
    (('concurrent', 'b_report', 'amount'), 74),
    (('removed_ids',), []),
]
for keys, value in mutations:
    changed = deepcopy(record)
    row = changed
    for key in keys[:-1]:
        row = row[key]
    row[keys[-1]] = value
    try:
        verify(changed)
    except ValueError:
        continue
    raise AssertionError(f'accepted altered observation {keys}')
with ZipFile(folder.with_suffix('.zip')) as archive:
    assert sorted(archive.namelist()) == sorted(str(Path(folder.name) / x.name) for x in folder.iterdir())
    for path in folder.iterdir():
        assert archive.read(f'{folder.name}/{path.name}') == path.read_bytes()
`]);
const article=read('dist/article/agent-sandbox/index.html').toString();
const anchor='native-sandbox-docker-lifecycle';
const section=article.split('id="'+anchor+'"')[1]?.split('</section>')[0];
assert(section?.includes('三个都已移除')&&section.includes('populated=0')&&section.includes(ci.run));
assert(section.includes('docker_lifecycle.py --output my-record.json')&&section.includes('生产环境还需测'));
for(const value of [record.reuse.cold_create_to_ready_ms,record.reuse.cold_create_to_first_readback_ms,
                    record.reuse.second.request_to_readback_ms])assert(section.includes((value/1000).toFixed(2)+' 秒'));
const environment=read('dist/article/serverless-execution/index.html').toString().split('id="section-2"')[1]?.split('</section>')[0];
const toSandbox='/article/agent-sandbox/#'+anchor;
const timing=environment?.match(/<div class="table-wrap table-wrap-compact"><table>[\s\S]*?本次用时[\s\S]*?<\/table><\/div>/)?.[0];
assert(section.includes('href="/article/serverless-execution/#section-2"'));
assert(timing&&environment.includes('href="'+toSandbox+'"'));
const figureAt=environment.indexOf('id="serverless-invocation-lanes"'),bridgeAt=environment.indexOf(toSandbox);
assert(figureAt>=0&&bridgeAt>figureAt&&bridgeAt<environment.indexOf('环境复用与预热的适用条件</summary>'));
const reuse=record.reuse;
for(const [label,value] of [
 ['创建容器到就绪',reuse.cold_create_to_ready_ms],
 ['创建容器到读回首份报告',reuse.cold_create_to_first_readback_ms],
 ['清理结束后派发到读回第二份报告',reuse.second.request_to_readback_ms],
]){
 const time=value.toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3});
 assert(timing.includes('<tr><td>'+label+'</td><td>'+time+' ms</td></tr>'),label);
}
assert(environment.includes('第二次派发被拒，仍读到 <code>'+reuse.without_reset.independent_report.task+'</code>'));
assert(environment.includes('清理后读回 <code>'+JSON.stringify(reuse.report_after_reset)+'</code>'));
assert(environment.includes('重新派发才读到 <code>'+reuse.second.independent_report.task+'</code>'));
assert(environment.includes('两份报告的金额都是 '+reuse.second.independent_report.amount));
const kairoAnchor='kairo-reused-worker-readback';
const kairoPage=read('dist/article/kairo-practice/index.html').toString();
const kairoSection=kairoPage.split('id="section-7"')[1]?.split('</section>')[0];
const handoff=kairoSection?.split('id="'+kairoAnchor+'"')[1]?.split(/<h[23]\b/)[0];
assert(handoff,'Kairo target-environment checklist links to the Docker reuse record');
assert(section.includes('href="/article/kairo-practice/#'+kairoAnchor+'"'));
assert(handoff.includes('href="'+toSandbox+'"')&&handoff.includes('href="/labs/sandbox-docker-lifecycle/validation.json"'));
const staleReport=reuse.without_reset.independent_report,freshReport=reuse.second.independent_report;
assert.equal(reuse.without_reset.worker.accepted,false);
assert.equal(reuse.report_after_reset,null);
assert.equal(reuse.second.worker.accepted,true);
assert.equal(staleReport.amount,freshReport.amount);
assert.equal(staleReport.input_sha256,freshReport.input_sha256);
assert.notEqual(staleReport.task,freshReport.task);
assert(handoff.includes('仍为 <code>'+staleReport.task+'</code>，金额 '+staleReport.amount));
assert(handoff.includes('<code>'+JSON.stringify(reuse.report_after_reset)+'</code>，报告已不在原位置'));
assert(handoff.includes('为 <code>'+freshReport.task+'</code>，金额仍为 '+freshReport.amount));
assert(handoff.includes('两份报告的输入摘要也相同')&&handoff.includes('仍待目标环境验收'));
assert(article.indexOf('id="native-sandbox-process-group"')<article.indexOf('id="'+anchor+'"'));
for(const [file,href] of [
 ['module/agent','?fromConcept=agent.ag-sandbox#'+anchor],
 ['interview/companies','/article/agent-sandbox/#'+anchor],
 ['roadmap/agent-platform','?goal=agent-platform#'+anchor],
 ['labs','id="lab-agent-sandbox-docker-lifecycle"']
])assert(read('dist/'+file+'/index.html').toString().includes(href),href);
console.log('PASS: real Linux Docker lifecycle, stable B and recovered report, eight rejected records, exact ZIP and reading destinations.');
