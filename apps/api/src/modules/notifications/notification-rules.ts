/**
 * In-app notification matrix (PRD module "8. Notifications" tables, TMS rows). Each outbox event on the
 * `notification` destination maps to recipients and a template. `templateId` = a seeded INT-T0x template
 * (communication_templates); events the PRD lists without a template use the short `title` / `body` here
 * (system wording, not PRD copy). Placeholders are filled by `renderTemplate`.
 */
export type Recipient = 'owner' | 'previousOwner' | 'newOwner';

export interface NotificationRule {
  to: Recipient[];
  templateId?: string;
  title?: string;
  body?: string;
}

export const NOTIFICATION_RULES: Record<string, NotificationRule> = {
  'ticket.assigned': { to: ['owner'], templateId: 'INT-T01' },
  'ticket.reassigned': {
    to: ['previousOwner', 'newOwner'],
    title: 'Ticket reassigned - {{TicketID}}',
    body: '{{TicketID}} ({{Client}}) moved from {{FromName}} to {{ToName}}. Reason: {{Reason}}.',
  },
  'sla.p1_reminder': {
    to: ['owner'],
    title: 'SLA breached - {{TicketID}}',
    body: '{{SLA}} has run out on {{TicketID}} ({{Client}}). Reminder {{N}}; the ticket moves to the Placement Head after the last reminder.',
  },
  'sla.p1_escalated': { to: ['newOwner', 'previousOwner'], templateId: 'INT-T06' },
  'rfq.rm_replied': {
    to: ['owner'],
    title: 'RM replied - {{TicketID}}',
    body: 'The RM answered on {{TicketID}} ({{Client}}). Review the answer and resolve the query.',
  },
  'thread.clarification': {
    to: ['owner'],
    title: 'Insurer query received - {{TicketID}} / {{Insurer}}',
    body: '{{Insurer}} raised a query on {{TicketID}} ({{Client}}).',
  },
  'thread.decline': {
    to: ['owner'],
    title: 'Insurer declined - {{TicketID}} / {{Insurer}}',
    body: '{{Insurer}} declined to quote on {{TicketID}} ({{Client}}).',
  },
  'thread.follow_up_escalation': { to: ['owner'], templateId: 'INT-T02' },
  'quote.received': {
    to: ['owner'],
    title: 'Quote received - {{TicketID}} / {{Insurer}}',
    body: '{{Insurer}} sent a quote on {{TicketID}} ({{Client}}). It is waiting for your decision.',
  },
  'quote.threshold_reached': { to: ['owner'], templateId: 'INT-T03' },
  'qcr.ready': {
    to: ['owner'],
    title: 'Copycat QCR ready - {{TicketID}}',
    body: 'QCR V{{QCRVersion}} is ready on {{TicketID}} ({{Client}}). Check the quote rows and send it.',
  },
  'qcr.failed': { to: ['owner'], templateId: 'INT-T04' },
  'revision.requested': {
    to: ['owner'],
    title: 'Revision requested - {{TicketID}}',
    body: 'A revision was requested on {{TicketID}} ({{Client}}). No insurer is contacted until you act.',
  },
  'rfq.v2_created': {
    to: ['owner'],
    title: 'RFQ V2 created - {{TicketID}}',
    body: 'A new RFQ version is active on {{TicketID}} ({{Client}}).',
  },
};

/** The workspace tab a notification opens. */
export function linkFor(eventType: string, ticketNo: string): string {
  const tab = eventType.startsWith('quote.received')
    ? 'quotes'
    : eventType.startsWith('qcr.') ||
        eventType === 'quote.threshold_reached' ||
        eventType === 'revision.requested'
      ? 'qcr'
      : eventType.startsWith('thread.')
        ? 'threads'
        : eventType.startsWith('rfq.')
          ? 'rfq'
          : '';
  return `/tickets/${ticketNo}${tab ? `/${tab}` : ''}`;
}

/** Recipients for an event, deduplicated, never empty ids. */
export function resolveRecipients(
  rule: NotificationRule,
  ids: { ownerId: string | null; previousOwnerId?: string | null; newOwnerId?: string | null },
): string[] {
  const pick: Record<Recipient, string | null | undefined> = {
    owner: ids.ownerId,
    previousOwner: ids.previousOwnerId,
    newOwner: ids.newOwnerId ?? ids.ownerId,
  };
  return [...new Set(rule.to.map((r) => pick[r]).filter((x): x is string => !!x))];
}
