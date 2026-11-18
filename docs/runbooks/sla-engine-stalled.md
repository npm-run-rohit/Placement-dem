# SLA engine stalled

**Alarm:** `placement-prod-sla-engine-stalled`. The SLA sweep has not finished for more than 5 minutes
(`HeartbeatAgeSeconds{Job=sla-sweep}`), or there is no data at all.

**Impact:** insurer follow-ups (FU1 / FU2 / escalation) stop going out, and SLA-P1 reminders and escalations to the
Placement Head stop. SLA clocks keep counting, so a long stall means a burst of escalations once the sweep is back.

## Check

1. Is the worker running? If `placement-prod-worker-down` is also firing, follow [worker-down](worker-down.md).
2. Worker log (`/placement-prod/worker`): look for `SlaSweeperHandler` errors, or a sweep that starts but never ends
   (a long-running query or lock).
3. Redis: the sweep is a BullMQ repeating job. If Redis is full or unreachable, no repeating job runs. See
   [redis](redis.md).
4. Database: a lock held by a stuck transaction blocks the sweep's per-ticket locks. In `psql`:
   `SELECT pid, now() - xact_start AS age, state, query FROM pg_stat_activity WHERE state <> 'idle' ORDER BY age DESC;`

## Fix

- Worker hung: restart it (`--force-new-deployment` on `placement-prod-worker`). On boot the worker re-registers its
  repeating jobs.
- A blocking transaction older than a few minutes: `SELECT pg_cancel_backend(<pid>);`, then watch the heartbeat
  recover.
- The alarm clears once `HeartbeatAgeSeconds` drops below 300. The first sweep after a stall catches up (the ladder
  sends only the latest due step).
