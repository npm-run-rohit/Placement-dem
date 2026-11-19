# Runbooks

One page per alarm (PLAN 4.6). Every CloudWatch alarm in `infra/cdk/lib/monitoring-stack.ts` links its page here,
and an infra test fails if a linked page is missing. Alarms and recoveries email the alert address in `cdk.json`.
The `placement-prod` CloudWatch dashboard shows every metric below.

## Where the signals come from

- **App metrics** (namespace `BimaPlacement`): the worker's `ops-metrics` job runs every minute and writes them as
  CloudWatch Embedded Metric Format lines to its log (`apps/api/src/infrastructure/metrics`). If the worker is
  down there is no data, and the "stalled" alarms fire because they treat missing data as breaching.
- **AWS metrics:** load balancer, ECS Container Insights, RDS, ElastiCache.

| Alarm (`placement-prod-…`) | Runbook |
|---|---|
| `sla-engine-stalled` | [sla-engine-stalled](sla-engine-stalled.md) |
| `sla-engine-errors` | [sla-engine-errors](sla-engine-errors.md) |
| `outbox-relay-stalled`, `outbox-lag`, `outbox-failing` | [outbox-lag](outbox-lag.md) |
| `dead-letter-jobs` | [dead-letter-jobs](dead-letter-jobs.md) |
| `mail-send-failures` | [mail-send-failures](mail-send-failures.md) |
| `unmatched-mail-backlog` | [unmatched-mail-backlog](unmatched-mail-backlog.md) |
| `copycat-failures` | [copycat-failures](copycat-failures.md) |
| `bima-setu-inbound-retrying`, `bima-setu-inbound-rejected` | [bimasetu-inbound](bimasetu-inbound.md) |
| `email-layer-inbound-failing` | [email-layer-inbound](email-layer-inbound.md) |
| `api-no-healthy-hosts` | [api-down](api-down.md) |
| `api-target5xx`, `alb-elb5xx` | [api-errors](api-errors.md) |
| `worker-down` | [worker-down](worker-down.md) |
| `clamav-down` | [clamav-down](clamav-down.md) |
| `rds-cpu`, `rds-free-storage`, `rds-connections` | [database](database.md) |
| `redis-memory1`, `redis-memory2` | [redis](redis.md) |

## Common tools

**Logs.** Log groups are `/placement-prod/api`, `/worker`, `/oneoff` and `/clamav`. In CloudWatch Logs Insights:

```
fields @timestamp, context, msg
| filter level >= 40
| sort @timestamp desc
| limit 100
```

**A shell in a running task (ECS Exec):**

```bash
aws ecs execute-command --cluster placement-prod --task <task-id> --container worker --interactive --command sh
```

**Database queries.** Run `psql` from a one-off task with ECS Exec. The database is not reachable from outside the
VPC. Read-only queries are always safe. Changing data by hand bypasses `TicketWorkflow` (audit, SLA clock,
outbox), so do it only as a last resort and record it in the ticket's audit trail afterwards.

**Restarting a service** (new tasks, same image):

```bash
aws ecs update-service --cluster placement-prod --service placement-prod-worker --force-new-deployment
```
