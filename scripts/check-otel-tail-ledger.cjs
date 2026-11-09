/* Recompute the lesson from the real Collector exports and direct SQLite reads. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const lab = path.join(root, 'dist/labs/otel-tail-ledger');
const source = JSON.parse(fs.readFileSync(path.join(lab, 'source.json')));
const lock = JSON.parse(fs.readFileSync(path.join(lab, 'collector-lock.json')));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const attributes = items => Object.fromEntries(items.map(({key, value}) => [key, Object.values(value)[0]]));
const runPython = (code, args) => execFileSync('python3', ['-B', '-c', code, ...args], {encoding:'utf8', timeout:15000});

function readSpans(file) {
  const byTrace = new Map();
  for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
    for (const {resource, scopeSpans} of JSON.parse(line).resourceSpans) {
      const service = attributes(resource.attributes)['service.name'];
      for (const scope of scopeSpans) for (const span of scope.spans) {
        if (!byTrace.has(span.traceId)) byTrace.set(span.traceId, new Map());
        const spans = byTrace.get(span.traceId);
        assert(!spans.has(span.spanId), 'repeated span ID in one export');
        spans.set(span.spanId, {service, span, attrs:attributes(span.attributes || [])});
      }
    }
  }
  return byTrace;
}

function readLedger(file) {
  return JSON.parse(runPython(`
import json,sqlite3,sys,pathlib
with sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro', uri=True) as db:
    assert db.execute('PRAGMA integrity_check').fetchone()==('ok',)
    print(json.dumps({table:db.execute('SELECT * FROM '+table+' ORDER BY task_id').fetchall()
                      for table in ('tasks','attempts','effects')}))
`, [file]));
}

const isError = span => [2,'STATUS_CODE_ERROR'].includes(span.status?.code);
const isOk = span => [1,'STATUS_CODE_OK'].includes(span.status?.code);
const kind = (span, value, label) => span.kind === value || span.kind === label;

function verify(directory) {
  const record = json(path.join(directory, 'validation.json'));
  assert.equal(record.status, 'passed');
  const asset = lock.assets[record.collector.target];
  assert(asset);
  assert.equal(record.collector.archive_name, asset.name);
  assert.equal(record.collector.archive_sha256, asset.sha256);
  assert.match(record.collector.version_output, /\b0\.130\.0\b/);
  assert.match(record.collector.binary_sha256, /^[a-f0-9]{64}$/);
  assert.equal(record.environment.sdk, '1.44.0');
  assert.equal(record.environment.otlp_http_exporter, '1.44.0');
  assert.deepEqual(Object.keys(record.source_sha256).sort(), ['README.md','collector-lock.json','collector.yaml','official-assets.json','requirements.txt','source.json','tail_ledger.py']);
  assert.deepEqual(Object.keys(record.artifact_sha256).sort(), ['collector-effective.yaml','collector-metrics.txt','collector.log','full-traces.jsonl','ledger.sqlite','sampled-traces.jsonl']);
  for (const [name, digest] of Object.entries(record.source_sha256)) assert.equal(sha(path.join(lab, name)), digest, name);
  for (const [name, digest] of Object.entries(record.artifact_sha256)) assert.equal(sha(path.join(directory, name)), digest, name);

  const effective = fs.readFileSync(path.join(directory, 'collector-effective.yaml'), 'utf8');
  const otlpPort = effective.match(/endpoint: 127\.0\.0\.1:(\d+)/)[1];
  const metricsPort = effective.match(/port: (\d+)/)[1];
  const template = fs.readFileSync(path.join(lab, 'collector.yaml'), 'utf8');
  assert.equal(effective, template.replace('@@OTLP_PORT@@', otlpPort).replace('@@METRICS_PORT@@', metricsPort));

  const ledger = readLedger(path.join(directory, 'ledger.sqlite'));
  const full = readSpans(path.join(directory, 'full-traces.jsonl'));
  const sampled = readSpans(path.join(directory, 'sampled-traces.jsonl'));
  assert.equal(ledger.tasks.length, source.cases.length);
  assert.equal(full.size, ledger.tasks.length);
  assert.equal(new Set(ledger.tasks.map(row => row[1])).size, ledger.tasks.length);
  const selected = [];
  let actualAttemptCount = 0;
  let verifiedSuccesses = 0;
  for (const fixture of source.cases) {
    const taskId = fixture.task_id;
    const [, traceId, outcome] = ledger.tasks.find(row => row[0] === taskId);
    const spans = full.get(traceId);
    const rootSpans = [...spans.values()].filter(item => !item.span.parentSpanId);
    assert.equal(rootSpans.length, 1);
    const {span:task, attrs:taskAttrs, service} = rootSpans[0];
    assert.equal(service, 'report-runner');
    assert.equal(task.name, 'agent.task');
    assert.equal(taskAttrs['app.task_id'], taskId);
    const statuses = fixture.retry ? [fixture.first_response, 200] : [fixture.first_response];
    const success = statuses.at(-1) === 200;
    verifiedSuccesses += Number(success);
    assert.equal(outcome, success ? 'verified_success' : 'failed');
    assert.equal(taskAttrs['app.outcome'], outcome);
    assert(success ? isOk(task) : isError(task));
    assert.equal(spans.size, 1 + 2 * statuses.length);
    const attempts = ledger.attempts.filter(row => row[0] === taskId).sort((a,b) => a[1]-b[1]);
    actualAttemptCount += statuses.length;
    assert.equal(attempts.length, statuses.length);
    const op = `${taskId}:publish`;
    const effects = ledger.effects.filter(row => row[1] === taskId);
    assert.deepEqual(effects, fixture.effect_before_first_response ? [[op, taskId, source.report_total]] : []);
    for (const [index, status] of statuses.entries()) {
      const number = index + 1;
      const written = index === 0 && fixture.effect_before_first_response;
      const duplicate = index === 1;
      assert.deepEqual(attempts[index], [taskId,number,op,status,Number(written),Number(duplicate)]);
      const children = [...spans.values()].filter(item => Number(item.attrs['app.attempt']) === number);
      assert.equal(children.length, 2);
      const client = children.find(item => kind(item.span, 3, 'SPAN_KIND_CLIENT'));
      const server = children.find(item => kind(item.span, 2, 'SPAN_KIND_SERVER'));
      assert.equal(client.span.name, 'tool.attempt');
      assert.equal(server.span.name, 'tool.execute');
      assert.equal(client.service, 'report-runner');
      assert.equal(server.service, 'report-tool');
      assert.equal(client.span.parentSpanId, task.spanId);
      assert.equal(server.span.parentSpanId, client.span.spanId);
      for (const item of [client,server]) {
        assert.equal(item.attrs['app.op'], op);
        assert.equal(item.attrs['app.task_id'], taskId);
        assert.equal(Number(item.attrs['http.response.status_code']), status);
        assert(status >= 500 ? isError(item.span) : isOk(item.span));
      }
      assert.equal(server.attrs['app.effect_written'], written);
      assert.equal(server.attrs['app.duplicate'], duplicate);
      assert.deepEqual((server.span.events || []).map(event => event.name), written ? ['effect_committed'] : duplicate ? ['receipt_reused'] : []);
    }
    if ([...spans.values()].some(({span}) => isError(span))) {
      selected.push(traceId);
      assert.deepEqual(sampled.get(traceId), spans, 'sampling must preserve every span of selected traces');
    }
  }
  assert.deepEqual([...sampled.keys()].sort(), selected.sort());
  assert.equal(ledger.attempts.length, actualAttemptCount);
  assert.equal(ledger.effects.length, verifiedSuccesses);
  assert.equal([...full.values()].reduce((sum, spans) => sum + spans.size, 0), 11);
  assert.equal([...sampled.values()].reduce((sum, spans) => sum + spans.size, 0), 8);
  assert.equal(ledger.tasks.filter(([,id,outcome]) => sampled.has(id) && outcome === 'verified_success').length, 1);
  const metrics = fs.readFileSync(path.join(directory, 'collector-metrics.txt'), 'utf8');
  const decisions = {true:0,false:0};
  for (const line of metrics.split('\n')) {
    const match = line.match(/^otelcol_processor_tail_sampling_count_traces_sampled__traces__total\{([^}]+)\}\s+([\d.e+]+)$/);
    const sampledLabel = match?.[1].match(/\bsampled="(true|false)"/);
    if (sampledLabel) decisions[sampledLabel[1]] += Number(match[2]);
  }
  assert.deepEqual(decisions, {true:2,false:1});
  assert.deepEqual(record.observed, {tasks:3,verified_successes:2,attempts:4,effects:2,full_trace_count:3,sampled_trace_count:2,sampling_decisions:decisions});
}

const official = json(path.join(lab, lock.asset_metadata));
assert.equal(official.tag_name, `v${lock.version}`);
assert.equal(official.html_url, lock.release);
for (const asset of Object.values(lock.assets)) {
  const released = official.assets.find(row => row.id === asset.asset_id);
  assert.equal(released.name, asset.name);
  assert.equal(released.digest, `sha256:${asset.sha256}`);
  assert.equal(released.browser_download_url, `${lock.release.replace('/tag/', '/download/')}/${asset.name}`);
}
verify(lab);

runPython(`
import json,pathlib,sys,zipfile,xml.etree.ElementTree as ET
root=pathlib.Path(sys.argv[1]); lab=root/'dist/labs/otel-tail-ledger'
with zipfile.ZipFile(lab.with_suffix('.zip')) as archive:
    assert sorted(archive.namelist())==sorted(file.name for file in lab.iterdir() if file.is_file())
    for name in archive.namelist():assert archive.read(name)==(lab/name).read_bytes(),name
figure=ET.parse(root/'dist/diagrams/otel-tail-ledger.svg').getroot()
assert figure.find('{http://www.w3.org/2000/svg}title').text
assert figure.find('{http://www.w3.org/2000/svg}desc').text
assert figure.get('aria-labelledby')=='title desc'
data=json.loads(figure.find('{http://www.w3.org/2000/svg}metadata').text)
observed=json.loads((lab/'validation.json').read_text())['observed']
assert data['record']=='labs/otel-tail-ledger/validation.json'
assert (data['full_traces'],data['sampled_traces'])==(observed['full_trace_count'],observed['sampled_trace_count'])
assert (data['tasks'],data['successes'],data['attempts'],data['effects'])==(observed['tasks'],observed['verified_successes'],observed['attempts'],observed['effects'])
assert (data['full_spans'],data['sampled_spans'])==(11,8)
`, [root]);

const python = process.env.OTEL_TAIL_PYTHON;
const archive = process.env.OTEL_TAIL_COLLECTOR_ARCHIVE;
assert.equal(Boolean(python), Boolean(archive), 'set both OTEL_TAIL_PYTHON and OTEL_TAIL_COLLECTOR_ARCHIVE for native replay');
if (python) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-otel-tail-ledger-'));
  try {
    const replay = path.join(temporary, 'replay');
    execFileSync(python, ['-B', path.join(lab,'tail_ledger.py'),'--collector-archive',archive,'--output-dir',replay], {timeout:90000});
    verify(replay);
  } finally {
    fs.rmSync(temporary, {recursive:true,force:true});
  }
}
console.log(`PASS ${python ? 'fresh Collector replay and' : ''} OTLP/SQLite source, trace identities, parentage, policy decisions, effects, hashes and ZIP`);
