import type { ReactNode } from 'react';

export function TabHeader({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-xl font-semibold tracking-[-0.2px] text-ink">{title}</h2>
      {meta && <div className="text-sm font-medium text-ink-2">{meta}</div>}
    </div>
  );
}

/** Placeholder used by tabs not built yet - points to the spec section to implement. */
export function SpecStub({ section, items }: { section: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card-alt p-4 text-dense text-ink-2">
      <div className="font-semibold text-ink">To build - docs/design/UI-SPEC.md {section}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
