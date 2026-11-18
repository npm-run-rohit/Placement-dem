import clsx from 'clsx';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationView } from '@bimaplacement/contracts';
import { api } from '@/lib/api-client';
import { fmtWhen } from '@/lib/format';

/** Sidebar bell (PLAN 4.1): unread count, latest notifications, click opens the ticket tab and marks it read. */
export function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api<{ count: number }>('/me/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const { data: items = [], isLoading } = useQuery({
    enabled: open,
    queryKey: ['notifications', 'list'],
    queryFn: () => api<NotificationView[]>('/me/notifications'),
  });
  const done = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const read = useMutation({
    mutationFn: (id: string) => api(`/me/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: done,
  });
  const readAll = useMutation({
    mutationFn: () => api('/me/notifications/read-all', { method: 'POST' }),
    onSuccess: done,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = unread?.count ?? 0;
  const go = (n: NotificationView) => {
    if (!n.read) read.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} className="relative px-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
        className={clsx(
          'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-semibold',
          open ? 'bg-white text-ink' : 'text-ink-2 hover:bg-white hover:text-ink',
        )}
      >
        <span className="relative">
          <Bell size={collapsed ? 20 : 22} />
          {count > 0 && (
            <span className="num absolute -right-1.5 -top-1.5 min-w-[16px] rounded-full bg-alert px-1 text-center text-[10px] font-semibold leading-4 text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </span>
        {!collapsed && 'Notifications'}
      </button>
      {open && (
        <div
          className="absolute left-full top-0 z-40 ml-3 w-[380px] overflow-hidden rounded-xl border-[0.5px] border-line-subtle bg-white shadow-popover"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <span className="text-[13px] font-semibold">Notifications</span>
            {count > 0 && (
              <button
                onClick={() => readAll.mutate()}
                className="text-meta font-semibold text-brand hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {isLoading && <div className="px-4 py-4 text-dense text-ink-2">Loading…</div>}
            {!isLoading && !items.length && (
              <div className="px-4 py-6 text-center text-dense text-ink-2">Nothing new.</div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => go(n)}
                className={clsx(
                  'flex w-full gap-2.5 border-b border-line-soft px-4 py-3 text-left hover:bg-placement-bg',
                  !n.read && 'bg-brand-50/50',
                )}
              >
                <span
                  className={clsx(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    n.read ? 'bg-transparent' : 'bg-brand',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={clsx(
                      'block text-dense',
                      n.read ? 'font-medium text-ink-2' : 'font-semibold text-ink',
                    )}
                  >
                    {n.title}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-meta text-ink-2">{n.body}</span>
                  <span className="num mt-1 block text-[11px] text-ink-3">{fmtWhen(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
