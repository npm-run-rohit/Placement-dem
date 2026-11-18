import { OutcomeType, Stage, Urgency, type TeamDashboard, type WaitAgeing } from '@bimaplacement/contracts';

export interface TeamTicket {
  ticketNo: string;
  stage: Stage;
  ownerId: string | null;
  ownerName: string;
  escalated: boolean;
  urgency: Urgency;
  businessType: string;
  productType: string;
  industryType: string;
  channel: string;
  outcomeType: OutcomeType | null;
  receivedAt: Date;
  /** When the current wait started: RM clock start (awaiting RM), float of the active RFQ (market), draft QCR created (QCR draft). */
  waitSince: Date | null;
  /** live Placement-owned clock state */
  breached: boolean;
  underAnHour: boolean;
}

const AGE_BUCKETS: Array<{ bucket: string; maxDays: number }> = [
  { bucket: 'Under 1 business day', maxDays: 1 },
  { bucket: '1 to 3 business days', maxDays: 3 },
  { bucket: '3 to 7 business days', maxDays: 7 },
  { bucket: '7 business days or more', maxDays: Infinity },
];

/**
 * Placement Head dashboard (PRD 9.2): workload by owner, ageing, the three waits that hold a ticket up,
 * escalations, urgency, no-appetite rate, reassignments and the intake mix. Ages are business days
 * (`minutesPerDay` business minutes each); only Placement-owned clocks can be breached (BR-118).
 */
export function teamDashboard(
  all: TeamTicket[],
  ctx: {
    now: Date;
    minutesBetween(from: Date, to: Date): number;
    minutesPerDay: number;
    reassignmentsLast30Days: number;
  },
): TeamDashboard {
  const open = all.filter((t) => t.stage !== Stage.CLOSED);
  const closed = all.filter((t) => t.stage === Stage.CLOSED);
  const days = (from: Date) => Math.max(0, ctx.minutesBetween(from, ctx.now)) / ctx.minutesPerDay;

  const byOwner = new Map<string, TeamDashboard['workload'][number]>();
  for (const t of open) {
    const key = t.ownerId ?? 'unassigned';
    const row = byOwner.get(key) ?? {
      ownerId: key,
      name: t.ownerName || 'Unassigned',
      open: 0,
      breached: 0,
      underAnHour: 0,
      escalated: 0,
    };
    row.open++;
    if (t.breached) row.breached++;
    if (t.underAnHour) row.underAnHour++;
    if (t.escalated) row.escalated++;
    byOwner.set(key, row);
  }

  const ageing = AGE_BUCKETS.map((b, i) => ({
    bucket: b.bucket,
    n: open.filter((t) => {
      const d = days(t.receivedAt);
      return d < b.maxDays && (i === 0 || d >= AGE_BUCKETS[i - 1].maxDays);
    }).length,
  }));

  const wait = (stage: Stage): WaitAgeing => {
    const rows = open
      .filter((t) => t.stage === stage && t.waitSince)
      .map((t) => ({ no: t.ticketNo, d: days(t.waitSince!) }));
    if (!rows.length)
      return {
        count: open.filter((t) => t.stage === stage).length,
        medianBusinessDays: null,
        oldestBusinessDays: null,
        oldestTicketNo: null,
      };
    const sorted = [...rows].sort((a, b) => a.d - b.d);
    const m = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[m].d : (sorted[m - 1].d + sorted[m].d) / 2;
    const oldest = sorted[sorted.length - 1];
    return {
      count: open.filter((t) => t.stage === stage).length,
      medianBusinessDays: round1(median),
      oldestBusinessDays: round1(oldest.d),
      oldestTicketNo: oldest.no,
    };
  };

  const tally = (pick: (t: TeamTicket) => string) => {
    const m = new Map<string, number>();
    for (const t of all) m.set(pick(t), (m.get(pick(t)) ?? 0) + 1);
    return [...m].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  };

  return {
    workload: [...byOwner.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)),
    ageing,
    awaitingRm: wait(Stage.AWAITING_RM),
    quoteCollection: wait(Stage.MARKET),
    qcrRelease: wait(Stage.QCR_DRAFT),
    escalatedToHead: open.filter((t) => t.escalated).length,
    highUrgency: open.filter((t) => t.urgency === Urgency.HIGH).length,
    noAppetiteRate: closed.length
      ? round3(closed.filter((t) => t.outcomeType === OutcomeType.NO_APPETITE).length / closed.length)
      : null,
    reassignmentsLast30Days: ctx.reassignmentsLast30Days,
    mix: {
      businessType: tally((t) => t.businessType),
      product: tally((t) => t.productType),
      industry: tally((t) => t.industryType),
      channel: tally((t) => t.channel),
    },
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
