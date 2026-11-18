import { BusinessType, ProductGroup, ProductTypeCode, TimingLob } from './enums';

export interface ProductTypeSeed {
  code: ProductTypeCode;
  group: ProductGroup;
  short: string;
  label: string;
  rfqTemplate: string;
  timingLob: TimingLob;
  /** Names the email bot matches (PRD M1 3.2 "Also called"; FR-230). */
  aliases: string[];
}

/** Product Type master - 21 values (PRD M1 3.2, Appendix C #01). */
export const PRODUCT_TYPES_SEED: ProductTypeSeed[] = [
  {
    code: ProductTypeCode.GMC,
    group: ProductGroup.EB,
    short: 'GMC',
    label: 'Group Medical Cover (GMC)',
    rfqTemplate: 'EB RFQ - GMC block',
    timingLob: TimingLob.EB,
    aliases: ['GMC', 'Group Medical Cover', 'Group Mediclaim'],
  },
  {
    code: ProductTypeCode.GPA,
    group: ProductGroup.EB,
    short: 'GPA',
    label: 'Group Personal Accident (GPA)',
    rfqTemplate: 'EB RFQ - GPA block',
    timingLob: TimingLob.EB,
    aliases: ['GPA', 'Group Personal Accident'],
  },
  {
    code: ProductTypeCode.GTL,
    group: ProductGroup.EB,
    short: 'GTL',
    label: 'Group Term Life (GTL)',
    rfqTemplate: 'EB RFQ - GTL block',
    timingLob: TimingLob.EB,
    aliases: ['GTL', 'Group Term Life'],
  },
  {
    code: ProductTypeCode.CGL,
    group: ProductGroup.LIABILITY,
    short: 'CGL',
    label: 'Commercial General Liability (CGL)',
    rfqTemplate: 'CGL + Common Questions',
    timingLob: TimingLob.LIABILITY,
    aliases: ['CGL', 'CGL Policy', 'Commercial General Liability', 'Product Liability'],
  },
  {
    code: ProductTypeCode.DNO,
    group: ProductGroup.LIABILITY,
    short: 'D&O',
    label: 'Directors & Officers (D&O)',
    rfqTemplate: 'D&O + Common Questions',
    timingLob: TimingLob.LIABILITY,
    aliases: ['DNO', 'D&O', 'Directors & Officers', 'Directors and Officers'],
  },
  {
    code: ProductTypeCode.PI_ENGG,
    group: ProductGroup.LIABILITY,
    short: 'PI Engg',
    label: 'Professional Indemnity - Engineering',
    rfqTemplate: 'PI Engg + Common Questions',
    timingLob: TimingLob.LIABILITY,
    aliases: ['PI Engg', 'Professional Indemnity Engineering'],
  },
  {
    code: ProductTypeCode.PI_TECH,
    group: ProductGroup.LIABILITY,
    short: 'PI Tech',
    label: 'Professional Indemnity - Tech & Others',
    rfqTemplate: 'PI Tech & Rest + Common Questions',
    timingLob: TimingLob.LIABILITY,
    aliases: ['PI Tech', 'PI', 'Professional Indemnity', 'Cyber'],
  },
  {
    code: ProductTypeCode.CRIME,
    group: ProductGroup.LIABILITY,
    short: 'Crime',
    label: 'Crime',
    rfqTemplate: 'Crime + Common Questions',
    timingLob: TimingLob.LIABILITY_CRIME,
    aliases: ['Crime', 'Crime Insurance'],
  },
  {
    code: ProductTypeCode.PL_ACT,
    group: ProductGroup.LIABILITY,
    short: 'PL Act',
    label: 'Public Liability (Act)',
    rfqTemplate: 'Public Liability - ACT Policy tab',
    timingLob: TimingLob.LIABILITY,
    aliases: ['ACT Policy', 'Public Liability Act'],
  },
  {
    code: ProductTypeCode.PL_GEN,
    group: ProductGroup.LIABILITY,
    short: 'PL Gen',
    label: 'Public Liability',
    rfqTemplate: 'Fire RFQ Main - Public Liability section',
    timingLob: TimingLob.PROPERTY,
    aliases: ['Public Liability'],
  },
  {
    code: ProductTypeCode.WC,
    group: ProductGroup.LIABILITY,
    short: 'WC',
    label: 'Employee Compensation (WC)',
    rfqTemplate: 'WC Policy RFQ',
    timingLob: TimingLob.MARINE,
    aliases: ['WC', "Workmen's Compensation", 'Employee Compensation'],
  },
  {
    code: ProductTypeCode.FIRE_FACTORY,
    group: ProductGroup.PNC,
    short: 'Fire Factory',
    label: 'Fire - Factory / Plant',
    rfqTemplate: 'Fire RFQ Main',
    timingLob: TimingLob.PROPERTY,
    aliases: ['Fire Factory', 'Factory/Plant'],
  },
  {
    code: ProductTypeCode.FIRE_GODOWN,
    group: ProductGroup.PNC,
    short: 'Fire Godown',
    label: 'Fire - Warehouse / Godown',
    rfqTemplate: 'Fire RFQ Open Godown',
    timingLob: TimingLob.PROPERTY,
    aliases: ['Fire Godown', 'Warehouse/godown'],
  },
  {
    code: ProductTypeCode.IAR,
    group: ProductGroup.PNC,
    short: 'IAR',
    label: 'Industrial All Risk (IAR)',
    rfqTemplate: 'IAR RFQ',
    timingLob: TimingLob.PROPERTY,
    aliases: ['IAR', 'Industrial All Risk'],
  },
  {
    code: ProductTypeCode.BURGLARY,
    group: ProductGroup.PNC,
    short: 'Burglary',
    label: 'Burglary',
    rfqTemplate: 'Burglary RFQ',
    timingLob: TimingLob.PROPERTY,
    aliases: ['Burglary', 'Housebreaking', 'Theft'],
  },
  {
    code: ProductTypeCode.MBD_EEP,
    group: ProductGroup.PNC,
    short: 'MBD & EEP',
    label: 'Machinery Breakdown (MBD) & EEP',
    rfqTemplate: 'MBD & EEP RFQ',
    timingLob: TimingLob.PROPERTY,
    aliases: ['MBD', 'Machinery Breakdown', 'EEP'],
  },
  {
    code: ProductTypeCode.CAR,
    group: ProductGroup.PNC,
    short: 'CAR',
    label: 'Contractor All Risk (CAR)',
    rfqTemplate: 'CAR RFQ',
    timingLob: TimingLob.CAR_EAR,
    aliases: ['CAR', 'Contractor All Risk'],
  },
  {
    code: ProductTypeCode.EAR,
    group: ProductGroup.PNC,
    short: 'EAR',
    label: 'Erection All Risk (EAR)',
    rfqTemplate: 'EAR RFQ',
    timingLob: TimingLob.CAR_EAR,
    aliases: ['EAR', 'Erection All Risk', 'Storage cum Erection'],
  },
  {
    code: ProductTypeCode.BGR,
    group: ProductGroup.PNC,
    short: 'BGR',
    label: 'Bharat Griha Raksha (BGR)',
    rfqTemplate: 'BGR RFQ',
    timingLob: TimingLob.PROPERTY,
    aliases: ['BGR', 'Bharat Griha Raksha'],
  },
  {
    code: ProductTypeCode.MARINE_OPEN,
    group: ProductGroup.PNC,
    short: 'Marine Open',
    label: 'Marine Open',
    rfqTemplate: 'Marine Open RFQ',
    timingLob: TimingLob.MARINE,
    aliases: ['Marine Open'],
  },
  {
    code: ProductTypeCode.MARINE_STOP,
    group: ProductGroup.PNC,
    short: 'Marine STOP',
    label: 'Marine STOP',
    rfqTemplate: 'Marine STOP RFQ',
    timingLob: TimingLob.MARINE,
    aliases: ['STOP', 'Marine STOP'],
  },
];

