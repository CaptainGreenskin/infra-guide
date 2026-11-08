"""Run the actual SDK program, verify release sources, bind lesson and diagrams.

Use the isolated ../langgraph-workflow-env/bin/python interpreter. This builder
only owns langgraph-workflow assets; the parent integrates the page shell.
"""
import hashlib
import html
import importlib.metadata
import inspect
import io
import json
import subprocess
import sys
import tarfile
import textwrap
import urllib.request
import zipfile
from pathlib import Path

import langgraph.channels.binop
import langgraph.checkpoint.sqlite
import langgraph.graph.state
import langgraph.types

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "dist/labs/langgraph-workflow"
DIAGRAMS = ROOT / "dist/diagrams"


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify_release(distribution, version, modules):
    assert importlib.metadata.version(distribution) == version
    url = f"https://pypi.org/pypi/{distribution}/{version}/json"
    with urllib.request.urlopen(url, timeout=30) as response:
        metadata = json.load(response)
    release = next(row for row in metadata["urls"] if row["packagetype"] == "sdist")
    with urllib.request.urlopen(release["url"], timeout=30) as response:
        archive = response.read()
    assert sha(archive) == release["digests"]["sha256"]
    files = []
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        for relative, module in modules:
            member = next(row for row in tar.getmembers() if row.name.endswith("/" + relative))
            remote = tar.extractfile(member).read()
            installed = Path(inspect.getsourcefile(module)).read_bytes()
            assert remote == installed, (distribution, relative, "installed source differs from official sdist")
            files.append({"path": relative, "sha256": sha(installed), "matches_release": True})
    return {"distribution": distribution, "version": version, "metadata": url,
            "source_archive": release["url"], "source_archive_sha256": sha(archive), "files": files}


result = json.loads(subprocess.check_output([sys.executable, "-B", str(LAB / "workflow_lab.py")], text=True, timeout=120))
assert result["status"] == "passed"
sources = ["workflow_lab.py", "orders.json", "requirements.txt", "README.md"]
official = [verify_release("langgraph", "1.2.20", [
    ("langgraph/types.py", langgraph.types),
    ("langgraph/graph/state.py", langgraph.graph.state),
    ("langgraph/channels/binop.py", langgraph.channels.binop)]),
    verify_release("langgraph-checkpoint-sqlite", "3.1.3", [
        ("langgraph/checkpoint/sqlite/__init__.py", langgraph.checkpoint.sqlite)])]
record = {"schema": "langgraph-workflow-validation-v1", "verified_on": "2026-11-08",
          "command": "python -B workflow_lab.py", "source_sha256": {name: sha((LAB / name).read_bytes()) for name in sources},
          "official_source_verification": official, "program": result}
(LAB / "validation.json").write_text(dump(record))
source = (LAB / "workflow_lab.py").read_text()
requirements = (LAB / "requirements.txt").read_text()
stable = result["cases"]["stable"]
bad = result["cases"]["new_id_on_reentry"]
parallel = result["cases"]["parallel_failure"]
assert stable["oracle"]["expected_total"] == 42
assert stable["counts"]["approval_publish"] == bad["counts"]["approval_publish"] == 2


def svg(name, title, description, height, metadata, body):
    content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 {height}" role="img" aria-labelledby="title desc">
