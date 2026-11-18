import clsx from 'clsx';
import { ArrowRight, FileText, Info } from 'lucide-react';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type {
  DeskCounts,
  ProgressRange,
  ProgressView,
  TaskView,
  TicketListItem,
} from '@bimaplacement/contracts';
import { Avatar, Button, Modal, StatusPill } from '@/design-system/components';
import { deskTint, indicator, ink, party, type Ind } from '@/design-system/tokens';
import { useDeskCounts, useEscalated, useMe } from '@/api/hooks';
import { api } from '@/lib/api-client';
import { fmtWhen, stripCompanySuffix } from '@/lib/format';
import { NewDemoTicket } from '@/dev/JourneySim';

type Scope = 'me' | 'team';

const DESK: Array<{ key: keyof DeskCounts; label: string; ind: Ind; tint: string }> = [
  { key: 'insurerResponse', label: 'Insurer Response', ind: 'caution', tint: deskTint.insurer },
  { key: 'rmResponse', label: 'RM Response', ind: 'info', tint: deskTint.rm },
  { key: 'quotesToReview', label: 'Quotes to Review', ind: 'success', tint: deskTint.quotes },
  { key: 'dueToday', label: 'Due Today', ind: 'caution', tint: deskTint.dueToday },
  { key: 'overdue', label: 'Overdue', ind: 'error', tint: deskTint.overdue },
];

const BD = 540;
/** "N Days over" / "N Hrs. over" / "N Mins. over" in business time (Escalated to You). */
function overBy(mins: number) {
  const m = Math.abs(mins);
  if (m >= BD) return `${Math.floor(m / BD)} Day${m >= 2 * BD ? 's' : ''} over`;
  if (m >= 60) return `${Math.floor(m / 60)} Hrs. over`;
  return `${m} Mins. over`;
}

/**
 * Home (UI-SPEC 3.1, PLAN 1.5): greeting + Me / Team (Head, FR-209), five desk cards deep-linking to the
 * filtered queue (FR-226), Escalated to You (Head, team), and the live "Last Week" progress: Tickets On
 * Track, Median SLA Used and the Ticket Time Distribution donut for Last Week / Month / Quarter / Custom
 * (GET /reports/progress, from the ticket clock history).
 */
