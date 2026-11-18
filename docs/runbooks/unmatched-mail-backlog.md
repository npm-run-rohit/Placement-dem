# Unmatched mail backlog

**Alarm:** `placement-prod-unmatched-mail-backlog`. 25 or more inbound mails have sat in Manual Review > Unmatched
for an hour (`UnmatchedMailPending`). The threshold is a starting guess; tune it in `monitoring-stack.ts` once real
volumes are known.

**Impact:** insurer quotes, declines and questions in those mails are not on any ticket yet. Thread clocks keep
running, and follow-ups may go to insurers who have already replied.

## Check

1. Open Manual Review > Unmatched. Is it one sender, or one kind of mail (out-of-office replies, newsletters)?
2. A sudden jump after a deploy points at mapping (FR-070: reply chain, then subject ref, then sender). Check that
   outbound subjects still carry `[PLC-nnnn | TH-nn]` and that the mail provider keeps the reply headers.

## Fix

- Ops: the Placement Head (or a PM) maps or dismisses them in Manual Review.
- A mapping regression: fix it, and new mails map again. Mails already in the queue stay there for a person to map.
