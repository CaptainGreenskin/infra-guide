"""Original relationship diagrams, using actual native records or explicitly conceptual models."""
from html import escape
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
LAB = DIST / 'labs/delivery-systems'
report = json.loads((LAB / 'validation.json').read_text())
assert report['status'] == 'passed'
files = {str(p.relative_to(LAB)): p.read_text() for p in sorted(LAB.rglob('*'))
         if p.is_file() and (p.suffix in ('.py', '.md', '.json') or p.name == 'Dockerfile.mq-client') and p.name != 'validation.json'}
(DIST / 'delivery-native-data.js').write_text('const deliveryNativeFiles=' + json.dumps(files, ensure_ascii=False)
                                          + ';\nconst deliveryNativeValidation=' + json.dumps(report, ensure_ascii=False) + ';\n')
with ZipFile(DIST / 'labs/delivery-systems.zip', 'w', ZIP_DEFLATED) as z:
    for p in sorted(LAB.rglob('*')):
        if p.is_file():
            z.write(p, str(p.relative_to(LAB)))

BLUE, GREEN, RED, MUTED, AMBER = '#315dce', '#236e5e', '#a34242', '#60708b', '#946020'


def text(x, y, s, size=20, color='#24344d', weight=400, anchor='start'):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{escape(str(s))}</text>'


def rect(x, y, w, h, fill='#edf2fc', stroke='#cbd6e8'):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{fill}" stroke="{stroke}"/>'


def line(x, y, xx, yy, color=BLUE, arrow=False, dash=False):
    return f'<path d="M{x} {y}L{xx} {yy}" stroke="{color}" stroke-width="2" fill="none"' + (' marker-end="url(#arrow)"' if arrow else '') + (' stroke-dasharray="6 5"' if dash else '') + '/>'


def save(name, title, desc, height, parts, meta):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 {height}" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc><metadata>{escape(json.dumps(meta, ensure_ascii=False))}</metadata>'
    svg += '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#315dce"/></marker></defs>'
    svg += f'<rect width="960" height="{height}" fill="#fff"/><g font-family="PingFang SC,Microsoft YaHei,system-ui,sans-serif">' + text(32, 46, title, 26, weight=650) + ''.join(parts) + '</g></svg>'
    (DIST / 'diagrams' / (name + '.svg')).write_text(svg)


mq = report['native']['mq']
tf = report['native']['terraform']
git = report['native']['gitops']

# Three distinct confirmations, with labelled direction.
p = [text(32, 90, '同一业务report-27；运输接收、运输处理与业务提交分开确认。', 19, MUTED)]
for x, label, detail in ((32, '生产者', '发送运输消息'), (345, '消息代理', '路由 / 排队 / 重投'), (660, '消费者', '执行并写业务库')):
    p += [rect(x, 140, 265, 105), text(x + 20, 180, label, 24, BLUE, 600), text(x + 20, 218, detail, 19)]
p += [line(298, 163, 339, 163, arrow=True), line(345, 220, 304, 220, arrow=True), text(205, 300, '① 发布确认：代理 → 生产者', 21, BLUE, 600),
      line(610, 163, 654, 163, arrow=True), line(660, 220, 616, 220, arrow=True), text(550, 345, '② ACK：消费者 → 代理', 21, GREEN, 600),
      rect(345, 385, 580, 74, '#e8f4ef', '#bdd8cf'), text(370, 430, '③ 业务事务：效果37 + 稳定回执', 24, GREEN, 600), line(790, 245, 790, 378, arrow=True),
      text(32, 510, '发布被确认但不可路由、ACK过早却没效果，都在真实实验中单独核对。', 19, MUTED)]
save('v49-mq-confirm-paths', '谁向谁确认，决定这份确认能证明什么', '发布确认、消费者ACK与业务回执属于三个不同边界。', 550, p,
     {'kind': 'confirmation_boundaries', 'mandatory': mq['execution']['cases']['mandatory'], 'no_route': mq['execution']['cases']['confirm_without_route']})

