import { SlaId, SlaOwnerType } from '@bimaplacement/contracts';
import { slaClockView } from './sla-view';

// 1 calendar minute = 1 business minute keeps the arithmetic obvious; the real calendar is tested separately
const flat = { minutesBetween: (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000) };
const at = (iso: string) => new Date(iso);
const clock = (owner: SlaOwnerType, due: string) => ({
  slaId: SlaId.SLA_02,
  slaOwnerType: owner,
  slaTargetMins: 60,
  slaAnchorAt: at('2026-10-29T10:00:00Z'),
  slaDueAt: at(due),
});

describe('slaClockView', () => {
  it('is empty when the ticket has no clock (closed)', () => {
    expect(
      slaClockView(
        { slaId: null, slaOwnerType: null, slaTargetMins: null, slaAnchorAt: null, slaDueAt: null },
        flat,
        at('2026-10-29T10:30:00Z'),
      ),
    ).toEqual({
      slaId: null,
      ownerType: null,
      targetMins: null,
      anchorAt: null,
      remainingMins: null,
      breached: false,
      dueAt: null,
    });
  });

  it('counts down the remaining business minutes', () => {
    const v = slaClockView(
      clock(SlaOwnerType.INTERNAL, '2026-10-29T11:00:00Z'),
      flat,
      at('2026-10-29T10:35:00Z'),
    );
    expect(v).toMatchObject({
      slaId: SlaId.SLA_02,
      remainingMins: 25,
      breached: false,
      dueAt: '2026-10-29T11:00:00.000Z',
      anchorAt: '2026-10-29T10:00:00.000Z',
    });
  });

  it('goes negative and breaches once an internal clock is past due (FR-225)', () => {
    expect(
      slaClockView(clock(SlaOwnerType.INTERNAL, '2026-10-29T11:00:00Z'), flat, at('2026-10-29T11:40:00Z')),
    ).toMatchObject({ remainingMins: -40, breached: true });
  });

  it('never breaches an external clock, even past due (BR-118)', () => {
    expect(
      slaClockView(clock(SlaOwnerType.EXTERNAL, '2026-10-29T11:00:00Z'), flat, at('2026-10-29T15:00:00Z')),
    ).toMatchObject({ remainingMins: -240, breached: false });
  });
});
