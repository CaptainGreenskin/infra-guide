/* Access choices and retry semantics, with SQLite evidence kept engine-specific. */
const sqlPathSnapshotLinks='<p class="practice-links"><a href="labs/sql-paths-snapshots.zip" download>下载索引与快照重试实验 ↓</a><a href="labs/sql-paths-snapshots/README.md" target="_blank" rel="noopener">环境、变化题与运行说明 ↗</a><a href="labs/sql-paths-snapshots/validation.json" target="_blank" rel="noopener">两版本实际计划与执行记录 ↗</a></p>';
function sqlPathSnapshotSource(name){return '<details class="full-code"><summary>展开完整 '+name+'：与下载文件一致</summary>'+code(name,'PYTHON',sqlPathSnapshotFiles[name])+'</details>';}
sources.sqliteProgressCallbacks=['SQLite · 查询进度回调的计数边界','https://sqlite.org/c3ref/progress_handler.html'];
{
 const a=articles.find(a=>a.id==='database-index-locks');
 a.sections[1][1]+=figure('v35-covering-index','复合键的逻辑顺序：固定租户与状态后按时间倒序。非覆盖时 amount 仍需从表行取得，覆盖后本查询所需字段都在索引；不是物理 B 树页或 I/O 次数。');
 a.sections[3][1]+='<h3>定位、排序与覆盖是三个独立问题</h3>'+table(['读计划时问什么','看哪一层证据','别由此推出什么'],[
  ['先定位多大的集合','哪些 WHERE 项参与索引范围，剩余哪些要过滤','SEARCH 不等于必然只检查很少数据'],
  ['结果是否已经有序','索引顺序是否满足 ORDER BY，是否还需临时排序','用了某个索引，不等于免排序'],
  ['所需字段从哪里来','搜索、排序和返回字段是否都被索引覆盖','覆盖不等于没有遍历、没有代价']])+
  para('在 SQLite 的诊断计划里，SCAN 还可能表示按某个索引遍历，并不总是“没有用索引”。SEARCH 表示按条件访问子集，这个子集仍可能很大。把“命中索引”当唯一验收标准，会同时漏掉范围过宽、额外排序和大量回表。',
  '覆盖与有序也能分开变化。原索引只含键时，追加 amount 可以满足这份查询的覆盖；查询再返回 note，覆盖结论就要重算。反过来，即使字段仍被覆盖，把排序改成 abs(created)，现有普通 created 键也不一定直接提供该表达式顺序。表达式索引等其他设计需另行验证，不能扩写成“带函数就永远不能用索引”。');
 a.sections[4][1]+='<h3>结束旧事务，不等于刷新了旧业务决定</h3>'+para(
  '考虑库存先为 100，另一事务已补货 10。旧读者仍拿着 100 算“出库 5 后剩 95”。旧快照写失败后，即使回滚并新开事务，再把 95 无条件写回，数据库也可能正常提交，但补货已被覆盖。恢复需要重验业务条件、重新读取必要状态，再执行与当前状态一致的动作；只重试最后一条 SQL 可能保留了错误的前提。',
  '若业务能写成条件相对更新，如“库存至少 5 时减 5”，也要检查影响行数并明确事务隔离、并发检查和外部效果。数据库本地重试并不授权再次调用独立支付或出库服务；已经发生的外部效果仍按原操作身份核对。');
 const base=a.sections[6][1],codeBlock=base.match(/<div class="code-block">[\s\S]*?<\/pre><\/div>/);
 if(!codeBlock)throw Error('Review the original SQL source before wrapping');
 a.sections[6][1]=base.replace(codeBlock[0],'<details class="full-code"><summary>展开基础程序：索引前后与两个写者</summary>'+codeBlock[0]+'</details>');
 a.sections[6][1]+='<h3 id="sql-plan-lab">进阶实战一：同样五条结果，四种访问路径</h3>'+para(
  '这次另用 240 行小夹具，与前面的百万订单推导不是同一规模。三家店各 80 行；目标店 paid 状态 20 行，再加 created≥1100 的条件有 12 行，最终倒序取 5 行。240/80/20/12/5 描述输入分布和结果，不是引擎扫描行数。四份独立内存库保存完全相同的行，只改变索引布局。')+
  code('固定业务查询；参数为 1、paid、1100','SQL','SELECT id, amount FROM orders\nWHERE tenant=? AND status=? AND created>=?\nORDER BY created DESC, id DESC LIMIT 5;')+
  table(['索引布局','本次 SQLite 计划中的关键差别','返回 id'],[
   ['无索引','表扫描；另做 ORDER BY 临时排序','236、224、212、200、188'],
   ['仅 tenant','按租户搜索；仍需过滤和临时排序','相同'],
   ['tenant/status/created DESC/id DESC','按前缀与时间范围搜索；无需额外排序，amount 从表行取','相同'],
   ['再加 amount','保持范围与顺序；本查询使用覆盖索引','相同']])+
  figure('v35-query-callbacks','两套实际 SQLite 版本的 N=1 进度回调次数，语句已预热。它不是精确 VM 指令数、扫描行、磁盘 I/O 或耗时；不能拿两版本数字当性能排名。')+
  para('脚本还把 ORDER BY created 改成 abs(created)。本夹具的 created 都为正，返回同样五行，但现有索引又需要临时排序：覆盖属性仍在，排序属性改变了。对照输出中的原始计划和结果，比看到一个索引名就宣布成功更有用。',
  '进度回调只提供本次内部工作的一个观测。N 本身是近似指令间隔，某些准备过程也可能触发回调；不同版本的回调和计划文字会变。实际延迟、缓存页、锁等待与写入代价要另测。此处没有把 1059 次回调解释为读了 1059 行，也没有声称覆盖索引让业务快了固定倍数。')+
  '<p class="evidence-note">计数语义：<a href="'+sources.sqliteProgressCallbacks[1]+'" target="_blank" rel="noopener">SQLite 官方进度回调说明 ↗</a>。</p>'+
  code('只需 Python 3.9+ 标准库','SHELL','python3 query_paths.py')+sqlPathSnapshotSource('query_paths.py')+
  '<h3 id="sql-snapshot-lab">进阶实战二：旧快照写失败后，重做哪一步</h3>'+para(
  '两个独立 WAL 连接在一个进程内按确定顺序交错执行，不依赖睡眠。R 先 BEGIN 并读到库存 100；W 补 10 并提交 110；R 在旧快照仍读到 100，随后尝试写入，被拒绝升级。Python 3.12.13/SQLite 3.53.3 本次报告扩展错误 SQLITE_BUSY_SNAPSHOT（517）；3.9.6/3.51.0 的接口只记录到异常文本。')+
  figure('v35-snapshot-retry','实际本机 SQLite/WAL 调用顺序，步骤号不是测得时间。正负分支各自从新数据库开始：重新核对得到 105，照搬旧计算得到 95。')+
  table(['回滚后只改这一项','数据库能否提交','业务账本'],[
   ['BEGIN IMMEDIATE 后重读 110，重验条件，再减 5','能，提交 105','保留补 10 与减 5'],
   ['新开事务，照搬旧计算 100−5，绝对赋值 95','也能，提交 95','覆盖了已经提交的补货']])+
  para('两个分支都能完成新事务，只有第一个满足 100+10−5=105。重试成功状态码不能代替业务不变量。移到 MySQL/InnoDB 时，重新核对隔离级别、快照建立时点、索引加锁与错误码；本程序的单写者和 517 不能直接移植。')+
  code('两连接、本机临时数据库','SHELL','python3 snapshot_retry.py')+sqlPathSnapshotSource('snapshot_retry.py')+sqlPathSnapshotLinks;
 a.sections=a.sections.map(([title,body])=>[title,infraReadableHTML(body)]);
 a.refs.push('sqliteProgressCallbacks');a.updated='2026.11.05';a.minutes=65;
 a.check.push('分开索引定位、排序、覆盖与真实代价','用已提交补货不被覆盖的不变量判断事务重试');
}
cloudKnowledgeExplanations['database-service']+='<h3>计划与恢复分别要有验收对象</h3>'+para(
 '索引定位范围、是否额外排序、是否覆盖返回字段，需要分别看。访问路径变短也不会自动缩短其他事务的持有时间；新事务建立后，应用仍可能照搬旧状态下的错误决定。先写出需要保留的业务变化，再判断一次重试是否正确。')+
 linkTo('database-index-locks','用四种访问路径和两个快照重试分支核对');