export function HomePage() {
  const { me, isHead } = useMe();
  const [scope, setScope] = useState<Scope>('team');
  const effective: Scope = isHead ? scope : 'me';
  const desk = useDeskCounts(effective);
  const escalated = useEscalated(isHead && effective === 'team');
  const team = effective === 'team';
  const first = me?.name.split(' ')[0] ?? '';

  return (
    <div className="space-y-6 px-6 py-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {me && <Avatar name={me.name} src={me.avatarUrl} size={40} />}
            <div>
              <div className="text-xs font-medium text-greet">
                {new Date().toLocaleString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </div>
              <h1 className="text-[26px] font-semibold tracking-[-0.6px] text-brand">નમસ્તે, {first}</h1>
            </div>
          </div>
          {isHead && <ScopeSwitch value={scope} onChange={setScope} />}
        </div>
        <div className="bk-rule mt-4" aria-hidden />
        <NewDemoTicket />
      </div>

      <section>
        <h2 className="mb-3 text-2xl font-semibold text-brand">{team ? "Your Team's Desk" : 'Your Desk'}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {DESK.map((d, i) => {
            const n = desk.data?.[d.key];
            return (
              <Link
                key={d.key}
                to={`/tickets?desk=${d.key}${isHead ? `&scope=${effective}` : ''}`}
                className="animate-item rounded-xl border-[0.5px] border-line-subtle p-3 hover:border-brand-line hover:shadow-glow"
                style={{
                  background: `linear-gradient(59.34deg, #fff 49.85%, ${d.tint})`,
                  animationDelay: `${0.1 + i * 0.06}s`,
                }}
              >
                <div className="num text-lg font-semibold">
                  {n === undefined ? '-' : `${n} Ticket${n === 1 ? '' : 's'} in`}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <StatusPill ind={d.ind}>{d.label}</StatusPill>
                  <span className="rounded-[10px] border-[0.5px] border-line-subtle bg-white p-1.5">
                    <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <TasksSection />

      {isHead && team && (
        <section className="border-t border-line-soft pt-6">
          <h2 className="mb-3 text-2xl font-semibold text-brand">Escalated to You</h2>
          <EscalatedTable rows={escalated.data ?? []} loading={escalated.isLoading} />
          <p className="mt-3 text-meta text-ink-2">
            Escalation fires when a Placement-owned SLA has run out. External waits on the insurer or the RM
            don&apos;t count against the desk; the ticket comes to you after the reminder ladder.
          </p>
        </section>
      )}

      <section className="border-t border-line-soft pt-6">
        <Progress scope={effective} team={team} />
      </section>
    </div>
  );
}

/** Your Tasks (FR-250 revision rounds; the prototype's Inbox): open work items, hidden when there are none. */
function TasksSection() {
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', 'open'],
    queryFn: () => api<TaskView[]>('/me/tasks'),
  });
  if (!tasks.length) return null;
  return (
    <section className="border-t border-line-soft pt-6">
      <h2 className="mb-3 text-2xl font-semibold text-brand">Your Tasks</h2>
      <div className="overflow-hidden rounded-xl border-[0.5px] border-line-subtle">
        {tasks.map((task) => (
          <Link
            key={task.id}
            to={task.link}
            className="flex items-center gap-3 border-b border-line-soft px-3 py-3 last:border-0 hover:bg-placement-bg"
          >
            <span className="text-[13px] font-bold">{task.ticketNo}</span>
            <span className="truncate text-dense text-ink-2">{stripCompanySuffix(task.businessName)}</span>
            <span className="min-w-0 flex-1 truncate text-dense font-medium">{task.label}</span>
            <span className="num text-meta text-ink-3">{fmtWhen(task.createdAt)}</span>
            <ArrowRight size={14} className="text-ink-2" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function ScopeSwitch({ value, onChange }: { value: Scope; onChange: (s: Scope) => void }) {
  return (
    <div className="flex rounded-full border-[0.5px] border-line-subtle bg-canvas p-1">
      {(['me', 'team'] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={clsx(
            'rounded-full px-4 py-1.5 text-sm font-medium',
            value === s ? 'bg-white text-brand shadow-shell' : 'text-greet',
          )}
        >
          {s === 'me' ? 'Me' : 'Team'}
        </button>
      ))}
    </div>
  );
}

function EscalatedTable({ rows, loading }: { rows: TicketListItem[]; loading: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border-[0.5px] border-line-subtle">
      <div className="grid grid-cols-[minmax(240px,1fr)_160px_140px_120px] gap-3 bg-canvas px-3 py-2 text-xs font-semibold text-ink-2">
        <span>Ticket</span>
        <span>Owner</span>
        <span>Owed by</span>
        <span className="text-right">SLA breached</span>
      </div>
      {loading && <div className="px-3 py-4 text-dense text-ink-2">Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="px-3 py-4 text-dense text-ink-2">Nothing escalated to you right now.</div>
      )}
      {rows.map((t) => (
        <Link
          key={t.id}
          to={`/tickets/${t.ticketNo}`}
          className="grid grid-cols-[minmax(240px,1fr)_160px_140px_120px] items-center gap-3 border-t border-line-soft px-3 py-3 hover:bg-placement-bg"
        >
          <span>
            <span className="flex items-center gap-2 text-[13px] font-bold">
              {t.ticketNo}{' '}
              <StatusPill ind="error" variant="outline">
                Escalated
              </StatusPill>
            </span>
            <span className="text-meta text-ink-2">
              {t.sla.slaId} · {stripCompanySuffix(t.businessName)}
            </span>
          </span>
          <span className="text-dense font-semibold">{t.owner.name}</span>
          <span>
            <StatusPill ind="brand" variant="outline">
              Placement
            </StatusPill>
          </span>
          <span className="num text-right text-dense font-semibold text-sem-error">
            {t.sla.remainingMins !== null ? overBy(t.sla.remainingMins) : '-'}
          </span>
        </Link>
      ))}
    </div>
  );
}

const RANGES: Array<{ key: ProgressRange; label: string }> = [
  { key: 'week', label: 'Last Week' },
  { key: 'month', label: 'Last Month' },
  { key: 'quarter', label: 'Last Quarter' },
  { key: 'custom', label: 'Custom' },
];
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "Your Progress" (UI-SPEC 3.1): range pills + Tickets On Track, Median SLA Used and the time donut, all from GET /reports/progress. */
function Progress({ scope, team }: { scope: Scope; team: boolean }) {
  const [range, setRange] = useState<ProgressRange>('week');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const params = new URLSearchParams({ scope, range, ...(range === 'custom' && custom ? custom : {}) });
  const { data: p, isLoading } = useQuery({
    enabled: range !== 'custom' || !!custom,
    queryKey: ['progress', params.toString()],
    queryFn: () => api<ProgressView>(`/reports/progress?${params}`),
    placeholderData: keepPreviousData,
  });
  const used = p?.medianSlaUsed ?? null;
  const total = p?.ticketsOnTrack.total ?? 0;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-brand">
          {team ? "Your Team's Progress" : 'Your Progress'}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {range === 'custom' && p && (
            <span className="text-meta text-ink-2">
              {fmtDay(p.from)} to {fmtDay(new Date(new Date(p.to).getTime() - 1).toISOString())}
            </span>
          )}
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => (r.key === 'custom' ? setPicking(true) : setRange(r.key))}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full border-[0.5px] px-3 py-2 text-base font-medium',
                range === r.key
                  ? 'border-brand bg-brand text-white'
                  : 'border-line-subtle bg-white text-ink-2 hover:border-brand',
              )}
            >
              {range === r.key && <span className="h-2 w-2 rounded-full bg-white" />} {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3">
          <MetricCard
            title="Tickets On Track"
            value={isLoading || !p ? '-' : `${p.ticketsOnTrack.onTrack}/${total}`}
            score={p && total ? p.ticketsOnTrack.onTrack / total : null}
            info="Tickets with a clock running in this period whose Placement-owned clocks stayed within target."
          />
          <MetricCard
            title="Median SLA Used"
            value={used === null ? '-' : `${Math.round(used * 100)}%`}
            score={used === null ? null : Math.max(0, 1 - used)}
            info="Median share of the target used on Placement-owned clocks in this period (business time). Lower is better."
            trend={p?.trend}
          />
        </div>
        <div className="rounded-xl border-[0.5px] border-line-subtle bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between text-dense text-ink-2">
            <span className="flex items-center gap-1.5">
              <FileText size={14} /> Ticket Time Distribution
            </span>
            <span title="Business hours in this period, by who held each ticket's clock. Waiting on the insurer or the RM is not Placement time.">
              <Info size={14} className="text-placement" />
            </span>
          </div>
          <div className="mt-1 text-lg font-semibold">{total} Tickets</div>
          <Donut
            parts={[
              { label: 'Placement', hours: p?.hours.placement ?? 0, color: party.placement, ind: 'brand' },
              { label: 'Insurer', hours: p?.hours.insurer ?? 0, color: party.insurer, ind: 'caution' },
              { label: 'RM / Client', hours: p?.hours.rmClient ?? 0, color: party.rmClient, ind: 'info' },
            ]}
          />
        </div>
      </div>
      {picking && (
        <CustomRangeModal
          initial={custom}
          onClose={() => setPicking(false)}
          onApply={(r) => {
            setCustom(r);
            setRange('custom');
            setPicking(false);
          }}
        />
      )}
    </>
  );
}

/** CustomRangeModal: a month range, from the first day of the start month to the end of the end month. */
function CustomRangeModal({
  initial,
  onClose,
  onApply,
}: {
  initial: { from: string; to: string } | null;
  onClose: () => void;
  onApply: (r: { from: string; to: string }) => void;
}) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonthOf = (exclusiveEnd: string) =>
    new Date(new Date(exclusiveEnd).getTime() - 86_400_000).toISOString().slice(0, 7);
  const [fromM, setFromM] = useState(initial?.from.slice(0, 7) ?? thisMonth);
  const [toM, setToM] = useState(initial ? lastMonthOf(initial.to) : thisMonth);
  const valid = !!fromM && !!toM && fromM <= toM;
  const apply = () => {
    const [y, m] = toM.split('-').map(Number);
    onApply({ from: `${fromM}-01`, to: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) }); // exclusive end: first day after the end month
  };
  const input = 'focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2 text-dense';
  return (
    <Modal
      title="Custom range"
      subtitle="Pick the months to report on"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-xs font-semibold text-ink-2">
          From
          <input
            type="month"
            className={input}
            value={fromM}
            max={thisMonth}
            onChange={(e) => setFromM(e.target.value)}
          />
        </label>
        <label className="block text-xs font-semibold text-ink-2">
          To
          <input
            type="month"
            className={input}
            value={toM}
            max={thisMonth}
            onChange={(e) => setToM(e.target.value)}
          />
        </label>
      </div>
      {!valid && (
        <div className="mt-2 text-meta text-t-red">The start month must be on or before the end month.</div>
      )}
    </Modal>
  );
}

function MetricCard({
  title,
  value,
  score,
  info,
  trend,
}: {
  title: string;
  value: string;
  score: number | null;
  info: string;
  trend?: Array<number | null>;
}) {
  const filled = score === null ? 0 : Math.round(Math.min(1, Math.max(0, score)) * 20);
  return (
    <div className="rounded-xl border-[0.5px] border-line-subtle bg-white p-4">
      <div className="flex items-center justify-between text-dense text-ink-2">
        <span className="flex items-center gap-1.5">
          <FileText size={14} /> {title}
        </span>
        <span title={info}>
          <Info size={14} className="text-placement" />
        </span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="num text-2xl font-semibold">{value}</div>
        {trend && <Spark points={trend} />}
      </div>
      <div className="mt-4 text-sm font-medium">Performance</div>
      <div className="mt-2 flex gap-1" aria-label={`${filled} of 20`}>
        {Array.from({ length: 20 }, (_, i) => (
          <span key={i} className={clsx('h-8 flex-1 rounded-sm', i < filled ? 'bg-brand' : 'bg-canvas')} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-meta text-ink-2">
        <span>Poor</span>
        <span>Well Done</span>
      </div>
    </div>
  );
}

/** Spark: SLA used across the range (oldest left), capped at 200%; gaps where no Placement-owned clock ran. Dashed line = 100% of target. */
function Spark({ points }: { points: Array<number | null> }) {
  const w = 120;
  const h = 32;
  const CAP = 2; // anything past 200% of target reads as "well over"; keeps one stuck ticket from flattening the line
  const vals = points.filter((v): v is number => v !== null).map((v) => Math.min(v, CAP));
  if (vals.length < 2) return null;
  const max = Math.max(1, ...vals);
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - 2 - (Math.min(v, CAP) / max) * (h - 4);
  const segments: string[][] = [];
  points.forEach((v, i) => {
    if (v === null) return void segments.push([]);
    (segments.at(-1) ?? segments[segments.push([]) - 1]).push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="SLA used over the period">
      <line x1="0" x2={w} y1={y(1)} y2={y(1)} stroke={ink.line} strokeDasharray="3 3" />
      {segments
        .filter((s) => s.length)
        .map((s, i) =>
          s.length === 1 ? (
            <circle
              key={i}
              cx={s[0].split(',')[0]}
              cy={s[0].split(',')[1]}
              r="2"
              fill={indicator.brand.dot}
            />
          ) : (
            <polyline
              key={i}
              points={s.join(' ')}
              fill="none"
              stroke={indicator.brand.dot}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          ),
        )}
    </svg>
  );
}

function Donut({ parts }: { parts: Array<{ label: string; hours: number; color: string; ind: Ind }> }) {
  const shown = parts.filter((p) => p.hours >= 0.25); // segments under a quarter hour are hidden
  const total = shown.reduce((n, p) => n + p.hours, 0);
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-10">
      <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="Ticket time distribution">
        <circle cx="100" cy="100" r={r} fill="none" stroke={ink.canvas} strokeWidth="44" />
        {total > 0 &&
          shown.map((p) => {
            const len = (p.hours / total) * c;
            const el = (
              <circle
                key={p.label}
                cx="100"
                cy="100"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="44"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 100 100)"
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="space-y-3">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-3">
            <StatusPill ind={p.ind}>{p.label}</StatusPill>
            <span className="num text-dense font-semibold">{Math.round(p.hours)} Hrs.</span>
          </div>
        ))}
      </div>
    </div>
  );
}
