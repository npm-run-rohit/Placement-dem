import { CopycatStatus, QcrSource, Stage, ThreadStatus, type NextActionView } from '@bimaplacement/contracts';
import type { TicketSnapshot } from './ticket-snapshot';
import { undecidedQuotes } from './status-deriver';

/**
 * "Next action" card + red tab dot + default tab (prototype plNextAction, UI-SPEC 3.3.11).
 * Thread-level breach detection needs live remaining minutes -> pass `breachedThreadInsurer`.
 */
export function nextAction(
  s: TicketSnapshot,
  opts: { breachedThreadInsurer?: string; pausedThreadInsurer?: string } = {},
): NextActionView | null {
  const via = s.channelIsBimaSetu ? 'BimaSetu' : 'RM';
  switch (s.stage) {
    case Stage.CLOSED:
      return null;
    case Stage.RFQ_REVIEW:
      return s.openRfqQueries > 0
        ? { label: 'Resolve the queries the RM answered', tab: 'rfq', tone: 'orange' }
        : { label: 'Review the RFQ - raise any queries to the RM, or validate', tab: 'rfq', tone: 'purple' };
    case Stage.AWAITING_RM:
      return { label: 'Waiting on RM response', tab: 'rfq', tone: 'orange' };
    case Stage.INSURER_SELECTION:
      return { label: 'Select insurers and send the RFQ', tab: 'insurers', tone: 'purple' };
    case Stage.MARKET:
    case Stage.QUOTE_REVIEW: {
      if (opts.pausedThreadInsurer)
        return {
          label: `Reply to ${opts.pausedThreadInsurer} clarification`,
          tab: 'threads',
          tone: 'orange',
        };
      const n = undecidedQuotes(s).length;
      if (n)
        return {
          label: `Review ${n} quote${n > 1 ? 's' : ''} awaiting your decision`,
          tab: 'quotes',
          tone: 'purple',
        };
      if (opts.breachedThreadInsurer)
        return { label: `${opts.breachedThreadInsurer} has breached SLA`, tab: 'threads', tone: 'red' };
      return { label: 'Monitor insurer responses', tab: 'threads', tone: 'neutral' };
    }
    case Stage.QCR_DRAFT: {
      const d = s.draftQcr;
      if (d && d.source === QcrSource.COPYCAT && d.copycatStatus === CopycatStatus.FAILED)
        return { label: 'QCR generation failed - retry with Copycat', tab: 'qcr', tone: 'red' };
      if (!d || d.source !== QcrSource.COPYCAT || d.copycatStatus === CopycatStatus.READY)
        return { label: `Check the quote rows and send the QCR to ${via}`, tab: 'qcr', tone: 'purple' };
      return { label: 'Copycat is generating the QCR', tab: 'qcr', tone: 'neutral' };
    }
    case Stage.REVISION_REQUESTED:
      return { label: 'Revision requested - act on what the RM asked for', tab: 'qcr', tone: 'orange' };
    case Stage.QCR_RELEASED:
      return undecidedQuotes(s).length
        ? { label: 'Late quote received - decide on the next QCR version', tab: 'qcr', tone: 'orange' }
        : { label: `Awaiting client decision via ${via}`, tab: 'qcr', tone: 'neutral' };
    default:
      return null;
  }
}

/** Threads that still receive automatic follow-ups (BR-039). */
export const followUpEligible = (status: ThreadStatus) =>
  ![
    ThreadStatus.DECLINED,
    ThreadStatus.NOT_APPLICABLE,
    ThreadStatus.QUOTE_USABLE,
    ThreadStatus.QUOTE_EXCLUDED,
  ].includes(status);
