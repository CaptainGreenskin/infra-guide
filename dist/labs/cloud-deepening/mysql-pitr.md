# MySQL 8.4：逻辑基线 + binlog 的隔离恢复步骤

这是目标环境操作手册；本次未启动 MySQL 或执行这些命令。本地 `recovery_lab.py` 使用 SQLite 的真实备份与应用日志，不能代替本手册的 MySQL 验证。

适用题设：同版本隔离测试源/目标，业务库 `lab` 的表均为 InnoDB，基线期间无 DDL，完整保留相关 binlog，目标与源分离并隔离业务写入。使用提前配置好的 `source`/`restore` login-path，不把密码放进命令或课程文件。GTID、多源、加密与物理备份有额外恢复规则，应按实际方案核对。

1. 获取一致逻辑基线并保留恢复坐标：

```sh
mysqldump --login-path=source --single-transaction --source-data=2 \
  --set-gtid-purged=OFF --databases lab > baseline.sql
```

`--source-data=2` 以注释记录文件/位置；`--single-transaction` 的一致性范围是事务表，不能在导出时并发做相关 DDL。此处有意选择文件位置恢复，不把 `gtid_purged` 当成一行万能设置。

2. 核对基线中的坐标、误操作所在事务与目标边界。用匹配版本的 `mysqlbinlog` 检查日志，不把展示用 `--verbose --base64-output=DECODE-ROWS` 输出当作可执行恢复流。确定首个日志的开始位置及最后日志排除坏事务的停止位置；准备其间完整、顺序正确的文件，不能只给首尾两个文件而漏掉中间段。

3. 在隔离目标恢复基线：

```sh
mysql --login-path=restore < baseline.sql
```

4. 下面的 Bash 片段在手工确定坐标后运行。先将 `FIRST_POS`/`STOP_POS` 设置成实际数字，把 `LOG_FILES` 换成从起点到终点的全部已验证文件。单文件恢复时数组只放该文件一次。停止边界必须经过事务核对。

```bash
set -euo pipefail
: "${FIRST_POS:?set baseline next-event position}"
: "${STOP_POS:?set target stop position in last file}"
# Example names only: replace every name with the verified ordered chain.
LOG_FILES=(mysql-bin.000123 mysql-bin.000124 mysql-bin.000125)
mysqlbinlog --start-position="$FIRST_POS" --stop-position="$STOP_POS" \
  "${LOG_FILES[@]}" | mysql --login-path=restore
```

`start-position` 对首个文件、`stop-position` 对最后文件生效。逐个文件单独重用相同坐标会改变含义。恢复流也可能影响多个库，应先核对完整内容与依赖；不要随意加过滤参数后假定仍保持事务语义。

5. 核查目标业务行、聚合、schema/权限与已恢复提交范围；对照教学历史应包含 T103 得到余额125，排除误清零 T104。再验证新业务 ID 的后续写入与回执，最后按恢复设计切流。记录准备、传输、重放、验收和正式恢复时间；已经发生的后续合法业务另行对账。

依据：

- https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html
- https://dev.mysql.com/doc/refman/8.4/en/point-in-time-recovery-binlog.html
- https://dev.mysql.com/doc/refman/8.4/en/mysqlbinlog.html
