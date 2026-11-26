#!/usr/bin/env python3
"""Independent QA verifier for all rendered InfraGuide course MP4s, SRTs, diagrams, and master packages."""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
from pathlib import Path
from PIL import Image, ImageStat

DEFAULT_OUT = Path(__file__).resolve().parent.parent.parent.parent / 'outputs' / 'courses-video'
FFMPEG = '/opt/homebrew/bin/ffmpeg'
FFPROBE = '/opt/homebrew/bin/ffprobe'

SRT_BLOCK_RE = re.compile(
    r'(\d+)\s*\n(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})\s*\n([\s\S]*?)(?=\n\n|\Z)'
)


def parse_ts(ts: str) -> float:
    h, m, rest = ts.split(':')
    s, ms = rest.split(',')
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0


def probe(mp4: Path) -> dict:
    return json.loads(subprocess.check_output([
        FFPROBE, '-v', 'quiet', '-show_format', '-show_streams', '-of', 'json', str(mp4)
    ]))


def check_srt(srt_path: Path, expected_dur: float) -> dict:
    raw = srt_path.read_text()
    blocks = SRT_BLOCK_RE.findall(raw)
    assert len(blocks) >= 3, f'{srt_path}: too few subtitle cues'
    prev_end = 0.0
    min_len = 999
    max_len = 0
    for idx, (num_s, st_s, en_s, txt) in enumerate(blocks):
        assert int(num_s) == idx + 1, f'{srt_path}: non-sequential index {num_s}'
        st = parse_ts(st_s)
        en = parse_ts(en_s)
        body = txt.strip()
        assert body, f'{srt_path}: empty subtitle cue #{idx + 1}'
        assert en > st >= prev_end - 0.02, f'{srt_path}: non-monotonic timestamp at cue #{idx + 1}'
        assert len(body) >= 5, f'{srt_path}: orphan short subtitle "{body}" at cue #{idx + 1}'
        min_len = min(min_len, len(body))
        max_len = max(max_len, len(body))
        if idx + 1 < len(blocks):
            nxt = blocks[idx + 1][3].strip()
            assert not (re.match(r'[A-Za-z0-9._+/-]', body[-1]) and re.match(r'[A-Za-z0-9._+/-]', nxt[0])), (
                f'{srt_path}: mid-ASCII cut "{body}" -> "{nxt}"'
            )
        prev_end = en
    assert prev_end <= expected_dur + 0.5, f'{srt_path}: subtitle exceeds video duration ({prev_end} > {expected_dur})'
    return {'cues': len(blocks), 'min_chars': min_len, 'max_chars': max_len, 'last_end': round(prev_end, 3)}


