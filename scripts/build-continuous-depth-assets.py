"""Package checked records and draw original diagrams for the Nov 8 teaching units."""
from html import escape
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
PACKS = ('runtime-scheduling', 'speculative-decoding', 'agent-crash-windows')
files, records = {}, {}
for pack in PACKS:
    folder = DIST / 'labs' / pack
    records[pack] = json.loads((folder / 'validation.json').read_text())
    assert records[pack]['status'] == 'passed'
    files[pack] = {p.name: p.read_text() for p in sorted(folder.iterdir()) if p.is_file() and p.suffix in ('.py', '.md')}
    with ZipFile(DIST / 'labs' / (pack + '.zip'), 'w', ZIP_DEFLATED) as z:
        for p in sorted(folder.iterdir()):
            if p.is_file():
                z.write(p, p.name)
(DIST / 'continuous-depth-data.js').write_text('const continuousDepthFiles=' + json.dumps(files, ensure_ascii=False) + ';\n'
                                           + 'const continuousDepthValidation=' + json.dumps(records, ensure_ascii=False) + ';\n')

BLUE, GREEN, AMBER, RED, MUTED = '#315dce', '#236e5e', '#946020', '#a34242', '#5f708a'


def text(x, y, value, size=20, color='#24344d', weight=400, anchor='start'):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(value))}</text>'


def rect(x, y, w, h, fill='#edf2fc', stroke='#cbd6e8', radius=7):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>'


def line(x, y, xx, yy, color=BLUE, arrow=False, dash=False):
    return f'<path d="M{x} {y}L{xx} {yy}" stroke="{color}" stroke-width="2" fill="none"' + (' marker-end="url(#arrow)"' if arrow else '') + (' stroke-dasharray="6 5"' if dash else '') + '/>'


def save(name, title, desc, h, parts, meta):
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 ' + str(h) + '" role="img" aria-labelledby="title desc">'
           + '<title id="title">' + escape(title) + '</title><desc id="desc">' + escape(desc) + '</desc>'
           + '<metadata>' + escape(json.dumps(meta, ensure_ascii=False)) + '</metadata>'
           + '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#315dce"/></marker></defs>'
           + '<rect width="960" height="' + str(h) + '" fill="#fff"/><g font-family="PingFang SC,Microsoft YaHei,system-ui,sans-serif">'
           + text(32, 45, title, 26, weight=650) + ''.join(parts) + '</g></svg>')
    (DIST / 'diagrams' / (name + '.svg')).write_text(svg)


c = records['runtime-scheduling']['execution']['container']
s = records['runtime-scheduling']['execution']['scheduler']
a = records['speculative-decoding']['execution']
g = records['agent-crash-windows']['execution']

# Objects and responsibility layers, not another generic request arrow diagram.
p = [text(32, 87, '同一镜像可以创建多个实例；线程才实际消费CPU时间。', 18, MUTED),
     rect(32, 115, 896, 75), text(60, 147, '分发内容：只读镜像层 + 启动配置', 22, BLUE, 600),
     text(60, 176, '按摘要核对内容；运行时还提供用户、挂载、网络与限制。', 18)]
for x, label in ((32, '容器实例A'), (495, '容器实例B')):
    p += [rect(x, 215, 433, 145, '#f0f7f5', '#bed9d2'), text(x + 22, 247, label, 22, GREEN, 600),
          text(x + 22, 282, '进程 / 可写层 / 挂载', 20), text(x + 22, 318, 'namespace视图 + cgroup资源', 19)]
p += [rect(32, 385, 896, 85, '#f4f5f8'), text(60, 420, '共同的宿主Linux内核', 22, weight=600),
      text(60, 451, '调度、内存、设备与系统调用；不因PID视图独立而变成两份内核。', 18)]
save('v48-container-object-layers', '镜像、实例、进程与内核：四层职责', '一份镜像创建两个容器实例，它们的资源视图与限制分开，普通容器仍共享宿主内核。', 500, p,
     {'kind': 'conceptual_layers', 'shared_kernel': True, 'source_scope': c['scope']})

