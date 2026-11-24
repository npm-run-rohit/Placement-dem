import {
  type BusinessType,
  type Channel,
  type CopycatStatus,
  type EntityLockReason,
  type InternalStatus,
  type MandateRequestStatus,
  type MandateType,
  type OutcomeType,
  type ProductTypeCode,
  type QcrSource,
  type QcrStatus,
  type QuoteDecision,
  type RiskTier,
  type QuoteTargetScenario,
  type RmFacingStatus,
  type Role,
  type SlaId,
  type SlaOwnerType,
  type Stage,
  type ThreadStatus,
  type TimingLob,
  type Urgency,
} from './enums';
import { type SlaClockView } from './sla';
import { type Tone } from './labels';

/** Read models returned by the API. Kept framework-free so the web app can import them. */

export interface UserRef {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

/** GET /me */
export interface CurrentUserView extends UserRef {
  email: string;
  roles: Role[];
}

export interface NextActionView {
  label: string;
  tab: WorkspaceTab;
  tone: Tone;
}

export type WorkspaceTab =
  | 'overview'
  | 'rfq'
  | 'client360'
  | 'documents'
  | 'insurers'
  | 'threads'
  | 'quotes'
  | 'qcr'
  | 'mail'
  | 'audit';

export interface TicketListItem {
  id: string;
  ticketNo: string;
  stage: Stage;
  internalStatus: InternalStatus;
  rmStatus: RmFacingStatus;
  businessType: BusinessType;
  urgency: Urgency;
  businessName: string;
  productType: ProductTypeCode;
  owner: UserRef;
  receivedAt: string;
  sla: SlaClockView;
  usableQuoteCount: number;
  mandateState: 'none' | 'requested' | 'considering' | 'declined' | 'signed';
  outcome?: OutcomeType | null;
}

export interface TicketDetail extends TicketListItem {
  channel: Channel;
  bimasetuLineRef?: string | null;
  rm: UserRef & { email?: string | null };
  createdBy: UserRef;
  industryType: string;
  renewalDate?: string | null;
  incumbentInsurer?: string | null;
  clientSpoc?: string | null;
  targetPremium?: number | null;
  riskTier?: RiskTier | null;
  activeRfqVersion: number;
  qcrRound: number;
  panelLocked: boolean;
  followUpsStopped: boolean;
  escalated: boolean;
  nextAction: NextActionView | null;
  /** BimaSetu float details (RFQ tab card, FR-281); null on manual tickets. */
  float: { lineRef: string; exclusiveMandate: boolean; noteToPlacement: string | null } | null;
  /** closed tickets: the client decision (rail Outcome card) */
  outcomeDetail: {
    reason: string | null;
    insurerName: string | null;
    premium: number | null;
    qcrVersion: number | null;
    decidedBy: string;
    source: 'bimasetu' | 'manual';
    closedAt: string | null;
  } | null;
}

/** GET /tickets/:id/threads (UI-SPEC 3.3.6): one independent thread per insurer + branch. */
export interface ThreadView {
  id: string;
  threadRef: string;
  rfqVersion: number;
  insurerId: string;
  insurer: { id: string; name: string; logoUrl?: string | null };
  branch: { id: string | null; name: string | null };
  /** the insurer has more than one branch on the master: show the branch chip */
  multiBranch: boolean;
  pocs: Array<{ name: string; email: string }>;
  status: ThreadStatus;
  followUpsSent: number;
  followUpsActive: boolean;
  held: boolean;
  heldMins: number;
  pauseReason: string | null;
  declineReason: string | null;
  remainingMins: number | null;
  targetMins: number;
  floatedAt: string | null;
  lastEventAt: string | null;
  /** latest insurer clarification on the thread (FR-063/064) */
  clarification: {
    question: string;
    askedAt: string;
    rmRequestText: string | null;
    rmRequestedAt: string | null;
    rmResponse: string | null;
    rmRespondedAt: string | null;
    replyText: string | null;
    repliedAt: string | null;
  } | null;
  latestQuote: { id: string; version: number; documentId: string; decision: QuoteDecision | null } | null;
}

/** GET /tickets/:id/insurer-entities (UI-SPEC 3.3.6a): selectable insurer + branch entities for the ticket's product group. */
export interface PanelEntityView {
  insurerId: string;
  branchId: string;
  label: string;
  insurerName: string;
  branchName: string | null;
  logoUrl: string | null;
  sectors: string | null;
  pocs: Array<{ pocId: string; name: string; email: string }>;
  inAppetite: boolean;
  /** hard block with its reason (Do Not Float, Inactive, Branch inactive, No POC, Incumbent - mandate needed) */
  lock: EntityLockReason | null;
  /** selected on the active RFQ version (before float) */
  selected: boolean;
  /** responded (quote, decline or query) on an earlier RFQ version: listed first when choosing V2 insurers (FR-132) */
  priorResponder: boolean;
}

export interface ThreadEventView {
  id: string;
  kind: string;
  actorType: string;
  text: string;
  at: string;
}

/** GET /tickets/:id/quotes (UI-SPEC 3.3.7): quotes as received (no extraction); premium is PM-recorded. */
export interface QuoteView {
  id: string;
  threadId: string;
  threadRef: string;
  insurerId: string;
  insurer: { id: string; name: string; logoUrl?: string | null };
  branchName: string | null;
  /** the insurer has more than one thread on the ticket: show the branch chip */
  multiThread: boolean;
  /** this thread has more than one quote version: show the V chip */
  multiVersion: boolean;
  rfqVersion: number;
  version: number;
  receivedAt: string;
  documentId: string;
  fileName: string;
  decision: QuoteDecision | null;
  decisionNote?: string | null;
  clarificationText?: string | null;
  premium?: number | null;
  targetFlag: 'Target Met' | 'Above Target' | 'Target Not Available';
}

/** GET /tickets/:id/qcrs (UI-SPEC 3.3.8) */
export interface QcrView {
  id: string;
  version: number;
  rfqVersion: number;
  round: number;
  status: QcrStatus;
  source: QcrSource;
  copycatStatus?: CopycatStatus | null;
  copycatError?: string | null;
  copycatRequestId?: string | null;
  earlyReleaseReason?: string | null;
  earlyReleaseCount?: number | null;
  rowsChecked: boolean;
  quoteIds: string[];
  releasedAt?: string | null;
  releasedBy?: string | null;
  sentTo?: string | null;
  coverNote?: string | null;
  documentId?: string | null;
  fileName?: string | null;
  createdAt: string;
}

export interface QcrRowView {
  id: string;
  quoteId: string;
  insurerId: string;
  insurerName: string;
  premium: number | null;
  sumInsured: string | null;
  validityDate: string | null;
  termsNote: string | null;
  /** Per field, the value filled from Copycat's QCR ('copycat') or the quote record ('quote'), FR-286. */
  autofill: Partial<
    Record<
      'premium' | 'sumInsured' | 'validityDate' | 'termsNote',
      { value: string | number | null; source: 'copycat' | 'quote' }
    >
  >;
  /** Fields the PM changed away from the autofilled value. */
  edited: Array<'premium' | 'sumInsured' | 'validityDate' | 'termsNote'>;
}

/** GET /tickets/:id/mandate (PRD M4 3.1): Exclusive Placement / Incumbent Approach mandates on file + request history. */
export interface MandateView {
  state: 'none' | 'requested' | 'considering' | 'declined' | 'signed';
  mandates: Array<{
    id: string;
    type: MandateType;
    reference: string;
    preferredInsurerName: string | null;
    note: string | null;
    source: string;
    signedAt: string | null;
    requestedByName: string | null;
    requestedAt: string | null;
  }>;
  requests: Array<{
    id: string;
    ref: string;
    status: MandateRequestStatus;
    reason: string;
    message: string;
    preferredInsurerId: string | null;
    preferredInsurerName: string | null;
    requestedByName: string;
    requestedAt: string;
    closedAt: string | null;
    events: Array<{
      kind: 'reminder' | 'considering' | 'signed' | 'declined' | 'withdrawn';
      at: string;
      by: string;
      note?: string;
      reason?: string;
    }>;
  }>;
}

export interface DeskCounts {
  insurerResponse: number;
  rmResponse: number;
  quotesToReview: number;
  dueToday: number;
  overdue: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  statusCode: number;
  code: string; // e.g. TRANSITION_NOT_ALLOWED, VALIDATION_FAILED, GUARD_FAILED
  message: string;
  details?: unknown;
  correlationId?: string;
}

/** GET /tickets/:id/mails (UI-SPEC Mail Trail > Mail): every mail sent from / mapped to the ticket (FR-053, FR-221). */
export interface MailView {
  id: string;
  direction: 'outbound' | 'inbound';
  threadId: string | null;
  threadRef: string | null;
  insurerName: string | null;
  templateId: string | null;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string;
  attachments: Array<{ id: string; fileName: string }>;
  rfqLinkInBody: boolean;
  status: string;
  /** Why a `failed` mail was not sent. */
  error: string | null;
  /** A failed mail that was already sent again (POST /tickets/:id/mails/:mailId/resend). */
  resent: boolean;
  at: string;
}

/** GET /tickets/:id/bimasetu-messages (Mail Trail > BimaSetu): message log both ways (FR-291). */
export interface BimaSetuMessageView {
  id: string;
  direction: 'in' | 'out';
  messageId: string;
  type: string;
  status: string;
  attempts: number;
  lastError: string | null;
  payload: Record<string, unknown>;
  at: string;
  processedAt: string | null;
}

/** GET /manual-review?queue= (UI-SPEC 3.4, FR-227): inbound mail the bot would not apply alone, with why. */
export interface InboundMailView {
  id: string;
  queue: 'my_reviews' | 'unmatched' | 'none';
  reason: string | null;
  status: 'pending' | 'confirmed' | 'dismissed';
  from: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  attachments: Array<{ id: string; fileName: string }>;
  ticket: { id: string; ticketNo: string; businessName: string } | null;
  thread: { id: string; threadRef: string; insurerName: string } | null;
  unknownSender: boolean;
  /** classifier suggestion */
  classification: string | null;
  confidence: number | null;
  /** what the reviewer confirmed (classifier feedback, FR-078) */
  appliedClass: string | null;
  mappingBasis: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** product types found in subject/body/attachment names (FR-230) - drives the ticket picker order (FR-231) */
  matchedProducts: string[];
}

/** GET /manual-review/counts: pending per queue (header pills, sidebar dot). */
export interface ManualReviewCounts {
  myReviews: number;
  unmatched: number;
}

/** GET /manual-review/:id/ticket-options: open tickets, product-matched first (FR-231). */
export interface ReviewTicketOption {
  id: string;
  ticketNo: string;
  businessName: string;
  productType: string;
  matches: boolean;
}

/** GET /insurers/master (UI-SPEC 3.5): one row per insurer x branch; POCs per product group (routing key, FR-162). */
export interface InsurerMasterRow {
  insurerId: string;
  code: string;
  name: string;
  /** BimaKavach's broking code with this insurer (Appendix C #06); null where none is given */
  brokingCode: string | null;
  logoUrl: string | null;
  sectors: string | null;
  note: string | null;
  status: string;
  appetite: string[];
  branch: { id: string; name: string; city: string | null; status: string } | null;
  pocs: Record<
    'EB' | 'Liability' | 'P&C',
    Array<{ id: string; name: string; email: string; designation: string | null; phone: string | null }>
  >;
}

/** GET /insurers/change-log (FR-161): append-only, newest first. */
export interface MasterChangeView {
  id: string;
  entityType: string;
  entityLabel: string;
  field: string;
  before: unknown;
  after: unknown;
  changedBy: string;
  changedAt: string;
}

/** Lookup lists the Admin screens maintain (Appendix C #02-05, 11, 12, 18, 19). Enum-backed lists are not editable. */
export const EDITABLE_LOOKUP_KINDS = [
  'industry_type',
  'early_release_reason',
  'mandate_request_reason',
  'mandate_decline_reason',
  'closure_reason',
  'rejection_reason',
  'exclusion_reason',
] as const;
export type EditableLookupKind = (typeof EDITABLE_LOOKUP_KINDS)[number];

/** SLAs whose target comes from another master: SLA-06 from the matrix, SLA-07..09 from the follow-up ladder. */
export const DERIVED_SLA_IDS: readonly SlaId[] = ['SLA-06', 'SLA-07', 'SLA-08', 'SLA-09'] as SlaId[];

/** GET /masters/admin (PLAN 4.2, FR-139..148, FR-270): everything the Admin screens edit, incl. retired values. */
/** One placement user's mailbox as the mailbox connector reports it (Admin, read-only). `unknown` = the status could not be read. */
export interface MailboxStatusView {
  userName: string;
  email: string;
  mailbox: string;
  status: 'connected' | 'not_connected' | 'unknown';
  detail: string | null;
}

export interface AdminMastersView {
  /**
   * null when MAILBOX_DRIVER is `dev` (there are no real mailboxes to report). Absent from save responses
   * (mailbox status is only read on GET /masters/admin); keep the value you already have.
   */
  mailboxes?: MailboxStatusView[] | null;
  sla: Array<{
    id: SlaId;
    touchpoint: string;
    owner: string;
    ownerType: SlaOwnerType;
    targetMins: number;
    targetText: string;
    derived: boolean;
  }>;
  matrix: Array<{ timingLob: TimingLob; scenario: QuoteTargetScenario; businessDays: number }>;
  calendar: { timezone: string; workdays: number[]; dayStart: string; dayEnd: string; minutesPerDay: number };
  holidays: Array<{ date: string; name: string; active: boolean }>;
  thresholds: {
    usableQuoteThreshold: number;
    dueSoonBusinessMins: number;
    slaRiskBusinessMins: number;
    atRiskFraction: number;
  };
  slaP1: { reminderIntervalMins: number; remindersBeforeEscalation: number };
  followUpLadder: Array<{ step: number; afterBusinessDays: number; label: string; templateId: string }>;
  uploadRules: { rfqAccept: string[]; qcrAccept: string[] | null };
  lookups: Array<{
    id: string;
    kind: EditableLookupKind;
    value: string;
    description: string | null;
    active: boolean;
    sortOrder: number;
  }>;
  templates: Array<{
    id: string;
    audience: 'insurer' | 'rm' | 'internal';
    trigger: string;
    subjectTemplate: string;
    bodyTemplate: string;
    active: boolean;
  }>;
  productTypes: Array<{
    code: ProductTypeCode;
    label: string;
    group: string;
    timingLob: TimingLob;
    rfqTemplate: string;
    aliases: string[];
    bimasetuCodes: string[];
    active: boolean;
  }>;
}

/**
 * GET /reports (UI-SPEC 3.6, PRD 9.4/9.5, FR-255): aggregates over the tickets the viewer can see
 * (a PM never counts Head-owned escalated tickets, FR-208). SLA figures are internal clocks only (BR-118).
 */
export interface ReportsView {
  scope: 'team' | 'visible';
  pipeline: {
    active: number;
    closed: number;
    quoteSelected: number;
    lost: number;
    noAppetite: number;
    byStage: Array<{ stage: string; label: string; n: number }>;
  };
  sla: {
    within: number;
    breached: number;
    underAnHour: number;
    breachesByStage: Array<{ stage: string; label: string; n: number }>;
  };
  insurerOutcomes: Array<{
    insurerId: string;
    insurer: string;
    approached: number;
    responded: number;
    quoted: number;
    declined: number;
  }>;
  /** Furthest step each ticket reached, counted cumulatively. `n` is null for steps Placement cannot observe. */
  funnel: Array<{ step: string; definition: string; n: number | null }>;
  /** Placement Head dashboard (PRD 9.2); null for a Placement Manager. */
  team: TeamDashboard | null;
}

/** A wait in business days across the tickets currently in it. */
export interface WaitAgeing {
  count: number;
  medianBusinessDays: number | null;
  oldestBusinessDays: number | null;
  oldestTicketNo: string | null;
}

/** PRD 9.2 Placement Head dashboard, over every open ticket (closed ones only for rates and mix). */
export interface TeamDashboard {
  workload: Array<{
    ownerId: string;
    name: string;
    open: number;
    breached: number;
    underAnHour: number;
    escalated: number;
  }>;
  /** Open tickets by age since received, in business days. */
  ageing: Array<{ bucket: string; n: number }>;
  awaitingRm: WaitAgeing;
  quoteCollection: WaitAgeing;
  qcrRelease: WaitAgeing;
  escalatedToHead: number;
  highUrgency: number;
  /** No appetite / all closed tickets; null before anything closed. */
  noAppetiteRate: number | null;
  reassignmentsLast30Days: number;
  mix: {
    businessType: Array<{ key: string; n: number }>;
    product: Array<{ key: string; n: number }>;
    industry: Array<{ key: string; n: number }>;
    channel: Array<{ key: string; n: number }>;
  };
}

export type SearchScope = 'tickets' | 'clients' | 'insurers';

/** GET /search?q=&scopes= (UI-SPEC 2.5). `recent` = empty query, showing the latest tickets (open first). */
export interface SearchView {
  query: string;
  recent: boolean;
  items: TicketListItem[];
}

/** GET /directory (Create Ticket pickers, FR-196/198): active RMs and the placement users a Head can assign. */
export interface DirectoryView {
  rms: Array<UserRef & { email: string }>;
  owners: Array<UserRef & { role: 'Placement Manager' | 'Placement Head' }>;
}

export type ProgressRange = 'week' | 'month' | 'quarter' | 'custom';

/** GET /reports/progress (Home "Your Progress", UI-SPEC 3.1): from the ticket clock history, business time. */
export interface ProgressView {
  scope: 'me' | 'team';
  range: ProgressRange;
  from: string;
  to: string;
  ticketsOnTrack: { onTrack: number; total: number };
  /** Median share of the target used on Placement-owned clocks (0.5 = half the target). Null when none ran. */
  medianSlaUsed: number | null;
  /** Business hours the clock was held by each party inside the range. */
  hours: { placement: number; insurer: number; rmClient: number };
  /** Median SLA used in 8 equal slices of the range, oldest first (sparkline); null where no internal clock ran. */
  trend: Array<number | null>;
}

/** GET /tickets/by-no/:ticketNo/pager (UI-SPEC 2.1 TicketPager): neighbours in urgency order over open tickets in scope. */
export interface TicketPagerView {
  prev: string | null;
  next: string | null;
  position: number;
  total: number;
}

/** GET /me/notifications (shell bell, PLAN 4.1): newest first. */
export interface NotificationView {
  id: string;
  eventType: string | null;
  title: string;
  body: string;
  ticketNo: string | null;
  /** In-app route, e.g. /tickets/PLC-1001/quotes. */
  link: string | null;
  read: boolean;
  createdAt: string;
}

/** GET /tickets/:id/revisions (QCR tab revision card, M11): newest round first. */
export interface RevisionView {
  id: string;
  round: number;
  qcrVersion: number;
  by: 'client' | 'us';
  reason: string;
  asks: string[];
  receivedAt: string;
  handledAt: string | null;
  handledVia: 'restart_threads' | 'add_insurer' | 'new_rfq_version' | null;
}

/** GET /me/tasks (PM work items, FR-250 revision tasks): open first. */
export interface TaskView {
  id: string;
  kind: string;
  label: string;
  ticketNo: string;
  businessName: string;
  link: string;
  dueAt: string | null;
  status: 'open' | 'done' | 'cancelled';
  createdAt: string;
}

/** GET /tickets/:id/rfq/versions (RFQ + Documents tabs), oldest first. */
export interface RfqVersionView {
  id: string;
  version: number;
  status: string;
  excelDocumentId: string | null;
  linkUrl: string | null;
  renderedViewUrl: string | null;
  changeNote: string | null;
  validatedAt: string | null;
  floatedAt: string | null;
  createdAt: string;
}

/** GET /tickets/:id/rfq/queries: queries to the RM, oldest first. */
export interface RfqQueryView {
  id: string;
  ref: string;
  label: string;
  raisedAt: string;
  sendCount: number;
  answer: string | null;
  answeredAt: string | null;
  answeredBy: string | null;
  resolved: boolean;
  resolvedAt: string | null;
}

/** GET /documents/ticket/:id (Documents tab), newest first. The storage key never leaves the API. */
export interface DocumentView {
  id: string;
  kind: string;
  visibility: 'internal' | 'external';
  fileName: string;
  contentType: string;
  sizeBytes: string;
  uploadedBy: string;
  uploadedAt: string;
}

/** GET /tickets/:id/audit (Audit Trail tab), newest first. */
export interface AuditEventView {
  id: string;
  event: string;
  detail: string;
  actorType: string;
  actorId: string | null;
  actorName: string;
  at: string;
}
