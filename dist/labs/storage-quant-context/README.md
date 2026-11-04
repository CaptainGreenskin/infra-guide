# 存储恢复、量化和上下文状态：五个独立实验

四个程序只需要Python 3.9+标准库：

```sh
python3 wal_backup.py
python3 volume_writer.py
python3 int4_groups.py
python3 context_state.py
```

真实INT8运行另外使用PyTorch；与INT4字节参考程序是两份实验：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install torch==2.5.1
.venv/bin/python int8_runtime.py
```

发布记录用受支持的CPython3.12/PyTorch2.5.1 CPU环境。请按操作系统、CPU和Python版本选择受支持的安装包；没有GPU也能运行。INT8依赖本机PyTorch编译包的量化后端。程序仅创建并加载自己生成的TorchScript文件，不下载模型。

## wal_backup.py

实际SQLite数据库，WAL模式，关闭自动checkpoint。账户初始v1=100，账本合计100，并先将v1 checkpoint进主文件；v2=120的提交留在WAL。此时程序受控地只复制主文件，新副本可以打开且integrity_check为ok，却只包含v1。复制期间没有并发写入，错误来自明确省略WAL，不用这个例子推断任意热拷贝都安全。

读连接在v2建立事务快照，写连接提交v3=130后，同一读事务仍见v2。从这个读连接调用backup得到一致但较旧的v2；从无旧事务的新连接backup得到v3。要求最低版本3时，前者即使完整也应拒绝。原库随后误写v4=999，保留它仍然保留误写；在另一目录恢复v3后，消费者继续提交+1，余额与账本合计均为131。

原库误写v4与隔离恢复后生成的v4属于不同历史分支，同一个整数不是跨库全局版本。正式切换还需恢复身份/代际与旧写者隔离，程序没有自动接管权威身份。

这验证本地SQLite已提交状态、读快照与backup API，不验证Kubernetes/CSI快照、MySQL/PostgreSQL、网络文件系统、主机掉电或存储设备持久性。WAL文件属于数据库持久状态的一部分；不要照本例拆文件去制作生产备份。

## volume_writer.py与集群清单

不传参数时，程序在临时目录真实执行write-1、write-2、write-1，三个回执after分别为1、2、1，当前计数分别为1、2、2。计数改变与原操作回执在同一SQLite事务中提交；同一逻辑操作重投不会再加1。

四份`storage-*.json`是kubectl可读的完整输入：命名空间、1Gi PVC、两个Job。先编辑`storage-claim.json`的`storageClassName`，使用自己的测试集群中已存在且符合需要的CSI存储类；两个Job将同一PVC挂载到/data，JSON中的Python源码与本地`volume_writer.py`逐字节一致。示例镜像为`python:3.12-slim`，复查时记录实际imageID。按顺序执行：

```sh
kubectl apply -f storage-namespace.json
kubectl apply -f storage-claim.json
kubectl apply -f storage-job-1.json
kubectl wait -n infra-guide-storage --for=condition=complete --timeout=180s job/storage-writer-1
kubectl logs -n infra-guide-storage job/storage-writer-1
kubectl apply -f storage-job-2.json
kubectl wait -n infra-guide-storage --for=condition=complete --timeout=180s job/storage-writer-2
kubectl logs -n infra-guide-storage job/storage-writer-2
```

新空卷且按顺序完成时，第一份原回执0→1，第二份1→2；已执行过的操作应按duplicate和原回执解释。Job本身不提供业务恰好一次保证，所以用稳定op_id与事务回执保护本例计数。该JSON没有在本轮CSI集群实际执行；节点重新连接、旧写者隔离与备份恢复需要目标环境单独验收。清理测试资源前核对PVC对应回收策略，删除PVC可能触发后端卷回收。

## int4_groups.py

4×8固定权重，共32个；行0有离群值12，其他元素较小。量化采用有符号对称范围[-7,7]、零点0、round-to-even，scale先存成float32再用于量化。两个4bit值真实打包为一个字节，低位存偶数下标；负数用4bit二进制补码。-8虽可编码，但不属于本例选定量化范围。测试奇数个值与全零组。

四种粒度：整张量32个一组、按输出通道8个一组、沿每行每4个一组、每2个一组。整数载荷均16字节，float32 scale分别占4/16/32/64字节；不含12字节文件头时合计20/32/48/80。FP16纯权重载荷64字节。最小分组虽然在本例误差更小，其元数据反而令字节数超过FP16。

各格式真实写入临时文件并读取，核对尺寸、scale、整数，再反量化做CPU点积，与固定浮点基线比较。第一组输入的独立十进制点积常量为[11.3875,-1.68,0.915,-2.85]。同一代码还验证分组整数部分和必须分别乘各组scale；统一套第一个scale是负例。

激活探针在相同已反量化权重上比较静态范围±0.5与覆盖当前输入±3。保留输入中一个值为3，静态方案裁剪1项，误差大于动态方案。这个结果只说明这组校准范围失配，不证明动态量化在所有任务更好。没有执行INT4引擎、整数GPU kernel、语言模型或性能测量。

## int8_runtime.py

从同一组固定权重创建float32 Linear(8,4)，实际转换成PyTorch动态INT8模块并在CPU执行两组输入。检查权重类型为qint8、模块已替换、输出有限、固定输入最大绝对误差小于预先规定的0.2。随后导出自己的TorchScript、重新加载并核对输出完全相同。

这不是INT4文件加载器。整数权重载荷32字节与float32载荷128字节，只描述权重元素；scale、bias、运行时与序列化结构另计，整份TorchScript文件反而可更大。实验没有计时，不宣称速度提升、GPU支持或真实任务质量通过。

## context_state.py

真实SQLite保存任务R17的权威状态、原逻辑操作身份与接收回执。上下文旧摘要停在v1/RUNNING；任务提交效果13并推进v2/SUCCEEDED后，从权威记录恢复，效果仍1，完全不需要聊天历史。旧版本条件更新影响0行，阻止旧视图覆盖新状态。

独立负例故意相信旧摘要并生成新op_id，接收方会接受第二个逻辑动作，效果变2。这个结果说明恢复策略破坏动作身份，不是接收方去重突然失效。示例将任务和效果放在同一本地库以固定场景，不把它外推成跨远端工具原子提交。

记忆候选包括同用户当前版本、同用户旧版本、另一用户和过期条目。先按主体与期限过滤，再验证来源版本；TTL未到的旧事实仍被标为不适用于当前值。当前条目撤回后，即使还持有旧引用，组装时重查也不再接受。另用固定结构化事实检查摘要必须保留假设状态、版本、时间窗、数值单位与来源；不是通用自然语言摘要等价证明。

没有调用LLM、外部向量库、MCP/Temporal或Kairo。执行权限仍需工具服务独立检查，记忆文字不能授予权限。

`validation.json`记录实际解释器/SQLite版本、各源码SHA256和输出。源码、网页完整代码和下载包保持一致。CI会重新运行四个标准库程序并独立核算整数打包、存储字节、点积与输出误差；另核对Job内嵌源码与卷关联。INT8记录有源码摘要，CI不自动安装PyTorch。重新生成实际记录：

```sh
python3 scripts/verify-storage-quant-context.py --torch-python <装有PyTorch的解释器>
```
