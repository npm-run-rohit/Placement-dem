import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INDUSTRY_TYPES_SEED, RiskTier, ThreadStatus } from '@bimaplacement/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  SIGNATURE_HEADER,
  signEmailLayer,
  type DeliveryPayload,
} from '../src/integrations/email-layer/contract';
import { DomainError } from '../src/common/errors/domain-error';
import { InboundMailService } from '../src/modules/inbound-mail/inbound-mail.service';
import { E2E_ENV } from './setup/e2e-env';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Shared email layer -> Placement delivery webhook (Review Focus 4 and 5). */
describe('Email layer delivery webhook', () => {
  let t: TestApp;
  let ds: DataSource;
  let files: Server;
  let base: string;
  let fileStatus = 200;
  let seq = 0;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    files = createServer((_req, res) => {
      res.statusCode = fileStatus;
      res.end(fileStatus === 200 ? 'quote-bytes' : 'expired');
    });
    await new Promise<void>((r) => files.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(files.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    // keep Manual Review's shared counts clean for the suites that run after this one
    await ds?.query(`DELETE FROM inbound_mails WHERE provider_message_id LIKE '<msg-%@e2e.test>'`);
    files?.close();
    await t?.app.close();
  });

  beforeEach(() => {
    fileStatus = 200;
  });

  const delivery = (over: Partial<DeliveryPayload> = {}, withFile = false): DeliveryPayload => {
    const n = ++seq;
    return {
      deliveryId: `e2e-delivery-${Date.now()}-${n}`,
      product: 'placement',
      conversationRef: null,
      rootMessageId: `<root-${n}@e2e.test>`,
      message: {
        rfcMessageId: `<msg-${Date.now()}-${n}@e2e.test>`,
        inReplyTo: null,
        references: [],
        from: 'someone@insurer.e2e.test',
        to: ['pm.e2e@bimakavach.test'],
        cc: [],
        subject: 'Hello',
        textBody: 'Body',
        htmlBody: null,
        sentAt: new Date().toISOString(),
        seenInMailboxes: ['pm.e2e@bimakavach.test'],
        sentByStaff: false,
        attachments: withFile
          ? [{ fileName: 'quote.pdf', contentType: 'application/pdf', size: 11, url: `${base}/quote.pdf` }]
          : [],
      },
      ...over,
    };
  };

  const post = (body: DeliveryPayload, signed = true) => {
    const raw = JSON.stringify(body);
    const req = request(t.app.getHttpServer())
      .post(`/${t.prefix}/integrations/email-layer/webhook`)
      .set('content-type', 'application/json');
    if (signed) req.set(SIGNATURE_HEADER, signEmailLayer(raw, E2E_ENV.EMAIL_LAYER_SECRET));
    return req.send(raw);
  };

  const mailCount = async (rfcId: string) =>
    Number(
      (await ds.query(`SELECT count(*) FROM inbound_mails WHERE provider_message_id = $1`, [rfcId]))[0].count,
    );

  it('refuses an unsigned delivery', async () => {
    const d = delivery();
    await post(d, false).expect(401);
    expect(await mailCount(d.message.rfcMessageId)).toBe(0);
  });

  it('processes a delivery once', async () => {
    const d = delivery();
    await post(d).expect(200);
    await post(d).expect(200);
    expect(await mailCount(d.message.rfcMessageId)).toBe(1);
    const rows = await ds.query(`SELECT status FROM email_layer_deliveries WHERE delivery_id = $1`, [
      d.deliveryId,
    ]);
    expect(rows).toEqual([{ status: 'processed' }]);
  });

  it('stores the attachment with the mail', async () => {
    const d = delivery({}, true);
    await post(d).expect(200);
    const [row] = await ds.query(
      `SELECT attachment_document_ids AS ids FROM inbound_mails WHERE provider_message_id = $1`,
      [d.message.rfcMessageId],
    );
    expect(row.ids).toHaveLength(1);
  });

  it('answers 503 when an attachment URL has expired and stores nothing', async () => {
    fileStatus = 403;
    const d = delivery({}, true);
    await post(d).expect(503);
    expect(await mailCount(d.message.rfcMessageId)).toBe(0);
    const [row] = await ds.query(
      `SELECT status, attempts FROM email_layer_deliveries WHERE delivery_id = $1`,
      [d.deliveryId],
    );
    expect(row).toEqual({ status: 'failed', attempts: 1 });

    // the layer retries with a fresh URL: same deliveryId now succeeds
    fileStatus = 200;
    await post(d).expect(200);
    expect(await mailCount(d.message.rfcMessageId)).toBe(1);
  });

  it('rejects a delivery for another product', async () => {
    const d = delivery({ product: 'underwriting' });
    await post(d).expect(422);
    expect(await mailCount(d.message.rfcMessageId)).toBe(0);
  });

  it('rejects a delivery whose ref names an unknown ticket', async () => {
    const d = delivery({ conversationRef: 'PLC-9999/TH-01' });
    await post(d).expect(422);
    expect(await mailCount(d.message.rfcMessageId)).toBe(0);
  });

  it('answers 400 for a malformed delivery', async () => {
    const d = delivery();
    (d.message as unknown as { to: unknown }).to = 'not-a-list';
    await post(d).expect(400);
  });

  describe('a delivery mapped to a thread whose apply step fails', () => {
    const POC = 'poc@elw-insurer.example.test';
    let pm: ReturnType<typeof as>;
    let ticketId: string;
    let ticketNo: string;
    let threadId: string;
    let apply: jest.SpyInstance;

    const thread = async () =>
      (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body.find(
        (x: { id: string }) => x.id === threadId,
      );
    const decline = () =>
      delivery({
        conversationRef: `${ticketNo}/TH-01`,
        message: {
          ...delivery().message,
          from: POC,
          subject: `RE: [${ticketNo} | TH-01] RFQ`,
          textBody: 'We regret, unable to quote this risk.',
        },
      });

    beforeAll(async () => {
      pm = as(t, TEST_USERS.pm);
      // E2E FIXTURE - mock RM and one insurer branch (not PRD data)
      const [{ id: rmUserId }] = await ds.query(
        `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.elw.e2e@bimakavach.test', 'rm.elw.e2e@bimakavach.test', 'E2E RM ELW', '{rm}', 1) RETURNING id`,
      );
      const [{ id: insurerId }] = await ds.query(
        `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-elw', 'E2E ELW Insurer', 'Active', 1) RETURNING id`,
      );
      const [{ id: branchId }] = await ds.query(
        `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
        [insurerId],
      );
      await ds.query(
        `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Poc', $2, 1)`,
        [branchId, POC],
      );
      const created = await pm
        .post('/tickets', {
          rfqLinkUrl: 'https://example.test/rfq/e2e-elw',
          businessName: 'E2E ELW Foods Pvt Ltd',
          industryType: INDUSTRY_TYPES_SEED[0],
          productType: 'GMC',
          businessType: 'New',
          rmUserId,
        })
        .expect(201);
      ({ id: ticketId, ticketNo } = created.body);
      await pm.put(`/tickets/${ticketId}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
      await pm.post(`/tickets/${ticketId}/rfq/validate`).expect(201);
      await pm.put(`/tickets/${ticketId}/panel`, { insurerId, branchId, selected: true }).expect(200);
      await pm.post(`/tickets/${ticketId}/rfq/float`).expect(201);
      threadId = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body[0].id;
    });

    afterEach(() => apply?.mockRestore());

    it('answers 503 on a transient apply failure, then the retry applies it (not a silent 200)', async () => {
      const real = (t.app.get(InboundMailService) as never as { apply: (...a: unknown[]) => Promise<void> })
        .apply;
      let calls = 0;
      apply = jest.spyOn(t.app.get(InboundMailService) as never, 'apply').mockImplementation(function (
        this: unknown,
        ...args: unknown[]
      ) {
        if (++calls === 1) return Promise.reject(new Error('connection reset'));
        return real.apply(this, args);
      } as never);
      const d = decline();
      await post(d).expect(503);
      expect((await thread()).status).toBe(ThreadStatus.RFQ_SENT);
      await post(d).expect(200);
      expect(calls).toBe(2);
      expect((await thread()).status).toBe(ThreadStatus.DECLINED);
      expect(await mailCount(d.message.rfcMessageId)).toBe(1);
    });

    it('applies the mail exactly once when repaired twice, also concurrently', async () => {
      const declines = async () =>
        Number(
          (
            await ds.query(`SELECT count(*) FROM thread_events WHERE thread_id = $1 AND kind = 'decline'`, [
              threadId,
            ])
          )[0].count,
        );
      const before = await declines();
      const svc = t.app.get(InboundMailService) as never;
      const real = (svc as { apply: (...a: unknown[]) => Promise<void> }).apply;
      let first = true;
      apply = jest.spyOn(svc, 'apply').mockImplementation(function (this: unknown, ...args: unknown[]) {
        if (first) {
          first = false;
          return Promise.reject(new Error('connection reset')); // saved, not applied
        }
        return real.apply(this, args);
      } as never);
      const d = decline();
      await post(d).expect(503);
      const [a, b] = await Promise.all([post(d), post(d)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      await post(d).expect(200); // a third repair is a no-op
      expect((await declines()) - before).toBe(1);
      const [row] = await ds.query(
        `SELECT applied_class AS c FROM inbound_mails WHERE provider_message_id = $1`,
        [d.message.rfcMessageId],
      );
      expect(row.c).toBe('Declined');
    });

    it('sends a business refusal to Manual Review and answers 200, no endless retry', async () => {
      apply = jest
        .spyOn(t.app.get(InboundMailService) as never, 'apply')
        .mockRejectedValue(DomainError.guard('Thread is not waiting for this') as never);
      const d = decline();
      await post(d).expect(200);
      const [row] = await ds.query(
        `SELECT review_queue AS q, review_status AS s, review_reason AS r FROM inbound_mails WHERE provider_message_id = $1`,
        [d.message.rfcMessageId],
      );
      expect(row).toMatchObject({ q: 'my_reviews', s: 'pending' });
      expect(row.r).toContain('Thread is not waiting for this');
      const [log] = await ds.query(`SELECT status FROM email_layer_deliveries WHERE delivery_id = $1`, [
        d.deliveryId,
      ]);
      expect(log.status).toBe('processed');
    });
  });
});
