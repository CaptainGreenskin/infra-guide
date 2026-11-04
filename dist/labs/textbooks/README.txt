InfraGuide 深入原理代码包

阅读顺序
model-foundations/tokenization.py：玩具词表、标签与重复Embedding梯度
model-foundations/rope.py：相对位置、偏移与配对约定
model-foundations/tiny_decoder.py：664参数Decoder的整批/微批更新
model-foundations/io_attention.py：在线softmax与TP部分和
cloud-foundations/：内存事件、锁、SQLite、缓存与Roofline
agent-foundations/：事件重放、检索、轨迹统计、实例代际

安装与运行
除 tiny_decoder.py 外，仅需 Python 3 标准库，不下载模型或访问外部服务。
tiny_decoder.py 的基线为 Python 3.12 / PyTorch 2.5.1 / CPU。
可创建独立虚拟环境并安装 torch==2.5.1，然后运行：
python model-foundations/tiny_decoder.py
python model-foundations/io_attention.py
python cloud-foundations/database-index-locks.py
其他脚本按相同方式运行。失败断言使程序非零退出。

validation.json 保存本站本次执行输出与每个脚本的SHA-256。
复跑结果应按各章的预期或容差核对，而非要求输出逐字相同。
CPU数值和状态实验不验证CUDA/NCCL吞吐、真实Linux内存压力、
云数据库与缓存、安全沙箱、Kubernetes或Kairo。
