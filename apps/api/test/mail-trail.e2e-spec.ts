import { RiskTier, INDUSTRY_TYPES_SEED, PRODUCT_TYPES_SEED } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { MailOutboundHandler } from '../src/modules/communications/mail-outbound.handler';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Outbound mail from the assigned PM's mailbox + Mail Trail (PLAN 2.4, M5/M6, FR-050, FR-053, FR-213). */
describe('Mail Trail', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let ticketId: string;
  let ticketNo: string;
  let insurerId: string;
  let branchId: string;

  /** What the worker does: relay each unpublished mail outbox row to the mail handler. */
  const deliver = async () => {
    const rows: Array<{
      id: string;
      event_type: string;
      aggregate_id: string;
      created_at: Date;
      payload: Record<string, unknown>;
    }> = await ds.query(
      `SELECT id, event_type, aggregate_id, created_at, payload FROM outbox_events WHERE destination = 'mail' AND aggregate_id = $1 ORDER BY created_at`,
      [ticketId],
    );
    for (const r of rows) {
      await t.app.get(MailOutboundHandler).handle(r.event_type, {
        outboxId: r.id,
        eventType: r.event_type,
        aggregateId: r.aggregate_id,
        occurredAt: r.created_at.toISOString(),
        ...r.payload,
      });
    }
    return rows.length;
  };

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);

    // E2E FIXTURE - mock RM and one insurer branch with two POCs (not PRD data)
    const [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.mail.e2e@bimakavach.test', 'rm.mail.e2e@bimakavach.test', 'E2E RM Mail', '{rm}', 1) RETURNING id`,
    );
    [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-mail', 'E2E Mail Insurer', 'Active', 1) RETURNING id`,
    );
    [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Asha Rao', 'asha@insurer.example.test', 1), ($1, 'EB', 'Vikram Shah', 'vikram@insurer.example.test', 1)`,
      [branchId],
    );

    const created = await pm
      .post('/tickets', {
        rfqLinkUrl: 'https://example.test/rfq/e2e-mail',
        businessName: 'E2E Mail Trail Pvt Ltd',
        industryType: INDUSTRY_TYPES_SEED[0],
        productType: 'GMC',
        businessType: 'New',
        rmUserId,
      })
      .expect(201);
    ticketId = created.body.id;
    ticketNo = created.body.ticketNo;
    await pm.put(`/tickets/${ticketId}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm
      .post(`/tickets/${ticketId}/rfq/queries`, { newQueries: ['Employee census with ages'] })
      .expect(201);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('mails the RFQ queries to the RM from the PM mailbox with RM-T01 (manual ticket)', async () => {
    expect(await deliver()).toBe(1);
    const [mail] = (await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body;
    expect(mail).toMatchObject({
      direction: 'outbound',
      templateId: 'RM-T01',
      from: 'pm.e2e@bimakavach.test',
      to: ['rm.mail.e2e@bimakavach.test'],
      threadId: null,
      status: 'sent',
    });
    expect(mail.subject).toBe(`[${ticketNo}] Information needed before float - E2E Mail Trail Pvt Ltd`);
    expect(mail.bodyHtml).toContain('Employee census with ages');
  });

  it('floats with INS-T01 to every POC in To, ticket + thread ref in the subject, link in the body', async () => {
    const [query] = await ds.query(
      `SELECT q.id FROM rfq_queries q JOIN rfq_versions v ON v.id = q.rfq_version_id WHERE v.ticket_id = $1`,
      [ticketId],
    );
    await pm.post(`/dev/tickets/${ticketId}/rm-reply`, { text: 'Census attached' }).expect(201);
    await pm.post(`/tickets/${ticketId}/rfq/queries/${query.id}/resolve`).expect(201);
    await pm.post(`/tickets/${ticketId}/rfq/validate`).expect(201);
    await pm.put(`/tickets/${ticketId}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await pm.post(`/tickets/${ticketId}/rfq/float`).expect(201);
    await deliver();

    const mails = (await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body;
    const float = mails.find((m: { templateId: string }) => m.templateId === 'INS-T01');
    expect(float).toMatchObject({
      direction: 'outbound',
      threadRef: 'TH-01',
      insurerName: 'E2E Mail Insurer',
      from: 'pm.e2e@bimakavach.test',
      rfqLinkInBody: true,
    });
    expect(float.to.sort()).toEqual(['asha@insurer.example.test', 'vikram@insurer.example.test']);
    expect(float.subject).toBe(
      `[${ticketNo} | TH-01] RFQ - E2E Mail Trail Pvt Ltd - ${PRODUCT_TYPES_SEED.find((p) => p.code === 'GMC')!.label}`,
    );
    expect(float.bodyHtml).toContain('https://example.test/rfq/e2e-mail');
    expect(float.bodyHtml).not.toContain('{{');
  });

  it('is idempotent per outbox event: redelivery sends nothing new', async () => {
    const before = (await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body.length;
    await deliver();
    expect((await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body).toHaveLength(before);
  });

  it('shows the insurer reply as inbound mail on the thread with the quote attached', async () => {
    const [thread] = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body;
    await pm.post(`/dev/tickets/${ticketId}/threads/${thread.id}/insurer`, { kind: 'quote' }).expect(201);
    const [latest] = (await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body;
    expect(latest).toMatchObject({
      direction: 'inbound',
      threadRef: 'TH-01',
      from: 'asha@insurer.example.test',
      to: ['pm.e2e@bimakavach.test'],
      status: 'received',
    });
    expect(latest.attachments[0].fileName).toMatch(/\.pdf$/);
  });

  it('lists BimaSetu messages separately (none for a manual ticket)', async () => {
    expect((await pm.get(`/tickets/${ticketId}/bimasetu-messages`).expect(200)).body).toEqual([]);
  });
});
