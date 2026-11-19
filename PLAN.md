# BimaPlacement - Build Plan (for Claude Code)

This is the working plan. Claude Code: read `CLAUDE.md` first, then pick the **first unchecked task** in the lowest
open phase (or the one the user names), do it end to end (code + tests + docs touch-ups), tick it here, and stop for
review. Each task lists the spec to follow and the definition of done (DoD).

Spec sources, in priority order: `docs/product/PRD-v1.7.md` (FR/BR ids) > `docs/architecture/LLD.md` >
`docs/design/UI-SPEC.md` (UI, exact labels/states) > `docs/product/Architecture-and-Build-Plan.md` (later phases).

Legend: `[x]` done in the scaffold · `[ ]` to do · (FR-xxx) requirement ids · `→` files to touch.

---

## Phase 0 - Foundation (W1) — scaffold delivered

- [x] Monorepo (npm workspaces): `apps/api`, `apps/web`, `packages/contracts`, `infra`, `docs`
- [x] Typed config, pino logging with PII redaction, correlation id, DomainError -> HTTP filter
- [x] Auth guard (Sahayak JWT via JWKS, dev header mode), `@Roles`, `@CurrentUser`, users projection
- [x] Messaging ports + BullMQ driver, `@QueueHandler` discovery, worker entrypoint, repeating jobs
- [x] Transactional outbox + relay (SKIP LOCKED), storage port (local + S3), mailbox port (dev + Gmail stub)
- [x] All entities + generated `InitialSchema` migration + `AuditImmutability` triggers + seed of PRD masters
- [x] `TicketWorkflow` unit of work, state machine, status deriver, SLA resolver, business calendar (+ tests)
- [x] Golden path verified against Postgres: create -> queries -> validate -> panel (DNF blocked) -> float -> hold/resume -> quotes -> 3 usable -> Copycat draft queued -> worker relays outbox
- [x] **0.1** ESLint (flat config, typescript-eslint) + Prettier wiring + `npm run lint` in CI → root `eslint.config.mjs`
- [x] **0.2** `IdempotencyInterceptor` backed by `idempotency_keys` table (24h TTL) for POST/PUT/PATCH (PRD 10.2) → `common/idempotency`, new entity + migration
- [x] **0.3** e2e harness: `test/jest-e2e.json`, test DB bootstrap (migrate + seed per run), supertest helper with dev auth headers; port the curl golden path into `test/golden-path.e2e-spec.ts`
- [x] **0.4** (as `npm run seed:fixtures`: the prototype insurer master + all 17 prototype tickets replayed through the services) Dev fixtures: `SEED_FIXTURES=true` loads insurers/branches/POCs (from `docs/design/UI-SPEC.md` s6.4 - mock data, clearly labelled) + Placement users (Bhupendra=PM, Himani=Head) + RM (Shubh) + 3 demo tickets → `database/seeds/fixtures/*`
- [ ] **0.5** Confirm with Sahayak team: token claims, JWKS, shell handshake; update `SahayakAuthGuard.fromPayload` + `apps/web/src/lib/auth.ts`; remove default dev user fallback outside `AUTH_MODE=dev`
- [x] **0.6** (AWS CDK, Rohit 2026-11-04, same layout as bk-uw2: `infra/cdk` network / data / app / monitoring stacks, assertion tests in CI, deploy guide in `infra/cdk/README.md`; API image gains the RDS CA bundle + `db:deploy`; DB secret parts + TLS in config) CDK skeleton (match BimaKavach IaC choice)

## Phase 1 - Placement core read models + Web shell (W2, W11)

