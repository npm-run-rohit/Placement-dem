import type { DeliveryPayload } from './contract';
import { deliveryProblem } from './email-layer-inbound.service';

const valid = (): DeliveryPayload => ({
  deliveryId: 'd1',
  product: 'placement',
  conversationRef: 'PLC-1001/TH-01',
  rootMessageId: '<r@x>',
  message: {
    rfcMessageId: '<m@x>',
    inReplyTo: null,
    references: [],
    from: 'a@b.test',
    to: ['c@d.test'],
    cc: [],
    subject: 's',
    textBody: 't',
    htmlBody: null,
    sentAt: '2026-11-18T10:00:00Z',
    seenInMailboxes: ['c@d.test'],
    sentByStaff: false,
    attachments: [],
  },
});

describe('deliveryProblem', () => {
  it('accepts a well formed delivery, with or without a conversation ref', () => {
    expect(deliveryProblem(valid())).toBeNull();
    expect(deliveryProblem({ ...valid(), conversationRef: null })).toBeNull();
  });

  it.each([
    ['no deliveryId', (p: DeliveryPayload) => ({ ...p, deliveryId: '' })],
    ['no product', (p: DeliveryPayload) => ({ ...p, product: '' })],
    ['undefined ref', (p: DeliveryPayload) => ({ ...p, conversationRef: undefined })],
    ['no mailbox', (p: DeliveryPayload) => ({ ...p, message: { ...p.message, seenInMailboxes: [] } })],
    ['bad date', (p: DeliveryPayload) => ({ ...p, message: { ...p.message, sentAt: 'nope' } })],
    [
      'attachment without url',
      (p: DeliveryPayload) => ({
        ...p,
        message: { ...p.message, attachments: [{ fileName: 'a', contentType: 'x', size: 1, url: '' }] },
      }),
    ],
  ])('refuses %s', (_name, mutate) => {
    expect(deliveryProblem(mutate(valid()) as DeliveryPayload)).not.toBeNull();
  });
});
