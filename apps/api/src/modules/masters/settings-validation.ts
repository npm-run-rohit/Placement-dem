/**
 * Validation for the app_settings rows the Admin screens edit (FR-139, PLAN 4.2). Pure: the service passes the
 * current value merged with the edit and gets back the value to store, or the reason it is refused (422).
 */

export const EDITABLE_SETTINGS = [
  'business_calendar',
  'thresholds',
  'sla_p1',
  'follow_up_ladder',
  'upload_rules',
] as const;
export type EditableSetting = (typeof EDITABLE_SETTINGS)[number];

export type SettingCheck = { ok: true; value: unknown } | { ok: false; reason: string };

export interface SettingContext {
  /** Active insurer-audience template ids (the follow-up ladder may only point at these). */
  insurerTemplateIds: string[];
}

const ok = (value: unknown): SettingCheck => ({ ok: true, value });
const no = (reason: string): SettingCheck => ({ ok: false, reason });

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const hhmm = (v: unknown): number | null => {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return null;
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

export function isEditableSetting(key: string): key is EditableSetting {
  return (EDITABLE_SETTINGS as readonly string[]).includes(key);
}

export function validateSetting(key: EditableSetting, value: unknown, ctx: SettingContext): SettingCheck {
  switch (key) {
    case 'business_calendar':
      return businessCalendar(value);
    case 'thresholds':
      return thresholds(value);
    case 'sla_p1':
      return slaP1(value);
    case 'follow_up_ladder':
      return followUpLadder(value, ctx);
    case 'upload_rules':
      return uploadRules(value);
  }
}

/** Working days and hours (PRD 8.1). minutesPerDay is derived from the hours so "1 business day" stays consistent. */
function businessCalendar(v: unknown): SettingCheck {
  if (!isObj(v)) return no('Business calendar must be an object');
  const { timezone, workdays, dayStart, dayEnd } = v;
  if (typeof timezone !== 'string' || !validTimezone(timezone)) return no(`Unknown time zone "${timezone}"`);
  if (!Array.isArray(workdays) || !workdays.length || !workdays.every((d) => isInt(d, 1, 7)))
    return no('Pick at least one working day (Mon=1 .. Sun=7)');
  const start = hhmm(dayStart);
  const end = hhmm(dayEnd);
  if (start === null || end === null) return no('Day start and end must be HH:MM (24 hour)');
  if (end - start < 60) return no('The working day must end at least an hour after it starts');
  return ok({
    timezone,
    workdays: [...new Set(workdays as number[])].sort((a, b) => a - b),
    dayStart,
    dayEnd,
    minutesPerDay: end - start,
  });
}

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Usable-quote threshold (BR-041) and the Home / My Tickets risk windows. */
function thresholds(v: unknown): SettingCheck {
  if (!isObj(v)) return no('Thresholds must be an object');
  const { usableQuoteThreshold, dueSoonBusinessMins, slaRiskBusinessMins, atRiskFraction } = v;
  if (!isInt(usableQuoteThreshold, 1, 10))
    return no('Usable quote threshold must be a whole number from 1 to 10');
  if (!isInt(dueSoonBusinessMins, 1, 5400))
    return no('"Due Today" window must be 1 to 5400 business minutes');
  if (!isInt(slaRiskBusinessMins, 1, 5400)) return no('"SLA Risk" window must be 1 to 5400 business minutes');
  if (typeof atRiskFraction !== 'number' || !(atRiskFraction > 0 && atRiskFraction < 1))
    return no('At-risk share must be between 0 and 1');
  return ok({ usableQuoteThreshold, dueSoonBusinessMins, slaRiskBusinessMins, atRiskFraction });
}

/** SLA-P1 internal escalation ladder (FR-225). */
function slaP1(v: unknown): SettingCheck {
  if (!isObj(v)) return no('SLA-P1 settings must be an object');
  const { reminderIntervalMins, remindersBeforeEscalation } = v;
  if (!isInt(reminderIntervalMins, 5, 540)) return no('Reminder interval must be 5 to 540 business minutes');
  if (!isInt(remindersBeforeEscalation, 1, 10)) return no('Reminders before escalation must be 1 to 10');
  return ok({ reminderIntervalMins, remindersBeforeEscalation });
}

/** Insurer follow-up ladder (BR-037): steps in increasing business days, each sending an insurer template. */
function followUpLadder(v: unknown, ctx: SettingContext): SettingCheck {
  if (!Array.isArray(v) || !v.length || v.length > 5) return no('The follow-up ladder needs 1 to 5 steps');
  const steps = [];
  let previous = 0;
  for (const [i, s] of v.entries()) {
    if (!isObj(s)) return no(`Step ${i + 1} is not valid`);
    const days = s.afterBusinessDays;
    if (typeof days !== 'number' || days <= previous || days > 30 || Math.round(days * 2) !== days * 2)
      return no(`Step ${i + 1}: business days must be in half days, above the previous step and at most 30`);
    const label = typeof s.label === 'string' ? s.label.trim() : '';
    if (!label) return no(`Step ${i + 1} needs a label`);
    if (typeof s.templateId !== 'string' || !ctx.insurerTemplateIds.includes(s.templateId))
      return no(`Step ${i + 1}: "${s.templateId}" is not an active insurer template`);
    steps.push({ step: i + 1, afterBusinessDays: days, label, templateId: s.templateId });
    previous = days;
  }
  return ok(steps);
}

/** Accepted upload types (FR-193: RFQ Excel; QCR upload open when null). */
function uploadRules(v: unknown): SettingCheck {
  if (!isObj(v)) return no('Upload rules must be an object');
  const ext = (list: unknown) =>
    Array.isArray(list) &&
    list.length > 0 &&
    list.every((e) => typeof e === 'string' && /^\.[a-z0-9]{1,8}$/.test(e));
  if (!ext(v.rfqAccept)) return no('RFQ file types must be extensions like ".xlsx"');
  if (v.qcrAccept !== null && !ext(v.qcrAccept))
    return no('QCR file types must be extensions like ".pdf", or empty');
  return ok({ rfqAccept: v.rfqAccept, qcrAccept: v.qcrAccept });
}

/** Display text for an SLA target in business minutes (SLA master "Target" column). */
export function slaTargetText(mins: number, minutesPerDay: number): string {
  const plural = (n: number, unit: string) => `${n} business ${unit}${n === 1 ? '' : 's'}`;
  if (mins % minutesPerDay === 0) return plural(mins / minutesPerDay, 'day');
  if (mins % 60 === 0) return plural(mins / 60, 'hour');
  return plural(mins, 'minute');
}

/** {{Placeholder}} names used in a template's subject and body. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];
}