# Actual two crash windows.
p = [text(32, 90, '真实子进程SIGKILL；同一代理与独立SQLite业务记录。', 19, MUTED)]
for y, title, events, result in ((135, '正确恢复', ['接收', '提交37', '退出', '重投/查回执', 'ACK'], '效果1次，合计37'),
                                (310, '过早ACK负例', ['接收', 'ACK', '退出', '业务尚未发生'], '队列0，效果0；任务遗漏')):
    p += [text(32, y + 33, title, 22, GREEN if y == 135 else RED, 600)]
    for i, label in enumerate(events):
        x = 220 + i * 135
        p += [rect(x, y, 120, 64, '#edf2fc' if y == 135 else '#fae9e6'), text(x + 60, y + 39, label, 17, anchor='middle')]
        if i < len(events) - 1:
            p += [line(x + 120, y + 32, x + 131, y + 32, arrow=True)]
    p += [text(220, y + 113, result, 23, GREEN if y == 135 else RED, 600)]
p += [text(32, 500, '去重必须发生在效果接收方；队列清空不能替代业务验收。', 21, MUTED)]
save('v49-mq-commit-windows', '把崩溃放在提交与ACK两边', '先业务提交后ACK能遇到重投，按稳定业务回执恢复；先ACK后业务会遗漏任务。', 540, p,
     {'kind': 'actual_crash_windows', 'effect_first': mq['execution']['cases']['effect_before_ack_crash'], 'ack_first': mq['execution']['cases']['ack_before_effect_negative']})

# API-specific in-flight windows.
p = [text(32, 90, '两条消息、同样prefetch=1；接口不同，限制不同。', 19, MUTED)]
for y, title, ready, held in ((150, '订阅basic.consume', 1, 1), (310, '拉取basic.get', 0, 2)):
    p += [text(32, y + 30, title, 23, BLUE, 600), text(370, y - 6, '代理ready', 18), text(650, y - 6, '消费者未确认', 18)]
    for i in range(2):
        p += [rect(370 + i * 90, y + 12, 72, 52, '#b4d8cd' if i < ready else '#f1f3f7'), text(406 + i * 90, y + 45, '消息' if i < ready else '空', 18, anchor='middle'),
              rect(650 + i * 90, y + 12, 72, 52, '#a6bcee' if i < held else '#f1f3f7'), text(686 + i * 90, y + 45, '消息' if i < held else '空', 18, anchor='middle')]
    p += [text(370, y + 104, '确认首条后才推第二条' if y == 150 else '应用自己限制拉取的未完成数量', 20, GREEN if y == 150 else AMBER)]
p += [text(32, 495, '预取不是线程数；也不能把订阅窗口直接套到拉取循环。', 21, MUTED)]
save('v49-mq-prefetch-window', '预取窗口，要与实际使用的API一起读', '订阅先有一条未确认和一条ready，拉取则可以拿到两条未确认；均来自实际代理。', 535, p,
     {'kind': 'actual_prefetch_comparison', 'push': mq['execution']['cases']['prefetch_push'], 'pull': mq['execution']['cases']['prefetch_get_exception']})

# State table with transitions preserving actual file.
p = [text(32, 90, '真实local_file 2.5.3；delete在此指刷新观察中的旧资源绑定。', 19, MUTED)]
for x, label in ((32, '阶段'), (355, '配置'), (540, '状态绑定'), (775, '真实文件')):
    p += [text(x, 140, label, 21, weight=600)]
for i, (label, state, actual) in enumerate((('首次apply', 'alpha', 'alpha'), ('外部修改后', 'alpha', 'outside'), ('apply refresh-only', '已移除', 'outside'), ('apply正常修复', 'alpha', 'alpha'))):
    y = 190 + i * 70
    p += [rect(24, y - 28, 910, 55, '#f6f8fc'), text(32, y + 8, label, 20), text(355, y + 8, 'alpha', 21, BLUE),
          text(540, y + 8, state, 21, AMBER if state == '已移除' else '#24344d'), text(775, y + 8, actual, 21, RED if actual == 'outside' else GREEN)]
p += [text(32, 510, '只刷新改变记录；正常修复才让本例文件重新符合配置。', 21, MUTED)]
save('v49-tf-three-objects', '配置、状态与实物：逐行看谁发生变化', '外部改文件，关闭刷新仍无变化；只刷新移除旧绑定但文件不变；正常修复才恢复alpha。', 550, p,
     {'kind': 'actual_state_transitions', 'initial': tf['initial'], 'external': tf['external_edit'], 'refresh': tf['refresh_only'], 'repair': tf['repair']})

