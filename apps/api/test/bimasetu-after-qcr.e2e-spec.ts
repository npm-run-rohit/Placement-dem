import { INDUSTRY_TYPES_SEED, OutcomeType, QcrStatus, RiskTier, Stage } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/**
 * A floated ticket from BimaSetu to the client's decision (FR-284, FR-288): the RM answers queries and the client
 * decides in BimaSetu; each message goes through the inbox and the real handler, exactly once.
 */
describe('BimaSetu messages after the float', () => {
  let t: TestApp;
  let ds: DataSource;
  let head: ReturnType<typeof as>;
  let insurerId: string;
  let branchId: string;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    head = as(t, TEST_USERS.head);
    // E2E FIXTURE - mock RM and one insurer branch (not PRD data)
    await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.after.e2e@bimakavach.test', 'rm.after.e2e@bimakavach.test', 'E2E RM After', '{rm}', 1)`,
    );
    [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-after', 'E2E After Insurer', 'Active', 1) RETURNING id`,
    );
    [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Ana Rao', 'ana@after-insurer.example.test', 1)`,
      [branchId],
    );
  });

  afterAll(async () => {
    await t?.app.close();
  });

  const ticket = async (id: string) => (await head.get(`/tickets/${id}`).expect(200)).body;
  const sim = (id: string, type: string, payload: object) =>
    head.post(`/dev/tickets/${id}/bimasetu/${type}`, payload);

  /** Float -> one usable quote -> single-quote QCR sent to BimaSetu. */
  async function releasedTicket(): Promise<{ id: string; rowId: string }> {
    const { ticketId: id } = (await head.post('/dev/bimasetu/float', { preset: 'gmc_new' }).expect(201)).body;
    await head.put(`/tickets/${id}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await head.post(`/tickets/${id}/rfq/validate`).expect(201);
    await head.put(`/tickets/${id}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await head.post(`/tickets/${id}/rfq/float`).expect(201);
    const [th] = (await head.get(`/tickets/${id}/threads`).expect(200)).body;
    const quote = (
      await head.post(`/dev/tickets/${id}/threads/${th.id}/insurer`, { kind: 'quote' }).expect(201)
    ).body;
    await head.post(`/tickets/${id}/quotes/${quote.id}/decision`, { decision: 'usable' }).expect(201);
    await head.post(`/tickets/${id}/qcrs/early-release`, { reason: 'RM has requested' }).expect(201);
    const [qcr] = (await head.get(`/tickets/${id}/qcrs`).expect(200)).body;
    await head.put(`/tickets/${id}/qcrs/${qcr.id}/rows-checked`, { checked: true }).expect(200);
    await head.post(`/tickets/${id}/qcrs/${qcr.id}/release`, {}).expect(201);
    const [row] = (await head.get(`/tickets/${id}/qcrs/${qcr.id}/rows`).expect(200)).body;
    expect(await ticket(id)).toMatchObject({ stage: Stage.QCR_RELEASED });
    return { id, rowId: row.id };
  }

  it('takes the RM answer to an RFQ query from BimaSetu, back to RFQ Review with the query still open (BR-111)', async () => {
    const { ticketId: id } = (await head.post('/dev/bimasetu/float', { preset: 'gmc_new' }).expect(201)).body;
    await head.post(`/tickets/${id}/rfq/queries`, { newQueries: ['Share the claims history'] }).expect(201);
    expect(await ticket(id)).toMatchObject({ stage: Stage.AWAITING_RM });
    const [q] = (await head.get(`/tickets/${id}/rfq/queries`).expect(200)).body;
    await sim(id, 'query_answer', {
      queryRef: q.ref,
      answer: 'Attached in BimaSetu',
      answeredBy: { id: 'rm', name: 'E2E RM After' },
    }).expect(201);
    expect(await ticket(id)).toMatchObject({ stage: Stage.RFQ_REVIEW });
    const [answered] = (await head.get(`/tickets/${id}/rfq/queries`).expect(200)).body;
    expect(answered).toMatchObject({ answer: 'Attached in BimaSetu' });
    expect(answered.resolvedAt ?? null).toBeNull();
  });

  it('closes the ticket as Quote selected when the client confirms a row of the released QCR (FR-288)', async () => {
    const { id, rowId } = await releasedTicket();
    await sim(id, 'client_confirmation', {
      qcrRound: 1,
      quoteRowId: '00000000-0000-4000-8000-000000000000',
    }).expect(422);
    await sim(id, 'client_confirmation', { qcrRound: 1, quoteRowId: rowId }).expect(201);
    const tk = await ticket(id);
    expect(tk).toMatchObject({ stage: Stage.CLOSED, outcome: OutcomeType.QUOTE_SELECTED });
    // the refused confirmation is kept as rejected (final), the good one processed, each exactly once (FR-291)
    const statuses = await ds.query(
      `SELECT status FROM bimasetu_messages WHERE direction = 'in' AND type = 'client_confirmation' AND line_ref = $1 ORDER BY created_at`,
      [tk.bimasetuLineRef],
    );
    expect(statuses.map((s: { status: string }) => s.status)).toEqual(['rejected', 'processed']);
    const [qcr] = (await head.get(`/tickets/${id}/qcrs`).expect(200)).body;
    expect(qcr.status).toBe(QcrStatus.RELEASED);
  });

  it('refuses a confirmation that names another QCR round than the row is in', async () => {
    const { id, rowId } = await releasedTicket();
    await sim(id, 'client_confirmation', { qcrRound: 2, quoteRowId: rowId }).expect(422);
    expect(await ticket(id)).toMatchObject({ stage: Stage.QCR_RELEASED });
  });

  it('puts an RM answer on the information request it names, never on a later one (FR-063, FR-284)', async () => {
    const { ticketId: id } = (await head.post('/dev/bimasetu/float', { preset: 'gmc_new' }).expect(201)).body;
    await head.put(`/tickets/${id}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await head.post(`/tickets/${id}/rfq/validate`).expect(201);
    await head.put(`/tickets/${id}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await head.post(`/tickets/${id}/rfq/float`).expect(201);
    const [th] = (await head.get(`/tickets/${id}/threads`).expect(200)).body;
    const ask = async (text: string) => {
      await head
        .post(`/dev/tickets/${id}/threads/${th.id}/insurer`, { kind: 'clarification', text })
        .expect(201);
      await head.post(`/tickets/${id}/threads/${th.id}/hold-for-rm`, { request: text }).expect(201);
    };
    const answer = (queryRef: string, text: string) =>
      sim(id, 'query_answer', { queryRef, answer: text, answeredBy: { id: 'rm', name: 'E2E RM After' } });

    await ask('Share the claims history');
    await answer('IR-01', 'Claims history attached').expect(201);
    await head.post(`/tickets/${id}/threads/${th.id}/reply`, { text: 'Claims history attached' }).expect(201);
    await ask('Share the employee census');
    await answer('IR-01', 'Claims history attached (resent)').expect(422);
    await answer('IR-02', 'Census attached').expect(201);
    const rows = await ds.query(
      `SELECT rm_query_ref, rm_response FROM thread_clarifications WHERE thread_id = $1 ORDER BY asked_at`,
      [th.id],
    );
    expect(rows).toEqual([
      { rm_query_ref: 'IR-01', rm_response: 'Claims history attached' },
      { rm_query_ref: 'IR-02', rm_response: 'Census attached' },
    ]);
  });

  it('closes the ticket as Lost when BimaSetu reports the line lost (FR-288)', async () => {
    const { id } = await releasedTicket();
    await sim(id, 'line_lost', { reason: 'Client renewed with the incumbent' }).expect(201);
    expect(await ticket(id)).toMatchObject({ stage: Stage.CLOSED, outcome: OutcomeType.LOST });
    // closed tickets never reopen (FR-135): a late confirmation is refused, not applied
    await sim(id, 'line_lost', {}).expect(422);
  });

  it('refuses messages for tickets that did not come from BimaSetu', async () => {
    const [{ id: rmUserId }] = await ds.query(
      `SELECT id FROM users WHERE email = 'rm.after.e2e@bimakavach.test'`,
    );
    const manual = (
      await head
        .post('/tickets', {
          rfqLinkUrl: 'https://example.test/rfq/e2e-after',
          businessName: 'E2E After Manual Pvt Ltd',
          industryType: INDUSTRY_TYPES_SEED[0],
          productType: 'GMC',
          businessType: 'New',
          rmUserId,
        })
        .expect(201)
    ).body;
    await sim(manual.id, 'line_lost', {}).expect(422);
  });
});
