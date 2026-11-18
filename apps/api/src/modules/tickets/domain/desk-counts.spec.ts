import { SlaId, SlaOwnerType, type SlaClockView } from '@bimaplacement/contracts';
import { deskCounts, type DeskTicketFacts } from './desk-counts';

const sla = (ownerType: SlaOwnerType | null, remainingMins: number | null): SlaClockView => ({
  slaId: ownerType ? SlaId.SLA_02 : null,
  ownerType,
  targetMins: 60,
  anchorAt: null,
  remainingMins,
  breached: ownerType === SlaOwnerType.INTERNAL && (remainingMins ?? 0) < 0,
  dueAt: null,
});
const t = (o: Partial<DeskTicketFacts> = {}): DeskTicketFacts => ({
  waitingOnInsurer: false,
  waitingOnRm: false,
  quotesToReview: false,
  sla: sla(null, null),
  ...o,
});
const DUE_SOON = 480;

describe('deskCounts (FR-226, FR-271)', () => {
  it('is all zeros for an empty desk', () => {
    expect(deskCounts([], DUE_SOON)).toEqual({
      insurerResponse: 0,
      rmResponse: 0,
      quotesToReview: 0,
      dueToday: 0,
      overdue: 0,
    });
  });

  it('counts tickets (not threads) waiting on insurers, on the RM and with quotes to review', () => {
    const counts = deskCounts(
      [
        t({ waitingOnInsurer: true, quotesToReview: true }),
        t({ waitingOnInsurer: true }),
        t({ waitingOnRm: true }),
      ],
      DUE_SOON,
    );
    expect(counts).toMatchObject({ insurerResponse: 2, rmResponse: 1, quotesToReview: 1 });
  });

  it('Due Today: internal clock with less than the due-soon threshold left and not breached', () => {
    const counts = deskCounts(
      [
        t({ sla: sla(SlaOwnerType.INTERNAL, 0) }),
        t({ sla: sla(SlaOwnerType.INTERNAL, 479) }),
        t({ sla: sla(SlaOwnerType.INTERNAL, 480) }),
      ],
      DUE_SOON,
    );
    expect(counts).toMatchObject({ dueToday: 2, overdue: 0 });
  });

  it('Overdue: internal clock breached', () => {
    expect(
      deskCounts(
        [t({ sla: sla(SlaOwnerType.INTERNAL, -1) }), t({ sla: sla(SlaOwnerType.INTERNAL, -600) })],
        DUE_SOON,
      ),
    ).toMatchObject({ dueToday: 0, overdue: 2 });
  });

  it('external clocks never count in Due Today or Overdue, even past due (BR-118)', () => {
    expect(
      deskCounts(
        [t({ sla: sla(SlaOwnerType.EXTERNAL, 30) }), t({ sla: sla(SlaOwnerType.EXTERNAL, -300) })],
        DUE_SOON,
      ),
    ).toMatchObject({ dueToday: 0, overdue: 0 });
  });
});
