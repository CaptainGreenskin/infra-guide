/* Teaching fixtures are labeled separately from infrastructure/model measurements. */
Object.assign(sources,{
 v25Config:['Kubernetes · ConfigMap与更新传播','https://kubernetes.io/docs/concepts/configuration/configmap/'],
 v25Secret:['Kubernetes · Secret与访问边界','https://kubernetes.io/docs/concepts/configuration/secret/'],
 v25Checkpoint:['PyTorch · Activation checkpoint','https://docs.pytorch.org/docs/stable/checkpoint.html'],
 v25AdamW:['PyTorch 2.5.1 · AdamW实现','https://github.com/pytorch/pytorch/blob/v2.5.1/torch/optim/adamw.py'],
 v25Wilson:['NIST · 二项比例的区间估计','https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm'],
 v25McNemar:['statsmodels · McNemar成对检验','https://www.statsmodels.org/stable/generated/statsmodels.stats.contingency_tables.mcnemar.html']
});
const cmeResult=name=>configMemoryEvaluationValidation.programs[name].result;
function cmeLab(name,full=true){
 let lead,rows,scope,install='';
 if(name==='config_snapshots.py'){
  lead='实际切换本机路径、保留已打开文件、校验候选，再启动真实子进程观察环境。';
  rows=[['分开读两字段','得到4/50，从未作为一组发布'],['旧文件描述符 / 新打开路径','分别读到完整v1 / 完整v2'],['在途请求 / 新请求','分别持有完整v1 / 完整v2'],['五类无效候选','缺字段、bool当整数、总预算超限、坏JSON、旧代际，全部保留v2'],['回退业务值','发布新代际7；不是将代际倒回1'],['已有子进程 / 新子进程','环境模板改4→6；原进程仍4，新启动才6']];
  scope='POSIX本地文件/进程实测，两份目录一直保留；不是kubelet投射、watch事件或卷旧目录清理测试。';
 }else if(name==='credential_rotation.py'){
  lead='真实本机HTTP夹具分别控制服务端接受版本、客户端缓存与会话撤销，所有凭据都是无权限的实验常量。';
  rows=[['先启用v2并保留v1','v2探测200；未重载客户端仍用v1并返回200'],['候选错误','错误凭据401，当前仍v2'],['撤销v1后的新认证','v1为401，v2为200'],['旧凭据已撤，先前会话','本夹具仍200；独立撤销会话后401'],['错误顺序','先撤v1，旧客户端401；重载v2后200']];
  scope='实际loopback HTTP，不是生产认证协议。既有会话的撤销语义由本夹具规定，须按真实身份平台另验。';
 }else if(name==='tensor_state_bytes.py'){
  lead='实际CPU模型有58个参数元素、4个参数张量，使用AdamW foreach=False；三种存储/计算方式逐阶段数张量。';
  rows=[['FP32','创建232 → 反向464 → 首次step 944 → 清梯度712 → 再次step 944字节'],['FP32参数 + BF16 autocast','同上；输出BF16，参数/梯度/moment仍FP32'],['直接BF16参数','116 → 232 → 480 → 364 → 480字节'],['首次step之后的状态','exp_avg、exp_avg_sq、step；4个FP32 step标量共16字节'],['共享存储的两个view','逻辑元素合计48字节，底层存储去重后32字节']];
  install='python -m pip install torch==2.5.1\n';
  scope='实际PyTorch 2.5.1/CPU保留张量载荷；不是GPU峰值、reserved或RSS。直接BF16例仅观察dtype，不是训练稳定性建议。';
 }else if(name==='checkpoint_saved_tensors.py'){
  lead='复制同一网络与输入，对照普通反向和use_reentrant=False的重计算；hook只存元数据，按底层存储去重并排除参数。';
  rows=[['前向结束时为反向保存的非参数存储','普通32768字节，重计算8192字节'],['每块前向入口调用次数','反向前都是[1,1,1]；反向后普通[1,1,1]，重计算[2,2,2]'],['输出 / 参数及输入梯度','本次最大绝对误差分别0 / 0'],['解释入口计数','非重入重算可以提前停止；不能换算成两倍耗时']];
  install='python -m pip install torch==2.5.1\n';
  scope='实际CPU saved-tensor观察，不是整步峰值或RSS。本例固定无dropout网络，没有检验任意随机状态兼容。';
 }else{
  lead='输入是明确声明的合成标签和25题配对CSV，只做统计计算，不把这些数称为模型或Agent成绩。';
  rows=[['5个可完成、20个应拒绝，全部拒绝','总体80%，可完成类召回0，应拒绝类召回100%，宏平均50%'],['评分器校准：6好/6坏','TP=5、FP=2、FN=1、TN=4；接收产物精确率5/7'],['全对也有区间','Wilson 95%：5/5下界56.55%，100/100下界96.30%'],['同25题对照','A 18/25；B 20/25；仅A对2、仅B对4'],['成对精确检验','差8个百分点；双侧p=11/16=0.6875']];
  scope='固定统计夹具；独立二项观察/独立题对与零假设下方向可交换等条件须成立。p大不等于版本等价。';
 }
 return infraReadableHTML(para(lead)+code('独立环境与完整安装说明见包内README','SHELL',install+'python '+name)+table(['检查','实际结果或固定统计输入'],rows)+
 (full?'<details class="full-code"><summary>展开完整'+name+'：与下载源码一致</summary>'+code(name,'PYTHON',configMemoryEvaluationFiles[name])+'</details>':'')+
 '<p class="practice-links"><a href="labs/config-memory-evaluation.zip" download>下载配置、训练状态与评估实验 ↓</a><a href="labs/config-memory-evaluation/'+name+'" download>下载'+name+' ↓</a><a href="labs/config-memory-evaluation/validation.json" target="_blank" rel="noopener">实际输出与源码摘要 ↗</a></p>'+para('<small>'+scope+'</small>'));
}
