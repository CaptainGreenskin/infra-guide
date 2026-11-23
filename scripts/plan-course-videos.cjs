#!/usr/bin/env node
'use strict';

// Local planning only. This script never synthesizes audio, renders, or publishes.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = 'src/course/course-data.js';
const PLAN = 'docs/video-production/plan.json';
const AUDITION = 'docs/video-production/voice-audition.json';
const SCRIPT = 'scripts/plan-course-videos.cjs';
const TRACK_IDS = ['ai', 'cloud', 'agent'];
const CALIBRATION = ['C01', 'A04', 'A03'];
const DURATIONS = {
  A01: [3, 4], A02: [3.5, 5], A03: [4, 5.5],
  A04: [3, 4], A05: [3.5, 5], A06: [3, 4],
  C01: [2.5, 3.5], C02: [3, 4], C03: [3, 4],
  C04: [3, 4.5], C05: [3, 4.5], C06: [4, 5.5],
  G01: [3, 4], G02: [3, 4.5], G03: [3, 4.5],
  G04: [3, 4.5], G05: [3, 4.5], G06: [3, 4.5]
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const readJson = (file) => JSON.parse(read(file));
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function preserve(previous, defaults, location) {
  if (previous === undefined) return clone(defaults);
  assert(object(previous), `${location} must be an object; refusing to replace user data`);
  return clone(previous);
}

function stages(previous, location) {
  if (previous !== undefined) assert(object(previous), `${location} must be an object`);
  const defaults = {
    generation: { status: 'not_started', blocked_by: 'tts_selection' },
    technical_qa: { status: 'not_started', blocked_by: 'generation' },
    human_listening: { status: 'not_started', blocked_by: 'generation' },
    publication: { status: 'not_started', blocked_by: 'technical_qa_and_human_listening' }
  };
  const result = previous === undefined ? {} : clone(previous);
  for (const [name, value] of Object.entries(defaults)) {
    result[name] = preserve(previous?.[name], {
      ...value, verified_source_sha: null, artifacts: [], notes: null
    }, `${location}.${name}`);
    assert(nonempty(result[name].status), `${location}.${name}.status must be a string`);
  }
  return result;
}

function loadSource() {
  const text = read(SOURCE);
  const sandbox = Object.create(null);
  vm.runInNewContext(text, sandbox, { filename: SOURCE, timeout: 1000 });
  const data = clone(sandbox.InfraCourseData);
  assert.equal(data.tracks.length, 3, 'Expected three source tracks');
  assert.deepEqual(data.tracks.map((track) => track.id), TRACK_IDS);
  const ids = [];
  const kinds = new Set();
  for (const track of data.tracks) {
    assert.equal(track.scenes.length, 6, `${track.id} must have six lessons`);
    for (const lesson of track.scenes) {
      assert(nonempty(lesson.id) && nonempty(lesson.title), 'Missing lesson ID or title');
      assert.equal(lesson.steps.length, 4, `${lesson.id} must have four steps`);
      assert(nonempty(lesson.reading?.href) && nonempty(lesson.reading?.label), `${lesson.id} is missing source reading`);
      assert(DURATIONS[lesson.id], `No duration recommendation for ${lesson.id}`);
      lesson.steps.forEach((step, index) => {
        assert(nonempty(step.label) && nonempty(step.narration), `${lesson.id} step ${index + 1} is incomplete`);
        assert(object(step.visual) && nonempty(step.visual.kind), `${lesson.id} step ${index + 1} has no visual`);
        kinds.add(step.visual.kind);
      });
      ids.push(lesson.id);
    }
  }
  assert.equal(ids.length, 18);
  assert.equal(new Set(ids).size, 18, 'Lesson IDs must be unique');
  assert.deepEqual([...ids].sort(), Object.keys(DURATIONS).sort());
  return { data, sourceSha: sha(text), visualKinds: [...kinds].sort() };
}

function loadAudition() {
  const text = read(AUDITION);
  const data = JSON.parse(text);
  assert.equal(data.language, 'zh-CN');
  assert.deepEqual(data.target_duration_seconds, { min: 60, max: 90 });
  assert(Array.isArray(data.segments) && data.segments.length > 0, 'Audition needs mapped segments');
  for (const segment of data.segments) {
    assert(nonempty(segment.id) && nonempty(segment.display_text) && nonempty(segment.spoken_text), 'Incomplete audition segment');
  }
  assert.equal(new Set(data.segments.map((segment) => segment.id)).size, data.segments.length);
  assert.equal(data.display_text, data.segments.map((segment) => segment.display_text).join(''));
  assert.equal(data.spoken_text, data.segments.map((segment) => segment.spoken_text).join(''));
  for (const term of ['GPU', 'CUDA', 'PyTorch', 'vLLM', 'BF16']) {
    assert(data.display_text.includes(term), `Audition must cover ${term}`);
  }
  assert(Number.isInteger(data.samples_generated) && data.samples_generated >= 0);
  assert(Array.isArray(data.audio_samples));
  assert.equal(data.samples_generated, data.audio_samples.length, 'Sample count must match real audio entries');
  assert.deepEqual(data.scoring.dimensions.map((item) => item.id), ['naturalness', 'professional_terms', 'numbers', 'pauses', 'coherence']);
  return { data, sourceSha: sha(text) };
}

function buildPlan(previous) {
  const { data, sourceSha, visualKinds } = loadSource();
  const audition = loadAudition();
  const zeroSpendOnly = previous?.budget?.approval?.status === 'zero_spend_only';
  const oldLessons = new Map();
  for (const lesson of previous?.lessons || []) {
    assert(!oldLessons.has(lesson.id), `Duplicate existing lesson ID ${lesson.id}; refusing to lose user state`);
    oldLessons.set(lesson.id, lesson);
  }
  const oldBatches = new Map((previous?.batches || []).map((batch) => [batch.id, batch]));
  const lessons = data.tracks.flatMap((track) => track.scenes.map((lesson, sceneIndex) => ({
    id: lesson.id,
    title: lesson.title,
    track_id: track.id,
    source_path: SOURCE,
    source_locator: `InfraCourseData.tracks[id=${track.id}].scenes[${sceneIndex}]`,
    source_sha: sourceSha,
    source_lesson_sha: sha(JSON.stringify(lesson)),
    sourceReading: clone(lesson.reading),
    lead: lesson.lead,
    evidence: clone(lesson.evidence),
    narration: lesson.steps.map((step) => step.narration).join('\n\n'),
    narration_role: 'source_material_requires_video_script_adaptation',
    steps: lesson.steps.map((step, index) => ({ index: index + 1, ...clone(step) })),
    question: lesson.question,
    answer: lesson.answer,
    suggested_duration_minutes: { min: DURATIONS[lesson.id][0], max: DURATIONS[lesson.id][1] },
    calibration_sample: CALIBRATION.includes(lesson.id),
    statuses: stages(oldLessons.get(lesson.id)?.statuses, `lessons.${lesson.id}.statuses`)
  })));
  const totalDuration = lessons.reduce((total, lesson) => ({
    min: total.min + lesson.suggested_duration_minutes.min,
    max: total.max + lesson.suggested_duration_minutes.max
  }), { min: 0, max: 0 });
  const batchDefinitions = [
    { id: 'calibration', label: '公共链路与三个校准样章', lesson_ids: CALIBRATION, estimated_person_days: { min: 2, max: 3 }, prerequisite: 'choose_tts_and_approve_budget' },
    ...TRACK_IDS.map((trackId) => ({
      id: trackId,
      label: data.tracks.find((track) => track.id === trackId).label,
      lesson_ids: lessons.filter((lesson) => lesson.track_id === trackId && !lesson.calibration_sample).map((lesson) => lesson.id),
      estimated_person_days: { min: 1, max: 2 },
      prerequisite: trackId === 'ai' ? 'calibration_accepted' : trackId === 'cloud' ? 'ai_batch_accepted' : 'cloud_batch_accepted'
    }))
  ];
  assert.deepEqual(batchDefinitions.map((batch) => batch.lesson_ids.length), [3, 4, 5, 6]);
  const batchedIds = batchDefinitions.flatMap((batch) => batch.lesson_ids);
  assert.equal(new Set(batchedIds).size, 18);

  return {
    schema_version: 1,
    objective: '将基础设施图解课的18节课程制作成有连贯中文配音、同步字幕和逐步图解的视频，并分别记录生成、技术检查、人工试听与发布状态。',
    scope: {
      firstSeason18: 18,
      laterAuthoredChapters78: 78,
      first_season_track_count: 3,
      first_season_lessons_per_track: 6,
      first_season_steps_per_lesson: 4,
      later_authored_chapters_policy: 'deferred_for_separate_assessment',
      previous_pilot: { title: '一条 AI 聊天请求的旅程', kind: 'standalone_overview', counts_toward_first_season: false }
    },
    generator: {
      script: SCRIPT,
      generate_command: `node ${SCRIPT}`,
      check_command: `node ${SCRIPT} --check`,
      default_write_target: PLAN,
      check_mode_writes_files: false,
      user_owned_fields: ['voice_selection', 'statuses', 'budget.approval', 'lessons[id].statuses', 'batches[id].statuses'],
      preservation_policy: '重跑按ID保留上述用户字段；源材料及建议目标重新从源码生成。声音选择、验收状态及预算批准不会被重置。',
      state_evidence_policy: '状态不等于验收证明；后续完成检查时应填写verified_source_sha及实际产物，源变化后需核对原验收是否仍适用。',
      performs_paid_api_calls: false,
      renders_or_publishes: false
    },
    source: {
      path: SOURCE,
      sha256: sourceSha,
      loaded_with: 'node:vm',
      lesson_count: lessons.length,
      step_count: lessons.reduce((sum, lesson) => sum + lesson.steps.length, 0),
      step_narration_characters: lessons.reduce((sum, lesson) => sum + lesson.steps.reduce((count, step) => count + step.narration.length, 0), 0),
      visual_kinds: visualKinds
    },
    voice_selection: preserve(previous?.voice_selection, {
      status: 'awaiting_tts_selection', provider: null, model: null, voice_id: null,
      settings: {}, selected_at: null, notes: null
    }, 'voice_selection'),
    budget: {
      currency: 'CNY',
      recommendations_only: true,
      audition_suggested_ceiling: zeroSpendOnly ? 0 : 10,
      first_season_suggested_ceiling: zeroSpendOnly ? 0 : 100,
      first_season_ceiling_includes_audition: true,
      prices_verified: false,
      approval: preserve(previous?.budget?.approval, {
        status: 'approval_pending', approved_ceiling: null, approved_at: null, notes: null
      }, 'budget.approval'),
      spending_policy: zeroSpendOnly
        ? '用户当前选择免费或本地研究路线，付费API预算为0；优先使用本地开源模型，付费服务须另行明确授权。此生成器不会合成或下载模型。'
        : '仅为建议预算，不构成付费授权；选择TTS并获得预算批准后再合成。此生成器不会调用付费API。'
    },
    voice_audition: {
      path: AUDITION,
      source_sha: audition.sourceSha,
      target_duration_seconds: audition.data.target_duration_seconds,
      samples_generated: audition.data.samples_generated,
      comparison_policy: '候选声音使用完全相同的spoken_text；音频生成后测量实际时长并完整人工试听，不用占位文件冒充样本。'
    },
    production_targets: {
      suggested_total_duration_minutes: totalDuration,
      duration_policy: '范围包括解释、图形停留和问答，需先改编讲稿；实际时长以定稿和合成音频为准。',
      reusable: ['JSON讲稿', 'PCM采样计时', 'HTML动态图解', 'Chrome/Playwright捕获', '同步标记裁切', 'FFmpeg编码', 'SRT字幕', '响度处理', '成片抽帧与媒体探测'],
      required_changes: [
        '用可配置的新TTS替换macOS say/Tingting；按段落合成，保持同一声音、语速及发声上下文，避免逐句重置与固定停顿造成断裂。',
        '建立显示原文与规范化口播文本的映射；使用音频时间戳或强制对齐，不能按字符比例分配字幕时间。',
        '预加载换幕内容，统一音频与视觉时钟，修复旧样片换幕字幕229至278毫秒延迟。',
        '核验实际录制及编码画幅，修复底部和右侧裁切或灰边；不把本机1920乘1167外窗补丁当作通用保证。',
        '将课程steps/visual转换为视频场景，适配flow、matrix、ledger、budget、timeline五种图示。',
        '按课程隔离文件目录、封面、片名、时长和可恢复制作状态，去除旧概览的固定文案。',
        '集中管理英文术语、缩写、单位、订单号、百分比、小数及公式的读法；舍入必须明示。'
      ],
      technical_qa: {
        status_of_values: 'targets_not_measurements',
        resolution: { width: 1920, height: 1080 }, fps: 30,
        video_codec: 'H.264', pixel_format: 'yuv420p', audio_codec: 'AAC', audio_sample_rate_hz: 48000,
        integrated_loudness_lufs: { target: -16, tolerance: 1 },
        true_peak_target_dbtp: -1.5,
        caption_boundary_target_ms: 100, scene_transition_caption_target_ms: 150,
        require_actual_encoded_frame_checks: true,
        require_full_frame_and_caption_safe_area_checks: true,
        require_source_numbers_and_reading_links_preserved: true
      },
      human_listening: {
        required_for_every_lesson: true, full_playback_required: true,
        calibration_must_pass_before_remaining_batches: true,
        checks: ['自然度', '专业词发音', '数字和公式', '停顿', '段落连贯性', '结尾完整性'],
        previous_pilot_human_listening_verified: false
      },
      per_lesson_deliverables: ['MP4', '封面', 'SRT', '配音音轨', '定稿', '实际时间轴', '技术检查记录', '人工试听记录'],
      publication_gate: '技术检查与人工试听分别通过后才可进入发布阶段；本计划不执行发布。'
    },
    calibration_samples: [
      { lesson_id: 'C01', focus: '通俗讲解、订单号与完整往返流程' },
      { lesson_id: 'A04', focus: 'GPU、FP32、Adam、GB等英文术语和单位' },
      { lesson_id: 'A03', focus: '小数、损失平均值、梯度与参数更新公式' }
    ],
    schedule_policy: {
      estimates_are_advisory: true,
      estimates_assume_human_participation: true,
      recalibrate_after_sample_acceptance: true,
      final_season_review_estimated_person_days: 1,
      progression: '先完成公共链路与三个样章，再按AI剩余4节、云剩余5节、智能体6节推进；每批先讲稿与配音试听，再渲染和检查。',
      background_execution_promised: false,
      eight_hour_unattended_completion_promised: false
    },
    statuses: stages(previous?.statuses, 'statuses'),
    tracks: data.tracks.map((track) => ({
      id: track.id, label: track.label, description: track.description,
      lesson_ids: track.scenes.map((lesson) => lesson.id),
      remaining_after_calibration: lessons.filter((lesson) => lesson.track_id === track.id && !lesson.calibration_sample).map((lesson) => lesson.id)
    })),
    batches: batchDefinitions.map((batch) => ({
      ...batch,
      statuses: stages(oldBatches.get(batch.id)?.statuses, `batches.${batch.id}.statuses`)
    })),
    lessons
  };
}

function main() {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 1 && args[0] === '--check'), `Usage: node ${SCRIPT} [--check]`);
  const check = args[0] === '--check';
  const exists = fs.existsSync(path.join(ROOT, PLAN));
  if (check) assert(exists, `${PLAN} does not exist; run the generator first`);
  const previous = exists ? readJson(PLAN) : undefined;
  const plan = buildPlan(previous);
  if (check) {
    assert.deepEqual(previous, plan, 'Plan differs from current source or generated targets; regenerate while retaining user fields');
    console.log('CHECK PASS: 18 unique lessons, 3 tracks x 6 lessons, 72 steps, source hashes and audition text consistent. No files written.');
    return;
  }
  fs.mkdirSync(path.dirname(path.join(ROOT, PLAN)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, PLAN), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Generated ${PLAN}: 18 lessons; user statuses, voice selection, and budget approval retained. No audio, paid API calls, or publishing performed.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
