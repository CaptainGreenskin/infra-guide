const trainingExercises={
'gpu-cluster':['Pod 为 Running，显存已占用，但十分钟没有新的 optimizer step。是否可以判定任务健康？还缺哪些证据？','不能。运行时和设备占用只证明部分资源已就绪。先确认每个 rank 的第一处异常、数据 batch 是否就绪、是否在匹配的集合通信中等待；再核对优化器更新、有效样本和损失记录，避免用资源指标替代训练进展。'],
'distributed-training':['模型状态已超过单卡容量，但每卡 batch 已降到 1。直接增加 DDP 副本是否解决容量问题？','通常不能。DDP 在每卡保留完整模型和相应训练状态。应先分解显存，若状态占主导可评估分片；若激活占主导需评估激活重计算、序列长度等。策略还要匹配网络与算子结构，增加设备不自动解决峰值。'],
'gpu-memory':['4 卡、每卡 microbatch=8、accum=4 时有效 batch 是多少？扩到 8 卡后，保持有效 batch 不变需要怎样调整？','原有效 batch = 4 × 8 × 4 = 128。保持 microbatch=8 时，8 卡用 accum=2。这里只计算样本数；可变长文本还应记录有效 token 数、padding 与损失归一化方式。'],
'ddp-code':['两机四卡中，节点 B 的 RANK 为 2、3，但它只有两张 GPU。为什么 torch.cuda.set_device(rank) 会出错？','设备索引属于当前进程的本地可见设备空间，不是全局进程空间。节点 B 应使用 LOCAL_RANK=0、1 绑定 GPU。全局 RANK 用来标识通信参与者，WORLD_SIZE=4 表示参与进程总数。'],
'training-communication':['rank 0 报 NCCL 超时；rank 2 在此前 20 秒报 CUDA OOM。下一步先改网络参数吗？','先处理最早的 OOM，并检查其他 rank 因参与者退出而等待的因果链。修复显存问题后重新验证。仅根据最终的 NCCL 超时修改网卡或禁用高速通信，会掩盖真正的初始故障。'],
'data-pipeline':['每台机器有 8 个训练进程，每个 DataLoader 有 6 个 worker。总共有多少个数据 worker？增加 worker 可能带来什么代价？','每台 48 个数据 worker，此外还有训练进程和管理进程。更多 worker 会增加 CPU、内存、文件描述符、远端存储请求和预取压力；只有被输入供给限制且资源有余量时才可能获益。'],
'multinode-lab':['两机默认配置：8192 个样本、4 个 rank、每 rank batch=64、accum=2。每 rank 每轮有多少个 batch 和多少次更新？','每 rank 分到 2048 个样本，形成 32 个 microbatch，完成 16 次优化器更新；全局有效 batch 为 512。默认数量整除，不丢尾部样本。自定义样本数时必须重新核对 sampler 与 DataLoader 的 drop_last。'],
'checkpoint-recovery':['检查点在第 2 轮结束提交，作业在第 3 轮中途失败。恢复命令使用 --epochs=4，将执行哪些工作？','载入 next_epoch=2（零起始的下一轮索引），重新执行第 3 轮并完成第 4 轮。第 3 轮未提交的工作会重做。模型、优化器、scaler、各 rank RNG 和数据顺序必须恢复到同一提交边界。'],
'training-performance':['单卡 100 样本/秒，4 卡 300 样本/秒。加速比与扩展效率是多少？能否直接说训练成本下降？','同口径下加速比为 3，效率为 3/4=75%。这不能直接证明成本下降：还要知道资源单价、总运行时长、保存与重试开销，以及达到相同质量目标的工作量。这里的数字仅为推导练习。'],
'kubernetes-training':['给一个普通 Job 设置 parallelism=2，并让每个 Pod 启动 torchrun --standalone 两卡，得到的是一个四卡作业吗？','不是。它会启动两个独立的单机两卡进程组。需要统一会合、不同节点 rank、共同的 nnodes 设置，以及协调启动、失败与恢复的作业语义，才能组成一个跨节点作业。']
};
for(const a of trainingChapters)a.exercise=trainingExercises[a.id];
for(const a of articles)if(trainingExercises[a.id])a.exercise=trainingExercises[a.id];
sources.saveLoad=['PyTorch · 保存与加载训练状态','https://docs.pytorch.org/tutorials/beginner/saving_loading_models.html'];
articles.find(a=>a.id==='checkpoint-recovery').refs.unshift('saveLoad');
articles.find(a=>a.id==='multinode-lab').sections.push(['迁移到真实 Transformer 工作负载','<p>保留已经验证的进程启动、设备绑定、采样与恢复框架，先在单 GPU 替换模型和数据，验证 loss、标签对齐与优化器更新，再逐级增加进程。一次同时更换模型、并行策略和网络，会让异常来源难以区分。</p><p>可变长度文本还必须记录有效 token 数与 padding。不同 rank 的有效 token 数不同时，简单平均各 rank 的局部平均 loss，并不等于按全局有效 token 归一化；梯度累积也要使用一致的全局归一化口径。先构造小规模参考结果验证，再进行性能优化。</p><p>真实任务的检查点还可能需要学习率调度器、数据游标、分词器与数据版本、模型配置，以及分片策略信息。先明确恢复边界，不能把本实验的固定 MLP 状态列表直接当作所有训练任务的完整清单。</p>']);


