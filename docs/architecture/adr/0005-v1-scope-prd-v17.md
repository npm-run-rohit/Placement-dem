# ADR-0005: V1 scope follows PRD v1.7; Architecture-plan extras are later phases

- Status: Accepted
- Context: The Architecture & Build Plan (14 Oct) includes OCR/LLM quote extraction, an in-house QCR generator, insurer API/portal adapters, payment/bind/policy and a rules engine. PRD v1.7 (8 Oct, business-signed, matching the prototype) puts all of these out of scope for V1 (Copycat builds the QCR; email only; Placement ends at Quote selected).
- Decision: Build V1 to PRD v1.7. Keep seams: quote model can later hold extracted fields; Copycat port can be implemented in-house; integration gateway adapter interface reserved; `placement.quote_selected` event is the hand-off for W10.
- Consequences: PLAN.md Phases 0-4 = V1; Phase 5+ = Architecture-plan extensions, gated on CTO decisions listed in HLD s11.
