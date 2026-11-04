/* Shared evidence for the three independently written lesson groups. */
Object.assign(sources,{
 v22PV:['Kubernetes · 持久卷、访问模式与回收','https://kubernetes.io/docs/concepts/storage/persistent-volumes/'],
 v22SC:['Kubernetes · StorageClass与延迟绑定','https://kubernetes.io/docs/concepts/storage/storage-classes/'],
 v22Snapshot:['Kubernetes · CSI卷快照','https://kubernetes.io/docs/concepts/storage/volume-snapshots/'],
 v22Wal:['SQLite · WAL文件与checkpoint','https://www.sqlite.org/wal.html'],
 v22Backup:['SQLite · 在线备份API','https://www.sqlite.org/backup.html'],
 v22Isolation:['SQLite · 读事务快照与隔离','https://www.sqlite.org/isolation.html'],
 v22Quant:['ONNX · 量化公式、轴与分组','https://onnx.ai/onnx/operators/onnx__QuantizeLinear.html'],
 v22Dequant:['ONNX · 反量化与比例尺','https://onnx.ai/onnx/operators/onnx__DequantizeLinear.html'],
 v22TorchQuant:['PyTorch 2.5 · 量化、后端与转换','https://pytorch.org/docs/2.5/quantization.html'],
 v22Context:['Anthropic · 上下文的选择、压缩与组织','https://www.anthropic.com/research/effective-context-engineering-for-ai-agents'],
 v22Transaction:['SQLite · 事务与并发边界','https://www.sqlite.org/lang_transaction.html'],
 v22GPTQ:['GPTQ · 训练后权重量化原论文','https://arxiv.org/abs/2210.17323'],
 v22AWQ:['AWQ · 激活感知权重量化原论文','https://arxiv.org/abs/2306.00978'],
 v22Smooth:['SmoothQuant · 权重与激活的等价缩放','https://arxiv.org/abs/2211.10438'],
 v22QLoRA:['QLoRA · 冻结量化基座与低秩适配','https://arxiv.org/abs/2305.14314'],
 v22Speculative:['Speculative Decoding · 接受与修正采样','https://arxiv.org/abs/2211.17192'],
 v22SpecSampling:['Speculative Sampling · 目标分布与验证','https://arxiv.org/abs/2302.01318']
});
const sqcResult=name=>storageQuantContextValidation.programs[name].result;
const sqcNum=n=>Number(n).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
function sqcLab(name,full=true){
 const result=sqcResult(name);let lead,rows,scope;
 if(name==='wal_backup.py'){
  lead='真实SQLite/WAL与两个独立连接。先固定版本1进入主文件，再提交版本2、3，分别观察主文件复制、旧读事务备份和新连接备份。';
  rows=[['只复制主文件','余额100 / v1，完整性检查仍为ok'],['旧读事务及其backup','余额120 / v2，写者提交v3后仍是这份快照'],['新连接backup','余额130 / v3，达到最低版本3'],['保留原库后再误写','余额999 / v4；保留并没有撤销误写'],['隔离恢复并继续消费','先恢复130 / v3，再正常提交到131 / v4']];
  scope='本地SQLite已提交状态与backup API；未验证CSI快照、网络存储、其他数据库或主机掉电。';
 }else if(name==='volume_writer.py'){
  lead='本地实际运行与集群Job共用同一份SQLite写入程序。两个逻辑操作write-1、write-2分别加1；再执行write-1时返回原回执，不重复加1。';
  rows=[['第一次write-1','before=0 / after=1；当前计数1'],['第一次write-2','before=1 / after=2；当前计数2'],['再次write-1','duplicate=true；原after仍1，当前计数仍2'],['集群输入','包内4份JSON清单嵌入同一源码；尚未运行CSI集群']];
  scope='已运行本地SQLite写入与重试；集群清单需替换StorageClass后在自己的测试集群验证。';
 }else if(name==='int4_groups.py'){
  lead='32个固定权重，其中一个离群值为12。实际打包4bit整数、存储float32比例尺、写入文件并回读，再比较两组输入的线性层输出。';
  rows=Object.entries(result.schemes).map(([key,v])=>[({per_tensor:'整张量一组',per_channel:'每输出通道一组',group_4:'每4个权重一组',group_2:'每2个权重一组'})[key],v.tensor_bytes+'B载荷；最大输出误差 '+sqcNum(v.max_output_error)]);
  rows.push(['FP16对照','纯权重载荷64B；上述载荷未含12B示例文件头'],['静态激活范围失配','校准最大0.5，保留输入最大3，裁剪1项'],['零值和奇数长度','全零组、负数与奇数个4bit值回读均通过']);
  scope='标准库CPU数值参考；文件格式自定义，未执行INT4推理引擎、GPU算子或模型任务评估。';
 }else if(name==='int8_runtime.py'){
  lead='另一份独立实验：把同一权重创建的float32 Linear实际转换成CPU动态INT8模块，执行后导出自己的TorchScript并重新加载。它不加载前一例的INT4文件。';
  rows=[['运行环境','PyTorch '+result.torch+' / CPU / '+result.quantized_engine],['实际转换','动态量化Linear；权重'+result.weight_dtype],['两组输入最大绝对误差',sqcNum(result.fixed_input_max_abs_error)+'，本例预设上限0.2'],['保存再加载','与保存前量化输出最大差 '+result.torchscript_roundtrip_max_abs_error],['权重元素载荷','float32 128B → int8 32B，其他状态另计'],['整份TorchScript文件',result.whole_torchscript_artifact_bytes+'B，不能按元素比例猜文件大小']];
  scope='实际CPU INT8执行与自建产物回读；没有测延迟，不代表INT4、GPU加速或真实任务质量已通过。';
 }else{
  lead='真实SQLite保存任务状态和原操作回执；上下文故意保留旧摘要。再加入旧记忆、其他用户、过期条目和撤回后的缓存引用。';
  rows=[['按权威记录恢复','SUCCEEDED / v2；原回执13；效果仍1'],['旧版本条件写回','影响0行，保留当前成功状态'],['独立错误恢复','信旧摘要、创建新操作；效果变2'],['当前事实的记忆选择','只接受本用户当前版本；未过期的旧版本仍不适用'],['条目撤回后重组','旧引用重新检查，接受条目0'],['摘要限定条件','保留假设、版本、时间、单位和来源；改成确认结论会被拒']];
  scope='固定事实、单机SQLite与确定性组装规则；没有调用LLM、身份服务、远端工具或Kairo。';
 }
 const needsTorch=name==='int8_runtime.py';
 return infraReadableHTML(para(lead)+code(needsTorch?'PyTorch 2.5.1环境 · 安装见包内说明':'Python 3.9+ · 标准库','SHELL',(needsTorch?'python ':'python3 ')+name)+
 table(['实际检查','本次结果'],rows)+
 (full?'<details class="full-code"><summary>展开完整'+name+'：与下载源码一致</summary>'+code(name,'PYTHON',storageQuantContextFiles[name])+'</details>':'')+
 '<p class="practice-links"><a href="labs/storage-quant-context.zip" download>下载存储、量化与上下文实验 ↓</a><a href="labs/storage-quant-context/'+name+'" download>下载本例源码 ↓</a><a href="labs/storage-quant-context/validation.json" target="_blank" rel="noopener">实际输出与源码摘要 ↗</a></p>'+para('<small>'+scope+'</small>'));
}
