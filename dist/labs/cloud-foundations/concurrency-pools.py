from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock

def run(protect):
    counter = [7]
    gate, lock = Barrier(2), Lock()
    def finish_page():
        if protect:
            gate.wait(timeout=5)
            with lock:
                counter[0] = counter[0] + 1
        else:
            snapshot = counter[0]
            gate.wait(timeout=5)
            counter[0] = snapshot + 1
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = [pool.submit(finish_page) for _ in range(2)]
        for job in jobs:
            job.result()
    return counter[0]

assert (run(False), run(True)) == (8, 9)
