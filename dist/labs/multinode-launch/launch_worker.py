"""Record torchrun's actual rank allocation, then execute the unchanged teaching trainer."""
import json
import os
from pathlib import Path
import runpy
import socket

record_dir = Path(os.environ['INFRA_LAUNCH_RECORD_DIR'])
record_dir.mkdir(parents=True, exist_ok=True)
record = {key.lower(): int(os.environ[key]) for key in
          ('RANK', 'LOCAL_RANK', 'GROUP_RANK', 'ROLE_RANK', 'WORLD_SIZE', 'LOCAL_WORLD_SIZE')}
# Hostnames are checked locally and removed from the published report.
record['_host'] = socket.gethostname()
(record_dir / ('rank-' + str(record['rank']) + '.json')).write_text(json.dumps(record))
runpy.run_path(str(Path(__file__).with_name('train_ddp.py')), run_name='__main__')
