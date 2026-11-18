/**
 * Domain vocabulary for BimaPlacement.
 * Source of truth: Placement Automation PRD v1.7 (sections 3.3, 5, Appendix C/E)
 * cross-checked against the designer prototype (prototype.jsx, Pl* code).
 * Values are persisted in Postgres as text - never rename a value without a migration.
 */

/** Ticket stage: decides the default tab and which SLA clock runs (PRD 3.3). */
export enum Stage {
  RFQ_REVIEW = 'rfq_review',
  AWAITING_RM = 'awaiting_rm',
  INSURER_SELECTION = 'insurer_selection',
  MARKET = 'market',
  QUOTE_REVIEW = 'quote_review',
  QCR_DRAFT = 'qcr_draft',
  QCR_RELEASED = 'qcr_released',
  /** BimaSetu revision request opened a new round (PRD 4A, prototype stage). */
  REVISION_REQUESTED = 'revision_requested',
  CLOSED = 'closed',
}

/** Internal (Placement-facing) status catalogue - PRD 5.1. Derived, never set directly. */
export enum InternalStatus {
  RFQ_RECEIVED = 'RFQ Received',
  RFQ_CLARIFICATION_REQUIRED = 'RFQ Clarification Required',
  READY_FOR_PLACEMENT = 'Ready for Placement',
  INSURER_SELECTION_PENDING = 'Insurer Selection Pending',
  INSURERS_APPROVED = 'Insurers Approved',
  RFQ_FLOATED = 'RFQ Floated',
  QUOTE_COLLECTION_IN_PROGRESS = 'Quote Collection In Progress',
  AWAITING_RM_INFORMATION = 'Awaiting RM Information',
  QUOTE_REVIEW_REQUIRED = 'Quote Review Required',
  QCR_GENERATION_IN_PROGRESS = 'QCR Generation In Progress',
  QCR_GENERATION_FAILED = 'QCR Generation Failed',
  PENDING_PLACEMENT_RELEASE = 'Pending Placement Release',
  PENDING_RM_REVIEW = 'Pending RM Review',
  REVISION_REQUESTED = 'Revision Requested',
  QUOTE_SELECTED = 'Quote Selected',
  LOST = 'Lost',
  NO_APPETITE = 'No appetite',
}

/** RM-facing status shown on the BimaSetu line (PRD 5.1). */
export enum RmFacingStatus {
  RFQ_SUBMITTED = 'RFQ Submitted',
  ACTION_REQUIRED = 'Action Required',
  PLACEMENT_IN_PROGRESS = 'Placement In Progress',
  UPDATED_PLACEMENT_IN_PROGRESS = 'Updated Placement In Progress',
  QCR_READY = 'QCR Ready',
  AWAITING_CLIENT_DECISION = 'Awaiting Client Decision',
  QUOTE_SELECTED = 'Quote Selected',
  CLOSED = 'Closed',
}

/** Six overview phases (PL_PHASES). */
export enum Phase {
  TICKET_INTAKE = 'Ticket Intake',
  RFQ_VERIFICATION = 'RFQ Verification',
  INSURER_SELECTION = 'Insurer Selection',
  RFQ_PLACEMENT = 'RFQ Placement',
  QUOTE_AND_QCR = 'Quote & QCR Generation',
  TICKET_CLOSURE = 'Ticket Closure',
}

export enum OutcomeType {
  QUOTE_SELECTED = 'quote_selected',
  LOST = 'lost',
  NO_APPETITE = 'no_appetite',
}

export enum Channel {
  BIMASETU = 'bimasetu',
  MANUAL = 'manual',
}

export enum BusinessType {
  NEW = 'New',
  RENEWAL = 'Renewal',
  ROLLOVER = 'Rollover',
}

