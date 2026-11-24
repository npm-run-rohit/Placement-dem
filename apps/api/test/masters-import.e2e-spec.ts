import { DataSource } from 'typeorm';
import { BranchStatus, InsurerStatus, ProductGroup, ProductTypeCode, Role } from '@bimaplacement/contracts';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';
import { applyMasters } from '../src/database/seeds/masters/apply-masters';
import type { MastersImport } from '../src/database/seeds/masters/masters-workbook';

/** Masters workbook import (PLAN 2.2, PRD Appendix C / F): upsert, idempotency, change log, pre-loaded user login. */
describe('Masters import', () => {
  let t: TestApp;
  let ds: DataSource;
  let head: ReturnType<typeof as>;

  const workbook = (): MastersImport => ({
    insurers: [
      {
        name: 'Import Alpha General',
        brokingCode: '10092548',
        status: InsurerStatus.ACTIVE,
        appetite: [ProductTypeCode.GMC],
      },
      { name: 'Import Beta Life', brokingCode: null, status: InsurerStatus.ACTIVE, appetite: null },
    ],
    branches: [
      { insurer: 'Import Alpha General', name: 'Indore', status: BranchStatus.ACTIVE },
      { insurer: 'Import Beta Life', name: '', status: BranchStatus.ACTIVE },
    ],
    pocs: [
      {
        insurer: 'Import Alpha General',
        branch: 'Indore',
        group: ProductGroup.EB,
        name: 'Asha Rao',
        designation: 'RM',
        phone: '9876543210',
        email: 'asha@import-alpha.example.test',
        ccEmails: ['boss@import-alpha.example.test'],
      },
      {
        insurer: 'Import Beta Life',
        branch: '',
        group: ProductGroup.EB,
        name: '',
        designation: null,
        phone: null,
        email: 'desk@import-beta.example.test',
        ccEmails: [],
      },
    ],
    users: [{ name: 'Import Manager', email: 'import.pm@bimakavach.test', roles: [Role.PLACEMENT_MANAGER] }],
    rms: [{ name: 'Import RM', email: 'import.rm@bimakavach.test' }],
    holidays: [{ date: '2031-01-26', name: 'Republic Day' }],
    issues: [],
  });
  const run = (data: MastersImport) => ds.transaction((m) => applyMasters(m, data));

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    head = as(t, TEST_USERS.head);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('creates insurers, branches, POCs, users, RMs and holidays, logged as "Masters import"', async () => {
    const report = await run(workbook());
    expect(report).toMatchObject({
      insurers: { created: 2 },
      branches: { created: 2 },
      pocs: { created: 2 },
      users: { created: 1 },
      rms: { created: 1 },
      holidays: { created: 1 },
    });

    const master = (await head.get('/insurers/master').expect(200)).body as Array<{
      code: string;
      appetite: string[];
      branch: { name: string };
      pocs: Record<string, Array<{ name: string; email: string; ccEmails?: string[] }>>;
    }>;
    const alpha = master.find((r) => r.code === 'import-alpha-general');
    expect(alpha).toMatchObject({ appetite: ['GMC'], branch: { name: 'Indore' } });
    const [code] = await ds.query(`SELECT broking_code FROM insurers WHERE code = 'import-alpha-general'`);
    expect(code.broking_code).toBe('10092548'); // not on the Insurer Master view yet
    expect(alpha?.pocs.EB.map((p) => p.email)).toEqual(['asha@import-alpha.example.test']);
    expect(master.find((r) => r.code === 'import-beta-life')?.branch.name).toBe('');

    const [poc] = await ds.query(
      `SELECT cc_emails FROM insurer_pocs WHERE email = 'asha@import-alpha.example.test'`,
    );
    expect(poc.cc_emails).toEqual(['boss@import-alpha.example.test']);

    const log = (await head.get('/insurers/change-log').expect(200)).body as Array<{
      entityLabel: string;
      changedBy: string;
    }>;
    expect(log.find((l) => l.entityLabel === 'Import Alpha General')?.changedBy).toBe('Masters import');

    const dir = (await head.get('/directory').expect(200)).body;
    expect(dir.rms.map((r: { email: string }) => r.email)).toContain('import.rm@bimakavach.test');
  });

  it('changes nothing when the same workbook is loaded again', async () => {
    const before = Number((await ds.query(`SELECT count(*) FROM master_change_log`))[0].count);
    const report = await run(workbook());
    for (const k of ['insurers', 'branches', 'pocs', 'users', 'rms', 'holidays'] as const)
      expect(report[k]).toEqual({ created: 0, updated: 0, unchanged: expect.any(Number) });
    expect(Number((await ds.query(`SELECT count(*) FROM master_change_log`))[0].count)).toBe(before);
  });

  it('updates changed fields with a before / after entry, keeps appetite when the insurer is not on the grid, and never deletes', async () => {
    await ds.query(`UPDATE insurers SET appetite = '{CGL}' WHERE code = 'import-beta-life'`);
    const data = workbook();
    data.insurers[0].status = InsurerStatus.DO_NOT_FLOAT;
    data.pocs = [data.pocs[1]]; // Asha dropped from the workbook
    const report = await run(data);
    expect(report.insurers).toMatchObject({ updated: 1 });
    expect(report.pocsNotInWorkbook).toBe(1);

    const [alpha] = await ds.query(`SELECT status FROM insurers WHERE code = 'import-alpha-general'`);
    expect(alpha.status).toBe('Do Not Float');
    const [beta] = await ds.query(`SELECT appetite FROM insurers WHERE code = 'import-beta-life'`);
    expect(beta.appetite).toEqual(['CGL']);
    const [asha] = await ds.query(
      `SELECT active FROM insurer_pocs WHERE email = 'asha@import-alpha.example.test'`,
    );
    expect(asha.active).toBe(true);
    const [entry] = await ds.query(
      `SELECT before, after FROM master_change_log WHERE entity_label = 'Import Alpha General' AND field = 'status'`,
    );
    expect(entry).toEqual({ before: 'Active', after: 'Do Not Float' });
  });

  it('lets a pre-loaded user log in and keep the same user row', async () => {
    const [{ id }] = await ds.query(`SELECT id FROM users WHERE email = 'import.pm@bimakavach.test'`);
    await as(t, 'import.pm@bimakavach.test|Import Manager|placement_manager').get('/tickets').expect(200);
    const rows = await ds.query(
      `SELECT id, sahayak_user_id FROM users WHERE email = 'import.pm@bimakavach.test'`,
    );
    expect(rows).toEqual([{ id, sahayak_user_id: 'dev:import.pm@bimakavach.test' }]);
  });
});
