import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AdminMastersView, MasterChangeView } from '@bimaplacement/contracts';
import { Chip, EmptyState, Tabs } from '@/design-system/components';
import { useMe } from '@/api/hooks';
import { api } from '@/lib/api-client';
import { PageHead } from '@/shell/PageHead';
import { ChangeLogList } from './ChangeLogList';
import {
  CalendarSection,
  EscalationSection,
  ListsSection,
  MailboxesSection,
  MatrixSection,
  ProductTypesSection,
  SlaSection,
  TemplatesSection,
} from './sections';

type TabKey =
  'sla' | 'matrix' | 'calendar' | 'escalation' | 'lists' | 'templates' | 'products' | 'mailboxes' | 'log';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'sla', label: 'SLA Master' },
  { key: 'matrix', label: 'Quote Collection Matrix' },
  { key: 'calendar', label: 'Business Calendar' },
  { key: 'escalation', label: 'Escalation & Follow-ups' },
  { key: 'lists', label: 'Reason Lists' },
  { key: 'templates', label: 'Templates' },
  { key: 'products', label: 'Product Types' },
  { key: 'mailboxes', label: 'Mailboxes' },
  { key: 'log', label: 'Change Log' },
];

/**
 * Admin masters (PLAN 4.2, FR-139..148, FR-270): SLA targets, SLA-06 matrix, calendar, escalation timings,
 * reason lists, communication templates and product types. Placement Head and Admin only. Every save is logged
 * before/after and applies to clocks started after it (BR-091).
 */
export function AdminPage() {
  const { canAdmin, isLoading: meLoading } = useMe();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, error } = useQuery({
    enabled: canAdmin,
    queryKey: ['masters', 'admin'],
    queryFn: () => api<AdminMastersView>('/masters/admin'),
  });
  const tabs = data?.mailboxes ? TABS : TABS.filter((x) => x.key !== 'mailboxes'); // the dev driver has no real mailboxes
  const tab = tabs.find((t) => t.key === params.get('tab'))?.key ?? 'sla';
  const setTab = (k: TabKey) => setParams({ tab: k }, { replace: true });
  const { data: changes = [] } = useQuery({
    enabled: canAdmin && tab === 'log',
    queryKey: ['masters', 'change-log'],
    queryFn: () => api<MasterChangeView[]>('/masters/change-log'),
  });

  return (
    <div className="px-6 py-6">
      <PageHead
        title="Admin"
        hint="Timings, calendar, lists and templates. Changes apply to clocks started after the save."
        right={canAdmin ? <Chip tone="purple">Placement Head · can edit</Chip> : undefined}
      />
      {!meLoading && !canAdmin ? (
        <EmptyState
          title="Only the Placement Head and Admin maintain these masters"
          body="Ask the Placement Head if an SLA, holiday, reason or template needs to change."
        />
      ) : (
        <>
          <Tabs items={tabs} value={tab} onChange={setTab} />
          <div className="pt-5">
            {(isLoading || meLoading) && <div className="text-dense text-ink-2">Loading…</div>}
            {error && <div className="text-dense text-t-red">{(error as Error).message}</div>}
            {data && tab === 'sla' && <SlaSection view={data} />}
            {data && tab === 'matrix' && <MatrixSection view={data} />}
            {data && tab === 'calendar' && <CalendarSection view={data} />}
            {data && tab === 'escalation' && <EscalationSection view={data} />}
            {data && tab === 'lists' && <ListsSection view={data} />}
            {data && tab === 'templates' && <TemplatesSection view={data} />}
            {data && tab === 'products' && <ProductTypesSection view={data} />}
            {data?.mailboxes && tab === 'mailboxes' && <MailboxesSection view={data} />}
            {tab === 'log' && (
              <section className="rounded-xl border-[0.5px] border-line p-4">
                <ChangeLogList changes={changes} limit={100} />
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
