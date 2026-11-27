#!/usr/bin/env python3
"""Export compact -16 LUFS AAC (.m4a) web audio tracks + timelines.json into dist/course-audio/."""
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


def export_m4a(src_wav: Path, dst_m4a: Path) -> int:
    subprocess.run([
        FFMPEG, '-hide_banner', '-loglevel', 'error', '-y',
        '-i', str(src_wav),
        '-af', 'loudnorm=I=-16:LRA=7:TP=-1.5',
        '-ar', '24000', '-ac', '1',
        '-c:a', 'aac', '-b:a', '40k',
        '-movflags', '+faststart',
        str(dst_m4a)
    ], check=True)
    return dst_m4a.stat().st_size


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', type=Path, default=DEFAULT_SRC)
    parser.add_argument('--dst', type=Path, default=DIST_AUDIO)
    args = parser.parse_args()

    src_root = args.src.resolve()
    dst_dir = args.dst.resolve()
    dst_dir.mkdir(parents=True, exist_ok=True)

    units = (
        [('lessons', f'{p}0{i}', f'{p}0{i}') for p in ('A', 'C', 'G') for i in range(1, 7)]
        + [('season2', f'{p}{i:02d}', f'{p}{i:02d}') for p in ('A', 'C', 'G') for i in range(7, 11)]
        + [('overview', '', 'overview')]
    )

    tracks_manifest = {}
    total_bytes = 0
    for folder, sub, key in units:
        unit_dir = (src_root / folder / sub) if sub else (src_root / folder)
        wav = unit_dir / 'narration.wav'
        tl = json.loads((unit_dir / 'timeline.json').read_text())
        m4a_name = f'{key}.m4a'
        m4a_path = dst_dir / m4a_name
        size = export_m4a(wav, m4a_path)
        total_bytes += size
        frames = [
            [round(f['start'], 3), round(f['end'], 3), f['sceneId'], int(f['stepIndex']), int(f['clauseIndex'])]
            for f in tl['frames']
        ]
        tracks_manifest[key] = {
            'file': m4a_name,
            'duration': round(float(tl['duration']), 3),
            'bytes': size,
            'frames': frames
        }

    manifest_path = dst_dir / 'timelines.json'
    manifest_path.write_text(json.dumps({'schema': 1, 'voice': 'Tingting', 'tracks': tracks_manifest}, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'Exported {len(tracks_manifest)} web audio tracks to {dst_dir} ({total_bytes / (1024 * 1024):.2f} MB total).')


if __name__ == '__main__':
    main()
