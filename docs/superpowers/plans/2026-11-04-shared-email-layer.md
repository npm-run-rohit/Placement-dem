# Shared Email Layer (Placement first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Placement sends insurer and RM mail as the assigned person through the shared email layer, and receives every later message in those conversations (insurer replies, colleagues' Gmail replies) through a signed webhook.

**Architecture:**
- **Two repos, one contract.** Part A builds the email-layer side in `email-parser-scaffold`: send API, conversation registry, routing step before the existing matching cascade, per-mailbox product scoping, and signed delivery to the product. Part B builds the Placement side in `bimaplacement`: an `email-layer` `MailboxConnector` adapter, a webhook into `InboundMailService.ingest`, sender rules, and a colleague's Gmail reply counting as our reply.
- **Each part ships on its own.** Each is testable against stubs of the other, and the contract document (Task 0) is shared.

**Tech Stack:** NestJS (parser on 10, Placement on 11), TypeORM 0.3, BullMQ, `googleapis` Gmail v1, `mailparser`, Jest. Signatures are HMAC-SHA256.

**Spec:** `docs/superpowers/specs/2026-11-04-shared-email-layer-design.md` (approved by Rohit, 2026-11-04).

## Global Constraints

- **Repos:** Part A runs in `D:\Full-stack projects\email-parser-scaffold` (branch `feat/email-layer`). Part B runs in `bimaplacement` (branch `feat/email-layer-client`, stacked on `feat/infra-cdk`).
- **No AI attribution in commits:** no `Co-Authored-By: Claude` or any Claude/Anthropic attribution on commits or PRs (both repos).
- **Signature:** header `x-email-layer-signature: t=<unix>,v1=<hex hmac-sha256 of "${t}.${rawBody}">`. Tolerance is 300 s, with one secret per product. This is the same scheme as `apps/api/src/integrations/bimasetu/hmac.ts`.
- **Conversation refs:**
  - `PLC-nnnn/TH-nn` for insurer threads;
  - `PLC-nnnn/RM` for RM mail on manual tickets.
- **Placement tag pattern:** `/\bPLC-\d{4,}\b/`.
- **Never send as anyone else (M5):** a sender with no connected, send-enabled mailbox gets 409 `MAILBOX_NOT_CONNECTED`. That is final, with no retry and no fallback.
- **Unanchored mail:** a Placement delivery with `conversationRef: null` always goes to Manual Review and is never auto-applied (BR-046).
- **Colleague replies:** a `sentByStaff` message from a connected colleague on a thread waiting on us runs the same workflow as an in-app reply (`replyToInsurer`), but sends no mail.
- **Parser gmail scopes:** `gmail.readonly` plus `gmail.send`. The OAuth consent screen is Internal.
- **Product mailboxes:** a mailbox with `product` set never creates an `EmailTicket`.
- **Dev defaults unchanged:** Placement `MAILBOX_DRIVER=dev` stays the default. The parser's real Gmail is never called in tests: use `demo/fake-gmail.ts`-style stubs.

## Review Focus

1. **A colleague is CC'd and the same message lands in two connected mailboxes.** It must be delivered to Placement exactly once (dedupe on `rfc_message_id`). Test in Task A4.
2. **Placement's own send shows up in the sender's SENT label.** It must not come back as a delivery (it would be filed as a "colleague reply" to ourselves). Test in Task A4.
3. **The ticket is reassigned between the first email and a follow-up.** The new owner's mailbox has no Gmail thread for it: the send must still go out with `In-Reply-To` / `References` and no `threadId`, and stay in the same conversation. Test in Task A2.
4. **The webhook receives the same `deliveryId` twice (a retry after a timeout).** The second call is 200 with no effect. Test in Task B3.
5. **A delivery whose attachment URL has expired by the time Placement fetches it.** Answer 5xx so the layer retries with fresh URLs. Never store the mail without its attachment. Test in Task B3.

---

## Task 0: Contract document (both repos)

**Files:**
- Create: `bimaplacement/docs/integration/EMAIL-LAYER-CONTRACT.md`
- Create: `email-parser-scaffold/docs/email-layer-contract.md` (identical copy)
- Create: `bimaplacement/apps/api/src/integrations/email-layer/contract.ts`
- Create: `email-parser-scaffold/email-parser/email-layer/contract.ts`

**Interfaces (produces; identical TypeScript in both repos):**

