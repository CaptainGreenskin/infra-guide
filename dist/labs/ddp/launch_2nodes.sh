#!/usr/bin/env bash
# Run on BOTH nodes with NODE_RANK=0 / NODE_RANK=1. No machines are provisioned.
set -euo pipefail
: "${NODE_RANK:?Set NODE_RANK=0 on node A, 1 on node B}"
: "${MASTER_ADDR:?Set MASTER_ADDR to node A private IP on both nodes}"
: "${TRAIN_OUT:?Set TRAIN_OUT to a dedicated shared POSIX directory}"
if [[ "$NODE_RANK" != 0 && "$NODE_RANK" != 1 ]]; then
  echo 'NODE_RANK must be 0 or 1' >&2; exit 2
fi
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec torchrun --nnodes=2 --nproc-per-node=2 --node-rank="$NODE_RANK" \
  --master-addr="$MASTER_ADDR" --master-port="${MASTER_PORT:-29500}" \
  --max-restarts=0 "$script_dir/train_ddp.py" --device=cuda \
  --epochs=4 --batch-size=64 --accum=2 --save-dir="$TRAIN_OUT" "$@"
