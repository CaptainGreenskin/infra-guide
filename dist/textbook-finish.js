const expandedChapterIds = systemChapters.slice(textbookFirstChapter).map(article => article.id);
const deepenedChapterIds = ['iam-security','observability','data-pipeline','training-communication','agent-memory','agent-evaluation'];
for (const article of systemChapters.slice(textbookFirstChapter)) {
 if (!articles.some(existing => existing.id === article.id)) articles.push(article);
 article.check=[...article.objectives];
 article.edition='原理详解';
 article.updated='2026.11.04';
 article.level='连续讲解 · 推导与练习';
 article.textbook=true;
 article.baseline=article.id==='autograd-training'
   ?'PyTorch 2.5.1 · CPU 小模型；代码与证据范围见正文'
   :'手算与机制实验；真机性能按各章标注';
 article.minutes=Math.max(15,Math.ceil(article.sections.map(section=>section[1].replace(/<[^>]*>/g,'')).join('').length/220));
}
for (const id of deepenedChapterIds) {
 const article=articles.find(item=>item.id===id);
 article.edition='原理详解';article.updated='2026.11.04';article.textbook=true;
 article.minutes=Math.max(15,Math.ceil(article.sections.map(section=>section[1].replace(/<[^>]*>/g,'')).join('').length/220));
}
articles.sort((left,right)=>left.number.localeCompare(right.number,undefined,{numeric:true}));

const foundationOrder=['transformer-model','tokenization-embedding','attention-mechanics','transformer-block','position-encoding','autograd-training','gpu-execution','roofline-model','flash-attention-io','tensor-parallel-math'];
foundationOrder.forEach((id,index)=>{
 const article=articles.find(item=>item.id===id);
 article.number='0.'+(index+1);
});
const modelPrerequisites={
 'transformer-model':'了解向量与乘法即可；文中从张量形状和逐项乘加开始。',
 'tokenization-embedding':'先读模型骨架，知道隐藏维度、词表和 logits 的位置。',
 'attention-mechanics':'先读模型骨架与 token 到张量的路径；能检查矩阵乘法形状。',
 'position-encoding':'先读 Attention 与 Decoder 结构；知道 Q、K 点积和因果可见性。',
 'transformer-block':'先读 Attention 与 token 到张量的路径；知道分头、拼头与输出投影。',
 'autograd-training':'先读前五篇，能解释 token、掩码、残差和输出头。',
 'gpu-execution':'先读模型骨架；能解释张量形状和每元素字节数。',
 'roofline-model':'先读GPU执行与存储；知道矩阵形状、FLOP与字节的含义。',
 'flash-attention-io':'先读Attention与Roofline；能解释softmax分母和HBM流量。',
 'tensor-parallel-math':'先读模型计算和自动求导；知道矩阵乘法、非线性与一次更新。'
};
for (const id of foundationOrder) {
 const article=articles.find(item=>item.id===id);
 article.prereq=modelPrerequisites[id];
 for (const section of article.sections) {
  section[1]=section[1].replace(/(href="#\/article\/([^"?]+)"[^>]*>)([^<]*)/g,(match,prefix,target,label)=>{
   const destination=articles.find(item=>item.id===target);
   return prefix+(destination?label.replace(/0\.\d+/g,destination.number):label);
  });
 }
}
articles.sort((left,right)=>left.number.localeCompare(right.number,undefined,{numeric:true}));

const refreshedIds=[
 'iam-security','observability','data-pipeline','training-communication','agent-memory','agent-evaluation',
 'cloud-compute','elasticity','vpc-network','training-storage','storage-recovery','kubernetes-basics',
 'delivery','scheduling-resources','config-secrets','slo','resilience','kairo-practice',
 'checkpoint-recovery','training-performance','kubernetes-training','training-platform','gpu-scheduling','ai-lifecycle',
 'distributed-systems','incident','inference-performance','training-lab','production-readiness'
];
for(const id of refreshedIds) {
 const article=articles.find(item=>item.id===id);
 article.edition='原理详解';article.updated='2026.11.04';article.textbook=true;
 article.minutes=Math.max(15,Math.ceil(article.sections.map(section=>section[1].replace(/<[^>]*>/g,'')).join('').length/220));
}

