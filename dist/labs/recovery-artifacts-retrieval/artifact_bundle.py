"""Actual CPU/Safetensors bundles: byte integrity, shape, semantic contract and pointer CAS."""
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile

import safetensors
from safetensors.torch import save_file, load as load_tensor_bytes
import torch
from torch import nn

MEMBERS = {"model.json", "tokenizer.json", "weights.safetensors"}


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Toy(nn.Module):
    def __init__(self):
        super().__init__()
        self.embedding = nn.Embedding(3, 1)
        self.readout = nn.Linear(1, 1)

    def forward(self, ids):
        return self.readout(self.embedding(ids))


def make_bundle(root, version, swap_vocab=False, swap_rows=False):
    folder = root / version
    folder.mkdir()
    model = Toy()
    with torch.no_grad():
        model.embedding.weight.copy_(torch.tensor([[2.], [1.], [0.]]) if swap_rows else torch.tensor([[1.], [2.], [0.]]))
        model.readout.weight.fill_(1)
        model.readout.bias.zero_()
    save_file({k: v.detach().contiguous() for k, v in model.state_dict().items()}, str(folder / "weights.safetensors"))
    (folder / "model.json").write_text(json.dumps({"architecture": "toy-v1", "vocab_size": 3, "width": 1}, sort_keys=True))
    vocab = {"A": 1 if swap_vocab else 0, "B": 0 if swap_vocab else 1, "<unk>": 2}
    (folder / "tokenizer.json").write_text(json.dumps(vocab, sort_keys=True))
    manifest = {"format": "toy-bundle-v1", "version": version,
                "runtime": {"torch": torch.__version__, "safetensors": safetensors.__version__,
                            "loader_sha256": digest(Path(__file__).read_bytes())},
                "files": {name: {"bytes": (folder/name).stat().st_size, "sha256": digest((folder/name).read_bytes())}
                          for name in sorted(MEMBERS)}}
    (folder / "manifest.json").write_text(json.dumps(manifest, sort_keys=True))
    return folder


