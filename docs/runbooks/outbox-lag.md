# Outbox lag / relay stalled / failing

**Alarms:**

- `placement-prod-outbox-relay-stalled`: the relay has not run for 2+ minutes.
- `placement-prod-outbox-lag`: the oldest unrelayed event is 5+ minutes old.
- `placement-prod-outbox-failing`: events retried 5+ times.

**Impact:** everything that leaves the system goes through the outbox (rule 2 in `CLAUDE.md`): insurer and RM mail,
BimaSetu messages, notifications, Copycat requests, bus events. Nothing is lost, only delayed. Each event goes out
once the relay catches up.

## Check

1. Relay stalled: the worker or Redis is down. See [worker-down](worker-down.md) and [redis](redis.md).
2. Lag with the relay running: look at what is stuck.

   ```sql
   SELECT destination, event_type, attempts, last_error, created_at
     FROM outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT 20;
   ```

3. `last_error` names the cause. The relay only enqueues jobs (and publishes bus events), so errors here are
   almost always Redis (enqueue) or the event bus (`destination = 'bus'`).

## Fix

- Redis or the bus is back: the relay retries every 2 s by itself and the alarms clear.
- An event that can never be relayed (bad payload after a code change): fix the code. Do not delete outbox rows,
  because consumers dedupe on the outbox id and a deleted row is an action that never happens.
