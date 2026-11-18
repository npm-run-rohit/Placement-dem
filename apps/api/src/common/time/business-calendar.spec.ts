import { BusinessCalendar } from './business-calendar';

// All instants are written in IST (+05:30) to keep the tests readable.
const ist = (s: string) => new Date(`${s}+05:30`);

describe('BusinessCalendar (Mon-Fri 10:00-19:00 IST)', () => {
  const cal = BusinessCalendar.withDefaults(['2026-10-02', '2026-10-20']);

  it('has 540 business minutes per day', () => {
    expect(cal.minutesPerDay).toBe(540);
  });

  it('counts minutes inside a single business day', () => {
    expect(cal.minutesBetween(ist('2026-10-27T10:00:00'), ist('2026-10-27T11:30:00'))).toBe(90);
  });

  it('ignores time outside business hours', () => {
    expect(cal.minutesBetween(ist('2026-10-27T08:00:00'), ist('2026-10-27T20:00:00'))).toBe(540);
  });

  it('skips weekends', () => {
    // Fri 18:00 -> Mon 11:00 = 60 + 60
    expect(cal.minutesBetween(ist('2026-10-30T18:00:00'), ist('2026-11-02T11:00:00'))).toBe(120);
  });

  it('skips configured holidays', () => {
    // Mon 19 Oct 18:00 -> Wed 21 Oct 11:00, Tue 20 Oct is a holiday = 60 + 60
    expect(cal.minutesBetween(ist('2026-10-19T18:00:00'), ist('2026-10-21T11:00:00'))).toBe(120);
  });

  it('is negative when to < from', () => {
    expect(cal.minutesBetween(ist('2026-10-27T11:00:00'), ist('2026-10-27T10:00:00'))).toBe(-60);
  });

  it('adds minutes rolling into the next business day', () => {
    // Thu 29 Oct 18:30 + 60 BM = Fri 30 Oct 10:30
    expect(cal.addMinutes(ist('2026-10-29T18:30:00'), 60).toISOString()).toBe(
      ist('2026-10-30T10:30:00').toISOString(),
    );
  });

  it('adds minutes across a weekend', () => {
    // Fri 30 Oct 18:00 + 120 BM = Mon 2 Nov 11:00
    expect(cal.addMinutes(ist('2026-10-30T18:00:00'), 120).toISOString()).toBe(
      ist('2026-11-02T11:00:00').toISOString(),
    );
  });

  it('starts from the next window when called outside hours', () => {
    // Sat 31 Oct 12:00 + 30 BM = Mon 2 Nov 10:30
    expect(cal.addMinutes(ist('2026-10-31T12:00:00'), 30).toISOString()).toBe(
      ist('2026-11-02T10:30:00').toISOString(),
    );
  });

  it('adds business days', () => {
    // Tue 27 Oct 14:00 + 1 BD = Wed 28 Oct 14:00
    expect(cal.addBusinessDays(ist('2026-10-27T14:00:00'), 1).toISOString()).toBe(
      ist('2026-10-28T14:00:00').toISOString(),
    );
  });
});
