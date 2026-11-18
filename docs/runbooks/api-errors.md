# API 5xx errors

**Alarms:**

- `placement-prod-api-target5xx`: 10 or more 5xx responses from the API in 5 minutes.
- `placement-prod-alb-elb5xx`: 10 or more 5xx responses from the load balancer itself (no healthy target, or
  timeouts).

**Impact:** some actions fail for users or webhooks. Business errors (guards) are 4xx and never count here.

## Check

API log, errors only:

```
fields @timestamp, req.method, req.url, err.message
| filter level >= 50
| sort @timestamp desc
```

- **One route:** a bug. The stack trace names it.
- **All routes:** the database or Redis. See [database](database.md) and [redis](redis.md).
- **Load balancer 5xx with healthy tasks:** request timeouts. Look for slow requests and long-running queries.

## Fix

Fix the cause. If it started with a release, roll back the deploy.