function textbookReadingRoutes() {
 const courses=[
  ['模型与 GPU 原理','先沿一条token路径，走到梯度、存储与层内并行。','transformer-model',
   ['transformer-model','tokenization-embedding','attention-mechanics','transformer-block','position-encoding','autograd-training','gpu-execution','roofline-model','flash-attention-io','tensor-parallel-math']],
  ['Cloud 深入原理','从进程内存与并发，到数据库状态和缓存时序。','virtual-memory-oom',
   ['virtual-memory-oom','concurrency-pools','database-index-locks','cache-consistency']],
  ['Agent 深入原理','从事件重放与接管，走到检索、轨迹和执行隔离。','durable-workflows',
   ['durable-workflows','agent-retrieval','agent-observability','agent-sandbox']]
 ];
 return '<section class="textbook-routes"><h2>深入原理，沿章节连续读</h2><p>先解释每一步为何需要，再用同一例子推导。章节附代码、数值对照、失败边界和检验题。</p><div>'+
 courses.map(([title,description,start,ids])=>'<section><h3>'+title+'</h3><p>'+description+'</p>'+
 '<a class="inline-link" href="'+articleURL(start)+'">从第一篇开始 →</a><details><summary>展开 '+ids.length+' 篇课程</summary>'+
 ids.map(id=>{const a=articles.find(item=>item.id===id);return '<a href="'+articleURL(id)+'">'+a.number+' '+a.title+' →</a>'}).join('')+
 '</details></section>').join('')+'</div></section>';
}

const lessonPrograms={
 'virtual-memory-oom':['cloud-foundations/virtual-memory-oom.py'],
 'concurrency-pools':['cloud-foundations/concurrency-pools.py'],
 'database-index-locks':['cloud-foundations/database-index-locks.py'],
 'cache-consistency':['cloud-foundations/cache-consistency.py'],
 'autograd-training':['model-foundations/tiny_decoder.py'],
 'tokenization-embedding':['model-foundations/tokenization.py'],
 'position-encoding':['model-foundations/rope.py'],
 'durable-workflows':['agent-foundations/durable-workflows.py'],
 'agent-retrieval':['agent-foundations/agent-retrieval.py'],
 'agent-observability':['agent-foundations/agent-observability.py'],
 'agent-sandbox':['agent-foundations/agent-sandbox.py']
};
if(practiceEvidence.textbooks) {
 for(const [id,files] of Object.entries(lessonPrograms)) {
  const article=articles.find(item=>item.id===id);
  article.sections.push(['配套代码与本次运行结果',
   '<p>先预测结果，再运行同一份代码核对。下面保留本次执行的输出，便于比较；环境与源码摘要在验证记录中。</p>'+
   files.map(file=>{
    const result=practiceEvidence.textbooks.programs[file];
    return '<p class="practice-links"><a href="labs/'+file+'" download>下载 '+file.split('/').pop()+' ↓</a>'+
    '<a href="labs/textbooks/validation.json" target="_blank" rel="noopener">验证记录 ↗</a></p>'+
    '<details class="full-code"><summary>展开本次运行输出</summary>'+code('实际输出','TEXT',result.stdout)+'</details>';
   }).join('')]);
 }
}

const textbookTitles={
 'transformer-model':'Transformer 全貌：下一个词是怎么预测出来的',
 'tokenization-embedding':'Token、词表与 Embedding：标签如何对齐',
 'attention-mechanics':'Attention 深入推导：QKV、掩码与多头',
 'position-encoding':'位置编码与 RoPE：相对位置怎样进入点积',
 'transformer-block':'Decoder Block：前馈、残差与归一化',
 'autograd-training':'交叉熵与自动求导：完成一次真实更新',
 'gpu-execution':'GPU 执行与存储：线程如何处理张量',
 'roofline-model':'Roofline：从计算量与字节判断瓶颈',
 'flash-attention-io':'FlashAttention：分块如何保持全局 Softmax',
 'tensor-parallel-math':'张量与流水线并行：切分后的计算与通信',
 'virtual-memory-oom':'虚拟内存与 OOM：导出任务为什么被终止',
 'concurrency-pools':'并发与线程池：锁、排队和容量',
 'database-index-locks':'数据库访问：索引、事务与锁等待',
 'cache-consistency':'缓存一致性与击穿：旧值为何重新出现',
 'durable-workflows':'持久工作流：事件重放、接管与提交',
 'agent-retrieval':'检索与上下文：让答案有可验证的证据',
 'agent-observability':'Agent 观测：任务、重试与成本归因',
 'agent-sandbox':'Agent 沙箱：隔离、资源与生命周期'
};
for(const [id,title] of Object.entries(textbookTitles)) articles.find(article=>article.id===id).title=title;
