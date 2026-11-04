"""Run the three independent labs; regenerate exact embedded source and download assets."""
import hashlib
import json
from pathlib import Path
import platform
import sqlite3
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
LAB=ROOT/"dist/labs/serving-consistency"
PROGRAMS=["cache_outbox.py","serving_scheduler.py","retrieval_pipeline.py"]
report={"python":platform.python_version(),"sqlite":sqlite3.sqlite_version,"programs":{}}
files={}
for name in PROGRAMS:
    source=(LAB/name).read_bytes()
    run=subprocess.run([sys.executable,str(LAB/name)],capture_output=True,text=True,timeout=25)
    if run.returncode:
        raise RuntimeError(name+" failed: "+run.stderr)
    result=json.loads(run.stdout)
    report["programs"][name]={"sha256":hashlib.sha256(source).hexdigest(),"result":result,"exit_code":0}
    files[name]=source.decode()
(LAB/"validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
(ROOT/"dist/serving-consistency-files.js").write_text(
    "const servingConsistencyFiles="+json.dumps(files,ensure_ascii=False)+";\n"+
    "const servingConsistencyValidation="+json.dumps(report,ensure_ascii=False)+";\n")
with zipfile.ZipFile(ROOT/"dist/labs/serving-consistency.zip","w",zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(LAB.iterdir()):
        if path.is_file():
            bundle.write(path,"serving-consistency/"+path.name)
print("PASS: "+str(len(PROGRAMS))+" independent programs; generated exact sources, actual outputs and ZIP.")
