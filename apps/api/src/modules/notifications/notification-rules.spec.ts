import { NOTIFICATION_RULES, linkFor, resolveRecipients } from './notification-rules';

describe('notification rules', () => {
  it('notifies the Head and the previous owner on escalation, once each (PRD: Placement Head + previous owner)', () => {
    expect(
      resolveRecipients(NOTIFICATION_RULES['sla.p1_escalated'], { ownerId: 'head', previousOwnerId: 'pm' }),
    ).toEqual(['head', 'pm']);
  });

  it('notifies both owners on a reassignment, and only once when they are the same person', () => {
    expect(
      resolveRecipients(NOTIFICATION_RULES['ticket.reassigned'], {
        ownerId: null,
        previousOwnerId: 'a',
        newOwnerId: 'b',
      }),
    ).toEqual(['a', 'b']);
    expect(
      resolveRecipients(NOTIFICATION_RULES['ticket.reassigned'], {
        ownerId: null,
        previousOwnerId: 'a',
        newOwnerId: 'a',
      }),
    ).toEqual(['a']);
  });

  it('uses the seeded PRD templates where they exist', () => {
    expect(NOTIFICATION_RULES['ticket.assigned'].templateId).toBe('INT-T01');
    expect(NOTIFICATION_RULES['thread.follow_up_escalation'].templateId).toBe('INT-T02');
    expect(NOTIFICATION_RULES['quote.threshold_reached'].templateId).toBe('INT-T03');
    expect(NOTIFICATION_RULES['qcr.failed'].templateId).toBe('INT-T04');
    expect(NOTIFICATION_RULES['sla.p1_escalated'].templateId).toBe('INT-T06');
  });

  it('every rule has either a template or its own wording', () => {
    for (const [event, r] of Object.entries(NOTIFICATION_RULES))
      expect([event, !!r.templateId || (!!r.title && !!r.body)]).toEqual([event, true]);
  });

  it('opens the tab the event is about', () => {
    expect(linkFor('quote.received', 'PLC-1001')).toBe('/tickets/PLC-1001/quotes');
    expect(linkFor('qcr.failed', 'PLC-1001')).toBe('/tickets/PLC-1001/qcr');
    expect(linkFor('thread.decline', 'PLC-1001')).toBe('/tickets/PLC-1001/threads');
    expect(linkFor('sla.p1_escalated', 'PLC-1001')).toBe('/tickets/PLC-1001');
  });
});
