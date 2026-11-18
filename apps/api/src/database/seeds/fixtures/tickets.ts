import { BusinessType, ProductTypeCode, RiskTier, Urgency } from '@bimaplacement/contracts';

/**
 * DEV FIXTURE - the designer prototype's 17 Placement seed tickets (PL_SEED*, PL_CASE_META, the
 * single-product splits and PL_SEED_MANDATE_REQUESTS), replayed through the real services by
 * seed-fixtures.ts. Mock clients, premiums and people; not business data.
 *
 * Created in prototype order, so ours are PLC-1001..1017 = prototype PLC-1024..1040 (minus 23).
 * Times: 'DD Mon, HH:MM' is prototype time (2026, IST) shifted so that the prototype's engine time
 * (26 Aug 14:00) is "now"; 'now-90m' is relative to the real clock. Steps run in the order listed.
 *
 * Deliberate differences from the prototype, forced by our domain rules:
 * - an undecided quote moves a ticket to Quote Review (SLA-10, 2 BH), so undecided quotes arrive
 *   minutes before "now" instead of days, otherwise the sweeper would escalate them on load;
 * - Insurer Selection tickets are validated minutes before "now" for the same reason (SLA-04);
 * - tickets are manual (BimaSetu inbound is PLAN 2.11), and PLC-1030 closes on RFQ V1 (RFQ V2 skipped).
 */
export type Who = 'himani' | 'bhupendra';

export type Step =
  | { at: string; do: 'queries'; queries: string[] }
  | { at: string; do: 'rmAnswer'; query: number; text: string }
  | { at: string; do: 'validate'; tier: RiskTier }
  | { at: string; do: 'incumbentMandate' }
  | { at: string; do: 'panel'; insurers: string[] }
  | { at: string; do: 'float' }
  | { at: string; do: 'insurer'; insurer: string; kind: 'ack' | 'clarification' | 'decline'; text: string }
  | { at: string; do: 'hold'; insurer: string; request: string }
  | { at: string; do: 'quote'; insurer: string; premium: number; usable?: boolean }
  | { at: string; do: 'copycat' }
  | { at: string; do: 'release'; note?: string }
  | { at: string; do: 'select'; insurer: string }
  | { at: string; do: 'noAppetite'; reason: string }
  | { at: string; do: 'mandateRequest'; by: Who; reason: string; preferred?: string; message: string }
  | { at: string; do: 'mandateRemind'; by: Who }
  | { at: string; do: 'mandateResponse'; kind: 'considering' | 'signed'; note?: string };

export interface FixtureTicket {
  proto: string;
  client: string;
  spoc?: string;
  industry: string;
  product: ProductTypeCode;
  businessType: BusinessType;
  renewal?: string; // YYYY-MM-DD
  incumbent?: string; // insurer name as on the RFQ
  target: number | null;
  urgency?: Urgency;
  owner: Who;
  received: string;
  rfq: 'link' | 'excel';
  steps: Step[];
}

const { NEW, RENEWAL, ROLLOVER } = BusinessType;
const P = RiskTier.PREFERRED;

