import { INDUSTRY_TYPES_SEED, RiskTier, type NotificationView } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { NotificationsHandler } from '../src/modules/notifications/notifications.handler';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** In-app notifications (PLAN 4.1, PRD notification tables, INT-T01..T06). */
describe('Notifications', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let head: ReturnType<typeof as>;
  let rmUserId: string;
  let pmId: string;
  let insurerId: string;
  let branchId: string;

  /** Run every not-yet-delivered notification outbox event of a ticket through the handler, as the worker would. */
  const deliver = async (ticketId: string) => {
    const rows = await ds.query(
      `SELECT id, event_type, aggregate_id, created_at, payload FROM outbox_events WHERE destination = 'notification' AND aggregate_id = $1 ORDER BY created_at`,
      [ticketId],
    );
    for (const r of rows)
      await t.app.get(NotificationsHandler).handle(r.event_type, {
        outboxId: r.id,
        eventType: r.event_type,
        aggregateId: r.aggregate_id,
        occurredAt: r.created_at.toISOString(),
        ...r.payload,
      });
  };
  const inbox = async (who = pm): Promise<NotificationView[]> =>
    (await who.get('/me/notifications').expect(200)).body;
  const unread = async (who = pm): Promise<number> =>
    (await who.get('/me/notifications/unread-count').expect(200)).body.count;
  const body = (extra: Record<string, unknown> = {}) => ({
    rfqLinkUrl: 'https://example.test/rfq/e2e-notify',
    businessName: 'E2E Notify Pvt Ltd',
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
    pmId = (await pm.get('/me').expect(200)).body.id;
    await head.get('/me').expect(200);
    // E2E FIXTURE - mock RM and one insurer branch (not PRD data)
    [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.notify.e2e@bimakavach.test', 'rm.notify.e2e@bimakavach.test', 'E2E RM Notify', '{rm}', 1) RETURNING id`,
    );
    [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-notify', 'E2E Notify Insurer', 'Active', 1) RETURNING id`,
    );
    [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Nia Rao', 'nia@notify-insurer.example.test', 1)`,
      [branchId],
    );
    await pm.post('/me/notifications/read-all').expect(201);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('tells a PM about a ticket the Head assigned to them (INT-T01), once even if the event is re-delivered', async () => {
    const before = await unread();
    const ticket = (await head.post('/tickets', body({ ownerId: pmId })).expect(201)).body;
    await deliver(ticket.id);
    await deliver(ticket.id); // worker retry
    const [n] = await inbox();
    expect(n).toMatchObject({
      title: `New Placement Ticket ${ticket.ticketNo} assigned`,
      ticketNo: ticket.ticketNo,
      link: `/tickets/${ticket.ticketNo}`,
      read: false,
    });
    expect(n.body).toContain('E2E Notify Pvt Ltd');
    expect(await unread()).toBe(before + 1);
  });

  it('does not notify a PM about a ticket they created themselves', async () => {
    const before = await unread();
    const own = (await pm.post('/tickets', body()).expect(201)).body;
    await deliver(own.id);
    expect(await unread()).toBe(before);
  });

  it('names the insurer on a received quote and opens the Quotes tab; read and read-all clear the count', async () => {
    const id = (await pm.post('/tickets', body()).expect(201)).body.id;
    await pm.put(`/tickets/${id}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm.post(`/tickets/${id}/rfq/validate`).expect(201);
    await pm.put(`/tickets/${id}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await pm.post(`/tickets/${id}/rfq/float`).expect(201);
    const [th] = (await pm.get(`/tickets/${id}/threads`).expect(200)).body;
    await pm.post(`/dev/tickets/${id}/threads/${th.id}/insurer`, { kind: 'quote' }).expect(201);
    await deliver(id);

    const quote = (await inbox()).find((n) => n.eventType === 'quote.received')!;
    expect(quote.title).toContain('E2E Notify Insurer');
    expect(quote.link).toMatch(/\/quotes$/);
    const before = await unread();
    await pm.post(`/me/notifications/${quote.id}/read`).expect(201);
    expect(await unread()).toBe(before - 1);
    await pm.post('/me/notifications/read-all').expect(201);
    expect(await unread()).toBe(0);
  });

  it('notifies both the old and the new owner on a reassignment', async () => {
    const ticket = (await pm.post('/tickets', body()).expect(201)).body;
    const { id: headId } = (await head.get('/me').expect(200)).body;
    await head
      .post(`/tickets/${ticket.id}/reassign`, { ownerId: headId, reason: 'Covering for leave' })
      .expect(201);
    await deliver(ticket.id);
    expect((await inbox()).find((n) => n.eventType === 'ticket.reassigned')?.body).toContain(
      'Covering for leave',
    );
    expect(
      (await inbox(head)).some((n) => n.eventType === 'ticket.reassigned' && n.ticketNo === ticket.ticketNo),
    ).toBe(true);
  });
});
