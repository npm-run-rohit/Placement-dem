import type { EntityManager } from 'typeorm';
import { Role } from '@bimaplacement/contracts';
import { Insurer } from '../../../modules/insurers/entities/insurer.entity';
import { InsurerBranch } from '../../../modules/insurers/entities/insurer-branch.entity';
import { InsurerPoc } from '../../../modules/insurers/entities/insurer-poc.entity';
import { MasterChangeLog } from '../../../modules/insurers/entities/master-change-log.entity';
import { Holiday } from '../../../modules/masters/entities/holiday.entity';
import { User } from '../../../modules/users/user.entity';
import { IMPORT_ACTOR_ID, PENDING_SAHAYAK_PREFIX } from '../../../modules/users/users.constants';
import type { MastersImport } from './masters-workbook';

export interface Tally {
  created: number;
  updated: number;
  unchanged: number;
}
export interface ApplyReport {
  insurers: Tally;
  branches: Tally;
  pocs: Tally;
  users: Tally;
  rms: Tally;
  holidays: Tally;
  /** POCs already in the database that the workbook does not list (left as they are) */
  pocsNotInWorkbook: number;
}

const PLACEMENT_ROLES = [Role.PLACEMENT_HEAD, Role.PLACEMENT_MANAGER, Role.ADMIN];
const lc = (s: string) => s.toLowerCase();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const tally = (): Tally => ({ created: 0, updated: 0, unchanged: 0 });
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Upserts the parsed masters workbook (PLAN 2.2, PRD Appendix C / F). Idempotent: a second run with the same
 * workbook changes nothing. Insurers match by name, branches by insurer + name, POCs by branch + product group +
 * email, users by email. Every insurer / branch / POC change is written to master_change_log (FR-148) as
 * "Masters import". Nothing is deleted or retired: rows missing from the workbook are only counted.
 * Run inside one transaction (seed-masters.ts) so a failure loads nothing.
 */