export const FIXTURE_TICKETS: FixtureTicket[] = [
  {
    proto: 'PLC-1024',
    client: 'Nutrigrain Foods Pvt Ltd',
    spoc: 'Meenal Trivedi, Head HR',
    industry: 'Manufacturing',
    product: ProductTypeCode.GMC,
    businessType: RENEWAL,
    renewal: '2026-10-01',
    incumbent: 'Star Health',
    target: 7800000,
    owner: 'himani',
    received: '25 Aug, 09:40',
    rfq: 'link',
    steps: [
      {
        at: '25 Aug, 10:30',
        do: 'queries',
        queries: [
          'Confirm the family definition (employee + spouse + 2 children?)',
          'Share the 3-year claims experience',
        ],
      },
      { at: '25 Aug, 16:10', do: 'rmAnswer', query: 0, text: 'E + S + 2C, parents excluded' },
    ],
  },
  {
    proto: 'PLC-1025',
    client: 'Vertex Analytics Pvt Ltd',
    industry: 'Technology',
    product: ProductTypeCode.PI_TECH,
    businessType: NEW,
    target: 4200000,
    owner: 'bhupendra',
    received: '21 Aug, 15:02',
    rfq: 'excel',
    steps: [
      { at: 'now-24m', do: 'validate', tier: P },
      { at: 'now-20m', do: 'panel', insurers: ['tata', 'icici', 'bajaj'] },
    ],
  },
  {
    proto: 'PLC-1026',
    client: 'Meridian Logistics Ltd',
    industry: 'Warehousing & Logistics',
    product: ProductTypeCode.MARINE_OPEN,
    businessType: RENEWAL,
    renewal: '2026-09-05',
    incumbent: 'New India Assurance',
    target: 3100000,
    urgency: Urgency.HIGH,
    owner: 'bhupendra',
    received: '14 Aug, 10:15',
    rfq: 'link',
    steps: [
      { at: '14 Aug, 11:00', do: 'validate', tier: P },
      { at: '14 Aug, 11:30', do: 'panel', insurers: ['icici', 'nia', 'chola', 'sbi'] },
      { at: '14 Aug, 12:00', do: 'float' },
      {
        at: '15 Aug, 17:10',
        do: 'mandateRequest',
        by: 'bhupendra',
        reason: 'Client relies on our market view',
        message:
          'Hi Shubh, could the client sign an Exclusive Placement Mandate so we can pick the best option for them?',
      },
      {
        at: '16 Aug, 09:00',
        do: 'mandateResponse',
        kind: 'signed',
        note: 'Client signed the Exclusive Placement Mandate.',
      },
      {
        at: '16 Aug, 11:20',
        do: 'insurer',
        insurer: 'chola',
        kind: 'ack',
        text: 'Received, reviewing with our marine desk.',
      },
      {
        at: '18 Aug, 15:40',
        do: 'insurer',
        insurer: 'sbi',
        kind: 'decline',
        text: 'No appetite for marine open covers this quarter.',
      },
      {
        at: '20 Aug, 12:10',
        do: 'insurer',
        insurer: 'nia',
        kind: 'clarification',
        text: 'Please share the last three years of transit loss data.',
      },
      {
        at: '20 Aug, 14:00',
        do: 'hold',
        insurer: 'nia',
        request: 'Share the last three years of transit loss data (New India).',
      },
      { at: 'now-15m', do: 'quote', insurer: 'icici', premium: 10620000 },
    ],
  },
  {
    proto: 'PLC-1027',
    client: 'Kalpataru Infra Projects Ltd',
    industry: 'Construction & Contracting',
    product: ProductTypeCode.GMC,
    businessType: RENEWAL,
    renewal: '2026-09-15',
    incumbent: 'HDFC ERGO',
    target: 11500000,
    owner: 'bhupendra',
    received: '05 Aug, 11:30',
    rfq: 'excel',
    steps: [
      { at: '05 Aug, 12:30', do: 'validate', tier: P },
      { at: '05 Aug, 14:00', do: 'panel', insurers: ['icici', 'hdfc', 'bajaj', 'nia', 'reliance'] },
      { at: '05 Aug, 15:00', do: 'float' },
      { at: '13 Aug, 16:20', do: 'quote', insurer: 'icici', premium: 36840000, usable: true },
      { at: '15 Aug, 12:40', do: 'quote', insurer: 'hdfc', premium: 35920000 },
      { at: '21 Aug, 15:10', do: 'quote', insurer: 'hdfc', premium: 35920000, usable: true },
      {
        at: '22 Aug, 10:00',
        do: 'insurer',
        insurer: 'reliance',
        kind: 'decline',
        text: 'Unable to support this scheme at the expiring structure.',
      },
      {
        at: '26 Aug, 10:20',
        do: 'mandateRequest',
        by: 'bhupendra',
        reason: 'Client relies on our market view',
        preferred: 'hdfc',
        message:
          'Hi Shubh, HDFC ERGO looks strongest so far. Could the client give us an Exclusive Placement Mandate?',
      },
      { at: '26 Aug, 11:15', do: 'mandateRemind', by: 'bhupendra' },
      {
        at: '26 Aug, 12:40',
        do: 'mandateResponse',
        kind: 'considering',
        note: "Client's CFO is reviewing; expect an answer Monday.",
      },
      { at: 'now-40m', do: 'quote', insurer: 'nia', premium: 33480000 },
      { at: 'now-25m', do: 'quote', insurer: 'bajaj', premium: 34150000 },
    ],
  },
  {
    proto: 'PLC-1028',
    client: 'Suryodaya Renewables Ltd',
    industry: 'Power & Energy',
    product: ProductTypeCode.FIRE_FACTORY,
    businessType: ROLLOVER,
    renewal: '2026-09-12',
    incumbent: 'Universal Sompo',
    target: 2400000,
    owner: 'himani',
    received: '28 Jul, 09:00',
    rfq: 'link',
    steps: [
      { at: '28 Jul, 09:40', do: 'validate', tier: P },
      { at: '28 Jul, 10:00', do: 'incumbentMandate' },
      { at: '28 Jul, 11:00', do: 'panel', insurers: ['icici', 'nia', 'chola', 'sompo'] },
      { at: '28 Jul, 12:00', do: 'float' },
      { at: '06 Aug, 11:00', do: 'quote', insurer: 'icici', premium: 4820000, usable: true },
      { at: '12 Aug, 15:20', do: 'quote', insurer: 'nia', premium: 4415000, usable: true },
      { at: '18 Aug, 12:00', do: 'quote', insurer: 'chola', premium: 5140000, usable: true },
      { at: '18 Aug, 12:05', do: 'copycat' },
      { at: '19 Aug, 11:00', do: 'release', note: 'Three options; New India is the lowest.' },
      { at: '25 Aug, 11:20', do: 'quote', insurer: 'sompo', premium: 4290000 },
    ],
  },
  {
    proto: 'PLC-1029',
    client: 'Halcyon Hospitality Group',
    industry: 'Others',
    product: ProductTypeCode.GMC,
    businessType: RENEWAL,
    renewal: '2026-09-20',
    incumbent: 'Care Health',
    target: 5900000,
    owner: 'himani',
    received: '18 Jul, 14:00',
    rfq: 'excel',
    steps: [
      { at: '18 Jul, 15:00', do: 'validate', tier: P },
      { at: '18 Jul, 16:00', do: 'panel', insurers: ['hdfc', 'care', 'icici', 'star'] },
      { at: '18 Jul, 17:00', do: 'float' },
      {
        at: '21 Jul, 11:30',
        do: 'insurer',
        insurer: 'star',
        kind: 'decline',
        text: 'Outside our group health appetite for hospitality.',
      },
      { at: '28 Jul, 10:20', do: 'quote', insurer: 'hdfc', premium: 11240000, usable: true },
      { at: '30 Jul, 09:15', do: 'quote', insurer: 'care', premium: 10910000, usable: true },
      { at: '05 Aug, 12:40', do: 'quote', insurer: 'icici', premium: 11890000, usable: true },
      { at: '05 Aug, 12:45', do: 'copycat' },
      { at: '06 Aug, 10:00', do: 'release' },
    ],
  },
  {
    proto: 'PLC-1030',
    client: 'Ridgeline Pharma Ltd',
    industry: 'Manufacturing',
    product: ProductTypeCode.CGL,
    businessType: NEW,
    target: 1800000,
    urgency: Urgency.HIGH,
    owner: 'bhupendra',
    received: '02 Jul, 10:00',
    rfq: 'link',
    steps: [
      { at: '02 Jul, 11:00', do: 'validate', tier: P },
      { at: '02 Jul, 12:00', do: 'panel', insurers: ['icici', 'bajaj', 'tata', 'nia', 'chola'] },
      { at: '02 Jul, 14:00', do: 'float' },
      {
        at: '06 Jul, 12:00',
        do: 'insurer',
        insurer: 'icici',
        kind: 'decline',
        text: 'No US product-liability exposure without a US-domiciled parent.',
      },
      {
        at: '07 Jul, 15:30',
        do: 'insurer',
        insurer: 'bajaj',
        kind: 'decline',
        text: 'Outside appetite for US exports.',
      },
      {
        at: '08 Jul, 11:00',
        do: 'insurer',
        insurer: 'tata',
        kind: 'decline',
        text: 'Declined: US product liability.',
      },
      { at: '09 Jul, 16:20', do: 'insurer', insurer: 'chola', kind: 'decline', text: 'Not able to quote.' },
      {
        at: '20 Jul, 12:00',
        do: 'noAppetite',
        reason:
          'Markets approached all declined US product-liability exposure for a contract manufacturer without a US-domiciled parent.',
      },
    ],
  },
  {
    proto: 'PLC-1031',
    client: 'Orbit Semiconductors Pvt Ltd',
    industry: 'Technology',
    product: ProductTypeCode.PI_TECH,
    businessType: NEW,
    target: 3600000,
    owner: 'bhupendra',
    received: '12 Jul, 10:30',
    rfq: 'excel',
    steps: [
      { at: '12 Jul, 11:30', do: 'validate', tier: P },
      {
        at: '12 Jul, 13:00',
        do: 'mandateRequest',
        by: 'himani',
        reason: 'Several comparable quotes - client wants us to choose',
        message: 'Hi Shubh, could the client sign an Exclusive Placement Mandate?',
      },
      { at: '12 Jul, 14:00', do: 'panel', insurers: ['tata', 'icici', 'bajaj', 'hdfc'] },
      { at: '12 Jul, 15:00', do: 'float' },
      { at: '14 Jul, 10:00', do: 'mandateResponse', kind: 'signed' },
      { at: '19 Jul, 14:00', do: 'quote', insurer: 'tata', premium: 1840000, usable: true },
      { at: '22 Jul, 11:00', do: 'quote', insurer: 'icici', premium: 1965000, usable: true },
      { at: '26 Jul, 15:30', do: 'quote', insurer: 'bajaj', premium: 1790000, usable: true },
      { at: '26 Jul, 15:35', do: 'copycat' },
      { at: '27 Jul, 11:00', do: 'release' },
      { at: '04 Aug, 16:45', do: 'select', insurer: 'tata' },
    ],
  },
  {
    proto: 'PLC-1032',
    client: 'Trident Precision Tools Pvt Ltd',
    industry: 'Manufacturing',
    product: ProductTypeCode.DNO,
    businessType: NEW,
    target: 480000,
    owner: 'bhupendra',
    received: 'now-5m',
    rfq: 'excel',
    steps: [],
  },
  {
    proto: 'PLC-1033',
    client: 'Neurastack Technologies Pvt Ltd',
    industry: 'Technology',
    product: ProductTypeCode.DNO,
    businessType: NEW,
    target: null,
    owner: 'bhupendra',
    received: 'now-12m',
    rfq: 'excel',
    steps: [],
  },
  {
    proto: 'PLC-1034',
    client: 'Karnataka Fluid Systems Pvt Ltd',
    industry: 'Manufacturing',
    product: ProductTypeCode.FIRE_FACTORY,
    businessType: NEW,
    target: 480000,
    owner: 'bhupendra',
    received: 'now-1m',
    rfq: 'link',
    steps: [],
  },
  {
    proto: 'PLC-1035',
    client: 'Nutrigrain Foods Pvt Ltd',
    spoc: 'Meenal Trivedi, Head HR',
    industry: 'Manufacturing',
    product: ProductTypeCode.GPA,
    businessType: RENEWAL,
    renewal: '2026-10-01',
    incumbent: 'Star Health',
    target: null,
    owner: 'himani',
    received: '25 Aug, 09:40',
    rfq: 'link',
    steps: [
      { at: '25 Aug, 10:35', do: 'queries', queries: ['Confirm the GPA cover scope (24 hours worldwide?)'] },
      {
        at: '25 Aug, 16:15',
        do: 'rmAnswer',
        query: 0,
        text: '24 hours, worldwide; medical extension required',
      },
    ],
  },
  {
    proto: 'PLC-1036',
    client: 'Vertex Analytics Pvt Ltd',
    industry: 'Technology',
    product: ProductTypeCode.DNO,
    businessType: NEW,
    target: null,
    owner: 'bhupendra',
    received: '21 Aug, 15:02',
    rfq: 'excel',
    steps: [
      { at: 'now-24m', do: 'validate', tier: P },
      { at: 'now-18m', do: 'panel', insurers: ['tata', 'icici', 'bajaj'] },
    ],
  },
  {
    proto: 'PLC-1037',
    client: 'Meridian Logistics Ltd',
    industry: 'Warehousing & Logistics',
    product: ProductTypeCode.CGL,
    businessType: RENEWAL,
    renewal: '2026-09-05',
    incumbent: 'New India Assurance',
    target: null,
    owner: 'bhupendra',
    received: '14 Aug, 10:15',
    rfq: 'link',
    steps: [
      { at: '14 Aug, 11:05', do: 'validate', tier: P },
      { at: '14 Aug, 11:35', do: 'panel', insurers: ['icici', 'nia', 'chola', 'sbi'] },
      { at: '14 Aug, 12:05', do: 'float' },
      {
        at: '16 Aug, 11:25',
        do: 'insurer',
        insurer: 'chola',
        kind: 'ack',
        text: 'Received, our liability desk will revert.',
      },
      {
        at: '18 Aug, 15:45',
        do: 'insurer',
        insurer: 'sbi',
        kind: 'decline',
        text: 'No CGL appetite for this occupancy.',
      },
      { at: '19 Aug, 10:00', do: 'insurer', insurer: 'icici', kind: 'ack', text: 'Acknowledged.' },
    ],
  },
  {
    proto: 'PLC-1038',
    client: 'Kalpataru Infra Projects Ltd',
    industry: 'Construction & Contracting',
    product: ProductTypeCode.GPA,
    businessType: RENEWAL,
    renewal: '2026-09-15',
    incumbent: 'HDFC ERGO',
    target: null,
    owner: 'bhupendra',
    received: '05 Aug, 11:30',
    rfq: 'excel',
    steps: [
      { at: '05 Aug, 12:35', do: 'validate', tier: P },
      { at: '05 Aug, 14:05', do: 'panel', insurers: ['icici', 'hdfc', 'bajaj', 'nia'] },
      { at: '05 Aug, 15:05', do: 'float' },
      { at: '07 Aug, 10:00', do: 'insurer', insurer: 'hdfc', kind: 'ack', text: 'Received.' },
      { at: '13 Aug, 16:20', do: 'quote', insurer: 'icici', premium: 1985000, usable: true },
    ],
  },
  {
    proto: 'PLC-1039',
    client: 'Orbit Semiconductors Pvt Ltd',
    industry: 'Technology',
    product: ProductTypeCode.DNO,
    businessType: NEW,
    target: null,
    owner: 'bhupendra',
    received: '12 Jul, 10:30',
    rfq: 'excel',
    steps: [
      { at: '12 Jul, 11:35', do: 'validate', tier: P },
      { at: '12 Jul, 14:05', do: 'panel', insurers: ['tata', 'icici', 'bajaj', 'hdfc'] },
      { at: '12 Jul, 15:05', do: 'float' },
      { at: '19 Jul, 14:10', do: 'quote', insurer: 'tata', premium: 2150000, usable: true },
      { at: '22 Jul, 11:10', do: 'quote', insurer: 'icici', premium: 2290000, usable: true },
      { at: '26 Jul, 15:40', do: 'quote', insurer: 'bajaj', premium: 2080000, usable: true },
      { at: '26 Jul, 15:45', do: 'copycat' },
      { at: '27 Jul, 11:05', do: 'release' },
      { at: '04 Aug, 16:50', do: 'select', insurer: 'tata' },
    ],
  },
  {
    proto: 'PLC-1040',
    client: 'Karnataka Fluid Systems Pvt Ltd',
    industry: 'Manufacturing',
    product: ProductTypeCode.WC,
    businessType: NEW,
    target: null,
    owner: 'bhupendra',
    received: 'now-1m',
    rfq: 'link',
    steps: [],
  },
];
