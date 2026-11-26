#!/usr/bin/env python3
"""Assemble full-track MP4/SRT compilations and Bilibili master package from rendered unit videos."""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import re
import socketserver
import subprocess
import threading
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = REPO_ROOT / 'dist'
DEFAULT_OUT = REPO_ROOT.parent.parent / 'outputs' / 'courses-video'
FFMPEG = '/opt/homebrew/bin/ffmpeg'
FFPROBE = '/opt/homebrew/bin/ffprobe'

SRT_BLOCK_RE = re.compile(
    r'(\d+)\s*\n(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})\s*\n([\s\S]*?)(?=\n\n|\Z)'
)


def parse_srt_ts(ts: str) -> float:
    hh, mm, rest = ts.split(':')
    ss, ms = rest.split(',')
    return int(hh) * 3600 + int(mm) * 60 + int(ss) + int(ms) / 1000.0


def fmt_srt_ts(seconds: float) -> str:
    ms_total = max(0, round(seconds * 1000))
    h = ms_total // 3600000
    m = (ms_total // 60000) % 60
    s = (ms_total // 1000) % 60
    ms = ms_total % 1000
    return f'{h:02}:{m:02}:{s:02},{ms:03}'


def fmt_chapter_ts(seconds: float) -> str:
    sec = max(0, int(round(seconds)))
    h = sec // 3600
    m = (sec % 3600) // 60
    s = sec % 60
    return f'{h:02}:{m:02}:{s:02}' if h > 0 else f'{m:02}:{s:02}'


def probe_duration(mp4: Path) -> float:
    data = json.loads(subprocess.check_output([
        FFPROBE, '-v', 'quiet', '-show_format', '-of', 'json', str(mp4)
    ]))
    return float(data['format']['duration'])


def concat_videos_and_srts(items: list[tuple[str, str, Path, Path]], out_mp4: Path, out_srt: Path) -> list[dict]:
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    concat_file = out_mp4.parent / f'.concat-{out_mp4.stem}.txt'
    concat_file.write_text('\n'.join(f"file '{mp4.resolve()}'" for _, _, mp4, _ in items) + '\n')

    subprocess.run([
        FFMPEG, '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'concat', '-safe', '0', '-i', str(concat_file),
        '-c', 'copy', '-movflags', '+faststart', str(out_mp4)
    ], check=True)
    concat_file.unlink(missing_ok=True)

    offset = 0.0
    srt_entries = []
    chapters = []
    for code, title, mp4, srt in items:
        dur = probe_duration(mp4)
        chapters.append({
            'id': code,
            'title': title,
            'start_seconds': round(offset, 3),
            'timestamp': fmt_chapter_ts(offset),
            'duration_seconds': round(dur, 3)
        })
        raw_srt = srt.read_text()
        for _, start_s, end_s, body in SRT_BLOCK_RE.findall(raw_srt):
            st = parse_srt_ts(start_s) + offset
            en = parse_srt_ts(end_s) + offset
            srt_entries.append((st, en, body.strip()))
        offset += dur

    out_srt.write_text(
        '\n\n'.join(
            f'{idx + 1}\n{fmt_srt_ts(st)} --> {fmt_srt_ts(en)}\n{txt}'
            for idx, (st, en, txt) in enumerate(srt_entries)
        ) + '\n'
    )
    return chapters


def render_bilibili_cover(out_png: Path) -> None:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST_DIR))
    handler.log_message = lambda *a, **kw: None
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='chrome', headless=True, args=['--hide-scrollbars'])
            ctx = browser.new_context(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
            page = ctx.new_page()
            page.goto(f'http://127.0.0.1:{port}/courses/', wait_until='load')
            page.wait_for_function('Boolean(window.InfraStage)')
            page.evaluate('document.fonts.ready')
            page.evaluate('window.InfraStage.setHeadlessRender(true)')
            page.evaluate('window.InfraStage.setDeck("overview")')
            page.evaluate('window.InfraStage.seekFrame("S04", 2, 0)')
            page.evaluate('''() => {
                document.querySelector('#step-kicker').textContent = '全栈图解课程 · Cloud + AI + Agent Infra';
                document.querySelector('#scene-title').textContent = '从零看懂基础设施全景与核心机制';
                document.querySelector('#scene-lead').textContent = '全景 30 幕 + 第一季 18 节算例课 + 第二季 12 节进阶机制课，配套 78 章正文与可复跑实验。';
                document.querySelector('#narration-caption').textContent = '一条请求走通 Cloud 网络存储 · AI 多卡训练与推理 · Agent 工具沙箱与恢复';
            }''')
            page.wait_for_timeout(80)
            out_png.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(out_png))
            ctx.close()
            browser.close()
    finally:
        httpd.shutdown()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    out_root = args.out.resolve()

    def unit_info(folder: str, cid: str) -> tuple[str, str, Path, Path]:
        base = out_root / folder / cid
        script = json.loads((base / 'script.json').read_text())
        title = script['scenes'][0]['title']
        return (cid, title, base / f'{cid}.mp4', base / 'subtitles.srt')

    cloud_items = [unit_info('lessons', f'C0{i}') for i in range(1, 7)] + [unit_info('season2', f'C{i:02d}') for i in range(7, 11)]
    ai_items = [unit_info('lessons', f'A0{i}') for i in range(1, 7)] + [unit_info('season2', f'A{i:02d}') for i in range(7, 11)]
    agent_items = [unit_info('lessons', f'G0{i}') for i in range(1, 7)] + [unit_info('season2', f'G{i:02d}') for i in range(7, 11)]

    tracks_dir = out_root / 'tracks'
    track_meta = {}
    for slug, items in [('cloud-infra-full', cloud_items), ('ai-infra-full', ai_items), ('agent-infra-full', agent_items)]:
        mp4 = tracks_dir / f'{slug}.mp4'
        srt = tracks_dir / f'{slug}.srt'
        ch = concat_videos_and_srts(items, mp4, srt)
        track_meta[slug] = {'mp4': str(mp4), 'srt': str(srt), 'duration_seconds': round(probe_duration(mp4), 3), 'bytes': mp4.stat().st_size, 'chapters': ch}
        print(f'OK track {slug}: {track_meta[slug]["duration_seconds"]:.1f}s | {track_meta[slug]["bytes"] / (1024*1024):.1f} MB')

    bili_dir = out_root / 'bilibili-package'
    overview_item = (
        'S01-S30',
        '基础设施全景总览课（30 幕串联一次请求全栈闭环）',
        out_root / 'overview' / 'infra-overview-30.mp4',
        out_root / 'overview' / 'subtitles.srt'
    )
    master_items = [overview_item] + cloud_items + ai_items + agent_items
    master_mp4 = bili_dir / 'infra-complete-course.mp4'
    master_srt = bili_dir / 'infra-complete-course.srt'
    master_chapters = concat_videos_and_srts(master_items, master_mp4, master_srt)
    cover_png = bili_dir / 'cover-16x9.png'
    render_bilibili_cover(cover_png)

    total_dur = probe_duration(master_mp4)
    desc_lines = [
        '【从零看懂 Cloud + AI + Agent 基础设施】全景 30 幕 + 30 节硬核机制图解课',
        '',
        '面向中国初学者的基础设施全栈图解课程：不跳前置概念，用同一组订单（O-104）、模型（664 参数 / 25GB 显存账）与智能体日报（37+5=42）算例，把 Cloud Infra、AI Infra、Agent Infra 的全貌、概念关系、推导算例与失败恢复一次讲透。',
        '',
        '在线互动课件（支持 16:9 舞台、单行字幕、?mode=instructor 提词器与原文跳转）：',
        'https://captaingreenskin.github.io/infra-guide/courses/',
        '开源仓库与全部可复跑实验：',
        'https://github.com/CaptainGreenskin/infra-guide',
        '',
        '【章节空降时间轴】',
    ]
    for ch in master_chapters:
        desc_lines.append(f'{ch["timestamp"]} {ch["id"]} · {ch["title"]}')
    desc_lines.extend([
        '',
        '【制作与验证说明】',
        '- 画面：1920×1080 30fps 16:9 暗色编辑舞台（Playwright 逐拍确定性渲染）',
        '- 音频：48kHz 句级时间轴对齐合成，FFmpeg EBU R128 响度标准化（-16 LUFS / -1.5 dBTP）',
        '- 验证边界：教学算例、本机 CPU/Docker/kind 实验与待真实多机 GPU 环境验收项均在课件左下角如实标注；完整成片人工逐句听审仍建议在正式投稿前复核。'
    ])
    (bili_dir / 'bilibili-description.txt').write_text('\n'.join(desc_lines) + '\n')
    (bili_dir / 'package-manifest.json').write_text(json.dumps({
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'master_mp4': str(master_mp4),
        'master_srt': str(master_srt),
        'cover_png': str(cover_png),
        'duration_seconds': round(total_dur, 3),
        'bytes': master_mp4.stat().st_size,
        'tracks': track_meta,
        'chapters': master_chapters,
        'human_listening_verified': False
    }, ensure_ascii=False, indent=2) + '\n')
    print(f'COMPLETE Bilibili Master: {total_dur:.1f}s ({total_dur/60:.1f} min) | {master_mp4.stat().st_size / (1024*1024):.1f} MB')


if __name__ == '__main__':
    main()
