# Mail send failures

**Alarm:** `placement-prod-mail-send-failures`. Insurer or RM mail failed to send after retries
(`FailedJobs{Queue=mail-outbound}`).

**Impact:** an RFQ, follow-up, reply or RM query did not reach the insurer or RM. The ticket thinks it was sent: the
thread clock and the follow-up ladder carry on.

## Check

List the failed jobs ([dead-letter-jobs](dead-letter-jobs.md)) and read `failedReason`:

- **`No Placement Manager mailbox for PLC-nnnn - not sending from another identity (M5)`:** the ticket owner has no
  mailbox. By design the system never sends as someone else.
- **Mailbox connector or provider errors:** expired delegation, quota, a rejected recipient. Sending will move to the
  shared email layer (see `.claude/context/decisions.md`). Until then, production runs the `dev` mailbox driver,
  which only logs.

## Fix

Fix the mailbox or owner, then retry the jobs. Retries are idempotent on the outbox id, so a mail that did go out is
not sent twice. Tell the PM which mails went out late, in case the insurer needs a nudge.
