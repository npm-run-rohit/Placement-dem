# BimaSetu ⇄ BimaPlacement integration guide

For the BimaSetu (RM CRM) team. Covers what BimaPlacement sends and expects, how messages are carried,
what is built today and what we still need to agree. The business contract is **PRD v1.7 section 4A**
(`docs/product/PRD-v1.7.md`, FR-281..292, BR-137..139); this guide is the engineering view of it.

> Status, 2026-10-30: the message contract, the inbound webhook (signature check, dedupe, queueing), float
> processing and every Placement-side event are built. Processing of the other inbound messages and the
> outbound HTTP sender are **stubbed** until we agree the wire format with you (see [Built vs pending](#built-vs-pending)).
> The wire format below is our proposal. Please review it and tell us what to change.

## 1. Who does what

| | BimaSetu (RM side) | BimaPlacement (Placement desk) |
|---|---|---|
| Intake | RM floats a line to Placement | Creates one ticket per floated line, returns `PLC-nnnn` |
| Missing information | RM answers queries on the line | PM raises queries; an answer returns the ticket to RFQ Review, the PM resolves it |
| Insurers | Never sees insurers, threads or insurer documents (FR-290) | Selects insurers, runs one mail thread per insurer + branch, collects quotes |
| QCR | RM reviews and shares each QCR round with the client | Builds the QCR (Copycat), PM checks the quote rows, sends the round |
| Revisions | RM requests a revision (any number of rounds) | Opens a new round on the same ticket |
| Outcome | RM confirms the client's choice, or marks the line lost | Closes Quote selected / Lost; PM can close No appetite |
| After the decision | Payment and policy continue in BimaSetu | Ticket is closed and read-only, never reopens |

Requests that never pass through BimaSetu are **manual tickets** in Placement. They use mail and never send
anything to BimaSetu (FR-292).

## 2. Transport

### BimaSetu → BimaPlacement (webhook)

```
POST {PLACEMENT_API}/api/v1/integrations/bimasetu/webhook
Content-Type: application/json
x-bimasetu-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the shared secret>
```

- **202 Accepted** `{ "accepted": true, "duplicate": false }` once stored. Processing is asynchronous.
- **Duplicate** `messageId` → still 202 with `"duplicate": true`. Nothing is processed twice (FR-291).
- **401** bad or missing signature, or a timestamp more than 300 s from our clock (replay protection).
- Retry on any non-2xx or timeout with backoff, reusing the same `messageId`.
- Code: `apps/api/src/integrations/bimasetu/bimasetu-webhook.controller.ts`, `hmac.ts` (`signBimaSetu` shows how to sign).

### BimaPlacement → BimaSetu (proposed endpoint on your side)

```
POST {BIMASETU_API_URL}/placement/messages
Authorization: Bearer <service token>
Idempotency-Key: <messageId>
Content-Type: application/json
```

- We will retry with backoff until we get a 2xx. Treat a repeated `Idempotency-Key` as already applied.
- Delivery order is not guaranteed (retries, parallel workers). Order by `occurredAt`, and ignore a `stage_changed` older than the last one you applied.
- If you prefer to sign these too, or to use a queue/event bus instead of HTTP, tell us. The sender sits behind a port (`BimaSetuClient`).

### Envelope (both directions)

```ts
interface BimaSetuEnvelope<T> {
  messageId: string;  // unique per message, used for dedupe
  type: string;       // see the catalogue below
  occurredAt: string; // ISO 8601
  lineRef: string;    // your line reference
  ticketNo?: string;  // PLC-nnnn once the ticket exists
  payload: T;
}
```

TypeScript source of truth: `packages/contracts/src/bimasetu.ts`.

## 3. Message catalogue

### From BimaSetu

| `type` | Payload | Effect in Placement |
|---|---|---|
| `float` | `FloatPayload` | Creates the ticket, answers with `ticket_created`; or `float_rejected` with the reason if there is no RFQ or a required field is missing (FR-281/282) |
| `query_answer` | `{ queryRef, answer, answeredBy: { id, name } }` | Attached to the query (`Q-nn`) or to the insurer's information request (`IR-nn`, a ticket-scoped reference: we never send the insurer thread ref, FR-290); the ticket returns to RFQ Review. The answer never resolves a query, the PM does (BR-111) |
| `revision_request` | `{ qcrRound, by: 'client' \| 'us', reason, asks: ('rerate' \| 'insurer' \| 'cover' \| 'terms')[] }` | Opens the next round on the same ticket; no limit (FR-287) |
| `client_confirmation` | `{ qcrRound, quoteRowId }` | Closes the ticket Quote selected with that row (FR-288). `quoteRowId` is the `rowId` we sent in `qcr_round` |
| `line_lost` | `{ reason? }` | Closes the ticket Lost (FR-288) |

`FloatPayload`:

```json
{
  "lineRef": "BS-LINE-000123",
  "productType": "GMC",
  "businessName": "Acme Foods Pvt Ltd",
  "businessType": "New",
  "industryType": "Manufacturing",
  "rfq": { "linkUrl": "https://...", "excel": { "fileName": "RFQ.xlsx", "downloadUrl": "https://..." }, "renderedViewUrl": "https://..." },
  "exclusiveMandate": false,
  "targetPremium": 1500000,
  "noteToPlacement": "Client wants the renewal terms matched",
  "renewalDate": null,
  "incumbentInsurer": null,
  "rm": { "id": "rm-42", "name": "Shubh Bangar", "email": "shubh.bangar@bimakavach.com" },
  "client": { "id": "cl-9", "name": "Acme Foods Pvt Ltd", "spoc": "Ira Shah" },
  "opportunityId": null
}
```

- `businessType`: `New` | `Renewal` | `Rollover`. Product, business type and industry are taken as sent (FR-282). Product codes are the 21 in `PRODUCT_TYPES_SEED` (`packages/contracts/src/masters.ts`).
- At least one of `rfq.linkUrl` / `rfq.excel` is required. `renewalDate` is required for `Renewal`.
- Planned: the RM is matched to a Placement user by email (identity comes from BimaSahayak).
- One float = one product line = one ticket. Floats are never merged or linked.

### To BimaSetu

| `type` | Payload | When |
|---|---|---|
| `ticket_created` | `{ ticketNo, openedAt }` | Right after a float creates the ticket |
| `float_rejected` | `{ reason }` | A float could not be accepted |
| `stage_changed` | `{ ticketNo, stage, rmStatus }` | Every desk status change (FR-283) |
| `query_raised` | `{ ticketNo, queryRef, query }` | PM asks the RM something (FR-284) |
| `qcr_round` | `QcrRoundPayload` | PM sends a QCR, or closes No appetite (zero rows) (FR-285/289) |
| `closed_no_appetite` | `{ ticketNo, reason }` | Ticket closed No appetite |

`QcrRoundPayload`:

```json
{
  "round": 1,
  "qcrVersion": 1,
  "qcrFile": { "fileName": "QCR-PLC-1004-V1.pdf", "downloadUrl": "https://... (signed, short-lived)" },
  "requestedAt": "2026-10-29T10:12:00+05:30",
  "deliveredAt": "2026-10-30T15:40:00+05:30",
  "earlyReleaseReason": null,
  "notice": null,
  "rows": [
    { "rowId": "5f0c...", "insurer": "HDFC ERGO", "premium": 3592000, "sumInsured": "₹5 Cr", "validityDate": "2026-11-30", "termsNote": "Room rent capped at 1%" }
  ]
}
```

- `earlyReleaseReason` is set when the PM released with fewer than 3 usable quotes. Please always show it to the RM (PRD 4A.4 dependency).
- No appetite: `rows: []` and a `notice` that names no insurer (FR-289).
- A late quote after release becomes QCR V2 and arrives as the next `round`.
- Download the QCR file when you receive the message. The link expires.

`stage` values (the desk status as shown in Placement): `RFQ Received`, `RFQ Clarification Required`,
`Ready for Placement`, `Insurer Selection Pending`, `Insurers Approved`, `RFQ Floated`, `Quote Collection In Progress`,
`Awaiting RM Information`, `Quote Review Required`, `QCR Generation In Progress`, `QCR Generation Failed`,
`Pending Placement Release`, `Pending RM Review`, `Revision Requested`, `Quote Selected`, `Lost`, `No appetite`.

`rmStatus` (the simpler RM-facing label we suggest you show on the line): `RFQ Submitted`, `Action Required`,
`Placement In Progress`, `Updated Placement In Progress`, `QCR Ready`, `Awaiting Client Decision`, `Quote Selected`, `Closed`.
`Action Required` means the RM owes Placement an answer.

## 4. Rules both sides rely on

- **No insurer data to BimaSetu (FR-290).** Never insurer documents, insurer lists, panel or thread details. The only insurer names that cross are the ones on PM-checked QCR rows.
- **Exactly once (FR-291).** Unique `messageId`, deduped on receipt, retried on failure, logged on the ticket timeline (`bimasetu_messages` table + audit trail).
- **Closures (BR-137).** Only Quote selected, Lost or No appetite. No inactivity closure. A closed ticket never reopens.
- **Exclusive Placement Mandate (BR-138).** The PM's Send to BimaSetu is Placement's approval; the RM's confirmation in BimaSetu is the RM's.
- **Business type (BR-139).** A PM correction of business type stays in Placement and is not sent back.
- **External clocks.** Time the ticket waits on the RM (queries, QCR review) runs on an external clock and never counts as a Placement SLA breach.

## Built vs pending

| Piece | State |
|---|---|
| Contract types (`packages/contracts/src/bimasetu.ts`) | Built, proposal |
| Webhook: signature, replay window, dedupe, 202, queueing | Built |
| Placement emits `ticket_created`, `stage_changed`, `query_raised`, `qcr_round`, `closed_no_appetite` to the outbox | Built (written in the same DB transaction as the change) |
| Domain actions the inbound messages call (revision, select quote, mark lost, record RM answer) | Built and tested |
| Inbound processor: `float` → ticket (owned by the Placement Head until the assignment rule is decided), or `float_rejected` with the reason; deduped by line reference | Built (`bimasetu-float.service.ts`, `float-validation.ts`) |
| Inbound processor: `query_answer`, `revision_request`, `client_confirmation`, `line_lost` | **Built** to the draft contract above (`bimasetu-inbound.handler.ts`); a business refusal (unknown line, wrong stage, row not in a released QCR) is stored as `rejected`, anything else `failed` and retried. Changes once the wire format is agreed |
| Outbound sender: build envelopes (incl. QCR rows + signed file URL), POST, log | **Pending** (`bimasetu-outbound.handler.ts`, TODO W3). In `BIMASETU_MODE=mock` it only logs |
| Nightly reconciliation (re-send missed messages, report unprocessed ones) | **Pending** (`reconciliation.handler.ts`) |
| Polling fallback if webhooks are not possible | Stub (`BimaSetuClient.fetchLineState`) |

## Open points to agree

1. Wire format above (field names, `lineRef` format, error body for `float_rejected`).
2. Our endpoint on your side, auth (service token vs signed requests) and your retry policy.
3. Whether mandate replies come through BimaSetu (`mandate_response`) or stay on mail.
4. How a revised RFQ for a changed requirement (RFQ V2) reaches us (PRD 4A.4: owned by BimaSetu).
5. The initial ticket-assignment rule (PRD 4A.4: to be decided in BimaSetu; until then floats go to the Placement Head).
6. `query_raised` for an insurer's information request carries the question text the PM writes. We will make sure that text never names the insurer (FR-290); tell us if you would rather receive a fixed wording.
7. Environments and secrets: `BIMASETU_API_URL`, `BIMASETU_API_TOKEN`, `BIMASETU_WEBHOOK_SECRET` per environment.

## Try it locally

```bash
npm install && npm run db:up && npm run build:contracts
cp apps/api/.env.example apps/api/.env      # BIMASETU_MODE=mock: signatures are not enforced, outbound only logs
npm run migration:run && npm run seed
npm run dev:api                             # http://localhost:4000/api/v1 (Swagger: /api/v1/docs)
npm run dev:worker
```

Send a signed float (live mode checks the signature; mock mode accepts it unsigned):

```bash
BODY='{"messageId":"bs-msg-0001","type":"float","occurredAt":"2026-10-30T10:00:00+05:30","lineRef":"BS-LINE-000123","payload":{...}}'
SIG=$(node -e "const c=require('crypto');const t=Math.floor(Date.now()/1000);console.log('t='+t+',v1='+c.createHmac('sha256',process.env.S).update(t+'.'+process.argv[1]).digest('hex'))" "$BODY")
curl -X POST http://localhost:4000/api/v1/integrations/bimasetu/webhook -H 'content-type: application/json' -H "x-bimasetu-signature: $SIG" -d "$BODY"
```

(`S` = the `BIMASETU_WEBHOOK_SECRET` from `apps/api/.env`.) The worker then creates the ticket (or queues
`float_rejected` with the reason). In the web app, My Tickets has a dev-only "Simulate BimaSetu float" block that
sends the same message through the same path.

## Where the code is

| Need | Path |
|---|---|
| Contract (types, enums) | `packages/contracts/src/bimasetu.ts`, `enums.ts` (`InternalStatus`, `RmFacingStatus`) |
| Webhook, HMAC, client, handlers | `apps/api/src/integrations/bimasetu/` |
| Where outbound events are written | grep `destination: 'bimasetu'` in `apps/api/src/modules` |
| Domain actions for inbound messages | `modules/decisions/decisions.service.ts`, `modules/rfq/rfq.service.ts`, `modules/tickets/tickets.service.ts` |
| Message log table | `bimasetu_messages` (`bimasetu-message.entity.ts`) |
| Design background | `docs/architecture/HLD.md`, `LLD.md`, `docs/reference/PLACEMENT-BIMASETU-REPORT.md` |
