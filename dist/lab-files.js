const labFiles = {"README.md": "# CloudInfra Guide · DDP 实战包\n\n目标：用一个可重复的小型分类任务，验证单进程、单机多进程、两机四卡、梯度累积与 epoch 边界恢复。\n这是训练系统机制实验，合成数据和小型 MLP 不代表 LLM 或 GPU 硬件基准。\n\n## 环境与文件\n\n- 基线 API：Python 3.10–3.12、PyTorch 2.5.1。新版本可另建环境验证，不把 latest 当作复现条件。\n- GPU 路径：Linux、NVIDIA CUDA GPU；每个 torchrun 进程占一张可见 GPU。两端软件和训练配置一致。\n- CPU 路径：Gloo，FP32，仅用于验证程序逻辑。\n- train_ddp.py：完整训练、指标与恢复实现。\n- check_env.py：环境清单；不证明跨节点通信已经正常。\n- launch_2nodes.sh：在两台机器分别运行的启动脚本。\n- compare_checkpoints.py：比较不中断与恢复运行的模型和优化器结果。\n- validation.json：本次交付实际执行的验证记录。\n- environment-lock.txt：CPU 实测环境包版本；GPU 使用上面的 CUDA 安装说明。\n\n在实验目录创建独立环境：\n\n```bash\npython3 -m venv .venv\nsource .venv/bin/activate\npython -m pip install --upgrade pip\n# Linux NVIDIA GPU 示例：先确认驱动支持 CUDA 12.4 运行时。\npython -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124\n# CPU/macOS 验证环境改用：python -m pip install torch==2.5.1\npython check_env.py\npython -m pip freeze > environment-lock.txt\n```\n\nGPU 环境同时记录 nvidia-smi 输出。驱动、容器可见设备和 PyTorch wheel 内的 CUDA 运行时是不同层次；\n不要仅凭系统 nvcc 版本判断环境兼容性。安装方式见 https://pytorch.org/get-started/previous-versions/ 。\n\n## 1. CPU 两进程验证\n\n```bash\ntorchrun --standalone --nproc-per-node=2 train_ddp.py \\\n  --device=cpu --epochs=4 --samples=1024 --hidden=32 \\\n  --batch-size=32 --accum=2 --save-dir=runs/cpu-full\n```\n\n预期：一条 rank 0 的 start 记录，world_size=2、effective_batch=128；每个 epoch 后出现 epoch 和 checkpoint 记录。\nepoch.samples=1024，attempted_update_windows=8、applied_optimizer_steps=8。\n前者是走到累积窗口末的次数，后者是本轮实际完成 AdamW.step 调用的次数；optimizer_steps 保留为后者的兼容别名。\n程序固定 fused=False，用优化器 post hook 计数，并检查各 rank 的两项计数一致。\n计数不能证明每个参数都变化或任务质量提高，loss 的具体数值以实际运行记录为准。\n\nFP16 的 GradScaler 可因非有限梯度跳过 step。独立探针 `python optimizer_step_probe.py`\n在单进程 CPU 上直接构造一次有限梯度和一次 inf 梯度，预期尝试2次、实际调用1次；\n它不执行 CUDA FP16、autocast 或 DDP，不把 CPU 结果当成 GPU 验证。\n两次 scaler.step 都可能返回 None，不能用返回值区分跳步。\n\n两项日志均是每轮计数。恢复后从本轮重新计数，不用 epoch 数倒推历史实际更新数；\n因此无需改变旧检查点格式。若业务需要跨恢复累计值，应另外保存有版本的累计记录。\n\n## 2. 单卡与单机两卡\n\n```bash\ntorchrun --standalone --nproc-per-node=1 train_ddp.py \\\n  --device=cuda --epochs=4 --batch-size=64 --accum=2 --save-dir=runs/gpu1\n\ntorchrun --standalone --nproc-per-node=2 train_ddp.py \\\n  --device=cuda --epochs=4 --batch-size=64 --accum=2 --save-dir=runs/gpu2\n```\n\n这两条是启动验证，全局有效 batch 分别为 128、256。不能据此直接声称两卡训练同一质量目标的加速比。\n固定全局 batch 的对照可分别使用 (1 卡, batch=64, accum=8)、(2 卡,64,4)、(4 卡,64,2)。\n比较还需控制模型、数据、精度、预热和质量目标，参考网站性能章节。\n\n## 3. 两机四卡\n\n准备两台每台至少两张可见 GPU 的 Linux 实例；代码版本、Python 环境、模型与超参数一致。\n示例私网地址 A=10.0.1.10、B=10.0.1.11，应替换为实际地址。\nTRAIN_OUT 是双方能读取的同一个共享 POSIX 文件系统路径；对象存储 URL 不能直接作为 Path 使用。\n\n网络验收：两节点之间的私网双向可达；MASTER_PORT 只用于初始化会合，NCCL 还使用额外的连接和端口。\n在这两个训练节点/安全组之间配置适当的通信规则，并按平台要求验证 RDMA（若使用）。不要把端口开放给公网。\n本示例使用固定成员和静态 node rank，不配置弹性自动重启。\n\n节点 A：\n\n```bash\nexport NODE_RANK=0\nexport MASTER_ADDR=10.0.1.10\nexport MASTER_PORT=29500\nexport TRAIN_OUT=/mnt/shared/cloudinfra/run-001\nexport NCCL_DEBUG=INFO\nbash launch_2nodes.sh\n```\n\n节点 B，在 A 启动后及时运行：\n\n```bash\nexport NODE_RANK=1\nexport MASTER_ADDR=10.0.1.10\nexport MASTER_PORT=29500\nexport TRAIN_OUT=/mnt/shared/cloudinfra/run-001\nexport NCCL_DEBUG=INFO\nbash launch_2nodes.sh\n```\n\n两端保持会话，等待完成。不要使用公网 IP 或把 B 的地址填入 B 的 MASTER_ADDR。\nGPU 逻辑序号由 CUDA_VISIBLE_DEVICES 影响；LOCAL_RANK 是节点内序号，不是全局 RANK。\n\n验收：start.world_size=4、effective_batch=512；每个 epoch 处理 8192 样本、16 次 optimizer 更新；\n所有进程退出码为 0，rank 0 生成 checkpoint.pt；之后用同样 world size 运行恢复测试。\n仅看到 torchrun 进程、GPU 显存分配或端口连通，都不构成训练成功证明。\n\n## 4. 恢复与一致性实验\n\n先用 CPU 路径验证固定配置的恢复逻辑：\n\n```bash\n# 完整对照已在第 1 步运行。\ntorchrun --standalone --nproc-per-node=2 train_ddp.py \\\n  --device=cpu --epochs=2 --samples=1024 --hidden=32 \\\n  --batch-size=32 --accum=2 --save-dir=runs/cpu-split\n\ntorchrun --standalone --nproc-per-node=2 train_ddp.py \\\n  --device=cpu --epochs=4 --samples=1024 --hidden=32 \\\n  --batch-size=32 --accum=2 --resume=runs/cpu-split/checkpoint.pt \\\n  --save-dir=runs/cpu-resumed\n\npython compare_checkpoints.py runs/cpu-full/checkpoint.pt runs/cpu-resumed/checkpoint.pt\n```\n\n--epochs 是累计目标，不是追加 epoch 数；从 next_epoch=2 恢复到 4，会运行第 3 和第 4 个 epoch。\nGPU 的对应恢复：两端均运行 bash launch_2nodes.sh --epochs=6 --resume=\"$TRAIN_OUT/checkpoint.pt\"。\n先在隔离的实验作业中验证，不能把 CPU 数值一致性当作跨 GPU/CUDA 版本的确定性保证。\n\n本实验仅支持 epoch 边界、同 world size、同设备类型和同 batch 配置恢复。\n它保存各 rank 的 CPU/CUDA/loader RNG，因而覆盖模型中的 Dropout。\n中途故障会从最后一个已提交 epoch 重做；不提供样本级 exactly-once 或弹性成员变化恢复。\n\n## 5. AMP 与梯度累积\n\nFP32 验证通过后，再加 --precision=bf16（需硬件/runtime 支持），或 --precision=fp16。\nFP16 使用 GradScaler；每个有效 batch 完成后才 step/update。no_sync 同时包住 forward 和 backward。\n脚本强制每个 rank 的 batch 数能整除 accum，以避免末尾不足一组时梯度归一化错误。\nDistributedSampler 与 DataLoader 均使用 drop_last=True；任意样本数下可能丢弃尾部样本，metrics.samples 为实际处理数。\n\n## 6. 常见故障与证据\n\n| 现象 | 首先检查 |\n|---|---|\n| 初始化一直等待 | 两端 nnodes、MASTER_ADDR/PORT 是否一致，node rank 是否重复，另一端是否退出 |\n| invalid device ordinal | 可见 GPU 数、nproc-per-node、LOCAL_RANK 与设备绑定 |\n| NCCL 连接超时 | 双向网络、额外通信端口、网卡选择、每个 rank 最早的异常日志 |\n| checkpoint 找不到 | 所有节点是否真正挂载同一持久化路径，是否完整提交 |\n| 恢复配置不匹配 | world size、batch、accum、精度、模型或数据配置是否改变 |\n| 吞吐没提升 | 小模型通信开销、数据等待、不同 batch 口径与预热 |\n\n需要时按实际网卡设置 NCCL_SOCKET_IFNAME；不要盲目复制别人的 eth0/ens5。\n保留环境清单、完整命令、各节点日志和 checkpoint 元数据。不要把临时关闭 IB、P2P 等手段当作长期调优结论。\n\n## 验证边界\n\n实际执行结果以 validation.json 为准。本次 CPU/Gloo 两进程、连续与恢复状态对照、错误配置拒绝均通过。两端启动脚本也在同一主机上用两个启动代理、四个 CPU rank 验证；它不代表两个物理节点的网络已验证。GPU/NCCL、多物理节点网络、BF16/FP16 和 Kubernetes 部署需要在目标环境验收。\n文中命令均为用户执行的实验步骤，不会自动申请云资源或产生云账单。\n", "check_env.py": "\"\"\"Run on every node. This inventories local devices; it does not prove NCCL connectivity.\"\"\"\nimport json\nimport platform\nimport torch\nimport torch.distributed as dist\n\nprint(json.dumps({\n    'python': platform.python_version(), 'torch': str(torch.__version__),\n    'cuda_runtime': torch.version.cuda, 'cuda_available': torch.cuda.is_available(),\n    'nccl_available': dist.is_nccl_available(), 'gloo_available': dist.is_gloo_available(),\n    'gpu_count': torch.cuda.device_count(),\n    'gpus': [{'index': i, 'name': torch.cuda.get_device_name(i),\n              'memory_gib': round(torch.cuda.get_device_properties(i).total_memory / 2**30, 2)}\n             for i in range(torch.cuda.device_count())]\n}, indent=2))\n", "compare_checkpoints.py": "\"\"\"Compare model, optimizer, scaler and RNG state after uninterrupted/resumed CPU runs.\"\"\"\nimport argparse\nimport torch\n\n\ndef compare(a, b, path='state'):\n    if isinstance(a, torch.Tensor):\n        if not isinstance(b, torch.Tensor) or a.dtype != b.dtype or a.shape != b.shape:\n            raise AssertionError(f'{path}: tensor metadata differs')\n        if not torch.equal(a, b):\n            raise AssertionError(f'{path}: tensor values differ')\n    elif isinstance(a, dict):\n        if a.keys() != b.keys():\n            raise AssertionError(f'{path}: keys differ')\n        for k in a:\n            compare(a[k], b[k], f'{path}.{k}')\n    elif isinstance(a, (tuple, list)):\n        if len(a) != len(b):\n            raise AssertionError(f'{path}: lengths differ')\n        for i, (x, y) in enumerate(zip(a, b)):\n            compare(x, y, f'{path}[{i}]')\n    elif a != b:\n        raise AssertionError(f'{path}: {a!r} != {b!r}')\n\n\nif __name__ == '__main__':\n    p = argparse.ArgumentParser(description=__doc__)\n    p.add_argument('uninterrupted')\n    p.add_argument('resumed')\n    args = p.parse_args()\n    a = torch.load(args.uninterrupted, map_location='cpu', weights_only=True)\n    b = torch.load(args.resumed, map_location='cpu', weights_only=True)\n    compare(a, b)\n    print('PASS: model, optimizer, scaler, RNG, epoch and configuration are exactly equal.')\n", "environment-lock.txt": "# CPU validation environment: macOS arm64, Python 3.12.13\n# GPU installation uses the CUDA wheel instructions in README.md.\nJinja2==3.1.6\nMarkupSafe==3.0.4\nfilelock==4.2.7\nfsspec==2026.9.0\nmpmath==1.3.0\nnetworkx==3.7\nnumpy==2.1.3\nsetuptools==84.2.1\nsympy==1.13.1\ntorch==2.5.1\ntyping_extensions==4.16.0\n", "launch_2nodes.sh": "#!/usr/bin/env bash\n# Run on BOTH nodes with NODE_RANK=0 / NODE_RANK=1. No machines are provisioned.\nset -euo pipefail\n: \"${NODE_RANK:?Set NODE_RANK=0 on node A, 1 on node B}\"\n: \"${MASTER_ADDR:?Set MASTER_ADDR to node A private IP on both nodes}\"\n: \"${TRAIN_OUT:?Set TRAIN_OUT to a dedicated shared POSIX directory}\"\nif [[ \"$NODE_RANK\" != 0 && \"$NODE_RANK\" != 1 ]]; then\n  echo 'NODE_RANK must be 0 or 1' >&2; exit 2\nfi\nscript_dir=\"$(cd -- \"$(dirname -- \"${BASH_SOURCE[0]}\")\" && pwd)\"\nexec torchrun --nnodes=2 --nproc-per-node=2 --node-rank=\"$NODE_RANK\" \\\n  --master-addr=\"$MASTER_ADDR\" --master-port=\"${MASTER_PORT:-29500}\" \\\n  --max-restarts=0 \"$script_dir/train_ddp.py\" --device=cuda \\\n  --epochs=4 --batch-size=64 --accum=2 --save-dir=\"$TRAIN_OUT\" \"$@\"\n", "optimizer-step-validation.json": "{\n  \"torch_version\": \"2.5.1\",\n  \"python_version\": \"3.12.13\",\n  \"device\": \"cpu\",\n  \"parameter_dtype\": \"torch.float32\",\n  \"optimizer\": \"AdamW(lr=0.125, weight_decay=0, fused=False)\",\n  \"scaler\": \"torch.amp.GradScaler('cpu', init_scale=8.0, growth_interval=20)\",\n  \"script\": \"optimizer_step_probe.py\",\n  \"script_sha256\": \"789c8074256f10ae80e9ab30851c59b615954b79a1bd726f3eb50ad1f32d6edf\",\n  \"attempted_windows\": 2,\n  \"applied_optimizer_calls\": 1,\n  \"windows\": [\n    {\n      \"window\": \"finite\",\n      \"before\": {\n        \"parameter\": 1.0,\n        \"adam_step\": 0,\n        \"post_steps\": 0,\n        \"scale\": 8.0\n      },\n      \"scaled_gradient\": 16.0,\n      \"scaler_step_return\": null,\n      \"after\": {\n        \"parameter\": 0.875,\n        \"adam_step\": 1,\n        \"post_steps\": 1,\n        \"scale\": 8.0\n      }\n    },\n    {\n      \"window\": \"infinite\",\n      \"before\": {\n        \"parameter\": 0.875,\n        \"adam_step\": 1,\n        \"post_steps\": 1,\n        \"scale\": 8.0\n      },\n      \"scaled_gradient\": \"+inf\",\n      \"scaler_step_return\": null,\n      \"after\": {\n        \"parameter\": 0.875,\n        \"adam_step\": 1,\n        \"post_steps\": 1,\n        \"scale\": 4.0\n      }\n    }\n  ],\n  \"assertions\": \"PASS\",\n  \"scope\": \"单进程CPU；直接构造FP32有限/inf梯度。未运行CUDA FP16、NCCL或DDP，未使用autocast。\",\n  \"interpretation\": \"该默认AdamW路径每次完成底层optimizer.step才触发post hook。该计数不证明所有参数数值都变、全局训练有效或模型质量提高。\"\n}\n", "optimizer_step_probe.py": "\"\"\"Two CPU GradScaler windows for the site's default (non-fused) AdamW path.\"\"\"\nfrom hashlib import sha256\nimport json\nimport platform\nfrom pathlib import Path\n\nimport torch\n\n\ndef main():\n    parameter = torch.nn.Parameter(torch.tensor(1.0, device=\"cpu\", dtype=torch.float32))\n    optimizer = torch.optim.AdamW([parameter], lr=0.125, weight_decay=0.0, fused=False)\n    scaler = torch.amp.GradScaler(\"cpu\", init_scale=8.0, growth_interval=20)\n    post_steps = 0\n\n    def record_step(_optimizer, _args, _kwargs):\n        nonlocal post_steps\n        post_steps += 1\n\n    def progress():\n        state = optimizer.state.get(parameter, {})\n        adam_step = int(state[\"step\"].item()) if \"step\" in state else 0\n        return dict(parameter=parameter.item(), adam_step=adam_step,\n                    post_steps=post_steps, scale=scaler.get_scale())\n\n    assert torch.__version__.split(\"+\")[0] == \"2.5.1\"\n    assert scaler.is_enabled()\n    hook = optimizer.register_step_post_hook(record_step)\n    windows = []\n    try:\n        for label, multiplier in [(\"finite\", 2.0), (\"infinite\", float(\"inf\"))]:\n            optimizer.zero_grad(set_to_none=True)\n            before = progress()\n            scaler.scale(parameter * multiplier).backward()\n            # Preserve strict JSON even when the Tensor contains positive infinity.\n            gradient = parameter.grad.item()\n            gradient_display = gradient if torch.isfinite(parameter.grad).item() else \"+inf\"\n            result = scaler.step(optimizer)\n            scaler.update()\n            windows.append(dict(window=label, before=before, scaled_gradient=gradient_display,\n                                scaler_step_return=result, after=progress()))\n    finally:\n        hook.remove()\n    finite, infinite = windows\n    assert finite[\"scaled_gradient\"] == 16.0\n    assert finite[\"after\"][\"parameter\"] < finite[\"before\"][\"parameter\"]\n    assert finite[\"after\"][\"post_steps\"] == finite[\"after\"][\"adam_step\"] == 1\n    assert (finite[\"before\"][\"scale\"], finite[\"after\"][\"scale\"]) == (8.0, 8.0)\n    assert infinite[\"scaled_gradient\"] == \"+inf\"\n    for key in (\"parameter\", \"adam_step\", \"post_steps\"):\n        assert infinite[\"before\"][key] == infinite[\"after\"][key]\n    assert (infinite[\"before\"][\"scale\"], infinite[\"after\"][\"scale\"]) == (8.0, 4.0)\n    assert finite[\"scaler_step_return\"] is None and infinite[\"scaler_step_return\"] is None\n    print(json.dumps(dict(\n        torch_version=torch.__version__, python_version=platform.python_version(), device=\"cpu\",\n        parameter_dtype=str(parameter.dtype), optimizer=\"AdamW(lr=0.125, weight_decay=0, fused=False)\",\n        scaler=\"torch.amp.GradScaler('cpu', init_scale=8.0, growth_interval=20)\",\n        script=\"optimizer_step_probe.py\", script_sha256=sha256(Path(__file__).read_bytes()).hexdigest(),\n        attempted_windows=len(windows), applied_optimizer_calls=post_steps,\n        windows=windows, assertions=\"PASS\",\n        scope=\"单进程CPU；直接构造FP32有限/inf梯度。未运行CUDA FP16、NCCL或DDP，未使用autocast。\",\n        interpretation=\"该默认AdamW路径每次完成底层optimizer.step才触发post hook。该计数不证明所有参数数值都变、全局训练有效或模型质量提高。\"\n    ), ensure_ascii=False, indent=2, allow_nan=False))\n\n\nif __name__ == \"__main__\":\n    main()\n", "train_ddp.py": "\"\"\"Small, reproducible DDP lab. Run with torchrun; see README.md.\n\nEpoch-boundary recovery only, with a fixed world size and fixed batch settings.\nSynthetic classification data exercises the training plumbing, not LLM performance.\n\"\"\"\nimport argparse\nfrom contextlib import nullcontext\nfrom datetime import timedelta\nimport json\nimport os\nfrom pathlib import Path\nimport time\n\nimport torch\nfrom torch import nn\nimport torch.distributed as dist\nfrom torch.nn.parallel import DistributedDataParallel as DDP\nfrom torch.utils.data import DataLoader, TensorDataset, DistributedSampler\n\n\ndef arguments():\n    p = argparse.ArgumentParser(description=__doc__)\n    p.add_argument('--device', choices=['cpu', 'cuda'], default='cuda')\n    p.add_argument('--epochs', type=int, default=4, help='Total target epochs, including resumed epochs')\n    p.add_argument('--batch-size', type=int, default=64, help='Per-rank microbatch')\n    p.add_argument('--accum', type=int, default=2)\n    p.add_argument('--samples', type=int, default=8192)\n    p.add_argument('--hidden', type=int, default=256)\n    p.add_argument('--seed', type=int, default=23)\n    p.add_argument('--precision', choices=['fp32', 'bf16', 'fp16'], default='fp32')\n    p.add_argument('--save-dir', default='runs/demo')\n    p.add_argument('--resume', default='')\n    a = p.parse_args()\n    if min(a.epochs, a.batch_size, a.accum, a.samples, a.hidden) < 1:\n        p.error('epochs, batch-size, accum, samples and hidden must be positive')\n    if a.device == 'cpu' and a.precision != 'fp32':\n        p.error('This CPU verification path supports fp32 only')\n    if not all(k in os.environ for k in ('RANK', 'LOCAL_RANK', 'WORLD_SIZE')):\n        p.error('Use torchrun, even for a single process; see README.md')\n    return a\n\n\ndef report(rank, **record):\n    if rank == 0:\n        print(json.dumps(record, ensure_ascii=False), flush=True)\n\n\ndef save_checkpoint(path, model, optimizer, scaler, loader_rng, epoch, signature, device, rank, world):\n    save_began = time.perf_counter()\n    # Small teaching example: gather RNG state, not model tensors, to rank 0.\n    rng = {'cpu': torch.get_rng_state(), 'loader': loader_rng.get_state()}\n    if device.type == 'cuda':\n        rng['cuda'] = torch.cuda.get_rng_state(device)\n    all_rng = [None] * world if rank == 0 else None\n    dist.gather_object(rng, all_rng, dst=0)\n    if rank == 0:\n        path.parent.mkdir(parents=True, exist_ok=True)\n        temporary = path.with_name(path.name + '.tmp')\n        payload = {'model': model.module.state_dict(), 'optimizer': optimizer.state_dict(),\n                   'scaler': scaler.state_dict(), 'next_epoch': epoch + 1,\n                   'signature': signature, 'rng_by_rank': all_rng}\n        # Same-directory replace is atomic on a suitable POSIX filesystem.\n        # Not an object-storage commit protocol and not a power-loss guarantee.\n        with temporary.open('wb') as f:\n            torch.save(payload, f)\n            f.flush()\n            os.fsync(f.fileno())\n        os.replace(temporary, path)\n    dist.barrier()\n    report(rank, event='checkpoint', path=str(path), next_epoch=epoch + 1,\n           seconds=time.perf_counter() - save_began)\n\n\ndef train(a):\n    rank, local_rank, world = (int(os.environ[k]) for k in ('RANK', 'LOCAL_RANK', 'WORLD_SIZE'))\n    torch.set_num_threads(1)\n    if a.device == 'cuda':\n        if not torch.cuda.is_available() or local_rank >= torch.cuda.device_count():\n            raise RuntimeError('Each local process needs a distinct visible CUDA GPU')\n        torch.cuda.set_device(local_rank)\n        device = torch.device('cuda', local_rank)\n        if a.precision == 'bf16' and not torch.cuda.is_bf16_supported():\n            raise RuntimeError('BF16 is not supported by this device/runtime; use fp32 or fp16')\n    else:\n        device = torch.device('cpu')\n    dist.init_process_group('nccl' if a.device == 'cuda' else 'gloo', timeout=timedelta(seconds=120))\n    try:\n        # Identical fixed dataset across ranks. No external dataset download required.\n        data_rng = torch.Generator().manual_seed(a.seed)\n        x = torch.randn(a.samples, 128, generator=data_rng)\n        teacher = torch.randn(128, 10, generator=data_rng)\n        y = (x @ teacher).argmax(dim=1)\n        dataset = TensorDataset(x, y)\n        sampler = DistributedSampler(dataset, num_replicas=world, rank=rank,\n                                     shuffle=True, seed=a.seed, drop_last=True)\n        loader_rng = torch.Generator().manual_seed(a.seed + 1000 + rank)\n        loader = DataLoader(dataset, batch_size=a.batch_size, sampler=sampler,\n                            drop_last=True, num_workers=0, pin_memory=a.device == 'cuda',\n                            generator=loader_rng)\n        if len(loader) == 0 or len(loader) % a.accum:\n            raise ValueError('Per-rank batch count must be positive and divisible by --accum; '\n                             'adjust --samples/--batch-size/--accum')\n        torch.manual_seed(a.seed)\n        raw_model = nn.Sequential(nn.Linear(128, a.hidden), nn.ReLU(), nn.Dropout(0.1),\n                                  nn.Linear(a.hidden, 10)).to(device)\n        model = DDP(raw_model, device_ids=[local_rank] if a.device == 'cuda' else None,\n                    broadcast_buffers=False)\n        # Fix the non-fused path: its post hook observes a completed step call.\n        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, fused=False)\n        applied_calls = 0\n\n        def count_step(_optimizer, _args, _kwargs):\n            nonlocal applied_calls\n            applied_calls += 1\n\n        optimizer.register_step_post_hook(count_step)\n        scaler = torch.amp.GradScaler('cuda', enabled=a.precision == 'fp16')\n        torch.manual_seed(a.seed + rank)  # Independent dropout streams, restored on resume.\n        signature = {k: getattr(a, k) for k in ('device', 'precision', 'batch_size', 'accum',\n                                                'samples', 'hidden', 'seed')}\n        signature['world_size'] = world\n        start = 0\n        if a.resume:\n            # Only load a trusted checkpoint from this lab. Every rank must read the same file.\n            state = torch.load(a.resume, map_location='cpu', weights_only=True)\n            if state['signature'] != signature:\n                raise ValueError('Resume requires the same world size, device, precision and training settings')\n            model.module.load_state_dict(state['model'])\n            optimizer.load_state_dict(state['optimizer'])\n            # Older lab checkpoints may store fused=None in the parameter groups.\n            for group in optimizer.param_groups:\n                group['fused'] = False\n            scaler.load_state_dict(state['scaler'])\n            start = state['next_epoch']\n            torch.set_rng_state(state['rng_by_rank'][rank]['cpu'])\n            loader_rng.set_state(state['rng_by_rank'][rank]['loader'])\n            if a.device == 'cuda':\n                torch.cuda.set_rng_state(state['rng_by_rank'][rank]['cuda'], device)\n        if start >= a.epochs:\n            raise ValueError('--epochs is the total target and must be greater than checkpoint next_epoch')\n        effective_batch = a.batch_size * a.accum * world\n        report(rank, event='start', world_size=world, backend=dist.get_backend(),\n               effective_batch=effective_batch, start_epoch=start, precision=a.precision,\n               torch_version=str(torch.__version__))\n        for epoch in range(start, a.epochs):\n            sampler.set_epoch(epoch)\n            model.train()\n            optimizer.zero_grad(set_to_none=True)\n            loss_sum = torch.zeros((), device=device)\n            seen = 0\n            attempted_windows = 0\n            applied_at_start = applied_calls\n            dist.barrier()\n            if a.device == 'cuda':\n                torch.cuda.synchronize(device)\n            began = time.perf_counter()\n            for step, (features, labels) in enumerate(loader):\n                features = features.to(device, non_blocking=True)\n                labels = labels.to(device, non_blocking=True)\n                update = (step + 1) % a.accum == 0\n                # no_sync must cover BOTH forward and backward.\n                with nullcontext() if update else model.no_sync():\n                    with torch.autocast(device_type=a.device,\n                                        dtype=torch.bfloat16 if a.precision == 'bf16' else torch.float16,\n                                        enabled=a.precision != 'fp32'):\n                        loss = nn.functional.cross_entropy(model(features), labels)\n                    scaler.scale(loss / a.accum).backward()\n                loss_sum += loss.detach() * labels.numel()\n                seen += labels.numel()\n                if update:\n                    attempted_windows += 1\n                    scaler.step(optimizer)\n                    scaler.update()\n                    optimizer.zero_grad(set_to_none=True)\n            if a.device == 'cuda':\n                torch.cuda.synchronize(device)\n            duration = torch.tensor(time.perf_counter() - began, device=device, dtype=torch.float64)\n            totals = torch.stack((loss_sum.double(), torch.tensor(float(seen), device=device, dtype=torch.float64)))\n            dist.all_reduce(duration, op=dist.ReduceOp.MAX)\n            dist.all_reduce(totals, op=dist.ReduceOp.SUM)\n            applied_this_epoch = applied_calls - applied_at_start\n            counts = torch.tensor([attempted_windows, applied_this_epoch], device=device)\n            minimum, maximum = counts.clone(), counts.clone()\n            dist.all_reduce(minimum, op=dist.ReduceOp.MIN)\n            dist.all_reduce(maximum, op=dist.ReduceOp.MAX)\n            if not torch.equal(minimum, maximum):\n                raise RuntimeError('Ranks disagree on attempted windows or applied optimizer calls')\n            report(rank, event='epoch', epoch=epoch + 1, loss=(totals[0] / totals[1]).item(),\n                   samples=int(totals[1].item()), seconds=duration.item(),\n                   samples_per_second=(totals[1] / duration).item(),\n                   attempted_update_windows=attempted_windows,\n                   applied_optimizer_steps=applied_this_epoch,\n                   optimizer_steps=applied_this_epoch)\n            save_checkpoint(Path(a.save_dir) / 'checkpoint.pt', model, optimizer, scaler,\n                            loader_rng, epoch, signature, device, rank, world)\n    finally:\n        dist.destroy_process_group()\n\n\nif __name__ == '__main__':\n    train(arguments())\n", "validation.json": "{\n  \"date\": \"2026-11-04\",\n  \"environment\": \"Darwin arm64, Python 3.12.13, PyTorch 2.5.1, CPU/Gloo\",\n  \"cpu_ddp\": \"passed\",\n  \"resume\": \"passed\",\n  \"negative\": \"passed\",\n  \"simulated_two_agents\": \"passed\",\n  \"loss_by_epoch\": [\n    2.3205251693725586,\n    2.272819399833679,\n    2.219925284385681,\n    2.17936909198761\n  ],\n  \"comparison\": \"Exact equality of model, optimizer, scaler, next_epoch, signature, and all per-rank RNG state\",\n  \"not_executed\": [\n    \"CUDA\",\n    \"NCCL\",\n    \"multiple physical nodes\",\n    \"BF16/FP16\",\n    \"Kubernetes\"\n  ],\n  \"measurement_scope\": \"Tiny synthetic MLP functional test. Timings are local observations, not a GPU or LLM benchmark.\",\n  \"train_sha256\": \"5a0a7a6fa00bcd21410e863879cc9101a156694f1141bb25c1b2f82f1cb65e66\",\n  \"runs\": [\n    {\n      \"name\": \"two_process_four_epochs\",\n      \"command\": [\n        \"python\",\n        \"-m\",\n        \"torch.distributed.run\",\n        \"--standalone\",\n        \"--nproc-per-node=2\",\n        \"train_ddp.py\",\n        \"--device=cpu\",\n        \"--samples=1024\",\n        \"--hidden=32\",\n        \"--batch-size=32\",\n        \"--accum=2\",\n        \"--epochs=4\",\n        \"--save-dir=<temporary>/full\"\n      ],\n      \"exit_code\": 0,\n      \"expected_error\": null,\n      \"records\": [\n        {\n          \"event\": \"start\",\n          \"world_size\": 2,\n          \"backend\": \"gloo\",\n          \"effective_batch\": 128,\n          \"start_epoch\": 0,\n          \"precision\": \"fp32\",\n          \"torch_version\": \"2.5.1\"\n        },\n        {\n          \"event\": \"epoch\",\n          \"epoch\": 1,\n          \"loss\": 2.3205251693725586,\n          \"samples\": 1024,\n          \"seconds\": 0.07875350001268089,\n          \"samples_per_second\": 13002.596707893814,\n          \"attempted_update_windows\": 8,\n          \"applied_optimizer_steps\": 8,\n          \"optimizer_steps\": 8\n        },\n        {\n          \"event\": \"checkpoint\",\n          \"path\": \"<temporary>/full/checkpoint.pt\",\n          \"next_epoch\": 1,\n          \"seconds\": 0.005803084000945091\n        },\n        {\n          \"event\": \"epoch\",\n          \"epoch\": 2,\n          \"loss\": 2.272819399833679,\n          \"samples\": 1024,\n          \"seconds\": 0.007556000025942922,\n          \"samples_per_second\": 135521.43944999707,\n          \"attempted_update_windows\": 8,\n          \"applied_optimizer_steps\": 8,\n          \"optimizer_steps\": 8\n        },\n        {\n          \"event\": \"checkpoint\",\n          \"path\": \"<temporary>/full/checkpoint.pt\",\n          \"next_epoch\": 2,\n          \"seconds\": 0.0018049589125439525\n        },\n        {\n          \"event\": \"epoch\",\n          \"epoch\": 3,\n          \"loss\": 2.219925284385681,\n          \"samples\": 1024,\n          \"seconds\": 0.0067856250097975135,\n          \"samples_per_second\": 150907.2485616998,\n          \"attempted_update_windows\": 8,\n          \"applied_optimizer_steps\": 8,\n          \"optimizer_steps\": 8\n        },\n        {\n          \"event\": \"checkpoint\",\n          \"path\": \"<temporary>/full/checkpoint.pt\",\n          \"next_epoch\": 3,\n          \"seconds\": 0.0016980419168248773\n        },\n        {\n          \"event\": \"epoch\",\n          \"epoch\": 4,\n          \"loss\": 2.17936909198761,\n          \"samples\": 1024,\n          \"seconds\": 0.006815499975346029,\n          \"samples_per_second\": 150245.7638770677,\n          \"attempted_update_windows\": 8,\n          \"applied_optimizer_steps\": 8,\n          \"optimizer_steps\": 8\n        },\n        {\n          \"event\": \"checkpoint\",\n          \"path\": \"<temporary>/full/checkpoint.pt\",\n          \"next_epoch\": 4,\n          \"seconds\": 0.0016136670019477606\n        }\n      ]\n    },\n    {\n      \"name\": \"two_process_two_epochs\",\n      \"command\": [\n        \"python\",\n        \"-m\",\n        \"torch.distributed.run\",\n        \"--standalone\",\n        \"--nproc-per-node=2\",\n        \"train_ddp.py\",\n        \"--device=cpu\",\n        \"--samples=1024\",\n        \"--hidden=32\",\n        \"--batch-size=32\",\n        \"--accum=2\",\n        \"--epochs=2\",\n        \"--save-dir=<temporary>/split\"\n      ],\n      \"exit_code\": 0,\n      \"expected_error\": null,\n      \"records\": [\n        {\n          \"event\": \"start\",\n          \"world_size\": 2,\n          \"backend\": \"gloo\",\n          \"effective_batch\": 128,\n          \"start_epoch\": 0,\n          \"precision\": \"fp32\",\n          \"torch_version\": \"2.5.1\"\n        },\n        {\n          \"event\": \"epoch\",\n          \"epoch\": 1,\n          \"loss\": 2.3205251693725586,\n          \"samples\": 1024,\n          \"seconds\": 0.02041204203851521,\n          \"samples_per_second\": 50166.465367248806,\n          \"attempted_update_windows\": 8,\n          \"applied_optimizer_steps\": 8,\n          \"optimizer_steps\": 8\n        },\n        {\n          \"event\": \"checkpoint\",\n          \"path\": \"<temporary>/split/checkpoint.pt\",\n          \"next_epoch\": 1,\n          \"seconds\": 0.002506708027794957\n        },\n        {\n          \"event\": \"epoch\",\n          \"epoch\": 2,\n          \"loss\": 2.272819399833679,\n          \"samples\": 1024,\n          \"seconds\": 0.005913499975576997,\n          \"samples_per_second\": 173163.1020933733,\n          \"attempted_update_windows\": 8,\n          \"applied_optimizer_steps\": 8,\n          \"optimizer_steps\": 8\n        },\n        {\n          \"event\": \"checkpoint\",\n          \"path\": \"<temporary>/split/checkpoint.pt\",\n          \"next_epoch\": 2,\n          \"seconds\": 0.0016217910451814532\n        }\n      ]\n    },\n    {\n      \"name\": \"resume_to_four_epochs\",\n      \"command\": [\n        \"python\",\n        \"-m\",\n        \"torch.distributed.run\",\n        \"--standalone\",\n        \"--nproc-per-node=2\",\n        \"train_ddp.py\",\n        \"--device=cpu\",\n        \"--samples=1024\",\n        \"--hidden=32\",\n        \"--batch-size=32\",\n        \"--accum=2\",\n        \"--epochs=4\",\n        \"--save-dir=<temporary>/split\",\n        \"--resume=<temporary>/split/checkpoint.pt\"\n      ],\n      \"exit_code\": 0,\n      \"expected_error\": null,\n      \"records\": [\n        {\n          \"event\": \"start\",\n          \"world_size\": 2,\n          \"backend\": \"gloo\",\n          \"effective_batch\": 128,\n          \"start_epoch\": 2,\n          \"precision\": \"fp32\",\n          \"torch_version\": \"2.5.1\"\n        },\n        {\n          \"event\": \"epoch\",\n          \"epoch\": 3,\n          \"loss\": 2.219925284385681,\n          \"samples\": 1024,\n          \"seconds\": 0.019851208082400262,\n          \"samples_per_second\": 51583.7623458222,\n          \"attempted_update_windows\": 8,\n          \"applied_optimizer_steps\": 8,\n          \"optimizer_steps\": 8\n        },\n        {\n          \"event\": \"checkpoint\",\n          \"path\": \"<temporary>/split/checkpoint.pt\",\n          \"next_epoch\": 3,\n          \"seconds\": 0.0020598750561475754\n        },\n        {\n          \"event\": \"epoch\",\n          \"epoch\": 4,\n          \"loss\": 2.17936909198761,\n          \"samples\": 1024,\n          \"seconds\": 0.006461167009547353,\n          \"samples_per_second\": 158485.30126011057,\n          \"attempted_update_windows\": 8,\n          \"applied_optimizer_steps\": 8,\n          \"optimizer_steps\": 8\n        },\n        {\n          \"event\": \"checkpoint\",\n          \"path\": \"<temporary>/split/checkpoint.pt\",\n          \"next_epoch\": 4,\n          \"seconds\": 0.001563791069202125\n        }\n      ]\n    },\n    {\n      \"name\": \"two_agents_one_host_four_cpu_ranks\",\n      \"exit_code\": 0,\n      \"scope\": \"Both NODE_RANK values via launch_2nodes.sh; loopback networking only.\",\n      \"records\": [\n        {\n          \"event\": \"start\",\n          \"world_size\": 4,\n          \"backend\": \"gloo\",\n          \"effective_batch\": 256,\n          \"start_epoch\": 0,\n          \"precision\": \"fp32\",\n          \"torch_version\": \"2.5.1\"\n        },\n        {\n          \"event\": \"epoch\",\n          \"epoch\": 1,\n          \"loss\": 2.326637625694275,\n          \"samples\": 1024,\n          \"seconds\": 0.02475491596851498,\n          \"samples_per_second\": 41365.521147492254,\n          \"attempted_update_windows\": 4,\n          \"applied_optimizer_steps\": 4,\n          \"optimizer_steps\": 4\n        },\n        {\n          \"event\": \"checkpoint\",\n          \"path\": \"<temporary>/two-agents/checkpoint.pt\",\n          \"next_epoch\": 1,\n          \"seconds\": 0.0029786659870296717\n        }\n      ]\n    },\n    {\n      \"name\": \"invalid_accumulation_rejected\",\n      \"command\": [\n        \"python\",\n        \"-m\",\n        \"torch.distributed.run\",\n        \"--standalone\",\n        \"--nproc-per-node=2\",\n        \"train_ddp.py\",\n        \"--device=cpu\",\n        \"--samples=1024\",\n        \"--hidden=32\",\n        \"--batch-size=32\",\n        \"--accum=2\",\n        \"--epochs=1\",\n        \"--accum=3\",\n        \"--save-dir=<temporary>/full\"\n      ],\n      \"exit_code\": 1,\n      \"expected_error\": \"divisible by --accum\",\n      \"records\": []\n    },\n    {\n      \"name\": \"incompatible_resume_rejected\",\n      \"command\": [\n        \"python\",\n        \"-m\",\n        \"torch.distributed.run\",\n        \"--standalone\",\n        \"--nproc-per-node=2\",\n        \"train_ddp.py\",\n        \"--device=cpu\",\n        \"--samples=1024\",\n        \"--hidden=32\",\n        \"--batch-size=32\",\n        \"--accum=2\",\n        \"--epochs=5\",\n        \"--batch-size=16\",\n        \"--resume=<temporary>/full/checkpoint.pt\",\n        \"--save-dir=<temporary>/split\"\n      ],\n      \"exit_code\": 1,\n      \"expected_error\": \"Resume requires the same\",\n      \"records\": []\n    }\n  ]\n}\n"};
const labValidation = {
  "date": "2026-11-04",
  "environment": "Darwin arm64, Python 3.12.13, PyTorch 2.5.1, CPU/Gloo",
  "cpu_ddp": "passed",
  "resume": "passed",
  "negative": "passed",
  "simulated_two_agents": "passed",
  "loss_by_epoch": [
    2.3205251693725586,
    2.272819399833679,
    2.219925284385681,
    2.17936909198761
  ],
  "comparison": "Exact equality of model, optimizer, scaler, next_epoch, signature, and all per-rank RNG state",
  "not_executed": [
    "CUDA",
    "NCCL",
    "multiple physical nodes",
    "BF16/FP16",
    "Kubernetes"
  ],
  "measurement_scope": "Tiny synthetic MLP functional test. Timings are local observations, not a GPU or LLM benchmark.",
  "train_sha256": "5a0a7a6fa00bcd21410e863879cc9101a156694f1141bb25c1b2f82f1cb65e66",
  "runs": [
    {
      "name": "two_process_four_epochs",
      "command": [
        "python",
        "-m",
        "torch.distributed.run",
        "--standalone",
        "--nproc-per-node=2",
        "train_ddp.py",
        "--device=cpu",
        "--samples=1024",
        "--hidden=32",
        "--batch-size=32",
        "--accum=2",
        "--epochs=4",
        "--save-dir=<temporary>/full"
      ],
      "exit_code": 0,
      "expected_error": null,
      "records": [
        {
          "event": "start",
          "world_size": 2,
          "backend": "gloo",
          "effective_batch": 128,
          "start_epoch": 0,
          "precision": "fp32",
          "torch_version": "2.5.1"
        },
        {
          "event": "epoch",
          "epoch": 1,
          "loss": 2.3205251693725586,
          "samples": 1024,
          "seconds": 0.07875350001268089,
          "samples_per_second": 13002.596707893814,
          "attempted_update_windows": 8,
          "applied_optimizer_steps": 8,
          "optimizer_steps": 8
        },
        {
          "event": "checkpoint",
          "path": "<temporary>/full/checkpoint.pt",
          "next_epoch": 1,
          "seconds": 0.005803084000945091
        },
        {
          "event": "epoch",
          "epoch": 2,
          "loss": 2.272819399833679,
          "samples": 1024,
          "seconds": 0.007556000025942922,
          "samples_per_second": 135521.43944999707,
          "attempted_update_windows": 8,
          "applied_optimizer_steps": 8,
          "optimizer_steps": 8
        },
        {
          "event": "checkpoint",
          "path": "<temporary>/full/checkpoint.pt",
          "next_epoch": 2,
          "seconds": 0.0018049589125439525
        },
        {
          "event": "epoch",
          "epoch": 3,
          "loss": 2.219925284385681,
          "samples": 1024,
          "seconds": 0.0067856250097975135,
          "samples_per_second": 150907.2485616998,
          "attempted_update_windows": 8,
          "applied_optimizer_steps": 8,
          "optimizer_steps": 8
        },
        {
          "event": "checkpoint",
          "path": "<temporary>/full/checkpoint.pt",
          "next_epoch": 3,
          "seconds": 0.0016980419168248773
        },
        {
          "event": "epoch",
          "epoch": 4,
          "loss": 2.17936909198761,
          "samples": 1024,
          "seconds": 0.006815499975346029,
          "samples_per_second": 150245.7638770677,
          "attempted_update_windows": 8,
          "applied_optimizer_steps": 8,
          "optimizer_steps": 8
        },
        {
          "event": "checkpoint",
          "path": "<temporary>/full/checkpoint.pt",
          "next_epoch": 4,
          "seconds": 0.0016136670019477606
        }
      ]
    },
    {
      "name": "two_process_two_epochs",
      "command": [
        "python",
        "-m",
        "torch.distributed.run",
        "--standalone",
        "--nproc-per-node=2",
        "train_ddp.py",
        "--device=cpu",
        "--samples=1024",
        "--hidden=32",
        "--batch-size=32",
        "--accum=2",
        "--epochs=2",
        "--save-dir=<temporary>/split"
      ],
      "exit_code": 0,
      "expected_error": null,
      "records": [
        {
          "event": "start",
          "world_size": 2,
          "backend": "gloo",
          "effective_batch": 128,
          "start_epoch": 0,
          "precision": "fp32",
          "torch_version": "2.5.1"
        },
        {
          "event": "epoch",
          "epoch": 1,
          "loss": 2.3205251693725586,
          "samples": 1024,
          "seconds": 0.02041204203851521,
          "samples_per_second": 50166.465367248806,
          "attempted_update_windows": 8,
          "applied_optimizer_steps": 8,
          "optimizer_steps": 8
        },
        {
          "event": "checkpoint",
          "path": "<temporary>/split/checkpoint.pt",
          "next_epoch": 1,
          "seconds": 0.002506708027794957
        },
        {
          "event": "epoch",
          "epoch": 2,
          "loss": 2.272819399833679,
          "samples": 1024,
          "seconds": 0.005913499975576997,
          "samples_per_second": 173163.1020933733,
          "attempted_update_windows": 8,
          "applied_optimizer_steps": 8,
          "optimizer_steps": 8
        },
        {
          "event": "checkpoint",
          "path": "<temporary>/split/checkpoint.pt",
          "next_epoch": 2,
          "seconds": 0.0016217910451814532
        }
      ]
    },
    {
      "name": "resume_to_four_epochs",
      "command": [
        "python",
        "-m",
        "torch.distributed.run",
        "--standalone",
        "--nproc-per-node=2",
        "train_ddp.py",
        "--device=cpu",
        "--samples=1024",
        "--hidden=32",
        "--batch-size=32",
        "--accum=2",
        "--epochs=4",
        "--save-dir=<temporary>/split",
        "--resume=<temporary>/split/checkpoint.pt"
      ],
      "exit_code": 0,
      "expected_error": null,
      "records": [
        {
          "event": "start",
          "world_size": 2,
          "backend": "gloo",
          "effective_batch": 128,
          "start_epoch": 2,
          "precision": "fp32",
          "torch_version": "2.5.1"
        },
        {
          "event": "epoch",
          "epoch": 3,
          "loss": 2.219925284385681,
          "samples": 1024,
          "seconds": 0.019851208082400262,
          "samples_per_second": 51583.7623458222,
          "attempted_update_windows": 8,
          "applied_optimizer_steps": 8,
          "optimizer_steps": 8
        },
        {
          "event": "checkpoint",
          "path": "<temporary>/split/checkpoint.pt",
          "next_epoch": 3,
          "seconds": 0.0020598750561475754
        },
        {
          "event": "epoch",
          "epoch": 4,
          "loss": 2.17936909198761,
          "samples": 1024,
          "seconds": 0.006461167009547353,
          "samples_per_second": 158485.30126011057,
          "attempted_update_windows": 8,
          "applied_optimizer_steps": 8,
          "optimizer_steps": 8
        },
        {
          "event": "checkpoint",
          "path": "<temporary>/split/checkpoint.pt",
          "next_epoch": 4,
          "seconds": 0.001563791069202125
        }
      ]
    },
    {
      "name": "two_agents_one_host_four_cpu_ranks",
      "exit_code": 0,
      "scope": "Both NODE_RANK values via launch_2nodes.sh; loopback networking only.",
      "records": [
        {
          "event": "start",
          "world_size": 4,
          "backend": "gloo",
          "effective_batch": 256,
          "start_epoch": 0,
          "precision": "fp32",
          "torch_version": "2.5.1"
        },
        {
          "event": "epoch",
          "epoch": 1,
          "loss": 2.326637625694275,
          "samples": 1024,
          "seconds": 0.02475491596851498,
          "samples_per_second": 41365.521147492254,
          "attempted_update_windows": 4,
          "applied_optimizer_steps": 4,
          "optimizer_steps": 4
        },
        {
          "event": "checkpoint",
          "path": "<temporary>/two-agents/checkpoint.pt",
          "next_epoch": 1,
          "seconds": 0.0029786659870296717
        }
      ]
    },
    {
      "name": "invalid_accumulation_rejected",
      "command": [
        "python",
        "-m",
        "torch.distributed.run",
        "--standalone",
        "--nproc-per-node=2",
        "train_ddp.py",
        "--device=cpu",
        "--samples=1024",
        "--hidden=32",
        "--batch-size=32",
        "--accum=2",
        "--epochs=1",
        "--accum=3",
        "--save-dir=<temporary>/full"
      ],
      "exit_code": 1,
      "expected_error": "divisible by --accum",
      "records": []
    },
    {
      "name": "incompatible_resume_rejected",
      "command": [
        "python",
        "-m",
        "torch.distributed.run",
        "--standalone",
        "--nproc-per-node=2",
        "train_ddp.py",
        "--device=cpu",
        "--samples=1024",
        "--hidden=32",
        "--batch-size=32",
        "--accum=2",
        "--epochs=5",
        "--batch-size=16",
        "--resume=<temporary>/full/checkpoint.pt",
        "--save-dir=<temporary>/split"
      ],
      "exit_code": 1,
      "expected_error": "Resume requires the same",
      "records": []
    }
  ]
};
