import { INDUSTRY_TYPES_SEED } from '@bimaplacement/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, createTestApp } from './helpers/app';

/** Idempotency-Key on mutating calls (PLAN 0.2, PRD 10.2): a retried request runs once. */
describe('Idempotency-Key', () => {
  let t: TestApp;
  let ds: DataSource;
  let rmUserId: string;

  const body = (name: string) => ({
    rfqLinkUrl: 'https://example.test/rfq/e2e-idem',
    businessName: name,
    industryType: INDUSTRY_TYPES_SEED[0],
    productType: 'GMC',
    businessType: 'New',
    rmUserId,
  });
  const post = (key: string | null, payload: object, user = TEST_USERS.pm) => {
    const r = request(t.app.getHttpServer())
      .post(`/${t.prefix}/tickets`)
      .set('x-dev-user', user)
      .send(payload);
    return key ? r.set('Idempotency-Key', key) : r;
  };
  const count = async (name: string) =>
    (await ds.query(`SELECT count(*)::int AS n FROM placement_tickets WHERE business_name = $1`, [name]))[0]
      .n;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    // E2E FIXTURE - mock RM (not PRD data)
    [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.idem.e2e@bimakavach.test', 'rm.idem.e2e@bimakavach.test', 'E2E RM Idem', '{rm}', 1) RETURNING id`,
    );
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('creates the ticket once and replays the same response for a retry', async () => {
    const first = await post('create-once-1', body('E2E Idem Once Pvt Ltd')).expect(201);
    const retry = await post('create-once-1', body('E2E Idem Once Pvt Ltd')).expect(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.ticketNo).toBe(first.body.ticketNo);
    expect(await count('E2E Idem Once Pvt Ltd')).toBe(1);
  });

  it('refuses the same key for a different request', async () => {
    await post('create-once-2', body('E2E Idem Two Pvt Ltd')).expect(201);
    await post('create-once-2', body('E2E Idem Other Pvt Ltd')).expect(422);
    expect(await count('E2E Idem Other Pvt Ltd')).toBe(0);
  });

  it('scopes keys per user, releases the key when the request fails, and ignores requests without a key', async () => {
    await post('shared-key', body('E2E Idem Pm Pvt Ltd')).expect(201);
    await post('shared-key', body('E2E Idem Pm Pvt Ltd'), TEST_USERS.head).expect(201); // the Head's key space is separate
    expect(await count('E2E Idem Pm Pvt Ltd')).toBe(2);

    await post('fails-first', { ...body('E2E Idem Fail Pvt Ltd'), rfqLinkUrl: undefined }).expect(422); // no RFQ source
    await post('fails-first', { ...body('E2E Idem Fail Pvt Ltd'), rfqLinkUrl: undefined }).expect(422); // re-executed, not a replay

    await post(null, body('E2E Idem Nokey Pvt Ltd')).expect(201);
    await post(null, body('E2E Idem Nokey Pvt Ltd')).expect(201);
    expect(await count('E2E Idem Nokey Pvt Ltd')).toBe(2);
  });
});
