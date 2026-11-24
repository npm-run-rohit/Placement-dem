import { InsurerStatus, ProductGroup, ProductTypeCode, Role } from '@bimaplacement/contracts';
import { parseMastersWorkbook, type Sheets } from './masters-workbook';

/** Sheets shaped like BimaPlacement_Masters.xlsx: a title row, sometimes a note row, the header, data, a legend. */
function workbook(over: Partial<Sheets> = {}): Sheets {
  return {
    '06 Insurer': [
      ['06 Insurer'],
      ['Status applies to all branches of the insurer.'],
      ['Insurer', 'Name(s) in source', 'Broking code', 'Status (Active / Inactive / Do Not Float)'],
      ['Alpha General', 'ALPHA', 10092548, 'Active'],
      ['Beta Life', 'BETA LIFE', null, null],
      ['Gamma General', 'GAMMA', ' GC-1 ', 'Do Not Float'],
      ['Broking code is blank where the repository gives none. Status defaults to Active.'],
    ],
    '07 Branch': [
      ['07 Branch'],
      ['Every Active insurer + branch ...'],
      ['Insurer', 'Branch', 'Product groups with POCs', 'Status (Active / Inactive)'],
      ['Alpha General', 'Indore', 'EB, P&C', 'Active'],
      ['Beta Life', null, 'EB', 'Active'],
      ['Gamma General', 'Pune', 'P&C', 'Inactive'],
      ['A blank branch means the insurer is selected as a whole.'],
    ],
    '08 Insurer POC': [
      ['08 Insurer POC'],
      ['Every person listed is a POC ...'],
      [
        'Product group',
        'Insurer',
        'Branch',
        'POC name',
        'Designation',
        'Mobile',
        'Email',
        'Role (POC / CC)',
        'Source',
      ],
      [
        'EB',
        'Alpha General',
        'Indore',
        'Asha Rao',
        'RM',
        9876543210,
        ' Asha.Rao@alpha.example ',
        'POC',
        'EB!3',
      ],
      ['EB', 'Alpha General', 'Indore', null, null, null, 'vik@alpha.example', 'POC', 'EB!4'],
      ['EB', 'Alpha General', 'Indore', null, null, null, 'boss@alpha.example', 'CC', 'EB!5'],
      ['P&C', 'Alpha General', 'Indore', null, null, null, 'only-cc@alpha.example', 'CC', 'Property!4'],
      ['EB', 'Beta Life', null, 'Bala', null, '99700 25152', 'bala@beta.example', 'POC', 'EB!62'],
      ['Liability', 'Alpha General', 'Indore', 'No Mail', 'UW', '9167453689', null, 'POC', 'Liability!8'],
      ['EB', 'Alpha General', 'Indore', 'Asha again', null, null, 'asha.rao@alpha.example', 'POC', 'EB!9'],
      ['Yellow = no email, so this POC cannot receive mail yet.'],
    ],
    '09 Insurer Appetite': [
      ['09 Insurer Appetite'],
      ['Y / N per insurer and product type.'],
      ['Insurer', 'GMC', 'GTL', 'CGL'],
      ['Alpha General', 'Y', null, 'N'],
      ['Gamma General', 'N', null, 'Y'],
    ],
    '16 Calendar and Holiday': [
      ['16 Calendar and Holiday'],
      ['Business hours: Monday-Friday, 10:00-19:00 IST (540 business minutes a day).'],
      ['Date (YYYY-MM-DD)', 'Holiday'],
      ['Format example: 2026-01-26 | Republic Day'],
    ],
    '20 User and Role': [
      ['20 User and Role'],
      ['Roles and permissions are in PRD Section 6.'],
      ['Name', 'Email', 'Role (Placement Manager / Placement Head / Admin)', 'Mailbox connected (Y/N)'],
      ['Himani Doshi', 'himani@bimakavach.example', 'Placement Head', 'Yes'],
      ['Mirza Zain', 'MirzaZain@bimakavach.example ', 'Placement Manager', 'Yes'],
      ['Format example: Firstname Lastname | name@bimakavach.com | Placement Manager | Y'],
    ],
    '21 RM': [
      ['21 RM'],
      ['Relationship Managers selectable at intake and matched on RFQ mails.'],
      ['Name', 'Email'],
      ['Chaitali ', null],
      ['Shubh Bangar', 'shubh@bimakavach.example'],
    ],
    ...over,
  };
}

