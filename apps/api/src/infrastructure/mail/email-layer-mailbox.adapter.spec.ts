import { SIGNATURE_HEADER, verifyEmailLayerSignature } from '../../integrations/email-layer/contract';
import { EmailLayerMailboxAdapter, MailboxNotConnectedError } from './email-layer-mailbox.adapter';
import type { StoragePort } from '../storage/storage.port';

const cfg = { url: 'http://layer.test/', secret: 'shh', webhookToleranceSeconds: 300 };
const storage = {
  signedDownloadUrl: jest.fn(async (key: string) => `https://s3.test/${key}?sig=1`),
} as unknown as StoragePort;

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('EmailLayerMailboxAdapter', () => {
  let fetchMock: jest.Mock;
  let adapter: EmailLayerMailboxAdapter;
  const mail = {
    fromMailbox: 'pm@bimakavach.com',
    to: ['a@ins.com'],
    cc: ['b@ins.com'],
    subject: '[PLC-1001 | TH-01] RFQ',
    html: '<p>Hi</p>',
    text: 'Hi',
    attachments: [
      { fileName: 'rfq.xlsx', contentType: 'application/x-xlsx', storageKey: 'tickets/1/rfq.xlsx' },
    ],
    conversation: { ref: 'PLC-1001/TH-01', replyToMessageId: '<prev@x>' },
    idempotencyKey: 'outbox-1',
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as { fetch: unknown }).fetch = fetchMock;
    adapter = new EmailLayerMailboxAdapter(cfg, storage);
  });

  it('posts a signed SendRequest with the conversation and idempotency key', async () => {
    fetchMock.mockResolvedValue(
      reply(200, { rfcMessageId: '<m@x>', gmailMessageId: 'g1', gmailThreadId: 't1', sentAt: 'now' }),
    );
    await adapter.send(mail);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://layer.test/email-layer/v1/messages');
    expect(verifyEmailLayerSignature(init.body, init.headers[SIGNATURE_HEADER], 'shh', 300)).toBe(true);
    expect(JSON.parse(init.body)).toEqual({
      product: 'placement',
      idempotencyKey: 'outbox-1',
      from: 'pm@bimakavach.com',
      to: ['a@ins.com'],
      cc: ['b@ins.com'],
      subject: '[PLC-1001 | TH-01] RFQ',
      text: 'Hi',
      html: '<p>Hi</p>',
      attachments: [
        {
          fileName: 'rfq.xlsx',
          contentType: 'application/x-xlsx',
          url: 'https://s3.test/tickets/1/rfq.xlsx?sig=1',
        },
      ],
      conversation: { ref: 'PLC-1001/TH-01', replyToMessageId: '<prev@x>' },
    });
  });

  it('maps the response to providerMessageId = rfcMessageId', async () => {
    fetchMock.mockResolvedValue(
      reply(200, { rfcMessageId: '<m@x>', gmailMessageId: 'g1', gmailThreadId: 't1', sentAt: 'now' }),
    );
    await expect(adapter.send(mail)).resolves.toEqual({ providerMessageId: '<m@x>', providerThreadId: 't1' });
  });

  it('throws MailboxNotConnectedError on 409 MAILBOX_NOT_CONNECTED', async () => {
    fetchMock.mockResolvedValue(reply(409, { code: 'MAILBOX_NOT_CONNECTED' }));
    await expect(adapter.send(mail)).rejects.toBeInstanceOf(MailboxNotConnectedError);
  });

  it('throws a plain retryable Error on 409 SEND_IN_PROGRESS and on 5xx', async () => {
    fetchMock.mockResolvedValue(reply(409, { code: 'SEND_IN_PROGRESS' }));
    const e1 = await adapter.send(mail).catch((e) => e);
    expect(e1).toBeInstanceOf(Error);
    expect(e1).not.toBeInstanceOf(MailboxNotConnectedError);
    fetchMock.mockResolvedValue(reply(503, {}));
    const e2 = await adapter.send(mail).catch((e) => e);
    expect(e2).not.toBeInstanceOf(MailboxNotConnectedError);
    expect(e2.message).toMatch(/503/);
  });

  it('requires a conversation', async () => {
    await expect(adapter.send({ ...mail, conversation: undefined })).rejects.toThrow(/conversation/);
  });

  it('fetchNew returns nothing and keeps the cursor', async () => {
    await expect(adapter.fetchNew('pm@x', 'c1')).resolves.toEqual({ messages: [], nextCursor: 'c1' });
  });

  it('health lists an unconnected mailbox as not ok', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, mailboxesWithoutSend: ['pm@bimakavach.com'] }));
    await expect(adapter.health('pm@bimakavach.com')).resolves.toEqual({
      ok: false,
      detail: 'pm@bimakavach.com has not connected Gmail for sending',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('http://layer.test/email-layer/v1/health?product=placement');
    await expect(adapter.health('other@bimakavach.com')).resolves.toEqual({ ok: true });
  });
});
