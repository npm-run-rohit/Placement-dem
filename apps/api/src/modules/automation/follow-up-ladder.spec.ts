import { FOLLOW_UP_LADDER_DEFAULTS } from '@bimaplacement/contracts';
import { dueFollowUpStep } from './follow-up-ladder';

const BD = 540;

describe('dueFollowUpStep', () => {
  it('sends nothing before one business day', () => {
    expect(dueFollowUpStep(BD - 1, 0, FOLLOW_UP_LADDER_DEFAULTS, BD)).toBeNull();
  });

  it('sends follow-up 1, 2 and the escalation at 1, 2 and 3 business days (BR-037)', () => {
    expect(dueFollowUpStep(BD, 0, FOLLOW_UP_LADDER_DEFAULTS, BD)).toBe(1);
    expect(dueFollowUpStep(2 * BD, 1, FOLLOW_UP_LADDER_DEFAULTS, BD)).toBe(2);
    expect(dueFollowUpStep(3 * BD, 2, FOLLOW_UP_LADDER_DEFAULTS, BD)).toBe(3);
  });

  it('never repeats a step already sent, and stops after the escalation', () => {
    expect(dueFollowUpStep(BD + 30, 1, FOLLOW_UP_LADDER_DEFAULTS, BD)).toBeNull();
    expect(dueFollowUpStep(10 * BD, 3, FOLLOW_UP_LADDER_DEFAULTS, BD)).toBeNull();
  });

  it('jumps to the latest overdue step instead of sending a burst', () => {
    expect(dueFollowUpStep(3 * BD + 5, 0, FOLLOW_UP_LADDER_DEFAULTS, BD)).toBe(3);
  });

  it('follows a configured ladder', () => {
    const ladder = [
      { step: 1, afterBusinessDays: 0.5 },
      { step: 2, afterBusinessDays: 2 },
    ];
    expect(dueFollowUpStep(BD / 2, 0, ladder, BD)).toBe(1);
  });
});
