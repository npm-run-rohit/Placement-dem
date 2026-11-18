import { OutcomeType, Phase, QcrSource, QuoteDecision, RevisionAsk, Stage, ThreadStatus } from './enums';

/** UI tone keys - map 1:1 to design tokens in apps/web/src/design-system/tokens.ts */
export type Tone = 'neutral' | 'purple' | 'orange' | 'green' | 'red' | 'blue' | 'amber';

export const STAGE_META: Record<Stage, { label: string; step: number; tone: Tone; phase: Phase }> = {
  [Stage.RFQ_REVIEW]: { label: 'RFQ Review', step: 0, tone: 'orange', phase: Phase.RFQ_VERIFICATION },
  [Stage.AWAITING_RM]: { label: 'RFQ Clarification', step: 0, tone: 'orange', phase: Phase.RFQ_VERIFICATION },
  [Stage.INSURER_SELECTION]: {
    label: 'Insurer Selection',
    step: 1,
    tone: 'blue',
    phase: Phase.INSURER_SELECTION,
  },
  [Stage.MARKET]: { label: 'Quote Collection', step: 2, tone: 'blue', phase: Phase.RFQ_PLACEMENT },
  [Stage.QUOTE_REVIEW]: { label: 'Quote Review', step: 3, tone: 'amber', phase: Phase.QUOTE_AND_QCR },
  [Stage.QCR_DRAFT]: { label: 'QCR Ready', step: 4, tone: 'blue', phase: Phase.QUOTE_AND_QCR },
  [Stage.QCR_RELEASED]: { label: 'QCR Released', step: 5, tone: 'green', phase: Phase.QUOTE_AND_QCR },
  [Stage.REVISION_REQUESTED]: {
    label: 'Revision Requested',
    step: 5,
    tone: 'orange',
    phase: Phase.QUOTE_AND_QCR,
  },
  [Stage.CLOSED]: { label: 'Closed', step: 6, tone: 'neutral', phase: Phase.TICKET_CLOSURE },
};

export const PHASES: Phase[] = [
  Phase.TICKET_INTAKE,
  Phase.RFQ_VERIFICATION,
  Phase.INSURER_SELECTION,
  Phase.RFQ_PLACEMENT,
  Phase.QUOTE_AND_QCR,
  Phase.TICKET_CLOSURE,
];

export const OUTCOME_META: Record<OutcomeType, { label: string; tone: Tone }> = {
  [OutcomeType.QUOTE_SELECTED]: { label: 'Quote selected', tone: 'green' },
  [OutcomeType.LOST]: { label: 'Lost', tone: 'red' },
  [OutcomeType.NO_APPETITE]: { label: 'No appetite', tone: 'red' },
};

export const THREAD_STATUS_META: Record<ThreadStatus, { label: string; tone: Tone; sub?: string }> = {
  [ThreadStatus.RFQ_SENT]: { label: 'Awaiting Insurer Response', tone: 'neutral' },
  [ThreadStatus.ACKNOWLEDGED]: { label: 'Awaiting Insurer Response', tone: 'blue', sub: 'acknowledged' },
  [ThreadStatus.INSURER_CLARIFICATION]: { label: 'Clarification Required', tone: 'orange' },
  [ThreadStatus.AWAITING_RM]: { label: 'Awaiting RM Information', tone: 'orange' },
  [ThreadStatus.QUOTE_RECEIVED]: { label: 'Quote Received', tone: 'blue' },
  [ThreadStatus.QUOTE_USABLE]: { label: 'Quote Usable', tone: 'green' },
  [ThreadStatus.QUOTE_CLARIFICATION]: { label: 'Quote Received', tone: 'orange', sub: 'needs clarification' },
  [ThreadStatus.QUOTE_EXCLUDED]: { label: 'Quote Received', tone: 'neutral', sub: 'excluded' },
  [ThreadStatus.DECLINED]: { label: 'Declined', tone: 'red' },
  [ThreadStatus.NOT_APPLICABLE]: { label: 'Not Applicable', tone: 'neutral' },
  [ThreadStatus.NO_RESPONSE]: { label: 'Awaiting Insurer Response', tone: 'neutral' },
};

export const QUOTE_DECISION_META: Record<QuoteDecision, { label: string; tone: Tone }> = {
  [QuoteDecision.USABLE]: { label: 'Usable', tone: 'green' },
  [QuoteDecision.CLARIFICATION]: { label: 'Needs clarification', tone: 'orange' },
  [QuoteDecision.EXCLUDED]: { label: 'Excluded from QCR', tone: 'neutral' },
  [QuoteDecision.SUPERSEDED]: { label: 'Superseded', tone: 'neutral' },
};

export const QCR_SOURCE_LABEL: Record<QcrSource, string> = {
  [QcrSource.COPYCAT]: 'Copycat',
  [QcrSource.MANUAL]: 'Manual',
  [QcrSource.SINGLE_QUOTE]: 'Single quote',
};

export const REVISION_ASK_LABEL: Record<RevisionAsk, string> = {
  [RevisionAsk.RERATE]: 'Re-rate',
  [RevisionAsk.DIFFERENT_INSURER]: 'A different insurer',
  [RevisionAsk.CHANGED_COVER]: 'Changed sum insured or cover',
  [RevisionAsk.REVISED_TERMS]: 'Revised terms',
};

/** Ticket number format PLC-nnnn (FR-200). */
export const TICKET_NO_PREFIX = 'PLC-';
export const formatTicketNo = (seq: number) => `${TICKET_NO_PREFIX}${String(seq).padStart(4, '0')}`;
/** Thread ref TH-nn - never reused on a ticket (FR-054). */
export const formatThreadRef = (seq: number) => `TH-${String(seq).padStart(2, '0')}`;
/** Mandate request ref MR-nn. */
export const formatMandateRequestRef = (seq: number) => `MR-${String(seq).padStart(2, '0')}`;
/** Copycat request id CC-<ticket>-V<qcr>-<attempt> (FR-238). */
export const formatCopycatRequestId = (ticketNo: string, qcrVersion: number, attempt: number) =>
  `CC-${ticketNo}-V${qcrVersion}-${attempt}`;
