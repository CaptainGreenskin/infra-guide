"""Shared embedding gradients and unequal supervision counts, without downloads.

Default: actual PyTorch CPU autograd and SGD. --reference-only: Python stdlib
chain rule and finite differences, so the arithmetic can be checked separately.
The toy hidden state is E[id]/2; this is not an attention model.
"""
import argparse
import copy
import json
import math
import platform

TABLE = [[0., 0.], [0., 1.], [0., -1.], [1., 0.],
         [-1., 0.], [2., 0.], [0., 2.], [0., 0.]]
IDS = [[1, 5, 5, 6], [1, 3, 2, 0]]
LABELS = [[5, 5, 6, 2], [3, 2, -100, -100]]
PAD, IGNORE = 0, -100


def reference(table):
    """Manual chain rule; no automatic differentiation library is used here."""
    lookup = [[0., 0.] for _ in table]
    output = [[0., 0.] for _ in table]
    pairs = [(i, y) for row, labels in zip(IDS, LABELS)
             for i, y in zip(row, labels) if y != IGNORE]
    total = 0.
    for i, y in pairs:
        h = [v / 2 for v in table[i]]
        logits = [sum(a*b for a, b in zip(h, row)) for row in table]
        largest = max(logits)
        exp_z = [math.exp(z-largest) for z in logits]
        denominator = sum(exp_z)
        total += largest + math.log(denominator) - logits[y]
        dz = [(v/denominator - (j == y))/len(pairs)
              for j, v in enumerate(exp_z)]
        for j in range(len(table)):
            for d in range(2):
                output[j][d] += dz[j]*h[d]
                if i != PAD:
                    lookup[i][d] += dz[j]*table[j][d]/2
    joint = [[a+b for a, b in zip(x, y)] for x, y in zip(lookup, output)]
    return {"valid_targets": len(pairs), "mean_nll": total/len(pairs),
            "lookup_gradient": lookup, "output_gradient": output,
            "joint_gradient": joint}


def finite_difference():
    h = 1e-5
    gradients = []
    for row in range(8):
        values = []
        for column in range(2):
            plus, minus = copy.deepcopy(TABLE), copy.deepcopy(TABLE)
            plus[row][column] += h
            minus[row][column] -= h
            values.append((reference(plus)["mean_nll"] -
                           reference(minus)["mean_nll"])/(2*h))
        gradients.append(values)
    return gradients


def main(reference_only=False):
    expected = reference(TABLE)
    numeric = finite_difference()
    error = max(abs(a-b) for x, y in zip(numeric, expected["joint_gradient"])
                for a, b in zip(x, y))
    assert expected["valid_targets"] == 6 and error < 1e-8
    result = {"python": platform.python_version(), "inputs": IDS, "targets": LABELS, "reference": expected,
              "finite_difference_max_error": error,
              "scope": "local E[id]/2 toy; no attention, pretrained model or GPU"}
    if reference_only:
        print(json.dumps(result, indent=2))
        return

    import torch
    from torch import nn
    from torch.nn import functional as F

    torch.set_num_threads(1)
    table = torch.tensor(TABLE, dtype=torch.float64)
    ids, labels = torch.tensor(IDS), torch.tensor(LABELS)
    gradients = {}
    for path in ["lookup", "output", "joint"]:
        embedding = nn.Embedding.from_pretrained(table.clone(), freeze=False,
                                                padding_idx=PAD)
        hidden = embedding(ids)/2
        weight = embedding.weight
        if path == "lookup":
            weight = weight.detach()
        if path == "output":
            hidden = hidden.detach()
        logits = F.linear(hidden, weight)
        loss = F.cross_entropy(logits.reshape(-1, 8), labels.reshape(-1),
                               ignore_index=IGNORE, reduction="sum")/6
        loss.backward()
        torch.testing.assert_close(loss.detach(), torch.tensor(expected["mean_nll"],
                                    dtype=torch.float64), atol=1e-12, rtol=1e-12)
        wanted = torch.tensor(expected[path+"_gradient"], dtype=torch.float64)
        torch.testing.assert_close(embedding.weight.grad, wanted,
                                   atol=1e-12, rtol=1e-12)
        gradients[path] = embedding.weight.grad.tolist()
        if path == "joint":
            before = embedding.weight[PAD].detach().clone()
            torch.optim.SGD(embedding.parameters(), lr=0.1).step()
            after = embedding.weight[PAD].detach().clone()
            assert torch.count_nonzero(after-before) == 2
            torch.testing.assert_close(after, -0.1*wanted[PAD])
            result["pad_row_after_sgd"] = after.tolist()

    # Give a padding lookup explicit upstream ones, independently of ignored CE.
    probe = nn.Embedding.from_pretrained(table.clone(), freeze=False, padding_idx=PAD)
    probe(torch.tensor([PAD])).sum().backward()
    assert torch.count_nonzero(probe.weight.grad[PAD]) == 0
    result["lookup_padding_probe"] = probe.weight.grad[PAD].tolist()

    # An independent scalar example: one label in batch 0, three in batch 1.
    scalar = {}
    for mode in ["all_tokens", "micro_sum_over_four", "mean_of_means"]:
        w = torch.tensor(1., dtype=torch.float64, requires_grad=True)
        groups = [torch.tensor([0.], dtype=torch.float64),
                  torch.tensor([3., 3., 3.], dtype=torch.float64)]
        sums = [((w-y)**2/2).sum() for y in groups]
        if mode == "mean_of_means":
            objective = (sums[0] + sums[1]/3)/2
        else:
            objective = (sums[0]+sums[1])/4
        if mode == "micro_sum_over_four":
            for subtotal in sums:
                (subtotal/4).backward()
        else:
            objective.backward()
        old_gradient = w.grad.item()
        torch.optim.SGD([w], lr=0.1).step()
        scalar[mode] = {"loss": objective.detach().item(),
                        "gradient": old_gradient, "after_sgd": w.item()}
    assert scalar["all_tokens"] == scalar["micro_sum_over_four"]
    assert scalar["all_tokens"] == {"loss": 1.625, "gradient": -1.25, "after_sgd": 1.125}
    assert scalar["mean_of_means"] == {"loss": 1.25, "gradient": -0.5, "after_sgd": 1.05}
    result.update({"torch": str(torch.__version__), "device": "cpu", "dtype": "float64",
                   "observed_gradients": gradients, "unequal_supervision": scalar})
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-only", action="store_true")
    main(parser.parse_args().reference_only)
