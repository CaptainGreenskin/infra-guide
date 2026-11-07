"""Run actual local authorization/context experiments and bind the public teaching sources."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile
ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/'dist/labs/agent-boundaries'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tokenizer-python',required=True);args=parser.parse_args()
    programs={}
    with tempfile.TemporaryDirectory(prefix='infra-boundary-record-') as tmp:
        for name,python in [('authorization_commit.py',sys.executable),('context_budget.py',args.tokenizer_python)]:
            out=Path(tmp)/(name+'.json')
            subprocess.run([python,'-B',str(FOLDER/name),'--report',str(out)],check=True,stdout=subprocess.DEVNULL,timeout=90)
            programs[name]=json.loads(out.read_text());assert programs[name]['status']=='passed'
    files={name:(FOLDER/name).read_text() for name in ['authorization_commit.py','context_budget.py','requirements.txt','README.md']}
    hashes={name:hashlib.sha256(text.encode()).hexdigest() for name,text in files.items()}
    for name,r in programs.items():assert r['source_sha256']==hashes[name]
    authorization=programs['authorization_commit.py'];assert authorization['states']['revoked_at_commit']['effects']==0
    assert authorization['states']['snapshot_negative']['effects']==1
    context=programs['context_budget.py'];assert context['receiver']['request_count']==1
    assert context['cases']['normal']['prompt_tokens']==237 and context['cases']['normal']['body_only_tokens']==36
    assert context['cases']['normal']['prompt_tokens']+96<=512 and context['cases']['tight_budget']['requests_delivered']==0
    record={'status':'passed','verified_at':'2026-11-07','source_sha256':hashes,'programs':programs,
            'scope':'Actual loopback HTTP/SQLite and pinned Chinese BPE. Identity and budgets are fixtures; no LLM quality, Kairo integration, external atomicity or global instantaneous revocation claim.'}
    (FOLDER/'validation.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'dist/agent-boundaries-data.js').write_text('const agentBoundaryFiles='+json.dumps(files,ensure_ascii=False)+';\nconst agentBoundaryValidation='+json.dumps(record,ensure_ascii=False)+';\n')
    with zipfile.ZipFile(FOLDER.with_suffix('.zip'),'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name in list(files)+['validation.json']:
            info=zipfile.ZipInfo(name,(2026,11,7,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,(FOLDER/name).read_bytes())
    print('Bound actual permission effects, BPE counts, version/ACL gates and HTTP prompt receipts to source and ZIP.')

if __name__=='__main__':main()
