import 'reflect-metadata';
import { resolve } from 'node:path';
import { Workbook, type CellValue } from 'exceljs';
import dataSource from '../data-source';
import { applyMasters, type Tally } from './masters/apply-masters';
import { parseMastersWorkbook, SHEETS, type Cell, type Sheets } from './masters/masters-workbook';

/**
 * Loads the business masters workbook (BimaPlacement_Masters.xlsx) into the database: insurers, branches, POCs,
 * appetite, Placement users, RMs and holidays (PLAN 2.2, PRD Appendix C / F). Real data - allowed in production.
 * Idempotent; one transaction; prints what it changed and every row it could not load.
 *
 *   npm run seed:masters -- <path/to/BimaPlacement_Masters.xlsx> [--dry-run]
 *   node dist/database/seeds/seed-masters.js <path> [--dry-run]       (in the API image)
 *
 * Run after `migration:run` and `seed`. --dry-run does everything and then rolls back.
 */

/** exceljs cell -> plain value (hyperlinks / rich text / formulas become their text). */
function plain(v: CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== 'object') return v as Cell;
  if ('richText' in v) return v.richText.map((t) => t.text).join('');
  if ('text' in v) return typeof v.text === 'string' ? v.text : plain(v.text as CellValue);
  if ('result' in v) return plain(v.result as CellValue);
  if ('error' in v) return null;
  return String(v);
}

async function readSheets(path: string): Promise<Sheets> {
  const wb = new Workbook();
  await wb.xlsx.readFile(path);
  const sheets: Sheets = {};
  for (const name of Object.values(SHEETS)) {
    const ws = wb.getWorksheet(name);
    if (!ws) continue;
    const rows: Cell[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells: Cell[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(plain(row.getCell(c).value));
      rows.push(cells);
    }
    sheets[name] = rows;
  }
  return sheets;
}

const fmt = (label: string, t: Tally) =>
  `  ${label.padEnd(10)} ${String(t.created).padStart(4)} created  ${String(t.updated).padStart(4)} updated  ${String(t.unchanged).padStart(4)} unchanged`;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const arg = args.find((a) => !a.startsWith('--'));
  if (!arg) throw new Error('Usage: seed:masters -- <path/to/BimaPlacement_Masters.xlsx> [--dry-run]');
  // npm workspaces run the script from apps/api; resolve a relative path from where npm was started
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), arg);

  const data = parseMastersWorkbook(await readSheets(path));
  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();
  await qr.startTransaction();
  try {
    const report = await applyMasters(qr.manager, data);
    if (dryRun) await qr.rollbackTransaction();
    else await qr.commitTransaction();

    console.log(`Masters import${dryRun ? ' (dry run, rolled back)' : ''}: ${path}`);
    console.log(fmt('insurers', report.insurers));
    console.log(fmt('branches', report.branches));
    console.log(fmt('POCs', report.pocs));
    console.log(fmt('users', report.users));
    console.log(fmt('RMs', report.rms));
    console.log(fmt('holidays', report.holidays));
    if (report.pocsNotInWorkbook)
      console.log(
        `  ${report.pocsNotInWorkbook} active POCs on these branches are not in the workbook (left as they are)`,
      );
    console.log(`\nNot loaded / to check (${data.issues.length}):`);
    for (const i of data.issues) console.log(`  - ${i}`);
  } catch (e) {
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    throw e;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
