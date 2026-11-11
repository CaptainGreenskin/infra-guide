"""Compare a private authoritative DNS zone with a warm Unbound cache."""
import argparse
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import platform
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time


ZONE = "example.test."
API = "api." + ZONE
PREVIEW = "preview." + ZONE
OLD_API = "192.0.2.10"
NEW_API = "192.0.2.20"
NEW_PREVIEW = "192.0.2.30"
POSITIVE_TTL = 8
NEGATIVE_TTL = 5


def unused_ports():
    ports = []
    with socket.socket() as first, socket.socket() as second:
        for listener in (first, second):
            listener.bind(("127.0.0.1", 0))
            ports.append(listener.getsockname()[1])
    return ports


def server_config(port, directory):
    return f'''server:
    interface: 127.0.0.1
    outgoing-interface: 127.0.0.1
    port: {port}
    username: ""
    chroot: ""
    pidfile: ""
    directory: "{directory}"
    use-syslog: no
    do-ip6: no
    module-config: "iterator"
    do-not-query-localhost: no
    qname-minimisation: no
    prefetch: no
    serve-expired: no
    local-zone: "test." nodefault
'''


def authority_config(port, directory, serial):
    api = OLD_API if serial == 1 else NEW_API
    config = server_config(port, directory) + f'''    access-control: 127.0.0.0/8 refuse_non_local
    local-zone: "{ZONE}" static
    local-data: "{ZONE} {NEGATIVE_TTL} IN SOA ns.{ZONE} hostmaster.{ZONE} {serial} 60 60 60 {NEGATIVE_TTL}"
    local-data: "{ZONE} {POSITIVE_TTL} IN NS ns.{ZONE}"
    local-data: "ns.{ZONE} {POSITIVE_TTL} IN A 192.0.2.53"
    local-data: "{API} {POSITIVE_TTL} IN A {api}"
'''
    if serial == 2:
        config += f'    local-data: "{PREVIEW} {POSITIVE_TTL} IN A {NEW_PREVIEW}"\n'
    return config


def resolver_config(port, authority_port, directory):
    return server_config(port, directory) + f'''stub-zone:
    name: "{ZONE}"
    stub-addr: 127.0.0.1@{authority_port}
    stub-first: no
    stub-prime: no
forward-zone:
    name: "."
    forward-addr: 127.0.0.1@{authority_port}
    forward-first: no
'''


@contextmanager
def unbound_process(binary, config):
    with config.with_suffix(".log").open("w+") as log:
        process = subprocess.Popen([binary, "-d", "-c", str(config)], stdout=log, stderr=log)
        try:
            yield process
        except Exception as failure:
            log.seek(0)
            raise RuntimeError(f"{config.stem}: {failure}\n{log.read()}") from failure
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)


def parse_reply(raw):
    status = re.search(r"\bstatus: (\w+),", raw)
    flags = re.search(r"^;; flags: ([^;]*);", raw, flags=re.M)
    if not status or not flags:
        raise RuntimeError(f"Missing DNS header in dig output:\n{raw}")
    sections = {"ANSWER": [], "AUTHORITY": []}
    section = None
    for line in raw.splitlines():
        if line.startswith(";; ") and line.endswith(" SECTION:"):
            section = line[3:-9]
        elif section in sections and line and not line.startswith(";"):
            name, ttl, record_class, kind, data = line.split(maxsplit=4)
            if record_class != "IN":
                raise RuntimeError(f"Unexpected DNS class: {line}")
            sections[section].append({"name": name, "ttl": int(ttl), "type": kind, "data": data})
    return {"status": status[1], "flags": flags[1].split(),
            "answers": sections["ANSWER"], "authority": sections["AUTHORITY"]}


def dig_query(binary, process, port, name, kind, recurse, start):
    if process.poll() is not None:
        raise RuntimeError(f"Unbound process {process.pid} exited")
    argv = ["-4", "@127.0.0.1", "-p", str(port), name, kind, "+nosearch",
            "+time=1", "+tries=1", "+noall", "+comments", "+answer", "+authority",
            "+recurse" if recurse else "+norecurse"]
    raw = subprocess.check_output([binary, *argv], text=True, timeout=3, stderr=subprocess.STDOUT)
    return {"args": argv, "elapsed_ms": round((time.monotonic() - start) * 1000, 3),
            **parse_reply(raw), "raw": raw}


def pair(binary, process, port, recurse, start):
    return {key: dig_query(binary, process, port, name, "A", recurse, start)
            for key, name in (("api", API), ("preview", PREVIEW))}


def addresses(pair_result):
    return tuple(tuple(row["data"] for row in pair_result[name]["answers"] if row["type"] == "A")
                 for name in ("api", "preview"))


def wait_for_authority(binary, process, port, expected_api, start):
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        try:
            answer = dig_query(binary, process, port, API, "A", False, start)
        except subprocess.CalledProcessError:
            continue
        if any(row["data"] == expected_api for row in answer["answers"]):
            return
        time.sleep(0.05)
    raise RuntimeError(f"Authority did not serve {expected_api} after startup or reload")