<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(description)}</desc>
<metadata>{html.escape(json.dumps(metadata, ensure_ascii=False))}</metadata>
<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#526987" stroke-width="1.5"/></marker></defs>
<style>text{{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;fill:#23354d;font-size:18px}}.title{{font-size:25px;font-weight:700}}.label{{font-size:18px;font-weight:650}}.small{{font-size:16px}}.muted{{fill:#5c6d82}}.box{{fill:#fff;stroke:#bdcde0;stroke-width:1.5}}.good{{fill:#ecf7f2;stroke:#80bca6;stroke-width:1.5}}.wait{{fill:#fff6e5;stroke:#d9b45d;stroke-width:1.5}}.bad{{fill:#fff0f0;stroke:#dba5a5;stroke-width:1.5}}.line{{stroke:#526987;stroke-width:2;fill:none;marker-end:url(#arrow)}}.persist{{stroke:#8a70b5;stroke-width:2;fill:none;stroke-dasharray:7 5;marker-end:url(#arrow)}}</style>
<rect width="1080" height="{height}" rx="16" fill="#f8fafd"/>{body}</svg>\n'''
    (DIAGRAMS / (name + ".svg")).write_text(content)


svg("langgraph-workflow-graph", "42报告怎样暂停，再由新进程继续", "图状态已有42草稿，审批节点暂存后interrupt。文件检查点保留等待，旧进程退出；新进程打开同一文件、传同一thread_id和Command批准，从审批节点开头重入，稳定操作去重后发布。", 440,
    {"expected_total": stable["oracle"]["expected_total"], "counts": stable["counts"],
     "parallel_overlap_proven": stable["parallel_overlap_proven"], "source_sha256": record["source_sha256"]}, '''
<text x="32" y="43" class="title">状态留下来，进程可以退出</text>
<rect x="32" y="74" width="280" height="112" rx="10" class="box"/><text x="51" y="106" class="label">state：42草稿</text><text x="51" y="138">基础37＋补录5</text><text x="51" y="168" class="small muted">来源与稳定操作身份已保存</text>
<path d="M319 130H368" class="line"/>
<rect x="386" y="74" width="302" height="112" rx="10" class="wait"/><text x="405" y="106" class="label">node：approval_publish</text><text x="405" y="138">暂存 → interrupt 等批准</text><text x="405" y="168" class="small muted">暂存已提交；还没有发布报告</text>
<path d="M695 130H744" class="persist"/>
<rect x="762" y="74" width="286" height="112" rx="10" class="box"/><text x="781" y="106" class="label">文件检查点</text><text x="781" y="138">state＋待决中断</text><text x="781" y="168" class="small muted">thread_id = report-A</text>
<path d="M905 194V235H174V263" class="persist"/>
<text x="361" y="224" class="small muted">旧进程退出；新进程打开同一文件、同一thread</text>
<rect x="32" y="278" width="280" height="112" rx="10" class="box"/><text x="51" y="310" class="label">Command(resume=批准)</text><text x="51" y="342">绑定42草稿摘要</text><text x="51" y="372" class="small muted">输入交给原来的interrupt</text>
<path d="M319 334H368" class="line"/>
<rect x="386" y="278" width="302" height="112" rx="10" class="wait"/><text x="405" y="310" class="label">从审批节点开头重入</text><text x="405" y="342">再次暂存 → 原回执</text><text x="405" y="372" class="small muted">2次尝试，暂存效果仍1份</text>
<path d="M695 334H744" class="line"/>
<rect x="762" y="278" width="286" height="112" rx="10" class="good"/><text x="781" y="310" class="label">发布42报告</text><text x="781" y="342">匹配批准后才执行</text><text x="781" y="372" class="small muted">接收方在独立事务内提交</text>
<text x="32" y="424" class="small muted">实线：执行推进。虚线：检查点与恢复。实测数量来自同一正常场景。</text>''')

svg("langgraph-workflow-reentry", "恢复会重入节点，两次尝试怎样只暂存一份", "暂停前暂存已经在HTTP接收方提交，节点局部回执尚未成为状态更新。新进程恢复后从节点开头再次暂存，稳定操作返回duplicate；新UUID负例产生两份暂存并被独立验收拒绝。", 610,
    {"stable_oracle": stable["oracle"], "bad_oracle": bad["oracle"],
     "stable_attempts": stable["receiver"]["attempts"], "parallel_counts": parallel["counts"]}, '''
<text x="32" y="43" class="title">检查点保存了等待，外部暂存已经单独提交</text>
<rect x="32" y="76" width="477" height="174" rx="10" class="wait"/><text x="53" y="108" class="label">进程1：第一次进入 approval_publish</text><text x="53" y="144">stage(report-A:stage, 草稿42)</text><text x="53" y="176">接收方提交暂存效果1份，返回回执</text><text x="53" y="207">interrupt：保存等待；此进程正常退出</text><text x="53" y="235" class="small muted">局部stage_receipt尚未作为节点更新返回</text>
<path d="M516 163H551" class="line"/>
<rect x="568" y="76" width="480" height="174" rx="10" class="good"/><text x="589" y="108" class="label">进程2：同thread，Command(resume=批准)</text><text x="589" y="144">从节点开头再次调用stage</text><text x="589" y="176">原操作同参数 → duplicate，效果仍1份</text><text x="589" y="207">interrupt返回批准 → 发布42报告</text><text x="589" y="235" class="small muted">最终：暂存HTTP尝试2次，发布1次</text>
<rect x="32" y="287" width="1016" height="113" rx="10" class="bad"/><text x="53" y="321" class="label">故意换新UUID：两次节点进入，产生两份不同的逻辑暂存</text><text x="53" y="354">框架照样结束，报告总数照样42；独立验收检查暂存数，明确拒绝。</text><text x="53" y="383" class="small muted">业务操作身份须在可恢复状态中提前固定；只保存检查点不足以保护任意外部效果。</text>
<rect x="32" y="435" width="1016" height="116" rx="10" class="box"/><text x="53" y="469" class="label">并行失败的恢复粒度又不同</text><text x="53" y="502">来源检查失败后，新进程invoke(None)：金额检查总计1次，来源检查总计2次。</text><text x="53" y="532" class="small muted">已成功分支的pending writes保留；它不改变中断节点会重入的规则。</text>
<text x="32" y="589" class="small muted">这些数量来自同一实测record；没有执行跨机断电、真实审批身份或Kairo。</text>''')


def excerpt(start, end):
    return textwrap.dedent(source[source.index(start):source.index(end, source.index(start))]).rstrip()


parallel_code = 'checks: Annotated[list[str], operator.add]\n\n' + excerpt('    builder.add_edge("draft", "check_total")', '    builder.add_edge("approval_publish", END)')
reentry_code = excerpt('        stage_op = str(uuid.uuid4())', '\n    builder = StateGraph')
persistence_code = '\n'.join([
    'config = {"configurable": {"thread_id": thread_id}}',
    'with SqliteSaver.from_conn_string(str(folder / "checkpoints.sqlite")) as saver:',
    '    graph = build_graph(folder, saver, action == "start")',
    '    # 首次执行的分支：',
    '    graph.invoke(initial, config, durability="sync")',
    '    # 新进程在resume分支取得中断payload后执行：',
    '    graph.invoke(Command(resume={"approved": True, "draft_digest": payloads[0]["draft_digest"]}),',
    '                 config, durability="sync")'])
for line in persistence_code.splitlines():
    if line.strip() and not line.strip().startswith('#'):
        assert line.strip() in source

template = r'''/* Source-bound real LangGraph lesson. Generated by scripts/build-langgraph-workflow.py. */
const langgraphWorkflowSource = __SOURCE__;
const langgraphWorkflowEvidence = __EVIDENCE__;
const langgraphWorkflowBridgeReview = {article:'durable-workflows',sections:[7,8],new_pre:6,new_default_pre:1,new_h3:4,figures:2};
{
 const a=articleById('durable-workflows');
 const fig=(name,height,caption)=>'<figure class="training-figure"><a href="diagrams/'+name+'.svg" target="_blank" rel="noopener" aria-label="放大：'+trainingEscape(caption)+'"><img src="diagrams/'+name+'.svg" width="1080" height="'+height+'" alt="'+trainingEscape(caption)+'" loading="lazy"><span class="figure-zoom-hint">点击图示放大 ↗</span></a><figcaption>'+caption+'<a href="diagrams/'+name+'.svg" download>下载 SVG ↗</a></figcaption></figure>';
 a.sections[7][1]+=
 '<h3 id="langgraph-workflow-objects">LangGraph把等待保存在哪里</h3>'+
 para('沿用基础37加补录5的报告。LangGraph把有状态程序组织成图：state保存本次任务的数据；node是接收状态、返回更新的函数；edge规定节点之间的推进条件。本例读完两份来源、起草42并完成检查后，进入approval_publish节点。',
 'SqliteSaver是checkpointer，把图状态与待决任务写进文件。thread_id定位这一条执行；新进程打开同一文件、使用同一ID，才能找到原进度。节点调用interrupt，留下含任务、42和草稿摘要的中断对象，然后暂停。旧进程退出后，新进程用Command(resume=批准)恢复；批准值成为interrupt的返回值，核对匹配后才发布报告。')+
 code('worker的API节选 · 省略变量准备和分支；两次invoke分属不同进程','PYTHON',__PERSISTENCE__)+
 para('恢复会从审批节点开头重入。因此暂存API被调用两次；已经保存的稳定操作身份让独立接收方返回原回执，暂存效果仍1份。框架检查点和接收方事务分别提交。先顺着图复述“保存等待→进程退出→同ID恢复→获批发布”，再展开并行与反例。')+
 fig('langgraph-workflow-graph',440,'同一份42草稿：文件保留等待，新进程沿同一thread恢复。')+
 '<details class="full-code"><summary>展开：真实并行、reducer与失败分支恢复</summary>'+
 '<h3 id="langgraph-workflow-wait">两项检查怎样并行，再汇合</h3>'+
 para('基础读取先得到orders-A/v3的[10,27]以及补录引用，再沿引用实际读取late-A/v1的[5]。起草后，金额和来源检查可以独立执行：前者返回["total"]，后者返回["sources"]。reducer是字段的更新合并函数；checks用operator.add连接两份新增列表。分支只返回自己的新增项，不能把已有整份列表重复返回。')+
 code('实际字段与连边节选 · 省略其余字段和节点注册','PYTHON',__PARALLEL__)+
 para('add_edge的起点列表要求两路都完成，才进入审批节点。程序让两个真实执行器线程在同步点会合，记录两路均已进入后才有任一结束，核对并行确实发生；合并后排序检查两项齐备，不依赖完成顺序。',
 'check_sources第一次主动抛异常后，check_total已经成功的更新作为pending writes保留。新进程invoke(None)继续未完成工作，实测金额检查1次、来源检查2次，最终两项各合并1份。显式并行异常恢复与interrupt节点从头重入采用不同粒度。')+
 '<p><a href="https://docs.langchain.com/oss/python/langgraph/checkpointers" target="_blank" rel="noopener">官方检查点与pending writes说明 ↗</a> · <a href="https://github.com/langchain-ai/langgraph/blob/1.2.20/libs/langgraph/langgraph/graph/state.py#L928" target="_blank" rel="noopener">固定版本的汇合边源码 ↗</a></p></details>'+
 '<details class="full-code"><summary>展开：节点重入的副作用反例与稳定操作去重</summary>'+
 '<h3 id="langgraph-workflow-reentry">为什么图已完成，仍可能多暂存一份</h3>'+
 para('审批节点先向独立HTTP接收方暂存草稿，这是委托允许的准备动作；发布必须等匹配批准。第一次走到interrupt时，接收方已提交暂存，但局部stage_receipt尚未作为节点更新返回。恢复重入后会再次调用暂存，不能用“图状态没有回执”推断外部没有效果。',
 '正确分支使用初始输入里已固定的stage_op=report-A:stage。接收方将操作身份、请求摘要与效果放进自己的SQLite事务，同身份同内容返回duplicate；同身份换内容返回冲突。unsafe故意每次新建UUID，因此接收方各提交一份。框架仍能结束、报告仍为42，独立验收却因暂存2份而拒绝。')+
 code('approval_publish的实际节选 · 省略进入计数与前置检查','PYTHON',__REENTRY__)+
 fig('langgraph-workflow-reentry',610,'正常分支两次暂存尝试、1份效果；新UUID负例产生2份，独立验收拒绝。')+
 para('durability="sync"让框架在下一步前写自己的检查点，不把检查点库与HTTP接收方变成同一事务。稳定操作身份必须在可恢复状态中提前固定，接收方也必须实施去重；检查点不能让任意外部副作用天然只执行一次。thread_id定位执行状态，不提供认证、业务去重或跨任务长期记忆。')+
 '<p><a href="https://github.com/langchain-ai/langgraph/blob/1.2.20/libs/langgraph/langgraph/types.py#L913" target="_blank" rel="noopener">固定1.2.20的interrupt源码与节点重入规则 ↗</a></p></details>';
 a.sections[8][1]+=
 '<h3 id="langgraph-workflow-run">实战：运行真实LangGraph，核对42报告</h3>'+
 para('固定节点驱动官方SDK，无模型或密钥。展开运行说明，先预测等待时的报告数，以及新进程恢复后的暂存次数。')+
 '<p><a class="inline-link" href="labs/langgraph-workflow.zip" download>下载完整实验包 →</a> · <a href="labs/langgraph-workflow/README.md">分步说明</a> · <a href="labs/langgraph-workflow/validation.json">实际记录与源码摘要</a></p>'+
 '<details class="full-code"><summary>展开：安装运行、实际结果与独立验收</summary>'+
 para('使用langgraph 1.2.20、langgraph-checkpoint-sqlite 3.1.3，传递依赖精确固定。需要Python 3.10+，作者运行3.12.13。安装需联网；实验只访问自己启动的回环HTTP接收方，不使用LangSmith或Kairo接口。')+
 code('完整解压ZIP，在包含workflow_lab.py的目录执行','SHELL',`python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -B workflow_lab.py > result.json
# 可选：保留数据库，runs必须尚不存在
.venv/bin/python -B workflow_lab.py --output-dir runs > retained-result.json`)+
 table(['场景','实际结果','独立业务判定'],[
  ['stable：暂停后新进程恢复','读取、补录、草稿各1次；审批节点2次；暂存尝试2次、效果1份；批准后发布1份42报告','重读来源与接收方，内容、来源、目标和数量均匹配'],
  ['new_id_on_reentry：节点内新UUID','框架完成、报告42，暂存却2份','拒绝one_staged_draft，保留错误效果'],
  ['parallel_failure：来源检查先失败','金额检查1次；来源检查2次；新进程补失败分支后等待批准','两项各合并1份，最终42通过'],
  ['改变thread_id / 完成后再恢复','另一ID查询为空；完成图invoke(None)不增加节点或业务记录','区分新执行与原任务恢复'],
  ['同发布操作改为41','HTTP409，原报告42保持','原回执不能改换意图'],
  ['corrupt_report：只篡改实际报告','复制正常接收方数据库，将报告42改41','拒绝report_matches_source']
 ])+
 para('先读ReportState与build_graph，再读worker中的文件、ID和Command，最后看case怎样结束一个进程再启动下一个。independent_oracle重读原始来源JSON与接收方数据库，不相信图的next、checks或自报回执。status=passed表示正例符合契约、指定负例被检测。',
 'validation.json绑定四份源码、输入、依赖和说明的SHA256，保存实际环境与完整输出；同时核对固定版本官方PyPI源码发行包与已安装源码逐字一致。PID、线程号、中断ID与负例UUID会变化，复现核对状态与数量。默认清理临时目录；保留模式拒绝覆盖已有目录，所有自己启动的worker与接收方均被wait回收。',
 '已验证单宿主文件检查点、正常进程退出后的等待恢复、真实并行和显式异常恢复。真实审批身份、撤权、跨机故障、任意远端工具事务、模型规划与Kairo适配未在本实验执行。')+'</details>'+
 '<details class="full-code"><summary>完整workflow_lab.py · 与下载源码逐字一致</summary>'+trainingCode('workflow_lab.py','PYTHON',langgraphWorkflowSource)+'</details>'+
 '<details class="full-code"><summary>精确固定的官方包与传递依赖</summary>'+trainingCode('requirements.txt','TEXT',__REQUIREMENTS__)+'</details>';
}
'''
replacements = {"__SOURCE__": source, "__EVIDENCE__": record,
                "__PARALLEL__": parallel_code, "__PERSISTENCE__": persistence_code,
                "__REENTRY__": reentry_code, "__REQUIREMENTS__": requirements}
for key, value in replacements.items():
    template = template.replace(key, json.dumps(value, ensure_ascii=False))
(ROOT / "dist/langgraph-workflow-bridge.js").write_text(template)
with zipfile.ZipFile(ROOT / "dist/labs/langgraph-workflow.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in sources + ["validation.json"]:
        info = zipfile.ZipInfo(name, (2026, 11, 8, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (LAB / name).read_bytes())
print("PASS: real LangGraph suite; official release sources matched; 2 diagrams, 4 h3, 6 pre, source-bound record and ZIP generated.")
