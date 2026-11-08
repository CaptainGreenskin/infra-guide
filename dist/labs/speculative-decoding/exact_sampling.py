"""Exact finite-state probability enumeration, not Monte Carlo or a speed test."""
from collections import defaultdict
from fractions import Fraction as F
from itertools import product
import json

P = (F(1, 2), F(1, 3), F(1, 6))
Q = (F(1, 6), F(1, 3), F(1, 2))


def normalize(values):
    total = sum(values)
    assert total > 0
    return tuple(v / total for v in values)


def one_step(p, q, wrong_residual=False):
    accepted = tuple(min(a, b) for a, b in zip(p, q))
    rejected = 1 - sum(accepted)
    if not rejected:
        return accepted
    residual = p if wrong_residual else normalize(tuple(max(F(0), a - b) for a, b in zip(p, q)))
    return tuple(a + rejected * r for a, r in zip(accepted, residual))


def distribution(base, prefix):
    # Prefix-dependent transition: rotate the table by the last output token.
    offset = prefix[-1] if prefix else 0
    return tuple(base[(i + offset) % 3] for i in range(3))


def block(prefix, gamma=2):
    outcomes = defaultdict(F)
    for draft in product(range(3), repeat=gamma):
        draft_mass = F(1)
        for i, y in enumerate(draft):
            draft_mass *= distribution(Q, prefix + draft[:i])[y]
        live_mass = draft_mass
        for i, y in enumerate(draft):
            accepted_prefix = prefix + draft[:i]
            p = distribution(P, accepted_prefix)
            q = distribution(Q, accepted_prefix)
            accept = min(F(1), p[y] / q[y])
            rejection_mass = live_mass * (1 - accept)
            if rejection_mass:
                residual = normalize(tuple(max(F(0), a - b) for a, b in zip(p, q)))
                for token, mass in enumerate(residual):
                    outcomes[draft[:i] + (token,)] += rejection_mass * mass
            live_mass *= accept
        # Every guess survived: one additional token from p at the full prefix.
        for token, mass in enumerate(distribution(P, prefix + draft)):
            outcomes[draft + (token,)] += live_mass * mass
    assert sum(outcomes.values()) == 1
    return {k: v for k, v in outcomes.items() if v}


def full_sequences(length):
    result = defaultdict(F)

    def visit(prefix, mass):
        if len(prefix) >= length:
            result[prefix[:length]] += mass
            return
        for tokens, probability in block(prefix).items():
            visit(prefix + tokens, mass * probability)
    visit((), F(1))
    return result


def main():
    correct = one_step(P, Q)
    wrong = one_step(P, Q, wrong_residual=True)
    assert correct == P and wrong != P
    assert one_step(P, P) == P  # no rejection: never divide by zero residual mass
    zero_q = (F(0), F(1, 2), F(1, 2))
    assert one_step(P, zero_q) == P  # q=0 cannot propose; residual restores missing support
    actual = full_sequences(3)
    expected = {}
    for seq in product(range(3), repeat=3):
        mass = F(1)
        for i, token in enumerate(seq):
            mass *= distribution(P, seq[:i])[token]
        expected[seq] = mass
    assert dict(actual) == expected and sum(actual.values()) == 1
    report = {'p': list(map(str, P)), 'q': list(map(str, Q)),
              'accepted_mass': list(map(str, map(min, P, Q))), 'acceptance': '2/3',
              'residual': ['1', '0', '0'], 'correct_marginal': list(map(str, correct)),
              'wrong_using_p_as_residual': list(map(str, wrong)),
              'equal_distributions': list(map(str, one_step(P, P))),
              'zero_draft_support': list(map(str, one_step(P, zero_q))),
              'gamma': 2, 'sequence_length': 3,
              'sequence_probabilities': [{'tokens': list(seq), 'mass': str(actual[seq]),
                                          'target_mass': str(expected[seq])} for seq in sorted(actual)],
              'scope': 'exact Fraction enumeration of sampling law; no model performance claim'}
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
