import clsx from 'clsx';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  dot?: boolean;
  disabled?: boolean;
}

/** Shared TabBar -> Tabs: active tint + 2px brand underline, red dot where next action points. */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="flex h-10 items-end gap-1 border-b border-line-soft">
      {items.map((t) => (
        <button
          key={t.key}
          disabled={t.disabled}
          onClick={() => onChange(t.key)}
          className={clsx(
            'relative h-10 rounded-t-lg px-3 text-sm font-medium transition',
            value === t.key
              ? 'bg-[rgba(65,0,207,0.08)] text-brand after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand'
              : 'text-ink-2 hover:text-brand',
            t.disabled && 'cursor-not-allowed opacity-40',
          )}
        >
          {t.label}
          {t.dot && <span className="absolute right-1 top-2 h-1.5 w-1.5 rounded-full bg-alert" />}
        </button>
      ))}
    </div>
  );
}

/** PlSubTabs / filter pills (16/500 r-full, active brand fill). */
export function FilterPills<K extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ key: K; label: string; count?: number }>;
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full border-[0.5px] px-3 py-2 text-base font-medium',
            value === p.key
              ? 'border-brand bg-brand text-white'
              : 'border-line bg-white text-ink-2 hover:border-brand hover:text-brand',
          )}
        >
          {value === p.key && <span className="h-2 w-2 rounded-full bg-white" />}
          {p.label}
          {p.count !== undefined && <span className="num">({p.count})</span>}
        </button>
      ))}
    </div>
  );
}
