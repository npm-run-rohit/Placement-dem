import { type OutcomeType, Stage } from './enums';

/**
 * Stage-level state machine. PlacementTicket is the only writer of stage (Placement core).
 * Every transition MUST go through TicketStateMachine.transition() on the API, which
 * validates against this table, writes the audit event and an outbox event.
 *
 * Derived from PRD 5.2 (status transitions) collapsed onto the stage model in 3.3,
 * plus the v1.7 BimaSetu revision round (revision_requested).
 */
export const STAGE_TRANSITIONS: Readonly<Record<Stage, readonly Stage[]>> = {
  [Stage.RFQ_REVIEW]: [Stage.AWAITING_RM, Stage.INSURER_SELECTION, Stage.CLOSED],
  [Stage.AWAITING_RM]: [Stage.RFQ_REVIEW, Stage.CLOSED],
  [Stage.INSURER_SELECTION]: [Stage.MARKET, Stage.CLOSED],
  [Stage.MARKET]: [Stage.QUOTE_REVIEW, Stage.QCR_DRAFT, Stage.CLOSED, Stage.RFQ_REVIEW],
  [Stage.QUOTE_REVIEW]: [Stage.MARKET, Stage.QCR_DRAFT, Stage.CLOSED, Stage.RFQ_REVIEW],
  [Stage.QCR_DRAFT]: [Stage.QCR_RELEASED, Stage.QUOTE_REVIEW, Stage.MARKET, Stage.CLOSED, Stage.RFQ_REVIEW],
  [Stage.QCR_RELEASED]: [
    Stage.REVISION_REQUESTED,
    Stage.QCR_DRAFT,
    Stage.MARKET,
    Stage.RFQ_REVIEW,
    Stage.CLOSED,
  ],
  [Stage.REVISION_REQUESTED]: [Stage.MARKET, Stage.QCR_DRAFT, Stage.RFQ_REVIEW, Stage.CLOSED],
  [Stage.CLOSED]: [],
};

export const TERMINAL_STAGES: readonly Stage[] = [Stage.CLOSED];

export function canTransition(from: Stage, to: Stage): boolean {
  if (from === to) return true;
  return STAGE_TRANSITIONS[from].includes(to);
}

/** Commands that move a ticket. Used as the `reason` on transition + audit. */
export enum TicketCommand {
  CREATE = 'create',
  RAISE_RM_QUERIES = 'raise_rm_queries',
  RM_ANSWERED = 'rm_answered',
  VALIDATE_RFQ = 'validate_rfq',
  FLOAT_RFQ = 'float_rfq',
  QUOTE_RECEIVED = 'quote_received',
  QUOTE_DECIDED = 'quote_decided',
  THRESHOLD_REACHED = 'threshold_reached',
  EARLY_RELEASE = 'early_release',
  UPLOAD_QCR = 'upload_qcr',
  RELEASE_QCR = 'release_qcr',
  NEW_QCR_VERSION = 'new_qcr_version',
  REVISION_REQUESTED = 'revision_requested',
  RESTART_THREADS = 'restart_threads',
  ADD_INSURER_AFTER_FLOAT = 'add_insurer_after_float',
  NEW_RFQ_VERSION = 'new_rfq_version',
  CLOSE = 'close',
}

export interface TerminalOutcome {
  type: OutcomeType;
  reason?: string;
}
