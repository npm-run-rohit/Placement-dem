# API down

**Alarm:** `placement-prod-api-no-healthy-hosts`. No API task passes the health check (`GET /api/v1/health`, which
pings the database).

**Impact:** the workbench is down for everyone, and BimaSetu webhooks fail. BimaSetu retries them, and each message
is still processed exactly once when the API is back.

## Check

1. ECS console > `placement-prod-api` > Events and stopped tasks: look for failed deployments, out-of-memory kills
   and failed health checks.
2. API log: a crash at boot. `Refusing to start in production` lists the settings that block start-up
   (`production-checks.ts`). A missing secret key shows up as `ResourceInitializationError` in the ECS events.
3. Database down or unreachable: the health check fails on every task. See [database](database.md).

## Fix

- A bad deploy rolls back by itself (deployment circuit breaker). Otherwise redeploy the last good image.
- A config refusal: set the missing value (`appEnv` in `cdk.json`, or the `placement-prod/external` secret) and
  deploy.
