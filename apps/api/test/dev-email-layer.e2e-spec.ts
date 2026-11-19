import { INDUSTRY_TYPES_SEED, RiskTier, ThreadStatus } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Dev simulator for the shared email layer: a signed delivery through the real webhook handler (FR-064, BR-046). */
describe('Dev simulator: email layer delivery', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let insurerId: string;
  let branchId: string;
  let rmUserId: string;
  const RM = 'rm.devsim.e2e@bimakavach.test';

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);
    // E2E FIXTURE - mock RM and one insurer branch (not PRD data)
    [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:${RM}', '${RM}', 'E2E DevSim RM', '{rm}', 1) RETURNING id`,
    );
    [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-devsim', 'E2E DevSim Insurer', 'Active', 1) RETURNING id`,
    );
    [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Poc', 'poc@devsim-insurer.e2e.test', 1)`,
      [branchId],
    );
  });

  afterAll(async () => {
    await ds?.query(`DELETE FROM inbound_mails WHERE provider_message_id LIKE '<dev-el-%'`);
    await t?.app.close();
  });

  const floated = async () => {
    const created = await pm
      .post('/tickets', {
        rfqLinkUrl: 'https://example.test/rfq/e2e-devsim',
        businessName: 'E2E DevSim Foods Pvt Ltd',
        industryType: INDUSTRY_TYPES_SEED[0],
        productType: 'GMC',
        businessType: 'New',
        rmUserId,
      })
      .expect(201);
    const id = created.body.id as string;
    await pm.put(`/tickets/${id}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm.post(`/tickets/${id}/rfq/validate`).expect(201);
    await pm.put(`/tickets/${id}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await pm.post(`/tickets/${id}/rfq/float`).expect(201);
    const [th] = (await pm.get(`/tickets/${id}/threads`).expect(200)).body;
    return { ticketId: id, threadId: th.id as string };
  };
  const status = async (ticketId: string, threadId: string) =>
    (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body.find(
      (x: { id: string }) => x.id === threadId,
    ).status;

  it('delivers a colleague reply through the real webhook path and resumes a held thread', async () => {
    const f = await floated();
    await pm
      .post(`/dev/tickets/${f.ticketId}/threads/${f.threadId}/insurer`, { kind: 'clarification' })
      .expect(201);
    await pm
      .post(`/tickets/${f.ticketId}/threads/${f.threadId}/hold-for-rm`, { request: 'Please share claims' })
      .expect(201);
    expect(await status(f.ticketId, f.threadId)).toBe(ThreadStatus.AWAITING_RM);

    const res = await pm
      .post(`/dev/tickets/${f.ticketId}/email-layer/deliver`, { threadId: f.threadId, kind: 'colleague' })
      .expect(201);
    expect(res.body).toMatchObject({ accepted: true, duplicate: false });

    expect(await status(f.ticketId, f.threadId)).toBe(ThreadStatus.ACKNOWLEDGED);
    const events = await ds.query(`SELECT text FROM thread_events WHERE thread_id = $1 AND kind = 'resume'`, [
      f.threadId,
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].text).toContain('Replied from Gmail by');
    const [d] = await ds.query(`SELECT status FROM email_layer_deliveries WHERE delivery_id = $1`, [
      res.body.deliveryId,
    ]);
    expect(d.status).toBe('processed');
  });

  it('delivers an insurer reply in the thread conversation', async () => {
    const f = await floated();
    const res = await pm
      .post(`/dev/tickets/${f.ticketId}/email-layer/deliver`, { threadId: f.threadId, kind: 'insurer' })
      .expect(201);
    expect(res.body.accepted).toBe(true);
    const [row] = await ds.query(`SELECT mapping_basis, thread_id FROM inbound_mails WHERE ticket_id = $1`, [
      f.ticketId,
    ]);
    expect(row).toMatchObject({ mapping_basis: 'conversation', thread_id: f.threadId });
  });

  it('delivers an unchained insurer mail to My reviews and changes nothing', async () => {
    const f = await floated();
    await pm
      .post(`/dev/tickets/${f.ticketId}/email-layer/deliver`, { threadId: f.threadId, kind: 'unanchored' })
      .expect(201);
    const [row] = await ds.query(
      `SELECT review_queue, applied_class FROM inbound_mails WHERE ticket_id = $1`,
      [f.ticketId],
    );
    expect(row).toMatchObject({ review_queue: 'my_reviews', applied_class: null });
    expect(await status(f.ticketId, f.threadId)).toBe(ThreadStatus.RFQ_SENT);
  });

  it('rejects an unknown kind', async () => {
    const f = await floated();
    await pm
      .post(`/dev/tickets/${f.ticketId}/email-layer/deliver`, { threadId: f.threadId, kind: 'bogus' })
      .expect(422);
  });
});
