/**
 * QCR quote rows (FR-286): values autofilled from Copycat's comparison (the QCR) or the quote record, then
 * checked and edited by the PM. Pure helpers: field validation and reading Copycat's comparison into rows.
 */

export const ROW_FIELDS = ['premium', 'sumInsured', 'validityDate', 'termsNote'] as const;
export type RowField = (typeof ROW_FIELDS)[number];
export type RowValues = {
  premium: number | null;
  sumInsured: string | null;
  validityDate: string | null;
  termsNote: string | null;
};
export type AutofillSource = 'copycat' | 'quote';
/** Per field: the value the system filled in and where it came from (shown as "From QCR" until the PM edits). */
export type RowAutofill = Partial<Record<RowField, { value: RowValues[RowField]; source: AutofillSource }>>;

type Check = { ok: true; value: RowValues[RowField] } | { ok: false; reason: string };

/** Validates and normalises a PM edit. Empty means "clear the cell". */
export function normaliseRowValue(field: RowField, raw: unknown): Check {
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim()))
    return { ok: true, value: null };
  switch (field) {
    case 'premium': {
      const n = typeof raw === 'number' ? raw : parseAmount(String(raw));
      if (n === null || !Number.isFinite(n) || n < 0 || n >= 1e12)
        return { ok: false, reason: 'Premium must be an amount in rupees' };
      return { ok: true, value: Math.round(n * 100) / 100 };
    }
    case 'validityDate': {
      const d = typeof raw === 'string' ? parseDate(raw) : null;
      return d ? { ok: true, value: d } : { ok: false, reason: 'Validity must be a date (YYYY-MM-DD)' };
    }
    default: {
      if (typeof raw !== 'string') return { ok: false, reason: `${field} must be text` };
      const text = raw.trim();
      return text.length > 500
        ? { ok: false, reason: 'Keep it under 500 characters' }
        : { ok: true, value: text };
    }
  }
}

/** "₹ 2,45,000", "INR 245000.50", "2.45 lakh" -> number; anything else null. */
export function parseAmount(s: string): number | null {
  const t = s
    .toLowerCase()
    .replace(/inr|rs\.?|₹|\/-|\s/g, '')
    .replace(/,/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)(lakh|lakhs|lac|cr|crore|crores)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? '';
  return unit.startsWith('la') ? n * 1e5 : unit.startsWith('cr') ? n * 1e7 : n;
}

/** ISO date or dd/mm/yyyy (dd-mm-yyyy, dd.mm.yyyy) -> YYYY-MM-DD if it is a real date. */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let y: number, mo: number, d: number;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)))
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface CopycatComparison {
  products: Array<{
    product: string;
    columns: Array<{ quoteId: string; insurer: string }>;
    rows: Array<{ term: string; values: Array<string | null> }>;
  }>;
}

const TERM: Array<[RowField, RegExp]> = [
  ['premium', /premium/i],
  ['sumInsured', /sum\s*insured|^si$|limit of (indemnity|liability)|sending limit/i],
  ['validityDate', /validity|valid (till|until|upto)/i],
];

/**
 * Reads Copycat's comparison (terms x insurer columns) into row values per quote: premium, sum insured and
 * validity from their terms, every other term into the terms note ("Term: value; ..."). Values that do not
 * parse (e.g. "30 days" validity) go to the terms note instead of being dropped.
 */
export function rowsFromComparison(c: CopycatComparison | null | undefined): Map<string, Partial<RowValues>> {
  const out = new Map<string, Partial<RowValues>>();
  for (const product of c?.products ?? []) {
    product.columns.forEach((col, i) => {
      const row = out.get(col.quoteId) ?? {};
      const notes: string[] = row.termsNote ? [row.termsNote] : [];
      for (const r of product.rows) {
        const raw = r.values[i];
        if (raw === null || raw === undefined || !String(raw).trim()) continue;
        const value = String(raw).trim();
        const field = TERM.find(([, re]) => re.test(r.term))?.[0];
        if (field === 'premium' && row.premium == null) {
          const n = parseAmount(value);
          if (n !== null) {
            row.premium = n;
            continue;
          }
        } else if (field === 'sumInsured' && row.sumInsured == null) {
          row.sumInsured = value;
          continue;
        } else if (field === 'validityDate' && row.validityDate == null) {
          const d = parseDate(value);
          if (d) {
            row.validityDate = d;
            continue;
          }
        }
        notes.push(`${r.term}: ${value}`);
      }
      if (notes.length) row.termsNote = notes.join('; ').slice(0, 500);
      out.set(col.quoteId, row);
    });
  }
  return out;
}
