"""Run the local program, bind source/record, then generate authored content.

Dedicated to agent-planning; it does not edit the shared page shell or catalog.
"""
import hashlib
import html
import json
import platform
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "dist/labs/agent-planning"
DIAGRAMS = ROOT / "dist/diagrams"


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def svg(name, title, description, height, metadata, body):
    content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 {height}" role="img" aria-labelledby="title desc">
<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(description)}</desc>
<metadata>{html.escape(json.dumps(metadata, ensure_ascii=False))}</metadata>
<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#526987" stroke-width="1.4"/></marker></defs>
<style>text{{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;fill:#23354d;font-size:18px}}.title{{font-size:25px;font-weight:700}}.small{{font-size:16px}}.label{{font-size:17px;font-weight:650}}.blue{{fill:#315dce}}.muted{{fill:#5c6d82}}.line{{stroke:#526987;stroke-width:2;fill:none;marker-end:url(#arrow)}}.box{{fill:#fff;stroke:#bdcde0;stroke-width:1.4}}.good{{fill:#ecf7f2;stroke:#80bca6}}.wait{{fill:#fff6e5;stroke:#d9b45d}}.bad{{fill:#fff0f0;stroke:#dba5a5}}</style>
<rect width="1024" height="{height}" fill="#f8fafd" rx="16"/>{body}</svg>\n'''
    (DIAGRAMS / (name + ".svg")).write_text(content)


result = json.loads(subprocess.check_output([sys.executable, "-B", str(FOLDER / "planning_lab.py")], text=True, timeout=45))
assert result["status"] == "passed"
source = (FOLDER / "planning_lab.py").read_text()
readme = (FOLDER / "README.md").read_text()
record = {
    "schema": "agent-planning-v1", "verified_on": "2026-11-08", "status": "passed",
    "command": "python3 -B planning_lab.py",
    "environment": {"python": platform.python_version(), "sqlite": result["sqlite"]},
    "source_sha256": {name: hashlib.sha256((FOLDER/name).read_bytes()).hexdigest() for name in ["planning_lab.py", "README.md"]},
    "program": result,
}
(FOLDER / "validation.json").write_text(dump(record))
cases = result["cases"]
changed = cases["changed_input"]
old = next(s["body"] for s in changed["done"]["signals"] if s["id"] == "approve-v1")
new = next(s["body"] for s in changed["done"]["signals"] if s["id"] == "approve-v2")

svg("agent-planning-plan-facts", "目标不变，计划可改，已确认事实保留", "同一订单任务从计划1改为计划2；基础读取37保留，补录读取5新增，汇总42依赖两份事实。", 510,
    {"adaptive_revision": 2, "base_values": [10, 27], "extra_values": [5], "total": 42,
     "adaptive_facts": cases["adaptive"]["done"]["facts"]}, '''
<text x="32" y="43" class="title">先固定完成条件，再决定怎样走</text>
<rect x="32" y="65" width="960" height="62" rx="10" class="box"/><text x="52" y="92" class="label">目标：生成 report-A</text><text x="52" y="115" class="small">覆盖清单引用的全部批次；总数与来源可核对；批准后只提交一份报告</text>
<text x="32" y="164" class="label blue">计划 · 将来怎样执行</text>
<rect x="32" y="180" width="405" height="100" rx="10" class="box"/><text x="52" y="209" class="label">计划1</text><text x="52" y="240">读基础 → 汇总 → 发布</text><text x="52" y="265" class="small muted">发现补录引用：原安排不完整</text>
<path d="M445 228H510" class="line"/><text x="457" y="209" class="small">重规划</text>
<rect x="524" y="180" width="468" height="100" rx="10" class="good"/><text x="544" y="209" class="label">计划2</text><text x="544" y="240">读基础 → 读补录 → 汇总 → 发布</text><text x="544" y="265" class="small muted">改变步骤，不改写已经完成的历史</text>
<text x="32" y="325" class="label blue">事实 · 已确认得到什么</text>
<rect x="32" y="342" width="285" height="100" rx="10" class="box"/><text x="50" y="370" class="label">基础 orders-A/v3</text><text x="50" y="398">[10, 27] → 37</text><text x="50" y="425" class="small">输入身份未变，可以复用</text>
<rect x="365" y="342" width="285" height="100" rx="10" class="box"/><text x="383" y="370" class="label">补录 late-A/v1</text><text x="383" y="398">[5] → 5</text><text x="383" y="425" class="small">按清单引用实际读取</text>
<path d="M322 391H354" class="line"/><path d="M657 391H690" class="line"/>
<rect x="704" y="342" width="288" height="100" rx="10" class="good"/><text x="724" y="370" class="label">新汇总事实</text><text x="724" y="398">37 + 5 = 42</text><text x="724" y="425" class="small">同时绑定两个来源及版本</text>
<text x="32" y="480" class="small muted">固定工作流可事先写好补录分支，同样得到42；本例动态版本多一次提议。</text>''')

svg("agent-planning-wait-states", "等待是可恢复的状态，不是悬挂进程", "正常状态、需要重规划、草稿、等待、完成与两个停止分支；先持久化信号，后进入等待也能继续。", 545,
    {"normal_total": 42, "early_signal_events": cases["early_signal"]["done"]["events"],
     "stops": {name: cases[name]["state"]["phase"] for name in ["no_progress", "budget"]}}, '''
<text x="32" y="43" class="title">一项任务，几种含义不同的状态</text>
<g transform="translate(0,30)">
<rect x="32" y="76" width="224" height="80" rx="10" class="box"/><text x="52" y="107" class="label">RUNNING · 执行中</text><text x="52" y="134" class="small">先取可复用事实，再推进</text>
<path d="M263 115H325" class="line"/><text x="269" y="94" class="small">新观察</text>
<rect x="340" y="76" width="275" height="80" rx="10" class="wait"/><text x="359" y="107" class="label">NEEDS_REPLAN</text><text x="359" y="134" class="small">先校验依赖，再接纳新计划</text>
<path d="M475 69V57H145V69" class="line"/><text x="244" y="53" class="small">新计划已持久保存</text>
<path d="M623 115H688" class="line"/><text x="631" y="94" class="small">不再进展</text>
<rect x="705" y="76" width="287" height="80" rx="10" class="bad"/><text x="725" y="107" class="label">STOPPED · 明确停止</text><text x="725" y="134" class="small">重复无进展 / 提议预算耗尽</text>
<path d="M143 162V226" class="line"/><text x="159" y="197" class="small">已汇总42</text>
<rect x="32" y="240" width="270" height="80" rx="10" class="box"/><text x="51" y="271" class="label">DRAFT_READY · 草稿就绪</text><text x="51" y="298" class="small">草稿和摘要已经提交</text>
<path d="M309 280H365" class="line"/>
<rect x="382" y="240" width="290" height="80" rx="10" class="wait"/><text x="402" y="271" class="label">WAITING_APPROVAL</text><text x="402" y="298" class="small">条件写入数据库，进程可退出</text>
<path d="M680 280H735" class="line"/>
<text x="686" y="226" class="small">匹配批准</text>
<rect x="750" y="240" width="242" height="80" rx="10" class="good"/><text x="770" y="271" class="label">DONE · 产物已提交</text><text x="770" y="298" class="small">再次恢复不新增事实或报告</text>
<rect x="178" y="375" width="650" height="92" rx="10" class="box"/><text x="200" y="404" class="label">批准信号先存入 signals</text><text x="200" y="431">绑定任务、目标、计划版本、输入摘要和草稿摘要</text><text x="200" y="455" class="small muted">早于等待到达也能取出；审批变旧时不能推动新草稿</text>
<path d="M528 370V327" class="line"/><text x="32" y="498" class="small muted">图中的新进程恢复已实跑；未模拟崩溃写入、远端提交或框架SDK。</text></g>''')

svg("agent-planning-approval-versions", "批准旧37，不等于批准新42", "输入从orders-A/v3更新至v4，计划1变2。旧批准保留但不适用当前草稿；重复消息确认与当前授权分开。", 480,
    {"old_approval": old, "new_approval": new, "old_duplicate": changed["old_duplicate"], "oracle": changed["oracle"]}, f'''
<text x="32" y="43" class="title">消息已收到，和当前内容已获批准，是两件事</text>
<rect x="32" y="75" width="457" height="238" rx="12" class="box"/>
<text x="54" y="108" class="label">先前的计划1 / 草稿37</text><text x="54" y="143">来源：orders-A/v3，无补录引用</text>
<text x="54" y="177" class="small">输入摘要：{old['input_digest'][:16]}…</text><text x="54" y="207" class="small">草稿摘要：{old['draft_digest'][:16]}…</text>
<text x="54" y="248">approve-v1 已真实入库</text><text x="54" y="284" class="small muted">更新之后仍保留历史，不替换成新批准</text>
<rect x="535" y="75" width="457" height="238" rx="12" class="good"/>
<text x="557" y="108" class="label">当前的计划2 / 草稿42</text><text x="557" y="143">来源：orders-A/v4 + late-A/v1</text>
<text x="557" y="177" class="small">输入摘要：{new['input_digest'][:16]}…</text><text x="557" y="207" class="small">草稿摘要：{new['draft_digest'][:16]}…</text>
<text x="557" y="248">只有匹配新内容的批准可以提交</text><text x="557" y="284" class="small muted">最终实际报告42；独立来源验收通过</text>
<path d="M495 175H522" class="line"/>
<rect x="32" y="343" width="960" height="100" rx="10" class="wait"/>
<text x="54" y="375" class="label">旧消息重发：reason = duplicate_signal，applies_current = false</text>
<text x="54" y="406">“见过这条输入”只确认去重；当前批准还要重新核对版本和摘要。</text>
<text x="32" y="468" class="small muted">摘要来自本次实际产物记录；actor 为本地可信入口夹具，未实现生产身份认证。</text>''')

content = r'''/* Authored planning-to-implementation bridge. Generated by scripts/build-agent-planning.py. */
const agentPlanningSource = __SOURCE__;
const agentPlanningEvidence = __EVIDENCE__;
const agentPlanningBridgeReview = {article:'durable-workflows',sections:[1,2,8,9],new_pre:2,figures:3};
{
 const a=articleById('durable-workflows');
 const old=a.sections.map(s=>s[1]);
 Object.assign(sources,{planningInterrupts:['LangGraph：持久中断与节点恢复规则','https://docs.langchain.com/oss/python/langgraph/interrupts']});
 if(!a.refs.includes('planningInterrupts'))a.refs.push('planningInterrupts');
 a.updated='2026.11.08';a.minutes=55;
 a.sections[0][1]=
 para('上一章把单次工具调用放进完整任务。本章继续追问：一项任务会改计划、等人批准，还可能在运行进程退出后继续，怎样知道已经做了什么、下一步还准不准做？先固定目标和完成条件，再讨论计划、执行与恢复。')+
 table(['基本对象','负责什么','放到同一份订单日报里'],[
  ['目标与完成条件','目标说明要得到什么；完成条件让结果能被核对','为report-A生成报告；覆盖当前清单引用的全部批次，金额相符、来源可追溯，批准后提交一份'],
  ['步骤与依赖','步骤是一项可记录的工作；依赖规定先后条件','读基础清单；若有补录再读取；两份数据到齐才能汇总，草稿获批后才能发布'],
  ['计划','对未来执行顺序的安排，可以修订','原计划没有补录读取，发现补录引用后换成包含该步骤的计划2'],
  ['事实','已经确认的输入、结果或外部信号','基础订单是[10,27]；补录为[5]；某个具体草稿获批'],
  ['工作流与执行状态','工作流定义允许的推进规则；状态记录这一次走到了哪里','当前等待批准，草稿42已保存；这不等于报告已经发布']
 ])+
 para('把任务拆开时，先写数据依赖：基础清单返回一份补录引用，必须顺着引用读到补录值，才能计算全量。不能让“发布成功”充当完整完成条件；如果只读取基础订单就发布37，技术动作完成了，业务任务仍然错了。')+
 '<h3>固定工作流先覆盖已知分支，动态计划处理新的安排</h3>'+
 para('固定工作流把步骤与条件预先写进程序，例如“有补录引用就读取补录，再汇总”。动态计划允许运行中提出新的步骤安排，但每份提议仍要经过执行系统校验；计划器不能靠写一句“已完成”越过缺失的输入、审批或提交。两者可以结合：外层工作流固定等待、预算与提交规则，里面的计划决定下一段怎样取得证据。',
 '现在固定一组数字：基础批次orders-A/v3包含[10,27]，清单还引用补录批次late-A/v1，读取后才知道其中有[5]。正确结果为37+5=42。初始计划只写“读基础→汇总→发布”，观察到引用后必须补步骤；读过的基础事实不因改计划而消失。')+
 figure('agent-planning-plan-facts','目标、计划与事实三层。计划2补入真实读取，保留输入未变的基础事实；固定工作流预先写好分支，同样能得到42。')+
 para('本例有清楚的已知分支，固定工作流已经足够。第9节同时运行固定与动态两种程序路径，让你比较它们共同完成的工作和动态路径多出来的一次提议，而不是把“会重规划”直接当成更好。',
 '如果引入多个Agent，即多个能独立提出行动并调用工具的执行单元，应先说明哪部分工作真的独立。基础清单的补录引用尚未读到，补录读取就不能凭空并行；拆成多名执行者还要增加任务分派、结果汇合、版本对齐和取消传播。先让一份计划可核对，再考虑并行是否抵得过协调成本。')+
 '<h3>执行请求和完成事实，要用两种记录表达</h3>'+
 para('执行请求描述准备做什么；完成事件描述已经观察到什么。请求可能尚未成功，不能直接当作完成事实。下面第2—7节先用更小的日报23与来源变成999的例子拆开历史重放、提交间隙与执行者接管，再回到42的计划案例。两组数字研究不同边界，不混用。')+
 table(['执行请求 command','已确认事件 event','状态怎样推进'],[
  ['安排read_metrics','activity_completed，结果为23','保存结果后才进入构建日报'],
  ['请求发布某个日报版本','接收方已提交的回执','回执确认后才记录发布完成'],
  ['等待某一版草稿批准','匹配该版本的批准信号已持久入库','检查有效条件后才允许提交']
 ])+sourceAt('workflow');

 a.sections[1][1]=old[1]+
 '<h3>计划版本管未来，输入身份决定事实能否复用</h3>'+
 para('历史记录已经发生的事；计划版本说明接下来打算怎样做。它们相互关联，却不能互相覆盖。把计划1改成计划2时，保留“读到orders-A/v3的[10,27]”这份事实；新计划若仍使用相同输入，就能复用它。补录加入以后，汇总的输入集合改变，旧37便不能因为步骤还叫sum而自动复用。')+
 table(['记录','这一项任务存什么','计划2接着执行时怎样用'],[
  ['plans：计划版本','版本1和版本2分别保存步骤顺序','执行器只按当前已接纳版本推进；旧版本留作追溯'],
  ['facts：确认结果','步骤名、输入身份、返回值','基础批次相同则复用；汇总以完整来源清单摘要作输入身份'],
  ['runtime：当前状态','当前计划版本、剩余预算、草稿与等待状态','恢复先找这份状态，再去读取对应事实'],
  ['signals：外部输入','信号标识、批准对象、版本、是否消费','去重确认与是否适用当前草稿分开'],
  ['reports：实际产物','报告总数与各来源的版本、内容摘要','从产物重新对照权威输入，不能只读DONE']
 ])+
 para('这里有两种不同的版本。计划版本revision属于任务的步骤安排；源版本属于某一份数据，例如orders-A/v3与late-A/v1分别是基础和补录的版本。它们不需要一起递增：计划2仍可使用基础数据v3；基础数据变成v4，则要重新判断已有事实是否适用。',
 '输入摘要是对一份明确序列化内容计算的SHA-256值，用于识别这里绑定的内容；不是“步骤成功”的证明，也不是身份认证。第9节把基础和补录的资源名、版本、数值摘要组成清单，再连同任务与报告目标计算汇总输入摘要。只有步骤名与这份输入身份都相符，已保存的结果才适用。');

 a.sections[7][1]=
 '<h3>先按已有事实推进，再决定是否需要重规划</h3>'+
 para('重规划是修改未来步骤，不是每次恢复都重新问一次“接下来做什么”。先检查终止状态，再读取当前输入版本和已确认事实。本实验在两种情况下进入NEEDS_REPLAN，即“需要重新核对并安排步骤”：一是观察到补录引用而原计划没有read_extra，汇总确实缺输入，必须补步骤；二是已经读取的来源升版，此时使旧草稿失效，保守地要求重新接纳一份计划。第二种情况下，即使原四步仍可覆盖，也会产生新的计划版本。这是本实验选定的策略，不表示数据每变一次都必须重新生成计划。',
 '候选步骤必须满足依赖：基础清单先读，补录值到齐，再汇总，最后经过批准发布。本地实验用明确的四步顺序校验这个教学任务；把publish挪到read_extra之前会被拒绝，当前计划版本保持1。更大的系统应把依赖表示为图，再检查输入是否齐全、权限是否允许以及循环是否有界。',
 '一次被接纳的新计划成为版本2，并单独持久化；执行器继续读取适用事实。若只是把“再试一次”改成“换个角度再试一次”，观察没有增加、步骤语义也相同，这不是进展。实验把观察和步骤一起计算签名，不把理由措辞算进签名，连续两次同样的无效提议后进入STOPPED_NO_PROGRESS，明确请求人工调整。')+
 table(['限制或状态','到底限制什么','本例可核对的行为'],[
  ['提议预算','本次任务最多发起多少次计划生成尝试，不是网络重试次数','初始3，生成一次有效提议后剩2；预算1用尽，再来一次进入STOPPED_BUDGET'],
  ['无进展计数','同一观察下，语义相同而仍无效的提议连续出现多少次','理由文本变化仍计为相同；第二次停止，不继续绕圈'],
  ['执行中 RUNNING','允许根据已接纳计划推进','先复用适用结果，再生成新事实'],
  ['等待 WAITING_APPROVAL','缺一个明确的外部输入，继续运行也不会产生它','保存草稿及等待条件后退出进程；新输入到来再恢复'],
  ['完成 DONE','目标产物已在本例事务中提交','再次恢复不追加事实、事件或第二份报告']
 ])+
 figure('agent-planning-wait-states','区分需要新计划、等待外部输入、预算停止和已完成。等待批准时退出进程，恢复读取数据库，不靠旧调用栈继续。')+
 '<h3>批准的是这份内容，不能只批准一个任务名</h3>'+
 para('先把批准对象说清。草稿是尚未发布的报告正文，含报告目标、总数和来源清单；草稿摘要draft_digest对这份正文计算SHA-256。输入摘要input_digest标识用于本次汇总的来源身份，草稿摘要标识准备发布的具体内容。输入相同但写出了不同总数，两个草稿摘要就不同；来源升版但数值不变，输入身份仍会改变。',
 '持久等待先保存草稿与所需条件，再允许进程退出。这里的批准输入绑定任务、报告目标、计划版本、输入摘要和草稿摘要；消费批准前重新核对这些字段。信号先于等待状态到达时，也先存入signals，后续推进能取出来，不必让人再点一次。生产入口还应认证操作者并检查审批权限，不能相信调用者自己填的名字。',
 '看一个容易忽略的变化：最初清单没有补录，计划1得到37草稿，批准已经入库但尚未发布；接着来源升到v4并引用补录5。恢复后必须使旧草稿失效，接纳计划2，得到新42草稿。旧批准仍是历史事实，重复投递时仍可答复“收过了”，但它不适用于当前草稿。若把去重成功等同于当前授权，新内容就会借旧批准通过。')+
 figure('agent-planning-approval-versions','真实输入更新场景：计划1/草稿37的批准仍留在历史；当前计划2/草稿42必须获新的匹配批准。摘要前缀来自这次实际运行。')+
 para('采用工作流框架时还要读清恢复粒度。例如LangGraph的interrupt恢复会从包含该中断的节点开头重新运行，中断之前的代码可能再执行。保存状态并不意味着从Python原来那一行继续；前面已有业务效果时，仍要遵守本章第4—7节的查证和去重协议。下面使用自写SQLite状态机解释数据关系，不冒充框架SDK验收。')+sourceAt('planningInterrupts')+
 '<h3>次数、截止时间与取消，继续约束整个任务</h3>'+
 old[7].slice(old[7].indexOf('</p>')+4);

 a.sections[8][1]=
 '<h3 id="agent-planning-run">把42这份报告，从来源一直追到实际产物</h3>'+
 para('现在把前面三层对象落到一个可运行文件。planning_lab.py只用Python标准库，每一次推进、提议和批准都由全新子进程执行，状态保存在实际SQLite文件中。提议来源是固定夹具，不调用模型；我们验证计划与事实的关系、等待恢复和验收条件，不评价模型规划能力。')+
 table(['先找程序哪一部分','它把哪条知识落实成数据','应读到的事实'],[
  ['initialize、sources、batches','基础清单只给补录引用；值需要另一次实际SELECT读取','orders-A/v3为[10,27]；late-A/v1为[5]'],
  ['read_base、propose、plans','先有新观察，再校验依赖，再持久化计划版本','动态路径进入NEEDS_REPLAN，版本1变2；固定路径预置分支'],
  ['fact、manifest、input_digest','步骤名加输入身份决定复用；清单记载版本和内容摘要','正确路径的基础读取、补录读取、汇总各一份确认结果'],
  ['advance、signals、approval_matches','等待不占旧进程；批准必须匹配当前草稿','无批准时没有报告；批准后新进程提交一个42报告'],
  ['independent_oracle','直接读来源表和实际报告，不相信runtime.draft或DONE','值、报告目标、来源版本与每份摘要均匹配才通过']
 ])+
 code('下载并完整解压 agent-planning.zip 后，在目录中运行','SHELL',`python3 -B planning_lab.py > record.json
# 可保留每个场景的实际数据库；runs 必须尚不存在
python3 -B planning_lab.py --output-dir runs > retained-record.json
python3 -B planning_lab.py inspect --db runs/adaptive.sqlite`)+
 para('先预测：固定与动态两条路径都会得到42；动态路径先发现缺步骤，再花一次提议接纳计划2。程序在等待状态退出，批准后由新进程继续；这证明任务状态不依赖旧进程内存。事实数量统计的是确认结果记录，不是SQL次数或调用总次数，恢复仍会读取版本等元数据。')+
 table(['实际场景','计划/结果','独立验收或停止理由'],[
  ['adaptive：动态补步骤','计划2；基础、补录、汇总各1份事实；预算3→2；实际报告42','按权威来源和完整清单复核，通过'],
  ['fixed：预置补录分支','计划1；同一42报告；提议预算保持0','本例固定工作流已足够，不为动态能力虚报收益'],
  ['changed_input：已批准37后输入更新','计划2重新汇总42；旧信号重复回执applies_current=false','新42批准到来前不提交；最后一个42报告'],
  ['early_signal：先收批准再进入等待','批准事件在等待事件之前；新进程读取已存信号','只需原信号，实际报告42'],
  ['no_progress / budget','分别因相同无效提议重复、提议预算用尽停止','实际报告均为0份'],
  ['invalid_plan：先发布后补录','校验拒绝；计划仍为版本1','没有报告']
 ])+
 '<h3>最值得核对的反例：状态完成，报告却仍是37</h3>'+
 para('wrong_cache_key真的让程序走错一次：先对无补录清单汇总37；输入更新并加入5以后，计划已经改成2，也确实读取了补录，但故意只按步骤名sum查缓存，拿回旧37。新的草稿、批准和DONE都能形成，实际报告仍是37。独立验收从来源重算42，明确拒绝。这说明计划正确、流程完成和结果正确是三件相连但不能互代的事。',
 '再看corrupt_artifact：把正确报告复制到独立数据库，只改补录的来源摘要，总数仍为42。验收同样拒绝，因为42不能证明用了正确来源。两个负例分别检查计算结果与来源追溯，避免只对自己写的状态标签做断言。')+
 table(['对照','正确的输入身份缓存','错误的步骤名缓存'],[
  ['来源更新后的基础事实','v3、v4各保留1份','同样保留两份'],
  ['汇总事实','按两个不同输入摘要保存两份，37和42','键一直是sum，只留下旧37'],
  ['补录读取','有，得到5','也有，不能靠“调用过补录”证明加进了结果'],
  ['最终产物与独立验收','报告42，通过','报告37，失败；即使当前状态是DONE']
 ])+
 para('正确路径完成后再恢复一次，程序对比完整事件、事实、信号和报告快照，要求一字不增。本任务以提交时观察到的来源版本为完成边界；提交后又来新批次，应创建新的报告任务，不能把已经完成的历史当成永远同步的视图。',
 '本例来源、状态、批准与报告共享一个SQLite事务域，报告写入、信号消费和DONE一起提交；它没有验证任意远端接口的提交恢复。这里使用正常进程退出后重启，崩溃写入窗口与多执行者隔离继续用下面原有实验核对。')+sourceAt('transactions')+
 '<p><a class="inline-link" href="labs/agent-planning.zip" download>下载完整实验包 →</a> · <a href="labs/agent-planning/README.md">分步运行说明</a> · <a href="labs/agent-planning/planning_lab.py">独立源码</a> · <a href="labs/agent-planning/validation.json">实际记录与源码摘要</a></p>'+
 '<details class="full-code"><summary>完整 planning_lab.py · 与下载源码逐字一致</summary>'+trainingCode('planning_lab.py','PYTHON',agentPlanningSource)+'</details>'+
 '<details class="full-code"><summary>继续对照：原有多执行者接管程序与完整代码</summary>'+old[8]+'</details>';
}
'''
selected = {"source_sha256": record["source_sha256"], "verified_on": record["verified_on"],
            "adaptive": cases["adaptive"]["oracle"], "changed_input": changed["oracle"],
            "wrong_cache_key": cases["wrong_cache_key"]["oracle"], "corrupt_artifact": cases["corrupt_artifact"]}
content = content.replace("__SOURCE__", json.dumps(source, ensure_ascii=False)).replace("__EVIDENCE__", json.dumps(selected, ensure_ascii=False))
(ROOT / "dist/agent-planning-bridge.js").write_text(content)
with zipfile.ZipFile(ROOT / "dist/labs/agent-planning.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in ["README.md", "planning_lab.py", "validation.json"]:
        info = zipfile.ZipInfo(name, (2026, 11, 8, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (FOLDER/name).read_bytes())
print("PASS: fresh nine-case subprocess program; source-bound record, three diagrams, chapter bridge and ZIP generated.")
