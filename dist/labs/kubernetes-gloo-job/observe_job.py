"""Build and observe an Indexed Job on a disposable two-worker kind cluster."""
import argparse
from contextlib import suppress
import hashlib
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import time
from uuid import uuid4


HERE = Path(__file__).resolve().parent
NODE_IMAGE = "kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0"
TRAINING_IMAGE = "infra-guide/kubernetes-gloo-job:v1"
SOURCES = ("Dockerfile", "job.json", "rank_step.py", "observe_job.py")
NAMESPACE = "infra-ddp"
JOB = "training-ddp"
CONFIG = """kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
- role: worker
- role: worker
"""


def run(*args, timeout=30):
    return subprocess.check_output(args, text=True, timeout=timeout)


def until(probe, seconds, description):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        result = probe()
        if result:
            return result
        time.sleep(.5)
    raise TimeoutError(description)


def pod_facts(pod):
    meta, status = pod["metadata"], pod["status"]
    scheduled = next((item for item in status.get("conditions", [])
                      if item["type"] == "PodScheduled"), {})
    return {
        "uid": meta["uid"], "pod": meta["name"],
        "index": int(meta["annotations"]["batch.kubernetes.io/job-completion-index"]),
        "owner_uid": next(owner["uid"] for owner in meta["ownerReferences"] if owner["controller"]),
        "node": pod["spec"].get("nodeName"), "phase": status["phase"],
        "hostname": pod["spec"]["hostname"], "ip": status.get("podIP"),
        "pod_scheduled": {k: scheduled.get(k) for k in ("status", "reason", "message")},
    }


def observe(k, cluster, image_id):
    def get(*args):
        return json.loads(k("get", *args, "-o", "json"))

    def pods():
        return sorted((pod_facts(pod) for pod in get("pods", "-n", NAMESPACE)["items"]),
                      key=lambda pod: pod["index"])

    nodes = get("nodes")["items"]
    workers = sorted(node["metadata"]["name"] for node in nodes
                     if "node-role.kubernetes.io/control-plane" not in node["metadata"]["labels"])
    assert len(workers) == 2, workers
    k("create", "namespace", NAMESPACE)
    k("label", "node", workers[0], "infraguide-role=ddp")
    k("apply", "-n", NAMESPACE, "-f", str(HERE / "job.json"))
    job_before = get("job", JOB, "-n", NAMESPACE)

    def one_blocked():
        current = pods()
        bound = [pod for pod in current if pod["node"] == workers[0]]
        blocked = [pod for pod in current if pod["node"] is None
                   and pod["pod_scheduled"]["status"] == "False"
                   and pod["pod_scheduled"]["reason"] == "Unschedulable"]
        if len(current) == 2 and len(bound) == len(blocked) == 1:
            return current

    before = until(one_blocked, 55, "Waiting for one bound Pod and one unschedulable Pod")
    k("label", "node", workers[1], "infraguide-role=ddp")

    def completed():
        job = get("job", JOB, "-n", NAMESPACE)
        conditions = {cond["type"]: cond for cond in job["status"].get("conditions", [])}
        if conditions.get("Failed", {}).get("status") == "True":
            raise RuntimeError(json.dumps(job["status"]))
        return job if conditions.get("Complete", {}).get("status") == "True" else None

    job = until(completed, 165, "Waiting for both ranks and Job Complete")
    after = pods()
    logs = [k("logs", "-n", NAMESPACE, pod["pod"]) for pod in after]
    rank_logs = [json.loads(next(line.removeprefix("TRAIN_STEP ") for line in log.splitlines()
                                if line.startswith("TRAIN_STEP "))) for log in logs]
    assert job["metadata"]["uid"] == job_before["metadata"]["uid"]
    return {
        "status": "passed",
        "source_sha256": {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in SOURCES},
        "environment": {"kind": run("kind", "version").strip(), "cluster": cluster,
                        "kubernetes": json.loads(k("version", "-o", "json"))["serverVersion"]["gitVersion"],
                        "kind_node_image": NODE_IMAGE, "trainer_image_id": image_id,
                        "github_sha": os.getenv("GITHUB_SHA"), "github_run_id": os.getenv("GITHUB_RUN_ID")},
        "control": {"initial_worker": workers[0], "newly_labeled_worker": workers[1]},
        "job": {"uid": job["metadata"]["uid"], "mode": job["spec"]["completionMode"],
                "succeeded": job["status"]["succeeded"],
                "completed_indexes": job["status"]["completedIndexes"],
                "conditions": job["status"]["conditions"]},
        "before": before, "after": after, "rank_logs": rank_logs,
    }


def main(output):
    cluster = "infra-gloo-" + uuid4().hex[:8]
    print(run("docker", "build", "-t", TRAINING_IMAGE, str(HERE), timeout=480), flush=True)
    image_id = run("docker", "image", "inspect", "--format={{.Id}}", TRAINING_IMAGE).strip()
    with TemporaryDirectory(prefix=cluster) as temporary:
        root = Path(temporary)
        kubeconfig, config = root / "kubeconfig", root / "kind.yaml"
        config.write_text(CONFIG)

        def k(*args):
            return run("kubectl", "--kubeconfig", str(kubeconfig), "--request-timeout=15s", *args)

        try:
            run("kind", "create", "cluster", "--name", cluster, "--config", str(config),
                "--image", NODE_IMAGE, "--wait", "120s", "--kubeconfig", str(kubeconfig), timeout=300)
            run("kind", "load", "docker-image", "--name", cluster, TRAINING_IMAGE, timeout=180)
            report = observe(k, cluster, image_id)
        except Exception:
            with suppress(Exception):
                print(k("get", "pods", "-n", NAMESPACE, "-o", "wide"), flush=True)
                print(k("describe", "pods", "-n", NAMESPACE), flush=True)
                print(k("logs", "-n", NAMESPACE, "-l", "app=training-ddp", "--prefix"), flush=True)
            raise
        finally:
            run("kind", "delete", "cluster", "--name", cluster, timeout=90)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(f"Recorded one blocked Pod, two cross-node ranks and completed Job at {output}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("runs/kubernetes-gloo-job.json"))
    main(parser.parse_args().output)