def observe(dig, authority, resolver, authority_port, resolver_port, config, updated_config):
    start = time.monotonic()
    wait_for_authority(dig, authority, authority_port, OLD_API, start)
    before = {"authority": pair(dig, authority, authority_port, False, start),
              "resolver": pair(dig, resolver, resolver_port, True, start)}
    for side, rows in before.items():
        if addresses(rows) != ((OLD_API,), ()) or rows["preview"]["status"] != "NXDOMAIN":
            raise RuntimeError(f"Unexpected initial {side} records")

    replacement = config.with_suffix(".new")
    replacement.write_text(updated_config, encoding="utf-8")
    replacement.replace(config)
    authority.send_signal(signal.SIGHUP)
    wait_for_authority(dig, authority, authority_port, NEW_API, start)
    changed = {"authority": pair(dig, authority, authority_port, False, start),
               "resolver": pair(dig, resolver, resolver_port, True, start)}
    if addresses(changed["authority"]) != ((NEW_API,), (NEW_PREVIEW,)):
        raise RuntimeError("Authority did not reload both records")
    if addresses(changed["resolver"]) != ((OLD_API,), ()) or changed["resolver"]["preview"]["status"] != "NXDOMAIN":
        raise RuntimeError("The warm resolver no longer holds both old answers; rerun on a quiet host")

    deadline = start + 15
    negative_expired = None
    while time.monotonic() < deadline:
        rows = pair(dig, resolver, resolver_port, True, start)
        if addresses(rows) == ((OLD_API,), (NEW_PREVIEW,)) and negative_expired is None:
            negative_expired = rows
        if addresses(rows) == ((NEW_API,), (NEW_PREVIEW,)):
            if negative_expired is None:
                raise RuntimeError("Did not observe the interval after negative cache expiry")
            return {"before": before, "changed_authority": changed,
                    "negative_expired": {"resolver": negative_expired}, "both_expired": {"resolver": rows}}
        time.sleep(0.2)
    raise RuntimeError("The resolver did not converge within the observation window")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def tool_record(path, option):
    version = subprocess.check_output([path, option], text=True, timeout=4, stderr=subprocess.STDOUT)
    return {"version": version.strip().splitlines()[0], "sha256": sha256(path)}


def run(unbound, dig):
    tools = {"unbound": tool_record(unbound, "-V"), "dig": tool_record(dig, "-v")}
    with tempfile.TemporaryDirectory(prefix="infra-dns-cache-", dir="/tmp") as scratch:
        directory = Path(scratch)
        authority_port, resolver_port = unused_ports()
        old = authority_config(authority_port, directory, 1)
        updated = authority_config(authority_port, directory, 2)
        resolver_text = resolver_config(resolver_port, authority_port, directory)
        authority_path, resolver_path = directory / "authority.conf", directory / "resolver.conf"
        authority_path.write_text(old, encoding="utf-8")
        resolver_path.write_text(resolver_text, encoding="utf-8")
        with unbound_process(unbound, authority_path) as authority, unbound_process(unbound, resolver_path) as resolver:
            phases = observe(dig, authority, resolver, authority_port, resolver_port, authority_path, updated)
            processes = {"authority": {"pid": authority.pid, "port": authority_port},
                         "resolver": {"pid": resolver.pid, "port": resolver_port}}
    return {"schema": "dns-cache-v1", "status": "passed",
            "environment": {"system": platform.system(), "arch": platform.machine(), "tools": tools},
            "fixture": {"api": API, "preview": PREVIEW, "positive_ttl_seconds": POSITIVE_TTL,
                        "negative_ttl_seconds": NEGATIVE_TTL, "authority_serials": [1, 2]},
            "processes": processes, "phases": phases,
            "configs": {"authority_before": old, "authority_after": updated, "resolver": resolver_text},
            "source_sha256": {"dns_cache.py": sha256(__file__)},
            "scope": "Two isolated loopback Unbound processes with no external upstream; dig bypasses the OS resolver. No DNSSEC, OS or browser cache, public propagation or connection reuse measurement."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--unbound", default="unbound", help="path to the Unbound executable")
    parser.add_argument("--dig", default="dig", help="path to the dig executable")
    parser.add_argument("--output", type=Path, help="path to a new JSON record; defaults to stdout")
    args = parser.parse_args()
    unbound, dig = shutil.which(args.unbound), shutil.which(args.dig)
    if not unbound or not dig:
        parser.error("Unbound and dig are required; use --unbound and --dig to supply their paths")
    result = json.dumps(run(unbound, dig), ensure_ascii=False, indent=2) + "\n"
    if args.output:
        with args.output.open("x", encoding="utf-8") as output:
            output.write(result)
    else:
        print(result, end="")


if __name__ == "__main__":
    main()
