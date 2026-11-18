# ADR-0003: BimaSahayak is the platform provider (identity, directory, notifications, shell, event bus)

- Status: Proposed - needs the Sahayak team's confirmation of contracts
- Context: BimaPlacement joins a suite (BimaSetu, BimaEndorse, Claims, Ops) under the BimaSahayak umbrella. The prototype already shows one login and a product switcher.
- Decision: BimaPlacement does not implement its own login, user directory or channel delivery. It verifies Sahayak-issued JWTs (JWKS), keeps a local `users` projection for foreign keys, emits notification intents to Sahayak, publishes `placement.*` events to the shared bus, and ships its web app as a module mounted by the Sahayak shell at `/placement`.
- Consequences: Contracts are isolated in `integrations/sahayak/*` and `apps/web/src/lib/auth.ts`; `AUTH_MODE=dev` keeps local work unblocked. Until Sahayak confirms claim names, roles are read from a `roles` claim.
