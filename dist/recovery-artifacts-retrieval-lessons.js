/* Evidence scopes: local backup/HTTP/tensor/FTS execution versus declared times and labels. */
Object.assign(sources,{
 v27PITR:['PostgreSQL 18 · 连续归档与时间点恢复','https://www.postgresql.org/docs/18/continuous-archiving.html'],
 v27SafeTensor:['Safetensors · PyTorch张量保存与读取','https://huggingface.co/docs/safetensors/api/torch'],
 v27FTS:['SQLite · FTS5分词、MATCH与BM25','https://www.sqlite.org/fts5.html'],
 v27RRF:['Elasticsearch · 倒数排名融合','https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion']
});
const rarResult=name=>recoveryArtifactsRetrievalValidation.programs[name].result;
function rarLab(name,full=true){
 let lead,rows,scope,install='';
 if(name==='consistent_recovery_cut.py'){
  lead='用真实SQLite Backup API、应用逻辑日志与不可变对象夹具，比较物理校验、数据库位置和业务可读取的完整前缀。';
  rows=[['只缺object-v3，直接重放数据库到103','integrity_check=ok；名义距故障3分钟，R3附件缺失，业务不合格'],['逐事务验完整业务状态','最后完整101/11:42，距12:00为18分钟，超过15分钟目标'],['全部材料齐备','103/11:57，缺口3分钟，四份A报告可读'],['日志缺102','不能跳到103；停101'],['v2对象摘要不符','101回滚，保留100/11:30'],['消费者负例','本例A查询取不到B报告，不等于部署IAM验收']];
  scope='真实本地备份与文件核对；分钟为题设，日志为应用逻辑夹具，不是PostgreSQL WAL、云容灾或RTO实测。';
 }else if(name==='recovered_effects.py'){
  lead='实际本机HTTP接收方保存独立SQLite回执；恢复旧应用备份后，outbox重新出现PENDING，外部效果仍存在。';
  rows=[['第一次提交后注入503','效果已存在，同ID确认返回原回执'],['恢复旧应用数据库','outbox从DONE倒回PENDING，接收方不倒退'],['接收方代际升到2','旧代际新写409；当前代际+原ID为200/duplicate=true'],['同ID换参数','409 intent_conflict'],['正确恢复','outbox最终DONE，效果仍1笔37'],['独立错误反例','恢复后错换新业务ID，效果变2笔']];
  scope='实际HTTP/SQLite，不是真实故障切换或认证系统。代际号不是凭据；提升是可信夹具动作，代际与写入在接收方同一事务核对。';
 }else if(name==='artifact_bundle.py'){
  lead='PyTorch 2.5.1、Safetensors 0.8.0实际保存并加载CPU张量，绑定模型配置、词表和清单，再用SQLite条件切换版本指针。';
  rows=[['r17固定合同','A→1、B→2、未知→0，门禁通过'],['r18只换词表ID','文件与shape合法；A→2、B→1，语义门禁拒绝'],['r19同时换词表与对应权重行','仍A→1、B→2，门禁通过'],['混装r19权重+r17词表','输出再次错误，需固定完整束'],['生产指针','r17/1 → r19/2 → r17/3；迟到旧发布者拒绝'],['残缺回退/篡改','缺成员不切换，摘要不符在张量读取前拒绝']];
  install='python -m pip install -r requirements-model.txt\n';
  scope='实际CPU小模型与本地指针。A/B是固定语义合同，不是LLM质量；未运行GPU、分布式路由或线上灰度。';
 }else{
  const r=rarResult(name);
  lead='实际建立8条中文材料的SQLite FTS5索引，先看分词，再用BM25、声明的第二路排名、精确RRF及分级标签核对结果。';
  rows=[['原文直接unicode61，查“恢复”','本语料没有该独立词，实际0命中'],['教学汉字二元切分','查询变数据/据库/库恢/恢复，再执行OR匹配'],['实际BM25排名','a-backup、a-plan、a-archive、a-dr；分数越小越靠前'],['RRF固定k=60','融合排名a-backup、a-archive、a-plan、a-dr'],['前3名指标','两者P=1、Recall=0.75、RR=1；nDCG '+r.lexical_metrics.ndcg_at_3.toFixed(4)+'→'+r.rrf_metrics.ndcg_at_3.toFixed(4)],['正文更新但索引未更新','正文2/索引1，版本检查排除；重建后均2']];
  scope='实际FTS5/BM25；第二路排名和相关性等级明确给定，不调用embedding/LLM或向量库。二元切分不是通用中文分词器。';
 }
 return infraReadableHTML(para(lead)+code('标准库Python 3.9+；模型例环境见README','SHELL',install+'python '+name)+table(['检查','实际结果或声明输入'],rows)+
 (full?'<details class="full-code"><summary>展开完整'+name+'：与下载源码一致</summary>'+code(name,'PYTHON',recoveryArtifactsRetrievalFiles[name])+'</details>':'')+
 '<p class="practice-links"><a href="labs/recovery-artifacts-retrieval.zip" download>下载恢复、模型包与中文检索实验 ↓</a><a href="labs/recovery-artifacts-retrieval/'+name+'" download>下载'+name+' ↓</a><a href="labs/recovery-artifacts-retrieval/validation.json" target="_blank" rel="noopener">实际输出与源码摘要 ↗</a></p>'+para('<small>'+scope+'</small>'));
}
