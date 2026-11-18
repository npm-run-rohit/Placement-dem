import type { SlaClockView } from '@bimaplacement/contracts';
import { fmtBizMins } from '@/lib/format';

/** PlStageDue -> SlaCountdown: Closed / On hold (external) / over / at risk (<=60m) / left. */
export function SlaCountdown({ sla, closed }: { sla: SlaClockView; closed?: boolean }) {
  if (closed || !sla.slaId) return <span className="text-dense text-ink-3">Closed</span>;
  if (sla.ownerType === 'external') return <span className="text-dense text-ink-2">On hold</span>;
  const r = sla.remainingMins ?? 0;
  if (r < 0)
    return <span className="num text-dense font-semibold text-sem-error">{fmtBizMins(-r)} over</span>;
  return (
    <span className={`num text-dense font-medium ${r <= 60 ? 'text-sem-caution' : 'text-ink'}`}>
      {fmtBizMins(r)} left
    </span>
  );
}
