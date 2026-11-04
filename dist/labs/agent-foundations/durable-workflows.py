generation = 42
receipts = {}
effects = []

def publish(epoch, op, digest):
    if epoch != generation:
        return "stale"
    if op in receipts:
        return "replayed" if receipts[op] == digest else "conflict"
    receipts[op] = digest
    effects.append(digest)
    return "committed"

assert publish(42, "pub-27", "d4") == "committed"
assert publish(41, "pub-28", "old") == "stale"
assert publish(42, "pub-27", "d4") == "replayed"
assert publish(42, "pub-27", "d5") == "conflict"
assert effects == ["d4"]
print(effects)
