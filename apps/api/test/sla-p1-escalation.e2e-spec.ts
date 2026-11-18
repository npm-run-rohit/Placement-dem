import { INDUSTRY_TYPES_SEED, SlaId, Stage } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { AutomationModule } from '../src/modules/automation/automation.module';
import { SlaSweeperHandler } from '../src/modules/automation/sla-sweeper.handler';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/**
 * SLA-P1 (FR-225, FR-207, BR-113): an unactioned internal breach sends three reminders, then moves the
 * ticket to the Placement Head. A Head hand-back sticks until the clock changes.
 */
describe('SLA-P1: internal breach -> reminders -> Placement Head', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let head: ReturnType<typeof as>;
  let ticketId: string;
  let pmId: string;
  let headId: string;

  const ticket = async () => (await head.get(`/tickets/${ticketId}`).expect(200)).body;
  const sweep = () => t.app.get(SlaSweeperHandler).handle();
  const events = async (eventType: string) =>
    (
      await ds.query(
        `SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id = $1 AND event_type = $2`,
        [ticketId, eventType],
      )
    )[0].n;

  beforeAll(async () => {
    t = await createTestApp([AutomationModule]);
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);
    head = as(t, TEST_USERS.head);
    await head.get('/tickets').expect(200); // upsert the Head (dev auth)

    // E2E FIXTURE - mock RM (not PRD data)
    const [rm] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.p1.e2e@bimakavach.test', 'rm.p1.e2e@bimakavach.test', 'E2E RM P1', '{rm}', 1) RETURNING id`,
    );
    const res = await pm
      .post('/tickets', {
        rfqLinkUrl: 'https://example.test/rfq/e2e-p1',
        businessName: 'E2E Escalation Pvt Ltd',
        industryType: INDUSTRY_TYPES_SEED[0],
        productType: 'GMC',
        businessType: 'New',
        rmUserId: rm.id,
      })
      .expect(201);
    ticketId = res.body.id;
    pmId = res.body.ownerId;
    [{ id: headId }] = await ds.query(`SELECT id FROM users WHERE email = 'head.e2e@bimakavach.test'`);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('does nothing before the internal clock breaches', async () => {
    expect(await ticket()).toMatchObject({
      stage: Stage.RFQ_REVIEW,
      sla: { slaId: SlaId.SLA_02 },
      escalated: false,
    });
    await sweep();
    expect(await events('sla.p1_reminder')).toBe(0);
  });

  it('after the breach plus the ladder, sends 3 reminders and moves ownership to the Placement Head (FR-225, FR-207)', async () => {
    await pm.post('/dev/clock/advance', { minutes: 5 * 24 * 60 }).expect(201); // >= 3 business days whatever the run time
    await sweep();

    expect(await ticket()).toMatchObject({ escalated: true, owner: { id: headId } });
    expect(await events('sla.p1_reminder')).toBe(3);
    expect(await events('sla.p1_escalated')).toBe(1);
    const [audit] = await ds.query(
      `SELECT detail FROM audit_events WHERE ticket_id = $1 AND event = 'Escalated to Placement Head'`,
      [ticketId],
    );
    expect(audit.detail).toContain('E2E Placement Head');
  });

  it('hides the escalated ticket from the Placement Manager (FR-208)', async () => {
    await pm.get(`/tickets/${ticketId}`).expect(404);
    expect((await pm.get('/tickets/escalated').expect(200)).body).toEqual([]);
  });

  it("lists it under the Head's Escalated to You and counts it as Overdue on the Head's desk (FR-226, PLAN 1.2)", async () => {
    const escalated = (await head.get('/tickets/escalated').expect(200)).body;
    expect(escalated.map((x: { id: string }) => x.id)).toContain(ticketId);
    expect(escalated.find((x: { id: string }) => x.id === ticketId).sla).toMatchObject({
      slaId: SlaId.SLA_02,
      breached: true,
    });

    const me = (await head.get('/tickets/desk-counts?scope=me').expect(200)).body;
    expect(me.overdue).toBeGreaterThanOrEqual(1);
    const pmDesk = (await pm.get('/tickets/desk-counts').expect(200)).body;
    expect(Object.keys(pmDesk).sort()).toEqual([
      'dueToday',
      'insurerResponse',
      'overdue',
      'quotesToReview',
      'rmResponse',
    ]);
  });

  it('is idempotent: another sweep sends nothing new', async () => {
    await sweep();
    expect(await events('sla.p1_reminder')).toBe(3);
    expect(await events('sla.p1_escalated')).toBe(1);
  });

  it('a Head hand-back clears the escalation and is not undone by the next sweep (BR-113)', async () => {
    await head
      .post(`/tickets/${ticketId}/reassign`, { ownerId: pmId, reason: 'Back to you, please validate today' })
      .expect(201);
    expect(await ticket()).toMatchObject({ escalated: false, owner: { id: pmId } });

    await sweep();
    expect(await ticket()).toMatchObject({ escalated: false, owner: { id: pmId } });
    expect(await events('sla.p1_escalated')).toBe(1);
  });
});
