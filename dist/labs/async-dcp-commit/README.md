# 异步检查点里的权重属于哪一步？

用两个本机 CPU/Gloo 进程，固定 PyTorch 2.5.1。训练用 DDP，检查点读写用另一个 Gloo 进程组。程序会在临时目录生成状态并清理。

```sh
python -m pip install -r requirements.txt
OMP_NUM_THREADS=1 python -B -m torch.distributed.run --standalone --nproc_per_node=2 async_dcp.py > replay.json
```

模型只有一个权重 w，输入为 1，损失为 ½(w−目标)²。第 1 步两个 rank 的目标是 2、4，平均梯度 −3。SGD 动量系数 0.5、学习率 0.25，更新后 w=0.75、动量=−3。第 2 步目标为 6、10，更新后 w=2.9375、动量=−8.75。

第 1 步后，两边都调用原生 `dcp.async_save`。存储写入器沿用原生暂存逻辑，只在后台真正写文件前等待。前台先完成第 2 步，两边各确认保存句柄 `Future` 仍未完成，然后才放行后台。

| 写入对照 | 恢复得到的已完成步数、权重、动量 | 再做第 2 步后 |
| --- | --- | --- |
| 显式复制第 1 步状态，再异步保存 | 1、0.75、−3 | w=2.9375 |
| 直接交出 CPU 训练张量，仍成功写完 | 1、2.9375、−8.75 | w=5.296875 |
| rank 1 写入失败，从已发布目录恢复 | 1、0.75、−3 | w=2.9375 |

固定版本的默认写入器使用 `ret.to(cpu_device)` 把张量暂存到 CPU。输入本来就在 CPU 时，这条路径可返回原存储。实验比较权重和动量的底层地址，确认直接交给保存器时两项都共享存储。前台原地修改训练状态，也改变了后台随后序列化的值。已完成步数是另造的张量，仍为 1，所以文件齐全也可能读出不同步的状态。正例对这份小状态树执行 `copy.deepcopy`，使保存内容与训练存储分开。

同步生成的旧目录先由 `CURRENT` 指向。异步正例的两边保存都结束且存在 `.metadata` 后，rank 0 才替换 `CURRENT`。写入失败时，文件系统上只有 rank 0 的 `.distcp` 文件。DCP 句柄报告 rank 1 失败，指针仍指向已发布目录。程序按指针重新创建模型和优化器、原生加载并实际跑下一步。共享存储反例的目录只用于诊断，没有发布。

查看 `validation.json` 的 `staged_shares_live`、`future_pending`、`pointer_after` 和 `next_update`。该记录验证同机 CPU、固定版默认暂存路径、训练与后台写入的受控先后，以及本地指针选择。没有测量提速、GPU 内存、对象存储或断电持久性。大型状态的复制方式、额外内存与并发写入策略需要单独验收。

- [PyTorch 2.5.1：异步保存先暂存，再用后台线程写入](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/state_dict_saver.py#L199-L235)
- [固定版默认暂存器](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/checkpoint/staging.py#L91-L100) · [CPU 张量的转换路径](https://github.com/pytorch/pytorch/blob/v2.5.1/torch/distributed/_state_dict_utils.py#L182-L190)