# Real resource counters use three different visual encodings.
cpu, pids, oom = c['cases']
p = [text(32, 87, '本轮Linux CI读数；计数差值只属于这次负载和采样窗口。', 18, MUTED),
     text(32, 134, 'CPU带宽', 23, BLUE, 600), text(270, 132, '每100ms周期：预算50ms CPU时间', 20),
     rect(270, 150, 600, 36, '#f2f4f8'), rect(270, 150, 300, 36, '#9db5f0'),
     text(270, 217, f'usage +{cpu["cpu_stat_delta"]["usage_usec"]:,}µs；throttled +{cpu["cpu_stat_delta"]["nr_throttled"]}个周期', 19),
     line(32, 242, 928, 242, '#dce3ee'), text(32, 282, '内存边界', 23, AMBER, 600),
     rect(270, 256, 260, 55, '#fff2df', '#dcc49f'), text(400, 291, '96MiB = 100,663,296B', 18, anchor='middle'),
     line(540, 284, 610, 284, arrow=True), text(630, 277, '触碰页面，继续申请', 19), text(630, 307, '137 + OOMKilled=true', 19, RED),
     line(32, 335, 928, 335, '#dce3ee'), text(32, 378, '任务名额', 23, GREEN, 600)]
for i in range(16):
    p += [rect(270 + i * 36, 353, 29, 34, '#b3dbcf'), text(284 + i * 36, 376, str(i + 1), 13, anchor='middle')]
p += [text(270, 423, f'主线程1 + 等待线程{pids["created_threads"]} = {pids["pids_current"]}；再建线程被拒绝', 19),
      text(270, 455, 'pids.events max增量=1；线程同样计入任务名额。', 18, MUTED)]
save('v48-container-resource-evidence', 'CPU、内存、线程：分别核对不同限制', '真实CPU计数增量、96MiB容器OOM和16个任务名额，不能用宿主利用率或单一退出码互相替代。', 490, p,
     {'kind': 'actual_resource_observations', 'cases': c['cases'], 'cpu_budget_fraction': [1, 2], 'fixed_performance_claim': False})

# Admission / scheduling / start responsibilities.
p = [text(32, 89, '先看对象，再看绑定，最后看容器和业务；三种失败属于不同层。', 18, MUTED)]
for i, (title, body) in enumerate((('API准入', '配额 / 校验'), ('调度过滤', '资源 / 约束'), ('节点执行', '镜像 / 网络 / 卷'), ('应用可用', '探针 / 业务结果'))):
    x = 32 + i * 230
    p += [rect(x, 125, 205, 100), text(x + 18, 162, title, 22, BLUE, 600), text(x + 18, 200, body, 17)]
    if i < 3:
        p += [line(x + 205, 175, x + 226, 175, arrow=True)]
p += [line(134, 225, 134, 278, RED, dash=True), text(32, 315, '350m > 300m', 22, RED, 600), text(32, 349, '第二个Pod不存在', 19),
      line(364, 225, 364, 365, AMBER, dash=True), text(285, 410, '5 CPU > 各节点4 CPU', 21, AMBER, 600), text(285, 445, 'Pending，无nodeName', 19),
      text(545, 300, '绑定后仍可能启动失败', 21), text(545, 337, 'Running也不等于业务就绪', 21),
      text(545, 402, '本例分开读取对象、条件和绑定。', 18, MUTED)]
save('v48-scheduler-stage-path', 'Pod没有运行：先找到停在哪一层', '配额失败没有Pod对象；调度失败对象存在但无节点绑定；绑定以后还需节点执行和业务验收。', 480, p,
     {'kind': 'stage_mapping', 'quota': s['observations']['quota_rejection'], 'oversized': s['observations']['oversized']})

# Resource shape: feasibility table and actual measured node capacities.
p = [text(32, 88, '左：声明手算，不是节点监控；右：本次kind API实际读数。', 18, MUTED)]
headers = [('节点', 40), ('剩CPU', 155), ('剩内存', 280), ('要3 CPU / 6Gi', 415)]
for label, x in headers:
    p += [text(x, 135, label, 19, weight=600)]
for y, values in ((190, ('A', '4', '4Gi', '内存不够')), (245, ('B', '2', '8Gi', 'CPU不够'))):
    for (_, x), value in zip(headers, values):
        p += [text(x, y, value, 20, RED if value.endswith('不够') else '#24344d')]
p += [rect(40, 285, 500, 92, '#fff2df', '#dcc49f'), text(62, 322, '总量6 CPU / 12Gi', 22, AMBER, 600), text(62, 354, '同一节点不能同时满足 → 无可行解', 19),
      line(570, 120, 570, 435, '#dce3ee'), text(605, 140, 'kind实际记录', 22, BLUE, 600),
      text(605, 185, '工作节点A：4 CPU', 20), text(605, 227, '工作节点B：4 CPU', 20), text(605, 280, '单Pod请求：5 CPU', 22, RED, 600),
      text(605, 325, 'PodScheduled=False', 19), text(605, 360, 'nodeName为空', 19), text(32, 430, 'kind节点共享一台宿主；报告容量不能相加当作独立物理供给。', 18, MUTED)]
