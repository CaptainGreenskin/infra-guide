/* Course checks are separate from the unchanged article/reader route inventory. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadCourseData, renderDirectory, renderFallback } = require('./build-courses.cjs');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'course');
const publicOrigin = 'https://captaingreenskin.github.io';
const courseCanonical = publicOrigin + '/infra-guide/courses/';
const read = file => fs.readFileSync(file, 'utf8');
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

function nonempty(value, description) {
  assert.equal(typeof value, 'string', description + ': string');
  assert(value.trim(), description + ': nonempty');
}

function validateData(data) {
  nonempty(data.title, 'course title');
  const prefix = { ai: 'A', cloud: 'C', agent: 'G' };
  let steps = 0;
  let budgets = 0;
  for (const track of data.tracks) {
    nonempty(track.label, track.id + ': label');
    nonempty(track.description, track.id + ': description');
    assert.deepEqual(track.scenes.map(scene => scene.id), Array.from({ length: 6 }, (_, index) => prefix[track.id] + '0' + (index + 1)));
    for (const scene of track.scenes) {
      for (const field of ['title', 'lead', 'question', 'answer']) nonempty(scene[field], scene.id + ': ' + field);
      assert(scene.reading && /^\/article\/[a-z0-9-]+\/#.+/.test(scene.reading.href), scene.id + ': exact original article fragment');
      nonempty(scene.reading.label, scene.id + ': reading label');
      assert(['教学算例', '本机实验', '机制说明'].includes(scene.evidence?.kind), scene.id + ': evidence boundary');
      nonempty(scene.evidence.text, scene.id + ': evidence explanation');
      for (const [index, step] of scene.steps.entries()) {
        steps++;
        for (const field of ['label', 'narration', 'note']) nonempty(step[field], scene.id + ' step ' + (index + 1) + ': ' + field);
        assert(['flow', 'budget', 'matrix', 'timeline', 'ledger'].includes(step.visual?.kind), scene.id + ': supported visual kind');
        const visual = step.visual;
        if (visual.kind === 'flow') {
          assert(Array.isArray(visual.nodes) && visual.nodes.length > 1, scene.id + ': flow contains nodes');
          const nodeIds = new Set(visual.nodes.map(node => node.id));
          assert.equal(nodeIds.size, visual.nodes.length, scene.id + ': flow node ids are unique');
          for (const node of visual.nodes) {
            nonempty(node.id, scene.id + ': flow node id');
            nonempty(node.label, scene.id + ': flow node label');
            nonempty(node.detail, scene.id + ': flow node detail');
            assert(['waiting', 'active', 'done'].includes(node.state), scene.id + ': supported flow state');
          }
          assert(Array.isArray(visual.edges) && visual.edges.length, scene.id + ': explicit flow edges');
          for (const edge of visual.edges) assert(nodeIds.has(edge.from) && nodeIds.has(edge.to), scene.id + ': flow edge endpoints exist');
        }
        if (visual.kind === 'matrix' || visual.kind === 'ledger') {
          assert(Array.isArray(visual.columns) && visual.columns.length > 1, scene.id + ': table columns');
          assert(Array.isArray(visual.rows) && visual.rows.length, scene.id + ': table rows');
          for (const row of visual.rows) {
            const values = visual.kind === 'matrix' ? row.values : row;
            if (visual.kind === 'matrix') nonempty(row.label, scene.id + ': matrix row label');
            assert(Array.isArray(values) && values.length === visual.columns.length, scene.id + ': table row matches its columns');
            for (const value of values) assert(typeof value === 'string' || Number.isFinite(value), scene.id + ': printable finite table value');
          }
        }
        if (visual.kind === 'timeline') {
          assert(Number.isFinite(visual.max) && visual.max > 0, scene.id + ': positive timeline duration');
          nonempty(visual.unit, scene.id + ': timeline unit');
          assert(Array.isArray(visual.lanes) && visual.lanes.length, scene.id + ': timeline lanes');
          for (const lane of visual.lanes) {
            nonempty(lane.label, scene.id + ': timeline lane label');
            assert(Array.isArray(lane.segments) && lane.segments.length, scene.id + ': timeline segments');
            for (const segment of lane.segments) {
              nonempty(segment.label, scene.id + ': timeline segment label');
              assert(Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.start >= 0 && segment.end > segment.start && segment.end <= visual.max, scene.id + ': timeline segment fits the stated duration');
            }
          }
        }
        if (step.visual.kind === 'budget') {
          budgets++;
          assert(Number.isFinite(visual.total) && visual.total > 0, scene.id + ': positive budget capacity');
          nonempty(visual.label, scene.id + ': budget label');
          nonempty(visual.unit, scene.id + ': budget unit');
          assert(Array.isArray(visual.segments) && visual.segments.length, scene.id + ': nonempty budget segments');
          for (const segment of visual.segments) {
            nonempty(segment.label, scene.id + ': budget segment label');
            assert(Number.isFinite(segment.value) && segment.value >= 0, scene.id + ': finite nonnegative budget values');
          }
          const occupied = visual.segments.reduce((sum, segment) => sum + segment.value, 0);
          assert(Number.isFinite(occupied), scene.id + ': finite budget sum');
          nonempty(visual.caption, scene.id + ': budget explanation');
          // Over-capacity states are intentional teaching examples, and retain the actual sum.
          if (occupied > visual.total) assert(/超|不足|放不|溢|峰值/.test(step.narration + visual.caption), scene.id + ': explain the over-capacity state');
        }
      }
    }
  }
  assert.equal(steps, 72, '18 scenes contain exactly 72 steps');
  assert(budgets > 0, 'course contains numeric budget examples');
  const memory = data.tracks.find(track => track.id === 'ai').scenes.find(scene => scene.id === 'A04');
  assert.deepEqual(memory.steps.map(step => step.visual.total), [24, 24, 24, 24], 'A04 memory capacity stays at 24 GB');
  assert.deepEqual(memory.steps.map(step => step.visual.segments.reduce((sum, segment) => sum + segment.value, 0)), [4, 8, 16, 25], 'A04 memory stages recompute to 4, 8, 16 and 25 GB');
  const contextBudget = data.tracks.find(track => track.id === 'agent').scenes.flatMap(scene => scene.steps)
    .map(step => step.visual).filter(visual => visual.kind === 'budget' && visual.total === 1000);
  assert(contextBudget.some(visual => visual.segments.reduce((sum, segment) => sum + segment.value, 0) === 1000), 'Agent context demonstrates the complete 1000-token budget');
  return { scenes: 18, steps, budgets };
}

// directory is a complete site artifact, such as dist or .pages/infra-guide.
function checkCourseArtifact({ directory = path.join(root, 'dist'), base = '/', origin = publicOrigin } = {}) {
  const data = loadCourseData();
  const counts = validateData(data);
  const courseDirectory = path.join(directory, 'courses');
  assert.deepEqual(fs.readdirSync(courseDirectory).sort(), ['course-data.js', 'course.css', 'index.html', 'player.js'], 'course deploys exactly four independent static files');
  const html = read(path.join(courseDirectory, 'index.html'));
  const sourceHTML = read(path.join(source, 'index.html'));
  assert(html.includes('<base href="' + base + '">'), 'course base path: ' + base);
  assert(html.includes('<link rel="canonical" href="' + courseCanonical + '">'), 'course canonical metadata');
  assert(html.includes('https://github.com/CaptainGreenskin/infra-guide'), 'course links to the public source repository');
  assert(!/COURSE_(?:FALLBACK|DIRECTORY)/.test(html), 'course build resolves both shell markers');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(([, src]) => src);
  assert.deepEqual(scripts, ['courses/course-data.js', 'courses/player.js'], 'course loads only its data and player scripts');
  assert(!/(?:reader-bootstrap|runtime-core|site-pages\.js|content\.js|app\.js|reader-full-runtime)/.test(html), 'course has no article runtime dependency');
  assert(html.includes('href="courses/course.css"'), 'course has its own stylesheet');
  for (const file of ['course.css', 'course-data.js', 'player.js']) {
    assert(fs.readFileSync(path.join(source, file)).equals(fs.readFileSync(path.join(courseDirectory, file))), file + ': deployed bytes match course source');
    nonempty(read(path.join(courseDirectory, file)), file + ': independent asset');
    if (file.endsWith('.js')) new vm.Script(read(path.join(courseDirectory, file)), { filename: file });
  }
  assert(!/(?:reader-bootstrap|runtime-core|site-pages\.js|content\.js|app\.js|reader-full-runtime)/.test(read(path.join(courseDirectory, 'player.js'))), 'player loads no article runtime');
  const identifiers = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(new Set(identifiers).size, identifiers.length, 'course HTML ids are unique');
  assert(identifiers.includes('course-app'), 'course has an independent application root');
  const buttons = [...html.matchAll(/<button\b[^>]*\bdata-scene="([^"]+)"[^>]*>/g)].map(([, id]) => id);
  const scenes = data.tracks.flatMap(track => track.scenes);
  assert.deepEqual(buttons, scenes.map(scene => scene.id), 'directory has all 18 scene buttons in teaching order');
  assert.deepEqual([...html.matchAll(/\bdata-directory-track="([^"]+)"/g)].map(([, id]) => id), data.tracks.map(track => track.id));
  assert.equal((html.match(/class="course-fallback-scene"/g) || []).length, 18, 'all 18 scenes have static fallback bodies');
  assert.equal((html.match(/<summary>讲师备注<\/summary>/g) || []).length, 72, 'all 72 instructor notes are readable without JavaScript');
  const text = plain(html);
  for (const scene of scenes) {
    assert(identifiers.includes('reading-' + scene.id), scene.id + ': direct fallback fragment');
    for (const value of [scene.title, scene.lead, scene.question, scene.answer, scene.evidence.text, ...scene.steps.flatMap(step => [step.label, step.narration, step.note])]) {
      assert(text.includes(value), scene.id + ': complete static teaching text');
    }
  }
  const css = read(path.join(courseDirectory, 'course.css'));
  assert(/\.course-fallback\s*\{[^}]*display\s*:\s*none/.test(css), 'enhanced course hides the static fallback');
  assert(/<noscript>[\s\S]*\.course-fallback\s*\{[^}]*display\s*:\s*(?:block|revert)/.test(html), 'noscript shows the complete static fallback');
  if (base === '/') {
    assert.equal(html, sourceHTML.replace('<!-- COURSE_DIRECTORY -->', () => renderDirectory(data))
      .replace('<!-- COURSE_FALLBACK -->', () => renderFallback(data)), 'root course HTML is reproducible from its source');
  }
  let links = 0;
  const siteURL = origin + base;
  function checkLink(raw, label) {
    if (/^(?:https?:|data:|mailto:|tel:)/.test(raw)) return;
    const url = new URL(raw.replaceAll('&amp;', '&'), siteURL);
    assert(url.pathname.startsWith(base), label + ': stays within hosted base');
    let target = path.join(directory, decodeURIComponent(url.pathname.slice(base.length)));
    if (url.pathname.endsWith('/')) target = path.join(target, 'index.html');
    assert(fs.existsSync(target), label + ': missing target ' + raw);
    if (url.hash && target.endsWith('.html')) {
      const id = decodeURIComponent(url.hash.slice(1));
      assert(read(target).includes('id="' + id + '"'), label + ': missing original fragment ' + raw);
    }
    links++;
  }
  for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) checkLink(href, 'course HTML');
  for (const scene of scenes) {
    for (const href of [scene.reading.href, scene.evidence.href].filter(Boolean)) {
      checkLink(href.startsWith('/') ? base + href.slice(1) : href, scene.id);
    }
  }
  return { ...counts, links };
}

module.exports = { checkCourseArtifact, validateData };
if (require.main === module) {
  const counts = checkCourseArtifact();
  console.log('PASS: independent animated courses / ' + counts.scenes + ' scenes / ' + counts.steps + ' steps / ' + counts.budgets + ' numeric budgets / ' + counts.links + ' local links, original fragments and readable fallback.');
}
