"""Package the exact SQLite source and captured observations."""
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parents[1]
LAB=ROOT/'dist/labs/sql-paths-snapshots'
names=['query_paths.py','snapshot_retry.py']
(ROOT/'dist/sql-paths-snapshots-files.js').write_text(
    'const sqlPathSnapshotFiles='+json.dumps({name:(LAB/name).read_text() for name in names},ensure_ascii=False)+';\n')
with zipfile.ZipFile(str(LAB)+'.zip','w') as z:
    for name in names+['README.md','validation.json']:
        info=zipfile.ZipInfo('sql-paths-snapshots/'+name,date_time=(2026,11,5,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
        z.writestr(info,(LAB/name).read_bytes())
print('Packaged two exact sources, README and four actual runs.')