export const BUSINESS_TYPE_SEED = [
  { value: BusinessType.NEW, meaning: 'New policy' },
  { value: BusinessType.RENEWAL, meaning: 'Our renewal' },
  { value: BusinessType.ROLLOVER, meaning: 'Other Co. renewal' },
];

export const INDUSTRY_TYPES_SEED = [
  'Manufacturing',
  'Warehousing & Logistics',
  'Retail / Shops',
  'Services (office-based)',
  'Construction & Contracting',
  'Engineering Services',
  'Technology',
  'Power & Energy',
  'Trading (Domestic / Import / Export)',
  'Residential / Individual',
  'Others',
];

/** Appendix C #19 - placeholder values from the prototype; confirm with Placement Head. */
export const EARLY_RELEASE_REASONS_SEED = ['RM has requested', 'Client wants it fast'];

export const MANDATE_REQUEST_REASONS_SEED = [
  'Client relies on our market view',
  'Several comparable quotes - client wants us to choose',
  'Tight renewal timeline',
  'Client has asked us to handle placement end to end',
  'Other',
];

export const MANDATE_DECLINE_REASONS_SEED = [
  'Client wants to see all options and decide',
  'Client prefers to decide with the insurer directly',
  "Client's group policy requires its own approval",
  'Other',
];

/** Appendix D - rejection & requote taxonomy. */
export const REJECTION_TAXONOMY_SEED = [
  {
    broad: 'Insurer Preference',
    route: 'request_more_quotes',
    examples: [
      'Client does not prefer this insurer',
      'Prior service concern',
      'Group-level insurer restriction',
    ],
  },
  {
    broad: 'Requirement Change',
    route: 'new_rfq_version',
    examples: [
      'Sum insured changed',
      'Risk location changed',
      'Cover scope changed',
      'Material underwriting change',
      'Premium above budget',
      'Cover/terms unacceptable',
    ],
  },
  {
    broad: 'Client Not Proceeding',
    route: 'close_lost',
    examples: ['Purchase postponed', 'No longer interested', 'Bought elsewhere'],
  },
  { broad: 'Other', route: 'placement_review', examples: [] },
] as const;

export const RFQ_UPLOAD_ACCEPT_DEFAULT = ['.xlsx', '.xls', '.csv'];
