"""Independent statistical examples from declared fixtures; no model benchmark or task execution."""
import csv
from fractions import Fraction
import json
import math
from pathlib import Path

Z95 = 1.959963984540054


def wilson(successes, total):
    if total <= 0 or not 0 <= successes <= total:
        raise ValueError("nonempty valid binomial counts required")
    p = successes / total
    denominator = 1 + Z95 * Z95 / total
    center = (p + Z95 * Z95 / (2 * total)) / denominator
    half = Z95 * math.sqrt(p * (1 - p) / total + Z95 * Z95 / (4 * total * total)) / denominator
    return {"successes": successes, "total": total, "observed": p,
            "lower": max(0, center - half), "upper": min(1, center + half)}


def binary_scores(gold, predicted):
    if len(gold) != len(predicted) or not gold:
        raise ValueError("matching nonempty binary labels required")
    if any(type(x) is not int or x not in [0, 1] for x in gold + predicted):
        raise ValueError("only integer binary labels accepted")
    tp = sum(g == p == 1 for g, p in zip(gold, predicted))
    tn = sum(g == p == 0 for g, p in zip(gold, predicted))
    fp = sum(g == 0 and p == 1 for g, p in zip(gold, predicted))
    fn = sum(g == 1 and p == 0 for g, p in zip(gold, predicted))
    positive = tp + fn
    negative = tn + fp
    safe_divide = lambda numerator, denominator: numerator / denominator if denominator else None
    recalls = [v for v in [safe_divide(tp, positive), safe_divide(tn, negative)] if v is not None]
    return {"tp": tp, "tn": tn, "fp": fp, "fn": fn,
            "accuracy": (tp + tn) / len(gold),
            "positive_recall": safe_divide(tp, positive), "negative_recall": safe_divide(tn, negative),
            "macro_recall_over_present_classes": sum(recalls) / len(recalls),
            "positive_precision": safe_divide(tp, tp + fp)}


def paired(path):
    with path.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    ids = [row["case_id"] for row in rows]
    if len(set(ids)) != len(ids):
        raise ValueError("duplicate paired case identity")
    a, b = [], []
    for row in rows:
        if row["a_pass"] not in {"0", "1"} or row["b_pass"] not in {"0", "1"}:
            raise ValueError("paired outcomes must be binary")
        a.append(int(row["a_pass"]))
        b.append(int(row["b_pass"]))
    if not rows:
        raise ValueError("no paired cases")
    cells = {"both_pass": sum(x == y == 1 for x, y in zip(a, b)),
             "a_only": sum(x == 1 and y == 0 for x, y in zip(a, b)),
             "b_only": sum(x == 0 and y == 1 for x, y in zip(a, b)),
             "both_fail": sum(x == y == 0 for x, y in zip(a, b))}
    discordant = cells["a_only"] + cells["b_only"]
    smaller = min(cells["a_only"], cells["b_only"])
    exact = min(Fraction(1), 2 * sum((Fraction(math.comb(discordant, k), 2 ** discordant)
                                     for k in range(smaller + 1)), Fraction(0)))
    return {"cases": len(rows), "cells": cells, "a": wilson(sum(a), len(a)), "b": wilson(sum(b), len(b)),
            "b_minus_a_percentage_points": 100 * (sum(b) - sum(a)) / len(rows),
            "discordant": discordant, "paired_two_sided_exact_p": float(exact),
            "exact_fraction": str(exact), "case_ids_unique": True}


def main():
    # 1 = should complete, 0 = should refuse; these are declared synthetic labels.
    gold = [1] * 5 + [0] * 20
    reject_all = binary_scores(gold, [0] * 25)
    assert reject_all["accuracy"] == 0.8
    assert reject_all["positive_recall"] == 0 and reject_all["negative_recall"] == 1
    assert reject_all["macro_recall_over_present_classes"] == 0.5
    assert reject_all["positive_precision"] is None
    # Separate artifact-judge calibration example: 6 gold-valid, 6 gold-invalid.
    judge = binary_scores([1] * 6 + [0] * 6, [1] * 5 + [0] + [1] * 2 + [0] * 4)
    assert (judge["tp"], judge["fp"], judge["fn"], judge["tn"]) == (5, 2, 1, 4)
    assert judge["positive_precision"] == 5 / 7
    pairs = paired(Path(__file__).with_name("paired-example.csv"))
    assert pairs["cells"] == {"both_pass": 16, "a_only": 2, "b_only": 4, "both_fail": 3}
    assert pairs["a"]["successes"] == 18 and pairs["b"]["successes"] == 20
    assert pairs["b_minus_a_percentage_points"] == 8
    assert pairs["paired_two_sided_exact_p"] == 0.6875
    intervals = {"five_of_five": wilson(5, 5), "hundred_of_hundred": wilson(100, 100)}
    assert 0.56 < intervals["five_of_five"]["lower"] < 0.57
    assert 0.96 < intervals["hundred_of_hundred"]["lower"] < 0.97
    invalid_counts = False
    try:
        wilson(0, 0)
    except ValueError:
        invalid_counts = True
    assert invalid_counts
    print(json.dumps({"fixture_type": "declared_synthetic_labels_and_paired_csv_not_agent_runs",
                      "reject_all_imbalanced": reject_all, "artifact_judge_calibration": judge,
                      "wilson_95_examples": intervals, "paired_comparison": pairs,
                      "zero_task_interval_rejected": invalid_counts,
                      "assumptions": ["Wilson example assumes independent binomial observations",
                                      "paired exact test assumes independent case pairs and exchangeability under the null",
                                      "fixed illustrative outcomes do not establish any real model success probability",
                                      "large p is not proof of equality; overlapping marginal intervals are not a paired test"]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

