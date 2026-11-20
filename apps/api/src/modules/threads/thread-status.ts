import { QuoteDecision, ThreadStatus } from '@bimaplacement/contracts';

/**
 * An insurer question we have not replied to (FR-063): the thread keeps this status, and its held clock,
 * when a quote arrives or is decided meanwhile; our reply moves it on (FR-064).
 */
export function hasOpenQuestion(status: ThreadStatus): boolean {
  return status === ThreadStatus.INSURER_CLARIFICATION || status === ThreadStatus.AWAITING_RM;
}

/**
 * Status after our reply closes an open question (FR-064). A quote that came in meanwhile shows again when it still
 * needs the PM (Quote Received / Quote Clarification) or counts (Quote Usable); otherwise the thread is waiting on
 * the insurer again, so it goes back to Acknowledged and stays on the follow-up ladder.
 */
export function statusAfterReply(
  quotes: { version: number; decision: QuoteDecision | null }[],
): ThreadStatus {
  const live = quotes.filter((q) => q.decision !== QuoteDecision.SUPERSEDED);
  const latest = live.reduce<(typeof live)[number] | undefined>(
    (a, q) => (!a || q.version > a.version ? q : a),
    undefined,
  );
  if (latest && (latest.decision === null || latest.decision === QuoteDecision.CLARIFICATION))
    return statusForQuote(latest.decision);
  if (live.some((q) => q.decision === QuoteDecision.USABLE)) return ThreadStatus.QUOTE_USABLE;
  return ThreadStatus.ACKNOWLEDGED;
}

/** Thread status a quote puts the thread in (M8: Quote Received / Quote Usable / needs clarification / excluded). */
export function statusForQuote(decision: QuoteDecision | null): ThreadStatus {
  switch (decision) {
    case QuoteDecision.USABLE:
      return ThreadStatus.QUOTE_USABLE;
    case QuoteDecision.CLARIFICATION:
      return ThreadStatus.QUOTE_CLARIFICATION;
    case QuoteDecision.EXCLUDED:
      return ThreadStatus.QUOTE_EXCLUDED;
    default:
      return ThreadStatus.QUOTE_RECEIVED;
  }
}
