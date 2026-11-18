import { FOLLOW_UP_LADDER_DEFAULTS, INDUSTRY_TYPES_SEED, RiskTier } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { Clock } from '../src/common/time/clock';
import { AutomationModule } from '../src/modules/automation/automation.module';
import { dueFollowUpStep } from '../src/modules/automation/follow-up-ladder';
import { SlaSweeperHandler } from '../src/modules/automation/sla-sweeper.handler';
import { SlaConfigService } from '../src/modules/sla/sla-config.service';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Insurer follow-up ladder (PLAN 2.9, BR-037..041): automatic reminders to the insurer from the PM's mailbox. */
describe('Follow-up ladder', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let ticketId: string;
  let waiting: { id: string; threadRef: string };
  let declined: { id: string };

  const sweep = () => t.app.get(SlaSweeperHandler).handle();
  const followUps = async (threadId: string): Promise<Array<{ step: number; templateId: string }>> =>
    (
      await ds.query(
        `SELECT payload FROM outbox_events WHERE event_type = 'mail.insurer_follow_up' AND payload->>'threadId' = $1 ORDER BY created_at`,
        [threadId],
      )
    ).map((r: { payload: { step: number; templateId: string } }) => r.payload);
  /** Move the dev clock into the next business window so the sweeper is allowed to send. */
  const intoBusinessHours = async () => {
    const now = t.app.get(Clock).now();
    const next = t.app.get(SlaConfigService).calendar.nextBusinessMoment(now);
    if (next > now)
      await pm
        .post('/dev/clock/advance', { minutes: Math.ceil((next.getTime() - now.getTime()) / 60_000) + 5 })
        .expect(201);
  };

  beforeAll(async () => {
    t = await createTestApp([AutomationModule]);
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);

    // E2E FIXTURE - mock RM and two insurers with one branch + POC each (not PRD data)
    const [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.fu.e2e@bimakavach.test', 'rm.fu.e2e@bimakavach.test', 'E2E RM Follow-up', '{rm}', 1) RETURNING id`,
    );
    const entities: Array<{ insurerId: string; branchId: string }> = [];
    for (const n of [1, 2]) {
      const [{ id: insurerId }] = await ds.query(
        `INSERT INTO insurers (code, name, status, row_version) VALUES ($1, $2, 'Active', 1) RETURNING id`,
        [`e2e-fu-${n}`, `E2E Follow-up Insurer ${n}`],
      );
      const [{ id: branchId }] = await ds.query(
        `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
        [insurerId],
      );
      await ds.query(
        `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Poc ${n}', $2, 1)`,
        [branchId, `poc${n}@fu-insurer.example.test`],
      );
      entities.push({ insurerId, branchId });
    }
    ticketId = (
      await pm
        .post('/tickets', {
          rfqLinkUrl: 'https://example.test/rfq/e2e-fu',
          businessName: 'E2E Follow-up Pvt Ltd',
          industryType: INDUSTRY_TYPES_SEED[0],
          productType: 'GMC',
          businessType: 'New',
          rmUserId,
        })
        .expect(201)
    ).body.id;
    await pm.put(`/tickets/${ticketId}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm.post(`/tickets/${ticketId}/rfq/validate`).expect(201);
    for (const e of entities)
      await pm.put(`/tickets/${ticketId}/panel`, { ...e, selected: true }).expect(200);
    await pm.post(`/tickets/${ticketId}/rfq/float`).expect(201);
    const threads = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body;
    [waiting, declined] = threads;
    await pm
      .post(`/dev/tickets/${ticketId}/threads/${declined.id}/insurer`, {
        kind: 'decline',
        text: 'No appetite for this risk',
      })
      .expect(201);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('sends nothing right after the float', async () => {
    await sweep();
    expect(await followUps(waiting.id)).toEqual([]);
  });

  it('chases a waiting insurer once the ladder is due, from the PM, never a declined one (BR-037, BR-039)', async () => {
    await pm.post('/dev/clock/advance', { minutes: 5 * 24 * 60 }).expect(201);
    await intoBusinessHours();
    await sweep();

    const [{ floated_at: floatedAt }] = await ds.query(
      `SELECT floated_at FROM insurer_threads WHERE id = $1`,
      [waiting.id],
    );
    const cal = t.app.get(SlaConfigService).calendar;
    const expected = dueFollowUpStep(
      cal.minutesBetween(new Date(floatedAt), t.app.get(Clock).now()),
      0,
      FOLLOW_UP_LADDER_DEFAULTS,
      cal.minutesPerDay,
    );
    expect(expected).not.toBeNull();
    const sent = await followUps(waiting.id);
    expect(sent).toEqual([
      expect.objectContaining({
        step: expected,
        templateId: FOLLOW_UP_LADDER_DEFAULTS[expected! - 1].templateId,
      }),
    ]); // one mail, not a burst
    expect(await followUps(declined.id)).toEqual([]);

    const th = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body.find(
      (x: { id: string }) => x.id === waiting.id,
    );
    expect(th.followUpsSent).toBe(expected);
    const audit = (await pm.get(`/tickets/${ticketId}/audit`).expect(200)).body.map(
      (a: { event: string }) => a.event,
    );
    expect(audit).toContain(`${FOLLOW_UP_LADDER_DEFAULTS[expected! - 1].label} sent`);
  });

  it('does not repeat a step on the next sweep', async () => {
    const before = (await followUps(waiting.id)).length;
    await sweep();
    expect(await followUps(waiting.id)).toHaveLength(before);
  });

  it('stops once the insurer sends a quote, even with the ladder re-opened', async () => {
    await pm.post(`/dev/tickets/${ticketId}/threads/${waiting.id}/insurer`, { kind: 'quote' }).expect(201);
    await ds.query(`UPDATE insurer_threads SET follow_ups_sent = 0 WHERE id = $1`, [waiting.id]); // E2E FIXTURE: re-open the ladder to prove the status gate
    await pm.post('/dev/clock/advance', { minutes: 60 }).expect(201);
    await intoBusinessHours();
    const before = (await followUps(waiting.id)).length;
    await sweep();
    expect(await followUps(waiting.id)).toHaveLength(before);
  });
});
