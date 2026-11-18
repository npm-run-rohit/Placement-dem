import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Dev engine time behind the web's engine-time chip (FEATURE_DEV_SIMULATORS; never in production). */
describe('Dev engine time: read, advance in business minutes, reset', () => {
  let t: TestApp;
  let head: ReturnType<typeof as>;

  beforeAll(async () => {
    t = await createTestApp();
    head = as(t, TEST_USERS.head);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('starts at real time', async () => {
    const { body } = await head.get('/dev/clock').expect(200);
    expect(body.offsetMins).toBe(0);
    expect(Math.abs(Date.parse(body.now) - Date.now())).toBeLessThan(60_000);
  });

  it('advances by business minutes on the business calendar (+1 BD is at least a calendar day minus the overnight gap)', async () => {
    const { body } = await head.post('/dev/clock/advance', { businessMinutes: 540 }).expect(201);
    expect(body.offsetMins).toBeGreaterThanOrEqual(540);
    expect((await head.get('/dev/clock').expect(200)).body.offsetMins).toBe(body.offsetMins);
  });

  it('still accepts wall-clock minutes', async () => {
    const before = (await head.get('/dev/clock').expect(200)).body.offsetMins;
    const { body } = await head.post('/dev/clock/advance', { minutes: 30 }).expect(201);
    expect(body.offsetMins - before).toBe(30);
  });

  it('resets to real time', async () => {
    expect((await head.post('/dev/clock/reset').expect(201)).body.offsetMins).toBe(0);
  });
});
