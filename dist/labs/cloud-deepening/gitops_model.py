"""Small reconciliation model, deliberately independent of Argo CD/Kubernetes APIs."""
from copy import deepcopy
import json


def reconcile(desired, actual, inventory, revision_changed=False, self_heal=False, prune=False):
    observed=deepcopy(actual)
    owned=set(inventory)
    actions=[]
    for name,spec in desired.items():
        mismatch=name not in observed or observed[name]['spec']!=spec
        if mismatch and (revision_changed or self_heal):
            observed[name]={'spec':deepcopy(spec),'available':0}
            owned.add(name)
            actions.append('apply:'+name)
    for name in sorted(owned-set(desired)):
        if prune and name in observed:
            del observed[name]
            actions.append('delete:'+name)
            owned.discard(name)
    synced=all(name in observed and observed[name]['spec']==spec for name,spec in desired.items())
    synced=synced and not (owned-set(desired))
    healthy=bool(desired) and all(name in observed and observed[name]['available']>=spec['replicas']
                                 for name,spec in desired.items())
    return observed,owned,{'synced_model':synced,'healthy_model':healthy,'actions':actions}


def run():
    desired={'reports':{'replicas':2,'digest':'sha256:'+'1'*64}}
    actual={'reports':{'spec':{'replicas':5,'digest':'sha256:'+'1'*64},'available':5},
            'unmanaged':{'spec':{'replicas':1,'digest':'other'},'available':1}}
    inventory={'reports'}
    unchanged,_,off=reconcile(desired,actual,inventory)
    assert unchanged['reports']['spec']['replicas']==5 and not off['synced_model']
    healed,owned,on=reconcile(desired,actual,inventory,self_heal=True)
    assert healed['reports']['spec']['replicas']==2 and on['synced_model'] and not on['healthy_model']
    healed['reports']['available']=2
    _,_,ready=reconcile(desired,healed,owned)
    assert ready['synced_model'] and ready['healthy_model']
    healed['config']={'spec':{'content':'v1'},'available':1}
    owned.add('config')
    retained,_,no_prune=reconcile(desired,healed,owned,revision_changed=True,prune=False)
    assert 'config' in retained and not no_prune['synced_model']
    pruned,_,yes_prune=reconcile(desired,healed,owned,revision_changed=True,prune=True)
    assert 'config' not in pruned and 'reports' in pruned and 'unmanaged' in pruned
    # A healthy matching specification still needs a separate business assertion.
    response={'status':200,'report_version':'old'}
    business_ok=response['status']==200 and response['report_version']=='expected'
    assert not business_ok
    return {'status':'passed','self_heal_off_replicas':5,'self_heal_on_replicas':2,
            'after_spec_apply':on,'after_readiness':ready,'business_assertion_passed':business_ok,
            'prune_off_retains_resource':True,'prune_on_deletes_tracked_only':True,
            'scope':'Deterministic teaching model, not an Argo CD controller or a Kubernetes cluster. Status names are model outputs, not complete Argo health rules.'}


if __name__=='__main__':
    print(json.dumps(run(),ensure_ascii=False,indent=2))
