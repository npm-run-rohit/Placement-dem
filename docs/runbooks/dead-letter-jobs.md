# Dead-lettered jobs

**Alarm:** `placement-prod-dead-letter-jobs`. At least one queue job used up its retries (5, exponential backoff) and
stopped (`FailedJobsTotal`). BullMQ keeps failed jobs (`removeOnFail: false`); they are the dead-letter queue.

**Impact:** whatever that job did did not happen: a mail not sent, a BimaSetu message not delivered, a Copycat run
not started, a notification not shown. The dashboard widget "Dead-lettered jobs by queue" shows which queue.

## Check

From a worker shell (ECS Exec), list a queue's failed jobs with their errors:

```bash
node -e "
const { Queue } = require('bullmq');
const q = new Queue(process.argv[1], { connection: { url: process.env.REDIS_URL } });
q.getFailed(0, 20).then(js => { for (const j of js) console.log(j.id, j.name, j.failedReason); process.exit(0); });
" mail-outbound
```

Queues: `mail-outbound`, `bimasetu-inbound`, `bimasetu-outbound`, `copycat-runner`, `notifications`,
`mail-inbound`, `outbox-relay`, `sla-sweep`, `bimasetu-reconciliation`, `ops-metrics`.

## Fix

1. Fix the cause the `failedReason` names (credentials, a partner outage, a bug).
2. Retry. Every handler is idempotent (jobId = outbox id / message id), so a retry never duplicates:

   ```bash
   node -e "
   const { Queue } = require('bullmq');
   const q = new Queue(process.argv[1], { connection: { url: process.env.REDIS_URL } });
   q.retryJobs({ state: 'failed' }).then(() => process.exit(0));
   " mail-outbound
   ```

3. A job that must not run again (it is obsolete, or someone already did the work by hand): remove it with
   `(await q.getJob(id)).remove()` and note it in the ticket's audit trail.

The alarm clears when no failed jobs are left.

Queue-specific pages: [mail-send-failures](mail-send-failures.md), [bimasetu-inbound](bimasetu-inbound.md),
[copycat-failures](copycat-failures.md).