describe('parseMastersWorkbook', () => {
  it('reads insurers with broking code and status, defaulting a blank status to Active', () => {
    const { insurers } = parseMastersWorkbook(workbook());
    expect(insurers.map((i) => [i.name, i.brokingCode, i.status])).toEqual([
      ['Alpha General', '10092548', InsurerStatus.ACTIVE],
      ['Beta Life', null, InsurerStatus.ACTIVE],
      ['Gamma General', 'GC-1', InsurerStatus.DO_NOT_FLOAT],
    ]);
  });

  it('takes appetite from the Y cells and leaves insurers missing from the grid untouched', () => {
    const { insurers, issues } = parseMastersWorkbook(workbook());
    expect(insurers.find((i) => i.name === 'Alpha General')?.appetite).toEqual([ProductTypeCode.GMC]);
    expect(insurers.find((i) => i.name === 'Gamma General')?.appetite).toEqual([ProductTypeCode.CGL]);
    expect(insurers.find((i) => i.name === 'Beta Life')?.appetite).toBeNull();
    expect(issues).toContainEqual(expect.stringContaining('Beta Life'));
    expect(issues).toContainEqual(expect.stringMatching(/GTL.*no Y \/ N/));
  });

  it('keeps a blank branch as the insurer as a whole', () => {
    const { branches } = parseMastersWorkbook(workbook());
    expect(branches).toEqual([
      { insurer: 'Alpha General', name: 'Indore', status: 'Active' },
      { insurer: 'Beta Life', name: '', status: 'Active' },
      { insurer: 'Gamma General', name: 'Pune', status: 'Inactive' },
    ]);
  });

  it('reads POCs, folds CC rows into the POCs of the same insurer + branch + group, and skips rows with no email', () => {
    const { pocs, issues } = parseMastersWorkbook(workbook());
    expect(pocs).toEqual([
      {
        insurer: 'Alpha General',
        branch: 'Indore',
        group: ProductGroup.EB,
        name: 'Asha Rao',
        designation: 'RM',
        phone: '9876543210',
        email: 'Asha.Rao@alpha.example',
        ccEmails: ['boss@alpha.example'],
      },
      {
        insurer: 'Alpha General',
        branch: 'Indore',
        group: ProductGroup.EB,
        name: '',
        designation: null,
        phone: null,
        email: 'vik@alpha.example',
        ccEmails: ['boss@alpha.example'],
      },
      {
        insurer: 'Beta Life',
        branch: '',
        group: ProductGroup.EB,
        name: 'Bala',
        designation: null,
        phone: '99700 25152',
        email: 'bala@beta.example',
        ccEmails: [],
      },
    ]);
    expect(issues).toContainEqual(expect.stringMatching(/Liability!8.*No Mail.*no email/));
    expect(issues).toContainEqual(expect.stringMatching(/Property!4.*only-cc@alpha\.example.*no POC/));
    expect(issues).toContainEqual(expect.stringMatching(/EB!9.*asha\.rao@alpha\.example.*listed twice/));
  });

  it('reports a POC or branch whose insurer is not on the Insurer sheet', () => {
    const sheets = workbook();
    sheets['07 Branch'].push(['Delta General', 'Goa', 'EB', 'Active']);
    sheets['08 Insurer POC'].push([
      'EB',
      'Delta General',
      'Goa',
      'D',
      null,
      null,
      'd@delta.example',
      'POC',
      'EB!99',
    ]);
    const { branches, pocs, issues } = parseMastersWorkbook(sheets);
    expect(branches.some((b) => b.insurer === 'Delta General')).toBe(false);
    expect(pocs.some((p) => p.insurer === 'Delta General')).toBe(false);
    expect(issues.filter((i) => i.includes('Delta General'))).toHaveLength(2);
  });

  it('reads Placement users with their roles, trimming and lower-casing emails', () => {
    const { users } = parseMastersWorkbook(workbook());
    expect(users).toEqual([
      { name: 'Himani Doshi', email: 'himani@bimakavach.example', roles: [Role.PLACEMENT_HEAD] },
      { name: 'Mirza Zain', email: 'mirzazain@bimakavach.example', roles: [Role.PLACEMENT_MANAGER] },
    ]);
  });

  it('loads only RMs that have an email and lists the others', () => {
    const { rms, issues } = parseMastersWorkbook(workbook());
    expect(rms).toEqual([{ name: 'Shubh Bangar', email: 'shubh@bimakavach.example' }]);
    expect(issues).toContainEqual(expect.stringMatching(/1 RM.*no email.*Chaitali/));
  });

  it('reads holidays and reports an empty list', () => {
    expect(parseMastersWorkbook(workbook()).issues).toContainEqual(
      expect.stringMatching(/[Hh]oliday list is empty/),
    );
    const { holidays, issues } = parseMastersWorkbook(
      workbook({
        '16 Calendar and Holiday': [
          ['Date (YYYY-MM-DD)', 'Holiday'],
          [new Date(Date.UTC(2026, 0, 26)), 'Republic Day'],
          ['2026-08-15', 'Independence Day'],
          ['15/08/2026', 'Bad date'],
        ],
      }),
    );
    expect(holidays).toEqual([
      { date: '2026-01-26', name: 'Republic Day' },
      { date: '2026-08-15', name: 'Independence Day' },
    ]);
    expect(issues).toContainEqual(expect.stringContaining('15/08/2026'));
  });

  it('fails clearly when a sheet is missing', () => {
    const sheets = workbook();
    delete (sheets as Partial<Sheets>)['08 Insurer POC'];
    expect(() => parseMastersWorkbook(sheets)).toThrow(/08 Insurer POC/);
  });
});
