# Worker down

**Alarm:** `placement-prod-worker-down`. No worker task is running.

**Impact:** nothing in the background runs: outbox relay (mail, BimaSetu, notifications), SLA sweep, Copycat,
inbound processing and ops metrics. The "stalled" alarms fire alongside this one. The API still works, and events
queue up in the outbox until the worker is back.

## Check

ECS console > `placement-prod-worker` > Events and stopped tasks. Common causes:

- **It crashes at boot:** same checks as [api-down](api-down.md) (config refusal, missing secret key).
- **It can't reach Redis or the database.**
- **Out of memory:** raise the task memory in `app-stack.ts`.

## Fix

Fix the cause, then `--force-new-deployment` on `placement-prod-worker`. On boot it re-registers the repeating jobs,
and the outbox drains by itself.
