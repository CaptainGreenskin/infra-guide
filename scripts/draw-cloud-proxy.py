"""Original SVGs sharing exactly the lab's objects and event relationships."""
from pathlib import Path
from html import escape
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/diagrams'


def svg(name, title, desc, body, metadata):
    content = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="700" viewBox="0 0 1120 700" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc>
<metadata>{escape(json.dumps(metadata, sort_keys=True))}</metadata>
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#315bc9"/></marker></defs>
<style>text{{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;fill:#1e2b43}}.title{{font-size:30px;font-weight:700}}.head{{font-size:24px;font-weight:650}}.copy{{font-size:21px}}.small{{font-size:19px;fill:#526580}}.mono{{font-family:ui-monospace,SFMono-Regular,monospace;font-size:21px}}.line{{stroke:#315bc9;stroke-width:3;fill:none;marker-end:url(#arrow)}}.box{{fill:#fff;stroke:#ced9ec;stroke-width:2}}</style>
<rect width="1120" height="700" rx="18" fill="#f6f9fe"/>
{body}</svg>'''
    (OUT / ('cloud-proxy-' + name + '.svg')).write_text(content)


svg('two-legs', '请求相同，不代表连接相同',
    'P-c1 和 P-c2 是独立前端 TCP 连接。三次先后完成的查询借用同一条 A-c1。P 另行维护 B 的上游连接。', '''
<text class="title" x="42" y="54">请求相同，不代表连接相同</text>
<text class="small" x="42" y="89">本实验：真实 HTTP/1.1 · TCP 两段独立 · 固定查询 O-104 / total=37</text>
<rect class="box" x="42" y="145" width="244" height="136" rx="12"/>
<text class="head" x="65" y="183">客户端第一条连接</text>
<text class="mono" x="65" y="221">P-c1</text>
<text class="small" x="65" y="254">reuse-1 → reuse-2</text>
<rect class="box" x="42" y="342" width="244" height="136" rx="12"/>
<text class="head" x="65" y="380">客户端另一条连接</text>
<text class="mono" x="65" y="418">P-c2</text>
<text class="small" x="65" y="451">reuse-other-front</text>
<rect x="415" y="145" width="282" height="333" rx="16" fill="#eaf0ff" stroke="#a8bce8" stroke-width="2"/>
<text class="head" x="442" y="187">P：HTTP 代理</text>
<text class="copy" x="442" y="238">① 检查前端 Host</text>
<text class="copy" x="442" y="280">② 选择合格后端</text>
<text class="copy" x="442" y="322">③ 借连接并读完整响应</text>
<text class="copy" x="442" y="364">④ 归还连接</text>
<path class="line" d="M286 213 H404"/>
<path class="line" d="M286 410 H404"/>
<text class="small" x="306" y="189">前端 TCP</text>
<text class="small" x="306" y="386">前端 TCP</text>
<rect class="box" x="836" y="145" width="242" height="148" rx="12"/>
<text class="head" x="861" y="184">A：订单后端</text>
<text class="mono" x="861" y="225">A-c1</text>
<text class="small" x="861" y="264">三次查询依次完成</text>
<path class="line" d="M697 220 H824"/>
<text class="small" x="706" y="189">上游 TCP</text>
<rect class="box" x="836" y="342" width="242" height="136" rx="12"/>
<text class="head" x="861" y="380">B：另一订单后端</text>
<text class="small" x="861" y="420">独立资格与连接池</text>
<path class="line" d="M697 410 H824" stroke-dasharray="7 6"/>
<text class="small" x="709" y="501">后续实验才启用 B</text>
<rect x="42" y="521" width="1036" height="137" rx="12" fill="#fff" stroke="#d7e1ef"/>
<text class="copy" x="67" y="557">前端 Host：orders.lab.test　　上游 Host：orders.internal.test</text>
<text class="copy" x="67" y="597">每个后端只有一个池槽位；读完前一份响应，再借给下一次查询。</text>
<text class="small" x="67" y="635">图中连线是连接，reuse-* 是请求；本图不包含 TLS 会话或 HTTP/2 多路复用。</text>
''', {'fronts': ['P-c1', 'P-c2'], 'reuse_backend_connections': ['A-c1'], 'reuse_requests': 3,
      'public_host': 'orders.lab.test', 'backend_host': 'orders.internal.test'})

svg('drain', '排空看先后顺序，不只看一个健康状态',
    'B 已接收旧请求。停止向 B 分配后，新请求发给 A 并先完成，旧请求随后放行并完成，B 在途归零后关闭连接。', '''
<text class="title" x="42" y="54">排空看先后顺序，不只看一个健康状态</text>
<text class="small" x="42" y="89">与运行事件一一对应；纵向仅表示先后，不表示固定毫秒数。</text>
<text class="head" x="223" y="143">P：分配与连接池</text>
<text class="head" x="609" y="143">A</text>
<text class="head" x="914" y="143">B</text>
<path d="M340 168 V580 M625 168 V580 M930 168 V580" stroke="#c3cfe0" stroke-width="2" stroke-dasharray="5 6"/>
<rect x="891" y="185" width="78" height="352" rx="12" fill="#fff0d5" stroke="#d69a36" stroke-width="2"/>
<text class="small" x="44" y="212">① 旧请求</text>
<path class="line" d="M350 205 H878"/>
<text class="mono" x="476" y="193">drain-held → B-c1</text>
<text class="small" x="978" y="237">已接收</text>
<rect x="187" y="256" width="326" height="77" rx="10" fill="#eaf0ff" stroke="#b4c5e8"/>
<text class="copy" x="207" y="285">② B 停止接收新工作</text>
<text class="mono" x="207" y="315">active=1，旧请求继续</text>
<path class="line" d="M350 376 H614"/>
<text class="mono" x="356" y="363">③ drain-new → A-c1</text>
<path class="line" d="M614 409 H350"/>
<text class="copy" x="420" y="442">A 先返回 200</text>
<text class="small" x="978" y="405">仍等待</text>
<path class="line" d="M881 498 H350"/>
<text class="copy" x="449" y="485">④ 放行 B，旧请求返回 200</text>
<rect x="187" y="540" width="615" height="55" rx="10" fill="#e8f5ed" stroke="#a3c8b0"/>
<text class="copy" x="209" y="576">⑤ B 在途归零 → 关闭 B-c1 → 排空完成</text>
<rect x="42" y="617" width="1036" height="48" rx="10" fill="#fff" stroke="#d7e1ef"/>
<text class="small" x="65" y="648">即使池里还有 B 的连接，新工作仍需先检查 B 是否合格；资格与连接是两个对象。</text>
''', {'held': 'drain-held', 'new': 'drain-new', 'drain_active': 1,
      'held_backend': 'B', 'new_backend': 'A', 'drained_connection': 'B-c1'})

print('Drew two original proxy connection and drain SVGs.')
