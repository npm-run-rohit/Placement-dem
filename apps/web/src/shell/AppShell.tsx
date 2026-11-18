import clsx from 'clsx';
import {
  Building2,
  HeartHandshake,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  SquareDashedMousePointer,
  TextSearch,
} from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMe, useReviewCounts } from '@/api/hooks';
import { TicketPager } from './TicketPager';
import { NotificationBell } from './NotificationBell';
import { lazyNamed, preloadAll } from '@/lib/lazy';

const CreateTicketModal = lazyNamed(
  () => import('@/features/create-ticket/CreateTicketModal'),
  'CreateTicketModal',
);
const SearchModal = lazyNamed(() => import('./SearchModal'), 'SearchModal');

const NAV = [
  { to: '/', label: 'Home', icon: HeartHandshake, end: true },
  { to: '/tickets', label: 'My Tickets', icon: ListChecks },
  { to: '/manual-review', label: 'Manual Review', icon: SquareDashedMousePointer },
  { to: '/insurer-master', label: 'Insurer Master', icon: Building2 },
  { to: '/reports', label: 'Reports', icon: TextSearch },
];
/** Admin masters (PLAN 4.2): Placement Head and Admin only. */
const ADMIN_NAV = { to: '/admin', label: 'Admin', icon: Settings2, end: false };

/**
 * BimaPlacement shell (UI-SPEC 2): page tint #EEF4FF, collapsible sidebar (237/92), white main card r24,
 * breadcrumb strip with "Create Ticket" (or the ticket pager when a ticket is open).
 * In prod the BimaSahayak shell provides the product switcher (Endorse / Claims / Ops / Placement) and
 * the user card; this sidebar keeps the in-product nav only. TODO(W11): role-aware nav.
 */
export function AppShell() {
  const [collapsed, setCollapsed] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);
  const { pathname } = useLocation();
  const { data: reviews } = useReviewCounts();
  const { canAdmin } = useMe();
  const nav = canAdmin ? [...NAV, ADMIN_NAV] : NAV;
  const reviewsPending = (reviews?.myReviews ?? 0) + (reviews?.unmatched ?? 0) > 0;
  useEffect(preloadAll, []); // warm the other screens' chunks after first paint
  const [, ticketNo, ticketTab] = pathname.match(/^\/tickets\/(PLC-\d+)(?:\/([a-z0-9]+))?/) ?? [];

  return (
    <div className="flex h-screen gap-3 overflow-hidden p-3">
      <aside
        className={clsx(
          'flex shrink-0 flex-col gap-4 transition-[width] duration-200',
          collapsed ? 'w-sidebar-c' : 'w-sidebar',
        )}
      >
        <div className="flex items-center justify-between px-2 pt-2">
          {!collapsed && (
            <span className="text-xl font-medium">
              Bima<span className="text-placement">Placement</span>
            </span>
          )}
          <button
            className="rounded-lg p-1.5 text-ink-2 hover:bg-white"
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>
        <button
          onClick={() => setSearching(true)}
          className="mx-2 flex items-center gap-2 rounded-[10px] border-[0.5px] border-line bg-white px-3 py-2 text-xs font-medium text-ink-2"
        >
          <Search size={14} /> {!collapsed && 'Search Anything'}
        </button>
        <NotificationBell collapsed={collapsed} />
        <nav className="flex flex-col gap-1 px-2">
          {!collapsed && <div className="px-2 text-xs font-medium text-ink-2">Menu</div>}
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-semibold',
                  isActive ? 'bg-placement-nav text-placement' : 'text-ink-2 hover:bg-white hover:text-ink',
                )
              }
            >
              <span className="relative">
                <n.icon size={collapsed ? 20 : 22} />
                {n.to === '/manual-review' && reviewsPending && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-alert"
                    aria-label="Mail waiting for review"
                  />
                )}
              </span>
              {!collapsed && n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-shell border border-line-soft bg-white shadow-shell">
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          <div className="px-6 pt-4">
            <div className="flex h-12 items-center justify-between rounded-xl bg-canvas px-3 text-xs font-semibold tracking-[0.12px]">
              <div className="flex items-center gap-2">
                {ticketNo ? (
                  <>
                    <Link to="/tickets" className="text-ink-3 hover:text-ink">
                      My Tickets
                    </Link>
                    <span className="text-ink-3">/</span>
                    <span>{ticketNo}</span>
                  </>
                ) : (
                  <span>
                    {nav.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.label ??
                      'Home'}
                  </span>
                )}
              </div>
              {!ticketNo && (
                <button
                  onClick={() => setCreating(true)}
                  className="rounded-[10px] border-[0.5px] border-brand bg-brand px-3.5 py-2.5 text-xs font-semibold leading-none text-white hover:brightness-90"
                >
                  Create Ticket
                </button>
              )}
              {ticketNo && <TicketPager ticketNo={ticketNo} tab={ticketTab} />}
            </div>
          </div>
          <Outlet />
        </div>
      </main>
      <Suspense fallback={null}>
        {creating && <CreateTicketModal onClose={() => setCreating(false)} />}
        {searching && <SearchModal onClose={() => setSearching(false)} />}
      </Suspense>
    </div>
  );
}
