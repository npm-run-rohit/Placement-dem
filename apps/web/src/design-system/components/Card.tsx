import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export function Card({
  alt,
  padded = true,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { alt?: boolean; padded?: boolean }) {
  return (
    <div
      {...rest}
      className={clsx(
        'rounded-xl border border-line-subtle',
        alt ? 'bg-card-alt' : 'bg-white',
        padded && 'p-4',
        className,
      )}
    />
  );
}

export function SectionCard({
  title,
  icon,
  badge,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line-subtle bg-white">
      <div className="flex items-center gap-2 border-b border-line-soft px-3.5 py-3 text-[13px] font-semibold">
        {icon}
        <span>{title}</span>
        <span className="ml-auto">{badge}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function KeyValue({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-ink-2">{k}</div>
      <div className="mt-0.5 truncate text-dense font-medium text-ink">{v}</div>
    </div>
  );
}

export function Callout({
  tone = 'blue',
  children,
}: {
  tone?: 'blue' | 'orange' | 'red' | 'green' | 'purple';
  children: ReactNode;
}) {
  const map = {
    blue: 'bg-t-blue-soft border-t-blue-line text-t-blue',
    orange: 'bg-t-orange-soft border-t-orange-line text-t-orange',
    red: 'bg-t-red-soft border-t-red-line text-t-red',
    green: 'bg-t-green-soft border-t-green-line text-t-green',
    purple: 'bg-brand-50 border-brand-200 text-brand-600',
  };
  return <div className={clsx('rounded-lg border px-3 py-2 text-dense', map[tone])}>{children}</div>;
}
