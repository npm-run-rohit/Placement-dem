import { SLA_MASTER_SEED, SlaId } from '@bimaplacement/contracts';
import { computeProgress, type SlaEventRow } from './progress';

// 1 calendar minute = 1 business minute keeps the arithmetic obvious; the real calendar is tested separately
const flat = { minutesBetween: (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000) };
const owner = (id: SlaId) => SLA_MASTER_SEED.find((d) => d.id === id)?.ownerType;
const at = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00Z`);
const ev = (
  ticketId: string,
  slaId: SlaId,
  kind: 'started' | 'stopped',
  hhmm: string,
  targetMins: number | null = null,
): SlaEventRow => ({ ticketId, slaId, kind, at: at(hhmm), targetMins });
const range = { from: at('10:00'), to: at('18:00') };
const now = at('17:00');

describe('computeProgress', () => {
  it('counts a ticket on track when its internal clocks finished inside their targets', () => {
    const r = computeProgress(
      [
        ev('A', SlaId.SLA_02, 'started', '10:00', 60),
        ev('A', SlaId.SLA_02, 'stopped', '10:30'),
        ev('A', SlaId.SLA_04, 'started', '10:30', 120),
        ev('A', SlaId.SLA_04, 'stopped', '11:30'),
      ],
      range,
      now,
      flat,
      owner,
    );
    expect(r.ticketsOnTrack).toEqual({ onTrack: 1, total: 1 });
    expect(r.medianSlaUsed).toBe(0.5); // 30/60 and 60/120
    expect(r.hours).toEqual({ placement: 1.5, insurer: 0, rmClient: 0 });
  });

  it('marks a ticket off track when an internal clock ran past its target, including one still running', () => {
    const r = computeProgress(
      [
        ev('A', SlaId.SLA_02, 'started', '10:00', 60),
        ev('A', SlaId.SLA_02, 'stopped', '12:00'),
        ev('B', SlaId.SLA_10, 'started', '14:00', 120),
      ],
      range,
      now,
      flat,
      owner,
    );
    expect(r.ticketsOnTrack).toEqual({ onTrack: 0, total: 2 }); // A used 120/60, B running 180/120
    expect(r.medianSlaUsed).toBe(1.75);
  });

  it('never counts an external wait as a breach, and splits time between insurer and RM / client', () => {
    const r = computeProgress(
      [
        ev('A', SlaId.SLA_06, 'started', '10:00', 60),
        ev('A', SlaId.SLA_06, 'stopped', '13:00'),
        ev('A', SlaId.SLA_03, 'started', '13:00', 30),
        ev('A', SlaId.SLA_03, 'stopped', '14:00'),
      ],
      range,
      now,
      flat,
      owner,
    );
    expect(r.ticketsOnTrack).toEqual({ onTrack: 1, total: 1 });
    expect(r.medianSlaUsed).toBeNull();
    expect(r.hours).toEqual({ placement: 0, insurer: 3, rmClient: 1 });
  });

  it('only counts the part of a clock inside the range, and ignores clocks outside it', () => {
    const r = computeProgress(
      [
        ev('A', SlaId.SLA_06, 'started', '08:00', 600),
        ev('A', SlaId.SLA_06, 'stopped', '11:00'),
        ev('B', SlaId.SLA_02, 'started', '07:00', 60),
        ev('B', SlaId.SLA_02, 'stopped', '07:30'),
      ],
      range,
      now,
      flat,
      owner,
    );
    expect(r.hours.insurer).toBe(1);
    expect(r.ticketsOnTrack.total).toBe(1);
  });
});
