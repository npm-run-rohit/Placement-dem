# BimaPlacement - build status

Last updated 2026-11-04. Task ids refer to [PLAN.md](../PLAN.md).
Everything marked built runs against the real API and database and is covered by the e2e suite
(95 e2e + 70 unit tests passing locally; CI runs both on every push).

## Built

**Platform**
- Monorepo: NestJS 11 API + worker, Next.js 16 web app (Turbopack dev and build, static export), shared `@bimaplacement/contracts`.
- Only `TicketWorkflow.run()` changes a ticket: it locks the row, checks the transition, re-derives status and the single SLA clock, and writes audit + outbox in the same transaction.
- Outbox → worker → idempotent queue handlers (BullMQ/Redis locally; AWS SQS/EventBridge behind the same ports).
- Business-time SLA clocks (IST, 540 business minutes a day, holidays). SLA-P1 escalation to the Placement Head (2.10).
- Automatic insurer follow-up ladder: follow-up 1 / 2 / escalation at 1 / 2 / 3 business days after float, from the PM's mailbox; held time excluded, stops on any reply and at the threshold (2.9).
- In-app notifications from the PRD matrix (assignment, reassignment, escalation, RM replies, insurer queries / declines, quotes, threshold, QCR ready / failed, revisions), one per event and recipient, with a bell in the sidebar (4.1).
- `Idempotency-Key` on POST / PUT / PATCH: a retried request runs once and replays its response for 24 h (0.2). The web app sends one on Create Ticket.
- e2e harness on a fresh database per run, in CI with Postgres + Redis (0.3). Dev fixtures: the prototype's 17 tickets (`npm run seed:fixtures`, 0.4).

**Workbench screens (all on the real API)**
- Home: Your Tasks (open PM tasks), desk counts (Me / Team), Escalated to You (1.2), Your Progress for last week / month / quarter / custom months from the clock history (`GET /reports/progress`).
- My Tickets queue with tabs, filters and sort (1.1).
- Create Ticket: RFQ Excel and/or link, RM and owner pickers, SPOC, urgency, incumbent, target premium (1.7).
- Search (sidebar): tickets, clients and insurers, scoped to what the user may see (1.8).
- Ticket workspace: previous / next ticket pager in urgency order. Tabs: Overview, RFQ, Client 360, Documents, Insurance Contact (panel + threads), Quotes, QCR, Mail Trail, Audit Trail; right rail with stage timeline, next action, mandate, outcome.
- Manual Review: inbound insurer mail mapping, auto-apply when confident, My reviews / Unmatched queues (2.7).
- Insurer Master: Placement Head edits insurers, branches and contacts; change log (2.2).
- Admin (Placement Head / Admin only): SLA targets, SLA-06 quote collection matrix, business calendar and holidays, thresholds, SLA-P1, insurer follow-up ladder, reason lists and industries, communication templates, product types (aliases, BimaSetu codes, timing LOB), change log. Every save is validated, logged before/after and reloaded into the SLA engine; other processes pick it up within a minute (4.2).
- Reports: pipeline, SLA breaches by stage, insurer outcomes, PRD 9.4 funnel; for the Placement Head a Team section (PRD 9.2): workload by owner, ageing, the RM / quote collection / QCR release waits, escalations, urgency, no-appetite rate, reassignments and intake mix (4.3).

**Security (PLAN 4.5)**
- Every stored file is malware-scanned first (`MALWARE_SCANNER=clamav` in production; `dev` only flags the EICAR test file). Infected uploads are refused; an infected mail attachment is dropped and the mail goes to a person.
- Every document link is written to an append-only access log (`GET /documents/:id/access-log`, Placement Head / Admin).
- The API and worker refuse to start in production with dev auth, dev simulators, local storage or the dev scanner.
- BimaSetu webhook: signature checked whenever `BIMASETU_WEBHOOK_SECRET` is set, envelope shape checked, rate limited per IP (`WEBHOOK_RATE_LIMIT_PER_MIN`).

**Infrastructure and monitoring (PLAN 0.6, 4.6)**
- AWS CDK in `infra/cdk` (ap-south-1). Stacks: network; data (RDS Postgres 16, ElastiCache Redis, KMS-encrypted documents bucket, secrets); app (ECS Fargate API / worker / ClamAV + migration task, ALB with WAF, S3 + CloudFront web app); monitoring. Deploy guide: [infra/cdk/README.md](../infra/cdk/README.md).
- The worker publishes ops metrics every minute: outbox lag, job heartbeats, dead-lettered jobs, Manual Review backlog, Copycat and BimaSetu failures. These feed 21 CloudWatch alarms (email) and a dashboard. Each alarm has a runbook in [docs/runbooks](runbooks/README.md).

**Flows**
- QCR quote rows autofill from Copycat's comparison (and the quote record for single-quote / manual QCRs); each cell shows "From QCR" / "Edited" and can be put back. Floated tickets close from BimaSetu's client confirmation or line lost (dev simulators on the QCR tab).
- RFQ review, queries to the RM, risk tier, validation; insurer selection with Do Not Float / inactive / incumbent blocks; float with one thread per insurer + branch.
- Outbound insurer and RM mail from the assigned PM's mailbox (Mailpit locally), follow-up ladder, thread clock hold for RM information.
- Quotes: usable / clarification / excluded, threshold of 3 insurer companies → Copycat draft QCR (mock mode), early release, manual QCR upload.
- Mandates: Exclusive Placement and Incumbent Approach.
- Revision rounds: a revision opens a PM task and contacts no insurer; Restart threads / Add an insurer / New RFQ version from the QCR tab mark it handled and close the task (3.5, FR-250).
- Client decision on manual tickets; No appetite closure.

## Pending

| Area | What is missing | Blocked on |
|---|---|---|
| BimaSetu | Outbound sender, reconciliation; inbound built to the draft contract (see [integration guide](integration/BIMASETU-INTEGRATION.md)) | Wire format with the BimaSetu team |
| Copycat | Live client (mock works end to end) | Copycat API |
| Mailbox | Sending and reading through the shared email layer (dev SMTP works) | Email layer design (in progress) |
| Identity | Sahayak token + shell handshake (dev header auth works) | Sahayak contract |
| Masters | Excel import of the Insurer Master; extra routing fields (FR-163); mailbox connector and Copycat settings screens | Masters workbook; mailbox / Copycat decisions |
| Reports | Read replica for reporting queries | Not started (add to the CDK data stack) |
| Infra | Tracing (X-Ray / OTel); AWS messaging driver (4.8); retention / deletion jobs | Retention periods (DPDP / IRDAI) |
| Compliance | Retention / deletion jobs (DPDP) | Retention periods (HLD s11 #9) |
| Notifications | Delivery to mail / Slack / chat (in-app works) | Sahayak notifications |

## Frontend performance notes

- Each screen, workspace tab and modal is its own Turbopack chunk (`lazyNamed` in `apps/web/src/lib/lazy.ts`). Home ships in the first load; the other chunks preload when the browser is idle, so navigation does not wait on the network.
- The demo preview's fixtures (~440 KB) are swapped for a stub in real builds (`turbopack.resolveAlias` in `next.config.ts`); only `npm run build:demo` includes them.
- First screen: 600 KB of JS before gzip (was 669 KB). Most of it is React DOM and the Next.js client runtime.
- Data: react-query with a 15 s stale time; list endpoints return compact read models (`TicketListItem`), and reports and search are single aggregate queries.