```ts
export interface SendRequest {
  product: string; idempotencyKey: string; from: string;
  to: string[]; cc?: string[]; subject: string; text: string; html?: string;
  attachments?: Array<{ fileName: string; contentType: string; url: string }>;
  conversation: { ref: string; replyToMessageId?: string };
}
export interface SendResponse { rfcMessageId: string; gmailMessageId: string; gmailThreadId: string; sentAt: string }
export interface DeliveryPayload {
  deliveryId: string; product: string; conversationRef: string | null; rootMessageId: string;
  message: {
    rfcMessageId: string; inReplyTo: string | null; references: string[];
    from: string; to: string[]; cc: string[]; subject: string;
    textBody: string; htmlBody: string | null; sentAt: string;
    seenInMailboxes: string[]; sentByStaff: boolean;
    attachments: Array<{ fileName: string; contentType: string; size: number; url: string }>;
  };
}
export const SIGNATURE_HEADER = 'x-email-layer-signature';
export function signEmailLayer(rawBody: string, secret: string, t?: number): string;
export function verifyEmailLayerSignature(rawBody: string, header: string | undefined, secret: string, toleranceSec: number, nowSec?: number): boolean;
```

Endpoints:

| Call | Answers |
|---|---|
| `POST /email-layer/v1/messages` (product → layer) | 200 `SendResponse`; 401 bad signature; 409 `{ code: 'MAILBOX_NOT_CONNECTED' }`; 422 bad request |
| `GET /email-layer/v1/health?product=placement` | `{ ok, mailboxesWithoutSend: string[] }` |
| `POST <product webhook>` (layer → product) | 2xx delivered; 4xx rejected (final); 5xx / timeout retried |

- [ ] **Step 1:** Write the contract doc: the types above, the three endpoints with these status codes, the signature rule, and one JSON example each (send request, send response, anchored delivery, unanchored delivery, staff delivery).
- [ ] **Step 2:** Write `contract.ts` in both repos. The sign/verify functions mirror `bimasetu/hmac.ts`.
- [ ] **Step 3: Write the failing test** `contract.spec.ts` in both repos:
  - `verifyEmailLayerSignature(body, signEmailLayer(body, 's', 1000), 's', 300, 1100) === true`;
  - false at `nowSec = 1400`;
  - false with secret `'x'`;
  - false for a header with no `v1`.
- [ ] **Step 4:** Run it. In Placement: `npm test -w @bimaplacement/api -- contract`. The parser repo has no Jest yet; Task A1 adds it, so run its copy of this spec there.
- [ ] **Step 5: Commit** in each repo: `docs(email-layer): contract v1 (send API, delivery webhook, signatures)`.

---

# Part A: email layer (`email-parser-scaffold`)

## Task A1: Test harness and product registry

**Files:**
- Modify: `package.json` (devDeps `jest@^29`, `ts-jest@^29`, `@types/jest@^29`; script `"test": "jest"`)
- Create: `jest.config.js` (ts-jest, `moduleNameMapper` for `^src/(.*)$`, roots `email-parser`)
- Create: `email-parser/email-layer/product-registry.ts` + `product-registry.spec.ts`
- Modify: `.env.example`: `EMAIL_LAYER_PRODUCTS` (JSON) and `EMAIL_LAYER_PUBLIC_BASE_URL`

**Interfaces:**
- Produces:
  - `interface ProductConfig { name: string; tagPattern: RegExp; webhookUrl: string; secret: string }`
  - `loadProducts(env: NodeJS.ProcessEnv): ProductConfig[]`. It parses `EMAIL_LAYER_PRODUCTS`, e.g. `[{"name":"placement","tagPattern":"\\bPLC-\\d{4,}\\b","webhookUrl":"…","secret":"…"}]`, and returns `[]` when unset.
  - `productForTag(products: ProductConfig[], subject: string | null): ProductConfig | null`

- [ ] **Step 1: Write the failing tests:**
  - `loadProducts({})` → `[]`;
  - the example JSON → one product whose `tagPattern.test('RE: [PLC-1018 | TH-02] RFQ')` is true;
  - `productForTag(ps, 'Re: quote')` → null;
  - `productForTag(ps, 'Fwd: PLC-1018 revised')` → the placement product;
  - invalid JSON throws `EMAIL_LAYER_PRODUCTS is not valid JSON`.
- [ ] **Step 2:** `npx jest product-registry`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement the two functions.
- [ ] **Step 4:** `npx jest`. Expected: PASS. `npm run typecheck` is clean.
- [ ] **Step 5: Commit:** `chore(email-layer): jest + product registry`.