export enum Urgency {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export enum RiskTier {
  PREFERRED = 'Preferred',
  NON_PREFERRED = 'Non-preferred',
}

export enum ProductGroup {
  EB = 'EB',
  LIABILITY = 'Liability',
  PNC = 'P&C',
}

/** Timing LOB used by the SLA-06 quote-collection matrix (PRD 8.3). */
export enum TimingLob {
  PROPERTY = 'Property',
  MARINE = 'Marine',
  CAR_EAR = 'CAR-EAR',
  EB = 'EB',
  LIABILITY = 'Liability',
  LIABILITY_CRIME = 'Liability - Crime',
}

/** Column of the SLA-06 matrix. */
export enum QuoteTargetScenario {
  PREFERRED = 'preferred',
  NON_PREFERRED = 'nonPreferred',
  RENEWAL = 'renewal',
}

export enum ProductTypeCode {
  GMC = 'GMC',
  GPA = 'GPA',
  GTL = 'GTL',
  CGL = 'CGL',
  DNO = 'DNO',
  PI_ENGG = 'PI_ENGG',
  PI_TECH = 'PI_TECH',
  CRIME = 'CRIME',
  PL_ACT = 'PL_ACT',
  PL_GEN = 'PL_GEN',
  WC = 'WC',
  FIRE_FACTORY = 'FIRE_FACTORY',
  FIRE_GODOWN = 'FIRE_GODOWN',
  IAR = 'IAR',
  BURGLARY = 'BURGLARY',
  MBD_EEP = 'MBD_EEP',
  CAR = 'CAR',
  EAR = 'EAR',
  BGR = 'BGR',
  MARINE_OPEN = 'MARINE_OPEN',
  MARINE_STOP = 'MARINE_STOP',
}

export enum RfqStatus {
  IN_REVIEW = 'in_review',
  VALIDATED = 'validated',
  FLOATED = 'floated',
  SUPERSEDED = 'superseded',
}

/** Insurer thread status (one thread per insurer + branch). */
export enum ThreadStatus {
  RFQ_SENT = 'rfq_sent',
  ACKNOWLEDGED = 'acknowledged',
  INSURER_CLARIFICATION = 'insurer_clarification',
  AWAITING_RM = 'awaiting_rm',
  QUOTE_RECEIVED = 'quote_received',
  QUOTE_USABLE = 'quote_usable',
  QUOTE_CLARIFICATION = 'quote_clarification',
  QUOTE_EXCLUDED = 'quote_excluded',
  DECLINED = 'declined',
  NOT_APPLICABLE = 'not_applicable',
  /** Never set (Rohit, 2026-11-02): a thread waiting after the ladder keeps showing "Awaiting Insurer Response". Kept for persisted-value stability. */
  NO_RESPONSE = 'no_response',
}

export enum QuoteDecision {
  USABLE = 'usable',
  CLARIFICATION = 'clarification',
  EXCLUDED = 'excluded',
  SUPERSEDED = 'superseded',
}

export enum QcrStatus {
  DRAFT = 'draft',
  RELEASED = 'released',
  SUPERSEDED = 'superseded',
}

export enum QcrSource {
  COPYCAT = 'copycat',
  MANUAL = 'manual',
  SINGLE_QUOTE = 'single_quote',
}

export enum CopycatStatus {
  QUEUED = 'queued',
  GENERATING = 'generating',
  READY = 'ready',
  FAILED = 'failed',
}

export enum MandateType {
  EXCLUSIVE_PLACEMENT = 'Exclusive Placement Mandate',
  INCUMBENT_APPROACH = 'Incumbent Approach Mandate',
}

export enum MandateRequestStatus {
  REQUESTED = 'requested',
  CONSIDERING = 'considering',
  SIGNED = 'signed',
  DECLINED = 'declined',
  WITHDRAWN = 'withdrawn',
}

export enum RevisionAsk {
  RERATE = 'rerate',
  DIFFERENT_INSURER = 'insurer',
  CHANGED_COVER = 'cover',
  REVISED_TERMS = 'terms',
}

export enum RevisionBy {
  CLIENT = 'client',
  US = 'us',
}

export enum InsurerStatus {
  ACTIVE = 'Active',
  INACTIVE = 'Inactive',
  DO_NOT_FLOAT = 'Do Not Float',
}

export enum BranchStatus {
  ACTIVE = 'Active',
  INACTIVE = 'Inactive',
}

/** Why an insurer + branch entity cannot be selected (PRD M4). */
export enum EntityLockReason {
  DO_NOT_FLOAT = 'Do Not Float',
  INACTIVE = 'Inactive',
  BRANCH_INACTIVE = 'Branch inactive',
  NO_POC = 'No POC',
  INCUMBENT_MANDATE_NEEDED = 'Incumbent - mandate needed',
}

/** Inbound insurer mail classes (FR-074). */
export enum InboundClass {
  QUOTE_RECEIVED = 'Quote Received',
  CLARIFICATION_REQUIRED = 'Clarification Required',
  DECLINED = 'Declined',
  NOT_APPLICABLE = 'Not Applicable',
  ACKNOWLEDGED = 'Acknowledged',
}

export enum ReviewQueue {
  NONE = 'none',
  MY_REVIEWS = 'my_reviews',
  UNMATCHED = 'unmatched',
}

export enum ReviewStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  DISMISSED = 'dismissed',
}

export enum ActorType {
  PM = 'PM',
  HEAD = 'Head',
  RM = 'RM',
  INSURER = 'Insurer',
  SYSTEM = 'System',
  BIMASETU = 'BimaSetu',
  COPYCAT = 'Copycat',
}

/** RBAC roles (PRD 6). Assigned in BimaSahayak; carried in the access token. */
export enum Role {
  PLACEMENT_MANAGER = 'placement_manager',
  PLACEMENT_HEAD = 'placement_head',
  ADMIN = 'placement_admin',
  /** RMs work in BimaSetu; read-only/scoped access only if ever exposed. */
  RM = 'rm',
}

export enum SlaOwnerType {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
}

export enum SlaId {
  SLA_02 = 'SLA-02',
  SLA_03 = 'SLA-03',
  SLA_04 = 'SLA-04',
  SLA_05 = 'SLA-05',
  SLA_06 = 'SLA-06',
  SLA_07 = 'SLA-07',
  SLA_08 = 'SLA-08',
  SLA_09 = 'SLA-09',
  SLA_10 = 'SLA-10',
  SLA_11 = 'SLA-11',
  SLA_12 = 'SLA-12',
  SLA_13 = 'SLA-13',
  SLA_14 = 'SLA-14',
  SLA_17 = 'SLA-17',
  SLA_P1 = 'SLA-P1',
}

export enum DocumentKind {
  RFQ_EXCEL = 'rfq_excel',
  QUOTE = 'quote',
  QCR = 'qcr',
  MAIL_ATTACHMENT = 'mail_attachment',
  MANDATE_PROOF = 'mandate_proof',
  OTHER = 'other',
}

export enum DocumentVisibility {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
}

export enum MailDirection {
  OUTBOUND = 'outbound',
  INBOUND = 'inbound',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  SLACK = 'slack',
  GOOGLE_CHAT = 'google_chat',
  WHATSAPP = 'whatsapp',
}
