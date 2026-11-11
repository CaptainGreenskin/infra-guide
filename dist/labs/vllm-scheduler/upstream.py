"""Fetch and load intact, hash-pinned vLLM definitions without installing vLLM."""
import argparse
import ast
import contextlib
import copy
import dataclasses
import enum
import functools
import hashlib
import heapq
import itertools
import json
import logging
import os
import pickle
from pathlib import Path
import sys
import time
from abc import ABC, abstractmethod
from collections import defaultdict, deque, OrderedDict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import asdict, astuple, dataclass, fields
from functools import partial
from math import prod
from types import ModuleType
from typing import Generic, NewType, Optional, TypeVar, Union, overload
from urllib.request import Request as HttpRequest, urlopen

COMMIT = "01efc7ef781391e744ed08c3292817a773d654e6"
ROOT = Path(__file__).resolve().parent


def manifest():
    data = json.loads((ROOT / "source-manifest.json").read_text())
    if (data["repository"], data["version"], data["commit"]) != ("vllm-project/vllm", "v0.10.2", COMMIT):
        raise ValueError("unexpected source manifest")
    return data


def verify(raw, entry):
    blob = b"blob " + str(len(raw)).encode() + b"\0" + raw
    if (len(raw) != entry["bytes"] or hashlib.sha256(raw).hexdigest() != entry["sha256"]
            or hashlib.sha1(blob).hexdigest() != entry["git_blob_sha1"]):
        raise ValueError("upstream bytes differ: " + entry["path"])


def download(dest):
    dest.mkdir(parents=True, exist_ok=True)
    for entry in manifest()["files"]:
        target = dest / entry["name"]
        if target.exists():
            verify(target.read_bytes(), entry)
            continue
        url = f'https://raw.githubusercontent.com/vllm-project/vllm/{COMMIT}/{entry["path"]}'
        request = HttpRequest(url, headers={"User-Agent": "InfraGuide-source-fetch"})
        with urlopen(request, timeout=30) as response:
            raw = response.read()
        verify(raw, entry)
        target.write_bytes(raw)
        print("verified", entry["name"])


def node_name(node):
    if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
        return node.targets[0].id
    if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
        return node.target.id
    return getattr(node, "name", None)


def load_pinned(source_dir):
    import msgspec

    # No scheduling/cache functions are replaced. The compatibility decorator
    # only registers symbols for vLLM's linting; there is no package linter here.
    module = ModuleType("_infraguide_pinned_vllm")
    sys.modules[module.__name__] = module
    names = module.__dict__
    names.update({
        "ABC": ABC, "abstractmethod": abstractmethod, "Generic": Generic,
        "NewType": NewType, "TypeVar": TypeVar, "Optional": Optional,
        "Union": Union, "overload": overload, "Iterable": Iterable,
        "Mapping": Mapping, "Sequence": Sequence, "asdict": asdict,
        "astuple": astuple, "dataclass": dataclass, "fields": fields,
        "defaultdict": defaultdict, "deque": deque, "OrderedDict": OrderedDict,
        "prod": prod, "partial": partial, "contextlib": contextlib,
        "copy": copy, "dataclasses": dataclasses, "functools": functools,
        "enum": enum, "Enum": enum.Enum, "hashlib": hashlib,
        "heapq": heapq, "itertools": itertools, "os": os, "pickle": pickle,
        "time": time, "msgspec": msgspec, "logger": logging.getLogger(module.__name__),
        "MULTIMODAL_REGISTRY": None,  # the text-only fixture passes its registry explicitly
        "bc_linter_include": lambda cls: cls,
    })
    loaded = []
    for entry in manifest()["files"]:
        source = source_dir / entry["name"]
        raw = source.read_bytes()
        verify(raw, entry)
        lines = raw.decode().splitlines()
        expected = {row["name"]: row for row in entry["definitions"]}
        nodes = []
        observed = []
        for node in ast.parse(raw).body:
            name = node_name(node)
            if name not in expected:
                continue
            first = min([node.lineno] + [d.lineno for d in getattr(node, "decorator_list", [])])
            span = ("\n".join(lines[first - 1:node.end_lineno]) + "\n").encode()
            observed.append({"name": name, "first_line": first, "last_line": node.end_lineno,
                             "sha256": hashlib.sha256(span).hexdigest()})
            nodes.append(node)
        if observed != entry["definitions"]:
            raise ValueError("definition inventory differs: " + entry["path"])
        future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
        program = ast.Module(body=[future, *nodes], type_ignores=[])
        exec(compile(ast.fix_missing_locations(program), str(source), "exec"), names)
        loaded.append({"file": entry["name"], "sha256": entry["sha256"],
                       "definitions": [row["name"] for row in observed]})
    return module, loaded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dest", required=True, type=Path)
    args = parser.parse_args()
    download(args.dest)


if __name__ == "__main__":
    main()
