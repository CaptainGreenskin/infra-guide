/* Compare real shard calls, local search plans, and independent order totals. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dist = path.resolve(__dirname, '../dist');
const pack = 'sqlite-shard-routing';
const folder = path.join(dist, 'labs', pack);
const source = 'shard_routing.py';
const files = ['README.md', source, 'validation.json'];
const anchor = 'native-sqlite-shard-routing';
const articleRoute = '/article/database-index-locks/';
const capacityRoute = '/article/elasticity/#shard-load-not-average';
const recordURL = 'labs/' + pack + '/validation.json';
const read = name => fs.readFileSync(path.join(folder, name));
const page = route => fs.readFileSync(path.join(dist, route, 'index.html'), 'utf8');
const sourceHash = createHash('sha256').update(read(source)).digest('hex');
const evidence = JSON.parse(read('validation.json'));
const orders = Array.from({length: 12}, (_, index) => 101 + index);
const fixture = [...orders.map(id => ['A', id, id - 100]), ['B', 201, 1], ['B', 202, 2], ['C', 301, 1], ['C', 302, 2]];

function verify(record) {
 assert.equal(record.schema, 1);
 assert.deepEqual(record.source_sha256, {[source]: sourceHash});
 assert.equal(record.temporary_workspace_removed, true);
 assert.match(record.environment.sqlite, /^3\.\d+\.\d+$/);
 assert.match(record.environment.python, /^3\.\d+\.\d+$/);
 const {tenant_buckets, fixture_rows, oracle, cases} = record.observations;
 assert.deepEqual(tenant_buckets, {A: 0, B: 1, C: 1});
 assert.deepEqual(fixture_rows, fixture);
 assert.deepEqual(oracle, {tenant_a_count_sum: [12, 78], order_a104_amount: 4});
 assert.deepEqual(Object.keys(cases).sort(), ['tenant_only', 'tenant_order']);
 const meta = {record: recordURL};
 for (const [key, split] of [['tenant_only', false], ['tenant_order', true]]) {
  const item = cases[key];
  const route = (tenant, id) => {
   const base = tenant === 'A' ? 0 : 1;
   return split && id % 2 ? 1 - base : base;
  };
  const placements = [0, 1].map(index => fixture.filter(([tenant, id]) => route(tenant, id) === index));
  assert.deepEqual(item.files, [0, 1].map(index => key.replace('_', '-') + '-' + index + '.sqlite'));
  assert.deepEqual(item.placement_rows, placements);
  assert.deepEqual(item.rows_by_shard, placements.map(rows => rows.length));

  for (const [workload, selected] of [['distinct_orders', orders], ['hot_order', Array(12).fill(104)]]) {
   const run = item[workload];
   assert.deepEqual(run.orders, selected);
   assert.deepEqual(run.amounts, selected.map(id => id - 100));
   assert.deepEqual(run.sql_trace, selected.map(id => ({shard: route('A', id),
    sql: "SELECT amount FROM orders WHERE tenant = 'A' AND order_id = " + id})));
   const counts = [0, 1].map(index => run.sql_trace.filter(statement => statement.shard === index).length);
   assert.deepEqual(run.queries_by_shard, counts);
  }

  const lookup = item.query_plans.point;
  const summarize = item.query_plans.tenant_summary;
  assert.equal(lookup.length, 1);
  assert.equal(summarize.length, 1);
  assert.equal(lookup[0].at(-1), 'SEARCH orders USING PRIMARY KEY (tenant=? AND order_id=?)');
  assert.equal(summarize[0].at(-1), 'SEARCH orders USING PRIMARY KEY (tenant=?)');
  const indexes = split ? [0, 1] : [0];
  const partials = indexes.map(shard => {
   const tenantRows = placements[shard].filter(([tenant]) => tenant === 'A');
   return {shard, count_sum: [tenantRows.length, tenantRows.reduce((sum, row) => sum + row[2], 0)]};
  });
  assert.deepEqual(item.tenant_summary.partials, partials);
  assert.deepEqual(item.tenant_summary.sql_trace, indexes.map(shard => ({shard,
   sql: "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM orders WHERE tenant = 'A'"})));
  assert.deepEqual(item.tenant_summary.shard_zero_only, partials[0].count_sum);
  assert.deepEqual(item.tenant_summary.merged, oracle.tenant_a_count_sum);
  if (split) assert.notDeepEqual(item.tenant_summary.shard_zero_only, item.tenant_summary.merged);
  meta[key] = {rows: item.rows_by_shard, distinct: item.distinct_orders.queries_by_shard,
   hot: item.hot_order.queries_by_shard, total: item.tenant_summary.merged};
 }
 return meta;
}

const observations = verify(evidence);
for (const mutate of [
 data => { data.observations.cases.tenant_order.hot_order.queries_by_shard = [6, 6]; },
 data => { data.observations.cases.tenant_order.hot_order.sql_trace[1].shard = 1; },
 data => { data.observations.cases.tenant_order.query_plans.point[0][3] = 'SCAN orders'; },
 data => { data.observations.cases.tenant_order.tenant_summary.merged = [6, 42]; },
 data => { data.observations.cases.tenant_order.tenant_summary.partials[1].count_sum = [6, 42]; },
 data => { data.observations.cases.tenant_only.placement_rows[0].pop(); },
]) {
 const modified = structuredClone(evidence);
 mutate(modified);
 assert.throws(() => verify(modified), assert.AssertionError);
}

if (process.argv.includes('--replay')) {
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-shard-replay-'));
 try {
  const output = path.join(temp, 'validation.json');
  execFileSync('python3', ['-B', path.join(folder, source), '--output', output], {timeout: 30000, stdio: 'inherit'});
  assert.deepEqual(verify(JSON.parse(fs.readFileSync(output))), observations);
 } finally {
  fs.rmSync(temp, {recursive: true, force: true});
 }
}

const zip = folder + '.zip';
execFileSync('unzip', ['-tqq', zip]);
const entries = execFileSync('unzip', ['-Z1', zip], {encoding: 'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries, files.map(name => pack + '/' + name));
for (const name of files) assert.deepEqual(execFileSync('unzip', ['-p', zip, pack + '/' + name]), read(name), name);

const article = page(articleRoute);
const marker = 'id="' + anchor + '"';
assert.equal(article.split(marker).length, 2, 'unique published shard-routing anchor');
const start = article.indexOf(marker);
const section = article.lastIndexOf('<section class="article-section"', start);
assert(article.slice(section, start).startsWith('<section class="article-section" id="section-3">'));
for (const href of ['labs/' + pack + '.zip', recordURL, 'diagrams/' + pack + '.svg', capacityRoute]) assert(article.includes(href), href);
const capacity = page('article/elasticity');
const capacitySection = capacity.match(/<section class="article-section" id="section-1">([\s\S]*?)<\/section>/)?.[1];
assert(capacitySection?.includes('id="shard-load-not-average"') && capacitySection.includes(articleRoute + '#' + anchor));
for (const [module, id, href] of [['cloud-data', 'database-service', articleRoute + '#' + anchor],
                                  ['cloud-capacity', 'performance-budget', capacityRoute]]) {
 const point = page('module/' + module).match(new RegExp('<section class="knowledge-point" id="knowledge-' + id + '">([\\s\\S]*?)</section>'))?.[1];
 assert(point?.includes(href), module + ' links to its own conceptual step');
}
const task = page('labs').match(/<li class="lab-learning-unit" id="lab-cloud-sqlite-shard-routing">([\s\S]*?)<\/li>/)?.[1];
assert(task?.includes(articleRoute + '#' + anchor));
const svg = fs.readFileSync(path.join(dist, 'diagrams', pack + '.svg'), 'utf8');
assert(/<title\b/.test(svg) && /<desc\b/.test(svg), 'diagram has an accessible title and description');
const metadata = svg.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
assert(metadata, 'diagram binds results to original record');
assert.deepEqual(JSON.parse(metadata), observations);
console.log('PASS: native SQLite shard placement, traced hot and distinct reads, local access plans, fanout oracle, source, archive, diagram and two chapters.');
