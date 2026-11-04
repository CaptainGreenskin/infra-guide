"""Actual Chinese SQLite FTS5/BM25, declared second ranker, exact RRF and fixed graded labels."""
from fractions import Fraction
import json
import math
import re
import sqlite3

DOCS = [
    (1, "a-backup", "A", 1, 1, "数据库备份支持恢复。恢复前校验日志链。"),
    (2, "a-dr", "A", 1, 1, "灾难恢复要求验证备份和附件一致。"),
    (3, "a-cache", "A", 1, 1, "缓存预热减少冷启动延迟。"),
    (4, "a-plan", "A", 1, 1, "备份方案应跨故障域，并核对恢复点。"),
    (5, "a-old", "A", 1, 0, "数据库备份恢复只需重启主机。"),
    (6, "b-private", "B", 1, 1, "数据库备份恢复涉及乙租户内部记录。"),
    (7, "a-network", "A", 1, 1, "网络路由与名称解析决定请求路径。"),
    (8, "a-archive", "A", 1, 1, "查找旧数据时，先验证归档是否能重放。"),
]
GRADES = {"a-backup": 3, "a-dr": 2, "a-plan": 1, "a-archive": 2}


def tokens(text):
    result = []
    for part in re.findall(r"[\u4e00-\u9fff]+|[A-Za-z0-9_]+", text):
        if re.fullmatch(r"[\u4e00-\u9fff]+", part):
            result.extend(part[i:i+2] for i in range(len(part)-1)) if len(part)>1 else result.append(part)
        else:
            result.append(part.lower())
    return result


def query_syntax(text):
    terms = list(dict.fromkeys(tokens(text)))
    return " OR ".join('"'+term+'"' for term in terms)


def search(db, text, require_fresh=True):
    clause = " AND CAST(segmented.version AS INT)=d.version" if require_fresh else ""
    sql = ("SELECT d.doc_id,bm25(segmented),d.version,segmented.version FROM segmented JOIN docs d ON d.id=segmented.rowid "
           "WHERE segmented MATCH ? AND d.tenant=? AND d.current=1"+clause+" ORDER BY bm25(segmented),d.doc_id LIMIT ?")
    return [{"id": identity, "bm25": score, "document_version": current, "index_version": int(indexed)}
            for identity, score, current, indexed in db.execute(sql, (query_syntax(text), "A", 8))]


def rrf(rankings, constant=60):
    if type(constant) is not int or constant < 1:
        raise ValueError("positive integer rank constant required")
    scores, ranks = {}, {}
    for name, values in rankings.items():
        if len(set(values)) != len(values):
            raise ValueError("duplicate_document_in_one_ranker")
        for position, identity in enumerate(values, 1):
            scores[identity] = scores.get(identity, Fraction(0)) + Fraction(1, constant+position)
            ranks.setdefault(identity, {})[name] = position
    return [{"id": identity, "score": float(scores[identity]), "exact": str(scores[identity]), "ranks": ranks[identity]}
            for identity in sorted(scores, key=lambda identity: (-scores[identity], identity))]


def metric(ranked, count=3):
    chosen = ranked[:count]
    relevant = {identity for identity, grade in GRADES.items() if grade>0}
    hits = len(set(chosen)&relevant)
    dcg = sum((2**GRADES.get(identity, 0)-1)/math.log2(position+1) for position, identity in enumerate(chosen, 1))
    ideal = sum((2**grade-1)/math.log2(position+1)
                for position, grade in enumerate(sorted(GRADES.values(), reverse=True)[:count], 1))
    first = next((i for i, identity in enumerate(chosen, 1) if identity in relevant), None)
    return {"precision_at_3": hits/count, "recall_at_3": hits/len(relevant),
            "reciprocal_rank_at_3": 1/first if first else 0, "dcg_at_3": dcg, "ideal_dcg_at_3": ideal,
            "ndcg_at_3": dcg/ideal, "label_source": "declared_teaching_grades_not_model_judgments"}


