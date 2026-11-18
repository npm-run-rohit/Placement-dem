import { OutcomeType, type TicketDetail } from '@bimaplacement/contracts';
import { StatusPill } from '@/design-system/components';
import type { Ind } from '@/design-system/tokens';
import { fmtInr, fmtWhen } from '@/lib/format';

const OUTCOME: Record<OutcomeType, { label: string; ind: Ind }> = {
  [OutcomeType.QUOTE_SELECTED]: { label: 'Quote selected', ind: 'success' },
  [OutcomeType.LOST]: { label: 'Lost', ind: 'error' },
  [OutcomeType.NO_APPETITE]: { label: 'No appetite', ind: 'neutral' },
};

/** Rail outcome card for closed tickets (UI-SPEC 3.3.1 #6). */
export function OutcomeCard({ ticket: t }: { ticket: TicketDetail }) {
  const d = t.outcomeDetail;
  if (!t.outcome || !d) return null;
  const o = OUTCOME[t.outcome];
  const rows: Array<[string, string | null]> = [
    ['Selected insurer', d.insurerName],
    ['Premium', d.premium !== null ? fmtInr(d.premium) : null],
    ['QCR version', d.qcrVersion !== null ? `QCR V${d.qcrVersion}` : null],
    ['Recorded by', d.source === 'bimasetu' ? `${d.decidedBy} · BimaSetu` : d.decidedBy],
    ['Decision date', d.closedAt ? fmtWhen(d.closedAt) : null],
  ];
  return (
    <div className="rounded-xl border border-line-subtle bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2">Outcome</span>
        <StatusPill ind={o.ind}>{o.label}</StatusPill>
      </div>
      <dl className="mt-2 space-y-1.5 text-meta">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-ink-2">{k}</dt>
              <dd className="num text-right font-medium text-ink">{v}</dd>
            </div>
          ))}
      </dl>
      {d.reason && <p className="mt-2 text-meta text-ink-2">{d.reason}</p>}
    </div>
  );
}
