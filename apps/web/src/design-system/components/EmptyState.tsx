import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-subtle bg-card-alt px-6 py-10 text-center">
      {icon && <div className="text-ink-3">{icon}</div>}
      <div className="text-sm font-semibold text-ink">{title}</div>
      {body && <div className="max-w-md text-dense text-ink-2">{body}</div>}
      {action}
    </div>
  );
}
