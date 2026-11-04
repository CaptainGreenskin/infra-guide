from fractions import Fraction
gold = {"E1", "E2", "E3"}

def metrics(ranked, k):
    top = ranked[:k]
    assert len(top) == k == len(set(top))
    hits = [i for i, item in enumerate(top, 1) if item in gold]
    return (Fraction(len(hits), k), Fraction(len(hits), len(gold)),
            Fraction(1, hits[0]) if hits else Fraction(0))

first = metrics(["old", "E1", "note", "E2", "other"], 5)
second = metrics(["E1", "old", "note", "other", "extra"], 5)
assert first == (Fraction(2, 5), Fraction(2, 3), Fraction(1, 2))
assert second == (Fraction(1, 5), Fraction(1, 3), Fraction(1))
print(first, second)
