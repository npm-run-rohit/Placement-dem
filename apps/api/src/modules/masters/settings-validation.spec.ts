import { placeholders, slaTargetText, validateSetting } from './settings-validation';

const ctx = { insurerTemplateIds: ['INS-T02', 'INS-T03', 'INS-T04'] };

describe('validateSetting', () => {
  it('derives minutes per day from the working hours', () => {
    const r = validateSetting(
      'business_calendar',
      { timezone: 'Asia/Kolkata', workdays: [5, 1, 2, 3, 4, 1], dayStart: '09:30', dayEnd: '18:30' },
      ctx,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        timezone: 'Asia/Kolkata',
        workdays: [1, 2, 3, 4, 5],
        dayStart: '09:30',
        dayEnd: '18:30',
        minutesPerDay: 540,
      },
    });
  });

  it('refuses a bad calendar', () => {
    const base = { timezone: 'Asia/Kolkata', workdays: [1], dayStart: '10:00', dayEnd: '19:00' };
    expect(validateSetting('business_calendar', { ...base, timezone: 'Mars/Base' }, ctx).ok).toBe(false);
    expect(validateSetting('business_calendar', { ...base, workdays: [] }, ctx).ok).toBe(false);
    expect(validateSetting('business_calendar', { ...base, workdays: [8] }, ctx).ok).toBe(false);
    expect(validateSetting('business_calendar', { ...base, dayEnd: '10:30' }, ctx).ok).toBe(false);
    expect(validateSetting('business_calendar', { ...base, dayStart: '9:00' }, ctx).ok).toBe(false);
  });

  it('checks thresholds and SLA-P1 ranges', () => {
    const t = {
      usableQuoteThreshold: 3,
      dueSoonBusinessMins: 480,
      slaRiskBusinessMins: 60,
      atRiskFraction: 0.2,
    };
    expect(validateSetting('thresholds', t, ctx).ok).toBe(true);
    expect(validateSetting('thresholds', { ...t, usableQuoteThreshold: 0 }, ctx).ok).toBe(false);
    expect(validateSetting('thresholds', { ...t, atRiskFraction: 1 }, ctx).ok).toBe(false);
    expect(
      validateSetting('sla_p1', { reminderIntervalMins: 30, remindersBeforeEscalation: 3 }, ctx).ok,
    ).toBe(true);
    expect(validateSetting('sla_p1', { reminderIntervalMins: 2, remindersBeforeEscalation: 3 }, ctx).ok).toBe(
      false,
    );
  });

  it('numbers ladder steps and requires increasing days and insurer templates', () => {
    const ladder = [
      { afterBusinessDays: 1, label: ' Follow-up 1 ', templateId: 'INS-T02' },
      { afterBusinessDays: 2.5, label: 'Escalation', templateId: 'INS-T04' },
    ];
    expect(validateSetting('follow_up_ladder', ladder, ctx)).toEqual({
      ok: true,
      value: [
        { step: 1, afterBusinessDays: 1, label: 'Follow-up 1', templateId: 'INS-T02' },
        { step: 2, afterBusinessDays: 2.5, label: 'Escalation', templateId: 'INS-T04' },
      ],
    });
    expect(validateSetting('follow_up_ladder', [ladder[1], ladder[0]], ctx).ok).toBe(false);
    expect(validateSetting('follow_up_ladder', [{ ...ladder[0], afterBusinessDays: 1.2 }], ctx).ok).toBe(
      false,
    );
    expect(validateSetting('follow_up_ladder', [{ ...ladder[0], templateId: 'RM-T01' }], ctx).ok).toBe(false);
    expect(validateSetting('follow_up_ladder', [], ctx).ok).toBe(false);
  });

  it('accepts extension lists for uploads', () => {
    expect(validateSetting('upload_rules', { rfqAccept: ['.xlsx'], qcrAccept: null }, ctx).ok).toBe(true);
    expect(validateSetting('upload_rules', { rfqAccept: ['xlsx'], qcrAccept: null }, ctx).ok).toBe(false);
    expect(validateSetting('upload_rules', { rfqAccept: ['.xlsx'], qcrAccept: [] }, ctx).ok).toBe(false);
  });
});

describe('slaTargetText', () => {
  it('writes the target in business days, hours or minutes', () => {
    expect(slaTargetText(540, 540)).toBe('1 business day');
    expect(slaTargetText(1080, 540)).toBe('2 business days');
    expect(slaTargetText(120, 540)).toBe('2 business hours');
    expect(slaTargetText(45, 540)).toBe('45 business minutes');
  });
});

describe('placeholders', () => {
  it('lists each placeholder once', () => {
    expect(placeholders('[{{TicketID}} | {{ ThreadID }}] {{TicketID}}')).toEqual(['TicketID', 'ThreadID']);
  });
});
