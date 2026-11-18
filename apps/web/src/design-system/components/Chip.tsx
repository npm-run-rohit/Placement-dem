import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { Tone } from '@bimaplacement/contracts';
import { tone as tones } from '../tokens';

/** PlChip -> Chip. Dashed = held/paused clock. */
export function Chip({
  tone = 'neutral',
  size = 'sm',
  dot,
  dashed,
  leading,
  children,
}: {
  tone?: Tone;
  size?: 'xs' | 'sm';
  dot?: boolean;
  dashed?: boolean;
  leading?: ReactNode;
  children: ReactNode;
}) {
  const t = tones[tone];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium num',
        size === 'xs' ? 'text-2xs' : 'text-meta',
        dashed && 'border-dashed',
      )}
      style={{ color: t.fg, background: t.bg, borderColor: t.line }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.fg }} />}
      {leading}
      {children}
    </span>
  );
}