def main():
    db = sqlite3.connect(":memory:")
    db.executescript("CREATE TABLE docs(id INT PRIMARY KEY,doc_id TEXT,tenant TEXT,version INT,current INT,body TEXT);"
                     "CREATE VIRTUAL TABLE raw_index USING fts5(body,tokenize='unicode61');"
                     "CREATE VIRTUAL TABLE segmented USING fts5(terms,version UNINDEXED,tokenize='unicode61');"
                     "CREATE VIRTUAL TABLE raw_vocabulary USING fts5vocab(raw_index,'row');")
    db.executemany("INSERT INTO docs VALUES(?,?,?,?,?,?)", DOCS)
    for identity, _, _, version, _, body in DOCS:
        db.execute("INSERT INTO raw_index(rowid,body) VALUES(?,?)", (identity, body))
        db.execute("INSERT INTO segmented(rowid,terms,version) VALUES(?,?,?)", (identity, " ".join(tokens(body)), version))
    raw_hits = [row[0] for row in db.execute("SELECT rowid FROM raw_index WHERE raw_index MATCH ?", ("恢复",))]
    raw_term_present = db.execute("SELECT 1 FROM raw_vocabulary WHERE term=?", ("恢复",)).fetchone() is not None
    lexical = search(db, "数据库恢复")
    assert not raw_hits and not raw_term_present
    assert "a-backup" in [r["id"] for r in lexical]
    assert not ({r["id"] for r in lexical}&{"a-old", "b-private"})
    assert [r["bm25"] for r in lexical] == sorted(r["bm25"] for r in lexical)
    second = ["a-archive", "a-backup", "a-plan"]  # Declared second-ranker result, not an embedding inference.
    fused = rrf({"lexical": [r["id"] for r in lexical], "declared_second": second})
    duplicate_rejected = False
    try:
        rrf({"bad": ["a-backup", "a-backup"]})
    except ValueError:
        duplicate_rejected = True
    assert duplicate_rejected
    db.execute("UPDATE docs SET version=2,body=? WHERE doc_id='a-backup'", ("数据库恢复必须先校验版本二日志。",))
    unsafe_stale = search(db, "数据库恢复", False)
    stale_row = next(row for row in unsafe_stale if row["id"]=="a-backup")
    safe_stale = search(db, "数据库恢复", True)
    assert stale_row["document_version"] == 2 and stale_row["index_version"] == 1
    assert "a-backup" not in [r["id"] for r in safe_stale]
    body = db.execute("SELECT body FROM docs WHERE doc_id='a-backup'").fetchone()[0]
    db.execute("UPDATE segmented SET terms=?,version=2 WHERE rowid=1", (" ".join(tokens(body)),))
    repaired = next(row for row in search(db, "数据库恢复") if row["id"]=="a-backup")
    assert repaired["document_version"] == repaired["index_version"] == 2
    report = {"sqlite": sqlite3.sqlite_version, "documents": len(DOCS), "raw_query": "恢复",
              "unicode61_raw_hits": raw_hits, "raw_has_standalone_query_term": raw_term_present,
              "query": "数据库恢复", "query_terms": tokens("数据库恢复"), "query_expression": query_syntax("数据库恢复"),
              "actual_lexical_results": lexical, "declared_second_ranker": second,
              "rank_constant": 60, "rrf_results": fused, "grades": GRADES,
              "lexical_metrics": metric([r["id"] for r in lexical]), "rrf_metrics": metric([r["id"] for r in fused]),
              "duplicate_ranker_input_rejected": duplicate_rejected,
              "stale_index_without_check": stale_row, "stale_index_excluded_with_check": True,
              "after_reindex": repaired,
              "scope": "actual_SQLite_FTS5_BM25_plus_declared_second_order_RRF_not_embedding_LLM_or_vector_database",
              "limits": ["character bigrams are a teaching tokenizer, not a general Chinese linguistic analyzer",
                         "tenant/current filters precede LIMIT in SQL semantics; corpus-level BM25 statistics remain shared",
                         "real access revocation and body-delivery tests remain in the separate retrieval_pipeline experiment",
                         "graded relevance is a fixed example, not a real retrieval benchmark"]}
    db.close()
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
