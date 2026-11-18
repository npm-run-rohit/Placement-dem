import { ThreadStatus } from '@bimaplacement/contracts';

/** Only threads still waiting on the insurer are chased; any reply, decline or decision stops the ladder. */
export const FOLLOW_UP_STATUSES: readonly ThreadStatus[] = [ThreadStatus.RFQ_SENT, ThreadStatus.ACKNOWLEDGED];

/**
 * Which follow-up step (1-based, ladder order) is due on a thread, or null (BR-037..041).
 * `activeMins` = business minutes since float minus time held for RM information (BR-040).
 * When several steps are overdue (e.g. the worker was down) only the latest is sent, so an insurer
 * never gets a burst of reminders.
 */
export function dueFollowUpStep(
  activeMins: number,
  sent: number,
  ladder: ReadonlyArray<{ step: number; afterBusinessDays: number }>,
  minutesPerDay: number,
): number | null {
  const due = [...ladder]
    .sort((a, b) => a.step - b.step)
    .filter((s) => activeMins >= s.afterBusinessDays * minutesPerDay);
  const latest = due.at(-1);
  return latest && latest.step > sent ? latest.step : null;
}
