import clsx from 'clsx';
import type { ReactNode } from 'react';

/** Labelled figures; a value is a count or pre-formatted text ("33%", "2.5 BD", "-"). */
export function Metrics({ items }: { items: Array<[string, number | string, string?]> }) {
  return (
    <div className="mb-3 flex flex-wrap gap-5">
      {items.map(([label, n, tone]) => (
        <div key={label}>
          <div className="text-meta font-medium text-ink-2">{label}</div>
          <div className={clsx('num font-mono text-xl font-semibold', tone)}>{n}</div>
        </div>
      ))}
    </div>
  );
}

/** PlBar: 148px label, 8px track, purple (or red) fill, count. A null count is a step tracked outside Placement. */
export function Bar({
  label,
  n,
  max,
  tone = 'purple',
  title,
  labelWidth = 148,
}: {
  label: ReactNode;
  n: number | null;
  max: number;
  tone?: 'purple' | 'red';
  title?: string;
  labelWidth?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1" title={title}>
      <div className="shrink-0 truncate text-meta text-ink-2" style={{ width: labelWidth }}>
        {label}
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-card-alt">
        {n !== null && (
          <div
            className={clsx('h-full rounded-full', tone === 'red' ? 'bg-t-red' : 'bg-brand')}
            style={{ width: `${(n / max) * 100}%` }}
          />
        )}
      </div>
      <div className="num w-10 text-right font-mono text-meta text-ink">{n ?? '-'}</div>
    </div>
  );
}