# Lock timeline, no invented timing scale.
p = [text(32, 90, '只表达先后；没有把条形长度当成真实执行耗时。', 19, MUTED)]
for y, label in ((175, '进程一apply'), (315, '进程二plan')):
    p += [text(32, y + 8, label, 22, weight=600), line(230, y, 920, y, '#bbc8da')]
p += [rect(250, 139, 540, 72, '#dceae6'), text(270, 183, '取得状态锁 → 创建alpha → 等待屏障 → 放行', 19, GREEN),
      line(470, 211, 470, 280, RED, dash=True), rect(420, 280, 315, 72, '#fae9e6'), text(438, 323, '同一状态锁未取得，退出1', 19, RED),
      text(32, 420, '第一个进程此时仍活着；随后正常结束并释放锁。', 22),
      text(32, 478, '锁住的是这份状态，不是所有可能改动真实资源的主体。', 21, MUTED)]
save('v49-tf-lock-lanes', '状态锁：观察两个真实进程的并发边界', '第一个apply在受控钩子保持状态锁，第二个plan被拒绝，放行后第一个正常结束。', 520, p,
     {'kind': 'actual_state_lock', 'execution': tf['lock'], 'proportional_timing': False})

# Two ownership records point at one physical object.
p = [text(32, 90, '工作空间有各自状态身份，配置却仍指向同一个实际路径。', 19, MUTED)]
for x, label, value in ((32, 'blue状态', 'alpha'), (555, 'green状态', 'beta')):
    p += [rect(x, 135, 370, 116), text(x + 20, 173, label, 24, BLUE, 600), text(x + 20, 213, '记住content=' + value, 21)]
p += [line(215, 255, 425, 325, arrow=True), line(740, 255, 530, 325, arrow=True), rect(290, 330, 380, 90, '#fae9e6'),
      text(480, 364, '同一个ROOT/managed.txt', 22, anchor='middle'), text(480, 398, 'green写入后实际为beta', 20, RED, anchor='middle'),
      text(32, 480, 'blue不刷新：计划退出0；blue重新观察：退出2，发现差异。', 21, AMBER),
      text(32, 525, '状态分开，不自动提供资源命名、权限或网络隔离。', 20, MUTED)]
save('v49-tf-workspace-collision', '两份状态可以争夺同一个实物', 'blue与green状态lineage不同，但目标路径相同；green改beta后blue缓存计划仍可无变化。', 565, p,
     {'kind': 'actual_workspace_collision', 'execution': tf['workspaces']})

# Four facts, explicitly at the bad business state.
bad = git['records']['v2_synced_but_old_business']
p = [text(32, 90, '同一服务，在“只改配置v2”的提交已同步之后实际观察。', 19, MUTED)]
for i, (label, value, detail, color) in enumerate((('Git期望', 'version=v2', '固定提交872b300', BLUE), ('集群对象', 'ConfigMap=v2', 'Synced / Healthy', GREEN), ('进程环境', '仍为v1', 'Pod UID没有变化', AMBER), ('HTTP结果', 'version=v1', '独立v2判据失败', RED))):
    y = 125 + i * 92
    p += [rect(32, y, 896, 72, '#f6f8fc'), text(55, y + 44, label, 23, color, 600), text(280, y + 44, value, 24, color, 600), text(610, y + 44, detail, 20)]
p += [text(32, 540, '控制面一致、资源健康，不替代进程配置与真实用户结果。', 21, MUTED)]
save('v49-gitops-four-facts', '四份事实：绿灯为什么仍可能返回旧版', '只改ConfigMap没有替换进程，控制器Synced和Healthy时HTTP仍v1。', 580, p,
     {'kind': 'actual_gitops_business_counterexample', 'execution': bad})

# Policies and controlled ownership.
p = [text(32, 90, '在自己的Application和命名空间中分别改变一个策略。', 19, MUTED)]
rows = [('手工把副本1改2', 'selfHeal=false', '2，OutOfSync'), ('同一Git修订', 'selfHeal=true', '恢复1，Synced'),
        ('从Git移除受管旧配置', 'prune=false', '旧对象保留'), ('继续允许清理', 'prune=true', '旧对象删除，未受管保留')]
