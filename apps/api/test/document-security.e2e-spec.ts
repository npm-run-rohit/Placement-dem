import request from 'supertest';
import { DataSource } from 'typeorm';
import { RateLimiter } from '../src/common/rate-limit/rate-limiter';
import { InboundMailService } from '../src/modules/inbound-mail/inbound-mail.service';
import { signBimaSetu } from '../src/integrations/bimasetu/hmac';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

// the standard antivirus test string: harmless, flagged by every scanner (assembled so this file is not flagged)
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');

/** PLAN 4.5: malware scan before storage, document access log, safe local downloads, webhook hardening. */
describe('Document and webhook security', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let head: ReturnType<typeof as>;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);
    head = as(t, TEST_USERS.head);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  const count = async () => Number((await ds.query(`SELECT count(*) AS n FROM documents`))[0].n);
  const doc = async (id: string) =>
    (await ds.query(`SELECT storage_key, scan_status, scan_engine FROM documents WHERE id = $1`, [id]))[0];

  it('refuses a file that fails the malware scan and stores nothing', async () => {
    const before = await count();
    const res = await pm
      .upload('/documents', { kind: 'quote' }, { name: 'quote.pdf', content: `%PDF ${EICAR}` })
      .expect(422);
    expect(res.body).toMatchObject({ code: 'MALWARE_DETECTED' });
    expect(await count()).toBe(before);
  });

  it('stores clean files with the scan result and a safe storage key', async () => {
    const { id } = (
      await pm
        .upload('/documents', { kind: 'quote' }, { name: '../../escape me.pdf', content: '%PDF clean' })
        .expect(201)
    ).body;
    const row = await doc(id);
    expect(row).toMatchObject({ scan_status: 'clean', scan_engine: 'dev' });
    expect(row.storage_key).not.toContain('..');
    expect(row.storage_key).not.toContain(' ');
  });

  it('logs every download link and shows the log to the Placement Head only', async () => {
    const { id } = (
      await pm
        .upload('/documents', { kind: 'quote' }, { name: 'logged.pdf', content: '%PDF log' })
        .expect(201)
    ).body;
    await pm.get(`/documents/${id}/download-url`).expect(200);
    await pm.get(`/documents/${id}/download-url?inline=1`).expect(200);
    await pm.get(`/documents/${id}/access-log`).expect(403);
    const log = (await head.get(`/documents/${id}/access-log`).expect(200)).body;
    expect(log.map((l: { action: string }) => l.action)).toEqual(['view', 'download']);
    expect(log[0].by).toBe('E2E Placement Manager');
    await expect(ds.query(`DELETE FROM document_access_log`)).rejects.toThrow(/append-only/);
  });

  it('serves local files by stored key only, with the stored name', async () => {
    const { id } = (
      await pm
        .upload('/documents', { kind: 'quote' }, { name: 'local "name".pdf', content: '%PDF local' })
        .expect(201)
    ).body;
    const { url } = (await pm.get(`/documents/${id}/download-url`).expect(200)).body;
    const key = new URL(url).searchParams.get('key')!;
    const ok = await pm.get(`/documents/_local?key=${encodeURIComponent(key)}&name=evil.exe`).expect(200);
    expect(ok.headers['content-disposition']).toContain('local _name_.pdf');
    expect(ok.headers['content-disposition']).not.toContain('evil.exe');
    await pm.get(`/documents/_local?key=${encodeURIComponent('../../package.json')}`).expect(404);
  });

  it('drops an infected mail attachment, keeps the mail and sends it to a person, never auto-applied', async () => {
    const attachment = (fileName: string, content: string) => ({
      fileName,
      contentType: 'application/pdf',
      size: content.length,
      fetch: async () => Buffer.from(content),
    });
    const mail = await t.app.get(InboundMailService).ingest({
      providerMessageId: `e2e-security-mail-${Date.now()}@insurer.example.test`,
      mailbox: 'placement@bimakavach.com',
      from: 'someone@insurer.example.test',
      to: ['placement@bimakavach.com'],
      cc: [],
      subject: 'Quote attached',
      textBody: 'Please find our quote attached.',
      receivedAt: new Date(),
      inReplyTo: null,
      attachments: [attachment('quote.pdf', `%PDF ${EICAR}`), attachment('terms.pdf', '%PDF terms')],
    });
    expect(mail).toBeTruthy();
    expect(mail!.attachmentDocumentIds).toHaveLength(1);
    expect(mail!.reviewQueue).not.toBe('none');
    expect(mail!.reviewReason).toContain('Attachment rejected, malware detected: quote.pdf');
  });

  describe('BimaSetu webhook', () => {
    const post = (body: object, sign = true) => {
      const raw = JSON.stringify(body);
      const req = request(t.app.getHttpServer())
        .post(`/${t.prefix}/integrations/bimasetu/webhook`)
        .set('content-type', 'application/json');
      if (sign) req.set('x-bimasetu-signature', signBimaSetu(raw, 'e2e-webhook-secret'));
      return req.send(raw);
    };
    const envelope = {
      messageId: 'e2e-security-1',
      type: 'line_lost',
      occurredAt: new Date().toISOString(),
      lineRef: 'BS-E2E-SEC-1',
      payload: {},
    };

    it('checks the signature whenever a secret is configured, even in mock mode', async () => {
      await post(envelope, false).expect(401);
      await post({ ...envelope, messageId: 'e2e-security-2' }, true).expect(202);
    });

    it('refuses envelopes without an id, a known type or a line reference', async () => {
      await post({ ...envelope, messageId: '' }).expect(400);
      await post({ ...envelope, type: 'delete_everything' }).expect(400);
      await post({ ...envelope, lineRef: undefined }).expect(400);
    });

    it('limits badly signed calls per IP, never genuine signed ones', async () => {
      const spy = jest.spyOn(t.app.get(RateLimiter), 'allow').mockResolvedValue(false);
      await post({ ...envelope, messageId: 'e2e-security-3' }, false).expect(429);
      await post({ ...envelope, messageId: 'e2e-security-4' }, true).expect(202);
      spy.mockRestore();
    });
  });
});
