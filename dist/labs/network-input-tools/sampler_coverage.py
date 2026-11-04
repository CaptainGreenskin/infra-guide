"""Real PyTorch 2.5.1 two-rank DataLoader traces, CPU/Gloo, no training step."""
from collections import Counter
from datetime import timedelta
import json
from pathlib import Path
import tempfile

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
from torch.utils.data import DataLoader, DistributedSampler, IterableDataset, get_worker_info

SIZE=11
WORLD=2


class Stream(IterableDataset):
    def __init__(self,rank,shard_workers):
        self.rank=rank
        self.shard_workers=shard_workers

    def __iter__(self):
        info=get_worker_info()
        worker=info.id if info else 0
        workers=info.num_workers if info else 1
        for index in range(SIZE):
            if self.shard_workers:
                selected=index%(WORLD*workers)==self.rank*workers+worker
            else:
                # Wrong: every local worker repeats the same rank's stream.
                selected=index%WORLD==self.rank
            if selected:
                yield {'id':index,'worker':worker}


def rank_worker(rank,rendezvous,folder):
    torch.set_num_threads(1)
    dist.init_process_group('gloo',init_method=rendezvous,rank=rank,world_size=WORLD,
                            timeout=timedelta(seconds=120))
    try:
        dataset=list(range(SIZE))
        maps={}
        for sampler_drop in (False,True):
            for loader_drop in (False,True):
                sampler=DistributedSampler(dataset,num_replicas=WORLD,rank=rank,
                                           shuffle=False,drop_last=sampler_drop)
                loader=DataLoader(dataset,batch_size=4,sampler=sampler,
                                  drop_last=loader_drop,num_workers=0)
                key='sampler_'+str(int(sampler_drop))+'_loader_'+str(int(loader_drop))
                maps[key]={'sampler_indices':list(sampler),
                           'batches':[batch.tolist() for batch in loader]}
        maps['no_sampler']={'sampler_indices':list(range(SIZE)),
                            'batches':[b.tolist() for b in DataLoader(dataset,batch_size=4)]}
        sampler=DistributedSampler(dataset,num_replicas=WORLD,rank=rank,seed=17,shuffle=True)
        sampler.set_epoch(0)
        first=list(sampler)
        repeated=list(sampler)
        sampler.set_epoch(1)
        second=list(sampler)
        assert first==repeated and first!=second

        streams={}
        for label,shard_workers,drop in [('unsharded_workers',False,False),
                                        ('sharded_keep',True,False),('sharded_drop',True,True)]:
            loader=DataLoader(Stream(rank,shard_workers),batch_size=2,num_workers=2,
                              drop_last=drop,multiprocessing_context='spawn',
                              prefetch_factor=2,timeout=45)
            batches=[]
            for batch in loader:
                ids=batch['id'].tolist()
                workers=batch['worker'].tolist()
                assert len(set(workers))==1
                batches.append({'ids':ids,'worker':workers[0]})
            streams[label]={'batches':batches}
        local={'rank':rank,'map':maps,'shuffle':{'epoch_0':first,'without_set_epoch':repeated,'epoch_1':second},
               'iterable':streams}
        gathered=[None]*WORLD
        # Only this final collection is collective, not the per-batch loading loop.
        dist.all_gather_object(gathered,local)
        if rank==0:
            Path(folder,'ranks.json').write_text(json.dumps(gathered))
    finally:
        dist.destroy_process_group()


def coverage(ids):
    counts=Counter(ids)
    return {'deliveries':len(ids),'unique':len(counts),
            'repeated_ids':sorted(i for i,count in counts.items() if count>1),
            'missing_ids':sorted(set(range(SIZE))-set(ids))}


def run():
    with tempfile.TemporaryDirectory(prefix='sampler-coverage-') as folder:
        mp.spawn(rank_worker,args=('file://'+str(Path(folder,'rendezvous').absolute()),folder),
                 nprocs=WORLD,join=True)
        ranks=json.loads(Path(folder,'ranks.json').read_text())
    summary={}
    for key in ranks[0]['map']:
        batches=[rank['map'][key]['batches'] for rank in ranks]
        ids=[i for rank_batches in batches for batch in rank_batches for i in batch]
        summary[key]={**coverage(ids),'batch_counts':[len(x) for x in batches]}
    streams={}
    for key in ranks[0]['iterable']:
        batches=[rank['iterable'][key]['batches'] for rank in ranks]
        ids=[i for rank_batches in batches for batch in rank_batches for i in batch['ids']]
        streams[key]={**coverage(ids),'batch_counts':[len(x) for x in batches]}
    assert summary['sampler_0_loader_0']=={'deliveries':12,'unique':11,'repeated_ids':[0],
                                         'missing_ids':[],'batch_counts':[2,2]}
    assert summary['sampler_1_loader_0']['missing_ids']==[10]
    assert summary['sampler_0_loader_1']['missing_ids']==[8,9,10]
    assert summary['sampler_1_loader_1']['deliveries']==8
    assert summary['no_sampler']['deliveries']==22
    assert streams['unsharded_workers']['deliveries']==22
    assert streams['sharded_keep']=={'deliveries':11,'unique':11,'repeated_ids':[],
                                     'missing_ids':[],'batch_counts':[4,3]}
    assert streams['sharded_drop']=={'deliveries':8,'unique':8,'repeated_ids':[],
                                     'missing_ids':[8,9,10],'batch_counts':[2,2]}
    return {'torch':torch.__version__,'device':'cpu','backend':'gloo','world_size':WORLD,
            'dataset_size':SIZE,'workers_per_rank':2,'map_batch_size':4,'stream_batch_size':2,
            'map_summary':summary,'iterable_summary':streams,'ranks':ranks,
            'training_step_executed':False,'scope':'actual_sampler_and_worker_processes_not_gpu_throughput'}


if __name__=='__main__':
    print(json.dumps(run(),ensure_ascii=False,indent=2))
