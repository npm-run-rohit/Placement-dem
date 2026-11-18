import {
  CopycatStatus,
  OutcomeType,
  QcrSource,
  QcrStatus,
  QuoteDecision,
  Stage,
  ThreadStatus,
} from '@bimaplacement/contracts';

/**
 * Minimal, persistence-free view of a ticket used by the pure derivation functions
 * (status, SLA id, next action, desk counts). TicketWorkflow assembles it inside the
 * transaction; unit tests build it by hand. Mirrors the prototype's `c` object.
 */
export interface TicketSnapshot {
  stage: Stage;
  outcomeType: OutcomeType | null;
  panelLocked: boolean;
  activeRfqVersion: number;
  openRfqQueries: number; // unresolved queries on the active RFQ version
  threads: Array<{ id: string; insurerId: string; status: ThreadStatus; held: boolean; rfqVersion: number }>;
  quotes: Array<{ id: string; insurerId: string; rfqVersion: number; decision: QuoteDecision | null }>;
  draftQcr: { source: QcrSource; copycatStatus: CopycatStatus | null; hasFile: boolean } | null;
  latestReleasedQcr: { status: QcrStatus; releasedAt: Date } | null;
  openRevision: boolean;
  channelIsBimaSetu: boolean;
}
