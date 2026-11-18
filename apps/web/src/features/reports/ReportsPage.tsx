import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import type { ReportsView } from '@bimaplacement/contracts';
import { Callout, SectionCard } from '@/design-system/components';
import { PageHead } from '@/shell/PageHead';
import { Bar, Metrics } from './parts';
import { TeamSection } from './TeamSection';
import { api } from '@/lib/api-client';

/** Reports (UI-SPEC 3.6, PRD 9.4/9.5, FR-255): aggregates from GET /reports over the tickets in the viewer's scope. */
export function ReportsPage() {
  const { data: r, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: () => api<ReportsView>('/reports'),
    refetchInterval: 60_000,
  });
  return (
    <div className="px-6 py-6">
      <PageHead
        title="Reports"
        hint={
          r?.scope === 'team'
            ? 'Every Placement ticket, live from the workbench.'
            : 'Tickets you can see, live from the workbench.'
        }
      />
      {isLoading || !r ? (
        <div className="text-dense text-ink-2">Loading…</div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="grid gap-3.5 lg:grid-cols-2">
            <SectionCard title="Placement pipeline">
              <Metrics
                items={[
                  ['Active', r.pipeline.active],
                  ['Closed', r.pipeline.closed],
                  ['Quote selected', r.pipeline.quoteSelected, 'text-t-green'],
                  ['Lost', r.pipeline.lost],
                  ['No appetite', r.pipeline.noAppetite],
                ]}
              />
              {r.pipeline.byStage.map((s) => (
                <Bar
                  key={s.stage}
                  label={s.label}
                  n={s.n}
                  max={Math.max(1, ...r.pipeline.byStage.map((x) => x.n))}
                />
              ))}
            </SectionCard>
            <SectionCard title="SLA">
              <Metrics
                items={[
                  ['Within SLA', r.sla.within, 'text-t-green'],
                  ['Breached', r.sla.breached, 'text-t-red'],
                  ['Under an hour left', r.sla.underAnHour, 'text-t-orange'],
                ]}
              />
              <div className="text-meta font-semibold text-ink-2">Breaches by stage</div>
              <div className="mt-1.5">
                {r.sla.breachesByStage.map((s) => (
                  <Bar
                    key={s.stage}
                    label={s.label}
                    n={s.n}
                    max={Math.max(1, ...r.sla.breachesByStage.map((x) => x.n))}
                    tone="red"
                  />
                ))}
                {!r.sla.breachesByStage.length && (
                  <div className="text-meta text-ink-3">No Placement-owned breaches right now.</div>
                )}
              </div>
              <div className="mt-3">
                <Callout tone="blue">
                  Time spent waiting on RM, client or insurer is excluded - those clocks have their own
                  owners.
                </Callout>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Placement funnel">
            {r.funnel.map((f) => (
              <Bar
                key={f.step}
                label={f.step}
                title={f.definition}
                n={f.n}
                max={Math.max(1, r.funnel[0]?.n ?? 0)}
                labelWidth={220}
              />
            ))}
          </SectionCard>

          {r.team && <TeamSection team={r.team} />}

          <div className="overflow-hidden rounded-2xl border border-line-subtle bg-white">
            <div className="border-b border-line-soft px-3.5 py-3 text-[13px] font-semibold">
              Insurer outcomes
            </div>
            <table className="w-full text-left">
              <thead className="bg-card-alt text-meta font-semibold text-ink-2">
                <tr>
                  {['Insurer', 'Approached', 'Responded', 'Quoted', 'Declined'].map((h) => (
                    <th key={h} className="px-3.5 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.insurerOutcomes.map((o) => (
                  <tr key={o.insurerId} className="border-t border-line-soft text-dense">
                    <td className="px-3.5 py-2.5 font-medium text-ink">{o.insurer}</td>
                    <td className="num px-3.5 py-2.5 font-mono">{o.approached}</td>
                    <td className="num px-3.5 py-2.5 font-mono">{o.responded}</td>
                    <td className="num px-3.5 py-2.5 font-mono text-t-green">{o.quoted}</td>
                    <td
                      className={clsx(
                        'num px-3.5 py-2.5 font-mono',
                        o.declined ? 'text-t-red' : 'text-ink-3',
                      )}
                    >
                      {o.declined}
                    </td>
                  </tr>
                ))}
                {!r.insurerOutcomes.length && (
                  <tr>
                    <td colSpan={5} className="px-3.5 py-4 text-center text-meta text-ink-3">
                      No insurer has been approached yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
