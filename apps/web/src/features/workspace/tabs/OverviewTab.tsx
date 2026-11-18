import clsx from 'clsx';
import { CheckCircle2, ChevronDown, ListChecks, X } from 'lucide-react';
import { useState } from 'react';
import { PHASES, STAGE_META, Stage, type SlaId } from '@bimaplacement/contracts';
import { PhaseBar, StatusPill } from '@/design-system/components';
import { useMasters, useTicketSub } from '@/api/hooks';
import { TabHeader } from './TabHeader';
import type { TabProps } from '../TicketWorkspace';

type Actor = 'BimaKavach' | 'Insurer' | 'RM' | 'System';
/** PL_WORKFLOW_ROWS (UI-SPEC 6.3): one row per touchpoint; targets read from the SLA master. */
const ROWS: Array<{ key: string; label: string; step: number; actor: Actor; sla?: SlaId; fixed?: number }> = [
  { key: 'created', label: 'Ticket created', step: -1, actor: 'System', fixed: 5 },
  { key: 'rfq', label: 'RFQ under verification', step: 0, actor: 'BimaKavach', sla: 'SLA-02' as SlaId },
  { key: 'insurers', label: 'Insurers selected', step: 1, actor: 'BimaKavach', sla: 'SLA-04' as SlaId },
  { key: 'market', label: 'RFQ sent to insurers', step: 2, actor: 'Insurer', sla: 'SLA-06' as SlaId },
  { key: 'quotes', label: 'Quotes reviewed', step: 3, actor: 'BimaKavach', sla: 'SLA-10' as SlaId },
  { key: 'qcr', label: 'QCR released to RM', step: 4, actor: 'BimaKavach', sla: 'SLA-12' as SlaId },
  { key: 'decision', label: 'RM decision', step: 5, actor: 'RM', sla: 'SLA-14' as SlaId },
  { key: 'closed', label: 'Ticket closed', step: 6, actor: 'System', fixed: 15 },
];

/** plWorkflowTarget: < 60 -> Min; < 540 -> BH; else WD. */
function target(mins: number) {
  if (mins < 60) return `${mins} Min`;
  if (mins < 540) return `${Math.round(mins / 60)} BH`;
  return `${Math.round((mins / 540) * 10) / 10} WD`;
}

const ACTOR_MARK: Record<Actor, string> = {
  BimaKavach: 'bg-brand-50 text-brand',
  Insurer: 'bg-t-purple-soft text-t-purple',
  RM: 'bg-t-blue-soft text-t-blue',
  System: 'bg-canvas text-ink-2',
};

/** Overview (UI-SPEC 3.3.2, PLAN 3.7): phase bar (red while an internal clock is breached) + collapsible workflow stages. */
export function OverviewTab({ ticket: t }: TabProps) {
  const [open, setOpen] = useState(true);
  const masters = useMasters();
  const { data: threads = [] } = useTicketSub<Array<{ targetMins: number; rfqVersion: number }>>(
    t.id,
    'threads',
  );
  const sla = (masters.data?.sla as Array<{ id: string; targetMins: number }> | undefined) ?? [];
  const meta = STAGE_META[t.stage];
  const currentStep = t.outcome ? 6 : meta.step;
  const phase = t.outcome ? PHASES.length - 1 : PHASES.indexOf(meta.phase);
  const age = Math.max(0, Math.floor((Date.now() - Date.parse(t.receivedAt)) / 86_400_000));
  const threadTarget = threads.find((x) => x.rfqVersion === t.activeRfqVersion)?.targetMins;
  const mins = (r: (typeof ROWS)[number]) =>
    r.fixed ??
    (r.sla === 'SLA-06' && threadTarget ? threadTarget : (sla.find((s) => s.id === r.sla)?.targetMins ?? 0));

  return (
    <div className="space-y-4">
      <TabHeader
        title="Ticket Workflow"
        meta={
          <>
            Ticket Age:{' '}
            <b className="num text-ink">
              {age} Day{age === 1 ? '' : 's'}
            </b>
          </>
        }
      />
      <PhaseBar current={phase} breached={t.sla.breached} />
      <div className="rounded-2xl border border-line-subtle bg-white">
        <button
          className="flex w-full items-center justify-between px-4 py-3"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks size={16} className="text-accent" /> Workflow Stages{' '}
            <StatusPill ind="neutral">{ROWS.length} stages</StatusPill>
          </span>
          {open ? <X size={14} className="text-ink-2" /> : <ChevronDown size={14} className="text-ink-2" />}
        </button>
        {open && (
          <ol className="space-y-2 px-4 pb-4">
            {ROWS.map((r, i) => {
              const state =
                r.step < currentStep || (r.step === currentStep && t.stage === Stage.CLOSED)
                  ? 'done'
                  : r.step === currentStep
                    ? 'now'
                    : 'next';
              return (
                <li key={r.key} className="flex items-stretch gap-3">
                  <span className="flex flex-col items-center">
                    <span
                      className={clsx(
                        'flex h-[26px] w-[26px] items-center justify-center rounded-lg',
                        state === 'done'
                          ? 'bg-brand-50 text-brand'
                          : state === 'now'
                            ? 'bg-brand-50'
                            : 'bg-canvas',
                      )}
                    >
                      {state === 'done' ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <span
                          className={clsx('h-2 w-2 rounded-full', state === 'now' ? 'bg-brand' : 'bg-line')}
                        />
                      )}
                    </span>
                    {i < ROWS.length - 1 && (
                      <span className="mt-1 w-px flex-1 border-l border-dashed border-line" />
                    )}
                  </span>
                  <span
                    className={clsx(
                      'flex flex-1 items-center justify-between rounded-xl border px-3 py-2.5 text-dense',
                      state === 'done' && 'border-line-subtle bg-card-sunk text-ink-2 line-through',
                      state === 'now' && 'border-brand-line bg-brand-50 font-semibold text-ink',
                      state === 'next' && 'border-line-subtle bg-white',
                    )}
                  >
                    {r.label}
                    <span className="flex items-center gap-3 no-underline">
                      <span
                        className={clsx(
                          'rounded-md px-1.5 py-0.5 text-2xs font-semibold no-underline',
                          ACTOR_MARK[r.actor],
                        )}
                      >
                        {r.actor === 'BimaKavach' && t.createdBy.name !== 'BimaSetu' && r.key === 'created'
                          ? 'BimaKavach'
                          : r.actor}
                      </span>
                      {state === 'now' && <span className="text-[11px] font-semibold text-brand">LIVE</span>}
                      <span className="num w-14 text-right text-meta text-ink-3">{target(mins(r))}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <p className="text-meta text-ink-3">
        BH = business hours, WD = working days (Mon-Fri 10:00-19:00 IST, holidays excluded), Min = minutes.
        Targets come from the Placement SLA master; insurer quote collection uses this ticket&apos;s line,
        risk tier and business type.
      </p>
    </div>
  );
}
