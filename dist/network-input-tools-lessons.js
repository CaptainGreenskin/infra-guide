/* Original mechanism lessons and actual evidence for the 23rd iteration. */
Object.assign(sources,{
 v23DNS:['Kubernetes · Pod与Service的DNS记录','https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/'],
 v23Proxy:['Kubernetes · 虚拟IP与服务代理','https://kubernetes.io/docs/reference/networking/virtual-ips/'],
 v23Slice:['Kubernetes · EndpointSlice与端点条件','https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/'],
 v23Policy:['Kubernetes · NetworkPolicy的方向与选择器','https://kubernetes.io/docs/concepts/services-networking/network-policies/'],
 v23SSL:['Python · SSL上下文、证书与主机名校验','https://docs.python.org/3/library/ssl.html'],
 v23Data:['PyTorch 2.5 · Dataset、Sampler与DataLoader','https://pytorch.org/docs/2.5/data.html'],
 v23Tools:['MCP 2025-11-25 · 工具发现、调用与错误','https://modelcontextprotocol.io/specification/2025-11-25/server/tools']
});
const nitResult=name=>networkInputToolsValidation.programs[name].result;
const nitRefs=keys=>[...new Set(keys)].filter((key,index,all)=>all.findIndex(other=>sources[other][1]===sources[key][1])===index);
function nitLab(name,full=true){
 const result=nitResult(name);let lead,rows,scope;
 if(name==='tls_identity.py'){
  lead='临时CA签发一个reports.internal.test证书；真实TCP连接始终指向127.0.0.1，再分别改变TLS校验名字、客户端信任与HTTP Host。';
  rows=[['TCP连接','成功；此时没有任何HTTP请求'],['信任CA且名字正确','TLS通过，HTTP 200，报告R17/v3/37'],['名字错误 / 不信任CA','均为证书校验失败，没有进入HTTP处理'],['TLS名字正确、Host错误','TLS通过，HTTP 421 unknown_virtual_host'],['实际记录','4次SNI，2次HTTP；证书校验始终开启']];
  scope='Python标准库 + openssl命令。本机回环TLS/HTTP已运行；未执行DNS查询、Service转发或CNI测试。';
 }else if(name==='sampler_coverage.py'){
  lead='真实运行PyTorch 2.5.1、两个CPU/Gloo进程，每个进程再启动两个DataLoader worker；保存每个样本ID、worker和批次。';
  rows=[['Sampler补齐、Loader不丢尾','交付12次，唯一ID 11，重复ID 0；每rank 2批'],['Sampler丢尾、Loader不丢尾','交付10次，漏ID 10；每rank 2批'],['两种Sampler + Loader丢尾','都只交付8项，漏8/9/10；每rank 1批'],['流式数据只分rank、不分worker','交付22次；每个ID读两遍'],['流式数据同时分rank和worker','覆盖11项、不重不漏；批次数4与3'],['再丢每个worker的尾批','剩8项，漏8/9/10；两rank各2批']];
  scope='已实际运行采样器、CPU进程与worker；未执行模型训练、GPU拷贝或吞吐测试。';
 }else if(name==='packing_boundaries.py'){
  lead='两篇独立文档长度为3和2，都含结束符EOS。固定二维向量，比较独立计算、正确打包、跨文档可见、位置未归零四种注意力输出。';
  rows=[['正确文档内因果mask与位置','和逐文档计算最大差为0'],['只用普通因果mask','跨文档最大差约'+result.cross_document_max_error.toFixed(6)],['隔离文档但延续位置编号','最大差约'+result.global_positions_max_error.toFixed(6)],['训练标签','本例有效预测目标3个；直接拼接变4个']];
  scope='标准库固定向量数学参考；位置向量为教学定义，未实现真实分词器、RoPE、LLM或GPU训练。';
 }else{
  lead='通过真实本地HTTP发现和调用工具，SQLite保存实际报告及原操作回执。提议由脚本给出，不调用模型；独立验收读取实际产物。';
  rows=[['正常读、写、验收','SUCCEEDED；2次工具尝试，1次效果'],['同操作再写一次','仍成功；3次尝试，1次效果，返回原回执'],['total=true后修复','布尔值先被类型检查拒绝；只产生2次实际调用'],['访问其他主体的orders-B','DENIED，资料999未进入回应'],['返回错误类型 / 只说完成','分别为FAILED_RESULT_SCHEMA / INCOMPLETE'],['持续读同一份资料','第4次提议被预算阻断；实际工具尝试3次'],['一次只读503再重试','成功；3次尝试，重试计入预算'],['工具成功写总数38','实际效果1次，最终仍INCOMPLETE'],['同操作换参数','TOOL_ERROR / operation_conflict；效果仍1']];
  scope='实际HTTP/JSON-RPC形状与本地事务；不是完整MCP服务、真实身份认证、LLM规划、崩溃恢复或Kairo接入。';
 }
 const torch=name==='sampler_coverage.py';
 return infraReadableHTML(para(lead)+code(torch?'已安装PyTorch 2.5.1的Python环境':'Python 3.9+ · 在解压目录运行','SHELL',(torch?'python ':'python3 ')+name)+
 table(['控制条件 / 检查','实际结果'],rows)+
 (full?'<details class="full-code"><summary>展开完整'+name+'：与下载源码一致</summary>'+code(name,'PYTHON',networkInputToolsFiles[name])+'</details>':'')+
 '<p class="practice-links"><a href="labs/network-input-tools.zip" download>下载网络、训练输入与工具执行实验 ↓</a><a href="labs/network-input-tools/'+name+'" download>下载'+name+' ↓</a><a href="labs/network-input-tools/validation.json" target="_blank" rel="noopener">实际输出与源码摘要 ↗</a></p>'+para('<small>'+scope+'</small>'));
}

