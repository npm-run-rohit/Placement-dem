import { OutcomeType, Stage, Urgency } from '@bimaplacement/contracts';
import { teamDashboard, type TeamTicket } from './team';

// 1 calendar minute = 1 business minute; a "business day" here is 100 minutes so the arithmetic is obvious
const now = new Date('2026-10-30T12:00:00Z');
const ago = (mins: number) => new Date(now.getTime() - mins * 60_000);
const ctx = {
  now,
  minutesBetween: (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000),
  minutesPerDay: 100,
  reassignmentsLast30Days: 4,
};
const t = (over: Partial<TeamTicket>): TeamTicket => ({
  ticketNo: 'PLC-1',
  stage: Stage.RFQ_REVIEW,
  ownerId: 'pm1',
  ownerName: 'Asha',
  escalated: false,
  urgency: Urgency.MEDIUM,
  businessType: 'New',
  productType: 'GMC',
  industryType: 'Manufacturing',
  channel: 'manual',
  outcomeType: null,
  receivedAt: ago(50),
  waitSince: null,
  breached: false,
  underAnHour: false,
  ...over,
});

describe('teamDashboard (PRD 9.2)', () => {
  it('counts workload per owner, busiest first, with breaches and escalations', () => {
    const r = teamDashboard(
      [
        t({ breached: true }),
        t({ ticketNo: 'PLC-2', underAnHour: true }),
        t({ ticketNo: 'PLC-3', ownerId: 'head', ownerName: 'Himani', escalated: true }),
      ],
      ctx,
    );
    expect(r.workload).toEqual([
      { ownerId: 'pm1', name: 'Asha', open: 2, breached: 1, underAnHour: 1, escalated: 0 },
      { ownerId: 'head', name: 'Himani', open: 1, breached: 0, underAnHour: 0, escalated: 1 },
    ]);
    expect(r.escalatedToHead).toBe(1);
  });

  it('buckets open tickets by business days since received, and ignores closed ones', () => {
    const r = teamDashboard(
      [
        t({ receivedAt: ago(50) }),
        t({ receivedAt: ago(250) }),
        t({ receivedAt: ago(900) }),
        t({ stage: Stage.CLOSED, receivedAt: ago(50), outcomeType: OutcomeType.LOST }),
      ],
      ctx,
    );
    expect(r.ageing.map((a) => a.n)).toEqual([1, 1, 0, 1]);
  });

  it('measures each wait from when it started, with the oldest ticket named', () => {
    const r = teamDashboard(
      [
        t({ ticketNo: 'PLC-5', stage: Stage.MARKET, waitSince: ago(300) }),
        t({ ticketNo: 'PLC-6', stage: Stage.MARKET, waitSince: ago(100) }),
        t({ ticketNo: 'PLC-7', stage: Stage.AWAITING_RM, waitSince: ago(150) }),
      ],
      ctx,
    );
    expect(r.quoteCollection).toEqual({
      count: 2,
      medianBusinessDays: 2,
      oldestBusinessDays: 3,
      oldestTicketNo: 'PLC-5',
    });
    expect(r.awaitingRm).toMatchObject({ count: 1, oldestBusinessDays: 1.5, oldestTicketNo: 'PLC-7' });
    expect(r.qcrRelease).toEqual({
      count: 0,
      medianBusinessDays: null,
      oldestBusinessDays: null,
      oldestTicketNo: null,
    });
  });

  it('reports the no-appetite rate over closed tickets, high urgency, and the intake mix', () => {
    const r = teamDashboard(
      [
        t({ urgency: Urgency.HIGH }),
        t({ stage: Stage.CLOSED, outcomeType: OutcomeType.NO_APPETITE, channel: 'bimasetu' }),
        t({ stage: Stage.CLOSED, outcomeType: OutcomeType.QUOTE_SELECTED, businessType: 'Renewal' }),
      ],
      ctx,
    );
    expect(r.noAppetiteRate).toBe(0.5);
    expect(r.highUrgency).toBe(1);
    expect(r.mix.channel).toEqual([
      { key: 'manual', n: 2 },
      { key: 'bimasetu', n: 1 },
    ]);
    expect(r.mix.businessType).toEqual([
      { key: 'New', n: 2 },
      { key: 'Renewal', n: 1 },
    ]);
    expect(r.reassignmentsLast30Days).toBe(4);
  });

  it('has no rate before anything closed', () => {
    expect(teamDashboard([t({})], ctx).noAppetiteRate).toBeNull();
  });
});
