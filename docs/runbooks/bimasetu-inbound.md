# BimaSetu inbound failures

**Alarms:**

- `placement-prod-bima-setu-inbound-retrying`: BimaSetu messages have been failing and retrying for 15+ minutes.
- `placement-prod-bima-setu-inbound-rejected`: 5+ messages were refused in an hour.

**Impact:**

- **Retrying:** a float, query answer, revision, client confirmation or line-lost has not been applied yet.
- **Rejected:** BimaSetu sent something we refuse for business reasons (unknown line, wrong stage, a row not in the
  latest released QCR). Many rejections at once usually mean the two sides disagree about the message format.

## Check

```sql
SELECT type, line_ref, status, attempts, last_error, created_at FROM bimasetu_messages
 WHERE direction = 'in' AND status IN ('failed', 'rejected') ORDER BY created_at DESC LIMIT 20;
```

- `failed` (retried): infrastructure, a lock conflict, or a message waiting for its line's float. Retries go through
  the queue. See [dead-letter-jobs](dead-letter-jobs.md) if they run out.
- `rejected` (final): `last_error` gives the business reason. Compare the payload with the contract in
  `packages/contracts/src/bimasetu.ts` and `docs/integration/BIMASETU-INTEGRATION.md`.

## Fix

- **Format drift:** agree the fix with the BimaSetu team. BimaSetu re-sends with a new message id, because each id is
  processed only once.
- **A single bad message:** tell the BimaSetu team. Floated tickets wait for BimaSetu; only manual tickets let the PM
  apply the decision by hand.
