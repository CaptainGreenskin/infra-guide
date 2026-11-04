"""A consistent local checkpoint for scalar SGD with momentum and random inputs.

This teaching protocol is not torch.distributed.checkpoint or an object store.
"""
import copy
import hashlib
import json
from pathlib import Path
import random
import tempfile

RUN = "scalar-demo"
CONFIG = {"lr": 0.05, "momentum": 0.9, "seed": 17}
FILES = ("model.json", "optimizer.json", "input.json")


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def tuple_tree(value):
    return tuple(tuple_tree(x) for x in value) if isinstance(value, list) else value


def initial():
    return {"step": 0, "w": 0.0, "velocity": 0.0, "cursor": 0,
            "rng": random.Random(CONFIG["seed"]).getstate()}


def advance(state, count):
    state = copy.deepcopy(state)
    rng = random.Random()
    rng.setstate(tuple_tree(state["rng"]))
    for _ in range(count):
        x = (state["cursor"] % 4 + 1) * rng.choice([0.9, 1.1])
        y = 2 * x
        gradient = (state["w"] * x - y) * x
        state["velocity"] = CONFIG["momentum"] * state["velocity"] + gradient
        state["w"] -= CONFIG["lr"] * state["velocity"]
        state["step"] += 1
        state["cursor"] += 1
    state["rng"] = rng.getstate()
    return state


def prepare(root, name, state):
    folder = root / name
    folder.mkdir()
    common = {"run": RUN, "step": state["step"], "config": CONFIG}
    parts = {"model.json": {"w": state["w"]},
             "optimizer.json": {"velocity": state["velocity"]},
             "input.json": {"cursor": state["cursor"], "rng": state["rng"]}}
    manifest = {**common, "files": {}}
    for filename, payload in parts.items():
        data = encoded({**common, **payload})
        (folder / filename).write_bytes(data)
        manifest["files"][filename] = {"bytes": len(data), "sha256": digest(data)}
    (folder / "manifest.json").write_bytes(encoded(manifest))
    return manifest


def validate(folder):
    manifest = json.loads((folder / "manifest.json").read_text())
    if set(manifest["files"]) != set(FILES) or manifest["config"] != CONFIG:
        raise ValueError("manifest_contract")
    parts = {}
    for filename in FILES:
        data = (folder / filename).read_bytes()
        expected = manifest["files"][filename]
        if len(data) != expected["bytes"] or digest(data) != expected["sha256"]:
            raise ValueError("file_integrity")
        part = json.loads(data)
        if any(part[k] != manifest[k] for k in ("run", "step", "config")):
            raise ValueError("mixed_generation")
        parts[filename] = part
    if manifest["run"] != RUN or parts["input.json"]["cursor"] != manifest["step"]:
        raise ValueError("progress_contract")
    return {"step": manifest["step"], "w": parts["model.json"]["w"],
            "velocity": parts["optimizer.json"]["velocity"],
            "cursor": parts["input.json"]["cursor"],
            "rng": tuple_tree(parts["input.json"]["rng"])}


def publish(root, name):
    validate(root / name)
    temporary = root / "CURRENT.tmp"
    temporary.write_text(name)
    temporary.replace(root / "CURRENT")  # Same local directory, not a durability proof.


def load(root):
    return validate(root / (root / "CURRENT").read_text())


def main():
    baseline = advance(initial(), 6)
    split = advance(initial(), 3)
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        prepare(root, "step-0", initial())
        publish(root, "step-0")
        # A partially written newer folder is not a committed checkpoint.
        partial = root / "partial-3"
        partial.mkdir()
        (partial / "model.json").write_bytes(encoded({"step": 3, "w": split["w"]}))
        assert load(root)["step"] == 0
        prepare(root, "step-3", split)
        publish(root, "step-3")
        resumed = advance(load(root), 3)
        assert resumed == baseline
        # Keep each file individually valid, but mix step 3 and step 4.
        prepare(root, "mixed", split)
        fourth = advance(split, 1)
        mixed_file = root / "mixed" / "optimizer.json"
        changed = json.loads(mixed_file.read_text())
        changed.update(step=4, velocity=fourth["velocity"])
        data = encoded(changed)
        mixed_file.write_bytes(data)
        manifest_path = root / "mixed" / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["files"]["optimizer.json"] = {"bytes": len(data), "sha256": digest(data)}
        manifest_path.write_bytes(encoded(manifest))
        try:
            publish(root, "mixed")
        except ValueError as error:
            mixed_error = str(error)
        else:
            raise AssertionError("mixed checkpoint accepted")
        assert mixed_error == "mixed_generation"
        assert (root / "CURRENT").read_text() == "step-3"
        prepare(root, "corrupt", split)
        with (root / "corrupt" / "model.json").open("ab") as stream:
            stream.write(b" ")
        try:
            publish(root, "corrupt")
        except ValueError as error:
            corrupt_error = str(error)
        else:
            raise AssertionError("corrupted checkpoint accepted")
        assert corrupt_error == "file_integrity"
    weights_only = initial()
    weights_only.update(w=split["w"], step=3, cursor=3)
    weights_only = advance(weights_only, 3)
    assert weights_only["w"] != baseline["w"]
    print(json.dumps({"continuous_steps": 6, "split_steps": [3, 3],
                      "partial_folder_loaded_step": 0,
                      "complete_state_exact_match": resumed == baseline,
                      "final_step": resumed["step"], "next_sample_cursor": resumed["cursor"],
                      "weight": resumed["w"], "velocity": resumed["velocity"],
                      "weights_only_weight": weights_only["w"],
                      "weights_only_match": weights_only["w"] == baseline["w"],
                      "mixed_generation": mixed_error, "corruption": corrupt_error,
                      "pointer_after_failed_publish": "step-3",
                      "scope": "scalar Python SGD, local files; no PyTorch, ranks, GPU or power-loss test"}))


if __name__ == "__main__":
    main()