## Task A2: Entities and the send API

**Files:**
- Create entity `email-parser/entities/product-conversation.entity.ts` (`product_conversation`):
  - `root_rfc_message_id` (unique);
  - `product`;
  - `external_ref`;
  - `created_at`.
- Create entity `email-parser/entities/sent-message.entity.ts` (`email_layer_sent_message`):
  - `idempotency_key` (unique);
  - `product`;
  - `rfc_message_id` (unique);
  - `gmail_message_id`;
  - `gmail_thread_id`;
  - `from_email`;
  - `sent_at`.
- Modify `email-parser/entities/connected-mailbox.entity.ts`:
  - `product: string | null` (nullable, default null);
  - `can_send: boolean` (default false).
- Modify `email-parser/services/gmail-oauth.service.ts`: `GMAIL_SCOPES` adds `https://www.googleapis.com/auth/gmail.send`. Set `can_send = true` when the granted scope includes it. Rewrite the scope comment (Internal consent screen).
- Create `email-parser/email-layer/mime.ts` + spec, with `buildMime(req: SendRequest, rfcMessageId: string, inReplyTo: string | null, references: string[], files: Array<{ fileName: string; contentType: string; content: Buffer }>): Buffer`. Use `nodemailer/lib/mail-composer` (add `nodemailer` + types) with `keepBcc: false` and a fixed `messageId`.
- Create `email-parser/email-layer/send.service.ts` + spec.
- Create `email-parser/email-layer/email-layer.controller.ts` (`@Public()`, raw-body signature check).
- Modify `email-parser/email-parser.module.ts` to register the entities, the service and the controller. Add them to the entity lists in `src/app.module.ts` and `src/worker-app.module.ts`.

**Interfaces:**
- Consumes: `SendRequest`/`SendResponse` (Task 0), `loadProducts` (A1), `GmailOAuthService.refreshAccessToken(mailboxId)`.
- Produces:
  - `SendService.send(product: string, req: SendRequest): Promise<SendResponse>`;
  - `class MailboxNotConnectedError extends Error`;
  - `GET /email-layer/v1/health`.

**Behaviour:**
1. Repeat `idempotencyKey`: return the stored `SendResponse` and call Gmail zero times.
2. `from` mailbox missing, inactive, or `can_send=false`: `MailboxNotConnectedError`, which the controller maps to 409.
3. RFC Message-ID: `<${uuid}@${hostname of EMAIL_LAYER_PUBLIC_BASE_URL}>`.
4. Starting a conversation (no `replyToMessageId`): insert `product_conversation(root = that id, product, external_ref = req.conversation.ref)`.
5. Continuing a conversation:
   - `inReplyTo = replyToMessageId`;
   - `references` = the root first, then `replyToMessageId`. The root is the registered row whose `external_ref` and `product` match.
   - Gmail `threadId` = the sender's own `gmail_thread_id` from `email_layer_sent_message` or `email_message` for any message in that conversation, if one exists. Otherwise no `threadId`.
6. Attachments are fetched with axios from `url` (30 s timeout). A failed fetch is a 422 with the file name.
7. Gmail call: `users.messages.send({ userId: 'me', requestBody: { raw: mime.toString('base64url'), threadId? } })`. Persist `email_layer_sent_message` in the same DB transaction as the conversation row, after Gmail returns.

