"""Compare Kubernetes Eviction, direct deletion, and rollout in an owned kind cluster."""

import argparse
import base64
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import platform
import ssl
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPSHandler, ProxyHandler, Request, build_opener
import uuid


NODE = "kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0"
IMAGE = "python:3.13.7-alpine3.22@sha256:9ba6d8cbebf0fb6546ae71f2a1c14f6ffd2fdab83af7fa5669734ef30ad48844"
LABELS = {"app": "reports"}
NS = "pdb-lab"
PODS = f"/api/v1/namespaces/{NS}/pods"
DEPLOYMENT = f"/apis/apps/v1/namespaces/{NS}/deployments/reports"
BUDGET = f"/apis/policy/v1/namespaces/{NS}/poddisruptionbudgets/reports"


def run(*args, data=None, timeout=45):
    result = subprocess.run(args, input=data, text=True, capture_output=True, timeout=timeout,
                            env={**os.environ, "KIND_EXPERIMENTAL_PROVIDER": "docker"})
    if result.returncode:
        raise RuntimeError(f"{args[:4]}: {result.stderr.strip()} {result.stdout.strip()}")
    return result.stdout


class Cluster:
    def __init__(self, name, folder):
        self.name = name
        self.folder = folder
        self.config = folder / "kubeconfig"

    def kube(self, *args, data=None):
        return run("kubectl", "--kubeconfig", str(self.config), "--context", f"kind-{self.name}",
                   *args, data=data)

    def open_api(self):
        config = json.loads(self.kube("config", "view", "--raw", "--flatten", "--minify", "-o", "json"))
        cluster = config["clusters"][0]["cluster"]
        user = config["users"][0]["user"]
        self.server = cluster["server"]
        endpoint = urlsplit(self.server)
        assert endpoint.scheme == "https" and ipaddress.ip_address(endpoint.hostname).is_loopback
        self.tls = ssl.create_default_context(
            cadata=base64.b64decode(cluster["certificate-authority-data"]).decode()
        )
        cert, key = self.folder / "client-cert", self.folder / "client-key"
        cert.write_bytes(base64.b64decode(user["client-certificate-data"]))
        key.touch(mode=0o600)
        key.write_bytes(base64.b64decode(user["client-key-data"]))
        self.tls.load_cert_chain(cert, key)
        self.http = build_opener(ProxyHandler({}), HTTPSHandler(context=self.tls))

    def request(self, path, method="GET", body=None, content="application/json"):
        payload = json.dumps(body).encode() if body is not None else None
        request = Request(self.server + path, data=payload, method=method,
                          headers={"Content-Type": content, "Accept": "application/json"})
        try:
            with self.http.open(request, timeout=10) as response:
                return response.status, json.load(response)
        except HTTPError as response:
            return response.code, json.load(response)

    def get(self, path):
        code, body = self.request(path)
        assert code == 200, (code, body)
        return body

    def snapshot(self):
        listed = self.get(PODS + "?labelSelector=app%3Dreports")
        deployment = self.get(DEPLOYMENT)
        pdb = self.get(BUDGET)
        pods = [{
            "name": pod["metadata"]["name"],
            "uid": pod["metadata"]["uid"],
            "owner": pod["metadata"]["ownerReferences"][0]["name"],
            "version": pod["metadata"]["labels"]["lab-version"],
            "phase": pod["status"].get("phase"),
            "ready": any(c["type"] == "Ready" and c["status"] == "True"
                         for c in pod["status"].get("conditions", [])),
            "deleting": "deletionTimestamp" in pod["metadata"],
        } for pod in listed["items"]]
        return {
            "pods": sorted(pods, key=lambda pod: pod["name"]),
            "deployment": {
                "generation": deployment["metadata"]["generation"],
                "observedGeneration": deployment["status"].get("observedGeneration"),
                "replicas": deployment["spec"]["replicas"],
                "availableReplicas": deployment["status"].get("availableReplicas", 0),
                "updatedReplicas": deployment["status"].get("updatedReplicas", 0),
                "templateVersion": deployment["spec"]["template"]["metadata"]["labels"]["lab-version"],
                **deployment["spec"]["strategy"]["rollingUpdate"],
            },
            "pdb": {
                "generation": pdb["metadata"]["generation"],
                "minAvailable": pdb["spec"]["minAvailable"],
                **pdb.get("status", {}),
            },
        }

    def settle(self, ready, minimum, *, version="v1", removed=None):
        deadline = time.monotonic() + 100
        while time.monotonic() < deadline:
            snap = self.snapshot()
            pods, dep, pdb = snap["pods"], snap["deployment"], snap["pdb"]
            if (len(pods) == 3 and all(not pod["deleting"] and pod["phase"] == "Running" for pod in pods)
                    and sum(pod["ready"] for pod in pods) == ready
                    and dep["templateVersion"] == version and dep["generation"] == dep["observedGeneration"]
                    and dep["availableReplicas"] == ready and dep["updatedReplicas"] == (3 if version == "v1" else 1)
                    and pdb.get("observedGeneration") == pdb["generation"]
                    and pdb.get("expectedPods") == 3 and pdb.get("currentHealthy") == ready
                    and pdb.get("desiredHealthy") == minimum and pdb["minAvailable"] == minimum
                    and pdb.get("disruptionsAllowed") == max(0, ready - minimum)
                    and not pdb.get("disruptedPods")
                    and all(pod["uid"] != removed for pod in pods)):
                if version == "v1" and any(pod["version"] != "v1" for pod in pods):
                    continue
                if version == "v2" and sorted((p["version"], p["ready"]) for p in pods) != [
                    ("v1", True), ("v1", True), ("v2", False)
                ]:
                    continue
                return snap
            time.sleep(0.8)
        raise RuntimeError(f"did not converge: {json.dumps(snap, ensure_ascii=False)}")

    def action(self, pod, method, *, evict=False):
        options = {"preconditions": {"uid": pod["uid"]}}
        path = f"{PODS}/{pod['name']}"
        body = options
        if evict:
            path += "/eviction"
            body = {"apiVersion": "policy/v1", "kind": "Eviction",
                    "metadata": {"name": pod["name"], "namespace": NS}, "deleteOptions": options}
        status, result = self.request(path, method, body)
        return {"method": method, "path": path, "pod": pod, "request": body,
                "http_status": status, "response": result}


