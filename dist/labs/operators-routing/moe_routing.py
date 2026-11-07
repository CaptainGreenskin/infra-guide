"""A declared top-2 MoE reference with real local process dispatch, not GPU collectives."""
import argparse
import hashlib
import json
import math
import multiprocessing as mp
from pathlib import Path
import platform

TOKENS = [[1.0,2.0], [2.0,1.0], [1.0,-1.0], [-1.0,1.0]]
# W[out][in]; small linear experts are not a complete Transformer FFN.
EXPERTS = [[[1.0,0.0],[0.0,1.0]], [[2.0,0.0],[0.0,1.0]], [[1.0,1.0],[-1.0,1.0]]]
OWNERS = [0,1,0]


def top_routes(logits, k=2):
    if len(logits)!=len(EXPERTS) or not 1<=k<=len(logits) or not all(math.isfinite(x) for x in logits):
        raise ValueError('invalid_router_contract')
    selected = sorted(range(len(logits)), key=lambda i:(-logits[i],i))[:k]
    maximum = max(logits[i] for i in selected)
    terms = [math.exp(logits[i]-maximum) for i in selected]
    total = math.fsum(terms)
    return [(i, term/total) for i,term in zip(selected,terms)]


def expert_output(expert, token):
    return [math.fsum(w*x for w,x in zip(row,token)) for row in EXPERTS[expert]]


def assignments(logits, capacity=None):
    loads = [0]*len(EXPERTS)
    accepted, dropped = [], []
    for token_id, scores in enumerate(logits):
        for slot,(expert,weight) in enumerate(top_routes(scores)):
            item = {'token':token_id, 'slot':slot, 'expert':expert, 'weight':weight,
                    'origin_rank':token_id%2, 'owner_rank':OWNERS[expert]}
            # Declared admission policy: earlier input tokens win; dropped mass is NOT renormalized.
            (accepted if capacity is None or loads[expert]<capacity else dropped).append(item)
            loads[expert] += 1
    return accepted, dropped, loads


def combine(replies):
    output = [[0.0,0.0] for _ in TOKENS]
    seen = set()
    for item,value in replies:
        identity = (item['token'],item['slot'])
        if identity in seen: raise ValueError('duplicate_assignment_reply')
        seen.add(identity)
        for j in range(2): output[item['token']][j] += item['weight']*value[j]
    return output


def serial(rows):
    return combine([(row,expert_output(row['expert'],TOKENS[row['token']])) for row in rows])


def worker(rank, inbox, outbox):
    rows = inbox.get(timeout=10)
    assert all(row['owner_rank']==rank for row in rows)
    # Reverse local replies to force combine to use identity, not completion order.
    outbox.put([(row,expert_output(row['expert'],TOKENS[row['token']])) for row in reversed(rows)])


def process_dispatch(rows):
    ctx = mp.get_context('spawn')
    outbox = ctx.Queue()
    inboxes = [ctx.Queue() for _ in range(2)]
    workers = [ctx.Process(target=worker,args=(rank,inboxes[rank],outbox)) for rank in range(2)]
    try:
        for p in workers: p.start()
        for rank,inbox in enumerate(inboxes): inbox.put([r for r in rows if r['owner_rank']==rank])
        replies = []
        for _ in workers: replies.extend(outbox.get(timeout=15))
        for p in workers:
            p.join(10)
            assert p.exitcode==0
        assert sorted((r['token'],r['slot']) for r,_ in replies)==sorted((r['token'],r['slot']) for r in rows)
        return combine(replies)
    finally:
        for p in workers:
            if p.is_alive(): p.terminate();p.join(5)
        for channel in inboxes+[outbox]: channel.close();channel.join_thread()


def load_summary(logits):
    fractions=[sum(top_routes(row,1)[0][0]==e for row in logits)/len(logits) for e in range(len(EXPERTS))]
    probabilities=[]
    for row in logits:
        maximum=max(row); terms=[math.exp(x-maximum) for x in row]; total=math.fsum(terms)
        probabilities.append([x/total for x in terms])
    averages=[math.fsum(row[e] for row in probabilities)/len(logits) for e in range(len(EXPERTS))]
    return {'top1_fractions':fractions,'mean_full_softmax':averages,
            'unscaled_aux':len(EXPERTS)*math.fsum(f*p for f,p in zip(fractions,averages))}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--report',type=Path);args=parser.parse_args()
    log3 = math.log(3.0)
    balanced = [[log3,0.0,-9.0], [log3,-9.0,0.0], [-9.0,log3,0.0], [-9.0,0.0,log3]]
    skew = [[log3,0.0,-9.0] for _ in TOKENS]
    rows,none,loads = assignments(balanced)
    reference = serial(rows)
    actual = process_dispatch(rows)
    assert actual==reference
    # Independent hand-derived outputs from the declared matrices and 3:1 gates.
    expected = [[1.25,2.0],[2.25,0.5],[1.5,-1.25],[-0.5,1.75]]
    assert actual==expected
    capacity=math.ceil(len(TOKENS)*2/len(EXPERTS))
    kept,dropped,skew_loads=assignments(skew,capacity)
    clipped=process_dispatch(kept)
    assert capacity==3 and loads==[2,3,3] and skew_loads==[4,4,0]
    assert len(kept)==6 and len(dropped)==2 and clipped[-1]==[0.0,0.0]
    mass=[math.fsum(r['weight'] for r in kept if r['token']==t) for t in range(len(TOKENS))]
    assert mass==[1.0,1.0,1.0,0.0]
    rejected=[]
    for name,callback in [('nonfinite',lambda:top_routes([math.nan,0,1])),
                          ('bad_width',lambda:top_routes([1,2])),
                          ('duplicate_reply',lambda:combine([(rows[0],[1,2]),(rows[0],[1,2])]))]:
        try: callback()
        except ValueError: rejected.append(name)
        else: raise AssertionError(name)
    # A plausible-looking faulty gather: flattened expert order silently mixes different tokens.
    grouped=sorted(rows,key=lambda r:r['expert'])
    wrong=[]
    for t in range(len(TOKENS)):
        pair=grouped[2*t:2*t+2]
        wrong.append([sum(r['weight']*expert_output(r['expert'],TOKENS[r['token']])[j] for r in pair) for j in range(2)])
    assert wrong!=reference
    crossing=sum(row['origin_rank']!=row['owner_rank'] for row in rows)
    result={'status':'passed','system':platform.system(),'python':platform.python_version(),
            'source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'tokens':TOKENS,'experts':EXPERTS,'expert_owner_rank':OWNERS,'routing_logits':balanced,
            'assignments':rows,'expert_loads':loads,'load_diagnostics':{'balanced':load_summary(balanced),'skew':load_summary(skew)},'serial_output':reference,'two_process_output':actual,
            'wrong_gather_output':wrong,'cross_rank_assignments':crossing,
            'declared_transfer_bytes':{'hidden_size':2,'bytes_per_element':8,'dispatch_plus_return':2*crossing*2*8},
            'capacity_case':{'capacity_per_expert':capacity,'raw_expert_loads':skew_loads,
                             'kept':kept,'dropped':dropped,'kept_weight_mass':mass,'output':clipped},
            'rejected':rejected,'tie_order':[i for i,_ in top_routes([0,0,0])],
            'scope':'Declared top-2/renormalize-before-capacity policy, fixed linear experts, actual two local worker processes. Transfer bytes are arithmetic; not trained MoE, CUDA/NCCL/all-to-all latency or quality evidence.'}
    if args.report: args.report.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':main()
