"""Run on every node. This inventories local devices; it does not prove NCCL connectivity."""
import json
import platform
import torch
import torch.distributed as dist

print(json.dumps({
    'python': platform.python_version(), 'torch': str(torch.__version__),
    'cuda_runtime': torch.version.cuda, 'cuda_available': torch.cuda.is_available(),
    'nccl_available': dist.is_nccl_available(), 'gloo_available': dist.is_gloo_available(),
    'gpu_count': torch.cuda.device_count(),
    'gpus': [{'index': i, 'name': torch.cuda.get_device_name(i),
              'memory_gib': round(torch.cuda.get_device_properties(i).total_memory / 2**30, 2)}
             for i in range(torch.cuda.device_count())]
}, indent=2))
