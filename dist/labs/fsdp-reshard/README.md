# FSDP 检查点从两个 rank 恢复到三个 rank

沿用原生 FSDP 实验的 `Linear(2,2)`、六个参数、三行输入和六项标量目标。两个 rank 时，rank 0 读第 0 行，rank 1 读第 1、2 行。三个 rank 时，每个 rank 读一行。每次更新仍用全部六项的平均损失。FSDP 会对 rank 梯度取平均，所以每个 rank 用 `world_size×本地损失总和/6` 反向。

## 运行

将 `fsdp_reshard.py` 和原版 `fsdp_lab.py` 放在同一目录。实测为 Python 3.12.13、PyTorch 2.5.1、CPU/Gloo 和 `float64`。

```sh
python -B fsdp_reshard.py > replay.json
```

程序实际启动四组本机 `torchrun`。默认在脚本目录下用临时子目录并在结束后清理。加 `--keep ./new-run` 可以保留 DCP 文件，路径须是新目录。

## 先区分两种布局

| 对象 | 保存时的两个 rank | 恢复时的三个 rank |
| --- | --- | --- |
| FSDP 训练用展平参数 | `[0,3)`、`[3,6)` | `[0,2)`、`[2,4)`、`[4,6)` |
| 检查点用具名 `weight` 局部形状 | `[1,2]`、`[1,2]` | `[1,2]`、`[1,2]`、`[0,2]` |
| 检查点用具名 `bias` 局部形状 | `[1]`、`[1]` | `[1]`、`[1]`、`[0]` |

训练时，FSDP 把 `weight` 和 `bias` 连起来再切。保存时，`get_state_dict` 按原参数名拆回张量，再按张量各自的第一轴分片。程序用 `init_device_mesh("cpu", (world_size,))` 描述本组 rank，FSDP1 在这条 API 路径返回 `DTensor`。本例 `weight` 和 `bias` 的第一轴均只有两项，目标组的 rank 2 在具名读取布局中没有非空片。应用到训练模型后，它负责展平位置 4、5，也就是两项偏置及其 Adam 历史。 [PyTorch 2.5.1 选择 DTensor 的实现](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/fsdp/_state_dict_utils.py#L738-L751)

## 一次保存和恢复

1. 两个 rank 连续更新两次，留下对照。另一组两个 rank 只更新一次，拿到具名模型和 Adam 状态。原生 `dcp.save` 将这份状态与 `completed_updates=1` 写进 `.metadata` 和两个 `.distcp` 文件。
2. 等保存进程退出后，用三个 rank 重新构造模型和优化器。`get_state_dict` 提供目标布局的张量。此版本会用一次零学习率操作初始化空 Adam 的槽位，槽位中的零矩量只用于接收数据。训练进度仍从保存的游标恢复。
3. 原生 `dcp.load` 读入模型、Adam 历史和游标，`set_state_dict` 把它们转回三个 rank 的训练分片。实际检查 Adam 步数与游标均为 1，再用同一批数据完成第 2 次更新。另用普通模型独立在全批上核对梯度、参数与 Adam 历史。 [DCP 保存](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/state_dict_saver.py#L53-L71) · [DCP 加载](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/state_dict_loader.py#L49-L75) · [具名状态接口](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/state_dict.py#L966-L990)

| 对照 | 实跑结果 |
| --- | --- |
| 保存前、加载后分别对照连续路径第 1 次更新 | 完整模型和 Adam 的最大绝对差均为 `0.0` |
| 三个 rank 完成第 2 次更新 | 完整模型与 Adam 相对连续路径最大绝对差 `1.734723475976807e−18`，符合 `atol=1e−12, rtol=0` |
| 原生加载第二份检查点，模型和 Adam 相同，只将游标设为 `0` | 已恢复 Adam 步数为 `1`，应用拒绝继续 |
| 用同一检查点只恢复模型和游标 | 缺 Adam 被拒绝。绕过检查做一次更新后，参数最大绝对差约 `0.0005484` |

额外对照省略 `DeviceMesh`，让这个版本构造 `ShardedTensor` 模板。三个 rank 中，rank 2 在 `get_state_dict` 时因具名张量没有本地片而失败，尚未调用 `dcp.load`。这个反例检查的是固定版本与固定形状的模板边界。 [PyTorch 2.5.1 空本地片涉及的 `is_meta` 实现](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/_shard/sharded_tensor/_ops/tensor_ops.py#L49-L51)

[validation.json](validation.json) 保存两种布局、DCP 文件的实际张量块、两次更新、各项反例和源码 SHA-256。证据范围限于本机 CPU/Gloo、同步保存和整次更新边界。CUDA/NCCL、物理跨机、故障时的弹性调度和训练中间位置恢复各需对应实跑。
