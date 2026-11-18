import type { AuditEventView } from '@bimaplacement/contracts';
import { ShieldPlus } from 'lucide-react';
import { useState } from 'react';
import { Avatar, FilterPills } from '@/design-system/components';
import { useTicketSub } from '@/api/hooks';
import { fmtWhen } from '@/lib/format';
import { TabHeader } from './TabHeader';
import type { TabProps } from '../TicketWorkspace';

type Filter = 'all' | 'you' | 'insurers' | 'rm' | 'system';

const MATCH: Record<Filter, (a: AuditEventView, me?: string) => boolean> = {
  all: () => true,
  you: (a) => a.actorType === 'PM' || a.actorType === 'Head',
  insurers: (a) => a.actorType === 'Insurer',
  rm: (a) => a.actorType === 'RM' || a.actorType === 'BimaSetu',
  system: (a) => a.actorType === 'System' || a.actorType === 'Copycat',
};

/** Audit Trail (UI-SPEC 3.3.10, PLAN 3.7): append-only, newest first, filters by actor; the actor is the one recorded (not the viewer). */
export function AuditTab({ ticket: t }: TabProps) {
  const { data: rows = [], isLoading } = useTicketSub<AuditEventView[]>(t.id, 'audit');
  const [filter, setFilter] = useState<Filter>('all');
  const shown = rows.filter((a) => MATCH[filter](a));
  return (
    <div>
      <TabHeader
        title="Audit Trail"
        meta={
          <FilterPills<Filter>
            value={filter}
            onChange={setFilter}
            items={[
              { key: 'all', label: 'All' },
              { key: 'you', label: 'Placement' },
              { key: 'insurers', label: 'Insurers' },
              { key: 'rm', label: 'RM' },
              { key: 'system', label: 'System' },
            ]}
          />
        }
      />
      {isLoading && <div className="text-dense text-ink-2">Loading…</div>}
      {!isLoading && !shown.length && <div className="text-dense text-ink-2">Nothing logged yet.</div>}
      <ol>
        {shown.map((a) => (
          <li key={a.id} className="flex items-start gap-3 py-3 [&+li]:border-t [&+li]:border-line-soft">
            <span className="bk-mark mt-1.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{a.event}</span>
              {a.detail && <span className="block text-meta font-medium text-ink-3">{a.detail}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-meta text-ink-2">
              {a.actorType === 'Insurer' ? (
                <ShieldPlus size={16} className="text-brand" />
              ) : (
                <Avatar
                  name={a.actorName}
                  size={20}
                  tone={
                    a.actorType === 'RM'
                      ? 'blue'
                      : a.actorType === 'System' || a.actorType === 'Copycat'
                        ? 'neutral'
                        : 'purple'
                  }
                />
              )}
              {a.actorName} · <span className="num font-mono">{fmtWhen(a.at)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
