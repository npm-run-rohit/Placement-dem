# Copycat failures

**Alarm:** `placement-prod-copycat-failures`. 3 or more QCR generations failed in 15 minutes (`CopycatFailures15m`).

**Impact:** QCR drafts show "Generation failed". PMs can retry, regenerate or upload a QCR by hand (UI-SPEC 3.3.8),
so placements are delayed, not blocked.

## Check

```sql
SELECT request_id, error, finished_at FROM copycat_requests
 WHERE status = 'failed' ORDER BY finished_at DESC LIMIT 20;
```

- **Every request fails the same way** (timeout, 5xx, auth): the Copycat service, or `COPYCAT_API_KEY` in the
  `placement-prod/external` secret. Production runs `COPYCAT_MODE=mock` until the Copycat API is agreed.
- **Only some fail:** usually the input (an unreadable PDF). The PM can exclude that quote or upload the QCR by hand.

## Fix

Fix the credentials or wait for Copycat to recover, then ask the PMs to press Retry on the failed drafts. Stale
responses from older attempts are ignored (FR-240), so retries are safe.
