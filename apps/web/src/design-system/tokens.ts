import type { Tone } from '@bimaplacement/contracts';

/** Programmatic tokens for places Tailwind classes can't reach (charts, inline SVG, dynamic tones). */
export const tone: Record<Tone, { fg: string; bg: string; line: string }> = {
  neutral: { fg: '#6F7378', bg: '#F4F5F6', line: '#E6E8EA' },
  purple: { fg: '#320099', bg: '#F4F1FF', line: '#EDE6FF' },
  orange: { fg: '#A15C00', bg: '#FDF2E1', line: '#F2DBBE' },
  green: { fg: '#0F7A4C', bg: '#E4F5EC', line: '#B6E2CB' },
  red: { fg: '#B3261E', bg: '#FBEAE8', line: '#F1CCC8' },
  blue: { fg: '#1458D2', bg: '#E8F1FA', line: '#C3DAF0' },
  amber: { fg: '#8A6D1F', bg: '#FDF6DC', line: '#EFE0A8' },
};

/** Status-pill indicator palette (prototype IND). */
export const indicator = {
  error: { dot: '#F10000', line: '#FFABAB', tint: 'rgba(241,0,0,0.08)', text: '#CF0000' },
  caution: { dot: '#FFCF0E', line: '#FFE890', tint: 'rgba(255,207,14,0.12)', text: '#B38F0A' },
  info: { dot: '#1869F4', line: '#B9D1FF', tint: 'rgba(24,105,244,0.08)', text: '#1868F4' },
  neutral: { dot: '#6F7378', line: '#D2D5D8', tint: 'rgba(169,172,177,0.16)', text: '#6F7378' },
  success: { dot: '#00B200', line: '#A9EAA2', tint: 'rgba(0,178,0,0.08)', text: '#007B00' },
  brand: { dot: '#4100CF', line: '#D1C6FF', tint: 'rgba(65,0,207,0.08)', text: '#4100CF' },
  muted: { dot: '#A9ACB1', line: '#E6E8EA', tint: '#F4F5F6', text: '#A9ACB1' },
  orange: { dot: '#FF7700', line: '#FFD2A8', tint: 'rgba(255,119,0,0.08)', text: '#A15C00' },
} as const;
export type Ind = keyof typeof indicator;
export const toneToInd: Record<Tone, Ind> = {
  orange: 'caution',
  amber: 'caution',
  purple: 'brand',
  blue: 'info',
  green: 'success',
  red: 'error',
  neutral: 'neutral',
};

/** Body ink and surfaces for inline styles (match tailwind.config.ts). */
/** Placement page tint (tailwind `placement.bg`). */
export const placementBg = '#EEF4FF';

export const ink = {
  text: '#1C1D1F',
  line: '#D2D5D8',
  track: '#ECECF1',
  canvas: '#F4F5F6',
  white: '#FFFFFF',
} as const;

/** Home desk-card gradient tints (UI-SPEC 3.1). */
export const deskTint = {
  insurer: '#FFF6E0',
  rm: '#E9F1FF',
  quotes: '#E9FBF0',
  dueToday: '#FFF7DA',
  overdue: '#FFECEC',
} as const;

/** Ticket Time Distribution donut: who held the clock (UI-SPEC 3.1). */
export const party = { placement: '#D9D0FF', insurer: '#FFE9AE', rmClient: '#CFE0FF' } as const;

/** Stage-timeline card states (UI-SPEC 3.3.1). */
export const slaState = {
  ok: { bg: '#ECFBEA', line: '#A9EAA2', text: '#007B00', dot: '#00B200' },
  atRisk: { bg: '#FFF9E6', line: '#FFE890', text: '#B38F0A', dot: '#FFCF0E' },
  breached: { bg: '#FFECEC', line: '#FFABAB', text: '#CF0000', dot: '#F10000' },
} as const;
