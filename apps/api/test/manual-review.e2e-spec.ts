import { RiskTier, INDUSTRY_TYPES_SEED, ThreadStatus } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { MailOutboundHandler } from '../src/modules/communications/mail-outbound.handler';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Inbound mail pipeline + Manual Review (PLAN 2.7, M7, FR-070..078, FR-227..231, BR-046). */
describe('Manual Review', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let ticketId: string;
  let ticketNo: string;
  let threadId: string;
  const POC = 'meera@review-insurer.example.test';

  const inbound = (body: Record<string, unknown>) =>
    pm
      .post('/dev/mail/inbound', body)
      .expect(201)
      .then((r) => r.body);
  const thread = async () =>
    (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body.find(
      (x: { id: string }) => x.id === threadId,
    );

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);

    // E2E FIXTURE - mock RM and one insurer branch (not PRD data)
    const [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.review.e2e@bimakavach.test', 'rm.review.e2e@bimakavach.test', 'E2E RM Review', '{rm}', 1) RETURNING id`,
    );
    const [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-review', 'E2E Review Insurer', 'Active', 1) RETURNING id`,
    );
    const [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Meera Iyer', $2, 1)`,
      [branchId, POC],
    );

    const created = await pm
      .post('/tickets', {
        rfqLinkUrl: 'https://example.test/rfq/e2e-review',
        businessName: 'E2E Review Foods Pvt Ltd',
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

  afterAll(async () => {
    await t?.app.close();
  });

  it('routes a mapped mail with an unclear meaning to My reviews and applies nothing (FR-073, BR-046)', async () => {
    const r = await inbound({
      from: POC,
      subject: `RE: [${ticketNo} | TH-01] RFQ`,
      textBody: 'Could you please share the last 3 years claims data?',
    });
    expect(r).toMatchObject({
      queue: 'my_reviews',
      reason: 'Mapped, interpretation unclear',
      classification: 'Clarification Required',
      applied: null,
    });
    expect((await thread()).status).toBe(ThreadStatus.RFQ_SENT);

    const [card] = (await pm.get('/manual-review?queue=my_reviews').expect(200)).body;
    expect(card).toMatchObject({
      status: 'pending',
      ticket: { ticketNo },
      thread: { threadRef: 'TH-01', insurerName: 'E2E Review Insurer' },
      classification: 'Clarification Required',
      mappingBasis: 'subject-ref',
    });
    expect((await pm.get('/manual-review/counts').expect(200)).body).toEqual({ myReviews: 1, unmatched: 0 });
  });

  it('confirming the classification applies it to the thread like a mapped mail (FR-228)', async () => {
    const [card] = (await pm.get('/manual-review?queue=my_reviews').expect(200)).body;
    const done = (
      await pm
        .post(`/manual-review/${card.id}/classification`, { label: 'Clarification Required' })
        .expect(201)
    ).body;
    expect(done).toMatchObject({
      status: 'confirmed',
      appliedClass: 'Clarification Required',
      reviewedBy: 'E2E Placement Manager',
    });
    expect((await thread()).status).toBe(ThreadStatus.INSURER_CLARIFICATION);
    await pm.post(`/manual-review/${card.id}/classification`, { label: 'Declined' }).expect(422); // once only
    expect((await pm.get('/manual-review/counts').expect(200)).body.myReviews).toBe(0);
    const audit = (await pm.get(`/tickets/${ticketId}/audit`).expect(200)).body.map(
      (a: { event: string }) => a.event,
    );
    expect(audit).toContain('Manual review confirmed');
  });

  it('auto-applies a reply-chain quote with a quote PDF and puts it on the Mail Trail (FR-070)', async () => {
    const [float] = await ds.query(
      `SELECT id, event_type, aggregate_id, created_at, payload FROM outbox_events WHERE destination = 'mail' AND event_type = 'mail.rfq_float' AND aggregate_id = $1`,
      [ticketId],
    );
    await t.app.get(MailOutboundHandler).handle(float.event_type, {
      outboxId: float.id,
      eventType: float.event_type,
      occurredAt: float.created_at.toISOString(),
      ...float.payload,
    });
    const [{ provider_message_id: sentId }] = await ds.query(
      `SELECT provider_message_id FROM mail_messages WHERE outbox_id = $1`,
      [float.id],
    );

    const r = await inbound({
      from: POC,
      subject: 'Our terms',
      textBody: 'Terms attached.',
      inReplyTo: `<${sentId}>`,
      attachmentName: 'Review_GMC_Quotation.pdf',
    });
    expect(r).toMatchObject({ queue: 'none', classification: 'Quote Received', applied: 'Quote Received' });
    const quotes = (await pm.get(`/tickets/${ticketId}/quotes`).expect(200)).body;
    expect(quotes).toHaveLength(1);
    expect(quotes[0].fileName).toBe('Review_GMC_Quotation.pdf');
    const mails = (await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body;
    expect(mails.find((m: { subject: string }) => m.subject === 'Our terms')).toMatchObject({
      direction: 'inbound',
      threadRef: 'TH-01',
      from: POC,
    });
  });

  it('sends mail with no reference from an unknown sender to Unmatched, ticket picker product-matched first (FR-072, FR-231)', async () => {
    const r = await inbound({
      from: 'someone@unknown.example.test',
      subject: 'Group Mediclaim query',
      textBody: 'Is this still open?',
    });
    expect(r).toMatchObject({ queue: 'unmatched', reason: 'No reliable ticket/thread reference' });
    const [card] = (await pm.get('/manual-review?queue=unmatched').expect(200)).body;
    expect(card).toMatchObject({ ticket: null, thread: null, matchedProducts: ['GMC'] });
    const options = (await pm.get(`/manual-review/${card.id}/ticket-options`).expect(200)).body;
    expect(options[0]).toMatchObject({ ticketNo, matches: true });
  });

  it('confirming the mapping logs it without changing the thread, then the owner classifies it (FR-229)', async () => {
    const [card] = (await pm.get('/manual-review?queue=unmatched').expect(200)).body;
    const before = (await thread()).status;
    const mapped = (await pm.post(`/manual-review/${card.id}/mapping`, { ticketId, threadId }).expect(201))
      .body;
    expect(mapped).toMatchObject({
      queue: 'my_reviews',
      status: 'pending',
      mappingBasis: 'manual',
      thread: { threadRef: 'TH-01' },
    });
    expect((await thread()).status).toBe(before);
    const timeline = (await pm.get(`/tickets/${ticketId}/threads/${threadId}/timeline`).expect(200)).body.map(
      (e: { text: string }) => e.text,
    );
    expect(timeline.some((x: string) => x.startsWith('Inbound mail mapped to thread'))).toBe(true);

    await pm.post(`/manual-review/${card.id}/classification`, { label: 'Not Applicable' }).expect(201);
    expect((await thread()).status).toBe(before);
    expect((await pm.get('/manual-review/counts').expect(200)).body).toEqual({ myReviews: 0, unmatched: 0 });
  });

  it('flags a mapped mail from a sender who is not a POC on the thread (FR-071)', async () => {
    const r = await inbound({
      from: 'intern@review-insurer.example.test',
      subject: `RE: [${ticketNo} | TH-01] RFQ`,
      textBody: 'Regret, unable to quote this risk.',
    });
    expect(r).toMatchObject({ queue: 'unmatched', reason: 'Unrecognised sender', applied: null });
    const [card] = (await pm.get('/manual-review?queue=unmatched').expect(200)).body;
    expect(card).toMatchObject({ unknownSender: true, thread: { threadRef: 'TH-01' } });
    expect((await thread()).status).not.toBe(ThreadStatus.DECLINED);
  });

  it('rejects a mapping to a thread from another ticket', async () => {
    const [card] = (await pm.get('/manual-review?queue=unmatched').expect(200)).body;
    const res = await pm
      .post(`/manual-review/${card.id}/mapping`, {
        ticketId: '00000000-0000-4000-8000-000000000000',
        threadId,
      })
      .expect(422);
    expect(res.body.message).toContain('not on the selected ticket');
  });

  it('never offers or maps to a ticket escalated to the Placement Head for a PM (FR-208)', async () => {
    const head = as(t, TEST_USERS.head);
    const [card] = (await pm.get('/manual-review?queue=unmatched').expect(200)).body;
    // E2E FIXTURE - the SLA-P1 escalation itself is covered in sla-p1-escalation.e2e-spec.ts
    await ds.query(`UPDATE placement_tickets SET escalated = true WHERE id = $1`, [ticketId]);
    try {
      const ids = (r: { body: Array<{ id: string }> }) => r.body.map((o) => o.id);
      expect(ids(await pm.get(`/manual-review/${card.id}/ticket-options`).expect(200))).not.toContain(
        ticketId,
      );
      expect(ids(await head.get(`/manual-review/${card.id}/ticket-options`).expect(200))).toContain(ticketId);
      await pm.post(`/manual-review/${card.id}/mapping`, { ticketId, threadId }).expect(404);
    } finally {
      await ds.query(`UPDATE placement_tickets SET escalated = false WHERE id = $1`, [ticketId]);
    }
  });
});
