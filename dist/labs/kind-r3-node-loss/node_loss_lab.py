"""Recover the same report across worker containers through an unchanged kind NodePort."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import http.client
import json
import os
from pathlib import Path
import platform
import secrets
import socket
import sqlite3
import subprocess
import tempfile
import threading
import time


NODE_IMAGE = "kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0"
APP_IMAGE = "python:3.13.7-alpine3.22@sha256:9ba6d8cbebf0fb6546ae71f2a1c14f6ffd2fdab83af7fa5669734ef30ad48844"
KIND = "v0.33.0"
KUBECTL = "v1.35.8"
ATTACHMENT = b"A report 3"
FIXTURE = {
    "tenant": "A", "report": "R3", "commit_seq": 102, "database_seq": 103,
    "object": "object-v3", "sha256": hashlib.sha256(ATTACHMENT).hexdigest(),
}
LABEL = "infra-guide.test/worker"
NAMESPACE = "r3-node-loss"
VOLUME_PATH = "/var/local/infra-guide-r3"
NODE_PORT = 30950
PROBE_INTERVAL = 0.20
STABLE_COUNT = 3
APP = r"""
from contextlib import closing
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sqlite3

data = Path('/data')

def report(tenant):
    with closing(sqlite3.connect('file:/data/reports.db?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        return db.execute(
            'SELECT *, (SELECT seq FROM progress) AS database_seq FROM reports WHERE tenant=? AND report=?',
            (tenant, 'R3'),
        ).fetchone()

class Server(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        health = self.path == '/readyz'
        row = report('A' if health else self.headers.get('X-Lab-Tenant', ''))
        body = b''
        if row is None:
            status = 403
        elif health or self.path == '/attachments/object-v3':
            artifact = data / row['object']
            if not artifact.is_file():
                status = 503 if health else 404
            else:
                contents = artifact.read_bytes()
                status = 200 if sha256(contents).hexdigest() == row['sha256'] else 503
                if not health and status == 200:
                    body = contents
        elif self.path == '/reports/R3':
            status, body = 200, json.dumps(dict(row), sort_keys=True).encode()
        else:
            status = 404
        self.send_response(status)
        self.send_header('X-Request-ID', self.headers.get('X-Request-ID', ''))
        self.send_header('X-Lab-Pod-UID', os.environ['POD_UID'])
        self.send_header('X-Lab-Node', os.environ['NODE_NAME'])
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

ThreadingHTTPServer(('0.0.0.0', 8080), Server).serve_forever()
"""


def run(*args, timeout=30):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"{args[0]} {args[1]} exited {result.returncode}: {result.stderr.strip()}")
    return result.stdout.strip()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def object_(api, kind, name, **fields):
    return {"apiVersion": api, "kind": kind, "metadata": {"name": name}, **fields}


def seed_backup(root):
    source = root / "original.db"
    with closing(sqlite3.connect(source)) as db, db:
        db.execute("CREATE TABLE reports (tenant, report, commit_seq, object, sha256)")
        db.execute("CREATE TABLE progress (seq)")
        db.execute("INSERT INTO progress VALUES (?)", (FIXTURE["database_seq"],))
        db.execute("INSERT INTO reports VALUES (:tenant,:report,:commit_seq,:object,:sha256)", FIXTURE)
    backup = root / "reports.db"
    with closing(sqlite3.connect(source)) as original, closing(sqlite3.connect(backup)) as target:
        original.backup(target)
    attachment = root / FIXTURE["object"]
    attachment.write_bytes(ATTACHMENT)
    return [backup, attachment]


class Cluster:
    def __init__(self, root):
        self.name = f"infra-r3-loss-{secrets.token_hex(5)}"
        self.kubeconfig = root / "kubeconfig"
        self.config = root / "kind.json"
        self.objects = root / "apply.json"
        self.nodes = {}
        self.started = False
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.host_port = sock.getsockname()[1]

    def k(self, *args, timeout=30):
        return run("kubectl", "--kubeconfig", str(self.kubeconfig), "--context", f"kind-{self.name}", *args, timeout=timeout)

    def get(self, *args):
        return json.loads(self.k("get", *args, "-o", "json"))

    def apply(self, *items):
        self.objects.write_text(json.dumps({"apiVersion": "v1", "kind": "List", "items": items}))
        self.k("-n", NAMESPACE, "apply", "-f", str(self.objects))

    def create(self):
        if platform.system() != "Linux" or platform.machine() != "x86_64":
            raise RuntimeError("Run on a Linux x86-64 host")
        endpoint = run("docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}")
        if os.environ.get("DOCKER_HOST") or endpoint != "unix:///var/run/docker.sock":
            raise RuntimeError("Use the standard local Docker Unix socket with DOCKER_HOST unset")
        if os.environ.get("KIND_EXPERIMENTAL_PROVIDER", "docker") != "docker":
            raise RuntimeError("Use kind's local Docker provider")
        if not run("kind", "version").startswith(f"kind {KIND} "):
            raise RuntimeError(f"Use kind {KIND}")
        kubectl = json.loads(run("kubectl", "version", "--client", "-o", "json"))
        if kubectl["clientVersion"]["gitVersion"] != KUBECTL:
            raise RuntimeError(f"Use kubectl {KUBECTL}")
        cfg = {
            "apiVersion": "kind.x-k8s.io/v1alpha4", "kind": "Cluster",
            "networking": {"apiServerAddress": "127.0.0.1"},
            "nodes": [
                {"role": "control-plane", "image": NODE_IMAGE, "extraPortMappings": [
                    {"containerPort": NODE_PORT, "hostPort": self.host_port, "listenAddress": "127.0.0.1"}
                ]},
                *({"role": "worker", "image": NODE_IMAGE, "labels": {LABEL: name}} for name in ("a", "b")),
            ],
        }
        self.config.write_text(json.dumps(cfg))
        if self.name in run("kind", "get", "clusters").splitlines():
            raise RuntimeError("Owned cluster name collision")
        self.started = True
        run("kind", "create", "cluster", "--name", self.name, "--config", str(self.config),
            "--kubeconfig", str(self.kubeconfig), "--wait", "150s", timeout=420)
        self.kubeconfig.chmod(0o600)
        for node in self.get("nodes")["items"]:
            name = node["metadata"]["name"]
            label = node["metadata"]["labels"].get(LABEL, "control-plane")
            if label in self.nodes:
                raise RuntimeError(f"Repeated node role {label}")
            self.nodes[label] = name
        if set(self.nodes) != {"a", "b", "control-plane"}:
            raise RuntimeError("Expected two different workers and a control plane")
        if set(self.nodes.values()) != set(run("kind", "get", "nodes", "--name", self.name).splitlines()):
            raise RuntimeError("Kubernetes node names did not match owned kind containers")
        self.k("create", "namespace", NAMESPACE)

    def owned_node(self, role):
        name = self.nodes[role]
        label = run("docker", "inspect", "--format", '{{index .Config.Labels "io.x-k8s.kind.cluster"}}', name)
        if label != self.name or not name.startswith(self.name + "-"):
            raise RuntimeError("Refusing to touch a Docker container outside the owned cluster")
        return name

    def copy_data(self, role, files):
        node = self.owned_node(role)
        run("docker", "exec", node, "mkdir", "-p", VOLUME_PATH)
        contents = {}
        for path in files:
            target = VOLUME_PATH + "/" + path.name
            run("docker", "cp", str(path), f"{node}:{target}")
            actual = run("docker", "exec", node, "sha256sum", target).split()[0]
            if actual != digest(path.read_bytes()):
                raise RuntimeError("Copied data digest did not match")
            contents[path.name] = actual
        return contents

    def volume(self, role):
        name = f"r3-{role}"
        pv = object_("v1", "PersistentVolume", name, spec={
            "capacity": {"storage": "16Mi"}, "volumeMode": "Filesystem", "accessModes": ["ReadWriteOnce"],
            "persistentVolumeReclaimPolicy": "Retain", "storageClassName": "r3-local",
            "local": {"path": VOLUME_PATH},
            "nodeAffinity": {"required": {"nodeSelectorTerms": [{"matchExpressions": [{
                "key": "kubernetes.io/hostname", "operator": "In", "values": [self.nodes[role]],
            }]}]}},
            "claimRef": {"namespace": NAMESPACE, "name": name},
        })
        pvc = object_("v1", "PersistentVolumeClaim", name, spec={
            "volumeName": name, "storageClassName": "r3-local", "accessModes": ["ReadWriteOnce"],
            "resources": {"requests": {"storage": "16Mi"}},
        })
        self.apply(pv, pvc)

    def pod(self, name, worker, claim, serve=True):
        pod = object_("v1", "Pod", name, spec={
            "nodeSelector": {LABEL: worker},
            "automountServiceAccountToken": False,
            "containers": [{
                "name": "app", "image": APP_IMAGE, "command": ["python", "-u", "/code/app.py"],
                "ports": [{"containerPort": 8080}],
                "readinessProbe": {"httpGet": {"path": "/readyz", "port": 8080}, "periodSeconds": 1},
                "env": [{"name": key, "valueFrom": {"fieldRef": {"fieldPath": field}}} for key, field in (
                    ("POD_UID", "metadata.uid"), ("NODE_NAME", "spec.nodeName"),
                )],
                "volumeMounts": [
                    {"name": "app", "mountPath": "/code", "readOnly": True},
                    {"name": "data", "mountPath": "/data", "readOnly": True},
                ],
            }],
            "volumes": [
                {"name": "app", "configMap": {"name": "r3-app"}},
                {"name": "data", "persistentVolumeClaim": {"claimName": claim, "readOnly": True}},
            ],
        })
        if serve:
            pod["metadata"]["labels"] = {"app": "r3"}
        self.apply(pod)

    def stop_worker_a(self):
        node = self.owned_node("a")
        run("docker", "stop", "--time", "1", node, timeout=20)
        running = run("docker", "inspect", "--format", "{{.State.Running}}", node)
        if running != "false":
            raise RuntimeError("The owned A worker container is still running")
        return {"node": node, "docker_running": False}

    def node_ready(self, role):
        node = self.get("node", self.nodes[role])
        return next(c["status"] for c in node["status"]["conditions"] if c["type"] == "Ready")

    def snapshot(self, role):
        name = f"r3-{role}"
        pod = self.get("-n", NAMESPACE, "pod", name)
        claim = self.get("-n", NAMESPACE, "pvc", name)
        pv = self.get("pv", claim["spec"]["volumeName"])
        service = self.get("-n", NAMESPACE, "service", "r3-entry")
        slices = self.get("-n", NAMESPACE, "endpointslices", "-l", "kubernetes.io/service-name=r3-entry")
        return {
            "pod": {"uid": pod["metadata"]["uid"], "node": pod["spec"].get("nodeName"), "phase": pod["status"]["phase"]},
            "claim": {"uid": claim["metadata"]["uid"], "phase": claim["status"]["phase"], "volume": claim["spec"]["volumeName"]},
            "pv": {"uid": pv["metadata"]["uid"], "node_affinity": pv["spec"]["nodeAffinity"],
                   "local_path": pv["spec"]["local"]["path"]},
            "service": {"uid": service["metadata"]["uid"], "node_port": service["spec"]["ports"][0]["nodePort"],
                        "external_traffic_policy": service["spec"]["externalTrafficPolicy"]},
            "endpoints": [
                {"uid": endpoint.get("targetRef", {}).get("uid"), "node": endpoint.get("nodeName"),
                 "ready": endpoint.get("conditions", {}).get("ready")}
                for item in slices["items"] for endpoint in item["endpoints"]
            ],
        }

    def blocked_claim(self):
        pod = self.get("-n", NAMESPACE, "pod", "old-claim-on-b")
        condition = next((c for c in pod["status"].get("conditions", []) if c["type"] == "PodScheduled"), {})
        events = self.get("-n", NAMESPACE, "events", "--field-selector", "involvedObject.name=old-claim-on-b")
        messages = [event["message"] for event in events["items"] if event["reason"] == "FailedScheduling"]
        if pod["status"]["phase"] == "Pending" and condition.get("reason") == "Unschedulable" and any(
            "volume node affinity" in msg.lower() or "persistentvolume" in msg.lower() and "node affinity" in msg.lower()
            for msg in messages
        ):
            return {
                "uid": pod["metadata"]["uid"], "phase": pod["status"]["phase"],
                "node": pod["spec"].get("nodeName"), "selector": pod["spec"]["nodeSelector"],
                "claim": pod["spec"]["volumes"][1]["persistentVolumeClaim"]["claimName"],
                "reason": condition["reason"], "messages": messages,
            }

    def cleanup(self):
        if self.started:
            run("kind", "delete", "cluster", "--name", self.name, timeout=100)
            if run("docker", "ps", "-aq", "--filter", f"label=io.x-k8s.kind.cluster={self.name}"):
                raise RuntimeError("Owned kind containers were left behind")


def wait_for(action, timeout=90):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        value = action()
        if value:
            return value
        time.sleep(0.5)
    raise RuntimeError(f"Timed out waiting for {action.__name__}")


class Probes:
    def __init__(self, port, clock):
        self.port = port
        self.clock = clock
        self.rows = []
        self.stop = threading.Event()
        self.lock = threading.Lock()
        self.thread = threading.Thread(target=self.sample)

    def request(self, path, request_id, tenant="A"):
        started = self.clock()
        with closing(http.client.HTTPConnection("127.0.0.1", self.port, timeout=0.7)) as client:
            try:
                client.request("GET", path, headers={"X-Lab-Tenant": tenant, "X-Request-ID": request_id})
                response = client.getresponse()
                content = response.read()
                observed = {
                    "status": response.status, "echo": response.getheader("X-Request-ID"),
                    "node": response.getheader("X-Lab-Node"), "pod_uid": response.getheader("X-Lab-Pod-UID"),
                    "body": content.decode("utf-8", errors="replace"), "sha256": digest(content),
                }
            except (OSError, http.client.HTTPException) as error:
                observed = {"status": None, "error": type(error).__name__}
        return {"request_id": request_id, "started_ms": started, "ended_ms": self.clock(), **observed}

    def sample(self):
        count = 0
        while not self.stop.is_set():
            count += 1
            row = {"trial": count,
                   "report": self.request("/reports/R3", f"{count}-report"),
                   "attachment": self.request("/attachments/object-v3", f"{count}-attachment")}
            with self.lock:
                self.rows.append(row)
            self.stop.wait(PROBE_INTERVAL)

    def start(self):
        self.thread.start()

    def finish(self):
        self.stop.set()
        if self.thread.ident is not None:
            self.thread.join(timeout=4)
            if self.thread.is_alive():
                raise RuntimeError("Client probe thread did not stop")

    def stable(self, pod, since):
        tail = []
        with self.lock:
            samples = self.rows.copy()
        for trial in samples:
            report, attachment = trial["report"], trial["attachment"]
            if report["started_ms"] < since:
                continue
            if all(
                row["status"] == 200 and row.get("echo") == row["request_id"] and
                row.get("node") == pod["node"] and row.get("pod_uid") == pod["uid"]
                for row in (report, attachment)
            ) and json.loads(report["body"]) == FIXTURE and attachment["sha256"] == FIXTURE["sha256"]:
                tail.append(trial)
            else:
                tail.clear()
            if len(tail) == STABLE_COUNT:
                return tail


def demonstrate(root):
    start = time.monotonic_ns()

    def clock():
        return (time.monotonic_ns() - start) // 1_000_000

    cluster = Cluster(root)
    probes = Probes(cluster.host_port, clock)
    try:
        files = seed_backup(root)
        cluster.create()
        cluster.apply(
            object_("storage.k8s.io/v1", "StorageClass", "r3-local",
                    provisioner="kubernetes.io/no-provisioner", volumeBindingMode="WaitForFirstConsumer"),
            object_("v1", "ConfigMap", "r3-app", data={"app.py": APP}),
            object_("v1", "Service", "r3-entry", spec={
                "type": "NodePort", "externalTrafficPolicy": "Cluster", "selector": {"app": "r3"},
                "ports": [{"port": 80, "targetPort": 8080, "nodePort": NODE_PORT}],
            }),
        )
        a_files = cluster.copy_data("a", files)
        cluster.volume("a")
        cluster.pod("r3-a", "a", "r3-a")
        probes.start()
        cluster.k("-n", NAMESPACE, "wait", "pod/r3-a", "--for=condition=Ready", "--timeout=150s", timeout=160)
        before = cluster.snapshot("a")
        first = wait_for(lambda: probes.stable(before["pod"], 0))
        forbidden = probes.request("/reports/R3", "wrong-tenant", tenant="B")

        fault_ms = clock()
        loss = cluster.stop_worker_a()
        loss["stopped_ms"] = clock()
        cluster.pod("old-claim-on-b", "b", "r3-a", serve=False)
        blocked = wait_for(cluster.blocked_claim)
        blocked["at_ms"] = clock()

        b_files = cluster.copy_data("b", files)
        restored_ms = clock()
        cluster.volume("b")
        cluster.pod("r3-b", "b", "r3-b")
        cluster.k("-n", NAMESPACE, "wait", "pod/r3-b", "--for=condition=Ready", "--timeout=150s", timeout=160)
        def unavailable_a():
            value = cluster.node_ready("a")
            return value if value in {"Unknown", "False"} else None

        loss["node_ready"] = wait_for(unavailable_a)
        loss["node_not_ready_ms"] = clock()

        def ready_on_b():
            state = cluster.snapshot("b")
            ready = [(ep["uid"], ep["node"]) for ep in state["endpoints"] if ep["ready"]]
            if ready == [(state["pod"]["uid"], cluster.nodes["b"])]:
                return state

        after = wait_for(ready_on_b)
        b_route_ms = clock()
        final = wait_for(lambda: probes.stable(after["pod"], b_route_ms))
        probes.finish()
        return {
            "nodes": cluster.nodes, "entry": f"http://127.0.0.1:{cluster.host_port}",
            "before": before, "before_trials": [r["trial"] for r in first], "wrong_tenant": forbidden,
            "fault_ms": fault_ms, "loss": loss, "blocked": blocked, "restored_ms": restored_ms,
            "backup_files": {"a": a_files, "b": b_files}, "after": after, "b_route_ms": b_route_ms,
            "stable_trials": [r["trial"] for r in final],
            "local_elapsed_ms": final[-1]["attachment"]["ended_ms"] - fault_ms,
            "reads": probes.rows,
        }
    finally:
        try:
            probes.finish()
        finally:
            cluster.cleanup()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="infra-r3-kind-") as directory:
        result = demonstrate(Path(directory))
    record = {
        "schema": 1, "status": "observed", "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_sha256": digest(Path(__file__).read_bytes()),
        "toolchain": {"kind": KIND, "kubectl": KUBECTL, "node_image": NODE_IMAGE, "app_image": APP_IMAGE,
                      "platform": platform.platform(), "python": platform.python_version()},
        "scope": "Single Linux host, kind worker container stopped, native local PV and NodePort, one synthetic report readback",
        "fixture": FIXTURE, "probe_interval_seconds": PROBE_INTERVAL, "stable_count": STABLE_COUNT,
        "cleanup": {"owned_kind_nodes_remaining": 0},
        "observation": result,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
