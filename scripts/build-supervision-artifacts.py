"""Package exact canonical source and its recorded run; no code is executed here."""
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / 'dist/labs/supervision-gradients'
files = {name: (LAB/name).read_text() for name in ['supervision_gradients.py']}
record = json.loads((LAB/'validation.json').read_text())
(ROOT/'dist/supervision-gradients-files.js').write_text(
    'const supervisionGradientFiles='+json.dumps(files, ensure_ascii=False)+';\n'+
    'const supervisionGradientRecord='+json.dumps(record, ensure_ascii=False)+';\n')
with zipfile.ZipFile(str(LAB)+'.zip', 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for name in ['supervision_gradients.py', 'README.md', 'validation.json']:
        info = zipfile.ZipInfo('supervision-gradients/'+name, date_time=(2026,11,5,0,0,0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, (LAB/name).read_bytes())
print('Packaged exact source, README and actual execution record.')