- [ ] **Step 1: Write the failing tests** (`send.service.spec.ts`, Gmail and axios stubbed, in-memory repos or a test DB, whichever matches the scaffold's other services):
  - `sends once per idempotencyKey`: two calls give one `messages.send` and equal responses.
  - `refuses a sender without send scope`: rejects with `MailboxNotConnectedError`.
  - `registers the root for a new conversation`: a row with `external_ref: 'PLC-1018/TH-02'`.
  - `continues a conversation with References root-first`: the MIME `References` header starts with the root id.
  - `continues without threadId when the sender has no Gmail thread for it` (Review Focus 3): `requestBody.threadId` is undefined and the `In-Reply-To` header is set.
  - `mime.spec`: the built MIME has `Message-ID`, `To`, `Cc`, the subject, a text part and one attachment part named as given.
- [ ] **Step 2:** `npx jest send.service mime`. Expected: FAIL.
- [ ] **Step 3:** Implement `buildMime`, `SendService.send`, the controller and the health endpoint. Health returns `mailboxesWithoutSend` = emails of active mailboxes with `product = ?` and `can_send = false`.
- [ ] **Step 4:** `npx jest` passes. `npm run typecheck` is clean.
- [ ] **Step 5: Commit:** `feat(email-layer): send API with conversation registry and idempotency`.

## Task A3: Attachments on parsed mail

**Files:**
- Modify `email-parser/services/email-parsing.service.ts`: `ParsedEmail` gains `attachments: Array<{ fileName: string; contentType: string; size: number; content: Buffer }>` and `html_body: string | null`, both from mailparser's `simpleParser` result. Keep `body_text` as it is (quote-stripped) and add `full_text: string` (unstripped).
- Create `email-parser/email-layer/attachment-store.ts`, with `AttachmentStore.put(key: string, file): Promise<void>` and `AttachmentStore.url(key: string, ttlSec: number): Promise<string>`. Drivers:
  - `s3`: the existing `ImageUploadService`, or `@aws-sdk` if that one can't presign;
  - `local`: a dev folder plus a signed GET route `/email-layer/v1/files/:key?exp=&sig=`. Never trust the path: look the key up in the delivery table.
- Spec: `email-parsing.service.spec.ts`.

**Interfaces:**
- Produces: `ParsedEmail.attachments`, `ParsedEmail.html_body`, `ParsedEmail.full_text`, `AttachmentStore`.

- [ ] **Step 1: Write the failing test:** parsing a MIME with one PDF attachment gives `attachments[0]` `{ fileName: 'quote.pdf', contentType: 'application/pdf', size > 0 }`, and `full_text` keeps the quoted lines that `body_text` strips.
- [ ] **Step 2:** Run it: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx jest` passes. Run the existing `npm run demo:seed` against a running dev stack: it still creates the same 10 demo tickets (no regression).
- [ ] **Step 5: Commit:** `feat(email-layer): keep attachments and full text on parsed mail`.

## Task A4: Routing step and product mailboxes

**Files:**
- Create `email-parser/email-layer/routing.ts` + `routing.spec.ts`.
- Create entity `email-parser/entities/product-delivery.entity.ts` (`product_delivery`):
  - `id` (uuid);
  - `email_message_id` (FK);
  - `product`;
  - `conversation_ref` (nullable);
  - `root_rfc_message_id`;
  - `status` (`pending|delivered|rejected|failed`);
  - `attempts`;
  - `last_error`;
  - `delivered_at`;
  - unique on (`email_message_id`, `product`).
- Modify `email-parser/entities/email-message.entity.ts`: `routed_product: string | null`.
- Modify `email-parser/services/gmail-sync.service.ts` `ingestMessage()`: after the `existing` dedupe and before `matchingService.match()`, call `routeMessage()`. On `deliver` or `ignore`, save the `EmailMessage` with `ticket: null`, `routed_product`, `finalized: true`, record the receipt, store attachments (A3) for `deliver`, insert a `product_delivery` and enqueue it (Task A5), then return. On `cascade`, the existing path runs unchanged.

**Interfaces:**
- Consumes: `computeRootMessageId` (existing), `productForTag` (A1), repos for `product_conversation` / `email_layer_sent_message`.
- Produces:

```ts
type RouteDecision =
  | { kind: 'deliver'; product: string; conversationRef: string | null; root: string }
  | { kind: 'ignore'; product: string }          // product mailbox, not that product's mail
  | { kind: 'skip-own-send' }                    // we sent it through the send API
  | { kind: 'cascade' };
routeMessage(input: { envelope: ParsedEnvelope; receivingMailboxProduct: string | null }, deps: {
  findConversation(root: string): Promise<{ product: string; external_ref: string } | null>;
  isOwnSend(rfcMessageId: string): Promise<boolean>;
  products: ProductConfig[];
}): Promise<RouteDecision>
```

Order:
1. `isOwnSend`: `skip-own-send`.
2. A registered root: `deliver` with its ref.
3. A tag match: `deliver` with ref null.
4. `receivingMailboxProduct` set: `ignore`.
5. Otherwise: `cascade`.

On `skip-own-send`, `ingestMessage` still saves the `EmailMessage` (ticket null, `routed_product` = product, so later replies chain to it) but creates no delivery.

- [ ] **Step 1: Write the failing tests** (`routing.spec.ts`), one per branch:
  - `delivers a reply chained to a registered root with its ref`;
  - `delivers an unchained PLC-tagged mail with ref null`;
  - `ignores other mail in a placement mailbox`;
  - `cascades other mail in an unscoped mailbox`;
  - `skips our own send seen in SENT` (Review Focus 2);
  - `an own send outranks its tag`: a sent message carrying `[PLC-1018 | TH-02]` gives `skip-own-send`.
- [ ] **Step 2:** `npx jest routing`: FAIL.
- [ ] **Step 3:** Implement `routeMessage` and wire it into `ingestMessage`.
- [ ] **Step 4: Write the failing integration test** `gmail-sync.routing.spec.ts`, using the `demo/fake-gmail.ts` approach (fake `google.gmail`) against the dev Postgres:
  - `one delivery for a message seen by two connected mailboxes` (Review Focus 1): ingest the same raw MIME through mailbox A and B; exactly one `product_delivery` row; two receipts.
  - `no EmailTicket for a routed or ignored message`.
- [ ] **Step 5:** Run it and make it pass. Then run all of `npx jest`.
- [ ] **Step 6: Commit:** `feat(email-layer): route product conversations before the ticket cascade`.

## Task A5: Delivery queue

**Files:**
- Create `email-parser/email-layer/delivery.worker.ts` (BullMQ processor on queue `email-layer-delivery`, registered in `queues/gmail-sync-worker.module.ts` so it runs only in the worker process).
- Create `email-parser/email-layer/delivery.service.ts` + spec.
- Create `email-parser/email-layer/delivery-payload.ts`.
- Modify `email-parser/email-parser.module.ts`: register the queue with `attempts: 8`, exponential backoff starting at 10 s, `removeOnFail: { count: 1000 }`.

**Interfaces:**
- Consumes: `ProductConfig`, `signEmailLayer`, `AttachmentStore.url`, `product_delivery`, `EmailMessage` + receipts.
- Produces:
  - `buildDeliveryPayload(delivery, message, receipts, staffEmails: Set<string>, urls: string[]): DeliveryPayload`;
  - `DeliveryService.enqueue(deliveryId: string)`;
  - `DeliveryService.deliver(deliveryId: string): Promise<void>`.

**Behaviour of `deliver`:**
- Rebuild the payload with fresh attachment URLs, with a TTL of 15 minutes.
- `sentByStaff` = the sender is a connected mailbox's email.
- POST with the signature header and a 10 s timeout.
- On the response:
  - 2xx: `delivered`;
  - 4xx: `rejected`, final, and it does not throw;
  - 5xx / timeout: throw, so BullMQ retries.
- When attempts run out: `failed` (the `failed` event handler).

- [ ] **Step 1: Write the failing tests** (HTTP via `nock` or an axios stub):
  - `marks delivered on 200`;
  - `marks rejected on 422 and does not throw`;
  - `throws on 503 so the queue retries`;
  - `signs the exact body sent`: `verifyEmailLayerSignature(sentBody, sentHeader, secret, 300)` is true;
  - `sentByStaff true when the sender is a connected mailbox`;
  - `payload carries the conversation ref, the root and fresh attachment URLs`.
- [ ] **Step 2:** Run them: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx jest` passes. `npm run typecheck` is clean.
- [ ] **Step 5:** Extend `demo/`: `npm run demo:placement` uses the fake Gmail.
  1. It sends a Placement first email through `SendService` (a fake `messages.send` that stores the MIME).
  2. It replies from the insurer (chained), then from a second connected staff mailbox.
  3. It posts the deliveries to a local echo server and prints them.

  Update `demo/README.md`.
- [ ] **Step 6: Commit:** `feat(email-layer): signed delivery to products with retries`.

## Task A6: Docs and checklist (parser repo)

**Files:**
- Modify: `README.md` (an "Email layer" section)
- Modify: `.claude/CLAUDE.md` (routing order, own-send skip, product mailboxes)
- Modify: `docs/deployment-plan.md` (blocker #3 now also needs `gmail.send` + Internal consent; new env vars)

- [ ] **Step 1:** Write the sections. The routing order is the list from A4, copied word for word.
- [ ] **Step 2:** `npx jest && npm run typecheck`: all green.
- [ ] **Step 3: Commit:** `docs(email-layer): routing, product mailboxes, deploy notes`. Push `feat/email-layer`.

---

# Part B: Placement (`bimaplacement`)

## Task B1: Config and the `email-layer` mailbox adapter (send)

**Files:**
- Modify `apps/api/src/config/configuration.ts`:
  - `mailbox.driver` adds `'email-layer'`;
  - `mailbox.emailLayer: { url: string; secret: string; webhookToleranceSeconds: number }` from `EMAIL_LAYER_URL`, `EMAIL_LAYER_SECRET`, `EMAIL_LAYER_TOLERANCE_SECONDS` (300).
- Modify `production-checks.ts`: `MAILBOX_DRIVER=email-layer` without `EMAIL_LAYER_URL` or `EMAIL_LAYER_SECRET` is a problem.
- Modify `apps/api/src/infrastructure/mail/mailbox.port.ts`:
  - `OutboundMail` gains `conversation?: { ref: string; replyToMessageId?: string }` and `idempotencyKey?: string`;
  - the `send` result gains `providerThreadId?: string`.
- Create `apps/api/src/infrastructure/mail/email-layer-mailbox.adapter.ts` + spec.
- Modify `mail.module.ts`: `case 'email-layer'`.
- Modify `infra/cdk/lib/data-stack.ts`: `EXTERNAL_SECRET_KEYS` adds `EMAIL_LAYER_SECRET`, and its test.
- Modify `apps/api/.env.example`.

**Interfaces:**
- Consumes: `signEmailLayer`, `SendRequest`, `SendResponse` (Task 0); `StoragePort` (presigned GET for attachments: use the existing download-URL method).
- Produces:
  - `EmailLayerMailboxAdapter implements MailboxConnector`. `send()` maps `OutboundMail` to a `SendRequest` (product `'placement'`) and returns `{ providerMessageId: rfcMessageId, providerThreadId: gmailThreadId }`. `fetchNew()` returns `{ messages: [], nextCursor: cursor }`. `health(mailbox)` calls `GET /health` and returns ok=false with detail `"<mailbox> has not connected Gmail for sending"` when it is listed.
  - `class MailboxNotConnectedError extends Error` (thrown on 409).

- [ ] **Step 1: Write the failing tests** (adapter spec, axios mocked):
  - `posts a signed SendRequest with the conversation and idempotency key`;
  - `maps the response to providerMessageId = rfcMessageId`;
  - `throws MailboxNotConnectedError on 409`;
  - `throws a plain Error on 5xx`, so the job retries;
  - `health lists an unconnected mailbox as not ok`.
- [ ] **Step 2:** `npm test -w @bimaplacement/api -- email-layer-mailbox`: FAIL.
- [ ] **Step 3:** Implement. Add a `production-checks.spec` case.
- [ ] **Step 4:** Unit tests and `npm run typecheck` are green.
- [ ] **Step 5: Commit:** `feat(mail): email-layer mailbox adapter (send)`.

## Task B2: Conversation refs on outbound mail

**Files:**
- Migration `apps/api/src/database/migrations/1793430000000-MailConversation.ts`: `mail_messages` adds `conversation_ref text NULL` and `provider_thread_id text NULL`, plus an index on (`conversation_ref`, `created_at`).
- Modify the entity `modules/communications/entities/mail-message.entity.ts`.
- Modify `modules/communications/mail-outbound.handler.ts`.
- Create `modules/communications/conversation-ref.ts` + spec.
- Modify `modules/communications/mail-outbound.handler.ts` failure path: a `MailboxNotConnectedError` is final. Record the mail row with `status: 'failed'` and the error, and do not rethrow, so BullMQ doesn't retry a hopeless send. Raise an INT notification to the ticket owner, "Connect your Gmail to send insurer mail", using the existing notification outbox.

**Interfaces:**
- Produces: `conversationRefFor(ticketNo: string, threadRef: string | null): string`, giving `PLC-1018/TH-02`, or `PLC-1018/RM` when `threadRef` is null.
- The handler sets `conversation`:
  - `{ ref }` when no earlier `mail_messages` row with that `conversation_ref` has a `provider_message_id`;
  - else `{ ref, replyToMessageId: <latest row's provider_message_id> }`.

  It sets `idempotencyKey = job.outboxId`, and stores `conversation_ref` + `provider_thread_id` on the row.

- [ ] **Step 1: Write the failing tests:**
  - unit: `conversationRefFor('PLC-1018','TH-02') === 'PLC-1018/TH-02'` and `conversationRefFor('PLC-1018', null) === 'PLC-1018/RM'`;
  - e2e (`mail-trail.e2e-spec.ts`, using the dev adapter spy): `the first float mail starts the conversation, the follow-up continues it` (the second `send` call has `replyToMessageId` = the first mail's `providerMessageId`);
  - e2e: `a mailbox that is not connected fails the mail once, notifies the owner, no retry`.
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3:** Implement. Run `npm run migration:run` on the dev DB.
- [ ] **Step 4:** Unit and e2e for `mail-trail` pass.
- [ ] **Step 5: Commit:** `feat(mail): conversation refs and reply chaining on outbound mail`.

## Task B3: Delivery webhook

**Files:**
- Migration `1793440000000-EmailLayerInbox.ts`: table `email_layer_deliveries`:
  - `delivery_id text PK`;
  - `payload jsonb`;
  - `status text` (`processed|rejected|failed`);
  - `last_error text`;
  - `attempts int`;
  - `created_at`;
  - `processed_at`.
- Create:
  - `apps/api/src/integrations/email-layer/email-layer-webhook.controller.ts` (`@Public()`, `POST /integrations/email-layer/webhook`, rawBody);
  - `email-layer-inbound.service.ts` + spec;
  - `email-layer.module.ts`.
- Modify `apps/api/src/infrastructure/mail/mailbox.port.ts`: `InboundMailRaw` gains `conversationRef?: string | null`, `sentByStaff?: boolean` and `viaEmailLayer?: boolean`.
- Modify `infrastructure/metrics/ops-metrics.ts` and `.handler.ts`: `EmailLayerInboundFailed1h`, plus an alarm in `infra/cdk/lib/monitoring-stack.ts` (runbook `docs/runbooks/email-layer-inbound.md`).

**Interfaces:**
- Consumes: `verifyEmailLayerSignature`, `DeliveryPayload`, `InboundMailService.ingest` (Task B4 adds the new behaviour), `RateLimiter` (bad-signature limit, as in `bimasetu-webhook.controller.ts`).
- Produces: `EmailLayerInboundService.receive(payload: DeliveryPayload): Promise<'processed' | 'duplicate' | 'rejected'>`.

**Controller answers:**

| Situation | Answer |
|---|---|
| Bad signature | 401 (counts against the per-IP limit; 429 past it) |
| Invalid payload shape | 400 |
| `duplicate` | 200 |
| `rejected` (product isn't `placement`, unknown ticket in the ref) | 422 |
| Attachment fetch error, or DB error | 503 |

**Mapping to `InboundMailRaw`:** `providerMessageId = rfcMessageId`; `mailbox = seenInMailboxes[0]`; `textBody = textBody`. Each attachment's `fetch()` does an axios GET of its `url` and throws on non-2xx.

- [ ] **Step 1: Write the failing e2e tests** (`email-layer-webhook.e2e-spec.ts`, signed with `signEmailLayer`, attachment URLs served by a local `http.createServer` in the test):
  - `refuses an unsigned delivery`: 401;
  - `processes a delivery once` (Review Focus 4): the same `deliveryId` twice gives 200, 200, and one `inbound_mails` row;
  - `answers 503 when an attachment URL has expired and stores nothing` (Review Focus 5): the test server returns 403 for the file;
  - `rejects a delivery for another product`: 422.
- [ ] **Step 2:** `npm run test:e2e -- email-layer-webhook`: FAIL.
- [ ] **Step 3:** Implement. The inbox row is written in the same transaction as `ingest`'s writes, or `ingest` is idempotent on `providerMessageId` (it already is: `inbound-mail.service.ts:79`). On 503, write nothing.
- [ ] **Step 4:** Pass. Add the runbook. Update the infra monitoring test list.
- [ ] **Step 5: Commit:** `feat(email-layer): signed delivery webhook into inbound mail`.

## Task B4: Sender rules, unanchored mail, colleagues' Gmail replies

**Files:**
- Modify `modules/inbound-mail/inbound-mail.service.ts`: `map()` and `ingest()`.
- Modify `modules/threads/threads.service.ts`: extract the shared resume logic from `replyToInsurer` into `private resumeOnOurReply(ctx, thread, text, how: 'app' | 'gmail', byName: string)`. Add `recordColleagueReply(actor: Actor, ticketId: string, threadId: string, text: string, byName: string)`.
- Test: `apps/api/test/email-layer-inbound.e2e-spec.ts`.

**Interfaces:**
- Consumes: `InboundMailRaw.conversationRef`, `.sentByStaff` and `.viaEmailLayer` (B3); `RfqService.recordRmAnswer` (existing).
- Produces: `ThreadsService.recordColleagueReply`.

`ingest()` rules for `viaEmailLayer` mail, decided in this order:
1. **`conversationRef` set:** the ticket and thread come from the ref (basis `'conversation'`, confidence 1). A `/RM` ref means ticket only, no thread.
2. **Sender is the ticket's `rmEmail`:**
   - ticket stage `awaiting_rm`: `rfq.recordRmAnswer(Actors.system('RM by mail'), ticketId, { text, answeredBy: rmName })`;
   - otherwise: Mail Trail plus My reviews, reason `"RM mail - apply it from the RFQ tab"`.

   Never classified as insurer mail.
3. **`sentByStaff` with a thread:**
   - the thread is `AWAITING_RM` (held) or has an open clarification: `recordColleagueReply`;
   - otherwise: Mail Trail only.

   Never classified.
4. **No `conversationRef`:** run the existing mapping for the ticket and thread suggestion. Then force `reviewQueue = MY_REVIEWS` if a ticket was found (else `UNMATCHED`), reason `"Not part of a Placement email chain - confirm"`. Never apply (BR-046).
5. **Otherwise:** the existing classify and apply path.

`recordColleagueReply` does what `replyToInsurer` does, minus the `mail.insurer_reply` outbox:
- resume with the remaining time;
- set the clarification's `replyText` / `repliedAt`;
- thread event `'Replied from Gmail by <byName> · clock resumed'`;
- audit `'Replied to insurer clarification'` with detail `'<TH-nn> · from Gmail by <byName>'`.

- [ ] **Step 1: Write the failing e2e tests:**
  - `an insurer reply in a registered conversation applies to that thread` (quote → quote recorded, basis `conversation`);
  - `an unchained PLC-tagged mail goes to My reviews and changes nothing`: thread status unchanged, `reviewQueue: 'my_reviews'`;
  - `a colleague's Gmail reply resumes a held thread with its remaining time and sends no mail` (a thread held via `hold-for-rm`; after delivery its status is `acknowledged`, `pausedSince` is null, `heldMins` grew; no new outbound `mail_messages` row; timeline has `'Replied from Gmail by'`);
  - `a colleague's reply on a thread not waiting on us is only recorded`;
  - `an RM mail answers the RFQ queries on a manual ticket` (stage `awaiting_rm` → `rfq_review`; query answered and still unresolved, BR-111).
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3:** Implement. The in-app `replyToInsurer` behaviour must stay byte-for-byte the same: its existing e2e tests stay green.
- [ ] **Step 4:** Run the full `npm run test:e2e`, plus `npm test -w @bimaplacement/api`: green.
- [ ] **Step 5: Commit:** `feat(inbound-mail): sender rules, unanchored mail to review, colleague Gmail replies (FR-064)`.

## Task B5: Dev simulator, Admin visibility, docs

**Files:**
- Modify `apps/api/src/modules/dev/dev.controller.ts`: `POST /dev/tickets/:id/email-layer/deliver` builds a signed `DeliveryPayload` for a thread (`kind: 'insurer' | 'colleague' | 'unanchored'`) and posts it to the webhook in-process.
- Modify `apps/web/src/features/workspace/tabs/` (Insurance Contact thread card DevSimBlock): two buttons, "Colleague replies from Gmail" and "Unchained insurer mail".
- Modify `modules/masters/masters.service.ts` admin view + `features/admin/sections.tsx`: a read-only "Mailboxes" card listing `health()` per placement user (connected / not connected for sending). Hide it when the driver is `dev`.
- Modify:
  - `docs/integration/` (link the contract);
  - `docs/STATUS.md`;
  - `PLAN.md` 2.5: replaced by "email layer client" (`[~]` until live);
  - `.claude/context/status.md`.

- [ ] **Step 1: Write the failing e2e test:** `dev simulator delivers a colleague reply through the real webhook path` (`/dev/.../email-layer/deliver` with `kind: 'colleague'` on a held thread resumes it).
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3:** Implement. Run `npm run build -w @bimaplacement/web`.
- [ ] **Step 4:** Verify:
  - full suite: typecheck, lint, `format:check`, unit, e2e, web build, `infra/cdk` tests;
  - a browser check on the dev stack: hold a thread, press "Colleague replies from Gmail", and the thread resumes with the timeline entry.
- [ ] **Step 5: Commit** `feat(email-layer): dev simulator, mailbox status on Admin, docs` and push `feat/email-layer-client`. Check that the commit messages carry no attribution (`git log --format=%B origin/feat/infra-cdk..HEAD | grep -ci claude` → 0).
