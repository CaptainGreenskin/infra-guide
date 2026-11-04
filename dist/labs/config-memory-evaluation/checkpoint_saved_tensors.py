"""Actual saved-tensor payload reference and non-reentrant recomputation on CPU."""
import copy
import json

import torch
from torch import nn
from torch.autograd.graph import saved_tensors_hooks
from torch.utils.checkpoint import checkpoint


class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(32, 64)
        self.second = nn.Linear(64, 32)
        self.calls = 0

    def forward(self, value):
        self.calls += 1
        return self.second(torch.nn.functional.gelu(self.first(value)))


def run(model, source, recompute):
    parameter_storages = {p.untyped_storage().data_ptr() for p in model.parameters()}
    storage_names, records = {}, []

    def pack(tensor):
        storage = tensor.untyped_storage()
        pointer = storage.data_ptr()
        name = storage_names.setdefault(pointer, "storage-" + str(len(storage_names)))
        records.append({"storage_id": name, "shape": list(tensor.shape), "dtype": str(tensor.dtype),
                        "storage_bytes": storage.nbytes(), "parameter_storage": pointer in parameter_storages})
        # Share payload without retaining the input Tensor's autograd graph in the packed object.
        return tensor.detach()

    def unpack(tensor):
        return tensor

    inputs = source.detach().clone().requires_grad_(True)
    with saved_tensors_hooks(pack, unpack):
        value = inputs
        for block in model:
            value = checkpoint(block, value, use_reentrant=False) if recompute else block(value)
        loss = value.square().mean()
    # Metadata only: do not keep extra tensor references in the observation list.
    before_backward = list(records)
    unique_non_parameter = {row["storage_id"]: row["storage_bytes"] for row in before_backward
                            if not row["parameter_storage"] and row["storage_bytes"] > 0}
    calls_before = [block.calls for block in model]
    loss.backward()
    gradients = torch.cat([p.grad.reshape(-1) for p in model.parameters()] + [inputs.grad.reshape(-1)])
    report = {"forward_calls": calls_before, "total_calls_after_backward": [b.calls for b in model],
              "saved_records_at_forward_end": before_backward,
              "unique_non_parameter_saved_storage_bytes": sum(unique_non_parameter.values()),
              "unique_non_parameter_saved_storages": len(unique_non_parameter),
              "loss": loss.item()}
    return report, value.detach().clone(), gradients


def main():
    torch.set_num_threads(1)
    torch.manual_seed(29)
    plain = nn.Sequential(Block(), Block(), Block())
    recomputed = copy.deepcopy(plain)
    source = torch.randn(16, 32)
    normal, output, gradient = run(plain, source, False)
    saved, new_output, new_gradient = run(recomputed, source, True)
    output_error = (output - new_output).abs().max().item()
    gradient_error = (gradient - new_gradient).abs().max().item()
    assert output_error < 1e-6 and gradient_error < 1e-6
    assert normal["forward_calls"] == saved["forward_calls"] == [1, 1, 1]
    assert normal["total_calls_after_backward"] == [1, 1, 1]
    assert saved["total_calls_after_backward"] == [2, 2, 2]
    assert saved["unique_non_parameter_saved_storage_bytes"] < normal["unique_non_parameter_saved_storage_bytes"]
    print(json.dumps({"torch": torch.__version__, "device": "cpu", "dtype": "float32",
                      "input_shape": [16, 32], "checkpoint_use_reentrant": False,
                      "normal": normal, "checkpointed": saved,
                      "output_max_abs_error": output_error, "gradient_max_abs_error": gradient_error,
                      "scope": "saved_for_backward_storage_reference_not_peak_memory_rss_or_gpu_measurement",
                      "limits": ["parameter storages excluded; views deduplicated by underlying storage",
                                 "storage payload is not allocator reserved memory",
                                 "fixed deterministic blocks without dropout; no random-state compatibility claim"]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