for i, (change, policy, result) in enumerate(rows):
    y = 145 + i * 76
    p += [rect(24, y - 25, 910, 57, '#f6f8fc'), text(32, y + 10, change, 20), text(350, y + 10, policy, 20, BLUE), text(610, y + 10, result, 19, GREEN if i % 2 else AMBER)]
p += [text(32, 490, '清理依据受管关系；不是删除命名空间里所有不在Git的对象。', 20, MUTED)]
save('v49-gitops-policy-matrix', '同步、自愈与清理：不同策略改变不同事实', '真实自愈与清理对照，原受管旧配置删除，而未受管配置始终保留。', 530, p,
     {'kind': 'actual_policy_comparison', 'off': git['records']['self_heal_off'], 'on': git['records']['self_heal_on'], 'prune_off': git['records']['prune_off'], 'prune_on': bad})

# Commit sequence with the template change called out, using actual identities.
p = [text(32, 90, '三个不可变源修订；每次都核对配置、Pod身份和真实HTTP。', 19, MUTED)]
for i, (sha, title, cfg, pod, response) in enumerate((('fb18c80', '初始v1', 'v1', '初始UID', 'v1'), ('872b300', '只改配置', 'v2', '同一个UID', 'v1'), ('703f38b', '再改模板', 'v2', '新UID', 'v2'))):
    x = 32 + i * 306
    p += [rect(x, 130, 280, 285, '#f6f8fc'), text(x + 20, 170, sha, 24, BLUE, 600), text(x + 20, 210, title, 22),
          text(x + 20, 265, '配置：' + cfg, 21), text(x + 20, 310, pod, 21), text(x + 20, 365, 'HTTP：' + response, 24, RED if i == 1 else GREEN, 600)]
    if i < 2:
        p += [line(x + 282, 270, x + 302, 270, arrow=True)]
p += [text(32, 475, '第二步：声明相符仍未生效。第三步：新进程读取v2，用户断言才通过。', 20, MUTED)]
save('v49-gitops-version-path', '从源版本到用户版本，中间还隔着进程', '三个Git修订的配置、模板、Pod与HTTP关系，第二个是实际被拒绝的业务反例。', 515, p,
     {'kind': 'actual_three_revisions', 'sources': git['sources'], 'v1': git['records']['v1'], 'bad': bad, 'v3': git['records']['v3_new_pod']})

# Whole-track conceptual maps. Arrows have explicit meaning, and never pretend to be traces.
p = [text(32, 90, '实线是请求或执行；虚线是控制与观测。编号对应领域，不表示全都串行。', 18, MUTED)]
for x, title, code in ((32, '客户端', ''), (265, '网络路径', 'C2'), (498, '计算与容器', 'C1 / C4'), (731, '数据读写', 'C3')):
    p += [rect(x, 145, 195, 90), text(x + 18, 183, title, 23, BLUE, 600), text(x + 18, 215, code, 18)]
    if x < 731:
        p += [line(x + 197, 190, x + 229, 190, arrow=True)]
p += [text(32, 277, '身份与允许范围贯穿每次资源访问（C7）', 21, GREEN), line(35, 295, 925, 295, GREEN, dash=True),
      rect(32, 345, 420, 87), text(52, 381, '声明、事件与交付（C5 / C6）', 22), text(52, 412, '决定期望，确认动作与版本', 19),
      rect(505, 345, 420, 87), text(525, 381, '容量、目标与恢复（C8 / C9）', 22), text(525, 412, '观察结果，调整资源与故障应对', 19),
      line(350, 344, 570, 240, arrow=True, dash=True), text(350, 319, '调谐 / 放置', 17),
      line(800, 239, 800, 339, arrow=True, dash=True), text(815, 323, '观测', 17),
      text(32, 492, 'P0解释进程、内存、并发与未知结果；这些机制支撑上面每条路径。', 19, MUTED)]
save('v49-map-cloud', 'Cloud：请求路径与控制路径怎样相连', 'Cloud的资源、网络、数据、编排、事件交付、身份、容量和可靠性，共同围绕用户请求与故障恢复组织。', 535, p,
     {'kind': 'conceptual_system_map', 'track': 'cloud', 'request_fields': ['C2', 'C1', 'C4', 'C3'], 'crosscut_fields': ['C5', 'C6', 'C7', 'C8', 'C9'], 'trace': False})

