trainingChapters.push(
{id:'multinode-lab',number:'6.7',title:'两机四卡 DDP：从环境检查到训练验收',group:2,level:'完整实验 · GPU 待验',minutes:30,tags:['torchrun','两机四卡','运行手册'],desc:'用同一份程序逐级排除问题，完成固定规模的两节点训练。',objectives:['独立配置两台训练节点','核对四个 rank 的资源与输出','按证据定位启动和运行故障'],prereq:'完成 6.4—6.6；两台 Linux GPU 节点，每台至少两张 NVIDIA GPU。',intro:'先把训练程序与网络问题分开验证：单进程、单机两进程、两机四进程。实验模型有意保持很小，用于验证分布式语义和恢复机制，不代表大模型性能。',sections:[
['环境与实验边界',trainingFigure('ranks','图 4 · 两个节点各启动两个进程；每个进程绑定一张 GPU。')+trainingTable(['项目','要求'],[['软件基线','Python 3.10—3.12，PyTorch 2.5.1；两端保持同一版本和代码'],['GPU 与驱动','每节点至少两卡；驱动支持所选 CUDA 运行时'],['网络','节点内网双向可达，平台规则允许会合与训练数据通信'],['检查点','两端挂载同一可写 POSIX 目录；不能只创建同名本地目录'],['权限与成本','已有可使用的实验节点；记录运行时长，完成后释放自建资源']])+trainingNote('当前证据','CPU/Gloo 验证见实验室记录。此两机四卡流程尚未在真实 GPU 集群执行，NCCL、驱动、跨节点网络必须在你的环境验收。')],
['安装与检查',labDownload+trainingCode('Linux CUDA 12.4 软件基线','BASH',`python3 -m venv .venv
source .venv/bin/activate
python -m pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124
python check_env.py
nvidia-smi
sha256sum train_ddp.py`)+ '<p>两端核对脚本摘要、PyTorch/CUDA 版本、设备数。安装命令不安装或升级主机 NVIDIA 驱动。版本基线用于复现实验，不代表最新版本建议。</p>'],
['逐级启动，再加入第二台节点',trainingCode('每个节点先做单机测试','BASH',`torchrun --standalone --nproc-per-node=1 train_ddp.py --epochs=1 --save-dir=runs/one
torchrun --standalone --nproc-per-node=2 train_ddp.py --epochs=1 --save-dir=runs/two`)+trainingCode('节点 A','BASH',`export NODE_RANK=0
export MASTER_ADDR=10.0.1.10
export TRAIN_OUT=/mnt/shared/cloudinfra-ddp/run-001
bash launch_2nodes.sh`)+trainingCode('节点 B','BASH',`export NODE_RANK=1
export MASTER_ADDR=10.0.1.10
export TRAIN_OUT=/mnt/shared/cloudinfra-ddp/run-001
bash launch_2nodes.sh`)+ '<p>地址是示例，替换为节点 A 的真实内网地址。两端在超时前启动，MASTER_PORT 默认 29500，必须一致且没有被其他作业占用。每次新实验用独立输出目录。</p><details class="full-code"><summary>查看两端共用的启动脚本</summary>'+trainingCode('launch_2nodes.sh','BASH',labFiles['launch_2nodes.sh'])+'</details>'],
['核对成功的证据',trainingTable(['检查','默认参数下的预期'],[['进程','WORLD_SIZE=4；每节点两个 GPU 进程；RANK 不重复'],['有效 batch','64 × 2 次累积 × 4 个 rank = 512'],['每轮样本与更新','8192 个全局样本；每 rank 每 epoch 16 次优化器更新'],['损失','输出有限数值；多轮走势作为学习信号，不能只看进程存在'],['持久化','rank 0 输出 checkpoint 记录，文件可由两端读取并可恢复']])+'<p>rank 0 汇总日志，不会让四个 rank 重复打印汇总指标。使用 nvidia-smi 与每节点启动日志确认设备绑定。把实际版本、命令、输出、异常和运行时间保留为一次实验记录。</p>'],
['故障定位与结束实验','<ol><li>启动前失败：核对包、GPU 可见性、代码摘要和共享目录权限。</li><li>会合等待：确认两端都已启动，地址、端口、节点 rank 一致且唯一。</li><li>开始训练后超时：先找所有 rank 中最早异常，再检查 NCCL 和数据输入。</li><li>完成后读取检查点并执行下一章恢复验证，最后停止进程并清理实验资源。</li></ol>'+trainingNote('不适合做性能结论','小型合成模型容易受启动、CPU 和同步开销支配。两机运行成功，不表示四卡比单卡快；性能比较需要下一章之后的专门测量。')]
],check:['能在两台节点说明每个环境变量','能从参数推导预期样本与更新次数','能保存一次实验的完整证据'],refs:['install','torchrun','ddp','ncclNetwork']},
{id:'checkpoint-recovery',number:'6.8',title:'检查点与恢复：证明训练能从中断继续',group:2,level:'完整实验',minutes:22,tags:['Checkpoint','RNG','恢复','一致性'],desc:'从“保存了文件”推进到可验证的恢复协议与一致性实验。',objectives:['列出继续训练需要的状态','理解提交点与重做范围','比较连续训练和恢复训练的结果'],prereq:'完成 6.4；本章 CPU 两进程即可验证。',intro:'恢复不是重新载入模型权重那么简单。优化器历史、随机数、数据顺序和进度共同决定下一次更新。先定义恢复边界，才能判断测试是否真的覆盖了承诺。',sections:[
['定义恢复边界',trainingFigure('checkpoint-flow','图 5 · 固定 world size，在 epoch 边界提交并恢复。')+'<p>实验只支持固定设备类型、精度、world size 和训练配置，在 epoch 结束后保存。中途故障会重做最后一个未提交 epoch；不支持任意 batch 精确恢复或动态增减 rank。</p>'],
['保存哪些状态',trainingTable(['状态','为什么需要'],[['model / optimizer','参数和 Adam 历史决定后续更新'],['scaler','FP16 动态缩放进度；其他精度下为空状态'],['next_epoch','明确下一次要执行的 epoch'],['各 rank RNG','包含 CPU、当前 CUDA 设备和 DataLoader generator 状态'],['配置签名','阻止在不同 world size、batch 或模型大小下静默恢复']])+'<p>rank 0 收集各 rank 的小型 RNG 状态，在同一目录写临时文件、刷新并原子替换 checkpoint.pt。这个示例依赖 POSIX 文件语义，不是对象存储提交协议，也没有提供存储节点断电下的完整耐久性证明。</p>'],
['连续四轮，与两轮后恢复',trainingCode('CPU 恢复对照实验','BASH',`COMMON=(--device=cpu --samples=1024 --hidden=32 --batch-size=32 --accum=2)
torchrun --standalone --nproc-per-node=2 train_ddp.py "\${COMMON[@]}" --epochs=4 --save-dir=runs/full
torchrun --standalone --nproc-per-node=2 train_ddp.py "\${COMMON[@]}" --epochs=2 --save-dir=runs/split
torchrun --standalone --nproc-per-node=2 train_ddp.py "\${COMMON[@]}" --epochs=4 --save-dir=runs/split --resume=runs/split/checkpoint.pt
python compare_checkpoints.py runs/full/checkpoint.pt runs/split/checkpoint.pt`)+ '<p>--epochs 表示目标总轮数，恢复命令执行剩余两轮。比较程序检查模型、优化器、RNG、scaler 和进度等完整载荷；不比较运行时间。完整记录和实际结果见实验室。</p>'],
['把 GPU 恢复单独验收','<p>两机四卡实验完成后，在两端用相同目录和参数重新执行：<code>bash launch_2nodes.sh --epochs=6 --resume=/mnt/shared/cloudinfra-ddp/run-001/checkpoint.pt</code>。确认从第 5 轮继续，而不是从头启动。</p><p>CPU 实验完全一致不能推出所有 GPU 算法按位确定。GPU 验收先核对状态、进度和数值稳定性，再根据算法的确定性设置定义容差。需要按位一致时必须另行确认所有算子和通信路径的约束。</p>'],
['进一步的故障演练','<p>先复制一个已验证检查点到独立实验目录，再模拟作业中断。重启后检查 next_epoch、最后提交点和重做范围。若没有成功提交的检查点，实验应明确失败，不能自动当作恢复成功。</p><p>生产系统还需要版本化检查点、校验信息、完整性标记、保留策略、加载权限与定期恢复演练。只加载可信来源的检查点。</p>'+trainingNote('验收要同时覆盖正反两面','正确配置能够恢复；不兼容配置必须拒绝。损坏或缺失文件应给出明确异常，并保留最后一个可用版本。')]
],check:['能说明为什么只保存权重不够','能复现连续与恢复的对照','能说清中途故障会重做什么'],refs:['checkpoint','ddp','data']},
{id:'training-performance',number:'6.9',title:'性能与成本：建立公平的扩展实验',group:2,level:'测量方法',minutes:20,tags:['吞吐','扩展效率','Profiler','成本'],desc:'控制比较口径，从可重复测量推导瓶颈，而不是只看 GPU 利用率。',objectives:['区分强扩展和弱扩展','记录可比较的吞吐与耗时','用时间线决定下一步优化'],prereq:'完成 6.5—6.8；性能数据需要真实目标硬件。',intro:'更高的 GPU 利用率并不自动意味着更低训练成本。需要同时控制工作量、有效 batch、精度、数据版本和质量目标，再观察达到目标所需的总时间。',sections:[
['先决定实验问题',trainingTable(['类型','固定内容','观察'],[['强扩展','相同总工作量与全局有效 batch','增加设备能缩短多少时间'],['弱扩展','每设备的工作量与本地 batch','增加设备后每步时间如何变化'],['端到端效果','可比的数据、质量目标和评估方式','达到目标的总时长与总成本']])+'<p>固定全局 batch 的示例：单卡 accum=8、两卡 accum=4、四卡 accum=2，三组 per-rank batch 都为 64，因此有效 batch 都为 512。数据划分、数值顺序和 Dropout 会变化，不能因此宣称训练轨迹完全相同。</p>'],
['记录测量范围','<p>配套程序在 epoch 前同步，以所有 rank 中最长的训练耗时为分母，用实际全局样本数计算吞吐；保存检查点另记耗时。做端到端评估时还要计入启动、数据准备、保存、重试与资源等待。</p><p>先做预热，再重复测量；至少保留多次运行及离散程度。比较同配置后续 epoch 的中位数，不能挑最快一次。小型 MLP 是功能实验，请用代表实际工作的模型和输入做性能实验。</p>'+trainingCode('实验记录字段','CSV','run_id,commit,torch,cuda,gpu,node_count,world_size,batch,accum,precision,dataset,epoch,samples,train_seconds,samples_per_second,checkpoint_seconds,notes')],
['用时间线检验假设',trainingCode('插入真实训练循环的示意片段','PYTHON',`from torch.profiler import profile, ProfilerActivity, schedule

# train_one_step 与实际数据循环由你的程序提供。
# 每个 rank 写独立目录，避免覆盖。
with profile(
    activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
    schedule=schedule(wait=1, warmup=1, active=3, repeat=1),
    on_trace_ready=lambda p: p.export_chrome_trace(f"trace-rank{rank}.json"),
    record_shapes=True,
) as prof:
    for batch in loader:
        train_one_step(batch)
        prof.step()`)+ '<p>这是集成位置示例，不是可独立执行的脚本。采样窗口包含 CPU 与设备活动，分析输入等待、计算、拷贝和集合通信。Profiler 本身会影响性能，采样运行与正式计时分开。</p>'],
['从现象选择下一次实验',trainingTable(['证据','下一次只改变一个条件'],[['真实数据比合成输入慢','比较本地缓存、解码和读取并发'],['机内好、跨机差','对照网卡、拓扑和通信时间线'],['某 rank 持续更晚到同步','检查其输入、CPU、设备和资源争抢'],['显存充足、算子很小','调整 batch，并保持有效 batch 与质量口径'],['检查点显著延长总时长','测存储带宽和保存周期，保留恢复目标']])+'<p>同步等待可能来自上游慢 rank。没有时间线时，把通信库日志里的等待直接归因于网络，容易优化错地方。</p>'],
['把成本放回训练目标','<p>速度扩展比 S = 多卡吞吐 / 单卡吞吐；同口径下效率 E = S / 卡数。端到端成本包含 GPU、其他计算资源、存储与数据传输，使用实际账单或当前报价计算。</p><p>比较“达到同一质量目标的总成本”，并报告是否发生重试或中断。本站不预填未经测量的吞吐、扩展效率或云价格。</p><div id="scaling-demo"></div>']
],check:['能构造公平的强扩展对照','能说明计时包含和排除的部分','能提出有证据支持的下一次实验'],refs:['profiler','ddp','nccl']},
{id:'kubernetes-training',number:'6.10',title:'走向 Kubernetes：把训练程序变成可管理的作业',group:2,level:'部署设计 · 待验',minutes:20,tags:['Kubernetes','GPU','调度','作业生命周期'],desc:'理解 GPU 资源声明、持久化和作业协调之间的边界。',objectives:['解释 Pod 中 GPU 的分配','识别普通 Job 与分布式作业的差异','设计队列、恢复与观测验收'],prereq:'理解 Kubernetes Job、GPU device plugin、PVC；完成两机实验。',intro:'训练程序正确只是起点。平台还要让资源、数据、身份、失败策略和运行记录保持一致。迁移到 Kubernetes 时，先单 Pod 验证，再设计跨 Pod 协作。',sections:[
['平台需要满足的前提','<p>节点已安装兼容驱动与设备插件，能向调度器报告 GPU 资源；镜像包含指定版本的 PyTorch、训练代码和所需运行时；数据与检查点存储有明确的挂载、权限和生命周期。</p><p>GPU 数量可分配，不代表 GPU 拓扑满足通信需求。多租户还要处理配额、优先级、抢占与节点隔离。</p>'],
['单 Pod 两卡 Job 模板',trainingCode('先替换镜像和 PVC，再在测试集群验收','YAML',`apiVersion: batch/v1
kind: Job
metadata:
  name: cloudinfra-ddp
spec:
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: trainer
          image: YOUR_REGISTRY/cloudinfra-trainer:YOUR_TESTED_TAG
          workingDir: /app
          command: ["torchrun"]
          args: ["--standalone", "--nproc-per-node=2", "train_ddp.py",
                 "--epochs=4", "--save-dir=/checkpoints/run-001"]
          resources:
            requests:
              cpu: "2"
              memory: 4Gi
            limits:
              nvidia.com/gpu: "2"
              memory: 4Gi
          volumeMounts:
            - name: checkpoints
              mountPath: /checkpoints
      volumes:
        - name: checkpoints
          persistentVolumeClaim:
            claimName: training-checkpoints`)+ '<p>这是未在集群执行的配置模板。镜像需要你构建并验证，/app 下包含实验程序；PVC 必须预先存在且允许该 Pod 写入。正式运行固定镜像 digest，并使用唯一作业输出目录。此例不提供自动续训。</p>'],
['parallelism=2 不等于两节点 DDP','<p>普通 Job 的两个并行 Pod 不会自动获得正确的 node rank、统一会合地址、稳定服务发现或协同失败处理。把两个独立的单机训练启动起来，不是一个四进程训练作业。</p><p>跨节点应选用明确支持分布式训练语义的控制器或平台，核对 worker 数量、GPU 数量、角色分配、会合、启动等待、故障后重启整个作业还是单 worker，以及检查点恢复策略。</p>'],
['调度与作业生命周期',trainingTable(['能力','需要验证的问题'],[['准入与配额','作业是否在资源足够前等待，而非部分占卡长期等待'],['拓扑','节点和设备互联是否满足训练要求'],['失败策略','一个 worker 退出后，其余 worker 如何终止或恢复'],['存储','Pod 重建后是否仍读到已提交的检查点'],['可观测性','作业 ID 能否关联每个 rank 的日志、设备和指标']])+'<p>全组资源准入与 Kubernetes 最终成功调度是不同环节；应根据所选控制器和调度组件分别验证，不能只看队列状态判断作业已启动。</p>'],
['作为生产准入前的检查','<ol><li>单 Pod 两卡功能与恢复通过。</li><li>多 Pod 的 rank、网络与共享存储通过。</li><li>故障注入后无遗留 GPU 进程，按既定策略恢复。</li><li>配额、权限、镜像与数据版本可追踪。</li><li>用代表性工作负载验证吞吐、成本与恢复目标。</li></ol>'+trainingNote('从本专题继续','本专题交付训练机制与最小实战。生产平台的控制器选型、数据治理、模型发布与推理服务作为后续独立专题展开，不将配置模板标为生产验证。')]
],check:['能说明 GPU 资源与软件环境的区别','能解释两个 Pod 为什么不自动成为 DDP','能列出一次跨 Pod 恢复验收需要的证据'],refs:['gpu','torchrun','checkpoint']}
);
trainingChapters.sort((a,b)=>Number(a.number.split('.')[1])-Number(b.number.split('.')[1]));
for(let i=articles.length-1;i>=0;i--)if(articles[i].module==='training')articles.splice(i,1);
articles.push(...trainingChapters.map(a=>({...a,module:'training'})));
const trainingModule=modules.find(m=>m.id==='training');
trainingModule.desc='10 章串联 GPU、分布式训练、两机四卡、恢复与性能验收。';
trainingModule.tags=['GPU','DDP','多机训练','恢复'];

