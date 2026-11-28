#!/usr/bin/env python3
"""Export compact -16 LUFS AAC (.m4a) web audio tracks + timelines.json into dist/course-audio/.

Lessons keep one track each. The 30-scene overview narration is cut at chapter
boundaries into six tracks (overview-1 .. overview-6) so the first chapter starts
quickly; each chapter timeline is rebased to its own track.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST_AUDIO = REPO_ROOT / 'dist' / 'course-audio'
DEFAULT_SRC = REPO_ROOT.parent.parent / 'outputs' / 'courses-video'
FFMPEG = shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'


def export_m4a(src_wav: Path, dst_m4a: Path, start: float | None = None, end: float | None = None) -> int:
    trim = []
    if start is not None:
        trim = ['-ss', f'{start:.3f}', '-to', f'{end:.3f}']
    subprocess.run([
        FFMPEG, '-hide_banner', '-loglevel', 'error', '-y',
        '-i', str(src_wav), *trim,
        '-af', 'loudnorm=I=-16:LRA=7:TP=-1.5',
        '-ar', '24000', '-ac', '1',
        '-c:a', 'aac', '-b:a', '40k',
        '-movflags', '+faststart',
        str(dst_m4a)
    ], check=True)
    return dst_m4a.stat().st_size


def overview_chapters() -> list[list[str]]:
    script = (
        "const vm=require('vm'),fs=require('fs');const c={};c.globalThis=c;vm.createContext(c);"
        "vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);"
        "console.log(JSON.stringify(c.InfraOverviewCourseData.chapters.map(ch=>ch.scenes.map(s=>s.id))))"
    )
    out = subprocess.run(['node', '-e', script, str(REPO_ROOT / 'src' / 'course' / 'course-data.js')],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def frame_row(f: dict, offset: float = 0.0) -> list:
    return [round(f['start'] - offset, 3), round(f['end'] - offset, 3), f['sceneId'], int(f['stepIndex']), int(f['clauseIndex'])]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', type=Path, default=DEFAULT_SRC)
    parser.add_argument('--dst', type=Path, default=DIST_AUDIO)
    args = parser.parse_args()

    src_root = args.src.resolve()
    dst_dir = args.dst.resolve()
    dst_dir.mkdir(parents=True, exist_ok=True)

    units = (
        [('lessons', f'{p}0{i}') for p in ('A', 'C', 'G') for i in range(1, 7)]
        + [('season2', f'{p}{i:02d}') for p in ('A', 'C', 'G') for i in range(7, 11)]
    )

    tracks_manifest = {}
    total_bytes = 0
    for folder, key in units:
        unit_dir = src_root / folder / key
        tl = json.loads((unit_dir / 'timeline.json').read_text())
        size = export_m4a(unit_dir / 'narration.wav', dst_dir / f'{key}.m4a')
        total_bytes += size
        tracks_manifest[key] = {
            'file': f'{key}.m4a',
            'duration': round(float(tl['duration']), 3),
            'bytes': size,
            'frames': [frame_row(f) for f in tl['frames']]
        }

    ov_dir = src_root / 'overview'
    ov = json.loads((ov_dir / 'timeline.json').read_text())
    frames = ov['frames']
    chapters = overview_chapters()
    groups = [[f for f in frames if f['sceneId'] in set(ids)] for ids in chapters]
    assert sum(len(g) for g in groups) == len(frames), 'every overview beat belongs to one chapter'
    # Cut midway through the silence between chapters so no word is clipped.
    bounds = [0.0]
    for left, right in zip(groups, groups[1:]):
        bounds.append(round((left[-1]['end'] + right[0]['start']) / 2, 3))
    bounds.append(round(float(ov['duration']), 3))
    for idx, group in enumerate(groups):
        key = f'overview-{idx + 1}'
        start, end = bounds[idx], bounds[idx + 1]
        size = export_m4a(ov_dir / 'narration.wav', dst_dir / f'{key}.m4a', start, end)
        total_bytes += size
        tracks_manifest[key] = {
            'file': f'{key}.m4a',
            'duration': round(end - start, 3),
            'bytes': size,
            'frames': [frame_row(f, start) for f in group]
        }

    stale = dst_dir / 'overview.m4a'
    if stale.exists():
        stale.unlink()

    manifest_path = dst_dir / 'timelines.json'
    manifest_path.write_text(json.dumps({'schema': 2, 'voice': 'Tingting', 'tracks': tracks_manifest}, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'Exported {len(tracks_manifest)} web audio tracks to {dst_dir} ({total_bytes / (1024 * 1024):.2f} MB total).')


if __name__ == '__main__':
    main()
