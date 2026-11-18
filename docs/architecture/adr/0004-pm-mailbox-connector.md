# ADR-0004: Insurer email through the assigned PM's mailbox (port), SES plus-addressing as an alternative

- Status: Proposed
- Context: PRD (FR-166..171, BR-032) requires mail to go out FROM the assigned PM's work mailbox and replies to be read from it. The Architecture plan proposed SES inbound with per-placement plus-addressing.
- Decision: Implement `MailboxConnector` with a Google Workspace adapter (Gmail API, domain-wide delegation; push via Pub/Sub or polling) because staff identity is Google Workspace. Keep every message mappable by subject `[PLC-nnnn | TH-nn]` + provider thread ids. An SES plus-address adapter can implement the same port if delegation is not allowed.
- Consequences: Requires a Workspace admin to grant delegation scopes; connector health must be visible (FR-188) and the system must never silently send from another identity (M5 validation). Reassignment changes the sender for future mails only.
