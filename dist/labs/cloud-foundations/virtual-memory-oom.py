BASE, DELTA, CAP = 96, 44, 256
def timeline(deltas):
    current = peak = BASE
    for tick, change in enumerate(deltas, 1):
        current += change
        peak = max(peak, current)
        print(tick, current, "over budget" if current > CAP else "within budget")
    assert current == BASE
    return peak
concurrent = [DELTA] * 4 + [-DELTA] * 4
staggered = [DELTA] * 3 + [-DELTA, DELTA] + [-DELTA] * 3
assert (timeline(concurrent), timeline(staggered)) == (272, 228)
