import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/** Closes on click outside `ref` or Esc while `open`. */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open, onClose]);
  return ref;
}

/**
 * HeaderFilter (UI-SPEC 3.2): column label + 20x20 chevron square; multi-select menu with an "All" reset;
 * brand count badge when active. The parent owns `open` so only one menu is open at a time.
 */
export function ColumnFilter({
  label,
  options,
  selected,
  onChange,
  open,
  onOpenChange,
  align = 'left',
  render = (o) => o,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: 'left' | 'right';
  render?: (option: string) => ReactNode;
}) {
  const ref = useDismiss(open, () => onOpenChange(false));
  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <div ref={ref} className="relative inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={`Filter ${label}`}
        aria-expanded={open}
        className={clsx(
          'inline-flex h-5 w-5 items-center justify-center rounded-md border-[0.5px] border-line bg-white text-ink-2',
          open && 'border-brand text-brand',
        )}
      >
        <ChevronDown size={12} />
      </button>
      <span>{label}</span>
      {selected.length > 0 && (
        <span className="num rounded-full bg-brand-50 px-1.5 text-2xs font-semibold text-brand">
          {selected.length}
        </span>
      )}
      {open && (
        <div
          className={clsx(
            'absolute top-7 z-30 max-h-72 min-w-[220px] overflow-auto rounded-xl border border-line-menu bg-white py-1 text-sm font-medium shadow-menu',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-canvas"
          >
            All {selected.length === 0 && <Check size={14} className="text-brand" />}
          </button>
          {options.map((o) => (
            <button
              type="button"
              key={o}
              onClick={() => toggle(o)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-canvas"
            >
              <span className="truncate">{render(o)}</span>
              {selected.includes(o) && <Check size={14} className="shrink-0 text-brand" />}
            </button>
          ))}
          {options.length === 0 && <div className="px-3 py-2 text-ink-3">No options</div>}
        </div>
      )}
    </div>
  );
}

/** Sort control (UI-SPEC 3.2 toolbar): brand underline, "Sort by: <label>", menu card. */
export function SortMenu<K extends string>({
  value,
  options,
  onChange,
  open,
  onOpenChange,
  icon,
}: {
  value: K;
  options: Array<{ key: K; label: string }>;
  onChange: (k: K) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon?: ReactNode;
}) {
  const ref = useDismiss(open, () => onOpenChange(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-[187px] items-center justify-between border-b border-brand px-1 py-1.5 text-sm font-medium text-brand"
      >
        <span>Sort by: {options.find((o) => o.key === value)?.label}</span>
        <span className="flex items-center gap-2">
          <ChevronDown size={14} />
          {icon}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 min-w-[187px] rounded-xl border border-line-menu bg-white py-1 text-sm font-medium shadow-menu">
          {options.map((o) => (
            <button
              type="button"
              key={o.key}
              onClick={() => {
                onChange(o.key);
                onOpenChange(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-canvas"
            >
              {o.label} {o.key === value && <Check size={14} className="text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
