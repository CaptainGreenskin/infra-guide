# 在 MySQL 8.4 中区分索引访问、锁等待与死锁

一个实际 MySQL 8.4.13 实例运行两组独立夹具。第一组查询 4,096 条订单，第二组让两个连接修改同一对账户。程序分别核对访问计划、等待对象和最终提交效果。

## 运行

需要 Python 3.9+ 和本机 Linux Docker。程序复用课程 MySQL 复制实验的官方镜像摘要 `a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902`，启动后另查 `VERSION()`。首次运行可能需要拉取镜像。容器使用 `--network none`，没有发布端口。专用数据卷、容器和会话都由本次运行创建，退出时按唯一所有者标签清理并核对。镜像缓存可保留。固定密码只用于容器内合成夹具。

```sh
python3 -B innodb_lab.py --json native-record.json
python3 -B innodb_lab.py --check-record native-record.json
```

第一条运行实际数据库。第二条只读记录，重新核对源码摘要、数值、原始计划、锁边、错误码和清理状态。

## 同一 SQL 改变一条索引

`orders` 的每条记录有主键、租户、创建序号和金额。主键 `i` 从 1 到 4096，租户是 `i % 16`，创建序号是 `i // 16`，金额是 `(7×i) % 97 + 1`。查询租户 7、序号 200 到 250，按序号和主键排序。

```sql
SELECT id, amount
FROM innodb_lab.orders
WHERE tenant_id=7 AND created_seq BETWEEN 200 AND 250
ORDER BY created_seq, id;

CREATE INDEX ix_orders_tenant_seq
ON innodb_lab.orders(tenant_id, created_seq, id);
```

先留表扫描计划，再建索引并收集统计，执行同一条查询。预期两次各返回 51 条完全相同的记录，计划从读取 4,096 行的表扫描变为读取 51 行的索引范围扫描。记录保留实际 `EXPLAIN ANALYZE` 树和完整查询输出。`rows` 与 `loops` 属于该迭代器，实际访问路径和行数不等同于物理磁盘读次数或生产延迟。

## 一条等待边可以等到释放

账户 1 和 2 的初始余额均为 100。左连接给账户 1 加 10，事务暂不提交。右连接尝试给同一账户加 20。观察连接从 `performance_schema.data_lock_waits` 找到右连接指向左连接的等待边，再用 `data_locks` 核对主键记录 1、锁模式和两端状态。此时观察连接的普通查询仍读到已提交的 100。

先确认等待边，再让左连接提交。右连接完成被阻塞的更新，并提交自己的业务回执。预期余额为 130 和 100，两份回执都存在。

## 两条相反的边会形成环

1. 左连接先给账户 1 加 3，右连接先给账户 2 加 7，各自在事务里写自己的回执。
2. 左连接再请求给账户 2 加 5。观察连接实际找到左等右的边后，才让右连接请求给账户 1 加 11。
3. MySQL 选择一个死锁牺牲者，并向其返回 `1213 / 40001`。程序保存原错误和 `SHOW ENGINE INNODB STATUS` 的死锁诊断。检测器会立即拆掉等待环，因此本实验直接采集的是第一条等待边与随后出现的死锁诊断。
4. 只提交幸存事务。若左连接幸存，余额为 133 和 105，只保留 `dead-left`。若右连接幸存，余额为 141 和 107，只保留 `dead-right`。牺牲者的首笔更新和回执都应一起回滚。

两条操作连接始终保持同一原生连接 ID，客户端关闭自动重连。同步由真实等待边触发，短轮询只负责寻找它。账户余额还由提交回执独立复算。记录按实际结果标出牺牲者，程序接受任意一个符合账本的选择。

[MySQL 8.4 EXPLAIN ANALYZE](https://dev.mysql.com/doc/refman/8.4/en/explain.html) · [MySQL 8.4 data_lock_waits](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-data-lock-waits-table.html) · [MySQL 8.4 死锁检测](https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlock-detection.html)
