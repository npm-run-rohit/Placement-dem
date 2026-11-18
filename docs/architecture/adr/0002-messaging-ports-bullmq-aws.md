# ADR-0002: Messaging behind ports - BullMQ/Redis locally, AWS (SQS, EventBridge, Scheduler) as an alternative driver

- Status: Accepted
- Context: The Architecture plan specifies EventBridge + SQS + EventBridge Scheduler. Local development and tests need something light; BimaKavach may already run Redis.
- Decision: Domain code depends on `JobQueue`, `Scheduler`, `EventPublisher` ports and `@QueueHandler` classes. `MESSAGING_DRIVER=bullmq` (implemented) or `aws` (stubbed). All external effects go through a transactional outbox; all handlers are idempotent.
- Consequences: Production can start on ElastiCache + BullMQ and switch to SQS without touching domain code. Domain events for sibling products always go to the BimaSahayak bus via `EventPublisher` (log publisher in dev).