save('v48-scheduler-feasibility', '集群总量足够，不等于存在可行节点', '资源形状先逐节点同时检查CPU与内存，再看约束；kind实测5CPU的单Pod不能放进任何4CPU节点。', 465, p,
     {'kind': 'declared_shape_and_actual_cpu', 'declared': {'A': [4, 4], 'B': [2, 8], 'request': [3, 6]},
      'allocatable': s['allocatable'], 'actual_request_millicpu': s['observations']['oversized']['request_millicpu']})

# Constraint matrix and actual transition.
p = [text(32, 89, 'app=spread必须分主机域；节点B带dedicated=training:NoSchedule。', 18, MUTED)]
for x, v in ((32, '待放对象'), (285, '节点A'), (555, '节点B'), (775, '实际结果')):
    p += [text(x, 138, v, 21, weight=600)]
rows = [('spread-1，无容忍', '同类已占：拒绝', '污点：拒绝', 'Pending'),
        ('spread-1，加容忍', '同类已占：拒绝', '容忍匹配：允许', '绑定B'),
        ('spread-2，有容忍', '同类已占：拒绝', '同类已占：拒绝', 'Pending')]
for i, (label, aa, bb, result) in enumerate(rows):
    y = 180 + i * 90
    p += [rect(24, y - 27, 910, 66, '#f6f8fc'), text(32, y + 10, label, 20), text(285, y + 10, aa, 19, RED),
          text(555, y + 10, bb, 19, GREEN if i == 1 else RED), text(775, y + 10, result, 21, GREEN if i == 1 else AMBER, 600)]
p += [text(32, 452, '容忍只解除对应污点这一道排斥，不保证放置，也不豁免其他硬约束。', 19, MUTED)]
save('v48-scheduler-constraint-matrix', '添加容忍以后，为什么第三个Pod仍等待', '实际反亲和与污点用例，第二个Pod添加容忍后绑定B，第三个仍被两个已占用主机域排斥。', 490, p,
     {'kind': 'actual_constraint_transitions', 'observations': {k: v for k, v in s['observations'].items() if k.startswith('spread_')}})

# Exact probability mass bars with acceptance/residual visually stacked.
p = [text(32, 88, '目标p=[1/2,1/3,1/6]；草稿q=[1/6,1/3,1/2]。', 19, MUTED),
     text(65, 175, 'p', 20, BLUE), text(65, 215, 'q', 20, AMBER)]
for i, (name, pv, qv) in enumerate(zip('ABC', (.5, 1/3, 1/6), (1/6, 1/3, .5))):
    x = 110 + i * 280
    p += [text(x, 133, name, 23, weight=600), rect(x, 155, pv * 390, 26, '#9bb5f0'), text(x + pv * 390 + 8, 175, a['sampling']['p'][i], 18, BLUE),
          rect(x, 195, qv * 390, 26, '#dbc4a0'), text(x + qv * 390 + 8, 215, a['sampling']['q'][i], 18, AMBER),
          text(x, 257, '接受质量 ' + a['sampling']['accepted_mass'][i], 19, GREEN)]
p += [line(32, 285, 928, 285, '#dce3ee'), text(32, 329, '保留：min(p,q)', 22, GREEN, 600), text(360, 329, '[1/6, 1/3, 1/6]，共2/3', 22),
      text(32, 378, '拒绝后补回', 22, BLUE, 600), text(360, 378, '[1/3, 0, 0]，共1/3', 22),
      text(32, 427, '合计正好是p', 22, weight=600), text(360, 427, '[1/2, 1/3, 1/6]', 22),
      text(32, 477, '拒绝后若再按p抽：得到[1/3,4/9,2/9]，已经改变分布。', 19, RED)]
save('v48-spec-probability-mass', '留下共同质量，再补目标缺少的部分', '三词元的接受质量与残差重建目标分布，错误直接用目标作为残差会改变边际概率。', 510, p,
     {'kind': 'exact_probability', **{k: a['sampling'][k] for k in ('p', 'q', 'accepted_mass', 'residual', 'correct_marginal', 'wrong_using_p_as_residual')}})