p = [text(32, 90, '训练改变参数，推理使用参数；共同计算骨架不代表相同执行目标。', 19, MUTED)]
for x, title in ((32, '输入与目标'), (340, '模型计算'), (650, '损失、梯度与更新')):
    p += [rect(x, 135, 278, 80), text(x + 20, 182, title, 23, BLUE, 600)]
    if x < 650:
        p += [line(x + 280, 175, x + 304, 175, arrow=True)]
p += [line(790, 218, 790, 260, arrow=True), line(790, 260, 475, 260, arrow=True), line(475, 260, 475, 219, arrow=True), text(535, 251, '训练：新参数回到模型', 18, GREEN),
      rect(32, 310, 420, 88), text(52, 347, '检查点与训练进度（A2）', 23), text(52, 378, '继续同一更新过程', 19),
      rect(510, 310, 420, 88), text(530, 347, '完整产物与推理（A3）', 23), text(530, 378, '使用参数，处理输入并继续生成', 18),
      line(385, 218, 245, 306, arrow=True, dash=True), text(130, 268, '保存状态', 18),
      line(455, 355, 506, 355, arrow=True), text(480, 426, '导出 / 验证 / 发布', 18, anchor='middle'),
      rect(32, 445, 896, 63, '#e8f4ef', '#bdd8cf'), text(52, 485, 'GPU、数据、通信与资源平台支撑两条路径；正确性、质量与速度分开验收。', 19, GREEN),
      text(32, 553, 'A1建立模型与执行原理，A2组织训练，A3组织作业与对外服务。', 19, MUTED)]
save('v49-map-ai', 'AI Infra：训练与推理共享什么，又分开什么', '模型计算形成训练更新闭环，检查点支持继续，完整产物经过验证和发布进入推理，执行资源支撑两条路径。', 590, p,
     {'kind': 'conceptual_system_map', 'track': 'ai', 'domains': ['A1', 'A2', 'A3'], 'training_updates_parameters': True, 'inference_uses_parameters': True, 'trace': False})

p = [text(32, 90, '任务给出目标、允许范围与完成条件；模型输出只是提议。', 19, MUTED)]
for x, title, detail in ((32, '模型提议', '选择下一步'), (340, '运行时检查', '参数 / 当前权限'), (650, '工具执行', '实际效果 / 回执')):
    p += [rect(x, 145, 278, 93), text(x + 20, 181, title, 23, BLUE, 600), text(x + 20, 218, detail, 19)]
    if x < 650:
        p += [line(x + 280, 190, x + 304, 190, arrow=True)]
p += [line(790, 240, 790, 280, arrow=True), line(790, 280, 622, 280, arrow=True),
      rect(340, 252, 278, 56, '#e8f4ef', '#bdd8cf'), text(479, 287, '保存事实，组织上下文', 19, GREEN, anchor='middle'),
      line(337, 280, 165, 280, arrow=True), line(165, 280, 165, 242, arrow=True),
      rect(32, 330, 278, 98), text(52, 367, '历史与恢复', 23), text(52, 405, '哪些动作已确认', 19),
      rect(340, 330, 278, 98), text(360, 367, '检索与证据', 23), text(360, 405, '可读、版本与预算', 19),
      rect(650, 330, 278, 98), text(670, 367, '观测与评估', 23), text(670, 405, '过程与真实结果', 19),
      line(165, 330, 165, 284, dash=True), line(480, 330, 480, 284, dash=True), line(790, 330, 790, 284, dash=True),
      text(32, 485, '沙箱限制执行能力，资源端授权限制业务动作；它们各有边界。', 20, MUTED),
      text(32, 535, 'G1–G10沿同一任务展开；Kairo接入应兑现这套协议，无需先完成GPU训练。', 19, MUTED)]
save('v49-map-agent', 'Agent Infra：把提议、效果、历史与验收接成闭环', '模型提议经过可信检查才能执行，结果形成观察和历史，检索提供证据，独立评估核对用户目标，沙箱与授权分别限制。', 575, p,
     {'kind': 'conceptual_system_map', 'track': 'agent', 'model_proposal_is_authorization': False, 'gpu_training_required': False, 'trace': False})
print('Packaged complete delivery lab and 12 original native/system relationship diagrams.')
