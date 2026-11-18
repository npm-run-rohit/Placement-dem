import { INDUSTRY_TYPES_SEED, RiskTier, type ProgressView, type ReportsView } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Reports (PLAN 4.3, UI-SPEC 3.6, PRD 9.4). Other specs share the DB, so every check is a delta. */
describe('Reports', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let head: ReturnType<typeof as>;
  let rmUserId: string;
  let insurerId: string;
  let branchId: string;

  const report = async (who = pm): Promise<ReportsView> => (await who.get('/reports').expect(200)).body;
  const stage = (r: ReportsView, s: string) => r.pipeline.byStage.find((x) => x.stage === s)!.n;
  const funnel = (r: ReportsView, step: string) => r.funnel.find((x) => x.step === step)!.n;
  const outcome = (r: ReportsView) => r.insurerOutcomes.find((x) => x.insurerId === insurerId);
  const create = async (name: string) =>
    (
      await pm
        .post('/tickets', {
          rfqLinkUrl: 'https://example.test/rfq/e2e-reports',
          businessName: name,
          industryType: INDUSTRY_TYPES_SEED[0],
          productType: 'GMC',
          businessType: 'New',
          rmUserId,
        })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);
    head = as(t, TEST_USERS.head);

    // E2E FIXTURE - mock RM and one insurer branch (not PRD data)
    [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.reports.e2e@bimakavach.test', 'rm.reports.e2e@bimakavach.test', 'E2E RM Reports', '{rm}', 1) RETURNING id`,
    );
    [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-reports', 'E2E Reports Insurer', 'Active', 1) RETURNING id`,
    );
    [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Ravi Rao', 'ravi@reports-insurer.example.test', 1)`,
      [branchId],
    );
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('counts a new ticket in the pipeline and as RFQ Submitted only', async () => {
    const before = await report();
    await create('E2E Reports One Pvt Ltd');
    const after = await report();
    expect(after.pipeline.active).toBe(before.pipeline.active + 1);
    expect(stage(after, 'rfq_review')).toBe(stage(before, 'rfq_review') + 1);
    expect(funnel(after, 'RFQ Submitted')).toBe(funnel(before, 'RFQ Submitted')! + 1);
    expect(funnel(after, 'RFQ Complete')).toBe(funnel(before, 'RFQ Complete'));
    expect(funnel(after, 'Sent to Client')).toBeNull();
    expect(after.sla.within + after.sla.breached).toBe(after.pipeline.active);
  });

  it('moves the ticket down the funnel and counts the insurer as approached, then quoted', async () => {
    const before = await report();
    const id = await create('E2E Reports Two Pvt Ltd');
    await pm.put(`/tickets/${id}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm.post(`/tickets/${id}/rfq/validate`).expect(201);
    await pm.put(`/tickets/${id}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await pm.post(`/tickets/${id}/rfq/float`).expect(201);

    const floated = await report();
    for (const step of ['RFQ Submitted', 'RFQ Complete', 'Insurers Approved', 'RFQ Floated'])
      expect(funnel(floated, step)).toBe(funnel(before, step)! + 1);
    expect(funnel(floated, 'First Usable Quote')).toBe(funnel(before, 'First Usable Quote'));
    expect(outcome(floated)).toMatchObject({
      insurer: 'E2E Reports Insurer',
      approached: 1,
      responded: 0,
      quoted: 0,
      declined: 0,
    });

    const [th] = (await pm.get(`/tickets/${id}/threads`).expect(200)).body;
    await pm.post(`/dev/tickets/${id}/threads/${th.id}/insurer`, { kind: 'quote' }).expect(201);
    const quoted = await report();
    expect(outcome(quoted)).toMatchObject({ approached: 1, responded: 1, quoted: 1 });
  });

  it('hides Head-owned escalated tickets from a PM but not from the Head (FR-208)', async () => {
    const id = await create('E2E Reports Escalated Pvt Ltd');
    const [pmBefore, headBefore] = [await report(pm), await report(head)];
    await ds.query(`UPDATE placement_tickets SET escalated = true WHERE id = $1`, [id]); // E2E FIXTURE: stand-in for the SLA-P1 ladder
    const [pmAfter, headAfter] = [await report(pm), await report(head)];
    expect(pmAfter.scope).toBe('visible');
    expect(headAfter.scope).toBe('team');
    expect(pmAfter.pipeline.active).toBe(pmBefore.pipeline.active - 1);
    expect(headAfter.pipeline.active).toBe(headBefore.pipeline.active);
  });

  it('reports progress from the ticket clock history, Me only for a PM (Home, UI-SPEC 3.1)', async () => {
    const progress = async (
      who: ReturnType<typeof as>,
      query: Record<string, string>,
    ): Promise<ProgressView> => (await who.get('/reports/progress').query(query).expect(200)).body;
    const before = await progress(pm, { range: 'week' });
    await create('E2E Reports Progress Pvt Ltd'); // starts SLA-02, a Placement-owned clock
    const after = await progress(pm, { range: 'week', scope: 'team' });
    expect(after.scope).toBe('me'); // a PM has no team view
    expect(after.ticketsOnTrack.total).toBe(before.ticketsOnTrack.total + 1);
    expect(after.medianSlaUsed).not.toBeNull();
    expect((await progress(head, { range: 'quarter' })).scope).toBe('team');
    const custom = await progress(head, { range: 'custom', from: '2026-01-01', to: '2026-02-01' });
    expect(custom).toMatchObject({
      range: 'custom',
      ticketsOnTrack: { onTrack: 0, total: 0 },
      medianSlaUsed: null,
    });
    await head
      .get('/reports/progress')
      .query({ range: 'custom', from: '2026-02-01', to: '2026-01-01' })
      .expect(422);
  });

  it('gives the Placement Head a team dashboard and a PM none (PRD 9.2)', async () => {
    expect((await report(pm)).team).toBeNull();
    await create('E2E Reports Team Pvt Ltd');
    const { team } = await report(head);
    expect(team).not.toBeNull();
    expect(team!.workload.find((w) => w.name === 'E2E Placement Manager')?.open).toBeGreaterThan(0);
    expect(team!.ageing.map((a) => a.bucket)).toEqual([
      'Under 1 business day',
      '1 to 3 business days',
      '3 to 7 business days',
      '7 business days or more',
    ]);
    expect(team!.ageing.reduce((n, a) => n + a.n, 0)).toBe((await report(head)).pipeline.active);
    expect(team!.mix.channel.find((c) => c.key === 'manual')?.n).toBeGreaterThan(0);
    const full = await report(head);
    expect(team!.quoteCollection.count).toBe(stage(full, 'market'));
    expect(team!.awaitingRm.count).toBe(stage(full, 'awaiting_rm'));
  });
});
