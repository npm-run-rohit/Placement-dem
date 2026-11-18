# Shared email layer: Placement as the first product (design)

Status: for Rohit's approval, 2026-11-04 (builder check done, questions answered). Spans two repos:
- **Email layer:** `email-parser-scaffold` (the email parser, to be merged into `bimakavach/microservice-api-gateway`).
- **Placement:** `bimaplacement`.

## 1. Intent

Insurer and client mail at BimaKavach is messy:
- several staff mailboxes join one conversation;
- people reply from their own Gmail;
- whoever is free steps in.

For example, Himani (himani@) sends the quote request, and when details are missing Bhupesh (bhupesh@) answers the
insurer or the client from his own inbox. Every product (Placement now; Endorsements, Renewals and Claims later)
needs the same four abilities:
- send as a real person;
- read every reply, from any staff mailbox;
- know which case a reply belongs to;
- hand it to the right product.

Rohit's recommendation (his "Email Communication Automation: Approach Options" doc, Options 3 + 4): build this
once, as a shared email layer grown from the existing email parser, and let each product keep its own business
rules. Placement is the first product on it. This replaces Placement's plan to build its own Gmail adapter
(PLAN 2.5).

## 2. Goals, non-goals, anti-goals

**Goals**
1. Placement sends its first emails (RFQ float to each insurer + branch, follow-ups, template mail) through the
   email layer, as the assigned person, and gets back the message ids.
2. Every later message in that conversation reaches Placement within a minute or two:
   - insurer replies;
   - replies from any connected staff mailbox, whoever sends them;
   - client mail, if it joins the thread.
3. A message that doesn't chain back to a Placement email but carries a `PLC-nnnn` tag reaches Placement's Manual
   Review.
4. Nothing Placement owns becomes a parser `EmailTicket`. Nothing that isn't Placement's leaves the parser.
5. The design works for the next product without changing the email layer's code: only config (a product's
   name, webhook URL, secret and tag pattern).

**Non-goals (this build)**
- The MCP front door for AI assistants. It wraps the same HTTP API later, and is designed for here but not built.
- Moving Placement's follow-up timers into the email layer. Placement keeps its business-time ladder (BR-037..043).
- A shared insurer / client contact directory. Placement keeps its Insurer Master.
- Moving Endorsements onto the layer. Its existing ticketing stays exactly as it is.
- AI reading or classification of mail (PLAN 4.4, which waits on the DPDP sign-off).

**Anti-goals (a failure even if it "works")**
- Placement mail is sent from anyone other than the assigned person. Rule M5: a failed send fails loudly; it
  never falls back to another identity or a shared address.
- One email ends up as two cases: a Placement thread plus a parser ticket.
- A reply is silently dropped because it came from an unexpected mailbox.
- Insurer documents, insurer lists or thread details leak into BimaSetu (FR-290). The layer delivers to the
  product that owns the conversation, never to BimaSetu.

## 3. What exists today

**Email parser (`email-parser-scaffold`):**
- NestJS + TypeORM + BullMQ.
- Per-person Gmail OAuth connect (`ConnectedMailbox`, tokens encrypted), with scope **`gmail.readonly` only**
  (deliberate, see `gmail-oauth.service.ts`).
- Pub/Sub push, then `history.list` sync, then MIME parse.
- `EmailMessage` rows are idempotent on `rfc_message_id` (one logical message seen by several mailboxes;
  `EmailMessageReceipt`).
- The matching cascade lives in `ticket-matching.service.ts`. Its cross-mailbox key is
  `computeRootMessageId()`: the first id in `References`, else `In-Reply-To`, else its own id.
