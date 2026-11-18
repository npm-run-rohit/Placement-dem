import { Suspense, type ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/shell/AppShell';
import { HomePage } from '@/features/home/HomePage';
import { lazyNamed } from '@/lib/lazy';

// Home is the landing screen and ships in the first chunk; every other screen is its own chunk, preloaded when idle.
const QueuePage = lazyNamed(() => import('@/features/queue/QueuePage'), 'QueuePage');
const TicketWorkspace = lazyNamed(() => import('@/features/workspace/TicketWorkspace'), 'TicketWorkspace');
const ManualReviewPage = lazyNamed(
  () => import('@/features/manual-review/ManualReviewPage'),
  'ManualReviewPage',
);
const InsurerMasterPage = lazyNamed(
  () => import('@/features/insurer-master/InsurerMasterPage'),
  'InsurerMasterPage',
);
const ReportsPage = lazyNamed(() => import('@/features/reports/ReportsPage'), 'ReportsPage');
const AdminPage = lazyNamed(() => import('@/features/admin/AdminPage'), 'AdminPage');

const page = (el: ReactElement) => (
  <Suspense fallback={<div className="p-6 text-dense text-ink-2">Loading…</div>}>{el}</Suspense>
);

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="tickets" element={page(<QueuePage />)} />
        <Route path="tickets/:ticketNo/:tab?" element={page(<TicketWorkspace />)} />
        <Route path="manual-review" element={page(<ManualReviewPage />)} />
        <Route path="insurer-master" element={page(<InsurerMasterPage />)} />
        <Route path="reports" element={page(<ReportsPage />)} />
        <Route path="admin" element={page(<AdminPage />)} />
      </Route>
    </Routes>
  );
}
