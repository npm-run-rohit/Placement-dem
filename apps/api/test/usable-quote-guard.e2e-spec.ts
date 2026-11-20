import { RiskTier, ThreadStatus, INDUSTRY_TYPES_SEED } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/**
 * BR-054 / M8 s10: a quote cannot be marked usable while an open clarification exists on its thread,
 * whether the insurer's question is still unanswered or the thread is held for RM information (FR-063).
 * One ordered journey on a single thread: each case starts from the state the previous one left.
 */
describe('Marking a quote usable while its thread has an open clarification', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let ticketId: string;
  let threadId: string;

  const insurer = (kind: string, text?: string) =>
    pm.post(`/dev/tickets/${ticketId}/threads/${threadId}/insurer`, { kind, text }).expect(201);
  const decide = (quoteId: string) =>
    pm.post(`/tickets/${ticketId}/quotes/${quoteId}/decision`, { decision: 'usable' });

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);

    // E2E FIXTURE - mock RM and one insurer (not PRD data)
    const [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.guard.e2e@bimakavach.test', 'rm.guard.e2e@bimakavach.test', 'E2E RM Guard', '{rm}', 1) RETURNING id`,
    );
    const [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-guard', 'E2E Guard Insurer', 'Active', 1) RETURNING id`,
    );
    const [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'E2E Guard POC', 'eb.guard@insurer.example.test', 1)`,
      [branchId],
    );

    const created = await pm
      .post('/tickets', {
        rfqLinkUrl: 'https://example.test/rfq/e2e-guard',
        businessName: 'E2E Usable Guard Pvt Ltd',
        industryType: INDUSTRY_TYPES_SEED[0],
        productType: 'GMC',
        businessType: 'New',
        rmUserId,
      })
      .expect(201);
    ticketId = created.body.id;
    await pm.put(`/tickets/${ticketId}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm.post(`/tickets/${ticketId}/rfq/validate`).expect(201);
    await pm.put(`/tickets/${ticketId}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await pm.post(`/tickets/${ticketId}/rfq/float`).expect(201);
    [{ id: threadId }] = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body;
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('refuses while the insurer question is unanswered', async () => {
    await insurer('clarification', 'Please share the claims history');
    const quote = (await insurer('quote')).body;
    const res = await decide(quote.id).expect(422);
    expect(res.body.message).toContain('open insurer question');
  });

  it('refuses while the thread is held for RM information', async () => {
    await insurer('clarification', 'Please share the employee census');
    await pm
      .post(`/tickets/${ticketId}/threads/${threadId}/hold-for-rm`, { request: 'Claims history please' })
      .expect(201);
    const quote = (await insurer('quote')).body;
    const res = await decide(quote.id).expect(422);
    expect(res.body.message).toContain('open insurer question');
  });

  it('keeps the thread held for the RM when a quote arrives meanwhile (FR-063)', async () => {
    const thread = () =>
      pm
        .get(`/tickets/${ticketId}/threads`)
        .then((r) => r.body.find((x: { id: string }) => x.id === threadId));
    expect((await thread()).status).toBe(ThreadStatus.AWAITING_RM);
    const quote = (await insurer('quote')).body;
    expect((await thread()).status).toBe(ThreadStatus.AWAITING_RM);
    await pm
      .post(`/tickets/${ticketId}/quotes/${quote.id}/decision`, { decision: 'excluded', note: 'Wrong cover' })
      .expect(201);
    expect((await thread()).status).toBe(ThreadStatus.AWAITING_RM);
    await pm
      .post(`/dev/tickets/${ticketId}/threads/${threadId}/rm-reply`, { text: 'Census attached' })
      .expect(201);
  });

  it('shows the quote waiting for review once we reply, not Acknowledged', async () => {
    const latest = (await insurer('quote')).body;
    await pm.post(`/tickets/${ticketId}/threads/${threadId}/reply`, { text: 'Census attached' }).expect(201);
    const th = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body.find(
      (x: { id: string }) => x.id === threadId,
    );
    expect(th.status).toBe(ThreadStatus.QUOTE_RECEIVED);
    await decide(latest.id).expect(201);
  });

  it('keeps the usable quote when a quote excluded during a question is followed by our reply', async () => {
    await insurer('clarification', 'Is maternity cover needed?');
    const quote = (await insurer('quote')).body;
    await pm
      .post(`/tickets/${ticketId}/quotes/${quote.id}/decision`, { decision: 'excluded', note: 'Wrong cover' })
      .expect(201);
    await pm
      .post(`/tickets/${ticketId}/threads/${threadId}/reply`, { text: 'No maternity cover' })
      .expect(201);
    const th = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body.find(
      (x: { id: string }) => x.id === threadId,
    );
    expect(th.status).toBe(ThreadStatus.QUOTE_USABLE);
  });

  it('does not block the thread after a restart drops the open question', async () => {
    await insurer('clarification', 'Please confirm the sum insured');
    await pm
      .post(`/tickets/${ticketId}/threads/restart`, { threadIds: [threadId], reason: 'Revised terms' })
      .expect(201);
    const quote = (await insurer('quote')).body;
    await decide(quote.id).expect(201);
  });
});
