# CLAUDE.md - BimaPlacement

BimaPlacement is BimaKavach's Placement Workbench (RFQ -> insurer threads -> quotes -> QCR -> client decision),
a product in the **BimaSahayak** suite next to BimaSetu (RM CRM), BimaEndorse, Claims and Ops.
Read, in order: `PLAN.md` (what to do next) -> `docs/architecture/LLD.md` (how) -> `docs/architecture/HLD.md` (why)
-> `docs/product/PRD-v1.7.md` (the business contract, FR/BR ids) -> `docs/design/UI-SPEC.md` (screens, labels, tokens).

## Commands

```bash
npm install                                   # all workspaces
npm run db:up                                 # postgres 16 + redis 7 + mailpit (docker compose)
npm run build:contracts                       # after ANY change in packages/contracts
cp apps/api/.env.example apps/api/.env        # AUTH_MODE=dev, mocks for BimaSetu/Copycat/mailbox
npm run migration:run && npm run seed         # schema + PRD master defaults
npm run seed:fixtures                         # DEV ONLY: mock insurers + the prototype's 17 tickets (PLC-1001..1017 = prototype 1024..1040), empty DB
npm run dev:api                               # http://localhost:4000/api/v1 (Swagger: /api/v1/docs)
npm run dev:worker                            # queue handlers, outbox relay, SLA sweeper
npm run dev:web                               # http://localhost:5173 (proxies /api)
npm run typecheck && npm test -w @bimaplacement/api
npm run lint && npm run format:check           # ESLint + Prettier (both run in CI); `npm run format` fixes formatting
npm run test:e2e                              # needs db:up; recreates placement_e2e + flushes Redis db 15 each run
npm run migration:generate -w @bimaplacement/api --name=AddSomething
```

Dev auth: API accepts `x-dev-user: email|Name|role1,role2` when `AUTH_MODE=dev`
(roles: `placement_manager`, `placement_head`, `placement_admin`, `rm`). The web app sends `NEXT_PUBLIC_DEV_USER`.
Dev simulators (replace the prototype's amber "Simulate" blocks): `POST /api/v1/dev/...` - see `modules/dev/dev.controller.ts`.

## Architecture rules (do not break)

1. **Only `TicketWorkflow.run()` mutates a ticket** (stage, statuses, SLA clock, owner, outcome). It locks the row,
   validates transitions (`packages/contracts/src/state-machine.ts`), re-derives status, reconciles the single SLA
   clock and writes audit + outbox in the same transaction. Use `ctx.moveTo`, `ctx.audit`, `ctx.outbox`.
2. **No external calls inside a DB transaction.** Write an outbox row; a `@QueueHandler` does the call. Handlers are idempotent (jobId = outbox id / message id / Copycat request id).
3. **Business time only** for SLAs (`common/time/business-calendar.ts`, 540 BM/day, IST, holidays). External clocks never count as breaches.
4. **Layered status**: thread/quote/QCR statuses never overwrite the ticket; derive ticket status with `deriveStatus()`.
5. **Immutable history**: released QCRs, floated RFQ versions, audit/thread/SLA events and master change log are append-only (DB triggers). Masters are retired, never deleted.
6. Domain code throws `DomainError` (never `HttpException`). Guards = `DomainError.guard('message')` -> 422.
7. Shared enums/labels/DTOs live in `@bimaplacement/contracts`. Persisted enum values are text - never rename without a migration.
8. External systems are behind ports: messaging (bullmq|aws), storage (local|s3), mailbox (dev|gmail|graph), Copycat (mock|live), BimaSetu (mock|live), identity (dev|sahayak). Never import an SDK from a domain module.
9. Never send insurer documents, insurer lists or thread details to BimaSetu (FR-290). Never send mail from an identity other than the assigned PM (M5).
10. Do not invent business data (insurers, POCs, appetite, holidays, template wording). Seed only PRD values; mock data goes in dev fixtures, labelled as such.

## Conventions

- NestJS module per bounded area under `apps/api/src/modules`; pure logic in plain `.ts` files with `*.spec.ts` beside them.
- Reference PRD ids (FR-xxx / BR-xxx) in JSDoc of the code that implements them.
- Entities: snake_case columns, `timestamptz`, money `numeric(14,2)` with `numericTransformer`, jsonb for snapshots.
- TypeORM query builder: use **property paths** (`t.receivedAt`) in `orderBy` when combined with joins + skip/take.
- UI: tokens in `apps/web/tailwind.config.ts`; components in `apps/web/src/design-system`; follow UI-SPEC labels exactly.
  Purple = primary action (never status). Title Case labels, never ALL CAPS, no em dashes in UI copy, tabular numbers.
  Where UI-SPEC spells a label in sentence case ("Mark resolved", "Log client decision"), UI-SPEC wins (Rohit, 2026-11-02).
  Rail on the right; "Placement Manager" in the header = ticket owner.
- Commit messages: `feat(threads): hold thread clock for RM info (FR-063)`.
- **No AI attribution:** never add `Co-Authored-By: Claude ...` (or any Claude/Anthropic trailer, "Generated with Claude Code" line or session link) to commits, PR descriptions or tags. Nothing pushed to the remote may carry one; strip it from unpushed commits before pushing.

## Where things are

| Need | Look at |
|---|---|
| Stage transitions | `packages/contracts/src/state-machine.ts` |
| Status / SLA / next action derivation | `apps/api/src/modules/tickets/domain/*` |
| Unit of work | `apps/api/src/modules/tickets/ticket-workflow.service.ts` |
| SLA config cache, matrix | `apps/api/src/modules/sla/*` |
| Eligibility (Do Not Float, rollover incumbent) | `apps/api/src/modules/insurers/eligibility.ts` |
| Outbox + relay | `apps/api/src/infrastructure/outbox/*` |
| Queue handlers | grep `@QueueHandler(` |
| BimaSetu contract | `packages/contracts/src/bimasetu.ts`, `apps/api/src/integrations/bimasetu/*` |
| Design reference | `docs/design/UI-SPEC.md`, `docs/design/DESIGN-SYSTEM.prototype.md`, `../reference/bimaendorse-prototype/prototype.jsx` (Placement code is lines ~9950-20900) |

## Open questions (ask the user before guessing)

Sahayak token/shell contract · BimaSetu wire format + webhooks · Copycat API · PM mailbox provider/delegation ·
LLM provider. See HLD s11. Decided 2026-11-02: PMs see all non-escalated team tickets (FR-208), BimaSetu floats
go to the Placement Head, no `no_response` state is shown.
