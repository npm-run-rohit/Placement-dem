import { Clock, ShieldPlus } from 'lucide-react';
import { Stage, type TicketDetail } from '@bimaplacement/contracts';
import { Avatar } from '@/design-system/components';
import { fmtBizMins } from '@/lib/format';
import { ink, placementBg, slaState, tone } from '@/design-system/tokens';

const ATRISK_FRACTION = 0.2; // Threshold Target master: stage timeline turns caution at <= 20% remaining

const STATES = {
  noClock: { bg: tone.neutral.bg, line: tone.neutral.line, fg: tone.neutral.fg, bar: ink.line },
  ok: { bg: slaState.ok.bg, line: slaState.ok.line, fg: slaState.ok.text, bar: slaState.ok.dot },
  atRisk: {
    bg: slaState.atRisk.bg,
    line: slaState.atRisk.line,
    fg: slaState.atRisk.text,
    bar: slaState.atRisk.dot,
  },
  breached: {
    bg: slaState.breached.bg,
    line: slaState.breached.line,
    fg: slaState.breached.text,
    bar: slaState.breached.dot,
  },
  external: { bg: placementBg, line: tone.blue.line, fg: tone.blue.fg, bar: tone.blue.fg },
} as const;

/**
 * PlTicketStageTimeline (UI-SPEC 3.3.1): the single active ticket clock in business time. States: no clock,
 * ok, at risk (<= 20% left), breached (internal only), external (a wait on the insurer / RM, never a breach).
 */
export function StageTimelineCard({ ticket: t }: { ticket: TicketDetail }) {
  const { sla } = t;
  const closed = t.stage === Stage.CLOSED;
  const remaining = sla.remainingMins;
  const target = sla.targetMins ?? 0;
  const state: keyof typeof STATES =
    !sla.slaId || remaining === null
      ? 'noClock'
      : sla.ownerType === 'external'
        ? 'external'
        : remaining < 0
          ? 'breached'
          : target && remaining / target <= ATRISK_FRACTION
            ? 'atRisk'
            : 'ok';
  const c = STATES[state];
  const elapsed = remaining !== null && target ? Math.max(0, target - remaining) : null;
  const left = remaining !== null && target ? Math.max(0, Math.min(1, remaining / target)) : 0;
  const head = closed
    ? 'Clock stopped'
    : !sla.slaId || remaining === null
      ? 'No clock on this stage'
      : remaining < 0
        ? `${fmtBizMins(-remaining)} over`
        : `${fmtBizMins(remaining)} left`;
  const holder =
    sla.ownerType === 'external'
      ? sla.slaId === 'SLA-06'
        ? { name: 'Insurers', icon: <ShieldPlus size={14} className="text-brand" /> }
        : { name: t.rm.name, icon: <Avatar name={t.rm.name} src={t.rm.avatarUrl} size={18} tone="blue" /> }
      : { name: t.owner.name, icon: <Avatar name={t.owner.name} src={t.owner.avatarUrl} size={18} /> };

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: c.line, background: `linear-gradient(180deg, #fff 50%, ${c.bg})` }}
      title={sla.slaId ? `${sla.slaId} - ${fmtBizMins(target)} business time` : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-2">Ticket Stage Timeline</span>
        {!closed && sla.slaId && (
          <span className="flex items-center gap-1 truncate text-meta font-medium text-ink-2">
            {holder.icon}
            {holder.name}
          </span>
        )}
      </div>
      <div
        className="num mt-1 text-lg font-semibold"
        style={{ color: state === 'noClock' ? undefined : c.fg }}
      >
        {head}
      </div>
      {!closed && sla.slaId && remaining !== null && (
        <>
          <div
            className="mt-2 h-[3px] w-full overflow-hidden rounded-full"
            style={{ background: state === 'breached' ? STATES.breached.bar : ink.track }}
          >
            <div className="h-full rounded-full" style={{ width: `${left * 100}%`, background: c.bar }} />
          </div>
          <div className="num mt-2 text-meta text-ink-2">
            {sla.slaId} · {fmtBizMins(target)} target
            {elapsed !== null ? ` • ${fmtBizMins(elapsed)} elapsed` : ''}
          </div>
          <div className="num mt-1 flex items-center gap-1 text-meta text-ink-2">
            <Clock size={12} />{' '}
            {remaining >= 0 ? `Due in ${fmtBizMins(remaining)}` : `Was due ${fmtBizMins(-remaining)} ago`}
            {sla.ownerType === 'external' && ' · a wait, not a breach'}
          </div>
        </>
      )}
    </div>
  );
}
