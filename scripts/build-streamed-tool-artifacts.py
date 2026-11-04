"""Package exact streamed-call source and captured HTTP observations."""
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parents[1]
LAB=ROOT/'dist/labs/streamed-tool-calls'
name='streamed_tool_calls.py'
(ROOT/'dist/streamed-tool-files.js').write_text(
    'const streamedToolFiles='+json.dumps({name:(LAB/name).read_text()},ensure_ascii=False)+';\n')
with zipfile.ZipFile(str(LAB)+'.zip','w') as z:
    for name in ['streamed_tool_calls.py','README.md','validation.json']:
        info=zipfile.ZipInfo('streamed-tool-calls/'+name,date_time=(2026,11,5,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
        z.writestr(info,(LAB/name).read_bytes())
print('Packaged exact source, README and two actual HTTP runs.')
