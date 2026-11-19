# BimaPlacement

Placement Automation Platform for BimaKavach - part of the **BimaSahayak** suite.
RFQ intake (BimaSetu float or manual) -> RFQ review -> insurer selection -> independent insurer threads ->
quotes -> Copycat QCR -> Send to BimaSetu -> client decision.

| | |
|---|---|
| Backend | NestJS 11, TypeScript, TypeORM 0.3, PostgreSQL 16, BullMQ/Redis (or AWS SQS/EventBridge via ports) |
| Frontend | React 19, Next.js 16 (Turbopack, static export), Tailwind, react-query, lucide-react |
| Shared | `@bimaplacement/contracts` (enums, state machine, SLA seeds, DTOs) |

## Quick start

```bash
npm install
npm run db:up                       # docker: postgres, redis, mailpit (UI http://localhost:8025)
npm run build:contracts             # after any change in packages/contracts
cp apps/api/.env.example apps/api/.env
npm run migration:run && npm run seed
npm run seed:fixtures               # optional, dev only: the prototype's 17 sample tickets (empty DB)
npm run dev:api      # :4000  (Swagger /api/v1/docs)
npm run dev:worker   # queue handlers, outbox relay, SLA sweeper
npm run dev:web      # :5173  (Next.js + Turbopack, proxies /api to :4000)
```

Tests: `npm run typecheck && npm test -w @bimaplacement/api` (unit) and `npm run test:e2e` (needs `db:up`).
Production web build: `npm run build -w @bimaplacement/web` (static files in `apps/web/dist`).

## Docs

- [Build status](./docs/STATUS.md) - what works today, what is pending and why
- [Email layer contract](./docs/integration/EMAIL-LAYER-CONTRACT.md) - signed send and delivery webhook between Placement and the shared email layer
- [BimaSetu integration guide](./docs/integration/BIMASETU-INTEGRATION.md) - message contract, webhook, open points (for the BimaSetu team)
- [PLAN.md](./PLAN.md) - phased build plan (Claude Code works from this)
- [CLAUDE.md](./CLAUDE.md) - rules and commands for Claude Code
- [HLD](./docs/architecture/HLD.md) · [LLD](./docs/architecture/LLD.md) · [ADRs](./docs/architecture/adr)
- [PRD v1.7](./docs/product/PRD-v1.7.md) · [Architecture & Build Plan](./docs/product/Architecture-and-Build-Plan.md) (originals in `docs/product/source/`)
- [UI-SPEC](./docs/design/UI-SPEC.md) - screens, components, tokens, data model extracted from the designer prototype
- `docs/reference/` - the designer's Placement reports (BimaSetu, mandate, target premium, single product, overhaul, audit)

## Layout

```
apps/api      NestJS API + worker (src/modules, src/integrations, src/infrastructure)
apps/web      React app (src/design-system, src/shell, src/features)
packages/contracts
docs/         architecture, product, design, integration, reference, STATUS.md
infra/        docker-compose (local), cdk (AWS, see infra/cdk/README.md)
```
