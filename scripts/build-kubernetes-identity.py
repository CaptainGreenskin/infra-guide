"""Build the existing IAM chapter bridge only from a successful native CI record."""
import argparse
import hashlib
from html import escape
import json
from pathlib import Path
import re
import runpy
import zipfile

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / 'dist/labs/kubernetes-identity'
DIAGRAMS = ROOT / 'dist/diagrams'


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text(x, y, value, size=20, color='#28384d', weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(str(value))}</text>'


def box(x, y, width, height, fill='#edf3ff'):
    return f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="12" fill="{fill}" stroke="#cbd7e8"/>'


def arrow(x1, y1, x2, y2):
    return f'<path d="M{x1} {y1} L{x2} {y2}" stroke="#4c6ead" stroke-width="3" fill="none" marker-end="url(#arrow)"/>'


def svg(name, height, title, description, observation, source_sha256, pieces):
    metadata = {'source_sha256': source_sha256, 'observation': observation}
    result = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title><desc id="desc">{escape(description)}</desc>
<metadata>{escape(json.dumps(metadata, ensure_ascii=False, separators=(',', ':')))}</metadata>
<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10" fill="#4c6ead"/></marker></defs>
<rect width="1120" height="{height}" fill="#fbfcff"/>
<g font-family="-apple-system,BlinkMacSystemFont,'Noto Sans CJK SC','Microsoft YaHei',sans-serif">
{text(36, 48, title, 28, '#1f3047', 700)}{text(36, 83, description, 18, '#617187')}
{''.join(pieces)}</g></svg>'''
    (DIAGRAMS / ('kubernetes-identity-' + name + '.svg')).write_text(result + '\n')


def figures(record):
    o = record['observation']
    digest = record['source_sha256']['identity_lab.py']
    pieces = [box(36, 119, 310, 111), text(55, 155, 'ServiceAccount', 23, weight=700),
        text(55, 190, 'report-a / report-reader', 21), text(55, 218, '命名的主体，不是凭证本身', 18, '#617187'),
        arrow(354, 174, 394, 174), box(406, 119, 310, 111), text(426, 155, 'TokenRequest', 23, weight=700),
        text(426, 190, 'audience = 本集群 API', 21), text(426, 218, '申请有期限的 Bearer token', 18, '#617187'),
        arrow(724, 174, 764, 174), box(776, 119, 308, 111), text(797, 155, '签名的短期凭证', 23, weight=700),
        text(797, 190, 'sub / aud / exp', 21), text(797, 218, '声明要由接收方验证', 18, '#617187')]
    pieces += [text(36, 287, 'GET /api/v1/namespaces/report-a/configmaps/reports-v1', 22, '#315dce', 700)]
    row = [(36, '① HTTPS', 'CA 验证服务器', 'Bearer 携带凭证'),
           (306, '② 认证', '签名、受众、有效期', '确定 report-reader'),
           (576, '③ RBAC 授权', '绑定 → Role 规则', 'get + 对象 + namespace'),
           (846, '④ 读取对象', 'reports-v1', '200 / value = 37')]
    for i, (x, title, line1, line2) in enumerate(row):
        pieces += [box(x, 320, 238, 133, '#eaf4ed' if i == 3 else '#edf3ff'), text(x + 16, 357, title, 22, weight=700),
                   text(x + 16, 395, line1, 19), text(x + 16, 429, line2, 18)]
        if i < 3:
            pieces.append(arrow(x + 242, 386, x + 262, 386))
    pieces += [text(36, 498, 'SelfSubjectReview 实际主体：system:serviceaccount:report-a:report-reader', 20),
               text(36, 533, '管理员只建立夹具和读取 oracle；上面的业务请求不加载管理员客户端证书。', 18, '#617187')]
    svg('flow', 560, '同一份报表：先建立身份，再判断读取资格', '正常路径的每一层都对应本次原生 API 调用与实际读取的 37。',
        {'credentials': o['credentials'], 'http': [row for row in o['http'] if row['case'] in ('who_am_i', 'read_allowed')]}, digest, pieces)

    cases = {row['case']: row for row in o['http']}
    pieces = [text(36, 133, '同一 reader-1：只改变 RoleBinding', 23, '#315dce', 700)]
    columns = [(36, 265, '实验状态'), (317, 235, 'TokenReview'), (570, 515, '业务 GET 结果')]
    for x, width, label in columns:
        pieces += [box(x, 157, width, 47, '#e7edf8'), text(x + 16, 188, label, 21, weight=700)]
    rows = [('绑定存在', '认证成功', 'read_allowed', '读出 value=37'),
            ('删除绑定', '仍认证成功', 'binding_removed', '缺少这次读取的允许'),
            ('恢复绑定', '仍认证成功', 'binding_restored', '再次读出 value=37')]
    for i, (state, authentication, case, meaning) in enumerate(rows):
        y = 219 + i * 73
        for x, width, _ in columns:
            pieces.append(box(x, y, width, 61, '#fff1e8' if case == 'binding_removed' else '#eaf4ed'))
        pieces += [text(52, y + 39, state, 22), text(333, y + 39, authentication, 21),
                   text(587, y + 39, str(cases[case]['status']) + '：' + meaning, 21)]
    pieces += [text(36, 486, '换一枚错误受众凭证：authenticated=false → HTTP ' + str(cases['wrong_audience']['status']), 22, '#a04d2d', 700),
        text(36, 526, '删除 UID 绑定的 Pod：authenticated=false → HTTP ' + str(cases['bound_after_delete']['status']), 22, '#a04d2d', 700),
        text(36, 562, '本次删除命令完成后 ' + str(o['bound_pod']['revocation_observed_seconds']) + ' 秒观察到失效；轮询 ' + str(o['bound_pod']['revocation_checks']) + ' 次。', 19, '#617187'),
        text(36, 607, '独立 oracle：4 个受保护对象的 UID、resourceVersion 和数据摘要前后相同。', 20),
        text(36, 644, '认证状态、授权决定、读取内容与对象是否被改动，分别从原生结果核对。', 18, '#617187')]
    svg('decisions', 675, '认证仍成立，读取权限可以已经改变', '200 → 403 → 200 使用同一凭证；错误受众和绑定对象失效进入认证失败。',
        {'http': o['http'], 'token_reviews': o['token_reviews'], 'bound_pod': o['bound_pod']}, digest, pieces)


def excerpt(source, start, end):
    return source[source.index(start):source.index(end, source.index(start))].rstrip()


def bridge(validation, source):
    o = validation['execution']['observation']
    claims = o['credentials']['reader-1']
    claim_code = dump({'sub': claims['subject'], 'iss': claims['issuer'], 'aud': claims['audiences'],
                       'iat': claims['issued_at'], 'exp': claims['expires_at']}).rstrip()
    snippets = {
        'issue': excerpt(source, "        spec = {'audiences': audiences", '        # Decoding is introspection only.'),
        'tls': excerpt(source, "        ca = base64.b64decode(cluster", "        self.observation['tls']"),
        'request': excerpt(source, '        payload = None if body is None', '        row ='),
        'role': excerpt(source, "        self.apply({'apiVersion': 'rbac.authorization.k8s.io/v1', 'kind': 'Role',", "        self.observation['before']"),
        'claims': claim_code,
        'normal': """spec = {'audiences': [audience], 'expirationSeconds': 600}
result = json.loads(self.k('create', '--raw',
    '/api/v1/namespaces/report-a/serviceaccounts/report-reader/token', '-f', '-',
    data=json.dumps({'apiVersion': 'authentication.k8s.io/v1',
                     'kind': 'TokenRequest', 'spec': spec})).stdout)
token = result['status']['token']
request = urllib.request.Request(self.server + PATH,
    headers={'Authorization': 'Bearer ' + token}, method='GET')
with self.opener.open(request, timeout=15) as response:
    status, value = response.status, json.load(response)""",
    }
    prefix = 'const kubernetesIdentitySource = ' + json.dumps(source, ensure_ascii=False) + ';\n'
    prefix += 'const kubernetesIdentityEvidence = ' + json.dumps(validation, ensure_ascii=False, separators=(',', ':')) + ';\n'
    prefix += 'const kubernetesIdentitySnippets = ' + json.dumps(snippets, ensure_ascii=False) + ';\n'
    return prefix + r'''/* Deepen existing h2 bodies; keep their titles, IDs and original code intact. */
{
 const a=articles.find(item=>item.id==='iam-security');
 if(!a)throw Error('Identity bridge requires the existing IAM chapter');
 const e=kubernetesIdentityEvidence,o=e.execution.observation;
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const p=(...texts)=>texts.map(t=>'<p>'+t+'</p>').join('');
 const code=(label,lang,value)=>'<div class="code-block"><div class="code-toolbar"><span>'+esc(label)+'</span><button type="button" data-copy-code>复制代码</button></div><pre><code class="language-'+lang+'">'+esc(value)+'</code></pre></div>';
 const fig=(name,alt,caption)=>'<figure class="training-figure"><img src="diagrams/kubernetes-identity-'+name+'.svg" alt="'+esc(alt)+'" loading="lazy"><figcaption>'+caption+'</figcaption></figure>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const add=(title,body)=>{const section=a.sections.find(s=>s[0]===title);if(!section)throw Error('Missing preserved IAM section: '+title);section[1]+=body;};
 add('沿着身份链走一遍，找出每次委托',
 '<div class="mechanism-core" id="kubernetes-identity-normal"><h3>四个对象，串起工作者的一次读取</h3>'+p(
 '在 Kubernetes 中，ServiceAccount 给工作负载命名；TokenRequest 为它申请有期限的签名凭证；Role 写明允许的动作与资源；RoleBinding 把 Role 交给主体。认证先验证凭证、确定“是谁”，RBAC 授权再判断“这次能做什么”。创建 ServiceAccount 只是建立主体，还需要取得凭证并匹配授权。',
 '把租户 A 的报表输入缩成 ConfigMap：report-a/reports-v1，value=37。工作者以 report-reader 申请 token，audience 指定接收它的 API。客户端用 CA 验证服务器，再携带 Bearer 凭证发起 GET。API 认出 system:serviceaccount:report-a:report-reader，按绑定找到 Role，核对 get、configmaps、reports-v1 和 report-a，最后返回 200 与 37。',
 'Kubernetes 命名空间（namespace）划定对象的命名范围；report-a 与 report-b 中同名的 reports-v1 是两份资源。Bearer 表示请求者携带凭证；CA 建立对服务器的信任，token 建立请求者身份，Role 限定行为。这三种职责分别在连接、认证和授权时生效。')+
 fig('flow','report-reader通过TokenRequest取得短期凭证，API先认证再按RoleBinding和Role授权，读取reports-v1等于37','同一主体、凭证与资源贯穿正常读取路径。')+
 p('下面保留这条正常路径的核心 API。audience 是本集群 API 的受众；self.k 是显式使用私有 kubeconfig 的管理调用，self.opener 是仅加载 CA 的 HTTPS 客户端，PATH 指向这份报表。对象准备、异常处理和记录汇总在完整程序中。')+
 code('核心 API 节选 · 申请凭证，再读取同一份输入','python',kubernetesIdentitySnippets.normal)+
 p('本次原生实验还用 SelfSubjectReview 查询接收方实际认出的主体，并独立读回 37。读懂这条正常路径后，再展开权限变化与失败对照：同一凭证可以仍通过认证，却已经没有读取权限。')+
 '<details><summary>按需：凭证字段、TokenReview 与 CA/Bearer 实现</summary>'+p(
 '本实验由管理员发起 TokenRequest，再把 token 交给独立客户端。实际 Pod 中常由 kubelet 申请并投射凭证，应用从挂载文件读取。以下声明来自本次返回：sub 是主体，aud 是接收方，exp 是有效期；解码用于观察，验真由 API 完成。')+
 code('实际声明节选 · 不含 token 字符串','json',kubernetesIdentitySnippets.claims)+
 p('SelfSubjectReview 返回本次请求实际使用的主体；TokenReview 则由管理路径请 API 检查给定 token 对指定受众是否有效。本次实际主体为 '+esc(o.http.find(row=>row.case==='who_am_i').body.status.userInfo.username)+'。')+
 code('TokenRequest 方法节选 · 包含可选 Pod UID 绑定','python',kubernetesIdentitySnippets.issue)+
 code('业务 HTTPS 节选 · 构造 CA 信任、携带 Bearer 并读取状态；记录汇总与函数返回省略','python',kubernetesIdentitySnippets.tls+'\n\n'+kubernetesIdentitySnippets.request)+
 p('管理员客户端证书只属于管理路径。业务 HTTPS 仅验证服务器 CA 并发送 Bearer 凭证，否则请求可能以管理员身份成功，掩盖工作者实际没有权限。')+'</details></div>');
 add('从一项具体任务推导最少的权限',
 '<details class="mechanism-core" id="kubernetes-identity-rbac"><summary>按需：把只读 reports-v1 翻译成 Role 与绑定</summary>'+p(
 'Kubernetes RBAC 先用规则描述允许的动作，再用绑定把规则交给主体。这里的 Role 位于 report-a；apiGroups 为空字符串表示核心 API 组，resources=configmaps 表示对象类型，verbs=get 表示读取单个已知名称，resourceNames=reports-v1 再把范围收窄到这份输入。RoleBinding 的 subjects 指向 report-a/report-reader，roleRef 指向这条 Role。',
 '一次匹配要同时满足动作、资源类型、资源名和 namespace；把其中任一项换掉，都应重新求值。下面的原生配置只授予已知名称读取，因此不需要列举所有报表，也不需要修改输入。RBAC 会累加所有适用绑定的允许；排查时仍要核对主体是否还从其他绑定获得权限。')+
 code('完整程序的 Role / RoleBinding 创建节选','python',kubernetesIdentitySnippets.role)+
 table(['请求中的事实','本次允许条件','实际对照'],[
 ['主体','report-a/report-reader','SelfSubjectReview 返回完整 ServiceAccount 主体'],
 ['namespace + 类型 + 名称','report-a / configmaps / reports-v1','同 namespace 改名或同名跨 namespace 都被拒绝'],
 ['动作','get 单个已知对象','PATCH 与 list 均被拒绝'],
 ['结果','200 后再核对对象内容','实际读取 data.value=37']])+
 p('这把前面的最小权限要求落到一组能执行的条件。AWS IAM 的显式拒绝与策略组合规则仍按前文学习；这里求值的是 Kubernetes 的累加允许模型。数据服务中的用户委托和租户行归属也继续由数据服务检查，读取平台配置的资格不会自动授予任意报表数据权限。')+'</details>');
 add('短期凭证要处理签发、续期和撤销三个时刻',
 '<details class="mechanism-core" id="kubernetes-identity-changes"><summary>按需：同 token 的 200 → 403 → 200、错误受众与 Pod 撤销</summary>'+p(
 '先保持 reader-1 的 token 完全相同，只删除它唯一的 RoleBinding。TokenReview 仍认证为 report-reader，业务 GET 却从 200 变成 403：凭证仍能回答“是谁”，当前策略已经不再允许这次读取。恢复绑定后，同 token 再次读出 37。正常签发、权限变化和读取结果因此可以放在一条连续时间线上。',
 '再换一个条件：为 reports-api.invalid 受众签发另一枚 token，而业务请求仍交给本集群 API。它的签名来源可以相同，受众却不匹配；本次 TokenReview 的 authenticated=false，实际 HTTP 为 401。401 表示这条实验路径的凭证未被接受，403 表示请求已建立身份却没有匹配到允许，200 后继续核对内容才知道拿到了哪份输入。')+
 fig('decisions','同token删除恢复RoleBinding得到200、403、200；错误受众和删除Pod绑定凭证得到401','图中的状态来自同一份原生记录。策略撤销保留了认证主体，绑定对象撤销则进入认证失败。')+
 p('最后申请一枚绑定到实际 Pod UID 的 token，先正常读出 37，再删除该 Pod。程序等待删除命令完成，随后最多用 90 秒轮询 TokenReview；本次 '+esc(o.bound_pod.revocation_checks)+' 次检查，在 '+esc(o.bound_pod.revocation_observed_seconds)+' 秒时观察到认证失败，再用同 token 得到 HTTP 401。这个时间起点是删除命令完成，不能解释成发出 delete 时所有接收方立即撤销。',
 '绑定引用包含 UID；同名重建是另一个对象身份。本例 Pod 只提供一个真实 API 绑定对象，由不存在的调度器保持 Pending，没有运行报表容器。在线 TokenReview 能按控制面检查对象状态；只核对签名与时间的离线验证者还需要自己的失效策略。权限被收回也不会自动删除已读出的 37 或撤回已完成的业务效果。')+'</details>');
 add('配套实战：真实HTTP授权与无副作用验收',
 '<details class="mechanism-core" id="kubernetes-identity-run"><summary>原生实战：运行方法、完整结果、独立 oracle 与源码</summary>'+p(
 '先写下你的预测：删除 RoleBinding 后，TokenReview 与 GET 各得到什么？把目标改成 reports-v2，或把 GET 改成 PATCH，哪一项允许条件失配？再运行下面的完整程序。它建立独立 kind 集群，使用真实 kube-apiserver 处理所有请求；原有 HMAC 与 SQLite 实验继续用于业务资源授权的对照。')+
 code('Linux / 本机 Docker / kind v0.33.0 / kubectl 1.35.8 / Python 3.9+','sh','python3 -B identity_lab.py --output identity-record.json\npython3 -B identity_lab.py --check-record identity-record.json')+
 table(['同一次实验','本次实际结果','继续核对'],[
 ['正确主体读取 reports-v1','200，value=37','返回对象的 namespace 与名称也匹配'],
 ['其他名称 / namespace / PATCH / Secret / list','5 组 403','响应中的实际主体是 report-reader'],
 ['同 token 删除 / 恢复绑定','200 → 403 → 200','三个阶段 TokenReview 都认证成功'],
 ['错误受众 / 已删除的 Pod 绑定','401 / 401','TokenReview 都认证失败'],
 ['管理员独立读取 oracle','4 个对象前后相同','UID、resourceVersion、数据摘要均未变化']])+
 p('只检查 403 会漏掉“先改数据，最后才返回拒绝”。完整程序在请求前后用独立管理路径读取三个 ConfigMap 和一个教学 Secret，比较对象身份、版本及数据摘要。状态码证明请求路径的决定，读取到的 37 证明必要功能可用，未变化的对象事实再检查拒绝路径的效果。',
 '本次原生执行环境为 '+esc(e.execution.versions.kubernetes)+' / '+esc(e.execution.versions.kind)+'，来自 <a href="'+esc(e.origin.run_url)+'" target="_blank" rel="noopener">隔离 Linux CI 记录</a>。节点镜像固定内容摘要，退出时只清理本次随机命名的集群；验证记录绑定完整源码摘要。实验覆盖原生 API 认证与 RBAC，不涵盖云 IAM、投射自动刷新、网络隔离或生产多租户。')+
 '<details class="full-code"><summary>展开完整原生实验：凭证申请、CA-only 业务请求、原生判定、独立 oracle 与清理</summary>'+code('identity_lab.py · 完整源码','python',kubernetesIdentitySource)+'</details>'+
 '<p class="practice-links"><a href="labs/kubernetes-identity.zip" download>下载完整身份实验包 ↓</a><a href="labs/kubernetes-identity/identity_lab.py" download>下载源码 ↓</a><a href="labs/kubernetes-identity/validation.json" target="_blank" rel="noopener">查看原生结果、来源与源码摘要 ↗</a></p></details>');
 Object.assign(sources,{
  kubernetesIdentitySA:['Kubernetes · ServiceAccount、受众与验证','https://kubernetes.io/docs/concepts/security/service-accounts/'],
  kubernetesIdentityRBAC:['Kubernetes · Role、绑定与资源名','https://kubernetes.io/docs/reference/access-authn-authz/rbac/'],
  kubernetesIdentityBound:['Kubernetes · 绑定 token 与对象生命周期','https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/'],
  kubernetesIdentitySelf:['Kubernetes · 接收方认出的主体','https://kubernetes.io/docs/reference/access-authn-authz/authentication/#self-subject-review']
 });
 a.refs=[...new Set([...a.refs,'kubernetesIdentitySA','kubernetesIdentityRBAC','kubernetesIdentityBound','kubernetesIdentitySelf'])];
 a.updated='2026.11.08';
}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record', type=Path, required=True)
    parser.add_argument('--run-url', required=True)
    parser.add_argument('--source-commit', required=True)
    args = parser.parse_args()
    assert re.fullmatch(r'https://github.com/CaptainGreenskin/infra-guide/actions/runs/\d+', args.run_url)
    assert re.fullmatch(r'[0-9a-f]{40}', args.source_commit)
    record = json.loads(args.record.read_text())
    assert record['status'] == 'passed' and record['system'] == 'Linux'
    assert record['cleanup']['complete'] and record['cleanup']['owned_cluster_absent']
    assert record['source_sha256']['identity_lab.py'] == sha(LAB / 'identity_lab.py')
    program = runpy.run_path(str(LAB / 'identity_lab.py'))
    program['verify'](record['observation'])
    assert record['node_image'] == program['NODE_IMAGE']
    assert record['versions']['kubernetes'] == 'v1.35.8'
    validation = {'checked_on': '2026-11-08', 'status': 'passed',
        'source_sha256': {name: sha(LAB / name) for name in ('identity_lab.py', 'README.md')},
        'origin': {'kind': 'isolated Linux Docker in GitHub Actions', 'run_url': args.run_url,
                   'source_commit': args.source_commit}, 'execution': record}
    (LAB / 'validation.json').write_text(dump(validation))
    (ROOT / 'dist/kubernetes-identity-bridge.js').write_text(bridge(validation, (LAB / 'identity_lab.py').read_text()))
    figures(record)
    with zipfile.ZipFile(LAB.with_suffix('.zip'), 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in ('README.md', 'identity_lab.py', 'validation.json'):
            archive.write(LAB / name, 'kubernetes-identity/' + name)
    print('PASS: actual native identity record bound to preserved IAM sections, two SVGs, complete source and ZIP.')


if __name__ == '__main__':
    main()
