import { type QuoteTargetScenario, SlaId, SlaOwnerType, TimingLob } from './enums';

/** Business calendar defaults (PRD 8.1). All configurable via the SLA master. */
export const BUSINESS_CALENDAR_DEFAULTS = {
  timezone: 'Asia/Kolkata',
  workdays: [1, 2, 3, 4, 5] as number[], // ISO weekday: Mon=1 .. Sun=7
  dayStart: '10:00',
  dayEnd: '19:00',
  minutesPerDay: 540,
} as const;

export interface SlaDefinitionSeed {
  id: SlaId;
  touchpoint: string;
  owner: string;
  targetMins: number;
  ownerType: SlaOwnerType;
  targetText: string;
}

/** Initial SLA master (PRD 8.3). Seeded into `sla_definitions`; runtime reads the table. */
export const SLA_MASTER_SEED: SlaDefinitionSeed[] = [
  {
    id: SlaId.SLA_02,
    touchpoint: 'RFQ review + completeness + risk tier',
    owner: 'Placement Manager',
    targetMins: 60,
    ownerType: SlaOwnerType.INTERNAL,
    targetText: '1 business hour',
  },
  {
    id: SlaId.SLA_03,
    touchpoint: 'RM / customer clarification',
    owner: 'RM',
    targetMins: 540,
    ownerType: SlaOwnerType.EXTERNAL,
    targetText: '1 business day',
  },
  {
    id: SlaId.SLA_04,
    touchpoint: 'Insurer selection',
    owner: 'Placement Manager',
    targetMins: 120,
    ownerType: SlaOwnerType.INTERNAL,
    targetText: '2 business hours',
  },
  {
    id: SlaId.SLA_05,
    touchpoint: 'RFQ float to selected insurers',
    owner: 'System / PM',
    targetMins: 30,
    ownerType: SlaOwnerType.INTERNAL,
    targetText: 'Within 30 minutes',
  },
  {
    id: SlaId.SLA_06,
    touchpoint: 'Insurer quote collection',
    owner: 'Insurers / Placement',
    targetMins: 1080,
    ownerType: SlaOwnerType.EXTERNAL,
    targetText: 'LOB x risk tier x case type matrix',
  },
  {
    id: SlaId.SLA_07,
    touchpoint: 'Insurer follow-up 1',
    owner: 'System / PM',
    targetMins: 540,
    ownerType: SlaOwnerType.EXTERNAL,
    targetText: 'After 1 business day',
  },
  {
    id: SlaId.SLA_08,
    touchpoint: 'Insurer follow-up 2',
    owner: 'System / PM',
    targetMins: 1080,
    ownerType: SlaOwnerType.EXTERNAL,
    targetText: 'After 2 business days',
  },
  {
    id: SlaId.SLA_09,
    touchpoint: 'Insurer escalation',
    owner: 'System / PM',
    targetMins: 1620,
    ownerType: SlaOwnerType.EXTERNAL,
    targetText: 'After 3 business days',
  },
  {
    id: SlaId.SLA_10,
    touchpoint: 'Quote review + PM validation',
    owner: 'System + PM',
    targetMins: 120,
    ownerType: SlaOwnerType.INTERNAL,
    targetText: '2 business hours per quote',
  },
  {
    id: SlaId.SLA_11,
    touchpoint: 'QCR generation',
    owner: 'System',
    targetMins: 15,
    ownerType: SlaOwnerType.INTERNAL,
    targetText: 'Within 15 minutes',
  },
  {
    id: SlaId.SLA_12,
    touchpoint: 'PM QCR review and release',
    owner: 'Placement Manager',
    targetMins: 120,
    ownerType: SlaOwnerType.INTERNAL,
    targetText: '2 business hours',
  },
  {
    id: SlaId.SLA_13,
    touchpoint: 'RM sends QCR to client',
    owner: 'RM',
    targetMins: 240,
    ownerType: SlaOwnerType.EXTERNAL,
    targetText: '4 business hours',
  },
  {
    id: SlaId.SLA_14,
    touchpoint: 'Client decision',
    owner: 'RM / Client',
    targetMins: 1620,
    ownerType: SlaOwnerType.EXTERNAL,
    targetText: '3 business days target',
  },
  {
    id: SlaId.SLA_17,
    touchpoint: 'Requirement change / RFQ V2 re-float',
    owner: 'RM + Placement',
    targetMins: 240,
    ownerType: SlaOwnerType.INTERNAL,
    targetText: '4 business hours',
  },
];

/** SLA-P1 internal escalation ladder (PRD 8.3). */
export const SLA_P1_DEFAULTS = {
  reminderIntervalMins: 30,
  remindersBeforeEscalation: 3, // at breach + 2 x 30 BM, then escalate after another 30 BM
} as const;

/** Follow-up ladder per insurer thread, in business days after float (BR-037). */
export const FOLLOW_UP_LADDER_DEFAULTS = [
  { step: 1, afterBusinessDays: 1, label: 'Follow-up 1', templateId: 'INS-T02' },
  { step: 2, afterBusinessDays: 2, label: 'Follow-up 2', templateId: 'INS-T03' },
  { step: 3, afterBusinessDays: 3, label: 'Escalation', templateId: 'INS-T04' },
] as const;

/** SLA-06 quote-collection matrix in business days (PRD 8.3, ranges collapsed to upper bound). */
export const QUOTE_TARGET_MATRIX_SEED: Record<TimingLob, Record<QuoteTargetScenario, number>> = {
  [TimingLob.PROPERTY]: { preferred: 2, nonPreferred: 3, renewal: 2 },
  [TimingLob.MARINE]: { preferred: 1, nonPreferred: 3, renewal: 2 },
  [TimingLob.CAR_EAR]: { preferred: 2, nonPreferred: 3, renewal: 2 },
  [TimingLob.EB]: { preferred: 3, nonPreferred: 7, renewal: 2 },
  [TimingLob.LIABILITY]: { preferred: 2, nonPreferred: 3, renewal: 2 },
  [TimingLob.LIABILITY_CRIME]: { preferred: 2, nonPreferred: 5, renewal: 4 },
};

/** Threshold master (Appendix C #23). */
export const THRESHOLD_DEFAULTS = {
  usableQuoteThreshold: 3,
  dueSoonBusinessMins: 480, // Home "Due Today"
  slaRiskBusinessMins: 60, // My Tickets "SLA Risk"
  atRiskFraction: 0.2, // stage timeline turns caution at <=20% remaining
} as const;

/** Read model of the single active ticket clock. */
export interface SlaClockView {
  slaId: SlaId | null;
  ownerType: SlaOwnerType | null;
  targetMins: number | null;
  anchorAt: string | null; // ISO
  remainingMins: number | null; // negative = breached (only meaningful when internal)
  breached: boolean;
  dueAt: string | null; // ISO
}
