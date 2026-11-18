import { Channel, INDUSTRY_TYPES_SEED, RiskTier, Stage, ThreadStatus } from '@bimaplacement/contracts';
import { BimaSetuInboundHandler } from '../src/integrations/bimasetu/bimasetu-inbound.handler';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';
import { maxQueryOverlap } from './helpers/pg-overlap';

/** Dev simulators (the prototype's amber "Simulate" blocks) must behave like the real inbound event or refuse clearly. */
describe('Dev simulators', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let ticketId: string;
  let threadId: string;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);
    // E2E FIXTURE - mock RM and one insurer branch (not PRD data)
    const [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.sim.e2e@bimakavach.test', 'rm.sim.e2e@bimakavach.test', 'E2E RM Sim', '{rm}', 1) RETURNING id`,
    );
    const [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-sim', 'E2E Sim Insurer', 'Active', 1) RETURNING id`,
    );
    const [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Sam Iyer', 'sam@sim-insurer.example.test', 1)`,
      [branchId],
    );
    ticketId = (
      await pm
        .post('/tickets', {
          rfqLinkUrl: 'https://example.test/rfq/e2e-sim',
          businessName: 'E2E Sim Pvt Ltd',
          industryType: INDUSTRY_TYPES_SEED[0],
          productType: 'GMC',
          businessType: 'New',
          rmUserId,
        })
        .expect(201)
    ).body.id;
    await pm.put(`/tickets/${ticketId}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm.post(`/tickets/${ticketId}/rfq/validate`).expect(201);
    await pm.put(`/tickets/${ticketId}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await pm.post(`/tickets/${ticketId}/rfq/float`).expect(201);
    threadId = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body[0].id;
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('refuses "RM replied" on a thread that is not waiting for RM information, and changes nothing', async () => {
    const res = await pm
      .post(`/dev/tickets/${ticketId}/threads/${threadId}/rm-reply`, { text: 'Claims data attached' })
      .expect(422);
    expect(res.body.message).toMatch(/not waiting/i);
    const audit = (await pm.get(`/tickets/${ticketId}/audit`).expect(200)).body.map(
      (a: { event: string }) => a.event,
    );
    expect(audit).not.toContain('Information provided');
  });

  it('accepts "RM replied" once the PM has asked the RM on behalf of the insurer (FR-063)', async () => {
    await pm
      .post(`/dev/tickets/${ticketId}/threads/${threadId}/insurer`, {
        kind: 'clarification',
        text: 'Need claims history',
      })
      .expect(201);
    await pm
      .post(`/tickets/${ticketId}/threads/${threadId}/hold-for-rm`, {
        request: 'Please share 3 years of claims history',
      })
      .expect(201);
    const [th] = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body;
    expect(th.status).toBe(ThreadStatus.AWAITING_RM);
    await pm
      .post(`/dev/tickets/${ticketId}/threads/${threadId}/rm-reply`, { text: 'Claims data attached' })
      .expect(201);
  });

  it('says so when there is no Copycat request to run, instead of pretending it ran', async () => {
    const res = await pm.post('/dev/copycat/CC-PLC-0000-V1-1/run', {}).expect(422);
    expect(res.body.message).toMatch(/no copycat request/i);
  });

  it('floats a line from BimaSetu through the real inbound path: ticket owned by the Placement Head, ticket_created queued (FR-281, PRD 4A.4)', async () => {
    const head = as(t, TEST_USERS.head);
    const { id: headId } = (await head.get('/me').expect(200)).body;
    const r = (await pm.post('/dev/bimasetu/float', { preset: 'gmc_new' }).expect(201)).body;
    const ticket = (await head.get(`/tickets/${r.ticketId}`).expect(200)).body;
    expect(ticket).toMatchObject({
      channel: Channel.BIMASETU,
      bimasetuLineRef: r.lineRef,
      stage: Stage.RFQ_REVIEW,
      owner: { id: headId },
      productType: 'GMC',
    });
    const [{ n }] = await ds.query(
      `SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'ticket_created'`,
      [r.ticketId],
    );
    expect(n).toBe(1);

    // the same message processed again (queue redelivery) does nothing more
    const [{ id: inboxId }] = await ds.query(`SELECT id FROM bimasetu_messages WHERE line_ref = $1`, [
      r.lineRef,
    ]);
    await t.app.get(BimaSetuInboundHandler).handle('float', { inboxId });
    const [{ c }] = await ds.query(
      `SELECT count(*)::int AS c FROM placement_tickets WHERE bimasetu_line_ref = $1`,
      [r.lineRef],
    );
    expect(c).toBe(1);
  });

  it('rejects a float with no RFQ, says why, and answers BimaSetu with float_rejected (FR-282)', async () => {
    const res = await pm.post('/dev/bimasetu/float', { preset: 'no_rfq' }).expect(422);
    expect(res.body.message).toMatch(/No RFQ/);
    const [msg] = await ds.query(
      `SELECT id, status, last_error FROM bimasetu_messages ORDER BY created_at DESC LIMIT 1`,
    );
    expect(msg).toMatchObject({ status: 'rejected' });
    const [{ n }] = await ds.query(
      `SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'float_rejected'`,
      [msg.id],
    );
    expect(n).toBe(1);
  });

  it('asks the RM through BimaSetu with an IR-nn reference, never the insurer thread ref (FR-290)', async () => {
    const head = as(t, TEST_USERS.head);
    const { ticketId: id } = (await pm.post('/dev/bimasetu/float', { preset: 'gmc_new' }).expect(201)).body;
    const [{ insurer_id: insurerId, id: branchId }] = await ds.query(
      `SELECT insurer_id, id FROM insurer_branches WHERE name = 'E2E Branch' AND insurer_id = (SELECT id FROM insurers WHERE code = 'e2e-sim')`,
    );
    await head.put(`/tickets/${id}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await head.post(`/tickets/${id}/rfq/validate`).expect(201);
    await head.put(`/tickets/${id}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await head.post(`/tickets/${id}/rfq/float`).expect(201);
    const [th] = (await head.get(`/tickets/${id}/threads`).expect(200)).body;
    await head
      .post(`/dev/tickets/${id}/threads/${th.id}/insurer`, {
        kind: 'clarification',
        text: 'Need claims history',
      })
      .expect(201);
    await head
      .post(`/tickets/${id}/threads/${th.id}/hold-for-rm`, {
        request: 'Please share 3 years of claims history',
      })
      .expect(201);
    const [q] = await ds.query(
      `SELECT payload FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'query_raised'`,
      [id],
    );
    expect(q.payload.queryRef).toBe('IR-01');
    expect(JSON.stringify(q.payload)).not.toContain(th.threadRef);
  });

  it('re-sends still-open RM queries without overlapping queries on the transaction (BR-112)', async () => {
    const [{ id: rmUserId }] = await ds.query(
      `SELECT id FROM users WHERE email = 'rm.sim.e2e@bimakavach.test'`,
    );
    const id = (
      await pm
        .post('/tickets', {
          rfqLinkUrl: 'https://example.test/rfq/e2e-sim-q',
          businessName: 'E2E Sim Queries Pvt Ltd',
          industryType: INDUSTRY_TYPES_SEED[0],
          productType: 'GMC',
          businessType: 'New',
          rmUserId,
        })
        .expect(201)
    ).body.id;
    await pm
      .post(`/tickets/${id}/rfq/queries`, { newQueries: ['Claims history', 'Employee census'] })
      .expect(201);
    await pm.post(`/dev/tickets/${id}/rm-reply`, { text: 'Partial answer' }).expect(201); // back to RFQ Review, both still open
    const overlap = await maxQueryOverlap(() =>
      pm.post(`/tickets/${id}/rfq/queries`, { newQueries: ['Loss ratio'] }).expect(201),
    );
    expect(overlap).toBe(1);
  });
});
