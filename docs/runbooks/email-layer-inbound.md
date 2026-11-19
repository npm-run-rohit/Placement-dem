# Email layer inbound failures

**Alarm:** `placement-prod-email-layer-inbound-failing`: 3+ deliveries from the shared email layer failed in the last
hour.

**Impact:** insurer and RM replies (and colleague replies) that the layer pushed to
`POST /api/v1/integrations/email-layer/webhook` have not reached Placement yet. Threads keep waiting and follow-ups
may go out for a reply that already arrived.

What the layer retries (8 attempts, exponential backoff, fresh attachment URLs each time): a 5xx, a timeout, and
401, 404, 408 and 429. Any other 4xx (e.g. 422) is final at the layer: `rejected`. When the retries run out the
delivery is `failed` at the layer. A failed or rejected delivery keeps its full payload at the layer and is not lost,
but **it is not re-delivered by itself**: someone has to retry it (see Fix).

## Check

```sql
SELECT delivery_id, status, attempts, last_error, created_at FROM email_layer_deliveries
 WHERE status IN ('failed', 'rejected') ORDER BY created_at DESC LIMIT 20;
```

- `failed` (retried by the layer): `last_error` names the cause. `Attachment fetch answered 403/404` means the signed
  attachment URL expired or the layer is down; a database error means check [database](database.md).
- `rejected` (final, answered 422): the delivery is for another product, or names a ticket that does not exist.
  Not counted by the alarm.

Also confirm the secret matches the layer's: bad signatures answer 401 and never reach this table (look for 401s on
the webhook in the API log, see [api-errors](api-errors.md)). The layer keeps retrying a 401 for about half an hour,
then marks the delivery failed on its side.

At the layer (its own database), the deliveries that need a retry:

```sql
SELECT id, status, attempts, last_error, created_at FROM product_delivery
 WHERE product = 'placement' AND status IN ('failed', 'rejected') ORDER BY created_at DESC LIMIT 50;
```

## Fix

- **Layer unreachable or URLs expired:** fix the layer; while its retries last it re-delivers with fresh URLs under
  the same `deliveryId`, and the row turns `processed`.
- **Retries ran out, or a wrong secret / URL / clock:** fix the cause first (secret, `webhookUrl` in the layer's
  `EMAIL_LAYER_PRODUCTS`, clock skew over 300 s), then ask a layer admin to re-deliver:
  `POST /email-layer/v1/admin/deliveries/retry` with `{ "deliveryIds": ["..."] }` (or `{}` for every failed and
  rejected delivery). Placement answers a delivery it already processed with 200 and no effect, so a retry is safe.
- **Database:** see [database](database.md).
- **A single poisoned delivery:** ask the layer owner to stop retrying it; the mail can be entered by hand from Manual
  Review.
