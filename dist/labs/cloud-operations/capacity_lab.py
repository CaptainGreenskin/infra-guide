"""Exact, deterministic fluid queue and cost arithmetic; not a load generator."""
from fractions import Fraction as F
import json


def simulate(limit=None):
    step=F(1,10)
    backlog=F(0)
    arrivals=completed=rejected=area=F(0)
    snapshots=[]
    peak=F(0)
    for tick in range(300):
        # Over each interval: constant arrival/service rates, no in-service granularity.
        rate=F(80 if tick<100 else 120)
        incoming=F(100)*step
        net=incoming-rate*step
        before=backlog
        after=max(F(0),before+net)
        dropped=F(0)
        if limit is not None and after>limit:
            dropped=after-limit
            after=F(limit)
        actual_done=before+incoming-after-dropped
        assert actual_done>=0 and actual_done<=rate*step
        arrivals+=incoming
        completed+=actual_done
        rejected+=dropped
        backlog=after
        area+=(before+after)/2*step
        peak=max(peak,after)
        assert arrivals==completed+rejected+backlog
        if tick+1 in (100,200,300):
            snapshots.append({'seconds':int((tick+1)*step),'backlog':float(backlog),
                              'arrivals':int(arrivals),'completed':int(completed),'rejected':int(rejected)})
    return {'snapshots':snapshots,'peak_backlog':float(peak),'backlog_area_request_seconds':float(area)}


def run():
    unbounded=simulate()
    assert unbounded['snapshots'][0]['backlog']==200
    assert unbounded['snapshots'][1]['backlog']==0
    assert unbounded['snapshots'][2]['completed']==3000
    assert unbounded['backlog_area_request_seconds']==2000
    bounded=simulate(F(160))
    assert bounded['snapshots'][0]['rejected']==40
    assert bounded['snapshots'][0]['completed']==800
    assert bounded['snapshots'][0]['backlog']==160
    assert bounded['snapshots'][2]['completed']==2960
    # 100 admitted attempts/s; waiting/execution are wall time, CPU use is separate.
    waiting=F(100)*F(12,100)
    executing=F(100)*F(20,100)
    cpu=F(100)*F(10,1000)
    assert waiting==12 and executing==20 and cpu==1
    cost_before=F(100+20+10,1000)
    cost_after=F(117,1000)
    assert 1-cost_after/cost_before==F(1,10)
    assert F(117,900)==cost_before
    return {'status':'passed','unbounded':unbounded,'bounded_160':bounded,
            'stable_admitted_100_per_second':{'waiting':12,'executing':20,'total_inflight':32,'cpu_core_equivalent':1},
            'cost':{'before_per_unique_success':float(cost_before),'after_same_1000_successes':float(cost_after),
                    'reduction_percent':10,'after_only_900_successes':float(F(117,900))},
            'scope':'Exact Fraction arithmetic in a piecewise fluid model. Not real CPU, HPA, a cloud bill or a benchmark. Finite buffer is work backlog in this model, not an OS connection queue.'}


if __name__=='__main__':
    print(json.dumps(run(),ensure_ascii=False,indent=2))
