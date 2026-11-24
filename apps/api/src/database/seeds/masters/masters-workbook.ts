import { BranchStatus, InsurerStatus, ProductGroup, ProductTypeCode, Role } from '@bimaplacement/contracts';

/**
 * Reads the business masters workbook (BimaPlacement_Masters.xlsx, PRD Appendix C + Appendix F mapping) into
 * plain rows: insurers (+ appetite), branches, POCs, Placement users, RMs and holidays. Pure - no I/O.
 * Everything that cannot be loaded is reported in `issues`, never guessed (CLAUDE.md rule 10).
 */

export type Cell = string | number | boolean | Date | null | undefined;
export type Sheets = Record<string, Cell[][]>;

export interface ImportInsurer {
  name: string;
  brokingCode: string | null;
  status: InsurerStatus;
  /** null = the insurer is not on the appetite grid, so its appetite is left as it is */
  appetite: ProductTypeCode[] | null;
}
export interface ImportBranch {
  insurer: string;
  /** '' = the insurer as a whole */
  name: string;
  status: BranchStatus;
}
export interface ImportPoc {
  insurer: string;
  branch: string;
  group: ProductGroup;
  name: string;
  designation: string | null;
  phone: string | null;
  email: string;
  ccEmails: string[];
}
export interface ImportUser {
  name: string;
  email: string;
  roles: Role[];
}
export interface MastersImport {
  insurers: ImportInsurer[];
  branches: ImportBranch[];
  pocs: ImportPoc[];
  users: ImportUser[];
  rms: { name: string; email: string }[];
  holidays: { date: string; name: string }[];
  issues: string[];
}

export const SHEETS = {
  insurer: '06 Insurer',
  branch: '07 Branch',
  poc: '08 Insurer POC',
  appetite: '09 Insurer Appetite',
  holiday: '16 Calendar and Holiday',
  user: '20 User and Role',
  rm: '21 RM',
} as const;

const ROLE_BY_LABEL: Record<string, Role> = {
  'placement head': Role.PLACEMENT_HEAD,
  'placement manager': Role.PLACEMENT_MANAGER,
  admin: Role.ADMIN,
};
const GROUPS = Object.values(ProductGroup) as string[];
const INSURER_STATUSES = Object.values(InsurerStatus) as string[];
const BRANCH_STATUSES = Object.values(BranchStatus) as string[];
const PRODUCT_CODES = Object.values(ProductTypeCode) as string[];

const text = (c: Cell): string => {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
};
const orNull = (c: Cell) => text(c) || null;
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const key = (...parts: string[]) => parts.map((p) => p.toLowerCase()).join('|');

/**
 * Data rows under the header row whose first cell is `firstHeader`. Rows with fewer than `minCells` filled cells are
 * notes / legends ("A blank branch means ...", "Format example: ...").
 */
function table(
  sheets: Sheets,
  sheet: string,
  firstHeader: string,
  minCells = 2,
): { row: Cell[]; line: number }[] {
  const rows = sheets[sheet];
  if (!rows) throw new Error(`Sheet "${sheet}" is missing from the masters workbook`);
  const header = rows.findIndex((r) => text(r[0]) === firstHeader);
  if (header < 0) throw new Error(`Sheet "${sheet}" has no header row starting with "${firstHeader}"`);
  return rows
    .map((row, i) => ({ row, line: i + 1 }))
    .slice(header + 1)
    .filter(({ row }) => row.filter((c) => text(c) !== '').length >= minCells);
}

