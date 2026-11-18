import { SlaOwnerType, type SlaClockView, type SlaId } from '@bimaplacement/contracts';

/** What the business calendar must provide (keeps this pure and testable). */
export interface BusinessMinutes {
  minutesBetween(from: Date, to: Date): number;
}

/**
 * The ticket's single SLA clock as shown in the queue, header and rail (FR-221/222, BR-118):
 * remaining business minutes until due (negative once past). Only an internal clock can breach;
 * external clocks (RM, insurer, client) are waits, never breaches.
 */
export function slaClockView(
  t: {
    slaId: SlaId | null;
    slaOwnerType: SlaOwnerType | null;
    slaTargetMins: number | null;
    slaAnchorAt: Date | null;
    slaDueAt: Date | null;
  },
  cal: BusinessMinutes,
  now: Date,
): SlaClockView {
  if (!t.slaId)
    return {
      slaId: null,
      ownerType: null,
      targetMins: null,
      anchorAt: null,
      remainingMins: null,
      breached: false,
      dueAt: null,
    };
  const remainingMins = t.slaDueAt
    ? now <= t.slaDueAt
      ? cal.minutesBetween(now, t.slaDueAt)
      : -cal.minutesBetween(t.slaDueAt, now)
    : null;
  return {
    slaId: t.slaId,
    ownerType: t.slaOwnerType,
    targetMins: t.slaTargetMins,
    anchorAt: t.slaAnchorAt?.toISOString() ?? null,
    remainingMins,
    breached: t.slaOwnerType === SlaOwnerType.INTERNAL && remainingMins !== null && remainingMins < 0,
    dueAt: t.slaDueAt?.toISOString() ?? null,
  };
}