# Causal visibility matrix and shifted predictions.
p = [text(32, 88, '已有P长3；一次送入d₁、d₂、d₃。当前位置不能看到未来候选。', 18, MUTED)]
labels = ['P₁', 'P₂', 'P₃', 'd₁', 'd₂', 'd₃']
for j, label in enumerate(labels):
    p += [text(190 + j * 64, 135, label, 19, anchor='middle')]
for i in range(3):
    y = 160 + i * 58
    p += [text(44, y + 30, '核对行d' + str(i + 1), 19)]
    for j in range(6):
        p += [rect(165 + j * 64, y, 50, 42, '#b9d9d0' if j <= i + 3 else '#f1f3f7'),
              text(190 + j * 64, y + 28, '可见' if j <= i + 3 else '遮住', 15, anchor='middle')]
    p += [text(615, y + 29, '输出预测下一位置：p' + str(i + 2), 19, BLUE)]
p += [rect(40, 365, 875, 65), text(60, 405, 'p₁来自已有前缀最后一行；d₁那一行输出的是p₂。', 21, BLUE, 600),
      text(40, 475, '并行计算条件分数；接受仍从左到右，第一处拒绝后丢弃后续分支。', 18, MUTED)]
save('v48-spec-verification-grid', '核对候选时，分数要与前缀对齐', '因果掩码矩阵使用绝对位置；已有前缀末行预测第一个候选，候选的输出行预测后一个位置。', 510, p,
     {'kind': 'causal_position_matrix', 'prefix_length': 3, 'draft_length': 3, 'allowed': [[j <= i + 3 for j in range(6)] for i in range(3)]})

# Cache cut after first acceptance; actual tensors checked separately.
p = [text(32, 88, '实际CPU夹具；缓存格表示词元位置，不代表每格的完整向量。', 18, MUTED)]
for y, label, tokens in ((140, '验证后6行', ['1', '2', '3', '0', '5', '3']),
                         (250, '裁剪后4行', ['1', '2', '3', '0']), (360, '修正后5行', ['1', '2', '3', '0', '4'])):
    p += [text(35, y + 33, label, 22, weight=600)]
    for j, token in enumerate(tokens):
        fill = '#edf2fc' if j < 3 else '#b9d9d0'
        if y == 140 and j >= 4:
            fill = '#f5d9d5'
        p += [rect(225 + j * 95, y, 75, 56, fill), text(262 + j * 95, y + 36, token, 24, anchor='middle')]
    if y == 140:
        p += [text(620, y + 87, '拒绝5 → 删去它及后续位置', 18, RED)]
p += [text(35, 480, '错误不裁剪：追加后7行；正确5行。下一步分数最大差≈0.450285。', 19, RED)]
save('v48-spec-cache-cut', '只保留接受前缀，再消费修正词元', '前缀3行加草稿3行为6行，第二个拒绝后只保留4行，再追加修正得到5行。', 515, p,
     {'kind': 'actual_cache_cut', 'execution': a['cache']['reject_second']})

# Cost boundary is an explicit equation, not a fake benchmark.
p = [text(32, 90, '声明模型：各位置独立、接受概率α=2/3，k=2。不是测量。', 19, MUTED),
     text(32, 148, '期望提交数', 23, BLUE, 600), text(300, 148, '1 + 2/3 + 4/9 = 19/9', 26),
     text(32, 210, '一轮成本', 23, BLUE, 600), rect(300, 178, 170, 50, '#f5e7d2'), text(385, 211, '2 × 草稿c', 21, anchor='middle'),
     text(490, 211, '+', 26), rect(540, 178, 330, 50), text(705, 211, '验证与状态推进v', 21, anchor='middle'),
     line(32, 260, 928, 260, '#dce3ee'), text(32, 315, '每提交词元成本', 23, weight=600), text(360, 315, '(2c + v) / (19/9)', 26),
     text(32, 380, '只有它小于普通目标每词元成本t，模型才预测更快。', 22, GREEN),
     text(32, 431, '真实负载仍要测草稿、验证、显存、批次和排队；高接受率不保证加速。', 18, MUTED)]
save('v48-spec-cost-boundary', '接受率与速度之间，还隔着成本分子', '明确假设的成本模型，不把接受率或函数调用数换算成实测加速比。', 470, p,
     {'kind': 'declared_cost_model', 'alpha': '2/3', 'gamma': 2, 'expected_tokens': '19/9', 'measured_speedup': False})