export async function applyMasters(m: EntityManager, data: MastersImport): Promise<ApplyReport> {
  const report: ApplyReport = {
    insurers: tally(),
    branches: tally(),
    pocs: tally(),
    users: tally(),
    rms: tally(),
    holidays: tally(),
    pocsNotInWorkbook: 0,
  };
  const log = (
    entityType: string,
    entityId: string,
    entityLabel: string,
    field: string,
    before: unknown,
    after: unknown,
  ) =>
    m.getRepository(MasterChangeLog).insert({
      entityType,
      entityId,
      entityLabel,
      field,
      before: (before ?? null) as never,
      after: (after ?? null) as never,
      changedBy: IMPORT_ACTOR_ID,
    });

  /** Sets each changed field, logs it, and saves; returns whether anything changed. */
  async function update<T extends { id: string }>(
    repo: { save: (e: T) => Promise<T> },
    row: T,
    next: Partial<T>,
    entityType: string,
    label: string,
  ) {
    let changed = false;
    for (const [field, value] of Object.entries(next) as [keyof T & string, unknown][]) {
      if (same(row[field], value)) continue;
      await log(entityType, row.id, label, field, row[field], value);
      (row as Record<string, unknown>)[field] = value;
      changed = true;
    }
    if (changed) await repo.save(row);
    return changed;
  }

  // ---------- insurers ----------
  const insurerRepo = m.getRepository(Insurer);
  const existing = await insurerRepo.find();
  const takenCodes = new Set(existing.map((i) => i.code));
  const insurerIds = new Map<string, string>();
  for (const ins of data.insurers) {
    let row = existing.find((e) => lc(e.name) === lc(ins.name));
    const next = {
      brokingCode: ins.brokingCode,
      status: ins.status,
      ...(ins.appetite ? { appetite: ins.appetite } : {}),
    };
    if (!row) {
      let code = slug(ins.name);
      for (let n = 2; takenCodes.has(code); n++) code = `${slug(ins.name)}-${n}`;
      takenCodes.add(code);
      row = await insurerRepo.save(insurerRepo.create({ code, name: ins.name, appetite: [], ...next }));
      await log('insurer', row.id, row.name, 'created', null, { code, ...next });
      report.insurers.created++;
    } else if (await update(insurerRepo, row, next, 'insurer', row.name)) report.insurers.updated++;
    else report.insurers.unchanged++;
    insurerIds.set(lc(ins.name), row.id);
  }

  // ---------- branches ----------
  const branchRepo = m.getRepository(InsurerBranch);
  const branchIds = new Map<string, string>();
  for (const b of data.branches) {
    const insurerId = insurerIds.get(lc(b.insurer))!;
    const label = `${b.insurer}${b.name ? ` - ${b.name}` : ''}`;
    let row = await branchRepo.findOneBy({ insurerId, name: b.name });
    if (!row) {
      row = await branchRepo.save(
        branchRepo.create({ insurerId, name: b.name, city: b.name || null, status: b.status }),
      );
      await log('branch', row.id, label, 'created', null, { name: b.name, status: b.status });
      report.branches.created++;
    } else if (await update(branchRepo, row, { status: b.status }, 'branch', label))
      report.branches.updated++;
    else report.branches.unchanged++;
    branchIds.set(lc(`${b.insurer}|${b.name}`), row.id);
  }

  // ---------- POCs ----------
  const pocRepo = m.getRepository(InsurerPoc);
  const touched = new Set<string>();
  const branchesInWorkbook = [...new Set(branchIds.values())];
  const pocsInDb = branchesInWorkbook.length
    ? await pocRepo
        .createQueryBuilder('p')
        .where('p.branch_id IN (:...ids)', { ids: branchesInWorkbook })
        .getMany()
    : [];
  for (const p of data.pocs) {
    const branchId = branchIds.get(lc(`${p.insurer}|${p.branch}`))!;
    const label = `${p.insurer}${p.branch ? ` - ${p.branch}` : ''} ${p.group}: ${p.name || p.email}`;
    const next = {
      name: p.name,
      designation: p.designation,
      phone: p.phone,
      email: p.email,
      ccEmails: p.ccEmails,
      active: true,
    };
    let row = pocsInDb.find(
      (r) => r.branchId === branchId && r.productGroup === p.group && lc(r.email) === lc(p.email),
    );
    if (!row) {
      row = await pocRepo.save(pocRepo.create({ branchId, productGroup: p.group, ...next }));
      await log('poc', row.id, label, 'created', null, { productGroup: p.group, ...next });
      report.pocs.created++;
    } else if (await update(pocRepo, row, next, 'poc', label)) report.pocs.updated++;
    else report.pocs.unchanged++;
    touched.add(row.id);
  }
  report.pocsNotInWorkbook = pocsInDb.filter((r) => r.active && !touched.has(r.id)).length;

  // ---------- users + RMs (local projection until Sahayak; claimed by email on first login) ----------
  const userRepo = m.getRepository(User);
  async function upsertUser(name: string, email: string, roles: Role[], replace: Role[], t: Tally) {
    const row = await userRepo
      .createQueryBuilder('u')
      .where('lower(u.email) = :e', { e: lc(email) })
      .getOne();
    if (!row) {
      await userRepo.save(
        userRepo.create({
          sahayakUserId: `${PENDING_SAHAYAK_PREFIX}${lc(email)}`,
          email,
          name,
          roles,
          mailboxAddress: email,
        }),
      );
      t.created++;
      return;
    }
    const nextRoles = [...new Set([...row.roles.filter((r) => !replace.includes(r)), ...roles])];
    if (row.name === name && same([...row.roles].sort(), [...nextRoles].sort()) && row.active) {
      t.unchanged++;
      return;
    }
    Object.assign(row, { name, roles: nextRoles, active: true });
    await userRepo.save(row);
    t.updated++;
  }
  for (const u of data.users) await upsertUser(u.name, u.email, u.roles, PLACEMENT_ROLES, report.users);
  for (const r of data.rms) await upsertUser(r.name, r.email, [Role.RM], [Role.RM], report.rms);

  // ---------- holidays ----------
  const holidayRepo = m.getRepository(Holiday);
  for (const h of data.holidays) {
    const label = `Holiday ${h.date}`;
    const row = await holidayRepo.findOneBy({ date: h.date });
    if (!row) {
      await holidayRepo.save(holidayRepo.create({ date: h.date, name: h.name, active: true }));
      await log('holiday', h.date, label, 'created', null, { name: h.name, active: true });
      report.holidays.created++;
    } else if (row.name !== h.name || !row.active) {
      await log(
        'holiday',
        h.date,
        label,
        'name',
        { name: row.name, active: row.active },
        { name: h.name, active: true },
      );
      await holidayRepo.update({ date: h.date }, { name: h.name, active: true });
      report.holidays.updated++;
    } else report.holidays.unchanged++;
  }

  return report;
}
