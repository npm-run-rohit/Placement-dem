import { DateTime } from 'luxon';
import { BUSINESS_CALENDAR_DEFAULTS } from '@bimaplacement/contracts';

export interface BusinessCalendarConfig {
  timezone: string; // IANA, default Asia/Kolkata
  workdays: number[]; // ISO weekday numbers, Mon=1
  dayStart: string; // 'HH:mm'
  dayEnd: string; // 'HH:mm'
  holidays: string[]; // 'yyyy-MM-dd' in the calendar timezone
}

/**
 * Business-time arithmetic (PRD 8.1, FR-057, BR-038).
 * Default: Mon-Fri 10:00-19:00 IST minus holidays = 540 business minutes per day.
 *
 * Pure and deterministic - no DB access. SlaModule builds one from the SLA master /
 * holiday tables and refreshes it when the config changes (BR-091: config applies
 * prospectively; historical events are never recomputed).
 */
export class BusinessCalendar {
  private readonly holidays: Set<string>;
  private readonly startH: number;
  private readonly startM: number;
  private readonly endH: number;
  private readonly endM: number;

  constructor(private readonly cfg: BusinessCalendarConfig) {
    this.holidays = new Set(cfg.holidays);
    [this.startH, this.startM] = cfg.dayStart.split(':').map(Number);
    [this.endH, this.endM] = cfg.dayEnd.split(':').map(Number);
  }

  static withDefaults(holidays: string[] = []): BusinessCalendar {
    return new BusinessCalendar({
      timezone: BUSINESS_CALENDAR_DEFAULTS.timezone,
      workdays: [...BUSINESS_CALENDAR_DEFAULTS.workdays],
      dayStart: BUSINESS_CALENDAR_DEFAULTS.dayStart,
      dayEnd: BUSINESS_CALENDAR_DEFAULTS.dayEnd,
      holidays,
    });
  }

  get minutesPerDay(): number {
    return this.endH * 60 + this.endM - (this.startH * 60 + this.startM);
  }

  isBusinessDay(d: DateTime): boolean {
    const local = d.setZone(this.cfg.timezone);
    return this.cfg.workdays.includes(local.weekday) && !this.holidays.has(local.toISODate()!);
  }

  private window(d: DateTime): { start: DateTime; end: DateTime } {
    const local = d.setZone(this.cfg.timezone).startOf('day');
    return {
      start: local.set({ hour: this.startH, minute: this.startM }),
      end: local.set({ hour: this.endH, minute: this.endM }),
    };
  }

  /** Business minutes elapsed between two instants. Returns a negative value if `to` < `from`. */
  minutesBetween(from: Date, to: Date): number {
    if (to.getTime() < from.getTime()) return -this.minutesBetween(to, from);
    const a = DateTime.fromJSDate(from).setZone(this.cfg.timezone);
    const b = DateTime.fromJSDate(to).setZone(this.cfg.timezone);
    let total = 0;
    let day = a.startOf('day');
    const lastDay = b.startOf('day');
    while (day <= lastDay) {
      if (this.isBusinessDay(day)) {
        const { start, end } = this.window(day);
        const s = a > start ? a : start;
        const e = b < end ? b : end;
        if (e > s) total += e.diff(s, 'minutes').minutes;
      }
      day = day.plus({ days: 1 });
    }
    return Math.floor(total);
  }

  /** The first business instant at or after `from`. */
  nextBusinessMoment(from: Date): Date {
    let cursor: DateTime = DateTime.fromJSDate(from).setZone(this.cfg.timezone);
    for (let guard = 0; guard < 400; guard++) {
      const { start, end } = this.window(cursor);
      if (this.isBusinessDay(cursor) && cursor < end) {
        return (cursor < start ? start : cursor).toJSDate();
      }
      cursor = this.window(cursor.plus({ days: 1 })).start;
    }
    throw new Error('BusinessCalendar: no business day found within 400 days');
  }

  /** Walk forward `mins` business minutes from `from` (reminders falling outside hours roll to the next window). */
  addMinutes(from: Date, mins: number): Date {
    if (mins < 0) throw new Error('addMinutes expects a non-negative value');
    let cursor: DateTime = DateTime.fromJSDate(this.nextBusinessMoment(from)).setZone(this.cfg.timezone);
    let remaining = mins;
    for (let guard = 0; guard < 5000; guard++) {
      const { end } = this.window(cursor);
      const avail = end.diff(cursor, 'minutes').minutes;
      if (remaining <= avail) return cursor.plus({ minutes: remaining }).toJSDate();
      remaining -= avail;
      cursor = DateTime.fromJSDate(this.nextBusinessMoment(end.plus({ minutes: 1 }).toJSDate())).setZone(
        this.cfg.timezone,
      );
    }
    throw new Error('BusinessCalendar: addMinutes exceeded iteration guard');
  }

  addBusinessDays(from: Date, days: number): Date {
    return this.addMinutes(from, days * this.minutesPerDay);
  }
}
