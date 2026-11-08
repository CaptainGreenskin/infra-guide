"""Execute native DCP, bind source/record/diagram/ZIP; edit only this bridge's files."""
import hashlib
import html
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "dist/labs/torch-checkpoint"
FILES = ["train_dcp.py", "run_lab.py", "reference_train.py", "README.md", "requirements.txt"]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    assert (FOLDER / "reference_train.py").read_bytes() == (ROOT / "dist/labs/ddp/train_ddp.py").read_bytes()
    result = json.loads(subprocess.check_output([sys.executable, "-B", str(FOLDER / "run_lab.py")],
                                               text=True, timeout=360))
    assert result["status"] == "passed" and result["all_reference_fields_exact"]
    record = {"schema": "torch-checkpoint-v1", "verified_on": "2026-11-08", "status": "passed",
              "environment": {"python": platform.python_version(), "system": platform.system(),
                              "machine": platform.machine(), "torch": result["torch"]},
              "command": "python -B run_lab.py", "source_sha256": {f: digest(FOLDER/f) for f in FILES},
              "program": result}
    (FOLDER / "validation.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    bridge = ROOT / "dist/torch-checkpoint-bridge.js"
    before, tail = bridge.read_text().split("/* BEGIN TORCH CHECKPOINT GENERATED */", 1)
    _, after = tail.split("/* END TORCH CHECKPOINT GENERATED */", 1)
    generated = "\nconst torchCheckpointFiles = " + json.dumps({f: (FOLDER/f).read_text() for f in FILES}, ensure_ascii=False) + ";\n"
    generated += "const torchCheckpointEvidence = " + json.dumps(record, ensure_ascii=False) + ";\n"
    bridge.write_text(before + "/* BEGIN TORCH CHECKPOINT GENERATED */" + generated + "/* END TORCH CHECKPOINT GENERATED */" + after)
    metadata = {"schema": record["schema"], "source_sha256": record["source_sha256"],
                "saved_updates": 16, "resumed_updates": result["applied_updates"],
                "next_epoch_at_save": 2, "world_size": 2, "actual_api": "torch.distributed.checkpoint.save/load",
                "measured_timeline": False}
    body = '''<rect width="1024" height="610" rx="16" fill="#f8fafd"/>
<text x="32" y="42" class="title">同一次第16步更新，从旧进程交到新进程</text>
<text x="65" y="84" class="label">rank 0 · CPU</text><text x="370" y="84" class="label">DCP共享目录</text><text x="730" y="84" class="label">rank 1 · CPU</text>
<path d="M160 98V567M512 98V567M864 98V567" class="lane"/>
<rect x="32" y="112" width="270" height="64" rx="9" class="box"/><text x="48" y="138">模型、Adam、进度</text><text x="48" y="161" class="small">next_epoch=2，更新16次</text>
<rect x="722" y="112" width="270" height="64" rx="9" class="box"/><text x="738" y="138">同一步模型、Adam、进度</text><text x="738" y="161" class="small">汇集各rank RNG清单</text>
<path d="M310 145H357" class="arrow"/><path d="M714 145H667" class="arrow"/>
<rect x="370" y="112" width="284" height="64" rx="9" class="good"/><text x="387" y="138">所有rank调用同步save</text><text x="387" y="161" class="small">state_dict → 规划数据写入</text>
<path d="M512 180V208" class="arrow"/>
<rect x="370" y="222" width="284" height="73" rx="9" class="box"/><text x="387" y="248">先写.distcp数据</text><text x="387" y="272">再完成.metadata位置清单</text>
<text x="32" y="257">save返回后，旧进程退出</text><text x="722" y="257">save返回后，旧进程退出</text>
<path d="M32 326H992" stroke="#a8b8ce" stroke-dasharray="6 6"/><text x="337" y="351" class="small">旧torchrun已结束，随后启动新的两个worker</text>
<rect x="32" y="372" width="270" height="68" rx="9" class="box"/><text x="48" y="399">创建模型、Adam与目标树</text><text x="48" y="423" class="small">get_state_dict分配加载对象</text>
<rect x="722" y="372" width="270" height="68" rx="9" class="box"/><text x="738" y="399">创建模型、Adam与目标树</text><text x="738" y="423" class="small">双方都调用load</text>
<path d="M310 407H357" class="arrow"/><path d="M714 407H667" class="arrow"/><rect x="370" y="372" width="284" height="68" rx="9" class="good"/><text x="387" y="399">按.metadata读回状态</text><text x="387" y="423" class="small">load_state_dict → set_state_dict</text>
<path d="M160 445V473" class="arrow"/><path d="M864 445V473" class="arrow"/>
<rect x="32" y="487" width="270" height="64" rx="9" class="good"/><text x="48" y="514">安装本rank RNG与进度</text><text x="48" y="538" class="small">从第2轮继续，最终32次更新</text>
<rect x="722" y="487" width="270" height="64" rx="9" class="good"/><text x="738" y="514">安装本rank RNG与进度</text><text x="738" y="538" class="small">实际输入ID独立核对</text>
<text x="32" y="589" class="small">DCP组织一个目录的数据读写；CURRENT等发布协议决定选用哪个目录。</text>'''
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 610" role="img" aria-labelledby="title desc">
<title id="title">原生DCP正常保存与新进程恢复</title><desc id="desc">两个CPU rank在同一步共同调用同步保存，旧进程结束后，新进程先分配目标状态再加载，从第2轮继续。</desc>
<metadata>''' + html.escape(json.dumps(metadata, ensure_ascii=False)) + '''</metadata>
<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#4d668a" stroke-width="1.5"/></marker></defs>
<style>text{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;fill:#263951;font-size:17px}.title{font-size:25px;font-weight:700}.label{font-size:20px;font-weight:650}.small{font-size:15px}.lane{stroke:#c9d5e5;stroke-width:2}.box{fill:white;stroke:#b5c7de}.good{fill:#edf8f1;stroke:#8cbda1}.arrow{fill:none;stroke:#4d668a;stroke-width:2;marker-end:url(#arrow)}</style>''' + body + "</svg>\n"
    (ROOT / "dist/diagrams/torch-checkpoint-path.svg").write_text(svg)
    with zipfile.ZipFile(ROOT / "dist/labs/torch-checkpoint.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for name in FILES + ["validation.json"]:
            archive.write(FOLDER / name, name)
    print("PASS: native DCP record, source-bound bridge, diagram and complete ZIP refreshed")


if __name__ == "__main__":
    main()