export function parseMastersWorkbook(sheets: Sheets): MastersImport {
  const issues: string[] = [];

  // ---------- 06 Insurer ----------
  const insurers: ImportInsurer[] = [];
  const insurerByName = new Map<string, ImportInsurer>();
  for (const { row, line } of table(sheets, SHEETS.insurer, 'Insurer')) {
    const name = text(row[0]);
    const status = text(row[3]) || InsurerStatus.ACTIVE;
    if (!INSURER_STATUSES.includes(status)) {
      issues.push(`${SHEETS.insurer} row ${line} ${name}: unknown status "${status}", not loaded`);
      continue;
    }
    if (insurerByName.has(key(name))) {
      issues.push(`${SHEETS.insurer} row ${line} ${name}: listed twice, second row ignored`);
      continue;
    }
    const ins: ImportInsurer = {
      name,
      brokingCode: orNull(row[2]),
      status: status as InsurerStatus,
      appetite: null,
    };
    insurers.push(ins);
    insurerByName.set(key(name), ins);
  }
  const knownInsurer = (name: string) => insurerByName.get(key(name));

  // ---------- 09 Insurer Appetite ----------
  const appetiteRows = sheets[SHEETS.appetite];
  if (!appetiteRows) throw new Error(`Sheet "${SHEETS.appetite}" is missing from the masters workbook`);
  const appetiteHeader = appetiteRows.find((r) => text(r[0]) === 'Insurer') ?? [];
  const codes = appetiteHeader.slice(1).map(text);
  for (const c of codes)
    if (c && !PRODUCT_CODES.includes(c)) issues.push(`${SHEETS.appetite}: unknown product column "${c}"`);
  const answered = new Set<string>();
  for (const { row, line } of table(sheets, SHEETS.appetite, 'Insurer')) {
    const ins = knownInsurer(text(row[0]));
    if (!ins) {
      issues.push(`${SHEETS.appetite} row ${line}: insurer "${text(row[0])}" is not on ${SHEETS.insurer}`);
      continue;
    }
    ins.appetite = [];
    codes.forEach((code, i) => {
      const v = text(row[i + 1]).toUpperCase();
      if (v) answered.add(code);
      if (v === 'Y' && PRODUCT_CODES.includes(code)) ins.appetite!.push(code as ProductTypeCode);
    });
  }
  const unanswered = codes.filter((c) => c && PRODUCT_CODES.includes(c) && !answered.has(c));
  if (unanswered.length)
    issues.push(
      `${SHEETS.appetite}: ${unanswered.join(', ')} has no Y / N for any insurer, so no insurer shows it`,
    );
  const notOnGrid = insurers.filter((i) => i.appetite === null).map((i) => i.name);
  if (notOnGrid.length)
    issues.push(`${SHEETS.appetite}: not on the grid, appetite left unchanged: ${notOnGrid.join(', ')}`);

  // ---------- 07 Branch ----------
  const branches: ImportBranch[] = [];
  const branchKeys = new Set<string>();
  for (const { row, line } of table(sheets, SHEETS.branch, 'Insurer')) {
    const ins = knownInsurer(text(row[0]));
    if (!ins) {
      issues.push(
        `${SHEETS.branch} row ${line}: insurer "${text(row[0])}" is not on ${SHEETS.insurer}, not loaded`,
      );
      continue;
    }
    const name = text(row[1]);
    const status = text(row[3]) || BranchStatus.ACTIVE;
    if (!BRANCH_STATUSES.includes(status)) {
      issues.push(`${SHEETS.branch} row ${line} ${ins.name} ${name}: unknown status "${status}", not loaded`);
      continue;
    }
    if (branchKeys.has(key(ins.name, name))) continue;
    branchKeys.add(key(ins.name, name));
    branches.push({ insurer: ins.name, name, status: status as BranchStatus });
  }

  // ---------- 08 Insurer POC ----------
  const pocs: ImportPoc[] = [];
  const pocKeys = new Set<string>();
  const ccs: { insurer: string; branch: string; group: string; email: string; where: string }[] = [];
  for (const { row, line } of table(sheets, SHEETS.poc, 'Product group')) {
    const where = text(row[8]) || `${SHEETS.poc} row ${line}`;
    const group = text(row[0]);
    const ins = knownInsurer(text(row[1]));
    const branch = text(row[2]);
    const name = text(row[3]);
    const email = text(row[6]);
    const label = `${where} ${text(row[1])}${name ? ` ${name}` : ''}`;
    if (!ins) {
      issues.push(`${label}: insurer "${text(row[1])}" is not on ${SHEETS.insurer}, not loaded`);
      continue;
    }
    if (!GROUPS.includes(group)) {
      issues.push(`${label}: unknown product group "${group}", not loaded`);
      continue;
    }
    if (!email) {
      issues.push(`${label}: no email, not loaded (cannot receive mail)`);
      continue;
    }
    if (!isEmail(email)) {
      issues.push(`${label}: "${email}" is not an email address, not loaded`);
      continue;
    }
    if (text(row[7]).toUpperCase() === 'CC') {
      ccs.push({ insurer: ins.name, branch, group, email, where });
      continue;
    }
    const k = key(ins.name, branch, group, email);
    if (pocKeys.has(k)) {
      issues.push(`${label}: ${email.toLowerCase()} listed twice for ${group}, second row ignored`);
      continue;
    }
    pocKeys.add(k);
    if (!branchKeys.has(key(ins.name, branch))) {
      branchKeys.add(key(ins.name, branch));
      branches.push({ insurer: ins.name, name: branch, status: BranchStatus.ACTIVE });
      issues.push(
        `${label}: branch "${branch || '(whole insurer)'}" is not on ${SHEETS.branch}, added as Active`,
      );
    }
    pocs.push({
      insurer: ins.name,
      branch,
      group: group as ProductGroup,
      name,
      designation: orNull(row[4]),
      phone: orNull(row[5]),
      email,
      ccEmails: [],
    });
  }
  for (const cc of ccs) {
    const targets = pocs.filter(
      (p) => key(p.insurer, p.branch, p.group) === key(cc.insurer, cc.branch, cc.group),
    );
    if (!targets.length) {
      issues.push(
        `${cc.where} ${cc.insurer}: CC ${cc.email} has no POC for ${cc.group} at "${cc.branch || '(whole insurer)'}", not loaded`,
      );
      continue;
    }
    for (const p of targets)
      if (![p.email, ...p.ccEmails].some((e) => e.toLowerCase() === cc.email.toLowerCase()))
        p.ccEmails.push(cc.email);
  }
  const unnamed = pocs.filter((p) => !p.name).length;
  if (unnamed) issues.push(`${SHEETS.poc}: ${unnamed} POCs have no name (loaded with the email only)`);

  // ---------- 20 User and Role ----------
  const users: ImportUser[] = [];
  for (const { row, line } of table(sheets, SHEETS.user, 'Name')) {
    const name = text(row[0]);
    const email = text(row[1]).toLowerCase();
    const role = ROLE_BY_LABEL[text(row[2]).toLowerCase()];
    if (!isEmail(email) || !role) {
      issues.push(
        `${SHEETS.user} row ${line} ${name}: needs an email and a role (Placement Manager / Placement Head / Admin), not loaded`,
      );
      continue;
    }
    const existing = users.find((u) => u.email === email);
    if (existing) existing.roles = [...new Set([...existing.roles, role])];
    else users.push({ name, email, roles: [role] });
  }
  if (!users.some((u) => u.roles.includes(Role.ADMIN))) issues.push(`${SHEETS.user}: no Admin user`);

  // ---------- 21 RM ----------
  const rms: { name: string; email: string }[] = [];
  const noEmail: string[] = [];
  for (const { row } of table(sheets, SHEETS.rm, 'Name', 1)) {
    const name = text(row[0]);
    const email = text(row[1]).toLowerCase();
    if (!name) continue;
    if (!isEmail(email)) noEmail.push(name);
    else rms.push({ name, email });
  }
  if (noEmail.length)
    issues.push(
      `${SHEETS.rm}: ${noEmail.length} RM${noEmail.length === 1 ? '' : 's'} with no email, not loaded: ${noEmail.join(', ')}`,
    );

  // ---------- 16 Calendar and Holiday ----------
  const holidays: { date: string; name: string }[] = [];
  for (const { row, line } of table(sheets, SHEETS.holiday, 'Date (YYYY-MM-DD)')) {
    const date = text(row[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      issues.push(`${SHEETS.holiday} row ${line}: "${date}" is not a YYYY-MM-DD date, not loaded`);
      continue;
    }
    holidays.push({ date, name: text(row[1]) });
  }
  if (!holidays.length) issues.push(`${SHEETS.holiday}: holiday list is empty (SLAs count every weekday)`);

  return { insurers, branches, pocs, users, rms, holidays, issues };
}
