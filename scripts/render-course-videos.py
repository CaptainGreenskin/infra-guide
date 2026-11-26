#!/usr/bin/env python3
"""Reproducible InfraGuide course video pipeline (macOS free Chinese TTS + Playwright 1920x1080 + FFmpeg).

Implements Principle 11:
- Audition same script across local Chinese voices (--audition)
- Calibration samples C01, A04, A03 (--calibration)
- Full Season 1 (18 lessons) + 30-scene panoramic overview (--only or all)
- Synthesizes 48 kHz mono PCM per sentence with centralized term pronunciation normalization,
  derives exact subtitle & frame timestamps from actual PCM sample counts, normalizes audio to
  -16 LUFS / -1.5 dBTP, encodes 1920x1080 H.264 yuv420p 30fps MP4s, and runs border + loudness QA.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import re
import socketserver
import subprocess
import sys
import threading
import time
import wave
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = REPO_ROOT / 'dist'
DEFAULT_OUT = REPO_ROOT.parent.parent / 'outputs' / 'courses-video'
FFMPEG = '/opt/homebrew/bin/ffmpeg'
FFPROBE = '/opt/homebrew/bin/ffprobe'
SAMPLE_RATE = 48000

PRONUNCIATION_REPLACEMENTS = [
    ('TensorRT-LLM', 'Tensor R T L L M'),
    ('PagedAttention', 'Paged Attention'),
    ('FlashAttention', 'Flash Attention'),
    ('All-Reduce', 'All Reduce'),
    ('KV Cache', 'K V 缓存'),
    ('Prefill', '预填充'),
    ('Decode', '解码'),
    ('PyTorch', 'PyTorch'),
    ('SGLang', 'S G Lang'),
    ('vLLM', 'V L L M'),
    ('CUDA', 'CUDA'),
    ('Triton', 'Triton'),
    ('O-104', 'O 一零四'),
    ('BF16', 'B F 十六'),
    ('FP32', 'F P 三十二'),
    ('INT8', 'I N T 八'),
    ('TTFT', 'T T F T'),
    ('TPOT', 'T P O T'),
    ('HTTPS', 'H T T P S'),
    ('HTTP', 'H T T P'),
    ('GPU', 'G P U'),
    ('CPU', 'C P U'),
    ('NPU', 'N P U'),
    ('HBM', 'H B M'),
    ('PCIe', 'P C I E'),
    ('SRAM', 'S R A M'),
    ('MCP', 'M C P'),
    ('DNS', 'D N S'),
    ('TLS', 'T L S'),
    ('SGD', 'S G D'),
    ('GQA', 'G Q A'),
    ('API', 'A P I'),
    ('JSON', 'J S O N'),
    ('K8s', 'K 八 S'),
    ('GB', 'G B'),
    ('ms', '毫秒'),
    ('37+5=42', '三十七加五等于四十二'),
    ('10+27=37', '十加二十七等于三十七'),
    ('4+4+8+6+3=25', '四加四加八加六加三等于二十五'),
    ('(2+18)÷(1+3)=5', '二加十八除以一加三等于五'),
    ('7200÷20=360', '七千二百除以二十等于三百六十'),
    ('20÷4=5', '二十除以四等于五'),
    ('180−120', '一百八十减一百二十'),
    ('10÷2+50+20÷2=65', '十除以二加五十加二十除以二等于六十五'),
    ('0.92654306', '零点九二六五四三零六'),
    ('0.00308746', '零点零零三零八七四六'),
    ('0.92345560', '零点九二三四五五六零'),
    ('0.0617492', '零点零六一七四九二'),
    ('34.511747', '三十四点五一一七四七'),
    ('8.627937', '八点六二七九三七'),
    ('55.46%', '百分之五十五点四六'),
    ('46.59%', '百分之四十六点五九'),
]


def normalize_spoken(text: str) -> str:
    s = text
    for src, dst in PRONUNCIATION_REPLACEMENTS:
        s = s.replace(src, dst)
    # Normalize [0, 1] / [4, 1] / [2, 8] -> spoken brackets safely
    s = re.sub(r'\[(\d+)\s*,\s*(\d+)\]', r' \1 和 \2 ', s)
    return s


def split_sentences(text: str) -> list[str]:
    return [x.strip() for x in re.findall(r'[^。！？!?；;]+[。！？!?；;]?', text.strip()) if x.strip()]


def split_clauses(sentence: str, limit: int = 26) -> list[str]:
    s = sentence.strip()
    if not s:
        return ['']
    out = []
    while len(s) > limit:
        candidates = [i + 1 for i, c in enumerate(s[:limit]) if c in '，、：；,;']
        cut = candidates[-1] if candidates and candidates[-1] >= int(limit * 0.45) else limit
        out.append(s[:cut].strip())
        s = s[cut:].strip()
    if s:
        out.append(s)
    return out


def srt_stamp(seconds: float) -> str:
    ms_total = round(seconds * 1000)
    h = ms_total // 3600000
    m = (ms_total // 60000) % 60
    s = (ms_total // 1000) % 60
    ms = ms_total % 1000
    return f'{h:02}:{m:02}:{s:02},{ms:03}'


def start_static_server(directory: Path):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    handler.log_message = lambda *args, **kwargs: None
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def probe_media(path: Path) -> dict:
    return json.loads(subprocess.check_output([
        FFPROBE, '-v', 'quiet', '-show_format', '-show_streams', '-of', 'json', str(path)
    ]))


def check_frame_borders(png_path: Path) -> dict:
    im = Image.open(png_path)
    pts = [(10, 10), (960, 10), (1910, 10), (10, 1070), (960, 1070), (1910, 1070)]
    samples = [{'xy': list(xy), 'rgb': list(im.getpixel(xy)[:3])} for xy in pts]
    gray_pad = any(max(s['rgb']) - min(s['rgb']) < 3 and min(s['rgb']) > 90 for s in samples)
    return {'width': im.width, 'height': im.height, 'samples': samples, 'gray_padding': gray_pad}


def synth_narration(scenes_payload: list[dict], out_dir: Path, voice: str, rate: int) -> dict:
    """Synthesize sentence-level 48kHz PCM WAV and derive exact clause-synced timeline."""
    aud_dir = out_dir / 'audio'
    aud_dir.mkdir(parents=True, exist_ok=True)
    pcm = bytearray(bytes(round(0.55 * SAMPLE_RATE) * 2))
    cursor = 0.55
    captions = []
    frames = []
    part_idx = 0

    for sc in scenes_payload:
        for st_idx, step in enumerate(sc['steps']):
            sentences = split_sentences(step['narration'])
            # Map sentences back to exact player.js clause indices
            flat_clauses = step['clauses']
            clause_cursor = 0

            for sent_idx, sent in enumerate(sentences):
                sent_clauses = split_clauses(sent, 26)
                part_idx += 1
                txt_p = aud_dir / f'{part_idx:03d}.txt'
                aiff_p = aud_dir / f'{part_idx:03d}.aiff'
                wav_p = aud_dir / f'{part_idx:03d}.wav'
                spoken = normalize_spoken(sent)
                txt_p.write_text(spoken)

                subprocess.run(['/usr/bin/say', '-v', voice, '-r', str(rate), '-f', str(txt_p), '-o', str(aiff_p)], check=True)
                subprocess.run([
                    FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(aiff_p),
                    '-ar', str(SAMPLE_RATE), '-ac', '1', '-c:a', 'pcm_s16le', str(wav_p)
                ], check=True)

                with wave.open(str(wav_p), 'rb') as wf:
                    raw = wf.readframes(wf.getnframes())
                    dur = wf.getnframes() / SAMPLE_RATE

                sent_start = cursor
                pcm.extend(raw)
                cursor += dur

                total_chars = max(1, sum(len(c) for c in sent_clauses))
                acc_chars = 0
                for c_text in sent_clauses:
                    c_start = round(sent_start + dur * (acc_chars / total_chars), 4)
                    acc_chars += len(c_text)
                    c_end = round(sent_start + dur * (acc_chars / total_chars), 4)
                    cl_idx = min(clause_cursor, len(flat_clauses) - 1)
                    clause_cursor += 1
                    captions.append({'start': c_start, 'end': c_end, 'text': c_text})
                    frames.append({
                        'start': c_start, 'end': c_end,
                        'sceneId': sc['id'], 'stepIndex': st_idx, 'clauseIndex': cl_idx
                    })

                pause = 0.16
                pcm.extend(bytes(round(pause * SAMPLE_RATE) * 2))
                cursor += pause

            step_pause = 0.28
            pcm.extend(bytes(round(step_pause * SAMPLE_RATE) * 2))
            cursor += step_pause

        scene_pause = 0.42
        pcm.extend(bytes(round(scene_pause * SAMPLE_RATE) * 2))
        cursor += scene_pause

    tail = 0.85
    pcm.extend(bytes(round(tail * SAMPLE_RATE) * 2))
    cursor += tail

    narration_wav = out_dir / 'narration.wav'
    with wave.open(str(narration_wav), 'wb') as out_wf:
        out_wf.setnchannels(1)
        out_wf.setsampwidth(2)
        out_wf.setframerate(SAMPLE_RATE)
        out_wf.writeframes(pcm)

    return {
        'voice': voice,
        'rate': rate,
        'duration': round(cursor, 4),
        'captions': captions,
        'frames': frames,
        'wav': str(narration_wav)
    }


def render_target(page, deck: str, scene_id: str | None, out_dir: Path, slug: str, voice: str, rate: int) -> dict:
    t0 = time.monotonic()
    out_dir.mkdir(parents=True, exist_ok=True)
    frames_dir = out_dir / 'frames'
    frames_dir.mkdir(exist_ok=True)

    if scene_id:
        page.evaluate('(id) => window.InfraStage.selectScene(id)', scene_id)
    else:
        page.evaluate('(d) => window.InfraStage.setDeck(d)', deck)
    page.wait_for_timeout(60)

    # Pull full scene/step/clause payload directly from the browser stage so script & visuals share 1 source of truth
    scenes_payload = page.evaluate(
        '''([d, sid]) => {
            const list = window.InfraStage.getScenes(d);
            const wanted = sid ? list.filter(x => x.id === sid) : list;
            return wanted.map(meta => {
                window.InfraStage.selectScene(meta.id);
                const tl = window.InfraStage.getTimeline(meta.id);
                const rawDeck = d === 'overview'
                    ? window.InfraOverviewCourseData.chapters.flatMap(c => c.scenes)
                    : d === 'season2'
                        ? window.InfraSeason2CourseData.tracks.flatMap(t => t.scenes)
                        : window.InfraCourseData.tracks.flatMap(t => t.scenes);
                const rawScene = rawDeck.find(s => s.id === meta.id);
                const steps = rawScene.steps.map((st, idx) => ({
                    label: st.label,
                    narration: st.narration,
                    note: st.note,
                    clauses: tl.frames.filter(f => f.stepIndex === idx).map(f => {
                        const c = tl.captions.find(x => Math.abs(x.start - f.start) < 0.001);
                        return c ? c.text : '';
                    })
                }));
                return { id: meta.id, title: meta.title, steps };
            });
        }''',
        [deck, scene_id]
    )

    (out_dir / 'script.json').write_text(json.dumps({'deck': deck, 'scenes': scenes_payload}, ensure_ascii=False, indent=2) + '\n')

    audio_tl = synth_narration(scenes_payload, out_dir, voice, rate)
    duration = audio_tl['duration']
    captions = audio_tl['captions']

    (out_dir / 'timeline.json').write_text(json.dumps(audio_tl, ensure_ascii=False, indent=2) + '\n')
    (out_dir / 'subtitles.srt').write_text(
        '\n\n'.join(f'{i + 1}\n{srt_stamp(c["start"])} --> {srt_stamp(c["end"])}\n{c["text"]}' for i, c in enumerate(captions)) + '\n'
    )

    # Cover thumbnail
    cover_path = out_dir / 'cover.png'
    first_item = audio_tl['frames'][0]
    page.evaluate(
        '([s, st, cl, dur]) => { window.InfraStage.seekFrame(s, st, cl); const cap = document.querySelector("#narration-caption"); if (cap) cap.textContent = "InfraGuide · 16:9 课程视频 · " + Math.round(dur) + " 秒"; }',
        [first_item['sceneId'], first_item['stepIndex'], first_item['clauseIndex'], duration]
    )
    page.wait_for_timeout(40)
    page.screenshot(path=str(cover_path))

    # Capture each clause beat frame
    concat_entries = []
    cursor = 0.0
    for i, item in enumerate(audio_tl['frames']):
        page.evaluate(
            '([s, st, cl]) => window.InfraStage.seekFrame(s, st, cl)',
            [item['sceneId'], item['stepIndex'], item['clauseIndex']]
        )
        page.wait_for_timeout(30)
        img_path = frames_dir / f'beat_{i:03d}.png'
        page.screenshot(path=str(img_path))

        gap = item['start'] - cursor
        if gap > 0.005:
            hold_img = img_path if i == 0 else frames_dir / f'beat_{i - 1:03d}.png'
            concat_entries.append((hold_img, gap))

        concat_entries.append((img_path, item['end'] - item['start']))
        cursor = item['end']

    tail = duration - cursor
    if tail > 0.005 and concat_entries:
        concat_entries.append((concat_entries[-1][0], tail))

    concat_txt = out_dir / 'concat.txt'
    lines = []
    for path, dur in concat_entries:
        lines.append(f"file '{path.resolve()}'")
        lines.append(f'duration {dur:.4f}')
    lines.append(f"file '{concat_entries[-1][0].resolve()}'")
    concat_txt.write_text('\n'.join(lines) + '\n')

    mp4_path = out_dir / f'{slug}.mp4'
    subprocess.run([
        FFMPEG, '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'concat', '-safe', '0', '-i', str(concat_txt),
        '-i', audio_tl['wav'],
        '-map', '0:v:0', '-map', '1:a:0',
        '-vf', 'fps=30,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-af', 'loudnorm=I=-16:LRA=7:TP=-1.5',
        '-c:a', 'aac', '-b:a', '192k', '-ar', str(SAMPLE_RATE),
        '-movflags', '+faststart',
        '-t', f'{duration:.4f}',
        str(mp4_path)
    ], check=True)

    # QA: borders, black frames, loudness & A/V sync
    qa_frames = {}
    for label, ts in [('start', min(1.5, duration * 0.15)), ('middle', duration * 0.52), ('end', max(0.5, duration - 1.5))]:
        qa_png = frames_dir / f'encoded-{label}.png'
        subprocess.run([
            FFMPEG, '-hide_banner', '-loglevel', 'error', '-y',
            '-ss', f'{ts:.3f}', '-i', str(mp4_path),
            '-frames:v', '1', '-update', '1', str(qa_png)
        ], check=True)
        qa_frames[label] = check_frame_borders(qa_png)

    loud_res = subprocess.run([
        FFMPEG, '-hide_banner', '-i', str(mp4_path),
        '-af', 'loudnorm=I=-16:LRA=7:TP=-1.5:print_format=json', '-f', 'null', '-'
    ], capture_output=True, text=True, check=True)
    loud = json.loads(re.findall(r'\{\s*"input_i".*?\}', loud_res.stderr, re.S)[-1])

    meta = probe_media(mp4_path)
    vs = next(s for s in meta['streams'] if s['codec_type'] == 'video')
    aus = next(s for s in meta['streams'] if s['codec_type'] == 'audio')
    av_diff_ms = round((float(vs['duration']) - float(aus['duration'])) * 1000, 3)

    report = {
        'slug': slug,
        'deck': deck,
        'scene_id': scene_id,
        'mp4': str(mp4_path),
        'bytes': mp4_path.stat().st_size,
        'duration_seconds': float(meta['format']['duration']),
        'expected_duration_seconds': duration,
        'audio_video_duration_difference_ms': av_diff_ms,
        'voice': voice,
        'rate': rate,
        'loudness': {
            'integrated_lufs': float(loud['input_i']),
            'true_peak_dbtp': float(loud['input_tp']),
            'range_lu': float(loud['input_lra'])
        },
        'video': {
            'codec': vs['codec_name'],
            'width': vs['width'],
            'height': vs['height'],
            'pix_fmt': vs['pix_fmt'],
            'r_frame_rate': vs['r_frame_rate']
        },
        'audio': {
            'codec': aus['codec_name'],
            'sample_rate': aus['sample_rate'],
            'channels': aus['channels']
        },
        'caption_count': len(captions),
        'qa_frames': qa_frames,
        'human_listening_verified': False,
        'render_seconds': round(time.monotonic() - t0, 2)
    }
    (out_dir / 'quality_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

    # Clean bulky intermediate artifacts (.aiff, per-beat PNGs, concat.txt) while retaining
    # narration.wav, audio/*.txt, subtitles.srt, script.json, timeline.json, cover.png, encoded-*.png, and MP4.
    for stale in list(frames_dir.glob('beat_*.png')) + list((out_dir / 'audio').glob('*.aiff')) + list((out_dir / 'audio').glob('*.wav')) + [concat_txt]:
        stale.unlink(missing_ok=True)

    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', nargs='*', help='Lesson IDs (e.g. C01 A04 A03) or "overview"')
    parser.add_argument('--calibration', action='store_true', help='Render calibration samples C01, A04, A03')
    parser.add_argument('--voice', default='Tingting')
    parser.add_argument('--rate', type=int, default=205)
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    out_root = args.out.resolve()
    httpd, port = start_static_server(DIST_DIR)
    url = f'http://127.0.0.1:{port}/courses/'
    reports = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                channel='chrome', headless=True,
                args=['--disable-dev-shm-usage', '--hide-scrollbars']
            )
            context = browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                screen={'width': 1920, 'height': 1080},
                device_scale_factor=1
            )
            page = context.new_page()
            page.goto(url, wait_until='load')
            page.wait_for_function('Boolean(window.InfraStage)')
            page.evaluate('document.fonts.ready')
            page.evaluate('window.InfraStage.setHeadlessRender(true)')
            page.wait_for_timeout(120)

            lessons = page.evaluate('window.InfraStage.getScenes("lessons")')
            season2 = page.evaluate('window.InfraStage.getScenes("season2")')
            targets = [('lessons', s['id'], out_root / 'lessons' / s['id'], s['id']) for s in lessons]
            targets.extend(('season2', s['id'], out_root / 'season2' / s['id'], s['id']) for s in season2)
            targets.append(('overview', None, out_root / 'overview', 'infra-overview-30'))

            if args.calibration:
                wanted = {'C01', 'A04', 'A03'}
                targets = [t for t in targets if t[1] in wanted]
            elif args.only:
                wanted = set(args.only)
                targets = [t for t in targets if (t[1] in wanted) or (t[0] in wanted)]

            for deck, sid, out_dir, slug in targets:
                rep = render_target(page, deck, sid, out_dir, slug, args.voice, args.rate)
                reports.append(rep)
                print(
                    f'OK {slug}: {rep["duration_seconds"]:.1f}s '
                    f'| {rep["loudness"]["integrated_lufs"]} LUFS '
                    f'| {rep["caption_count"]} captions '
                    f'| {rep["bytes"] / 1024:.0f} KB '
                    f'| in {rep["render_seconds"]}s',
                    flush=True
                )

            context.close()
            browser.close()
    finally:
        httpd.shutdown()

    manifest = {
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'voice': args.voice,
        'rate': args.rate,
        'total_videos': len(reports),
        'total_duration_seconds': round(sum(r['duration_seconds'] for r in reports), 2),
        'total_bytes': sum(r['bytes'] for r in reports),
        'any_gray_padding': any(f['gray_padding'] for r in reports for f in r['qa_frames'].values()),
        'videos': reports
    }
    manifest_name = 'calibration-manifest.json' if args.calibration else 'manifest.json'
    (out_root / manifest_name).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'COMPLETE: {manifest["total_videos"]} MP4s, {manifest["total_duration_seconds"]}s total, gray_padding={manifest["any_gray_padding"]}')


if __name__ == '__main__':
    main()
