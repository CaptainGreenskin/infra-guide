/* A small, independent player. Teaching content lives in course-data.js. */
(() => {
  'use strict';
  const data = globalThis.InfraCourseData;
  const $ = id => document.getElementById(id);
  if (!data?.tracks?.length) {
    document.querySelector('.course-fallback').style.display = 'block';
    $('course-app').hidden = true;
    return;
  }
  const scenes = data.tracks.flatMap(track => track.scenes.map((scene, index) => ({ ...scene, track, index })));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const link = href => new URL(href.replace(/^\//, ''), document.baseURI).href;
  const number = value => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
  const kinds = { flow: '关系与路径', budget: '容量分配', matrix: '计算过程', timeline: '执行时序', ledger: '状态记录' };
  let sceneIndex = 0;
  let stepIndex = 0;
  let playing = false;
  let speaking = false;
  let timer;
  let toastTimer;
  let instructor = new URL(location.href).searchParams.get('mode') === 'instructor';
  const dialog = $('course-directory');
  const current = () => scenes[sceneIndex];
  const currentStep = () => current().steps[stepIndex];
  const tone = (color, index) => ['blue', 'teal', 'amber'].includes(color) ? color : ['blue', 'teal', 'amber'][index % 3];

  function toast(message) {
    clearTimeout(toastTimer);
    $('status').textContent = message;
    toastTimer = setTimeout(() => { $('status').textContent = ''; }, 3500);
  }

  function table(columns, rows, matrix = false) {
    return '<table class="diagram-table' + (matrix ? ' matrix-table' : '') + '"><thead><tr>' +
      columns.map(value => '<th scope="col">' + escape(value) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(row => '<tr' + (row.active ? ' class="active"' : '') + '>' + row.values.map((value, index) =>
        '<' + (index === 0 ? 'th scope="row"' : 'td') + '>' + escape(value) + '</' + (index === 0 ? 'th' : 'td') + '>').join('') + '</tr>').join('') + '</tbody></table>';
  }

  function draw(visual) {
    if (visual.kind === 'flow') {
      return '<div class="flow">' + visual.nodes.map((node, index) => {
        const previous = visual.nodes[index - 1];
        const edge = previous && visual.edges?.find(item => item.from === previous.id && item.to === node.id);
        return (index ? '<div class="flow-edge"><span>' + escape(edge?.label || '') + '</span><b aria-hidden="true">→</b></div>' : '') +
          '<div class="flow-node" data-state="' + escape(['active', 'done'].includes(node.state) ? node.state : 'waiting') + '"><span class="node-state">' + String(index + 1).padStart(2, '0') + ' · ' + ({ active: '正在发生', done: '已经完成' }[node.state] || '等待') +
          '</span><strong>' + escape(node.label) + '</strong><p>' + escape(node.detail) + '</p></div>';
      }).join('') + '</div>';
    }
    if (visual.kind === 'budget') {
      const sum = visual.segments.reduce((value, segment) => value + segment.value, 0);
      const scale = Math.max(sum, visual.total);
      return '<div class="budget"><div class="budget-header"><div><h3>' + escape(visual.label) + '</h3><div class="budget-amount">' + number(sum) + '<small> / ' + number(visual.total) + ' ' + escape(visual.unit) + '</small></div></div><span class="budget-limit' + (sum > visual.total ? ' over' : '') + '">' +
        (sum > visual.total ? '超出 ' + number(sum - visual.total) : '剩余 ' + number(visual.total - sum)) + ' ' + escape(visual.unit) + '</span></div><div class="budget-bar" role="img" aria-label="' + escape('占用 ' + sum + '，容量 ' + visual.total + ' ' + visual.unit) + '">' +
        visual.segments.map((segment, index) => '<span class="budget-segment tone-' + tone(segment.color, index) + '" style="width:' + (segment.value / scale * 100) + '%">' + (segment.value / scale > .09 ? number(segment.value) : '') + '</span>').join('') +
        '</div><div class="budget-legend">' + visual.segments.map((segment, index) => '<span class="budget-item"><i class="budget-dot tone-' + tone(segment.color, index) + '"></i>' + escape(segment.label) + '<b>' + number(segment.value) + ' ' + escape(visual.unit) + '</b></span>').join('') + '</div></div>';
    }
    if (visual.kind === 'matrix') {
      return table(['对象', ...visual.columns], visual.rows.map(row => ({ ...row, values: [row.label, ...row.values] })), true);
    }
    if (visual.kind === 'ledger') return table(visual.columns, visual.rows.map(values => ({ values })));
    if (visual.kind === 'timeline') {
      return '<div class="timeline">' + visual.lanes.map(lane => '<div class="timeline-lane"><strong class="lane-label">' + escape(lane.label) + '</strong><div class="lane-track">' +
        lane.segments.map((segment, index) => '<span class="lane-segment tone-' + tone(segment.tone, index) + '" style="left:' + (segment.start / visual.max * 100) + '%;width:' + ((segment.end - segment.start) / visual.max * 100) + '%" title="' + escape(segment.start + '–' + segment.end + ' ' + visual.unit) + '">' + escape(segment.label) + '</span>').join('') + '</div></div>').join('') +
        '<div class="timeline-scale"><span>0</span><span>' + number(visual.max) + ' ' + escape(visual.unit) + '</span></div><div class="timeline-key">' + visual.lanes.flatMap(lane => lane.segments.map(segment => '<span>' + escape(lane.label + ' · ' + segment.label) + '<b>' + number(segment.start) + '–' + number(segment.end) + ' ' + escape(visual.unit) + '</b></span>')).join('') + '</div></div>';
    }
    return '';
  }

  function speak() {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    if (!speaking || document.hidden || dialog.open) return;
    const utterance = new SpeechSynthesisUtterance(currentStep().narration);
    utterance.lang = 'zh-CN';
    utterance.rate = .95;
    const chinese = speechSynthesis.getVoices().find(voice => /^zh[-_]CN/i.test(voice.lang));
    if (chinese) utterance.voice = chinese;
    speechSynthesis.speak(utterance);
  }

  function animate() {
    $('diagram').classList.remove('enter');
    requestAnimationFrame(() => $('diagram').classList.add('enter'));
  }

  function schedule() {
    clearTimeout(timer);
    if (!playing || document.hidden || dialog.open) return;
    // Leave enough time to read Chinese narration; auto playback is explicitly enabled.
    const delay = Math.max(6500, Math.min(18000, currentStep().narration.length * 210));
    timer = setTimeout(() => {
      if (speaking && (speechSynthesis.speaking || speechSynthesis.pending)) {
        schedule();
        return;
      }
      if (sceneIndex === scenes.length - 1 && stepIndex === current().steps.length - 1) {
        setPlaying(false);
        toast('已读完全部课程，可以返回目录重看。');
      } else moveStep(1);
    }, delay);
  }

  function render() {
    const scene = current();
    const step = currentStep();
    document.title = scene.title + ' · 基础设施图解课 · InfraGuide';
    $('scene-position').textContent = scene.track.label + ' · ' + String(scene.index + 1).padStart(2, '0') + ' / ' + String(scene.track.scenes.length).padStart(2, '0');
    $('track-story').textContent = scene.track.description;
    $('scene-title').textContent = scene.title;
    $('scene-lead').textContent = scene.lead;
    $('step-number').textContent = String(stepIndex + 1).padStart(2, '0') + ' / ' + String(scene.steps.length).padStart(2, '0');
    $('step-label').textContent = step.label;
    $('diagram-kind').textContent = kinds[step.visual.kind];
    $('diagram').innerHTML = draw(step.visual);
    $('visual-caption').textContent = step.visual.caption || '';
    $('narration').textContent = step.narration;
    $('step-nav').innerHTML = scene.steps.map((item, index) => '<button type="button" data-step="' + index + '"' + (index === stepIndex ? ' aria-current="step"' : '') + (index < stepIndex ? ' data-complete="true"' : '') + '><span class="step-index">' + String(index + 1).padStart(2, '0') + '</span>' + escape(item.label) + '</button>').join('');
    $('check-question').textContent = scene.question;
    $('check-answer').textContent = scene.answer;
    $('self-check').open = false;
    $('reading-link').href = link(scene.reading.href);
    $('reading-link').textContent = '阅读全文：' + scene.reading.label.replace(/^继续读[：:]\s*/, '') + ' ↗';
    $('evidence-note').textContent = scene.evidence.kind + ' · ' + scene.evidence.text;
    if (scene.evidence.href) {
      const evidence = document.createElement('a');
      evidence.href = link(scene.evidence.href);
      evidence.textContent = ' 核对说明 ↗';
      $('evidence-note').append(evidence);
    }
    $('speaker-text').textContent = step.narration;
    $('speaker-note').textContent = step.note;
    const next = scene.steps[stepIndex + 1];
    $('speaker-next').textContent = next ? next.narration : scenes[sceneIndex + 1] ? '下一课：' + scenes[sceneIndex + 1].title : '课程结束。可以用思考题检查理解，再回到原文深入学习。';
    $('page-position').textContent = (sceneIndex + 1) + ' / ' + scenes.length;
    $('previous-scene').disabled = sceneIndex === 0;
    $('next-scene').disabled = sceneIndex === scenes.length - 1;
    $('previous-step').disabled = sceneIndex === 0 && stepIndex === 0;
    $('next-step').disabled = sceneIndex === scenes.length - 1 && stepIndex === scene.steps.length - 1;
    $('player-progress-fill').style.width = ((sceneIndex * 4 + stepIndex + 1) / (scenes.length * 4) * 100) + '%';
    $('footer-caption').textContent = scene.id + ' · 图解 ' + (stepIndex + 1) + ' / ' + scene.steps.length + ' · 原理与实验见原文';
    document.querySelectorAll('[data-track]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.track === scene.track.id)));
    dialog.querySelectorAll('[data-scene]').forEach(button => {
      if (button.dataset.scene === scene.id) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    animate();
    speak();
    schedule();
  }

  function readHash() {
    const match = location.hash.match(/^#([ACG]0[1-6])\/(\d+)$/);
    const fallback = location.hash.match(/^#reading-([ACG]0[1-6])$/);
    const index = scenes.findIndex(scene => scene.id === (match?.[1] || fallback?.[1]));
    sceneIndex = index >= 0 ? index : 0;
    stepIndex = match && index >= 0 ? Math.min(Number(match[2]), scenes[sceneIndex].steps.length - 1) : 0;
    if (!Number.isSafeInteger(stepIndex)) stepIndex = 0;
    const canonical = '#' + current().id + '/' + stepIndex;
    if (location.hash !== canonical && location.hash !== '#course-app') history.replaceState(null, '', location.pathname + location.search + canonical);
    render();
  }

  function go(index, step = 0) {
    if (index < 0 || index >= scenes.length) return;
    const hash = '#' + scenes[index].id + '/' + step;
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function moveStep(direction) {
    const step = stepIndex + direction;
    if (step < 0) {
      if (sceneIndex > 0) go(sceneIndex - 1, scenes[sceneIndex - 1].steps.length - 1);
    } else if (step >= current().steps.length) go(sceneIndex + 1);
    else go(sceneIndex, step);
  }

  function setPlaying(value) {
    playing = value;
    $('autoplay').setAttribute('aria-pressed', String(value));
    $('autoplay').textContent = value ? '暂停播放' : '自动播放';
    schedule();
  }

  function setInstructor(value) {
    instructor = value;
    $('instructor-notes').hidden = !value;
    $('notes-toggle').setAttribute('aria-pressed', String(value));
    $('notes-toggle').textContent = value ? '收起讲师提示' : '讲师模式';
    const url = new URL(location.href);
    if (value) url.searchParams.set('mode', 'instructor');
    else url.searchParams.delete('mode');
    history.replaceState(null, '', url);
  }

  function openDirectory() {
    dialog.showModal();
    clearTimeout(timer);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    dialog.querySelector('[aria-current="page"]')?.focus();
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { toast('当前浏览器暂不支持全屏，可以使用浏览器的全屏功能。'); }
  }

  $('track-nav').innerHTML = data.tracks.map(track => '<button type="button" data-track="' + escape(track.id) + '" aria-pressed="false">' + escape(track.label) + '</button>').join('');
  $('track-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-track]');
    if (button) go(scenes.findIndex(scene => scene.track.id === button.dataset.track));
  });
  $('step-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-step]');
    if (button) go(sceneIndex, Number(button.dataset.step));
  });
  dialog.addEventListener('click', event => {
    const button = event.target.closest('[data-scene]');
    if (button) {
      dialog.close();
      go(scenes.findIndex(scene => scene.id === button.dataset.scene));
    } else if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close', () => { speak(); schedule(); });
  $('directory-open').addEventListener('click', openDirectory);
  $('directory-close').addEventListener('click', () => dialog.close());
  $('previous-step').addEventListener('click', () => moveStep(-1));
  $('next-step').addEventListener('click', () => moveStep(1));
  $('previous-scene').addEventListener('click', () => go(sceneIndex - 1));
  $('next-scene').addEventListener('click', () => go(sceneIndex + 1));
  $('autoplay').addEventListener('click', () => setPlaying(!playing));
  $('replay').addEventListener('click', () => { animate(); speak(); schedule(); });
  $('notes-toggle').addEventListener('click', () => setInstructor(!instructor));
  $('notes-close').addEventListener('click', () => { setInstructor(false); $('notes-toggle').focus(); });
  $('handout').addEventListener('click', () => window.print());
  $('fullscreen').addEventListener('click', fullscreen);
  $('voice').addEventListener('click', () => {
    speaking = !speaking;
    $('voice').setAttribute('aria-pressed', String(speaking));
    $('voice').textContent = speaking ? '关闭朗读' : '朗读';
    speak();
  });
  if (!('speechSynthesis' in window)) {
    $('voice').disabled = true;
    $('voice').title = '当前浏览器没有提供语音朗读';
  }
  document.addEventListener('fullscreenchange', () => $('fullscreen').setAttribute('aria-pressed', String(Boolean(document.fullscreenElement))));
  document.addEventListener('visibilitychange', () => { speak(); schedule(); });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,select,[contenteditable="true"]') || dialog.open) return;
    // Leave native Enter/Space activation on focused controls intact.
    if ((event.key === ' ' || event.key === 'Enter') && event.target.closest('button,a,summary')) return;
    const actions = {
      ' ': () => moveStep(1), ArrowRight: () => moveStep(1), ArrowLeft: () => moveStep(-1),
      PageDown: () => go(sceneIndex + 1), PageUp: () => go(sceneIndex - 1),
      g: openDirectory, n: () => setInstructor(!instructor), f: fullscreen,
      r: () => { animate(); speak(); schedule(); }
    };
    const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (action) { event.preventDefault(); action(); }
  });
  window.addEventListener('hashchange', readHash);
  window.addEventListener('pagehide', () => { clearTimeout(timer); if ('speechSynthesis' in window) speechSynthesis.cancel(); });
  setInstructor(instructor);
  readHash();
})();
