# 从已有 DDP 训练走到原生 DCP 恢复

Python 3.12、PyTorch 2.5.1；两条本机 CPU/Gloo 进程，固定 epoch 边界。

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -B run_lab.py > local-record.json
# 可选：保留检查点和逐 rank 输入记录。runs 必须尚不存在。
.venv/bin/python -B run_lab.py --work-dir runs > retained-record.json
```

`reference_train.py` 是原 DDP 章节 `labs/ddp/train_ddp.py` 的逐字副本；它保留
rank 0 的 torch.save 路径，作为独立保存实现的连续四轮基线。不要修改它来迁就
DCP 输出。新程序用相同数据、128→32→10 的含 Dropout 模型、AdamW、每 rank
32 样本微批、累积两次、1024 样本和 seed=23。每轮8次更新，共32次。

`run_lab.py` 顺序等待每一批 torchrun 及其子进程结束，再启动下一批：

1. 原程序连续训练四轮。
2. 新程序训练两轮，由所有 rank 调用同步 DCP save；旧进程退出。
3. 新进程创建模型、优化器及目标状态树，DCP load 后继续到第四轮。
4. 用独立递归比较器逐项检查原基线与恢复结果的模型、完整 Adam 状态、RNG、
   scaler 空状态、next_epoch 和配置。单独构造采样器核对恢复后的实际输入 ID。
5. 负例保留相同权重、恢复边界和 RNG，却不恢复 Adam 历史；最终参数必须不同。
6. 复制两轮检查点，删除 `.metadata`，新加载必须报错且不产出完成状态。

`comparison.pt` 只是结束后的可信本地验证导出，恢复程序从不读取它；恢复始终
读取 DCP 目录。`TrainState.state_dict` 通过 get_state_dict 取得模型/优化器的
统一名称；加载调用 set_state_dict。各 rank RNG 先汇集成相同列表，再保存；
恢复后选择自己的 RNG。新建优化器的目标状态由 get_state_dict 初始化，再由
加载值覆盖。两 rank 都调用 save/load，不把 DCP 包在 if rank == 0 内。

DCP 负责这一目录中状态项的规划、写入和加载；`.metadata` 描述实际存储位置。
它不替应用决定应恢复哪一次训练。原 CURRENT 教学协议负责选择已发布恢复点，
若生产使用对象存储、并发 attempt 或 latest 指针，仍要有相应提交规则。本包
每次使用新目录，第一版只验证同步保存和正常进程退出后的恢复。

这是实际 PyTorch API、CPU Dropout/Adam 和两 rank 通信；不是 FSDP 参数分片、
DTensor 弹性重分片、GPU/NCCL、异步保存、跨机共享存储或掉电持久性验收。
只加载本次自己生成的可信文件。validation.json 记录环境、源码摘要和本次结果。

一手实现（固定 v2.5.1）：

- https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/state_dict_saver.py
- https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/state_dict_loader.py
- https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/state_dict.py
- https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/filesystem.py
