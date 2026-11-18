import { CopycatStatus, QcrSource, SlaId, Stage, ThreadStatus } from '@bimaplacement/contracts';
import type { TicketSnapshot } from './ticket-snapshot';
import { undecidedQuotes } from './status-deriver';

/**
 * Which single ticket clock runs now (FR-222, PRD 3.3) - mirrors prototype plSlaIdOf().
 * When the id changes, TicketWorkflow re-anchors the clock at "now" with the full target.
 */
export function resolveTicketSlaId(s: TicketSnapshot): SlaId | null {
  switch (s.stage) {
    case Stage.CLOSED:
      return null;
    case Stage.RFQ_REVIEW:
      return SlaId.SLA_02;
    case Stage.AWAITING_RM:
      return SlaId.SLA_03;
    case Stage.INSURER_SELECTION:
      return s.panelLocked ? SlaId.SLA_05 : SlaId.SLA_04;
    case Stage.QCR_RELEASED:
      return SlaId.SLA_14;
    case Stage.REVISION_REQUESTED:
      return SlaId.SLA_17;
    case Stage.QCR_DRAFT: {
      const d = s.draftQcr;
      const ready = !d || d.source !== QcrSource.COPYCAT || d.copycatStatus === CopycatStatus.READY;
      return ready ? SlaId.SLA_12 : SlaId.SLA_11;
    }
    case Stage.MARKET:
    case Stage.QUOTE_REVIEW: {
      if (s.threads.some((t) => t.rfqVersion === s.activeRfqVersion && t.status === ThreadStatus.AWAITING_RM))
        return SlaId.SLA_03;
      if (undecidedQuotes(s).length) return SlaId.SLA_10;
      return SlaId.SLA_06;
    }
    default:
      return null;
  }
}
