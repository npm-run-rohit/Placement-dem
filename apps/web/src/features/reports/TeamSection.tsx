import { Link } from 'react-router-dom';
import { PRODUCT_TYPES_SEED, type TeamDashboard, type WaitAgeing } from '@bimaplacement/contracts';
import { SectionCard } from '@/design-system/components';
import { Bar, Metrics } from './parts';

const CHANNEL: Record<string, string> = { manual: 'Manual ticket', bimasetu: 'BimaSetu float' };
const productLabel = (code: string) => PRODUCT_TYPES_SEED.find((p) => p.code === code)?.label ?? code;
const bd = (n: number | null) => (n === null ? '-' : `${n} BD`);
const TOP = 6;

/** Placement Head dashboard (PRD 9.2): who carries what, where tickets wait, and what comes in. */
export function TeamSection({ team }: { team: TeamDashboard }) {
  const ageMax = Math.max(1, ...team.ageing.map((a) => a.n));
  return (
    <>
      <div className="mt-2 text-xl font-semibold text-brand">Team</div>
      <SectionCard title="At a glance">
        <Metrics
          items={[
            ['Escalated to you', team.escalatedToHead, team.escalatedToHead ? 'text-t-red' : undefined],
            ['High urgency open', team.highUrgency, team.highUrgency ? 'text-t-orange' : undefined],
            [
              'No appetite rate',
              team.noAppetiteRate === null ? '-' : `${Math.round(team.noAppetiteRate * 100)}%`,
            ],
            ['Reassigned, last 30 days', team.reassignmentsLast30Days],
          ]}
        />
        <div className="text-meta text-ink-3">
          No appetite rate is the share of closed tickets that closed No appetite
          {team.noAppetiteRate === null ? '; nothing has closed yet' : ''}.
        </div>
      </SectionCard>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-line-subtle bg-white">
          <div className="border-b border-line-soft px-3.5 py-3 text-[13px] font-semibold">
            Workload by owner
          </div>
          <table className="w-full text-left">
            <thead className="bg-card-alt text-meta font-semibold text-ink-2">
              <tr>
                {['Owner', 'Open', 'Breached', 'Under an hour', 'Escalated'].map((h) => (
                  <th key={h} className="px-3.5 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.workload.map((w) => (
                <tr key={w.ownerId} className="border-t border-line-soft text-dense">
                  <td className="px-3.5 py-2.5 font-medium text-ink">{w.name}</td>
                  <td className="num px-3.5 py-2.5 font-mono">{w.open}</td>
                  <td className={`num px-3.5 py-2.5 font-mono ${w.breached ? 'text-t-red' : 'text-ink-3'}`}>
                    {w.breached}
                  </td>
                  <td
                    className={`num px-3.5 py-2.5 font-mono ${w.underAnHour ? 'text-t-orange' : 'text-ink-3'}`}
                  >
                    {w.underAnHour}
                  </td>
                  <td className={`num px-3.5 py-2.5 font-mono ${w.escalated ? 'text-t-red' : 'text-ink-3'}`}>
                    {w.escalated}
                  </td>
                </tr>
              ))}
              {!team.workload.length && (
                <tr>
                  <td colSpan={5} className="px-3.5 py-4 text-center text-meta text-ink-3">
                    No open tickets.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <SectionCard title="Ageing of open tickets">
          {team.ageing.map((a) => (
            <Bar key={a.bucket} label={a.bucket} n={a.n} max={ageMax} labelWidth={180} />
          ))}
          <div className="mt-2 text-meta text-ink-3">Business days since the ticket was received.</div>
        </SectionCard>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-3">
        <WaitCard title="Waiting on the RM" w={team.awaitingRm} hint="Since the query went to the RM" />
        <WaitCard
          title="Quote collection"
          w={team.quoteCollection}
          hint="Since the RFQ was sent to insurers"
        />
        <WaitCard
          title="QCR waiting for release"
          w={team.qcrRelease}
          hint="Since the draft QCR was created"
        />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <MixCard title="Business type" rows={team.mix.businessType} />
        <MixCard title="Intake" rows={team.mix.channel} label={(k) => CHANNEL[k] ?? k} />
        <MixCard title="Product" rows={team.mix.product} label={productLabel} other="All other products" />
        <MixCard title="Industry" rows={team.mix.industry} other="All other industries" />
      </div>
    </>
  );
}

function WaitCard({ title, w, hint }: { title: string; w: WaitAgeing; hint: string }) {
  return (
    <SectionCard title={title}>
      <Metrics
        items={[
          ['Tickets', w.count],
          ['Median', bd(w.medianBusinessDays)],
          ['Oldest', bd(w.oldestBusinessDays)],
        ]}
      />
      <div className="text-meta text-ink-3">
        {hint}, in business days (BD).
        {w.oldestTicketNo && (
          <>
            {' '}
            Oldest:{' '}
            <Link
              to={`/tickets/${w.oldestTicketNo}`}
              className="font-semibold text-placement hover:underline"
            >
              {w.oldestTicketNo}
            </Link>
          </>
        )}
      </div>
    </SectionCard>
  );
}

function MixCard({
  title,
  rows,
  label = (k) => k,
  other = 'All other',
}: {
  title: string;
  rows: Array<{ key: string; n: number }>;
  label?: (key: string) => string;
  other?: string;
}) {
  const top = rows.slice(0, TOP);
  const rest = rows.slice(TOP).reduce((n, r) => n + r.n, 0);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <SectionCard title={title}>
      {top.map((r) => (
        <Bar key={r.key} label={label(r.key)} n={r.n} max={max} labelWidth={200} />
      ))}
      {rest > 0 && <Bar label={other} n={rest} max={max} labelWidth={200} />}
      {!rows.length && <div className="text-meta text-ink-3">No tickets yet.</div>}
    </SectionCard>
  );
}