# Two independent durability domains with actual child process scope.
p = [text(32, 88, '固定动作：demo增加37，身份logical-add-1；两份SQLite文件。', 19, MUTED),
     rect(32, 120, 385, 235), text(58, 160, '运行器子进程', 24, BLUE, 600), text(58, 205, '提交意图与操作身份', 21), text(58, 250, '发请求 → 收到响应', 21), text(58, 295, '提交观察 → 完成', 21),
     rect(540, 120, 385, 235, '#f0f7f5', '#bed9d2'), text(565, 160, '独立存活的工具服务', 24, GREEN, 600),
     text(565, 205, '核对同键 / 参数指纹', 21), text(565, 250, '同一事务：效果 + 回执', 21), text(565, 295, '回应或等待查询', 21),
     line(417, 238, 535, 238, arrow=True), line(540, 305, 422, 305, arrow=True),
     text(32, 410, '杀死运行器，不会自动撤回工具事务；本地事务也不包住HTTP。', 22, RED, 600),
     text(32, 455, '最终核对账户、回执与本地观察，不能只看DONE。', 20, MUTED)]
save('v48-agent-two-domains', '效果与进度，属于两个提交域', '真实子进程运行器和存活的本地HTTP接收方分开保存进度与效果，崩溃不会让两者自动原子提交。', 490, p,
     {'kind': 'durability_domains', 'amount': 37, 'operation': 'logical-add-1', 'separate_sqlite_files': True, 'scope': g['scope']})

# Crash windows matrix, aligned with actual reports.
p = [text(32, 88, '屏障定位后真实SIGKILL；效果数独立读取工具数据库。', 18, MUTED)]
for x, label in ((32, '崩溃位置'), (300, '本地'), (475, '效果'), (600, '恢复依据'), (820, '最终金额')):
    p += [text(x, 137, label, 21, weight=600)]
names = ['意图后', '工具提交前', '工具提交后', '收到响应后', '本地观察后', '完成后']
paths = ['查询后原键提交', '查到旧请求回执', '查询原回执', '查询原回执', '持久观察', '直接返回']
for i, row in enumerate(g['cases']):
    y = 182 + i * 53
    p += [rect(25, y - 26, 910, 44, '#f6f8fc'), text(32, y + 4, names[i], 20), text(300, y + 4, row['at_crash']['runner_phase'], 19),
          text(485, y + 4, row['at_crash']['effects'], 20), text(600, y + 4, paths[i], 19), text(840, y + 4, row['recovered']['amount'], 21, GREEN, 600)]
p += [text(32, 542, '每例最终效果=1；再次恢复HTTP调用=0。负例换新身份则产生2次 / 74。', 18, MUTED)]
save('v48-agent-crash-window-matrix', '六个窗口：状态和事实一起读', '六次实际崩溃的本地状态、外部效果数及恢复依据，对照独立账户结果。', 578, p,
     {'kind': 'actual_crash_windows', 'cases': g['cases'], 'negative_amount': g['negative']['recovered']['amount']})

# Absence race as a proper swimlane; timing only relative.
p = [text(32, 88, '横向只表达屏障规定的先后，不表示网络耗时比例。', 18, MUTED)]
for y, label in ((155, '运行器'), (275, '工具服务'), (395, '父进程 / 恢复者')):
    p += [text(32, y + 6, label, 20, weight=600), line(205, y, 920, y, '#b8c5d8')]
p += [line(265, 155, 340, 275, arrow=True), text(230, 122, 'POST已发', 18),
      rect(338, 246, 170, 58, '#fff2df', '#dcc49f'), text(422, 282, '暂停在提交前', 19, anchor='middle'),
      line(390, 395, 390, 155, RED, dash=True), text(348, 438, 'SIGKILL', 18, RED),
      line(525, 395, 525, 275, arrow=True), text(480, 241, 'GET：空', 18, AMBER),
      line(650, 395, 650, 275, arrow=True), text(608, 438, '释放屏障', 18),
      rect(700, 246, 202, 58, '#d9eee7', '#bed9d2'), text(800, 282, '旧POST提交37', 19, GREEN, 600, 'middle'),
      text(32, 504, '查询为空 ≠ 旧请求不会再提交；按原身份重试才可与迟到请求汇合。', 21, RED, 600)]
save('v48-agent-absent-race', '进程已退出、回执暂为空，旧请求仍可能提交', '真实HTTP提交前屏障，调用方SIGKILL后GET为空，释放工具线程后旧请求仍产生一次37的效果。', 542, p,
     {'kind': 'actual_absence_race', 'execution': next(row for row in g['cases'] if row['window'] == 'before_commit'), 'timing_scale': False})
print('Packaged 3 complete labs and drew 12 original diagrams from declared inputs and actual records.')
