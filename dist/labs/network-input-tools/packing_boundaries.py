"""Numerical attention reference for two independent packed documents.

Tiny fixed token vectors and additive position tags, not a tokenizer/LLM/RoPE run.
"""
import json
import math

DOCS=[[11,12,2],[21,2]]
EMBED={11:[1.,0.],12:[.5,.5],2:[0.,1.],21:[-1.,0.]}


def inputs(tokens,positions):
    return [[EMBED[token][0]+.2*position,EMBED[token][1]-.1*position]
            for token,position in zip(tokens,positions)]


def attention(values,allowed):
    output=[]
    for i,query in enumerate(values):
        keys=[j for j in range(len(values)) if allowed[i][j]]
        scores=[sum(a*b for a,b in zip(query,values[j]))/math.sqrt(2) for j in keys]
        maximum=max(scores)
        exponentials=[math.exp(s-maximum) for s in scores]
        weights=[e/sum(exponentials) for e in exponentials]
        output.append([sum(w*values[j][k] for w,j in zip(weights,keys)) for k in range(2)])
    return output


def error(a,b):
    return max(abs(x-y) for ar,br in zip(a,b) for x,y in zip(ar,br))


def run():
    reference=[]
    for document in DOCS:
        n=len(document)
        reference.extend(attention(inputs(document,list(range(n))),
                                   [[j<=i for j in range(n)] for i in range(n)]))
    tokens=[t for doc in DOCS for t in doc]
    document_ids=[0,0,0,1,1]
    positions=[0,1,2,0,1]
    allowed=[[j<=i and document_ids[i]==document_ids[j] for j in range(5)] for i in range(5)]
    causal=[[j<=i for j in range(5)] for i in range(5)]
    packed=attention(inputs(tokens,positions),allowed)
    leaking=attention(inputs(tokens,positions),causal)
    wrong_positions=attention(inputs(tokens,list(range(5))),allowed)
    labels=[tokens[i+1] if document_ids[i+1]==document_ids[i] else -100 for i in range(4)]
    assert labels==[12,2,-100,2]
    assert error(reference,packed)<1e-12
    assert error(reference,leaking)>.1 and error(reference,wrong_positions)>.1
    return {'documents':DOCS,'packed_tokens':tokens,'document_ids':document_ids,'positions':positions,
            'allowed_attention':allowed,'shifted_labels':labels,'valid_targets':3,
            'plain_concatenation_targets':4,
            'independent_outputs':reference,'packed_outputs':packed,
            'correct_max_error':error(reference,packed),'cross_document_max_error':error(reference,leaking),
            'global_positions_max_error':error(reference,wrong_positions),
            'scope':'stdlib_fixed_attention_math_no_language_model_or_gpu'}


if __name__=='__main__':
    print(json.dumps(run(),ensure_ascii=False,indent=2))
