import { SIGNATURE_HEADER, verifyEmailLayerSignature } from '../../integrations/email-layer/contract';
import {
  EmailLayerMailboxAdapter,
  MailboxNotConnectedError,
  MailRejectedError,
} from './email-layer-mailbox.adapter';
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

  it('throws MailRejectedError (final) on 422 SEND_REJECTED, but a plain Error on a bare 422', async () => {
    fetchMock.mockResolvedValue(reply(422, { code: 'SEND_REJECTED', message: 'Invalid To header' }));
    const e1 = await adapter.send(mail).catch((e) => e);
    expect(e1).toBeInstanceOf(MailRejectedError);
    expect(e1.message).toMatch(/Invalid To header/);
    fetchMock.mockResolvedValue(reply(422, { message: 'Could not fetch attachment rfq.xlsx' }));
    const e2 = await adapter.send(mail).catch((e) => e);
    expect(e2).not.toBeInstanceOf(MailRejectedError);
  });

  it('sends with a timeout signal', async () => {
    fetchMock.mockResolvedValue(
      reply(200, { rfcMessageId: '<m@x>', gmailMessageId: 'g1', gmailThreadId: 't1', sentAt: 'now' }),
    );
    await adapter.send(mail);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('posts to the send path and reads the health shape that the contract doc documents (C1 seam)', async () => {
    const { readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const { resolve } = jest.requireActual<typeof import('node:path')>('node:path');
    const doc = readFileSync(
      resolve(__dirname, '../../../../../docs/integration/EMAIL-LAYER-CONTRACT.md'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    const send = /`POST (\/email-layer\/v1\/[a-z]+)` \(product to layer\)/.exec(doc)?.[1];
    expect(send).toBe('/email-layer/v1/messages');
    fetchMock.mockResolvedValue(
      reply(200, { rfcMessageId: '<m@x>', gmailMessageId: 'g1', gmailThreadId: 't1', sentAt: 'now' }),
    );
    await adapter.send(mail);
    expect(fetchMock.mock.calls[0][0]).toBe(`http://layer.test${send}`);

    const health = JSON.parse(/### Health response\n\n```json\n([\s\S]*?)\n```/.exec(doc)![1]);
    fetchMock.mockResolvedValue(reply(200, health));
    const out = await adapter.health([...health.connected, ...health.mailboxesWithoutSend]);
    expect(out[health.connected[0]]).toEqual({ ok: true });
    expect(out[health.mailboxesWithoutSend[0]].ok).toBe(false);
  });

  it('requires a conversation', async () => {
    await expect(adapter.send({ ...mail, conversation: undefined })).rejects.toThrow(/conversation/);
  });

  it('fetchNew returns nothing and keeps the cursor', async () => {
    await expect(adapter.fetchNew('pm@x', 'c1')).resolves.toEqual({ messages: [], nextCursor: 'c1' });
  });

  it('health: one call; connected is ok, listed without send must reconnect, anyone else has not connected', async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        ok: true,
        connected: ['PM@bimakavach.com'],
        mailboxesWithoutSend: ['col@bimakavach.com'],
      }),
    );
    await expect(
      adapter.health(['pm@bimakavach.com', 'col@bimakavach.com', 'never@bimakavach.com']),
    ).resolves.toEqual({
      'pm@bimakavach.com': { ok: true },
      'col@bimakavach.com': { ok: false, detail: 'col@bimakavach.com must reconnect Gmail to allow sending' },
      'never@bimakavach.com': { ok: false, detail: 'never@bimakavach.com has not connected Gmail' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://layer.test/email-layer/v1/health?product=placement');
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('health reports not ok (never throws) on a network error or an error answer', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(adapter.health(['pm@bimakavach.com'])).resolves.toEqual({
      'pm@bimakavach.com': { ok: false, detail: 'Email layer unreachable: fetch failed' },
    });
    fetchMock.mockResolvedValue(reply(503, {}));
    await expect(adapter.health(['pm@bimakavach.com'])).resolves.toEqual({
      'pm@bimakavach.com': { ok: false, detail: 'Email layer health 503' },
    });
  });
});
