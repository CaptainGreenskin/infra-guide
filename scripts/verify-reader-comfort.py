#!/usr/bin/env python3
"""Real-browser checks for article reading aids (optional; needs Python Playwright + Chrome, WebKit for iPhone).

    python3 scripts/verify-reader-comfort.py [--browsers chrome webkit] [--articles transformer-model k8s-workloads]

Asserts on each article: the remaining-time hint and progress bar move with
scrolling and reach "已读完" at the end; a revisit without a fragment offers the
saved section and jumps to it; links with a fragment do not show the offer;
large-text mode still toggles; no page errors or horizontal overflow.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import re
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parent.parent / 'dist'
STATE = """() => ({ remaining: document.querySelector('.reading-remaining')?.textContent || '',
  ratio: Number((document.querySelector('.reading-progress')?.style.transform.match(/[\\d.]+/) || [0])[0]),
  resume: document.querySelector('.reader-resume a')?.textContent || null, hash: location.hash,
  overflow: document.documentElement.scrollWidth > innerWidth })"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def check(page, base: str, article: str, label: str) -> None:
    url = f'{base}/article/{article}/'
    page.goto(url, wait_until='networkidle')
    top = page.evaluate(STATE)
    assert re.fullmatch(r'约 \d+ 分钟', top['remaining']) and top['ratio'] < 0.05 and not top['overflow'], (label, article, top)
    total = int(re.search(r'\d+', top['remaining']).group())
    page.evaluate('scrollTo(0, document.documentElement.scrollHeight * 0.45)')
    page.wait_for_timeout(400)
    mid = page.evaluate(STATE)
    assert 0.2 < mid['ratio'] < 0.8 and mid['remaining'].startswith('剩余约'), (label, article, mid)
    assert int(re.search(r'\d+', mid['remaining']).group()) <= total, (label, article, mid)
    page.evaluate('scrollTo(0, document.documentElement.scrollHeight)')
    page.wait_for_timeout(400)
    end = page.evaluate(STATE)
    assert end['remaining'] == '已读完' and end['ratio'] > 0.97, (label, article, end)
    page.evaluate('scrollTo(0, document.documentElement.scrollHeight * 0.45)')
    page.wait_for_timeout(400)
    page.goto(url, wait_until='networkidle')
    again = page.evaluate(STATE)
    assert again['resume'] and again['resume'].startswith('继续上次阅读：'), (label, article, again)
    page.click('.reader-resume a')
    page.wait_for_timeout(300)
    jumped = page.evaluate(STATE)
    assert jumped['hash'] and jumped['resume'] is None and jumped['ratio'] > 0.15, (label, article, jumped)
    page.goto(url + '#section-2', wait_until='networkidle')
    assert page.evaluate(STATE)['resume'] is None, (label, article, 'fragment link must not offer resume')
    page.click('[data-reader-large]')
    assert page.evaluate("document.documentElement.classList.contains('reading-large')"), (label, article, 'large text')
    page.click('[data-reader-large]')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--browsers', nargs='+', default=['chrome', 'webkit'], choices=['chrome', 'webkit'])
    parser.add_argument('--articles', nargs='+', default=['transformer-model', 'k8s-workloads', 'agent-runtime'])
    args = parser.parse_args()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(DIST)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_address[1]}'
    try:
        with sync_playwright() as p:
            for name in args.browsers:
                browser = p.chromium.launch(channel='chrome') if name == 'chrome' else p.webkit.launch()
                ctx = browser.new_context(**({'viewport': {'width': 1440, 'height': 900}} if name == 'chrome' else p.devices['iPhone 13']))
                page = ctx.new_page()
                errors: list[str] = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                label = 'chrome desktop' if name == 'chrome' else 'webkit iPhone'
                for article in args.articles:
                    check(page, base, article, label)
                assert not errors, (label, errors)
                browser.close()
                print(f'PASS {label}: {len(args.articles)} articles - remaining time, progress, resume offer, fragment links, large text')
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
