"""Small, deterministic attention and gradient-normalization experiments.
Python 3.9+ standard library only. No LLM, tokenizer, autograd or GPU.
"""
import argparse
import json
import math
from pathlib import Path
import platform


def attend(query, keys, values):
    if not keys or len(keys) != len(values):
        raise ValueError('Nonempty matching keys and values required')
    dimension = len(query)
    if not dimension or any(len(k) != dimension for k in keys):
        raise ValueError('Query and key dimensions must match')
    value_dimension = len(values[0])
    if not value_dimension or any(len(v) != value_dimension for v in values):
        raise ValueError('Value dimensions must match')
    scores = [sum(q*k for q, k in zip(query,key))/math.sqrt(dimension) for key in keys]
    maximum = max(scores)
    exps = [math.exp(score-maximum) for score in scores]
    weights = [value/sum(exps) for value in exps]
    result = [sum(weight*value[j] for weight,value in zip(weights,values)) for j in range(value_dimension)]
    return result, weights


def full_attention(queries, keys, values, causal=True):
    if not (len(queries) == len(keys) == len(values)):
        raise ValueError('This self-attention example uses equal sequence lengths')
    rows, weights = [], []
    for i, query in enumerate(queries):
        end = i+1 if causal else len(keys)
        row, probability = attend(query, keys[:end], values[:end])
        rows.append(row)
        weights.append(probability+[0.0]*(len(keys)-end))
    return rows, weights


def cached_attention(queries, keys, values):
    cached_keys, cached_values, rows = [], [], []
    for query,key,value in zip(queries,keys,values):
        cached_keys.append(key)
        cached_values.append(value)
        row,_ = attend(query,cached_keys,cached_values)
        rows.append(row)
    return rows


def normalization(rank_targets, parameter=1.0):
    # Per-token quadratic loss: 0.5 * (parameter - target)**2.
    # This analytic derivative isolates reduction algebra, not model training.
    count = sum(len(targets) for targets in rank_targets)
    if count == 0:
        raise ValueError('No valid tokens in the global update')
    world_size = len(rank_targets)
    sums = [sum(parameter-target for target in targets) for targets in rank_targets]
    scaled = [world_size*value/count for value in sums]
    return sum(scaled)/world_size


def experiment():
    ids = [0,1,2,3,4]  # Explicit toy IDs, not a real text tokenizer.
    inputs,targets = ids[:-1],ids[1:]
    assert inputs == [0,1,2,3] and targets == [1,2,3,4]
    queries = [[1,0],[0,1],[1,1],[-1,1]]
    keys = [[1,0],[0,1],[1,1],[1,-1]]
    values = [[10,0],[0,20],[30,10],[5,-5]]
    full,weights = full_attention(queries,keys,values)
    cached = cached_attention(queries,keys,values)
    error = max(abs(a-b) for row1,row2 in zip(full,cached) for a,b in zip(row1,row2))
    assert error < 1e-12
    assert all(abs(sum(row)-1)<1e-12 for row in weights)
    assert all(weights[i][j] == 0 for i in range(4) for j in range(i+1,4))
    changed = values[:-1]+[[999,-999]]
    changed_output,_ = full_attention(queries,keys,changed)
    assert changed_output[:3] == full[:3]
    unmasked,_ = full_attention(queries,keys,values,causal=False)
    changed_unmasked,_ = full_attention(queries,keys,changed,causal=False)
    assert unmasked[0] != changed_unmasked[0]
    # Independent oracle: zero scores produce uniform weights over each prefix.
    uniform,_ = full_attention([[0],[0],[0]],[[0],[0],[0]],[[2],[4],[100]])
    assert all(abs(row[0]-expected)<1e-12 for row,expected in zip(uniform,[2,3,106/3]))
    changed_visible,_ = full_attention(queries,keys,[[11,1]]+values[1:])
    assert changed_visible[0] != full[0]
    rank_targets = [[0],[3,3,3]]
    parameter = 1.0
    losses = [[0.5*(parameter-y)**2 for y in rank] for rank in rank_targets]
    local_mean_loss = sum(sum(rank)/len(rank) for rank in losses)/2
    global_mean_loss = sum(map(sum,losses))/4
    wrong_gradient = sum(sum(parameter-y for y in rank)/len(rank) for rank in rank_targets)/2
    corrected_gradient = normalization(rank_targets)
    def global_loss(w):
        return sum(0.5*(w-y)**2 for rank in rank_targets for y in rank)/4
    epsilon = 1e-6
    numeric_gradient = (global_loss(parameter+epsilon)-global_loss(parameter-epsilon))/(2*epsilon)
    assert abs(corrected_gradient-numeric_gradient)<1e-8
    assert local_mean_loss == 1.25 and global_mean_loss == 1.625
    assert wrong_gradient == -0.5 and corrected_gradient == -1.25
    # Two microsteps, with the same denominator over the complete update.
    microsteps = [[[0],[3]], [[],[3,3]]]
    accumulated = sum(sum(2*sum(parameter-y for y in rank)/4 for rank in step)/2 for step in microsteps)
    assert accumulated == corrected_gradient
    assert normalization([[],[3]]) == -2
    try:
        normalization([[],[]])
    except ValueError:
        empty_rejected = True
    else:
        raise AssertionError('Empty update accepted')
    return {
        'status':'passed','environment':platform.system()+' '+platform.machine()+' Python '+platform.python_version(),
        'shift':{'inputs':inputs,'targets':targets},
        'attention':{'queries':queries,'keys':keys,'values':values,'weights':weights,'output':full,'cache_max_abs_error':error,'future_value_cannot_change_past':True,'unmasked_negative_control_changes_past':True,'uniform_oracle':[row[0] for row in uniform],'visible_value_changes_output':True},
        'normalization':{'valid_tokens_per_rank':[1,3],'incorrect_mean_of_local_losses':local_mean_loss,'global_mean_loss':global_mean_loss,'incorrect_gradient':wrong_gradient,'corrected_gradient':corrected_gradient,'finite_difference_gradient':numeric_gradient,'accumulated_gradient':accumulated,'empty_rank_supported':True,'empty_global_update_rejected':empty_rejected},
        'scope':'Fixed single-head attention vectors without dropout; analytic quadratic token losses; Python float arithmetic.',
        'not_verified':['Transformer model training','tokenizer behavior','PyTorch autograd or DDP processes','GPU kernels or timing','multi-layer position and cache implementation','mixed precision']
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',default='runs/attention-report.json')
    args = parser.parse_args()
    result = experiment()
    output = Path(args.output)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))