def template(version):
    command = "touch /tmp/ready; exec sleep 3600" if version == "v1" else "exec sleep 3600"
    return {
        "metadata": {"labels": {**LABELS, "lab-version": version}},
        "spec": {"terminationGracePeriodSeconds": 2, "containers": [{
            "name": "reports", "image": IMAGE, "imagePullPolicy": "IfNotPresent",
            "command": ["sh", "-ec", command],
            "readinessProbe": {"exec": {"command": ["test", "-f", "/tmp/ready"]}, "periodSeconds": 1},
        }]},
    }


def initial_manifest():
    return {"apiVersion": "v1", "kind": "List", "items": [
        {"apiVersion": "v1", "kind": "Namespace", "metadata": {"name": NS}},
        {"apiVersion": "apps/v1", "kind": "Deployment", "metadata": {"name": "reports", "namespace": NS},
         "spec": {"replicas": 3, "selector": {"matchLabels": LABELS}, "template": template("v1"),
                  "strategy": {"type": "RollingUpdate", "rollingUpdate": {"maxSurge": 0, "maxUnavailable": 1}}}},
        {"apiVersion": "policy/v1", "kind": "PodDisruptionBudget",
         "metadata": {"name": "reports", "namespace": NS},
         "spec": {"minAvailable": 2, "selector": {"matchLabels": LABELS}}},
    ]}


def require_blocked(action):
    result = action["response"]
    assert action["http_status"] == 429 and result["reason"] == "TooManyRequests"
    assert any(cause.get("reason") == "DisruptionBudget" for cause in result["details"]["causes"]), result


