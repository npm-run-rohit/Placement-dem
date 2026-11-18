import type { MasterChangeView } from '@bimaplacement/contracts';
import { fmtWhen } from '@/lib/format';

/** Master change log (FR-148): "at · by · entity · field: before → after". Shared by Insurer Master and Admin. */
export function ChangeLogList({ changes, limit = 30 }: { changes: MasterChangeView[]; limit?: number }) {
  if (!changes.length) return <div className="text-dense text-ink-2">No changes recorded yet.</div>;
  return (
    <ol className="space-y-1.5">
      {changes.slice(0, limit).map((c) => (
        <li key={c.id} className="text-meta text-ink-2">
          <span className="num font-mono">{fmtWhen(c.changedAt)}</span> · {c.changedBy} ·{' '}
          <span className="font-semibold text-ink">{c.entityLabel}</span> · {c.field}: {fmtVal(c.before)} →{' '}
          {fmtVal(c.after)}
        </li>
      ))}
    </ol>
  );
}

const fmtVal = (v: unknown): string =>
  v == null || v === ''
    ? '-'
    : Array.isArray(v)
      ? v.map((x) => (x && typeof x === 'object' ? fmtVal(x) : String(x))).join(', ') || '-'
      : typeof v === 'object'
        ? Object.values(v as object).join(' · ')
        : String(v);
