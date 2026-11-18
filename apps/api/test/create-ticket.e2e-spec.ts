import { INDUSTRY_TYPES_SEED, type DirectoryView, type TicketPagerView } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Create Ticket pickers and intake checks (PLAN 1.7, FR-192..198). */
describe('Create Ticket', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let head: ReturnType<typeof as>;
  let rmUserId: string;

  const body = (extra: Record<string, unknown>) => ({
    rfqLinkUrl: 'https://example.test/rfq/e2e-create',
    businessName: 'E2E Create Pvt Ltd',
    industryType: INDUSTRY_TYPES_SEED[0],
    productType: 'GMC',
    businessType: 'New',
    rmUserId,
    ...extra,
  });

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);
    head = as(t, TEST_USERS.head);
    // E2E FIXTURE - mock RM (not PRD data)
    [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.create.e2e@bimakavach.test', 'rm.create.e2e@bimakavach.test', 'E2E RM Create', '{rm}', 1) RETURNING id`,
    );
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('lists RMs and assignable owners for the pickers', async () => {
    await pm.get('/me').expect(200);
    await head.get('/me').expect(200);
    const d: DirectoryView = (await pm.get('/directory').expect(200)).body;
    expect(d.rms).toContainEqual(
      expect.objectContaining({
        id: rmUserId,
        name: 'E2E RM Create',
        email: 'rm.create.e2e@bimakavach.test',
      }),
    );
    expect(d.owners).toContainEqual(
      expect.objectContaining({ name: 'E2E Placement Manager', role: 'Placement Manager' }),
    );
    expect(d.owners).toContainEqual(
      expect.objectContaining({ name: 'E2E Placement Head', role: 'Placement Head' }),
    );
  });

  it('refuses an RM who is not an active RM', async () => {
    const { id: pmId } = (await pm.get('/me').expect(200)).body;
    await pm.post('/tickets', body({ rmUserId: pmId })).expect(422);
  });

  it('lets the Head assign a PM as owner, keeps a PM-created ticket with its creator (FR-198)', async () => {
    const { id: pmId } = (await pm.get('/me').expect(200)).body;
    const { id: headId } = (await head.get('/me').expect(200)).body;
    const byHead = (
      await head
        .post('/tickets', body({ ownerId: pmId, urgency: 'High', clientSpoc: 'Ira Spoc' }))
        .expect(201)
    ).body;
    expect(byHead.ownerId).toBe(pmId);
    const byPm = (await pm.post('/tickets', body({ ownerId: headId })).expect(201)).body;
    expect(byPm.ownerId).toBe(pmId);
    await head.post('/tickets', body({ ownerId: rmUserId })).expect(422);
  });

  it('pages between open tickets in urgency order and skips escalated ones for a PM (TicketPager)', async () => {
    const pager = async (no: string, who = pm): Promise<TicketPagerView> =>
      (await who.get(`/tickets/by-no/${no}/pager`).expect(200)).body;
    const a = (await pm.post('/tickets', body({ businessName: 'E2E Pager A Pvt Ltd' })).expect(201)).body;
    const b = (await pm.post('/tickets', body({ businessName: 'E2E Pager B Pvt Ltd' })).expect(201)).body;
    const pb = await pager(b.ticketNo);
    expect(pb.total).toBeGreaterThanOrEqual(2);
    expect(pb.prev).not.toBeNull();
    expect((await pager(pb.prev!)).next).toBe(b.ticketNo); // neighbours agree both ways
    const [pmBefore, headBefore] = [(await pager(a.ticketNo)).total, (await pager(a.ticketNo, head)).total];
    await ds.query(`UPDATE placement_tickets SET escalated = true WHERE id = $1`, [b.id]); // E2E FIXTURE: stand-in for the SLA-P1 ladder
    expect((await pager(a.ticketNo)).total).toBe(pmBefore - 1);
    expect((await pager(a.ticketNo, head)).total).toBe(headBefore);
  });
});
