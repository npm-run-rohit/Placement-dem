# Mail send failures

**Alarms:**

- `placement-prod-mail-send-failures`: insurer or RM mail failed to send after retries
  (`FailedJobs{Queue=mail-outbound}`).
- `placement-prod-mail-not-sent`: a mail was stored as failed without retries (`MailNotSent1h`): the PM's Gmail is
  not connected for Placement (`MAILBOX_NOT_CONNECTED`), or Gmail refused the mail (`SEND_REJECTED`, e.g. a wrong
  address). The owner was notified.

**Impact:** an RFQ, follow-up, reply or RM query did not reach the insurer or RM. The ticket thinks it was sent: the
thread clock and the follow-up ladder carry on.

## Check

List the failed jobs ([dead-letter-jobs](dead-letter-jobs.md)) and read `failedReason`:

- **`No Placement Manager mailbox for PLC-nnnn - not sending from another identity (M5)`:** the ticket owner has no
  mailbox. By design the system never sends as someone else.
- **Mailbox connector or provider errors:** expired delegation, quota, a rejected recipient. Sending will move to the
  shared email layer (see `.claude/context/decisions.md`). Until then, production runs the `dev` mailbox driver,
  which only logs.

For `mail-not-sent`, the failed rows:

```sql
SELECT t.ticket_no, m.from_address, m.subject, m.error, m.at FROM mail_messages m
  JOIN placement_tickets t ON t.id = m.ticket_id
 WHERE m.direction = 'outbound' AND m.status = 'failed' AND m.at > now() - interval '1 day' ORDER BY m.at DESC;
```

## Fix

- **`mail-not-sent`:** the PM connects Gmail for Placement (Admin > Mailboxes shows who has not), or the address is
  corrected. Then the owner or the Placement Head presses **Resend** on the failed mail in the ticket's Mail Trail
  (`POST /tickets/:ticketId/mails/:mailId/resend`). It sends the same mail again on the same conversation; the
  failed row stays on the trail.
- **`mail-send-failures`:** fix the mailbox or owner, then retry the jobs. Retries are idempotent on the outbox id, so a mail that did go out is
not sent twice. Tell the PM which mails went out late, in case the insurer needs a nudge.