def execute(cluster, record):
    kind_version = run("kind", "version").strip()
    assert "v0.33.0" in kind_version
    run("kind", "create", "cluster", "--name", cluster.name, "--kubeconfig", str(cluster.config),
        "--image", NODE, "--wait", "150s", timeout=380)
    record["kind"] = kind_version
    versions = json.loads(cluster.kube("version", "-o", "json"))
    assert versions["serverVersion"]["gitVersion"] == versions["clientVersion"]["gitVersion"] == "v1.35.8"
    record["versions"] = versions
    cluster.open_api()
    record["manifest"] = initial_manifest()
    cluster.kube("apply", "-f", "-", data=json.dumps(record["manifest"]))

    record["initial"] = initial = cluster.settle(3, 2)
    first = initial["pods"][0]
    record["allowed_eviction"] = allowed = cluster.action(first, "POST", evict=True)
    assert allowed["http_status"] in (200, 201) and allowed["response"]["status"] == "Success", allowed
    record["after_eviction"] = cluster.settle(3, 2, removed=first["uid"])

    code, response = cluster.request(BUDGET, "PATCH", {"spec": {"minAvailable": 3}},
                                     "application/merge-patch+json")
    assert code == 200 and response["spec"]["minAvailable"] == 3, (code, response)
    record["strict"] = strict = cluster.settle(3, 3)
    target = strict["pods"][0]
    record["blocked_eviction"] = blocked = cluster.action(target, "POST", evict=True)
    require_blocked(blocked)
    pod = cluster.get(f"{PODS}/{target['name']}")
    assert pod["metadata"]["uid"] == target["uid"] and "deletionTimestamp" not in pod["metadata"]
    record["still_present_after_rejection"] = pod["metadata"]["uid"]
    record["direct_delete"] = deletion = cluster.action(target, "DELETE")
    assert deletion["http_status"] in (200, 202), deletion
    record["before_rollout"] = cluster.settle(3, 3, removed=target["uid"])

    code, response = cluster.request(DEPLOYMENT, "PATCH", {"spec": {"template": template("v2")}},
                                     "application/merge-patch+json")
    assert code == 200 and response["spec"]["template"]["metadata"]["labels"]["lab-version"] == "v2"
    record["stalled_rollout"] = stalled = cluster.settle(2, 3, version="v2")
    remaining = next(pod for pod in stalled["pods"] if pod["ready"])
    record["blocked_during_rollout"] = blocked_during = cluster.action(remaining, "POST", evict=True)
    require_blocked(blocked_during)
    record["undo_command"] = cluster.kube("-n", NS, "rollout", "undo", "deployment/reports").strip()
    record["after_undo"] = cluster.settle(3, 3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("validation.json"))
    args = parser.parse_args()
    assert platform.system() == "Linux", "Use a Linux Docker host"
    assert not os.environ.get("DOCKER_HOST"), "DOCKER_HOST overrides are not accepted"
    docker_context = run("docker", "context", "show").strip()
    assert docker_context == "default", "Use the local default Docker context"
    endpoint = json.loads(run("docker", "context", "inspect", docker_context))[0]["Endpoints"]["docker"]["Host"]
    assert endpoint == "unix:///var/run/docker.sock", "Only the local Docker socket is accepted"
    run("docker", "info", "--format", "{{.ServerVersion}}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    record = {"status": "failed", "node_image": NODE, "workload_image": IMAGE,
              "environment": {"system": platform.system(), "machine": platform.machine(),
                              "python": platform.python_version()},
              "source_sha256": {Path(__file__).name: hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}}
    with tempfile.TemporaryDirectory(prefix="pdb-rollout-") as temp:
        cluster = Cluster(f"guide-pdb-{uuid.uuid4().hex[:10]}", Path(temp))
        try:
            execute(cluster, record)
            record["status"] = "passed"
        finally:
            try:
                run("kind", "delete", "cluster", "--name", cluster.name,
                    "--kubeconfig", str(cluster.config), timeout=90)
                assert cluster.name not in run("kind", "get", "clusters").splitlines()
                record["cluster_cleaned"] = True
            except Exception:
                record["status"] = "failed"
                raise
            finally:
                args.output.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
