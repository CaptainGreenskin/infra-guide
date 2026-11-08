"""Compose the existing five-section service chapter only from a successful native record."""
import argparse
import hashlib
from html import escape
import json
from pathlib import Path
import re
import runpy
import zipfile

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / 'dist/labs/kubernetes-service'
DIAGRAMS = ROOT / 'dist/diagrams'


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text(x, y, value, size=20, color='#28384d', weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(str(value))}</text>'


def box(x, y, w, h, fill='#edf3ff'):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="#cbd7e8"/>'


def arrow(x1, y1, x2, y2, color='#4c6ead'):
    return f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{color}" stroke-width="3" fill="none" marker-end="url(#arrow)"/>'


def svg(name, height, title, desc, observation, source_sha256, pieces):
    metadata = {'source_sha256': source_sha256, 'observation': observation}
    result = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc>
<metadata>{escape(json.dumps(metadata, ensure_ascii=False, separators=(',', ':')))}</metadata>
<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10" fill="#4c6ead"/></marker></defs>
<rect width="1120" height="{height}" fill="#fbfcff"/><g font-family="-apple-system,BlinkMacSystemFont,'Noto Sans CJK SC','Microsoft YaHei',sans-serif">
{text(36,48,title,28,'#1f3047',700)}{text(36,83,desc,18,'#617187')}{''.join(pieces)}</g></svg>'''
    (DIAGRAMS / ('kubernetes-service-' + name + '.svg')).write_text(result + '\n')


def figures(record):
    o = record['observation']
    digest = record['source_sha256']['service_lab.py']
    normal = o['cases']['normal_v1']['api_after']
    pods = normal['pods']
    pieces = [box(36,121,300,112), text(55,157,'Deployment：期望两个副本',20,weight=700),
        text(55,191,'模板 APP_VERSION=v1',20),text(55,219,'控制器创建并维护 Pod',18,'#617187'),
        arrow(350,177,408,177),box(425,121,659,112,'#eaf4ed'),text(446,157,'Pod A / Pod B：实际运行的两个业务进程',22,weight=700),
        text(446,191,'每个 Pod 有独立 UID；返回版本、UID 与请求 ID',20),text(446,219,'kubelet 周期探测 /ready 与 /live，各自执行不同动作',18,'#617187')]
    pieces += [box(36,255,520,90,'#fff7e8'),text(55,288,'EndpointSlice：后端地址 + ready 条件',21,weight=700),
        text(55,323,'控制对象；供转发组件观察，不承载 HTTP 请求',18,'#617187'),
        '<path d="M433 348 L433 385" stroke="#a87928" stroke-width="3" stroke-dasharray="7 5" fill="none" marker-end="url(#arrow)"/>',
        text(590,288,'虚线：转发组件据此更新规则',19,'#8a6220'),text(590,323,'实线：客户端的实际 HTTP 数据路径',19,'#4c6ead')]
    chain = [(36,390,246,'① 客户端 Pod','新连接 GET /work','X-Request-ID 每次唯一'),
             (310,390,246,'② ClusterIP 转发','稳定 IP '+normal['service']['cluster_ip'],'按转发规则选择就绪后端'),
             (584,390,246,'③ Pod 内应用','选中 Pod A 或 Pod B','8080 端口处理 /work')]
    for x,y,w,title,line1,line2 in chain:
        pieces += [box(x,y,w,150),text(x+16,y+36,title,22,weight=700),text(x+16,y+77,line1,16),text(x+16,y+117,line2,16,'#617187')]
        pieces.append(arrow(x+w+4,y+75,x+w+22,y+75))
    pieces += [box(858,390,226,150,'#eaf4ed'),text(874,426,'④ 实际响应',22,weight=700),text(874,467,'HTTP 200 / v1',20),text(874,507,'回显请求 ID 与 Pod UID',16,'#617187'),
        text(36,587,'正常样本实际包含两个 UID：'+pods[0]['uid'][:8]+'… 和 '+pods[1]['uid'][:8]+'…',20),
        text(36,626,'Service 描述稳定入口与选择关系；它不是额外业务进程。HTTP 不会穿过 EndpointSlice。',19,'#617187')]
    svg('flow',658,'先走通一条正常请求，再改变健康与版本','上方是创建与探测关系，下方实线只表示真实请求与响应的数据路径。',
        {'client':o['client'],'normal':o['cases']['normal_v1']},digest,pieces)
    labels = [('normal_v1','正常 v1','2 / 2','v1，两个 UID'),('readiness_failed','仅 readiness 失败','1 / 2','v1，仅另一 UID'),
        ('readiness_recovered','readiness 恢复','2 / 2','v1，原两个 UID'),('liveness_restarted','单独 liveness 失败后','2 / 2','v1，进程实例改变'),
        ('rolled_v2','模板发布 v2','2 / 2','v2，新 Pod UID'),('undo_v1','undo 回退初始模板','2 / 2','v1，再核对新 UID')]
    pieces = []
    columns = [(36,340,'受控变化'),(392,250,'Ready / 后端'),(658,426,'实际 Service HTTP 样本')]
    for x,w,label in columns:
        pieces += [box(x,121,w,50,'#e7edf8'),text(x+16,155,label,21,weight=700)]
    for i,(case,label,count,result) in enumerate(labels):
        y=184+i*69
        for x,w,_ in columns:
            pieces.append(box(x,y,w,57,'#fff1e8' if case=='readiness_failed' else '#eaf4ed'))
        pieces += [text(52,y+37,label,20),text(408,y+37,count,21),text(674,y+37,result,20)]
    victim=o['readiness']['pod_uid']
    before=next(p for p in normal['pods'] if p['uid']==victim)
    restarted=next(p for p in o['cases']['liveness_restarted']['api_after']['pods'] if p['uid']==victim)
    pieces += [text(36,640,'readiness 失败：/ready 503，/live 200，/work 200；restartCount 保持 '+str(before['restart_count']),20),
        text(36,680,'liveness 单独失败：/live 503 → 同一 Pod UID 容器重启，restartCount '+str(before['restart_count'])+' → '+str(restarted['restart_count']),20),
        text(36,720,'每行是 API 收敛后连续 20 条新连接样本；传播期间的完整请求另保留，未承诺零失败。',18,'#617187')]
    svg('changes',752,'信号、对象状态与用户结果，三者一起核对','readiness 控制是否接新流量；liveness 控制容器重启；版本要从真实响应读回。',
        {'cases':o['cases'],'readiness':o['readiness'],'liveness':o['liveness'],'rollout':o['rollout']},digest,pieces)


def bridge(validation, source, readme):
    snippets = {
        'objects': '''# 同一个 guide-service 的核心字段；完整对象由实验程序创建
# Deployment.spec.template.spec.containers[0]
env: [{name: APP_VERSION, value: v1}]
readinessProbe:
  httpGet: {path: /ready, port: 8080}
  periodSeconds: 1
  failureThreshold: 1
livenessProbe:
  httpGet: {path: /live, port: 8080}
  periodSeconds: 2
  failureThreshold: 3
# Service.spec：selector 匹配 Pod 标签
selector: {app: guide-service}
ports: [{port: 80, targetPort: 8080}]''',
        'request': '''# 客户端 Pod 内；service_url 固定为本次 ClusterIP 的 /work
request_id = uuid.uuid4().hex
request = urllib.request.Request(service_url,
    headers={'X-Request-ID': request_id, 'Connection': 'close'})
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with opener.open(request, timeout=2) as response:
    body = json.load(response)
    assert response.status == 200
    assert body['request_id'] == request_id
    # 再核对 body['version'] 与 body['pod_uid']''',
        'rollout': '''# 程序的 self.k 始终带本次私有 kubeconfig/context/namespace
self.k('set', 'env', 'deployment/guide-service', 'APP_VERSION=v2')
self.k('rollout', 'status', 'deployment/guide-service', '--timeout=180s')
# 等待 Pod/EndpointSlice 后，再经同一 ClusterIP 读取实际 v2
self.k('rollout', 'undo', 'deployment/guide-service', '--to-revision=1')
self.k('rollout', 'status', 'deployment/guide-service', '--timeout=180s')
# 再等对象并实际读取 v1；不把命令成功当作请求结果'''
    }
    prefix = 'const kubernetesServiceSource = ' + json.dumps(source, ensure_ascii=False) + ';\n'
    prefix += 'const kubernetesServiceReadme = ' + json.dumps(readme, ensure_ascii=False) + ';\n'
    prefix += 'const kubernetesServiceEvidence = ' + json.dumps(validation, ensure_ascii=False, separators=(',', ':')) + ';\n'
    prefix += 'const kubernetesServiceSnippets = ' + json.dumps(snippets, ensure_ascii=False) + ';\n'
    return prefix + r'''/* Recompose only this chapter; preserve every old h2 and its complete source bytes. */
(function(){
 const a=articles.find(item=>item.id==='cloud-service-lab');
 if(!a)throw Error('Service bridge requires the existing service chapter');
 const e=kubernetesServiceEvidence,o=e.execution.observation;
 const old=a.sections.map(s=>[s[0],s[1]]);
 const titles=['实验分为已执行本地部分与待验集群部分','先运行，再解释输出','把本地信号交给Kubernetes','观察版本，再回退版本','读源码，把结果连接到机制'];
 if(JSON.stringify(old.map(s=>s[0]))!==JSON.stringify(titles))throw Error('Preserved service h2 sequence changed');
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const p=(...x)=>x.map(t=>'<p>'+t+'</p>').join('');
 const code=(label,lang,value)=>'<div class="code-block"><div class="code-toolbar"><span>'+esc(label)+'</span><button type="button" data-copy-code>复制代码</button></div><pre tabindex="0"><code class="language-'+lang+'">'+esc(value)+'</code></pre></div>';
 const figureSizes={flow:[1120,658],changes:[1120,752]};
 const fig=(name,alt,caption)=>{
  const url='diagrams/kubernetes-service-'+name+'.svg',[width,height]=figureSizes[name];
  return '<figure class="training-figure"><a class="figure-link" href="'+url+'" target="_blank" rel="noopener" aria-label="放大：'+esc(alt)+'"><img src="'+url+'" width="'+width+'" height="'+height+'" alt="'+esc(alt)+'" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>'+caption+'<a href="'+url+'" download>下载 SVG ↗</a></figcaption></figure>';
 };
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const legacy=i=>'<details class="full-code service-legacy"><summary>历史来源：'+(i<2?'原有本地机制实验':'原有目标集群手册与源码')+'（保留原文）</summary>'+p('以下是本次原生实验之前的材料，其中“本轮未执行 / 待验证”描述旧手册当时的状态。旧本地结果仍属于 infra_lab.py；本次记录属于独立的 service_lab.py 双副本与持续客户端夹具，两者分别验收。')+old[i][1]+'</details>';
 const normal=o.cases.normal_v1,failed=o.cases.readiness_failed,recovered=o.cases.readiness_recovered;
 const victim=o.readiness.pod_uid;
 const phaseLabels={normal_v1:'正常 v1',readiness_failed:'readiness 失败',readiness_recovered:'readiness 恢复',liveness_restarted:'liveness 重启后',rolled_v2:'发布 v2',undo_v1:'undo 回 v1'};
 const phaseRows=Object.keys(phaseLabels).map(name=>{const rows=o.requests.filter(r=>r.phase===name);return [phaseLabels[name],String(rows.length),String(rows.filter(r=>r.status!==200).length),'20 条均 200'];});
 const count=s=>s.api_after.pods.find(p=>p.uid===victim).restart_count;
 const bodies=[
 '<div class="mechanism-core" id="kubernetes-service-normal"><h3>从一条正常请求认识四个对象</h3>'+p(
 '先部署一个运行两个副本的服务。客户端请求固定入口，转发组件在就绪副本中选择后端，应用返回它真正运行的版本。先把这条正常请求走通，再分别改变健康信号和版本，继续用同一入口核对用户实际收到什么。',
 'Deployment 声明“运行两个副本”，控制器据此创建 Pod；Pod 是容器运行的单位，每个对象都有独立 UID。Service 用标签选择这一组 Pod，提供稳定的集群内 IP（ClusterIP）。EndpointSlice 保存后端地址和就绪条件，转发组件观察这些对象、更新转发规则。节点代理 kubelet 按探针检查应用，再更新就绪或推进容器重启。Service 不是额外业务进程，EndpointSlice 也不承载 HTTP 请求。')+
 fig('flow','Deployment维护两个v1 Pod；客户端新请求经Service ClusterIP到就绪后端，返回请求ID、版本与Pod UID','同一个 /work 输入贯穿图、代码和六个阶段；虚线是控制关系，实线是普通客户端的 HTTP 数据路径。')+
 p('正常路径中，两个业务 Pod 都是 Ready，端点 ready=true；持续客户端确实从同一个 ClusterIP 收到两个 UID 的 v1 响应。接下来分别观察“是否接新流量”“是否重启”和“运行哪个版本”，三个问题使用不同证据。')+'</div>'+legacy(0),
 '<div class="mechanism-core" id="kubernetes-service-objects"><h3>先给健康信号各自的职责</h3>'+p(
 '应用提供 /ready、/live 和 /work；节点上的 kubelet 按配置周期请求前两个接口。readiness 回答“现在是否适合接新工作”：失败会影响 Pod Ready 和端点就绪。liveness 回答“是否需要靠重启恢复”：连续失败达到阈值后，kubelet 重启相应容器。Running 只说明生命周期阶段，不能替代这两种判断。',
 '下面的字段属于同一份双副本夹具。Service 的 80 端口转到应用 8080；selector 与 Pod 标签 app=guide-service 对应。探针直接检查 Pod 应用；客户端仍请求 Service，不把探针请求当作业务流量。')+
 code('对象核心字段 · 完整可运行对象见本节源码','yaml',kubernetesServiceSnippets.objects)+
 p('当 /ready 失败而 /live、/work 仍成功时，应用进程仍有处理能力，但不再适合接新工作。探针只提供信号；是否减少新流量，要继续看平台如何更新端点和转发规则。下面以同一个 /work 请求验证这条因果链。')+'</div>'+legacy(1),
 '<div class="mechanism-core" id="kubernetes-service-probes"><h3>应用能响应，不等于 Service 仍会选择它</h3>'+p(
 '独立客户端 Pod 持续向 '+esc(o.client.service_url)+' 发请求。每次使用新连接和唯一请求 ID，响应回显这个 ID、实际 APP_VERSION 与 Pod UID。管理端另读 API；因此“应用返回了什么”和“平台把谁标为就绪”可以相互核对。')+
 code('同一正常请求的核心 API · 在客户端 Pod 内执行','python',kubernetesServiceSnippets.request)+p(
 '只在一个业务容器创建 /tmp/not-ready 后，该 Pod 的 /ready=503，/live=200、/work=200。API 观察到 Pod Ready=false、对应 EndpointSlice ready=false；其地址仍可留在对象中。对象收敛后，连续 20 条 Service 响应只来自另一 Pod，两个 Pod 的重启次数均未增加。删除标记后，同一 UID 恢复就绪，响应再次覆盖两个后端。',
 '再单独让 /live 失败，/ready 此时仍为 200。达到本例阈值后，同一 Pod UID 的容器重启一次，restartCount 从 '+esc(count(normal))+' 变为 '+esc(count(o.cases.liveness_restarted))+'，响应中的进程实例 ID 也改变。readiness 失败期间没有重启，liveness 失败后发生重启，两条因果路径由不同注入与实测区分。')+
 fig('changes','六个阶段分别核对Ready后端与实际Service版本；readiness失败不重启，liveness单独失败重启，v2发布后undo回v1','每阶段保存 API 快照与连续 20 条实际新连接样本；完整持续序列包含传播期间请求。')+
 table(['客户端阶段标签','完整序列请求数','非 200 / 传输失败','选取的稳定窗口'],phaseRows)+p('阶段标签在 API 收敛后切换，因此完整阶段也会包含随后故障注入与传播中的请求；右列是其中满足条件的一段，不能代表全程零错误、负载均衡公平或服务 SLO。')+
 '<details><summary>按需：采样窗口、传播与终止边界</summary>'+p(
 '程序等待对象状态，再切换客户端阶段标记，直到最后连续 20 条成功、实际 UID 集合与 ready 后端集合一致；采样前后各读一次 API。达到条件前的请求仍在原始记录中。稳定窗口不能证明传播期间零失败，也不能保证未来所有请求；端点状态与数据平面之间仍有异步传播。',
 '本例关闭连接复用，只检查受控新请求。长连接、在途请求、preStop 排空和云负载均衡的健康检查需要独立实验；不从几秒固定等待推断它们已完成。Pod 内 loopback 诊断只用来核对三个应用接口，不计入 Service 业务样本。')+'</details></div>'+legacy(2),
 '<div class="mechanism-core" id="kubernetes-service-rollout"><h3>模板变化、Pod 变化与用户版本是三个时刻</h3>'+p(
 'APP_VERSION 位于 Deployment 的 Pod 模板中。将它从 v1 改为 v2，会触发控制器创建新版本副本；本例 maxUnavailable=0、maxSurge=1，允许先增加一份，再逐步替换。等待 rollout 完成后，还要检查新 Pod 的 Ready、端点 UID 和实际 HTTP 版本。Service 的 UID 与 ClusterIP 在整个发布中保持相同。')+
 code('发布与回退核心 API · 使用本次私有管理上下文','python',kubernetesServiceSnippets.rollout)+
 table(['阶段','同一 Service 的实际响应','继续核对'],[['初始版本','20 / 20 返回 v1','响应覆盖两个初始 Pod UID'],['发布新模板','20 / 20 返回 v2','响应 UID 属于新模板 Pod'],['undo 初始模板','20 / 20 再次返回 v1','Ready、端点与回退后 Pod UID 一致']])+p(
 'rollout undo 回退的是历史 Pod 模板。这里版本来自模板环境变量，因此回退后真实读到 v1；如果模板引用的同名 ConfigMap 内容或数据库结构另有变化，它们不会随这条命令自动恢复。先识别版本来自哪里，再决定需要恢复哪些外部状态。')+'</div>'+legacy(3),
 '<div class="mechanism-core" id="kubernetes-service-run"><h3>自己运行，并用业务结果验收</h3>'+p(
 '先预测：只让 /ready 失败，Pod UID、restartCount、端点条件与客户端 UID 分别会怎样变化？再预测只让 /live 失败和回退模板的结果。下载完整程序，在 Linux、本机 Docker、kind v0.33.0、kubectl v1.35.8 与 Python 3.9+ 环境运行：')+
 code('运行独立原生实验；第二条仅离线复核记录','sh','python3 -B service_lab.py --output service-record.json\npython3 -B service_lab.py --check-record service-record.json')+p(
 '验收依次核对请求 ID、版本、Pod UID，以及独立读取的 Ready、EndpointSlice 和重启次数；任意一项失配都不能用命令成功替代。实验创建随机命名的专有 kind 集群，显式使用自己的 kubeconfig/context，退出时只删除该集群。',
 '本次记录来自单 Linux 宿主的 kind，验证原生探针、真实 ClusterIP 数据路径与模板恢复。它不代表生产云网络、多故障域可用性、容量或长连接排空。原有本地实验继续解释应用、文件与指标机制，不替代本次 Kubernetes 对象与业务结果。')+
 '<details class="full-code"><summary>运行方法、实际来源、完整源码与离线验收记录</summary>'+p(
 '原生记录来源：<a href="'+esc(e.origin.run_url)+'" target="_blank" rel="noopener">隔离 Linux CI 运行</a>；Kubernetes '+esc(e.execution.versions.kubernetes)+'。记录绑定冻结源码摘要，并确认自有集群清理完成。下载源码后修改任何行为，都应重新运行并产生新记录。')+
 code('service_lab.py · 完整源码','python',kubernetesServiceSource)+
 '<details class="full-code"><summary>完整 README：观察顺序、安全隔离、官方语义与范围</summary>'+code('README.md','markdown',kubernetesServiceReadme)+'</details>'+
 '<p class="practice-links"><a href="labs/kubernetes-service.zip" download>下载完整实验包 ↓</a><a href="labs/kubernetes-service/service_lab.py" download>下载完整源码 ↓</a><a href="labs/kubernetes-service/README.md" download>下载运行手册 ↓</a><a href="labs/kubernetes-service/validation.json" target="_blank" rel="noopener">查看实际记录与来源 ↗</a></p></details></div>'+legacy(4)
 ];
 a.sections=old.map((s,i)=>[s[0],bodies[i]]);
 a.desc='沿正常请求认识 Deployment、Pod、Service 与探针，再实际验证摘新流量、容器重启和 v1 → v2 → v1。';
 a.prereq='先了解容器与 HTTP；本地实验需 Python，原生实战需 Linux、本机 Docker、固定版本 kind/kubectl。';
 a.objectives=['对象：走通同一 Service 的正常请求','健康：区分是否接流量与是否重启','交付：从真实响应验收发布和回退'];
 Object.assign(sources,{
  kubernetesServiceNative:['Kubernetes · Service 与 ClusterIP','https://kubernetes.io/docs/concepts/services-networking/service/'],
  kubernetesServiceProbes:['Kubernetes · readiness 与 liveness','https://kubernetes.io/docs/concepts/workloads/pods/probes/'],
  kubernetesServiceEndpoints:['Kubernetes · EndpointSlice 条件','https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/'],
  kubernetesServiceRollout:['Kubernetes · Deployment 模板与回退','https://kubernetes.io/docs/concepts/workloads/controllers/deployment/']
 });
 a.refs=[...new Set([...a.refs,'kubernetesServiceNative','kubernetesServiceProbes','kubernetesServiceEndpoints','kubernetesServiceRollout'])];
 a.updated='2026.11.08';
})();
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
    assert record['source_sha256']['service_lab.py'] == sha(LAB / 'service_lab.py')
    program = runpy.run_path(str(LAB / 'service_lab.py'))
    program['verify'](record['observation'])
    assert record['node_image'] == program['NODE_IMAGE'] and record['python_image'] == program['PYTHON_IMAGE']
    assert record['versions']['kubernetes'] == record['versions']['kubectl'] == 'v1.35.8'
    validation = {'checked_on': '2026-11-08', 'status': 'passed',
        'source_sha256': {name: sha(LAB / name) for name in ('service_lab.py', 'README.md')},
        'origin': {'kind': 'isolated Linux Docker in GitHub Actions', 'run_url': args.run_url,
                   'source_commit': args.source_commit}, 'execution': record}
    (LAB / 'validation.json').write_text(dump(validation))
    (ROOT / 'dist/kubernetes-service-bridge.js').write_text(bridge(validation, (LAB / 'service_lab.py').read_text(), (LAB / 'README.md').read_text()))
    figures(record)
    # Fixed ordering, timestamps and permissions make identical inputs produce identical bytes.
    with zipfile.ZipFile(LAB.with_suffix('.zip'), 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in ('README.md', 'service_lab.py', 'validation.json'):
            info = zipfile.ZipInfo('kubernetes-service/' + name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, (LAB / name).read_bytes(), compresslevel=9)
    print('PASS: actual Service record bound to preserved five sections, complete sources, two SVGs and deterministic ZIP.')


if __name__ == '__main__':
    main()