def check_encoded_frame(png_path: Path) -> dict:
    im = Image.open(png_path).convert('RGB')
    assert im.size == (1920, 1080), f'{png_path}: wrong dimensions {im.size}'
    # Check diagram panel (right side of stage: x=760..1800, y=140..820) has non-trivial visual content
    crop = im.crop((760, 140, 1800, 820))
    stddev = max(ImageStat.Stat(crop).stddev)
    assert stddev > 12.0, f'{png_path}: diagram region appears blank (stddev={stddev:.2f})'
    pts = [(10, 10), (960, 10), (1910, 10), (10, 1070), (960, 1070), (1910, 1070)]
    for xy in pts:
        r, g, b = im.getpixel(xy)
        assert not (max(r, g, b) - min(r, g, b) < 3 and min(r, g, b) > 90), f'{png_path}: gray border padding at {xy}'
    return {'diagram_stddev': round(stddev, 2)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    out_root = args.out.resolve()

    unit_dirs = (
        [out_root / 'lessons' / f'{p}0{i}' for p in ('A', 'C', 'G') for i in range(1, 7)]
        + [out_root / 'season2' / f'{p}{i:02d}' for p in ('A', 'C', 'G') for i in range(7, 11)]
        + [out_root / 'overview']
    )
    checked_units = []
    for d in unit_dirs:
        slug = 'infra-overview-30' if d.name == 'overview' else d.name
        mp4 = d / f'{slug}.mp4'
        srt = d / 'subtitles.srt'
        qr_path = d / 'quality_report.json'
        assert mp4.exists() and srt.exists() and qr_path.exists(), f'Missing artifact in {d}'

        meta = probe(mp4)
        vs = next(s for s in meta['streams'] if s['codec_type'] == 'video')
        aus = next(s for s in meta['streams'] if s['codec_type'] == 'audio')
        assert vs['codec_name'] == 'h264', f'{mp4}: expected h264'
        assert vs['width'] == 1920 and vs['height'] == 1080, f'{mp4}: expected 1920x1080'
        assert vs['pix_fmt'] == 'yuv420p', f'{mp4}: expected yuv420p'
        assert vs['r_frame_rate'] == '30/1', f'{mp4}: expected 30/1 fps'
        assert aus['codec_name'] == 'aac' and int(aus['sample_rate']) == 48000, f'{mp4}: expected 48kHz AAC'

        v_dur = float(vs['duration'])
        a_dur = float(aus['duration'])
        diff_ms = abs(v_dur - a_dur) * 1000.0
        assert diff_ms < 120.0, f'{mp4}: A/V drift too high ({diff_ms:.1f} ms)'

        qr = json.loads(qr_path.read_text())
        lufs = float(qr['loudness']['integrated_lufs'])
        tp = float(qr['loudness']['true_peak_dbtp'])
        assert -17.3 <= lufs <= -14.7, f'{mp4}: loudness out of target range ({lufs} LUFS)'
        assert tp <= -0.8, f'{mp4}: true peak too high ({tp} dBTP)'
        assert qr['human_listening_verified'] is False, f'{qr_path}: human_listening_verified must stay False until human review'

        srt_res = check_srt(srt, float(meta['format']['duration']))
        frame_res = check_encoded_frame(d / 'frames' / 'encoded-middle.png')
        checked_units.append({
            'slug': slug,
            'duration_seconds': round(float(meta['format']['duration']), 3),
            'av_diff_ms': round(diff_ms, 2),
            'lufs': lufs,
            'true_peak_dbtp': tp,
            **srt_res,
            **frame_res
        })

    compilations = [
        (out_root / 'tracks' / 'cloud-infra-full.mp4', out_root / 'tracks' / 'cloud-infra-full.srt'),
        (out_root / 'tracks' / 'ai-infra-full.mp4', out_root / 'tracks' / 'ai-infra-full.srt'),
        (out_root / 'tracks' / 'agent-infra-full.mp4', out_root / 'tracks' / 'agent-infra-full.srt'),
        (out_root / 'bilibili-package' / 'infra-complete-course.mp4', out_root / 'bilibili-package' / 'infra-complete-course.srt'),
    ]
    checked_compilations = []
    for mp4, srt in compilations:
        assert mp4.exists() and srt.exists(), f'Missing compilation {mp4}'
        meta = probe(mp4)
        vs = next(s for s in meta['streams'] if s['codec_type'] == 'video')
        assert vs['width'] == 1920 and vs['height'] == 1080 and vs['pix_fmt'] == 'yuv420p'
        dur = float(meta['format']['duration'])
        srt_res = check_srt(srt, dur)
        checked_compilations.append({'name': mp4.name, 'duration_seconds': round(dur, 3), 'bytes': mp4.stat().st_size, **srt_res})

    cover = out_root / 'bilibili-package' / 'cover-16x9.png'
    assert cover.exists() and Image.open(cover).size == (1920, 1080), 'Invalid cover-16x9.png'

    summary = {
        'status': 'PASS',
        'unit_videos_verified': len(checked_units),
        'compilations_verified': len(checked_compilations),
        'human_listening_verified': False,
        'units': checked_units,
        'compilations': checked_compilations
    }
    (out_root / 'verification-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(f'PASS: verified {len(checked_units)} unit MP4s + {len(checked_compilations)} compilations, 0 mid-word/ASCII subtitle splits, 0 border defects.')


if __name__ == '__main__':
    main()
