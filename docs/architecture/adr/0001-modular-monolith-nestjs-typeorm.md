# ADR-0001: Modular monolith on NestJS + TypeORM + PostgreSQL

- Status: Accepted (29 Oct 2026)
- Context: Architecture plan asked the CTO "match BimaSetu's stack, or FastAPI vs NestJS". BimaKavach's other products run NestJS + TypeORM on Postgres; the team is small; the domain is workflow-heavy with strong consistency needs (one writer of ticket state, audit in the same transaction).
- Decision: One NestJS codebase with strict module boundaries, two processes (HTTP API, worker). TypeORM 0.3 entities + generated migrations (never `synchronize`). Pin Nest 11 / TypeORM 0.3 to match the legacy services; upgrade together with the rest of the suite.
- Consequences: shared types end to end via `@bimaplacement/contracts`; cross-module calls are in-process; the worker can be split into its own service (integration gateway, extraction) later because every integration already goes through queues + ports. Module boundaries must be policed in review (no writing other modules' tables except through `TicketWorkflow` and the snapshot loader).
