import { INDUSTRY_TYPES_SEED, RiskTier, Stage, ThreadStatus } from '@bimaplacement/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  SIGNATURE_HEADER,
  signEmailLayer,
  type DeliveryPayload,
} from '../src/integrations/email-layer/contract';
import { E2E_ENV } from './setup/e2e-env';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

// The industry-standard EICAR test string: harmless, but the dev scanner reports it as malware.
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');

/** Sender rules for mail delivered by the shared email layer (FR-064, BR-046, BR-111). */
describe('Email layer inbound routing', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let insurerId: string;
  let branchId: string;
  let rmUserId: string;
  let seq = 0;
  const POC = 'poc@routing-insurer.e2e.test';
  const RM = 'rm.routing.e2e@bimakavach.test';
  const COLLEAGUE = 'colleague.routing.e2e@bimakavach.test';

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);
    // E2E FIXTURE - mock RM and one insurer branch (not PRD data)
    [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:${RM}', '${RM}', 'E2E Routing RM', '{rm}', 1) RETURNING id`,
    );
    [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-routing', 'E2E Routing Insurer', 'Active', 1) RETURNING id`,
    );
    [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Poc', $2, 1)`,
      [branchId, POC],
    );
  });

  afterAll(async () => {
    // keep Manual Review's shared counts clean for the suites that run after this one
    await ds?.query(`DELETE FROM inbound_mails WHERE provider_message_id LIKE '<routing-%@e2e.test>'`);
    await pm?.post('/dev/clock/reset');
    await t?.app.close();
  });

  const newTicket = async () => {
    const created = await pm
      .post('/tickets', {
        rfqLinkUrl: 'https://example.test/rfq/e2e-routing',
        businessName: 'E2E Routing Foods Pvt Ltd',
        industryType: INDUSTRY_TYPES_SEED[0],
        productType: 'GMC',
        businessType: 'New',
        rmUserId,
      })
      .expect(201);
    return { ticketId: created.body.id as string, ticketNo: created.body.ticketNo as string };
  };

  const floated = async () => {
    const tk = await newTicket();
    await pm.put(`/tickets/${tk.ticketId}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm.post(`/tickets/${tk.ticketId}/rfq/validate`).expect(201);
    await pm.put(`/tickets/${tk.ticketId}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await pm.post(`/tickets/${tk.ticketId}/rfq/float`).expect(201);
    const [th] = (await pm.get(`/tickets/${tk.ticketId}/threads`).expect(200)).body;
    return { ...tk, threadId: th.id as string, threadRef: th.threadRef as string };
  };

  const delivery = (
    over: {
      ref: string | null;
      from: string;
      subject?: string;
      staff?: boolean;
      file?: boolean;
      to?: string[];
      cc?: string[];
      eicar?: boolean;
    },
    deliveryId?: string,
    rfcId?: string,
  ): DeliveryPayload => {
    const n = ++seq;
    return {
      deliveryId: deliveryId ?? `e2e-route-${Date.now()}-${n}`,
      product: 'placement',
      conversationRef: over.ref,
      rootMessageId: `<routing-root-${n}@e2e.test>`,
      message: {
        rfcMessageId: rfcId ?? `<routing-${Date.now()}-${n}@e2e.test>`,
        inReplyTo: null,
        references: [],
        from: over.from,
        to: over.to ?? ['pm.e2e@bimakavach.test'],
        cc: over.cc ?? [],
        subject: over.subject ?? 'Re: RFQ',
        textBody: 'Body of the mail',
        htmlBody: null,
        sentAt: new Date().toISOString(),
        seenInMailboxes: ['pm.e2e@bimakavach.test'],
        sentByStaff: !!over.staff,
        attachments: over.eicar
          ? [
              {
                fileName: 'quote.pdf',
                contentType: 'application/pdf',
                size: 68,
                url: `${fileBase}/eicar.pdf`,
              },
            ]
          : over.file
            ? [
                {
                  fileName: 'Routing_GMC_Quotation.pdf',
                  contentType: 'application/pdf',
                  size: 5,
                  url: `${fileBase}/q.pdf`,
                },
              ]
            : [],
      },
    };
  };

  const post = (body: DeliveryPayload) => {
    const raw = JSON.stringify(body);
    return request(t.app.getHttpServer())
      .post(`/${t.prefix}/integrations/email-layer/webhook`)
      .set('content-type', 'application/json')
      .set(SIGNATURE_HEADER, signEmailLayer(raw, E2E_ENV.EMAIL_LAYER_SECRET))
      .send(raw);
  };

  // tiny file server for the quote attachment
  let fileBase = '';
  let files: import('node:http').Server;
  beforeAll(async () => {
    const { createServer } = await import('node:http');
    files = createServer((q, res) => res.end(q.url?.includes('eicar') ? `%PDF ${EICAR}` : '%PDF-'));
    await new Promise<void>((r) => files.listen(0, '127.0.0.1', r));
    fileBase = `http://127.0.0.1:${(files.address() as import('node:net').AddressInfo).port}`;
  });
  afterAll(() => {
    files?.close();
  });

  const mailRow = async (rfcId: string) =>
    (await ds.query(`SELECT * FROM inbound_mails WHERE provider_message_id = $1`, [rfcId]))[0];
  const thread = async (ticketId: string, threadId: string) =>
    (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body.find(
      (x: { id: string }) => x.id === threadId,
    );
  const outboundMails = async (ticketId: string) =>
    Number(
      (
        await ds.query(`SELECT count(*) FROM mail_messages WHERE ticket_id = $1 AND direction = 'outbound'`, [
          ticketId,
        ])
      )[0].count,
    );
  const hold = async (ticketId: string, threadId: string) => {
    await pm
      .post(`/dev/tickets/${ticketId}/threads/${threadId}/insurer`, {
        kind: 'clarification',
        text: 'Need claims history',
      })
      .expect(201);
    await pm
      .post(`/tickets/${ticketId}/threads/${threadId}/hold-for-rm`, { request: 'Please share claims' })
      .expect(201);
  };

  it('an insurer reply in a registered conversation applies to that thread', async () => {
    const f = await floated();
    const d = delivery({
      ref: `${f.ticketNo}/${f.threadRef}`,
      from: POC,
      subject: 'Our terms',
      file: true,
    });
    await post(d).expect(200);
    const row = await mailRow(d.message.rfcMessageId);
    expect(row).toMatchObject({
      mapping_basis: 'conversation',
      mapping_confidence: 1,
      review_queue: 'none',
      applied_class: 'Quote Received',
    });
    expect(row.ticket_id).toBe(f.ticketId);
    expect(row.thread_id).toBe(f.threadId);
    expect((await pm.get(`/tickets/${f.ticketId}/quotes`).expect(200)).body).toHaveLength(1);
  });

  it('an unchained PLC-tagged mail goes to My reviews and changes nothing', async () => {
    const f = await floated();
    const d = delivery({
      ref: null,
      from: POC,
      subject: `Fwd: [${f.ticketNo} | ${f.threadRef}] RFQ`,
      file: true,
    });
    await post(d).expect(200);
    const row = await mailRow(d.message.rfcMessageId);
    expect(row).toMatchObject({
      review_queue: 'my_reviews',
      review_status: 'pending',
      review_reason: 'Not part of a Placement email chain - confirm',
      applied_class: null,
    });
    expect((await thread(f.ticketId, f.threadId)).status).toBe(ThreadStatus.RFQ_SENT);
    expect((await pm.get(`/tickets/${f.ticketId}/quotes`).expect(200)).body).toHaveLength(0);
  });

  it('unchained mail with no ticket goes to Unmatched', async () => {
    const d = delivery({ ref: null, from: 'nobody@elsewhere.e2e.test', subject: 'Hi' });
    await post(d).expect(200);
    expect(await mailRow(d.message.rfcMessageId)).toMatchObject({
      review_queue: 'unmatched',
      applied_class: null,
    });
  });

  it("a colleague's Gmail reply resumes a held thread with its remaining time and sends no mail", async () => {
    const f = await floated();
    await hold(f.ticketId, f.threadId);
    const before = await thread(f.ticketId, f.threadId);
    expect(before.status).toBe(ThreadStatus.AWAITING_RM);
    await pm.post('/dev/clock/advance', { businessMinutes: 30 }).expect(201);
    const outBefore = await outboundMails(f.ticketId);

    const d = delivery({ ref: `${f.ticketNo}/${f.threadRef}`, from: COLLEAGUE, staff: true, to: [POC] });
    await post(d).expect(200);
    await pm.post('/dev/clock/reset').expect(201);

    const [row] = await ds.query(
      `SELECT status, paused_since, held_mins FROM insurer_threads WHERE id = $1`,
      [f.threadId],
    );
    expect(row.status).toBe(ThreadStatus.ACKNOWLEDGED);
    expect(row.paused_since).toBeNull();
    expect(row.held_mins).toBeGreaterThan(0);
    expect(await outboundMails(f.ticketId)).toBe(outBefore);
    const events = await ds.query(`SELECT text FROM thread_events WHERE thread_id = $1 AND kind = 'resume'`, [
      f.threadId,
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].text).toContain('Replied from Gmail by');
    expect(
      (
        await ds.query(
          `SELECT count(*) FROM outbox_events WHERE event_type = 'mail.insurer_reply' AND payload->>'threadId' = $1`,
          [f.threadId],
        )
      )[0].count,
    ).toBe('0');
    expect((await mailRow(d.message.rfcMessageId)).applied_class).not.toBeNull();
  });

  it('a colleague reply delivered twice resumes the thread once', async () => {
    const f = await floated();
    await hold(f.ticketId, f.threadId);
    const rfc = `<routing-twice-${Date.now()}@e2e.test>`;
    const ref = `${f.ticketNo}/${f.threadRef}`;
    // two deliveries of the same message, at the same time and again after (the layer retries)
    const to = [POC];
    await Promise.all([
      post(delivery({ ref, from: COLLEAGUE, staff: true, to }, `e2e-twice-a-${Date.now()}`, rfc)),
      post(delivery({ ref, from: COLLEAGUE, staff: true, to }, `e2e-twice-b-${Date.now()}`, rfc)),
    ]);
    await post(delivery({ ref, from: COLLEAGUE, staff: true, to }, `e2e-twice-c-${Date.now()}`, rfc)).expect(
      200,
    );
    const events = await ds.query(`SELECT 1 FROM thread_events WHERE thread_id = $1 AND kind = 'resume'`, [
      f.threadId,
    ]);
    expect(events).toHaveLength(1);
    const audits = await ds.query(
      `SELECT 1 FROM audit_events WHERE ticket_id = $1 AND event = 'Replied to insurer clarification'`,
      [f.ticketId],
    );
    expect(audits).toHaveLength(1);
  });

  it("a colleague's mail to staff only does not answer the insurer: the thread stays held (I4)", async () => {
    const f = await floated();
    await hold(f.ticketId, f.threadId);
    const d = delivery({
      ref: `${f.ticketNo}/${f.threadRef}`,
      from: COLLEAGUE,
      staff: true,
      to: ['pm.e2e@bimakavach.test'],
      cc: ['PM.E2E@bimakavach.test'],
    });
    await post(d).expect(200);
    expect(await mailRow(d.message.rfcMessageId)).toMatchObject({
      review_queue: 'none',
      review_reason: 'Colleague mail - kept on the Mail Trail only',
      applied_class: null,
    });
    expect((await thread(f.ticketId, f.threadId)).status).toBe(ThreadStatus.AWAITING_RM);
    const trail = await ds.query(`SELECT 1 FROM mail_messages WHERE provider_message_id = $1`, [
      d.message.rfcMessageId,
    ]);
    expect(trail).toHaveLength(1);
  });

  it("a colleague's mail with the insurer only in Cc answers it", async () => {
    const f = await floated();
    await hold(f.ticketId, f.threadId);
    const d = delivery({
      ref: `${f.ticketNo}/${f.threadRef}`,
      from: COLLEAGUE,
      staff: true,
      to: ['pm.e2e@bimakavach.test'],
      cc: [POC.toUpperCase()],
    });
    await post(d).expect(200);
    expect((await thread(f.ticketId, f.threadId)).status).toBe(ThreadStatus.ACKNOWLEDGED);
  });

  it('an unanchored mail on a closed ticket stays on the Mail Trail only, with no review item (FR-135)', async () => {
    const f = await floated();
    await ds.query(`UPDATE placement_tickets SET stage = 'closed' WHERE id = $1`, [f.ticketId]);
    const d = delivery({
      ref: null,
      from: POC,
      subject: `Fwd: [${f.ticketNo} | ${f.threadRef}] RFQ`,
      file: true,
    });
    await post(d).expect(200);
    expect(await mailRow(d.message.rfcMessageId)).toMatchObject({
      review_queue: 'none',
      review_status: 'confirmed',
      review_reason: 'Ticket closed - kept on the Mail Trail only',
      applied_class: null,
    });
    const trail = await ds.query(`SELECT 1 FROM mail_messages WHERE provider_message_id = $1`, [
      d.message.rfcMessageId,
    ]);
    expect(trail).toHaveLength(1);
    expect((await pm.get(`/tickets/${f.ticketId}/quotes`).expect(200)).body).toHaveLength(0);
  });

  it('an infected attachment is not stored, the mail goes to My reviews and the delivery answers 200 (I9)', async () => {
    const f = await floated();
    const d = delivery({ ref: `${f.ticketNo}/${f.threadRef}`, from: POC, subject: 'Our terms', eicar: true });
    await post(d).expect(200);
    const row = await mailRow(d.message.rfcMessageId);
    expect(row).toMatchObject({ review_queue: 'my_reviews', review_status: 'pending', applied_class: null });
    expect(row.attachment_document_ids).toEqual([]);
    expect(row.review_reason).toContain('Attachment rejected, malware detected: quote.pdf');
    const docs = await ds.query(`SELECT 1 FROM documents WHERE ticket_id = $1 AND file_name = 'quote.pdf'`, [
      f.ticketId,
    ]);
    expect(docs).toHaveLength(0);
    expect((await pm.get(`/tickets/${f.ticketId}/quotes`).expect(200)).body).toHaveLength(0);
    await post({ ...d, deliveryId: `${d.deliveryId}-retry` }).expect(200); // a retry is a no-op, not an error
  });

  it("a colleague's reply on a thread not waiting on us is only recorded", async () => {
    const f = await floated();
    const d = delivery({ ref: `${f.ticketNo}/${f.threadRef}`, from: COLLEAGUE, staff: true });
    await post(d).expect(200);
    const row = await mailRow(d.message.rfcMessageId);
    expect(row).toMatchObject({ review_queue: 'none', applied_class: null });
    expect((await thread(f.ticketId, f.threadId)).status).toBe(ThreadStatus.RFQ_SENT);
    const trail = await ds.query(`SELECT 1 FROM mail_messages WHERE provider_message_id = $1`, [
      d.message.rfcMessageId,
    ]);
    expect(trail).toHaveLength(1);
  });

  it('an RM mail answers the RFQ queries on a manual ticket and resolves none (BR-111)', async () => {
    const tk = await newTicket();
    await pm.post(`/tickets/${tk.ticketId}/rfq/queries`, { newQueries: ['Which cover?'] }).expect(201);
    expect((await pm.get(`/tickets/${tk.ticketId}`).expect(200)).body.stage).toBe(Stage.AWAITING_RM);

    const d = delivery({ ref: `${tk.ticketNo}/RM`, from: RM, subject: `Re: ${tk.ticketNo} queries` });
    await post(d).expect(200);
    await post({ ...d, deliveryId: `${d.deliveryId}-retry` }).expect(200); // retry: no second answer
    expect((await pm.get(`/tickets/${tk.ticketId}`).expect(200)).body.stage).toBe(Stage.RFQ_REVIEW);
    const queries = (await pm.get(`/tickets/${tk.ticketId}/rfq/queries`).expect(200)).body;
    expect(queries).toHaveLength(1);
    expect(queries[0].resolved).toBe(false);
    expect(queries[0].answer).toBe('Body of the mail');
    expect(queries[0].answeredAt).not.toBeNull();
    expect(queries[0].answeredBy).toBe('E2E Routing RM');
    expect(
      (
        await ds.query(
          `SELECT count(*) FROM audit_events WHERE ticket_id = $1 AND event = 'Query answered by mail'`,
          [tk.ticketId],
        )
      )[0].count,
    ).toBe('1');
  });

  it('an RM mail when the ticket is not waiting on the RM goes to My reviews', async () => {
    const tk = await newTicket(); // rfq_review, not awaiting the RM
    const d = delivery({ ref: `${tk.ticketNo}/RM`, from: RM });
    await post(d).expect(200);
    expect(await mailRow(d.message.rfcMessageId)).toMatchObject({
      review_queue: 'my_reviews',
      review_reason: 'RM mail - apply it from the RFQ tab',
      applied_class: null,
    });
    expect((await pm.get(`/tickets/${tk.ticketId}`).expect(200)).body.stage).toBe(Stage.RFQ_REVIEW);
  });
  it('confirming an unanchored quote links the quote to its Mail Trail row', async () => {
    const f = await floated();
    const d = delivery({
      ref: null,
      from: POC,
      subject: `Fwd: [${f.ticketNo} | ${f.threadRef}] RFQ`,
      file: true,
    });
    await post(d).expect(200);
    const row = await mailRow(d.message.rfcMessageId);
    await pm.post(`/manual-review/${row.id}/classification`, { label: 'Quote Received' }).expect(201);
    const [q] = await ds.query(`SELECT source_mail_id FROM quotes WHERE ticket_id = $1`, [f.ticketId]);
    const [trail] = await ds.query(`SELECT id FROM mail_messages WHERE provider_message_id = $1`, [
      d.message.rfcMessageId,
    ]);
    expect(trail).toBeDefined();
    expect(q.source_mail_id).toBe(trail.id);
  });

  it('an RM mail in My reviews can be marked handled and leaves the queue', async () => {
    const tk = await newTicket();
    const d = delivery({ ref: `${tk.ticketNo}/RM`, from: RM });
    await post(d).expect(200);
    const row = await mailRow(d.message.rfcMessageId);
    await pm.post(`/manual-review/${row.id}/handled`).expect(201);
    expect(await mailRow(d.message.rfcMessageId)).toMatchObject({
      review_status: 'confirmed',
      applied_class: null,
    });
    const audit = (await pm.get(`/tickets/${tk.ticketId}/audit`).expect(200)).body.map(
      (a: { event: string }) => a.event,
    );
    expect(audit).toContain('Manual review handled');
    await pm.post(`/manual-review/${row.id}/handled`).expect(422); // once only
  });

  it('an unanchored mail with a ticket but no thread can be mapped, then confirmed', async () => {
    const f = await floated();
    const d = delivery({ ref: null, from: POC, subject: `Hello about ${f.ticketNo}` });
    await post(d).expect(200);
    const row = await mailRow(d.message.rfcMessageId);
    expect(row).toMatchObject({ review_queue: 'my_reviews', thread_id: null });
    await pm
      .post(`/manual-review/${row.id}/mapping`, { ticketId: f.ticketId, threadId: f.threadId })
      .expect(201);
    await pm.post(`/manual-review/${row.id}/classification`, { label: 'Acknowledged' }).expect(201);
    expect(await mailRow(d.message.rfcMessageId)).toMatchObject({
      review_status: 'confirmed',
      applied_class: 'Acknowledged',
    });
  });

  it('a conversation ref that does not resolve is treated as unanchored (BR-046)', async () => {
    const f = await floated();
    const d = delivery({
      ref: `${f.ticketNo}/TH-99`,
      from: POC,
      subject: `Re: [${f.ticketNo} | ${f.threadRef}] RFQ`,
      file: true,
    });
    await post(d).expect(200);
    expect(await mailRow(d.message.rfcMessageId)).toMatchObject({
      review_queue: 'my_reviews',
      review_reason: 'Not part of a Placement email chain - confirm',
      applied_class: null,
    });
    expect((await thread(f.ticketId, f.threadId)).status).toBe(ThreadStatus.RFQ_SENT);
    expect((await pm.get(`/tickets/${f.ticketId}/quotes`).expect(200)).body).toHaveLength(0);
  });
});
