import clsx from 'clsx';
import type { ReactNode } from 'react';
import { indicator, ink, type Ind } from '../tokens';

/** Shared `Indicator` -> StatusPill: fill (tables) | tint (status) | outline. */
export function StatusPill({
  ind = 'neutral',
  variant = 'tint',
  size = 'md',
  leading,
  children,
}: {
  ind?: Ind;
  variant?: 'fill' | 'tint' | 'outline';
  size?: 'md' | 'lg';
  leading?: ReactNode;
  children: ReactNode;
}) {
  const c = indicator[ind];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border-[0.5px] font-medium',
        size === 'lg' ? 'px-2 py-1 text-sm' : 'px-1.5 py-0.5 text-[13px]',
      )}
      style={{
        borderColor: c.line,
        background: variant === 'tint' ? c.tint : ink.white,
        color: variant === 'outline' ? c.text : ink.text,
      }}
    >
      {leading ?? <span className="h-1 w-1 rounded-full" style={{ background: c.dot }} />}
      {children}
    </span>
  );
}
