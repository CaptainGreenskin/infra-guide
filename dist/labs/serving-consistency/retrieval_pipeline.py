"""Controlled retrieval stages, task-visible body delivery, and independent grading.

Scores, rule reranking and costs are fixtures. No embedding, LLM or remote ACL.
"""
from fractions import Fraction
import json
import sqlite3

GOLD={("a-1",1),("a-2",2)}  # Used only by the independent metric/answer grader.
REQUIRED=("base","adjustment")


def database():
    db=sqlite3.connect(":memory:",isolation_level=None)
    db.row_factory=sqlite3.Row
    db.executescript("""
    CREATE TABLE docs(tenant TEXT,id TEXT,version INT,kind TEXT,score REAL,
                      units INT,body TEXT,PRIMARY KEY(tenant,id,version));
    CREATE TABLE grants(actor TEXT,tenant TEXT,PRIMARY KEY(actor,tenant));
    CREATE TABLE delivery(tenant TEXT,id TEXT,version INT);
    INSERT INTO grants VALUES('user-A','A');
    """)
    docs=[("B","b-secret",1,"base",0.99,8,{"amount":999}),
          ("A","a-2",1,"adjustment",0.98,8,{"amount":99}),
          ("A","a-note",1,"manual",0.95,8,{"text":"workflow notes"}),
          ("A","a-1",1,"base",0.90,8,{"amount":10}),
          ("A","a-2",2,"adjustment",0.85,8,{"amount":27})]
    db.executemany("INSERT INTO docs VALUES(?,?,?,?,?,?,?)",
                   [(*row[:6],json.dumps(row[6])) for row in docs])
    return db


def permitted(db,meta,actor):
    return db.execute("SELECT 1 FROM grants WHERE actor=? AND tenant=?",(actor,meta["tenant"])).fetchone() is not None


def current(db,meta):
    latest=db.execute("SELECT MAX(version) FROM docs WHERE tenant=? AND id=?",
                      (meta["tenant"],meta["id"])).fetchone()[0]
    return meta["version"]==latest


def fetch_to_task(db,meta,actor,enforce=True):
    # Recheck actual resource permissions and current version at body retrieval.
    if enforce:
        row=db.execute("SELECT d.body FROM docs d JOIN grants g ON g.tenant=d.tenant "
                       "WHERE g.actor=? AND d.tenant=? AND d.id=? AND d.version=? "
                       "AND d.version=(SELECT MAX(v.version) FROM docs v WHERE v.tenant=d.tenant AND v.id=d.id)",
                       (actor,meta["tenant"],meta["id"],meta["version"])).fetchone()
    else:
        row=db.execute("SELECT body FROM docs WHERE tenant=? AND id=? AND version=?",
                       (meta["tenant"],meta["id"],meta["version"])).fetchone()
    if row is None:
        raise PermissionError("resource_not_permitted_or_current")
    db.execute("INSERT INTO delivery VALUES(?,?,?)",(meta["tenant"],meta["id"],meta["version"]))
    return {**meta,"body":json.loads(row[0])}


def metric(refs):
    hits=set(refs[:2]) & GOLD
    rank=next((i for i,ref in enumerate(refs[:2],1) if ref in GOLD),None)
    return {"precision_at_2":str(Fraction(len(hits),2)),
            "recall_at_2":str(Fraction(len(hits),len(GOLD))),
            "reciprocal_rank":str(Fraction(1,rank)) if rank else "0"}


