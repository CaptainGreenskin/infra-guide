"""A deterministic iteration scheduler with separate work and reserved KV budgets.

Integer microseconds; invented additive costs, no model, GPU or vLLM execution.
"""
from dataclasses import dataclass,field
import json


@dataclass
class Request:
    id: str
    arrival: int
    prompt: int
    output_limit: int
    prefilled: int = 0
    admitted: int = -1
    output_times: list = field(default_factory=list)

    @property
    def reservation(self):
        # Prefill emits output #1. Only the next G-1 outputs need decode inputs.
        positions = self.prompt + self.output_limit - 1
        return ((positions+3)//4)*4


def simulate(spec,chunk,kv_capacity,work_budget=40):
    if min(chunk,kv_capacity,work_budget)<=0:
        raise ValueError("invalid_budget")
    requests = [Request(**row) for row in spec]
    if len({r.id for r in requests}) != len(requests):
        raise ValueError("duplicate_request_id")
    for r in requests:
        if r.prompt<1 or r.output_limit<1 or r.arrival<0:
            raise ValueError("invalid_request")
        if r.reservation>kv_capacity:
            raise ValueError("request_exceeds_kv_budget")
    waiting = sorted(requests,key=lambda r:r.arrival)
    active,trace,now,peak = [],[],0,0
    while waiting or active:
        if not active and waiting[0].arrival>now:
            now=waiting[0].arrival
        reserved=sum(r.reservation for r in active)
        newcomers=[]
        # FIFO admission; a non-fitting head remains queued, even if compute is free.
        while waiting and waiting[0].arrival<=now:
            r=waiting[0]
            if reserved+r.reservation>kv_capacity:
                break
            waiting.pop(0);r.admitted=now;active.append(r);newcomers.append(r)
            reserved+=r.reservation
        peak=max(peak,reserved)
        budget=work_budget
        decoding=[r for r in active if r.prefilled==r.prompt][:budget]
        budget-=len(decoding)
        # New prompts first, then unfinished prompts in admission order; explicit toy policy.
        prefilling=newcomers+[r for r in active if r not in newcomers and r.prefilled<r.prompt]
        pieces=[]
        for r in prefilling:
            n=min(chunk,r.prompt-r.prefilled,budget)
            if n:
                r.prefilled+=n;budget-=n;pieces.append((r,n))
        prompt_work=sum(n for _,n in pieces)
        duration=100*prompt_work+1000*len(decoding)
        assert duration>0 and prompt_work+len(decoding)<=work_budget
        end=now+duration
        emitted=[]
        for r in decoding:
            r.output_times.append(end);emitted.append(r.id)
        for r,_ in pieces:
            if r.prefilled==r.prompt:
                r.output_times.append(end);emitted.append(r.id)
        completed=[r for r in active if len(r.output_times)==r.output_limit]
        trace.append({"start_us":now,"end_us":end,"admitted":[r.id for r in newcomers],
                      "decode":[r.id for r in decoding],"prefill":{r.id:n for r,n in pieces},
                      "emitted":emitted,"reserved_before":reserved,
                      "completed":[r.id for r in completed]})
        active=[r for r in active if r not in completed]
        now=end
    metrics={}
    for r in requests:
        assert len(r.output_times)==r.output_limit and r.prefilled==r.prompt
        gaps=[b-a for a,b in zip(r.output_times,r.output_times[1:])]
        metrics[r.id]={"admitted_us":r.admitted,"waiting_us":r.admitted-r.arrival,
                       "ttft_us":r.output_times[0]-r.arrival,"max_gap_us":max(gaps) if gaps else None,
                       "last_us":r.output_times[-1],"output_times_us":r.output_times,
                       "reserved_slots":r.reservation}
    assert peak<=kv_capacity
    return {"chunk":chunk,"kv_capacity":kv_capacity,"work_budget":work_budget,
            "peak_reserved":peak,"finish_us":now,"requests":metrics,"trace":trace}


def main():
    arrival_case=[{"id":"A","arrival":0,"prompt":32,"output_limit":4},
                  {"id":"B","arrival":2000,"prompt":4,"output_limit":2},
                  {"id":"C","arrival":2000,"prompt":8,"output_limit":2}]
    streaming_case=[{"id":"A","arrival":0,"prompt":4,"output_limit":6},
                    {"id":"B","arrival":500,"prompt":32,"output_limit":2}]
    cases={}
    for label,spec,capacity in [("new_short_prompt",arrival_case,44),
                               ("long_prompt_while_streaming",streaming_case,48)]:
        cases[label]={"whole":simulate(spec,32,capacity),"chunked":simulate(spec,8,capacity)}
    a=cases["new_short_prompt"]
    assert a["whole"]["requests"]["B"]["ttft_us"]==2600
    assert a["chunked"]["requests"]["B"]["ttft_us"]==1600
    assert a["whole"]["requests"]["A"]["ttft_us"]==3200
    assert a["chunked"]["requests"]["A"]["ttft_us"]==3600
    assert all(a[p]["requests"]["C"]["admitted_us"]==7600 for p in ("whole","chunked"))
    b=cases["long_prompt_while_streaming"]
    assert b["whole"]["requests"]["A"]["max_gap_us"]==4200
    assert b["chunked"]["requests"]["A"]["max_gap_us"]==1800
    assert b["whole"]["requests"]["B"]["ttft_us"]==5100
    assert b["chunked"]["requests"]["B"]["ttft_us"]==8100
    assert b["whole"]["finish_us"]==b["chunked"]["finish_us"]==9600
    one=simulate([{"id":"one","arrival":0,"prompt":4,"output_limit":1}],8,8)
    assert one["requests"]["one"]["max_gap_us"] is None
    assert not any(step["decode"] for step in one["trace"])
    try:
        simulate([{"id":"too-large","arrival":0,"prompt":64,"output_limit":2}],8,44)
    except ValueError as error:
        oversized=str(error)
    else:
        raise AssertionError("permanently non-fitting request was admitted")
    print(json.dumps({"cases":cases,"one_output":{"ttft_us":400,"decode_steps":0,"max_gap_us":None},
                      "oversized_request":oversized,
                      "scope":"invented additive costs and full-length reservations; no actual model, GPU or vLLM"}))


if __name__ == "__main__":
    main()
