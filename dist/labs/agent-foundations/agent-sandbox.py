cpu_m = (12 - 2) * 1000
mem_mib = (24 - 3) * 1024
cpu_slots = cpu_m // 500
mem_slots = mem_mib // 768
assert (cpu_slots, mem_slots) == (20, 28)
assert min(cpu_slots, mem_slots) == 20
assert min(cpu_slots, (mem_mib // 2) // 768) == 14
active = {"slot-3": ("run-new", 8)}

def release(slot, owner):
    if active.get(slot) != owner:
        return False
    del active[slot]
    return True

assert not release("slot-3", ("run-old", 7))
assert release("slot-3", ("run-new", 8))
print(cpu_slots, mem_slots, active)