- Staff replies are seen through each connected mailbox's SENT label (direction `outbound`).
- Attachments are not processed and raw MIME is not stored yet.
- Not deployed. There is no GCP project, OAuth client or Pub/Sub topic yet (`docs/deployment-plan.md`, blocker #3).

**Placement:**
- `MailboxConnector` port (`send`, `fetchNew`, `health`). Its `dev` adapter delivers to Mailpit; its `gmail` adapter
  is a stub.
- Outbound mail goes through the outbox to `MailOutboundHandler`, which is idempotent on the outbox id, sends from
  the ticket owner's mailbox (M5), puts all POCs in To (FR-213) and adds `[PLC-nnnn | TH-nn]` to the subject
  (FR-050).
- Inbound: `InboundMailService.ingest(InboundMailRaw)`. It maps by reply chain (`mail_messages.provider_message_id`
  = RFC Message-ID), then subject ref, then sender. It then classifies, and either applies the result or sends the
  mail to Manual Review (My reviews / Unmatched). Attachments go through the malware scan before storage.
- BimaSetu webhook pattern: HMAC signature, envelope checks, an inbox table, processed once, rate limit on bad
  signatures.

## 4. Decided (Rohit, 2026-11-04)

1. Use the shared layer. Placement builds no Gmail adapter of its own.
2. **Products call the layer over signed HTTP. MCP is only for AI assistants.**
3. People reply from their own Gmail; the app only needs to see it. Placement does not send staff replies.
4. Placement sends the first emails through the layer, which returns the message and thread ids.
5. The layer **pushes** each message to Placement over a **webhook**.
6. A Placement conversation lives only in Placement. The parser passes it on and creates no `EmailTicket`.
7. Unchained mail with a `PLC-nnnn` tag goes to Placement's Manual Review. Anything else is the parser's, as today.
8. Claude builds both sides, including in the parser repo.
9. Mailbox provider is Google Workspace (Gmail).
10. **Mailboxes belong to a product.** A mailbox connected for Placement only feeds Placement. Its other mail
    (newsletters, internal mail, anything that is neither a Placement conversation nor `PLC`-tagged) is stored and
    creates no ticket. RM and endorsement mailboxes keep today's cascade.
11. **A colleague's reply from Gmail counts as our reply.** When a connected staff member answers an insurer on a
    Placement thread, Placement treats it exactly like the PM replying in the app (see §5.5).

## 5. Design

### 5.1 The conversation key

A conversation is identified by its **root**: the RFC `Message-ID` of its first email, as computed by
`computeRootMessageId()`. This is the same key the parser already uses across mailboxes. When Placement sends a
first email, the layer records `root = that email's RFC Message-ID` against `(product = placement,
ref = "PLC-1018/TH-02")`. Every message whose computed root equals a registered root belongs to that product and
ref, whichever mailbox it lands in and whoever sent it.

*Caveat to check with Rohit (see §8):* a staff member who starts a **new** email to the insurer (not a reply) has
no `References`, so it can only be caught by the `PLC-nnnn` tag rule, if they keep the tag in the subject.

### 5.2 Email layer: send API

`POST /email-layer/v1/messages`. The product authenticates with an HMAC-SHA256 signature over
`timestamp + "." + rawBody` in `x-email-layer-signature`, the same scheme as Placement's BimaSetu webhook. There is
one secret per product, and timestamps are checked against a tolerance window.

Request:
- `product`: `"placement"`.
- `idempotencyKey`: Placement's outbox id. A repeat returns the first result and never sends twice.
- `from`: an email address. It must have a `ConnectedMailbox` with the send scope. Otherwise the layer answers 409
  `MAILBOX_NOT_CONNECTED`, which is final: Placement does not retry it, and it shows up as a dead-lettered job and
  the `mail-send-failures` alarm.
- `to[]`, `cc[]`, `subject`, `text`, `html`.
- `attachments[]`: `{ fileName, contentType, url }`, where `url` is a short-lived presigned GET from Placement's
  storage. The layer fetches each file, so large bodies never pass through the JSON.
- `conversation`: either `{ ref }` to start a new conversation (registers the root), or
  `{ ref, replyToMessageId }` to continue one. Continuing sets `In-Reply-To` and `References` (so the root stays the
  same) and, if the sender's mailbox has that Gmail thread, the Gmail `threadId`.

Response: `{ rfcMessageId, gmailMessageId, gmailThreadId, sentAt }`.

The layer sends with `users.messages.send` on the sender's mailbox. It generates the `Message-ID` itself, so the
id it returns is known before Gmail sees the message.

Messages sent through this API are recorded as already delivered. When the parser later sees the same message in
the sender's SENT label, it does not push it back to Placement.

### 5.3 Email layer: routing step in ingestion

In `ingestMessage()`, after the existing `rfc_message_id` dedupe and before `matchingService.match()`:

1. `root = computeRootMessageId(envelope)`.
2. If `root` is a registered product conversation: save the `EmailMessage` with no ticket and
   `routed_product = placement`, queue a delivery, and stop. The cascade, sentiment and `EmailTicket` are all
   skipped.
3. Else, if the subject matches a product's tag pattern (Placement: `/\bPLC-\d{4,}\b/`): same as above, without a
   ref. Placement treats it as unanchored and sends it to Manual Review.
4. Else, if every mailbox that received it belongs to a product (decision 10): store it with no ticket and no
   delivery.
5. Else: the existing cascade, unchanged.

`ConnectedMailbox` gains `product` (null = today's behaviour). The connect flow sets it, and an admin can change it.

Product registration (name, tag pattern, webhook URL, secret) is config, not code (goal 5).

Attachments of routed messages are stored (S3, as the parser's integration checklist already plans) and shared as
short-lived presigned URLs in the delivery. Raw MIME stays out of scope.

### 5.4 Email layer: delivery to the product

There is a `product_delivery` row per (message, product), delivered by a BullMQ job with retries and backoff. Once
retries run out, the row is kept as a dead letter with its error and can be retried. Delivery is
`POST <product webhook>`, HMAC-signed the same way, with this body:

- `deliveryId`, which the product dedupes on.
- `product`, `conversationRef` (or null when unanchored), `rootMessageId`.
- `message`:
  - `rfcMessageId`, `inReplyTo`, `references[]`;
  - `from`, `to[]`, `cc[]`, `subject`;
  - `textBody` (full, not quote-stripped: Placement keeps the original), `htmlBody`;
  - `sentAt`;
  - `seenInMailboxes[]`;
  - `sentByStaff`: true when the sender is a connected BimaKavach mailbox;
  - `attachments[]`: `{ fileName, contentType, size, url }`.

A 2xx from the product means delivered. 4xx means rejected (final, kept for inspection). 5xx or a timeout means
retry.

### 5.5 Placement side

- **New `MailboxConnector` adapter `email-layer`** (`MAILBOX_DRIVER=email-layer`, plus `EMAIL_LAYER_URL` and
  `EMAIL_LAYER_SECRET` in the external secret):
  - `send()` calls the send API.
  - `fetchNew()` is unused (the poller is off for this driver).
  - `health()` calls the layer's health endpoint.

  `OutboundMail` gains the conversation `ref` and `replyToMessageId`. `MailOutboundHandler` fills them: the first
  mail on a thread starts the conversation, and later mails (follow-ups, replies, clarifications) continue it from
  that thread's latest known message. It also stores `rfcMessageId` (already `provider_message_id`) and the Gmail
  thread id.
- **New webhook `POST /integrations/email-layer/webhook`:** HMAC check, an inbox row per `deliveryId` (processed
  once), the same rate limit on bad signatures as the BimaSetu webhook. It then converts the payload into
  `InboundMailRaw`, where attachment `fetch()` downloads the presigned URL, so the malware scan and storage path
  stay as they are. Then it calls `InboundMailService.ingest()`:
  - **With a `conversationRef`:** the ticket and thread come from the ref (confidence 1, basis `conversation`). The
    reply chain lookup stays as a cross-check.
  - **Without one:** the mail **always** goes to Manual Review (decision 7, BR-046), with the ticket and thread
    from the tag as a suggestion. This overrides the existing subject-ref auto-apply (confidence 0.95) for
    email-layer deliveries, so an unchained mail never changes commercial data without a person.
  - **Who sent it.** Placement decides from the sender, in this order:
    1. The ticket's RM (`rmEmail`): the RM path (an RFQ query answer on manual tickets).
    2. A connected staff mailbox (`sentByStaff`): our reply.
    3. Anyone else: the insurer, or the client.
  - **Our reply from Gmail (decision 11)** runs the same workflow command as an in-app reply (`replyToInsurer`), with
    one difference: no mail is sent, because it already went out. It:
    - resumes a thread held for RM info with exactly its remaining time (FR-064);
    - records the reply text on the open clarification;
    - logs "Replied from Gmail by <name>" on the thread and audit trail.

    The clock change cancels a pending SLA-P1 the same way an in-app reply does. It is never classified as an
    insurer response. On a thread that isn't waiting on us, it is only recorded (Mail Trail + timeline).
- **Which conversations are registered:** every mail Placement sends. Insurer threads use ref `PLC-nnnn/TH-nn`; RM
  mail on manual tickets (RM-T01 queries) uses `PLC-nnnn/RM`.
- **Dev and test:** the `dev` driver (Mailpit) and the dev simulators stay as they are. The webhook gets a dev
  simulator and e2e tests with signed payloads.
- **Monitoring:** the existing `mail-send-failures` and `dead-letter-jobs` alarms cover sending. The webhook inbox
  adds `EmailLayerInboundRejected` / `Retrying` metrics, the same pattern as BimaSetu.

### 5.6 Gmail permissions

Sending needs `gmail.send` added to the parser's OAuth scopes. With the OAuth consent screen set to **Internal**
(bimakavach.com users only), Google needs no app verification for either scope. Everyone reconnects once to grant
send. Domain-wide delegation (an admin-approved service account) is the alternative, and needs no per-person
connect; it is left as a later switch, not built now.

### 5.7 The MCP front door (later)

An MCP server that wraps the same HTTP API for assistants: send from template, find conversation, and so on. It has
its own guardrails (which templates, which recipients, human click for anything that isn't routine). It is not built
in this pass. The HTTP API is shaped so the MCP server needs no new endpoints.

## 6. Contract and testing

- **One contract document:** `docs/integration/EMAIL-LAYER-CONTRACT.md` in `bimaplacement`, mirrored in the parser
  repo, with JSON examples. Both sides test against the same example payloads.
- **Email layer tests:**
  - unit tests for routing (registered root, tag only, neither);
  - send idempotency;
  - delivery retry and dead letter;
  - its existing simulated-Gmail demo (`demo:send`) extended to a Placement conversation across two mailboxes.
- **Placement tests:** e2e for the webhook (signature, processed once, ref, unanchored, staff reply, infected
  attachment) and for the send adapter against a stub layer.

## 7. Rollout

1. Contract doc, then the email-layer send API + registry + routing + delivery (parser repo).
2. Placement adapter + webhook behind `MAILBOX_DRIVER=email-layer`. The `dev` driver stays the default.
3. Infra blockers (Rohit / infra team): GCP project, OAuth client (Internal) with `gmail.send`, Pub/Sub topic; the
   parser merged into the gateway and deployed (`docs/deployment-plan.md`). Placement's CDK gets
   `MAILBOX_DRIVER=email-layer` + `EMAIL_LAYER_URL` through `appEnv`.
4. Go live for the whole Placement team at once. `MAILBOX_DRIVER` is global, and M5 forbids sending as anyone
   else, so a one-PM pilot would break every other PM's sends. Before switching, the layer's health endpoint lists
   the Placement users without a connected, send-enabled mailbox, and Placement shows them on Admin. Rehearse
   end to end on a non-production stack (or locally, with both services in Docker) using Rohit's own mailbox.

## 8. Calls made in this document (check them)

- **Where the parser side is built:** in `email-parser-scaffold`, which is merged into `microservice-api-gateway` by
  its own deployment plan.
- **How the two systems reach each other:** Placement's webhook is reached through its public API host (ALB + WAF,
  like the BimaSetu webhook), and Placement reaches the layer through the gateway's public URL. Both directions are
  HMAC-signed. For the CTO demo, both run locally.
- **One global driver switch, no single-PM pilot** (§7).
- **Ref formats** `PLC-nnnn/TH-nn` and `PLC-nnnn/RM`. The sender order is RM, then staff, then external (§5.5).
- **Domain-wide delegation** is left as a later switch; each person connects once (§5.6).

## 9. Left to the builder

Table and column names; the exact retry/backoff numbers; how the product registry is stored (config file vs
table); the internal module layout in both repos; the presigned URL lifetime (minutes, long enough for retries).
