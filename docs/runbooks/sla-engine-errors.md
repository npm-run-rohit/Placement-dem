# SLA sweep errors

**Alarm:** `placement-prod-sla-engine-errors`. Three 5-minute periods in a row had at least one ticket or thread the
sweep could not process (`JobErrors{Job=sla-sweep}`).

**Impact:** those tickets miss follow-ups or SLA-P1 escalation. The rest of the sweep keeps working.

## Check

Worker log, filtered to the sweeper:

```
fields @timestamp, msg
| filter context = 'SlaSweeperHandler'
| sort @timestamp desc
```

The messages name the thread (`Follow-up on thread <id> failed`) or ticket (`SLA-P1 on PLC-nnnn failed`) and the
reason. Typical reasons:

- **The template is retired or missing** (INS-T02..T04, INT-T05 / T06): restore it in Admin > Templates.
- **The ticket owner has no mailbox** (a user deactivated in Sahayak): reassign the ticket.
- **A guard refused the step** (the stage changed under it): usually transient. If it repeats, the error text names
  the rule.

## Fix

Fix the data the error names. The next sweep retries automatically, and the alarm clears after a sweep with no
errors.
