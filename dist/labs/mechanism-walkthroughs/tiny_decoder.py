"""One CPU update of a miniature next-token model; no downloads required."""
import copy
import json

import torch
from torch import nn
from torch.nn import functional as F


class TinyDecoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.token = nn.Embedding(8, 8)
        self.position = nn.Embedding(4, 8)
        self.norm1 = nn.RMSNorm(8, eps=1e-6)
        self.norm2 = nn.RMSNorm(8, eps=1e-6)
        self.norm_out = nn.RMSNorm(8, eps=1e-6)
        self.qkv = nn.Linear(8, 24, bias=False)
        self.out = nn.Linear(8, 8, bias=False)
        self.gate = nn.Linear(8, 12, bias=False)
        self.up = nn.Linear(8, 12, bias=False)
        self.down = nn.Linear(12, 8, bias=False)

    def forward(self, ids):
        batch, length = ids.shape
        pos = torch.arange(length, device=ids.device)
        x = self.token(ids) + self.position(pos)
        # [B,T,3D] -> three [B,H,T,d] views
        q, k, v = (t.reshape(batch, length, 2, 4).transpose(1, 2)
                   for t in self.qkv(self.norm1(x)).chunk(3, dim=-1))
        z = F.scaled_dot_product_attention(q, k, v, is_causal=True, dropout_p=0.0)
        joined = z.transpose(1, 2).reshape(batch, length, 8)
        x = x + self.out(joined)
        u = self.norm2(x)
        x = x + self.down(F.silu(self.gate(u)) * self.up(u))
        return F.linear(self.norm_out(x), self.token.weight)


def loss_sum(logits, labels):
    return F.cross_entropy(logits.reshape(-1, 8), labels.reshape(-1),
                           ignore_index=-100, reduction="sum")


def update(model, x, labels, micro_size):
    optimizer = torch.optim.SGD(model.parameters(), lr=0.05)
    optimizer.zero_grad(set_to_none=True)
    valid = int((labels != -100).sum())
    if valid == 0:
        return None
    total_loss = 0.0
    for start in range(0, len(x), micro_size):
        sl = slice(start, start + micro_size)
        subtotal = loss_sum(model(x[sl]), labels[sl])
        (subtotal / valid).backward()
        total_loss += subtotal.detach().item()
    optimizer.step()
    return total_loss / valid


def main():
    torch.manual_seed(7)
    torch.set_num_threads(1)
    base = TinyDecoder().double()
    assert sum(p.numel() for p in base.parameters()) == 664
    rows = torch.tensor([[0, 1, 2, 3, 4], [4, 5, 6, 7, 0]])
    x, labels = rows[:, :-1], rows[:, 1:].clone()
    labels[0, 1:] = -100
    labels[1, 3:] = -100
    assert (labels != -100).sum(dim=1).tolist() == [1, 3]

    with torch.no_grad():
        logits = base(x)
        changed = x.clone()
        changed[:, 3] = (changed[:, 3] + 1) % 8
        torch.testing.assert_close(base(changed)[:, :3], logits[:, :3])
        assert logits.shape == (2, 4, 8) and logits.isfinite().all()

    full, micro = copy.deepcopy(base), copy.deepcopy(base)
    full_loss = update(full, x, labels, micro_size=2)
    micro_loss = update(micro, x, labels, micro_size=1)
    assert abs(full_loss - micro_loss) < 1e-12
    largest_diff = 0.0
    for a, b in zip(full.parameters(), micro.parameters()):
        torch.testing.assert_close(a.grad, b.grad, atol=1e-10, rtol=1e-10)
        torch.testing.assert_close(a, b, atol=1e-10, rtol=1e-10)
        largest_diff = max(largest_diff, (a.grad - b.grad).abs().max().item())
    assert not torch.equal(full.token.weight, base.token.weight)
    empty = copy.deepcopy(base)
    assert update(empty, x, torch.full_like(labels, -100), micro_size=1) is None
    for a, b in zip(base.parameters(), empty.parameters()):
        assert torch.equal(a, b)
    with torch.no_grad():
        after_loss = loss_sum(full(x), labels).item() / 4
    print(json.dumps({"torch": str(torch.__version__), "device": "cpu",
                      "parameters": 664, "valid_targets": [1, 3],
                      "loss_before": full_loss, "loss_after": after_loss,
                      "max_grad_diff": largest_diff}, indent=2))


if __name__ == "__main__":
    main()
