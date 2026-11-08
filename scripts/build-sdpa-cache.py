"""Run same-model native SDPA, bind record, bridge, one figure and full package."""
import hashlib
import html
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "dist/labs/sdpa-cache"
FILES = ["cache_lab.py", "tiny_decoder.py", "README.md", "requirements.txt"]


def main():
    assert (FOLDER / "tiny_decoder.py").read_bytes() == (ROOT / "dist/labs/model-foundations/tiny_decoder.py").read_bytes()
    result = json.loads(subprocess.check_output([sys.executable, "-B", str(FOLDER / "cache_lab.py")],
                                               text=True, timeout=45))
    assert result["status"] == "passed"
    sources = {f: hashlib.sha256((FOLDER/f).read_bytes()).hexdigest() for f in FILES}
    record = {"schema": "sdpa-cache-v1", "verified_on": "2026-11-08", "status": "passed",
              "environment": {"python": platform.python_version(), "system": platform.system(),
                              "machine": platform.machine(), "torch": result["torch"]},
              "command": "python -B cache_lab.py", "source_sha256": sources, "program": result}
    (FOLDER / "validation.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    bridge = ROOT / "dist/sdpa-cache-bridge.js"
    before, tail = bridge.read_text().split("/* BEGIN SDPA CACHE GENERATED */", 1)
    _, after = tail.split("/* END SDPA CACHE GENERATED */", 1)
    generated = "\nconst sdpaCacheFiles = " + json.dumps({f: (FOLDER/f).read_text() for f in FILES}, ensure_ascii=False) + ";\n"
    generated += "const sdpaCacheEvidence = " + json.dumps(record, ensure_ascii=False) + ";\n"
    bridge.write_text(before + "/* BEGIN SDPA CACHE GENERATED */" + generated + "/* END SDPA CACHE GENERATED */" + after)
    block = result["cases"]["two_position"]["trace"][1]
    metadata = {"schema": record["schema"], "source_sha256": sources, "model_parameters": 664,
                "query_positions": block["query_positions"], "visible": block["visible"],
                "kv_shape": block["kv_shape"], "backend": result["backend"],
                "logits_max_error": result["cases"]["two_position"]["logits_max_error"]}
    cells = []
    for i, row in enumerate(block["visible"]):
        for j, allowed in enumerate(row):
            x, y = 178 + j * 64, 316 + i * 60
            cells.append(f'<rect x="{x}" y="{y}" width="54" height="48" rx="7" class="{"yes" if allowed else "no"}"/><text x="{x+18}" y="{y+31}">{"✓" if allowed else "—"}</text>')
    body = '''<rect width="1024" height="530" rx="16" fill="#f8fafd"/>
<text x="32" y="42" class="title">先接上历史，再按逻辑位置读缓存</text>
<rect x="32" y="78" width="205" height="84" rx="10" class="box"/><text x="48" y="108" class="label">新输入 [2,3]</text><text x="48" y="138" class="small">past=2，length=2</text>
<path d="M243 119H263" class="arrow"/>
<rect x="276" y="78" width="222" height="84" rx="10" class="box"/><text x="292" y="108" class="label">位置表与QKV投影</text><text x="292" y="138" class="small">新Q的位置为2、3</text>
<path d="M504 119H524" class="arrow"/>
<rect x="537" y="78" width="205" height="84" rx="10" class="good"/><text x="553" y="108" class="label">追加新K/V</text><text x="553" y="138" class="small">合并后位置0、1、2、3</text>
<path d="M748 119H768" class="arrow"/>
<rect x="781" y="78" width="211" height="84" rx="10" class="good"/><text x="797" y="108" class="label">原生SDPA</text><text x="797" y="138" class="small">新Q读取合法K/V</text>
<rect x="537" y="190" width="205" height="61" rx="9" class="box"/><text x="553" y="215">已有缓存K/V</text><text x="553" y="238" class="small">来自先前输入[0,1]</text><path d="M640 184V169" class="arrow"/>
<text x="32" y="280" class="label">可见矩阵：key位置 ≤ query位置</text>
<text x="180" y="307" class="small">0</text><text x="244" y="307" class="small">1</text><text x="308" y="307" class="small">2</text><text x="372" y="307" class="small">3</text>
<text x="32" y="347">query位置2</text><text x="32" y="407">query位置3</text>
''' + "".join(cells) + '''
<text x="32" y="461" class="small">局部行0 → 逻辑位置2；局部行1 → 逻辑位置3</text>
<rect x="519" y="295" width="473" height="143" rx="10" class="box"/><text x="539" y="327" class="label">SDPA之后，继续原模型的层</text><text x="539" y="359">残差 → 前馈 → 输出头 → logits</text><text x="539" y="388" class="small">与完整[0,1,2,3]的对应位置逐项核对</text><text x="539" y="416" class="small">相同权重、664参数；缓存不增加参数</text>
<path d="M886 168V282" class="arrow"/>
<text x="32" y="506" class="small">矩阵取自本次实际两位置续算；行列坐标与程序的query_positions、visible一致。</text>'''
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 530" role="img" aria-labelledby="title desc">
<title id="title">同一个TinyDecoder的SDPA缓存正常路径</title><desc id="desc">先缓存输入0和1，再处理2和3；新query逻辑位置决定可见范围，随后继续原残差、前馈和输出头。</desc>
<metadata>''' + html.escape(json.dumps(metadata, ensure_ascii=False)) + '''</metadata>
<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#4d668a" stroke-width="1.5"/></marker></defs>
<style>text{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;fill:#263951;font-size:18px}.title{font-size:25px;font-weight:700}.label{font-size:20px;font-weight:650}.small{font-size:16px}.box{fill:white;stroke:#b5c7de}.good,.yes{fill:#edf8f1;stroke:#8cbda1}.no{fill:#eef1f6;stroke:#cbd4e0}.arrow{fill:none;stroke:#4d668a;stroke-width:2;marker-end:url(#arrow)}</style>''' + body + "</svg>\n"
    (ROOT / "dist/diagrams/sdpa-cache-path.svg").write_text(svg)
    with zipfile.ZipFile(ROOT / "dist/labs/sdpa-cache.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for name in FILES + ["validation.json"]:
            archive.write(FOLDER / name, name)
    print("PASS: actual native SDPA record, same-model bridge, source-bound mask figure and complete ZIP refreshed")


if __name__ == "__main__":
    main()
