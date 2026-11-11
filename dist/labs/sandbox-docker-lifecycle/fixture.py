"""Fixed, synthetic jobs executed inside the owned containers."""
import json
import signal
import subprocess
import sys
import time
from hashlib import sha256
from pathlib import Path


WORK = Path("/work")
VALUES = b"[10,27]"


def report(task):
    return {"task": task, "amount": sum(json.loads(VALUES)), "input_sha256": sha256(VALUES).hexdigest()}


def save(task):
    temporary = WORK / "report.tmp"
    temporary.write_text(json.dumps(report(task)))
    temporary.replace(WORK / "report.json")


def work(task):
    marker = WORK / "previous"
    previous = marker.read_text() if marker.exists() else None
    if previous is not None:
        print(json.dumps({"accepted": False, "previous": previous}))
        return
    save(task)
    marker.write_text(task)
    print(json.dumps({"accepted": True, "previous": None}))


def reset():
    for name in ("previous", "report.json"):
        (WORK / name).unlink()


def read():
    path = WORK / "report.json"
    print(path.read_text() if path.exists() else "null")


def serve(task):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    if task is None:
        (WORK / "ready").touch()
    else:
        subprocess.run([sys.executable, "-I", "-B", __file__, "worker", task], check=True)
    while True:
        signal.pause()


def worker(task):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    (WORK / "ready").touch()
    while not (WORK / "finish").exists():
        time.sleep(0.01)
    save(task)


if __name__ == "__main__":
    action, *args = sys.argv[1:]
    if action == "serve":
        serve(args[0] if args else None)
    elif action == "worker":
        worker(*args)
    elif action == "work":
        work(*args)
    elif action == "ready":
        print(json.dumps((WORK / "ready").exists()))
    elif action == "finish":
        (WORK / "finish").touch()
    elif action == "reset":
        reset()
    elif action == "read":
        read()
    else:
        raise SystemExit("unknown fixture action")
