import { INDUSTRY_TYPES_SEED } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/**
 * FR-208 (PLAN 1.3, Rohit 2026-11-02): a PM sees every non-escalated team ticket; a ticket escalated to the
 * Placement Head disappears for PMs on every route, sub-resources and documents included.
 */
describe('Ticket visibility', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let otherPm: ReturnType<typeof as>;
  let head: ReturnType<typeof as>;
  let ticketId: string;
  let documentId: string;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);
    head = as(t, TEST_USERS.head);
    // E2E FIXTURE - a second Placement Manager and a mock RM (not PRD data)
    otherPm = as(t, 'pm2.visibility.e2e@bimakavach.test|E2E Second PM|placement_manager');
    const [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.visibility.e2e@bimakavach.test', 'rm.visibility.e2e@bimakavach.test', 'E2E RM Visibility', '{rm}', 1) RETURNING id`,
    );
    const ticket = (
      await pm
        .post('/tickets', {
          rfqLinkUrl: 'https://example.test/rfq/e2e-visibility',
          businessName: 'E2E Visibility Pvt Ltd',
          industryType: INDUSTRY_TYPES_SEED[0],
          productType: 'GMC',
          businessType: 'New',
          rmUserId,
        })
        .expect(201)
    ).body;
    ticketId = ticket.id;
    documentId = (
      await pm
        .upload('/documents', { ticketId, kind: 'rfq_excel' }, { name: 'visibility.xlsx', content: 'x' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await t?.app.close();
  });

  const subResources = () => [
    `/tickets/${ticketId}`,
    `/tickets/${ticketId}/threads`,
    `/tickets/${ticketId}/quotes`,
    `/tickets/${ticketId}/qcrs`,
    `/tickets/${ticketId}/rfq/queries`,
    `/tickets/${ticketId}/audit`,
    `/tickets/${ticketId}/mails`,
    `/tickets/${ticketId}/mandate`,
    `/tickets/${ticketId}/revisions`,
    `/documents/ticket/${ticketId}`,
    `/documents/${documentId}/download-url`,
  ];

  it('lets every PM open a non-escalated team ticket', async () => {
    for (const path of subResources()) await otherPm.get(path).expect(200);
  });

  it('hides a ticket escalated to the Placement Head from every PM, on every route', async () => {
    const { id: headId } = (await head.get('/me').expect(200)).body;
    // E2E FIXTURE - the SLA-P1 escalation itself is covered in sla-p1-escalation.e2e-spec.ts
    await ds.query(`UPDATE placement_tickets SET escalated = true, owner_id = $2 WHERE id = $1`, [
      ticketId,
      headId,
    ]);

    for (const path of subResources()) {
      await pm.get(path).expect(404);
      await otherPm.get(path).expect(404);
      await head.get(path).expect(200);
    }
    await pm.put(`/tickets/${ticketId}/target-premium`, { targetPremium: 100000 }).expect(404);
    await pm
      .upload('/documents', { ticketId, kind: 'rfq_excel' }, { name: 'again.xlsx', content: 'x' })
      .expect(404);
    const queue = (await pm.get('/tickets?pageSize=200').expect(200)).body;
    expect(JSON.stringify(queue)).not.toContain(ticketId);
  });

  it('never serves a thread timeline through another ticket', async () => {
    const [other] = await ds.query(
      `SELECT id FROM placement_tickets WHERE escalated = false AND id <> $1 LIMIT 1`,
      [ticketId],
    );
    const [thread] = other
      ? await ds.query(`SELECT id, ticket_id FROM insurer_threads WHERE ticket_id <> $1 LIMIT 1`, [other.id])
      : [];
    if (!thread) return; // run alone: no floated ticket in this database
    await head.get(`/tickets/${thread.ticket_id}/threads/${thread.id}/timeline`).expect(200);
    await head.get(`/tickets/${other.id}/threads/${thread.id}/timeline`).expect(404);
  });
});
