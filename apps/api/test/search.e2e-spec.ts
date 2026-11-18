import { INDUSTRY_TYPES_SEED, RiskTier, type SearchView } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Global search (PLAN 1.8, UI-SPEC 2.5). */
describe('Search', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let head: ReturnType<typeof as>;
  let ticketNo: string;
  let ticketId: string;

  const search = async (q: string, scopes?: string, who = pm): Promise<SearchView> =>
    (
      await who
        .get('/search')
        .query({ q, ...(scopes === undefined ? {} : { scopes }) })
        .expect(200)
    ).body;
  const nos = (r: SearchView) => r.items.map((i) => i.ticketNo);

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);
    head = as(t, TEST_USERS.head);

    // E2E FIXTURE - mock RM and one insurer branch (not PRD data)
    const [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.search.e2e@bimakavach.test', 'rm.search.e2e@bimakavach.test', 'Zubin Searchwala', '{rm}', 1) RETURNING id`,
    );
    const [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-search', 'Quokka General Insurance', 'Active', 1) RETURNING id`,
    );
    const [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Sia Sen', 'sia@search-insurer.example.test', 1)`,
      [branchId],
    );

    const created = await pm
      .post('/tickets', {
        rfqLinkUrl: 'https://example.test/rfq/e2e-search',
        businessName: 'Xylophone Textiles Pvt Ltd',
        industryType: INDUSTRY_TYPES_SEED[0],
        productType: 'GMC',
        businessType: 'New',
        rmUserId,
        clientSpoc: 'Yamini Spoc',
      })
      .expect(201);
    ({ id: ticketId, ticketNo } = created.body);
    await pm.put(`/tickets/${ticketId}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm.post(`/tickets/${ticketId}/rfq/validate`).expect(201);
    await pm.put(`/tickets/${ticketId}/panel`, { insurerId, branchId, selected: true }).expect(200);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('shows three recent tickets, open first, for an empty query', async () => {
    const r = await search('');
    expect(r.recent).toBe(true);
    expect(r.items.length).toBeLessThanOrEqual(3);
    expect(nos(r)).toContain(ticketNo); // newest open ticket
  });

  it('finds a ticket by number, client, RM, SPOC and panel insurer, case-insensitively', async () => {
    for (const q of [ticketNo.toLowerCase(), 'xylophone', 'searchwala', 'yamini', 'quokka'])
      expect(nos(await search(q))).toContain(ticketNo);
  });

  it('only searches the chosen scopes', async () => {
    expect(nos(await search('xylophone', 'tickets,insurers'))).not.toContain(ticketNo);
    expect(nos(await search('quokka', 'clients'))).not.toContain(ticketNo);
    expect(nos(await search('quokka', 'insurers'))).toContain(ticketNo);
    expect((await search('xylophone', '')).items).toEqual([]);
  });

  it('matches stage labels and treats % as a literal', async () => {
    expect(nos(await search('insurer selection', 'tickets'))).toContain(ticketNo);
    expect((await search('%')).items).toEqual([]);
  });

  it('never shows a PM a Head-owned escalated ticket (FR-208)', async () => {
    await ds.query(`UPDATE placement_tickets SET escalated = true WHERE id = $1`, [ticketId]); // E2E FIXTURE: stand-in for the SLA-P1 ladder
    expect(nos(await search('xylophone'))).not.toContain(ticketNo);
    expect(nos(await search('xylophone', undefined, head))).toContain(ticketNo);
  });
});
