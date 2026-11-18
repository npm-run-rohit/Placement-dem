# Database (RDS Postgres)

**Alarms:**

- `placement-prod-rds-cpu`: CPU above 80% for 15 minutes.
- `placement-prod-rds-free-storage`: free storage below 5 GB.
- `placement-prod-rds-connections`: more than 80 connections.

## Check

- **CPU:** Performance Insights > Top SQL. Reports and the queue list are the heavy readers. A reporting read replica
  is in the plan (PLAN 4.3).
- **Storage:** storage autoscales up to 200 GB (`maxAllocatedStorage`). Near that limit, find the biggest tables:

  ```sql
  SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
    FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
  ```

  Documents live in S3, not the database. Growth is mostly the audit, thread and mail tables, which are append-only
  by design: never delete from them by hand.
- **Connections:** each API or worker task holds a TypeORM pool. Many connections usually means many tasks, or
  stuck transactions: `SELECT state, count(*) FROM pg_stat_activity GROUP BY state;`

## Fix

- **A runaway query:** `SELECT pg_cancel_backend(<pid>);`
- **Lasting load:** a bigger instance class (`data-stack.ts`) or the reporting replica.
- **Storage at its limit:** raise `maxAllocatedStorage`.
