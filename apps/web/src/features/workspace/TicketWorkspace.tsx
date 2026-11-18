import { Suspense, type ComponentType } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Stage, type TicketDetail, type WorkspaceTab } from '@bimaplacement/contracts';
import { Tabs, type TabItem } from '@/design-system/components';
import { useTicketByNo } from '@/api/hooks';
import { WorkspaceHeader } from './WorkspaceHeader';
import { StageTimelineCard } from './rail/StageTimelineCard';
import { NextActionCard } from './rail/NextActionCard';
import { MandateCard } from './rail/MandateCard';
import { OutcomeCard } from './rail/OutcomeCard';
import { lazyNamed } from '@/lib/lazy';
import { JourneySim } from '@/dev/JourneySim';
import type { ContactSub } from './tabs/ContactTab';

// One chunk per tab: only the open tab's code is needed to paint; the rest preload when idle.
const OverviewTab = lazyNamed(() => import('./tabs/OverviewTab'), 'OverviewTab');
const RfqTab = lazyNamed(() => import('./tabs/RfqTab'), 'RfqTab');
const Client360Tab = lazyNamed(() => import('./tabs/Client360Tab'), 'Client360Tab');
const DocumentsTab = lazyNamed(() => import('./tabs/DocumentsTab'), 'DocumentsTab');
const ContactTab = lazyNamed(() => import('./tabs/ContactTab'), 'ContactTab');
const QuotesTab = lazyNamed(() => import('./tabs/QuotesTab'), 'QuotesTab');
const QcrTab = lazyNamed(() => import('./tabs/QcrTab'), 'QcrTab');
const MailTab = lazyNamed(() => import('./tabs/MailTab'), 'MailTab');
const AuditTab = lazyNamed(() => import('./tabs/AuditTab'), 'AuditTab');

/** Tab bar keys: Insurance Contact is one tab; its sub-tab (insurers | threads) lives in the URL. */
type BarTab = Exclude<WorkspaceTab, 'threads'>;
const BAR: Array<{ key: BarTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'rfq', label: 'RFQ' },
  { key: 'client360', label: 'Client 360' },
  { key: 'documents', label: 'Documents' },
  { key: 'insurers', label: 'Insurance Contact' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'qcr', label: 'QCR' },
  { key: 'mail', label: 'Mail Trail' },
  { key: 'audit', label: 'Audit Trail' },
];
const barKey = (tab: WorkspaceTab): BarTab => (tab === 'threads' ? 'insurers' : tab);

export type TabProps = { ticket: TicketDetail };
const VIEWS: Record<Exclude<BarTab, 'insurers'>, ComponentType<TabProps>> = {
  overview: OverviewTab,
  rfq: RfqTab,
  client360: Client360Tab,
  documents: DocumentsTab,
  quotes: QuotesTab,
  qcr: QcrTab,
  mail: MailTab,
  audit: AuditTab,
};

/**
 * Case workspace (UI-SPEC 3.3, PLAN 1.6). Header + tab bar (red dot on the tab the next action points to;
 * default tab = the next action's, else RFQ) + tab content with the rail on the RIGHT (decision): Ticket Stage
 * Timeline, Next action, Exclusive Mandate, Outcome (closed).
 */
export function TicketWorkspace() {
  const { ticketNo = '', tab } = useParams();
  const nav = useNavigate();
  const { data: t, isLoading, error } = useTicketByNo(ticketNo);
  if (isLoading) return <div className="p-6 text-ink-2">Loading…</div>;
  if (error || !t) return <div className="p-6 text-t-red">Ticket not found</div>;

  const go = (k: WorkspaceTab) => nav(`/tickets/${t.ticketNo}/${k}`);
  const contactDefault: ContactSub = t.panelLocked ? 'threads' : 'insurers';
  const active: WorkspaceTab = (tab as WorkspaceTab) ?? t.nextAction?.tab ?? 'rfq';
  const items: TabItem<BarTab>[] = BAR.map((b) => ({
    ...b,
    dot: !!t.nextAction && barKey(t.nextAction.tab) === b.key,
  }));
  const View = active === 'insurers' || active === 'threads' ? null : (VIEWS[active] ?? OverviewTab);

  return (
    <div>
      <WorkspaceHeader ticket={t} />
      <div className="px-6 empty:hidden">
        <JourneySim key={t.id} ticketId={t.id} closed={t.stage === Stage.CLOSED} />
      </div>
      <div className="px-6">
        <Tabs
          items={items}
          value={barKey(active)}
          onChange={(k) => go(k === 'insurers' ? contactDefault : k)}
        />
      </div>
      <div className="flex gap-4 px-6 pb-8 pt-4">
        <div className="min-w-0 flex-1">
          <Suspense fallback={<div className="py-6 text-dense text-ink-2">Loading…</div>}>
            {View ? <View ticket={t} /> : <ContactTab ticket={t} sub={active as ContactSub} onSub={go} />}
          </Suspense>
        </div>
        <aside className="sticky top-3 w-rail shrink-0 space-y-3 self-start">
          <StageTimelineCard ticket={t} />
          {t.nextAction && <NextActionCard action={t.nextAction} onGo={() => go(t.nextAction!.tab)} />}
          <MandateCard ticket={t} />
          <OutcomeCard ticket={t} />
        </aside>
      </div>
    </div>
  );
}
