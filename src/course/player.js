/* 16:9 dark-editorial stage, dual-deck player, teleprompter & deterministic video bridge. */
(() => {
  'use strict';

  const lessonsData = globalThis.InfraCourseData;
  const overviewData = globalThis.InfraOverviewCourseData;
  const $ = id => document.getElementById(id);

  if (!lessonsData?.tracks?.length) {
    const fb = document.querySelector('.course-fallback');
    if (fb) fb.style.display = 'block';
    const app = $('course-app');
    if (app) app.hidden = true;
    return;
  }

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const link = href => new URL(String(href).replace(/^\//, ''), document.baseURI).href;
  const fmtNum = v => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(v);
  const kinds = { flow: '关系与路径', budget: '容量分配', matrix: '计算过程', timeline: '执行时序', ledger: '状态记录', custom: '结构图解' };

  function splitClauses(text, limit = 26) {
    const raw = String(text || '').trim();
    if (!raw) return [''];
    const sentences = raw.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [raw];
    const out = [];
    for (const s of sentences) {
      let rest = s.trim();
      while (rest.length > limit) {
        const candidates = [];
        for (let i = 0; i < Math.min(limit, rest.length); i++) {
          if ('，、：；,;'.includes(rest[i])) candidates.push(i + 1);
        }
        const cut = candidates.length && candidates[candidates.length - 1] >= Math.floor(limit * 0.45)
          ? candidates[candidates.length - 1]
          : limit;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) out.push(rest);
    }
    return out.length ? out : [raw];
  }

  function normalizeScenes(deckName) {
    if (deckName === 'overview' && overviewData?.chapters?.length) {
      return overviewData.chapters.flatMap((ch, chIdx) => ch.scenes.map((scene, sIdx) => ({
        ...scene,
        deck: 'overview',
        groupLabel: ch.label,
        groupDesc: ch.description,
        groupIndex: chIdx,
        groupCount: ch.scenes.length,
        inGroupIndex: sIdx,
        steps: scene.steps.map((st, idx) => ({
          ...st,
          index: idx,
          clauses: splitClauses(st.narration, 26)
        }))
      })));
    }
    return lessonsData.tracks.flatMap((track, tIdx) => track.scenes.map((scene, sIdx) => ({
      ...scene,
      deck: 'lessons',
      groupId: track.id,
      groupLabel: track.label,
      groupDesc: track.description,
      groupIndex: tIdx,
      groupCount: track.scenes.length,
      inGroupIndex: sIdx,
      steps: scene.steps.map((st, idx) => ({
        ...st,
        index: idx,
        kicker: `第 ${String(idx + 1).padStart(2, '0')} / ${String(scene.steps.length).padStart(2, '0')} 步 · ${st.label}`,
        clauses: splitClauses(st.narration, 26)
      }))
    })));
  }

  const decks = {
    lessons: normalizeScenes('lessons'),
    overview: normalizeScenes('overview')
  };

  let activeDeck = 'lessons';
  let sceneIndex = 0;
  let stepIndex = 0;
  let clauseIndex = 0;
  let playing = false;
  let speaking = false;
  let recording = false;
  let visualOnly = false;
  let headlessRender = false;
  let instructor = new URL(location.href).searchParams.get('mode') === 'instructor';
  let timer = null;
  let toastTimer = null;
  let pilotIdx = 0;

  const dialog = $('course-directory');
  const stage = $('stage');
  const viewport = $('stage-viewport');

  const scenes = () => decks[activeDeck];
  const current = () => scenes()[sceneIndex];
  const currentStep = () => current().steps[stepIndex];
  const currentClause = () => currentStep().clauses[clauseIndex] || currentStep().narration;
  const tone = (color, i) => ['blue', 'teal', 'amber', 'lavender'].includes(color) ? color : ['blue', 'teal', 'amber', 'lavender'][i % 4];

  function toast(msg) {
    clearTimeout(toastTimer);
    const el = $('status');
    if (!el) return;
    el.textContent = msg;
    toastTimer = setTimeout(() => { el.textContent = ''; }, 3200);
  }

  function resizeStage() {
    if (!stage || !viewport) return;
    if (headlessRender) {
      stage.style.transform = 'scale(1)';
      return;
    }
    const padX = recording ? 0 : 12;
    const padY = recording ? 0 : 12;
    const vw = Math.max(320, viewport.clientWidth - padX);
    const vh = Math.max(200, viewport.clientHeight - padY);
    const scale = Math.min(vw / 1920, vh / 1080);
    stage.style.transform = `scale(${scale.toFixed(4)})`;
  }

  // ---- Standard Visual Renderers (Dark Editorial 1920x1080) ----
  function renderTable(columns, rows, matrix = false, clauseRatio = 0) {
    const activeCount = rows.filter(r => r.active).length;
    const fallbackActive = activeCount === 0 ? Math.min(rows.length - 1, Math.floor(clauseRatio * rows.length)) : -1;
    return `<table class="diagram-table${matrix ? ' matrix-table' : ''}"><thead><tr>${
      columns.map(c => `<th scope="col">${esc(c)}</th>`).join('')
    }</tr></thead><tbody>${
      rows.map((r, rIdx) => {
        const isActive = r.active || rIdx === fallbackActive;
        return `<tr${isActive ? ' class="active"' : ''}>${r.values.map((val, i) =>
          `<${i === 0 ? 'th scope="row"' : 'td'}>${esc(val)}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`;
      }).join('')
    }</tbody></table>`;
  }

  // ---- Custom Vector SVG Diagrams for Panoramic Overview ----
  const C = {
    bg: '#101113', card: '#181c1a', card2: '#1f2421', border: '#2f3631',
    ink: '#f2efe7', muted: '#9ca193', subtle: '#6f756a',
    terracotta: '#ed8254', sage: '#bed6ae', sageDeep: '#3c4934',
    lavender: '#b39aff', sky: '#7cb3ff', danger: '#f27457'
  };

  function svgBox(x, y, w, h, { fill = C.card, stroke = C.border, r = 12, sw = 1.5, dash = '' } = {}) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  }
  function svgTxt(x, y, text, { size = 20, fill = C.ink, anchor = 'start', weight = 600, mono = false } = {}) {
    const font = mono ? 'var(--font-mono)' : 'var(--font-sans)';
    return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" font-family="${font}" text-anchor="${anchor}" dominant-baseline="central">${esc(text)}</text>`;
  }
  function svgArrow(x1, y1, x2, y2, color = C.terracotta, sw = 2.5) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const hx1 = x2 - 11 * Math.cos(a - 0.42), hy1 = y2 - 11 * Math.sin(a - 0.42);
    const hx2 = x2 - 11 * Math.cos(a + 0.42), hy2 = y2 - 11 * Math.sin(a + 0.42);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}"/><polygon points="${x2},${y2} ${hx1.toFixed(1)},${hy1.toFixed(1)} ${hx2.toFixed(1)},${hy2.toFixed(1)}" fill="${color}"/>`;
  }

  function renderCustomSVG(visual, clauseIdx, totalClauses) {
    const key = visual.svg || 'panorama-all';
    const p = totalClauses > 1 ? clauseIdx / (totalClauses - 1) : 1;
    let body = '';

    if (key === 'chat-single' || key === 'chat-concurrent' || key === 'chat-scale') {
      const count = key === 'chat-single' ? 1 : 12;
      body += svgBox(40, 40, 420, 470, { fill: '#141715', stroke: C.border, r: 16 });
      body += svgTxt(70, 80, key === 'chat-single' ? '用户窗口（单条）' : '12 位用户同时发送', { size: 22, fill: C.sage });
      for (let i = 0; i < (key === 'chat-single' ? 1 : 6); i++) {
        const y = 130 + i * 60;
        body += svgBox(66, y, 368, 46, { fill: '#1c211e', stroke: i === 0 || key !== 'chat-single' ? C.terracotta : C.border, r: 9 });
        body += svgTxt(86, y + 23, key === 'chat-single' ? '请解释什么是 AI Infra？' : `请求 #${String(i + 1).padStart(2, '0')} · 等待中…`, { size: 17, fill: C.ink, weight: 500 });
      }
      if (key !== 'chat-single') {
        body += svgTxt(250, 492, '… 共 12 条并发到达入口', { size: 17, fill: C.terracotta, anchor: 'middle' });
      }
      body += svgArrow(476, 275, 570, 275, C.terracotta, 3);
      body += svgBox(588, 120, 170, 310, { fill: '#191d1b', stroke: C.sage, r: 14, sw: 2 });
      body += svgTxt(673, 250, '服务入口', { size: 22, fill: C.sage, anchor: 'middle' });
      body += svgTxt(673, 286, `${count} 并发`, { size: 26, fill: C.terracotta, anchor: 'middle', mono: true });
      body += svgArrow(770, 275, 845, 275, C.sage, 3);
      body += svgBox(860, 50, 150, 450, { fill: '#141816', stroke: key === 'chat-scale' ? C.danger : C.lavender, r: 14, sw: 2 });
      body += svgTxt(935, 85, key === 'chat-scale' ? '双卡扩容' : 'GPU 显存', { size: 20, fill: C.ink, anchor: 'middle' });
      body += svgBox(882, 340, 106, 130, { fill: 'rgba(190,214,174,0.2)', stroke: C.sage, r: 8 });
      body += svgTxt(935, 405, '模型权重', { size: 16, fill: C.sage, anchor: 'middle' });
      const kvH = key === 'chat-single' ? 40 : key === 'chat-concurrent' ? 190 : 120;
      body += svgBox(882, 326 - kvH, 106, kvH, { fill: 'rgba(237,130,84,0.28)', stroke: C.terracotta, r: 8 });
      body += svgTxt(935, 326 - kvH / 2, 'KV 缓存', { size: 16, fill: C.terracotta, anchor: 'middle' });
    } else if (key.startsWith('pillars-')) {
      const active = key === 'pillars-app' ? 0 : key === 'pillars-algo' ? 1 : 2;
      const cards = [
        ['应用层 Application', '身份校验 · 检索制度文档 · 组装提示词', C.sky],
        ['算法层 Algorithm', '词表切分 · 模型参数 · 概率预测下词', C.sage],
        ['基础设施 Infra', '网络连通 · GPU 算力 · 缓存调度 · 监控恢复', C.terracotta]
      ];
      cards.forEach(([t, d, col], i) => {
        const y = 55 + i * 160;
        const isOn = i === active;
        body += svgBox(80, y, 880, 128, { fill: isOn ? 'rgba(237,130,84,0.1)' : C.card, stroke: isOn ? col : C.border, r: 14, sw: isOn ? 2.5 : 1.5 });
        body += svgTxt(118, y + 44, t, { size: 26, fill: isOn ? col : C.ink });
        body += svgTxt(118, y + 86, d, { size: 20, fill: isOn ? C.ink : C.muted, weight: 400 });
        if (i < 2) body += svgArrow(520, y + 132, 520, y + 156, C.subtle, 2);
      });
    } else if (key.startsWith('lifecycle-')) {
      const stageIdx = key === 'lifecycle-train' ? 0 : key === 'lifecycle-serve' ? 1 : 2;
      const items = [
        ['01 训练制品', '权重 + 分词器 + 摘要'],
        ['02 容器镜像', '推理引擎 + 驱动依赖'],
        ['03 就绪探活', '实跑推理校验通过'],
        ['04 灰度接流', '逐步切入线上流量']
      ];
      items.forEach(([t, d], i) => {
        const x = 45 + i * 246;
        const on = i <= stageIdx + (stageIdx === 2 ? 1 : 0);
        const cur = i === stageIdx || (stageIdx === 2 && i === 3);
        body += svgBox(x, 160, 214, 210, { fill: cur ? 'rgba(237,130,84,0.13)' : on ? 'rgba(190,214,174,0.08)' : C.card, stroke: cur ? C.terracotta : on ? C.sage : C.border, r: 14, sw: cur ? 2.5 : 1.5 });
        body += svgTxt(x + 107, 230, t, { size: 22, fill: cur ? C.terracotta : C.ink, anchor: 'middle' });
        body += svgTxt(x + 107, 282, d, { size: 16, fill: C.muted, anchor: 'middle', weight: 400 });
        if (i < 3) body += svgArrow(x + 216, 265, x + 242, 265, on ? C.sage : C.subtle, 2.5);
      });
    } else if (key.startsWith('panorama-')) {
      const layers = [
        ['硬件层', 'CPU · GPU · NPU | SSD · DDR · HBM | PCIe · NVLink', 0],
        ['设备接入', '操作系统 · GPU 驱动 | CUDA Runtime | 容器设备运行时', 0],
        ['计算与通信', 'CUDA C++ · Triton | cuBLAS · cuDNN | NCCL 跨卡通信', 1],
        ['模型执行', 'PyTorch 训练 · 分布式并行 | vLLM · SGLang · TensorRT-LLM', 1],
        ['集群与智能体', 'Docker · Kubernetes · Ray | MCP 工具契约 · 审批与恢复', 2]
      ];
      const activeGroup = key === 'panorama-hw' ? 0 : key === 'panorama-exec' ? 1 : 2;
      layers.forEach(([name, detail, grp], i) => {
        const y = 34 + i * 82;
        const on = grp === activeGroup || key === 'panorama-all';
        body += svgBox(60, y, 920, 68, { fill: on ? '#1a1f1c' : '#131614', stroke: on ? (grp === 2 ? C.terracotta : grp === 1 ? C.sage : C.sky) : C.border, r: 10, sw: on ? 2 : 1 });
        body += svgTxt(88, y + 34, name, { size: 20, fill: on ? C.terracotta : C.muted });
        body += svgTxt(260, y + 34, detail, { size: 18, fill: on ? C.ink : C.subtle, weight: 400 });
      });
      const obsOn = activeGroup === 2;
      body += svgBox(60, 464, 920, 64, { fill: obsOn ? 'rgba(179,154,255,0.14)' : '#141318', stroke: obsOn ? C.lavender : C.border, r: 10, dash: '6 4', sw: 2 });
      body += svgTxt(88, 496, '贯穿观测', { size: 20, fill: C.lavender });
      body += svgTxt(260, 496, 'Metrics 指标发现变慢 · Logs 核对事件 · Trace 定位跨层耗时', { size: 18, fill: C.ink, weight: 400 });
    } else if (key.startsWith('dns-') || key.startsWith('tls-')) {
      const step = key === 'dns-lookup' ? 0 : key === 'tls-frontend' ? 1 : 2;
      body += svgBox(50, 210, 170, 120, { fill: C.card, stroke: C.sky, r: 12 });
      body += svgTxt(135, 270, '客户端', { size: 22, fill: C.sky, anchor: 'middle' });
      body += svgBox(360, 46, 260, 96, { fill: step === 0 ? 'rgba(237,130,84,0.14)' : C.card, stroke: step === 0 ? C.terracotta : C.border, r: 12 });
      body += svgTxt(490, 94, '域名系统 DNS', { size: 21, fill: step === 0 ? C.terracotta : C.muted, anchor: 'middle' });
      body += svgArrow(165, 206, 354, 100, step === 0 ? C.terracotta : C.subtle, 2.5);
      body += svgBox(400, 210, 220, 120, { fill: step === 1 ? 'rgba(237,130,84,0.14)' : C.card, stroke: step >= 1 ? C.sage : C.border, r: 12 });
      body += svgTxt(510, 254, '入口代理 P', { size: 22, fill: C.sage, anchor: 'middle' });
      body += svgTxt(510, 290, 'HTTPS / TLS 终止', { size: 16, fill: C.muted, anchor: 'middle', weight: 400 });
      body += svgArrow(226, 270, 392, 270, step >= 1 ? C.terracotta : C.subtle, 3);
      body += svgTxt(308, 245, '前端加密连接', { size: 15, fill: step >= 1 ? C.terracotta : C.subtle, anchor: 'middle' });
      body += svgBox(780, 210, 200, 120, { fill: step === 2 ? 'rgba(237,130,84,0.14)' : C.card, stroke: step === 2 ? C.terracotta : C.border, r: 12 });
      body += svgTxt(880, 254, '后端应用 A', { size: 22, fill: step === 2 ? C.terracotta : C.ink, anchor: 'middle' });
      body += svgTxt(880, 290, '权限 + 查订单', { size: 16, fill: C.muted, anchor: 'middle', weight: 400 });
      body += svgArrow(626, 270, 774, 270, step === 2 ? C.sage : C.subtle, 3);
      body += svgTxt(700, 245, '独立后端连接', { size: 15, fill: step === 2 ? C.sage : C.subtle, anchor: 'middle' });
      body += svgBox(50, 410, 930, 80, { fill: '#151816', stroke: C.border, r: 10 });
      body += svgTxt(515, 450, step === 0 ? '① 先向 DNS 查到入口 P 的地址（后续正文不再经过 DNS）' : step === 1 ? '② 客户端验证 P 的证书，仍未验证后端 A 的可用性' : '③ 响应沿 A → P → 客户端原路返回，全链路需用请求 ID 对账', { size: 19, fill: C.ink, anchor: 'middle', weight: 500 });
    } else if (key.startsWith('cpu-')) {
      const segs = key === 'cpu-prep' ? [['CPU 10ms', 0, 10, C.sky]]
        : key === 'cpu-wait' ? [['CPU 10ms', 0, 10, C.sky], ['等待数据库 50ms', 10, 60, C.terracotta]]
        : [['CPU 10ms', 0, 10, C.sky], ['等待数据库 50ms', 10, 60, C.terracotta], ['CPU 20ms', 60, 80, C.sage]];
      const scaleX = x => 160 + (x / 80) * 800;
      body += svgTxt(520, 70, '单线程请求时间线（总耗时 80 ms = CPU 30 ms + 等待 50 ms）', { size: 22, fill: C.ink, anchor: 'middle' });
      body += svgBox(160, 130, 800, 76, { fill: '#1b1f1d', stroke: C.border, r: 10 });
      segs.forEach(([lbl, s, e, col]) => {
        const x = scaleX(s), w = scaleX(e) - x;
        body += svgBox(x + 2, 134, w - 4, 68, { fill: col, stroke: 'none', r: 7 });
        body += svgTxt(x + w / 2, 168, lbl, { size: 17, fill: '#101113', anchor: 'middle', weight: 700 });
      });
      if (key === 'cpu-compare') {
        body += svgTxt(520, 260, '假设 CPU 计算速度翻倍（30 ms → 15 ms）', { size: 20, fill: C.sage, anchor: 'middle' });
        body += svgBox(160, 300, 800, 76, { fill: '#1b1f1d', stroke: C.border, r: 10 });
        [['5', 0, 5, C.sky], ['等待仍为 50ms', 5, 55, C.terracotta], ['10', 55, 65, C.sage]].forEach(([lbl, s, e, col]) => {
          const x = scaleX(s), w = scaleX(e) - x;
          body += svgBox(x + 2, 304, w - 4, 68, { fill: col, stroke: 'none', r: 7 });
          body += svgTxt(x + w / 2, 338, lbl, { size: 16, fill: '#101113', anchor: 'middle', weight: 700 });
        });
        body += svgTxt(520, 440, '总耗时 80 ms → 65 ms：瓶在外部数据库等待，先查那 50 ms', { size: 21, fill: C.terracotta, anchor: 'middle' });
      }
    } else if (key.startsWith('tx-') || key.startsWith('recovery-')) {
      const isAgent = key.startsWith('recovery-');
      const stage = key.endsWith('intent') ? 0 : (key.endsWith('commit') || key.endsWith('lookup')) ? 1 : 2;
      body += svgBox(50, 90, 260, 220, { fill: C.card, stroke: C.sky, r: 14 });
      body += svgTxt(180, 140, isAgent ? '智能体任务库' : '调用方客户端', { size: 22, fill: C.sky, anchor: 'middle' });
      body += svgTxt(180, 195, isAgent ? '操作: 日报42:发布' : '操作: 支付确认104', { size: 17, fill: C.ink, anchor: 'middle', mono: true });
      body += svgTxt(180, 240, stage === 2 ? '状态: 认回原结果 ✓' : '状态: 持久保存意图', { size: 16, fill: C.sage, anchor: 'middle' });
      body += svgArrow(316, 170, 444, 170, C.terracotta, 3);
      body += svgTxt(380, 145, '携带操作身份', { size: 15, fill: C.terracotta, anchor: 'middle' });
      body += svgBox(450, 90, 520, 220, { fill: '#191d1a', stroke: C.sage, r: 14, sw: 2 });
      body += svgTxt(710, 134, isAgent ? '接收方系统（同一边界提交）' : '数据库事务（原子提交）', { size: 22, fill: C.sage, anchor: 'middle' });
      body += svgBox(480, 170, 215, 110, { fill: '#1f2622', stroke: C.border, r: 10 });
      body += svgTxt(587, 210, isAgent ? '日报正文: 42' : '订单 O-104: 已支付', { size: 18, fill: C.ink, anchor: 'middle' });
      body += svgTxt(587, 248, '业务数据写入', { size: 15, fill: C.muted, anchor: 'middle' });
      body += svgBox(725, 170, 215, 110, { fill: '#1f2622', stroke: C.terracotta, r: 10 });
      body += svgTxt(832, 210, '操作回执表', { size: 18, fill: C.terracotta, anchor: 'middle' });
      body += svgTxt(832, 248, '绑定身份与参数去重', { size: 15, fill: C.muted, anchor: 'middle' });
      if (stage >= 1) {
        body += svgArrow(444, 260, 316, 260, stage === 2 || isAgent ? C.sage : C.danger, 3);
        body += svgTxt(380, 290, isAgent ? '按原操作查回执' : (key.endsWith('lookup') ? '回包丢失 → 查回执认回' : '同事务提交成功'), { size: 16, fill: C.sage, anchor: 'middle' });
      }
      body += svgBox(50, 360, 920, 100, { fill: '#151816', stroke: C.border, r: 12 });
      body += svgTxt(510, 410, isAgent && key === 'recovery-resume' ? '崩溃重启后读取持久记录：来源(42)已完成、草稿已保存、仅继续等待批准' : '绝不因超时而换新操作重发：先按原操作身份查证，认回已存在的结果', { size: 19, fill: C.terracotta, anchor: 'middle' });
    } else if (key.startsWith('k8s-')) {
      const active = key === 'k8s-image' ? 0 : key === 'k8s-ready' ? 1 : 2;
      body += svgBox(50, 70, 270, 360, { fill: C.card, stroke: active === 0 ? C.terracotta : C.border, r: 14 });
      body += svgTxt(185, 115, '不可变容器镜像', { size: 22, fill: C.terracotta, anchor: 'middle' });
      ['应用代码 (v2)', '运行依赖与库', '启动配置 + 摘要'].forEach((t, i) => {
        body += svgBox(80, 160 + i * 74, 210, 56, { fill: '#1f2421', stroke: C.sage, r: 8 });
        body += svgTxt(185, 188 + i * 74, t, { size: 17, fill: C.ink, anchor: 'middle' });
      });
      body += svgArrow(326, 250, 404, 250, C.sage, 2.5);
      body += svgBox(410, 70, 560, 360, { fill: '#141715', stroke: active >= 1 ? C.sage : C.border, r: 14 });
      body += svgTxt(690, 112, 'Kubernetes 集群调谐', { size: 22, fill: C.sage, anchor: 'middle' });
      body += svgBox(440, 155, 230, 120, { fill: '#19211b', stroke: active === 1 ? C.terracotta : C.sage, r: 10 });
      body += svgTxt(555, 198, '新副本 v2', { size: 20, fill: C.ink, anchor: 'middle' });
      body += svgTxt(555, 236, active >= 1 ? '就绪探活通过 ✓' : '启动中…', { size: 16, fill: C.sage, anchor: 'middle' });
      body += svgBox(710, 155, 230, 120, { fill: '#1d1c1a', stroke: active === 2 ? C.muted : C.sky, r: 10 });
      body += svgTxt(825, 198, '旧副本 v1', { size: 20, fill: C.ink, anchor: 'middle' });
      body += svgTxt(825, 236, active === 2 ? '排空在途请求后退出' : '承担原有流量', { size: 16, fill: C.muted, anchor: 'middle' });
      body += svgBox(440, 310, 500, 90, { fill: '#191d1b', stroke: C.border, r: 10 });
      body += svgTxt(690, 355, active === 2 ? '回退前核对：旧镜像 + 旧配置 + 数据结构仍兼容' : '入口网关按就绪状态切流，避免冷启动报错', { size: 17, fill: C.terracotta, anchor: 'middle' });
    } else if (key.startsWith('backlog-')) {
      const stage = key === 'backlog-delay' ? 0 : key === 'backlog-peak' ? 1 : 2;
      body += svgTxt(520, 56, '到达 180/s · 旧能力 120/s · 扩容 120s 后生效至 200/s', { size: 22, fill: C.ink, anchor: 'middle' });
      body += svgBox(80, 110, 880, 290, { fill: '#141715', stroke: C.border, r: 14 });
      body += `<polyline points="120,350 380,${stage >= 1 ? 150 : 210} ${stage === 2 ? '880,350' : '380,150'}" fill="none" stroke="${C.terracotta}" stroke-width="5"/>`;
      body += `<line x1="120" y1="350" x2="900" y2="350" stroke="${C.subtle}" stroke-width="2"/>`;
      body += `<line x1="380" y1="130" x2="380" y2="360" stroke="${C.sage}" stroke-dasharray="6 4" stroke-width="2"/>`;
      body += svgTxt(380, 120, '第 120 秒：峰值积压 7,200 请求当量', { size: 19, fill: C.terracotta, anchor: 'middle' });
      if (stage === 2) {
        body += svgTxt(640, 230, '余力 200−180 = 20/s', { size: 20, fill: C.sage, anchor: 'middle' });
        body += svgTxt(880, 376, '第 480 秒清零', { size: 19, fill: C.sage, anchor: 'middle' });
      }
      body += svgTxt(120, 376, '0s', { size: 16, fill: C.muted, mono: true });
      body += svgTxt(380, 376, '120s', { size: 16, fill: C.muted, anchor: 'middle', mono: true });
    } else if (key.startsWith('token-') || key.startsWith('attn-')) {
      const isAttn = key.startsWith('attn-');
      if (!isAttn) {
        body += svgTxt(520, 64, '小模型固定输入 [0, 1] → 查两张表 → [2, 8] 表示', { size: 22, fill: C.ink, anchor: 'middle' });
        [0, 1].forEach((tok, i) => {
          const x = 140 + i * 420;
          body += svgBox(x, 120, 320, 110, { fill: C.card, stroke: C.terracotta, r: 12 });
          body += svgTxt(x + 160, 158, `位置 ${i} · 词元编号 ${tok}`, { size: 21, fill: C.terracotta, anchor: 'middle', mono: true });
          body += svgTxt(x + 160, 198, '词向量(8维) + 位置向量(8维)', { size: 17, fill: C.ink, anchor: 'middle' });
        });
        body += svgBox(140, 290, 740, 170, { fill: '#161a18', stroke: C.sage, r: 14 });
        body += svgTxt(510, 345, key === 'token-shape' ? '输入变成 4 格时：激活张量变成 [4, 8] = 32 项' : '词嵌入表 8×8 = 64 参数 · 位置表 4×8 = 32 参数', { size: 22, fill: C.sage, anchor: 'middle' });
        body += svgTxt(510, 400, key === 'token-shape' ? '但 8×8 词嵌入表仍然只有 64 个参数，被重复查表使用' : '编号只是查表行号，本身不代表语义大小', { size: 19, fill: C.muted, anchor: 'middle' });
      } else {
        body += svgTxt(520, 62, '固定末位=1，对比前文 [0, 1] 与 [4, 1]', { size: 22, fill: C.ink, anchor: 'middle' });
        [['[0, 1]', '55.46% 读前格', '下一词元 → 1', C.sage, 120], ['[4, 1]', '46.59% 读前格', '下一词元 → 7', C.terracotta, 300]].forEach(([inp, w, out, col, y]) => {
          body += svgBox(80, y, 220, 110, { fill: C.card, stroke: col, r: 12 });
          body += svgTxt(190, y + 55, inp, { size: 26, fill: col, anchor: 'middle', mono: true });
          body += svgArrow(308, y + 55, 420, y + 55, col, 3);
          body += svgBox(426, y, 240, 110, { fill: C.card, stroke: C.border, r: 12 });
          body += svgTxt(546, y + 55, w, { size: 20, fill: C.ink, anchor: 'middle' });
          body += svgArrow(672, y + 55, 760, y + 55, col, 3);
          body += svgBox(766, y, 200, 110, { fill: '#1a201d', stroke: col, r: 12 });
          body += svgTxt(866, y + 55, out, { size: 21, fill: col, anchor: 'middle', mono: true });
        });
      }
    } else if (key.startsWith('train-') || key.startsWith('ddp-') || key.startsWith('parallel-')) {
      if (key === 'ddp-gradient') {
        body += svgTxt(520, 66, '两进程有效目标数不同（甲 1 项，乙 3 项）', { size: 22, fill: C.ink, anchor: 'middle' });
        body += svgBox(80, 120, 410, 170, { fill: C.card, stroke: C.sage, r: 12 });
        body += svgTxt(285, 165, '甲：1 个目标 · 贡献和 2 · 均值 2', { size: 20, fill: C.sage, anchor: 'middle' });
        body += svgTxt(285, 225, '乙：3 个目标 · 贡献和 18 · 均值 6', { size: 20, fill: C.sky, anchor: 'middle' });
        body += svgBox(540, 120, 420, 170, { fill: 'rgba(190,214,174,0.12)', stroke: C.sage, r: 12, sw: 2 });
        body += svgTxt(750, 170, '全局等权正确：(2+18) ÷ (1+3) = 5', { size: 21, fill: C.sage, anchor: 'middle' });
        body += svgTxt(750, 230, '错误局部平均：(2+6) ÷ 2 = 4 ✕', { size: 20, fill: C.danger, anchor: 'middle' });
        body += svgBox(80, 340, 880, 110, { fill: '#151816', stroke: C.terracotta, r: 12 });
        body += svgTxt(520, 395, '甲乙两副本随后均用全局梯度 5 更新（10 − 0.1×5 = 9.5），保持同一优化目标', { size: 20, fill: C.terracotta, anchor: 'middle' });
      } else {
        body += svgTxt(520, 66, key === 'parallel-3d' ? '三维并行与检查点恢复' : '664 参数小模型一次训练更新', { size: 22, fill: C.ink, anchor: 'middle' });
        const boxes = key === 'parallel-3d'
          ? [['DP 数据并行', '复制模型 · 全局梯度同步', C.sky], ['TP / PP 模型切分', '层内矩阵 / 跨层切分', C.sage], ['Checkpoint 恢复', '权重 + 优化器 + 数据位点', C.terracotta]]
          : [['01 有效目标 = 4', '第一条 1 + 第二条 3', C.sky], ['02 平均损失 ≈ 8.628', '34.511747 ÷ 4', C.sage], ['03 参数更新 → 0.923456', '0.926543 − 0.05×0.061749', C.terracotta]];
        boxes.forEach(([t, d, col], i) => {
          const x = 60 + i * 316;
          body += svgBox(x, 150, 280, 240, { fill: C.card, stroke: col, r: 14, sw: 2 });
          body += svgTxt(x + 140, 230, t, { size: 21, fill: col, anchor: 'middle' });
          body += svgTxt(x + 140, 290, d, { size: 16, fill: C.ink, anchor: 'middle', weight: 400 });
          if (i < 2) body += svgArrow(x + 284, 270, x + 312, 270, C.muted, 2.5);
        });
      }
    } else if (key.startsWith('gpu-') || key.startsWith('cuda-') || key.startsWith('roofline-') || key.startsWith('operator-')) {
      if (key === 'cuda-grid') {
        body += svgBox(50, 70, 440, 380, { fill: '#151816', stroke: C.border, r: 14 });
        body += svgTxt(80, 108, 'add.cu', { size: 18, fill: C.terracotta, mono: true });
        const lines = ['__global__ void add(float* A, float* B, float* C) {', '  int i = blockDim.x * blockIdx.x + threadIdx.x;', '  if (i < n) C[i] = A[i] + B[i];', '}'];
        lines.forEach((l, i) => {
          if (i === 1) body += svgBox(66, 174, 408, 40, { fill: 'rgba(237,130,84,0.22)', stroke: C.terracotta, r: 6 });
          body += svgTxt(78, 150 + i * 44, l, { size: 14, fill: i === 1 ? C.terracotta : C.ink, mono: true, weight: 400 });
        });
        const a = [2, 9, 6, 3, 5, 7], b = [1, 2, 4, 8, 3, 6];
        for (let i = 0; i < 6; i++) {
          const x = 550 + i * 74, hi = i === 2;
          body += svgTxt(x + 28, 100, String(i), { size: 15, fill: hi ? C.terracotta : C.muted, anchor: 'middle', mono: true });
          body += svgBox(x, 126, 56, 56, { fill: hi ? 'rgba(237,130,84,0.2)' : C.card, stroke: hi ? C.terracotta : C.border, r: 8 });
          body += svgTxt(x + 28, 154, String(a[i]), { size: 20, fill: C.ink, anchor: 'middle', mono: true });
          body += svgBox(x, 206, 56, 56, { fill: hi ? 'rgba(237,130,84,0.2)' : C.card, stroke: hi ? C.terracotta : C.border, r: 8 });
          body += svgTxt(x + 28, 234, String(b[i]), { size: 20, fill: C.ink, anchor: 'middle', mono: true });
          body += svgBox(x, 306, 56, 56, { fill: hi ? 'rgba(190,214,174,0.22)' : C.card, stroke: hi ? C.sage : C.border, r: 8 });
          body += svgTxt(x + 28, 334, String(a[i] + b[i]), { size: 20, fill: hi ? C.sage : C.ink, anchor: 'middle', mono: true });
          if (hi) body += svgArrow(x + 28, 266, x + 28, 300, C.terracotta, 2.5);
        }
        body += svgTxt(770, 405, '下标 2 线程同时算出 6 + 4 = 10', { size: 19, fill: C.terracotta, anchor: 'middle' });
      } else if (key === 'roofline-curve' || key === 'operator-fusion') {
        body += svgBox(70, 60, 900, 400, { fill: '#141715', stroke: C.border, r: 14 });
        body += `<polyline points="140,390 480,140 900,140" fill="none" stroke="${C.sage}" stroke-width="4"/>`;
        body += svgTxt(300, 210, '显存带宽墙 (Memory-bound)', { size: 19, fill: C.terracotta, anchor: 'middle' });
        body += svgTxt(690, 114, '计算峰值墙 (Compute-bound)', { size: 19, fill: C.sage, anchor: 'middle' });
        body += `<circle cx="290" cy="310" r="11" fill="${C.terracotta}"/><circle cx="710" cy="185" r="11" fill="${C.sage}"/>`;
        body += svgTxt(290, 345, key === 'operator-fusion' ? '融合后减少往返 → 右移' : '逐元素 / 归一化', { size: 17, fill: C.ink, anchor: 'middle' });
        body += svgTxt(710, 220, '大矩阵乘法 GEMM', { size: 17, fill: C.ink, anchor: 'middle' });
      } else {
        body += svgBox(60, 90, 380, 320, { fill: C.card, stroke: C.sky, r: 14 });
        body += svgTxt(250, 140, 'CPU · 少数强核', { size: 23, fill: C.sky, anchor: 'middle' });
        body += svgTxt(250, 220, '擅长复杂控制与分支调度', { size: 18, fill: C.muted, anchor: 'middle' });
        body += svgBox(500, 90, 480, 320, { fill: '#161b18', stroke: C.sage, r: 14, sw: 2 });
        body += svgTxt(740, 130, 'GPU · 成千上万并发线程', { size: 23, fill: C.sage, anchor: 'middle' });
        for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
          const on = ((r + c + clauseIdx) % 3) < 2;
          body += svgBox(540 + c * 50, 175 + r * 44, 38, 32, { fill: on ? C.sage : '#243027', stroke: 'none', r: 5 });
        }
        body += svgTxt(740, 375, 'HBM 高带宽显存就地供数', { size: 18, fill: C.terracotta, anchor: 'middle' });
      }
    } else if (key.startsWith('vram-')) {
      const items = key === 'vram-static'
        ? [['参数 4 GB', 4, C.sky], ['梯度 4 GB', 4, C.sage], ['Adam 8 GB', 8, C.terracotta]]
        : [['参数 4', 4, C.sky], ['梯度 4', 4, C.sage], ['Adam 8', 8, C.terracotta], ['激活 6', 6, C.lavender], ['缓冲 3', 3, C.danger]];
      const total = items.reduce((a, b) => a + b[1], 0);
      body += svgTxt(520, 72, `10 亿参数 FP32 显存账（可用 24 GB · 当前 ${total} GB）`, { size: 24, fill: total > 24 ? C.danger : C.ink, anchor: 'middle' });
      body += svgBox(90, 150, 860, 84, { fill: '#1b1f1d', stroke: total > 24 ? C.danger : C.border, r: 10, sw: 2 });
      let x = 94;
      const scale = Math.max(25, total);
      items.forEach(([lbl, v, col]) => {
        const w = (v / scale) * 852;
        body += svgBox(x, 156, w - 4, 72, { fill: col, stroke: 'none', r: 6 });
        body += svgTxt(x + w / 2, 192, lbl, { size: 16, fill: '#101113', anchor: 'middle', weight: 700 });
        x += w;
      });
      body += `<line x1="${94 + (24 / scale) * 852}" y1="130" x2="${94 + (24 / scale) * 852}" y2="255" stroke="${C.ink}" stroke-dasharray="5 4" stroke-width="2.5"/>`;
      body += svgTxt(94 + (24 / scale) * 852, 278, '24 GB 上限', { size: 17, fill: C.ink, anchor: 'middle', mono: true });
      body += svgBox(90, 330, 860, 110, { fill: C.card, stroke: C.border, r: 12 });
      body += svgTxt(520, 385, key === 'vram-triage' ? '减微批/重计算省激活(6 GB) · 参数分片/混合精度摊薄长期状态(16 GB)' : '公式：4 + 4 + 8 + 6 + 3 = 25 GB（超出 1 GB）', { size: 20, fill: C.sage, anchor: 'middle' });
    } else if (key.startsWith('prefill-') || key.startsWith('decode-') || key.startsWith('kv-') || key.startsWith('paged-') || key.startsWith('continuous-') || key.startsWith('prefix-')) {
      if (key === 'paged-contiguous' || key === 'paged-blocks') {
        const paged = key === 'paged-blocks';
        body += svgTxt(520, 62, paged ? 'PagedAttention：逻辑块按块表映射离散物理块' : '传统连续预留：按最大长度占坑，物理碎片阻塞请求 D', { size: 22, fill: paged ? C.sage : C.terracotta, anchor: 'middle' });
        if (!paged) {
          [['请求 A (已用 3 / 预留 8)', 3, 8, C.sage], ['请求 B (已用 2 / 预留 8)', 2, 8, C.sky], ['请求 D 被迫排队等待', 0, 8, C.danger]].forEach(([lbl, used, res, col], r) => {
            const y = 130 + r * 110;
            body += svgTxt(80, y - 16, lbl, { size: 18, fill: col });
            for (let c = 0; c < res; c++) {
              body += svgBox(80 + c * 98, y + 6, 86, 50, { fill: c < used ? col : '#1c201e', stroke: c < used ? col : C.border, r: 6 });
            }
          });
        } else {
          body += svgBox(60, 120, 360, 320, { fill: C.card, stroke: C.sage, r: 12 });
          body += svgTxt(240, 158, '块表（逻辑 → 物理）', { size: 20, fill: C.sage, anchor: 'middle' });
          [['逻辑块 0', '物理块 #5', C.terracotta], ['逻辑块 1', '物理块 #1', C.terracotta], ['共享前缀块', '物理块 #2 (只读)', C.lavender]].forEach(([l, r, col], i) => {
            body += svgBox(90, 200 + i * 74, 300, 52, { fill: '#1e2320', stroke: col, r: 8 });
            body += svgTxt(240, 226 + i * 74, `${l}  →  ${r}`, { size: 17, fill: C.ink, anchor: 'middle', mono: true });
          });
          body += svgBox(480, 120, 500, 320, { fill: '#141715', stroke: C.border, r: 12 });
          body += svgTxt(730, 158, 'GPU 物理块池（4-token / 块）', { size: 20, fill: C.ink, anchor: 'middle' });
          for (let i = 0; i < 8; i++) {
            const x = 510 + (i % 4) * 114, y = 200 + Math.floor(i / 4) * 110;
            const col = (i === 1 || i === 5) ? C.terracotta : i === 2 ? C.lavender : (i === 0 || i === 4) ? C.sage : C.border;
            body += svgBox(x, y, 96, 84, { fill: col === C.border ? '#1a1d1b' : 'rgba(237,130,84,0.16)', stroke: col, r: 8 });
            body += svgTxt(x + 48, y + 42, `#${i}`, { size: 20, fill: col === C.border ? C.muted : C.ink, anchor: 'middle', mono: true });
          }
        }
      } else {
        const isPrefill = key === 'prefill-phase' || key === 'prefix-cache';
        body += svgTxt(520, 62, isPrefill ? '并行处理输入词元 / 复用前缀缓存' : '逐词 Decode / KV Cache 复用 / 连续批处理', { size: 22, fill: C.ink, anchor: 'middle' });
        const toks = ['什', '么', '是', 'AI', 'Infra', '?'];
        toks.forEach((tk, i) => {
          const x = 90 + i * 145;
          body += svgBox(x, 125, 118, 66, { fill: key === 'prefix-cache' && i < 3 ? 'rgba(179,154,255,0.22)' : C.card, stroke: isPrefill ? C.terracotta : C.sage, r: 10 });
          body += svgTxt(x + 59, 158, tk, { size: 22, fill: C.ink, anchor: 'middle' });
        });
        body += svgBox(90, 245, 840, 110, { fill: 'rgba(179,154,255,0.12)', stroke: C.lavender, r: 12 });
        body += svgTxt(510, 300, key === 'continuous-batch' ? '连续批处理：每轮结束立刻释放已完成槽位，接入排队请求' : '已计算位置的 KV Cache（新词元仅算自身 Q/K/V 并拼接读取）', { size: 20, fill: C.lavender, anchor: 'middle' });
        body += svgBox(90, 390, 840, 74, { fill: '#181c1a', stroke: C.terracotta, r: 10 });
        body += svgTxt(510, 427, isPrefill ? '决定首字等待 TTFT（计算受限）' : '决定吐字间隔 TPOT（显存带宽受限）', { size: 20, fill: C.terracotta, anchor: 'middle' });
      }
    } else if (key.startsWith('ttft-') || key.startsWith('obs-') || key.startsWith('triage-')) {
      if (key === 'ttft-queue') {
        body += svgBox(50, 70, 280, 370, { fill: C.card, stroke: C.terracotta, r: 14 });
        body += svgTxt(190, 130, '24 并发', { size: 38, fill: C.ink, anchor: 'middle', mono: true });
        body += svgTxt(190, 220, 'TTFT  1,300 ms', { size: 26, fill: C.terracotta, anchor: 'middle', mono: true });
        body += svgTxt(190, 280, 'TPOT     75 ms', { size: 24, fill: C.sage, anchor: 'middle', mono: true });
        body += svgBox(370, 70, 610, 370, { fill: '#141715', stroke: C.border, r: 14 });
        body += svgTxt(410, 125, 'TTFT 拆解：排队 950 ms + 其余 350 ms', { size: 21, fill: C.ink });
        body += svgBox(410, 165, 390, 64, { fill: C.terracotta, stroke: 'none', r: 8 });
        body += svgTxt(605, 197, '排队 950 ms', { size: 19, fill: '#101113', anchor: 'middle', weight: 700 });
        body += svgBox(806, 165, 144, 64, { fill: C.sage, stroke: 'none', r: 8 });
        body += svgTxt(878, 197, '350 ms', { size: 18, fill: '#101113', anchor: 'middle', weight: 700 });
        body += svgTxt(410, 285, '等待队列：8 条积压', { size: 18, fill: C.muted });
        body += svgTxt(410, 345, '显存占用：94%', { size: 18, fill: C.lavender });
        body += svgBox(560, 330, 360, 28, { fill: '#1e2220', stroke: C.border, r: 6 });
        body += svgBox(562, 332, 336, 24, { fill: C.lavender, stroke: 'none', r: 4 });
      } else if (key.startsWith('obs-')) {
        const isFlame = key === 'obs-flame';
        body += svgTxt(520, 56, isFlame ? '同一条 Trace 横跨网关、引擎与工具，锁定耗时大头' : '指标发现趋势 · Trace 切分跨度 · 日志核对现场', { size: 21, fill: C.ink, anchor: 'middle' });
        body += svgBox(60, 96, 920, 320, { fill: '#141715', stroke: C.border, r: 14 });
        const spans = [
          ['入口网关', 0, 140, C.sky, '140 ms · 校验与路由'],
          ['推理排队', 140, 620, C.terracotta, '950 ms · 等待 KV/槽位'],
          ['GPU 推理', 620, 810, C.sage, '240 ms · Prefill/Decode'],
          ['MCP 工具', 810, 960, isFlame ? C.danger : C.lavender, '180 ms · 权限核对+回读']
        ];
        spans.forEach(([lbl, x1, x2, col, note], i) => {
          const y = 136 + i * 68;
          const sx = 230 + (x1 / 1000) * 700, sw = Math.max(24, ((x2 - x1) / 1000) * 700);
          body += svgTxt(90, y + 20, lbl, { size: 17, fill: col });
          body += svgBox(sx, y + 2, sw, 36, { fill: col, stroke: 'none', r: 6 });
          body += svgTxt(Math.min(sx + sw + 14, 710), y + 20, note, { size: 15, fill: i === clauseIdx % 4 ? C.ink : C.muted, weight: 500 });
        });
        body += svgBox(60, 434, 920, 68, { fill: 'rgba(179,154,255,0.1)', stroke: C.lavender, r: 10, dash: '5 4' });
        body += svgTxt(520, 468, 'Trace ID 串联全栈：不靠猜，先看哪一段跨度占比最高', { size: 18, fill: C.lavender, anchor: 'middle' });
      } else {
        const stepTwo = key === 'triage-step2';
        body += svgTxt(520, 58, stepTwo ? '第二关：拆分静态权重、KV Cache 与算力/带宽墙' : '第一关：先分清“算得慢”还是“排在门外等”', { size: 21, fill: C.ink, anchor: 'middle' });
        const rows = [
          ['01 入口与排队', '对照客户端 TTFT 与服务端等待队列长度', C.terracotta, !stepTwo],
          ['02 静态与动态显存', '检查权重占比 vs KV Cache 水位与分页碎片', C.lavender, stepTwo],
          ['03 算力与带宽瓶颈', 'Prefill 算力墙 vs Decode 显存带宽墙', C.sage, stepTwo],
          ['04 统一 Trace 对账', '同请求号贯穿网关、引擎与外部工具调用', C.sky, true]
        ];
        rows.forEach(([t, d, col, hi], i) => {
          const y = 104 + i * 98;
          body += svgBox(80, y, 880, 78, { fill: hi ? 'rgba(237,130,84,0.08)' : C.card, stroke: hi ? col : C.border, r: 10, sw: hi ? 2 : 1.5 });
          body += svgTxt(114, y + 39, t, { size: 21, fill: col });
          body += svgTxt(360, y + 39, d, { size: 19, fill: hi ? C.ink : C.muted, weight: 400 });
        });
      }
    } else if (key === 'cloud-summary' || key === 'cloud-to-ai') {
      const toAi = key === 'cloud-to-ai';
      body += svgTxt(520, 56, toAi ? '把订单查询后端换成大模型与 GPU：服务契约依然生效' : 'Cloud Infra 五项基石体检表', { size: 22, fill: C.ink, anchor: 'middle' });
      const items = [
        ['01 两段连接', 'DNS 解析 + 前端/后端独立连接', C.sky],
        ['02 执行与等待', '拆开 CPU 耗时与外部 I/O 等待', C.sage],
        ['03 事务与回执', '同事务提交状态与操作回执去重', C.terracotta],
        ['04 灰度与退路', '不可变镜像 + 就绪探活 + 排空回退', C.lavender],
        ['05 扩容余力', '计入生效延迟，留出清积压余力', C.sage]
      ];
      items.forEach(([t, d, col], i) => {
        const y = 100 + i * 74;
        body += svgBox(70, y, toAi ? 580 : 900, 60, { fill: C.card, stroke: i === clauseIdx % 5 ? col : C.border, r: 10, sw: 1.8 });
        body += svgTxt(98, y + 30, t, { size: 19, fill: col });
        body += svgTxt(265, y + 30, d, { size: 17, fill: C.ink, weight: 400 });
      });
      if (toAi) {
        body += svgArrow(660, 285, 725, 285, C.terracotta, 3);
        body += svgBox(735, 115, 240, 340, { fill: 'rgba(237,130,84,0.12)', stroke: C.terracotta, r: 14, sw: 2 });
        body += svgTxt(855, 240, '下一站', { size: 18, fill: C.muted, anchor: 'middle' });
        body += svgTxt(855, 285, 'AI 模型与 GPU', { size: 22, fill: C.terracotta, anchor: 'middle' });
        body += svgTxt(855, 330, '词元 · 显存 · 推理', { size: 17, fill: C.sage, anchor: 'middle' });
      }
    } else if (key === 'context-budget') {
      body += svgTxt(520, 68, '1000 词元输入与输出总预算（来源标记不可省）', { size: 22, fill: C.ink, anchor: 'middle' });
      body += svgBox(80, 140, 880, 84, { fill: '#1b1f1d', stroke: C.sage, r: 10, sw: 2 });
      const segs = [['系统说明 200', 200, C.sky], ['当前任务 100', 100, C.sage], ['合格证据与来源 400', 400, C.terracotta], ['输出预留 300', 300, C.lavender]];
      let sx = 84;
      segs.forEach(([lbl, v, col]) => {
        const w = (v / 1000) * 872;
        body += svgBox(sx, 146, w - 4, 72, { fill: col, stroke: 'none', r: 6 });
        body += svgTxt(sx + w / 2, 182, lbl, { size: 16, fill: '#101113', anchor: 'middle', weight: 700 });
        sx += w;
      });
      body += svgBox(80, 275, 420, 170, { fill: C.card, stroke: C.danger, r: 12 });
      body += svgTxt(290, 326, '旧摘要 “总数 37” ✕', { size: 20, fill: C.danger, anchor: 'middle' });
      body += svgTxt(290, 378, '不得覆盖已确认的新来源或绕过权限过滤', { size: 16, fill: C.muted, anchor: 'middle', weight: 400 });
      body += svgBox(540, 275, 420, 170, { fill: C.card, stroke: C.sage, r: 12 });
      body += svgTxt(750, 326, '合格材料 37 + 5 = 42 ✓', { size: 20, fill: C.sage, anchor: 'middle' });
      body += svgTxt(750, 378, '发送前复核来源版本与当前读取权限', { size: 16, fill: C.ink, anchor: 'middle', weight: 400 });
    } else if (key === 'approval-bind') {
      body += svgTxt(520, 62, '批准必须绑定任务、来源与当前 42 草稿内容', { size: 22, fill: C.ink, anchor: 'middle' });
      body += svgBox(60, 120, 410, 175, { fill: 'rgba(242,116,87,0.1)', stroke: C.danger, r: 14, sw: 2 });
      body += svgTxt(265, 165, '旧批准：针对 37 草稿 ✕', { size: 21, fill: C.danger, anchor: 'middle' });
      body += svgTxt(265, 215, '来源：仅原订单 · 纳入补录后已失效', { size: 17, fill: C.muted, anchor: 'middle', weight: 400 });
      body += svgBox(570, 120, 410, 175, { fill: 'rgba(190,214,174,0.1)', stroke: C.sage, r: 14, sw: 2 });
      body += svgTxt(775, 165, '新批准：绑定 42 草稿 ✓', { size: 21, fill: C.sage, anchor: 'middle' });
      body += svgTxt(775, 215, '来源：原 37 + 补录 5 · 目标 A 日报', { size: 17, fill: C.ink, anchor: 'middle', weight: 400 });
      body += svgBox(60, 340, 920, 130, { fill: C.card, stroke: C.terracotta, r: 14, sw: 2 });
      body += svgTxt(520, 385, '提交边界三项核对：可信主体身份 + 此刻仍被授权 + 匹配 42 草稿', { size: 20, fill: C.terracotta, anchor: 'middle' });
      body += svgTxt(520, 430, '全部通过才提交写入，并在发布后独立回读验收', { size: 17, fill: C.muted, anchor: 'middle', weight: 400 });
    } else if (key.startsWith('agent-') || key.startsWith('tool-')) {
      const isTool = key.startsWith('tool-');
      const cards = isTool
        ? [['模型提议', '建议工具名与参数', C.sky], ['运行时准入', '等拼装完 · 查结构/权限/预算', C.terracotta], ['MCP 工具/沙箱', '可信身份 · 资源端二次鉴权', C.sage], ['结构化观察', '分级错误后再进下一轮', C.lavender]]
        : [['任务契约', '目标/来源/权限/停止条件', C.sky], ['读取原始订单', '10 + 27 = 37（带来源）', C.sage], ['纳入补录', '37 + 5 = 42 更新草稿', C.terracotta], ['独立验收器', '回读目标位置验真 42', C.lavender]];
      body += svgTxt(520, 66, isTool ? '把模型提议与真正改资源之间隔出三道检查' : '以 A 的日报 37 + 5 = 42 讲清可验收契约', { size: 21, fill: C.ink, anchor: 'middle' });
      cards.forEach(([t, d, col], i) => {
        const x = 44 + i * 244;
        const on = i <= Math.max(0, Math.min(3, Math.round(p * 3)));
        body += svgBox(x, 145, 218, 220, { fill: on ? 'rgba(237,130,84,0.09)' : C.card, stroke: on ? col : C.border, r: 14, sw: 2 });
        body += svgTxt(x + 109, 195, `0${i + 1} · ${t}`, { size: 18, fill: col, anchor: 'middle' });
        body += svgTxt(x + 109, 265, d, { size: 15, fill: C.ink, anchor: 'middle', weight: 400 });
        if (i < 3) body += svgArrow(x + 220, 255, x + 240, 255, on ? col : C.subtle, 2.5);
      });
      body += svgBox(44, 405, 950, 74, { fill: '#151816', stroke: C.border, r: 10 });
      body += svgTxt(519, 442, isTool ? '连接成功 ≠ 业务成功；越界提议不得消耗未授权资源' : '模型说“已保存”不算完成；真实产物可读且来源一致才算通过', { size: 18, fill: C.sage, anchor: 'middle' });
    } else if (key.startsWith('e2e-')) {
      const second = key === 'e2e-agent';
      body += svgTxt(520, 56, second ? '后半程：Agent 准入、幂等回执与独立验收' : '前半程：Cloud 护送接入，AI 引擎与 GPU 高效计算', { size: 21, fill: C.ink, anchor: 'middle' });
      const hops = [
        ['Cloud 入口', 'DNS · 两段 TLS · K8s 就绪', C.sky, !second],
        ['AI 推理引擎', 'Paged KV · 连续批 · GPU 算子', C.sage, !second],
        ['Agent 运行时', '契约 · 权限 · 批准绑定', C.terracotta, second],
        ['工具与观测', '回执对账 · 独立验真 · Trace', C.lavender, second]
      ];
      hops.forEach(([t, d, col, hi], i) => {
        const x = 44 + i * 244;
        body += svgBox(x, 150, 218, 220, { fill: hi ? 'rgba(190,214,174,0.09)' : C.card, stroke: hi ? col : C.border, r: 14, sw: hi ? 2.5 : 1.5 });
        body += svgTxt(x + 109, 210, t, { size: 20, fill: col, anchor: 'middle' });
        body += svgTxt(x + 109, 275, d, { size: 15, fill: hi ? C.ink : C.muted, anchor: 'middle', weight: 400 });
        if (i < 3) body += svgArrow(x + 220, 260, x + 240, 260, C.terracotta, 2.5);
      });
      body += svgBox(44, 412, 950, 68, { fill: '#151816', stroke: C.border, r: 10 });
      body += svgTxt(519, 446, '三条基础设施主线在同一条请求上完成闭环', { size: 19, fill: C.terracotta, anchor: 'middle' });
    } else if (key.startsWith('roadmap-')) {
      const labs = key === 'roadmap-labs';
      body += svgTxt(520, 56, labs ? '从全景骨架走进可复跑实验与 78 章正文' : '三条主线 + 七条岗位路线，逐层深入学习', { size: 22, fill: C.ink, anchor: 'middle' });
      const tracks = [
        ['Cloud Infra（C1–C9）', '云平台工程师 · SRE 与可靠性', C.sky],
        ['AI Infra（A1–A3）', 'AI 训练系统 · 大模型推理 · GPU 算子', C.terracotta],
        ['Agent Infra（G1–G10）', 'Agent 应用工程 · Agent 运行时平台', C.sage]
      ];
      tracks.forEach(([t, r, col], i) => {
        const y = 112 + i * 116;
        body += svgBox(70, y, 900, 92, { fill: C.card, stroke: col, r: 12, sw: 2 });
        body += svgTxt(106, y + 46, t, { size: 22, fill: col });
        body += svgTxt(470, y + 46, r, { size: 19, fill: C.ink, weight: 400 });
      });
      body += svgTxt(520, 476, labs ? '配合 18 节专题算例、本地实验源码与 78 章原文验证理解' : '点击顶部「18 节专题课」或页面下方「阅读原文」立即继续', { size: 18, fill: C.muted, anchor: 'middle' });
    }

    return `<div class="svg-stage-wrap"><svg viewBox="0 0 1040 540" aria-hidden="true">${body}</svg></div>`;
  }

  function drawVisual(visual, clauseIdx, totalClauses) {
    const ratio = totalClauses > 1 ? clauseIdx / (totalClauses - 1) : 1;
    if (visual.kind === 'custom') return renderCustomSVG(visual, clauseIdx, totalClauses);
    if (visual.kind === 'flow') {
      return '<div class="flow">' + visual.nodes.map((node, index) => {
        const prev = visual.nodes[index - 1];
        const edge = prev && visual.edges?.find(item => item.from === prev.id && item.to === node.id);
        const st = ['active', 'done'].includes(node.state) ? node.state : 'waiting';
        return (index ? `<div class="flow-edge"><span>${esc(edge?.label || '')}</span><b aria-hidden="true">→</b></div>` : '') +
          `<div class="flow-node" data-state="${esc(st)}"><span class="node-state">${String(index + 1).padStart(2, '0')} · ${
            ({ active: '正在发生', done: '已经完成' }[st] || '等待')
          }</span><strong>${esc(node.label)}</strong><p>${esc(node.detail)}</p></div>`;
      }).join('') + '</div>';
    }
    if (visual.kind === 'budget') {
      const sum = visual.segments.reduce((v, s) => v + s.value, 0);
      const scale = Math.max(sum, visual.total);
      return `<div class="budget"><div class="budget-header"><div><h3>${esc(visual.label)}</h3><div class="budget-amount">${fmtNum(sum)}<small>/ ${fmtNum(visual.total)} ${esc(visual.unit)}</small></div></div><span class="budget-limit${sum > visual.total ? ' over' : ''}">${
        sum > visual.total ? '超出 ' + fmtNum(sum - visual.total) : '剩余 ' + fmtNum(visual.total - sum)
      } ${esc(visual.unit)}</span></div><div class="budget-bar" role="img" aria-label="${esc('占用 ' + sum + '，容量 ' + visual.total + ' ' + visual.unit)}">${
        visual.segments.map((seg, i) => `<span class="budget-segment tone-${tone(seg.color, i)}" style="width:${seg.value / scale * 100}%">${seg.value / scale > 0.08 ? fmtNum(seg.value) : ''}</span>`).join('')
      }</div><div class="budget-legend">${
        visual.segments.map((seg, i) => `<span class="budget-item"><i class="budget-dot tone-${tone(seg.color, i)}"></i>${esc(seg.label)}<b>${fmtNum(seg.value)} ${esc(visual.unit)}</b></span>`).join('')
      }</div></div>`;
    }
    if (visual.kind === 'matrix') {
      return renderTable(['对象', ...visual.columns], visual.rows.map(r => ({ ...r, values: [r.label, ...r.values] })), true, ratio);
    }
    if (visual.kind === 'ledger') {
      return renderTable(visual.columns, visual.rows.map(values => ({ values })), false, ratio);
    }
    if (visual.kind === 'timeline') {
      return `<div class="timeline">${
        visual.lanes.map(lane => `<div class="timeline-lane"><strong class="lane-label">${esc(lane.label)}</strong><div class="lane-track">${
          lane.segments.map((seg, i) => `<span class="lane-segment tone-${tone(seg.tone, i)}" style="left:${seg.start / visual.max * 100}%;width:${(seg.end - seg.start) / visual.max * 100}%">${esc(seg.label)}</span>`).join('')
        }</div></div>`).join('')
      }<div class="timeline-scale"><span>0</span><span>${fmtNum(visual.max)} ${esc(visual.unit)}</span></div><div class="timeline-key">${
        visual.lanes.flatMap(l => l.segments.map(seg => `<span>${esc(l.label + ' · ' + seg.label)}<b>${fmtNum(seg.start)}–${fmtNum(seg.end)} ${esc(visual.unit)}</b></span>`)).join('')
      }</div></div>`;
    }
    return '';
  }

  function renderNavAndSelect() {
    const list = scenes();
    const cur = current();
    if ($('deck-lessons')) $('deck-lessons').setAttribute('aria-pressed', String(activeDeck === 'lessons'));
    if ($('deck-overview')) $('deck-overview').setAttribute('aria-pressed', String(activeDeck === 'overview'));
    if ($('deck-badge')) $('deck-badge').textContent = activeDeck === 'overview' ? '全景 30 幕' : '图解课';

    const groups = [];
    const seen = new Set();
    for (const s of list) {
      const k = activeDeck === 'overview' ? s.groupLabel : s.groupId;
      if (!seen.has(k)) {
        seen.add(k);
        groups.push({ key: k, label: s.groupLabel, firstId: s.id });
      }
    }
    $('track-nav').innerHTML = groups.map(g =>
      `<button type="button" data-group="${esc(g.firstId)}" aria-pressed="${String(cur.groupLabel === g.label)}">${esc(g.label)}</button>`
    ).join('');

    const sel = $('chapter-select');
    if (sel) {
      sel.innerHTML = list.map((s, idx) => `<option value="${idx}">${esc(s.id + ' · ' + s.title)}</option>`).join('');
      sel.value = String(sceneIndex);
    }

    const overviewGroupsEl = $('directory-groups-overview');
    if (overviewGroupsEl && overviewData?.chapters?.length && !overviewGroupsEl.dataset.populated) {
      overviewGroupsEl.dataset.populated = '1';
      overviewGroupsEl.innerHTML = overviewData.chapters.map(ch =>
        `<section class="directory-track"><h3>${esc(ch.label)}</h3><p>${esc(ch.description)}</p><div class="directory-scenes">${
          ch.scenes.map(sc => `<button type="button" data-overview-scene="${esc(sc.id)}"><span>${esc(sc.id)}</span> ${esc(sc.title)}</button>`).join('')
        }</div></section>`
      ).join('');
    }
  }

  function render() {
    const list = scenes();
    const scene = current();
    const step = currentStep();
    const totalBeatsInScene = scene.steps.reduce((acc, st) => acc + st.clauses.length, 0);
    const completedBeatsBeforeStep = scene.steps.slice(0, stepIndex).reduce((acc, st) => acc + st.clauses.length, 0);
    const currentBeatFlat = completedBeatsBeforeStep + clauseIndex;

    document.title = `${scene.title} · InfraGuide`;
    $('scene-position').textContent = `${scene.groupLabel} · ${String(scene.inGroupIndex + 1).padStart(2, '0')} / ${String(scene.groupCount).padStart(2, '0')}`;
    $('track-story').textContent = scene.groupDesc || '';
    $('stage-folio').textContent = `${String(sceneIndex + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`;
    $('step-kicker').textContent = step.kicker || `第 ${String(stepIndex + 1).padStart(2, '0')} 步`;
    $('scene-title').textContent = scene.title;
    $('scene-lead').textContent = scene.lead;
    $('step-number').textContent = `${String(stepIndex + 1).padStart(2, '0')} / ${String(scene.steps.length).padStart(2, '0')}`;
    $('step-label').textContent = step.label;
    $('diagram-kind').textContent = kinds[step.visual.kind] || '图解';
    $('narration').innerHTML = step.clauses.map((c, i) =>
      `<span class="summary-clause${i === clauseIndex ? ' active' : i < clauseIndex ? ' done' : ''}">${esc(c)}</span>`
    ).join(' ');
    $('diagram').innerHTML = drawVisual(step.visual, clauseIndex, step.clauses.length);
    $('visual-caption').textContent = step.visual.caption || '';

    $('step-nav').innerHTML = scene.steps.map((st, idx) =>
      `<button type="button" data-step="${idx}"${idx === stepIndex ? ' aria-current="step"' : ''}${idx < stepIndex ? ' data-complete="true"' : ''}><span class="step-index">${String(idx + 1).padStart(2, '0')}</span>${esc(st.label)}</button>`
    ).join('');

    $('check-question').textContent = scene.question;
    $('check-answer').textContent = scene.answer;
    $('self-check').open = false;
    $('reading-link').href = link(scene.reading.href);
    $('reading-link').textContent = `${scene.reading.label.replace(/^继续读[：:]\s*/, '阅读原文：')} ↗`;

    $('evidence-note').textContent = `${scene.evidence.kind} · ${scene.evidence.text}`;
    if (scene.evidence.href) {
      const a = document.createElement('a');
      a.href = link(scene.evidence.href);
      a.textContent = ' 核对说明 ↗';
      $('evidence-note').append(a);
    }

    // Subtitle band & step rail
    $('narration-caption').textContent = currentClause();
    $('stage-beat-counter').textContent = `节拍 ${String(currentBeatFlat + 1).padStart(2, '0')} / ${String(totalBeatsInScene).padStart(2, '0')}`;
    $('step-rail').innerHTML = Array.from({ length: totalBeatsInScene }, (_, i) =>
      `<span class="rail-dash${i === currentBeatFlat ? ' active' : i < currentBeatFlat ? ' done' : ''}"></span>`
    ).join('');

    // Teleprompter panel
    $('notes-step-badge').textContent = `${scene.id} · ${currentBeatFlat + 1}/${totalBeatsInScene}`;
    $('speaker-text').innerHTML = step.clauses.map((c, i) =>
      `<span class="speaker-clause${i === clauseIndex ? ' active' : i < clauseIndex ? ' done' : ''}">${esc(c)}</span>`
    ).join(' ');
    $('speaker-note').textContent = step.note;
    const nextClause = step.clauses[clauseIndex + 1];
    const nextStep = scene.steps[stepIndex + 1];
    const nextScene = list[sceneIndex + 1];
    $('speaker-next').textContent = nextClause || (nextStep ? `下一步：${nextStep.clauses[0]}` : nextScene ? `下一幕 ${nextScene.id}：${nextScene.title}` : '本课程已全部讲完，可回到目录或原文继续深入。');

    const refsBody = $('notes-refs-body');
    if (refsBody) {
      refsBody.innerHTML = `<a href="${esc(link(scene.reading.href))}" target="_blank" rel="noopener">${esc(scene.reading.label)} ↗</a><span>${esc(scene.evidence.kind + '：' + scene.evidence.text)}</span>`;
    }

    // Dock state
    $('page-position').textContent = `${sceneIndex + 1} / ${list.length}`;
    if ($('chapter-select')) $('chapter-select').value = String(sceneIndex);
    $('previous-scene').disabled = sceneIndex === 0;
    $('next-scene').disabled = sceneIndex === list.length - 1;
    $('previous-step').disabled = sceneIndex === 0 && stepIndex === 0 && clauseIndex === 0;
    $('next-step').disabled = sceneIndex === list.length - 1 && stepIndex === scene.steps.length - 1 && clauseIndex === step.clauses.length - 1;

    const totalDeckBeats = list.reduce((a, sc) => a + sc.steps.reduce((b, st) => b + st.clauses.length, 0), 0);
    const doneDeckBeats = list.slice(0, sceneIndex).reduce((a, sc) => a + sc.steps.reduce((b, st) => b + st.clauses.length, 0), 0) + currentBeatFlat + 1;
    $('player-progress-fill').style.width = `${(doneDeckBeats / totalDeckBeats * 100).toFixed(2)}%`;

    document.querySelectorAll('#directory-groups-lessons [data-scene], #directory-groups-overview [data-overview-scene]').forEach(btn => {
      const id = btn.dataset.scene || btn.dataset.overviewScene;
      if (id === scene.id) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    renderNavAndSelect();
    if (!headlessRender) {
      $('diagram').classList.remove('enter');
      requestAnimationFrame(() => $('diagram').classList.add('enter'));
    }
    speak();
    schedule();
  }

  function speak() {
    if (!('speechSynthesis' in window) || headlessRender) return;
    speechSynthesis.cancel();
    if (!speaking || document.hidden || dialog.open) return;
    const u = new SpeechSynthesisUtterance(currentClause());
    u.lang = 'zh-CN';
    u.rate = 0.98;
    const zh = speechSynthesis.getVoices().find(v => /^zh[-_]CN/i.test(v.lang));
    if (zh) u.voice = zh;
    speechSynthesis.speak(u);
  }

  function schedule() {
    clearTimeout(timer);
    if (!playing || document.hidden || dialog.open || headlessRender) return;
    const delay = Math.max(2400, Math.min(7500, currentClause().length * 220 + 600));
    timer = setTimeout(() => {
      if (speaking && (speechSynthesis.speaking || speechSynthesis.pending)) { schedule(); return; }
      const list = scenes();
      if (sceneIndex === list.length - 1 && stepIndex === current().steps.length - 1 && clauseIndex === currentStep().clauses.length - 1) {
        setPlaying(false);
        toast('已播放完全部内容，可回到目录重看。');
      } else {
        moveBeat(1);
      }
    }, delay);
  }

  function go(idx, st = 0, cl = 0) {
    const list = scenes();
    if (idx < 0 || idx >= list.length) return;
    sceneIndex = idx;
    stepIndex = Math.max(0, Math.min(st, list[idx].steps.length - 1));
    clauseIndex = Math.max(0, Math.min(cl, list[idx].steps[stepIndex].clauses.length - 1));
    const hash = `#${list[idx].id}/${stepIndex}`;
    if (!headlessRender && location.hash !== hash) {
      history.replaceState(null, '', location.pathname + (activeDeck === 'overview' ? '?deck=overview' : location.search.replace(/[?&]deck=overview/, '')) + (instructor ? (activeDeck === 'overview' ? '&mode=instructor' : '?mode=instructor') : '') + hash);
    }
    render();
  }

  function moveBeat(dir) {
    const sc = current();
    const st = currentStep();
    if (dir > 0) {
      if (clauseIndex + 1 < st.clauses.length) { clauseIndex++; render(); }
      else if (stepIndex + 1 < sc.steps.length) { stepIndex++; clauseIndex = 0; go(sceneIndex, stepIndex, 0); }
      else if (sceneIndex + 1 < scenes().length) { go(sceneIndex + 1, 0, 0); }
    } else {
      if (clauseIndex > 0) { clauseIndex--; render(); }
      else if (stepIndex > 0) { const prevLen = sc.steps[stepIndex - 1].clauses.length; go(sceneIndex, stepIndex - 1, prevLen - 1); }
      else if (sceneIndex > 0) {
        const prevSc = scenes()[sceneIndex - 1];
        const lastSt = prevSc.steps.length - 1;
        go(sceneIndex - 1, lastSt, prevSc.steps[lastSt].clauses.length - 1);
      }
    }
  }

  function setDeck(deckName, targetId = null) {
    if (!decks[deckName]?.length) return;
    activeDeck = deckName;
    const list = scenes();
    const idx = targetId ? Math.max(0, list.findIndex(s => s.id === targetId)) : 0;
    go(idx, 0, 0);
  }

  function setPlaying(val) {
    playing = val;
    $('autoplay').setAttribute('aria-pressed', String(val));
    $('autoplay').textContent = val ? '暂停' : '自动播放';
    schedule();
  }

  function setInstructor(val) {
    instructor = val;
    $('instructor-notes').hidden = !val;
    $('notes-toggle').setAttribute('aria-pressed', String(val));
    requestAnimationFrame(resizeStage);
  }

  function setRecording(val) {
    recording = val;
    document.body.classList.toggle('recording', val);
    $('record-mode')?.setAttribute('aria-pressed', String(val));
    if ($('record-exit')) $('record-exit').hidden = !val;
    if (val) toast('已进入纯净录制模式 · 按 H 或 Esc 退出');
    requestAnimationFrame(resizeStage);
  }

  function setVisualOnly(val) {
    visualOnly = val;
    document.body.classList.toggle('visual-only', val);
    $('visual-only')?.setAttribute('aria-pressed', String(val));
  }

  function openDirectory() {
    const isOv = activeDeck === 'overview';
    $('dir-tab-lessons').setAttribute('aria-selected', String(!isOv));
    $('dir-tab-overview').setAttribute('aria-selected', String(isOv));
    $('directory-groups-lessons').hidden = isOv;
    $('directory-groups-overview').hidden = !isOv;
    dialog.showModal();
    clearTimeout(timer);
  }

  function readHash() {
    const url = new URL(location.href);
    const deckParam = url.searchParams.get('deck');
    const modeParam = url.searchParams.get('mode');
    if (modeParam === 'instructor') setInstructor(true);
    if (modeParam === 'record') setRecording(true);
    const mOv = location.hash.match(/^#(S\d{2})\/(\d+)$/);
    const mLes = location.hash.match(/^#([ACG]0[1-6])\/(\d+)$/) || location.hash.match(/^#reading-([ACG]0[1-6])$/);
    if (mOv || (deckParam === 'overview' && !mLes)) {
      activeDeck = 'overview';
      const idx = mOv ? decks.overview.findIndex(s => s.id === mOv[1]) : 0;
      go(Math.max(0, idx), mOv ? Number(mOv[2]) : 0, 0);
    } else {
      activeDeck = 'lessons';
      const idx = mLes ? decks.lessons.findIndex(s => s.id === mLes[1]) : 0;
      go(Math.max(0, idx), mLes?.[2] ? Number(mLes[2]) : 0, 0);
    }
  }

  // ---- Deterministic Video Rendering Bridge ----
  function computeTimeline(sceneId = null) {
    const targetScenes = sceneId ? scenes().filter(s => s.id === sceneId) : scenes();
    const captions = [];
    const frames = [];
    let cursor = 0.6; // lead-in seconds
    for (const sc of targetScenes) {
      const sStart = cursor;
      for (let si = 0; si < sc.steps.length; si++) {
        const st = sc.steps[si];
        for (let ci = 0; ci < st.clauses.length; ci++) {
          const text = st.clauses[ci];
          const dur = Math.max(2.2, Math.min(6.2, Number((text.length * 0.21 + 0.75).toFixed(3))));
          const start = Number(cursor.toFixed(4));
          const end = Number((cursor + dur).toFixed(4));
          captions.push({ start, end, text, sceneId: sc.id, stepIndex: si, clauseIndex: ci });
          frames.push({ start, end, sceneId: sc.id, stepIndex: si, clauseIndex: ci });
          cursor = end + 0.12;
        }
        cursor += 0.25;
      }
      cursor += 0.45;
      if (targetScenes.length === 1) break;
    }
    const duration = Number((cursor + 0.8).toFixed(4));
    return { deck: activeDeck, sceneId, duration, captions, frames };
  }

  globalThis.InfraStage = {
    setDeck: (d, id) => setDeck(d, id),
    selectScene: (id) => {
      if (/^S\d{2}$/.test(id)) setDeck('overview', id);
      else setDeck('lessons', id);
    },
    getScenes: (d) => (decks[d || activeDeck] || []).map(s => ({ id: s.id, title: s.title, groupLabel: s.groupLabel })),
    getTimeline: (id = null) => computeTimeline(id),
    setHeadlessRender: (on = true) => {
      headlessRender = Boolean(on);
      document.body.classList.toggle('render-headless', headlessRender);
      setRecording(headlessRender);
      setInstructor(false);
      resizeStage();
    },
    seekFrame: (sceneId, stepIdx, clIdx) => {
      const idx = scenes().findIndex(s => s.id === sceneId);
      if (idx >= 0) {
        sceneIndex = idx;
        stepIndex = Math.max(0, Math.min(stepIdx, scenes()[idx].steps.length - 1));
        clauseIndex = Math.max(0, Math.min(clIdx, scenes()[idx].steps[stepIndex].clauses.length - 1));
        render();
      }
    }
  };

  // ---- Event Wiring ----
  $('deck-lessons')?.addEventListener('click', () => setDeck('lessons'));
  $('deck-overview')?.addEventListener('click', () => setDeck('overview'));
  $('track-nav')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-group]');
    if (btn) go(Math.max(0, scenes().findIndex(s => s.id === btn.dataset.group)), 0, 0);
  });
  $('step-nav')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-step]');
    if (btn) go(sceneIndex, Number(btn.dataset.step), 0);
  });
  $('chapter-select')?.addEventListener('change', e => go(Number(e.target.value), 0, 0));
  $('directory-open')?.addEventListener('click', openDirectory);
  $('dock-directory')?.addEventListener('click', openDirectory);
  $('directory-close')?.addEventListener('click', () => dialog.close());
  $('dir-tab-lessons')?.addEventListener('click', () => {
    $('dir-tab-lessons').setAttribute('aria-selected', 'true');
    $('dir-tab-overview').setAttribute('aria-selected', 'false');
    $('directory-groups-lessons').hidden = false;
    $('directory-groups-overview').hidden = true;
  });
  $('dir-tab-overview')?.addEventListener('click', () => {
    $('dir-tab-lessons').setAttribute('aria-selected', 'false');
    $('dir-tab-overview').setAttribute('aria-selected', 'true');
    $('directory-groups-lessons').hidden = true;
    $('directory-groups-overview').hidden = false;
  });
  dialog?.addEventListener('click', e => {
    const btnL = e.target.closest('[data-scene]');
    const btnO = e.target.closest('[data-overview-scene]');
    if (btnL) { dialog.close(); setDeck('lessons', btnL.dataset.scene); }
    else if (btnO) { dialog.close(); setDeck('overview', btnO.dataset.overviewScene); }
  });
  $('previous-scene')?.addEventListener('click', () => go(sceneIndex - 1, 0, 0));
  $('next-scene')?.addEventListener('click', () => go(sceneIndex + 1, 0, 0));
  $('previous-step')?.addEventListener('click', () => moveBeat(-1));
  $('next-step')?.addEventListener('click', () => moveBeat(1));
  $('autoplay')?.addEventListener('click', () => setPlaying(!playing));
  $('replay')?.addEventListener('click', () => render());
  $('notes-toggle')?.addEventListener('click', () => setInstructor(!instructor));
  $('notes-close')?.addEventListener('click', () => setInstructor(false));
  $('record-mode')?.addEventListener('click', () => setRecording(!recording));
  $('record-exit')?.addEventListener('click', () => setRecording(false));
  $('visual-only')?.addEventListener('click', () => setVisualOnly(!visualOnly));
  $('handout')?.addEventListener('click', () => window.print());
  $('voice')?.addEventListener('click', () => {
    speaking = !speaking;
    $('voice').setAttribute('aria-pressed', String(speaking));
    $('voice').textContent = speaking ? '关闭朗读' : '朗读';
    speak();
  });
  $('pilots')?.addEventListener('click', () => {
    const ids = activeDeck === 'overview' ? ['S01', 'S15', 'S20'] : ['C01', 'A04', 'G01'];
    const id = ids[pilotIdx++ % ids.length];
    const idx = scenes().findIndex(s => s.id === id);
    if (idx >= 0) go(idx, 0, 0);
  });
  $('fullscreen')?.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { toast('当前浏览器不支持全屏 API'); }
  });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,textarea,select,[contenteditable="true"]') || dialog.open) return;
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest('button,a,summary')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const map = {
      ' ': () => moveBeat(1), ArrowRight: () => moveBeat(1), ArrowLeft: () => moveBeat(-1), Backspace: () => moveBeat(-1),
      PageDown: () => go(sceneIndex + 1, 0, 0), PageUp: () => go(sceneIndex - 1, 0, 0),
      g: openDirectory, n: () => setInstructor(!instructor),
      h: () => setRecording(!recording), v: () => setVisualOnly(!visualOnly),
      p: () => setPlaying(!playing), r: () => render(),
      t: () => $('pilots')?.click(), o: () => setDeck(activeDeck === 'overview' ? 'lessons' : 'overview'),
      f: () => $('fullscreen')?.click(), Escape: () => { if (recording) setRecording(false); }
    };
    if (map[k]) { e.preventDefault(); map[k](); }
  });

  window.addEventListener('resize', resizeStage);
  window.addEventListener('hashchange', readHash);
  window.addEventListener('pagehide', () => { clearTimeout(timer); if ('speechSynthesis' in window) speechSynthesis.cancel(); });

  readHash();
  requestAnimationFrame(resizeStage);
})();
