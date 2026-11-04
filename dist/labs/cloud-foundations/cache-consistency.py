def replay(use_floor):
    database = (7, "pending")
    cache, floor = None, 0
    slow_read = database                 # R 读取，尚未回填
    database = (8, "shipped")            # W 提交
    cache = None                        # W 失效
    if use_floor:
        floor = max(floor, database[0])
    if not use_floor or slow_read[0] >= floor:
        cache = slow_read                # R 晚到的回填
    return cache, database

stale, latest = replay(False)
assert stale == (7, "pending") and latest == (8, "shipped")
blocked, latest = replay(True)
assert blocked is None and latest[0] == 8
print("naive", stale, "guarded", blocked, "source", latest)
