import { type BusinessType } from './enums';

/**
 * BimaSetu <-> BimaPlacement interface (PRD section 4A).
 * Every message carries a unique id, is processed exactly once, retried on failure,
 * and recorded on the ticket timeline (FR-291).
 * NOTE: the wire format below is our proposal; confirm with the BimaSetu team (epics F7/F8).
 */
export enum BimaSetuInboundType {
  FLOAT = 'float',
  QUERY_ANSWER = 'query_answer',
  REVISION_REQUEST = 'revision_request',
  CLIENT_CONFIRMATION = 'client_confirmation',
  LINE_LOST = 'line_lost',
  /** Mandate replies may arrive via BimaSetu instead of mail - OPEN. */
  MANDATE_RESPONSE = 'mandate_response',
}

export enum BimaSetuOutboundType {
  TICKET_CREATED = 'ticket_created',
  FLOAT_REJECTED = 'float_rejected',
  STAGE_CHANGED = 'stage_changed',
  QUERY_RAISED = 'query_raised',
  QCR_ROUND = 'qcr_round',
  CLOSED_NO_APPETITE = 'closed_no_appetite',
}

export interface BimaSetuEnvelope<T = unknown> {
  messageId: string; // unique, used for dedupe (inbox table)
  type: BimaSetuInboundType | BimaSetuOutboundType;
  occurredAt: string; // ISO
  lineRef: string; // BimaSetu line reference
  ticketNo?: string; // PLC-nnnn once known
  payload: T;
}

export interface FloatPayload {
  lineRef: string;
  productType: string; // as BimaSetu sends it (FR-282); mapped to ProductTypeCode
  businessName: string;
  businessType: BusinessType;
  industryType: string;
  rfq: {
    linkUrl?: string | null;
    excel?: { fileName: string; downloadUrl: string } | null;
    renderedViewUrl?: string | null;
  };
  exclusiveMandate: boolean;
  targetPremium?: number | null;
  noteToPlacement?: string | null;
  renewalDate?: string | null;
  incumbentInsurer?: string | null;
  rm: { id: string; name: string; email: string };
  client: { id: string; name: string; spoc?: string | null };
  opportunityId?: string | null;
}

export interface QueryAnswerPayload {
  queryRef: string; // Q-nn (RFQ query) or IR-nn (an insurer's information request; never the thread ref, FR-290)
  answer: string;
  answeredBy: { id: string; name: string };
}

export interface RevisionRequestPayload {
  qcrRound: number;
  by: 'client' | 'us';
  reason: string;
  asks: Array<'rerate' | 'insurer' | 'cover' | 'terms'>;
}

export interface ClientConfirmationPayload {
  qcrRound: number;
  quoteRowId: string; // row id we sent in qcr_round
}

export interface LineLostPayload {
  reason?: string;
}

export interface QcrRoundPayload {
  round: number;
  qcrVersion: number;
  qcrFile: { fileName: string; downloadUrl: string };
  requestedAt: string;
  deliveredAt: string;
  earlyReleaseReason?: string | null;
  notice?: string | null; // e.g. no-appetite zero-row notice (FR-289)
  rows: Array<{
    rowId: string;
    insurer: string;
    premium: number | null;
    sumInsured: string | null;
    validityDate: string | null;
    termsNote: string | null;
  }>;
}
