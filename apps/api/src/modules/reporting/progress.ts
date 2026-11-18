import { SlaId, SlaOwnerType } from '@bimaplacement/contracts';

export interface SlaEventRow {
  ticketId: string;
  slaId: SlaId;
  kind: 'started' | 'stopped';
  at: Date;
  targetMins: number | null;
}

export interface ProgressResult {
  ticketsOnTrack: { onTrack: number; total: number };
  medianSlaUsed: number | null;
  /** Business hours each party held the ticket's clock inside the range. */
  hours: { placement: number; insurer: number; rmClient: number };
}

type Party = keyof ProgressResult['hours'];

/**
 * Home "Your Progress" over a date range (UI-SPEC 3.1, PRD 9.1/9.2) from the ticket clock history
 * (`sla_events`, one clock at a time, FR-222). A clock period runs from `started` to the next `stopped`
 * (still running = up to `now`).
 * - Tickets On Track: tickets with any clock in the range, minus those with a Placement-owned (internal)
 *   clock that ran past its target. External clocks never count as breaches (BR-118).
 * - Median SLA Used: median of used / target over internal clocks in the range (whole period, business time).
 * - Time distribution: business minutes inside the range, by who held the clock: internal -> Placement,
 *   SLA-06 quote collection -> Insurer, any other external clock -> RM / Client.
 */
export function computeProgress(
  events: SlaEventRow[],
  range: { from: Date; to: Date },
  now: Date,
  cal: { minutesBetween(from: Date, to: Date): number },
  ownerTypeOf: (id: SlaId) => SlaOwnerType | undefined,
): ProgressResult {
  const periods: Array<{ ticketId: string; slaId: SlaId; start: Date; end: Date; target: number | null }> =
    [];
  const open = new Map<string, { slaId: SlaId; start: Date; target: number | null }>();
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const cur = open.get(e.ticketId);
    if (cur) periods.push({ ticketId: e.ticketId, ...cur, end: e.at });
    open.delete(e.ticketId);
    if (e.kind === 'started') open.set(e.ticketId, { slaId: e.slaId, start: e.at, target: e.targetMins });
  }
  for (const [ticketId, cur] of open) periods.push({ ticketId, ...cur, end: now });

  const inRange = periods.filter((p) => p.start < range.to && p.end > range.from && p.end > p.start);
  const hours = { placement: 0, insurer: 0, rmClient: 0 };
  const tickets = new Set<string>();
  const breached = new Set<string>();
  const used: number[] = [];
  for (const p of inRange) {
    tickets.add(p.ticketId);
    const internal = ownerTypeOf(p.slaId) === SlaOwnerType.INTERNAL;
    const party: Party = internal ? 'placement' : p.slaId === SlaId.SLA_06 ? 'insurer' : 'rmClient';
    const from = p.start > range.from ? p.start : range.from;
    const to = p.end < range.to ? p.end : range.to;
    hours[party] += Math.max(0, cal.minutesBetween(from, to)) / 60;
    if (internal && p.target) {
      const share = cal.minutesBetween(p.start, p.end) / p.target;
      used.push(share);
      if (share > 1) breached.add(p.ticketId);
    }
  }
  return {
    ticketsOnTrack: { onTrack: tickets.size - breached.size, total: tickets.size },
    medianSlaUsed: median(used),
    hours: {
      placement: round1(hours.placement),
      insurer: round1(hours.insurer),
      rmClient: round1(hours.rmClient),
    },
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
