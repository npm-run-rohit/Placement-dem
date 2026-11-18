import {
  CopycatStatus,
  InternalStatus,
  OutcomeType,
  QcrSource,
  RmFacingStatus,
  Stage,
  ThreadStatus,
} from '@bimaplacement/contracts';
import type { TicketSnapshot } from './ticket-snapshot';

export interface DerivedStatus {
  internal: InternalStatus;
  rm: RmFacingStatus;
}

export const liveQuotes = (s: TicketSnapshot) =>
  s.quotes.filter((q) => q.rfqVersion === s.activeRfqVersion && q.decision !== 'superseded');

export const undecidedQuotes = (s: TicketSnapshot) => liveQuotes(s).filter((q) => q.decision === null);

/** Distinct insurer COMPANIES with a usable quote on the active RFQ (BR-055, BR-115, BR-123). */
export const usableInsurerCount = (s: TicketSnapshot) =>
  new Set(
    liveQuotes(s)
      .filter((q) => q.decision === 'usable')
      .map((q) => q.insurerId),
  ).size;

/**
 * Layered status (PRD 5.1 / 5.3) - mirrors prototype plCaseStatus().
 * Internal status is shown on the workbench; RM-facing status is synced to BimaSetu.
 */
export function deriveStatus(s: TicketSnapshot): DerivedStatus {
  if (s.stage === Stage.CLOSED) {
    switch (s.outcomeType) {
      case OutcomeType.QUOTE_SELECTED:
        return { internal: InternalStatus.QUOTE_SELECTED, rm: RmFacingStatus.QUOTE_SELECTED };
      case OutcomeType.LOST:
        return { internal: InternalStatus.LOST, rm: RmFacingStatus.CLOSED };
      default:
        return { internal: InternalStatus.NO_APPETITE, rm: RmFacingStatus.CLOSED };
    }
  }
  const progress = RmFacingStatus.PLACEMENT_IN_PROGRESS;
  switch (s.stage) {
    case Stage.RFQ_REVIEW:
      return {
        internal: InternalStatus.READY_FOR_PLACEMENT,
        rm: s.activeRfqVersion > 1 ? RmFacingStatus.UPDATED_PLACEMENT_IN_PROGRESS : progress,
      };
    case Stage.AWAITING_RM:
      return { internal: InternalStatus.RFQ_CLARIFICATION_REQUIRED, rm: RmFacingStatus.ACTION_REQUIRED };
    case Stage.INSURER_SELECTION:
      return {
        internal: s.panelLocked ? InternalStatus.INSURERS_APPROVED : InternalStatus.INSURER_SELECTION_PENDING,
        rm: progress,
      };
    case Stage.MARKET:
    case Stage.QUOTE_REVIEW: {
      const activeThreads = s.threads.filter((t) => t.rfqVersion === s.activeRfqVersion);
      if (activeThreads.some((t) => t.status === ThreadStatus.AWAITING_RM))
        return { internal: InternalStatus.AWAITING_RM_INFORMATION, rm: RmFacingStatus.ACTION_REQUIRED };
      if (undecidedQuotes(s).length) return { internal: InternalStatus.QUOTE_REVIEW_REQUIRED, rm: progress };
      return { internal: InternalStatus.QUOTE_COLLECTION_IN_PROGRESS, rm: progress };
    }
    case Stage.QCR_DRAFT: {
      const d = s.draftQcr;
      if (!d || d.source !== QcrSource.COPYCAT || d.copycatStatus === CopycatStatus.READY)
        return { internal: InternalStatus.PENDING_PLACEMENT_RELEASE, rm: progress };
      if (d.copycatStatus === CopycatStatus.FAILED)
        return { internal: InternalStatus.QCR_GENERATION_FAILED, rm: progress };
      return { internal: InternalStatus.QCR_GENERATION_IN_PROGRESS, rm: progress };
    }
    case Stage.QCR_RELEASED:
      return { internal: InternalStatus.PENDING_RM_REVIEW, rm: RmFacingStatus.QCR_READY };
    case Stage.REVISION_REQUESTED:
      return { internal: InternalStatus.REVISION_REQUESTED, rm: progress };
    default:
      return { internal: InternalStatus.READY_FOR_PLACEMENT, rm: progress };
  }
}
