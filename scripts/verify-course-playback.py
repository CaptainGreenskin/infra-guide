#!/usr/bin/env python3
"""Real-browser checks for the animated course player (optional; needs Python Playwright).

    python3 -m pip install playwright && python3 -m playwright install webkit
    python3 scripts/verify-course-playback.py            # Chrome + WebKit iPhone
    python3 scripts/verify-course-playback.py --browsers chrome

It serves dist/ with the standard library server (no HTTP Range, which also
exercises the whole-track Blob fallback) and asserts that:
  * every course-audio timeline matches the live player's scenes, steps and clause text;
  * playback starts, follows the audio, seeks on manual navigation, keeps speed
    across tracks and rolls over to the next lesson and overview chapter;
  * the next track is prefetched; system pauses, saved preferences, resume
    position, progress marks and Media Session state work;
  * phone portrait/landscape layouts keep the core controls on screen.
These checks drive local audio files; they do not replace listening tests or
physical-device lock-screen checks.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
AUDIO = json.loads((DIST / 'course-audio' / 'timelines.json').read_text())['tracks']

SPY = """
window.__audios = [];
const origPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function () { if (!window.__audios.includes(this)) window.__audios.push(this); return origPlay.call(this); };
"""
STATE = """() => { const a = window.__audios[0]; return {
  hash: location.hash, clause: document.querySelector('.summary-clause.active')?.dataset.clause,
  src: a ? a.src : null, t: a ? a.currentTime : null, paused: a ? a.paused : null, rate: a ? a.playbackRate : null,
  playing: document.getElementById('autoplay').getAttribute('aria-pressed') === 'true',
  speed: document.getElementById('speed-cycle').textContent,
  media: navigator.mediaSession ? navigator.mediaSession.playbackState : 'none' }; }"""
CORE = ['autoplay', 'speed-cycle', 'voice', 'next-step', 'previous-step', 'dock-directory']


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve() -> tuple[http.server.ThreadingHTTPServer, str]:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(DIST)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f'http://127.0.0.1:{server.server_address[1]}'


def wait_for(page, predicate: str, timeout: float = 8.0, arg=None):
    page.wait_for_function(predicate, arg=arg, timeout=timeout * 1000)


def check_timelines(page, base: str) -> int:
    page.goto(base + '/courses/', wait_until='networkidle')
    for key, meta in AUDIO.items():
        deck = 'overview' if key.startswith('overview') else ('lessons' if int(key[1:]) <= 6 else 'season2')
        live = page.evaluate("""([deck, key]) => { InfraStage.setDeck(deck);
            return InfraStage.getTimeline(key.startsWith('overview') ? null : key).frames
              .map(f => [f.sceneId, f.stepIndex, f.clauseIndex]); }""", [deck, key])
        ids = {f[2] for f in meta['frames']}
        live = [f for f in live if f[0] in ids]
        assert live == [f[2:] for f in meta['frames']], f'{key}: timeline beats differ from the player clauses'
    return len(AUDIO)


def check_playback(browser_type, base: str, device: dict | None, label: str) -> None:
    args = {'args': ['--autoplay-policy=no-user-gesture-required']} if browser_type.name == 'chromium' else {}
    if browser_type.name == 'chromium':
        args['channel'] = 'chrome'
    browser = browser_type.launch(**args)
    ctx = browser.new_context(**(device or {'viewport': {'width': 1440, 'height': 900}}))
    page = ctx.new_page()
    page.set_default_timeout(10000)
    errors: list[str] = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script(SPY)
    press = page.tap if device and device.get('has_touch') else page.click

    page.goto(base + '/courses/#A01/0', wait_until='networkidle')
    press('#autoplay')
    wait_for(page, '() => window.__audios[0] && window.__audios[0].currentTime > 1')
    s = page.evaluate(STATE)
    assert s['playing'] and not s['paused'] and s['src'].endswith('/A01.m4a') and s['media'] in ('playing', 'none'), (label, s)

    press('#speed-cycle')
    for _ in range(3):
        press('#next-step')
    wait_for(page, "() => location.hash === '#A01/1' && window.__audios[0].currentTime > 9")
    s = page.evaluate(STATE)
    assert s['rate'] == 1.25 and not s['paused'], (label, 'seek after manual navigation', s)

    page.evaluate("() => { const a = window.__audios[0]; a.currentTime = a.duration - 0.5; }")
    wait_for(page, "() => location.hash === '#A02/0' && !window.__audios[0].paused && window.__audios[0].currentTime > 0.3", 12)
    s = page.evaluate(STATE)
    assert s['rate'] == 1.25, (label, 'speed kept on the next track', s)
    wait_for(page, "() => performance.getEntriesByType('resource').some(e => e.name.endsWith('/A03.m4a'))")  # next lesson prefetched

    page.evaluate("() => window.__audios[0].pause()")
    wait_for(page, "() => document.getElementById('autoplay').getAttribute('aria-pressed') === 'false'")

    page.goto(base + '/courses/', wait_until='networkidle')
    s = page.evaluate(STATE)
    assert s['hash'] == '#A02/0' and s['speed'] == '1.25×', (label, 'resume position and saved speed', s)
    page.evaluate("() => InfraStage.selectScene('A01')")
    course_links = page.evaluate("""() => ({
        done: document.querySelector('#directory-groups-lessons [data-scene="A01"]').dataset.done,
        dirProgress: document.getElementById('directory-progress')?.textContent || '',
        dirTab: document.getElementById('dir-tab-lessons')?.textContent || '',
        labText: document.getElementById('lab-link')?.textContent || '',
        labHref: document.getElementById('lab-link')?.getAttribute('href') || '',
        zipHref: document.getElementById('lab-zip-link')?.getAttribute('href') || ''
    })""")
    assert course_links['done'] == 'true', (label, 'A01 marked complete after its last step', course_links)
    assert '已完成 1 / 60 幕' in course_links['dirProgress'] and '1/18' in course_links['dirTab'], (label, 'directory progress dashboard', course_links)
    assert course_links['labText'].startswith('动手实验：') and '#lab-ai-encoder-decoder' in course_links['labHref'] and course_links['zipHref'].endswith('/labs/encoder-decoder.zip'), (label, 'course lab loop', course_links)

    page.goto(base + '/courses/?deck=overview#S04/0', wait_until='networkidle')
    press('#autoplay')
    wait_for(page, "() => window.__audios[0] && window.__audios[0].currentTime > 100", 12)
    wait_for(page, "() => performance.getEntriesByType('resource').some(e => e.name.endsWith('/overview-2.m4a'))", 12)
    page.evaluate("() => { const a = window.__audios[0]; a.currentTime = a.duration - 0.5; }")
    wait_for(page, "() => location.hash === '#S05/0' && !window.__audios[0].paused", 12)

    if device:
        visible = page.evaluate("""(ids) => ids.filter(id => { const r = document.getElementById(id).getBoundingClientRect();
            return !(r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight); })""", CORE)
        assert not visible, (label, 'controls off screen', visible)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), (label, 'horizontal overflow')
    assert not errors, (label, errors)
    browser.close()
    print(f'PASS {label}: playback, seek, speed, rollover, prefetch, system pause, resume, progress' + (', phone layout' if device else ''))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--browsers', nargs='+', default=['chrome', 'webkit'], choices=['chrome', 'webkit'])
    args = parser.parse_args()
    server, base = serve()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='chrome') if 'chrome' in args.browsers else p.webkit.launch()
            count = check_timelines(browser.new_page(), base)
            browser.close()
            print(f'PASS: {count} narration timelines match the live player clauses')
            if 'chrome' in args.browsers:
                check_playback(p.chromium, base, None, 'chrome desktop')
            if 'webkit' in args.browsers:
                check_playback(p.webkit, base, p.devices['iPhone 13'], 'webkit iPhone portrait')
                check_playback(p.webkit, base, p.devices['iPhone 13 landscape'], 'webkit iPhone landscape')
    finally:
        server.shutdown()


if __name__ == '__main__':
    started = time.time()
    main()
    print(f'Done in {time.time() - started:.0f}s')
