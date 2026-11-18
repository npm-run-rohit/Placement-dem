import { ArrowRight } from 'lucide-react';
import type { NextActionView } from '@bimaplacement/contracts';
import { Button } from '@/design-system/components';
import { tone as tones } from '@/design-system/tokens';

/** Rail "Next action" (UI-SPEC 3.3.1 #2): tone-tinted card with the action and "Go there". */
export function NextActionCard({ action, onGo }: { action: NextActionView; onGo: () => void }) {
  const c = tones[action.tone];
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: c.line, background: c.bg }}>
      <div className="text-[10.5px] font-semibold tracking-[0.4px] text-ink-2">Next action</div>
      <div className="mt-1 text-[13px] font-550 text-ink">{action.label}</div>
      <Button
        variant="primary"
        size="sm"
        full
        className="mt-3"
        iconRight={<ArrowRight size={13} />}
        onClick={onGo}
      >
        Go there
      </Button>
    </div>
  );
}