def execute(db,strategy,budget=16,revoke_before_fetch=False):
    actor="user-A"  # Trusted fixture session, not supplied by retrieved text.
    metadata=[dict(row) for row in db.execute("SELECT tenant,id,version,kind,score,units FROM docs ORDER BY score DESC")]
    if strategy=="unsafe_post_filter":
        # Intentional negative: these bodies have already entered the A task's buffer.
        for meta in metadata[:2]:
            fetch_to_task(db,meta,actor,enforce=False)
        ranked=[m for m in metadata[:2] if permitted(db,m,actor) and current(db,m)]
    elif strategy=="post_filter":
        # Metadata-only filtering here does not itself disclose the rejected bodies.
        ranked=[m for m in metadata[:2] if permitted(db,m,actor) and current(db,m)]
    else:
        eligible=[m for m in metadata if permitted(db,m,actor) and current(db,m)]
        if strategy=="pre_filter":
            ranked=eligible[:2]
        elif strategy=="rule_rerank":
            # A task-specific rule, not the GOLD set or a learned semantic reranker.
            candidates=eligible[:3]
            ranked=sorted(candidates,key=lambda m:(REQUIRED.index(m["kind"]) if m["kind"] in REQUIRED else 2,-m["score"]))[:2]
        else:
            raise ValueError("unknown_strategy")
    selected=[]
    remaining=budget
    for meta in ranked:
        if meta["units"]<=remaining:
            selected.append(meta);remaining-=meta["units"]
    if revoke_before_fetch:
        db.execute("DELETE FROM grants WHERE actor=?",(actor,))
    context=[]
    denied=False
    for meta in selected:
        try:
            context.append(fetch_to_task(db,meta,actor))
        except PermissionError:
            denied=True
            break
    evidence={row["kind"]:row for row in context if row["kind"] in REQUIRED}
    answer={"status":"denied" if denied else "insufficient_evidence"}
    if not denied and set(evidence)==set(REQUIRED):
        answer={"status":"success","total":sum(evidence[k]["body"]["amount"] for k in REQUIRED),
                "citations":[[evidence[k]["id"],evidence[k]["version"]] for k in REQUIRED]}
    ranked_refs=[(m["id"],m["version"]) for m in ranked]
    context_refs=[(m["id"],m["version"]) for m in context]
    return {"ranked":ranked_refs,"context":context_refs,"budget_units":budget,
            "used_units":sum(row["units"] for row in context),"answer":answer}


def grade(db,result):
    # Independent fixture oracle reads actual delivery rows; execution has no GOLD input.
    deliveries=[dict(row) for row in db.execute("SELECT * FROM delivery")]
    forbidden=sum(row["tenant"]!="A" for row in deliveries)
    obsolete=sum(not current(db,row) for row in deliveries)
    answer=result["answer"]
    qualified=(answer.get("status")=="success" and answer.get("total")==37
               and {tuple(x) for x in answer.get("citations",[])}==GOLD and not forbidden and not obsolete)
    return {"rank_metrics":metric(result["ranked"]),"context_metrics":metric(result["context"]),
            "forbidden_task_deliveries":forbidden,"obsolete_task_deliveries":obsolete,
            "body_delivery_count":len(deliveries),"qualified_completion":qualified}


def run(strategy,**kwargs):
    db=database()
    try:
        result=execute(db,strategy,**kwargs)
        return {**result,**grade(db,result)}
    finally:
        db.close()


def main():
    cases={"post_filter":run("post_filter"),"pre_filter":run("pre_filter"),
           "rule_rerank_16":run("rule_rerank"),"rule_rerank_12":run("rule_rerank",budget=12),
           "unsafe_post_filter":run("unsafe_post_filter"),
           "revoked_before_fetch":run("rule_rerank",revoke_before_fetch=True)}
    assert cases["post_filter"]["ranked"]==[] and cases["post_filter"]["body_delivery_count"]==0
    assert cases["pre_filter"]["rank_metrics"]=={"precision_at_2":"1/2","recall_at_2":"1/2","reciprocal_rank":"1/2"}
    assert cases["rule_rerank_16"]["qualified_completion"]
    low=cases["rule_rerank_12"]
    assert low["rank_metrics"]["recall_at_2"]=="1" and low["context_metrics"]["recall_at_2"]=="1/2"
    assert low["context_metrics"]["reciprocal_rank"]=="1" and not low["qualified_completion"]
    assert cases["unsafe_post_filter"]["forbidden_task_deliveries"]==1
    assert cases["unsafe_post_filter"]["obsolete_task_deliveries"]==1
    assert cases["revoked_before_fetch"]["answer"]=={"status":"denied"}
    assert cases["revoked_before_fetch"]["body_delivery_count"]==0
    assert all(not r["forbidden_task_deliveries"] for k,r in cases.items() if k!="unsafe_post_filter")
    print(json.dumps({"gold":[["a-1",1],["a-2",2]],"cases":cases,
                      "scope":"fixed metadata scores, rule reranking, artificial units, SQLite bodies; no embedding/LLM/remote authorization"}))


if __name__ == "__main__":
    main()
