import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Insurer Contact Master maintenance (PLAN 2.2, FR-160..162, FR-210, UI-SPEC 3.5). */
describe('Insurer Master', () => {
  let t: TestApp;
  let head: ReturnType<typeof as>;
  let pm: ReturnType<typeof as>;
  let insurerId: string;
  let branchId: string;

  beforeAll(async () => {
    t = await createTestApp();
    head = as(t, TEST_USERS.head);
    pm = as(t, TEST_USERS.pm);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  const row = async (code: string) =>
    (await pm.get('/insurers/master').expect(200)).body.filter((r: { code: string }) => r.code === code);

  it('lets only the Placement Head create an insurer (FR-160)', async () => {
    await pm.post('/insurers', { name: 'E2E Master General' }).expect(403);
    const ins = (
      await head
        .post('/insurers', {
          name: 'E2E Master General',
          appetite: ['GMC', 'CGL'],
          sectors: 'Manufacturing',
          brokingCode: 'BRC0000631',
        })
        .expect(201)
    ).body;
    insurerId = ins.id;
    expect(ins.code).toBe('e2e-master-general');
    await head.post('/insurers', { name: 'E2E Master General' }).expect(422); // code taken

    const [r] = await row('e2e-master-general');
    expect(r).toMatchObject({
      name: 'E2E Master General',
      brokingCode: 'BRC0000631',
      status: 'Active',
      appetite: ['GMC', 'CGL'],
      branch: { name: '', status: 'Active' },
      pocs: { EB: [], Liability: [], 'P&C': [] },
    });
    branchId = r.branch.id;
  });

  it('shows and edits the broking code, logging the change (Appendix C #06)', async () => {
    await head.patch(`/insurers/${insurerId}`, { brokingCode: 'BRC0000632' }).expect(200);
    const [r] = await row('e2e-master-general');
    expect(r.brokingCode).toBe('BRC0000632');
    const log = (await head.get('/insurers/change-log').expect(200)).body as Array<{
      field: string;
      before: unknown;
      after: unknown;
    }>;
    expect(log.find((l) => l.field === 'brokingCode')).toMatchObject({
      before: 'BRC0000631',
      after: 'BRC0000632',
    });
  });

  it('saves branch fields and POCs per product group from the edit drawer, logging each change (FR-161, FR-162)', async () => {
    await head
      .patch(`/insurers/${insurerId}/branches/${branchId}`, {
        name: 'Mumbai',
        pocs: {
          EB: [
            { name: 'Asha Rao', email: 'asha@master.example.test' },
            { name: 'Vik Shah', email: 'vik@master.example.test' },
          ],
          Liability: [{ name: 'Lia Bose', email: 'lia@master.example.test' }],
        },
      })
      .expect(200);
    const [r] = await row('e2e-master-general');
    expect(r.branch.name).toBe('Mumbai');
    expect(r.pocs.EB.map((p: { email: string }) => p.email).sort()).toEqual([
      'asha@master.example.test',
      'vik@master.example.test',
    ]);
    expect(r.pocs.Liability).toHaveLength(1);

    const log = (await pm.get('/insurers/change-log').expect(200)).body;
    expect(
      log
        .slice(0, 4)
        .map((l: { field: string }) => l.field)
        .sort(),
    ).toEqual(['added', 'added', 'added', 'name']);
    expect(log.find((l: { field: string }) => l.field === 'name')).toMatchObject({
      entityType: 'branch',
      before: '',
      after: 'Mumbai',
      changedBy: 'E2E Placement Head',
    });
  });

  it('retires a POC dropped from its group instead of deleting it, and leaves other groups alone', async () => {
    await head
      .patch(`/insurers/${insurerId}/branches/${branchId}`, {
        pocs: { EB: [{ name: 'Asha R. Rao', email: 'ASHA@master.example.test' }] },
      })
      .expect(200);
    const [r] = await row('e2e-master-general');
    expect(r.pocs.EB).toEqual([
      expect.objectContaining({ name: 'Asha R. Rao', email: 'asha@master.example.test' }),
    ]);
    expect(r.pocs.Liability).toHaveLength(1);
    const log = (await pm.get('/insurers/change-log').expect(200)).body.slice(0, 2);
    expect(log.map((l: { field: string }) => l.field).sort()).toEqual(['name', 'retired']);
  });

  it('refuses duplicate or invalid POCs and duplicate branch names', async () => {
    await head
      .patch(`/insurers/${insurerId}/branches/${branchId}`, {
        pocs: {
          EB: [
            { name: 'A', email: 'a@x.test' },
            { name: 'B', email: 'A@x.test' },
          ],
        },
      })
      .expect(422);
    await head
      .patch(`/insurers/${insurerId}/branches/${branchId}`, {
        pocs: { EB: [{ name: '', email: 'not-an-email' }] },
      })
      .expect(422);
    await head
      .post(`/insurers/${insurerId}/branches`, {
        name: 'Pune',
        pocs: { 'P&C': [{ name: 'Pia', email: 'pia@master.example.test' }] },
      })
      .expect(201);
    await head.post(`/insurers/${insurerId}/branches`, { name: 'Pune' }).expect(422);
    expect(await row('e2e-master-general')).toHaveLength(2);
  });

  it('marks the insurer Do Not Float for every branch with before/after logged; PMs cannot edit (FR-212)', async () => {
    await pm.patch(`/insurers/${insurerId}`, { status: 'Do Not Float' }).expect(403);
    await head
      .patch(`/insurers/${insurerId}`, { status: 'Do Not Float', note: 'Claims dispute open' })
      .expect(200);
    const rows = await row('e2e-master-general');
    expect(rows.every((r: { status: string }) => r.status === 'Do Not Float')).toBe(true);
    const [first] = (await pm.get('/insurers/change-log').expect(200)).body.filter(
      (l: { field: string }) => l.field === 'status',
    );
    expect(first).toMatchObject({
      entityLabel: 'E2E Master General',
      before: 'Active',
      after: 'Do Not Float',
    });
    await head.patch(`/insurers/${insurerId}`, { status: 'Sometimes' }).expect(400);
  });
});
