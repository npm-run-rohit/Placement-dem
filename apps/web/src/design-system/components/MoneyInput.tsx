import { useEffect, useState } from 'react';

const group = (digits: string) => (digits ? new Intl.NumberFormat('en-IN').format(Number(digits)) : '');

/**
 * PlInput kind="money" -> MoneyInput (UI-SPEC 5, LLD s9): ₹ prefix, en-IN grouping while typing, right-aligned
 * tabular digits; commits on blur / Enter only (no per-keystroke audit). Blank commits null.
 */
export function MoneyInput({
  value,
  onCommit,
  disabled,
  label,
  placeholder = '0',
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  useEffect(() => setDraft(value == null ? '' : String(value)), [value]);
  const commit = () => {
    const next = draft ? Number(draft) : null;
    if (next !== (value ?? null)) onCommit(next);
  };
  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 focus-within:border-brand focus-within:shadow-focus">
      <span className="text-dense text-ink-2">₹</span>
      <input
        aria-label={label}
        inputMode="numeric"
        disabled={disabled}
        placeholder={placeholder}
        className="num w-full bg-transparent text-right text-dense font-semibold outline-none disabled:text-ink-3"
        value={group(draft)}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}
