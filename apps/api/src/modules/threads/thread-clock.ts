import { ThreadStatus } from '@bimaplacement/contracts';
import type { BusinessCalendar } from '../../common/time/business-calendar';

/**
 * Insurer thread clock (FR-063/064, BR-117): target - (elapsed - held - currently-paused).
 * Returns null for threads whose clock has stopped (usable / excluded / declined / NA) or after auto-stop.
 */
export function threadRemainingMins(
  cal: BusinessCalendar,
  t: {
    status: ThreadStatus;
    floatedAt: Date | null;
    targetMins: number;
    heldMins: number;
    pausedSince: Date | null;
    followUpsActive: boolean;
  },
  now: Date,
  followUpsStopped: boolean,
): number | null {
  if (!t.floatedAt) return null;
  if (
    [
      ThreadStatus.QUOTE_USABLE,
      ThreadStatus.QUOTE_EXCLUDED,
      ThreadStatus.DECLINED,
      ThreadStatus.NOT_APPLICABLE,
    ].includes(t.status)
  )
    return null;
  if (followUpsStopped) return null; // insurer SLA timers stop at the threshold (FR-065)
  const elapsed = cal.minutesBetween(t.floatedAt, now);
  const pausedNow = t.pausedSince ? cal.minutesBetween(t.pausedSince, now) : 0;
  return t.targetMins - (elapsed - t.heldMins - pausedNow);
}
