function databaseInterviewWorkshop() {
 const record = practiceEvidence['interview-database'];
 const plans = record.plans;
 const labels = ['只有主键', '增加租户索引', '增加复合索引'];
 const query = `SELECT id, created_at FROM jobs
WHERE tenant_id = 7 AND state = 'queued'
ORDER BY created_at DESC, id DESC LIMIT 5;`;
 return `<section class="workshop-body"><h2>一页作业列表，为什么只取五行还要等？</h2>
 <p>控制台展示一个租户最近的五个排队作业。数据有 16,000 行，租户 7 占 500 行，其中 333 行仍在排队。多个作业可能有相同创建时间，用 id 决定先后。</p>
 ${trainingCode('先写出查询需要满足的过滤条件和顺序','SQL',query)}
 <h3>第一步 · 先预测访问路径</h3><p>比较三个方案：只有主键、有 tenant_id 单列索引、有 (tenant_id, state, created_at DESC, id DESC) 复合索引。在哪一种情况下，数据库可以按目标顺序读出前五行？请先写下判断，再打开计划。</p>
 <details><summary>核对三份执行计划</summary>
 ${trainingTable(['索引方案','本机 SQLite 实际计划'],plans.map((stage,i)=>[labels[i],stage.plan.map(line=>'<code>'+trainingEscape(line)+'</code>').join('<br>')]))}
 <p>第一份计划扫描表，再临时排序。第二份利用索引定位租户，仍需过滤状态并排序。第三份沿前两列的等值条件定位连续区间，后两列提供所需顺序，查询所需字段都在索引内。本次三种方案的作业 ID 完全一致，依次为 ${plans[0].result_ids.join('、')}。</p>
 <p>LIMIT 5 限制的是返回量。仅凭一个时间值或“用了索引”不能判断工作量。若页面改成跨租户查全部作业，索引的首列和排序条件就变了；新增索引还增加写放大和空间占用。</p></details>
 <h3>第二步 · 把“列表未更新”与“查询慢”分开</h3>
 <p>SQLite 使用 WAL，读连接在事务内先读到 queued。另一个连接把这个作业改成 running 并提交。读连接在原事务中再读一次，结束事务并开启新事务后再读一次。请写出三次状态，并解释加索引能否改变第二次读数。</p>
 <details><summary>核对两条连接的读数</summary><p>脚本实测为 <strong>${record.snapshot_reads.join(' → ')}</strong>。第一次 SELECT 建立读快照。写连接提交后，读连接仍在原快照里；新事务看到新状态。索引改变访问路径，事务边界决定这个例子里的可见版本。</p></details>
 <h3>第三步 · 留下可复查的诊断结论</h3>
 <p>自测每项 1 分：写出确定的排序；用计划指认剩余排序；核对返回行相同；解释旧快照；说明上线后要观察写入成本与真实延迟。漏哪一项，就重做对应步骤。</p>
 ${trainingCode('下载脚本后原样复跑 · Python 3 标准库','BASH','python3 query_lab.py')}
 <p class="practice-links"><a href="/labs/interview-database/query_lab.py" download>下载 SQLite 实验 ↓</a><a href="/labs/interview-database/validation.json" target="_blank" rel="noopener">本次完整记录 ↗</a></p>
 <p class="evidence-note">本次使用 SQLite ${record.sqlite} 和临时数据库。计划格式与选择可能随版本和数据变化。MySQL 或云数据库应再用目标引擎的计划、锁等待和负载验证。
 <a href="https://sqlite.org/eqp.html">SQLite 执行计划</a> · <a href="https://sqlite.org/queryplanner.html">查询规划</a> · <a href="https://sqlite.org/isolation.html">事务隔离</a></p></section>`;
}
