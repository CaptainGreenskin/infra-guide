/* The animated course has its own source, assets and generated namespace. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'course');
const assets = ['course.css', 'course-data.js', 'player.js'];
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function loadCourseData() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(source, 'course-data.js'), 'utf8'), context, {
    filename: 'course-data.js', timeout: 1000
  });
  const data = JSON.parse(JSON.stringify(context.InfraCourseData));
  assert(data && Array.isArray(data.tracks), 'course-data.js must expose InfraCourseData.tracks');
  assert.deepEqual(data.tracks.map(track => track.id).sort(), ['agent', 'ai', 'cloud']);
  const ids = new Set();
  for (const track of data.tracks) {
    assert.equal(track.scenes.length, 6, track.id + ': six scenes');
    for (const scene of track.scenes) {
      assert(/^[ACG]0[1-6]$/.test(scene.id) && !ids.has(scene.id), 'unique scene id: ' + scene.id);
      ids.add(scene.id);
      assert.equal(scene.steps.length, 4, scene.id + ': four animation steps');
    }
  }
  return data;
}

function renderDirectory(data) {
  return data.tracks.map(track => '<section class="directory-track" data-directory-track="' + escapeHTML(track.id) + '">' +
    '<h3>' + escapeHTML(track.label) + '</h3><p>' + escapeHTML(track.description) + '</p><div class="directory-scenes">' +
    track.scenes.map(scene => '<button type="button" data-scene="' + escapeHTML(scene.id) + '">' +
      '<span>' + escapeHTML(scene.id) + '</span> ' + escapeHTML(scene.title) + '</button>').join('\n') +
    '</div></section>').join('\n');
}

function renderFallback(data) {
  const scenes = data.tracks.flatMap(track => track.scenes.map(scene => {
    const evidence = scene.evidence;
    return '<section class="course-fallback-scene" id="reading-' + escapeHTML(scene.id) + '">' +
      '<p>' + escapeHTML(track.label) + ' · ' + escapeHTML(scene.id) + '</p>' +
      '<h2>' + escapeHTML(scene.title) + '</h2><p>' + escapeHTML(scene.lead) + '</p>' +
      '<ol class="course-fallback-steps">' + scene.steps.map((step, index) => '<li>' +
        '<h3>' + (index + 1) + '. ' + escapeHTML(step.label) + '</h3>' +
        '<p>' + escapeHTML(step.narration) + '</p>' +
        '<details><summary>讲师备注</summary><p>' + escapeHTML(step.note) + '</p></details>' +
        '</li>').join('\n') + '</ol>' +
      '<h3>想一想</h3><p>' + escapeHTML(scene.question) + '</p>' +
      '<details><summary>参考答案</summary><p>' + escapeHTML(scene.answer) + '</p></details>' +
      '<p class="course-fallback-evidence"><strong>' + escapeHTML(evidence.kind) + '</strong>：' + escapeHTML(evidence.text) +
      (evidence.href ? ' <a href="' + escapeHTML(evidence.href) + '">核对说明与证据</a>' : '') + '</p>' +
      '<p><a href="' + escapeHTML(scene.reading.href) + '">返回原文：' + escapeHTML(scene.reading.label) + '</a></p>' +
      '</section>';
  }));
  return '<article class="course-fallback" aria-label="动画课文字讲义">' +
    '<h1>' + escapeHTML(data.title) + ' · 文字讲义</h1>' +
    '<p>按每页的四个步骤阅读；讲师备注、思考题与原文链接都保留在下方。</p>' +
    '<nav aria-label="文字讲义目录">' + data.tracks.map(track => '<p><strong>' + escapeHTML(track.label) + '</strong>：' +
      track.scenes.map(scene => '<a href="/courses/#reading-' + escapeHTML(scene.id) + '">' + escapeHTML(scene.id + ' ' + scene.title) + '</a>').join(' · ') + '</p>').join('\n') +
    '</nav>' + scenes.join('\n') + '</article>';
}

function buildCourses() {
  const data = loadCourseData();
  let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
  for (const [marker, replacement] of [
    ['<!-- COURSE_DIRECTORY -->', renderDirectory(data)],
    ['<!-- COURSE_FALLBACK -->', renderFallback(data)]
  ]) {
    assert.equal(html.split(marker).length, 2, 'one course shell marker: ' + marker);
    html = html.replace(marker, () => replacement);
  }
  const bytes = assets.map(file => [file, fs.readFileSync(path.join(source, file))]);
  const output = path.join(root, 'dist', 'courses');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'index.html'), html);
  for (const [file, content] of bytes) fs.writeFileSync(path.join(output, file), content);
  console.log('Built independent animated course: 3 directions / 18 scenes / 72 steps with readable HTML fallback.');
  return data;
}

module.exports = { loadCourseData, renderDirectory, renderFallback, buildCourses };
if (require.main === module) buildCourses();
