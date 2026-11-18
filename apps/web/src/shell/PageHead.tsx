import type { ReactNode } from 'react';

/** PageHead: 32/600 brand title, hint, right slot, ikkat rule underneath. */
export function PageHead({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.8px] text-brand">{title}</h1>
          {hint && <div className="mt-1 text-[13px] font-medium text-ink-2">{hint}</div>}
        </div>
        {right}
      </div>
      <div className="bk-rule mt-4" aria-hidden />
    </div>
  );
}
