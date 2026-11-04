from fractions import Fraction
# 每行：任务数，最终是否成功，每任务尝试，每任务成本。
groups = [(80, True, 1, 2), (10, True, 2, 5), (10, False, 2, 4)]
tasks = sum(n for n, *_ in groups)
wins = sum(n for n, ok, _, _ in groups if ok)
attempts = sum(n*a for n, _, a, _ in groups)
total = sum(n*c for n, _, _, c in groups)
assert (tasks, wins, attempts, total) == (100, 90, 120, 250)
assert Fraction(wins, tasks) == Fraction(9, 10)
assert Fraction(wins, attempts) == Fraction(3, 4)
assert Fraction(total, wins) == Fraction(25, 9)
print(tasks, wins, attempts, total)