- [x] **1.1** `TicketReadService`: build `TicketListItem` / `TicketDetail` (contracts `dto.ts`) incl. `SlaClockView` with **business-minute** remaining (calendar), `usableQuoteCount`, `mandateState`, `nextAction` (domain `next-action.ts`, with thread breach/paused inputs). Return these from `GET /tickets`, `/tickets/:id`, `/by-no/:no` → `modules/tickets/ticket-read.service.ts` (DoD: e2e asserts shapes; web `api/hooks.ts` switched to contracts types)
- [x] **1.2** Desk counts (FR-226/271, M12 s12) as SQL + calendar thresholds; `scope=me|team` for Head; Escalated-to-You list → `reporting` or `tickets` (DoD: unit test per card definition)
- [x] **1.3** Visibility rule decision (HLD open #6, decided: all non-escalated team tickets) and enforcement in list/get/search/reports (FR-208); every `tickets/:ticketId` sub-resource via `TicketVisibilityInterceptor`, documents by id/upload in the service
- [x] **1.4** Web: Queue complete - column header filters (stage/type/client/product), sort, Owner column (Head), mandate star, `SlaCountdown` from read model, empty states (UI-SPEC 3.2)
- [x] **1.5** Web: Home - desk cards with deep-links to pre-filtered queue, Me/Team scope switch (Head), Escalated to You table (UI-SPEC 3.1). Progress cards: live "Last Week" only; other ranges hidden until reporting exists
- [x] **1.6** Web: Workspace header complete (mandate pill + hover, participants stack, target premium Add/Edit modal, Contact RM = mailto/BimaSetu deep link), default tab + red dot from `nextAction`, rail: StageTimelineCard (ok/atRisk/breached/external/closed), NextActionCard, OutcomeCard (UI-SPEC 3.3, 3.3.1)
- [x] **1.7** Web: Create Ticket modal complete - RFQ Excel dropzone (`POST /documents` kind=rfq_excel, accept from Upload Rule master), RM picker (directory), Owner (Head only), Client SPOC, Urgency, Incumbent insurer for Renewal/Rollover, masters from `/masters/bootstrap` (FR-192..201)
- [x] **1.8** Web: global search modal (tickets, clients, insurers) + `GET /search` (UI-SPEC 2.5)
- [ ] **1.9** Web design-system backlog: Menu/ColumnFilter, Select, MoneyInput (en-IN, commit on blur), Checkbox, Drawer, Tooltip, FileDropzone, AvatarStack, SearchInput; Storybook optional

## Phase 2 - RFQ, insurers, threads, mail (W2, W3, W5)

- [~] **2.1** (done: BimaSetu float card, RFQ summary, versions + change note, link card opening BimaSetu's rendered view, Excel card with view / download, multi-line Ask RM with note, RM query mails; pending: in-app read-only sheet grid, needs the rendered-view format from BimaSetu) RFQ tab complete: link -> read-only sheet viewer (FR-013; use BimaSetu rendered view when present, else iframe/"Open link"), Excel card with download, versions chips + change note, BimaSetu float card, RM query mails (manual), Ask-RM modal (multi-line + message) (UI-SPEC 3.3.3)
- [~] **2.2** (done: Head-only insurer / branch / POC create + edit, retire not delete, status, appetite, change log, screen + edit drawer; pending: routing attributes FR-163, Excel import CLI (needs the Masters workbook)) Insurer master admin: branch + POC CRUD, appetite grid, status, routing attributes (FR-160..163), change log; Insurer Master screen + edit drawer (UI-SPEC 3.5); import from `BimaPlacement_Masters_v3.xlsx` (Appendix F mapping) as a CLI script
- [x] **2.3** Insurer Panel tab (UI-SPEC 3.3.6a): entity list with locks/appetite/POCs, <3 warning, send confirmation modal, locked view, add-insurer-after-float modal; RFQ V2 carry-forward of selections (FR-132)
- [x] **2.4** Communications: seed templates INS-T01..T06, RM-T01, INT-T01..T06 (PRD M6 s12); `MailOutboundHandler` renders + sends via `MailboxConnector`, attaches RFQ Excel / link in body, writes `mail_messages` + `thread_events`, idempotent on outbox id; Mailpit SMTP dev adapter (nodemailer)
- [~] **2.5** Email layer client (replaces the Gmail adapter of ADR-0004; see `docs/integration/EMAIL-LAYER-CONTRACT.md`): signed send as the assigned PM with thread continuity, signed delivery webhook, sender rules (RM, colleague Gmail reply, unanchored to Manual Review), health + Admin Mailboxes status, dev simulator. Built and tested against the contract; `[~]` until it runs live against the deployed layer (FR-166..171, FR-188)
- [x] **2.6** Inbound mapping: subject refs, In-Reply-To -> `mail_messages.provider_message_id`, sender vs thread POCs (unknown-sender flag), attachments -> documents, auto-apply only above confidence threshold; `matchProductTypes` implementation + tests for every FR-230 rule
- [~] **2.7** (done: confirm classification + confirm mapping, both queues, screen; pending: classifier feedback table FR-078 (the applied class is stored on the inbound mail row for now)) Manual Review: confirm classification (applies via ThreadsService/QuotesService exactly like a mapped mail - FR-228), confirm mapping (FR-229), classifier feedback rows (FR-078); web screen (UI-SPEC 3.4)
- [x] **2.8** Insurer Threads tab (UI-SPEC 3.3.6b) incl. live `remainingMins`, held state, actions; Log Call modal
- [~] **2.9** (done: ladder in the sweeper, held time excluded, latest-step catch-up, e2e with the dev clock; no_response: never set, decided 2026-11-02) Follow-up ladder in `SlaSweeperHandler` (LLD 5.5) + `no_response` rule (open question) + tests with `Clock.advance`
- [x] **2.10** SLA-P1 completion: assign to Placement Head, INT-T02/INT-T06 notifications to both, Head reassign clears `escalated` (FR-207, FR-225)
- [~] **2.11** (done: float, query_answer (Q-nn / IR-nn), revision_request, client_confirmation, line_lost to the draft contract; business refusals final, others retried; dev simulators for each. pending: agreed wire format, product code mapping table) BimaSetu inbound dispatch (`BimaSetuInboundHandler`): float mapping/validation (+ product code mapping table, "Product not mapped" state), query answers (Q-nn / TH-nn), revision, confirmation, lost; float_rejected (FR-281..292)
- [ ] **2.12** BimaSetu outbound (`BimaSetuOutboundHandler`): envelopes per type; `qcr_round` built from the frozen QCR (signed file URL + rows with rowId), never insurer documents (FR-290); out-log rows; reconciliation job + polling fallback switch
- [~] **2.13** (done: Mail Trail (Mail + BimaSetu views) and Documents tab with view / download; pending: download access audit (W4)) Mail Trail tab (Mail + BimaSetu views) + Documents tab (Internal/External, preview, download with access audit) (UI-SPEC 3.3.5, 3.3.9)

## Phase 3 - Quotes, QCR, decisions, mandates (W7, W2)

- [x] **3.1** Quotes tab + quote workspace (PDF frame, premium commit-on-blur + target flag, decision bar, clarify/exclude modals) (UI-SPEC 3.3.7); quote re-upload endpoint (new version)
- [~] **3.2** (mock mode end to end done: runner loads quote PDFs, stores the QCR document, merges rows; live HTTP client + health blocked on the Copycat API open question) Copycat: live HTTP client (multipart, timeout, job+poll if needed), runner loads docs from storage, stores returned file as `Document(kind=qcr)`, merges `quoteRows`; mock mode end-to-end; generation health on Admin (FR-178/190)
- [x] **3.3** Manual QCR upload (FR-266/267) incl. early-release reason rules; next-version after release with round bump rules
- [~] **3.4** (quote rows autofill from Copycat's comparison / quote record with From QCR / Edited markers and revert, validated row edits, saves and tick serialised (2026-11-02, PM feedback); done: threshold card + early release + upload, late quotes, versions, Copycat generating / failed / retry, QCR document, editable rows + rows checked, release to RM / BimaSetu, client decision / no appetite; pending: revision card actions (needs 3.5 + BimaSetu inbound 2.11), Copycat comparison modal) QCR tab (UI-SPEC 3.3.8): threshold card, early release, generating/failed/stale states, QCR document + Copycat comparison modal, rows card + "Quote rows checked", Send to BimaSetu/RM modal, late-quote card, revision card actions, closure controls
- [x] **3.5** Revision handling: mark `revisions.handled_*` from restart / add insurer / RFQ V2; PM task creation (FR-250); `tasks` service + `/me/tasks`; revive prototype Inbox as a tasks view
- [x] **3.6** Mandates: remind, withdraw, record response (considering/signed/declined with reason), Incumbent Approach Mandate upload re-enabling the rollover incumbent; rail card + header pill + hovers (FR-276..280, UI-SPEC 3.3.12)
- [ ] **3.7** Overview tab: phase bar + workflow stages with SLA targets (UI-SPEC 3.3.2); Audit tab actor filters

## Phase 4 - Notifications, admin, reporting, hardening (W8, W9, W12, W13)

- [~] **4.1** (done: PRD matrix -> in-app rows, idempotent per event + recipient, INT-T01..T06 rendered from the template master, bell + unread count, mark read / all; pending: delivery through Sahayak notifications (contract open)) `NotificationsHandler`: PRD 7 matrix -> recipients + templates; in-app rows; Sahayak delivery; bell + unread count in shell
- [~] **4.2** (done: GET /masters/admin + edits for SLA targets, SLA-06 matrix, calendar + holidays (retired, never deleted), thresholds, SLA-P1, follow-up ladder, reason lists + industries, templates, product types (aliases, BimaSetu codes, timing LOB, retire), upload rules API; change log; Admin screen; cross-process reload via master_change_log poll. pending: mailbox connectors + Copycat config/health (blocked on those decisions), upload rules UI) Admin screens: SLA master, SLA-06 matrix, ladder, thresholds, business calendar + holidays, reasons, templates, upload rules, product types + aliases + BimaSetu code mapping, mailbox connectors, Copycat config/health (FR-139..191, FR-270); every save -> `master_change_log` + `SlaConfigService.refresh()`
- [~] **4.3** (done: GET /reports + Reports screen - pipeline, SLA breaches by stage, under an hour, insurer outcomes, funnel 9.4; Placement Head team dashboard 9.2 (workload, ageing, waits, escalations, urgency, no-appetite rate, reassignments, intake mix); PM view 9.1 is covered by My Tickets, Home and the ticket header; pending: read replica) Reports: pipeline, SLA breaches by stage (from `sla_events`), at-risk, insurer outcomes; PM/Head dashboards (PRD 9.1/9.2), funnel (9.4) on a read replica
- [ ] **4.4** Inbound classifier v2 behind `MailClassifier` (LLM via Bedrock or Anthropic API - CTO decision), PII minimisation, prompt/output logging, eval set
- [~] **4.5** (done: malware scan before storage (port: dev EICAR / clamav INSTREAM; infected uploads 422, infected mail attachments dropped and sent to review), document access log (append-only) + Head view API, production boot checks, webhook signature whenever a secret is set + envelope checks + per-IP rate limit, local storage path containment + safe storage keys, `_local` route by stored key only; pending: retention/deletion jobs (needs retention periods, HLD s11 #9), external pen test) Security & compliance: virus scan on upload (block until clean), document access logging, retention/deletion jobs (DPDP), pen-test fixes, rate limits on webhooks
- [~] **4.6** (done: worker `ops-metrics` job every minute -> CloudWatch EMF (outbox lag / failing, job heartbeats + SLA sweep errors via `ops_heartbeats`, dead-lettered jobs per queue, Manual Review backlog, Copycat failures, BimaSetu inbound retrying / rejected), 21 alarms + dashboard in the CDK monitoring stack, runbook per alarm in `docs/runbooks/`; pending: X-Ray / OTel traces, mailbox connector health (shared email layer)) Observability: metrics + alarms (outbox lag, DLQ depth, unmatched queue size, Copycat failures, mailbox errors, SLA engine errors), runbooks in `docs/runbooks/`
- [ ] **4.7** Data migration of in-flight placements from spreadsheets/email (CLI importer)
- [ ] **4.8** `MESSAGING_DRIVER=aws` implementation (SQS, EventBridge Scheduler, PutEvents to Sahayak bus) if prod chooses AWS-native

## Phase 5+ - Architecture-plan extensions (post-V1, gated on CTO decisions - see ADR-0005)

- [ ] Quote extraction (Textract + LLM per-LOB schemas, confidence, review queue) → extends `quotes`
- [ ] In-house QCR generator implementing the Copycat port
- [ ] Integration gateway: insurer API adapters (`requestQuote/getQuote/bind/fetchPolicy`), portal tasks
- [ ] Config-driven rules engine (trigger/condition/action, A1-A10) + pause controls
- [ ] W10 payment, binding, policy capture and verification; Finance role; `placement.bound`
- [ ] Renewal kickoff (A10) - depends on where renewals start

---

## Conventions for every task

1. Read the FR/BR ids in the PRD for the task; put the ids in JSDoc of what you implement.
2. Domain rules = pure functions with Jest tests; services orchestrate; all ticket mutations via `TicketWorkflow.run`.
3. New table/column -> entity change + `npm run migration:generate -w @bimaplacement/api --name=<Name>`; never edit an applied migration.
4. New enum/label/DTO shared with the web -> `packages/contracts` then `npm run build:contracts`.
5. External side effects -> outbox row + idempotent `@QueueHandler`.
6. UI: follow `docs/design/UI-SPEC.md` labels, states and tokens; use design-system components; Title Case, no ALL CAPS, no em dashes in UI copy.
7. DoD: `npm run typecheck && npm test -w @bimaplacement/api` green, web builds, Swagger shows the endpoint, PLAN ticked, LLD API table status updated if it changed.
