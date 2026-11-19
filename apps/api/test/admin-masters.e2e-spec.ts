import { SlaId } from '@bimaplacement/contracts';
import { SlaConfigService } from '../src/modules/sla/sla-config.service';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Admin masters (PLAN 4.2, FR-139..148): edits are validated, logged before/after and applied to the SLA cache. */
describe('Admin masters', () => {
  let t: TestApp;
  let head: ReturnType<typeof as>;
  let pm: ReturnType<typeof as>;
  let sla: SlaConfigService;

  // a Wednesday well clear of any fixture data: 10:00-19:00 IST
  const day = '2031-01-08';
  const dayStart = new Date('2031-01-08T04:30:00Z');
  const dayEnd = new Date('2031-01-08T13:30:00Z');

  beforeAll(async () => {
    t = await createTestApp();
    head = as(t, TEST_USERS.head);
    pm = as(t, TEST_USERS.pm);
    sla = t.app.get(SlaConfigService);
  });

  afterAll(async () => {
    // other suites share this database: put the PRD values back
    await head.patch('/masters/sla/SLA-02', { targetMins: 60, targetText: '1 business hour' });
    await head.put('/masters/quote-targets', { timingLob: 'EB', scenario: 'nonPreferred', businessDays: 7 });
    await head.put('/masters/settings/sla_p1', { reminderIntervalMins: 30 });
    await head.patch(`/masters/holidays/${day}`, { active: false });
    await t?.app.close();
  });

  const changes = async () => (await head.get('/masters/change-log').expect(200)).body;

  it('is Placement Head / Admin only', async () => {
    await pm.get('/masters/admin').expect(403);
    await pm.patch('/masters/sla/SLA-02', { targetMins: 90 }).expect(403);
    const view = (await head.get('/masters/admin').expect(200)).body;
    expect(view.sla.find((s: { id: string }) => s.id === 'SLA-06').derived).toBe(true);
    expect(view.calendar.minutesPerDay).toBe(540);
    expect(view.lookups.every((l: { kind: string }) => l.kind !== 'urgency')).toBe(true);
    expect(view.mailboxes).toBeNull(); // dev driver: no real mailboxes
  });

  it('edits an SLA target, logs before/after and reloads the clock config (FR-139, FR-148)', async () => {
    const view = (await head.patch('/masters/sla/SLA-02', { targetMins: 90 }).expect(200)).body;
    expect('mailboxes' in view).toBe(false); // a save does not ask the mail provider for mailbox status
    expect(view.sla.find((s: { id: string }) => s.id === 'SLA-02')).toMatchObject({
      targetMins: 90,
      targetText: '90 business minutes',
    });
    expect(sla.definitions.get(SlaId.SLA_02)?.targetMins).toBe(90);
    const log: Array<{ field: string }> = (await changes()).slice(0, 2);
    const mins = log.find((c) => c.field === 'targetMins');
    const text = log.find((c) => c.field === 'targetText');
    expect(mins).toMatchObject({ entityType: 'sla_definition', field: 'targetMins', before: 60, after: 90 });
    expect(text).toMatchObject({ field: 'targetText', changedBy: 'E2E Placement Head' });

    await head.patch('/masters/sla/SLA-06', { targetMins: 600 }).expect(422);
    await head.patch('/masters/sla/SLA-08', { targetMins: 600 }).expect(422);
    await head.patch('/masters/sla/SLA-99', { targetMins: 60 }).expect(404);
  });

  it('edits an SLA-06 matrix cell in half days', async () => {
    await head
      .put('/masters/quote-targets', { timingLob: 'EB', scenario: 'nonPreferred', businessDays: 6.3 })
      .expect(422);
    await head
      .put('/masters/quote-targets', { timingLob: 'EB', scenario: 'nonPreferred', businessDays: 6.5 })
      .expect(200);
    expect(sla.matrix.EB.nonPreferred).toBe(6.5);
  });

  it('merges and validates settings, and ignores a save that changes nothing', async () => {
    await head.put('/masters/settings/sla_p1', { reminderIntervalMins: 2 }).expect(422);
    await head.put('/masters/settings/nonsense', { a: 1 }).expect(422);
    await head.put('/masters/settings/sla_p1', { reminderIntervalMins: 45 }).expect(200);
    expect(sla.slaP1).toEqual({ reminderIntervalMins: 45, remindersBeforeEscalation: 3 });
    const before = (await changes()).length;
    await head.put('/masters/settings/sla_p1', { reminderIntervalMins: 45 }).expect(200);
    expect((await changes()).length).toBe(before);

    await head
      .put('/masters/settings/follow_up_ladder', [
        { afterBusinessDays: 1, label: 'Nudge', templateId: 'RM-T01' },
      ])
      .expect(422);
  });

  it('adds a holiday to the business calendar and retires it, never deletes it', async () => {
    expect(sla.calendar.minutesBetween(dayStart, dayEnd)).toBe(540);
    await head.post('/masters/holidays', { date: day, name: 'E2E holiday' }).expect(201);
    expect(sla.calendar.minutesBetween(dayStart, dayEnd)).toBe(0);
    await head.post('/masters/holidays', { date: day, name: 'Again' }).expect(422);
    await head.post('/masters/holidays', { date: '2031-02-30', name: 'Bad' }).expect(422);

    const view = (await head.patch(`/masters/holidays/${day}`, { active: false }).expect(200)).body;
    expect(view.holidays.find((h: { date: string }) => h.date === day)).toEqual({
      date: day,
      name: 'E2E holiday',
      active: false,
    });
    expect(sla.calendar.minutesBetween(dayStart, dayEnd)).toBe(540);
    // re-adding a retired date brings it back
    await head.post('/masters/holidays', { date: day, name: 'E2E holiday' }).expect(201);
    expect(sla.calendar.minutesBetween(dayStart, dayEnd)).toBe(0);
  });

  it('adds and retires reason values; enum-backed lists stay fixed (FR-146)', async () => {
    await head.post('/masters/lookups/urgency', { value: 'Whenever' }).expect(422);
    const add = (kind: string, value: string) =>
      head
        .post(`/masters/lookups/${kind}`, { value })
        .expect(201)
        .then((r) => r.body.lookups.find((l: { value: string }) => l.value === value));
    const row = await add('mandate_decline_reason', 'E2E decline reason');
    expect(row).toMatchObject({ kind: 'mandate_decline_reason', active: true });
    await head.post('/masters/lookups/mandate_decline_reason', { value: 'E2E decline reason' }).expect(422);

    await head.patch(`/masters/lookup-values/${row.id}`, { active: false }).expect(200);
    const live = (await pm.get('/masters/lookups/mandate_decline_reason').expect(200)).body;
    expect(live.some((l: { value: string }) => l.value === 'E2E decline reason')).toBe(false);
    await head.post('/masters/lookups/mandate_decline_reason', { value: 'E2E decline reason' }).expect(422); // retired

    // a list keeps at least one active value once it has any
    const only = await add('closure_reason', 'E2E closure reason');
    await head.patch(`/masters/lookup-values/${only.id}`, { active: false }).expect(422);
  });

  it('edits template wording but keeps known placeholders and the insurer subject reference (FR-140)', async () => {
    await head
      .patch('/masters/templates/INS-T02', { bodyTemplate: 'Dear {{POC}}, {{NotAThing}}' })
      .expect(422);
    await head.patch('/masters/templates/INS-T02', { subjectTemplate: 'Follow-up {{Client}}' }).expect(422);
    const view = (
      await head
        .patch('/masters/templates/INS-T02', {
          bodyTemplate: 'Dear {{POC}}, gentle reminder on the RFQ sent {{RFQSentDate}}. Regards, {{PMName}}.',
        })
        .expect(200)
    ).body;
    expect(view.templates.find((x: { id: string }) => x.id === 'INS-T02').bodyTemplate).toContain(
      'gentle reminder',
    );
  });

  it('keeps product aliases unique across product types (FR-230)', async () => {
    await head.patch('/masters/product-types/GPA', { aliases: ['GPA', 'Group Mediclaim'] }).expect(422);
    const view = (
      await head
        .patch('/masters/product-types/GPA', { aliases: ['GPA', 'Group Personal Accident', 'GPA Cover'] })
        .expect(200)
    ).body;
    expect(view.productTypes.find((p: { code: string }) => p.code === 'GPA').aliases).toContain('GPA Cover');
  });

  it('keeps admin edits off the Insurer Master change log', async () => {
    const insurerLog = (await head.get('/insurers/change-log').expect(200)).body;
    expect(
      insurerLog.every((c: { entityType: string }) => ['insurer', 'branch', 'poc'].includes(c.entityType)),
    ).toBe(true);
  });
});