def load_bundle(folder):
    manifest_bytes = (folder / "manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest["format"] != "toy-bundle-v1" or set(manifest["files"]) != MEMBERS:
        raise ValueError("bundle_members_or_format")
    if manifest["runtime"] != {"torch": torch.__version__, "safetensors": safetensors.__version__,
                              "loader_sha256": digest(Path(__file__).read_bytes())}:
        raise ValueError("runtime_contract")
    # Keep the verified bytes. Deserialization does not reopen a changeable path.
    verified = {}
    for name, expected in manifest["files"].items():
        path = folder / name
        if path.is_symlink() or path.stat().st_size > 65536:
            raise ValueError("fixture_file_policy")
        value = path.read_bytes()
        if len(value) != expected["bytes"] or digest(value) != expected["sha256"]:
            raise ValueError("member_digest_mismatch")
        verified[name] = value
    if json.loads(verified["model.json"]) != {"architecture": "toy-v1", "vocab_size": 3, "width": 1}:
        raise ValueError("architecture_contract")
    vocab = json.loads(verified["tokenizer.json"])
    if set(vocab) != {"A", "B", "<unk>"} or any(type(v) is not int for v in vocab.values()) or set(vocab.values()) != {0, 1, 2}:
        raise ValueError("vocabulary_shape")
    model = Toy()
    state = load_tensor_bytes(verified["weights.safetensors"])
    model.load_state_dict(state, strict=True)
    model.eval()
    return {"version": manifest["version"], "manifest_sha256": digest(manifest_bytes),
            "model": model, "vocab": vocab, "files": manifest["files"],
            "tensor_shapes": {k: list(v.shape) for k, v in state.items()}}


def predict(bundle, text):
    identity = bundle["vocab"].get(text, bundle["vocab"]["<unk>"])
    with torch.no_grad():
        return bundle["model"](torch.tensor([identity])).item()


def gate(bundle):
    values = {text: predict(bundle, text) for text in ["A", "B", "?"]}
    expected = {"A": 1., "B": 2., "?": 0.}
    return {"outputs": values, "passed": all(abs(values[k]-expected[k]) < 1e-8 for k in expected)}


def pointer(db):
    version, generation, sha = db.execute("SELECT version,generation,manifest_sha FROM route WHERE id=1").fetchone()
    return {"version": version, "generation": generation, "manifest_sha256": sha}


def activate(db, expected, candidate):
    if not gate(candidate)["passed"]:
        return "semantic_gate_rejected"
    with db:
        changed = db.execute("UPDATE route SET version=?,generation=generation+1,manifest_sha=? "
                             "WHERE id=1 AND version=? AND generation=? AND manifest_sha=?",
                             (candidate["version"], candidate["manifest_sha256"], expected["version"],
                              expected["generation"], expected["manifest_sha256"])).rowcount
    return "activated" if changed else "stale_pointer"


def main():
    torch.set_num_threads(1)
    with tempfile.TemporaryDirectory(prefix="infra-bundle-") as temporary:
        root = Path(temporary)
        paths = {"r17": make_bundle(root, "r17"), "r18": make_bundle(root, "r18", True, False),
                 "r19": make_bundle(root, "r19", True, True)}
        bundles = {name: load_bundle(path) for name, path in paths.items()}
        assert bundles["r17"]["tensor_shapes"] == bundles["r18"]["tensor_shapes"] == bundles["r19"]["tensor_shapes"]
        assert gate(bundles["r17"])["passed"] and not gate(bundles["r18"])["passed"] and gate(bundles["r19"])["passed"]
        db = sqlite3.connect(root / "route.db")
        db.execute("CREATE TABLE route(id INT PRIMARY KEY,version TEXT,generation INT,manifest_sha TEXT)")
        db.execute("INSERT INTO route VALUES(1,'r17',1,?)", (bundles["r17"]["manifest_sha256"],))
        db.commit()
        initial = pointer(db)
        bad_candidate = activate(db, initial, bundles["r18"])
        assert bad_candidate == "semantic_gate_rejected" and pointer(db) == initial
        in_flight = bundles["r17"]
        assert activate(db, initial, bundles["r19"]) == "activated"
        after_switch = pointer(db)
        stale = activate(db, initial, bundles["r17"])
        assert stale == "stale_pointer" and pointer(db) == after_switch
        mixed = {"model": bundles["r19"]["model"], "vocab": bundles["r17"]["vocab"]}
        assert not gate(mixed)["passed"]
        broken = root / "broken-r17"
        shutil.copytree(paths["r17"], broken)
        (broken / "tokenizer.json").unlink()
        missing_rejected = False
        try:
            load_bundle(broken)
        except FileNotFoundError:
            missing_rejected = True
        assert missing_rejected and pointer(db) == after_switch
        tampered = root / "tampered-r17"
        shutil.copytree(paths["r17"], tampered)
        weights = tampered / "weights.safetensors"
        value = bytearray(weights.read_bytes())
        value[-1] ^= 1
        weights.write_bytes(value)
        tamper_rejected = False
        try:
            load_bundle(tampered)
        except ValueError as error:
            tamper_rejected = str(error) == "member_digest_mismatch"
        assert tamper_rejected
        assert activate(db, after_switch, load_bundle(paths["r17"])) == "activated"
        after_rollback = pointer(db)
        assert after_switch["version"] == "r19" and after_switch["generation"] == 2
        assert after_rollback["version"] == "r17" and after_rollback["generation"] == 3
        report = {"torch": torch.__version__, "safetensors": safetensors.__version__, "device": "cpu",
                  "bundle_members": sorted(MEMBERS), "tensor_shapes": bundles["r17"]["tensor_shapes"],
                  "gates": {name: gate(bundle) for name, bundle in bundles.items()},
                  "r18_integrity_and_shapes_passed": True, "r18_activation": bad_candidate,
                  "initial_pointer": initial, "after_switch": after_switch,
                  "stale_publisher": stale, "mixed_bundle_gate": gate(mixed),
                  "in_flight_pinned_version": in_flight["version"], "in_flight_A": predict(in_flight, "A"),
                  "missing_rollback_member_rejected": missing_rejected, "tamper_rejected_before_tensor_load": tamper_rejected,
                  "after_rollback": after_rollback,
                  "scope": "actual_CPU_Safetensors_and_SQLite_pointer_fixture_not_LLM_quality_GPU_or_online_canary",
                  "limits": ["digests prove byte identity, not publisher trust or model usefulness",
                             "small fixture reads verified bytes into RAM; large models need appropriate immutable staging/loading",
                             "route CAS is local reference; no distributed load balancer or in-flight drain test",
                             "semantic labels A=1 B=2 are a fixed contract, not a real model benchmark"]}
        db.close()
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
